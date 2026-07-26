import { redirect } from 'next/navigation';
import { EspaceProf } from '@/components/EspaceProf';
import { profCourant } from '@/lib/authProf';

export const dynamic = 'force-dynamic';

/**
 * Ancien espace prof, conservé tel quel : suivi des copies déposées, édition du
 * dossier, génération du PDF et envoi à l'élève. Il vit maintenant sous le
 * tableau de bord plutôt qu'à la racine de /espace-prof.
 */
export default async function CorrectionsPage() {
  const { prof } = await profCourant();
  if (!prof) redirect('/devenir-coach');

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <a href="/espace-prof" className="text-sm text-purple-600 hover:underline">
          ← Retour au tableau de bord
        </a>
        <div className="mt-3 mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Corrections — toutes matières</h1>
          <p className="text-gray-600">Tes copies déposées et leurs dossiers de correction.</p>
        </div>
        <EspaceProf />
      </div>
    </div>
  );
}
