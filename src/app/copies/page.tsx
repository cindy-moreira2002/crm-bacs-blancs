import { FormCopie } from '@/components/FormCopie';

export default function CopiesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-12 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Correction de copies</h1>
          <p className="text-lg text-gray-600">Dépose une copie d'élève à corriger</p>
        </div>
        <FormCopie />
      </div>
    </div>
  );
}
