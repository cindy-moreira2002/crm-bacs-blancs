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
  // Épreuves rédigées : une grille commune suffit, et c'est voulu. On peut y
  // fixer d'avance ce que vaut l'introduction, la problématique, le plan — ces
  // critères ne dépendent pas du texte tombé le jour de l'épreuve.
  francais: 'grille_generique',
  philosophie: 'grille_generique',
  'histoire-geo': 'grille_generique',
  ses: 'grille_generique',
  hlp: 'grille_generique',

  // LLCER Anglais, ajouté le 16 août 2026. La synthèse — 16 des 20 points — est
  // une épreuve rédigée : ses critères (compréhension des trois documents, mise
  // en relation, argumentation, qualité de la langue) ne dépendent pas du
  // dossier tombé le jour de l'épreuve. D'où la grille commune.
  //
  // Réserve à connaître : la traduction, elle, se noterait mieux segment par
  // segment, donc au barème du sujet — le passage change à chaque fois. Une
  // matière n'ayant qu'un seul moteur, c'est la synthèse qui l'emporte, et le
  // découpage par segment vit dans le corrigé remis au professeur. À rouvrir si
  // les traductions se corrigent mal.
  anglais: 'grille_generique',

  // DÉCISION DE CINDY, 16 août 2026 : les épreuves à calculs reviennent au
  // barème par sujet. « Les calculs sont comptés comme des exercices » : un
  // exercice de maths, de physique ou de SVT se note en additionnant des
  // questions numérotées, et ce que vaut chaque question n'existe que dans CE
  // sujet-là. Aucune grille commune ne peut dire d'avance combien vaut la
  // question 2b.
  //
  // Cela annule la décision du 15 août (« pour maths, physique, il n'y a pas
  // de barème par copie »), qui les avait mises en grille commune. La
  // distinction qui tient, et qui est la sienne : épreuve découpée en
  // questions → barème par sujet ; épreuve rédigée → grille commune.
  //
  // Ce que cela engage concrètement : chaque nouveau bac blanc de ces trois
  // matières demande son barème, écrit dans /admin/bareme avant que la moindre
  // copie ne soit corrigée (voir GUIDE_BAREME_PAR_SUJET.md et
  // REGLES_TRANSVERSALES dans `baremeNoyau`).
  maths: 'bareme_sujet',
  'physique-chimie': 'bareme_sujet',
  svt: 'bareme_sujet',

  // Épreuve rédigée à deux exercices notés séparément, avec conversion.
  hggsp: 'criteres_rediges',

  // Le brevet, lui, a de vrais barèmes question par question déjà saisis.
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
