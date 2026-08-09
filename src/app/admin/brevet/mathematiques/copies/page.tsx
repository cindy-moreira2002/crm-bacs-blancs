import { gardeAdminPage } from '../../garde';
import { ListeCopies } from '../../copies';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Copies — mathématiques brevet' };

/** /admin/brevet/mathematiques/copies — les copies de maths du brevet. */
export default async function PageCopiesMaths() {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  return <ListeCopies matiere="brevet_mathematiques" />;
}
