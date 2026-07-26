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
  | 'generate-dossier';

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

/** Libellé lisible d'un sujet à partir de sa fiche. */
export function libelleSujet(card: Record<string, unknown> | null, id: string): string {
  if (!card) return id;
  const exercise = typeof card.exercise === 'string' ? card.exercise : '';
  const author = typeof card.author === 'string' ? card.author : '';
  const work = typeof card.work === 'string' ? card.work : '';
  const morceaux = [exercise, [author, work].filter(Boolean).join(' — ')].filter(Boolean);
  return morceaux.length ? morceaux.join(' · ') : id;
}
