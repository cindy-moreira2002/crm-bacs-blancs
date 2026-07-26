import { NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant, libelleSujet } from '@/lib/pipeline';
import { refuserSiPasAutorise } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

type SujetLigne = {
  id: string;
  track: string;
  exercise_type: string;
  matiere: string | null;
  card_json: Record<string, unknown> | null;
};

type RubricLigne = {
  id: string;
  track: string;
  exercise_type: string;
  matiere: string | null;
  version: number | null;
};

/**
 * GET — liste des bacs blancs (sujets) prêts à corriger, avec la grille associée.
 * Alimente le menu déroulant de l'écran « Déposer une copie ».
 *
 * La mise en relation sujet <-> grille se fait par filière + matière + type
 * d'exercice. La matière est indispensable : plusieurs matières partagent le
 * même nom d'épreuve (ex. "dissertation" existe en français ET en philosophie),
 * donc track+exercise_type seuls ne suffisent pas à choisir le bon barème.
 * Un sujet sans matière renseignée n'obtient volontairement AUCUNE grille
 * (mieux vaut bloquer le dépôt que corriger avec le mauvais barème).
 */
export async function GET() {
  const refus = await refuserSiPasAutorise();
  if (refus) return refus;

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
      db.from('subject_cards').select('id, track, exercise_type, matiere, card_json').eq('status', 'active'),
      db.from('rubrics').select('id, track, exercise_type, matiere, version').eq('status', 'active'),
    ]);

    if (sujetsRes.error) throw sujetsRes.error;
    if (grillesRes.error) throw grillesRes.error;

    const grilles = (grillesRes.data ?? []) as RubricLigne[];

    // Grille retenue : même filière + même matière + même type d'exercice, version la plus récente.
    const grillePour = (s: SujetLigne): string | null => {
      if (!s.matiere) return null;
      const candidates = grilles
        .filter((g) => g.track === s.track && g.exercise_type === s.exercise_type && g.matiere === s.matiere)
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      return candidates[0]?.id ?? null;
    };

    const sujets = ((sujetsRes.data ?? []) as SujetLigne[])
      .map((s) => ({
        id: s.id,
        track: s.track,
        exercise_type: s.exercise_type,
        matiere: s.matiere,
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
