'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Écran affiché quand la personne n'a ni session prof ni code d'accès.
 * On ne dit jamais si un code existe pour telle ou telle valeur : un seul
 * message d'erreur, quelle que soit la raison du refus.
 */
export function PorteDepot({ codeActif }: { codeActif: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await fetch('/api/depot/acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErreur(d.error ?? "Code d'accès incorrect.");
        return;
      }
      router.refresh();
    } catch {
      setErreur('Connexion impossible. Réessaie.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      <h2 className="text-xl font-bold text-gray-900">Accès réservé</h2>
      <p className="text-gray-600 mt-2 text-sm">
        Le dépôt de copies lance la correction automatique. Il est réservé aux
        professeurs des Matinées du Bac.
      </p>

      <a
        href="/devenir-coach"
        className="mt-6 block w-full text-center bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl px-4 py-3 transition"
      >
        Me connecter à mon espace prof
      </a>

      {codeActif && (
        <>
          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs uppercase tracking-wide text-gray-400">ou</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

          <form onSubmit={valider}>
            <label htmlFor="code-depot" className="block text-sm font-semibold text-gray-700 mb-1.5">
              Code d’accès
            </label>
            <input
              id="code-depot"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder="Code transmis par Cindy"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {erreur && <p className="text-sm text-red-600 mt-2">{erreur}</p>}
            <button
              type="submit"
              disabled={envoi || !code.trim()}
              className="mt-4 w-full bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold rounded-xl px-4 py-3 transition"
            >
              {envoi ? 'Vérification…' : 'Entrer'}
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-4">
            Le code ouvre l’accès pour 12 h sur cet appareil uniquement.
          </p>
        </>
      )}
    </div>
  );
}
