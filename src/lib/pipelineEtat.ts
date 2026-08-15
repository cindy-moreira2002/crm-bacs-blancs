/**
 * État complet du pipeline de correction, pour la page de pilotage
 * /admin/correction.
 *
 * ⚠️ SERVEUR UNIQUEMENT — lit la base pipeline avec la clé service_role.
 *
 * Deux couches y sont lues côte à côte, et il ne faut jamais les confondre.
 *
 * • La couche qui produit la NOTE : exams + bareme_versions + bareme_questions,
 *   un barème propre à chaque bac blanc, question par question. C'est elle qui
 *   fait foi partout où elle existe (maths, physique-chimie).
 * • La couche de DIAGNOSTIC : rubrics (grilles de compétences), subject_cards,
 *   dossier_templates, benchmark_cards. Elle produit encore la note pour les
 *   matières non migrées, et seulement le profil pédagogique pour les autres.
 *
 * S'y ajoutent les corrections lancées, les retours des profs relecteurs et —
 * quand la base CRM répond — les sessions vendues, pour mettre les dates en
 * face de l'état de préparation.
 */
import { crmAdmin, authManquant } from './authProf';
import { pipelineDb, libelleSujet } from './pipeline';
import type { StructExamen } from './pipelineVerifs';

// --- Libellés ---------------------------------------------------------
// Ils vivent dans matieres.ts, sans aucun import : un composant client peut
// les lire sans embarquer ce module, qui touche la base en service_role.
import { LABELS_MATIERES, labelExercice, labelMatiere } from './matieres';
export { LABELS_MATIERES, labelExercice, labelMatiere };
import { moteurAttendu, type MoteurNote } from './moteurs';
export { MOTEUR_ATTENDU, CE_QUI_SE_DEFINIT, LIBELLE_MOTEUR, moteurAttendu } from './moteurs';
export type { MoteurNote } from './moteurs';

/** « Mathématiques », « maths », « Histoire-Géographie »… → slug pipeline. */
export function slugMatiere(brut: string): string {
  const s = brut
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  if (s.startsWith('math')) return 'maths';
  if (s.startsWith('franc')) return 'francais';
  if (s.startsWith('histoire')) return 'histoire-geo';
  if (s.startsWith('physique')) return 'physique-chimie';
  if (s.startsWith('philo')) return 'philosophie';
  return s.replace(/\s+/g, '-');
}

// --- Formes du snapshot ----------------------------------------------

export type SujetEtat = {
  id: string;
  libelle: string;
  status: string;
};

export type ExerciceEtat = {
  track: string;
  exercise_type: string;
  label: string;
  /** `grille_id` : la grille rédigée désignée par cette grille de dépôt, s'il y en a une. */
  grille: { id: string; version: number | null; status: string; moteur: string; grille_id: string | null } | null;
  gabarit: { id: string; status: string } | null;
  sujets: SujetEtat[];
  etalons: { total: number; synthetiques: number; valides: number };
};

/**
 * Couche 3 — une grille RÉDIGÉE (HGGSP et les épreuves du même genre) :
 * critères décrits, note analytique sur 20 convertie en note officielle,
 * statut versionné et verrouillage en base.
 *
 * Ce n'est ni la grille de compétences (`rubrics`) ni le barème par sujet
 * (`bareme_versions`) : c'est un troisième moteur, et la page de pilotage
 * mentirait si elle le rangeait dans l'un des deux autres.
 */
export type GrilleRedigeeEtat = {
  id: string;
  exercise_type: string;
  label: string;
  libelle: string;
  version: string;
  statut: string;
  max_analytique: number;
  max_officiel: number;
  criteres: number;
  valide_par: string | null;
  verrouille_le: string | null;
  /** Copies d'élèves notées avec cette grille (étalons exclus). */
  copies: number;
  /** Copies étalons rattachées à cette grille. */
  etalons: number;
  /** Dont des étalons de calibration inventés, pas de vraies copies. */
  etalons_synthetiques: number;
  /** Corrections humaines saisies sur ces étalons — la seule vraie référence. */
  corrections_humaines: number;
  /** Écart moyen IA − professeurs, quand la comparaison existe. */
  biais_moyen: number | null;
  /** Relectures humaines encore ouvertes sur les copies de cette grille. */
  relectures_ouvertes: number;
};

export type SessionVendue = {
  date_epreuve: string;
  statut: string | null;
};

/**
 * Un bac blanc et son barème propre — la couche qui produit la NOTE.
 * Voir StructExamen dans pipelineVerifs.ts : c'est la même forme, pour que
 * les diagnostics s'appliquent sans conversion.
 */
export type ExamenEtat = StructExamen & { date_epreuve: string | null };

export type MatiereEtat = {
  matiere: string;
  label: string;
  session: SessionVendue | null;
  exercices: ExerciceEtat[];
  /** Les bacs blancs de la matière qui ont un barème propre. */
  examens: ExamenEtat[];
  /** Les grilles rédigées de la matière — le 3ᵉ moteur. */
  grilles_redigees: GrilleRedigeeEtat[];
  /**
   * D'où sort la note dans cette matière :
   *   grille_generique — la grille de compétences, comme avant ;
   *   bareme_sujet     — un barème propre au sujet, question par question ;
   *   criteres_rediges — une grille rédigée, note analytique convertie ;
   *   mixte            — plusieurs coexistent (migration en cours).
   */
  moteur_note: MoteurNote | 'mixte';
  /**
   * Le moteur que cette matière DOIT utiliser, vu la forme de son épreuve.
   * Ce n'est pas un objectif de migration : le français restera sur sa grille
   * commune. Comparer les deux dit si quelque chose ne tourne pas rond ;
   * l'absence de barème par sujet en français n'est pas un manque.
   */
  moteur_attendu: MoteurNote;
  totaux: {
    grilles_actives: number;
    grilles: number;
    sujets_actifs: number;
    sujets: number;
    gabarits_actifs: number;
    gabarits: number;
    etalons: number;
    etalons_synthetiques: number;
    etalons_valides: number;
    corrections_reussies: number;
    retours_profs: number;
  };
  /** 'active' (tout), 'partielle' (une partie), 'draft' (rien). */
  visibilite: 'active' | 'partielle' | 'draft';
};

export type CorrectionLigne = {
  id: string;
  created_at: string;
  matiere: string | null;
  exercise_type: string;
  subject_id: string | null;
  status: string;
  student_name: string | null;
  teacher_email: string | null;
  processing_error: string | null;
  note: string | null;
  review: string | null;
  source: string | null;
};

export type RetourProf = {
  id: string;
  matiere: string;
  prof_nom: string;
  prof_email: string;
  etablissement: string | null;
  reponses: Record<string, unknown>;
  created_at: string;
};

export type SnapshotPipeline = {
  genere_le: string;
  matieres: MatiereEtat[];
  corrections: CorrectionLigne[];
  couts: {
    corrections_7j: number;
    corrections_30j: number;
    corrections_total: number;
    /** Ordre de grandeur constaté : transcription + correction + dossier. */
    usd_par_copie: number;
  };
  retours: RetourProf[];
  alertes: string[];
  etalons_orphelins: number;
  sessions_disponibles: boolean;
  /** Couche 1 — les bacs blancs qui ont un barème propre, toutes matières. */
  baremes: {
    examens: number;
    corrections_ouvertes: number;
    verrouilles: number;
    copies: number;
    etalons: number;
    copies_comparees: number;
  };
  /** Couche 3 — les grilles rédigées, toutes matières. */
  redigees: {
    grilles: number;
    en_calibration: number;
    verrouillees: number;
    copies: number;
    etalons: number;
    /** Étalons dont la correction humaine a réellement été saisie. */
    etalons_humains: number;
    relectures_ouvertes: number;
    /** Bacs blancs complets (deux exercices, note finale sur 20). */
    examens_complets: number;
    /** Copies déposées en bac blanc complet, groupées par élève. */
    groupes_complets: number;
  };
};

// --- Collecte ---------------------------------------------------------

const USD_PAR_COPIE = 0.22;

/**
 * La couche 1 : un examen, sa version de barème affichée, l'état de sa
 * calibration et les copies déjà notées avec lui.
 *
 * Les tables peuvent ne pas exister sur un déploiement antérieur au chantier
 * du 7 août 2026 : on dégrade en liste vide plutôt que de casser la page de
 * pilotage entière.
 */
export async function chargerExamens(): Promise<Map<string, ExamenEtat[]>> {
  const db = pipelineDb();
  const parMatiere = new Map<string, ExamenEtat[]>();

  const { data: exams, error } = await db
    .from('exams')
    .select('id, code, matiere, titre, statut, date_epreuve, bareme_version_active')
    .order('date_epreuve', { ascending: true, nullsFirst: false });
  if (error || !exams?.length) return parMatiere;

  type Exam = {
    id: string; code: string; matiere: string; titre: string; statut: string;
    date_epreuve: string | null; bareme_version_active: string | null;
  };
  type Version = {
    id: string; exam_id: string; version: string; statut: string;
    total_points: number; max_score: number; cree_le: string;
    controles: { blocages?: unknown[] } | null;
  };

  const [versionsRes, etalonsRes, corrRes, exosRes] = await Promise.all([
    db.from('bareme_versions').select('id, exam_id, version, statut, total_points, max_score, cree_le, controles').order('cree_le'),
    db.from('etalon_copies').select('id, exam_id'),
    db.from('corrections').select('id, exam_id, bareme_version_id').eq('moteur', 'bareme_sujet').eq('est_etalon', false),
    db.from('exam_exercices').select('exam_id'),
  ]);

  // Un bac blanc découpé en exercices est noté par des GRILLES RÉDIGÉES, pas
  // par une version de barème. Le laisser ici lui reprocherait éternellement de
  // ne pas avoir de barème — alors qu'il n'en aura jamais : il a des grilles.
  const parExercices = new Map<string, number>();
  for (const x of (exosRes.data ?? []) as { exam_id: string }[]) {
    parExercices.set(x.exam_id, (parExercices.get(x.exam_id) ?? 0) + 1);
  }
  const notesParGrilleRedigee = new Set(
    [...parExercices.entries()].filter(([, n]) => n >= 2).map(([id]) => id),
  );

  const versions = (versionsRes.data ?? []) as Version[];
  const etalons = (etalonsRes.data ?? []) as { id: string; exam_id: string }[];
  const copies = (corrRes.data ?? []) as { exam_id: string | null; bareme_version_id: string | null }[];

  const idsEtalons = etalons.map((e) => e.id);
  const [humainesRes, iasRes] = idsEtalons.length
    ? await Promise.all([
        db.from('etalon_corrections_humaines').select('etalon_copie_id, bareme_version_id, note_totale').in('etalon_copie_id', idsEtalons),
        db.from('etalon_corrections_ia').select('etalon_copie_id, bareme_version_id, note_brute').in('etalon_copie_id', idsEtalons),
      ])
    : [{ data: [] }, { data: [] }];

  const humaines = (humainesRes.data ?? []) as { etalon_copie_id: string; bareme_version_id: string; note_totale: number }[];
  const ias = (iasRes.data ?? []) as { etalon_copie_id: string; bareme_version_id: string; note_brute: number | null }[];

  for (const e of exams as Exam[]) {
    if (notesParGrilleRedigee.has(e.id)) continue;
    const siennes = versions.filter((v) => v.exam_id === e.id);
    // La version active, sinon la plus récente : un examen en préparation n'a
    // pas encore d'active, et il faut quand même voir où en est son barème.
    const version = siennes.find((v) => v.id === e.bareme_version_active) ?? siennes[siennes.length - 1] ?? null;

    const mesEtalons = etalons.filter((x) => x.exam_id === e.id).map((x) => x.id);
    const mesCopies = copies.filter((c) => c.exam_id === e.id);

    // La calibration ne compare que ce qui a été noté avec LA MÊME version.
    const ecarts: number[] = [];
    if (version) {
      for (const id of mesEtalons) {
        const notes = humaines
          .filter((h) => h.etalon_copie_id === id && h.bareme_version_id === version.id)
          .map((h) => Number(h.note_totale));
        const ia = ias.find((i) => i.etalon_copie_id === id && i.bareme_version_id === version.id);
        if (!notes.length || !ia || ia.note_brute === null) continue;
        ecarts.push(Number(ia.note_brute) - notes.reduce((a, b) => a + b, 0) / notes.length);
      }
    }

    const ligne: ExamenEtat = {
      id: e.id,
      code: e.code,
      titre: e.titre,
      statut: e.statut,
      date_epreuve: e.date_epreuve,
      version: version?.version ?? null,
      statut_version: version?.statut ?? null,
      total_points: version ? Number(version.total_points) : null,
      max_score: version ? Number(version.max_score) : null,
      blocages: (version?.controles?.blocages ?? []).length,
      etalons: mesEtalons.length,
      corrections_humaines: humaines.filter((h) => mesEtalons.includes(h.etalon_copie_id)).length,
      copies_comparees: ecarts.length,
      biais_moyen: ecarts.length ? Math.round((ecarts.reduce((a, b) => a + b, 0) / ecarts.length) * 100) / 100 : null,
      copies: mesCopies.length,
      versions_utilisees: new Set(mesCopies.map((c) => c.bareme_version_id ?? 'sans')).size,
    };

    const liste = parMatiere.get(e.matiere) ?? [];
    liste.push(ligne);
    parMatiere.set(e.matiere, liste);
  }

  return parMatiere;
}

/**
 * La couche 3 : les grilles rédigées, leur statut de versionnement, et l'état
 * réel de leur calibration.
 *
 * On distingue deux choses que le reste de la page confond volontiers :
 * un étalon EXISTE (une copie de référence est en base) et un étalon est
 * CORRIGÉ PAR UN HUMAIN (`etalon_corrections_humaines`). Seule la seconde
 * calibre quoi que ce soit — un profil de calibration inventé ne prouve rien.
 *
 * Les tables peuvent manquer sur un déploiement antérieur au 7 août 2026 : on
 * dégrade en map vide plutôt que de casser le pilotage entier.
 */
export async function chargerGrillesRedigees(): Promise<Map<string, GrilleRedigeeEtat[]>> {
  const db = pipelineDb();
  const parMatiere = new Map<string, GrilleRedigeeEtat[]>();

  const { data: grilles, error } = await db
    .from('grilles_redigees')
    .select('id, matiere, exercise_type, version, libelle, statut, max_analytique, max_officiel, valide_par, verrouille_le')
    .order('matiere')
    .order('exercise_type');
  if (error || !grilles?.length) return parMatiere;

  type Grille = {
    id: string; matiere: string; exercise_type: string; version: string; libelle: string;
    statut: string; max_analytique: number; max_officiel: number;
    valide_par: string | null; verrouille_le: string | null;
  };
  const ids = (grilles as Grille[]).map((g) => g.id);

  const [criteresRes, copiesRes, etalonsRes, benchRes] = await Promise.all([
    db.from('grille_criteres').select('id, grille_id').in('grille_id', ids),
    db
      .from('corrections')
      .select('id, grille_id, human_review_required')
      .eq('moteur', 'criteres_rediges')
      .eq('est_etalon', false),
    db.from('etalon_copies').select('id, grille_id, benchmark_card_id').in('grille_id', ids),
    db.from('benchmark_cards').select('id, origin:card_json->>origin').limit(2000),
  ]);

  const criteres = (criteresRes.data ?? []) as { id: string; grille_id: string }[];
  const copies = (copiesRes.data ?? []) as { id: string; grille_id: string | null; human_review_required: boolean | null }[];
  const etalons = (etalonsRes.data ?? []) as { id: string; grille_id: string | null; benchmark_card_id: string | null }[];
  const bench = new Map(((benchRes.data ?? []) as { id: string; origin: string | null }[]).map((b) => [b.id, b.origin]));

  const idsEtalons = etalons.map((e) => e.id);
  const idsCopies = copies.map((c) => c.id);
  const [humainesRes, iasRes, relecturesRes] = await Promise.all([
    idsEtalons.length
      ? db.from('etalon_corrections_humaines').select('etalon_copie_id, grille_id, note_totale').in('etalon_copie_id', idsEtalons)
      : Promise.resolve({ data: [] }),
    idsEtalons.length
      ? db.from('etalon_corrections_ia').select('etalon_copie_id, note_brute').in('etalon_copie_id', idsEtalons)
      : Promise.resolve({ data: [] }),
    idsCopies.length
      ? db.from('relectures_humaines').select('correction_id').eq('statut', 'ouverte').in('correction_id', idsCopies)
      : Promise.resolve({ data: [] }),
  ]);

  const humaines = (humainesRes.data ?? []) as { etalon_copie_id: string; grille_id: string | null; note_totale: number }[];
  const ias = (iasRes.data ?? []) as { etalon_copie_id: string; note_brute: number | null }[];
  const relectures = (relecturesRes.data ?? []) as { correction_id: string }[];

  for (const g of grilles as Grille[]) {
    const mesEtalons = etalons.filter((e) => e.grille_id === g.id);
    const mesCopies = copies.filter((c) => c.grille_id === g.id);
    const idsMesCopies = new Set(mesCopies.map((c) => c.id));

    const ecarts: number[] = [];
    for (const e of mesEtalons) {
      const notes = humaines.filter((h) => h.etalon_copie_id === e.id).map((h) => Number(h.note_totale));
      const ia = ias.find((i) => i.etalon_copie_id === e.id);
      if (!notes.length || !ia || ia.note_brute === null) continue;
      ecarts.push(Number(ia.note_brute) - notes.reduce((a, b) => a + b, 0) / notes.length);
    }

    const ligne: GrilleRedigeeEtat = {
      id: g.id,
      exercise_type: g.exercise_type,
      label: labelExercice(g.exercise_type),
      libelle: g.libelle,
      version: g.version,
      statut: g.statut,
      max_analytique: Number(g.max_analytique),
      max_officiel: Number(g.max_officiel),
      criteres: criteres.filter((c) => c.grille_id === g.id).length,
      valide_par: g.valide_par,
      verrouille_le: g.verrouille_le,
      copies: mesCopies.length,
      etalons: mesEtalons.length,
      etalons_synthetiques: mesEtalons.filter((e) =>
        (bench.get(e.benchmark_card_id ?? '') ?? '').includes('synthetic'),
      ).length,
      corrections_humaines: humaines.filter((h) => mesEtalons.some((e) => e.id === h.etalon_copie_id)).length,
      biais_moyen: ecarts.length ? Math.round((ecarts.reduce((a, b) => a + b, 0) / ecarts.length) * 100) / 100 : null,
      relectures_ouvertes: relectures.filter((r) => idsMesCopies.has(r.correction_id)).length,
    };

    const liste = parMatiere.get(g.matiere) ?? [];
    liste.push(ligne);
    parMatiere.set(g.matiere, liste);
  }

  return parMatiere;
}

/**
 * Les bacs blancs COMPLETS (deux exercices, note finale sur 20) et les copies
 * réellement déposées sous cette forme.
 *
 * C'est le seul chemin où la note finale d'un élève est la somme de deux notes
 * officielles sur 10. Tant que `groupes` vaut 0, ce chemin n'a jamais servi.
 */
async function chargerExamensComplets(): Promise<{ examens: number; groupes: number }> {
  const db = pipelineDb();
  const [exosRes, vueRes] = await Promise.all([
    db.from('exam_exercices').select('exam_id'),
    db.from('v_notes_examen_redige').select('groupe_copie_id', { count: 'exact', head: true }),
  ]);
  // On compte les examens qui ont VRAIMENT plusieurs exercices, pas ceux qui
  // portent `exam_format = 'full_exam'` : cette colonne a une valeur par défaut,
  // et tous les bacs blancs de maths ou de physique la portent sans avoir le
  // moindre exercice déclaré.
  const parExamen = new Map<string, number>();
  for (const x of (exosRes.data ?? []) as { exam_id: string }[]) {
    parExamen.set(x.exam_id, (parExamen.get(x.exam_id) ?? 0) + 1);
  }
  const examens = [...parExamen.values()].filter((n) => n >= 2).length;
  return { examens, groupes: vueRes.count ?? 0 };
}

async function compterCorrections(depuisJours: number | null): Promise<number> {
  const db = pipelineDb();
  let req = db.from('corrections').select('id', { count: 'exact', head: true });
  if (depuisJours !== null) {
    const depuis = new Date(Date.now() - depuisJours * 24 * 3600 * 1000).toISOString();
    req = req.gte('created_at', depuis);
  }
  const { count, error } = await req;
  if (error) throw error;
  return count ?? 0;
}

/** Les sessions vendues, par matière. Base CRM absente → null (on dégrade). */
async function chargerSessions(): Promise<Map<string, SessionVendue> | null> {
  if (authManquant().length) return null;
  try {
    const { data, error } = await crmAdmin()
      .from('sessions_bacs_blancs')
      .select('matiere, date_epreuve, statut')
      .order('date_epreuve', { ascending: true });
    if (error || !data) return null;
    const parMatiere = new Map<string, SessionVendue>();
    for (const s of data as { matiere: string; date_epreuve: string; statut: string | null }[]) {
      const slug = slugMatiere(s.matiere ?? '');
      // Première session à venir ; sinon la plus récente passée.
      const deja = parMatiere.get(slug);
      const aVenir = s.date_epreuve >= new Date().toISOString().slice(0, 10);
      const dejaAVenir = deja && deja.date_epreuve >= new Date().toISOString().slice(0, 10);
      if (!deja || (aVenir && !dejaAVenir)) {
        parMatiere.set(slug, { date_epreuve: s.date_epreuve, statut: s.statut });
      }
    }
    return parMatiere;
  } catch {
    return null;
  }
}

export async function chargerEtatPipeline(): Promise<SnapshotPipeline> {
  const db = pipelineDb();

  const [
    rubRes, sujRes, tplRes, benchRes, corrRes, retoursRes, sessions,
    examensParMatiere, redigeesParMatiere, complets, c7, c30, cTot,
  ] =
    await Promise.all([
      db.from('rubrics').select('id, matiere, track, exercise_type, status, version, moteur, grille_id'),
      db.from('subject_cards').select('id, matiere, track, exercise_type, status, card_json'),
      db.from('dossier_templates').select('id, matiere, track, exercise_type, audience, status'),
      db
        .from('benchmark_cards')
        .select('id, subject_id, track, exercise_type, validation_status, origin:card_json->>origin')
        .limit(2000),
      db
        .from('corrections')
        .select(
          'id, created_at, matiere, exercise_type, subject_id, status, student_name, teacher_email, processing_error, source, note:result_json->>note_finale, review:result_json->>human_review_required',
        )
        .order('created_at', { ascending: false })
        .limit(60),
      db.from('relecture_feedback').select('*').order('created_at', { ascending: false }).limit(200),
      chargerSessions(),
      chargerExamens(),
      chargerGrillesRedigees(),
      chargerExamensComplets(),
      compterCorrections(7),
      compterCorrections(30),
      compterCorrections(null),
    ]);

  for (const r of [rubRes, sujRes, tplRes, benchRes, corrRes]) {
    if (r.error) throw r.error;
  }
  // Les retours peuvent échouer si la table n'existe pas encore : on dégrade.
  const retours = (retoursRes.error ? [] : (retoursRes.data ?? [])) as RetourProf[];

  type Rub = { id: string; matiere: string | null; track: string; exercise_type: string; status: string; version: number | null; moteur: string | null; grille_id: string | null };
  type Suj = { id: string; matiere: string | null; track: string; exercise_type: string; status: string; card_json: Record<string, unknown> | null };
  type Tpl = { id: string; matiere: string | null; track: string; exercise_type: string; audience: string; status: string };
  type Bench = { id: string; subject_id: string | null; track: string; exercise_type: string; validation_status: string | null; origin: string | null };

  const rubriques = (rubRes.data ?? []) as Rub[];
  const sujets = (sujRes.data ?? []) as Suj[];
  const gabarits = (tplRes.data ?? []) as Tpl[];
  const etalons = (benchRes.data ?? []) as Bench[];
  const corrections = (corrRes.data ?? []) as CorrectionLigne[];

  const sujetParId = new Map(sujets.map((s) => [s.id, s]));

  // Un « exercice » = matière + filière + type d'épreuve.
  const cle = (m: string | null, t: string, e: string) => `${m ?? '∅'}|${t}|${e}`;
  const exercices = new Map<string, ExerciceEtat & { matiere: string | null }>();
  const exercice = (m: string | null, t: string, e: string) => {
    const k = cle(m, t, e);
    let ex = exercices.get(k);
    if (!ex) {
      ex = {
        matiere: m,
        track: t,
        exercise_type: e,
        label: labelExercice(e) + (t === 'technologique' ? ' · techno' : ''),
        grille: null,
        gabarit: null,
        sujets: [],
        etalons: { total: 0, synthetiques: 0, valides: 0 },
      };
      exercices.set(k, ex);
    }
    return ex;
  };

  for (const r of rubriques) {
    const ex = exercice(r.matiere, r.track, r.exercise_type);
    // Plusieurs versions possibles : on retient la plus récente.
    if (!ex.grille || (r.version ?? 0) > (ex.grille.version ?? 0)) {
      ex.grille = {
        id: r.id,
        version: r.version,
        status: r.status,
        moteur: r.moteur ?? 'grille_generique',
        grille_id: r.grille_id,
      };
    }
  }
  for (const s of sujets) {
    exercice(s.matiere, s.track, s.exercise_type).sujets.push({
      id: s.id,
      libelle: libelleSujet(s.card_json, s.id, s.track),
      status: s.status,
    });
  }
  for (const t of gabarits) {
    if (t.audience !== 'eleve') continue;
    exercice(t.matiere, t.track, t.exercise_type).gabarit = { id: t.id, status: t.status };
  }

  let orphelins = 0;
  for (const b of etalons) {
    const s = b.subject_id ? sujetParId.get(b.subject_id) : undefined;
    if (!s) {
      orphelins += 1;
      continue;
    }
    const e = exercice(s.matiere, s.track, s.exercise_type).etalons;
    const synthetique = (b.origin ?? '').includes('synthetic');
    e.total += 1;
    if (synthetique) e.synthetiques += 1;
    // « Validé » ne veut dire quelque chose que sur une VRAIE copie : un profil
    // de calibration inventé porte lui aussi validation_status = 'validated',
    // parce qu'il a été posé en base tel quel. Le compter ici ferait dire à la
    // page qu'un professeur a validé une référence que personne n'a lue.
    if (b.validation_status === 'validated' && !synthetique) e.valides += 1;
  }

  // Corrections abouties et retours, par matière.
  const reussiesParMatiere = new Map<string, number>();
  for (const c of corrections) {
    if (!c.matiere || !c.status.startsWith('corrected')) continue;
    reussiesParMatiere.set(c.matiere, (reussiesParMatiere.get(c.matiere) ?? 0) + 1);
  }
  const retoursParMatiere = new Map<string, number>();
  for (const r of retours) {
    retoursParMatiere.set(r.matiere, (retoursParMatiere.get(r.matiere) ?? 0) + 1);
  }

  // Regroupement par matière.
  const parMatiere = new Map<string, ExerciceEtat[]>();
  for (const ex of exercices.values()) {
    if (!ex.matiere) continue; // étalons hors sujets connus déjà comptés en orphelins
    const liste = parMatiere.get(ex.matiere) ?? [];
    liste.push(ex);
    parMatiere.set(ex.matiere, liste);
  }

  // Une matiere peut n'avoir qu'un bareme propre, sans aucune grille generique :
  // sans cette boucle, elle serait invisible dans le pilotage.
  for (const matiere of examensParMatiere?.keys() ?? []) {
    if (!parMatiere.has(matiere)) parMatiere.set(matiere, []);
  }
  // Idem pour une matiere qui n'est notee que par une grille redigee.
  for (const matiere of redigeesParMatiere?.keys() ?? []) {
    if (!parMatiere.has(matiere)) parMatiere.set(matiere, []);
  }

  const matieres: MatiereEtat[] = [...parMatiere.entries()]
    .map(([matiere, exs]) => {
      exs.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      const tousSujets = exs.flatMap((e) => e.sujets);
      const grilles = exs.filter((e) => e.grille);
      const gabaritsEleve = exs.filter((e) => e.gabarit);
      const totaux = {
        grilles_actives: grilles.filter((e) => e.grille!.status === 'active').length,
        grilles: grilles.length,
        sujets_actifs: tousSujets.filter((s) => s.status === 'active').length,
        sujets: tousSujets.length,
        gabarits_actifs: gabaritsEleve.filter((e) => e.gabarit!.status === 'active').length,
        gabarits: gabaritsEleve.length,
        etalons: exs.reduce((n, e) => n + e.etalons.total, 0),
        etalons_synthetiques: exs.reduce((n, e) => n + e.etalons.synthetiques, 0),
        etalons_valides: exs.reduce((n, e) => n + e.etalons.valides, 0),
        corrections_reussies: reussiesParMatiere.get(matiere) ?? 0,
        retours_profs: retoursParMatiere.get(matiere) ?? 0,
      };
      const actifs = totaux.grilles_actives + totaux.sujets_actifs + totaux.gabarits_actifs;
      const total = totaux.grilles + totaux.sujets + totaux.gabarits;
      const visibilite: MatiereEtat['visibilite'] =
        actifs === 0 ? 'draft' : actifs === total ? 'active' : 'partielle';

      // D'ou sort la note ici ? Trois moteurs peuvent y prétendre :
      //   - un barème propre au sujet, dès que ses corrections sont ouvertes ;
      //   - une grille rédigée, dès qu'une grille de dépôt active la désigne ;
      //   - la grille générique, partout ailleurs.
      // On lit le moteur SUR LA GRILLE DE DÉPÔT (`rubrics.moteur`), parce que
      // c'est elle que le trigger recopie sur la correction : c'est donc elle,
      // et rien d'autre, qui décide de l'Edge Function appelée.
      const examens = examensParMatiere?.get(matiere) ?? [];
      const grilles_redigees = redigeesParMatiere?.get(matiere) ?? [];
      const parBareme = examens.some((e) => e.statut === 'correction_open');
      const exercicesActifs = exs.filter((e) => e.grille?.status === 'active');
      const parRedige = exercicesActifs.some((e) => e.grille!.moteur === 'criteres_rediges');
      const parGrille =
        totaux.sujets_actifs > 0 && exercicesActifs.some((e) => e.grille!.moteur !== 'criteres_rediges');
      const moteurs = [parBareme && 'bareme_sujet', parRedige && 'criteres_rediges', parGrille && 'grille_generique']
        .filter(Boolean) as MatiereEtat['moteur_note'][];
      const moteur_note: MatiereEtat['moteur_note'] =
        moteurs.length > 1 ? 'mixte' : (moteurs[0] ?? 'grille_generique');

      return {
        matiere,
        label: labelMatiere(matiere),
        moteur_attendu: moteurAttendu(matiere),
        session: sessions?.get(matiere) ?? null,
        exercices: exs,
        examens,
        grilles_redigees,
        moteur_note,
        totaux,
        visibilite,
      };
    })
    // Matières avec session d'abord (par date), puis les autres par nom.
    .sort((a, b) => {
      if (a.session && b.session) return a.session.date_epreuve.localeCompare(b.session.date_epreuve);
      if (a.session) return -1;
      if (b.session) return 1;
      return a.label.localeCompare(b.label, 'fr');
    });

  // Alertes : ce qui mérite un œil, calculé côté serveur pour rester honnête.
  const alertes: string[] = [];
  const totalValides = matieres.reduce((n, m) => n + m.totaux.etalons_valides, 0);
  if (totalValides === 0) {
    alertes.push(
      'Aucun étalon validé par un prof (0 sur ' +
        matieres.reduce((n, m) => n + m.totaux.etalons, 0) +
        ') : toutes les notes reposent sur des références non vérifiées.',
    );
  }
  const visiblesSynthetiques = matieres.filter(
    (m) => m.visibilite !== 'draft' && m.totaux.etalons_synthetiques === m.totaux.etalons && m.totaux.etalons > 0,
  );
  if (visiblesSynthetiques.length) {
    alertes.push(
      'Visibles au dépôt avec étalons 100 % synthétiques (note approximative) : ' +
        visiblesSynthetiques.map((m) => m.label).join(', ') +
        '.',
    );
  }
  if (orphelins > 0) {
    alertes.push(
      `${orphelins} étalons orphelins (rattachés à des sujets supprimés) — dont les vraies copies de français, à réaffecter.`,
    );
  }
  const echecs = corrections.filter((c) => c.status.includes('failed'));
  if (echecs.length) {
    alertes.push(`${echecs.length} correction(s) en échec parmi les 60 dernières.`);
  }
  if (!sessions) {
    alertes.push('Base CRM injoignable d’ici : dates de sessions non affichées.');
  }

  // --- Couche 1 : les barèmes propres aux sujets ----------------------
  const tousExamens = matieres.flatMap((m) => m.examens);
  for (const e of tousExamens) {
    if (e.versions_utilisees > 1) {
      alertes.push(
        `« ${e.titre} » : ${e.copies} copies corrigées avec ${e.versions_utilisees} versions de barème différentes — deux élèves n'ont pas été notés pareil.`,
      );
    }
    if (e.statut === 'correction_open' && e.statut_version !== 'locked') {
      alertes.push(`« ${e.titre} » accepte des copies alors que son barème n'est pas verrouillé.`);
    }
    if (e.statut === 'correction_open' && e.copies_comparees === 0) {
      alertes.push(
        `« ${e.titre} » corrige des copies d'élèves sans qu'aucune copie étalon n'ait été comparée : le barème n'a jamais été confronté à un correcteur humain.`,
      );
    }
    if (e.biais_moyen !== null && Math.abs(e.biais_moyen) >= 1) {
      alertes.push(
        `« ${e.titre} » : écart systématique de ${e.biais_moyen > 0 ? '+' : ''}${e.biais_moyen} point(s) entre l'IA et les professeurs — à corriger dans le barème, pour toutes les copies.`,
      );
    }
  }

  const baremes = {
    examens: tousExamens.length,
    corrections_ouvertes: tousExamens.filter((e) => e.statut === 'correction_open').length,
    verrouilles: tousExamens.filter((e) => e.statut_version === 'locked').length,
    copies: tousExamens.reduce((n, e) => n + e.copies, 0),
    etalons: tousExamens.reduce((n, e) => n + e.etalons, 0),
    copies_comparees: tousExamens.reduce((n, e) => n + e.copies_comparees, 0),
  };

  // --- Couche 3 : les grilles rédigées --------------------------------
  const VERROUILLEES = ['locked', 'in_use'];
  const toutesRedigees = matieres.flatMap((m) => m.grilles_redigees);
  for (const g of toutesRedigees) {
    const visible = matieres.some((m) =>
      m.exercices.some((e) => e.grille?.grille_id === g.id && e.grille.status === 'active'),
    );
    if (visible && !VERROUILLEES.includes(g.statut)) {
      alertes.push(
        `« ${g.libelle} » corrige des copies alors que la grille est en « ${g.statut} » : chaque note est provisoire et doit être validée par un professeur.`,
      );
    }
    if (g.copies > 0 && g.corrections_humaines === 0) {
      alertes.push(
        `« ${g.libelle} » a noté ${g.copies} copie(s) sans qu'aucun professeur n'ait corrigé une copie étalon : l'échelle n'a jamais été confrontée à un humain.`,
      );
    }
    if (g.etalons > 0 && g.etalons_synthetiques === g.etalons) {
      alertes.push(
        `« ${g.libelle} » : ses ${g.etalons} copies étalons sont toutes des profils inventés pour caler l'échelle — aucune vraie copie notée par un professeur.`,
      );
    }
    if (g.biais_moyen !== null && Math.abs(g.biais_moyen) >= 1) {
      alertes.push(
        `« ${g.libelle} » : écart systématique de ${g.biais_moyen > 0 ? '+' : ''}${g.biais_moyen} point(s) entre l'IA et les professeurs.`,
      );
    }
    if (g.relectures_ouvertes > 0) {
      alertes.push(`« ${g.libelle} » : ${g.relectures_ouvertes} relecture(s) humaine(s) en attente.`);
    }
  }
  if (complets.examens > 0 && complets.groupes === 0) {
    alertes.push(
      `${complets.examens} bac(s) blanc(s) complet(s) sont préparés, mais aucune copie n'a encore été déposée en deux exercices : la note finale sur 20 n'a jamais été produite pour de vrai.`,
    );
  }

  const redigees = {
    grilles: toutesRedigees.length,
    en_calibration: toutesRedigees.filter((g) => !VERROUILLEES.includes(g.statut)).length,
    verrouillees: toutesRedigees.filter((g) => VERROUILLEES.includes(g.statut)).length,
    copies: toutesRedigees.reduce((n, g) => n + g.copies, 0),
    etalons: toutesRedigees.reduce((n, g) => n + g.etalons, 0),
    etalons_humains: toutesRedigees.reduce((n, g) => n + g.corrections_humaines, 0),
    relectures_ouvertes: toutesRedigees.reduce((n, g) => n + g.relectures_ouvertes, 0),
    examens_complets: complets.examens,
    groupes_complets: complets.groupes,
  };

  return {
    genere_le: new Date().toISOString(),
    matieres,
    corrections,
    couts: {
      corrections_7j: c7,
      corrections_30j: c30,
      corrections_total: cTot,
      usd_par_copie: USD_PAR_COPIE,
    },
    retours,
    alertes,
    etalons_orphelins: orphelins,
    sessions_disponibles: Boolean(sessions),
    baremes,
    redigees,
  };
}
