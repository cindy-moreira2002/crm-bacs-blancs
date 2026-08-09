/**
 * GET  — les brevets blancs de mathématiques et leurs barèmes.
 * POST — créer un brevet blanc de mathématiques, avec sa version 1.0 vide.
 *
 * Cette route ne voit QUE la matière « brevet_mathematiques ». Les brevets blancs de
 * français ont la leur, et les bacs blancs restent sur /api/admin/bareme.
 * La matière n'est jamais lue dans le corps de la requête : elle est écrite
 * ici, en dur. Aucun appel ne peut donc la détourner.
 */
import { NextRequest } from 'next/server';
import { creerExamen, listerExamens } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  return listerExamens('brevet_mathematiques');
}

export async function POST(req: NextRequest) {
  return creerExamen(req, 'brevet_mathematiques');
}
