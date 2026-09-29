/**
 * LA FILE « À REGARDER PAR CINDY ».
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du pipeline).
 *
 * En SES, HLP, LLCER anglais, SVT et physique-chimie, aucun prof ne relit :
 * l'IA se relit seule (deuxième lecture, une recorrection, une relance de la
 * transcription — SQL 58 + Edge Function `review-copy`). Ce qui reste douteux
 * APRÈS tout ça atterrit ici, et nulle part ailleurs. C'est une liste simple,
 * affichée en tête de /direction/correction.
 *
 * Y figurent :
 *   - les copies marquées `a_regarder_cindy` et pas encore vues ;
 *   - les copies coincées en deuxième lecture depuis plus de 20 minutes (la
 *     fonction a été tuée par la plateforme sans pouvoir le dire).
 *
 * On lit peu de colonnes et une poignée de lignes : l'egress Supabase compte.
 */
import { pipelineDb } from '@/lib/pipeline';
import type { MotifPersistant } from '@/lib/relectureIaNoyau';

export type CopieARegarder = {
  id: string;
  matiere: string | null;
  exercise_type: string | null;
  eleve: string | null;
  status: string;
  depuis: string;
  note: number | null;
  bareme: number | null;
  motifs: MotifPersistant[];
  /** Relances automatiques déjà faites : combien l'IA a essayé avant de lâcher. */
  essais: { transcription: number; recorrections: number; relectures: number };
  /** La lecture de la copie est-elle en cause ? (alors : « corriger quand même ») */
  transcriptionBloquee: boolean;
  bloqueeEnRelecture: boolean;
};

const BLOCAGE_MIN = 20;

type Ligne = {
  id: string;
  matiere: string | null;
  exercise_type: string | null;
  student_name: string | null;
  status: string;
  updated_at: string;
  a_regarder_depuis: string | null;
  a_regarder_motifs: MotifPersistant[] | null;
  ia_relances_transcription: number | null;
  ia_recorrections: number | null;
  ia_relectures: number | null;
  note: string | null;
  bareme: string | null;
  score_raw: number | null;
  max_score: number | null;
};

const COLONNES =
  'id, matiere, exercise_type, student_name, status, updated_at, a_regarder_depuis, a_regarder_motifs, ' +
  'ia_relances_transcription, ia_recorrections, ia_relectures, score_raw, max_score, ' +
  'note:result_json->>note_finale, bareme:result_json->relecture_ia->>bareme';

function versCopie(l: Ligne, bloquee: boolean): CopieARegarder {
  const note = l.note != null ? Number(l.note) : l.score_raw != null ? Number(l.score_raw) : null;
  return {
    id: l.id,
    matiere: l.matiere,
    exercise_type: l.exercise_type,
    eleve: l.student_name,
    status: l.status,
    depuis: l.a_regarder_depuis ?? l.updated_at,
    note: Number.isFinite(note) ? note : null,
    bareme: l.bareme != null ? Number(l.bareme) : l.max_score != null ? Number(l.max_score) : null,
    motifs: bloquee
      ? [{ nature: 'systeme', code: 'relecture_bloquee', message: `Deuxième lecture sans nouvelles depuis plus de ${BLOCAGE_MIN} min (fonction probablement coupée). Relance la copie.` }]
      : Array.isArray(l.a_regarder_motifs) ? l.a_regarder_motifs : [],
    essais: {
      transcription: l.ia_relances_transcription ?? 0,
      recorrections: l.ia_recorrections ?? 0,
      relectures: l.ia_relectures ?? 0,
    },
    transcriptionBloquee: l.status === 'transcription_review',
    bloqueeEnRelecture: bloquee,
  };
}

export async function chargerFileCindy(): Promise<CopieARegarder[]> {
  const db = pipelineDb();
  const limite = new Date(Date.now() - BLOCAGE_MIN * 60_000).toISOString();
  const [marquees, bloquees] = await Promise.all([
    db.from('corrections').select(COLONNES)
      .eq('a_regarder_cindy', true).is('a_regarder_vu_le', null)
      .order('a_regarder_depuis', { ascending: true }).limit(100),
    db.from('corrections').select(COLONNES)
      .in('status', ['queued_review', 'reviewing']).lt('updated_at', limite).limit(50),
  ]);
  if (marquees.error) throw marquees.error;
  if (bloquees.error) throw bloquees.error;
  const vus = new Set<string>();
  const sortie: CopieARegarder[] = [];
  for (const l of (marquees.data ?? []) as unknown as Ligne[]) {
    vus.add(l.id);
    sortie.push(versCopie(l, false));
  }
  for (const l of (bloquees.data ?? []) as unknown as Ligne[]) {
    if (!vus.has(l.id)) sortie.push(versCopie(l, true));
  }
  return sortie;
}

export type ActionFileCindy = 'valider' | 'corriger_quand_meme' | 'retirer';

/**
 * Ce que Cindy peut faire d'une copie de la file.
 *  - `valider`             : la correction telle quelle lui convient → corrigée ;
 *  - `corriger_quand_meme` : la lecture de la copie lui va → la correction
 *                            part (le trigger du SQL 58 la lance) ;
 *  - `retirer`             : sortir de la file sans rien changer.
 * La publication à l'élève reste manuelle (`npm run correction:publier`).
 */
export async function agirSurCopieFile(id: string, action: ActionFileCindy, par: string): Promise<void> {
  const db = pipelineDb();
  const vu = { a_regarder_vu_le: new Date().toISOString(), a_regarder_vu_par: par };

  if (action === 'retirer') {
    const { error } = await db.from('corrections').update(vu).eq('id', id);
    if (error) throw error;
    return;
  }

  if (action === 'valider') {
    const { data, error } = await db.from('corrections').select('status, result_json').eq('id', id).single();
    if (error || !data) throw new Error('Copie introuvable.');
    if (!['corrected', 'corrected_review'].includes(data.status)) {
      throw new Error(`Rien à valider : la copie est en « ${data.status} ».`);
    }
    const rj = (data.result_json ?? {}) as Record<string, unknown>;
    const { error: e2 } = await db.from('corrections').update({
      ...vu,
      status: 'corrected',
      human_review_required: false,
      result_json: {
        ...rj,
        human_review_required: false,
        validation_cindy: { par, le: vu.a_regarder_vu_le, doutes_ecartes: rj.human_review_reasons ?? [] },
      },
    }).eq('id', id);
    if (e2) throw e2;
    return;
  }

  // corriger_quand_meme : on accepte la lecture telle qu'elle est. Réécrire
  // transcription_json réveille le trigger, qui lance la correction ; la
  // deuxième lecture ne remettra plus la lecture en cause (transcription_forcee).
  const { data: t, error: eT } = await db.from('copy_transcriptions')
    .select('transcription_json').eq('correction_id', id).single();
  if (eT || !t) throw new Error('Aucune transcription pour cette copie : relance-la plutôt.');
  const { error: eC } = await db.from('corrections').update(vu).eq('id', id);
  if (eC) throw eC;
  const { error: eU } = await db.from('copy_transcriptions').update({
    transcription_json: {
      ...(t.transcription_json as Record<string, unknown>),
      requires_human_review: false,
      transcription_forcee: true,
      forcee_par: par,
      forcee_le: vu.a_regarder_vu_le,
    },
  }).eq('correction_id', id);
  if (eU) throw eU;
}
