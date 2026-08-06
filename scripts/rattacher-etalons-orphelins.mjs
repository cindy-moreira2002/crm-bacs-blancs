#!/usr/bin/env node
// =====================================================================
//  RATTACHER LES ETALONS ORPHELINS DU FRANCAIS
//
//  Usage :
//    node scripts/rattacher-etalons-orphelins.mjs            (verification)
//    node scripts/rattacher-etalons-orphelins.mjs --apply    (ecriture)
//    node scripts/rattacher-etalons-orphelins.mjs --sql <fichier>
//
//  LE PROBLEME. 21 copies etalons portaient subject_id = null. Le moteur
//  ne lit les etalons que par (track, exercise_type, subject_id) : un
//  etalon sans sujet ne participe donc a AUCUN calage de note. Parmi eux,
//  12 sont de VRAIES copies notees par des professeurs (source dropbac),
//  la ressource la plus precieuse du pipeline — la seule qui puisse
//  corriger la calibration trop severe. Le centre de sante du pipeline le
//  disait deja : "Reaffecter leur subject_id".
//
//  POURQUOI ELLES ETAIENT ORPHELINES. Chaque copie porte le support sur
//  lequel elle a ete ecrite (card_json.support). Les seules copies deja
//  rattachees sont celles dont le support est celui du sujet en base
//  (champ same_subject). Les autres portent sept supports pour lesquels
//  AUCUNE fiche sujet n'existait.
//
//  CE QUE FAIT CE SCRIPT.
//    1. Cree les 7 fiches sujet manquantes, en 'draft' : elles portent
//       l'oeuvre et l'exercice, pas encore la consigne exacte ni le texte.
//       Tant qu'elles sont en draft, elles n'apparaissent pas au depot et
//       aucune copie ne peut etre corrigee avec elles. C'est voulu : une
//       fiche sujet incomplete ne doit jamais etre deposable.
//    2. Rattache les 12 vraies copies a la fiche de LEUR support.
//    3. Rattache les 9 profils de methode synthetiques (S01 a S09) au
//       sujet de leur epreuve. Ils gardent validation_status='synthetic',
//       donc le moteur continue de les ignorer (il ne lit que 'validated'
//       et 'candidate') : le rattachement est un rangement, il ne change
//       aucune note. On leur ajoute card_json.origin pour que le tableau
//       de bord cesse de les compter comme de vraies copies.
//
//  Rien n'est supprime, rien n'est active, aucune note n'est modifiee.
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

const AVERTISSEMENT =
  "Fiche support creee le 6 aout 2026 pour rattacher des copies reelles notees par des professeurs, jusque-la orphelines : sans sujet, elles ne participaient a aucun calage de note. La fiche ne porte pas encore la consigne exacte ni le texte du sujet. NE PAS ACTIVER avant de les avoir renseignes ET d'avoir au moins 3 etalons relies : en dessous, le moteur refuse de corriger.";

/** Les 7 fiches sujet manquantes, une par support de copie reelle. */
const FICHES = [
  {
    id: 'FR-COM-DIDEROT-SALON-1767',
    track: 'generale',
    exercise_type: 'commentaire',
    card_json: {
      exercise: 'Commentaire',
      work: 'Diderot, Salon de 1767',
      author: 'Denis Diderot',
      study_object: "La litterature d'idees du XVIe au XVIIIe siecle",
    },
  },
  {
    id: 'FR-COM-DURAS-EDOUARD',
    track: 'generale',
    exercise_type: 'commentaire',
    card_json: {
      exercise: 'Commentaire',
      work: 'Claire de Duras, Edouard',
      author: 'Claire de Duras',
      study_object: 'Le roman et le recit du Moyen Age au XXIe siecle',
    },
  },
  {
    id: 'FR-DISS-RIMBAUD-CAHIER-DOUAI',
    track: 'generale',
    exercise_type: 'dissertation',
    card_json: {
      exercise: 'Dissertation',
      work: 'Arthur Rimbaud, Cahier de Douai',
      author: 'Arthur Rimbaud',
      study_object: 'La poesie du XIXe au XXIe siecle',
    },
  },
  {
    id: 'FR-DISS-SARRAUTE-POUR-UN-OUI',
    track: 'generale',
    exercise_type: 'dissertation',
    card_json: {
      exercise: 'Dissertation',
      work: 'Nathalie Sarraute, Pour un oui ou pour un non',
      author: 'Nathalie Sarraute',
      study_object: 'Le theatre du XVIIe au XXIe siecle',
    },
  },
  {
    id: 'FR-DISS-CORNEILLE-LE-MENTEUR',
    track: 'generale',
    exercise_type: 'dissertation',
    card_json: {
      exercise: 'Dissertation',
      work: 'Pierre Corneille, Le Menteur',
      author: 'Pierre Corneille',
      study_object: 'Le theatre du XVIIe au XXIe siecle',
    },
  },
  {
    id: 'FR-DISS-GOUGES-DDFC',
    track: 'generale',
    exercise_type: 'dissertation',
    card_json: {
      exercise: 'Dissertation',
      work: 'Olympe de Gouges, Declaration des droits de la femme et de la citoyenne',
      author: 'Olympe de Gouges',
      study_object: "La litterature d'idees du XVIe au XVIIIe siecle",
    },
  },
  {
    id: 'FR-TECHNO-COM-ROGNET-ELEGIES',
    track: 'technologique',
    exercise_type: 'commentaire',
    card_json: {
      exercise: 'Commentaire (voie technologique)',
      work: 'Jean-Claude Rognet, Elegies',
      author: 'Jean-Claude Rognet',
      study_object: 'La poesie du XIXe au XXIe siecle',
    },
  },
].map((f) => ({
  ...f,
  matiere: 'francais',
  work_id: null,
  status: 'draft',
  card_json: {
    ...f.card_json,
    role: 'fiche_support_etalonnage',
    source_status: 'fiche_support_a_completer',
    warning: AVERTISSEMENT,
  },
}));

/** Copie reelle -> fiche de son support. */
const RATTACHEMENTS_REELS = {
  R01: 'FR-COM-DIDEROT-SALON-1767',
  R02: 'FR-COM-DURAS-EDOUARD',
  R08: 'FR-COM-DURAS-EDOUARD',
  R03: 'FR-TECHNO-COM-ROGNET-ELEGIES',
  R11: 'FR-DISS-RIMBAUD-CAHIER-DOUAI',
  R12: 'FR-DISS-RIMBAUD-CAHIER-DOUAI',
  R13: 'FR-DISS-RIMBAUD-CAHIER-DOUAI',
  R15: 'FR-DISS-SARRAUTE-POUR-UN-OUI',
  R16: 'FR-DISS-SARRAUTE-POUR-UN-OUI',
  R18: 'FR-DISS-CORNEILLE-LE-MENTEUR',
  R20: 'FR-DISS-CORNEILLE-LE-MENTEUR',
  R21: 'FR-DISS-GOUGES-DDFC',
};

/**
 * Profils de methode synthetiques -> sujet de leur epreuve.
 * Ils restent 'synthetic' : invisibles du moteur, ranges pour le tableau
 * de bord. Les trois derniers changent d'exercise_type pour coller au
 * sujet ('commentaire_technologique' n'existe dans aucune grille).
 */
const RATTACHEMENTS_SYNTHETIQUES = {
  S01: { subject_id: 'FR-COM-2025-ENSORCELEE', track: 'generale', exercise_type: 'commentaire' },
  S02: { subject_id: 'FR-COM-2025-ENSORCELEE', track: 'generale', exercise_type: 'commentaire' },
  S03: { subject_id: 'FR-COM-2025-ENSORCELEE', track: 'generale', exercise_type: 'commentaire' },
  S04: { subject_id: 'FR-DISS-MUSSET-BADINE', track: 'generale', exercise_type: 'dissertation' },
  S05: { subject_id: 'FR-DISS-MUSSET-BADINE', track: 'generale', exercise_type: 'dissertation' },
  S06: { subject_id: 'FR-DISS-MUSSET-BADINE', track: 'generale', exercise_type: 'dissertation' },
  S07: { subject_id: 'FR-TECHNO-COM-BAUDELAIRE-ALBATROS', track: 'technologique', exercise_type: 'commentaire' },
  S08: { subject_id: 'FR-TECHNO-CONTRACTION-HUGO-MISERE', track: 'technologique', exercise_type: 'contraction' },
  S09: { subject_id: 'FR-TECHNO-ESSAI-HUGO-MISERE', track: 'technologique', exercise_type: 'essai' },
};

const NOTE_SYNTHETIQUE =
  "Profil de methode synthetique de l'installation initiale du francais. Range sous ce sujet le 6 aout 2026 pour qu'il cesse d'etre orphelin ; il garde validation_status='synthetic', donc le correcteur ne le lit pas et aucune note ne depend de lui.";

// ---------------------------------------------------------------------
//  Acces base
// ---------------------------------------------------------------------
const env = chargerEnv();
const URL_BASE = env.PIPELINE_SUPABASE_URL;
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}

async function lire(chemin) {
  const r = await fetch(`${URL_BASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
  });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return r.json();
}

async function poser(table, lignes) {
  if (!lignes.length) return 0;
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return lignes.length;
}

// ---------------------------------------------------------------------
//  Preparation : on relit les etalons pour ne toucher qu'a l'existant
// ---------------------------------------------------------------------
const ids = [...Object.keys(RATTACHEMENTS_REELS), ...Object.keys(RATTACHEMENTS_SYNTHETIQUES)];
const etalons = await lire(
  `benchmark_cards?select=id,track,exercise_type,subject_id,score,validation_status,card_json&id=in.(${ids.join(',')})`,
);
const parId = new Map(etalons.map((b) => [b.id, b]));

const majEtalons = [];
const rapport = [];
for (const [id, sujet] of Object.entries(RATTACHEMENTS_REELS)) {
  const b = parId.get(id);
  if (!b) {
    rapport.push(`  ✖  ${id} introuvable en base.`);
    continue;
  }
  if (b.subject_id && b.subject_id !== sujet) {
    rapport.push(`  ⚠︎  ${id} deja rattache a ${b.subject_id} : laisse tel quel.`);
    continue;
  }
  majEtalons.push({
    ...b,
    subject_id: sujet,
    card_json: {
      ...b.card_json,
      same_subject: true,
      rattachement: `Rattache le 6 aout 2026 a la fiche ${sujet}, creee pour son support.`,
    },
  });
  rapport.push(`  ✔  ${id} (${b.validation_status}, ${b.score}/20) -> ${sujet}`);
}
for (const [id, cible] of Object.entries(RATTACHEMENTS_SYNTHETIQUES)) {
  const b = parId.get(id);
  if (!b) {
    rapport.push(`  ✖  ${id} introuvable en base.`);
    continue;
  }
  if (b.subject_id && b.subject_id !== cible.subject_id) {
    rapport.push(`  ⚠︎  ${id} deja rattache a ${b.subject_id} : laisse tel quel.`);
    continue;
  }
  majEtalons.push({
    ...b,
    subject_id: cible.subject_id,
    track: cible.track,
    exercise_type: cible.exercise_type,
    validation_status: 'synthetic',
    card_json: {
      ...b.card_json,
      origin: 'synthetic_method_profile',
      same_subject: false,
      rattachement: NOTE_SYNTHETIQUE,
      ...(b.exercise_type !== cible.exercise_type
        ? { exercise_type_precedent: b.exercise_type }
        : {}),
    },
  });
  rapport.push(`  ✔  ${id} (synthetique, sans note) -> ${cible.subject_id}`);
}

console.log(`${FICHES.length} fiche(s) sujet a creer, ${majEtalons.length} etalon(s) a rattacher.\n`);
for (const l of rapport) console.log(l);

// ---------------------------------------------------------------------
//  Trace SQL, 100% ASCII
// ---------------------------------------------------------------------
const hex = (v) => Buffer.from(v, 'utf8').toString('hex');
function litteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.length ? `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]` : "'{}'";
  if (typeof v === 'object') return `convert_from(decode('${hex(JSON.stringify(v))}', 'hex'), 'UTF8')::jsonb`;
  if (/[^\x00-\x7F]/.test(v)) return `convert_from(decode('${hex(v)}', 'hex'), 'UTF8')`;
  return `'${v.replace(/'/g, "''")}'`;
}
function blocInsert(table, colonnes, lignes) {
  const maj = colonnes.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`).join(',\n');
  return lignes
    .map(
      (l) =>
        `insert into public.${table} (${colonnes.join(', ')})\nvalues (${colonnes
          .map((c) => litteral(l[c]))
          .join(', ')})\non conflict (id) do update set\n${maj};`,
    )
    .join('\n\n');
}

const iSql = process.argv.indexOf('--sql');
if (iSql !== -1) {
  const chemin = resolve(ROOT, process.argv[iSql + 1]);
  const sql = `-- =====================================================================
--  RATTACHER LES ETALONS ORPHELINS DU FRANCAIS
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Genere par scripts/rattacher-etalons-orphelins.mjs le ${new Date().toISOString().slice(0, 10)},
--  et deja applique en base par API le meme jour : trace reproductible.
--
--  BLOC A : ${FICHES.length} fiches sujet en 'draft' (une par support de copie reelle).
--  BLOC B : ${majEtalons.length} etalons rattaches. Aucune note n'est modifiee.
--  Les fiches restent en draft : incompletes, elles ne doivent pas etre deposables.
-- =====================================================================


-- =====================================================================
--  BLOC A - LES ${FICHES.length} FICHES SUPPORT
-- =====================================================================

begin;

${blocInsert('subject_cards', ['id', 'track', 'matiere', 'exercise_type', 'work_id', 'status', 'card_json'], FICHES)}

commit;


-- =====================================================================
--  BLOC B - LES ${majEtalons.length} ETALONS RATTACHES
-- =====================================================================

begin;

${blocInsert('benchmark_cards', ['id', 'track', 'exercise_type', 'subject_id', 'score', 'validation_status', 'card_json'], majEtalons)}

commit;


-- =====================================================================
--  BLOC C - VERIFICATION : plus aucun etalon sans sujet
-- =====================================================================

select count(*) as etalons_orphelins from public.benchmark_cards where subject_id is null;

select s.id, s.status, count(b.id) as etalons,
       count(*) filter (where b.validation_status in ('validated','candidate')) as etalons_actifs
from public.subject_cards s
left join public.benchmark_cards b on b.subject_id = s.id
where s.matiere = 'francais'
group by s.id, s.status
order by s.id;
`;
  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  console.log(`\nTrace SQL : ${chemin}`);
}

if (process.argv.includes('--apply')) {
  console.log('\nEcriture en base…');
  console.log(`  subject_cards   : ${await poser('subject_cards', FICHES)}`);
  console.log(`  benchmark_cards : ${await poser('benchmark_cards', majEtalons)}`);
  const restants = await lire('benchmark_cards?select=id&subject_id=is.null');
  console.log(`  etalons encore orphelins : ${restants.length}`);
} else {
  console.log('\n(verification seule — relancer avec --apply pour ecrire)');
}
