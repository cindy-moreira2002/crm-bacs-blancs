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
import { LABELS_MATIERES, labelExercice, chargerExamens } from './pipelineEtat';
import type { CorrectionLigne, RetourProf, ExamenEtat } from './pipelineEtat';
import { echelleExpliquee, trierDiagnostics, verifierBaremes, verifierStructureMatiere } from './pipelineVerifs';
import type { Diagnostic } from './pipelineVerifs';

// --- Formes -----------------------------------------------------------

export type { Diagnostic, NiveauDiag } from './pipelineVerifs';

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
  /** L'épreuve existe aussi dans une autre matière : attribution incertaine. */
  ambigu: boolean;
};

export type DetailMatiere = {
  matiere: string;
  label: string;
  genere_le: string;
  /** Couche 1 : les bacs blancs de la matière et leur barème propre. */
  baremes: ExamenEtat[];
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
  // d'épreuve n'existe QUE dans cette matière (« dissertation » existe en
  // français ET en SES : ces orphelins-là restent au niveau global, la page
  // santé les signale — on ne devine pas leur matière).
  const idsSujets = sujetsBruts.map((s) => s.id);
  const typesMatiere = [...new Set([...rubriques, ...sujetsBruts].map((r) => r.exercise_type))];
  const { data: typesGlobaux, error: erreurTypes } = await db
    .from('rubrics')
    .select('exercise_type, matiere');
  if (erreurTypes) throw new Error(erreurTypes.message);
  const matieresDuType = new Map<string, Set<string>>();
  for (const t of (typesGlobaux ?? []) as { exercise_type: string; matiere: string | null }[]) {
    if (!t.matiere) continue;
    const s = matieresDuType.get(t.exercise_type) ?? new Set<string>();
    s.add(t.matiere);
    matieresDuType.set(t.exercise_type, s);
  }
  const estTypePartage = (t: string) => (matieresDuType.get(t) ?? new Set([matiere])).size > 1;
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
      const echelle_ok = echelleExpliquee(bareme, prompt);
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
        libelle: libelleSujet(s.card_json, s.id, s.track),
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
      ambigu: estTypePartage(b.exercise_type),
    };
  });

  // --- Diagnostics (règles partagées : lib/pipelineVerifs.ts) ---------
  const diagnostics: Diagnostic[] = verifierStructureMatiere({
    matiere,
    grilles: grilles.map((g) => ({
      id: g.id,
      track: g.track,
      exercise_type: g.exercise_type,
      status: g.status,
      bareme_total: g.bareme_total,
      nb_criteres: g.criteres.length,
      nb_taxonomie: g.taxonomie.length,
      system_prompt_chars: g.system_prompt_chars,
      echelle_ok: g.echelle_ok,
    })),
    sujets: sujets.map((s) => ({
      id: s.id,
      track: s.track,
      exercise_type: s.exercise_type,
      status: s.status,
      nb_etalons: s.etalons.length,
      source_status: s.source_status,
    })),
    gabarits: gabarits.map((g) => ({
      track: g.track,
      exercise_type: g.exercise_type,
      audience: g.audience,
      status: g.status,
    })),
    etalons: sujets.flatMap((s) => s.etalons.map((e) => ({ origine: e.origine, validation_status: e.validation_status }))),
    // Seuls les orphelins d'épreuve exclusive comptent dans le diagnostic —
    // les ambigus (épreuve partagée) sont signalés par la page santé, pour ne
    // pas être comptés dans deux matières.
    orphelins: orphelins.filter((o) => !o.ambigu).length,
    orphelins_reels: orphelins.filter((o) => !o.ambigu && o.origine === 'reel').length,
    corrections_total: corrections.length,
    corrections_echecs: corrections.filter((cor) => cor.status.includes('failed')).length,
  });
  // Couche 1 : les barèmes propres aux sujets. Ils passent AVANT la grille
  // dans le tri, parce que c'est la note officielle qui s'y joue.
  const baremes = (await chargerExamens()).get(matiere) ?? [];
  diagnostics.unshift(...verifierBaremes(label, baremes));

  if (diagnostics.length === 0) {
    diagnostics.push({ niveau: 'ok', texte: 'Rien à signaler : barèmes, grilles, sujets, gabarits et étalons sont cohérents.' });
  }
  const diagnosticsTries = trierDiagnostics(diagnostics);

  return {
    matiere,
    label,
    genere_le: new Date().toISOString(),
    baremes,
    grilles,
    sujets,
    gabarits,
    orphelins,
    corrections,
    retours,
    diagnostics: diagnosticsTries,
    liens: {
      relecture: `/relecture/${matiere}?t=${jetonRelecture(matiere)}`,
      depot: '/espace-prof/deposer',
      supabase_tables: 'https://supabase.com/dashboard/project/xgdaibekjmtffvkwvcge/editor',
    },
  };
}
