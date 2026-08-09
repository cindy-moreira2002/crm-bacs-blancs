/**
 * Paiements — qui a payé, qui n'a pas payé, et où va l'argent.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * Partage des rôles, volontairement net :
 *   - le CRM sait QUI doit payer (une ligne par inscription) et relance ;
 *   - la COMPTABILITÉ vit dans le classeur de suivi financier (Google Sheets) :
 *     encaissements Revolut, factures des profs, Urssaf. Le site ne recopie pas
 *     ces chiffres, il pointe vers le classeur.
 *
 * L'adresse du classeur se pose une fois dans `SUIVI_FINANCIER_URL`. Variable
 * SERVEUR (pas de préfixe NEXT_PUBLIC_) : le lien du classeur ne doit pas être
 * embarqué dans le JavaScript envoyé à tous les navigateurs — seule la page
 * d'administration, rendue côté serveur, le connaît.
 */
import { crmAdmin } from '@/lib/authProf';

export type LignePaiement = {
  id: string;
  nom: string;
  email: string | null;
  matiere: string | null;
  date_epreuve: string | null;
  inscrit_le: string;
  jours_depuis: number;
  montant: number | null;
  /** Nombre de relances de paiement réellement parties. */
  relances: number;
};

export type EtatPaiements = {
  genere_le: string;
  /** Adresse du classeur de suivi financier, ou null si pas encore renseignée. */
  classeur_url: string | null;
  total_inscriptions: number;
  payes: number;
  en_attente: number;
  rembourses: number;
  annulees: number;
  encaisse: number;
  attendu: number;
  /** Prix d'une matinée, tel que réglé dans les e-mails. */
  montant_defaut: number;
  /**
   * Les instructions de virement (IBAN, référence) sont-elles renseignées ?
   * Sans elles, une relance de paiement part sans dire OÙ payer.
   */
  instructions_pretes: boolean;
  lignes: LignePaiement[];
};

/** Prix d'une matinée quand le réglage est illisible. */
const PRIX_DE_SECOURS = 0;

export function urlClasseurFinancier(): string | null {
  // L'ancien nom reste accepté : si la variable a déjà été posée avec le
  // préfixe NEXT_PUBLIC_, le bouton fonctionne quand même.
  const url = (
    process.env.SUIVI_FINANCIER_URL ??
    process.env.NEXT_PUBLIC_SUIVI_FINANCIER_URL ??
    ''
  ).trim();
  return url.startsWith('http') ? url : null;
}

export async function chargerPaiements(): Promise<EtatPaiements> {
  const db = crmAdmin();

  // Le prix et les instructions de virement vivent dans les réglages des
  // e-mails : c'est là qu'on les a saisis une fois pour toutes.
  const { data: reglages } = await db.from('email_reglages').select('cle, valeur');
  const reglage = (cle: string) =>
    ((reglages ?? []) as { cle: string; valeur: string | null }[]).find((r) => r.cle === cle)?.valeur ?? '';

  const montantDefaut = Number(reglage('paiement_montant_defaut')) || PRIX_DE_SECOURS;
  const instructionsPretes = reglage('paiement_instructions').trim().length > 0;

  const { data, error } = await db
    .from('inscriptions')
    .select(
      'id, nom, email, matiere, date_epreuve, created_at, paiement_statut, paiement_montant, annulee_le',
    )
    .order('created_at', { ascending: false });

  const lignesBrutes = (error ? [] : (data ?? [])) as {
    id: string;
    nom: string | null;
    email: string | null;
    matiere: string | null;
    date_epreuve: string | null;
    created_at: string;
    paiement_statut: string | null;
    paiement_montant: number | null;
    annulee_le: string | null;
  }[];

  const enAttente = lignesBrutes.filter(
    (l) => !l.annulee_le && (l.paiement_statut ?? 'en_attente') === 'en_attente',
  );

  // Combien de relances sont vraiment parties pour ces inscriptions ?
  const relances = new Map<string, number>();
  if (enAttente.length) {
    const { data: envois } = await db
      .from('emails')
      .select('inscription_id')
      .eq('type', 'paiement_attente')
      .in('statut', ['sent', 'delivered'])
      .in(
        'inscription_id',
        enAttente.map((l) => l.id),
      );
    for (const e of (envois ?? []) as { inscription_id: string | null }[]) {
      if (!e.inscription_id) continue;
      relances.set(e.inscription_id, (relances.get(e.inscription_id) ?? 0) + 1);
    }
  }

  const jours = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  const payes = lignesBrutes.filter((l) => l.paiement_statut === 'paye');

  return {
    genere_le: new Date().toISOString(),
    classeur_url: urlClasseurFinancier(),
    total_inscriptions: lignesBrutes.length,
    payes: payes.length,
    en_attente: enAttente.length,
    rembourses: lignesBrutes.filter((l) => l.paiement_statut === 'rembourse').length,
    annulees: lignesBrutes.filter((l) => l.annulee_le).length,
    encaisse: payes.reduce((s, l) => s + Number(l.paiement_montant ?? 0), 0),
    // Un montant non saisi vaut le prix par défaut : sinon « attendu : 0 € »
    // laisserait croire qu'il n'y a rien à encaisser.
    attendu: enAttente.reduce((s, l) => s + Number(l.paiement_montant ?? montantDefaut), 0),
    montant_defaut: montantDefaut,
    instructions_pretes: instructionsPretes,
    lignes: enAttente.map((l) => ({
      id: l.id,
      nom: l.nom ?? '—',
      email: l.email,
      matiere: l.matiere,
      date_epreuve: l.date_epreuve,
      inscrit_le: l.created_at,
      jours_depuis: jours(l.created_at),
      montant: l.paiement_montant,
      relances: relances.get(l.id) ?? 0,
    })),
  };
}
