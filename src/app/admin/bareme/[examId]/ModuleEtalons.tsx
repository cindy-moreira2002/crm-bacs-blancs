'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Etalon, Question } from './types';

type CorrectionHumaine = {
  id: string;
  etalon_copie_id: string;
  prof_nom: string;
  prof_email: string | null;
  note_totale: number;
  commentaire: string | null;
  questions: { question_key: string; points: number; justification: string | null }[];
};

type CorrectionIa = {
  id: string;
  etalon_copie_id: string;
  note_brute: number | null;
  resultat: { questions?: { question_key: string; points: number }[]; human_review_required?: boolean } | null;
};

const NIVEAUX = [
  { code: 'presque_blanche', libelle: 'Presque blanche', plage: '1 à 3 / 20' },
  { code: 'tres_faible', libelle: 'Très faible', plage: '4 à 6 / 20' },
  { code: 'fragile', libelle: 'Fragile', plage: '7 à 9 / 20' },
  { code: 'moyen', libelle: 'Moyen', plage: '10 à 12 / 20' },
  { code: 'assez_bon', libelle: 'Assez bon', plage: '13 à 15 / 20' },
  { code: 'tres_bon', libelle: 'Très bon', plage: '16 à 18 / 20' },
  { code: 'excellent', libelle: 'Excellent', plage: '19 à 20 / 20' },
];

/**
 * Module « copies étalons » : importer, saisir la correction humaine de
 * référence (une par professeur), lancer la correction IA, comparer.
 *
 * Ce module ne modifie jamais la note d'un élève. Il sert à voir si le
 * barème note comme un professeur — et, s'il s'en écarte, à reprendre le
 * barème avant de le verrouiller.
 */
export function ModuleEtalons({
  examId,
  versionId,
  questions,
  etalons,
  couverture,
  onChange,
}: {
  examId: string;
  versionId: string | null;
  questions: Question[];
  etalons: Etalon[];
  couverture: { couverts: string[]; manquants: { code: string; libelle: string; plage: string }[] };
  onChange: () => void;
}) {
  const [humaines, setHumaines] = useState<CorrectionHumaine[]>([]);
  const [ias, setIas] = useState<CorrectionIa[]>([]);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!versionId) return;
    const r = await fetch(`/api/admin/bareme/${examId}/etalons?version=${versionId}`);
    const j = await r.json();
    if (r.ok) {
      setHumaines(j.corrections_humaines ?? []);
      setIas(j.corrections_ia ?? []);
    }
  }, [examId, versionId]);

  useEffect(() => {
    // setTimeout(..., 0) et non un appel direct : Next 16 refuse un setState
    // synchrone dans un effet (react-hooks/set-state-in-effect). Le chargement
    // part donc au tick suivant, et l'abandon annule la requete au demontage.
    const t = setTimeout(() => { void charger(); }, 0);
    return () => clearTimeout(t);
  }, [charger, etalons.length]);

  async function envoyer(corps: Record<string, unknown>) {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/admin/bareme/${examId}/etalons`, {
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

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900">Couverture des niveaux</h2>
        <p className="text-sm text-gray-600 mt-1">
          Un barème calé uniquement sur de bonnes copies note sévèrement le bas de l’échelle. Vise au
          moins une copie par niveau, plus les zones frontières (9–10, 11–12, 15–16 / 20) où une erreur
          de calibration change une décision.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {NIVEAUX.map((n) => {
            const present = couverture.couverts.includes(n.code);
            return (
              <span
                key={n.code}
                title={n.plage}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  present ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {n.libelle} · {n.plage}
              </span>
            );
          })}
        </div>
      </div>

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erreur}</div>
      )}

      {/* ------------------------------------------------ Import */}
      <form
        action={(form) =>
          envoyer({
            action: 'creer',
            libelle: form.get('libelle'),
            niveau_cible: form.get('niveau_cible') || null,
            frontiere: form.get('frontiere') === 'on',
            storage_path: form.get('storage_path') || null,
            source_url: form.get('source_url') || null,
          })
        }
        className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 grid sm:grid-cols-2 gap-4 text-sm"
      >
        <h2 className="sm:col-span-2 text-lg font-bold text-gray-900">Importer une copie étalon</h2>
        <label>
          <span className="font-semibold text-gray-800">Libellé</span>
          <input name="libelle" required placeholder="Copie A — élève moyen" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label>
          <span className="font-semibold text-gray-800">Niveau visé</span>
          <select name="niveau_cible" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">—</option>
            {NIVEAUX.map((n) => (
              <option key={n.code} value={n.code}>
                {n.libelle} ({n.plage})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Fichier dans le bucket student-copies</span>
          <input name="storage_path" placeholder="etalons/maths-2027/copie-a.pdf" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" />
        </label>
        <label>
          <span className="font-semibold text-gray-800">Lien source (facultatif)</span>
          <input name="source_url" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="frontiere" />
          <span>Copie frontière (autour de 9–10, 11–12 ou 15–16 / 20)</span>
        </label>
        <div className="sm:col-span-2">
          <button disabled={enCours} className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-50">
            Importer
          </button>
        </div>
      </form>

      {/* ------------------------------------------------ Liste */}
      {etalons.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-600">
          Aucune copie étalon. Tant qu’aucune copie n’est corrigée des deux côtés, la calibration
          n’a pas été réalisée : le barème ne peut pas être présenté comme validé.
        </div>
      ) : (
        <div className="space-y-4">
          {etalons.map((e) => {
            const profs = humaines.filter((h) => h.etalon_copie_id === e.id);
            const ia = ias.find((i) => i.etalon_copie_id === e.id);
            const notes = profs.map((p) => Number(p.note_totale));
            const moy = notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 100) / 100 : null;
            const amplitude = notes.length ? Math.round((Math.max(...notes) - Math.min(...notes)) * 100) / 100 : null;

            return (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                <div className="p-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{e.libelle}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {e.niveau_cible ? NIVEAUX.find((n) => n.code === e.niveau_cible)?.libelle : 'niveau non précisé'}
                      {e.frontiere && ' · copie frontière'} · {e.statut}
                      {!e.storage_path && ' · aucun fichier déposé'}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      <span className="text-gray-500">Professeurs : </span>
                      <strong>{moy ?? '—'}</strong>
                      {profs.length > 1 && ` (${profs.length} correcteurs, amplitude ${amplitude})`}
                    </p>
                    <p>
                      <span className="text-gray-500">IA : </span>
                      <strong>{ia?.note_brute ?? '—'}</strong>
                      {ia?.resultat?.human_review_required && ' ⚑'}
                    </p>
                    {moy !== null && ia?.note_brute != null && (
                      <p className="text-xs text-gray-600">
                        écart {Math.round((Number(ia.note_brute) - moy) * 100) / 100}
                      </p>
                    )}
                  </div>
                </div>

                {profs.length > 1 && amplitude !== null && amplitude > 2 && (
                  <p className="mx-5 mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                    Les correcteurs divergent de {amplitude} points sur cette copie. La référence humaine
                    n’est pas objective ici : ne cale pas le barème dessus sans trancher d’abord entre eux.
                  </p>
                )}

                <div className="px-5 pb-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSaisie(saisie === e.id ? null : e.id)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-semibold"
                  >
                    {saisie === e.id ? 'Fermer' : '+ Correction d’un professeur'}
                  </button>
                  <button
                    disabled={enCours || !versionId || !e.storage_path}
                    onClick={() =>
                      envoyer({ action: 'corriger_ia', etalon_copie_id: e.id, bareme_version_id: versionId })
                    }
                    className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-40"
                    title={!e.storage_path ? 'Aucun fichier déposé pour cette copie' : undefined}
                  >
                    Faire corriger par l’IA
                  </button>
                  {e.correction_id && (
                    <a
                      href={`/dossier/${e.correction_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-semibold"
                    >
                      Voir la correction IA
                    </a>
                  )}
                  <select
                    value={e.statut}
                    onChange={(ev) => envoyer({ action: 'statut', etalon_copie_id: e.id, statut: ev.target.value })}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  >
                    {['importee', 'corrigee_humain', 'corrigee_ia', 'comparee', 'validee', 'rejetee'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {saisie === e.id && versionId && (
                  <SaisieHumaine
                    questions={questions}
                    onEnvoyer={(donnees) =>
                      envoyer({
                        action: 'correction_humaine',
                        etalon_copie_id: e.id,
                        bareme_version_id: versionId,
                        ...donnees,
                      }).then((j) => {
                        if (j) setSaisie(null);
                      })
                    }
                  />
                )}

                {profs.length > 0 && (
                  <ComparaisonQuestions questions={questions} profs={profs} ia={ia ?? null} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SaisieHumaine({
  questions,
  onEnvoyer,
}: {
  questions: Question[];
  onEnvoyer: (d: Record<string, unknown>) => void;
}) {
  const [points, setPoints] = useState<Record<string, number>>({});
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [commentaire, setCommentaire] = useState('');

  const total =
    Math.round(questions.reduce((s, q) => s + (points[q.question_key] ?? 0), 0) * 100) / 100;

  return (
    <div className="border-t border-gray-100 p-5 space-y-4 text-sm bg-gray-50">
      <div className="grid sm:grid-cols-2 gap-3">
        <label>
          <span className="font-semibold text-gray-800">Nom du professeur</span>
          <input value={nom} onChange={(e) => setNom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label>
          <span className="font-semibold text-gray-800">Adresse (facultatif)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {questions.map((q) => (
          <div key={q.question_key} className="px-4 py-2 flex items-center gap-3">
            <span className="w-16 font-bold text-gray-800">{q.numero}</span>
            <span className="flex-1 text-gray-600 truncate">{q.libelle || q.question_key}</span>
            <input
              type="number"
              step="0.25"
              min="0"
              max={q.max_points}
              value={points[q.question_key] ?? ''}
              onChange={(e) =>
                setPoints((p) => ({ ...p, [q.question_key]: Number(e.target.value) }))
              }
              className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right"
            />
            <span className="text-gray-400 w-12">/ {q.max_points}</span>
          </div>
        ))}
      </div>

      <p className="font-bold text-gray-900">Total saisi : {total}</p>

      <label className="block">
        <span className="font-semibold text-gray-800">Commentaire du professeur</span>
        <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>

      <button
        disabled={!nom.trim()}
        onClick={() =>
          onEnvoyer({
            prof_nom: nom.trim(),
            prof_email: email.trim() || null,
            commentaire: commentaire.trim() || null,
            questions: questions
              .filter((q) => points[q.question_key] !== undefined)
              .map((q) => ({ question_key: q.question_key, points: points[q.question_key] })),
          })
        }
        className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-40"
      >
        Enregistrer cette correction de référence
      </button>
    </div>
  );
}

function ComparaisonQuestions({
  questions,
  profs,
  ia,
}: {
  questions: Question[];
  profs: CorrectionHumaine[];
  ia: CorrectionIa | null;
}) {
  const pointsIa = new Map((ia?.resultat?.questions ?? []).map((q) => [q.question_key, Number(q.points)]));

  return (
    <div className="border-t border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="text-left px-4 py-2">Question</th>
            {profs.map((p) => (
              <th key={p.id} className="text-right px-3 py-2">
                {p.prof_nom}
              </th>
            ))}
            <th className="text-right px-3 py-2">IA</th>
            <th className="text-right px-4 py-2">Écart</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {questions.map((q) => {
            const valeurs = profs
              .map((p) => p.questions.find((x) => x.question_key === q.question_key)?.points)
              .filter((v): v is number => typeof v === 'number');
            const moy = valeurs.length ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : null;
            const valIa = pointsIa.get(q.question_key) ?? null;
            const ecart = moy !== null && valIa !== null ? Math.round((valIa - moy) * 100) / 100 : null;
            const desaccord = valeurs.length > 1 && Math.max(...valeurs) !== Math.min(...valeurs);

            return (
              <tr key={q.question_key} className={ecart !== null && Math.abs(ecart) >= 0.5 ? 'bg-amber-50' : ''}>
                <td className="px-4 py-1.5">
                  <span className="font-semibold">{q.numero}</span>
                  <span className="text-gray-400"> / {q.max_points}</span>
                  {desaccord && <span className="ml-2 text-xs text-amber-700">profs en désaccord</span>}
                </td>
                {profs.map((p) => (
                  <td key={p.id} className="text-right px-3 py-1.5">
                    {p.questions.find((x) => x.question_key === q.question_key)?.points ?? '—'}
                  </td>
                ))}
                <td className="text-right px-3 py-1.5">{valIa ?? '—'}</td>
                <td className={`text-right px-4 py-1.5 font-semibold ${ecart && Math.abs(ecart) >= 0.5 ? 'text-amber-800' : 'text-gray-500'}`}>
                  {ecart === null ? '—' : ecart > 0 ? `+${ecart}` : ecart}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
