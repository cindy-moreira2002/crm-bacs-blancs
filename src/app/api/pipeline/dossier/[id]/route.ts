import { NextRequest, NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET — sert le dossier de correction en HTML, pret a imprimer.
 * `id` = identifiant de la correction (le plus recent dossier est servi).
 *
 * Le HTML est produit par Claude : on le sert avec une CSP verrouillee
 * (aucun script, aucune ressource externe) pour qu'il ne puisse rien executer.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    const { id } = await params;
    const db = pipelineDb();

    const { data, error } = await db
      .from('dossiers')
      .select('id, content, created_at')
      .eq('correction_id', id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    const dossier = data?.[0];
    if (!dossier?.content) {
      return new NextResponse('Dossier pas encore disponible.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return new NextResponse(dossier.content, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('❌ /api/pipeline/dossier/[id]', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
