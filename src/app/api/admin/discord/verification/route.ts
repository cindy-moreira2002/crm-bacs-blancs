/**
 * Contrôle de la configuration Discord — réservé à l'administratrice.
 *
 * GET  : vérification en lecture seule. Ne crée rien, ne supprime rien.
 * POST : vérification complète, avec création puis suppression d'un salon de
 *        test. C'est la seule preuve réelle que la chaîne fonctionne.
 *
 * Pourquoi cette route existe : les secrets Discord sont marqués « Sensitive »
 * dans Vercel et ne sortent donc jamais du serveur. Aucun outil extérieur ne
 * peut tester la configuration — seul le serveur le peut.
 */
import { NextResponse } from 'next/server';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { verifierDiscord } from '@/lib/discord/verification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function repondre(avecEcriture: boolean) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    return NextResponse.json(await verifierDiscord(avecEcriture));
  } catch (err) {
    // Un imprévu ne doit jamais renvoyer une trace technique au navigateur.
    console.error('❌ /api/admin/discord/verification', err);
    return NextResponse.json(
      { error: 'La vérification n’a pas pu aller au bout.' },
      { status: 500 },
    );
  }
}

export function GET() {
  return repondre(false);
}

export function POST() {
  return repondre(true);
}
