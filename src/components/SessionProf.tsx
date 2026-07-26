'use client';

/**
 * Détail d'un bac blanc, en 3 sous-onglets :
 *   Élèves et appels · Copies · Corrections
 */
import { useState } from 'react';
import type { EleveSession, SessionEnrichie } from '@/lib/espaceProf';

type SousOnglet = 'eleves' | 'copies' | 'corrections';

const SOUS_ONGLETS: { cle: SousOnglet; label: string; emoji: string }[] = [
  { cle: 'eleves', label: 'Élèves et appels', emoji: '👥' },
  { cle: 'copies', label: 'Copies', emoji: '📄' },
  { cle: 'corrections', label: 'Corrections', emoji: '✍️' },
];

function statutEleve(e: EleveSession): { texte: string; classe: string } {
  if (!e.copie) return { texte: 'Copie attendue', classe: 'bg-gray-100 text-gray-600' };
  if (e.copie.envoye) return { texte: 'Dossier envoyé', classe: 'bg-green-100 text-green-800' };
  if (e.copie.pdf_pret) return { texte: 'Dossier prêt', classe: 'bg-blue-100 text-blue-800' };
  if (e.copie.statut === 'corrigée') return { texte: 'Corrigée', classe: 'bg-purple-100 text-purple-800' };
  return { texte: 'À corriger', classe: 'bg-amber-100 text-amber-800' };
}

export function SessionProf({
  session,
  eleves,
  dateLisible,
  creneau,
}: {
  session: SessionEnrichie;
  eleves: EleveSession[];
  dateLisible: string;
  creneau: string;
}) {
  const [onglet, setOnglet] = useState<SousOnglet>('eleves');

  const avecCopie = eleves.filter((e) => e.copie);
  const corrigees = eleves.filter((e) => e.copie?.statut === 'corrigée');

  // Tant que le vrai Sheet n'existe pas, on affiche un lien de démonstration
  // clairement identifié. Il suffira de renseigner sessions_bacs_blancs.
  // sheet_correction_url pour qu'il soit remplacé partout.
  const sheetUrl = session.sheet_correction_url;
  const sheetProvisoire = !sheetUrl;
  const lienSheet =
    sheetUrl ?? 'https://docs.google.com/spreadsheets/d/EXEMPLE-A-REMPLACER/edit#gid=0';

  return (
    <div>
      <a href="/espace-prof" className="text-sm text-purple-600 hover:underline">
        ← Retour au tableau de bord
      </a>

      {/* En-tête : date en grand */}
      <header className="mt-3 mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide">
          {session.matiere}
        </p>
        <h1 className="text-3xl font-bold text-gray-900 capitalize mt-1">{dateLisible}</h1>
        <p className="text-gray-500 mt-1">{creneau}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
          <span className="text-gray-700"><strong>{eleves.length}</strong> élève{eleves.length > 1 ? 's' : ''} inscrit{eleves.length > 1 ? 's' : ''}</span>
          <span className="text-gray-700"><strong>{avecCopie.length}</strong> copie{avecCopie.length > 1 ? 's' : ''} déposée{avecCopie.length > 1 ? 's' : ''}</span>
          <span className="text-gray-700"><strong>{corrigees.length}</strong> corrigée{corrigees.length > 1 ? 's' : ''}</span>
        </div>
      </header>

      {/* Sous-onglets */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-gray-200">
        {SOUS_ONGLETS.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
              onglet === o.cle
                ? 'text-purple-700 border-purple-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}>
            <span aria-hidden className="mr-1.5">{o.emoji}</span>{o.label}
          </button>
        ))}
      </div>

      {eleves.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
          Aucun élève inscrit sur ce bac blanc pour l’instant.
        </div>
      )}

      {/* --- Élèves et appels --- */}
      {onglet === 'eleves' && eleves.length > 0 && (
        <div className="space-y-3">
          {eleves.map((e) => {
            const s = statutEleve(e);
            return (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{e.nom}</p>
                  <p className="text-xs text-gray-400 truncate">{e.email || '—'}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${s.classe}`}>
                  {s.texte}
                </span>
                <a
                  href={`https://meet.jit.si/matineesdubac-${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Rejoindre l’élève
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Copies --- */}
      {onglet === 'copies' && eleves.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Élève</th>
                  <th className="text-left px-5 py-2.5 font-medium">Copie</th>
                  <th className="text-left px-5 py-2.5 font-medium">Note</th>
                  <th className="text-left px-5 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {eleves.map((e) => {
                  const s = statutEleve(e);
                  return (
                    <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{e.nom}</td>
                      <td className="px-5 py-3">
                        {e.copie?.fichier_nom ? (
                          <a href={`/api/copies/fichier?id=${e.copie.id}`} target="_blank" rel="noreferrer"
                            className="text-purple-600 hover:underline">
                            Ouvrir la copie
                          </a>
                        ) : (
                          <span className="text-gray-300">Pas encore déposée</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {e.copie?.note != null ? `${e.copie.note}/20` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.classe}`}>
                          {s.texte}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- Corrections --- */}
      {onglet === 'corrections' && (
        <div className="space-y-5">
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-1">1. Remplir la grille de correction</h2>
            <p className="text-sm text-gray-600 mb-4">
              Une ligne par élève, une colonne par critère. Tu remplis directement dans le tableau.
            </p>

            {sheetProvisoire && (
              <div className="flex gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                <span aria-hidden>🧪</span>
                <p className="text-xs text-amber-900 leading-relaxed">
                  <strong>Lien de démonstration.</strong> Le vrai Google Sheet de correction n’existe
                  pas encore. Dès qu’il sera prêt, il suffira de renseigner son URL dans la colonne{' '}
                  <code className="bg-amber-100 px-1 rounded">sheet_correction_url</code> de la
                  session : le lien sera remplacé ici automatiquement.
                </p>
              </div>
            )}

            <a href={lienSheet} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700">
              📊 Ouvrir la grille de correction
            </a>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-1">2. Importer la grille remplie</h2>
            <p className="text-sm text-gray-600 mb-4">
              Exporte la page du Sheet en CSV (Fichier → Télécharger → CSV), puis dépose-la ici.
              Les élèves et les colonnes sont reconnus automatiquement, et les formulaires de
              correction sont préremplis — tu n’as rien à recopier.
            </p>
            <a href={`/espace-prof/session/${session.id}/import`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
              📥 Importer la grille
            </a>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-1">3. Correction copie par copie</h2>
            <p className="text-sm text-gray-600 mb-4">
              Pour déposer une copie et lancer la correction automatique d’un élève.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/espace-prof/deposer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">
                📄 Déposer une copie
              </a>
              <a href="/espace-prof/corrections"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">
                🗂️ Suivi des dossiers
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
