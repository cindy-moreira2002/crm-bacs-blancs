/**
 * Candidature d'un professeur (bouton « Candidater maintenant »).
 *
 * Le mot de passe est transmis une seule fois, en HTTPS, et confié directement
 * à Supabase Auth qui le hache. Il n'est écrit nulle part ailleurs : ni dans
 * public.professeurs, ni dans le Google Sheet, ni dans les logs.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  CHAMPS_PROF,
  Professeur,
  authManquant,
  crmAdmin,
  genererCodeAffiliation,
  ouvrirSession,
  verifierForceMotDePasse,
} from '@/lib/authProf';
import { synchroniserSheet } from '@/lib/sheetProfs';

export async function POST(req: NextRequest) {
  const manquants = authManquant();
  if (manquants.length) {
    return NextResponse.json(
      { error: `Espaces prof non configurés (${manquants.join(', ')}). Préviens l'administratrice.` },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const prenom = String(body.prenom ?? '').trim();
    const nom = String(body.nom ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const telephone = String(body.telephone ?? '').trim();
    const motDePasse = String(body.motDePasse ?? '');
    const matieres: string[] = Array.isArray(body.matieres)
      ? body.matieres.map((m: unknown) => String(m).trim()).filter(Boolean)
      : [];

    if (!prenom || !nom || !email || !motDePasse) {
      return NextResponse.json(
        { error: 'Prénom, nom, e-mail et mot de passe sont obligatoires.' },
        { status: 400 },
      );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
    }
    if (matieres.length === 0) {
      return NextResponse.json({ error: 'Indique au moins une matière enseignée.' }, { status: 400 });
    }
    const faiblesse = verifierForceMotDePasse(motDePasse);
    if (faiblesse) {
      return NextResponse.json({ error: faiblesse }, { status: 400 });
    }

    const db = crmAdmin();

    const { data: deja } = await db
      .from('professeurs')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (deja) {
      return NextResponse.json(
        { error: 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.' },
        { status: 409 },
      );
    }

    // 1. Compte d'authentification (le mot de passe est haché par Supabase ici).
    //    email_confirm: pas de mail de validation, le prof entre tout de suite.
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
      user_metadata: { prenom, nom, role: 'prof' },
    });

    if (authError || !authData.user) {
      const dejaPris = /already|exists|registered/i.test(authError?.message ?? '');
      return NextResponse.json(
        {
          error: dejaPris
            ? 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.'
            : "Impossible de créer le compte. Réessaie dans un instant.",
        },
        { status: dejaPris ? 409 : 500 },
      );
    }

    // 2. Fiche métier. En cas d'échec on supprime le compte auth pour ne pas
    //    laisser un utilisateur orphelin qui bloquerait une nouvelle tentative.
    const { data: prof, error: profError } = await db
      .from('professeurs')
      .insert([
        {
          user_id: authData.user.id,
          prenom,
          nom,
          email,
          telephone: telephone || null,
          matieres,
          code_affiliation: genererCodeAffiliation(prenom),
        },
      ])
      .select(CHAMPS_PROF)
      .single();

    if (profError || !prof) {
      await db.auth.admin.deleteUser(authData.user.id).catch(() => {});
      console.error('❌ Création fiche prof:', profError);
      return NextResponse.json({ error: "Impossible d'enregistrer la candidature." }, { status: 500 });
    }

    // 3. Trace dans le Google Sheet (sans mot de passe) — non bloquant.
    await synchroniserSheet(prof as unknown as Professeur);

    // 4. Le prof arrive directement sur son tableau de bord.
    await ouvrirSession((prof as { id: string }).id);

    return NextResponse.json({ success: true, prof }, { status: 201 });
  } catch (err) {
    console.error('❌ Inscription prof:', err);
    return NextResponse.json({ error: "Erreur lors de l'inscription." }, { status: 500 });
  }
}
