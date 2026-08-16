/**
 * Répare les textes dont les accents ont été abîmés à l'écriture.
 *
 * Symptôme : « problématisation » stocké « probl√©matisation ». Ce n'est pas
 * une faute de frappe du modèle : les octets UTF-8 (é = C3 A9) ont été relus
 * comme du MacRoman (C3 = √, A9 = ©). L'abîmage est donc PARFAITEMENT
 * réversible — on refait le chemin à l'envers, sans rien réinventer et sans
 * rappeler l'API. Seuls les tout premiers dossiers (25 juillet 2026) sont
 * touchés ; la chaîne écrit correctement depuis.
 *
 *   node scripts/reparer-accents-dossiers.mjs            → diagnostic seul
 *   node scripts/reparer-accents-dossiers.mjs --ecrire   → répare en base
 *
 * Une sauvegarde du contenu d'origine est écrite à côté avant toute écriture.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

for (const f of ['.env', '.env.local']) {
  try {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const URL_BASE = process.env.PIPELINE_SUPABASE_URL;
const CLE = process.env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL et PIPELINE_SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(1);
}

const ECRIRE = process.argv.includes('--ecrire');
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' };

/* ---- La table MacRoman, construite depuis le décodeur du runtime -------- */
const decMac = new TextDecoder('x-mac-roman');
const versOctet = new Map();
for (let b = 0x20; b < 0x80; b++) versOctet.set(String.fromCharCode(b), b);
for (let b = 0x80; b <= 0xff; b++) versOctet.set(decMac.decode(new Uint8Array([b])), b);
const decUtf8 = new TextDecoder('utf-8', { fatal: true });

/** La marque de l'abîmage : « √ » suivi d'un signe, ou les guillemets tordus. */
const ABIME = /√[^\s]|‚Ä[™úùô]/;

/**
 * Rejoue le mauvais décodage à l'envers, séquence par séquence.
 *
 * On ne peut pas retraiter le document entier d'un bloc : il contient aussi
 * des caractères parfaitement écrits (tirets cadratins, flèches) qui n'ont
 * jamais eu de représentation MacRoman. On ne touche donc QUE les suites qui
 * ressemblent à un caractère UTF-8 relu octet par octet — un octet de tête
 * (C2–F4) suivi de 1 à 3 octets de continuation (80–BF) — et seulement si le
 * résultat est de l'UTF-8 valide. Tout le reste est laissé intact.
 */
function reparer(texte) {
  const car = [...texte];
  const octet = car.map((c) => versOctet.get(c));
  let sortie = '';
  let i = 0;

  while (i < car.length) {
    const tete = octet[i];
    if (tete !== undefined && tete >= 0xc2 && tete <= 0xf4) {
      const attendus = tete < 0xe0 ? 2 : tete < 0xf0 ? 3 : 4;
      const suite = octet.slice(i, i + attendus);
      const complet =
        suite.length === attendus &&
        suite.slice(1).every((b) => b !== undefined && b >= 0x80 && b <= 0xbf);
      if (complet) {
        try {
          sortie += decUtf8.decode(new Uint8Array(suite));
          i += attendus;
          continue;
        } catch {
          // Pas de l'UTF-8 valide : ce n'était donc pas un accent abîmé.
        }
      }
    }
    sortie += car[i];
    i++;
  }
  return sortie;
}

/** Répare un JSON entier, chaîne par chaîne. */
function reparerValeur(v) {
  if (typeof v === 'string') return ABIME.test(v) ? reparer(v) : v;
  if (Array.isArray(v)) return v.map(reparerValeur);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reparerValeur(x)]));
  }
  return v;
}

const lire = async (chemin) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${chemin}`, { headers: entetes });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return r.json();
};

const ecrire = async (chemin, corps) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${chemin}`, {
    method: 'PATCH',
    headers: { ...entetes, Prefer: 'return=minimal' },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
};

const compter = (t) => (String(t).match(/√[^\s]/g) ?? []).length;

const dossierSauvegarde = 'sauvegardes/accents';
mkdirSync(dossierSauvegarde, { recursive: true });

let touches = 0;

/* ------------------------------------------------- Les dossiers HTML ---- */
for (const d of await lire('dossiers?select=id,correction_id,content')) {
  const avant = compter(d.content);
  if (!avant) continue;
  const repare = reparer(d.content);
  console.log(`dossier ${d.id} (copie ${d.correction_id.slice(0, 8)}) : ${avant} marques → ${compter(repare)}`);
  touches++;
  if (ECRIRE) {
    writeFileSync(`${dossierSauvegarde}/dossier-${d.id}.html`, d.content);
    await ecrire(`dossiers?id=eq.${d.id}`, { content: repare });
  }
}

/* ------------------------------------------- Les corrections (JSON) ----- */
for (const c of await lire('corrections?select=id,result_json')) {
  const brut = JSON.stringify(c.result_json ?? null);
  const avant = compter(brut);
  if (!avant) continue;
  const repare = reparerValeur(c.result_json);
  const apres = compter(JSON.stringify(repare));
  console.log(`correction ${c.id.slice(0, 8)} : ${avant} marques → ${apres}`);
  touches++;
  if (ECRIRE) {
    writeFileSync(`${dossierSauvegarde}/correction-${c.id}.json`, brut);
    await ecrire(`corrections?id=eq.${c.id}`, { result_json: repare });
  }
}

/* ------------------------------------------ Les copies transcrites ------ */
for (const t of await lire('copy_transcriptions?select=id,correction_id,transcription_json')) {
  const brut = JSON.stringify(t.transcription_json ?? null);
  const avant = compter(brut);
  if (!avant) continue;
  const repare = reparerValeur(t.transcription_json);
  console.log(`transcription ${t.id} : ${avant} marques → ${compter(JSON.stringify(repare))}`);
  touches++;
  if (ECRIRE) {
    writeFileSync(`${dossierSauvegarde}/transcription-${t.id}.json`, brut);
    await ecrire(`copy_transcriptions?id=eq.${t.id}`, { transcription_json: repare });
  }
}

console.log(
  touches === 0
    ? '\nRien à réparer : aucun accent abîmé en base.'
    : ECRIRE
      ? `\n${touches} enregistrement(s) réparé(s). Sauvegardes dans ${dossierSauvegarde}/.`
      : `\n${touches} enregistrement(s) à réparer. Relancer avec --ecrire pour appliquer.`,
);
