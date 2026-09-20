'use client';

/**
 * « Réglages du jour J » — les deux adresses que tous les profs ouvrent.
 *
 * Elles étaient rangées session par session, donc vides partout : l'espace prof
 * affichait un lien de démonstration qui ne menait nulle part. Elles se posent
 * ici une fois pour toutes, et chaque console de prof les reprend.
 *
 * Une session peut toujours avoir les siennes (colonnes `sheet_correction_url`
 * et `drive_copies_url`) : quand elles sont remplies, elles gagnent sur ces
 * adresses générales.
 */
import { useState } from 'react';

type Cle = 'sheet_correction_url' | 'drive_copies_url';

const CHAMPS: { cle: Cle; emoji: string; titre: string; aide: string; exemple: string }[] = [
  {
    cle: 'sheet_correction_url',
    emoji: '📊',
    titre: 'Grille de correction — classeur de secours',
    aide: 'Chaque matière a DÉJÀ son classeur (les guidelines). Ce champ ne sert que pour une matière dont le classeur n’existe pas encore.',
    exemple: 'https://docs.google.com/spreadsheets/d/…',
  },
  {
    cle: 'drive_copies_url',
    emoji: '📁',
    titre: 'Dossier des copies',
    aide: 'Le dossier où sont rangées les copies des élèves. Le prof l’ouvre depuis sa console.',
    exemple: 'https://drive.google.com/drive/folders/…',
  },
];

export function ReglagesJourJ({
  initiales,
}: {
  initiales: Record<Cle, string>;
}) {
  const [valeurs, setValeurs] = useState<Record<Cle, string>>(initiales);
  const [busy, setBusy] = useState<Cle | ''>('');
  const [message, setMessage] = useState<{ cle: Cle; texte: string; ok: boolean } | null>(null);

  const enregistrer = async (cle: Cle) => {
    setBusy(cle);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/reglages-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle, valeur: valeurs[cle] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ cle, texte: data.error ?? 'Erreur.', ok: false });
        return;
      }
      setValeurs(data.reglages);
      setMessage({
        cle,
        texte: data.reglages[cle] ? 'Enregistré — visible par tous les profs.' : 'Adresse effacée.',
        ok: true,
      });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
      <h2 className="font-bold text-gray-900">🗝️ Réglages du jour J</h2>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Les deux adresses que chaque prof ouvre depuis sa console, sur tous les bacs blancs.
        À renseigner une seule fois.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {CHAMPS.map((c) => (
          <div key={c.cle}>
            <label className="block text-sm font-semibold text-gray-800">
              <span aria-hidden className="mr-1.5">{c.emoji}</span>{c.titre}
            </label>
            <p className="text-xs text-gray-500 mt-0.5 mb-2 leading-relaxed">{c.aide}</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={valeurs[c.cle]}
                onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))}
                placeholder={c.exemple}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <button
                onClick={() => enregistrer(c.cle)}
                disabled={busy === c.cle}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
              >
                {busy === c.cle ? '…' : 'Enregistrer'}
              </button>
            </div>
            {message?.cle === c.cle && (
              <p className={`text-xs mt-1.5 ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
                {message.texte}
              </p>
            )}
            {!valeurs[c.cle] && message?.cle !== c.cle && (
              <p className="text-xs text-gray-400 mt-1.5">
                Non renseigné. {c.cle === 'sheet_correction_url'
                  ? 'Sans conséquence tant que chaque matière a son classeur.'
                  : 'Les profs voient un bouton éteint à la place.'}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
