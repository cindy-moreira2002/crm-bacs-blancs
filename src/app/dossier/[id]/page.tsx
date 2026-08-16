import { DossierViewer } from '@/components/DossierViewer';
import { SujetDeLaCopie } from '@/components/SujetDeLaCopie';
import { chargerSujetDeCorrection } from '@/lib/sujet';

export const metadata = {
  title: 'Mon dossier de correction — Les Matinées du Bac',
};

/**
 * Page du dossier de correction — c'est le lien que reçoit l'élève.
 * L'identifiant est un UUID non devinable ; le dossier lui-même est servi
 * par /api/pipeline/dossier/[id] avec une CSP verrouillée.
 *
 * Le sujet est rappelé au-dessus : relire une correction sans avoir l'énoncé
 * sous les yeux ne sert à rien. On n'affiche PAS les attendus du corrigé — le
 * même sujet resservira à d'autres élèves.
 */
export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sujet = await chargerSujetDeCorrection(id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-10 px-4">
      <div className="container mx-auto">
        <div className="max-w-4xl mx-auto mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Ton dossier de correction</h1>
          <p className="text-gray-600 mt-1">
            Lis-le en entier, puis garde-le : il te dit exactement où tu gagnes des points.
          </p>
        </div>
        {sujet && (
          <div className="max-w-4xl mx-auto mb-6">
            <SujetDeLaCopie sujet={sujet} titre="Le sujet que tu as traité" />
          </div>
        )}
        <DossierViewer correctionId={id} />
      </div>
    </div>
  );
}
