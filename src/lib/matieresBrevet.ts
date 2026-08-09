/**
 * Libellés du BREVET, côté interface.
 *
 * Fichier volontairement SANS aucun import : il est chargé aussi bien par des
 * composants client que par le serveur, exactement comme `matieres.ts` l'est
 * pour le baccalauréat.
 *
 * IL EST SÉPARÉ DE `matieres.ts` À DESSEIN. `LABELS_MATIERES` ne contient que
 * les matières du bac ; les deux matières du brevet ne s'y ajoutent pas. Un
 * écran qui liste les matières du bac ne peut donc pas proposer, par
 * inadvertance, une matière de brevet — et réciproquement.
 */

export const MATIERES_BREVET = ['brevet_francais', 'brevet_mathematiques'] as const;

export type MatiereBrevetUI = (typeof MATIERES_BREVET)[number];

export const LABELS_MATIERES_BREVET: Record<MatiereBrevetUI, string> = {
  brevet_francais: 'Français — Brevet',
  brevet_mathematiques: 'Mathématiques — Brevet',
};

/** Libellé court, pour les fils d'Ariane et les onglets. */
export const LABELS_COURTS_BREVET: Record<MatiereBrevetUI, string> = {
  brevet_francais: 'Français',
  brevet_mathematiques: 'Mathématiques',
};

/** Segment d'URL de chaque matière : /admin/brevet/<segment>. */
export const SEGMENT_MATIERE: Record<MatiereBrevetUI, string> = {
  brevet_francais: 'francais',
  brevet_mathematiques: 'mathematiques',
};

export const MATIERE_PAR_SEGMENT: Record<string, MatiereBrevetUI> = {
  francais: 'brevet_francais',
  mathematiques: 'brevet_mathematiques',
};

/**
 * Couleurs de repérage. Le brevet est en TEAL, le baccalauréat reste en
 * violet : la distinction doit se voir immédiatement, sans lire le titre.
 */
export const COULEURS_BREVET: Record<MatiereBrevetUI, { fond: string; texte: string; bord: string }> = {
  brevet_francais: { fond: 'bg-teal-50', texte: 'text-teal-800', bord: 'border-teal-300' },
  brevet_mathematiques: { fond: 'bg-cyan-50', texte: 'text-cyan-800', bord: 'border-cyan-300' },
};

export const BADGE_EXAMEN: Record<'BAC' | 'DNB', { texte: string; classe: string }> = {
  BAC: { texte: 'Baccalauréat', classe: 'bg-purple-100 text-purple-800 border-purple-300' },
  DNB: { texte: 'Brevet', classe: 'bg-teal-100 text-teal-900 border-teal-400' },
};

/** Les onglets de l'écran de correction, par matière. Jamais les mêmes. */
export const ONGLETS_CORRECTION: Record<MatiereBrevetUI, { code: string; libelle: string }[]> = {
  brevet_francais: [
    { code: 'texte', libelle: 'Texte et langue' },
    { code: 'reecriture', libelle: 'Réécriture' },
    { code: 'dictee', libelle: 'Dictée' },
    { code: 'redaction', libelle: 'Rédaction' },
    { code: 'synthese', libelle: 'Synthèse' },
  ],
  brevet_mathematiques: [
    { code: 'automatismes', libelle: 'Automatismes' },
    { code: 'exercices', libelle: 'Exercices' },
    { code: 'qualite_redaction', libelle: 'Qualité de la rédaction' },
    { code: 'synthese', libelle: 'Synthèse' },
  ],
};

/** Les blocs de barème affichés dans l'écran de configuration. */
export const BLOCS_PAR_MATIERE: Record<MatiereBrevetUI, { code: string; libelle: string; max: number }[]> = {
  brevet_francais: [
    { code: 'texte', libelle: 'Travail sur le texte (réécriture comprise)', max: 50 },
    { code: 'dictee', libelle: 'Dictée', max: 10 },
    { code: 'redaction', libelle: 'Rédaction', max: 40 },
  ],
  brevet_mathematiques: [
    { code: 'automatismes', libelle: 'Partie 1 — Automatismes', max: 6 },
    { code: 'raisonnement', libelle: 'Partie 2 — Raisonnement (rédaction comprise)', max: 14 },
  ],
};

export const TOTAL_PAR_MATIERE: Record<MatiereBrevetUI, number> = {
  brevet_francais: 100,
  brevet_mathematiques: 20,
};

export function estSegmentBrevet(segment: string): segment is 'francais' | 'mathematiques' {
  return segment === 'francais' || segment === 'mathematiques';
}
