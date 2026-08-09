/**
 * Ré-export du noyau commun du brevet.
 *
 * Le code vit dans `supabase/functions/_shared/brevet-noyau.ts` parce que les
 * Edge Functions (Deno) doivent pouvoir l'importer : la Supabase CLI ne bundle
 * que ce qui est sous `supabase/functions/`. Ce fichier existe pour que le
 * reste de l'application l'importe sous la forme habituelle
 * `@/lib/brevetNoyau` — même code, un seul endroit à corriger, et les tests
 * hors ligne portent sur ce qui tourne en production.
 *
 * Même mécanique que `src/lib/baremeNoyau.ts` pour le baccalauréat.
 */
export * from '../../supabase/functions/_shared/brevet-noyau';
