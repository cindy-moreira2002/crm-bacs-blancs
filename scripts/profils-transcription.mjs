/**
 * Profils de transcription par matiere.
 *
 *   node scripts/profils-transcription.mjs --sql    (ecrit le SQL a coller)
 *   node scripts/profils-transcription.mjs --apply  (upsert par API, table deja creee)
 *
 * Une matiere sans profil garde le comportement par defaut de
 * `transcribe-french-copy` : modele du secret ANTHROPIC_MODEL_TRANSCRIPTION
 * (claude-haiku-4-5) et consignes generiques. Un profil permet deux choses,
 * sans toucher au code de la fonction :
 *   - imposer un modele plus capable pour les matieres ou une erreur de
 *     lecture est fatale (exposant, indice, unite, equation chimique) ;
 *   - ajouter des consignes de lecture propres a la matiere.
 *
 * Regle de fond : la transcription ne doit JAMAIS deviner un signe
 * scientifique. Tout doute sur un chiffre, un exposant, un indice, une unite
 * ou une formule impose une relecture humaine — mieux vaut une copie signalee
 * qu'une note fausse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------
//  Convention de notation, commune aux matieres scientifiques.
//  Elle est ecrite ici ET rappelee au correcteur (garde-fous des grilles) :
//  les deux etapes doivent lire le meme alphabet.
// ---------------------------------------------------------------------
const NOTATION = `CONVENTION DE NOTATION — tu l'appliques sans exception, c'est ce que le correcteur attend :
- Puissance / exposant : accent circonflexe. 10^-2, 10^3, x^2, m^-1. Jamais de caractere Unicode en exposant.
- Indice : tiret bas. C_B, V_E, v_0, t_1/2, E_c. Pour une formule chimique, garde l'ecriture usuelle sur la ligne : H2SO4, CO2, Cu2+, HO-.
- Multiplication : x entoure d'espaces quand l'eleve ecrit une croix ( 1,0 x 10^-2 ), point median quand il ecrit un point ( 9,81 . 2 ).
- Fraction ecrite sur deux etages : parentheses et barre oblique, ( numerateur ) / ( denominateur ).
- Racine : sqrt( ... ). Integrale, somme, derivee : ecris-les en toutes lettres entre crochets si le symbole est ambigu.
- Vecteur (fleche au-dessus d'une lettre) : vec(F), vec(v), vec(a).
- Fleche de reaction chimique : -> pour une reaction totale, <=> pour un equilibre. Conserve les etats physiques : (aq), (s), (l), (g).
- Unites : recopie exactement ce que l'eleve a ecrit, sans convertir, sans completer, sans corriger. Une unite absente reste absente : c'est une information pour le correcteur.
- Separateur decimal : recopie tel quel, virgule ou point.
- Signes : conserve chaque signe moins, chaque parenthese, chaque barre de valeur absolue.`;

const REGLES_COMMUNES = `REGLES DE LECTURE — priorite absolue a l'exactitude :
- Tu ne corriges RIEN. Un calcul faux, une unite oubliee, une equation non ajustee, un signe inverse : tu recopies l'erreur telle quelle. C'est le correcteur qui juge, pas toi.
- Tu ne completes RIEN. Si l'eleve ecrit "C =" et s'arrete, tu ecris "C =" et tu t'arretes.
- Tu ne reorganises RIEN. L'ordre des lignes, des questions et des ratures est celui de la copie. Une reponse ecrite en marge se transcrit a l'endroit ou elle apparait, precedee de [marge].
- Un passage rature et reecrit : tu transcris la version conservee, et tu signales la rature par [rature] si elle porte sur un resultat.
- Distinguer 1 et 7, 0 et 6, 5 et S, 2 et Z, la virgule et le point : en cas de doute, tu ne tranches pas.

SCHEMAS, GRAPHIQUES, MONTAGES ET TABLEAUX :
- Tu ne decris JAMAIS un dessin, une courbe ou un montage, et tu ne l'interpretes pas. Tu ecris [SCHEMA non transcrit], [GRAPHIQUE non transcrit] ou [MONTAGE non transcrit] a l'endroit exact ou il apparait.
- En revanche tu transcris tout le TEXTE qui l'accompagne : titre, legende, noms des axes avec leurs unites, valeurs graduees, annotations, noms des especes ou du materiel. Ce texte-la compte pour la note.
- Un tableau de mesures se transcrit ligne par ligne, avec ses en-tetes et ses unites, une ligne de texte par ligne du tableau, colonnes separees par " | ".

QUAND EXIGER UNE RELECTURE HUMAINE — tu passes requires_human_review a true, sans hesiter, des qu'UNE de ces situations se produit :
- un chiffre, un exposant, un indice, un signe, une unite ou une formule chimique est ambigu ;
- un resultat numerique est illisible ou partiellement efface ;
- la copie renvoie a un schema ou un graphique pour justifier une reponse ;
- une page est coupee, floue, penchee ou dans le desordre.
Chaque cas va aussi dans uncertain_passages avec la lecture la plus probable, la lecture concurrente, et ce que le doute change. Une transcription signalee coute une minute au professeur ; une transcription fausse coute une note fausse a l'eleve.`;

export const PROFILS = [
  {
    matiere: 'physique-chimie',
    model: 'claude-sonnet-5',
    status: 'active',
    version: 1,
    system_prompt:
      `Cette copie est une copie de PHYSIQUE-CHIMIE de terminale. Elle contient des formules, des puissances de dix, des indices, des unites et des equations chimiques : une seule de ces choses mal lue fausse la note ET le dossier remis a l'eleve.\n\n` +
      `${NOTATION}\n\n${REGLES_COMMUNES}`,
    user_prompt:
      "Relis une seconde fois chaque ligne qui contient un nombre, un exposant, un indice, une unite ou une formule chimique avant de la valider. Ce sont les seules lignes ou une erreur de lecture change la note.",
  },
  {
    matiere: 'maths',
    model: 'claude-sonnet-5',
    status: 'active',
    version: 1,
    system_prompt:
      `Cette copie est une copie de MATHEMATIQUES de terminale. Elle contient des expressions algebriques, des exposants, des indices, des fractions et des symboles : une seule de ces choses mal lue fausse la note ET le dossier remis a l'eleve.\n\n` +
      `${NOTATION}\n` +
      `- Suite : u_n, u_(n+1). Fonction : f(x), f'(x). Limite : [limite quand x tend vers +inf].\n` +
      `- Un raisonnement par recurrence, par l'absurde ou par disjonction de cas se transcrit avec ses etiquettes ecrites par l'eleve (Initialisation, Heredite, Conclusion...).\n\n` +
      `${REGLES_COMMUNES}`,
    user_prompt:
      "Relis une seconde fois chaque ligne de calcul avant de la valider : un exposant, un indice ou un signe mal lu transforme un raisonnement juste en raisonnement faux.",
  },
  {
    matiere: 'svt',
    model: 'claude-sonnet-5',
    status: 'active',
    version: 1,
    system_prompt:
      `Cette copie est une copie de SVT de terminale. Elle melange du texte redige, des resultats chiffres et surtout des SCHEMAS annotes : coupe d'organe, cellule, chromosome, montage experimental, electrophorese, arbre phylogenetique, coupe geologique, profil sismique. Ce sont les annotations et les legendes qui portent la note, jamais le dessin lui-meme.\n\n` +
      `${NOTATION}\n` +
      `- Genetique : un allele en italique ou souligne se transcrit tel quel entre crochets, [a] ; un genotype se note (A//a) et un phenotype [A]. Un croisement s'ecrit P1 x P2, les generations F1, F2.\n` +
      `- Biochimie et biologie : ADN, ARNm, ATP, CO2, O2, H2O gardent l'ecriture usuelle sur la ligne. Une sequence de nucleotides ou d'acides amines se recopie lettre a lettre, sans corriger, en conservant les espaces et le sens de lecture indique (5' -> 3').\n` +
      `- Geologie : les unites et les ordres de grandeur comptent (Ma, km, mW.m^-2, g.cm^-3). Une datation s'ecrit avec son unite telle qu'ecrite par l'eleve.\n\n` +
      `${REGLES_COMMUNES}\n\n` +
      `SCHEMAS DE SVT — le point decisif de cette matiere :\n` +
      `- Un schema, une coupe, un caryotype, un arbre ou un graphique n'est JAMAIS decrit ni interprete : tu ecris [SCHEMA non transcrit] a sa place exacte.\n` +
      `- Mais tu transcris integralement ce qui est ECRIT dessus : titre, legendes, fleches nommees, noms des structures, echelle, unites, axes, valeurs graduees, numeros de chromosomes, noms d'especes, noms de couches geologiques. Une legende par ligne, prefixee [legende].\n` +
      `- Une fleche qui relie deux elements nommes se transcrit [fleche] element de depart -> element d'arrivee, uniquement quand les deux noms sont ecrits par l'eleve. Si l'un des deux n'est pas ecrit, tu ne devines pas : requires_human_review.\n` +
      `- Un schema sans aucune annotation se signale tel quel : [SCHEMA non transcrit, aucune legende]. C'est une information pour le correcteur, pas une faute a masquer.\n` +
      `- Une reponse qui consiste uniquement en un schema (« voir schema ») impose requires_human_review : seul un humain peut juger un dessin.`,
    user_prompt:
      "Relis une seconde fois chaque legende de schema, chaque nom de structure et chaque valeur chiffree avant de valider : en SVT, ce sont les annotations, pas le dessin, qui portent les points. Tout schema invoque comme justification impose une relecture humaine.",
  },
];

// ---------------------------------------------------------------------
//  Sortie
// ---------------------------------------------------------------------
const hex = (s) => Buffer.from(s, 'utf8').toString('hex');
const txt = (s) => `convert_from(decode('${hex(s)}','hex'),'UTF8')`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

if (process.argv.includes('--sql')) {
  const L = [`-- =====================================================================
--  PROFILS DE TRANSCRIPTION PAR MATIERE
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller TOUT ce fichier > Run
--
--  A QUOI CA SERT : la transcription d'une copie manuscrite est faite par
--  defaut avec un modele economique (claude-haiku-4-5) et des consignes
--  generiques. C'est suffisant pour une dissertation, insuffisant pour une
--  copie scientifique ou un exposant mal lu fausse toute la chaine.
--  Cette table permet de choisir, PAR MATIERE et sans redeployer de code,
--  le modele et les consignes de lecture.
--
--  Une matiere sans ligne ici garde exactement le comportement d'avant.
--
--  Tout le texte accentue passe par convert_from(decode(...,'hex'),'UTF8') :
--  l'editeur SQL de Supabase abime l'UTF-8 colle depuis un Mac.
--  Idempotent : rejouer ce fichier ne casse rien.
-- =====================================================================

begin;

create table if not exists public.transcription_profiles (
  matiere       text primary key,
  model         text,
  system_prompt text,
  user_prompt   text,
  status        text not null default 'draft',
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Meme regime que les autres tables de reference : RLS active, aucune policy.
-- Le navigateur ne peut rien lire ni ecrire ; les Edge Functions passent avec
-- la cle service_role.
alter table public.transcription_profiles enable row level security;

commit;
`];

  L.push(`\n-- ---------------------------------------------------------------------\n--  LES ${PROFILS.length} PROFILS\n-- ---------------------------------------------------------------------\n\nbegin;\n`);
  for (const p of PROFILS) {
    L.push(`insert into public.transcription_profiles (matiere, model, system_prompt, user_prompt, status, version)
values (${lit(p.matiere)}, ${lit(p.model)}, ${txt(p.system_prompt)}, ${txt(p.user_prompt)}, ${lit(p.status)}, ${p.version})
on conflict (matiere) do update set
  model = excluded.model, system_prompt = excluded.system_prompt,
  user_prompt = excluded.user_prompt, status = excluded.status,
  version = excluded.version, updated_at = now();
`);
  }
  L.push('commit;\n');
  L.push(`\n-- ---------------------------------------------------------------------\n--  VERIFICATION — attendu : ${PROFILS.length} lignes, toutes en 'active'.\n-- ---------------------------------------------------------------------\n
select matiere, model, status, version, length(system_prompt) as taille_prompt
from public.transcription_profiles order by matiere;
`);

  const chemin = path.join(RACINE, 'supabase', 'sql', '19_profils_transcription.sql');
  fs.writeFileSync(chemin, L.join('\n'));
  console.log('SQL ecrit :', path.relative(RACINE, chemin));
}

if (process.argv.includes('--apply')) {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(RACINE, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (v) process.env[m[1]] = v;
    }
  }
  const url = (process.env.PIPELINE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const res = await fetch(`${url}/rest/v1/transcription_profiles?on_conflict=matiere`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(PROFILS),
  });
  console.log(res.ok
    ? `transcription_profiles : ${res.status} (${PROFILS.length} lignes)`
    : `echec ${res.status} — la table existe-t-elle ? Joue d'abord supabase/sql/19_profils_transcription.sql.\n${(await res.text()).slice(0, 300)}`);
}
