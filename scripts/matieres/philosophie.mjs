// =====================================================================
//  DONNEES DE LA MATIERE : PHILOSOPHIE (tronc commun), session 2027
//
//  Pourquoi ce fichier existe : une session de bac blanc de philosophie
//  est ouverte a l'inscription (20 septembre 2026, src/lib/sessions.ts)
//  alors que la matiere n'avait AUCUNE ligne dans le pipeline.
//
//  Comme pour les mathematiques, il n'existait pas de dossier source
//  fourni par un professeur : tout ce fichier a ete redige par Les
//  Matinees du Bac a partir des textes officiels publics de l'epreuve
//  (programme de philosophie de terminale, definition de l'epreuve
//  ecrite : deux sujets de dissertation et une explication de texte, au
//  choix, 4 heures). Rien ici n'est une annale reproduite. La relecture
//  par un professeur de philosophie est donc la condition d'activation.
//
//  ATTENTION PARTICULIERE AUX TEXTES : les trois textes a expliquer sont
//  des extraits du DOMAINE PUBLIC (Descartes 1637, Pascal 1670, Rousseau
//  1762), choisis pour cette raison. Ils sont donnes ici dans leur
//  orthographe modernisee. Avant la premiere session, le professeur
//  relecteur doit VERIFIER chaque extrait mot a mot sur une edition de
//  reference : une explication de texte se corrige sur le texte exact, et
//  un mot deplace change ce qu'on peut reprocher a l'eleve. C'est le sens
//  du champ source_verification_required de chaque fiche.
//
//  Particularite de la matiere : l'epreuve est notee SUR 20, comme le
//  francais. Aucune conversion d'echelle. La copie de philosophie est du
//  texte pur : c'est la matiere la moins exposee aux limites de la
//  transcription (ni schema, ni graphique, ni formule).
// =====================================================================

export const matiere = 'philosophie';
export const libelle = 'Philosophie';
export const session = 2027;

// ---------------------------------------------------------------------
//  Taxonomie d'erreurs, dans rubric_json.common_error_taxonomy (la table
//  error_taxonomy n'a pas de colonne matiere : y ecrire ferait fuiter des
//  codes d'une matiere a l'autre).
//  Le champ `criterion` vaut pour la grille de dissertation, qui sert de
//  reference ; taxoPour() le redirige vers le critere de CHAQUE grille.
// ---------------------------------------------------------------------
const TAXONOMIE = [
  { code: 'PH-PROB-01',  criterion: 'PROB',  severity: 'major',    category: 'absence_de_probleme',   description: "Le sujet est traite comme une question de cours : aucun probleme n'est degage, aucune tension n'est formulee. La copie repond avant d'avoir montre pourquoi la question se pose." },
  { code: 'PH-PROB-02',  criterion: 'PROB',  severity: 'major',    category: 'termes_non_analyses',   description: "Les termes du sujet ne sont pas analyses : ils sont repris tels quels, sans distinction de sens, sans examen des presupposes de la question." },
  { code: 'PH-PLAN-01',  criterion: 'STRUCT',severity: 'major',    category: 'plan_non_progressif',   description: "Plan qui juxtapose des positions (oui / non / peut-etre) sans progression : la troisieme partie n'a pas ete rendue necessaire par l'echec de la deuxieme." },
  { code: 'PH-PLAN-02',  criterion: 'STRUCT',severity: 'moderate', category: 'plan_non_annonce',      description: "Absence d'introduction complete ou de conclusion : le probleme n'est pas annonce, ou la reponse finale n'est jamais formulee." },
  { code: 'PH-ARG-01',   criterion: 'ARG',   severity: 'major',    category: 'affirmation_sans_argument', description: "Affirmations enchainees sans argumentation : la these est posee, jamais etablie. Aucun raisonnement ne conduit d'une idee a la suivante." },
  { code: 'PH-ARG-02',   criterion: 'ARG',   severity: 'major',    category: 'concept_non_defini',    description: "Concept central employe sans etre defini, ou change de sens en cours de devoir sans que le glissement soit assume." },
  { code: 'PH-ARG-03',   criterion: 'ARG',   severity: 'moderate', category: 'exemple_tenant_lieu_de_preuve', description: "L'exemple remplace l'argument : le cas particulier est raconte, jamais analyse, et la conclusion generale en est tiree sans mediation." },
  { code: 'PH-REF-01',   criterion: 'REF',   severity: 'moderate', category: 'reference_plaquee',     description: "Reference philosophique plaquee : l'auteur est cite comme une autorite, sa these n'est ni exposee ni mise au travail dans le raisonnement." },
  { code: 'PH-REF-02',   criterion: 'REF',   severity: 'major',    category: 'contresens_sur_auteur', description: "Contresens sur la doctrine d'un auteur : la these attribuee est fausse ou inversee." },
  { code: 'PH-HS-01',    criterion: 'PROB',  severity: 'major',    category: 'hors_sujet',            description: "Le devoir traite une question voisine mais differente de celle posee : le sujet est deplace, souvent vers un cours revise." },
  { code: 'PH-DOXA-01',  criterion: 'ARG',   severity: 'moderate', category: 'opinion_personnelle',   description: "Opinion personnelle donnee comme argument (« je pense que », « de nos jours ») sans examen critique ni distance conceptuelle." },
  { code: 'PH-EXPR-01',  criterion: 'EXPR',  severity: 'moderate', category: 'expression',            description: "Expression qui empeche la pensee : phrases mal construites, vocabulaire approximatif, connecteurs logiques absents ou faux." },
  { code: 'PH-EXPR-02',  criterion: 'EXPR',  severity: 'minor',    category: 'langue',                description: "Orthographe et syntaxe degradees au point de gener la lecture, sans que le sens soit perdu." },
  // Codes propres a l'explication de texte.
  { code: 'PH-TXT-01',   criterion: 'ARG',   severity: 'major',    category: 'these_non_identifiee',  description: "La these du texte n'est pas identifiee, ou une idee secondaire est prise pour la these principale." },
  { code: 'PH-TXT-02',   criterion: 'ARG',   severity: 'major',    category: 'paraphrase',            description: "Paraphrase : le texte est reformule sans etre explique. Rien n'est eclairci, aucun terme n'est defini, aucune articulation n'est mise au jour." },
  { code: 'PH-TXT-03',   criterion: 'STRUCT',severity: 'major',    category: 'structure_non_reperee', description: "Les mouvements du texte ne sont pas reperes : les articulations logiques (mais, donc, car, or) sont ignorees, le texte est traite comme un bloc." },
  { code: 'PH-TXT-04',   criterion: 'REF',   severity: 'moderate', category: 'texte_quitte',          description: "Le texte est quitte au profit d'un cours sur l'auteur ou la notion : le devoir n'explique plus ce texte-ci." },
  { code: 'PH-TXT-05',   criterion: 'PROB',  severity: 'moderate', category: 'enjeu_absent',          description: "L'enjeu du texte n'est pas degage : on ne sait pas contre quoi l'auteur ecrit ni ce que sa these change." },
  { code: 'PH-TRANS-01', criterion: 'TRANSCRIPTION', severity: 'major', category: 'transcription',    description: "Mot, nom propre ou citation incertain dans la transcription : declenche une relecture humaine, jamais une sanction." },
];

/**
 * Selectionne des codes pour une grille, en redirigeant leur `criterion`
 * vers un critere qui existe REELLEMENT dans cette grille.
 */
const taxoPour = (codes, versCritere = {}) =>
  TAXONOMIE.filter((e) => codes.includes(e.code)).map((e) =>
    versCritere[e.code] ? { ...e, criterion: versCritere[e.code] } : e,
  );

// ---------------------------------------------------------------------
//  Regles communes aux deux grilles
// ---------------------------------------------------------------------
const GARDE_FOUS_COMMUNS = [
  "Tu n'inventes aucun critere en dehors de la grille.",
  "Tu ne sanctionnes pas deux fois la meme faiblesse sur deux criteres differents.",
  'Chaque score est justifie par une citation localisable dans la transcription.',
  "Tu n'inventes JAMAIS une reference, une citation ou une these que la copie ne contient pas.",
  "Tu evalues la copie reellement produite, pas la copie ideale : une these differente de la tienne, defendue avec rigueur, vaut une bonne note.",
  "La philosophie ne se note pas a l'accord : aucune position n'est fausse en soi, seul le defaut d'argumentation l'est.",
  "Une copie courte mais rigoureuse vaut mieux qu'une copie longue et bavarde : tu ne notes jamais a la longueur.",
  "Une erreur de transcription a fort impact declenche une relecture humaine et non une sanction.",
];

// Socle commun des system_prompt. 100% ASCII.
const SOCLE_PROMPT =
  "ECHELLE DE NOTATION : le bareme total de cette grille vaut 20 points, comme l'epreuve officielle. " +
  "Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, donc un nombre compris entre 0 et 20. " +
  "Les copies etalons portent la meme echelle sur 20 : comparaison directe, sans conversion. " +
  "LIMITE DE LA TRANSCRIPTION : tu ne recois que le TEXTE transcrit de la copie. " +
  "[illisible], [rature] et [marge] sont des marques du transcripteur, jamais des erreurs de l'eleve. " +
  "Si la transcription signale un doute sur un mot, un nom d'auteur ou une citation, tu retiens la lecture la PLUS FAVORABLE a l'eleve et tu passes human_review_required a true. " +
  "Tu ne sanctionnes jamais la mise en page, l'ecriture ni la longueur apparente : elles ne survivent pas a la transcription. " +
  "CODES D'ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille de philosophie fournie (PH-xxx-nn). " +
  "Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d'une autre matiere. " +
  "ETALONS : les copies etalons servent a situer le niveau global. Le champ benchmark_comparison.lower_or_equal_id doit designer l'etalon dont la note est INFERIEURE OU EGALE a celle que tu attribues, et upper_or_equal_id celui dont la note est SUPERIEURE OU EGALE. " +
  "Methode imposee : classe d'abord les etalons par note croissante, place ta note dans ce classement, puis prends l'etalon immediatement en dessous et celui immediatement au-dessus. " +
  "Exemple : etalons a 3, 7, 11, 14 et 18, note attribuee 11,75 -> lower_or_equal_id est l'etalon a 11 et upper_or_equal_id l'etalon a 14. " +
  "Verifie l'ordre avant de repondre : la note de lower_or_equal_id ne peut JAMAIS etre superieure a la tienne, ni celle de upper_or_equal_id inferieure. " +
  "Si aucun etalon n'encadre la note d'un cote, reprends l'etalon le plus proche de ce cote et dis-le dans explanation.";

const CRIT_EXPRESSION = (max) => ({
  code: 'EXPR',
  name: 'Expression et rigueur de la langue',
  maximum_score: max,
  description:
    "Ecrire une pensee : phrases construites, vocabulaire conceptuel employe a bon escient, connecteurs logiques justes, orthographe et syntaxe qui ne genent pas la lecture. La langue n'est pas un supplement : en philosophie, une phrase confuse est une pensee confuse.",
  levels: {
    '0': 'Copie blanche, ou expression rendant le propos inintelligible.',
    [String(max * 0.25)]: "Insuffisant : syntaxe deficiente, vocabulaire approximatif, aucun connecteur logique ; le raisonnement est illisible.",
    [String(max * 0.5)]: 'Fragile : la langue passe mais reste maladroite, le vocabulaire conceptuel est employe de facon flottante.',
    [String(max * 0.75)]: 'Satisfaisant : expression claire, vocabulaire conceptuel correct, articulations logiques presentes.',
    [String(max)]: "Tres satisfaisant : ecriture precise et sobre, concepts employes avec justesse, progression du raisonnement lisible dans la langue elle-meme.",
  },
});

// ---------------------------------------------------------------------
//  1) LES 2 GRILLES
//     Criteres construits sur les attendus publics de l'epreuve
//     (problematisation, argumentation, references, structure, langue).
//     La ponderation est un choix des Matinees du Bac : c'est le premier
//     point a faire trancher par un professeur de philosophie.
// ---------------------------------------------------------------------
export const rubrics = [
  {
    id: 'PHILO_DISSERTATION_V1',
    track: 'generale',
    exercise_type: 'philo_dissertation',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de philosophie au baccalaureat general. " +
      "Tu corriges une dissertation de philosophie de terminale. " +
      "REGLE PREMIERE DE LA MATIERE : tu ne notes JAMAIS l'accord ou le desaccord avec la these de l'eleve. Aucune position n'est fausse en soi. Ce qui se note, c'est la construction d'un probleme, la rigueur de l'argumentation et la precision des concepts. Une these que tu juges discutable, defendue avec rigueur, merite une tres bonne note. " +
      "Tu evalues la copie reellement produite, sans reconstruire la dissertation ideale, et sans reprocher a l'eleve de ne pas avoir traite le sujet que tu aurais choisi. " +
      "Tu verifies d'abord que le sujet POSE est bien celui qui est TRAITE : le hors-sujet est la faute la plus couteuse et tu la caracterises precisement (quel sujet la copie traite-t-elle en realite ?). " +
      "Tu exiges qu'un probleme soit degage : une tension, une difficulte, une raison pour laquelle la question se pose. Une copie qui repond sans avoir montre pourquoi la question fait probleme ne depasse pas le milieu du bareme sur le critere PROB. " +
      "Tu exiges que les concepts centraux soient definis et tenus : un concept qui change de sens en cours de devoir est une faute d'argumentation, pas une nuance. " +
      "Une reference philosophique ne vaut que si sa these est exposee et mise au travail ; un nom d'auteur cite comme une autorite ne rapporte rien. Un devoir sans reference explicite mais rigoureusement argumente peut obtenir une bonne note : tu ne comptes pas les auteurs. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la transcription est incertaine sur une citation ou un nom d'auteur, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Une dissertation de philosophie se juge sur la construction d'un probleme et la conduite d'une argumentation : le sujet est analyse, une difficulte est degagee, des theses sont examinees et discutees, une reponse est assumee.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les attendus publics de l'epreuve ecrite de philosophie (analyse des termes et du presuppose, problematisation, argumentation conceptuelle, mobilisation de references, expression). La ponderation PROB 5 / ARG 6 / REF 3 / STRUCT 3 / EXPR 3 est un choix des Matinees du Bac, pas un bareme officiel.",
      exam_context:
        "Epreuve ecrite de philosophie, 4 heures : deux sujets de dissertation et une explication de texte au choix. Aucun document, aucun dictionnaire.",
      criteria: [
        {
          code: 'PROB',
          name: 'Analyse du sujet et problematisation',
          maximum_score: 5,
          description:
            "Analyser les termes du sujet, reperer son presuppose, formuler le probleme qu'il souleve : pourquoi la question se pose-t-elle, quelle tension rend une reponse immediate impossible. Le sujet traite doit etre celui qui est pose.",
          levels: {
            '0': 'Copie blanche, ou hors sujet total : le devoir traite une autre question.',
            '1.25': "Insuffisant : les termes sont repris sans analyse, aucun probleme n'est degage, le sujet est traite comme une question de cours.",
            '2.5': 'Fragile : un ou deux termes sont definis, une amorce de probleme apparait mais reste une reformulation de la question.',
            '3.75': 'Satisfaisant : les termes sont analyses, le presuppose est repere, le probleme est formule comme une tension reelle.',
            '5': "Tres satisfaisant : analyse fine des termes et de leurs sens concurrents, presuppose interroge, probleme formule avec precision et tenu tout au long du devoir.",
          },
        },
        {
          code: 'ARG',
          name: 'Argumentation et conceptualisation',
          maximum_score: 6,
          description:
            "Etablir plutot qu'affirmer : chaque these avancee est soutenue par un raisonnement, les concepts sont definis et tenus, les objections sont envisagees, les exemples sont analyses et non racontes. C'est le coeur de la note.",
          levels: {
            '0': 'Aucune argumentation exploitable.',
            '1.5': "Insuffisant : suite d'affirmations et d'opinions ; les concepts ne sont pas definis, aucun raisonnement ne relie les idees.",
            '3': "Fragile : des arguments apparaissent mais restent inaboutis ; l'exemple tient souvent lieu de preuve, un concept central glisse de sens.",
            '4.5': "Satisfaisant : argumentation conduite et concepts tenus ; une objection est envisagee ; un maillon reste implicite.",
            '6': "Tres satisfaisant : argumentation rigoureuse et progressive, concepts definis et distingues, objections examinees serieusement, exemples analyses au service du raisonnement.",
          },
        },
        {
          code: 'REF',
          name: 'References philosophiques et culture',
          maximum_score: 3,
          description:
            "Mobiliser des theses philosophiques a bon escient : exposees correctement, mises au travail dans l'argumentation, jamais citees comme autorite. Une copie sans nom d'auteur mais qui pense rigoureusement peut atteindre le haut du critere.",
          levels: {
            '0': 'Aucune reference, aucune culture mobilisee, et aucune reflexion qui en tienne lieu.',
            '0.75': "Insuffisant : noms d'auteurs cites sans these, ou contresens manifeste sur une doctrine.",
            '1.5': "Fragile : une reference exacte mais plaquee, non articulee au raisonnement.",
            '2.25': "Satisfaisant : references exactes et pertinentes, integrees a l'argumentation.",
            '3': "Tres satisfaisant : references precises, discutees, parfois opposees entre elles ; la culture sert le probleme au lieu de l'orner.",
          },
        },
        {
          code: 'STRUCT',
          name: 'Structure et progression',
          maximum_score: 3,
          description:
            "Construire un parcours : introduction qui amene le probleme et annonce le devoir, parties dont chacune rend la suivante necessaire, transitions argumentees, conclusion qui repond a la question posee.",
          levels: {
            '0': 'Aucune structure identifiable.',
            '0.75': "Insuffisant : ni introduction ni conclusion veritables, parties juxtaposees sans ordre.",
            '1.5': 'Fragile : plan en oui / non sans progression, transitions absentes, conclusion qui resume au lieu de repondre.',
            '2.25': 'Satisfaisant : plan progressif, introduction et conclusion completes, transitions presentes.',
            '3': "Tres satisfaisant : chaque partie nait de l'insuffisance de la precedente, transitions argumentees, conclusion qui assume une reponse au probleme pose.",
          },
        },
        CRIT_EXPRESSION(3),
      ],
      common_error_taxonomy: taxoPour([
        'PH-PROB-01', 'PH-PROB-02', 'PH-PLAN-01', 'PH-PLAN-02', 'PH-ARG-01',
        'PH-ARG-02', 'PH-ARG-03', 'PH-REF-01', 'PH-REF-02', 'PH-HS-01',
        'PH-DOXA-01', 'PH-EXPR-01', 'PH-EXPR-02', 'PH-TRANS-01',
      ]),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },

  {
    id: 'PHILO_EXPLICATION_V1',
    track: 'generale',
    exercise_type: 'philo_explication_texte',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de philosophie au baccalaureat general. " +
      "Tu corriges une explication de texte philosophique de terminale. " +
      "REGLE PREMIERE : l'exercice consiste a expliquer CE texte-ci, pas a exposer un cours sur son auteur ni sur la notion. Une copie erudite qui quitte le texte vaut moins qu'une copie modeste qui l'eclaire. " +
      "Tu verifies que la these du texte est correctement identifiee : c'est le premier point note, et une these fausse fragilise tout le devoir sans pour autant l'annuler : la suite est evaluee pour ce qu'elle vaut. " +
      "Tu distingues strictement EXPLIQUER et PARAPHRASER : reformuler avec d'autres mots n'explique rien. Expliquer, c'est definir les termes, rendre raison des articulations logiques, montrer pourquoi l'auteur ecrit ceci a cet endroit. Tu nommes la paraphrase quand tu la vois. " +
      "Tu attends que les mouvements du texte soient reperes et justifies par ses articulations reelles (mais, or, donc, car), pas par un decoupage arbitraire. " +
      "Tu attends un enjeu : contre quelle position l'auteur ecrit-il, qu'est-ce que sa these change. " +
      "Tu ne reproches pas a l'eleve de ne pas connaitre l'auteur : la connaissance externe est un plus, jamais une condition. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Une explication de texte se juge a l'eclairage qu'elle apporte : la these est identifiee, la structure est reperee, les termes sont definis, les articulations sont rendues intelligibles, l'enjeu est degage.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les attendus publics de l'epreuve (comprehension de la these, reperage de la structure, explication conceptuelle, degagement de l'enjeu, expression). La ponderation COMP 5 / STRUCT 4 / EXPL 6 / ENJ 2 / EXPR 3 est un choix des Matinees du Bac, pas un bareme officiel.",
      exam_context:
        "Epreuve ecrite de philosophie, 4 heures : deux sujets de dissertation et une explication de texte au choix. La connaissance de la doctrine de l'auteur n'est pas requise par l'enonce officiel.",
      criteria: [
        {
          code: 'COMP',
          name: 'Comprehension de la these',
          maximum_score: 5,
          description:
            "Identifier ce que le texte soutient : sa these principale, formulee en une phrase, distinguee des idees secondaires et des positions que l'auteur rapporte pour les combattre.",
          levels: {
            '0': "Copie blanche, ou contresens total : le texte est cru soutenir l'inverse de ce qu'il dit.",
            '1.25': "Insuffisant : la these n'est pas degagee, ou une idee secondaire est prise pour la these principale.",
            '2.5': "Fragile : la these est approchee mais formulee de facon vague, sans distinction entre ce que l'auteur affirme et ce qu'il rapporte.",
            '3.75': "Satisfaisant : these correctement identifiee et formulee, idees secondaires situees par rapport a elle.",
            '5': "Tres satisfaisant : these formulee avec precision, distinguee des theses combattues, et son statut (definition, argument, consequence) reconnu.",
          },
        },
        {
          code: 'STRUCT',
          name: 'Reperage de la structure',
          maximum_score: 4,
          description:
            "Decouper le texte en mouvements et justifier ce decoupage par ses articulations reelles : connecteurs logiques, ruptures, exemples introduits, conclusion tiree.",
          levels: {
            '0': "Le texte est traite comme un bloc indifferencie.",
            '1': "Insuffisant : decoupage arbitraire, aucune articulation relevee.",
            '2': "Fragile : les mouvements sont annonces mais jamais justifies par le texte lui-meme.",
            '3': "Satisfaisant : mouvements identifies et justifies par les connecteurs et les ruptures du texte.",
            '4': "Tres satisfaisant : structure du texte reconstituee dans sa logique argumentative, chaque mouvement relie a la these d'ensemble.",
          },
        },
        {
          code: 'EXPL',
          name: 'Explication et conceptualisation',
          maximum_score: 6,
          description:
            "Eclairer le texte : definir les termes dans le sens qu'ils ont ICI, rendre raison de chaque affirmation, expliciter les presupposes, analyser les exemples de l'auteur. C'est le coeur de la note, et c'est la que se joue la difference avec la paraphrase.",
          levels: {
            '0': 'Aucune explication : le texte est recopie ou resume.',
            '1.5': "Insuffisant : paraphrase continue, aucun terme defini, aucune raison donnee.",
            '3': "Fragile : quelques termes sont expliques, mais l'essentiel du devoir reste une reformulation ; les articulations ne sont pas eclaircies.",
            '4.5': "Satisfaisant : les termes centraux sont definis dans leur sens contextuel, la plupart des affirmations sont expliquees, un passage difficile reste survole.",
            '6': "Tres satisfaisant : explication continue et progressive, termes definis avec precision, presupposes explicites, exemples de l'auteur analyses pour ce qu'ils demontrent.",
          },
        },
        {
          code: 'ENJ',
          name: 'Enjeu et portee du texte',
          maximum_score: 2,
          description:
            "Degager ce qui est en jeu : contre quelle position l'auteur ecrit, ce que sa these change, quelle difficulte elle laisse ouverte. Une objection personnelle argumentee est valorisee, jamais exigee.",
          levels: {
            '0': "Aucun enjeu degage.",
            '0.5': "Insuffisant : l'enjeu est evoque par une formule generale sans rapport avec ce texte.",
            '1': "Fragile : un enjeu est nomme mais non articule au texte.",
            '1.5': "Satisfaisant : l'enjeu est degage et rattache a la these du texte.",
            '2': "Tres satisfaisant : l'enjeu est degage, la position combattue est identifiee, et une limite ou une objection est discutee avec rigueur.",
          },
        },
        CRIT_EXPRESSION(3),
      ],
      common_error_taxonomy: taxoPour(
        [
          'PH-TXT-01', 'PH-TXT-02', 'PH-TXT-03', 'PH-TXT-04', 'PH-TXT-05',
          'PH-ARG-02', 'PH-REF-02', 'PH-DOXA-01', 'PH-EXPR-01', 'PH-EXPR-02', 'PH-TRANS-01',
        ],
        // Cette grille n'a ni PROB, ni ARG, ni REF : les codes qui y
        // renvoyaient sont rediriges vers les criteres qui existent ici.
        {
          'PH-TXT-01': 'COMP',
          'PH-TXT-02': 'EXPL',
          'PH-TXT-04': 'EXPL',
          'PH-TXT-05': 'ENJ',
          'PH-ARG-02': 'EXPL',
          'PH-REF-02': 'COMP',
          'PH-DOXA-01': 'EXPL',
        },
      ),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },
];

// ---------------------------------------------------------------------
//  2) LES SUJETS
//     3 dissertations + 3 explications de texte. Les libelles de
//     dissertation sont des questions de forme classique, ecrites pour
//     Les Matinees du Bac. Les trois textes sont des extraits du DOMAINE
//     PUBLIC (Descartes 1637, Pascal 1670, Rousseau 1762), a verifier mot
//     a mot sur une edition de reference avant la premiere session.
// ---------------------------------------------------------------------
const AVERTISSEMENT_SUJET =
  "Gabarit synthetique d'entrainement au format de l'epreuve, pas un sujet officiel ni une annale reproduite.";

const SOURCES_PH = ['PH-PROG-T', 'PH-DEF-EPREUVE', 'PH-NOTIONS'];

export const subject_cards = [
  {
    id: 'PHI2027_DISS_01',
    track: 'generale',
    exercise_type: 'philo_dissertation',
    work_id: 'PH_N_LIBERTE',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Dissertation',
      work: "La liberté consiste-t-elle à n'obéir à personne ?",
      field: 'Philosophie · Terminale · La liberté, l\'État, la justice',
      level: 'terminale',
      theme_id: 'PH-LIBERTE',
      theme_title: 'La liberté · L\'État · La justice',
      prompt: "La liberté consiste-t-elle à n'obéir à personne ?",
      document_requirements: 'aucun document : le sujet est une question, l\'élève compose sans support.',
      presuppose:
        "Le sujet présuppose que la liberté se définit par un rapport à l'obéissance, donc négativement, comme absence de contrainte extérieure. C'est ce présupposé qu'une bonne copie interroge : obéir à une loi que l'on s'est donnée, est-ce encore obéir à quelqu'un ?",
      expected_concepts: [
        'liberté négative et liberté positive', 'indépendance', 'autonomie et hétéronomie',
        'loi', 'contrainte et obligation', 'volonté générale', 'état de nature', 'servitude volontaire', 'libre arbitre',
      ],
      expected_mechanisms: [
        "Distinguer d'emblée l'indépendance (ne dépendre de personne) de l'autonomie (se donner à soi-même sa loi) : c'est la distinction qui structure tout le sujet.",
        "Examiner la thèse spontanée : être libre, c'est faire ce que l'on veut, sans obstacle ni maître. Puis montrer sa fragilité — la liberté sans loi expose à la force du plus fort, et le désir sans règle peut être lui-même une servitude.",
        "Introduire l'obéissance à une loi que l'on a contribué à établir : obéir à la loi qu'on s'est prescrite est un acte de liberté, non sa négation. Rousseau et Kant sont les références naturelles, sans être obligatoires.",
        "Interroger l'obéissance intérieure : les passions, l'habitude, l'opinion commandent aussi. Une copie forte remarque que le sujet ne dit rien de ces maîtres-là.",
        "Assumer une réponse en conclusion : la liberté ne consiste pas à n'obéir à personne, mais à n'obéir qu'à ce dont on peut être l'auteur — ou toute autre réponse tenue par le raisonnement conduit.",
      ],
      traps: [
        "traiter le sujet « Qu'est-ce que la liberté ? » au lieu de la question posée",
        "confondre liberté et absence de toute contrainte sans jamais interroger cette identification",
        "réciter un cours sur l'État sans revenir à l'obéissance",
        "citer Rousseau comme autorité sans exposer ce que veut dire « obéir à la loi qu'on s'est prescrite »",
        "conclure par « tout dépend du point de vue », qui abandonne le problème au lieu de le résoudre",
      ],
      special_criteria: [
        "la distinction indépendance / autonomie doit apparaître pour dépasser le milieu du barème sur ARG",
        "le présupposé du sujet (liberté = absence d'obéissance) doit être interrogé, pas seulement accepté",
        "la conclusion doit assumer une réponse à la question posée",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },

  {
    id: 'PHI2027_DISS_02',
    track: 'generale',
    exercise_type: 'philo_dissertation',
    work_id: 'PH_N_TRAVAIL',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Dissertation',
      work: 'Le travail nous rend-il plus humains ?',
      field: 'Philosophie · Terminale · Le travail, la technique, la nature',
      level: 'terminale',
      theme_id: 'PH-TRAVAIL',
      theme_title: 'Le travail · La technique · La nature',
      prompt: 'Le travail nous rend-il plus humains ?',
      document_requirements: 'aucun document : le sujet est une question, l\'élève compose sans support.',
      presuppose:
        "Le sujet présuppose qu'on peut être plus ou moins humain, donc que l'humanité est un accomplissement et non un simple état de fait. Interroger ce comparatif est un des chemins les plus sûrs vers une bonne problématisation.",
      expected_concepts: [
        'travail et labeur', 'transformation de la nature', 'aliénation', 'reconnaissance',
        'technique', 'oeuvre', 'nécessité et liberté', 'humanisation', 'loisir et otium',
      ],
      expected_mechanisms: [
        "Distinguer le travail comme contrainte vitale (produire pour subsister) et le travail comme activité par laquelle l'homme transforme la nature et se transforme lui-même.",
        "Soutenir d'abord la thèse d'humanisation : en travaillant, l'homme s'arrache à l'immédiateté du besoin, apprend à différer, produit un monde durable et se fait reconnaître par autrui.",
        "Opposer l'expérience du travail aliéné : division parcellaire des tâches, dépossession du produit, épuisement. Le travail peut aussi déshumaniser — Marx est la référence naturelle, sans être obligatoire.",
        "Dépasser en distinguant le travail comme tel et ses conditions historiques : ce n'est peut-être pas le travail qui déshumanise, mais une certaine organisation du travail.",
        "Assumer une réponse : le travail humanise à condition de rester une oeuvre reconnue, ou toute autre réponse que le raisonnement rend nécessaire.",
      ],
      traps: [
        "réciter un cours sur l'aliénation sans jamais revenir au comparatif « plus humains »",
        "traiter « le travail est-il une contrainte ? », qui est une autre question",
        "prendre des exemples d'actualité sans les analyser (« aujourd'hui, avec le télétravail… »)",
        "opposer travail et loisir sans définir aucun des deux",
        "conclure que « cela dépend du travail » sans avoir construit la distinction qui le montre",
      ],
      special_criteria: [
        "le comparatif « plus humains » doit être interrogé explicitement",
        "l'exemple, s'il est employé, doit être analysé et non raconté",
        "la conclusion doit répondre à la question posée, pas la reformuler",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },

  {
    id: 'PHI2027_DISS_03',
    track: 'generale',
    exercise_type: 'philo_dissertation',
    work_id: 'PH_N_VERITE',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Dissertation',
      work: 'Faut-il préférer la vérité à la paix ?',
      field: 'Philosophie · Terminale · La vérité, la raison, la parole',
      level: 'terminale',
      theme_id: 'PH-VERITE',
      theme_title: 'La vérité · La raison · Le langage',
      prompt: 'Faut-il préférer la vérité à la paix ?',
      document_requirements: 'aucun document : le sujet est une question, l\'élève compose sans support.',
      presuppose:
        "Le sujet présuppose que vérité et paix peuvent entrer en conflit, donc que dire le vrai peut troubler. Une bonne copie commence par examiner si ce conflit est réel ou seulement apparent.",
      expected_concepts: [
        'vérité et véracité', 'opinion', 'consensus', 'illusion utile', 'mensonge',
        'concorde civile', 'devoir de vérité', 'tolérance', 'esprit critique',
      ],
      expected_mechanisms: [
        "Distinguer la vérité (propriété d'un jugement) de la véracité (vertu de celui qui dit ce qu'il croit vrai) : le sujet porte surtout sur la seconde, et cette distinction est le meilleur levier de problématisation.",
        "Soutenir la primauté de la paix : l'illusion partagée apaise, le mensonge protège parfois, une vérité assénée peut détruire une concorde fragile.",
        "Retourner la thèse : une paix fondée sur l'illusion n'est qu'une trêve ; elle interdit la critique et laisse intacte la cause du conflit. La vérité seule permet un accord durable.",
        "Interroger l'alternative elle-même : faut-il vraiment choisir ? Le problème n'est peut-être pas le contenu vrai mais la manière et le moment de le dire.",
        "Assumer une réponse en distinguant les situations : ce que le raisonnement a établi, pas une prudence de façade.",
      ],
      traps: [
        "réduire le sujet à « peut-on mentir ? », qui est une question voisine mais différente",
        "empiler des exemples de mensonges célèbres sans jamais les analyser",
        "confondre vérité et sincérité sans nommer la distinction",
        "conclure « il faut dire la vérité avec tact », formule qui n'a de valeur que si elle a été construite",
        "faire de la troisième partie une simple juxtaposition des deux premières",
      ],
      special_criteria: [
        "la distinction vérité / véracité doit apparaître pour atteindre le haut du critère ARG",
        "l'alternative posée par le sujet doit être interrogée, pas seulement tranchée",
        "chaque partie doit rendre la suivante nécessaire",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },

  {
    id: 'PHI2027_EXPL_01',
    track: 'generale',
    exercise_type: 'philo_explication_texte',
    work_id: 'PH_TXT_DESCARTES_BON_SENS',
    status: 'draft',
    card_json: {
      session,
      source_status: 'domaine_public_extrait_a_verifier_sur_edition_de_reference',
      source_verification_required: true,
      warning:
        "Extrait du domaine public (Descartes, Discours de la méthode, 1637), orthographe modernisée. Le professeur relecteur doit vérifier le texte mot à mot sur une édition de référence avant la première session : une explication de texte se corrige sur le texte exact.",
      exercise: 'Explication de texte',
      work: 'Descartes, Discours de la méthode (1637), première partie',
      field: 'Philosophie · Terminale · La raison, la vérité',
      level: 'terminale',
      theme_id: 'PH-RAISON',
      theme_title: 'La raison · La vérité',
      prompt:
        "Expliquez le texte suivant. La connaissance de la doctrine de l'auteur n'est pas requise. Il faut et il suffit que l'explication rende compte, par la compréhension précise du texte, du problème dont il est question.",
      texte_support:
        "« Le bon sens est la chose du monde la mieux partagée : car chacun pense en être si bien pourvu, que ceux même qui sont les plus difficiles à contenter en toute autre chose n'ont point coutume d'en désirer plus qu'ils en ont. En quoi il n'est pas vraisemblable que tous se trompent ; mais plutôt cela témoigne que la puissance de bien juger et distinguer le vrai d'avec le faux, qui est proprement ce qu'on nomme le bon sens ou la raison, est naturellement égale en tous les hommes ; et ainsi que la diversité de nos opinions ne vient pas de ce que les uns sont plus raisonnables que les autres, mais seulement de ce que nous conduisons nos pensées par diverses voies, et ne considérons pas les mêmes choses. »",
      document_requirements:
        "le texte à expliquer est fourni ci-dessus (champ texte_support) : c'est le seul support de l'épreuve.",
      these_du_texte:
        "La raison est également répartie entre tous les hommes ; la diversité de nos opinions ne s'explique donc pas par une inégalité des esprits, mais par la différence des méthodes que nous suivons et des objets que nous considérons.",
      structure_attendue: [
        "Premier mouvement — le constat ironique : chacun s'estime suffisamment pourvu de bon sens, y compris les plus difficiles à satisfaire en tout le reste.",
        "Deuxième mouvement — l'argument : « il n'est pas vraisemblable que tous se trompent », donc ce contentement universel témoigne d'une égalité réelle ; c'est un raisonnement par l'invraisemblance de l'erreur générale, pas une preuve démonstrative.",
        "Troisième mouvement — la définition : le bon sens est « la puissance de bien juger et distinguer le vrai d'avec le faux », c'est-à-dire la raison elle-même.",
        "Quatrième mouvement — la conséquence : si la raison est égale, la diversité des opinions vient de la méthode, non des facultés. C'est là que se joue tout l'enjeu du texte.",
      ],
      expected_concepts: [
        'bon sens', 'raison', 'jugement', 'vrai et faux', 'opinion', 'méthode', 'égalité naturelle', 'diversité des opinions',
      ],
      expected_mechanisms: [
        "Voir que la première phrase est ironique et que l'ironie est un argument : le contentement universel est justement le signe qu'aucun ne se croit lésé.",
        "Reconstituer l'inférence : personne ne demande plus de bon sens → il est invraisemblable que tous se trompent → donc la raison est également répartie. Discuter la solidité de cette inférence est le sommet de l'exercice.",
        "Expliquer la définition de la raison comme puissance de distinguer le vrai du faux : c'est une faculté, non un savoir ; elle peut être également distribuée sans que ses usages se vaillent.",
        "Dégager l'enjeu : si les esprits sont égaux, la philosophie devient affaire de méthode et non de don. C'est ce qui justifie qu'un Discours de la méthode soit écrit, et écrit en français.",
      ],
      traps: [
        "prendre la première phrase au premier degré et manquer l'ironie",
        "paraphraser le texte phrase à phrase sans définir « bon sens », « raison » ni « méthode »",
        "réciter le cogito et le doute méthodique, absents de cet extrait",
        "confondre égalité de la raison et égalité des opinions",
        "conclure sur « chacun a sa vérité », contresens exact sur la thèse du texte",
      ],
      special_criteria: [
        "l'ironie de la première phrase doit être repérée et expliquée",
        "l'inférence « il n'est pas vraisemblable que tous se trompent » doit être reconstituée",
        "la thèse doit être formulée en une phrase avant l'explication linéaire",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },

  {
    id: 'PHI2027_EXPL_02',
    track: 'generale',
    exercise_type: 'philo_explication_texte',
    work_id: 'PH_TXT_ROUSSEAU_CONTRAT',
    status: 'draft',
    card_json: {
      session,
      source_status: 'domaine_public_extrait_a_verifier_sur_edition_de_reference',
      source_verification_required: true,
      warning:
        "Extrait du domaine public (Rousseau, Du contrat social, 1762, livre I). Le professeur relecteur doit vérifier le texte mot à mot sur une édition de référence avant la première session.",
      exercise: 'Explication de texte',
      work: 'Rousseau, Du contrat social (1762), livre I, chapitres 1 et 3',
      field: 'Philosophie · Terminale · La liberté, l\'État, le devoir',
      level: 'terminale',
      theme_id: 'PH-POLITIQUE',
      theme_title: 'La liberté · L\'État · Le devoir',
      prompt:
        "Expliquez le texte suivant. La connaissance de la doctrine de l'auteur n'est pas requise. Il faut et il suffit que l'explication rende compte, par la compréhension précise du texte, du problème dont il est question.",
      texte_support:
        "« L'homme est né libre, et partout il est dans les fers. Tel se croit le maître des autres, qui ne laisse pas d'être plus esclave qu'eux. […] Le plus fort n'est jamais assez fort pour être toujours le maître, s'il ne transforme sa force en droit et l'obéissance en devoir. […] Céder à la force est un acte de nécessité, non de volonté ; c'est tout au plus un acte de prudence. En quel sens peut-ce être un devoir ? […] Convenons donc que force ne fait pas droit, et qu'on n'est obligé d'obéir qu'aux puissances légitimes. »",
      document_requirements:
        "le texte à expliquer est fourni ci-dessus (champ texte_support) : c'est le seul support de l'épreuve. Les crochets […] signalent des coupes faites dans l'original.",
      these_du_texte:
        "La force ne fonde aucun droit : céder à la force relève de la nécessité, non du devoir. Seule une puissance légitime peut obliger, ce qui suppose une transformation de la force en droit que la force seule ne peut accomplir.",
      structure_attendue: [
        "Premier mouvement — le constat paradoxal : la liberté est originaire, la servitude est universelle ; le maître lui-même est esclave.",
        "Deuxième mouvement — le problème du plus fort : sa domination est instable tant qu'elle repose sur la seule force ; il lui faut convertir la force en droit et l'obéissance en devoir.",
        "Troisième mouvement — la réfutation : céder à la force est nécessité ou prudence, jamais devoir. La question « en quel sens peut-ce être un devoir ? » est rhétorique et vaut réfutation.",
        "Quatrième mouvement — la conclusion : force ne fait pas droit, on n'obéit légitimement qu'à une puissance légitime.",
      ],
      expected_concepts: [
        'liberté naturelle', 'servitude', 'force', 'droit', 'devoir', 'obligation',
        'légitimité', 'nécessité et volonté', 'prudence', 'contrat',
      ],
      expected_mechanisms: [
        "Expliquer le paradoxe initial : « né libre » désigne un droit ou une nature, « dans les fers » un fait ; le texte oppose un droit à un état de fait, il ne se contredit pas.",
        "Comprendre que le maître est « plus esclave » parce que sa domination le rend dépendant de ceux qu'il domine : l'analyse de ce renversement est un discriminant fort.",
        "Distinguer soigneusement obéir par nécessité (je cède parce que je ne peux pas faire autrement) et obéir par devoir (je reconnais une obligation) : c'est l'articulation centrale du texte.",
        "Voir que la question « en quel sens peut-ce être un devoir ? » est une réfutation déguisée en question, et que la conclusion « force ne fait pas droit » en découle.",
        "Dégager l'enjeu : si la force ne fonde rien, il faut chercher ailleurs le fondement de l'obéissance politique — le contrat, que ce texte prépare sans l'exposer.",
      ],
      traps: [
        "traiter le texte comme un cours sur le contrat social, absent de l'extrait",
        "paraphraser « l'homme est né libre » sans expliquer en quoi consiste le paradoxe",
        "confondre légitimité et légalité",
        "conclure qu'il ne faut jamais obéir, contresens sur la thèse",
        "citer d'autres auteurs au lieu d'expliquer celui-ci",
      ],
      special_criteria: [
        "la distinction nécessité / devoir doit être expliquée, c'est le coeur du texte",
        "le renversement « le maître est plus esclave » doit être analysé, pas seulement cité",
        "la thèse doit être formulée en une phrase avant l'explication linéaire",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },

  {
    id: 'PHI2027_EXPL_03',
    track: 'generale',
    exercise_type: 'philo_explication_texte',
    work_id: 'PH_TXT_PASCAL_ROSEAU',
    status: 'draft',
    card_json: {
      session,
      source_status: 'domaine_public_extrait_a_verifier_sur_edition_de_reference',
      source_verification_required: true,
      warning:
        "Extrait du domaine public (Pascal, Pensées, édition posthume de 1670). Le professeur relecteur doit vérifier le texte mot à mot sur une édition de référence (la numérotation des fragments varie selon les éditions) avant la première session.",
      exercise: 'Explication de texte',
      work: 'Pascal, Pensées (1670)',
      field: 'Philosophie · Terminale · La conscience, la nature humaine',
      level: 'terminale',
      theme_id: 'PH-CONSCIENCE',
      theme_title: 'La conscience · La raison · La nature',
      prompt:
        "Expliquez le texte suivant. La connaissance de la doctrine de l'auteur n'est pas requise. Il faut et il suffit que l'explication rende compte, par la compréhension précise du texte, du problème dont il est question.",
      texte_support:
        "« L'homme n'est qu'un roseau, le plus faible de la nature ; mais c'est un roseau pensant. Il ne faut pas que l'univers entier s'arme pour l'écraser : une vapeur, une goutte d'eau suffit pour le tuer. Mais quand l'univers l'écraserait, l'homme serait encore plus noble que ce qui le tue, parce qu'il sait qu'il meurt et l'avantage que l'univers a sur lui ; l'univers n'en sait rien. Toute notre dignité consiste donc en la pensée. C'est de là qu'il faut nous relever, non de l'espace et de la durée. Travaillons donc à bien penser : voilà le principe de la morale. »",
      document_requirements:
        "le texte à expliquer est fourni ci-dessus (champ texte_support) : c'est le seul support de l'épreuve.",
      these_du_texte:
        "La dignité de l'homme ne tient ni à sa force ni à sa place dans l'univers, mais à la pensée : parce qu'il sait sa misère, il vaut plus que ce qui l'écrase — d'où une conséquence morale, bien penser.",
      structure_attendue: [
        "Premier mouvement — la comparaison : l'homme est un roseau, donc fragile, mais « pensant » ; l'adversatif « mais » porte toute la thèse.",
        "Deuxième mouvement — l'insistance sur la fragilité : il ne faut pas l'univers entier, une vapeur suffit. L'hyperbole sert à isoler ce qui reste quand la force est ôtée.",
        "Troisième mouvement — le renversement : savoir qu'on meurt rend plus noble que ce qui tue, car l'univers ne sait rien. La supériorité change de terrain, de la puissance au savoir.",
        "Quatrième mouvement — la conséquence : la dignité est dans la pensée, non dans l'espace ni la durée ; d'où l'impératif final, « travaillons à bien penser », donné comme principe de la morale.",
      ],
      expected_concepts: [
        'conscience', 'pensée', 'dignité', 'grandeur et misère', 'nature',
        'connaissance de soi', 'mortalité', 'morale', 'espace et durée',
      ],
      expected_mechanisms: [
        "Expliquer la métaphore du roseau : ce qui est comparé n'est pas l'homme et la plante, mais deux manières d'être fragile ; l'ajout de « pensant » rompt la comparaison au moment où elle s'installe.",
        "Analyser le renversement de la supériorité : l'univers l'emporte en force, l'homme en savoir. La noblesse est déplacée de l'ordre de la puissance à celui de la conscience.",
        "Rendre raison du « donc » : la dignité consiste en la pensée parce que c'est la seule chose que l'écrasement ne peut atteindre. Sans ce lien, l'explication devient paraphrase.",
        "Comprendre pourquoi il faut se relever « de la pensée, non de l'espace et de la durée » : chercher sa grandeur dans l'étendue ou la longévité, c'est la chercher là où l'univers est toujours supérieur.",
        "Dégager l'enjeu moral : la dernière phrase transforme un constat anthropologique en impératif, et l'explication doit dire pourquoi ce passage est légitime — ou en discuter la validité.",
      ],
      traps: [
        "commenter la beauté du style au lieu d'expliquer l'argument",
        "traiter le texte comme un éloge de l'homme, en manquant que sa grandeur naît de sa misère même",
        "expliquer « roseau pensant » par une définition de la conscience apprise en cours, sans revenir au texte",
        "sauter la dernière phrase, qui porte pourtant l'enjeu moral",
        "confondre la pensée avec l'intelligence ou le savoir scientifique",
      ],
      special_criteria: [
        "l'adversatif « mais » du premier mouvement doit être expliqué",
        "le « donc » qui introduit la dignité doit être justifié, pas seulement recopié",
        "la dernière phrase (le passage à la morale) doit être traitée",
      ],
      sources: SOURCES_PH,
      teacher_validation_required: true,
    },
  },
];

// ---------------------------------------------------------------------
//  3) LES ETALONS
//     Cinq bandes de notes par sujet, profils synthetiques de
//     calibration : aucune copie reelle de philosophie juridiquement
//     reutilisable n'etait disponible. A remplacer par de vraies copies
//     anonymisees et notees des que possible.
// ---------------------------------------------------------------------
const BANDES = [
  {
    suffixe: 'N03', score: 3, role: 'niveau_03_tres_insuffisant',
    profil: 'copie très insuffisante, hors sujet ou quasi blanche',
    forces: "Quelques mots du sujet sont repris, une intention de répondre apparaît.",
    limites: "Aucun problème dégagé, aucun argument construit, aucune référence : la copie juxtapose des opinions sans lien avec la question posée.",
  },
  {
    suffixe: 'N07', score: 7, role: 'niveau_07_insuffisant',
    profil: 'compréhension fragmentaire du sujet',
    forces: "Le sujet est globalement compris et une thèse est défendue.",
    limites: "Affirmations sans argumentation, concepts jamais définis, exemples racontés à la place des preuves, structure réduite à une succession de paragraphes.",
  },
  {
    suffixe: 'N11', score: 11, role: 'niveau_11_moyen',
    profil: 'acquis partiels, devoir construit mais peu problématisé',
    forces: "Plan lisible, quelques arguments corrects, une ou deux références exactes.",
    limites: "Problème peu formulé ou abandonné en cours de route, références plaquées, concepts employés sans être définis, transitions absentes.",
  },
  {
    suffixe: 'N14', score: 14, role: 'niveau_14_bon',
    profil: 'bonne maîtrise avec lacunes localisées',
    forces: "Problème formulé, argumentation suivie, références mises au travail, plan progressif et conclusion qui répond.",
    limites: "Une partie reste plus faible que les autres, une objection n'est pas envisagée, ou un concept central mériterait une distinction supplémentaire.",
  },
  {
    suffixe: 'N18', score: 18, role: 'niveau_18_tres_bon',
    profil: 'copie très maîtrisée, problématisée et rigoureusement argumentée',
    forces: "Analyse fine des termes, problème tenu de bout en bout, argumentation progressive, références discutées, expression précise.",
    limites: '',
  },
];

const ERREURS_PAR_EXERCICE = {
  philo_dissertation: {
    3: ['PH-HS-01', 'PH-PROB-01', 'PH-ARG-01'],
    7: ['PH-PROB-01', 'PH-ARG-01', 'PH-DOXA-01'],
    11: ['PH-PROB-02', 'PH-REF-01', 'PH-PLAN-01'],
    14: ['PH-ARG-03'],
    18: [],
  },
  philo_explication_texte: {
    3: ['PH-TXT-01', 'PH-TXT-02', 'PH-TXT-03'],
    7: ['PH-TXT-02', 'PH-TXT-03', 'PH-TXT-05'],
    11: ['PH-TXT-02', 'PH-TXT-04'],
    14: ['PH-TXT-05'],
    18: [],
  },
};

/**
 * Repartit une note sur 20 entre les criteres, proportionnellement a leur
 * maximum, arrondie au quart de point ; le reste d'arrondi va sur le
 * critere le plus lourd pour que la somme tombe EXACTEMENT juste.
 */
function repartir(criteria, note) {
  const total = criteria.reduce((s, c) => s + c.maximum_score, 0);
  const parts = criteria.map((c) => ({
    code: c.code,
    max: c.maximum_score,
    valeur: Math.round((note * c.maximum_score) / total * 4) / 4,
  }));
  const ecart = Math.round((note - parts.reduce((s, p) => s + p.valeur, 0)) * 100) / 100;
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
          "Profil synthetique de calibration : aucune copie reelle de philosophie juridiquement reutilisable n'etait disponible a l'installation de la matiere. A remplacer ou confirmer par des copies authentiques anonymisees et notees par un professeur.",
        normalised_score_on_20: bande.score,
        criterion_scores: repartir(grille.rubric_json.criteria, bande.score),
        criterion_scale: 'sur 20, echelle de la grille',
      },
    };
  });
});

// ---------------------------------------------------------------------
//  4) LES GABARITS DE DOSSIER ELEVE
//     Meme charpente que les autres matieres (8 sections + note en
//     fourchette), vocabulaire de la philosophie.
// ---------------------------------------------------------------------
const FOURCHETTE = `
LA NOTE S'AFFICHE EN FOURCHETTE, JAMAIS EN NOTE SÈCHE. Règle de calcul, à appliquer telle quelle :
- demi-largeur = 5 % du barème total, arrondie au demi-point (sur un barème de 20, cela fait 1 point).
- si correction.human_review_required vaut true, tu DOUBLES cette demi-largeur : une correction incertaine s'annonce plus large.
- borne basse = note_finale − demi-largeur, borne haute = note_finale + demi-largeur, chacune arrondie au demi-point et ramenée dans l'intervalle [0 ; barème total].
- Exemple sur 20 : note_finale = 13 → fourchette « 12 – 14 ».
Où elle apparaît :
- BADGE de couverture : <div class="n">12 – 14</div><div class="d">/ 20</div> (les deux bornes, jamais la note exacte).
- cover-note, juste dessous : "Estimation issue d'une correction automatique — ton professeur peut situer ta copie à l'intérieur de cette fourchette." Si human_review_required vaut true, ajoute " Cette copie demande une relecture : la fourchette est volontairement large."
- Ligne TOTAL du tableau de barème : la fourchette, pas la somme. Les lignes de critères, elles, gardent leur score exact : c'est ce qui permet à l'élève de voir où il perd des points.
- Partout ailleurs dans le dossier (appréciation, plan de progression, projection), tu parles de la fourchette ou d'un objectif, jamais d'une note exacte. Le titre de la section 5 devient "DE {borne basse}–{borne haute} À {cible}/20".
Tu n'écris nulle part la valeur exacte de note_finale.`;

const REGLES_PH = `
RÈGLES PHILOSOPHIE NON NÉGOCIABLES :
- Tu n'inventes JAMAIS une citation, une référence ou une thèse que la copie ne contient pas. Si tu proposes une référence à l'élève, tu dis explicitement qu'elle est une suggestion pour la prochaine fois, pas quelque chose qu'il aurait écrit.
- Tu ne recorriges pas : tous les scores viennent de correction.criteria, sans exception.
- Toute citation de l'élève vient de la transcription. Si la transcription manque, tu décris sans citer.
- TU NE NOTES JAMAIS L'ACCORD : une thèse contraire à la tienne, défendue avec rigueur, est une réussite. Si le dossier laisse entendre le contraire, il est faux. Quand tu proposes un développement alternatif, tu l'introduis comme UNE voie possible, pas comme la bonne réponse.
- Ce qui se corrige, c'est la construction : à chaque perte de points, tu montres la formulation attendue (une problématique rédigée, une transition rédigée, une définition rédigée), pas seulement le défaut constaté.
- Les références proposées doivent être exactes et vérifiables ; en cas de doute sur l'attribution d'une thèse, tu ne la cites pas.
- Tu tutoies l'élève. Ton exigeant et bienveillant, jamais de flatterie, jamais de reproche sans la correction à appliquer.
- Ne produis rien d'autre que le corps HTML.

BUDGET DE LONGUEUR — contrainte technique, pas stylistique : le dossier complet doit tenir sous 24 000 caractères de HTML. Le générateur est coupé au-delà et l'élève ne reçoit alors RIEN — un dossier dense et court vaut infiniment mieux qu'un dossier complet jamais livré. Tu tiens ce budget en restant au bas des fourchettes quand la copie ne justifie pas plus : 3 erreurs pénalisantes plutôt que 5 si la copie n'en porte que 3, 4 chantiers de progression plutôt que 6, deux paragraphes d'appréciation et pas trois. Tu ne rallonges jamais une section pour la remplir, et tu ne répètes pas d'une section à l'autre ce qui a déjà été dit.`;

const enTeteDossier = (titre, sousTitre) => `
Tu rédiges le dossier HTML de correction d'un élève de terminale générale, après ${titre}.

STRUCTURE (dans <div class="page"> … <div class="wrap"> … </div></div>) :

COUVERTURE :
- cover-band : <h1>DOSSIER DE CORRECTION</h1><div class="sub">PHILOSOPHIE · ${sousTitre}</div>
- cover-id : name = identite.eleve ; work = sujet.work ; work-meta = sujet.field + " · Bac blanc" ; badge = fourchette de note, "/ 20" ; cover-note = voir la règle de fourchette plus bas.
- .wrap : rappelle d'abord le sujet dans une .box cream (lab "Sujet") = sujet.prompt (et, pour une explication de texte, le premier tiers du texte suivi de […]). Puis table.bareme, une ligne par correction.criteria[] avec le nom complet du critère, + TOTAL. Puis .cap de contexte.

SECTION 1 — NOTE DÉTAILLÉE & APPRÉCIATION
- h3.sub "Niveau par critère" : table.radar, une ligne par critère. Colonne /10 = round(score/maximum*10,1) ; barre width = score/maximum*100 % ; colonne Observation = le NIVEAU ATTEINT parmi Très satisfaisant / Satisfaisant / Fragile / Insuffisant, suivi de six à douze mots de justification.
- h3.sub "Appréciation du correcteur" : correction.appreciation_generale développée en 2 paragraphes .just suivant cet ordre — qualité générale, ce qui fonctionne, le principal frein à une note plus haute, le potentiel réel. Finir par une phrase en gras fixant un objectif chiffré pour la prochaine copie.`;

const sectionsCommunes = (memo) => `
SECTION 3 — CE QUI FAIT BAISSER LA NOTE · CE QUE TU MAÎTRISES
- h3.sub "Erreurs pénalisantes" : 3 à 5 .err construits sur correction.detected_errors, classés par impact décroissant sur la note. Chaque .err dit : ce qui est faux ou manquant · ce qu'il fallait faire · pourquoi cela coûte des points · "Comment corriger :" en gras avec la FORMULATION modèle entièrement rédigée.
- h3.sub "Ce qui manquait" : une .box cream (lab "À ajouter") comparant sujet.expected_concepts et sujet.expected_mechanisms à ce que la copie mobilise réellement ; chaque manque avec sa définition juste en une phrase et l'endroit du devoir où il aurait servi. Les références suggérées sont annoncées comme des pistes pour la prochaine copie.
- h3.sub "Ce que tu maîtrises déjà" : un .good par correction.points_forts, avec le passage exact qui le prouve et ce qu'un correcteur officiel y valoriserait.

SECTION 5 — PLAN DE PROGRESSION
- Un .prio numéroté par correction.priorites_amelioration (4 à 6 chantiers), format "Problème :" / "Action :". Chaque action doit être applicable dès la prochaine copie ; "lis plus de philosophie" et "sois plus rigoureux" sont interdits — on écrit le geste exact ("avant de rédiger, écris ta problématique en une phrase qui contient le mot 'mais'").

SECTION 6 — EXERCICES CIBLÉS
- 2 tables "Exercice N · titre", chacune ciblant UNE faiblesse réellement observée. Lignes Objectif / Consigne / Réussite. La consigne doit être exécutable en 15 minutes sans document supplémentaire (rédiger une introduction, une transition, la définition d'un concept, l'analyse d'un exemple).

SECTION 7 — PROJECTION BAC
- table "Correction apportée" / "Gain estimé" (+0,5 à +2 points, cohérent avec les points réellement perdus au barème) puis <tr class="total"> "Note estimée après corrections" / fourchette au-dessus de la note actuelle, plafonnée à 20. Puis .cap précisant que la projection suppose le même niveau de connaissances.

SECTION 8 — FICHE MÉMO — RÉFLEXES PHILOSOPHIQUES
- Ouvre <div class="sec memo"> et commence OBLIGATOIREMENT par l'en-tête numéroté, comme les sections précédentes : <div class="sec-h"><div class="num">8</div><div class="ttl">FICHE MÉMO — RÉFLEXES PHILOSOPHIQUES</div></div>. Les huit sections doivent toutes porter leur numéro.
- "MES RÉFLEXES DE MÉTHODE" (mh) + mb ul de 3 li tirés des erreurs réelles de la copie, chacun avec un exemple de formulation modèle.
${memo}
- .kicker de fin, motivant et chiffré.

Termine par .foot : "Dossier de correction — {eleve} · Philosophie" | "Les Matinées du Bac".`;

export const dossier_templates = [
  {
    id: 'PHILO_DOSSIER_DISSERTATION_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'philo_dissertation',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('une dissertation de philosophie', 'DISSERTATION')
      + `

SECTION 2 — DU SUJET AU PROBLÈME
- Une .box cream (lab "Analyse du sujet") : chaque terme du sujet défini, ses sens concurrents distingués, le présupposé de la question explicité (sujet.presuppose).
- Puis une .box (lab "La problématique attendue") : UNE problématique entièrement rédigée, en deux phrases, montrant la tension. Compare-la en une phrase à celle que l'élève a formulée — ou signale son absence.
- Puis une table "Partie" / "Ce que tu as écrit" / "Ce qui rendait la partie nécessaire", une ligne par partie repérée dans la copie.

SECTION 4 — LE PLAN QUI TENAIT LE SUJET
- Une .box (lab "Un plan possible") : trois parties annoncées en une phrase chacune, avec la TRANSITION rédigée entre chaque, montrant pourquoi la partie suivante devient nécessaire. Introduis-le explicitement comme UNE construction possible parmi d'autres, pas comme la bonne réponse : en philosophie, un autre plan rigoureux vaut autant.`
      + sectionsCommunes(`- "MES RÉFLEXES DE DISSERTATION" (mh) + mb ul de 4 li : analyser les termes avant de répondre, formuler le problème comme une tension, définir un concept avant de s'en servir, faire naître chaque partie de l'insuffisance de la précédente.`)
      + FOURCHETTE + REGLES_PH,
  },
  {
    id: 'PHILO_DOSSIER_EXPLICATION_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'philo_explication_texte',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("une explication de texte philosophique", 'EXPLICATION DE TEXTE')
      + `

SECTION 2 — LA THÈSE ET LES MOUVEMENTS DU TEXTE
- Une .box cream (lab "La thèse du texte") : la thèse rédigée en une phrase (sujet.these_du_texte), suivie d'une comparaison en une phrase avec celle que l'élève a identifiée — ou du constat qu'elle n'a pas été dégagée.
- Puis une table "Mouvement" / "Ce que dit le texte" / "Ce que tu en as dit", une ligne par mouvement de sujet.structure_attendue.
- Puis une .box (lab "Expliquer, ce n'est pas reformuler") : prends UNE phrase du texte et montre, sur deux colonnes, la paraphrase (à éviter) et l'explication (attendue). Si la copie contient une paraphrase réelle, c'est elle que tu prends en exemple.

SECTION 4 — LE POINT DIFFICILE DU TEXTE
- Une .box (lab "Le passage qui décide de la note") : le passage le plus difficile de l'extrait, expliqué entièrement, avec les termes définis dans le sens qu'ils ont ICI et l'articulation logique rendue explicite. C'est le modèle que l'élève doit pouvoir imiter.`
      + sectionsCommunes(`- "MES RÉFLEXES D'EXPLICATION" (mh) + mb ul de 4 li : formuler la thèse en une phrase avant de commencer, découper le texte par ses connecteurs, définir chaque terme dans son sens contextuel, ne jamais quitter le texte pour réciter un cours.`)
      + FOURCHETTE + REGLES_PH,
  },
];

export default { matiere, libelle, session, rubrics, subject_cards, benchmark_cards, dossier_templates };
