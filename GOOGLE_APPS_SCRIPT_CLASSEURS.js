/**
 * CLASSEUR DE CORRECTION PAR BAC BLANC — Google Apps Script
 * =====================================================================
 *
 * Ce que fait ce script, et rien d'autre : quand un professeur clique sur
 * « 📋 Créer mon classeur » dans sa console, le CRM appelle cette adresse ; le
 * script duplique le classeur de la matière, nomme la copie
 * « Bac blanc — Mathématiques — 14 novembre 2026 — Léa Dupont », la partage
 * avec ce professeur, et rend son adresse. Le CRM l'archive.
 *
 * Pourquoi passer par Apps Script : copier un fichier Google demande d'être
 * identifié auprès de Google. Le script tourne SOUS TON COMPTE, donc le CRM n'a
 * aucun accès à ton Drive — il ne sait que demander une copie, et rien d'autre.
 *
 * INSTALLATION
 *  1. Va sur https://script.google.com → « Nouveau projet ».
 *     Nomme-le « Classeurs de correction — Les Matinées du Bac ».
 *  2. Colle ce fichier entier (remplace tout ce qu'il y a).
 *  3. Remplace JETON_A_REMPLACER par une longue chaîne au hasard (30 caractères
 *     ou plus). Garde-la : c'est la variable Vercel CLASSEURS_WEBAPP_TOKEN.
 *  4. Rien à faire : le script range les copies dans un dossier Drive
 *     « Classeurs de correction », qu'il crée tout seul au premier usage.
 *     (Pour en imposer un autre, colle son identifiant dans DOSSIER_ID.)
 *  5. Déployer → Nouveau déploiement → Type « Application web »
 *       - Exécuter en tant que : moi
 *       - Qui a accès : tout le monde
 *     Autorise l'accès quand Google le demande. Copie l'URL /exec obtenue.
 *  6. Dans Vercel (projet du CRM) → Settings → Environment Variables :
 *       CLASSEURS_WEBAPP_URL   = l'URL /exec
 *       CLASSEURS_WEBAPP_TOKEN = le jeton de l'étape 3
 *     Coche les trois environnements, puis redéploie.
 *
 * VÉRIFIER QUE ÇA MARCHE
 *  Ouvre l'URL /exec dans ton navigateur : elle doit répondre
 *  {"ok":true,"message":"Classeurs de correction — prêt."}
 *
 * ⚠️ ACCÈS AUX MODÈLES
 *  Les classeurs de matière (« guidelines ») appartiennent au Drive de Maël.
 *  Ton compte doit pouvoir les OUVRIR pour pouvoir les copier. Si le script
 *  répond « Modèle inaccessible », demande-lui le partage du classeur concerné.
 */

var JETON = 'JETON_A_REMPLACER';

// Où ranger les copies. Laissé vide, le script crée (une fois) un dossier
// « Classeurs de correction » à la racine du Drive et s'en sert ensuite : c'est
// une adresse de moins à aller chercher à la main, et les copies ne se
// dispersent jamais à la racine.
var DOSSIER_ID = '';
var DOSSIER_NOM = 'Classeurs de correction';

function doGet() {
  return json({ ok: true, message: 'Classeurs de correction — prêt.' });
}

function doPost(e) {
  try {
    var demande = JSON.parse(e.postData.contents);

    if (demande.token !== JETON) {
      return json({ ok: false, erreur: 'Jeton invalide.' });
    }
    if (demande.action !== 'copier') {
      return json({ ok: false, erreur: 'Action inconnue : ' + demande.action });
    }

    var idModele = extraireId(demande.modele_url);
    if (!idModele) {
      return json({ ok: false, erreur: 'Adresse du modèle illisible.' });
    }

    var modele;
    try {
      modele = DriveApp.getFileById(idModele);
    } catch (err) {
      return json({
        ok: false,
        erreur:
          'Modèle inaccessible : ton compte Google n’a pas le droit d’ouvrir ce classeur. ' +
          'Demande son partage, puis réessaie.',
      });
    }

    var nom = String(demande.nom || 'Bac blanc — classeur de correction').slice(0, 150);

    var copie = modele.makeCopy(nom, dossierCible());

    // Le professeur doit pouvoir écrire dedans : sans ce partage, il ouvrirait
    // sa propre grille et lirait « Demander l'accès » le matin de l'épreuve.
    if (demande.partager_avec) {
      try {
        copie.addEditor(String(demande.partager_avec));
      } catch (err) {
        // Le partage a échoué (adresse sans compte Google, par exemple) : la
        // copie existe quand même, on le signale sans tout annuler.
        return json({
          ok: true,
          url: copie.getUrl(),
          avertissement: 'Copie créée, mais le partage avec ' + demande.partager_avec + ' a échoué.',
        });
      }
    }

    return json({ ok: true, url: copie.getUrl() });
  } catch (err) {
    return json({ ok: false, erreur: String(err) });
  }
}

/**
 * Le dossier où déposer les copies.
 *
 * DOSSIER_ID s'il est renseigné ; sinon le dossier « Classeurs de correction »,
 * retrouvé par son nom, et créé au premier appel s'il n'existe pas encore.
 */
function dossierCible() {
  if (DOSSIER_ID) return DriveApp.getFolderById(DOSSIER_ID);

  var existants = DriveApp.getFoldersByName(DOSSIER_NOM);
  if (existants.hasNext()) return existants.next();
  return DriveApp.createFolder(DOSSIER_NOM);
}

/** « .../spreadsheets/d/ABC123/edit » → « ABC123 ». */
function extraireId(url) {
  if (!url) return null;
  var m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Déjà un identifiant nu.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(String(url))) return String(url);
  return null;
}

function json(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
