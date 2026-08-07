/**
 * Dossier de relecture professeur — HGGSP session 2026.
 *
 * ⚠️ SERVEUR UNIQUEMENT (lit la clé service_role via pipelineDb()).
 *
 * Les autres matières continuent d'être servies par `chargerDonneesRelecture`
 * (src/lib/relecture.ts), qui lit la grille générique. HGGSP a son propre
 * chargeur parce qu'elle a son propre moteur : deux grilles distinctes, deux
 * échelles (analytique sur 20, officielle sur 10), une taxonomie séparée par
 * exercice avec des règles d'impact, et un module de calibration.
 *
 * Tout ce qui est affiché vient de la BASE, jamais du code : la page montre
 * exactement le barème qui sera appliqué aux copies.
 */
import { pipelineDb } from '@/lib/pipeline';
import type { NiveauCritere, PorteeErreur, TypeImpact } from '@/lib/hggspNoyau';

export type PalierV2 = { points: number; niveau: NiveauCritere; description: string };

export type CritereV2 = {
  code: string;
  libelle: string;
  evaluer: string[];
  max_points: number;
  ordre: number;
  paliers: PalierV2[];
};

export type GrilleV2 = {
  id: string;
  exercise_type: string;
  version: string;
  libelle: string;
  principe: string;
  statut: string;
  max_analytique: number;
  max_officiel: number;
  garde_fous: string[];
  system_prompt: string;
  valide_par: string | null;
  valide_le: string | null;
  verrouille_le: string | null;
  criteres: CritereV2[];
};

export type TaxonomieV2 = {
  code: string;
  libelle: string;
  portee: PorteeErreur;
  description: string;
  critere_principal: Record<string, string>;
  criteres_secondaires: Record<string, string[]>;
  gravite: string;
  type_impact: TypeImpact;
  impact_min: number | null;
  impact_max: number | null;
  plafond_score: number | null;
  plafond_niveau: string | null;
  conditions: string;
  regle_non_double_sanction: string;
  message_pedagogique: string;
  relecture_humaine: boolean;
};

export type EtalonV2 = {
  id: string;
  subject_id: string;
  exercise_type: string;
  niveau: string;
  frontiere: boolean;
  note_analytique: number;
  note_officielle: number;
  criterion_scores: Record<string, number>;
  description: string;
  origine: string;
  statut_validation: string;
  /** Nombre de corrections humaines enregistrées sur cette copie étalon. */
  corrections_humaines: number;
};

export type Calibration = {
  etalons: number;
  etalons_valides: number;
  corrections_humaines: number;
  corrections_ia: number;
  /** Écart moyen IA − humain, quand la comparaison a réellement eu lieu. */
  ecart_moyen: number | null;
  derniere_execution: string | null;
  /** Niveaux attendus qui n'ont aucun étalon. */
  niveaux_manquants: string[];
};

export type CritereCorrigeV2 = {
  criterion_id: string;
  libelle: string;
  score: number;
  max_score: number;
  level: string;
  level_label: string;
  observed_strengths: string[];
  observed_weaknesses: string[];
  evidence: { page?: number; citation: string; explication?: string }[];
  feedback: string;
  score_avant_plafond?: number;
  plafonne_par?: string[];
};

export type ErreurCorrigeeV2 = {
  taxonomy_code: string;
  libelle: string;
  criterion_id: string | null;
  impact_type: TypeImpact;
  impact_description: string;
  criterion_cap: number | null;
  criterion_level_cap: string | null;
  indicative_range: { min: number; max: number } | null;
  evidence: { citation: string; explication?: string }[];
  is_consequence: boolean;
  source_error_id: string | null;
  scoring_effect: string;
};

export type ExempleV2 = {
  correctionId: string;
  exerciseType: string;
  examFormat: string;
  analytique: number;
  analytiqueMax: number;
  officiel: number;
  officielMax: number;
  criteres: CritereCorrigeV2[];
  erreurs: ErreurCorrigeeV2[];
  forces: string[];
  priorites: string[];
  appreciation: string;
  controles: Record<string, unknown> | null;
  motifsRelecture: { code: string; message: string }[];
  pages: string[];
  /** Correction antérieure du même devoir, avec l'ancienne grille. */
  ancienne?: { correctionId: string; note: number; bareme: number; date: string } | null;
};

export type DonneesHggsp = {
  grilles: GrilleV2[];
  taxonomie: TaxonomieV2[];
  etalons: EtalonV2[];
  calibration: Calibration;
  exemples: ExempleV2[];
};

const NIVEAUX_ATTENDUS = ['tres_faible', 'fragile', 'moyen', 'assez_bon', 'tres_bon', 'excellent'];

/** Le dossier HGGSP existe-t-il ? (sinon la page retombe sur l'affichage générique) */
export async function grillesHggspInstallees(): Promise<boolean> {
  const db = pipelineDb();
  const { data } = await db.from('grilles_redigees').select('id').eq('matiere', 'hggsp').limit(1);
  return Boolean(data?.length);
}

export async function chargerRelectureHggsp(): Promise<DonneesHggsp | null> {
  const db = pipelineDb();

  /* ------------------------------------------------------- Les grilles */
  const { data: grillesBrutes, error } = await db
    .from('grilles_redigees')
    .select('*')
    .eq('matiere', 'hggsp')
    .not('statut', 'eq', 'archived')
    .order('exercise_type');
  if (error) throw new Error(`Lecture des grilles HGGSP : ${error.message}`);
  if (!grillesBrutes?.length) return null;

  const ids = grillesBrutes.map((g) => g.id as string);
  const { data: criteres } = await db
    .from('grille_criteres')
    .select('*')
    .in('grille_id', ids)
    .order('ordre');
  const idsCriteres = (criteres ?? []).map((c) => c.id as string);
  const { data: descripteurs } = idsCriteres.length
    ? await db
        .from('grille_descripteurs')
        .select('*')
        .in('critere_id', idsCriteres)
        .order('points')
    : { data: [] };

  const grilles: GrilleV2[] = grillesBrutes.map((g) => ({
    id: g.id,
    exercise_type: g.exercise_type,
    version: g.version,
    libelle: g.libelle,
    principe: g.principe,
    statut: g.statut,
    max_analytique: Number(g.max_analytique),
    max_officiel: Number(g.max_officiel),
    garde_fous: Array.isArray(g.garde_fous) ? g.garde_fous : [],
    system_prompt: g.system_prompt ?? '',
    valide_par: g.valide_par ?? null,
    valide_le: g.valide_le ?? null,
    verrouille_le: g.verrouille_le ?? null,
    criteres: (criteres ?? [])
      .filter((c) => c.grille_id === g.id)
      .map((c) => ({
        code: c.code,
        libelle: c.libelle,
        evaluer: Array.isArray(c.evaluer) ? c.evaluer : [],
        max_points: Number(c.max_points),
        ordre: Number(c.ordre),
        paliers: (descripteurs ?? [])
          .filter((d) => d.critere_id === c.id)
          .map((d) => ({
            points: Number(d.points),
            niveau: d.niveau as NiveauCritere,
            description: d.description,
          })),
      })),
  }));

  /* ---------------------------------------------------- La taxonomie */
  const { data: taxonomieBrute } = await db
    .from('taxonomie_redigee')
    .select('*')
    .eq('matiere', 'hggsp')
    .eq('version', '2.0')
    .order('code');

  const taxonomie: TaxonomieV2[] = (taxonomieBrute ?? []).map((t) => ({
    code: t.code,
    libelle: t.libelle,
    portee: t.portee,
    description: t.description,
    critere_principal: (t.critere_principal ?? {}) as Record<string, string>,
    criteres_secondaires: (t.criteres_secondaires ?? {}) as Record<string, string[]>,
    gravite: t.gravite,
    type_impact: t.type_impact,
    impact_min: t.impact_min === null ? null : Number(t.impact_min),
    impact_max: t.impact_max === null ? null : Number(t.impact_max),
    plafond_score: t.plafond_score === null ? null : Number(t.plafond_score),
    plafond_niveau: t.plafond_niveau ?? null,
    conditions: t.conditions ?? '',
    regle_non_double_sanction: t.regle_non_double_sanction ?? '',
    message_pedagogique: t.message_pedagogique ?? '',
    relecture_humaine: t.relecture_humaine === true,
  }));

  /* ------------------------------------------------- Les copies étalons */
  const { data: etalonsBruts } = await db
    .from('benchmark_cards')
    .select('id, subject_id, exercise_type, score, card_json, validation_status')
    .eq('card_json->>rubric_version', '2.0')
    .order('exercise_type')
    .order('score');

  const { data: copiesEtalons } = await db
    .from('etalon_copies')
    .select('id, benchmark_card_id, statut, niveau_cible, frontiere')
    .eq('matiere', 'hggsp');

  const idsCopies = (copiesEtalons ?? []).map((c) => c.id as string);
  const { data: humaines } = idsCopies.length
    ? await db
        .from('etalon_corrections_humaines')
        .select('id, etalon_copie_id, prof_nom, note_totale')
        .in('etalon_copie_id', idsCopies)
    : { data: [] };
  const { data: ia } = idsCopies.length
    ? await db.from('etalon_corrections_ia').select('id, etalon_copie_id, note_brute').in('etalon_copie_id', idsCopies)
    : { data: [] };

  const humainesParCopie = new Map<string, number>();
  for (const h of humaines ?? []) {
    humainesParCopie.set(h.etalon_copie_id, (humainesParCopie.get(h.etalon_copie_id) ?? 0) + 1);
  }
  const copieParBenchmark = new Map(
    (copiesEtalons ?? []).map((c) => [c.benchmark_card_id as string, c]),
  );

  const etalons: EtalonV2[] = (etalonsBruts ?? []).map((e) => {
    const carte = (e.card_json ?? {}) as Record<string, unknown>;
    const copie = copieParBenchmark.get(e.id as string);
    return {
      id: e.id,
      subject_id: e.subject_id,
      exercise_type: e.exercise_type,
      niveau: String(carte.niveau ?? copie?.niveau_cible ?? ''),
      frontiere: carte.frontiere === true || copie?.frontiere === true,
      note_analytique: Number(e.score),
      note_officielle: Number(carte.note_officielle ?? Number(e.score) / 2),
      criterion_scores: (carte.criterion_scores ?? {}) as Record<string, number>,
      description: String(carte.description ?? ''),
      origine: String(carte.origin ?? ''),
      statut_validation: String(e.validation_status ?? ''),
      corrections_humaines: copie ? humainesParCopie.get(copie.id as string) ?? 0 : 0,
    };
  });

  /* -------------------------------------------------- La calibration */
  const { data: runs } = await db
    .from('calibration_runs')
    .select('id, lance_le, stats')
    .in('grille_id', ids)
    .order('lance_le', { ascending: false })
    .limit(1);

  const niveauxPresents = new Set(etalons.map((e) => e.niveau));
  const calibration: Calibration = {
    etalons: etalons.length,
    etalons_valides: etalons.filter((e) => e.statut_validation === 'validated').length,
    corrections_humaines: (humaines ?? []).length,
    corrections_ia: (ia ?? []).length,
    ecart_moyen:
      typeof (runs?.[0]?.stats as Record<string, unknown>)?.ecart_absolu_moyen === 'number'
        ? ((runs![0].stats as Record<string, unknown>).ecart_absolu_moyen as number)
        : null,
    derniere_execution: runs?.[0]?.lance_le ?? null,
    niveaux_manquants: NIVEAUX_ATTENDUS.filter((n) => !niveauxPresents.has(n)),
  };

  /* ------------------------------------- Les copies réellement corrigées */
  const { data: corrections } = await db
    .from('corrections')
    .select('id, exercise_type, status, result_json, exam_format, created_at, subject_id')
    .eq('matiere', 'hggsp')
    .eq('moteur', 'criteres_rediges')
    .in('status', ['corrected', 'corrected_review', 'dossier_ready'])
    .not('result_json', 'is', null)
    .order('created_at', { ascending: false });

  const exemples: ExempleV2[] = [];
  const dejaVus = new Set<string>();
  for (const c of corrections ?? []) {
    if (dejaVus.has(c.exercise_type)) continue;
    dejaVus.add(c.exercise_type);
    const r = (c.result_json ?? {}) as Record<string, unknown>;

    // La correction du MEME devoir avec l'ancienne grille, si elle existe :
    // c'est la comparaison la plus parlante pour un professeur.
    const { data: anciennes } = await db
      .from('corrections')
      .select('id, result_json, created_at')
      .eq('subject_id', c.subject_id)
      .eq('moteur', 'grille_generique')
      .in('status', ['corrected', 'corrected_review', 'dossier_ready'])
      .order('created_at', { ascending: false })
      .limit(1);
    const ancienne = anciennes?.[0];

    const { data: transcriptions } = await db
      .from('copy_transcriptions')
      .select('transcription_json')
      .eq('correction_id', c.id)
      .limit(1);
    const pages =
      (transcriptions?.[0]?.transcription_json as { pages?: { text?: string }[] } | undefined)?.pages ??
      [];

    exemples.push({
      correctionId: c.id,
      exerciseType: c.exercise_type,
      examFormat: String(c.exam_format ?? r.exam_format ?? ''),
      analytique: Number(r.analytical_score ?? 0),
      analytiqueMax: Number(r.analytical_max ?? 20),
      officiel: Number(r.official_score ?? 0),
      officielMax: Number(r.official_max ?? 10),
      criteres: ((r.criteria ?? []) as Record<string, unknown>[]).map((x) => ({
        criterion_id: String(x.criterion_id ?? x.code ?? ''),
        libelle: String(x.libelle ?? x.name ?? ''),
        score: Number(x.score ?? 0),
        max_score: Number(x.max_score ?? x.maximum ?? 0),
        level: String(x.level ?? ''),
        level_label: String(x.level_label ?? ''),
        observed_strengths: (x.observed_strengths ?? []) as string[],
        observed_weaknesses: (x.observed_weaknesses ?? []) as string[],
        evidence: ((x.evidence ?? []) as Record<string, unknown>[]).map((p) => ({
          page: typeof p.page === 'number' ? p.page : undefined,
          citation: String(p.citation ?? p.quote ?? ''),
          explication: String(p.explication ?? p.explanation ?? ''),
        })),
        feedback: String(x.feedback ?? x.justification ?? ''),
        score_avant_plafond:
          typeof x.score_avant_plafond === 'number' ? x.score_avant_plafond : undefined,
        plafonne_par: (x.plafonne_par ?? []) as string[],
      })),
      erreurs: ((r.error_events ?? []) as Record<string, unknown>[]).map((e) => ({
        taxonomy_code: String(e.taxonomy_code ?? ''),
        libelle: String(e.libelle ?? ''),
        criterion_id: (e.criterion_id ?? null) as string | null,
        impact_type: e.impact_type as TypeImpact,
        impact_description: String(e.impact_description ?? ''),
        criterion_cap: e.criterion_cap === null ? null : Number(e.criterion_cap),
        criterion_level_cap: (e.criterion_level_cap ?? null) as string | null,
        indicative_range: (e.indicative_range ?? null) as { min: number; max: number } | null,
        evidence: ((e.evidence ?? []) as Record<string, unknown>[]).map((p) => ({
          citation: String(p.citation ?? ''),
          explication: String(p.explication ?? ''),
        })),
        is_consequence: e.is_consequence === true,
        source_error_id: (e.source_error_id ?? null) as string | null,
        scoring_effect: String(e.scoring_effect ?? ''),
      })),
      forces: (r.strengths ?? []) as string[],
      priorites: (r.priorities ?? []) as string[],
      appreciation: String(r.general_feedback ?? ''),
      controles: (r.consistency_checks ?? null) as Record<string, unknown> | null,
      motifsRelecture: ((r.human_review_details ?? []) as Record<string, unknown>[]).map((m) => ({
        code: String(m.code ?? ''),
        message: String(m.message ?? ''),
      })),
      pages: pages.map((p) => p.text ?? '').filter(Boolean),
      ancienne: ancienne
        ? {
            correctionId: ancienne.id,
            note: Number((ancienne.result_json as Record<string, unknown>)?.note_finale ?? 0),
            bareme: 20,
            date: ancienne.created_at,
          }
        : null,
    });
  }

  return { grilles, taxonomie, etalons, calibration, exemples };
}
