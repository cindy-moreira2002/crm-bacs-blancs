#!/usr/bin/env node
// =====================================================================
//  REFERENTIELS DU BREVET : COMPETENCES, TAXONOMIES, SOURCES, REGLES
//
//  Usage :
//    node scripts/seed-brevet.mjs --check
//    node scripts/seed-brevet.mjs --sql supabase/sql/43_brevet_referentiels.sql
//    node scripts/seed-brevet.mjs --apply
//
//  Meme mecanique que scripts/seed-referentiels.mjs pour le baccalaureat :
//  les donnees vivent dans un seul module (scripts/brevet/referentiels.mjs),
//  ce script les verifie, en produit la trace SQL reproductible, et peut les
//  poser en base par l'API REST.
//
//  Prerequis : supabase/sql/42_brevet_socle.sql.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  COMPETENCES,
  TAXONOMIE_FRANCAIS,
  TAXONOMIE_MATHS,
  SOURCES_OFFICIELLES,
  REGLES_OFFICIELLES,
  PARAMETRES,
  VERSION_REFERENTIELS,
} from './brevet/referentiels.mjs';

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

const TAXONOMIE = [...TAXONOMIE_FRANCAIS, ...TAXONOMIE_MATHS];

/* ------------------------------------------------------------------ */
/*  Controles avant toute ecriture                                     */
/* ------------------------------------------------------------------ */

function controler() {
  const erreurs = [];

  // 1. Aucun code en double dans une meme matiere.
  const vus = new Set();
  for (const t of TAXONOMIE) {
    const cle = `${t.matiere}|${t.code}`;
    if (vus.has(cle)) erreurs.push(`Code d'erreur en double : ${cle}`);
    vus.add(cle);
  }

  // 2. Aucune competence visee qui n'existe pas DANS CETTE MATIERE. C'est le
  //    garde-fou d'etancheite : une erreur de francais ne peut pas viser une
  //    competence de mathematiques.
  const competences = new Set(COMPETENCES.map((c) => `${c.matiere}|${c.code}`));
  for (const t of TAXONOMIE) {
    if (t.competence && !competences.has(`${t.matiere}|${t.competence}`)) {
      erreurs.push(`${t.matiere}/${t.code} vise la competence inconnue « ${t.competence} »`);
    }
  }

  // 3. Aucune matiere du brevet ne doit se glisser dans le referentiel du bac,
  //    et reciproquement.
  const attendues = new Set(['brevet_francais', 'brevet_mathematiques']);
  for (const c of COMPETENCES) {
    if (!attendues.has(c.matiere)) erreurs.push(`Competence hors brevet : ${c.matiere}/${c.code}`);
  }
  for (const t of TAXONOMIE) {
    if (!attendues.has(t.matiere)) erreurs.push(`Code d'erreur hors brevet : ${t.matiere}/${t.code}`);
  }

  // 4. Toute regle doit citer une source existante, et toute regle officielle
  //    doit porter une citation. Une regle sans citation ne peut pas etre
  //    presentee comme officielle.
  const sources = new Set(SOURCES_OFFICIELLES.map((s) => s.code));
  for (const [code, matiere, , , , statut, source, citation] of REGLES_OFFICIELLES) {
    if (!sources.has(source)) erreurs.push(`Regle ${matiere}/${code} : source inconnue « ${source} »`);
    if (statut === 'officiel' && !String(citation).trim()) {
      erreurs.push(`Regle ${matiere}/${code} : statut officiel sans citation de la source.`);
    }
    if (statut === 'a_confirmer' && String(citation).trim()) {
      erreurs.push(`Regle ${matiere}/${code} : statut a_confirmer mais une citation est fournie.`);
    }
  }

  // 5. Un code de nature 'eleve' qui porte une penalite doit porter sa regle.
  for (const t of TAXONOMIE) {
    if (t.penalite_defaut !== null && !t.regle_application) {
      erreurs.push(`${t.matiere}/${t.code} : penalite par defaut sans regle d'application.`);
    }
  }

  return erreurs;
}

/* ------------------------------------------------------------------ */
/*  Ecriture en base                                                   */
/* ------------------------------------------------------------------ */

async function poser(env, table, lignes, conflit) {
  if (!lignes.length) return 0;
  const r = await fetch(`${env.PIPELINE_SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflit}`, {
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

/* ------------------------------------------------------------------ */
/*  Trace SQL — 100 % ASCII, accents encodes en hexadecimal            */
/* ------------------------------------------------------------------ */

const hex = (v) => Buffer.from(v, 'utf8').toString('hex');

function litteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return litteral(JSON.stringify(v)) + '::jsonb';
  if (/[^\x00-\x7F]/.test(v)) return `convert_from(decode('${hex(v)}', 'hex'), 'UTF8')`;
  return `'${v.replace(/'/g, "''")}'`;
}

function upserts(table, colonnes, lignes, conflit) {
  const clesConflit = conflit.split(',').map((c) => c.trim());
  return lignes
    .map(
      (l) =>
        `insert into public.${table} (${colonnes.join(', ')})\nvalues (${colonnes
          .map((c) => litteral(l[c] ?? null))
          .join(', ')})\non conflict (${conflit}) do update set\n${colonnes
          .filter((c) => !clesConflit.includes(c))
          .map((c) => `  ${c} = excluded.${c}`)
          .join(',\n')};`,
    )
    .join('\n\n');
}

function lignesTaxonomie() {
  return TAXONOMIE.map((t) => ({
    matiere: t.matiere,
    code: t.code,
    domaine: t.categorie,
    description: t.explication,
    gravite: t.gravite,
    nature: t.nature,
    competence: t.competence,
    partie: t.partie,
    sous_categorie: t.sous_categorie,
    libelle_eleve: t.libelle_eleve,
    penalite_defaut: t.penalite_defaut,
    regle_application: t.regle_application,
    plafond_perte: t.plafond_perte,
    cumul_autorise: t.cumul_autorise,
    points_partiels_possibles: t.points_partiels_possibles,
    exemple: t.exemple,
    conseil: t.conseil,
    source: t.source,
    version: t.version,
  }));
}

function lignesRegles() {
  return REGLES_OFFICIELLES.map(
    ([code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session]) => ({
      code,
      matiere,
      libelle,
      valeur,
      valeur_num,
      statut,
      source_code,
      citation: citation || null,
      session,
    }),
  );
}

const COL_COMPETENCES = ['matiere', 'code', 'libelle', 'description', 'ordre', 'toujours_mobilisee'];
const COL_TAXONOMIE = [
  'matiere', 'code', 'domaine', 'description', 'gravite', 'nature', 'competence',
  'partie', 'sous_categorie', 'libelle_eleve', 'penalite_defaut', 'regle_application',
  'plafond_perte', 'cumul_autorise', 'points_partiels_possibles', 'exemple', 'conseil',
  'source', 'version',
];
const COL_SOURCES = [
  'code', 'titre', 'organisme', 'url', 'date_publication', 'date_maj', 'date_consultation',
  'session_concernee', 'statut', 'resume',
];
const COL_REGLES = [
  'code', 'matiere', 'libelle', 'valeur', 'valeur_num', 'statut', 'source_code', 'citation', 'session',
];
const COL_PARAMETRES = ['matiere', 'cle', 'valeur', 'commentaire'];

function genererSql(chemin) {
  const taxonomie = lignesTaxonomie();
  const regles = lignesRegles();

  const sql = `-- =====================================================================
--  REFERENTIELS DU BREVET (DNB) : COMPETENCES, TAXONOMIES, SOURCES, REGLES
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Genere par scripts/seed-brevet.mjs - version ${VERSION_REFERENTIELS}.
--  Prerequis : supabase/sql/42_brevet_socle.sql.
--
--  ${COMPETENCES.length} competence(s), ${taxonomie.length} code(s) d'erreur,
--  ${SOURCES_OFFICIELLES.length} source(s) officielle(s), ${regles.length} regle(s), ${PARAMETRES.length} parametre(s).
--
--  Idempotent : chaque insert est un upsert sur la cle primaire.
--  100% ASCII : les accents sont encodes en hexadecimal.
--
--  ETANCHEITE : la cle primaire de competence_referentiels et de
--  taxonomie_erreurs est (matiere, code). Les codes du brevet portent
--  'brevet_francais' ou 'brevet_mathematiques' : ils ne peuvent donc jamais
--  atteindre une copie du baccalaureat, ni l'une l'autre matiere.
--
--  RETOUR ARRIERE :
--    delete from public.brevet_parametres;
--    delete from public.brevet_regles_officielles;
--    delete from public.sources_officielles;
--    delete from public.taxonomie_erreurs where matiere like 'brevet_%';
--    delete from public.competence_referentiels where matiere like 'brevet_%';
-- =====================================================================


-- =====================================================================
--  BLOC 0 - COLONNES SUPPLEMENTAIRES DE LA TAXONOMIE
--
--  taxonomie_erreurs portait sept colonnes, suffisantes pour le bac. Le
--  cahier des charges du brevet en exige davantage : un libelle destine a
--  l'eleve, une penalite par defaut eventuelle avec sa regle et son
--  plafond, une regle de cumul, un exemple, un conseil, la source et la
--  version. Toutes sont AJOUTEES : les lignes du bac gardent NULL.
-- =====================================================================

begin;

alter table public.taxonomie_erreurs
  add column if not exists partie                    text,
  add column if not exists sous_categorie            text,
  add column if not exists libelle_eleve             text,
  add column if not exists penalite_defaut           numeric(5,2),
  add column if not exists regle_application         text,
  add column if not exists plafond_perte             numeric(5,2),
  add column if not exists cumul_autorise            boolean not null default false,
  add column if not exists points_partiels_possibles boolean not null default true,
  add column if not exists exemple                   text,
  add column if not exists conseil                   text,
  add column if not exists source                    text,
  add column if not exists version                   text;

comment on column public.taxonomie_erreurs.penalite_defaut is
  'La gravite seule ne suffit pas : quand c''est pertinent, un code porte une perte de points precise, avec sa regle d''application, son plafond et sa regle de cumul. NULL = code purement pedagogique, sans effet mecanique sur la note.';

commit;


-- =====================================================================
--  BLOC A - COMPETENCES
--
--  toujours_mobilisee = false : competence evaluee UNIQUEMENT quand le
--  sujet la mobilise (l'image en francais, la reecriture). Sinon
--  'non_applicable', jamais zero.
-- =====================================================================

begin;

${upserts('competence_referentiels', COL_COMPETENCES, COMPETENCES, 'matiere, code')}

commit;


-- =====================================================================
--  BLOC B - TAXONOMIE D'ERREURS
--
--  nature separe quatre familles qui ne se confondent jamais : erreur de
--  l'eleve, incident de transcription, incertitude de reconnaissance,
--  anomalie du sujet. Les deux dernieres ne retirent JAMAIS de points.
-- =====================================================================

begin;

${upserts('taxonomie_erreurs', COL_TAXONOMIE, taxonomie, 'matiere, code')}

commit;


-- =====================================================================
--  BLOC C - SOURCES OFFICIELLES
--
--  Aucune regle n'est presentee comme officielle sans sa trace : titre,
--  organisme, URL exacte, date de publication, date de consultation,
--  session concernee et statut.
-- =====================================================================

begin;

${upserts('sources_officielles', COL_SOURCES, SOURCES_OFFICIELLES, 'code')}

commit;


-- =====================================================================
--  BLOC D - REGLES OFFICIELLES CHIFFREES
--
--  statut = officiel              : ecrit tel quel dans la source ;
--           officiel_par_deduction: se deduit de la source, et on le dit ;
--           a_confirmer           : AUCUN effet sur la note.
-- =====================================================================

begin;

${upserts('brevet_regles_officielles', COL_REGLES, regles, 'code, matiere')}

commit;


-- =====================================================================
--  BLOC E - PARAMETRES D'EXPLOITATION
-- =====================================================================

begin;

${upserts('brevet_parametres', COL_PARAMETRES, PARAMETRES, 'matiere, cle')}

commit;


-- =====================================================================
--  BLOC F - VERIFICATION
-- =====================================================================

select matiere, count(*) as competences
from public.competence_referentiels where matiere like 'brevet_%' group by 1 order by 1;

select matiere, nature, count(*) as codes
from public.taxonomie_erreurs where matiere like 'brevet_%' group by 1, 2 order by 1, 2;

select statut, count(*) as regles from public.brevet_regles_officielles group by 1 order by 1;

-- Aucune regle officielle sans citation : attendu 0 ligne.
select code, matiere from public.brevet_regles_officielles
where statut = 'officiel' and coalesce(btrim(citation), '') = '';
`;

  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  return chemin;
}

/* ------------------------------------------------------------------ */
/*  Programme principal                                                */
/* ------------------------------------------------------------------ */

const options = process.argv.slice(2);

console.log(`Referentiels du brevet — version ${VERSION_REFERENTIELS}`);
for (const m of ['brevet_francais', 'brevet_mathematiques']) {
  console.log(
    `  ${m.padEnd(22)} ${COMPETENCES.filter((c) => c.matiere === m).length} competence(s), ` +
      `${TAXONOMIE.filter((t) => t.matiere === m).length} code(s) d'erreur`,
  );
}
console.log(
  `  ${SOURCES_OFFICIELLES.length} source(s), ${REGLES_OFFICIELLES.length} regle(s) officielle(s), ` +
    `${PARAMETRES.length} parametre(s)`,
);

const erreurs = controler();
if (erreurs.length) {
  console.error(`\n${erreurs.length} probleme(s) :`);
  for (const e of erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('  controles : tous verts.');

const iSql = options.indexOf('--sql');
if (iSql !== -1) {
  console.log(`\nTrace SQL : ${genererSql(resolve(ROOT, options[iSql + 1]))}`);
}

if (options.includes('--apply')) {
  const env = chargerEnv();
  if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\nPIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
    process.exit(1);
  }
  console.log('\nEcriture en base...');
  console.log(`  competence_referentiels   : ${await poser(env, 'competence_referentiels', COMPETENCES, 'matiere,code')}`);
  console.log(`  taxonomie_erreurs         : ${await poser(env, 'taxonomie_erreurs', lignesTaxonomie(), 'matiere,code')}`);
  console.log(`  sources_officielles       : ${await poser(env, 'sources_officielles', SOURCES_OFFICIELLES, 'code')}`);
  console.log(`  brevet_regles_officielles : ${await poser(env, 'brevet_regles_officielles', lignesRegles(), 'code,matiere')}`);
  console.log(`  brevet_parametres         : ${await poser(env, 'brevet_parametres', PARAMETRES, 'matiere,cle')}`);
  console.log('Termine.');
}
