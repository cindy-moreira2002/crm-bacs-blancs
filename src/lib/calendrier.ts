/**
 * QUAND COMMENCENT LES VRAIS BACS BLANCS.
 *
 * Fichier volontairement SANS aucun import : serveur et client le lisent tel
 * quel.
 *
 * Les Matinées du Bac ne vendent leur première session qu'en **novembre 2026**.
 * Tout ce qui est daté avant — sessions, inscriptions, e-mails programmés — a
 * été créé pour faire tourner la chaîne de bout en bout : ce sont des essais,
 * pas des épreuves.
 *
 * La distinction n'est pas cosmétique. Sans elle, l'administration présente
 * « session le 6 septembre · dans 22 jours » comme une échéance, réclame
 * d'ouvrir la matière aux professeurs, et fait passer pour urgent un bac blanc
 * qui n'aura jamais lieu. La seule question qui vaut sur une session d'essai
 * est : « est-ce que la chaîne fonctionne ? »
 *
 * Quand la première vraie session sera vendue, il suffira de changer la date
 * ci-dessous — et de purger les fausses lignes avant la mise en service, pour
 * ne pas abîmer la réputation d'expéditeur chez Brevo.
 */

/** Premier jour où une session en base est une VRAIE session vendue. */
export const PREMIER_VRAI_BAC_BLANC = '2026-11-01';

/**
 * Cette session est-elle un essai ?
 *
 * On compare des dates au format `AAAA-MM-JJ`, en texte : pas de fuseau
 * horaire, donc pas de session qui change de camp selon l'heure de la journée.
 */
export function estSessionDeTest(dateEpreuve: string | null | undefined): boolean {
  if (!dateEpreuve) return false;
  return dateEpreuve.slice(0, 10) < PREMIER_VRAI_BAC_BLANC;
}

/** « novembre 2026 », pour l'afficher sans le recalculer partout. */
export const LIBELLE_PREMIERE_SESSION = new Date(`${PREMIER_VRAI_BAC_BLANC}T00:00:00`)
  .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
