/**
 * GET /api/admin/emails/etat — tout ce qu'affiche la page /admin/emails.
 *
 * Réservé à l'administratrice : la réponse contient des adresses d'élèves,
 * de parents et de professeurs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { chargerSnapshotEmails } from '@/lib/emails/admin';
import { emailsManquant } from '@/lib/emails/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  try {
    const snapshot = await chargerSnapshotEmails({
      statut: p.get('statut') ?? undefined,
      categorie: p.get('categorie') ?? undefined,
      type: p.get('type') ?? undefined,
      matiere: p.get('matiere') ?? undefined,
      session: p.get('session') ?? undefined,
      role: p.get('role') ?? undefined,
      depuis: p.get('depuis') ?? undefined,
      jusqua: p.get('jusqua') ?? undefined,
      recherche: p.get('recherche') ?? undefined,
      limite: p.get('limite') ? Number(p.get('limite')) : undefined,
    });
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('❌ /api/admin/emails/etat', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Erreur inconnue',
        manquants: emailsManquant(),
      },
      { status: 500 },
    );
  }
}
