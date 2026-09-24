/**
 * Lecture des « guidelines de correction » — les classeurs par matière que les
 * professeurs utilisent réellement pour corriger.
 *
 * UN classeur, DEUX lectures :
 *
 *   1. le BARÈME — parties, blocs (A, B, C…), critères notés sur un nombre de
 *      points, et sous chaque critère les paliers avec leur descripteur ;
 *   2. la CORRECTION — les cases cochées par le professeur, élève par élève.
 *
 * Les classeurs n'ont pas tous la même mise en page, et ce module les lit tous
 * sans qu'on ait à choisir :
 *
 *   • **élèves en colonnes** (SES, maths, la forme la plus récente) : le
 *     barème occupe les premières colonnes, puis chaque élève a deux colonnes,
 *     « niveau ? » (une case à cocher par palier) et « commentaire » ;
 *   • **élèves en blocs** (HGGSP V0) : une page séparée, un bloc de lignes par
 *     élève, une case par palier ;
 *   • **grille à plat** : une ligne par élève, une colonne par critère — c'est
 *     l'ancien classeur, il continue de passer (voir `importGrille.ts`).
 *
 * Ce module ne lit que du texte : ni base, ni réseau. Il signale ce qui est
 * douteux plutôt que de le deviner.
 *
 * Pourquoi ici plutôt que dans `importGrille.ts` : le même barème sert deux
 * choses qui ne doivent jamais diverger — ce que le prof coche, et ce que l'IA
 * applique quand elle rédige le dossier. Une seule lecture.
 */

// --- Petits outils ----------------------------------------------------

/** Enlève accents, casse et ponctuation : sert aux comparaisons d'en-têtes. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** « 0,75 » et « 0.75 » valent la même chose ; le reste vaut null. */
export function nombreFr(brut: string): number | null {
  const nettoye = brut.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(nettoye)) return null;
  const n = Number(nettoye);
  return Number.isFinite(n) ? n : null;
}

/** Arrondi au centième : les barèmes descendent au quart de point. */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

const VRAI = new Set(['true', 'vrai', 'oui', 'x', '1', 'coche', 'coché']);
const FAUX = new Set(['false', 'faux', 'non', '0']);

/** Une case à cocher exportée par Sheets vaut « TRUE » / « FALSE ». */
export function estCochee(brut: string): boolean {
  return VRAI.has(brut.trim().toLowerCase());
}

/**
 * La cellule n'est-elle qu'une case à cocher ? Une case cochée ou décochée ne
 * dit rien : ce n'est ni un critère, ni — surtout — le nom d'un élève. Sans ce
 * garde, un « FALSE » posé entre le nom et l'en-tête devenait le nom de la
 * colonne, et la copie ne se rapprochait plus d'aucun inscrit.
 */
function estCaseACocher(brut: string): boolean {
  const n = brut.trim().toLowerCase();
  return VRAI.has(n) || FAUX.has(n);
}

// --- Structure d'une guideline ---------------------------------------

export type NiveauGuideline = {
  /** Points obtenus si ce palier est retenu. */
  points: number;
  /** Le descripteur, tel qu'écrit par le prof qui a rédigé la grille. */
  libelle: string;
  /** Ligne du fichier : c'est là que se coche la case de l'élève. */
  ligne: number;
};

export type CritereGuideline = {
  /** Code stable, reconstruit depuis la place du critère : `P1.A.1`. */
  code: string;
  /** Partie de l'épreuve (« PARTIE I — DISSERTATION »), vide si absente. */
  partie: string;
  /** Bloc auquel il appartient (« A. Compréhension et traitement du sujet »). */
  bloc: string;
  /** Intitulé du critère, sans les points. */
  libelle: string;
  /** Points maximum du critère. */
  max: number;
  /** Paliers avec descripteur, du plus bas au plus haut. */
  niveaux: NiveauGuideline[];
  /** Ce que le correcteur doit regarder : les listes à puces de la grille. */
  evaluer: string[];
  /** Ligne du fichier où le critère est annoncé. */
  ligne: number;
};

export type Guideline = {
  parties: { libelle: string; points: number | null }[];
  criteres: CritereGuideline[];
  /** Somme des maxima des critères. */
  total: number;
  /** L'échelle globale indicative (« 15–16 : excellente copie »), si présente. */
  echelle: { plage: string; description: string }[];
  /** Ce que le fichier interdit explicitement au correcteur. */
  regles: { neFaitPas: string; fait: string }[];
  /** Tout ce que la lecture n'a pas su ranger : à relire à l'œil. */
  remarques: string[];
};

// --- Reconnaissance des lignes ---------------------------------------

/** « PARTIE I — DISSERTATION » */
const RE_PARTIE = /^partie\s+[ivx0-9]+\b/i;
/**
 * « A. Compréhension et traitement du sujet »
 *
 * Toutes les lettres, pas seulement A–E : l'étude critique de l'HGGSP va
 * jusqu'au bloc F (« F. Expression et présentation »). Une lettre non reconnue
 * ne fait pas perdre de points, mais elle laisse `lettreBloc` sur le bloc
 * précédent pendant que le rang repart à 1 — deux critères se retrouvent alors
 * avec le même code.
 */
const RE_BLOC = /^([A-Z])[.)]\s+(.{3,})$/;
/** « — /2,5 », « /1 » : des points, seuls dans leur cellule. */
const RE_POINTS_SEULS = /^[—–-]?\s*\/\s*(\d+(?:[,.]\d+)?)\s*$/;
/** « 1. Analyse du sujet — /1 » : l'intitulé et les points dans la même cellule. */
const RE_CRITERE_INLINE = /^(.*?)[—–-]?\s*\/\s*(\d+(?:[,.]\d+)?)\s*$/;
/** « 0,25 : réponse partielle » — palier et descripteur dans la même cellule. */
const RE_PALIER_INLINE = /^(\d+(?:[,.]\d+)?)\s*[:–—-]\s*(.+)$/;
/** « 0–0,25 » : palier donné en fourchette. On retient le haut de la fourchette. */
const RE_PALIER_PLAGE = /^(\d+(?:[,.]\d+)?)\s*[–—-]\s*(\d+(?:[,.]\d+)?)$/;

/** Les cellules de service qu'on ne range nulle part. */
function ligneDeService(label: string): boolean {
  const n = normaliser(label);
  return (
    n === '' ||
    n === 'niveau' ||
    n === 'niveaux' ||
    n === 'critere' ||
    n === 'criteres' ||
    n === 'attendu' ||
    n === 'attendus' ||
    n === 'points' ||
    n === 'bareme' ||
    n === 'descripteur de performance' ||
    n === 'note a cocher' ||
    n === 'note' ||
    n === 'eleve' ||
    n === 'eleves' ||
    n === 'ne pas toucher' ||
    n.startsWith('commentaire option') ||
    n.startsWith('niveau ')
  );
}

/** Titres de sections de bas de page : on arrête d'y chercher des critères. */
function sectionFinale(label: string): 'echelle' | 'regles' | 'bareme' | 'autre' | null {
  const n = normaliser(label);
  if (!n) return null;
  if (n.includes('echelle globale')) return 'echelle';
  if (n.includes('regles de correction')) return 'regles';
  if (n.startsWith('bareme synthetique')) return 'bareme';
  if (n.startsWith('verification du bareme')) return 'bareme';
  if (n.startsWith('total epreuve')) return 'bareme';
  if (n.startsWith('difference')) return 'autre';
  if (n.startsWith('important') || n.startsWith('point important')) return 'autre';
  return null;
}

/** Code stable d'un critère : sa place, pas son intitulé (qui sera retouché). */
function codeCritere(partie: number, bloc: string, rang: number): string {
  return `P${partie}.${bloc}.${rang}`;
}

/** Les colonnes réservées aux élèves : à ne jamais lire comme du barème. */
function bornerBareme(cells: string[], colonneMinEleve: number): string[] {
  return colonneMinEleve > 0 ? cells.slice(0, colonneMinEleve) : cells;
}

// --- Lecture du barème ------------------------------------------------

/**
 * Lit le barème d'une guideline, quelle que soit la colonne où il est écrit.
 *
 * Chaque matière a rédigé sa grille à sa main : les points sont tantôt collés
 * à l'intitulé, tantôt dans une colonne « Barème », tantôt en cinquième
 * colonne. On ne cherche donc pas une mise en page, on cherche des formes :
 * des points (« — /2 »), un palier (un nombre suivi d'un descripteur), un
 * bloc (« A. … »). Ce qui n'entre dans aucune part dans `remarques`.
 *
 * `colonneMinEleve` borne la lecture : au-delà commencent les colonnes des
 * élèves, qui ne sont pas du barème.
 */
export function lireGuideline(table: string[][], colonneMinEleve = 0): Guideline {
  const parties: { libelle: string; points: number | null }[] = [];
  const criteres: CritereGuideline[] = [];
  const echelle: { plage: string; description: string }[] = [];
  const regles: { neFaitPas: string; fait: string }[] = [];
  const remarques: string[] = [];

  // Le code d'un critère sert d'identifiant partout (import en base, cases
  // cochées par le prof) : deux critères ne peuvent pas porter le même. Un
  // classeur dont les blocs ne sont pas titrés proprement le ferait pourtant.
  // On garde donc trace de ce qui est déjà pris et on suffixe le doublon.
  const codesPris = new Set<string>();
  const codeUnique = (code: string): string => {
    if (!codesPris.has(code)) {
      codesPris.add(code);
      return code;
    }
    let n = 2;
    while (codesPris.has(`${code}bis${n}`)) n += 1;
    const unique = `${code}bis${n}`;
    codesPris.add(unique);
    remarques.push(
      `Deux critères portaient le code ${code} (bloc mal titré dans le classeur) : le second est lu sous ${unique}.`,
    );
    return unique;
  };

  let partieCourante = '';
  let indexPartie = 0;
  let blocCourant = '';
  let lettreBloc = 'A';
  let rangCritere = 0;
  let critere: CritereGuideline | null = null;
  let section: 'grille' | 'echelle' | 'regles' | 'bareme' | 'autre' = 'grille';

  // Une ligne « intitulé + points » peut être un BLOC (« A. Compréhension —
  // /2 », qui se subdivise) ou un CRITÈRE (« 1. Analyse du sujet — /1,5 »,
  // qui se coche). Les classeurs n'ont pas de convention commune : on ne le
  // décide donc pas sur la forme de l'intitulé, mais sur ce qui suit. Si une
  // autre ligne de points arrive tout de suite, c'était un bloc ; si un
  // palier ou une consigne arrive, c'était un critère.
  let enAttente: { libelle: string; max: number; ligne: number } | null = null;

  /** Le titre en attente était bien un critère : on le crée pour de bon. */
  const materialiser = (): CritereGuideline | null => {
    if (!enAttente) return critere;
    rangCritere += 1;
    if (indexPartie === 0) indexPartie = 1;
    critere = {
      code: codeUnique(codeCritere(indexPartie, lettreBloc, rangCritere)),
      partie: partieCourante,
      bloc: blocCourant,
      libelle: enAttente.libelle,
      max: enAttente.max,
      niveaux: [],
      evaluer: [],
      ligne: enAttente.ligne,
    };
    criteres.push(critere);
    enAttente = null;
    return critere;
  };

  /** Le titre en attente chapeautait d'autres titres : c'était un bloc. */
  const enFaireUnBloc = () => {
    if (!enAttente) return;
    blocCourant = enAttente.libelle;
    const lettre = enAttente.libelle.match(RE_BLOC);
    if (lettre) lettreBloc = lettre[1];
    rangCritere = 0;
    critere = null;
    enAttente = null;
  };

  for (let i = 0; i < table.length; i++) {
    const cells = bornerBareme(table[i] ?? [], colonneMinEleve).map((c) => (c ?? '').trim());
    const pleines = cells.filter((c) => c !== '');
    if (pleines.length === 0) continue;

    const bascule = sectionFinale(cells[0]) ?? sectionFinale(cells[1] ?? '');
    if (bascule) {
      section = bascule;
      critere = null;
      continue;
    }

    if (section === 'echelle') {
      if (cells[0] && cells[1] && !ligneDeService(cells[0])) {
        echelle.push({ plage: cells[0], description: cells[1] });
      }
      continue;
    }

    if (section === 'regles') {
      if (cells[0] || cells[1]) regles.push({ neFaitPas: cells[0] ?? '', fait: cells[1] ?? '' });
      continue;
    }

    if (section === 'bareme' || section === 'autre') {
      // Le barème synthétique répète ce qu'on a déjà lu ; on ne le relit pas.
      // Une nouvelle partie peut le suivre — mais seulement écrite en
      // capitales : dans le tableau de synthèse, « Partie 1 (QCM) » est une
      // ligne de récapitulatif, pas le début d'une partie d'épreuve.
      const titre = cells[0] ?? '';
      if (RE_PARTIE.test(titre) && titre === titre.toUpperCase()) section = 'grille';
      else continue;
    }

    // Une partie de l'épreuve : « PARTIE I — DISSERTATION | … | 10 points ».
    if (RE_PARTIE.test(cells[0] ?? '')) {
      // Un critère encore en attente appartient à la partie qui SE TERMINE.
      materialiser();
      partieCourante = cells[0];
      indexPartie += 1;
      // Les points d'une partie s'écrivent « 10 points » ou « — /10 ».
      const points = pleines
        .slice(1)
        .map((c) => {
          const seuls = c.match(RE_POINTS_SEULS);
          return seuls ? nombreFr(seuls[1]) : nombreFr(c.replace(/points?/i, '').trim());
        })
        .find((n) => n !== null);
      parties.push({ libelle: cells[0], points: points ?? null });
      blocCourant = '';
      lettreBloc = 'A';
      rangCritere = 0;
      critere = null;
      enAttente = null;
      continue;
    }

    // Des points seuls dans une cellule : « — /2 ». Leur intitulé est la
    // première cellule non vide de la ligne.
    const idxPoints = cells.findIndex((c) => RE_POINTS_SEULS.test(c));
    const idxLabel = cells.findIndex(
      (c, j) => c !== '' && j !== idxPoints && nombreFr(c) === null,
    );
    const label = idxLabel >= 0 ? cells[idxLabel] : '';
    const points = idxPoints >= 0 ? nombreFr(cells[idxPoints].match(RE_POINTS_SEULS)![1]) : null;

    // Un bloc sans points (« A. … » seul) : il chapeaute ce qui suit.
    if (RE_BLOC.test(label) && points === null && !RE_CRITERE_INLINE.test(label)) {
      materialiser();
      blocCourant = label;
      lettreBloc = label.match(RE_BLOC)![1];
      rangCritere = 0;
      critere = null;
      if (indexPartie === 0) indexPartie = 1;
      continue;
    }

    // Un intitulé ET des points, écrits ensemble ou séparément : bloc ou
    // critère, on ne le sait pas encore — cela dépend de la ligne suivante.
    const inline = label.match(RE_CRITERE_INLINE);
    const maxTitre =
      points ?? (inline && nombreFr(inline[2]) !== null ? nombreFr(inline[2]) : null);
    const libelleTitre = points !== null ? label : inline ? inline[1] : '';

    if (maxTitre !== null && libelleTitre.trim() !== '' && !ligneDeService(libelleTitre)) {
      // Un titre chassant l'autre : le précédent chapeautait celui-ci.
      enFaireUnBloc();
      enAttente = {
        libelle: libelleTitre.replace(/[—–-]\s*$/, '').trim(),
        max: maxTitre,
        ligne: i,
      };
      continue;
    }

    if (!critere && !enAttente) {
      if (label && !ligneDeService(label)) remarques.push(label);
      continue;
    }

    // Un palier : un nombre (ou une fourchette), puis un descripteur.
    const idxNombre = cells.findIndex(
      (c) => c !== '' && (nombreFr(c) !== null || RE_PALIER_PLAGE.test(c) || RE_PALIER_INLINE.test(c)),
    );
    if (idxNombre >= 0) {
      critere = materialiser();
      const brut = cells[idxNombre];
      const inlinePalier = brut.match(RE_PALIER_INLINE);
      const plage = brut.match(RE_PALIER_PLAGE);
      const valeur =
        nombreFr(brut) ??
        (plage ? nombreFr(plage[2]) : null) ??
        (inlinePalier ? nombreFr(inlinePalier[1]) : null);
      const descripteur =
        (inlinePalier ? inlinePalier[2].trim() : '') ||
        cells.slice(idxNombre + 1).find((c) => c !== '' && nombreFr(c) === null) ||
        '';
      if (valeur !== null && descripteur && critere) {
        critere.niveaux.push({ points: valeur, libelle: descripteur, ligne: i });
        continue;
      }
    }

    if (label && !ligneDeService(label)) {
      critere = materialiser();
      critere?.evaluer.push(label);
    }
  }

  materialiser();

  // Une partie annoncée sur X points sans aucun critère détaillé : ses points
  // manqueront au total. C'est le cas du QCM d'automatismes en maths de
  // première — le classeur l'assume, mais il faut le dire.
  for (const partie of parties) {
    if (partie.points === null) continue;
    const detaillee = criteres.some((c) => c.partie === partie.libelle);
    if (!detaillee) {
      remarques.push(
        `« ${partie.libelle} » est annoncée sur ${partie.points} points mais n'a aucun critère détaillé : ces points ne sont pas dans le total lu.`,
      );
    }
  }

  for (const cr of criteres) {
    cr.niveaux.sort((x, y) => x.points - y.points);
    const trop = cr.niveaux.filter((n) => n.points > cr.max);
    if (trop.length) {
      remarques.push(
        `« ${cr.libelle} » : palier à ${trop[0].points} alors que le critère est sur ${cr.max}.`,
      );
    }
  }

  // Le plancher du barème. Un palier écrit en fourchette (« 0–0,5 ») est lu au
  // plus haut : le prof coche une case, il faut bien retenir un nombre. Quand
  // un critère n'offre aucun palier à 0, il devient donc impossible de ne rien
  // accorder dessus — et une copie cochée partout au plus bas ne peut pas
  // descendre sous une certaine note. Ce n'est pas une décision de correction,
  // c'est un effet de la mise en forme du classeur : on le dit, une fois, avec
  // le chiffre, plutôt qu'en un avertissement par critère.
  const notes = criteres.filter((c) => c.niveaux.length);
  const sansZero = notes.filter((c) => Math.min(...c.niveaux.map((n) => n.points)) > 0);
  if (sansZero.length) {
    const plancher = arrondi(
      notes.reduce((s, c) => s + Math.min(...c.niveaux.map((n) => n.points)), 0),
    );
    const max = arrondi(criteres.reduce((s, c) => s + c.max, 0));
    remarques.push(
      `${sansZero.length} critère(s) sur ${notes.length} n'ont aucun palier à 0 (paliers bas écrits en fourchette) : ` +
        `une copie cochée partout au plus bas obtient ${plancher} sur ${max}, jamais moins.`,
    );
  }

  return {
    parties,
    criteres,
    total: arrondi(criteres.reduce((s, c) => s + c.max, 0)),
    echelle,
    regles,
    remarques,
  };
}

// --- Ce que le professeur a coché -------------------------------------

export type CritereCoche = {
  code: string;
  libelle: string;
  /** Partie de l'épreuve d'où vient le critère (vide s'il n'y en a qu'une). */
  partie: string;
  max: number;
  /** Points retenus = palier le plus haut coché ; null si rien n'est coché. */
  points: number | null;
  /** Le descripteur du palier retenu. */
  niveau: string;
  /** Tous les paliers cochés : sert aux avertissements. */
  cochees: number[];
  commentaire: string;
};

export type CopieCochee = {
  /** Ce qui est écrit dans la colonne (ou le bloc) de l'élève. */
  eleve: string;
  criteres: CritereCoche[];
  /** Somme des points retenus. */
  total: number;
  /** Somme des maxima des critères rencontrés. */
  bareme: number;
  /** Ce qui doit être relu avant de générer quoi que ce soit. */
  avertissements: string[];
};

/** Une colonne d'élève : ses cases à cocher et, à côté, ses commentaires. */
export type ColonneEleve = {
  nom: string;
  colonneCase: number;
  colonneCommentaire: number | null;
};

/**
 * Repère les colonnes d'élèves d'un classeur guideline.
 *
 * Elles se reconnaissent à leur en-tête « niveau ? » (suivie le plus souvent
 * d'une colonne « commentaire »), et le nom de l'élève est écrit au-dessus,
 * sous le titre « Élèves ».
 */
export function repererElevesColonnes(table: string[][]): ColonneEleve[] {
  for (let i = 0; i < Math.min(table.length, 40); i++) {
    const cells = (table[i] ?? []).map((c) => (c ?? '').trim());
    const colonnes: ColonneEleve[] = [];

    for (let j = 0; j < cells.length; j++) {
      if (!normaliser(cells[j]).startsWith('niveau')) continue;
      // Il faut la colonne « commentaire » juste à côté : sans elle, ce
      // « Niveau » est l'en-tête du tableau des paliers du barème, pas la
      // colonne d'un élève.
      const suivante = normaliser(cells[j + 1] ?? '');
      if (!suivante.startsWith('commentaire')) continue;
      const colonneCommentaire = j + 1;

      // Le nom est écrit plus haut, dans la même colonne (ou la précédente
      // quand le nom chapeaute les deux colonnes de l'élève).
      let nom = '';
      for (let k = i - 1; k >= 0 && !nom; k--) {
        const ligne = (table[k] ?? []).map((c) => (c ?? '').trim());
        const candidat = ligne[j] || '';
        if (candidat && !ligneDeService(candidat) && !estCaseACocher(candidat)) nom = candidat;
      }
      colonnes.push({
        nom: nom || `Élève ${colonnes.length + 1}`,
        colonneCase: j,
        colonneCommentaire,
      });
    }

    if (colonnes.length) return colonnes;
  }
  return [];
}

/** Le classeur porte-t-il des colonnes d'élèves ? */
export function estGuidelineACorriger(table: string[][]): boolean {
  return repererElevesColonnes(table).length > 0;
}

/**
 * Lit un classeur guideline « élèves en colonnes » : le barème d'un côté, une
 * paire de colonnes par élève de l'autre.
 *
 * Règle des cases, la même partout : **le palier le plus haut coché fait foi**
 * — que le prof coche une seule case (le niveau atteint) ou toutes les cases
 * jusqu'à ce niveau. Un critère sans case cochée n'est jamais compté 0 en
 * silence : il remonte en avertissement.
 */
export function lireGuidelineCorrigee(table: string[][]): {
  guideline: Guideline;
  copies: CopieCochee[];
} {
  const colonnes = repererElevesColonnes(table);
  const premiere = colonnes.length ? Math.min(...colonnes.map((c) => c.colonneCase)) : 0;
  const guideline = lireGuideline(table, premiere);

  const lire = (ligne: number, colonne: number | null) =>
    colonne === null ? '' : ((table[ligne] ?? [])[colonne] ?? '').trim();

  // Le classeur prévoit plus de colonnes que d'élèves : une colonne restée
  // « Élève 7 » sans aucune case cochée n'est pas une copie. Un vrai nom sans
  // case, lui, reste — le prof doit voir qu'il a oublié de corriger.
  const colonnesUtiles = colonnes.filter(
    (colonne) =>
      !/^[ée]l[èe]ve\s*\d+$/i.test(colonne.nom) ||
      guideline.criteres.some((c) =>
        c.niveaux.some((n) => estCochee(lire(n.ligne, colonne.colonneCase))),
      ),
  );

  const copies = colonnesUtiles.map((colonne) => {
    const avertissements: string[] = [];
    const criteres: CritereCoche[] = guideline.criteres.map((c) => {
      const cochees: number[] = [];
      let niveau = '';
      const commentaires: string[] = [];

      const commentaireCritere = lire(c.ligne, colonne.colonneCommentaire);
      if (commentaireCritere) commentaires.push(commentaireCritere);

      for (const n of c.niveaux) {
        if (estCochee(lire(n.ligne, colonne.colonneCase))) {
          cochees.push(n.points);
          if (n.points >= Math.max(...cochees)) niveau = n.libelle;
        }
        const commentaire = lire(n.ligne, colonne.colonneCommentaire);
        if (commentaire) commentaires.push(commentaire);
      }

      let points: number | null = null;
      if (cochees.length === 0) {
        avertissements.push(`Aucun niveau coché pour « ${c.libelle} ».`);
      } else {
        points = Math.max(...cochees);
        if (points > c.max) {
          avertissements.push(
            `« ${c.libelle} » : ${points} points cochés pour un critère sur ${c.max}.`,
          );
          points = c.max;
        }
      }

      return {
        code: c.code,
        libelle: c.libelle,
        partie: c.partie,
        max: c.max,
        points,
        niveau,
        cochees,
        commentaire: commentaires.join(' '),
      };
    });

    // Une épreuve au choix (philosophie : dissertation OU explication de
    // texte ; SES : dissertation OU épreuve composée) met les deux sujets
    // dans le même classeur. L'élève n'en traite qu'un : compter la partie
    // vide dans le barème diviserait sa note par deux. On ne retient donc
    // que les parties où le professeur a coché quelque chose.
    const partiesCochees = new Set(
      criteres.filter((c) => c.cochees.length > 0).map((c) => c.partie),
    );
    const retenus =
      partiesCochees.size > 0 && partiesCochees.size < new Set(criteres.map((c) => c.partie)).size
        ? criteres.filter((c) => partiesCochees.has(c.partie))
        : criteres;

    const ignorees = [...new Set(criteres.map((c) => c.partie))].filter(
      (p) => p && !retenus.some((c) => c.partie === p),
    );
    const avertissementsRetenus = avertissements.filter((a) =>
      retenus.some((c) => a.includes(c.libelle)),
    );
    for (const p of ignorees) {
      avertissementsRetenus.push(`« ${p} » n'a aucune case cochée : partie ignorée dans la note.`);
    }

    return {
      eleve: colonne.nom,
      criteres: retenus,
      total: arrondi(retenus.reduce((s, c) => s + (c.points ?? 0), 0)),
      bareme: arrondi(retenus.reduce((s, c) => s + c.max, 0)),
      avertissements: avertissementsRetenus,
    };
  });

  return { guideline, copies };
}

// --- L'autre mise en page : un bloc de lignes par élève ----------------

/** Reconnaît la page de correction en blocs (un élève par bloc de lignes). */
export function estFeuilleACocher(table: string[][]): boolean {
  for (const ligne of table.slice(0, 6)) {
    const cellules = (ligne ?? []).map((c) => normaliser(c ?? ''));
    const aEleve = cellules[0] === 'eleve';
    const aCriteres = cellules.some((c) => c.startsWith('criteres d evaluation') || c === 'criteres');
    const aCases = cellules.some((c) => c.startsWith('note a cocher'));
    if (aCases && (aEleve || aCriteres)) return true;
  }
  return false;
}

/**
 * Lit la page de correction en blocs : un bloc par élève, une case par palier.
 * Même règle que pour les colonnes : le palier le plus haut coché fait foi.
 */
export function lireFeuilleACocher(table: string[][]): CopieCochee[] {
  const copies: CopieCochee[] = [];
  let copie: CopieCochee | null = null;
  let critere: CritereCoche | null = null;

  const cellule = (ligne: string[], i: number) => (ligne[i] ?? '').trim();

  const cloreCritere = () => {
    if (!copie || !critere) return;
    if (critere.cochees.length === 0) {
      copie.avertissements.push(`Aucun niveau coché pour « ${critere.libelle} ».`);
    } else {
      critere.points = Math.max(...critere.cochees);
      if (critere.points > critere.max) {
        copie.avertissements.push(
          `« ${critere.libelle} » : ${critere.points} points cochés pour un critère sur ${critere.max}.`,
        );
        critere.points = critere.max;
      }
    }
    critere = null;
  };

  const cloreCopie = () => {
    cloreCritere();
    if (!copie) return;
    copie.total = arrondi(copie.criteres.reduce((s, c) => s + (c.points ?? 0), 0));
    copie.bareme = arrondi(copie.criteres.reduce((s, c) => s + c.max, 0));
    copies.push(copie);
    copie = null;
  };

  for (const ligne of table) {
    const a = cellule(ligne, 0);
    const label = cellule(ligne, 1);
    const case_ = cellule(ligne, 2);
    const commentaire = cellule(ligne, 3);

    if (normaliser(a) === 'eleve' && normaliser(label).startsWith('criteres')) continue;

    if (a) {
      cloreCopie();
      copie = { eleve: a, criteres: [], total: 0, bareme: 0, avertissements: [] };
    }
    if (!copie) continue;
    if (ligneDeService(label)) continue;

    const m = label.match(RE_CRITERE_INLINE);
    const max = m ? nombreFr(m[2]) : null;
    if (m && max !== null && normaliser(m[1]) !== '') {
      cloreCritere();
      critere = {
        code: normaliser(m[1]).replace(/ /g, '_') || `critere_${copie.criteres.length + 1}`,
        libelle: m[1].replace(/[—–-]\s*$/, '').trim(),
        partie: '',
        max,
        points: null,
        niveau: '',
        cochees: [],
        commentaire: '',
      };
      copie.criteres.push(critere);
      continue;
    }

    if (!critere) continue;

    const inline = label.match(RE_PALIER_INLINE);
    const plage = label.match(RE_PALIER_PLAGE);
    const points =
      nombreFr(label) ??
      (inline ? nombreFr(inline[1]) : null) ??
      (plage ? nombreFr(plage[2]) : null);

    if (points === null) continue;

    if (estCochee(case_)) {
      critere.cochees.push(points);
      const descripteur = inline ? inline[2].trim() : '';
      if (points >= Math.max(...critere.cochees)) {
        critere.niveau = descripteur || `${points} / ${critere.max}`;
      }
    }
    if (commentaire) {
      critere.commentaire = critere.commentaire
        ? `${critere.commentaire} ${commentaire}`
        : commentaire;
    }
  }

  cloreCopie();
  return copies;
}
