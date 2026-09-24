/**
 * Le pont entre un sujet noté AU BARÈME DU SUJET (maths, physique-chimie, SVT)
 * et le dépôt des copies.
 *
 * Le menu « Déposer une copie » ne connaît que des fiches `subject_cards`. Un
 * sujet poussé par `npm run sujet:pousser` n'avait qu'un examen et son barème :
 * aucune fiche, donc rien à choisir au dépôt — et une copie déposée sur une
 * ancienne fiche d'exercice partait sans `exam_id`, que `correct-copy-bareme`
 * refuse (« La copie n'est reliée à aucun examen »).
 *
 * Désormais : un examen = une fiche de même identifiant (son code), visible au
 * dépôt seulement quand ses corrections sont ouvertes, et la copie déposée sur
 * cette fiche est reliée à l'examen, donc à son barème.
 */
import { pipelineDb } from '@/lib/pipeline';

type ExamenPourFiche = {
  id: string;
  code: string;
  matiere: string;
  track: string;
  titre: string;
  exercise_type: string | null;
  subject_id: string | null;
  statut: string;
};

/**
 * Crée ou met à jour la fiche de dépôt d'un examen, et la relie à lui.
 * Visible au dépôt (`active`) uniquement si ses corrections sont ouvertes :
 * avant, une copie n'aurait aucun barème verrouillé pour être notée.
 */
export async function synchroniserFicheDepot(examId: string): Promise<{ fiche: string; visible: boolean }> {
  const db = pipelineDb();
  const { data: examen, error } = await db
    .from('exams')
    .select('id, code, matiere, track, titre, exercise_type, subject_id, statut')
    .eq('id', examId)
    .single();
  if (error || !examen) throw new Error(`Examen introuvable : ${error?.message ?? examId}`);
  const e = examen as ExamenPourFiche;

  // Le type d'exercice choisit la grille de dépôt, et donc le moteur (la grille
  // porte `moteur = 'bareme_sujet'` une fois les corrections ouvertes). Sans
  // type sur l'examen, on prend une grille active de la matière.
  let type = e.exercise_type;
  if (!type) {
    const { data: grilles } = await db
      .from('rubrics')
      .select('exercise_type')
      .eq('matiere', e.matiere)
      .eq('track', e.track)
      .eq('status', 'active')
      .order('exercise_type')
      .limit(1);
    type = (grilles?.[0] as { exercise_type: string } | undefined)?.exercise_type ?? null;
  }
  if (!type) throw new Error(`Aucune grille active en ${e.matiere} : pas de fiche de dépôt possible.`);

  const fiche = e.subject_id ?? e.code;
  const visible = e.statut === 'correction_open';
  const { error: errF } = await db.from('subject_cards').upsert({
    id: fiche,
    matiere: e.matiere,
    track: e.track,
    exercise_type: type,
    status: visible ? 'active' : 'draft',
    card_json: { exercise: 'Bac blanc complet', work: e.titre, code: e.code, exam_id: e.id },
  });
  if (errF) throw new Error(`Fiche de dépôt : ${errF.message}`);

  if (e.subject_id !== fiche) {
    const { error: errE } = await db.from('exams').update({ subject_id: fiche }).eq('id', e.id);
    if (errE) throw new Error(`Rattachement de la fiche : ${errE.message}`);
  }
  return { fiche, visible };
}

/** L'examen dont les corrections sont ouvertes sur cette fiche, s'il y en a un. */
export async function examenOuvertDeLaFiche(subjectId: string): Promise<string | null> {
  const db = pipelineDb();
  const { data } = await db
    .from('exams')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('statut', 'correction_open')
    .limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}
