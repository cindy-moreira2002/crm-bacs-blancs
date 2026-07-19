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
