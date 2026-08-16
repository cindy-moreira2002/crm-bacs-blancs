/**
 * /api/finances — le pont entre le CRM et le classeur de suivi financier.
 *
 * GET  : exporte ce dont le classeur a besoin (sessions, inscriptions,
 *        professeurs, revenus à payer). Lecture seule, aucun effet de bord.
 * POST : les seules écritures autorisées, et elles sont volontairement
 *        étroites :
 *          - « paiement »  → les 4 colonnes de paiement d'une inscription ;
 *          - « reference » → la référence de virement d'une inscription ;
 *          - « facture »   → met un e-mail de facture dans la file Brevo.
 *
 * Aucune suppression, aucune modification d'une autre colonne, jamais.
 *
 * Protégée par un secret partagé dans l'en-tête `x-finances-secret`, sur le
 * même principe que /api/emails/cron : le secret n'apparaît jamais dans une
 * URL, donc jamais dans un journal d'accès.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { synchroniserAffiliation } from '@/lib/affiliation';
import { emailsDb } from '@/lib/emails/client';
import { enfiler } from '@/lib/emails/file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Statuts de paiement acceptés — refléte ce que le planificateur sait lire. */
const STATUTS_PAIEMENT = ['en_attente', 'paye', 'partiel', 'offert', 'rembourse'] as const;
type StatutPaiement = (typeof STATUTS_PAIEMENT)[number];

const CHAMPS_SESSION =
  'id, matiere, date_epreuve, heure_debut, heure_fin, places, statut, created_at, updated_at';
const CHAMPS_INSCRIPTION =
  'id, nom, email, email_parent, telephone, matiere, date_epreuve, session_id, created_at, ' +
  'statut_eleve, paiement_statut, paiement_montant, paiement_reference, paiement_confirme_le, ' +
  'presence, annulee_le';
const CHAMPS_PROFESSEUR = 'id, prenom, nom, email, telephone, matieres, statut_compte';
const CHAMPS_REVENU =
  'id, professeur_id, type, montant, session_id, libelle, statut, created_at';

const MAX_LIGNES = 2000;

function secretValide(recu: string | null): boolean {
  const attendu = process.env.FINANCES_API_SECRET ?? '';
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function refuse() {
  return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
}

/** Une date ISO exploitable, ou null si la valeur est absente ou illisible. */
function dateOuNull(valeur: unknown): string | null {
  if (typeof valeur !== 'string' || !valeur.trim()) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ------------------------------------------------------------------ GET ---

export async function GET(req: NextRequest) {
  if (!secretValide(req.headers.get('x-finances-secret'))) return refuse();

  const depuis = dateOuNull(req.nextUrl.searchParams.get('depuis'));
  const db = emailsDb();

  try {
    // `depuis` ne filtre QUE les inscriptions : les sessions et les
    // professeurs sont peu nombreux et le classeur a besoin de les voir en
    // entier pour résoudre les identifiants.
    let requeteInscriptions = db
      .from('inscriptions')
      .select(CHAMPS_INSCRIPTION)
      .order('created_at', { ascending: true })
      .limit(MAX_LIGNES);
    if (depuis) requeteInscriptions = requeteInscriptions.gte('created_at', depuis);

    const [sessions, inscriptions, professeurs, revenus] = await Promise.all([
      db.from('sessions_bacs_blancs').select(CHAMPS_SESSION).order('date_epreuve').limit(500),
      requeteInscriptions,
      db.from('professeurs').select(CHAMPS_PROFESSEUR).limit(500),
      db.from('revenus_prof').select(CHAMPS_REVENU).order('created_at').limit(1000),
    ]);

    const erreur = sessions.error || inscriptions.error || professeurs.error || revenus.error;
    if (erreur) throw erreur;

    return NextResponse.json({
      genere_le: new Date().toISOString(),
      depuis,
      sessions: sessions.data ?? [],
      inscriptions: inscriptions.data ?? [],
      professeurs: professeurs.data ?? [],
      revenus_prof: revenus.data ?? [],
      tronque: (inscriptions.data?.length ?? 0) >= MAX_LIGNES,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[finances] lecture impossible :', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ----------------------------------------------------------------- POST ---

type CorpsPaiement = {
  action: 'paiement';
  inscription_id: string;
  statut: StatutPaiement;
  montant?: number | null;
  reference?: string | null;
  confirme_le?: string | null;
};

type CorpsReference = {
  action: 'reference';
  inscription_id: string;
  reference: string;
};

type CorpsFacture = {
  action: 'facture';
  inscription_id: string;
  destinataire_email: string;
  destinataire_nom?: string;
  numero_facture: string;
  montant: string;
  lien_pdf: string;
  date_emission: string;
};

type Corps = CorpsPaiement | CorpsReference | CorpsFacture;

export async function POST(req: NextRequest) {
  if (!secretValide(req.headers.get('x-finances-secret'))) return refuse();

  let corps: { actions?: Corps[] } | Corps;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON illisible' }, { status: 400 });
  }

  const actions: Corps[] = Array.isArray((corps as { actions?: Corps[] }).actions)
    ? (corps as { actions: Corps[] }).actions
    : [corps as Corps];

  if (!actions.length) return NextResponse.json({ error: 'Aucune action' }, { status: 400 });
  if (actions.length > 500) {
    return NextResponse.json({ error: 'Trop d’actions en une fois (500 maximum)' }, { status: 400 });
  }

  const resultats: { action: string; cible: string; ok: boolean; detail?: string }[] = [];

  for (const a of actions) {
    try {
      if (a.action === 'paiement') resultats.push(await appliquerPaiement(a));
      else if (a.action === 'reference') resultats.push(await appliquerReference(a));
      else if (a.action === 'facture') resultats.push(await enfilerFacture(a));
      else {
        resultats.push({
          action: String((a as { action?: string }).action ?? '?'),
          cible: '',
          ok: false,
          detail: 'Action inconnue',
        });
      }
    } catch (e) {
      resultats.push({
        action: a.action,
        cible: 'inscription_id' in a ? a.inscription_id : '',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const echecs = resultats.filter((r) => !r.ok);
  return NextResponse.json(
    {
      traitees: resultats.length,
      reussies: resultats.length - echecs.length,
      echouees: echecs.length,
      resultats,
    },
    { status: echecs.length && echecs.length === resultats.length ? 422 : 200 },
  );
}

async function appliquerPaiement(a: CorpsPaiement) {
  if (!a.inscription_id) throw new Error('inscription_id manquant');
  if (!(STATUTS_PAIEMENT as readonly string[]).includes(a.statut)) {
    throw new Error(`Statut de paiement refusé : ${a.statut}`);
  }

  const maj: Record<string, unknown> = { paiement_statut: a.statut };

  if (a.montant != null && a.montant !== undefined) {
    const n = Number(a.montant);
    if (!Number.isFinite(n) || n < 0) throw new Error('Montant invalide');
    maj.paiement_montant = Math.round(n * 100) / 100;
  }
  if (typeof a.reference === 'string' && a.reference.trim()) {
    maj.paiement_reference = a.reference.trim().slice(0, 120);
  }
  // La date de confirmation déclenche l'e-mail « paiement confirmé ». On ne
  // la pose que pour un paiement réellement encaissé, et on l'efface si on
  // repasse en attente : sinon la confirmation partirait à tort.
  if (a.statut === 'paye' || a.statut === 'offert') {
    maj.paiement_confirme_le = dateOuNull(a.confirme_le) ?? new Date().toISOString();
  } else if (a.statut === 'en_attente') {
    maj.paiement_confirme_le = null;
  }

  const { data, error } = await emailsDb()
    .from('inscriptions')
    .update(maj)
    .eq('id', a.inscription_id)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Inscription introuvable');

  // L'élève est venu avec le lien d'un prof ? Ses 10 € d'affiliation naissent
  // ici, au moment où l'argent rentre vraiment — jamais à l'inscription.
  await synchroniserAffiliation(a.inscription_id);

  return { action: 'paiement', cible: a.inscription_id, ok: true, detail: a.statut };
}

async function appliquerReference(a: CorpsReference) {
  if (!a.inscription_id) throw new Error('inscription_id manquant');
  const reference = String(a.reference ?? '').trim();
  if (!reference) throw new Error('Référence vide');

  const { data, error } = await emailsDb()
    .from('inscriptions')
    .update({ paiement_reference: reference.slice(0, 120) })
    .eq('id', a.inscription_id)
    .select('id');

  if (error) throw error;
  if (!data?.length) throw new Error('Inscription introuvable');

  return { action: 'reference', cible: a.inscription_id, ok: true, detail: reference };
}

async function enfilerFacture(a: CorpsFacture) {
  if (!a.inscription_id) throw new Error('inscription_id manquant');
  if (!a.destinataire_email?.trim()) throw new Error('Destinataire manquant');
  if (!a.numero_facture?.trim()) throw new Error('Numéro de facture manquant');
  if (!a.lien_pdf?.trim()) throw new Error('Lien du PDF manquant');

  // La clé d'idempotence porte le numéro de facture : réenvoyer la même
  // facture deux fois ne produira jamais deux e-mails.
  const cree = await enfiler([
    {
      type: 'facture_disponible',
      categorie: 'transactional',
      destinataire_email: a.destinataire_email,
      destinataire_nom: a.destinataire_nom ?? null,
      destinataire_role: 'parent',
      inscription_id: a.inscription_id,
      cle_idempotence: `facture_disponible:${a.numero_facture.trim()}`,
      planifie_le: new Date().toISOString(),
      declenche_par: 'classeur-finances',
      variables: {
        invoice_number: a.numero_facture.trim(),
        invoice_url: a.lien_pdf.trim(),
        invoice_date: a.date_emission ?? '',
        amount: String(a.montant ?? ''),
        first_name: (a.destinataire_nom ?? '').split(' ')[0] ?? '',
      },
    },
  ]);

  return {
    action: 'facture',
    cible: a.inscription_id,
    ok: true,
    detail: cree ? 'mise en file' : 'déjà en file (idempotence)',
  };
}
