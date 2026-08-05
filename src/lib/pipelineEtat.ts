/**
 * État complet du pipeline de correction, pour la page de pilotage
 * /admin/correction.
 *
 * ⚠️ SERVEUR UNIQUEMENT — lit la base pipeline avec la clé service_role.
 *
 * Tout part de quatre tables du projet pipeline (xgdaibekjmtffvkwvcge) :
 * rubrics (barèmes), subject_cards (sujets), dossier_templates (gabarits du
 * dossier élève), benchmark_cards (copies étalons qui calent l'échelle de
 * notes). S'y ajoutent les corrections lancées, les retours des profs
 * relecteurs et — quand la base CRM répond — les sessions vendues, pour
 * mettre les dates en face de l'état de préparation.
 */
import { crmAdmin, authManquant } from './authProf';
import { pipelineDb, libelleSujet } from './pipeline';

// --- Libellés ---------------------------------------------------------

export const LABELS_MATIERES: Record<string, string> = {
  francais: 'Français',
  philosophie: 'Philosophie',
  maths: 'Mathématiques',
  'physique-chimie': 'Physique-Chimie',
  'histoire-geo': 'Histoire-Géo',
  ses: 'SES',
  svt: 'SVT',
  hggsp: 'HGGSP',
  hlp: 'HLP',
};

const LABELS_EXERCICES: Record<string, string> = {
  commentaire: 'Commentaire',
  dissertation: 'Dissertation',
  epreuve_composee_partie_1: 'Épreuve composée — EC1',
  epreuve_composee_partie_2: 'Épreuve composée — EC2',
  epreuve_composee_partie_3: 'Épreuve composée — EC3',
  maths_analyse: 'Analyse',
  maths_probabilites: 'Probabilités',
  maths_geometrie_espace: 'Géométrie dans l’espace',
  maths_qcm_justifie: 'QCM justifié',
  philo_dissertation: 'Dissertation',
  philo_explication_texte: 'Explication de texte',
  hg_question_problematisee: 'Question problématisée',
  hg_analyse_document: 'Analyse de document',
  hg_croquis: 'Croquis',
  hg_tech_questions: 'Questions (voie techno)',
  pc_probleme: 'Résolution de problème',
  pc_analyse_documentaire: 'Analyse documentaire',
  pc_protocole: 'Protocole expérimental',
  pc_ece: 'ECE',
  svt_exercice_1: 'Exercice 1',
  svt_exercice_2: 'Exercice 2',
  hggsp_dissertation: 'Dissertation',
  hggsp_etude_critique: 'Étude critique de documents',
  hlp_interpretation: 'Question d’interprétation',
  hlp_essai: 'Essai',
};

export function labelExercice(type: string): string {
  return LABELS_EXERCICES[type] ?? type.replace(/_/g, ' ');
}

/** « Mathématiques », « maths », « Histoire-Géographie »… → slug pipeline. */
function slugMatiere(brut: string): string {
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
  grille: { id: string; version: number | null; status: string } | null;
  gabarit: { id: string; status: string } | null;
  sujets: SujetEtat[];
  etalons: { total: number; synthetiques: number; valides: number };
};

export type SessionVendue = {
  date_epreuve: string;
  statut: string | null;
};

export type MatiereEtat = {
  matiere: string;
  label: string;
  session: SessionVendue | null;
  exercices: ExerciceEtat[];
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
};

// --- Collecte ---------------------------------------------------------

const USD_PAR_COPIE = 0.22;

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

  const [rubRes, sujRes, tplRes, benchRes, corrRes, retoursRes, sessions, c7, c30, cTot] =
    await Promise.all([
      db.from('rubrics').select('id, matiere, track, exercise_type, status, version'),
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
      compterCorrections(7),
      compterCorrections(30),
      compterCorrections(null),
    ]);

  for (const r of [rubRes, sujRes, tplRes, benchRes, corrRes]) {
    if (r.error) throw r.error;
  }
  // Les retours peuvent échouer si la table n'existe pas encore : on dégrade.
  const retours = (retoursRes.error ? [] : (retoursRes.data ?? [])) as RetourProf[];

  type Rub = { id: string; matiere: string | null; track: string; exercise_type: string; status: string; version: number | null };
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
      ex.grille = { id: r.id, version: r.version, status: r.status };
    }
  }
  for (const s of sujets) {
    exercice(s.matiere, s.track, s.exercise_type).sujets.push({
      id: s.id,
      libelle: libelleSujet(s.card_json, s.id),
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
    e.total += 1;
    if ((b.origin ?? '').includes('synthetic')) e.synthetiques += 1;
    if (b.validation_status === 'validated') e.valides += 1;
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
      return {
        matiere,
        label: LABELS_MATIERES[matiere] ?? matiere,
        session: sessions?.get(matiere) ?? null,
        exercices: exs,
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
  };
}
