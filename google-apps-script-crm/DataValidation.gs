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
