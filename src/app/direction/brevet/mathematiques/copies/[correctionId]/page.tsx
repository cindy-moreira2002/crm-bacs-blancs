import { gardeAdminPage } from '../../../garde';
import { CorrectionMaths } from './CorrectionMaths';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Correction — mathématiques brevet' };

/**
 * L'écran de correction d'une copie de mathématiques : quatre onglets
 * (Automatismes, Exercices, Qualité de la rédaction, Synthèse).
 */
export default async function PageCorrectionMaths({
  params,
}: {
  params: Promise<{ correctionId: string }>;
}) {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  const { correctionId } = await params;
  return <CorrectionMaths correctionId={correctionId} />;
}
