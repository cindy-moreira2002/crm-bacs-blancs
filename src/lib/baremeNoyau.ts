/**
 * Ré-export du noyau du moteur de correction par barème propre au sujet.
 *
 * Le code vit dans `supabase/functions/_shared/bareme-noyau.ts` parce que
 * l'Edge Function `correct-copy-bareme` (Deno) doit pouvoir l'importer :
 * la Supabase CLI ne bundle que ce qui est sous `supabase/functions/`.
 * Ce fichier existe pour que le reste de l'application l'importe sous la
 * forme habituelle `@/lib/baremeNoyau` — même code, un seul endroit à
 * corriger, et les tests hors ligne portent sur ce qui tourne en production.
 *
 * Le dossier `supabase` est exclu de `tsconfig.include`, mais un fichier
 * atteint par une chaîne d'imports est compilé quand même : rien à changer
 * dans la configuration.
 */
export * from '../../supabase/functions/_shared/bareme-noyau';
