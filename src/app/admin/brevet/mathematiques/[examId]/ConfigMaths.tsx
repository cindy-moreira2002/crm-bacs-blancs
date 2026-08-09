'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  BandeauControles,
  Bouton,
  Carte,
  Champ,
  classeInput,
  EnteteBrevet,
  JaugeBloc,
  Message,
  Onglets,
} from '../../ui';

/**
 * Configuration d'un brevet blanc de MATHÉMATIQUES.
 *
 * Ce composant ne connaît que les mathématiques : ses deux parties, ses
 * automatismes sans calculatrice, ses étapes valorisables, ses erreurs en
 * cascade et ses 2 points de rédaction COMPRIS dans les 14. Il n'affiche
 * jamais une dictée ni une grille de rédaction de français.
 *
 * Les garde-fous visibles à l'écran :
 *   • une jauge par partie — 6 et 14 — et le total, qui doit faire 20 ;
 *   • un bandeau rouge dès que les 2 points de rédaction sont ajoutés
 *     AU-DESSUS des 14 : c'est l'erreur de barème que le cahier des charges
 *     vise explicitement ;
 *   • une question sans étape valorisable est un blocage : les démarches non
 *     abouties ne pourraient pas être prises en compte, ce que la note de
 *     service impose.
 */

type Question = {
  question_key: string;
  numero: string;
  partie: string;
  libelle: string;
  max_points: number;
  reponse_attendue: string | null;
  raisonnement_attendu: string | null;
  etapes: { code: string; libelle: string; points: number }[];
  methodes_alternatives: { libelle: string; description: string }[];
  unites_attendues: string | null;
  precision_attendue: string | null;
  justification_attendue: string | null;
  domaines: string[];
  competences: string[];
  codes_erreurs: string[];
  depend_de: string[];
  regle_cascade: string | null;
  etapes_geometrie: string[];
  calculatrice: string;
};

type Automatisme = {
  item_key: string;
  numero: string;
  notion: string;
  theme: string;
  competence: string;
  reponse_attendue: string;
  variantes_acceptees: string[];
  unite_attendue: string | null;
  tolerance: number | null;
  forme_exigee: string | null;
  points: number;
};

type Bareme = {
  version: { id: string; version: string; statut: string; total_points: number; max_score: number; controles: Controles | null };
  questions: Question[];
  automatismes: Automatisme[];
  qualiteRedaction: { code: string; libelle: string; max_points: number; actif: boolean }[];
  referentiel: { code: string; libelle: string }[];
};

type Controles = { ok: boolean; blocages: { code: string; message: string }[]; avertissements: { code: string; message: string }[] };

type Examen = {
  id: string;
  code: string;
  titre: string;
  statut: string;
  sujet_texte: string | null;
  corrige_texte: string | null;
  consignes_correcteur: string | null;
};

type Calibration = {
  copies: { id: string; libelle: string; niveau_cible: string | null; note_ia: number | null; note_humaine: number | null; ecart: number | null; correcteurs: number }[];
  couverture: { manquants: { libelle: string; plage: string }[] };
  indicateurs: { copies: number; ecart_absolu_moyen: number | null; faux_positifs: number; faux_negatifs: number };
  pret: { pret: boolean; raisons: string[] };
};

const THEMES = [
  'nombres_et_calculs',
  'espace_et_geometrie',
  'organisation_gestion_donnees_probabilites',
  'proportionnalite_fonctions',
  'algorithmique_et_programmation',
];

const COMPETENCES = ['chercher', 'modeliser', 'representer', 'raisonner', 'calculer', 'communiquer'];

const ETAPES_GEO = ['hypotheses', 'propriete', 'remplacement_numerique', 'calcul', 'unite', 'conclusion'];

const DOMAINES = [
  'qcm', 'reponse_courte', 'calcul', 'demonstration', 'probleme', 'geometrie', 'algorithmique',
  'tableau', 'graphique', 'figure', 'unites', 'probabilites', 'statistiques', 'proportionnalite',
  'fonctions', 'calcul_litteral', 'arithmetique', 'grandeurs_et_mesures',
];

export function ConfigMaths({ examId }: { examId: string }) {
  const [examen, setExamen] = useState<Examen | null>(null);
  const [bareme, setBareme] = useState<Bareme | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [onglet, setOnglet] = useState('examen');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/brevet/mathematiques/${examId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
      setExamen(j.examen);
      setBareme(j.bareme);
      setCalibration(j.calibration);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, [examId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void charger();
    }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  async function agir(corps: Record<string, unknown>, message: string) {
    setEnCours(true);
    setSucces(null);
    try {
      const r = await fetch(`/api/admin/brevet/mathematiques/${examId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Action impossible');
      setSucces(message);
      setErreur(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrer(corps: Record<string, unknown>) {
    setEnCours(true);
    setSucces(null);
    try {
      const r = await fetch(`/api/admin/brevet/mathematiques/${examId}/bareme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Enregistrement impossible');
      setSucces('Barème enregistré et vérifié.');
      setErreur(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  if (!examen || !bareme) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <Message texte={erreur} ton="erreur" />
          {!erreur && <p className="text-gray-500">Chargement…</p>}
        </div>
      </div>
    );
  }

  const verrouille = bareme.version.statut === 'locked';
  const pointsAuto = bareme.automatismes.reduce((s, a) => s + Number(a.points), 0);
  const pointsQuestions = bareme.questions
    .filter((q) => q.partie === 'raisonnement')
    .reduce((s, q) => s + Number(q.max_points), 0);
  const pointsQualite = bareme.qualiteRedaction
    .filter((c) => c.actif)
    .reduce((s, c) => s + Number(c.max_points), 0);
  const partie2 = pointsQuestions + pointsQualite;
  const redactionAjouteeAuDessus = Math.abs(pointsQuestions - 14) < 0.001 && pointsQualite > 0.001;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere="brevet_mathematiques"
          titre={examen.titre}
          fil={[
            { href: '/admin/brevet', texte: 'Brevet' },
            { href: '/admin/brevet/mathematiques', texte: 'Mathématiques' },
          ]}
          soustitre={
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-sm">{examen.code}</code>
              <Badge texte={`Barème ${bareme.version.version}`} ton="gris" />
              <Badge texte={verrouille ? 'Verrouillé' : 'Modifiable'} ton={verrouille ? 'teal' : 'ambre'} />
              {examen.statut === 'correction_open' && <Badge texte="Corrections ouvertes" ton="vert" />}
            </div>
          }
          actions={
            <>
              <Bouton ton="secondaire" disabled={enCours} onClick={() => agir({ action: 'verifier' }, 'Barème vérifié.')}>
                Vérifier
              </Bouton>
              <Bouton
                disabled={enCours || verrouille || !bareme.version.controles?.ok}
                titre={bareme.version.controles?.ok ? undefined : 'Le barème comporte encore des blocages.'}
                onClick={() => agir({ action: 'verrouiller' }, 'Barème verrouillé.')}
              >
                Verrouiller
              </Bouton>
              <Bouton
                ton="secondaire"
                disabled={enCours || !verrouille || examen.statut === 'correction_open'}
                onClick={() => agir({ action: 'ouvrir_corrections' }, 'Corrections ouvertes.')}
              >
                Ouvrir les corrections
              </Bouton>
            </>
          }
        />

        <Message texte={erreur} ton="erreur" />
        <Message texte={succes} ton="succes" />

        <Carte
          titre="Le barème, partie par partie"
          aide="6 points d’automatismes sans calculatrice, 14 points de raisonnement — dont 2 de qualité rédactionnelle, COMPRIS dedans."
        >
          <div className="space-y-3">
            <JaugeBloc libelle="Partie 1 — Automatismes" saisi={pointsAuto} attendu={6} />
            <JaugeBloc libelle="Partie 2 — Raisonnement (rédaction comprise)" saisi={partie2} attendu={14} />
            <div className="pl-4 text-xs text-gray-500">
              dont questions {pointsQuestions} · qualité de la rédaction {pointsQualite}
            </div>
            <div className="pt-2 border-t border-gray-200">
              <JaugeBloc libelle="Total" saisi={pointsAuto + partie2} attendu={20} />
            </div>
          </div>

          {redactionAjouteeAuDessus && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <strong>Les 2 points de rédaction sont ajoutés au-dessus des 14.</strong> Ils doivent y
              être compris : les questions de la partie 2 doivent totaliser {14 - pointsQualite} points,
              pas 14.
            </div>
          )}
        </Carte>

        <BandeauControles controles={bareme.version.controles} />

        {verrouille && (
          <Carte>
            <p className="text-sm text-gray-700">
              Ce barème est verrouillé. Les copies déjà corrigées gardent leur version.
            </p>
            <div className="mt-3">
              <Bouton
                ton="secondaire"
                disabled={enCours}
                onClick={() => {
                  const v = prompt('Numéro de la nouvelle version (ex. 1.1)');
                  if (v) void agir({ action: 'nouvelle_version', version: v }, `Version ${v} créée.`);
                }}
              >
                Créer une nouvelle version
              </Bouton>
            </div>
          </Carte>
        )}

        <Onglets
          actif={onglet}
          surChangement={setOnglet}
          onglets={[
            { code: 'examen', libelle: 'Examen' },
            { code: 'automatismes', libelle: 'Automatismes' },
            { code: 'raisonnement', libelle: 'Partie 2' },
            { code: 'qualite', libelle: 'Qualité de la rédaction' },
            { code: 'calibration', libelle: 'Calibration' },
          ]}
        />

        {onglet === 'examen' && (
          <OngletExamenMaths examen={examen} enCours={enCours} surEnvoi={(champs) => agir({ action: 'maj', champs }, 'Examen mis à jour.')} />
        )}
        {onglet === 'automatismes' && (
          <OngletAutomatismes bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'raisonnement' && (
          <OngletRaisonnement bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'qualite' && (
          <OngletQualite bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'calibration' && <OngletCalibrationMaths calibration={calibration} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OngletExamenMaths({
  examen,
  enCours,
  surEnvoi,
}: {
  examen: Examen;
  enCours: boolean;
  surEnvoi: (champs: Record<string, unknown>) => void;
}) {
  const [sujet, setSujet] = useState(examen.sujet_texte ?? '');
  const [corrige, setCorrige] = useState(examen.corrige_texte ?? '');
  const [consignes, setConsignes] = useState(examen.consignes_correcteur ?? '');

  return (
    <Carte
      titre="Sujet, corrigé et consignes"
      aide="Le correcteur ne reçoit que du texte : aucune figure, aucun graphique, aucune capture Scratch ne lui parvient. Décris-les ici, sinon les questions qui en dépendent partiront en validation humaine."
    >
      <div className="space-y-4">
        <Champ label="Texte du sujet" aide="Les deux parties, avec la description écrite des figures, des tableaux et des scripts.">
          <textarea value={sujet} onChange={(e) => setSujet(e.target.value)} rows={10} className={classeInput} />
        </Champ>
        <Champ label="Corrigé officiel ou de référence">
          <textarea value={corrige} onChange={(e) => setCorrige(e.target.value)} rows={8} className={classeInput} />
        </Champ>
        <Champ label="Consignes particulières" aide="Exemple : « l’exercice 3 admet la résolution par le théorème de Thalès ».">
          <textarea value={consignes} onChange={(e) => setConsignes(e.target.value)} rows={4} className={classeInput} />
        </Champ>
        <Bouton disabled={enCours} onClick={() => surEnvoi({ sujet_texte: sujet, corrige_texte: corrige, consignes_correcteur: consignes })}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletAutomatismes({
  bareme,
  verrouille,
  enCours,
  surEnvoi,
}: {
  bareme: Bareme;
  verrouille: boolean;
  enCours: boolean;
  surEnvoi: (corps: Record<string, unknown>) => void;
}) {
  const [items, setItems] = useState(bareme.automatismes);

  return (
    <Carte
      titre="Partie 1 — Automatismes (6 points, sans calculatrice)"
      aide="Les thèmes reprennent la liste indicative publiée par le ministère en octobre 2025. L’absence de calculatrice n’autorise jamais à retirer des points quand la réponse est correcte."
      action={
        !verrouille && (
          <div className="flex gap-2">
            <Bouton
              ton="secondaire"
              onClick={() =>
                setItems((xs) => [
                  ...xs,
                  {
                    item_key: `a${xs.length + 1}`,
                    numero: String(xs.length + 1),
                    notion: '',
                    theme: 'nombres_et_calculs',
                    competence: 'calculer',
                    reponse_attendue: '',
                    variantes_acceptees: [],
                    unite_attendue: null,
                    tolerance: null,
                    forme_exigee: null,
                    points: 0.5,
                  },
                ])
              }
            >
              + Item
            </Bouton>
            <Bouton disabled={enCours} onClick={() => surEnvoi({ automatismes: items.map((x, i) => ({ ...x, ordre: i })) })}>
              {enCours ? 'Enregistrement…' : 'Enregistrer les automatismes'}
            </Bouton>
          </div>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun item. Les 6 points doivent être répartis avant de verrouiller.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a, i) => (
            <div key={a.item_key} className="rounded-xl border border-gray-200 p-3 grid sm:grid-cols-4 gap-3">
              <Champ label="Numéro">
                <input value={a.numero} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, numero: e.target.value } : x)))} className={classeInput} />
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Notion évaluée">
                  <input value={a.notion} disabled={verrouille} placeholder="le tiers de 18" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, notion: e.target.value } : x)))} className={classeInput} />
                </Champ>
              </div>
              <Champ label="Points">
                <input type="number" step="0.25" value={a.points} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))} className={classeInput} />
              </Champ>
              <Champ label="Thème">
                <select value={a.theme} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, theme: e.target.value } : x)))} className={classeInput}>
                  {THEMES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Compétence">
                <select value={a.competence} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, competence: e.target.value } : x)))} className={classeInput}>
                  {COMPETENCES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Réponse attendue" aide="Obligatoire.">
                <input value={a.reponse_attendue} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, reponse_attendue: e.target.value } : x)))} className={classeInput} />
              </Champ>
              <Champ label="Forme exigée" aide="Vide = toute écriture correcte est acceptée.">
                <input value={a.forme_exigee ?? ''} disabled={verrouille} placeholder="fraction irréductible" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, forme_exigee: e.target.value || null } : x)))} className={classeInput} />
              </Champ>
              <div className="sm:col-span-3">
                <Champ label="Variantes acceptées" aide="Séparées par des virgules. Une écriture équivalente correcte est juste.">
                  <input
                    value={a.variantes_acceptees.join(', ')}
                    disabled={verrouille}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, variantes_acceptees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } : x)))}
                    className={classeInput}
                  />
                </Champ>
              </div>
              <Champ label="Unité attendue">
                <input value={a.unite_attendue ?? ''} disabled={verrouille} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unite_attendue: e.target.value || null } : x)))} className={classeInput} />
              </Champ>
              {!verrouille && (
                <div className="sm:col-span-4 text-right">
                  <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                    Retirer cet item
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletRaisonnement({
  bareme,
  verrouille,
  enCours,
  surEnvoi,
}: {
  bareme: Bareme;
  verrouille: boolean;
  enCours: boolean;
  surEnvoi: (corps: Record<string, unknown>) => void;
}) {
  const [questions, setQuestions] = useState(bareme.questions.filter((q) => q.partie === 'raisonnement'));

  function maj(i: number, champs: Partial<Question>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...champs } : q)));
  }

  return (
    <Carte
      titre="Partie 2 — Raisonnement et résolution de problèmes"
      aide="Chaque question porte ses étapes valorisables : ce sont elles qui permettent de prendre en compte les essais et les démarches non abouties, comme la note de service l’impose. Une question sans étape est un blocage."
      action={
        !verrouille && (
          <div className="flex gap-2">
            <Bouton
              ton="secondaire"
              onClick={() =>
                setQuestions((qs) => [
                  ...qs,
                  {
                    question_key: `ex${qs.length + 1}_q1`,
                    numero: String(qs.length + 1),
                    partie: 'raisonnement',
                    libelle: '',
                    max_points: 2,
                    reponse_attendue: '',
                    raisonnement_attendu: '',
                    etapes: [],
                    methodes_alternatives: [],
                    unites_attendues: null,
                    precision_attendue: null,
                    justification_attendue: 'demonstration_complete',
                    domaines: [],
                    competences: ['raisonner'],
                    codes_erreurs: [],
                    depend_de: [],
                    regle_cascade: null,
                    etapes_geometrie: [],
                    calculatrice: 'autorisee',
                  },
                ])
              }
            >
              + Question
            </Bouton>
            <Bouton disabled={enCours} onClick={() => surEnvoi({ questions })}>
              {enCours ? 'Enregistrement…' : 'Enregistrer les questions'}
            </Bouton>
          </div>
        )
      }
    >
      {questions.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune question.</p>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.question_key} className="rounded-xl border border-gray-200 p-4 grid sm:grid-cols-2 gap-3">
              <Champ label="Identifiant stable">
                <input value={q.question_key} disabled={verrouille} onChange={(e) => maj(i, { question_key: e.target.value })} className={classeInput} />
              </Champ>
              <Champ label="Numéro affiché">
                <input value={q.numero} disabled={verrouille} onChange={(e) => maj(i, { numero: e.target.value })} className={classeInput} />
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Énoncé de la question">
                  <textarea value={q.libelle} disabled={verrouille} onChange={(e) => maj(i, { libelle: e.target.value })} rows={2} className={classeInput} />
                </Champ>
              </div>
              <Champ label="Points">
                <input type="number" step="0.25" value={q.max_points} disabled={verrouille} onChange={(e) => maj(i, { max_points: Number(e.target.value) })} className={classeInput} />
              </Champ>
              <Champ label="Justification attendue">
                <select value={q.justification_attendue ?? 'demonstration_complete'} disabled={verrouille} onChange={(e) => maj(i, { justification_attendue: e.target.value })} className={classeInput}>
                  <option value="aucune">Aucune (le sujet le dit)</option>
                  <option value="mention">Mention de la méthode</option>
                  <option value="demonstration_complete">Démonstration complète</option>
                </select>
              </Champ>
              <Champ label="Résultat attendu" aide="Obligatoire.">
                <input value={q.reponse_attendue ?? ''} disabled={verrouille} onChange={(e) => maj(i, { reponse_attendue: e.target.value })} className={classeInput} />
              </Champ>
              <Champ label="Méthode principale">
                <input value={q.raisonnement_attendu ?? ''} disabled={verrouille} onChange={(e) => maj(i, { raisonnement_attendu: e.target.value })} className={classeInput} />
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Étapes valorisables" aide="Format : points | libellé, une par ligne. Ce sont elles qui font que les démarches engagées comptent.">
                  <textarea
                    value={q.etapes.map((e) => `${e.points} | ${e.libelle}`).join('\n')}
                    disabled={verrouille}
                    onChange={(e) =>
                      maj(i, {
                        etapes: e.target.value
                          .split('\n')
                          .filter(Boolean)
                          .map((l, k) => {
                            const [p, ...reste] = l.split('|');
                            return { code: `e${k + 1}`, points: Number(p), libelle: reste.join('|').trim() };
                          }),
                      })
                    }
                    rows={3}
                    className={classeInput}
                  />
                </Champ>
              </div>
              <div className="sm:col-span-2">
                <Champ label="Méthodes alternatives acceptées" aide="Une par ligne. Sans elles, toute démarche différente partira en validation humaine.">
                  <textarea
                    value={q.methodes_alternatives.map((m) => m.libelle).join('\n')}
                    disabled={verrouille}
                    onChange={(e) =>
                      maj(i, {
                        methodes_alternatives: e.target.value.split('\n').filter(Boolean).map((l) => ({ libelle: l, description: l })),
                      })
                    }
                    rows={2}
                    className={classeInput}
                  />
                </Champ>
              </div>
              <Champ label="Unité attendue">
                <input value={q.unites_attendues ?? ''} disabled={verrouille} onChange={(e) => maj(i, { unites_attendues: e.target.value || null })} className={classeInput} />
              </Champ>
              <Champ label="Arrondi / précision">
                <input value={q.precision_attendue ?? ''} disabled={verrouille} placeholder="au dixième" onChange={(e) => maj(i, { precision_attendue: e.target.value || null })} className={classeInput} />
              </Champ>
              <Champ label="Dépend du résultat de" aide="Identifiants séparés par des virgules. Sert à la règle de cascade.">
                <input
                  value={q.depend_de.join(', ')}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { depend_de: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className={classeInput}
                />
              </Champ>
              <Champ label="Règle de cascade" aide="Ce que devient la question si le résultat repris est faux.">
                <input
                  value={q.regle_cascade ?? ''}
                  disabled={verrouille}
                  placeholder="les points de méthode restent acquis"
                  onChange={(e) => maj(i, { regle_cascade: e.target.value || null })}
                  className={classeInput}
                />
              </Champ>
              <Champ label="Compétences" aide="Obligatoire.">
                <input
                  value={q.competences.join(', ')}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { competences: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className={classeInput}
                  placeholder={COMPETENCES.join(', ')}
                />
              </Champ>
              <Champ label="Domaines">
                <input
                  value={q.domaines.join(', ')}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { domaines: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className={classeInput}
                  placeholder={DOMAINES.slice(0, 6).join(', ')}
                />
              </Champ>
              <div className="sm:col-span-2">
                <Champ
                  label="Étapes de démonstration exigées (géométrie)"
                  aide="Coche celles que le barème exige. Une conclusion correcte sans elles n’est pas une démonstration complète."
                >
                  <div className="flex flex-wrap gap-3 text-sm">
                    {ETAPES_GEO.map((e) => (
                      <label key={e} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          disabled={verrouille}
                          checked={q.etapes_geometrie.includes(e)}
                          onChange={(ev) =>
                            maj(i, {
                              etapes_geometrie: ev.target.checked
                                ? [...q.etapes_geometrie, e]
                                : q.etapes_geometrie.filter((x) => x !== e),
                            })
                          }
                        />
                        {e.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </Champ>
              </div>
              {!verrouille && (
                <div className="sm:col-span-2 text-right">
                  <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                    Retirer cette question
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletQualite({
  bareme,
  verrouille,
  enCours,
  surEnvoi,
}: {
  bareme: Bareme;
  verrouille: boolean;
  enCours: boolean;
  surEnvoi: (corps: Record<string, unknown>) => void;
}) {
  const [criteres, setCriteres] = useState(bareme.qualiteRedaction);
  const somme = criteres.filter((c) => c.actif).reduce((s, c) => s + Number(c.max_points), 0);

  return (
    <Carte
      titre="Qualité de la rédaction — 2 points COMPRIS dans les 14"
      aide="Ils ne s’ajoutent jamais au-dessus de la partie 2. Le moteur neutralise en plus les doublons : ce qui a déjà été retiré question par question pour une justification absente ou une unité manquante n’est pas repris ici."
      action={
        !verrouille && (
          <Bouton disabled={enCours} onClick={() => surEnvoi({ qualite_redaction: criteres.map((c, i) => ({ ...c, ordre: i })) })}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>
        )
      }
    >
      <JaugeBloc libelle="Somme des critères actifs" saisi={somme} attendu={2} />
      <table className="w-full text-sm mt-4">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="pb-2">Point de contrôle</th>
            <th className="pb-2 w-28">Points</th>
            <th className="pb-2 w-20">Actif</th>
          </tr>
        </thead>
        <tbody>
          {criteres.map((c, i) => (
            <tr key={c.code} className="border-b border-gray-100">
              <td className="py-1">
                {c.libelle}
                <code className="text-xs text-gray-400 ml-2">{c.code}</code>
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  step="0.25"
                  value={c.max_points}
                  disabled={verrouille}
                  onChange={(e) => setCriteres((cs) => cs.map((x, j) => (j === i ? { ...x, max_points: Number(e.target.value) } : x)))}
                  className={classeInput}
                />
              </td>
              <td className="py-1 text-center">
                <input
                  type="checkbox"
                  checked={c.actif}
                  disabled={verrouille}
                  onChange={(e) => setCriteres((cs) => cs.map((x, j) => (j === i ? { ...x, actif: e.target.checked } : x)))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletCalibrationMaths({ calibration }: { calibration: Calibration | null }) {
  if (!calibration) return <Carte><p className="text-sm text-gray-500">Aucune donnée de calibration.</p></Carte>;

  return (
    <div className="space-y-5">
      <Carte
        titre="Prêt pour la production ?"
        aide="La réponse reste non tant que des copies réelles notées par un professeur n’ont pas été comparées à l’IA."
      >
        {calibration.pret.pret ? (
          <p className="text-sm text-emerald-800 font-semibold">✅ Le corpus est suffisant et l’écart moyen est tenu.</p>
        ) : (
          <ul className="text-sm text-amber-900 list-disc pl-5 space-y-1">
            {calibration.pret.raisons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </Carte>

      <Carte titre="Indicateurs">
        <div className="grid sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-2xl font-bold">{calibration.indicateurs.copies}</p><p className="text-gray-600">copies comparées</p></div>
          <div><p className="text-2xl font-bold">{calibration.indicateurs.ecart_absolu_moyen ?? '—'}</p><p className="text-gray-600">écart absolu moyen</p></div>
          <div><p className="text-2xl font-bold">{calibration.indicateurs.faux_positifs}</p><p className="text-gray-600">faux positifs</p></div>
          <div><p className="text-2xl font-bold">{calibration.indicateurs.faux_negatifs}</p><p className="text-gray-600">faux négatifs</p></div>
        </div>
        {calibration.couverture.manquants.length > 0 && (
          <p className="text-sm text-amber-900 mt-4">
            Niveaux absents du corpus : {calibration.couverture.manquants.map((m) => `${m.libelle} (${m.plage})`).join(', ')}.
          </p>
        )}
      </Carte>

      {calibration.copies.length > 0 && (
        <Carte titre="Copies étalons">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="pb-2">Copie</th>
                <th className="pb-2">Niveau visé</th>
                <th className="pb-2 text-right">IA</th>
                <th className="pb-2 text-right">Professeurs</th>
                <th className="pb-2 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {calibration.copies.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-1">{c.libelle}</td>
                  <td className="py-1 text-gray-500">{c.niveau_cible ?? '—'}</td>
                  <td className="py-1 text-right">{c.note_ia ?? '—'}</td>
                  <td className="py-1 text-right">{c.note_humaine ?? '—'}</td>
                  <td className={`py-1 text-right font-bold ${c.ecart !== null && Math.abs(c.ecart) > 1 ? 'text-red-700' : ''}`}>
                    {c.ecart ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
    </div>
  );
}
