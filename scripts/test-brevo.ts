/**
 * Test de bout en bout de l'envoi Brevo — sans passer par le navigateur.
 *
 *   npm run test:brevo -- mon@adresse.fr
 *
 * Prend le premier message de la file, le construit avec le vrai moteur
 * (mêmes modèles, mêmes variables que la production) et l'envoie à l'adresse
 * donnée, sujet préfixé « [TEST] ».
 *
 * Ce que le script NE fait PAS : marquer le message comme envoyé. La ligne
 * reste programmée pour son vrai destinataire — exactement comme le bouton
 * « test » de /admin/emails, dont il emprunte le chemin de code.
 *
 * Nécessite BREVO_API_KEY dans .env.local (jamais dans le dépôt).
 */
import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local', override: true });

async function principal() {
  const destinataire = (process.argv[2] ?? '').trim().toLowerCase();
  if (!destinataire.includes('@')) {
    console.error('Usage : npm run test:brevo -- mon@adresse.fr');
    process.exit(1);
  }

  const { emailsManquant } = await import('../src/lib/emails/config');
  const manquants = emailsManquant();
  if (manquants.length) {
    console.error('❌ Variables manquantes en local :', manquants.join(', '));
    console.error('   Ajoute-les dans .env.local, puis relance.');
    process.exit(1);
  }

  const { emailsDb } = await import('../src/lib/emails/client');
  const { envoyerMaintenant } = await import('../src/lib/emails/envoi');

  const { data, error } = await emailsDb()
    .from('emails')
    .select('*')
    .order('planifie_le', { ascending: true })
    .limit(1);

  if (error) {
    console.error('❌ Lecture de la file impossible :', error.message);
    process.exit(1);
  }
  const ligne = (data ?? [])[0];
  if (!ligne) {
    console.error('❌ La file est vide : rien à tester.');
    process.exit(1);
  }

  console.log(`Message choisi : ${ligne.type} (statut ${ligne.statut}, prévu le ${ligne.planifie_le})`);
  console.log(`Envoi du test à ${destinataire}…`);

  const res = await envoyerMaintenant(ligne, { destinataireTest: destinataire });

  console.log(res.ok ? '✅' : '❌', res.message);
  if (res.sujet) console.log('   Sujet :', `[TEST] ${res.sujet}`);

  // Preuve que la file n'a pas bougé : le message doit rester tel quel.
  const { data: apres } = await emailsDb()
    .from('emails')
    .select('statut, envoye_le')
    .eq('id', ligne.id)
    .maybeSingle();
  console.log('   La ligne d’origine reste :', apres?.statut, apres?.envoye_le ? `(envoyée le ${apres.envoye_le})` : '(non envoyée)');

  process.exit(res.ok ? 0 : 1);
}

principal().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
