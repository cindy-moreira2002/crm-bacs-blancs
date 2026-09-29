/**
 * Ré-export du noyau de la deuxième lecture par l'IA (matières sans prof).
 *
 * Même principe que `baremeNoyau.ts` : le code vit dans
 * `supabase/functions/_shared/relecture-ia-noyau.ts` pour que l'Edge Function
 * `review-copy` (Deno) l'importe, et l'application comme les tests hors ligne
 * (`npm run test:relecture-ia`) lisent exactement le même fichier.
 */
export * from '../../supabase/functions/_shared/relecture-ia-noyau';
