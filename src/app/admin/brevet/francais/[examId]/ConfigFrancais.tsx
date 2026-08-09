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
 * Configuration d'un brevet blanc de FRANÇAIS.
 *
 * Ce composant ne connaît que le français : ses trois blocs, sa réécriture,
 * sa dictée et ses deux grilles de rédaction. Il n'affiche jamais un
 * automatisme de mathématiques, et l'API qu'il appelle refuse ces clés-là.
 *
 * Les garde-fous visibles à l'écran :
 *   • une jauge par bloc — 50 / 10 / 40 — et le total, qui doit faire 100 ;
 *   • « Verrouiller » reste gris tant qu'un blocage subsiste ;
 *   • une dictée sans règles de retrait est un BLOCAGE, pas un avertissement :
 *     le moteur refusera de la noter plutôt que d'inventer un barème ;
 *   • les deux grilles de rédaction sont obligatoires.
 */

type Question = {
  question_key: string;
  numero: string;
  sous_numero?: string | null;
  partie: string;
  libelle: string;
  max_points: number;
  type_reponse: string | null;
  elements_attendus: string[];
  citations_attendues: string[];
  degre_justification: string | null;
  reponses_equivalentes: string[];
  regles_points_partiels: { points: number; condition: string; cumulable: boolean }[];
  erreurs_frequentes: string[];
  competences: string[];
  codes_erreurs: string[];
  depend_de: string[];
};

type Bareme = {
  version: { id: string; version: string; statut: string; total_points: number; max_score: number; controles: Controles | null };
  questions: Question[];
  reecriture: {
    config: {
      max_points: number;
      penalite_erreur_copie: number | null;
      plafond_erreurs_copie: number | null;
      consigne: string | null;
      bareme_du_sujet_fourni: boolean;
    } | null;
    items: {
      cle: string;
      forme_originale: string;
      forme_attendue: string;
      transformation: string;
      points: number;
      variantes_admises: string[];
    }[];
  };
  dictee: {
    config: {
      max_points: number;
      texte_attendu: string;
      longueur_signes: number | null;
      plancher: number;
      graphies_admises: string[];
      source_bareme: string | null;
      consigne: string | null;
    } | null;
    regles: {
      categorie: string;
      sous_categorie: string | null;
      penalite: number;
      plafond: number | null;
      cumul_repetitions: boolean;
      regle: string;
    }[];
  };
  redaction: {
    type_sujet: 'imagination' | 'reflexion';
    intitule: string;
    max_points: number;
    longueur_minimale: number | null;
    issue_du_sujet: boolean;
    criteres: { code: string; libelle: string; max_points: number; famille: string | null; cumul_famille_autorise: boolean; actif: boolean }[];
  }[];
  referentiel: { code: string; libelle: string }[];
  taxonomie: { code: string; libelle_eleve: string | null; partie: string | null }[];
};

type Controles = {
  ok: boolean;
  blocages: { code: string; message: string }[];
  avertissements: { code: string; message: string }[];
};

type Examen = {
  id: string;
  code: string;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  statut: string;
  sujet_texte: string | null;
  corrige_texte: string | null;
  consignes_correcteur: string | null;
};

type Calibration = {
  copies: { id: string; libelle: string; niveau_cible: string | null; note_ia: number | null; note_humaine: number | null; ecart: number | null; correcteurs: number }[];
  couverture: { manquants: { libelle: string; plage: string }[] };
  indicateurs: { copies: number; ecart_absolu_moyen: number | null; taux_accord_par_question: number | null; faux_positifs: number; faux_negatifs: number };
  pret: { pret: boolean; raisons: string[] };
};

const CATEGORIES_DICTEE = [
  'mot_oublie', 'mot_ajoute', 'accord', 'grammaire', 'lexique', 'conjugaison',
  'homophone', 'accent', 'majuscule', 'ponctuation', 'trait_union', 'apostrophe',
  'segmentation', 'graphie_rectifiee',
];

const TYPES_QUESTION = [
  'prelevement_explicite', 'reformulation', 'comprehension_globale', 'interpretation',
  'justification_par_le_texte', 'citation', 'analyse_de_procede', 'effet_produit',
  'point_de_vue_argumente', 'comparaison_texte_image', 'lexique', 'synonymie_antonymie',
  'formation_des_mots', 'nature_et_fonction', 'proposition', 'subordination',
  'temps_et_modes', 'valeur_des_temps', 'accords', 'transformation', 'reecriture',
  'manipulation_grammaticale', 'figure_de_style', 'reponse_courte', 'reponse_construite',
];

export function ConfigFrancais({ examId }: { examId: string }) {
  const [examen, setExamen] = useState<Examen | null>(null);
  const [bareme, setBareme] = useState<Bareme | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [onglet, setOnglet] = useState('examen');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/brevet/francais/${examId}`);
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
      const r = await fetch(`/api/admin/brevet/francais/${examId}`, {
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
      const r = await fetch(`/api/admin/brevet/francais/${examId}/bareme`, {
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
  const controles = bareme.version.controles;
  // Le bloc « texte » additionne ses trois parties possibles : la générique
  // et les deux sous-parties que les sujets réels nomment.
  const PARTIES_TEXTE = ['texte', 'comprehension', 'grammaire'];
  const pointsTexte = bareme.questions
    .filter((q) => PARTIES_TEXTE.includes(q.partie))
    .reduce((s, q) => s + Number(q.max_points), 0);
  const pointsComprehension = bareme.questions
    .filter((q) => q.partie === 'comprehension')
    .reduce((s, q) => s + Number(q.max_points), 0);
  const pointsGrammaire = bareme.questions
    .filter((q) => q.partie === 'grammaire')
    .reduce((s, q) => s + Number(q.max_points), 0);
  const pointsReecriture = Number(bareme.reecriture.config?.max_points ?? 0);
  const pointsDictee = Number(bareme.dictee.config?.max_points ?? 0);
  const pointsRedaction = Number(bareme.redaction[0]?.max_points ?? 0);
  const total = pointsTexte + pointsReecriture + pointsDictee + pointsRedaction;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere="brevet_francais"
          titre={examen.titre}
          fil={[
            { href: '/admin/brevet', texte: 'Brevet' },
            { href: '/admin/brevet/francais', texte: 'Français' },
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
                disabled={enCours || verrouille || !controles?.ok}
                titre={
                  controles?.ok
                    ? undefined
                    : 'Le barème comporte encore des blocages : le verrouillage est impossible.'
                }
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

        <Carte titre="Le barème, bloc par bloc" aide="La note de service impose 100 points au total : 50 pour le travail sur le texte (réécriture comprise), 10 pour la dictée, 40 pour la rédaction.">
          <div className="space-y-3">
            <JaugeBloc libelle="Travail sur le texte (réécriture comprise)" saisi={pointsTexte + pointsReecriture} attendu={50} />
            <div className="pl-4 text-xs text-gray-500">
              dont compréhension {pointsComprehension} · grammaire{' '}
              {pointsGrammaire + pointsReecriture} (dont réécriture {pointsReecriture})
              {pointsTexte - pointsComprehension - pointsGrammaire > 0 && (
                <> · non distingué {pointsTexte - pointsComprehension - pointsGrammaire}</>
              )}
            </div>
            <JaugeBloc libelle="Dictée" saisi={pointsDictee} attendu={10} />
            <JaugeBloc libelle="Rédaction" saisi={pointsRedaction} attendu={40} />
            <div className="pt-2 border-t border-gray-200">
              <JaugeBloc libelle="Total" saisi={total} attendu={100} />
            </div>
          </div>
        </Carte>

        <BandeauControles controles={controles} />

        {verrouille && (
          <Carte>
            <p className="text-sm text-gray-700">
              Ce barème est verrouillé : il ne peut plus être modifié, ni par cet écran, ni par
              l’API, ni par le SQL Editor. Les copies déjà corrigées gardent leur version.
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
            { code: 'texte', libelle: 'Texte et langue' },
            { code: 'reecriture', libelle: 'Réécriture' },
            { code: 'dictee', libelle: 'Dictée' },
            { code: 'redaction', libelle: 'Rédaction' },
            { code: 'calibration', libelle: 'Calibration' },
          ]}
        />

        {onglet === 'examen' && (
          <OngletExamen examen={examen} enCours={enCours} surEnvoi={(champs) => agir({ action: 'maj', champs }, 'Examen mis à jour.')} />
        )}
        {onglet === 'texte' && (
          <OngletTexte
            bareme={bareme}
            verrouille={verrouille}
            enCours={enCours}
            surEnvoi={(questions) => enregistrer({ questions })}
          />
        )}
        {onglet === 'reecriture' && (
          <OngletReecriture bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'dictee' && (
          <OngletDictee bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'redaction' && (
          <OngletRedaction bareme={bareme} verrouille={verrouille} enCours={enCours} surEnvoi={enregistrer} />
        )}
        {onglet === 'calibration' && <OngletCalibration calibration={calibration} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OngletExamen({
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
      aide="Plus c’est complet, moins le moteur devine. Le barème du sujet passe avant le corrigé, qui passe avant tes consignes, qui passent avant les règles générales du DNB."
    >
      <div className="space-y-4">
        <Champ label="Texte du sujet" aide="Le texte littéraire, les questions, la consigne de réécriture, les deux sujets de rédaction.">
          <textarea value={sujet} onChange={(e) => setSujet(e.target.value)} rows={10} className={classeInput} />
        </Champ>
        <Champ label="Corrigé officiel ou de référence" aide="Priorité 2 : il tranche quand le barème détaillé ne dit rien.">
          <textarea value={corrige} onChange={(e) => setCorrige(e.target.value)} rows={8} className={classeInput} />
        </Champ>
        <Champ label="Consignes particulières" aide="Priorité 3. Exemple : « accepter la lecture ironique de la question 5 ».">
          <textarea value={consignes} onChange={(e) => setConsignes(e.target.value)} rows={4} className={classeInput} />
        </Champ>
        <Bouton
          disabled={enCours}
          onClick={() => surEnvoi({ sujet_texte: sujet, corrige_texte: corrige, consignes_correcteur: consignes })}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletTexte({
  bareme,
  verrouille,
  enCours,
  surEnvoi,
}: {
  bareme: Bareme;
  verrouille: boolean;
  enCours: boolean;
  surEnvoi: (questions: Question[]) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(
    bareme.questions.filter((q) => ['texte', 'comprehension', 'grammaire'].includes(q.partie)),
  );

  function maj(i: number, champs: Partial<Question>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...champs } : q)));
  }

  return (
    <Carte
      titre="Travail sur le texte — question par question"
      aide="Le barème du sujet reconstruit question par question. Une question sans élément attendu est un blocage : le moteur ne corrige pas une question sans corrigé."
      action={
        !verrouille && (
          <div className="flex gap-2">
            <Bouton
              ton="secondaire"
              onClick={() =>
                setQuestions((qs) => [
                  ...qs,
                  {
                    question_key: `q${qs.length + 1}`,
                    numero: String(qs.length + 1),
                    partie: 'comprehension',
                    libelle: '',
                    max_points: 2,
                    type_reponse: 'reponse_courte',
                    elements_attendus: [],
                    citations_attendues: [],
                    degre_justification: 'aucun',
                    reponses_equivalentes: [],
                    regles_points_partiels: [],
                    erreurs_frequentes: [],
                    competences: ['lire'],
                    codes_erreurs: [],
                    depend_de: [],
                  },
                ])
              }
            >
              + Question
            </Bouton>
            <Bouton disabled={enCours} onClick={() => surEnvoi(questions)}>
              {enCours ? 'Enregistrement…' : 'Enregistrer les questions'}
            </Bouton>
          </div>
        )
      }
    >
      {questions.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune question. Ajoute-les une par une, comme sur le sujet.</p>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.question_key} className="rounded-xl border border-gray-200 p-4 grid sm:grid-cols-2 gap-3">
              <Champ label="Identifiant stable">
                <input
                  value={q.question_key}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { question_key: e.target.value })}
                  className={classeInput}
                />
              </Champ>
              <Champ label="Numéro affiché">
                <input value={q.numero} disabled={verrouille} onChange={(e) => maj(i, { numero: e.target.value })} className={classeInput} />
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Formulation de la question">
                  <textarea value={q.libelle} disabled={verrouille} onChange={(e) => maj(i, { libelle: e.target.value })} rows={2} className={classeInput} />
                </Champ>
              </div>
              <Champ label="Points">
                <input
                  type="number"
                  step="0.5"
                  value={q.max_points}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { max_points: Number(e.target.value) })}
                  className={classeInput}
                />
              </Champ>
              <Champ
                label="Sous-partie"
                aide="Les sujets réels distinguent « Compréhension et interprétation » (32 pts) et « Grammaire et compétences linguistiques » (18 pts, réécriture comprise). Les deux composent les 50."
              >
                <select
                  value={q.partie}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { partie: e.target.value })}
                  className={classeInput}
                >
                  <option value="comprehension">Compréhension et interprétation</option>
                  <option value="grammaire">Grammaire et compétences linguistiques</option>
                  <option value="texte">Travail sur le texte (non distingué)</option>
                </select>
              </Champ>
              <Champ label="Type de réponse attendu">
                <select
                  value={q.type_reponse ?? 'reponse_courte'}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { type_reponse: e.target.value })}
                  className={classeInput}
                >
                  {TYPES_QUESTION.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Éléments attendus" aide="Un par ligne. Le moteur accepte une reformulation équivalente : ne recopie pas une phrase à imiter, écris l’idée.">
                  <textarea
                    value={q.elements_attendus.join('\n')}
                    disabled={verrouille}
                    onChange={(e) => maj(i, { elements_attendus: e.target.value.split('\n').filter(Boolean) })}
                    rows={3}
                    className={classeInput}
                  />
                </Champ>
              </div>
              <div className="sm:col-span-2">
                <Champ label="Réponses alternatives acceptées" aide="Un par ligne.">
                  <textarea
                    value={q.reponses_equivalentes.join('\n')}
                    disabled={verrouille}
                    onChange={(e) => maj(i, { reponses_equivalentes: e.target.value.split('\n').filter(Boolean) })}
                    rows={2}
                    className={classeInput}
                  />
                </Champ>
              </div>
              <Champ label="Degré de justification exigé">
                <select
                  value={q.degre_justification ?? 'aucun'}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { degre_justification: e.target.value })}
                  className={classeInput}
                >
                  <option value="aucun">Aucun</option>
                  <option value="mention">Mention du texte</option>
                  <option value="citation">Citation exigée</option>
                  <option value="citation_expliquee">Citation expliquée</option>
                </select>
              </Champ>
              <Champ label="Compétences mobilisées" aide="Obligatoire. Séparées par des virgules.">
                <input
                  value={q.competences.join(', ')}
                  disabled={verrouille}
                  onChange={(e) => maj(i, { competences: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  className={classeInput}
                  placeholder={bareme.referentiel.map((c) => c.code).join(', ')}
                />
              </Champ>
              <div className="sm:col-span-2">
                <Champ label="Règles de points partiels" aide="Format : points | condition, une par ligne. Sans elles, tout se joue en tout ou rien.">
                  <textarea
                    value={q.regles_points_partiels.map((r) => `${r.points} | ${r.condition}`).join('\n')}
                    disabled={verrouille}
                    onChange={(e) =>
                      maj(i, {
                        regles_points_partiels: e.target.value
                          .split('\n')
                          .filter(Boolean)
                          .map((l) => {
                            const [p, ...reste] = l.split('|');
                            return { points: Number(p), condition: reste.join('|').trim(), cumulable: true };
                          }),
                      })
                    }
                    rows={2}
                    className={classeInput}
                  />
                </Champ>
              </div>
              {!verrouille && (
                <div className="sm:col-span-2 text-right">
                  <button
                    onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    className="text-xs text-red-700 hover:underline"
                  >
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

function OngletReecriture({
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
  const [config, setConfig] = useState(
    bareme.reecriture.config ?? {
      max_points: 0,
      penalite_erreur_copie: null as number | null,
      plafond_erreurs_copie: null as number | null,
      consigne: '',
      bareme_du_sujet_fourni: false,
    },
  );
  const [items, setItems] = useState(bareme.reecriture.items);

  return (
    <Carte
      titre="Réécriture — forme par forme"
      aide="La note de service prévoit cinq ou dix formes modifiées, et un barème SPÉCIFIQUE pour les erreurs de pure copie. Tant que ce barème n’est pas renseigné, aucune pénalité de copie n’est appliquée : le moteur préfère ne rien retirer plutôt qu’inventer."
      action={
        !verrouille && (
          <div className="flex gap-2">
            <Bouton
              ton="secondaire"
              onClick={() =>
                setItems((xs) => [
                  ...xs,
                  { cle: `f${xs.length + 1}`, forme_originale: '', forme_attendue: '', transformation: '', points: 0.5, variantes_admises: [] },
                ])
              }
            >
              + Forme
            </Bouton>
            <Bouton
              disabled={enCours}
              onClick={() =>
                surEnvoi({
                  reecriture_config: config,
                  reecriture_items: items.map((it, i) => ({ ...it, ordre: i })),
                })
              }
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer la réécriture'}
            </Bouton>
          </div>
        )
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Champ label="Points de l’exercice" aide="Compris dans les 50 du bloc « texte ».">
          <input
            type="number"
            step="0.5"
            value={config.max_points}
            disabled={verrouille}
            onChange={(e) => setConfig({ ...config, max_points: Number(e.target.value) })}
            className={classeInput}
          />
        </Champ>
        <Champ label="Pénalité par erreur de pure copie" aide="Laisse vide si le sujet ne le précise pas : rien ne sera retiré.">
          <input
            type="number"
            step="0.25"
            value={config.penalite_erreur_copie ?? ''}
            disabled={verrouille}
            onChange={(e) =>
              setConfig({ ...config, penalite_erreur_copie: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={classeInput}
          />
        </Champ>
        <Champ label="Plafond des erreurs de copie">
          <input
            type="number"
            step="0.25"
            value={config.plafond_erreurs_copie ?? ''}
            disabled={verrouille}
            onChange={(e) =>
              setConfig({ ...config, plafond_erreurs_copie: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={classeInput}
          />
        </Champ>
        <div className="sm:col-span-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.bareme_du_sujet_fourni}
              disabled={verrouille}
              onChange={(e) => setConfig({ ...config, bareme_du_sujet_fourni: e.target.checked })}
            />
            <span>
              Le barème de réécriture vient bien du sujet ou de son corrigé.{' '}
              <span className="text-gray-500">
                Décoché, la répartition des points reste une hypothèse et la correction part en validation humaine.
              </span>
            </span>
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune forme saisie.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2">Forme d’origine</th>
              <th className="pb-2">Forme attendue</th>
              <th className="pb-2">Transformation</th>
              <th className="pb-2 w-20">Points</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.cle} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    value={it.forme_originale}
                    disabled={verrouille}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, forme_originale: e.target.value } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={it.forme_attendue}
                    disabled={verrouille}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, forme_attendue: e.target.value } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={it.transformation}
                    disabled={verrouille}
                    placeholder="passé simple → imparfait"
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, transformation: e.target.value } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.25"
                    value={it.points}
                    disabled={verrouille}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 text-right">
                  {!verrouille && (
                    <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletDictee({
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
  const [config, setConfig] = useState(
    bareme.dictee.config ?? {
      max_points: 10,
      texte_attendu: '',
      longueur_signes: null as number | null,
      plancher: 0,
      graphies_admises: [] as string[],
      source_bareme: null as string | null,
      consigne: '',
    },
  );
  const [regles, setRegles] = useState(bareme.dictee.regles);

  return (
    <Carte
      titre="Dictée — 10 points"
      aide="Aucun barème national de dictée n’existe. Sans règles de retrait propres à ce sujet, le moteur REFUSE de noter ce bloc et demande une validation humaine : il ne fabrique pas un barème universel."
      action={
        !verrouille && (
          <div className="flex gap-2">
            <Bouton
              ton="secondaire"
              onClick={() =>
                setRegles((rs) => [
                  ...rs,
                  { categorie: 'accord', sous_categorie: null, penalite: 0.5, plafond: null, cumul_repetitions: false, regle: '' },
                ])
              }
            >
              + Règle
            </Bouton>
            <Bouton
              disabled={enCours}
              onClick={() =>
                surEnvoi({
                  dictee_config: config,
                  dictee_regles: regles.map((r, i) => ({ ...r, ordre: i })),
                })
              }
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer la dictée'}
            </Bouton>
          </div>
        )
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Champ label="Points">
          <input
            type="number"
            step="0.5"
            value={config.max_points}
            disabled={verrouille}
            onChange={(e) => setConfig({ ...config, max_points: Number(e.target.value) })}
            className={classeInput}
          />
        </Champ>
        <Champ label="Plancher" aide="Note minimale du bloc. 0 par défaut.">
          <input
            type="number"
            step="0.5"
            value={config.plancher}
            disabled={verrouille}
            onChange={(e) => setConfig({ ...config, plancher: Number(e.target.value) })}
            className={classeInput}
          />
        </Champ>
        <Champ label="Provenance du barème" aide="Obligatoire : sans elle, la dictée n’est pas notée.">
          <select
            value={config.source_bareme ?? ''}
            disabled={verrouille}
            onChange={(e) => setConfig({ ...config, source_bareme: e.target.value || null })}
            className={classeInput}
          >
            <option value="">— non renseignée —</option>
            <option value="subject_bareme">Barème du sujet</option>
            <option value="official_correction">Corrigé officiel</option>
            <option value="admin_instruction">Consigne de l’administratrice</option>
          </select>
        </Champ>
        <div className="sm:col-span-3">
          <Champ
            label="Texte attendu"
            aide="Environ 600 signes en série générale. Il n’est jamais transmis au correcteur : c’est le serveur qui compare, pour que le modèle transcrive la copie et non le texte."
          >
            <textarea
              value={config.texte_attendu}
              disabled={verrouille}
              onChange={(e) => setConfig({ ...config, texte_attendu: e.target.value })}
              rows={6}
              className={classeInput}
            />
          </Champ>
          <p className="text-xs text-gray-500 mt-1">{config.texte_attendu.length} signes saisis.</p>
        </div>
        <div className="sm:col-span-3">
          <Champ label="Graphies rectifiées admises" aide="Une par ligne. Elles ne comptent alors jamais comme des fautes.">
            <textarea
              value={config.graphies_admises.join('\n')}
              disabled={verrouille}
              onChange={(e) => setConfig({ ...config, graphies_admises: e.target.value.split('\n').filter(Boolean) })}
              rows={2}
              className={classeInput}
            />
          </Champ>
        </div>
      </div>

      <p className="text-sm font-semibold text-gray-800 mb-2">Règles de retrait</p>
      {regles.length === 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Aucune règle : la dictée ne sera pas notée, et la copie partira en validation humaine.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2">Catégorie</th>
              <th className="pb-2 w-24">Pénalité</th>
              <th className="pb-2 w-24">Plafond</th>
              <th className="pb-2 w-28">Répétitions</th>
              <th className="pb-2">Règle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {regles.map((r, i) => (
              <tr key={`${r.categorie}-${i}`} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <select
                    value={r.categorie}
                    disabled={verrouille}
                    onChange={(e) => setRegles((rs) => rs.map((x, j) => (j === i ? { ...x, categorie: e.target.value } : x)))}
                    className={classeInput}
                  >
                    {CATEGORIES_DICTEE.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.25"
                    value={r.penalite}
                    disabled={verrouille}
                    onChange={(e) => setRegles((rs) => rs.map((x, j) => (j === i ? { ...x, penalite: Number(e.target.value) } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.25"
                    value={r.plafond ?? ''}
                    disabled={verrouille}
                    onChange={(e) =>
                      setRegles((rs) => rs.map((x, j) => (j === i ? { ...x, plafond: e.target.value === '' ? null : Number(e.target.value) } : x)))
                    }
                    className={classeInput}
                  />
                </td>
                <td className="py-1 pr-2 text-center">
                  <input
                    type="checkbox"
                    checked={r.cumul_repetitions}
                    disabled={verrouille}
                    onChange={(e) => setRegles((rs) => rs.map((x, j) => (j === i ? { ...x, cumul_repetitions: e.target.checked } : x)))}
                    title="Coché : une erreur répétée se paie à chaque fois."
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={r.regle}
                    disabled={verrouille}
                    onChange={(e) => setRegles((rs) => rs.map((x, j) => (j === i ? { ...x, regle: e.target.value } : x)))}
                    className={classeInput}
                  />
                </td>
                <td className="py-1 text-right">
                  {!verrouille && (
                    <button onClick={() => setRegles((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletRedaction({
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
  const [grilles, setGrilles] = useState(bareme.redaction);

  function majGrille(i: number, champs: Partial<Bareme['redaction'][number]>) {
    setGrilles((gs) => gs.map((g, j) => (j === i ? { ...g, ...champs } : g)));
  }

  return (
    <Carte
      titre="Rédaction — deux grilles distinctes"
      aide="La note de service impose deux sujets au choix : un sujet d’imagination et un sujet de réflexion. Les deux grilles sont obligatoires et ne se mélangent jamais. Les critères d’une grille doivent totaliser ses 40 points."
      action={
        !verrouille && (
          <Bouton disabled={enCours} onClick={() => surEnvoi({ redaction: grilles })}>
            {enCours ? 'Enregistrement…' : 'Enregistrer les grilles'}
          </Bouton>
        )
      }
    >
      <div className="space-y-6">
        {grilles.map((g, i) => {
          const somme = g.criteres.filter((c) => c.actif).reduce((s, c) => s + Number(c.max_points), 0);
          return (
            <div key={g.type_sujet} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-gray-900">
                  Sujet {g.type_sujet === 'imagination' ? "d’imagination" : 'de réflexion'}
                </h3>
                <Badge
                  texte={g.issue_du_sujet ? 'Grille du sujet' : 'Grille par défaut'}
                  ton={g.issue_du_sujet ? 'vert' : 'ambre'}
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-3">
                <Champ label="Intitulé du sujet">
                  <input
                    value={g.intitule}
                    disabled={verrouille}
                    onChange={(e) => majGrille(i, { intitule: e.target.value })}
                    className={classeInput}
                  />
                </Champ>
                <Champ label="Points">
                  <input
                    type="number"
                    value={g.max_points}
                    disabled={verrouille}
                    onChange={(e) => majGrille(i, { max_points: Number(e.target.value) })}
                    className={classeInput}
                  />
                </Champ>
                <Champ label="Longueur minimale annoncée" aide="En lignes.">
                  <input
                    type="number"
                    value={g.longueur_minimale ?? ''}
                    disabled={verrouille}
                    onChange={(e) => majGrille(i, { longueur_minimale: e.target.value === '' ? null : Number(e.target.value) })}
                    className={classeInput}
                  />
                </Champ>
              </div>

              <label className="flex items-center gap-2 text-sm mb-3">
                <input
                  type="checkbox"
                  checked={g.issue_du_sujet}
                  disabled={verrouille}
                  onChange={(e) => majGrille(i, { issue_du_sujet: e.target.checked })}
                />
                Cette grille vient du sujet ou de son corrigé.
              </label>

              <JaugeBloc libelle="Somme des critères actifs" saisi={somme} attendu={Number(g.max_points)} />

              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2">Critère</th>
                    <th className="pb-2 w-24">Points</th>
                    <th className="pb-2 w-28">Famille</th>
                    <th className="pb-2 w-24">Actif</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.criteres.map((c, j) => (
                    <tr key={c.code} className="border-b border-gray-100">
                      <td className="py-1 pr-2">
                        <input
                          value={c.libelle}
                          disabled={verrouille}
                          onChange={(e) =>
                            majGrille(i, {
                              criteres: g.criteres.map((x, k) => (k === j ? { ...x, libelle: e.target.value } : x)),
                            })
                          }
                          className={classeInput}
                        />
                        <code className="text-xs text-gray-400">{c.code}</code>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          step="0.5"
                          value={c.max_points}
                          disabled={verrouille}
                          onChange={(e) =>
                            majGrille(i, {
                              criteres: g.criteres.map((x, k) => (k === j ? { ...x, max_points: Number(e.target.value) } : x)),
                            })
                          }
                          className={classeInput}
                        />
                      </td>
                      <td className="py-1 pr-2 text-xs text-gray-500">{c.famille ?? '—'}</td>
                      <td className="py-1 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={c.actif}
                          disabled={verrouille}
                          onChange={(e) =>
                            majGrille(i, {
                              criteres: g.criteres.map((x, k) => (k === j ? { ...x, actif: e.target.checked } : x)),
                            })
                          }
                        />
                      </td>
                      <td className="py-1 text-right">
                        {!verrouille && (
                          <button
                            onClick={() =>
                              majGrille(i, { criteres: g.criteres.filter((_, k) => k !== j) })
                            }
                            className="text-xs text-red-700 hover:underline"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!verrouille && (
                <button
                  onClick={() => {
                    const code = prompt('Code du critère (ex. organisation_recit)');
                    if (!code) return;
                    majGrille(i, {
                      criteres: [
                        ...g.criteres,
                        { code, libelle: code.replace(/_/g, ' '), max_points: 2, famille: null, cumul_famille_autorise: false, actif: true },
                      ],
                    });
                  }}
                  className="text-sm text-teal-700 font-semibold hover:underline mt-2"
                >
                  + Critère
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Carte>
  );
}

/* ------------------------------------------------------------------ */

function OngletCalibration({ calibration }: { calibration: Calibration | null }) {
  if (!calibration) return <Carte><p className="text-sm text-gray-500">Aucune donnée de calibration.</p></Carte>;

  return (
    <div className="space-y-5">
      <Carte
        titre="Prêt pour la production ?"
        aide="La réponse reste non tant que des copies réelles notées par un professeur n’ont pas été comparées à l’IA. C’est un garde-fou, pas un feu vert automatique."
      >
        {calibration.pret.pret ? (
          <p className="text-sm text-emerald-800 font-semibold">
            ✅ Le corpus est suffisant et l’écart moyen est tenu.
          </p>
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
            Niveaux absents du corpus :{' '}
            {calibration.couverture.manquants.map((m) => `${m.libelle} (${m.plage})`).join(', ')}.
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
                  <td className="py-1 text-right">
                    {c.note_humaine ?? '—'}
                    {c.correcteurs > 1 && <span className="text-xs text-gray-400"> ({c.correcteurs})</span>}
                  </td>
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
