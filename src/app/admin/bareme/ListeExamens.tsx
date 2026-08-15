'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LABELS_MATIERES, labelMatiere } from '@/lib/matieres';

type Version = {
  id: string;
  version: string;
  statut: string;
  total_points: number;
  max_score: number;
  controles: { ok?: boolean; blocages?: unknown[] } | null;
};

type Examen = {
  id: string;
  code: string;
  matiere: string;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  statut: string;
  bareme_version_active: string | null;
  versions: Version[];
  nb_etalons: number;
  nb_corrections: number;
};

const LIBELLES_STATUT: Record<string, { texte: string; classe: string }> = {
  draft: { texte: 'Brouillon', classe: 'bg-gray-100 text-gray-700' },
  calibrating: { texte: 'En calibration', classe: 'bg-amber-100 text-amber-800' },
  ready_for_validation: { texte: 'À valider', classe: 'bg-amber-100 text-amber-800' },
  validated: { texte: 'Validé', classe: 'bg-sky-100 text-sky-800' },
  locked: { texte: 'Barème verrouillé', classe: 'bg-indigo-100 text-indigo-800' },
  correction_open: { texte: 'Corrections ouvertes', classe: 'bg-emerald-100 text-emerald-800' },
  archived: { texte: 'Archivé', classe: 'bg-gray-100 text-gray-500' },
};

const MATIERES = Object.keys(LABELS_MATIERES);

export function ListeExamens() {
  const [examens, setExamens] = useState<Examen[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/bareme');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
      setExamens(j.examens);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, []);

  useEffect(() => {
    // setTimeout(..., 0) et non un appel direct : Next 16 refuse un setState
    // synchrone dans un effet (react-hooks/set-state-in-effect). Le chargement
    // part donc au tick suivant, et l'abandon annule la requete au demontage.
    const t = setTimeout(() => { void charger(); }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  async function creer(form: FormData) {
    setEnCours(true);
    try {
      const r = await fetch('/api/admin/bareme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.get('code'),
          matiere: form.get('matiere'),
          titre: form.get('titre'),
          session: form.get('session') || null,
          date_epreuve: form.get('date_epreuve') || null,
          exercise_type: form.get('exercise_type') || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Création impossible');
      setOuvert(false);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <header>
          <p className="text-sm text-gray-500">
            <Link href="/admin/correction" className="hover:underline">
              Pilotage de la correction
            </Link>{' '}
            › Barèmes
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">Barèmes des bacs blancs</h1>
          <p className="text-gray-700 mt-3 max-w-3xl leading-relaxed">
            La note officielle d’un bac blanc vient de <strong>son</strong> barème, question par
            question — pas de la grille de compétences de la matière. Un examen ne peut pas passer en
            « corrections ouvertes » tant que son barème n’est pas complet, testé sur des copies
            étalons, validé et verrouillé.
          </p>
          <p className="text-sm text-gray-600 mt-2 max-w-3xl">
            La grille de compétences reste utile : elle produit le <em>diagnostic pédagogique</em>,
            visible dans <Link href="/admin/correction" className="text-purple-700 underline">/admin/correction</Link>.
          </p>
        </header>

        {erreur && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erreur}</div>
        )}

        <div>
          <button
            onClick={() => setOuvert((v) => !v)}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700"
          >
            {ouvert ? 'Annuler' : '+ Nouveau bac blanc'}
          </button>
        </div>

        {ouvert && (
          <form
            action={creer}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 grid sm:grid-cols-2 gap-4"
          >
            <Champ nom="code" label="Identifiant" placeholder="maths_bac_blanc_2027_01" requis />
            <label className="text-sm">
              <span className="font-semibold text-gray-800">Matière</span>
              <select name="matiere" required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                {MATIERES.map((m) => (
                  <option key={m} value={m}>
                    {LABELS_MATIERES[m]}
                  </option>
                ))}
              </select>
            </label>
            <Champ nom="titre" label="Titre" placeholder="Bac blanc de mathématiques — septembre" requis />
            <Champ nom="exercise_type" label="Type d’épreuve (facultatif)" placeholder="maths_analyse" />
            <Champ nom="session" label="Session" placeholder="2027" />
            <Champ nom="date_epreuve" label="Date de l’épreuve" type="date" />
            <div className="sm:col-span-2">
              <button
                disabled={enCours}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-50"
              >
                {enCours ? 'Création…' : 'Créer le bac blanc et son barème 1.0'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Le barème 1.0 est créé vide, en brouillon. Rien ne sera corrigeable avant qu’il ne
                totalise exactement 20 points et qu’il ne soit verrouillé.
              </p>
            </div>
          </form>
        )}

        {examens === null ? (
          <p className="text-gray-500">Chargement…</p>
        ) : examens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-700 font-medium">Aucun bac blanc n’a encore de barème propre.</p>
            <p className="text-sm text-gray-500 mt-2">
              Les matières continuent d’être corrigées par leur grille de compétences en attendant.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {examens.map((e) => (
              <Carte key={e.id} examen={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Champ({
  nom,
  label,
  placeholder,
  type = 'text',
  requis,
}: {
  nom: string;
  label: string;
  placeholder?: string;
  type?: string;
  requis?: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="font-semibold text-gray-800">{label}</span>
      <input
        name={nom}
        type={type}
        required={requis}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
      />
    </label>
  );
}

function Carte({ examen }: { examen: Examen }) {
  const active = examen.versions.find((v) => v.id === examen.bareme_version_active);
  const derniere = active ?? examen.versions[examen.versions.length - 1];
  const statut = LIBELLES_STATUT[examen.statut] ?? { texte: examen.statut, classe: 'bg-gray-100' };
  const blocages = (derniere?.controles?.blocages ?? []).length;

  return (
    <Link
      href={`/admin/bareme/${examen.id}`}
      className="block bg-white rounded-2xl border border-gray-200 shadow-sm p-6 hover:border-purple-300 transition"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{examen.titre}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {labelMatiere(examen.matiere)}
            {examen.date_epreuve && ` · ${new Date(examen.date_epreuve).toLocaleDateString('fr-FR')}`}
            {' · '}
            <code className="text-xs">{examen.code}</code>
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statut.classe}`}>
          {statut.texte}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Chiffre
          valeur={derniere ? `${derniere.total_points} / ${derniere.max_score}` : '—'}
          label="Total du barème"
          alerte={!!derniere && Number(derniere.total_points) !== Number(derniere.max_score)}
        />
        <Chiffre valeur={derniere?.version ?? '—'} label={`Version (${derniere?.statut ?? '—'})`} />
        <Chiffre valeur={String(examen.nb_etalons)} label="Copies étalons" alerte={examen.nb_etalons === 0} />
        <Chiffre valeur={String(examen.nb_corrections)} label="Copies corrigées" />
      </div>

      {blocages > 0 && (
        <p className="mt-3 text-sm text-red-700 font-medium">
          {blocages} blocage(s) empêchent encore le verrouillage.
        </p>
      )}
    </Link>
  );
}

function Chiffre({ valeur, label, alerte }: { valeur: string; label: string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerte ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <p className="text-lg font-bold text-gray-900">{valeur}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
