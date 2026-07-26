import Link from 'next/link';
import { DepotCopiePipeline } from '@/components/DepotCopiePipeline';

export const metadata = {
  title: 'Déposer une copie — Les Matinées du Bac',
};

export default function DeposerCopiePage() {
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
        </div>
        <DepotCopiePipeline />
      </div>
    </div>
  );
}
