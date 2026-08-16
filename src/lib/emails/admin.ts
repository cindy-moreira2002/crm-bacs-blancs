/**
 * Ce que voit l'administratrice sur /admin/emails.
 *
 * ⚠️ SERVEUR UNIQUEMENT — la réponse contient des adresses d'élèves et de
 * professeurs. La route qui l'expose vérifie `role === 'admin'`.
 *
 * Un seul instantané : messages filtrés, compteurs, quota du jour, réglages,
 * état de la configuration (Brevo, variables d'environnement) et inscriptions
 * en attente de paiement.
 */
import { emailsDb } from './client';
import { chargerReglages, validationManuelle, type Reglages } from './reglages';
import { etatQuota, type EtatQuota, type LigneEmail } from './file';
import { verifierCompteBrevo } from './brevo';
import {
  EXPEDITEUR,
  LIBELLE_STATUT,
  LIBELLE_TYPE,
  REPONSE_A,
  emailsManquant,
  type TypeEmail,
} from './config';
import { secretDesinscriptionPresent } from './desinscription';
import { CHAMPS_INSCRIPTION, type LigneInscription } from './donnees';
import {
  ETATS_PROBLEME,
  etatDepuisStatut,
  parcoursEleve,
  type EtatCase,
  type EtapeParcours,
} from './parcours';
import { instantSession } from './temps';

export type FiltresEmails = {
  statut?: string;
  categorie?: string;
  type?: string;
  matiere?: string;
  session?: string;
  role?: string;
  depuis?: string;
  jusqua?: string;
  recherche?: string;
  limite?: number;
};

export type MessageAdmin = {
  id: string;
  type: string;
  type_libelle: string;
  categorie: string;
  statut: string;
  statut_libelle: string;
  destinataire: string;
  destinataire_nom: string | null;
  role: string;
  eleve: string | null;
  matiere: string | null;
  session_date: string | null;
  planifie_le: string;
  envoye_le: string | null;
  sujet: string | null;
  tentatives: number;
  erreur: string | null;
  blocage: string | null;
  ouvert: boolean;
  clique: boolean;
  inscription_id: string | null;
  session_id: string | null;
  professeur_id: string | null;
};

export type PaiementEnAttente = {
  inscription_id: string;
  eleve: string;
  email: string;
  matiere: string | null;
  date_epreuve: string | null;
  depuis: string;
  relances: number;
};

/** Une case du tableau « Par élève » : un e-mail, pour une inscription. */
export type CaseParcours = {
  etat: EtatCase;
  /** Date affichée : celle de l'envoi si c'est parti, sinon celle prévue. */
  quand: string | null;
  /** Identifiant du message en base, quand il existe (permet l'aperçu). */
  emailId: string | null;
  /** Pourquoi cet état — raison de blocage, erreur Brevo, ou « sans objet ». */
  detail: string | null;
  /** Nombre de messages de ce type pour cette inscription (relances). */
  nombre: number;
};

/** Une ligne du tableau « Par élève » = une inscription (élève × matière). */
export type LigneParcours = {
  inscription_id: string;
  eleve: string;
  email: string | null;
  email_parent: string | null;
  matiere: string | null;
  date_epreuve: string | null;
  session_id: string | null;
  paiement_statut: string | null;
  /** Ce qui empêchera cet élève de tout recevoir. Vide = tout va bien. */
  avertissements: string[];
  /** Adresse manifestement fictive (jeu d'essai) : à ne pas envoyer en vrai. */
  adresseDeTest: boolean;
  /** Une case par type d'e-mail du parcours, clé = le type. */
  cases: Record<string, CaseParcours>;
  /** Idem pour le parent, uniquement pour les types qui le concernent. */
  casesParent: Record<string, CaseParcours>;
  /** Combien de cases sont en échec ou bloquées. */
  problemes: number;
};

export type SnapshotEmails = {
  messages: MessageAdmin[];
  total: number;
  /**
   * Les messages qui attendent le feu vert : leur heure est passée, ils ne
   * partiront pas tant qu'on n'a pas cliqué. Jamais filtrés — c'est la
   * question « qu'est-ce qui m'attend ? », pas « que contient la file ».
   */
  aValider: MessageAdmin[];
  /** Ceux dont l'heure n'est pas encore venue : rien à faire pour l'instant. */
  plusTard: number;
  compteurs: Record<string, number>;
  parType: { type: string; libelle: string; total: number }[];
  quota: EtatQuota;
  reglages: Reglages;
  alertes: string[];
  configuration: {
    expediteur: string;
    expediteurNom: string;
    reponseA: string;
    manquants: string[];
    brevo: { ok: boolean; message: string };
    desinscriptionPrete: boolean;
    webhookConfigure: boolean;
    modeTest: boolean;
  };
  paiementsEnAttente: PaiementEnAttente[];
  matieres: string[];
  sessions: { id: string; libelle: string }[];
  /** Le parcours de chaque élève, une ligne par inscription. */
  parcours: LigneParcours[];
  /** Les étapes du parcours, dans l'ordre : ce sont les colonnes. */
  etapes: EtapeParcours[];
};

const CHAMPS =
  'id, type, categorie, destinataire_email, destinataire_nom, destinataire_role, inscription_id, ' +
  'session_id, professeur_id, planifie_le, envoye_le, statut, tentatives, derniere_erreur, ' +
  'raison_blocage, variables, sujet, ouvert_le, clique_le, created_at';

/** Les statuts d'un message qui n'est pas encore parti. */
const STATUTS_EN_FILE = ['pending', 'scheduled', 'processing'];

/** Une ligne de la table `emails` telle que la page l'affiche. */
function versMessageAdmin(l: LigneEmail): MessageAdmin {
  const v = (l.variables ?? {}) as Record<string, string>;
  return {
    id: l.id,
    type: l.type,
    type_libelle: LIBELLE_TYPE[l.type as TypeEmail] ?? l.type,
    categorie: l.categorie,
    statut: l.statut,
    statut_libelle: LIBELLE_STATUT[l.statut] ?? l.statut,
    destinataire: l.destinataire_email,
    destinataire_nom: l.destinataire_nom ?? null,
    role: l.destinataire_role,
    eleve: v.student_name || null,
    matiere: v.subject_name || null,
    session_date: v.session_date_iso || null,
    planifie_le: l.planifie_le,
    envoye_le: l.envoye_le,
    sujet: l.sujet,
    tentatives: l.tentatives ?? 0,
    erreur: l.derniere_erreur,
    blocage: l.raison_blocage,
    ouvert: Boolean(l.ouvert_le),
    clique: Boolean(l.clique_le),
    inscription_id: l.inscription_id ?? null,
    session_id: l.session_id ?? null,
    professeur_id: l.professeur_id ?? null,
  };
}

export async function chargerSnapshotEmails(f: FiltresEmails = {}): Promise<SnapshotEmails> {
  const db = emailsDb();
  const reglages = await chargerReglages(true);
  const limite = Math.min(Math.max(f.limite ?? 200, 1), 500);

  let q = db.from('emails').select(CHAMPS).order('planifie_le', { ascending: false }).limit(limite);
  if (f.statut && f.statut !== 'tous') q = q.eq('statut', f.statut);
  if (f.categorie && f.categorie !== 'toutes') q = q.eq('categorie', f.categorie);
  if (f.type && f.type !== 'tous') q = q.eq('type', f.type);
  if (f.role && f.role !== 'tous') q = q.eq('destinataire_role', f.role);
  if (f.session && f.session !== 'toutes') q = q.eq('session_id', f.session);
  if (f.depuis) q = q.gte('planifie_le', f.depuis);
  if (f.jusqua) q = q.lte('planifie_le', f.jusqua);
  if (f.recherche) q = q.ilike('destinataire_email', `%${f.recherche.trim()}%`);

  const [lignes, compteursBruts, enFile, sessions, quota, brevo] = await Promise.all([
    q,
    db.from('emails').select('statut').limit(5000),
    // Volontairement hors filtres : ce qui attend mon feu vert doit rester
    // visible même quand la page est filtrée sur autre chose.
    db
      .from('emails')
      .select(CHAMPS)
      .in('statut', STATUTS_EN_FILE)
      .order('planifie_le', { ascending: true })
      .limit(200),
    db.from('sessions_bacs_blancs').select('id, matiere, date_epreuve').order('date_epreuve', { ascending: false }).limit(100),
    etatQuota(reglages.quota_quotidien, reglages.quota_marge),
    verifierCompteBrevo().catch((err) => ({ ok: false, message: String(err) })),
  ]);

  if (lignes.error) throw lignes.error;
  if (enFile.error) throw enFile.error;

  const messages: MessageAdmin[] = ((lignes.data ?? []) as unknown as LigneEmail[])
    .map(versMessageAdmin)
    // La matière n'est pas une colonne : elle vit dans les variables du
    // message. On filtre donc ici, après lecture.
    .filter((m) => !f.matiere || f.matiere === 'toutes' || m.matiere === f.matiere);

  const compteurs: Record<string, number> = {};
  for (const l of (compteursBruts.data ?? []) as { statut: string }[]) {
    compteurs[l.statut] = (compteurs[l.statut] ?? 0) + 1;
  }

  // « À valider » = son heure est passée. Même découpage que le tableau de
  // bord de direction, pour que les deux écrans annoncent le même nombre.
  const maintenant = Date.now();
  const enFileMessages = ((enFile.data ?? []) as unknown as LigneEmail[]).map(versMessageAdmin);
  const heurePassee = (m: MessageAdmin) =>
    (m.planifie_le ? new Date(m.planifie_le).getTime() : 0) <= maintenant;
  const aValider = enFileMessages.filter(heurePassee);
  const plusTard = enFileMessages.length - aValider.length;

  const parTypeMap = new Map<string, number>();
  for (const m of messages) parTypeMap.set(m.type, (parTypeMap.get(m.type) ?? 0) + 1);
  const parType = [...parTypeMap.entries()]
    .map(([type, total]) => ({ type, libelle: LIBELLE_TYPE[type as TypeEmail] ?? type, total }))
    .sort((a, b) => b.total - a.total);

  const matieres = [...new Set(messages.map((m) => m.matiere).filter(Boolean))] as string[];

  const alertes: string[] = [];
  if (quota.alerte) alertes.push(quota.alerte);
  // Le détail « combien attendent » est dit en grand par l'encadré en haut de
  // page. Ici on ne garde que ce qui n'y est pas : comment sortir de ce mode.
  if (validationManuelle(reglages) && aValider.length === 0) {
    alertes.push(
      `Validation manuelle active : rien ne part tout seul, mais aucun message n’attend actuellement.${
        plusTard > 0 ? ` ${plusTard} message(s) sont programmés pour plus tard.` : ''
      } Pour revenir à l’envoi automatique, passe le réglage « Je valide chaque e-mail avant qu’il parte » sur « non ».`,
    );
  }
  if (compteurs.bloque) {
    alertes.push(
      `${compteurs.bloque} message(s) bloqués : il leur manque une donnée (date, lien, adresse). Filtre sur « bloqué » pour voir laquelle.`,
    );
  }
  if (compteurs.failed) {
    alertes.push(`${compteurs.failed} message(s) en échec. Tu peux les renvoyer un par un.`);
  }
  const manquants = emailsManquant();
  if (manquants.length) {
    alertes.push(`Variables d’environnement manquantes sur Vercel : ${manquants.join(', ')}.`);
  }
  if (!brevo.ok) alertes.push(`Brevo : ${brevo.message}`);

  const modeTest = String(reglages.envoi_actif).trim().toLowerCase() !== 'oui';
  if (modeTest) {
    alertes.push('Mode test actif : les messages sont préparés mais AUCUN e-mail ne part réellement.');
  }

  return {
    messages,
    total: messages.length,
    aValider,
    plusTard,
    compteurs,
    parType,
    quota,
    reglages,
    alertes,
    configuration: {
      expediteur: EXPEDITEUR.email,
      expediteurNom: EXPEDITEUR.nom,
      reponseA: REPONSE_A,
      manquants,
      brevo: { ok: brevo.ok, message: brevo.message },
      desinscriptionPrete: secretDesinscriptionPresent(),
      webhookConfigure: Boolean(process.env.EMAILS_WEBHOOK_SECRET),
      modeTest,
    },
    paiementsEnAttente: await chargerPaiementsEnAttente(),
    matieres,
    sessions: ((sessions.data ?? []) as { id: string; matiere: string; date_epreuve: string }[]).map((s) => ({
      id: s.id,
      libelle: `${s.matiere} — ${s.date_epreuve}`,
    })),
    parcours: await chargerParcoursEleves(reglages),
    etapes: parcoursEleve(reglages),
  };
}

// --- Vue « Par élève » ------------------------------------------------

/**
 * Adresses manifestement fictives. On ne les bloque pas — on les signale,
 * pour qu'elles ne partent pas en vrai et n'abîment pas la réputation de
 * l'expéditeur à coups de rebonds.
 */
const MOTIFS_ADRESSE_TEST = [
  /@matineesdubac\.local$/i,
  /@(test|example)\.(com|org|net|fr)$/i,
  /^(test|diag|demo)[-.@]/i,
];

function adresseDeTest(email: string | null): boolean {
  const a = (email ?? '').trim();
  if (!a) return false;
  return MOTIFS_ADRESSE_TEST.some((m) => m.test(a));
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** La gravité décide quel message représente une étape jouée plusieurs fois. */
const GRAVITE: Record<EtatCase, number> = {
  echec: 6,
  bloque: 5,
  envoye: 4,
  programme: 3,
  annule: 2,
  attendu: 1,
  sans_objet: 0,
};

/**
 * Le parcours de chaque inscription : pour chaque e-mail prévu, où il en est.
 *
 * C'est la réponse à « suis-je sûre que personne n'est passé au travers ? ».
 * Une case vide n'est jamais ambiguë : soit le message est encore à venir,
 * soit on dit pourquoi il ne partira pas.
 */
export async function chargerParcoursEleves(r: Reglages): Promise<LigneParcours[]> {
  const db = emailsDb();
  const maintenant = new Date();
  const etapes = parcoursEleve(r);
  // La date de mise en service : le planificateur ne remonte jamais avant.
  const actifDepuis = new Date(r.actif_depuis);

  const [insc, sess] = await Promise.all([
    db
      .from('inscriptions')
      .select(CHAMPS_INSCRIPTION)
      .is('annulee_le', null)
      .order('date_epreuve', { ascending: true, nullsFirst: false })
      .limit(500),
    db.from('sessions_bacs_blancs').select('id, date_epreuve, heure_debut, annulee_le, statut').limit(300),
  ]);

  if (insc.error) return [];
  const inscriptions = ((insc.data ?? []) as unknown as LigneInscription[]).filter(
    (i) => i.statut_eleve !== 'annule',
  );
  if (!inscriptions.length) return [];

  const sessionsParId = new Map(
    ((sess.data ?? []) as {
      id: string;
      date_epreuve: string | null;
      heure_debut: string | null;
      annulee_le: string | null;
      statut: string | null;
    }[]).map((s) => [s.id, s]),
  );

  // Tous les messages de ces inscriptions, en une requête.
  const { data: msgs } = await db
    .from('emails')
    .select('id, type, statut, planifie_le, envoye_le, destinataire_role, raison_blocage, derniere_erreur, inscription_id')
    .in(
      'inscription_id',
      inscriptions.map((i) => i.id),
    )
    .limit(5000);

  type LigneMsg = {
    id: string;
    type: string;
    statut: string;
    planifie_le: string;
    envoye_le: string | null;
    destinataire_role: string;
    raison_blocage: string | null;
    derniere_erreur: string | null;
    inscription_id: string;
  };

  // inscription → rôle → type → messages
  const parInscription = new Map<string, LigneMsg[]>();
  for (const m of ((msgs ?? []) as LigneMsg[])) {
    const liste = parInscription.get(m.inscription_id) ?? [];
    liste.push(m);
    parInscription.set(m.inscription_id, liste);
  }

  return inscriptions.map((i) => {
    const s = i.session_id ? sessionsParId.get(i.session_id) : undefined;
    const date = s?.date_epreuve ?? i.date_epreuve ?? null;
    const annulee = Boolean(s?.annulee_le) || s?.statut === 'annulee';
    const debut = date ? instantSession(date, s?.heure_debut ?? '9h') : null;
    const passee = Boolean(debut && debut.getTime() < maintenant.getTime());
    const messages = parInscription.get(i.id) ?? [];

    const construire = (etape: EtapeParcours, role: 'eleve' | 'parent'): CaseParcours => {
      const lignes = messages.filter((m) => m.type === etape.type && m.destinataire_role === role);

      if (lignes.length) {
        // Plusieurs messages (relances de paiement) : on montre le plus grave,
        // pour qu'un blocage ne se cache pas derrière un envoi réussi.
        const choisi = lignes.reduce((a, b) =>
          GRAVITE[etatDepuisStatut(b.statut)] > GRAVITE[etatDepuisStatut(a.statut)] ? b : a,
        );
        const etat = etatDepuisStatut(choisi.statut);
        return {
          etat,
          quand: choisi.envoye_le ?? choisi.planifie_le,
          emailId: choisi.id,
          detail: choisi.raison_blocage ?? choisi.derniere_erreur ?? null,
          nombre: lignes.length,
        };
      }

      const vide = (etat: EtatCase, detail: string | null): CaseParcours => ({
        etat,
        quand: null,
        emailId: null,
        detail,
        nombre: 0,
      });

      if (annulee && etape.type !== 'session_annulee') {
        return vide('sans_objet', 'session annulée');
      }

      // Aucun message en base : est-ce normal, ou est-ce un trou ?
      switch (etape.type) {
        case 'inscription_confirmee':
          return i.email_envoye
            ? vide('envoye', 'envoyé par l’ancien système Gmail (avant Brevo)')
            : vide('attendu', null);

        case 'paiement_attente':
          if ((i.paiement_statut ?? 'en_attente') !== 'en_attente') {
            return vide('sans_objet', 'paiement déjà réglé');
          }
          if (passee) return vide('sans_objet', 'épreuve déjà passée');
          // Même garde que le planificateur : rien de rétroactif. Sans ce
          // test, la case annoncerait une relance qui ne viendra jamais.
          if (new Date(i.created_at) < actifDepuis) {
            return vide('sans_objet', 'inscription antérieure à la mise en service des e-mails');
          }
          return vide('attendu', null);

        case 'paiement_confirme':
          return i.paiement_confirme_le ||
            i.paiement_statut === 'paye' ||
            i.paiement_statut === 'offert'
            ? vide('attendu', null)
            : vide('sans_objet', 'paiement pas encore confirmé');

        case 'infos_pratiques':
        case 'lien_visio':
        case 'rappel_veille':
        case 'dernier_rappel':
          if (!date) return vide('sans_objet', 'aucune date d’épreuve');
          if (passee) return vide('sans_objet', 'épreuve déjà passée');
          return vide('attendu', null);

        case 'session_terminee':
          return i.copie_recue ? vide('attendu', null) : vide('sans_objet', 'copie pas encore reçue');

        case 'correction_disponible':
        case 'demande_avis':
          return i.correction_publiee_le
            ? vide('attendu', null)
            : vide('sans_objet', 'correction pas encore publiée');

        default:
          // session_modifiee / session_annulee : rien tant que rien ne bouge.
          return vide('sans_objet', 'ne s’est pas produit');
      }
    };

    const cases: Record<string, CaseParcours> = {};
    const casesParent: Record<string, CaseParcours> = {};
    const parentConnu = EMAIL_VALIDE.test((i.email_parent ?? '').trim());

    for (const e of etapes) {
      cases[e.type] = construire(e, 'eleve');
      if (e.parent && parentConnu) casesParent[e.type] = construire(e, 'parent');
    }

    const avertissements: string[] = [];
    if (!EMAIL_VALIDE.test((i.email ?? '').trim())) {
      avertissements.push('adresse élève absente ou invalide : cet élève ne recevra rien');
    }
    if (!date) {
      avertissements.push('aucune date d’épreuve : les 4 messages d’avant-épreuve ne partiront jamais');
    }
    if (annulee) avertissements.push('session annulée');
    if (!parentConnu) avertissements.push('pas d’adresse parent : les copies au parent ne partiront pas');

    const problemes = [...Object.values(cases), ...Object.values(casesParent)].filter((c) =>
      ETATS_PROBLEME.includes(c.etat),
    ).length;

    return {
      inscription_id: i.id,
      eleve: (i.nom ?? '').trim() || '—',
      email: i.email,
      email_parent: parentConnu ? i.email_parent : null,
      matiere: i.matiere,
      date_epreuve: date,
      session_id: i.session_id,
      paiement_statut: i.paiement_statut,
      avertissements,
      adresseDeTest: adresseDeTest(i.email),
      cases,
      casesParent,
      problemes,
    };
  });
}

async function chargerPaiementsEnAttente(): Promise<PaiementEnAttente[]> {
  const db = emailsDb();
  const { data, error } = await db
    .from('inscriptions')
    .select('id, nom, email, matiere, date_epreuve, created_at, paiement_statut, annulee_le')
    .eq('paiement_statut', 'en_attente')
    .is('annulee_le', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];

  const lignes = (data ?? []) as {
    id: string;
    nom: string | null;
    email: string | null;
    matiere: string | null;
    date_epreuve: string | null;
    created_at: string;
  }[];
  if (!lignes.length) return [];

  const { data: relances } = await db
    .from('emails')
    .select('inscription_id')
    .eq('type', 'paiement_attente')
    .in('statut', ['sent', 'delivered'])
    .in(
      'inscription_id',
      lignes.map((l) => l.id),
    );

  const compte = new Map<string, number>();
  for (const r of ((relances ?? []) as { inscription_id: string }[])) {
    compte.set(r.inscription_id, (compte.get(r.inscription_id) ?? 0) + 1);
  }

  return lignes.map((l) => ({
    inscription_id: l.id,
    eleve: (l.nom ?? '').trim() || '—',
    email: l.email ?? '',
    matiere: l.matiere,
    date_epreuve: l.date_epreuve,
    depuis: l.created_at,
    relances: compte.get(l.id) ?? 0,
  }));
}
