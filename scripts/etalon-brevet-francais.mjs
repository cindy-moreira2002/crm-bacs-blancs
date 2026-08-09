#!/usr/bin/env node
// =====================================================================
//  COPIE ETALON DE TEST — FRANCAIS DNB
//
//    node scripts/etalon-brevet-francais.mjs           # montre l'attendu
//    node scripts/etalon-brevet-francais.mjs --apply   # pose la copie
//    node scripts/etalon-brevet-francais.mjs --defaire # la retire
//
//  CE SCRIPT N'APPELLE PAS CLAUDE. Il pose une copie fictive et sa
//  transcription, puis s'arrete. Lancer la correction est une action separee
//  et payante :
//
//    curl -X POST "$PIPELINE_SUPABASE_URL/functions/v1/correct-brevet-francais" \
//      -H "Authorization: Bearer $PIPELINE_SUPABASE_SERVICE_ROLE_KEY" \
//      -H "Content-Type: application/json" \
//      -d '{"correction_id":"<id affiche par ce script>"}'
//
//  A QUOI SERT UNE COPIE ETALON
//  ----------------------------
//  A savoir si le moteur note juste. Les fautes de cette copie sont donc
//  CHOISIES et documentees : on connait la note attendue avant de corriger,
//  et l'ecart entre l'attendu et le rendu est l'information utile.
//
//  `est_etalon = true` est ce qui autorise la correction sur un bareme en
//  `draft` : correct-brevet-francais n'exige `locked` que hors etalon.
//
//  LA COPIE EST FICTIVE. Aucun eleve reel, aucune donnee personnelle.
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
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents.');
  process.exit(1);
}

const EXAM_CODE = 'dnb_sujet_zero_2026_francais_sg';
const SOURCE = 'etalon-brevet-francais';

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
/*  La dictee de l'eleve : douze fautes placees exprès                  */
/*                                                                     */
/*  Chaque faute porte sa categorie attendue et le retrait qui en       */
/*  decoule avec le bareme pose le 2026-08-09 (0,5 grammatical /        */
/*  0,25 lexical / 0,25 typographique, plafonds par categorie).         */
/* ------------------------------------------------------------------ */

const FAUTES_DICTEE = [
  { attendu: "n'ai", produit: 'nai', categorie: 'apostrophe', retrait: 0.25 },
  { attendu: 'extravagant', produit: 'extravagants', categorie: 'accord', retrait: 0.5 },
  { attendu: 'se moquait', produit: 'ce moquait', categorie: 'homophone', retrait: 0.5 },
  { attendu: 'faisait', produit: 'faisai', categorie: 'conjugaison', retrait: 0.5 },
  { attendu: 'mauvais tours', produit: 'mauvais tour', categorie: 'accord', retrait: 0.5 },
  { attendu: 'colère', produit: 'colere', categorie: 'accent', retrait: 0.25 },
  { attendu: 'fruste', produit: 'frust', categorie: 'lexique', retrait: 0.25 },
  { attendu: 'trapues', produit: 'trapue', categorie: 'accord', retrait: 0.5 },
  { attendu: 'démesuré', produit: 'demesuré', categorie: 'accent', retrait: 0.25 },
  { attendu: 'formidables', produit: 'formidable', categorie: 'accord', retrait: 0.5 },
  { attendu: 'souriant', produit: 'souriants', categorie: 'accord', retrait: 0.5 },
  { attendu: 'prodigieuse', produit: 'prodigieuz', categorie: 'lexique', retrait: 0.25 },
];

// Plafonds du bareme en vigueur, pour predire la note.
const PLAFONDS = { accord: 3, conjugaison: 2, homophone: 2, grammaire: 2, lexique: 2, accent: 1, apostrophe: 1 };

function noteDicteeAttendue() {
  const parCategorie = {};
  for (const f of FAUTES_DICTEE) {
    parCategorie[f.categorie] = (parCategorie[f.categorie] ?? 0) + f.retrait;
  }
  let total = 0;
  for (const [cat, brut] of Object.entries(parCategorie)) {
    total += PLAFONDS[cat] === undefined ? brut : Math.min(brut, PLAFONDS[cat]);
  }
  return { note: Math.max(0, 10 - total), total, parCategorie };
}

const DICTEE_ELEVE =
  "La peur de mourir. Jamais je nai vu quelqu'un avoir aussi peur de ça que Faval. " +
  "Il en devenait extravagants et tout le monde ce moquait de lui et le faisai marcher. " +
  "Mais lui, comprenant très bien que les camarades lui jouaient des mauvais tour ou lui " +
  "montaient des bateaux pour lui faire peur, ne se mettait jamais en colere et continuait " +
  "à avoir peur, une peur bleue. C'était un être très simple, voire frust. Il avait les " +
  "jambes courtes et trapue, un torse demesuré et puissant, des bras formidable, une petite " +
  "tête, pas de front, une tignasse de violoniste et des yeux souriants avec une candeur " +
  "enfantine. C'était un être d'une force musculaire prodigieuz, sans aucune méchanceté et " +
  "qui croyait tout ce qu'on lui disait.";

/* ------------------------------------------------------------------ */
/*  La reecriture : six formes justes, les deux pieges rates            */
/* ------------------------------------------------------------------ */

const REECRITURE_ELEVE = {
  attends: { produit: 'nous les attendons', juste: true, points: 1, max: 1 },
  pret: { produit: 'prêt à tirer', juste: false, points: 0, max: 1.5, note: 'PIÈGE : accord de l’adjectif oublié.' },
  attention: { produit: 'toute notre attention', juste: true, points: 1, max: 1 },
  index: { produit: 'notre index', juste: true, points: 1, max: 1 },
  rends_compte: { produit: 'nous me rendons compte', juste: false, points: 0, max: 1.5, note: 'PIÈGE : pronom réfléchi non accordé.' },
  main: { produit: 'notre main', juste: true, points: 1, max: 1 },
  prenais: { produit: 'nous prenions', juste: true, points: 1, max: 1 },
  vers_moi: { produit: 'vers nous', juste: true, points: 1, max: 1 },
  baionnette: { produit: 'notre baïonnette', juste: true, points: 1, max: 1 },
};

const REECRITURE_TEXTE =
  'nous les attendons, prêt à tirer… et c\'est alors que concentrant toute notre attention ' +
  'sur notre index placé sur la gâchette, c\'est alors que nous me rendons compte que notre ' +
  'main tremble nerveusement et que ce bruit d\'herbe foulée, que nous prenions pour ' +
  'l\'approche de deux ou trois Allemands rampant imperceptiblement vers nous, était causé ' +
  'par la pointe de notre baïonnette';

/* ------------------------------------------------------------------ */
/*  Les reponses aux questions : niveau moyen, volontairement inegal    */
/* ------------------------------------------------------------------ */

const REPONSES = [
  { q: '1', max: 4, attendu: 2, texte: "Partie 1 : le narrateur a peur dans la nuit. Partie 2 : il entend un bruit et il croit que ce sont des Allemands. Partie 3 : il y a des coups de feu. Partie 4 : c'est fini." },
  { q: '2', max: 4, attendu: 3, texte: "Le narrateur éprouve de la peur. On le voit quand il dit « J'aurais crié de frayeur » et aussi « Des gouttes de sueur me coulaient entre les omoplates »." },
  { q: '3', max: 6, attendu: 3, texte: "Il répète plusieurs fois le mot « Rien », ce qui montre qu'il attend et qu'il ne se passe rien. Il utilise aussi des phrases très courtes." },
  { q: '4', max: 4, attendu: 3, texte: "Il se dit que s'il les entend c'est qu'ils sont moins près : « le danger est moins proche que je ne le croyais ». Et il se parle à lui-même : « Pauvre Blaise, me dis-je »." },
  { q: '5', max: 6, attendu: 2, texte: "Il utilise des mots comme « j'avais l'impression » ou « j'ai cru deviner ». Le lecteur ne sait pas si l'ennemi existe vraiment." },
  { q: '6', max: 8, attendu: 4, texte: "Sur l'image on voit un soldat seul allongé par terre avec son fusil, comme le narrateur qui est couché et prêt à tirer. Il a l'air tendu, comme dans le texte où il transpire. On ne voit pas l'ennemi sur la photo." },
  { q: '7a', max: 2, attendu: 2, texte: "Les verbes conjugués sont « entends » et « s'approche ». Ils sont à l'indicatif présent." },
  { q: '7b', max: 1, attendu: 1, texte: "C'est un présent de narration : ça donne l'impression que la scène se passe en direct, sous nos yeux." },
  { q: '8a', max: 1, attendu: 1, texte: "« les » est un pronom personnel qui remplace « Les autres »." },
  { q: '8b', max: 1, attendu: 1, texte: "Il est COD du verbe « attends »." },
  { q: '9a', max: 1.5, attendu: 1, texte: "in- = préfixe, vis = radical, -ible = suffixe." },
  { q: '9b', max: 1.5, attendu: 0.5, texte: "Invisible veut dire qu'on ne peut pas le voir. Un mot de la même famille : imperceptible." },
];

const REDACTION_SUJET = 'reflexion';
const REDACTION_TEXTE =
  "Je pense que découvrir des œuvres qui se passent à une autre époque apporte beaucoup au lecteur. " +
  "D'abord, cela permet d'apprendre des choses sur l'Histoire. Par exemple, le texte de Blaise Cendrars " +
  "nous montre comment les soldats vivaient pendant la guerre de 1914-1918, avec la peur et l'attente " +
  "dans les tranchées. On comprend mieux ce qu'ils ont vécu que dans un cours d'histoire.\n\n" +
  "Ensuite, cela permet de ressentir des émotions. Quand j'ai lu ce texte, j'ai eu peur avec le narrateur. " +
  "Le film Les Sentiers de la gloire fait la même chose avec les images.\n\n" +
  "Enfin, même si l'époque est différente, les sentiments sont les mêmes. La peur de mourir, c'est " +
  "quelque chose que tout le monde peut comprendre, hier comme aujourd'hui.\n\n" +
  "Pour conclure, je trouve que ces œuvres sont importantes parce qu'elles nous font voyager dans le " +
  "temps tout en nous parlant de nous.";

// Rédaction volontairement courte : 30 lignes sont demandées, la copie en fait
// nettement moins. C'est un test : le moteur doit le relever.
const REDACTION_ATTENDU = 20; // sur 40, ordre de grandeur

/* ------------------------------------------------------------------ */

const options = process.argv.slice(2);
const APPLIQUER = options.includes('--apply');
const DEFAIRE = options.includes('--defaire');

const [examen] = await rest(`exams?code=eq.${EXAM_CODE}&select=id,titre`);
if (!examen) {
  console.error(`Examen ${EXAM_CODE} introuvable.`);
  process.exit(1);
}
const [version] = await rest(
  `bareme_versions?exam_id=eq.${examen.id}&select=id,version,statut,controles&order=cree_le.desc&limit=1`,
);

if (DEFAIRE) {
  const anciennes = await rest(`corrections?source=eq.${SOURCE}&select=id`);
  for (const c of anciennes) {
    await rest(`copy_transcriptions?correction_id=eq.${c.id}`, 'DELETE');
    await rest(`corrections?id=eq.${c.id}`, 'DELETE');
  }
  console.log(`${anciennes.length} copie(s) étalon retirée(s).`);
  process.exit(0);
}

/* --- Ce que la copie devrait obtenir -------------------------------- */

const dictee = noteDicteeAttendue();
const sommeQuestions = REPONSES.reduce((s, r) => s + r.attendu, 0);
const maxQuestions = REPONSES.reduce((s, r) => s + r.max, 0);
const reecriture = Object.values(REECRITURE_ELEVE).reduce((s, r) => s + r.points, 0);
const totalAttendu = sommeQuestions + reecriture + dictee.note + REDACTION_ATTENDU;

console.log(`\n${examen.titre}`);
console.log(`Barème ${version.version} (${version.statut}) — contrôles ok : ${version.controles?.ok === true}\n`);
console.log('COPIE ÉTALON — ce qu’elle devrait obtenir\n');

console.log(`  Questions      ${String(sommeQuestions).padStart(5)} / ${maxQuestions}`);
for (const r of REPONSES) console.log(`    Q${r.q.padEnd(3)} ${String(r.attendu).padStart(4)} / ${r.max}`);

console.log(`\n  Réécriture     ${String(reecriture).padStart(5)} / 10`);
for (const [cle, r] of Object.entries(REECRITURE_ELEVE)) {
  if (!r.juste) console.log(`    ✗ ${cle} : ${r.note}`);
}

console.log(`\n  Dictée         ${String(dictee.note).padStart(5)} / 10   (${FAUTES_DICTEE.length} fautes, ${dictee.total} pt retirés)`);
for (const [cat, pts] of Object.entries(dictee.parCategorie)) {
  const plaf = PLAFONDS[cat];
  const applique = plaf === undefined ? pts : Math.min(pts, plaf);
  console.log(`    ${cat.padEnd(13)} ${String(applique).padStart(5)}${applique < pts ? ` (plafonné, ${pts} bruts)` : ''}`);
}

console.log(`\n  Rédaction      ${String(REDACTION_ATTENDU).padStart(5)} / 40   (sujet « ${REDACTION_SUJET} », copie volontairement trop courte)`);
console.log(`\n  TOTAL ATTENDU  ${String(totalAttendu).padStart(5)} / 100  →  ${(totalAttendu / 5).toFixed(1)} / 20`);

console.log('\nCe que cet étalon met à l’épreuve :');
console.log('  · la dictée est-elle catégorisée comme prévu (accord vs lexique vs accent) ?');
console.log('  · les deux pièges de réécriture sont-ils vus (« prêts », « nous nous rendons ») ?');
console.log('  · Q7b « présent de narration » est-il accepté malgré la divergence des corrigés ?');
console.log('  · Q9b « imperceptible » est-il REFUSÉ comme mot de la même famille ?');
console.log('  · la rédaction trop courte est-elle relevée ?');

if (!APPLIQUER) {
  console.log('\nAucune écriture. Ajoute --apply pour poser la copie.');
  process.exit(0);
}

/* --- Pose de la copie ---------------------------------------------- */

const anciennes = await rest(`corrections?source=eq.${SOURCE}&select=id`);
for (const c of anciennes) {
  await rest(`copy_transcriptions?correction_id=eq.${c.id}`, 'DELETE');
  await rest(`corrections?id=eq.${c.id}`, 'DELETE');
}

const [correction] = await rest('corrections', 'POST', {
  exam_id: examen.id,
  bareme_version_id: version.id,
  matiere: 'brevet_francais',
  moteur: 'brevet_francais',
  track: 'generale',
  // NOT NULL herite du chemin `grille_generique` du bac, ou il sert a
  // rapprocher les benchmark_cards. Le brevet ne s'en sert pas, mais la
  // colonne doit etre renseignee : on y remet la matiere plutot qu'un
  // type d'exercice de bac qui n'aurait aucun sens ici.
  exercise_type: 'brevet_francais',
  status: 'pending',
  source: SOURCE,
  est_etalon: true,
  student_name: 'Copie étalon (fictive)',
  max_score: 100,
}, 'return=representation');

const pages = [
  { page: 1, text: REPONSES.map((r) => `Question ${r.q}\n${r.texte}`).join('\n\n') },
  { page: 2, text: `DICTÉE\n${DICTEE_ELEVE}` },
  { page: 3, text: `RÉÉCRITURE (question 10)\n${REECRITURE_TEXTE}` },
  { page: 4, text: `RÉDACTION — sujet de ${REDACTION_SUJET}\n${REDACTION_TEXTE}` },
];

await rest('copy_transcriptions', 'POST', {
  correction_id: correction.id,
  transcription_json: {
    pages,
    document_type: 'copie_eleve',
    legibility_status: 'lisible',
    overall_confidence: 1,
    requires_human_review: false,
    review_reasons: [],
  },
  mean_confidence: 1,
  model_name: 'transcription-fictive',
});

console.log(`\n  ✓ copie étalon posée — correction_id : ${correction.id}`);
console.log('  ✓ transcription posée (4 pages)');
console.log('\nRIEN N’A ÉTÉ CORRIGÉ : aucun appel à Claude n’a eu lieu.');
console.log('Pour lancer la correction (appel payant) :\n');
console.log(`  curl -X POST "$PIPELINE_SUPABASE_URL/functions/v1/correct-brevet-francais" \\`);
console.log(`    -H "Authorization: Bearer $PIPELINE_SUPABASE_SERVICE_ROLE_KEY" \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"correction_id":"${correction.id}"}'`);
