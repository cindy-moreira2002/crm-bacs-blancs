/**
 * Départ de la liaison Discord — « Relier mon compte Discord ».
 *
 * On n'envoie personne chez Discord sans savoir qui c'est : la route lit
 * d'abord la session maison (cookie élève ou cookie prof). Une personne non
 * connectée est renvoyée vers son espace, pas vers Discord — sinon on
 * relierait un compte Discord à… personne.
 *
 * Le `state` est une valeur signée par nous, déposée en même temps dans un
 * cookie éphémère. Au retour, les deux doivent coïncider : c'est ce qui
 * empêche un lien piégé de relier le compte Discord d'un tiers au dossier de
 * quelqu'un d'autre.
 */
import { NextRequest, NextResponse } from 'next/server';
import { encoderCookieSigne, OPTIONS_COOKIE, profConnecte, secretSessionPresent } from '@/lib/authProf';
import { eleveConnecte } from '@/lib/authEleve';
import { discordConfigure, urlAutorisation } from '@/lib/discord/config';
import { COOKIE_ETAT_DISCORD, VALIDITE_ETAT_S } from '@/lib/discord/liaison';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origine = req.nextUrl.origin;

  const echouer = (raison: string, retour: string) =>
    NextResponse.redirect(`${origine}${retour}?discord=${raison}`);

  if (!discordConfigure() || !secretSessionPresent()) {
    return echouer('non-configure', '/espace-eleve');
  }

  // Qui demande ? Le prof d'abord : une administratrice a les deux cookies, et
  // c'est son rôle Prof qu'elle veut poser, pas une salle d'élève.
  const prof = await profConnecte();
  const eleve = prof ? null : await eleveConnecte();

  if (!prof && !eleve) return echouer('connecte-toi', '/espace-eleve');

  const role = prof ? 'prof' : 'eleve';
  const retour = prof ? '/espace-prof' : '/espace-eleve';

  const etat = encoderCookieSigne({
    r: role,
    // L'identité est relue au retour depuis la session, jamais depuis l'état :
    // celui-ci ne sert qu'à prouver que la demande est bien partie d'ici.
    exp: Math.floor(Date.now() / 1000) + VALIDITE_ETAT_S,
  });

  const url = urlAutorisation(origine, etat);
  if (!url) return echouer('non-configure', retour);

  const reponse = NextResponse.redirect(url);
  reponse.cookies.set(COOKIE_ETAT_DISCORD, etat, {
    ...OPTIONS_COOKIE,
    maxAge: VALIDITE_ETAT_S,
  });
  return reponse;
}
