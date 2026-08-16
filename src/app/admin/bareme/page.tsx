import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { authManquant, profConnecte } from '@/lib/authProf';
import { ListeExamens } from './ListeExamens';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Barèmes par sujet (bac) — Les Matinées du Bac',
};

/**
 * /admin/bareme — les barèmes propres aux sujets, CÔTÉ BACCALAURÉAT.
 *
 * Un barème par sujet dit combien vaut chaque question DE CE SUJET-LÀ. Il n'a
 * de sens que là où les points dépendent des questions posées. Depuis la
 * décision du 15 août 2026, ce n'est le cas d'AUCUNE matière du bac : toutes
 * se notent à leur grille commune ou à leur grille rédigée (`moteurs.ts`). Il
 * n'y a donc rien à créer ici, pas même en français.
 *
 * L'écran proposait pourtant les neuf matières du bac, et son texte annonçait
 * que « la note officielle vient de SON barème » : il réclamait un travail
 * inutile. Désormais le menu de création est calculé (`moteurAttendu`), donc
 * vide, donc masqué ; l'API refuse toute matière dont le moteur attendu n'est
 * pas `bareme_sujet` ; et la page renvoie vers /admin/brevet, qui a ses
 * propres écrans pour le seul diplôme qui se note question par question.
 *
 * Les deux systèmes ne se croisent jamais : contrôle 5.2 de
 * `npm run test:brevet:nonregression`.
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
