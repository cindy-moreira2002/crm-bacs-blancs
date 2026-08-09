import { gardeAdminPage } from '../../garde';
import { ConfigMaths } from './ConfigMaths';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Configuration — mathématiques brevet' };

/**
 * /admin/brevet/mathematiques/[examId] — l'écran de configuration d'un brevet
 * blanc de mathématiques : sujet, corrigé, automatismes, questions de la
 * partie 2, qualité rédactionnelle, étalons, calibration.
 */
export default async function PageConfigMaths({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  const { examId } = await params;
  return <ConfigMaths examId={examId} />;
}
