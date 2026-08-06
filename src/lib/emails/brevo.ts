/**
 * Client Brevo — le seul endroit du projet qui parle à l'API Brevo.
 *
 * ⚠️ SERVEUR UNIQUEMENT. La clé `BREVO_API_KEY` est lue ici et nulle part
 * ailleurs : elle ne descend jamais au navigateur, elle n'apparaît dans
 * aucune URL, et elle n'est jamais renvoyée par une route /api.
 *
 * Le module ne décide rien : il envoie et rapporte. C'est le moteur
 * (lib/emails/envoi.ts) qui choisit de réessayer ou d'abandonner, à partir
 * du drapeau `permanent` renvoyé ici.
 */
import { EXPEDITEUR, REPONSE_A } from './config';

const API = 'https://api.brevo.com/v3';

export type ResultatEnvoi =
  | { ok: true; messageId: string | null }
  | { ok: false; permanent: boolean; message: string; code?: string };

export type MessageBrevo = {
  destinataire: string;
  destinataireNom?: string | null;
  sujet: string;
  html: string;
  texte: string;
  /** Lien de désinscription — obligatoire pour les messages marketing. */
  desinscriptionUrl?: string | null;
  /** Étiquettes visibles dans Brevo (type de message, catégorie). */
  etiquettes?: string[];
};

function cle(): string {
  const k = process.env.BREVO_API_KEY?.trim();
  if (!k) throw new Error('BREVO_API_KEY manquante');
  return k;
}

/**
 * Une erreur est-elle définitive ?
 * - 429 et 5xx : Brevo est occupé ou en panne → on réessaiera.
 * - 401/403 : clé invalide → définitif, inutile d'insister (et l'admin le voit).
 * - 400 sur une adresse invalide → définitif : réessayer ne changera rien.
 */
function estPermanent(status: number, corps: string): boolean {
  if (status === 429) return false;
  if (status >= 500) return false;
  if (status === 408) return false;
  void corps;
  return true;
}

/** Envoi d'un message transactionnel. Ne lève pas : renvoie toujours un résultat. */
export async function envoyerViaBrevo(m: MessageBrevo): Promise<ResultatEnvoi> {
  let apiKey: string;
  try {
    apiKey = cle();
  } catch (err) {
    return { ok: false, permanent: true, message: (err as Error).message };
  }

  const corps: Record<string, unknown> = {
    sender: { name: EXPEDITEUR.nom, email: EXPEDITEUR.email },
    to: [
      m.destinataireNom
        ? { email: m.destinataire, name: m.destinataireNom }
        : { email: m.destinataire },
    ],
    replyTo: { email: REPONSE_A, name: EXPEDITEUR.nom },
    subject: m.sujet,
    htmlContent: m.html,
    textContent: m.texte,
  };
  if (m.etiquettes?.length) corps.tags = m.etiquettes.slice(0, 10);
  if (m.desinscriptionUrl) {
    corps.headers = {
      'List-Unsubscribe': `<${m.desinscriptionUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  const appel = async (charge: Record<string, unknown>) =>
    fetch(`${API}/smtp/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(charge),
      // Un envoi qui traîne ne doit pas bloquer tout le lot.
      signal: AbortSignal.timeout(20_000),
    });

  try {
    let res = await appel(corps);

    // Certains comptes refusent les en-têtes personnalisés : on retente une
    // fois sans eux plutôt que de perdre le message (le lien de désinscription
    // reste présent dans le corps de l'e-mail, ce qui est ce qu'exige la loi).
    if (res.status === 400 && corps.headers) {
      const texte = await res.text();
      if (/header/i.test(texte)) {
        const sansEntetes = { ...corps };
        delete sansEntetes.headers;
        res = await appel(sansEntetes);
      } else {
        return {
          ok: false,
          permanent: estPermanent(400, texte),
          message: resumeErreur(texte),
        };
      }
    }

    if (!res.ok) {
      const texte = await res.text();
      return {
        ok: false,
        permanent: estPermanent(res.status, texte),
        message: `HTTP ${res.status} — ${resumeErreur(texte)}`,
        code: String(res.status),
      };
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? null };
  } catch (err) {
    // Réseau, délai dépassé : temporaire par nature.
    return {
      ok: false,
      permanent: false,
      message: err instanceof Error ? err.message : 'Erreur réseau inconnue',
    };
  }
}

function resumeErreur(texte: string): string {
  try {
    const j = JSON.parse(texte) as { message?: string; code?: string };
    return [j.code, j.message].filter(Boolean).join(' : ') || texte.slice(0, 300);
  } catch {
    return texte.slice(0, 300);
  }
}

/** État du compte Brevo — pour l'écran de santé de l'administration. */
export type EtatCompteBrevo = {
  ok: boolean;
  message: string;
  expediteursValides?: string[];
};

export async function verifierCompteBrevo(): Promise<EtatCompteBrevo> {
  let apiKey: string;
  try {
    apiKey = cle();
  } catch {
    return { ok: false, message: 'Clé BREVO_API_KEY absente des variables d’environnement.' };
  }

  try {
    const res = await fetch(`${API}/senders`, {
      headers: { accept: 'application/json', 'api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      return { ok: false, message: 'Clé Brevo refusée (401). Recrée-la dans Brevo puis remplace-la sur Vercel.' };
    }
    if (!res.ok) {
      return { ok: false, message: `Brevo répond ${res.status}.` };
    }
    const data = (await res.json()) as { senders?: { email: string; active?: boolean }[] };
    const expediteurs = (data.senders ?? []).map((s) => s.email.toLowerCase());
    const attendu = EXPEDITEUR.email.toLowerCase();
    if (expediteurs.length && !expediteurs.includes(attendu)) {
      return {
        ok: false,
        message: `L’adresse d’expédition ${EXPEDITEUR.email} n’est pas validée dans Brevo. Adresses validées : ${expediteurs.join(', ') || 'aucune'}.`,
        expediteursValides: expediteurs,
      };
    }
    return { ok: true, message: 'Clé valide, expéditeur validé.', expediteursValides: expediteurs };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Brevo injoignable.' };
  }
}
