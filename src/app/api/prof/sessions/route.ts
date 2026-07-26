/**
 * Inscription / désinscription d'un prof comme coach sur un bac blanc.
 *
 * Règle métier : un prof ne peut se positionner que sur une session d'une
 * matière déclarée dans son profil. La vérification est faite ici, côté
 * serveur — le filtrage de l'affichage ne suffit pas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, profCourant } from '@/lib/authProf';
import { chargerSessions } from '@/lib/espaceProf';

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: NextRequest) {
  const { prof } = await profCourant();
  if (!prof) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  if (prof.statut_compte === 'suspendu') {
    return NextResponse.json({ error: 'Compte suspendu.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? '');
    const action = body.action === 'desinscrire' ? 'desinscrire' : 'inscrire';
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId manquant.' }, { status: 400 });
    }

    const db = crmAdmin();

    if (action === 'desinscrire') {
      const { error } = await db
        .from('session_coachs')
        .delete()
        .eq('session_id', sessionId)
        .eq('professeur_id', prof.id);
      if (error) throw error;
      return NextResponse.json({ success: true, inscrit: false });
    }

    const sessions = await chargerSessions(prof);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });
    }
    if (session.je_coache) {
      return NextResponse.json({ success: true, inscrit: true });
    }
    if (!(prof.matieres ?? []).some((m) => norm(m) === norm(session.matiere))) {
      return NextResponse.json(
        { error: `Ce bac blanc est en ${session.matiere}, qui n’est pas dans tes matières.` },
        { status: 403 },
      );
    }
    if (!['ouverte', 'complete'].includes(session.statut)) {
      return NextResponse.json(
        { error: 'Les inscriptions sont fermées sur ce bac blanc.' },
        { status: 409 },
      );
    }
    if (session.nb_coachs >= session.coachs_recherches) {
      return NextResponse.json(
        { error: 'Toutes les places de coach sont déjà prises sur ce bac blanc.' },
        { status: 409 },
      );
    }

    const { error } = await db
      .from('session_coachs')
      .insert([{ session_id: sessionId, professeur_id: prof.id }]);

    // 23505 = doublon : deux clics rapides, le prof est déjà inscrit.
    if (error && error.code !== '23505') throw error;

    return NextResponse.json({ success: true, inscrit: true });
  } catch (err) {
    console.error('❌ Inscription coach:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
