/**
 * NOYAU DE CORRECTION DU FRANCAIS — BREVET (DNB, serie generale).
 *
 * Fichier volontairement PUR : aucun import, aucun acces reseau, aucune
 * dependance a Deno ni a Node. Utilise par :
 *   • l'Edge Function `correct-brevet-francais` (Deno) ;
 *   • l'application Next.js, via `src/lib/brevetFrancaisNoyau.ts` ;
 *   • les tests hors ligne (`npm run test:brevet:francais`).
 *
 * CE FICHIER NE CONNAIT PAS LES MATHEMATIQUES, ET NE CONNAIT PAS LE BAC.
 * Il n'importe ni `brevet-maths-noyau.ts`, ni `bareme-noyau.ts`. Les quelques
 * utilitaires communs (arrondi, bornes) sont reecrits ici plutot qu'importes :
 * c'est la convention deja suivie par `bareme-noyau.ts` et `hggsp-noyau.ts`,
 * et elle garantit qu'une regle de francais ne peut pas fuir ailleurs.
 *
 * L'EPREUVE (note de service NOR MENE2515977N, BO n° 33 du 4 septembre 2025)
 * -------------------------------------------------------------------------
 *   Duree 3 h. Bareme total 100 points, ramene sur 20.
 *   • Travail sur le texte litteraire et, eventuellement, sur une image : 50 pts
 *     (grammaire et competences linguistiques — dont la REECRITURE —
 *      + comprehension et competences d'interpretation) ;
 *   • Dictee : 10 pts (600 signes environ en serie generale) ;
 *   • Redaction : 40 pts, deux sujets au choix (reflexion / imagination).
 *
 * CE QUE CE FICHIER NE FAIT JAMAIS
 * --------------------------------
 * 1. Il n'invente pas de bareme. Quand le sujet en porte un, c'est lui qui
 *    decide. Quand il n'y en a pas — cas de la dictee, pour laquelle aucun
 *    bareme national n'existe — le moteur REFUSE de noter et demande une
 *    validation humaine, plutot que d'appliquer une regle inventee.
 * 2. Il n'exige pas une formulation identique au corrige : une reponse
 *    semantiquement equivalente qui repond reellement a la question est juste.
 * 3. Il ne penalise pas deux fois la meme faiblesse.
 * 4. Il ne transforme jamais une zone illisible en faute.
 */

/* ================================================================== */
/*  0. Utilitaires locaux                                             */
/* ================================================================== */

export function arrondiFr(n: number): number {
  return Math.round(n * 100) / 100;
}

function bornerFr(valeur: number, max: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return arrondiFr(Math.max(0, Math.min(max, valeur)));
}

function listeTextes(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}

/* ================================================================== */
/*  1. Structure de l'epreuve                                         */
/* ================================================================== */

export const BAREME_TOTAL_FRANCAIS = 100;

/** Les trois blocs indepandants du §6, avec leur maximum officiel. */
export const BLOCS_FRANCAIS = [
  {
    code: 'texte',
    libelle: 'Travail sur le texte, compréhension, interprétation, grammaire',
    max: 50,
    duree: '1 h 10',
  },
  { code: 'dictee', libelle: 'Dictée', max: 10, duree: '20 min' },
  { code: 'redaction', libelle: 'Rédaction', max: 40, duree: '1 h 30' },
] as const;

export type CodeBlocFrancais = (typeof BLOCS_FRANCAIS)[number]['code'];

/**
 * Les parties de barème.
 *
 * Le bloc « texte » se subdivise, dans les sujets réels, en deux sous-parties
 * que le sujet zéro de la session 2026 nomme explicitement :
 *   • « Compréhension et compétences d'interprétation » — 32 points ;
 *   • « Grammaire et compétences linguistiques » — 18 points, dont la
 *     réécriture (10 points dans ce sujet).
 * Leur somme vaut les 50 points du bloc. `texte` reste accepté comme partie
 * générique, pour un sujet qui ne distinguerait pas les deux.
 *
 * `reecriture` est une SOUS-PARTIE de la grammaire : la note de service la
 * range dans « grammaire et compétences linguistiques ». Ses points comptent
 * dans les 50, jamais en plus.
 */
export const PARTIES_FRANCAIS = [
  'texte',
  'comprehension',
  'grammaire',
  'reecriture',
  'dictee',
  'redaction',
] as const;
export type PartieFrancais = (typeof PARTIES_FRANCAIS)[number];

export const BLOC_DE_LA_PARTIE: Record<PartieFrancais, CodeBlocFrancais> = {
  texte: 'texte',
  comprehension: 'texte',
  grammaire: 'texte',
  reecriture: 'texte',
  dictee: 'dictee',
  redaction: 'redaction',
};

/** Les parties qui composent les 50 points du travail sur le texte. */
export const PARTIES_DU_BLOC_TEXTE: PartieFrancais[] = ['texte', 'comprehension', 'grammaire'];

export const LIBELLES_PARTIE_FRANCAIS: Record<PartieFrancais, string> = {
  texte: 'Travail sur le texte',
  comprehension: 'Compréhension et compétences d’interprétation',
  grammaire: 'Grammaire et compétences linguistiques',
  reecriture: 'Réécriture',
  dictee: 'Dictée',
  redaction: 'Rédaction',
};

/** Les vingt-cinq types de questions à gérer au §6.1. */
export const TYPES_QUESTION_FRANCAIS = [
  'prelevement_explicite',
  'reformulation',
  'comprehension_globale',
  'interpretation',
  'justification_par_le_texte',
  'citation',
  'analyse_de_procede',
  'effet_produit',
  'point_de_vue_argumente',
  'comparaison_texte_image',
  'lexique',
  'synonymie_antonymie',
  'formation_des_mots',
  'nature_et_fonction',
  'proposition',
  'subordination',
  'temps_et_modes',
  'valeur_des_temps',
  'accords',
  'transformation',
  'reecriture',
  'manipulation_grammaticale',
  'figure_de_style',
  'reponse_courte',
  'reponse_construite',
] as const;

export type TypeQuestionFrancais = (typeof TYPES_QUESTION_FRANCAIS)[number];

/** Les douze statuts de réponse à distinguer au §6.1. */
export const STATUTS_REPONSE_FRANCAIS = [
  'exacte',
  'partiellement_exacte',
  'juste_mais_peu_justifiee',
  'equivalente_vocabulaire_different',
  'plausible_non_etayee',
  'citation_sans_explication',
  'explication_sans_citation_exigee',
  'erreur_de_comprehension',
  'erreur_de_langue',
  'hors_sujet',
  'absence_de_reponse',
  'illisible',
] as const;

export type StatutReponseFrancais = (typeof STATUTS_REPONSE_FRANCAIS)[number];

/**
 * Statuts qui n'autorisent JAMAIS le plein des points, et statuts qui
 * n'autorisent jamais zéro d'office.
 *
 * `equivalente_vocabulaire_different` mérite le plein : « il ne faut pas
 * exiger une formulation identique au corrigé ». `illisible` n'est pas une
 * absence de réponse : il part en validation humaine.
 */
export const STATUTS_PLEIN_AUTORISE: StatutReponseFrancais[] = [
  'exacte',
  'equivalente_vocabulaire_different',
];

export const STATUTS_SANS_ZERO_AUTOMATIQUE: StatutReponseFrancais[] = [
  'illisible',
  'equivalente_vocabulaire_different',
  'juste_mais_peu_justifiee',
  'partiellement_exacte',
];

/* ================================================================== */
/*  2. Taxonomie d'erreurs                                            */
/* ================================================================== */

/** Les vingt-cinq catégories minimales du §7. */
export const CATEGORIES_ERREUR_FRANCAIS = [
  'comprehension',
  'interpretation',
  'justification',
  'citation',
  'analyse_stylistique',
  'lexique',
  'grammaire',
  'conjugaison',
  'orthographe_grammaticale',
  'orthographe_lexicale',
  'syntaxe',
  'ponctuation',
  'reecriture',
  'dictee',
  'respect_de_la_consigne',
  'coherence',
  'organisation',
  'argumentation',
  'exemples',
  'expression',
  'hors_sujet',
  'reponse_incomplete',
  'absence_de_reponse',
  'illisibilite',
  'reconnaissance_incertaine',
] as const;

export type CategorieErreurFrancais = (typeof CATEGORIES_ERREUR_FRANCAIS)[number];

/**
 * Les catégories qui ne décrivent PAS une faute de l'élève.
 * Elles ne peuvent jamais, à elles seules, justifier un retrait de points.
 */
export const CATEGORIES_NON_IMPUTABLES: CategorieErreurFrancais[] = [
  'illisibilite',
  'reconnaissance_incertaine',
];

export type Gravite = 'mineure' | 'moderee' | 'majeure';

/**
 * Une erreur type, telle que l'administratrice la définit (§7).
 *
 * La gravité seule ne suffit pas : `penalite_defaut` et `regle_application`
 * permettent d'attacher une perte de points précise, avec un plafond et une
 * règle de cumul. Un code sans `penalite_defaut` est purement pédagogique.
 */
export type ErreurTypeFrancais = {
  code: string;
  matiere: 'brevet_francais';
  partie: PartieFrancais | 'toutes';
  categorie: CategorieErreurFrancais;
  sous_categorie: string | null;
  libelle_eleve: string;
  explication: string;
  gravite: Gravite;
  penalite_defaut: number | null;
  regle_application: string | null;
  plafond_perte: number | null;
  cumul_autorise: boolean;
  points_partiels_possibles: boolean;
  exemple: string | null;
  conseil: string | null;
  competence: string | null;
  source: string;
  version: string;
};

export type EvenementErreurFrancais = {
  code: string;
  cible: string;
  citation: string | null;
  certitude: number;
  /** Effet RÉEL sur les points, mesuré, pas la gravité annoncée. */
  effet_points: number;
  categorie: CategorieErreurFrancais | null;
};

/* ================================================================== */
/*  3. Bloc « travail sur le texte » — 50 points                      */
/* ================================================================== */

/**
 * Une question du barème du sujet, reconstruite question par question (§6.1).
 * Tout est porté par le sujet : rien n'est déduit d'une grille générique.
 */
export type QuestionFrancais = {
  question_key: string;
  numero: string;
  sous_numero: string | null;
  partie: PartieFrancais;
  formulation: string;
  competence_evaluee: string | null;
  type_reponse: TypeQuestionFrancais;
  elements_attendus: string[];
  max_points: number;
  reponses_alternatives: string[];
  citations_attendues: string[];
  degre_justification: 'aucun' | 'mention' | 'citation' | 'citation_expliquee';
  regles_points_partiels: { points: number; condition: string; cumulable: boolean }[];
  erreurs_caracteristiques: string[];
  depend_de: string[];
  codes_erreurs: string[];
};

export type ReponseQuestionFrancaisIA = {
  question_key: string;
  score?: number;
  statut?: StatutReponseFrancais;
  reponse_detectee?: string;
  elements_trouves?: string[];
  elements_manquants?: string[];
  citations_relevees?: string[];
  erreurs?: { code: string; citation?: string; certitude?: number }[];
  preuves?: { page?: number; citation: string; explication?: string }[];
  source_decision?: string;
  nature_decision?: string;
  transcription_incertaine?: boolean;
  justification?: string;
  certitude?: number;
};

export type QuestionCorrigeeFrancais = {
  question_key: string;
  numero: string;
  partie: PartieFrancais;
  type_reponse: TypeQuestionFrancais;
  points: number;
  max_points: number;
  statut: StatutReponseFrancais;
  reponse_detectee: string;
  reponse_attendue: string;
  elements_trouves: string[];
  elements_manquants: string[];
  citations_relevees: string[];
  erreurs: { code: string; citation: string | null; certitude: number }[];
  preuves: { page: number | null; citation: string; explication: string }[];
  source_decision: string;
  nature_decision: string;
  transcription_incertaine: boolean;
  justification: string;
  certitude: number;
  alertes: string[];
};

/**
 * Normalisation d'une réponse du modèle contre le barème du sujet.
 *
 * Le barème fait foi : une question absente de la réponse existe quand même,
 * à 0 et en validation humaine ; une question inventée par le modèle est
 * écartée de la note. Les statuts contraignent les points :
 *   • plein interdit hors `exacte` / `equivalente_vocabulaire_different` ;
 *   • zéro interdit d'office sur `illisible` (§ « ne jamais assimiler une zone
 *     illisible à une absence de réponse ») — les points restent, la question
 *     part en validation humaine.
 */
export function normaliserQuestionsFrancais(
  bareme: QuestionFrancais[],
  sortie: ReponseQuestionFrancaisIA[],
): { questions: QuestionCorrigeeFrancais[]; alertes: string[] } {
  const parCle = new Map(sortie.map((q) => [String(q.question_key ?? ''), q]));
  const clesBareme = new Set(bareme.map((q) => q.question_key));
  const alertes: string[] = [];

  const questions = bareme.map<QuestionCorrigeeFrancais>((def) => {
    const brut = parCle.get(def.question_key);
    const alertesQuestion: string[] = [];

    if (!brut) {
      alertes.push(
        `Question ${def.numero} : le correcteur n'a rien renvoyé. 0 point posé et validation humaine demandée.`,
      );
      return questionVideFrancais(def, [
        'Question absente de la réponse du correcteur : la note ne peut pas être garantie.',
      ]);
    }

    const statut = (
      STATUTS_REPONSE_FRANCAIS as readonly string[]
    ).includes(String(brut.statut))
      ? (brut.statut as StatutReponseFrancais)
      : 'partiellement_exacte';

    const demande = Number(brut.score ?? 0);
    let points = bornerFr(demande, def.max_points);

    if (Math.abs(points - demande) > 0.001) {
      const message = `Question ${def.numero} : ${demande} point(s) proposé(s) pour un maximum de ${def.max_points}, ramené à ${points}.`;
      alertesQuestion.push(message);
      alertes.push(message);
    }

    // Le plein des points est réservé aux réponses réellement exactes ou
    // sémantiquement équivalentes. Ailleurs, il reste au moins un quart de
    // point à gagner : le correcteur doit dire ce qui manque.
    if (points >= def.max_points - 0.001 && !STATUTS_PLEIN_AUTORISE.includes(statut)) {
      points = bornerFr(def.max_points - 0.25, def.max_points);
      const message = `Question ${def.numero} : statut « ${statut} » incompatible avec le plein des points, ramené à ${points}.`;
      alertesQuestion.push(message);
      alertes.push(message);
    }

    // Une zone illisible n'est pas une faute : on ne met pas zéro, on demande
    // qu'un humain regarde l'image d'origine.
    if (statut === 'illisible' && points === 0) {
      alertesQuestion.push(
        `Question ${def.numero} : réponse illisible notée 0. Une zone illisible n'est pas une absence de réponse — à vérifier sur l'original.`,
      );
    }

    return {
      question_key: def.question_key,
      numero: def.numero,
      partie: def.partie,
      type_reponse: def.type_reponse,
      points,
      max_points: def.max_points,
      statut,
      reponse_detectee: String(brut.reponse_detectee ?? '').trim(),
      reponse_attendue: def.elements_attendus.join(' · '),
      elements_trouves: listeTextes(brut.elements_trouves),
      elements_manquants: listeTextes(brut.elements_manquants),
      citations_relevees: listeTextes(brut.citations_relevees),
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
      source_decision: String(brut.source_decision ?? 'subject_bareme'),
      nature_decision: String(brut.nature_decision ?? 'prevue_par_bareme'),
      transcription_incertaine: brut.transcription_incertaine === true || statut === 'illisible',
      justification: String(brut.justification ?? ''),
      certitude: typeof brut.certitude === 'number' ? brut.certitude : 1,
      alertes: alertesQuestion,
    };
  });

  for (const renvoyee of sortie) {
    const cle = String(renvoyee.question_key ?? '');
    if (cle && !clesBareme.has(cle)) {
      alertes.push(
        `Le correcteur a noté une question « ${cle} » absente du barème : elle ne compte pas dans la note.`,
      );
    }
  }

  return { questions, alertes };
}

function questionVideFrancais(
  def: QuestionFrancais,
  alertes: string[],
): QuestionCorrigeeFrancais {
  return {
    question_key: def.question_key,
    numero: def.numero,
    partie: def.partie,
    type_reponse: def.type_reponse,
    points: 0,
    max_points: def.max_points,
    statut: 'absence_de_reponse',
    reponse_detectee: '',
    reponse_attendue: def.elements_attendus.join(' · '),
    elements_trouves: [],
    elements_manquants: def.elements_attendus,
    citations_relevees: [],
    erreurs: [],
    preuves: [],
    source_decision: 'subject_bareme',
    nature_decision: 'a_valider',
    transcription_incertaine: false,
    justification: '',
    certitude: 0,
    alertes,
  };
}

/**
 * Cohérence entre le degré de justification exigé et ce que la copie montre.
 *
 * Deux cas asymétriques, exigés au §6.1 :
 *   • une citation correcte sans explication, quand le barème exigeait une
 *     citation expliquée, ne vaut pas le plein ;
 *   • une explication correcte sans citation, quand la citation était exigée,
 *     ne vaut pas le plein non plus — mais elle ne vaut pas zéro.
 */
export function verifierJustification(
  bareme: QuestionFrancais[],
  questions: QuestionCorrigeeFrancais[],
): string[] {
  const parCle = new Map(bareme.map((q) => [q.question_key, q]));
  const alertes: string[] = [];

  for (const q of questions) {
    const def = parCle.get(q.question_key);
    if (!def) continue;
    const citationExigee = def.degre_justification === 'citation' || def.degre_justification === 'citation_expliquee';

    if (
      citationExigee &&
      q.citations_relevees.length === 0 &&
      q.points >= q.max_points - 0.001 &&
      q.statut !== 'illisible'
    ) {
      alertes.push(
        `Question ${q.numero} : le barème exige une citation du texte, aucune n'est relevée, et la question obtient pourtant le plein des points.`,
      );
    }
    if (
      def.degre_justification === 'citation_expliquee' &&
      q.statut === 'citation_sans_explication' &&
      q.points >= q.max_points - 0.001
    ) {
      alertes.push(
        `Question ${q.numero} : citation sans explication notée au plein alors que le barème attend une citation expliquée.`,
      );
    }
    if (q.statut === 'explication_sans_citation_exigee' && q.points === 0 && citationExigee) {
      alertes.push(
        `Question ${q.numero} : explication correcte mais sans la citation exigée, notée 0. Le barème du sujet doit dire ce que vaut l'idée seule — à trancher par un humain.`,
      );
    }
  }
  return alertes;
}

/* ================================================================== */
/*  4. Reecriture — traitement specifique                             */
/* ================================================================== */

/**
 * Un élément de réécriture, tel que le barème du sujet le décrit.
 * La note de service prévoit « cinq ou dix formes modifiées ».
 */
export type ItemReecriture = {
  cle: string;
  forme_originale: string;
  forme_attendue: string;
  transformation: string;
  points: number;
  variantes_admises: string[];
};

export type ConfigReecriture = {
  /** Barème spécifique aux erreurs de pure copie, prévu par la note de service. */
  penalite_erreur_copie: number | null;
  plafond_erreurs_copie: number | null;
  max_points: number;
  /** `true` si l'administratrice a bien renseigné le barème du sujet. */
  bareme_du_sujet_fourni: boolean;
};

export type FormeProduite = {
  cle: string;
  forme_produite: string;
  illisible?: boolean;
};

export type StatutReecriture =
  | 'exacte'
  | 'variante_admise'
  | 'transformation_manquee'
  | 'transformation_partielle'
  | 'erreur_de_copie_seule'
  | 'absente'
  | 'illisible';

export type ResultatFormeReecriture = {
  cle: string;
  forme_originale: string;
  forme_attendue: string;
  forme_produite: string;
  transformation: string;
  statut: StatutReecriture;
  points: number;
  max_points: number;
  type_erreur: string | null;
  justification: string;
  ambigu: boolean;
};

export type ResultatReecriture = {
  formes: ResultatFormeReecriture[];
  points_transformations: number;
  penalite_copie: number;
  erreurs_de_copie: number;
  score: number | null;
  max: number;
  alertes: string[];
  bareme_manquant: boolean;
};

/** Normalisation douce : espaces, apostrophes typographiques, casse. */
function normaliserForme(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '');
}

/** Retire les diacritiques : sert à isoler une erreur d'accent d'une erreur de transformation. */
function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Évaluation de la réécriture, forme par forme (§6.2).
 *
 * Trois principes, tous exigés :
 *   • on distingue l'erreur portant sur la TRANSFORMATION demandée de la
 *     simple erreur de copie ;
 *   • on n'applique JAMAIS deux pénalités à la même forme : une forme dont la
 *     transformation est manquée est déjà sanctionnée, elle ne l'est pas une
 *     seconde fois au titre de la copie ;
 *   • le barème du sujet décide. Sans barème de copie renseigné, la pénalité
 *     de copie vaut 0 et une alerte le dit, plutôt qu'un chiffre inventé.
 */
export function evaluerReecriture(
  items: ItemReecriture[],
  produites: FormeProduite[],
  config: ConfigReecriture,
): ResultatReecriture {
  const parCle = new Map(produites.map((p) => [p.cle, p]));
  const alertes: string[] = [];
  const formes: ResultatFormeReecriture[] = [];
  let pointsTransformations = 0;
  let erreursCopie = 0;

  for (const item of items) {
    const produite = parCle.get(item.cle);
    const attendue = normaliserForme(item.forme_attendue);
    const variantes = item.variantes_admises.map(normaliserForme);

    if (!produite || !produite.forme_produite.trim()) {
      formes.push({
        cle: item.cle,
        forme_originale: item.forme_originale,
        forme_attendue: item.forme_attendue,
        forme_produite: '',
        transformation: item.transformation,
        statut: 'absente',
        points: 0,
        max_points: item.points,
        type_erreur: 'REEC-ABSENTE',
        justification: 'Aucune forme produite pour cet élément de la réécriture.',
        ambigu: false,
      });
      continue;
    }

    if (produite.illisible) {
      // Illisible ≠ faux. La forme garde ses points en attendant qu'un humain
      // lise l'original : on ne fabrique pas une faute à partir d'un doute.
      formes.push({
        cle: item.cle,
        forme_originale: item.forme_originale,
        forme_attendue: item.forme_attendue,
        forme_produite: produite.forme_produite,
        transformation: item.transformation,
        statut: 'illisible',
        points: item.points,
        max_points: item.points,
        type_erreur: null,
        justification:
          'Forme illisible : les points sont provisoirement accordés, la lecture doit être vérifiée sur l’original.',
        ambigu: true,
      });
      pointsTransformations += item.points;
      alertes.push(
        `Réécriture, forme « ${item.forme_originale} » : lecture incertaine, à vérifier sur l'original avant de figer la note.`,
      );
      continue;
    }

    const produiteNorm = normaliserForme(produite.forme_produite);

    if (produiteNorm === attendue) {
      formes.push(formeJuste(item, produite.forme_produite, 'exacte', 'Transformation exacte.'));
      pointsTransformations += item.points;
      continue;
    }
    if (variantes.includes(produiteNorm)) {
      formes.push(
        formeJuste(
          item,
          produite.forme_produite,
          'variante_admise',
          'Variante explicitement admise par le barème du sujet.',
        ),
      );
      pointsTransformations += item.points;
      continue;
    }

    // La transformation est-elle réussie « à la copie près » ? On compare hors
    // accents et hors casse : si les deux coïncident alors, la morphologie
    // demandée est bonne et l'écart relève de la copie, pas de la transformation.
    const memeMorphologie = sansAccents(produiteNorm) === sansAccents(attendue);

    if (memeMorphologie) {
      erreursCopie += 1;
      formes.push({
        cle: item.cle,
        forme_originale: item.forme_originale,
        forme_attendue: item.forme_attendue,
        forme_produite: produite.forme_produite,
        transformation: item.transformation,
        statut: 'erreur_de_copie_seule',
        points: item.points,
        max_points: item.points,
        type_erreur: 'REEC-COPIE',
        justification:
          'La transformation demandée est réussie ; l’écart porte sur la copie (accent, casse), ' +
          'sanctionné à part par le barème spécifique et jamais deux fois.',
        ambigu: false,
      });
      pointsTransformations += item.points;
      continue;
    }

    // Transformation partielle : la forme produite diffère de l'originale
    // (l'élève a bien tenté quelque chose) mais n'atteint pas l'attendu.
    const aTente = normaliserForme(item.forme_originale) !== produiteNorm;
    const partielle = aTente && item.points > 0.25;

    formes.push({
      cle: item.cle,
      forme_originale: item.forme_originale,
      forme_attendue: item.forme_attendue,
      forme_produite: produite.forme_produite,
      transformation: item.transformation,
      statut: partielle ? 'transformation_partielle' : 'transformation_manquee',
      points: partielle ? arrondiFr(item.points / 2) : 0,
      max_points: item.points,
      type_erreur: 'REEC-TRANSFO',
      justification: partielle
        ? `Transformation engagée mais inachevée : « ${item.forme_originale} » → « ${produite.forme_produite} » au lieu de « ${item.forme_attendue} ».`
        : `Transformation non effectuée : « ${item.forme_originale} » reste « ${produite.forme_produite} ».`,
      ambigu: partielle,
    });
    if (partielle) {
      pointsTransformations += arrondiFr(item.points / 2);
      alertes.push(
        `Réécriture, forme « ${item.forme_originale} » : transformation partielle, points partiels proposés — à confirmer.`,
      );
    }
  }

  // Pénalité de copie : uniquement si le barème du sujet la prévoit.
  let penalite = 0;
  let baremeManquant = false;
  if (erreursCopie > 0) {
    if (config.penalite_erreur_copie === null) {
      baremeManquant = true;
      alertes.push(
        `${erreursCopie} erreur(s) de pure copie relevée(s), mais le barème spécifique du sujet ` +
          "n'est pas renseigné : aucune pénalité n'est appliquée. Renseigne-le dans l'écran de configuration.",
      );
    } else {
      penalite = erreursCopie * config.penalite_erreur_copie;
      if (config.plafond_erreurs_copie !== null) {
        penalite = Math.min(penalite, config.plafond_erreurs_copie);
      }
    }
  }

  const score = bornerFr(pointsTransformations - penalite, config.max_points);

  if (!config.bareme_du_sujet_fourni) {
    alertes.push(
      "Le barème de réécriture n'a pas été saisi pour ce sujet : la répartition des points est une hypothèse, à valider.",
    );
  }

  return {
    formes,
    points_transformations: arrondiFr(pointsTransformations),
    penalite_copie: arrondiFr(penalite),
    erreurs_de_copie: erreursCopie,
    score: config.bareme_du_sujet_fourni ? score : null,
    max: config.max_points,
    alertes,
    bareme_manquant: baremeManquant || !config.bareme_du_sujet_fourni,
  };
}

function formeJuste(
  item: ItemReecriture,
  produite: string,
  statut: StatutReecriture,
  justification: string,
): ResultatFormeReecriture {
  return {
    cle: item.cle,
    forme_originale: item.forme_originale,
    forme_attendue: item.forme_attendue,
    forme_produite: produite,
    transformation: item.transformation,
    statut,
    points: item.points,
    max_points: item.points,
    type_erreur: null,
    justification,
    ambigu: false,
  };
}

/* ================================================================== */
/*  5. Dictee — 10 points                                             */
/* ================================================================== */

/** Les catégories d'erreurs de dictée à distinguer (§6.3). */
export const CATEGORIES_DICTEE = [
  'mot_oublie',
  'mot_ajoute',
  'substitution',
  'accord',
  'grammaire',
  'lexique',
  'conjugaison',
  'homophone',
  'accent',
  'majuscule',
  'ponctuation',
  'trait_union',
  'apostrophe',
  'segmentation',
  'graphie_rectifiee',
  'reconnaissance_ocr',
] as const;

export type CategorieDictee = (typeof CATEGORIES_DICTEE)[number];

/**
 * Une règle de retrait, PROPRE AU SUJET, saisie par l'administratrice.
 * Aucune valeur par défaut n'est codée en dur : le §6.3 l'interdit
 * explicitement (« ne crée pas un barème arbitraire universel »).
 */
export type RegleDictee = {
  categorie: CategorieDictee;
  sous_categorie: string | null;
  penalite: number;
  /** Retrait maximal imputable à cette catégorie. `null` = pas de plafond. */
  plafond: number | null;
  /** `false` : une même erreur répétée n'est comptée qu'une fois. */
  cumul_repetitions: boolean;
  regle: string;
};

export type ConfigDictee = {
  max_points: number;
  texte_attendu: string;
  regles: RegleDictee[];
  /** Graphies de l'orthographe rectifiée admises pour ce texte. */
  graphies_admises: string[];
  /** Retrait total plafonné (la dictée ne peut pas descendre sous 0). */
  plancher: number;
  /** Renseigné = le barème vient du sujet ou du corrigé officiel. */
  source_bareme: 'subject_bareme' | 'official_correction' | 'admin_instruction' | null;
};

export type ErreurDictee = {
  index: number;
  segment_attendu: string;
  segment_produit: string;
  categorie: CategorieDictee;
  sous_categorie: string | null;
  regle: string;
  penalite_prevue: number;
  penalite_appliquee: number;
  explication: string;
  certitude: number;
  /** Répétition d'une erreur déjà comptée plus haut. */
  repetition_de: number | null;
};

export type ResultatDictee = {
  score: number | null;
  max: number;
  penalite_totale: number;
  erreurs: ErreurDictee[];
  /** Nombre de mots du texte attendu réellement retrouvés. */
  mots_attendus: number;
  mots_apparies: number;
  decalage_ocr_suspecte: boolean;
  zones_illisibles: number;
  alertes: string[];
  bareme_manquant: boolean;
};

/** Longueur d'une série d'écarts consécutifs au-delà de laquelle on suspecte un décalage OCR. */
export const SEUIL_DECALAGE_OCR = 6;

function tokeniser(texte: string): string[] {
  return texte
    .replace(/[’‘]/g, "'")
    .match(/(\[illisible\]|[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[.,;:!?«»"()…])/gu)
    ?.filter(Boolean) ?? [];
}

function similarite(a: string, b: string): number {
  const x = sansAccents(a.toLowerCase());
  const y = sansAccents(b.toLowerCase());
  if (x === y) return 1;
  const n = x.length;
  const m = y.length;
  if (!n || !m) return 0;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) d[i][0] = i;
  for (let j = 0; j <= m; j += 1) d[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
  }
  return 1 - d[n][m] / Math.max(n, m);
}

type Operation =
  | { type: 'egal'; attendu: string; produit: string; i: number }
  | { type: 'substitution'; attendu: string; produit: string; i: number }
  | { type: 'oubli'; attendu: string; i: number }
  | { type: 'ajout'; produit: string; i: number };

/**
 * Alignement mot à mot du texte attendu et du texte produit.
 *
 * Programmation dynamique classique (Needleman-Wunsch), avec un coût de
 * substitution qui décroît avec la ressemblance : « chevaux » écrit
 * « chevaus » s'aligne, et devient UNE substitution, au lieu de produire un
 * oubli suivi d'un ajout — c'est ce qui empêche la multiplication artificielle
 * des erreurs exigée au §6.3.
 */
function aligner(attendus: string[], produits: string[]): Operation[] {
  const n = attendus.length;
  const m = produits.length;
  const cout: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) cout[i][0] = i;
  for (let j = 0; j <= m; j += 1) cout[0][j] = j;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const sim = similarite(attendus[i - 1], produits[j - 1]);
      const coutSub = sim === 1 ? 0 : 1 - sim * 0.5;
      cout[i][j] = Math.min(
        cout[i - 1][j - 1] + coutSub,
        cout[i - 1][j] + 1,
        cout[i][j - 1] + 1,
      );
    }
  }

  const operations: Operation[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = similarite(attendus[i - 1], produits[j - 1]);
      const coutSub = sim === 1 ? 0 : 1 - sim * 0.5;
      if (Math.abs(cout[i][j] - (cout[i - 1][j - 1] + coutSub)) < 1e-9) {
        operations.push(
          sim === 1
            ? { type: 'egal', attendu: attendus[i - 1], produit: produits[j - 1], i: i - 1 }
            : { type: 'substitution', attendu: attendus[i - 1], produit: produits[j - 1], i: i - 1 },
        );
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && Math.abs(cout[i][j] - (cout[i - 1][j] + 1)) < 1e-9) {
      operations.push({ type: 'oubli', attendu: attendus[i - 1], i: i - 1 });
      i -= 1;
      continue;
    }
    operations.push({ type: 'ajout', produit: produits[j - 1], i });
    j -= 1;
  }
  return operations.reverse();
}

const PONCTUATION = /^[.,;:!?«»"()…]$/;

/** Classement d'une substitution dans les catégories du §6.3. */
export function classerSubstitution(attendu: string, produit: string): {
  categorie: CategorieDictee;
  sous_categorie: string | null;
  explication: string;
} {
  const a = attendu.replace(/[’‘]/g, "'");
  const p = produit.replace(/[’‘]/g, "'");

  if (PONCTUATION.test(a) || PONCTUATION.test(p)) {
    return { categorie: 'ponctuation', sous_categorie: null, explication: 'Signe de ponctuation différent de celui du texte dicté.' };
  }
  if (a.toLowerCase() === p.toLowerCase() && a !== p) {
    return { categorie: 'majuscule', sous_categorie: null, explication: 'Majuscule ou minuscule erronée.' };
  }
  if (sansAccents(a) === sansAccents(p) && a !== p) {
    return { categorie: 'accent', sous_categorie: null, explication: 'Accent oublié, ajouté ou mal choisi.' };
  }
  if (a.includes('-') !== p.includes('-') && a.replace(/-/g, '') === p.replace(/-/g, '')) {
    return { categorie: 'trait_union', sous_categorie: null, explication: 'Trait d’union oublié ou ajouté.' };
  }
  if (a.includes("'") !== p.includes("'") && a.replace(/'/g, '') === p.replace(/'/g, '')) {
    return { categorie: 'apostrophe', sous_categorie: null, explication: 'Apostrophe oubliée ou ajoutée.' };
  }
  // Même radical, terminaison différente : accord ou conjugaison.
  const radicalA = sansAccents(a.toLowerCase());
  const radicalP = sansAccents(p.toLowerCase());
  const communs = Math.min(radicalA.length, radicalP.length);
  let prefixe = 0;
  while (prefixe < communs && radicalA[prefixe] === radicalP[prefixe]) prefixe += 1;
  if (prefixe >= 3 && prefixe >= radicalA.length - 3) {
    const finA = radicalA.slice(prefixe);
    const finP = radicalP.slice(prefixe);
    const marquesVerbales = ['ai', 'ais', 'ait', 'aient', 'er', 'e', 'es', 'ez', 'ons', 'ont', 'a', 'as'];
    if (marquesVerbales.includes(finA) || marquesVerbales.includes(finP)) {
      return {
        categorie: 'conjugaison',
        sous_categorie: 'terminaison verbale',
        explication: 'Terminaison verbale erronée (temps, personne ou mode).',
      };
    }
    return {
      categorie: 'accord',
      sous_categorie: 'marque finale',
      explication: 'Marque d’accord erronée (nombre, genre ou participe passé).',
    };
  }
  if (similarite(a, p) >= 0.6) {
    return { categorie: 'lexique', sous_categorie: 'orthographe lexicale', explication: 'Orthographe lexicale du mot erronée.' };
  }
  return {
    categorie: 'homophone',
    sous_categorie: null,
    explication: 'Mot remplacé par un autre, probablement un homophone ou un mot voisin.',
  };
}

/**
 * Correction de la dictée (§6.3).
 *
 * Garde-fous, dans l'ordre où ils s'appliquent :
 *   1. Sans règles de retrait propres au sujet, AUCUNE note n'est produite —
 *      le §6.3 interdit d'inventer un barème universel. `score` vaut `null` et
 *      la copie part en validation humaine.
 *   2. Un marqueur `[illisible]` n'est jamais une faute.
 *   3. Une même erreur répétée n'est comptée qu'une fois, sauf si la règle du
 *      sujet dit le contraire.
 *   4. Une longue série d'écarts consécutifs est traitée comme un décalage de
 *      transcription, pas comme une avalanche de fautes.
 *   5. Chaque catégorie peut porter un plafond de perte.
 */
export function evaluerDictee(config: ConfigDictee, texteProduit: string): ResultatDictee {
  const alertes: string[] = [];
  const attendus = tokeniser(config.texte_attendu);
  const produits = tokeniser(texteProduit);

  if (!config.regles.length || config.source_bareme === null) {
    return {
      score: null,
      max: config.max_points,
      penalite_totale: 0,
      erreurs: [],
      mots_attendus: attendus.length,
      mots_apparies: 0,
      decalage_ocr_suspecte: false,
      zones_illisibles: produits.filter((t) => t === '[illisible]').length,
      alertes: [
        'Aucune règle de retrait n’est définie pour la dictée de ce sujet : le moteur refuse de noter ' +
          'plutôt que d’appliquer un barème inventé. Renseigne les règles dans l’écran de configuration.',
      ],
      bareme_manquant: true,
    };
  }

  const graphies = new Set(config.graphies_admises.map((g) => normaliserForme(g)));
  const operations = aligner(attendus, produits);

  // Détection d'un décalage de transcription : une longue série d'opérations
  // non identiques d'affilée trahit un désalignement, pas vingt fautes.
  //
  // Elle exige qu'AU MOINS UN mot se soit aligné. Sans aucun mot commun, il
  // ne s'agit pas d'un décalage mais d'une copie blanche ou d'un texte sans
  // rapport : les traiter comme un décalage rendrait le maximum à une copie
  // vide, ce qui serait faux.
  let serie = 0;
  let serieMax = 0;
  let alignes = 0;
  for (const op of operations) {
    if (op.type === 'egal') {
      serie = 0;
      alignes += 1;
    } else {
      serie += 1;
      serieMax = Math.max(serieMax, serie);
    }
  }
  const decalage = serieMax >= SEUIL_DECALAGE_OCR && alignes > 0;
  if (decalage) {
    alertes.push(
      `Série de ${serieMax} écarts consécutifs : décalage de transcription probable. Les erreurs de cette zone ` +
        'ne sont pas comptées et la dictée doit être relue par un humain.',
    );
  }
  if (alignes === 0 && attendus.length > 0) {
    alertes.push(
      produits.length === 0
        ? 'Aucun texte de dictée n’a été transcrit : copie blanche, ou dictée non retrouvée dans la copie. À vérifier avant de figer la note.'
        : 'Aucun mot du texte dicté n’a été retrouvé : la copie ne semble pas correspondre à cette dictée. À vérifier.',
    );
  }

  const parCategorie = new Map<CategorieDictee, RegleDictee>();
  for (const r of config.regles) parCategorie.set(r.categorie, r);

  const erreurs: ErreurDictee[] = [];
  const vues = new Map<string, number>();
  let apparies = 0;
  let illisibles = 0;
  let index = 0;

  for (const op of operations) {
    if (op.type === 'egal') {
      apparies += 1;
      continue;
    }
    if (
      (op.type === 'substitution' || op.type === 'ajout') &&
      ('produit' in op ? op.produit : '') === '[illisible]'
    ) {
      illisibles += 1;
      alertes.push(
        'Zone illisible dans la dictée : aucune faute n’est retenue à cet endroit, la lecture doit être vérifiée.',
      );
      continue;
    }

    let categorie: CategorieDictee;
    let sousCategorie: string | null = null;
    let explication: string;
    let attendu = '';
    let produit = '';

    if (op.type === 'oubli') {
      attendu = op.attendu;
      categorie = 'mot_oublie';
      explication = `Le mot « ${op.attendu} » du texte dicté n’a pas été écrit.`;
    } else if (op.type === 'ajout') {
      produit = op.produit;
      categorie = 'mot_ajoute';
      explication = `Le mot « ${op.produit} » ne figure pas dans le texte dicté.`;
    } else {
      attendu = op.attendu;
      produit = op.produit;
      if (graphies.has(normaliserForme(produit))) {
        // Graphie rectifiée explicitement admise : ce n'est pas une faute.
        apparies += 1;
        continue;
      }
      const classe = classerSubstitution(attendu, produit);
      categorie = classe.categorie;
      sousCategorie = classe.sous_categorie;
      explication = classe.explication;
    }

    const regle = parCategorie.get(categorie);
    if (!regle) {
      alertes.push(
        `Catégorie « ${categorie} » rencontrée sans règle de retrait dans le barème du sujet : ` +
          'aucune pénalité appliquée, à trancher par un humain.',
      );
    }

    const signature = `${categorie}|${sansAccents(attendu.toLowerCase())}|${sansAccents(produit.toLowerCase())}`;
    const premiere = vues.get(signature);
    const repetition = premiere !== undefined;
    if (!repetition) vues.set(signature, index);

    const cumul = regle?.cumul_repetitions ?? false;
    const penaltiePrevue = regle?.penalite ?? 0;
    const penaliteAppliquee = decalage
      ? 0
      : repetition && !cumul
        ? 0
        : penaltiePrevue;

    erreurs.push({
      index,
      segment_attendu: attendu,
      segment_produit: produit,
      categorie,
      sous_categorie: sousCategorie,
      regle: regle?.regle ?? 'Aucune règle définie pour cette catégorie dans le barème du sujet.',
      penalite_prevue: penaltiePrevue,
      penalite_appliquee: penaliteAppliquee,
      explication,
      // Un décalage suspecté abaisse la certitude sans supprimer l'observation.
      certitude: decalage ? 0.3 : op.type === 'substitution' ? 0.9 : 0.8,
      repetition_de: premiere ?? null,
    });
    index += 1;
  }

  // Plafonds par catégorie, appliqués APRÈS coup pour ne jamais dépasser ce
  // que le barème du sujet autorise à retirer.
  const cumulParCategorie = new Map<CategorieDictee, number>();
  let total = 0;
  for (const e of erreurs) {
    const regle = parCategorie.get(e.categorie);
    const dejaRetire = cumulParCategorie.get(e.categorie) ?? 0;
    let effectif = e.penalite_appliquee;
    if (regle?.plafond !== null && regle?.plafond !== undefined) {
      effectif = Math.max(0, Math.min(effectif, regle.plafond - dejaRetire));
      if (effectif < e.penalite_appliquee) {
        e.explication += ` (plafond de ${regle.plafond} point(s) atteint pour cette catégorie)`;
      }
    }
    e.penalite_appliquee = arrondiFr(effectif);
    cumulParCategorie.set(e.categorie, dejaRetire + effectif);
    total += effectif;
  }

  const score = Math.max(config.plancher, arrondiFr(config.max_points - total));

  return {
    score: bornerFr(score, config.max_points),
    max: config.max_points,
    penalite_totale: arrondiFr(total),
    erreurs,
    mots_attendus: attendus.length,
    mots_apparies: apparies,
    decalage_ocr_suspecte: decalage,
    zones_illisibles: illisibles,
    alertes,
    bareme_manquant: false,
  };
}

/* ================================================================== */
/*  6. Redaction — 40 points, deux grilles                            */
/* ================================================================== */

export type SujetRedaction =
  | 'imagination'
  | 'reflexion'
  | 'incertain'
  | 'les_deux'
  | 'non_identifiable';

/**
 * Critères de la grille d'IMAGINATION (§6.4).
 * Ce sont des axes d'évaluation par défaut : la grille réellement appliquée
 * est celle du sujet, si elle existe. Ces axes ne servent que lorsque le
 * sujet n'en fournit pas, et la correction porte alors `default_rubric`.
 */
export const AXES_IMAGINATION = [
  { code: 'consigne', libelle: 'Respect de la consigne' },
  { code: 'enonciation', libelle: 'Respect de la situation d’énonciation' },
  { code: 'coherence_support', libelle: 'Cohérence avec le texte support' },
  { code: 'genre', libelle: 'Respect du genre demandé' },
  { code: 'point_de_vue', libelle: 'Respect du point de vue' },
  { code: 'organisation_recit', libelle: 'Organisation du récit' },
  { code: 'progression', libelle: 'Progression' },
  { code: 'coherence', libelle: 'Cohérence' },
  { code: 'personnages', libelle: 'Construction des personnages' },
  { code: 'dialogue', libelle: 'Utilisation du dialogue' },
  { code: 'descriptions', libelle: 'Descriptions' },
  { code: 'idees', libelle: 'Richesse et pertinence des idées' },
  { code: 'vocabulaire', libelle: 'Précision du vocabulaire' },
  { code: 'syntaxe', libelle: 'Syntaxe' },
  { code: 'orthographe', libelle: 'Orthographe' },
  { code: 'conjugaison', libelle: 'Conjugaison' },
  { code: 'ponctuation', libelle: 'Ponctuation' },
  { code: 'paragraphes', libelle: 'Paragraphes' },
  { code: 'longueur', libelle: 'Longueur attendue' },
  { code: 'expression', libelle: 'Qualité globale de l’expression' },
] as const;

/** Critères de la grille de RÉFLEXION (§6.4). Distincte, jamais fusionnée. */
export const AXES_REFLEXION = [
  { code: 'comprehension_question', libelle: 'Compréhension exacte de la question' },
  { code: 'prise_de_position', libelle: 'Prise de position' },
  { code: 'pertinence_arguments', libelle: 'Pertinence des arguments' },
  { code: 'developpement_arguments', libelle: 'Développement des arguments' },
  { code: 'exemples', libelle: 'Exemples' },
  { code: 'articulation', libelle: 'Articulation entre arguments et exemples' },
  { code: 'organisation', libelle: 'Organisation du devoir' },
  { code: 'introduction', libelle: 'Introduction, si elle est pertinente' },
  { code: 'progression', libelle: 'Progression logique' },
  { code: 'paragraphes', libelle: 'Paragraphes' },
  { code: 'connecteurs', libelle: 'Connecteurs' },
  { code: 'conclusion', libelle: 'Conclusion, si elle est pertinente' },
  { code: 'nuance', libelle: 'Nuance' },
  { code: 'coherence', libelle: 'Cohérence' },
  { code: 'vocabulaire', libelle: 'Vocabulaire' },
  { code: 'syntaxe', libelle: 'Syntaxe' },
  { code: 'orthographe', libelle: 'Orthographe' },
  { code: 'ponctuation', libelle: 'Ponctuation' },
  { code: 'longueur', libelle: 'Longueur attendue' },
  { code: 'expression', libelle: 'Qualité globale de l’expression' },
] as const;

/**
 * Familles de critères, pour la non-double-pénalisation (§6.4).
 * Une même faiblesse observée ne peut faire baisser qu'UN critère par famille,
 * sauf si le barème du sujet l'autorise explicitement.
 */
export const FAMILLES_CRITERES: Record<string, string> = {
  orthographe: 'langue',
  conjugaison: 'langue',
  syntaxe: 'langue',
  ponctuation: 'langue',
  vocabulaire: 'langue',
  expression: 'langue',
  consigne: 'consigne',
  genre: 'consigne',
  point_de_vue: 'consigne',
  enonciation: 'consigne',
  longueur: 'consigne',
  organisation: 'organisation',
  organisation_recit: 'organisation',
  paragraphes: 'organisation',
  progression: 'organisation',
  connecteurs: 'organisation',
  introduction: 'organisation',
  conclusion: 'organisation',
  coherence: 'contenu',
  coherence_support: 'contenu',
  idees: 'contenu',
  personnages: 'contenu',
  descriptions: 'contenu',
  dialogue: 'contenu',
  pertinence_arguments: 'contenu',
  developpement_arguments: 'contenu',
  exemples: 'contenu',
  articulation: 'contenu',
  nuance: 'contenu',
  comprehension_question: 'contenu',
  prise_de_position: 'contenu',
};

export type CritereRedaction = {
  code: string;
  libelle: string;
  max_points: number;
  descripteurs: { niveau: string; description: string; points: number }[];
  /** Le barème du sujet autorise-t-il ce critère à cumuler avec sa famille ? */
  cumul_famille_autorise: boolean;
};

export type GrilleRedaction = {
  type_sujet: 'imagination' | 'reflexion';
  intitule: string;
  max_points: number;
  longueur_minimale: number | null;
  criteres: CritereRedaction[];
  /** `true` si la grille vient du sujet ou de son corrigé, `false` si par défaut. */
  issue_du_sujet: boolean;
};

export type ScoreCritereIA = {
  code: string;
  score?: number;
  niveau?: string;
  preuves?: string[];
  points_forts?: string[];
  insuffisances?: string[];
  erreurs_representatives?: { code: string; citation?: string }[];
  conseil?: string;
  certitude?: number;
};

export type CritereCorrige = {
  code: string;
  libelle: string;
  score: number;
  max: number;
  niveau: string;
  preuves: string[];
  points_forts: string[];
  insuffisances: string[];
  erreurs_representatives: { code: string; citation: string | null }[];
  conseil: string;
  certitude: number;
  alertes: string[];
};

export type ResultatRedaction = {
  sujet_choisi: SujetRedaction;
  grille_appliquee: 'imagination' | 'reflexion' | null;
  grille_issue_du_sujet: boolean;
  criteres: CritereCorrige[];
  score: number | null;
  max: number;
  longueur_estimee: number | null;
  longueur_minimale: number | null;
  alertes: string[];
  doubles_penalisations_evitees: string[];
};

/**
 * Correction de la rédaction (§6.4).
 *
 * Trois refus explicites :
 *   • pas de grille unique artificielle : imagination et réflexion ont chacune
 *     la leur, et on n'applique jamais l'une pour l'autre ;
 *   • pas de correction de lycée : les descripteurs viennent du sujet, écrit
 *     pour un élève de troisième ;
 *   • pas de double pénalisation : une faiblesse déjà payée dans sa famille de
 *     critères ne l'est pas une seconde fois ailleurs.
 */
export function evaluerRedaction(entree: {
  sujetChoisi: SujetRedaction;
  grilles: GrilleRedaction[];
  scores: ScoreCritereIA[];
  longueurEstimee: number | null;
  erreursParFamille?: { famille: string; codes: string[] }[];
}): ResultatRedaction {
  const alertes: string[] = [];

  if (
    entree.sujetChoisi === 'incertain' ||
    entree.sujetChoisi === 'les_deux' ||
    entree.sujetChoisi === 'non_identifiable'
  ) {
    alertes.push(
      entree.sujetChoisi === 'les_deux'
        ? 'La copie semble traiter les DEUX sujets de rédaction. Un humain doit dire lequel est évalué : aucune note n’est posée.'
        : 'Le sujet de rédaction traité n’a pas pu être identifié avec certitude : aucune note n’est posée.',
    );
    return {
      sujet_choisi: entree.sujetChoisi,
      grille_appliquee: null,
      grille_issue_du_sujet: false,
      criteres: [],
      score: null,
      max: 40,
      longueur_estimee: entree.longueurEstimee,
      longueur_minimale: null,
      alertes,
      doubles_penalisations_evitees: [],
    };
  }

  const grille = entree.grilles.find((g) => g.type_sujet === entree.sujetChoisi);
  if (!grille) {
    alertes.push(
      `Aucune grille n'est définie pour le sujet de ${entree.sujetChoisi} : impossible de corriger sans inventer un barème.`,
    );
    return {
      sujet_choisi: entree.sujetChoisi,
      grille_appliquee: entree.sujetChoisi,
      grille_issue_du_sujet: false,
      criteres: [],
      score: null,
      max: 40,
      longueur_estimee: entree.longueurEstimee,
      longueur_minimale: null,
      alertes,
      doubles_penalisations_evitees: [],
    };
  }

  if (!grille.issue_du_sujet) {
    alertes.push(
      'La grille appliquée est la grille par défaut : le sujet n’en fournissait pas. ' +
        'Les points restent à valider par un humain.',
    );
  }

  const parCode = new Map(entree.scores.map((s) => [s.code, s]));
  const evitees: string[] = [];
  const familleDejaPenalisee = new Set<string>();
  const criteres: CritereCorrige[] = [];

  for (const def of grille.criteres) {
    const brut = parCode.get(def.code);
    const alertesCritere: string[] = [];

    if (!brut) {
      alertesCritere.push('Critère non évalué par le correcteur : 0 posé et validation humaine demandée.');
      alertes.push(`Critère « ${def.libelle} » absent de la réponse du correcteur.`);
      criteres.push(critereVide(def, alertesCritere));
      continue;
    }

    let score = bornerFr(Number(brut.score ?? 0), def.max_points);
    if (Math.abs(score - Number(brut.score ?? 0)) > 0.001) {
      const message = `Critère « ${def.libelle} » : ${brut.score} proposé pour un maximum de ${def.max_points}, ramené à ${score}.`;
      alertesCritere.push(message);
      alertes.push(message);
    }

    // Non-double-pénalisation : si la même faiblesse a déjà coûté des points
    // dans cette famille, on ne la refait pas payer, sauf autorisation du barème.
    const famille = FAMILLES_CRITERES[def.code] ?? def.code;
    const aPerdu = score < def.max_points - 0.001;
    if (aPerdu && familleDejaPenalisee.has(famille) && !def.cumul_famille_autorise) {
      const codesPartages = (entree.erreursParFamille ?? []).find((f) => f.famille === famille);
      if (codesPartages && codesPartages.codes.length) {
        evitees.push(
          `Famille « ${famille} » : le critère « ${def.libelle} » n'est pas pénalisé une seconde fois pour ${codesPartages.codes.join(', ')}.`,
        );
        score = def.max_points;
        alertesCritere.push(
          'Points restitués : cette faiblesse est déjà sanctionnée dans la même famille de critères.',
        );
      }
    }
    if (aPerdu) familleDejaPenalisee.add(famille);

    criteres.push({
      code: def.code,
      libelle: def.libelle,
      score,
      max: def.max_points,
      niveau: String(brut.niveau ?? ''),
      preuves: listeTextes(brut.preuves),
      points_forts: listeTextes(brut.points_forts),
      insuffisances: listeTextes(brut.insuffisances),
      erreurs_representatives: (brut.erreurs_representatives ?? []).map((e) => ({
        code: String(e.code),
        citation: e.citation ?? null,
      })),
      conseil: String(brut.conseil ?? ''),
      certitude: typeof brut.certitude === 'number' ? brut.certitude : 1,
      alertes: alertesCritere,
    });
  }

  for (const s of entree.scores) {
    if (!grille.criteres.some((c) => c.code === s.code)) {
      alertes.push(
        `Le correcteur a noté un critère « ${s.code} » absent de la grille de ${grille.type_sujet} : il ne compte pas.`,
      );
    }
  }

  const score = arrondiFr(criteres.reduce((s, c) => s + c.score, 0));

  if (
    grille.longueur_minimale !== null &&
    entree.longueurEstimee !== null &&
    entree.longueurEstimee < grille.longueur_minimale
  ) {
    // La longueur insuffisante se paie par le critère `longueur` du barème,
    // jamais par un retrait supplémentaire décidé ici.
    alertes.push(
      `Longueur estimée à ${entree.longueurEstimee} lignes pour un minimum de ${grille.longueur_minimale} annoncé par le sujet : ` +
        'la perte est portée par le critère « Longueur attendue », sans retrait supplémentaire.',
    );
  }

  return {
    sujet_choisi: entree.sujetChoisi,
    grille_appliquee: grille.type_sujet,
    grille_issue_du_sujet: grille.issue_du_sujet,
    criteres,
    score: bornerFr(score, grille.max_points),
    max: grille.max_points,
    longueur_estimee: entree.longueurEstimee,
    longueur_minimale: grille.longueur_minimale,
    alertes,
    doubles_penalisations_evitees: evitees,
  };
}

function critereVide(def: CritereRedaction, alertes: string[]): CritereCorrige {
  return {
    code: def.code,
    libelle: def.libelle,
    score: 0,
    max: def.max_points,
    niveau: 'non_evalue',
    preuves: [],
    points_forts: [],
    insuffisances: [],
    erreurs_representatives: [],
    conseil: '',
    certitude: 0,
    alertes,
  };
}

/* ================================================================== */
/*  7. Assemblage du resultat                                         */
/* ================================================================== */

export type SectionFrancais = {
  code: CodeBlocFrancais;
  libelle: string;
  score: number | null;
  max: number;
  detail: unknown;
  alertes: string[];
};

export type ResultatFrancais = {
  sections: SectionFrancais[];
  questions: QuestionCorrigeeFrancais[];
  reecriture: ResultatReecriture | null;
  dictee: ResultatDictee | null;
  redaction: ResultatRedaction | null;
  score_brut: number;
  score_max: number;
  score_sur_20: number;
  /** `true` dès qu'un bloc n'a pas pu être noté : la note affichée est partielle. */
  note_partielle: boolean;
  blocs_non_notes: string[];
  erreurs: EvenementErreurFrancais[];
  alertes: string[];
};

/**
 * Assemble la note du français.
 *
 * La note est mécanique et se fait ICI, jamais par le modèle :
 *   travail sur le texte (questions + réécriture) + dictée + rédaction.
 *
 * Un bloc que le moteur a refusé de noter (dictée sans barème, sujet de
 * rédaction ambigu) ne vaut PAS zéro : il est retiré du total ET du maximum,
 * la note reste sur ce qui a pu être évalué, et `note_partielle` le dit.
 * Compter un bloc non noté comme zéro serait fabriquer une note fausse.
 */
export function assemblerResultatFrancais(entree: {
  questions: QuestionCorrigeeFrancais[];
  reecriture: ResultatReecriture | null;
  dictee: ResultatDictee | null;
  redaction: ResultatRedaction | null;
  alertes: string[];
}): ResultatFrancais {
  const alertes = [...entree.alertes];
  const blocsNonNotes: string[] = [];

  // Bloc « texte » : questions du barème (réécriture comprise, ses points
  // étant déjà portés par ses propres questions ou par son module).
  const questionsTexte = entree.questions.filter(
    (q) => BLOC_DE_LA_PARTIE[q.partie] === 'texte' && q.partie !== 'reecriture',
  );
  const scoreQuestions = arrondiFr(questionsTexte.reduce((s, q) => s + q.points, 0));
  const maxQuestions = arrondiFr(questionsTexte.reduce((s, q) => s + q.max_points, 0));

  const scoreReecriture = entree.reecriture?.score ?? null;
  const maxReecriture = entree.reecriture?.max ?? 0;

  const texteNotable = scoreReecriture !== null || !entree.reecriture;
  const scoreTexte = texteNotable ? arrondiFr(scoreQuestions + (scoreReecriture ?? 0)) : null;
  const maxTexte = arrondiFr(maxQuestions + maxReecriture);
  if (!texteNotable) blocsNonNotes.push('texte');

  const sections: SectionFrancais[] = [
    {
      code: 'texte',
      libelle: BLOCS_FRANCAIS[0].libelle,
      score: scoreTexte,
      max: maxTexte,
      detail: {
        questions: questionsTexte,
        reecriture: entree.reecriture,
      },
      alertes: entree.reecriture?.alertes ?? [],
    },
    {
      code: 'dictee',
      libelle: BLOCS_FRANCAIS[1].libelle,
      score: entree.dictee?.score ?? null,
      max: entree.dictee?.max ?? BLOCS_FRANCAIS[1].max,
      detail: entree.dictee,
      alertes: entree.dictee?.alertes ?? [],
    },
    {
      code: 'redaction',
      libelle: BLOCS_FRANCAIS[2].libelle,
      score: entree.redaction?.score ?? null,
      max: entree.redaction?.max ?? BLOCS_FRANCAIS[2].max,
      detail: entree.redaction,
      alertes: entree.redaction?.alertes ?? [],
    },
  ];

  for (const s of sections) {
    if (s.score === null && !blocsNonNotes.includes(s.code)) blocsNonNotes.push(s.code);
  }

  const scoreBrut = arrondiFr(
    sections.reduce((total, s) => total + (s.score ?? 0), 0),
  );
  const scoreMax = arrondiFr(
    sections.reduce((total, s) => total + (s.score === null ? 0 : s.max), 0),
  );

  // Le maximum théorique reste 100 : on le vérifie et on le signale, sans
  // jamais gonfler la note pour « atteindre » le total attendu.
  const maxTheorique = arrondiFr(sections.reduce((t, s) => t + s.max, 0));
  if (Math.abs(maxTheorique - BAREME_TOTAL_FRANCAIS) > 0.001) {
    alertes.push(
      `Le barème de ce sujet totalise ${maxTheorique} points au lieu des ${BAREME_TOTAL_FRANCAIS} prévus par la note de service.`,
    );
  }

  const erreurs: EvenementErreurFrancais[] = [];
  for (const q of entree.questions) {
    for (const e of q.erreurs) {
      erreurs.push({
        code: e.code,
        cible: q.question_key,
        citation: e.citation,
        certitude: e.certitude,
        effet_points: arrondiFr(q.max_points - q.points),
        categorie: null,
      });
    }
  }
  for (const e of entree.dictee?.erreurs ?? []) {
    erreurs.push({
      code: `DICT-${e.categorie.toUpperCase()}`,
      cible: `dictee_${e.index}`,
      citation: e.segment_produit || null,
      certitude: e.certitude,
      effet_points: e.penalite_appliquee,
      categorie: 'dictee',
    });
  }
  for (const f of entree.reecriture?.formes ?? []) {
    if (!f.type_erreur) continue;
    erreurs.push({
      code: f.type_erreur,
      cible: `reecriture_${f.cle}`,
      citation: f.forme_produite || null,
      certitude: f.ambigu ? 0.5 : 0.9,
      effet_points: arrondiFr(f.max_points - f.points),
      categorie: 'reecriture',
    });
  }

  return {
    sections,
    questions: entree.questions,
    reecriture: entree.reecriture,
    dictee: entree.dictee,
    redaction: entree.redaction,
    score_brut: scoreBrut,
    score_max: scoreMax,
    // La conversion se fait sur ce qui a réellement pu être noté. Elle est
    // bornée à 20 par construction : dépasser est impossible.
    score_sur_20: scoreMax > 0 ? arrondiFr(Math.min(20, (scoreBrut / scoreMax) * 20)) : 0,
    note_partielle: blocsNonNotes.length > 0,
    blocs_non_notes: blocsNonNotes,
    erreurs,
    alertes,
  };
}

/**
 * Contrôles bloquants du barème d'un sujet de français (§12).
 * Miroir applicatif de `public.brevet_verifier()`.
 */
export function verifierBaremeFrancais(entree: {
  questions: { question_key: string; numero: string; partie: PartieFrancais; max_points: number; elements_attendus: string[]; regles_points_partiels: unknown[] }[];
  maxReecriture: number;
  maxDictee: number;
  maxRedaction: number;
  dicteeReglesDefinies: boolean;
  grillesRedaction: { type_sujet: string }[];
}): { ok: boolean; blocages: { code: string; message: string }[]; avertissements: { code: string; message: string }[] } {
  const blocages: { code: string; message: string }[] = [];
  const avertissements: { code: string; message: string }[] = [];

  // Le bloc « texte » additionne ses trois parties possibles : la partie
  // générique et les deux sous-parties nommées par les sujets réels.
  const sommeBlocTexte = arrondiFr(
    entree.questions
      .filter((q) => PARTIES_DU_BLOC_TEXTE.includes(q.partie))
      .reduce((s, q) => s + q.max_points, 0),
  );

  const totalTexte = arrondiFr(sommeBlocTexte + entree.maxReecriture);
  if (Math.abs(totalTexte - 50) > 0.001) {
    blocages.push({
      code: 'bloc_texte_incorrect',
      message: `Le travail sur le texte (réécriture comprise) totalise ${totalTexte} points au lieu de 50.`,
    });
  }
  if (Math.abs(entree.maxDictee - 10) > 0.001) {
    blocages.push({
      code: 'bloc_dictee_incorrect',
      message: `La dictée est barémée sur ${entree.maxDictee} au lieu de 10.`,
    });
  }
  if (Math.abs(entree.maxRedaction - 40) > 0.001) {
    blocages.push({
      code: 'bloc_redaction_incorrect',
      message: `La rédaction est barémée sur ${entree.maxRedaction} au lieu de 40.`,
    });
  }
  const total = arrondiFr(totalTexte + entree.maxDictee + entree.maxRedaction);
  if (Math.abs(total - BAREME_TOTAL_FRANCAIS) > 0.001) {
    blocages.push({
      code: 'total_incorrect',
      message: `Le barème totalise ${total} points au lieu de ${BAREME_TOTAL_FRANCAIS}.`,
    });
  }

  for (const q of entree.questions) {
    if (!q.elements_attendus.length) {
      blocages.push({
        code: 'corrige_manquant',
        message: `Question ${q.numero} : aucun élément attendu n'est renseigné (question sans corrigé).`,
      });
    }
    if (!q.regles_points_partiels.length) {
      avertissements.push({
        code: 'points_partiels_manquants',
        message: `Question ${q.numero} : aucune règle de points partiels — tout se jouera en tout ou rien.`,
      });
    }
  }

  if (!entree.dicteeReglesDefinies) {
    blocages.push({
      code: 'dictee_sans_regles',
      message:
        'Aucune règle de retrait n’est définie pour la dictée : le moteur refusera de la noter. ' +
        'Renseigne le barème du sujet ou celui de son corrigé officiel.',
    });
  }

  const types = new Set(entree.grillesRedaction.map((g) => g.type_sujet));
  if (!types.has('imagination') || !types.has('reflexion')) {
    blocages.push({
      code: 'grilles_redaction_incompletes',
      message:
        'Les deux grilles de rédaction (imagination ET réflexion) sont obligatoires : la note de service ' +
        'impose deux sujets au choix.',
    });
  }

  return { ok: blocages.length === 0, blocages, avertissements };
}
