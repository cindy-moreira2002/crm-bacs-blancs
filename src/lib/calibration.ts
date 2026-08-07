/**
 * Calibration par copies étalons — couche 3.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du pipeline).
 *
 * Ce que ce module fait : comparer, pour UNE version de barème, ce qu'ont
 * mis des professeurs et ce qu'a mis l'IA, copie par copie et question par
 * question, puis en tirer des statistiques.
 *
 * Ce que ce module ne fait JAMAIS : modifier la note d'une copie. Si les
 * étalons montrent un décalage systématique, c'est le barème ou les
 * instructions qu'il faut reprendre — pour toutes les copies, avant
 * verrouillage. Aucune fonction d'ici n'écrit dans `corrections`.
 */
import { pipelineDb } from '@/lib/pipeline';
import {
  comparerEtalon,
  statistiquesCalibration,
  type ComparaisonEtalon,
  type CorrectionHumaineEtalon,
  type StatsCalibration,
} from '@/lib/baremeNoyau';

export type EtalonCopie = {
  id: string;
  exam_id: string;
  libelle: string;
  niveau_cible: string | null;
  frontiere: boolean;
  storage_path: string | null;
  source_url: string | null;
  correction_id: string | null;
  benchmark_card_id: string | null;
  statut: string;
  commentaire: string | null;
  cree_le: string;
};

export type CorrectionHumaine = {
  id: string;
  etalon_copie_id: string;
  bareme_version_id: string;
  prof_nom: string;
  prof_email: string | null;
  note_totale: number;
  commentaire: string | null;
  cree_le: string;
  questions: { question_key: string; points: number; justification: string | null }[];
};

export type CorrectionIaEtalon = {
  id: string;
  etalon_copie_id: string;
  bareme_version_id: string;
  correction_id: string | null;
  note_brute: number | null;
  resultat: { questions?: { question_key: string; points: number }[]; human_review_required?: boolean } | null;
  cree_le: string;
};

/* ------------------------------------------------------------------ */
/*  Copies étalons                                                    */
/* ------------------------------------------------------------------ */

export async function listerEtalons(examId: string): Promise<EtalonCopie[]> {
  const db = pipelineDb();
  const { data, error } = await db
    .from('etalon_copies')
    .select('*')
    .eq('exam_id', examId)
    .order('cree_le');
  if (error) throw new Error(`Lecture des copies étalons : ${error.message}`);
  return (data ?? []) as EtalonCopie[];
}

export async function creerEtalon(entree: {
  exam_id: string;
  libelle: string;
  niveau_cible?: string | null;
  frontiere?: boolean;
  storage_path?: string | null;
  source_url?: string | null;
  commentaire?: string | null;
}): Promise<EtalonCopie> {
  const db = pipelineDb();
  const { data, error } = await db
    .from('etalon_copies')
    .insert({
      exam_id: entree.exam_id,
      libelle: entree.libelle,
      niveau_cible: entree.niveau_cible ?? null,
      frontiere: entree.frontiere ?? false,
      storage_path: entree.storage_path ?? null,
      source_url: entree.source_url ?? null,
      commentaire: entree.commentaire ?? null,
      statut: 'importee',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Import de la copie étalon : ${error.message}`);
  return data as EtalonCopie;
}

/**
 * Enregistre la correction humaine de référence d'un professeur.
 *
 * Plusieurs professeurs peuvent corriger la même copie : chaque correction
 * est conservée séparément, jamais fusionnée. C'est ce qui permet de dire
 * honnêtement « ici les correcteurs ne sont pas d'accord ».
 */
export async function enregistrerCorrectionHumaine(entree: {
  etalon_copie_id: string;
  bareme_version_id: string;
  prof_nom: string;
  prof_email?: string | null;
  commentaire?: string | null;
  questions: { question_key: string; points: number; justification?: string | null }[];
}): Promise<CorrectionHumaine> {
  const db = pipelineDb();

  // Les points saisis ne peuvent pas dépasser le maximum de la question.
  const { data: bareme, error: errB } = await db
    .from('bareme_questions')
    .select('question_key, max_points, numero')
    .eq('bareme_version_id', entree.bareme_version_id);
  if (errB) throw new Error(`Lecture du barème : ${errB.message}`);
  const max = new Map(
    ((bareme ?? []) as { question_key: string; max_points: number; numero: string }[]).map((q) => [
      q.question_key,
      q,
    ]),
  );
  for (const q of entree.questions) {
    const def = max.get(q.question_key);
    if (!def) throw new Error(`Question « ${q.question_key} » absente de cette version du barème.`);
    if (q.points < 0 || q.points > Number(def.max_points) + 0.001) {
      throw new Error(
        `Question ${def.numero} : ${q.points} point(s) pour un maximum de ${def.max_points}.`,
      );
    }
  }

  const note = Math.round(entree.questions.reduce((s, q) => s + q.points, 0) * 100) / 100;

  const { data: correction, error } = await db
    .from('etalon_corrections_humaines')
    .insert({
      etalon_copie_id: entree.etalon_copie_id,
      bareme_version_id: entree.bareme_version_id,
      prof_nom: entree.prof_nom,
      prof_email: entree.prof_email ?? null,
      note_totale: note,
      commentaire: entree.commentaire ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Enregistrement de la correction humaine : ${error.message}`);

  if (entree.questions.length) {
    const { error: errQ } = await db.from('etalon_correction_humaine_questions').insert(
      entree.questions.map((q) => ({
        correction_humaine_id: (correction as { id: string }).id,
        question_key: q.question_key,
        points: q.points,
        justification: q.justification ?? null,
      })),
    );
    if (errQ) throw new Error(`Enregistrement du détail : ${errQ.message}`);
  }

  await db
    .from('etalon_copies')
    .update({ statut: 'corrigee_humain', maj_le: new Date().toISOString() })
    .eq('id', entree.etalon_copie_id)
    .in('statut', ['importee']);

  return { ...(correction as CorrectionHumaine), questions: entree.questions.map((q) => ({ ...q, justification: q.justification ?? null })) };
}

export async function chargerCorrectionsHumaines(
  etalonIds: string[],
  versionId: string,
): Promise<CorrectionHumaine[]> {
  if (!etalonIds.length) return [];
  const db = pipelineDb();
  const { data, error } = await db
    .from('etalon_corrections_humaines')
    .select('*')
    .in('etalon_copie_id', etalonIds)
    .eq('bareme_version_id', versionId);
  if (error) throw new Error(`Lecture des corrections humaines : ${error.message}`);

  const lignes = (data ?? []) as Omit<CorrectionHumaine, 'questions'>[];
  if (!lignes.length) return [];

  const { data: detail } = await db
    .from('etalon_correction_humaine_questions')
    .select('*')
    .in('correction_humaine_id', lignes.map((l) => l.id));

  return lignes.map((l) => ({
    ...l,
    questions: ((detail ?? []) as { correction_humaine_id: string; question_key: string; points: number; justification: string | null }[])
      .filter((d) => d.correction_humaine_id === l.id)
      .map((d) => ({ question_key: d.question_key, points: Number(d.points), justification: d.justification })),
  }));
}

export async function chargerCorrectionsIa(
  etalonIds: string[],
  versionId: string,
): Promise<CorrectionIaEtalon[]> {
  if (!etalonIds.length) return [];
  const db = pipelineDb();
  const { data, error } = await db
    .from('etalon_corrections_ia')
    .select('*')
    .in('etalon_copie_id', etalonIds)
    .eq('bareme_version_id', versionId)
    .order('cree_le', { ascending: false });
  if (error) throw new Error(`Lecture des corrections IA : ${error.message}`);
  return (data ?? []) as CorrectionIaEtalon[];
}

/* ------------------------------------------------------------------ */
/*  Comparaison et statistiques                                       */
/* ------------------------------------------------------------------ */

export type TableauCalibration = {
  version_id: string;
  version: string;
  comparaisons: ComparaisonEtalon[];
  stats: StatsCalibration;
  /** Vrai seulement si au moins une copie a été corrigée des deux côtés. */
  calibration_realisee: boolean;
};

/**
 * Le tableau de calibration d'une version de barème.
 *
 * Chaque copie est comparée avec LA MÊME version : une correction IA faite
 * sous une autre version n'entre pas dans le calcul, sinon on comparerait
 * des pommes et des poires.
 */
export async function chargerTableauCalibration(
  examId: string,
  versionId: string,
): Promise<TableauCalibration> {
  const db = pipelineDb();

  const [{ data: version }, etalons] = await Promise.all([
    db.from('bareme_versions').select('version').eq('id', versionId).maybeSingle(),
    listerEtalons(examId),
  ]);

  const { data: questions } = await db
    .from('bareme_questions')
    .select('question_key, ordre')
    .eq('bareme_version_id', versionId)
    .order('ordre');
  const cles = ((questions ?? []) as { question_key: string }[]).map((q) => q.question_key);

  const ids = etalons.map((e) => e.id);
  const [humaines, ias] = await Promise.all([
    chargerCorrectionsHumaines(ids, versionId),
    chargerCorrectionsIa(ids, versionId),
  ]);

  let relectures = 0;
  let avecIa = 0;

  const comparaisons = etalons.map((e) => {
    const profs: CorrectionHumaineEtalon[] = humaines
      .filter((h) => h.etalon_copie_id === e.id)
      .map((h) => ({
        prof: h.prof_nom,
        note_totale: Number(h.note_totale),
        parQuestion: Object.fromEntries(h.questions.map((q) => [q.question_key, Number(q.points)])),
      }));

    // La correction IA la plus récente pour cette copie ET cette version.
    const ia = ias.find((i) => i.etalon_copie_id === e.id);
    if (ia) {
      avecIa += 1;
      if (ia.resultat?.human_review_required) relectures += 1;
    }

    return comparerEtalon({
      etalonId: e.id,
      libelle: e.libelle,
      humaines: profs,
      ia: ia
        ? {
            note: Number(ia.note_brute ?? 0),
            parQuestion: Object.fromEntries(
              (ia.resultat?.questions ?? []).map((q) => [q.question_key, Number(q.points)]),
            ),
          }
        : null,
      clesQuestions: cles,
    });
  });

  const exploitables = comparaisons.filter((c) => c.ecart_total !== null);

  return {
    version_id: versionId,
    version: (version as { version: string } | null)?.version ?? '?',
    comparaisons,
    stats: statistiquesCalibration(exploitables, avecIa ? Math.round((relectures / avecIa) * 100) / 100 : null),
    calibration_realisee: exploitables.length > 0,
  };
}

/** Fige le tableau courant : trace datée de ce que valait le barème ce jour-là. */
export async function enregistrerRunCalibration(
  examId: string,
  versionId: string,
  auteur: string,
  commentaire?: string,
): Promise<string> {
  const tableau = await chargerTableauCalibration(examId, versionId);
  const db = pipelineDb();
  const { data, error } = await db
    .from('calibration_runs')
    .insert({
      exam_id: examId,
      bareme_version_id: versionId,
      lance_par: auteur,
      stats: tableau.stats,
      ecarts: tableau.comparaisons,
      commentaire: commentaire ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Enregistrement de la calibration : ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Lecture honnête du tableau : ce qu'il faut dire à un professeur relecteur.
 *
 * On ne conclut jamais « le système est validé » : on décrit ce que montre la
 * comparaison, et on nomme le remède quand il y a un biais.
 */
export function lireCalibration(stats: StatsCalibration): {
  niveau: 'aucune' | 'insuffisante' | 'a_ajuster' | 'correcte';
  message: string;
} {
  if (stats.copies_testees === 0) {
    return {
      niveau: 'aucune',
      message:
        "Aucune copie étalon n'a encore été corrigée des deux côtés : la calibration n'a pas été réalisée. Le système ne peut pas être présenté comme validé.",
    };
  }
  if (stats.copies_testees < 3) {
    return {
      niveau: 'insuffisante',
      message: `Seulement ${stats.copies_testees} copie(s) comparée(s) : trop peu pour conclure quoi que ce soit sur la fidélité du barème.`,
    };
  }
  const biais = stats.biais_moyen ?? 0;
  if (Math.abs(biais) >= 1) {
    return {
      niveau: 'a_ajuster',
      message:
        `L'IA note en moyenne ${biais > 0 ? '+' : ''}${biais} point(s) par rapport aux professeurs sur ${stats.copies_testees} copies. ` +
        `C'est un décalage systématique : il faut reprendre le barème ou les instructions, pour TOUTES les copies — ` +
        `jamais ajouter des points aux copies qui ressemblent aux étalons.`,
    };
  }
  return {
    niveau: 'correcte',
    message:
      `Écart absolu moyen de ${stats.ecart_absolu_moyen} point(s) sur ${stats.copies_testees} copies, ` +
      `biais ${biais > 0 ? '+' : ''}${biais}. Le barème peut être proposé à la validation humaine.`,
  };
}
