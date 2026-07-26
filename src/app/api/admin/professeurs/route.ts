/**
 * Administration des comptes profs.
 *
 * Réservé aux comptes `role = 'admin'`. L'administratrice peut lire les fiches,
 * changer les statuts et réinitialiser un mot de passe — mais elle ne peut
 * jamais LIRE un mot de passe : ils n'existent que hachés dans Supabase Auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CHAMPS_PROF, crmAdmin, profConnecte, verifierForceMotDePasse } from '@/lib/authProf';

async function exigerAdmin() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') return null;
  return moi;
}

export async function GET() {
  if (!(await exigerAdmin())) {
    return NextResponse.json({ error: 'Accès réservé à l’administratrice.' }, { status: 403 });
  }

  const { data, error } = await crmAdmin()
    .from('professeurs')
    .select(CHAMPS_PROF)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Liste profs:', error);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
  return NextResponse.json({ professeurs: data });
}

/**
 * Met à jour une fiche prof.
 * `nouveauMotDePasse` définit un nouveau mot de passe pour le prof (il devra
 * lui être communiqué de vive voix) — on ne peut toujours pas lire l'ancien.
 */
export async function PATCH(req: NextRequest) {
  if (!(await exigerAdmin())) {
    return NextResponse.json({ error: 'Accès réservé à l’administratrice.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'id manquant.' }, { status: 400 });

    const db = crmAdmin();

    if (body.nouveauMotDePasse) {
      const mdp = String(body.nouveauMotDePasse);
      const faiblesse = verifierForceMotDePasse(mdp);
      if (faiblesse) return NextResponse.json({ error: faiblesse }, { status: 400 });

      const { data: prof } = await db
        .from('professeurs')
        .select('user_id')
        .eq('id', id)
        .maybeSingle();
      const userId = (prof as { user_id: string | null } | null)?.user_id;
      if (!userId) {
        return NextResponse.json({ error: 'Ce prof n’a pas de compte de connexion.' }, { status: 400 });
      }
      const { error } = await db.auth.admin.updateUserById(userId, { password: mdp });
      if (error) {
        console.error('❌ Reset mot de passe:', error);
        return NextResponse.json({ error: 'Impossible de changer le mot de passe.' }, { status: 500 });
      }
    }

    // Seuls ces champs sont modifiables par l'admin.
    const patch: Record<string, unknown> = {};
    for (const champ of ['prenom', 'nom', 'telephone', 'matieres', 'statut_candidature', 'statut_compte', 'role', 'notes_admin']) {
      if (champ in body) patch[champ] = body[champ];
    }

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await db.from('professeurs').update(patch).eq('id', id);
      if (error) {
        console.error('❌ Maj prof:', error);
        return NextResponse.json({ error: 'Erreur de mise à jour.' }, { status: 500 });
      }
    }

    const { data } = await db.from('professeurs').select(CHAMPS_PROF).eq('id', id).maybeSingle();
    return NextResponse.json({ success: true, prof: data });
  } catch (err) {
    console.error('❌ Admin profs PATCH:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
