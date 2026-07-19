/**
 * CRM Prospection - Les Matinees du Bac
 * Version tout-en-un pour Apps Script.
 * Collez tout ce fichier dans Code.gs, puis lancez initializeCrm().
 * Le script cree uniquement des brouillons Gmail, jamais d'envoi automatique.
 */


// ============================================================
// Config.gs
// ============================================================

const MDB = {
  APP_NAME: 'Prospection MDB',
  TIMEZONE: 'Europe/Paris',
  SHEETS: {
    DASHBOARD: 'TABLEAU_DE_BORD',
    TEMPLATES: 'TEMPLATES',
    CONFIG: 'CONFIGURATION',
    EXCLUSION: 'LISTE_EXCLUSION',
    LOG: 'JOURNAL_ACTIONS',
    FOLLOWUPS: 'RELANCES_DU_JOUR'
  },
  PROSPECT_SHEETS: [
    'CSE',
    'LYCEES_PRIVES',
    'LYCEES_PUBLICS',
    'MAIRIES',
    'ASSOCIATIONS_PARENTS',
    'ASSOCIATIONS_EDUCATIVES'
  ],
  CATEGORY_LABELS: {
    CSE: 'CSE',
    LYCEES_PRIVES: 'Lycée privé',
    LYCEES_PUBLICS: 'Lycée public',
    MAIRIES: 'Mairie / collectivité',
    ASSOCIATIONS_PARENTS: 'Association de parents',
    ASSOCIATIONS_EDUCATIVES: 'Association éducative'
  },
  HEADERS: [
    'ID prospect',
    'Nom de l’organisation',
    'Type d’organisation',
    'Ville',
    'Département',
    'Région',
    'Taille ou nombre potentiel de bénéficiaires',
    'Site Internet',
    'URL de la source',
    'Date de collecte',
    'Prénom du contact',
    'Nom du contact',
    'Fonction',
    'Adresse e-mail',
    'Téléphone',
    'Type d’e-mail : générique ou nominatif',
    'E-mail vérifié manuellement : Oui/Non',
    'Angle de prospection recommandé',
    'Offre recommandée',
    'Élément de personnalisation',
    'Niveau de priorité : Haute/Moyenne/Basse',
    'Score du prospect sur 100',
    'Statut',
    'Date du premier contact',
    'Date de la dernière action',
    'Date de prochaine relance',
    'Nombre de relances',
    'Objet généré',
    'Message généré',
    'Brouillon Gmail créé : Oui/Non',
    'ID du brouillon Gmail',
    'Réponse reçue : Oui/Non',
    'Résultat',
    'Montant potentiel',
    'Notes',
    'Ne plus contacter : Oui/Non'
  ],
  STATUSES: [
    'À rechercher',
    'À qualifier',
    'Prêt à contacter',
    'Brouillon créé',
    'Envoyé',
    'Relance 1 à préparer',
    'Relance 2 à préparer',
    'Réponse reçue',
    'Rendez-vous obtenu',
    'Proposition envoyée',
    'Partenariat signé',
    'Refus',
    'Sans réponse',
    'Ne plus contacter'
  ],
  RESULTS: [
    'Aucun',
    'Demande d’informations',
    'Rendez-vous',
    'Pilote envisagé',
    'Devis demandé',
    'Partenariat signé',
    'Pas intéressé',
    'Mauvais interlocuteur',
    'À recontacter plus tard'
  ],
  PRIORITIES: ['Haute', 'Moyenne', 'Basse'],
  YES_NO: ['Oui', 'Non'],
  EMAIL_TYPES: ['générique', 'nominatif'],
  TEMPLATE_TYPES: ['PREMIER_CONTACT', 'RELANCE_1', 'RELANCE_2']
};

const CONFIG_DEFAULTS = [
  ['Nom de l’expéditrice', 'Cindy Moreira', 'Nom affiché dans les brouillons Gmail.'],
  ['Fonction', 'Fondatrice', 'Fonction utilisée dans la signature si besoin.'],
  ['Nom du projet', 'Les Matinées du Bac', 'Nom du dispositif.'],
  ['Adresse e-mail', '', 'Adresse professionnelle de contact.'],
  ['Numéro de téléphone', '', 'Téléphone à inclure dans les messages.'],
  ['URL du site', '', 'Site officiel du projet.'],
  ['URL de la brochure PDF', '', 'Lien public ou Drive vers la brochure.'],
  ['URL d’un exemple de correction', '', 'Lien vers un exemple de correction.'],
  ['URL de prise de rendez-vous', '', 'Lien Calendly, Google Calendar ou équivalent.'],
  ['Tarif public indicatif', '', 'Tarif affichable si utile.'],
  ['Tarif pilote indicatif', '', 'Tarif pilote si utile.'],
  ['Nombre maximal de brouillons par traitement', '20', 'Limite de sécurité par lancement.'],
  ['Nombre de jours avant relance 1', '5', 'Jours ouvrés après le premier contact.'],
  ['Nombre de jours avant relance 2', '8', 'Jours ouvrés après la relance 1.'],
  ['Signature e-mail', 'Cordialement,\nCindy Moreira\nLes Matinées du Bac', 'Signature libre.'],
  ['Phrase de désinscription', 'Ce message vous est adressé dans le cadre de vos fonctions professionnelles. Vous pouvez simplement me répondre que vous ne souhaitez plus être contacté(e).', 'Mention ajoutée aux modèles.'],
  ['Dossier Drive destiné aux exports', '', 'URL ou ID du dossier Drive. Laisser vide pour Mon Drive.'],
  ['Mode test : Oui/Non', 'Oui', 'Oui = les brouillons sont adressés à l’adresse de test.'],
  ['Adresse e-mail de test', '', 'Adresse qui reçoit les brouillons en mode test.']
];

const COL = {
  ID: 1,
  ORGANISATION: 2,
  TYPE_ORG: 3,
  CITY: 4,
  DEPARTMENT: 5,
  REGION: 6,
  SIZE: 7,
  WEBSITE: 8,
  SOURCE_URL: 9,
  COLLECTED_AT: 10,
  FIRST_NAME: 11,
  LAST_NAME: 12,
  ROLE: 13,
  EMAIL: 14,
  PHONE: 15,
  EMAIL_TYPE: 16,
  EMAIL_VERIFIED: 17,
  ANGLE: 18,
  OFFER: 19,
  PERSONALIZATION: 20,
  PRIORITY: 21,
  SCORE: 22,
  STATUS: 23,
  FIRST_CONTACT_DATE: 24,
  LAST_ACTION_DATE: 25,
  NEXT_FOLLOWUP_DATE: 26,
  FOLLOWUP_COUNT: 27,
  GENERATED_SUBJECT: 28,
  GENERATED_MESSAGE: 29,
  DRAFT_CREATED: 30,
  DRAFT_ID: 31,
  RESPONSE_RECEIVED: 32,
  RESULT: 33,
  POTENTIAL_AMOUNT: 34,
  NOTES: 35,
  DO_NOT_CONTACT: 36
};


// ============================================================
// Utils.gs
// ============================================================

function getSs() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(name) {
  const ss = getSs();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function isProspectSheetName(name) {
  return MDB.PROSPECT_SHEETS.indexOf(name) !== -1;
}

function getProspectSheets() {
  const ss = getSs();
  return MDB.PROSPECT_SHEETS.map(function (name) { return ss.getSheetByName(name); }).filter(Boolean);
}

function getLastDataRow(sheet) {
  return Math.max(sheet.getLastRow(), 1);
}

function getProspectRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, MDB.HEADERS.length).getValues();
}

function setRowValues(sheet, rowNumber, values) {
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([values]);
}

function getConfigMap() {
  const sheet = getOrCreateSheet(MDB.SHEETS.CONFIG);
  const rows = sheet.getDataRange().getValues();
  const config = {};
  rows.slice(1).forEach(function (row) {
    if (row[0]) config[String(row[0]).trim()] = row[1];
  });
  return config;
}

function getConfigValue(name, fallback) {
  const value = getConfigMap()[name];
  return value === '' || value === undefined || value === null ? fallback : value;
}

function isTestMode() {
  return normalizeYesNo(getConfigValue('Mode test : Oui/Non', 'Oui')) === 'Oui';
}

function normalizeYesNo(value) {
  return String(value || '').trim().toLowerCase() === 'oui' ? 'Oui' : 'Non';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeDomain(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return '';
  const withoutProtocol = text.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return withoutProtocol.split('/')[0].split('?')[0].trim();
}

function normalizeFrenchPhone(value) {
  let phone = String(value || '').replace(/[^\d+]/g, '');
  if (!phone) return '';
  if (phone.indexOf('+33') === 0) phone = '0' + phone.slice(3);
  if (phone.indexOf('0033') === 0) phone = '0' + phone.slice(4);
  if (/^0\d{9}$/.test(phone)) return phone.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return String(value || '').trim();
}

function isValidEmail(email) {
  const text = normalizeText(email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text);
}

function isGenericEmail(email) {
  const local = normalizeText(email).toLowerCase().split('@')[0] || '';
  return /^(contact|info|accueil|secretariat|secrétariat|direction|administration|mairie|cse|ce|service|education|jeunesse|partenariat|partenariats|association|bureau)$/.test(local);
}

function today() {
  return new Date();
}

function formatDate(date) {
  if (!date) return '';
  return Utilities.formatDate(new Date(date), MDB.TIMEZONE, 'yyyy-MM-dd');
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < Number(days || 0)) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return result;
}

function rowToObject(row) {
  return {
    id: row[COL.ID - 1],
    organisation: row[COL.ORGANISATION - 1],
    typeOrg: row[COL.TYPE_ORG - 1],
    city: row[COL.CITY - 1],
    department: row[COL.DEPARTMENT - 1],
    region: row[COL.REGION - 1],
    size: row[COL.SIZE - 1],
    website: row[COL.WEBSITE - 1],
    sourceUrl: row[COL.SOURCE_URL - 1],
    collectedAt: row[COL.COLLECTED_AT - 1],
    firstName: row[COL.FIRST_NAME - 1],
    lastName: row[COL.LAST_NAME - 1],
    role: row[COL.ROLE - 1],
    email: row[COL.EMAIL - 1],
    phone: row[COL.PHONE - 1],
    emailType: row[COL.EMAIL_TYPE - 1],
    emailVerified: row[COL.EMAIL_VERIFIED - 1],
    angle: row[COL.ANGLE - 1],
    offer: row[COL.OFFER - 1],
    personalization: row[COL.PERSONALIZATION - 1],
    priority: row[COL.PRIORITY - 1],
    score: row[COL.SCORE - 1],
    status: row[COL.STATUS - 1],
    firstContactDate: row[COL.FIRST_CONTACT_DATE - 1],
    lastActionDate: row[COL.LAST_ACTION_DATE - 1],
    nextFollowupDate: row[COL.NEXT_FOLLOWUP_DATE - 1],
    followupCount: Number(row[COL.FOLLOWUP_COUNT - 1] || 0),
    subject: row[COL.GENERATED_SUBJECT - 1],
    message: row[COL.GENERATED_MESSAGE - 1],
    draftCreated: row[COL.DRAFT_CREATED - 1],
    draftId: row[COL.DRAFT_ID - 1],
    responseReceived: row[COL.RESPONSE_RECEIVED - 1],
    result: row[COL.RESULT - 1],
    potentialAmount: row[COL.POTENTIAL_AMOUNT - 1],
    notes: row[COL.NOTES - 1],
    doNotContact: row[COL.DO_NOT_CONTACT - 1]
  };
}

function makeProspectId(sheetName, rowNumber) {
  const stamp = Utilities.formatDate(new Date(), MDB.TIMEZONE, 'yyyyMMddHHmmss');
  return sheetName + '-' + stamp + '-' + rowNumber;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function parseDriveId(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const match = text.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

function stack(error) {
  return error && error.stack ? error.stack : String(error);
}


// ============================================================
// Logging.gs
// ============================================================

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


// ============================================================
// DataValidation.gs
// ============================================================

function applyDataValidations() {
  MDB.PROSPECT_SHEETS.forEach(function (name) {
    const sheet = getOrCreateSheet(name);
    const maxRows = sheet.getMaxRows() - 1;
    setListValidation(sheet.getRange(2, COL.STATUS, maxRows, 1), MDB.STATUSES);
    setListValidation(sheet.getRange(2, COL.RESULT, maxRows, 1), MDB.RESULTS);
    setListValidation(sheet.getRange(2, COL.PRIORITY, maxRows, 1), MDB.PRIORITIES);
    setListValidation(sheet.getRange(2, COL.EMAIL_VERIFIED, maxRows, 1), MDB.YES_NO);
    setListValidation(sheet.getRange(2, COL.DO_NOT_CONTACT, maxRows, 1), MDB.YES_NO);
    setListValidation(sheet.getRange(2, COL.DRAFT_CREATED, maxRows, 1), MDB.YES_NO);
    setListValidation(sheet.getRange(2, COL.RESPONSE_RECEIVED, maxRows, 1), MDB.YES_NO);
    setListValidation(sheet.getRange(2, COL.EMAIL_TYPE, maxRows, 1), MDB.EMAIL_TYPES);
  });
  const config = getOrCreateSheet(MDB.SHEETS.CONFIG);
  const rows = config.getRange(1, 1, Math.max(config.getLastRow(), 1), 1).getValues().flat();
  const modeIndex = rows.indexOf('Mode test : Oui/Non') + 1;
  if (modeIndex > 0) setListValidation(config.getRange(modeIndex, 2), MDB.YES_NO);
}

function setListValidation(range, values) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}


// ============================================================
// Setup.gs
// ============================================================

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


// ============================================================
// Templates.gs
// ============================================================

function seedTemplates() {
  const sheet = getOrCreateSheet(MDB.SHEETS.TEMPLATES);
  const existingKeys = sheet.getLastRow() < 2
    ? {}
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().reduce(function (index, row) {
      index[normalizeKey(row[0]) + '|' + normalizeKey(row[1])] = true;
      return index;
    }, {});
  const rows = DEFAULT_TEMPLATES.map(function (template) {
    return [template.category, template.type, template.subject, template.body, 'Oui'];
  }).filter(function (row) {
    return !existingKeys[normalizeKey(row[0]) + '|' + normalizeKey(row[1])];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows).setWrap(true);
}

function getTemplate(category, type) {
  const sheet = getOrCreateSheet(MDB.SHEETS.TEMPLATES);
  const rows = sheet.getDataRange().getValues().slice(1);
  const normalizedCategory = normalizeKey(category);
  const normalizedType = normalizeKey(type);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (
      normalizeKey(row[0]) === normalizedCategory &&
      normalizeKey(row[1]) === normalizedType &&
      normalizeYesNo(row[4]) === 'Oui'
    ) {
      return { subject: row[2], body: row[3] };
    }
  }
  return null;
}

function renderTemplate(text, prospect, config) {
  const variables = buildVariables(prospect, config);
  const missing = [];
  const optionalVariables = [
    'telephone',
    'site_url',
    'brochure_url',
    'exemple_correction_url',
    'calendrier_url',
    'phrase_desinscription'
  ];
  const withoutEmptyOptionalLines = String(text || '').split('\n').filter(function (line) {
    return !optionalVariables.some(function (name) {
      return line.indexOf('{{' + name + '}}') !== -1 && !normalizeText(variables[name]);
    });
  }).join('\n');
  const rendered = withoutEmptyOptionalLines.replace(/\{\{([^}]+)\}\}/g, function (_, rawName) {
    const name = String(rawName).trim();
    const value = variables[name];
    if (value === undefined || value === null || value === '') {
      missing.push(name);
      return '';
    }
    return value;
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text: rendered, missing: missing.filter(uniqueOnly) };
}

function hasUnresolvedPlaceholders(text) {
  return /\{\{[^}]+\}\}|\[\s*[ÀA]\s+RENSEIGNER\s*:/i.test(String(text || ''));
}

function buildVariables(prospect, config) {
  return {
    prenom_contact: prospect.firstName || 'Madame, Monsieur',
    nom_contact: prospect.lastName || '',
    fonction: prospect.role || '',
    organisation: prospect.organisation || 'votre organisation',
    ville: prospect.city || 'votre territoire',
    element_personnalisation: prospect.personalization || 'les informations publiquement disponibles sur votre site',
    offre_recommandee: prospect.offer || 'une première session pilote',
    nom_expediteur: config['Nom de l’expéditrice'] || 'Cindy Moreira',
    telephone: config['Numéro de téléphone'] || '',
    site_url: config['URL du site'] || '',
    brochure_url: config['URL de la brochure PDF'] || '',
    exemple_correction_url: config['URL d’un exemple de correction'] || '',
    calendrier_url: config['URL de prise de rendez-vous'] || '',
    phrase_desinscription: config['Phrase de désinscription'] || ''
  };
}

const DEFAULT_TEMPLATES = [
  {
    category: 'CSE',
    type: 'PREMIER_CONTACT',
    subject: 'Une offre de préparation au bac pour les enfants de vos salariés',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de vous contacter au sujet des avantages proposés aux familles de {{organisation}}.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence pour les élèves de Première et de Terminale : épreuve en conditions réelles, accompagnement en direct, correction individualisée et dossier personnel de progression.\n\nLe CSE peut financer des places, participer au prix ou proposer un tarif partenaire aux salariés.\n\nNous prenons en charge les inscriptions, l’organisation des sessions et la remise des corrections.\n\nVoici une présentation du dispositif : {{brochure_url}}\n\nSeriez-vous disponible pour un court échange afin d’étudier une première opération pilote ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'CSE',
    type: 'RELANCE_1',
    subject: 'Re: Une offre de préparation au bac pour les enfants de vos salariés',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant les bacs blancs en visioconférence proposés aux enfants de salariés.\n\nPlusieurs formats sont possibles : places financées, participation du CSE ou tarif négocié sans engagement important.\n\nVoici la présentation : {{brochure_url}}\n\nEst-ce un sujet qui pourrait intéresser votre CSE cette année ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'CSE',
    type: 'RELANCE_2',
    subject: 'Dernier message - préparation au bac pour les familles',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant notre proposition de bacs blancs accompagnés pour les enfants de salariés.\n\nJe peux vous transmettre une proposition pilote très simple, adaptée au nombre de familles potentiellement concernées.\n\nDans le cas contraire, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'PREMIER_CONTACT',
    subject: 'Proposition de session pilote de bac blanc pour vos élèves',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif de bacs blancs en visioconférence pour les élèves de Première et de Terminale.\n\nChaque élève réalise une épreuve en conditions réelles et reçoit ensuite une correction détaillée, une grille d’évaluation et un dossier personnel de progression.\n\nLe dispositif peut prendre la forme d’une session dédiée à votre établissement, d’un pack de places, d’un tarif négocié proposé aux familles ou de places financées pour certains élèves.\n\nNous gérons les inscriptions, l’encadrement, les corrections et le suivi administratif.\n\nPrésentation : {{brochure_url}}\n\nSerait-il possible d’échanger brièvement sur une première session pilote ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'RELANCE_1',
    subject: 'Re: Proposition de session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous au sujet de notre proposition de bac blanc accompagné en visioconférence.\n\nL’objectif n’est pas de remplacer les entraînements organisés par l’établissement, mais de proposer une session complémentaire avec correction individualisée et bilan personnel pour chaque élève.\n\nVoici un exemple de correction : {{exemple_correction_url}}\n\nLa proposition peut-elle être transmise à la direction pédagogique ou à l’association de parents ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'RELANCE_2',
    subject: 'Dernier message - session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets un dernier message au sujet d’une éventuelle session pilote pour vos élèves de Première ou de Terminale.\n\nSi le sujet n’est pas prioritaire, je peux aussi vous recontacter à une période plus adaptée.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'PREMIER_CONTACT',
    subject: 'Dispositif complémentaire de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif de préparation aux épreuves du baccalauréat organisé en visioconférence.\n\nLes élèves réalisent une épreuve complète en conditions réelles et bénéficient d’une correction individualisée, d’une grille d’évaluation et de conseils de progression.\n\nUne session peut être organisée pour un groupe d’élèves de l’établissement ou financée dans le cadre d’une action éducative ou d’un partenariat.\n\nNous pouvons commencer par une opération pilote limitée.\n\nPrésentation : {{brochure_url}}\n\nPourriez-vous m’indiquer la personne chargée des actions de préparation aux examens ou des partenariats éducatifs ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'RELANCE_1',
    subject: 'Re: Dispositif complémentaire de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant notre proposition de bac blanc accompagné.\n\nLe dispositif peut concerner un groupe réduit d’élèves et inclure un bilan anonymisé des principales difficultés observées.\n\nPourriez-vous me préciser si cette proposition doit être adressée à la direction, au service de gestion ou à un professeur coordonnateur ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'RELANCE_2',
    subject: 'Dernier message - préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant cette proposition de session pilote de bac blanc accompagné.\n\nSi le sujet ne relève pas de votre service, pourriez-vous simplement m’indiquer le bon interlocuteur ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'PREMIER_CONTACT',
    subject: 'Une action locale de préparation au bac pour les lycéens de {{ville}}',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter une action pouvant être proposée aux lycéens de {{ville}}.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence comprenant une épreuve complète, un accompagnement en direct et une correction individualisée.\n\nLa commune peut notamment financer des places pour les jeunes de son territoire, réserver des places aux familles rencontrant des difficultés, organiser une session dédiée ou intégrer l’action à un dispositif jeunesse ou de réussite éducative.\n\nNous prenons en charge l’organisation, les inscriptions et les corrections.\n\nPrésentation : {{brochure_url}}\n\nPourriez-vous m’indiquer si cette proposition relève de votre service jeunesse, éducation ou politique de la ville ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'RELANCE_1',
    subject: 'Re: Action locale de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous concernant la possibilité de proposer des bacs blancs accompagnés aux lycéens de {{ville}}.\n\nUne première action peut être organisée avec un nombre limité de places afin d’évaluer l’intérêt et la participation.\n\nEst-ce un dispositif que je peux présenter à votre service jeunesse ou éducation ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'RELANCE_2',
    subject: 'Dernier message - action locale de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets un dernier message au sujet d’une action locale de préparation au bac pour les lycéens de {{ville}}.\n\nSi ce sujet n’est pas adapté, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'PREMIER_CONTACT',
    subject: 'Un partenariat de préparation au bac pour vos familles',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte au sujet des actions proposées par {{organisation}} aux familles.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence avec accompagnement en direct, correction individualisée et dossier personnel de progression.\n\nVotre association pourrait proposer un tarif négocié à ses adhérents, une session réservée aux élèves de l’établissement, un pack de places, quelques places solidaires ou un simple code partenaire sans engagement financier.\n\nPrésentation : {{brochure_url}}\n\nSeriez-vous disponible pour un court échange sur le format le plus adapté à vos familles ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'RELANCE_1',
    subject: 'Re: Partenariat de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant notre proposition destinée aux élèves de Première et Terminale.\n\nLe partenariat peut être très simple : un tarif réservé aux familles, sans achat préalable ni engagement financier de l’association.\n\nPuis-je vous transmettre un exemple concret de fonctionnement et de tarif ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'RELANCE_2',
    subject: 'Dernier message - partenariat de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant la possibilité de proposer un tarif ou une session dédiée aux familles de {{organisation}}.\n\nJe peux vous envoyer une proposition très courte si cela peut être utile.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'PREMIER_CONTACT',
    subject: 'Des bacs blancs accompagnés pour les jeunes que vous suivez',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif pouvant compléter l’accompagnement scolaire proposé par {{organisation}}.\n\nLes élèves réalisent une épreuve complète en conditions réelles puis reçoivent une correction détaillée et un plan personnel de progression.\n\nDes places peuvent être financées par l’association, un partenaire ou un mécène, notamment pour des élèves n’ayant pas accès à un accompagnement privé.\n\nPrésentation : {{brochure_url}}\n\nSeriez-vous disponible pour étudier une première session pilote destinée à un petit groupe de jeunes ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'RELANCE_1',
    subject: 'Re: Bacs blancs accompagnés pour les jeunes suivis',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous au sujet d’une session pilote de bacs blancs accompagnés pour les jeunes suivis par {{organisation}}.\n\nLe format peut rester limité au départ, avec un petit groupe et un bilan de progression individuel pour chaque élève.\n\nPensez-vous que cette proposition puisse compléter vos actions d’accompagnement scolaire ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'RELANCE_2',
    subject: 'Dernier message - session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant la possibilité d’une session pilote pour les jeunes accompagnés par {{organisation}}.\n\nSi le sujet n’est pas adapté, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  }
];


// ============================================================
// Personalization.gs
// ============================================================

function enrichPersonalizationForRow(sheetName, row) {
  const category = sheetName;
  if (!row[COL.TYPE_ORG - 1]) row[COL.TYPE_ORG - 1] = MDB.CATEGORY_LABELS[category] || category;
  if (!row[COL.ANGLE - 1]) row[COL.ANGLE - 1] = getRecommendedAngle(category);
  if (!row[COL.OFFER - 1]) row[COL.OFFER - 1] = getRecommendedOffer(category, row);
  if (!row[COL.PERSONALIZATION - 1]) row[COL.PERSONALIZATION - 1] = getNeutralPersonalization(category, row);
  return row;
}

function getRecommendedAngle(category) {
  const angles = {
    CSE: 'Soutien à la parentalité et avantage concret destiné aux enfants des salariés.',
    LYCEES_PRIVES: 'Session complémentaire permettant aux élèves de s’entraîner et d’obtenir une correction individualisée.',
    LYCEES_PUBLICS: 'Dispositif complémentaire pouvant être proposé dans le cadre d’un pilote, d’un partenariat ou d’une action financée.',
    MAIRIES: 'Action éducative locale et accessible pouvant soutenir les lycéens de la commune.',
    ASSOCIATIONS_PARENTS: 'Tarif négocié, session dédiée ou places financées pour les adhérents.',
    ASSOCIATIONS_EDUCATIVES: 'Outil de préparation aux examens pouvant compléter l’accompagnement déjà proposé aux jeunes.'
  };
  return angles[category] || 'Proposition de session pilote adaptée au public concerné.';
}

function getRecommendedOffer(category, row) {
  if (category === 'CSE') return 'places financées, participation du CSE ou tarif partenaire';
  if (category === 'LYCEES_PRIVES') return 'Sessions complémentaires avec correction individualisée et bilan personnel : session dédiée, pack de places, tarif négocié, places financées ou partenariat de communication.';
  if (category === 'LYCEES_PUBLICS') return 'session pilote ou action financée pour un groupe d’élèves';
  if (category === 'MAIRIES') return 'places financées, session dédiée ou action jeunesse locale';
  if (category === 'ASSOCIATIONS_PARENTS') return 'tarif négocié, code partenaire, pack de places ou places solidaires';
  if (category === 'ASSOCIATIONS_EDUCATIVES') return 'session pilote avec places financées pour un petit groupe';
  return 'première session pilote';
}

function getNeutralPersonalization(category, row) {
  const organisation = row[COL.ORGANISATION - 1] || 'l’organisation';
  const city = row[COL.CITY - 1] || '';
  if (category === 'MAIRIES' && city) return 'Action proposée aux lycéens de ' + city + '.';
  if (category === 'CSE') return 'Approche centrée sur les familles de salariés de ' + organisation + '.';
  if (category === 'LYCEES_PRIVES' || category === 'LYCEES_PUBLICS') return 'Proposition complémentaire pour les élèves de Première et Terminale.';
  if (category === 'ASSOCIATIONS_PARENTS') return 'Proposition destinée aux familles adhérentes ou aux parents d’élèves.';
  if (category === 'ASSOCIATIONS_EDUCATIVES') return 'Proposition complémentaire pour les jeunes accompagnés.';
  return 'Personnalisation neutre à partir des informations publiques disponibles.';
}


// ============================================================
// Scoring.gs
// ============================================================

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


// ============================================================
// Deduplication.gs
// ============================================================

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


// ============================================================
// Imports.gs
// ============================================================

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


// ============================================================
// GmailDrafts.gs
// ============================================================

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


// ============================================================
// FollowUps.gs
// ============================================================

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


// ============================================================
// GmailTracking.gs
// ============================================================

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


// ============================================================
// Dashboard.gs
// ============================================================

function refreshDashboard() {
  const sheet = getOrCreateSheet(MDB.SHEETS.DASHBOARD);
  if (sheet.getLastRow() < 3) setupDashboardSheet();
  const metrics = collectDashboardMetrics();
  sheet.getRange('B4:B18').setValues([
    [metrics.total],
    [metrics.ready],
    [metrics.drafts],
    [metrics.sent],
    [metrics.responses],
    [metrics.meetings],
    [metrics.proposals],
    [metrics.signed],
    [metrics.sent ? metrics.responses / metrics.sent : 0],
    [metrics.sent ? metrics.meetings / metrics.sent : 0],
    [metrics.pipeline],
    [metrics.followupsDue],
    [metrics.highPriorityNoAction],
    [''],
    [new Date()]
  ]);
  sheet.getRange('B4:B11').setNumberFormat('0');
  sheet.getRange('B12:B13').setNumberFormat('0.0%');
  sheet.getRange('B14').setNumberFormat('#,##0 €');
  sheet.getRange('B15:B16').setNumberFormat('0');
  sheet.getRange('B18').setNumberFormat('yyyy-mm-dd hh:mm');
  writeCategoryTable(sheet, metrics.byCategory);
  writeStatusTable(sheet, metrics.byStatus);
  rebuildDashboardCharts(sheet);
  refreshFollowupsDueView();
}

function collectDashboardMetrics() {
  const metrics = {
    total: 0,
    ready: 0,
    drafts: 0,
    sent: 0,
    responses: 0,
    meetings: 0,
    proposals: 0,
    signed: 0,
    pipeline: 0,
    followupsDue: 0,
    highPriorityNoAction: 0,
    byCategory: {},
    byStatus: {}
  };
  getProspectSheets().forEach(function (sheet) {
    const name = sheet.getName();
    metrics.byCategory[name] = 0;
    getProspectRows(sheet).forEach(function (row) {
      const prospect = rowToObject(row);
      metrics.total += 1;
      metrics.byCategory[name] += 1;
      const status = prospect.status || 'Sans statut';
      metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
      if (status === 'Prêt à contacter') metrics.ready += 1;
      if (status === 'Brouillon créé') metrics.drafts += 1;
      if (status === 'Envoyé') metrics.sent += 1;
      if (normalizeYesNo(prospect.responseReceived) === 'Oui' || status === 'Réponse reçue') metrics.responses += 1;
      if (status === 'Rendez-vous obtenu' || prospect.result === 'Rendez-vous') metrics.meetings += 1;
      if (status === 'Proposition envoyée') metrics.proposals += 1;
      if (status === 'Partenariat signé' || prospect.result === 'Partenariat signé') metrics.signed += 1;
      metrics.pipeline += Number(prospect.potentialAmount || 0);
      if (isFollowupDue(prospect, [])) metrics.followupsDue += 1;
      if (prospect.priority === 'Haute' && !prospect.lastActionDate && normalizeYesNo(prospect.doNotContact) !== 'Oui') metrics.highPriorityNoAction += 1;
    });
  });
  return metrics;
}

function writeCategoryTable(sheet, byCategory) {
  const rows = Object.keys(byCategory).map(function (name) {
    return [name, byCategory[name]];
  });
  sheet.getRange('D3:E3').setValues([['Catégorie', 'Prospects']]).setFontWeight('bold').setBackground('#e5e7eb');
  sheet.getRange('D4:E20').clearContent();
  if (rows.length) sheet.getRange(4, 4, rows.length, 2).setValues(rows);
}

function writeStatusTable(sheet, byStatus) {
  const rows = Object.keys(byStatus).sort().map(function (name) {
    return [name, byStatus[name]];
  });
  sheet.getRange('G3:H3').setValues([['Statut', 'Prospects']]).setFontWeight('bold').setBackground('#e5e7eb');
  sheet.getRange('G4:H30').clearContent();
  if (rows.length) sheet.getRange(4, 7, rows.length, 2).setValues(rows);
}

function rebuildDashboardCharts(sheet) {
  sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });
  const categoryChart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('D3:E' + Math.max(4, 3 + MDB.PROSPECT_SHEETS.length)))
    .setPosition(21, 1, 0, 0)
    .setOption('title', 'Prospects par catégorie')
    .setOption('legend', { position: 'none' })
    .build();
  sheet.insertChart(categoryChart);
  const statusCount = sheet.getRange('G4:G30').getDisplayValues().filter(function (row) { return row[0] !== ''; }).length;
  const statusLastRow = Math.max(4, 3 + statusCount);
  const statusChart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('G3:H' + statusLastRow))
    .setPosition(21, 7, 0, 0)
    .setOption('title', 'Répartition par statut')
    .build();
  sheet.insertChart(statusChart);
}

function refreshFollowupsDueView() {
  const rows = [];
  getProspectSheets().forEach(function (sheet) {
    getProspectRows(sheet).forEach(function (row, index) {
      const prospect = rowToObject(row);
      if (isFollowupDue(prospect, [])) {
        rows.push([sheet.getName(), index + 2, prospect.organisation, prospect.email, prospect.status, prospect.nextFollowupDate, prospect.followupCount, prospect.priority]);
      }
    });
  });
  refreshFollowupsSheet(rows);
}


// ============================================================
// PublicData.gs
// ============================================================

function findPublicHintsForActiveProspect() {
  const sheet = getSs().getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (!isProspectSheetName(sheet.getName()) || rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Sélectionnez une ligne prospect.');
    return;
  }
  const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
  const website = normalizeText(row[COL.WEBSITE - 1]);
  if (!website) {
    SpreadsheetApp.getUi().alert('Aucun site officiel renseigné.');
    return;
  }
  const hints = findPublicHintsFromWebsite(website);
  row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], hints.length ? 'Pistes publiques à vérifier manuellement :\n' + hints.join('\n') : 'Aucune piste publique évidente trouvée sur le site officiel.');
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([row]);
  writeLog('INFO', 'findPublicHintsForActiveProspect', sheet.getName(), rowNumber, 'Pistes publiques proposées', hints.join(' | '));
}

function findPublicHintsFromWebsite(website) {
  const base = website.indexOf('http') === 0 ? website : 'https://' + website;
  const domain = normalizeDomain(base);
  const paths = ['', '/contact', '/contacts', '/equipe', '/équipe', '/direction', '/cse', '/education', '/jeunesse', '/partenariats', '/association-de-parents'];
  const hints = [];
  paths.forEach(function (path) {
    if (hints.length >= 20) return;
    const url = base.replace(/\/$/, '') + path;
    try {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 Apps Script CRM MDB' }
      });
      const code = response.getResponseCode();
      if (code < 200 || code >= 400) return;
      const html = response.getContentText().slice(0, 120000);
      extractPublicHints(html, url, domain).forEach(function (hint) {
        if (hints.indexOf(hint) === -1 && hints.length < 20) hints.push(hint);
      });
    } catch (error) {
      writeLog('WARN', 'findPublicHintsFromWebsite', '', '', 'Page non accessible', url + ' - ' + error);
    }
  });
  return hints;
}

function extractPublicHints(html, url, domain) {
  const hints = [];
  const mailMatches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  mailMatches.forEach(function (email) {
    if (normalizeDomain(email.split('@')[1]) === domain || email.toLowerCase().indexOf(domain) !== -1) {
      hints.push('E-mail public possible (' + url + ') : ' + email.toLowerCase());
    }
  });
  const telMatches = html.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g) || [];
  telMatches.forEach(function (phone) {
    hints.push('Téléphone public possible (' + url + ') : ' + normalizeFrenchPhone(phone));
  });
  const interestingWords = ['contact', 'direction', 'jeunesse', 'éducation', 'education', 'partenariat', 'parents', 'cse'];
  interestingWords.forEach(function (word) {
    if (html.toLowerCase().indexOf(word) !== -1) hints.push('Page à vérifier (' + word + ') : ' + url);
  });
  return hints.filter(uniqueOnly).slice(0, 8);
}

function researchMissingEmailsAndDeleteBatch() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    ensureAllProspectSchemas_();
    const batchSize = 60;
    const sheets = getProspectSheets();
    const existingEmails = {};
    const candidates = [];
    sheets.forEach(function (sheet) {
      getProspectRows(sheet).forEach(function (row, index) {
        const prospect = rowToObject(row);
        const email = normalizeText(prospect.email).toLowerCase();
        if (isValidEmail(email)) { existingEmails[email] = true; return; }
        if (candidates.length >= batchSize || prospect.firstContactDate || prospect.draftId) return;
        candidates.push({ sheet: sheet, rowNumber: index + 2, row: row, organisation: prospect.organisation, primaryUrl: normalizeResearchUrl_(prospect.website) || normalizeResearchUrl_(prospect.sourceUrl), officialDomain: normalizeDomain(prospect.website || '') });
      });
    });
    if (!candidates.length) {
      refreshDashboard();
      console.log(JSON.stringify({ processed: 0, found: 0, deleted: 0, remaining: 0 }));
      return { processed: 0, found: 0, deleted: 0, remaining: 0 };
    }
    const primaryRequests = [], primaryOwners = [];
    candidates.forEach(function (candidate) { if (candidate.primaryUrl) { primaryRequests.push(makeResearchRequest_(candidate.primaryUrl)); primaryOwners.push(candidate); } });
    const primaryResponses = safeFetchAll_(primaryRequests);
    const secondRequests = [], secondOwners = [];
    primaryResponses.forEach(function (response, index) {
      if (!response) return;
      const candidate = primaryOwners[index];
      const html = response.getContentText().slice(0, 350000);
      candidate.email = choosePublicEmail_(html, candidate.officialDomain || normalizeDomain(candidate.primaryUrl));
      if (candidate.email) return;
      const contactUrl = findContactPageUrl_(html, candidate.primaryUrl);
      if (contactUrl) { secondRequests.push(makeResearchRequest_(contactUrl)); secondOwners.push(candidate); }
    });
    safeFetchAll_(secondRequests).forEach(function (response, index) {
      if (response) secondOwners[index].email = choosePublicEmail_(response.getContentText().slice(0, 350000), secondOwners[index].officialDomain || normalizeDomain(secondOwners[index].primaryUrl));
    });
    let found = 0, deleted = 0, duplicates = 0;
    const deletionsBySheet = {};
    candidates.forEach(function (candidate) {
      const email = normalizeText(candidate.email).toLowerCase();
      if (isValidEmail(email) && !existingEmails[email]) {
        candidate.row[COL.EMAIL - 1] = email;
        candidate.row[COL.EMAIL_TYPE - 1] = isGenericEmail(email) ? 'générique' : 'nominatif';
        candidate.row[COL.EMAIL_VERIFIED - 1] = 'Non';
        candidate.row[COL.STATUS - 1] = 'Prêt à contacter';
        candidate.row[COL.NOTES - 1] = appendNote(candidate.row[COL.NOTES - 1], 'Adresse e-mail publique trouvée automatiquement sur le site indiqué dans le CRM le ' + formatDate(new Date()) + '.');
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL).setValue(email);
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL_TYPE).setValue(candidate.row[COL.EMAIL_TYPE - 1]);
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL_VERIFIED).setValue('Non');
        candidate.sheet.getRange(candidate.rowNumber, COL.STATUS).setValue('Prêt à contacter');
        candidate.sheet.getRange(candidate.rowNumber, COL.NOTES).setValue(candidate.row[COL.NOTES - 1]);
        existingEmails[email] = true;
        found += 1;
        return;
      }
      if (isValidEmail(email) && existingEmails[email]) duplicates += 1;
      const name = candidate.sheet.getName();
      if (!deletionsBySheet[name]) deletionsBySheet[name] = [];
      deletionsBySheet[name].push(candidate.rowNumber);
    });
    Object.keys(deletionsBySheet).forEach(function (sheetName) {
      const sheet = getSs().getSheetByName(sheetName);
      deletionsBySheet[sheetName].sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { sheet.deleteRow(rowNumber); deleted += 1; });
    });
    refreshDashboard();
    const remaining = countMissingEmailProspects_();
    const result = { processed: candidates.length, found: found, deleted: deleted, duplicatesDeleted: duplicates, remaining: remaining };
    writeLog('INFO', 'researchMissingEmailsAndDeleteBatch', '', '', 'Recherche des e-mails manquants terminée', JSON.stringify(result));
    console.log(JSON.stringify(result));
    SpreadsheetApp.getActive().toast(found + ' e-mails trouvés, ' + deleted + ' contacts sans e-mail supprimés. Restants : ' + remaining + '.', MDB.APP_NAME, 12);
    return result;
  } finally { lock.releaseLock(); }
}

function normalizeResearchUrl_(value) {
  let url = normalizeText(value).replace(/&amp;/g, '&');
  if (!url) return '';
  if (/^www\./i.test(url)) url = 'https://' + url;
  if (!/^https?:\/\//i.test(url)) return '';
  return url.replace(/\s/g, '');
}
function makeResearchRequest_(url) { return { url: url, muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-Les-Matinees-du-Bac/1.0)' } }; }
function safeFetchAll_(requests) {
  if (!requests.length) return [];
  try { return UrlFetchApp.fetchAll(requests).map(function (response) { const code = response.getResponseCode(); return code >= 200 && code < 400 ? response : null; }); }
  catch (error) {
    writeLog('WARN', 'safeFetchAll_', '', '', 'Certaines pages publiques sont inaccessibles', stack(error));
    return requests.map(function (request) { try { const response = UrlFetchApp.fetch(request.url, request); const code = response.getResponseCode(); return code >= 200 && code < 400 ? response : null; } catch (ignored) { return null; } });
  }
}
function choosePublicEmail_(html, officialDomain) {
  const cleaned = String(html || '').replace(/&#0*64;|&commat;|\s(?:\[at\]|\(at\))\s/gi, '@').replace(/\s(?:\[dot\]|\(dot\))\s/gi, '.').replace(/%40/gi, '@');
  const matches = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const blockedDomains = ['example.com', 'example.org', 'sentry.io', 'w3.org', 'schema.org', 'google.com', 'googleapis.com', 'gstatic.com', 'wixpress.com', 'wordpress.org', 'cloudflare.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'pappers.fr', 'societe.com', 'data.education.gouv.fr'];
  const blockedLocals = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'webmaster', 'privacy', 'dpo', 'abuse'];
  const consumerDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'orange.fr', 'wanadoo.fr', 'yahoo.fr', 'laposte.net', 'free.fr'];
  const genericLocals = ['contact', 'info', 'accueil', 'secretariat', 'secrétariat', 'direction', 'mairie', 'cse', 'association', 'scolarite', 'scolarité', 'administration', 'bureau'];
  const preferredDomain = normalizeDomain(officialDomain || '');
  let best = '', bestScore = -1;
  matches.filter(uniqueOnly).forEach(function (rawEmail) {
    const email = rawEmail.toLowerCase().replace(/^mailto:/, '');
    if (!isValidEmail(email)) return;
    const parts = email.split('@'), local = parts[0], domain = normalizeDomain(parts[1]);
    if (blockedDomains.some(function (blocked) { return domain === blocked || domain.endsWith('.' + blocked); })) return;
    if (blockedLocals.some(function (blocked) { return local === blocked || local.indexOf(blocked + '.') === 0; })) return;
    let score = 10;
    if (preferredDomain && (domain === preferredDomain || domain.endsWith('.' + preferredDomain) || preferredDomain.endsWith('.' + domain))) score += 100;
    if (genericLocals.some(function (generic) { return local === generic || local.indexOf(generic + '.') === 0 || local.indexOf(generic + '-') === 0; })) score += 35;
    if (consumerDomains.indexOf(domain) !== -1) score += 20;
    if (/\.gouv\.fr$/.test(domain) || /^ac-[a-z-]+\.fr$/.test(domain) || /\.asso\.fr$/.test(domain)) score += 20;
    if (score > bestScore) { best = email; bestScore = score; }
  });
  return best;
}
function findContactPageUrl_(html, baseUrl) {
  const links = [], regex = /href\s*=\s*["']([^"'#]+)["']/gi; let match;
  while ((match = regex.exec(String(html || ''))) !== null && links.length < 80) links.push(match[1]);
  const baseHost = normalizeDomain(baseUrl);
  for (let index = 0; index < links.length; index += 1) {
    const href = links[index];
    if (!/(contact|nous-contacter|mentions-legales|mentions_l[eé]gales|equipe|direction|accueil|secretariat)/i.test(href)) continue;
    const resolved = resolveResearchUrl_(baseUrl, href);
    if (resolved && normalizeDomain(resolved) === baseHost) return resolved;
  }
  const fallback = baseUrl.replace(/\/$/, '') + '/contact';
  return normalizeDomain(fallback) === baseHost ? fallback : '';
}
function resolveResearchUrl_(baseUrl, href) {
  if (/^https?:\/\//i.test(href)) return href;
  const originMatch = baseUrl.match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return '';
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.indexOf('/') === 0) return originMatch[1] + href;
  const directory = baseUrl.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return directory + href;
}
function countMissingEmailProspects_() { let count = 0; getProspectSheets().forEach(function (sheet) { getProspectRows(sheet).forEach(function (row) { if (!isValidEmail(row[COL.EMAIL - 1])) count += 1; }); }); return count; }


// ============================================================
// Main.gs
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Prospection MDB')
    .addItem('Initialiser le CRM', 'initializeCrm')
    .addSeparator()
    .addItem('Importer un CSV dans l’onglet actif', 'importCsvToActiveProspectSheet')
    .addItem('Chercher des pistes sur le site officiel', 'findPublicHintsForActiveProspect')
    .addSeparator()
    .addItem('Vérifier les données', 'verifyData')
    .addItem('Détecter les doublons', 'detectDuplicates')
    .addItem('Retirer les doublons e-mail', 'removeEmailDuplicates')
    .addItem('Calculer les scores', 'calculateScores')
    .addItem('Réparer les colonnes et les statuts', 'normalizeAllProspectSchemas')
    .addItem('Générer les messages', 'generateMessages')
    .addItem('Créer les brouillons Gmail', 'createGmailDrafts')
    .addItem('Préparer maintenant 20 brouillons répartis', 'createBalancedDailyDrafts')
    .addItem('Activer : nouveau contact = nouveau brouillon', 'installAutomaticDraftCreation')
    .addItem('Désactiver les nouveaux brouillons automatiques', 'removeAutomaticDraftCreation')
    .addItem('Synchroniser les envois Gmail', 'syncSentMessagesFromGmail')
    .addItem('Activer la synchronisation automatique', 'installAutomaticSentSync')
    .addItem('Désactiver la synchronisation automatique', 'removeAutomaticSentSync')
    .addItem('Marquer la ligne active comme envoyée', 'markActiveProspectAsSent')
    .addItem('Préparer les relances', 'prepareFollowUps')
    .addItem('Rechercher les réponses', 'updateStatusesFromGmail')
    .addSeparator()
    .addItem('Actualiser le tableau de bord', 'refreshDashboard')
    .addItem('Exporter les prospects', 'exportProspects')
    .addItem('Ajouter à la liste d’exclusion', 'addActiveProspectToExclusion')
    .addItem('Supprimer les données de la ligne active', 'deleteActiveProspectData')
    .addItem('Ouvrir la documentation', 'openDocumentation')
    .addToUi();
}

function initializeCrm() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    setupWorkbook();
    applyDataValidations();
    seedTemplates();
    seedExampleData();
    refreshDashboard();
    writeLog('INFO', 'initializeCrm', '', '', 'CRM initialisé', '');
    SpreadsheetApp.getActive().toast('CRM initialisé. Mode test activé par défaut.', MDB.APP_NAME, 8);
  } catch (error) {
    writeLog('ERROR', 'initializeCrm', '', '', 'Erreur initialisation', stack(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function openDocumentation() {
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;line-height:1.5;padding:12px">' +
      '<h2>CRM Prospection MDB</h2>' +
      '<p>1. Remplissez CONFIGURATION, surtout l’adresse de test.</p>' +
      '<p>2. Ajoutez vos prospects dans les onglets de catégorie.</p>' +
      '<p>3. Lancez Vérifier les données, Détecter les doublons, Calculer les scores.</p>' +
      '<p>4. Activez une fois “Nouveau contact = nouveau brouillon” dans le menu Prospection MDB.</p>' +
      '<p>5. Dès qu’un e-mail valide est ajouté, le brouillon est créé automatiquement. Les imports sont contrôlés toutes les 5 minutes.</p>' +
      '<p>Le script ne déclenche jamais d’envoi automatique.</p>' +
      '<p>Le README livré avec le code contient la procédure complète.</p>' +
    '</div>'
  ).setWidth(520).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Documentation CRM');
}
