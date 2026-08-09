/**
 * INSTALLATION DES SUJETS ZERO OFFICIELS DU DNB 2026 — SÉRIE GÉNÉRALE.
 *
 *   npm run brevet:sujets-zero            # contrôle hors ligne, n'écrit rien
 *   npm run brevet:sujets-zero -- --apply # écrit en base
 *
 * Ce que le script installe : la STRUCTURE officielle des trois sujets zéro
 * (français, mathématiques A, mathématiques B) — numéros, énoncés, points
 * annoncés, textes de la dictée et de la réécriture, consignes de longueur.
 *
 * Ce qu'il n'installe pas : le corrigé. Les sujets zéro sont publiés sans lui.
 * Les barèmes arrivent donc en brouillon, avec des blocages explicites qui
 * disent exactement ce qu'un professeur doit encore saisir. C'est voulu :
 * installer la structure d'un sujet officiel n'est pas inventer son corrigé.
 *
 * Le contrôle hors ligne rejoue les mêmes règles que la base
 * (`brevet_verifier()`), via les noyaux partagés : il prouve que les sujets
 * officiels passent bien les contrôles structurels du moteur.
 */
import {
  verifierBaremeFrancais,
  BAREME_TOTAL_FRANCAIS,
  type PartieFrancais,
} from '../src/lib/brevetFrancaisNoyau';
import {
  verifierBaremeMaths,
  verifierTotauxMaths,
  type QuestionMaths,
} from '../src/lib/brevetMathsNoyau';
import {
  SUJET_ZERO_FRANCAIS,
  SUJET_ZERO_MATHS_A,
  SUJET_ZERO_MATHS_B,
} from './brevet/sujets-zero.mjs';

/* ------------------------------------------------------------------ */
/*  Environnement                                                     */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function chargerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const fichier of ['.env', '.env.local']) {
    let texte: string;
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

/* ------------------------------------------------------------------ */
/*  Contrôle hors ligne                                               */
/* ------------------------------------------------------------------ */

type Rapport = {
  code: string;
  titre: string;
  totaux: { libelle: string; saisi: number; attendu: number; ok: boolean }[];
  blocages: string[];
  aSaisir: string[];
};

function controlerFrancais(): Rapport {
  const s = SUJET_ZERO_FRANCAIS;
  const questions = s.questions.map((q) => ({
    question_key: q.question_key,
    numero: q.numero,
    partie: q.partie as PartieFrancais,
    max_points: q.max_points,
    // Publié sans corrigé : c'est ce vide-là qui bloque, et c'est correct.
    elements_attendus: [] as string[],
    regles_points_partiels: [] as unknown[],
  }));

  const comprehension = questions
    .filter((q) => q.partie === 'comprehension')
    .reduce((t, q) => t + q.max_points, 0);
  const grammaire = questions
    .filter((q) => q.partie === 'grammaire')
    .reduce((t, q) => t + q.max_points, 0);
  const maxRedaction = s.redaction[0].max_points;

  const controle = verifierBaremeFrancais({
    questions,
    maxReecriture: s.reecriture.max_points,
    maxDictee: s.dictee.max_points,
    maxRedaction,
    dicteeReglesDefinies: s.dictee.regles.length > 0,
    grillesRedaction: s.redaction.map((g) => ({ type_sujet: g.type_sujet })),
  });

  return {
    code: s.code,
    titre: s.titre,
    totaux: [
      { libelle: 'Compréhension et interprétation', saisi: comprehension, attendu: 32, ok: comprehension === 32 },
      { libelle: 'Grammaire (réécriture comprise)', saisi: grammaire + s.reecriture.max_points, attendu: 18, ok: grammaire + s.reecriture.max_points === 18 },
      { libelle: 'Bloc « travail sur le texte »', saisi: comprehension + grammaire + s.reecriture.max_points, attendu: 50, ok: comprehension + grammaire + s.reecriture.max_points === 50 },
      { libelle: 'Dictée', saisi: s.dictee.max_points, attendu: 10, ok: s.dictee.max_points === 10 },
      { libelle: 'Rédaction', saisi: maxRedaction, attendu: 40, ok: maxRedaction === 40 },
      {
        libelle: 'TOTAL',
        saisi: comprehension + grammaire + s.reecriture.max_points + s.dictee.max_points + maxRedaction,
        attendu: BAREME_TOTAL_FRANCAIS,
        ok:
          comprehension + grammaire + s.reecriture.max_points + s.dictee.max_points + maxRedaction ===
          BAREME_TOTAL_FRANCAIS,
      },
    ],
    blocages: controle.blocages.map((b) => b.message),
    aSaisir: [
      `Les éléments attendus des ${s.questions.length} questions (aucun corrigé n'est publié avec le sujet zéro).`,
      s.reecriture.a_verifier,
      s.dictee.a_verifier,
      'Les deux grilles de rédaction : le sujet ne les fournit pas, la grille par défaut est posée et marquée comme telle.',
    ],
  };
}

type SujetMaths = typeof SUJET_ZERO_MATHS_A;

function controlerMaths(s: SujetMaths): Rapport {
  const questions: QuestionMaths[] = s.exercices.map((e) => ({
    question_key: e.question_key,
    numero: e.numero,
    exercice: e.question_key,
    partie: 'raisonnement',
    libelle: e.libelle,
    domaines: e.domaines as QuestionMaths['domaines'],
    connaissances: [],
    competences: e.competences as QuestionMaths['competences'],
    max_points: e.max_points,
    // Publié sans corrigé : ni résultat attendu, ni étapes valorisables.
    resultat_attendu: '',
    methode_principale: '',
    methodes_alternatives: [],
    etapes_valorisables: [],
    unites_attendues: null,
    precision_attendue: null,
    justification_attendue: 'demonstration_complete',
    regle_arrondi: null,
    depend_de: [],
    regle_cascade: null,
    regles_points_partiels: null,
    etapes_geometrie: (('etapes_geometrie' in e ? e.etapes_geometrie : []) ??
      []) as QuestionMaths['etapes_geometrie'],
    codes_erreurs: [],
    calculatrice: 'autorisee',
  }));

  const maxAuto = s.automatismes.reduce((t, a) => t + a.points, 0);
  const maxQuestions = questions.reduce((t, q) => t + q.max_points, 0);
  const maxQualite = s.qualiteRedaction.reduce((t, c) => t + c.max_points, 0);

  const totaux = verifierTotauxMaths({
    maxAutomatismes: Math.round(maxAuto * 100) / 100,
    maxRaisonnementQuestions: maxQuestions,
    maxQualiteRedaction: maxQualite,
  });
  const controle = verifierBaremeMaths({
    automatismes: s.automatismes.map((a) => ({
      item_key: a.item_key,
      numero: a.numero,
      reponse_attendue: a.reponse_attendue,
      points: a.points,
    })),
    questions,
    maxQualiteRedaction: maxQualite,
  });

  const sansReponse = s.automatismes.filter((a) => !a.reponse_attendue.trim()).length;

  return {
    code: s.code,
    titre: s.titre,
    totaux: [
      { libelle: 'Partie 1 — Automatismes', saisi: Math.round(maxAuto * 100) / 100, attendu: 6, ok: totaux.ok || Math.abs(maxAuto - 6) < 0.001 },
      { libelle: 'Partie 2 — questions', saisi: maxQuestions, attendu: 12, ok: maxQuestions === 12 },
      { libelle: 'Qualité de la rédaction (comprise)', saisi: maxQualite, attendu: 2, ok: maxQualite === 2 },
      { libelle: 'Partie 2 — total', saisi: maxQuestions + maxQualite, attendu: 14, ok: maxQuestions + maxQualite === 14 },
      { libelle: 'TOTAL', saisi: Math.round((maxAuto + maxQuestions + maxQualite) * 100) / 100, attendu: 20, ok: Math.abs(maxAuto + maxQuestions + maxQualite - 20) < 0.001 },
    ],
    blocages: controle.blocages.map((b) => b.message),
    aSaisir: [
      `Les étapes valorisables des ${s.exercices.length} exercices — sans elles, les démarches non abouties ne peuvent pas être prises en compte.`,
      `Le résultat attendu de chaque exercice (aucun corrigé n'est publié avec le sujet zéro).`,
      sansReponse > 0
        ? `${sansReponse} réponse(s) d'automatisme dépendent d'une figure non transmise : à saisir à la main.`
        : 'Toutes les réponses d’automatismes sont renseignées.',
      s.a_verifier,
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Écriture en base                                                  */
/* ------------------------------------------------------------------ */

async function rest(
  env: Record<string, string>,
  chemin: string,
  methode: string,
  corps?: unknown,
  entetes: Record<string, string> = {},
): Promise<unknown> {
  const r = await fetch(`${env.PIPELINE_SUPABASE_URL}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...entetes,
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}

async function installer(env: Record<string, string>): Promise<void> {
  for (const s of [SUJET_ZERO_FRANCAIS, SUJET_ZERO_MATHS_A, SUJET_ZERO_MATHS_B]) {
    console.log(`\n  ${s.titre}`);

    const maxScore = s.matiere === 'brevet_francais' ? 100 : 20;
    const [examen] = (await rest(env, 'exams', 'POST', {
      code: s.code,
      matiere: s.matiere,
      examen: 'DNB',
      serie: 'generale',
      niveau: 'troisieme',
      track: 'generale',
      titre: s.titre,
      session: s.session,
      statut: 'draft',
      consignes_correcteur: s.consignes_correcteur,
      cree_par: 'installer-sujets-zero',
    })) as { id: string }[];

    const [version] = (await rest(env, 'bareme_versions', 'POST', {
      exam_id: examen.id,
      version: '1.0',
      matiere: s.matiere,
      statut: 'draft',
      max_score: maxScore,
      commentaire: 'Structure du sujet zéro officiel. Corrigé à saisir.',
      cree_par: 'installer-sujets-zero',
    })) as { id: string }[];
    const v = version.id;

    if (s.matiere === 'brevet_francais') {
      const f = SUJET_ZERO_FRANCAIS;
      await rest(env, 'brevet_parties', 'POST', [
        { bareme_version_id: v, code: 'comprehension', libelle: 'Compréhension et interprétation', max_points: 32, ordre: 0 },
        { bareme_version_id: v, code: 'grammaire', libelle: 'Grammaire (réécriture comprise)', max_points: 18, ordre: 1 },
        { bareme_version_id: v, code: 'dictee', libelle: 'Dictée', max_points: 10, ordre: 2 },
        { bareme_version_id: v, code: 'redaction', libelle: 'Rédaction', max_points: 40, ordre: 3 },
      ]);
      await rest(
        env,
        'bareme_questions',
        'POST',
        f.questions.map((q, i) => ({
          bareme_version_id: v,
          question_key: q.question_key,
          numero: q.numero,
          sous_numero: 'sous_numero' in q ? q.sous_numero : null,
          partie: q.partie,
          libelle: q.libelle,
          ordre: i,
          max_points: q.max_points,
          type_reponse: q.type_reponse,
          degre_justification: q.degre_justification,
          competences: q.competences,
          elements_attendus: [],
        })),
      );
      await rest(env, 'brevet_reecriture_config', 'POST', {
        bareme_version_id: v,
        max_points: f.reecriture.max_points,
        penalite_erreur_copie: f.reecriture.penalite_erreur_copie,
        plafond_erreurs_copie: f.reecriture.plafond_erreurs_copie,
        bareme_du_sujet_fourni: false,
        consigne: `${f.reecriture.consigne}\n\nPassage :\n${f.reecriture.passage}\n\n⚠ ${f.reecriture.a_verifier}`,
      });
      await rest(env, 'brevet_dictee_config', 'POST', {
        bareme_version_id: v,
        max_points: f.dictee.max_points,
        texte_attendu: f.dictee.texte_attendu,
        longueur_signes: f.dictee.texte_attendu.length,
        source_bareme: null,
        consigne: `${f.dictee.consigne}\n\n⚠ ${f.dictee.a_verifier}`,
      });
      for (const g of f.redaction) {
        const [grille] = (await rest(env, 'brevet_redaction_grilles', 'POST', {
          bareme_version_id: v,
          type_sujet: g.type_sujet,
          intitule: g.intitule,
          max_points: g.max_points,
          longueur_minimale: g.longueur_minimale,
          issue_du_sujet: false,
        })) as { id: string }[];
        void grille;
      }
    } else {
      const m = s as SujetMaths;
      await rest(env, 'brevet_parties', 'POST', [
        { bareme_version_id: v, code: 'automatismes', libelle: 'Partie 1 — Automatismes', max_points: 6, ordre: 0 },
        { bareme_version_id: v, code: 'raisonnement', libelle: 'Partie 2 — Raisonnement (rédaction comprise)', max_points: 14, ordre: 1 },
      ]);
      await rest(
        env,
        'brevet_automatismes',
        'POST',
        m.automatismes.map((a, i) => ({
          bareme_version_id: v,
          item_key: a.item_key,
          numero: a.numero,
          ordre: i,
          notion: a.notion,
          theme: a.theme,
          competence: a.competence,
          reponse_attendue: a.reponse_attendue,
          variantes_acceptees: a.variantes_acceptees,
          unite_attendue: 'unite_attendue' in a ? a.unite_attendue : null,
          points: a.points,
          commentaire: 'a_verifier' in a ? a.a_verifier : null,
        })),
      );
      await rest(
        env,
        'bareme_questions',
        'POST',
        m.exercices.map((e, i) => ({
          bareme_version_id: v,
          question_key: e.question_key,
          numero: e.numero,
          partie: 'raisonnement',
          libelle: e.libelle,
          ordre: i,
          max_points: e.max_points,
          domaines: e.domaines,
          competences: e.competences,
          etapes_geometrie: 'etapes_geometrie' in e ? e.etapes_geometrie : [],
          etapes: [],
          calculatrice: 'autorisee',
        })),
      );
      await rest(
        env,
        'brevet_qualite_redaction_criteres',
        'POST',
        m.qualiteRedaction.map((c) => ({ bareme_version_id: v, ...c })),
      );
    }

    const controles = await rest(env, 'rpc/brevet_verifier', 'POST', { p_version: v });
    const c = controles as { ok: boolean; blocages: { message: string }[] };
    console.log(`    installé — contrôles : ${c.ok ? 'aucun blocage' : `${c.blocages.length} blocage(s), à compléter`}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Programme principal                                               */
/* ------------------------------------------------------------------ */

const options = process.argv.slice(2);

console.log('\nSujets zéro officiels du DNB 2026 — série générale');
console.log('Source : ministère de l’Éducation nationale, publiés le 5 décembre 2025.\n');

const rapports = [controlerFrancais(), controlerMaths(SUJET_ZERO_MATHS_A), controlerMaths(SUJET_ZERO_MATHS_B)];

let totauxJustes = true;
for (const r of rapports) {
  console.log(`── ${r.titre}`);
  for (const t of r.totaux) {
    const marque = t.ok ? '✓' : '✗';
    if (!t.ok) totauxJustes = false;
    console.log(`   ${marque} ${t.libelle.padEnd(36)} ${String(t.saisi).padStart(6)} / ${t.attendu}`);
  }
  if (r.blocages.length) {
    console.log(`   ${r.blocages.length} blocage(s) — le barème ne pourra pas être verrouillé tant qu’ils restent :`);
    for (const b of r.blocages.slice(0, 4)) console.log(`     · ${b}`);
    if (r.blocages.length > 4) console.log(`     · … et ${r.blocages.length - 4} autre(s), du même ordre.`);
  }
  console.log('   À saisir par un professeur :');
  for (const a of r.aSaisir) console.log(`     → ${a}`);
  console.log('');
}

if (!totauxJustes) {
  console.error('Au moins un total ne tombe pas juste : installation refusée.');
  process.exit(1);
}
console.log('Tous les totaux officiels tombent juste : 100 en français, 20 en mathématiques.');

// Pas de `await` au premier niveau : tsx compile ce fichier en CommonJS.
async function principal(): Promise<void> {
  if (!options.includes('--apply')) {
    console.log('Contrôle hors ligne uniquement. Ajoute --apply pour écrire en base');
    console.log('(après avoir joué 42_brevet_socle.sql et 43_brevet_referentiels.sql).');
    return;
  }
  const env = chargerEnv();
  if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\nPIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
    process.exit(1);
  }
  console.log('\nÉcriture en base…');
  await installer(env);
  console.log('\nTerminé. Les trois barèmes sont en brouillon : ouvre /admin/brevet pour les compléter.');
}

principal().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
