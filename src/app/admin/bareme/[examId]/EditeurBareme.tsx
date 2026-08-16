'use client';

import { useMemo, useState } from 'react';
import { REGLES_TRANSVERSALES } from '@/lib/baremeNoyau';
import { QUESTION_VIDE, type Bareme, type Question, type Palier } from './types';

/**
 * Ce que le correcteur fera, quoi qu'on écrive question par question.
 *
 * Ces règles ne se saisissent pas : elles sont dans la consigne envoyée au
 * correcteur et vérifiées après coup (`REGLES_TRANSVERSALES`). Les afficher
 * ici évite deux choses : les réécrire à la main dans chaque question, et
 * découvrir après cinquante copies que le barème comptait sur un
 * comportement que le moteur n'a pas.
 */
function ReglesTransversales() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
      >
        <span className="text-sm font-semibold text-gray-800">
          Ce qui s’applique à toutes les questions, sans avoir à l’écrire ({REGLES_TRANSVERSALES.length})
        </span>
        <span className="text-gray-400 text-xs">{ouvert ? 'replier' : 'déplier'}</span>
      </button>
      {ouvert && (
        <ul className="px-4 pb-4 space-y-3">
          {REGLES_TRANSVERSALES.map((r) => (
            <li key={r.id} className="text-sm">
              <p className="font-semibold text-gray-900">{r.titre}</p>
              <p className="text-gray-600 mt-0.5">{r.texte}</p>
              {r.controle && (
                <p className="text-xs text-emerald-800 mt-0.5">
                  Vérifié après correction : une copie qui semble y déroger part en relecture humaine.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Éditeur du barème : exercices, questions, attendus, fractions de points.
 *
 * Le total est affiché en permanence et vire au rouge dès qu'il s'écarte de
 * 20 : c'est le contrôle qui bloque tout le reste. Les autres blocages
 * (réponse attendue manquante, aucune règle d'attribution, compétence
 * inconnue, dépendance vers une question inexistante) sont calculés côté
 * serveur à l'enregistrement — la base les rejoue de toute façon avant le
 * verrouillage.
 */
export function EditeurBareme({
  examId,
  bareme,
  verrouille,
  onEnregistre,
}: {
  examId: string;
  bareme: Bareme;
  verrouille: boolean;
  onEnregistre: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(() =>
    bareme.questions.map((q, i) => ({ ...q, ordre: q.ordre ?? i })),
  );
  const [exercices, setExercices] = useState(bareme.exercices);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const total = useMemo(
    () => Math.round(questions.reduce((s, q) => s + Number(q.max_points || 0), 0) * 100) / 100,
    [questions],
  );
  const cible = Number(bareme.version.max_score);
  const totalOk = Math.abs(total - cible) < 0.001;

  function modifier(index: number, champs: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...champs } : q)));
  }

  async function enregistrer() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/admin/bareme/${examId}/bareme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version_id: bareme.version.id,
          exercices: exercices.map((e, i) => ({ code: e.code, titre: e.titre, ordre: i })),
          questions: questions.map((q, i) => ({ ...q, ordre: i })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Enregistrement impossible');
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  if (verrouille) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          Cette version est <strong>verrouillée</strong> : elle ne peut plus être modifiée. C’est ce qui
          garantit que toutes les copies du lot ont été notées avec le même barème. Pour la faire
          évoluer, crée une nouvelle version depuis le bandeau ci-dessus.
        </div>
        <ReglesTransversales />
        <ApercuLecture questions={questions} bareme={bareme} total={total} cible={cible} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReglesTransversales />

      {/* ------------------------------------------------ Barre de total */}
      <div
        className={`sticky top-0 z-10 rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
          totalOk ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
        }`}
      >
        <p className={`font-bold ${totalOk ? 'text-emerald-900' : 'text-red-900'}`}>
          Total : {total} / {cible} points
          {!totalOk && ` — écart de ${Math.round((total - cible) * 100) / 100}`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setQuestions((qs) => [...qs, QUESTION_VIDE(qs.length)])}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-semibold"
          >
            + Question
          </button>
          <button
            onClick={() =>
              setExercices((ex) => [
                ...ex,
                { code: `ex${ex.length + 1}`, titre: `Exercice ${ex.length + 1}`, ordre: ex.length },
              ])
            }
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-semibold"
          >
            + Exercice
          </button>
          <button
            onClick={enregistrer}
            disabled={enCours}
            className="px-4 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer le barème'}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erreur}</div>
      )}

      {/* ---------------------------------------------------- Exercices */}
      {exercices.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-3">Exercices</h3>
          <div className="space-y-2">
            {exercices.map((e, i) => (
              <div key={i} className="flex gap-2 items-center text-sm">
                <input
                  value={e.code}
                  onChange={(ev) =>
                    setExercices((ex) => ex.map((x, j) => (j === i ? { ...x, code: ev.target.value } : x)))
                  }
                  className="w-28 rounded-lg border border-gray-300 px-2 py-1 font-mono"
                />
                <input
                  value={e.titre ?? ''}
                  onChange={(ev) =>
                    setExercices((ex) => ex.map((x, j) => (j === i ? { ...x, titre: ev.target.value } : x)))
                  }
                  placeholder="Titre de l’exercice"
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1"
                />
                <button
                  onClick={() => setExercices((ex) => ex.filter((_, j) => j !== i))}
                  className="text-red-600 text-xs font-semibold px-2"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- Questions */}
      {questions.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-600">
          Aucune question. Un barème vide ne permet de corriger aucune copie.
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <LigneQuestion
            key={q.question_key + i}
            question={q}
            exercices={exercices}
            bareme={bareme}
            clesExistantes={questions.map((x) => x.question_key)}
            ouverte={ouverte === q.question_key + i}
            onToggle={() => setOuverte((v) => (v === q.question_key + i ? null : q.question_key + i))}
            onChange={(c) => modifier(i, c)}
            onMonter={() =>
              i > 0 &&
              setQuestions((qs) => {
                const t = [...qs];
                [t[i - 1], t[i]] = [t[i], t[i - 1]];
                return t;
              })
            }
            onDescendre={() =>
              i < questions.length - 1 &&
              setQuestions((qs) => {
                const t = [...qs];
                [t[i + 1], t[i]] = [t[i], t[i + 1]];
                return t;
              })
            }
            onSupprimer={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LigneQuestion({
  question,
  exercices,
  bareme,
  clesExistantes,
  ouverte,
  onToggle,
  onChange,
  onMonter,
  onDescendre,
  onSupprimer,
}: {
  question: Question;
  exercices: Bareme['exercices'];
  bareme: Bareme;
  clesExistantes: string[];
  ouverte: boolean;
  onToggle: () => void;
  onChange: (c: Partial<Question>) => void;
  onMonter: () => void;
  onDescendre: () => void;
  onSupprimer: () => void;
}) {
  const sommeCumulables =
    Math.round(
      question.paliers.filter((p) => p.cumulable).reduce((s, p) => s + Number(p.points || 0), 0) * 100,
    ) / 100;
  const trop = sommeCumulables > Number(question.max_points) + 0.001;

  const problemes: string[] = [];
  if (!question.reponse_attendue?.trim()) problemes.push('réponse attendue manquante');
  if (!question.paliers.length && !question.etapes.length) problemes.push('aucune règle d’attribution');
  if (!question.competences.length) problemes.push('aucune compétence');
  if (trop) problemes.push('paliers au-dessus du maximum');
  const doublon = clesExistantes.filter((c) => c === question.question_key).length > 1;
  if (doublon) problemes.push('identifiant en double');

  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${problemes.length ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="p-4 flex flex-wrap items-center gap-3">
        <input
          value={question.numero}
          onChange={(e) => onChange({ numero: e.target.value })}
          className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm font-bold"
          aria-label="Numéro"
        />
        <input
          value={question.question_key}
          onChange={(e) => onChange({ question_key: e.target.value })}
          className="w-40 rounded-lg border border-gray-300 px-2 py-1 text-xs font-mono"
          aria-label="Identifiant stable"
          title="Identifiant stable : il voyage jusqu’au résultat de correction, ne le renumérote jamais."
        />
        <input
          value={question.libelle}
          onChange={(e) => onChange({ libelle: e.target.value })}
          placeholder="Libellé de la question"
          className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.25"
            min="0.25"
            value={question.max_points}
            onChange={(e) => onChange({ max_points: Number(e.target.value) })}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm font-bold text-right"
          />
          <span className="text-sm text-gray-500">pts</span>
        </div>
        <div className="flex gap-1 text-xs">
          <button onClick={onMonter} className="px-2 py-1 rounded border border-gray-200">↑</button>
          <button onClick={onDescendre} className="px-2 py-1 rounded border border-gray-200">↓</button>
          <button onClick={onSupprimer} className="px-2 py-1 rounded border border-red-200 text-red-600">✕</button>
          <button onClick={onToggle} className="px-3 py-1 rounded bg-gray-900 text-white font-semibold">
            {ouverte ? 'Replier' : 'Détailler'}
          </button>
        </div>
      </div>

      {problemes.length > 0 && (
        <p className="px-4 pb-3 text-xs text-amber-800">⚠ {problemes.join(' · ')}</p>
      )}

      {ouverte && (
        <div className="border-t border-gray-100 p-5 space-y-5 text-sm">
          <div className="grid sm:grid-cols-3 gap-3">
            <Select
              label="Exercice"
              value={question.exercice_code ?? ''}
              onChange={(v) => onChange({ exercice_code: v || null })}
              options={[{ value: '', label: '—' }, ...exercices.map((e) => ({ value: e.code, label: e.titre ?? e.code }))]}
            />
            <Texte label="Partie" value={question.partie} onChange={(v) => onChange({ partie: v })} placeholder="Partie A" />
            <Select
              label="Calculatrice"
              value={question.calculatrice}
              onChange={(v) => onChange({ calculatrice: v as Question['calculatrice'] })}
              options={[
                { value: 'indifferent', label: 'Indifférent' },
                { value: 'autorisee', label: 'Autorisée' },
                { value: 'interdite', label: 'Interdite' },
              ]}
            />
          </div>

          <Zone
            label="Réponse ou résultat attendu"
            value={question.reponse_attendue}
            onChange={(v) => onChange({ reponse_attendue: v })}
            aide="Obligatoire : sans elle, le barème ne peut pas être verrouillé."
          />
          <Zone
            label="Démarche attendue"
            value={question.raisonnement_attendu}
            onChange={(v) => onChange({ raisonnement_attendu: v })}
            aide="Ce que la démonstration doit contenir. C’est elle qui est notée, pas le résultat seul."
          />

          <Paliers
            paliers={question.paliers}
            max={Number(question.max_points)}
            onChange={(p) => onChange({ paliers: p })}
          />

          <Liste
            label="Étapes intermédiaires valorisées"
            aide="Une ligne par étape. Elles valent aussi comme règle d’attribution si aucun palier n’est saisi."
            valeurs={question.etapes.map((e) => e.libelle)}
            onChange={(v) => onChange({ etapes: v.map((libelle) => ({ libelle })) })}
          />
          <Liste
            label="Réponses équivalentes acceptées"
            valeurs={question.reponses_equivalentes}
            onChange={(v) => onChange({ reponses_equivalentes: v })}
          />
          <Liste
            label="Méthodes alternatives admises"
            aide="Une méthode valide absente d’ici enverra la copie en relecture humaine — jamais à zéro."
            valeurs={question.methodes_alternatives.map((m) => m.libelle)}
            onChange={(v) => onChange({ methodes_alternatives: v.map((libelle) => ({ libelle })) })}
          />
          <Liste
            label="Erreurs fréquentes attendues"
            valeurs={question.erreurs_frequentes.map((e) => e.libelle)}
            onChange={(v) => onChange({ erreurs_frequentes: v.map((libelle) => ({ libelle })) })}
          />

          <div className="grid sm:grid-cols-3 gap-3">
            <Texte label="Unités attendues" value={question.unites_attendues} onChange={(v) => onChange({ unites_attendues: v })} />
            <Texte label="Précision / arrondi" value={question.precision_attendue} onChange={(v) => onChange({ precision_attendue: v })} />
            <Texte label="Tolérances" value={question.tolerances} onChange={(v) => onChange({ tolerances: v })} />
          </div>

          <Zone
            label="Conditions ou hypothèses à vérifier"
            value={question.conditions_hypotheses}
            onChange={(v) => onChange({ conditions_hypotheses: v })}
          />

          {/* ------------------------------------------- Compétences */}
          <div>
            <p className="font-semibold text-gray-800 mb-1">Compétences mobilisées</p>
            <p className="text-xs text-gray-500 mb-2">
              Une compétence qu’aucune question ne mobilise sort en <code>non_applicable</code> dans le
              diagnostic : jamais zéro, jamais d’effet sur la note.
            </p>
            <div className="flex flex-wrap gap-2">
              {bareme.referentiel.map((c) => {
                const actif = question.competences.includes(c.code);
                return (
                  <button
                    key={c.code}
                    title={c.description ?? undefined}
                    onClick={() =>
                      onChange({
                        competences: actif
                          ? question.competences.filter((x) => x !== c.code)
                          : [...question.competences, c.code],
                      })
                    }
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      actif ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-300 text-gray-700'
                    }`}
                  >
                    {c.libelle}
                    {!c.toujours_mobilisee && ' ·'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --------------------------------------- Codes d'erreur */}
          <div>
            <p className="font-semibold text-gray-800 mb-1">Codes d’erreur possibles</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {bareme.codesErreurs.map((c) => {
                const actif = question.codes_erreurs.includes(c.code);
                return (
                  <button
                    key={c.code}
                    title={`${c.description} (gravité ${c.gravite}, ${c.nature})`}
                    onClick={() =>
                      onChange({
                        codes_erreurs: actif
                          ? question.codes_erreurs.filter((x) => x !== c.code)
                          : [...question.codes_erreurs, c.code],
                      })
                    }
                    className={`px-2 py-0.5 rounded text-xs font-mono border ${
                      actif ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-gray-300 text-gray-600'
                    }`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ------------------------------------------ Dépendances */}
          <div>
            <p className="font-semibold text-gray-800 mb-1">
              Cette question reprend le résultat de…
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Base de la règle de poursuite : si l’élève poursuit correctement avec un résultat
              antérieur faux, il garde les points de méthode ici.
            </p>
            <div className="flex flex-wrap gap-2">
              {clesExistantes
                .filter((c) => c !== question.question_key)
                .map((c) => {
                  const actif = question.depend_de.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        onChange({
                          depend_de: actif
                            ? question.depend_de.filter((x) => x !== c)
                            : [...question.depend_de, c],
                        })
                      }
                      className={`px-2 py-0.5 rounded text-xs font-mono border ${
                        actif ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-gray-300 text-gray-600'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
            </div>
          </div>

          <Zone
            label="Règle de non-double-sanction"
            value={question.regle_non_double_sanction}
            onChange={(v) => onChange({ regle_non_double_sanction: v })}
          />
          <Zone
            label="Règle de poursuite sur un résultat antérieur faux"
            value={question.regle_poursuite}
            onChange={(v) => onChange({ regle_poursuite: v })}
          />
          <Zone
            label="Résultat juste sans justification"
            value={question.regle_resultat_sans_justification}
            onChange={(v) => onChange({ regle_resultat_sans_justification: v })}
            aide="Combien de points va au résultat, combien à la démonstration."
          />
          <Zone
            label="Raisonnement correct avec erreur de calcul"
            value={question.regle_raisonnement_juste_calcul_faux}
            onChange={(v) => onChange({ regle_raisonnement_juste_calcul_faux: v })}
          />
          <Zone
            label="Cas nécessitant une relecture humaine"
            value={question.criteres_relecture_humaine}
            onChange={(v) => onChange({ criteres_relecture_humaine: v })}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Champs                                                            */
/* ------------------------------------------------------------------ */

function Texte({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-semibold text-gray-800">{label}</span>
      <input
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1"
      />
    </label>
  );
}

function Zone({
  label,
  value,
  onChange,
  aide,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  aide?: string;
}) {
  return (
    <label className="block">
      <span className="font-semibold text-gray-800">{label}</span>
      {aide && <span className="block text-xs text-gray-500">{aide}</span>}
      <textarea
        value={value ?? ''}
        rows={2}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="font-semibold text-gray-800">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Liste({
  label,
  aide,
  valeurs,
  onChange,
}: {
  label: string;
  aide?: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="font-semibold text-gray-800">{label}</span>
      {aide && <span className="block text-xs text-gray-500">{aide}</span>}
      <textarea
        value={valeurs.join('\n')}
        rows={Math.max(2, valeurs.length + 1)}
        onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1"
      />
    </label>
  );
}

function Paliers({
  paliers,
  max,
  onChange,
}: {
  paliers: Palier[];
  max: number;
  onChange: (p: Palier[]) => void;
}) {
  const somme = Math.round(paliers.filter((p) => p.cumulable).reduce((s, p) => s + Number(p.points || 0), 0) * 100) / 100;
  const trop = somme > max + 0.001;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold text-gray-800">Fractions de points attribuables</p>
        <p className={`text-xs ${trop ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
          cumulables : {somme} / {max}
        </p>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Autant de paliers que nécessaire, au quart de point près. « Cumulable » décoché = palier
        exclusif (0,25 <em>ou</em> 0,5), coché = les points s’additionnent.
      </p>
      <div className="space-y-2">
        {paliers.map((p, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input
              type="number"
              step="0.25"
              min="0"
              value={p.points}
              onChange={(e) =>
                onChange(paliers.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))
              }
              className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right"
            />
            <input
              value={p.libelle}
              placeholder="Ce qui vaut ces points"
              onChange={(e) => onChange(paliers.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))}
              className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 px-2 py-1"
            />
            <select
              value={p.nature}
              onChange={(e) =>
                onChange(paliers.map((x, j) => (j === i ? { ...x, nature: e.target.value as Palier['nature'] } : x)))
              }
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="resultat">Résultat</option>
              <option value="methode">Méthode</option>
              <option value="etape">Étape</option>
              <option value="alternative">Alternative</option>
              <option value="bonus">Bonus</option>
            </select>
            <label className="text-xs flex items-center gap-1">
              <input
                type="checkbox"
                checked={p.cumulable}
                onChange={(e) =>
                  onChange(paliers.map((x, j) => (j === i ? { ...x, cumulable: e.target.checked } : x)))
                }
              />
              cumulable
            </label>
            <button
              onClick={() => onChange(paliers.filter((_, j) => j !== i))}
              className="text-red-600 text-xs font-semibold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() =>
          onChange([...paliers, { libelle: '', points: 0.25, nature: 'etape', cumulable: true }])
        }
        className="mt-2 px-3 py-1 rounded-lg bg-white border border-gray-300 text-xs font-semibold"
      >
        + Palier
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ApercuLecture({
  questions,
  bareme,
  total,
  cible,
}: {
  questions: Question[];
  bareme: Bareme;
  total: number;
  cible: number;
}) {
  const libelle = new Map(bareme.referentiel.map((c) => [c.code, c.libelle]));
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 flex items-baseline justify-between">
        <h3 className="font-bold text-gray-900">Barème version {bareme.version.version}</h3>
        <p className="text-sm text-gray-600">
          {total} / {cible} points
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {questions.map((q) => (
          <div key={q.question_key} className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-bold text-gray-900">
                {q.numero} <span className="font-normal text-gray-600">{q.libelle}</span>
              </p>
              <p className="font-bold text-purple-700 whitespace-nowrap">{q.max_points} pts</p>
            </div>
            {q.reponse_attendue && (
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-semibold">Attendu : </span>
                {q.reponse_attendue}
              </p>
            )}
            {q.paliers.length > 0 && (
              <ul className="mt-2 text-sm text-gray-700 space-y-0.5">
                {q.paliers.map((p, i) => (
                  <li key={i}>
                    <strong>{p.points} pt</strong> — {p.libelle}
                    {!p.cumulable && ' (palier exclusif)'}
                  </li>
                ))}
              </ul>
            )}
            {q.competences.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Compétences : {q.competences.map((c) => libelle.get(c) ?? c).join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
