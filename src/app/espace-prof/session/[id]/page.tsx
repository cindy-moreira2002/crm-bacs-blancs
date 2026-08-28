import { notFound, redirect } from 'next/navigation';
import { SessionProf } from '@/components/SessionProf';
import { profCourant } from '@/lib/authProf';
import {
  chargerElevesSession,
  chargerSessionAutorisee,
  creneau,
  dateLongue,
} from '@/lib/espaceProf';

export const dynamic = 'force-dynamic';

// Next 16 : params est une promesse.
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { prof } = await profCourant();
  if (!prof) redirect('/devenir-coach');

  const session = await chargerSessionAutorisee(prof, id);
  if (!session) notFound();

  const eleves = await chargerElevesSession(session);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <SessionProf
          session={session}
          eleves={eleves}
          dateLisible={dateLongue(session.date_epreuve)}
          creneau={creneau(session)}
        />
      </div>
    </div>
  );
}
