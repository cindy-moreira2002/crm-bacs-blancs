/**
 * NOYAU DU MOTEUR DE CORRECTION PAR BAREME PROPRE AU SUJET.
 *
 * Fichier volontairement PUR : aucun import, aucun accès réseau, aucune
 * dépendance à Deno ni à Node. Il est utilisé par deux mondes à la fois —
 *   • l'Edge Function `correct-copy-bareme` (Deno) : `../_shared/bareme-noyau.ts` ;
 *   • l'application Next.js, via `src/lib/baremeNoyau.ts` qui le ré-exporte.
 * Une seule écriture des règles, donc un seul endroit à corriger, et des
 * tests hors ligne (`npm run test:bareme`) qui portent sur le code réellement
 * exécuté en production.
 *
 * LES TROIS COUCHES, ET CE QUI LES SÉPARE
 * ---------------------------------------
 * 1. La NOTE : `note_brute = somme des points attribués question par question`.
 *    Elle est mécanique. Aucune fonction de ce fichier ne l'ajuste « au vu du
 *    niveau supposé » de l'élève.
 * 2. Le PROFIL DE COMPÉTENCES : un diagnostic pédagogique construit APRÈS la
 *    note, à partir des questions déjà notées. `profilCompetences()` ne
 *    renvoie jamais de points.
 * 3. La CALIBRATION par copies étalons : elle vit ailleurs (comparaison
 *    IA/humain) et ne peut agir que sur le barème, avant verrouillage.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Niveaux du profil de compétences. Voir `NIVEAUX_COMPETENCE` pour le sens. */
export type NiveauCompetence =
  | 'non_applicable'
  | 'non_observe'
  | 'insufficient'
  | 'fragile'
  | 'satisfactory'
  | 'very_satisfactory';

export const NIVEAUX_COMPETENCE: Record<NiveauCompetence, string> = {
  non_applicable: "compétence absente du sujet : elle ne reçoit jamais zéro et ne fait jamais baisser la note",
  non_observe: 'compétence potentiellement mobilisée, mais impossible à évaluer sur cette copie',
  insufficient: 'niveau insuffisant, réellement observé',
  fragile: 'niveau fragile, réellement observé',
  satisfactory: 'niveau satisfaisant, réellement observé',
  very_satisfactory: 'niveau très satisfaisant, réellement observé',
};

/** Une question du barème, telle qu'elle est lue en base. */
export type QuestionBareme = {
  question_key: string;
  numero: string;
  libelle: string;
  max_points: number;
  competences: string[];
  codes_erreurs: string[];
  depend_de: string[];
  methodes_alternatives: unknown[];
  reponse_attendue?: string | null;
  raisonnement_attendu?: string | null;
  etapes?: unknown[];
  regle_poursuite?: string | null;
  regle_non_double_sanction?: string | null;
};

/** Preuve localisable dans la copie. */
export type Preuve = { page?: number; citation: string; explication?: string };

/** Erreur observée sur une question. */
export type ErreurQuestion = {
  code: string;
  citation?: string;
  certitude?: number;
  erreur_source?: string | null;
  consequences?: string[];
};

/** Ce que le modèle renvoie pour une question. */
export type ReponseQuestionIA = {
  question_key: string;
  score?: number;
  elements_observes?: string[];
  elements_manquants?: string[];
  erreurs?: ErreurQuestion[];
  preuves?: Preuve[];
  transcription_incertaine?: boolean;
  relecture_humaine?: boolean;
  motifs_relecture?: string[];
  methode_alternative?: boolean;
  poursuite_depuis?: string | null;
  competences?: string[];
};

/** Question normalisée : ce qui part réellement en base. */
export type QuestionCorrigee = {
  question_key: string;
  numero: string;
  points: number;
  max_points: number;
  elements_observes: string[];
  elements_manquants: string[];
  erreurs: ErreurQuestion[];
  preuves: Preuve[];
  transcription_incertaine: boolean;
  relecture_humaine: boolean;
  motifs_relecture: MotifRelecture[];
  methode_alternative: boolean;
  poursuite_depuis: string | null;
  competences: string[];
};

export type MotifRelecture = {
  code: CodeMotifRelecture;
  question_key?: string;
  message: string;
};

/** Les onze déclencheurs de relecture humaine. */
export type CodeMotifRelecture =
  | 'transcription_incertaine'
  | 'formule_illisible'
  | 'methode_alternative_non_prevue'
  | 'anomalie_sujet'
  | 'points_hors_bareme'
  | 'total_incoherent'
  | 'regles_contradictoires'
  | 'justification_non_localisee'
  | 'double_sanction_possible'
  | 'confiance_insuffisante'
  | 'cas_non_couvert';

export type ContexteTranscription = {
  overall_confidence?: number;
  requires_human_review?: boolean;
  /** Marques laissées par le transcripteur : [illisible], [GRAPHIQUE non transcrit]… */
  marqueurs?: string[];
};

/** Seuil sous lequel la correction part systématiquement en relecture. */
export const SEUIL_CONFIANCE = 0.85;

/* ------------------------------------------------------------------ */
/*  Les règles transversales du barème par sujet                      */
/* ------------------------------------------------------------------ */

/**
 * Ce qui s'applique à TOUTES les questions de TOUS les barèmes, quel que soit
 * le sujet — par opposition au barème analytique, qui est propre à chaque
 * question d'un sujet donné.
 *
 * Elles sont écrites ici, une seule fois, parce qu'elles ont trois emplois qui
 * doivent dire exactement la même chose :
 *   1. la consigne envoyée au correcteur (`CONSIGNE_SOCLE`) ;
 *   2. les contrôles mécaniques d'après-correction (`motifsRelectureHumaine`),
 *      qui rattrapent une consigne mal suivie — une consigne n'est pas une
 *      garantie ;
 *   3. l'écran du barème, pour que celle qui l'écrit sache ce que le moteur
 *      fera de ce qu'elle saisit.
 *
 * Un contrôle de non-régression vérifie que chaque règle marquée
 * `dans_consigne` figure bien dans la consigne : elles ne peuvent pas diverger
 * en silence.
 */
export type RegleTransversale = {
  id: string;
  titre: string;
  texte: string;
  /** La marque à retrouver dans `CONSIGNE_SOCLE` — preuve que la règle est bien demandée au correcteur. */
  dans_consigne: string;
  /** Le motif de relecture levé mécaniquement quand la règle paraît violée, s'il y en a un. */
  controle?: CodeMotifRelecture;
};

export const REGLES_TRANSVERSALES: RegleTransversale[] = [
  {
    id: 'non_double_sanction',
    titre: 'Une erreur ne se paie qu’une fois',
    texte:
      'La même erreur n’est jamais sanctionnée deux fois, ni sur deux questions, ni sur deux ' +
      'titres de la même question.',
    dans_consigne: 'NON-DOUBLE-SANCTION',
    controle: 'double_sanction_possible',
  },
  {
    id: 'poursuite',
    titre: 'Les points de méthode survivent à une erreur de calcul',
    texte:
      'Un élève qui poursuit correctement avec un résultat faux garde les points de méthode et ' +
      'de raisonnement des étapes suivantes. Seule l’erreur initiale est retirée.',
    dans_consigne: 'ERREUR ANTERIEURE ET POURSUITE CORRECTE',
    controle: 'double_sanction_possible',
  },
  {
    id: 'methode_alternative',
    titre: 'Toute méthode valide est acceptée',
    texte:
      'Une démarche juste mais absente du corrigé vaut ses points. Une démarche que le correcteur ' +
      'ne sait pas rattacher au barème part en relecture humaine — jamais à zéro d’office.',
    dans_consigne: 'METHODES ALTERNATIVES',
    controle: 'methode_alternative_non_prevue',
  },
  {
    id: 'retraits_separes',
    titre: 'Justification, unité et conclusion se retirent séparément',
    texte:
      'Le barème de la question distingue ce qui revient au résultat, à la démonstration, à ' +
      'l’unité et à la conclusion. Un oubli d’unité coûte les points d’unité, pas la question.',
    dans_consigne: 'RESULTAT JUSTE SANS JUSTIFICATION',
  },
  {
    id: 'jamais_zero_automatique',
    titre: 'Jamais zéro parce que le résultat final est faux',
    texte:
      'Un résultat final faux ne met pas la question à zéro : tout ce qui est juste avant lui ' +
      'reste payé. Une question à zéro alors que la copie montre des étapes justes part en ' +
      'relecture.',
    dans_consigne: 'RAISONNEMENT CORRECT AVEC ERREUR DE CALCUL',
    controle: 'cas_non_couvert',
  },
  {
    id: 'pas_tout_sans_justification',
    titre: 'Un résultat juste non justifié ne prend pas tous les points',
    texte:
      'Quand la question demande une justification, le bon résultat seul ne vaut pas le maximum : ' +
      'la part de la démonstration reste à gagner.',
    dans_consigne: 'RESULTAT JUSTE SANS JUSTIFICATION',
    controle: 'cas_non_couvert',
  },
];

/** Codes de la taxonomie qui désignent une anomalie du dispositif, pas une faute de l'élève. */
export const CODES_ANOMALIE_SUJET = ['SU-ANOMALIE-01'];
export const CODES_REGLES_CONTRADICTOIRES = ['SU-BAREME-CONTRADICTION-01'];
export const CODES_METHODE_ALTERNATIVE = ['RC-METHODE-ALTERNATIVE-01'];
export const CODES_TRANSCRIPTION = ['TR-ILLISIBLE-01', 'TR-NON-TRANSCRIT-01'];

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                       */
/* ------------------------------------------------------------------ */

/** Arrondi au centième : les barèmes vont au quart de point, jamais plus fin. */
export function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

function texteListe(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') as string[] : [];
}

/* ------------------------------------------------------------------ */
/*  Couche 1 — la note, question par question                         */
/* ------------------------------------------------------------------ */

/**
 * Normalise la sortie du modèle contre le barème.
 *
 * Le barème fait foi, jamais la réponse du modèle : toute question du barème
 * absente de la réponse existe quand même (à 0, avec relecture humaine), et
 * toute question renvoyée qui n'est pas au barème est écartée de la note et
 * signalée — c'est le cas « non couvert par le barème » du §14.
 */
export function normaliserQuestions(
  bareme: QuestionBareme[],
  sortie: ReponseQuestionIA[],
): { questions: QuestionCorrigee[]; motifs: MotifRelecture[] } {
  const parCle = new Map(sortie.map((q) => [String(q.question_key ?? ''), q]));
  const motifs: MotifRelecture[] = [];
  const clesBareme = new Set(bareme.map((q) => q.question_key));

  const questions: QuestionCorrigee[] = bareme.map((q) => {
    const brut = parCle.get(q.question_key);

    if (!brut) {
      motifs.push({
        code: 'cas_non_couvert',
        question_key: q.question_key,
        message: `Le correcteur n'a rien renvoyé pour la question ${q.numero} : 0 point posé et relecture humaine demandée.`,
      });
      return questionVide(q, [
        {
          code: 'cas_non_couvert',
          question_key: q.question_key,
          message: 'Question absente de la réponse du correcteur.',
        },
      ]);
    }

    const demande = Number(brut.score ?? 0);
    const points = Math.max(0, Math.min(q.max_points, Number.isFinite(demande) ? demande : 0));
    const motifsQuestion: MotifRelecture[] = [];

    if (Math.abs(points - demande) > 0.001) {
      const m: MotifRelecture = {
        code: 'points_hors_bareme',
        question_key: q.question_key,
        message: `Le correcteur a proposé ${demande} point(s) pour un maximum de ${q.max_points} : ramené à ${points}.`,
      };
      motifsQuestion.push(m);
      motifs.push(m);
    }

    return {
      question_key: q.question_key,
      numero: q.numero,
      points: arrondi(points),
      max_points: q.max_points,
      elements_observes: texteListe(brut.elements_observes),
      elements_manquants: texteListe(brut.elements_manquants),
      erreurs: Array.isArray(brut.erreurs) ? brut.erreurs : [],
      preuves: Array.isArray(brut.preuves) ? brut.preuves : [],
      transcription_incertaine: brut.transcription_incertaine === true,
      relecture_humaine: brut.relecture_humaine === true || motifsQuestion.length > 0,
      motifs_relecture: motifsQuestion,
      methode_alternative: brut.methode_alternative === true,
      poursuite_depuis: brut.poursuite_depuis ?? null,
      // Une compétence non déclarée au barème pour cette question ne peut pas
      // apparaître dans son diagnostic : le barème fait foi ici aussi.
      competences: texteListe(brut.competences).filter((c) => q.competences.includes(c)),
    };
  });

  for (const renvoyee of sortie) {
    const cle = String(renvoyee.question_key ?? '');
    if (cle && !clesBareme.has(cle)) {
      motifs.push({
        code: 'cas_non_couvert',
        question_key: cle,
        message: `Le correcteur a noté une question « ${cle} » absente du barème : elle ne compte pas dans la note.`,
      });
    }
  }

  return { questions, motifs };
}

function questionVide(q: QuestionBareme, motifs: MotifRelecture[]): QuestionCorrigee {
  return {
    question_key: q.question_key,
    numero: q.numero,
    points: 0,
    max_points: q.max_points,
    elements_observes: [],
    elements_manquants: [],
    erreurs: [],
    preuves: [],
    transcription_incertaine: false,
    relecture_humaine: true,
    motifs_relecture: motifs,
    methode_alternative: false,
    poursuite_depuis: null,
    competences: [],
  };
}

/**
 * La note brute. C'est TOUT ce qui produit la note officielle : une somme.
 */
export function calculerNoteBrute(questions: { points: number }[]): number {
  return arrondi(questions.reduce((total, q) => total + q.points, 0));
}

export function calculerMaximum(questions: { max_points: number }[]): number {
  return arrondi(questions.reduce((total, q) => total + q.max_points, 0));
}

/**
 * Non-double-sanction et poursuite après un résultat antérieur faux.
 *
 * Une erreur commise au début ne se paie qu'une fois. Si l'élève poursuit
 * correctement AVEC son résultat faux, les questions suivantes gardent leurs
 * points de méthode. Cette fonction ne redistribue pas de points : elle
 * VÉRIFIE que le correcteur ne les a pas retirés deux fois, et signale le cas
 * pour relecture humaine quand elle constate le contraire.
 *
 * Elle laisse la note intacte : corriger un barème mal appliqué est une
 * décision humaine, pas un rattrapage automatique.
 */
export function verifierNonDoubleSanction(
  bareme: QuestionBareme[],
  questions: QuestionCorrigee[],
): MotifRelecture[] {
  const parCle = new Map(questions.map((q) => [q.question_key, q]));
  const baremeParCle = new Map(bareme.map((q) => [q.question_key, q]));
  const motifs: MotifRelecture[] = [];

  for (const q of questions) {
    const def = baremeParCle.get(q.question_key);
    if (!def) continue;

    // Une question qui dépend d'une question ratée, et qui reçoit zéro sans
    // que le correcteur ait déclaré la poursuite : la faute initiale risque
    // d'être payée une deuxième fois.
    const sourcesRatees = def.depend_de.filter((cle) => {
      const source = parCle.get(cle);
      return source && source.points < source.max_points;
    });

    if (sourcesRatees.length && q.points === 0 && !q.poursuite_depuis) {
      motifs.push({
        code: 'double_sanction_possible',
        question_key: q.question_key,
        message:
          `Question ${q.numero} à 0 alors qu'elle reprend le résultat de ` +
          `${sourcesRatees.join(', ')}, déjà sanctionné. Vérifier que la suite n'est pas ` +
          `pénalisée une deuxième fois (poursuite correcte sur un résultat antérieur faux).`,
      });
    }

    // Poursuite déclarée sur une question qui n'est pas une dépendance
    // connue : le correcteur invente un enchaînement absent du barème.
    if (q.poursuite_depuis && !def.depend_de.includes(q.poursuite_depuis)) {
      motifs.push({
        code: 'double_sanction_possible',
        question_key: q.question_key,
        message:
          `Question ${q.numero} : poursuite déclarée depuis « ${q.poursuite_depuis} », ` +
          `qui n'est pas une dépendance prévue au barème.`,
      });
    }
  }

  return motifs;
}

/**
 * Les onze déclencheurs de relecture humaine du cahier des charges.
 * Toute correction qui en remonte au moins un est marquée `human_review_required`.
 */
export function motifsRelectureHumaine(
  bareme: QuestionBareme[],
  questions: QuestionCorrigee[],
  contexte: {
    transcription?: ContexteTranscription;
    confiance?: number;
    noteBrute: number;
    noteAnnoncee?: number;
    maxBareme: number;
  },
): MotifRelecture[] {
  const motifs: MotifRelecture[] = [];
  const baremeParCle = new Map(bareme.map((q) => [q.question_key, q]));

  // Motifs déjà levés à la normalisation (points hors barème, question absente).
  for (const q of questions) motifs.push(...q.motifs_relecture);

  for (const q of questions) {
    const def = baremeParCle.get(q.question_key);

    if (q.transcription_incertaine) {
      motifs.push({
        code: 'transcription_incertaine',
        question_key: q.question_key,
        message: `Question ${q.numero} : transcription incertaine. Ce n'est pas une erreur de l'élève — vérifier l'image d'origine.`,
      });
    }

    // Méthode qui paraît valide mais n'est pas au barème : jamais zéro d'office.
    if (q.methode_alternative && (def?.methodes_alternatives?.length ?? 0) === 0) {
      motifs.push({
        code: 'methode_alternative_non_prevue',
        question_key: q.question_key,
        message: `Question ${q.numero} : méthode non prévue au barème. À trancher par un humain, pas à mettre à zéro.`,
      });
    }

    // RÈGLE « jamais zéro parce que le résultat final est faux ». Le correcteur
    // a beau lister des choses justes, il met la question à zéro : c'est
    // exactement le réflexe « résultat faux donc rien », que le barème
    // analytique existe pour empêcher. La consigne le dit déjà ; ce contrôle
    // est là parce qu'une consigne n'est pas une garantie.
    if (q.points === 0 && q.elements_observes.length > 0 && !q.transcription_incertaine) {
      motifs.push({
        code: 'cas_non_couvert',
        question_key: q.question_key,
        message:
          `Question ${q.numero} : zéro alors que le correcteur relève ${q.elements_observes.length} ` +
          `élément(s) juste(s). Un résultat final faux ne met pas la question à zéro — ` +
          `vérifier ce qui reste dû à la méthode.`,
      });
    }

    // RÈGLE « un résultat juste non justifié ne prend pas tous les points ».
    // Le maximum est attribué alors que le barème demandait une démonstration
    // et que le correcteur lui-même signale des manques.
    if (
      def?.raisonnement_attendu &&
      String(def.raisonnement_attendu).trim().length > 0 &&
      q.max_points > 0 &&
      Math.abs(q.points - q.max_points) < 0.001 &&
      q.elements_manquants.length > 0
    ) {
      motifs.push({
        code: 'cas_non_couvert',
        question_key: q.question_key,
        message:
          `Question ${q.numero} : tous les points (${q.max_points}) alors qu'il manque ` +
          `${q.elements_manquants.length} élément(s) et que la question demande une ` +
          `justification. La part de la démonstration ne se donne pas avec le résultat.`,
      });
    }

    // Des points attribués sans citation localisable dans la copie.
    if (q.points > 0 && q.preuves.length === 0) {
      motifs.push({
        code: 'justification_non_localisee',
        question_key: q.question_key,
        message: `Question ${q.numero} : ${q.points} point(s) attribué(s) sans citation localisable dans la copie.`,
      });
    }

    for (const e of q.erreurs) {
      if (CODES_TRANSCRIPTION.includes(e.code)) {
        motifs.push({
          code: 'formule_illisible',
          question_key: q.question_key,
          message: `Question ${q.numero} : ${e.code} — élément manuscrit non lisible ou non transcrit.`,
        });
      }
      if (CODES_ANOMALIE_SUJET.includes(e.code)) {
        motifs.push({
          code: 'anomalie_sujet',
          question_key: q.question_key,
          message: `Question ${q.numero} : le sujet ou le corrigé semble comporter une erreur.`,
        });
      }
      if (CODES_REGLES_CONTRADICTOIRES.includes(e.code)) {
        motifs.push({
          code: 'regles_contradictoires',
          question_key: q.question_key,
          message: `Question ${q.numero} : deux règles du barème se contredisent.`,
        });
      }
      if (CODES_METHODE_ALTERNATIVE.includes(e.code)) {
        motifs.push({
          code: 'methode_alternative_non_prevue',
          question_key: q.question_key,
          message: `Question ${q.numero} : méthode alternative signalée par le correcteur.`,
        });
      }
    }
  }

  motifs.push(...verifierNonDoubleSanction(bareme, questions));

  // Le détail ne doit jamais diverger de la note annoncée.
  if (
    typeof contexte.noteAnnoncee === 'number' &&
    Math.abs(contexte.noteAnnoncee - contexte.noteBrute) > 0.001
  ) {
    motifs.push({
      code: 'total_incoherent',
      message:
        `Le correcteur annonce ${contexte.noteAnnoncee} alors que le détail question par question ` +
        `fait ${contexte.noteBrute}. La somme fait foi.`,
    });
  }

  const maxQuestions = calculerMaximum(questions);
  if (Math.abs(maxQuestions - contexte.maxBareme) > 0.001) {
    motifs.push({
      code: 'total_incoherent',
      message: `Le total des maximums vaut ${maxQuestions} au lieu de ${contexte.maxBareme}.`,
    });
  }

  const confiance = contexte.confiance ?? contexte.transcription?.overall_confidence;
  if (typeof confiance === 'number' && confiance < SEUIL_CONFIANCE) {
    motifs.push({
      code: 'confiance_insuffisante',
      message: `Confiance de correction ${confiance} sous le seuil de ${SEUIL_CONFIANCE}.`,
    });
  }
  if (contexte.transcription?.requires_human_review === true) {
    motifs.push({
      code: 'transcription_incertaine',
      message: 'La transcription avait déjà demandé une vérification humaine.',
    });
  }

  return dedupliquerMotifs(motifs);
}

function dedupliquerMotifs(motifs: MotifRelecture[]): MotifRelecture[] {
  const vus = new Set<string>();
  const sortie: MotifRelecture[] = [];
  for (const m of motifs) {
    const cle = `${m.code}|${m.question_key ?? ''}|${m.message}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(m);
  }
  return sortie;
}

/* ------------------------------------------------------------------ */
/*  Couche 2 — le profil de compétences                               */
/* ------------------------------------------------------------------ */

export type CompetenceReferentiel = {
  code: string;
  libelle: string;
  toujours_mobilisee: boolean;
};

/**
 * Profil de compétences, construit APRÈS la note et à partir d'elle.
 *
 * Trois cas nettement séparés :
 *   • la compétence n'est mobilisée par AUCUNE question du barème
 *     → `non_applicable`. Jamais zéro, aucun effet sur la note ;
 *   • elle est mobilisée, mais aucune question la mobilisant n'a pu être
 *     évaluée (copie blanche, transcription incertaine) → `non_observe` ;
 *   • sinon, le niveau vient du taux de réussite RÉELLEMENT observé sur les
 *     questions qui la mobilisent.
 *
 * Un niveau proposé par le modèle est accepté seulement s'il ne contredit pas
 * ce que les points montrent : le diagnostic explique la note, il ne la refait pas.
 */
export function profilCompetences(
  referentiel: CompetenceReferentiel[],
  bareme: QuestionBareme[],
  questions: QuestionCorrigee[],
  proposeParIA: Record<string, NiveauCompetence> = {},
): Record<string, NiveauCompetence> {
  const parCle = new Map(questions.map((q) => [q.question_key, q]));
  const profil: Record<string, NiveauCompetence> = {};

  for (const comp of referentiel) {
    const concernees = bareme.filter((q) => q.competences.includes(comp.code));

    if (concernees.length === 0) {
      profil[comp.code] = 'non_applicable';
      continue;
    }

    let obtenus = 0;
    let maximum = 0;
    let evaluables = 0;
    for (const def of concernees) {
      const q = parCle.get(def.question_key);
      if (!q) continue;
      // Une question dont la transcription est douteuse n'observe rien.
      if (q.transcription_incertaine) continue;
      evaluables += 1;
      obtenus += q.points;
      maximum += q.max_points;
    }

    if (evaluables === 0 || maximum === 0) {
      profil[comp.code] = 'non_observe';
      continue;
    }

    const taux = obtenus / maximum;
    const observe: NiveauCompetence =
      taux >= 0.85 ? 'very_satisfactory'
      : taux >= 0.6 ? 'satisfactory'
      : taux >= 0.35 ? 'fragile'
      : 'insufficient';

    const propose = proposeParIA[comp.code];
    // Le modèle peut nuancer d'un cran (il voit la qualité du raisonnement,
    // pas seulement le total), mais ne peut ni déclarer non_applicable une
    // compétence réellement mobilisée, ni s'écarter de plus d'un cran.
    profil[comp.code] = concilierNiveau(observe, propose);
  }

  return profil;
}

const ECHELLE: NiveauCompetence[] = ['insufficient', 'fragile', 'satisfactory', 'very_satisfactory'];

function concilierNiveau(observe: NiveauCompetence, propose?: NiveauCompetence): NiveauCompetence {
  if (!propose || !ECHELLE.includes(propose)) return observe;
  const iObserve = ECHELLE.indexOf(observe);
  const iPropose = ECHELLE.indexOf(propose);
  if (Math.abs(iPropose - iObserve) <= 1) return propose;
  return observe;
}

/* ------------------------------------------------------------------ */
/*  Assemblage du résultat structuré                                  */
/* ------------------------------------------------------------------ */

export type EvenementTaxonomie = {
  code: string;
  question_key: string;
  citation?: string;
  certitude?: number;
  erreur_source?: string | null;
  consequences?: string[];
  /** Effet RÉEL sur les points : ce que la question a perdu, pas la gravité. */
  effet_points: number;
  relecture_humaine: boolean;
};

export type ResultatCorrection = {
  exam_id: string | null;
  rubric_id: string | null;
  bareme_version_id: string;
  rubric_version: string;
  moteur: 'bareme_sujet';
  score_raw: number;
  score_validated: number;
  max_score: number;
  human_review_required: boolean;
  human_review_reasons: MotifRelecture[];
  questions: QuestionCorrigee[];
  competency_profile: Record<string, NiveauCompetence>;
  priority_feedback: string[];
  taxonomy_events: EvenementTaxonomie[];
  appreciation_generale: string;
  calibration_metadata: {
    rubric_calibrated: boolean;
    rubric_locked: boolean;
    etalons_compares: number;
  };
};

export function evenementsTaxonomie(questions: QuestionCorrigee[]): EvenementTaxonomie[] {
  const evenements: EvenementTaxonomie[] = [];
  for (const q of questions) {
    for (const e of q.erreurs) {
      evenements.push({
        code: e.code,
        question_key: q.question_key,
        citation: e.citation,
        certitude: e.certitude,
        erreur_source: e.erreur_source ?? null,
        consequences: e.consequences ?? [],
        // L'effet réel sur les points est celui de la question, pas la gravité
        // pédagogique du code : seul le barème décide de la note.
        effet_points: arrondi(q.max_points - q.points),
        relecture_humaine: q.relecture_humaine,
      });
    }
  }
  return evenements;
}

export function construireResultat(entree: {
  examId: string | null;
  rubricId: string | null;
  baremeVersionId: string;
  version: string;
  bareme: QuestionBareme[];
  sortie: ReponseQuestionIA[];
  referentiel: CompetenceReferentiel[];
  maxBareme: number;
  noteAnnoncee?: number;
  confiance?: number;
  transcription?: ContexteTranscription;
  profilPropose?: Record<string, NiveauCompetence>;
  conseils?: string[];
  appreciation?: string;
  baremeVerrouille: boolean;
  baremeCalibre: boolean;
  etalonsCompares: number;
}): ResultatCorrection {
  const { questions, motifs: motifsNormalisation } = normaliserQuestions(entree.bareme, entree.sortie);
  const noteBrute = calculerNoteBrute(questions);

  const motifs = motifsRelectureHumaine(entree.bareme, questions, {
    transcription: entree.transcription,
    confiance: entree.confiance,
    noteBrute,
    noteAnnoncee: entree.noteAnnoncee,
    maxBareme: entree.maxBareme,
  });
  const tous = dedupliquerMotifs([...motifsNormalisation, ...motifs]);

  // Retour des motifs globaux sur les questions concernées, pour que la page
  // de relecture montre le doute à l'endroit exact où il se pose.
  for (const m of tous) {
    if (!m.question_key) continue;
    const q = questions.find((x) => x.question_key === m.question_key);
    if (q && !q.motifs_relecture.some((x) => x.code === m.code && x.message === m.message)) {
      q.motifs_relecture.push(m);
      q.relecture_humaine = true;
    }
  }

  return {
    exam_id: entree.examId,
    rubric_id: entree.rubricId,
    bareme_version_id: entree.baremeVersionId,
    rubric_version: entree.version,
    moteur: 'bareme_sujet',
    score_raw: noteBrute,
    // Tant qu'aucun humain n'a tranché, la note validée EST la note brute.
    score_validated: noteBrute,
    max_score: entree.maxBareme,
    human_review_required: tous.length > 0,
    human_review_reasons: tous,
    questions,
    competency_profile: profilCompetences(
      entree.referentiel,
      entree.bareme,
      questions,
      entree.profilPropose ?? {},
    ),
    priority_feedback: entree.conseils ?? [],
    taxonomy_events: evenementsTaxonomie(questions),
    appreciation_generale: entree.appreciation ?? '',
    calibration_metadata: {
      rubric_calibrated: entree.baremeCalibre,
      rubric_locked: entree.baremeVerrouille,
      etalons_compares: entree.etalonsCompares,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Couche 3 — comparaison IA / humain sur les copies étalons         */
/* ------------------------------------------------------------------ */

export type CorrectionHumaineEtalon = {
  prof: string;
  note_totale: number;
  parQuestion: Record<string, number>;
};

export type ComparaisonEtalon = {
  etalon_id: string;
  libelle: string;
  note_ia: number | null;
  note_humaine_moyenne: number | null;
  note_humaine_mediane: number | null;
  amplitude_humaine: number | null;
  nb_correcteurs: number;
  ecart_total: number | null;
  ecarts_par_question: { question_key: string; ia: number | null; humain: number | null; ecart: number | null }[];
  questions_en_desaccord_entre_profs: string[];
  reference_fiable: boolean;
};

export function moyenne(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return arrondi(valeurs.reduce((a, b) => a + b, 0) / valeurs.length);
}

export function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return arrondi(t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2);
}

/** Au-delà de cet écart entre correcteurs, la référence humaine n'est pas présentée comme objective. */
export const DESACCORD_PROFS = 2;

export function comparerEtalon(entree: {
  etalonId: string;
  libelle: string;
  humaines: CorrectionHumaineEtalon[];
  ia: { note: number; parQuestion: Record<string, number> } | null;
  clesQuestions: string[];
}): ComparaisonEtalon {
  const notes = entree.humaines.map((h) => h.note_totale);
  const moy = moyenne(notes);
  const med = mediane(notes);
  const amplitude = notes.length ? arrondi(Math.max(...notes) - Math.min(...notes)) : null;

  const desaccords: string[] = [];
  const ecarts = entree.clesQuestions.map((cle) => {
    const valeursProfs = entree.humaines
      .map((h) => h.parQuestion[cle])
      .filter((v): v is number => typeof v === 'number');
    if (valeursProfs.length > 1 && Math.max(...valeursProfs) - Math.min(...valeursProfs) > 0.001) {
      desaccords.push(cle);
    }
    const humain = moyenne(valeursProfs);
    const ia = entree.ia?.parQuestion[cle] ?? null;
    return {
      question_key: cle,
      ia,
      humain,
      ecart: ia !== null && humain !== null ? arrondi(ia - humain) : null,
    };
  });

  return {
    etalon_id: entree.etalonId,
    libelle: entree.libelle,
    note_ia: entree.ia?.note ?? null,
    note_humaine_moyenne: moy,
    note_humaine_mediane: med,
    amplitude_humaine: amplitude,
    nb_correcteurs: entree.humaines.length,
    ecart_total: entree.ia && moy !== null ? arrondi(entree.ia.note - moy) : null,
    ecarts_par_question: ecarts,
    questions_en_desaccord_entre_profs: desaccords,
    // Deux profs qui divergent de plus de 2 points : la « vérité » humaine
    // n'en est pas une, et on le dit plutôt que de caler le barème dessus.
    reference_fiable: amplitude === null || amplitude <= DESACCORD_PROFS,
  };
}

export type StatsCalibration = {
  copies_testees: number;
  ecart_absolu_moyen: number | null;
  ecart_median: number | null;
  ecart_maximal: number | null;
  biais_moyen: number | null;
  taux_accord_exact: number | null;
  taux_accord_025: number | null;
  taux_relecture: number | null;
  questions_en_desaccord: { question_key: string; ecart_absolu_moyen: number; copies: number }[];
  references_non_fiables: number;
};

export function statistiquesCalibration(
  comparaisons: ComparaisonEtalon[],
  tauxRelecture: number | null = null,
): StatsCalibration {
  const ecarts = comparaisons
    .map((c) => c.ecart_total)
    .filter((v): v is number => typeof v === 'number');
  const absolus = ecarts.map(Math.abs);

  const parQuestion = new Map<string, number[]>();
  let total = 0;
  let exacts = 0;
  let proches = 0;
  for (const c of comparaisons) {
    for (const e of c.ecarts_par_question) {
      if (e.ecart === null) continue;
      total += 1;
      if (Math.abs(e.ecart) < 0.001) exacts += 1;
      if (Math.abs(e.ecart) <= 0.25 + 0.001) proches += 1;
      const liste = parQuestion.get(e.question_key) ?? [];
      liste.push(Math.abs(e.ecart));
      parQuestion.set(e.question_key, liste);
    }
  }

  const questions = [...parQuestion.entries()]
    .map(([question_key, valeurs]) => ({
      question_key,
      ecart_absolu_moyen: moyenne(valeurs) ?? 0,
      copies: valeurs.length,
    }))
    .sort((a, b) => b.ecart_absolu_moyen - a.ecart_absolu_moyen);

  return {
    copies_testees: comparaisons.length,
    ecart_absolu_moyen: moyenne(absolus),
    ecart_median: mediane(absolus),
    ecart_maximal: absolus.length ? arrondi(Math.max(...absolus)) : null,
    // Le biais signé : c'est LUI qui dit « le barème est trop sévère ».
    biais_moyen: moyenne(ecarts),
    taux_accord_exact: total ? arrondi(exacts / total) : null,
    taux_accord_025: total ? arrondi(proches / total) : null,
    taux_relecture: tauxRelecture,
    questions_en_desaccord: questions.slice(0, 10),
    references_non_fiables: comparaisons.filter((c) => !c.reference_fiable).length,
  };
}

/* ------------------------------------------------------------------ */
/*  Contrôles du barème (miroir TypeScript de public.bareme_verifier)  */
/* ------------------------------------------------------------------ */

export type BlocageBareme = { code: string; question_key?: string; message: string };

export type QuestionAVerifier = QuestionBareme & {
  reponse_attendue?: string | null;
  etapes?: unknown[];
  reponses_equivalentes?: unknown[];
  paliers?: { points: number; cumulable: boolean }[];
};

/**
 * Les contrôles bloquants, côté application.
 *
 * La base les rejoue dans `public.bareme_verifier()` avant tout verrouillage :
 * cette version-ci sert à l'éditeur, pour montrer les erreurs pendant la
 * saisie plutôt qu'au moment de verrouiller.
 */
export function verifierBareme(entree: {
  questions: QuestionAVerifier[];
  maxScore: number;
  competencesConnues: string[];
  codesErreursConnus?: string[];
}): { ok: boolean; blocages: BlocageBareme[]; avertissements: BlocageBareme[]; total: number } {
  const blocages: BlocageBareme[] = [];
  const avertissements: BlocageBareme[] = [];
  const total = arrondi(entree.questions.reduce((s, q) => s + Number(q.max_points ?? 0), 0));
  const cles = new Set(entree.questions.map((q) => q.question_key));

  if (!entree.questions.length) {
    blocages.push({ code: 'aucune_question', message: "Aucune question n'est rattachée à ce barème." });
  }
  if (Math.abs(total - entree.maxScore) > 0.001) {
    blocages.push({
      code: 'total_incorrect',
      message: `Le total du barème vaut ${total} points au lieu de ${entree.maxScore}.`,
    });
  }

  for (const q of entree.questions) {
    if (!q.reponse_attendue || !String(q.reponse_attendue).trim()) {
      blocages.push({
        code: 'reponse_attendue_manquante',
        question_key: q.question_key,
        message: `Question ${q.numero} : aucune réponse attendue.`,
      });
    }
    const paliers = q.paliers ?? [];
    if (!paliers.length && !(q.etapes ?? []).length) {
      blocages.push({
        code: 'attribution_manquante',
        question_key: q.question_key,
        message: `Question ${q.numero} : aucune règle d'attribution des points (ni palier, ni étape valorisée).`,
      });
    }
    // Des étapes attendues, mais aucun palier de points : on sait ce qu'on
    // attend et pas ce que ça vaut. Le correcteur n'a alors que le maximum de
    // la question — donc tout ou rien, exactement ce qu'un barème analytique
    // doit rendre impossible.
    if ((q.etapes ?? []).length > 0 && !paliers.length) {
      blocages.push({
        code: 'etapes_sans_points',
        question_key: q.question_key,
        message:
          `Question ${q.numero} : ${(q.etapes ?? []).length} étape(s) attendue(s) mais aucun palier ` +
          `de points. Sans le prix de chaque étape, la question se note tout ou rien.`,
      });
    }

    const somme = arrondi(paliers.filter((p) => p.cumulable).reduce((s, p) => s + p.points, 0));
    if (somme > q.max_points + 0.001) {
      blocages.push({
        code: 'paliers_hors_max',
        question_key: q.question_key,
        message: `Question ${q.numero} : les paliers font ${somme} points pour un maximum de ${q.max_points}.`,
      });
    }
    if (!q.competences.length) {
      blocages.push({
        code: 'competence_manquante',
        question_key: q.question_key,
        message: `Question ${q.numero} : aucune compétence mobilisée déclarée.`,
      });
    }
    for (const c of q.competences) {
      if (!entree.competencesConnues.includes(c)) {
        blocages.push({
          code: 'competence_inconnue',
          question_key: q.question_key,
          message: `Question ${q.numero} : compétence « ${c} » absente du référentiel de la discipline.`,
        });
      }
    }
    for (const d of q.depend_de) {
      if (!cles.has(d)) {
        blocages.push({
          code: 'dependance_inconnue',
          question_key: q.question_key,
          message: `Question ${q.numero} : dépend de « ${d} », qui n'existe pas dans ce barème.`,
        });
      }
    }
    if (entree.codesErreursConnus) {
      for (const e of q.codes_erreurs) {
        if (!entree.codesErreursConnus.includes(e)) {
          avertissements.push({
            code: 'code_erreur_inconnu',
            question_key: q.question_key,
            message: `Question ${q.numero} : code d'erreur « ${e} » absent de la taxonomie de la discipline.`,
          });
        }
      }
    }
  }

  if (!entree.questions.some((q) => (q.methodes_alternatives ?? []).length > 0)) {
    avertissements.push({
      code: 'aucune_methode_alternative',
      message:
        "Aucune méthode alternative prévue : toute démarche non prévue partira en relecture humaine.",
    });
  }

  // Une question qui vaut plusieurs points sans aucune réponse équivalente ni
  // méthode alternative : tout écart de formulation partira en relecture. Ce
  // n'est pas bloquant — certaines questions n'admettent qu'une réponse — mais
  // ça se dit avant le verrouillage, pas après cinquante copies.
  for (const q of entree.questions) {
    const alternatives =
      (q.methodes_alternatives ?? []).length + (q.reponses_equivalentes ?? []).length;
    if (q.max_points >= 2 && alternatives === 0) {
      avertissements.push({
        code: 'aucune_reponse_acceptee_alternative',
        question_key: q.question_key,
        message: `Question ${q.numero} (${q.max_points} pts) : aucune réponse équivalente ni méthode alternative acceptée.`,
      });
    }
  }

  return { ok: blocages.length === 0, blocages, avertissements, total };
}

/* ------------------------------------------------------------------ */
/*  Statuts                                                           */
/* ------------------------------------------------------------------ */

export const STATUTS_EXAMEN = [
  'draft',
  'calibrating',
  'ready_for_validation',
  'validated',
  'locked',
  'correction_open',
  'archived',
] as const;

export type StatutExamen = (typeof STATUTS_EXAMEN)[number];

export const LIBELLES_STATUT: Record<StatutExamen, string> = {
  draft: 'Brouillon',
  calibrating: 'En calibration',
  ready_for_validation: 'Prêt à valider',
  validated: 'Validé par un professeur',
  locked: 'Barème verrouillé',
  correction_open: 'Corrections ouvertes',
  archived: 'Archivé',
};

/** Un examen ne peut passer en « correction ouverte » que depuis un barème verrouillé. */
export function peutOuvrirCorrections(entree: {
  statutExamen: StatutExamen;
  statutBareme: string | null;
  controlesOk: boolean;
}): { ok: boolean; raison?: string } {
  if (!entree.statutBareme) return { ok: false, raison: "Aucun barème actif sur cet examen." };
  if (!entree.controlesOk) return { ok: false, raison: 'Le barème comporte encore des blocages.' };
  if (entree.statutBareme !== 'locked') {
    return { ok: false, raison: `Le barème doit être verrouillé (statut actuel : ${entree.statutBareme}).` };
  }
  if (entree.statutExamen === 'archived') return { ok: false, raison: 'Examen archivé.' };
  return { ok: true };
}

/** Niveaux de copies étalons attendus pour une calibration complète. */
export const NIVEAUX_ETALONS = [
  { code: 'presque_blanche', libelle: 'Presque blanche', plage: '1 à 3 / 20' },
  { code: 'tres_faible', libelle: 'Très faible', plage: '4 à 6 / 20' },
  { code: 'fragile', libelle: 'Fragile', plage: '7 à 9 / 20' },
  { code: 'moyen', libelle: 'Moyen', plage: '10 à 12 / 20' },
  { code: 'assez_bon', libelle: 'Assez bon', plage: '13 à 15 / 20' },
  { code: 'tres_bon', libelle: 'Très bon', plage: '16 à 18 / 20' },
  { code: 'excellent', libelle: 'Excellent', plage: '19 à 20 / 20' },
] as const;

/** Les zones frontières où une erreur de calibration change une décision. */
export const FRONTIERES_ETALONS = ['9–10 / 20', '11–12 / 20', '15–16 / 20'];

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
