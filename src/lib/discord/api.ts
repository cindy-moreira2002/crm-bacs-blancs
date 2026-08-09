/**
 * Client de l'API REST Discord.
 *
 * ⚠️ SERVEUR UNIQUEMENT — ce module lit le token du bot. Il n'est importé que
 * par des routes /api et des composants serveur. Le navigateur ne parle jamais
 * à Discord : il appelle nos routes, qui décident.
 *
 * Pourquoi l'API REST et pas un bot « classique » : tout ce que fait ce
 * système (créer une catégorie, des salons, poser des permissions, verrouiller,
 * supprimer) s'obtient par de simples requêtes HTTP. La passerelle temps réel
 * de Discord, elle, exige un processus allumé en permanence — impossible dans
 * une fonction Vercel, et inutile ici. Le bot reste donc affiché « hors ligne »,
 * ce qui est normal et voulu.
 *
 * Trois garanties tenues par ce module :
 *  1. les requêtes partent une par une (jamais de rafale qui déclencherait un
 *     blocage), avec une petite attente entre chacune ;
 *  2. un « 429 Too Many Requests » est respecté à la lettre : on attend
 *     exactement le délai que Discord indique, puis on réessaie ;
 *  3. une panne passagère de Discord (5xx) est réessayée avec un délai
 *     croissant, et jamais indéfiniment.
 */
import { BOT_TOKEN, CLIENT_ID, CLIENT_SECRET } from './config';

const BASE = 'https://discord.com/api/v10';

/** Nombre maximal de tentatives pour une même requête. */
const TENTATIVES_MAX = 4;
/** Au-delà, on renonce plutôt que de bloquer la fonction serveur. */
const DELAI_MAX_ATTENTE_MS = 10_000;
/** Temps mort entre deux requêtes : lisse la charge sans ralentir l'usage réel. */
const PAUSE_ENTRE_REQUETES_MS = 120;
/** Une requête qui ne répond pas est abandonnée plutôt que de tout figer. */
const TIMEOUT_MS = 10_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * File d'attente : chaque appel attend la fin du précédent. Une préparation de
 * salles enchaîne une trentaine de requêtes ; les envoyer toutes en même temps
 * ferait tomber le bot dans les limites de Discord dès le premier bac blanc.
 */
let file: Promise<unknown> = Promise.resolve();

function enFile<T>(travail: () => Promise<T>): Promise<T> {
  const resultat = file.then(travail, travail);
  // La file ne doit jamais rester « en échec » : on neutralise le rejet ici,
  // l'appelant reçoit quand même son erreur par `resultat`.
  file = resultat.catch(() => undefined).then(() => dormir(PAUSE_ENTRE_REQUETES_MS));
  return resultat;
}

export type ReponseDiscord<T = unknown> = {
  statut: number;
  ok: boolean;
  corps: T | null;
  /** Message lisible en cas d'échec — sans jamais contenir de secret. */
  erreur: string | null;
};

/** Traduit une réponse d'erreur Discord en phrase compréhensible. */
function messageErreur(statut: number, corps: unknown): string {
  const detail =
    corps && typeof corps === 'object' && 'message' in corps
      ? String((corps as { message: unknown }).message)
      : '';
  if (statut === 401) return 'Discord refuse le token du bot (401). Il a probablement été réinitialisé depuis.';
  if (statut === 403) return `Discord refuse l’action (403) : permission manquante ou rôle du bot trop bas. ${detail}`.trim();
  if (statut === 404) return `Ressource introuvable sur Discord (404) : elle a sans doute été supprimée à la main. ${detail}`.trim();
  if (statut === 429) return 'Discord limite le débit (429) et le délai d’attente dépasse ce que nous pouvons tenir.';
  if (statut >= 500) return `Discord est momentanément indisponible (${statut}).`;
  return `Discord a refusé la requête (${statut}). ${detail}`.trim();
}

/**
 * Appel authentifié à l'API Discord, avec file d'attente, respect des limites
 * de débit et reprise sur panne passagère.
 *
 * Ne lève jamais : renvoie toujours un objet, pour que l'appelant décide quoi
 * faire d'une erreur (l'afficher, la journaliser, réessayer plus tard).
 */
export function discord<T = unknown>(
  chemin: string,
  options: { methode?: string; corps?: unknown; motifAudit?: string } = {},
): Promise<ReponseDiscord<T>> {
  return enFile(async () => {
    if (!BOT_TOKEN) {
      return { statut: 0, ok: false, corps: null, erreur: 'DISCORD_BOT_TOKEN absent.' };
    }

    let derniereErreur = 'Aucune tentative aboutie.';

    for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative++) {
      let reponse: Response;
      try {
        reponse = await fetch(BASE + chemin, {
          method: options.methode ?? 'GET',
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json',
            // Discord demande d'identifier l'application appelante.
            'User-Agent': 'MatineesDuBac (https://matineesdubac.fr, 1.0)',
            ...(options.motifAudit
              ? { 'X-Audit-Log-Reason': encodeURIComponent(options.motifAudit.slice(0, 400)) }
              : {}),
          },
          body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        // Coupure réseau ou dépassement du délai : on retente, sauf à la fin.
        derniereErreur =
          err instanceof Error && err.name === 'TimeoutError'
            ? 'Discord n’a pas répondu dans le délai imparti.'
            : 'Impossible de joindre Discord (réseau).';
        if (tentative < TENTATIVES_MAX) {
          await dormir(500 * 2 ** (tentative - 1));
          continue;
        }
        return { statut: 0, ok: false, corps: null, erreur: derniereErreur };
      }

      const texte = await reponse.text();
      let corps: unknown = null;
      if (texte) {
        try {
          corps = JSON.parse(texte);
        } catch {
          corps = texte;
        }
      }

      if (reponse.ok) {
        return { statut: reponse.status, ok: true, corps: corps as T, erreur: null };
      }

      // Limite de débit : Discord indique exactement combien de temps attendre.
      if (reponse.status === 429) {
        const enTete = Number(reponse.headers.get('retry-after') ?? 0);
        const dansCorps =
          corps && typeof corps === 'object' && 'retry_after' in corps
            ? Number((corps as { retry_after: unknown }).retry_after)
            : 0;
        const attenteMs = Math.max(enTete, dansCorps) * 1000 || 1000;
        if (attenteMs <= DELAI_MAX_ATTENTE_MS && tentative < TENTATIVES_MAX) {
          await dormir(attenteMs);
          continue;
        }
        return { statut: 429, ok: false, corps: null, erreur: messageErreur(429, corps) };
      }

      // Panne passagère de Discord : on retente avec un délai croissant.
      if (reponse.status >= 500 && tentative < TENTATIVES_MAX) {
        await dormir(500 * 2 ** (tentative - 1));
        derniereErreur = messageErreur(reponse.status, corps);
        continue;
      }

      // 4xx autre que 429 : réessayer ne changerait rien.
      return {
        statut: reponse.status,
        ok: false,
        corps: null,
        erreur: messageErreur(reponse.status, corps),
      };
    }

    return { statut: 0, ok: false, corps: null, erreur: derniereErreur };
  });
}

/**
 * Vérifie le couple identifiant / secret de l'application, sans toucher au bot.
 *
 * `client_credentials` demande à Discord un jeton pour l'application
 * elle-même : c'est le seul moyen de contrôler que DISCORD_CLIENT_SECRET est
 * valide sans faire passer un vrai utilisateur par l'écran d'autorisation. Le
 * jeton obtenu n'est ni utilisé ni conservé.
 */
export async function verifierSecretApplication(): Promise<{ ok: boolean; erreur: string | null }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { ok: false, erreur: 'DISCORD_CLIENT_ID ou DISCORD_CLIENT_SECRET absent.' };
  }
  try {
    const reponse = await fetch(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (reponse.ok) return { ok: true, erreur: null };
    if (reponse.status === 401) {
      return {
        ok: false,
        erreur:
          'Discord refuse le couple identifiant / clé secrète (401). La clé a sans doute été réinitialisée après avoir été posée dans Vercel.',
      };
    }
    return { ok: false, erreur: `Discord répond ${reponse.status} à la vérification de la clé secrète.` };
  } catch {
    return { ok: false, erreur: 'Impossible de joindre Discord pour vérifier la clé secrète.' };
  }
}

// --- Raccourcis typés utilisés par le reste de l'intégration ----------

export type SalonDiscord = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
  permission_overwrites?: { id: string; type: number; allow: string; deny: string }[];
};

export type RoleDiscord = {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
  tags?: { bot_id?: string };
};

export type MembreDiscord = {
  user?: { id: string; username: string };
  roles: string[];
};
