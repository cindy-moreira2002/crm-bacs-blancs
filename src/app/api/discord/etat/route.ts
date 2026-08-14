/**
 * « Mon compte Discord est-il relié ? »
 *
 * Une seule route pour les deux espaces : elle reconnaît la personne à son
 * cookie et ne répond que sur elle. Rien de ce qu'elle renvoie n'est sensible —
 * un booléen et un rôle — mais elle refuse quand même de parler à un visiteur
 * non connecté, pour ne pas devenir un moyen de tester des adresses.
 */
import { NextResponse } from 'next/server';
import { crmAdmin, profConnecte, secretSessionPresent } from '@/lib/authProf';
import { eleveConnecte } from '@/lib/authEleve';
import { discordConfigure } from '@/lib/discord/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Le script 46 n'a pas encore été joué. */
const colonneAbsente = (message: string | undefined) => /discord_user_id/.test(message ?? '');

export async function GET() {
  const configure = discordConfigure() && secretSessionPresent();

  const prof = await profConnecte();
  const eleve = prof ? null : await eleveConnecte();
  if (!prof && !eleve) {
    return NextResponse.json({ configure, relie: false, role: null, sql46: false });
  }

  const role = prof ? 'prof' : 'eleve';
  if (!configure) return NextResponse.json({ configure, relie: false, role, sql46: false });

  try {
    const db = crmAdmin();
    const { data, error } = prof
      ? await db.from('professeurs').select('discord_user_id').eq('id', prof.id).limit(1)
      : await db.from('inscriptions').select('discord_user_id').eq('email', eleve).limit(1);

    if (error) {
      // Colonne absente = script 46 à jouer. Ce n'est pas une panne : on le dit,
      // et l'espace affiche « configuration incomplète » plutôt qu'un bouton
      // qui ne pourrait rien enregistrer.
      if (colonneAbsente(error.message)) {
        return NextResponse.json({ configure, relie: false, role, sql46: true });
      }
      throw error;
    }

    const lignes = (data ?? []) as { discord_user_id: string | null }[];
    return NextResponse.json({
      configure,
      relie: lignes.some((l) => Boolean(l.discord_user_id)),
      role,
      sql46: false,
    });
  } catch (err) {
    console.error('❌ /api/discord/etat', err);
    return NextResponse.json({ configure, relie: false, role, sql46: false });
  }
}
