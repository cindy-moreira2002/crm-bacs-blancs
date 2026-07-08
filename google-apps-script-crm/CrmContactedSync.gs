/**
 * Synchro « Contacté » vers le CRM Next.js (crm-bacs-blancs.vercel.app).
 *
 * Scanne les emails que TU as envoyés, récupère les adresses des destinataires,
 * et appelle l'endpoint du CRM qui coche « Contacté » les leads déjà présents
 * (statut nouveau -> contacté). Aucun lead n'est créé côté CRM.
 *
 * Installation :
 *   1. Édite setCrmContactedToken() ci-dessous (colle le jeton = variable Vercel
 *      GMAIL_SYNC_TOKEN), lance-la une fois : elle range le jeton dans les
 *      Propriétés du script (jamais dans le code partagé), puis efface la valeur.
 *      (Ou : Paramètres du projet > Propriétés du script > CRM_CONTACTED_TOKEN.)
 *   2. Lance pushSentContactsToCrm() une fois -> autorise l'accès Gmail -> BACKFILL.
 *   3. Lance installCrmContactedTrigger() une fois -> synchro auto chaque heure.
 */

var CRM_CONTACTED_URL = 'https://crm-bacs-blancs.vercel.app/api/gmail-contacted';

// Fenêtre scannée. 'newer_than:1y' = dernière année. Mets 'newer_than:3y' pour + large.
var CRM_SENT_QUERY = 'newer_than:1y';

// Range le jeton dans les Propriétés du script (privé au projet Apps Script).
// Colle la valeur, lance la fonction une fois, puis remets '' pour ne pas la laisser traîner.
function setCrmContactedToken() {
  var token = ''; // <-- colle ici GMAIL_SYNC_TOKEN puis lance cette fonction
  if (!token) throw new Error('Colle le jeton dans token avant de lancer.');
  PropertiesService.getScriptProperties().setProperty('CRM_CONTACTED_TOKEN', token);
  Logger.log('Jeton CRM enregistré.');
}

function getCrmContactedToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('CRM_CONTACTED_TOKEN');
  if (!token) throw new Error('Jeton absent : lance setCrmContactedToken() (voir en-tête du fichier).');
  return token;
}

function pushSentContactsToCrm() {
  var emails = collectSentRecipients_(CRM_SENT_QUERY);
  if (!emails.length) {
    Logger.log('Aucun destinataire trouvé dans les envoyés.');
    return;
  }

  var response = UrlFetchApp.fetch(CRM_CONTACTED_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getCrmContactedToken_() },
    payload: JSON.stringify({ emails: emails }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  Logger.log('CRM sync (' + emails.length + ' emails) -> ' + code + ' ' + text);
  try {
    SpreadsheetApp.getActive().toast(
      code === 200 ? text : 'Erreur ' + code + ' : ' + text,
      'Sync contactés CRM',
      8
    );
  } catch (ignored) {}
}

/** Récupère les adresses des destinataires des messages QUE TU as envoyés. */
function collectSentRecipients_(query) {
  var seen = {};
  var me = '';
  try { me = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}

  var start = 0;
  var pageSize = 100;
  while (start < 1000) {
    var threads = GmailApp.search('in:sent ' + query, start, pageSize);
    if (!threads.length) break;
    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];
        // On ne garde que les messages réellement envoyés par toi (le fil peut
        // contenir des réponses reçues).
        if (me) {
          var from = String(msg.getFrom() || '').toLowerCase();
          if (from.indexOf(me) === -1) continue;
        }
        extractEmails_(msg.getTo() + ',' + msg.getCc()).forEach(function (e) {
          seen[e] = true;
        });
      }
    }
    if (threads.length < pageSize) break;
    start += pageSize;
  }
  return Object.keys(seen);
}

function extractEmails_(str) {
  if (!str) return [];
  var matches = String(str).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi) || [];
  return matches.map(function (e) { return e.toLowerCase(); });
}

function installCrmContactedTrigger() {
  removeCrmContactedTrigger();
  ScriptApp.newTrigger('pushSentContactsToCrm').timeBased().everyHours(1).create();
  try {
    SpreadsheetApp.getActive().toast('Synchro contactés CRM activée (chaque heure).', 'CRM', 6);
  } catch (ignored) {}
}

function removeCrmContactedTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'pushSentContactsToCrm') ScriptApp.deleteTrigger(tr);
  });
}
