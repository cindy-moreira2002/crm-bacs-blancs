/**
 * Les codes d'épreuve de l'application d'écriture, vus du CRM.
 *
 * Les codes vivent dans l'application d'écriture (table `ecriture_acces`,
 * fermée à la clé publique). Le CRM ne les écrit donc pas lui-même : il les
 * demande, de serveur à serveur, avec un secret partagé. Une seule source de
 * vérité, et aucun code dans le navigateur du professeur avant qu'il ne
 * l'affiche.
 */
import { ECRITURE_URL } from './liens';

export interface CodeEpreuve {
  code: string;
  copie_id: string | null;
  role: 'eleve' | 'prof';
  eleve_nom: string | null;
  /** Non nul dès que le code a servi : l'accès est attaché à ce poste. */
  poste: string | null;
  ouvert_le: string | null;
  liberations: number;
  expire_le: string;
}

function secret(): string | null {
  return process.env.ECRITURE_ADMIN_SECRET?.trim() || null;
}

/** L'application d'écriture sait-elle gérer des codes ? Sinon, on n'affiche rien. */
export function codesDisponibles(): boolean {
  return Boolean(secret());
}

async function appeler<T>(chemin: string, corps: unknown): Promise<T | null> {
  const cle = secret();
  if (!cle) return null;
  try {
    const r = await fetch(`${ECRITURE_URL}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mdb-secret': cle },
      body: JSON.stringify(corps),
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    // L'application d'écriture peut être en cours de déploiement : la console
    // du professeur doit continuer de s'afficher sans elle.
    return null;
  }
}

/**
 * Les codes d'une session, créés au premier appel puis inchangés.
 *
 * Idempotent par construction : un professeur qui rouvre sa console au milieu
 * de l'épreuve retrouve les codes qu'il a déjà dictés, jamais des nouveaux.
 */
export async function codesDeLaSession(
  sessionId: string,
  eleves: { copieId: string; nom: string; matiere: string }[],
  /** Jour de l'épreuve, « AAAA-MM-JJ ». L'application d'écriture en déduit le
   *  soir où l'accès s'arrête : elle seule connaît le fuseau de Paris. */
  jour?: string,
  /** Crée aussi, une fois, le code du professeur de cette session. */
  prof?: { nom: string; matiere: string } | null,
): Promise<CodeEpreuve[]> {
  const rep = await appeler<{ codes: CodeEpreuve[] }>('/api/acces/creer', {
    sessionId,
    jour,
    eleves,
    prof: prof ?? undefined,
  });
  return rep?.codes ?? [];
}

/**
 * Le code d'un élève pour un bac blanc — celui qu'il lit dans son espace.
 *
 * On n'envoie que SON inscription : la création est idempotente et n'ajoute
 * que ce qui manque, donc un élève qui consulte son espace fabrique son code
 * sans rien déclencher pour les autres. Et on ne renvoie que le sien : la
 * réponse de l'application d'écriture porte tous les codes de la session, ils
 * ne doivent pas traverser jusqu'au navigateur.
 */
export async function codeEpreuveEleve(
  sessionId: string,
  eleve: { copieId: string; nom: string; matiere: string },
  jour?: string,
): Promise<CodeEpreuve | null> {
  const codes = await codesDeLaSession(sessionId, [eleve], jour);
  return codes.find((c) => c.copie_id === eleve.copieId) ?? null;
}

/**
 * Le code du professeur pour ce bac blanc : un seul, qui ouvre toutes les
 * copies de la session. Il se reconnaît à ce qu'il n'a pas de copie à lui.
 */
export async function codeEpreuveProf(
  sessionId: string,
  prof: { nom: string; matiere: string },
  jour?: string,
): Promise<CodeEpreuve | null> {
  const codes = await codesDeLaSession(sessionId, [], jour, prof);
  return codes.find((c) => c.role === 'prof') ?? null;
}

/** Rend un code saisissable sur un nouveau poste (ordinateur planté, etc.). */
export async function libererCode(code: string): Promise<boolean> {
  const rep = await appeler<{ ok: boolean }>('/api/acces/liberer', { code });
  return Boolean(rep?.ok);
}
