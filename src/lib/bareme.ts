/**
 * Barèmes propres au sujet — accès base.
 *
 * ⚠️ SERVEUR UNIQUEMENT : lit la base pipeline avec la clé service_role.
 * Toutes les tables de ce module ont RLS activée sans aucune policy, donc
 * seul le serveur de l'application et les Edge Functions y accèdent.
 *
 * Les RÈGLES, elles, ne sont pas ici : elles sont dans `baremeNoyau.ts`,
 * partagé avec l'Edge Function de correction et testé hors ligne.
 */
import { pipelineDb } from '@/lib/pipeline';
import {
  verifierBareme,
  couvertureEtalons,
  type QuestionBareme,
  type CompetenceReferentiel,
  type StatutExamen,
} from '@/lib/baremeNoyau';

/* ------------------------------------------------------------------ */
/*  Formes lues en base                                               */
/* ------------------------------------------------------------------ */

export type Examen = {
  id: string;
  code: string;
  matiere: string;
  track: string;
  exercise_type: string | null;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  subject_id: string | null;
  sujet_url: string | null;
  sujet_texte: string | null;
  corrige_url: string | null;
  corrige_texte: string | null;
  statut: StatutExamen;
  bareme_version_active: string | null;
  commentaire: string | null;
  cree_le: string;
  maj_le: string;
};

export type VersionBareme = {
  id: string;
  exam_id: string;
  version: string;
  matiere: string;
  statut: string;
  total_points: number;
  max_score: number;
  commentaire: string | null;
  base_sur: string | null;
  controles: ControlesBareme | null;
  valide_par: string | null;
  valide_le: string | null;
  verrouille_par: string | null;
  verrouille_le: string | null;
  cree_le: string;
};

export type ControlesBareme = {
  ok: boolean;
  total_points: number;
  blocages: { code: string; question_key?: string; message: string }[];
  avertissements: { code: string; question_key?: string; message: string }[];
  verifie_le?: string;
};

export type Palier = {
  id: string;
  question_id: string;
  code: string | null;
  libelle: string;
  points: number;
  nature: 'resultat' | 'methode' | 'etape' | 'alternative' | 'bonus';
  description: string | null;
  cumulable: boolean;
  ordre: number;
};

export type ExerciceBareme = {
  id: string;
  bareme_version_id: string;
  code: string;
  titre: string | null;
  ordre: number;
};

/** Une question de barème avec tout ce que l'éditeur et le moteur en lisent. */
export type QuestionComplete = QuestionBareme & {
  id: string;
  bareme_version_id: string;
  exercice_id: string | null;
  partie: string | null;
  ordre: number;
  unites_attendues: string | null;
  precision_attendue: string | null;
  conditions_hypotheses: string | null;
  calculatrice: 'autorisee' | 'interdite' | 'indifferent';
  tolerances: string | null;
  reponses_equivalentes: unknown[];
  erreurs_frequentes: unknown[];
  regle_resultat_sans_justification: string | null;
  regle_raisonnement_juste_calcul_faux: string | null;
  criteres_relecture_humaine: string | null;
  paliers: Palier[];
};

export type BaremeComplet = {
  examen: Examen;
  version: VersionBareme;
  exercices: ExerciceBareme[];
  questions: QuestionComplete[];
  referentiel: CompetenceReferentiel[];
  codesErreurs: { code: string; description: string; gravite: string; nature: string; domaine: string | null }[];
};

/* ------------------------------------------------------------------ */
/*  Lecture                                                           */
/* ------------------------------------------------------------------ */

export async function listerExamens(matiere?: string): Promise<
  (Examen & { versions: VersionBareme[]; nb_etalons: number; nb_corrections: number })[]
> {
  const db = pipelineDb();
  let req = db.from('exams').select('*').order('date_epreuve', { ascending: true, nullsFirst: false });
  if (matiere) req = req.eq('matiere', matiere);

  const [examsRes, versionsRes, etalonsRes, corrRes] = await Promise.all([
    req,
    db.from('bareme_versions').select('*').order('cree_le', { ascending: true }),
    db.from('etalon_copies').select('id, exam_id'),
    db.from('corrections').select('id, exam_id').eq('moteur', 'bareme_sujet'),
  ]);
  if (examsRes.error) throw new Error(`Lecture des examens : ${examsRes.error.message}`);

  const versions = (versionsRes.data ?? []) as VersionBareme[];
  const compter = (rows: { exam_id: string | null }[] | null, id: string) =>
    (rows ?? []).filter((r) => r.exam_id === id).length;

  return ((examsRes.data ?? []) as Examen[]).map((e) => ({
    ...e,
    versions: versions.filter((v) => v.exam_id === e.id),
    nb_etalons: compter(etalonsRes.data as { exam_id: string | null }[] | null, e.id),
    nb_corrections: compter(corrRes.data as { exam_id: string | null }[] | null, e.id),
  }));
}

export async function chargerExamen(examId: string): Promise<Examen | null> {
  const db = pipelineDb();
  const { data, error } = await db.from('exams').select('*').eq('id', examId).maybeSingle();
  if (error) throw new Error(`Lecture de l'examen : ${error.message}`);
  return (data as Examen) ?? null;
}

/**
 * Le barème complet d'une version : exercices, questions, paliers,
 * référentiel de compétences et taxonomie de la discipline.
 */
export async function chargerBareme(versionId: string): Promise<BaremeComplet | null> {
  const db = pipelineDb();

  const { data: version, error: errV } = await db
    .from('bareme_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (errV) throw new Error(`Lecture de la version : ${errV.message}`);
  if (!version) return null;
  const v = version as VersionBareme;

  const [examRes, exRes, qRes, refRes, taxoRes] = await Promise.all([
    db.from('exams').select('*').eq('id', v.exam_id).single(),
    db.from('bareme_exercices').select('*').eq('bareme_version_id', versionId).order('ordre'),
    db.from('bareme_questions').select('*').eq('bareme_version_id', versionId).order('ordre'),
    db
      .from('competence_referentiels')
      .select('code, libelle, description, ordre, toujours_mobilisee')
      .eq('matiere', v.matiere)
      .order('ordre'),
    db
      .from('taxonomie_erreurs')
      .select('code, description, gravite, nature, domaine')
      .eq('matiere', v.matiere)
      .order('code'),
  ]);
  if (examRes.error) throw new Error(`Lecture de l'examen : ${examRes.error.message}`);

  const questions = (qRes.data ?? []) as Omit<QuestionComplete, 'paliers'>[];
  const ids = questions.map((q) => q.id);
  const { data: paliers } = ids.length
    ? await db.from('bareme_awards').select('*').in('question_id', ids).order('ordre')
    : { data: [] as Palier[] };

  return {
    examen: examRes.data as Examen,
    version: v,
    exercices: (exRes.data ?? []) as ExerciceBareme[],
    questions: questions.map((q) => ({
      ...q,
      paliers: ((paliers ?? []) as Palier[]).filter((p) => p.question_id === q.id),
    })),
    referentiel: (refRes.data ?? []) as CompetenceReferentiel[],
    codesErreurs: (taxoRes.data ?? []) as BaremeComplet['codesErreurs'],
  };
}

/** Le barème actif d'un examen, ou la dernière version si aucun n'est actif. */
export async function chargerBaremeActif(examId: string): Promise<BaremeComplet | null> {
  const examen = await chargerExamen(examId);
  if (!examen) return null;
  if (examen.bareme_version_active) return chargerBareme(examen.bareme_version_active);

  const db = pipelineDb();
  const { data } = await db
    .from('bareme_versions')
    .select('id')
    .eq('exam_id', examId)
    .order('cree_le', { ascending: false })
    .limit(1);
  const id = (data ?? [])[0]?.id as string | undefined;
  return id ? chargerBareme(id) : null;
}

/* ------------------------------------------------------------------ */
/*  Contrôles                                                          */
/* ------------------------------------------------------------------ */

/**
 * Contrôles côté application, pour l'éditeur.
 *
 * C'est un miroir de `public.bareme_verifier()`, qui reste l'autorité :
 * le verrouillage la rejoue en base, donc l'interface ne peut pas laisser
 * passer un barème incomplet même si ce code se trompe.
 */
export function controlerBareme(bareme: BaremeComplet) {
  return verifierBareme({
    questions: bareme.questions.map((q) => ({ ...q, paliers: q.paliers })),
    maxScore: Number(bareme.version.max_score),
    competencesConnues: bareme.referentiel.map((c) => c.code),
    codesErreursConnus: bareme.codesErreurs.map((c) => c.code),
  });
}

/** Contrôles faisant autorité : ceux de la base. Met aussi `controles` à jour. */
export async function verifierEnBase(versionId: string): Promise<ControlesBareme & { version?: string }> {
  const db = pipelineDb();
  const { data, error } = await db.rpc('bareme_verifier', { p_version: versionId });
  if (error) throw new Error(`Vérification du barème : ${error.message}`);
  return data as ControlesBareme;
}

export async function verrouillerBareme(versionId: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('bareme_verrouiller', {
    p_version: versionId,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as ControlesBareme;
}

export async function ouvrirCorrections(examId: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('exam_ouvrir_correction', {
    p_exam: examId,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; version: string };
}

export async function nouvelleVersion(versionId: string, nouvelle: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('bareme_nouvelle_version', {
    p_version: versionId,
    p_nouvelle: nouvelle,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function dupliquerVersExamen(
  versionId: string,
  examId: string,
  version: string,
  auteur: string,
) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('bareme_dupliquer_vers_examen', {
    p_version: versionId,
    p_exam: examId,
    p_nouvelle: version,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/* ------------------------------------------------------------------ */
/*  Écriture                                                          */
/* ------------------------------------------------------------------ */

export async function creerExamen(entree: {
  code: string;
  matiere: string;
  titre: string;
  track?: string;
  exercise_type?: string | null;
  session?: string | null;
  date_epreuve?: string | null;
  subject_id?: string | null;
  auteur: string;
}): Promise<{ examen: Examen; version: VersionBareme }> {
  const db = pipelineDb();

  const { data: examen, error } = await db
    .from('exams')
    .insert({
      code: entree.code,
      matiere: entree.matiere,
      titre: entree.titre,
      track: entree.track ?? 'generale',
      exercise_type: entree.exercise_type ?? null,
      session: entree.session ?? null,
      date_epreuve: entree.date_epreuve ?? null,
      subject_id: entree.subject_id ?? null,
      statut: 'draft',
      cree_par: entree.auteur,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Création de l'examen : ${error.message}`);

  // Un examen sans barème n'a aucun sens : la version 1.0 naît avec lui.
  const { data: version, error: errV } = await db
    .from('bareme_versions')
    .insert({
      exam_id: (examen as Examen).id,
      version: '1.0',
      matiere: entree.matiere,
      statut: 'draft',
      max_score: 20,
      cree_par: entree.auteur,
    })
    .select('*')
    .single();
  if (errV) throw new Error(`Création du barème : ${errV.message}`);

  return { examen: examen as Examen, version: version as VersionBareme };
}

export async function majExamen(examId: string, champs: Partial<Examen>): Promise<Examen> {
  const db = pipelineDb();
  const autorises: (keyof Examen)[] = [
    'titre', 'session', 'date_epreuve', 'subject_id', 'sujet_url', 'sujet_texte',
    'corrige_url', 'corrige_texte', 'commentaire', 'statut', 'exercise_type', 'track',
  ];
  const payload: Record<string, unknown> = { maj_le: new Date().toISOString() };
  for (const cle of autorises) if (cle in champs) payload[cle] = champs[cle];

  const { data, error } = await db.from('exams').update(payload).eq('id', examId).select('*').single();
  if (error) throw new Error(`Mise à jour de l'examen : ${error.message}`);
  return data as Examen;
}

export type SaisieQuestion = {
  id?: string;
  question_key: string;
  numero: string;
  libelle?: string;
  partie?: string | null;
  exercice_code?: string | null;
  ordre?: number;
  max_points: number;
  reponse_attendue?: string | null;
  raisonnement_attendu?: string | null;
  etapes?: unknown[];
  reponses_equivalentes?: unknown[];
  methodes_alternatives?: unknown[];
  erreurs_frequentes?: unknown[];
  unites_attendues?: string | null;
  precision_attendue?: string | null;
  conditions_hypotheses?: string | null;
  calculatrice?: 'autorisee' | 'interdite' | 'indifferent';
  tolerances?: string | null;
  competences?: string[];
  codes_erreurs?: string[];
  depend_de?: string[];
  regle_non_double_sanction?: string | null;
  regle_poursuite?: string | null;
  regle_resultat_sans_justification?: string | null;
  regle_raisonnement_juste_calcul_faux?: string | null;
  criteres_relecture_humaine?: string | null;
  paliers?: { code?: string | null; libelle: string; points: number; nature?: Palier['nature']; description?: string | null; cumulable?: boolean }[];
};

/**
 * Remplace intégralement la structure d'une version de barème.
 *
 * Écriture « tout ou rien » du point de vue de l'utilisateur : on écrit
 * exercices puis questions puis paliers, et on supprime ce qui a disparu de
 * la saisie. Une version verrouillée fait échouer l'appel (trigger en base).
 */
export async function enregistrerBareme(
  versionId: string,
  entree: { exercices?: { code: string; titre?: string | null; ordre?: number }[]; questions: SaisieQuestion[] },
): Promise<void> {
  const db = pipelineDb();

  const { data: version } = await db
    .from('bareme_versions')
    .select('statut')
    .eq('id', versionId)
    .maybeSingle();
  if (!version) throw new Error('Version de barème introuvable.');
  if ((version as { statut: string }).statut === 'locked') {
    throw new Error(
      'Ce barème est verrouillé. Crée une nouvelle version pour le modifier : les copies déjà corrigées doivent garder la leur.',
    );
  }

  // --- Exercices --------------------------------------------------
  const exercices = entree.exercices ?? [];
  if (exercices.length) {
    const { error } = await db.from('bareme_exercices').upsert(
      exercices.map((e, i) => ({
        bareme_version_id: versionId,
        code: e.code,
        titre: e.titre ?? null,
        ordre: e.ordre ?? i,
      })),
      { onConflict: 'bareme_version_id,code' },
    );
    if (error) throw new Error(`Enregistrement des exercices : ${error.message}`);
  }
  const { data: exLignes } = await db
    .from('bareme_exercices')
    .select('id, code')
    .eq('bareme_version_id', versionId);
  const exParCode = new Map(((exLignes ?? []) as { id: string; code: string }[]).map((e) => [e.code, e.id]));

  // --- Questions --------------------------------------------------
  const { data: avant } = await db
    .from('bareme_questions')
    .select('id, question_key')
    .eq('bareme_version_id', versionId);
  const gardees = new Set(entree.questions.map((q) => q.question_key));
  const aSupprimer = ((avant ?? []) as { id: string; question_key: string }[])
    .filter((q) => !gardees.has(q.question_key))
    .map((q) => q.id);
  if (aSupprimer.length) {
    const { error } = await db.from('bareme_questions').delete().in('id', aSupprimer);
    if (error) throw new Error(`Suppression des questions retirées : ${error.message}`);
  }

  const lignes = entree.questions.map((q, i) => ({
    bareme_version_id: versionId,
    exercice_id: q.exercice_code ? exParCode.get(q.exercice_code) ?? null : null,
    question_key: q.question_key,
    numero: q.numero,
    libelle: q.libelle ?? '',
    partie: q.partie ?? null,
    ordre: q.ordre ?? i,
    max_points: q.max_points,
    reponse_attendue: q.reponse_attendue ?? null,
    raisonnement_attendu: q.raisonnement_attendu ?? null,
    etapes: q.etapes ?? [],
    reponses_equivalentes: q.reponses_equivalentes ?? [],
    methodes_alternatives: q.methodes_alternatives ?? [],
    erreurs_frequentes: q.erreurs_frequentes ?? [],
    unites_attendues: q.unites_attendues ?? null,
    precision_attendue: q.precision_attendue ?? null,
    conditions_hypotheses: q.conditions_hypotheses ?? null,
    calculatrice: q.calculatrice ?? 'indifferent',
    tolerances: q.tolerances ?? null,
    competences: q.competences ?? [],
    codes_erreurs: q.codes_erreurs ?? [],
    depend_de: q.depend_de ?? [],
    regle_non_double_sanction: q.regle_non_double_sanction ?? null,
    regle_poursuite: q.regle_poursuite ?? null,
    regle_resultat_sans_justification: q.regle_resultat_sans_justification ?? null,
    regle_raisonnement_juste_calcul_faux: q.regle_raisonnement_juste_calcul_faux ?? null,
    criteres_relecture_humaine: q.criteres_relecture_humaine ?? null,
    maj_le: new Date().toISOString(),
  }));

  if (lignes.length) {
    const { error } = await db
      .from('bareme_questions')
      .upsert(lignes, { onConflict: 'bareme_version_id,question_key' });
    if (error) throw new Error(`Enregistrement des questions : ${error.message}`);
  }

  // --- Paliers ----------------------------------------------------
  const { data: apres } = await db
    .from('bareme_questions')
    .select('id, question_key')
    .eq('bareme_version_id', versionId);
  const idParCle = new Map(
    ((apres ?? []) as { id: string; question_key: string }[]).map((q) => [q.question_key, q.id]),
  );

  const idsQuestions = [...idParCle.values()];
  if (idsQuestions.length) {
    // Les paliers sont réécrits en entier : c'est la seule façon simple de
    // gérer suppression, réordonnancement et renommage en un seul appel.
    const { error } = await db.from('bareme_awards').delete().in('question_id', idsQuestions);
    if (error) throw new Error(`Nettoyage des paliers : ${error.message}`);
  }

  const paliers = entree.questions.flatMap((q) =>
    (q.paliers ?? []).map((p, i) => ({
      question_id: idParCle.get(q.question_key)!,
      code: p.code ?? null,
      libelle: p.libelle,
      points: p.points,
      nature: p.nature ?? 'etape',
      description: p.description ?? null,
      cumulable: p.cumulable ?? true,
      ordre: i,
    })),
  );
  if (paliers.length) {
    const { error } = await db.from('bareme_awards').insert(paliers);
    if (error) throw new Error(`Enregistrement des paliers : ${error.message}`);
  }

  await verifierEnBase(versionId);
}

/* ------------------------------------------------------------------ */
/*  Vue « écran examen »                                              */
/* ------------------------------------------------------------------ */

export type VueExamen = {
  examen: Examen;
  versions: VersionBareme[];
  bareme: BaremeComplet | null;
  controles: ControlesBareme | null;
  etalons: {
    id: string;
    libelle: string;
    niveau_cible: string | null;
    frontiere: boolean;
    statut: string;
    nb_corrections_humaines: number;
    nb_corrections_ia: number;
  }[];
  couverture: ReturnType<typeof couvertureEtalons>;
  corrections: { total: number; en_relecture: number; par_version: Record<string, number> };
  derniere_calibration: { id: string; lance_le: string; stats: unknown } | null;
};

export async function chargerVueExamen(examId: string): Promise<VueExamen | null> {
  const db = pipelineDb();
  const examen = await chargerExamen(examId);
  if (!examen) return null;

  const [versionsRes, etalonsRes, corrRes, calibRes] = await Promise.all([
    db.from('bareme_versions').select('*').eq('exam_id', examId).order('cree_le'),
    db.from('etalon_copies').select('*').eq('exam_id', examId).order('cree_le'),
    db
      .from('corrections')
      .select('id, bareme_version_id, human_review_required')
      .eq('exam_id', examId),
    db
      .from('calibration_runs')
      .select('id, lance_le, stats')
      .eq('exam_id', examId)
      .order('lance_le', { ascending: false })
      .limit(1),
  ]);

  const etalons = (etalonsRes.data ?? []) as {
    id: string;
    libelle: string;
    niveau_cible: string | null;
    frontiere: boolean;
    statut: string;
  }[];
  const ids = etalons.map((e) => e.id);

  const [humaines, ia] = ids.length
    ? await Promise.all([
        db.from('etalon_corrections_humaines').select('id, etalon_copie_id').in('etalon_copie_id', ids),
        db.from('etalon_corrections_ia').select('id, etalon_copie_id').in('etalon_copie_id', ids),
      ])
    : [{ data: [] }, { data: [] }];

  const compter = (rows: unknown, id: string) =>
    ((rows ?? []) as { etalon_copie_id: string }[]).filter((r) => r.etalon_copie_id === id).length;

  const corrections = (corrRes.data ?? []) as {
    id: string;
    bareme_version_id: string | null;
    human_review_required: boolean | null;
  }[];
  const parVersion: Record<string, number> = {};
  for (const c of corrections) {
    const cle = c.bareme_version_id ?? 'sans_version';
    parVersion[cle] = (parVersion[cle] ?? 0) + 1;
  }

  // Un examen neuf n'a pas encore de version ACTIVE — elle ne le devient
  // qu'au verrouillage. On montre alors la plus récente, sinon l'éditeur
  // n'aurait rien à éditer et l'écran resterait vide pour toujours.
  const versions = (versionsRes.data ?? []) as VersionBareme[];
  const versionAffichee = examen.bareme_version_active ?? versions[versions.length - 1]?.id ?? null;
  const bareme = versionAffichee ? await chargerBareme(versionAffichee) : null;

  return {
    examen,
    versions,
    bareme,
    controles: bareme?.version.controles ?? null,
    etalons: etalons.map((e) => ({
      ...e,
      nb_corrections_humaines: compter(humaines.data, e.id),
      nb_corrections_ia: compter(ia.data, e.id),
    })),
    couverture: couvertureEtalons(etalons.map((e) => e.niveau_cible)),
    corrections: {
      total: corrections.length,
      en_relecture: corrections.filter((c) => c.human_review_required).length,
      par_version: parVersion,
    },
    derniere_calibration: ((calibRes.data ?? [])[0] as VueExamen['derniere_calibration']) ?? null,
  };
}
