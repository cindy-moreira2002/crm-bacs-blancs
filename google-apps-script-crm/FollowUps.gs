function prepareFollowUps() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const config = getConfigMap();
    const maxDrafts = Number(config['Nombre maximal de brouillons par traitement'] || 20);
    const testMode = isTestMode();
    const testEmail = normalizeText(config['Adresse e-mail de test']);
    if (testMode && !isValidEmail(testEmail)) throw new Error('Mode test actif : renseignez une adresse e-mail de test valide.');
    const exclusion = getExclusionSet();
    let created = 0;
    const dueRows = [];
    getProspectSheets().forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      const updated = rows.map(function (row, index) {
        const prospect = rowToObject(row);
        if (!isFollowupDue(prospect, exclusion) || created >= maxDrafts) return row;
        const nextCount = Number(prospect.followupCount || 0) + 1;
        const type = nextCount === 1 ? 'RELANCE_1' : 'RELANCE_2';
        const template = getTemplate(sheet.getName(), type);
        if (!template) {
          row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Template ' + type + ' introuvable.');
          return row;
        }
        const subjectResult = renderTemplate(template.subject, prospect, config);
        const bodyResult = renderTemplate(template.body, prospect, config);
        const missing = subjectResult.missing.concat(bodyResult.missing).filter(uniqueOnly);
        if (missing.length || hasUnresolvedPlaceholders(subjectResult.text) || hasUnresolvedPlaceholders(bodyResult.text)) {
          row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], 'Modèle de relance incomplet : ' + missing.join(', ') + '. Brouillon non créé.');
          return row;
        }
        const renderedSubject = subjectResult.text;
        const renderedBody = bodyResult.text;
        const recipient = testMode ? testEmail : normalizeText(prospect.email).toLowerCase();
        const subjectPrefix = testMode ? '[TEST vers ' + prospect.email + '] ' : '';
        const thread = findLikelyThread(prospect.email, prospect.subject || renderedSubject);
        let draft;
        if (thread && thread.createDraftReply) {
          draft = thread.createDraftReply(renderedBody, { htmlBody: textToHtml(renderedBody) });
        } else {
          draft = GmailApp.createDraft(recipient, subjectPrefix + renderedSubject, renderedBody, { htmlBody: textToHtml(renderedBody) });
        }
        row[COL.GENERATED_SUBJECT - 1] = renderedSubject;
        row[COL.GENERATED_MESSAGE - 1] = renderedBody;
        row[COL.DRAFT_CREATED - 1] = 'Oui';
        row[COL.DRAFT_ID - 1] = draft.getId ? draft.getId() : '';
        row[COL.STATUS - 1] = nextCount === 1 ? 'Relance 1 à préparer' : 'Relance 2 à préparer';
        row[COL.LAST_ACTION_DATE - 1] = new Date();
        row[COL.FOLLOWUP_COUNT - 1] = nextCount;
        row[COL.NEXT_FOLLOWUP_DATE - 1] = nextCount === 1
          ? addBusinessDays(new Date(), Number(config['Nombre de jours avant relance 2'] || 8))
          : '';
        created += 1;
        dueRows.push([sheet.getName(), index + 2, prospect.organisation, prospect.email, row[COL.STATUS - 1], row[COL.NEXT_FOLLOWUP_DATE - 1], nextCount, prospect.priority]);
        writeLog('INFO', 'prepareFollowUps', sheet.getName(), index + 2, 'Brouillon de relance créé', type);
        return row;
      });
      if (updated.length) sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
    });
    refreshFollowupsSheet(dueRows);
    refreshDashboard();
    SpreadsheetApp.getActive().toast(created + ' brouillons de relance créés.', MDB.APP_NAME, 8);
  } catch (error) {
    writeLog('ERROR', 'prepareFollowUps', '', '', 'Erreur relances', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function isFollowupDue(prospect, exclusion) {
  if (!isValidEmail(prospect.email)) return false;
  if (isExcluded(prospect.email, exclusion)) return false;
  if (normalizeYesNo(prospect.doNotContact) === 'Oui') return false;
  if (normalizeYesNo(prospect.responseReceived) === 'Oui') return false;
  if (['Refus', 'Réponse reçue', 'Rendez-vous obtenu', 'Partenariat signé', 'Ne plus contacter'].indexOf(prospect.status) !== -1) return false;
  if (Number(prospect.followupCount || 0) >= 2) return false;
  if (!prospect.nextFollowupDate) return false;
  return new Date(prospect.nextFollowupDate).getTime() <= endOfToday().getTime();
}

function findLikelyThread(email, subject) {
  try {
    const cleanSubject = String(subject || '').replace(/^\[TEST[^\]]+\]\s*/, '').replace(/^Re:\s*/i, '').replace(/"/g, '');
    const query = 'to:' + email + ' OR from:' + email + ' subject:"' + cleanSubject + '" newer_than:180d';
    const threads = GmailApp.search(query, 0, 1);
    return threads.length ? threads[0] : null;
  } catch (error) {
    writeLog('WARN', 'findLikelyThread', '', '', 'Recherche de fil impossible', stack(error));
    return null;
  }
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function refreshFollowupsSheet(rows) {
  const sheet = getOrCreateSheet(MDB.SHEETS.FOLLOWUPS);
  setupFollowupsSheet();
  if (rows.length) sheet.getRange(2, 1, rows.length, 8).setValues(rows);
}
