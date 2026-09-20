'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TableauCalibration, VersionBareme } from './types';

type Lecture = { niveau: 'aucune' | 'insuffisante' | 'a_ajuster' | 'correcte'; message: string };

const COULEURS: Record<Lecture['niveau'], string> = {
  aucune: 'border-gray-200 bg-gray-50 text-gray-700',
  insuffisante: 'border-amber-200 bg-amber-50 text-amber-900',
  a_ajuster: 'border-red-200 bg-red-50 text-red-900',
  correcte: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

/**
 * Tableau de calibration : ce que le barème donne, comparé à ce que des
 * professeurs donnent, sur les mêmes copies et la même version.
 *
 * Le chiffre qui compte est le BIAIS MOYEN : c'est lui qui dit « le barème
 * est trop sévère ». Le remède est toujours le même — reprendre le barème,
 * pour toutes les copies, avant verrouillage.
 */
export function TableauCalibrationVue({
  examId,
  versionId,
  versions,
  onChange,
}: {
  examId: string;
  versionId: string | null;
  versions: VersionBareme[];
  onChange: () => void;
}) {
  const [tableau, setTableau] = useState<TableauCalibration | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!versionId) return;
    try {
      const r = await fetch(`/api/admin/bareme/${examId}/calibration?version=${versionId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
      setTableau(j.tableau);
      setLecture(j.lecture);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, [examId, versionId]);

  useEffect(() => {
    // setTimeout(..., 0) et non un appel direct : Next 16 refuse un setState
    // synchrone dans un effet (react-hooks/set-state-in-effect). Le chargement
    // part donc au tick suivant, et l'abandon annule la requete au demontage.
    const t = setTimeout(() => { void charger(); }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  async function agir(corps: Record<string, unknown>) {
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/bareme/${examId}/calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Action impossible');
      await charger();
      onChange();
      return j;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      return null;
    } finally {
      setEnCours(false);
    }
  }

  if (!versionId) return <p className="text-gray-600">Aucune version de barème.</p>;

  const s = tableau?.stats;

  return (
    <div className="space-y-5">
      {lecture && (
        <div className={`rounded-2xl border p-5 ${COULEURS[lecture.niveau]}`}>
          <p className="font-semibold">Lecture de la calibration</p>
          <p className="mt-1 text-sm leading-relaxed">{lecture.message}</p>
        </div>
      )}

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erreur}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {s && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Chiffres, version {tableau?.version}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Case valeur={String(s.copies_testees)} label="Copies comparées" />
            <Case valeur={fmt(s.ecart_absolu_moyen)} label="Écart absolu moyen / 20" />
            <Case valeur={fmt(s.ecart_median)} label="Écart médian" />
            <Case valeur={fmt(s.ecart_maximal)} label="Écart maximal" />
            <Case
              valeur={s.biais_moyen === null ? '—' : `${s.biais_moyen > 0 ? '+' : ''}${s.biais_moyen}`}
              label="Biais moyen (IA − profs)"
              alerte={Math.abs(s.biais_moyen ?? 0) >= 1}
            />
            <Case valeur={pct(s.taux_accord_exact)} label="Questions en accord exact" />
            <Case valeur={pct(s.taux_accord_025)} label="Questions à ±0,25 près" />
            <Case valeur={pct(s.taux_relecture)} label="Copies envoyées en relecture" />
          </div>

          {s.references_non_fiables > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              {s.references_non_fiables} copie(s) où les professeurs eux-mêmes divergent de plus de
              2 points. Sur celles-là, la référence humaine n’est pas une vérité : trancher entre
              correcteurs avant d’ajuster le barème.
            </p>
          )}

          {s.questions_en_desaccord.length > 0 && (
            <div className="mt-5">
              <h3 className="font-bold text-gray-900 mb-2">Questions qui concentrent les désaccords</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                {s.questions_en_desaccord.map((q) => (
                  <li key={q.question_key}>
                    <code className="font-mono text-xs">{q.question_key}</code> — écart absolu moyen{' '}
                    <strong>{q.ecart_absolu_moyen}</strong> sur {q.copies} copie(s)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- Copie par copie */}
      {tableau && tableau.comparaisons.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Copie</th>
                <th className="text-right px-3 py-2">Profs (moy.)</th>
                <th className="text-right px-3 py-2">Médiane</th>
                <th className="text-right px-3 py-2">Amplitude</th>
                <th className="text-right px-3 py-2">IA</th>
                <th className="text-right px-4 py-2">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableau.comparaisons.map((c) => (
                <tr key={c.etalon_id} className={!c.reference_fiable ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-2">
                    {c.libelle}
                    <span className="text-xs text-gray-400"> · {c.nb_correcteurs} correcteur(s)</span>
                  </td>
                  <td className="text-right px-3 py-2">{fmt(c.note_humaine_moyenne)}</td>
                  <td className="text-right px-3 py-2">{fmt(c.note_humaine_mediane)}</td>
                  <td className="text-right px-3 py-2">{fmt(c.amplitude_humaine)}</td>
                  <td className="text-right px-3 py-2">{fmt(c.note_ia)}</td>
                  <td className="text-right px-4 py-2 font-semibold">
                    {c.ecart_total === null ? '—' : c.ecart_total > 0 ? `+${c.ecart_total}` : c.ecart_total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* -------------------------------------------------- Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-bold text-gray-900">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={enCours || !tableau?.calibration_realisee}
            onClick={async () => {
              const j = await agir({ action: 'figer', version_id: versionId });
              if (j) setMessage('Tableau de calibration figé : trace datée de ce que valait le barème.');
            }}
            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-sm font-semibold disabled:opacity-40"
          >
            Figer ce tableau
          </button>

          <button
            disabled={enCours}
            onClick={async () => {
              if (
                !confirm(
                  'Relancer les copies d’élèves corrigées avec une autre version, sur la version courante ?\n\n' +
                    'Les corrections précédentes sont conservées dans bareme_audit, mais les copies seront re-notées.',
                )
              ) {
                return;
              }
              const j = await agir({ action: 'recalculer', version_id: versionId });
              if (j) setMessage(j.message);
            }}
            className="px-4 py-2 rounded-lg bg-white border border-amber-300 text-amber-800 text-sm font-semibold disabled:opacity-40"
          >
            Relancer les copies d’une version périmée
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Aucune de ces actions ne modifie la note d’un élève au cas par cas. Un décalage systématique
          se corrige dans le barème — pour tout le monde, avant verrouillage.
        </p>

        {versions.length > 1 && (
          <p className="text-xs text-gray-500">
            Versions existantes : {versions.map((v) => `${v.version} (${v.statut})`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

const fmt = (v: number | null) => (v === null || v === undefined ? '—' : String(v));
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);

function Case({ valeur, label, alerte }: { valeur: string; label: string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerte ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <p className="text-lg font-bold text-gray-900">{valeur}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
