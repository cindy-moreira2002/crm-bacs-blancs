import { FormInscription } from '@/components/FormInscription';

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const brevet = (await searchParams).examen === 'brevet';

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {brevet ? "S'inscrire à un Brevet Blanc" : "S'inscrire à un Bac Blanc"}
          </h1>
          <p className="text-gray-600 mt-2">
            {brevet
              ? 'Remplis ce formulaire pour participer à un brevet blanc en visio — français ou maths, classe de 3e.'
              : 'Remplis ce formulaire pour participer à un bac blanc en visio.'}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow border border-gray-200 p-8">
          <FormInscription />
        </div>
        <p className="text-xs text-gray-400 text-center mt-6">
          Une fois inscrit, tu recevras un email avec ton lien de salon visio personnel.
        </p>
      </div>
    </div>
  );
}
