/**
 * Accès administratrice — lien signé pour créer (ou reprendre) SON compte.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Pourquoi : la page /admin/correction exige un compte `role='admin'`, mais
 * seule l'admin peut définir des mots de passe… œuf et poule. Ce module casse
 * la boucle : un lien signé, généré hors ligne (scripts/lien-acces-admin.mjs),
 * ouvre un formulaire où l'administratrice choisit ELLE-MÊME son mot de passe.
 * Le mot de passe ne transite qu'une fois, en HTTPS, direct vers Supabase
 * Auth qui le hache — même principe que l'inscription des profs.
 *
 * Signature : HMAC avec PIPELINE_INTERNAL_SECRET — comme les liens de
 * relecture (lib/relecture.ts), parce que ce secret est identique en local et
 * sur Vercel. PROF_SESSION_SECRET, lui, a été généré à part pour la prod : un
 * jeton signé localement avec serait refusé en ligne.
 *
 * Le jeton porte l'email ET l'expiration (72 h) dans sa charge signée : il ne
 * peut QUE définir le mot de passe et le rôle admin du compte portant CET
 * email-là, et l'URL ne contient que le jeton (pas d'email en query string).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = process.env.PIPELINE_INTERNAL_SECRET ?? '';

export const VALIDITE_LIEN_ADMIN_MS = 72 * 3600 * 1000;

export function secretAccesAdminPresent(): boolean {
  return Boolean(secret);
}

function signature(email: string, exp: number): string {
  return createHmac('sha256', secret)
    .update(`acces-admin:${email.toLowerCase().trim()}:${exp}`)
    .digest('hex')
    .slice(0, 24);
}

/** Jeton `<email base64url>.<exp>.<signature>`, autoporteur. */
export function jetonAccesAdmin(email: string, expMs?: number): string {
  const exp = expMs ?? Date.now() + VALIDITE_LIEN_ADMIN_MS;
  const charge = Buffer.from(email.toLowerCase().trim()).toString('base64url');
  return `${charge}.${exp}.${signature(email, exp)}`;
}

/** Email du jeton si (et seulement si) signature valide et non expiré. */
export function lireJetonAccesAdmin(jeton: string | undefined): { email: string } | null {
  if (!secret || !jeton) return null;
  const [charge, expBrut, sig] = String(jeton).split('.');
  if (!charge || !expBrut || !sig) return null;
  const exp = Number(expBrut);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  let email: string;
  try {
    email = Buffer.from(charge, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!email.includes('@')) return null;
  const attendue = Buffer.from(signature(email, exp));
  const recue = Buffer.from(sig);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  return { email };
}
