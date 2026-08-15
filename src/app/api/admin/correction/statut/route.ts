/**
 * POST — activer ou remettre en brouillon une matière, une épreuve ou un
 * sujet, depuis /admin/correction. Remplace les allers-retours SQL.
 *
 * Corps : { cible: 'matiere' | 'exercice' | 'sujet', statut: 'active' | 'draft',
 *           matiere, track?, exercise_type?, sujet_id? }
 *
 * Ce que « active » veut dire : le sujet apparaît dans le menu « Déposer une
 * copie » et generate-dossier accepte de produire le dossier élève. Activer
 * une matière dont les étalons sont synthétiques rend des notes que personne
 * n'a vérifiées — la page l'affiche, la décision reste à l'administratrice.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/**
 * Les seuls statuts qu'un interrupteur a le droit de changer.
 *
 * Une ligne `archived` est une VERSION PRÉCÉDENTE, remplacée exprès : la v1
 * d'HGGSP, par exemple, note avec l'ancien moteur. La réactiver en masse
 * donnerait deux grilles actives sur la même épreuve, et une copie serait
 * corrigée avec l'une ou l'autre selon l'ordre de lecture.
 */
const ACTIVABLES = ['active', 'draft'];

type Corps = {
  cible?: 'matiere' | 'exercice' | 'sujet';
  statut?: 'active' | 'draft';
  matiere?: string;
  track?: string;
  exercise_type?: string;
  sujet_id?: string;
};

export async function POST(req: NextRequest) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }
  if (pipelineManquant().length) {
    return NextResponse.json({ error: 'Pipeline non configuré' }, { status: 503 });
  }

  const corps = (await req.json().catch(() => ({}))) as Corps;
  const { cible, statut, matiere } = corps;

  if (!statut || !['active', 'draft'].includes(statut)) {
    return NextResponse.json({ error: 'Statut attendu : active ou draft.' }, { status: 400 });
  }

  const db = pipelineDb();
  const modifie: Record<string, number> = {};

  try {
    if (cible === 'sujet') {
      if (!corps.sujet_id) {
        return NextResponse.json({ error: 'sujet_id manquant.' }, { status: 400 });
      }
      const { data, error } = await db
        .from('subject_cards')
        .update({ status: statut })
        .eq('id', corps.sujet_id)
        .in('status', ACTIVABLES)
        .select('id');
      if (error) throw error;
      modifie.sujets = data?.length ?? 0;
    } else if (cible === 'exercice') {
      if (!matiere || !corps.track || !corps.exercise_type) {
        return NextResponse.json({ error: 'matiere, track et exercise_type requis.' }, { status: 400 });
      }
      for (const table of ['rubrics', 'subject_cards', 'dossier_templates'] as const) {
        const { data, error } = await db
          .from(table)
          .update({ status: statut })
          .eq('matiere', matiere)
          .eq('track', corps.track)
          .eq('exercise_type', corps.exercise_type)
          .in('status', ACTIVABLES)
          .select('id');
        if (error) throw error;
        modifie[table] = data?.length ?? 0;
      }
    } else if (cible === 'matiere') {
      if (!matiere) {
        return NextResponse.json({ error: 'matiere manquante.' }, { status: 400 });
      }
      for (const table of ['rubrics', 'subject_cards', 'dossier_templates'] as const) {
        const { data, error } = await db
          .from(table)
          .update({ status: statut })
          .eq('matiere', matiere)
          .in('status', ACTIVABLES)
          .select('id');
        if (error) throw error;
        modifie[table] = data?.length ?? 0;
      }
    } else {
      return NextResponse.json({ error: 'cible attendue : matiere, exercice ou sujet.' }, { status: 400 });
    }

    console.log(`🎚️ ${moi.email} → ${cible} ${matiere ?? corps.sujet_id} → ${statut}`, modifie);
    return NextResponse.json({ success: true, statut, modifie });
  } catch (err) {
    console.error('❌ /api/admin/correction/statut', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
