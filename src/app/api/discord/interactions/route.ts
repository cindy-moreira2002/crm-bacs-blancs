/**
 * L'adresse que Discord appelle quand un élève clique sur « ✋ Appeler le prof ».
 *
 * À coller dans le portail développeur Discord, champ « Interactions Endpoint
 * URL » : https://inscription.matineesdubac.fr/api/discord/interactions
 *
 * Discord vérifie l'adresse en envoyant d'abord une requête PING mal signée,
 * puis une bien signée : les deux doivent être traitées correctement, sinon il
 * refuse d'enregistrer l'adresse. C'est exactement ce que fait cette route.
 *
 * Quel élève a cliqué ? On ne le demande pas à Discord : le bouton n'existe que
 * dans la salle privée de l'élève, donc le salon d'où vient le clic DÉSIGNE
 * l'élève (colonne `discord_salon_id`). C'est plus sûr qu'un identifiant glissé
 * dans le bouton, qu'un curieux pourrait rejouer depuis ailleurs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin } from '@/lib/authProf';
import { baisserLaMain, leverLaMain } from '@/lib/appels';
import {
  BOUTON,
  MESSAGE_PRIVE,
  TYPE_INTERACTION,
  TYPE_REPONSE,
  boutonAppelActif,
  signatureValide,
} from '@/lib/discord/interactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Réponse visible du seul élève qui a cliqué. */
const repondre = (texte: string) =>
  NextResponse.json({
    type: TYPE_REPONSE.MESSAGE,
    data: { content: texte, flags: MESSAGE_PRIVE },
  });

export async function POST(req: NextRequest) {
  if (!boutonAppelActif()) {
    return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY absente.' }, { status: 503 });
  }

  // Le texte EXACT reçu : la signature porte sur les octets, pas sur l'objet.
  const corpsBrut = await req.text();
  const valide = signatureValide(
    corpsBrut,
    req.headers.get('x-signature-ed25519'),
    req.headers.get('x-signature-timestamp'),
  );
  // 401 obligatoire, et pas 400 : c'est ce que Discord attend pour valider
  // l'adresse (il envoie exprès une requête mal signée).
  if (!valide) return new NextResponse('invalid request signature', { status: 401 });

  let interaction: {
    type?: number;
    channel_id?: string;
    data?: { custom_id?: string };
  };
  try {
    interaction = JSON.parse(corpsBrut);
  } catch {
    return new NextResponse('bad request', { status: 400 });
  }

  // Le PING de vérification.
  if (interaction.type === TYPE_INTERACTION.PING) {
    return NextResponse.json({ type: TYPE_REPONSE.PONG });
  }

  if (interaction.type !== TYPE_INTERACTION.COMPONENT) {
    return NextResponse.json({ type: TYPE_REPONSE.PONG });
  }

  const bouton = interaction.data?.custom_id ?? '';
  const salonId = interaction.channel_id ?? '';
  if (!salonId) return repondre('Impossible d’identifier ta salle. Préviens ton professeur.');

  const { data } = await crmAdmin()
    .from('inscriptions')
    .select('id, nom')
    .eq('discord_salon_id', salonId)
    .maybeSingle();

  const inscription = data as { id: string; nom: string } | null;
  if (!inscription) {
    return repondre('Cette salle n’est rattachée à aucune inscription. Préviens ton professeur.');
  }

  if (bouton === BOUTON.ANNULER) {
    await baisserLaMain(inscription.id);
    return repondre('👌 Main baissée. Ton professeur ne sera pas dérangé.');
  }

  const motif = bouton === BOUTON.TECHNIQUE ? 'technique' : 'aide';
  const resultat = await leverLaMain(inscription.id, { motif, source: 'discord' });

  if (!resultat.ok) {
    console.error('❌ Appel Discord non enregistré :', resultat.erreur);
    return repondre('Ton appel n’a pas pu être enregistré. Écris dans le salon assistance-technique.');
  }
  if (resultat.deja) {
    return repondre('✋ Ta main est déjà levée — ton professeur arrive.');
  }

  return repondre(
    motif === 'technique'
      ? '🛠️ C’est noté : ton professeur voit ton souci technique et te rejoint.'
      : '✋ C’est noté : ton professeur voit ta demande et te rejoint dans cette salle.',
  );
}
