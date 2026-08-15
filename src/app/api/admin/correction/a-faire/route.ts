/**
 * GET — la liste de ce qu'il reste à faire, matière par matière, en français
 * simple. Alimente /admin/a-faire.
 *
 * Réservé à l'administratrice : la réponse cite des identifiants de sujets et
 * l'état interne des barèmes.
 */
import { NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant } from '@/lib/pipeline';
import { chargerTodo } from '@/lib/pipelineTodo';

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
    return NextResponse.json(await chargerTodo());
  } catch (err) {
    console.error('❌ /api/admin/correction/a-faire', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
