import Link from 'next/link';
import { profConnecte } from '@/lib/authProf';
import { chargerFileAValider } from '@/lib/direction/aValider';
import { ListeAValider } from './ListeAValider';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'À valider — Direction',
};

/**
 * /direction/a-valider — l'écran que la notification ouvre.
 *
 * Il ne remplace pas /direction/emails : celle-ci reste la console complète
 * (historique, échecs, réglages, parcours de chaque élève). Ici, on ne
 * répond qu'à une question, celle qu'on se pose dans un couloir entre deux
 * cours : « est-ce que je laisse partir ce message ? ».
 */
export default async function PageAValider() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return (
      <div className="px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-slate-900">Accès réservé</h1>
          <p className="text-sm text-slate-600">Cet écran appartient à la direction.</p>
          <Link href="/direction" className="mt-4 inline-block text-sm text-purple-700 underline">
            ← Retour
          </Link>
        </div>
      </div>
    );
  }

  let file;
  try {
    file = await chargerFileAValider();
  } catch (err) {
    return (
      <div className="px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-slate-900">File illisible</h1>
          <p className="text-sm text-slate-600">{(err as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <ListeAValider
      messages={file.messages}
      validationActive={file.validationActive}
      total={file.total}
    />
  );
}
