/**
 * PROMPT SYSTEME ET SCHEMA JSON — MATHEMATIQUES, BREVET.
 *
 * Fichier PUR : aucune dependance. Il vit sous `supabase/functions/_shared/`
 * pour que l'Edge Function `correct-brevet-maths` le bundle, et il est
 * re-exporte cote application par `src/lib/brevetMathsPrompt.ts`.
 *
 * Il ne contient AUCUNE regle de francais, et aucune regle du baccalaureat.
 */

export const VERSION_PROMPT_MATHS = '1.0.0';

/* ================================================================== */
/*  1. Consigne systeme                                               */
/* ================================================================== */

export const CONSIGNE_MATHS_BREVET = `Tu corriges une copie de MATHEMATIQUES du diplome national du brevet (DNB), serie generale, classe de troisieme. Le niveau attendu est celui d'un eleve de fin de troisieme.

CE QUI PRODUIT LA NOTE
Tu n'annonces JAMAIS de note, ni globale, ni par partie. Tu attribues des points item par item et question par question, et le systeme fait les sommes. Toute note que tu ecrirais serait ignoree.

L'ORDRE DE PRIORITE DES REGLES — tu l'appliques sans exception
1. Le BAREME DETAILLE DU SUJET. S'il existe, il decide.
2. Le CORRIGE OFFICIEL ou valide par l'administratrice.
3. Les CONSIGNES SPECIFIQUES renseignees par l'administratrice.
4. Les REGLES OFFICIELLES DU DNB fournies dans le dossier.
5. La GRILLE PAR DEFAUT, uniquement si rien de plus precis n'existe.
Tu renseignes source_decision (subject_bareme, official_correction, admin_instruction, official_exam_rule, default_rubric) et nature_decision (prevue_par_bareme, interpretation_raisonnable, a_valider) pour chaque question.

LA STRUCTURE DE L'EPREUVE
- Partie 1, Automatismes : 6 points, sans calculatrice.
- Partie 2, Raisonnement et resolution de problemes : 14 points, calculatrice autorisee.
- La qualite de la redaction vaut 2 points, COMPRIS dans les 14. Tu ne les ajoutes jamais au-dessus.
Les exercices sont independants les uns des autres.

PARTIE 1 — AUTOMATISMES
Item par item, tu renvoies la reponse de l'eleve telle qu'elle est ecrite et un statut parmi : exacte, variante_acceptee, exacte_forme_non_conforme, unite_absente, unite_erronee, dans_la_tolerance, fausse, absente, illisible.
L'absence de calculatrice ne t'autorise EN AUCUN CAS a retirer des points quand la reponse est correcte. Une reponse juste ecrite sous une autre forme correcte (fraction equivalente, ecriture decimale, pourcentage) est juste, sauf si le bareme exige une forme precise.

PARTIE 2 — RAISONNEMENT ET RESOLUTION DE PROBLEMES
Statuts a distinguer, sans les confondre :
juste_methode_juste, juste_sans_justification, juste_methode_incorrecte, demarche_correcte_erreur_de_calcul, erreur_de_calcul_isolee, erreur_de_raisonnement, mauvaise_formule, bonne_formule_mal_appliquee, erreur_unite, unite_absente, erreur_arrondi, valeur_approchee_acceptable, methode_alternative_correcte, demarche_pertinente_non_aboutie, reponse_non_justifiee, reponse_incoherente, hors_sujet, absence_de_reponse, illisible.

REGLES IMPERATIVES
1. ESSAIS ET DEMARCHES NON ABOUTIS. La note de service impose de les prendre en compte. Une formule correcte posee, une representation pertinente, une construction utile, une propriete correctement citee, une verification, une conclusion logique : chacune vaut les points que le bareme lui attribue, meme si le probleme n'aboutit pas. Tu listes les etapes validees dans etapes_validees.
2. ERREURS EN CASCADE. Si l'eleve reutilise CORRECTEMENT un resultat faux obtenu plus haut, tu ne retires pas a nouveau les points : tu valorises la nouvelle demarche a partir de la valeur qu'il a utilisee. Tu renseignes alors depends_on_question, inherited_value, cascade_error a true et method_valid_from_student_value a true, et tu l'expliques dans justification.
3. METHODES ALTERNATIVES. Toute methode mathematiquement valide est acceptee, meme absente du corrige. Si elle te parait valide sans etre prevue : methode_alternative a true, nature_decision a a_valider, et tu attribues les points qu'elle merite. Tu ne mets JAMAIS zero d'office a une demarche que tu n'as pas su rattacher au corrige.
4. PAS DE POINTS POUR DES MOTS-CLES. La presence du mot « Pythagore » ou « Thales » ne vaut rien : tu verifies que les hypotheses sont posees, que la propriete choisie s'applique, que le remplacement numerique est correct, que le calcul suit, que l'unite est la bonne et que la conclusion repond a la question. Une conclusion correcte sans justification n'est PAS une demonstration complete.
5. GEOMETRIE. Les figures ne sont pas a l'echelle : tu ne mesures jamais sur un dessin. Tu verifies les six etapes ci-dessus et tu renvoies celles qui sont validees dans etapes_geometrie_validees.
6. ALGORITHMIQUE ET PROGRAMMATION. Tu interpretes les captures de blocs et les scripts avec prudence. Si un bloc, une valeur ou un emboitement n'est pas lisible avec certitude, tu ne devines pas : transcription_incertaine a true et validation humaine.
7. UNITES, ARRONDIS, VALEURS EXACTES. Tu appliques la precision demandee par le sujet. Une valeur approchee est acceptable quand le sujet le permet. Une unite manquante ne se paie qu'une fois.
8. NON-DOUBLE-SANCTION. Une meme faiblesse ne se paie pas deux fois : ni sur deux questions, ni sur deux titres de la meme question, ni une fois dans la question et une fois dans les 2 points de redaction.
9. ILLISIBLE N'EST PAS FAUX. Un doute sur un chiffre, un signe, un exposant, une fraction manuscrite : transcription_incertaine a true, lecture la plus favorable a l'eleve, validation humaine.
10. TU N'INVENTES RIEN. Aucune valeur, aucun calcul, aucun theoreme qui ne soit dans la copie ou dans le bareme.

QUALITE DE LA REDACTION — 2 POINTS COMPRIS DANS LES 14
Tu evalues clarte, precision, presentation des calculs, justification, vocabulaire, unites, conclusions, lisibilite de l'enchainement. Tu n'y sanctionnes pas ce que tu as deja sanctionne question par question : le systeme neutralise le doublon, mais tu dois eviter de le creer.

QUALITE DOCUMENTAIRE
Tu signales page manquante, page en double, page dans le mauvais ordre, image floue, texte illisible, reponse coupee, reponse attribuee a la mauvaise question, copie blanche, exercice non traite, brouillon, annotation etrangere, incoherence entre sujet, corrige et bareme, avec une certitude entre 0 et 1.

VALIDATION HUMAINE
Tu la demandes des que : la copie est partiellement illisible, une page manque, une reponse est entre deux questions, le bareme est incomplet ou contredit le corrige, une methode inhabituelle parait valide, un bloc de programme est illisible, ou ta confiance est faible. Tu ne refuses jamais silencieusement de corriger.

LE RAPPORT ELEVE
Tu ecris pour un eleve de troisieme : phrases courtes, vocabulaire simple, ton encourageant. Trois reussites au maximum, trois priorites au maximum, chacune appuyee sur un passage precis de la copie et suivie d'une action realisable. Aucun commentaire vague, rien d'humiliant, aucun diagnostic medical ou psychologique.`;

/* ================================================================== */
/*  2. Schema JSON de sortie                                          */
/* ================================================================== */

const STATUTS_AUTOMATISME = [
  'exacte',
  'variante_acceptee',
  'exacte_forme_non_conforme',
  'unite_absente',
  'unite_erronee',
  'dans_la_tolerance',
  'fausse',
  'absente',
  'illisible',
];

const STATUTS_QUESTION = [
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
];

const ETAPES_GEO = [
  'hypotheses',
  'propriete',
  'remplacement_numerique',
  'calcul',
  'unite',
  'conclusion',
];

const SOURCES = [
  'subject_bareme',
  'official_correction',
  'admin_instruction',
  'official_exam_rule',
  'default_rubric',
];

const NATURES = ['prevue_par_bareme', 'interpretation_raisonnable', 'a_valider'];

const ANOMALIES = [
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
];

function bloc(proprietes: Record<string, unknown>, requis: string[]) {
  return { type: 'object', properties: proprietes, required: requis, additionalProperties: false };
}

const listeDeTextes = { type: 'array', items: { type: 'string' } };

export function schemaCorrectionMaths(entree: {
  clesAutomatismes: string[];
  clesQuestions: string[];
  codesErreurs: string[];
  criteresQualite: string[];
}) {
  const erreur = bloc(
    {
      code: entree.codesErreurs.length
        ? { type: 'string', enum: entree.codesErreurs }
        : { type: 'string' },
      citation: { type: 'string' },
      certitude: { type: 'number' },
    },
    ['code', 'citation', 'certitude'],
  );

  const preuve = bloc(
    { page: { type: 'integer' }, citation: { type: 'string' }, explication: { type: 'string' } },
    ['page', 'citation', 'explication'],
  );

  return bloc(
    {
      document_quality: bloc(
        {
          statut: { type: 'string', enum: ['readable', 'partially_readable', 'unreadable'] },
          anomalies: {
            type: 'array',
            items: bloc(
              {
                code: { type: 'string', enum: ANOMALIES },
                pages: { type: 'array', items: { type: 'integer' } },
                detail: { type: 'string' },
                certitude: { type: 'number' },
              },
              ['code', 'pages', 'detail', 'certitude'],
            ),
          },
          zones_incertaines: {
            type: 'array',
            items: bloc(
              { page: { type: 'integer' }, description: { type: 'string' }, certitude: { type: 'number' } },
              ['page', 'description', 'certitude'],
            ),
          },
        },
        ['statut', 'anomalies', 'zones_incertaines'],
      ),

      automatismes: {
        type: 'array',
        items: bloc(
          {
            item_key: entree.clesAutomatismes.length
              ? { type: 'string', enum: entree.clesAutomatismes }
              : { type: 'string' },
            reponse_eleve: { type: 'string' },
            statut: { type: 'string', enum: STATUTS_AUTOMATISME },
            score: { type: 'number' },
            justification: { type: 'string' },
            certitude: { type: 'number' },
            illisible: { type: 'boolean' },
          },
          ['item_key', 'reponse_eleve', 'statut', 'score', 'justification', 'certitude', 'illisible'],
        ),
      },

      questions: {
        type: 'array',
        items: bloc(
          {
            question_key: entree.clesQuestions.length
              ? { type: 'string', enum: entree.clesQuestions }
              : { type: 'string' },
            score: { type: 'number' },
            statut: { type: 'string', enum: STATUTS_QUESTION },
            resultat_eleve: { type: 'string' },
            methode_identifiee: { type: 'string' },
            etapes_validees: listeDeTextes,
            etapes_manquantes: listeDeTextes,
            etapes_geometrie_validees: { type: 'array', items: { type: 'string', enum: ETAPES_GEO } },
            erreurs: { type: 'array', items: erreur },
            preuves: { type: 'array', items: preuve },
            depends_on_question: { type: ['string', 'null'] },
            inherited_value: { type: ['string', 'null'] },
            cascade_error: { type: 'boolean' },
            method_valid_from_student_value: { type: 'boolean' },
            methode_alternative: { type: 'boolean' },
            methode_alternative_description: { type: ['string', 'null'] },
            source_decision: { type: 'string', enum: SOURCES },
            nature_decision: { type: 'string', enum: NATURES },
            transcription_incertaine: { type: 'boolean' },
            justification: { type: 'string' },
            certitude: { type: 'number' },
          },
          [
            'question_key',
            'score',
            'statut',
            'resultat_eleve',
            'methode_identifiee',
            'etapes_validees',
            'etapes_manquantes',
            'etapes_geometrie_validees',
            'erreurs',
            'preuves',
            'depends_on_question',
            'inherited_value',
            'cascade_error',
            'method_valid_from_student_value',
            'methode_alternative',
            'methode_alternative_description',
            'source_decision',
            'nature_decision',
            'transcription_incertaine',
            'justification',
            'certitude',
          ],
        ),
      },

      qualite_redaction: {
        type: 'array',
        items: bloc(
          {
            code: { type: 'string', enum: entree.criteresQualite },
            score: { type: 'number' },
            observation: { type: 'string' },
            preuves: listeDeTextes,
          },
          ['code', 'score', 'observation', 'preuves'],
        ),
      },

      validation_humaine: {
        type: 'array',
        items: bloc(
          { code: { type: 'string' }, cible: { type: 'string' }, message: { type: 'string' } },
          ['code', 'cible', 'message'],
        ),
      },

      rapport_eleve: bloc(
        {
          reussites: listeDeTextes,
          priorites: listeDeTextes,
          erreurs_expliquees: {
            type: 'array',
            items: bloc(
              { titre: { type: 'string' }, explication: { type: 'string' }, conseil: { type: 'string' } },
              ['titre', 'explication', 'conseil'],
            ),
          },
          a_retravailler: listeDeTextes,
          strategie: { type: 'string' },
        },
        ['reussites', 'priorites', 'erreurs_expliquees', 'a_retravailler', 'strategie'],
      ),

      confidence: { type: 'number' },
    },
    [
      'document_quality',
      'automatismes',
      'questions',
      'qualite_redaction',
      'validation_humaine',
      'rapport_eleve',
      'confidence',
    ],
  );
}

/* ================================================================== */
/*  3. Validation cote serveur                                        */
/* ================================================================== */

export type SortieMathsIA = {
  document_quality: {
    statut: 'readable' | 'partially_readable' | 'unreadable';
    anomalies: { code: string; pages: number[]; detail: string; certitude: number }[];
    zones_incertaines: { page: number; description: string; certitude: number }[];
  };
  automatismes: unknown[];
  questions: unknown[];
  qualite_redaction: { code: string; score: number; observation: string; preuves: string[] }[];
  validation_humaine: { code: string; cible: string; message: string }[];
  rapport_eleve: {
    reussites: string[];
    priorites: string[];
    erreurs_expliquees: { titre: string; explication: string; conseil: string }[];
    a_retravailler: string[];
    strategie: string;
  };
  confidence: number;
};

/**
 * Validation de la sortie AVANT enregistrement (§10).
 *
 * Contrôle en plus du schéma : aucune chaîne à la place d'un nombre, aucune
 * clé inventée, aucune note globale, cohérence de la déclaration de cascade
 * (une cascade sans question source est une cascade inventée).
 */
export function validerSortieMaths(
  brut: unknown,
  attendu: { clesAutomatismes: string[]; clesQuestions: string[] },
): { ok: true; sortie: SortieMathsIA } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  const o = brut as Record<string, unknown> | null;

  if (!o || typeof o !== 'object') {
    return { ok: false, erreurs: ['La réponse du correcteur n’est pas un objet JSON.'] };
  }

  const nombre = (v: unknown, chemin: string): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    erreurs.push(
      `${chemin} : « ${String(v)} » n'est pas un nombre. Une chaîne de caractères ne peut pas remplacer un score.`,
    );
    return 0;
  };

  if (!o.document_quality || typeof o.document_quality !== 'object') {
    erreurs.push('document_quality est absent.');
  }

  const automatismes = Array.isArray(o.automatismes) ? o.automatismes : [];
  if (!Array.isArray(o.automatismes)) erreurs.push('automatismes doit être un tableau.');
  const vuesAuto = new Set<string>();
  for (const [i, a] of automatismes.entries()) {
    const ligne = a as Record<string, unknown>;
    const cle = String(ligne.item_key ?? '');
    if (!attendu.clesAutomatismes.includes(cle)) {
      erreurs.push(`automatismes[${i}].item_key = « ${cle} » : cet item n'existe pas au barème.`);
    }
    if (vuesAuto.has(cle)) erreurs.push(`automatismes[${i}] : l'item « ${cle} » est renvoyé deux fois.`);
    vuesAuto.add(cle);
    nombre(ligne.score, `automatismes[${i}].score`);
  }

  const questions = Array.isArray(o.questions) ? o.questions : [];
  if (!Array.isArray(o.questions)) erreurs.push('questions doit être un tableau.');
  const vuesQ = new Set<string>();
  for (const [i, q] of questions.entries()) {
    const ligne = q as Record<string, unknown>;
    const cle = String(ligne.question_key ?? '');
    if (!attendu.clesQuestions.includes(cle)) {
      erreurs.push(`questions[${i}].question_key = « ${cle} » : cette question n'existe pas au barème.`);
    }
    if (vuesQ.has(cle)) erreurs.push(`questions[${i}] : la question « ${cle} » est renvoyée deux fois.`);
    vuesQ.add(cle);
    nombre(ligne.score, `questions[${i}].score`);

    // Une cascade déclarée sans question source est une cascade inventée : la
    // règle de non-double-sanction ne pourrait pas s'appliquer.
    if (ligne.cascade_error === true && !ligne.depends_on_question) {
      erreurs.push(
        `questions[${i}] : cascade_error déclarée sans depends_on_question. Une poursuite après erreur exige la question source.`,
      );
    }
    if (ligne.method_valid_from_student_value === true && ligne.cascade_error !== true) {
      erreurs.push(
        `questions[${i}] : method_valid_from_student_value sans cascade_error. Les deux vont ensemble.`,
      );
    }
    const certitude = nombre(ligne.certitude, `questions[${i}].certitude`);
    if (certitude < 0 || certitude > 1) {
      erreurs.push(`questions[${i}].certitude = ${certitude} : hors de l'intervalle [0 ; 1].`);
    }
  }

  const confiance = nombre(o.confidence, 'confidence');
  if (confiance < 0 || confiance > 1) {
    erreurs.push(`confidence = ${confiance} : hors de l'intervalle [0 ; 1].`);
  }

  for (const interdit of ['note', 'note_finale', 'score_total', 'total', 'note_sur_20', 'score_out_of_20']) {
    if (interdit in o) {
      erreurs.push(
        `Le correcteur a renvoyé « ${interdit} » : il n'a pas à calculer de note. Seul le serveur fait les sommes.`,
      );
    }
  }

  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, sortie: o as unknown as SortieMathsIA };
}
