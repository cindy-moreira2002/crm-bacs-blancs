/**
 * Retour de Discord après « Autoriser ».
 *
 * Trois vérifications avant de toucher à quoi que ce soit :
 *   1. l'état renvoyé par Discord est bien celui qu'on a déposé à l'aller
 *      (sinon, la demande ne vient pas de nous) ;
 *   2. la session maison est toujours ouverte, et c'est elle — jamais l'URL —
 *      qui dit à quel dossier le compte Discord va être rattaché ;
 *   3. le code s'échange bien contre un jeton.
 *
 * Ensuite seulement on écrit, et on écrit peu : l'identifiant du compte, la
 * date, et l'autorisation sur la salle. Le jeton d'accès, lui, sert à l'ajout
 * au serveur puis disparaît — il n'est jamais mis en base.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, decoderCookieSigne, profConnecte, secretSessionPresent } from '@/lib/authProf';
import { eleveConnecte } from '@/lib/authEleve';
import { discordConfigure, urlRetourOAuth } from '@/lib/discord/config';
import { donnerRoleProf, echangerCode, ouvrirSalonA, rejoindreServeur } from '@/lib/discord/oauth';
import { COOKIE_ETAT_DISCORD } from '@/lib/discord/liaison';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Le script 46 n'a pas encore été joué : le dire, plutôt qu'un 500 opaque. */
const colonneAbsente = (message: string | undefined) => /discord_user_id|discord_relie_le|discord_acces_pose_le/.test(message ?? '');

export async function GET(req: NextRequest) {
  const origine = req.nextUrl.origin;
  const cookieEtat = req.cookies.get(COOKIE_ETAT_DISCORD)?.value;

  // La redirection efface toujours le cookie d'état : il a servi, il ne doit
  // pas pouvoir resservir.
  const finir = (retour: string, etat: string) => {
    const reponse = NextResponse.redirect(`${origine}${retour}?discord=${etat}`);
    reponse.cookies.delete(COOKIE_ETAT_DISCORD);
    return reponse;
  };

  if (!discordConfigure() || !secretSessionPresent()) {
    return finir('/espace-eleve', 'non-configure');
  }

  // --- 1. L'état ------------------------------------------------------
  const etatRecu = req.nextUrl.searchParams.get('state') ?? '';
  if (!cookieEtat || !etatRecu || etatRecu !== cookieEtat) {
    return finir('/espace-eleve', 'etat-invalide');
  }
  const charge = decoderCookieSigne(cookieEtat);
  if (!charge) return finir('/espace-eleve', 'etat-expire');
  const role = charge.r === 'prof' ? 'prof' : 'eleve';
  const retour = role === 'prof' ? '/espace-prof' : '/espace-eleve';

  // Discord renvoie `error=access_denied` si la personne a cliqué « Annuler ».
  if (req.nextUrl.searchParams.get('error')) return finir(retour, 'refuse');

  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!code) return finir(retour, 'sans-code');

  // --- 2. La session maison -------------------------------------------
  const prof = role === 'prof' ? await profConnecte() : null;
  const eleve = role === 'eleve' ? await eleveConnecte() : null;
  if (!prof && !eleve) return finir(retour, 'connecte-toi');

  // --- 3. L'échange ----------------------------------------------------
  const liaison = await echangerCode(code, urlRetourOAuth(origine));
  if (!liaison.ok || !liaison.userId || !liaison.accessToken) {
    console.error('❌ Liaison Discord :', liaison.erreur);
    return finir(retour, 'echange-refuse');
  }

  const membre = await rejoindreServeur(liaison.userId, liaison.accessToken);
  if (!membre.ok) {
    console.error('❌ Ajout au serveur Discord :', membre.erreur);
    return finir(retour, 'serveur-refuse');
  }

  const db = crmAdmin();
  const maintenant = new Date().toISOString();

  try {
    if (prof) {
      const { error } = await db
        .from('professeurs')
        .update({ discord_user_id: liaison.userId, discord_relie_le: maintenant })
        .eq('id', prof.id);
      if (error) {
        console.error('❌ professeurs.discord_user_id :', error.message);
        return finir(retour, colonneAbsente(error.message) ? 'sql-46' : 'ecriture-refusee');
      }

      const pose = await donnerRoleProf(liaison.userId);
      if (!pose.ok) {
        console.error('❌ Rôle Prof :', pose.erreur);
        // Le compte est relié, mais la porte reste fermée : le dire tel quel.
        return finir(retour, 'role-refuse');
      }
      return finir(retour, 'ok');
    }

    // --- Élève : toutes ses inscriptions, donc toutes ses salles ------
    const { data: siennes, error: erreurLecture } = await db
      .from('inscriptions')
      .select('id, discord_salon_id')
      .eq('email', eleve);
    if (erreurLecture) {
      console.error('❌ Lecture des inscriptions :', erreurLecture.message);
      return finir(retour, 'ecriture-refusee');
    }

    const lignes = (siennes ?? []) as { id: string; discord_salon_id: string | null }[];
    if (!lignes.length) return finir(retour, 'sans-inscription');

    const { error } = await db
      .from('inscriptions')
      .update({ discord_user_id: liaison.userId, discord_relie_le: maintenant })
      .eq('email', eleve);
    if (error) {
      console.error('❌ inscriptions.discord_user_id :', error.message);
      return finir(retour, colonneAbsente(error.message) ? 'sql-46' : 'ecriture-refusee');
    }

    // Les salles déjà créées s'ouvrent tout de suite. Celles qui ne le sont pas
    // encore s'ouvriront à la préparation, qui lit désormais cet identifiant :
    // l'ordre dans lequel se font les deux opérations n'a plus d'importance.
    let ouvertes = 0;
    for (const ligne of lignes) {
      if (!ligne.discord_salon_id) continue;
      const acces = await ouvrirSalonA(ligne.discord_salon_id, liaison.userId);
      if (!acces.ok) {
        console.error(`⚠️ Accès non posé sur ${ligne.discord_salon_id} :`, acces.erreur);
        continue;
      }
      ouvertes += 1;
      await db
        .from('inscriptions')
        .update({ discord_acces_pose_le: maintenant })
        .eq('id', ligne.id);
    }

    // Une salle attendue mais non ouverte n'est pas un succès : sans ce
    // distinguo, l'élève lirait « c'est bon » et trouverait porte close.
    const attendues = lignes.filter((l) => l.discord_salon_id).length;
    if (attendues && ouvertes < attendues) return finir(retour, 'acces-partiel');
    return finir(retour, 'ok');
  } catch (err) {
    console.error('❌ /api/discord/oauth/retour', err);
    return finir(retour, 'imprevu');
  }
}
