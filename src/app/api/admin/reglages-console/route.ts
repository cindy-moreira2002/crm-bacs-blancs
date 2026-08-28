/**
 * Les deux adresses du jour J : la grille de correction et le dossier des
 * copies. Elles se posent UNE fois et servent à tous les bacs blancs.
 *
 * GET  : les valeurs actuelles.
 * POST : { cle, valeur } — une adresse vide efface.
 *
 * Réservé à l'administratrice : ce sont des adresses vues par tous les profs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { CLES_CONSOLE, chargerReglagesConsole, enregistrerReglageConsole } from '@/lib/reglagesConsole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function refuserSiPasAdmin() {
  const moi = await profConnecte();
  if (!moi) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  if (moi.role !== 'admin') return NextResponse.json({ error: 'Accès réservé.' }, { status: 403 });
  return null;
}

export async function GET() {
  const refus = await refuserSiPasAdmin();
  if (refus) return refus;

  return NextResponse.json({ reglages: await chargerReglagesConsole() });
}

export async function POST(req: NextRequest) {
  const refus = await refuserSiPasAdmin();
  if (refus) return refus;

  try {
    const body = await req.json();
    const cle = String(body.cle ?? '');
    if (!CLES_CONSOLE.includes(cle as (typeof CLES_CONSOLE)[number])) {
      return NextResponse.json({ error: 'Réglage inconnu.' }, { status: 400 });
    }

    const resultat = await enregistrerReglageConsole(
      cle as (typeof CLES_CONSOLE)[number],
      String(body.valeur ?? ''),
    );
    if (!resultat.ok) return NextResponse.json({ error: resultat.erreur }, { status: 400 });

    return NextResponse.json({ success: true, reglages: await chargerReglagesConsole() });
  } catch (err) {
    console.error('❌ /api/admin/reglages-console POST', err);
    return NextResponse.json({ error: 'Erreur.' }, { status: 500 });
  }
}
