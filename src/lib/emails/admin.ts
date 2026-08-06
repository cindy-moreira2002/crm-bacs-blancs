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
import { chargerReglages, type Reglages } from './reglages';
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

export type SnapshotEmails = {
  messages: MessageAdmin[];
  total: number;
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
};

const CHAMPS =
  'id, type, categorie, destinataire_email, destinataire_nom, destinataire_role, inscription_id, ' +
  'session_id, professeur_id, planifie_le, envoye_le, statut, tentatives, derniere_erreur, ' +
  'raison_blocage, variables, sujet, ouvert_le, clique_le, created_at';

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

  const [lignes, compteursBruts, sessions, quota, brevo] = await Promise.all([
    q,
    db.from('emails').select('statut').limit(5000),
    db.from('sessions_bacs_blancs').select('id, matiere, date_epreuve').order('date_epreuve', { ascending: false }).limit(100),
    etatQuota(reglages.quota_quotidien, reglages.quota_marge),
    verifierCompteBrevo().catch((err) => ({ ok: false, message: String(err) })),
  ]);

  if (lignes.error) throw lignes.error;

  const messages: MessageAdmin[] = ((lignes.data ?? []) as unknown as LigneEmail[])
    .map((l) => {
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
    })
    // La matière n'est pas une colonne : elle vit dans les variables du
    // message. On filtre donc ici, après lecture.
    .filter((m) => !f.matiere || f.matiere === 'toutes' || m.matiere === f.matiere);

  const compteurs: Record<string, number> = {};
  for (const l of (compteursBruts.data ?? []) as { statut: string }[]) {
    compteurs[l.statut] = (compteurs[l.statut] ?? 0) + 1;
  }

  const parTypeMap = new Map<string, number>();
  for (const m of messages) parTypeMap.set(m.type, (parTypeMap.get(m.type) ?? 0) + 1);
  const parType = [...parTypeMap.entries()]
    .map(([type, total]) => ({ type, libelle: LIBELLE_TYPE[type as TypeEmail] ?? type, total }))
    .sort((a, b) => b.total - a.total);

  const matieres = [...new Set(messages.map((m) => m.matiere).filter(Boolean))] as string[];

  const alertes: string[] = [];
  if (quota.alerte) alertes.push(quota.alerte);
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
  };
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
