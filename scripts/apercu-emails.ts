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

const dossier = process.argv[2] || join(process.cwd(), 'apercu-emails');
mkdirSync(dossier, { recursive: true });

const VARIABLES: Record<string, string> = {
  first_name: 'Léa',
  student_name: 'Léa Martin',
  parent_name: 'Mme Martin',
  subject_name: 'Français',
  session_date: 'samedi 6 septembre 2026',
  session_date_court: 'sam. 6 sept.',
  session_date_iso: '2026-09-06',
  start_time: '9 h 00',
  end_time: '13 h 00',
  connection_time: '8 h 45',
  teacher_name: 'Camille Durand',
  student_space_url: 'https://crm-bacs-blancs-ihgf.vercel.app/espace-eleve',
  teacher_space_url: 'https://crm-bacs-blancs-ihgf.vercel.app/espace-prof',
  // Forme réelle d'une adresse de salle Discord : serveur, puis salon.
  video_room_url: 'https://discord.com/channels/000000000000000000/111111111111111111',
  inscription_url: 'https://crm-bacs-blancs-ihgf.vercel.app/inscription',
  correction_url: 'https://crm-bacs-blancs-ihgf.vercel.app/espace-eleve',
  survey_url: 'https://exemple.fr/avis',
  support_email: 'matineesdubac@gmail.com',
  site_url: 'https://matineesdubac.fr',
  inscription_ref: 'A1B2C3D4',
  amount: '29',
  payment_reference: 'VIR-2026-014',
  payment_status: 'en_attente',
  payment_status_label: 'en attente',
  payment_instructions: 'Virement à effectuer sur le compte des Matinées du Bac — référence : A1B2C3D4.',
  old_value: 'samedi 6 septembre 2026 à 9 h 00',
  new_value: 'samedi 20 septembre 2026 à 9 h 00',
  change_reason: 'Le professeur est empêché ce jour-là.',
  student_count: '8',
  copy_count: '8',
  deadline_date: 'samedi 13 septembre 2026',
  remuneration: '40',
  grade: '14/20',
  places_restantes: '3',
};

const liens: string[] = [];
let erreurs = 0;

for (const type of Object.keys(MODELES)) {
  const c = construireEmail(type, VARIABLES, {
    desinscriptionUrl: 'https://crm-bacs-blancs-ihgf.vercel.app/desinscription?jeton=exemple',
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
