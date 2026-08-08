import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authManquant, profConnecte } from '@/lib/authProf';
import { TableauBacsBlancs } from './TableauBacsBlancs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Bacs blancs — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

/**
 * /admin/bacs-blancs — le tableau de bord des épreuves.
 *
 * Réservé à l'administratrice. Une ligne par bac blanc : élèves inscrits,
 * professeurs assignés, sujet déposé, et les retours des professeurs une fois
 * l'épreuve passée. Le pilotage de la CORRECTION reste sur /admin/correction :
 * ici on organise l'épreuve, là-bas on regarde la machine à corriger.
 */
export default async function BacsBlancsPage() {
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

  return <TableauBacsBlancs />;
}
