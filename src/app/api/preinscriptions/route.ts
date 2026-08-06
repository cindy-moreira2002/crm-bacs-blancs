/**
 * POST /api/preinscriptions — les demandes venues du site vitrine.
 *
 * Le formulaire du site matineesdubac.fr écrivait jusqu'ici dans un Google
 * Sheet et affichait « un e-mail de confirmation va être envoyé »… sans que
 * rien ne parte. Cette route ferme le trou : la demande est enregistrée, un
 * accusé de réception part, et la personne est relancée si elle ne finalise
 * pas (uniquement si elle a accepté d'être recontactée).
 *
 * Ouverte au public (le site vitrine est un autre domaine) mais :
 *  - elle n'écrit que dans `preinscriptions`, jamais dans `inscriptions` ;
 *  - elle ne renvoie aucune donnée personnelle ;
 *  - deux envois identiques rapprochés ne créent qu'une demande.
 */
import { NextRequest, NextResponse } from 'next/server';
import { emailsDb } from '@/lib/emails/client';
import { apresPreinscription } from '@/lib/emails/declencheurs';
import type { LignePreinscription } from '@/lib/emails/donnees';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORIGINES_AUTORISEES = [
  'https://matineesdubac.fr',
  'https://www.matineesdubac.fr',
  'https://matineesdubac-officiel.vercel.app',
  'http://localhost:3000',
];

function entetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINES_AUTORISEES[0];
  return {
    'Access-Control-Allow-Origin': autorisee,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: entetesCors(req.headers.get('origin')) });
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const cors = entetesCors(req.headers.get('origin'));

  try {
    const corps = (await req.json()) as Record<string, unknown>;
    const prenom = String(corps.prenom ?? '').trim().slice(0, 80);
    const email = String(corps.email ?? '').trim().toLowerCase().slice(0, 160);

    if (!prenom || !EMAIL_VALIDE.test(email)) {
      return NextResponse.json(
        { error: 'Prénom et adresse e-mail valides requis.' },
        { status: 400, headers: cors },
      );
    }

    const ligne = {
      prenom,
      nom: String(corps.nom ?? '').trim().slice(0, 80) || null,
      email,
      telephone: String(corps.telephone ?? '').trim().slice(0, 40) || null,
      classe: String(corps.classe ?? '').trim().slice(0, 40) || null,
      matiere: String(corps.matiere ?? '').trim().slice(0, 60) || null,
      session_libelle: String(corps.session ?? corps.session_libelle ?? '').trim().slice(0, 120) || null,
      source: String(corps.source ?? 'vitrine').trim().slice(0, 40),
      consentement_marketing: corps.consentement_marketing === true,
    };

    const db = emailsDb();

    // Anti-doublon : même adresse, même matière, dans les 24 heures.
    const depuis = new Date(Date.now() - 86_400_000).toISOString();
    const { data: existante } = await db
      .from('preinscriptions')
      .select('id')
      .eq('email', email)
      .eq('matiere', ligne.matiere)
      .gte('created_at', depuis)
      .maybeSingle();

    if (existante) {
      return NextResponse.json({ ok: true, deja: true }, { status: 200, headers: cors });
    }

    const { data, error } = await db
      .from('preinscriptions')
      .insert(ligne)
      .select(
        'id, prenom, nom, email, matiere, session_libelle, session_id, statut, consentement_marketing, inscription_id, created_at',
      )
      .single();

    if (error) throw error;

    // L'accusé de réception est mis en FILE, pas envoyé ici : la réponse au
    // navigateur ne dépend donc jamais de la disponibilité de Brevo.
    try {
      await apresPreinscription(data as unknown as LignePreinscription);
    } catch (err) {
      console.error('⚠️ Accusé de réception non mis en file :', err);
    }

    return NextResponse.json({ ok: true }, { status: 201, headers: cors });
  } catch (err) {
    console.error('❌ /api/preinscriptions', err);
    return NextResponse.json({ error: 'Erreur lors de l’enregistrement.' }, { status: 500, headers: cors });
  }
}
