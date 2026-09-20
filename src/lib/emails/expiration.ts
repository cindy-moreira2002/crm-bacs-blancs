/**
 * L'expiration des inscriptions non réglées.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * Règle posée par Cindy : une inscription vaut réservation de place, et la
 * place n'est tenue que le temps du règlement (`paiement_delai_minutes`,
 * 10 minutes par défaut). Passé ce délai sans virement enregistré :
 *
 *   1. l'inscription est marquée annulée en base — sans quoi l'e-mail
 *      d'annulation mentirait, et la place resterait bloquée ;
 *   2. tout ce qui restait en file pour cet élève est annulé (rappels,
 *      informations pratiques : ils n'ont plus lieu d'être) ;
 *   3. un e-mail part au PARENT et à lui seul, pour lui dire que la place
 *      n'a pas été retenue et comment la reprendre.
 *
 * Ce que ce module ne fait JAMAIS :
 *   - toucher à une inscription déjà réglée, offerte, remboursée ou annulée ;
 *   - toucher à une inscription antérieure à la mise en service du système
 *     (`actif_depuis`) — la base contient encore des sessions d'essai, et
 *     une purge rétroactive annulerait des lignes qu'on n'a jamais relancées ;
 *   - envoyer quoi que ce soit : il MET EN FILE. Le message attend le feu
 *     vert de l'administration comme tous les autres (`validation_manuelle`).
 *
 * Interrupteur : réglage `paiement_expiration_active`. Sur « non », rien
 * n'est annulé et aucun message d'expiration n'est préparé.
 */
import { emailsDb } from './client';
import { enfiler, annulerPourInscription, type TacheEmail } from './file';
import { chargerReglages, expirationActive, type Reglages } from './reglages';
import { estEmail, variablesEleve } from './donnees';
import type { LigneInscription } from './donnees';

export type RapportExpiration = {
  actif: boolean;
  /** Inscriptions dont le délai est dépassé et qui viennent d'être annulées. */
  expirees: number;
  /** Messages d'annulation mis en file (un par parent joignable). */
  messages: number;
  /** Messages devenus sans objet et annulés dans la file. */
  nettoyes: number;
};

/** Les colonnes nécessaires pour décider, et pour écrire l'e-mail. */
const CHAMPS =
  'id, nom, email, email_parent, matiere, date_epreuve, session_id, created_at, ' +
  'paiement_statut, paiement_montant, paiement_reference, statut_eleve, annulee_le, ' +
  'email_envoye, discord_salon_id';

export async function expirerInscriptionsImpayees(
  reglagesFournis?: Reglages,
  maintenant = new Date(),
): Promise<RapportExpiration> {
  const r = reglagesFournis ?? (await chargerReglages());
  const vide: RapportExpiration = { actif: false, expirees: 0, messages: 0, nettoyes: 0 };
  if (!expirationActive(r)) return vide;

  const delaiMs = Math.max(1, r.paiement_delai_minutes) * 60_000;
  const limite = new Date(maintenant.getTime() - delaiMs).toISOString();
  // `actif_depuis` protège les inscriptions d'essai déjà en base : on n'annule
  // jamais une ligne antérieure à la mise en service du système.
  const plancher = r.actif_depuis;

  const db = emailsDb();
  const { data, error } = await db
    .from('inscriptions')
    .select(CHAMPS)
    .eq('paiement_statut', 'en_attente')
    .is('annulee_le', null)
    .lt('created_at', limite)
    .gte('created_at', plancher)
    .limit(200);

  if (error) throw error;

  const candidates = ((data ?? []) as unknown as LigneInscription[]).filter(
    (i) => i.statut_eleve !== 'annule',
  );
  if (!candidates.length) return { ...vide, actif: true };

  const taches: TacheEmail[] = [];
  let expirees = 0;
  let nettoyes = 0;

  for (const i of candidates) {
    // 1. L'annulation en base. Le filtre reprend les mêmes conditions : si un
    //    virement a été pointé entre la lecture et l'écriture, l'UPDATE ne
    //    touche rien et l'inscription est laissée tranquille.
    const { data: annulee, error: errAnnul } = await db
      .from('inscriptions')
      .update({ statut_eleve: 'annule', annulee_le: maintenant.toISOString() })
      .eq('id', i.id)
      .eq('paiement_statut', 'en_attente')
      .is('annulee_le', null)
      .select('id');

    if (errAnnul) {
      console.error('⚠️ Expiration : annulation impossible', i.id, errAnnul.message);
      continue;
    }
    if (!annulee?.length) continue; // quelqu'un a réglé entre-temps

    expirees++;

    // 2. Ce qui restait en file pour cet élève n'a plus d'objet.
    try {
      nettoyes += await annulerPourInscription(i.id, 'inscription annulée — paiement non reçu');
    } catch (err) {
      console.error('⚠️ Expiration : file non nettoyée', i.id, err);
    }

    // 3. Le message au parent. Pas de parent joignable = pas de message ;
    //    l'inscription reste annulée pour autant, la place doit être rendue.
    if (!estEmail(i.email_parent)) continue;

    const variables = variablesEleve({
      inscription: i,
      session: null,
      instructionsPaiement: r.paiement_instructions,
      montantDefaut: r.paiement_montant_defaut,
      ibanPaiement: r.paiement_iban,
      titulairePaiement: r.paiement_titulaire,
      bicPaiement: r.paiement_bic,
      delaiPaiementMinutes: r.paiement_delai_minutes,
    });

    taches.push({
      type: 'inscription_expiree',
      categorie: 'transactional',
      destinataire_email: i.email_parent as string,
      destinataire_nom: null,
      destinataire_role: 'parent',
      inscription_id: i.id,
      session_id: i.session_id ?? null,
      // Une seule annulation par inscription, quoi qu'il arrive : la clé
      // d'idempotence ne porte pas la date.
      cle_idempotence: `inscription_expiree:inscription:${i.id}`,
      planifie_le: maintenant.toISOString(),
      variables,
      declenche_par: 'expiration-paiement',
    });
  }

  const messages = taches.length ? await enfiler(taches) : 0;
  return { actif: true, expirees, messages, nettoyes };
}
