function setupLogSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.LOG);
  const headers = ['Horodatage', 'Niveau', 'Fonction', 'Onglet', 'Ligne', 'Message', 'Détails'];
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function writeLog(level, functionName, sheetName, rowNumber, message, details) {
  const sheet = getOrCreateSheet(MDB.SHEETS.LOG);
  if (sheet.getLastRow() === 0) setupLogSheet();
  sheet.appendRow([new Date(), level, functionName, sheetName, rowNumber, message, details || '']);
}
