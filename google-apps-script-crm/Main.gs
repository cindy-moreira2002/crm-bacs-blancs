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
