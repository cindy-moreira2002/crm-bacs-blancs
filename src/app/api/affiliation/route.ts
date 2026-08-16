/**
 * GET /api/affiliation?code=CLAIRE3F7B — « ce code existe-t-il ? »
 *
 * Appelée par le formulaire d'inscription pendant que l'élève tape, pour
 * afficher « ✅ Recommandé par Claire M. » plutôt que de laisser partir un
 * code fautif qu'on ne verrait jamais.
 *
 * Ne renvoie QUE le prénom et l'initiale du nom : on confirme un code déjà
 * connu de la personne, on ne publie pas l'annuaire des professeurs. Aucune
 * liste : sans code exact en entrée, rien ne sort.
 */
import { NextRequest, NextResponse } from 'next/server';
import { nomCourt, normaliserCode, profParCode } from '@/lib/affiliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = normaliserCode(req.nextUrl.searchParams.get('code'));
  if (code.length < 4) {
    return NextResponse.json({ connu: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const prof = await profParCode(code);
  return NextResponse.json(
    prof ? { connu: true, code, prof: nomCourt(prof) } : { connu: false, code },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
