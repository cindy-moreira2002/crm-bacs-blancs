import { NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant, libelleSujet } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

type SujetLigne = {
  id: string;
  track: string;
  exercise_type: string;
  card_json: Record<string, unknown> | null;
};

type RubricLigne = {
  id: string;
  track: string;
  exercise_type: string;
  version: number | null;
};

/**
 * GET — liste des bacs blancs (sujets) prêts à corriger, avec la grille associée.
 * Alimente le menu déroulant de l'écran « Déposer une copie ».
 */
export async function GET() {
  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json(
      { error: 'Pipeline non configuré', manquants, sujets: [] },
      { status: 503 },
    );
  }

  try {
    const db = pipelineDb();

    const [sujetsRes, grillesRes] = await Promise.all([
      db.from('subject_cards').select('id, track, exercise_type, card_json').eq('status', 'active'),
      db.from('rubrics').select('id, track, exercise_type, version').eq('status', 'active'),
    ]);

    if (sujetsRes.error) throw sujetsRes.error;
    if (grillesRes.error) throw grillesRes.error;

    const grilles = (grillesRes.data ?? []) as RubricLigne[];

    // Grille retenue : même filière + même type d'exercice, version la plus récente.
    const grillePour = (s: SujetLigne): string | null => {
      const candidates = grilles
        .filter((g) => g.track === s.track && g.exercise_type === s.exercise_type)
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      return candidates[0]?.id ?? null;
    };

    const sujets = ((sujetsRes.data ?? []) as SujetLigne[])
      .map((s) => ({
        id: s.id,
        track: s.track,
        exercise_type: s.exercise_type,
        libelle: libelleSujet(s.card_json, s.id),
        rubric_id: grillePour(s),
      }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

    return NextResponse.json({ sujets });
  } catch (err) {
    console.error('❌ /api/pipeline/sujets', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message, sujets: [] }, { status: 500 });
  }
}
