/**
 * Authentification des professeurs.
 *
 * ⚠️ SERVEUR UNIQUEMENT — ce module lit la clé service_role et le secret de
 * session. Il n'est importé que par des composants serveur et des routes /api.
 *
 * Principe :
 *  - le mot de passe est stocké **haché par Supabase Auth** (table auth.users).
 *    Il ne transite ni ne s'écrit jamais en clair, ni en base CRM, ni dans le
 *    Google Sheet ;
 *  - la fiche métier du prof vit dans public.professeurs, reliée par user_id ;
 *  - la session du navigateur est un cookie httpOnly signé (HMAC) qui ne
 *    contient qu'un identifiant de prof et une date d'expiration ;
 *  - l'administratrice entre dans un espace prof par « Voir comme » : un second
 *    cookie signé, sans jamais connaître le mot de passe du prof.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const COOKIE_SESSION = 'mdb_prof';
export const COOKIE_VOIR_COMME = 'mdb_voir_comme';
const DUREE_SESSION_S = 60 * 60 * 24 * 30; // 30 jours

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const secret = process.env.PROF_SESSION_SECRET ?? '';

/** Variables d'environnement manquantes → message clair plutôt qu'un 500 opaque. */
export function authManquant(): string[] {
  const manquants: string[] = [];
  if (!url) manquants.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) manquants.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) manquants.push('PROF_SESSION_SECRET');
  return manquants;
}

/**
 * Client CRM en service_role : passe outre RLS.
 * Les tables professeurs / session_coachs / revenus_prof ont RLS actif sans
 * policy publique — la clé anon ne peut rien y lire. Tout passe par ici.
 */
export function crmAdmin(): SupabaseClient {
  const manquants = authManquant();
  if (manquants.length) {
    throw new Error(
      `Espaces prof non configurés — variables manquantes : ${manquants.join(', ')}`,
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Client anon, uniquement pour vérifier un mot de passe (signInWithPassword). */
function crmAnon(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// --- Types ------------------------------------------------------------

export type Professeur = {
  id: string;
  user_id: string | null;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  matieres: string[];
  statut_candidature: 'en_attente' | 'acceptee' | 'refusee';
  statut_compte: 'actif' | 'suspendu';
  code_affiliation: string;
  role: 'prof' | 'admin';
  created_at: string;
};

export const CHAMPS_PROF =
  'id, user_id, prenom, nom, email, telephone, matieres, statut_candidature, statut_compte, code_affiliation, role, created_at';

// --- Signature des cookies -------------------------------------------

function signer(charge: string): string {
  return createHmac('sha256', secret).update(charge).digest('base64url');
}

function encoder(donnees: Record<string, unknown>): string {
  const charge = Buffer.from(JSON.stringify(donnees)).toString('base64url');
  return `${charge}.${signer(charge)}`;
}

/** Renvoie le contenu du cookie, ou null si signature invalide / expirée. */
function decoder(valeur: string | undefined): Record<string, unknown> | null {
  if (!valeur) return null;
  const [charge, signature] = valeur.split('.');
  if (!charge || !signature) return null;

  const attendue = signer(charge);
  // Comparaison à temps constant : pas de fuite d'information par le timing.
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const donnees = JSON.parse(Buffer.from(charge, 'base64url').toString());
    if (typeof donnees.exp === 'number' && donnees.exp < Date.now() / 1000) return null;
    return donnees;
  } catch {
    return null;
  }
}

const optionsCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Cookies signés réutilisables par d'autres « portes » que la session prof
 * (voir lib/accesDepot.ts). Même secret, même format, même vérification à
 * temps constant : une seule implémentation de signature dans le projet.
 */
export function encoderCookieSigne(donnees: Record<string, unknown>): string {
  return encoder(donnees);
}

export function decoderCookieSigne(valeur: string | undefined): Record<string, unknown> | null {
  return decoder(valeur);
}

export const OPTIONS_COOKIE = optionsCookie;

/** Le secret de signature est-il en place ? Sans lui, aucun cookie n'est fiable. */
export function secretSessionPresent(): boolean {
  return Boolean(secret);
}

/** Ouvre la session du prof (appelable seulement depuis une route ou une action). */
export async function ouvrirSession(professeurId: string) {
  const jar = await cookies();
  jar.set(
    COOKIE_SESSION,
    encoder({ pid: professeurId, exp: Math.floor(Date.now() / 1000) + DUREE_SESSION_S }),
    { ...optionsCookie, maxAge: DUREE_SESSION_S },
  );
  // Une nouvelle connexion annule toujours une usurpation en cours.
  jar.delete(COOKIE_VOIR_COMME);
}

export async function fermerSession() {
  const jar = await cookies();
  jar.delete(COOKIE_SESSION);
  jar.delete(COOKIE_VOIR_COMME);
}

// --- Lecture de la session -------------------------------------------

async function chargerProf(id: string): Promise<Professeur | null> {
  const { data, error } = await crmAdmin()
    .from('professeurs')
    .select(CHAMPS_PROF)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Professeur;
}

/**
 * Le prof réellement connecté (jamais celui qui est usurpé).
 * C'est lui qui décide des droits : seul un rôle admin peut « voir comme ».
 */
export async function profConnecte(): Promise<Professeur | null> {
  if (authManquant().length) return null;
  const jar = await cookies();
  const session = decoder(jar.get(COOKIE_SESSION)?.value);
  if (!session || typeof session.pid !== 'string') return null;
  return chargerProf(session.pid);
}

/**
 * Le prof dont on affiche l'espace : l'usurpé si l'admin a cliqué
 * « Voir comme », sinon le prof connecté.
 */
export async function profCourant(): Promise<{
  prof: Professeur | null;
  usurpePar: Professeur | null;
}> {
  const reel = await profConnecte();
  if (!reel) return { prof: null, usurpePar: null };

  const jar = await cookies();
  const voirComme = decoder(jar.get(COOKIE_VOIR_COMME)?.value);

  // Sécurité : l'usurpation n'est acceptée que si le compte réel est admin.
  if (reel.role !== 'admin' || !voirComme || typeof voirComme.pid !== 'string') {
    return { prof: reel, usurpePar: null };
  }

  const cible = await chargerProf(voirComme.pid);
  if (!cible) return { prof: reel, usurpePar: null };
  return { prof: cible, usurpePar: reel };
}

/** Démarre / arrête l'usurpation. `professeurId = null` pour revenir à soi. */
export async function definirVoirComme(professeurId: string | null) {
  const jar = await cookies();
  if (!professeurId) {
    jar.delete(COOKIE_VOIR_COMME);
    return;
  }
  jar.set(
    COOKIE_VOIR_COMME,
    encoder({ pid: professeurId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4 }),
    { ...optionsCookie, maxAge: 60 * 60 * 4 },
  );
}

// --- Mot de passe -----------------------------------------------------

/**
 * Règle volontairement simple : 10 caractères, au moins une lettre et un
 * chiffre. Assez pour bloquer les mots de passe triviaux, pas assez pour
 * décourager un prof.
 */
export function verifierForceMotDePasse(mdp: string): string | null {
  if (mdp.length < 10) return 'Le mot de passe doit faire au moins 10 caractères.';
  if (!/[a-zA-Z]/.test(mdp)) return 'Le mot de passe doit contenir au moins une lettre.';
  if (!/[0-9]/.test(mdp)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}

/** Vérifie un couple email / mot de passe auprès de Supabase Auth. */
export async function verifierMotDePasse(
  email: string,
  motDePasse: string,
): Promise<{ ok: boolean; userId?: string }> {
  const { data, error } = await crmAnon().auth.signInWithPassword({
    email,
    password: motDePasse,
  });
  if (error || !data.user) return { ok: false };
  // On n'utilise pas la session Supabase : notre cookie signé la remplace.
  return { ok: true, userId: data.user.id };
}

// --- Divers -----------------------------------------------------------

/** Code d'affiliation lisible : PRENOM + 4 caractères aléatoires. */
export function genererCodeAffiliation(prenom: string): string {
  const base = prenom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 8) || 'COACH';
  const alea = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${alea}`;
}

/** URL publique d'affiliation à partager par le prof. */
export function lienAffiliation(code: string, origine: string): string {
  return `${origine.replace(/\/$/, '')}/inscription?ref=${encodeURIComponent(code)}`;
}
