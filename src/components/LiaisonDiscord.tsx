'use client';

/**
 * « Relier mon compte Discord » — le même bloc dans l'espace élève et dans
 * l'espace prof.
 *
 * Il ne s'affiche que s'il a quelque chose à dire : Discord configuré et compte
 * pas encore relié, ou message de retour à montrer. Une fois le compte relié,
 * il se réduit à une ligne discrète — l'espace n'a pas à rappeler en
 * permanence une chose déjà faite.
 */
import { useEffect, useState } from 'react';
import { MESSAGES_LIAISON } from '@/lib/discord/liaison';

type Etat = { configure: boolean; relie: boolean; role: string | null; sql46: boolean };

/** Le logo Discord, partagé par tous les boutons qui y mènent. */
export function IconeDiscord({ classe = 'w-4 h-4' }: { classe?: string }) {
  return (
    <svg className={classe} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.2.36-.43.842-.59 1.226a18.27 18.27 0 0 0-5.487 0A12.43 12.43 0 0 0 9.21 3a19.74 19.74 0 0 0-4.435 1.372C1.98 8.57 1.22 12.66 1.6 16.69a19.9 19.9 0 0 0 6.06 3.08c.49-.67.926-1.382 1.3-2.13a12.9 12.9 0 0 1-2.05-.99c.173-.128.34-.26.503-.396a14.2 14.2 0 0 0 12.174 0c.165.14.333.272.504.396-.653.386-1.34.718-2.053.99.375.748.81 1.46 1.3 2.13a19.87 19.87 0 0 0 6.063-3.08c.447-4.67-.764-8.72-3.083-12.32ZM8.68 14.24c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42Z" />
    </svg>
  );
}

export function LiaisonDiscord({ pourquoi }: { pourquoi: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  useEffect(() => {
    // Le message de retour est lu puis retiré de l'URL : rechargé plus tard, un
    // espace ne doit pas réafficher le résultat d'une liaison d'hier.
    const params = new URLSearchParams(window.location.search);
    const code = params.get('discord');
    if (code) {
      params.delete('discord');
      const reste = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (reste ? `?${reste}` : ''));
    }

    // Les deux états sont posés ensemble, à l'arrivée de la réponse : le bloc
    // apparaît d'un coup, déjà complet, au lieu de se réécrire sous les yeux.
    fetch('/api/discord/etat')
      .then((r) => r.json())
      .then((e: Etat) => {
        setEtat(e);
        if (code) {
          setRetour(
            MESSAGES_LIAISON[code] ?? { ton: 'erreur', texte: 'La liaison n’a pas abouti.' },
          );
        }
      })
      .catch(() => setEtat(null));
  }, []);

  if (!etat) return null;

  if (etat.sql46) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Discord est configuré, mais la base n’a pas encore les colonnes de liaison :
        le script <code className="font-mono">46_discord_comptes.sql</code> reste à jouer.
      </div>
    );
  }

  if (!etat.configure) return null;

  if (etat.relie && !retour) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <span aria-hidden>🟣</span> Compte Discord relié.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5 space-y-3">
      {retour && (
        <p
          className={`text-sm font-medium ${
            retour.ton === 'ok' ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {retour.texte}
        </p>
      )}

      {!etat.relie && (
        <>
          <div>
            <p className="font-semibold text-gray-900">Relie ton compte Discord</p>
            <p className="text-sm text-gray-600 mt-1">{pourquoi}</p>
          </div>
          <a
            href="/api/discord/oauth/depart"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <IconeDiscord />
            Relier mon compte Discord
          </a>
        </>
      )}
    </div>
  );
}
