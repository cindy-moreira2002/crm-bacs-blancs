/**
 * GET — les copies de français corrigées par le moteur « brevet_francais ».
 *
 * Filtres : ?examId=… et ?aVerifier=1 pour ne voir que celles qui attendent
 * une validation humaine.
 */
import { NextRequest } from 'next/server';
import { listerCopies } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return listerCopies(req, 'brevet_francais');
}
