import { EspaceProf } from '@/components/EspaceProf';

export default function EspaceProfPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Espace prof — Corrections</h1>
          <p className="text-gray-600">Tes copies déposées et leurs dossiers de correction.</p>
        </div>
        <EspaceProf />
      </div>
    </div>
  );
}
