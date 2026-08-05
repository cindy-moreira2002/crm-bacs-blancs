/**
 * POST — l'administratrice crée (ou reprend) son compte avec SON mot de passe.
 *
 * Entrée : { jeton, prenom, nom, motDePasse }. Le jeton signé (voir
 * lib/accesAdmin.ts) désigne l'email autorisé ; impossible d'agir sur un
 * autre compte. Le mot de passe est transmis une seule fois, en HTTPS, et
 * confié à Supabase Auth qui le hache — il n'est écrit nulle part ailleurs,
 * ni dans les logs (même règle que l'inscription des profs).
 *
 * Effets : utilisateur Supabase Auth créé ou mot de passe redéfini, ligne
 * `professeurs` créée ou promue `role='admin'`, session ouverte.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  authManquant,
  crmAdmin,
  genererCodeAffiliation,
  ouvrirSession,
  verifierForceMotDePasse,
} from '@/lib/authProf';
import { lireJetonAccesAdmin } from '@/lib/accesAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const manquants = authManquant();
  if (manquants.length) {
    return NextResponse.json(
      { error: `Espaces prof non configurés (${manquants.join(', ')}).` },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const jeton = String(body.jeton ?? '');
    const prenom = String(body.prenom ?? '').trim();
    const nom = String(body.nom ?? '').trim();
    const motDePasse = String(body.motDePasse ?? '');

    const lu = lireJetonAccesAdmin(jeton);
    if (!lu) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 401 });
    }
    const email = lu.email;

    if (!prenom || !nom) {
      return NextResponse.json({ error: 'Prénom et nom sont obligatoires.' }, { status: 400 });
    }
    const faiblesse = verifierForceMotDePasse(motDePasse);
    if (faiblesse) {
      return NextResponse.json({ error: faiblesse }, { status: 400 });
    }

    const db = crmAdmin();

    // Fiche existante ? (elle a pu se créer un compte prof par le passé)
    const { data: fiche } = await db
      .from('professeurs')
      .select('id, user_id, prenom, nom')
      .eq('email', email)
      .maybeSingle();

    // 1. Utilisateur Supabase Auth : créé, ou mot de passe redéfini.
    let userId = (fiche?.user_id as string | null) ?? null;
    if (!userId) {
      const { data: cree, error: erreurCreation } = await db.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { prenom, nom, role: 'admin' },
      });
      if (cree?.user) {
        userId = cree.user.id;
      } else {
        // L'utilisateur Auth existe déjà sans fiche liée : on le retrouve par
        // email (volume faible — quelques dizaines de profs au plus).
        const dejaLa = /already|exists|registered/i.test(erreurCreation?.message ?? '');
        if (!dejaLa) throw erreurCreation ?? new Error('Création du compte impossible.');
        const { data: liste, error: erreurListe } = await db.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (erreurListe) throw erreurListe;
        const trouve = liste.users.find((u) => (u.email ?? '').toLowerCase() === email);
        if (!trouve) throw new Error('Compte introuvable côté authentification.');
        userId = trouve.id;
      }
    }
    // (Re)définit le mot de passe — no-op juste après une création, essentiel
    // quand l'utilisateur préexistait.
    const { error: erreurMdp } = await db.auth.admin.updateUserById(userId, {
      password: motDePasse,
      email_confirm: true,
    });
    if (erreurMdp) throw erreurMdp;

    // 2. Fiche professeurs : promue admin, ou créée.
    let profId: string;
    if (fiche) {
      const { error } = await db
        .from('professeurs')
        .update({
          user_id: userId,
          prenom,
          nom,
          role: 'admin',
          statut_compte: 'actif',
          statut_candidature: 'acceptee',
          updated_at: new Date().toISOString(),
        })
        .eq('id', fiche.id);
      if (error) throw error;
      profId = fiche.id as string;
    } else {
      const { data: creee, error } = await db
        .from('professeurs')
        .insert({
          user_id: userId,
          prenom,
          nom,
          email,
          matieres: [],
          statut_candidature: 'acceptee',
          statut_compte: 'actif',
          code_affiliation: genererCodeAffiliation(prenom),
          role: 'admin',
        })
        .select('id')
        .single();
      if (error) throw error;
      profId = creee.id as string;
    }

    // 3. Session ouverte : elle arrive connectée sur la page de pilotage.
    await ouvrirSession(profId);

    console.log(`👑 Compte admin défini pour ${email} (fiche ${profId})`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ /api/admin/acces', err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
