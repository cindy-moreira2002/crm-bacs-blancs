/**
 * Ré-export du noyau de correction des épreuves rédigées d'HGGSP.
 *
 * Le code vit dans `supabase/functions/_shared/hggsp-noyau.ts` parce que
 * l'Edge Function `correct-copy-redigee` (Deno) doit pouvoir l'importer :
 * la Supabase CLI ne bundle que ce qui est sous `supabase/functions/`.
 * Ce fichier existe pour que le reste de l'application l'importe sous la
 * forme habituelle `@/lib/hggspNoyau` — même code, un seul endroit à
 * corriger, et les tests hors ligne (`npm run test:hggsp`) portent sur ce qui
 * tourne réellement en production.
 */
export * from '../../supabase/functions/_shared/hggsp-noyau';
