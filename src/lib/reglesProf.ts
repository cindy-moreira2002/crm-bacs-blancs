/**
 * Règles du jeu prof (slides « Ambassadeur » / « Devenir coach »).
 *
 * Module sans dépendance serveur : lu à la fois par l'API (qui fait respecter
 * le seuil) et par le tableau de bord (qui l'explique). Changer un chiffre ici
 * le change partout.
 */
/** Élèves à faire inscrire avec son code avant de pouvoir coacher un bac blanc. */
export const SEUIL_COACH = 3;
/** Net versé au prof par élève inscrit avec son code, une fois la matinée réglée. */
export const GAIN_PAR_ELEVE = 10;
/** Net minimum versé au coach pour une matinée de bac blanc (3 à 4 h). */
export const GAIN_PAR_MATINEE = 85;
