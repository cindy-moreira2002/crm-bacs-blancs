import Link from 'next/link';
import { DepotCopiePipeline } from '@/components/DepotCopiePipeline';
import { PorteDepot } from '@/components/PorteDepot';
import { accesDepot, codeDepotConfigure } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Déposer une copie — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

/**
 * Chaque dépôt déclenche trois appels payants à l'API Anthropic : la page est
 * fermée aux visiteurs anonymes. Deux entrées possibles (voir lib/accesDepot) :
 * session prof, ou code d'accès partagé pour les profs invités.
 */
export default async function DeposerCopiePage() {
  const acces = await accesDepot();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-12 px-4">
      <div className="container mx-auto">
        <div className="max-w-4xl mx-auto mb-8">
          <Link href="/espace-prof" className="text-sm text-purple-700 hover:underline">
            ← Espace prof
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">Correction automatique</h1>
          <p className="text-gray-600 mt-1">
            Dépose la copie, récupère le dossier de l’élève. Rien d’autre à faire.
          </p>
          {acces.autorise && acces.nom && (
            <p className="text-sm text-gray-500 mt-2">Connecté en tant que {acces.nom}.</p>
          )}
        </div>

        {acces.autorise ? (
          <DepotCopiePipeline />
        ) : (
          <PorteDepot codeActif={codeDepotConfigure()} />
        )}
      </div>
    </div>
  );
}
