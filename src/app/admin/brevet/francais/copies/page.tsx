import { gardeAdminPage } from '../../garde';
import { ListeCopies } from '../../copies';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Copies — français brevet' };

/** /admin/brevet/francais/copies — les copies de français du brevet. */
export default async function PageCopiesFrancais() {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  return <ListeCopies matiere="brevet_francais" />;
}
