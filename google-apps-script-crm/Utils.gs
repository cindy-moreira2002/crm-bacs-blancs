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
