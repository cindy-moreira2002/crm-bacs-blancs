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
 * Un bac blanc COMPLET : plusieurs exercices notés séparément, dont la somme
 * des notes officielles fait la note de l'élève (HGGSP : dissertation sur 10 +
 * étude critique sur 10 = 20).
 *
 * Il n'est proposé que si TOUS ses exercices sont déposables — un exercice sans
 * sujet visible ou sans grille active rendrait la note finale fausse par
 * construction, puisqu'il manquerait une moitié.
 */
export type ExamenComplet = {
  id: string;
  code: string;
  titre: string;
  matiere: string;
  track: string;
  exercices: {
    exercise_type: string;
    subject_id: string;
    libelle: string;
    rubric_id: string;
    ordre: number;
    max_officiel: number;
  }[];
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
      { error: 'Pipeline non configuré', manquants, sujets: [], examens: [] },
      { status: 503 },
    );
  }

  try {
    const db = pipelineDb();

    const [sujetsRes, grillesRes, examsRes, exercicesRes] = await Promise.all([
      db.from('subject_cards').select('id, track, exercise_type, matiere, card_json').eq('status', 'active'),
      db.from('rubrics').select('id, track, exercise_type, matiere, version').eq('status', 'active'),
      db.from('exams').select('id, code, titre, matiere, track, statut').eq('exam_format', 'full_exam'),
      db.from('exam_exercices').select('exam_id, exercise_type, subject_id, ordre, max_officiel').order('ordre'),
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

    const lignes = (sujetsRes.data ?? []) as SujetLigne[];
    const sujets = lignes
      .map((s) => ({
        id: s.id,
        track: s.track,
        exercise_type: s.exercise_type,
        matiere: s.matiere,
        libelle: libelleSujet(s.card_json, s.id, s.track),
        rubric_id: grillePour(s),
      }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

    // Les bacs blancs complets. Les tables peuvent manquer sur un déploiement
    // ancien : on dégrade en liste vide, le dépôt exercice par exercice suffit.
    const sujetsDeposables = new Map(sujets.map((s) => [s.id, s]));
    type ExoLigne = { exam_id: string; exercise_type: string; subject_id: string | null; ordre: number; max_officiel: number };
    const exercices = (exercicesRes.error ? [] : (exercicesRes.data ?? [])) as ExoLigne[];
    const examens: ExamenComplet[] = (examsRes.error ? [] : (examsRes.data ?? []))
      .filter((e: { statut: string }) => e.statut !== 'archived')
      .map((e: { id: string; code: string; titre: string; matiere: string; track: string }) => {
        const siens = exercices.filter((x) => x.exam_id === e.id);
        return {
          id: e.id,
          code: e.code,
          titre: e.titre,
          matiere: e.matiere,
          track: e.track,
          exercices: siens.flatMap((x) => {
            const s = x.subject_id ? sujetsDeposables.get(x.subject_id) : undefined;
            if (!s || !s.rubric_id) return [];
            return [{
              exercise_type: x.exercise_type,
              subject_id: s.id,
              libelle: s.libelle,
              rubric_id: s.rubric_id,
              ordre: x.ordre,
              max_officiel: Number(x.max_officiel),
            }];
          }),
          // Le compte d'origine, pour savoir si on a dû en écarter.
          _attendus: siens.length,
        } as ExamenComplet & { _attendus: number };
      })
      // Un exercice manquant = note finale amputée de sa moitié : on n'offre pas
      // le bac blanc complet du tout, plutôt que d'en offrir la moitié.
      .filter((e: ExamenComplet & { _attendus: number }) => e.exercices.length >= 2 && e.exercices.length === e._attendus)
      .map((e: ExamenComplet & { _attendus: number }): ExamenComplet => ({
        id: e.id, code: e.code, titre: e.titre, matiere: e.matiere, track: e.track, exercices: e.exercices,
      }));

    return NextResponse.json({ sujets, examens });
  } catch (err) {
    console.error('❌ /api/pipeline/sujets', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message, sujets: [], examens: [] }, { status: 500 });
  }
}
