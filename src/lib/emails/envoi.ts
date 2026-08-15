/**
 * Le moteur d'envoi : il prend les messages dus, vérifie une dernière fois
 * que tout est cohérent, puis appelle Brevo.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Ce qu'il garantit :
 *  - **aucun doublon** : chaque message est réservé par un UPDATE conditionnel
 *    avant d'être envoyé ; deux exécutions simultanées ne peuvent pas prendre
 *    la même ligne ;
 *  - **aucune donnée périmée** : les variables sont RECONSTRUITES à partir de
 *    la base au moment de l'envoi, pas au moment de la planification. Une
 *    session déplacée, annulée ou déjà passée est détectée ici ;
 *  - **aucun e-mail incomplet** : s'il manque une variable obligatoire, le
 *    message passe en « bloqué » avec le nom de la donnée manquante ;
 *  - **la limite quotidienne est respectée**, les messages indispensables
 *    passant avant les relances commerciales.
 */
import { emailsDb } from './client';
import { chargerReglages, envoiDesactive, validationManuelle, type Reglages } from './reglages';
import { construireEmail } from './modeles';
import { envoyerViaBrevo } from './brevo';
import { urlDesinscription } from './desinscription';
import { dryRunParEnv, type TypeEmail } from './config';
import {
  CHAMPS_INSCRIPTION,
  CHAMPS_SESSION,
  sessionAnnulee,
  variablesEleve,
  type LigneInscription,
  type LigneSession,
} from './donnees';
import { verifierAvantEnvoi } from './planificateur';
import {
  annuler,
  etatQuota,
  libererVerrousPerimes,
  lireContacts,
  marquerBloque,
  marquerEchec,
  marquerEnvoye,
  noterContact,
  refusDEnvoi,
  tachesDues,
  verrouiller,
  type Contact,
  type EtatQuota,
  type LigneEmail,
} from './file';

export type DetailEnvoi = {
  id: string;
  type: string;
  destinataire: string;
  resultat: 'envoyé' | 'bloqué' | 'annulé' | 'échec' | 'reporté' | 'simulé';
  message?: string;
  sujet?: string;
};

export type RapportEnvoi = {
  dryRun: boolean;
  /** `true` quand rien n'est parti parce que chaque message attend un feu vert. */
  attenteValidation: boolean;
  examines: number;
  envoyes: number;
  bloques: number;
  annules: number;
  echecs: number;
  reportes: number;
  quota: EtatQuota;
  details: DetailEnvoi[];
  avertissements: string[];
};

/** Anciens drapeaux de la table inscriptions, pour ne jamais doubler l'Apps Script. */
const DRAPEAU_LEGACY: Partial<Record<TypeEmail, string>> = {
  inscription_confirmee: 'email_envoye',
  rappel_veille: 'rappel_j1_envoye',
  dernier_rappel: 'rappel_h1_envoye',
};

export async function traiterFile(options?: {
  limite?: number;
  dryRun?: boolean;
}): Promise<RapportEnvoi> {
  const reglages = await chargerReglages(true);
  // Relecture avant départ : le moteur automatique prépare tout et n'envoie
  // rien. Une simulation explicite (`dryRun: true`) reste une simulation.
  const attenteValidation = options?.dryRun === undefined && validationManuelle(reglages);
  const dryRun =
    options?.dryRun ?? (dryRunParEnv() || envoiDesactive(reglages) || attenteValidation);
  const limite = options?.limite ?? 60;
  const avertissements: string[] = [];

  if (!dryRun) {
    const liberes = await libererVerrousPerimes();
    if (liberes) avertissements.push(`${liberes} message(s) restés bloqués en cours d'envoi ont été remis en file.`);
  }

  const quota = await etatQuota(reglages.quota_quotidien, reglages.quota_marge);
  if (quota.alerte) avertissements.push(quota.alerte);
  if (attenteValidation) {
    avertissements.push(
      'Validation manuelle active : les messages sont préparés et attendent ton bouton « Valider et envoyer ». Rien ne part tout seul.',
    );
  }

  const details: DetailEnvoi[] = [];

  // Les messages indispensables d'abord : quand le quota est serré, un lien
  // de visioconférence passe avant une relance commerciale.
  const lotTransactionnel = await tachesDues(
    'transactional',
    Math.min(limite, dryRun ? limite : quota.restantTransactionnel),
  );
  const restePourMarketing = Math.max(
    0,
    Math.min(limite - lotTransactionnel.length, dryRun ? limite : quota.restantMarketing),
  );
  const lotMarketing = await tachesDues('marketing', restePourMarketing);

  const lot = [...lotTransactionnel, ...lotMarketing];
  if (!lot.length) {
    return {
      dryRun,
      attenteValidation,
      examines: 0,
      envoyes: 0,
      bloques: 0,
      annules: 0,
      echecs: 0,
      reportes: 0,
      quota,
      details,
      avertissements,
    };
  }

  const contacts = await lireContacts(lot.map((l) => l.destinataire_email));
  const contexte = await chargerContexteLignes(lot);

  let envoyes = 0;
  let bloques = 0;
  let annules = 0;
  let echecs = 0;
  let reportes = 0;

  for (const ligne of lot) {
    const prepare = await preparer(ligne, reglages, contexte, contacts.get(ligne.destinataire_email));

    if (prepare.action === 'annuler') {
      if (!dryRun) await annuler(ligne.id, prepare.raison);
      annules++;
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'annulé',
        message: prepare.raison,
      });
      continue;
    }

    if (prepare.action === 'bloquer') {
      if (!dryRun) await marquerBloque(ligne.id, prepare.raison);
      bloques++;
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'bloqué',
        message: prepare.raison,
      });
      continue;
    }

    if (prepare.action === 'reporter') {
      if (!dryRun) await reporter(ligne.id, prepare.quand);
      reportes++;
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'reporté',
        message: prepare.raison,
      });
      continue;
    }

    if (dryRun) {
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'simulé',
        sujet: prepare.sujet,
      });
      continue;
    }

    // Réservation : si quelqu'un d'autre l'a prise, on passe.
    const reservee = await verrouiller(ligne.id);
    if (!reservee) continue;

    const envoi = await envoyerViaBrevo({
      destinataire: ligne.destinataire_email,
      destinataireNom: ligne.destinataire_nom,
      sujet: prepare.sujet,
      html: prepare.html,
      texte: prepare.texte,
      desinscriptionUrl: prepare.desinscriptionUrl,
      etiquettes: [ligne.type, ligne.categorie],
    });

    if (envoi.ok) {
      await marquerEnvoye(ligne.id, envoi.messageId, prepare.sujet);
      await apresEnvoi(ligne);
      envoyes++;
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'envoyé',
        sujet: prepare.sujet,
      });
    } else {
      await marquerEchec(reservee, envoi.message, envoi.permanent);
      echecs++;
      details.push({
        id: ligne.id,
        type: ligne.type,
        destinataire: ligne.destinataire_email,
        resultat: 'échec',
        message: envoi.message,
      });
    }
  }

  return {
    dryRun,
    attenteValidation,
    examines: lot.length,
    envoyes,
    bloques,
    annules,
    echecs,
    reportes,
    quota,
    details,
    avertissements,
  };
}

// --- Préparation d'un message ----------------------------------------

type Preparation =
  | { action: 'envoyer'; sujet: string; html: string; texte: string; desinscriptionUrl: string | null }
  | { action: 'bloquer'; raison: string }
  | { action: 'annuler'; raison: string }
  | { action: 'reporter'; quand: Date; raison: string };

type ContexteLignes = {
  inscriptions: Map<string, LigneInscription>;
  sessions: Map<string, LigneSession>;
};

async function chargerContexteLignes(lot: LigneEmail[]): Promise<ContexteLignes> {
  const db = emailsDb();
  const idsInscription = [...new Set(lot.map((l) => l.inscription_id).filter(Boolean))] as string[];
  const idsSession = [...new Set(lot.map((l) => l.session_id).filter(Boolean))] as string[];

  const [insc, sess] = await Promise.all([
    idsInscription.length
      ? db.from('inscriptions').select(CHAMPS_INSCRIPTION).in('id', idsInscription)
      : Promise.resolve({ data: [], error: null }),
    idsSession.length
      ? db.from('sessions_bacs_blancs').select(CHAMPS_SESSION).in('id', idsSession)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const inscriptions = new Map<string, LigneInscription>();
  for (const i of ((insc.data ?? []) as unknown as LigneInscription[])) inscriptions.set(i.id, i);
  const sessions = new Map<string, LigneSession>();
  for (const s of ((sess.data ?? []) as unknown as LigneSession[])) sessions.set(s.id, s);

  return { inscriptions, sessions };
}

async function preparer(
  ligne: LigneEmail,
  reglages: Reglages,
  ctx: ContexteLignes,
  contact: Contact | undefined,
): Promise<Preparation> {
  // 1. Le destinataire accepte-t-il ce type de message ?
  const refus = refusDEnvoi(contact, ligne.categorie);
  if (refus) return { action: 'annuler', raison: refus };

  // 2. Variables : on repart de la base, jamais de ce qui a été figé il y a
  //    cinq jours. C'est ce qui garantit qu'une date modifiée est bien la
  //    date envoyée.
  let variables = { ...(ligne.variables ?? {}) } as Record<string, string>;

  if (ligne.inscription_id) {
    const inscription = ctx.inscriptions.get(ligne.inscription_id);
    if (!inscription) {
      return { action: 'annuler', raison: 'inscription supprimée' };
    }
    const session = ligne.session_id ? ctx.sessions.get(ligne.session_id) ?? null : null;

    const verdict = verifierAvantEnvoi({
      type: ligne.type as TypeEmail,
      inscription,
      session,
      reglages,
    });
    if (verdict.action === 'annuler') return { action: 'annuler', raison: verdict.raison };
    if (verdict.action === 'reporter') {
      return { action: 'reporter', quand: verdict.quand, raison: verdict.raison };
    }

    const fraiches = variablesEleve({
      inscription,
      session,
      instructionsPaiement: reglages.paiement_instructions,
      montantDefaut: reglages.paiement_montant_defaut,
      lienAvis: reglages.lien_avis_url,
    });
    // Les valeurs propres à l'événement (ancienne date, motif) restent celles
    // qui ont été figées : elles décrivent le changement, pas l'état actuel.
    variables = {
      ...fraiches,
      ...pick(variables, ['old_value', 'new_value', 'change_reason', 'grade', 'correction_delay']),
    };
    if (ligne.destinataire_role === 'parent' && ligne.variables?.first_name) {
      variables.first_name = ligne.variables.first_name;
    }
  } else if (ligne.session_id) {
    // Message prof : on vérifie au moins que la session n'a pas été annulée.
    const session = ctx.sessions.get(ligne.session_id) ?? null;
    const typesAnnulation: string[] = ['prof_session_annulee', 'session_annulee'];
    if (sessionAnnulee(session) && !typesAnnulation.includes(ligne.type)) {
      return { action: 'annuler', raison: 'session annulée' };
    }
  }

  // 3. Construction. Une variable obligatoire manquante bloque l'envoi.
  const desinscriptionUrl =
    ligne.categorie === 'marketing' ? urlDesinscription(ligne.destinataire_email) : null;

  const construit = construireEmail(ligne.type, variables, { desinscriptionUrl });
  if (!construit.ok) {
    return { action: 'bloquer', raison: construit.raison };
  }

  return {
    action: 'envoyer',
    sujet: construit.sujet,
    html: construit.html,
    texte: construit.texte,
    desinscriptionUrl,
  };
}

function pick(o: Record<string, string>, cles: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cles) if (o[c]) out[c] = o[c];
  return out;
}

async function reporter(id: string, quand: Date): Promise<void> {
  const { error } = await emailsDb()
    .from('emails')
    .update({ statut: 'scheduled', planifie_le: quand.toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Après un envoi réussi : on lève l'ancien drapeau correspondant sur
 * l'inscription. Si l'Apps Script tourne encore, il verra que le message est
 * déjà parti et ne le renverra pas.
 */
async function apresEnvoi(ligne: LigneEmail): Promise<void> {
  try {
    await noterContact({
      email: ligne.destinataire_email,
      nom: ligne.destinataire_nom ?? null,
      role: ligne.destinataire_role,
    });
  } catch (err) {
    console.error('⚠️ Contact non mis à jour :', err);
  }

  const colonne = DRAPEAU_LEGACY[ligne.type as TypeEmail];
  if (!colonne || !ligne.inscription_id) return;
  try {
    await emailsDb()
      .from('inscriptions')
      .update({ [colonne]: true })
      .eq('id', ligne.inscription_id);
  } catch (err) {
    console.error(`⚠️ Drapeau ${colonne} non mis à jour :`, err);
  }
}

// --- Envoi unitaire (administration) ---------------------------------

/**
 * Envoie UNE ligne précise, tout de suite. Utilisé par les boutons
 * « renvoyer » et « envoyer un test » de l'administration.
 *
 * Le destinataire n'est jamais choisi librement : c'est celui de la ligne,
 * ou une adresse de test explicitement autorisée. On ne peut donc pas
 * envoyer par erreur les informations privées d'un élève à quelqu'un d'autre.
 */
export async function envoyerMaintenant(
  ligne: LigneEmail,
  options?: { destinataireTest?: string },
): Promise<{ ok: boolean; message: string; sujet?: string }> {
  const reglages = await chargerReglages(true);
  const contacts = await lireContacts([options?.destinataireTest ?? ligne.destinataire_email]);
  const ctx = await chargerContexteLignes([ligne]);
  const prepare = await preparer(
    ligne,
    reglages,
    ctx,
    contacts.get((options?.destinataireTest ?? ligne.destinataire_email).toLowerCase()),
  );

  if (prepare.action !== 'envoyer') {
    const raison = 'raison' in prepare ? prepare.raison : 'message non envoyable';
    return { ok: false, message: raison };
  }

  if (envoiDesactive(reglages) || dryRunParEnv()) {
    return {
      ok: false,
      message: 'Mode test actif : rien n’a été envoyé. Passe « Envoi réel actif » sur « oui » pour envoyer.',
      sujet: prepare.sujet,
    };
  }

  const envoi = await envoyerViaBrevo({
    destinataire: options?.destinataireTest ?? ligne.destinataire_email,
    destinataireNom: ligne.destinataire_nom,
    sujet: options?.destinataireTest ? `[TEST] ${prepare.sujet}` : prepare.sujet,
    html: prepare.html,
    texte: prepare.texte,
    desinscriptionUrl: prepare.desinscriptionUrl,
    etiquettes: [ligne.type, options?.destinataireTest ? 'test' : ligne.categorie],
  });

  if (!envoi.ok) return { ok: false, message: envoi.message, sujet: prepare.sujet };

  if (!options?.destinataireTest) {
    await marquerEnvoye(ligne.id, envoi.messageId, prepare.sujet);
    await apresEnvoi(ligne);
  }
  return { ok: true, message: 'Envoyé.', sujet: prepare.sujet };
}

/** Prévisualisation : construit le message sans rien envoyer ni écrire. */
export async function previsualiser(
  ligne: LigneEmail,
): Promise<{ ok: boolean; sujet?: string; html?: string; texte?: string; raison?: string; variables: Record<string, string> }> {
  const reglages = await chargerReglages();
  const ctx = await chargerContexteLignes([ligne]);
  const contacts = await lireContacts([ligne.destinataire_email]);
  const prepare = await preparer(ligne, reglages, ctx, contacts.get(ligne.destinataire_email));

  if (prepare.action !== 'envoyer') {
    return {
      ok: false,
      raison: 'raison' in prepare ? prepare.raison : 'non envoyable',
      variables: (ligne.variables ?? {}) as Record<string, string>,
    };
  }
  return {
    ok: true,
    sujet: prepare.sujet,
    html: prepare.html,
    texte: prepare.texte,
    variables: (ligne.variables ?? {}) as Record<string, string>,
  };
}
