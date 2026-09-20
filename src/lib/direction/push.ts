/**
 * Notifications push de la Direction.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Principe : chaque téléphone (ou ordinateur) qui a installé l'application
 * enregistre un « abonnement » — une adresse chiffrée fournie par Apple ou
 * Google, valable pour CE navigateur-là. On la range dans
 * `direction_abonnements_push`, reliée au professeur connecté. Envoyer une
 * notification à la direction, c'est donc écrire une fois et pousser à tous
 * les abonnements des comptes qui ont le droit d'entrer.
 *
 * Deux principes de robustesse :
 *  - **silencieux sans clés VAPID** : tant que les clés ne sont pas posées sur
 *    Vercel, tout le reste (l'app, les écrans, la validation des e-mails)
 *    fonctionne — seules les notifications ne partent pas. Jamais d'erreur ;
 *  - **un abonnement mort se supprime tout seul** : quand Apple ou Google
 *    répond 404/410, l'appareil a désinstallé l'app ou révoqué la permission.
 *    On efface la ligne au lieu de réessayer indéfiniment.
 */
import webpush from 'web-push';
import { crmAdmin } from '@/lib/authProf';

export const TABLE_ABONNEMENTS = 'direction_abonnements_push';

const clePublique = process.env.VAPID_PUBLIC_KEY ?? '';
const clePrivee = process.env.VAPID_PRIVATE_KEY ?? '';
const sujet = process.env.VAPID_SUBJECT ?? 'mailto:matineesdubac@gmail.com';

/** Les clés sont-elles posées ? Sans elles, on n'envoie rien (sans casser). */
export function pushConfigure(): boolean {
  return Boolean(clePublique && clePrivee);
}

/** La clé publique, que le navigateur doit connaître pour s'abonner. */
export function clePubliqueVapid(): string {
  return clePublique;
}

let pret = false;
function preparer() {
  if (pret || !pushConfigure()) return;
  webpush.setVapidDetails(sujet, clePublique, clePrivee);
  pret = true;
}

export type Abonnement = {
  endpoint: string;
  cles: { p256dh: string; auth: string };
};

/** Enregistre (ou rafraîchit) l'abonnement d'un appareil pour ce professeur. */
export async function enregistrerAbonnement(
  professeurId: string,
  abo: Abonnement,
  appareil: string | null,
): Promise<void> {
  const { error } = await crmAdmin()
    .from(TABLE_ABONNEMENTS)
    .upsert(
      {
        professeur_id: professeurId,
        endpoint: abo.endpoint,
        p256dh: abo.cles.p256dh,
        auth: abo.cles.auth,
        appareil: appareil ? appareil.slice(0, 200) : null,
        vu_le: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
  if (error) throw error;
}

export async function supprimerAbonnement(endpoint: string): Promise<void> {
  await crmAdmin().from(TABLE_ABONNEMENTS).delete().eq('endpoint', endpoint);
}

/** Cet appareil est-il déjà abonné ? (pour afficher le bon bouton) */
export async function abonnementConnu(endpoint: string): Promise<boolean> {
  const { count } = await crmAdmin()
    .from(TABLE_ABONNEMENTS)
    .select('endpoint', { count: 'exact', head: true })
    .eq('endpoint', endpoint);
  return (count ?? 0) > 0;
}

export type Notification = {
  titre: string;
  corps: string;
  /** Écran à ouvrir quand on tape la notification. */
  url?: string;
  /** Même `tag` = la notification remplace la précédente au lieu de s'empiler. */
  tag?: string;
  /** Ne pas notifier ce professeur-là (celui qui vient de faire l'action). */
  saufProfesseurId?: string;
};

export type RapportPush = { envoyes: number; supprimes: number; erreurs: number };

/**
 * Pousse une notification à toute la direction.
 *
 * Ne lève jamais : une notification ratée ne doit pas faire échouer l'action
 * qui l'a déclenchée (une inscription enregistrée reste enregistrée, même si
 * le téléphone de Cindy est injoignable).
 */
export async function notifierDirection(n: Notification): Promise<RapportPush> {
  const rapport: RapportPush = { envoyes: 0, supprimes: 0, erreurs: 0 };
  if (!pushConfigure()) return rapport;
  preparer();

  try {
    const { data, error } = await crmAdmin()
      .from(TABLE_ABONNEMENTS)
      .select('endpoint, p256dh, auth, professeur_id');
    if (error) throw error;

    const lignes = (data ?? []) as {
      endpoint: string;
      p256dh: string;
      auth: string;
      professeur_id: string;
    }[];

    const charge = JSON.stringify({
      titre: n.titre,
      corps: n.corps,
      url: n.url ?? '/direction',
      tag: n.tag,
    });

    await Promise.all(
      lignes
        .filter((l) => l.professeur_id !== n.saufProfesseurId)
        .map(async (l) => {
          try {
            await webpush.sendNotification(
              { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
              charge,
              { TTL: 3600 },
            );
            rapport.envoyes += 1;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) {
              await supprimerAbonnement(l.endpoint);
              rapport.supprimes += 1;
            } else {
              rapport.erreurs += 1;
              console.error('⚠️ push direction', code, err);
            }
          }
        }),
    );
  } catch (err) {
    console.error('⚠️ notifierDirection', err);
  }

  return rapport;
}
