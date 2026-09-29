'use client';

/**
 * « À regarder par toi » — la seule file humaine des matières sans prof
 * relecteur (SES, HLP, LLCER anglais, SVT, physique-chimie).
 *
 * Une copie n'arrive ici qu'après que l'IA a tout essayé : deuxième lecture,
 * une recorrection, une relance de la transcription. Liste simple, une ligne
 * par copie, trois gestes possibles. Chargée à l'ouverture et toutes les
 * 60 s (une requête légère, filtrée côté base).
 */
import { useCallback, useEffect, useState } from 'react';
import type { CopieARegarder } from '@/lib/fileCindy';

type Reponse = { copies: CopieARegarder[]; budget: { utilise: number; max: number } | null };

const LIBELLE_NATURE: Record<string, string> = {
  correction: 'correction',
  transcription: 'lecture de la copie',
  systeme: 'système',
};

function nombre(n: number | null) {
  return n == null ? '—' : String(n).replace('.', ',');
}

export function FileCindy() {
  const [etat, setEtat] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/correction/a-regarder', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setEtat(d);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, []);

  useEffect(() => {
    const premier = setTimeout(charger, 0);
    const relance = setInterval(charger, 60_000);
    return () => {
      clearTimeout(premier);
      clearInterval(relance);
    };
  }, [charger]);

  const agir = useCallback(
    async (id: string, action: 'valider' | 'corriger_quand_meme' | 'retirer') => {
      const questions = {
        valider: 'Garder cette correction telle quelle ?\n\nElle passe « corrigée ». La publication à l’élève reste manuelle.',
        corriger_quand_meme: 'Corriger avec cette lecture de la copie ?\n\nLa correction repart (appel à l’IA, ~0,20 $).',
        retirer: 'Retirer cette copie de la liste sans rien changer ?',
      };
      if (!window.confirm(questions[action])) return;
      setOccupe(id);
      try {
        const r = await fetch('/api/admin/correction/a-regarder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
        await charger();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setOccupe(null);
      }
    },
    [charger],
  );

  const ouvrirPdf = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/correction/a-regarder?pdf=${encodeURIComponent(id)}`);
    const d = await r.json();
    if (r.ok && d.url) window.open(d.url, '_blank', 'noopener');
    else alert(d.error ?? 'Copie introuvable.');
  }, []);

  const copies = etat?.copies ?? [];

  return (
    <section
      id="a-regarder"
      className={`rounded-2xl border shadow-sm p-4 ${copies.length ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-bold text-gray-900">
          👀 À regarder par toi {etat ? `(${copies.length})` : ''}
        </h2>
        {etat?.budget && (
          <p className="text-xs text-gray-500">
            Plafond IA du jour : {etat.budget.utilise} / {etat.budget.max} unités
          </p>
        )}
      </div>
      <p className="text-xs text-gray-600 mb-3 max-w-3xl">
        SES, HLP, LLCER anglais, SVT et physique-chimie n’ont pas de prof relecteur : l’IA relit chaque copie,
        la recorrige une fois si un doute reste, relit une fois une copie mal lue. Ce qui arrive ici, elle
        n’a pas su le trancher seule.
      </p>

      {erreur && <p className="text-xs text-red-600 mb-2">Lecture impossible : {erreur}</p>}
      {etat && !copies.length && <p className="text-sm text-gray-500">Rien à regarder. ✨</p>}

      {copies.length > 0 && (
        <ul className="space-y-3">
          {copies.map((c) => (
            <li key={c.id} className="bg-white rounded-xl border border-amber-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">
                  {c.eleve ?? 'Élève ?'}{' '}
                  <span className="font-normal text-gray-500">
                    · {c.matiere ?? '?'} · {c.exercise_type ?? ''}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {c.transcriptionBloquee ? 'pas encore corrigée' : `note : ${nombre(c.note)}${c.bareme ? ` / ${nombre(c.bareme)}` : ''}`}
                  {' · '}depuis le {new Date(c.depuis).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <ul className="mt-2 space-y-1">
                {c.motifs.slice(0, 6).map((m, i) => (
                  <li key={i} className="text-xs text-gray-700">
                    <span className="text-amber-700 font-medium">[{LIBELLE_NATURE[m.nature] ?? m.nature}]</span>{' '}
                    {m.message}
                  </li>
                ))}
                {c.motifs.length > 6 && <li className="text-xs text-gray-400">… et {c.motifs.length - 6} autre(s)</li>}
              </ul>
              <p className="text-[11px] text-gray-400 mt-1">
                Déjà essayé par l’IA : {c.essais.relectures} relecture(s), {c.essais.recorrections} recorrection(s),{' '}
                {c.essais.transcription} relecture(s) de la copie.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => ouvrirPdf(c.id)}
                  className="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50">
                  📄 La copie
                </button>
                {!c.transcriptionBloquee && !c.bloqueeEnRelecture && (
                  <a href={`/dossier/${c.id}`} target="_blank"
                    className="text-xs px-3 py-1 rounded-full border border-gray-300 hover:bg-gray-50">
                    📘 La correction
                  </a>
                )}
                {c.transcriptionBloquee ? (
                  <button type="button" disabled={occupe === c.id} onClick={() => agir(c.id, 'corriger_quand_meme')}
                    className="text-xs px-3 py-1 rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">
                    Corriger quand même
                  </button>
                ) : !c.bloqueeEnRelecture ? (
                  <button type="button" disabled={occupe === c.id} onClick={() => agir(c.id, 'valider')}
                    className="text-xs px-3 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                    ✓ C’est bon, je garde cette correction
                  </button>
                ) : null}
                {!c.bloqueeEnRelecture && (
                  <button type="button" disabled={occupe === c.id} onClick={() => agir(c.id, 'retirer')}
                    className="text-xs px-3 py-1 rounded-full text-gray-600 hover:underline disabled:opacity-40">
                    Retirer de la liste
                  </button>
                )}
                {c.bloqueeEnRelecture && (
                  <span className="text-xs text-gray-500 self-center">
                    → bouton « Relancer » sur sa ligne dans « Corrections en direct » plus bas.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
