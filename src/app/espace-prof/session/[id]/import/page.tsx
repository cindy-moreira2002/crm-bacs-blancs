import { notFound, redirect } from 'next/navigation';
import { ImportGrilleProf } from '@/components/ImportGrilleProf';
import { profCourant } from '@/lib/authProf';
import { chargerElevesSession, chargerSessionAutorisee, dateLongue } from '@/lib/espaceProf';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { prof } = await profCourant();
  if (!prof) redirect('/devenir-coach');

  const session = await chargerSessionAutorisee(prof, id);
  if (!session) notFound();

  const eleves = await chargerElevesSession(session);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <ImportGrilleProf
          sessionId={session.id}
          matiere={session.matiere}
          dateLisible={dateLongue(session.date_epreuve)}
          nbEleves={eleves.length}
        />
      </div>
    </div>
  );
}
