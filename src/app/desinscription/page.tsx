/**
 * /desinscription — la page atteinte depuis le lien d'un e-mail commercial.
 *
 * Le jeton signé porte l'adresse : la page ne l'affiche que si la signature
 * est valide, et ne peut désinscrire personne d'autre.
 */
import { lireJetonDesinscription } from '@/lib/emails/desinscription';
import { FormulaireDesinscription } from './FormulaireDesinscription';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Se désinscrire — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

export default async function DesinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;
  const email = lireJetonDesinscription(jeton);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Se désinscrire</h1>

        {!email ? (
          <p className="text-sm text-gray-600">
            Ce lien n’est plus valide. Écris-nous simplement en répondant à l’un de nos e-mails et
            nous te retirons de la liste à la main.
          </p>
        ) : (
          <FormulaireDesinscription email={email} jeton={jeton as string} />
        )}
      </div>
    </div>
  );
}
