/**
 * NOYAU DE CORRECTION DES ÉPREUVES RÉDIGÉES D'HGGSP (session 2026).
 *
 * Fichier volontairement PUR : aucun import, aucun accès réseau, aucune
 * dépendance à Deno ni à Node. Il est utilisé par trois mondes à la fois —
 *   • l'Edge Function `correct-copy-redigee` (Deno) : `../_shared/hggsp-noyau.ts` ;
 *   • l'application Next.js, via `src/lib/hggspNoyau.ts` qui le ré-exporte ;
 *   • les tests hors ligne (`npm run test:hggsp`) et le script d'installation
 *     `scripts/apply-hggsp.mjs`, qui écrit en base EXACTEMENT ces grilles.
 * Une seule écriture des règles, donc un seul endroit à corriger.
 *
 * L'ÉPREUVE OFFICIELLE (note de service MENE2521923N, BO n° 33 du 2025)
 * --------------------------------------------------------------------
 * L'épreuve écrite de spécialité HGGSP comporte DEUX exercices :
 *   • une dissertation, notée sur 10 ;
 *   • une étude critique d'un ou deux documents, notée sur 10 ;
 *   • total sur 20.
 *
 * Pour corriger finement une matière rédigée, on garde une échelle
 * ANALYTIQUE interne sur 20 par exercice (des critères à 4, 5 ou 6 points se
 * notent au quart de point sans devenir illisibles), puis on convertit :
 *
 *     note_officielle_exercice = note_analytique_interne / 2
 *     note_finale              = officielle(dissertation) + officielle(étude critique)
 *
 * Deux notes sur 20 ne sont JAMAIS additionnées. Une copie d'entraînement à
 * un seul exercice garde sa note pédagogique sur 20 et affiche, à côté, son
 * équivalent dans une épreuve complète (sur 10).
 *
 * CE QUE CE FICHIER NE FAIT PAS
 * -----------------------------
 * Il ne part pas de 20 pour retrancher des erreurs. La note est la SOMME des
 * réussites observées critère par critère. Les erreurs types servent à
 * expliquer pourquoi un niveau supérieur n'est pas atteint, et n'agissent
 * mécaniquement sur le score que dans deux cas explicites : un plafond de
 * critère (`criterion_score_cap`) et un plafond de niveau
 * (`criterion_level_cap`). Toute autre erreur est informative, ou justifie
 * simplement que des points n'aient pas été attribués.
 */

/* ================================================================== */
/*  1. Types                                                          */
/* ================================================================== */

/** Les deux exercices de l'épreuve. */
export type TypeExercice = 'hggsp_dissertation' | 'hggsp_etude_critique';

/** Ce que le bac blanc fait passer à l'élève. */
export type FormatExamen = 'full_exam' | 'dissertation_only' | 'document_study_only';

export const FORMATS_EXAMEN: Record<FormatExamen, string> = {
  full_exam: 'Bac blanc complet (dissertation + étude critique, note finale sur 20)',
  dissertation_only: 'Entraînement à la dissertation seule (note pédagogique sur 20)',
  document_study_only: "Entraînement à l'étude critique seule (note pédagogique sur 20)",
};

/** Un palier de notation d'un critère : un score, un niveau, un descripteur. */
export type Palier = {
  /** Score exact du palier, en points du critère. */
  points: number;
  /** Code de niveau, stable, utilisé par les plafonds de niveau. */
  niveau: NiveauCritere;
  /** Descripteur : ce qu'on observe dans la copie à ce niveau. */
  description: string;
};

export type NiveauCritere =
  | 'nul'
  | 'insuffisant'
  | 'fragile'
  | 'moyen'
  | 'satisfaisant'
  | 'tres_satisfaisant';

export const LIBELLES_NIVEAU: Record<NiveauCritere, string> = {
  nul: 'aucun élément recevable',
  insuffisant: 'insuffisant',
  fragile: 'fragile',
  moyen: 'moyen',
  satisfaisant: 'satisfaisant',
  tres_satisfaisant: 'très satisfaisant',
};

export type Critere = {
  code: string;
  libelle: string;
  /** Ce que le correcteur doit regarder, point par point. */
  evaluer: string[];
  max_points: number;
  ordre: number;
  paliers: Palier[];
};

export type Grille = {
  id: string;
  matiere: 'hggsp';
  exercise_type: TypeExercice;
  version: string;
  libelle: string;
  principe: string;
  /** Échelle interne de travail. */
  max_analytique: number;
  /** Échelle officielle de l'exercice dans une épreuve complète. */
  max_officiel: number;
  criteres: Critere[];
  garde_fous: string[];
};

/* ---------------------- Taxonomie des erreurs ---------------------- */

/** Ce qu'une erreur type fait RÉELLEMENT à la note. */
export type TypeImpact =
  /** Signalée à l'élève, aucune perte automatique. */
  | 'informational_only'
  /** L'élément existe mais ne produit pas les points attendus. */
  | 'evidence_not_rewarded'
  /** Fourchette indicative : le correcteur en tient compte dans le score du critère. */
  | 'contextual_range'
  /** Le NIVEAU du critère est plafonné (le score suit le palier nommé). */
  | 'criterion_level_cap'
  /** Le SCORE du critère est plafonné à une valeur exacte. */
  | 'criterion_score_cap'
  /** Aucune pénalité automatique : un humain tranche. */
  | 'human_review_required';

export const LIBELLES_IMPACT: Record<TypeImpact, string> = {
  informational_only: 'signalée à l’élève, sans perte de points automatique',
  evidence_not_rewarded: 'l’élément est là mais ne rapporte pas les points attendus',
  contextual_range: 'fourchette indicative, appréciée dans le score du critère',
  criterion_level_cap: 'le niveau du critère ne peut pas dépasser le palier indiqué',
  criterion_score_cap: 'le score du critère est plafonné à la valeur indiquée',
  human_review_required: 'aucune pénalité automatique avant relecture humaine',
};

export type Gravite = 'mineure' | 'moderee' | 'majeure';

/** Portée d'une erreur type : commune, ou propre à un exercice. */
export type PorteeErreur = 'transversale' | 'dissertation' | 'etude_critique';

export type EntreeTaxonomie = {
  code: string;
  libelle: string;
  portee: PorteeErreur;
  /** Ce qu'on OBSERVE dans la copie — pas un jugement. */
  description: string;
  /**
   * Critère principal dans lequel la faiblesse est comptée, PAR exercice.
   * Une erreur transversale ne vise pas le même critère en dissertation et en
   * étude critique : le code est le même, le critère change.
   */
  critere_principal: Partial<Record<TypeExercice, string>>;
  /** Critères éclairés par l'erreur, SANS y être sanctionnée une deuxième fois. */
  criteres_secondaires: Partial<Record<TypeExercice, string[]>>;
  gravite: Gravite;
  type_impact: TypeImpact;
  /** Fourchette indicative en points du critère (contextual_range). */
  impact_min: number | null;
  impact_max: number | null;
  /** Plafond exact du critère (criterion_score_cap). */
  plafond_score: number | null;
  /** Palier plafond (criterion_level_cap). */
  plafond_niveau: NiveauCritere | null;
  /** Quand ce code s'applique — et quand il ne s'applique pas. */
  conditions: string;
  /** Règle explicite de non-double-sanction. */
  regle_non_double_sanction: string;
  /** Phrase donnée à l'élève. */
  message_pedagogique: string;
  /** Le code déclenche à lui seul une relecture humaine. */
  relecture_humaine: boolean;
};

/* ------------------- Ce que le modèle doit rendre ------------------ */

export type Preuve = { page?: number; citation: string; explication?: string };

export type CritereIA = {
  criterion_id: string;
  score?: number;
  observed_strengths?: string[];
  observed_weaknesses?: string[];
  evidence?: Preuve[];
  feedback?: string;
  human_review_required?: boolean;
};

export type EvenementErreurIA = {
  taxonomy_code: string;
  criterion_id?: string;
  impact_description?: string;
  score_effect?: number | null;
  evidence?: Preuve[];
  confidence?: number;
  /** Erreur dont celle-ci est la conséquence (§10). */
  source_error_id?: string | null;
  is_consequence?: boolean;
  already_counted?: boolean;
  human_review_required?: boolean;
};

export type ReponseIA = {
  criteria?: CritereIA[];
  error_events?: EvenementErreurIA[];
  strengths?: string[];
  priorities?: string[];
  general_feedback?: string;
  confidence?: number;
  human_review_required?: boolean;
  human_review_reasons?: string[];
  /** Production graphique repérée dans la copie (dissertation, §5). */
  production_graphique?: {
    presente: boolean;
    pertinente?: boolean;
    interpretable?: boolean;
    commentaire?: string;
  };
  /** Nombre de documents réellement exploités (étude critique, §7). */
  documents_exploites?: number;
  /** Copie étalon dont le modèle juge la copie la plus proche. */
  benchmark_comparison?: { closest_etalon_id?: string; explanation?: string };
};

/* --------------------------- Résultats ----------------------------- */

export type CritereCorrige = {
  criterion_id: string;
  libelle: string;
  score: number;
  max_score: number;
  level: NiveauCritere;
  level_label: string;
  observed_strengths: string[];
  observed_weaknesses: string[];
  evidence: Preuve[];
  feedback: string;
  human_review_required: boolean;
  /** Score proposé avant application des plafonds, quand ils ont joué. */
  score_avant_plafond?: number;
  /** Codes des erreurs qui ont plafonné ce critère. */
  plafonne_par?: string[];
};

export type EvenementErreur = {
  taxonomy_code: string;
  libelle: string;
  criterion_id: string | null;
  impact_type: TypeImpact;
  impact_description: string;
  score_effect: number | null;
  criterion_cap: number | null;
  criterion_level_cap: NiveauCritere | null;
  indicative_range: { min: number; max: number } | null;
  evidence: Preuve[];
  confidence: number | null;
  source_error_id: string | null;
  is_consequence: boolean;
  scored_in_criterion: string | null;
  already_counted: boolean;
  scoring_effect: string;
  human_review_required: boolean;
};

export type CodeMotifRelecture =
  | 'transcription_incertaine'
  | 'passage_illisible'
  | 'contresens_suspecte'
  | 'reference_douteuse'
  | 'plan_original_non_prevu'
  | 'copie_presque_hors_sujet'
  | 'production_graphique_non_interpretable'
  | 'erreur_majeure_multi_criteres'
  | 'contradiction_score_appreciation'
  | 'ecart_aux_etalons'
  | 'confiance_insuffisante'
  | 'citation_introuvable'
  | 'double_sanction_possible'
  | 'code_hors_taxonomie'
  | 'score_hors_pas'
  | 'critere_absent'
  | 'total_incoherent';

export type MotifRelecture = {
  code: CodeMotifRelecture;
  criterion_id?: string;
  message: string;
};

export type ControlesCoherence = {
  score_sum_valid: boolean;
  conversion_valid: boolean;
  step_valid: boolean;
  no_double_penalty: boolean;
  evidence_verified: boolean;
  feedback_consistent: boolean;
  taxonomy_valid: boolean;
  details: string[];
};

export type ResultatExercice = {
  exam_id: string | null;
  exam_format: FormatExamen;
  rubric_id: string;
  rubric_version: string;
  exercise_type: TypeExercice;
  moteur: 'criteres_rediges';
  analytical_score: number;
  analytical_max: number;
  official_score: number;
  official_max: number;
  /** Note montrée à l'élève dans un entraînement à un seul exercice. */
  training_score: number | null;
  level_global: NiveauCritere;
  human_review_required: boolean;
  human_review_reasons: MotifRelecture[];
  criteria: CritereCorrige[];
  error_events: EvenementErreur[];
  strengths: string[];
  priorities: string[];
  general_feedback: string;
  confidence: number | null;
  consistency_checks: ControlesCoherence;
  calibration_metadata: {
    rubric_status: string;
    rubric_locked: boolean;
    etalons_compares: number;
    /**
     * La grille n'est pas encore verrouillée : la note est provisoire et doit
     * être validée par un professeur. C'est ce drapeau qui justifie l'affichage
     * en fourchette côté élève.
     */
    note_provisoire: boolean;
  };
};

/* ================================================================== */
/*  2. Utilitaires                                                    */
/* ================================================================== */

/** Arrondi au centième — les scores ne descendent jamais sous le quart. */
export function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Le pas de notation d'HGGSP : 0,25 point. */
export const PAS_NOTATION = 0.25;

export function estAuPas(n: number): boolean {
  return Math.abs(n / PAS_NOTATION - Math.round(n / PAS_NOTATION)) < 0.0001;
}

/** Ramène au quart de point le plus proche. */
export function arrondiQuart(n: number): number {
  return Math.round(n / PAS_NOTATION) * PAS_NOTATION;
}

function liste(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}

function preuves(v: unknown): Preuve[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      page: typeof p.page === 'number' ? p.page : undefined,
      citation: String(p.citation ?? p.quote ?? ''),
      explication: typeof p.explication === 'string'
        ? p.explication
        : typeof p.explanation === 'string'
          ? p.explanation
          : undefined,
    }))
    .filter((p) => p.citation.trim().length > 0);
}

/**
 * Normalisation d'un texte pour vérifier qu'une citation existe vraiment :
 * minuscules, accents retirés, ponctuation et espaces réduits. La copie est
 * manuscrite puis transcrite : exiger l'égalité stricte ferait échouer des
 * citations parfaitement honnêtes.
 */
export function normaliserTexte(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La citation figure-t-elle dans la transcription ?
 *
 * Après normalisation, on cherche la citation entière ; à défaut, une suite
 * d'au moins six mots consécutifs de la citation. Six mots, c'est assez long
 * pour ne pas se produire par hasard, et assez court pour tolérer une coupure
 * ou une coquille de transcription au milieu d'une longue citation.
 */
export function citationPresente(citation: string, transcription: string): boolean {
  const c = normaliserTexte(citation);
  const t = normaliserTexte(transcription);
  if (!c || !t) return false;
  if (t.includes(c)) return true;
  const mots = c.split(' ');
  if (mots.length < 6) return false;
  for (let i = 0; i + 6 <= mots.length; i += 1) {
    if (t.includes(mots.slice(i, i + 6).join(' '))) return true;
  }
  return false;
}

/* ================================================================== */
/*  3. Les deux grilles                                               */
/* ================================================================== */

const GARDE_FOUS_COMMUNS = [
  'La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque score doit être justifié par des éléments localisables dans la copie. Le jugement du correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et calibré.',
  'La note est la SOMME des réussites observées critère par critère. On ne part jamais de 20 pour retrancher les erreurs.',
  'Une même faiblesse n’est comptée que dans UN critère. Ses conséquences ailleurs sont décrites, jamais sanctionnées une deuxième fois.',
  'Chaque score est justifié par une citation réellement présente dans la transcription. Aucune citation n’est inventée ni reconstituée.',
  'Aucun fait, aucune date, aucun acteur, aucun exemple absent de la copie ou du sujet n’est ajouté par le correcteur.',
  'Aucun plan unique n’est imposé : tout plan pertinent qui répond à la problématique est recevable.',
  'La neutralité politique est absolue : on évalue la démonstration, jamais l’opinion de l’élève.',
  'Un doute de transcription n’est jamais transformé en erreur de l’élève : il déclenche une relecture humaine.',
];

/* ------------------------ A. Dissertation -------------------------- */

export const GRILLE_DISSERTATION: Grille = {
  id: 'HGGSP_DISSERTATION_V2',
  matiere: 'hggsp',
  exercise_type: 'hggsp_dissertation',
  version: '2.0',
  libelle: 'HGGSP — Dissertation',
  principe:
    'Une dissertation d’HGGSP se juge sur une démonstration : un sujet analysé, une tension problématisée, un plan qui progresse, des connaissances sélectionnées et des exemples précis qui prouvent. L’échelle analytique interne vaut 20 points ; la note officielle de l’exercice dans un bac blanc complet vaut la moitié, sur 10.',
  max_analytique: 20,
  max_officiel: 10,
  garde_fous: [
    ...GARDE_FOUS_COMMUNS,
    'Une production graphique pertinente (croquis, schéma) peut valoriser « Construction et argumentation » ou « Exemples précis et exploités », dans la limite du maximum du critère. Son absence ne pénalise jamais.',
  ],
  criteres: [
    {
      code: 'ANALYSE_PROBLEMATISATION',
      libelle: 'Analyse du sujet et problématisation',
      max_points: 4,
      ordre: 1,
      evaluer: [
        'la compréhension exacte des termes du sujet',
        'la définition des notions utiles',
        'la prise en compte des bornes chronologiques, spatiales et notionnelles',
        'l’identification des enjeux',
        'la formulation d’une problématique explicite',
        'la présence d’une tension réelle',
        'la capacité de la problématique à guider tout le devoir',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Sujet non compris, hors-sujet majeur ou aucun élément recevable.' },
        { points: 1, niveau: 'insuffisant', description: 'Compréhension très partielle, notions centrales non définies, absence de problématique.' },
        { points: 2, niveau: 'fragile', description: 'Sujet globalement compris, mais bornes ou notion importantes oubliées ; problématique descriptive ou simple reformulation.' },
        { points: 3, niveau: 'satisfaisant', description: 'Sujet correctement analysé, problématique pertinente, quelques limites ou imprécisions.' },
        { points: 4, niveau: 'tres_satisfaisant', description: 'Analyse complète, bornes et notions maîtrisées, problématique précise, réellement directrice et porteuse d’une tension.' },
      ],
    },
    {
      code: 'CONNAISSANCES',
      libelle: 'Maîtrise et sélection des connaissances',
      max_points: 5,
      ordre: 2,
      evaluer: [
        'l’exactitude des faits',
        'la maîtrise des dates, acteurs, notions et mécanismes',
        'la sélection des connaissances réellement utiles',
        'la capacité à relier les connaissances au sujet',
        'la compréhension des enjeux historiques, géographiques, géopolitiques et politiques',
        'la nuance',
        'un cours récité sans rapport direct avec le sujet n’est pas valorisé',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucune connaissance exploitable ou contresens généralisés.' },
        { points: 1, niveau: 'insuffisant', description: 'Connaissances très faibles, nombreuses erreurs ou éléments majoritairement hors sujet.' },
        { points: 2, niveau: 'fragile', description: 'Connaissances exactes mais limitées, imprécises ou insuffisamment reliées au sujet.' },
        { points: 3, niveau: 'moyen', description: 'Connaissances globalement maîtrisées et pertinentes, malgré plusieurs limites.' },
        { points: 4, niveau: 'satisfaisant', description: 'Connaissances solides, précises, sélectionnées et bien intégrées à la démonstration.' },
        { points: 5, niveau: 'tres_satisfaisant', description: 'Maîtrise très solide, précise, nuancée et constamment mise au service du sujet.' },
      ],
    },
    {
      code: 'ARGUMENTATION',
      libelle: 'Construction et argumentation',
      max_points: 5,
      ordre: 3,
      evaluer: [
        'la cohérence du plan',
        'la progression de la démonstration',
        'l’équilibre des parties',
        'les liens logiques',
        'la qualité des paragraphes argumentés',
        'les transitions',
        'l’adéquation entre plan et problématique',
        'la conclusion et sa réponse à la problématique',
        'aucun plan unique n’est imposé',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucune organisation ni démonstration identifiable.' },
        { points: 1, niveau: 'insuffisant', description: 'Juxtaposition de connaissances, plan absent ou incohérent.' },
        { points: 2, niveau: 'fragile', description: 'Organisation visible mais fragile, descriptive, déséquilibrée ou partiellement hors sujet.' },
        { points: 3, niveau: 'moyen', description: 'Démonstration cohérente, plan globalement pertinent, malgré des transitions ou arguments insuffisants.' },
        { points: 4, niveau: 'satisfaisant', description: 'Argumentation solide, progressive et bien organisée.' },
        { points: 5, niveau: 'tres_satisfaisant', description: 'Démonstration rigoureuse, équilibrée, nuancée et répondant pleinement à la problématique.' },
      ],
    },
    {
      code: 'EXEMPLES',
      libelle: 'Exemples précis et exploités',
      max_points: 4,
      ordre: 4,
      evaluer: [
        'la pertinence des exemples',
        'leur précision',
        'leur diversité lorsqu’elle est utile',
        'leur contextualisation',
        'leur rôle dans la démonstration',
        'leur exploitation, et non leur simple citation',
        'ce critère est distinct de la maîtrise générale des connaissances',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucun exemple exploitable.' },
        { points: 1, niveau: 'insuffisant', description: 'Exemples très rares, imprécis, erronés ou simplement cités.' },
        { points: 2, niveau: 'fragile', description: 'Quelques exemples pertinents mais insuffisamment développés.' },
        { points: 3, niveau: 'satisfaisant', description: 'Exemples précis, variés et généralement bien exploités.' },
        { points: 4, niveau: 'tres_satisfaisant', description: 'Exemples particulièrement pertinents, précis, comparés et intégrés à chaque étape de la démonstration.' },
      ],
    },
    {
      code: 'EXPRESSION',
      libelle: 'Expression et présentation',
      max_points: 2,
      ordre: 5,
      evaluer: [
        'la lisibilité',
        'la syntaxe',
        'l’orthographe lorsqu’elle affecte la compréhension',
        'la précision du vocabulaire',
        'la structure des paragraphes',
        'la qualité des connecteurs logiques',
        'la présentation générale',
        'une faute isolée ne fait jamais perdre de point automatiquement',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Expression empêchant largement la compréhension.' },
        { points: 0.5, niveau: 'insuffisant', description: 'Expression très fragile, nombreuses formulations ambiguës ou paragraphes difficilement compréhensibles.' },
        { points: 1, niveau: 'fragile', description: 'Expression compréhensible mais imprécise, répétitive ou irrégulière.' },
        { points: 1.5, niveau: 'satisfaisant', description: 'Expression claire et correctement structurée malgré quelques maladresses.' },
        { points: 2, niveau: 'tres_satisfaisant', description: 'Expression claire, précise, fluide et parfaitement au service du raisonnement.' },
      ],
    },
  ],
};

/* ---------------------- B. Étude critique -------------------------- */

export const GRILLE_ETUDE_CRITIQUE: Grille = {
  id: 'HGGSP_ETUDE_CRITIQUE_V2',
  matiere: 'hggsp',
  exercise_type: 'hggsp_etude_critique',
  version: '2.0',
  libelle: 'HGGSP — Étude critique de document(s)',
  principe:
    'L’étude critique se juge sur trois gestes NETTEMENT SÉPARÉS : prélever, expliquer, critiquer. Un prélèvement exact est valorisé pour lui-même, même quand l’explication et la critique manquent. L’échelle analytique interne vaut 20 points ; la note officielle de l’exercice dans un bac blanc complet vaut la moitié, sur 10.',
  max_analytique: 20,
  max_officiel: 10,
  garde_fous: [
    ...GARDE_FOUS_COMMUNS,
    'Prélever, expliquer et critiquer sont trois critères distincts : l’absence de critique ne fait jamais perdre les points du prélèvement.',
    'Quand le sujet comporte deux documents, la confrontation est attendue — mais aucune opposition n’est imposée si les documents sont complémentaires.',
  ],
  criteres: [
    {
      code: 'CONSIGNE_PROBLEMATISATION',
      libelle: 'Compréhension de la consigne et problématisation',
      max_points: 3,
      ordre: 1,
      evaluer: [
        'la compréhension du titre et de la consigne',
        'le traitement de toutes les dimensions demandées',
        'la formulation d’une problématique',
        'la présence d’un fil directeur',
        'l’adéquation entre la problématique et les documents',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Consigne non comprise ou réponse à une autre question.' },
        { points: 0.75, niveau: 'insuffisant', description: 'Compréhension très partielle, dimension essentielle oubliée, aucune problématique.' },
        { points: 1.5, niveau: 'fragile', description: 'Consigne globalement comprise, mais problématique descriptive ou incomplète.' },
        { points: 2.25, niveau: 'satisfaisant', description: 'Consigne correctement analysée, problématique pertinente malgré quelques limites.' },
        { points: 3, niveau: 'tres_satisfaisant', description: 'Toutes les dimensions de la consigne sont intégrées dans une problématique précise et directrice.' },
      ],
    },
    {
      code: 'PRELEVEMENT',
      libelle: 'Prélèvement et hiérarchisation des informations',
      max_points: 3,
      ordre: 2,
      evaluer: [
        'la compréhension du sens général',
        'la sélection des informations utiles',
        'la précision des références au document',
        'la hiérarchisation',
        'la distinction entre idée essentielle et détail secondaire',
        'l’absence de paraphrase intégrale',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucun prélèvement recevable ou contresens global.' },
        { points: 0.75, niveau: 'insuffisant', description: 'Prélèvements rares, inexacts ou très désordonnés.' },
        { points: 1.5, niveau: 'fragile', description: 'Informations principales repérées, mais paraphrase dominante ou hiérarchisation faible.' },
        { points: 2.25, niveau: 'satisfaisant', description: 'Informations pertinentes sélectionnées et généralement bien organisées.' },
        { points: 3, niveau: 'tres_satisfaisant', description: 'Sélection précise, complète, hiérarchisée et constamment reliée à la consigne.' },
      ],
    },
    {
      code: 'EXPLICATION_CONNAISSANCES',
      libelle: 'Explication par les connaissances',
      max_points: 4,
      ordre: 3,
      evaluer: [
        'la contextualisation',
        'l’utilisation de notions du programme',
        'l’explication des acteurs et mécanismes',
        'la mise en relation document / connaissances',
        'la capacité à éclairer le document sans réciter le cours',
        'l’exactitude',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucune connaissance mobilisée ou contresens majeurs.' },
        { points: 1, niveau: 'insuffisant', description: 'Connaissances très générales, rares ou mal reliées aux documents.' },
        { points: 2, niveau: 'fragile', description: 'Plusieurs connaissances pertinentes mais partielles ou insuffisamment exploitées.' },
        { points: 3, niveau: 'satisfaisant', description: 'Connaissances précises permettant d’expliquer correctement l’essentiel.' },
        { points: 4, niveau: 'tres_satisfaisant', description: 'Contextualisation et connaissances riches, précises, nuancées et parfaitement intégrées à l’analyse.' },
      ],
    },
    {
      code: 'ANALYSE_CRITIQUE',
      libelle: 'Analyse critique et mise à distance',
      max_points: 5,
      ordre: 4,
      evaluer: [
        'la nature du document',
        'l’auteur ou l’institution productrice',
        'la date et le contexte',
        'le destinataire',
        'l’intention',
        'le point de vue',
        'la portée',
        'la fiabilité',
        'les limites',
        'les silences',
        'les biais éventuels',
        'la comparaison entre ce que montre et ce que ne montre pas le document',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucune mise à distance et aucune analyse recevable.' },
        { points: 1, niveau: 'insuffisant', description: 'Caractéristiques formelles seulement citées, sans effet sur l’interprétation.' },
        { points: 2, niveau: 'fragile', description: 'Quelques remarques critiques, mais paraphrase ou description dominante.' },
        { points: 3, niveau: 'moyen', description: 'Source, contexte, intention ou limites analysés de manière pertinente mais incomplète.' },
        { points: 4, niveau: 'satisfaisant', description: 'Critique solide, régulière et reliée à la problématique.' },
        { points: 5, niveau: 'tres_satisfaisant', description: 'Mise à distance précise, nuancée et complète, distinguant clairement contenu, point de vue, portée, biais et silences.' },
      ],
    },
    {
      code: 'ORGANISATION_ARGUMENTATION',
      libelle: 'Organisation et argumentation',
      max_points: 3,
      ordre: 5,
      evaluer: [
        'l’organisation en plusieurs paragraphes',
        'la progression du raisonnement',
        'les liens entre document, connaissances et critique',
        'les transitions',
        'la conclusion',
        'la réponse à la problématique',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Aucune organisation identifiable.' },
        { points: 0.75, niveau: 'insuffisant', description: 'Juxtaposition ou paraphrase sans raisonnement.' },
        { points: 1.5, niveau: 'fragile', description: 'Organisation visible mais fragile, descriptive ou déséquilibrée.' },
        { points: 2.25, niveau: 'satisfaisant', description: 'Démonstration globalement cohérente malgré quelques faiblesses.' },
        { points: 3, niveau: 'tres_satisfaisant', description: 'Organisation rigoureuse, progressive et pleinement au service de la problématique.' },
      ],
    },
    {
      code: 'EXPRESSION',
      libelle: 'Expression écrite',
      max_points: 2,
      ordre: 6,
      evaluer: [
        'la lisibilité et la syntaxe',
        'l’orthographe lorsqu’elle affecte la compréhension',
        'la précision du vocabulaire',
        'la structure des paragraphes',
        'les connecteurs logiques',
        'la présentation générale',
        'une faute isolée ne fait jamais perdre de point automatiquement',
      ],
      paliers: [
        { points: 0, niveau: 'nul', description: 'Expression empêchant largement la compréhension.' },
        { points: 0.5, niveau: 'insuffisant', description: 'Expression très fragile, nombreuses formulations ambiguës ou phrases difficilement compréhensibles.' },
        { points: 1, niveau: 'fragile', description: 'Expression compréhensible mais imprécise, répétitive ou irrégulière.' },
        { points: 1.5, niveau: 'satisfaisant', description: 'Expression claire et correctement ponctuée malgré quelques maladresses.' },
        { points: 2, niveau: 'tres_satisfaisant', description: 'Expression claire, précise et fluide, entièrement au service de la lecture du document.' },
      ],
    },
  ],
};

export const GRILLES: Record<TypeExercice, Grille> = {
  hggsp_dissertation: GRILLE_DISSERTATION,
  hggsp_etude_critique: GRILLE_ETUDE_CRITIQUE,
};

/* ================================================================== */
/*  4. Taxonomie des erreurs                                          */
/* ================================================================== */

/** Raccourci d'écriture : une entrée de taxonomie avec ses valeurs par défaut. */
function erreur(e: Partial<EntreeTaxonomie> & Pick<EntreeTaxonomie, 'code' | 'libelle' | 'portee' | 'description' | 'gravite' | 'type_impact' | 'message_pedagogique'>): EntreeTaxonomie {
  return {
    critere_principal: {},
    criteres_secondaires: {},
    impact_min: null,
    impact_max: null,
    plafond_score: null,
    plafond_niveau: null,
    conditions: '',
    regle_non_double_sanction:
      'Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.',
    relecture_humaine: false,
    ...e,
  };
}

/** Critères « connaissances » selon l'exercice — la même erreur, deux adresses. */
const CRIT_SAVOIRS = {
  hggsp_dissertation: 'CONNAISSANCES',
  hggsp_etude_critique: 'EXPLICATION_CONNAISSANCES',
} as const;

const CRIT_ARGU = {
  hggsp_dissertation: 'ARGUMENTATION',
  hggsp_etude_critique: 'ORGANISATION_ARGUMENTATION',
} as const;

const CRIT_EXPRESSION = {
  hggsp_dissertation: 'EXPRESSION',
  hggsp_etude_critique: 'EXPRESSION',
} as const;

/* ---------------------- A. Erreurs transversales ------------------- */

export const TAXONOMIE_TRANSVERSALE: EntreeTaxonomie[] = [
  erreur({
    code: 'HGGSP_TR_01',
    libelle: 'Erreur factuelle secondaire',
    portee: 'transversale',
    description: 'Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement.',
    critere_principal: CRIT_SAVOIRS,
    gravite: 'mineure',
    type_impact: 'contextual_range',
    impact_min: 0,
    impact_max: 0.25,
    conditions: 'L’erreur ne sert pas d’appui à un argument du développement.',
    message_pedagogique: 'Une inexactitude ponctuelle : elle ne casse pas ta démonstration, mais vérifie tes repères.',
  }),
  erreur({
    code: 'HGGSP_TR_02',
    libelle: 'Erreur factuelle affectant un argument',
    portee: 'transversale',
    description: 'Un fait inexact sur lequel repose un argument du développement.',
    critere_principal: CRIT_SAVOIRS,
    criteres_secondaires: { hggsp_dissertation: ['EXEMPLES'] },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    conditions: 'L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.',
    regle_non_double_sanction:
      'Comptée dans les connaissances. Si l’exemple porteur de cette erreur est par ailleurs jugé non exploité, l’erreur factuelle n’est pas retirée une deuxième fois dans « Exemples ».',
    message_pedagogique: 'Ce fait est inexact et c’est lui qui portait ton argument : vérifie-le avant de t’appuyer dessus.',
  }),
  erreur({
    code: 'HGGSP_TR_03',
    libelle: 'Contresens central',
    portee: 'transversale',
    description: 'Un contresens qui détruit une partie entière de la démonstration.',
    critere_principal: CRIT_SAVOIRS,
    criteres_secondaires: { hggsp_dissertation: ['ARGUMENTATION'], hggsp_etude_critique: ['ORGANISATION_ARGUMENTATION'] },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    conditions: 'Le contresens porte sur une notion ou un mécanisme central du sujet.',
    message_pedagogique: 'Ce contresens fait tomber toute une partie : reprends la notion avant de refaire le devoir.',
    relecture_humaine: true,
  }),
  erreur({
    code: 'HGGSP_TR_04',
    libelle: 'Confusion de notions',
    portee: 'transversale',
    description: 'Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation).',
    critere_principal: CRIT_SAVOIRS,
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    message_pedagogique: 'Ces deux notions ne disent pas la même chose : définis-les avant de les employer.',
  }),
  erreur({
    code: 'HGGSP_TR_05',
    libelle: 'Connaissances hors sujet',
    portee: 'transversale',
    description: 'Développement exact mais qui ne traite pas le sujet posé.',
    critere_principal: CRIT_SAVOIRS,
    gravite: 'majeure',
    type_impact: 'evidence_not_rewarded',
    conditions:
      'Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.',
    regle_non_double_sanction:
      'Les connaissances hors sujet ne rapportent simplement pas de points. Aucune pénalité supplémentaire n’est ajoutée par ailleurs.',
    message_pedagogique: 'C’est juste, mais ça ne répond pas à la question posée : ces développements ne rapportent rien.',
  }),
  erreur({
    code: 'HGGSP_TR_06',
    libelle: 'Opinion personnelle non démontrée',
    portee: 'transversale',
    description: 'Un avis substitué à l’analyse, sans démonstration ni référence.',
    critere_principal: CRIT_ARGU,
    gravite: 'moderee',
    type_impact: 'evidence_not_rewarded',
    message_pedagogique: 'Ton avis ne vaut que s’il est démontré : appuie-le sur des faits et des exemples.',
  }),
  erreur({
    code: 'HGGSP_TR_07',
    libelle: 'Confusion d’échelles',
    portee: 'transversale',
    description: 'Échelles locale, nationale, régionale et mondiale traitées indifféremment.',
    critere_principal: CRIT_SAVOIRS,
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    message_pedagogique: 'Précise à quelle échelle tu raisonnes : le sens de ton argument en dépend.',
  }),
  erreur({
    code: 'HGGSP_TR_08',
    libelle: 'Anachronisme',
    portee: 'transversale',
    description: 'Une notion contemporaine projetée sur une autre époque.',
    critere_principal: CRIT_SAVOIRS,
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    message_pedagogique: 'Cette notion n’existait pas à cette époque : situe-la dans son temps.',
  }),
  erreur({
    code: 'HGGSP_TR_09',
    libelle: 'Expression nuisant à la compréhension',
    portee: 'transversale',
    description: 'Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos.',
    critere_principal: CRIT_EXPRESSION,
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 1,
    conditions:
      'Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.',
    message_pedagogique: 'Certaines phrases ne se comprennent pas : relis-toi à voix haute pour repérer les ruptures.',
  }),
  erreur({
    code: 'HGGSP_TR_10',
    libelle: 'Faute isolée sans effet sur la compréhension',
    portee: 'transversale',
    description: 'Une coquille ou une faute ponctuelle qui ne gêne pas la lecture.',
    critere_principal: CRIT_EXPRESSION,
    gravite: 'mineure',
    type_impact: 'informational_only',
    conditions: 'Signalée à l’élève, elle ne fait perdre aucun point.',
    message_pedagogique: 'Petite coquille sans conséquence sur ta note : un dernier relecture la ferait disparaître.',
  }),
  erreur({
    code: 'HGGSP_TR_11',
    libelle: 'Conclusion absente',
    portee: 'transversale',
    description: 'Aucune conclusion ne répond explicitement à la problématique.',
    critere_principal: CRIT_ARGU,
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    regle_non_double_sanction:
      'Comptée une seule fois dans la construction / l’organisation. Aucune seconde pénalité ailleurs pour la même absence.',
    message_pedagogique: 'Ta copie s’arrête sans répondre : une conclusion, même courte, doit trancher la question posée.',
  }),
  erreur({
    code: 'HGGSP_TR_12',
    libelle: 'Passage illisible ou transcription incertaine',
    portee: 'transversale',
    description: 'Un passage de la copie n’a pas pu être lu avec certitude.',
    gravite: 'majeure',
    type_impact: 'human_review_required',
    conditions: 'Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.',
    regle_non_double_sanction: 'Aucune pénalité automatique n’est appliquée sur ce motif.',
    message_pedagogique: 'Un passage n’a pas pu être lu : ta copie est vérifiée par un professeur avant d’être rendue.',
    relecture_humaine: true,
  }),
];

/* ------------------ B. Erreurs propres à la dissertation ----------- */

export const TAXONOMIE_DISSERTATION: EntreeTaxonomie[] = [
  erreur({
    code: 'HGGSP_DIS_01',
    libelle: 'Mauvaise analyse des termes du sujet',
    portee: 'dissertation',
    description: 'Un ou plusieurs mots du sujet ne sont pas compris ou sont laissés de côté.',
    critere_principal: { hggsp_dissertation: 'ANALYSE_PROBLEMATISATION' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1.5,
    message_pedagogique: 'Chaque mot du sujet compte : analyse-les un par un avant de rédiger.',
  }),
  erreur({
    code: 'HGGSP_DIS_02',
    libelle: 'Bornes du sujet ignorées',
    portee: 'dissertation',
    description: 'Les bornes chronologiques, spatiales ou notionnelles du sujet ne sont pas tenues.',
    critere_principal: { hggsp_dissertation: 'ANALYSE_PROBLEMATISATION' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 1,
    message_pedagogique: 'Le sujet fixe un cadre (dates, espaces, notions) : tout ce qui en sort ne compte pas.',
  }),
  erreur({
    code: 'HGGSP_DIS_03',
    libelle: 'Notion centrale non définie',
    portee: 'dissertation',
    description: 'La notion au cœur du sujet n’est jamais définie.',
    critere_principal: { hggsp_dissertation: 'ANALYSE_PROBLEMATISATION' },
    gravite: 'moderee',
    type_impact: 'criterion_level_cap',
    plafond_niveau: 'satisfaisant',
    conditions:
      'Aucune pénalité fixe. Le plafond ne s’applique que si cette absence nuit réellement à la compréhension du sujet.',
    message_pedagogique: 'Définis la notion centrale en introduction : sans elle, ton devoir avance sans repère.',
  }),
  erreur({
    code: 'HGGSP_DIS_04',
    libelle: 'Cours récité',
    portee: 'dissertation',
    description: 'Le cours est restitué intégralement, sans sélection en fonction du sujet.',
    critere_principal: { hggsp_dissertation: 'CONNAISSANCES' },
    gravite: 'moderee',
    type_impact: 'evidence_not_rewarded',
    regle_non_double_sanction:
      'Le cours récité ne produit pas les points de sélection ; aucune pénalité supplémentaire n’est ajoutée dans l’argumentation.',
    message_pedagogique: 'Tu sais ton cours : il faut maintenant n’en garder que ce qui répond au sujet.',
  }),
  erreur({
    code: 'HGGSP_DIS_05',
    libelle: 'Problématique absente',
    portee: 'dissertation',
    description: 'Aucune problématique explicite dans l’introduction.',
    critere_principal: { hggsp_dissertation: 'ANALYSE_PROBLEMATISATION' },
    criteres_secondaires: { hggsp_dissertation: ['ARGUMENTATION'] },
    gravite: 'majeure',
    type_impact: 'criterion_level_cap',
    plafond_niveau: 'insuffisant',
    conditions: 'Le critère est plafonné au niveau insuffisant.',
    regle_non_double_sanction:
      'L’absence elle-même est comptée ici, une seule fois. L’argumentation reste évaluée sur son organisation réellement observable, sans pénalité automatique supplémentaire.',
    message_pedagogique: 'Il manque la question à laquelle ton devoir répond : formule-la explicitement en introduction.',
  }),
  erreur({
    code: 'HGGSP_DIS_06',
    libelle: 'Problématique descriptive',
    portee: 'dissertation',
    description: 'La problématique reformule le sujet sans créer de tension.',
    critere_principal: { hggsp_dissertation: 'ANALYSE_PROBLEMATISATION' },
    gravite: 'moderee',
    type_impact: 'criterion_level_cap',
    plafond_niveau: 'fragile',
    conditions:
      'Exception : si le développement construit en réalité un fil directeur plus solide que la formulation initiale, le plafond ne s’applique pas — le correcteur doit alors le dire explicitement.',
    message_pedagogique: 'Ta question reformule le sujet : cherche la tension, ce qui fait vraiment débat.',
  }),
  erreur({
    code: 'HGGSP_DIS_07',
    libelle: 'Plan non annoncé',
    portee: 'dissertation',
    description: 'L’introduction n’annonce pas le plan, alors que le développement en suit un.',
    critere_principal: { hggsp_dissertation: 'ARGUMENTATION' },
    gravite: 'mineure',
    type_impact: 'contextual_range',
    impact_min: 0,
    impact_max: 0.25,
    conditions: 'Impact faible et purement méthodologique si le plan réel est clair et cohérent.',
    message_pedagogique: 'Annonce ton plan en fin d’introduction : le correcteur doit savoir où tu l’emmènes.',
  }),
  erreur({
    code: 'HGGSP_DIS_08',
    libelle: 'Plan annoncé mais non respecté',
    portee: 'dissertation',
    description: 'Le développement ne suit pas le plan annoncé.',
    critere_principal: { hggsp_dissertation: 'ARGUMENTATION' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0,
    impact_max: 0.5,
    conditions:
      'On évalue la cohérence réelle du développement : si la modification améliore finalement la démonstration, aucun point n’est retiré.',
    message_pedagogique: 'Ce que tu annonces et ce que tu fais doivent coïncider — ou alors annonce ce que tu fais vraiment.',
  }),
  erreur({
    code: 'HGGSP_DIS_09',
    libelle: 'Plan déséquilibré',
    portee: 'dissertation',
    description: 'Une partie est très courte, redondante ou sans transition.',
    critere_principal: { hggsp_dissertation: 'ARGUMENTATION' },
    gravite: 'mineure',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    message_pedagogique: 'Tes parties doivent peser à peu près autant : une partie expédiée se voit tout de suite.',
  }),
  erreur({
    code: 'HGGSP_DIS_10',
    libelle: 'Plan non pertinent',
    portee: 'dissertation',
    description: 'Le plan ne permet pas de répondre à la problématique posée.',
    critere_principal: { hggsp_dissertation: 'ARGUMENTATION' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1.5,
    conditions: 'Aucun plan type n’est exigé : seule l’adéquation plan / problématique est jugée.',
    message_pedagogique: 'Ton plan n’attaque pas la question posée : construis-le à partir de ta problématique.',
  }),
  erreur({
    code: 'HGGSP_DIS_11',
    libelle: 'Exemple seulement cité',
    portee: 'dissertation',
    description: 'Un exemple est nommé mais jamais analysé ni relié à l’argument.',
    critere_principal: { hggsp_dissertation: 'EXEMPLES' },
    criteres_secondaires: { hggsp_dissertation: ['CONNAISSANCES'] },
    gravite: 'moderee',
    type_impact: 'evidence_not_rewarded',
    regle_non_double_sanction:
      'L’exemple peut attester une connaissance et être valorisé à ce titre. Il ne reçoit simplement pas les points d’exploitation — et aucune pénalité supplémentaire n’est retirée après ce refus.',
    message_pedagogique: 'Citer un exemple ne suffit pas : montre ce qu’il prouve, précisément.',
  }),
  erreur({
    code: 'HGGSP_DIS_12',
    libelle: 'Exemples insuffisamment précis',
    portee: 'dissertation',
    description: 'Exemples sans date, sans acteur identifié ou sans localisation.',
    critere_principal: { hggsp_dissertation: 'EXEMPLES' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.75,
    message_pedagogique: 'Un exemple précis, c’est une date, un lieu, des acteurs. Ajoute-les.',
  }),
  erreur({
    code: 'HGGSP_DIS_13',
    libelle: 'Absence de sélection des connaissances',
    portee: 'dissertation',
    description: 'Tout est mis, rien n’est trié en fonction du sujet.',
    critere_principal: { hggsp_dissertation: 'CONNAISSANCES' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Trier, c’est déjà démontrer : garde ce qui sert la question, laisse le reste.',
  }),
  erreur({
    code: 'HGGSP_DIS_14',
    libelle: 'Réponse finale insuffisante',
    portee: 'dissertation',
    description: 'La conclusion existe mais ne répond pas vraiment à la problématique.',
    critere_principal: { hggsp_dissertation: 'ARGUMENTATION' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    regle_non_double_sanction:
      'Ne se cumule pas avec HGGSP_TR_11 (conclusion absente) : soit la conclusion manque, soit elle est insuffisante.',
    message_pedagogique: 'Ta conclusion résume au lieu de répondre : tranche la question, en une phrase claire.',
  }),
  erreur({
    code: 'HGGSP_DIS_15',
    libelle: 'Production graphique décorative ou erronée',
    portee: 'dissertation',
    description: 'Un croquis ou schéma sans rapport avec la démonstration, ou porteur d’une erreur.',
    critere_principal: { hggsp_dissertation: 'EXEMPLES' },
    gravite: 'mineure',
    type_impact: 'informational_only',
    conditions:
      'Une production graphique pertinente VALORISE la construction ou les exemples, dans la limite du maximum du critère. Son absence ne pénalise jamais. Si la production ne peut pas être interprétée, une relecture humaine est demandée.',
    regle_non_double_sanction:
      'Une production graphique non valorisée ne fait perdre aucun point : elle est seulement écartée du calcul.',
    message_pedagogique: 'Un croquis n’a de valeur que s’il démontre quelque chose : légende-le et relie-le à ton argument.',
  }),
];

/* ---------------- C. Erreurs propres à l'étude critique ------------ */

export const TAXONOMIE_ETUDE_CRITIQUE: EntreeTaxonomie[] = [
  erreur({
    code: 'HGGSP_EC_01',
    libelle: 'Paraphrase',
    portee: 'etude_critique',
    description: 'Le document est reformulé ou recopié sans être expliqué ni critiqué.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    criteres_secondaires: { hggsp_etude_critique: ['EXPLICATION_CONNAISSANCES'] },
    gravite: 'majeure',
    type_impact: 'evidence_not_rewarded',
    regle_non_double_sanction:
      'Les informations correctement prélevées RESTENT valorisées dans « Prélèvement ». La paraphrase prive seulement des points d’explication et de critique — aucune pénalité supplémentaire n’est ajoutée après ce refus.',
    message_pedagogique: 'Redire le document ne suffit pas : explique-le avec tes connaissances, puis prends du recul.',
  }),
  erreur({
    code: 'HGGSP_EC_02',
    libelle: 'Informations mal hiérarchisées',
    portee: 'etude_critique',
    description: 'Détails secondaires traités comme des idées essentielles, ou inversement.',
    critere_principal: { hggsp_etude_critique: 'PRELEVEMENT' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.75,
    message_pedagogique: 'Commence par les idées essentielles du document, garde les détails pour appuyer.',
  }),
  erreur({
    code: 'HGGSP_EC_03',
    libelle: 'Document non contextualisé',
    portee: 'etude_critique',
    description: 'Le document n’est pas replacé dans son contexte historique ou géopolitique.',
    critere_principal: { hggsp_etude_critique: 'EXPLICATION_CONNAISSANCES' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Situe le document : quelle époque, quel contexte, quels enjeux au moment où il est produit ?',
  }),
  erreur({
    code: 'HGGSP_EC_04',
    libelle: 'Auteur ou source non interrogé',
    portee: 'etude_critique',
    description: 'L’auteur ou l’institution productrice n’est ni identifié ni questionné.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Qui parle ? Un auteur, une institution, une position : c’est le début de la critique.',
  }),
  erreur({
    code: 'HGGSP_EC_05',
    libelle: 'Destinataire non identifié',
    portee: 'etude_critique',
    description: 'Le destinataire du document n’est pas identifié alors qu’il éclaire son sens.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    conditions: 'Ne s’applique que lorsque le destinataire est identifiable et pertinent.',
    message_pedagogique: 'À qui ce document s’adresse-t-il ? Le destinataire explique souvent le ton et les silences.',
  }),
  erreur({
    code: 'HGGSP_EC_06',
    libelle: 'Intention non analysée',
    portee: 'etude_critique',
    description: 'L’intention de l’auteur n’est jamais interrogée.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Pourquoi ce document a-t-il été produit ? L’intention change ce qu’il faut en retenir.',
  }),
  erreur({
    code: 'HGGSP_EC_07',
    libelle: 'Point de vue non identifié',
    portee: 'etude_critique',
    description: 'Le point de vue situé du document est pris pour un constat neutre.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Un document parle depuis quelque part : dis d’où, et ce que cela change.',
  }),
  erreur({
    code: 'HGGSP_EC_08',
    libelle: 'Limites ou silences ignorés',
    portee: 'etude_critique',
    description: 'Ce que le document ne dit pas n’est jamais interrogé.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'majeure',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Compare ce que le document montre et ce qu’il tait : les silences sont des arguments.',
  }),
  erreur({
    code: 'HGGSP_EC_09',
    libelle: 'Absence totale de mise à distance critique',
    portee: 'etude_critique',
    description: 'Aucune critique explicite : ni nature, ni auteur, ni intention, ni portée, ni limites.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'majeure',
    type_impact: 'criterion_score_cap',
    plafond_score: 2.5,
    conditions:
      'Le critère « Analyse critique » est plafonné à 50 % de son maximum, soit 2,5 / 5.',
    regle_non_double_sanction:
      'Le prélèvement correct reste valorisé dans son critère. On ne met JAMAIS presque zéro à toute la partie documentaire au motif que la critique manque.',
    message_pedagogique: 'Il manque le cœur de l’exercice : la mise à distance du document. C’est là que se gagne la note.',
  }),
  erreur({
    code: 'HGGSP_EC_10',
    libelle: 'Connaissances substituées au document',
    portee: 'etude_critique',
    description: 'Le cours remplace le document au lieu de l’éclairer.',
    critere_principal: { hggsp_etude_critique: 'PRELEVEMENT' },
    criteres_secondaires: { hggsp_etude_critique: ['EXPLICATION_CONNAISSANCES'] },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    message_pedagogique: 'Le document est le point de départ : tes connaissances viennent l’expliquer, pas le remplacer.',
  }),
  erreur({
    code: 'HGGSP_EC_11',
    libelle: 'Document utilisé sans citation ni localisation',
    portee: 'etude_critique',
    description: 'Les informations sont attribuées au document sans citation ni renvoi précis.',
    critere_principal: { hggsp_etude_critique: 'PRELEVEMENT' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.75,
    message_pedagogique: 'Cite entre guillemets et indique où : « ligne 12 », « deuxième paragraphe ».',
  }),
  erreur({
    code: 'HGGSP_EC_12',
    libelle: 'Deuxième document ignoré',
    portee: 'etude_critique',
    description: 'Un des deux documents est absent ou presque absent de l’analyse.',
    critere_principal: { hggsp_etude_critique: 'PRELEVEMENT' },
    criteres_secondaires: { hggsp_etude_critique: ['ANALYSE_CRITIQUE'] },
    gravite: 'majeure',
    type_impact: 'criterion_score_cap',
    plafond_score: 1.5,
    conditions: 'Ne s’applique que si le sujet comporte réellement deux documents.',
    regle_non_double_sanction:
      'Le plafond joue sur le prélèvement uniquement. L’analyse critique du document réellement traité reste valorisée.',
    message_pedagogique: 'Un document sur deux est resté de côté : les deux doivent être exploités.',
  }),
  erreur({
    code: 'HGGSP_EC_13',
    libelle: 'Absence de confrontation',
    portee: 'etude_critique',
    description: 'Deux analyses séparées, sans aucune mise en relation.',
    critere_principal: { hggsp_etude_critique: 'ORGANISATION_ARGUMENTATION' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.5,
    impact_max: 1,
    conditions: 'Ne s’applique que si le sujet comporte deux documents et attend leur confrontation.',
    message_pedagogique: 'Confronte les documents : convergences, divergences, complémentarités.',
  }),
  erreur({
    code: 'HGGSP_EC_14',
    libelle: 'Confrontation artificielle',
    portee: 'etude_critique',
    description: 'Les documents sont opposés alors qu’ils sont complémentaires.',
    critere_principal: { hggsp_etude_critique: 'ANALYSE_CRITIQUE' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    conditions: 'Aucune opposition n’est imposée : si les documents se complètent, il faut le dire.',
    message_pedagogique: 'Ces documents ne s’opposent pas : montre plutôt en quoi ils se complètent.',
  }),
  erreur({
    code: 'HGGSP_EC_15',
    libelle: 'Confusion entre les documents ou les auteurs',
    portee: 'etude_critique',
    description: 'Une citation ou un point de vue est attribué au mauvais document.',
    critere_principal: { hggsp_etude_critique: 'PRELEVEMENT' },
    gravite: 'moderee',
    type_impact: 'contextual_range',
    impact_min: 0.25,
    impact_max: 0.5,
    message_pedagogique: 'Vérifie l’attribution : chaque citation appartient à un document précis.',
  }),
  erreur({
    code: 'HGGSP_EC_16',
    libelle: 'Consigne partiellement traitée',
    portee: 'etude_critique',
    description: 'Une dimension explicitement demandée par la consigne n’est jamais traitée.',
    critere_principal: { hggsp_etude_critique: 'CONSIGNE_PROBLEMATISATION' },
    gravite: 'majeure',
    type_impact: 'criterion_score_cap',
    plafond_score: 1.5,
    conditions: 'La consigne comporte plusieurs volets et l’un d’eux est absent de la copie.',
    regle_non_double_sanction:
      'Le volet traité reste valorisé dans les autres critères ; l’oubli n’est compté que dans la compréhension de la consigne.',
    message_pedagogique: 'La consigne comportait plusieurs demandes : traite-les toutes, explicitement.',
  }),
];

export const TAXONOMIE: EntreeTaxonomie[] = [
  ...TAXONOMIE_TRANSVERSALE,
  ...TAXONOMIE_DISSERTATION,
  ...TAXONOMIE_ETUDE_CRITIQUE,
];

/**
 * Erreurs applicables à un exercice : les transversales + les siennes.
 *
 * `taxonomie` permet de passer celle qui vient de la base (un professeur a pu
 * corriger une règle d'impact) plutôt que la constante du fichier. Par défaut,
 * les deux sont identiques : la base est peuplée depuis ce noyau.
 */
export function taxonomiePour(
  exercice: TypeExercice,
  taxonomie: EntreeTaxonomie[] = TAXONOMIE,
): EntreeTaxonomie[] {
  const portee: PorteeErreur = exercice === 'hggsp_dissertation' ? 'dissertation' : 'etude_critique';
  return taxonomie.filter((e) => e.portee === 'transversale' || e.portee === portee);
}

export function chercherTaxonomie(
  code: string,
  taxonomie: EntreeTaxonomie[] = TAXONOMIE,
): EntreeTaxonomie | undefined {
  return taxonomie.find((e) => e.code === code);
}

/** Critère visé par un code, pour un exercice donné. */
export function criterePrincipal(entree: EntreeTaxonomie, exercice: TypeExercice): string | null {
  return entree.critere_principal[exercice] ?? null;
}

/* ================================================================== */
/*  5. Conversion analytique → officielle                             */
/* ================================================================== */

/**
 * Note officielle d'un exercice : l'échelle analytique interne ramenée à
 * l'échelle du BO. Sur 20 → sur 10, donc une division par deux.
 */
export function convertirEnOfficiel(scoreAnalytique: number, grille: Grille): number {
  return arrondi((scoreAnalytique * grille.max_officiel) / grille.max_analytique);
}

/**
 * Note finale d'un bac blanc complet : la SOMME des deux notes officielles.
 * Deux notes sur 20 ne sont jamais additionnées — d'où le passage obligé par
 * `convertirEnOfficiel`.
 */
export function noteFinaleExamen(exercices: { official_score: number; official_max: number }[]): {
  note: number;
  max: number;
} {
  return {
    note: arrondi(exercices.reduce((s, e) => s + e.official_score, 0)),
    max: arrondi(exercices.reduce((s, e) => s + e.official_max, 0)),
  };
}

/** Phrase montrée à l'élève selon le format de l'examen. */
export function phraseNote(resultat: {
  exam_format: FormatExamen;
  exercise_type: TypeExercice;
  analytical_score: number;
  analytical_max: number;
  official_score: number;
  official_max: number;
}): string {
  const n = (v: number) => v.toLocaleString('fr-FR');
  const nom = GRILLES[resultat.exercise_type].libelle;
  if (resultat.exam_format === 'full_exam') {
    return `${nom} : ${n(resultat.official_score)} / ${n(resultat.official_max)} (note officielle de l’exercice ; échelle analytique interne ${n(resultat.analytical_score)} / ${n(resultat.analytical_max)}).`;
  }
  return `Note d’entraînement à ${nom.replace('HGGSP — ', '').toLowerCase()} : ${n(resultat.analytical_score)} / ${n(resultat.analytical_max)}. Équivalent dans une épreuve complète : ${n(resultat.official_score)} / ${n(resultat.official_max)}.`;
}

/* ================================================================== */
/*  6. Normalisation des critères                                     */
/* ================================================================== */

/** Palier atteint par un score : le plus haut palier dont le score est atteint. */
export function niveauPour(critere: Critere, score: number): Palier {
  const tries = [...critere.paliers].sort((a, b) => a.points - b.points);
  let atteint = tries[0];
  for (const p of tries) {
    if (score + 0.0001 >= p.points) atteint = p;
  }
  return atteint;
}

/** Score maximal autorisé par un plafond de NIVEAU. */
export function plafondDuNiveau(critere: Critere, niveau: NiveauCritere): number | null {
  const palier = critere.paliers.find((p) => p.niveau === niveau);
  return palier ? palier.points : null;
}

/**
 * Normalise les critères rendus par le modèle contre la grille.
 *
 * La grille fait foi : un critère absent de la réponse existe quand même (à 0,
 * avec relecture humaine), un critère inventé est écarté et signalé, un score
 * hors bornes est ramené, un score hors pas de 0,25 est arrondi au quart.
 */
export function normaliserCriteres(
  grille: Grille,
  sortie: CritereIA[],
): { criteres: CritereCorrige[]; motifs: MotifRelecture[] } {
  const parCode = new Map(sortie.map((c) => [String(c.criterion_id ?? ''), c]));
  const codesGrille = new Set(grille.criteres.map((c) => c.code));
  const motifs: MotifRelecture[] = [];

  const criteres = grille.criteres.map((def) => {
    const brut = parCode.get(def.code);

    if (!brut) {
      motifs.push({
        code: 'critere_absent',
        criterion_id: def.code,
        message: `Le correcteur n’a rien renvoyé pour « ${def.libelle} » : 0 posé et relecture humaine demandée.`,
      });
      const palier = niveauPour(def, 0);
      return {
        criterion_id: def.code,
        libelle: def.libelle,
        score: 0,
        max_score: def.max_points,
        level: palier.niveau,
        level_label: LIBELLES_NIVEAU[palier.niveau],
        observed_strengths: [],
        observed_weaknesses: [],
        evidence: [],
        feedback: 'Critère absent de la réponse du correcteur.',
        human_review_required: true,
      } satisfies CritereCorrige;
    }

    const demande = Number(brut.score ?? 0);
    let score = Number.isFinite(demande) ? demande : 0;

    if (!estAuPas(score)) {
      const corrige = arrondiQuart(score);
      motifs.push({
        code: 'score_hors_pas',
        criterion_id: def.code,
        message: `Score ${demande} hors du pas de 0,25 pour « ${def.libelle} » : ramené à ${corrige}.`,
      });
      score = corrige;
    }

    const borne = Math.max(0, Math.min(def.max_points, score));
    if (Math.abs(borne - score) > 0.0001) {
      motifs.push({
        code: 'total_incoherent',
        criterion_id: def.code,
        message: `Score ${score} hors barème pour « ${def.libelle} » (maximum ${def.max_points}) : ramené à ${borne}.`,
      });
      score = borne;
    }

    const palier = niveauPour(def, score);
    return {
      criterion_id: def.code,
      libelle: def.libelle,
      score: arrondi(score),
      max_score: def.max_points,
      level: palier.niveau,
      level_label: LIBELLES_NIVEAU[palier.niveau],
      observed_strengths: liste(brut.observed_strengths),
      observed_weaknesses: liste(brut.observed_weaknesses),
      evidence: preuves(brut.evidence),
      feedback: String(brut.feedback ?? ''),
      human_review_required: brut.human_review_required === true,
    } satisfies CritereCorrige;
  });

  for (const c of sortie) {
    const code = String(c.criterion_id ?? '');
    if (code && !codesGrille.has(code)) {
      motifs.push({
        code: 'critere_absent',
        criterion_id: code,
        message: `Le correcteur a noté un critère « ${code} » absent de la grille : il ne compte pas dans la note.`,
      });
    }
  }

  return { criteres, motifs };
}

/* ================================================================== */
/*  7. Erreurs types : plafonds et non-double-sanction                */
/* ================================================================== */

/**
 * Applique les erreurs types aux critères et interdit la double sanction.
 *
 * Deux impacts SEULEMENT touchent mécaniquement le score : le plafond de score
 * et le plafond de niveau. Tous les autres décrivent pourquoi des points n'ont
 * pas été donnés — la note reste fondée sur les réussites observées.
 *
 * Trois garde-fous :
 *   a) un plafond ne s'applique QUE dans le critère principal du code ;
 *   b) un même code ne plafonne qu'une seule fois, même s'il est signalé
 *      plusieurs fois ;
 *   c) une erreur déclarée conséquence d'une autre (`is_consequence`) ne peut
 *      pas plafonner : sa cause est déjà comptée ailleurs.
 */
export function appliquerErreurs(
  grille: Grille,
  criteres: CritereCorrige[],
  evenements: EvenementErreurIA[],
  taxonomie: EntreeTaxonomie[] = TAXONOMIE,
): { criteres: CritereCorrige[]; evenements: EvenementErreur[]; motifs: MotifRelecture[] } {
  const motifs: MotifRelecture[] = [];
  const parCode = new Map(grille.criteres.map((c) => [c.code, c]));
  const parCritere = new Map(criteres.map((c) => [c.criterion_id, c]));
  const plafondsAppliques = new Set<string>();
  const sortie: EvenementErreur[] = [];

  for (const brut of evenements) {
    const code = String(brut.taxonomy_code ?? '');
    const entree = chercherTaxonomie(code, taxonomie);

    if (!entree) {
      motifs.push({
        code: 'code_hors_taxonomie',
        message: `Code d’erreur « ${code} » absent de la taxonomie HGGSP : signalé, sans effet sur la note.`,
      });
      sortie.push({
        taxonomy_code: code,
        libelle: code,
        criterion_id: null,
        impact_type: 'informational_only',
        impact_description: String(brut.impact_description ?? ''),
        score_effect: null,
        criterion_cap: null,
        criterion_level_cap: null,
        indicative_range: null,
        evidence: preuves(brut.evidence),
        confidence: typeof brut.confidence === 'number' ? brut.confidence : null,
        source_error_id: brut.source_error_id ?? null,
        is_consequence: brut.is_consequence === true,
        scored_in_criterion: null,
        already_counted: false,
        scoring_effect: 'Aucun effet : code inconnu de la taxonomie.',
        human_review_required: true,
      });
      continue;
    }

    // La portée doit correspondre à l'exercice : un code de dissertation sur
    // une étude critique désigne un critère qui n'existe pas ici.
    const porteeAttendue: PorteeErreur =
      grille.exercise_type === 'hggsp_dissertation' ? 'dissertation' : 'etude_critique';
    const horsPortee = entree.portee !== 'transversale' && entree.portee !== porteeAttendue;
    if (horsPortee) {
      motifs.push({
        code: 'code_hors_taxonomie',
        message: `Le code ${code} appartient à l’autre exercice (${entree.portee}) : signalé, sans effet sur la note.`,
      });
    }

    // Un code de l'autre exercice ne désigne AUCUN critère ici : il ne peut ni
    // plafonner, ni être rattaché au critère que le modèle propose au hasard.
    const critereVise = horsPortee
      ? null
      : criterePrincipal(entree, grille.exercise_type) ??
        (brut.criterion_id && parCode.has(brut.criterion_id) ? brut.criterion_id : null);
    const critere = critereVise ? parCritere.get(critereVise) ?? null : null;
    const def = critereVise ? parCode.get(critereVise) ?? null : null;

    const estConsequence = brut.is_consequence === true || Boolean(brut.source_error_id);
    let impact = entree.type_impact;
    let effet = '';
    let cap: number | null = null;
    let capNiveau: NiveauCritere | null = null;

    if (impact === 'criterion_score_cap' || impact === 'criterion_level_cap') {
      const dejaFait = plafondsAppliques.has(code);
      if (!critere || !def) {
        effet = 'Aucun plafond appliqué : le critère visé est absent de cette grille.';
        impact = 'informational_only';
        if (!horsPortee) {
          motifs.push({
            code: 'code_hors_taxonomie',
            message: `Le code ${code} vise un critère absent de la grille ${grille.id} : plafond non appliqué.`,
          });
        }
      } else if (estConsequence) {
        // §10 : la cause est déjà comptée, la conséquence ne plafonne pas.
        effet =
          'Plafond NON appliqué : erreur déclarée conséquence d’une autre, déjà comptée dans son critère source.';
        impact = 'informational_only';
        motifs.push({
          code: 'double_sanction_possible',
          criterion_id: critereVise ?? undefined,
          message: `${code} est déclarée conséquence de ${brut.source_error_id ?? 'une autre erreur'} : son plafond n’est pas appliqué une deuxième fois.`,
        });
      } else if (dejaFait) {
        effet = 'Plafond déjà appliqué pour ce code : signalé une deuxième fois, sans nouvel effet.';
        impact = 'informational_only';
      } else {
        const valeur =
          entree.type_impact === 'criterion_score_cap'
            ? entree.plafond_score
            : entree.plafond_niveau
              ? plafondDuNiveau(def, entree.plafond_niveau)
              : null;

        if (valeur === null) {
          effet = 'Plafond non applicable : valeur absente de la taxonomie.';
          impact = 'informational_only';
        } else if (critere.score > valeur + 0.0001) {
          const avant = critere.score;
          critere.score_avant_plafond = avant;
          critere.score = arrondi(valeur);
          critere.plafonne_par = [...(critere.plafonne_par ?? []), code];
          const palier = niveauPour(def, critere.score);
          critere.level = palier.niveau;
          critere.level_label = LIBELLES_NIVEAU[palier.niveau];
          effet = `Score du critère ramené de ${avant} à ${critere.score} (plafond ${code}).`;
          plafondsAppliques.add(code);
          if (entree.type_impact === 'criterion_score_cap') cap = arrondi(valeur);
          else capNiveau = entree.plafond_niveau;
        } else {
          effet = `Plafond ${valeur} non atteint : le score observé (${critere.score}) est déjà en dessous.`;
          plafondsAppliques.add(code);
          if (entree.type_impact === 'criterion_score_cap') cap = arrondi(valeur);
          else capNiveau = entree.plafond_niveau;
        }
      }
    } else if (impact === 'evidence_not_rewarded') {
      effet =
        'Aucun retrait automatique : l’élément est présent mais ne produit pas les points attendus, ce que le score du critère traduit déjà.';
    } else if (impact === 'contextual_range') {
      effet = `Fourchette indicative de ${entree.impact_min ?? 0} à ${entree.impact_max ?? 0} point(s), déjà prise en compte dans le score du critère. Aucun retrait supplémentaire.`;
    } else if (impact === 'human_review_required') {
      effet = 'Aucune pénalité automatique : la copie part en relecture humaine.';
    } else {
      effet = 'Signalée à l’élève, sans effet sur la note.';
    }

    // Le modèle n'a pas le droit de retrancher des points de sa propre
    // initiative : la note vient des critères, jamais d'un score_effect.
    if (typeof brut.score_effect === 'number' && brut.score_effect !== 0) {
      motifs.push({
        code: 'double_sanction_possible',
        criterion_id: critereVise ?? undefined,
        message: `${code} annonce un retrait direct de ${brut.score_effect} point(s) : ignoré, la note vient des scores de critères.`,
      });
    }

    sortie.push({
      taxonomy_code: code,
      libelle: entree.libelle,
      criterion_id: critereVise,
      impact_type: impact,
      impact_description: String(brut.impact_description ?? entree.description),
      score_effect: null,
      criterion_cap: cap,
      criterion_level_cap: capNiveau,
      indicative_range:
        entree.type_impact === 'contextual_range' && entree.impact_max !== null
          ? { min: entree.impact_min ?? 0, max: entree.impact_max }
          : null,
      evidence: preuves(brut.evidence),
      confidence: typeof brut.confidence === 'number' ? brut.confidence : null,
      source_error_id: brut.source_error_id ?? null,
      is_consequence: estConsequence,
      scored_in_criterion: critereVise,
      already_counted: true,
      scoring_effect: effet,
      human_review_required: brut.human_review_required === true || entree.relecture_humaine,
    });
  }

  motifs.push(...detecterDoublesSanctions(sortie));
  return { criteres, evenements: sortie, motifs };
}

/**
 * Une même faiblesse sanctionnée deux fois ?
 *
 * On regarde deux formes de doublon : le même code qui plafonne deux critères,
 * et deux codes qui plafonnent le même critère sans qu'aucun ne se déclare
 * conséquence de l'autre.
 */
export function detecterDoublesSanctions(evenements: EvenementErreur[]): MotifRelecture[] {
  const motifs: MotifRelecture[] = [];
  const plafonnants = evenements.filter(
    (e) => e.impact_type === 'criterion_score_cap' || e.impact_type === 'criterion_level_cap',
  );

  const parCodeCritere = new Map<string, Set<string>>();
  for (const e of plafonnants) {
    if (!e.criterion_id) continue;
    const s = parCodeCritere.get(e.taxonomy_code) ?? new Set<string>();
    s.add(e.criterion_id);
    parCodeCritere.set(e.taxonomy_code, s);
  }
  for (const [code, criteres] of parCodeCritere) {
    if (criteres.size > 1) {
      motifs.push({
        code: 'double_sanction_possible',
        message: `Le code ${code} plafonne ${criteres.size} critères (${[...criteres].join(', ')}) : une même faiblesse ne se paie qu’une fois.`,
      });
    }
  }

  const parCritere = new Map<string, EvenementErreur[]>();
  for (const e of plafonnants) {
    if (!e.criterion_id) continue;
    const l = parCritere.get(e.criterion_id) ?? [];
    l.push(e);
    parCritere.set(e.criterion_id, l);
  }
  for (const [critere, liste] of parCritere) {
    const independants = liste.filter((e) => !e.is_consequence);
    if (independants.length > 1) {
      motifs.push({
        code: 'double_sanction_possible',
        criterion_id: critere,
        message: `Deux plafonds indépendants sur « ${critere} » (${independants.map((e) => e.taxonomy_code).join(', ')}) : vérifier qu’il s’agit bien de deux faiblesses distinctes.`,
      });
    }
  }

  return motifs;
}

/* ================================================================== */
/*  8. Relecture humaine                                              */
/* ================================================================== */

/** Sous ce seuil, la correction part systématiquement en relecture. */
export const SEUIL_CONFIANCE = 0.85;

/** Écart aux étalons comparables au-delà duquel un humain revoit la note. */
export const ECART_ETALON_MAX = 3;

export function motifsRelectureHumaine(entree: {
  grille: Grille;
  criteres: CritereCorrige[];
  evenements: EvenementErreur[];
  reponse: ReponseIA;
  transcription?: { overall_confidence?: number; requires_human_review?: boolean };
  texteTranscription: string;
  noteAnalytique: number;
  etalonProche?: { libelle: string; note: number } | null;
}): MotifRelecture[] {
  const motifs: MotifRelecture[] = [];
  const { grille, criteres, evenements, reponse } = entree;

  for (const c of criteres) {
    if (c.human_review_required) {
      motifs.push({
        code: 'confiance_insuffisante',
        criterion_id: c.criterion_id,
        message: `Le correcteur demande une vérification sur « ${c.libelle} ».`,
      });
    }
    // Des points donnés sans la moindre citation : rien ne les localise.
    if (c.score > 0 && c.evidence.length === 0) {
      motifs.push({
        code: 'citation_introuvable',
        criterion_id: c.criterion_id,
        message: `${c.score} point(s) attribué(s) sur « ${c.libelle} » sans aucune citation de la copie.`,
      });
    }
    for (const p of c.evidence) {
      if (!citationPresente(p.citation, entree.texteTranscription)) {
        motifs.push({
          code: 'citation_introuvable',
          criterion_id: c.criterion_id,
          message: `Citation introuvable dans la transcription : « ${p.citation.slice(0, 120)} ».`,
        });
      }
    }
  }

  for (const e of evenements) {
    if (e.human_review_required) {
      motifs.push({
        code: e.taxonomy_code === 'HGGSP_TR_12' ? 'transcription_incertaine' : 'erreur_majeure_multi_criteres',
        criterion_id: e.criterion_id ?? undefined,
        message: `${e.taxonomy_code} — ${e.libelle} : vérification humaine demandée.`,
      });
    }
    if (typeof e.confidence === 'number' && e.confidence < 0.6) {
      motifs.push({
        code: 'reference_douteuse',
        criterion_id: e.criterion_id ?? undefined,
        message: `${e.taxonomy_code} signalée avec une certitude de ${e.confidence} : à confirmer par un humain.`,
      });
    }
  }

  // Copie presque entièrement hors sujet : jamais notée automatiquement.
  const horsSujet = evenements.filter((e) => e.taxonomy_code === 'HGGSP_TR_05');
  const analyse = criteres.find(
    (c) => c.criterion_id === 'ANALYSE_PROBLEMATISATION' || c.criterion_id === 'CONSIGNE_PROBLEMATISATION',
  );
  if (horsSujet.length > 0 && analyse && analyse.score <= analyse.max_score * 0.25) {
    motifs.push({
      code: 'copie_presque_hors_sujet',
      message: 'Hors-sujet signalé et analyse du sujet au plus bas : un humain doit confirmer avant de rendre la note.',
    });
  }

  // Production graphique (dissertation) : jamais interprétée au jugé.
  const graphique = reponse.production_graphique;
  if (grille.exercise_type === 'hggsp_dissertation' && graphique?.presente && graphique.interpretable === false) {
    motifs.push({
      code: 'production_graphique_non_interpretable',
      message: 'Une production graphique est présente mais n’a pas pu être interprétée : relecture humaine.',
    });
  }

  // Plan original que la grille ne prévoit pas : on ne le sanctionne pas seul.
  if (reponse.human_review_required === true) {
    for (const raison of liste(reponse.human_review_reasons)) {
      motifs.push({ code: 'plan_original_non_prevu', message: raison });
    }
    if (!liste(reponse.human_review_reasons).length) {
      motifs.push({ code: 'confiance_insuffisante', message: 'Le correcteur demande une relecture humaine.' });
    }
  }

  const confiance = typeof reponse.confidence === 'number' ? reponse.confidence : undefined;
  if (typeof confiance === 'number' && confiance < SEUIL_CONFIANCE) {
    motifs.push({
      code: 'confiance_insuffisante',
      message: `Confiance de correction ${confiance} sous le seuil de ${SEUIL_CONFIANCE}.`,
    });
  }

  const conf = entree.transcription?.overall_confidence;
  if (typeof conf === 'number' && conf < SEUIL_CONFIANCE) {
    motifs.push({
      code: 'transcription_incertaine',
      message: `Confiance de transcription ${conf} sous le seuil de ${SEUIL_CONFIANCE}. Un doute de lecture n’est jamais une erreur de l’élève.`,
    });
  }
  if (entree.transcription?.requires_human_review === true) {
    motifs.push({
      code: 'transcription_incertaine',
      message: 'La transcription avait déjà demandé une vérification humaine.',
    });
  }

  // Contradiction entre les scores et l'appréciation générale.
  if (contradictionAppreciation(entree.noteAnalytique, grille, reponse.general_feedback ?? '')) {
    motifs.push({
      code: 'contradiction_score_appreciation',
      message: 'L’appréciation générale ne correspond pas au niveau des scores attribués.',
    });
  }

  if (entree.etalonProche && Math.abs(entree.noteAnalytique - entree.etalonProche.note) > ECART_ETALON_MAX) {
    motifs.push({
      code: 'ecart_aux_etalons',
      message: `Note ${entree.noteAnalytique} / ${grille.max_analytique} contre ${entree.etalonProche.note} pour l’étalon comparable « ${entree.etalonProche.libelle} » : écart supérieur à ${ECART_ETALON_MAX} points.`,
    });
  }

  return dedupliquer(motifs);
}

function dedupliquer(motifs: MotifRelecture[]): MotifRelecture[] {
  const vus = new Set<string>();
  const sortie: MotifRelecture[] = [];
  for (const m of motifs) {
    const cle = `${m.code}|${m.criterion_id ?? ''}|${m.message}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(m);
  }
  return sortie;
}

/**
 * L'appréciation dit-elle le contraire des scores ?
 *
 * Contrôle volontairement grossier : on ne cherche que les contradictions
 * franches (une copie sous 25 % du barème décrite comme « excellente », une
 * copie au-dessus de 75 % décrite comme « très insuffisante »).
 */
export function contradictionAppreciation(note: number, grille: Grille, appreciation: string): boolean {
  if (!appreciation.trim()) return false;
  const t = normaliserTexte(appreciation);
  const taux = note / grille.max_analytique;
  const elogieux = /(excellente copie|tres bonne copie|copie remarquable|maitrise remarquable)/.test(t);
  const severe = /(tres insuffisant|copie tres faible|rien n'est recevable|aucune competence)/.test(t);
  if (taux < 0.25 && elogieux) return true;
  if (taux > 0.75 && severe) return true;
  return false;
}

/* ================================================================== */
/*  9. Contrôles de cohérence finaux                                  */
/* ================================================================== */

export function controlesCoherence(entree: {
  grille: Grille;
  criteres: CritereCorrige[];
  evenements: EvenementErreur[];
  noteAnalytique: number;
  noteOfficielle: number;
  strengths: string[];
  priorities: string[];
  appreciation: string;
  texteTranscription: string;
  motifs: MotifRelecture[];
}): ControlesCoherence {
  const details: string[] = [];
  const somme = arrondi(entree.criteres.reduce((s, c) => s + c.score, 0));

  const score_sum_valid = Math.abs(somme - entree.noteAnalytique) < 0.001;
  if (!score_sum_valid) {
    details.push(`La somme des critères vaut ${somme} et la note analytique ${entree.noteAnalytique}.`);
  }

  const attendue = convertirEnOfficiel(entree.noteAnalytique, entree.grille);
  const conversion_valid = Math.abs(attendue - entree.noteOfficielle) < 0.001;
  if (!conversion_valid) {
    details.push(`Conversion incorrecte : ${entree.noteAnalytique} / ${entree.grille.max_analytique} devrait donner ${attendue} / ${entree.grille.max_officiel}.`);
  }

  const step_valid = entree.criteres.every((c) => estAuPas(c.score));
  if (!step_valid) details.push('Un score de critère n’est pas un multiple de 0,25.');

  const no_double_penalty = !entree.motifs.some((m) => m.code === 'double_sanction_possible');
  if (!no_double_penalty) details.push('Une même faiblesse est peut-être comptée deux fois.');

  const citations = entree.criteres.flatMap((c) => c.evidence).concat(entree.evenements.flatMap((e) => e.evidence));
  const introuvables = citations.filter((p) => !citationPresente(p.citation, entree.texteTranscription));
  const evidence_verified = introuvables.length === 0;
  if (!evidence_verified) {
    details.push(`${introuvables.length} citation(s) introuvable(s) dans la transcription.`);
  }

  // Un point fort doit s'appuyer sur un critère réellement réussi ; une
  // priorité doit correspondre à une faiblesse réellement observée.
  const aReussite = entree.criteres.some((c) => c.score >= c.max_score * 0.5);
  const aFaiblesse = entree.criteres.some((c) => c.score < c.max_score * 0.75);
  const forcesSansAppui = entree.strengths.length > 0 && !aReussite && !entree.criteres.some((c) => c.observed_strengths.length > 0);
  const prioritesSansAppui = entree.priorities.length > 0 && !aFaiblesse;
  const appreciationIncoherente = contradictionAppreciation(entree.noteAnalytique, entree.grille, entree.appreciation);
  const feedback_consistent = !forcesSansAppui && !prioritesSansAppui && !appreciationIncoherente;
  if (forcesSansAppui) details.push('Des points forts sont annoncés sans critère réussi ni observation à l’appui.');
  if (prioritesSansAppui) details.push('Des priorités sont annoncées alors qu’aucun critère n’est en dessous de 75 % de son maximum.');
  if (appreciationIncoherente) details.push('L’appréciation générale contredit le niveau des scores.');

  const taxonomy_valid = !entree.motifs.some((m) => m.code === 'code_hors_taxonomie');
  if (!taxonomy_valid) details.push('Un code d’erreur hors taxonomie a été signalé.');

  return {
    score_sum_valid,
    conversion_valid,
    step_valid,
    no_double_penalty,
    evidence_verified,
    feedback_consistent,
    taxonomy_valid,
    details,
  };
}

/* ================================================================== */
/*  10. Assemblage du résultat d'un exercice                          */
/* ================================================================== */

/** Niveau global de la copie, déduit du taux de réussite analytique. */
export function niveauGlobal(note: number, max: number): NiveauCritere {
  const taux = max > 0 ? note / max : 0;
  if (taux >= 0.85) return 'tres_satisfaisant';
  if (taux >= 0.7) return 'satisfaisant';
  if (taux >= 0.5) return 'moyen';
  if (taux >= 0.3) return 'fragile';
  if (taux > 0) return 'insuffisant';
  return 'nul';
}

export function construireResultatExercice(entree: {
  examId: string | null;
  examFormat: FormatExamen;
  grille: Grille;
  reponse: ReponseIA;
  texteTranscription: string;
  transcription?: { overall_confidence?: number; requires_human_review?: boolean };
  etalonProche?: { libelle: string; note: number } | null;
  statutGrille: string;
  grilleVerrouillee: boolean;
  etalonsCompares: number;
  taxonomie?: EntreeTaxonomie[];
}): ResultatExercice {
  const { grille, reponse } = entree;

  const { criteres, motifs: motifsCriteres } = normaliserCriteres(grille, reponse.criteria ?? []);
  const {
    criteres: criteresFinaux,
    evenements,
    motifs: motifsErreurs,
  } = appliquerErreurs(grille, criteres, reponse.error_events ?? [], entree.taxonomie ?? TAXONOMIE);

  const analytique = arrondi(criteresFinaux.reduce((s, c) => s + c.score, 0));
  const officiel = convertirEnOfficiel(analytique, grille);

  const motifsRelecture = motifsRelectureHumaine({
    grille,
    criteres: criteresFinaux,
    evenements,
    reponse,
    transcription: entree.transcription,
    texteTranscription: entree.texteTranscription,
    noteAnalytique: analytique,
    etalonProche: entree.etalonProche ?? null,
  });

  const motifs = dedupliquer([...motifsCriteres, ...motifsErreurs, ...motifsRelecture]);

  const strengths = liste(reponse.strengths);
  const priorities = liste(reponse.priorities);
  const controles = controlesCoherence({
    grille,
    criteres: criteresFinaux,
    evenements,
    noteAnalytique: analytique,
    noteOfficielle: officiel,
    strengths,
    priorities,
    appreciation: String(reponse.general_feedback ?? ''),
    texteTranscription: entree.texteTranscription,
    motifs,
  });

  // Un contrôle qui tombe est un motif de relecture : le détail, la note et
  // l'appréciation ne doivent jamais partir en désaccord chez l'élève.
  const motifsControles: MotifRelecture[] = [];
  if (!controles.score_sum_valid || !controles.conversion_valid || !controles.step_valid) {
    motifsControles.push({ code: 'total_incoherent', message: controles.details.join(' ') });
  }
  if (!controles.feedback_consistent) {
    motifsControles.push({
      code: 'contradiction_score_appreciation',
      message: 'Appréciation, points forts ou priorités en désaccord avec les scores.',
    });
  }

  const tous = dedupliquer([...motifs, ...motifsControles]);

  return {
    exam_id: entree.examId,
    exam_format: entree.examFormat,
    rubric_id: grille.id,
    rubric_version: grille.version,
    exercise_type: grille.exercise_type,
    moteur: 'criteres_rediges',
    analytical_score: analytique,
    analytical_max: grille.max_analytique,
    official_score: officiel,
    official_max: grille.max_officiel,
    training_score: entree.examFormat === 'full_exam' ? null : analytique,
    level_global: niveauGlobal(analytique, grille.max_analytique),
    human_review_required: tous.length > 0,
    human_review_reasons: tous,
    criteria: criteresFinaux,
    error_events: evenements,
    strengths,
    priorities,
    general_feedback: String(reponse.general_feedback ?? ''),
    confidence: typeof reponse.confidence === 'number' ? reponse.confidence : null,
    consistency_checks: controles,
    calibration_metadata: {
      rubric_status: entree.statutGrille,
      rubric_locked: entree.grilleVerrouillee,
      etalons_compares: entree.etalonsCompares,
      note_provisoire: !entree.grilleVerrouillee,
    },
  };
}

/* ================================================================== */
/*  11. Statuts de grille et verrouillage                             */
/* ================================================================== */

export const STATUTS_GRILLE = [
  'draft',
  'calibrating',
  'ready_for_validation',
  'validated',
  'locked',
  'in_use',
  'archived',
] as const;

export type StatutGrille = (typeof STATUTS_GRILLE)[number];

export const LIBELLES_STATUT_GRILLE: Record<StatutGrille, string> = {
  draft: 'Brouillon',
  calibrating: 'En calibration',
  ready_for_validation: 'Prête à valider',
  validated: 'Validée par un professeur',
  locked: 'Verrouillée',
  in_use: 'En service',
  archived: 'Archivée',
};

/** Une grille verrouillée ne se modifie plus : on en crée une nouvelle version. */
export const STATUTS_VERROUILLES: StatutGrille[] = ['locked', 'in_use', 'archived'];

export function grilleModifiable(statut: string): boolean {
  return !STATUTS_VERROUILLES.includes(statut as StatutGrille);
}

/* ================================================================== */
/*  12. Copies étalons attendues pour une calibration complète        */
/* ================================================================== */

export const NIVEAUX_ETALONS = [
  { code: 'tres_faible', libelle: 'Très faible', plage: '1 à 5 / 20' },
  { code: 'fragile', libelle: 'Fragile', plage: '6 à 8 / 20' },
  { code: 'moyen', libelle: 'Moyenne', plage: '9 à 12 / 20' },
  { code: 'assez_bon', libelle: 'Assez bonne', plage: '13 à 15 / 20' },
  { code: 'tres_bon', libelle: 'Très bonne', plage: '16 à 18 / 20' },
  { code: 'excellent', libelle: 'Excellente', plage: '19 à 20 / 20' },
] as const;

/** Seuils où une erreur de calibration change une décision pédagogique. */
export const FRONTIERES_ETALONS = ['7–8 / 20', '9–10 / 20', '11–12 / 20', '15–16 / 20'];

export function couvertureEtalons(niveauxPresents: (string | null)[]): {
  couverts: string[];
  manquants: { code: string; libelle: string; plage: string }[];
} {
  const presents = new Set(niveauxPresents.filter(Boolean) as string[]);
  return {
    couverts: [...presents],
    manquants: NIVEAUX_ETALONS.filter((n) => !presents.has(n.code)).map((n) => ({ ...n })),
  };
}

/* ================================================================== */
/*  13. Consigne système remise au correcteur                         */
/* ================================================================== */

/**
 * Le prompt système est CONSTRUIT à partir de la grille : impossible qu'il
 * décrive un barème différent de celui qui sera appliqué au résultat.
 */
export function consigneSysteme(
  grille: Grille,
  options: { deuxDocuments?: boolean; taxonomie?: EntreeTaxonomie[] } = {},
): string {
  const taxo = taxonomiePour(grille.exercise_type, options.taxonomie ?? TAXONOMIE);
  const lignes: string[] = [];

  lignes.push(
    `Tu es correcteur d'HGGSP en terminale générale. Tu corriges ${grille.exercise_type === 'hggsp_dissertation' ? 'une dissertation' : 'une étude critique de document(s)'} d'après la grille ci-dessous, et rien d'autre.`,
  );
  lignes.push(grille.principe);
  lignes.push('');
  lignes.push('ÉCHELLE');
  lignes.push(
    `Tu notes sur l'échelle ANALYTIQUE de ${grille.max_analytique} points, critère par critère, au pas de 0,25 point. La conversion vers la note officielle sur ${grille.max_officiel} est faite APRÈS toi, automatiquement : ne la fais pas, ne la mentionne pas dans les scores.`,
  );
  lignes.push('');
  lignes.push('COMMENT ATTRIBUER UN SCORE');
  lignes.push(
    "Pour chaque critère : identifie le palier dont le descripteur correspond réellement à la copie, puis ajuste au quart de point à l'intérieur de ce palier. La note est la somme des réussites observées ; tu ne pars JAMAIS du maximum pour retrancher des erreurs.",
  );
  lignes.push(
    'Chaque score est justifié par au moins une citation EXACTE de la transcription. Une citation que tu ne peux pas recopier mot à mot depuis la copie ne doit pas être écrite.',
  );
  lignes.push('');
  lignes.push('GRILLE');
  for (const c of grille.criteres) {
    lignes.push(`• ${c.code} — ${c.libelle} (max ${c.max_points})`);
    lignes.push(`  À évaluer : ${c.evaluer.join(' ; ')}.`);
    for (const p of c.paliers) {
      lignes.push(`  ${p.points} — ${p.description}`);
    }
  }
  lignes.push('');
  lignes.push('ERREURS TYPES');
  lignes.push(
    "Tu signales les erreurs observées avec les codes ci-dessous, et uniquement ceux-là. Une erreur n'est PAS une soustraction de points : elle explique pourquoi un niveau supérieur n'est pas atteint. Seuls les codes marqués « plafond » agissent mécaniquement sur le score, et le système les applique lui-même.",
  );
  for (const e of taxo) {
    const impact =
      e.type_impact === 'criterion_score_cap'
        ? `plafond du critère à ${e.plafond_score}`
        : e.type_impact === 'criterion_level_cap'
          ? `plafond au niveau « ${e.plafond_niveau} »`
          : e.type_impact === 'contextual_range'
            ? `fourchette indicative ${e.impact_min}–${e.impact_max}`
            : LIBELLES_IMPACT[e.type_impact];
    const critere = criterePrincipal(e, grille.exercise_type);
    lignes.push(
      `• ${e.code} — ${e.libelle} : ${e.description} [critère : ${critere ?? 'aucun'} ; impact : ${impact}]`,
    );
    if (e.conditions) lignes.push(`   Conditions : ${e.conditions}`);
  }
  lignes.push('');
  lignes.push('NON-DOUBLE-SANCTION');
  lignes.push(
    "Pour chaque faiblesse, tu identifies l'erreur SOURCE et ses conséquences. Une conséquence porte source_error_id et is_consequence=true : elle est décrite, jamais comptée une seconde fois. Exemple : l'absence de problématique est comptée dans l'analyse du sujet ; l'argumentation reste évaluée sur son organisation réellement observable.",
  );
  lignes.push('');
  lignes.push('RELECTURE HUMAINE');
  lignes.push(
    "Tu demandes une relecture humaine (human_review_required) si : la transcription est incertaine, un passage est illisible, tu soupçonnes un contresens sans certitude, une référence paraît fausse mais pourrait être une autre formulation recevable, le plan est original et sort des exemples de la grille, la copie est presque entièrement hors sujet, une production graphique ne peut pas être interprétée, une erreur majeure pourrait toucher plusieurs critères, ou ta confiance globale est insuffisante. Un doute de transcription n'est JAMAIS une erreur de l'élève.",
  );

  if (grille.exercise_type === 'hggsp_dissertation') {
    lignes.push('');
    lignes.push('PRODUCTION GRAPHIQUE (facultative)');
    lignes.push(
      "Depuis la session 2026, une illustration pertinente (croquis, schéma) peut valoriser « Construction et argumentation » ou « Exemples précis et exploités », sans dépasser le maximum du critère. Son absence ne pénalise jamais. Une production décorative ou sans rapport n'est pas valorisée. Si tu ne peux pas l'interpréter, demande une relecture humaine. Renseigne production_graphique.",
    );
  }

  if (grille.exercise_type === 'hggsp_etude_critique') {
    lignes.push('');
    lignes.push('PRÉLEVER, EXPLIQUER, CRITIQUER');
    lignes.push(
      "Ces trois gestes sont notés dans TROIS critères distincts. Une copie qui prélève correctement mais n'explique ni ne critique garde ses points de prélèvement : tu ne mets jamais presque zéro à toute la partie documentaire au motif que la critique manque.",
    );
    if (options.deuxDocuments) {
      lignes.push('');
      lignes.push('SUJET À DEUX DOCUMENTS');
      lignes.push(
        "Vérifie que les DEUX documents sont réellement exploités. Valorise leur confrontation : convergences, divergences, comparaison de leur nature, auteur, date, contexte et intention, complémentarité éventuelle. N'accepte pas deux analyses complètement séparées quand une confrontation est attendue, et n'impose pas artificiellement une opposition si les documents se complètent. Renseigne documents_exploites.",
      );
    }
  }

  return lignes.join('\n');
}

/** Schéma JSON attendu du modèle (utilisé tel quel par l'Edge Function). */
export function schemaSortie(): Record<string, unknown> {
  const preuve = {
    type: 'object',
    properties: {
      page: { type: 'integer' },
      citation: { type: 'string' },
      explication: { type: 'string' },
    },
    required: ['page', 'citation', 'explication'],
    additionalProperties: false,
  };

  return {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion_id: { type: 'string' },
            score: { type: 'number' },
            observed_strengths: { type: 'array', items: { type: 'string' } },
            observed_weaknesses: { type: 'array', items: { type: 'string' } },
            evidence: { type: 'array', items: preuve },
            feedback: { type: 'string' },
            human_review_required: { type: 'boolean' },
          },
          required: [
            'criterion_id',
            'score',
            'observed_strengths',
            'observed_weaknesses',
            'evidence',
            'feedback',
            'human_review_required',
          ],
          additionalProperties: false,
        },
      },
      error_events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            taxonomy_code: { type: 'string' },
            criterion_id: { type: 'string' },
            impact_description: { type: 'string' },
            evidence: { type: 'array', items: preuve },
            confidence: { type: 'number' },
            source_error_id: { type: ['string', 'null'] },
            is_consequence: { type: 'boolean' },
            already_counted: { type: 'boolean' },
            human_review_required: { type: 'boolean' },
          },
          required: [
            'taxonomy_code',
            'criterion_id',
            'impact_description',
            'evidence',
            'confidence',
            'source_error_id',
            'is_consequence',
            'already_counted',
            'human_review_required',
          ],
          additionalProperties: false,
        },
      },
      strengths: { type: 'array', items: { type: 'string' } },
      priorities: { type: 'array', items: { type: 'string' } },
      general_feedback: { type: 'string' },
      confidence: { type: 'number' },
      human_review_required: { type: 'boolean' },
      human_review_reasons: { type: 'array', items: { type: 'string' } },
      production_graphique: {
        type: 'object',
        properties: {
          presente: { type: 'boolean' },
          pertinente: { type: 'boolean' },
          interpretable: { type: 'boolean' },
          commentaire: { type: 'string' },
        },
        required: ['presente', 'pertinente', 'interpretable', 'commentaire'],
        additionalProperties: false,
      },
      documents_exploites: { type: 'integer' },
      benchmark_comparison: {
        type: 'object',
        properties: {
          closest_etalon_id: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['closest_etalon_id', 'explanation'],
        additionalProperties: false,
      },
    },
    required: [
      'criteria',
      'error_events',
      'strengths',
      'priorities',
      'general_feedback',
      'confidence',
      'human_review_required',
      'human_review_reasons',
      'production_graphique',
      'documents_exploites',
      'benchmark_comparison',
    ],
    additionalProperties: false,
  };
}
