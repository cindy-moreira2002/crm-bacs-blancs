/**
 * SUIVI DES PROFESSEURS INSCRITS — Google Apps Script
 * =====================================================================
 *
 * À installer par Cindy, sous son compte Google.
 *
 * INSTALLATION
 *  1. Crée un Google Sheet, nomme-le « Professeurs — Les Matinées du Bac ».
 *  2. Extensions → Apps Script. Colle ce fichier, remplace tout.
 *  3. Remplace JETON_A_REMPLACER ci-dessous par une longue chaîne au hasard
 *     (la même que la variable Vercel PROFS_SHEET_TOKEN).
 *  4. Déployer → Nouveau déploiement → Type « Application web »
 *       - Exécuter en tant que : moi
 *       - Qui a accès : tout le monde
 *     Copie l'URL /exec obtenue.
 *  5. Dans Vercel (projet espaces-matineesdubac), ajoute :
 *       PROFS_SHEET_WEBAPP_URL = l'URL /exec
 *       PROFS_SHEET_TOKEN      = le même jeton qu'en 3.
 *
 * SÉCURITÉ
 *  Aucun mot de passe n'arrive ici et aucun ne doit jamais y être écrit.
 *  Les mots de passe vivent hachés dans Supabase Auth. Ce Sheet est une trace
 *  de gestion : qui s'est inscrit, dans quelle matière, où en est sa
 *  candidature. Rien de plus.
 */

var JETON = 'JETON_A_REMPLACER';
var ONGLET = 'Professeurs';

var COLONNES = [
  'ID',
  'Prénom',
  'Nom',
  'E-mail',
  'Téléphone',
  'Matières enseignées',
  'Date d’inscription',
  'Statut candidature',
  'Statut compte',
  'Bacs blancs',
  'Dernière mise à jour',
];

function doPost(e) {
  try {
    var donnees = JSON.parse(e.postData.contents);

    if (donnees.token !== JETON) {
      return reponse({ error: 'jeton invalide' });
    }
    // Ceinture et bretelles : on refuse toute charge qui contiendrait un
    // champ ressemblant à un mot de passe, même par erreur d'appel.
    var interdits = ['password', 'motDePasse', 'mot_de_passe', 'mdp'];
    for (var i = 0; i < interdits.length; i++) {
      if (donnees[interdits[i]]) {
        return reponse({ error: 'champ interdit : ' + interdits[i] });
      }
    }

    var feuille = obtenirFeuille();
    var ligne = [
      donnees.id || '',
      donnees.prenom || '',
      donnees.nom || '',
      donnees.email || '',
      donnees.telephone || '',
      donnees.matieres || '',
      donnees.date_inscription || '',
      donnees.statut_candidature || '',
      donnees.statut_compte || '',
      donnees.bacs_blancs || '',
      new Date(),
    ];

    // Upsert par ID : une inscription puis ses mises à jour restent une
    // seule ligne, pas un historique en doublons.
    var indexLigne = trouverLigneParId(feuille, donnees.id);
    if (indexLigne > 0) {
      feuille.getRange(indexLigne, 1, 1, ligne.length).setValues([ligne]);
    } else {
      feuille.appendRow(ligne);
    }

    return reponse({ ok: true });
  } catch (err) {
    return reponse({ error: String(err) });
  }
}

function obtenirFeuille() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var feuille = classeur.getSheetByName(ONGLET);
  if (!feuille) {
    feuille = classeur.insertSheet(ONGLET);
  }
  if (feuille.getLastRow() === 0) {
    feuille.appendRow(COLONNES);
    feuille.getRange(1, 1, 1, COLONNES.length).setFontWeight('bold');
    feuille.setFrozenRows(1);
  }
  return feuille;
}

function trouverLigneParId(feuille, id) {
  if (!id || feuille.getLastRow() < 2) return -1;
  var ids = feuille.getRange(2, 1, feuille.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function reponse(objet) {
  return ContentService
    .createTextOutput(JSON.stringify(objet))
    .setMimeType(ContentService.MimeType.JSON);
}
