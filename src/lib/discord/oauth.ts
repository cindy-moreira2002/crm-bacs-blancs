/**
 * Liaison d'un compte Discord — élèves et professeurs.
 *
 * ⚠️ SERVEUR UNIQUEMENT : ce module lit le Client Secret.
 *
 * Pourquoi ce fichier existe : une salle privée n'autorise que des
 * identifiants Discord. Tant qu'on ne sait pas quel compte appartient à quel
 * élève, on peut créer sa salle, lui envoyer son lien, tout afficher — il
 * cliquera et ne verra rien. Relier le compte est la moitié qui ouvre la porte.
 *
 * Le parcours tient en trois temps :
 *   1. la personne clique « Relier mon compte Discord » depuis SON espace
 *      (donc déjà authentifiée chez nous : cookie élève ou cookie prof) ;
 *   2. Discord lui demande son accord, puis nous renvoie un code à usage unique ;
 *   3. on échange ce code contre un jeton, on lit l'identifiant du compte, on
 *      l'ajoute au serveur, et on lui pose ce qui le concerne — sa salle pour
 *      un élève, le rôle « Prof » pour un professeur.
 *
 * Le jeton d'accès obtenu ne sert qu'à l'étape « ajouter au serveur » et n'est
 * jamais conservé : il devient inutile la seconde d'après.
 */
import { discord } from './api';
import {
  CIBLE_OVERWRITE,
  CLIENT_ID,
  CLIENT_SECRET,
  GUILD_ID,
  PERM,
  ROLE_PROF_ID,
  SCOPES_LIAISON,
} from './config';

const BASE = 'https://discord.com/api/v10';
const TIMEOUT_MS = 10_000;

export type Liaison = {
  ok: boolean;
  /** Identifiant Discord de la personne. Numéro public, pas un secret. */
  userId: string | null;
  /** Jeton éphémère, utilisé aussitôt puis oublié. Ne jamais l'écrire en base. */
  accessToken: string | null;
  erreur: string | null;
};

const echec = (erreur: string): Liaison => ({
  ok: false,
  userId: null,
  accessToken: null,
  erreur,
});

/**
 * Échange le code à usage unique contre un jeton, puis lit l'identifiant du
 * compte relié.
 *
 * `redirectUri` doit être **exactement** celle envoyée à l'aller : Discord la
 * recompare, et le moindre écart renvoie `invalid_grant` sans autre explication.
 */
export async function echangerCode(code: string, redirectUri: string): Promise<Liaison> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return echec('DISCORD_CLIENT_ID ou DISCORD_CLIENT_SECRET absent.');
  }

  let jeton: string;
  try {
    const reponse = await fetch(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: SCOPES_LIAISON,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!reponse.ok) {
      // Le corps peut contenir le code d'erreur OAuth mais jamais de secret.
      const detail = await reponse.text().catch(() => '');
      if (/invalid_grant/.test(detail)) {
        return echec(
          'Discord refuse ce code (il a déjà servi, ou il a expiré). Recommence la liaison depuis ton espace.',
        );
      }
      if (/redirect_uri/.test(detail)) {
        return echec(
          'L’adresse de retour n’est pas déclarée dans le portail Discord (étape F du guide).',
        );
      }
      return echec(`Discord refuse l’échange du code (${reponse.status}).`);
    }
    const corps = (await reponse.json()) as { access_token?: string };
    if (!corps.access_token) return echec('Discord n’a pas renvoyé de jeton.');
    jeton = corps.access_token;
  } catch {
    return echec('Impossible de joindre Discord pour relier le compte.');
  }

  // L'identifiant du compte, lu avec le jeton de la personne (pas avec le bot).
  try {
    const moi = await fetch(`${BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!moi.ok) return echec(`Discord refuse de dire qui est ce compte (${moi.status}).`);
    const corps = (await moi.json()) as { id?: string };
    if (!corps.id) return echec('Discord n’a pas renvoyé d’identifiant de compte.');
    return { ok: true, userId: corps.id, accessToken: jeton, erreur: null };
  } catch {
    return echec('Impossible de lire le compte Discord relié.');
  }
}

/**
 * Ajoute la personne au serveur, sans lien d'invitation.
 *
 * Discord répond 201 si elle vient d'être ajoutée, 204 si elle en était déjà
 * membre : les deux sont un succès, et c'est ce qui rend l'opération rejouable
 * sans effet de bord.
 */
export async function rejoindreServeur(
  userId: string,
  accessToken: string,
): Promise<{ ok: boolean; erreur: string | null }> {
  const r = await discord(`/guilds/${GUILD_ID}/members/${userId}`, {
    methode: 'PUT',
    corps: { access_token: accessToken },
    motifAudit: 'Compte relié depuis son espace Matinées du Bac',
  });
  return { ok: r.ok, erreur: r.erreur };
}

/**
 * Pose le rôle « Prof ». Sans lui, le professeur ne voit ni la zone ÉQUIPE ni
 * les salles de ses élèves : c'est ce rôle, et pas une permission individuelle,
 * qui lui ouvre tout d'un coup.
 *
 * Échoue en 403 si le rôle `Prof` est placé au-dessus de celui du bot dans la
 * hiérarchie du serveur — c'est l'étape G bis du guide.
 */
export async function donnerRoleProf(
  userId: string,
): Promise<{ ok: boolean; erreur: string | null }> {
  if (!ROLE_PROF_ID) return { ok: false, erreur: 'DISCORD_ROLE_PROF_ID absent.' };
  const r = await discord(`/guilds/${GUILD_ID}/members/${userId}/roles/${ROLE_PROF_ID}`, {
    methode: 'PUT',
    motifAudit: 'Professeur relié : accès à la zone ÉQUIPE',
  });
  if (!r.ok && r.statut === 403) {
    return {
      ok: false,
      erreur:
        'Discord refuse de poser le rôle « Prof » : il est placé au-dessus du rôle du bot. Redescends-le dans Paramètres du serveur → Rôles (étape G bis du guide).',
    };
  }
  return { ok: r.ok, erreur: r.erreur };
}

/**
 * Autorise une personne sur UN salon, et sur celui-là seul.
 *
 * C'est l'écriture qui ouvre réellement la porte de l'élève : sa salle refuse
 * `@everyone`, et ne laisse entrer que le staff, les profs, et le compte
 * nommé ici. Rejouable : réécrire la même permission ne change rien.
 */
export async function ouvrirSalonA(
  salonId: string,
  userId: string,
): Promise<{ ok: boolean; erreur: string | null }> {
  const r = await discord(`/channels/${salonId}/permissions/${userId}`, {
    methode: 'PUT',
    corps: {
      type: CIBLE_OVERWRITE.MEMBRE,
      allow: String(PERM.VIEW_CHANNEL | PERM.CONNECT | PERM.SPEAK),
      deny: '0',
    },
    motifAudit: 'Accès de l’élève à sa propre salle',
  });
  return { ok: r.ok, erreur: r.erreur };
}
