import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Sépare le CRM interne (prospection) de l'espace public (matineesdubac).
 *
 * Le CRM de prospection (leads, démarchage écoles) est un outil interne : il ne
 * doit JAMAIS être accessible via un domaine public `*.matineesdubac.fr`.
 * Il reste joignable uniquement sur l'URL Vercel interne (`*.vercel.app`).
 *
 * L'espace élève/prof/inscription reste public sur tous les domaines.
 */

// Routes réservées au CRM interne — bloquées sur les domaines matineesdubac.
const INTERNAL_PREFIXES = ['/crm', '/ecoles-partenaires', '/api/leads', '/api/gmail-contacted'];

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const { pathname } = request.nextUrl;

  const isPublicDomain = host.endsWith('matineesdubac.fr');
  const isInternalPath = INTERNAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (isPublicDomain && isInternalPath) {
    // Sur le domaine public, l'outil interne n'existe pas → retour à l'accueil espace.
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/crm',
    '/crm/:path*',
    '/ecoles-partenaires',
    '/ecoles-partenaires/:path*',
    '/api/leads',
    '/api/leads/:path*',
    '/api/gmail-contacted',
    '/api/gmail-contacted/:path*',
  ],
};
