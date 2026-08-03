#!/usr/bin/env node
// =====================================================================
//  ACTIVER UNE MATIERE (la rendre visible aux eleves)
//
//  Usage :
//    node scripts/activer-matiere.mjs svt                 (etat des lieux)
//    node scripts/activer-matiere.mjs svt --sql            (ecrit le SQL)
//    node scripts/activer-matiere.mjs svt --sql supabase/sql/20_activer_svt.sql
//    node scripts/activer-matiere.mjs svt --apply --profs-ont-valide
//
//  Une matiere installee vit en 'draft' : ses sujets n'apparaissent pas au
//  depot (/api/pipeline/sujets ne liste que status='active') et
//  generate-dossier refuse de produire le dossier eleve (il exige
//  dossier_templates.status='active'). L'activer = passer trois tables a
//  'active' : rubrics, subject_cards, dossier_templates.
//
//  ACTIVER N'EST PAS UNE OPERATION TECHNIQUE. Les baremes des matieres
//  autres que le francais ont ete ecrits sans relecture de professeur et
//  leurs etalons sont synthetiques : activer avant validation, c'est rendre
//  a des eleves des notes que personne n'a verifiees. D'ou le drapeau
//  --profs-ont-valide, obligatoire pour ecrire en base.
//
//  Les identifiants viennent de .env / .env.local et ne sont jamais affiches.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

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

const env = chargerEnv();
const BASE = env.PIPELINE_SUPABASE_URL;
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;

async function lire(chemin) {
  const r = await fetch(`${BASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
  });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return r.json();
}

async function activer(table, filtre) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${filtre}`, {
    method: 'PATCH',
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status: 'active' }),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return (await r.json()).length;
}

// ---------------------------------------------------------------------
//  Etat des lieux : un sujet n'est reellement deposable que s'il a une
//  grille ET un gabarit de meme matiere + track + exercise_type.
// ---------------------------------------------------------------------
async function etatDesLieux(matiere) {
  const q = `matiere=eq.${encodeURIComponent(matiere)}`;
  const [grilles, sujets, gabarits, etalons] = await Promise.all([
    lire(`rubrics?select=id,track,exercise_type,status&${q}`),
    lire(`subject_cards?select=id,track,exercise_type,status&${q}`),
    lire(`dossier_templates?select=id,track,exercise_type,audience,status&${q}`),
    lire(`benchmark_cards?select=subject_id,validation_status,card_json&limit=5000`),
  ]);
  const idsSujets = new Set(sujets.map((s) => s.id));
  const parSujet = new Map();
  let synthetiques = 0;
  for (const b of etalons) {
    if (!idsSujets.has(b.subject_id)) continue;
    parSujet.set(b.subject_id, (parSujet.get(b.subject_id) ?? 0) + 1);
    if (JSON.stringify(b.card_json ?? {}).includes('synthetic')) synthetiques += 1;
  }
  return { matiere, grilles, sujets, gabarits, parSujet, synthetiques };
}

function afficher(etat) {
  const { matiere, grilles, sujets, gabarits, parSujet, synthetiques } = etat;
  if (!grilles.length && !sujets.length) {
    console.log(`Aucune ligne en base pour la matiere "${matiere}".`);
    return;
  }
  const cle = (x) => `${x.track}|${x.exercise_type}`;
  const grilleActive = new Set(grilles.filter((g) => g.status === 'active').map(cle));
  const gabaritActif = new Set(
    gabarits.filter((t) => t.status === 'active' && t.audience === 'eleve').map(cle),
  );
  const grillePresente = new Set(grilles.map(cle));
  const gabaritPresent = new Set(gabarits.filter((t) => t.audience === 'eleve').map(cle));

  console.log(`\n### ${matiere}`);
  console.log(
    `grilles ${grilles.filter((g) => g.status === 'active').length}/${grilles.length} actives | ` +
    `sujets ${sujets.filter((s) => s.status === 'active').length}/${sujets.length} actifs | ` +
    `gabarits ${gabarits.filter((t) => t.status === 'active').length}/${gabarits.length} actifs | ` +
    `etalons synthetiques ${synthetiques}`,
  );
  for (const s of sujets.sort((a, b) => a.id.localeCompare(b.id))) {
    const k = cle(s);
    const alertes = [];
    if (!grillePresente.has(k)) alertes.push('AUCUNE GRILLE');
    else if (!grilleActive.has(k) && s.status === 'active') alertes.push('grille inactive');
    if (!gabaritPresent.has(k)) alertes.push('AUCUN GABARIT ELEVE');
    else if (!gabaritActif.has(k) && s.status === 'active') alertes.push('gabarit inactif');
    const n = parSujet.get(s.id) ?? 0;
    if (n < 3) alertes.push(`${n} etalon(s) : le moteur refuse de corriger sous 3`);
    console.log(
      `  ${s.id.padEnd(24)} ${s.status.padEnd(7)} ${s.track.padEnd(14)} ${s.exercise_type.padEnd(28)}` +
      (alertes.length ? `  !! ${alertes.join(' ; ')}` : ''),
    );
  }
}

// ---------------------------------------------------------------------
//  Trace SQL, 100% ASCII (l'editeur SQL de Supabase abime l'UTF-8 colle
//  depuis un Mac). Un bloc par voie : la voie technologique se valide
//  separement de la voie generale.
// ---------------------------------------------------------------------
const liste = (valeurs) => valeurs.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');

function ecrireSql(etat, chemin) {
  const { matiere, grilles, sujets, gabarits } = etat;
  const voies = [...new Set(sujets.map((s) => s.track))].sort();
  const lignes = [];
  lignes.push('-- =====================================================================');
  lignes.push(`--  ACTIVER ${matiere.toUpperCase()} (a ne jouer QU'APRES validation prof)`);
  lignes.push('--');
  lignes.push('--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)');
  lignes.push('--  QUOI: SQL Editor > New query > coller UN BLOC > Run');
  lignes.push('--');
  lignes.push('--  Genere par scripts/activer-matiere.mjs a partir de ce qui est');
  lignes.push('--  reellement en base. Tant que tout est en draft :');
  lignes.push('--    - les sujets n\'apparaissent pas dans le menu "Deposer une copie" ;');
  lignes.push('--    - generate-dossier refuse de produire le dossier eleve.');
  lignes.push('--');
  lignes.push('--  Les etalons de cette matiere sont SYNTHETIQUES tant qu\'un professeur');
  lignes.push('--  n\'a pas fourni de vraies copies notees : la note reste approximative.');
  lignes.push('--');
  lignes.push('--  Idempotent, 100% ASCII.');
  lignes.push('-- =====================================================================');
  lignes.push('');

  let bloc = 'A'.charCodeAt(0);
  for (const voie of voies) {
    const ex = [...new Set(sujets.filter((s) => s.track === voie).map((s) => s.exercise_type))];
    const ids = sujets.filter((s) => s.track === voie).map((s) => s.id).sort();
    const exGrilles = grilles.filter((g) => g.track === voie && ex.includes(g.exercise_type)).map((g) => g.exercise_type);
    const exGabarits = gabarits.filter((t) => t.track === voie && ex.includes(t.exercise_type)).map((t) => t.exercise_type);
    lignes.push('');
    lignes.push('-- =====================================================================');
    lignes.push(`--  BLOC ${String.fromCharCode(bloc)} - VOIE ${voie.toUpperCase()} : ${exGrilles.length} grille(s), ${ids.length} sujet(s), ${exGabarits.length} gabarit(s)`);
    lignes.push('--  Retirer de la liste des sujets ceux que les professeurs n\'ont pas valides.');
    lignes.push('-- =====================================================================');
    lignes.push('');
    lignes.push('begin;');
    lignes.push('');
    if (exGrilles.length) {
      lignes.push('update public.rubrics set status = \'active\'');
      lignes.push(`where matiere = '${matiere}' and track = '${voie}'`);
      lignes.push(`  and exercise_type in (${liste([...new Set(exGrilles)])});`);
      lignes.push('');
    }
    lignes.push('update public.subject_cards set status = \'active\'');
    lignes.push(`where matiere = '${matiere}' and track = '${voie}'`);
    lignes.push(`  and id in (${liste(ids)});`);
    lignes.push('');
    if (exGabarits.length) {
      lignes.push('update public.dossier_templates set status = \'active\'');
      lignes.push(`where matiere = '${matiere}' and track = '${voie}'`);
      lignes.push(`  and exercise_type in (${liste([...new Set(exGabarits)])});`);
      lignes.push('');
    }
    lignes.push('commit;');
    lignes.push('');
    bloc += 1;
  }

  lignes.push('');
  lignes.push('-- =====================================================================');
  lignes.push(`--  BLOC ${String.fromCharCode(bloc)} - VERIFICATION`);
  lignes.push('--  Attendu : chaque sujet actif a une grille active ET un gabarit eleve');
  lignes.push('--  actif de meme matiere + track + exercise_type. Sinon le sujet reste');
  lignes.push('--  bloque au depot, ou l\'eleve ne recoit aucun dossier.');
  lignes.push('-- =====================================================================');
  lignes.push('');
  lignes.push('select s.id as sujet, s.status as statut_sujet, r.id as grille, r.status as statut_grille,');
  lignes.push('       t.id as gabarit, t.status as statut_gabarit');
  lignes.push('from public.subject_cards s');
  lignes.push('left join public.rubrics r');
  lignes.push('  on r.matiere = s.matiere and r.track = s.track and r.exercise_type = s.exercise_type');
  lignes.push('left join public.dossier_templates t');
  lignes.push('  on t.matiere = s.matiere and t.track = s.track and t.exercise_type = s.exercise_type');
  lignes.push(' and t.audience = \'eleve\'');
  lignes.push(`where s.matiere = '${matiere}'`);
  lignes.push('order by s.id;');
  lignes.push('');
  lignes.push('');
  lignes.push('-- =====================================================================');
  lignes.push('--  POUR REVENIR EN ARRIERE');
  lignes.push('-- =====================================================================');
  lignes.push(`-- update public.rubrics           set status = 'draft' where matiere = '${matiere}';`);
  lignes.push(`-- update public.subject_cards     set status = 'draft' where matiere = '${matiere}';`);
  lignes.push(`-- update public.dossier_templates set status = 'draft' where matiere = '${matiere}';`);
  lignes.push('');

  const texte = lignes.join('\n');
  if (/[^\x00-\x7F]/.test(texte)) throw new Error('Le SQL genere contient des caracteres non ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte, 'utf8');
  console.log(`SQL ecrit : ${chemin}`);
}

// ---------------------------------------------------------------------
//  Programme
// ---------------------------------------------------------------------
const args = process.argv.slice(2);
const matiere = args.find((a) => !a.startsWith('--'));
const veutSql = args.includes('--sql');
const veutAppliquer = args.includes('--apply');
const valide = args.includes('--profs-ont-valide');
const cheminSqlDonne = (() => {
  const i = args.indexOf('--sql');
  const suivant = args[i + 1];
  return suivant && !suivant.startsWith('--') && suivant !== matiere ? suivant : null;
})();

if (!matiere) {
  console.error('Usage : node scripts/activer-matiere.mjs <matiere> [--sql [chemin]] [--apply --profs-ont-valide]');
  process.exit(1);
}
if (!BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env.');
  process.exit(1);
}

const etat = await etatDesLieux(matiere);
afficher(etat);

if (veutSql) {
  ecrireSql(etat, resolve(ROOT, cheminSqlDonne ?? `supabase/sql/activer_${matiere}.sql`));
}

if (veutAppliquer) {
  if (!valide) {
    console.error(
      '\nRefus : --apply exige --profs-ont-valide.\n' +
      'Activer une matiere rend ses notes visibles aux eleves. Les baremes et les\n' +
      'etalons des matieres autres que le francais n\'ont pas encore ete relus par\n' +
      'un professeur (dossier /relecture/<matiere>).',
    );
    process.exit(1);
  }
  const q = `matiere=eq.${encodeURIComponent(matiere)}`;
  const g = await activer('rubrics', q);
  const s = await activer('subject_cards', q);
  const t = await activer('dossier_templates', q);
  console.log(`\nActive : ${g} grille(s), ${s} sujet(s), ${t} gabarit(s).`);
  afficher(await etatDesLieux(matiere));
}
