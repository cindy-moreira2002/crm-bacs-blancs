/**
 * GET  — l'écran d'un brevet blanc de français : examen, barème actif, calibration.
 * POST — les actions : maj, verifier, verrouiller, ouvrir_corrections,
 *        nouvelle_version.
 *
 * Un examen qui n'est pas un DNB de français renvoie 404 : ouvrir l'URL avec
 * l'identifiant d'un examen de mathématiques ou d'un bac blanc ne montre rien.
 */
import { NextRequest } from 'next/server';
import { agirSurExamen, lireExamen } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return lireExamen(examId, 'brevet_francais');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return agirSurExamen(req, examId, 'brevet_francais');
}
