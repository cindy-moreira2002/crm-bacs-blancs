'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { labelMatiere } from '@/lib/matieres';
import { EditeurBareme } from './EditeurBareme';
import { ModuleEtalons } from './ModuleEtalons';
import { TableauCalibrationVue } from './TableauCalibration';
import type { VueExamen } from './types';

const ONGLETS = [
  { cle: 'examen', label: 'Examen' },
  { cle: 'bareme', label: 'Éditeur de barème' },
  { cle: 'etalons', label: 'Copies étalons' },
  { cle: 'calibration', label: 'Calibration' },
] as const;

type Onglet = (typeof ONGLETS)[number]['cle'];

const STATUTS: Record<string, { texte: string; classe: string }> = {
  draft: { texte: 'Brouillon', classe: 'bg-gray-100 text-gray-700' },
  calibrating: { texte: 'En calibration', classe: 'bg-amber-100 text-amber-800' },
  ready_for_validation: { texte: 'À valider', classe: 'bg-amber-100 text-amber-800' },
  validated: { texte: 'Validé', classe: 'bg-sky-100 text-sky-800' },
  locked: { texte: 'Barème verrouillé', classe: 'bg-indigo-100 text-indigo-800' },
  correction_open: { texte: 'Corrections ouvertes', classe: 'bg-emerald-100 text-emerald-800' },
  archived: { texte: 'Archivé', classe: 'bg-gray-100 text-gray-500' },
};

export function EcranExamen({ examId }: { examId: string }) {
  const [vue, setVue] = useState<VueExamen | null>(null);
  const [versionAffichee, setVersionAffichee] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('examen');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(
    async (version?: string | null) => {
      try {
        const url = version
          ? `/api/admin/bareme/${examId}?version=${encodeURIComponent(version)}`
          : `/api/admin/bareme/${examId}`;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
        setVue(j);
        if (!version) setVersionAffichee(j.bareme?.version?.id ?? j.versions.at(-1)?.id ?? null);
        setErreur(null);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    },
    [examId],
  );

  useEffect(() => {
    // setTimeout(..., 0) et non un appel direct : Next 16 refuse un setState
    // synchrone dans un effet (react-hooks/set-state-in-effect). Le chargement
    // part donc au tick suivant, et l'abandon annule la requete au demontage.
    const t = setTimeout(() => { void charger(); }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const action = useCallback(
    async (corps: Record<string, unknown>) => {
      setEnCours(true);
      setMessage(null);
      try {
        const r = await fetch(`/api/admin/bareme/${examId}/bareme`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Action impossible');
        await charger(versionAffichee);
        setErreur(null);
        return j;
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
        return null;
      } finally {
        setEnCours(false);
      }
    },
    [examId, charger, versionAffichee],
  );

  if (!vue) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <p className="text-center text-gray-500">{erreur ?? 'Chargement…'}</p>
      </div>
    );
  }

  const { examen, versions, bareme, controles, controles_locaux } = vue;
  const version = bareme?.version ?? null;
  const verrouille = version?.statut === 'locked';
  const blocages = controles?.blocages ?? controles_locaux?.blocages ?? [];
  const statut = STATUTS[examen.statut] ?? { texte: examen.statut, classe: 'bg-gray-100' };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="text-sm text-gray-500">
            <Link href="/admin/bareme" className="hover:underline">
              Barèmes
            </Link>{' '}
            › {examen.code}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{examen.titre}</h1>
              <p className="text-gray-600 mt-1">
                {labelMatiere(examen.matiere)}
                {examen.session && ` · session ${examen.session}`}
                {examen.date_epreuve &&
                  ` · ${new Date(examen.date_epreuve).toLocaleDateString('fr-FR')}`}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statut.classe}`}>
              {statut.texte}
            </span>
          </div>
        </header>

        {erreur && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erreur}</div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {/* --------------------------------------------- Bandeau de pilotage */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Chiffre
              valeur={version ? `${version.total_points} / ${version.max_score}` : '—'}
              label="Total du barème"
              alerte={!!version && Number(version.total_points) !== Number(version.max_score)}
            />
            <Chiffre valeur={version?.version ?? '—'} label={`Version · ${version?.statut ?? '—'}`} />
            <Chiffre valeur={String(vue.etalons.length)} label="Copies étalons" alerte={vue.etalons.length === 0} />
            <Chiffre
              valeur={String(vue.etalons.reduce((n, e) => n + e.nb_corrections_humaines, 0))}
              label="Corrections humaines"
            />
            <Chiffre
              valeur={`${vue.corrections.total}${vue.corrections.en_relecture ? ` (${vue.corrections.en_relecture} ⚑)` : ''}`}
              label="Copies corrigées"
            />
          </div>

          {Object.keys(vue.corrections.par_version).length > 1 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              ⚠ Ce lot mélange <strong>{Object.keys(vue.corrections.par_version).length} versions</strong> de
              barème. Deux élèves n’ont donc pas été notés avec le même barème : relance les copies
              périmées depuis l’onglet Calibration.
            </p>
          )}

          {blocages.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-900 text-sm">
                {blocages.length} blocage(s) — le barème ne peut pas être verrouillé :
              </p>
              <ul className="mt-2 space-y-1 text-sm text-red-800 list-disc list-inside">
                {blocages.map((b, i) => (
                  <li key={i}>{b.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            version && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Aucun blocage : le barème totalise bien {version.max_score} points et chaque question
                a sa réponse attendue, sa règle d’attribution et ses compétences.
              </p>
            )
          )}

          <div className="flex flex-wrap gap-2 items-center">
            {versions.length > 1 && (
              <select
                value={versionAffichee ?? ''}
                onChange={(e) => {
                  setVersionAffichee(e.target.value);
                  void charger(e.target.value);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version} — {v.statut}
                    {v.id === examen.bareme_version_active ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            )}

            <Bouton
              disabled={enCours || !version}
              onClick={() => action({ action: 'verifier', version_id: version!.id })}
            >
              Vérifier
            </Bouton>

            {!verrouille && (
              <Bouton
                variante="primaire"
                disabled={enCours || !version || blocages.length > 0}
                onClick={async () => {
                  const j = await action({ action: 'verrouiller', version_id: version!.id });
                  if (j) setMessage(`Barème ${version!.version} verrouillé. Il ne peut plus être modifié.`);
                }}
              >
                Verrouiller cette version
              </Bouton>
            )}

            {verrouille && examen.statut !== 'correction_open' && (
              <Bouton
                variante="primaire"
                disabled={enCours}
                onClick={async () => {
                  const j = await action({ action: 'ouvrir_corrections' });
                  if (j) setMessage('Corrections ouvertes : les copies d’élèves peuvent être déposées.');
                }}
              >
                Ouvrir les corrections
              </Bouton>
            )}

            {verrouille && (
              <Bouton
                disabled={enCours}
                onClick={async () => {
                  const suivante = prompt(
                    'Numéro de la nouvelle version (ex. 1.1) :',
                    incrementer(version!.version),
                  );
                  if (!suivante) return;
                  const j = await action({
                    action: 'nouvelle_version',
                    version_id: version!.id,
                    version: suivante,
                  });
                  if (j?.version_id) {
                    setVersionAffichee(j.version_id);
                    await charger(j.version_id);
                    setMessage(
                      `Version ${suivante} créée en brouillon. La ${version!.version} reste intacte : ` +
                        'les copies déjà corrigées gardent la leur.',
                    );
                  }
                }}
              >
                Créer une nouvelle version
              </Bouton>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- Onglets */}
        <nav className="flex flex-wrap gap-2">
          {ONGLETS.map((o) => (
            <button
              key={o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                onglet === o.cle ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>

        {onglet === 'examen' && <FicheExamen examen={examen} onEnregistre={() => charger(versionAffichee)} />}

        {onglet === 'bareme' &&
          (bareme ? (
            <EditeurBareme
              examId={examId}
              bareme={bareme}
              verrouille={verrouille}
              onEnregistre={() => charger(versionAffichee)}
            />
          ) : (
            <p className="text-gray-600">Aucune version de barème à éditer.</p>
          ))}

        {onglet === 'etalons' && (
          <ModuleEtalons
            examId={examId}
            versionId={version?.id ?? null}
            questions={bareme?.questions ?? []}
            etalons={vue.etalons}
            couverture={vue.couverture}
            onChange={() => charger(versionAffichee)}
          />
        )}

        {onglet === 'calibration' && (
          <TableauCalibrationVue
            examId={examId}
            versionId={version?.id ?? null}
            versions={versions}
            onChange={() => charger(versionAffichee)}
          />
        )}
      </div>
    </div>
  );
}

/** 1.0 → 1.1, 1.9 → 1.10 : suggestion, l'administratrice peut la changer. */
function incrementer(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)$/);
  return m ? `${m[1]}.${Number(m[2]) + 1}` : `${version}-b`;
}

/** Une ligne d'explication sous un champ : à quoi il sert, et pour qui. */
function Aide({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs text-gray-500 mt-1 leading-snug">{children}</span>;
}

function Chiffre({ valeur, label, alerte }: { valeur: string; label: string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerte ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <p className="text-lg font-bold text-gray-900">{valeur}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Bouton({
  children,
  onClick,
  disabled,
  variante = 'neutre',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variante?: 'neutre' | 'primaire';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 ${
        variante === 'primaire'
          ? 'bg-purple-600 text-white hover:bg-purple-700'
          : 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function FicheExamen({
  examen,
  onEnregistre,
}: {
  examen: VueExamen['examen'];
  onEnregistre: () => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer(form: FormData) {
    setEnCours(true);
    try {
      const r = await fetch(`/api/admin/bareme/${examen.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: form.get('titre'),
          session: form.get('session') || null,
          date_epreuve: form.get('date_epreuve') || null,
          subject_id: form.get('subject_id') || null,
          exercise_type: form.get('exercise_type') || null,
          sujet_url: form.get('sujet_url') || null,
          sujet_texte: form.get('sujet_texte') || null,
          corrige_url: form.get('corrige_url') || null,
          corrige_texte: form.get('corrige_texte') || null,
          consignes_correcteur: form.get('consignes_correcteur') || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Enregistrement impossible');
      setErreur(null);
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form action={enregistrer} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Le sujet et son corrigé</h2>
      <p className="text-sm text-gray-600">
        Quand une copie est notée, le correcteur reçoit trois choses : le <strong>sujet</strong>, le{' '}
        <strong>corrigé</strong> et le <strong>barème</strong>. Le barème s’écrit dans l’onglet
        suivant ; ce qui se remplit ici, c’est le reste. Sans le sujet, le correcteur lit des
        réponses sans savoir ce qui était demandé.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <label>
          <span className="font-semibold text-gray-800">Titre</span>
          <input name="titre" defaultValue={examen.titre} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          <Aide>Le nom que tu vois dans la liste des bacs blancs. Il n’a aucun autre effet.</Aide>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Type d’épreuve</span>
          <input
            name="exercise_type"
            defaultValue={examen.exercise_type ?? ''}
            placeholder="maths_analyse"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <Aide>
            Facultatif. Sert à ranger les épreuves entre elles quand une matière en a plusieurs formes.
          </Aide>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Session</span>
          <input name="session" defaultValue={examen.session ?? ''} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          <Aide>L’année du bac visé, par exemple 2027.</Aide>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Date de l’épreuve</span>
          <input
            name="date_epreuve"
            type="date"
            defaultValue={examen.date_epreuve ?? ''}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <Aide>Le jour du bac blanc. Affichée sur la fiche, elle ne déclenche rien toute seule.</Aide>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Fiche sujet du catalogue</span>
          <input
            name="subject_id"
            defaultValue={examen.subject_id ?? ''}
            placeholder="MA-ANALYSE-2027-01"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <Aide>
            Facultatif, et réservé aux sujets déjà présents dans le catalogue de l’ancien moteur.
            Laisse vide si tu ne sais pas quoi y mettre : le barème marche sans.
          </Aide>
        </label>
        <label>
          <span className="font-semibold text-gray-800">Lien vers le sujet (PDF)</span>
          <input name="sujet_url" defaultValue={examen.sujet_url ?? ''} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          <Aide>
            Adresse d’un PDF accessible en ligne. Utile si le sujet contient des figures : « Proposer
            le barème » ira le chercher.
          </Aide>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-semibold text-gray-800">Texte du sujet</span>
        <Aide>
          L’énoncé complet, tel que l’élève l’a eu sous les yeux — exercices, questions, données,
          documents. C’est le champ le plus utile de cette page : il est remis au correcteur avec
          chaque copie, et c’est lui que lit « Proposer le barème » quand tu ne déposes pas de PDF.
          Colle-le tel quel, la mise en forme n’a pas d’importance.
        </Aide>
        <textarea
          name="sujet_texte"
          defaultValue={examen.sujet_texte ?? ''}
          rows={6}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
        />
      </label>

      <label className="block text-sm">
        <span className="font-semibold text-gray-800">Texte du corrigé</span>
        <Aide>
          La correction rédigée, celle qu’un professeur écrirait au tableau. Facultative : le barème
          dit déjà ce qu’on attend question par question. Elle sert au correcteur à trancher les cas
          limites, en lui montrant la démarche complète et pas seulement le résultat attendu.
        </Aide>
        <textarea
          name="corrige_texte"
          defaultValue={examen.corrige_texte ?? ''}
          rows={6}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
        />
      </label>

      <label className="block text-sm">
        <span className="font-semibold text-gray-800">Consignes particulières au correcteur</span>
        <Aide>
          Ce qui vaut pour CE sujet-là et qu’aucun barème ne peut deviner : une méthode hors
          programme à accepter, une coquille de l’énoncé à ne pas sanctionner, une tolérance décidée
          en équipe.
        </Aide>
        <textarea
          name="consignes_correcteur"
          defaultValue={examen.consignes_correcteur ?? ''}
          rows={3}
          placeholder="Ex. : l’exercice 3 admet la méthode matricielle, non vue en cours mais valide."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </label>

      {erreur && <p className="text-sm text-red-700">{erreur}</p>}

      <button
        disabled={enCours}
        className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm disabled:opacity-50"
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
