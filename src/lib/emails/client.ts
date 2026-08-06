/**
 * Accès Supabase du système d'e-mails.
 *
 * ⚠️ SERVEUR UNIQUEMENT — lit la clé service_role.
 *
 * Volontairement séparé de lib/authProf.ts : ce module ne dépend pas des
 * cookies Next.js, il peut donc être appelé par le moteur d'envoi (cron,
 * webhook) sans qu'il y ait la moindre requête utilisateur derrière.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let cache: SupabaseClient | null = null;

export function emailsDb(): SupabaseClient {
  if (!url || !serviceKey) {
    throw new Error(
      'E-mails non configurés — variables manquantes : ' +
        [!url && 'NEXT_PUBLIC_SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY']
          .filter(Boolean)
          .join(', '),
    );
  }
  if (!cache) {
    cache = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return cache;
}
