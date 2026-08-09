import { gardeAdminPage } from '../garde';
import { TableauBordMaths } from './TableauBordMaths';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mathématiques — brevet blanc' };

/** /admin/brevet/mathematiques — le tableau de bord des maths au brevet. */
export default async function PageMathsBrevet() {
  const refus = await gardeAdminPage();
  if (refus) return refus;
  return <TableauBordMaths />;
}
