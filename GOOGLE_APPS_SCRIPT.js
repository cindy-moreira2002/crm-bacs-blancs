// ════════════════════════════════════════════════════════════
//  MATINÉES DU BAC — Apps Script (Supabase → Sheets + emails)
//  Surveille Supabase toutes les 5 min :
//   - confirmations d'inscription
//   - notif prof quand une correction est prête
//   - envoi du dossier PDF à l'élève
//   - sync des onglets par matière
// ════════════════════════════════════════════════════════════

// ==== CONFIG ====
const SUPABASE_URL = 'https://orpbfnmdlvxmkvyrpvtj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycGJmbm1kbHZ4bWt2eXJwdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzI0MDksImV4cCI6MjA5Njg0ODQwOX0.vJJYkCfezKi_eg2vx40n2a7FVAP6hsiCsY0ImvIudB0';

// URL du site (mets l'URL Vercel quand déployé)
const SITE_URL = 'http://localhost:3000';

// Heure de début du bac blanc (format 24h, Paris) — utilisée pour le rappel H-1
const HEURE_DEBUT_BB = 9;

const MATIERES = ['Français', 'Philosophie', 'Histoire-Géo', 'Mathématiques', 'SES'];
const PROFS = {
  'Français':      'cindy.moreira@edhec.com',
  'Philosophie':   'cindy.moreira@edhec.com',
  'Histoire-Géo':  'cindy.moreira@edhec.com',
  'Mathématiques': 'cindy.moreira@edhec.com',
  'SES':           'cindy.moreira@edhec.com'
};
const ENTETES = ['Nom élève', 'Email élève', 'Email parent', 'Tél parent', 'Date inscription', 'Date épreuve'];

// Matières du site (clés) → libellés Supabase
const MATIERE_LABELS = {
  francais: 'Français', philo: 'Philosophie', histoire: 'Histoire-Géo',
  maths: 'Mathématiques', ses: 'SES'
};
// Mois FR → numéro (pour convertir "21 Juin" en date)
const MOIS_FR = { 'janv': 1, 'févr': 2, 'fevr': 2, 'mars': 3, 'avr': 4, 'mai': 5,
  'juin': 6, 'juil': 7, 'août': 8, 'aout': 8, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12, 'dec': 12 };
const ANNEE_EPREUVE = 2026;

// ════════════════════════════════════════════════════════════
//  TÂCHE PRINCIPALE — lancée toutes les 5 min (via installerTrigger)
// ════════════════════════════════════════════════════════════
function tachePrincipale() {
  envoyerConfirmations();
  envoyerRappelsJ1();
  envoyerRappelsH1();
  notifierProfsCorrections();
  notifierEleves();
  syncInscriptions();
}

// ── Confirmation d'inscription (élève + parent) ──
function envoyerConfirmations() {
  const url = SUPABASE_URL + '/rest/v1/inscriptions?email_envoye=eq.false&select=*';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  const rows = JSON.parse(res.getContentText());
  if (!rows || rows.length === 0) { Logger.log('Aucune confirmation a envoyer.'); return; }

  rows.forEach(function (d) {
    const destinataires = [d.email, d.email_parent].filter(Boolean).join(',');
    if (!destinataires) return;
    MailApp.sendEmail({
      to: destinataires,
      name: 'Les Matinées du Bac',
      subject: 'Inscription confirmée — Bac Blanc ' + d.matiere,
      htmlBody: emailConfirmation(d)
    });
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/inscriptions?id=eq.' + d.id, {
      method: 'patch', contentType: 'application/json',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ email_envoye: true }),
      muteHttpExceptions: true
    });
    Logger.log('Confirmation envoyee a ' + destinataires);
  });
}

function emailConfirmation(d) {
  var salonUrl = 'https://meet.jit.si/matineesdubac-' + d.id;
  var espaceUrl = SITE_URL + '/espace-eleve';
  var dateStr = d.date_epreuve ? new Date(d.date_epreuve).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'date à confirmer';
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">' +
    '<h2 style="color:#581C87">Inscription confirmée 🎉</h2>' +
    '<p>Bonjour ' + (d.nom || '') + ',</p>' +
    '<p>Ton inscription au <strong>Bac Blanc de ' + d.matiere + '</strong> est bien enregistrée !</p>' +
    '<p style="background:#F3F4F6;border-radius:8px;padding:14px 18px;font-size:15px">📅 <strong>Date de l\'épreuve : ' + dateStr + '</strong></p>' +
    '<h3 style="color:#581C87;margin-top:24px">Comment ça va se passer ?</h3>' +
    '<ul style="line-height:1.9">' +
    '<li>Le bac blanc se déroule <strong>en visio</strong>, depuis chez toi</li>' +
    '<li>Tu reçois un <strong>lien d\'appel personnel</strong> — réservé rien que pour toi</li>' +
    '<li>Le prof passe dans ton salon pendant l\'épreuve et reste disponible</li>' +
    '<li>Après l\'épreuve, tu déposes ta copie et reçois un <strong>dossier de correction complet</strong></li>' +
    '</ul>' +
    '<h3 style="color:#581C87;margin-top:24px">Ton lien d\'appel</h3>' +
    '<p>Garde-le précieusement — c\'est <strong>toujours le même</strong> pour tous tes bacs blancs :</p>' +
    '<p style="margin:16px 0"><a href="' + salonUrl + '" style="background:#2563EB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Rejoindre mon salon visio →</a></p>' +
    '<p style="font-size:12px;color:#6B7280">Lien direct : <a href="' + salonUrl + '" style="color:#2563EB">' + salonUrl + '</a></p>' +
    '<p style="margin-top:16px">Tu retrouves aussi ce lien à tout moment sur <a href="' + espaceUrl + '" style="color:#7C3AED">ton espace élève</a>.</p>' +
    '<p style="margin-top:24px">À très vite 💪<br><strong>Les Matinées du Bac</strong></p>' +
    '</div>';
}

// ── Rappel J-1 ──
function envoyerRappelsJ1() {
  var demain = new Date();
  demain.setDate(demain.getDate() + 1);
  var demainStr = Utilities.formatDate(demain, 'Europe/Paris', 'yyyy-MM-dd');
  var url = SUPABASE_URL + '/rest/v1/inscriptions?date_epreuve=eq.' + demainStr + '&rappel_j1_envoye=eq.false&select=*';
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, muteHttpExceptions: true });
  var rows = JSON.parse(res.getContentText());
  if (!rows || rows.length === 0) { Logger.log('Aucun rappel J-1 a envoyer.'); return; }
  rows.forEach(function(d) {
    var dest = [d.email, d.email_parent].filter(Boolean).join(',');
    if (!dest) return;
    MailApp.sendEmail({ to: dest, name: 'Les Matinées du Bac', subject: '📅 Rappel — Ton Bac Blanc de ' + d.matiere + ' est demain !', htmlBody: emailRappelJ1(d) });
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/inscriptions?id=eq.' + d.id, { method: 'patch', contentType: 'application/json', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' }, payload: JSON.stringify({ rappel_j1_envoye: true }), muteHttpExceptions: true });
    Logger.log('Rappel J-1 envoye a ' + dest);
  });
}

function emailRappelJ1(d) {
  var salonUrl = 'https://meet.jit.si/matineesdubac-' + d.id;
  var espaceUrl = SITE_URL + '/espace-eleve';
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">' +
    '<h2 style="color:#581C87">C\'est demain ! 📅</h2>' +
    '<p>Bonjour ' + (d.nom || '') + ',</p>' +
    '<p>Ton <strong>Bac Blanc de ' + d.matiere + '</strong> est prévu pour demain. Voici ce qu\'il faut vérifier ce soir :</p>' +
    '<ul style="line-height:1.9">' +
    '<li>✅ Connexion internet stable</li>' +
    '<li>✅ Micro et caméra qui fonctionnent</li>' +
    '<li>✅ Feuilles, stylo, brouillon prêts</li>' +
    '<li>✅ Ton lien de salon visio enregistré</li>' +
    '</ul>' +
    '<p>Ton salon visio personnel :</p>' +
    '<p style="margin:16px 0"><a href="' + salonUrl + '" style="background:#2563EB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Rejoindre mon salon →</a></p>' +
    '<p style="font-size:12px;color:#6B7280">Lien : <a href="' + salonUrl + '" style="color:#2563EB">' + salonUrl + '</a></p>' +
    '<p style="margin-top:16px">Tu retrouves ce lien sur <a href="' + espaceUrl + '" style="color:#7C3AED">ton espace élève</a>.</p>' +
    '<p style="margin-top:24px">Bonne préparation 💪<br><strong>Les Matinées du Bac</strong></p>' +
    '</div>';
}

// ── Rappel H-1 (envoyé le matin du bac blanc, 1h avant HEURE_DEBUT_BB) ──
function envoyerRappelsH1() {
  var maintenant = new Date();
  var heureParis = parseInt(Utilities.formatDate(maintenant, 'Europe/Paris', 'HH'), 10);
  if (heureParis !== HEURE_DEBUT_BB - 1) return;
  var aujourdhui = Utilities.formatDate(maintenant, 'Europe/Paris', 'yyyy-MM-dd');
  var url = SUPABASE_URL + '/rest/v1/inscriptions?date_epreuve=eq.' + aujourdhui + '&rappel_h1_envoye=eq.false&select=*';
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }, muteHttpExceptions: true });
  var rows = JSON.parse(res.getContentText());
  if (!rows || rows.length === 0) { Logger.log('Aucun rappel H-1 a envoyer.'); return; }
  rows.forEach(function(d) {
    var dest = [d.email, d.email_parent].filter(Boolean).join(',');
    if (!dest) return;
    MailApp.sendEmail({ to: dest, name: 'Les Matinées du Bac', subject: '⏰ Dans 1h — Ton Bac Blanc de ' + d.matiere + ' commence !', htmlBody: emailRappelH1(d) });
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/inscriptions?id=eq.' + d.id, { method: 'patch', contentType: 'application/json', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' }, payload: JSON.stringify({ rappel_h1_envoye: true }), muteHttpExceptions: true });
    Logger.log('Rappel H-1 envoye a ' + dest);
  });
}

function emailRappelH1(d) {
  var salonUrl = 'https://meet.jit.si/matineesdubac-' + d.id;
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">' +
    '<h2 style="color:#581C87">C\'est dans 1h ! ⏰</h2>' +
    '<p>Bonjour ' + (d.nom || '') + ',</p>' +
    '<p>Ton <strong>Bac Blanc de ' + d.matiere + '</strong> commence à <strong>' + HEURE_DEBUT_BB + 'h</strong>. Tout est prêt !</p>' +
    '<p>Connecte-toi 5 min avant l\'heure sur ton salon visio :</p>' +
    '<p style="margin:20px 0"><a href="' + salonUrl + '" style="background:#2563EB;color:#fff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:700;font-size:16px">Rejoindre mon salon →</a></p>' +
    '<p style="font-size:12px;color:#6B7280">Lien : <a href="' + salonUrl + '" style="color:#2563EB">' + salonUrl + '</a></p>' +
    '<p style="background:#F0FDF4;border-radius:8px;padding:12px 16px;font-size:14px;margin-top:20px">💡 Le prof arrivera dans ton salon au démarrage de l\'épreuve. Reste connecté·e.</p>' +
    '<p style="margin-top:24px">Tu assures ! 🚀<br><strong>Les Matinées du Bac</strong></p>' +
    '</div>';
}

// ── Notif au prof quand une copie passe en "corrigée" ──
function notifierProfsCorrections() {
  const filtre = 'statut=eq.' + encodeURIComponent('corrigée') + '&prof_notifie=eq.false&prof_email=not.is.null';
  const url = SUPABASE_URL + '/rest/v1/copies?' + filtre + '&select=id,eleve_nom,matiere,prof_email';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  const rows = JSON.parse(res.getContentText());
  if (!rows || rows.length === 0) { Logger.log('Aucune correction a notifier.'); return; }

  rows.forEach(function (c) {
    MailApp.sendEmail({
      to: c.prof_email,
      name: 'Les Matinées du Bac',
      subject: 'Correction prête — ' + c.eleve_nom + ' (' + c.matiere + ')',
      htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">' +
        '<h2 style="color:#581C87">Correction terminée ✅</h2>' +
        '<p>La correction de la copie de <strong>' + c.eleve_nom + '</strong> (' + c.matiere +
        ') est terminée et disponible sur ton espace.</p>' +
        '<p><a href="' + SITE_URL + '/espace-prof" style="background:#7C3AED;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">Voir la correction →</a></p>' +
        '</div>'
    });
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/copies?id=eq.' + c.id, {
      method: 'patch', contentType: 'application/json',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ prof_notifie: true }),
      muteHttpExceptions: true
    });
    Logger.log('Prof notifie: ' + c.prof_email);
  });
}

// ── Envoi du dossier PDF à l'élève (quand le prof a cliqué "Envoyer") ──
function notifierEleves() {
  const filtre = 'a_envoyer=eq.true&envoye=eq.false&pdf_pret=eq.true&eleve_email=not.is.null';
  const url = SUPABASE_URL + '/rest/v1/copies?' + filtre + '&select=id,eleve_nom,matiere,eleve_email,pdf_base64';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  const rows = JSON.parse(res.getContentText());
  if (!rows || rows.length === 0) { Logger.log('Aucun envoi eleve.'); return; }

  rows.forEach(function (c) {
    var b64 = c.pdf_base64.indexOf(',') > -1 ? c.pdf_base64.split(',')[1] : c.pdf_base64;
    var pdf = Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', 'Dossier_' + c.eleve_nom + '.pdf');
    MailApp.sendEmail({
      to: c.eleve_email,
      name: 'Les Matinées du Bac',
      subject: '🎉 Ton Bac Blanc de ' + c.matiere + ' est corrigé — voici ton dossier',
      htmlBody: emailCorrectionPrete(c),
      attachments: [pdf]
    });
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/copies?id=eq.' + c.id, {
      method: 'patch', contentType: 'application/json',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' },
      payload: JSON.stringify({ envoye: true, a_envoyer: false }),
      muteHttpExceptions: true
    });
    Logger.log('Dossier envoye a ' + c.eleve_email);
  });
}

function emailCorrectionPrete(c) {
  var espaceUrl = SITE_URL + '/espace-eleve';
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">' +
    '<h2 style="color:#581C87">Ton dossier de correction est prêt ! 🎉</h2>' +
    '<p>Bonjour ' + c.eleve_nom + ',</p>' +
    '<p>Bravo pour avoir participé au <strong>Bac Blanc de ' + c.matiere + '</strong> !</p>' +
    '<p>Ton prof a terminé la correction. Tu trouveras ton <strong>dossier complet</strong> :</p>' +
    '<ul style="line-height:1.9">' +
    '<li>📎 En <strong>pièce jointe</strong> de cet email</li>' +
    '<li>📁 Dans <a href="' + espaceUrl + '" style="color:#7C3AED">ton espace élève</a> (téléchargeable à tout moment)</li>' +
    '</ul>' +
    '<p style="background:#F3F4F6;border-radius:8px;padding:14px 18px;font-size:14px;margin:20px 0">' +
    '💡 <strong>Comment exploiter ce dossier ?</strong><br>' +
    'Lis les points forts à conserver, travaille les axes d\'amélioration identifiés, et entraîne-toi sur les recommandations de ton prof.' +
    '</p>' +
    '<p style="margin-top:24px">Bon courage pour la suite 💪<br><strong>Les Matinées du Bac</strong></p>' +
    '</div>';
}

// ── Sync des onglets par matière ──
function syncInscriptions() {
  const rows = fetchSupabase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  MATIERES.forEach(function (matiere) {
    var sheet = ss.getSheetByName(matiere);
    if (!sheet) sheet = ss.insertSheet(matiere);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES]).setFontWeight('bold');
    var participants = rows.filter(function (r) { return r.matiere === matiere; });
    if (participants.length === 0) return;
    var data = participants.map(function (r) {
      return [r.nom || '', r.email || '', r.email_parent || '', r.telephone || '',
        r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : '',
        r.date_epreuve ? new Date(r.date_epreuve).toLocaleDateString('fr-FR') : ''];
    });
    sheet.getRange(2, 1, data.length, ENTETES.length).setValues(data);
  });
  Logger.log('OK sync termine.');
}

function fetchSupabase() {
  const url = SUPABASE_URL + '/rest/v1/inscriptions?select=*&order=created_at.asc';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

// ════════════════════════════════════════════════════════════
//  doPost — reçoit les inscriptions du site (GSHEET_URL)
//  et les écrit dans Supabase AVEC la date d'épreuve.
//  Déploie : Déployer → Nouveau déploiement → Application web
//  (exécuter en tant que moi, accès "Tout le monde").
// ════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var matiere = MATIERE_LABELS[body.matiere] || body.matiere || '';
    var row = {
      nom: body.prenom || body.nom || '',
      email: body.email || '',
      email_parent: body.email_parent || '',
      telephone: body.telephone || '',
      matiere: matiere,
      date_epreuve: sessionVersDate(body.session) // "21 Juin" → "2026-06-21"
    };
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/inscriptions', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' },
      payload: JSON.stringify(row),
      muteHttpExceptions: true
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost erreur : ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Convertit un libellé de session "21 Juin" en date ISO "2026-06-21" (null si illisible)
function sessionVersDate(session) {
  if (!session) return null;
  var m = String(session).trim().match(/(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)/);
  if (!m) return null;
  var jour = parseInt(m[1], 10);
  var mois = MOIS_FR[m[2].toLowerCase().replace('.', '')];
  if (!mois) return null;
  return ANNEE_EPREUVE + '-' + ('0' + mois).slice(-2) + '-' + ('0' + jour).slice(-2);
}

// ── Lance CETTE fonction UNE fois pour activer l'automatisation ──
function installerTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tachePrincipale').timeBased().everyMinutes(5).create();
  Logger.log('Trigger installe : verif toutes les 5 min.');
}
