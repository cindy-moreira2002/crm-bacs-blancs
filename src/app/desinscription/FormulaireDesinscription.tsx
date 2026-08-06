'use client';

import { useState } from 'react';

export function FormulaireDesinscription({ email, jeton }: { email: string; jeton: string }) {
  const [etat, setEtat] = useState<'attente' | 'envoi' | 'fait' | 'erreur'>('attente');
  const [message, setMessage] = useState('');

  async function desinscrire() {
    setEtat('envoi');
    try {
      const res = await fetch('/api/emails/desinscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      setEtat('fait');
    } catch (err) {
      setEtat('erreur');
      setMessage(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  if (etat === 'fait') {
    return (
      <div>
        <p className="text-sm text-gray-700">
          C’est fait : <strong>{email}</strong> ne recevra plus nos actualités ni nos relances.
        </p>
        <p className="text-xs text-gray-500 mt-3">
          Les messages liés à une inscription en cours (convocation, lien de connexion, correction)
          continuent d’arriver — ce sont eux qui te permettent de participer.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Confirme que <strong>{email}</strong> ne doit plus recevoir nos actualités et nos relances.
      </p>
      <button
        onClick={desinscrire}
        disabled={etat === 'envoi'}
        className="w-full rounded-xl bg-purple-700 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
      >
        {etat === 'envoi' ? 'Un instant…' : 'Confirmer ma désinscription'}
      </button>
      {etat === 'erreur' && <p className="text-sm text-red-600 mt-3">{message}</p>}
      <p className="text-xs text-gray-500 mt-4">
        Les informations indispensables à une inscription en cours continueront d’être envoyées.
      </p>
    </div>
  );
}
