/**
 * Création de compte prof — VOLONTAIREMENT FERMÉE.
 *
 * Les candidatures passent uniquement par le formulaire Google
 * (FORMULAIRE_CANDIDATURE_PROF). L'administratrice lit les réponses, choisit
 * qui rejoint l'équipe, puis crée le compte depuis Supabase.
 *
 * La route est conservée — et non supprimée — pour que personne ne puisse
 * s'inscrire en rejouant l'ancien appel : elle répond toujours 410 Gone.
 * Le code de création vit dans l'historique git si l'inscription en ligne
 * devait un jour être rouverte.
 */
import { NextResponse } from 'next/server';
import { FORMULAIRE_CANDIDATURE_PROF } from '@/lib/liens';

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Les candidatures ne se font plus en ligne. Remplis le formulaire de candidature : nous revenons vers toi pour créer ton espace.',
      formulaire: FORMULAIRE_CANDIDATURE_PROF,
    },
    { status: 410 },
  );
}
