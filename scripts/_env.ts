/**
 * Charge .env puis .env.local — À IMPORTER EN PREMIER dans un script `tsx`.
 *
 * Next charge ces fichiers tout seul ; `tsx` non. Et il ne suffit pas d'appeler
 * `config()` en tête du script : les `import` sont évalués AVANT la première
 * instruction du corps, or `src/lib/pipeline.ts` lit `process.env` à son propre
 * chargement. Les variables seraient donc lues vides, et le script s'arrêterait
 * sur « Pipeline non configuré » alors que l'application, elle, fonctionne.
 *
 * Passer par un module séparé règle l'ordre : les imports s'évaluent dans
 * l'ordre où ils sont écrits, donc celui-ci s'exécute avant les autres.
 *
 *   import './_env';
 *   import { ... } from '../src/lib/bareme';
 */
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local', override: true });
