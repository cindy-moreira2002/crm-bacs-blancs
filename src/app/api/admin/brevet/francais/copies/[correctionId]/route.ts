/**
 * GET  — le détail complet d'une copie de français : questions, blocs propres à
 *        la matière, qualité documentaire, validations, retouches humaines.
 * POST — les actions du correcteur : retoucher, trancher_dictee,
 *        traiter_validation, valider, relancer_correction.
 *
 * Une copie corrigée par un autre moteur renvoie 404.
 */
import { NextRequest } from 'next/server';
import { agirSurCopie, lireCopie } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ correctionId: string }> },
) {
  const { correctionId } = await params;
  return lireCopie(correctionId, 'brevet_francais');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ correctionId: string }> },
) {
  const { correctionId } = await params;
  return agirSurCopie(req, correctionId, 'brevet_francais');
}
