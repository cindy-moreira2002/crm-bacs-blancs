/**
 * GET  — les brevets blancs de français et leurs barèmes.
 * POST — créer un brevet blanc de français, avec sa version 1.0 vide.
 *
 * Cette route ne voit QUE la matière « brevet_francais ». Les brevets blancs de
 * mathématiques ont la leur, et les bacs blancs restent sur /api/admin/bareme.
 * La matière n'est jamais lue dans le corps de la requête : elle est écrite
 * ici, en dur. Aucun appel ne peut donc la détourner.
 */
import { NextRequest } from 'next/server';
import { creerExamen, listerExamens } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  return listerExamens('brevet_francais');
}

export async function POST(req: NextRequest) {
  return creerExamen(req, 'brevet_francais');
}
