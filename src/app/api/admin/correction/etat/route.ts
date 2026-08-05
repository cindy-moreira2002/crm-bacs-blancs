/**
 * GET — l'état complet du pipeline de correction, pour /admin/correction.
 *
 * Réservé à l'administratrice : la réponse contient des noms d'élèves, des
 * emails de profs et l'état interne des barèmes.
 */
import { NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant } from '@/lib/pipeline';
import { chargerEtatPipeline } from '@/lib/pipelineEtat';

export const dynamic = 'force-dynamic';

export async function GET() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }

  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    return NextResponse.json(await chargerEtatPipeline());
  } catch (err) {
    console.error('❌ /api/admin/correction/etat', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
