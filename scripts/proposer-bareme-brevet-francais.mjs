#!/usr/bin/env node
// =====================================================================
//  PROPOSITION DE BAREME : DICTEE ET REDACTION, FRANCAIS DNB
//
//    node scripts/proposer-bareme-brevet-francais.mjs            # montre, n'ecrit rien
//    node scripts/proposer-bareme-brevet-francais.mjs --apply    # ecrit en base
//
//  CE QUE CE SCRIPT POSE, ET CE QU'IL NE POSE PAS
//  ----------------------------------------------
//  Il pose les deux blocs qui ne sont PAS un corrige, mais une decision
//  d'etablissement :
//
//    - les regles de retrait de la dictee (aucun bareme national n'existe
//      au DNB : c'est a l'etablissement de trancher) ;
//    - les criteres des deux grilles de redaction (le sujet donne les
//      intitules et les 40 points, pas leur decoupage).
//
//  Il NE touche PAS aux `elements_attendus` des questions. Ceux-la sont le
//  corrige, et le corrige d'un sujet publie sans corrige ne s'invente pas
//  (meme regle que scripts/brevet/sujets-zero.mjs).
//
//  Effet attendu sur les blocages : 15 -> 12. Les 12 restants sont un par
//  question, et seul un professeur peut les lever.
//
//  Les valeurs ci-dessous sont une PROPOSITION a relire dans
//  /admin/brevet/francais. Elles sont marquees `admin_instruction` en base,
//  jamais `official_correction` : rien ici ne vient du ministere.
//
//  Reversible : `node scripts/proposer-bareme-brevet-francais.mjs --defaire`.
// =====================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function chargerEnv() {
  const env = {};
  for (const fichier of ['.env.local', '.env']) {
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
const BASE = (env.PIPELINE_SUPABASE_URL ?? '').replace(/\/$/, '');
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}

const EXAM_CODE = 'dnb_sujet_zero_2026_francais_sg';

async function rest(chemin, methode = 'GET', corps = null, prefer = null) {
  const r = await fetch(`${BASE}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${methode} ${chemin} → HTTP ${r.status} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}

/* ------------------------------------------------------------------ */
/*  La proposition                                                     */
/* ------------------------------------------------------------------ */

// Dictee sur 10, plancher a 0, une meme erreur repetee comptee une fois.
//
// BAREME RETENU PAR CINDY LE 2026-08-09 (variante « C ») : penalites douces,
// parce qu'au DNB la dictee valorise plus qu'elle ne sanctionne. Simule sur
// cinq profils avant d'etre choisi : un eleve moyen obtient 6,5/10, un eleve
// fragile 3/10. Avec 1 pt par faute grammaticale, ils tombaient a 3,5 et 0.
//
// ATTENTION : `plafond` est applique PAR CATEGORIE par le noyau
// (cumulParCategorie dans evaluerDictee), pas par famille. Un plafond de 3 sur
// « accord » ne borne QUE les accords : les quatre categories grammaticales
// peuvent donc retirer jusqu'a 9 points a elles toutes. Les plafonds ci-dessous
// sont calibres en connaissance de cela — ils bornent les cas pathologiques
// (vingt fois la meme faute) sans toucher les copies ordinaires.
const DICTEE_REGLES = [
  { categorie: 'accord', penalite: 0.5, plafond: 3, regle: 'Erreur d’accord (sujet-verbe, groupe nominal, participe passé) : 0,5 point, dans la limite de 3 points.' },
  { categorie: 'conjugaison', penalite: 0.5, plafond: 2, regle: 'Erreur de conjugaison ou de temps : 0,5 point, dans la limite de 2 points.' },
  { categorie: 'homophone', penalite: 0.5, plafond: 2, regle: 'Confusion d’homophones grammaticaux (a/à, et/est, ce/se…) : 0,5 point, dans la limite de 2 points.' },
  { categorie: 'grammaire', penalite: 0.5, plafond: 2, regle: 'Autre erreur grammaticale : 0,5 point, dans la limite de 2 points.' },
  { categorie: 'lexique', penalite: 0.25, plafond: 2, regle: 'Erreur d’orthographe lexicale : 0,25 point, dans la limite de 2 points.' },
  { categorie: 'substitution', penalite: 0.25, plafond: 1, regle: 'Mot remplacé par un autre : 0,25 point, dans la limite de 1 point.' },
  { categorie: 'mot_oublie', penalite: 0.25, plafond: 1, regle: 'Mot omis : 0,25 point, dans la limite de 1 point.' },
  { categorie: 'mot_ajoute', penalite: 0.25, plafond: 1, regle: 'Mot ajouté : 0,25 point, dans la limite de 1 point.' },
  { categorie: 'accent', penalite: 0.25, plafond: 1, regle: 'Accent absent ou fautif : 0,25 point, dans la limite de 1 point.' },
  { categorie: 'majuscule', penalite: 0.25, plafond: 0.5, regle: 'Majuscule absente ou fautive : 0,25 point, dans la limite de 0,5 point.' },
  { categorie: 'ponctuation', penalite: 0.25, plafond: 0.5, regle: 'Ponctuation absente ou fautive : 0,25 point, dans la limite de 0,5 point.' },
  { categorie: 'trait_union', penalite: 0.25, plafond: 0.5, regle: 'Trait d’union absent ou fautif : 0,25 point, dans la limite de 0,5 point.' },
  { categorie: 'apostrophe', penalite: 0.25, plafond: 0.5, regle: 'Apostrophe absente ou fautive : 0,25 point, dans la limite de 0,5 point.' },
  { categorie: 'segmentation', penalite: 0.25, plafond: 0.5, regle: 'Mot mal segmenté : 0,25 point, dans la limite de 0,5 point.' },
  // Les deux suivantes valent zero, et c'est le point important : elles
  // existent pour que le moteur les reconnaisse SANS retirer de point.
  { categorie: 'graphie_rectifiee', penalite: 0, plafond: null, regle: 'Orthographe rectifiée de 1990 : admise, aucun retrait.' },
  { categorie: 'reconnaissance_ocr', penalite: 0, plafond: null, regle: 'Doute de lecture de la copie : aucun retrait, l’élève n’est pas responsable.' },
];

// Profils servant a verifier que le bareme ne produit pas de zeros absurdes.
// Les fautes sont reparties sur les categories d'une meme famille, comme dans
// une vraie copie.
const PROFILS = [
  { nom: 'Très bon', gram: 1, lex: 2, typo: 0 },
  { nom: 'Bon', gram: 2, lex: 3, typo: 1 },
  { nom: 'Moyen', gram: 4, lex: 4, typo: 2 },
  { nom: 'Fragile', gram: 8, lex: 8, typo: 4 },
  { nom: 'Grande difficulté', gram: 14, lex: 14, typo: 7 },
];

const FAMILLES = {
  gram: ['accord', 'conjugaison', 'homophone', 'grammaire'],
  lex: ['lexique', 'substitution', 'mot_oublie', 'mot_ajoute'],
  typo: ['accent', 'majuscule', 'ponctuation', 'trait_union', 'apostrophe', 'segmentation'],
};

/** Rejoue la regle du noyau : retrait par categorie, plafonne par categorie. */
function simuler(profil) {
  const regles = new Map(DICTEE_REGLES.map((r) => [r.categorie, r]));
  let total = 0;
  for (const [famille, categories] of Object.entries(FAMILLES)) {
    const n = profil[famille];
    for (let i = 0; i < categories.length; i += 1) {
      // Reparti au plus juste sur les categories de la famille.
      const part = Math.floor(n / categories.length) + (i < n % categories.length ? 1 : 0);
      const r = regles.get(categories[i]);
      const brut = part * r.penalite;
      total += r.plafond === null ? brut : Math.min(brut, r.plafond);
    }
  }
  return Math.max(0, Math.round((10 - total) * 100) / 100);
}

// 40 points par grille. La langue pese lourd au DNB, sans absorber le reste.
const REDACTION = {
  imagination: [
    { code: 'consigne', libelle: 'Respect de la consigne et de la situation d’énonciation', max_points: 8 },
    { code: 'construction', libelle: 'Cohérence et construction du récit', max_points: 10 },
    { code: 'invention', libelle: 'Richesse de l’invention et effets produits sur le lecteur', max_points: 10 },
    { code: 'langue', libelle: 'Maîtrise de la langue (syntaxe, orthographe, lexique)', max_points: 12 },
  ],
  reflexion: [
    { code: 'consigne', libelle: 'Respect de la consigne et prise de position claire', max_points: 8 },
    { code: 'argumentation', libelle: 'Organisation et progression de l’argumentation', max_points: 12 },
    { code: 'exemples', libelle: 'Exemples et références culturelles personnelles', max_points: 8 },
    { code: 'langue', libelle: 'Maîtrise de la langue (syntaxe, orthographe, lexique)', max_points: 12 },
  ],
};

/* ------------------------------------------------------------------ */

const options = process.argv.slice(2);
const APPLIQUER = options.includes('--apply');
const DEFAIRE = options.includes('--defaire');

const [examen] = await rest(`exams?code=eq.${EXAM_CODE}&select=id,titre`);
if (!examen) {
  console.error(`Examen ${EXAM_CODE} introuvable. Lance d'abord « npm run brevet:sujets-zero -- --apply ».`);
  process.exit(1);
}
const [version] = await rest(
  `bareme_versions?exam_id=eq.${examen.id}&select=id,version,statut&order=cree_le.desc&limit=1`,
);
if (!version) {
  console.error('Aucune version de barème pour cet examen.');
  process.exit(1);
}
if (version.statut !== 'draft') {
  console.error(`La version ${version.version} est « ${version.statut} » : on n'écrit pas sur un barème verrouillé.`);
  process.exit(1);
}

console.log(`\n${examen.titre}`);
console.log(`Barème ${version.version} (${version.statut}) — ${version.id}\n`);

if (DEFAIRE) {
  await rest(`brevet_dictee_regles?bareme_version_id=eq.${version.id}`, 'DELETE');
  const grilles = await rest(`brevet_redaction_grilles?bareme_version_id=eq.${version.id}&select=id`);
  for (const g of grilles) await rest(`brevet_redaction_criteres?grille_id=eq.${g.id}`, 'DELETE');
  await rest(`brevet_dictee_config?bareme_version_id=eq.${version.id}`, 'PATCH', { source_bareme: null });
  console.log('Proposition retirée. Le barème est revenu à son état d’installation.');
  const apres = await rest('rpc/brevet_verifier', 'POST', { p_version: version.id });
  console.log(`Blocages : ${apres.blocages?.length ?? '?'}`);
  process.exit(0);
}

const sommeImagination = REDACTION.imagination.reduce((s, c) => s + c.max_points, 0);
const sommeReflexion = REDACTION.reflexion.reduce((s, c) => s + c.max_points, 0);

console.log('Dictée — règles de retrait (sur 10, plancher 0) :');
for (const r of DICTEE_REGLES) {
  const plafond = r.plafond === null ? '' : `  plafond ${r.plafond}`;
  console.log(`  ${r.penalite.toFixed(2).padStart(5)} pt  ${r.categorie.padEnd(20)}${plafond}`);
}

console.log('\nCe que ce barème donne sur cinq profils (126 mots) :');
for (const p of PROFILS) {
  const note = simuler(p);
  const barre = '█'.repeat(Math.round(note)) + '·'.repeat(10 - Math.round(note));
  const fautes = p.gram + p.lex + p.typo;
  console.log(`  ${p.nom.padEnd(18)} ${String(fautes).padStart(2)} fautes  ${barre} ${note.toFixed(2)}/10`);
}
console.log(`\nRédaction — imagination : ${sommeImagination} / 40`);
for (const c of REDACTION.imagination) console.log(`  ${String(c.max_points).padStart(3)} pts  ${c.libelle}`);
console.log(`\nRédaction — réflexion : ${sommeReflexion} / 40`);
for (const c of REDACTION.reflexion) console.log(`  ${String(c.max_points).padStart(3)} pts  ${c.libelle}`);

if (sommeImagination !== 40 || sommeReflexion !== 40) {
  console.error('\nLes critères ne totalisent pas 40 par grille. Rien n’a été écrit.');
  process.exit(1);
}

if (!APPLIQUER) {
  console.log('\nAucune écriture. Ajoute --apply pour poser cette proposition en base.');
  process.exit(0);
}

// --- Dictee ----------------------------------------------------------
//
// On SUPPRIME avant d'inserer, et surtout pas un upsert. La contrainte
// `unique (bareme_version_id, categorie, sous_categorie)` ne protege rien ici :
// `sous_categorie` vaut NULL, et Postgres ne considere jamais deux NULL comme
// egaux dans un index unique. Un `Prefer: resolution=merge-duplicates` laisse
// donc passer les doublons en silence — verifie le 2026-08-09, ou une seconde
// execution avait porte la table a 32 lignes, deux regles par categorie avec
// des penalites differentes. Le noyau construit une Map par categorie : il
// aurait retenu l'une des deux, sans qu'on sache laquelle.
await rest(`brevet_dictee_regles?bareme_version_id=eq.${version.id}`, 'DELETE');
await rest(
  'brevet_dictee_regles',
  'POST',
  DICTEE_REGLES.map((r, i) => ({
    bareme_version_id: version.id,
    categorie: r.categorie,
    sous_categorie: null,
    penalite: r.penalite,
    plafond: r.plafond,
    cumul_repetitions: false,
    regle: r.regle,
    ordre: i,
  })),
);
// `admin_instruction` et jamais `official_correction` : ce barème est une
// décision d'établissement, pas une source ministérielle.
await rest(`brevet_dictee_config?bareme_version_id=eq.${version.id}`, 'PATCH', {
  source_bareme: 'admin_instruction',
  plancher: 0,
});
console.log(`\n  ✓ ${DICTEE_REGLES.length} règles de dictée posées (source : admin_instruction)`);

// --- Redaction -------------------------------------------------------
const grilles = await rest(
  `brevet_redaction_grilles?bareme_version_id=eq.${version.id}&select=id,type_sujet`,
);
for (const g of grilles) {
  const criteres = REDACTION[g.type_sujet];
  if (!criteres) continue;
  // Meme raison que pour la dictee : on remplace, on n'upserte pas.
  await rest(`brevet_redaction_criteres?grille_id=eq.${g.id}`, 'DELETE');
  await rest(
    'brevet_redaction_criteres',
    'POST',
    criteres.map((c, i) => ({
      grille_id: g.id,
      code: c.code,
      libelle: c.libelle,
      max_points: c.max_points,
      descripteurs: [],
      famille: null,
      cumul_famille_autorise: false,
      actif: true,
      ordre: i,
    })),
  );
  console.log(`  ✓ grille ${g.type_sujet} : ${criteres.length} critères, 40 points`);
}

// --- Ce qu'il reste --------------------------------------------------
const controles = await rest('rpc/brevet_verifier', 'POST', { p_version: version.id });
const blocages = controles.blocages ?? [];
console.log(`\nBlocages restants : ${blocages.length}`);
const parCode = {};
for (const b of blocages) parCode[b.code] = (parCode[b.code] ?? 0) + 1;
for (const [code, n] of Object.entries(parCode)) console.log(`  ${n} × ${code}`);
console.log(
  '\nCe qui reste demande un professeur : les éléments attendus de chaque question,' +
    '\net les formes de la réécriture. Ni l’un ni l’autre ne s’invente.',
);
