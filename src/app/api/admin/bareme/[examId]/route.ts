/**
 * GET   — l'écran examen : barème actif, versions, étalons, couverture,
 *         corrections lancées, dernière calibration.
 * PATCH — modifier l'examen (titre, date, sujet, corrigé, consignes).
 *
 * PATCH ne touche jamais au barème lui-même : celui-ci passe par
 * /api/admin/bareme/[examId]/bareme, qui refuse d'écrire sur une version
 * verrouillée.
 */
import { NextRequest, NextResponse } from 'next/server';
import { chargerVueExamen, majExamen, chargerBareme, controlerBareme } from '@/lib/bareme';
import { gardeAdmin, erreur } from '../garde';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const vue = await chargerVueExamen(examId);
    if (!vue) return NextResponse.json({ error: 'Examen introuvable.' }, { status: 404 });

    // La version demandée peut ne pas être l'active (on relit une ancienne
    // version pour comparer, ou on édite la 1.1 pendant que la 1.0 tourne).
    const demandee = req.nextUrl.searchParams.get('version');
    const bareme = demandee ? await chargerBareme(demandee) : vue.bareme;

    return NextResponse.json({
      ...vue,
      bareme,
      controles_locaux: bareme ? controlerBareme(bareme) : null,
    });
  } catch (err) {
    return erreur(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const corps = await req.json();
    return NextResponse.json({ examen: await majExamen(examId, corps) });
  } catch (err) {
    return erreur(err);
  }
}
