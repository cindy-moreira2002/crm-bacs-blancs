function generateMessages() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    ensureAllProspectSchemas_();
    const config = getConfigMap();
    let count = 0;
    getProspectSheets().forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      const updated = rows.map(function (row, index) {
        if (row[COL.STATUS - 1] !== 'Prêt à contacter') return row;
        const prospect = rowToObject(enrichPersonalizationForRow(sheet.getName(), row));
        const template = getTemplate(sheet.getName(), 'PREMIER_CONTACT');
        if (!template) {
          row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Template PREMIER_CONTACT introuvable.');
          return row;
        }
        const subject = renderTemplate(template.subject, prospect, config);
        const body = renderTemplate(template.body, prospect, config);
        row[COL.GENERATED_SUBJECT - 1] = subject.text;
        row[COL.GENERATED_MESSAGE - 1] = body.text;
        const missing = subject.missing.concat(body.missing).filter(uniqueOnly);
        if (missing.length) row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Variables manquantes : ' + missing.join(', '));
        count += 1;
        writeLog('INFO', 'generateMessages', sheet.getName(), index + 2, 'Message généré', missing.join(', '));
        return row;
      });
      if (updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
    });
    refreshDashboard();
    SpreadsheetApp.getActive().toast(count + ' messages générés.', MDB.APP_NAME, 8);
  } catch (error) {
    writeLog('ERROR', 'generateMessages', '', '', 'Erreur génération messages', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function createGmailDrafts() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    ensureAllProspectSchemas_();
    const config = getConfigMap();
    const maxDrafts = Number(config['Nombre maximal de brouillons par traitement'] || 20);
    const testMode = isTestMode();
    const testEmail = normalizeText(config['Adresse e-mail de test']);
    if (testMode && !isValidEmail(testEmail)) throw new Error('Mode test actif : renseignez une adresse e-mail de test valide dans CONFIGURATION.');
    const exclusion = getExclusionSet();
    const prospectSheets = getProspectSheets();
    const reconciliation = reconcileDeletedGmailDrafts_(prospectSheets);
    let created = 0;
    prospectSheets.forEach(function (sheet) {
      if (created >= maxDrafts) return;
      const rows = getProspectRows(sheet);
      const updated = rows.map(function (row, index) {
        if (created >= maxDrafts) return row;
        const prospect = rowToObject(row);
        const canCreate = canCreateDraft(prospect, exclusion);
        if (!canCreate.ok) {
          if (prospect.status === 'Prêt à contacter') row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], canCreate.reason);
          return row;
        }
        if (
          !row[COL.GENERATED_SUBJECT - 1] ||
          !row[COL.GENERATED_MESSAGE - 1] ||
          hasUnresolvedPlaceholders(row[COL.GENERATED_SUBJECT - 1]) ||
          hasUnresolvedPlaceholders(row[COL.GENERATED_MESSAGE - 1])
        ) {
          const template = getTemplate(sheet.getName(), 'PREMIER_CONTACT');
          if (!template) {
            row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Template PREMIER_CONTACT introuvable. Brouillon non créé.');
            return row;
          }
          const renderedSubject = renderTemplate(template.subject, prospect, config);
          const renderedBody = renderTemplate(template.body, prospect, config);
          row[COL.GENERATED_SUBJECT - 1] = renderedSubject.text;
          row[COL.GENERATED_MESSAGE - 1] = renderedBody.text;
          const missing = renderedSubject.missing.concat(renderedBody.missing).filter(uniqueOnly);
          if (missing.length) {
            row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Variables inconnues dans le modèle : ' + missing.join(', ') + '. Brouillon non créé.');
            return row;
          }
        }
        if (
          hasUnresolvedPlaceholders(row[COL.GENERATED_SUBJECT - 1]) ||
          hasUnresolvedPlaceholders(row[COL.GENERATED_MESSAGE - 1])
        ) {
          row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Marqueur à compléter détecté. Brouillon non créé.');
          return row;
        }
        const recipient = testMode ? testEmail : normalizeText(row[COL.EMAIL - 1]).toLowerCase();
        const subjectPrefix = testMode ? '[TEST vers ' + row[COL.EMAIL - 1] + '] ' : '';
        const draft = GmailApp.createDraft(recipient, subjectPrefix + row[COL.GENERATED_SUBJECT - 1], row[COL.GENERATED_MESSAGE - 1], {
          htmlBody: textToHtml(row[COL.GENERATED_MESSAGE - 1]),
          attachments: getOptionalAttachments(config)
        });
        row[COL.DRAFT_CREATED - 1] = 'Oui';
        row[COL.DRAFT_ID - 1] = draft.getId ? draft.getId() : '';
        row[COL.STATUS - 1] = 'Brouillon créé';
        row[COL.FOLLOWUP_COUNT - 1] = Number(row[COL.FOLLOWUP_COUNT - 1] || 0);
        created += 1;
        writeLog('INFO', 'createGmailDrafts', sheet.getName(), index + 2, 'Brouillon Gmail créé', 'Destinataire: ' + recipient);
        return row;
      });
      if (updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
    });
    refreshDashboard();
    let message = created + ' brouillons créés.';
    if (reconciliation.reset) message += ' ' + reconciliation.reset + ' brouillons supprimés rendus recréables.';
    if (reconciliation.sent) message += ' ' + reconciliation.sent + ' envois détectés.';
    SpreadsheetApp.getActive().toast(message, MDB.APP_NAME, 8);
  } catch (error) {
    writeLog('ERROR', 'createGmailDrafts', '', '', 'Erreur brouillons Gmail', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function canCreateDraft(prospect, exclusion) {
  if (prospect.status !== 'Prêt à contacter') return { ok: false, reason: 'Statut différent de Prêt à contacter.' };
  if (normalizeYesNo(prospect.doNotContact) === 'Oui') return { ok: false, reason: 'Ne plus contacter = Oui.' };
  if (!isValidEmail(prospect.email)) return { ok: false, reason: 'Adresse e-mail invalide.' };
  if (isExcluded(prospect.email, exclusion)) return { ok: false, reason: 'Adresse présente dans la liste d’exclusion.' };
  if (normalizeYesNo(prospect.draftCreated) === 'Oui' || prospect.draftId) return { ok: false, reason: 'Brouillon déjà créé.' };
  if (prospect.firstContactDate || prospect.status === 'Envoyé') return { ok: false, reason: 'Prospect déjà contacté.' };
  return { ok: true, reason: '' };
}

function createBalancedDailyDrafts() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    ensureAllProspectSchemas_();
    const config = getConfigMap();
    const maxDrafts = Number(config['Nombre maximal de brouillons par traitement'] || 20);
    const result = createAutomaticDraftBatch_(maxDrafts, true, 'createBalancedDailyDrafts', 'Brouillon quotidien créé');
    let message = result.created + ' brouillons créés et répartis entre les catégories.';
    if (result.reconciliation.reset) message += ' ' + result.reconciliation.reset + ' brouillons supprimés rendus recréables.';
    SpreadsheetApp.getActive().toast(message, MDB.APP_NAME, 10);
    return result.created;
  } catch (error) {
    writeLog('ERROR', 'createBalancedDailyDrafts', '', '', 'Erreur préparation quotidienne', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function scanNewProspectsAndCreateDrafts() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    ensureAllProspectSchemas_();
    return createAutomaticDraftBatch_(40, false, 'scanNewProspectsAndCreateDrafts', 'Brouillon automatique créé').created;
  } catch (error) {
    writeLog('ERROR', 'scanNewProspectsAndCreateDrafts', '', '', 'Erreur détection des nouveaux contacts', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function createAutomaticDraftBatch_(maxDrafts, reconcileDrafts, logFunction, logLabel) {
  const config = getConfigMap();
  const testMode = isTestMode();
  const testEmail = normalizeText(config['Adresse e-mail de test']);
  if (testMode && !isValidEmail(testEmail)) throw new Error('Mode test actif : renseignez une adresse e-mail de test valide dans CONFIGURATION.');

  const exclusion = getExclusionSet();
  const sheets = getProspectSheets();
  const reconciliation = reconcileDrafts ? reconcileDeletedGmailDrafts_(sheets) : { reset: 0, sent: 0 };
  const buckets = sheets.map(function (sheet) {
    const rows = getProspectRows(sheet);
    return { sheet: sheet, rows: rows, nextRow: 0, changed: false };
  });
  const properties = PropertiesService.getScriptProperties();
  const start = Number(properties.getProperty('MDB_DAILY_CATEGORY_OFFSET') || 0) % Math.max(buckets.length, 1);
  let created = 0;
  let progress = true;

  while (created < maxDrafts && progress) {
    progress = false;
    for (let offset = 0; offset < buckets.length && created < maxDrafts; offset += 1) {
      const bucket = buckets[(start + offset) % buckets.length];
      let candidate = null;
      while (bucket.nextRow < bucket.rows.length) {
        const rowIndex = bucket.nextRow;
        bucket.nextRow += 1;
        if (canCreateAutomaticDraft_(rowToObject(bucket.rows[rowIndex]), exclusion)) {
          candidate = { rowIndex: rowIndex, row: bucket.rows[rowIndex] };
          break;
        }
      }
      if (!candidate) continue;
      progress = true;
      const result = createAutomaticDraftForRow_(bucket.sheet.getName(), candidate.row, config, testMode, testEmail);
      bucket.rows[candidate.rowIndex] = result.row;
      bucket.changed = true;
      if (result.created) {
        created += 1;
        writeLog('INFO', logFunction, bucket.sheet.getName(), candidate.rowIndex + 2, logLabel, result.recipient);
      }
    }
  }

  buckets.forEach(function (bucket) {
    if (bucket.changed && bucket.rows.length) bucket.sheet.getRange(2, 1, bucket.rows.length, MDB.HEADERS.length).setValues(bucket.rows);
  });
  properties.setProperty('MDB_DAILY_CATEGORY_OFFSET', String((start + 1) % Math.max(buckets.length, 1)));
  refreshDashboard();
  return { created: created, reconciliation: reconciliation };
}

function handleProspectEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (!isProspectSheetName(sheet.getName()) || e.range.getLastRow() < 2) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;
  try {
    const config = getConfigMap();
    const testMode = isTestMode();
    const testEmail = normalizeText(config['Adresse e-mail de test']);
    if (testMode && !isValidEmail(testEmail)) return;
    const exclusion = getExclusionSet();
    const firstRow = Math.max(2, e.range.getRow());
    const lastRow = Math.min(sheet.getLastRow(), e.range.getLastRow());
    let created = 0;

    for (let rowNumber = firstRow; rowNumber <= lastRow && created < 20; rowNumber += 1) {
      const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
      if (!canCreateAutomaticDraft_(rowToObject(row), exclusion)) continue;
      const result = createAutomaticDraftForRow_(sheet.getName(), row, config, testMode, testEmail);
      sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([result.row]);
      if (result.created) {
        created += 1;
        writeLog('INFO', 'handleProspectEdit', sheet.getName(), rowNumber, 'Brouillon créé après ajout du contact', result.recipient);
      }
    }
    if (created) refreshDashboard();
  } catch (error) {
    writeLog('ERROR', 'handleProspectEdit', sheet.getName(), e.range.getRow(), 'Erreur création immédiate', stack(error));
  } finally {
    lock.releaseLock();
  }
}

function canCreateAutomaticDraft_(prospect, exclusion) {
  if (normalizeYesNo(prospect.doNotContact) === 'Oui') return false;
  if (!isValidEmail(prospect.email)) return false;
  if (isExcluded(prospect.email, exclusion)) return false;
  if (normalizeYesNo(prospect.draftCreated) === 'Oui' || prospect.draftId) return false;
  if (prospect.firstContactDate) return false;
  if (['Envoyé', 'Réponse reçue', 'Ne plus contacter', 'Brouillon créé'].indexOf(prospect.status) !== -1) return false;
  return true;
}

function createAutomaticDraftForRow_(sheetName, row, config, testMode, testEmail) {
  row = enrichPersonalizationForRow(sheetName, row);
  const prospect = rowToObject(row);
  const template = getTemplate(sheetName, 'PREMIER_CONTACT');
  if (!template) {
    row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Template PREMIER_CONTACT introuvable. Brouillon non créé.');
    return { created: false, row: row, recipient: '' };
  }
  const subject = renderTemplate(template.subject, prospect, config);
  const body = renderTemplate(template.body, prospect, config);
  row[COL.GENERATED_SUBJECT - 1] = subject.text;
  row[COL.GENERATED_MESSAGE - 1] = body.text;
  const missing = subject.missing.concat(body.missing).filter(uniqueOnly);
  if (missing.length || hasUnresolvedPlaceholders(subject.text) || hasUnresolvedPlaceholders(body.text)) {
    row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Modèle incomplet : brouillon quotidien non créé.');
    return { created: false, row: row, recipient: '' };
  }
  const recipient = testMode ? testEmail : normalizeText(prospect.email).toLowerCase();
  const prefix = testMode ? '[TEST vers ' + prospect.email + '] ' : '';
  const draft = GmailApp.createDraft(recipient, prefix + subject.text, body.text, {
    htmlBody: textToHtml(body.text),
    attachments: getOptionalAttachments(config)
  });
  row[COL.DRAFT_CREATED - 1] = 'Oui';
  row[COL.DRAFT_ID - 1] = draft.getId ? draft.getId() : '';
  row[COL.STATUS - 1] = 'Brouillon créé';
  row[COL.FOLLOWUP_COUNT - 1] = Number(row[COL.FOLLOWUP_COUNT - 1] || 0);
  return { created: true, row: row, recipient: recipient };
}

function installAutomaticDailyDrafts() {
  removeAutomaticDailyDrafts(false);
  ScriptApp.newTrigger('createBalancedDailyDrafts').timeBased().atHour(8).everyDays(1).create();
  SpreadsheetApp.getActive().toast('Préparation quotidienne activée : jusqu’à 20 brouillons répartis entre les catégories chaque matin.', MDB.APP_NAME, 10);
}

function installAutomaticDraftCreation() {
  removeAutomaticDraftCreation(false);
  removeAutomaticDailyDrafts(false);
  ScriptApp.newTrigger('handleProspectEdit').forSpreadsheet(getSs()).onEdit().create();
  ScriptApp.newTrigger('scanNewProspectsAndCreateDrafts').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('Automatisation activée : nouvel e-mail valide = nouveau brouillon. Contrôle complémentaire toutes les 5 minutes.', MDB.APP_NAME, 12);
}

function removeAutomaticDraftCreation(showToast) {
  const handlers = ['handleProspectEdit', 'scanNewProspectsAndCreateDrafts'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  if (showToast !== false) SpreadsheetApp.getActive().toast('Création automatique des nouveaux brouillons désactivée.', MDB.APP_NAME, 8);
}

function removeAutomaticDailyDrafts(showToast) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'createBalancedDailyDrafts') ScriptApp.deleteTrigger(trigger);
  });
  if (showToast !== false) SpreadsheetApp.getActive().toast('Préparation quotidienne désactivée.', MDB.APP_NAME, 8);
}

function cleanMissingEmailsAndCreateAllDrafts() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const config = getConfigMap();
    const testMode = isTestMode();
    const testEmail = normalizeText(config['Adresse e-mail de test']);
    if (testMode && !isValidEmail(testEmail)) throw new Error('Mode test actif : renseignez une adresse e-mail de test valide dans CONFIGURATION.');
    const exclusion = getExclusionSet();
    const sheets = getProspectSheets();
    const reconciliation = reconcileDeletedGmailDrafts_(sheets);
    let deleted = 0;
    let created = 0;
    let errors = 0;

    sheets.forEach(function (sheet) {
      let rows = getProspectRows(sheet);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (!isValidEmail(rowToObject(rows[index]).email)) {
          sheet.deleteRow(index + 2);
          deleted += 1;
        }
      }
      rows = getProspectRows(sheet);
      rows.forEach(function (row, index) {
        const prospect = rowToObject(row);
        if (!canCreateAutomaticDraft_(prospect, exclusion)) return;
        try {
          const result = createAutomaticDraftForRow_(sheet.getName(), row, config, testMode, testEmail);
          if (!result.created) {
            sheet.getRange(index + 2, 1, 1, MDB.HEADERS.length).setValues([result.row]);
            errors += 1;
            return;
          }
          sheet.getRange(index + 2, 1, 1, MDB.HEADERS.length).setValues([result.row]);
          created += 1;
          writeLog('INFO', 'cleanMissingEmailsAndCreateAllDrafts', sheet.getName(), index + 2, 'Brouillon global créé', result.recipient);
        } catch (error) {
          row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Erreur de création du brouillon : ' + error.message);
          sheet.getRange(index + 2, 1, 1, MDB.HEADERS.length).setValues([row]);
          errors += 1;
          writeLog('WARN', 'cleanMissingEmailsAndCreateAllDrafts', sheet.getName(), index + 2, 'Brouillon non créé', stack(error));
        }
      });
    });

    refreshDashboard();
    const message = deleted + ' lignes sans e-mail supprimées, ' + created + ' brouillons créés, ' + errors + ' lignes à vérifier.';
    SpreadsheetApp.getActive().toast(message, MDB.APP_NAME, 12);
    writeLog('INFO', 'cleanMissingEmailsAndCreateAllDrafts', '', '', message, 'Brouillons supprimés réinitialisés : ' + reconciliation.reset);
    return { deleted: deleted, created: created, errors: errors };
  } catch (error) {
    writeLog('ERROR', 'cleanMissingEmailsAndCreateAllDrafts', '', '', 'Erreur nettoyage et création globale', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getOptionalAttachments(config) {
  const brochureId = parseDriveId(config['URL de la brochure PDF']);
  if (!brochureId) return [];
  try {
    return [DriveApp.getFileById(brochureId).getBlob()];
  } catch (error) {
    writeLog('WARN', 'getOptionalAttachments', '', '', 'Brochure non jointe', stack(error));
    return [];
  }
}

function uniqueOnly(value, index, array) {
  return array.indexOf(value) === index;
}
