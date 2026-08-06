/**
 * Liens de désinscription — signés, sans secret dans l'URL.
 *
 * Le jeton porte l'adresse et une signature HMAC. Impossible de désinscrire
 * quelqu'un d'autre en devinant une URL, et impossible de fabriquer un lien
 * valide sans le secret du serveur.
 *
 * Même principe que lib/accesAdmin.ts, avec le même secret de repli : il est
 * identique en local et sur Vercel, donc un lien reste valide partout.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from './config';

const secret =
  process.env.EMAILS_DESINSCRIPTION_SECRET ?? process.env.PIPELINE_INTERNAL_SECRET ?? '';

export function secretDesinscriptionPresent(): boolean {
  return Boolean(secret);
}

function signature(email: string): string {
  return createHmac('sha256', secret)
    .update(`desinscription:${email.toLowerCase().trim()}`)
    .digest('hex')
    .slice(0, 24);
}

/** Jeton `<email base64url>.<signature>` — pas d'adresse en clair dans l'URL. */
export function jetonDesinscription(email: string): string {
  const charge = Buffer.from(email.toLowerCase().trim()).toString('base64url');
  return `${charge}.${signature(email)}`;
}

export function lireJetonDesinscription(jeton: string | undefined | null): string | null {
  if (!secret || !jeton) return null;
  const [charge, sig] = String(jeton).split('.');
  if (!charge || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(charge, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!email.includes('@')) return null;
  const attendue = Buffer.from(signature(email));
  const recue = Buffer.from(sig);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  return email;
}

/** L'adresse complète à mettre dans un e-mail marketing. */
export function urlDesinscription(email: string): string | null {
  if (!secret) return null;
  return `${SITE_URL}/desinscription?jeton=${encodeURIComponent(jetonDesinscription(email))}`;
}
