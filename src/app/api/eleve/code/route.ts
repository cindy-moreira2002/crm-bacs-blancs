/**
 * POST /api/eleve/code — l'élève demande son code d'accès.
 *
 * Réponse volontairement identique que l'adresse existe ou non : sinon la route
 * deviendrait un annuaire, on saurait qui est inscrit rien qu'en essayant des
 * adresses. Quand l'adresse est inconnue, un défi est quand même renvoyé, bâti
 * sur un code aléatoire que personne ne recevra jamais.
 *
 * Le code part par Brevo en direct, sans passer par la file d'attente : c'est
 * un message de sécurité attendu dans la seconde, pas une campagne. Il ignore
 * donc aussi le mode « répétition générale », qui n'a de sens que pour les
 * envois programmés.
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { creerDefi, genererCode, normaliserEmail, secretElevePresent } from '@/lib/authEleve';
import { envoyerViaBrevo } from '@/lib/emails/brevo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function corpsEmail(code: string, prenom: string | null) {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const texte = `${bonjour}

Voici ton code d'accès à ton espace élève :

    ${code}

Il est valable 15 minutes. Si tu n'as pas demandé ce code, ignore ce message : personne ne peut entrer sans lui.

Les Matinées du Bac`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E1145">
  <p style="font-size:15px">${bonjour}</p>
  <p style="font-size:15px">Voici ton code d’accès à ton espace élève :</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;text-align:center;background:#F5F3FF;border-radius:12px;padding:18px 0;margin:24px 0">${code}</p>
  <p style="font-size:14px;color:#6B7280">Il est valable 15 minutes. Si tu n’as pas demandé ce code, ignore ce message : personne ne peut entrer sans lui.</p>
  <p style="font-size:14px;color:#6B7280;margin-top:24px">Les Matinées du Bac</p>
</div>`;

  return { texte, html };
}

export async function POST(req: NextRequest) {
  if (!secretElevePresent()) {
    return NextResponse.json(
      { error: 'Connexion non configurée (PROF_SESSION_SECRET).' },
      { status: 503 },
    );
  }
  if (!process.env.BREVO_API_KEY) {
    // Fermeture explicite : sans envoi possible, aucun code n'arriverait. On
    // refuse plutôt que de rouvrir l'accès sur la seule adresse.
    return NextResponse.json(
      { error: 'envoi_indisponible', message: 'L’envoi du code est momentanément indisponible.' },
      { status: 503 },
    );
  }

  let email: string;
  try {
    const body = await req.json();
    email = normaliserEmail(body?.email);
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!email.includes('@') || email.length > 320) {
    return NextResponse.json({ error: 'Adresse invalide.' }, { status: 400 });
  }

  const code = genererCode();
  const defi = creerDefi(email, code);

  // L'adresse est-elle celle d'une inscription ? La réponse ne le dira pas.
  const { data } = await supabase
    .from('inscriptions')
    .select('nom')
    .eq('email', email)
    .limit(1);

  if (data && data.length > 0) {
    const nom = String((data[0] as { nom?: string }).nom ?? '').trim();
    const prenom = nom ? nom.split(/\s+/)[0] : null;
    const { texte, html } = corpsEmail(code, prenom);
    const envoi = await envoyerViaBrevo({
      destinataire: email,
      destinataireNom: nom || null,
      sujet: `Ton code d’accès : ${code}`,
      html,
      texte,
      etiquettes: ['code-acces-eleve'],
    });
    if (!envoi.ok) {
      console.error('❌ Envoi du code élève impossible:', envoi.message);
      return NextResponse.json(
        { error: 'envoi_echec', message: 'L’envoi du code a échoué. Réessaie dans un instant.' },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true, defi });
}
