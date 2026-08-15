/**
 * QUI NOTE QUOI — la décision, écrite une fois, lisible partout.
 *
 * Fichier volontairement SANS aucun import : serveur et client le lisent tel
 * quel.
 *
 * Le système a trois façons de noter une copie. Elles ne sont pas trois étapes
 * d'une migration : ce sont trois réponses à trois formes d'épreuve. Une
 * matière n'a pas vocation à passer de l'une à l'autre.
 *
 *   • `grille_generique` — UNE grille par épreuve, la même pour tous les
 *     sujets. Un commentaire de français se juge sur la compréhension du
 *     texte, l'analyse, l'organisation et l'expression, que le texte soit de
 *     Hugo ou de Colette. Écrire un barème par sujet n'apporterait rien : les
 *     critères ne changent pas d'un sujet à l'autre.
 *
 *   • `bareme_sujet` — UN barème par bac blanc, question par question. En
 *     maths, « exercice 2 question b » vaut 3 points DANS CE SUJET-LÀ : les
 *     questions changent à chaque épreuve, donc les points aussi. Aucune grille
 *     commune ne peut dire combien vaut une question qui n'existe que dans ce
 *     sujet.
 *
 *   • `criteres_rediges` — une grille par exercice, comme la première, mais
 *     avec des critères entièrement rédigés, une échelle de travail sur 20
 *     convertie en note officielle, et un verrouillage. C'est ce qu'exige
 *     l'HGGSP, dont l'épreuve vaut dissertation /10 + étude critique /10.
 *
 * Ce tableau sert à ne PAS reprocher à une matière ce qu'elle n'a pas à
 * faire : sans lui, le pilotage réclamait un « barème propre au sujet » au
 * français et à la philosophie, où il n'y en aura jamais.
 */

export type MoteurNote = 'grille_generique' | 'bareme_sujet' | 'criteres_rediges';

export const MOTEUR_ATTENDU: Record<string, MoteurNote> = {
  // Épreuves rédigées : une grille commune suffit, et c'est voulu.
  francais: 'grille_generique',
  philosophie: 'grille_generique',
  'histoire-geo': 'grille_generique',
  ses: 'grille_generique',
  hlp: 'grille_generique',
  svt: 'grille_generique',

  // Épreuve rédigée à deux exercices notés séparément, avec conversion.
  hggsp: 'criteres_rediges',

  // Épreuves à questions : les points dépendent du sujet, pas de la matière.
  maths: 'bareme_sujet',
  'physique-chimie': 'bareme_sujet',
  brevet_francais: 'bareme_sujet',
  brevet_mathematiques: 'bareme_sujet',
};

/** Par défaut, une matière inconnue se note à la grille commune. */
export function moteurAttendu(matiere: string): MoteurNote {
  return MOTEUR_ATTENDU[matiere] ?? 'grille_generique';
}

/** Ce qu'il faut définir dans cette matière, en une phrase. */
export const CE_QUI_SE_DEFINIT: Record<MoteurNote, string> = {
  grille_generique:
    'Une grille par épreuve, la même pour tous les sujets. Rien à écrire à chaque nouveau bac blanc : on ajoute seulement le sujet.',
  bareme_sujet:
    'Un barème par bac blanc, question par question. À écrire pour chaque nouveau sujet, parce que les questions changent.',
  criteres_rediges:
    'Une grille rédigée par exercice, verrouillée une fois pour toutes. Rien à écrire à chaque nouveau bac blanc : on ajoute seulement le sujet.',
};

/** Le nom court du moteur, pour une pastille. */
export const LIBELLE_MOTEUR: Record<MoteurNote, string> = {
  grille_generique: 'grille commune',
  bareme_sujet: 'barème du sujet',
  criteres_rediges: 'grille rédigée',
};
