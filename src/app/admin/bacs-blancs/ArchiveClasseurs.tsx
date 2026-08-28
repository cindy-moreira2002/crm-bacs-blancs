'use client';

/**
 * L'archive des classeurs de correction.
 *
 * Un classeur par bac blanc et par professeur, du plus récent au plus ancien.
 * C'est l'écran qu'on ouvre le jour où un élève conteste une note : on retrouve
 * qui a corrigé, quand, et dans quel fichier — même des mois après, et même si
 * le professeur n'est plus dans l'équipe.
 *
 * Volontairement en lecture seule : rien ne se supprime d'une archive.
 */
import { useState } from 'react';

export type LigneArchive = {
  id: string;
  matiere: string;
  date_epreuve: string | null;
  professeur_nom: string | null;
  nom: string;
  url: string;
  cree_le: string;
};

const dateCourte = (iso: string | null) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '—';

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function ArchiveClasseurs({ lignes }: { lignes: LigneArchive[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');

  const visibles = filtre.trim()
    ? lignes.filter((l) =>
        `${l.matiere} ${l.professeur_nom ?? ''} ${l.nom}`
          .toLowerCase()
          .includes(filtre.trim().toLowerCase()),
      )
    : lignes;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
      <button
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
      >
        <div>
          <h2 className="font-bold text-gray-900">🗄️ Archive des classeurs de correction</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lignes.length === 0
              ? 'Aucun classeur créé pour l’instant.'
              : `${lignes.length} classeur${lignes.length > 1 ? 's' : ''} — un par bac blanc et par professeur.`}
          </p>
        </div>
        <span className="text-gray-400 text-sm flex-shrink-0">{ouvert ? 'Replier ▲' : 'Ouvrir ▼'}</span>
      </button>

      {ouvert && (
        <div className="px-5 pb-5">
          {lignes.length === 0 ? (
            <p className="text-sm text-gray-500 leading-relaxed">
              Les classeurs apparaissent ici dès qu’un professeur clique sur
              « 📋 Créer mon classeur » depuis sa console. Chacun est une copie du classeur de sa
              matière, nommée « Bac blanc — matière — date — professeur ».
            </p>
          ) : (
            <>
              <input
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                placeholder="Filtrer par matière ou professeur…"
                className="w-full sm:w-80 px-3 py-2 mb-3 rounded-lg border border-gray-300 text-sm"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Épreuve</th>
                      <th className="text-left px-4 py-2.5 font-medium">Matière</th>
                      <th className="text-left px-4 py-2.5 font-medium">Professeur</th>
                      <th className="text-left px-4 py-2.5 font-medium">Créé le</th>
                      <th className="text-right px-4 py-2.5 font-medium">Classeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((l) => (
                      <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800">{dateCourte(l.date_epreuve)}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{l.matiere}</td>
                        <td className="px-4 py-3 text-gray-600">{l.professeur_nom ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{dateHeure(l.cree_le)}</td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            title={l.nom}
                            className="text-purple-600 text-xs font-semibold hover:underline"
                          >
                            Ouvrir →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visibles.length === 0 && (
                <p className="text-sm text-gray-400 mt-3">Aucun classeur ne correspond.</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
