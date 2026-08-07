'use client';

/**
 * « Santé du système » : le détecteur d'anomalies + l'inventaire garanti
 * complet de la base. C'est la section qui répond à « est-ce que tout va
 * bien, et est-ce qu'il y a des choses que je ne vois pas ? ».
 *
 * Chargée à l'ouverture puis sur demande (pas de polling : elle lit les JSON
 * des barèmes, on ménage le quota Supabase).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnomalieGlobale, SanteSysteme } from '@/lib/pipelineSante';

const LIBELLES_CATEGORIES: Record<AnomalieGlobale['categorie'], string> = {
  // En tête : c'est ici que se joue la note officielle des élèves.
  bareme: '🎯 Barèmes des bacs blancs (la note officielle)',
  flux: '🎢 Tapis roulant des copies',
  preparation: '📋 Préparation (grilles de compétences, sujets, dossiers)',
  calibration: '⚖️ Calibration des notes (copies étalons)',
  config: '⚙️ Réglages',
  couverture: '🔭 Couverture de cette page',
};

export function SanteSystemeVue({ onOuvrirMatiere }: { onOuvrirMatiere: (m: string) => void }) {
  const [sante, setSante] = useState<SanteSysteme | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const [inventaireOuvert, setInventaireOuvert] = useState(false);
  const [categoriesOuvertes, setCategoriesOuvertes] = useState<Set<string>>(new Set(['flux']));

  const charger = useCallback(async () => {
    setAnalyse(true);
    try {
      const r = await fetch('/api/admin/correction/sante', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setSante(d);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setAnalyse(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const parCategorie = useMemo(() => {
    const m = new Map<AnomalieGlobale['categorie'], AnomalieGlobale[]>();
    for (const a of sante?.anomalies ?? []) {
      const l = m.get(a.categorie) ?? [];
      l.push(a);
      m.set(a.categorie, l);
    }
    return m;
  }, [sante]);

  const basculer = (cat: string) => {
    const s = new Set(categoriesOuvertes);
    if (s.has(cat)) s.delete(cat);
    else s.add(cat);
    setCategoriesOuvertes(s);
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🩺 Santé du système</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Détecteur d’anomalies sur toute la base : ce qui bloque d’abord, puis ce qui mérite un œil.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sante && (
            <div className="flex items-center gap-2">
              {sante.totaux.bloquants > 0 && (
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold">
                  {sante.totaux.bloquants} bloquant{sante.totaux.bloquants > 1 ? 's' : ''}
                </span>
              )}
              {sante.totaux.attentions > 0 && (
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-sm font-bold">
                  {sante.totaux.attentions} à surveiller
                </span>
              )}
              {sante.totaux.bloquants === 0 && sante.totaux.attentions === 0 && (
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-bold">
                  ✓ tout va bien
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={charger}
            disabled={analyse}
            className="px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium"
          >
            {analyse ? 'analyse…' : '↻ relancer l’analyse'}
          </button>
        </div>
      </div>

      {erreur && <p className="mt-3 text-sm text-red-600 font-mono">{erreur}</p>}
      {!sante && !erreur && <p className="mt-3 text-sm text-gray-400 animate-pulse">Analyse complète de la base…</p>}

      {sante && (
        <>
          {/* Anomalies par catégorie */}
          <div className="mt-4 space-y-2">
            {(Object.keys(LIBELLES_CATEGORIES) as AnomalieGlobale['categorie'][]).map((cat) => {
              const liste = parCategorie.get(cat) ?? [];
              const bloquants = liste.filter((a) => a.niveau === 'bloquant').length;
              const ouverte = categoriesOuvertes.has(cat) || liste.length === 0;
              return (
                <div key={cat} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => basculer(cat)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-semibold text-gray-800">{LIBELLES_CATEGORIES[cat]}</span>
                    <span className="flex items-center gap-2">
                      {liste.length === 0 ? (
                        <span className="text-xs text-emerald-600 font-medium">✓ rien à signaler</span>
                      ) : (
                        <>
                          {bloquants > 0 && <span className="text-xs font-bold text-red-600">{bloquants} ⛔</span>}
                          <span className="text-xs text-gray-500">{liste.length} au total</span>
                        </>
                      )}
                      <span className="text-gray-300 text-xs">{ouverte ? '▲' : '▼'}</span>
                    </span>
                  </button>
                  {ouverte && liste.length > 0 && (
                    <ul className="px-3 pb-2 space-y-1.5">
                      {liste.map((a, i) => (
                        <li
                          key={i}
                          className={`text-xs rounded-lg px-2.5 py-1.5 flex items-start gap-2 ${
                            a.niveau === 'bloquant' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          <span className="shrink-0">{a.niveau === 'bloquant' ? '⛔' : '⚠️'}</span>
                          <span className="min-w-0">
                            {a.matiere_label && (
                              <button
                                type="button"
                                onClick={() => onOuvrirMatiere(a.matiere!)}
                                className="font-bold underline decoration-dotted hover:decoration-solid mr-1"
                                title={`Ouvrir la vue ${a.matiere_label}`}
                              >
                                {a.matiere_label} :
                              </button>
                            )}
                            {a.texte}
                            {a.piste && <span className="block opacity-70 mt-0.5">→ {a.piste}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Inventaire garanti complet */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setInventaireOuvert(!inventaireOuvert)}
              className="text-sm font-semibold text-gray-800 hover:text-purple-700"
            >
              📦 Tout ce que contient Supabase ({sante.inventaire.tables.length} tables ·{' '}
              {sante.inventaire.buckets.length} espaces de fichiers) {inventaireOuvert ? '▲' : '▼'}
            </button>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Liste relue en direct dans le schéma de la base : une table créée demain apparaîtrait ici automatiquement
              comme « non couverte ». Rien ne peut exister dans Supabase sans que cette page le sache.
            </p>

            {inventaireOuvert && (
              <div className="mt-3 space-y-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
                        <th className="py-1.5 pr-3 font-medium">Contenu</th>
                        <th className="py-1.5 pr-3 font-medium">Lignes</th>
                        <th className="py-1.5 pr-3 font-medium">C’est quoi ?</th>
                        <th className="py-1.5 pr-3 font-medium">Où le voir ici</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sante.inventaire.tables.map((t) => (
                        <tr key={t.nom} className="border-b border-gray-50 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <b className="text-gray-800">{t.titre}</b>
                            <span className="block text-[10px] text-gray-400 font-mono">{t.nom}</span>
                          </td>
                          <td className="py-1.5 pr-3 font-bold text-gray-900">{t.lignes < 0 ? '?' : t.lignes}</td>
                          <td className="py-1.5 pr-3 text-gray-600 max-w-[340px]">{t.explication}</td>
                          <td className="py-1.5 pr-3 text-purple-700">{t.ou_voir}</td>
                        </tr>
                      ))}
                      {sante.inventaire.tables_non_couvertes.map((t) => (
                        <tr key={t.nom} className="border-b border-gray-50 bg-amber-50/50">
                          <td className="py-1.5 pr-3 font-mono text-amber-800">{t.nom}</td>
                          <td className="py-1.5 pr-3 font-bold text-amber-800">{t.lignes < 0 ? '?' : t.lignes}</td>
                          <td className="py-1.5 pr-3 text-amber-800" colSpan={2}>
                            ⚠️ Présente en base mais pas encore couverte par cette page.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {sante.inventaire.buckets.map((b) => (
                    <div key={b.nom} className="rounded-xl border border-gray-200 p-3">
                      <p className="text-xs font-bold text-gray-800">
                        {b.titre}{' '}
                        <span className="text-gray-400 font-normal" title={b.partiel ? 'Bucket très volumineux : comptage arrêté au garde-fou, il y en a au moins autant.' : undefined}>
                          · {b.objets < 0 ? '?' : `${b.partiel ? '≥ ' : ''}${b.objets}`} fichier{b.objets > 1 ? 's' : ''}
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{b.explication}</p>
                      <p className="text-[10px] text-gray-300 font-mono mt-1">{b.nom}</p>
                    </div>
                  ))}
                  {sante.inventaire.buckets_non_couverts.map((b) => (
                    <div key={b.nom} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <p className="text-xs font-bold text-amber-800">⚠️ {b.nom}</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">{b.objets} objets — pas encore couvert par cette page.</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-gray-300 mt-3">
            Analyse du {new Date(sante.genere_le).toLocaleString('fr-FR')} — relancée à chaque ouverture de la page ou
            via le bouton.
          </p>
        </>
      )}
    </section>
  );
}
