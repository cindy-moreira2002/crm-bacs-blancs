/**
 * Authentification des élèves — code à usage unique envoyé par e-mail.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Pourquoi : l'espace élève s'ouvrait sur la seule saisie d'une adresse, et les
 * routes de lecture faisaient confiance au paramètre `?eleve_email=` de l'URL.
 * Quiconque connaissait — ou devinait — l'adresse d'un élève lisait ses copies,
 * ses notes et ses dossiers de correction. L'adresse est un identifiant, pas
 * une preuve d'identité.
 *
 * Principe, sans nouvelle table :
 *  - l'élève demande un code, envoyé à l'adresse de SON inscription ;
 *  - le serveur ne stocke rien : il renvoie au navigateur un « défi », c'est-à-
 *    dire la signature HMAC de (adresse + code + expiration). Le code lui-même
 *    ne transite que par l'e-mail ;
 *  - à la vérification, le serveur recalcule la signature. Elle ne concorde que
 *    si le code saisi est le bon, pour cette adresse, avant expiration ;
 *  - la session est ensuite un cookie httpOnly signé, du même format que celui
 *    des profs (lib/authProf), donc une seule implémentation de signature.
 *
 * Le code fait 6 caractères pris dans un alphabet de 32 (chiffres et lettres
 * ambigus retirés) : environ un milliard de combinaisons, ce qui rend la force
 * brute en ligne inutile pendant les 15 minutes de validité.
 */
import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { cookies } from 'next/headers';
import { decoderCookieSigne, encoderCookieSigne, OPTIONS_COOKIE } from '@/lib/authProf';

export const COOKIE_ELEVE = 'mdb_eleve';
const DUREE_SESSION_S = 60 * 60 * 24 * 30; // 30 jours
export const VALIDITE_CODE_MS = 15 * 60 * 1000;

/** Sans I, O, 0 ni 1 : un code se lit et se recopie sans hésitation. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 6;

const secret = process.env.PROF_SESSION_SECRET ?? '';

export function secretElevePresent(): boolean {
  return Boolean(secret);
}

export function normaliserEmail(brut: unknown): string {
  return String(brut ?? '').trim().toLowerCase();
}

/** Code aléatoire non biaisé (`randomInt`, pas `Math.random`). */
export function genererCode(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

function signatureDefi(email: string, code: string, exp: number): string {
  return createHmac('sha256', secret)
    .update(`eleve:${normaliserEmail(email)}:${code.toUpperCase()}:${exp}`)
    .digest('base64url');
}

/**
 * Défi `<exp>.<signature>` remis au navigateur. Ne contient ni le code ni
 * l'adresse : il ne sert qu'à vérifier, jamais à retrouver.
 */
export function creerDefi(email: string, code: string, expMs?: number): string {
  const exp = expMs ?? Date.now() + VALIDITE_CODE_MS;
  return `${exp}.${signatureDefi(email, code, exp)}`;
}

/** Le code saisi correspond-il au défi, pour cette adresse et sans expiration ? */
export function verifierDefi(email: string, code: string, defi: string): boolean {
  if (!secret || !defi) return false;
  const [expBrut, sig] = String(defi).split('.');
  if (!expBrut || !sig) return false;
  const exp = Number(expBrut);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const attendue = Buffer.from(signatureDefi(email, String(code ?? '').trim(), exp));
  const recue = Buffer.from(sig);
  // Comparaison à temps constant : pas de fuite d'information par le timing.
  if (attendue.length !== recue.length) return false;
  return timingSafeEqual(attendue, recue);
}

/** Ouvre la session élève (appelable seulement depuis une route ou une action). */
export async function ouvrirSessionEleve(email: string) {
  const jar = await cookies();
  jar.set(
    COOKIE_ELEVE,
    encoderCookieSigne({
      eml: normaliserEmail(email),
      exp: Math.floor(Date.now() / 1000) + DUREE_SESSION_S,
    }),
    { ...OPTIONS_COOKIE, maxAge: DUREE_SESSION_S },
  );
}

export async function fermerSessionEleve() {
  const jar = await cookies();
  jar.delete(COOKIE_ELEVE);
}

/**
 * Adresse de l'élève connecté, ou null.
 *
 * C'est la SEULE source autorisée pour savoir de qui on lit les données : les
 * routes ne doivent plus jamais faire confiance à une adresse passée en
 * paramètre d'URL.
 */
export async function eleveConnecte(): Promise<string | null> {
  if (!secret) return null;
  const jar = await cookies();
  const session = decoderCookieSigne(jar.get(COOKIE_ELEVE)?.value);
  if (!session || typeof session.eml !== 'string') return null;
  const email = normaliserEmail(session.eml);
  return email.includes('@') ? email : null;
}
