import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { gardeAdminPage } from '@/lib/gardeAcces';
import { TableauProfs } from './TableauProfs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Profs & accès — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

/**
 * /admin/profs — la console des accès professeurs.
 *
 * Elle existait déjà côté API (/api/admin/professeurs) mais aucune page ne
 * l'utilisait : valider une candidature ou définir un mot de passe se faisait
 * à la main dans Supabase. C'est désormais ici.
 */
export default async function PageProfs() {
  const garde = await gardeAdminPage();

  if (garde.etat === 'config') {
    return (
      <Cadre titre="Page non configurée">
        <p className="text-sm text-gray-600 mb-3">Variables d’environnement manquantes :</p>
        <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
          {garde.manquants.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Cadre>
    );
  }
  if (garde.etat === 'anonyme') redirect('/devenir-coach');
  if (garde.etat === 'refuse') {
    return (
      <Cadre titre="Accès réservé">
        <p className="text-sm text-gray-600">Cette page est réservée à l’administratrice.</p>
        <Link href="/espace-prof" className="inline-block mt-4 text-sm text-purple-700 hover:underline">
          ← Retour à mon espace
        </Link>
      </Cadre>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <NavDirection />
      <TableauProfs monId={garde.prof.id} />
    </div>
  );
}

function Cadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{titre}</h1>
        {children}
      </div>
    </div>
  );
}
