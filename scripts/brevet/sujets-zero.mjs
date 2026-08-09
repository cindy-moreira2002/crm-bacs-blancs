// =====================================================================
//  SUJETS ZERO OFFICIELS DU DNB 2026 - SERIE GENERALE
//
//  Structure relevee mot pour mot sur les PDF officiels publies par le
//  ministere le 5 decembre 2025 (page eduscol "Les epreuves du DNB") :
//    - 26GENFRQGCME1 / 26GENFRDME1 / 26GENFRRME1  : francais, serie generale ;
//    - "Sujet 0 - Epreuve de mathematiques - serie generale" (sujet A) ;
//    - "Sujet 0 - Epreuve de mathematiques - serie generale" (sujet B).
//
//  CE QUE CE FICHIER CONTIENT, ET CE QU'IL NE CONTIENT PAS
//  ------------------------------------------------------
//  Il contient UNIQUEMENT ce que les sujets officiels ecrivent : les
//  numeros, les enonces, les points annonces, la structure des parties, les
//  textes (dictee, passage de reecriture), les consignes de longueur.
//
//  Il ne contient AUCUN corrige : les sujets zero publies ne sont pas
//  accompagnes de leur corrige. Les champs `elements_attendus`,
//  `reponse_attendue` et `etapes_valorisables` restent donc VIDES, sauf
//  pour les automatismes de mathematiques dont la reponse est un fait
//  arithmetique verifiable (le tiers de 18 vaut 6).
//
//  Consequence VOULUE : `brevet_verifier()` refusera de verrouiller ces
//  baremes tant qu'un professeur ne les aura pas completes, et il dira
//  exactement ce qui manque. C'est la difference entre installer la
//  structure officielle d'un sujet et inventer son corrige.
//
//  Chaque incertitude est portee par un champ `a_verifier`.
//
//  La SERIE PROFESSIONNELLE n'est pas traitee : le dispositif ne couvre
//  que la serie generale.
// =====================================================================

export const SOURCE_SUJETS_ZERO = 'SUJETS_ZERO_2026_SG';

/* ------------------------------------------------------------------ */
/*  1. Francais - serie generale                                       */
/* ------------------------------------------------------------------ */

/**
 * Les points sont ceux imprimes sur le sujet.
 * Comprehension 32 + grammaire 8 + reecriture 10 = 50.
 */
const FRANCAIS_QUESTIONS = [
  // --- I. Comprehension et competences d'interpretation (32 points) ---
  {
    question_key: 'q1', numero: '1', partie: 'comprehension', max_points: 4,
    type_reponse: 'comprehension_globale', degre_justification: 'aucun',
    competences: ['lire'],
    libelle:
      'Donnez un titre a chacune des quatre parties du texte : lignes 1 a 17 ; lignes 18 a 32 ; lignes 33 a 36 ; ligne 37.',
  },
  {
    question_key: 'q2', numero: '2', partie: 'comprehension', max_points: 4,
    type_reponse: 'justification_par_le_texte', degre_justification: 'citation',
    competences: ['lire'],
    libelle:
      'Lignes 1 a 17 : quel sentiment ou quelle emotion eprouve le narrateur dans cette premiere partie du texte ? Justifiez votre reponse par deux citations du texte.',
  },
  {
    question_key: 'q3', numero: '3', partie: 'comprehension', max_points: 6,
    type_reponse: 'analyse_de_procede', degre_justification: 'citation_expliquee',
    competences: ['lire', 'culture'],
    libelle:
      "Lignes 14 a 20 : comment le narrateur rend-il compte de son inquietude ? Deux elements de reponse sont attendus. Chacun d'eux s'appuiera sur l'identification precise et l'analyse d'un procede d'ecriture.",
  },
  {
    question_key: 'q4', numero: '4', partie: 'comprehension', max_points: 4,
    type_reponse: 'justification_par_le_texte', degre_justification: 'citation',
    competences: ['lire'],
    libelle:
      'Lignes 20 a 32 : que fait le narrateur pour se rassurer ? Deux elements de reponse sont attendus, justifies chacun par une citation du texte.',
  },
  {
    question_key: 'q5', numero: '5', partie: 'comprehension', max_points: 6,
    type_reponse: 'interpretation', degre_justification: 'citation',
    competences: ['lire'],
    libelle:
      "Comment le narrateur, tout au long du texte, parvient-il a entretenir le doute sur la presence d'un ennemi ? Vous developperez votre reponse en vous appuyant sur trois elements, justifies chacun par une citation du texte.",
  },
  {
    question_key: 'q6', numero: '6', partie: 'comprehension', max_points: 8,
    type_reponse: 'comparaison_texte_image', degre_justification: 'citation',
    competences: ['lire', 'image', 'culture'],
    libelle:
      "Texte et image : dans quelle mesure ce photogramme du film Les Sentiers de la gloire peut-il illustrer le texte ? Vous developperez votre reponse en vous appuyant sur deux arguments au moins. Chacun devra etre justifie en vous referant au texte et a l'image.",
  },

  // --- II. Grammaire et competences linguistiques (18 points) ---------
  //     dont la reecriture, portee par son module dedie (10 points).
  {
    question_key: 'q7a', numero: '7', sous_numero: 'a', partie: 'grammaire', max_points: 2,
    type_reponse: 'temps_et_modes', degre_justification: 'aucun',
    competences: ['langue'],
    libelle:
      "« Mais si... J'entends comme un bruit d'herbe froissee... On s'approche en rampant... » (l. 19-20) Recopiez les verbes conjugues. Indiquez le mode et le temps de ces verbes.",
  },
  {
    question_key: 'q7b', numero: '7', sous_numero: 'b', partie: 'grammaire', max_points: 1,
    type_reponse: 'valeur_des_temps', degre_justification: 'aucun',
    competences: ['langue'],
    libelle: 'Dans ces phrases, quelle est la valeur de ce temps ?',
  },
  {
    question_key: 'q8a', numero: '8', sous_numero: 'a', partie: 'grammaire', max_points: 1,
    type_reponse: 'nature_et_fonction', degre_justification: 'aucun',
    competences: ['langue'],
    libelle:
      "« Les autres peuvent venir, je les attends, pret a tirer... » (l. 24) Quelle est la classe (ou nature) grammaticale du mot souligne ?",
  },
  {
    question_key: 'q8b', numero: '8', sous_numero: 'b', partie: 'grammaire', max_points: 1,
    type_reponse: 'nature_et_fonction', degre_justification: 'aucun',
    competences: ['langue'],
    libelle: 'Quelle est sa fonction grammaticale ?',
  },
  {
    question_key: 'q9a', numero: '9', sous_numero: 'a', partie: 'grammaire', max_points: 1.5,
    type_reponse: 'formation_des_mots', degre_justification: 'aucun',
    competences: ['langue'],
    libelle:
      "« cet ennemi invisible » (l. 22) Identifiez et nommez les trois elements qui composent le mot souligne.",
  },
  {
    question_key: 'q9b', numero: '9', sous_numero: 'b', partie: 'grammaire', max_points: 1.5,
    type_reponse: 'lexique', degre_justification: 'aucun',
    competences: ['langue'],
    libelle: 'Expliquez son sens et donnez un mot de la meme famille.',
  },
];

/** Le texte de la dictee, recopie mot pour mot du sujet 26GENFRDME1. */
const FRANCAIS_DICTEE = `La peur de mourir. Jamais je n'ai vu quelqu'un avoir aussi peur de ça que Faval. Il en devenait extravagant et tout le monde se moquait de lui et le faisait marcher. Mais lui, comprenant très bien que les camarades lui jouaient des mauvais tours ou lui montaient des bateaux pour lui faire peur, ne se mettait jamais en colère et continuait à avoir peur, une peur bleue. C'était un être très simple, voire fruste. Il avait les jambes courtes et trapues, un torse démesuré et puissant, des bras formidables, une petite tête, pas de front, une tignasse de violoniste et des yeux souriant avec une candeur enfantine. C'était un être d'une force musculaire prodigieuse, sans aucune méchanceté et qui croyait tout ce qu'on lui disait.`;

/** Le passage a reecrire, recopie mot pour mot (question 10, 10 points). */
const FRANCAIS_REECRITURE_PASSAGE = `je les attends, prêt à tirer… et c'est alors que concentrant toute mon attention sur mon index placé sur la gâchette, c'est alors que je me rends compte que ma main tremble nerveusement et que ce bruit d'herbe foulée, que je prenais pour l'approche de deux ou trois Allemands rampant imperceptiblement vers moi, était causé par la pointe de ma baïonnette`;

export const SUJET_ZERO_FRANCAIS = {
  code: 'dnb_sujet_zero_2026_francais_sg',
  matiere: 'brevet_francais',
  titre: 'Sujet zéro DNB 2026 — Français, série générale',
  session: '2026',
  reference: '26GENFRQGCME1 / 26GENFRDME1 / 26GENFRRME1',
  support: 'Blaise Cendrars, L’Homme foudroyé, « Dans le silence de la nuit », 1945',
  image: 'Photogramme du film Les Sentiers de la gloire, Stanley Kubrick, 1957',
  questions: FRANCAIS_QUESTIONS,

  reecriture: {
    max_points: 10,
    passage: FRANCAIS_REECRITURE_PASSAGE,
    consigne:
      'Question 10 (10 points) : « Réécrivez le passage suivant en remplaçant "je" par "nous". Faites toutes les modifications nécessaires. »',
    // Le sujet zéro est publié SANS corrigé : la liste exacte des formes à
    // modifier n'est pas officielle. On ne l'invente pas.
    items: [],
    a_verifier:
      'Les formes à modifier doivent être listées par un professeur à partir du corrigé officiel. Tant qu’elles ne le sont pas, la réécriture ne peut pas être notée.',
    // Le sujet ne chiffre pas la pénalité des erreurs de pure copie.
    penalite_erreur_copie: null,
    plafond_erreurs_copie: null,
    bareme_du_sujet_fourni: false,
  },

  dictee: {
    max_points: 10,
    texte_attendu: FRANCAIS_DICTEE,
    consigne:
      'Mots inscrits au tableau avant la dictée : Faval, fruste, « D’après Blaise Cendrars, L’Homme foudroyé, 1945 ». Écrire une ligne sur deux.',
    // Aucun barème national de dictée n'existe, et le sujet zéro n'en donne
    // pas : le moteur refusera donc de noter ce bloc. C'est le comportement
    // attendu, pas un défaut d'installation.
    source_bareme: null,
    regles: [],
    graphies_admises: [],
    a_verifier:
      'Les règles de retrait de la dictée doivent être saisies par un professeur. Sans elles, le moteur refuse de noter les 10 points.',
  },

  redaction: [
    {
      type_sujet: 'imagination',
      max_points: 40,
      longueur_minimale: 35,
      issue_du_sujet: false,
      intitule:
        '« Quand je rentrai au campement, avant le lever du jour, les hommes me dirent : — Dis donc, caporal, tu nous as fait une belle peur, cette nuit. Qu’est-ce qui t’est arrivé ? » Le narrateur leur fait alors le récit de sa nuit en masquant sa peur et en se présentant sous un jour héroïque. Vous raconterez cette scène. Votre récit pourra comporter des dialogues. Votre rédaction comportera 35 lignes au moins.',
    },
    {
      type_sujet: 'reflexion',
      max_points: 40,
      longueur_minimale: 30,
      issue_du_sujet: false,
      intitule:
        'Qu’apporte au lecteur ou au spectateur la découverte d’œuvres qui se déroulent à une autre époque ? Vous présenterez votre réflexion dans un développement argumenté et organisé. Vous illustrerez votre propos à l’aide d’exemples issus de vos lectures et de votre culture artistique personnelle (cinéma, peinture, bande dessinée…). Vous pouvez vous appuyer également sur le texte de Blaise Cendrars. Votre texte comportera 30 lignes au moins.',
    },
  ],

  consignes_correcteur:
    'Sujet zéro officiel, session 2026, série générale. Publié SANS corrigé : les éléments attendus, les formes de réécriture et les règles de retrait de la dictée restent à saisir. La maîtrise de la langue est évaluée sur l’ensemble de l’épreuve. Le dictionnaire est autorisé pour la rédaction uniquement.',
};

/* ------------------------------------------------------------------ */
/*  2. Mathematiques - serie generale, sujets A et B                   */
/* ------------------------------------------------------------------ */

/**
 * Automatismes du sujet A. Le sujet NE CHIFFRE PAS ses neuf items : la
 * repartition ci-dessous est provisoire et repartit les 6 points aussi
 * egalement que le permet le centieme de point (0,67 x 6 + 0,66 x 3 = 6,00).
 * Les reponses attendues, elles, sont des faits arithmetiques verifiables.
 */
const MATHS_A_AUTOMATISMES = [
  { item_key: 'a1', numero: '1', notion: 'Le tiers de 18', theme: 'nombres_et_calculs', competence: 'calculer',
    reponse_attendue: '6', variantes_acceptees: [], points: 0.67 },
  { item_key: 'a2', numero: '2', notion: 'Conversion : un film de 240 min en heures', theme: 'espace_et_geometrie', competence: 'calculer',
    reponse_attendue: '4 heures', variantes_acceptees: ['4 h', '4'], unite_attendue: 'h', points: 0.67 },
  { item_key: 'a3', numero: '3', notion: 'Médiane de la série 8 ; 12 ; 6 ; 19 ; 15', theme: 'organisation_gestion_donnees_probabilites', competence: 'calculer',
    reponse_attendue: '12', variantes_acceptees: [], points: 0.67 },
  { item_key: 'a4', numero: '4', notion: 'Abscisse d’un point sur une droite graduée (QCM)', theme: 'nombres_et_calculs', competence: 'representer',
    reponse_attendue: '', variantes_acceptees: [], points: 0.67,
    a_verifier: 'QCM à quatre propositions ; la bonne réponse se lit sur la figure, non transmise. À saisir.' },
  { item_key: 'a5', numero: '5', notion: 'Somme des angles : triangle ABC rectangle en B, Â = 35°, calculer Ĉ', theme: 'espace_et_geometrie', competence: 'raisonner',
    reponse_attendue: '55°', variantes_acceptees: ['55'], unite_attendue: '°', points: 0.67 },
  { item_key: 'a6', numero: '6', notion: 'Quel calcul donne le cosinus de l’angle ABC (triangle rectangle en A)', theme: 'espace_et_geometrie', competence: 'representer',
    reponse_attendue: '', variantes_acceptees: [], points: 0.67,
    a_verifier: 'La réponse dépend du nommage des côtés sur la figure, non transmise. À saisir.' },
  { item_key: 'a7', numero: '7', notion: 'Thalès : déterminer AD (triangles emboîtés, (DE)//(CB))', theme: 'espace_et_geometrie', competence: 'calculer',
    reponse_attendue: '', variantes_acceptees: [], points: 0.66,
    a_verifier: 'Longueurs lues sur la figure (4 cm, 2 cm, 7 cm). Résultat à saisir après vérification.' },
  { item_key: 'a8', numero: '8', notion: '25 % de 300 élèves participent : combien ne participent pas ?', theme: 'proportionnalite_fonctions', competence: 'calculer',
    reponse_attendue: '225', variantes_acceptees: ['225 élèves'], points: 0.66 },
  { item_key: 'a9', numero: '9', notion: 'Scratch : compléter « répéter … fois » et « tourner de … degrés » pour un carré', theme: 'algorithmique_et_programmation', competence: 'representer',
    reponse_attendue: '4 et 90', variantes_acceptees: ['4 ; 90', '4 fois et 90 degrés'], points: 0.66 },
];

const MATHS_A_EXERCICES = [
  { question_key: 'ex1', numero: 'Exercice 1', max_points: 3,
    domaines: ['statistiques', 'graphique', 'probleme'], competences: ['calculer', 'representer', 'raisonner'],
    libelle:
      'Éducation au développement durable. 1. Moyenne hebdomadaire des déchets sur 7 semaines (62, 59, 74, 68, 55, 61, 71) : montrer que l’objectif de 65 kg est atteint. 2.a. Effectif total du collège d’après le diagramme. 2.b. « Plus de 30 % des élèves ont parcouru au moins 5 km à vélo » : vrai ou faux, en précisant la démarche.' },
  { question_key: 'ex2', numero: 'Exercice 2', max_points: 3,
    domaines: ['calcul_litteral', 'algorithmique'], competences: ['calculer', 'modeliser', 'raisonner'],
    libelle:
      'Programme de calcul (choisir un nombre, multiplier par 2, élever au carré, retrancher 9). 1. Vérifier qu’avec 4 le programme affiche 55, en précisant chaque étape. 2.a. Écrire le résultat en fonction de x. 2.b. Parmi (2x+3)², (2x−3)(2x+3), (2x−3)², laquelle correspond ?' },
  { question_key: 'ex3', numero: 'Exercice 3', max_points: 3,
    domaines: ['fonctions', 'graphique', 'proportionnalite'], competences: ['representer', 'raisonner', 'calculer'],
    libelle:
      'Fonctions f : x ↦ 4x + 3 et g : x ↦ 6x. 1. Laquelle représente une situation de proportionnalité ? 2. Image de 0 par g. 3. Antécédent de 0 par f. 4. Associer chaque droite à sa fonction, en justifiant. 5. Coordonnées du point d’intersection, par lecture graphique.' },
  { question_key: 'ex4', numero: 'Exercice 4', max_points: 3,
    domaines: ['geometrie', 'aire', 'probleme'], competences: ['raisonner', 'calculer', 'communiquer'],
    libelle:
      'Carré ABCD de côté 9 cm, octogone IJKLMNOP codé. 1.a. Le polygone est-il régulier ? Justifier. 1.b. Justifier que son aire vaut 63 cm². 2.a. Aire du disque de centre S et de diamètre 9 cm. 2.b. Montrer que la différence entre l’aire du polygone et celle du disque représente moins de 1 % de l’aire du disque.' },
];

/**
 * Automatismes du sujet B. Le sujet chiffre explicitement les questions 7, 8
 * et 9 a 1 point chacune : les six autres se partagent donc les 3 points
 * restants, soit 0,5 chacune. Cette repartition-la est deduite du sujet, pas
 * inventee.
 */
const MATHS_B_AUTOMATISMES = [
  { item_key: 'b1', numero: '1', notion: 'Mesure d’un angle droit, en degrés', theme: 'espace_et_geometrie', competence: 'calculer',
    reponse_attendue: '90°', variantes_acceptees: ['90'], unite_attendue: '°', points: 0.5 },
  { item_key: 'b2', numero: '2', notion: 'Moyenne de la série 8 ; 10 ; 11 ; 11 (QCM)', theme: 'organisation_gestion_donnees_probabilites', competence: 'calculer',
    reponse_attendue: '10', variantes_acceptees: ['B'], points: 0.5 },
  { item_key: 'b3', numero: '3', notion: '25 % de 800 élèves portent des lunettes', theme: 'proportionnalite_fonctions', competence: 'calculer',
    reponse_attendue: '200', variantes_acceptees: ['200 élèves'], points: 0.5 },
  { item_key: 'b4', numero: '4', notion: 'Lecture graphique : hausse de température entre 8 h et 16 h', theme: 'organisation_gestion_donnees_probabilites', competence: 'representer',
    reponse_attendue: '15 °C', variantes_acceptees: ['15'], unite_attendue: '°C', points: 0.5 },
  { item_key: 'b5', numero: '5', notion: 'Durée pour parcourir 45 km à 90 km/h (QCM)', theme: 'proportionnalite_fonctions', competence: 'calculer',
    reponse_attendue: '30 min', variantes_acceptees: ['B', '0,5 h'], unite_attendue: 'min', points: 0.5 },
  { item_key: 'b6', numero: '6', notion: 'Périmètre d’un losange de côté 3 cm', theme: 'espace_et_geometrie', competence: 'calculer',
    reponse_attendue: '12 cm', variantes_acceptees: ['12'], unite_attendue: 'cm', points: 0.5 },
  { item_key: 'b7', numero: '7', notion: 'Résolution de 4x − 3 = 20 : quel calcul ? (QCM)', theme: 'nombres_et_calculs', competence: 'calculer',
    reponse_attendue: '(20+3)/4', variantes_acceptees: ['D'], points: 1 },
  { item_key: 'b8', numero: '8', notion: 'Thalès : écrire une égalité de rapports donnant AB', theme: 'espace_et_geometrie', competence: 'representer',
    reponse_attendue: '', variantes_acceptees: [], points: 1,
    a_verifier: 'L’égalité dépend du nommage des points sur la figure, non transmise. À saisir.' },
  { item_key: 'b9', numero: '9', notion: 'Scratch : résultat du script pour 1 en entrée', theme: 'algorithmique_et_programmation', competence: 'representer',
    reponse_attendue: '9', variantes_acceptees: ['J’obtiens comme résultat 9'], points: 1 },
];

const MATHS_B_EXERCICES = [
  { question_key: 'ex1', numero: 'Exercice 1', max_points: 3,
    domaines: ['geometrie', 'demonstration'], competences: ['raisonner', 'communiquer'],
    etapes_geometrie: ['hypotheses', 'propriete', 'remplacement_numerique', 'calcul', 'conclusion'],
    libelle:
      'Figure : B, A, D alignés, (BA)//(EC). 1. Rappeler la propriété de la somme des angles d’un triangle, puis calculer l’angle ACB (x). 2.a. Que dire des droites (AB) et (EB) ? Justifier. 2.b. En déduire l’angle CBE (y). 3. Déterminer l’angle ADC (z) en expliquant chaque étape.' },
  { question_key: 'ex2', numero: 'Exercice 2', max_points: 2,
    domaines: ['probabilites', 'arithmetique'], competences: ['modeliser', 'calculer'],
    libelle:
      'Urne de 21 jetons numérotés de 1 à 21. 1. Probabilité de l’événement A « obtenir 2, 3 ou 10 », sous forme de fraction irréductible. 2.a. Issues de l’événement B « le numéro est un diviseur de 24 ». 2.b. Probabilité de B.' },
  { question_key: 'ex3', numero: 'Exercice 3', max_points: 4.5,
    domaines: ['fonctions', 'graphique', 'volume', 'probleme'], competences: ['modeliser', 'representer', 'calculer', 'raisonner'],
    libelle:
      'Paquet de lessive vide 200 g, 1 cm³ de lessive pèse 1,5 g. 1. Masse totale pour 1 600 cm³. 2.a. Que représente f(x) pour f : x ↦ 1,5x + 200 ? 2.b. Représenter f graphiquement (1 cm pour 200 cm³ et 200 g). 3.a. Volume contenu dans un paquet de 2 300 g, par lecture graphique. 3.b. Retrouver le résultat par le calcul. 3.c. Un pavé 12 × 8 × 15 cm peut-il contenir ce volume ?' },
  { question_key: 'ex4', numero: 'Exercice 4', max_points: 2.5,
    domaines: ['arithmetique', 'probleme'], competences: ['chercher', 'raisonner', 'calculer'],
    libelle:
      '91 filles et 77 garçons, groupes de même composition. 1. Décomposer 91 et 77 en produit de facteurs premiers. 2. En déduire le nombre maximal de groupes. 3. Combien d’élèves par groupe ?' },
];

/** Les huit points de contrôle de la qualité rédactionnelle, 2 points au total. */
const QUALITE_REDACTION = [
  ['clarte', 'Clarté'],
  ['precision', 'Précision'],
  ['presentation_calculs', 'Présentation des calculs'],
  ['justification', 'Justification'],
  ['vocabulaire', 'Utilisation correcte du vocabulaire'],
  ['unites', 'Présence des unités'],
  ['conclusions', 'Conclusions'],
  ['enchainement', 'Lisibilité de l’enchaînement'],
].map(([code, libelle], i) => ({ code, libelle, max_points: 0.25, ordre: i }));

const CONSIGNES_MATHS =
  'Sujet zéro officiel, session 2026, série générale. Publié SANS corrigé : les étapes valorisables de chaque exercice restent à saisir, exercice par exercice. Partie 1 sans calculatrice, partie 2 avec. Toutes les réponses de la partie 2 doivent être justifiées sauf indication contraire. Les essais et démarches engagées, même non aboutis, sont pris en compte. ATTENTION : aucune figure ni capture Scratch n’est transmise au correcteur — les décrire ici avant toute correction réelle.';

export const SUJET_ZERO_MATHS_A = {
  code: 'dnb_sujet_zero_2026_maths_sg_a',
  matiere: 'brevet_mathematiques',
  titre: 'Sujet zéro DNB 2026 — Mathématiques, série générale (sujet A)',
  session: '2026',
  automatismes: MATHS_A_AUTOMATISMES,
  exercices: MATHS_A_EXERCICES,
  qualiteRedaction: QUALITE_REDACTION,
  consignes_correcteur: CONSIGNES_MATHS,
  a_verifier:
    'Le sujet A ne chiffre pas ses neuf items d’automatismes : la répartition installée (0,67 × 6 + 0,66 × 3 = 6,00) est PROVISOIRE et doit être arrêtée par un professeur.',
};

export const SUJET_ZERO_MATHS_B = {
  code: 'dnb_sujet_zero_2026_maths_sg_b',
  matiere: 'brevet_mathematiques',
  titre: 'Sujet zéro DNB 2026 — Mathématiques, série générale (sujet B)',
  session: '2026',
  automatismes: MATHS_B_AUTOMATISMES,
  exercices: MATHS_B_EXERCICES,
  qualiteRedaction: QUALITE_REDACTION,
  consignes_correcteur: CONSIGNES_MATHS,
  a_verifier:
    'Le sujet B chiffre les questions 7, 8 et 9 à 1 point ; les six autres se partagent les 3 points restants (0,5 chacune). Cette répartition est déduite du sujet.',
};

export const SUJETS_ZERO = [SUJET_ZERO_FRANCAIS, SUJET_ZERO_MATHS_A, SUJET_ZERO_MATHS_B];
