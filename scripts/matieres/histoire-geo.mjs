// =====================================================================
//  DONNEES DE LA MATIERE : HISTOIRE-GEOGRAPHIE (tronc commun), session 2027
//
//  Source : ~/Downloads/Dossier_Histoire_Geographie_Session_2027
//    01_PROGRAMME  -> programme_cards_histoire_geographie.json
//    02_GRILLES    -> rubrics_histoire_geographie.json + error_taxonomy_*.json
//    03_SUJETS     -> subject_bank_session_2027.json
//    04_CALIBRATION-> benchmark_cards_histoire_geographie.json
//
//  Ce que le dossier fournissait tel quel : les 4 barèmes (codes, libellés,
//  points), la taxonomie des 16 erreurs, les 5 sujets, les 5 bandes de notes.
//  Ce qui a été rédigé ici parce que le dossier ne le contenait pas : les
//  descripteurs de niveau (le dossier disait seulement « maîtrise complète /
//  partielle »), les system_prompt, les profils d'étalons et les gabarits de
//  dossier élève. Tout est donc à faire valider par un professeur — c'est
//  aussi l'avertissement porté par le MANIFEST du dossier lui-même.
//
//  Particularité de la matière : les épreuves d'histoire-géographie sont
//  notées SUR 10 (deux exercices de 10 points font l'épreuve sur 20), là où
//  les copies étalons restent normalisées sur 20 comme dans les autres
//  matières. L'échelle est donc explicitée dans chaque system_prompt.
// =====================================================================

export const matiere = 'histoire-geo';
export const libelle = 'Histoire-Géographie';
export const session = 2027;

// ---------------------------------------------------------------------
//  Taxonomie d'erreurs (02_GRILLES_ET_ERREURS/error_taxonomy_*.json)
//  Elle vit dans rubric_json.common_error_taxonomy, comme pour SES, SVT,
//  HGGSP et HLP : la table error_taxonomy n'est filtrée que par
//  exercise_type, sans colonne matière, donc y écrire ferait fuiter des
//  codes d'une matière à l'autre.
// ---------------------------------------------------------------------
const TAXONOMIE = [
  { code: 'HG-HS-01',    criterion: 'PROB',  severity: 'major',    category: 'hors_sujet',            description: "Hors sujet, ou réponse au thème voisin : le devoir traite autre chose que la question posée, même s'il est exact." },
  { code: 'HG-CHRON-01', criterion: 'KNOW',  severity: 'major',    category: 'chronologie',           description: 'Anachronisme ou chronologie incohérente : faits placés hors de leur période, enchaînement impossible.' },
  { code: 'HG-FACT-01',  criterion: 'KNOW',  severity: 'major',    category: 'fait_inexact',          description: 'Fait, acteur, lieu ou date erroné.' },
  { code: 'HG-VAGUE-01', criterion: 'EX',    severity: 'moderate', category: 'affirmation_vague',     description: "Affirmation générale sans exemple : rien ne vient prouver ce qui est avancé." },
  { code: 'HG-CAT-01',   criterion: 'ORG',   severity: 'moderate', category: 'causalite',             description: 'Confusion entre cause, manifestation et conséquence.' },
  { code: 'HG-SCALE-01', criterion: 'EX',    severity: 'moderate', category: 'echelle',               description: "Échelle spatiale non précisée ou confondue (mondial, régional, national, local)." },
  { code: 'HG-DOC-01',   criterion: 'ANAL',  severity: 'major',    category: 'paraphrase',            description: "Paraphrase du document : il est recopié ou reformulé, jamais expliqué ni relié aux connaissances." },
  { code: 'HG-CITE-01',  criterion: 'EVID',  severity: 'moderate', category: 'citation_non_reliee',   description: "Citation prélevée mais non reliée à l'argument qu'elle devrait soutenir." },
  { code: 'HG-CTX-01',   criterion: 'PRES',  severity: 'moderate', category: 'contexte_absent',       description: "Nature, auteur, date ou contexte du document non exploités." },
  { code: 'HG-CRIT-01',  criterion: 'CRIT',  severity: 'moderate', category: 'critique_absente',      description: "Aucune distance critique : ni portée, ni limites, ni point de vue de la source." },
  { code: 'HG-CROQ-01',  criterion: 'LEG',   severity: 'major',    category: 'legende',               description: "Légende non organisée : pas de parties, pas de titres, figurés listés en vrac." },
  { code: 'HG-CROQ-02',  criterion: 'LANGC', severity: 'major',    category: 'figures',               description: 'Figurés inadaptés ou incohérents (ponctuel, linéaire, de surface mal employés).' },
  { code: 'HG-CROQ-03',  criterion: 'LOC',   severity: 'major',    category: 'localisation',          description: 'Localisations insuffisantes ou erronées, nomenclature absente.' },
  { code: 'HG-PLAN-01',  criterion: 'ORG',   severity: 'moderate', category: 'plan_catalogue',        description: "Plan catalogue ou répétitif : les parties juxtaposent sans progresser." },
  { code: 'HG-LANG-01',  criterion: 'LANG',  severity: 'minor',    category: 'vocabulaire',           description: "Vocabulaire disciplinaire imprécis ou notion employée pour une autre." },
  { code: 'HG-TRANS-01', criterion: 'TRANSCRIPTION', severity: 'major', category: 'transcription',    description: "Nom propre, chiffre ou date illisible dans la transcription : déclenche une relecture humaine, jamais une sanction." },
];

/**
 * Les codes d'erreur sont communs a la matiere, mais le critere touche depend
 * de la grille : un fait inexact releve de KNOW dans une question
 * problematisee et de ANAL dans une analyse de document, qui n'a pas de
 * critere de connaissances. Sans cette correspondance par grille, le
 * correcteur se verrait designer un critere absent de son bareme.
 */
const taxoPour = (codes, criteresParGrille = {}) =>
  TAXONOMIE.filter((e) => codes.includes(e.code)).map((e) =>
    criteresParGrille[e.code] ? { ...e, criterion: criteresParGrille[e.code] } : e,
  );

// ---------------------------------------------------------------------
//  Règles communes à toutes les grilles
// ---------------------------------------------------------------------
const GARDE_FOUS_COMMUNS = [
  "Tu n'inventes aucun critere en dehors de la grille.",
  "Tu ne sanctionnes pas deux fois la meme faiblesse sur deux criteres differents.",
  'Chaque score est justifie par une citation localisable dans la transcription.',
  "Tu n'inventes JAMAIS un fait, une date, un acteur, un lieu ou un exemple absent de la copie ou du sujet.",
  "Tu ne recompenses pas une connaissance exacte mais hors sujet.",
  "Le bareme ou le corrige propre au sujet, s'il est fourni dans la fiche sujet, prime toujours sur cette grille generique.",
  "Une erreur de transcription a fort impact declenche une relecture humaine et non une sanction.",
  "La forme n'efface pas un contenu juste : elle se juge sur le critere d'expression.",
];

// Socle commun des system_prompt : echelle sur 10, etalons sur 20, codes
// d'erreur de la matiere, ordre des etalons. 100% ASCII comme les autres
// matieres (les prompts partent tels quels dans l'API Anthropic).
const SOCLE_PROMPT =
  "ECHELLE DE NOTATION : le bareme total de cette grille vaut 10 points, pas 20. " +
  "Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, donc un nombre compris entre 0 et 10. " +
  "Les copies etalons portent, elles, une note NORMALISEE SUR 20 dans leur champ score : pour comparer ta note a celle d'un etalon, multiplie ta note par deux. " +
  "Leur champ criterion_scores est deja a l'echelle de cette grille, sur 10. " +
  "CODES D'ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille d'histoire-geographie fournie (HG-xxx-nn). " +
  "Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d'une autre matiere. " +
  "ETALONS : les copies etalons servent a situer le niveau global. Le champ benchmark_comparison.lower_or_equal_id doit designer l'etalon dont la note est INFERIEURE OU EGALE a celle que tu attribues, et upper_or_equal_id celui dont la note est SUPERIEURE OU EGALE. " +
  "Verifie l'ordre avant de repondre. Si aucun etalon n'encadre la note d'un cote, reprends l'etalon le plus proche de ce cote et dis-le dans explanation.";

// ---------------------------------------------------------------------
//  1) LES 4 GRILLES
// ---------------------------------------------------------------------
export const rubrics = [
  {
    id: 'HG_QP_V1',
    track: 'generale',
    exercise_type: 'hg_question_problematisee',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert d'histoire-geographie au lycee, sur le programme du tronc commun de premiere et de terminale. " +
      "Tu corriges une question problematisee : une reponse redigee, organisee et argumentee a une question posee, sans dossier documentaire. " +
      "Tu evalues la comprehension du sujet, la precision des connaissances mobilisees, l'organisation de la demonstration et la qualite des exemples. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire la copie ideale. " +
      "Tu n'imposes aucun plan unique : tout plan qui repond a la question est recevable. " +
      "Tu ne recompenses pas le cours recite ni les connaissances exactes mais hors sujet. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu restes strictement neutre sur les questions politiques et memorielles : tu evalues la demonstration, jamais l'opinion. " +
      "Tu demandes une verification humaine si la transcription est incertaine, si le sujet est mal reconnu ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 10,
      principle:
        "Une question problematisee se juge sur une reponse : le sujet est compris et borne, les connaissances sont selectionnees pour lui, la demonstration progresse, les exemples prouvent.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 criteres et leurs points du dossier Histoire-Geographie session 2027 (HG-QP) : PROB 2, KNOW 3, ORG 2, EX 2, LANG 1. Les descripteurs de niveau ont ete rediges par Les Matinees du Bac, le dossier source n'en fournissait pas.",
      criteria: [
        {
          code: 'PROB',
          name: 'Compréhension et problématisation',
          maximum_score: 2,
          description:
            "Compréhension du libellé, identification des bornes chronologiques, spatiales et notionnelles, construction d'une réponse problématisée. Recopier la question sans créer de tension n'est pas problématiser.",
          levels: {
            '0': 'Copie blanche, ou réponse sans rapport avec la question posée.',
            '0.25': 'Insuffisant : le sujet est mal compris ou traité comme un thème voisin ; les bornes sont ignorées.',
            '0.75': "Fragile : le sujet est compris globalement, mais les termes ne sont pas définis et aucune réponse d'ensemble n'est annoncée.",
            '1.25': "Satisfaisant : les termes clés sont définis, les bornes tenues, une réponse d'ensemble est annoncée.",
            '2': "Très satisfaisant : le libellé est analysé mot à mot, la tension du sujet est explicitée et elle guide toute la réponse.",
          },
        },
        {
          code: 'KNOW',
          name: 'Connaissances précises et pertinentes',
          maximum_score: 3,
          description:
            "Exactitude des faits, dates, acteurs et lieux ; maîtrise des notions du programme ; et surtout SÉLECTION des connaissances utiles au sujet, pas restitution du chapitre.",
          levels: {
            '0': 'Aucune connaissance recevable.',
            '0.5': 'Insuffisant : erreurs factuelles ou anachronismes qui faussent la réponse ; notions absentes.',
            '1': 'Fragile : quelques connaissances exactes mais partielles, imprécises ou récitées sans lien avec la question.',
            '2': "Satisfaisant : les connaissances attendues sont là et exactes, la sélection est visible même si des lacunes subsistent.",
            '3': "Très satisfaisant : connaissances précises, datées, situées, nuancées, entièrement mises au service du sujet.",
          },
        },
        {
          code: 'ORG',
          name: 'Organisation de la démonstration',
          maximum_score: 2,
          description:
            "Existence d'un fil directeur, progression des parties, articulation cause / manifestation / conséquence, présence d'une introduction et d'une conclusion qui répond.",
          levels: {
            '0': "Aucune organisation : réponse en vrac ou notes juxtaposées.",
            '0.25': "Insuffisant : ni introduction ni conclusion, idées sans ordre repérable.",
            '0.75': 'Fragile : plan catalogue ou répétitif, parties juxtaposées sans progression.',
            '1.25': "Satisfaisant : un plan clair est annoncé et tenu, la conclusion répond à la question.",
            '2': "Très satisfaisant : la démonstration progresse réellement, les transitions font avancer le raisonnement, causes et conséquences sont distinguées.",
          },
        },
        {
          code: 'EX',
          name: "Exemples, repères et changements d'échelle",
          maximum_score: 2,
          description:
            "Précision des exemples (daté, situé, acteurs identifiés), pertinence démonstrative, et capacité à changer d'échelle (mondial, régional, national, local) quand le sujet l'exige.",
          levels: {
            '0': 'Aucun exemple ni repère.',
            '0.25': "Insuffisant : affirmations générales sans le moindre exemple, ou exemples faux.",
            '0.75': "Fragile : exemples cités mais non exploités, imprécis, ou tous pris dans le même espace et la même période.",
            '1.25': "Satisfaisant : exemples exacts, situés et datés, qui illustrent correctement le propos.",
            '2': "Très satisfaisant : exemples variés, précis et réellement démonstratifs, avec un changement d'échelle maîtrisé.",
          },
        },
        {
          code: 'LANG',
          name: 'Expression et vocabulaire disciplinaire',
          maximum_score: 1,
          description:
            "Clarté de la rédaction, paragraphes construits, et emploi exact du vocabulaire de la discipline. On n'y sanctionne pas le contenu, déjà jugé ailleurs.",
          levels: {
            '0': 'Expression inintelligible.',
            '0.25': "Insuffisant : rédaction très fautive ou style télégraphique ; vocabulaire disciplinaire absent.",
            '0.5': 'Fragile : phrases lourdes ou approximatives, notions employées les unes pour les autres.',
            '0.75': 'Satisfaisant : expression claire, vocabulaire disciplinaire correct malgré quelques imprécisions.',
            '1': 'Très satisfaisant : rédaction fluide, paragraphes construits, vocabulaire exact et employé à bon escient.',
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Tu n'imposes aucun plan unique : tout plan pertinent qui repond a la question est recevable.",
        "Tu restes neutre sur les questions politiques et memorielles : tu evalues la demonstration, jamais l'opinion de l'eleve.",
      ],
      common_error_taxonomy: taxoPour(['HG-HS-01', 'HG-CHRON-01', 'HG-FACT-01', 'HG-VAGUE-01', 'HG-CAT-01', 'HG-SCALE-01', 'HG-PLAN-01', 'HG-LANG-01', 'HG-TRANS-01']),
    },
  },

  {
    id: 'HG_DOC_V1',
    track: 'generale',
    exercise_type: 'hg_analyse_document',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert d'histoire-geographie au lycee, sur le programme du tronc commun de premiere et de terminale. " +
      "Tu corriges une analyse de document(s) : l'eleve doit presenter la source, en prelever les informations, les croiser avec ses connaissances et en marquer les limites. " +
      "La paraphrase est la faute centrale de cet exercice : un document reformule sans etre explique ne rapporte pas de points d'analyse. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire la copie ideale. " +
      "Tu ne reproches jamais a l'eleve de ne pas avoir vu ce qui ne figure pas dans le document tel qu'il t'est decrit dans la fiche sujet. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu restes strictement neutre sur les questions politiques et memorielles : tu evalues la demonstration, jamais l'opinion. " +
      "Tu demandes une verification humaine si la transcription est incertaine, si le document n'est pas identifiable ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 10,
      principle:
        "Une analyse de document se juge sur un croisement : la source est situee, les informations sont prelevees et citees, elles sont expliquees par les connaissances, et la portee comme les limites du document sont dites.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 criteres et leurs points du dossier Histoire-Geographie session 2027 (HG-DOC) : PRES 2, EVID 2, ANAL 3, CRIT 2, LANG 1. Les descripteurs de niveau ont ete rediges par Les Matinees du Bac.",
      criteria: [
        {
          code: 'PRES',
          name: 'Présentation et contextualisation',
          maximum_score: 2,
          description:
            "Nature du document, auteur, date, destinataire, contexte historique ou géographique — et surtout exploitation de ces éléments, pas simple récitation d'une fiche d'identité.",
          levels: {
            '0': 'Aucune présentation du document.',
            '0.25': "Insuffisant : nature, auteur ou date faux, ou document confondu avec un autre.",
            '0.75': "Fragile : fiche d'identité récitée (nature, auteur, date) sans contexte ni utilité pour la suite.",
            '1.25': 'Satisfaisant : document correctement présenté et replacé dans son contexte.',
            '2': "Très satisfaisant : la présentation est exploitée — le statut de l'auteur et le moment de production éclairent déjà la lecture du document.",
          },
        },
        {
          code: 'EVID',
          name: 'Prélèvement et citation des informations',
          maximum_score: 2,
          description:
            "Choix des passages ou données réellement utiles, citation exacte et brève, mise en relation de chaque citation avec l'idée qu'elle sert.",
          levels: {
            '0': 'Aucun prélèvement dans le document.',
            '0.25': 'Insuffisant : le document est recopié en bloc, ou aucune citation ne figure.',
            '0.75': "Fragile : citations présentes mais mal choisies, trop longues, ou jamais reliées à un argument.",
            '1.25': 'Satisfaisant : citations courtes, exactes et pertinentes, reliées au propos.',
            '2': "Très satisfaisant : prélèvements hiérarchisés, chacun mis au service d'une idée explicite.",
          },
        },
        {
          code: 'ANAL',
          name: 'Analyse croisée avec les connaissances',
          maximum_score: 3,
          description:
            "Explication du document par les connaissances du programme : ce que le document dit, ce qu'il ne dit pas, ce que le cours permet d'y comprendre. C'est ici que la paraphrase se paie.",
          levels: {
            '0': 'Aucune analyse.',
            '0.5': 'Insuffisant : paraphrase intégrale, le document est reformulé sans être expliqué.',
            '1': "Fragile : quelques apports de connaissances plaqués à côté du document, sans croisement réel.",
            '2': "Satisfaisant : le document est expliqué par les connaissances, avec des lacunes ou des passages laissés de côté.",
            '3': "Très satisfaisant : croisement constant et précis — chaque élément du document est éclairé par une connaissance exacte, et réciproquement.",
          },
        },
        {
          code: 'CRIT',
          name: 'Distance critique, portée et limites',
          maximum_score: 2,
          description:
            "Point de vue de l'auteur, intention, ce que la source permet d'établir et ce qu'elle ne prouve pas. Une critique n'est pas un procès du document.",
          levels: {
            '0': 'Aucune prise de distance.',
            '0.25': "Insuffisant : le document est pris pour la vérité, ou disqualifié en bloc sans argument.",
            '0.75': "Fragile : la subjectivité de la source est signalée en une formule toute faite, sans conséquence sur la lecture.",
            '1.25': "Satisfaisant : intention de l'auteur identifiée, une limite précise du document est formulée.",
            '2': "Très satisfaisant : portée et limites sont pesées ensemble — on sait ce que ce document prouve et ce qu'il faudrait d'autre pour aller plus loin.",
          },
        },
        {
          code: 'LANG',
          name: 'Organisation et expression',
          maximum_score: 1,
          description:
            "Réponse organisée (introduction, parties, conclusion) et rédigée dans un vocabulaire disciplinaire exact.",
          levels: {
            '0': 'Réponse inintelligible ou non rédigée.',
            '0.25': "Insuffisant : aucune organisation, style télégraphique, vocabulaire absent.",
            '0.5': 'Fragile : organisation confuse, expression approximative.',
            '0.75': 'Satisfaisant : réponse organisée et claire, vocabulaire correct.',
            '1': 'Très satisfaisant : plan lisible, expression fluide, vocabulaire exact.',
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "La paraphrase se sanctionne sur le critere ANAL, pas une seconde fois sur EVID.",
        "Tu ne reproches pas a l'eleve un element absent du document tel qu'il est decrit dans la fiche sujet.",
      ],
      // Cette grille n'a ni KNOW ni EX : les erreurs de connaissances et
      // d'exemples se lisent sur le croisement document/connaissances.
      common_error_taxonomy: taxoPour(
        ['HG-DOC-01', 'HG-CITE-01', 'HG-CTX-01', 'HG-CRIT-01', 'HG-FACT-01', 'HG-CHRON-01', 'HG-VAGUE-01', 'HG-LANG-01', 'HG-TRANS-01'],
        { 'HG-FACT-01': 'ANAL', 'HG-CHRON-01': 'ANAL', 'HG-VAGUE-01': 'ANAL' },
      ),
    },
  },

  {
    id: 'HG_CROQUIS_V1',
    track: 'generale',
    exercise_type: 'hg_croquis',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de geographie au lycee. Tu corriges une production graphique : croquis ou schema d'organisation spatiale, accompagne de sa legende. " +
      "AVERTISSEMENT DETERMINANT : tu ne recois que le TEXTE transcrit de la copie, jamais l'image. Tu ne peux donc juger avec certitude que ce qui est ecrit : la legende, ses titres, ses categories, la nomenclature, le titre du croquis. " +
      "Tout ce qui releve du trace lui-meme (position exacte des figures, soin, lisibilite, hierarchisation visuelle) ne t'est pas accessible : tu ne l'inventes pas, tu le signales. " +
      "Tu mets systematiquement human_review_required a true et tu expliques dans le champ prevu que la note graphique doit etre confirmee par un professeur devant la copie. " +
      "Quand un critere ne peut pas etre evalue faute d'image, tu ne mets pas zero : tu attribues le niveau que la partie redigee permet d'etablir et tu le dis explicitement dans ta justification. " +
      "Tu appliques exclusivement la grille fournie et tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 10,
      principle:
        "Un croquis se juge sur une demonstration spatiale : les informations retenues sont hierarchisees, la legende est organisee en parties, le langage cartographique est correct et les localisations sont justes.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 criteres et leurs points du dossier Histoire-Geographie session 2027 (HG-CROQUIS) : SEL 3, LEG 2, LANGC 2, LOC 2, SOI 1. Le dossier source impose une relecture humaine quand l'image n'est pas observable : c'est repris dans le system_prompt et dans les garde-fous.",
      requires_human_review: true,
      criteria: [
        {
          code: 'SEL',
          name: 'Sélection et hiérarchisation',
          maximum_score: 3,
          description:
            "Choix des informations utiles au sujet et hiérarchie entre elles : ce qui structure l'espace doit ressortir davantage que le détail.",
          levels: {
            '0': 'Aucune sélection : rien de recevable.',
            '0.5': "Insuffisant : informations hors sujet, ou catalogue sans rapport avec la question posée.",
            '1': "Fragile : informations pertinentes mais juxtaposées, sans hiérarchie ni idée directrice.",
            '2': "Satisfaisant : les informations essentielles sont retenues et globalement hiérarchisées.",
            '3': "Très satisfaisant : sélection resserrée, hiérarchie explicite, le croquis démontre une idée sur l'organisation de l'espace.",
          },
        },
        {
          code: 'LEG',
          name: 'Légende organisée',
          maximum_score: 2,
          description:
            "Légende structurée en parties titrées qui répondent au sujet, chaque figuré étant nommé par ce qu'il signifie et non par sa forme.",
          levels: {
            '0': 'Aucune légende.',
            '0.25': 'Insuffisant : figurés listés en vrac, sans titre ni regroupement.',
            '0.75': "Fragile : légende regroupée mais titres descriptifs (« les villes », « les flux ») qui ne démontrent rien.",
            '1.25': "Satisfaisant : légende en parties titrées, cohérentes avec le sujet.",
            '2': "Très satisfaisant : les titres de parties forment à eux seuls la réponse au sujet.",
          },
        },
        {
          code: 'LANGC',
          name: 'Langage cartographique',
          maximum_score: 2,
          description:
            "Emploi correct des figurés ponctuels, linéaires et de surface, et des variables visuelles (taille, couleur) en cohérence avec la nature de l'information.",
          levels: {
            '0': 'Aucun langage cartographique repérable.',
            '0.25': 'Insuffisant : figurés incohérents avec la nature des informations représentées.',
            '0.75': "Fragile : figurés globalement admissibles mais variables visuelles arbitraires (couleurs sans logique, tailles non graduées).",
            '1.25': 'Satisfaisant : figurés adaptés et cohérents entre eux.',
            '2': "Très satisfaisant : langage cartographique maîtrisé, les variables visuelles traduisent la hiérarchie de l'information.",
          },
        },
        {
          code: 'LOC',
          name: 'Localisations et nomenclature',
          maximum_score: 2,
          description:
            "Exactitude des localisations et présence des noms attendus (États, villes, mers, axes) écrits correctement.",
          levels: {
            '0': 'Aucune localisation ni nomenclature.',
            '0.25': 'Insuffisant : localisations fausses, noms absents ou gravement erronés.',
            '0.75': 'Fragile : quelques repères justes, nomenclature très lacunaire.',
            '1.25': "Satisfaisant : localisations exactes pour l'essentiel, nomenclature présente.",
            '2': 'Très satisfaisant : localisations précises et nomenclature complète, orthographe respectée.',
          },
        },
        {
          code: 'SOI',
          name: 'Soin et lisibilité',
          maximum_score: 1,
          description:
            "Titre du croquis, orientation, propreté du tracé, lisibilité d'ensemble. Critère largement visuel : à confirmer par le professeur devant la copie.",
          levels: {
            '0': 'Production illisible ou absente.',
            '0.25': 'Insuffisant : ni titre ni organisation apparente.',
            '0.5': 'Fragile : titre présent mais tracé confus ou surchargé.',
            '0.75': 'Satisfaisant : croquis titré et lisible.',
            '1': 'Très satisfaisant : titre problématisé, tracé net, ensemble immédiatement lisible.',
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Le correcteur automatique ne voit PAS l'image : human_review_required vaut toujours true pour cet exercice.",
        "Un critere non observable faute d'image n'est jamais note zero par defaut : la limite est dite dans la justification.",
        "Tu ne decris jamais un figure, une couleur ou un trace qui ne serait pas mentionne par ecrit dans la transcription.",
      ],
      // Grille sans critere de problematisation ni d'exemples : le hors-sujet
      // et l'echelle se paient sur la selection des informations.
      common_error_taxonomy: taxoPour(
        ['HG-CROQ-01', 'HG-CROQ-02', 'HG-CROQ-03', 'HG-SCALE-01', 'HG-HS-01', 'HG-LANG-01', 'HG-TRANS-01'],
        { 'HG-HS-01': 'SEL', 'HG-SCALE-01': 'SEL', 'HG-LANG-01': 'LEG' },
      ),
    },
  },

  {
    id: 'HG_TECH_QUESTIONS_V1',
    track: 'technologique',
    exercise_type: 'hg_tech_questions',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert d'histoire-geographie pour la voie technologique. " +
      "Tu corriges une serie de questions de connaissances : reponses courtes, precises, appuyees sur des reperes et des notions du programme. " +
      "Tu n'attends NI dissertation NI plan : une reponse juste, complete et clairement formulee suffit a obtenir le maximum. " +
      "Tu evalues chaque question independamment puis tu synthetises sur les criteres de la grille. " +
      "Tu appliques exclusivement la grille fournie et tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu restes strictement neutre sur les questions politiques et memorielles. " +
      "Tu demandes une verification humaine si la transcription est incertaine ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 10,
      principle:
        "Des questions de connaissances se jugent sur l'exactitude et la completude des reponses, pas sur la longueur : un repere juste, une notion definie, une explication breve.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 4 criteres et leurs points du dossier Histoire-Geographie session 2027 (HG-TECH-Q) : REP 4, PREC 3, EXPL 2, LANG 1. Les descripteurs de niveau ont ete rediges par Les Matinees du Bac.",
      criteria: [
        {
          code: 'REP',
          name: 'Repères et notions',
          maximum_score: 4,
          description:
            "Connaissance des repères du programme (dates, acteurs, lieux) et des notions clés, avec définition juste quand elle est demandée.",
          levels: {
            '0': 'Aucun repère ni notion recevable.',
            '0.5': 'Insuffisant : repères faux ou anachroniques, notions confondues.',
            '1.5': 'Fragile : quelques repères exacts, la plupart approximatifs ou absents.',
            '2.5': 'Satisfaisant : les repères et notions attendus sont présents et exacts, malgré des oublis.',
            '4': "Très satisfaisant : repères et notions maîtrisés, datés et situés, définitions exactes.",
          },
        },
        {
          code: 'PREC',
          name: 'Précision des réponses',
          maximum_score: 3,
          description:
            "Chaque question reçoit une réponse complète, qui traite exactement ce qui est demandé, sans hors-sujet ni réponse partielle.",
          levels: {
            '0': 'Aucune réponse exploitable.',
            '0.5': 'Insuffisant : questions non traitées ou réponses à côté de la consigne.',
            '1': 'Fragile : réponses amorcées mais incomplètes, consignes partiellement lues.',
            '2': 'Satisfaisant : la majorité des questions reçoit une réponse complète et conforme à la consigne.',
            '3': 'Très satisfaisant : toutes les questions sont traitées, exactement dans les termes demandés.',
          },
        },
        {
          code: 'EXPL',
          name: 'Explication',
          maximum_score: 2,
          description:
            "Capacité à expliquer et non seulement à énoncer : une cause, un mécanisme ou un exemple vient soutenir la réponse quand la question le demande.",
          levels: {
            '0': 'Aucune explication.',
            '0.25': "Insuffisant : réponses par mots isolés, aucune explication même lorsqu'elle est demandée.",
            '0.75': 'Fragile : explications amorcées mais vagues ou hors sujet.',
            '1.25': 'Satisfaisant : explications correctes, appuyées sur un exemple ou une cause.',
            '2': 'Très satisfaisant : explications précises et complètes, mécanismes correctement enchaînés.',
          },
        },
        {
          code: 'LANG',
          name: 'Expression',
          maximum_score: 1,
          description:
            "Réponses rédigées en phrases compréhensibles, vocabulaire disciplinaire employé correctement.",
          levels: {
            '0': 'Expression inintelligible.',
            '0.25': 'Insuffisant : réponses non rédigées, vocabulaire disciplinaire absent.',
            '0.5': 'Fragile : phrases maladroites, notions employées les unes pour les autres.',
            '0.75': 'Satisfaisant : réponses rédigées et claires, vocabulaire correct.',
            '1': 'Très satisfaisant : expression nette et vocabulaire exact.',
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Tu n'exiges ni introduction, ni plan, ni conclusion : ce n'est pas l'exercice.",
        "Une reponse juste et breve vaut le maximum : la longueur n'est jamais un critere.",
      ],
      common_error_taxonomy: taxoPour(
        ['HG-FACT-01', 'HG-CHRON-01', 'HG-HS-01', 'HG-VAGUE-01', 'HG-LANG-01', 'HG-TRANS-01'],
        { 'HG-FACT-01': 'REP', 'HG-CHRON-01': 'REP', 'HG-HS-01': 'PREC', 'HG-VAGUE-01': 'EXPL' },
      ),
    },
  },
];

// ---------------------------------------------------------------------
//  2) LES 5 SUJETS (03_BANQUE_SUJETS/subject_bank_session_2027.json)
//     card_json.exercise + card_json.work composent le libelle du menu
//     de depot cote CRM (libelleSujet dans src/lib/pipeline.ts).
// ---------------------------------------------------------------------
const AVERTISSEMENT_SUJET =
  "Gabarit synthetique d'entrainement au format de l'epreuve, pas un sujet officiel ni une annale reproduite.";

export const subject_cards = [
  {
    id: 'HG2027_QP_01',
    track: 'generale',
    exercise_type: 'hg_question_problematisee',
    work_id: 'HGT_H1_CRISE_1929',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'HG-EP-GEN-MODEL-01',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Question problématisée',
      work: 'Comment la crise de 1929 fragilise-t-elle les sociétés et les régimes politiques ?',
      field: 'Histoire · Terminale · Thème 1',
      level: 'terminale',
      theme_id: 'HGT-H1',
      theme_title: 'Fragilités des démocraties, totalitarismes et Seconde Guerre mondiale (1929-1945)',
      prompt: 'Comment la crise de 1929 fragilise-t-elle les sociétés et les régimes politiques ?',
      document_requirements: 'aucun document ; réponse rédigée à partir des connaissances',
      expected_concepts: ['krach', 'dépression', 'déflation', 'chômage de masse', 'New Deal', 'fragilisation démocratique', 'montée des extrêmes'],
      expected_mechanisms: [
        "Le krach d'octobre 1929 se propage par le crédit et le commerce mondial : la crise financière américaine devient une dépression économique mondiale.",
        "La contraction de la production et le chômage de masse déclassent les classes moyennes et ouvrières : la crise sociale précède la crise politique.",
        "Les réponses divergent : interventionnisme du New Deal aux États-Unis, austérité puis Front populaire en France, économie de guerre en Allemagne.",
        "L'incapacité perçue des régimes parlementaires à répondre nourrit la contestation antidémocratique et l'audience des mouvements autoritaires.",
      ],
      traps: [
        'raconter un récit uniquement américain, sans mondialisation de la crise',
        'juxtaposer des faits sans jamais établir de causalité',
        'confondre la crise de 1929 et la totalité des années 1930',
        'oublier la dimension sociale au profit de la seule économie',
      ],
      special_criteria: [
        'la causalité économique → sociale → politique doit être explicite',
        'au moins deux pays différents attendus',
        'les bornes chronologiques doivent être tenues',
      ],
      sources: ['SRC_BO_PROGRAMME_TERMINALE_HG', 'SRC_NOTE_SERVICE_EPREUVE_HG'],
      teacher_validation_required: true,
    },
  },
  {
    id: 'HG2027_QP_02',
    track: 'generale',
    exercise_type: 'hg_question_problematisee',
    work_id: 'HGT_G1_MERS_OCEANS',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'HG-EP-GEN-MODEL-02',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Question problématisée',
      work: 'Pourquoi les mers et océans sont-ils au cœur de la mondialisation ?',
      field: 'Géographie · Terminale · Thème 1',
      level: 'terminale',
      theme_id: 'HGT-G1',
      theme_title: 'Mers et océans : au cœur de la mondialisation',
      prompt: 'Pourquoi les mers et océans sont-ils au cœur de la mondialisation ?',
      document_requirements: 'aucun document ; réponse rédigée à partir des connaissances',
      expected_concepts: ['routes maritimes', 'façades maritimes', 'hub portuaire', 'conteneurisation', 'ZEE', 'ressources halieutiques et énergétiques', 'câbles sous-marins', 'tensions et piraterie'],
      expected_mechanisms: [
        "La conteneurisation et la massification des navires font des mers le support de l'essentiel du commerce mondial de marchandises.",
        "Les routes maritimes se concentrent sur des passages stratégiques (Malacca, Suez, Ormuz, Panama) dont la vulnérabilité est un enjeu de sécurité.",
        "Les mers sont aussi un espace de ressources et un espace approprié : la ZEE issue de la convention de Montego Bay crée des revendications territoriales.",
        "L'appropriation entre en tension avec la liberté de circulation et avec la protection des milieux : la mer est un espace disputé autant qu'un vecteur.",
      ],
      traps: [
        'produire un catalogue de ports sans hiérarchisation',
        'oublier les acteurs (États, armateurs, organisations internationales)',
        "traiter la seule dimension commerciale en oubliant ressources et tensions",
      ],
      special_criteria: [
        "le mot « au cœur » doit être discuté, pas seulement affirmé",
        "au moins deux échelles attendues (mondiale et régionale)",
        'des exemples localisés précis sont exigés',
      ],
      sources: ['SRC_BO_PROGRAMME_TERMINALE_HG', 'SRC_NOTE_SERVICE_EPREUVE_HG'],
      teacher_validation_required: true,
    },
  },
  {
    id: 'HG2027_QP_03',
    track: 'generale',
    exercise_type: 'hg_question_problematisee',
    work_id: 'HG1_G1_METROPOLISATION',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'HG-EP-GEN-MODEL-05',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Question problématisée',
      work: 'La métropolisation renforce-t-elle les inégalités entre les territoires ?',
      field: 'Géographie · Première · Thème 1',
      level: 'première',
      theme_id: 'HG1-G1',
      theme_title: 'La métropolisation : un processus mondial différencié',
      prompt: 'La métropolisation renforce-t-elle les inégalités entre les territoires ?',
      document_requirements: 'aucun document ; réponse rédigée à partir des connaissances',
      expected_concepts: ['métropole', 'métropolisation', 'fonctions de commandement', 'hiérarchie urbaine', 'attractivité', 'fragmentation socio-spatiale', 'périurbanisation', 'villes en marge'],
      expected_mechanisms: [
        "La métropolisation concentre populations, richesses et fonctions de commandement dans un nombre restreint de villes : la hiérarchie urbaine se creuse.",
        "À l'échelle mondiale, les métropoles sont reliées entre elles plus qu'à leur arrière-pays, ce qui marginalise certains territoires.",
        "À l'intérieur même des métropoles, la fragmentation socio-spatiale oppose quartiers d'affaires, quartiers gentrifiés et espaces relégués.",
        "La métropolisation produit aussi des effets d'entraînement (emplois, équipements, desserte) : l'inégalité n'est pas mécanique et se discute.",
      ],
      traps: [
        'confondre urbanisation et métropolisation',
        "ne traiter qu'une seule échelle",
        "répondre par oui sans jamais examiner les effets positifs ou les nuances",
      ],
      special_criteria: [
        'le raisonnement multi-scalaire est explicitement attendu',
        'des exemples pris hors de France sont attendus',
        "le verbe « renforce-t-elle » appelle une réponse nuancée, pas un exposé",
      ],
      sources: ['SRC_BO_PROGRAMME_PREMIERE_HG', 'SRC_NOTE_SERVICE_EPREUVE_HG'],
      teacher_validation_required: true,
    },
  },
  {
    id: 'HG2027_DOC_01',
    track: 'generale',
    exercise_type: 'hg_analyse_document',
    work_id: 'HG1_H4_MOBILISATION_1914',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'HG-EP-GEN-MODEL-03',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Analyse de document(s)',
      work: 'La mobilisation des sociétés pendant la Première Guerre mondiale',
      field: 'Histoire · Première · Thème 4',
      level: 'première',
      theme_id: 'HG1-H4',
      theme_title: 'La Première Guerre mondiale : le « suicide de l’Europe » et la fin des empires européens',
      prompt:
        "Analysez le ou les documents proposés afin de montrer comment les sociétés européennes sont mobilisées pendant la Première Guerre mondiale, et indiquez les limites de ce ou ces documents.",
      document_requirements:
        "deux documents, décrits ci-dessous : le correcteur sait exactement ce que l'élève avait sous les yeux et ne lui reproche jamais un élément qui n'y figure pas.",
      // Documents SYNTHÉTIQUES, écrits pour l'entraînement : aucune archive
      // n'est reproduite et aucune phrase n'est attribuée à une personne
      // réelle. Sans eux, le correcteur note une analyse de document sans
      // savoir ce que l'élève analysait.
      documents: [
        {
          ref: 'Document 1',
          nature:
            "Affiche officielle de souscription à un emprunt national, France, 1917. Document SYNTHÉTIQUE rédigé pour l'entraînement, dans le style des affiches de propagande de l'époque : ce n'est ni une archive ni une reproduction.",
          contenu:
            "L'affiche est commandée par le ministère des Finances et destinée au grand public de l'arrière. Elle représente une famille — une femme à l'atelier, deux enfants, un homme en uniforme au second plan — sous le mot d'ordre « Pour eux, souscrivez ». Le texte affirme que chaque franc prêté à l'État arme le soldat, que l'usine est un front comme un autre, et que la victoire dépend autant de l'atelier que de la tranchée. Un encadré rappelle que la souscription est ouverte dans tous les bureaux de poste. L'affiche ne mentionne ni les pertes humaines, ni la durée du conflit, ni les difficultés de ravitaillement.",
        },
        {
          ref: 'Document 2',
          nature:
            "Extrait d'une lettre d'un ouvrier d'usine d'armement à son frère mobilisé, mars 1917. Document SYNTHÉTIQUE écrit pour l'entraînement : aucune correspondance réelle n'est reproduite et aucun auteur réel n'est cité.",
          contenu:
            "L'auteur décrit des journées de onze heures dans une usine où travaillent désormais beaucoup de femmes et d'ouvriers venus des colonies. Il dit la fierté de « faire sa part », mais aussi la fatigue, la cherté du pain et l'inquiétude devant les files d'attente. Il rapporte que des camarades parlent de cesser le travail si les salaires ne suivent pas les prix, et il demande à son frère si, au front, « on croit encore que cela finira cette année ». La lettre est manuscrite, adressée à un particulier, et porte la mention d'un contrôle postal.",
        },
      ],
      croisement_attendu:
        "Le document 1 est un discours officiel qui construit le consentement ; le document 2 montre par en dessous ce que la mobilisation coûte. Les confronter, c'est distinguer ce que l'État veut faire croire et ce que la société éprouve — et fonder la critique sur la nature même des deux sources (affiche publique commanditée / lettre privée soumise au contrôle postal).",
      expected_concepts: ['guerre totale', "mobilisation de l'arrière", 'économie de guerre', 'propagande', 'consentement et contrainte', 'violences de guerre', 'nature et portée de la source'],
      expected_mechanisms: [
        "La guerre totale mobilise l'ensemble des ressources : hommes au front, femmes et ouvriers à l'usine, emprunts et rationnement à l'arrière.",
        "La propagande d'État et le « bourrage de crâne » entretiennent le consentement, ce qui oblige à interroger le statut de toute source produite pendant le conflit.",
        "La mobilisation a des limites : mutineries de 1917, grèves, lassitude — un document officiel ne les montre généralement pas.",
        "Situer la source (auteur, date, destinataire, intention) conditionne ce qu'elle permet d'établir.",
      ],
      traps: [
        'paraphraser les documents au lieu de les expliquer',
        'oublier de contextualiser (date, auteur, destinataire)',
        'énoncer une critique de pure forme (« ce document est subjectif ») sans conséquence',
        'plaquer du cours sans jamais revenir aux documents',
        "traiter les deux documents l'un après l'autre sans jamais les confronter",
      ],
      special_criteria: [
        "au moins une citation courte et exacte par idée développée",
        "la portée ET les limites du document doivent être formulées",
        "l'intention de l'auteur doit être reliée à ce que le document montre",
      ],
      sources: ['SRC_BO_PROGRAMME_PREMIERE_HG', 'SRC_NOTE_SERVICE_EPREUVE_HG'],
      teacher_validation_required: true,
    },
  },
  {
    id: 'HG2027_CROQUIS_01',
    track: 'generale',
    exercise_type: 'hg_croquis',
    work_id: 'HGT_G3_UNION_EUROPEENNE',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'HG-EP-GEN-MODEL-04',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Croquis',
      work: "L'Union européenne : intégrations, disparités et ouverture au monde",
      field: 'Géographie · Terminale · Thème 3',
      level: 'terminale',
      theme_id: 'HGT-G3',
      theme_title: "L'Union européenne dans la mondialisation : des dynamiques complexes",
      prompt:
        "Réalisez un croquis, accompagné de sa légende organisée, rendant compte des intégrations, des disparités et de l'ouverture au monde de l'Union européenne.",
      document_requirements:
        "aucun document fourni à l'élève ; c'est lui qui PRODUIT le croquis. Le pipeline ne reçoit que le texte transcrit (titre, légende, nomenclature) : le tracé n'est pas observable. La correction automatique est une aide, jamais une note définitive — relecture professeur obligatoire.",
      expected_concepts: ['mégalopole européenne', 'centre et périphéries', 'axes de transport majeurs', 'interfaces maritimes', 'élargissements successifs', 'disparités de richesse', 'politique de cohésion', 'ouverture aux échanges mondiaux'],
      expected_mechanisms: [
        "Le cœur économique (dorsale de Londres à l'Italie du Nord) concentre richesse, population et fonctions de commandement.",
        "Les périphéries se différencient : périphéries intégrées (Scandinavie, Irlande), périphéries en rattrapage (Europe centrale et orientale), marges méditerranéennes.",
        "Les axes de transport et les grands ports (Rotterdam, Anvers, Hambourg) organisent l'ouverture de l'UE sur le monde.",
        "Les élargissements et la politique de cohésion structurent les disparités internes autant qu'ils tentent de les réduire.",
      ],
      traps: [
        'figurés non hiérarchisés, tous de même poids visuel',
        "absence de titre ou titre purement descriptif",
        'légende en liste sans parties titrées',
        "oublier l'ouverture au monde et ne traiter que l'intérieur de l'UE",
      ],
      special_criteria: [
        'la légende doit être organisée en parties titrées qui répondent au sujet',
        'les trois entrées du sujet (intégrations, disparités, ouverture) doivent apparaître',
        "correction automatique partielle : le tracé n'est pas visible, relecture humaine obligatoire",
      ],
      sources: ['SRC_BO_PROGRAMME_TERMINALE_HG', 'SRC_NOTE_SERVICE_EPREUVE_HG'],
      teacher_validation_required: true,
    },
  },

  // -------------------------------------------------------------------
  //  VOIE TECHNOLOGIQUE
  //
  //  ATTENTION : le dossier source ne fournit AUCUN sujet pour la voie
  //  technologique — seulement sa grille (HG-TECH-Q). Les deux fiches
  //  ci-dessous ont donc ete ecrites ici, sur les themes du programme
  //  d'histoire-geographie de terminale technologique. Un professeur de la
  //  voie technologique doit confirmer que les themes, les questions et le
  //  niveau d'exigence correspondent bien a ce qu'il attend : c'est la
  //  partie la moins etayee de toute la matiere.
  // -------------------------------------------------------------------
  {
    id: 'HG2027_TECHQ_01',
    track: 'technologique',
    exercise_type: 'hg_tech_questions',
    work_id: 'HGT_TECH_TOTALITARISMES',
    status: 'draft',
    card_json: {
      session,
      source_package_id: null,
      source_status: 'synthetic_training_template_not_official_exam',
      warning:
        "Gabarit synthetique d'entrainement. Le dossier source ne contenait aucun sujet pour la voie technologique : themes et questions ecrits par Les Matinees du Bac, a confirmer par un professeur de la voie technologique.",
      exercise: 'Questions de connaissances',
      work: 'Totalitarismes et Seconde Guerre mondiale',
      field: 'Histoire · Terminale technologique · Thème 1',
      level: 'terminale',
      voie: 'technologique',
      theme_id: 'HGT-TECH-H1',
      theme_title: 'Totalitarismes et Seconde Guerre mondiale (1929-1945)',
      prompt:
        "Répondez aux cinq questions suivantes. Chaque réponse doit être rédigée, complète et précise ; la longueur n'est pas un critère.\n" +
        "1. Datez le krach boursier de Wall Street et expliquez en quoi il déclenche une crise mondiale.\n" +
        "2. Citez deux caractéristiques communes aux régimes totalitaires des années 1930.\n" +
        "3. Qu'appelle-t-on la « guerre d'anéantissement » ? Donnez un exemple précis.\n" +
        "4. Datez le régime de Vichy et indiquez deux de ses choix politiques majeurs.\n" +
        "5. Expliquez ce que désigne le génocide des Juifs et des Tsiganes, et situez-le dans le temps.",
      document_requirements: 'aucun document ; réponses rédigées à partir des connaissances',
      expected_concepts: [
        'krach de 1929',
        'crise économique mondiale',
        'régime totalitaire',
        'parti unique',
        'culte du chef',
        'terreur de masse',
        'guerre d’anéantissement',
        'régime de Vichy',
        'collaboration',
        'génocide',
      ],
      expected_mechanisms: [
        "Le krach d'octobre 1929 se propage par le crédit et le commerce : la crise financière américaine devient une dépression mondiale.",
        "Les régimes totalitaires partagent un parti unique, un chef incontesté, une idéologie officielle, l'encadrement de la société et la terreur.",
        "La Seconde Guerre mondiale est une guerre d'anéantissement : elle vise les populations civiles autant que les armées.",
        "Le régime de Vichy (1940-1944) met fin à la République, engage la collaboration d'État et participe à la persécution des Juifs.",
      ],
      traps: [
        'répondre par des mots isolés au lieu de phrases',
        'confondre les régimes totalitaires entre eux',
        'donner une date approximative quand la question demande une date précise',
        'oublier l’exemple quand la question en demande un',
      ],
      special_criteria: [
        'chaque question doit recevoir une réponse : une question sautée coûte des points sur la précision',
        'les dates et les noms exacts sont attendus',
        'une réponse juste et brève vaut le maximum',
      ],
      sources: ['SRC_BO_PROGRAMME_TERMINALE_TECHNO_HG'],
      teacher_validation_required: true,
    },
  },
  {
    id: 'HG2027_TECHQ_02',
    track: 'technologique',
    exercise_type: 'hg_tech_questions',
    work_id: 'HGT_TECH_MERS_OCEANS',
    status: 'draft',
    card_json: {
      session,
      source_package_id: null,
      source_status: 'synthetic_training_template_not_official_exam',
      warning:
        "Gabarit synthetique d'entrainement. Le dossier source ne contenait aucun sujet pour la voie technologique : themes et questions ecrits par Les Matinees du Bac, a confirmer par un professeur de la voie technologique.",
      exercise: 'Questions de connaissances',
      work: 'Mers et océans, vecteurs de la mondialisation',
      field: 'Géographie · Terminale technologique · Thème 1',
      level: 'terminale',
      voie: 'technologique',
      theme_id: 'HGT-TECH-G1',
      theme_title: 'Mers et océans : vecteurs essentiels de la mondialisation',
      prompt:
        "Répondez aux cinq questions suivantes. Chaque réponse doit être rédigée, complète et précise ; la longueur n'est pas un critère.\n" +
        "1. Qu'est-ce qu'un conteneur, et pourquoi a-t-il transformé le commerce maritime ?\n" +
        "2. Citez deux passages stratégiques du commerce maritime mondial et localisez-les.\n" +
        "3. Qu'appelle-t-on une ZEE ? Que permet-elle à l'État qui la détient ?\n" +
        "4. Donnez deux ressources exploitées en mer et un risque que cette exploitation fait peser.\n" +
        "5. Citez un exemple de tension entre États au sujet d'un espace maritime, et expliquez son enjeu.",
      document_requirements: 'aucun document ; réponses rédigées à partir des connaissances',
      expected_concepts: [
        'conteneurisation',
        'route maritime',
        'passage stratégique',
        'hub portuaire',
        'ZEE',
        'ressources halieutiques',
        'hydrocarbures offshore',
        'surpêche',
        'pollution marine',
        'tensions territoriales',
      ],
      expected_mechanisms: [
        "Le conteneur standardise le transport, fait chuter son coût et rend possible la fragmentation mondiale de la production.",
        "Les passages stratégiques (Malacca, Suez, Ormuz, Panama, Gibraltar) concentrent les flux et sont donc des points de vulnérabilité.",
        "La ZEE, issue de la convention de Montego Bay, donne à l'État côtier l'exploitation exclusive des ressources jusqu'à 200 milles marins.",
        "L'exploitation des ressources marines nourrit à la fois des économies et des conflits d'usage, et pèse sur les milieux.",
      ],
      traps: [
        'répondre par des mots isolés au lieu de phrases',
        'citer un passage stratégique sans le localiser',
        'confondre ZEE et eaux territoriales',
        'donner une tension sans en expliquer l’enjeu',
      ],
      special_criteria: [
        'les localisations doivent être précisées quand la question les demande',
        'les notions employées doivent être définies, pas seulement citées',
        'une réponse juste et brève vaut le maximum',
      ],
      sources: ['SRC_BO_PROGRAMME_TERMINALE_TECHNO_HG'],
      teacher_validation_required: true,
    },
  },
];

// ---------------------------------------------------------------------
//  3) LES ETALONS
//     Cinq profils par sujet, un par bande de notes du dossier source
//     (0-4, 5-8, 9-12, 13-16, 17-20). score est normalise sur 20 comme
//     dans les autres matieres ; card_json.criterion_scores est a
//     l'echelle de la grille (sur 10) et sa somme vaut score / 2.
// ---------------------------------------------------------------------
const BANDES = [
  {
    suffixe: 'N03', score: 3, role: 'niveau_03_tres_insuffisant',
    profil: 'production très insuffisante, blanche ou hors sujet',
    forces: "Quelques mots du sujet sont repris, sans qu'aucune démarche ne s'installe.",
    limites: "Aucune réponse démontrée : le sujet n'est pas compris, les connaissances sont absentes ou fausses.",
  },
  {
    suffixe: 'N07', score: 7, role: 'niveau_07_insuffisant',
    profil: 'compréhension fragmentaire',
    forces: 'Quelques repères exacts affleurent.',
    limites: "Erreurs majeures, organisation absente, aucun exemple exploité : la réponse reste à l'état d'ébauche.",
  },
  {
    suffixe: 'N11', score: 11, role: 'niveau_11_moyen',
    profil: 'acquis partiels, démarche visible mais instable',
    forces: 'Des éléments pertinents sont mobilisés et une intention de plan apparaît.',
    limites: "Connaissances inégales, exemples cités mais peu exploités, organisation incomplète.",
  },
  {
    suffixe: 'N14', score: 14, role: 'niveau_14_bon',
    profil: 'bonne maîtrise avec lacunes localisées',
    forces: 'Méthode solide, notions essentielles maîtrisées, exemples exacts.',
    limites: "Une justification, une nuance ou un changement d'échelle manque encore.",
  },
  {
    suffixe: 'N18', score: 18, role: 'niveau_18_tres_bon',
    profil: 'réponse très maîtrisée, complète, justifiée et vérifiée',
    forces: 'Démarche explicite, preuves ciblées, démonstration menée jusqu’à la conclusion.',
    limites: '',
  },
];

// Erreurs typiques par bande et par exercice : ce que le correcteur doit
// s'attendre a voir a ce niveau-la.
const ERREURS_PAR_EXERCICE = {
  hg_question_problematisee: {
    3: ['HG-HS-01', 'HG-FACT-01', 'HG-VAGUE-01'],
    7: ['HG-CHRON-01', 'HG-VAGUE-01', 'HG-PLAN-01'],
    11: ['HG-VAGUE-01', 'HG-CAT-01'],
    14: ['HG-SCALE-01'],
    18: [],
  },
  hg_analyse_document: {
    3: ['HG-DOC-01', 'HG-CTX-01', 'HG-CRIT-01'],
    7: ['HG-DOC-01', 'HG-CITE-01', 'HG-CRIT-01'],
    11: ['HG-CITE-01', 'HG-CRIT-01'],
    14: ['HG-CRIT-01'],
    18: [],
  },
  hg_croquis: {
    3: ['HG-CROQ-01', 'HG-CROQ-02', 'HG-CROQ-03'],
    7: ['HG-CROQ-01', 'HG-CROQ-03'],
    11: ['HG-CROQ-01', 'HG-SCALE-01'],
    14: ['HG-CROQ-02'],
    18: [],
  },
  hg_tech_questions: {
    3: ['HG-HS-01', 'HG-FACT-01'],
    7: ['HG-FACT-01', 'HG-VAGUE-01'],
    11: ['HG-VAGUE-01'],
    14: ['HG-LANG-01'],
    18: [],
  },
};

/**
 * Repartit une note sur 10 entre les criteres, proportionnellement a leur
 * maximum, arrondie au quart de point. Le reste d'arrondi va sur le critere
 * le plus lourd pour que la somme tombe EXACTEMENT juste : le moteur de
 * correction compare note_finale a la somme des criteres et signale tout ecart.
 */
function repartir(criteria, noteSur10) {
  const total = criteria.reduce((s, c) => s + c.maximum_score, 0);
  const parts = criteria.map((c) => ({
    code: c.code,
    max: c.maximum_score,
    valeur: Math.round((noteSur10 * c.maximum_score) / total * 4) / 4,
  }));
  const ecart = Math.round((noteSur10 - parts.reduce((s, p) => s + p.valeur, 0)) * 100) / 100;
  if (ecart !== 0) {
    const cible = [...parts].sort((a, b) => b.max - a.max)[0];
    cible.valeur = Math.min(cible.max, Math.max(0, Math.round((cible.valeur + ecart) * 100) / 100));
  }
  return Object.fromEntries(parts.map((p) => [p.code, p.valeur]));
}

export const benchmark_cards = subject_cards.flatMap((sujet) => {
  const grille = rubrics.find((r) => r.exercise_type === sujet.exercise_type);
  return BANDES.map((bande) => {
    const codes = ERREURS_PAR_EXERCICE[sujet.exercise_type][bande.score] ?? [];
    return {
      id: `${sujet.id}_${bande.suffixe}`,
      track: sujet.track,
      exercise_type: sujet.exercise_type,
      subject_id: sujet.id,
      score: bande.score,
      error_codes: codes,
      validation_status: 'candidate',
      card_json: {
        annee: String(session),
        support: sujet.card_json.work,
        theme_id: sujet.card_json.theme_id,
        theme_title: sujet.card_json.theme_title,
        profil: bande.profil,
        forces: bande.forces,
        limites: bande.limites || 'Rien de substantiel à reprendre à ce niveau.',
        erreurs_observees: codes,
        same_subject: true,
        benchmark_role: bande.role,
        origin: 'synthetic_calibration_profile',
        origin_warning:
          "Profil synthetique de calibration : le dossier source n'a identifie AUCUNE copie reelle d'eleve juridiquement reutilisable. A remplacer ou confirmer par des copies authentiques anonymisees et notees.",
        normalised_score_on_20: bande.score,
        criterion_scores: repartir(grille.rubric_json.criteria, bande.score / 2),
        criterion_scale: 'sur 10, echelle de la grille',
      },
    };
  });
});

// ---------------------------------------------------------------------
//  4) LES GABARITS DE DOSSIER ELEVE
//     Meme charpente que HGGSP / HLP (8 sections + note en fourchette),
//     vocabulaire adapte a l'histoire-geographie et bareme sur 10.
// ---------------------------------------------------------------------
const FOURCHETTE = `
LA NOTE S'AFFICHE EN FOURCHETTE, JAMAIS EN NOTE SÈCHE. Règle de calcul, à appliquer telle quelle :
- demi-largeur = 5 % du barème total, arrondie au demi-point (sur un barème de 10, cela fait 0,5 point).
- si correction.human_review_required vaut true, tu DOUBLES cette demi-largeur : une correction incertaine s'annonce plus large.
- borne basse = note_finale − demi-largeur, borne haute = note_finale + demi-largeur, chacune arrondie au demi-point et ramenée dans l'intervalle [0 ; barème total].
- Exemple sur 10 : note_finale = 6,5 → fourchette « 6 – 7 ».
Où elle apparaît :
- BADGE de couverture : <div class="n">6 – 7</div><div class="d">/ 10</div> (les deux bornes, jamais la note exacte).
- cover-note, juste dessous : "Estimation issue d'une correction automatique — ton professeur peut situer ta copie à l'intérieur de cette fourchette." Si human_review_required vaut true, ajoute " Cette copie demande une relecture : la fourchette est volontairement large."
- Ligne TOTAL du tableau de barème : la fourchette, pas la somme. Les lignes de critères, elles, gardent leur score exact : c'est ce qui permet à l'élève de voir où il perd des points.
- Partout ailleurs dans le dossier (appréciation, plan de progression, projection), tu parles de la fourchette ou d'un objectif, jamais d'une note exacte. Le titre de la section 5 devient "DE {borne basse}–{borne haute} À {cible}/10".
Tu n'écris nulle part la valeur exacte de note_finale.

RAPPEL D'ÉCHELLE : cette épreuve est notée SUR 10. Tu écris « / 10 » partout, jamais « / 20 ». Si tu mentionnes une projection au bac, précise que l'épreuve complète additionne deux exercices de 10 points.

BUDGET DE LONGUEUR — contrainte technique, pas stylistique : le dossier complet doit tenir sous 24 000 caractères de HTML. Le générateur est coupé au-delà et l'élève ne reçoit alors RIEN — un dossier dense et court vaut infiniment mieux qu'un dossier complet jamais livré. Tu tiens ce budget en restant au bas des fourchettes quand la copie ne justifie pas plus : 3 erreurs pénalisantes plutôt que 5 si la copie n'en porte que 3, 4 chantiers de progression plutôt que 6, deux paragraphes d'appréciation et pas trois. Tu ne rallonges jamais une section pour la remplir, et tu ne répètes pas d'une section à l'autre ce qui a déjà été dit.`;

const REGLES_HG = `
RÈGLES HISTOIRE-GÉOGRAPHIE NON NÉGOCIABLES :
- Tu n'inventes JAMAIS un fait, une date, un acteur, un lieu ou un exemple qui ne figure pas dans la copie, le sujet ou la correction. C'est la règle la plus importante de cette matière.
- Tu ne recorriges pas : tous les scores viennent de correction.criteria, sans exception.
- Toute citation de l'élève vient de la transcription. Si la transcription manque, tu décris sans citer.
- Tu restes strictement neutre sur les questions politiques et mémorielles : tu commentes la démonstration, jamais l'opinion de l'élève. Si la copie prend parti, tu montres comment transformer une opinion en analyse argumentée, sans dire si elle a raison.
- Tu tutoies l'élève. Ton exigeant et bienveillant, jamais de flatterie, jamais de reproche sans la correction à appliquer.
- Ne produis rien d'autre que le corps HTML.`;

const enTeteDossier = (titre, sousTitre) => `
Tu rédiges le dossier HTML de correction d'un élève de lycée en histoire-géographie (tronc commun), après ${titre}.

STRUCTURE (dans <div class="page"> … <div class="wrap"> … </div></div>) :

COUVERTURE :
- cover-band : <h1>DOSSIER DE CORRECTION</h1><div class="sub">HISTOIRE-GÉOGRAPHIE · ${sousTitre}</div>
- cover-id : name = identite.eleve ; work = sujet.work ; work-meta = sujet.field + " · Bac blanc" ; badge = fourchette de note, "/ 10" ; cover-note = voir la règle de fourchette plus bas.
- .wrap : rappelle d'abord le sujet dans une .box cream (lab "Sujet") = sujet.prompt. Puis table.bareme, une ligne par correction.criteria[] avec le nom complet du critère, + TOTAL. Puis .cap de contexte.

SECTION 1 — NOTE DÉTAILLÉE & APPRÉCIATION
- h3.sub "Niveau par critère" : table.radar, une ligne par critère. Colonne /10 = round(score/maximum*10,1) ; barre width = score/maximum*100 % ; colonne Observation = le NIVEAU ATTEINT parmi Très satisfaisant / Satisfaisant / Fragile / Insuffisant, suivi de six à douze mots de justification.
- h3.sub "Appréciation du correcteur" : correction.appreciation_generale développée en 2 paragraphes .just suivant cet ordre — qualité générale, ce qui fonctionne, le principal frein à une note plus haute, le potentiel réel. Finir par une phrase en gras fixant un objectif chiffré pour la prochaine copie.`;

const sectionsCommunes = (memo) => `
SECTION 3 — CE QUI FAIT BAISSER LA NOTE · CE QUE TU MAÎTRISES
- h3.sub "Erreurs pénalisantes" : 3 à 5 .err construits sur correction.detected_errors, classés par impact décroissant sur la note. Chaque .err dit : ce qui pose problème · pourquoi cela coûte des points · "Comment corriger :" en gras · un exemple modèle rédigé.
- h3.sub "Connaissances et repères manquants" : une .box cream (lab "À ajouter") comparant sujet.expected_concepts et sujet.expected_mechanisms à ce que la copie mobilise réellement ; chaque manque avec sa définition juste en une phrase, sa date ou sa localisation quand elle existe, et l'endroit du devoir où il aurait servi.
- h3.sub "Ce que tu maîtrises déjà" : un .good par correction.points_forts, avec le passage exact qui le prouve et ce qu'un correcteur officiel y valoriserait.

SECTION 5 — PLAN DE PROGRESSION
- Un .prio numéroté par correction.priorites_amelioration (4 à 6 chantiers), format "Problème :" / "Action :". Chaque action doit être applicable dès la prochaine copie ; "apprends ton cours" et "sois plus précis" sont interdits.

SECTION 6 — EXERCICES CIBLÉS
- 2 tables "Exercice N · titre", chacune ciblant UNE faiblesse réellement observée. Lignes Objectif / Consigne / Réussite. La consigne doit être exécutable en 15 minutes sans document supplémentaire.

SECTION 7 — PROJECTION BAC
- table "Correction apportée" / "Gain estimé" (+0,25 à +1 point sur 10, cohérent avec les points réellement perdus au barème) puis <tr class="total"> "Note estimée après corrections" / fourchette au-dessus de la note actuelle, plafonnée à 10. Puis .cap précisant que la projection suppose le même niveau de connaissances.

SECTION 8 — FICHE MÉMO — RÉFLEXES HISTOIRE-GÉO
- Ouvre <div class="sec memo"> et commence OBLIGATOIREMENT par l'en-tête numéroté, comme les sections précédentes : <div class="sec-h"><div class="num">8</div><div class="ttl">FICHE MÉMO — RÉFLEXES HISTOIRE-GÉO</div></div>. Les huit sections doivent toutes porter leur numéro.
- "MES RÉFLEXES DE MÉTHODE" (mh) + mb ul de 3 li tirés des erreurs réelles de la copie, chacun avec un exemple modèle rédigé.
${memo}
- .kicker de fin, motivant et chiffré.

Termine par .foot : "Dossier de correction — {eleve} · Histoire-Géographie" | "Les Matinées du Bac".`;

export const dossier_templates = [
  {
    id: 'HG_DOSSIER_QP_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'hg_question_problematisee',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('une question problématisée', 'QUESTION PROBLÉMATISÉE') +
      `

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du devoir. Pour 4 moments (l'accroche et la définition des termes ; la réponse d'ensemble annoncée ; deux temps forts ou faibles de la démonstration ; la conclusion) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi, en termes de méthode ET de contenu) ; si le passage est à corriger : box reform (lab "Formulation attendue", fondée sur .improvement du critère) + .gain chiffré en points.
- Au moins un des moments doit porter sur un EXEMPLE : cité ou démontré ? daté, situé, attribué ? à quelle échelle ?
` +
      sectionsCommunes(
        '- "MES REPÈRES À SÉCURISER" (mh) + mb ul de 2 à 4 li : les dates, acteurs, lieux ou notions que la copie a confondus, oubliés ou employés sans définition, avec la formulation juste en une ligne.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement l'entrée en matière (définition des termes, bornes du sujet, réponse d'ensemble annoncée), puis au choix un paragraphe de développement ou la conclusion. box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des exemples déjà présents dans la copie ou dans sujet.expected_concepts / sujet.expected_mechanisms. Aucun fait nouveau.
` +
      REGLES_HG +
      FOURCHETTE,
  },
  {
    id: 'HG_DOSSIER_DOC_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'hg_analyse_document',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("une analyse de document(s)", 'ANALYSE DE DOCUMENT') +
      `

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du devoir. Pour 4 moments (la présentation du document ; une citation bien choisie ou mal choisie ; un passage de paraphrase ; un passage de croisement réussi ; la critique du document) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi) ; si le passage est à corriger : box reform (lab "Formulation attendue", fondée sur .improvement du critère) + .gain chiffré en points.
- Au moins un des moments doit opposer PARAPHRASE et ANALYSE sur la même phrase de la copie : ce que l'élève a écrit, puis la même idée transformée en explication reliée aux connaissances.
` +
      sectionsCommunes(
        '- "MES RÉFLEXES SUR UN DOCUMENT" (mh) + mb ul de 2 à 4 li : nature / auteur / date / destinataire, citer court, expliquer avec le cours, dire la limite — chacun formulé comme une question à se poser en copie.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement la présentation du document (nature, auteur, date, contexte, intention) et un passage de paraphrase transformé en analyse croisée. box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des éléments déjà présents dans la copie ou dans sujet.expected_concepts / sujet.expected_mechanisms. Tu n'inventes JAMAIS un passage du document que la copie ne cite pas.
` +
      REGLES_HG +
      FOURCHETTE,
  },
  {
    id: 'HG_DOSSIER_CROQUIS_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'hg_croquis',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('un croquis de géographie', 'CROQUIS') +
      `

AVERTISSEMENT À AFFICHER : juste sous le badge de couverture, ajoute une .box cream (lab "À lire avant tout") disant que la correction automatique n'a pas vu le croquis lui-même, seulement sa légende et son titre transcrits, et que la note graphique doit être confirmée par le professeur devant la copie.

SECTION 2 — TA COPIE, ANNOTÉE
- Porte sur ce qui est transcrit : le titre du croquis, les parties de la légende, les intitulés des figurés, la nomenclature. Pour 4 moments : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi) ; si le passage est à corriger : box reform (lab "Formulation attendue") + .gain chiffré en points.
- Un des moments porte obligatoirement sur les TITRES DE LÉGENDE : décrivent-ils l'espace ou répondent-ils au sujet ?
- Tu ne commentes JAMAIS le tracé, les couleurs ou la position des figurés : tu ne les as pas vus. Quand c'est en jeu, tu écris que ce point relève de la relecture du professeur.
` +
      sectionsCommunes(
        '- "MES RÉFLEXES DE CARTOGRAPHE" (mh) + mb ul de 2 à 4 li : titre problématisé, légende en parties titrées, figuré adapté à la nature de l\'information, nomenclature écrite correctement.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 éléments faibles : obligatoirement le TITRE du croquis et l'ORGANISATION DE LA LÉGENDE (parties titrées qui répondent au sujet, figurés reclassés). box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des éléments déjà présents dans la copie ou dans sujet.expected_concepts / sujet.expected_mechanisms. Aucune localisation nouvelle inventée.
` +
      REGLES_HG +
      FOURCHETTE,
  },
  {
    id: 'HG_DOSSIER_TECH_QUESTIONS_ELEVE_V1',
    track: 'technologique',
    matiere,
    exercise_type: 'hg_tech_questions',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('une série de questions de connaissances (voie technologique)', 'QUESTIONS DE CONNAISSANCES') +
      `

SECTION 2 — TA COPIE, ANNOTÉE
- Reprends les questions dans l'ordre. Pour 4 d'entre elles : h4.subq intitulé de la question ; box said (lab "Ta réponse" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + réponse juste, partielle ou fausse, ET pourquoi) ; si la réponse est à corriger : box reform (lab "Réponse attendue", courte et complète) + .gain chiffré en points.
- Rappelle au moins une fois qu'une réponse juste et brève vaut le maximum : la longueur n'est pas un critère.
` +
      sectionsCommunes(
        '- "MES REPÈRES À SÉCURISER" (mh) + mb ul de 2 à 4 li : les dates, acteurs, lieux ou notions que la copie a confondus ou oubliés, avec la formulation juste en une ligne.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 réponses faibles en réponses modèles : complètes, exactes, et pas plus longues que nécessaire. box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des éléments déjà présents dans la copie ou dans sujet.expected_concepts / sujet.expected_mechanisms. Aucun fait nouveau.
` +
      REGLES_HG +
      FOURCHETTE,
  },
];

export default { matiere, libelle, session, rubrics, subject_cards, benchmark_cards, dossier_templates };
