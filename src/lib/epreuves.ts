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
  if (!composition || !partie) return null;

  const detail = composition.parties.map((p) => `${p.points}`).join(' + ');
  return (
    `${partie.libelle} : cette partie vaut ${partie.points} points. ` +
    `Rendue seule, la copie est donc notée sur ${partie.points}, pas sur 20. ` +
    `L’épreuve entière fait ${composition.total} points (${detail}).`
  );
}
