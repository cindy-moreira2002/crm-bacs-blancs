import { gardeAdminPage } from '../garde';
import { TableauBordFrancais } from './TableauBordFrancais';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Français — brevet blanc' };

/** /admin/brevet/francais — le tableau de bord du français au brevet. */
export default async function PageFrancaisBrevet() {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  return <TableauBordFrancais />;
}
