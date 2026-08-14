import { NextRequest, NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';
import { refuserSiPasAutorise } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET — la note finale d'un bac blanc COMPLET, pour un élève.
 *
 * `id` est le `groupe_copie_id` posé au dépôt, identique sur les deux copies.
 *
 * La note vient de `v_notes_examen_redige`, jamais d'un calcul refait ici :
 * c'est une vue, donc elle est toujours recalculée à partir des notes
 * OFFICIELLES des exercices (sur 10 chacune). Deux notes analytiques sur 20 ne
 * sont additionnées nulle part — ni par le moteur, ni par la vue, ni ici.
 *
 * `complet` dit si les deux exercices ont fini d'être notés : tant qu'il vaut
 * false, la note affichée n'est qu'une somme partielle.
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

    // Les copies du groupe, notées ou non : c'est ce qui dit si l'épreuve est
    // finie. La vue, elle, ne voit que ce qui porte déjà une note.
    const { data: copies, error: copiesErr } = await db
      .from('corrections')
      .select('id, exercise_type, status, exam_id, score_officiel, max_officiel, student_name')
      .eq('groupe_copie_id', id)
      .order('exercise_type');
    if (copiesErr) throw copiesErr;
    if (!copies?.length) {
      return NextResponse.json({ error: 'Aucune copie pour ce bac blanc.' }, { status: 404 });
    }

    // Combien d'exercices cette épreuve compte-t-elle ? Sans ce nombre, deux
    // copies déposées sur trois passeraient pour une épreuve terminée.
    const examId = copies.find((c) => c.exam_id)?.exam_id ?? null;
    let attendus = copies.length;
    if (examId) {
      const { count } = await db
        .from('exam_exercices')
        .select('id', { count: 'exact', head: true })
        .eq('exam_id', examId);
      if (count) attendus = count;
    }

    const { data: vue } = await db
      .from('v_notes_examen_redige')
      .select('*')
      .eq('groupe_copie_id', id)
      .maybeSingle();

    const notees = copies.filter((c) => c.score_officiel !== null).length;

    return NextResponse.json({
      groupe_copie_id: id,
      eleve: copies[0].student_name,
      exam_id: examId,
      exercices_attendus: attendus,
      exercices_deposes: copies.length,
      exercices_notes: notees,
      complet: notees === attendus,
      copies: copies.map((c) => ({
        id: c.id,
        exercise_type: c.exercise_type,
        statut: c.status,
        note_officielle: c.score_officiel === null ? null : Number(c.score_officiel),
        max_officiel: c.max_officiel === null ? null : Number(c.max_officiel),
      })),
      note_finale: vue?.note_finale === undefined || vue?.note_finale === null ? null : Number(vue.note_finale),
      note_finale_max: vue?.note_finale_max === undefined || vue?.note_finale_max === null ? null : Number(vue.note_finale_max),
      relecture_humaine: vue?.relecture_humaine ?? false,
    });
  } catch (err) {
    console.error('❌ /api/pipeline/groupe/[id] GET', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
