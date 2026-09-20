'use client';

/**
 * La porte de l'espace Direction.
 *
 * Elle ne parle ni de candidature ni de coaching : ce n'est pas la même
 * maison que /devenir-coach. Chaque personne de la direction entre avec SON
 * compte — l'espace est partagé, les identifiants ne le sont pas. C'est ce qui
 * permet de savoir qui a validé quel e-mail, et de retirer un accès sans
 * changer le mot de passe de l'autre.
 */
import { useState } from 'react';

export function ConnexionDirection() {
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
      window.location.href = '/direction';
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
            Les Matinées du Bac
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">🧭 Direction</h1>
          <p className="mt-2 text-sm text-slate-500">
            Le pilotage des bacs blancs, des e-mails et des paiements.
          </p>
        </div>

        <form
          onSubmit={seConnecter}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        >
          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-transparent focus:ring-2 focus:ring-purple-500"
            autoComplete="email"
            inputMode="email"
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-transparent focus:ring-2 focus:ring-purple-500"
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Connexion…' : 'Entrer'}
          </button>

          {erreur && (
            <div className="rounded-lg bg-red-100 p-3 text-sm font-medium text-red-800">{erreur}</div>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Professeur ? C’est par{' '}
          <a href="/espace-prof" className="underline">
            l’espace prof
          </a>
          .
        </p>
      </div>
    </div>
  );
}
