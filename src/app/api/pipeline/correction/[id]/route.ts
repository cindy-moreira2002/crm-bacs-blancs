import { NextRequest, NextResponse } from 'next/server';
import { baremeGrille, pipelineDb, pipelineManquant, STATUTS_CORRIGE, STATUTS_ECHEC } from '@/lib/pipeline';
import { refuserSiPasAutorise } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Note globale trouvee dans result_json, quelle que soit la cle utilisee. */
function extraireNote(result: Record<string, unknown> | null): number | null {
  if (!result) return null;
  const candidats = ['note_finale', 'analytic_sum', 'total_score', 'note', 'score_total', 'final_score', 'score'];
  for (const cle of candidats) {
    const v = result[cle];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/**
 * GET — ou en est cette copie ? (interrogee en boucle par l'ecran prof)
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const refus = await refuserSiPasAutorise();
  if (refus) return refus;

  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    const { id } = await params;
    const db = pipelineDb();

    const { data: correction, error } = await db
      .from('corrections')
      .select('id, status, processing_error, result_json, student_name, subject_id, exercise_type, rubric_id, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !correction) {
      return NextResponse.json({ error: 'Copie introuvable.' }, { status: 404 });
    }

    // Barème de l'épreuve : toutes ne sont pas sur 20 (une question
    // problématisée d'histoire-géo vaut 10 points). Sans lui, l'écran
    // afficherait « 7 / 20 » pour une copie notée 7 sur 10.
    let bareme = 20;
    if (correction.rubric_id) {
      const { data: grille } = await db
        .from('rubrics')
        .select('rubric_json')
        .eq('id', correction.rubric_id)
        .single();
      if (grille) bareme = baremeGrille(grille.rubric_json);
    }

    // Dossier deja genere ?
    const { data: dossiers } = await db
      .from('dossiers')
      .select('id, created_at')
      .eq('correction_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    const dossier = dossiers?.[0] ?? null;

    return NextResponse.json({
      id: correction.id,
      statut: correction.status,
      erreur: correction.processing_error ?? null,
      echec: STATUTS_ECHEC.includes(correction.status),
      corrigee: STATUTS_CORRIGE.includes(correction.status),
      note: extraireNote(correction.result_json as Record<string, unknown> | null),
      bareme,
      eleve: correction.student_name,
      sujet_id: correction.subject_id,
      exercise_type: correction.exercise_type,
      dossier_id: dossier?.id ?? null,
    });
  } catch (err) {
    console.error('❌ /api/pipeline/correction/[id] GET', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — actions sur la copie.
 *   { action: 'dossier' }   genere le dossier de l'eleve
 *   { action: 'relancer' }  relance la chaine (transcription + correction)
 */
export async function POST(req: NextRequest, { params }: Params) {
  // 'relancer' et 'dossier' rappellent tous deux l'API Anthropic : même garde.
  const refus = await refuserSiPasAutorise();
  if (refus) return refus;

  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    const { id } = await params;
    const { action } = await req.json();
    const db = pipelineDb();

    if (action === 'relancer') {
      const { error } = await db.rpc('crm_lancer_correction', { p_correction_id: id });
      if (error) throw error;
      return NextResponse.json({ ok: true, action });
    }

    if (action === 'dossier') {
      const { data: correction, error: cErr } = await db
        .from('corrections')
        .select('status, result_json')
        .eq('id', id)
        .single();
      if (cErr || !correction) {
        return NextResponse.json({ error: 'Copie introuvable.' }, { status: 404 });
      }
      if (!correction.result_json) {
        return NextResponse.json(
          { error: "La correction n'est pas encore prête." },
          { status: 409 },
        );
      }

      const { error } = await db.rpc('crm_generer_dossier', { p_correction_id: id });
      if (error) throw error;
      return NextResponse.json({ ok: true, action });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (err) {
    console.error('❌ /api/pipeline/correction/[id] POST', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
