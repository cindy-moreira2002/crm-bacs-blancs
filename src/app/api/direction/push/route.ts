/**
 * /api/direction/push — l'abonnement d'un appareil aux notifications.
 *
 *   GET    → la clé publique VAPID (+ l'état de l'appareil s'il se présente)
 *   POST   → abonner cet appareil-ci au compte connecté
 *   DELETE → le désabonner
 *
 * Réservé à la direction : un abonnement est nominatif, il reçoit des
 * informations d'élèves (« paiement reçu pour Léa D. »).
 */
import { NextRequest, NextResponse } from 'next/server';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { profConnecte } from '@/lib/authProf';
import {
  abonnementConnu,
  clePubliqueVapid,
  enregistrerAbonnement,
  notifierDirection,
  pushConfigure,
  supprimerAbonnement,
} from '@/lib/direction/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  const endpoint = req.nextUrl.searchParams.get('endpoint');
  let abonne = false;
  if (endpoint) {
    try {
      abonne = await abonnementConnu(endpoint);
    } catch {
      abonne = false;
    }
  }
  return NextResponse.json({ configure: pushConfigure(), clePublique: clePubliqueVapid(), abonne });
}

export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;
  const moi = await profConnecte();
  if (!moi) return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });

  let corps: Record<string, unknown>;
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  // Un envoi d'essai, déclenché par le bouton « Envoyer un test » : il ne part
  // qu'à l'appareil qui le demande, pour vérifier la chaîne de bout en bout.
  if (corps.test === true) {
    const rapport = await notifierDirection({
      titre: '🧭 Direction',
      corps: 'Les notifications fonctionnent sur cet appareil.',
      url: '/direction',
      tag: 'test',
    });
    return NextResponse.json({ ok: rapport.envoyes > 0, ...rapport });
  }

  const abo = corps.abonnement as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined;
  if (!abo?.endpoint || !abo.keys?.p256dh || !abo.keys?.auth) {
    return NextResponse.json({ error: 'Abonnement incomplet' }, { status: 400 });
  }

  try {
    await enregistrerAbonnement(
      moi.id,
      { endpoint: abo.endpoint, cles: { p256dh: abo.keys.p256dh, auth: abo.keys.auth } },
      req.headers.get('user-agent'),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ POST /api/direction/push', err);
    return NextResponse.json(
      { error: 'Impossible d’enregistrer l’abonnement. La table est-elle créée ?' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'endpoint manquant' }, { status: 400 });
  await supprimerAbonnement(endpoint);
  return NextResponse.json({ ok: true });
}
