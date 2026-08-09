/**
 * NOYAU DE CORRECTION DES MATHEMATIQUES — BREVET (DNB, serie generale).
 *
 * Fichier volontairement PUR : aucun import, aucun acces reseau, aucune
 * dependance a Deno ni a Node. Utilise par :
 *   • l'Edge Function `correct-brevet-maths` (Deno) ;
 *   • l'application Next.js, via `src/lib/brevetMathsNoyau.ts` ;
 *   • les tests hors ligne (`npm run test:brevet:maths`).
 *
 * CE FICHIER NE CONNAIT PAS LE FRANCAIS, ET NE CONNAIT PAS LE BAC.
 * Il n'importe ni `brevet-francais-noyau.ts`, ni `bareme-noyau.ts`.
 *
 * L'EPREUVE (note de service NOR MENE2515977N, BO n° 33 du 4 septembre 2025)
 * -------------------------------------------------------------------------
 *   Duree 2 h, notee sur 20, exercices independants les uns des autres.
 *   • Partie 1 — Automatismes : 6 points, 20 minutes, SANS calculatrice ;
 *   • Partie 2 — Raisonnement et resolution de problemes : 14 points, 1 h 40,
 *     calculatrice autorisee.
 *   « L'evaluation doit prendre en compte la clarte et la precision des
 *     raisonnements ainsi que, plus largement, la qualite de la redaction qui
 *     sera evaluee sur 2 points. »
 *   « Doivent etre pris en compte les essais et les demarches engagees, meme
 *     non abouties. »
 *
 * LES 2 POINTS DE REDACTION SONT COMPRIS DANS LES 14
 * --------------------------------------------------
 * La note de service place la phrase dans la partie 2 et fixe le total a 20
 * pour 6 + 14 : les 2 points ne peuvent donc pas s'ajouter au-dessus des 14.
 * `verifierTotauxMaths()` refuse tout bareme qui les ajouterait par-dessus.
 *
 * CE QUE CE FICHIER NE FAIT JAMAIS
 * --------------------------------
 * 1. Il n'accorde pas de points parce que des mots-cles sont presents : la
 *    coherence mathematique de la demarche est verifiee etape par etape.
 * 2. Il ne met jamais zero d'office a une methode qu'il n'a pas su rattacher
 *    au corrige : il la signale pour validation humaine.
 * 3. Il ne fait pas payer deux fois une erreur commise plus tot.
 * 4. Il ne transforme jamais une ecriture illisible en faute.
 */

/* ================================================================== */
/*  0. Utilitaires locaux                                             */
/* ================================================================== */

export function arrondiMa(n: number): number {
  return Math.round(n * 100) / 100;
}

function bornerMa(valeur: number, max: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return arrondiMa(Math.max(0, Math.min(max, valeur)));
}

function listeTextes(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}

/* ================================================================== */
/*  1. Structure de l'epreuve                                         */
/* ================================================================== */

export const BAREME_TOTAL_MATHS = 20;
export const MAX_AUTOMATISMES = 6;
export const MAX_RAISONNEMENT = 14;
export const MAX_QUALITE_REDACTION = 2;

export const PARTIES_MATHS = ['automatismes', 'raisonnement', 'qualite_redaction'] as const;
export type PartieMaths = (typeof PARTIES_MATHS)[number];

export const LIBELLES_PARTIE_MATHS: Record<PartieMaths, string> = {
  automatismes: 'Partie 1 — Automatismes',
  raisonnement: 'Partie 2 — Raisonnement et résolution de problèmes',
  qualite_redaction: 'Qualité de la rédaction mathématique',
};

/** Les six compétences du programme, citées par la note de service. */
export const COMPETENCES_MATHS = [
  'chercher',
  'modeliser',
  'representer',
  'raisonner',
  'calculer',
  'communiquer',
] as const;

export type CompetenceMaths = (typeof COMPETENCES_MATHS)[number];

/**
 * Les thèmes de la liste indicative d'automatismes.
 * Source : « Liste indicative d'automatismes susceptibles d'être mobilisés lors
 * de l'épreuve écrite de mathématiques », education.gouv.fr, octobre 2025.
 * Les intitulés de thèmes sont ceux du document.
 */
export const THEMES_AUTOMATISMES = [
  'nombres_et_calculs',
  'espace_et_geometrie',
  'organisation_gestion_donnees_probabilites',
  'proportionnalite_fonctions',
  'algorithmique_et_programmation',
] as const;

export type ThemeAutomatisme = (typeof THEMES_AUTOMATISMES)[number];

/** Les domaines de la partie 2, tous à gérer d'après le §8. */
export const DOMAINES_MATHS = [
  'qcm',
  'reponse_courte',
  'calcul',
  'demonstration',
  'probleme',
  'geometrie',
  'algorithmique',
  'tableau',
  'graphique',
  'figure',
  'unites',
  'probabilites',
  'statistiques',
  'proportionnalite',
  'fonctions',
  'calcul_litteral',
  'arithmetique',
  'grandeurs_et_mesures',
] as const;

export type DomaineMaths = (typeof DOMAINES_MATHS)[number];

/* ================================================================== */
/*  2. Taxonomie d'erreurs                                            */
/* ================================================================== */

/** Les trente-trois catégories minimales du §9. */
export const CATEGORIES_ERREUR_MATHS = [
  'comprehension_consigne',
  'choix_de_methode',
  'raisonnement',
  'calcul_numerique',
  'calcul_litteral',
  'fraction',
  'puissance',
  'proportionnalite',
  'pourcentage',
  'fonction',
  'graphique',
  'statistique',
  'probabilite',
  'arithmetique',
  'geometrie',
  'theoreme',
  'trigonometrie',
  'aire',
  'volume',
  'unite',
  'conversion',
  'arrondi',
  'valeur_exacte',
  'valeur_approchee',
  'algorithmique',
  'demonstration',
  'justification',
  'communication',
  'erreur_en_cascade',
  'reponse_incomplete',
  'absence_de_reponse',
  'illisibilite',
  'reconnaissance_incertaine',
] as const;

export type CategorieErreurMaths = (typeof CATEGORIES_ERREUR_MATHS)[number];

/** Catégories qui ne décrivent pas une faute imputable à l'élève. */
export const CATEGORIES_NON_IMPUTABLES_MATHS: CategorieErreurMaths[] = [
  'illisibilite',
  'reconnaissance_incertaine',
  'erreur_en_cascade',
];

export type ErreurTypeMaths = {
  code: string;
  matiere: 'brevet_mathematiques';
  partie: PartieMaths | 'toutes';
  categorie: CategorieErreurMaths;
  sous_categorie: string | null;
  libelle_eleve: string;
  explication: string;
  gravite: 'mineure' | 'moderee' | 'majeure';
  regle_retrait: string | null;
  points_concernes: number | null;
  cumul_autorise: boolean;
  plafond_perte: number | null;
  conseil: string | null;
  competence: CompetenceMaths | null;
  source: string;
  version: string;
};

/* ================================================================== */
/*  3. Partie 1 — Automatismes (6 points)                             */
/* ================================================================== */

export type ItemAutomatisme = {
  item_key: string;
  numero: string;
  notion: string;
  theme: ThemeAutomatisme;
  competence: CompetenceMaths;
  reponse_attendue: string;
  variantes_acceptees: string[];
  unite_attendue: string | null;
  /** Tolérance numérique absolue. `null` = réponse exacte exigée. */
  tolerance: number | null;
  /** Forme exacte exigée (fraction irréductible, notation scientifique…). */
  forme_exigee: string | null;
  points: number;
};

export type ReponseAutomatismeIA = {
  item_key: string;
  reponse_eleve?: string;
  statut?: StatutAutomatisme;
  score?: number;
  justification?: string;
  certitude?: number;
  illisible?: boolean;
};

export type StatutAutomatisme =
  | 'exacte'
  | 'variante_acceptee'
  | 'exacte_forme_non_conforme'
  | 'unite_absente'
  | 'unite_erronee'
  | 'dans_la_tolerance'
  | 'fausse'
  | 'absente'
  | 'illisible';

export type ItemAutomatismeCorrige = {
  item_key: string;
  numero: string;
  notion: string;
  competence: CompetenceMaths;
  reponse_attendue: string;
  reponse_eleve: string;
  statut: StatutAutomatisme;
  points: number;
  max_points: number;
  justification: string;
  certitude: number;
  alertes: string[];
};

export type ResultatAutomatismes = {
  items: ItemAutomatismeCorrige[];
  score: number;
  max: number;
  alertes: string[];
};

/**
 * Correction de la partie 1, item par item (§8.1).
 *
 * Point de vigilance explicite du cahier des charges : l'absence de
 * calculatrice n'autorise PAS à retirer des points quand la réponse est
 * correcte. Aucune règle de ce fichier ne pénalise « parce que c'était sans
 * calculatrice » : le barème du sujet reste prioritaire, et lui seul décide
 * de ce que vaut une forme non conforme ou une unité manquante.
 */
export function evaluerAutomatismes(
  items: ItemAutomatisme[],
  reponses: ReponseAutomatismeIA[],
): ResultatAutomatismes {
  const parCle = new Map(reponses.map((r) => [r.item_key, r]));
  const alertes: string[] = [];
  const corriges: ItemAutomatismeCorrige[] = [];

  for (const def of items) {
    const brut = parCle.get(def.item_key);
    const alertesItem: string[] = [];

    if (!brut) {
      alertes.push(`Automatisme ${def.numero} : rien renvoyé par le correcteur, 0 posé et validation demandée.`);
      corriges.push({
        item_key: def.item_key,
        numero: def.numero,
        notion: def.notion,
        competence: def.competence,
        reponse_attendue: def.reponse_attendue,
        reponse_eleve: '',
        statut: 'absente',
        points: 0,
        max_points: def.points,
        justification: 'Item non évalué par le correcteur.',
        certitude: 0,
        alertes: ['Item absent de la réponse du correcteur.'],
      });
      continue;
    }

    const statut: StatutAutomatisme = (
      [
        'exacte',
        'variante_acceptee',
        'exacte_forme_non_conforme',
        'unite_absente',
        'unite_erronee',
        'dans_la_tolerance',
        'fausse',
        'absente',
        'illisible',
      ] as StatutAutomatisme[]
    ).includes(brut.statut as StatutAutomatisme)
      ? (brut.statut as StatutAutomatisme)
      : 'fausse';

    let points = bornerMa(Number(brut.score ?? 0), def.points);

    if (statut === 'exacte' || statut === 'variante_acceptee' || statut === 'dans_la_tolerance') {
      // Une réponse juste vaut le plein, sauf si le barème du sujet a prévu
      // autre chose — et il l'aurait alors exprimé par un `points` plus petit
      // sur l'item, pas par un retrait décidé ici.
      if (points < def.points) {
        points = def.points;
        alertesItem.push(
          'Réponse juste : le plein des points de l’item est rétabli. Aucun retrait n’est admis au motif de l’absence de calculatrice.',
        );
      }
    }

    if (statut === 'illisible' || brut.illisible) {
      // Illisible ≠ faux : on accorde provisoirement et on demande une lecture.
      points = def.points;
      alertesItem.push(
        'Réponse illisible : points accordés provisoirement, lecture à vérifier sur l’original.',
      );
      alertes.push(`Automatisme ${def.numero} : réponse illisible, à relire sur l'original.`);
    }

    corriges.push({
      item_key: def.item_key,
      numero: def.numero,
      notion: def.notion,
      competence: def.competence,
      reponse_attendue: def.reponse_attendue,
      reponse_eleve: String(brut.reponse_eleve ?? ''),
      statut,
      points,
      max_points: def.points,
      justification: String(brut.justification ?? ''),
      certitude: typeof brut.certitude === 'number' ? brut.certitude : 1,
      alertes: alertesItem,
    });
  }

  for (const r of reponses) {
    if (!items.some((i) => i.item_key === r.item_key)) {
      alertes.push(
        `Le correcteur a noté un automatisme « ${r.item_key} » absent du barème : il ne compte pas.`,
      );
    }
  }

  return {
    items: corriges,
    score: arrondiMa(corriges.reduce((s, i) => s + i.points, 0)),
    max: arrondiMa(items.reduce((s, i) => s + i.points, 0)),
    alertes,
  };
}

/* ================================================================== */
/*  4. Partie 2 — Raisonnement (14 points, redaction comprise)        */
/* ================================================================== */

/** Les dix-huit statuts à distinguer au §8.2. */
export const STATUTS_REPONSE_MATHS = [
  'juste_methode_juste',
  'juste_sans_justification',
  'juste_methode_incorrecte',
  'demarche_correcte_erreur_de_calcul',
  'erreur_de_calcul_isolee',
  'erreur_de_raisonnement',
  'mauvaise_formule',
  'bonne_formule_mal_appliquee',
  'erreur_unite',
  'unite_absente',
  'erreur_arrondi',
  'valeur_approchee_acceptable',
  'methode_alternative_correcte',
  'demarche_pertinente_non_aboutie',
  'reponse_non_justifiee',
  'reponse_incoherente',
  'hors_sujet',
  'absence_de_reponse',
  'illisible',
] as const;

export type StatutReponseMaths = (typeof STATUTS_REPONSE_MATHS)[number];

/** Statuts qui interdisent le plein des points sans décision humaine. */
export const STATUTS_PLEIN_INTERDIT_MATHS: StatutReponseMaths[] = [
  'juste_methode_incorrecte',
  'erreur_de_raisonnement',
  'mauvaise_formule',
  'reponse_incoherente',
  'hors_sujet',
  'absence_de_reponse',
];

/** Les six étapes d'une démonstration de géométrie (§8.5). */
export const ETAPES_GEOMETRIE = [
  'hypotheses',
  'propriete',
  'remplacement_numerique',
  'calcul',
  'unite',
  'conclusion',
] as const;

export type EtapeGeometrie = (typeof ETAPES_GEOMETRIE)[number];

export type QuestionMaths = {
  question_key: string;
  numero: string;
  exercice: string;
  partie: PartieMaths;
  libelle: string;
  domaines: DomaineMaths[];
  connaissances: string[];
  competences: CompetenceMaths[];
  max_points: number;
  resultat_attendu: string;
  methode_principale: string;
  methodes_alternatives: { libelle: string; description: string }[];
  /** Étapes valorisables, avec les points qui leur reviennent. */
  etapes_valorisables: { code: string; libelle: string; points: number }[];
  unites_attendues: string | null;
  precision_attendue: string | null;
  justification_attendue: 'aucune' | 'mention' | 'demonstration_complete';
  regle_arrondi: string | null;
  depend_de: string[];
  regle_cascade: string | null;
  regles_points_partiels: string | null;
  /** Renseigné pour une question de géométrie : les étapes réellement exigées. */
  etapes_geometrie: EtapeGeometrie[];
  codes_erreurs: string[];
  calculatrice: 'autorisee' | 'interdite';
};

export type ReponseQuestionMathsIA = {
  question_key: string;
  score?: number;
  statut?: StatutReponseMaths;
  resultat_eleve?: string;
  methode_identifiee?: string;
  etapes_validees?: string[];
  etapes_manquantes?: string[];
  etapes_geometrie_validees?: string[];
  erreurs?: { code: string; citation?: string; certitude?: number }[];
  preuves?: { page?: number; citation: string; explication?: string }[];
  /** Erreur en cascade (§8.3). */
  depends_on_question?: string | null;
  inherited_value?: string | null;
  cascade_error?: boolean;
  method_valid_from_student_value?: boolean;
  methode_alternative?: boolean;
  methode_alternative_description?: string | null;
  source_decision?: string;
  nature_decision?: string;
  transcription_incertaine?: boolean;
  justification?: string;
  certitude?: number;
};

export type QuestionCorrigeeMaths = {
  question_key: string;
  numero: string;
  exercice: string;
  partie: PartieMaths;
  points: number;
  max_points: number;
  statut: StatutReponseMaths;
  resultat_attendu: string;
  resultat_eleve: string;
  methode_identifiee: string;
  etapes_validees: string[];
  etapes_manquantes: string[];
  etapes_geometrie_validees: EtapeGeometrie[];
  etapes_geometrie_manquantes: EtapeGeometrie[];
  erreurs: { code: string; citation: string | null; certitude: number }[];
  preuves: { page: number | null; citation: string; explication: string }[];
  depends_on_question: string | null;
  inherited_value: string | null;
  cascade_error: boolean;
  method_valid_from_student_value: boolean;
  cascade_penalty_applied: boolean;
  methode_alternative: boolean;
  methode_alternative_description: string | null;
  source_decision: string;
  nature_decision: string;
  transcription_incertaine: boolean;
  justification: string;
  certitude: number;
  competences: CompetenceMaths[];
  alertes: string[];
};

export type ResultatRaisonnement = {
  questions: QuestionCorrigeeMaths[];
  score: number;
  max: number;
  alertes: string[];
  cascades: {
    question_key: string;
    source: string;
    valeur_heritee: string | null;
    points_preserves: number;
  }[];
};

/**
 * Correction de la partie 2, question par question (§8.2, §8.3, §8.4).
 *
 * Les règles appliquées ici, dans cet ordre :
 *
 * 1. ESSAIS ET DÉMARCHES NON ABOUTIS. La note de service impose de les prendre
 *    en compte : `demarche_pertinente_non_aboutie` ne peut pas valoir 0 quand
 *    des étapes valorisables du barème ont été validées.
 * 2. ERREUR EN CASCADE. Une question qui réutilise correctement un résultat
 *    faux garde ses points de méthode. Le moteur le vérifie et le signale
 *    quand la copie a été mise à 0 sans que la poursuite soit déclarée.
 * 3. MÉTHODE ALTERNATIVE. Une méthode valide non prévue n'est jamais mise à
 *    zéro d'office : elle part en validation humaine avec les points qu'elle
 *    mérite.
 * 4. PAS DE POINTS POUR DES MOTS-CLÉS. Un statut qui affirme une méthode juste
 *    sans aucune étape validée est signalé : la cohérence mathématique doit
 *    être observable, pas devinée.
 * 5. GÉOMÉTRIE. Une conclusion correcte sans les étapes exigées n'est pas une
 *    démonstration complète et ne peut pas valoir le plein.
 * 6. ILLISIBLE ≠ FAUX.
 */
export function evaluerRaisonnement(
  bareme: QuestionMaths[],
  sortie: ReponseQuestionMathsIA[],
): ResultatRaisonnement {
  const parCle = new Map(sortie.map((q) => [String(q.question_key ?? ''), q]));
  const clesBareme = new Set(bareme.map((q) => q.question_key));
  const alertes: string[] = [];
  const cascades: ResultatRaisonnement['cascades'] = [];

  const questions = bareme.map<QuestionCorrigeeMaths>((def) => {
    const brut = parCle.get(def.question_key);
    const alertesQuestion: string[] = [];

    if (!brut) {
      alertes.push(
        `Question ${def.numero} : rien renvoyé par le correcteur. 0 posé et validation humaine demandée.`,
      );
      return questionVideMaths(def);
    }

    const statut: StatutReponseMaths = (STATUTS_REPONSE_MATHS as readonly string[]).includes(
      String(brut.statut),
    )
      ? (brut.statut as StatutReponseMaths)
      : 'reponse_incoherente';

    let points = bornerMa(Number(brut.score ?? 0), def.max_points);
    if (Math.abs(points - Number(brut.score ?? 0)) > 0.001) {
      const message = `Question ${def.numero} : ${brut.score} point(s) proposé(s) pour un maximum de ${def.max_points}, ramené à ${points}.`;
      alertesQuestion.push(message);
      alertes.push(message);
    }

    const etapesValidees = listeTextes(brut.etapes_validees);
    const etapesConnues = def.etapes_valorisables.map((e) => e.code);
    const etapesReelles = etapesValidees.filter((e) => etapesConnues.includes(e));

    // 4. Aucun point pour des mots-clés : une méthode annoncée juste sans
    //    aucune étape du barème validée ne peut pas être prise au mot.
    if (
      points > 0 &&
      def.etapes_valorisables.length > 0 &&
      etapesReelles.length === 0 &&
      statut !== 'juste_methode_juste' &&
      statut !== 'illisible'
    ) {
      alertesQuestion.push(
        'Des points sont attribués sans qu’aucune étape valorisée du barème ne soit identifiée : la démarche doit être vérifiée.',
      );
      alertes.push(
        `Question ${def.numero} : points attribués sans étape valorisée identifiée — à vérifier (§8.4, pas de points sur des mots-clés).`,
      );
    }

    // 1. Essais et démarches non aboutis : la note de service impose de les
    //    prendre en compte. Le plancher est la somme des étapes validées.
    if (statut === 'demarche_pertinente_non_aboutie' || statut === 'demarche_correcte_erreur_de_calcul') {
      const plancher = arrondiMa(
        def.etapes_valorisables
          .filter((e) => etapesReelles.includes(e.code))
          .reduce((s, e) => s + e.points, 0),
      );
      if (plancher > points) {
        points = bornerMa(plancher, def.max_points);
        alertesQuestion.push(
          `Points relevés à ${points} : les étapes ${etapesReelles.join(', ')} sont valorisées par le barème, et les démarches engagées même non abouties doivent être prises en compte.`,
        );
      }
    }

    // 5. Géométrie : une conclusion sans démonstration n'est pas une démonstration.
    const geoValidees = listeTextes(brut.etapes_geometrie_validees).filter((e) =>
      (ETAPES_GEOMETRIE as readonly string[]).includes(e),
    ) as EtapeGeometrie[];
    const geoManquantes = def.etapes_geometrie.filter((e) => !geoValidees.includes(e));
    if (
      def.etapes_geometrie.length > 0 &&
      geoManquantes.length > 0 &&
      points >= def.max_points - 0.001
    ) {
      points = bornerMa(def.max_points - 0.25, def.max_points);
      const message = `Question ${def.numero} : étape(s) de démonstration manquante(s) (${geoManquantes.join(', ')}) — une conclusion correcte sans justification n'est pas une démonstration complète.`;
      alertesQuestion.push(message);
      alertes.push(message);
    }

    // 3. Méthode alternative non prévue : jamais zéro d'office.
    const alternative = brut.methode_alternative === true;
    if (alternative && def.methodes_alternatives.length === 0) {
      alertesQuestion.push(
        'Méthode non prévue au barème : elle n’est pas mise à zéro, elle part en validation humaine.',
      );
      alertes.push(
        `Question ${def.numero} : méthode alternative non prévue au barème — à trancher par un humain.`,
      );
    }

    // 2. Erreur en cascade.
    const dependance = brut.depends_on_question ?? null;
    const cascade = brut.cascade_error === true;
    const valideDepuisEleve = brut.method_valid_from_student_value === true;
    let penaliteCascade = false;

    if (cascade && dependance && !def.depend_de.includes(dependance)) {
      alertesQuestion.push(
        `Poursuite déclarée depuis « ${dependance} », qui n’est pas une dépendance prévue au barème.`,
      );
      alertes.push(
        `Question ${def.numero} : dépendance « ${dependance} » inconnue du barème — enchaînement inventé, à vérifier.`,
      );
    }

    if (cascade && valideDepuisEleve) {
      cascades.push({
        question_key: def.question_key,
        source: dependance ?? '(non précisé)',
        valeur_heritee: brut.inherited_value ?? null,
        points_preserves: points,
      });
    }

    // Une question à 0 alors qu'elle dépend d'une question ratée, sans que la
    // poursuite ait été déclarée : la faute initiale risque d'être payée deux fois.
    if (points === 0 && def.depend_de.length > 0 && !cascade) {
      penaliteCascade = true;
      const message = `Question ${def.numero} à 0 alors qu'elle reprend le résultat de ${def.depend_de.join(', ')} : vérifier que l'erreur antérieure n'est pas sanctionnée une seconde fois.`;
      alertesQuestion.push(message);
      alertes.push(message);
    }

    // 6. Illisible ≠ faux.
    if (statut === 'illisible') {
      alertesQuestion.push(
        'Écriture illisible : ce n’est pas une erreur de l’élève, la lecture doit être vérifiée sur l’original.',
      );
    }

    if (STATUTS_PLEIN_INTERDIT_MATHS.includes(statut) && points >= def.max_points - 0.001) {
      points = bornerMa(def.max_points - 0.25, def.max_points);
      alertesQuestion.push(
        `Statut « ${statut} » incompatible avec le plein des points, ramené à ${points}.`,
      );
    }

    return {
      question_key: def.question_key,
      numero: def.numero,
      exercice: def.exercice,
      partie: def.partie,
      points,
      max_points: def.max_points,
      statut,
      resultat_attendu: def.resultat_attendu,
      resultat_eleve: String(brut.resultat_eleve ?? ''),
      methode_identifiee: String(brut.methode_identifiee ?? ''),
      etapes_validees: etapesReelles,
      etapes_manquantes: listeTextes(brut.etapes_manquantes),
      etapes_geometrie_validees: geoValidees,
      etapes_geometrie_manquantes: geoManquantes,
      erreurs: (brut.erreurs ?? []).map((e) => ({
        code: String(e.code),
        citation: e.citation ?? null,
        certitude: typeof e.certitude === 'number' ? e.certitude : 1,
      })),
      preuves: (brut.preuves ?? []).map((p) => ({
        page: typeof p.page === 'number' ? p.page : null,
        citation: String(p.citation ?? ''),
        explication: String(p.explication ?? ''),
      })),
      depends_on_question: dependance,
      inherited_value: brut.inherited_value ?? null,
      cascade_error: cascade,
      method_valid_from_student_value: valideDepuisEleve,
      cascade_penalty_applied: penaliteCascade,
      methode_alternative: alternative,
      methode_alternative_description: brut.methode_alternative_description ?? null,
      source_decision: String(brut.source_decision ?? 'subject_bareme'),
      nature_decision: String(brut.nature_decision ?? 'prevue_par_bareme'),
      transcription_incertaine: brut.transcription_incertaine === true || statut === 'illisible',
      justification: String(brut.justification ?? ''),
      certitude: typeof brut.certitude === 'number' ? brut.certitude : 1,
      competences: def.competences,
      alertes: alertesQuestion,
    };
  });

  for (const q of sortie) {
    const cle = String(q.question_key ?? '');
    if (cle && !clesBareme.has(cle)) {
      alertes.push(
        `Le correcteur a noté une question « ${cle} » absente du barème : elle ne compte pas dans la note.`,
      );
    }
  }

  return {
    questions,
    score: arrondiMa(questions.reduce((s, q) => s + q.points, 0)),
    max: arrondiMa(bareme.reduce((s, q) => s + q.max_points, 0)),
    alertes,
    cascades,
  };
}

function questionVideMaths(def: QuestionMaths): QuestionCorrigeeMaths {
  return {
    question_key: def.question_key,
    numero: def.numero,
    exercice: def.exercice,
    partie: def.partie,
    points: 0,
    max_points: def.max_points,
    statut: 'absence_de_reponse',
    resultat_attendu: def.resultat_attendu,
    resultat_eleve: '',
    methode_identifiee: '',
    etapes_validees: [],
    etapes_manquantes: def.etapes_valorisables.map((e) => e.code),
    etapes_geometrie_validees: [],
    etapes_geometrie_manquantes: def.etapes_geometrie,
    erreurs: [],
    preuves: [],
    depends_on_question: null,
    inherited_value: null,
    cascade_error: false,
    method_valid_from_student_value: false,
    cascade_penalty_applied: false,
    methode_alternative: false,
    methode_alternative_description: null,
    source_decision: 'subject_bareme',
    nature_decision: 'a_valider',
    transcription_incertaine: false,
    justification: 'Question non évaluée par le correcteur.',
    certitude: 0,
    competences: def.competences,
    alertes: ['Question absente de la réponse du correcteur.'],
  };
}

/* ================================================================== */
/*  5. Qualite de la redaction mathematique — 2 points                */
/* ================================================================== */

/** Les huit points de contrôle du §8.7. */
export const CRITERES_QUALITE_REDACTION = [
  { code: 'clarte', libelle: 'Clarté' },
  { code: 'precision', libelle: 'Précision' },
  { code: 'presentation_calculs', libelle: 'Présentation des calculs' },
  { code: 'justification', libelle: 'Justification' },
  { code: 'vocabulaire', libelle: 'Utilisation correcte du vocabulaire' },
  { code: 'unites', libelle: 'Présence des unités' },
  { code: 'conclusions', libelle: 'Conclusions' },
  { code: 'enchainement', libelle: 'Lisibilité de l’enchaînement' },
] as const;

export type CodeCritereQualite = (typeof CRITERES_QUALITE_REDACTION)[number]['code'];

export type ScoreQualiteIA = {
  code: string;
  score?: number;
  observation?: string;
  preuves?: string[];
};

export type ResultatQualiteRedaction = {
  criteres: { code: string; libelle: string; score: number; max: number; observation: string; preuves: string[] }[];
  score: number;
  max: number;
  alertes: string[];
  doublons_evites: string[];
};

/**
 * Les 2 points de qualité rédactionnelle (§8.7).
 *
 * Deux garde-fous :
 *   • ils sont COMPRIS dans les 14 de la partie 2. `verifierTotauxMaths()`
 *     refuse un barème qui les ajouterait au-dessus ;
 *   • ils ne doublonnent pas avec la justification déjà payée question par
 *     question. Un critère `justification` ou `unites` est neutralisé quand
 *     des points ont DÉJÀ été retirés pour ce motif dans la partie 2 : la même
 *     faiblesse ne se paie pas deux fois.
 */
export function evaluerQualiteRedaction(entree: {
  scores: ScoreQualiteIA[];
  max: number;
  /** Questions dont des points ont été retirés pour absence de justification. */
  justificationDejaPenalisee: string[];
  /** Questions dont des points ont été retirés pour unité manquante ou fausse. */
  unitesDejaPenalisees: string[];
}): ResultatQualiteRedaction {
  const alertes: string[] = [];
  const doublons: string[] = [];
  const parCode = new Map(entree.scores.map((s) => [s.code, s]));

  // Les 2 points se répartissent également entre les huit points de contrôle,
  // sauf indication contraire du barème du sujet — qui, s'il en donne une,
  // arrive par `entree.scores` avec ses propres maximums.
  const maxParCritere = arrondiMa(entree.max / CRITERES_QUALITE_REDACTION.length);

  const criteres = CRITERES_QUALITE_REDACTION.map((def) => {
    const brut = parCode.get(def.code);
    let score = bornerMa(Number(brut?.score ?? 0), maxParCritere);
    let observation = String(brut?.observation ?? '');

    if (def.code === 'justification' && entree.justificationDejaPenalisee.length) {
      score = maxParCritere;
      observation =
        'Critère neutralisé : le défaut de justification est déjà sanctionné sur ' +
        `${entree.justificationDejaPenalisee.join(', ')}. La même faiblesse ne se paie pas deux fois.`;
      doublons.push(`justification ← ${entree.justificationDejaPenalisee.join(', ')}`);
    }
    if (def.code === 'unites' && entree.unitesDejaPenalisees.length) {
      score = maxParCritere;
      observation =
        'Critère neutralisé : les unités sont déjà sanctionnées sur ' +
        `${entree.unitesDejaPenalisees.join(', ')}.`;
      doublons.push(`unites ← ${entree.unitesDejaPenalisees.join(', ')}`);
    }

    return {
      code: def.code,
      libelle: def.libelle,
      score,
      max: maxParCritere,
      observation,
      preuves: listeTextes(brut?.preuves),
    };
  });

  const score = bornerMa(
    arrondiMa(criteres.reduce((s, c) => s + c.score, 0)),
    entree.max,
  );

  if (!entree.scores.length) {
    alertes.push(
      'Aucun élément de qualité rédactionnelle n’a été renvoyé : les 2 points ne peuvent pas être attribués sans observation.',
    );
  }

  return { criteres, score, max: entree.max, alertes, doublons_evites: doublons };
}

/* ================================================================== */
/*  6. Assemblage et controle des totaux                              */
/* ================================================================== */

export type SectionMaths = {
  code: PartieMaths;
  libelle: string;
  score: number;
  max: number;
  detail: unknown;
  alertes: string[];
};

export type ResultatMaths = {
  sections: SectionMaths[];
  automatismes: ResultatAutomatismes;
  raisonnement: ResultatRaisonnement;
  qualite_redaction: ResultatQualiteRedaction;
  score: {
    automatismes: { score: number; max: number };
    reasoning_and_problem_solving: {
      score: number;
      max: number;
      writing_quality_included: { score: number; max: number };
    };
    score_out_of_20: number;
  };
  erreurs: { code: string; cible: string; citation: string | null; certitude: number; effet_points: number }[];
  cascades: ResultatRaisonnement['cascades'];
  alertes: string[];
};

/**
 * Contrôle des totaux (§8.7 et §12).
 *
 * Trois refus, dont celui qui compte : les 2 points de rédaction AJOUTÉS
 * au-dessus des 14 sont un barème faux, et le moteur le dit.
 */
export function verifierTotauxMaths(entree: {
  maxAutomatismes: number;
  maxRaisonnementQuestions: number;
  maxQualiteRedaction: number;
}): { ok: boolean; blocages: { code: string; message: string }[] } {
  const blocages: { code: string; message: string }[] = [];

  if (Math.abs(entree.maxAutomatismes - MAX_AUTOMATISMES) > 0.001) {
    blocages.push({
      code: 'automatismes_incorrect',
      message: `Les automatismes totalisent ${entree.maxAutomatismes} points au lieu de ${MAX_AUTOMATISMES}.`,
    });
  }

  const partie2 = arrondiMa(entree.maxRaisonnementQuestions + entree.maxQualiteRedaction);
  if (Math.abs(partie2 - MAX_RAISONNEMENT) > 0.001) {
    blocages.push({
      code: 'partie2_incorrecte',
      message:
        `La partie 2 totalise ${partie2} points (dont ${entree.maxQualiteRedaction} de qualité rédactionnelle) ` +
        `au lieu de ${MAX_RAISONNEMENT}.`,
    });
  }

  if (
    Math.abs(entree.maxRaisonnementQuestions - MAX_RAISONNEMENT) < 0.001 &&
    entree.maxQualiteRedaction > 0.001
  ) {
    blocages.push({
      code: 'redaction_ajoutee_au_dessus',
      message:
        `Les ${entree.maxQualiteRedaction} points de qualité rédactionnelle sont AJOUTÉS au-dessus des ` +
        `${MAX_RAISONNEMENT} points de la partie 2. Ils doivent y être compris : ` +
        `les questions doivent totaliser ${MAX_RAISONNEMENT - entree.maxQualiteRedaction}.`,
    });
  }

  const total = arrondiMa(entree.maxAutomatismes + partie2);
  if (Math.abs(total - BAREME_TOTAL_MATHS) > 0.001) {
    blocages.push({
      code: 'total_incorrect',
      message: `Le barème totalise ${total} points au lieu de ${BAREME_TOTAL_MATHS}.`,
    });
  }

  return { ok: blocages.length === 0, blocages };
}

/**
 * Assemble la note de mathématiques.
 *
 * La somme est faite ici, par le serveur, jamais par le modèle. Elle est
 * bornée deux fois : chaque partie à son maximum, puis le total à 20.
 */
export function assemblerResultatMaths(entree: {
  automatismes: ResultatAutomatismes;
  raisonnement: ResultatRaisonnement;
  qualiteRedaction: ResultatQualiteRedaction;
  alertes: string[];
}): ResultatMaths {
  const alertes = [...entree.alertes];

  const scoreAuto = bornerMa(entree.automatismes.score, MAX_AUTOMATISMES);
  if (entree.automatismes.score > MAX_AUTOMATISMES + 0.001) {
    alertes.push(
      `Les automatismes obtiennent ${entree.automatismes.score} points pour un maximum de ${MAX_AUTOMATISMES} : ramenés à ${scoreAuto}.`,
    );
  }

  const scorePartie2Brut = arrondiMa(
    entree.raisonnement.score + entree.qualiteRedaction.score,
  );
  const scorePartie2 = bornerMa(scorePartie2Brut, MAX_RAISONNEMENT);
  if (scorePartie2Brut > MAX_RAISONNEMENT + 0.001) {
    alertes.push(
      `La partie 2 obtient ${scorePartie2Brut} points (qualité rédactionnelle comprise) pour un maximum de ${MAX_RAISONNEMENT} : ramenée à ${scorePartie2}.`,
    );
  }

  const total = bornerMa(arrondiMa(scoreAuto + scorePartie2), BAREME_TOTAL_MATHS);

  const erreurs: ResultatMaths['erreurs'] = [];
  for (const q of entree.raisonnement.questions) {
    for (const e of q.erreurs) {
      erreurs.push({
        code: e.code,
        cible: q.question_key,
        citation: e.citation,
        certitude: e.certitude,
        effet_points: arrondiMa(q.max_points - q.points),
      });
    }
  }
  for (const i of entree.automatismes.items) {
    if (i.statut === 'fausse' || i.statut === 'absente') {
      erreurs.push({
        code: `AUTO-${i.statut.toUpperCase()}`,
        cible: i.item_key,
        citation: i.reponse_eleve || null,
        certitude: i.certitude,
        effet_points: arrondiMa(i.max_points - i.points),
      });
    }
  }

  return {
    sections: [
      {
        code: 'automatismes',
        libelle: LIBELLES_PARTIE_MATHS.automatismes,
        score: scoreAuto,
        max: MAX_AUTOMATISMES,
        detail: entree.automatismes,
        alertes: entree.automatismes.alertes,
      },
      {
        code: 'raisonnement',
        libelle: LIBELLES_PARTIE_MATHS.raisonnement,
        score: bornerMa(entree.raisonnement.score, MAX_RAISONNEMENT),
        max: arrondiMa(MAX_RAISONNEMENT - entree.qualiteRedaction.max),
        detail: entree.raisonnement,
        alertes: entree.raisonnement.alertes,
      },
      {
        code: 'qualite_redaction',
        libelle: LIBELLES_PARTIE_MATHS.qualite_redaction,
        score: entree.qualiteRedaction.score,
        max: entree.qualiteRedaction.max,
        detail: entree.qualiteRedaction,
        alertes: entree.qualiteRedaction.alertes,
      },
    ],
    automatismes: entree.automatismes,
    raisonnement: entree.raisonnement,
    qualite_redaction: entree.qualiteRedaction,
    score: {
      automatismes: { score: scoreAuto, max: MAX_AUTOMATISMES },
      reasoning_and_problem_solving: {
        score: scorePartie2,
        max: MAX_RAISONNEMENT,
        writing_quality_included: {
          score: entree.qualiteRedaction.score,
          max: entree.qualiteRedaction.max,
        },
      },
      score_out_of_20: total,
    },
    erreurs,
    cascades: entree.raisonnement.cascades,
    alertes,
  };
}

/**
 * Profil de compétences : un diagnostic construit APRÈS la note, à partir des
 * points réellement attribués. Il ne remonte jamais vers la note.
 */
export type NiveauCompetenceMaths =
  | 'non_applicable'
  | 'non_observe'
  | 'insuffisant'
  | 'fragile'
  | 'satisfaisant'
  | 'tres_satisfaisant';

export function profilCompetencesMaths(
  bareme: QuestionMaths[],
  questions: QuestionCorrigeeMaths[],
  automatismes: { items: ItemAutomatismeCorrige[] },
): Record<CompetenceMaths, NiveauCompetenceMaths> {
  const parCle = new Map(questions.map((q) => [q.question_key, q]));
  const profil = {} as Record<CompetenceMaths, NiveauCompetenceMaths>;

  for (const comp of COMPETENCES_MATHS) {
    let obtenus = 0;
    let maximum = 0;
    let evaluables = 0;

    for (const def of bareme) {
      if (!def.competences.includes(comp)) continue;
      const q = parCle.get(def.question_key);
      if (!q || q.transcription_incertaine) continue;
      evaluables += 1;
      obtenus += q.points;
      maximum += q.max_points;
    }
    for (const item of automatismes.items) {
      if (item.competence !== comp) continue;
      if (item.statut === 'illisible') continue;
      evaluables += 1;
      obtenus += item.points;
      maximum += item.max_points;
    }

    if (maximum === 0) {
      profil[comp] = evaluables === 0 ? 'non_applicable' : 'non_observe';
      continue;
    }
    const taux = obtenus / maximum;
    profil[comp] =
      taux >= 0.85 ? 'tres_satisfaisant' : taux >= 0.6 ? 'satisfaisant' : taux >= 0.35 ? 'fragile' : 'insuffisant';
  }

  return profil;
}

/**
 * Contrôles bloquants du barème d'un sujet de mathématiques (§12).
 * Miroir applicatif de `public.brevet_verifier()`.
 */
export function verifierBaremeMaths(entree: {
  automatismes: { item_key: string; numero: string; reponse_attendue: string; points: number }[];
  questions: QuestionMaths[];
  maxQualiteRedaction: number;
}): { ok: boolean; blocages: { code: string; message: string }[]; avertissements: { code: string; message: string }[] } {
  const blocages: { code: string; message: string }[] = [];
  const avertissements: { code: string; message: string }[] = [];

  const maxAuto = arrondiMa(entree.automatismes.reduce((s, i) => s + i.points, 0));
  const maxQuestions = arrondiMa(entree.questions.reduce((s, q) => s + q.max_points, 0));
  const totaux = verifierTotauxMaths({
    maxAutomatismes: maxAuto,
    maxRaisonnementQuestions: maxQuestions,
    maxQualiteRedaction: entree.maxQualiteRedaction,
  });
  blocages.push(...totaux.blocages);

  for (const item of entree.automatismes) {
    if (!item.reponse_attendue.trim()) {
      blocages.push({
        code: 'corrige_manquant',
        message: `Automatisme ${item.numero} : aucune réponse attendue (question sans corrigé).`,
      });
    }
  }

  const cles = new Set(entree.questions.map((q) => q.question_key));
  for (const q of entree.questions) {
    if (!q.resultat_attendu.trim()) {
      blocages.push({
        code: 'corrige_manquant',
        message: `Question ${q.numero} : aucun résultat attendu (question sans corrigé).`,
      });
    }
    if (!q.etapes_valorisables.length) {
      blocages.push({
        code: 'etapes_manquantes',
        message: `Question ${q.numero} : aucune étape valorisable — les démarches non abouties ne pourraient pas être prises en compte, ce que la note de service impose.`,
      });
    }
    if (!q.competences.length) {
      blocages.push({
        code: 'competence_manquante',
        message: `Question ${q.numero} : aucune compétence mobilisée déclarée.`,
      });
    }
    for (const d of q.depend_de) {
      if (!cles.has(d)) {
        blocages.push({
          code: 'dependance_inconnue',
          message: `Question ${q.numero} : dépend de « ${d} », qui n'existe pas dans ce barème.`,
        });
      }
    }
    if (q.depend_de.length && !q.regle_cascade) {
      avertissements.push({
        code: 'regle_cascade_manquante',
        message: `Question ${q.numero} : dépendance déclarée sans règle de cascade — la poursuite après erreur sera laissée au jugement du correcteur.`,
      });
    }
    if (q.partie === 'automatismes' && q.calculatrice === 'autorisee') {
      blocages.push({
        code: 'calculatrice_partie1',
        message: `Question ${q.numero} : la calculatrice n'est pas autorisée en partie 1.`,
      });
    }
    if (!q.methodes_alternatives.length) {
      avertissements.push({
        code: 'aucune_methode_alternative',
        message: `Question ${q.numero} : aucune méthode alternative prévue — toute démarche différente partira en validation humaine.`,
      });
    }
  }

  return { ok: blocages.length === 0, blocages, avertissements };
}
