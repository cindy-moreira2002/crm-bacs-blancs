function verifyData() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const exclusion = getExclusionSet();
    getProspectSheets().forEach(function (sheet) {
      const rows = getProspectRows(sheet);
      const backgrounds = [];
      const updated = rows.map(function (row, index) {
        const rowNumber = index + 2;
        const email = normalizeText(row[COL.EMAIL - 1]).toLowerCase();
        const phone = row[COL.PHONE - 1];
        row[COL.ID - 1] = row[COL.ID - 1] || makeProspectId(sheet.getName(), rowNumber);
        row[COL.TYPE_ORG - 1] = row[COL.TYPE_ORG - 1] || MDB.CATEGORY_LABELS[sheet.getName()] || sheet.getName();
        row[COL.PHONE - 1] = normalizeFrenchPhone(phone);
        row[COL.EMAIL_TYPE - 1] = email ? (isGenericEmail(email) ? 'générique' : 'nominatif') : row[COL.EMAIL_TYPE - 1];
        row[COL.COLLECTED_AT - 1] = row[COL.COLLECTED_AT - 1] || new Date();
        row[COL.DRAFT_CREATED - 1] = row[COL.DRAFT_CREATED - 1] || 'Non';
        row[COL.RESPONSE_RECEIVED - 1] = row[COL.RESPONSE_RECEIVED - 1] || 'Non';
        row[COL.RESULT - 1] = row[COL.RESULT - 1] || 'Aucun';
        row[COL.DO_NOT_CONTACT - 1] = normalizeYesNo(row[COL.DO_NOT_CONTACT - 1]);
        const notes = [];
        if (email && !isValidEmail(email)) notes.push('Syntaxe e-mail à vérifier.');
        if (!row[COL.SOURCE_URL - 1]) notes.push('URL de source manquante.');
        if (email && isExcluded(email, exclusion)) {
          row[COL.DO_NOT_CONTACT - 1] = 'Oui';
          row[COL.STATUS - 1] = 'Ne plus contacter';
          notes.push('Présent dans la liste d’exclusion.');
        }
        if (notes.length) row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], notes.join(' '));
        backgrounds.push(buildRowQualityBackground(row));
        return enrichPersonalizationForRow(sheet.getName(), row);
      });
      if (updated.length) {
        sheet.getRange(2, 1, updated.length, MDB.HEADERS.length).setValues(updated);
        sheet.getRange(2, 1, backgrounds.length, MDB.HEADERS.length).setBackgrounds(backgrounds);
      }
      writeLog('INFO', 'verifyData', sheet.getName(), '', updated.length + ' lignes vérifiées', '');
    });
    refreshDashboard();
  } catch (error) {
    writeLog('ERROR', 'verifyData', '', '', 'Erreur vérification', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function detectDuplicates() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const byEmail = {};
    const byOrgCity = {};
    getProspectSheets().forEach(function (sheet) {
      getProspectRows(sheet).forEach(function (row, index) {
        const rowNumber = index + 2;
        const email = normalizeText(row[COL.EMAIL - 1]).toLowerCase();
        const orgCity = normalizeKey(row[COL.ORGANISATION - 1] + '|' + row[COL.CITY - 1]);
        if (email) (byEmail[email] = byEmail[email] || []).push({ sheet: sheet, row: rowNumber });
        if (orgCity !== '|') (byOrgCity[orgCity] = byOrgCity[orgCity] || []).push({ sheet: sheet, row: rowNumber });
      });
    });
    markDuplicates(byEmail, 'Doublon e-mail possible');
    markDuplicates(byOrgCity, 'Doublon organisation + ville possible');
    writeLog('INFO', 'detectDuplicates', '', '', 'Détection terminée', '');
  } catch (error) {
    writeLog('ERROR', 'detectDuplicates', '', '', 'Erreur doublons', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function removeEmailDuplicates() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const byEmail = {};
    let scanned = 0;
    getProspectSheets().forEach(function (sheet, sheetIndex) {
      getProspectRows(sheet).forEach(function (row, index) {
        const email = normalizeText(row[COL.EMAIL - 1]).toLowerCase();
        if (!isValidEmail(email)) return;
        scanned += 1;
        const record = {
          sheet: sheet,
          sheetIndex: sheetIndex,
          rowNumber: index + 2,
          row: row
        };
        (byEmail[email] = byEmail[email] || []).push(record);
      });
    });

    const toDelete = [];
    Object.keys(byEmail).forEach(function (email) {
      const matches = byEmail[email];
      if (matches.length < 2) return;
      const keeper = chooseEmailDuplicateKeeper_(matches);
      matches.forEach(function (match) {
        if (match !== keeper) toDelete.push(match);
      });
      writeLog('WARN', 'removeEmailDuplicates', keeper.sheet.getName(), keeper.rowNumber, 'Doublons e-mail retirés', email + ' - ligne conservée');
    });

    deleteRowsBySheet_(toDelete);
    refreshDashboard();
    const message = toDelete.length + ' doublon(s) e-mail supprimé(s) sur ' + scanned + ' adresse(s) vérifiée(s).';
    writeLog('INFO', 'removeEmailDuplicates', '', '', message, '');
    SpreadsheetApp.getActive().toast(message, MDB.APP_NAME, 10);
  } catch (error) {
    writeLog('ERROR', 'removeEmailDuplicates', '', '', 'Erreur suppression doublons e-mail', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function chooseEmailDuplicateKeeper_(matches) {
  return matches.slice().sort(function (a, b) {
    return duplicateKeepScore_(b.row) - duplicateKeepScore_(a.row) ||
      a.sheetIndex - b.sheetIndex ||
      a.rowNumber - b.rowNumber;
  })[0];
}

function duplicateKeepScore_(row) {
  let score = 0;
  const status = normalizeText(row[COL.STATUS - 1]);
  if (normalizeYesNo(row[COL.RESPONSE_RECEIVED - 1]) === 'Oui') score += 1000;
  if (status === 'Envoyé') score += 900;
  if (normalizeYesNo(row[COL.DRAFT_CREATED - 1]) === 'Oui' || row[COL.DRAFT_ID - 1]) score += 700;
  if (row[COL.FIRST_CONTACT_DATE - 1]) score += 500;
  if (row[COL.LAST_ACTION_DATE - 1]) score += 300;
  if (status && status !== 'À qualifier') score += 120;
  score += Number(row[COL.SCORE - 1] || 0);
  row.forEach(function (value) {
    if (normalizeText(value)) score += 1;
  });
  return score;
}

function deleteRowsBySheet_(records) {
  const grouped = {};
  records.forEach(function (record) {
    const name = record.sheet.getName();
    (grouped[name] = grouped[name] || { sheet: record.sheet, rows: [] }).rows.push(record.rowNumber);
  });
  Object.keys(grouped).forEach(function (name) {
    grouped[name].rows.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
      grouped[name].sheet.deleteRow(rowNumber);
      writeLog('INFO', 'removeEmailDuplicates', name, rowNumber, 'Ligne doublon e-mail supprimée', '');
    });
  });
}

function markDuplicates(index, message) {
  Object.keys(index).forEach(function (key) {
    const matches = index[key];
    if (matches.length < 2) return;
    matches.forEach(function (match) {
      const range = match.sheet.getRange(match.row, 1, 1, MDB.HEADERS.length);
      const row = range.getValues()[0];
      row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], message + ' : ' + key);
      range.setValues([row]).setBackground('#fef3c7');
      writeLog('WARN', 'detectDuplicates', match.sheet.getName(), match.row, message, key);
    });
  });
}

function buildRowQualityBackground(row) {
  const base = new Array(MDB.HEADERS.length).fill('#ffffff');
  if (!row[COL.SOURCE_URL - 1]) base[COL.SOURCE_URL - 1] = '#fee2e2';
  if (row[COL.EMAIL - 1] && !isValidEmail(row[COL.EMAIL - 1])) base[COL.EMAIL - 1] = '#fee2e2';
  if (normalizeYesNo(row[COL.DO_NOT_CONTACT - 1]) === 'Oui') base[COL.DO_NOT_CONTACT - 1] = '#fecaca';
  return base;
}

function appendNote(current, addition) {
  const cleanCurrent = normalizeText(current);
  if (cleanCurrent.indexOf(addition) !== -1) return cleanCurrent;
  return cleanCurrent ? cleanCurrent + '\n' + addition : addition;
}

function getExclusionSet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.EXCLUSION);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return rows.map(function (row) { return normalizeText(row[0]).toLowerCase(); }).filter(Boolean);
}

function isExcluded(email, exclusionSet) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const domain = normalizedEmail.split('@')[1] || '';
  return exclusionSet.some(function (entry) {
    const clean = entry.replace(/^@/, '');
    return normalizedEmail === clean || domain === clean;
  });
}
