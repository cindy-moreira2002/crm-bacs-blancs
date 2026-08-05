/**
 * Vue « tout voir » d'une matière : l'intégralité de ce que Supabase contient
 * pour elle, avec des diagnostics calculés côté serveur.
 *
 * ⚠️ SERVEUR UNIQUEMENT — clé service_role du pipeline.
 *
 * Complète pipelineEtat.ts (le résumé) : ici on descend jusqu'aux critères de
 * chaque barème, aux pièges de chaque sujet, à chaque copie étalon avec sa
 * note. C'est la page que l'administratrice ouvre pour vérifier qu'une
 * matière est vraiment prête — sans mettre les pieds dans Supabase.
 */
import { pipelineDb, libelleSujet } from './pipeline';
import { jetonRelecture } from './relecture';
import { LABELS_MATIERES, labelExercice } from './pipelineEtat';
import type { CorrectionLigne, RetourProf } from './pipelineEtat';

// --- Formes -----------------------------------------------------------

export type NiveauDiag = 'bloquant' | 'attention' | 'ok';

export type Diagnostic = {
  niveau: NiveauDiag;
  texte: string;
  /** Où corriger, si ce n'est pas dans la page elle-même. */
  piste?: string;
};

export type CritereDetail = {
  code: string;
  name: string;
  maximum_score: number | null;
  /** Barème par paliers (« 0 » → description, « 5 » → description…). */
  levels: Record<string, string> | null;
};

export type GrilleDetail = {
  id: string;
  track: string;
  exercise_type: string;
  label: string;
  status: string;
  version: number | string | null;
  bareme_total: number | null;
  criteres: CritereDetail[];
  guardrails: string[];
  principle: string | null;
  taxonomie: { code: string; description: string | null }[];
  system_prompt_chars: number;
  /** Barème ≠ 20 : l'échelle doit être expliquée dans le system_prompt. */
  echelle_ok: boolean;
  source_status: string | null;
  official_basis: string | null;
};

export type EtalonDetail = {
  id: string;
  note_sur_20: string | null;
  role: string | null;
  profil: string | null;
  origine: 'synthetique' | 'reel';
  validation_status: string | null;
  forces: string | null;
  limites: string | null;
  warning: string | null;
};

export type SujetDetail = {
  id: string;
  track: string;
  exercise_type: string;
  label_exercice: string;
  libelle: string;
  status: string;
  warning: string | null;
  source_status: string | null;
  pieges: string[];
  attendus: string[];
  etalons: EtalonDetail[];
};

export type GabaritDetail = {
  id: string;
  track: string;
  exercise_type: string;
  label: string;
  audience: string;
  status: string;
  version: number | string | null;
  output_format: string | null;
  system_prompt_chars: number;
};

export type OrphelinDetail = {
  id: string;
  track: string;
  exercise_type: string;
  note_sur_20: string | null;
  validation_status: string | null;
  origine: 'synthetique' | 'reel';
  support: string | null;
};

export type DetailMatiere = {
  matiere: string;
  label: string;
  genere_le: string;
  grilles: GrilleDetail[];
  sujets: SujetDetail[];
  gabarits: GabaritDetail[];
  /** Étalons sans sujet, rattachés à la matière par leur type d'épreuve. */
  orphelins: OrphelinDetail[];
  corrections: CorrectionLigne[];
  retours: RetourProf[];
  diagnostics: Diagnostic[];
  liens: {
    relecture: string;
    depot: string;
    supabase_tables: string;
  };
};

// --- Collecte ---------------------------------------------------------

type RubricRow = {
  id: string;
  track: string;
  exercise_type: string;
  status: string;
  version: number | string | null;
  system_prompt: string | null;
  rubric_json: {
    criteria?: { code: string; name: string; maximum_score?: number; levels?: Record<string, string> }[];
    principle?: string;
    guardrails?: string[];
    maximum_score?: number;
    source_status?: string;
    official_basis?: string;
    common_error_taxonomy?: { code: string; description?: string }[];
  } | null;
};

type SubjectRow = {
  id: string;
  track: string;
  exercise_type: string;
  status: string;
  card_json: Record<string, unknown> | null;
};

type TemplateRow = {
  id: string;
  track: string;
  exercise_type: string;
  audience: string;
  status: string;
  version: number | string | null;
  output_format: string | null;
  system_prompt: string | null;
};

type BenchRow = {
  id: string;
  subject_id: string | null;
  track: string;
  exercise_type: string;
  validation_status: string | null;
  card_json: Record<string, unknown> | null;
};

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function versEtalon(b: BenchRow): EtalonDetail {
  const c = b.card_json ?? {};
  return {
    id: b.id,
    note_sur_20: texte(String(c.normalised_score_on_20 ?? '')) ?? null,
    role: texte(c.benchmark_role),
    profil: texte(c.profil),
    origine: String(c.origin ?? '').includes('synthetic') ? 'synthetique' : 'reel',
    validation_status: b.validation_status,
    forces: texte(c.forces),
    limites: texte(c.limites),
    warning: texte(c.origin_warning) ?? texte(c.warning),
  };
}

export async function chargerDetailMatiere(matiere: string): Promise<DetailMatiere | null> {
  const db = pipelineDb();
  const label = LABELS_MATIERES[matiere];
  if (!label) return null;

  const [rubRes, sujRes, tplRes, corrRes, retoursRes] = await Promise.all([
    db
      .from('rubrics')
      .select('id, track, exercise_type, status, version, system_prompt, rubric_json')
      .eq('matiere', matiere),
    db.from('subject_cards').select('id, track, exercise_type, status, card_json').eq('matiere', matiere),
    db
      .from('dossier_templates')
      .select('id, track, exercise_type, audience, status, version, output_format, system_prompt')
      .eq('matiere', matiere),
    db
      .from('corrections')
      .select(
        'id, created_at, matiere, exercise_type, subject_id, status, student_name, teacher_email, processing_error, source, note:result_json->>note_finale, review:result_json->>human_review_required',
      )
      .eq('matiere', matiere)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('relecture_feedback')
      .select('*')
      .eq('matiere', matiere)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  for (const r of [rubRes, sujRes, tplRes, corrRes]) {
    if (r.error) throw new Error(r.error.message ?? 'Lecture pipeline impossible');
  }

  const rubriques = (rubRes.data ?? []) as RubricRow[];
  const sujetsBruts = (sujRes.data ?? []) as SubjectRow[];
  const gabaritsBruts = (tplRes.data ?? []) as TemplateRow[];
  const corrections = (corrRes.data ?? []) as CorrectionLigne[];
  const retours = (retoursRes.error ? [] : (retoursRes.data ?? [])) as RetourProf[];

  // Étalons : ceux des sujets de la matière + les orphelins dont le type
  // d'épreuve appartient à la matière (ex. les vraies copies de français).
  const idsSujets = sujetsBruts.map((s) => s.id);
  const typesMatiere = [...new Set([...rubriques, ...sujetsBruts].map((r) => r.exercise_type))];
  const [benchSujetsRes, benchOrphelinsRes] = await Promise.all([
    idsSujets.length
      ? db
          .from('benchmark_cards')
          .select('id, subject_id, track, exercise_type, validation_status, card_json')
          .in('subject_id', idsSujets)
      : Promise.resolve({ data: [], error: null }),
    typesMatiere.length
      ? db
          .from('benchmark_cards')
          .select('id, subject_id, track, exercise_type, validation_status, card_json')
          .is('subject_id', null)
          .in('exercise_type', typesMatiere)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (benchSujetsRes.error) throw new Error(benchSujetsRes.error.message);
  if (benchOrphelinsRes.error) throw new Error(benchOrphelinsRes.error.message);
  const benchs = (benchSujetsRes.data ?? []) as BenchRow[];
  const orphelinsBruts = (benchOrphelinsRes.data ?? []) as BenchRow[];

  // --- Grilles --------------------------------------------------------
  const grilles: GrilleDetail[] = rubriques
    .map((r) => {
      const rj = r.rubric_json ?? {};
      const criteres: CritereDetail[] = (rj.criteria ?? []).map((c) => ({
        code: c.code,
        name: c.name,
        maximum_score: c.maximum_score ?? null,
        levels: c.levels ?? null,
      }));
      const sommeCriteres = criteres.reduce((n, c) => n + (c.maximum_score ?? 0), 0);
      const bareme = rj.maximum_score ?? (sommeCriteres > 0 ? sommeCriteres : null);
      const prompt = r.system_prompt ?? '';
      // Barème ≠ 20 : le system_prompt doit dire comment on ramène sur 20.
      const echelle_ok =
        bareme == null || bareme === 20
          ? true
          : new RegExp(`(sur|/|\\bde\\b)\\s*${bareme}\\b|normalis|ramen`, 'i').test(prompt);
      return {
        id: r.id,
        track: r.track,
        exercise_type: r.exercise_type,
        label: labelExercice(r.exercise_type) + (r.track === 'technologique' ? ' · techno' : ''),
        status: r.status,
        version: r.version,
        bareme_total: bareme,
        criteres,
        guardrails: liste(rj.guardrails),
        principle: texte(rj.principle),
        taxonomie: (rj.common_error_taxonomy ?? []).map((t) => ({
          code: t.code,
          description: t.description ?? null,
        })),
        system_prompt_chars: prompt.length,
        echelle_ok,
        source_status: texte(rj.source_status),
        official_basis: texte(rj.official_basis),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  // --- Sujets + étalons ----------------------------------------------
  const benchsParSujet = new Map<string, BenchRow[]>();
  for (const b of benchs) {
    if (!b.subject_id) continue;
    const l = benchsParSujet.get(b.subject_id) ?? [];
    l.push(b);
    benchsParSujet.set(b.subject_id, l);
  }

  const sujets: SujetDetail[] = sujetsBruts
    .map((s) => {
      const c = s.card_json ?? {};
      const etalons = (benchsParSujet.get(s.id) ?? [])
        .map(versEtalon)
        .sort((a, b) => Number(a.note_sur_20 ?? -1) - Number(b.note_sur_20 ?? -1));
      return {
        id: s.id,
        track: s.track,
        exercise_type: s.exercise_type,
        label_exercice: labelExercice(s.exercise_type) + (s.track === 'technologique' ? ' · techno' : ''),
        libelle: libelleSujet(s.card_json, s.id),
        status: s.status,
        warning: texte(c.warning),
        source_status: texte(c.source_status),
        pieges: liste(c.traps),
        attendus: liste(c.expected_concepts ?? c.special_criteria),
        etalons,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'fr'));

  // --- Gabarits -------------------------------------------------------
  const gabarits: GabaritDetail[] = gabaritsBruts
    .map((t) => ({
      id: t.id,
      track: t.track,
      exercise_type: t.exercise_type,
      label: labelExercice(t.exercise_type) + (t.track === 'technologique' ? ' · techno' : ''),
      audience: t.audience,
      status: t.status,
      version: t.version,
      output_format: t.output_format,
      system_prompt_chars: (t.system_prompt ?? '').length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  // --- Orphelins ------------------------------------------------------
  const orphelins: OrphelinDetail[] = orphelinsBruts.map((b) => {
    const c = b.card_json ?? {};
    return {
      id: b.id,
      track: b.track,
      exercise_type: b.exercise_type,
      note_sur_20: texte(String(c.normalised_score_on_20 ?? '')) ?? null,
      validation_status: b.validation_status,
      origine: String(c.origin ?? '').includes('synthetic') ? 'synthetique' : 'reel',
      support: texte(c.support),
    };
  });

  // --- Diagnostics ----------------------------------------------------
  const diagnostics: Diagnostic[] = [];
  const diag = (niveau: NiveauDiag, txt: string, piste?: string) =>
    diagnostics.push({ niveau, texte: txt, piste });

  const grilleActivePour = (s: SujetDetail) =>
    grilles.find((g) => g.track === s.track && g.exercise_type === s.exercise_type && g.status === 'active');
  const gabaritElevePour = (s: { track: string; exercise_type: string }) =>
    gabarits.find((g) => g.audience === 'eleve' && g.track === s.track && g.exercise_type === s.exercise_type);

  for (const s of sujets) {
    if (s.status === 'active' && !grilleActivePour(s)) {
      diag('bloquant', `Sujet « ${s.id} » visible au dépôt SANS barème actif : la correction échouera.`, 'Activer la grille de cette épreuve ou repasser le sujet en brouillon.');
    }
    const gab = gabaritElevePour(s);
    if (s.status === 'active' && (!gab || gab.status !== 'active')) {
      diag('bloquant', `Sujet « ${s.id} » visible au dépôt mais dossier élève ${gab ? 'en brouillon' : 'absent'} : generate-dossier refusera.`, 'Activer le gabarit élève de cette épreuve.');
    }
    if (s.etalons.length === 0) {
      diag('attention', `Sujet « ${s.id} » sans aucune copie étalon : la note sortira sans référence.`);
    }
  }
  for (const g of grilles) {
    if (g.system_prompt_chars === 0) {
      diag('bloquant', `Barème « ${g.id} » sans system_prompt : le correcteur n'a aucune consigne.`);
    }
    if (!g.echelle_ok) {
      diag('attention', `Barème « ${g.id} » noté sur ${g.bareme_total} mais le system_prompt n'explique pas la conversion sur 20.`, 'Ajouter l’échelle dans le system_prompt (gotcha connu).');
    }
    if (g.criteres.length === 0) {
      diag('bloquant', `Barème « ${g.id} » sans aucun critère.`);
    }
    if (matiere !== 'francais' && g.taxonomie.length === 0) {
      diag('attention', `Barème « ${g.id} » sans taxonomie d'erreurs : les codes d'erreur du dossier seront pauvres.`);
    }
  }
  for (const ex of typesMatiere) {
    const gab = gabarits.find((g) => g.audience === 'eleve' && g.exercise_type === ex);
    if (!gab) diag('bloquant', `Épreuve « ${labelExercice(ex)} » sans gabarit de dossier élève.`);
  }
  const tousEtalons = sujets.flatMap((s) => s.etalons);
  const reels = tousEtalons.filter((e) => e.origine === 'reel').length;
  const valides = tousEtalons.filter((e) => e.validation_status === 'validated').length;
  if (tousEtalons.length > 0 && reels === 0) {
    diag('attention', `Les ${tousEtalons.length} étalons sont tous synthétiques : l'échelle de notes n'a jamais été calée sur de vraies copies (calibration sévère connue).`, '3 vraies copies notées par un prof suffisent pour recaler.');
  }
  if (tousEtalons.length > 0 && valides === 0) {
    diag('attention', `Aucun étalon validé par un prof (« validated ») sur ${tousEtalons.length}.`);
  }
  if (orphelins.length > 0) {
    const reelsOrph = orphelins.filter((o) => o.origine === 'reel').length;
    diag('attention', `${orphelins.length} étalons orphelins rattachés à cette matière par leur épreuve${reelsOrph ? ` — dont ${reelsOrph} VRAIES copies` : ''} : ils ne servent à rien tant qu'ils ne pointent pas vers un sujet.`, 'Réaffecter leur subject_id.');
  }
  const echecs = corrections.filter((cor) => cor.status.includes('failed'));
  if (echecs.length) {
    diag('attention', `${echecs.length} correction(s) en échec sur les ${corrections.length} dernières de la matière.`);
  }
  const texteAVerifier = sujets.filter((s) => (s.source_status ?? '').includes('synthetic') && s.exercise_type.includes('explication'));
  for (const s of texteAVerifier) {
    diag('attention', `Texte du sujet « ${s.id} » à vérifier mot à mot sur une édition de référence avant activation.`);
  }
  if (diagnostics.length === 0) {
    diag('ok', 'Rien à signaler : grilles, sujets, gabarits et étalons sont cohérents.');
  }
  const poids: Record<NiveauDiag, number> = { bloquant: 0, attention: 1, ok: 2 };
  diagnostics.sort((a, b) => poids[a.niveau] - poids[b.niveau]);

  return {
    matiere,
    label,
    genere_le: new Date().toISOString(),
    grilles,
    sujets,
    gabarits,
    orphelins,
    corrections,
    retours,
    diagnostics,
    liens: {
      relecture: `/relecture/${matiere}?t=${jetonRelecture(matiere)}`,
      depot: '/espace-prof/deposer',
      supabase_tables: 'https://supabase.com/dashboard/project/xgdaibekjmtffvkwvcge/editor',
    },
  };
}
