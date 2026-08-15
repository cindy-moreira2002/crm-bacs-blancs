import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { authManquant, profConnecte } from '@/lib/authProf';
import { ListeAFaire } from './ListeAFaire';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ce qu’il me reste à faire — Les Matinées du Bac',
};

/**
 * /admin/a-faire — la même vérité que /admin/correction, en français simple.
 *
 * La page de pilotage dit ce qui ne va pas dans les mots de la base. Celle-ci
 * dit quoi faire, matière par matière, et surtout qui le fait : un bouton, ou
 * une personne. Tout vient de /api/admin/correction/a-faire.
 */
export default async function AFairePage() {
  const manquants = authManquant();
  if (manquants.length) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Page non configurée</h1>
          <p className="text-sm text-gray-600 mb-3">Variables d’environnement manquantes :</p>
          <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
            {manquants.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const moi = await profConnecte();
  if (!moi) redirect('/devenir-coach');
  if (moi.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-red-200 p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Accès réservé</h1>
          <p className="text-sm text-gray-600">Cette page est réservée à l’administratrice.</p>
          <Link href="/espace-prof" className="inline-block mt-4 text-sm text-purple-700 hover:underline">
            ← Retour à mon espace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <NavDirection />
      <ListeAFaire />
    </>
  );
}
