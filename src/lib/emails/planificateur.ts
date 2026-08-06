/**
 * Le planificateur : « qu'est-ce qui doit partir, et quand ? »
 *
 * Fonction PURE. Elle reçoit l'état du monde (inscriptions, sessions, profs,
 * copies, préinscriptions) et les réglages, et renvoie la liste des messages
 * à mettre en file. Elle n'écrit rien, n'appelle rien : c'est ce qui la rend
 * testable hors ligne, sans base ni compte Brevo.
 *
 * L'anti-doublon ne dépend pas d'elle : elle peut proposer cent fois le même
 * message, la clé d'idempotence n'en laissera passer qu'un seul en base.
 *
 * Deux protections importantes :
 *  - `actif_depuis` : rien d'antérieur à la mise en service ne déclenche de
 *    confirmation ni de relance. Les inscriptions déjà en base ne reçoivent
 *    donc pas de courrier rétroactif ;
 *  - les anciens drapeaux (`email_envoye`, `rappel_j1_envoye`,
 *    `rappel_h1_envoye`) sont respectés : si l'ancien système Apps Script a
 *    déjà envoyé un message, on ne le renvoie pas.
 */
import type { Reglages } from './reglages';
import type { TacheEmail } from './file';
import type {
  ContextePlanification,
  LigneInscription,
  LigneProf,
  LigneSession,
} from './donnees';
import {
  libelleSession,
  prenomDe,
  sessionAnnulee,
  sessionDe,
  variablesEleve,
  variablesPreinscription,
  variablesProf,
} from './donnees';
import { instantParis, instantSession, dateLongue, jourDecale } from './temps';
import type { CategorieEmail, RoleDestinataire, TypeEmail } from './config';

/** Heure d'envoi des messages « à J-n » : 10 h, heure de Paris. */
export const HEURE_ENVOI_JOURNEE = 10;

/** Messages dont le parent reçoit aussi une copie, quand l'adresse existe. */
const AUSSI_AU_PARENT: TypeEmail[] = [
  'inscription_confirmee',
  'paiement_confirme',
  'paiement_attente',
  'session_modifiee',
  'session_annulee',
  'correction_disponible',
];

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function estEmail(v: string | null | undefined): boolean {
  return Boolean(v && EMAIL_VALIDE.test(v.trim()));
}

/** Un instant précis dans la journée d'une date « YYYY-MM-DD ». */
function instantDuJour(dateISO: string, heures: number, minutes = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  return instantParis(Number(m[1]), Number(m[2]), Number(m[3]), heures, minutes);
}

/** Jamais dans le passé : un message en retard part tout de suite. */
function auPlusTot(souhaite: Date, maintenant: Date): string {
  return (souhaite.getTime() < maintenant.getTime() ? maintenant : souhaite).toISOString();
}

export type OptionsPlanification = {
  reglages: Reglages;
  maintenant?: Date;
};

export function planifier(ctx: ContextePlanification, o: OptionsPlanification): TacheEmail[] {
  const maintenant = o.maintenant ?? new Date();
  const r = o.reglages;
  const actifDepuis = new Date(r.actif_depuis);
  const taches: TacheEmail[] = [];

  // Inscriptions rattachées à chaque session : sert aux e-mails profs.
  const inscriptionsParSession = new Map<string, LigneInscription[]>();
  for (const i of ctx.inscriptions) {
    const s = sessionDe(i, ctx);
    if (!s) continue;
    const liste = inscriptionsParSession.get(s.id) ?? [];
    liste.push(i);
    inscriptionsParSession.set(s.id, liste);
  }

  for (const i of ctx.inscriptions) {
    taches.push(...planifierEleve(i, ctx, r, maintenant, actifDepuis));
  }

  for (const c of ctx.coachs) {
    if (c.statut !== 'confirme') continue;
    const prof = ctx.profs.get(c.professeur_id);
    const session = ctx.sessions.get(c.session_id);
    if (!prof || !session || !estEmail(prof.email)) continue;
    if (prof.statut_compte === 'suspendu') continue;
    taches.push(
      ...planifierProf(
        prof,
        session,
        inscriptionsParSession.get(session.id) ?? [],
        ctx,
        r,
        maintenant,
        new Date(c.created_at),
        actifDepuis,
        c.remuneration,
      ),
    );
  }

  for (const p of ctx.preinscriptions) {
    if (!estEmail(p.email)) continue;
    const cree = new Date(p.created_at);
    if (cree < actifDepuis) continue;
    if (p.statut === 'convertie' || p.inscription_id) continue;

    const variables = variablesPreinscription(p);

    taches.push({
      type: 'preinscription_recue',
      categorie: 'transactional',
      destinataire_email: p.email,
      destinataire_nom: variables.student_name || p.prenom,
      destinataire_role: 'prospect',
      preinscription_id: p.id,
      session_id: p.session_id,
      cle_idempotence: `preinscription_recue:preinscription:${p.id}`,
      planifie_le: auPlusTot(cree, maintenant),
      variables,
      declenche_par: 'planificateur',
    });

    // Relance commerciale : seulement si la personne a accepté d'être
    // recontactée. Le moteur revérifiera le consentement au moment d'envoyer.
    if (p.consentement_marketing && p.statut === 'nouvelle') {
      const quand = new Date(cree.getTime() + r.relance_interet_jours_apres * 86_400_000);
      taches.push({
        type: 'relance_interet',
        categorie: 'marketing',
        destinataire_email: p.email,
        destinataire_nom: variables.student_name || p.prenom,
        destinataire_role: 'prospect',
        preinscription_id: p.id,
        cle_idempotence: `relance_interet:preinscription:${p.id}`,
        planifie_le: auPlusTot(quand, maintenant),
        variables,
        declenche_par: 'planificateur',
      });
    }
  }

  return taches;
}

// --- Élèves -----------------------------------------------------------

export function planifierEleve(
  i: LigneInscription,
  ctx: ContextePlanification,
  r: Reglages,
  maintenant: Date,
  actifDepuis: Date,
): TacheEmail[] {
  const taches: TacheEmail[] = [];
  if (!estEmail(i.email)) return taches;
  if (i.annulee_le || i.statut_eleve === 'annule') return taches;

  const session = sessionDe(i, ctx);
  const date = session?.date_epreuve ?? i.date_epreuve ?? null;
  const annulee = sessionAnnulee(session);
  const cree = new Date(i.created_at);
  const debut = date ? instantSession(date, session?.heure_debut ?? '9h') : null;
  const passee = Boolean(debut && debut.getTime() < maintenant.getTime());

  const variables = variablesEleve({
    inscription: i,
    session,
    instructionsPaiement: r.paiement_instructions,
    montantDefaut: r.paiement_montant_defaut,
    lienAvis: r.lien_avis_url,
  });

  const ajouter = (
    type: TypeEmail,
    categorie: CategorieEmail,
    quand: Date,
    suffixeCle = '',
    varsSup: Record<string, string> = {},
  ) => {
    const base = {
      type,
      categorie,
      inscription_id: i.id,
      session_id: session?.id ?? null,
      variables: { ...variables, ...varsSup },
      planifie_le: auPlusTot(quand, maintenant),
      declenche_par: 'planificateur',
    };
    taches.push({
      ...base,
      destinataire_email: i.email as string,
      destinataire_nom: (i.nom ?? '').trim() || null,
      destinataire_role: 'eleve' as RoleDestinataire,
      cle_idempotence: `${type}:inscription:${i.id}${suffixeCle}`,
    });
    if (AUSSI_AU_PARENT.includes(type) && estEmail(i.email_parent)) {
      taches.push({
        ...base,
        destinataire_email: i.email_parent as string,
        destinataire_nom: null,
        destinataire_role: 'parent' as RoleDestinataire,
        variables: { ...base.variables, first_name: prenomDe(i.nom) || 'à vous' },
        cle_idempotence: `${type}:inscription:${i.id}${suffixeCle}:parent`,
      });
    }
  };

  // 1. Confirmation d'inscription — jamais deux fois : l'ancien drapeau
  //    email_envoye fait foi si l'ancien système est passé avant nous.
  if (!i.email_envoye && !annulee) {
    ajouter('inscription_confirmee', 'transactional', cree);
  }

  // 2. Relance paiement — uniquement pour les inscriptions postérieures à la
  //    mise en service, et jamais après le jour de l'épreuve.
  if (
    cree >= actifDepuis &&
    (i.paiement_statut ?? 'en_attente') === 'en_attente' &&
    !annulee &&
    !passee
  ) {
    const max = Math.max(0, Math.min(5, r.relance_paiement_max));
    for (let n = 1; n <= max; n++) {
      const quand = new Date(cree.getTime() + n * r.relance_paiement_heures_apres * 3_600_000);
      if (quand.getTime() > maintenant.getTime()) break; // pas encore l'heure
      ajouter('paiement_attente', 'transactional', quand, `:${n}`);
    }
  }

  // 3. Confirmation de paiement — déclenchée par le passage à « payé ».
  if (i.paiement_confirme_le && (i.paiement_statut === 'paye' || i.paiement_statut === 'offert')) {
    ajouter('paiement_confirme', 'transactional', new Date(i.paiement_confirme_le));
  }

  // --- Avant la session (rien si elle est annulée ou déjà passée) ---
  if (date && !annulee && !passee) {
    const jourInfos = jourDecale(date, -r.infos_pratiques_jours_avant);
    const quandInfos = instantDuJour(jourInfos, HEURE_ENVOI_JOURNEE);
    if (quandInfos) ajouter('infos_pratiques', 'transactional', quandInfos);

    const jourLien = jourDecale(date, -r.lien_visio_jours_avant);
    const quandLien = instantDuJour(jourLien, HEURE_ENVOI_JOURNEE);
    if (quandLien && variables.video_room_url) {
      ajouter('lien_visio', 'transactional', quandLien);
    }

    if (!i.rappel_j1_envoye) {
      const quandVeille = instantDuJour(jourDecale(date, -1), r.rappel_veille_heure);
      if (quandVeille) ajouter('rappel_veille', 'transactional', quandVeille);
    }

    if (!i.rappel_h1_envoye && debut) {
      const quandDernier = new Date(debut.getTime() - r.dernier_rappel_minutes_avant * 60_000);
      // Un dernier rappel n'a de sens qu'avant le début.
      if (debut.getTime() > maintenant.getTime()) {
        ajouter('dernier_rappel', 'transactional', quandDernier);
      }
    }
  }

  // --- Après la session ---
  if (i.copie_recue && !annulee) {
    ajouter('session_terminee', 'transactional', maintenant);
  }

  if (i.correction_publiee_le) {
    const publiee = new Date(i.correction_publiee_le);
    ajouter('correction_disponible', 'transactional', publiee);

    const absent = i.presence === 'absent';
    const rembourse = i.paiement_statut === 'rembourse' || i.paiement_statut === 'annule';
    if (!absent && !rembourse && !annulee) {
      const quandAvis = new Date(publiee.getTime() + r.demande_avis_jours_apres * 86_400_000);
      ajouter('demande_avis', 'transactional', quandAvis);
    }
  }

  return taches;
}

// --- Professeurs ------------------------------------------------------

export function planifierProf(
  prof: LigneProf,
  session: LigneSession,
  eleves: LigneInscription[],
  ctx: ContextePlanification,
  r: Reglages,
  maintenant: Date,
  affecteLe: Date,
  actifDepuis: Date,
  remuneration: number | null,
): TacheEmail[] {
  const taches: TacheEmail[] = [];
  const annulee = sessionAnnulee(session);
  const debut = instantSession(session.date_epreuve, session.heure_debut ?? '9h');
  const passee = Boolean(debut && debut.getTime() < maintenant.getTime());
  const echeance = jourDecale(session.date_epreuve, r.prof_echeance_correction_jours);

  const copies = copiesDeSession(eleves, ctx);
  const corrigees = copies.filter((c) => /corrig/i.test(c.statut ?? '') || c.envoye);

  const base = (
    type: TypeEmail,
    quand: Date,
    varsSup: Record<string, string> = {},
    suffixe = '',
  ): TacheEmail => ({
    type,
    categorie: 'transactional',
    destinataire_email: prof.email,
    destinataire_nom: [prof.prenom, prof.nom].filter(Boolean).join(' ') || null,
    destinataire_role: 'prof',
    session_id: session.id,
    professeur_id: prof.id,
    cle_idempotence: `${type}:session:${session.id}:prof:${prof.id}${suffixe}`,
    planifie_le: auPlusTot(quand, maintenant),
    variables: {
      ...variablesProf({
        prof,
        session,
        nbEleves: eleves.length,
        nbCopies: copies.length,
        remuneration,
        echeance,
      }),
      ...varsSup,
    },
    declenche_par: 'planificateur',
  });

  // Affectation : uniquement pour les affectations postérieures à la mise en
  // service — on ne réécrit pas aux profs déjà en poste.
  if (affecteLe >= actifDepuis && !annulee) {
    taches.push(base('prof_affectation', affecteLe));
  }

  if (!annulee && !passee) {
    const quandInfos = instantDuJour(
      jourDecale(session.date_epreuve, -r.prof_infos_jours_avant),
      HEURE_ENVOI_JOURNEE,
    );
    if (quandInfos) taches.push(base('prof_infos_session', quandInfos));

    if (debut) {
      const quandRappel = new Date(debut.getTime() - r.prof_rappel_heures_avant * 3_600_000);
      taches.push(base('prof_rappel_veille', quandRappel));
    }
  }

  if (!annulee && copies.length > 0) {
    taches.push(base('prof_copies_disponibles', maintenant, { copy_count: String(copies.length) }));

    const restantes = copies.length - corrigees.length;
    if (restantes > 0) {
      const quandEcheance = instantDuJour(echeance, HEURE_ENVOI_JOURNEE);
      if (quandEcheance) {
        taches.push(
          base('prof_rappel_correction', quandEcheance, { copy_count: String(restantes) }),
        );
      }
    } else {
      taches.push(base('prof_mission_terminee', maintenant));
    }
  }

  return taches;
}

/** Les copies déposées par les élèves d'une session. */
function copiesDeSession(eleves: LigneInscription[], ctx: ContextePlanification) {
  const out = [];
  for (const e of eleves) {
    const cle = (e.email ?? '').trim().toLowerCase();
    if (!cle) continue;
    for (const c of ctx.copiesParEmail.get(cle) ?? []) out.push(c);
  }
  return out;
}

// --- Changement / annulation de session -------------------------------

/**
 * Messages à envoyer quand une session change de date ou d'horaire, ou est
 * annulée. Appelé par le déclencheur, pas par la boucle de planification :
 * un changement est un événement, pas un état.
 *
 * Le suffixe de clé contient l'empreinte du nouvel horaire : un deuxième
 * changement redéclenche donc bien un nouvel e-mail, alors qu'un même
 * changement traité deux fois n'en produit qu'un.
 */
export function tachesChangementSession(params: {
  session: LigneSession;
  ancienne: { date_epreuve: string; heure_debut: string | null } | null;
  eleves: LigneInscription[];
  profs: { prof: LigneProf; remuneration: number | null }[];
  annulation: boolean;
  motif?: string;
  reglages: Reglages;
  maintenant?: Date;
  empreinte: string;
}): TacheEmail[] {
  const maintenant = params.maintenant ?? new Date();
  const taches: TacheEmail[] = [];
  const s = params.session;
  const nouvelle = libelleSession(s);
  const ancienne = params.ancienne ? libelleSession(params.ancienne) : '';
  const empreinte = params.empreinte.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

  const typeEleve: TypeEmail = params.annulation ? 'session_annulee' : 'session_modifiee';
  const typeProf: TypeEmail = params.annulation ? 'prof_session_annulee' : 'prof_session_modifiee';

  for (const i of params.eleves) {
    if (!estEmail(i.email)) continue;
    if (i.annulee_le || i.statut_eleve === 'annule') continue;

    const variables = {
      ...variablesEleve({
        inscription: i,
        session: s,
        instructionsPaiement: params.reglages.paiement_instructions,
        montantDefaut: params.reglages.paiement_montant_defaut,
        ancienneValeur: ancienne,
        nouvelleValeur: nouvelle,
        motif: params.motif,
      }),
    };

    const commun = {
      type: typeEleve,
      categorie: 'transactional' as CategorieEmail,
      inscription_id: i.id,
      session_id: s.id,
      variables,
      planifie_le: maintenant.toISOString(),
      declenche_par: 'changement-session',
    };

    taches.push({
      ...commun,
      destinataire_email: i.email as string,
      destinataire_nom: (i.nom ?? '').trim() || null,
      destinataire_role: 'eleve',
      cle_idempotence: `${typeEleve}:inscription:${i.id}:${empreinte}`,
    });

    if (estEmail(i.email_parent)) {
      taches.push({
        ...commun,
        destinataire_email: i.email_parent as string,
        destinataire_nom: null,
        destinataire_role: 'parent',
        variables: { ...variables, first_name: prenomDe(i.nom) || 'à vous' },
        cle_idempotence: `${typeEleve}:inscription:${i.id}:${empreinte}:parent`,
      });
    }
  }

  for (const { prof, remuneration } of params.profs) {
    if (!estEmail(prof.email)) continue;
    taches.push({
      type: typeProf,
      categorie: 'transactional',
      destinataire_email: prof.email,
      destinataire_nom: [prof.prenom, prof.nom].filter(Boolean).join(' ') || null,
      destinataire_role: 'prof',
      session_id: s.id,
      professeur_id: prof.id,
      cle_idempotence: `${typeProf}:session:${s.id}:prof:${prof.id}:${empreinte}`,
      planifie_le: maintenant.toISOString(),
      variables: variablesProf({
        prof,
        session: s,
        remuneration,
        ancienneValeur: ancienne,
        nouvelleValeur: nouvelle,
        motif: params.motif,
      }),
      declenche_par: 'changement-session',
    });
  }

  return taches;
}

// --- Vérification juste avant l'envoi ---------------------------------

export type Verdict =
  | { action: 'envoyer' }
  | { action: 'annuler'; raison: string }
  | { action: 'reporter'; quand: Date; raison: string };

/**
 * Dernier contrôle, effectué au moment d'envoyer et non au moment de
 * planifier : la session a pu être annulée, déplacée ou déjà passée entre
 * les deux, et le paiement a pu arriver entre-temps.
 *
 * C'est ici qu'on garantit qu'on n'annonce jamais une correction qui n'est
 * pas publiée, et qu'on ne relance jamais quelqu'un qui a déjà payé.
 */
export function verifierAvantEnvoi(params: {
  type: TypeEmail;
  inscription: LigneInscription;
  session: LigneSession | null;
  reglages: Reglages;
  maintenant?: Date;
}): Verdict {
  const { type, inscription: i, session, reglages: r } = params;
  const maintenant = params.maintenant ?? new Date();
  const annulee = sessionAnnulee(session);
  const date = session?.date_epreuve ?? i.date_epreuve ?? null;
  const debut = date ? instantSession(date, session?.heure_debut ?? '9h') : null;
  const passee = Boolean(debut && debut.getTime() < maintenant.getTime());

  if (i.annulee_le || i.statut_eleve === 'annule') {
    return { action: 'annuler', raison: 'inscription annulée' };
  }

  // Messages liés au déroulé de la session.
  const avantSession: TypeEmail[] = ['infos_pratiques', 'lien_visio', 'rappel_veille', 'dernier_rappel'];
  if (avantSession.includes(type)) {
    if (annulee) return { action: 'annuler', raison: 'session annulée' };
    if (!date) return { action: 'annuler', raison: 'session sans date' };
    if (passee) return { action: 'annuler', raison: 'session déjà passée' };

    const ideal = instantIdealAvantSession(type, date, session?.heure_debut ?? '9h', r);
    if (ideal && ideal.getTime() - maintenant.getTime() > 60 * 60_000) {
      // La session a été repoussée : on décale le message au lieu de
      // l'envoyer trop tôt.
      return {
        action: 'reporter',
        quand: ideal,
        raison: 'session déplacée — message replanifié',
      };
    }
    return { action: 'envoyer' };
  }

  switch (type) {
    case 'paiement_attente':
      if ((i.paiement_statut ?? 'en_attente') !== 'en_attente') {
        return { action: 'annuler', raison: 'paiement déjà réglé' };
      }
      if (annulee) return { action: 'annuler', raison: 'session annulée' };
      if (passee) return { action: 'annuler', raison: 'session déjà passée' };
      return { action: 'envoyer' };

    case 'paiement_confirme':
      if (!i.paiement_confirme_le) {
        return { action: 'annuler', raison: 'paiement non confirmé en base' };
      }
      return { action: 'envoyer' };

    case 'correction_disponible':
    case 'demande_avis':
      if (!i.correction_publiee_le) {
        return { action: 'annuler', raison: 'correction non publiée' };
      }
      return { action: 'envoyer' };

    case 'session_terminee':
      if (!i.copie_recue) {
        return { action: 'annuler', raison: 'copie non reçue' };
      }
      return { action: 'envoyer' };

    case 'inscription_confirmee':
      if (annulee) return { action: 'annuler', raison: 'session annulée' };
      return { action: 'envoyer' };

    default:
      return { action: 'envoyer' };
  }
}

/** L'instant auquel un message « avant session » devrait partir. */
export function instantIdealAvantSession(
  type: TypeEmail,
  date: string,
  heureDebut: string | null,
  r: Reglages,
): Date | null {
  switch (type) {
    case 'infos_pratiques':
      return instantDuJour(jourDecale(date, -r.infos_pratiques_jours_avant), HEURE_ENVOI_JOURNEE);
    case 'lien_visio':
      return instantDuJour(jourDecale(date, -r.lien_visio_jours_avant), HEURE_ENVOI_JOURNEE);
    case 'rappel_veille':
      return instantDuJour(jourDecale(date, -1), r.rappel_veille_heure);
    case 'dernier_rappel': {
      const debut = instantSession(date, heureDebut ?? '9h');
      return debut ? new Date(debut.getTime() - r.dernier_rappel_minutes_avant * 60_000) : null;
    }
    default:
      return null;
  }
}

/** Petit utilitaire lisible pour l'administration. */
export function resumeTache(t: TacheEmail): string {
  const quand = dateLongue(t.planifie_le.slice(0, 10)) ?? t.planifie_le;
  return `${t.type} → ${t.destinataire_email} (${quand})`;
}
