/**
 * Ré-export du prompt système et du schéma JSON du FRANÇAIS — brevet.
 *
 * Il existe pour que les tests hors ligne et les écrans d'administration
 * portent sur le prompt et le schéma RÉELLEMENT envoyés à Claude par
 * l'Edge Function, sans jamais en tenir une seconde copie.
 */
export * from '../../supabase/functions/_shared/brevet-francais-prompt';
