import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { authManquant, profConnecte } from '@/lib/authProf';
import { ListeExamens } from './ListeExamens';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Barèmes par sujet (brevet) — Les Matinées du Bac',
};

/**
 * /admin/bareme — les barèmes propres aux sujets. BREVET UNIQUEMENT.
 *
 * Un barème par sujet dit combien vaut chaque question DE CE SUJET-LÀ. Il n'a
 * de sens que là où les questions changent d'un sujet à l'autre : au brevet.
 * Au baccalauréat, toutes les matières se notent à leur grille commune ou à
 * leur grille rédigée (décision du 15 août 2026, écrite dans `moteurs.ts`) —
 * il n'y a donc rien à créer ici pour un bac blanc, pas même en français.
 *
 * Cet écran a longtemps proposé les neuf matières du bac : il réclamait un
 * travail inutile et cachait les deux seules matières concernées. Le menu de
 * création est désormais tiré de `MATIERES_BREVET`, et l'API refuse toute
 * matière dont le moteur attendu n'est pas `bareme_sujet`.
 *
 * Les grilles, elles, se pilotent depuis /admin/correction : elles produisent
 * la note au bac, et le diagnostic pédagogique partout.
 */
export default async function PageBaremes() {
  const manquants = authManquant();
  if (manquants.length) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Page non configurée</h1>
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
      <ListeExamens />
    </>
  );
}
