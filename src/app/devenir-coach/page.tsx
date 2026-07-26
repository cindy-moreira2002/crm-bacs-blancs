import { redirect } from 'next/navigation';
import { CandidatureProf } from '@/components/CandidatureProf';
import { profConnecte } from '@/lib/authProf';

export const dynamic = 'force-dynamic';

const ARGUMENTS = [
  {
    emoji: '🎓',
    titre: 'Tu coaches, on gère le reste',
    texte: 'Élèves inscrits, salons visio, copies et dossiers de correction : tout arrive prêt dans ton espace.',
  },
  {
    emoji: '🔗',
    titre: 'Un lien d’affiliation à toi',
    texte: 'Chaque élève inscrit grâce à ton lien te rapporte, en plus des bacs blancs que tu coaches.',
  },
  {
    emoji: '🗓️',
    titre: 'Tu choisis tes samedis',
    texte: 'Tu vois les bacs blancs ouverts dans tes matières et tu t’inscris sur ceux qui t’arrangent.',
  },
];

export default async function DevenirCoachPage() {
  // Déjà connecté → on ne fait pas remplir un formulaire pour rien.
  const moi = await profConnecte();
  if (moi) redirect('/espace-prof');

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-2">
            Les Matinées du Bac
          </p>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Devenir coach</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Accompagne des élèves de Terminale le temps d’une matinée de bac blanc, corrige leurs
            copies avec notre outil, et suis tes revenus depuis ton espace.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {ARGUMENTS.map((a) => (
            <div key={a.titre} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span aria-hidden className="text-2xl">{a.emoji}</span>
              <h2 className="font-semibold text-gray-900 mt-2 mb-1">{a.titre}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{a.texte}</p>
            </div>
          ))}
        </div>

        <CandidatureProf />
      </div>
    </div>
  );
}
