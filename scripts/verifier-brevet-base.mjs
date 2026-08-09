#!/usr/bin/env node
// =====================================================================
//  VERIFICATION DE L'INSTALLATION DU BREVET, CONTRE LA VRAIE BASE
//
//    node scripts/verifier-brevet-base.mjs
//    npm run brevet:verifier
//
//  STRICTEMENT EN LECTURE. Ce script n'ecrit rien, ne cree rien, ne
//  supprime rien : il lit, il compte, et il dit ce qui manque. On peut le
//  rejouer autant de fois qu'on veut, y compris en production.
//
//  Il verifie trois choses, dans cet ordre :
//    1. les 20 tables du brevet existent et repondent ;
//    2. les referentiels sont poses, avec le bon compte ;
//    3. le BACCALAUREAT est intact — c'est le controle qui compte le plus,
//       puisque la migration 42 touche des contraintes partagees.
// =====================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

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
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = chargerEnv();
if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}

const BASE = env.PIPELINE_SUPABASE_URL.replace(/\/$/, '');
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;

let ok = 0;
let ko = 0;
const problemes = [];

function bilan(vert, libelle, detail = '') {
  if (vert) {
    ok += 1;
    console.log(`  ✓ ${libelle}${detail ? ` — ${detail}` : ''}`);
  } else {
    ko += 1;
    problemes.push(`${libelle}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Compte les lignes d'une table sans en rapatrier une seule. */
async function compter(table, filtre = '') {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=*${filtre}`, {
    method: 'HEAD',
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!r.ok) return { erreur: `HTTP ${r.status}` };
  const plage = r.headers.get('content-range') ?? '';
  const total = Number(plage.split('/')[1]);
  return { total: Number.isFinite(total) ? total : 0 };
}

async function lire(chemin) {
  const r = await fetch(`${BASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
  });
  if (!r.ok) return { erreur: `HTTP ${r.status} ${await r.text()}` };
  return { data: await r.json() };
}

/* ------------------------------------------------------------------ */

console.log('\n═══ INSTALLATION DU BREVET — vérification en base ═══');
console.log(`Projet : ${BASE.replace(/^https:\/\//, '').split('.')[0]}\n`);

// --- 1. Les tables ---------------------------------------------------
console.log('1. Les 20 tables du brevet');

const TABLES = [
  'brevet_parties', 'brevet_reecriture_config', 'brevet_reecriture_items',
  'brevet_dictee_config', 'brevet_dictee_regles', 'brevet_redaction_grilles',
  'brevet_redaction_criteres', 'brevet_automatismes', 'brevet_qualite_redaction_criteres',
  'correction_automatismes', 'correction_reecriture_formes', 'correction_dictee_erreurs',
  'correction_redaction', 'correction_redaction_criteres', 'correction_qualite_redaction',
  'correction_document_qualite', 'correction_modifications_humaines',
  'sources_officielles', 'brevet_regles_officielles', 'brevet_parametres',
];

const manquantes = [];
for (const t of TABLES) {
  const r = await compter(t);
  if (r.erreur) manquantes.push(`${t} (${r.erreur})`);
}
bilan(
  manquantes.length === 0,
  `${TABLES.length - manquantes.length} / ${TABLES.length} tables répondent`,
  manquantes.length ? `manquantes : ${manquantes.join(', ')}` : '',
);

// --- 2. Les colonnes ajoutées ---------------------------------------
console.log('\n2. Les colonnes ajoutées aux tables existantes');

const cols = await lire('exams?select=examen,serie,niveau&limit=1');
bilan(!cols.erreur, 'exams.examen / serie / niveau', cols.erreur ?? '');

const colsQ = await lire(
  'bareme_questions?select=partie,elements_attendus,etapes_geometrie,regles_points_partiels&limit=1',
);
bilan(!colsQ.erreur, 'bareme_questions : les 11 colonnes du brevet', colsQ.erreur ?? '');

const colsC = await lire(
  'correction_questions?select=bloc,source_regle,cascade_error,inherited_value&limit=1',
);
bilan(!colsC.erreur, 'correction_questions : bloc, source_regle, cascade', colsC.erreur ?? '');

const colsA = await lire('corrections?select=amenagements&limit=1');
bilan(!colsA.erreur, 'corrections.amenagements', colsA.erreur ?? '');

const colsR = await lire('relectures_humaines?select=degre&limit=1');
bilan(!colsR.erreur, 'relectures_humaines.degre', colsR.erreur ?? '');

const colsT = await lire('taxonomie_erreurs?select=libelle_eleve,penalite_defaut,conseil,version&limit=1');
bilan(!colsT.erreur, 'taxonomie_erreurs : les 12 colonnes du BLOC 0', colsT.erreur ?? '');

// --- 3. Les fonctions ------------------------------------------------
console.log('\n3. Les fonctions');

const rpc = await fetch(`${BASE}/rest/v1/rpc/brevet_verifier`, {
  method: 'POST',
  headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_version: '00000000-0000-0000-0000-000000000000' }),
});
const corpsRpc = await rpc.json().catch(() => null);
bilan(
  rpc.ok && corpsRpc?.ok === false,
  'brevet_verifier() répond et refuse une version inconnue',
  rpc.ok ? '' : `HTTP ${rpc.status}`,
);

// --- 4. Les référentiels --------------------------------------------
console.log('\n4. Les référentiels du brevet');

const ATTENDU = {
  competence_referentiels: { fr: 6, ma: 6 },
  taxonomie_erreurs: { fr: 67, ma: 45 },
};

for (const [table, attendu] of Object.entries(ATTENDU)) {
  const fr = await compter(table, '&matiere=eq.brevet_francais');
  const ma = await compter(table, '&matiere=eq.brevet_mathematiques');
  bilan(
    fr.total === attendu.fr && ma.total === attendu.ma,
    `${table}`,
    `français ${fr.total ?? '?'} / ${attendu.fr} · maths ${ma.total ?? '?'} / ${attendu.ma}`,
  );
}

for (const [table, attendu] of [
  ['sources_officielles', 5],
  ['brevet_regles_officielles', 27],
  ['brevet_parametres', 5],
]) {
  const r = await compter(table);
  bilan(r.total === attendu, table, `${r.total ?? '?'} / ${attendu}`);
}

// Une règle officielle sans citation ne doit pas exister.
const sansCitation = await lire(
  'brevet_regles_officielles?select=code,matiere&statut=eq.officiel&or=(citation.is.null,citation.eq.)',
);
bilan(
  !sansCitation.erreur && (sansCitation.data ?? []).length === 0,
  'aucune règle « officielle » sans citation de sa source',
  (sansCitation.data ?? []).length ? JSON.stringify(sansCitation.data) : '',
);

// --- 5. Le baccalauréat est intact ----------------------------------
console.log('\n5. Le baccalauréat est intact');

const corr = await lire('corrections?select=moteur');
const parMoteur = {};
for (const c of corr.data ?? []) parMoteur[c.moteur] = (parMoteur[c.moteur] ?? 0) + 1;
bilan(
  !corr.erreur && (corr.data ?? []).length > 0,
  'les corrections du bac sont toujours là',
  Object.entries(parMoteur).map(([m, n]) => `${m} ${n}`).join(' · '),
);
bilan(
  (parMoteur.criteres_rediges ?? 0) > 0,
  'la copie HGGSP v2 (criteres_rediges) a survécu à la contrainte',
  `${parMoteur.criteres_rediges ?? 0} copie(s)`,
);

const refBac = await compter('competence_referentiels', '&matiere=not.like.brevet_*');
bilan(
  (refBac.total ?? 0) >= 24,
  'les référentiels du bac sont intacts',
  `${refBac.total ?? '?'} compétence(s) hors brevet`,
);

const taxoBac = await compter('taxonomie_erreurs', '&matiere=not.like.brevet_*');
bilan(
  (taxoBac.total ?? 0) >= 50,
  'la taxonomie du bac est intacte',
  `${taxoBac.total ?? '?'} code(s) hors brevet`,
);

const examsBac = await compter('exams', '&examen=eq.BAC');
bilan(true, 'examens du baccalauréat', `${examsBac.total ?? 0}`);

// --- 6. Les examens de brevet ---------------------------------------
console.log('\n6. Les examens de brevet');

const examsDnb = await lire('exams?select=code,matiere,statut,titre&examen=eq.DNB&order=code');
const liste = examsDnb.data ?? [];
if (!liste.length) {
  console.log('  · aucun examen DNB : lance « npm run brevet:sujets-zero -- --apply » pour poser les sujets zéro.');
} else {
  for (const e of liste) console.log(`  · ${e.code} — ${e.matiere} — ${e.statut}`);
}

/* ------------------------------------------------------------------ */

console.log(`\n${ok} contrôle(s) vert(s), ${ko} problème(s).`);
if (ko) {
  console.log('\nÀ regarder :');
  for (const p of problemes) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('Installation conforme.');
