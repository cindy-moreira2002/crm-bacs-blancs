import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authManquant, profConnecte } from '@/lib/authProf';
import { EcranExamen } from './EcranExamen';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Barème d’un bac blanc — Les Matinées du Bac',
};

export default async function PageExamen({ params }: { params: Promise<{ examId: string }> }) {
  if (authManquant().length) redirect('/admin/bareme');

  const moi = await profConnecte();
  if (!moi) redirect('/devenir-coach');
  if (moi.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-red-200 p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Accès réservé</h1>
          <Link href="/espace-prof" className="text-sm text-purple-700 hover:underline">
            ← Retour à mon espace
          </Link>
        </div>
      </div>
    );
  }

  const { examId } = await params;
  return <EcranExamen examId={examId} />;
}
