'use client';

/**
 * Import de la grille de correction : dépôt du CSV, rapport de validation,
 * formulaires préremplis relisables, puis génération des dossiers.
 *
 * Le prof ne recopie jamais rien : ce qu'il a écrit dans le Sheet arrive tel
 * quel dans les champs, il ne fait que vérifier et corriger si besoin.
 */
import { useState } from 'react';
import type { Colonne, LigneImportee, RapportImport } from '@/lib/importGrille';

type Resultat = {
  enregistrees: number;
  generes: string[];
  sansCopie: string[];
  pipelineIndisponible: string | null;
};

export function ImportGrilleProf({
  sessionId,
  matiere,
  dateLisible,
  nbEleves,
}: {
  sessionId: string;
  matiere: string;
  dateLisible: string;
  nbEleves: number;
}) {
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [lignes, setLignes] = useState<LigneImportee[]>([]);
  const [nomFichier, setNomFichier] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const criteres: Colonne[] = (rapport?.colonnes ?? []).filter((c) => c.role === 'critere');

  const deposer = async (fichier: File) => {
    setBusy(true);
    setErreur(null);
    setResultat(null);
    try {
      const form = new FormData();
      form.append('fichier', fichier);
      const res = await fetch(`/api/prof/sessions/${sessionId}/import`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Import impossible.');
        return;
      }
      setRapport(data.rapport);
      setLignes(data.rapport.lignes);
      setNomFichier(data.nomFichier);
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setBusy(false);
    }
  };

  /** Modification à l'écran d'un critère ou de la note, avant génération. */
  const modifier = (numero: number, champ: string, valeur: string) => {
    setLignes((prev) =>
      prev.map((l) => {
        if (l.numero !== numero) return l;
        if (champ === '__note') {
          const v = valeur.trim().replace(',', '.');
          return { ...l, note: v === '' ? null : Number(v) };
        }
        return { ...l, criteres: { ...l.criteres, [champ]: valeur } };
      }),
    );
  };

  /** Une ligne est générable si l'élève est reconnu et qu'il reste une note. */
  const generable = (l: LigneImportee) =>
    !!l.eleveId && l.note != null && !Number.isNaN(l.note) && l.note >= 0 && l.note <= 20;

  const pretes = lignes.filter(generable);
  const bloquees = lignes.filter((l) => !generable(l));

  const generer = async () => {
    if (!confirm(`Générer ${pretes.length} dossier(s) de correction ?`)) return;
    setBusy(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/prof/sessions/${sessionId}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colonnes: rapport?.colonnes ?? [],
          lignes: pretes.map((l) => ({
            inscriptionId: l.eleveId,
            eleveNom: l.eleveNom,
            note: l.note,
            criteres: l.criteres,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Génération impossible.');
        return;
      }
      setResultat(data);
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <a href={`/espace-prof/session/${sessionId}`} className="text-sm text-purple-600 hover:underline">
        ← Retour à la session
      </a>

      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Importer la grille de correction</h1>
        <p className="text-gray-500 capitalize">{matiere} · {dateLisible} · {nbEleves} élève{nbEleves > 1 ? 's' : ''}</p>
      </header>

      {/* Dépôt du fichier */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="font-bold text-gray-900 mb-1">Dépose le fichier exporté</h2>
        <p className="text-sm text-gray-600 mb-4">
          Dans le Google Sheet : <strong>Fichier → Télécharger → Valeurs séparées par des virgules
          (.csv)</strong>. Une ligne par élève, une colonne par critère.
        </p>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) deposer(f);
          }}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:bg-purple-600 file:text-white file:font-semibold hover:file:bg-purple-700 file:cursor-pointer"
        />
        {nomFichier && <p className="text-xs text-gray-400 mt-2">Fichier lu : {nomFichier}</p>}
      </section>

      {erreur && (
        <div className="mb-6 p-4 rounded-xl bg-red-100 text-red-800 text-sm font-medium">{erreur}</div>
      )}

      {/* Résultat de la génération */}
      {resultat && (
        <section className="mb-6 space-y-3">
          <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-sm text-green-900">
            <strong>{resultat.enregistrees} correction{resultat.enregistrees > 1 ? 's' : ''} enregistrée
            {resultat.enregistrees > 1 ? 's' : ''}.</strong>
            {resultat.generes.length > 0 && (
              <> Dossier lancé pour : {resultat.generes.join(', ')}.</>
            )}
          </div>
          {resultat.pipelineIndisponible && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
              {resultat.pipelineIndisponible}
            </div>
          )}
          {!resultat.pipelineIndisponible && resultat.sansCopie.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <strong>Pas de dossier généré pour :</strong> {resultat.sansCopie.join(', ')}. Leur copie
              n’a pas encore été corrigée par le pipeline — dépose-la depuis la session, puis relance.
            </div>
          )}
        </section>
      )}

      {/* Rapport de validation */}
      {rapport && (
        <>
          <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Lignes lues', valeur: rapport.resume.total, classe: 'bg-gray-100 text-gray-800' },
              { label: 'Prêtes à générer', valeur: pretes.length, classe: 'bg-green-100 text-green-800' },
              { label: 'Élèves non reconnus', valeur: rapport.resume.nonReconnues, classe: 'bg-red-100 text-red-800' },
              { label: 'Incomplètes', valeur: bloquees.length - rapport.resume.nonReconnues, classe: 'bg-amber-100 text-amber-800' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl p-4 ${s.classe}`}>
                <p className="text-2xl font-bold">{Math.max(0, s.valeur)}</p>
                <p className="text-xs font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </section>

          {/* Ce qui bloque */}
          {(rapport.erreursFichier.length > 0 || rapport.elevesSansLigne.length > 0) && (
            <section className="mb-6 space-y-3">
              {rapport.erreursFichier.map((e) => (
                <div key={e} className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
                  <strong>Format du fichier :</strong> {e}
                </div>
              ))}
              {rapport.elevesSansLigne.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <strong>Élève{rapport.elevesSansLigne.length > 1 ? 's' : ''} inscrit
                  {rapport.elevesSansLigne.length > 1 ? 's' : ''} sans ligne dans la grille :</strong>{' '}
                  {rapport.elevesSansLigne.map((e) => e.nom).join(', ')}.
                </div>
              )}
            </section>
          )}

          {/* Colonnes reconnues */}
          <section className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-900 mb-3">Colonnes reconnues</h2>
            <div className="flex flex-wrap gap-2">
              {rapport.colonnes.map((c) => (
                <span key={c.cle}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    c.role === 'eleve' ? 'bg-blue-100 text-blue-800'
                      : c.role === 'email' ? 'bg-blue-50 text-blue-700'
                      : c.role === 'note' ? 'bg-purple-100 text-purple-800'
                      : c.role === 'critere' ? 'bg-gray-100 text-gray-700'
                      : 'bg-gray-50 text-gray-400 line-through'
                  }`}>
                  {c.entete || '(sans titre)'}
                  <span className="ml-1.5 opacity-60">
                    {c.role === 'eleve' ? 'élève' : c.role === 'note' ? 'note' : c.role === 'critere' ? 'critère' : c.role}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Les critères deviennent les champs du formulaire de correction ci-dessous : ils sont
              exactement calqués sur les colonnes de ta grille.
            </p>
          </section>

          {/* Formulaires préremplis */}
          <section className="space-y-4 mb-6">
            <h2 className="font-bold text-gray-900">Corrections préremplies — relis et corrige si besoin</h2>
            {lignes.map((l) => {
              const ok = generable(l);
              return (
                <div key={l.numero}
                  className={`bg-white rounded-2xl border shadow-sm p-5 ${ok ? 'border-gray-200' : 'border-amber-300'}`}>
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <div>
                      <h3 className="font-bold text-gray-900">
                        {l.eleveNom ?? (l.nomBrut || `Ligne ${l.numero}`)}
                      </h3>
                      <p className="text-xs text-gray-400">Ligne {l.numero} du fichier</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {ok ? 'Prête à générer' : l.eleveId ? 'À compléter' : 'Élève non reconnu'}
                    </span>
                  </div>

                  {l.problemes.length > 0 && (
                    <ul className="mb-4 space-y-1">
                      {l.problemes.map((p) => (
                        <li key={p} className="text-xs text-amber-800 flex gap-2">
                          <span aria-hidden>⚠️</span>{p}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!l.eleveId && (
                    <p className="mb-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                      Cette ligne ne sera pas générée. Corrige l’orthographe du nom dans le Google
                      Sheet (ou ajoute une colonne « E-mail »), puis réimporte le fichier.
                    </p>
                  )}

                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Note /20</span>
                      <input
                        type="number" min={0} max={20} step={0.5}
                        value={l.note ?? ''}
                        onChange={(e) => modifier(l.numero, '__note', e.target.value)}
                        className="mt-1 w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </label>

                    {criteres.map((c) => {
                      const valeur = l.criteres[c.cle] ?? '';
                      const long = valeur.length > 60;
                      return (
                        <label key={c.cle} className="block">
                          <span className="text-sm font-medium text-gray-700">{c.entete}</span>
                          {long ? (
                            <textarea
                              rows={3}
                              value={valeur}
                              onChange={(e) => modifier(l.numero, c.cle, e.target.value)}
                              className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 ${
                                valeur ? 'border-gray-300' : 'border-amber-300 bg-amber-50'
                              }`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={valeur}
                              onChange={(e) => modifier(l.numero, c.cle, e.target.value)}
                              placeholder="Vide dans la grille"
                              className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 ${
                                valeur ? 'border-gray-300' : 'border-amber-300 bg-amber-50'
                              }`}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Génération */}
          <div className="sticky bottom-4 bg-white rounded-2xl border border-gray-200 shadow-lg p-4 flex items-center gap-4 flex-wrap">
            <p className="text-sm text-gray-600 flex-1">
              <strong className="text-gray-900">{pretes.length}</strong> correction
              {pretes.length > 1 ? 's' : ''} prête{pretes.length > 1 ? 's' : ''} à générer
              {bloquees.length > 0 && (
                <span className="text-amber-700"> · {bloquees.length} ligne{bloquees.length > 1 ? 's' : ''} laissée{bloquees.length > 1 ? 's' : ''} de côté</span>
              )}
            </p>
            <button
              onClick={generer}
              disabled={busy || pretes.length === 0}
              className="px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Génération…' : 'Générer le dossier de correction'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
