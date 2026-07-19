function calculateScores() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    getProspectSheets().forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      if (!rows.length) return;
      const updated = rows.map(function (row) {
        const enriched = enrichPersonalizationForRow(sheet.getName(), row);
        enriched[COL.SCORE - 1] = calculateProspectScore(sheet.getName(), enriched);
        enriched[COL.PRIORITY - 1] = scoreToPriority(enriched[COL.SCORE - 1]);
        if (!enriched[COL.STATUS - 1]) enriched[COL.STATUS - 1] = 'À qualifier';
        if (!enriched[COL.RESULT - 1]) enriched[COL.RESULT - 1] = 'Aucun';
        if (!enriched[COL.DRAFT_CREATED - 1]) enriched[COL.DRAFT_CREATED - 1] = 'Non';
        if (!enriched[COL.RESPONSE_RECEIVED - 1]) enriched[COL.RESPONSE_RECEIVED - 1] = 'Non';
        if (!enriched[COL.DO_NOT_CONTACT - 1]) enriched[COL.DO_NOT_CONTACT - 1] = 'Non';
        return enriched;
      });
      sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
      writeLog('INFO', 'calculateScores', sheet.getName(), '', updated.length + ' scores calculés', '');
    });
    refreshDashboard();
  } catch (error) {
    writeLog('ERROR', 'calculateScores', '', '', 'Erreur scoring', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function calculateProspectScore(category, row) {
  let score = 0;
  const email = row[COL.EMAIL - 1];
  const phone = row[COL.PHONE - 1];
  const website = row[COL.WEBSITE - 1];
  const sourceUrl = row[COL.SOURCE_URL - 1];
  const role = normalizeKey(row[COL.ROLE - 1]);
  const size = normalizeKey(row[COL.SIZE - 1]);
  const personalization = normalizeKey(row[COL.PERSONALIZATION - 1]);
  const offer = normalizeKey(row[COL.OFFER - 1]);

  if (email && website && sourceUrl) score += 10;
  if (phone) score += 5;
  if (role && /(directeur|direction|responsable|président|president|secrétaire|secretaire|jeunesse|education|cse|chef)/.test(role)) score += 20;
  if (/(1000|500|grand|nombreux|lycéens|lyceens|familles|salariés|salaries|habitants|quartiers)/.test(size)) score += 15;
  if (/(education|éducation|jeunesse|parents|familles|scolaire|bac|examens|réussite|reussite|social|solidarité|solidarite)/.test(personalization + ' ' + offer + ' ' + role)) score += 20;
  if (/(financ|cse|mairie|collectivité|collectivite|entreprise|mécène|mecene|partenaire|tarif|places)/.test(offer + ' ' + role + ' ' + category.toLowerCase())) score += 15;
  if (isExamSeasonWindow()) score += 10;
  if (personalization && personalization.indexOf('neutre') === -1) score += 5;

  if (category === 'LYCEES_PRIVES' && role.indexOf('direction') !== -1) score += 5;
  if (category === 'MAIRIES' && /(jeunesse|education|réussite|reussite)/.test(role + ' ' + personalization)) score += 5;
  if (category === 'ASSOCIATIONS_EDUCATIVES' && /(accompagnement|scolaire|egalite|égalité)/.test(personalization)) score += 5;

  return Math.min(100, score);
}

function isExamSeasonWindow() {
  const month = Number(Utilities.formatDate(new Date(), MDB.TIMEZONE, 'M'));
  return month >= 1 && month <= 6;
}

function scoreToPriority(score) {
  if (score >= 70) return 'Haute';
  if (score >= 40) return 'Moyenne';
  return 'Basse';
}
