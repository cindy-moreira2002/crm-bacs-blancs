/**
 * GET /api/direction/compteurs — les quatre chiffres de la Direction.
 *
 * Appelée en boucle par l'écran (toutes les 20 s, et à chaque retour sur
 * l'onglet). Elle ne renvoie QUE des nombres, calculés en `count: exact` :
 * quelques octets par appel, pas de lignes rapatriées.
 *
 * Pourquoi pas un flux SSE : une connexion ouverte en permanence est facturée
 * en temps de calcul sur Vercel, et plusieurs téléphones qui la gardent ouverte
 * toute la journée ont déjà fait sauter le quota sur un autre projet. Un appel
 * court toutes les 20 secondes coûte, lui, presque rien — et les urgences
 * passent de toute façon par la notification push, pas par l'écran ouvert.
 */
import { NextResponse } from 'next/server';
import { chargerCompteurs } from '@/lib/direction/compteurs';
import { gardeApiAdmin } from '@/lib/gardeAcces';

export const dynamic = 'force-dynamic';

export async function GET() {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    return NextResponse.json(await chargerCompteurs());
  } catch (err) {
    console.error('❌ /api/direction/compteurs', err);
    return NextResponse.json({ error: 'Compteurs indisponibles' }, { status: 500 });
  }
}
