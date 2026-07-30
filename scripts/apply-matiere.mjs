#!/usr/bin/env node
// =====================================================================
//  INSTALLER UNE MATIERE DANS LE PIPELINE DE CORRECTION
//
//  Usage :
//    node scripts/apply-matiere.mjs scripts/matieres/histoire-geo.mjs --check
//    node scripts/apply-matiere.mjs scripts/matieres/histoire-geo.mjs --apply
//    node scripts/apply-matiere.mjs scripts/matieres/histoire-geo.mjs --sql supabase/sql/16_installer_histoire_geo.sql
//
//  Ajouter une matiere = ecrire des LIGNES dans 4 tables (rubrics,
//  subject_cards, benchmark_cards, dossier_templates). Aucune ligne de code
//  du moteur n'est touchee. Ce script ne fait que trois choses :
//    1. VERIFIER les regles que le moteur applique silencieusement
//       (somme des criteres = bareme, 3 etalons minimum par sujet,
//        system_prompt non vide, grille existante pour chaque sujet) ;
//    2. POSER les lignes en base par l'API PostgREST (upsert idempotent) ;
//    3. ECRIRE la trace SQL reproductible, 100% ASCII, avec les textes
//       accentues encodes en hexadecimal — l'editeur SQL de Supabase abime
//       l'UTF-8 colle depuis un Mac.
//
//  Les identifiants viennent de .env / .env.local du CRM
//  (PIPELINE_SUPABASE_URL + PIPELINE_SUPABASE_SERVICE_ROLE_KEY) et ne sont
//  jamais affiches.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------------
//  Environnement
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
//  Verifications : exactement ce que le moteur exige
// ---------------------------------------------------------------------
function verifier(data) {
  const erreurs = [];
  const avertissements = [];
  const { matiere, rubrics, subject_cards, benchmark_cards, dossier_templates } = data;

  if (!matiere) erreurs.push('matiere manquante dans le module de donnees.');

  for (const r of rubrics) {
    if (r.matiere && r.matiere !== matiere) erreurs.push(`${r.id} : matiere incoherente.`);
    const j = r.rubric_json ?? {};
    const somme = (j.criteria ?? []).reduce((s, c) => s + Number(c.maximum_score ?? 0), 0);
    if (Math.abs(somme - Number(j.maximum_score ?? 0)) > 0.001) {
      erreurs.push(`${r.id} : somme des criteres ${somme} != maximum_score ${j.maximum_score}. Le moteur recalcule la note comme la somme des criteres, l'ecart fausserait toutes les notes.`);
    }
    if (!r.system_prompt || r.system_prompt.trim().length < 20) {
      erreurs.push(`${r.id} : system_prompt vide ou trop court, correct-copy refuse de corriger.`);
    }
    for (const c of j.criteria ?? []) {
      const niveaux = Object.keys(c.levels ?? {}).map(Number);
      if (!niveaux.length) erreurs.push(`${r.id}/${c.code} : aucun descripteur de niveau.`);
      const maxNiveau = Math.max(...niveaux);
      if (maxNiveau !== Number(c.maximum_score)) {
        avertissements.push(`${r.id}/${c.code} : le niveau le plus haut (${maxNiveau}) ne vaut pas le maximum du critere (${c.maximum_score}).`);
      }
    }
    if (/[^\x00-\x7F]/.test(r.system_prompt)) {
      avertissements.push(`${r.id} : system_prompt contient des accents (les autres matieres sont en ASCII pur).`);
    }
    // Un code d'erreur qui designe un critere absent de SA grille enverrait le
    // correcteur sur un critere qui n'existe pas dans le bareme qu'il applique.
    const codesCriteres = new Set((j.criteria ?? []).map((c) => c.code));
    for (const e of j.common_error_taxonomy ?? []) {
      if (e.criterion && e.criterion !== 'TRANSCRIPTION' && !codesCriteres.has(e.criterion)) {
        erreurs.push(`${r.id} : le code ${e.code} vise le critere ${e.criterion}, absent de cette grille.`);
      }
    }
  }

  const parExercice = new Map(rubrics.map((r) => [`${r.track}|${r.exercise_type}`, r]));
  for (const s of subject_cards) {
    const grille = parExercice.get(`${s.track}|${s.exercise_type}`);
    if (!grille) erreurs.push(`${s.id} : aucune grille ${s.track}/${s.exercise_type}. Le sujet serait deposable sans bareme.`);
    if (!s.card_json?.exercise || !s.card_json?.work) {
      avertissements.push(`${s.id} : card_json.exercise ou card_json.work manquant, le menu de depot affichera l'identifiant brut.`);
    }
  }

  const parSujet = new Map();
  for (const b of benchmark_cards) {
    if (!['validated', 'candidate'].includes(b.validation_status)) {
      erreurs.push(`${b.id} : validation_status "${b.validation_status}" est invisible pour le moteur.`);
    }
    if (b.score === null || b.score === undefined) erreurs.push(`${b.id} : score manquant.`);
    parSujet.set(b.subject_id, (parSujet.get(b.subject_id) ?? 0) + 1);

    const sujet = subject_cards.find((s) => s.id === b.subject_id);
    if (!sujet) {
      erreurs.push(`${b.id} : subject_id inconnu (${b.subject_id}).`);
      continue;
    }
    if (b.track !== sujet.track || b.exercise_type !== sujet.exercise_type) {
      erreurs.push(`${b.id} : track/exercise_type different du sujet, le moteur ne le trouvera pas (il filtre sur les trois a la fois).`);
    }
    const grille = parExercice.get(`${sujet.track}|${sujet.exercise_type}`);
    const scores = b.card_json?.criterion_scores;
    if (grille && scores) {
      const attendu = (Number(b.score) * Number(grille.rubric_json.maximum_score)) / 20;
      const somme = Object.values(scores).reduce((s, v) => s + Number(v), 0);
      if (Math.abs(somme - attendu) > 0.001) {
        erreurs.push(`${b.id} : criterion_scores somme ${somme}, attendu ${attendu} (score/20 ramene au bareme de la grille).`);
      }
    }
  }
  for (const s of subject_cards) {
    const n = parSujet.get(s.id) ?? 0;
    if (n < 3) erreurs.push(`${s.id} : ${n} etalon(s). Le moteur refuse de corriger sous 3 : "Moins de trois copies etalons sont reliees a ce sujet."`);
  }

  const cles = new Set();
  for (const t of dossier_templates) {
    const cle = `${t.track}|${t.matiere}|${t.exercise_type}|${t.audience}|${t.status}`;
    if (t.status === 'active' && cles.has(cle)) erreurs.push(`${t.id} : deux gabarits actifs pour la meme cle.`);
    cles.add(cle);
    if (!t.system_prompt || t.system_prompt.trim().length < 20) erreurs.push(`${t.id} : system_prompt vide.`);
    if (t.output_format !== 'html') avertissements.push(`${t.id} : output_format "${t.output_format}".`);
  }

  const exercicesSansSujet = rubrics
    .filter((r) => !subject_cards.some((s) => s.track === r.track && s.exercise_type === r.exercise_type))
    .map((r) => r.id);
  if (exercicesSansSujet.length) {
    avertissements.push(`grilles sans aucun sujet rattache : ${exercicesSansSujet.join(', ')} (installees mais inutilisables tant qu'un sujet n'existe pas).`);
  }

  return { erreurs, avertissements };
}

// ---------------------------------------------------------------------
//  Ecriture en base (PostgREST, upsert sur la cle primaire)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
//  Trace SQL, 100% ASCII
// ---------------------------------------------------------------------
const hex = (valeur) => Buffer.from(valeur, 'utf8').toString('hex');

/** Pour les commentaires du fichier SQL, qui doivent rester en ASCII pur. */
const sansAccent = (texte) =>
  texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7F]/g, '-');

function litteral(valeur) {
  if (valeur === null || valeur === undefined) return 'null';
  if (typeof valeur === 'number') return String(valeur);
  if (typeof valeur === 'boolean') return valeur ? 'true' : 'false';
  if (Array.isArray(valeur)) {
    if (!valeur.length) return "'{}'";
    return `array[${valeur.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ')}]`;
  }
  if (typeof valeur === 'object') return `convert_from(decode('${hex(JSON.stringify(valeur))}', 'hex'), 'UTF8')::jsonb`;
  if (/[^\x00-\x7F]/.test(valeur)) return `convert_from(decode('${hex(valeur)}', 'hex'), 'UTF8')`;
  return `'${valeur.replace(/'/g, "''")}'`;
}

function blocInsert(table, colonnes, lignes) {
  const majSet = colonnes.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`).join(',\n');
  return lignes
    .map((ligne) => {
      const valeurs = colonnes.map((c) => litteral(ligne[c])).join(', ');
      return `insert into public.${table} (${colonnes.join(', ')})\nvalues (${valeurs})\non conflict (id) do update set\n${majSet};`;
    })
    .join('\n\n');
}

function genererSql(data, chemin) {
  const { matiere, libelle, rubrics, subject_cards, benchmark_cards, dossier_templates } = data;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const entete = `-- =====================================================================
--  INSTALLER LA MATIERE ${matiere.toUpperCase()} DANS LE PIPELINE DE CORRECTION
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Genere par scripts/apply-matiere.mjs le ${aujourdhui} a partir de
--  scripts/matieres/${matiere}.mjs, et deja applique en base par API le
--  meme jour : ce fichier est la trace reproductible, pas une action a refaire.
--
--  Contenu : ${rubrics.length} grille(s), ${subject_cards.length} sujet(s), ${benchmark_cards.length} etalon(s), ${dossier_templates.length} gabarit(s).
--  Matiere : ${sansAccent(libelle)}.
--
--  STATUT : tout est pose en 'draft'. Les baremes doivent etre relus par des
--  professeurs avant activation ; tant qu'ils sont en draft, les sujets
--  n'apparaissent pas dans le menu de depot et aucune copie ne peut etre
--  corrigee avec eux.
--
--  Tout le texte accentue passe par convert_from(decode(...,'hex'),'UTF8') :
--  l'editeur SQL de Supabase abime l'UTF-8 colle depuis un Mac.
--  Idempotent : chaque insert est un upsert sur la cle primaire.
-- =====================================================================
`;

  const blocs = [
    ['A', `LES ${rubrics.length} GRILLE(S)`, blocInsert('rubrics', ['id', 'track', 'matiere', 'exercise_type', 'version', 'status', 'system_prompt', 'rubric_json'], rubrics)],
    ['B', `LES ${subject_cards.length} SUJET(S)\n--  card_json porte 'exercise' et 'work' : c'est ce que lit libelleSujet()\n--  pour composer le libelle du menu de depot cote CRM.`, blocInsert('subject_cards', ['id', 'track', 'matiere', 'exercise_type', 'work_id', 'status', 'card_json'], subject_cards.map((s) => ({ ...s, matiere })))],
    ['C', `LES ${benchmark_cards.length} ETALON(S)\n--  Le moteur refuse de corriger un sujet relie a moins de 3 etalons\n--  dont validation_status vaut 'validated' ou 'candidate'.`, blocInsert('benchmark_cards', ['id', 'track', 'exercise_type', 'subject_id', 'score', 'error_codes', 'card_json', 'validation_status'], benchmark_cards)],
    ['D', `LES ${dossier_templates.length} GABARIT(S) DE DOSSIER ELEVE`, blocInsert('dossier_templates', ['id', 'track', 'matiere', 'exercise_type', 'audience', 'system_prompt', 'output_format', 'status', 'version'], dossier_templates)],
  ]
    .map(([lettre, titre, corps]) => `

-- =====================================================================
--  BLOC ${lettre} - ${titre}
-- =====================================================================

begin;

${corps}

commit;
`)
    .join('');

  const verification = `

-- =====================================================================
--  BLOC E - VERIFICATION
--  Attendu : ${rubrics.length} grille(s), ${subject_cards.length} sujet(s), ${benchmark_cards.length} etalon(s), ${dossier_templates.length} gabarit(s),
--  et AUCUN sujet a moins de 3 etalons.
-- =====================================================================

select 'grilles' as objet, count(*) as n from public.rubrics where matiere = '${matiere}'
union all select 'sujets', count(*) from public.subject_cards where matiere = '${matiere}'
union all select 'etalons', count(*) from public.benchmark_cards b
  join public.subject_cards s on s.id = b.subject_id where s.matiere = '${matiere}'
union all select 'gabarits', count(*) from public.dossier_templates where matiere = '${matiere}';

select s.id, s.exercise_type, s.status, count(b.id) as etalons
from public.subject_cards s
left join public.benchmark_cards b on b.subject_id = s.id
where s.matiere = '${matiere}'
group by s.id, s.exercise_type, s.status
order by s.id;
`;

  const sql = entete + blocs + verification;
  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  return chemin;
}

// ---------------------------------------------------------------------
//  Programme principal
// ---------------------------------------------------------------------
const [, , moduleArg, ...options] = process.argv;
if (!moduleArg) {
  console.error('Usage : node scripts/apply-matiere.mjs <module de donnees> [--check] [--apply] [--sql <fichier>]');
  process.exit(1);
}

const data = (await import(pathToFileURL(resolve(ROOT, moduleArg)).href)).default;
const { erreurs, avertissements } = verifier(data);

console.log(`Matiere : ${data.libelle} (${data.matiere})`);
console.log(`  ${data.rubrics.length} grille(s), ${data.subject_cards.length} sujet(s), ${data.benchmark_cards.length} etalon(s), ${data.dossier_templates.length} gabarit(s)`);
for (const a of avertissements) console.log(`  ⚠︎  ${a}`);
for (const e of erreurs) console.log(`  ✖  ${e}`);
if (erreurs.length) {
  console.error(`\n${erreurs.length} blocage(s) : rien n'est ecrit.`);
  process.exit(1);
}
console.log('  ✔  toutes les regles du moteur sont respectees.');

const iSql = options.indexOf('--sql');
if (iSql !== -1) {
  const chemin = resolve(ROOT, options[iSql + 1]);
  console.log(`\nTrace SQL : ${genererSql(data, chemin)}`);
}

if (options.includes('--apply')) {
  const env = chargerEnv();
  if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
    process.exit(1);
  }
  console.log('\nEcriture en base…');
  console.log(`  rubrics            : ${await poser(env, 'rubrics', data.rubrics.map((r) => ({ ...r, matiere: data.matiere })))}`);
  console.log(`  subject_cards      : ${await poser(env, 'subject_cards', data.subject_cards.map((s) => ({ ...s, matiere: data.matiere })))}`);
  console.log(`  benchmark_cards    : ${await poser(env, 'benchmark_cards', data.benchmark_cards)}`);
  console.log(`  dossier_templates  : ${await poser(env, 'dossier_templates', data.dossier_templates)}`);
  console.log('Termine.');
}
