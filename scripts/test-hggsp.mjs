#!/usr/bin/env node
/**
 * TESTS DU MOTEUR DE CORRECTION HGGSP (session 2026).
 *
 *   npm run test:hggsp
 *
 * Ils portent sur le code RÉELLEMENT exécuté en production : le noyau
 * `supabase/functions/_shared/hggsp-noyau.ts` est importé tel quel (Node 22+
 * retire les types tout seul). Aucun accès réseau, aucune base : tout est
 * hors ligne, donc rejouable sans dépenser un centime d'API.
 *
 * Couverture (cahier des charges §20) : dissertation seule, étude critique
 * seule, bac blanc complet, conversion /20 -> /10, somme des deux exercices,
 * problématique absente, problématique descriptive, cours récité, exemple
 * seulement cité, erreur factuelle mineure et majeure, absence de conclusion,
 * paraphrase avec prélèvements exacts, absence totale de critique, critique
 * pertinente et connaissances limitées, étude de deux documents, deuxième
 * document ignoré, confrontation correcte, production graphique pertinente et
 * absente, non-double-sanction, pas de 0,25, somme exacte des critères,
 * déclenchement de relecture humaine, verrouillage d'une version, cohérence
 * note / appréciation, présence réelle des citations.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRILLE_DISSERTATION,
  GRILLE_ETUDE_CRITIQUE,
  TAXONOMIE,
  taxonomiePour,
  chercherTaxonomie,
  criterePrincipal,
  convertirEnOfficiel,
  noteFinaleExamen,
  phraseNote,
  normaliserCriteres,
  appliquerErreurs,
  construireResultatExercice,
  controlesCoherence,
  citationPresente,
  contradictionAppreciation,
  estAuPas,
  arrondiQuart,
  niveauPour,
  plafondDuNiveau,
  grilleModifiable,
  couvertureEtalons,
  consigneSysteme,
  schemaSortie,
  niveauGlobal,
} from '../supabase/functions/_shared/hggsp-noyau.ts';

/* ------------------------------------------------------------------ */
/*  Fabriques : une copie de test se décrit en trois lignes.          */
/* ------------------------------------------------------------------ */

const COPIE_DISS = [
  "La guerre froide oppose les Etats-Unis et l'URSS de 1947 a 1991.",
  "Dans quelle mesure les modes de resolution des conflits sont-ils devenus plus efficaces depuis 1945 ?",
  "La crise de Cuba en 1962 montre le role de la dissuasion nucleaire.",
  "L'ONU est fondee en 1945 par la charte de San Francisco.",
  "En conclusion, les modes de resolution ont change de nature plus que d'efficacite.",
].join(' ');

const COPIE_EC = [
  "Le document est une note de synthese sur l'Arctique.",
  "Le document dit ensuite que cinq Etats riverains font des demandes pour etendre leur plateau continental.",
  "Mais ce conseil ne s'occupe pas des questions militaires.",
  "Donc l'Arctique est bien devenu un espace de rivalites entre les puissances.",
].join(' ');

function critere(code, score, options = {}) {
  return {
    criterion_id: code,
    score,
    observed_strengths: options.forces ?? [],
    observed_weaknesses: options.faiblesses ?? [],
    evidence: options.preuves ?? [{ page: 1, citation: options.citation ?? COPIE_DISS.slice(0, 60), explication: 'preuve' }],
    feedback: options.feedback ?? 'Justification.',
    human_review_required: options.relecture ?? false,
  };
}

function corrigerDissertation(criteres, erreurs = [], extra = {}) {
  return construireResultatExercice({
    examId: null,
    examFormat: extra.format ?? 'dissertation_only',
    grille: GRILLE_DISSERTATION,
    reponse: {
      criteria: criteres,
      error_events: erreurs,
      strengths: extra.strengths ?? [],
      priorities: extra.priorities ?? [],
      general_feedback: extra.appreciation ?? '',
      confidence: extra.confidence ?? 0.95,
      human_review_required: false,
      human_review_reasons: [],
      production_graphique: extra.graphique ?? { presente: false, pertinente: false, interpretable: true, commentaire: '' },
    },
    texteTranscription: extra.texte ?? COPIE_DISS,
    transcription: { overall_confidence: extra.confianceTranscription ?? 0.98, requires_human_review: false },
    statutGrille: 'in_use',
    grilleVerrouillee: true,
    etalonsCompares: 6,
    etalonProche: extra.etalon ?? null,
  });
}

function corrigerEtudeCritique(criteres, erreurs = [], extra = {}) {
  return construireResultatExercice({
    examId: null,
    examFormat: extra.format ?? 'document_study_only',
    grille: GRILLE_ETUDE_CRITIQUE,
    reponse: {
      criteria: criteres,
      error_events: erreurs,
      strengths: extra.strengths ?? [],
      priorities: extra.priorities ?? [],
      general_feedback: extra.appreciation ?? '',
      confidence: extra.confidence ?? 0.95,
      human_review_required: false,
      human_review_reasons: [],
      documents_exploites: extra.documents ?? 1,
    },
    texteTranscription: extra.texte ?? COPIE_EC,
    transcription: { overall_confidence: 0.98, requires_human_review: false },
    statutGrille: 'in_use',
    grilleVerrouillee: true,
    etalonsCompares: 6,
    etalonProche: extra.etalon ?? null,
  });
}

const preuveEC = (citation) => [{ page: 1, citation, explication: 'preuve' }];

/* ================================================================== */
/*  1. Structure officielle de l'épreuve                              */
/* ================================================================== */

test('les deux grilles totalisent 20 points analytiques et 10 points officiels', () => {
  for (const grille of [GRILLE_DISSERTATION, GRILLE_ETUDE_CRITIQUE]) {
    const somme = grille.criteres.reduce((s, c) => s + c.max_points, 0);
    assert.equal(somme, grille.max_analytique, `${grille.id} : somme des critères`);
    assert.equal(grille.max_analytique, 20);
    assert.equal(grille.max_officiel, 10);
  }
});

test('la répartition de la dissertation est celle du cahier des charges', () => {
  const attendu = {
    ANALYSE_PROBLEMATISATION: 4,
    CONNAISSANCES: 5,
    ARGUMENTATION: 5,
    EXEMPLES: 4,
    EXPRESSION: 2,
  };
  for (const c of GRILLE_DISSERTATION.criteres) assert.equal(c.max_points, attendu[c.code], c.code);
  assert.equal(GRILLE_DISSERTATION.criteres.length, 5);
});

test("la répartition de l'étude critique est celle du cahier des charges", () => {
  const attendu = {
    CONSIGNE_PROBLEMATISATION: 3,
    PRELEVEMENT: 3,
    EXPLICATION_CONNAISSANCES: 4,
    ANALYSE_CRITIQUE: 5,
    ORGANISATION_ARGUMENTATION: 3,
    EXPRESSION: 2,
  };
  for (const c of GRILLE_ETUDE_CRITIQUE.criteres) assert.equal(c.max_points, attendu[c.code], c.code);
  assert.equal(GRILLE_ETUDE_CRITIQUE.criteres.length, 6);
});

test('les deux grilles sont réellement distinctes', () => {
  const d = GRILLE_DISSERTATION.criteres.map((c) => c.code).sort();
  const e = GRILLE_ETUDE_CRITIQUE.criteres.map((c) => c.code).sort();
  assert.notDeepEqual(d, e);
  // Seule l'expression est commune aux deux exercices.
  const communs = d.filter((c) => e.includes(c));
  assert.deepEqual(communs, ['EXPRESSION']);
});

test('conversion analytique /20 vers officielle /10', () => {
  assert.equal(convertirEnOfficiel(20, GRILLE_DISSERTATION), 10);
  assert.equal(convertirEnOfficiel(9.5, GRILLE_ETUDE_CRITIQUE), 4.75);
  assert.equal(convertirEnOfficiel(0, GRILLE_DISSERTATION), 0);
  assert.equal(convertirEnOfficiel(13.25, GRILLE_DISSERTATION), 6.63);
});

test('bac blanc complet : la note finale est la somme des deux notes officielles', () => {
  const diss = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 3.5),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2.5),
      critere('EXPRESSION', 1.5),
    ],
    [],
    { format: 'full_exam' },
  );
  const ec = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 2.25, { citation: COPIE_EC.slice(0, 50) }),
      critere('PRELEVEMENT', 2.25, { citation: COPIE_EC.slice(0, 50) }),
      critere('EXPLICATION_CONNAISSANCES', 2, { citation: COPIE_EC.slice(0, 50) }),
      critere('ANALYSE_CRITIQUE', 3, { citation: COPIE_EC.slice(0, 50) }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: COPIE_EC.slice(0, 50) }),
      critere('EXPRESSION', 1.5, { citation: COPIE_EC.slice(0, 50) }),
    ],
    [],
    { format: 'full_exam' },
  );

  assert.equal(diss.analytical_score, 13.5);
  assert.equal(diss.official_score, 6.75);
  assert.equal(ec.analytical_score, 12.5);
  assert.equal(ec.official_score, 6.25);

  const finale = noteFinaleExamen([diss, ec]);
  assert.equal(finale.note, 13);
  assert.equal(finale.max, 20);
  // Jamais la somme des deux notes analytiques.
  assert.notEqual(finale.note, diss.analytical_score + ec.analytical_score);
});

test('entraînement à un seul exercice : note sur 20 ET équivalent sur 10', () => {
  const ec = corrigerEtudeCritique([
    critere('CONSIGNE_PROBLEMATISATION', 2.25, { citation: COPIE_EC.slice(0, 40) }),
    critere('PRELEVEMENT', 2.25, { citation: COPIE_EC.slice(0, 40) }),
    critere('EXPLICATION_CONNAISSANCES', 2, { citation: COPIE_EC.slice(0, 40) }),
    critere('ANALYSE_CRITIQUE', 3, { citation: COPIE_EC.slice(0, 40) }),
    critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: COPIE_EC.slice(0, 40) }),
    critere('EXPRESSION', 1, { citation: COPIE_EC.slice(0, 40) }),
  ]);
  assert.equal(ec.analytical_score, 12);
  assert.equal(ec.training_score, 12);
  assert.equal(ec.official_score, 6);
  const phrase = phraseNote(ec);
  assert.match(phrase, /12 \/ 20/);
  assert.match(phrase, /6 \/ 10/);
});

test('la note finale ne peut pas être obtenue en additionnant deux notes sur 20', () => {
  const finale = noteFinaleExamen([
    { official_score: 6.75, official_max: 10 },
    { official_score: 6.25, official_max: 10 },
  ]);
  assert.ok(finale.note <= 20);
  assert.equal(finale.max, 20);
});

/* ================================================================== */
/*  2. Notation : pas de 0,25, somme, bornes                          */
/* ================================================================== */

test('les scores hors pas de 0,25 sont ramenés au quart le plus proche', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2.3),
    critere('CONNAISSANCES', 3),
    critere('ARGUMENTATION', 3),
    critere('EXEMPLES', 2),
    critere('EXPRESSION', 1),
  ]);
  assert.equal(r.criteria[0].score, 2.25);
  assert.ok(r.consistency_checks.step_valid);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'score_hors_pas'));
  assert.ok(estAuPas(0.75) && estAuPas(2.5) && !estAuPas(0.3));
  assert.equal(arrondiQuart(1.4), 1.5);
});

test('un score au-dessus du maximum du critère est ramené au maximum', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 9),
    critere('CONNAISSANCES', 3),
    critere('ARGUMENTATION', 3),
    critere('EXEMPLES', 2),
    critere('EXPRESSION', 1),
  ]);
  assert.equal(r.criteria[0].score, 4);
  assert.equal(r.analytical_score, 13);
  assert.ok(r.human_review_required);
});

test('la somme des critères est exactement la note analytique', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2.25),
    critere('CONNAISSANCES', 3.75),
    critere('ARGUMENTATION', 2.5),
    critere('EXEMPLES', 1.25),
    critere('EXPRESSION', 1.5),
  ]);
  const somme = r.criteria.reduce((s, c) => s + c.score, 0);
  assert.equal(r.analytical_score, Math.round(somme * 100) / 100);
  assert.equal(r.analytical_score, 11.25);
  assert.ok(r.consistency_checks.score_sum_valid);
  assert.ok(r.consistency_checks.conversion_valid);
  assert.equal(r.official_score, 5.63);
});

test('un critère absent de la réponse vaut 0 et déclenche une relecture', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2),
    critere('CONNAISSANCES', 3),
  ]);
  assert.equal(r.criteria.length, 5);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'EXPRESSION').score, 0);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'critere_absent'));
  assert.ok(r.human_review_required);
});

test('le niveau affiché correspond au palier réellement atteint', () => {
  const critereArgu = GRILLE_DISSERTATION.criteres.find((c) => c.code === 'ARGUMENTATION');
  assert.equal(niveauPour(critereArgu, 0).niveau, 'nul');
  assert.equal(niveauPour(critereArgu, 2.75).niveau, 'fragile');
  assert.equal(niveauPour(critereArgu, 5).niveau, 'tres_satisfaisant');
  assert.equal(plafondDuNiveau(critereArgu, 'fragile'), 2);
  assert.equal(niveauGlobal(18, 20), 'tres_satisfaisant');
  assert.equal(niveauGlobal(7, 20), 'fragile');
  assert.equal(niveauGlobal(3.75, 20), 'insuffisant');
});

/* ================================================================== */
/*  3. Taxonomie : trois ensembles, aucun doublon                     */
/* ================================================================== */

test('les taxonomies des deux exercices sont séparées', () => {
  const diss = taxonomiePour('hggsp_dissertation').map((e) => e.code);
  const ec = taxonomiePour('hggsp_etude_critique').map((e) => e.code);
  const propresDiss = diss.filter((c) => c.startsWith('HGGSP_DIS_'));
  const propresEc = ec.filter((c) => c.startsWith('HGGSP_EC_'));
  assert.ok(propresDiss.length >= 12, 'erreurs propres à la dissertation');
  assert.ok(propresEc.length >= 14, "erreurs propres à l'étude critique");
  assert.equal(propresDiss.filter((c) => ec.includes(c)).length, 0);
  assert.equal(propresEc.filter((c) => diss.includes(c)).length, 0);
  // Les transversales sont bien dans les deux.
  assert.ok(diss.includes('HGGSP_TR_01') && ec.includes('HGGSP_TR_01'));
});

test('chaque code de la taxonomie vise un critère qui existe dans sa grille', () => {
  const codes = new Set();
  for (const e of TAXONOMIE) {
    assert.ok(!codes.has(e.code), `code dupliqué : ${e.code}`);
    codes.add(e.code);
    for (const [exercice, critere] of Object.entries(e.critere_principal)) {
      const grille = exercice === 'hggsp_dissertation' ? GRILLE_DISSERTATION : GRILLE_ETUDE_CRITIQUE;
      assert.ok(
        grille.criteres.some((c) => c.code === critere),
        `${e.code} vise ${critere}, absent de ${grille.id}`,
      );
    }
    if (e.type_impact === 'criterion_score_cap') assert.equal(typeof e.plafond_score, 'number', e.code);
    if (e.type_impact === 'criterion_level_cap') assert.ok(e.plafond_niveau, e.code);
    if (e.type_impact === 'contextual_range') assert.equal(typeof e.impact_max, 'number', e.code);
    assert.ok(e.message_pedagogique.length > 10, `${e.code} sans message pédagogique`);
    assert.ok(e.regle_non_double_sanction.length > 10, `${e.code} sans règle de non-double-sanction`);
  }
});

test("un code de l'autre exercice est signalé sans effet sur la note", () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 1.5, { citation: COPIE_EC.slice(0, 40) }),
      critere('PRELEVEMENT', 2.25, { citation: COPIE_EC.slice(0, 40) }),
      critere('EXPLICATION_CONNAISSANCES', 1, { citation: COPIE_EC.slice(0, 40) }),
      critere('ANALYSE_CRITIQUE', 1, { citation: COPIE_EC.slice(0, 40) }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: COPIE_EC.slice(0, 40) }),
      critere('EXPRESSION', 1.25, { citation: COPIE_EC.slice(0, 40) }),
    ],
    [{ taxonomy_code: 'HGGSP_DIS_05', criterion_id: 'CONSIGNE_PROBLEMATISATION', evidence: [] }],
  );
  assert.equal(r.analytical_score, 8.5);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'code_hors_taxonomie'));
});

/* ================================================================== */
/*  4. Règles d'impact — dissertation                                 */
/* ================================================================== */

test('problématique absente : plafond au niveau insuffisant, argumentation intacte', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1.5),
    ],
    [{ taxonomy_code: 'HGGSP_DIS_05', criterion_id: 'ANALYSE_PROBLEMATISATION', evidence: [], is_consequence: false }],
  );
  const analyse = r.criteria.find((c) => c.criterion_id === 'ANALYSE_PROBLEMATISATION');
  assert.equal(analyse.score, 1, 'plafonné au palier insuffisant');
  assert.equal(analyse.score_avant_plafond, 3);
  assert.deepEqual(analyse.plafonne_par, ['HGGSP_DIS_05']);
  // L'argumentation garde exactement le score observé : pas de sanction en chaîne.
  assert.equal(r.criteria.find((c) => c.criterion_id === 'ARGUMENTATION').score, 3);
  assert.equal(r.analytical_score, 10.5);
});

test('problématique descriptive : plafond au niveau fragile', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3.5),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1.5),
    ],
    [{ taxonomy_code: 'HGGSP_DIS_06', criterion_id: 'ANALYSE_PROBLEMATISATION', evidence: [] }],
  );
  assert.equal(r.criteria[0].score, 2);
  assert.equal(r.criteria[0].level, 'fragile');
});

test('cours récité : aucun retrait automatique, le critère fait foi', () => {
  const sans = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2),
    critere('CONNAISSANCES', 2),
    critere('ARGUMENTATION', 2),
    critere('EXEMPLES', 1),
    critere('EXPRESSION', 1),
  ]);
  const avec = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 2),
      critere('ARGUMENTATION', 2),
      critere('EXEMPLES', 1),
      critere('EXPRESSION', 1),
    ],
    [{ taxonomy_code: 'HGGSP_DIS_04', criterion_id: 'CONNAISSANCES', evidence: [] }],
  );
  assert.equal(avec.analytical_score, sans.analytical_score);
  const evt = avec.error_events[0];
  assert.equal(evt.impact_type, 'evidence_not_rewarded');
  assert.equal(evt.score_effect, null);
});

test('exemple seulement cité : pas de points d’exploitation, pas de seconde peine', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 2),
      critere('EXEMPLES', 1),
      critere('EXPRESSION', 1),
    ],
    [{ taxonomy_code: 'HGGSP_DIS_11', criterion_id: 'EXEMPLES', evidence: [] }],
  );
  assert.equal(r.criteria.find((c) => c.criterion_id === 'EXEMPLES').score, 1);
  // La connaissance attestée par l'exemple reste valorisée ailleurs.
  assert.equal(r.criteria.find((c) => c.criterion_id === 'CONNAISSANCES').score, 3);
  assert.equal(r.error_events[0].impact_type, 'evidence_not_rewarded');
});

test('erreur factuelle mineure et majeure : fourchettes indicatives, jamais soustraites', () => {
  const mineure = chercherTaxonomie('HGGSP_TR_01');
  const majeure = chercherTaxonomie('HGGSP_TR_03');
  assert.equal(mineure.impact_max, 0.25);
  assert.equal(majeure.impact_max, 1);
  assert.equal(majeure.relecture_humaine, true);

  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 2),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1),
    ],
    [
      { taxonomy_code: 'HGGSP_TR_01', evidence: [], score_effect: -0.25 },
      { taxonomy_code: 'HGGSP_TR_03', evidence: [], confidence: 0.9 },
    ],
  );
  // Le score_effect proposé par le modèle est ignoré : la note vient des critères.
  assert.equal(r.analytical_score, 10);
  assert.ok(r.error_events.every((e) => e.score_effect === null));
  assert.ok(r.human_review_reasons.some((m) => m.code === 'double_sanction_possible'));
  // Le contresens central envoie la copie en relecture humaine.
  assert.ok(r.human_review_reasons.some((m) => m.code === 'erreur_majeure_multi_criteres'));
  assert.deepEqual(
    r.error_events.find((e) => e.taxonomy_code === 'HGGSP_TR_01').indicative_range,
    { min: 0, max: 0.25 },
  );
});

test('absence de conclusion : comptée une fois dans la construction', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 2.5),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1),
    ],
    [{ taxonomy_code: 'HGGSP_TR_11', evidence: [] }],
  );
  const evt = r.error_events[0];
  assert.equal(evt.criterion_id, 'ARGUMENTATION');
  assert.equal(evt.impact_type, 'contextual_range');
  assert.equal(r.analytical_score, 10.5);
  assert.equal(r.error_events.filter((e) => e.taxonomy_code === 'HGGSP_TR_11').length, 1);
});

test('plan non annoncé : impact faible et méthodologique', () => {
  const e = chercherTaxonomie('HGGSP_DIS_07');
  assert.equal(e.impact_max, 0.25);
  assert.equal(e.gravite, 'mineure');
  assert.equal(e.type_impact, 'contextual_range');
});

test('production graphique : pertinente valorisée, absente jamais pénalisée', () => {
  const sans = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 4),
      critere('ARGUMENTATION', 4),
      critere('EXEMPLES', 3),
      critere('EXPRESSION', 1.5),
    ],
    [],
    { graphique: { presente: false, pertinente: false, interpretable: true, commentaire: '' } },
  );
  assert.equal(sans.analytical_score, 15.5);
  assert.ok(!sans.human_review_reasons.some((m) => m.code === 'production_graphique_non_interpretable'));

  // Un croquis pertinent peut porter le critère jusqu'à son maximum, sans le dépasser.
  const avec = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 4),
      critere('ARGUMENTATION', 5),
      critere('EXEMPLES', 4),
      critere('EXPRESSION', 1.5),
    ],
    [],
    { graphique: { presente: true, pertinente: true, interpretable: true, commentaire: 'croquis légendé' } },
  );
  assert.equal(avec.analytical_score, 17.5);
  assert.ok(avec.analytical_score <= 20);

  const illisible = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1.5),
    ],
    [],
    { graphique: { presente: true, pertinente: false, interpretable: false, commentaire: 'illisible' } },
  );
  assert.ok(illisible.human_review_reasons.some((m) => m.code === 'production_graphique_non_interpretable'));
});

/* ================================================================== */
/*  5. Règles d'impact — étude critique                               */
/* ================================================================== */

test('paraphrase avec prélèvements exacts : le prélèvement reste payé', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 0.75, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 2.25, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 1, { citation: "Mais ce conseil ne s'occupe pas des questions militaires" }),
      critere('ANALYSE_CRITIQUE', 0.5, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 0.75, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 1.25, { citation: 'Le document est une note de synthese' }),
    ],
    [{ taxonomy_code: 'HGGSP_EC_01', criterion_id: 'ANALYSE_CRITIQUE', evidence: preuveEC('Le document dit ensuite') }],
  );
  const prelevement = r.criteria.find((c) => c.criterion_id === 'PRELEVEMENT');
  assert.equal(prelevement.score, 2.25, 'la paraphrase ne touche pas au prélèvement');
  assert.equal(r.error_events[0].impact_type, 'evidence_not_rewarded');
  assert.equal(r.analytical_score, 6.5);
});

test('absence totale de critique : plafond 2,5/5, prélèvement intact', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 1.5, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 2.25, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 1, { citation: "ce conseil ne s'occupe pas des questions militaires" }),
      critere('ANALYSE_CRITIQUE', 4, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 1.25, { citation: 'Le document est une note de synthese' }),
    ],
    [{ taxonomy_code: 'HGGSP_EC_09', criterion_id: 'ANALYSE_CRITIQUE', evidence: preuveEC('Le document dit ensuite') }],
  );
  const critique = r.criteria.find((c) => c.criterion_id === 'ANALYSE_CRITIQUE');
  assert.equal(critique.score, 2.5);
  assert.equal(critique.score_avant_plafond, 4);
  assert.equal(r.error_events[0].criterion_cap, 2.5);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'PRELEVEMENT').score, 2.25);
});

test('critique pertinente mais connaissances limitées : les deux critères vivent leur vie', () => {
  const r = corrigerEtudeCritique([
    critere('CONSIGNE_PROBLEMATISATION', 2.25, { citation: 'Le document est une note de synthese' }),
    critere('PRELEVEMENT', 2.25, { citation: 'cinq Etats riverains font des demandes' }),
    critere('EXPLICATION_CONNAISSANCES', 1, { citation: "ce conseil ne s'occupe pas des questions militaires" }),
    critere('ANALYSE_CRITIQUE', 4, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
    critere('ORGANISATION_ARGUMENTATION', 2.25, { citation: 'Le document dit ensuite' }),
    critere('EXPRESSION', 1.5, { citation: 'Le document est une note de synthese' }),
  ]);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'ANALYSE_CRITIQUE').score, 4);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'EXPLICATION_CONNAISSANCES').score, 1);
  assert.equal(r.analytical_score, 13.25);
});

test('deuxième document ignoré : plafond du prélèvement, critique préservée', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 1.5, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 3, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 2, { citation: "ce conseil ne s'occupe pas des questions militaires" }),
      critere('ANALYSE_CRITIQUE', 3, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 1.5, { citation: 'Le document est une note de synthese' }),
    ],
    [{ taxonomy_code: 'HGGSP_EC_12', criterion_id: 'PRELEVEMENT', evidence: preuveEC('Le document dit ensuite') }],
    { documents: 1 },
  );
  assert.equal(r.criteria.find((c) => c.criterion_id === 'PRELEVEMENT').score, 1.5);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'ANALYSE_CRITIQUE').score, 3);
});

test('confrontation correcte de deux documents : aucun plafond, note pleine possible', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 3, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 3, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 3.5, { citation: "ce conseil ne s'occupe pas des questions militaires" }),
      critere('ANALYSE_CRITIQUE', 4.5, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 3, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 2, { citation: 'Le document est une note de synthese' }),
    ],
    [],
    { documents: 2 },
  );
  assert.equal(r.analytical_score, 19);
  assert.equal(r.official_score, 9.5);
  assert.equal(r.error_events.length, 0);
});

test('consigne partiellement traitée : plafond du seul critère de consigne', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 2.25, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 2.25, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 2, { citation: "ce conseil ne s'occupe pas des questions militaires" }),
      critere('ANALYSE_CRITIQUE', 2, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 1.25, { citation: 'Le document est une note de synthese' }),
    ],
    [{ taxonomy_code: 'HGGSP_EC_16', criterion_id: 'CONSIGNE_PROBLEMATISATION', evidence: preuveEC('Le document dit ensuite') }],
  );
  assert.equal(r.criteria[0].score, 1.5);
  assert.equal(r.criteria.find((c) => c.criterion_id === 'PRELEVEMENT').score, 2.25);
});

/* ================================================================== */
/*  6. Non-double-sanction (§10)                                      */
/* ================================================================== */

test('une conséquence déclarée ne plafonne pas une deuxième fois', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1.5),
    ],
    [
      { taxonomy_code: 'HGGSP_DIS_05', criterion_id: 'ANALYSE_PROBLEMATISATION', evidence: [] },
      {
        taxonomy_code: 'HGGSP_DIS_06',
        criterion_id: 'ANALYSE_PROBLEMATISATION',
        evidence: [],
        is_consequence: true,
        source_error_id: 'HGGSP_DIS_05',
      },
    ],
  );
  const analyse = r.criteria[0];
  assert.equal(analyse.score, 1, 'seul le premier plafond joue');
  assert.deepEqual(analyse.plafonne_par, ['HGGSP_DIS_05']);
  const consequence = r.error_events.find((e) => e.taxonomy_code === 'HGGSP_DIS_06');
  assert.equal(consequence.impact_type, 'informational_only');
  assert.equal(consequence.is_consequence, true);
  assert.equal(consequence.source_error_id, 'HGGSP_DIS_05');
  assert.match(consequence.scoring_effect, /NON appliqué/);
});

test('le même code signalé deux fois ne plafonne qu’une fois', () => {
  const r = corrigerEtudeCritique(
    [
      critere('CONSIGNE_PROBLEMATISATION', 1.5, { citation: 'Le document est une note de synthese' }),
      critere('PRELEVEMENT', 2.25, { citation: 'cinq Etats riverains font des demandes' }),
      critere('EXPLICATION_CONNAISSANCES', 2, { citation: "ce conseil ne s'occupe pas" }),
      critere('ANALYSE_CRITIQUE', 5, { citation: "Donc l'Arctique est bien devenu un espace de rivalites" }),
      critere('ORGANISATION_ARGUMENTATION', 1.5, { citation: 'Le document dit ensuite' }),
      critere('EXPRESSION', 1.5, { citation: 'Le document est une note de synthese' }),
    ],
    [
      { taxonomy_code: 'HGGSP_EC_09', criterion_id: 'ANALYSE_CRITIQUE', evidence: preuveEC('Le document dit ensuite') },
      { taxonomy_code: 'HGGSP_EC_09', criterion_id: 'ANALYSE_CRITIQUE', evidence: preuveEC('Le document dit ensuite') },
    ],
  );
  assert.equal(r.criteria.find((c) => c.criterion_id === 'ANALYSE_CRITIQUE').score, 2.5);
  assert.equal(r.error_events[1].impact_type, 'informational_only');
  assert.ok(r.consistency_checks.no_double_penalty || r.human_review_required);
});

test('deux plafonds indépendants sur le même critère sont signalés', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 4),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 3),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1.5),
    ],
    [
      { taxonomy_code: 'HGGSP_DIS_05', criterion_id: 'ANALYSE_PROBLEMATISATION', evidence: [] },
      { taxonomy_code: 'HGGSP_DIS_03', criterion_id: 'ANALYSE_PROBLEMATISATION', evidence: [] },
    ],
  );
  assert.ok(r.human_review_reasons.some((m) => m.code === 'double_sanction_possible'));
  assert.equal(r.consistency_checks.no_double_penalty, false);
});

test('aucune erreur ne peut retrancher des points directement', () => {
  const { criteres, evenements } = appliquerErreurs(
    GRILLE_DISSERTATION,
    normaliserCriteres(GRILLE_DISSERTATION, [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 2),
      critere('ARGUMENTATION', 2),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1),
    ]).criteres,
    [
      { taxonomy_code: 'HGGSP_TR_01', evidence: [], score_effect: -2 },
      { taxonomy_code: 'HGGSP_TR_04', evidence: [], score_effect: -1 },
    ],
  );
  assert.equal(criteres.reduce((s, c) => s + c.score, 0), 9);
  assert.ok(evenements.every((e) => e.score_effect === null));
});

/* ================================================================== */
/*  7. Relecture humaine (§14)                                        */
/* ================================================================== */

test('transcription incertaine : relecture demandée, jamais imputée à l’élève', () => {
  const r = construireResultatExercice({
    examId: null,
    examFormat: 'dissertation_only',
    grille: GRILLE_DISSERTATION,
    reponse: {
      criteria: [
        critere('ANALYSE_PROBLEMATISATION', 2),
        critere('CONNAISSANCES', 3),
        critere('ARGUMENTATION', 2),
        critere('EXEMPLES', 2),
        critere('EXPRESSION', 1),
      ],
      error_events: [{ taxonomy_code: 'HGGSP_TR_12', evidence: [] }],
      strengths: [],
      priorities: [],
      general_feedback: '',
      confidence: 0.95,
      human_review_required: false,
      human_review_reasons: [],
    },
    texteTranscription: COPIE_DISS,
    transcription: { overall_confidence: 0.6, requires_human_review: true },
    statutGrille: 'in_use',
    grilleVerrouillee: true,
    etalonsCompares: 6,
  });
  assert.ok(r.human_review_required);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'transcription_incertaine'));
  // La note reste celle des critères : le doute ne coûte rien à l'élève.
  assert.equal(r.analytical_score, 10);
  assert.equal(r.error_events[0].impact_type, 'human_review_required');
});

test('confiance insuffisante du correcteur : relecture', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 2),
      critere('CONNAISSANCES', 3),
      critere('ARGUMENTATION', 2),
      critere('EXEMPLES', 2),
      critere('EXPRESSION', 1),
    ],
    [],
    { confidence: 0.6 },
  );
  assert.ok(r.human_review_reasons.some((m) => m.code === 'confiance_insuffisante'));
});

test('écart fort à un étalon comparable : relecture', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 4),
      critere('CONNAISSANCES', 5),
      critere('ARGUMENTATION', 5),
      critere('EXEMPLES', 4),
      critere('EXPRESSION', 2),
    ],
    [],
    { etalon: { libelle: 'Étalon moyen', note: 11 } },
  );
  assert.ok(r.human_review_reasons.some((m) => m.code === 'ecart_aux_etalons'));
});

test('copie presque entièrement hors sujet : relecture avant de rendre la note', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 0.5),
      critere('CONNAISSANCES', 2),
      critere('ARGUMENTATION', 1),
      critere('EXEMPLES', 0.5),
      critere('EXPRESSION', 1),
    ],
    [{ taxonomy_code: 'HGGSP_TR_05', evidence: [] }],
  );
  assert.ok(r.human_review_reasons.some((m) => m.code === 'copie_presque_hors_sujet'));
});

test('des points sans citation déclenchent une relecture', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2, { preuves: [] }),
    critere('CONNAISSANCES', 3),
    critere('ARGUMENTATION', 2),
    critere('EXEMPLES', 2),
    critere('EXPRESSION', 1),
  ]);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'citation_introuvable'));
});

/* ================================================================== */
/*  8. Contrôles de cohérence (§15)                                   */
/* ================================================================== */

test('une citation absente de la transcription est détectée', () => {
  assert.ok(citationPresente("L'ONU est fondée en 1945 par la charte de San Francisco", COPIE_DISS));
  assert.ok(!citationPresente('Le traité de Versailles est signé en 1919 par les Alliés', COPIE_DISS));

  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2, { citation: 'Le traité de Versailles est signé en 1919 par les Alliés' }),
    critere('CONNAISSANCES', 3),
    critere('ARGUMENTATION', 2),
    critere('EXEMPLES', 2),
    critere('EXPRESSION', 1),
  ]);
  assert.equal(r.consistency_checks.evidence_verified, false);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'citation_introuvable'));
});

test('appréciation en contradiction avec les scores : signalée', () => {
  assert.ok(contradictionAppreciation(3, GRILLE_DISSERTATION, 'Excellente copie, maîtrise remarquable.'));
  assert.ok(!contradictionAppreciation(17, GRILLE_DISSERTATION, 'Excellente copie, maîtrise remarquable.'));

  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 0.5),
      critere('CONNAISSANCES', 1),
      critere('ARGUMENTATION', 1),
      critere('EXEMPLES', 0.5),
      critere('EXPRESSION', 0.5),
    ],
    [],
    { appreciation: 'Excellente copie, maîtrise remarquable du sujet.' },
  );
  assert.equal(r.consistency_checks.feedback_consistent, false);
  assert.ok(r.human_review_reasons.some((m) => m.code === 'contradiction_score_appreciation'));
});

test('une copie cohérente passe tous les contrôles et ne part pas en relecture', () => {
  const r = corrigerDissertation(
    [
      critere('ANALYSE_PROBLEMATISATION', 3, {
        citation: "Dans quelle mesure les modes de resolution des conflits sont-ils devenus plus efficaces depuis 1945 ?",
        forces: ['problématique explicite'],
      }),
      critere('CONNAISSANCES', 3.5, { citation: "L'ONU est fondee en 1945 par la charte de San Francisco" }),
      critere('ARGUMENTATION', 3, { citation: "En conclusion, les modes de resolution ont change de nature" }),
      critere('EXEMPLES', 2.5, { citation: 'La crise de Cuba en 1962 montre le role de la dissuasion nucleaire' }),
      critere('EXPRESSION', 1.5, { citation: "La guerre froide oppose les Etats-Unis et l'URSS de 1947 a 1991" }),
    ],
    [],
    {
      strengths: ['Une problématique claire'],
      priorities: ['Développer les exemples'],
      appreciation: 'Copie sérieuse et organisée, à approfondir sur les exemples.',
    },
  );
  const c = r.consistency_checks;
  assert.ok(c.score_sum_valid && c.conversion_valid && c.step_valid);
  assert.ok(c.no_double_penalty && c.evidence_verified && c.feedback_consistent && c.taxonomy_valid);
  assert.deepEqual(r.human_review_reasons, []);
  assert.equal(r.human_review_required, false);
  assert.equal(r.analytical_score, 13.5);
  assert.equal(r.official_score, 6.75);
});

test('les contrôles détectent une note qui ne correspond pas à la somme', () => {
  const c = controlesCoherence({
    grille: GRILLE_DISSERTATION,
    criteres: [{ criterion_id: 'X', libelle: 'X', score: 5, max_score: 20, level: 'moyen', level_label: '', observed_strengths: [], observed_weaknesses: [], evidence: [], feedback: '', human_review_required: false }],
    evenements: [],
    noteAnalytique: 12,
    noteOfficielle: 3,
    strengths: [],
    priorities: [],
    appreciation: '',
    texteTranscription: COPIE_DISS,
    motifs: [],
  });
  assert.equal(c.score_sum_valid, false);
  assert.equal(c.conversion_valid, false);
});

/* ================================================================== */
/*  9. Versionnement, verrouillage, étalons                           */
/* ================================================================== */

test('une grille verrouillée ou en service n’est plus modifiable', () => {
  assert.ok(grilleModifiable('draft'));
  assert.ok(grilleModifiable('calibrating'));
  assert.ok(grilleModifiable('validated'));
  assert.ok(!grilleModifiable('locked'));
  assert.ok(!grilleModifiable('in_use'));
  assert.ok(!grilleModifiable('archived'));
});

test('la couverture des étalons dit ce qui manque', () => {
  const { manquants } = couvertureEtalons(['tres_faible', 'moyen', 'excellent']);
  const codes = manquants.map((m) => m.code);
  assert.deepEqual(codes, ['fragile', 'assez_bon', 'tres_bon']);
});

test('la version de grille voyage jusque dans le résultat', () => {
  const r = corrigerDissertation([
    critere('ANALYSE_PROBLEMATISATION', 2),
    critere('CONNAISSANCES', 2),
    critere('ARGUMENTATION', 2),
    critere('EXEMPLES', 2),
    critere('EXPRESSION', 1),
  ]);
  assert.equal(r.rubric_id, 'HGGSP_DISSERTATION_V2');
  assert.equal(r.rubric_version, '2.0');
  assert.equal(r.moteur, 'criteres_rediges');
  assert.equal(r.calibration_metadata.rubric_locked, true);
  assert.equal(r.calibration_metadata.etalons_compares, 6);
});

/* ================================================================== */
/*  10. Consigne système et schéma de sortie                          */
/* ================================================================== */

test('la consigne système décrit exactement la grille appliquée', () => {
  const consigne = consigneSysteme(GRILLE_ETUDE_CRITIQUE, { deuxDocuments: true });
  for (const c of GRILLE_ETUDE_CRITIQUE.criteres) {
    assert.ok(consigne.includes(c.code), `${c.code} absent de la consigne`);
    assert.ok(consigne.includes(`max ${c.max_points}`), `maximum de ${c.code} absent`);
  }
  assert.ok(consigne.includes('HGGSP_EC_09'));
  assert.ok(!consigne.includes('HGGSP_DIS_05'), 'aucun code de dissertation dans la consigne d’étude critique');
  assert.ok(consigne.includes('DEUX documents'));
  assert.ok(consigne.includes('0,25'));

  const consigneDiss = consigneSysteme(GRILLE_DISSERTATION);
  assert.ok(consigneDiss.includes('PRODUCTION GRAPHIQUE'));
  assert.ok(!consigneDiss.includes('HGGSP_EC_01'));
});

test('le schéma de sortie exige les preuves et les champs de non-double-sanction', () => {
  const s = schemaSortie();
  const erreur = s.properties.error_events.items;
  for (const champ of ['taxonomy_code', 'source_error_id', 'is_consequence', 'already_counted', 'evidence']) {
    assert.ok(erreur.required.includes(champ), `${champ} non exigé`);
  }
  assert.ok(s.properties.criteria.items.required.includes('evidence'));
});

/* ================================================================== */
/*  11. Non-régression : le critère principal dépend de l'exercice    */
/* ================================================================== */

test('une erreur transversale vise le bon critère dans chaque exercice', () => {
  const factuelle = chercherTaxonomie('HGGSP_TR_02');
  assert.equal(criterePrincipal(factuelle, 'hggsp_dissertation'), 'CONNAISSANCES');
  assert.equal(criterePrincipal(factuelle, 'hggsp_etude_critique'), 'EXPLICATION_CONNAISSANCES');

  const conclusion = chercherTaxonomie('HGGSP_TR_11');
  assert.equal(criterePrincipal(conclusion, 'hggsp_dissertation'), 'ARGUMENTATION');
  assert.equal(criterePrincipal(conclusion, 'hggsp_etude_critique'), 'ORGANISATION_ARGUMENTATION');
});
