/**
 * DE QUOI EST FAITE UNE ÉPREUVE, ET COMMENT ON ARRIVE À 20.
 *
 * Fichier volontairement SANS aucun import : serveur et client le lisent tel
 * quel.
 *
 * Toutes les épreuves ne se notent pas sur 20. Au bac de SES, le candidat
 * choisit entre une dissertation (sur 20) et une « épreuve composée » faite de
 * trois parties notées séparément : 4 + 6 + 10 = 20. Une copie de partie 1
 * rendue seule vaut donc bel et bien **sur 4 points**, et c'est juste.
 *
 * Sans ce fichier, l'écran affiche « 3,15 / 4 » sans dire de quoi il s'agit, et
 * on croit à un bug — c'est la question qui est revenue le 15 août 2026. Le
 * barème n'était pas faux : c'est l'écran qui ne disait pas ce qu'il montrait.
 */

export type PartieEpreuve = {
  exercise_type: string;
  /** « Partie 1 », « Étude critique »… */
  libelle: string;
  points: number;
};

export type CompositionEpreuve = {
  /** Nom de l'épreuve entière, tel qu'un professeur la nomme. */
  nom: string;
  /** Ce que vaut l'épreuve complète. */
  total: number;
  parties: PartieEpreuve[];
  /**
   * Précision qui évite un contresens — par exemple qu'on choisit entre deux
   * épreuves au lieu de les cumuler.
   */
  note?: string;
};

/**
 * Les épreuves découpées en parties notées séparément.
 *
 * Une matière absente d'ici a des épreuves qui valent chacune leur note
 * complète : il n'y a rien à expliquer de plus.
 */
export const COMPOSITIONS: Record<string, CompositionEpreuve[]> = {
  ses: [
    {
      nom: 'Épreuve composée',
      total: 20,
      parties: [
        { exercise_type: 'epreuve_composee_partie_1', libelle: 'Partie 1 — Mobilisation de connaissances', points: 4 },
        { exercise_type: 'epreuve_composee_partie_2', libelle: 'Partie 2 — Étude d’un document', points: 6 },
        { exercise_type: 'epreuve_composee_partie_3', libelle: 'Partie 3 — Raisonnement s’appuyant sur un dossier', points: 10 },
      ],
      note: 'Au bac, l’élève choisit ENTRE la dissertation (sur 20) ET l’épreuve composée (4 + 6 + 10 = 20). Les deux ne s’additionnent jamais.',
    },
  ],
  anglais: [
    {
      nom: 'Épreuve écrite de LLCER Anglais',
      total: 20,
      parties: [
        { exercise_type: 'llcer_synthese', libelle: 'Synthèse du dossier', points: 16 },
        { exercise_type: 'llcer_traduction', libelle: 'Traduction en français', points: 4 },
      ],
      note: 'Les deux parties sont passées par le même élève et s’additionnent. La synthèse se rédige en anglais à partir des trois documents ; la traduction porte sur un passage d’environ 500 signes tiré du dossier. Une traduction rendue seule est donc notée sur 4, et ce n’est pas un bug.',
    },
  ],
  // Ajouté le 20 septembre 2026, au format de la note de service du 11-9-2026
  // (BO spécial n° 4 du 17 septembre 2026, NOR MENE2622653N), qui entre en
  // vigueur À LA SESSION 2027 — donc dès nos bacs blancs. Elle abroge le texte
  // de 2020 : l'écrit ne se répartit plus en 7 + 8, mais en 6 + 7, plus DEUX
  // POINTS de maîtrise de la langue, nouveaux et communs à toutes les épreuves
  // du bac et du brevet (NOR MENE2623195N). 6 + 7 + 2 = 15.
  //
  // Les 5 points qui manquent pour faire 20 sont ceux de l'ECE : une heure en
  // salle de TP devant deux examinateurs, notée sur 20 puis ramenée à 5. Il n'y
  // a pas de copie, donc rien à corriger ici — un bac blanc de SVT se note sur
  // 15, et c'est la note juste. La ramener sur 20 inventerait 5 points que
  // personne n'a évalués.
  svt: [
    {
      nom: 'Écrit de SVT',
      total: 15,
      parties: [
        { exercise_type: 'svt_exercice_1', libelle: 'Exercice 1 — Mobilisation des connaissances', points: 6 },
        { exercise_type: 'svt_exercice_2', libelle: 'Exercice 2 — Pratique du raisonnement scientifique', points: 7 },
        { exercise_type: 'svt_maitrise_langue', libelle: 'Maîtrise de la langue (normes orthographiques et syntaxiques)', points: 2 },
      ],
      note: 'Depuis la session 2027 : exercice 1 sur 6 points, exercice 2 sur 7 points, et 2 points dédiés aux normes orthographiques et syntaxiques — 6 + 7 + 2 = 15. Les 5 points restants de l’épreuve du bac sont ceux de l’ECE, passée en salle de TP devant deux examinateurs : Les Matinées du Bac ne corrigent que l’écrit, donc une copie se note sur 15, jamais sur 20.',
    },
  ],

  hggsp: [
    {
      nom: 'Épreuve d’HGGSP',
      total: 20,
      parties: [
        { exercise_type: 'hggsp_dissertation', libelle: 'Dissertation', points: 10 },
        { exercise_type: 'hggsp_etude_critique', libelle: 'Étude critique de document(s)', points: 10 },
      ],
      note: 'Les deux exercices sont passés par le même élève et s’additionnent. Chacun est d’abord noté sur une échelle de travail de 20, convertie en note officielle sur 10.',
    },
  ],
};

/**
 * Les épreuves qui ne valent pas 20 sans avoir, pour autant, des parties de
 * valeur fixe.
 *
 * La SVT est ce cas dès qu'on lui dépose autre chose qu'un de ses deux
 * exercices : l'écrit vaut 15 points et il faut pouvoir le dire, même quand
 * l'exercice déposé n'est pas reconnu.
 *
 * Une matière peut figurer ici ET dans `COMPOSITIONS` : la composition est
 * alors utilisée quand l'exercice déposé est une partie connue, et cette
 * échelle sert de repli pour tout le reste (sujet complet, exercice inconnu).
 */
export const ECHELLES: Record<string, { nom: string; total: number; note: string }> = {
  svt: {
    nom: 'Écrit de SVT',
    total: 15,
    note: 'Exercice 1 sur 6, exercice 2 sur 7, et 2 points de maîtrise de la langue. L’ECE (5 points) se passe en salle de TP devant deux examinateurs : il n’y a pas de copie à corriger.',
  },
  // La physique-chimie N'EST PLUS notée sur 15, et c'est pour cela qu'elle ne
  // figure pas ici. La note de service du 11-9-2026 (NOR MENE2622644N, session
  // 2027) a changé le calcul : l'écrit est noté SUR 20 (trois exercices, dont
  // 2 points de maîtrise de la langue), l'ECE sur 20 elle aussi, et la note
  // finale vaut 0,8 × écrit + 0,2 × ECE. Une copie de physique-chimie se note
  // donc sur 20 comme les autres : il n'y a plus d'échelle à expliquer.
};

/**
 * Sur combien de points se note une copie de cette matière.
 *
 * 20 partout, SAUF la SVT : son écrit vaut 15 points, les 5 autres étant ceux
 * de l'ECE, qu'aucune copie ne porte. Écrire 20 pour la SVT ferait échouer la
 * vérification du barème (« le total vaut 15 au lieu de 20 ») sur un barème
 * pourtant juste — c'est arrivé le 20 septembre 2026, au premier sujet de SVT.
 */
export function maxScoreEpreuve(matiere: string): number {
  return ECHELLES[matiere]?.total ?? 20;
}

/** L'épreuve dont cet exercice est une partie, s'il en est une. */
export function compositionDe(matiere: string, exerciseType: string): CompositionEpreuve | null {
  for (const c of COMPOSITIONS[matiere] ?? []) {
    if (c.parties.some((p) => p.exercise_type === exerciseType)) return c;
  }
  return null;
}

/** La partie elle-même, avec ce qu'elle vaut. */
export function partieDe(matiere: string, exerciseType: string): PartieEpreuve | null {
  const c = compositionDe(matiere, exerciseType);
  return c?.parties.find((p) => p.exercise_type === exerciseType) ?? null;
}

/**
 * Une phrase qui explique une note qui n'est pas sur 20.
 *
 * Rend `null` quand il n'y a rien à expliquer : une dissertation sur 20 se
 * passe de commentaire, et une phrase inutile est du bruit.
 */
export function expliquerEchelle(matiere: string, exerciseType: string): string | null {
  const composition = compositionDe(matiere, exerciseType);
  const partie = partieDe(matiere, exerciseType);

  // Pas de partie reconnue : l'épreuve entière, ou un exercice qu'on ne sait
  // pas rattacher. Reste à dire l'essentiel — sur combien la copie est notée.
  if (!composition || !partie) {
    const echelle = ECHELLES[matiere];
    if (!echelle) return null;
    return `${echelle.nom} : la copie est notée sur ${echelle.total}, pas sur 20. ${echelle.note}`;
  }

  const detail = composition.parties.map((p) => `${p.points}`).join(' + ');
  return (
    `${partie.libelle} : cette partie vaut ${partie.points} points. ` +
    `Rendue seule, la copie est donc notée sur ${partie.points}, pas sur 20. ` +
    `L’épreuve entière fait ${composition.total} points (${detail}).`
  );
}
