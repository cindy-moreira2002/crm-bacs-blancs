#!/usr/bin/env node
// =====================================================================
//  PREPARER LE PILOTAGE DES BACS BLANCS
//
//  Usage :
//    node scripts/preparer-bacs-blancs.mjs            (verification)
//    node scripts/preparer-bacs-blancs.mjs --apply    (cree le bucket)
//
//  Deux choses a poser avant que /admin/bacs-blancs fonctionne :
//    1. les tables session_sujets et session_retours — SQL a coller dans
//       l'editeur Supabase (supabase/sql/41_bacs_blancs_pilotage.sql) ;
//    2. le bucket de stockage "sujets" — celui-la, ce script le cree.
//
//  Le bucket est PRIVE : un sujet de bac blanc ne doit pas etre lisible
//  par une URL devinee avant l'epreuve. Le site distribue des liens signes
//  de courte duree, uniquement aux profs assignes a la session.
// =====================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const BUCKET = 'sujets';

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
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function appel(chemin, options = {}) {
  const r = await fetch(`${URL_BASE}${chemin}`, { ...options, headers: { ...entetes, ...(options.headers ?? {}) } });
  return { ok: r.ok, statut: r.status, corps: await r.text() };
}

// --- 1. Les tables ----------------------------------------------------
for (const table of ['session_sujets', 'session_retours']) {
  const r = await appel(`/rest/v1/${table}?select=id&limit=1`);
  console.log(
    r.ok
      ? `  ✔  table ${table} presente`
      : `  ✖  table ${table} ABSENTE — jouer supabase/sql/41_bacs_blancs_pilotage.sql dans l'editeur SQL`,
  );
}

// --- 2. Le bucket -----------------------------------------------------
const liste = await appel('/storage/v1/bucket');
const buckets = liste.ok ? JSON.parse(liste.corps).map((b) => b.name) : [];
if (buckets.includes(BUCKET)) {
  console.log(`  ✔  bucket "${BUCKET}" present`);
} else if (process.argv.includes('--apply')) {
  const r = await appel('/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 26214400, // 25 Mo
      allowed_mime_types: [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    }),
  });
  console.log(r.ok ? `  ✔  bucket "${BUCKET}" cree (prive)` : `  ✖  creation du bucket : ${r.statut} ${r.corps}`);
} else {
  console.log(`  ✖  bucket "${BUCKET}" absent — relancer avec --apply`);
}

console.log(`\nBuckets existants : ${buckets.join(', ') || '(aucun)'}`);
