import Link from 'next/link';
import { FormInscription } from '@/components/FormInscription';
import type { Examen } from '@/lib/sessions';

// Une inscription = un seul examen, jamais les deux sur le même écran.
// L'élève arrive de l'univers bac ou de l'univers brevet (?examen=…) et ne voit
// que le formulaire correspondant : c'est ce mélange qui provoquait des
// inscriptions dans la mauvaise épreuve.
const UNIVERS = {
  bac: {
    emoji: '🎓',
    titre: "S'inscrire à un Bac Blanc",
    sous: 'Remplis ce formulaire pour participer à un bac blanc en visio — lycée, toutes matières.',
    fond: 'bg-purple-50',
    bandeau: 'bg-purple-600',
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    lien: 'text-purple-700 hover:text-purple-900',
    etiquette: 'Bac blanc · Lycée',
  },
  brevet: {
    emoji: '📘',
    titre: "S'inscrire à un Brevet Blanc",
    sous: 'Remplis ce formulaire pour participer à un brevet blanc en visio — classe de 3e, français ou maths.',
    fond: 'bg-blue-50',
    bandeau: 'bg-blue-700',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    lien: 'text-blue-700 hover:text-blue-900',
    etiquette: 'Brevet blanc · 3e',
  },
} as const;

// Arrivée sans contexte (/inscription tout court) : on montre les deux
// possibilités côte à côte plutôt que de deviner à la place de la personne.
function ChoixExamen() {
  return (
    <div className="min-h-screen bg-gray-50 py-14 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 text-center">À quelle épreuve veux-tu t&apos;inscrire ?</h1>
        <p className="text-gray-600 mt-2 mb-10 text-center">
          Les deux programmes sont différents : choisis celui qui correspond à ta classe.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            href="/inscription?examen=bac"
            className="block rounded-2xl border-2 border-purple-200 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:border-purple-500 hover:shadow-lg"
          >
            <div className="text-4xl">🎓</div>
            <h2 className="mt-4 text-xl font-bold text-purple-800">Bac blanc</h2>
            <p className="mt-1 text-sm font-semibold text-purple-600">Première et Terminale</p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Français, philosophie, maths, histoire-géo, SES… Épreuve en conditions réelles, coaching pendant
              l&apos;examen et dossier de correction personnalisé.
            </p>
            <span className="mt-6 inline-block rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
              M&apos;inscrire à un bac blanc →
            </span>
          </Link>

          <Link
            href="/inscription?examen=brevet"
            className="block rounded-2xl border-2 border-blue-200 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:border-blue-600 hover:shadow-lg"
          >
            <div className="text-4xl">📘</div>
            <h2 className="mt-4 text-xl font-bold text-blue-800">Brevet blanc</h2>
            <p className="mt-1 text-sm font-semibold text-blue-700">Classe de 3e</p>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Français et mathématiques. Le même accompagnement, pour s&apos;entraîner au brevet et arriver prêt
              en seconde.
            </p>
            <span className="mt-6 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
              M&apos;inscrire à un brevet blanc →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const examenParam = (await searchParams).examen;

  if (examenParam !== 'bac' && examenParam !== 'brevet') return <ChoixExamen />;

  const examen: Examen = examenParam;
  const u = UNIVERS[examen];
  const autre = examen === 'bac' ? 'brevet' : 'bac';

  return (
    <div className={`min-h-screen ${u.fond}`}>
      <div className={`h-2 w-full ${u.bandeau}`} />

      <div className="py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${u.badge}`}>
              {u.emoji} {u.etiquette}
            </span>
            <h1 className="text-3xl font-bold text-gray-900 mt-3">{u.titre}</h1>
            <p className="text-gray-600 mt-2">{u.sous}</p>
          </div>

          <FormInscription examen={examen} />

          <p className="text-xs text-gray-400 text-center mt-6">
            Une fois inscrit, tu recevras un email avec ton lien de salon visio personnel.
          </p>

          <p className="text-sm text-center mt-4">
            <Link href={`/inscription?examen=${autre}`} className={`font-semibold underline ${u.lien}`}>
              {autre === 'brevet'
                ? 'Vous cherchiez le brevet blanc (3e) ? →'
                : 'Vous cherchiez le bac blanc (lycée) ? →'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
