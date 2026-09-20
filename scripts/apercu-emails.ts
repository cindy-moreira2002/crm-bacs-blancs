/**
 * Génère un aperçu HTML de TOUS les modèles d'e-mails, hors ligne.
 *
 *   npm run apercu:emails            → écrit dans ./apercu-emails/
 *   npm run apercu:emails /tmp/xyz   → écrit ailleurs
 *
 * Sert à relire les textes et à vérifier le rendu sur ordinateur et sur
 * téléphone sans envoyer le moindre message.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { construireEmail, MODELES } from '../src/lib/emails/modeles/index';
import { LIBELLE_TYPE, type TypeEmail } from '../src/lib/emails/config';
import { VARIABLES_EXEMPLE } from '../src/lib/emails/exemples';

const dossier = process.argv[2] || join(process.cwd(), 'apercu-emails');
mkdirSync(dossier, { recursive: true });

const VARIABLES = VARIABLES_EXEMPLE;

const liens: string[] = [];
let erreurs = 0;

for (const type of Object.keys(MODELES)) {
  const c = construireEmail(type, VARIABLES, {
    desinscriptionUrl: 'https://espaces.matineesdubac.fr/desinscription?jeton=exemple',
  });
  if (!c.ok) {
    console.error(`❌ ${type} : ${c.raison}`);
    erreurs++;
    continue;
  }
  const fichier = `${type}.html`;
  writeFileSync(join(dossier, fichier), c.html, 'utf8');
  writeFileSync(join(dossier, `${type}.txt`), `Objet : ${c.sujet}\n\n${c.texte}`, 'utf8');
  liens.push(
    `<li><a href="${fichier}">${LIBELLE_TYPE[type as TypeEmail] ?? type}</a> ` +
      `<span style="color:#6B7280">— ${c.sujet}</span></li>`,
  );
}

writeFileSync(
  join(dossier, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Aperçu des e-mails</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.7}
h1{color:#581C87}li{margin:6px 0}a{color:#7C3AED}</style>
<h1>Aperçu des e-mails — Les Matinées du Bac</h1>
<p>${liens.length} modèles. Aucun envoi : ce sont des fichiers locaux.</p>
<ul>${liens.join('')}</ul>`,
  'utf8',
);

console.log(`\n${liens.length} aperçus écrits dans ${dossier}`);
console.log(`Ouvre ${join(dossier, 'index.html')}\n`);
if (erreurs) process.exit(1);
