/**
 * GET — les statistiques du français au brevet.
 *
 * Elles ne sont jamais agrégées avec celles de mathématiques ni avec celles du
 * baccalauréat : les échelles diffèrent, une moyenne commune serait fausse.
 */
import { lireStatistiques } from '@/lib/brevetApi';

export const dynamic = 'force-dynamic';

export async function GET() {
  return lireStatistiques('brevet_francais');
}
