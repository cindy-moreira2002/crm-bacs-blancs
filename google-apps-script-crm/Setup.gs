function setupWorkbook() {
  const ss = getSs();
  setupDashboardSheet();
  MDB.PROSPECT_SHEETS.forEach(setupProspectSheet);
  setupTemplatesSheet();
  setupConfigurationSheet();
  setupExclusionSheet();
  setupLogSheet();
  setupFollowupsSheet();
  ss.setActiveSheet(ss.getSheetByName(MDB.SHEETS.DASHBOARD));
}

function setupProspectSheet(name) {
  const sheet = getOrCreateSheet(name);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, 1, MDB.HEADERS.length).setValues([MDB.HEADERS]);
  sheet.getRange(1, 1, 1, MDB.HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff')
    .setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), MDB.HEADERS.length).createFilter();
  sheet.setColumnWidths(1, MDB.HEADERS.length, 150);
  sheet.setColumnWidth(COL.ORGANISATION, 240);
  sheet.setColumnWidth(COL.SOURCE_URL, 240);
  sheet.setColumnWidth(COL.GENERATED_MESSAGE, 420);
  sheet.setColumnWidth(COL.NOTES, 280);
  sheet.getRange(2, COL.COLLECTED_AT, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, COL.FIRST_CONTACT_DATE, sheet.getMaxRows() - 1, 3).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, COL.POTENTIAL_AMOUNT, sheet.getMaxRows() - 1, 1).setNumberFormat('#,##0 €');
  applyConditionalFormatting(sheet);
}

function setupDashboardSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.DASHBOARD);
  sheet.clear();
  sheet.setFrozenRows(1);
  sheet.getRange('A1').setValue('Tableau de bord - Prospection Les Matinées du Bac');
  sheet.getRange('A1:F1').merge().setFontSize(16).setFontWeight('bold').setBackground('#111827').setFontColor('#ffffff');
  sheet.getRange('A3:B18').setValues([
    ['Indicateur', 'Valeur'],
    ['Nombre total de prospects', ''],
    ['Prospects à contacter', ''],
    ['Brouillons créés', ''],
    ['Messages envoyés', ''],
    ['Réponses', ''],
    ['Rendez-vous', ''],
    ['Propositions envoyées', ''],
    ['Partenariats signés', ''],
    ['Taux de réponse', ''],
    ['Taux de rendez-vous', ''],
    ['Valeur potentielle du pipeline', ''],
    ['Prochaines relances', ''],
    ['Prospects prioritaires sans action', ''],
    ['', ''],
    ['Dernière actualisation', '']
  ]);
  sheet.getRange('A3:B3').setFontWeight('bold').setBackground('#e5e7eb');
  sheet.setColumnWidths(1, 6, 210);
}

function setupTemplatesSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.TEMPLATES);
  if (sheet.getLastRow() === 0) sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['Catégorie', 'Type', 'Objet', 'Message', 'Actif']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 5, 220);
  sheet.setColumnWidth(4, 620);
}

function setupConfigurationSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.CONFIG);
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (sheet.getLastRow() === 0) sheet.clear();
  sheet.getRange(1, 1, 1, 3).setValues([['Paramètre', 'Valeur', 'Description']]);
  ensureConfigDefaults(sheet);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 290);
  sheet.setColumnWidth(2, 430);
  sheet.setColumnWidth(3, 520);
  sheet.getRange(2, 2, CONFIG_DEFAULTS.length, 1).setWrap(true);
  sheet.getRange('A1:C' + (CONFIG_DEFAULTS.length + 1)).createFilter();
}

function ensureConfigDefaults(sheet) {
  const existing = sheet.getLastRow() < 2
    ? {}
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().reduce(function (index, row, offset) {
      if (row[0]) index[row[0]] = { rowNumber: offset + 2, values: row };
      return index;
    }, {});
  const rowsToAppend = [];
  CONFIG_DEFAULTS.forEach(function (defaultRow) {
    if (existing[defaultRow[0]]) {
      const current = existing[defaultRow[0]].values;
      if (!current[2]) sheet.getRange(existing[defaultRow[0]].rowNumber, 3).setValue(defaultRow[2]);
    } else {
      rowsToAppend.push(defaultRow);
    }
  });
  if (rowsToAppend.length) sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, 3).setValues(rowsToAppend);
}

function setupExclusionSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.EXCLUSION);
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['E-mail ou domaine', 'Motif', 'Date ajout', 'Source', 'Notes']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#7f1d1d').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 5, 220);
  sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
}

function setupFollowupsSheet() {
  const sheet = getOrCreateSheet(MDB.SHEETS.FOLLOWUPS);
  sheet.clear();
  sheet.getRange(1, 1, 1, 8).setValues([[
    'Onglet',
    'Ligne',
    'Organisation',
    'E-mail',
    'Statut',
    'Date prochaine relance',
    'Nombre de relances',
    'Priorité'
  ]]);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 8, 170);
}

function applyConditionalFormatting(sheet) {
  const rules = [];
  const statusRange = sheet.getRange(2, COL.STATUS, sheet.getMaxRows() - 1, 1);
  const fullRowRange = sheet.getRange(2, 1, sheet.getMaxRows() - 1, MDB.HEADERS.length);
  const priorityRange = sheet.getRange(2, COL.PRIORITY, sheet.getMaxRows() - 1, 1);
  const scoreRange = sheet.getRange(2, COL.SCORE, sheet.getMaxRows() - 1, 1);
  const statusColumn = sheet.getRange(1, COL.STATUS).getA1Notation().replace(/\d/g, '');
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + statusColumn + '2="Envoyé"').setBackground('#dcfce7').setRanges([fullRowRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Prêt à contacter').setBackground('#dcfce7').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Brouillon créé').setBackground('#dbeafe').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Réponse reçue').setBackground('#fef3c7').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Ne plus contacter').setBackground('#fecaca').setFontColor('#7f1d1d').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Haute').setBackground('#fee2e2').setRanges([priorityRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(70).setBackground('#dcfce7').setRanges([scoreRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(40).setBackground('#f3f4f6').setRanges([scoreRange]).build());
  sheet.setConditionalFormatRules(rules);
}

function normalizeAllProspectSchemas() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const result = ensureAllProspectSchemas_();
    applyDataValidations();
    getProspectSheets().forEach(applyConditionalFormatting);
    refreshDashboard();
    SpreadsheetApp.getActive().toast(
      result.rebuiltSheets + ' onglets réalignés, ' + result.toQualify + ' prospects sans e-mail passés à À qualifier.',
      MDB.APP_NAME,
      10
    );
    return result;
  } finally {
    lock.releaseLock();
  }
}

function ensureAllProspectSchemas_() {
  const result = { rebuiltSheets: 0, toQualify: 0 };
  getProspectSheets().forEach(function (sheet) {
    const normalized = normalizeProspectSheetSchema_(sheet);
    result.rebuiltSheets += normalized.rebuilt ? 1 : 0;
    result.toQualify += normalized.toQualify;
  });
  return result;
}

function normalizeProspectSheetSchema_(sheet) {
  const canonical = MDB.HEADERS;
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), canonical.length);
  if (sheet.getMaxColumns() < canonical.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), canonical.length - sheet.getMaxColumns());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headerMap = {};
  headers.forEach(function (header, index) {
    if (header && headerMap[header] === undefined) headerMap[header] = index;
  });
  const schemaMatches = canonical.every(function (header, index) { return headers[index] === header; }) && sheet.getLastColumn() <= canonical.length;
  let rows;
  let rebuilt = false;

  if (schemaMatches) {
    rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, canonical.length).getValues() : [];
  } else {
    const sourceRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
    rows = sourceRows.map(function (source) {
      const target = canonical.map(function (header) {
        return headerMap[header] === undefined ? '' : source[headerMap[header]];
      });
      const email = normalizeText(target[COL.EMAIL - 1]).toLowerCase();
      if (!target[COL.EMAIL_TYPE - 1] && isValidEmail(email)) target[COL.EMAIL_TYPE - 1] = isGenericEmail(email) ? 'générique' : 'nominatif';
      if (!target[COL.EMAIL_VERIFIED - 1]) target[COL.EMAIL_VERIFIED - 1] = 'Non';
      if (!target[COL.FOLLOWUP_COUNT - 1]) target[COL.FOLLOWUP_COUNT - 1] = 0;
      if (!target[COL.DRAFT_CREATED - 1]) target[COL.DRAFT_CREATED - 1] = 'Non';
      if (!target[COL.RESPONSE_RECEIVED - 1]) target[COL.RESPONSE_RECEIVED - 1] = 'Non';
      if (!target[COL.RESULT - 1]) target[COL.RESULT - 1] = 'Aucun';
      if (!target[COL.DO_NOT_CONTACT - 1]) target[COL.DO_NOT_CONTACT - 1] = 'Non';
      return enrichPersonalizationForRow(sheet.getName(), target);
    });
    sheet.getRange(1, 1, lastRow, lastColumn).clearContent().clearDataValidations();
    sheet.getRange(1, 1, 1, canonical.length).setValues([canonical]);
    if (rows.length) sheet.getRange(2, 1, rows.length, canonical.length).setValues(rows);
    if (sheet.getMaxColumns() > canonical.length) sheet.deleteColumns(canonical.length + 1, sheet.getMaxColumns() - canonical.length);
    rebuilt = true;
  }

  let toQualify = 0;
  let statusChanged = false;
  rows.forEach(function (row) {
    if (
      !isValidEmail(row[COL.EMAIL - 1]) &&
      !row[COL.FIRST_CONTACT_DATE - 1] &&
      !row[COL.DRAFT_ID - 1] &&
      normalizeYesNo(row[COL.DO_NOT_CONTACT - 1]) !== 'Oui' &&
      ['Envoyé', 'Réponse reçue', 'Ne plus contacter'].indexOf(row[COL.STATUS - 1]) === -1 &&
      row[COL.STATUS - 1] !== 'À qualifier'
    ) {
      row[COL.STATUS - 1] = 'À qualifier';
      toQualify += 1;
      statusChanged = true;
    }
  });
  if (statusChanged && rows.length) sheet.getRange(2, 1, rows.length, canonical.length).setValues(rows);
  return { rebuilt: rebuilt, toQualify: toQualify };
}

function seedExampleData() {
  const examples = {
    CSE: [
      ['CSE-EXEMPLE-001', 'Entreprise Alpha Exemple', 'CSE', 'Lyon', '69', 'Auvergne-Rhône-Alpes', '1200 salariés', 'https://www.alpha-exemple.invalid', 'https://www.alpha-exemple.invalid/cse', new Date(), 'Camille', 'Durand', 'Secrétaire du CSE', 'contact.cse@alpha-exemple.invalid', '04 00 00 00 00', 'générique', 'Non', '', '', 'CSE avec avantages familles publiés sur le site', 'Haute', '', 'À qualifier', '', '', '', 0, '', '', 'Non', '', 'Non', 'Aucun', 5000, 'Donnée fictive de démonstration.', 'Non']
    ],
    LYCEES_PRIVES: [
      ['LYCEES_PRIVES-EXEMPLE-001', 'Lycée Saint-Exemple', 'Lycée privé', 'Nantes', '44', 'Pays de la Loire', 'Classes de Première et Terminale', 'https://www.saint-exemple.invalid', 'https://www.saint-exemple.invalid/contact', new Date(), 'Alexandre', 'Martin', 'Directeur adjoint', 'direction@saint-exemple.invalid', '02 00 00 00 00', 'générique', 'Non', '', '', 'Page contact établissement uniquement', 'Moyenne', '', 'À qualifier', '', '', '', 0, '', '', 'Non', '', 'Non', 'Aucun', 3000, 'Donnée fictive de démonstration.', 'Non']
    ],
    MAIRIES: [
      ['MAIRIES-EXEMPLE-001', 'Mairie de Ville-Exemple', 'Mairie / collectivité', 'Ville-Exemple', '75', 'Île-de-France', '45 000 habitants', 'https://www.ville-exemple.invalid', 'https://www.ville-exemple.invalid/jeunesse', new Date(), '', '', 'Service jeunesse', 'jeunesse@ville-exemple.invalid', '01 00 00 00 00', 'générique', 'Non', '', '', 'Page service jeunesse de la commune', 'Haute', '', 'À qualifier', '', '', '', 0, '', '', 'Non', '', 'Non', 'Aucun', 8000, 'Donnée fictive de démonstration.', 'Non']
    ]
  };
  Object.keys(examples).forEach(function (sheetName) {
    const sheet = getOrCreateSheet(sheetName);
    if (sheet.getLastRow() < 2) {
      sheet.getRange(2, 1, examples[sheetName].length, MDB.HEADERS.length).setValues(examples[sheetName]);
    }
  });
}
