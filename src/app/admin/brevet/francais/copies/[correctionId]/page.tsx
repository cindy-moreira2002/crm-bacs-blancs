import { gardeAdminPage } from '../../../garde';
import { CorrectionFrancais } from './CorrectionFrancais';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Correction — français brevet' };

/**
 * L'écran de correction d'une copie de français : cinq onglets
 * (Texte et langue, Réécriture, Dictée, Rédaction, Synthèse).
 */
export default async function PageCorrectionFrancais({
  params,
}: {
  params: Promise<{ correctionId: string }>;
}) {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  const { correctionId } = await params;
  return <CorrectionFrancais correctionId={correctionId} />;
}
