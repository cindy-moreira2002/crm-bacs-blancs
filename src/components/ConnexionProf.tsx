'use client';

/**
 * Connexion d'un professeur déjà validé.
 *
 * Il n'y a plus de création de compte ici : les candidatures passent
 * uniquement par le formulaire Google (voir FORMULAIRE_CANDIDATURE_PROF).
 * L'administratrice lit les réponses et crée le compte des profs retenus.
 */
import { useState } from 'react';
import { FORMULAIRE_CANDIDATURE_PROF } from '@/lib/liens';

const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

export function ConnexionProf() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const seConnecter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setLoading(true);
    try {
      const res = await fetch('/api/prof/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Erreur serveur.');
        return;
      }
      window.location.href = '/espace-prof';
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Candidater — la seule porte d'entrée */}
      <div className="rounded-2xl border-2 border-purple-200 bg-white p-6 shadow-sm text-center">
        <h2 className="text-lg font-bold text-gray-900">Tu veux nous rejoindre ?</h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          Les candidatures se font uniquement via notre formulaire. Prends le temps de le lire :
          il explique le fonctionnement et ce qu&apos;on attend d&apos;un coach. On revient vers
          toi ensuite pour créer ton espace.
        </p>
        <a
          href={FORMULAIRE_CANDIDATURE_PROF}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-700"
        >
          Remplir le formulaire de candidature →
        </a>
      </div>

      {/* Connexion — pour les profs dont le compte a déjà été créé */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-3.5">
          <h2 className="text-sm font-semibold text-gray-700">J&apos;ai déjà un compte coach</h2>
        </div>
        <form onSubmit={seConnecter} className="space-y-4 p-6">
          <input type="email" placeholder="Adresse e-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputClass}
            autoComplete="email" required />
          <input type="password" placeholder="Mot de passe" value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)} className={inputClass}
            autoComplete="current-password" required />
          <button type="submit" disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition">
            {loading ? 'Connexion…' : 'Me connecter'}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Mot de passe oublié ? Écris à l&apos;administratrice : elle peut t&apos;en redéfinir un.
          </p>

          {erreur && (
            <div className="p-3 rounded-lg text-sm font-medium bg-red-100 text-red-800">
              {erreur}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
