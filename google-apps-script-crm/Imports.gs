function importCsvToActiveProspectSheet() {
  const ui = SpreadsheetApp.getUi();
  const activeSheet = getSs().getActiveSheet();
  if (!isProspectSheetName(activeSheet.getName())) {
    ui.alert('Placez-vous d’abord sur un onglet de prospection.');
    return;
  }
  const response = ui.prompt('Importer un CSV', 'Collez le contenu CSV. La première ligne peut contenir les en-têtes.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const rows = Utilities.parseCsv(response.getResponseText());
  if (!rows.length) return;
  const dataRows = looksLikeHeader(rows[0]) ? rows.slice(1) : rows;
  appendImportedRows(activeSheet, dataRows);
}

function appendImportedRows(sheet, importedRows) {
  const rows = importedRows.filter(function (row) {
    return row.some(function (cell) { return normalizeText(cell); });
  }).map(function (row, index) {
    const values = new Array(MDB.HEADERS.length).fill('');
    for (let i = 0; i < Math.min(row.length, MDB.HEADERS.length); i += 1) values[i] = row[i];
    values[COL.ID - 1] = values[COL.ID - 1] || makeProspectId(sheet.getName(), sheet.getLastRow() + index + 1);
    values[COL.TYPE_ORG - 1] = values[COL.TYPE_ORG - 1] || MDB.CATEGORY_LABELS[sheet.getName()] || sheet.getName();
    values[COL.COLLECTED_AT - 1] = values[COL.COLLECTED_AT - 1] || new Date();
    values[COL.STATUS - 1] = values[COL.STATUS - 1] || 'À qualifier';
    values[COL.RESULT - 1] = values[COL.RESULT - 1] || 'Aucun';
    values[COL.DRAFT_CREATED - 1] = values[COL.DRAFT_CREATED - 1] || 'Non';
    values[COL.RESPONSE_RECEIVED - 1] = values[COL.RESPONSE_RECEIVED - 1] || 'Non';
    values[COL.DO_NOT_CONTACT - 1] = values[COL.DO_NOT_CONTACT - 1] || 'Non';
    return enrichPersonalizationForRow(sheet.getName(), values);
  });
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MDB.HEADERS.length).setValues(rows);
  writeLog('INFO', 'appendImportedRows', sheet.getName(), '', rows.length + ' lignes importées', '');
}

function looksLikeHeader(row) {
  return row.map(normalizeKey).join('|').indexOf('nom de lorganisation') !== -1 ||
    row.map(normalizeKey).join('|').indexOf('adresse e-mail') !== -1;
}

function importPublicDataArchitecture() {
  SpreadsheetApp.getUi().alert(
    'Architecture prévue',
    'Le MVP prévoit l’import de données publiques via CSV ou via une fonction dédiée par source officielle. ' +
    'Ajoutez une fonction qui transforme la source en lignes au format du CRM, puis appelez appendImportedRows(sheet, rows). ' +
    'Le script ne scrape pas LinkedIn, ne contourne aucune protection et ne valide jamais automatiquement une information sensible.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function exportProspects() {
  const config = getConfigMap();
  const lines = [MDB.HEADERS.join(',')];
  getProspectSheets().forEach(function (sheet) {
    getProspectRows(sheet).forEach(function (row) {
      lines.push(row.map(csvEscape).join(','));
    });
  });
  const blob = Utilities.newBlob(lines.join('\n'), 'text/csv', 'export-prospects-mdb-' + formatDate(new Date()) + '.csv');
  const folderId = parseDriveId(config['Dossier Drive destiné aux exports']);
  const file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);
  writeLog('INFO', 'exportProspects', '', '', 'Export créé', file.getUrl());
  SpreadsheetApp.getUi().alert('Export créé : ' + file.getUrl());
}

function csvEscape(value) {
  const text = value instanceof Date ? formatDate(value) : String(value || '');
  return '"' + text.replace(/"/g, '""') + '"';
}
