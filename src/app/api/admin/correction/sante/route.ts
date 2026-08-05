/**
 * GET — santé du système de correction : inventaire exhaustif (tables et
 * stockage, comparés au schéma réel) + toutes les anomalies détectées.
 *
 * Appelée à l'ouverture de la page et sur demande — pas de polling : elle
 * charge les JSON des barèmes, on ménage l'egress Supabase.
 */
import { NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant } from '@/lib/pipeline';
import { chargerSante } from '@/lib/pipelineSante';

export const dynamic = 'force-dynamic';

export async function GET() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }
  if (pipelineManquant().length) {
    return NextResponse.json({ error: 'Pipeline non configuré' }, { status: 503 });
  }

  try {
    return NextResponse.json(await chargerSante());
  } catch (err) {
    console.error('❌ /api/admin/correction/sante', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
