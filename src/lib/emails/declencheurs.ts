/**
 * Les déclencheurs — le pont entre « il s'est passé quelque chose sur le
 * site » et « un message doit partir ».
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Règle d'or : un déclencheur **met en file**, il n'envoie pas. Une page
 * rafraîchie, un webhook reçu deux fois ou un double clic ne peuvent donc pas
 * produire deux e-mails : la clé d'idempotence tranche en base.
 *
 * Ils sont volontairement tolérants aux pannes : si la mise en file échoue,
 * on journalise et on laisse le planificateur (toutes les 5 minutes) rattraper.
 */
import { emailsDb } from './client';
import { chargerReglages } from './reglages';
import { enfiler, annulerPourSession, noterContact, type TacheEmail } from './file';
import {
  CHAMPS_INSCRIPTION,
  CHAMPS_SESSION,
  cleSession,
  empreinteSession,
  lireEmpreinte,
  sessionAnnulee,
  type ContextePlanification,
  type LigneCopie,
  type LigneInscription,
  type LigneProf,
  type LignePreinscription,
  type LigneSession,
} from './donnees';
import {
  planifier,
  planifierEleve,
  planifierProf,
  tachesChangementSession,
} from './planificateur';
import { chargerContexte, variablesPreinscription } from './donnees';
import type { TypeEmail } from './config';

/**
 * Passe complète : on relit tout l'état du site et on met en file ce qui
 * manque. C'est le filet de sécurité du système — même si un déclencheur a
 * échoué (panne réseau, erreur ponctuelle), le message finit par être créé
 * ici, au plus tard 5 minutes après.
 */
export async function synchroniserTout(maintenant = new Date()): Promise<{
  proposees: number;
  creees: number;
  changementsSession: number;
}> {
  // D'abord les changements de session : ils annulent des messages devenus
  // faux avant que la planification n'en propose de nouveaux.
  const changementsSession = await detecterChangementsSession();

  const reglages = await chargerReglages(true);
  const ctx = await chargerContexte(maintenant);
  const taches = planifier(ctx, { reglages, maintenant });
  const creees = await enfiler(taches);
  return { proposees: taches.length, creees, changementsSession };
}

/**
 * Détecte les sessions déplacées ou annulées, même quand la modification a
 * été faite directement dans Supabase.
 *
 * Chaque session mémorise l'empreinte (date + horaires + statut) de son
 * dernier état notifié. Au premier passage on pose simplement le repère, sans
 * rien envoyer : personne ne reçoit de « changement » pour une session qui
 * n'a pas changé.
 */
export async function detecterChangementsSession(): Promise<number> {
  const db = emailsDb();
  const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from('sessions_bacs_blancs')
    .select(CHAMPS_SESSION)
    .gte('date_epreuve', depuis)
    .limit(200);
  if (error) return 0;

  let notifies = 0;
  for (const brute of ((data ?? []) as unknown as LigneSession[])) {
    const actuelle = empreinteSession(brute);
    if (brute.derniere_notif_empreinte === actuelle) continue;

    if (!brute.derniere_notif_empreinte) {
      // Premier passage : on pose le repère, on n'envoie rien.
      await db
        .from('sessions_bacs_blancs')
        .update({ derniere_notif_empreinte: actuelle })
        .eq('id', brute.id);
      continue;
    }

    await apresChangementSession({
      sessionId: brute.id,
      ancienne: lireEmpreinte(brute.derniere_notif_empreinte),
      annulation: sessionAnnulee(brute),
    });
    notifies++;
  }
  return notifies;
}

/** Contexte minimal pour planifier une seule inscription. */
function miniContexte(
  session: LigneSession | null,
  copies: LigneCopie[] = [],
  emailEleve?: string | null,
): ContextePlanification {
  const sessions = new Map<string, LigneSession>();
  const sessionsParCle = new Map<string, LigneSession>();
  if (session) {
    sessions.set(session.id, session);
    sessionsParCle.set(cleSession(session.matiere, session.date_epreuve), session);
  }
  const copiesParEmail = new Map<string, LigneCopie[]>();
  if (emailEleve && copies.length) copiesParEmail.set(emailEleve.trim().toLowerCase(), copies);
  return {
    inscriptions: [],
    sessions,
    sessionsParCle,
    coachs: [],
    profs: new Map(),
    copiesParEmail,
    preinscriptions: [],
  };
}

async function chargerInscription(id: string): Promise<{
  inscription: LigneInscription;
  session: LigneSession | null;
} | null> {
  const db = emailsDb();
  const { data, error } = await db
    .from('inscriptions')
    .select(CHAMPS_INSCRIPTION)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const inscription = data as unknown as LigneInscription;

  let session: LigneSession | null = null;
  if (inscription.session_id) {
    const r = await db.from('sessions_bacs_blancs').select(CHAMPS_SESSION).eq('id', inscription.session_id).maybeSingle();
    session = (r.data as unknown as LigneSession) ?? null;
  } else if (inscription.matiere && inscription.date_epreuve) {
    const r = await db
      .from('sessions_bacs_blancs')
      .select(CHAMPS_SESSION)
      .eq('matiere', inscription.matiere)
      .eq('date_epreuve', inscription.date_epreuve)
      .maybeSingle();
    session = (r.data as unknown as LigneSession) ?? null;
  }
  return { inscription, session };
}

/**
 * Recalcule et met en file tous les messages dus à UNE inscription.
 * Appelé après chaque événement la concernant : création, paiement,
 * correction publiée, copie reçue.
 */
export async function synchroniserInscription(
  inscriptionId: string,
  declenchePar = 'declencheur',
): Promise<number> {
  const charge = await chargerInscription(inscriptionId);
  if (!charge) return 0;
  const reglages = await chargerReglages();

  const taches = planifierEleve(
    charge.inscription,
    miniContexte(charge.session),
    reglages,
    new Date(),
    new Date(reglages.actif_depuis),
  ).map((t) => ({ ...t, declenche_par: declenchePar }));

  if (!taches.length) return 0;
  return enfiler(taches);
}

/** Nouvelle inscription : confirmation immédiate, puis toute la suite. */
export async function apresInscription(inscriptionId: string, email?: string, nom?: string): Promise<number> {
  if (email) {
    try {
      await noterContact({ email, nom: nom ?? null, role: 'eleve', source: 'inscription' });
    } catch (err) {
      console.error('⚠️ Contact non enregistré :', err);
    }
  }
  return synchroniserInscription(inscriptionId, 'inscription');
}

/** Paiement confirmé côté serveur par l'administratrice. */
export async function apresPaiementConfirme(inscriptionId: string): Promise<number> {
  return synchroniserInscription(inscriptionId, 'paiement');
}

/** La copie de l'élève est arrivée. */
export async function apresCopieRecue(inscriptionId: string): Promise<number> {
  return synchroniserInscription(inscriptionId, 'copie');
}

/** La correction est publiée et accessible à l'élève. */
export async function apresCorrectionPubliee(inscriptionId: string): Promise<number> {
  return synchroniserInscription(inscriptionId, 'correction');
}

/** Nouvelle préinscription venue du site vitrine. */
export async function apresPreinscription(p: LignePreinscription): Promise<number> {
  try {
    await noterContact({
      email: p.email,
      nom: [p.prenom, p.nom].filter(Boolean).join(' '),
      role: 'prospect',
      consentementMarketing: p.consentement_marketing,
      source: 'preinscription',
    });
  } catch (err) {
    console.error('⚠️ Contact non enregistré :', err);
  }

  const variables = variablesPreinscription(p);
  const tache: TacheEmail = {
    type: 'preinscription_recue',
    categorie: 'transactional',
    destinataire_email: p.email,
    destinataire_nom: variables.student_name || p.prenom,
    destinataire_role: 'prospect',
    preinscription_id: p.id,
    session_id: p.session_id,
    cle_idempotence: `preinscription_recue:preinscription:${p.id}`,
    planifie_le: new Date().toISOString(),
    variables,
    declenche_par: 'preinscription',
  };
  return enfiler([tache]);
}

/** Un professeur vient d'être affecté à une session. */
export async function apresAffectationProf(
  sessionId: string,
  professeurId: string,
  remuneration: number | null = null,
): Promise<number> {
  const db = emailsDb();
  const reglages = await chargerReglages();

  const [sess, prof, eleves] = await Promise.all([
    db.from('sessions_bacs_blancs').select(CHAMPS_SESSION).eq('id', sessionId).maybeSingle(),
    db.from('professeurs').select('id, prenom, nom, email, matieres, statut_compte').eq('id', professeurId).maybeSingle(),
    db.from('inscriptions').select(CHAMPS_INSCRIPTION).eq('session_id', sessionId),
  ]);

  const session = (sess.data as unknown as LigneSession) ?? null;
  const professeur = (prof.data as unknown as LigneProf) ?? null;
  if (!session || !professeur) return 0;

  const taches = planifierProf(
    professeur,
    session,
    ((eleves.data ?? []) as unknown as LigneInscription[]),
    miniContexte(session),
    reglages,
    new Date(),
    new Date(), // affecté maintenant
    new Date(reglages.actif_depuis),
    remuneration,
  );
  return enfiler(taches);
}

/**
 * Une session change de date ou d'horaire, ou est annulée.
 *
 * Un changement important redéclenche un e-mail même si les informations
 * pratiques étaient déjà parties : la clé d'idempotence intègre l'empreinte
 * du nouvel horaire.
 */
export async function apresChangementSession(params: {
  sessionId: string;
  ancienne?: { date_epreuve: string; heure_debut: string | null } | null;
  annulation?: boolean;
  motif?: string;
}): Promise<number> {
  const db = emailsDb();
  const reglages = await chargerReglages();

  const { data: sessionData } = await db
    .from('sessions_bacs_blancs')
    .select(CHAMPS_SESSION)
    .eq('id', params.sessionId)
    .maybeSingle();
  const session = (sessionData as unknown as LigneSession) ?? null;
  if (!session) return 0;

  const [eleves, coachs] = await Promise.all([
    db.from('inscriptions').select(CHAMPS_INSCRIPTION).eq('session_id', params.sessionId),
    db.from('session_coachs').select('professeur_id, remuneration, statut').eq('session_id', params.sessionId),
  ]);

  const idsProfs = ((coachs.data ?? []) as { professeur_id: string; statut: string }[])
    .filter((c) => c.statut === 'confirme')
    .map((c) => c.professeur_id);

  let profs: { prof: LigneProf; remuneration: number | null }[] = [];
  if (idsProfs.length) {
    const { data } = await db
      .from('professeurs')
      .select('id, prenom, nom, email, matieres, statut_compte')
      .in('id', idsProfs);
    const remuneration = new Map(
      ((coachs.data ?? []) as { professeur_id: string; remuneration: number | null }[]).map((c) => [
        c.professeur_id,
        c.remuneration,
      ]),
    );
    profs = ((data ?? []) as unknown as LigneProf[]).map((p) => ({
      prof: p,
      remuneration: remuneration.get(p.id) ?? null,
    }));
  }

  const annulation = Boolean(params.annulation);

  // Une session annulée n'a plus besoin de rappels : on nettoie la file pour
  // que l'administration ne montre pas des messages qui ne partiront jamais.
  if (annulation) {
    const aAnnuler: TypeEmail[] = [
      'infos_pratiques',
      'lien_visio',
      'rappel_veille',
      'dernier_rappel',
      'prof_infos_session',
      'prof_rappel_veille',
    ];
    await annulerPourSession(params.sessionId, aAnnuler, 'session annulée');
  }

  const taches = tachesChangementSession({
    session,
    ancienne: params.ancienne ?? null,
    eleves: ((eleves.data ?? []) as unknown as LigneInscription[]),
    profs,
    annulation,
    motif: params.motif,
    reglages,
    empreinte: annulation ? `annulee-${empreinteSession(session)}` : empreinteSession(session),
  });

  const cree = await enfiler(taches);

  // On mémorise l'état notifié : le prochain changement sera détecté comme tel.
  await db
    .from('sessions_bacs_blancs')
    .update({ derniere_notif_empreinte: empreinteSession(session) })
    .eq('id', params.sessionId);

  return cree;
}
