function updateStatusesFromGmail() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    let detected = 0;
    getProspectSheets().forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      const updated = rows.map(function (row, index) {
        const prospect = rowToObject(row);
        if (!isValidEmail(prospect.email) || normalizeYesNo(prospect.responseReceived) === 'Oui') return row;
        const thread = findReplyThread(prospect);
        if (!thread) return row;
        row[COL.RESPONSE_RECEIVED - 1] = 'Oui';
        row[COL.STATUS - 1] = 'Réponse reçue';
        row[COL.LAST_ACTION_DATE - 1] = new Date();
        row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Réponse potentielle détectée le ' + formatDate(new Date()) + '. Fil Gmail : ' + thread.getId());
        detected += 1;
        writeLog('INFO', 'updateStatusesFromGmail', sheet.getName(), index + 2, 'Réponse potentielle détectée', thread.getId());
        return row;
      });
      if (updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
    });
    refreshDashboard();
    SpreadsheetApp.getActive().toast(detected + ' réponses potentielles détectées.', MDB.APP_NAME, 8);
  } catch (error) {
    writeLog('ERROR', 'updateStatusesFromGmail', '', '', 'Erreur recherche réponses', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function findReplyThread(prospect) {
  try {
    const email = normalizeText(prospect.email).toLowerCase();
    const subject = String(prospect.subject || '').replace(/^\[TEST[^\]]+\]\s*/, '').replace(/^Re:\s*/i, '').replace(/"/g, '');
    const query = 'from:' + email + ' newer_than:180d' + (subject ? ' subject:"' + subject + '"' : '');
    const threads = GmailApp.search(query, 0, 5);
    return threads.length ? threads[0] : null;
  } catch (error) {
    writeLog('WARN', 'findReplyThread', '', '', 'Recherche Gmail impossible', stack(error));
    return null;
  }
}

function syncSentMessagesFromGmail() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const prospectSheets = getProspectSheets();
    const reconciliation = reconcileDeletedGmailDrafts_(prospectSheets);
    let detected = reconciliation.sent;
    prospectSheets.forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      const updated = rows.map(function (row, index) {
        const prospect = rowToObject(row);
        if (
          prospect.status !== 'Brouillon créé' ||
          normalizeYesNo(prospect.draftCreated) !== 'Oui' ||
          !isValidEmail(prospect.email)
        ) return row;
        const sentMessage = findSentMessage(prospect);
        if (!sentMessage) return row;
        const sentAt = sentMessage.getDate() || new Date();
        applySentState(row, sentAt);
        row[COL.NOTES - 1] = appendNote(
          row[COL.NOTES - 1],
          'Envoi Gmail détecté automatiquement le ' + formatDate(new Date()) + '.'
        );
        detected += 1;
        writeLog('INFO', 'syncSentMessagesFromGmail', sheet.getName(), index + 2, 'Envoi Gmail détecté', sentMessage.getId());
        return row;
      });
      if (updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
    });
    refreshDashboard();
    let message = detected + ' envois Gmail synchronisés.';
    if (reconciliation.reset) message += ' ' + reconciliation.reset + ' brouillons supprimés rendus recréables.';
    SpreadsheetApp.getActive().toast(message, MDB.APP_NAME, 8);
    return detected;
  } catch (error) {
    writeLog('ERROR', 'syncSentMessagesFromGmail', '', '', 'Erreur synchronisation des envois', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function reconcileDeletedGmailDrafts_(prospectSheets) {
  const result = { reset: 0, sent: 0 };
  const currentDraftIds = {};
  try {
    GmailApp.getDrafts().forEach(function (draft) {
      currentDraftIds[String(draft.getId())] = true;
    });
  } catch (error) {
    writeLog('WARN', 'reconcileDeletedGmailDrafts_', '', '', 'Lecture des brouillons Gmail impossible', stack(error));
    return result;
  }

  (prospectSheets || getProspectSheets()).forEach(function (sheet) {
    const rows = getProspectRows(sheet);
    let changed = false;
    const updated = rows.map(function (row, index) {
      const prospect = rowToObject(row);
      const draftId = normalizeText(prospect.draftId);
      const trackedAsDraft = prospect.status === 'Brouillon créé' || normalizeYesNo(prospect.draftCreated) === 'Oui';
      if (!trackedAsDraft || !draftId || currentDraftIds[draftId]) return row;

      const sentMessage = isValidEmail(prospect.email) ? findSentMessage(prospect) : null;
      if (sentMessage) {
        applySentState(row, sentMessage.getDate() || new Date());
        row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Envoi Gmail détecté automatiquement le ' + formatDate(new Date()) + '.');
        result.sent += 1;
        writeLog('INFO', 'reconcileDeletedGmailDrafts_', sheet.getName(), index + 2, 'Brouillon disparu car envoyé', sentMessage.getId());
      } else {
        row[COL.DRAFT_CREATED - 1] = 'Non';
        row[COL.DRAFT_ID - 1] = '';
        row[COL.STATUS - 1] = 'Prêt à contacter';
        row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Brouillon Gmail supprimé : prospect remis à Prêt à contacter le ' + formatDate(new Date()) + '.');
        result.reset += 1;
        writeLog('INFO', 'reconcileDeletedGmailDrafts_', sheet.getName(), index + 2, 'Brouillon supprimé rendu recréable', draftId);
      }
      changed = true;
      return row;
    });
    if (changed && updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
  });
  return result;
}

function findSentMessage(prospect) {
  try {
    const email = normalizeText(prospect.email).toLowerCase();
    const subject = cleanTrackingSubject(prospect.subject);
    const query = 'in:sent to:' + email + ' newer_than:180d' + (subject ? ' subject:"' + subject + '"' : '');
    const threads = GmailApp.search(query, 0, 10);
    let newest = null;
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        if (normalizeText(message.getTo()).toLowerCase().indexOf(email) === -1) return;
        if (!newest || message.getDate().getTime() > newest.getDate().getTime()) newest = message;
      });
    });
    return newest;
  } catch (error) {
    writeLog('WARN', 'findSentMessage', '', '', 'Recherche des envois impossible', stack(error));
    return null;
  }
}

function cleanTrackingSubject(subject) {
  return String(subject || '')
    .replace(/^\[TEST[^\]]+\]\s*/, '')
    .replace(/^Re\s*:\s*/i, '')
    .replace(/"/g, '')
    .trim();
}

function applySentState(row, sentAt) {
  const date = sentAt ? new Date(sentAt) : new Date();
  row[COL.STATUS - 1] = 'Envoyé';
  row[COL.FIRST_CONTACT_DATE - 1] = row[COL.FIRST_CONTACT_DATE - 1] || date;
  row[COL.LAST_ACTION_DATE - 1] = date;
  row[COL.NEXT_FOLLOWUP_DATE - 1] = addBusinessDays(date, Number(getConfigValue('Nombre de jours avant relance 1', 5)));
  return row;
}

function installAutomaticSentSync() {
  removeAutomaticSentSync(false);
  ScriptApp.newTrigger('syncSentMessagesFromGmail').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Synchronisation automatique activée : vérification toutes les heures.', MDB.APP_NAME, 8);
}

function removeAutomaticSentSync(showToast) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncSentMessagesFromGmail') ScriptApp.deleteTrigger(trigger);
  });
  if (showToast !== false) SpreadsheetApp.getActive().toast('Synchronisation automatique désactivée.', MDB.APP_NAME, 8);
}

function markActiveProspectAsSent() {
  const sheet = getSs().getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (!isProspectSheetName(sheet.getName()) || rowNumber < 2) return;
  const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
  applySentState(row, new Date());
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([row]);
  writeLog('INFO', 'markActiveProspectAsSent', sheet.getName(), rowNumber, 'Prospect marqué comme envoyé', '');
}

function addActiveProspectToExclusion() {
  const sheet = getSs().getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (!isProspectSheetName(sheet.getName()) || rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Sélectionnez une ligne prospect.');
    return;
  }
  const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
  const email = normalizeText(row[COL.EMAIL - 1]).toLowerCase();
  if (!email) {
    SpreadsheetApp.getUi().alert('Aucune adresse e-mail sur cette ligne.');
    return;
  }
  const exclusion = getOrCreateSheet(MDB.SHEETS.EXCLUSION);
  exclusion.appendRow([email, 'Demande ou décision manuelle', new Date(), sheet.getName() + ' ligne ' + rowNumber, row[COL.ORGANISATION - 1]]);
  row[COL.DO_NOT_CONTACT - 1] = 'Oui';
  row[COL.STATUS - 1] = 'Ne plus contacter';
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([row]);
  writeLog('INFO', 'addActiveProspectToExclusion', sheet.getName(), rowNumber, 'Ajout à la liste d’exclusion', email);
}

function deleteActiveProspectData() {
  const sheet = getSs().getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (!isProspectSheetName(sheet.getName()) || rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Sélectionnez une ligne prospect.');
    return;
  }
  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Supprimer les données',
    'Cette action vide les données personnelles de la ligne active et conserve seulement une trace anonymisée. Continuer ?',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;
  const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
  const oldEmail = normalizeText(row[COL.EMAIL - 1]).toLowerCase();
  const oldOrg = normalizeText(row[COL.ORGANISATION - 1]);
  const deleted = new Array(MDB.HEADERS.length).fill('');
  deleted[COL.ID - 1] = row[COL.ID - 1] || makeProspectId(sheet.getName(), rowNumber);
  deleted[COL.ORGANISATION - 1] = 'Données supprimées';
  deleted[COL.TYPE_ORG - 1] = row[COL.TYPE_ORG - 1] || MDB.CATEGORY_LABELS[sheet.getName()];
  deleted[COL.STATUS - 1] = 'Ne plus contacter';
  deleted[COL.RESULT - 1] = 'Aucun';
  deleted[COL.NOTES - 1] = 'Données supprimées le ' + formatDate(new Date()) + '.';
  deleted[COL.DO_NOT_CONTACT - 1] = 'Oui';
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([deleted]);
  if (oldEmail) getOrCreateSheet(MDB.SHEETS.EXCLUSION).appendRow([oldEmail, 'Suppression des données', new Date(), sheet.getName() + ' ligne ' + rowNumber, oldOrg]);
  writeLog('INFO', 'deleteActiveProspectData', sheet.getName(), rowNumber, 'Données prospect supprimées', oldEmail);
}
