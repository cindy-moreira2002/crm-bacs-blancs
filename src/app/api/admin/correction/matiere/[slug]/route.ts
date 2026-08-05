/**
 * GET — le détail complet d'une matière pour la vue « tout voir » de
 * /admin/correction : grilles avec critères, sujets avec pièges, étalons avec
 * notes, gabarits, corrections, retours, diagnostics.
 *
 * Réservé à l'administratrice : contient le lien de relecture signé (qui vaut
 * mot de passe), des noms d'élèves et l'état interne des barèmes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant } from '@/lib/pipeline';
import { chargerDetailMatiere } from '@/lib/pipelineDetail';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }
  if (pipelineManquant().length) {
    return NextResponse.json({ error: 'Pipeline non configuré' }, { status: 503 });
  }

  try {
    const { slug } = await params;
    const detail = await chargerDetailMatiere(slug);
    if (!detail) {
      return NextResponse.json({ error: `Matière inconnue : ${slug}` }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error('❌ /api/admin/correction/matiere', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
