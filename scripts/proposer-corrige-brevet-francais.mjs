#!/usr/bin/env node
// =====================================================================
//  PROPOSITION DE CORRIGE : FRANCAIS DNB 2026, SERIE GENERALE
//
//    node scripts/proposer-corrige-brevet-francais.mjs           # montre
//    node scripts/proposer-corrige-brevet-francais.mjs --apply   # ecrit
//    node scripts/proposer-corrige-brevet-francais.mjs --defaire # annule
//
//  CE QUE CECI EST, ET CE QUE CE N'EST PAS
//  ---------------------------------------
//  Le sujet `26GENFRQGCME1` n'est PAS un sujet zero : c'est le sujet reellement
//  tombe le 26 juin 2026 (metropole, session normale). Le ministere ne publie
//  jamais les grilles de correction du DNB, donc **aucun corrige officiel
//  n'existe**. Ce fichier est une PROPOSITION, reconstituee le 2026-08-09 a
//  partir de deux choses :
//
//    - le sujet officiel lui-meme (education.gouv.fr), pour les citations,
//      les numeros de ligne et tout ce qui se lit dans le texte ;
//    - un corrige d'editeur (L'Etudiant), recoupe ligne a ligne contre le
//      sujet. Rien n'en est recopie : les formulations ci-dessous sont
//      reecrites, seuls les FAITS attendus sont repris.
//
//  Elle vaut pour CALIBRER le moteur, pas pour noter des eleves. Un
//  professeur doit la relire. Le bareme reste en `draft` : rien ne peut etre
//  verrouille tant qu'un humain n'a pas tranche.
//
//  CE SUJET NE DOIT PAS SERVIR DE BREVET BLANC : il est tombe en juin 2026 et
//  ses corriges sont en ligne (digiSchool, Nomad Education, L'Etudiant).
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

async function rest(chemin, methode = 'GET', corps = null) {
  const r = await fetch(`${BASE}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'Content-Type': 'application/json',
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${methode} ${chemin} → HTTP ${r.status} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}

/* ------------------------------------------------------------------ */
/*  Le corrige, question par question                                  */
/*                                                                     */
/*  `cle` = numero + sous_numero, tel qu'il est en base.                */
/* ------------------------------------------------------------------ */

const CORRIGE = {
  '1': [
    'l.1-17 : l’attente immobile et la montée de la peur — le narrateur croit à une présence sans rien percevoir.',
    'l.18-32 : la méprise — il croit entendre des Allemands ramper, puis découvre que le bruit venait de sa propre baïonnette.',
    'l.33-36 : le danger réel — coup de feu, fuite, riposte à coups de fusil et de grenades.',
    'l.37 : la chute — la nuit redevient calme et indifférente.',
    'Aucun intitulé n’est imposé : valider tout titre bref qui restitue le contenu de la partie.',
    'L’attendu de fond est de percevoir la progression : montée de tension, fausse alerte, attaque réelle, apaisement.',
  ],
  '2': [
    'Nommer l’émotion : la peur, l’angoisse ou la terreur, si possible en notant qu’elle croît.',
    'Citation possible : « J’aurais crié de frayeur » (l.5).',
    'Citation possible : « Le sang me montait à la tête. Je sentais mon cœur battre » (l.8).',
    'Citation possible : « tout commençait à me faire mal tellement ma tension était aiguë » (l.8-9).',
    'Citation possible : « Des gouttes de sueur me coulaient entre les omoplates » (l.11).',
    'Citation possible : « Je m’attendais à recevoir un coup de feu d’une seconde à l’autre » (l.14).',
    'Valoriser l’idée que la peur se manifeste par le corps, de façon involontaire.',
    'La consigne exige DEUX citations : une seule ne vaut que des points partiels.',
  ],
  '3': [
    'Répétition de « Rien » (l.15 à 19), avec gradation par « Toujours rien » : l’attente se prolonge sans rien confirmer.',
    'Phrases très courtes, parfois d’un seul mot, isolées : rythme haché, souffle coupé.',
    'Points de suspension répétés (l.19-20) : perception incertaine, pensée inachevée.',
    'Bascule au présent (l.19-20) : immédiateté, la scène se vit en direct.',
    'Monologue intérieur et phrases nominales d’alerte (« Attention. », « Mais si… ») : la pensée est donnée brute.',
    'Verbes de perception auditive : dans le noir, l’ouïe reste le seul sens disponible.',
    'La consigne exige DEUX éléments, chacun NOMMÉ et ANALYSÉ. Un procédé cité sans son effet ne vaut pas le point plein.',
  ],
  '4': [
    'Il raisonne : entendre l’ennemi prouve qu’il est moins proche qu’il ne le croyait (l.21-22).',
    'Il préfère un ennemi identifié à un ennemi invisible — « je ne suis plus en tête à tête dans le noir avec cet ennemi invisible » (l.22).',
    'Il évacue la tension physiquement — « je pousse un soupir de soulagement » (l.20-21).',
    'Il redevient acteur — « Les autres peuvent venir, je les attends, prêt à tirer » (l.24).',
    'Il cherche la cause réelle du bruit et la trouve : la pointe de sa baïonnette (l.25 et suivantes).',
    'Il se parle à lui-même avec autodérision — « Pauvre Blaise, me dis-je […] tu as eu une sacrée frousse ! » (l.32).',
    'La consigne exige DEUX éléments, chacun appuyé sur une citation.',
  ],
  '5': [
    'Modalisateurs d’incertitude : « J’avais l’impression qu’un homme avait bougé » (l.1-2), « dont j’ai cru deviner la présence » (l.22-23), « Ils doivent être deux ou trois » (l.20), « que je prenais pour » (l.27).',
    'Ces modalisateurs contredisent des affirmations de certitude jamais vérifiées : « j’étais sûr qu’un homme était là » (l.3-4), « J’étais sûr qu’il était là » (l.10).',
    'Question rhétorique adressée à lui-même : « Étais-je victime d’une illusion des sens ? » (l.3).',
    'Négations en cascade : « Je ne voyais rien, je n’entendais rien, je ne percevais rien » (l.5-6), relayées par la répétition de « Rien ».',
    'Négation lexicale : « cet ennemi invisible » (l.22) — l’ennemi n’est jamais vu ni décrit.',
    'L’ennemi est désigné par des pronoms flous et changeants (« un homme », « il », « on », « ils ») : sa réalité même est instable.',
    'Retournement final : le bruit venait de la baïonnette, mais un coup de feu bien réel part aussitôt (l.33) — le doute est levé puis relancé.',
    'La consigne exige TROIS éléments distincts, chacun justifié par une citation.',
  ],
  '6': [
    'Même contexte historique : soldat français de 14-18, reconnaissable au casque, à la capote et au fusil.',
    'Même situation : un homme seul, plaqué au sol, arme en main, en position d’affût — écho à « Je collai mon oreille au sol » (l.18) et « prêt à tirer » (l.24).',
    'Même tension physique, lisible sur le visage en gros plan — écho à « ma tension était aiguë » (l.9) et « Des gouttes de sueur me coulaient entre les omoplates » (l.11).',
    'Cadrage au ras du sol : le spectateur adopte le point de vue du soldat, comme le récit à la première personne impose celui du narrateur.',
    'L’ennemi est absent du cadre : la menace reste hors champ, exactement comme « cet ennemi invisible » (l.22).',
    'NUANCE valorisable : le photogramme est diurne, alors que la scène du texte se passe la nuit.',
    'NUANCE valorisable : l’image est fixe et muette — elle ne rend ni le son (« un bruit d’herbe froissée »), ni la durée de l’attente, ni le monologue intérieur.',
    'NUANCE valorisable : le film est une fiction de 1957, le texte un témoignage vécu.',
    'La consigne exige au moins DEUX arguments, chacun appuyé sur le texte ET sur un élément précis de l’image.',
    'Les trois NUANCES ne sont pas exigibles : la formulation « dans quelle mesure » les appelle, mais aucun corrigé consulté ne les mentionne. À valoriser en bonus, pas à sanctionner.',
  ],
  '7a': [
    'Premier verbe conjugué : « entends » (j’entends), verbe entendre.',
    'Second verbe conjugué : « s’approche » (On s’approche), verbe s’approcher.',
    'Pour les deux : mode indicatif, temps présent.',
    'PIÈGE : « rampant » est un participe présent, donc une forme NON conjuguée — il ne doit pas figurer dans la réponse.',
    '« Mais si… » ne contient aucun verbe.',
    'Répartition suggérée : 1 pt pour relever correctement les deux verbes, 1 pt pour le mode et le temps.',
  ],
  '7b': [
    'ACCEPTER indifféremment : présent de narration, présent d’énonciation, ou présent d’actualité.',
    'Ce qui est attendu, c’est l’EFFET, quelle que soit l’étiquette : immédiateté, simultanéité entre l’action et sa perception, le lecteur vit la scène en direct.',
    'Valoriser la rupture avec le récit au passé, qui dramatise le moment.',
    'ATTENTION, question litigieuse : les trois corrigés consultés donnent trois étiquettes différentes. Accorder le point dès que l’effet d’immédiateté est formulé, sans exiger une dénomination précise.',
  ],
  '8a': [
    'Classe grammaticale : pronom personnel de la 3e personne du pluriel, employé comme complément.',
    'Il reprend le groupe nominal « Les autres » de la phrase précédente (reprise anaphorique), pour éviter la répétition.',
    'PIÈGE : ce n’est pas un article défini ici — c’est la reprise anaphorique qui doit être perçue.',
  ],
  '8b': [
    'Fonction : complément d’objet direct (COD) du verbe « attends ».',
    'Accepter « complément du verbe attendre ». Mentionner le verbe régisseur est un plus, pas une exigence.',
  ],
  '9a': [
    'Préfixe « in- » : privatif, exprime la négation, « qui n’est pas ».',
    'Radical « -vis- » : du latin videre / visus, l’idée de voir.',
    'Suffixe « -ible » : exprime la possibilité, « qui peut être ».',
    'La consigne demande d’IDENTIFIER (découper) et de NOMMER (préfixe, radical, suffixe) : les deux opérations comptent, environ 0,5 pt par élément.',
  ],
  '9b': [
    'Sens : qui ne peut pas être vu. Il doit être reconstruit à partir des trois éléments (in- + voir + possibilité).',
    'Mots de la même famille acceptés : visible, invisibilité, vision, visuel, visionner, viseur, visibilité, vue, télévision, visualiser.',
    'PIÈGE À REFUSER : « imperceptible » n’est PAS de la même famille — son radical est percept-, pas vis-. C’est un synonyme construit sur le même modèle, ce qui n’est pas la même chose.',
    'Répartition suggérée : environ 1 pt pour le sens justifié, 0,5 pt pour le mot de la même famille.',
  ],
};

// Question 7b : le moteur peut accepter plusieurs formulations sans qu'un
// professeur ait a arbitrer copie par copie.
const EQUIVALENCES = {
  '7b': ['présent de narration', 'présent d’énonciation', 'présent d’actualité', 'présent de vérité immédiate'],
};

// Reecriture : « je » -> « nous » sur le passage l.24-28. Chaque forme se
// verifie directement sur le passage stocke dans brevet_reecriture_config.
// Les points totalisent 10, les deux pieges valant 1,5.
const REECRITURE = [
  { cle: 'attends', forme_originale: 'je les attends', forme_attendue: 'nous les attendons', transformation: 'Accord du verbe au présent, 1re personne du pluriel.', points: 1 },
  { cle: 'pret', forme_originale: 'prêt à tirer', forme_attendue: 'prêts à tirer', transformation: 'Accord de l’adjectif au pluriel. PIÈGE fréquent.', points: 1.5 },
  { cle: 'attention', forme_originale: 'toute mon attention', forme_attendue: 'toute notre attention', transformation: 'Déterminant possessif au pluriel.', points: 1 },
  { cle: 'index', forme_originale: 'mon index', forme_attendue: 'notre index', transformation: 'Déterminant possessif au pluriel.', points: 1 },
  { cle: 'rends_compte', forme_originale: 'je me rends compte', forme_attendue: 'nous nous rendons compte', transformation: 'Verbe pronominal : le pronom réfléchi change AUSSI. PIÈGE fréquent.', points: 1.5 },
  { cle: 'main', forme_originale: 'ma main', forme_attendue: 'notre main', transformation: 'Déterminant possessif au pluriel.', points: 1 },
  { cle: 'prenais', forme_originale: 'je prenais', forme_attendue: 'nous prenions', transformation: 'Imparfait, 1re personne du pluriel.', points: 1 },
  { cle: 'vers_moi', forme_originale: 'vers moi', forme_attendue: 'vers nous', transformation: 'Pronom tonique au pluriel.', points: 1 },
  { cle: 'baionnette', forme_originale: 'ma baïonnette', forme_attendue: 'notre baïonnette', transformation: 'Déterminant possessif au pluriel.', points: 1 },
];

// Formes que l'eleve ne doit PAS toucher. Elles ne sont pas des items notes :
// elles servent de garde-fou pour le correcteur.
const INVARIANTS = ['tremble', 'était causé', 'rampant', 'placé', 'foulée'];

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
  `bareme_versions?exam_id=eq.${examen.id}&select=id,version,statut&order=cree_le.desc&limit=1`,
);
if (!version) {
  console.error('Aucune version de barème.');
  process.exit(1);
}
if (version.statut !== 'draft') {
  console.error(`Version « ${version.statut} » : on n’écrit pas sur un barème verrouillé.`);
  process.exit(1);
}

const questions = await rest(
  `bareme_questions?bareme_version_id=eq.${version.id}&select=id,numero,sous_numero,max_points&order=ordre`,
);
const cle = (q) => `${q.numero}${q.sous_numero ?? ''}`;

console.log(`\n${examen.titre}`);
console.log(`Barème ${version.version} (${version.statut})\n`);

if (DEFAIRE) {
  for (const q of questions) {
    await rest(`bareme_questions?id=eq.${q.id}`, 'PATCH', {
      elements_attendus: [],
      reponses_equivalentes: [],
    });
  }
  await rest(`brevet_reecriture_items?bareme_version_id=eq.${version.id}`, 'DELETE');
  const apres = await rest('rpc/brevet_verifier', 'POST', { p_version: version.id });
  console.log(`Corrigé retiré. Blocages : ${(apres.blocages ?? []).length}`);
  process.exit(0);
}

const sansCorrige = questions.filter((q) => !CORRIGE[cle(q)]);
const sommeReecriture = REECRITURE.reduce((s, r) => s + r.points, 0);

for (const q of questions) {
  const elements = CORRIGE[cle(q)];
  console.log(`  Q${cle(q).padEnd(3)} ${String(q.max_points).padStart(4)} pts  ${elements ? `${elements.length} éléments` : '❌ RIEN'}`);
}
console.log(`\n  Réécriture : ${REECRITURE.length} formes, ${sommeReecriture} / 10 points`);
console.log(`  Invariants signalés au correcteur : ${INVARIANTS.join(', ')}`);

if (sansCorrige.length) {
  console.error(`\n${sansCorrige.length} question(s) sans corrigé. Rien n’a été écrit.`);
  process.exit(1);
}
if (Math.abs(sommeReecriture - 10) > 0.001) {
  console.error(`\nLa réécriture totalise ${sommeReecriture} au lieu de 10. Rien n’a été écrit.`);
  process.exit(1);
}

if (!APPLIQUER) {
  console.log('\nAucune écriture. Ajoute --apply pour poser cette proposition.');
  process.exit(0);
}

for (const q of questions) {
  const corps = { elements_attendus: CORRIGE[cle(q)] };
  if (EQUIVALENCES[cle(q)]) corps.reponses_equivalentes = EQUIVALENCES[cle(q)];
  await rest(`bareme_questions?id=eq.${q.id}`, 'PATCH', corps);
}
console.log(`\n  ✓ ${questions.length} questions pourvues d’éléments attendus`);

// On remplace, on n'upserte pas : meme raison que pour la dictee, la
// contrainte unique ne couvre pas les colonnes nullables.
await rest(`brevet_reecriture_items?bareme_version_id=eq.${version.id}`, 'DELETE');
await rest(
  'brevet_reecriture_items',
  'POST',
  REECRITURE.map((r, i) => ({
    bareme_version_id: version.id,
    cle: r.cle,
    ordre: i,
    forme_originale: r.forme_originale,
    forme_attendue: r.forme_attendue,
    transformation: r.transformation,
    points: r.points,
    variantes_admises: [],
    commentaire: null,
  })),
);
console.log(`  ✓ ${REECRITURE.length} formes de réécriture, ${sommeReecriture} points`);

await rest(`bareme_versions?id=eq.${version.id}`, 'PATCH', {
  commentaire:
    'PROPOSITION NON VALIDÉE, posée le 2026-08-09. Reconstituée à partir du sujet officiel ' +
    '26GENFRQGCME1 et d’un corrigé d’éditeur recoupé contre le texte. Le ministère ne publie ' +
    'aucune grille de correction du DNB : rien ici n’est officiel. À relire par un professeur ' +
    'avant tout usage réel. Question 7b litigieuse : trois corrigés, trois étiquettes.',
});

const controles = await rest('rpc/brevet_verifier', 'POST', { p_version: version.id });
const blocages = controles.blocages ?? [];
const avertis = controles.avertissements ?? [];
console.log(`\nBlocages : ${blocages.length}`);
for (const b of blocages) console.log(`  ✗ ${b.code} — ${b.message}`);
console.log(`Avertissements : ${avertis.length}`);
for (const a of avertis.slice(0, 3)) console.log(`  · ${a.code}`);
if (avertis.length > 3) console.log(`  · … ${avertis.length - 3} autres`);
