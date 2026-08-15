/**
 * Configuration de l'intégration Discord.
 *
 * Ce fichier ne fait AUCUN appel réseau : uniquement des constantes et des
 * fonctions pures. Il peut donc être importé partout, y compris par les tests
 * hors ligne, sans jamais toucher à Discord.
 *
 * Les cinq identifiants et les deux secrets vivent dans les variables
 * d'environnement Vercel. Aucune valeur n'est écrite ici : si l'intégration
 * n'est pas configurée, `discordManquant()` renvoie la liste des variables à
 * poser et l'interface affiche un message actionnable plutôt qu'une erreur 500.
 */

// --- Variables d'environnement ---------------------------------------

/** ⚠️ SERVEUR UNIQUEMENT — ne jamais exposer au navigateur. */
export const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';
/** ⚠️ SERVEUR UNIQUEMENT. */
export const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? '';

/** Publics : l'identifiant du client apparaît dans toute URL OAuth. */
export const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? '';
export const GUILD_ID = process.env.DISCORD_GUILD_ID ?? '';
export const ROLE_STAFF_ID = process.env.DISCORD_ROLE_STAFF_ID ?? '';
export const ROLE_PROF_ID = process.env.DISCORD_ROLE_PROF_ID ?? '';

/**
 * Variables absentes. Tant que la liste n'est pas vide, l'intégration est
 * considérée comme éteinte : les boutons Discord disparaissent des espaces et
 * le salon Jitsi historique reprend la main. C'est aussi la procédure de
 * désactivation propre — supprimer les variables suffit.
 */
export function discordManquant(): string[] {
  const manquants: string[] = [];
  if (!BOT_TOKEN) manquants.push('DISCORD_BOT_TOKEN');
  if (!CLIENT_ID) manquants.push('DISCORD_CLIENT_ID');
  if (!CLIENT_SECRET) manquants.push('DISCORD_CLIENT_SECRET');
  if (!GUILD_ID) manquants.push('DISCORD_GUILD_ID');
  if (!ROLE_STAFF_ID) manquants.push('DISCORD_ROLE_STAFF_ID');
  if (!ROLE_PROF_ID) manquants.push('DISCORD_ROLE_PROF_ID');
  return manquants;
}

export function discordConfigure(): boolean {
  return discordManquant().length === 0;
}

// --- Permissions Discord ----------------------------------------------

/**
 * Les bits de permission utilisés. Discord les manipule en entiers 64 bits :
 * on reste donc en BigInt de bout en bout, jamais en Number — au-delà de
 * 2^53 les arrondis de JavaScript fausseraient silencieusement les calculs.
 *
 * Écrit `BigInt(1) << BigInt(n)` et non `1n << 4n` : le projet cible ES2017,
 * où les littéraux BigInt ne compilent pas. Changer la cible du projet pour ce
 * seul fichier serait un effet de bord disproportionné.
 */
const bit = (rang: number): bigint => BigInt(1) << BigInt(rang);

export const PERM = {
  CREATE_INSTANT_INVITE: bit(0),
  ADMINISTRATOR: bit(3),
  MANAGE_CHANNELS: bit(4),
  VIEW_CHANNEL: bit(10),
  SEND_MESSAGES: bit(11),
  CONNECT: bit(20),
  SPEAK: bit(21),
  MANAGE_ROLES: bit(28),
} as const;

/**
 * Les sept permissions dont le bot a besoin, et pourquoi. Cette liste est la
 * référence : elle sert au contrôle de configuration ET à l'URL d'invitation,
 * donc ajouter une ligne ici suffit à corriger les deux.
 *
 * CONNECT et SPEAK figurent ici alors que le bot ne rejoint jamais un salon
 * vocal : Discord refuse qu'un bot ACCORDE une permission qu'il ne possède pas
 * lui-même, et la salle d'un élève lui accorde les deux. Sans SPEAK, la
 * création de chaque salle échoue en « 403 Missing Permissions » — alors que la
 * catégorie et les salons textuels, eux, se créent sans difficulté puisqu'ils
 * ne portent aucune permission vocale.
 */
export const PERMISSIONS_REQUISES: { bit: bigint; nom: string; pourquoi: string }[] = [
  {
    bit: PERM.CREATE_INSTANT_INVITE,
    nom: 'Créer une invitation',
    pourquoi: 'Exigée par l’API pour ajouter automatiquement un élève au serveur.',
  },
  {
    bit: PERM.MANAGE_CHANNELS,
    nom: 'Gérer les salons',
    pourquoi: 'Créer, renommer et supprimer la catégorie et les salons d’un bac blanc.',
  },
  {
    bit: PERM.MANAGE_ROLES,
    nom: 'Gérer les rôles',
    pourquoi: 'Écrire les permissions du salon — c’est ce qui le rend privé.',
  },
  {
    bit: PERM.VIEW_CHANNEL,
    nom: 'Voir les salons',
    pourquoi: 'Le bot ne peut pas gérer un salon qu’il ne voit pas.',
  },
  {
    bit: PERM.SEND_MESSAGES,
    nom: 'Envoyer des messages',
    pourquoi: 'Poster les consignes dans « informations » et « assistance-technique ».',
  },
  {
    bit: PERM.CONNECT,
    nom: 'Se connecter',
    pourquoi: 'Discord refuse d’accorder à un élève une permission que le bot n’a pas.',
  },
  {
    bit: PERM.SPEAK,
    nom: 'Parler',
    pourquoi:
      'Même règle que « Se connecter » : la salle accorde la parole à l’élève, donc le bot doit l’avoir pour la donner.',
  },
];

/** Somme des permissions requises — attendue dans l'URL d'invitation. */
export const PERMISSIONS_ATTENDUES = PERMISSIONS_REQUISES.reduce(
  (total, p) => total | p.bit,
  BigInt(0),
);

/** URL d'invitation du bot, reconstruite pour l'afficher dans l'administration. */
export function urlInvitationBot(): string | null {
  if (!CLIENT_ID) return null;
  return (
    'https://discord.com/oauth2/authorize' +
    `?client_id=${CLIENT_ID}&scope=bot&permissions=${PERMISSIONS_ATTENDUES}`
  );
}

// --- Liaison des comptes (OAuth2) --------------------------------------

/**
 * Les deux permissions demandées à l'élève ou au prof qui relie son compte.
 *
 * `identify` ne donne que l'identifiant, le pseudo et l'avatar — pas l'adresse
 * e-mail, qu'on connaît déjà et qu'on n'a aucune raison de redemander à
 * Discord. `guilds.join` autorise le bot à l'ajouter à NOTRE serveur, et à
 * aucun autre : c'est ce qui évite de faire circuler un lien d'invitation, que
 * n'importe qui pourrait transférer.
 */
export const SCOPES_LIAISON = 'identify guilds.join';

/**
 * L'adresse de retour, construite à partir du domaine réellement visité.
 *
 * Elle n'est pas figée dans une variable d'environnement parce que le site vit
 * sous trois adresses (le domaine, l'URL Vercel, localhost) et que Discord
 * compare cette valeur **caractère par caractère** avec la liste déclarée dans
 * le portail : la déduire de la requête garantit qu'elles coïncident, quel que
 * soit le chemin par lequel la personne est arrivée.
 */
export function urlRetourOAuth(origine: string): string {
  return `${origine.replace(/\/+$/, '')}/api/discord/oauth/retour`;
}

/**
 * L'écran d'autorisation Discord. `state` est une valeur signée par nous :
 * Discord nous la rend telle quelle au retour, ce qui permet de vérifier que
 * la réponse répond bien à une demande partie d'ici (et pas d'un lien piégé).
 */
export function urlAutorisation(origine: string, etat: string): string | null {
  if (!CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: urlRetourOAuth(origine),
    response_type: 'code',
    scope: SCOPES_LIAISON,
    state: etat,
    // Redemander l'écran à chaque fois : sans cela, Discord renvoie
    // silencieusement le compte déjà autorisé, et une personne qui a changé de
    // compte se retrouverait reliée à l'ancien sans comprendre pourquoi.
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

// --- Adresses ouvrables ------------------------------------------------

/**
 * L'adresse d'un salon Discord.
 *
 * L'identifiant du serveur n'est pas un secret — il figure dans chacune de ces
 * adresses, y compris celles qu'on donne aux élèves. Ce qui protège une salle,
 * ce n'est pas l'ignorance de son adresse mais ses permissions : sans y avoir
 * été autorisé, on clique et on ne voit rien.
 *
 * Renvoie `null` plutôt qu'une adresse incomplète : un lien à moitié construit
 * mènerait l'élève sur une page d'erreur le matin de son épreuve.
 */
export function lienSalon(salonId: string | null | undefined): string | null {
  const id = String(salonId ?? '').trim();
  // L'identifiant du serveur est relu à chaque appel plutôt que figé au
  // chargement du module : c'est ce qui permet aux tests hors ligne de poser la
  // variable eux-mêmes, sans dépendre de l'ordre des imports.
  const guilde = process.env.DISCORD_GUILD_ID?.trim() || GUILD_ID;
  if (!id || !guilde) return null;
  return `https://discord.com/channels/${guilde}/${id}`;
}

/**
 * L'adresse de la catégorie d'un bac blanc : c'est le lien du professeur. Il
 * ouvre le bloc de l'épreuve, d'où le prof circule d'une salle d'élève à
 * l'autre pour surveiller.
 */
export function lienCategorie(categorieId: string | null | undefined): string | null {
  return lienSalon(categorieId);
}

// --- Types de salons Discord ------------------------------------------

export const TYPE_SALON = {
  TEXTE: 0,
  VOCAL: 2,
  CATEGORIE: 4,
} as const;

/** Cible d'une permission de salon : un rôle ou un membre. */
export const CIBLE_OVERWRITE = { ROLE: 0, MEMBRE: 1 } as const;

// --- Nommage ----------------------------------------------------------

/** Retire les accents et tout ce qui n'est pas alphanumérique. */
export function slug(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Nom du salon d'un élève : prénom + initiale du nom, jamais l'identité
 * complète. « Emma Martinez » → « emma-m ». Le salon est visible dans la liste
 * des membres du serveur par les profs et le staff : autant qu'il en dise le
 * moins possible.
 *
 * Le suffixe garantit l'unicité si deux élèves partagent prénom et initiale.
 */
export function nomSalonEleve(nomComplet: string, suffixe?: string): string {
  const morceaux = slug(nomComplet).split('-').filter(Boolean);
  const prenom = morceaux[0] ?? 'eleve';
  const initiale = morceaux[1]?.[0] ?? '';
  const base = initiale ? `${prenom}-${initiale}` : prenom;
  return (suffixe ? `${base}-${suffixe}` : base).slice(0, 90);
}

/** Nom de la catégorie d'un bac blanc : « BAC SES — 4 OCTOBRE 2026 — MATIN ». */
export function nomCategorieSession(
  matiere: string,
  dateIso: string,
  examen: 'bac' | 'brevet' = 'bac',
): string {
  const date = new Date(dateIso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const prefixe = examen === 'brevet' ? 'BREVET' : 'BAC';
  return `${prefixe} ${matiere} — ${date} — MATIN`.toUpperCase().slice(0, 100);
}

/** Salons textuels créés dans chaque catégorie de bac blanc. */
export const SALONS_TEXTE_SESSION = ['informations', 'assistance-technique'] as const;

/** Nom du salon de test — reconnaissable, jamais confondu avec de la production. */
export const SALON_TEST = 'zz-test-technique';

/**
 * Catégorie de test. La vérification y crée sa salle plutôt qu'à la racine :
 * c'est dans une catégorie privée que le bot perd ses permissions de serveur,
 * donc c'est le seul endroit où l'épreuve reproduit un vrai bac blanc.
 */
export const CATEGORIE_TEST = 'ZZ-TEST-TECHNIQUE';
