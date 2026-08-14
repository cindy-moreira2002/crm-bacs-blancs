/**
 * Le cookie d'état de la liaison Discord.
 *
 * Il vit dans son propre fichier parce que les deux routes du parcours (départ
 * et retour) doivent en parler exactement de la même façon, et qu'un fichier
 * `route.ts` de Next n'a pas le droit d'exporter autre chose que ses gestionnaires.
 */
export const COOKIE_ETAT_DISCORD = 'mdb_discord_etat';

/** Le temps d'aller cliquer « Autoriser » et de revenir. Au-delà, on recommence. */
export const VALIDITE_ETAT_S = 10 * 60;

/**
 * Ce que l'espace affiche après un retour de Discord (`?discord=…`).
 *
 * Chaque cas dit ce qui s'est passé ET ce qu'il reste à faire : « ça n'a pas
 * marché » n'aide personne le matin d'une épreuve.
 */
export const MESSAGES_LIAISON: Record<string, { ton: 'ok' | 'erreur'; texte: string }> = {
  ok: {
    ton: 'ok',
    texte: 'Compte Discord relié. Ta salle t’attend : le bouton s’ouvre une heure avant l’épreuve.',
  },
  'acces-partiel': {
    ton: 'erreur',
    texte:
      'Compte relié, mais l’accès à ta salle n’a pas pu être posé. Préviens-nous : personne n’a besoin de recommencer, c’est à nous de le corriger.',
  },
  refuse: {
    ton: 'erreur',
    texte: 'Liaison annulée sur Discord. Tu peux réessayer quand tu veux.',
  },
  'etat-invalide': {
    ton: 'erreur',
    texte: 'Ce lien de liaison n’a pas été ouvert depuis ton espace. Repars du bouton ci-dessous.',
  },
  'etat-expire': {
    ton: 'erreur',
    texte: 'La liaison a mis trop de temps. Reclique sur le bouton, ça repart à zéro.',
  },
  'connecte-toi': {
    ton: 'erreur',
    texte: 'Ta session s’est fermée pendant la liaison. Reconnecte-toi, puis réessaie.',
  },
  'sans-inscription': {
    ton: 'erreur',
    texte: 'Aucune inscription à ce nom : rien à relier pour l’instant.',
  },
  'sans-code': { ton: 'erreur', texte: 'Discord n’a rien renvoyé. Réessaie.' },
  'echange-refuse': {
    ton: 'erreur',
    texte: 'Discord a refusé la liaison. Réessaie ; si ça recommence, préviens-nous.',
  },
  'serveur-refuse': {
    ton: 'erreur',
    texte: 'Impossible de t’ajouter au serveur Discord. Préviens-nous, c’est de notre côté.',
  },
  'role-refuse': {
    ton: 'erreur',
    texte:
      'Compte relié, mais le rôle « Prof » n’a pas pu être posé : le rôle est placé au-dessus de celui du bot sur Discord (étape G bis du guide).',
  },
  'sql-46': {
    ton: 'erreur',
    texte:
      'La base n’a pas encore les colonnes de liaison : le script 46 reste à jouer dans Supabase.',
  },
  'non-configure': {
    ton: 'erreur',
    texte: 'Discord n’est pas encore configuré sur le site.',
  },
  'ecriture-refusee': { ton: 'erreur', texte: 'La liaison n’a pas pu être enregistrée.' },
  imprevu: { ton: 'erreur', texte: 'La liaison n’a pas pu aller au bout.' },
};
