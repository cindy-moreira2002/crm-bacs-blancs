// =====================================================================
//  DONNEES DE LA MATIERE : PHYSIQUE-CHIMIE (specialite), session 2027
//
//  Source : ~/Downloads/Dossier_Physique_Chimie_Session_2027
//    01_PROGRAMME   -> programme_cards_physique_chimie.json
//    02_GRILLES     -> rubrics_physique_chimie.json + error_taxonomy_*.json
//    03_SUJETS      -> subject_bank_session_2027.json
//    04_CALIBRATION -> benchmark_cards_physique_chimie.json
//    06_SOURCES     -> sources_index.json
//
//  Ce que le dossier fournissait tel quel : les 4 baremes (codes, libelles,
//  points), la taxonomie des 16 erreurs, les 4 themes du programme, les 5
//  bandes de notes. Ce qui a ete redige ici parce que le dossier ne le
//  contenait pas : les descripteurs de niveau (le dossier ne donnait que
//  full / partial / zero, et seulement pour le premier bareme), les
//  system_prompt, les fiches sujets completes, les profils d'etalons et les
//  gabarits de dossier eleve. Tout est donc a faire valider par un
//  professeur de la matiere — c'est aussi l'avertissement porte par le
//  MANIFEST du dossier lui-meme.
//
//  Les 4 sujets 2026 de la banque (26-PYCJ1ME1, 26-PYCJ2ME1, 26-PYCJ1NA,
//  26-PYCJ1G11) N'ONT PAS ete installes : le dossier ne fournit que leur
//  reference, leurs champs de contenu disent explicitement « a extraire du
//  PDF officiel avant mise en production ». Une fiche sujet vide produirait
//  une correction hors sol. Les sujets ci-dessous sont des gabarits
//  d'entrainement rediges pour Les Matinees du Bac, sur les themes du
//  programme officiel, jamais presentes comme des annales.
//
//  Particularite de la matiere : les 4 epreuves sont notees SUR 20, comme
//  le francais, les SES, la SVT, l'HGGSP et l'HLP — aucune conversion
//  d'echelle n'est necessaire. En revanche le correcteur ne recoit que le
//  TEXTE transcrit : ni schema, ni graphique, ni montage, ni ecran de
//  calculatrice. C'est la limite majeure de cette matiere, elle est portee
//  dans chaque system_prompt et dans chaque gabarit de dossier.
// =====================================================================

export const matiere = 'physique-chimie';
export const libelle = 'Physique-Chimie';
export const session = 2027;

// ---------------------------------------------------------------------
//  Taxonomie d'erreurs (02_GRILLES_ET_ERREURS/error_taxonomy_*.json)
//  Elle vit dans rubric_json.common_error_taxonomy, comme pour SES, SVT,
//  HGGSP, HLP et l'histoire-geographie : la table error_taxonomy n'est
//  filtree que par exercise_type, sans colonne matiere, donc y ecrire
//  ferait fuiter des codes d'une matiere a l'autre.
//  severity : high -> major, medium -> moderate, low -> minor.
// ---------------------------------------------------------------------
const TAXONOMIE = [
  { code: 'PC-UNIT-01',  criterion: 'REA',   severity: 'major',    category: 'unites',            description: "Unite absente, incompatible ou non convertie : le resultat numerique n'a pas de sens physique tant que son unite n'est pas juste." },
  { code: 'PC-SIG-01',   criterion: 'VAL',   severity: 'minor',    category: 'chiffres_significatifs', description: "Chiffres significatifs injustifies : precision affichee sans rapport avec celle des donnees de l'enonce." },
  { code: 'PC-MODEL-01', criterion: 'ANA',   severity: 'major',    category: 'modele_non_justifie',    description: "Modele ou loi employe hors de son domaine de validite, ou applique sans justifier les hypotheses (systeme, referentiel, conditions)." },
  { code: 'PC-SIGN-01',  criterion: 'REA',   severity: 'moderate', category: 'signe_projection',  description: "Erreur de signe ou de projection vectorielle : axe choisi puis non respecte, composante inversee." },
  { code: 'PC-FORCE-01', criterion: 'ANA',   severity: 'major',    category: 'bilan_des_forces',  description: "Bilan des forces incomplet ou faux : force oubliee, force inventee, systeme etudie non defini." },
  { code: 'PC-CHEM-01',  criterion: 'REA',   severity: 'major',    category: 'equation_chimique', description: "Equation chimique non ajustee ou espece mal ecrite : la stoechiometrie qui en decoule est fausse." },
  { code: 'PC-ADV-01',   criterion: 'ANA',   severity: 'major',    category: 'avancement',        description: "Tableau d'avancement incoherent : etat initial, avancement maximal ou reactif limitant mal identifies." },
  { code: 'PC-PH-01',    criterion: 'KNOW',  severity: 'major',    category: 'ph_concentration',  description: "Confusion entre pH, concentration et quantite de matiere : grandeurs employees les unes pour les autres." },
  { code: 'PC-TITR-01',  criterion: 'ANA',   severity: 'major',    category: 'equivalence',       description: "Equivalence mal identifiee ou relation a l'equivalence fausse : la stoechiometrie du titrage n'est pas respectee." },
  { code: 'PC-KIN-01',   criterion: 'KNOW',  severity: 'moderate', category: 'cinetique',         description: "Confusion entre vitesse de reaction, temps de demi-reaction et etat d'equilibre." },
  { code: 'PC-RC-01',    criterion: 'KNOW',  severity: 'moderate', category: 'circuit_rc',        description: "Confusion charge / decharge, ou constante de temps mal lue, mal calculee ou mal interpretee." },
  { code: 'PC-ENER-01',  criterion: 'ANA',   severity: 'major',    category: 'bilan_energetique', description: "Bilan energetique conduit sans definir le systeme ni ses frontieres : transferts comptes deux fois ou oublies." },
  { code: 'PC-WAVE-01',  criterion: 'KNOW',  severity: 'major',    category: 'ondes',             description: "Confusion entre periode, frequence, longueur d'onde et celerite ; relation employee sans verifier ses grandeurs." },
  { code: 'PC-DOC-01',   criterion: 'DOC',   severity: 'moderate', category: 'paraphrase',        description: "Document paraphrase sans exploitation : la donnee est recopiee, jamais prelevee ni reliee a la question posee." },
  { code: 'PC-CONCL-01', criterion: 'COM',   severity: 'moderate', category: 'conclusion',        description: "Resultat numerique livre sans phrase de conclusion ni controle de vraisemblance." },
  { code: 'PC-TRANS-01', criterion: 'TRANSCRIPTION', severity: 'major', category: 'transcription', description: "Symbole, indice, exposant ou puissance de dix incertain dans la transcription : declenche une relecture humaine, jamais une sanction." },
  // Codes ajoutes par Les Matinees du Bac : les exercices de protocole et
  // d'ECE n'avaient aucun code dedie dans le dossier source.
  { code: 'PC-PROTO-01', criterion: 'PROC',  severity: 'major',    category: 'protocole_non_reproductible', description: "Protocole non reproductible : etapes dans le desordre, volumes ou concentrations non chiffres, verrerie non nommee." },
  { code: 'PC-SAFE-01',  criterion: 'SAFE',  severity: 'major',    category: 'securite',          description: "Securite absente ou fausse : ni EPI, ni pictogramme, ni precaution, alors que les especes manipulees l'exigent." },
  { code: 'PC-INCERT-01',criterion: 'SAFE',  severity: 'moderate', category: 'incertitudes',      description: "Incertitude ignoree ou traitee comme une erreur : sources non identifiees, resultat donne sans intervalle." },
  { code: 'PC-GRAPH-01', criterion: 'REA',   severity: 'moderate', category: 'graphique',         description: "Exploitation graphique defaillante : axes non legendes, unites absentes, lecture ou pente non justifiee." },
];

/**
 * Selectionne des codes d'erreur pour une grille donnee.
 *
 * Le champ `criterion` de la taxonomie vaut pour la grille du probleme
 * quantitatif, qui sert de reference. Les autres grilles n'ont pas les memes
 * criteres : une unite absente se paie sur REA dans un probleme, sur QUANT
 * dans une analyse documentaire, sur PROC dans un protocole. Le second
 * argument redirige le code vers le critere de CETTE grille — sans quoi le
 * correcteur recoit un code qui designe un critere inexistant.
 */
const taxoPour = (codes, versCritere = {}) =>
  TAXONOMIE.filter((e) => codes.includes(e.code)).map((e) =>
    versCritere[e.code] ? { ...e, criterion: versCritere[e.code] } : e,
  );

// ---------------------------------------------------------------------
//  Regles communes a toutes les grilles
// ---------------------------------------------------------------------
const GARDE_FOUS_COMMUNS = [
  "Tu n'inventes aucun critere en dehors de la grille.",
  "Tu ne sanctionnes pas deux fois la meme faiblesse sur deux criteres differents.",
  'Chaque score est justifie par une citation localisable dans la transcription.',
  "Tu n'inventes JAMAIS une valeur, une donnee, une loi, un resultat ou une mesure absente de la copie ou de la fiche sujet.",
  "Une erreur commise tot dans un raisonnement ne se paie qu'une fois : si la suite est menee correctement AVEC la valeur fausse, tu valorises la demarche. C'est la regle de l'evaluation par competences en physique-chimie.",
  "Tu ne recompenses pas un resultat juste tombe sans demarche, et tu ne sanctionnes pas une demarche juste au resultat numerique faux au-dela du critere REA.",
  "Le bareme propre au sujet, s'il est fourni dans la fiche sujet, prime toujours sur cette grille generique.",
  "Une erreur de transcription a fort impact declenche une relecture humaine et non une sanction.",
];

// Socle commun des system_prompt : limite de la transcription, codes
// d'erreur de la matiere, ordre des etalons. 100% ASCII comme les autres
// matieres (les prompts partent tels quels dans l'API Anthropic).
const SOCLE_PROMPT =
  "ECHELLE DE NOTATION : le bareme total de cette grille vaut 20 points. " +
  "Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, donc un nombre compris entre 0 et 20. " +
  "Les copies etalons portent la meme echelle sur 20 : comparaison directe, sans conversion. " +
  "LIMITE DETERMINANTE DE CETTE MATIERE : tu ne recois que le TEXTE transcrit de la copie. " +
  "Aucun schema, aucun graphique trace par l'eleve, aucun montage, aucun ecran de calculatrice, aucune construction geometrique ne t'est accessible. " +
  "Tu ne juges donc JAMAIS une production graphique que la transcription ne decrit pas : tu ne la devines pas, tu ne la supposes pas reussie ni ratee, tu signales qu'elle releve de la relecture du professeur et tu passes human_review_required a true si elle pese sur la note. " +
  "NOTATION DE LA TRANSCRIPTION : la copie t'arrive dans une convention texte fixee, que tu lis sans jamais la reprocher a l'eleve. " +
  "10^-2 est une puissance de dix, x^2 un carre ; C_B, v_0, u_(n+1) sont des indices ; ( a ) / ( b ) est une fraction ; sqrt( ... ) une racine ; " +
  "vec(F) est un vecteur ; -> est une reaction totale et <=> un equilibre ; (aq), (s), (l), (g) sont les etats physiques. " +
  "Les formules chimiques restent sur la ligne (H2SO4, Cu2+, HO-). Ces ecritures sont le fait du transcripteur, PAS de l'eleve : elles ne sont ni une faute de forme ni un manque de rigueur. " +
  "[SCHEMA non transcrit], [GRAPHIQUE non transcrit] et [MONTAGE non transcrit] signalent une production graphique que tu n'as pas vue : tu ne la juges pas, tu passes human_review_required a true si elle pese sur la note. " +
  "[illisible], [rature] et [marge] sont des marques du transcripteur, jamais des erreurs de l'eleve. " +
  "Si la transcription signale un doute sur un chiffre, un exposant, un indice ou une unite, tu retiens la lecture la PLUS FAVORABLE a l'eleve et tu passes human_review_required a true. " +
  "CODES D'ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille de physique-chimie fournie (PC-xxx-nn). " +
  "Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d'une autre matiere. " +
  "ETALONS : les copies etalons servent a situer le niveau global. Le champ benchmark_comparison.lower_or_equal_id doit designer l'etalon dont la note est INFERIEURE OU EGALE a celle que tu attribues, et upper_or_equal_id celui dont la note est SUPERIEURE OU EGALE. " +
  "Methode imposee : classe d'abord les etalons par note croissante, place ta note dans ce classement, puis prends l'etalon immediatement en dessous et celui immediatement au-dessus. " +
  "Exemple : etalons a 3, 7, 11, 14 et 18, note attribuee 11,75 -> lower_or_equal_id est l'etalon a 11 et upper_or_equal_id l'etalon a 14. " +
  "Verifie l'ordre avant de repondre : la note de lower_or_equal_id ne peut JAMAIS etre superieure a la tienne, ni celle de upper_or_equal_id inferieure. " +
  "Si aucun etalon n'encadre la note d'un cote, reprends l'etalon le plus proche de ce cote et dis-le dans explanation.";

// ---------------------------------------------------------------------
//  1) LES 4 GRILLES
//     Codes, libelles et points repris a l'identique du dossier source
//     (PC-WRITTEN-PROBLEM, PC-WRITTEN-DOC, PC-PROTOCOL, PC-ECE).
// ---------------------------------------------------------------------
export const rubrics = [
  {
    id: 'PC_PROBLEME_V1',
    track: 'generale',
    exercise_type: 'pc_probleme',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de physique-chimie en terminale generale, specialite physique-chimie. " +
      "Tu corriges un probleme quantitatif : l'eleve doit s'approprier une situation, choisir un modele, mener un calcul et controler son resultat. " +
      "Tu evalues par COMPETENCES, pas question par question : une meme competence se juge sur l'ensemble de la copie. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire la copie ideale. " +
      "Tu valorises toute demarche coherente, meme si une erreur numerique locale la rend fausse : une erreur ne se paie qu'une fois. " +
      "Tu exiges que le systeme etudie, le referentiel et les hypotheses soient poses avant d'appliquer une loi. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la transcription est incertaine sur un symbole, un indice ou une puissance de dix, si la copie repose sur un schema non transcrit, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un probleme de physique-chimie se juge sur une demarche : la situation est comprise, un modele est choisi et justifie, le calcul est mene proprement, le resultat est controle et enonce.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 competences et leurs points du dossier Physique-Chimie session 2027 (PC-WRITTEN-PROBLEM) : APP 3, ANA 6, REA 5, VAL 3, COM 3. Les ancres full/partial/zero du dossier ont ete developpees en descripteurs de niveau par Les Matinees du Bac.",
      criteria: [
        {
          code: 'APP',
          name: "S'approprier",
          maximum_score: 3,
          description:
            "Comprendre la situation : reperer les donnees utiles, identifier l'inconnue, definir le systeme et le referentiel, traduire l'enonce en grandeurs physiques. Recopier les donnees n'est pas s'approprier.",
          levels: {
            '0': 'Copie blanche, ou situation totalement hors sujet.',
            '0.75': "Insuffisant : les donnees sont recopiees sans tri, l'inconnue n'est pas identifiee, le systeme n'est jamais defini.",
            '1.5': "Fragile : la question est comprise globalement mais le systeme, le referentiel ou les conditions initiales restent implicites.",
            '2.25': "Satisfaisant : donnees utiles triees, inconnue nommee, systeme et referentiel poses.",
            '3': "Tres satisfaisant : la situation est reformulee avec ses hypotheses, ses grandeurs et leurs unites ; le schema de la situation est decrit en mots quand il existe.",
          },
        },
        {
          code: 'ANA',
          name: 'Analyser / raisonner',
          maximum_score: 6,
          description:
            "Choisir une strategie et la justifier : quelle loi, pourquoi elle s'applique ici, dans quel ordre. C'est le coeur de la note — un resultat juste sans strategie explicite ne rapporte pas ces points.",
          levels: {
            '0': 'Aucune demarche exploitable.',
            '1.5': "Insuffisant : formules posees au hasard, sans lien avec la situation ; loi employee hors de son domaine de validite.",
            '3': "Fragile : une idee juste apparait mais le raisonnement se rompt — etapes manquantes, hypotheses jamais enoncees, enchainement non justifie.",
            '4.5': "Satisfaisant : strategie coherente et annoncee, lois pertinentes, justification presente meme si une etape reste elliptique.",
            '6': "Tres satisfaisant : strategie explicite du debut a la fin, hypotheses discutees, choix du modele argumente, chemin le plus economique retenu.",
          },
        },
        {
          code: 'REA',
          name: 'Realiser',
          maximum_score: 5,
          description:
            "Executer : algebre menee jusqu'a l'expression litterale, application numerique, conversions, exploitation d'un graphique ou d'un tableau. On juge l'execution, pas le choix de la methode.",
          levels: {
            '0': 'Aucun resultat exploitable.',
            '1.25': "Insuffisant : calculs faux des la premiere ligne, unites absentes, expression litterale jamais etablie.",
            '2.5': "Fragile : erreurs locales repetees (signes, conversions, puissances de dix) qui faussent les resultats, mais la mecanique du calcul est visible.",
            '3.75': "Satisfaisant : expression litterale correcte, application numerique juste, une erreur locale sans consequence sur la suite.",
            '5': "Tres satisfaisant : litteral d'abord, numerique ensuite, unites suivies a chaque ligne, exploitation graphique ou tabulaire menee proprement.",
          },
        },
        {
          code: 'VAL',
          name: 'Valider',
          maximum_score: 3,
          description:
            "Controler : ordre de grandeur, homogeneite, coherence avec l'enonce, chiffres significatifs, sens physique du resultat. Un controle est une phrase qui compare, pas un « le resultat est coherent » sans reference.",
          levels: {
            '0': "Aucun controle, meme implicite.",
            '0.75': "Insuffisant : resultat aberrant conserve sans reaction (masse negative, vitesse superieure a c, pH hors echelle).",
            '1.5': "Fragile : controle annonce mais non conduit, ou limite aux chiffres significatifs.",
            '2.25': "Satisfaisant : homogeneite ou ordre de grandeur verifie, coherence avec les donnees discutee.",
            '3': "Tres satisfaisant : controle complet — homogeneite, ordre de grandeur, precision et sens physique — avec la reference a laquelle le resultat est compare.",
          },
        },
        {
          code: 'COM',
          name: 'Communiquer',
          maximum_score: 3,
          description:
            "Se faire comprendre : symboles definis, notations constantes, etapes lisibles, conclusion redigee qui repond a la question posee. On n'y juge pas la justesse, deja jugee ailleurs.",
          levels: {
            '0': 'Production illisible ou ininterpretable.',
            '0.75': "Insuffisant : suite de nombres sans phrase, symboles non definis, aucune conclusion.",
            '1.5': "Fragile : comprehensible mais lacunaire — notations qui changent en cours de route, resultat non encadre ni enonce.",
            '2.25': "Satisfaisant : demarche lisible, symboles definis, conclusion presente et repondant a la question.",
            '3': "Tres satisfaisant : redaction claire et economique, chaque etape annoncee, resultat mis en evidence avec son unite et sa precision.",
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Une erreur numerique locale n'invalide pas la strategie : elle se paie sur REA, jamais sur ANA.",
        "Un resultat juste obtenu sans aucune justification ne rapporte pas les points d'ANA.",
        "Tu ne juges aucun schema ou graphique trace par l'eleve : ils ne sont pas transcrits.",
      ],
      // Grille de reference : les criteres de la taxonomie s'appliquent tels
      // quels, sauf les 3 codes de connaissances (pas de critere KNOW ici —
      // une notion confondue se paie sur le raisonnement).
      common_error_taxonomy: taxoPour([
        'PC-UNIT-01', 'PC-SIG-01', 'PC-MODEL-01', 'PC-SIGN-01', 'PC-FORCE-01', 'PC-CHEM-01',
        'PC-ADV-01', 'PC-PH-01', 'PC-TITR-01', 'PC-KIN-01', 'PC-ENER-01', 'PC-WAVE-01',
        'PC-CONCL-01', 'PC-GRAPH-01', 'PC-TRANS-01',
      ], { 'PC-PH-01': 'ANA', 'PC-KIN-01': 'ANA', 'PC-WAVE-01': 'ANA' }),
    },
  },

  {
    id: 'PC_DOC_V1',
    track: 'generale',
    exercise_type: 'pc_analyse_documentaire',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de physique-chimie en terminale generale, specialite physique-chimie. " +
      "Tu corriges une analyse documentaire argumentee : l'eleve dispose de documents et doit construire une reponse en croisant les donnees prelevees et ses connaissances. " +
      "La paraphrase est la faute centrale de cet exercice : un document recopie sans etre exploite ne rapporte pas de points. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire la copie ideale. " +
      "Tu ne reproches jamais a l'eleve de ne pas avoir vu ce qui ne figure pas dans les documents tels qu'ils sont decrits dans la fiche sujet. " +
      "Tu attends un traitement quantitatif meme sommaire (un ordre de grandeur, une lecture chiffree, un rapport) : une argumentation purement verbale plafonne. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la transcription est incertaine, si la reponse repose sur une lecture graphique non transcrite, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Une analyse documentaire se juge sur un croisement : les donnees utiles sont prelevees et citees, les connaissances les expliquent, l'argumentation conclut, et le chiffre vient etayer le raisonnement.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 criteres et leurs points du dossier Physique-Chimie session 2027 (PC-WRITTEN-DOC) : DOC 5, KNOW 5, ARG 5, QUANT 3, COM 2. Le dossier ne fournissait aucun descripteur de niveau ; ils ont ete rediges par Les Matinees du Bac.",
      criteria: [
        {
          code: 'DOC',
          name: 'Exploitation des documents',
          maximum_score: 5,
          description:
            "Prelever les donnees reellement utiles, les citer avec precision (valeur, unite, document d'origine) et les relier a la question. Recopier un document n'est pas l'exploiter.",
          levels: {
            '0': "Aucun prelevement dans les documents.",
            '1.25': "Insuffisant : documents recopies en bloc ou totalement ignores.",
            '2.5': "Fragile : quelques donnees citees mais mal choisies, sans unite ou sans origine, jamais reliees a la question.",
            '3.75': "Satisfaisant : donnees pertinentes prelevees, citees avec leur unite et leur document, et reliees au propos.",
            '5': "Tres satisfaisant : prelevements hierarchises, croisement entre plusieurs documents, chaque donnee mise au service d'une etape du raisonnement.",
          },
        },
        {
          code: 'KNOW',
          name: 'Connaissances et modeles',
          maximum_score: 5,
          description:
            "Mobiliser les lois, modeles et definitions du programme utiles a la question, et les employer correctement. On juge la pertinence et l'exactitude, pas la quantite recitee.",
          levels: {
            '0': 'Aucune connaissance recevable.',
            '1.25': "Insuffisant : notions fausses ou confondues (pH et concentration, periode et frequence, charge et decharge).",
            '2.5': "Fragile : connaissances exactes mais partielles, recitees a cote de la question sans etre mises au travail.",
            '3.75': "Satisfaisant : les lois et modeles attendus sont la, exacts, employes a bon escient.",
            '5': "Tres satisfaisant : modeles precis, domaine de validite discute, connaissances entierement mises au service de la question posee.",
          },
        },
        {
          code: 'ARG',
          name: 'Argumentation',
          maximum_score: 5,
          description:
            "Construire une reponse : une position claire, des etapes qui s'enchainent, des donnees qui prouvent, une conclusion qui repond. Une juxtaposition d'informations exactes n'est pas une argumentation.",
          levels: {
            '0': "Aucune argumentation : reponse absente ou sans rapport.",
            '1.25': "Insuffisant : affirmations sans preuve, ou informations juxtaposees sans conclusion.",
            '2.5': "Fragile : un fil apparait mais se rompt ; la conclusion ne decoule pas de ce qui precede.",
            '3.75': "Satisfaisant : raisonnement structure, appuye sur les documents, conclusion explicite qui repond a la question.",
            '5': "Tres satisfaisant : demonstration progressive, objections ou limites envisagees, conclusion nuancee et fondee.",
          },
        },
        {
          code: 'QUANT',
          name: 'Traitement quantitatif',
          maximum_score: 3,
          description:
            "Chiffrer : lecture graphique, calcul d'ordre de grandeur, conversion, comparaison de valeurs, exploitation d'une pente ou d'une constante de temps. Une argumentation sans chiffre plafonne ici.",
          levels: {
            '0': 'Aucun element chiffre.',
            '0.75': "Insuffisant : chiffres recopies sans traitement, unites absentes ou fausses.",
            '1.5': "Fragile : un calcul est tente mais incomplet, non conclu ou entache d'une erreur d'unite.",
            '2.25': "Satisfaisant : au moins un traitement quantitatif juste, avec unite, exploite dans l'argumentation.",
            '3': "Tres satisfaisant : traitement quantitatif complet, ordre de grandeur controle, precision discutee, chiffre reellement decisif pour la conclusion.",
          },
        },
        {
          code: 'COM',
          name: 'Communication',
          maximum_score: 2,
          description:
            "Reponse organisee, lisible, avec un vocabulaire scientifique exact et des references claires aux documents.",
          levels: {
            '0': 'Reponse inintelligible ou non redigee.',
            '0.5': "Insuffisant : style telegraphique, aucune organisation, documents jamais nommes.",
            '1': 'Fragile : organisation confuse, vocabulaire approximatif.',
            '1.5': 'Satisfaisant : reponse organisee, claire, vocabulaire scientifique correct.',
            '2': "Tres satisfaisant : redaction fluide, references aux documents systematiques, vocabulaire exact.",
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "La paraphrase se sanctionne sur le critere DOC, pas une seconde fois sur ARG.",
        "Tu ne reproches pas a l'eleve un element absent des documents tels qu'ils sont decrits dans la fiche sujet.",
        "Une lecture graphique que la transcription ne rapporte pas ne peut etre ni creditee ni sanctionnee : elle se signale.",
      ],
      // Pas de critere REA ni VAL ici : tout ce qui est chiffre se paie sur
      // QUANT, tout ce qui releve du modele sur KNOW.
      common_error_taxonomy: taxoPour([
        'PC-DOC-01', 'PC-UNIT-01', 'PC-SIG-01', 'PC-MODEL-01', 'PC-PH-01', 'PC-KIN-01',
        'PC-RC-01', 'PC-ENER-01', 'PC-WAVE-01', 'PC-GRAPH-01', 'PC-CONCL-01', 'PC-TRANS-01',
      ], {
        'PC-UNIT-01': 'QUANT', 'PC-SIG-01': 'QUANT', 'PC-GRAPH-01': 'QUANT',
        'PC-MODEL-01': 'KNOW', 'PC-ENER-01': 'KNOW',
      }),
    },
  },

  {
    id: 'PC_PROTOCOLE_V1',
    track: 'generale',
    exercise_type: 'pc_protocole',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de physique-chimie en terminale generale, specialite physique-chimie. " +
      "Tu corriges un protocole experimental ECRIT : l'eleve n'a rien manipule, il a redige la marche a suivre qui permettrait de repondre a une question experimentale. " +
      "Le critere decisif est la REPRODUCTIBILITE : un autre eleve doit pouvoir executer le protocole sans rien deviner. Verrerie nommee, volumes et concentrations chiffres, ordre des etapes explicite. " +
      "Tu appliques exclusivement la grille fournie et tu evalues le protocole reellement propose, sans reconstruire le protocole ideal : plusieurs protocoles differents peuvent etre justes. " +
      "Tu exiges la securite (EPI, pictogrammes, precautions) et un mot sur les incertitudes des que les especes ou les mesures l'imposent. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la copie renvoie a un schema de montage non transcrit, si la transcription est incertaine, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un protocole se juge sur son execution possible : l'objectif est pose, le materiel est nomme, les etapes sont chiffrees et ordonnees, la securite est prise, et l'exploitation attendue est annoncee.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 criteres et leurs points du dossier Physique-Chimie session 2027 (PC-PROTOCOL) : OBJ 3, MAT 4, PROC 5, SAFE 4, EXP 4. Le dossier ne fournissait aucun descripteur de niveau ; ils ont ete rediges par Les Matinees du Bac.",
      criteria: [
        {
          code: 'OBJ',
          name: 'Objectif et principe',
          maximum_score: 3,
          description:
            "Enoncer ce que le protocole doit determiner et sur quel principe physique ou chimique il repose (reaction support, loi exploitee, grandeur mesuree).",
          levels: {
            '0': "Ni objectif ni principe.",
            '0.75': "Insuffisant : l'objectif est recopie de l'enonce, aucun principe n'est nomme.",
            '1.5': "Fragile : objectif clair mais principe implicite, ou principe inadapte a la grandeur cherchee.",
            '2.25': "Satisfaisant : objectif et principe enonces, reaction support ou loi exploitee identifiee.",
            '3': "Tres satisfaisant : principe justifie — pourquoi cette methode plutot qu'une autre pour cette grandeur et cette precision.",
          },
        },
        {
          code: 'MAT',
          name: 'Materiel et montage',
          maximum_score: 4,
          description:
            "Nommer la verrerie et les appareils avec leur precision (pipette jaugee, burette graduee, fiole jaugee, conductimetre, spectrophotometre), et decrire le montage en mots.",
          levels: {
            '0': 'Aucun materiel nomme.',
            '1': "Insuffisant : materiel generique (« un recipient », « un appareil »), verrerie jaugee et graduee confondues.",
            '2': "Fragile : materiel liste mais incomplet ou sans volume, montage non decrit.",
            '3': "Satisfaisant : verrerie adaptee et nommee avec ses volumes, appareils identifies, montage decrit.",
            '4': "Tres satisfaisant : choix de la verrerie justifie par la precision recherchee, montage decrit assez precisement pour etre reproduit sans schema.",
          },
        },
        {
          code: 'PROC',
          name: 'Etapes operatoires',
          maximum_score: 5,
          description:
            "Ordonner les operations, chiffrer les volumes, masses et concentrations, preciser les conditions (agitation, temperature, rincage, dilution). C'est ici que se joue la reproductibilite.",
          levels: {
            '0': "Aucune etape operatoire.",
            '1.25': "Insuffisant : etapes dans le desordre ou reduites a une intention (« on dose »), aucune valeur chiffree.",
            '2.5': "Fragile : enchainement globalement correct mais des valeurs manquent ; un autre eleve devrait deviner.",
            '3.75': "Satisfaisant : etapes ordonnees et chiffrees, conditions principales precisees, protocole executable.",
            '5': "Tres satisfaisant : protocole entierement reproductible — chaque volume, concentration et condition est donne, les points delicats (rincage, dilution, reperage de l'equivalence) sont anticipes.",
          },
        },
        {
          code: 'SAFE',
          name: 'Securite et incertitudes',
          maximum_score: 4,
          description:
            "Prendre les precautions imposees par les especes manipulees (EPI, pictogrammes, hotte, dilution des acides) et dire d'ou vient l'incertitude sur le resultat.",
          levels: {
            '0': "Ni securite ni incertitude.",
            '1': "Insuffisant : aucune precaution alors que les especes en exigent, ou consigne fausse (verser l'eau dans l'acide).",
            '2': "Fragile : securite reduite a « porter des gants », incertitude evoquee sans source identifiee.",
            '3': "Satisfaisant : EPI et precautions adaptees aux especes citees, au moins une source d'incertitude identifiee.",
            '4': "Tres satisfaisant : securite argumentee a partir des pictogrammes, sources d'incertitude hierarchisees et effet sur le resultat annonce.",
          },
        },
        {
          code: 'EXP',
          name: 'Exploitation attendue',
          maximum_score: 4,
          description:
            "Annoncer ce qu'on fera des mesures : relation utilisee, grandeur calculee, controle prevu, critere de reussite. Un protocole sans exploitation ne repond pas a la question.",
          levels: {
            '0': "Aucune exploitation annoncee.",
            '1': "Insuffisant : les mesures sont faites mais rien n'indique ce qu'on en tire.",
            '2': "Fragile : relation evoquee sans etre ecrite, ou exploitation qui ne donne pas la grandeur cherchee.",
            '3': "Satisfaisant : relation ecrite, grandeur cherchee calculable a partir des mesures prevues.",
            '4': "Tres satisfaisant : exploitation complete — relation, unites, controle de vraisemblance et critere de reussite du protocole.",
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Plusieurs protocoles differents peuvent etre corrects : tu evalues celui qui est propose, jamais l'ecart a celui que tu aurais ecrit.",
        "Un schema de montage annonce mais non transcrit ne se sanctionne pas : il se signale et declenche une relecture.",
      ],
      // Grille sans REA/ANA/COM : ce qui n'est pas chiffre se paie sur les
      // etapes (PROC), ce qui releve du principe sur OBJ, ce qu'on fera des
      // mesures sur EXP.
      common_error_taxonomy: taxoPour([
        'PC-PROTO-01', 'PC-SAFE-01', 'PC-INCERT-01', 'PC-UNIT-01', 'PC-CHEM-01',
        'PC-TITR-01', 'PC-PH-01', 'PC-CONCL-01', 'PC-TRANS-01',
      ], {
        'PC-UNIT-01': 'PROC', 'PC-CHEM-01': 'OBJ', 'PC-PH-01': 'OBJ',
        'PC-TITR-01': 'EXP', 'PC-CONCL-01': 'EXP',
      }),
    },
  },

  {
    id: 'PC_ECE_V1',
    track: 'generale',
    exercise_type: 'pc_ece',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de physique-chimie en terminale generale, specialite physique-chimie. " +
      "Tu corriges le COMPTE RENDU ECRIT d'une evaluation des competences experimentales (ECE). " +
      "AVERTISSEMENT DETERMINANT : l'ECE reelle s'evalue en salle, devant l'eleve, sur des gestes que tu ne vois pas. Tu ne recois que le texte que l'eleve a ecrit. " +
      "Tu n'evalues donc JAMAIS le geste experimental, le montage realise, la manipulation de la verrerie ni le soin : tu evalues ce que la copie ecrite demontre du raisonnement et de l'exploitation. " +
      "Tu passes human_review_required a true dans TOUS les cas : cette correction est une aide a l'evaluation du professeur, jamais une note d'ECE. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Le compte rendu d'ECE se juge sur ce qui est ecrit : la situation est comprise, la strategie experimentale est choisie et justifiee, les mesures sont exploitees, le resultat est valide et communique. Le geste ne s'evalue pas a distance.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Reprend a l'identique les 5 competences et leurs points du dossier Physique-Chimie session 2027 (PC-ECE) : APP 3, ANA 4, REA 7, VAL 4, COM 2, avec human_review_required impose par le dossier source.",
      human_review_required: true,
      criteria: [
        {
          code: 'APP',
          name: "S'approprier",
          maximum_score: 3,
          description:
            "Comprendre la question experimentale posee : grandeur a determiner, contraintes du materiel disponible, donnees fournies.",
          levels: {
            '0': "Rien d'exploitable.",
            '0.75': "Insuffisant : la question experimentale n'est pas reformulee, le materiel disponible est ignore.",
            '1.5': "Fragile : question comprise mais contraintes du materiel ou donnees fournies non prises en compte.",
            '2.25': "Satisfaisant : grandeur cherchee identifiee, materiel et donnees pris en compte.",
            '3': "Tres satisfaisant : la question est reformulee avec ses contraintes, et la precision attendue est anticipee.",
          },
        },
        {
          code: 'ANA',
          name: 'Analyser',
          maximum_score: 4,
          description:
            "Choisir une strategie experimentale et la justifier : quelle mesure, avec quel appareil, pourquoi celle-la, dans quel ordre.",
          levels: {
            '0': 'Aucune strategie.',
            '1': "Insuffisant : suite de gestes sans logique, ou strategie qui ne donne pas la grandeur cherchee.",
            '2': "Fragile : strategie plausible mais non justifiee, choix du materiel non argumente.",
            '3': "Satisfaisant : strategie coherente, annoncee, adaptee au materiel disponible.",
            '4': "Tres satisfaisant : strategie justifiee, alternative ecartee avec argument, precision anticipee.",
          },
        },
        {
          code: 'REA',
          name: 'Realiser',
          maximum_score: 7,
          description:
            "Ce que le compte rendu ECRIT montre de la realisation : mesures relevees et notees avec unites, tableau tenu, calculs menes, exploitation graphique decrite. Le geste lui-meme n'est pas observable a distance.",
          levels: {
            '0': "Aucune mesure ni calcul rapporte.",
            '1.75': "Insuffisant : valeurs isolees sans unite ni organisation, calculs absents ou faux des le depart.",
            '3.5': "Fragile : mesures notees mais mal organisees, calculs entames et non conclus, unites flottantes.",
            '5.25': "Satisfaisant : mesures completes avec unites, calculs menes jusqu'au resultat, exploitation lisible.",
            '7': "Tres satisfaisant : releve organise, calculs conduits proprement du litteral au numerique, exploitation (pente, moyenne, equivalence) menee et decrite.",
          },
        },
        {
          code: 'VAL',
          name: 'Valider',
          maximum_score: 4,
          description:
            "Controler le resultat experimental : comparaison a une valeur de reference, incertitude, sources d'ecart, conclusion sur la validite de la mesure.",
          levels: {
            '0': "Aucun controle.",
            '1': "Insuffisant : resultat livre brut, ecart a la reference ignore.",
            '2': "Fragile : ecart signale sans etre explique, incertitude evoquee sans source.",
            '3': "Satisfaisant : comparaison a la reference conduite, une source d'ecart identifiee.",
            '4': "Tres satisfaisant : incertitude estimee, sources d'ecart hierarchisees, conclusion argumentee sur la validite de la mesure.",
          },
        },
        {
          code: 'COM',
          name: 'Communiquer',
          maximum_score: 2,
          description:
            "Compte rendu lisible : etapes annoncees, grandeurs nommees et unites systematiques, conclusion qui repond a la question experimentale.",
          levels: {
            '0': 'Compte rendu inintelligible.',
            '0.5': "Insuffisant : notes en vrac, aucune conclusion.",
            '1': 'Fragile : lisible mais desorganise, unites irregulieres.',
            '1.5': 'Satisfaisant : compte rendu structure, unites presentes, conclusion redigee.',
            '2': "Tres satisfaisant : compte rendu clair et complet, resultat mis en evidence avec son incertitude.",
          },
        },
      ],
      guardrails: [
        ...GARDE_FOUS_COMMUNS,
        "Tu n'evalues jamais le geste experimental, le montage ou le soin : ils ne sont pas observables dans un texte transcrit.",
        "human_review_required vaut toujours true pour cet exercice : la note d'ECE appartient au professeur present en salle.",
      ],
      // PC-SAFE-01 est volontairement absent : la securite se juge sur le
      // geste, en salle, et le geste n'est pas transcrit.
      common_error_taxonomy: taxoPour([
        'PC-INCERT-01', 'PC-UNIT-01', 'PC-SIG-01', 'PC-GRAPH-01', 'PC-TITR-01',
        'PC-KIN-01', 'PC-CONCL-01', 'PC-TRANS-01',
      ], { 'PC-INCERT-01': 'VAL', 'PC-KIN-01': 'ANA' }),
    },
  },
];

// ---------------------------------------------------------------------
//  2) LES SUJETS
//     card_json.exercise et card_json.work composent le libelle du menu
//     de depot cote CRM (libelleSujet dans src/lib/pipeline.ts).
//     Themes et notions repris du programme officiel (PC-T1 a PC-T4).
// ---------------------------------------------------------------------
const AVERTISSEMENT_SUJET =
  "Gabarit synthetique d'entrainement au format de l'epreuve, pas un sujet officiel ni une annale reproduite.";

const SOURCES_PC = ['PC-PROG-T', 'PC-DEF-EPR', 'PC-RES'];

export const subject_cards = [
  {
    id: 'PC2027_PROB_01',
    track: 'generale',
    exercise_type: 'pc_probleme',
    work_id: 'PC_T1_TITRAGE_BOISSON',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-SYN-ACIDBASE-01',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Problème quantitatif',
      work: "Dosage de l'acide citrique d'une boisson par titrage acido-basique",
      field: 'Chimie · Terminale · Constitution et transformations de la matière',
      level: 'terminale',
      theme_id: 'PC-T1',
      theme_title: 'Constitution et transformations de la matière',
      prompt:
        "Une boisson au citron porte l'indication « acidité totale exprimée en acide citrique : 5,0 g/L ». On dilue 10 fois la boisson, puis on titre V_A = 20,0 mL de la solution diluée par une solution d'hydroxyde de sodium de concentration C_B = 1,0 × 10⁻² mol/L. L'équivalence est repérée pour un volume versé V_E = 12,8 mL. Déterminer la concentration en acide citrique de la boisson et dire si l'indication portée sur l'étiquette est justifiée.",
      document_requirements:
        "données fournies avec le sujet : masse molaire de l'acide citrique M = 192 g/mol, équation support du titrage, courbe pH = f(V) donnant l'équivalence. La courbe n'est PAS transcrite : le correcteur ne juge que ce que l'élève en écrit.",
      documents: [
        {
          id: 'DOC_1',
          titre: 'Données du sujet',
          nature: 'tableau de données',
          contenu:
            "Masse molaire de l'acide citrique C6H8O7 : M = 192 g/mol. Concentration de la solution titrante d'hydroxyde de sodium : C_B = 1,0 x 10^-2 mol/L. Volume de solution diluée titré : V_A = 20,0 mL. Facteur de dilution appliqué à la boisson : 10. Indication de l'étiquette : acidité totale exprimée en acide citrique, 5,0 g/L.",
        },
        {
          id: 'DOC_2',
          titre: 'Équation support du titrage',
          nature: 'équation chimique',
          contenu:
            "Le titrage porte sur les trois acidités de l'acide citrique : C6H8O7 (aq) + 3 HO- (aq) -> C6H5O7^3- (aq) + 3 H2O (l). Le facteur stoechiométrique 3 est donc donné à l'élève : ne pas l'employer est une faute de lecture du document, pas une lacune de connaissance.",
        },
        {
          id: 'DOC_3',
          titre: 'Courbe pH = f(V)',
          nature: 'graphique',
          contenu:
            "Courbe de suivi pH-métrique présentant un saut de pH unique. Le volume à l'équivalence, V_E = 12,8 mL, est déjà lu et donné dans l'énoncé : l'élève n'a pas à l'extraire du graphique. Le tracé lui-même n'est pas accessible au correcteur automatique.",
        },
      ],
      expected_concepts: [
        'titrage acido-basique', 'équivalence', 'facteur de dilution', 'concentration molaire',
        'concentration massique', 'masse molaire', 'quantité de matière', 'stœchiométrie',
      ],
      expected_mechanisms: [
        "À l'équivalence, les réactifs sont introduits dans les proportions stœchiométriques : la relation entre quantités de matière découle de l'équation support, ici un triacide qui impose un facteur 3 si le titrage porte sur les trois acidités.",
        "n(base versée) = C_B × V_E permet de remonter à la quantité d'acide titré, donc à la concentration de la solution diluée.",
        "Le facteur de dilution (×10) doit être appliqué pour revenir à la boisson : oublier cette étape divise le résultat par dix.",
        "La conversion concentration molaire → concentration massique se fait par la masse molaire : C_m = C × M, seul moyen de comparer à l'étiquette exprimée en g/L.",
        "La comparaison finale à 5,0 g/L doit être conduite en ordre de grandeur et conclue par une phrase.",
      ],
      traps: [
        "oublier le facteur de dilution et conclure sur la solution diluée",
        "ignorer la stœchiométrie du triacide et écrire n(acide) = n(base)",
        "confondre concentration molaire (mol/L) et concentration massique (g/L)",
        "donner le résultat avec cinq chiffres significatifs alors que les données en portent deux",
        "conclure « c'est cohérent » sans comparer les deux valeurs chiffrées",
      ],
      special_criteria: [
        "la relation à l'équivalence doit être écrite avant toute application numérique",
        "le facteur de dilution doit apparaître explicitement",
        "la conclusion doit comparer une valeur calculée à la valeur de l'étiquette, avec unité",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_PROB_02',
    track: 'generale',
    exercise_type: 'pc_probleme',
    work_id: 'PC_T2_CHAMP_UNIFORME',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-EP-GEN-MODEL-02',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Problème quantitatif',
      work: "Mouvement d'un ballon dans le champ de pesanteur : le tir cadré",
      field: 'Physique · Terminale · Mouvement et interactions',
      level: 'terminale',
      theme_id: 'PC-T2',
      theme_title: 'Mouvement et interactions',
      prompt:
        "Un joueur frappe un ballon depuis le sol avec une vitesse initiale de valeur v₀ = 12 m/s faisant un angle α = 35° avec l'horizontale. Le but se trouve à une distance d = 13 m et sa barre transversale est à la hauteur h = 2,4 m. En négligeant les frottements de l'air, déterminer si le ballon passe sous la barre transversale. Discuter la validité de l'hypothèse faite sur les frottements.",
      document_requirements:
        "données fournies avec le sujet : g = 9,81 m/s², masse du ballon m = 0,43 kg. Un schéma de la situation figure sur le sujet ; il n'est PAS transcrit dans la copie corrigée automatiquement.",
      documents: [
        {
          id: 'DOC_1',
          titre: 'Données du sujet',
          nature: 'tableau de données',
          contenu:
            "Intensité de la pesanteur : g = 9,81 m/s^2. Masse du ballon : m = 0,43 kg. Vitesse initiale : v_0 = 12 m/s. Angle de tir avec l'horizontale : alpha = 35 degrés. Distance au but : d = 13 m. Hauteur de la barre transversale : h = 2,4 m. Le ballon part du sol.",
        },
        {
          id: 'DOC_2',
          titre: 'Schéma de la situation',
          nature: 'schéma',
          contenu:
            "Schéma de profil : le ballon au sol à l'origine, le vecteur vitesse initiale incliné de alpha vers la droite, le but à la distance d, la barre transversale à la hauteur h. Les axes ne sont PAS imposés : l'élève choisit son repère, et tout choix cohérent est recevable. Le tracé n'est pas accessible au correcteur automatique.",
        },
      ],
      expected_concepts: [
        'référentiel', 'système', 'bilan des forces', 'deuxième loi de Newton',
        'accélération', 'équations horaires', 'trajectoire', 'projection sur les axes', 'chute libre',
      ],
      expected_mechanisms: [
        "Le système (le ballon) et le référentiel (terrestre supposé galiléen) doivent être posés avant toute loi.",
        "Frottements négligés : la seule force est le poids, donc l'accélération vaut g, dirigée vers le bas — c'est ce qui autorise le modèle de la chute libre.",
        "La deuxième loi de Newton projetée sur deux axes donne a_x = 0 et a_y = −g, puis par intégrations successives les équations horaires x(t) et y(t) avec les conditions initiales.",
        "L'élimination du temps entre x(t) et y(t) fournit l'équation de la trajectoire y(x), seule voie pour répondre à la question posée à x = d.",
        "La comparaison de y(d) à h conclut ; la discussion des frottements doit dire dans quel sens l'hypothèse déplace le résultat.",
      ],
      traps: [
        "oublier de définir le système et le référentiel avant d'appliquer la deuxième loi de Newton",
        "faire intervenir la masse dans le résultat alors qu'elle se simplifie en chute libre",
        "erreur de signe sur l'axe vertical, ou projection de v₀ inversée entre cosinus et sinus",
        "travailler en degrés/radians sans cohérence avec la calculatrice",
        "conclure sans comparer y(d) à la hauteur h, ou sans phrase de conclusion",
      ],
      special_criteria: [
        "le bilan des forces et l'hypothèse « frottements négligés » doivent être explicites",
        "l'expression littérale de y(x) est attendue avant toute application numérique",
        "la discussion finale sur les frottements fait partie du critère VAL",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_PROB_03',
    track: 'generale',
    exercise_type: 'pc_probleme',
    work_id: 'PC_T3_BILAN_ENERGETIQUE',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-EP-GEN-MODEL-03',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Problème quantitatif',
      work: "Bilan énergétique d'un chauffe-eau : durée de chauffe et rendement",
      field: "Physique · Terminale · L'énergie : conversions et transferts",
      level: 'terminale',
      theme_id: 'PC-T3',
      theme_title: "L'énergie : conversions et transferts",
      prompt:
        "Un chauffe-eau contient V = 150 L d'eau initialement à θ₁ = 15 °C. Sa résistance chauffante est alimentée sous U = 230 V et parcourue par un courant d'intensité I = 9,0 A. On souhaite porter l'eau à θ₂ = 60 °C. Déterminer la durée théorique de chauffe, puis la durée réelle sachant que les pertes thermiques représentent 12 % de l'énergie fournie. Commenter le résultat.",
      document_requirements:
        "données fournies avec le sujet : capacité thermique massique de l'eau c = 4,18 × 10³ J·kg⁻¹·K⁻¹, masse volumique de l'eau ρ = 1,0 kg/L.",
      documents: [
        {
          id: 'DOC_1',
          titre: 'Données du sujet',
          nature: 'tableau de données',
          contenu:
            "Capacité thermique massique de l'eau : c = 4,18 x 10^3 J.kg^-1.K^-1. Masse volumique de l'eau : rho = 1,0 kg/L. Volume du chauffe-eau : V = 150 L. Température initiale : 15 degrés Celsius. Température visée : 60 degrés Celsius. Tension d'alimentation : U = 230 V. Intensité : I = 9,0 A. Part des pertes thermiques : 12 % de l'énergie fournie.",
        },
      ],
      expected_concepts: [
        'système et frontière', 'premier principe', 'transfert thermique', 'capacité thermique massique',
        'effet Joule', 'puissance électrique', 'énergie électrique', 'rendement', 'pertes thermiques',
      ],
      expected_mechanisms: [
        "Le système (l'eau) et sa frontière doivent être définis : sans cela, les transferts sont comptés deux fois ou oubliés.",
        "L'énergie thermique à fournir vaut Q = m·c·Δθ, avec m obtenue à partir du volume et de la masse volumique — l'écart de température se calcule indifféremment en °C ou en K.",
        "La puissance dissipée par effet Joule vaut P = U·I ; l'énergie électrique fournie sur une durée Δt vaut E = P·Δt.",
        "La durée théorique découle de l'égalité E = Q ; la durée réelle en tient compte du rendement η = 0,88 : Δt_réel = Q / (η·P).",
        "Le commentaire final compare la durée obtenue à l'expérience courante : un ordre de grandeur de quelques heures est attendu, une durée de quelques minutes doit alerter.",
      ],
      traps: [
        "ne pas définir le système et mélanger énergie fournie et énergie utile",
        "oublier de convertir le volume en masse",
        "appliquer le rendement à l'envers (multiplier au lieu de diviser)",
        "conserver des unités mixtes (kWh, J, minutes) sans conversion explicite",
        "livrer une durée sans phrase de conclusion ni contrôle d'ordre de grandeur",
      ],
      special_criteria: [
        "le système étudié doit être nommé explicitement",
        "l'expression littérale de la durée est attendue avant l'application numérique",
        "le contrôle d'ordre de grandeur fait partie du critère VAL",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_DOC_01',
    track: 'generale',
    exercise_type: 'pc_analyse_documentaire',
    work_id: 'PC_T3_CAPTEUR_RC',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-SYN-RC-01',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Analyse documentaire',
      work: "Un capteur d'humidité fondé sur la charge d'un circuit RC",
      field: "Physique · Terminale · L'énergie : conversions et transferts",
      level: 'terminale',
      theme_id: 'PC-T3',
      theme_title: "L'énergie : conversions et transferts — dynamique d'un circuit électrique",
      prompt:
        "Un capteur d'humidité utilise un condensateur dont la capacité varie avec le taux d'humidité de l'air. Le condensateur est chargé à travers une résistance de valeur connue, et le circuit mesure la durée de charge. À partir des documents, expliquer comment la mesure d'une durée permet de déterminer un taux d'humidité, et estimer la capacité du condensateur dans les conditions de l'enregistrement fourni.",
      document_requirements:
        "documents joints au sujet distribué : schéma du circuit, courbe u_C = f(t) de la charge, tableau capacité ↔ taux d'humidité, valeur R = 47 kΩ. Le correcteur ne reproche jamais à l'élève un élément absent des documents, et ne juge aucune lecture graphique que la transcription ne rapporte pas.",
      documents: [
        {
          id: 'DOC_1',
          titre: 'Le capteur et son circuit',
          nature: 'schéma + texte',
          contenu:
            "Un générateur de tension continue E = 5,0 V, un interrupteur, une résistance R = 47 kOhm et le condensateur-capteur en série. La tension u_C est mesurée aux bornes du condensateur. Texte d'accompagnement : la capacité du condensateur augmente avec le taux d'humidité de l'air, le circuit mesure la durée de charge pour en déduire l'humidité.",
        },
        {
          id: 'DOC_2',
          titre: 'Enregistrement de la charge, u_C = f(t)',
          nature: 'graphique',
          contenu:
            "Courbe croissante partant de 0 V et tendant vers un palier à 5,0 V. Axe des abscisses gradué en millisecondes de 0 à 20 ms, axe des ordonnées en volts de 0 à 5. La lecture attendue est celle de la constante de temps : soit par la tangente à l'origine, soit à 63 % de la valeur finale, ce qui donne environ 2,2 ms. Le tracé n'est pas accessible au correcteur automatique : une valeur voisine (2,0 à 2,4 ms) est recevable.",
        },
        {
          id: 'DOC_3',
          titre: "Étalonnage capacité ↔ taux d'humidité",
          nature: 'tableau',
          contenu:
            "Capacité 33 nF pour 20 % d'humidité | 40 nF pour 35 % | 47 nF pour 50 % | 56 nF pour 65 % | 68 nF pour 80 %. C'est ce tableau qui permet de conclure sur l'humidité : s'arrêter à la capacité, c'est ne pas répondre à la question.",
        },
      ],
      expected_concepts: [
        'condensateur', 'capacité', 'circuit RC', 'constante de temps', 'charge du condensateur',
        'régime transitoire', 'régime permanent', 'lecture graphique', 'tangente à l\'origine', 'étalonnage',
      ],
      expected_mechanisms: [
        "La tension aux bornes du condensateur suit une croissance exponentielle vers E : u_C(t) = E(1 − e^(−t/τ)) avec τ = R·C.",
        "La constante de temps se lit sur la courbe soit par la tangente à l'origine, soit au point où u_C atteint 63 % de E : c'est la lecture attendue.",
        "De τ et de R connue on tire C = τ/R : la mesure d'une durée devient une mesure de capacité.",
        "Le tableau d'étalonnage capacité ↔ humidité convertit ensuite la capacité en taux d'humidité : c'est la chaîne de mesure complète.",
        "L'ordre de grandeur de C (nanofarad, microfarad) doit être contrôlé et l'unité systématiquement portée.",
      ],
      traps: [
        "paraphraser les documents sans jamais prélever de valeur chiffrée",
        "confondre charge et décharge, ou lire 63 % au lieu de 37 % (et réciproquement)",
        "confondre la tension et l'intensité dans le circuit",
        "oublier l'unité de τ ou de C, ou se tromper de puissance de dix (kΩ, µF)",
        "conclure sur l'humidité sans passer par l'étalonnage fourni",
      ],
      special_criteria: [
        "au moins une valeur chiffrée prélevée dans les documents, avec son unité et son document d'origine",
        "la relation τ = R·C doit être écrite et exploitée numériquement",
        "la conclusion doit relier la durée mesurée au taux d'humidité, pas s'arrêter à la capacité",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_DOC_02',
    track: 'generale',
    exercise_type: 'pc_analyse_documentaire',
    work_id: 'PC_T4_EFFET_PHOTOELECTRIQUE',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-EP-GEN-MODEL-05',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Analyse documentaire',
      work: "Cellule photoélectrique : pourquoi la couleur de la lumière compte plus que son intensité",
      field: 'Physique · Terminale · Ondes et signaux',
      level: 'terminale',
      theme_id: 'PC-T4',
      theme_title: 'Ondes et signaux — photon et effet photoélectrique',
      prompt:
        "Une cellule photoélectrique n'émet aucun électron lorsqu'on l'éclaire avec une lumière rouge très intense, mais en émet dès qu'on l'éclaire avec une lumière bleue même faible. À partir des documents, expliquer ce comportement et déterminer si un rayonnement de longueur d'onde 620 nm peut extraire un électron du métal étudié.",
      document_requirements:
        "documents joints au sujet distribué : tableau des travaux d'extraction de plusieurs métaux, spectre visible avec longueurs d'onde, valeurs de h et de c, définition du photon.",
      documents: [
        {
          id: 'DOC_1',
          titre: "Le photon (texte)",
          nature: 'texte',
          contenu:
            "La lumière transporte l'énergie par paquets indivisibles appelés photons. L'énergie d'un photon vaut E = h x nu, où nu est la fréquence du rayonnement. L'intensité lumineuse fixe le NOMBRE de photons émis par seconde, jamais l'énergie de chacun d'eux.",
        },
        {
          id: 'DOC_2',
          titre: "Travaux d'extraction de quelques métaux",
          nature: 'tableau',
          contenu:
            "Césium 1,9 eV | Sodium 2,3 eV | Zinc 4,3 eV | Cuivre 4,7 eV. Le métal étudié dans le sujet est le SODIUM, travail d'extraction W = 2,3 eV.",
        },
        {
          id: 'DOC_3',
          titre: 'Constantes et spectre visible',
          nature: 'tableau de données',
          contenu:
            "Constante de Planck h = 6,63 x 10^-34 J.s. Célérité de la lumière c = 3,00 x 10^8 m/s. 1 eV = 1,60 x 10^-19 J. Spectre visible : violet 400 nm, bleu 470 nm, vert 530 nm, jaune 580 nm, rouge 620 à 700 nm. Le rayonnement à examiner, 620 nm, est donc rouge.",
        },
      ],
      expected_concepts: [
        'photon', 'quantum d\'énergie', 'travail d\'extraction', 'effet photoélectrique',
        'longueur d\'onde', 'fréquence', 'célérité', 'relation E = h·ν', 'électronvolt', 'fréquence seuil',
      ],
      expected_mechanisms: [
        "L'énergie transportée par un photon vaut E = h·ν = h·c/λ : elle dépend de la longueur d'onde, pas du nombre de photons.",
        "L'intensité lumineuse fixe le nombre de photons par seconde, pas l'énergie de chacun : d'où l'inefficacité d'une lumière rouge intense.",
        "L'extraction n'a lieu que si l'énergie d'UN photon dépasse le travail d'extraction W du métal : c'est un seuil, pas une accumulation.",
        "Le calcul à 620 nm demande une conversion en joules puis en électronvolts pour comparer à W donné dans le tableau.",
        "La conclusion compare deux énergies chiffrées et répond par oui ou non, avec l'écart.",
      ],
      traps: [
        "expliquer par « il faut plus de lumière » : c'est précisément ce que l'effet photoélectrique contredit",
        "confondre longueur d'onde, fréquence et célérité, ou employer λ là où il faut ν",
        "oublier la conversion joule ↔ électronvolt avant de comparer au travail d'extraction",
        "se tromper de puissance de dix sur nm, ou négliger la conversion en mètres",
        "paraphraser le document sur le photon sans jamais faire le calcul demandé",
      ],
      special_criteria: [
        "la relation E = h·c/λ doit être écrite avant application numérique",
        "la comparaison finale doit porter sur deux énergies exprimées dans la MÊME unité",
        "l'argument « intensité ≠ énergie du photon » doit apparaître explicitement",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_PROTO_01',
    track: 'generale',
    exercise_type: 'pc_protocole',
    work_id: 'PC_T1_SPECTRO_ETALONNAGE',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-EP-GEN-MODEL-06',
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Protocole expérimental',
      work: "Déterminer la concentration en ions cuivre(II) d'un bain de traitement par étalonnage spectrophotométrique",
      field: 'Chimie · Terminale · Analyser un système par des méthodes physiques',
      level: 'terminale',
      theme_id: 'PC-T1',
      theme_title: 'Constitution et transformations de la matière — méthodes physiques d\'analyse',
      prompt:
        "Un atelier doit contrôler la concentration en ions cuivre(II) d'un bain de traitement de surface, estimée entre 1 × 10⁻² et 5 × 10⁻² mol/L. On dispose d'une solution mère de sulfate de cuivre à 0,10 mol/L, de la verrerie usuelle du laboratoire et d'un spectrophotomètre. Rédiger le protocole complet permettant de déterminer cette concentration, en précisant les précautions de sécurité et les sources d'incertitude.",
      document_requirements:
        "données fournies avec le sujet : spectre d'absorption de la solution de sulfate de cuivre (maximum vers 800 nm), pictogrammes de sécurité du sulfate de cuivre (SGH07, SGH09). Aucun schéma n'est attendu du correcteur : seule la description écrite est évaluée.",
      documents: [
        {
          id: 'DOC_1',
          titre: "Spectre d'absorption de la solution de sulfate de cuivre",
          nature: 'graphique',
          contenu:
            "Absorbance en fonction de la longueur d'onde, de 400 à 900 nm. Absorbance faible dans le bleu et le vert, croissante à partir de 600 nm, maximum marqué vers 800 nm. C'est cette longueur d'onde que l'élève doit retenir pour le réglage : choisir la couleur perçue de la solution est une erreur classique.",
        },
        {
          id: 'DOC_2',
          titre: 'Sécurité du sulfate de cuivre',
          nature: 'pictogrammes + texte',
          contenu:
            "Pictogrammes SGH07 (nocif, irritant) et SGH09 (dangereux pour le milieu aquatique). Précautions attendues : gants, lunettes, blouse ; récupération des solutions dans un bidon de déchets, jamais de rejet à l'évier.",
        },
        {
          id: 'DOC_3',
          titre: 'Matériel disponible',
          nature: 'liste',
          contenu:
            "Solution mère de sulfate de cuivre à 0,10 mol/L. Pipettes jaugées de 5, 10, 20 et 25 mL. Fioles jaugées de 50 et 100 mL. Béchers, éprouvettes graduées, pissette d'eau distillée. Spectrophotomètre et cuves. Concentration du bain attendue entre 1 x 10^-2 et 5 x 10^-2 mol/L.",
        },
      ],
      expected_concepts: [
        'loi de Beer-Lambert', 'absorbance', 'longueur d\'onde de travail', 'gamme d\'étalonnage',
        'dilution', 'facteur de dilution', 'verrerie jaugée', 'droite d\'étalonnage', 'blanc',
        'incertitude de mesure', 'EPI', 'pictogrammes',
      ],
      expected_mechanisms: [
        "La loi de Beer-Lambert A = k·C n'est exploitable qu'à une longueur d'onde fixée, choisie au maximum d'absorption pour maximiser la sensibilité.",
        "La gamme d'étalonnage se prépare par dilutions de la solution mère à la verrerie jaugée (pipette jaugée + fiole jaugée), chaque dilution donnant une concentration connue.",
        "Le spectrophotomètre se règle avec un blanc (eau distillée) avant toute mesure : sans blanc, les absorbances ne sont pas comparables.",
        "La droite d'étalonnage A = f(C) permet, par lecture inverse de l'absorbance du bain, d'obtenir sa concentration — après dilution si l'absorbance sort de la gamme.",
        "L'incertitude vient de la verrerie (tolérance), de la répétabilité de la mesure et de l'ajustement de la droite ; le résultat s'annonce avec un intervalle.",
        "Sécurité : le sulfate de cuivre est nocif et dangereux pour l'environnement — gants, lunettes, blouse, et récupération des solutions dans un bidon de déchets, jamais à l'évier.",
      ],
      traps: [
        "choisir une longueur d'onde au hasard, ou celle de la couleur perçue au lieu du maximum d'absorption",
        "préparer la gamme à la verrerie graduée (bécher, éprouvette) au lieu de la verrerie jaugée",
        "oublier le blanc, ou le faire après les mesures",
        "protocole non chiffré : « on dilue plusieurs fois » sans volumes ni concentrations",
        "oublier la sécurité et le traitement des déchets alors que les pictogrammes sont fournis",
        "ne pas dire ce qu'on fait des mesures : gamme préparée mais exploitation jamais annoncée",
      ],
      special_criteria: [
        "au moins trois solutions étalons chiffrées (volume prélevé, volume de la fiole, concentration obtenue)",
        "la verrerie doit être nommée avec ses volumes, la verrerie jaugée justifiée par la précision",
        "l'exploitation attendue (droite d'étalonnage puis lecture inverse) doit être annoncée",
        "sécurité et incertitudes sont notées : leur absence coûte les 4 points du critère SAFE",
      ],
      sources: SOURCES_PC,
      teacher_validation_required: true,
    },
  },
  {
    id: 'PC2027_ECE_01',
    track: 'generale',
    exercise_type: 'pc_ece',
    work_id: 'PC_T1_CINETIQUE_CONDUCTIMETRIE',
    status: 'draft',
    card_json: {
      session,
      source_package_id: 'PC-EP-GEN-MODEL-07',
      source_status: 'synthetic_training_template_not_official_exam',
      warning:
        AVERTISSEMENT_SUJET +
        " De plus, l'ECE reelle s'evalue en salle sur des gestes non observables ici : la correction automatique porte UNIQUEMENT sur le compte rendu ecrit et ne remplace jamais l'evaluation du professeur.",
      exercise: 'Compte rendu d’ECE',
      work: "Suivi cinétique par conductimétrie : détermination d'un temps de demi-réaction",
      field: 'Chimie · Terminale · Cinétique et évolution temporelle',
      level: 'terminale',
      theme_id: 'PC-T1',
      theme_title: 'Constitution et transformations de la matière — cinétique chimique',
      prompt:
        "On étudie l'hydrolyse du 2-chloro-2-méthylpropane dans un mélange eau/acétone. La réaction produit des ions, ce qui rend le milieu conducteur. À l'aide d'un conductimètre, suivre l'évolution de la conductivité au cours du temps, puis déterminer le temps de demi-réaction. Conclure sur l'influence de la température en comparant votre résultat à celui obtenu par un autre binôme à température plus élevée.",
      document_requirements:
        "matériel disponible en salle : conductimètre, cellule, chronomètre, bain thermostaté, verrerie jaugée, solutions préparées. La correction automatique ne voit NI le montage, NI le geste, NI le graphique tracé : uniquement le compte rendu écrit. Relecture professeur obligatoire.",
      documents: [
        {
          id: 'DOC_1',
          titre: 'Réaction étudiée',
          nature: 'texte + équation',
          contenu:
            "Hydrolyse du 2-chloro-2-méthylpropane dans un mélange eau/acétone : C4H9Cl + H2O -> C4H9OH + H+ (aq) + Cl- (aq). La réaction libère des ions, donc la conductivité du milieu augmente au cours du temps : sigma(t) est une image de l'avancement.",
        },
        {
          id: 'DOC_2',
          titre: 'Matériel disponible en salle',
          nature: 'liste',
          contenu:
            "Conductimètre et cellule de mesure, chronomètre, bain thermostaté réglable, verrerie jaugée, solution de 2-chloro-2-méthylpropane et mélange eau/acétone préparés. Deux binômes travaillent à deux températures différentes pour comparer.",
        },
        {
          id: 'DOC_3',
          titre: 'Rappel de méthode',
          nature: 'texte',
          contenu:
            "Le temps de demi-réaction t_1/2 est la durée au bout de laquelle l'avancement atteint la moitié de sa valeur finale. Sur un suivi conductimétrique partant d'une conductivité nulle, cela correspond à sigma(t_1/2) = sigma_finale / 2 — ce qui suppose que le PALIER de conductivité ait été atteint avant de conclure.",
        },
      ],
      expected_concepts: [
        'conductimétrie', 'conductivité', 'suivi temporel', 'temps de demi-réaction',
        'avancement', 'vitesse de réaction', 'facteur cinétique', 'température',
        'conductivité finale', 'incertitude de mesure', 'répétabilité',
      ],
      expected_mechanisms: [
        "La conductivité croît avec l'avancement puisque la réaction produit des ions : σ(t) est une image de l'avancement x(t).",
        "Le temps de demi-réaction correspond à l'instant où l'avancement vaut la moitié de l'avancement final, soit σ(t½) = σ_finale/2 si σ_initiale est nulle.",
        "La lecture de t½ se fait sur la courbe σ = f(t) : il faut donc que σ_finale soit atteinte, ce qui impose d'attendre le palier.",
        "Une élévation de température augmente la vitesse de réaction : t½ diminue — c'est le facteur cinétique attendu.",
        "L'incertitude vient du repérage du palier, de la lecture graphique et du déclenchement du chronomètre ; l'écart entre binômes doit être comparé à cette incertitude avant d'être interprété.",
      ],
      traps: [
        "relever des valeurs sans unité ni organisation en tableau",
        "confondre vitesse de réaction et temps de demi-réaction",
        "lire t½ avant que le palier de conductivité soit atteint",
        "conclure sur l'effet de la température sans comparer l'écart à l'incertitude",
        "décrire des gestes au lieu d'exploiter des mesures : le compte rendu doit porter des chiffres",
      ],
      special_criteria: [
        "human_review_required est TOUJOURS vrai pour cet exercice : la note appartient au professeur présent en salle",
        "le tableau de mesures et la valeur de t½ avec son unité sont attendus dans le texte",
        "l'exploitation graphique ne peut être ni créditée ni sanctionnée si la transcription ne la décrit pas",
      ],
      sources: [...SOURCES_PC, 'PC-ECE26'],
      teacher_validation_required: true,
    },
  },
];

// ---------------------------------------------------------------------
//  3) LES ETALONS
//     Cinq profils par sujet, un par bande de notes du dossier source
//     (0-4, 5-8, 9-12, 13-16, 17-20). Le bareme etant sur 20, score et
//     criterion_scores sont sur la meme echelle : aucune conversion.
//
//     Le dossier source le dit sans detour : AUCUNE copie reelle d'eleve
//     juridiquement reutilisable n'a ete trouvee. Ce sont donc des profils
//     synthetiques de calibration, a remplacer par de vraies copies
//     anonymisees des que possible.
// ---------------------------------------------------------------------
const BANDES = [
  {
    suffixe: 'N03', score: 3, role: 'niveau_03_tres_insuffisant',
    profil: 'production très insuffisante, blanche ou hors sujet',
    forces: "Quelques grandeurs de l'énoncé sont recopiées, sans qu'aucune démarche ne s'installe.",
    limites: "Aucune stratégie exploitable : le système n'est pas défini, les lois sont absentes ou inapplicables, les résultats ne veulent rien dire.",
  },
  {
    suffixe: 'N07', score: 7, role: 'niveau_07_insuffisant',
    profil: 'compréhension fragmentaire',
    forces: "Quelques formules justes sont écrites et une intention de démarche apparaît.",
    limites: "Erreurs majeures (unités, modèle, signe), calculs interrompus, aucun contrôle : la réponse reste à l'état d'ébauche.",
  },
  {
    suffixe: 'N11', score: 11, role: 'niveau_11_moyen',
    profil: 'acquis partiels, démarche visible mais instable',
    forces: "La stratégie est identifiable et les lois principales sont mobilisées correctement.",
    limites: "Justifications elliptiques, erreurs locales de calcul ou d'unité, contrôle du résultat absent ou purement formel.",
  },
  {
    suffixe: 'N14', score: 14, role: 'niveau_14_bon',
    profil: 'bonne maîtrise avec lacunes localisées',
    forces: "Démarche annoncée et tenue, expression littérale établie, application numérique juste, rédaction lisible.",
    limites: "Une hypothèse reste implicite, ou le contrôle du résultat s'arrête aux chiffres significatifs sans discuter l'ordre de grandeur.",
  },
  {
    suffixe: 'N18', score: 18, role: 'niveau_18_tres_bon',
    profil: 'réponse très maîtrisée, complète, justifiée et vérifiée',
    forces: "Stratégie explicite, hypothèses discutées, littéral avant numérique, unités suivies, résultat contrôlé et conclu.",
    limites: '',
  },
];

// Erreurs typiques par bande et par exercice : ce que le correcteur doit
// s'attendre a voir a ce niveau-la.
const ERREURS_PAR_EXERCICE = {
  pc_probleme: {
    3: ['PC-MODEL-01', 'PC-UNIT-01', 'PC-CONCL-01'],
    7: ['PC-UNIT-01', 'PC-SIGN-01', 'PC-CONCL-01'],
    11: ['PC-SIGN-01', 'PC-SIG-01'],
    14: ['PC-SIG-01'],
    18: [],
  },
  pc_analyse_documentaire: {
    3: ['PC-DOC-01', 'PC-MODEL-01', 'PC-CONCL-01'],
    7: ['PC-DOC-01', 'PC-UNIT-01', 'PC-GRAPH-01'],
    11: ['PC-GRAPH-01', 'PC-SIG-01'],
    14: ['PC-SIG-01'],
    18: [],
  },
  pc_protocole: {
    3: ['PC-PROTO-01', 'PC-SAFE-01', 'PC-INCERT-01'],
    7: ['PC-PROTO-01', 'PC-SAFE-01'],
    11: ['PC-INCERT-01', 'PC-UNIT-01'],
    14: ['PC-INCERT-01'],
    18: [],
  },
  pc_ece: {
    3: ['PC-UNIT-01', 'PC-INCERT-01', 'PC-CONCL-01'],
    7: ['PC-UNIT-01', 'PC-GRAPH-01', 'PC-INCERT-01'],
    11: ['PC-GRAPH-01', 'PC-KIN-01'],
    14: ['PC-INCERT-01'],
    18: [],
  },
};

/**
 * Repartit une note sur 20 entre les criteres, proportionnellement a leur
 * maximum, arrondie au quart de point. Le reste d'arrondi va sur le critere
 * le plus lourd pour que la somme tombe EXACTEMENT juste : le moteur de
 * correction compare note_finale a la somme des criteres et signale tout ecart.
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
          "Profil synthetique de calibration : le dossier source indique explicitement qu'AUCUNE copie reelle d'eleve juridiquement reutilisable n'a ete identifiee. A remplacer ou confirmer par des copies authentiques anonymisees et notees.",
        normalised_score_on_20: bande.score,
        criterion_scores: repartir(grille.rubric_json.criteria, bande.score),
        criterion_scale: 'sur 20, echelle de la grille',
      },
    };
  });
});

// ---------------------------------------------------------------------
//  4) LES GABARITS DE DOSSIER ELEVE
//     Meme charpente que SVT / HGGSP / HLP (8 sections + note en
//     fourchette), vocabulaire adapte a la physique-chimie et bareme
//     sur 20.
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

const REGLES_PC = `
RÈGLES PHYSIQUE-CHIMIE NON NÉGOCIABLES :
- Tu n'inventes JAMAIS une valeur, une donnée, une constante, un résultat de mesure ou une loi qui ne figure pas dans la copie, le sujet ou la correction. C'est la règle la plus importante de cette matière.
- Tu ne recorriges pas : tous les scores viennent de correction.criteria, sans exception.
- Toute citation de l'élève vient de la transcription. Si la transcription manque, tu décris sans citer.
- SCHÉMAS, GRAPHIQUES ET MONTAGES : la correction automatique ne les a pas vus. Tu ne les commentes jamais comme s'ils avaient été jugés. Quand ils comptent, tu énonces ce qu'ils auraient dû porter (titre, axes légendés avec unités, échelle, sens des flèches, légende du montage) et tu précises que le professeur les vérifie sur la copie.
- Les unités s'écrivent partout, y compris dans tes propres exemples corrigés. Un résultat sans unité, dans ce dossier, serait un contre-exemple.
- NOTATION : la transcription emploie une convention texte (10^-2, C_B, ( a ) / ( b ), sqrt( ), vec(F), ->, <=>). Quand tu cites l'élève, tu RÉTABLIS l'écriture normale — 10⁻², C_B en indice, la fraction sur deux étages si tu le peux — sans jamais changer les valeurs. Tu ne reproches jamais à l'élève une écriture qui vient du transcripteur, et les marques [illisible], [rature], [marge], [SCHÉMA non transcrit] n'apparaissent pas telles quelles dans le dossier : tu dis en français ce qu'elles signifient.
- Une erreur commise tôt ne se paie qu'une fois : quand tu expliques une perte de points, tu dis explicitement à l'élève que la suite menée correctement avec la valeur fausse reste valorisée.
- Tu tutoies l'élève. Ton exigeant et bienveillant, jamais de flatterie, jamais de reproche sans la correction à appliquer.
- Ne produis rien d'autre que le corps HTML.

BUDGET DE LONGUEUR — contrainte technique, pas stylistique : le dossier complet doit tenir sous 24 000 caractères de HTML. Le générateur est coupé au-delà et l'élève ne reçoit alors RIEN — un dossier dense et court vaut infiniment mieux qu'un dossier complet jamais livré. Tu tiens ce budget en restant au bas des fourchettes quand la copie ne justifie pas plus : 3 erreurs pénalisantes plutôt que 5 si la copie n'en porte que 3, 4 chantiers de progression plutôt que 6, deux paragraphes d'appréciation et pas trois. Tu ne rallonges jamais une section pour la remplir, et tu ne répètes pas d'une section à l'autre ce qui a déjà été dit.`;

const enTeteDossier = (titre, sousTitre) => `
Tu rédiges le dossier HTML de correction d'un élève de terminale générale, spécialité physique-chimie, après ${titre}.

STRUCTURE (dans <div class="page"> … <div class="wrap"> … </div></div>) :

COUVERTURE :
- cover-band : <h1>DOSSIER DE CORRECTION</h1><div class="sub">PHYSIQUE-CHIMIE · ${sousTitre}</div>
- cover-id : name = identite.eleve ; work = sujet.work ; work-meta = sujet.field + " · Bac blanc" ; badge = fourchette de note, "/ 20" ; cover-note = voir la règle de fourchette plus bas.
- .wrap : rappelle d'abord la question posée dans une .box cream (lab "Sujet") = sujet.prompt. Puis table.bareme, une ligne par correction.criteria[] avec le nom complet de la compétence, + TOTAL. Puis .cap de contexte rappelant sujet.document_requirements.

SECTION 1 — NOTE DÉTAILLÉE & APPRÉCIATION
- h3.sub "Niveau par compétence" : table.radar, une ligne par critère. Colonne /10 = round(score/maximum*10,1) ; barre width = score/maximum*100 % ; colonne Observation = le NIVEAU ATTEINT parmi Très satisfaisant / Satisfaisant / Fragile / Insuffisant, suivi de six à douze mots de justification.
- h3.sub "Appréciation du correcteur" : correction.appreciation_generale développée en 2 paragraphes .just suivant cet ordre — qualité générale, ce qui fonctionne, le principal frein à une note plus haute, le potentiel réel. Finir par une phrase en gras fixant un objectif chiffré pour la prochaine copie.`;

const sectionsCommunes = (memo) => `
SECTION 3 — CE QUI FAIT BAISSER LA NOTE · CE QUE TU MAÎTRISES
- h3.sub "Erreurs pénalisantes" : 3 à 5 .err construits sur correction.detected_errors, classés par impact décroissant sur la note. Chaque .err dit : ce qui est faux ou manquant · la notion ou le réflexe correct · pourquoi cela coûte des points · "Comment corriger :" en gras avec la formulation ou le calcul modèle, unités comprises.
- h3.sub "Connaissances et réflexes manquants" : une .box cream (lab "À ajouter") comparant sujet.expected_concepts et sujet.expected_mechanisms à ce que la copie mobilise réellement ; chaque manque avec sa définition juste en une phrase, sa relation quand elle existe, et l'endroit du devoir où il aurait servi.
- h3.sub "Ce que tu maîtrises déjà" : un .good par correction.points_forts, avec le passage exact qui le prouve et ce qu'un correcteur officiel y valoriserait.

SECTION 5 — PLAN DE PROGRESSION
- Un .prio numéroté par correction.priorites_amelioration (4 à 6 chantiers), format "Problème :" / "Action :". Chaque action doit être applicable dès la prochaine copie ; "apprends ton cours" et "sois plus rigoureux" sont interdits — on écrit le geste exact ("pose le système et le référentiel en une ligne avant d'écrire la moindre loi").

SECTION 6 — EXERCICES CIBLÉS
- 2 tables "Exercice N · titre", chacune ciblant UNE faiblesse réellement observée. Lignes Objectif / Consigne / Réussite. La consigne doit être exécutable en 15 minutes sans document supplémentaire.

SECTION 7 — PROJECTION BAC
- table "Correction apportée" / "Gain estimé" (+0,5 à +2 points, cohérent avec les points réellement perdus au barème) puis <tr class="total"> "Note estimée après corrections" / fourchette au-dessus de la note actuelle, plafonnée à 20. Puis .cap précisant que la projection suppose le même niveau de connaissances.

SECTION 8 — FICHE MÉMO — RÉFLEXES PHYSIQUE-CHIMIE
- Ouvre <div class="sec memo"> et commence OBLIGATOIREMENT par l'en-tête numéroté, comme les sections précédentes : <div class="sec-h"><div class="num">8</div><div class="ttl">FICHE MÉMO — RÉFLEXES PHYSIQUE-CHIMIE</div></div>. Les huit sections doivent toutes porter leur numéro.
- "MES RÉFLEXES DE MÉTHODE" (mh) + mb ul de 3 li tirés des erreurs réelles de la copie, chacun avec un exemple modèle rédigé.
${memo}
- .kicker de fin, motivant et chiffré.

Termine par .foot : "Dossier de correction — {eleve} · Physique-Chimie" | "Les Matinées du Bac".`;

export const dossier_templates = [
  {
    id: 'PC_DOSSIER_PROBLEME_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'pc_probleme',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('un problème quantitatif', 'PROBLÈME QUANTITATIF') +
      `

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du devoir. Pour 4 moments (la mise en place : système, référentiel, données ; le choix du modèle ou de la loi ; l'expression littérale ; l'application numérique ; le contrôle et la conclusion) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi, en termes de démarche ET de physique) ; si le passage est à corriger : box reform (lab "Rédaction attendue", fondée sur .improvement du critère) + .gain chiffré en points.
- Au moins un des moments doit porter sur les UNITÉS ou l'ORDRE DE GRANDEUR : la valeur écrite par l'élève, ce qu'elle vaut réellement, et le réflexe qui l'aurait détectée.
- Quand une erreur précoce a faussé la suite, dis-le explicitement : la démarche menée avec la valeur fausse reste créditée.
` +
      sectionsCommunes(
        '- "MES FORMULES À SÉCURISER" (mh) + mb ul de 2 à 4 li : les relations que la copie a oubliées, mal écrites ou appliquées hors de leur domaine, chacune avec son écriture juste, ses grandeurs et leurs unités.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement la MISE EN PLACE (système, référentiel ou réaction support, hypothèses, données utiles), puis au choix l'expression littérale ou la conclusion contrôlée. box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des données déjà présentes dans la copie ou dans la fiche sujet (sujet.expected_concepts, sujet.expected_mechanisms). Aucune valeur numérique nouvelle inventée.
` +
      REGLES_PC +
      FOURCHETTE,
  },
  {
    id: 'PC_DOSSIER_DOC_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'pc_analyse_documentaire',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('une analyse documentaire argumentée', 'ANALYSE DOCUMENTAIRE') +
      `

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du devoir. Pour 4 moments (l'entrée en matière et la reformulation de la question ; une donnée bien prélevée ou mal prélevée ; un passage de paraphrase ; le traitement quantitatif ; la conclusion) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi) ; si le passage est à corriger : box reform (lab "Rédaction attendue", fondée sur .improvement du critère) + .gain chiffré en points.
- Au moins un des moments doit opposer PARAPHRASE et EXPLOITATION sur la même phrase de la copie : ce que l'élève a recopié du document, puis la même donnée transformée en argument chiffré relié à la question.
- Si la copie repose sur une lecture graphique que la transcription ne rapporte pas, dis-le : ce point relève de la relecture du professeur.
` +
      sectionsCommunes(
        '- "MES RÉFLEXES SUR UN DOCUMENT" (mh) + mb ul de 2 à 4 li : repérer la grandeur utile, la citer avec son unité et son document, la relier à une loi, en tirer un chiffre — chacun formulé comme une question à se poser en copie.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement un passage de paraphrase transformé en exploitation chiffrée, et la conclusion (réponse explicite à la question, appuyée sur la valeur trouvée). box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des éléments déjà présents dans la copie ou dans la fiche sujet. Tu n'inventes JAMAIS une donnée d'un document que la copie ne cite pas.
` +
      REGLES_PC +
      FOURCHETTE,
  },
  {
    id: 'PC_DOSSIER_PROTOCOLE_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'pc_protocole',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('un protocole expérimental écrit', 'PROTOCOLE EXPÉRIMENTAL') +
      `

AVERTISSEMENT À AFFICHER : juste sous le badge de couverture, ajoute une .box cream (lab "À lire avant tout") disant que la correction automatique n'a pas vu le schéma de montage éventuel, seulement le texte du protocole, et que tout ce qui relève du dessin doit être confirmé par le professeur devant la copie.

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du protocole. Pour 4 moments (l'objectif et le principe ; le choix de la verrerie ; une étape opératoire chiffrée ou non chiffrée ; la sécurité ; l'exploitation annoncée) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi) ; si le passage est à corriger : box reform (lab "Rédaction attendue") + .gain chiffré en points.
- Le test de REPRODUCTIBILITÉ doit apparaître au moins une fois : prends une étape de l'élève et montre ce qu'un autre élève devrait deviner pour l'exécuter, puis réécris-la avec ses volumes, ses concentrations et sa verrerie nommée.
` +
      sectionsCommunes(
        '- "MES RÉFLEXES DE PAILLASSE" (mh) + mb ul de 2 à 4 li : verrerie jaugée quand la précision compte, blanc avant les mesures, EPI et pictogrammes, déchets récupérés, incertitude annoncée — chacun relié à ce que la copie a oublié.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement une ÉTAPE OPÉRATOIRE rendue entièrement exécutable (volumes, concentrations, verrerie, conditions), puis au choix la sécurité ou l'exploitation attendue. box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des éléments déjà présents dans la copie ou dans la fiche sujet. Aucune valeur, espèce chimique ou appareil nouveau inventé.
- Rappelle qu'un autre protocole peut être aussi juste : ce n'est pas LE protocole attendu, c'est le sien rendu exécutable.
` +
      REGLES_PC +
      FOURCHETTE,
  },
  {
    id: 'PC_DOSSIER_ECE_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'pc_ece',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("un compte rendu d'évaluation des compétences expérimentales (ECE)", 'COMPTE RENDU D’ECE') +
      `

AVERTISSEMENT À AFFICHER : juste sous le badge de couverture, ajoute une .box cream (lab "À lire avant tout") disant que l'ECE réelle s'évalue en salle, sur des gestes que la correction automatique n'a pas vus, et que ce dossier ne porte que sur le compte rendu écrit : la note d'ECE appartient au professeur présent pendant la séance.

SECTION 2 — TA COPIE, ANNOTÉE
- Suis l'ordre réel du compte rendu. Pour 4 moments (la reformulation de la question expérimentale ; la stratégie choisie et sa justification ; le relevé des mesures ; l'exploitation ; la validation et la conclusion) : h4.subq intitulé ; box said (lab "Ce que tu as écrit" + .quote exacte de la transcription) ; p.analysis (b.tag "Analyse —" + ce qui fonctionne ou non ET pourquoi) ; si le passage est à corriger : box reform (lab "Rédaction attendue") + .gain chiffré en points.
- Un des moments porte obligatoirement sur les MESURES : sont-elles notées avec leur unité, organisées, exploitables par quelqu'un d'autre ?
- Tu ne commentes JAMAIS le geste, le montage réalisé ni le graphique tracé : tu ne les as pas vus. Quand c'est en jeu, tu écris que ce point relève de l'évaluation du professeur en salle.
` +
      sectionsCommunes(
        '- "MES RÉFLEXES D’ECE" (mh) + mb ul de 2 à 4 li : reformuler la question expérimentale, annoncer la stratégie avant de manipuler, noter chaque mesure avec son unité, comparer le résultat à une référence, dire d\'où vient l\'incertitude.',
      ) +
      `

SECTION 4 — VERSION AMÉLIORÉE
- Réécris 2 passages faibles : obligatoirement le RELEVÉ ET L'EXPLOITATION DES MESURES (tableau, unités, calcul mené jusqu'au résultat), puis la VALIDATION (comparaison à la référence, incertitude, conclusion). box reform (lab "Version retravaillée") avec les ajouts marqués <span class="add">[AJOUT]</span>, puis p.analysis expliquant l'apport de chaque ajout.
- Tu ne peux réutiliser que des valeurs déjà présentes dans la copie ou dans la fiche sujet. Aucune mesure inventée : c'est un compte rendu d'expérience, une valeur fabriquée serait une faute grave.
` +
      REGLES_PC +
      FOURCHETTE,
  },
];

export default { matiere, libelle, session, rubrics, subject_cards, benchmark_cards, dossier_templates };
