#!/usr/bin/env node
// =====================================================================
//  UNE GUIDELINE DE PROF -> UNE GRILLE DU PIPELINE
//
//  Le classeur qu'un professeur utilise pour corriger devient la grille que
//  l'IA applique quand elle rédige le dossier. Une seule source, donc aucun
//  écart possible entre ce que le prof coche et ce que la machine explique.
//
//  Deux destinations, choisies par la matière et non par la main qui tape la
//  commande (`moteurAttendu` dans src/lib/moteurs.ts) :
//
//    • matière en `criteres_rediges` (HGGSP) -> grilles_redigees /
//      grille_criteres / grille_descripteurs, lues par correct-copy-redigee ;
//    • matière en `grille_generique` (français, philo, SES...) -> public.rubrics,
//      lue par correct-french-copy. Seul le BARÈME y est réécrit : le
//      system_prompt, les garde-fous rédigés et le cadrage de la version
//      précédente sont hérités tels quels. Une guideline dit combien vaut un
//      critère, pas comment parler à l'élève.
//    • matière en `bareme_sujet` (maths, physique-chimie, SVT) -> refus : le
//      barème de ces épreuves n'existe que dans le sujet du jour (/direction/bareme).
//
//  Usage :
//    node scripts/importer-guideline.mjs --csv <fichier.csv> [--partie 1] [--bloc C]
//    node scripts/importer-guideline.mjs --url <lien du Google Sheet> [--gid 0]
//        --matiere hggsp --exercice hggsp_dissertation --version v3
//        [--libelle "..."] [--max-officiel 10] [--apply]
//
//  `--partie` garde une partie de l'épreuve (philo : dissertation OU
//  explication) ; `--bloc` descend d'un cran, jusqu'à un bloc de cette partie
//  (SES : les trois parties de l'épreuve composée vivent dans les blocs A, B
//  et C de la partie II).
//
//  Sans --apply : rien n'est écrit. Le script affiche ce qu'il a compris du
//  classeur (critères, points, paliers, total) et ce qu'il ne sait pas ranger.
//  C'est l'étape de relecture : une grille se lit avant de servir à noter.
//
//  Avec --apply : écrit la grille en statut 'draft' dans grilles_redigees /
//  grille_criteres / grille_descripteurs. Une version VERROUILLÉE n'est jamais
//  touchée (le script s'arrête) : on crée alors une nouvelle version.
//
//  Identifiants lus dans .env / .env.local
//  (PIPELINE_SUPABASE_URL + PIPELINE_SUPABASE_SERVICE_ROLE_KEY), jamais affichés.
// =====================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { lireCsv } from '../src/lib/importGrille.ts';
import { lireGuideline } from '../src/lib/guidelineSheet.ts';
import { moteurAttendu } from '../src/lib/moteurs.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

/* ------------------------------------------------------------------ */
/*  Arguments et environnement                                        */
/* ------------------------------------------------------------------ */

function args() {
  const a = process.argv.slice(2);
  const o = { apply: a.includes('--apply') };
  for (let i = 0; i < a.length; i++) {
    const m = a[i].match(/^--([a-z-]+)$/);
    if (m && m[1] !== 'apply' && a[i + 1] && !a[i + 1].startsWith('--')) {
      o[m[1]] = a[++i];
    }
  }
  return o;
}

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

/** Le lien d'un Sheet devient son export CSV : on ne demande rien au prof. */
function urlExportCsv(url, gid) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('Lien Google Sheets non reconnu.');
  const g = gid ?? (url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${g}`;
}

/* ------------------------------------------------------------------ */
/*  Traduction guideline -> grille du pipeline                        */
/* ------------------------------------------------------------------ */

/**
 * Les descripteurs de la base portent un niveau nommé, pas un nombre de
 * points : on le déduit de la part du maximum que vaut le palier. C'est la
 * seule interprétation que fait ce script, et elle ne change aucune note.
 */
/**
 * Le numéro de version, quel que soit ce qui a été tapé : « v3 », « V3 » ou
 * « 3 » désignent la même chose.
 */
function numeroVersion(version) {
  const n = Number(String(version).replace(/^v/i, ''));
  if (!Number.isFinite(n)) throw new Error(`--version « ${version} » : attendu un numéro, par exemple v3.`);
  return n;
}

/**
 * L'identifiant d'une grille. `hggsp` + `hggsp_dissertation` ne donne pas
 * HGGSP_HGGSP_DISSERTATION : quand le nom de l'exercice porte déjà la matière,
 * on ne la répète pas.
 */
function identifiantGrille(matiere, exercice, version) {
  const m = matiere.toUpperCase().replace(/-/g, '_');
  const e = exercice.toUpperCase().replace(/-/g, '_');
  // `philosophie` + `philo_dissertation` donne PHILO_DISSERTATION, pas
  // PHILOSOPHIE_PHILO_DISSERTATION : le nom de l'exercice porte déjà la
  // matière, en abrégé. On reconnaît l'abrégé comme un début du nom complet.
  const debut = e.split('_')[0];
  const porteDejaLaMatiere = e.startsWith(`${m}_`) || (debut.length >= 4 && m.startsWith(debut));
  const corps = porteDejaLaMatiere ? e : `${m}_${e}`;
  return `${corps}_V${numeroVersion(version)}`;
}

function niveauPour(points, max) {
  if (max <= 0) return 'nul';
  const part = points / max;
  if (part <= 0) return 'nul';
  if (part <= 0.25) return 'insuffisant';
  if (part <= 0.5) return 'fragile';
  if (part <= 0.7) return 'moyen';
  if (part < 1) return 'satisfaisant';
  return 'tres_satisfaisant';
}

/**
 * Les critères retenus par --partie et --bloc.
 *
 * Le code d'un critère porte sa place : `P2.C.4` = partie II, bloc C,
 * quatrième. On filtre donc sur le code, jamais sur l'intitulé, qui se
 * retouche d'un classeur à l'autre.
 */
function criteresRetenus(guideline, o) {
  const partie = o.partie ? Number(o.partie) : null;
  const bloc = o.bloc ? String(o.bloc).toUpperCase() : null;

  let criteres = guideline.criteres;
  if (partie) criteres = criteres.filter((c) => c.code.startsWith(`P${partie}.`));
  if (bloc) {
    if (!partie) throw new Error('--bloc demande --partie : un bloc appartient à une partie.');
    criteres = criteres.filter((c) => c.code.startsWith(`P${partie}.${bloc}.`));
  }

  if (!criteres.length) {
    const ou = bloc ? `le bloc ${bloc} de la partie ${partie}` : partie ? `la partie ${partie}` : 'ce fichier';
    throw new Error(
      `Aucun critère dans ${ou}. Codes lus : ${
        [...new Set(guideline.criteres.map((c) => c.code.split('.').slice(0, 2).join('.')))].join(', ') || '—'
      }.`,
    );
  }
  return criteres;
}

function grilleDepuisGuideline(guideline, o) {
  const criteres = criteresRetenus(guideline, o);

  const total = Math.round(criteres.reduce((s, c) => s + c.max, 0) * 100) / 100;
  const grilleId = identifiantGrille(o.matiere, o.exercice, o.version);

  const lignesCriteres = criteres.map((c, i) => ({
    id: `${grilleId}::${c.code}`,
    grille_id: grilleId,
    code: c.code,
    libelle: c.bloc ? `${c.bloc} — ${c.libelle}` : c.libelle,
    evaluer: c.evaluer,
    max_points: c.max,
    ordre: i + 1,
  }));

  const descripteurs = [];
  for (const c of criteres) {
    const vus = new Set();
    for (const n of c.niveaux) {
      const points = Math.min(n.points, c.max);
      if (vus.has(points)) continue;
      vus.add(points);
      descripteurs.push({
        id: `${grilleId}::${c.code}::${points}`,
        critere_id: `${grilleId}::${c.code}`,
        points,
        niveau: niveauPour(points, c.max),
        description: n.libelle,
      });
    }
  }

  const grille = {
    id: grilleId,
    matiere: o.matiere,
    exercise_type: o.exercice,
    version: numeroVersion(o.version),
    libelle: o.libelle ?? `${o.matiere} — ${o.exercice} (${o.version})`,
    principe:
      'Grille reprise telle quelle du classeur de correction utilisé par les professeurs : ils cochent les mêmes paliers que ceux appliqués ici.',
    max_analytique: total,
    max_officiel: o['max-officiel'] ? Number(o['max-officiel']) : total,
    // Une grille arrive toujours en brouillon : elle ne note pour de vrai
    // qu'après relecture par un professeur, puis verrouillage.
    statut: 'draft',
    garde_fous: guideline.regles.map((r) => `Ne pas faire : ${r.neFaitPas} — Faire : ${r.fait}`),
    commentaire: `Importée depuis la guideline ${o.source}. ${
      guideline.echelle.length ? `Échelle globale du classeur reprise en commentaire de grille.` : ''
    }`.trim(),
    cree_par: 'importer-guideline',
  };

  return { grille, criteres: lignesCriteres, descripteurs, total };
}

/**
 * Le même barème, mais pour une matière à grille commune : `public.rubrics`.
 *
 * On ne fabrique que `rubric_json.criteria` et le maximum. Tout le reste
 * — le system_prompt, le principe, les garde-fous rédigés, le cadrage de
 * l'épreuve, la taxonomie d'erreurs — est repris de la version précédente de
 * la même épreuve : ces textes ont été écrits à la main, une guideline ne les
 * remplace pas. Les règles « ne pas faire / faire » du classeur viennent en
 * plus des garde-fous existants, sans jamais les effacer.
 */
function rubriqueDepuisGuideline(guideline, o, precedente) {
  const criteres = criteresRetenus(guideline, o);
  const total = Math.round(criteres.reduce((s, c) => s + c.max, 0) * 100) / 100;
  const id = identifiantGrille(o.matiere, o.exercice, o.version);

  const criteria = criteres.map((c) => {
    const levels = {};
    for (const n of c.niveaux) {
      const points = Math.min(n.points, c.max);
      // Un palier déjà décrit ne se réécrit pas : le premier libellé gagne,
      // comme à la lecture de la page du prof.
      if (levels[String(points)] === undefined) levels[String(points)] = n.libelle;
    }
    return {
      code: c.code,
      name: c.libelle,
      description: c.evaluer.length ? c.evaluer.join(' ') : c.bloc || c.libelle,
      maximum_score: c.max,
      levels,
    };
  });

  const ancien = precedente?.rubric_json ?? {};
  const gardeFous = [
    ...(Array.isArray(ancien.guardrails) ? ancien.guardrails : []),
    ...guideline.regles.map((r) => `Ne pas faire : ${r.neFaitPas} — Faire : ${r.fait}`),
  ];

  const rubric_json = {
    ...ancien,
    criteria,
    maximum_score: total,
    guardrails: [...new Set(gardeFous)],
    source_status: 'guideline_professeur',
    official_basis: `Barème repris du classeur de correction utilisé par les professeurs (${o.source}).`,
  };

  const rubrique = {
    id,
    matiere: o.matiere,
    exercise_type: o.exercice,
    version: String(numeroVersion(o.version)),
    // Une grille arrive toujours en brouillon : elle ne note pour de vrai
    // qu'après relecture par un professeur.
    status: 'draft',
    moteur: 'grille_generique',
    rubric_json,
    // Hérité de la version précédente, jamais réinventé ici.
    track: precedente?.track ?? 'generale',
    role: precedente?.role ?? null,
    note_officielle: precedente?.note_officielle ?? true,
    remplacee_par_bareme: precedente?.remplacee_par_bareme ?? false,
    system_prompt: precedente?.system_prompt ?? null,
  };

  return { rubrique, criteria, total, heritee: Boolean(precedente) };
}

/* ------------------------------------------------------------------ */
/*  Écriture                                                          */
/* ------------------------------------------------------------------ */

const STATUTS_VERROUILLES = ['locked', 'in_use', 'archived'];

async function api(env, chemin, init = {}) {
  const r = await fetch(`${env.PIPELINE_SUPABASE_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const corps = await r.text();
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${corps}`);
  // Une écriture en `return=minimal` répond 201 avec un corps VIDE : le parser
  // JSON s'y casse et fait croire à un échec alors que la ligne est posée.
  // On ne lit donc jamais un corps vide comme du JSON.
  return corps.trim() === '' ? null : JSON.parse(corps);
}

async function poser(env, table, lignes) {
  if (!lignes.length) return 0;
  await api(env, `${table}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lignes),
  });
  return lignes.length;
}

/* ------------------------------------------------------------------ */
/*  Programme                                                          */
/* ------------------------------------------------------------------ */

async function main() {
  const o = args();

  if (!o.csv && !o.url) {
    console.error('Il faut --csv <fichier> ou --url <lien du Sheet>. Voir l’en-tête du script.');
    process.exit(1);
  }

  let csv;
  if (o.csv) {
    csv = readFileSync(resolve(process.cwd(), o.csv), 'utf8');
    o.source = o.csv;
  } else {
    const lien = urlExportCsv(o.url, o.gid);
    const r = await fetch(lien);
    if (!r.ok) {
      throw new Error(
        `Le classeur n’est pas lisible (${r.status}). Vérifie qu’il est partagé, au moins en lecture.`,
      );
    }
    csv = await r.text();
    o.source = o.url;
  }

  const guideline = lireGuideline(lireCsv(csv));

  console.log(`\n📘 ${o.source}`);
  console.log(`   Parties : ${guideline.parties.length || '—'}`);
  for (const p of guideline.parties) console.log(`     • ${p.libelle} (${p.points ?? '?'} points)`);
  console.log(`   Critères : ${guideline.criteres.length} · total ${guideline.total} points`);

  let bloc = '';
  for (const c of guideline.criteres) {
    if (c.bloc !== bloc) {
      bloc = c.bloc;
      console.log(`\n   ${bloc || '(sans bloc)'}`);
    }
    const paliers = c.niveaux.length
      ? c.niveaux.map((n) => n.points).join(' / ')
      : 'aucun palier — critère jugé à l’appréciation';
    console.log(`     ${c.code}  ${c.libelle} — /${c.max}`);
    console.log(`        paliers : ${paliers}`);
    if (c.evaluer.length) console.log(`        évaluer : ${c.evaluer.length} point(s) de vigilance`);
  }

  if (guideline.remarques.length) {
    console.log('\n⚠️  À relire dans le classeur :');
    for (const r of guideline.remarques.slice(0, 20)) console.log(`     • ${r}`);
    if (guideline.remarques.length > 20) {
      console.log(`     … et ${guideline.remarques.length - 20} autre(s).`);
    }
  }

  if (!o.matiere || !o.exercice || !o.version) {
    console.log(
      '\nℹ️  Lecture seule : ajoute --matiere, --exercice et --version pour préparer une grille.\n',
    );
    return;
  }

  const moteur = moteurAttendu(o.matiere);

  if (moteur === 'bareme_sujet') {
    throw new Error(
      `${o.matiere} se note au barème du sujet : ce que vaut une question n'existe que dans le sujet du jour, ` +
        `et s'écrit dans /direction/bareme. La guideline de cette matière dit COMMENT compter, pas COMBIEN — ` +
        `elle ne s'installe pas en grille du pipeline.`,
    );
  }

  const env = chargerEnv();
  const identifie = Boolean(env.PIPELINE_SUPABASE_URL && env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY);
  if (o.apply && !identifie) {
    throw new Error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY manquants.');
  }

  /* --- Matière à grille commune : public.rubrics -------------------- */
  if (moteur === 'grille_generique') {
    // La version précédente porte le system_prompt et les garde-fous rédigés :
    // on la lit avant de construire, même en aperçu, pour dire franchement ce
    // qui sera hérité et ce qui ne le sera pas.
    let precedente = null;
    if (identifie) {
      const anciennes = await api(
        env,
        `rubrics?matiere=eq.${o.matiere}&exercise_type=eq.${o.exercice}` +
          `&select=id,version,status,track,role,note_officielle,remplacee_par_bareme,system_prompt,rubric_json` +
          `&order=version.desc`,
      );
      precedente = anciennes[0] ?? null;
    }

    const { rubrique, criteria, total, heritee } = rubriqueDepuisGuideline(guideline, o, precedente);

    console.log(`\n🎯 Grille commune préparée : ${rubrique.id}`);
    console.log(`   ${criteria.length} critères · /${total} · statut ${rubrique.status}`);
    if (heritee) {
      console.log(
        `   hérité de ${precedente.id} (v${precedente.version}, ${precedente.status}) : ` +
          `system_prompt, principe, cadrage, taxonomie d'erreurs`,
      );
    } else if (identifie) {
      console.log(
        `   ⚠️  aucune version précédente pour ${o.matiere}/${o.exercice} : ` +
          `la grille partira SANS system_prompt. À écrire avant de l'activer.`,
      );
    } else {
      console.log("   ⚠️  identifiants absents : impossible de dire ce qui serait hérité.");
    }
    for (const c of criteria) {
      console.log(`     ${c.code}  ${c.name} — /${c.maximum_score} · ${Object.keys(c.levels).length} paliers`);
    }

    if (!o.apply) {
      console.log('\n🔍 Aperçu seulement — rien n’a été écrit. Relance avec --apply pour installer.\n');
      return;
    }

    const memeId = await api(env, `rubrics?id=eq.${rubrique.id}&select=id,status`);
    if (memeId.length && memeId[0].status !== 'draft') {
      throw new Error(
        `${rubrique.id} existe déjà en statut « ${memeId[0].status} » : une grille qui sert à noter ne se réécrit pas. Passe une nouvelle --version.`,
      );
    }

    console.log(`\n   rubrics : ${await poser(env, 'rubrics', [rubrique])}`);
    console.log(
      `\n✅ ${rubrique.id} installée en brouillon, à côté de la version qui note aujourd'hui — ` +
        `rien n'a changé pour les copies en cours.\n` +
        `   Prochaine étape : relecture par un prof, puis passage en « active ».\n`,
    );
    return;
  }

  /* --- Matière à critères rédigés : grilles_redigees ---------------- */
  const { grille, criteres, descripteurs, total } = grilleDepuisGuideline(guideline, o);

  console.log(`\n🎯 Grille rédigée préparée : ${grille.id}`);
  console.log(`   ${criteres.length} critères · ${descripteurs.length} descripteurs · /${total}`);
  console.log(`   note officielle sur ${grille.max_officiel}`);

  if (!o.apply) {
    console.log('\n🔍 Aperçu seulement — rien n’a été écrit. Relance avec --apply pour installer.\n');
    return;
  }

  const existantes = await api(env, `grilles_redigees?id=eq.${grille.id}&select=id,statut`);
  if (existantes.length && STATUTS_VERROUILLES.includes(existantes[0].statut)) {
    throw new Error(
      `${grille.id} est en statut « ${existantes[0].statut} » : une grille verrouillée ne se réécrit pas. Passe une nouvelle --version.`,
    );
  }

  console.log(`\n   grilles_redigees    : ${await poser(env, 'grilles_redigees', [grille])}`);
  console.log(`   grille_criteres     : ${await poser(env, 'grille_criteres', criteres)}`);
  console.log(`   grille_descripteurs : ${await poser(env, 'grille_descripteurs', descripteurs)}`);
  console.log(
    `\n✅ ${grille.id} installée en brouillon. Prochaine étape : relecture par un prof, puis verrouillage (grille_verrouiller).\n`,
  );
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
});
