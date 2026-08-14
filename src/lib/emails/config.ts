/**
 * E-mails automatiques — configuration et catalogue des messages.
 *
 * Ce fichier ne fait AUCUN appel réseau et ne lit aucune base : il ne
 * contient que des constantes et des fonctions pures. Il peut donc être
 * importé partout, y compris par les tests hors ligne.
 *
 * L'adresse d'expédition est volontairement une variable d'environnement :
 * on démarre sur `matineesdubac@gmail.com` (validée dans Brevo en deux
 * clics), et on bascule un jour sur `bonjour@matineesdubac.fr` — meilleure
 * délivrabilité, obligatoire pour les campagnes marketing — sans toucher
 * une seule ligne de code.
 */

// --- Identité de l'expéditeur ----------------------------------------

export const EXPEDITEUR = {
  nom: process.env.EMAILS_EXPEDITEUR_NOM?.trim() || 'Les Matinées du Bac',
  email: process.env.EMAILS_EXPEDITEUR?.trim() || 'matineesdubac@gmail.com',
};

/** Adresse réellement consultée, où atterrissent les réponses des familles. */
export const REPONSE_A =
  process.env.EMAILS_REPONSE_A?.trim() || EXPEDITEUR.email;

/** Adresse de contact affichée en bas des messages. */
export const SUPPORT_EMAIL =
  process.env.EMAILS_SUPPORT?.trim() || REPONSE_A;

// --- Adresses du site -------------------------------------------------

/** Racine publique du site, sans barre oblique finale. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://crm-bacs-blancs-ihgf.vercel.app'
).replace(/\/+$/, '');

/** Site vitrine — utilisé par les messages marketing. */
export const VITRINE_URL = (
  process.env.NEXT_PUBLIC_VITRINE_URL?.trim() || 'https://matineesdubac.fr'
).replace(/\/+$/, '');

export const URL_ESPACE_ELEVE = `${SITE_URL}/espace-eleve`;
export const URL_ESPACE_PROF = `${SITE_URL}/espace-prof`;
export const URL_INSCRIPTION = `${SITE_URL}/inscription`;

// L'adresse du salon d'un élève ne se calcule plus ici : elle est lue sur son
// inscription (`discord_salon_id`) et construite par `lienSalon`, dans
// src/lib/discord/config.ts. Une adresse dérivée de l'identifiant d'inscription
// pointait vers une salle qui n'existait pas forcément — et, depuis Discord,
// vers une salle où l'élève n'est de toute façon pas autorisé.

// --- Couleurs de la marque (reprises de l'espace élève) ---------------

export const MARQUE = {
  violet: '#581C87',
  violetClair: '#7C3AED',
  bleu: '#2563EB',
  or: '#D97706',
  texte: '#111827',
  gris: '#6B7280',
  bordure: '#E5E7EB',
  fondDoux: '#F9FAFB',
};

// --- Catalogue des messages ------------------------------------------

export type CategorieEmail = 'transactional' | 'marketing';
export type RoleDestinataire = 'eleve' | 'parent' | 'prof' | 'admin' | 'prospect';

export type StatutEmail =
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'bloque';

/** Tous les types de messages que le système sait produire. */
export const TYPES_EMAIL = [
  // A — inscription
  'preinscription_recue',
  'inscription_confirmee',
  'paiement_confirme',
  'paiement_attente',
  // Déclenché par le classeur de suivi financier, jamais par le planificateur.
  'facture_disponible',
  // B — avant la session
  'infos_pratiques',
  'lien_visio',
  'rappel_veille',
  'dernier_rappel',
  'session_modifiee',
  'session_annulee',
  // C — après la session
  'session_terminee',
  'correction_disponible',
  'demande_avis',
  // D — relances commerciales
  'relance_interet',
  'fermeture_inscriptions',
  'nouvelle_session',
  'retour_ancien_participant',
  // E — professeurs
  'prof_affectation',
  'prof_infos_session',
  'prof_rappel_veille',
  'prof_session_modifiee',
  'prof_session_annulee',
  'prof_copies_disponibles',
  'prof_rappel_correction',
  'prof_mission_terminee',
] as const;

export type TypeEmail = (typeof TYPES_EMAIL)[number];

export function estTypeEmail(valeur: string): valeur is TypeEmail {
  return (TYPES_EMAIL as readonly string[]).includes(valeur);
}

// --- Libellés lisibles pour l'administration --------------------------

export const LIBELLE_TYPE: Record<TypeEmail, string> = {
  preinscription_recue: 'Demande reçue (préinscription)',
  inscription_confirmee: 'Inscription confirmée',
  paiement_confirme: 'Paiement confirmé',
  paiement_attente: 'Relance — paiement manquant',
  facture_disponible: 'Facture envoyée au parent',
  infos_pratiques: 'Informations pratiques',
  lien_visio: 'Lien de visioconférence',
  rappel_veille: 'Rappel la veille',
  dernier_rappel: 'Dernier rappel',
  session_modifiee: 'Session modifiée',
  session_annulee: 'Session annulée',
  session_terminee: 'Fin de session',
  correction_disponible: 'Correction disponible',
  demande_avis: 'Demande d’avis',
  relance_interet: 'Relance — intéressé non inscrit',
  fermeture_inscriptions: 'Fermeture des inscriptions',
  nouvelle_session: 'Nouvelle date ouverte',
  retour_ancien_participant: 'Retour d’un ancien participant',
  prof_affectation: 'Prof — affectation à une session',
  prof_infos_session: 'Prof — informations pratiques',
  prof_rappel_veille: 'Prof — rappel avant la session',
  prof_session_modifiee: 'Prof — session modifiée',
  prof_session_annulee: 'Prof — session annulée',
  prof_copies_disponibles: 'Prof — copies disponibles',
  prof_rappel_correction: 'Prof — correction à terminer',
  prof_mission_terminee: 'Prof — mission terminée',
};

export const LIBELLE_STATUT: Record<StatutEmail, string> = {
  pending: 'en attente',
  scheduled: 'programmé',
  processing: 'en cours d’envoi',
  sent: 'envoyé',
  delivered: 'délivré',
  failed: 'en échec',
  cancelled: 'annulé',
  bloque: 'bloqué — donnée manquante',
};

// --- Variables d'environnement ---------------------------------------

/** Variables indispensables pour envoyer. Manquantes → message clair, pas un 500. */
export function emailsManquant(): string[] {
  const manquants: string[] = [];
  if (!process.env.BREVO_API_KEY) manquants.push('BREVO_API_KEY');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) manquants.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) manquants.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.EMAILS_CRON_SECRET) manquants.push('EMAILS_CRON_SECRET');
  return manquants;
}

/**
 * Mode « répétition générale » : les e-mails sont construits, enregistrés et
 * visibles dans l'administration, mais AUCUN appel n'est fait à Brevo et
 * aucune vraie personne ne reçoit quoi que ce soit.
 * Activé par la variable EMAILS_DRY_RUN=1, ou par le réglage `envoi_actif`.
 */
export function dryRunParEnv(): boolean {
  const v = process.env.EMAILS_DRY_RUN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'oui';
}

/**
 * Adresses autorisées à recevoir en mode test (séparées par des virgules).
 * Sert au bouton « envoyer un test » de l'administration.
 */
export function adressesDeTest(): string[] {
  return (process.env.EMAILS_ADRESSES_TEST ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}
