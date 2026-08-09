/**
 * Salles Discord des bacs blancs — réservé à l'administratrice.
 *
 * GET  : l'état, en lecture seule (ne crée rien sur Discord).
 * POST : une action nommée — préparer, verrouiller, supprimer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import {
  chargerEtatSalons,
  preparerSalles,
  supprimerCategorie,
  verrouillerSalles,
} from '@/lib/discord/salons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    return NextResponse.json(await chargerEtatSalons());
  } catch (err) {
    console.error('❌ /api/admin/discord/salons GET', err);
    return NextResponse.json({ error: 'Impossible de lire l’état des salles.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    const corps = await req.json();
    const action = String(corps.action ?? '');

    switch (action) {
      case 'preparer':
        return NextResponse.json(await preparerSalles(String(corps.session_id)));
      case 'verrouiller':
        return NextResponse.json(await verrouillerSalles(String(corps.categorie_id)));
      case 'supprimer':
        return NextResponse.json(await supprimerCategorie(String(corps.categorie_id)));
      default:
        return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }
  } catch (err) {
    console.error('❌ /api/admin/discord/salons POST', err);
    return NextResponse.json({ error: 'L’action n’a pas pu aller au bout.' }, { status: 500 });
  }
}
