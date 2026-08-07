#!/usr/bin/env node
/**
 * DEPLOIEMENT D'UNE EDGE FUNCTION SANS LA CLI SUPABASE.
 *
 *   node scripts/deployer-edge.mjs correct-copy-bareme
 *
 * Pourquoi ce script existe : `supabase functions deploy` reste bloque sans
 * rien afficher sur ce poste. L'API Management fait exactement la meme
 * chose — un envoi multipart des fichiers source — et elle repond.
 *
 * Les chemins envoyes reproduisent l'arborescence du depot, pour que les
 * imports relatifs vers ../_shared/ continuent de resoudre cote serveur.
 *
 * Jeton : ~/.supabase/access-token (npx supabase login). Jamais affiche.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const REF = process.env.PIPELINE_PROJECT_REF ?? 'xgdaibekjmtffvkwvcge';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage : node scripts/deployer-edge.mjs <slug> [fichier partage...]');
  process.exit(1);
}

// Fichiers partages a embarquer. Par defaut le noyau du bareme, que
// correct-copy-bareme importe ; on peut en passer d'autres en arguments.
const partages = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['supabase/functions/_shared/bareme-noyau.ts'];

const entree = `supabase/functions/${slug}/index.ts`;
const chemins = [entree, ...partages];

const jeton = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();

const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [
      JSON.stringify({
        name: slug,
        entrypoint_path: entree,
        verify_jwt: false,
        static_patterns: [],
      }),
    ],
    { type: 'application/json' },
  ),
);
for (const chemin of chemins) {
  const contenu = readFileSync(resolve(ROOT, chemin), 'utf8');
  form.append('file', new Blob([contenu], { type: 'application/typescript' }), chemin);
}

console.log(`Deploiement de ${slug} sur ${REF}`);
for (const c of chemins) console.log(`  ${c}`);

const r = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${encodeURIComponent(slug)}`,
  { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form },
);
const texte = await r.text();
if (!r.ok) {
  console.error(`Echec HTTP ${r.status}\n${texte}`);
  process.exit(1);
}
const fn = JSON.parse(texte);
console.log(`\nDeploye : version ${fn.version}, statut ${fn.status}, verify_jwt ${fn.verify_jwt}`);
