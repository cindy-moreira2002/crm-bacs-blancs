import Link from 'next/link';
import type { Garde } from '@/lib/gardeAcces';

/**
 * Les deux écrans de refus, mutualisés — « non configuré » et « accès réservé ».
 * Reprend au pixel près ce qu'affichaient déjà /admin/emails et
 * /admin/correction, pour que le refus soit identique partout.
 *
 * Le cas `anonyme` n'est pas géré ici : il se traite par `redirect()` dans la
 * page, avant tout rendu.
 */
export function EcranGarde({ garde }: { garde: Garde }) {
  if (garde.etat === 'config') {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Page non configurée</h1>
          <p className="text-sm text-gray-600 mb-3">Variables d’environnement manquantes :</p>
          <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
            {garde.manquants.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            À renseigner dans Vercel (et dans <code>.env.local</code> en local), puis redéployer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-red-200 p-6 shadow-sm text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Accès réservé</h1>
        <p className="text-sm text-gray-600">Cette page est réservée à l’administratrice.</p>
        <Link
          href="/espace-prof"
          className="inline-block mt-4 text-sm text-purple-700 hover:underline"
        >
          ← Retour à mon espace
        </Link>
      </div>
    </div>
  );
}
