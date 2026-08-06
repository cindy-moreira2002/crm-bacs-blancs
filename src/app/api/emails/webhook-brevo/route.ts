/**
 * POST /api/emails/webhook-brevo — les événements renvoyés par Brevo.
 *
 * Brevo ne signe pas ses webhooks : la protection est un jeton secret placé
 * dans l'URL enregistrée chez eux (`?jeton=…`). Ce jeton n'est PAS la clé
 * d'API : même divulgué, il ne permet que d'écrire des statuts d'e-mails.
 *
 * On ne fait jamais confiance au contenu reçu :
 *  - on ne met à jour que des lignes qu'on retrouve par leur identifiant de
 *    message Brevo (ou, à défaut, par adresse + envoi très récent) ;
 *  - un statut ne « recule » jamais (un message délivré ne redevient pas
 *    envoyé) ;
 *  - une désinscription ou un rejet définitif met à jour le contact, ce qui
 *    empêche tout envoi commercial ultérieur.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { emailsDb } from '@/lib/emails/client';
import { desinscrire, marquerBounce, marquerPlainte } from '@/lib/emails/file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jetonValide(recu: string | null): boolean {
  const attendu = process.env.EMAILS_WEBHOOK_SECRET ?? '';
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type EvenementBrevo = {
  event?: string;
  email?: string;
  'message-id'?: string;
  messageId?: string;
  reason?: string;
  tag?: string;
  ts?: number;
};

export async function POST(req: NextRequest) {
  if (!jetonValide(req.nextUrl.searchParams.get('jeton'))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
  }

  let charge: EvenementBrevo | EvenementBrevo[];
  try {
    charge = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps illisible' }, { status: 400 });
  }

  const evenements = Array.isArray(charge) ? charge : [charge];
  let traites = 0;

  for (const e of evenements.slice(0, 100)) {
    try {
      if (await traiterEvenement(e)) traites++;
    } catch (err) {
      console.error('⚠️ Webhook Brevo — événement ignoré :', err);
    }
  }

  // Toujours 200 : un webhook qui échoue est réémis en boucle par Brevo.
  return NextResponse.json({ ok: true, traites });
}

async function traiterEvenement(e: EvenementBrevo): Promise<boolean> {
  const evenement = String(e.event ?? '').toLowerCase();
  const email = String(e.email ?? '').trim().toLowerCase();
  const messageId = String(e['message-id'] ?? e.messageId ?? '').trim();
  if (!evenement) return false;

  const db = emailsDb();
  const maintenant = new Date().toISOString();

  // 1. Retrouver la ligne concernée.
  let ligneId: string | null = null;
  let statutActuel: string | null = null;

  if (messageId) {
    const { data } = await db
      .from('emails')
      .select('id, statut')
      .eq('brevo_message_id', messageId)
      .maybeSingle();
    if (data) {
      ligneId = (data as { id: string }).id;
      statutActuel = (data as { statut: string }).statut;
    }
  }
  if (!ligneId && email) {
    // Repli : le message le plus récemment envoyé à cette adresse.
    const { data } = await db
      .from('emails')
      .select('id, statut')
      .eq('destinataire_email', email)
      .in('statut', ['sent', 'delivered'])
      .order('envoye_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      ligneId = (data as { id: string }).id;
      statutActuel = (data as { statut: string }).statut;
    }
  }

  // 2. Mettre à jour le message.
  const maj: Record<string, unknown> = {};
  switch (evenement) {
    case 'delivered':
      if (statutActuel !== 'delivered') maj.statut = 'delivered';
      break;
    case 'opened':
    case 'unique_opened':
      maj.ouvert_le = maintenant;
      if (statutActuel === 'sent') maj.statut = 'delivered';
      break;
    case 'click':
    case 'clicked':
      maj.clique_le = maintenant;
      if (statutActuel === 'sent') maj.statut = 'delivered';
      break;
    case 'soft_bounce':
    case 'deferred':
      maj.derniere_erreur = `rejet temporaire : ${e.reason ?? 'sans motif'}`;
      break;
    case 'hard_bounce':
    case 'blocked':
    case 'invalid_email':
    case 'error':
      maj.statut = 'failed';
      maj.derniere_erreur = `rejet définitif : ${e.reason ?? 'sans motif'}`;
      break;
    case 'spam':
    case 'complaint':
    case 'unsubscribed':
    case 'list_addition':
      break;
    default:
      break;
  }

  if (ligneId && Object.keys(maj).length) {
    await db.from('emails').update(maj).eq('id', ligneId);
  }

  // 3. Mettre à jour l'état du contact — c'est ce qui protège les envois futurs.
  if (email) {
    if (evenement === 'hard_bounce' || evenement === 'invalid_email' || evenement === 'blocked') {
      await marquerBounce(email, String(e.reason ?? evenement));
    } else if (evenement === 'spam' || evenement === 'complaint') {
      await marquerPlainte(email);
    } else if (evenement === 'unsubscribed') {
      await desinscrire(email, 'désinscription depuis un e-mail Brevo');
    } else {
      await emailsDb()
        .from('email_contacts')
        .upsert({ email, derniere_activite: maintenant }, { onConflict: 'email' });
    }
  }

  return true;
}
