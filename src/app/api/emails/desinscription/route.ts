/**
 * Désinscription des messages commerciaux.
 *
 * POST — utilisé par le bouton de la page /desinscription ET par la
 * désinscription « en un clic » des messageries (en-tête List-Unsubscribe).
 *
 * Le jeton est signé : on ne peut désinscrire que l'adresse qu'il porte.
 * Aucune adresse n'apparaît en clair dans l'URL.
 *
 * Les messages indispensables à une inscription en cours (convocation, lien
 * de connexion, correction) continuent d'être envoyés : c'est légitime et
 * c'est ce que la personne attend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { desinscrire } from '@/lib/emails/file';
import { lireJetonDesinscription } from '@/lib/emails/desinscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let jeton = req.nextUrl.searchParams.get('jeton');

  if (!jeton) {
    const type = req.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      const corps = (await req.json().catch(() => ({}))) as { jeton?: string };
      jeton = corps.jeton ?? null;
    } else if (type.includes('form')) {
      const form = await req.formData().catch(() => null);
      jeton = (form?.get('jeton') as string | null) ?? null;
    }
  }

  const email = lireJetonDesinscription(jeton);
  if (!email) {
    return NextResponse.json({ error: 'Lien de désinscription invalide ou expiré.' }, { status: 400 });
  }

  try {
    await desinscrire(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ Désinscription', err);
    return NextResponse.json({ error: 'Erreur lors de la désinscription.' }, { status: 500 });
  }
}
