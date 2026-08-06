/**
 * La file d'attente des e-mails : écrire, réserver, marquer.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Deux garde-fous vivent ici :
 *  1. **l'anti-doublon** — chaque message porte une `cle_idempotence` UNIQUE
 *     en base. Enfiler deux fois le même message n'insère qu'une ligne, quel
 *     que soit le nombre d'appels simultanés (c'est Postgres qui tranche, pas
 *     notre code) ;
 *  2. **le verrou** — réserver une tâche est un UPDATE conditionnel qui ne
 *     réussit que pour un seul appelant. Deux exécutions du cron qui se
 *     chevauchent ne peuvent donc pas envoyer le même message deux fois.
 */
import { emailsDb } from './client';
import { debutJourParis } from './temps';
import type { CategorieEmail, RoleDestinataire, StatutEmail, TypeEmail } from './config';

/** Une tâche telle qu'on la crée (avant insertion). */
export type TacheEmail = {
  type: TypeEmail;
  categorie: CategorieEmail;
  destinataire_email: string;
  destinataire_nom?: string | null;
  destinataire_role: RoleDestinataire;
  inscription_id?: string | null;
  session_id?: string | null;
  professeur_id?: string | null;
  copie_id?: string | null;
  preinscription_id?: string | null;
  cle_idempotence: string;
  /** Instant d'envoi souhaité (ISO). Dans le passé = « dès que possible ». */
  planifie_le: string;
  variables: Record<string, string>;
  declenche_par?: string;
};

/** Une ligne telle qu'elle vit en base. */
export type LigneEmail = TacheEmail & {
  id: string;
  statut: StatutEmail;
  envoye_le: string | null;
  brevo_message_id: string | null;
  tentatives: number;
  derniere_erreur: string | null;
  raison_blocage: string | null;
  sujet: string | null;
  ouvert_le: string | null;
  clique_le: string | null;
  verrou_le: string | null;
  test: boolean;
  created_at: string;
  updated_at: string;
};

const CHAMPS =
  'id, type, categorie, destinataire_email, destinataire_nom, destinataire_role, ' +
  'inscription_id, session_id, professeur_id, copie_id, preinscription_id, ' +
  'cle_idempotence, planifie_le, envoye_le, statut, brevo_message_id, tentatives, ' +
  'derniere_erreur, raison_blocage, variables, sujet, ouvert_le, clique_le, verrou_le, ' +
  'test, declenche_par, created_at, updated_at';

export const MAX_TENTATIVES = 4;
/** Une tâche « en cours » depuis plus longtemps que ça a été abandonnée en vol. */
const VERROU_PERIME_MS = 10 * 60_000;

// --- Écriture ---------------------------------------------------------

/**
 * Ajoute des tâches à la file. Les doublons (même clé d'idempotence) sont
 * silencieusement ignorés : c'est le comportement voulu, le planificateur
 * repasse toutes les 5 minutes sur les mêmes inscriptions.
 *
 * Renvoie le nombre de lignes réellement créées.
 */
export async function enfiler(taches: TacheEmail[]): Promise<number> {
  if (!taches.length) return 0;

  const lignes = taches.map((t) => ({
    ...t,
    destinataire_email: t.destinataire_email.trim().toLowerCase(),
    statut: (new Date(t.planifie_le).getTime() > Date.now() ? 'scheduled' : 'pending') as StatutEmail,
  }));

  const { data, error } = await emailsDb()
    .from('emails')
    .upsert(lignes, { onConflict: 'cle_idempotence', ignoreDuplicates: true })
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// --- Lecture ----------------------------------------------------------

/**
 * Les tâches dues, catégorie par catégorie.
 * Le moteur appelle d'abord `transactional` : quand le quota Brevo est
 * serré, un lien de visioconférence passe toujours avant une relance.
 */
export async function tachesDues(categorie: CategorieEmail, limite: number): Promise<LigneEmail[]> {
  if (limite <= 0) return [];
  const { data, error } = await emailsDb()
    .from('emails')
    .select(CHAMPS)
    .eq('categorie', categorie)
    .in('statut', ['pending', 'scheduled'])
    .lte('planifie_le', new Date().toISOString())
    .order('planifie_le', { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as unknown as LigneEmail[];
}

export async function lireEmail(id: string): Promise<LigneEmail | null> {
  const { data, error } = await emailsDb().from('emails').select(CHAMPS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as LigneEmail) ?? null;
}

/**
 * Réserve une tâche pour ce processus. Renvoie null si quelqu'un d'autre
 * l'a prise entre-temps — auquel cas on passe simplement à la suivante.
 */
export async function verrouiller(id: string): Promise<LigneEmail | null> {
  const { data, error } = await emailsDb()
    .from('emails')
    .update({ statut: 'processing', verrou_le: new Date().toISOString() })
    .eq('id', id)
    .in('statut', ['pending', 'scheduled'])
    .select(CHAMPS);
  if (error) throw error;
  const lignes = (data ?? []) as unknown as LigneEmail[];
  return lignes[0] ?? null;
}

/** Remet en file les tâches restées « en cours » après un plantage. */
export async function libererVerrousPerimes(): Promise<number> {
  const limite = new Date(Date.now() - VERROU_PERIME_MS).toISOString();
  const { data, error } = await emailsDb()
    .from('emails')
    .update({ statut: 'pending', verrou_le: null })
    .eq('statut', 'processing')
    .lt('verrou_le', limite)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// --- Marquage ---------------------------------------------------------

export async function marquerEnvoye(id: string, messageId: string | null, sujet: string): Promise<void> {
  const { error } = await emailsDb()
    .from('emails')
    .update({
      statut: 'sent',
      envoye_le: new Date().toISOString(),
      brevo_message_id: messageId,
      sujet,
      derniere_erreur: null,
      verrou_le: null,
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Échec. Une erreur définitive (adresse invalide, clé refusée) arrête tout
 * de suite ; une erreur temporaire replanifie avec un délai croissant.
 */
export async function marquerEchec(
  ligne: LigneEmail,
  message: string,
  permanent: boolean,
): Promise<void> {
  const tentatives = (ligne.tentatives ?? 0) + 1;
  const abandon = permanent || tentatives >= MAX_TENTATIVES;

  // 5 min, 20 min, 45 min : on laisse le temps à Brevo de respirer.
  const attenteMin = [5, 20, 45][Math.min(tentatives - 1, 2)];

  const { error } = await emailsDb()
    .from('emails')
    .update({
      statut: abandon ? 'failed' : 'scheduled',
      tentatives,
      derniere_erreur: message.slice(0, 1000),
      planifie_le: abandon
        ? ligne.planifie_le
        : new Date(Date.now() + attenteMin * 60_000).toISOString(),
      verrou_le: null,
    })
    .eq('id', ligne.id);
  if (error) throw error;
}

/**
 * Donnée manquante : on ne remplace jamais par « undefined », on bloque et
 * on affiche pourquoi dans l'administration.
 */
export async function marquerBloque(id: string, raison: string): Promise<void> {
  const { error } = await emailsDb()
    .from('emails')
    .update({ statut: 'bloque', raison_blocage: raison.slice(0, 500), verrou_le: null })
    .eq('id', id);
  if (error) throw error;
}

export async function annuler(id: string, raison: string): Promise<boolean> {
  const { data, error } = await emailsDb()
    .from('emails')
    .update({ statut: 'cancelled', raison_blocage: raison.slice(0, 500), verrou_le: null })
    .eq('id', id)
    .in('statut', ['pending', 'scheduled', 'bloque', 'failed'])
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Annule tous les messages encore en attente pour une inscription. */
export async function annulerPourInscription(inscriptionId: string, raison: string): Promise<number> {
  const { data, error } = await emailsDb()
    .from('emails')
    .update({ statut: 'cancelled', raison_blocage: raison.slice(0, 500) })
    .eq('inscription_id', inscriptionId)
    .in('statut', ['pending', 'scheduled'])
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Annule les messages en attente d'un type donné pour une session. */
export async function annulerPourSession(
  sessionId: string,
  types: TypeEmail[],
  raison: string,
): Promise<number> {
  const { data, error } = await emailsDb()
    .from('emails')
    .update({ statut: 'cancelled', raison_blocage: raison.slice(0, 500) })
    .eq('session_id', sessionId)
    .in('type', types)
    .in('statut', ['pending', 'scheduled'])
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Remet un message échoué ou bloqué en file (action manuelle de l'admin). */
export async function reprogrammer(id: string): Promise<boolean> {
  const { data, error } = await emailsDb()
    .from('emails')
    .update({
      statut: 'pending',
      planifie_le: new Date().toISOString(),
      tentatives: 0,
      derniere_erreur: null,
      raison_blocage: null,
      verrou_le: null,
    })
    .eq('id', id)
    .in('statut', ['failed', 'bloque', 'cancelled'])
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// --- Quota ------------------------------------------------------------

export type EtatQuota = {
  envoyesAujourdhui: number;
  programmesAujourdhui: number;
  limite: number;
  marge: number;
  restantTransactionnel: number;
  restantMarketing: number;
  alerte: string | null;
};

/**
 * Le calcul du quota, isolé et sans base : c'est la règle métier, elle est
 * testable telle quelle.
 *
 * Les e-mails indispensables peuvent aller jusqu'à la limite ; le marketing
 * s'arrête à la limite moins la marge, pour qu'une campagne ne mange jamais
 * les liens de visioconférence du jour.
 */
export function calculerQuota(
  envoyesAujourdhui: number,
  programmesAujourdhui: number,
  limite: number,
  marge: number,
): EtatQuota {
  const restantTransactionnel = Math.max(0, limite - envoyesAujourdhui);
  const restantMarketing = Math.max(0, limite - marge - envoyesAujourdhui);

  let alerte: string | null = null;
  if (restantTransactionnel === 0) {
    alerte = `Limite de ${limite} envois atteinte pour aujourd’hui. Les messages restants partiront demain.`;
  } else if (envoyesAujourdhui + programmesAujourdhui > limite) {
    alerte =
      `${envoyesAujourdhui} envoyés + ${programmesAujourdhui} en attente aujourd’hui : ` +
      `au-delà de la limite de ${limite}. Les relances commerciales seront décalées, ` +
      `les messages indispensables passent en premier.`;
  } else if (restantMarketing === 0) {
    alerte = `Marge de sécurité atteinte : plus aucune relance commerciale aujourd’hui (${envoyesAujourdhui}/${limite}).`;
  }

  return {
    envoyesAujourdhui,
    programmesAujourdhui,
    limite,
    marge,
    restantTransactionnel,
    restantMarketing,
    alerte,
  };
}

/** Où en est-on des 300 envois quotidiens de l'offre gratuite ? */
export async function etatQuota(limite: number, marge: number): Promise<EtatQuota> {
  const db = emailsDb();
  const debut = debutJourParis(new Date()).toISOString();
  const finJournee = new Date(new Date(debut).getTime() + 86_400_000).toISOString();

  const [envoyes, programmes] = await Promise.all([
    db
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('statut', ['sent', 'delivered'])
      .gte('envoye_le', debut),
    db
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('statut', ['pending', 'scheduled', 'processing'])
      .lt('planifie_le', finJournee),
  ]);

  return calculerQuota(envoyes.count ?? 0, programmes.count ?? 0, limite, marge);
}

// --- Contacts (consentement, désinscription, rejets) ------------------

export type Contact = {
  email: string;
  nom: string | null;
  role: string;
  consentement_marketing: boolean;
  desinscrit: boolean;
  bounce: boolean;
  plainte: boolean;
};

export async function lireContact(email: string): Promise<Contact | null> {
  const { data, error } = await emailsDb()
    .from('email_contacts')
    .select('email, nom, role, consentement_marketing, desinscrit, bounce, plainte')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data as Contact) ?? null;
}

export async function lireContacts(emails: string[]): Promise<Map<string, Contact>> {
  const uniques = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!uniques.length) return new Map();
  const { data, error } = await emailsDb()
    .from('email_contacts')
    .select('email, nom, role, consentement_marketing, desinscrit, bounce, plainte')
    .in('email', uniques);
  if (error) throw error;
  const m = new Map<string, Contact>();
  for (const c of (data ?? []) as Contact[]) m.set(c.email, c);
  return m;
}

/** Crée ou complète un contact, sans jamais écraser un refus déjà exprimé. */
export async function noterContact(params: {
  email: string;
  nom?: string | null;
  role?: string;
  consentementMarketing?: boolean;
  source?: string;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  if (!email) return;
  const existant = await lireContact(email);

  const ligne: Record<string, unknown> = {
    email,
    nom: params.nom ?? existant?.nom ?? null,
    role: params.role ?? existant?.role ?? 'eleve',
  };

  // Un consentement ne s'ajoute que s'il est donné ; il ne se retire jamais
  // tout seul, et une désinscription reste définitive tant qu'elle n'est pas
  // levée explicitement par la personne elle-même.
  if (params.consentementMarketing && !existant?.desinscrit) {
    ligne.consentement_marketing = true;
    ligne.consentement_le = new Date().toISOString();
    ligne.consentement_source = params.source ?? 'site';
  }

  const { error } = await emailsDb().from('email_contacts').upsert(ligne, { onConflict: 'email' });
  if (error) throw error;
}

export async function desinscrire(email: string, raison = 'demande de la personne'): Promise<void> {
  const { error } = await emailsDb().from('email_contacts').upsert(
    {
      email: email.trim().toLowerCase(),
      desinscrit: true,
      desinscrit_le: new Date().toISOString(),
      consentement_marketing: false,
      bounce_raison: raison,
    },
    { onConflict: 'email' },
  );
  if (error) throw error;
}

export async function marquerBounce(email: string, raison: string): Promise<void> {
  const { error } = await emailsDb().from('email_contacts').upsert(
    {
      email: email.trim().toLowerCase(),
      bounce: true,
      bounce_le: new Date().toISOString(),
      bounce_raison: raison.slice(0, 300),
    },
    { onConflict: 'email' },
  );
  if (error) throw error;
}

export async function marquerPlainte(email: string): Promise<void> {
  const { error } = await emailsDb().from('email_contacts').upsert(
    {
      email: email.trim().toLowerCase(),
      plainte: true,
      plainte_le: new Date().toISOString(),
      desinscrit: true,
      desinscrit_le: new Date().toISOString(),
      consentement_marketing: false,
    },
    { onConflict: 'email' },
  );
  if (error) throw error;
}

/**
 * Cette adresse peut-elle recevoir ce message ?
 * Règle : une adresse rejetée définitivement ne reçoit plus rien ; une
 * personne désinscrite ne reçoit plus de marketing mais continue de recevoir
 * les informations indispensables à une inscription en cours.
 */
export function refusDEnvoi(contact: Contact | null | undefined, categorie: CategorieEmail): string | null {
  if (!contact) return categorie === 'marketing' ? 'consentement marketing absent' : null;
  if (contact.bounce) return 'adresse rejetée définitivement par le serveur du destinataire';
  if (contact.plainte) return 'la personne a signalé nos messages comme indésirables';
  if (categorie === 'marketing') {
    if (contact.desinscrit) return 'personne désinscrite des messages commerciaux';
    if (!contact.consentement_marketing) return 'consentement marketing absent';
  }
  return null;
}
