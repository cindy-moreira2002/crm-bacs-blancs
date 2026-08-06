import { EspaceEleve } from '@/components/EspaceEleve';

export const metadata = {
  title: 'Mon espace élève — Les Matinées du Bac',
  description: 'Tes bacs blancs, ton salon visio, tes corrections.',
};

// Le composant gère lui-même ses écrans plein-page (connexion, dashboard) :
// aucun conteneur ici, sinon le fond dégradé se retrouve enfermé dans une colonne.
export default function EspaceElevePage() {
  return <EspaceEleve />;
}
