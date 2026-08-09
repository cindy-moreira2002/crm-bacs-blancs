import Link from 'next/link';
import { gardeAdminPage } from './garde';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Brevet blanc — Les Matinées du Bac',
};

/**
 * /admin/brevet — l'entrée du diplôme national du brevet.
 *
 * Cette page existe pour rendre la séparation évidente dès le premier écran :
 * le baccalauréat vit dans /admin/bareme et /admin/correction, le brevet ici,
 * et à l'intérieur du brevet les deux matières ne partagent aucun écran.
 */
export default async function PageBrevet() {
  const refus = await gardeAdminPage();
  if (refus) return refus;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b-4 border-teal-500 pb-5">
          <p className="text-sm text-gray-500">
            <Link href="/admin/correction" className="hover:underline">
              Pilotage de la correction
            </Link>{' '}
            ›{' '}
            <span className="inline-block px-2 py-0.5 rounded-md border border-teal-400 bg-teal-100 text-teal-900 text-xs font-bold">
              Brevet
            </span>
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Brevet blanc — série générale</h1>
          <p className="text-gray-700 mt-3 max-w-3xl leading-relaxed">
            Deux matières, deux systèmes de correction <strong>entièrement séparés</strong> : rien
            n’est partagé entre le français et les mathématiques, et rien n’est partagé avec le
            baccalauréat. Une copie de brevet ne peut pas être corrigée avec une grille de bac : la
            base le refuse, les moteurs le refusent, et les écrans ne se croisent jamais.
          </p>
          <p className="text-sm text-gray-600 mt-2 max-w-3xl">
            Session de référence <strong>2027</strong>. Les sujets écrits portent alors sur le
            programme de la classe de troisième (note de service NOR MENE2515977N, BO n° 33 du
            4 septembre 2025).
          </p>
        </header>

        <div className="grid sm:grid-cols-2 gap-5">
          <CarteMatiere
            href="/admin/brevet/francais"
            titre="Français — Brevet"
            couleur="border-teal-300 hover:border-teal-500"
            bareme="100 points, ramenés sur 20"
            blocs={['Travail sur le texte — 50', 'Dictée — 10', 'Rédaction — 40']}
            detail="Trois blocs indépendants, une réécriture forme par forme, une dictée dont le barème de retrait est propre au sujet, et deux grilles de rédaction distinctes (imagination et réflexion)."
          />
          <CarteMatiere
            href="/admin/brevet/mathematiques"
            titre="Mathématiques — Brevet"
            couleur="border-cyan-300 hover:border-cyan-500"
            bareme="20 points"
            blocs={['Automatismes — 6 (sans calculatrice)', 'Raisonnement — 14 (rédaction comprise)']}
            detail="Automatismes item par item, résolution de problèmes étape par étape, erreurs en cascade explicites, méthodes alternatives valorisées, et 2 points de qualité rédactionnelle compris dans les 14."
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="font-bold text-gray-900 mb-2">Le baccalauréat n’est pas ici</h2>
          <p className="text-sm text-gray-600">
            Les bacs blancs et leurs barèmes restent sur{' '}
            <Link href="/admin/bareme" className="text-purple-700 underline">
              /admin/bareme
            </Link>
            , et le pilotage général sur{' '}
            <Link href="/admin/correction" className="text-purple-700 underline">
              /admin/correction
            </Link>
            . Rien n’a changé pour eux.
          </p>
        </div>
      </div>
    </div>
  );
}

function CarteMatiere({
  href,
  titre,
  couleur,
  bareme,
  blocs,
  detail,
}: {
  href: string;
  titre: string;
  couleur: string;
  bareme: string;
  blocs: string[];
  detail: string;
}) {
  return (
    <Link
      href={href}
      className={`block bg-white rounded-2xl border-2 p-6 shadow-sm transition ${couleur}`}
    >
      <h2 className="text-xl font-bold text-gray-900">{titre}</h2>
      <p className="text-sm font-semibold text-teal-800 mt-1">{bareme}</p>
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {blocs.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="text-teal-600">•</span>
            {b}
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-600 mt-3 leading-relaxed">{detail}</p>
      <p className="text-sm font-semibold text-teal-700 mt-4">Ouvrir →</p>
    </Link>
  );
}
