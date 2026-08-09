/**
 * GET /api/admin/direction/etat — le résumé de la vue d'ensemble Direction.
 *
 * La page le rend déjà côté serveur ; cette route sert au bouton
 * « Actualiser », pour rafraîchir les chiffres sans recharger l'écran.
 */
import { NextResponse } from 'next/server';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { chargerResumeDirection } from '@/lib/direction';

export const dynamic = 'force-dynamic';

export async function GET() {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    return NextResponse.json(await chargerResumeDirection());
  } catch (err) {
    console.error('❌ /api/admin/direction/etat', err);
    return NextResponse.json({ error: 'Impossible de charger le résumé.' }, { status: 500 });
  }
}
