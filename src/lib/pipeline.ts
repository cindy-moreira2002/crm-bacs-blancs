/**
 * Accès au projet Supabase « pipeline de correction » (xgdaibekjmtffvkwvcge).
 *
 * ⚠️ SERVEUR UNIQUEMENT. La clé service_role ne doit jamais partir au navigateur :
 * ce module n'est importé que par des routes /api. Le prof n'a aucune clé, il ne
 * fait qu'appeler nos routes.
 *
 * C'est un projet Supabase DIFFÉRENT de celui du CRM (inscriptions/copies).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// matieres.ts n'importe rien : le lire ici ne tire aucun code serveur.
import { estVoieTechnologique } from './matieres';

export const BUCKET_COPIES = 'student-copies';

const url = process.env.PIPELINE_SUPABASE_URL ?? '';
const serviceKey = process.env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY ?? '';
const internalSecret = process.env.PIPELINE_INTERNAL_SECRET ?? '';

/** Variables d'environnement manquantes → message clair plutôt qu'un crash obscur. */
export function pipelineManquant(): string[] {
  const manquants: string[] = [];
  if (!url) manquants.push('PIPELINE_SUPABASE_URL');
  if (!serviceKey) manquants.push('PIPELINE_SUPABASE_SERVICE_ROLE_KEY');
  if (!internalSecret) manquants.push('PIPELINE_INTERNAL_SECRET');
  return manquants;
}

export function pipelineDb(): SupabaseClient {
  const manquants = pipelineManquant();
  if (manquants.length) {
    throw new Error(`Pipeline non configuré — variables manquantes : ${manquants.join(', ')}`);
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export type EdgeFunctionName =
  | 'transcribe-french-copy'
  | 'correct-french-copy'
  | 'generate-dossier'
  // Moteurs du brevet. Ils sont appelés par le même chemin et se protègent
  // par le même header x-pipeline-secret, mais ne corrigent QUE des copies
  // de DNB rattachées à leur matière : le garde-fou est rejoué côté fonction
  // et côté base (contrainte exams_brevet_coherence).
  | 'correct-brevet-francais'
  | 'correct-brevet-maths';

/**
 * Appelle une Edge Function du pipeline.
 * Les 3 fonctions ont « Verify JWT » désactivé et se protègent elles-mêmes
 * par le header x-pipeline-secret.
 */
export async function invoquerEdge(
  fn: EdgeFunctionName,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const manquants = pipelineManquant();
  if (manquants.length) {
    throw new Error(`Pipeline non configuré — variables manquantes : ${manquants.join(', ')}`);
  }

  const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'x-pipeline-secret': internalSecret,
    },
    body: JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = { error: await res.text().catch(() => 'réponse illisible') };
  }
  return { ok: res.ok, status: res.status, data };
}

/** Matières gérées par le pipeline (une nouvelle matière = des données, pas du code). */
export const MATIERE_PAR_DEFAUT = 'francais';

/** Étapes du pipeline, dans l'ordre, pour l'affichage prof. */
export const ETAPES = [
  { statuts: ['uploaded'], label: 'Copie reçue' },
  { statuts: ['transcribing'], label: 'Lecture de la copie' },
  { statuts: ['transcribed', 'transcription_review'], label: 'Copie transcrite' },
  { statuts: ['correcting'], label: 'Correction en cours' },
  { statuts: ['corrected', 'corrected_review'], label: 'Copie corrigée' },
] as const;

export const STATUTS_ECHEC = ['transcription_failed', 'correction_failed'];
export const STATUTS_CORRIGE = ['corrected', 'corrected_review'];

/**
 * Barème d'une grille, en points.
 *
 * Toutes les épreuves ne sont PAS sur 20 : une question problématisée
 * d'histoire-géo vaut 10 points, les parties d'épreuve composée de SES valent
 * 4, 6 et 10. Le moteur renvoie une note à l'échelle de la grille, donc on ne
 * peut jamais afficher « / 20 » en dur devant une note du pipeline.
 *
 * On lit maximum_score, et à défaut la somme des critères — c'est elle qui
 * fait foi côté moteur, qui recalcule toujours la note comme cette somme.
 */
export function baremeGrille(rubricJson: unknown): number {
  const j = (rubricJson ?? {}) as { maximum_score?: unknown; criteria?: { maximum_score?: unknown }[] };
  if (typeof j.maximum_score === 'number' && j.maximum_score > 0) return j.maximum_score;
  const somme = (j.criteria ?? []).reduce((s, c) => s + (typeof c.maximum_score === 'number' ? c.maximum_score : 0), 0);
  return somme > 0 ? somme : 20;
}

/** Libellé lisible d'un sujet à partir de sa fiche. */
export function libelleSujet(
  card: Record<string, unknown> | null,
  id: string,
  track?: string | null,
): string {
  if (!card) return id;
  const exercise = typeof card.exercise === 'string' ? card.exercise : '';
  const author = typeof card.author === 'string' ? card.author : '';
  const work = typeof card.work === 'string' ? card.work : '';
  const morceaux = [exercise, [author, work].filter(Boolean).join(' — ')].filter(Boolean);
  const base = morceaux.length ? morceaux.join(' · ') : id;
  // La VOIE, toujours. « Essai » n'existe qu'en voie technologique, « dissertation »
  // qu'en voie générale : un titre qui ne le dit pas fait chercher en vain une
  // épreuve dans l'autre voie. Certains titres la portent déjà à la main — on ne
  // la répète pas dans ce cas.
  return estVoieTechnologique(track) && !/techno/i.test(base) ? `${base} · voie techno` : base;
}

