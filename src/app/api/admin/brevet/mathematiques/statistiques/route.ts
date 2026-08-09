/**
 * GET — les statistiques du mathématiques au brevet.
 *
 * Elles ne sont jamais agrégées avec celles de français ni avec celles du
 * baccalauréat : les échelles diffèrent, une moyenne commune serait fausse.
 */
import { lireStatistiques } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  return lireStatistiques('brevet_mathematiques');
}
