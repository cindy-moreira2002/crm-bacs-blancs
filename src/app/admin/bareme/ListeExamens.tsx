'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { labelMatiere } from '@/lib/matieres';
import { LABELS_MATIERES_BREVET, MATIERES_BREVET } from '@/lib/matieresBrevet';
import { LIBELLE_MOTEUR, moteurAttendu } from '@/lib/moteurs';

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

/**
 * SEULES les matières qui se notent question par question sont proposées ici.
 *
 * Décision du 15 août 2026 : au baccalauréat, aucune matière n'a de barème
 * propre au sujet — tout se note à la grille commune (voir `moteurs.ts`).
 * Proposer « Français » ou « Mathématiques » du bac dans ce menu réclamait un
 * travail qui n'a pas lieu d'être, et cachait les deux seules matières qui en
 * ont vraiment besoin : celles du brevet, dont les questions changent à chaque
 * sujet.
 */
const MATIERES = MATIERES_BREVET.filter((m) => moteurAttendu(m) === 'bareme_sujet');

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
          <h1 className="text-3xl font-bold text-gray-900 mt-1">Barèmes par sujet — brevet blanc</h1>
          <div className="mt-3 max-w-3xl rounded-xl border border-teal-200 bg-teal-50 p-4">
            <p className="text-teal-900 font-semibold">Cette page ne concerne que le brevet.</p>
            <p className="text-sm text-teal-900 mt-2 leading-relaxed">
              Un barème par sujet répond à une seule question : <em>combien vaut la question 2b de
              ce sujet-là ?</em> Au brevet, les questions changent à chaque sujet, donc les points
              aussi : personne ne peut les écrire d’avance. Il faut donc un barème par brevet blanc.
            </p>
            <p className="text-sm text-teal-900 mt-2 leading-relaxed">
              <strong>Au baccalauréat, il n’y a rien à écrire ici.</strong> Toutes les matières du
              bac se notent à leur grille commune — la même pour tous les sujets, parce qu’un
              commentaire se juge sur la compréhension, l’analyse, l’organisation et l’expression,
              que le texte soit de Hugo ou de Colette. Pour un nouveau bac blanc, on ajoute
              seulement le sujet.
            </p>
          </div>
          <p className="text-sm text-gray-600 mt-3 max-w-3xl">
            Les grilles de toutes les matières, bac et brevet, se pilotent depuis{' '}
            <Link href="/admin/correction" className="text-purple-700 underline">/admin/correction</Link>,
            qui indique pour chacune ce qui se définit ({LIBELLE_MOTEUR.grille_generique},{' '}
            {LIBELLE_MOTEUR.criteres_rediges} ou {LIBELLE_MOTEUR.bareme_sujet}).
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
            {ouvert ? 'Annuler' : '+ Nouveau brevet blanc'}
          </button>
        </div>

        {ouvert && (
          <form
            action={creer}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 grid sm:grid-cols-2 gap-4"
          >
            <Champ nom="code" label="Identifiant" placeholder="brevet_blanc_francais_2027_01" requis />
            <label className="text-sm">
              <span className="font-semibold text-gray-800">Matière</span>
              <select name="matiere" required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                {MATIERES.map((m) => (
                  <option key={m} value={m}>
                    {LABELS_MATIERES_BREVET[m]}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-gray-500 mt-1">
                Le bac n’apparaît pas : ses matières se notent à la grille commune.
              </span>
            </label>
            <Champ nom="titre" label="Titre" placeholder="Brevet blanc de français — novembre" requis />
            <Champ nom="exercise_type" label="Type d’épreuve (facultatif)" placeholder="brevet_francais_complet" />
            <Champ nom="session" label="Session" placeholder="2027" />
            <Champ nom="date_epreuve" label="Date de l’épreuve" type="date" />
            <div className="sm:col-span-2">
              <button
                disabled={enCours}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-50"
              >
                {enCours ? 'Création…' : 'Créer le brevet blanc et son barème 1.0'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Le barème 1.0 est créé vide, en brouillon. Rien ne sera corrigeable avant que la
                somme des questions ne tombe exactement sur le total de l’épreuve (100 points en
                français, ramenés sur 20) et que le barème ne soit verrouillé.
              </p>
            </div>
          </form>
        )}

        {examens === null ? (
          <p className="text-gray-500">Chargement…</p>
        ) : examens.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-700 font-medium">Aucun brevet blanc n’a encore de barème.</p>
            <p className="text-sm text-gray-500 mt-2">
              Rien d’anormal côté bac : ses matières n’en ont pas besoin.
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

      {/* Un examen créé avant la décision du 15 août 2026, dans une matière qui
          se note à la grille : le dire, sinon on croit avoir du travail en
          retard. */}
      {moteurAttendu(examen.matiere) !== 'bareme_sujet' && (
        <p className="mt-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          Cette matière se note à la <strong>{LIBELLE_MOTEUR[moteurAttendu(examen.matiere)]}</strong> :
          ce barème n’est plus nécessaire, rien ne vous attend ici.
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
