/**
 * Tests du moteur de correction des MATHÉMATIQUES — brevet. HORS LIGNE.
 *
 *   npm run test:brevet:maths
 *
 * Aucun accès à Supabase, aucun appel à Anthropic. Les tests portent sur le
 * code RÉELLEMENT exécuté en production, puisque l'Edge Function importe les
 * mêmes fichiers (supabase/functions/_shared/brevet-*.ts).
 *
 * Ils couvrent le §17 du cahier des charges, cas par cas.
 */
import assert from 'node:assert/strict';

import {
  assemblerResultatMaths,
  evaluerAutomatismes,
  evaluerQualiteRedaction,
  evaluerRaisonnement,
  profilCompetencesMaths,
  verifierBaremeMaths,
  verifierTotauxMaths,
  BAREME_TOTAL_MATHS,
  MAX_AUTOMATISMES,
  MAX_RAISONNEMENT,
  type ItemAutomatisme,
  type QuestionMaths,
} from '../src/lib/brevetMathsNoyau';
import {
  construireRapportEleve,
  motifsCommuns,
  synthetiserQualiteDocument,
  synthetiserValidation,
  verifierAppariementMatiere,
} from '../src/lib/brevetNoyau';
import { validerSortieMaths } from '../src/lib/brevetMathsPrompt';
import { SUJET_ZERO_MATHS_A, SUJET_ZERO_MATHS_B } from './brevet/sujets-zero.mjs';

/* --- Harnais --------------------------------------------------------- */

let reussis = 0;
let echoues = 0;
const echecs: string[] = [];

function test(numero: string, titre: string, fn: () => void): void {
  try {
    fn();
    reussis += 1;
    console.log(`  ✓ ${numero}  ${titre}`);
  } catch (err) {
    echoues += 1;
    const message = err instanceof Error ? err.message : String(err);
    echecs.push(`${numero} ${titre}\n     ${message.split('\n')[0]}`);
    console.log(`  ✗ ${numero}  ${titre}`);
    console.log(`      ${message.split('\n').slice(0, 4).join('\n      ')}`);
  }
}

function titre(texte: string) {
  console.log(`\n${texte}`);
}

/* --- Jeu d'essai ------------------------------------------------------ */
//
// Partie 1 : 6 items d'automatismes à 1 point = 6.
// Partie 2 : 4 questions à 3 points = 12, plus 2 points de rédaction = 14.
// Total : 20.

const AUTOMATISMES: ItemAutomatisme[] = [
  { item_key: 'a1', numero: '1', notion: 'le tiers de 18', theme: 'nombres_et_calculs', competence: 'calculer', reponse_attendue: '6', variantes_acceptees: [], unite_attendue: null, tolerance: null, forme_exigee: null, points: 1 },
  { item_key: 'a2', numero: '2', notion: '25 % de 80', theme: 'proportionnalite_fonctions', competence: 'calculer', reponse_attendue: '20', variantes_acceptees: [], unite_attendue: null, tolerance: null, forme_exigee: null, points: 1 },
  { item_key: 'a3', numero: '3', notion: '1,2 sous forme de fraction', theme: 'nombres_et_calculs', competence: 'representer', reponse_attendue: '6/5', variantes_acceptees: ['12/10', '120/100'], unite_attendue: null, tolerance: null, forme_exigee: 'fraction irréductible', points: 1 },
  { item_key: 'a4', numero: '4', notion: 'somme des angles d’un triangle', theme: 'espace_et_geometrie', competence: 'raisonner', reponse_attendue: '180°', variantes_acceptees: ['180'], unite_attendue: '°', tolerance: null, forme_exigee: null, points: 1 },
  { item_key: 'a5', numero: '5', notion: 'probabilité d’un pile', theme: 'organisation_gestion_donnees_probabilites', competence: 'modeliser', reponse_attendue: '1/2', variantes_acceptees: ['0,5', '50 %'], unite_attendue: null, tolerance: null, forme_exigee: null, points: 1 },
  { item_key: 'a6', numero: '6', notion: 'résultat du programme de calcul', theme: 'algorithmique_et_programmation', competence: 'representer', reponse_attendue: '14', variantes_acceptees: [], unite_attendue: null, tolerance: null, forme_exigee: null, points: 1 },
];

function q(cle: string, extra: Partial<QuestionMaths> = {}): QuestionMaths {
  return {
    question_key: cle,
    numero: cle,
    exercice: 'ex1',
    partie: 'raisonnement',
    libelle: `Question ${cle}`,
    domaines: ['calcul'],
    connaissances: [],
    competences: ['raisonner', 'calculer'],
    max_points: 3,
    resultat_attendu: '42',
    methode_principale: 'poser puis calculer',
    methodes_alternatives: [{ libelle: 'par proportionnalité', description: 'retour à l’unité' }],
    etapes_valorisables: [
      { code: 'e1', libelle: 'formule posée', points: 1 },
      { code: 'e2', libelle: 'remplacement numérique', points: 1 },
      { code: 'e3', libelle: 'résultat', points: 1 },
    ],
    unites_attendues: 'cm',
    precision_attendue: 'au dixième',
    justification_attendue: 'demonstration_complete',
    regle_arrondi: 'au dixième',
    depend_de: [],
    regle_cascade: null,
    regles_points_partiels: null,
    etapes_geometrie: [],
    codes_erreurs: [],
    calculatrice: 'autorisee',
    ...extra,
  };
}

/** Les huit points de contrôle de la qualité rédactionnelle, tous au maximum. */
const QUALITE_PLEINE = [
  'clarte', 'precision', 'presentation_calculs', 'justification',
  'vocabulaire', 'unites', 'conclusions', 'enchainement',
].map((code) => ({ code, score: 0.25 }));

const QUESTIONS: QuestionMaths[] = [
  q('ex1_q1'),
  q('ex1_q2', { depend_de: ['ex1_q1'], regle_cascade: 'les points de méthode restent acquis' }),
  q('ex2_q1', {
    exercice: 'ex2',
    domaines: ['geometrie'],
    etapes_geometrie: ['hypotheses', 'propriete', 'remplacement_numerique', 'calcul', 'unite', 'conclusion'],
  }),
  q('ex3_q1', { exercice: 'ex3', domaines: ['algorithmique'], methodes_alternatives: [] }),
];

const QUALITE_LISIBLE = synthetiserQualiteDocument({ anomalies: [], zonesIncertaines: [] });

function reponseAuto(statut: string, score: number) {
  return AUTOMATISMES.map((a) => ({
    item_key: a.item_key,
    reponse_eleve: a.reponse_attendue,
    statut: statut as never,
    score,
    justification: '',
    certitude: 1,
    illisible: false,
  }));
}

/* ==================================================================== */

console.log('\n═══ MATHÉMATIQUES — BREVET ═══');

titre('1. Étanchéité');

test('1.1', 'une copie de français brevet est refusée', () => {
  const r = verifierAppariementMatiere({
    matiereAttendue: 'brevet_mathematiques',
    matiereExamen: 'brevet_francais',
    niveauExamen: 'DNB',
    moteurCorrection: 'brevet_francais',
  });
  assert.equal(r.ok, false);
});

test('1.2', 'un bac blanc de maths est refusé', () => {
  const r = verifierAppariementMatiere({
    matiereAttendue: 'brevet_mathematiques',
    matiereExamen: 'maths',
    niveauExamen: 'BAC',
    moteurCorrection: 'bareme_sujet',
  });
  assert.equal(r.ok, false);
});

titre('2. Partie 1 — automatismes');

test('2.1', 'réponse exacte : le plein', () => {
  const r = evaluerAutomatismes(AUTOMATISMES, reponseAuto('exacte', 1));
  assert.equal(r.score, 6);
  assert.equal(r.max, 6);
});

test('2.2', 'aucun retrait au motif de l’absence de calculatrice', () => {
  // Le modèle propose 0,5 sur une réponse pourtant exacte : le moteur rétablit.
  const r = evaluerAutomatismes(AUTOMATISMES, reponseAuto('exacte', 0.5));
  assert.equal(r.score, 6);
  assert.ok(r.items[0].alertes.some((a) => a.includes('calculatrice')));
});

test('2.3', 'variante acceptée : le plein aussi', () => {
  const r = evaluerAutomatismes([AUTOMATISMES[2]], [
    { item_key: 'a3', reponse_eleve: '12/10', statut: 'variante_acceptee', score: 0, certitude: 1 },
  ]);
  assert.equal(r.score, 1);
});

test('2.4', 'réponse fausse : zéro', () => {
  const r = evaluerAutomatismes([AUTOMATISMES[0]], [
    { item_key: 'a1', reponse_eleve: '9', statut: 'fausse', score: 0, certitude: 1 },
  ]);
  assert.equal(r.score, 0);
});

test('2.5', 'item illisible : points accordés, jamais une faute', () => {
  const r = evaluerAutomatismes([AUTOMATISMES[0]], [
    { item_key: 'a1', reponse_eleve: '?', statut: 'illisible', score: 0, certitude: 0.2 },
  ]);
  assert.equal(r.score, 1);
  assert.ok(r.alertes.some((a) => a.includes('illisible')));
});

test('2.6', 'item absent de la réponse : 0 posé et alerte', () => {
  const r = evaluerAutomatismes(AUTOMATISMES, []);
  assert.equal(r.score, 0);
  assert.equal(r.alertes.length, 6);
});

test('2.7', 'item inventé par le modèle : écarté', () => {
  const r = evaluerAutomatismes([AUTOMATISMES[0]], [
    { item_key: 'a1', reponse_eleve: '6', statut: 'exacte', score: 1, certitude: 1 },
    { item_key: 'a99', reponse_eleve: 'x', statut: 'exacte', score: 5, certitude: 1 },
  ]);
  assert.equal(r.score, 1);
  assert.ok(r.alertes.some((a) => a.includes('a99')));
});

titre('3. Partie 2 — raisonnement');

test('3.1', 'résultat juste avec méthode juste : le plein', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    {
      question_key: 'ex1_q1',
      score: 3,
      statut: 'juste_methode_juste',
      etapes_validees: ['e1', 'e2', 'e3'],
      certitude: 1,
    },
  ]);
  assert.equal(r.score, 3);
});

test('3.2', 'résultat juste sans justification : le barème décide, pas le plein d’office', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 1, statut: 'juste_sans_justification', etapes_validees: ['e3'], certitude: 1 },
  ]);
  assert.equal(r.score, 1);
});

test('3.3', 'démarche correcte avec erreur de calcul : les étapes valorisées sont conservées', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    {
      question_key: 'ex1_q1',
      score: 0,
      statut: 'demarche_correcte_erreur_de_calcul',
      etapes_validees: ['e1', 'e2'],
      certitude: 1,
    },
  ]);
  assert.equal(r.score, 2, 'le plancher est la somme des étapes validées');
});

test('3.4', 'démarche pertinente non aboutie : les essais comptent (note de service)', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    {
      question_key: 'ex1_q1',
      score: 0,
      statut: 'demarche_pertinente_non_aboutie',
      etapes_validees: ['e1'],
      certitude: 1,
    },
  ]);
  assert.equal(r.score, 1);
});

test('3.5', 'erreur en cascade : les points de méthode restent', () => {
  const r = evaluerRaisonnement(QUESTIONS.slice(0, 2), [
    { question_key: 'ex1_q1', score: 1, statut: 'erreur_de_calcul_isolee', etapes_validees: ['e1'], certitude: 1 },
    {
      question_key: 'ex1_q2',
      score: 2.5,
      statut: 'methode_alternative_correcte',
      etapes_validees: ['e1', 'e2'],
      depends_on_question: 'ex1_q1',
      inherited_value: '37',
      cascade_error: true,
      method_valid_from_student_value: true,
      certitude: 1,
    },
  ]);
  assert.equal(r.questions[1].points, 2.5);
  assert.equal(r.cascades.length, 1);
  assert.equal(r.cascades[0].source, 'ex1_q1');
});

test('3.6', 'double sanction possible : signalée quand la suite est mise à 0', () => {
  const r = evaluerRaisonnement(QUESTIONS.slice(0, 2), [
    { question_key: 'ex1_q1', score: 1, statut: 'erreur_de_calcul_isolee', etapes_validees: ['e1'], certitude: 1 },
    { question_key: 'ex1_q2', score: 0, statut: 'erreur_de_raisonnement', etapes_validees: [], certitude: 1 },
  ]);
  assert.equal(r.questions[1].cascade_penalty_applied, true);
  assert.ok(r.alertes.some((a) => a.includes('seconde fois')));
});

test('3.7', 'méthode alternative non prévue : jamais zéro d’office, validation demandée', () => {
  const r = evaluerRaisonnement([QUESTIONS[3]], [
    {
      question_key: 'ex3_q1',
      score: 2,
      statut: 'methode_alternative_correcte',
      etapes_validees: ['e1', 'e2'],
      methode_alternative: true,
      methode_alternative_description: 'résolution par tableur',
      certitude: 1,
    },
  ]);
  assert.equal(r.questions[0].points, 2);
  assert.ok(r.alertes.some((a) => a.includes('méthode alternative')));
});

test('3.8', 'aucun point sur des mots-clés : signalé', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 2, statut: 'erreur_de_calcul_isolee', etapes_validees: [], certitude: 1 },
  ]);
  assert.ok(r.alertes.some((a) => a.includes('étape valorisée')));
});

test('3.9', 'géométrie : conclusion sans démonstration ≠ démonstration complète', () => {
  const r = evaluerRaisonnement([QUESTIONS[2]], [
    {
      question_key: 'ex2_q1',
      score: 3,
      statut: 'juste_sans_justification',
      etapes_validees: ['e3'],
      etapes_geometrie_validees: ['conclusion'],
      certitude: 1,
    },
  ]);
  assert.ok(r.questions[0].points < 3, 'le plein est refusé');
  assert.ok(r.questions[0].etapes_geometrie_manquantes.includes('hypotheses'));
});

test('3.10', 'unité manquante : la question perd, une seule fois', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 2.5, statut: 'unite_absente', etapes_validees: ['e1', 'e2', 'e3'], certitude: 1 },
  ]);
  assert.equal(r.questions[0].points, 2.5);
});

test('3.11', 'arrondi acceptable : le barème l’autorise, aucun retrait ajouté', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 3, statut: 'valeur_approchee_acceptable', etapes_validees: ['e1', 'e2', 'e3'], certitude: 1 },
  ]);
  assert.equal(r.questions[0].points, 3);
});

test('3.12', 'formule correcte mais calcul inachevé : points d’étape', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 0, statut: 'demarche_pertinente_non_aboutie', etapes_validees: ['e1'], certitude: 1 },
  ]);
  assert.equal(r.questions[0].points, 1);
});

test('3.13', 'réponse illisible : ce n’est pas une erreur de l’élève', () => {
  const r = evaluerRaisonnement([QUESTIONS[0]], [
    { question_key: 'ex1_q1', score: 0, statut: 'illisible', etapes_validees: [], certitude: 0.2 },
  ]);
  assert.equal(r.questions[0].transcription_incertaine, true);
  assert.ok(r.questions[0].alertes.some((a) => a.includes('illisible')));
});

test('3.14', 'copie blanche : 0 sur toutes les questions, sans planter', () => {
  const r = evaluerRaisonnement(QUESTIONS, []);
  assert.equal(r.score, 0);
  assert.equal(r.questions.length, 4);
});

titre('4. Qualité de la rédaction — 2 points COMPRIS dans les 14');

test('4.1', 'les huit points de contrôle se répartissent les 2 points', () => {
  const r = evaluerQualiteRedaction({
    scores: [
      { code: 'clarte', score: 0.25 },
      { code: 'precision', score: 0.25 },
      { code: 'presentation_calculs', score: 0.25 },
      { code: 'justification', score: 0.25 },
      { code: 'vocabulaire', score: 0.25 },
      { code: 'unites', score: 0.25 },
      { code: 'conclusions', score: 0.25 },
      { code: 'enchainement', score: 0.25 },
    ],
    max: 2,
    justificationDejaPenalisee: [],
    unitesDejaPenalisees: [],
  });
  assert.equal(r.score, 2);
});

test('4.2', 'pas de double pénalisation : justification déjà sanctionnée → critère neutralisé', () => {
  const r = evaluerQualiteRedaction({
    scores: [{ code: 'justification', score: 0 }],
    max: 2,
    justificationDejaPenalisee: ['ex1_q1'],
    unitesDejaPenalisees: [],
  });
  const critere = r.criteres.find((c) => c.code === 'justification')!;
  assert.equal(critere.score, critere.max, 'les points sont restitués');
  assert.equal(r.doublons_evites.length, 1);
});

test('4.3', 'pas de double pénalisation sur les unités non plus', () => {
  const r = evaluerQualiteRedaction({
    scores: [{ code: 'unites', score: 0 }],
    max: 2,
    justificationDejaPenalisee: [],
    unitesDejaPenalisees: ['ex1_q1'],
  });
  const critere = r.criteres.find((c) => c.code === 'unites')!;
  assert.equal(critere.score, critere.max);
});

titre('5. Totaux : 6 + 14 = 20');

test('5.1', 'total 6 + 14, rédaction comprise', () => {
  const r = verifierTotauxMaths({
    maxAutomatismes: 6,
    maxRaisonnementQuestions: 12,
    maxQualiteRedaction: 2,
  });
  assert.equal(r.ok, true);
});

test('5.2', 'les 2 points de rédaction AJOUTÉS au-dessus des 14 : refusé', () => {
  const r = verifierTotauxMaths({
    maxAutomatismes: 6,
    maxRaisonnementQuestions: 14,
    maxQualiteRedaction: 2,
  });
  assert.equal(r.ok, false);
  assert.ok(r.blocages.some((b) => b.code === 'redaction_ajoutee_au_dessus'));
});

test('5.3', 'automatismes ≠ 6 : refusé', () => {
  const r = verifierTotauxMaths({ maxAutomatismes: 5, maxRaisonnementQuestions: 12, maxQualiteRedaction: 2 });
  assert.ok(r.blocages.some((b) => b.code === 'automatismes_incorrect'));
});

test('5.4', 'impossible de dépasser 20', () => {
  const auto = evaluerAutomatismes(AUTOMATISMES, reponseAuto('exacte', 1));
  const rais = evaluerRaisonnement(
    QUESTIONS,
    QUESTIONS.map((x) => ({
      question_key: x.question_key,
      score: 99,
      statut: 'juste_methode_juste' as const,
      etapes_validees: ['e1', 'e2', 'e3'],
      certitude: 1,
    })),
  );
  const qual = evaluerQualiteRedaction({
    scores: [{ code: 'clarte', score: 99 }],
    max: 2,
    justificationDejaPenalisee: [],
    unitesDejaPenalisees: [],
  });
  const r = assemblerResultatMaths({ automatismes: auto, raisonnement: rais, qualiteRedaction: qual, alertes: [] });
  assert.ok(r.score.score_out_of_20 <= BAREME_TOTAL_MATHS + 0.001);
  assert.ok(r.score.automatismes.score <= MAX_AUTOMATISMES + 0.001);
  assert.ok(r.score.reasoning_and_problem_solving.score <= MAX_RAISONNEMENT + 0.001);
});

test('5.5', 'la rédaction est comprise dans la partie 2, jamais ajoutée', () => {
  const auto = evaluerAutomatismes(AUTOMATISMES, reponseAuto('exacte', 1));
  const rais = evaluerRaisonnement(
    QUESTIONS,
    QUESTIONS.map((x) => ({
      question_key: x.question_key,
      score: 3,
      statut: 'juste_methode_juste' as const,
      etapes_validees: ['e1', 'e2', 'e3'],
      // La question de géométrie n'obtient le plein que si les six étapes de
      // la démonstration sont réellement présentes : c'est la règle du §8.5.
      etapes_geometrie_validees: x.etapes_geometrie,
      certitude: 1,
    })),
  );
  const qual = evaluerQualiteRedaction({
    scores: QUALITE_PLEINE,
    max: 2,
    justificationDejaPenalisee: [],
    unitesDejaPenalisees: [],
  });
  const r = assemblerResultatMaths({ automatismes: auto, raisonnement: rais, qualiteRedaction: qual, alertes: [] });
  assert.equal(r.score.automatismes.score, 6);
  assert.equal(r.score.reasoning_and_problem_solving.score, 14);
  assert.equal(r.score.reasoning_and_problem_solving.writing_quality_included.score, 2);
  assert.equal(r.score.score_out_of_20, 20);
});

test('5.6', 'copie blanche : 0 / 20', () => {
  const r = assemblerResultatMaths({
    automatismes: evaluerAutomatismes(AUTOMATISMES, reponseAuto('absente', 0)),
    raisonnement: evaluerRaisonnement(QUESTIONS, []),
    qualiteRedaction: evaluerQualiteRedaction({
      scores: [],
      max: 2,
      justificationDejaPenalisee: [],
      unitesDejaPenalisees: [],
    }),
    alertes: [],
  });
  assert.equal(r.score.score_out_of_20, 0);
});

titre('6. Contrôles du barème');

test('6.1', 'question sans étape valorisable : blocage', () => {
  const r = verifierBaremeMaths({
    automatismes: AUTOMATISMES.map((a) => ({ item_key: a.item_key, numero: a.numero, reponse_attendue: a.reponse_attendue, points: a.points })),
    questions: [q('ex1_q1', { max_points: 12, etapes_valorisables: [] })],
    maxQualiteRedaction: 2,
  });
  assert.ok(r.blocages.some((b) => b.code === 'etapes_manquantes'));
});

test('6.2', 'automatisme sans réponse attendue : blocage', () => {
  const r = verifierBaremeMaths({
    automatismes: [{ item_key: 'a1', numero: '1', reponse_attendue: '', points: 6 }],
    questions: [q('ex1_q1', { max_points: 12 })],
    maxQualiteRedaction: 2,
  });
  assert.ok(r.blocages.some((b) => b.code === 'corrige_manquant'));
});

test('6.3', 'dépendance inconnue : blocage', () => {
  const r = verifierBaremeMaths({
    automatismes: AUTOMATISMES.map((a) => ({ item_key: a.item_key, numero: a.numero, reponse_attendue: a.reponse_attendue, points: a.points })),
    questions: [q('ex1_q1', { max_points: 12, depend_de: ['inexistante'] })],
    maxQualiteRedaction: 2,
  });
  assert.ok(r.blocages.some((b) => b.code === 'dependance_inconnue'));
});

test('6.4', 'calculatrice autorisée en partie 1 : blocage', () => {
  const r = verifierBaremeMaths({
    automatismes: AUTOMATISMES.map((a) => ({ item_key: a.item_key, numero: a.numero, reponse_attendue: a.reponse_attendue, points: a.points })),
    questions: [q('ex1_q1', { max_points: 12, partie: 'automatismes', calculatrice: 'autorisee' })],
    maxQualiteRedaction: 2,
  });
  assert.ok(r.blocages.some((b) => b.code === 'calculatrice_partie1'));
});

test('6.5', 'barème conforme : aucun blocage', () => {
  const r = verifierBaremeMaths({
    automatismes: AUTOMATISMES.map((a) => ({ item_key: a.item_key, numero: a.numero, reponse_attendue: a.reponse_attendue, points: a.points })),
    questions: QUESTIONS,
    maxQualiteRedaction: 2,
  });
  assert.equal(r.ok, true, JSON.stringify(r.blocages));
});

titre('7. Profil de compétences, validation, rapport');

test('7.1', 'le profil est un diagnostic, il ne touche pas la note', () => {
  const auto = evaluerAutomatismes(AUTOMATISMES, reponseAuto('exacte', 1));
  const rais = evaluerRaisonnement(
    QUESTIONS,
    QUESTIONS.map((x) => ({
      question_key: x.question_key,
      score: 3,
      statut: 'juste_methode_juste' as const,
      etapes_validees: ['e1', 'e2', 'e3'],
      // La question de géométrie n'obtient le plein que si les six étapes de
      // la démonstration sont réellement présentes : c'est la règle du §8.5.
      etapes_geometrie_validees: x.etapes_geometrie,
      certitude: 1,
    })),
  );
  const profil = profilCompetencesMaths(QUESTIONS, rais.questions, auto);
  assert.equal(profil.raisonner, 'tres_satisfaisant');
  assert.equal(rais.score, 12, 'la note n’a pas bougé');
});

test('7.2', 'compétence non mobilisée : non_applicable, jamais zéro', () => {
  const auto = evaluerAutomatismes([], []);
  const bareme = [q('ex1_q1', { competences: ['calculer'] })];
  const rais = evaluerRaisonnement(bareme, [
    { question_key: 'ex1_q1', score: 3, statut: 'juste_methode_juste', etapes_validees: ['e1', 'e2', 'e3'], certitude: 1 },
  ]);
  const profil = profilCompetencesMaths(bareme, rais.questions, auto);
  assert.equal(profil.communiquer, 'non_applicable');
});

test('7.3', 'méthode inhabituelle : validation recommandée, jamais bloquante d’office', () => {
  const s = synthetiserValidation(
    motifsCommuns({ confiance: 1, qualite: QUALITE_LISIBLE, noteSur20: 14, seuilsAdmin: [10] }),
  );
  assert.equal(s.required, false);
});

test('7.4', 'rapport élève : au plus trois priorités, note bornée', () => {
  const { rapport } = construireRapportEleve({
    noteBrute: 14,
    noteMax: 20,
    blocs: [],
    reussites: ['Tu poses bien tes calculs.'],
    priorites: ['Reprends la question 2 : écris « Dans le triangle ABC rectangle en A » avant Pythagore.', 'b', 'c', 'd'],
    erreurs: [],
    aRetravailler: ['Pythagore'],
    strategie: 'Relis chaque conclusion à voix basse.',
    qualite: QUALITE_LISIBLE,
  });
  assert.equal(rapport.priorites.length, 3);
  assert.equal(rapport.note_sur_20, 14);
});

titre('8. Validation du schéma de sortie');

test('8.1', 'cascade déclarée sans question source : refusée', () => {
  const r = validerSortieMaths(
    {
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      automatismes: [],
      questions: [
        { question_key: 'ex1_q1', score: 2, certitude: 1, cascade_error: true, depends_on_question: null },
      ],
      qualite_redaction: [],
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.9,
    },
    { clesAutomatismes: [], clesQuestions: ['ex1_q1'] },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => e.includes('depends_on_question')));
});

test('8.2', 'une note globale renvoyée par le modèle est refusée', () => {
  const r = validerSortieMaths(
    {
      score_out_of_20: 14,
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      automatismes: [],
      questions: [],
      qualite_redaction: [],
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.9,
    },
    { clesAutomatismes: [], clesQuestions: [] },
  );
  assert.equal(r.ok, false);
});

test('8.3', 'une sortie conforme passe', () => {
  const r = validerSortieMaths(
    {
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      automatismes: [{ item_key: 'a1', score: 1, certitude: 1 }],
      questions: [
        {
          question_key: 'ex1_q1',
          score: 3,
          certitude: 1,
          cascade_error: false,
          depends_on_question: null,
          method_valid_from_student_value: false,
        },
      ],
      qualite_redaction: [],
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.95,
    },
    { clesAutomatismes: ['a1'], clesQuestions: ['ex1_q1'] },
  );
  assert.equal(r.ok, true);
});

titre('9. Les sujets zéro officiels de la session 2026');

for (const [nom, sujet] of [
  ['A', SUJET_ZERO_MATHS_A],
  ['B', SUJET_ZERO_MATHS_B],
] as const) {
  test(`9.${nom}1`, `sujet ${nom} : les automatismes totalisent exactement 6`, () => {
    const total = sujet.automatismes.reduce((s3, a) => s3 + a.points, 0);
    assert.ok(Math.abs(total - 6) < 0.001, `${total} au lieu de 6`);
  });

  test(`9.${nom}2`, `sujet ${nom} : les exercices totalisent 12, et 12 + 2 = 14`, () => {
    const total = sujet.exercices.reduce((s3, e) => s3 + e.max_points, 0);
    assert.equal(total, 12);
    const qualite = sujet.qualiteRedaction.reduce((s3, c) => s3 + c.max_points, 0);
    assert.equal(qualite, 2);
    assert.equal(total + qualite, MAX_RAISONNEMENT);
  });

  test(`9.${nom}3`, `sujet ${nom} : le moteur accepte ces totaux`, () => {
    const r = verifierTotauxMaths({
      maxAutomatismes: Math.round(sujet.automatismes.reduce((s3, a) => s3 + a.points, 0) * 100) / 100,
      maxRaisonnementQuestions: sujet.exercices.reduce((s3, e) => s3 + e.max_points, 0),
      maxQualiteRedaction: sujet.qualiteRedaction.reduce((s3, c) => s3 + c.max_points, 0),
    });
    assert.equal(r.ok, true, JSON.stringify(r.blocages));
  });
}

test('9.C', 'les sujets zéro corroborent que les 2 points de rédaction sont COMPRIS dans les 14', () => {
  // C'est la vérification qui compte : dans les deux sujets officiels, les
  // exercices s'arrêtent à 12 alors que la partie 2 est annoncée sur 14.
  for (const sujet of [SUJET_ZERO_MATHS_A, SUJET_ZERO_MATHS_B]) {
    const exercices = sujet.exercices.reduce((s3, e) => s3 + e.max_points, 0);
    assert.notEqual(exercices, MAX_RAISONNEMENT, 'les exercices ne valent pas déjà les 14');
    assert.equal(exercices + 2, MAX_RAISONNEMENT);
  }
});

/* --- Bilan ------------------------------------------------------------ */

console.log(`\n${reussis} test(s) réussi(s), ${echoues} échec(s).`);
if (echoues) {
  console.log('\nÉchecs :');
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
