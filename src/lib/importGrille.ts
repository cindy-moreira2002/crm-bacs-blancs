/**
 * Import de la grille de correction exportée du Google Sheet.
 *
 * TROIS MISES EN PAGE SONT ACCEPTÉES, et c'est volontaire :
 *
 *   • le classeur guideline de la matière, élèves EN COLONNES — le barème à
 *     gauche, puis deux colonnes par élève (« niveau ? » et « commentaire ») ;
 *   • le classeur guideline, élèves EN BLOCS — un bloc de lignes par élève ;
 *   • la grille à plat — une ligne par élève, une colonne par critère (l'ancien
 *     classeur `Grilles_correction_MatineesDuBac`).
 *
 * Dans les deux premières, la note n'est pas saisie : elle est ADDITIONNÉE à
 * partir des paliers cochés (voir `guidelineSheet.ts`).
 *
 * Le prof ne choisit rien : la mise en page est reconnue à la lecture, et les
 * trois ressortent sous la MÊME forme (`RapportImport`). Tout ce qui suit —
 * écran de relecture, enregistrement, génération des dossiers — n'en connaît
 * qu'une.
 *
 * Ce module :
 *   1. lit le CSV (virgule ou point-virgule, guillemets, BOM Excel) ;
 *   2. reconnaît les colonnes, y compris les critères qu'on ne connaît pas
 *      d'avance : ils deviennent les champs du formulaire de correction ;
 *   3. rapproche chaque ligne d'un élève réellement inscrit à la session ;
 *   4. signale ce qui manque avant de laisser générer quoi que ce soit.
 *
 * Aucun écrit en base ici : cette étape ne fait qu'analyser, pour que le prof
 * puisse relire et corriger avant de valider.
 */
import type { EleveSession } from '@/lib/espaceProf';
import {
  estFeuilleACocher,
  estGuidelineACorriger,
  lireFeuilleACocher,
  lireGuidelineCorrigee,
  type CopieCochee,
} from '@/lib/guidelineSheet';

// --- Lecture du CSV ---------------------------------------------------

/** Sépare les colonnes selon le caractère le plus fréquent hors guillemets. */
function detecterSeparateur(entete: string): string {
  const candidats = [';', ',', '\t'];
  let meilleur = ',';
  let max = 0;
  for (const c of candidats) {
    const n = entete.split(c).length - 1;
    if (n > max) { max = n; meilleur = c; }
  }
  return meilleur;
}

/**
 * Parseur CSV minimal mais correct : gère les guillemets, les guillemets
 * échappés ("" à l'intérieur d'un champ) et les retours à la ligne dans une
 * cellule — fréquents dans une appréciation rédigée.
 */
export function lireCsv(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const premiereLigne = contenu.split('\n')[0] ?? '';
  const sep = detecterSeparateur(premiereLigne);

  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let dansGuillemets = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];

    if (dansGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = false;
      } else {
        champ += c;
      }
      continue;
    }

    if (c === '"') { dansGuillemets = true; continue; }
    if (c === sep) { ligne.push(champ); champ = ''; continue; }
    if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; continue; }
    champ += c;
  }
  ligne.push(champ);
  lignes.push(ligne);

  // On jette les lignes entièrement vides (fin de fichier, lignes de garde).
  return lignes.filter((l) => l.some((c) => c.trim() !== ''));
}

// --- Reconnaissance des colonnes --------------------------------------

export type RoleColonne = 'eleve' | 'email' | 'note' | 'critere' | 'ignoree';

export type Colonne = {
  index: number;
  entete: string;
  cle: string;
  role: RoleColonne;
};

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ALIAS_ELEVE = ['eleve', 'nom', 'nom eleve', 'nom de l eleve', 'nom prenom', 'prenom nom', 'etudiant', 'candidat'];
const ALIAS_EMAIL = ['email', 'e mail', 'mail', 'adresse mail', 'email eleve'];
const ALIAS_NOTE = ['note', 'note 20', 'note sur 20', 'note finale', 'total', 'note globale'];

function roleDeColonne(entete: string): RoleColonne {
  const n = normaliser(entete);
  if (!n) return 'ignoree';
  if (ALIAS_ELEVE.includes(n)) return 'eleve';
  if (ALIAS_EMAIL.includes(n)) return 'email';
  if (ALIAS_NOTE.includes(n)) return 'note';
  // Tout le reste est un critère de correction : c'est volontaire, la grille
  // change d'une matière à l'autre et on ne veut pas la figer dans le code.
  return 'critere';
}

/** Clé stable pour un critère, réutilisée comme nom de champ du formulaire. */
function cleColonne(entete: string, index: number): string {
  const base = normaliser(entete).replace(/ /g, '_');
  return base || `colonne_${index + 1}`;
}

export function reconnaitreColonnes(entetes: string[]): Colonne[] {
  const vues = new Set<string>();
  return entetes.map((entete, index) => {
    const role = roleDeColonne(entete);
    let cle = cleColonne(entete, index);
    // Deux colonnes homonymes ne doivent pas s'écraser.
    while (vues.has(cle)) cle = `${cle}_${index}`;
    vues.add(cle);
    return { index, entete: entete.trim(), cle, role };
  });
}

// --- Rapprochement avec les élèves inscrits ---------------------------

/**
 * Compare deux noms en ignorant accents, casse, ponctuation et ordre des mots :
 * « Rousseau Emma » et « Emma ROUSSEAU » sont la même personne.
 */
function memeNom(a: string, b: string): boolean {
  const mots = (s: string) => normaliser(s).split(' ').filter(Boolean).sort().join(' ');
  return mots(a) === mots(b) && mots(a) !== '';
}

/**
 * Retrouve l'élève d'une ligne : e-mail d'abord (fiable), nom ensuite, prénom
 * seul en dernier recours — les feuilles à cocher ne portent souvent qu'un
 * prénom. Un prénom porté par deux élèves n'est jamais tranché tout seul.
 */
function rapprocher(
  eleves: EleveSession[],
  nomBrut: string,
  emailBrut: string,
): { eleve: EleveSession | null; probleme: string | null } {
  if (emailBrut) {
    const parMail = eleves.find((e) => (e.email ?? '').toLowerCase() === emailBrut);
    if (parMail) return { eleve: parMail, probleme: null };
  }
  if (!nomBrut) {
    return { eleve: null, probleme: 'Ligne sans nom ni e-mail d’élève.' };
  }

  const exact = eleves.find((e) => memeNom(e.nom, nomBrut));
  if (exact) return { eleve: exact, probleme: null };

  const mots = normaliser(nomBrut).split(' ').filter(Boolean);
  if (mots.length === 1) {
    const homonymes = eleves.filter((e) =>
      normaliser(e.nom).split(' ').includes(mots[0]),
    );
    if (homonymes.length === 1) return { eleve: homonymes[0], probleme: null };
    if (homonymes.length > 1) {
      return {
        eleve: null,
        probleme: `Plusieurs élèves s’appellent « ${nomBrut} » (${homonymes
          .map((e) => e.nom)
          .join(', ')}). Écris le nom complet dans le classeur.`,
      };
    }
  }

  return {
    eleve: null,
    probleme: `« ${nomBrut} » ne correspond à aucun élève inscrit à cette session.`,
  };
}

export type LigneImportee = {
  numero: number;
  nomBrut: string;
  eleveId: string | null;
  eleveNom: string | null;
  note: number | null;
  criteres: Record<string, string>;
  problemes: string[];
  prete: boolean;
};

export type RapportImport = {
  /** `plat` = une ligne par élève ; `cochee` = la feuille des guidelines. */
  format: 'plat' | 'cochee';
  colonnes: Colonne[];
  lignes: LigneImportee[];
  elevesSansLigne: { id: string; nom: string }[];
  resume: {
    total: number;
    pretes: number;
    nonReconnues: number;
    incompletes: number;
  };
  erreursFichier: string[];
};

/**
 * Analyse le CSV au regard des élèves réellement inscrits.
 * Ne modifie rien : renvoie ce qui est prêt et ce qui bloque.
 */
export function analyserGrille(csv: string, eleves: EleveSession[]): RapportImport {
  const erreursFichier: string[] = [];
  const table = lireCsv(csv);

  // Les classeurs guideline passent par un autre lecteur, qui rend exactement
  // la même chose. Deux mises en page existent : les élèves en colonnes (la
  // plus récente, barème et correction sur la même page) et les élèves en
  // blocs de lignes.
  if (estGuidelineACorriger(table)) {
    return analyserFeuilleCochee(lireGuidelineCorrigee(table).copies, eleves);
  }
  if (estFeuilleACocher(table)) {
    return analyserFeuilleCochee(lireFeuilleACocher(table), eleves);
  }

  if (table.length < 2) {
    return {
      format: 'plat',
      colonnes: [],
      lignes: [],
      elevesSansLigne: eleves.map((e) => ({ id: e.id, nom: e.nom })),
      resume: { total: 0, pretes: 0, nonReconnues: 0, incompletes: 0 },
      erreursFichier: ['Le fichier ne contient pas de données : il faut une ligne d’en-tête puis une ligne par élève.'],
    };
  }

  const colonnes = reconnaitreColonnes(table[0]);
  const colEleve = colonnes.find((c) => c.role === 'eleve');
  const colEmail = colonnes.find((c) => c.role === 'email');
  const colNote = colonnes.find((c) => c.role === 'note');
  const criteres = colonnes.filter((c) => c.role === 'critere');

  if (!colEleve && !colEmail) {
    erreursFichier.push(
      'Aucune colonne « Élève » ni « E-mail » trouvée : impossible de savoir à qui correspond chaque ligne. Renomme la première colonne en « Élève ».',
    );
  }
  if (criteres.length === 0) {
    erreursFichier.push('Aucune colonne de critère trouvée : la grille semble vide.');
  }

  const dejaPris = new Set<string>();
  const lignes: LigneImportee[] = [];

  for (let i = 1; i < table.length; i++) {
    const cellules = table[i];
    const lire = (c: Colonne | undefined) =>
      c ? (cellules[c.index] ?? '').trim() : '';

    const nomBrut = lire(colEleve);
    const emailBrut = lire(colEmail).toLowerCase();
    const problemes: string[] = [];

    // Rapprochement : e-mail d'abord (fiable), nom ensuite (tolérant).
    const { eleve, probleme } = rapprocher(eleves, nomBrut, emailBrut);

    if (!eleve) {
      problemes.push(probleme ?? 'Élève non reconnu.');
    } else if (dejaPris.has(eleve.id)) {
      problemes.push(`${eleve.nom} apparaît sur plusieurs lignes : garde une seule ligne par élève.`);
    } else {
      dejaPris.add(eleve.id);
    }

    // Note : on accepte « 14 », « 14,5 », « 14/20 ».
    let note: number | null = null;
    const noteBrute = lire(colNote);
    if (noteBrute) {
      const nettoyee = noteBrute.replace(',', '.').replace(/\s*\/\s*20$/, '').trim();
      const valeur = Number(nettoyee);
      if (Number.isNaN(valeur)) {
        problemes.push(`Note illisible : « ${noteBrute} ». Attendu un nombre entre 0 et 20.`);
      } else if (valeur < 0 || valeur > 20) {
        problemes.push(`Note hors barème : ${valeur}. Attendu entre 0 et 20.`);
      } else {
        note = valeur;
      }
    } else if (colNote) {
      problemes.push('Note manquante.');
    }

    const valeursCriteres: Record<string, string> = {};
    const vides: string[] = [];
    for (const c of criteres) {
      const valeur = lire(c);
      valeursCriteres[c.cle] = valeur;
      if (!valeur) vides.push(c.entete);
    }
    if (vides.length) {
      problemes.push(
        `Cellule${vides.length > 1 ? 's' : ''} vide${vides.length > 1 ? 's' : ''} : ${vides.join(', ')}.`,
      );
    }

    lignes.push({
      numero: i + 1,
      nomBrut: nomBrut || emailBrut,
      eleveId: eleve?.id ?? null,
      eleveNom: eleve?.nom ?? null,
      note,
      criteres: valeursCriteres,
      problemes,
      prete: problemes.length === 0,
    });
  }

  const elevesSansLigne = eleves
    .filter((e) => !dejaPris.has(e.id))
    .map((e) => ({ id: e.id, nom: e.nom }));

  return {
    format: 'plat',
    colonnes,
    lignes,
    elevesSansLigne,
    resume: {
      total: lignes.length,
      pretes: lignes.filter((l) => l.prete).length,
      nonReconnues: lignes.filter((l) => !l.eleveId).length,
      incompletes: lignes.filter((l) => l.eleveId && !l.prete).length,
    },
    erreursFichier,
  };
}

// --- La feuille à cocher des guidelines -------------------------------

/** Le libellé d'un critère tel qu'il s'affiche au prof : « Analyse du sujet /1 ». */
function enteteCritere(c: CopieCochee['criteres'][number]): string {
  return `${c.libelle} /${String(c.max).replace('.', ',')}`;
}

/** Ce qu'on garde d'un critère coché : le palier retenu, puis le commentaire. */
function valeurCritere(c: CopieCochee['criteres'][number]): string {
  const points = c.points === null ? '—' : String(c.points).replace('.', ',');
  const morceaux = [`${points} / ${String(c.max).replace('.', ',')}`];
  if (c.niveau && !/^\d/.test(c.niveau)) morceaux.push(c.niveau);
  if (c.commentaire) morceaux.push(c.commentaire);
  return morceaux.join(' — ');
}

/**
 * Lit la feuille à cocher d'une guideline et la rend sous la forme habituelle.
 *
 * La note n'est pas saisie : elle est CALCULÉE en additionnant les paliers
 * cochés. Si le barème de la feuille ne fait pas 20 (une seule partie d'épreuve
 * corrigée, par exemple), la note est ramenée sur 20 et la conversion est
 * écrite noir sur blanc — le prof la voit et peut la corriger à l'écran.
 */
function analyserFeuilleCochee(copies: CopieCochee[], eleves: EleveSession[]): RapportImport {
  const erreursFichier: string[] = [];

  if (copies.length === 0) {
    erreursFichier.push(
      'Aucun élève trouvé dans le classeur : il faut une colonne « niveau ? » par élève (avec son nom au-dessus), ou un bloc par élève commençant par son nom.',
    );
  }

  // Les critères de la première copie donnent les colonnes : dans une même
  // feuille, tous les élèves sont notés sur la même grille.
  const modele = copies[0]?.criteres ?? [];
  const colonnes: Colonne[] = modele.map((c, index) => ({
    index,
    entete: enteteCritere(c),
    cle: c.code,
    role: 'critere' as RoleColonne,
  }));

  const dejaPris = new Set<string>();
  const lignes: LigneImportee[] = copies.map((copie, i) => {
    const problemes: string[] = [...copie.avertissements];
    const { eleve, probleme } = rapprocher(eleves, copie.eleve, '');

    if (!eleve) problemes.push(probleme ?? 'Élève non reconnu.');
    else if (dejaPris.has(eleve.id)) {
      problemes.push(`${eleve.nom} apparaît dans plusieurs blocs : garde un seul bloc par élève.`);
    } else dejaPris.add(eleve.id);

    let note: number | null = copie.bareme > 0 ? copie.total : null;
    if (copie.bareme <= 0) {
      problemes.push('Aucun critère lu dans ce bloc : la note ne peut pas être calculée.');
    } else if (Math.abs(copie.bareme - 20) > 0.01) {
      note = Math.round((copie.total * 20) / copie.bareme * 100) / 100;
      problemes.push(
        `Barème de la feuille : ${String(copie.bareme).replace('.', ',')} points. ` +
          `Note ramenée sur 20 (${String(copie.total).replace('.', ',')} → ${String(note).replace('.', ',')}). ` +
          'Corrige-la ci-dessous si l’épreuve se note autrement.',
      );
    }

    const criteres: Record<string, string> = {};
    for (const c of copie.criteres) criteres[c.code] = valeurCritere(c);

    return {
      numero: i + 1,
      nomBrut: copie.eleve,
      eleveId: eleve?.id ?? null,
      eleveNom: eleve?.nom ?? null,
      note,
      criteres,
      problemes,
      prete: problemes.length === 0,
    };
  });

  const elevesSansLigne = eleves
    .filter((e) => !dejaPris.has(e.id))
    .map((e) => ({ id: e.id, nom: e.nom }));

  return {
    format: 'cochee',
    colonnes,
    lignes,
    elevesSansLigne,
    resume: {
      total: lignes.length,
      pretes: lignes.filter((l) => l.prete).length,
      nonReconnues: lignes.filter((l) => !l.eleveId).length,
      incompletes: lignes.filter((l) => l.eleveId && !l.prete).length,
    },
    erreursFichier,
  };
}
