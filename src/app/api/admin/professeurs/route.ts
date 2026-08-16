/**
 * Administration des comptes profs.
 *
 * Réservé aux comptes `role = 'admin'`. L'administratrice peut lire les fiches,
 * changer les statuts et réinitialiser un mot de passe — mais elle ne peut
 * jamais LIRE un mot de passe : ils n'existent que hachés dans Supabase Auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  CHAMPS_PROF,
  crmAdmin,
  genererCodeAffiliation,
  profConnecte,
  verifierForceMotDePasse,
} from '@/lib/authProf';

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
 * Crée la fiche d'un professeur — et SON CODE D'AFFILIATION.
 *
 * Jusqu'ici aucune page ne créait de prof : la fiche se posait à la main dans
 * Supabase, où l'on pouvait oublier `code_affiliation` (colonne `not null
 * unique` : l'insertion échouait avec un message incompréhensible) ou taper un
 * code déjà pris. Le code doit naître avec la fiche, pas après : c'est lui que
 * le prof partage, et sans lui il ne peut pas être payé.
 *
 * La fiche créée ici n'a pas encore d'identifiant de connexion (`user_id`) :
 * le mot de passe se définit ensuite, ligne par ligne, dans le même écran.
 */
export async function POST(req: NextRequest) {
  if (!(await exigerAdmin())) {
    return NextResponse.json({ error: 'Accès réservé à l’administratrice.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const prenom = String(body.prenom ?? '').trim();
    const nom = String(body.nom ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const telephone = String(body.telephone ?? '').trim() || null;
    const matieres = Array.isArray(body.matieres) ? body.matieres.map(String) : [];

    if (!prenom || !nom) {
      return NextResponse.json({ error: 'Prénom et nom sont obligatoires.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
    }

    const db = crmAdmin();

    const { data: deja } = await db
      .from('professeurs')
      .select('id, prenom, nom')
      .ilike('email', email)
      .maybeSingle();
    if (deja) {
      const p = deja as { prenom: string; nom: string };
      return NextResponse.json(
        { error: `Cette adresse est déjà celle de ${p.prenom} ${p.nom}.` },
        { status: 409 },
      );
    }

    // Le code est tiré au sort : deux « Claire » ne peuvent pas se retrouver
    // avec le même. On réessaie si la base refuse (23505 = code déjà pris).
    let creee: unknown = null;
    for (let essai = 0; essai < 5 && !creee; essai++) {
      const { data, error } = await db
        .from('professeurs')
        .insert({
          prenom,
          nom,
          email,
          telephone,
          matieres,
          statut_candidature: 'acceptee',
          statut_compte: 'actif',
          role: 'prof',
          code_affiliation: genererCodeAffiliation(prenom),
        })
        .select(CHAMPS_PROF)
        .single();

      if (!error) {
        creee = data;
        break;
      }
      if ((error as { code?: string }).code !== '23505') {
        console.error('❌ Création prof:', error);
        return NextResponse.json({ error: 'Création impossible.' }, { status: 500 });
      }
    }

    if (!creee) {
      return NextResponse.json(
        { error: 'Impossible de tirer un code d’affiliation libre. Réessaie.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, prof: creee }, { status: 201 });
  } catch (err) {
    console.error('❌ Admin profs POST:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
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
