// =====================================================================
//  DONNEES DE LA MATIERE : MATHEMATIQUES (specialite), session 2027
//
//  Pourquoi ce fichier existe : une session de bac blanc de mathematiques
//  est ouverte a l'inscription (13 septembre 2026, src/lib/sessions.ts)
//  alors que la matiere n'avait AUCUNE ligne dans le pipeline. Un eleve
//  pouvait s'inscrire a une epreuve dont la copie n'aurait pas pu etre
//  corrigee.
//
//  Contrairement a la physique-chimie, a la SVT ou a l'histoire-geo, il
//  n'existait pas de dossier source fourni par un professeur. TOUT ce
//  fichier a donc ete redige par Les Matinees du Bac a partir des textes
//  officiels publics de l'epreuve (programme de specialite de terminale,
//  competences mathematiques du bulletin officiel : chercher, modeliser,
//  representer, raisonner, calculer, communiquer). Rien ici n'est une
//  annale reproduite. Consequence : la relecture par un professeur de
//  mathematiques n'est pas une formalite, c'est la condition d'activation.
//
//  Choix de structure, a discuter avec le professeur relecteur :
//  l'epreuve officielle est faite de 4 exercices notes sur 5 points. Le
//  pipeline corrige UNE production a la fois : chaque exercice est donc
//  installe comme une epreuve autonome, ramenee SUR 20. Les etalons
//  portent la meme echelle : aucune conversion nulle part. Corriger une
//  epreuve complete revient a deposer les 4 exercices separement.
//
//  Limite majeure, la meme qu'en physique-chimie : le correcteur ne recoit
//  que le TEXTE transcrit. Aucun tableau de variations trace, aucune
//  courbe, aucun arbre de probabilites dessine, aucun ecran de
//  calculatrice ne lui parvient. Elle est portee dans chaque
//  system_prompt et dans chaque gabarit de dossier eleve.
// =====================================================================

export const matiere = 'maths';
export const libelle = 'Mathematiques';
export const session = 2027;

// ---------------------------------------------------------------------
//  Taxonomie d'erreurs
//  Elle vit dans rubric_json.common_error_taxonomy, comme pour SES, SVT,
//  HGGSP, HLP, l'histoire-geographie et la physique-chimie : la table
//  error_taxonomy n'a pas de colonne matiere, y ecrire ferait fuiter des
//  codes d'une matiere a l'autre.
//  Le champ `criterion` vaut pour la grille d'analyse, qui sert de
//  reference ; taxoPour() le redirige vers le critere de CHAQUE grille.
// ---------------------------------------------------------------------
const TAXONOMIE = [
  { code: 'MA-JUST-01',  criterion: 'RAI', severity: 'major',    category: 'justification',      description: "Affirmation posee sans demonstration : « on voit que », « il est evident que », lecture graphique donnee comme preuve. En mathematiques, le resultat n'est pas la reponse, la justification l'est." },
  { code: 'MA-RECUR-01', criterion: 'RAI', severity: 'major',    category: 'recurrence',         description: "Recurrence incomplete : initialisation absente, hypothese de recurrence jamais enoncee, ou heredite qui utilise ce qu'elle doit demontrer." },
  { code: 'MA-LIM-01',   criterion: 'CAL', severity: 'major',    category: 'limites',            description: "Forme indeterminee annoncee puis conclue sans etre levee, ou limite affirmee sans theoreme (comparaison, encadrement, croissances comparees)." },
  { code: 'MA-DERIV-01', criterion: 'CAL', severity: 'major',    category: 'derivation',         description: "Derivee fausse : regle du produit, du quotient ou de la composee mal appliquee, derivee de exp ou de ln inexacte." },
  { code: 'MA-VAR-01',   criterion: 'RAI', severity: 'moderate', category: 'variations',         description: "Tableau de variations incoherent avec le signe reellement etudie, ou variations annoncees sans etude de signe." },
  { code: 'MA-EXP-01',   criterion: 'CAL', severity: 'moderate', category: 'exp_et_ln',          description: "Regles de calcul sur exp et ln mal appliquees : ln(a+b) traite comme ln(a)+ln(b), exponentielle rendue negative, domaine de definition du logarithme ignore." },
  { code: 'MA-INT-01',   criterion: 'CAL', severity: 'major',    category: 'integration',        description: "Primitive fausse, bornes oubliees ou interverties, aire donnee sans unite d'aire ni signe controle." },
  { code: 'MA-SUITE-01', criterion: 'RAI', severity: 'moderate', category: 'suites',             description: "Nature d'une suite affirmee sans preuve (raison jamais calculee), ou suite auxiliaire introduite sans montrer qu'elle est geometrique ou arithmetique." },
  { code: 'MA-COND-01',  criterion: 'MOD', severity: 'major',    category: 'probabilites_conditionnelles', description: "Confusion entre P_A(B) et P(A inter B), ou formule des probabilites totales appliquee sur une partition qui n'en est pas une." },
  { code: 'MA-BINOM-01', criterion: 'MOD', severity: 'major',    category: 'loi_binomiale',      description: "Loi binomiale invoquee sans verifier ses conditions (repetition identique, independance, deux issues) ou parametres n et p mal identifies." },
  { code: 'MA-ESP-01',   criterion: 'CAL', severity: 'moderate', category: 'esperance',          description: "Esperance, variance ou ecart-type mal calcules, ou interpretes comme une valeur certaine plutot que comme une moyenne sur un grand nombre de repetitions." },
  { code: 'MA-ARBRE-01', criterion: 'MOD', severity: 'moderate', category: 'arbre',              description: "Arbre pondere incomplet ou incoherent : branches d'un meme noeud dont la somme ne fait pas 1, evenement contraire oublie." },
  { code: 'MA-VECT-01',  criterion: 'RAI', severity: 'major',    category: 'vecteurs',           description: "Colinearite, orthogonalite ou coplanarite affirmee sans calcul : le dessin ou l'intuition tiennent lieu de preuve." },
  { code: 'MA-PLAN-01',  criterion: 'RAI', severity: 'major',    category: 'plans_et_droites',   description: "Vecteur normal et vecteur directeur confondus, ou equation cartesienne de plan utilisee comme une representation parametrique." },
  { code: 'MA-PARAM-01', criterion: 'CAL', severity: 'moderate', category: 'parametrage',        description: "Representation parametrique mal employee : meme parametre reutilise pour deux droites distinctes, systeme resolu sans verifier la solution." },
  { code: 'MA-SCAL-01',  criterion: 'CAL', severity: 'moderate', category: 'produit_scalaire',   description: "Produit scalaire mal calcule ou mal interprete : nul confondu avec colineaire, norme oubliee dans la formule de l'angle." },
  { code: 'MA-ALGO-01',  criterion: 'CAL', severity: 'moderate', category: 'algorithmique',      description: "Algorithme ou script Python non executable : condition d'arret fausse, variable non initialisee, boucle qui ne se termine pas, resultat renvoye au mauvais moment." },
  { code: 'MA-QCM-01',   criterion: 'RAI', severity: 'major',    category: 'reponse_non_justifiee', description: "Reponse choisie sans justification dans un exercice qui l'exige : la justification EST l'objet de l'evaluation, la bonne case ne vaut rien seule." },
  { code: 'MA-CTREX-01', criterion: 'RAI', severity: 'moderate', category: 'contre_exemple',     description: "Affirmation fausse refutee par un exemple isole presente comme une preuve generale, ou affirmation vraie « prouvee » par un seul cas particulier." },
  { code: 'MA-CALC-01',  criterion: 'CAL', severity: 'moderate', category: 'calcul_elementaire', description: "Erreurs de calcul elementaires repetees (signes, fractions, developpement, puissances) qui faussent les resultats sans que la demarche soit en cause." },
  { code: 'MA-REDAC-01', criterion: 'COM', severity: 'moderate', category: 'redaction',          description: "Redaction non mathematique : quantificateurs absents, meme lettre employee pour deux objets differents, resultat jamais enonce en phrase, aucune conclusion en contexte." },
  { code: 'MA-UNIT-01',  criterion: 'COM', severity: 'minor',    category: 'interpretation',     description: "Resultat livre sans unite, sans arrondi conforme a la consigne ou sans interpretation dans la situation etudiee." },
  { code: 'MA-TRANS-01', criterion: 'TRANSCRIPTION', severity: 'major', category: 'transcription', description: "Symbole, indice, exposant ou signe incertain dans la transcription : declenche une relecture humaine, jamais une sanction." },
];

/**
 * Selectionne des codes pour une grille donnee, en redirigeant leur
 * `criterion` vers un critere qui existe REELLEMENT dans cette grille.
 * Sans cela le correcteur recoit un code qui designe un critere absent du
 * bareme qu'il applique — et apply-matiere.mjs le refuse.
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
  "Tu n'inventes JAMAIS une valeur, un calcul, un theoreme ou un resultat absent de la copie ou de la fiche sujet.",
  "Une erreur commise tot ne se paie qu'une fois : si la suite est menee correctement AVEC le resultat faux, tu valorises la demarche. C'est la regle de l'evaluation par competences en mathematiques.",
  "Un resultat juste sans justification ne vaut pas les points de raisonnement ; une justification juste dont le calcul final est faux garde les points de raisonnement.",
  "Le bareme propre au sujet, s'il est fourni dans la fiche sujet, prime toujours sur cette grille generique.",
  "Une erreur de transcription a fort impact declenche une relecture humaine et non une sanction.",
];

// Socle commun des system_prompt. 100% ASCII : ces prompts partent tels
// quels dans l'API Anthropic, comme ceux des autres matieres.
const SOCLE_PROMPT =
  "ECHELLE DE NOTATION : le bareme total de cette grille vaut 20 points. " +
  "L'epreuve officielle de specialite note chaque exercice sur 5 points ; ici l'exercice est ramene sur 20, et les copies etalons portent la meme echelle sur 20 : comparaison directe, sans conversion. " +
  "Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, donc un nombre compris entre 0 et 20. " +
  "LIMITE DETERMINANTE DE CETTE MATIERE : tu ne recois que le TEXTE transcrit de la copie. " +
  "Aucun tableau de variations trace, aucune courbe, aucun arbre de probabilites dessine, aucune figure de geometrie, aucun ecran de calculatrice ne t'est accessible. " +
  "Tu ne juges donc JAMAIS une production graphique que la transcription ne decrit pas : tu ne la devines pas, tu ne la supposes ni reussie ni ratee, tu signales qu'elle releve de la relecture du professeur et tu passes human_review_required a true si elle pese sur la note. " +
  "NOTATION DE LA TRANSCRIPTION : la copie t'arrive dans une convention texte fixee, que tu lis sans jamais la reprocher a l'eleve. " +
  "x^2 est un carre et 10^-3 une puissance de dix ; u_n, u_(n+1) et v_0 sont des indices ; ( a ) / ( b ) est une fraction ; sqrt( ... ) une racine ; " +
  "exp( ... ) et ln( ... ) sont les fonctions usuelles ; integrale_(a)^(b) f(x) dx est une integrale ; vec(u) est un vecteur et vec(u).vec(v) un produit scalaire ; " +
  "<= et >= sont les inegalites larges, != la difference, => l'implication et <=> l'equivalence. " +
  "[TABLEAU non transcrit], [GRAPHIQUE non transcrit], [FIGURE non transcrite] et [ARBRE non transcrit] signalent une production que tu n'as pas vue : tu ne la juges pas, tu passes human_review_required a true si elle pese sur la note. " +
  "[illisible], [rature] et [marge] sont des marques du transcripteur, jamais des erreurs de l'eleve. " +
  "Si la transcription signale un doute sur un chiffre, un signe, un indice ou un exposant, tu retiens la lecture la PLUS FAVORABLE a l'eleve et tu passes human_review_required a true. " +
  "CODES D'ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille de mathematiques fournie (MA-xxx-nn). " +
  "Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d'une autre matiere. " +
  "ETALONS : les copies etalons servent a situer le niveau global. Le champ benchmark_comparison.lower_or_equal_id doit designer l'etalon dont la note est INFERIEURE OU EGALE a celle que tu attribues, et upper_or_equal_id celui dont la note est SUPERIEURE OU EGALE. " +
  "Methode imposee : classe d'abord les etalons par note croissante, place ta note dans ce classement, puis prends l'etalon immediatement en dessous et celui immediatement au-dessus. " +
  "Exemple : etalons a 3, 7, 11, 14 et 18, note attribuee 11,75 -> lower_or_equal_id est l'etalon a 11 et upper_or_equal_id l'etalon a 14. " +
  "Verifie l'ordre avant de repondre : la note de lower_or_equal_id ne peut JAMAIS etre superieure a la tienne, ni celle de upper_or_equal_id inferieure. " +
  "Si aucun etalon n'encadre la note d'un cote, reprends l'etalon le plus proche de ce cote et dis-le dans explanation.";

// Criteres communs, reecrits par grille quand les points changent.
const CRIT_CHERCHER = (max) => ({
  code: 'CHE',
  name: 'Chercher',
  maximum_score: max,
  description:
    "S'engager dans la recherche : extraire l'information utile de l'enonce, tester, essayer un cas particulier, reformuler la question en termes mathematiques. On valorise les traces de recherche, meme infructueuses, des lors qu'elles sont exploitables.",
  levels: {
    '0': 'Copie blanche sur cet exercice, ou aucune trace de recherche.',
    [String(max * 0.25)]: "Insuffisant : l'enonce est recopie, aucune donnee n'est triee, la question posee n'est pas identifiee.",
    [String(max * 0.5)]: 'Fragile : la question est comprise globalement, mais la recherche s\'arrete au premier obstacle.',
    [String(max * 0.75)]: "Satisfaisant : donnees utiles reperees, question traduite en termes mathematiques, une piste engagee jusqu'au bout.",
    [String(max)]: "Tres satisfaisant : plusieurs pistes explorees, cas particulier teste ou conjecture formulee avant la demonstration.",
  },
});

const CRIT_COMMUNIQUER = (max) => ({
  code: 'COM',
  name: 'Communiquer',
  maximum_score: max,
  description:
    "Rediger : enoncer ce que l'on cherche, ce que l'on utilise et ce que l'on conclut, avec les notations mathematiques justes, des phrases completes et une conclusion replacee dans le contexte de l'exercice.",
  levels: {
    '0': 'Aucune redaction : suite de calculs sans un mot.',
    [String(max * 0.25)]: 'Insuffisant : notations fausses ou flottantes, aucune phrase, aucun resultat enonce.',
    [String(max * 0.5)]: 'Fragile : calculs lisibles mais rarement introduits ni conclus ; la meme lettre designe parfois deux objets.',
    [String(max * 0.75)]: 'Satisfaisant : les etapes sont annoncees, les resultats enonces en phrase, les notations correctes.',
    [String(max)]: "Tres satisfaisant : redaction rigoureuse, quantificateurs et connecteurs logiques justes, conclusion replacee dans la situation avec unite et arrondi conformes a la consigne.",
  },
});

// ---------------------------------------------------------------------
//  1) LES 4 GRILLES
//     Criteres repris des six competences mathematiques du programme
//     officiel (chercher, modeliser, representer, raisonner, calculer,
//     communiquer). La ponderation, elle, est un choix des Matinees du
//     Bac : c'est le premier point a faire trancher par un professeur.
// ---------------------------------------------------------------------
export const rubrics = [
  {
    id: 'MA_ANALYSE_V1',
    track: 'generale',
    exercise_type: 'maths_analyse',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de mathematiques en terminale generale, specialite mathematiques. " +
      "Tu corriges un exercice d'analyse : fonctions, suites, limites, derivation, convexite, integration. " +
      "Tu evalues par COMPETENCES, pas question par question : une meme competence se juge sur l'ensemble de la copie. " +
      "Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire la copie ideale. " +
      "Regle centrale de la matiere : ce qui est note, c'est la demonstration, pas le resultat. Un resultat juste tombe sans justification ne rapporte pas les points de raisonnement ; une demonstration correcte dont l'application numerique finale est fausse les conserve. " +
      "Tu exiges qu'un theoreme soit nomme quand il est utilise (theoreme des valeurs intermediaires, croissances comparees, theoreme de comparaison, recurrence) et que ses hypotheses soient verifiees avant sa conclusion. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la transcription est incertaine sur un signe, un indice ou un exposant, si la copie repose sur un tableau de variations ou une courbe non transcrits, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un exercice d'analyse se juge sur une chaine de deductions : la question est comprise, un outil est choisi et ses hypotheses verifiees, le calcul est mene proprement, le resultat est enonce et interprete.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les six competences mathematiques du programme de specialite de terminale (chercher, modeliser, representer, raisonner, calculer, communiquer). La ponderation CHE 3 / RAI 6 / CAL 5 / MOD 3 / COM 3 est un choix des Matinees du Bac, pas un bareme officiel.",
      exam_context:
        "Epreuve de specialite : 4 exercices de 5 points chacun, 4 heures, calculatrice autorisee. Cet exercice est ramene sur 20 pour la correction automatique.",
      criteria: [
        CRIT_CHERCHER(3),
        {
          code: 'RAI',
          name: 'Raisonner',
          maximum_score: 6,
          description:
            "Demontrer : enchainer des deductions valides, nommer les theoremes employes, verifier leurs hypotheses avant d'en tirer la conclusion, conduire une recurrence complete. C'est le coeur de la note.",
          levels: {
            '0': 'Aucun raisonnement exploitable.',
            '1.5': "Insuffisant : affirmations sans preuve, lecture graphique donnee comme demonstration, theoremes cites sans hypothese verifiee.",
            '3': "Fragile : une deduction juste apparait, mais la chaine se rompt — etape manquante, hypothese jamais verifiee, recurrence sans initialisation.",
            '4.5': "Satisfaisant : raisonnement coherent et suivi, theoremes nommes et applicables, une justification reste elliptique.",
            '6': "Tres satisfaisant : chaque affirmation est demontree, les hypotheses sont verifiees explicitement, la recurrence est complete, le raisonnement est le plus economique.",
          },
        },
        {
          code: 'CAL',
          name: 'Calculer',
          maximum_score: 5,
          description:
            "Executer : derivees, limites, resolution d'equations et d'inequations, calcul de primitives et d'integrales, manipulation de exp et de ln. On juge l'execution, pas le choix de la methode.",
          levels: {
            '0': 'Aucun calcul exploitable.',
            '1.25': "Insuffisant : erreurs des la premiere ligne, derivees fausses, regles de calcul sur exp ou ln inventees.",
            '2.5': 'Fragile : erreurs locales repetees (signes, fractions, puissances) qui faussent les resultats, mais la mecanique du calcul est visible.',
            '3.75': "Satisfaisant : calculs justes dans l'ensemble, une erreur locale sans consequence sur la suite.",
            '5': 'Tres satisfaisant : calculs exacts, formes simplifiees, valeurs exactes conservees jusqu\'au dernier moment, arrondi conforme a la consigne.',
          },
        },
        {
          code: 'MOD',
          name: 'Modeliser',
          maximum_score: 3,
          description:
            "Traduire la situation en objets mathematiques et revenir au contexte : reconnaitre une suite dans une evolution, une fonction dans un phenomene, interpreter une limite ou un extremum dans les termes de l'enonce.",
          levels: {
            '0': 'Aucune traduction de la situation.',
            '0.75': "Insuffisant : le contexte est ignore, les objets mathematiques sont manipules hors sol.",
            '1.5': 'Fragile : la modelisation est amorcee mais jamais reliee a la question posee.',
            '2.25': 'Satisfaisant : la situation est traduite correctement et le resultat interprete en contexte.',
            '3': "Tres satisfaisant : modelisation explicite, hypotheses du modele discutees, resultat interprete et sa portee nuancee.",
          },
        },
        CRIT_COMMUNIQUER(3),
      ],
      common_error_taxonomy: taxoPour([
        'MA-JUST-01', 'MA-RECUR-01', 'MA-LIM-01', 'MA-DERIV-01', 'MA-VAR-01',
        'MA-EXP-01', 'MA-INT-01', 'MA-SUITE-01', 'MA-CALC-01', 'MA-REDAC-01',
        'MA-UNIT-01', 'MA-TRANS-01',
      ]),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },

  {
    id: 'MA_PROBABILITES_V1',
    track: 'generale',
    exercise_type: 'maths_probabilites',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de mathematiques en terminale generale, specialite mathematiques. " +
      "Tu corriges un exercice de probabilites : probabilites conditionnelles, arbre pondere, formule des probabilites totales, variables aleatoires, loi binomiale, esperance, echantillonnage. " +
      "Tu evalues par COMPETENCES, pas question par question. " +
      "Regle centrale : la modelisation est la moitie de l'exercice. Nommer les evenements, verifier que les conditions d'une loi sont reunies et enoncer la formule employee AVANT de calculer vaut plus que le resultat numerique. " +
      "Tu exiges qu'une loi binomiale ne soit invoquee qu'apres verification de ses conditions (repetition d'epreuves identiques et independantes, deux issues) et que ses parametres soient identifies explicitement. " +
      "Tu distingues strictement P_A(B) de P(A inter B) : c'est l'erreur la plus frequente de la matiere, tu la reperes et tu la nommes. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      "Tu demandes une verification humaine si la copie repose sur un arbre pondere non transcrit, si la transcription est incertaine, ou si la note est frontiere. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un exercice de probabilites se juge sur une modelisation : les evenements sont nommes, la loi est justifiee, la formule est enoncee avant d'etre appliquee, le resultat est interprete dans la situation.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les six competences mathematiques du programme de specialite de terminale. La ponderation CHE 3 / MOD 5 / RAI 5 / CAL 4 / COM 3 est un choix des Matinees du Bac : elle donne plus de poids a la modelisation qu'en analyse, parce que l'essentiel de l'erreur en probabilites est un probleme de traduction, pas de calcul.",
      exam_context:
        "Epreuve de specialite : 4 exercices de 5 points chacun, 4 heures, calculatrice autorisee. Cet exercice est ramene sur 20 pour la correction automatique.",
      criteria: [
        CRIT_CHERCHER(3),
        {
          code: 'MOD',
          name: 'Modeliser',
          maximum_score: 5,
          description:
            "Traduire l'enonce en objets probabilistes : nommer les evenements, construire l'univers, reconnaitre et justifier la loi (binomiale, uniforme, variable aleatoire definie par un tableau), identifier ses parametres.",
          levels: {
            '0': 'Aucune modelisation.',
            '1.25': "Insuffisant : aucun evenement nomme, probabilites manipulees sans savoir de quoi elles sont la probabilite.",
            '2.5': "Fragile : evenements nommes mais loi non justifiee, ou conditions de la loi binomiale jamais verifiees.",
            '3.75': "Satisfaisant : evenements definis, loi identifiee et justifiee, parametres explicites.",
            '5': "Tres satisfaisant : modelisation complete et commentee, independance ou partition verifiee, choix du modele discute.",
          },
        },
        {
          code: 'RAI',
          name: 'Raisonner',
          maximum_score: 5,
          description:
            "Enchainer : appliquer la formule des probabilites totales sur une vraie partition, distinguer probabilite conditionnelle et intersection, conclure sur un seuil ou une comparaison en revenant a la question posee.",
          levels: {
            '0': 'Aucun raisonnement exploitable.',
            '1.25': "Insuffisant : formules employees au hasard, conditionnelle et intersection confondues.",
            '2.5': 'Fragile : la bonne formule apparait mais son domaine d\'application n\'est pas verifie (partition incomplete, evenements non incompatibles).',
            '3.75': 'Satisfaisant : raisonnement correct et annonce, une justification reste implicite.',
            '5': "Tres satisfaisant : chaque etape est justifiee, la partition est verifiee, la conclusion repond exactement a la question posee.",
          },
        },
        {
          code: 'CAL',
          name: 'Calculer',
          maximum_score: 4,
          description:
            "Executer : produits et sommes de probabilites, coefficients binomiaux, esperance et ecart-type, arrondis conformes a la consigne, usage correct de la calculatrice.",
          levels: {
            '0': 'Aucun calcul exploitable.',
            '1': "Insuffisant : resultats hors de l'intervalle [0 ; 1], calculs faux des la premiere ligne.",
            '2': 'Fragile : erreurs de calcul repetees ou arrondis fantaisistes, mais la mecanique est visible.',
            '3': 'Satisfaisant : calculs justes, une erreur locale sans consequence.',
            '4': "Tres satisfaisant : calculs exacts, arrondis conformes, valeurs verifiees par un ordre de grandeur.",
          },
        },
        CRIT_COMMUNIQUER(3),
      ],
      common_error_taxonomy: taxoPour([
        'MA-COND-01', 'MA-BINOM-01', 'MA-ESP-01', 'MA-ARBRE-01', 'MA-JUST-01',
        'MA-CALC-01', 'MA-REDAC-01', 'MA-UNIT-01', 'MA-TRANS-01',
      ]),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },

  {
    id: 'MA_GEOMETRIE_ESPACE_V1',
    track: 'generale',
    exercise_type: 'maths_geometrie_espace',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de mathematiques en terminale generale, specialite mathematiques. " +
      "Tu corriges un exercice de geometrie dans l'espace : reperage, vecteurs, produit scalaire, representations parametriques, equations cartesiennes de plans, positions relatives, distances et projetes orthogonaux. " +
      "Tu evalues par COMPETENCES, pas question par question. " +
      "Regle centrale : dans l'espace, aucune propriete ne se lit sur une figure. Colinearite, orthogonalite, coplanarite, appartenance : tout se demontre par le calcul. Une affirmation appuyee sur le dessin ne vaut aucun point de raisonnement. " +
      "Tu distingues strictement vecteur normal et vecteur directeur, equation cartesienne et representation parametrique. " +
      "Tu exiges qu'un parametre different soit employe pour deux droites distinctes lors d'une recherche d'intersection. " +
      "ATTENTION : la figure de l'exercice ne t'est PAS transmise. Tu ne juges jamais une construction, un trace ou un codage de figure ; tu signales qu'ils relevent de la relecture du professeur. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un exercice de geometrie dans l'espace se juge sur des preuves calculatoires : le repere est pose, les coordonnees sont justes, chaque propriete geometrique est etablie par un calcul, le resultat est interprete geometriquement.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les six competences mathematiques du programme de specialite de terminale. La ponderation CHE 3 / REP 4 / RAI 5 / CAL 5 / COM 3 est un choix des Matinees du Bac ; le critere Representer y remplace Modeliser, la traduction en coordonnees etant l'acte central de l'exercice.",
      exam_context:
        "Epreuve de specialite : 4 exercices de 5 points chacun, 4 heures, calculatrice autorisee. Cet exercice est ramene sur 20 pour la correction automatique.",
      criteria: [
        CRIT_CHERCHER(3),
        {
          code: 'REP',
          name: 'Representer',
          maximum_score: 4,
          description:
            "Traduire la configuration en coordonnees : choisir ou exploiter le repere, ecrire les coordonnees des points et des vecteurs, passer d'une representation a une autre (parametrique, cartesienne, vectorielle). Le passage a l'ecrit compte, pas le dessin, que le correcteur ne voit pas.",
          levels: {
            '0': 'Aucune traduction en coordonnees.',
            '1': "Insuffisant : coordonnees fausses ou inventees, repere jamais explicite.",
            '2': 'Fragile : quelques coordonnees justes, mais les vecteurs sont mal formes ou les representations melangees.',
            '3': 'Satisfaisant : coordonnees exactes, representations correctes et employees a bon escient.',
            '4': "Tres satisfaisant : toutes les representations sont maitrisees et converties sans erreur, le repere et son orthonormalite sont poses explicitement.",
          },
        },
        {
          code: 'RAI',
          name: 'Raisonner',
          maximum_score: 5,
          description:
            "Demontrer : etablir colinearite, orthogonalite, coplanarite, appartenance et position relative par le calcul, en enoncant la propriete utilisee avant de conclure.",
          levels: {
            '0': 'Aucun raisonnement exploitable.',
            '1.25': "Insuffisant : proprietes affirmees d'apres la figure, vecteur normal et vecteur directeur confondus.",
            '2.5': 'Fragile : un calcul juste est mene mais la conclusion geometrique qui en decoule est absente ou fausse.',
            '3.75': 'Satisfaisant : proprietes demontrees par le calcul et conclusions correctes, une justification reste elliptique.',
            '5': "Tres satisfaisant : chaque propriete est demontree, la propriete utilisee est nommee, la conclusion geometrique est explicite.",
          },
        },
        {
          code: 'CAL',
          name: 'Calculer',
          maximum_score: 5,
          description:
            "Executer : produits scalaires, normes, resolution de systemes, equations de plans, distances et projetes orthogonaux, aires et volumes.",
          levels: {
            '0': 'Aucun calcul exploitable.',
            '1.25': "Insuffisant : coordonnees soustraites a l'envers, produit scalaire calcule comme un produit terme a terme sans somme.",
            '2.5': 'Fragile : erreurs de signe ou de systeme repetees, mais la mecanique du calcul est visible.',
            '3.75': 'Satisfaisant : calculs justes dans l\'ensemble, une erreur locale sans consequence sur la suite.',
            '5': "Tres satisfaisant : calculs exacts, valeurs exactes conservees (racines non arrondies prematurement), solutions verifiees dans le systeme d'origine.",
          },
        },
        CRIT_COMMUNIQUER(3),
      ],
      common_error_taxonomy: taxoPour(
        [
          'MA-VECT-01', 'MA-PLAN-01', 'MA-PARAM-01', 'MA-SCAL-01', 'MA-JUST-01',
          'MA-CALC-01', 'MA-REDAC-01', 'MA-UNIT-01', 'MA-TRANS-01',
        ],
        // Cette grille n'a pas de critere MOD : les codes qui y renvoient
        // sont rediriges vers REP, la traduction en coordonnees.
        { 'MA-PARAM-01': 'CAL' },
      ),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },

  {
    id: 'MA_QCM_JUSTIFIE_V1',
    track: 'generale',
    exercise_type: 'maths_qcm_justifie',
    version: 1,
    status: 'draft',
    system_prompt:
      "Tu es un correcteur expert de mathematiques en terminale generale, specialite mathematiques. " +
      "Tu corriges un exercice de type QCM justifie ou vrai-faux justifie, pouvant comporter une question d'algorithmique ou un script Python. " +
      "Tu evalues par COMPETENCES, pas affirmation par affirmation, mais tu tiens compte du nombre d'affirmations reellement traitees. " +
      "REGLE ABSOLUE DE CE FORMAT : la bonne case cochee sans justification ne vaut RIEN. La justification est l'objet meme de l'evaluation. Inversement, une justification correcte dont la conclusion finale est mal recopiee garde l'essentiel des points de raisonnement. " +
      "Pour refuter une affirmation, un contre-exemple explicite suffit et vaut demonstration complete ; pour l'etablir, un exemple ne vaut jamais preuve : tu fais cette difference et tu la nommes. " +
      "Sur une question d'algorithmique, tu juges l'executabilite : initialisation, condition d'arret, ordre des instructions, valeur renvoyee. Tu ne sanctionnes pas une syntaxe Python approximative si la logique est juste et lisible. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un QCM justifie ne se note pas sur les reponses mais sur les preuves : chaque affirmation exige une demonstration, un contre-exemple ou un calcul qui tranche.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les six competences mathematiques du programme de specialite de terminale. La ponderation CHE 2 / RAI 7 / CAL 5 / ALG 3 / COM 3 est un choix des Matinees du Bac : le raisonnement y pese le plus lourd, conformement a la nature du format.",
      exam_context:
        "Epreuve de specialite : 4 exercices de 5 points chacun, 4 heures, calculatrice autorisee. Cet exercice est ramene sur 20 pour la correction automatique. Le critere ALG n'est note que si l'exercice comporte une question d'algorithmique ; sinon ses points sont reportes a parts egales sur RAI et CAL, et tu le dis dans explanation.",
      criteria: [
        CRIT_CHERCHER(2),
        {
          code: 'RAI',
          name: 'Raisonner',
          maximum_score: 7,
          description:
            "Justifier chaque affirmation : demonstration pour l'etablir, contre-exemple explicite pour la refuter. La reponse seule ne vaut rien ; la qualite et le nombre des justifications font la note.",
          levels: {
            '0': 'Aucune justification : seules des reponses sont donnees.',
            '1.75': "Insuffisant : une seule affirmation justifiee, ou justifications reduites a « c'est vrai car on le sait ».",
            '3.5': 'Fragile : environ la moitie des affirmations recoit un debut de justification, souvent incomplete ou fondee sur un exemple isole.',
            '5.25': "Satisfaisant : la plupart des affirmations sont justifiees correctement ; contre-exemple et demonstration sont employes a bon escient.",
            '7': "Tres satisfaisant : toutes les affirmations sont tranchees par une preuve valide, les contre-exemples sont explicites et verifies, aucune reponse n'est laissee sans argument.",
          },
        },
        {
          code: 'CAL',
          name: 'Calculer',
          maximum_score: 5,
          description:
            "Executer les calculs qui tranchent : derivees, limites, produits scalaires, probabilites, resolutions d'equations, verification d'un contre-exemple.",
          levels: {
            '0': 'Aucun calcul exploitable.',
            '1.25': 'Insuffisant : calculs faux ou absents la ou ils sont indispensables.',
            '2.5': 'Fragile : erreurs de calcul repetees qui faussent les conclusions.',
            '3.75': 'Satisfaisant : calculs justes dans l\'ensemble, une erreur locale sans consequence.',
            '5': 'Tres satisfaisant : calculs exacts et menes au strict necessaire pour trancher.',
          },
        },
        {
          code: 'ALG',
          name: 'Algorithmique et programmation',
          maximum_score: 3,
          description:
            "Lire ou ecrire un algorithme : initialisation des variables, condition d'arret, ordre des instructions, valeur renvoyee, coherence avec la question mathematique posee. La syntaxe Python exacte n'est pas notee, la logique l'est.",
          levels: {
            '0': "Aucune reponse sur la partie algorithmique, ou exercice sans question d'algorithmique (voir exam_context).",
            '0.75': "Insuffisant : variables non initialisees, boucle qui ne se termine pas, algorithme sans rapport avec la question.",
            '1.5': "Fragile : structure globale juste mais condition d'arret fausse ou valeur renvoyee au mauvais moment.",
            '2.25': "Satisfaisant : algorithme executable et correct, une imprecision sans effet sur le resultat.",
            '3': "Tres satisfaisant : algorithme executable, correct, commente, et sa sortie est interpretee dans les termes de la question.",
          },
        },
        CRIT_COMMUNIQUER(3),
      ],
      common_error_taxonomy: taxoPour(
        [
          'MA-QCM-01', 'MA-CTREX-01', 'MA-JUST-01', 'MA-ALGO-01', 'MA-LIM-01',
          'MA-DERIV-01', 'MA-CALC-01', 'MA-REDAC-01', 'MA-TRANS-01',
        ],
        // Cette grille porte un critere ALG absent des trois autres.
        { 'MA-ALGO-01': 'ALG' },
      ),
      guardrails: GARDE_FOUS_COMMUNS,
    },
  },
];

// ---------------------------------------------------------------------
//  2) LES SUJETS
//     Gabarits d'entrainement au format de l'epreuve, ecrits pour Les
//     Matinees du Bac sur les themes du programme officiel. Aucun n'est
//     une annale reproduite, aucun ne doit etre presente comme tel.
// ---------------------------------------------------------------------
const AVERTISSEMENT_SUJET =
  "Gabarit synthetique d'entrainement au format de l'epreuve, pas un sujet officiel ni une annale reproduite.";

const SOURCES_MA = ['MA-PROG-T-SPE', 'MA-DEF-EPREUVE', 'MA-COMPETENCES'];

export const subject_cards = [
  {
    id: 'MA2027_ANA_01',
    track: 'generale',
    exercise_type: 'maths_analyse',
    work_id: 'MA_T_FONCTION_EXP',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice d\'analyse',
      work: "Étude d'une fonction avec exponentielle : f(x) = (x + 2)e^(−x)",
      field: 'Analyse · Terminale · Fonction exponentielle, dérivation, convexité',
      level: 'terminale',
      theme_id: 'MA-ANALYSE',
      theme_title: 'Analyse : fonctions, dérivation, convexité',
      prompt:
        "On considère la fonction f définie sur l'intervalle [0 ; +∞[ par f(x) = (x + 2)e^(−x). On note C sa courbe représentative dans un repère orthonormé.\n"
        + "1. Déterminer la limite de f en +∞ et interpréter graphiquement le résultat.\n"
        + "2. Montrer que, pour tout x de [0 ; +∞[, f'(x) = −(x + 1)e^(−x). En déduire le tableau de variations de f sur [0 ; +∞[.\n"
        + "3. Déterminer une équation de la tangente T à la courbe C au point d'abscisse 0.\n"
        + "4. Étudier la convexité de f sur [0 ; +∞[ et préciser les coordonnées de son éventuel point d'inflexion.\n"
        + "5. Montrer que l'équation f(x) = 1 admet une unique solution α sur [0 ; +∞[, puis donner un encadrement de α d'amplitude 10^(−2).",
      document_requirements:
        "aucun document annexe : l'énoncé se suffit à lui-même. La courbe C n'est ni fournie ni transcrite ; l'élève peut la tracer sur sa copie, mais le correcteur automatique ne la voit pas.",
      expected_concepts: [
        'limite en +∞', 'croissances comparées', 'asymptote horizontale', 'dérivée d\'un produit',
        'signe de la dérivée', 'tableau de variations', 'équation de tangente', 'dérivée seconde',
        'convexité', 'point d\'inflexion', 'théorème des valeurs intermédiaires', 'stricte monotonie',
      ],
      expected_mechanisms: [
        "La limite en +∞ se lève par croissances comparées : e^(−x) l'emporte sur le facteur affine, donc f(x) tend vers 0 ; l'interprétation graphique attendue est l'asymptote horizontale d'équation y = 0.",
        "La dérivée s'obtient par la règle du produit : f'(x) = e^(−x) − (x + 2)e^(−x) = −(x + 1)e^(−x). Le signe se lit en remarquant que e^(−x) > 0 pour tout x, donc f'(x) < 0 sur [0 ; +∞[ : f est strictement décroissante, de f(0) = 2 vers 0.",
        "La tangente en 0 s'écrit y = f'(0)(x − 0) + f(0), soit y = −x + 2 : le calcul de f(0) et de f'(0) doit apparaître.",
        "La dérivée seconde vaut f''(x) = x·e^(−x), positive sur ]0 ; +∞[ : f est convexe, et le point d'abscisse 0 est un point d'inflexion frontière — sa discussion fine est le vrai discriminant de l'exercice.",
        "L'unicité de α s'établit par le théorème des valeurs intermédiaires appliqué à une fonction continue et strictement décroissante sur [0 ; +∞[, avec f(0) = 2 > 1 et la limite 0 < 1 ; l'encadrement se termine à la calculatrice, α ≈ 1,14.",
      ],
      traps: [
        "annoncer une forme indéterminée en +∞ puis conclure sans invoquer les croissances comparées",
        "dériver le produit en dérivant chaque facteur séparément",
        "oublier que e^(−x) est strictement positif et discuter un signe qui ne se pose pas",
        "confondre la tangente au point d'abscisse 0 et la tangente au point d'ordonnée 0",
        "conclure à l'existence de α sans mentionner ni la continuité ni la stricte monotonie",
        "donner α avec cinq décimales alors que l'énoncé demande un encadrement d'amplitude 10^(−2)",
      ],
      special_criteria: [
        "le théorème des valeurs intermédiaires doit être nommé et ses hypothèses vérifiées explicitement",
        "l'interprétation graphique de la limite (asymptote) doit être écrite, pas seulement la limite",
        "le tableau de variations doit être cohérent avec le signe de f' réellement établi",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_ANA_02',
    track: 'generale',
    exercise_type: 'maths_analyse',
    work_id: 'MA_T_SUITES_SEUIL',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice d\'analyse',
      work: 'Suite définie par récurrence et recherche de seuil : population d\'un lac',
      field: 'Analyse · Terminale · Suites, limites, algorithmique',
      level: 'terminale',
      theme_id: 'MA-ANALYSE',
      theme_title: 'Analyse : suites et limites',
      prompt:
        "Un lac contient 200 poissons d'une espèce donnée au 1er janvier 2026. Chaque année, 20 % de la population disparaît et 30 poissons sont réintroduits. On note u_n le nombre de poissons au 1er janvier de l'année 2026 + n, donc u_0 = 200.\n"
        + "1. Justifier que, pour tout entier naturel n, u_(n+1) = 0,8 u_n + 30. Calculer u_1 et u_2.\n"
        + "2. On pose v_n = u_n − 150. Démontrer que la suite (v_n) est géométrique ; préciser sa raison et son premier terme.\n"
        + "3. En déduire l'expression de u_n en fonction de n, puis la limite de la suite (u_n). Interpréter ce résultat pour la population du lac.\n"
        + "4. Démontrer par récurrence que la suite (u_n) est décroissante.\n"
        + "5. On souhaite déterminer la première année où la population passe sous 160 poissons. Compléter et justifier l'algorithme suivant, écrit en Python :\n"
        + "   def seuil():\n       u = 200\n       n = 0\n       while ... :\n           u = ...\n           n = n + 1\n       return n",
      document_requirements:
        "aucun document annexe : les données chiffrées sont dans l'énoncé. L'algorithme est reproduit ci-dessus et fait partie du sujet.",
      expected_concepts: [
        'suite définie par récurrence', 'suite géométrique', 'suite auxiliaire', 'raison',
        'terme général', 'limite d\'une suite géométrique', 'récurrence', 'monotonie', 'seuil', 'boucle while',
      ],
      expected_mechanisms: [
        "La relation de récurrence traduit l'énoncé : il reste 80 % de la population, soit 0,8 u_n, auxquels s'ajoutent 30 poissons. u_1 = 190 et u_2 = 182.",
        "v_(n+1) = u_(n+1) − 150 = 0,8 u_n + 30 − 150 = 0,8(u_n − 150) = 0,8 v_n : la suite (v_n) est géométrique de raison 0,8 et de premier terme v_0 = 50. Le calcul doit partir de v_(n+1), pas être posé comme un résultat.",
        "u_n = 150 + 50 × 0,8^n. Comme 0 < 0,8 < 1, 0,8^n tend vers 0, donc u_n tend vers 150 : la population se stabilise autour de 150 poissons, elle ne s'éteint pas.",
        "La récurrence exige l'initialisation (u_1 < u_0), une hypothèse de récurrence énoncée, et une hérédité qui utilise la croissance de x → 0,8x + 30.",
        "L'algorithme : condition while u >= 160, corps u = 0.8 * u + 30, retour de n. La réponse attendue est n = 7, soit l'année 2033 — le passage de n à l'année est le point le plus souvent oublié.",
      ],
      traps: [
        "écrire u_(n+1) = 0,8 u_n − 30 en confondant disparition et réintroduction",
        "affirmer que (v_n) est géométrique sans partir de v_(n+1)",
        "conclure que la population tend vers 0 parce que la suite est décroissante",
        "faire une récurrence sans initialisation, ou dont l'hérédité suppose ce qu'elle démontre",
        "écrire une condition while u <= 160, qui ne s'exécute jamais",
        "répondre « n = 7 » sans convertir en année civile",
      ],
      special_criteria: [
        "la démonstration du caractère géométrique doit partir de v_(n+1) et aboutir à v_(n+1) = 0,8 v_n",
        "la récurrence doit comporter initialisation, hypothèse et hérédité explicites",
        "la réponse finale doit être une année civile, pas seulement un rang",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_ANA_03',
    track: 'generale',
    exercise_type: 'maths_analyse',
    work_id: 'MA_T_INTEGRALE_LN',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice d\'analyse',
      work: 'Fonction logarithme, primitive et aire sous la courbe',
      field: 'Analyse · Terminale · Logarithme népérien, intégration',
      level: 'terminale',
      theme_id: 'MA-ANALYSE',
      theme_title: 'Analyse : logarithme et calcul intégral',
      prompt:
        "On considère la fonction g définie sur ]0 ; +∞[ par g(x) = ln(x) / x². On note C sa courbe représentative.\n"
        + "1. Déterminer la limite de g en 0+ puis en +∞.\n"
        + "2. Calculer g'(x) et étudier les variations de g sur ]0 ; +∞[. En déduire la valeur exacte du maximum de g.\n"
        + "3. On pose G(x) = −(ln(x) + 1) / x. Démontrer que G est une primitive de g sur ]0 ; +∞[.\n"
        + "4. En déduire la valeur exacte de l'intégrale I = ∫ de 1 à e de g(x) dx, puis une valeur approchée à 10^(−3) près.\n"
        + "5. Interpréter I géométriquement en précisant l'unité d'aire.",
      document_requirements:
        "aucun document annexe : la primitive candidate G est fournie dans l'énoncé, l'élève n'a pas à la trouver mais à la valider par dérivation.",
      expected_concepts: [
        'domaine de définition', 'limite en 0+', 'croissances comparées', 'dérivée d\'un quotient',
        'signe de la dérivée', 'maximum', 'primitive', 'intégrale', 'unité d\'aire', 'valeur exacte et valeur approchée',
      ],
      expected_mechanisms: [
        "En 0+, ln(x) tend vers −∞ et x² vers 0+ : g(x) tend vers −∞, aucun théorème de croissances comparées n'est nécessaire ici. En +∞, les croissances comparées donnent la limite 0.",
        "La dérivée d'un quotient donne g'(x) = (1 − 2 ln(x)) / x³. Sur ]0 ; +∞[, x³ > 0 : le signe est celui de 1 − 2 ln(x), qui s'annule en x = e^(1/2) = √e. Le maximum vaut g(√e) = 1 / (2e).",
        "Démontrer que G est une primitive de g se fait en dérivant G, pas en intégrant g : G'(x) = ln(x) / x² = g(x). Le sens de la démonstration est le point noté.",
        "I = G(e) − G(1) = (−2/e) − (−1) = 1 − 2/e, soit environ 0,264.",
        "Comme g est négative sur ]0 ; 1[ et positive sur ]1 ; e[, l'intégrale sur [1 ; e] représente l'aire, en unités d'aire, du domaine compris entre C, l'axe des abscisses et les droites d'équations x = 1 et x = e.",
      ],
      traps: [
        "invoquer les croissances comparées en 0+ alors que la forme n'est pas indéterminée",
        "dériver le quotient en dérivant numérateur et dénominateur séparément",
        "intégrer g pour retrouver G au lieu de dériver G, ce qui ne démontre rien de ce qui est demandé",
        "confondre valeur exacte (1 − 2/e) et valeur approchée, ou donner uniquement l'approchée",
        "oublier l'unité d'aire dans l'interprétation géométrique",
        "affirmer que l'intégrale est l'aire sans vérifier le signe de la fonction sur l'intervalle",
      ],
      special_criteria: [
        "la question 3 doit être traitée par dérivation de G, tout autre chemin ne répond pas à la consigne",
        "la valeur exacte de l'intégrale doit apparaître avant toute valeur approchée",
        "l'interprétation géométrique doit mentionner l'unité d'aire et le signe de g sur [1 ; e]",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_PROBA_01',
    track: 'generale',
    exercise_type: 'maths_probabilites',
    work_id: 'MA_T_PROBA_COND',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice de probabilités',
      work: 'Probabilités conditionnelles et formule des probabilités totales : contrôle qualité',
      field: 'Probabilités · Terminale · Conditionnement, arbre pondéré',
      level: 'terminale',
      theme_id: 'MA-PROBA',
      theme_title: 'Probabilités conditionnelles et variables aléatoires',
      prompt:
        "Une entreprise fabrique des capteurs sur deux chaînes de production. La chaîne A produit 60 % des capteurs, la chaîne B le reste. On sait que 3 % des capteurs issus de A sont défectueux, contre 5 % de ceux issus de B. On prélève au hasard un capteur dans la production totale. On note A l'événement « le capteur provient de la chaîne A », B l'événement « le capteur provient de la chaîne B » et D l'événement « le capteur est défectueux ».\n"
        + "1. Traduire les données de l'énoncé et représenter la situation par un arbre pondéré.\n"
        + "2. Calculer la probabilité que le capteur provienne de la chaîne A et soit défectueux.\n"
        + "3. Démontrer que la probabilité qu'un capteur prélevé au hasard soit défectueux vaut 0,038.\n"
        + "4. Un capteur prélevé est défectueux. Quelle est la probabilité qu'il provienne de la chaîne B ? Arrondir à 10^(−3).\n"
        + "5. Le service qualité affirme : « plus de la moitié des capteurs défectueux viennent de la chaîne B ». Cette affirmation est-elle exacte ? Justifier.",
      document_requirements:
        "aucun document annexe : toutes les données chiffrées figurent dans l'énoncé. L'arbre pondéré demandé à la question 1 est une production graphique de l'élève ; il n'est PAS transcrit et ne peut donc pas être jugé par le correcteur automatique.",
      expected_concepts: [
        'probabilité conditionnelle', 'arbre pondéré', 'partition de l\'univers',
        'formule des probabilités totales', 'intersection', 'probabilité inverse', 'événement contraire',
      ],
      expected_mechanisms: [
        "Les données se traduisent en P(A) = 0,6, P(B) = 0,4, P_A(D) = 0,03 et P_B(D) = 0,05 : la distinction entre P_A(D) et P(A ∩ D) doit être visible dès cette étape.",
        "P(A ∩ D) = P(A) × P_A(D) = 0,6 × 0,03 = 0,018.",
        "{A ; B} forme une partition de l'univers : P(D) = P(A ∩ D) + P(B ∩ D) = 0,018 + 0,4 × 0,05 = 0,018 + 0,02 = 0,038. La justification du caractère de partition fait partie de la réponse.",
        "P_D(B) = P(B ∩ D) / P(D) = 0,02 / 0,038 ≈ 0,526.",
        "L'affirmation est exacte, puisque P_D(B) ≈ 0,526 > 0,5 — mais la réponse n'a de valeur que rapportée au calcul de la question 4 ; répondre par intuition (« B est plus défectueuse, donc oui ») ne vaut rien.",
      ],
      traps: [
        "écrire P(D) = 0,03 + 0,05 en additionnant des probabilités conditionnelles",
        "confondre P_D(B) et P_B(D), c'est-à-dire inverser le conditionnement à la question 4",
        "appliquer la formule des probabilités totales sans vérifier que {A ; B} est une partition",
        "conclure à la question 5 sans utiliser le résultat de la question 4",
        "donner 0,53 alors que l'énoncé demande un arrondi à 10^(−3)",
      ],
      special_criteria: [
        "les événements doivent être nommés avant tout calcul",
        "la formule des probabilités totales doit être écrite avant d'être appliquée",
        "la question 5 doit s'appuyer explicitement sur la valeur de P_D(B)",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_PROBA_02',
    track: 'generale',
    exercise_type: 'maths_probabilites',
    work_id: 'MA_T_LOI_BINOMIALE',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice de probabilités',
      work: 'Loi binomiale, espérance et seuil : livraisons en retard',
      field: 'Probabilités · Terminale · Loi binomiale, variable aléatoire',
      level: 'terminale',
      theme_id: 'MA-PROBA',
      theme_title: 'Probabilités conditionnelles et variables aléatoires',
      prompt:
        "Un transporteur constate que 12 % de ses livraisons arrivent en retard. On prélève au hasard 50 livraisons dans un volume suffisamment grand pour assimiler ce prélèvement à un tirage avec remise. On note X la variable aléatoire égale au nombre de livraisons en retard parmi les 50.\n"
        + "1. Justifier que X suit une loi binomiale et préciser ses paramètres.\n"
        + "2. Calculer la probabilité qu'exactement 5 livraisons soient en retard. Arrondir à 10^(−3).\n"
        + "3. Calculer la probabilité qu'au moins une livraison soit en retard. Arrondir à 10^(−3).\n"
        + "4. Calculer l'espérance de X et interpréter ce résultat dans le contexte de l'énoncé.\n"
        + "5. Le transporteur veut pouvoir affirmer, avec une probabilité d'au moins 0,95, que le nombre de livraisons en retard ne dépasse pas un seuil k. Déterminer le plus petit entier k qui convient et expliquer la méthode employée avec la calculatrice.",
      document_requirements:
        "aucun document annexe. Les calculs des questions 2, 3 et 5 se mènent à la calculatrice ; l'écran de la calculatrice n'est PAS transcrit, seul ce que l'élève écrit est corrigé.",
      expected_concepts: [
        'schéma de Bernoulli', 'répétition d\'épreuves identiques et indépendantes', 'loi binomiale',
        'paramètres n et p', 'coefficient binomial', 'événement contraire', 'espérance', 'seuil', 'probabilité cumulée',
      ],
      expected_mechanisms: [
        "La justification exige les trois conditions : 50 épreuves identiques, deux issues (en retard / à l'heure), indépendance garantie par l'assimilation à un tirage avec remise. X suit la loi binomiale de paramètres n = 50 et p = 0,12.",
        "P(X = 5) = C(50, 5) × 0,12^5 × 0,88^45 ≈ 0,150 : la formule doit apparaître, pas seulement le résultat de la calculatrice.",
        "P(X ≥ 1) = 1 − P(X = 0) = 1 − 0,88^50 ≈ 0,998 : le passage par l'événement contraire est le raisonnement attendu.",
        "E(X) = n × p = 6 : sur un grand nombre de séries de 50 livraisons, on compte en moyenne 6 retards par série. L'interprétation « il y aura 6 retards » est fausse et doit être signalée.",
        "Le seuil se cherche par probabilités cumulées croissantes : le plus petit k tel que P(X ≤ k) ≥ 0,95 est k = 10. La méthode (tableau de valeurs ou fonction de répartition de la calculatrice) doit être décrite.",
      ],
      traps: [
        "invoquer la loi binomiale sans vérifier ses trois conditions",
        "prendre n = 12 et p = 50, ou confondre les deux paramètres",
        "calculer P(X ≥ 1) comme 1 − P(X = 1)",
        "interpréter l'espérance comme une certitude plutôt que comme une moyenne",
        "chercher le seuil avec P(X ≥ k) au lieu de P(X ≤ k)",
        "donner les résultats sans arrondi conforme, ou avec un arrondi à 10^(−2)",
      ],
      special_criteria: [
        "les trois conditions de la loi binomiale doivent être vérifiées explicitement à la question 1",
        "la formule de P(X = 5) doit être écrite avant l'application numérique",
        "l'interprétation de l'espérance doit mentionner la moyenne sur un grand nombre de répétitions",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_GEO_01',
    track: 'generale',
    exercise_type: 'maths_geometrie_espace',
    work_id: 'MA_T_CUBE_PLAN',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice de géométrie dans l\'espace',
      work: 'Cube, équation cartésienne de plan et distance d\'un point à un plan',
      field: 'Géométrie · Terminale · Vecteurs, produit scalaire, plans',
      level: 'terminale',
      theme_id: 'MA-GEO',
      theme_title: 'Géométrie dans l\'espace',
      prompt:
        "Dans l'espace muni d'un repère orthonormé, on considère le cube ABCDEFGH d'arête 1 tel que A(0 ; 0 ; 0), B(1 ; 0 ; 0), D(0 ; 1 ; 0) et E(0 ; 0 ; 1). Le point G est le sommet opposé à A.\n"
        + "1. Donner sans justification les coordonnées des points C, F, G et H.\n"
        + "2. Démontrer que le vecteur n de coordonnées (1 ; 1 ; 1) est un vecteur normal au plan (BDE).\n"
        + "3. En déduire une équation cartésienne du plan (BDE).\n"
        + "4. Déterminer une représentation paramétrique de la droite (AG), puis démontrer que la droite (AG) est orthogonale au plan (BDE).\n"
        + "5. Déterminer les coordonnées du point d'intersection K de la droite (AG) et du plan (BDE), puis calculer la distance du point A au plan (BDE). Donner la valeur exacte.",
      document_requirements:
        "aucun document annexe : les coordonnées nécessaires sont dans l'énoncé. Une figure du cube peut être tracée par l'élève, mais elle n'est PAS transcrite : aucune propriété ne peut être justifiée en s'y référant.",
      expected_concepts: [
        'repère orthonormé', 'coordonnées de points et de vecteurs', 'produit scalaire',
        'vecteur normal', 'équation cartésienne d\'un plan', 'représentation paramétrique',
        'orthogonalité droite-plan', 'point d\'intersection', 'distance d\'un point à un plan',
      ],
      expected_mechanisms: [
        "Les coordonnées se déduisent de la structure du cube : C(1 ; 1 ; 0), F(1 ; 0 ; 1), G(1 ; 1 ; 1), H(0 ; 1 ; 1).",
        "Pour montrer que n est normal au plan (BDE), il faut deux produits scalaires nuls avec deux vecteurs non colinéaires du plan, par exemple vec(BD) = (−1 ; 1 ; 0) et vec(BE) = (−1 ; 0 ; 1) : n·vec(BD) = 0 et n·vec(BE) = 0, et la non-colinéarité doit être mentionnée.",
        "L'équation est de la forme x + y + z + d = 0 ; en substituant B(1 ; 0 ; 0), d = −1, d'où x + y + z − 1 = 0.",
        "La droite (AG) est dirigée par vec(AG) = (1 ; 1 ; 1) = n, donc de représentation paramétrique x = t, y = t, z = t. Un vecteur directeur colinéaire à un vecteur normal du plan suffit à conclure à l'orthogonalité.",
        "En substituant dans l'équation : 3t − 1 = 0, donc t = 1/3 et K(1/3 ; 1/3 ; 1/3). La distance AK vaut √(3 × 1/9) = √3/3, valeur exacte à ne pas remplacer par 0,577.",
      ],
      traps: [
        "affirmer l'orthogonalité de (AG) et (BDE) « parce qu'on le voit sur la figure »",
        "utiliser un seul produit scalaire nul pour conclure qu'un vecteur est normal au plan",
        "confondre vecteur normal et vecteur directeur, et écrire une équation cartésienne pour une droite",
        "oublier de vérifier que les deux vecteurs du plan ne sont pas colinéaires",
        "donner la distance sous forme décimale arrondie alors que la valeur exacte est demandée",
        "réutiliser le même paramètre pour deux objets différents",
      ],
      special_criteria: [
        "toute propriété géométrique doit être établie par un calcul, jamais par lecture de figure",
        "la non-colinéarité des deux vecteurs du plan doit être signalée à la question 2",
        "la valeur exacte √3/3 (ou 1/√3) est exigée à la question 5",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_GEO_02',
    track: 'generale',
    exercise_type: 'maths_geometrie_espace',
    work_id: 'MA_T_DROITES_PROJETE',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Exercice de géométrie dans l\'espace',
      work: 'Positions relatives de deux droites et projeté orthogonal',
      field: 'Géométrie · Terminale · Représentations paramétriques, produit scalaire',
      level: 'terminale',
      theme_id: 'MA-GEO',
      theme_title: 'Géométrie dans l\'espace',
      prompt:
        "Dans l'espace muni d'un repère orthonormé, on considère les points A(1 ; 2 ; −1), B(3 ; 0 ; 1) et C(2 ; 1 ; 3), ainsi que la droite d de représentation paramétrique x = 1 + 2t, y = 2 − 2t, z = −1 + 2t, t décrivant l'ensemble des réels.\n"
        + "1. Démontrer que la droite d est la droite (AB).\n"
        + "2. Le point C appartient-il à la droite d ? Justifier.\n"
        + "3. Démontrer que le triangle ABC est rectangle en C.\n"
        + "4. Déterminer les coordonnées du projeté orthogonal H du point C sur la droite (AB).\n"
        + "5. En déduire la distance du point C à la droite (AB), puis l'aire du triangle ABC. Donner les valeurs exactes.",
      document_requirements:
        "aucun document annexe : les coordonnées et la représentation paramétrique figurent dans l'énoncé. Aucune figure n'est fournie ni transcrite.",
      expected_concepts: [
        'représentation paramétrique', 'vecteur directeur', 'appartenance d\'un point à une droite',
        'produit scalaire', 'orthogonalité', 'projeté orthogonal', 'distance d\'un point à une droite', 'aire d\'un triangle',
      ],
      expected_mechanisms: [
        "vec(AB) = (2 ; −2 ; 2) est un vecteur directeur de d et A appartient à d (t = 0) : la droite d passe par A et est dirigée par vec(AB), donc d = (AB). Les deux arguments sont nécessaires.",
        "C appartient à d s'il existe un unique t vérifiant les trois équations : 1 + 2t = 2 donne t = 1/2, mais 2 − 2t = 1 donne t = 1/2 et −1 + 2t = 0 ≠ 3. Le système est incompatible : C n'appartient pas à d. Tester une seule coordonnée ne prouve rien.",
        "vec(CA) = (−1 ; 1 ; −4) et vec(CB) = (1 ; −1 ; −2) : leur produit scalaire vaut −1 − 1 + 8 = 6, non nul. L'énoncé étant volontairement piégeux, l'élève doit conclure que le triangle n'est PAS rectangle en C et le dire — c'est le discriminant de l'exercice.",
        "H est le point de d tel que vec(CH)·vec(AB) = 0 : en écrivant H(1 + 2t ; 2 − 2t ; −1 + 2t) et en résolvant, on obtient t = 5/6 et H(8/3 ; 1/3 ; 2/3).",
        "CH se calcule à partir des coordonnées de H et de C, et l'aire vaut (AB × CH)/2, en unités d'aire, valeurs exactes conservées sous forme de racines.",
      ],
      traps: [
        "conclure que d = (AB) en vérifiant seulement que vec(AB) dirige d, sans vérifier qu'un point commun existe",
        "tester l'appartenance de C avec une seule des trois équations",
        "affirmer que le triangle est rectangle en C parce que la question le suggère, sans calculer le produit scalaire",
        "chercher H en projetant sur un axe du repère plutôt que sur la droite",
        "arrondir les racines carrées avant le calcul final de l'aire",
        "oublier l'unité d'aire dans la conclusion",
      ],
      special_criteria: [
        "la question 3 attend une conclusion NÉGATIVE justifiée par le calcul : le sujet teste la capacité à contredire l'énoncé",
        "l'appartenance d'un point à une droite doit être discutée sur les trois coordonnées",
        "les valeurs exactes doivent être conservées jusqu'à la fin",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_QCM_01',
    track: 'generale',
    exercise_type: 'maths_qcm_justifie',
    work_id: 'MA_T_QCM_MIXTE',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'QCM justifié',
      work: 'QCM justifié : analyse, probabilités et géométrie',
      field: 'Toutes notions · Terminale · QCM avec justification obligatoire',
      level: 'terminale',
      theme_id: 'MA-QCM',
      theme_title: 'Questions à choix multiples justifiées',
      prompt:
        "Pour chacune des cinq affirmations suivantes, indiquer la réponse exacte et LA JUSTIFIER. Une réponse sans justification ne rapporte aucun point.\n"
        + "1. La fonction f définie sur R par f(x) = x·e^x est convexe sur l'intervalle [−1 ; +∞[. Vrai ou faux ?\n"
        + "2. La limite en +∞ de la fonction g définie par g(x) = (3x² + 1) / (x² − 5) vaut : a) 0  b) 3  c) +∞  d) −3/5.\n"
        + "3. X suit la loi binomiale de paramètres n = 20 et p = 0,3. Alors P(X ≤ 5) est égale à : a) 0,416  b) 0,179  c) 0,584  d) 0,821.\n"
        + "4. Dans un repère orthonormé, les droites de vecteurs directeurs u(1 ; 2 ; −1) et v(−2 ; 1 ; 0) sont orthogonales. Vrai ou faux ?\n"
        + "5. La suite (w_n) définie par w_n = (−0,5)^n converge vers 0. Vrai ou faux ?",
      document_requirements:
        "aucun document annexe. La question 3 se traite à la calculatrice ; l'écran n'est pas transcrit, seule la démarche écrite est corrigée.",
      expected_concepts: [
        'convexité et dérivée seconde', 'limite d\'une fonction rationnelle', 'terme de plus haut degré',
        'loi binomiale', 'probabilité cumulée', 'produit scalaire', 'orthogonalité',
        'suite géométrique', 'convergence', 'raison comprise entre −1 et 1',
      ],
      expected_mechanisms: [
        "Question 1 : f''(x) = (x + 2)e^x, positive dès que x ≥ −2, donc en particulier sur [−1 ; +∞[ : l'affirmation est vraie, et la justification passe par le calcul de la dérivée seconde, pas par l'allure de la courbe.",
        "Question 2 : en factorisant par x² au numérateur et au dénominateur, la limite vaut 3 — réponse b. Répondre « forme indéterminée » sans la lever ne vaut rien.",
        "Question 3 : P(X ≤ 5) ≈ 0,416 — réponse a. La démarche attendue est l'usage de la fonction de répartition de la calculatrice, écrite explicitement, et non un calcul de P(X = 5).",
        "Question 4 : u·v = −2 + 2 + 0 = 0, donc les droites sont orthogonales : l'affirmation est vraie, mais la justification exige le calcul du produit scalaire.",
        "Question 5 : −1 < −0,5 < 1, donc la suite géométrique de raison −0,5 converge vers 0 : l'affirmation est vraie. Le piège est de croire que l'alternance de signe empêche la convergence.",
      ],
      traps: [
        "cocher la bonne case sans écrire un mot de justification",
        "justifier la convexité par le tracé de la courbe plutôt que par le signe de la dérivée seconde",
        "annoncer une forme indéterminée à la question 2 sans la lever",
        "confondre P(X ≤ 5) et P(X = 5) à la question 3",
        "conclure à l'orthogonalité de la question 4 sans calculer le produit scalaire",
        "affirmer qu'une suite dont le signe alterne ne peut pas converger",
      ],
      special_criteria: [
        "chaque affirmation doit être tranchée par un calcul ou un théorème nommé",
        "une réponse exacte non justifiée ne rapporte aucun point de raisonnement",
        "la démarche calculatrice de la question 3 doit être décrite par écrit",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },

  {
    id: 'MA2027_QCM_02',
    track: 'generale',
    exercise_type: 'maths_qcm_justifie',
    work_id: 'MA_T_VF_ALGO',
    status: 'draft',
    card_json: {
      session,
      source_status: 'synthetic_training_template_not_official_exam',
      warning: AVERTISSEMENT_SUJET,
      exercise: 'Vrai-faux justifié avec algorithmique',
      work: 'Vrai-faux justifié et algorithme de seuil en Python',
      field: 'Toutes notions · Terminale · Vrai-faux justifié, algorithmique',
      level: 'terminale',
      theme_id: 'MA-QCM',
      theme_title: 'Questions à choix multiples justifiées',
      prompt:
        "Partie A — Pour chacune des quatre affirmations, dire si elle est vraie ou fausse EN JUSTIFIANT. Un contre-exemple explicite suffit pour réfuter ; un exemple ne suffit jamais pour établir.\n"
        + "1. Toute fonction croissante sur R admet une limite finie en +∞.\n"
        + "2. Si une suite (u_n) est majorée, alors elle converge.\n"
        + "3. Pour tous réels strictement positifs a et b, ln(a + b) = ln(a) + ln(b).\n"
        + "4. Si deux événements A et B sont indépendants, alors P_A(B) = P(B).\n"
        + "Partie B — On considère la suite (u_n) définie par u_0 = 1 et u_(n+1) = 1,05 u_n + 2.\n"
        + "5. Écrire une fonction Python seuil(S) qui renvoie le plus petit entier n tel que u_n > S. Justifier que la boucle se termine.",
      document_requirements:
        "aucun document annexe : les quatre affirmations et la définition de la suite figurent dans l'énoncé.",
      expected_concepts: [
        'fonction croissante non majorée', 'contre-exemple', 'suite majorée', 'théorème de la limite monotone',
        'propriétés du logarithme', 'indépendance', 'probabilité conditionnelle', 'boucle while', 'terminaison d\'un algorithme',
      ],
      expected_mechanisms: [
        "Affirmation 1 : fausse, la fonction identité x → x est croissante et tend vers +∞. Le contre-exemple doit être explicite, pas évoqué.",
        "Affirmation 2 : fausse, une suite majorée peut osciller — par exemple u_n = (−1)^n est majorée par 1 et diverge. C'est la croissance ET la majoration qui donnent la convergence.",
        "Affirmation 3 : fausse, la relation juste est ln(ab) = ln(a) + ln(b) ; un contre-exemple numérique (a = b = 1 : ln(2) ≠ 0) suffit à trancher.",
        "Affirmation 4 : vraie, c'est la traduction de la définition de l'indépendance P(A ∩ B) = P(A)P(B) lorsque P(A) ≠ 0 — la condition P(A) ≠ 0 doit apparaître.",
        "Partie B : def seuil(S): u = 1 ; n = 0 ; while u <= S: u = 1.05 * u + 2 ; n = n + 1 ; return n. La terminaison se justifie par la croissance stricte et non majorée de la suite, qui tend vers +∞.",
      ],
      traps: [
        "réfuter une affirmation par « c'est faux » sans donner de contre-exemple",
        "établir une affirmation vraie à partir d'un seul exemple numérique",
        "confondre ln(a + b) et ln(ab) sans vérifier sur un cas",
        "oublier la condition P(A) ≠ 0 à l'affirmation 4",
        "écrire while u > S, ce qui inverse la condition d'arrêt",
        "ne pas initialiser n, ou renvoyer n à l'intérieur de la boucle",
        "ne rien dire de la terminaison de la boucle, pourtant explicitement demandée",
      ],
      special_criteria: [
        "un contre-exemple doit être explicite et vérifié pour valoir réfutation",
        "l'algorithme doit être exécutable : initialisation, condition d'arrêt, valeur renvoyée",
        "la justification de la terminaison de la boucle fait partie de la note",
      ],
      sources: SOURCES_MA,
      teacher_validation_required: true,
    },
  },
];

// ---------------------------------------------------------------------
//  3) LES ETALONS
//     Cinq bandes de notes par sujet. Aucune copie reelle d'eleve de
//     mathematiques juridiquement reutilisable n'etait disponible : ce
//     sont des profils synthetiques de calibration, a remplacer par de
//     vraies copies anonymisees et notees des que possible. C'est le
//     principal facteur d'imprecision de la note.
// ---------------------------------------------------------------------
const BANDES = [
  {
    suffixe: 'N03', score: 3, role: 'niveau_03_tres_insuffisant',
    profil: 'production très insuffisante, blanche ou hors sujet',
    forces: "Quelques données de l'énoncé sont recopiées, sans qu'aucune démarche mathématique ne s'installe.",
    limites: "Aucun raisonnement exploitable : les théorèmes sont absents ou inapplicables, les calculs faux dès la première ligne, rien n'est justifié.",
  },
  {
    suffixe: 'N07', score: 7, role: 'niveau_07_insuffisant',
    profil: 'compréhension fragmentaire',
    forces: "Quelques formules justes sont écrites et une intention de démarche apparaît sur au moins une question.",
    limites: "Justifications absentes ou remplacées par des affirmations, erreurs de calcul majeures, questions abandonnées en cours de route.",
  },
  {
    suffixe: 'N11', score: 11, role: 'niveau_11_moyen',
    profil: 'acquis partiels, démarche visible mais instable',
    forces: "Les outils attendus sont identifiés et les calculs de base menés correctement sur la moitié des questions.",
    limites: "Théorèmes utilisés sans vérifier leurs hypothèses, justifications elliptiques, résultats rarement interprétés en contexte.",
  },
  {
    suffixe: 'N14', score: 14, role: 'niveau_14_bon',
    profil: 'bonne maîtrise avec lacunes localisées',
    forces: "Démarche annoncée et tenue, théorèmes nommés, calculs justes, rédaction lisible et conclusions présentes.",
    limites: "Une hypothèse reste implicite, ou une question difficile est traitée trop vite, ou l'interprétation en contexte s'arrête au résultat brut.",
  },
  {
    suffixe: 'N18', score: 18, role: 'niveau_18_tres_bon',
    profil: 'copie très maîtrisée, complète, justifiée et interprétée',
    forces: "Chaque affirmation est démontrée, les hypothèses des théorèmes sont vérifiées, les calculs sont exacts, les résultats interprétés dans la situation.",
    limites: '',
  },
];

// Erreurs typiques par bande et par exercice : ce que le correcteur doit
// s'attendre a rencontrer a ce niveau-la.
const ERREURS_PAR_EXERCICE = {
  maths_analyse: {
    3: ['MA-JUST-01', 'MA-DERIV-01', 'MA-REDAC-01'],
    7: ['MA-JUST-01', 'MA-LIM-01', 'MA-CALC-01'],
    11: ['MA-RECUR-01', 'MA-VAR-01', 'MA-UNIT-01'],
    14: ['MA-UNIT-01'],
    18: [],
  },
  maths_probabilites: {
    3: ['MA-COND-01', 'MA-BINOM-01', 'MA-REDAC-01'],
    7: ['MA-COND-01', 'MA-ARBRE-01', 'MA-CALC-01'],
    11: ['MA-BINOM-01', 'MA-ESP-01'],
    14: ['MA-UNIT-01'],
    18: [],
  },
  maths_geometrie_espace: {
    3: ['MA-VECT-01', 'MA-PLAN-01', 'MA-REDAC-01'],
    7: ['MA-VECT-01', 'MA-SCAL-01', 'MA-CALC-01'],
    11: ['MA-PARAM-01', 'MA-JUST-01'],
    14: ['MA-UNIT-01'],
    18: [],
  },
  maths_qcm_justifie: {
    3: ['MA-QCM-01', 'MA-JUST-01', 'MA-ALGO-01'],
    7: ['MA-QCM-01', 'MA-CTREX-01', 'MA-ALGO-01'],
    11: ['MA-CTREX-01', 'MA-CALC-01'],
    14: ['MA-REDAC-01'],
    18: [],
  },
};

/**
 * Repartit une note sur 20 entre les criteres, proportionnellement a leur
 * maximum, arrondie au quart de point. Le reste d'arrondi va sur le critere
 * le plus lourd pour que la somme tombe EXACTEMENT juste : le moteur compare
 * note_finale a la somme des criteres et signale tout ecart.
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
          "Profil synthetique de calibration : aucune copie reelle d'eleve de mathematiques juridiquement reutilisable n'etait disponible a l'installation de la matiere. A remplacer ou confirmer par des copies authentiques anonymisees et notees par un professeur.",
        normalised_score_on_20: bande.score,
        criterion_scores: repartir(grille.rubric_json.criteria, bande.score),
        criterion_scale: 'sur 20, echelle de la grille',
      },
    };
  });
});

// ---------------------------------------------------------------------
//  4) LES GABARITS DE DOSSIER ELEVE
//     Meme charpente que SVT / HGGSP / HLP / physique-chimie (8 sections
//     + note en fourchette), vocabulaire adapte aux mathematiques.
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
Tu n'écris nulle part la valeur exacte de note_finale.
RAPPEL D'ÉCHELLE : l'épreuve officielle note chaque exercice sur 5 points. Ce dossier ramène l'exercice sur 20 pour que l'élève se situe. Tu le précises une fois, dans le .cap de couverture, sans y revenir ensuite.`;

const REGLES_MA = `
RÈGLES MATHÉMATIQUES NON NÉGOCIABLES :
- Tu n'inventes JAMAIS un calcul, une valeur, un théorème ou un résultat qui ne figure pas dans la copie, le sujet ou la correction. C'est la règle la plus importante de cette matière.
- Tu ne recorriges pas : tous les scores viennent de correction.criteria, sans exception.
- Toute citation de l'élève vient de la transcription. Si la transcription manque, tu décris sans citer.
- TABLEAUX DE VARIATIONS, COURBES, ARBRES ET FIGURES : la correction automatique ne les a pas vus. Tu ne les commentes jamais comme s'ils avaient été jugés. Quand ils comptent, tu énonces ce qu'ils auraient dû porter (bornes du domaine, signe de la dérivée, valeurs aux extrémités, pondérations des branches, codage de la figure) et tu précises que le professeur les vérifie sur la copie.
- NOTATION : la transcription emploie une convention texte (x^2, u_(n+1), ( a ) / ( b ), sqrt( ), exp( ), ln( ), integrale_(a)^(b), vec(u)). Quand tu cites l'élève, tu RÉTABLIS l'écriture normale — exposants, indices, fraction sur deux étages, symbole d'intégrale — sans jamais changer les valeurs. Tu ne reproches jamais à l'élève une écriture qui vient du transcripteur, et les marques [illisible], [rature], [marge], [TABLEAU non transcrit] n'apparaissent pas telles quelles dans le dossier : tu dis en français ce qu'elles signifient.
- CE QUI SE NOTE, C'EST LA DÉMONSTRATION : chaque fois que tu expliques une perte de points, tu montres la rédaction attendue, pas seulement le bon résultat. Une phrase du type « il fallait trouver 0,038 » est inutile ; « il fallait écrire P(D) = P(A ∩ D) + P(B ∩ D) avant de calculer » est utile.
- Une erreur commise tôt ne se paie qu'une fois : quand tu expliques une perte de points, tu dis explicitement à l'élève que la suite menée correctement avec la valeur fausse reste valorisée.
- Tu tutoies l'élève. Ton exigeant et bienveillant, jamais de flatterie, jamais de reproche sans la correction à appliquer.
- Ne produis rien d'autre que le corps HTML.

BUDGET DE LONGUEUR — contrainte technique, pas stylistique : le dossier complet doit tenir sous 24 000 caractères de HTML. Le générateur est coupé au-delà et l'élève ne reçoit alors RIEN — un dossier dense et court vaut infiniment mieux qu'un dossier complet jamais livré. Tu tiens ce budget en restant au bas des fourchettes quand la copie ne justifie pas plus : 3 erreurs pénalisantes plutôt que 5 si la copie n'en porte que 3, 4 chantiers de progression plutôt que 6, deux paragraphes d'appréciation et pas trois. Tu ne rallonges jamais une section pour la remplir, et tu ne répètes pas d'une section à l'autre ce qui a déjà été dit.`;

const enTeteDossier = (titre, sousTitre) => `
Tu rédiges le dossier HTML de correction d'un élève de terminale générale, spécialité mathématiques, après ${titre}.

STRUCTURE (dans <div class="page"> … <div class="wrap"> … </div></div>) :

COUVERTURE :
- cover-band : <h1>DOSSIER DE CORRECTION</h1><div class="sub">MATHÉMATIQUES · ${sousTitre}</div>
- cover-id : name = identite.eleve ; work = sujet.work ; work-meta = sujet.field + " · Bac blanc" ; badge = fourchette de note, "/ 20" ; cover-note = voir la règle de fourchette plus bas.
- .wrap : rappelle d'abord l'énoncé dans une .box cream (lab "Sujet") = sujet.prompt, resserré si nécessaire aux questions réellement traitées. Puis table.bareme, une ligne par correction.criteria[] avec le nom complet de la compétence, + TOTAL. Puis .cap de contexte rappelant l'échelle sur 20 et, s'il y a lieu, sujet.document_requirements.

SECTION 1 — NOTE DÉTAILLÉE & APPRÉCIATION
- h3.sub "Niveau par compétence" : table.radar, une ligne par critère. Colonne /10 = round(score/maximum*10,1) ; barre width = score/maximum*100 % ; colonne Observation = le NIVEAU ATTEINT parmi Très satisfaisant / Satisfaisant / Fragile / Insuffisant, suivi de six à douze mots de justification.
- h3.sub "Appréciation du correcteur" : correction.appreciation_generale développée en 2 paragraphes .just suivant cet ordre — qualité générale, ce qui fonctionne, le principal frein à une note plus haute, le potentiel réel. Finir par une phrase en gras fixant un objectif chiffré pour la prochaine copie.`;

const sectionsCommunes = (memo) => `
SECTION 3 — CE QUI FAIT BAISSER LA NOTE · CE QUE TU MAÎTRISES
- h3.sub "Erreurs pénalisantes" : 3 à 5 .err construits sur correction.detected_errors, classés par impact décroissant sur la note. Chaque .err dit : ce qui est faux ou manquant · la propriété ou le théorème correct · pourquoi cela coûte des points · "Comment corriger :" en gras avec la RÉDACTION modèle, calcul et justification compris.
- h3.sub "Connaissances et réflexes manquants" : une .box cream (lab "À ajouter") comparant sujet.expected_concepts et sujet.expected_mechanisms à ce que la copie mobilise réellement ; chaque manque avec son énoncé juste en une phrase, ses hypothèses d'application, et l'endroit du devoir où il aurait servi.
- h3.sub "Ce que tu maîtrises déjà" : un .good par correction.points_forts, avec le passage exact qui le prouve et ce qu'un correcteur officiel y valoriserait.

SECTION 5 — PLAN DE PROGRESSION
- Un .prio numéroté par correction.priorites_amelioration (4 à 6 chantiers), format "Problème :" / "Action :". Chaque action doit être applicable dès la prochaine copie ; "apprends ton cours" et "sois plus rigoureux" sont interdits — on écrit le geste exact ("avant d'utiliser le théorème des valeurs intermédiaires, écris en une ligne que la fonction est continue et strictement monotone").

SECTION 6 — EXERCICES CIBLÉS
- 2 tables "Exercice N · titre", chacune ciblant UNE faiblesse réellement observée. Lignes Objectif / Consigne / Réussite. La consigne doit être exécutable en 15 minutes sans document supplémentaire.

SECTION 7 — PROJECTION BAC
- table "Correction apportée" / "Gain estimé" (+0,5 à +2 points, cohérent avec les points réellement perdus au barème) puis <tr class="total"> "Note estimée après corrections" / fourchette au-dessus de la note actuelle, plafonnée à 20. Puis .cap précisant que la projection suppose le même niveau de connaissances.

SECTION 8 — FICHE MÉMO — RÉFLEXES MATHÉMATIQUES
- Ouvre <div class="sec memo"> et commence OBLIGATOIREMENT par l'en-tête numéroté, comme les sections précédentes : <div class="sec-h"><div class="num">8</div><div class="ttl">FICHE MÉMO — RÉFLEXES MATHÉMATIQUES</div></div>. Les huit sections doivent toutes porter leur numéro.
- "MES RÉFLEXES DE MÉTHODE" (mh) + mb ul de 3 li tirés des erreurs réelles de la copie, chacun avec un exemple de rédaction modèle.
${memo}
- .kicker de fin, motivant et chiffré.

Termine par .foot : "Dossier de correction — {eleve} · Mathématiques" | "Les Matinées du Bac".`;

export const dossier_templates = [
  {
    id: 'MA_DOSSIER_ANALYSE_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'maths_analyse',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("un exercice d'analyse (fonctions, suites, limites, dérivation, convexité, intégration)", 'EXERCICE D\'ANALYSE')
      + `

SECTION 2 — LA CHAÎNE DE DÉDUCTIONS
- Reprends l'exercice question par question dans une table "Question" / "Ce que tu as écrit" / "Ce qui était attendu". Une ligne par question réellement traitée, plus une ligne pour chaque question laissée vide (colonne « Ce que tu as écrit » : « rien »).
- Puis une .box cream (lab "Le théorème qu'il fallait nommer") : pour chaque outil attendu de sujet.expected_mechanisms, son énoncé en une phrase ET ses hypothèses à vérifier avant de l'appliquer.

SECTION 4 — LE POINT DE MÉTHODE DE L'EXERCICE
- Une .box (lab "Méthode") détaillant le geste central du sujet : lever une forme indéterminée, mener une récurrence complète, établir l'unicité d'une solution, valider une primitive par dérivation. Trois à cinq étapes numérotées, rédigées comme un modèle réutilisable.`
      + sectionsCommunes(`- "MES FORMULES" (mh) + mb ul de 4 li : dérivées usuelles utiles à CET exercice, propriétés de exp et ln, croissances comparées, forme d'une équation de tangente. Chacune écrite proprement, avec son domaine de validité.`)
      + FOURCHETTE + REGLES_MA,
  },
  {
    id: 'MA_DOSSIER_PROBABILITES_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'maths_probabilites',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier('un exercice de probabilités (conditionnement, arbre pondéré, variables aléatoires, loi binomiale)', 'EXERCICE DE PROBABILITÉS')
      + `

SECTION 2 — LA MODÉLISATION, ÉTAPE PAR ÉTAPE
- Une table "Étape" / "Ce que tu as écrit" / "Ce qui était attendu" couvrant : nommage des événements, arbre ou partition, formule employée, calcul, interprétation en contexte.
- Puis une .box cream (lab "Conditionnelle ou intersection ?") rappelant, sur les données EXACTES du sujet, la différence entre P_A(B), P(A ∩ B) et P(B) — c'est l'erreur la plus coûteuse de la matière, tu l'expliques même si l'élève ne l'a pas commise, en deux lignes dans ce cas.

SECTION 4 — LE POINT DE MÉTHODE DE L'EXERCICE
- Une .box (lab "Méthode") détaillant le geste central : justifier une loi binomiale par ses trois conditions, appliquer la formule des probabilités totales sur une partition vérifiée, ou chercher un seuil par probabilités cumulées. Trois à cinq étapes numérotées, réutilisables telles quelles.`
      + sectionsCommunes(`- "MES RÉFLEXES DE PROBABILITÉS" (mh) + mb ul de 4 li : les trois conditions de la loi binomiale, la formule des probabilités totales, la formule de la probabilité conditionnelle, l'interprétation de l'espérance comme moyenne sur un grand nombre de répétitions.`)
      + FOURCHETTE + REGLES_MA,
  },
  {
    id: 'MA_DOSSIER_GEOMETRIE_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'maths_geometrie_espace',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("un exercice de géométrie dans l'espace (vecteurs, produit scalaire, droites et plans)", 'GÉOMÉTRIE DANS L\'ESPACE')
      + `

SECTION 2 — DES COORDONNÉES À LA PREUVE
- Une table "Question" / "Ce que tu as écrit" / "Ce qui était attendu", une ligne par question traitée et une par question laissée vide.
- Puis une .box cream (lab "Se prouve, ne se voit pas") listant les propriétés que l'exercice demandait d'établir (colinéarité, orthogonalité, appartenance, position relative) avec, pour chacune, LE calcul qui la démontre. Rappelle que la figure n'a pas été transmise au correcteur automatique et que ton professeur la vérifie sur la copie.

SECTION 4 — LE POINT DE MÉTHODE DE L'EXERCICE
- Une .box (lab "Méthode") détaillant le geste central : trouver un vecteur normal et en déduire une équation cartésienne, chercher l'intersection d'une droite et d'un plan par substitution, ou déterminer un projeté orthogonal par une condition de produit scalaire nul. Trois à cinq étapes numérotées.`
      + sectionsCommunes(`- "MES RÉFLEXES DE GÉOMÉTRIE" (mh) + mb ul de 4 li : produit scalaire en coordonnées, condition d'orthogonalité, forme d'une équation cartésienne de plan, forme d'une représentation paramétrique de droite — avec la différence entre vecteur normal et vecteur directeur.`)
      + FOURCHETTE + REGLES_MA,
  },
  {
    id: 'MA_DOSSIER_QCM_ELEVE_V1',
    track: 'generale',
    matiere,
    exercise_type: 'maths_qcm_justifie',
    audience: 'eleve',
    output_format: 'html',
    status: 'draft',
    version: 1,
    system_prompt:
      enTeteDossier("un exercice de type QCM justifié ou vrai-faux justifié, éventuellement avec une question d'algorithmique", 'QCM JUSTIFIÉ')
      + `

SECTION 2 — AFFIRMATION PAR AFFIRMATION
- Une table "Affirmation" / "Ta réponse" / "Ta justification" / "Ce qui était attendu", une ligne par affirmation du sujet, y compris celles laissées vides.
- Puis une .box cream (lab "Réfuter ou établir") rappelant la règle du format : un contre-exemple explicite suffit pour réfuter, un exemple ne suffit jamais pour établir. Illustre-la sur une affirmation précise du sujet.

SECTION 4 — LE POINT DE MÉTHODE DE L'EXERCICE
- Une .box (lab "Méthode") : comment justifier en trois lignes sans rédiger une copie entière — nommer la propriété, l'appliquer aux données de l'affirmation, conclure. Puis, si le sujet comporte une question d'algorithmique, les quatre points de contrôle d'un script : initialisation, condition d'arrêt, mise à jour dans la boucle, valeur renvoyée.`
      + sectionsCommunes(`- "MES RÉFLEXES DE QCM" (mh) + mb ul de 4 li : ne jamais cocher sans justifier, chercher un contre-exemple avant de démontrer une affirmation douteuse, vérifier les cas limites, relire la condition d'arrêt d'une boucle avant de rendre.`)
      + FOURCHETTE + REGLES_MA,
  },
];

export default { matiere, libelle, session, rubrics, subject_cards, benchmark_cards, dossier_templates };
