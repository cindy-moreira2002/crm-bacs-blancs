import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Aiguillage par nom de domaine.
 *
 * 1. Le CRM de prospection (leads, démarchage écoles) est un outil interne : il
 *    ne doit JAMAIS être accessible via un domaine public `*.matineesdubac.fr`.
 *    Il reste joignable uniquement sur l'URL Vercel interne (`*.vercel.app`).
 * 2. `inscription.matineesdubac.fr` est l'adresse imprimable donnée aux
 *    familles : elle ne sert qu'au formulaire. Tout le reste (espace élève,
 *    espace prof, dossiers) repart sur `espaces.matineesdubac.fr`, pour qu'une
 *    seule adresse porte les sessions de connexion et les retours OAuth.
 */

// Routes réservées au CRM interne — bloquées sur les domaines matineesdubac.
const INTERNAL_PREFIXES = ['/crm', '/ecoles-partenaires', '/api/leads', '/api/gmail-contacted'];

const HOTE_INSCRIPTION = 'inscription.matineesdubac.fr';
const HOTE_ESPACES = 'https://espaces.matineesdubac.fr';
const URL_INSCRIPTION_PUBLIQUE = 'https://inscription.matineesdubac.fr';

/**
 * Les vieilles adresses techniques Vercel. Un lien déjà envoyé, un favori, un
 * QR code imprimé continuent de fonctionner — mais la personne arrive sur une
 * adresse propre. Seuls le CRM interne et les API restent joignables ici : le
 * CRM parce qu'il n'a pas d'autre porte, les API parce qu'elles sont appelées
 * par Brevo et Discord avec une adresse déclarée chez eux.
 */
const HOTES_TECHNIQUES = ['crm-bacs-blancs-ihgf.vercel.app', 'crm-bacs-blancs.vercel.app'];

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const { pathname, search } = request.nextUrl;

  // Les consoles d'administration ont déménagé de /admin vers /direction le
  // 20/09/2026, quand la direction est devenue un espace partagé. Les favoris,
  // les liens collés dans des messages et les guides imprimés continuent de
  // marcher. `/api/admin/…` n'est PAS concerné : les routes d'API n'ont pas
  // bougé, et les rediriger ferait perdre le corps des requêtes POST.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const suite = pathname.slice('/admin'.length);
    return NextResponse.redirect(new URL(`/direction${suite}${search}`, request.url));
  }

  const isPublicDomain = host.endsWith('matineesdubac.fr');
  const isInternalPath = INTERNAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (isPublicDomain && isInternalPath) {
    // Sur le domaine public, l'outil interne n'existe pas → retour à l'accueil espace.
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (host === HOTE_INSCRIPTION) {
    // La racine de l'adresse imprimée ouvre l'inscription au bac blanc, sur place.
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/inscription', request.url));
    }
    // Les appels d'API partent de la page qui les héberge : les laisser sur
    // place, sinon la requête perd son corps au passage de la redirection.
    if (!pathname.startsWith('/inscription') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL(pathname + search, HOTE_ESPACES));
    }
  }

  if (HOTES_TECHNIQUES.includes(host) && !isInternalPath && !pathname.startsWith('/api/')) {
    const cible = pathname.startsWith('/inscription') ? URL_INSCRIPTION_PUBLIQUE : HOTE_ESPACES;
    return NextResponse.redirect(new URL(pathname + search, cible));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tout, sauf les fichiers servis tels quels (sinon la redirection casserait
    // les feuilles de style et les images de la page d'inscription).
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
