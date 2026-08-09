/**
 * GET — le tableau de calibration d'un brevet blanc de français (?examId=…).
 *
 * Écarts IA / humain copie par copie et question par question, faux positifs,
 * faux négatifs, couverture des niveaux, et la réponse à « est-ce prêt pour la
 * production ? » — qui reste non tant que le corpus humain n'existe pas.
 */
import { NextRequest } from 'next/server';
import { lireCalibration } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return lireCalibration(req, 'brevet_francais');
}
