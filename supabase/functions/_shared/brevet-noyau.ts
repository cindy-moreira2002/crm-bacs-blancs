/**
 * NOYAU COMMUN DU BREVET (DNB, serie generale).
 *
 * Fichier volontairement PUR : aucun import, aucun acces reseau, aucune
 * dependance a Deno ni a Node. Il est utilise par quatre mondes a la fois —
 *   • l'Edge Function `correct-brevet-francais` (Deno) ;
 *   • l'Edge Function `correct-brevet-maths` (Deno) ;
 *   • l'application Next.js, via `src/lib/brevetNoyau.ts` qui le re-exporte ;
 *   • les tests hors ligne (`npm run test:brevet`).
 *
 * CE QU'IL CONTIENT, ET CE QU'IL NE CONTIENT PAS
 * ----------------------------------------------
 * Il contient ce qui est vrai des DEUX matieres du brevet et d'elles seules :
 * l'identification de l'examen, l'ordre de priorite des sources de decision,
 * la qualite documentaire, les declencheurs de validation humaine, la
 * conversion d'echelle et la mise en forme du rapport eleve.
 *
 * Il ne contient AUCUNE regle pedagogique de francais ni de mathematiques.
 * Ces regles vivent dans `brevet-francais-noyau.ts` et
 * `brevet-maths-noyau.ts`, qui ne se connaissent pas l'un l'autre. C'est
 * volontaire : rien ne doit permettre a une regle de francais d'atteindre une
 * copie de mathematiques, ni l'inverse.
 *
 * Il ne contient AUCUNE regle du baccalaureat non plus. Le moteur du bac
 * (`bareme-noyau.ts`) reste intact et n'est jamais importe ici : une copie de
 * brevet ne peut pas etre corrigee avec une grille de bac, et reciproquement.
 *
 * LES REGLES OFFICIELLES DE REFERENCE
 * -----------------------------------
 * Source primaire : note de service NOR MENE2515977N, « Modalites
 * d'attribution du diplome national du brevet a compter de la session 2026 »,
 * Bulletin officiel n° 33 du 4 septembre 2025. Consultee le 8 aout 2026.
 * Voir `SOURCES_OFFICIELLES_DNB.md` pour la trace complete de chaque regle.
 * Les valeurs chiffrees sont reprises dans `REGLES_OFFICIELLES_DNB` ci-dessous
 * avec, pour chacune, son statut : `officiel`, `officiel_par_deduction` ou
 * `a_confirmer`. Aucune hypothese n'est presentee comme une regle officielle.
 */

/* ================================================================== */
/*  1. Identification de l'examen                                     */
/* ================================================================== */

/** Les deux matieres du brevet gerees par ce dispositif. Rien d'autre. */
export type MatiereBrevet = 'brevet_francais' | 'brevet_mathematiques';

export const MATIERES_BREVET: MatiereBrevet[] = ['brevet_francais', 'brevet_mathematiques'];

export const LIBELLES_MATIERES_BREVET: Record<MatiereBrevet, string> = {
  brevet_francais: 'Français — Brevet',
  brevet_mathematiques: 'Mathématiques — Brevet',
};

/** `DNB` ici, `BAC` ailleurs. La valeur voyage jusque dans le resultat. */
export type NiveauExamen = 'BAC' | 'DNB';

export type SerieBrevet = 'generale' | 'professionnelle';

/** Session de reference initiale, configurable examen par examen. */
export const SESSION_REFERENCE = 2027;

export type IdentiteExamen = {
  exam: NiveauExamen;
  series: SerieBrevet;
  session: number;
  subject: MatiereBrevet;
};

export function estMatiereBrevet(matiere: string | null | undefined): matiere is MatiereBrevet {
  return matiere === 'brevet_francais' || matiere === 'brevet_mathematiques';
}

/**
 * Le garde-fou central du cahier des charges : « aucune copie du brevet ne
 * doit pouvoir etre corrigee accidentellement avec une grille du bac ».
 *
 * Il est rejoue a trois endroits — ici (moteur), dans les Edge Functions
 * avant tout appel a Claude, et en base par une contrainte sur `exams`.
 */
export function verifierAppariementMatiere(entree: {
  matiereAttendue: MatiereBrevet;
  matiereExamen: string | null | undefined;
  niveauExamen: string | null | undefined;
  moteurCorrection: string | null | undefined;
}): { ok: true } | { ok: false; raison: string } {
  if (entree.niveauExamen !== 'DNB') {
    return {
      ok: false,
      raison:
        `Cet examen est de niveau « ${entree.niveauExamen ?? 'inconnu'} », pas DNB : ` +
        'un moteur du brevet ne corrige pas une copie du baccalauréat.',
    };
  }
  if (entree.matiereExamen !== entree.matiereAttendue) {
    return {
      ok: false,
      raison:
        `Cet examen porte la matière « ${entree.matiereExamen ?? 'inconnue'} » alors que ce moteur ` +
        `ne corrige que « ${entree.matiereAttendue} ». Correction refusée.`,
    };
  }
  if (entree.moteurCorrection !== entree.matiereAttendue) {
    return {
      ok: false,
      raison:
        `La copie se réclame du moteur « ${entree.moteurCorrection ?? 'inconnu'} » : ` +
        `elle ne relève pas de « ${entree.matiereAttendue} ».`,
    };
  }
  return { ok: true };
}

/* ================================================================== */
/*  2. Les regles officielles, avec leur statut                       */
/* ================================================================== */

export type StatutRegle = 'officiel' | 'officiel_par_deduction' | 'complementaire' | 'a_confirmer';

export type RegleOfficielle = {
  code: string;
  matiere: MatiereBrevet | 'commun';
  libelle: string;
  valeur: number | string | null;
  statut: StatutRegle;
  source: string;
  /** Ce qui, dans la source, porte l'information. Vide si `a_confirmer`. */
  citation: string;
};

/**
 * Les regles chiffrees appliquees par les deux moteurs.
 *
 * Rien ici n'est invente : chaque ligne `officiel` est adossee a une citation
 * de la note de service. Une ligne `a_confirmer` n'a AUCUN effet sur la note —
 * elle sert a documenter ce qui reste a verifier.
 */
export const REGLES_OFFICIELLES_DNB: RegleOfficielle[] = [
  {
    code: 'FR_DUREE',
    matiere: 'brevet_francais',
    libelle: "Durée de l'épreuve de français",
    valeur: '3 heures',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: "Durée de l'épreuve : 3 heures",
  },
  {
    code: 'FR_TOTAL',
    matiere: 'brevet_francais',
    libelle: 'Barème total du français, ramené sur 20',
    valeur: 100,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      "Les exercices sont assortis d'un barème totalisant 100 points, indiqué dans le sujet. " +
      'La note obtenue est ensuite ramenée sur 20 pour le calcul de la moyenne.',
  },
  {
    code: 'FR_TEXTE',
    matiere: 'brevet_francais',
    libelle: 'Travail sur le texte littéraire et, éventuellement, sur une image',
    valeur: 50,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      'Travail sur le texte littéraire et, éventuellement, sur une image (50 points — 1 heure et 10 minutes)',
  },
  {
    code: 'FR_DICTEE',
    matiere: 'brevet_francais',
    libelle: 'Dictée',
    valeur: 10,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: 'Dictée (10 points — 20 minutes)',
  },
  {
    code: 'FR_DICTEE_LONGUEUR',
    matiere: 'brevet_francais',
    libelle: 'Longueur du texte dicté, série générale',
    valeur: '600 signes environ',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      "Un texte de 600 signes environ, en lien avec l'œuvre, est dicté aux candidats de la série générale.",
  },
  {
    code: 'FR_REDACTION',
    matiere: 'brevet_francais',
    libelle: 'Rédaction',
    valeur: 40,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: 'Rédaction (40 points — 1 heure et 30 minutes)',
  },
  {
    code: 'FR_REDACTION_CHOIX',
    matiere: 'brevet_francais',
    libelle: 'Deux sujets de rédaction au choix',
    valeur: 'réflexion | imagination',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      "Deux sujets au choix sont proposés aux candidats : un sujet de réflexion et un sujet d'imagination.",
  },
  {
    code: 'FR_REECRITURE',
    matiere: 'brevet_francais',
    libelle: 'Réécriture : barème spécifique aux erreurs de pure copie',
    valeur: '5 ou 10 formes modifiées',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      "…de manière à obtenir cinq ou dix formes modifiées dans la copie de l'élève. Les erreurs de " +
      'pure copie ne portant pas sur les formes à modifier sont prises en compte dans ' +
      "l'évaluation selon un barème spécifique.",
  },
  {
    code: 'MA_DUREE',
    matiere: 'brevet_mathematiques',
    libelle: "Durée de l'épreuve de mathématiques",
    valeur: '2 heures',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: "Durée de l'épreuve : 2 heures",
  },
  {
    code: 'MA_TOTAL',
    matiere: 'brevet_mathematiques',
    libelle: 'Note totale de mathématiques',
    valeur: 20,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: "L'épreuve est notée sur 20.",
  },
  {
    code: 'MA_AUTOMATISMES',
    matiere: 'brevet_mathematiques',
    libelle: 'Partie 1 — Automatismes',
    valeur: 6,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: 'Partie 1 — Automatismes : 6 points — 20 minutes',
  },
  {
    code: 'MA_RAISONNEMENT',
    matiere: 'brevet_mathematiques',
    libelle: 'Partie 2 — Raisonnement et résolution de problèmes',
    valeur: 14,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      'Partie 2 — Raisonnement et résolution de problèmes : 14 points — 1 heure et 40 minutes.',
  },
  {
    code: 'MA_REDACTION',
    matiere: 'brevet_mathematiques',
    libelle: 'Qualité de la rédaction mathématique',
    valeur: 2,
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      "L'évaluation doit prendre en compte la clarté et la précision des raisonnements ainsi que, " +
      'plus largement, la qualité de la rédaction qui sera évaluée sur 2 points.',
  },
  {
    code: 'MA_REDACTION_INCLUSE',
    matiere: 'brevet_mathematiques',
    libelle: 'Les 2 points de rédaction sont compris dans les 14 de la partie 2',
    valeur: 'incluse',
    statut: 'officiel_par_deduction',
    source: 'NOR MENE2515977N — déduction arithmétique : 6 + 14 = 20',
    citation:
      "La note de service place la phrase sur les 2 points dans la partie 2 et fixe le total de " +
      "l'épreuve à 20 pour 6 + 14 : les 2 points ne peuvent donc pas s'ajouter au-dessus des 14.",
  },
  {
    code: 'MA_CALCULATRICE',
    matiere: 'brevet_mathematiques',
    libelle: 'Calculatrice',
    valeur: 'autorisée en partie 2 seulement',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: "La calculatrice n'est autorisée que sur la partie 2.",
  },
  {
    code: 'MA_ESSAIS',
    matiere: 'brevet_mathematiques',
    libelle: 'Prise en compte des essais et démarches non aboutis',
    valeur: 'obligatoire',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation: 'Doivent être pris en compte les essais et les démarches engagées, même non abouties.',
  },
  {
    code: 'MA_JUSTIFICATION',
    matiere: 'brevet_mathematiques',
    libelle: 'Justification des réponses',
    valeur: 'sauf indication contraire du sujet',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      'Le sujet précise que toutes les réponses doivent être justifiées sauf si une indication ' +
      'contraire est donnée.',
  },
  {
    code: 'PROGRAMME_2027',
    matiere: 'commun',
    libelle: 'Programme de référence à partir de la session 2027',
    valeur: 'programme de la classe de troisième',
    statut: 'officiel',
    source: 'NOR MENE2515977N — BO n° 33 du 4 septembre 2025',
    citation:
      '…déclinées par le programme de français de cycle 4 (ou de troisième à partir de la session 2027)',
  },
  {
    code: 'PROGRAMME_NOUVEAU_CYCLE4',
    matiere: 'commun',
    libelle:
      "Les nouveaux programmes de cycle 4 (arrêté du 18 février 2026) n'atteindraient la 3e qu'à la rentrée 2028",
    valeur: null,
    statut: 'a_confirmer',
    source: 'BO n° 10 du 5 mars 2026 — page non consultable automatiquement (HTTP 403)',
    citation: '',
  },
];

export function reglesDeLaMatiere(matiere: MatiereBrevet): RegleOfficielle[] {
  return REGLES_OFFICIELLES_DNB.filter((r) => r.matiere === matiere || r.matiere === 'commun');
}

/* ================================================================== */
/*  3. Provenance de chaque decision                                  */
/* ================================================================== */

/**
 * D'ou vient la decision qui a attribue (ou refuse) des points.
 *
 * L'ordre du tableau EST l'ordre de priorite du cahier des charges : le
 * barème du sujet passe avant le corrigé officiel, qui passe avant les
 * consignes de l'administratrice, qui passent avant les règles générales du
 * DNB, qui passent avant la grille par défaut. `human_override` est hors
 * classement : une décision humaine gagne toujours.
 */
export const SOURCES_DECISION = [
  'subject_bareme',
  'official_correction',
  'admin_instruction',
  'official_exam_rule',
  'default_rubric',
] as const;

export type SourceDecision = (typeof SOURCES_DECISION)[number] | 'human_override';

export const LIBELLES_SOURCE_DECISION: Record<SourceDecision, string> = {
  subject_bareme: 'Barème détaillé du sujet',
  official_correction: 'Corrigé officiel ou validé par l’administratrice',
  admin_instruction: 'Consigne spécifique renseignée par l’administratrice',
  official_exam_rule: 'Règle officielle générale du DNB',
  default_rubric: 'Grille pédagogique par défaut',
  human_override: 'Décision humaine',
};

/** Rang de priorité : 0 = le plus fort. `human_override` vaut -1. */
export function prioriteSource(source: SourceDecision): number {
  if (source === 'human_override') return -1;
  const i = (SOURCES_DECISION as readonly string[]).indexOf(source);
  return i === -1 ? SOURCES_DECISION.length : i;
}

/**
 * La source la plus prioritaire réellement disponible pour cet examen.
 *
 * Sert de garde-fou : si le sujet porte un barème détaillé, une correction
 * qui se réclame de `default_rubric` est signalée — le moteur a inventé une
 * règle générique alors qu'il en avait une précise sous la main.
 */
export function sourceAttendue(disponible: {
  baremeDuSujet: boolean;
  corrigeOfficiel: boolean;
  consignesAdmin: boolean;
}): SourceDecision {
  if (disponible.baremeDuSujet) return 'subject_bareme';
  if (disponible.corrigeOfficiel) return 'official_correction';
  if (disponible.consignesAdmin) return 'admin_instruction';
  return 'official_exam_rule';
}

/** Statut épistémique d'une décision, exigé par le §4 du cahier des charges. */
export type NatureDecision = 'prevue_par_bareme' | 'interpretation_raisonnable' | 'a_valider';

export const LIBELLES_NATURE_DECISION: Record<NatureDecision, string> = {
  prevue_par_bareme: 'Explicitement prévu par le barème',
  interpretation_raisonnable: 'Interprétation raisonnable, non écrite au barème',
  a_valider: 'Nécessite une validation humaine',
};

export type Decision = {
  /** Où porte la décision : clé de question, de critère, d'erreur de dictée… */
  cible: string;
  source: SourceDecision;
  nature: NatureDecision;
  explication: string;
};

/* ================================================================== */
/*  4. Qualite documentaire                                           */
/* ================================================================== */

/**
 * Les anomalies que le traitement doit savoir détecter (§5).
 *
 * `illisible` n'est JAMAIS assimilé à une absence de réponse : les deux codes
 * existent séparément et `illisible` déclenche une validation humaine, quand
 * `non_traite` est une observation ordinaire.
 */
export const ANOMALIES_DOCUMENT = [
  'page_manquante',
  'page_en_double',
  'page_desordonnee',
  'image_floue',
  'texte_illisible',
  'reponse_coupee',
  'reponse_mal_attribuee',
  'copie_blanche',
  'exercice_non_traite',
  'brouillon_present',
  'annotation_etrangere',
  'incoherence_sujet_corrige_bareme',
] as const;

export type CodeAnomalieDocument = (typeof ANOMALIES_DOCUMENT)[number];

export const LIBELLES_ANOMALIE: Record<CodeAnomalieDocument, string> = {
  page_manquante: 'Page manquante',
  page_en_double: 'Page en double',
  page_desordonnee: 'Page dans le mauvais ordre',
  image_floue: 'Image floue',
  texte_illisible: 'Texte illisible',
  reponse_coupee: 'Réponse coupée',
  reponse_mal_attribuee: 'Réponse attribuée à la mauvaise question',
  copie_blanche: 'Copie blanche',
  exercice_non_traite: 'Exercice non traité',
  brouillon_present: 'Présence de brouillon',
  annotation_etrangere: 'Annotation étrangère à la copie',
  incoherence_sujet_corrige_bareme: 'Incohérence entre sujet, corrigé et barème',
};

/**
 * Anomalies qui empêchent de garantir la note tant qu'un humain n'a pas
 * regardé. Une copie blanche, elle, est une observation : elle se note.
 */
export const ANOMALIES_BLOQUANTES: CodeAnomalieDocument[] = [
  'page_manquante',
  'page_desordonnee',
  'reponse_mal_attribuee',
  'incoherence_sujet_corrige_bareme',
];

export type AnomalieDocument = {
  code: CodeAnomalieDocument;
  pages: number[];
  detail: string;
  /** 0 à 1. Sous `SEUIL_CERTITUDE_ANOMALIE`, l'anomalie reste une hypothèse. */
  certitude: number;
};

export type QualiteDocument = {
  statut: 'readable' | 'partially_readable' | 'unreadable';
  missing_pages: number[];
  duplicate_pages: number[];
  uncertain_zones: { page: number; description: string; certitude: number }[];
  anomalies: AnomalieDocument[];
  requires_human_review: boolean;
};

export const SEUIL_CERTITUDE_ANOMALIE = 0.5;

export function synthetiserQualiteDocument(entree: {
  anomalies: AnomalieDocument[];
  zonesIncertaines: { page: number; description: string; certitude: number }[];
  statutPropose?: QualiteDocument['statut'];
}): QualiteDocument {
  const anomalies = entree.anomalies.filter((a) => a.certitude >= SEUIL_CERTITUDE_ANOMALIE);
  const bloquantes = anomalies.filter((a) => ANOMALIES_BLOQUANTES.includes(a.code));
  const illisibles = anomalies.filter(
    (a) => a.code === 'texte_illisible' || a.code === 'image_floue' || a.code === 'reponse_coupee',
  );

  const statut: QualiteDocument['statut'] =
    entree.statutPropose === 'unreadable' || illisibles.length >= 3
      ? 'unreadable'
      : illisibles.length > 0 || entree.zonesIncertaines.length > 0
        ? 'partially_readable'
        : (entree.statutPropose ?? 'readable');

  return {
    statut,
    missing_pages: [
      ...new Set(anomalies.filter((a) => a.code === 'page_manquante').flatMap((a) => a.pages)),
    ].sort((a, b) => a - b),
    duplicate_pages: [
      ...new Set(anomalies.filter((a) => a.code === 'page_en_double').flatMap((a) => a.pages)),
    ].sort((a, b) => a - b),
    uncertain_zones: entree.zonesIncertaines,
    anomalies,
    requires_human_review:
      bloquantes.length > 0 || statut === 'unreadable' || entree.zonesIncertaines.length > 0,
  };
}

/* ================================================================== */
/*  5. Validation humaine                                             */
/* ================================================================== */

/** Les trois degrés exigés par le §16, jamais confondus. */
export type DegreValidation = 'information' | 'recommandee' | 'bloquante';

export const ORDRE_DEGRE: Record<DegreValidation, number> = {
  information: 0,
  recommandee: 1,
  bloquante: 2,
};

/** Les quatorze déclencheurs de validation humaine du cahier des charges. */
export const MOTIFS_VALIDATION = [
  'copie_partiellement_illisible',
  'page_manquante',
  'sujet_redaction_ambigu',
  'reponse_entre_deux_questions',
  'bareme_incomplet',
  'contradiction_bareme_corrige',
  'methode_inhabituelle_possiblement_valide',
  'interpretation_litteraire_defendable',
  'ecart_important_entre_evaluations',
  'confiance_faible',
  'note_proche_du_seuil',
  'total_incoherent',
  'erreur_ocr_impactant_les_points',
  'appariement_sujet_copie_douteux',
] as const;

export type CodeMotifValidation = (typeof MOTIFS_VALIDATION)[number];

/** Degré par défaut de chaque motif. Un motif peut être élevé, jamais abaissé. */
export const DEGRE_PAR_MOTIF: Record<CodeMotifValidation, DegreValidation> = {
  copie_partiellement_illisible: 'bloquante',
  page_manquante: 'bloquante',
  sujet_redaction_ambigu: 'bloquante',
  reponse_entre_deux_questions: 'recommandee',
  bareme_incomplet: 'bloquante',
  contradiction_bareme_corrige: 'bloquante',
  methode_inhabituelle_possiblement_valide: 'recommandee',
  interpretation_litteraire_defendable: 'recommandee',
  ecart_important_entre_evaluations: 'recommandee',
  confiance_faible: 'recommandee',
  note_proche_du_seuil: 'information',
  total_incoherent: 'bloquante',
  erreur_ocr_impactant_les_points: 'bloquante',
  appariement_sujet_copie_douteux: 'bloquante',
};

export type MotifValidation = {
  code: CodeMotifValidation;
  degre: DegreValidation;
  cible?: string;
  message: string;
};

/** Sous ce seuil de confiance, la correction part systématiquement en relecture. */
export const SEUIL_CONFIANCE_BREVET = 0.85;

/** Écart, en points sur 20, au-delà duquel deux évaluations sont « divergentes ». */
export const ECART_EVALUATIONS_SIGNIFICATIF = 2;

export function motif(
  code: CodeMotifValidation,
  message: string,
  cible?: string,
  degre?: DegreValidation,
): MotifValidation {
  return { code, degre: degre ?? DEGRE_PAR_MOTIF[code], cible, message };
}

export function dedupliquerMotifs(motifs: MotifValidation[]): MotifValidation[] {
  const parCle = new Map<string, MotifValidation>();
  for (const m of motifs) {
    const cle = `${m.code}|${m.cible ?? ''}|${m.message}`;
    const existant = parCle.get(cle);
    // Un même motif levé deux fois garde le degré le plus élevé : on ne
    // dégrade jamais une validation bloquante en simple information.
    if (!existant || ORDRE_DEGRE[m.degre] > ORDRE_DEGRE[existant.degre]) parCle.set(cle, m);
  }
  return [...parCle.values()];
}

export type SyntheseValidation = {
  required: boolean;
  blocking: boolean;
  degre_maximal: DegreValidation | null;
  reasons: MotifValidation[];
};

export function synthetiserValidation(motifs: MotifValidation[]): SyntheseValidation {
  const tous = dedupliquerMotifs(motifs);
  if (!tous.length) {
    return { required: false, blocking: false, degre_maximal: null, reasons: [] };
  }
  const maximal = tous.reduce<DegreValidation>(
    (max, m) => (ORDRE_DEGRE[m.degre] > ORDRE_DEGRE[max] ? m.degre : max),
    'information',
  );
  return {
    required: ORDRE_DEGRE[maximal] >= ORDRE_DEGRE.recommandee,
    blocking: maximal === 'bloquante',
    degre_maximal: maximal,
    reasons: tous,
  };
}

/**
 * Motifs communs aux deux matières : confiance, qualité documentaire,
 * proximité d'un seuil administrateur, cohérence sujet/copie.
 *
 * Les motifs proprement disciplinaires (sujet de rédaction ambigu, méthode
 * mathématique inhabituelle) sont levés par les noyaux de matière.
 */
export function motifsCommuns(entree: {
  confiance: number | null;
  qualite: QualiteDocument;
  noteSur20: number;
  seuilsAdmin: number[];
  toleranceSeuil?: number;
  transcriptionDemandeRelecture?: boolean;
  appariementSujetDouteux?: boolean;
}): MotifValidation[] {
  const motifs: MotifValidation[] = [];

  if (typeof entree.confiance === 'number' && entree.confiance < SEUIL_CONFIANCE_BREVET) {
    motifs.push(
      motif(
        'confiance_faible',
        `Confiance de correction ${entree.confiance} sous le seuil de ${SEUIL_CONFIANCE_BREVET}.`,
      ),
    );
  }

  for (const a of entree.qualite.anomalies) {
    if (a.code === 'page_manquante') {
      motifs.push(
        motif('page_manquante', `Page(s) manquante(s) : ${a.pages.join(', ') || 'non localisée'}. ${a.detail}`),
      );
    }
    if (a.code === 'texte_illisible' || a.code === 'image_floue' || a.code === 'reponse_coupee') {
      motifs.push(
        motif(
          'copie_partiellement_illisible',
          `${LIBELLES_ANOMALIE[a.code]} : ${a.detail}. Une zone illisible n'est jamais comptée comme une absence de réponse.`,
        ),
      );
    }
    if (a.code === 'reponse_mal_attribuee') {
      motifs.push(motif('reponse_entre_deux_questions', a.detail, undefined, 'bloquante'));
    }
    if (a.code === 'incoherence_sujet_corrige_bareme') {
      motifs.push(motif('contradiction_bareme_corrige', a.detail));
    }
  }

  if (entree.transcriptionDemandeRelecture) {
    motifs.push(
      motif(
        'erreur_ocr_impactant_les_points',
        'La transcription avait déjà demandé une vérification humaine : les points peuvent en dépendre.',
      ),
    );
  }

  if (entree.appariementSujetDouteux) {
    motifs.push(
      motif(
        'appariement_sujet_copie_douteux',
        'La copie ne semble pas correspondre au sujet auquel elle est rattachée.',
      ),
    );
  }

  const tolerance = entree.toleranceSeuil ?? 0.5;
  for (const seuil of entree.seuilsAdmin) {
    if (Math.abs(entree.noteSur20 - seuil) <= tolerance) {
      motifs.push(
        motif(
          'note_proche_du_seuil',
          `Note de ${entree.noteSur20}/20, à moins de ${tolerance} point du seuil ${seuil} défini par l'administratrice.`,
        ),
      );
    }
  }

  return motifs;
}

/* ================================================================== */
/*  6. Arithmetique des notes                                         */
/* ================================================================== */

/** Arrondi au centième. Les barèmes du brevet vont au demi-point au plus fin. */
export function arrondi2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Arrondi au quart de point, pour les affichages de note. */
export function arrondiQuart(n: number): number {
  return Math.round(n * 4) / 4;
}

/** Borne dure. Aucun score ne peut sortir de [0, max] — jamais, nulle part. */
export function borner(valeur: number, max: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return arrondi2(Math.max(0, Math.min(max, valeur)));
}

/**
 * Conversion d'échelle. En français, 100 points ramenés sur 20.
 *
 * Le résultat est borné à 20 par construction : il est impossible de dépasser
 * le maximum même si la somme d'entrée est fausse — et une somme fausse lève
 * en plus un motif `total_incoherent` ailleurs.
 */
export function convertirSur20(brut: number, max: number): number {
  if (!(max > 0)) return 0;
  return arrondi2(Math.max(0, Math.min(20, (Math.max(0, brut) / max) * 20)));
}

export type Bloc = {
  code: string;
  libelle: string;
  score: number;
  max: number;
};

export type VerificationTotaux = {
  ok: boolean;
  total: number;
  total_max: number;
  ecarts: { code: string; attendu: number; obtenu: number; message: string }[];
};

/**
 * Vérification mécanique des totaux, faite par le serveur, jamais par le modèle.
 *
 * Trois contrôles, tous exigés par le §10 :
 *   • aucun bloc ne dépasse son maximum ;
 *   • le maximum de chaque bloc vaut exactement celui que la règle annonce ;
 *   • la somme des blocs vaut exactement le total annoncé.
 */
export function verifierTotaux(
  blocs: Bloc[],
  attendus: { code: string; max: number }[],
  totalAttendu: number,
): VerificationTotaux {
  const ecarts: VerificationTotaux['ecarts'] = [];
  const parCode = new Map(blocs.map((b) => [b.code, b]));

  for (const a of attendus) {
    const bloc = parCode.get(a.code);
    if (!bloc) {
      ecarts.push({
        code: a.code,
        attendu: a.max,
        obtenu: 0,
        message: `Le bloc « ${a.code} » est absent de la correction.`,
      });
      continue;
    }
    if (Math.abs(bloc.max - a.max) > 0.001) {
      ecarts.push({
        code: a.code,
        attendu: a.max,
        obtenu: bloc.max,
        message: `Le bloc « ${a.code} » est barémé sur ${bloc.max} au lieu de ${a.max}.`,
      });
    }
    if (bloc.score > bloc.max + 0.001) {
      ecarts.push({
        code: a.code,
        attendu: bloc.max,
        obtenu: bloc.score,
        message: `Le bloc « ${a.code} » obtient ${bloc.score} points pour un maximum de ${bloc.max}.`,
      });
    }
  }

  const total = arrondi2(blocs.reduce((s, b) => s + b.score, 0));
  const totalMax = arrondi2(blocs.reduce((s, b) => s + b.max, 0));
  if (Math.abs(totalMax - totalAttendu) > 0.001) {
    ecarts.push({
      code: 'total',
      attendu: totalAttendu,
      obtenu: totalMax,
      message: `Le barème totalise ${totalMax} points au lieu de ${totalAttendu}.`,
    });
  }

  return { ok: ecarts.length === 0, total, total_max: totalMax, ecarts };
}

/* ================================================================== */
/*  7. Rapport eleve                                                  */
/* ================================================================== */

export type RapportEleve = {
  note_sur_20: number;
  note_brute: number;
  note_max: number;
  detail_par_partie: { libelle: string; score: number; max: number }[];
  reussites: string[];
  priorites: string[];
  erreurs_expliquees: { titre: string; explication: string; conseil: string }[];
  a_retravailler: string[];
  strategie: string;
  avertissement_lisibilite: string | null;
};

/** Formulations interdites dans un rapport élève (§14). */
const FORMULATIONS_PROSCRITES = [
  /\bnul(le)?\b/i,
  /\bmédiocre\b/i,
  /\bcatastrophique\b/i,
  /\bdésastreux\b/i,
  /\bincapable\b/i,
  /\bparesseux\b/i,
  /\bdyslex/i,
  /\bdysorthograph/i,
  /\btrouble\s+(de\s+l|d)['’]attention\b/i,
  /\bTDAH\b/,
  /\bdiagnostic\b/i,
];

/**
 * Un commentaire est « vague » quand il ne cite rien de la copie et n'indique
 * aucune action. Le §14 les proscrit : on les repère plutôt que de les laisser
 * passer, et ils déclenchent une reprise humaine.
 */
export function commentaireVague(texte: string): boolean {
  const t = texte.trim();
  if (t.length < 25) return true;
  const citeLaCopie = /[«"']/.test(t);
  const actionnable = /(reprends|travaille|entraîne|relis|vérifie|pense à|commence par|apprends|utilise)/i.test(t);
  return !citeLaCopie && !actionnable;
}

export function formulationProscrite(texte: string): string | null {
  for (const motif of FORMULATIONS_PROSCRITES) {
    const m = texte.match(motif);
    if (m) return m[0];
  }
  return null;
}

/**
 * Met le rapport élève en forme et le rend conforme au §14 :
 * trois réussites au plus, trois priorités au plus, aucune formulation
 * humiliante ni médicale, aucune certitude quand la copie est illisible.
 */
export function construireRapportEleve(entree: {
  noteBrute: number;
  noteMax: number;
  blocs: Bloc[];
  reussites: string[];
  priorites: string[];
  erreurs: { titre: string; explication: string; conseil: string }[];
  aRetravailler: string[];
  strategie: string;
  qualite: QualiteDocument;
}): { rapport: RapportEleve; motifs: MotifValidation[] } {
  const motifs: MotifValidation[] = [];
  const nettoyer = (textes: string[], origine: string) =>
    textes
      .map((t) => t.trim())
      .filter((t) => {
        const interdit = formulationProscrite(t);
        if (interdit) {
          motifs.push(
            motif(
              'confiance_faible',
              `Formulation proscrite « ${interdit} » retirée du ${origine} du rapport élève.`,
            ),
          );
          return false;
        }
        return t.length > 0;
      });

  const reussites = nettoyer(entree.reussites, 'bloc réussites').slice(0, 3);
  const priorites = nettoyer(entree.priorites, 'bloc priorités').slice(0, 3);

  for (const p of priorites) {
    if (commentaireVague(p)) {
      motifs.push(
        motif(
          'confiance_faible',
          `Priorité de progression trop vague, sans preuve ni action : « ${p.slice(0, 60)}… ».`,
        ),
      );
    }
  }

  const illisible = entree.qualite.statut !== 'readable';

  return {
    rapport: {
      note_sur_20: convertirSur20(entree.noteBrute, entree.noteMax),
      note_brute: arrondi2(entree.noteBrute),
      note_max: entree.noteMax,
      detail_par_partie: entree.blocs.map((b) => ({
        libelle: b.libelle,
        score: arrondi2(b.score),
        max: b.max,
      })),
      reussites,
      priorites,
      erreurs_expliquees: entree.erreurs.slice(0, 6),
      a_retravailler: entree.aRetravailler.slice(0, 6),
      strategie: entree.strategie.trim(),
      avertissement_lisibilite: illisible
        ? 'Une partie de ta copie n’a pas pu être lue avec certitude : cette note est provisoire ' +
          'et sera vérifiée par ton professeur avant d’être définitive.'
        : null,
    },
    motifs,
  };
}

/* ================================================================== */
/*  8. Calibration                                                    */
/* ================================================================== */

/** Les niveaux de copies attendus dans un corpus de calibration (§18). */
export const NIVEAUX_COPIE_BREVET = [
  { code: 'tres_faible', libelle: 'Très faible', plage: '0 à 5 / 20' },
  { code: 'fragile', libelle: 'Fragile', plage: '6 à 9 / 20' },
  { code: 'moyen', libelle: 'Moyen', plage: '10 à 12 / 20' },
  { code: 'satisfaisant', libelle: 'Satisfaisant', plage: '13 à 15 / 20' },
  { code: 'tres_bon', libelle: 'Très bon', plage: '16 à 17 / 20' },
  { code: 'excellent', libelle: 'Excellent', plage: '18 à 20 / 20' },
  { code: 'atypique', libelle: 'Copie atypique', plage: 'hors norme' },
  { code: 'incomplete', libelle: 'Copie incomplète', plage: 'partie non traitée' },
  { code: 'difficile_a_lire', libelle: 'Copie difficile à lire', plage: 'écriture peu lisible' },
] as const;

export type CodeNiveauCopie = (typeof NIVEAUX_COPIE_BREVET)[number]['code'];

export function couvertureCorpus(niveauxPresents: (string | null)[]): {
  couverts: string[];
  manquants: { code: string; libelle: string; plage: string }[];
} {
  const presents = new Set(niveauxPresents.filter(Boolean) as string[]);
  return {
    couverts: [...presents],
    manquants: NIVEAUX_COPIE_BREVET.filter((n) => !presents.has(n.code)).map((n) => ({ ...n })),
  };
}

export type EcartCalibration = {
  cible: string;
  ia: number | null;
  humain: number | null;
  ecart: number | null;
  /** L'IA a vu une erreur que l'humain n'a pas retenue. */
  faux_positif: boolean;
  /** L'humain a retenu une erreur que l'IA n'a pas vue. */
  faux_negatif: boolean;
};

export type IndicateursCalibration = {
  copies: number;
  ecart_absolu_moyen: number | null;
  ecart_par_partie: { partie: string; ecart_absolu_moyen: number; copies: number }[];
  taux_accord_par_question: number | null;
  taux_alertes_pertinentes: number | null;
  taux_doubles_penalisations: number | null;
  frequence_modifications_humaines: number | null;
  categories_les_moins_fiables: { categorie: string; ecart_absolu_moyen: number; occurrences: number }[];
  faux_positifs: number;
  faux_negatifs: number;
  desaccords: number;
};

function moyenneOuNull(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return arrondi2(valeurs.reduce((a, b) => a + b, 0) / valeurs.length);
}

export function indicateursCalibration(entree: {
  copies: {
    ecarts: EcartCalibration[];
    ecartsParPartie: { partie: string; ecart: number }[];
    ecartsParCategorie: { categorie: string; ecart: number }[];
    alertes: { pertinente: boolean }[];
    doublesPenalisations: number;
    questions: number;
    modificationsHumaines: number;
  }[];
}): IndicateursCalibration {
  const toutes = entree.copies;
  const ecartsTotaux: number[] = [];
  let exacts = 0;
  let compares = 0;
  let fauxPositifs = 0;
  let fauxNegatifs = 0;
  let desaccords = 0;
  let alertes = 0;
  let alertesPertinentes = 0;
  let doubles = 0;
  let questions = 0;
  let modifications = 0;
  const parPartie = new Map<string, number[]>();
  const parCategorie = new Map<string, number[]>();

  for (const c of toutes) {
    for (const e of c.ecarts) {
      if (e.faux_positif) fauxPositifs += 1;
      if (e.faux_negatif) fauxNegatifs += 1;
      if (e.ecart === null) continue;
      compares += 1;
      ecartsTotaux.push(Math.abs(e.ecart));
      if (Math.abs(e.ecart) < 0.001) exacts += 1;
      else desaccords += 1;
    }
    for (const p of c.ecartsParPartie) {
      const liste = parPartie.get(p.partie) ?? [];
      liste.push(Math.abs(p.ecart));
      parPartie.set(p.partie, liste);
    }
    for (const cat of c.ecartsParCategorie) {
      const liste = parCategorie.get(cat.categorie) ?? [];
      liste.push(Math.abs(cat.ecart));
      parCategorie.set(cat.categorie, liste);
    }
    alertes += c.alertes.length;
    alertesPertinentes += c.alertes.filter((a) => a.pertinente).length;
    doubles += c.doublesPenalisations;
    questions += c.questions;
    modifications += c.modificationsHumaines;
  }

  return {
    copies: toutes.length,
    ecart_absolu_moyen: moyenneOuNull(ecartsTotaux),
    ecart_par_partie: [...parPartie.entries()]
      .map(([partie, valeurs]) => ({
        partie,
        ecart_absolu_moyen: moyenneOuNull(valeurs) ?? 0,
        copies: valeurs.length,
      }))
      .sort((a, b) => b.ecart_absolu_moyen - a.ecart_absolu_moyen),
    taux_accord_par_question: compares ? arrondi2(exacts / compares) : null,
    taux_alertes_pertinentes: alertes ? arrondi2(alertesPertinentes / alertes) : null,
    taux_doubles_penalisations: questions ? arrondi2(doubles / questions) : null,
    frequence_modifications_humaines: questions ? arrondi2(modifications / questions) : null,
    categories_les_moins_fiables: [...parCategorie.entries()]
      .map(([categorie, valeurs]) => ({
        categorie,
        ecart_absolu_moyen: moyenneOuNull(valeurs) ?? 0,
        occurrences: valeurs.length,
      }))
      .sort((a, b) => b.ecart_absolu_moyen - a.ecart_absolu_moyen)
      .slice(0, 10),
    faux_positifs: fauxPositifs,
    faux_negatifs: fauxNegatifs,
    desaccords,
  };
}

/**
 * Un système n'est PAS prêt pour la production sans calibration humaine (§18).
 * Cette fonction dit non tant que le corpus n'existe pas — elle ne dit jamais
 * oui toute seule : c'est un garde-fou, pas un feu vert.
 */
export function pretPourLaProduction(entree: {
  copiesCalibrees: number;
  niveauxCouverts: string[];
  ecartAbsoluMoyen: number | null;
  minimumCopies?: number;
  ecartMaximalTolere?: number;
}): { pret: boolean; raisons: string[] } {
  const minimum = entree.minimumCopies ?? 6;
  const tolere = entree.ecartMaximalTolere ?? 1;
  const raisons: string[] = [];

  if (entree.copiesCalibrees < minimum) {
    raisons.push(
      `${entree.copiesCalibrees} copie(s) calibrée(s) sur ${minimum} attendues : la note reste approximative.`,
    );
  }
  const manquants = NIVEAUX_COPIE_BREVET.filter(
    (n) => !entree.niveauxCouverts.includes(n.code) && n.code !== 'atypique',
  );
  if (manquants.length > 3) {
    raisons.push(
      `Niveaux de copies absents du corpus : ${manquants.map((m) => m.libelle).join(', ')}.`,
    );
  }
  if (entree.ecartAbsoluMoyen === null) {
    raisons.push("Aucune comparaison IA / humain n'a encore été faite.");
  } else if (entree.ecartAbsoluMoyen > tolere) {
    raisons.push(
      `Écart absolu moyen de ${entree.ecartAbsoluMoyen} point(s), au-dessus de la tolérance de ${tolere}.`,
    );
  }

  return { pret: raisons.length === 0, raisons };
}

/* ================================================================== */
/*  9. Retouches humaines                                             */
/* ================================================================== */

export type RetoucheHumaine = {
  cible: string;
  valeur_ia: number | null;
  valeur_humaine: number;
  correcteur: string;
  motif: string;
  commentaire: string | null;
  impact_note: number;
};

/** Au-delà de cet écart, une retouche exige une justification écrite (§13). */
export const RETOUCHE_JUSTIFICATION_OBLIGATOIRE = 1;

export function retoucheAcceptable(entree: {
  valeurIa: number | null;
  valeurHumaine: number;
  max: number;
  motif: string;
}): { ok: true } | { ok: false; raison: string } {
  if (!Number.isFinite(entree.valeurHumaine)) {
    return { ok: false, raison: 'La valeur saisie n’est pas un nombre.' };
  }
  if (entree.valeurHumaine < 0 || entree.valeurHumaine > entree.max + 0.001) {
    return {
      ok: false,
      raison: `Une note de ${entree.valeurHumaine} est hors des bornes [0 ; ${entree.max}].`,
    };
  }
  const ecart = Math.abs(entree.valeurHumaine - (entree.valeurIa ?? 0));
  if (ecart >= RETOUCHE_JUSTIFICATION_OBLIGATOIRE && entree.motif.trim().length < 10) {
    return {
      ok: false,
      raison:
        `Écart de ${arrondi2(ecart)} point(s) avec la proposition de l'IA : ` +
        'une justification écrite est obligatoire.',
    };
  }
  return { ok: true };
}

/* ================================================================== */
/*  10. Metadonnees du resultat                                       */
/* ================================================================== */

export type MetadonneesCorrection = {
  exam: 'DNB';
  series: SerieBrevet;
  session: number;
  subject: MatiereBrevet;
  copy_id: string;
  subject_id: string;
  exam_id: string;
  rubric_version: string;
  bareme_version: string;
  prompt_version: string;
  correction_version: string;
  moteur: MatiereBrevet;
  amenagements: string[];
};

/** Version des prompts et du moteur. À incrémenter à chaque changement de règle. */
export const VERSION_PROMPT_BREVET = '1.0.0';
export const VERSION_CORRECTION_BREVET = '1.0.0';
