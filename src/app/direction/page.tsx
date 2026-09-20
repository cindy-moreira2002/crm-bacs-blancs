import Link from 'next/link';
import { CockpitDirection } from '@/components/direction/CockpitDirection';
import { ConnexionDirection } from '@/components/direction/ConnexionDirection';
import { authManquant, profConnecte } from '@/lib/authProf';
import { chargerResumeDirection } from '@/lib/direction/resume';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Direction — Les Matinées du Bac',
};

/**
 * /direction — la vue d'ensemble, et la porte d'entrée de tout l'espace.
 *
 * C'est ici que l'application installée sur le téléphone s'ouvre. Elle doit
 * donc savoir se présenter à quelqu'un qui n'est pas (ou plus) connecté :
 * pas de redirection vers l'espace prof, un écran de connexion sur place.
 * Une redirection ferait sortir de l'application installée.
 */
export default async function PageDirection() {
  const manquants = authManquant();
  if (manquants.length) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-slate-900">Direction non configurée</h1>
          <p className="mb-3 text-sm text-slate-600">Variables d’environnement manquantes :</p>
          <ul className="space-y-1 rounded-lg bg-slate-50 p-3 font-mono text-sm">
            {manquants.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const moi = await profConnecte();
  if (!moi) return <ConnexionDirection />;

  if (moi.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-slate-900">Espace réservé à la direction</h1>
          <p className="text-sm text-slate-600">
            Ton compte n’a pas accès au pilotage. Ton espace personnel, lui, t’attend.
          </p>
          <Link
            href="/espace-prof"
            className="mt-4 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            👩‍🏫 Aller à mon espace prof
          </Link>
        </div>
      </div>
    );
  }

  const resume = await chargerResumeDirection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <CockpitDirection resume={resume} />
    </div>
  );
}
