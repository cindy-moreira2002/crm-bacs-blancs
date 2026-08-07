#!/usr/bin/env node
// =====================================================================
//  INSTALLER LES GRILLES HGGSP SESSION 2026 DANS LE PIPELINE
//
//  Usage :
//    node scripts/apply-hggsp.mjs --check
//    node scripts/apply-hggsp.mjs --apply
//    node scripts/apply-hggsp.mjs --apply --sql supabase/sql/41_hggsp_donnees_v2.sql
//
//  La STRUCTURE est posee par supabase/sql/40_hggsp_redige_v2.sql. Ce
//  script ne pose que des DONNEES, et il les lit toutes dans le noyau
//  supabase/functions/_shared/hggsp-noyau.ts : impossible que la base
//  decrive un bareme different de celui que le moteur applique.
//
//  Ce qu'il ecrit :
//    1. les 2 grilles v2 (criteres + descripteurs, ligne par ligne) ;
//    2. la taxonomie separee (transversale / dissertation / etude critique)
//       avec ses regles d'impact et de non-double-sanction ;
//    3. les 2 grilles "rubrics" v2 qui pointent vers le moteur redige,
//       et l'ARCHIVAGE des v1 (jamais leur suppression) ;
//    4. un sujet d'etude critique a DEUX documents (le cas du paragraphe 7
//       n'etait couvert par aucun sujet existant) ;
//    5. les copies etalons v2 : 8 niveaux par sujet, dont 2 copies
//       frontieres, exprimees dans les criteres de la NOUVELLE grille ;
//    6. les gabarits de dossier eleve v2, qui distinguent la note
//       analytique sur 20 de la note officielle sur 10 ;
//    7. un examen "bac blanc complet" et ses deux exercices.
//
//  RIEN N'EST SUPPRIME : les lignes v1 sont conservees et passees en
//  'archived'. Les corrections deja enregistrees ne sont pas touchees.
//
//  Les identifiants viennent de .env / .env.local
//  (PIPELINE_SUPABASE_URL + PIPELINE_SUPABASE_SERVICE_ROLE_KEY) et ne sont
//  jamais affiches.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import {
  GRILLE_DISSERTATION,
  GRILLE_ETUDE_CRITIQUE,
  TAXONOMIE,
  taxonomiePour,
  consigneSysteme,
  convertirEnOfficiel,
  criterePrincipal,
} from '../supabase/functions/_shared/hggsp-noyau.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const GRILLES = [GRILLE_DISSERTATION, GRILLE_ETUDE_CRITIQUE];

/* ------------------------------------------------------------------ */
/*  Environnement                                                     */
/* ------------------------------------------------------------------ */

function chargerEnv() {
  const env = {};
  for (const fichier of ['.env', '.env.local']) {
    let texte;
    try {
      texte = readFileSync(`${ROOT}/${fichier}`, 'utf8');
    } catch {
      continue;
    }
    for (const ligne of texte.split('\n')) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

/** UUID deterministe (v5, namespace fixe) : rejouer le script n'invente pas de doublon. */
function uuidStable(nom) {
  const h = createHash('sha1').update(`matinees-du-bac:hggsp:${nom}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const s = b.toString('hex');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/* ------------------------------------------------------------------ */
/*  1. Grilles, criteres, descripteurs                                */
/* ------------------------------------------------------------------ */

const grilles = GRILLES.map((g) => ({
  id: g.id,
  matiere: g.matiere,
  exercise_type: g.exercise_type,
  version: g.version,
  libelle: g.libelle,
  principe: g.principe,
  system_prompt: consigneSysteme(g),
  max_analytique: g.max_analytique,
  max_officiel: g.max_officiel,
  // Les grilles arrivent en calibration : elles ne corrigent pour de vrai
  // qu'apres relecture par un professeur, puis verrouillage.
  statut: 'calibrating',
  garde_fous: g.garde_fous,
  commentaire:
    "Grille conforme a la note de service MENE2521923N (BO n° 33, 2025) : dissertation /10 + etude critique /10 = /20. Echelle analytique interne sur 20, conversion automatique.",
  cree_par: 'pipeline-hggsp-v2',
}));

const criteres = [];
const descripteurs = [];
for (const g of GRILLES) {
  for (const c of g.criteres) {
    const idCritere = `${g.id}::${c.code}`;
    criteres.push({
      id: idCritere,
      grille_id: g.id,
      code: c.code,
      libelle: c.libelle,
      evaluer: c.evaluer,
      max_points: c.max_points,
      ordre: c.ordre,
    });
    for (const p of c.paliers) {
      descripteurs.push({
        id: `${idCritere}::${p.points}`,
        critere_id: idCritere,
        points: p.points,
        niveau: p.niveau,
        description: p.description,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  2. Taxonomie                                                      */
/* ------------------------------------------------------------------ */

const taxonomie = TAXONOMIE.map((e) => ({
  id: `hggsp::${e.code}::2.0`,
  matiere: 'hggsp',
  code: e.code,
  version: '2.0',
  libelle: e.libelle,
  portee: e.portee,
  description: e.description,
  critere_principal: e.critere_principal,
  criteres_secondaires: e.criteres_secondaires,
  gravite: e.gravite,
  type_impact: e.type_impact,
  impact_min: e.impact_min,
  impact_max: e.impact_max,
  plafond_score: e.plafond_score,
  plafond_niveau: e.plafond_niveau,
  conditions: e.conditions,
  regle_non_double_sanction: e.regle_non_double_sanction,
  message_pedagogique: e.message_pedagogique,
  relecture_humaine: e.relecture_humaine,
}));

/* ------------------------------------------------------------------ */
/*  3. Grilles "rubrics" v2 (compatibilite avec tout l'existant)       */
/*                                                                    */
/*  Le depot, la page de relecture, l'inventaire /admin/correction et  */
/*  generate-dossier lisent tous rubrics. On y ecrit la NOUVELLE       */
/*  grille, avec le drapeau moteur qui envoie la copie vers            */
/*  correct-copy-redigee. Aucun de ces ecrans n'a besoin de changer.   */
/* ------------------------------------------------------------------ */

function rubricJson(g) {
  return {
    principle: g.principe,
    maximum_score: g.max_analytique,
    official_maximum_score: g.max_officiel,
    conversion:
      'note_officielle_exercice = note_analytique / 2 ; note_finale = officielle(dissertation) + officielle(etude critique)',
    exam_formats: ['full_exam', 'dissertation_only', 'document_study_only'],
    criteria: g.criteres.map((c) => ({
      code: c.code,
      name: c.libelle,
      maximum_score: c.max_points,
      description: `${c.evaluer.join(' ; ')}.`,
      levels: Object.fromEntries(c.paliers.map((p) => [String(p.points), p.description])),
    })),
    guardrails: g.garde_fous,
    source_status: 'grille_matinees_du_bac_v2_conforme_bo_2026',
    official_basis:
      "Note de service MENE2521923N (BO n° 33, 2025) : epreuve ecrite de specialite HGGSP = une dissertation sur 10 et une etude critique de document(s) sur 10, total sur 20.",
    common_error_taxonomy: taxonomiePour(g.exercise_type).map((e) => ({
      code: e.code,
      category: e.portee,
      severity: e.gravite,
      description: e.description,
      criterion: criterePrincipal(e, g.exercise_type) ?? undefined,
      impact_type: e.type_impact,
      impact_min: e.impact_min,
      impact_max: e.impact_max,
      criterion_cap: e.plafond_score,
      criterion_level_cap: e.plafond_niveau,
      conditions: e.conditions,
      no_double_penalty: e.regle_non_double_sanction,
      student_message: e.message_pedagogique,
      human_review_required: e.relecture_humaine,
    })),
  };
}

const rubrics = GRILLES.map((g) => ({
  id: g.id,
  track: 'generale',
  matiere: 'hggsp',
  exercise_type: g.exercise_type,
  version: 2,
  status: 'active',
  system_prompt: consigneSysteme(g),
  rubric_json: rubricJson(g),
  moteur: 'criteres_rediges',
  grille_id: g.id,
  role: 'note_officielle',
  note_officielle: true,
}));

const rubricsAArchiver = ['HGGSP_DISSERTATION_V1', 'HGGSP_ETUDE_CRITIQUE_V1'];

/* ------------------------------------------------------------------ */
/*  4. Un sujet d'etude critique a DEUX documents                     */
/* ------------------------------------------------------------------ */

const SUJET_DEUX_DOCS = {
  id: 'HGGSP2027_EC_04',
  track: 'generale',
  matiere: 'hggsp',
  exercise_type: 'hggsp_etude_critique',
  work_id: 'HGGSP_T2_GUERRE_PAIX',
  status: 'active',
  card_json: {
    session: 2027,
    exercise: 'Étude critique de deux documents',
    work: 'Deux regards sur le maintien de la paix par l’ONU',
    field: 'Thème 2 — Faire la guerre, faire la paix',
    theme_id: 'HGGSP_T2',
    theme_title: 'Faire la guerre, faire la paix : formes de conflits et modes de résolution',
    source_status: 'synthetic_training_template_not_official_exam',
    warning:
      'Gabarit synthétique d’entraînement, pas un sujet officiel ni une annale reproduite. Les deux documents sont rédigés pour l’exercice.',
    prompt:
      'À partir de l’étude critique des deux documents, montrez comment l’efficacité des opérations de maintien de la paix est évaluée de façon divergente, et précisez ce que la confrontation des deux documents permet — et ne permet pas — d’établir.',
    document_requirements: 'deux documents ; confrontation attendue',
    nombre_documents: 2,
    documents: [
      {
        ref: 'Document 1',
        nature:
          'Extrait SYNTHÉTIQUE d’un rapport institutionnel, rédigé pour l’entraînement dans le style d’un bilan annuel d’organisation internationale (2024). Ni archive ni source authentique.',
        contenu:
          "Le rapport rappelle que douze opérations de maintien de la paix sont déployées et que les effectifs ont diminué d'un tiers en dix ans. Il souligne que, là où les casques bleus sont présents, le nombre de victimes civiles recensées baisse en moyenne après deux ans de déploiement. Il insiste sur le rôle de la médiation et sur la protection des populations comme mandat central. Il reconnaît des difficultés de financement et des délais de déploiement, mais conclut que le maintien de la paix reste « l'outil collectif le plus économique dont dispose la communauté internationale ».",
      },
      {
        ref: 'Document 2',
        nature:
          "Tribune SYNTHÉTIQUE d'une chercheuse en relations internationales, rédigée pour l'entraînement dans le style d'une revue d'analyse stratégique (2024). Ni archive ni source authentique.",
        contenu:
          "La tribune conteste la mesure de l'efficacité retenue par les institutions. Elle souligne que la baisse des victimes recensées tient autant au déplacement des populations qu'à la protection effective, que les mandats sont votés sans moyens correspondants, et que le consentement des États hôtes conditionne tout. Elle rappelle plusieurs situations où les casques bleus n'ont pas empêché des massacres, et estime que « l'on mesure ce que l'on sait compter, pas ce qui protège ». Elle ne conteste pas l'utilité du dispositif mais son évaluation.",
      },
    ],
    expected_concepts: [
      'maintien de la paix',
      'sécurité collective',
      'mandat',
      'consentement des États',
      'ONU',
      'protection des civils',
      'efficacité',
      'médiation',
    ],
    expected_mechanisms: [
      'Les deux documents portent sur le même objet mais ne définissent pas l’efficacité de la même façon : c’est le cœur de la confrontation attendue.',
      'Le document 1 émane de l’institution évaluée : son point de vue est situé, ce qui n’invalide pas ses données.',
      'Le document 2 est une analyse critique externe : elle conteste la mesure, pas l’utilité — ne pas transformer la divergence en opposition frontale.',
      'La confrontation permet d’établir un désaccord sur les indicateurs ; elle ne permet pas de trancher l’efficacité réelle, faute de données primaires.',
    ],
    special_criteria: [
      'les DEUX documents doivent être réellement exploités',
      'la confrontation est attendue : convergences, divergences, complémentarité',
      'ne pas opposer artificiellement deux documents qui se complètent',
      'attribuer chaque citation au bon document',
    ],
    traps: [
      'analyser le document 1 puis le document 2 sans jamais les mettre en relation',
      'ignorer le document 2, plus court',
      'attribuer la citation « l’on mesure ce que l’on sait compter » au rapport institutionnel',
      'conclure que le maintien de la paix est « inefficace » alors que le document 2 conteste la mesure, pas le dispositif',
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  5. Copies etalons v2                                              */
/*                                                                    */
/*  Profils exprimes dans les criteres de la NOUVELLE grille. En etude */
/*  critique, une copie faible PRELEVE correctement et ne critique pas */
/*  — c'est exactement ce que l'ancienne grille ne savait pas dire.    */
/* ------------------------------------------------------------------ */

const PROFILS = {
  hggsp_dissertation: [
    { niveau: 'tres_faible', frontiere: false, note: 4, scores: { ANALYSE_PROBLEMATISATION: 0.75, CONNAISSANCES: 1.25, ARGUMENTATION: 1, EXEMPLES: 0.5, EXPRESSION: 0.5 },
      description: 'Sujet mal compris, aucune problématique, connaissances rares, aucun exemple exploité.' },
    { niveau: 'fragile', frontiere: false, note: 7, scores: { ANALYSE_PROBLEMATISATION: 1.5, CONNAISSANCES: 2, ARGUMENTATION: 1.75, EXEMPLES: 1, EXPRESSION: 0.75 },
      description: 'Sujet globalement compris, problématique descriptive, juxtaposition de connaissances, exemples cités sans être exploités.' },
    { niveau: 'moyen', frontiere: true, note: 9.75, scores: { ANALYSE_PROBLEMATISATION: 2, CONNAISSANCES: 2.75, ARGUMENTATION: 2.5, EXEMPLES: 1.5, EXPRESSION: 1 },
      description: 'Copie frontière 9–10 : plan visible mais descriptif, quelques exemples précis, conclusion faible.' },
    { niveau: 'moyen', frontiere: false, note: 10.5, scores: { ANALYSE_PROBLEMATISATION: 2, CONNAISSANCES: 3, ARGUMENTATION: 2.5, EXEMPLES: 2, EXPRESSION: 1 },
      description: 'Démonstration cohérente mais inégale, bornes partiellement tenues, exemples corrects.' },
    { niveau: 'moyen', frontiere: true, note: 11.75, scores: { ANALYSE_PROBLEMATISATION: 2.5, CONNAISSANCES: 3.25, ARGUMENTATION: 2.75, EXEMPLES: 2.25, EXPRESSION: 1 },
      description: 'Copie frontière 11–12 : problématique correcte, argumentation qui progresse, exemples encore imprécis.' },
    { niveau: 'assez_bon', frontiere: false, note: 13.5, scores: { ANALYSE_PROBLEMATISATION: 3, CONNAISSANCES: 3.5, ARGUMENTATION: 3.25, EXEMPLES: 2.5, EXPRESSION: 1.25 },
      description: 'Sujet analysé, plan pertinent, exemples précis mais inégalement exploités.' },
    { niveau: 'tres_bon', frontiere: false, note: 16.5, scores: { ANALYSE_PROBLEMATISATION: 3.25, CONNAISSANCES: 4.25, ARGUMENTATION: 4, EXEMPLES: 3.5, EXPRESSION: 1.5 },
      description: 'Problématique directrice, démonstration solide, exemples variés et exploités.' },
    { niveau: 'excellent', frontiere: false, note: 19, scores: { ANALYSE_PROBLEMATISATION: 4, CONNAISSANCES: 5, ARGUMENTATION: 4.75, EXEMPLES: 3.75, EXPRESSION: 1.5 },
      description: 'Analyse complète, tension réelle, démonstration nuancée, exemples comparés à chaque étape.' },
  ],
  hggsp_etude_critique: [
    { niveau: 'tres_faible', frontiere: false, note: 5, scores: { CONSIGNE_PROBLEMATISATION: 0.75, PRELEVEMENT: 1.5, EXPLICATION_CONNAISSANCES: 0.5, ANALYSE_CRITIQUE: 0.5, ORGANISATION_ARGUMENTATION: 0.75, EXPRESSION: 1 },
      description: 'Paraphrase du document. Les informations principales sont bien repérées — elles sont payées — mais rien n’est expliqué ni critiqué.' },
    { niveau: 'fragile', frontiere: false, note: 7.25, scores: { CONSIGNE_PROBLEMATISATION: 1.5, PRELEVEMENT: 1.5, EXPLICATION_CONNAISSANCES: 1, ANALYSE_CRITIQUE: 1.5, ORGANISATION_ARGUMENTATION: 0.75, EXPRESSION: 1 },
      description: 'Consigne comprise, prélèvement inégal, caractéristiques du document citées sans effet sur l’interprétation.' },
    { niveau: 'moyen', frontiere: true, note: 9.75, scores: { CONSIGNE_PROBLEMATISATION: 1.5, PRELEVEMENT: 2.25, EXPLICATION_CONNAISSANCES: 1.5, ANALYSE_CRITIQUE: 2, ORGANISATION_ARGUMENTATION: 1.25, EXPRESSION: 1.25 },
      description: 'Copie frontière 9–10 : prélèvement solide, quelques remarques critiques, description encore dominante.' },
    { niveau: 'moyen', frontiere: false, note: 10.5, scores: { CONSIGNE_PROBLEMATISATION: 1.5, PRELEVEMENT: 2.25, EXPLICATION_CONNAISSANCES: 2, ANALYSE_CRITIQUE: 2, ORGANISATION_ARGUMENTATION: 1.5, EXPRESSION: 1.25 },
      description: 'Document expliqué par quelques connaissances, critique amorcée mais incomplète.' },
    { niveau: 'moyen', frontiere: true, note: 11.75, scores: { CONSIGNE_PROBLEMATISATION: 2.25, PRELEVEMENT: 2.25, EXPLICATION_CONNAISSANCES: 2, ANALYSE_CRITIQUE: 2.75, ORGANISATION_ARGUMENTATION: 1.25, EXPRESSION: 1.25 },
      description: 'Copie frontière 11–12 : source et intention interrogées, contextualisation partielle.' },
    { niveau: 'assez_bon', frontiere: false, note: 13.5, scores: { CONSIGNE_PROBLEMATISATION: 2.25, PRELEVEMENT: 2.25, EXPLICATION_CONNAISSANCES: 2.5, ANALYSE_CRITIQUE: 3.5, ORGANISATION_ARGUMENTATION: 1.5, EXPRESSION: 1.5 },
      description: 'Critique régulière reliée à la problématique, connaissances précises, organisation encore inégale.' },
    { niveau: 'tres_bon', frontiere: false, note: 16.5, scores: { CONSIGNE_PROBLEMATISATION: 2.25, PRELEVEMENT: 2.75, EXPLICATION_CONNAISSANCES: 3.5, ANALYSE_CRITIQUE: 4.25, ORGANISATION_ARGUMENTATION: 2.25, EXPRESSION: 1.5 },
      description: 'Portée, biais et limites analysés, connaissances intégrées, raisonnement progressif.' },
    { niveau: 'excellent', frontiere: false, note: 19, scores: { CONSIGNE_PROBLEMATISATION: 3, PRELEVEMENT: 3, EXPLICATION_CONNAISSANCES: 4, ANALYSE_CRITIQUE: 5, ORGANISATION_ARGUMENTATION: 2.5, EXPRESSION: 1.5 },
      description: 'Mise à distance complète : contenu, point de vue, portée, biais et silences nettement distingués.' },
  ],
};

const SUJETS = [
  { id: 'HGGSP2027_DISS_01', exercise_type: 'hggsp_dissertation' },
  { id: 'HGGSP2027_DISS_02', exercise_type: 'hggsp_dissertation' },
  { id: 'HGGSP2027_DISS_03', exercise_type: 'hggsp_dissertation' },
  { id: 'HGGSP2027_EC_01', exercise_type: 'hggsp_etude_critique' },
  { id: 'HGGSP2027_EC_02', exercise_type: 'hggsp_etude_critique' },
  { id: 'HGGSP2027_EC_03', exercise_type: 'hggsp_etude_critique' },
  { id: 'HGGSP2027_EC_04', exercise_type: 'hggsp_etude_critique' },
];

const etalons = [];
const etalonCopies = [];
for (const sujet of SUJETS) {
  const grille = GRILLES.find((g) => g.exercise_type === sujet.exercise_type);
  const profils = PROFILS[sujet.exercise_type];
  for (const p of profils) {
    const suffixe = `${p.niveau.toUpperCase()}${p.frontiere ? `_F${String(p.note).replace('.', '_')}` : ''}`;
    const id = `${sujet.id}_V2_${suffixe}`;
    const officiel = convertirEnOfficiel(p.note, grille);
    etalons.push({
      id,
      track: 'generale',
      exercise_type: sujet.exercise_type,
      subject_id: sujet.id,
      score: p.note,
      error_codes: [],
      validation_status: 'candidate',
      card_json: {
        rubric_version: '2.0',
        grille_id: grille.id,
        niveau: p.niveau,
        frontiere: p.frontiere,
        note_analytique: p.note,
        max_analytique: grille.max_analytique,
        note_officielle: officiel,
        max_officiel: grille.max_officiel,
        criterion_scores: p.scores,
        description: p.description,
        origin: 'synthetic_calibration_profile_v2',
        warning:
          'Profil synthetique de calibration provisoire : a remplacer par une vraie copie notee par un professeur. La note reste approximative tant que cet etalon n’est pas valide.',
        validation_humaine: 'aucune',
      },
    });
    etalonCopies.push({
      id: uuidStable(id),
      libelle: `${sujet.id} — ${p.niveau}${p.frontiere ? ' (copie frontière)' : ''} — ${p.note}/20`,
      niveau_cible: p.niveau,
      frontiere: p.frontiere,
      grille_id: grille.id,
      exercise_type: sujet.exercise_type,
      matiere: 'hggsp',
      benchmark_card_id: id,
      statut: 'importee',
      commentaire: p.description,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  6. Gabarits de dossier eleve v2                                   */
/* ------------------------------------------------------------------ */

function promptDossier(g) {
  return [
    `Tu rediges le dossier pedagogique d'un eleve de terminale pour ${g.libelle}.`,
    '',
    'REGLE ABSOLUE SUR LES NOTES',
    `La correction fournie porte DEUX notes qui ne se confondent jamais : la note ANALYTIQUE interne sur ${g.max_analytique} (analytical_score) et la note OFFICIELLE de l'exercice sur ${g.max_officiel} (official_score), obtenue en divisant la premiere par deux.`,
    "Si exam_format vaut 'full_exam', la note de l'exercice affichee est la note officielle sur 10, et la note finale du bac blanc est la somme des deux exercices, sur 20.",
    "Si exam_format vaut 'dissertation_only' ou 'document_study_only', tu affiches la note d'entrainement sur 20 ET son equivalent dans une epreuve complete sur 10, dans cette phrase exacte : « Note d'entrainement : X / 20. Equivalent dans une epreuve complete : Y / 10. »",
    "Tu n'additionnes JAMAIS deux notes sur 20. Tu ne recalcules aucune note : elles viennent telles quelles de la correction.",
    '',
    'FOURCHETTE',
    "Tant que la grille n'est pas validee par des professeurs (calibration_metadata.rubric_status different de 'in_use'), la note est presentee EN FOURCHETTE, elargie quand la correction demande une relecture humaine. La valeur exacte reste interne.",
    '',
    'STRUCTURE DU DOSSIER',
    "1. Ce que dit ta copie : une page qui reprend le sujet, ce que l'eleve a reellement fait, sans jargon.",
    '2. Critere par critere : pour chacun, le score, le palier atteint, la CITATION exacte de la copie qui le justifie, et ce qui manquait pour le palier au-dessus.',
    "3. Tes points d'appui : ce qui marche, avec la preuve dans la copie.",
    '4. Tes priorites : trois maximum, chacune reliee a une faiblesse reellement observee.',
    "5. Comment gagner des points la prochaine fois : des gestes concrets, pas des conseils generaux.",
    '',
    'INTERDITS',
    "Tu n'inventes aucune citation, aucun fait, aucune date. Tu ne recorriges pas la copie. Tu ne donnes aucun avis politique. Tu ne mentionnes jamais qu'une intelligence artificielle a corrige la copie.",
    "Si la correction porte human_review_required = true, tu ecris clairement que la note est provisoire et sera verifiee par un professeur.",
  ].join('\n');
}

const gabarits = GRILLES.map((g) => ({
  id: `HGGSP_DOSSIER_${g.exercise_type.replace('hggsp_', '').toUpperCase()}_ELEVE_V2`,
  track: 'generale',
  matiere: 'hggsp',
  exercise_type: g.exercise_type,
  audience: 'eleve',
  system_prompt: promptDossier(g),
  output_format: 'html',
  status: 'active',
  version: 2,
}));

const gabaritsAArchiver = [
  'HGGSP_DOSSIER_DISSERTATION_ELEVE_V1',
  'HGGSP_DOSSIER_ETUDE_CRITIQUE_ELEVE_V1',
];

/* ------------------------------------------------------------------ */
/*  7. Un examen "bac blanc complet"                                  */
/* ------------------------------------------------------------------ */

const EXAM_ID = uuidStable('exam:HGGSP_BAC_BLANC_2026_01');
const exam = {
  id: EXAM_ID,
  code: 'HGGSP_BAC_BLANC_2026_01',
  matiere: 'hggsp',
  track: 'generale',
  titre: 'HGGSP — bac blanc complet (dissertation + étude critique)',
  session: '2026',
  exam_format: 'full_exam',
  statut: 'calibrating',
  commentaire:
    'Epreuve complete : dissertation sur 10 + etude critique sur 10 = 20. Les deux exercices utilisent les grilles v2.',
  cree_par: 'pipeline-hggsp-v2',
};

const examExercices = [
  {
    id: uuidStable('exam_ex:HGGSP_BAC_BLANC_2026_01:dissertation'),
    exam_id: EXAM_ID,
    exercise_type: 'hggsp_dissertation',
    grille_id: GRILLE_DISSERTATION.id,
    subject_id: 'HGGSP2027_DISS_01',
    ordre: 1,
    max_officiel: 10,
  },
  {
    id: uuidStable('exam_ex:HGGSP_BAC_BLANC_2026_01:etude_critique'),
    exam_id: EXAM_ID,
    exercise_type: 'hggsp_etude_critique',
    grille_id: GRILLE_ETUDE_CRITIQUE.id,
    subject_id: 'HGGSP2027_EC_01',
    ordre: 2,
    max_officiel: 10,
  },
];

/* ------------------------------------------------------------------ */
/*  Verifications : exactement ce que le moteur et la base exigent    */
/* ------------------------------------------------------------------ */

function verifier() {
  const erreurs = [];
  const avertissements = [];

  for (const g of GRILLES) {
    const somme = g.criteres.reduce((s, c) => s + c.max_points, 0);
    if (Math.abs(somme - g.max_analytique) > 0.001) {
      erreurs.push(`${g.id} : les criteres totalisent ${somme} au lieu de ${g.max_analytique}.`);
    }
    if (Math.abs(g.max_analytique / 2 - g.max_officiel) > 0.001) {
      erreurs.push(`${g.id} : l'echelle officielle (${g.max_officiel}) n'est pas la moitie de l'echelle analytique (${g.max_analytique}).`);
    }
    for (const c of g.criteres) {
      const points = c.paliers.map((p) => p.points);
      if (!points.length) erreurs.push(`${g.id}/${c.code} : aucun descripteur.`);
      if (Math.max(...points) !== c.max_points) {
        erreurs.push(`${g.id}/${c.code} : le descripteur le plus haut vaut ${Math.max(...points)} au lieu de ${c.max_points}.`);
      }
      if (new Set(points).size !== points.length) erreurs.push(`${g.id}/${c.code} : deux descripteurs au meme score.`);
    }
    const consigne = consigneSysteme(g);
    if (consigne.length < 1500) avertissements.push(`${g.id} : consigne systeme courte (${consigne.length} caracteres).`);
  }

  const codes = new Set();
  for (const e of TAXONOMIE) {
    if (codes.has(e.code)) erreurs.push(`taxonomie : code ${e.code} en double.`);
    codes.add(e.code);
    for (const [exercice, critere] of Object.entries(e.critere_principal)) {
      const g = GRILLES.find((x) => x.exercise_type === exercice);
      if (!g) { erreurs.push(`${e.code} : exercice ${exercice} inconnu.`); continue; }
      if (!g.criteres.some((c) => c.code === critere)) {
        erreurs.push(`${e.code} : vise le critere ${critere}, absent de ${g.id}.`);
      }
    }
    if (e.type_impact === 'criterion_score_cap' && e.plafond_score === null) erreurs.push(`${e.code} : plafond de score manquant.`);
    if (e.type_impact === 'criterion_level_cap' && !e.plafond_niveau) erreurs.push(`${e.code} : plafond de niveau manquant.`);
    if (e.type_impact === 'contextual_range' && e.impact_max === null) erreurs.push(`${e.code} : fourchette manquante.`);
  }

  // Les etalons doivent tomber juste : la somme des criteres EST la note.
  for (const e of etalons) {
    const somme = Object.values(e.card_json.criterion_scores).reduce((s, v) => s + Number(v), 0);
    if (Math.abs(somme - e.score) > 0.001) {
      erreurs.push(`${e.id} : les criteres totalisent ${somme} pour une note annoncee de ${e.score}.`);
    }
    // La note officielle est arrondie au centieme, comme partout ailleurs :
    // 9,75 / 20 donne 4,88 / 10 et non 4,875.
    const officielAttendu = Math.round((e.score / 2) * 100) / 100;
    if (Math.abs(e.card_json.note_officielle - officielAttendu) > 0.001) {
      erreurs.push(`${e.id} : note officielle ${e.card_json.note_officielle} au lieu de ${officielAttendu}.`);
    }
    const grille = GRILLES.find((g) => g.exercise_type === e.exercise_type);
    for (const [code, valeur] of Object.entries(e.card_json.criterion_scores)) {
      const critere = grille.criteres.find((c) => c.code === code);
      if (!critere) { erreurs.push(`${e.id} : critere ${code} inconnu de ${grille.id}.`); continue; }
      if (valeur > critere.max_points + 0.001) erreurs.push(`${e.id} : ${code} = ${valeur} au-dessus du maximum ${critere.max_points}.`);
      if (Math.abs(valeur * 4 - Math.round(valeur * 4)) > 0.001) erreurs.push(`${e.id} : ${code} = ${valeur} hors du pas de 0,25.`);
    }
  }

  const parSujet = new Map();
  for (const e of etalons) parSujet.set(e.subject_id, (parSujet.get(e.subject_id) ?? 0) + 1);
  for (const s of SUJETS) {
    const n = parSujet.get(s.id) ?? 0;
    if (n < 3) erreurs.push(`${s.id} : ${n} etalon(s) v2. Le moteur refuse de corriger sous 3.`);
  }

  // Couverture des niveaux et des frontieres.
  for (const [exercice, profils] of Object.entries(PROFILS)) {
    const niveaux = new Set(profils.map((p) => p.niveau));
    for (const attendu of ['tres_faible', 'fragile', 'moyen', 'assez_bon', 'tres_bon', 'excellent']) {
      if (!niveaux.has(attendu)) avertissements.push(`${exercice} : aucun etalon de niveau ${attendu}.`);
    }
    if (!profils.some((p) => p.frontiere)) avertissements.push(`${exercice} : aucune copie frontiere.`);
  }

  return { erreurs, avertissements };
}

/* ------------------------------------------------------------------ */
/*  Ecriture en base (PostgREST, upsert idempotent)                   */
/* ------------------------------------------------------------------ */

async function poser(env, table, lignes) {
  if (!lignes.length) return 0;
  const r = await fetch(`${env.PIPELINE_SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return lignes.length;
}

async function archiver(env, table, ids) {
  if (!ids.length) return 0;
  const filtre = `id=in.(${ids.join(',')})`;
  const r = await fetch(`${env.PIPELINE_SUPABASE_URL}/rest/v1/${table}?${filtre}`, {
    method: 'PATCH',
    headers: {
      apikey: env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status: 'archived' }),
  });
  if (!r.ok) throw new Error(`${table} (archivage) : ${r.status} ${await r.text()}`);
  return ids.length;
}

/* ------------------------------------------------------------------ */
/*  Trace SQL, 100% ASCII                                             */
/* ------------------------------------------------------------------ */

const hex = (valeur) => Buffer.from(valeur, 'utf8').toString('hex');

function litteral(valeur) {
  if (valeur === null || valeur === undefined) return 'null';
  if (typeof valeur === 'number') return String(valeur);
  if (typeof valeur === 'boolean') return valeur ? 'true' : 'false';
  if (Array.isArray(valeur) && valeur.every((v) => typeof v === 'string')) {
    if (!valeur.length) return "'{}'";
    // Un tableau de chaines peut etre du text[] (error_codes) : on passe par
    // jsonb seulement pour les colonnes jsonb, gerees plus bas.
    return `array[${valeur.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ')}]`;
  }
  if (typeof valeur === 'object') return `convert_from(decode('${hex(JSON.stringify(valeur))}', 'hex'), 'UTF8')::jsonb`;
  if (/[^\x00-\x7F]/.test(valeur)) return `convert_from(decode('${hex(valeur)}', 'hex'), 'UTF8')`;
  return `'${valeur.replace(/'/g, "''")}'`;
}

function blocInsert(table, colonnes, lignes, colonnesJson = []) {
  const majSet = colonnes.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`).join(',\n');
  return lignes
    .map((ligne) => {
      const valeurs = colonnes
        .map((c) =>
          colonnesJson.includes(c)
            ? `convert_from(decode('${hex(JSON.stringify(ligne[c] ?? null))}', 'hex'), 'UTF8')::jsonb`
            : litteral(ligne[c]),
        )
        .join(', ');
      return `insert into public.${table} (${colonnes.join(', ')})\nvalues (${valeurs})\non conflict (id) do update set\n${majSet};`;
    })
    .join('\n\n');
}

function genererSql(chemin) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const blocs = [
    ['A', `LES ${grilles.length} GRILLES REDIGEES`, blocInsert('grilles_redigees',
      ['id', 'matiere', 'exercise_type', 'version', 'libelle', 'principe', 'system_prompt', 'max_analytique', 'max_officiel', 'statut', 'garde_fous', 'commentaire', 'cree_par'],
      grilles, ['garde_fous'])],
    ['B', `LES ${criteres.length} CRITERES`, blocInsert('grille_criteres',
      ['id', 'grille_id', 'code', 'libelle', 'evaluer', 'max_points', 'ordre'], criteres, ['evaluer'])],
    ['C', `LES ${descripteurs.length} DESCRIPTEURS DE NIVEAU`, blocInsert('grille_descripteurs',
      ['id', 'critere_id', 'points', 'niveau', 'description'], descripteurs)],
    ['D', `LA TAXONOMIE : ${taxonomie.length} CODES`, blocInsert('taxonomie_redigee',
      ['id', 'matiere', 'code', 'version', 'libelle', 'portee', 'description', 'critere_principal', 'criteres_secondaires', 'gravite', 'type_impact', 'impact_min', 'impact_max', 'plafond_score', 'plafond_niveau', 'conditions', 'regle_non_double_sanction', 'message_pedagogique', 'relecture_humaine'],
      taxonomie, ['critere_principal', 'criteres_secondaires'])],
    // L'archivage vient AVANT l'insertion des v2 : la base n'accepte qu'une
    // seule grille active par (track, matiere, exercice).
    ['E', 'ARCHIVAGE DES VERSIONS V1 (aucune suppression)',
      `update public.rubrics set status = 'archived' where id in (${rubricsAArchiver.map((i) => `'${i}'`).join(', ')});\n\nupdate public.dossier_templates set status = 'archived' where id in (${gabaritsAArchiver.map((i) => `'${i}'`).join(', ')});`],
    ['F', `LES ${rubrics.length} GRILLES "RUBRICS" V2 (routage du moteur)`, blocInsert('rubrics',
      ['id', 'track', 'matiere', 'exercise_type', 'version', 'status', 'system_prompt', 'rubric_json', 'moteur', 'grille_id', 'role', 'note_officielle'],
      rubrics, ['rubric_json'])],
    ['G', 'LE SUJET A DEUX DOCUMENTS', blocInsert('subject_cards',
      ['id', 'track', 'matiere', 'exercise_type', 'work_id', 'status', 'card_json'], [SUJET_DEUX_DOCS], ['card_json'])],
    ['H', `LES ${etalons.length} ETALONS V2`, blocInsert('benchmark_cards',
      ['id', 'track', 'exercise_type', 'subject_id', 'score', 'error_codes', 'card_json', 'validation_status'], etalons, ['card_json'])],
    ['I', `LES ${etalonCopies.length} COPIES ETALONS (module de calibration)`, blocInsert('etalon_copies',
      ['id', 'libelle', 'niveau_cible', 'frontiere', 'grille_id', 'exercise_type', 'matiere', 'benchmark_card_id', 'statut', 'commentaire'], etalonCopies)],
    ['J', `LES ${gabarits.length} GABARITS DE DOSSIER V2`, blocInsert('dossier_templates',
      ['id', 'track', 'matiere', 'exercise_type', 'audience', 'system_prompt', 'output_format', 'status', 'version'], gabarits)],
    ['K', "L'EXAMEN BAC BLANC COMPLET ET SES DEUX EXERCICES",
      `${blocInsert('exams', ['id', 'code', 'matiere', 'track', 'titre', 'session', 'exam_format', 'statut', 'commentaire', 'cree_par'], [exam])}\n\n${blocInsert('exam_exercices', ['id', 'exam_id', 'exercise_type', 'grille_id', 'subject_id', 'ordre', 'max_officiel'], examExercices)}`],
  ]
    .map(([lettre, titre, corps]) => `\n\n-- =====================================================================\n--  BLOC ${lettre} - ${titre}\n-- =====================================================================\n\nbegin;\n\n${corps}\n\ncommit;\n`)
    .join('');

  const entete = `-- =====================================================================
--  DONNEES HGGSP SESSION 2026 (grilles v2)
--
--  Genere par scripts/apply-hggsp.mjs le ${aujourdhui} a partir de
--  supabase/functions/_shared/hggsp-noyau.ts, et applique en base par API
--  le meme jour : ce fichier est la trace reproductible, pas une action a
--  refaire. La STRUCTURE est dans 40_hggsp_redige_v2.sql.
--
--  Contenu : ${grilles.length} grilles, ${criteres.length} criteres, ${descripteurs.length} descripteurs,
--  ${taxonomie.length} codes d'erreur, ${etalons.length} etalons, ${gabarits.length} gabarits, 1 examen.
--
--  Les v1 sont ARCHIVEES, jamais supprimees (bloc K).
--  Tout le texte accentue passe par convert_from(decode(...,'hex'),'UTF8').
-- =====================================================================
`;

  const verification = `

-- =====================================================================
--  BLOC L - VERIFICATION
-- =====================================================================

select 'grilles' as objet, count(*) as n from public.grilles_redigees where matiere = 'hggsp'
union all select 'criteres', count(*) from public.grille_criteres c join public.grilles_redigees g on g.id = c.grille_id where g.matiere = 'hggsp'
union all select 'descripteurs', count(*) from public.grille_descripteurs d join public.grille_criteres c on c.id = d.critere_id join public.grilles_redigees g on g.id = c.grille_id where g.matiere = 'hggsp'
union all select 'taxonomie', count(*) from public.taxonomie_redigee where matiere = 'hggsp'
union all select 'etalons v2', count(*) from public.benchmark_cards where card_json ->> 'rubric_version' = '2.0'
union all select 'copies etalons', count(*) from public.etalon_copies where matiere = 'hggsp';

select public.grille_verifier('HGGSP_DISSERTATION_V2');
select public.grille_verifier('HGGSP_ETUDE_CRITIQUE_V2');
`;

  const sql = entete + blocs + verification;
  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  return chemin;
}

/* ------------------------------------------------------------------ */
/*  Programme principal                                               */
/* ------------------------------------------------------------------ */

const options = process.argv.slice(2);
const { erreurs, avertissements } = verifier();

console.log('HGGSP - grilles session 2026 (v2)');
console.log(`  ${grilles.length} grille(s), ${criteres.length} critere(s), ${descripteurs.length} descripteur(s)`);
console.log(`  ${taxonomie.length} code(s) d'erreur, ${etalons.length} etalon(s), ${gabarits.length} gabarit(s)`);
for (const a of avertissements) console.log(`  !  ${a}`);
for (const e of erreurs) console.log(`  X  ${e}`);
if (erreurs.length) {
  console.error(`\n${erreurs.length} blocage(s) : rien n'est ecrit.`);
  process.exit(1);
}
console.log('  ok  toutes les regles du moteur et de la base sont respectees.');

const iSql = options.indexOf('--sql');
if (iSql !== -1) {
  console.log(`\nTrace SQL : ${genererSql(resolve(ROOT, options[iSql + 1]))}`);
}

if (options.includes('--apply')) {
  const env = chargerEnv();
  if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
    process.exit(1);
  }
  console.log('\nEcriture en base...');
  console.log(`  grilles_redigees    : ${await poser(env, 'grilles_redigees', grilles)}`);
  console.log(`  grille_criteres     : ${await poser(env, 'grille_criteres', criteres)}`);
  console.log(`  grille_descripteurs : ${await poser(env, 'grille_descripteurs', descripteurs)}`);
  console.log(`  taxonomie_redigee   : ${await poser(env, 'taxonomie_redigee', taxonomie)}`);
  // Une seule grille active par (track, matiere, exercice) : on archive la v1
  // AVANT de poser la v2, sinon la base refuse l'insertion.
  console.log(`  rubrics v1 archivees: ${await archiver(env, 'rubrics', rubricsAArchiver)}`);
  console.log(`  gabarits v1 archives: ${await archiver(env, 'dossier_templates', gabaritsAArchiver)}`);
  console.log(`  rubrics (v2)        : ${await poser(env, 'rubrics', rubrics)}`);
  console.log(`  subject_cards       : ${await poser(env, 'subject_cards', [SUJET_DEUX_DOCS])}`);
  console.log(`  benchmark_cards     : ${await poser(env, 'benchmark_cards', etalons)}`);
  console.log(`  etalon_copies       : ${await poser(env, 'etalon_copies', etalonCopies)}`);
  console.log(`  dossier_templates   : ${await poser(env, 'dossier_templates', gabarits)}`);
  console.log(`  exams               : ${await poser(env, 'exams', [exam])}`);
  console.log(`  exam_exercices      : ${await poser(env, 'exam_exercices', examExercices)}`);
  console.log('Termine.');
}
