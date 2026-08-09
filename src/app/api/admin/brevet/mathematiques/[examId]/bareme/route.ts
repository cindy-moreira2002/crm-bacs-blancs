/**
 * PUT — enregistrer le barème d'un brevet blanc de mathématiques.
 *
 * Refuse d'écrire sur une version verrouillée (le trigger en base le refuse
 * aussi), et refuse toute clé qui appartient au barème de français : les
 * deux matières ne partagent aucune règle pédagogique.
 */
import { NextRequest } from 'next/server';
import { enregistrerBaremeBrevet } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return enregistrerBaremeBrevet(req, examId, 'brevet_mathematiques');
}
