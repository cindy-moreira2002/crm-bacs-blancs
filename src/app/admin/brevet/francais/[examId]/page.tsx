import { gardeAdminPage } from '../../garde';
import { ConfigFrancais } from './ConfigFrancais';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Configuration — français brevet' };

/**
 * /admin/brevet/francais/[examId] — l'écran de configuration d'un brevet
 * blanc de français : sujet, corrigé, barème des trois blocs, étalons,
 * calibration, verrouillage et ouverture des corrections.
 */
export default async function PageConfigFrancais({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  const { examId } = await params;
  return <ConfigFrancais examId={examId} />;
}
