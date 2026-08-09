/**
 * PROMPT SYSTEME ET SCHEMA JSON — FRANCAIS, BREVET.
 *
 * Fichier PUR : aucune dependance. Il vit sous `supabase/functions/_shared/`
 * pour que l'Edge Function `correct-brevet-francais` le bundle, et il est
 * re-exporte cote application par `src/lib/brevetFrancaisPrompt.ts` — ce qui
 * permet aux tests hors ligne de verifier le prompt et le schema REELLEMENT
 * envoyes en production.
 *
 * DEUX CHOSES SEULEMENT SONT ICI
 * ------------------------------
 * 1. La consigne remise au modele. Elle ne contient AUCUNE regle de
 *    mathematiques, et aucune regle du baccalaureat.
 * 2. Le schema JSON de sortie, strict, plus son validateur cote serveur.
 *    Le modele ne renvoie JAMAIS de note : il renvoie des points par question,
 *    par forme de reecriture et par critere. Les sommes sont faites par le
 *    serveur (`brevet-francais-noyau.ts`), jamais par lui.
 */

export const VERSION_PROMPT_FRANCAIS = '1.0.0';

/* ================================================================== */
/*  1. Consigne systeme                                               */
/* ================================================================== */

export const CONSIGNE_FRANCAIS_BREVET = `Tu corriges une copie de FRANCAIS du diplome national du brevet (DNB), serie generale, classe de troisieme. Tu n'es pas un correcteur de baccalaureat : le niveau attendu est celui d'un eleve de fin de troisieme, jamais celui d'un lyceen.

CE QUI PRODUIT LA NOTE
Tu n'annonces JAMAIS de note, ni globale, ni par bloc. Tu attribues des points question par question, forme par forme et critere par critere, et le systeme fait les sommes. Toute note que tu ecrirais serait ignoree.

L'ORDRE DE PRIORITE DES REGLES — tu l'appliques sans exception
1. Le BAREME DETAILLE DU SUJET. S'il existe, il decide. Tu ne le completes pas, tu ne l'interpretes pas au-dela de ce qu'il dit.
2. Le CORRIGE OFFICIEL ou valide par l'administratrice.
3. Les CONSIGNES SPECIFIQUES renseignees par l'administratrice.
4. Les REGLES OFFICIELLES DU DNB fournies dans le dossier.
5. La GRILLE PAR DEFAUT, uniquement si rien de plus precis n'existe.
Pour chaque decision tu renseignes source_decision avec la valeur exacte utilisee (subject_bareme, official_correction, admin_instruction, official_exam_rule, default_rubric) et nature_decision parmi : prevue_par_bareme, interpretation_raisonnable, a_valider.

LES TROIS BLOCS, INDEPENDANTS
- Travail sur le texte litteraire et, eventuellement, sur une image : 50 points (reecriture comprise).
- Dictee : 10 points.
- Redaction : 40 points.
Total 100 points, ramene sur 20 par le systeme. Tu ne fais pas cette conversion.

BLOC 1 — TRAVAIL SUR LE TEXTE
Pour chaque question du bareme fourni, tu renvoies un statut parmi :
exacte, partiellement_exacte, juste_mais_peu_justifiee, equivalente_vocabulaire_different, plausible_non_etayee, citation_sans_explication, explication_sans_citation_exigee, erreur_de_comprehension, erreur_de_langue, hors_sujet, absence_de_reponse, illisible.
Regles imperatives :
- Tu n'exiges PAS une formulation identique au corrige. Une reponse dite autrement, avec un autre vocabulaire, qui repond REELLEMENT a la question, est exacte : tu emploies alors equivalente_vocabulaire_different et tu accordes le plein.
- Une citation juste sans explication ne vaut le plein que si le bareme n'exigeait pas d'explication.
- Une explication juste sans la citation exigee ne vaut jamais zero d'office : le bareme dit ce que vaut l'idee seule ; sinon tu proposes des points partiels et tu passes nature_decision a a_valider.
- Une reponse plausible mais non etayee n'est pas une reponse exacte.
- Une erreur de LANGUE dans une reponse de comprehension n'est pas une erreur de COMPREHENSION : tu les separes, et tu ne les paies pas deux fois.
- Une zone illisible n'est JAMAIS une absence de reponse. Tu emploies illisible, tu passes transcription_incertaine a true, et tu n'inventes pas ce qui pourrait y etre ecrit.

BLOC 1 BIS — REECRITURE
Tu traites chaque forme separement. Pour chacune tu renvoies la forme produite exactement telle que la copie la donne, sans la corriger ni la normaliser. Tu distingues :
- la TRANSFORMATION demandee (temps, enonciation, personne, genre, nombre) ;
- l'erreur de PURE COPIE, qui ne porte pas sur la forme a modifier.
Ces deux erreurs relevent de baremes differents et ne se cumulent jamais sur la meme forme. Si une forme est illisible, tu le dis et tu n'inventes rien.

BLOC 2 — DICTEE
Tu ne notes pas la dictee. Tu transcris LE PLUS FIDELEMENT POSSIBLE ce que la copie porte, mot pour mot, y compris les fautes, les accents, les majuscules et la ponctuation, et tu ecris [illisible] la ou tu ne peux pas lire. C'est le systeme qui compare au texte attendu et applique le bareme du sujet. Ne corrige jamais silencieusement une faute en transcrivant : ce serait effacer ce qui doit etre evalue.

BLOC 3 — REDACTION
Tu identifies d'abord le sujet traite : imagination, reflexion, incertain, les_deux, non_identifiable. En cas de doute reel, tu dis incertain — tu ne tranches pas a la place d'un humain.
Tu evalues ensuite avec la SEULE grille du sujet identifie. Les deux grilles sont distinctes et ne se melangent jamais.
Tu ne penalises pas deux fois la meme faiblesse : une faute d'accord se paie dans le critere de langue prevu, pas aussi dans la coherence, l'organisation ou l'expression, sauf si le bareme du sujet l'autorise explicitement.
Pour chaque critere tu cites de COURTS passages de la copie qui justifient le niveau retenu. Tu ne recopies pas la production entiere.

QUALITE DOCUMENTAIRE
Tu signales ce que tu observes : page manquante, page en double, page dans le mauvais ordre, image floue, texte illisible, reponse coupee, reponse attribuee a la mauvaise question, copie blanche, exercice non traite, presence de brouillon, annotation etrangere, incoherence entre sujet, corrige et bareme. Tu donnes une certitude entre 0 et 1. Tu ne transformes jamais une anomalie documentaire en faute de l'eleve.

VALIDATION HUMAINE
Tu demandes une validation humaine des que : la copie est partiellement illisible, une page manque, le sujet de redaction est ambigu, une reponse est situee entre deux questions, le bareme est incomplet, le bareme et le corrige se contredisent, une interpretation litteraire defendable n'etait pas prevue, ou ta confiance est faible. Tu ne refuses jamais silencieusement de corriger une copie : tu corriges ce que tu peux et tu signales le reste.

CE QUE TU N'AS PAS LE DROIT DE FAIRE
- Inventer une reponse, une citation, un mot de la copie, ou le contenu d'une zone illisible.
- Attribuer la reponse d'une question a une autre.
- Ecrire une note, un total, un pourcentage ou une appreciation chiffree.
- Employer un code d'erreur absent de la taxonomie fournie.
- Ecrire quoi que ce soit d'humiliant, ni aucun diagnostic medical ou psychologique.

LE RAPPORT ELEVE
Tu ecris pour un eleve de troisieme : phrases courtes, vocabulaire simple, ton encourageant et concret. Trois reussites au maximum, trois priorites au maximum, chacune appuyee sur un passage precis de la copie et suivie d'une action realisable. Pas de commentaire vague.`;

/* ================================================================== */
/*  2. Schema JSON de sortie                                          */
/* ================================================================== */

const STATUTS_REPONSE = [
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

/**
 * Schéma strict de la sortie attendue.
 *
 * Deux choix qui comptent :
 *   • `question_key`, `forme_cle` et `critere_code` sont des `enum` construits
 *     depuis le barème du sujet : le modèle ne peut pas inventer une question ;
 *   • aucun champ ne porte de note globale. Il n'y a nulle part où en écrire une.
 */
export function schemaCorrectionFrancais(entree: {
  clesQuestions: string[];
  clesReecriture: string[];
  criteresImagination: string[];
  criteresReflexion: string[];
  codesErreurs: string[];
}) {
  const criteres = [
    ...new Set([...entree.criteresImagination, ...entree.criteresReflexion]),
  ];

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
    {
      page: { type: 'integer' },
      citation: { type: 'string' },
      explication: { type: 'string' },
    },
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
              {
                page: { type: 'integer' },
                description: { type: 'string' },
                certitude: { type: 'number' },
              },
              ['page', 'description', 'certitude'],
            ),
          },
        },
        ['statut', 'anomalies', 'zones_incertaines'],
      ),

      questions: {
        type: 'array',
        items: bloc(
          {
            question_key: entree.clesQuestions.length
              ? { type: 'string', enum: entree.clesQuestions }
              : { type: 'string' },
            score: { type: 'number' },
            statut: { type: 'string', enum: STATUTS_REPONSE },
            reponse_detectee: { type: 'string' },
            elements_trouves: listeDeTextes,
            elements_manquants: listeDeTextes,
            citations_relevees: listeDeTextes,
            erreurs: { type: 'array', items: erreur },
            preuves: { type: 'array', items: preuve },
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
            'reponse_detectee',
            'elements_trouves',
            'elements_manquants',
            'citations_relevees',
            'erreurs',
            'preuves',
            'source_decision',
            'nature_decision',
            'transcription_incertaine',
            'justification',
            'certitude',
          ],
        ),
      },

      reecriture: {
        type: 'array',
        items: bloc(
          {
            cle: entree.clesReecriture.length
              ? { type: 'string', enum: entree.clesReecriture }
              : { type: 'string' },
            forme_produite: { type: 'string' },
            illisible: { type: 'boolean' },
          },
          ['cle', 'forme_produite', 'illisible'],
        ),
      },

      dictee: bloc(
        {
          texte_transcrit: { type: 'string' },
          zones_illisibles: { type: 'integer' },
          commentaire_lecture: { type: 'string' },
        },
        ['texte_transcrit', 'zones_illisibles', 'commentaire_lecture'],
      ),

      redaction: bloc(
        {
          sujet_choisi: {
            type: 'string',
            enum: ['imagination', 'reflexion', 'incertain', 'les_deux', 'non_identifiable'],
          },
          indices_du_choix: listeDeTextes,
          longueur_estimee_lignes: { type: ['integer', 'null'] },
          criteres: {
            type: 'array',
            items: bloc(
              {
                code: criteres.length ? { type: 'string', enum: criteres } : { type: 'string' },
                score: { type: 'number' },
                niveau: { type: 'string' },
                preuves: listeDeTextes,
                points_forts: listeDeTextes,
                insuffisances: listeDeTextes,
                erreurs_representatives: { type: 'array', items: erreur },
                conseil: { type: 'string' },
                certitude: { type: 'number' },
              },
              [
                'code',
                'score',
                'niveau',
                'preuves',
                'points_forts',
                'insuffisances',
                'erreurs_representatives',
                'conseil',
                'certitude',
              ],
            ),
          },
        },
        ['sujet_choisi', 'indices_du_choix', 'longueur_estimee_lignes', 'criteres'],
      ),

      validation_humaine: {
        type: 'array',
        items: bloc(
          {
            code: { type: 'string' },
            cible: { type: 'string' },
            message: { type: 'string' },
          },
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
      'questions',
      'reecriture',
      'dictee',
      'redaction',
      'validation_humaine',
      'rapport_eleve',
      'confidence',
    ],
  );
}

/* ================================================================== */
/*  3. Validation cote serveur                                        */
/* ================================================================== */

export type SortieFrancaisIA = {
  document_quality: {
    statut: 'readable' | 'partially_readable' | 'unreadable';
    anomalies: { code: string; pages: number[]; detail: string; certitude: number }[];
    zones_incertaines: { page: number; description: string; certitude: number }[];
  };
  questions: unknown[];
  reecriture: { cle: string; forme_produite: string; illisible: boolean }[];
  dictee: { texte_transcrit: string; zones_illisibles: number; commentaire_lecture: string };
  redaction: {
    sujet_choisi: string;
    indices_du_choix: string[];
    longueur_estimee_lignes: number | null;
    criteres: unknown[];
  };
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
 * Validation de la sortie AVANT tout enregistrement (§10).
 *
 * Le schéma JSON de l'API contraint déjà la forme ; ce validateur-ci porte sur
 * ce qu'un schéma ne peut pas exprimer : aucune chaîne à la place d'un nombre,
 * aucune clé inventée, aucune note globale, `null` seulement là où il est
 * légitime. Toute violation est une erreur de validation, pas un avertissement.
 */
export function validerSortieFrancais(
  brut: unknown,
  attendu: { clesQuestions: string[]; clesReecriture: string[] },
): { ok: true; sortie: SortieFrancaisIA } | { ok: false; erreurs: string[] } {
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

  const dq = o.document_quality as Record<string, unknown> | undefined;
  if (!dq || typeof dq !== 'object') {
    erreurs.push('document_quality est absent.');
  }

  const questions = Array.isArray(o.questions) ? o.questions : [];
  if (!Array.isArray(o.questions)) erreurs.push('questions doit être un tableau.');
  const clesVues = new Set<string>();
  for (const [i, q] of questions.entries()) {
    const ligne = q as Record<string, unknown>;
    const cle = String(ligne.question_key ?? '');
    if (!attendu.clesQuestions.includes(cle)) {
      erreurs.push(`questions[${i}].question_key = « ${cle} » : cette question n'existe pas au barème.`);
    }
    if (clesVues.has(cle)) erreurs.push(`questions[${i}] : la question « ${cle} » est renvoyée deux fois.`);
    clesVues.add(cle);
    nombre(ligne.score, `questions[${i}].score`);
    const certitude = nombre(ligne.certitude, `questions[${i}].certitude`);
    if (certitude < 0 || certitude > 1) {
      erreurs.push(`questions[${i}].certitude = ${certitude} : hors de l'intervalle [0 ; 1].`);
    }
  }

  const reecriture = Array.isArray(o.reecriture) ? o.reecriture : [];
  for (const [i, f] of reecriture.entries()) {
    const ligne = f as Record<string, unknown>;
    const cle = String(ligne.cle ?? '');
    if (attendu.clesReecriture.length && !attendu.clesReecriture.includes(cle)) {
      erreurs.push(`reecriture[${i}].cle = « ${cle} » : cette forme n'existe pas au barème.`);
    }
    if (typeof ligne.forme_produite !== 'string') {
      erreurs.push(`reecriture[${i}].forme_produite doit être une chaîne, même vide.`);
    }
  }

  const dictee = o.dictee as Record<string, unknown> | undefined;
  if (!dictee || typeof dictee.texte_transcrit !== 'string') {
    erreurs.push('dictee.texte_transcrit est absent : sans transcription, la dictée ne peut pas être comparée.');
  }

  const redaction = o.redaction as Record<string, unknown> | undefined;
  if (!redaction) {
    erreurs.push('redaction est absent.');
  } else {
    const longueur = redaction.longueur_estimee_lignes;
    if (longueur !== null && typeof longueur !== 'number') {
      erreurs.push(
        'redaction.longueur_estimee_lignes doit être un nombre, ou null si l’information n’est réellement pas disponible.',
      );
    }
    if (!Array.isArray(redaction.criteres)) erreurs.push('redaction.criteres doit être un tableau.');
  }

  const confiance = nombre(o.confidence, 'confidence');
  if (confiance < 0 || confiance > 1) {
    erreurs.push(`confidence = ${confiance} : hors de l'intervalle [0 ; 1].`);
  }

  // Aucune note globale n'est admise, où qu'elle soit.
  for (const interdit of ['note', 'note_finale', 'score_total', 'total', 'note_sur_20']) {
    if (interdit in o) {
      erreurs.push(
        `Le correcteur a renvoyé « ${interdit} » : il n'a pas à calculer de note. Seul le serveur fait les sommes.`,
      );
    }
  }

  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, sortie: o as unknown as SortieFrancaisIA };
}
