import { EspaceEleve } from '@/components/EspaceEleve';

export default function EspaceElevePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Mon espace — Mes corrections</h1>
          <p className="text-gray-600">Retrouve et télécharge tes dossiers de correction.</p>
        </div>
        <EspaceEleve />
      </div>
    </div>
  );
}
