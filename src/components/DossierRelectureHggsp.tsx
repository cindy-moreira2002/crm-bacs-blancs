'use client';

/**
 * Dossier de relecture professeur — HGGSP session 2026.
 *
 * Remplace l'affichage générique (une longue page déroulante) par des onglets :
 * un professeur doit pouvoir se faire un avis en une demi-heure sans lire deux
 * fois les mêmes erreurs types. Tout ce qui s'affiche vient de la base, jamais
 * du code : c'est exactement le barème qui sera appliqué aux copies.
 */
import { useMemo, useState } from 'react';
import type {
  Calibration,
  CritereV2,
  EtalonV2,
  ExempleV2,
  GrilleV2,
  TaxonomieV2,
} from '@/lib/relectureHggsp';

const fr = (n: number) => n.toLocaleString('fr-FR');

const NOMS_EXERCICE: Record<string, string> = {
  hggsp_dissertation: 'HGGSP — Dissertation',
  hggsp_etude_critique: 'HGGSP — Étude critique de document(s)',
};

const NOMS_STATUT: Record<string, string> = {
  draft: 'brouillon',
  calibrating: 'en calibration',
  ready_for_validation: 'prête à valider',
  validated: 'validée par un professeur',
  locked: 'verrouillée',
  in_use: 'en service',
  archived: 'archivée',
};

const NOMS_NIVEAU: Record<string, string> = {
  nul: 'aucun élément recevable',
  insuffisant: 'insuffisant',
  fragile: 'fragile',
  moyen: 'moyen',
  satisfaisant: 'satisfaisant',
  tres_satisfaisant: 'très satisfaisant',
};

const NOMS_IMPACT: Record<string, string> = {
  informational_only: 'signalée sans perte de points',
  evidence_not_rewarded: 'ne rapporte pas les points attendus',
  contextual_range: 'fourchette indicative',
  criterion_level_cap: 'plafond de niveau',
  criterion_score_cap: 'plafond de score',
  human_review_required: 'relecture humaine',
};

const COULEURS_IMPACT: Record<string, string> = {
  informational_only: 'bg-gray-100 text-gray-700',
  evidence_not_rewarded: 'bg-sky-100 text-sky-800',
  contextual_range: 'bg-amber-100 text-amber-900',
  criterion_level_cap: 'bg-orange-100 text-orange-900',
  criterion_score_cap: 'bg-red-100 text-red-900',
  human_review_required: 'bg-violet-100 text-violet-900',
};

const NOMS_GRAVITE: Record<string, string> = {
  mineure: 'mineure',
  moderee: 'modérée',
  majeure: 'majeure',
};

const NOMS_PORTEE: Record<string, string> = {
  transversale: 'Erreurs transversales (les deux exercices)',
  dissertation: 'Erreurs propres à la dissertation',
  etude_critique: 'Erreurs propres à l’étude critique',
};

const NOMS_NIVEAU_ETALON: Record<string, string> = {
  tres_faible: 'Très faible',
  fragile: 'Fragile',
  moyen: 'Moyenne',
  assez_bon: 'Assez bonne',
  tres_bon: 'Très bonne',
  excellent: 'Excellente',
};

type Onglet =
  | 'epreuve'
  | 'dissertation'
  | 'etude_critique'
  | 'comparer'
  | 'erreurs'
  | 'etalons'
  | 'copie';

export function DossierRelectureHggsp({
  grilles,
  taxonomie,
  etalons,
  calibration,
  exemples,
}: {
  grilles: GrilleV2[];
  taxonomie: TaxonomieV2[];
  etalons: EtalonV2[];
  calibration: Calibration;
  exemples: ExempleV2[];
}) {
  const [onglet, setOnglet] = useState<Onglet>('epreuve');

  const dissertation = grilles.find((g) => g.exercise_type === 'hggsp_dissertation');
  const etudeCritique = grilles.find((g) => g.exercise_type === 'hggsp_etude_critique');

  const onglets: { cle: Onglet; libelle: string; visible: boolean }[] = [
    { cle: 'epreuve', libelle: '1 · L’épreuve et les deux notes', visible: true },
    { cle: 'dissertation', libelle: '2 · Grille dissertation', visible: Boolean(dissertation) },
    { cle: 'etude_critique', libelle: '3 · Grille étude critique', visible: Boolean(etudeCritique) },
    { cle: 'comparer', libelle: '4 · Comparer les deux grilles', visible: grilles.length > 1 },
    { cle: 'erreurs', libelle: '5 · Erreurs types et impacts', visible: taxonomie.length > 0 },
    { cle: 'etalons', libelle: '6 · Copies étalons et calibration', visible: etalons.length > 0 },
    { cle: 'copie', libelle: '7 · Une copie corrigée', visible: exemples.length > 0 },
  ];

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Sections du dossier">
        {onglets
          .filter((o) => o.visible)
          .map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              aria-current={onglet === o.cle ? 'page' : undefined}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                onglet === o.cle
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-50'
              }`}
            >
              {o.libelle}
            </button>
          ))}
      </nav>

      {onglet === 'epreuve' && <OngletEpreuve grilles={grilles} />}
      {onglet === 'dissertation' && dissertation && <BlocGrille grille={dissertation} />}
      {onglet === 'etude_critique' && etudeCritique && <BlocGrille grille={etudeCritique} />}
      {onglet === 'comparer' && <Comparaison grilles={grilles} />}
      {onglet === 'erreurs' && <BlocTaxonomie taxonomie={taxonomie} grilles={grilles} />}
      {onglet === 'etalons' && <BlocEtalons etalons={etalons} calibration={calibration} />}
      {onglet === 'copie' && <BlocCopies exemples={exemples} />}
    </div>
  );
}

/* ================================================================== */
/*  1. L'épreuve officielle et les deux échelles                      */
/* ================================================================== */

function OngletEpreuve({ grilles }: { grilles: GrilleV2[] }) {
  const total = grilles.reduce((s, g) => s + g.max_officiel, 0);
  return (
    <div className="space-y-6">
      <Carte titre="Ce que dit le texte officiel">
        <p className="text-gray-700 leading-relaxed">
          À compter de la session 2026, l’épreuve écrite de spécialité HGGSP comprend{' '}
          <strong>une dissertation notée sur 10</strong> et{' '}
          <strong>une étude critique d’un ou deux documents notée sur 10</strong>, soit un total sur{' '}
          {fr(total)}.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Note de service MENE2521923N —{' '}
          <a
            href="https://www.education.gouv.fr/bo/2025/Hebdo33/MENE2521923N"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-700 underline font-medium"
          >
            Bulletin officiel n° 33
          </a>
        </p>
      </Carte>

      <Carte titre="Pourquoi deux notes, et comment on passe de l’une à l’autre">
        <p className="text-gray-700 leading-relaxed">
          Une matière rédigée se corrige mal sur 10 : les critères tomberaient sur des huitièmes de
          point. Nous notons donc chaque exercice sur une <strong>échelle analytique interne de 20
          points</strong>, au quart de point, puis nous convertissons automatiquement :
        </p>
        <div className="mt-4 rounded-xl bg-purple-50 border border-purple-100 p-5 space-y-2 font-mono text-sm text-purple-900">
          <p>note_officielle_exercice = note_analytique_interne ÷ 2</p>
          <p>note_finale = officielle(dissertation) + officielle(étude critique)</p>
        </div>
        <p className="text-gray-700 mt-4">
          Deux notes sur 20 ne sont <strong>jamais</strong> additionnées.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-2 text-left">Format du bac blanc</th>
                <th className="px-4 py-2 text-left">Ce que voit l’élève</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">Bac blanc complet</td>
                <td className="px-4 py-3 text-gray-700">
                  Dissertation 6,75 / 10 · Étude critique 6,25 / 10 ·{' '}
                  <strong>Note finale 13 / 20</strong>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  Entraînement à un seul exercice
                </td>
                <td className="px-4 py-3 text-gray-700">
                  « Note d’entraînement à l’étude critique : 12 / 20. Équivalent dans une épreuve
                  complète : 6 / 10. »
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Carte>

      <Carte titre="Comment la note est construite">
        <p className="text-gray-700 leading-relaxed">
          La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque
          score doit être justifié par des éléments localisables dans la copie. Le jugement du
          correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et
          calibré.
        </p>
        <p className="text-gray-700 mt-3 leading-relaxed">
          La note est la <strong>somme des réussites observées</strong> critère par critère. On ne
          part jamais de 20 pour retrancher les erreurs : les erreurs types servent à expliquer
          pourquoi un niveau supérieur n’est pas atteint.
        </p>
        {grilles[0] && (
          <div className="mt-4">
            <h4 className="font-bold text-gray-900 mb-2">Garde-fous imposés au correcteur</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {grilles[0].garde_fous.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </Carte>
    </div>
  );
}

/* ================================================================== */
/*  2 et 3. Une grille, critère par critère                           */
/* ================================================================== */

function BlocGrille({ grille }: { grille: GrilleV2 }) {
  const total = grille.criteres.reduce((s, c) => s + c.max_points, 0);
  return (
    <div className="space-y-5">
      <Carte titre={NOMS_EXERCICE[grille.exercise_type] ?? grille.libelle}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pastille>version {grille.version}</Pastille>
          <Pastille>échelle analytique {fr(total)} points</Pastille>
          <Pastille>note officielle {fr(grille.max_officiel)} points</Pastille>
          <span
            className={`px-2.5 py-0.5 rounded-full font-medium ${
              ['in_use', 'locked'].includes(grille.statut)
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {NOMS_STATUT[grille.statut] ?? grille.statut}
          </span>
        </div>
        <p className="text-gray-700 mt-4 leading-relaxed">{grille.principe}</p>
      </Carte>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 uppercase text-xs tracking-wide">
              <th className="pb-2">Critère</th>
              <th className="pb-2 text-right w-24">Maximum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grille.criteres.map((c) => (
              <tr key={c.code}>
                <td className="py-2 font-semibold text-gray-900">{c.libelle}</td>
                <td className="py-2 text-right font-bold text-purple-700">{fr(c.max_points)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200">
              <td className="py-2 font-bold text-gray-900">Total</td>
              <td className="py-2 text-right font-bold text-gray-900">{fr(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {grille.criteres.map((c) => (
        <AccordeonCritere key={c.code} critere={c} />
      ))}

      {grille.system_prompt && (
        <details className="rounded-2xl border border-gray-200 bg-white shadow">
          <summary className="cursor-pointer px-6 py-4 font-semibold text-gray-800 select-none">
            Lire la consigne exacte donnée au correcteur ({grille.system_prompt.length} caractères)
          </summary>
          <p className="px-6 pb-6 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {grille.system_prompt}
          </p>
        </details>
      )}
    </div>
  );
}

function AccordeonCritere({ critere }: { critere: CritereV2 }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="w-full px-6 py-4 flex items-baseline justify-between gap-3 text-left hover:bg-gray-50"
      >
        <span>
          <span className="font-bold text-gray-900">{critere.libelle}</span>
          <span className="block text-xs uppercase tracking-wide text-gray-400 mt-0.5">
            {critere.code}
          </span>
        </span>
        <span className="flex items-center gap-3 whitespace-nowrap">
          <span className="font-bold text-purple-700">{fr(critere.max_points)} pts</span>
          <span className="text-gray-400">{ouvert ? '▲' : '▼'}</span>
        </span>
      </button>

      {ouvert && (
        <div className="px-6 pb-6 space-y-4">
          <div>
            <h5 className="text-sm font-bold text-gray-900 mb-1">Ce que le correcteur évalue</h5>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
              {critere.evaluer.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="text-sm font-bold text-gray-900 mb-1">
              Descripteurs (le score se place au quart de point à l’intérieur du palier)
            </h5>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {critere.paliers.map((p) => (
                    <tr key={p.points}>
                      <td className="px-4 py-2 w-24 align-top font-bold text-gray-900 whitespace-nowrap">
                        {fr(p.points)} pt{p.points >= 2 ? 's' : ''}
                      </td>
                      <td className="px-4 py-2 w-32 align-top text-xs uppercase tracking-wide text-purple-700">
                        {NOMS_NIVEAU[p.niveau] ?? p.niveau}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  4. Comparaison des deux grilles                                   */
/* ================================================================== */

function Comparaison({ grilles }: { grilles: GrilleV2[] }) {
  const lignes = useMemo(() => {
    const max = Math.max(...grilles.map((g) => g.criteres.length));
    return Array.from({ length: max }, (_, i) => grilles.map((g) => g.criteres[i] ?? null));
  }, [grilles]);

  return (
    <Carte titre="Les deux grilles côte à côte">
      <p className="text-gray-700 mb-4">
        Les deux exercices ne se corrigent pas de la même façon : seule l’expression écrite leur est
        commune. En étude critique, <strong>prélever</strong>, <strong>expliquer</strong> et{' '}
        <strong>critiquer</strong> sont trois critères distincts — un prélèvement exact est valorisé
        même quand la critique manque.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              {grilles.map((g) => (
                <th key={g.id} className="px-4 py-3 text-left font-bold text-gray-900">
                  {NOMS_EXERCICE[g.exercise_type] ?? g.libelle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((ligne, i) => (
              <tr key={i}>
                {ligne.map((c, j) => (
                  <td key={j} className="px-4 py-3 align-top">
                    {c ? (
                      <>
                        <span className="font-semibold text-gray-900">{c.libelle}</span>
                        <span className="ml-2 font-bold text-purple-700">{fr(c.max_points)}</span>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold">
              {grilles.map((g) => (
                <td key={g.id} className="px-4 py-3 text-gray-900">
                  Total {fr(g.criteres.reduce((s, c) => s + c.max_points, 0))} · officiel{' '}
                  {fr(g.max_officiel)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Carte>
  );
}

/* ================================================================== */
/*  5. Taxonomie filtrable                                            */
/* ================================================================== */

function BlocTaxonomie({ taxonomie, grilles }: { taxonomie: TaxonomieV2[]; grilles: GrilleV2[] }) {
  const [exercice, setExercice] = useState<string>('hggsp_etude_critique');
  const [impact, setImpact] = useState<string>('tous');
  const [critere, setCritere] = useState<string>('tous');
  const [recherche, setRecherche] = useState('');

  const grille = grilles.find((g) => g.exercise_type === exercice);
  const nomCritere = useMemo(
    () => new Map((grille?.criteres ?? []).map((c) => [c.code, c.libelle])),
    [grille],
  );

  const visibles = useMemo(() => {
    const portee = exercice === 'hggsp_dissertation' ? 'dissertation' : 'etude_critique';
    const q = recherche.trim().toLowerCase();
    return taxonomie
      .filter((e) => e.portee === 'transversale' || e.portee === portee)
      .filter((e) => impact === 'tous' || e.type_impact === impact)
      .filter((e) => critere === 'tous' || e.critere_principal[exercice] === critere)
      .filter(
        (e) =>
          !q ||
          e.code.toLowerCase().includes(q) ||
          e.libelle.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q),
      );
  }, [taxonomie, exercice, impact, critere, recherche]);

  const parPortee = useMemo(() => {
    const m = new Map<string, TaxonomieV2[]>();
    for (const e of visibles) {
      const l = m.get(e.portee) ?? [];
      l.push(e);
      m.set(e.portee, l);
    }
    // Les erreurs transversales d'abord : elles valent pour les deux exercices.
    return [...m.entries()].sort((a) => (a[0] === 'transversale' ? -1 : 1));
  }, [visibles]);

  return (
    <div className="space-y-5">
      <Carte titre="Ce qu’une erreur type fait — et ne fait pas — à la note">
        <p className="text-gray-700 leading-relaxed">
          Une erreur type n’est pas une soustraction. Seuls deux impacts agissent mécaniquement sur
          le score : le <strong>plafond de score</strong> et le <strong>plafond de niveau</strong>.
          Les autres décrivent pourquoi des points n’ont pas été donnés.
        </p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
          {Object.entries(NOMS_IMPACT).map(([code, libelle]) => (
            <li key={code} className="flex items-start gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COULEURS_IMPACT[code]}`}>
                {code}
              </span>
              <span className="text-gray-700">{libelle}</span>
            </li>
          ))}
        </ul>
        <p className="text-gray-700 mt-4 leading-relaxed">
          <strong>Pas de double sanction :</strong> chaque faiblesse est comptée dans un seul
          critère. Une erreur déclarée conséquence d’une autre est décrite, jamais plafonnée une
          deuxième fois. Exemple : l’absence de problématique est comptée dans « Analyse du sujet »,
          et l’argumentation reste évaluée sur son organisation réellement observable.
        </p>
      </Carte>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <Filtre label="Exercice" valeur={exercice} onChange={setExercice}>
            {grilles.map((g) => (
              <option key={g.exercise_type} value={g.exercise_type}>
                {NOMS_EXERCICE[g.exercise_type] ?? g.libelle}
              </option>
            ))}
          </Filtre>
          <Filtre label="Type d’impact" valeur={impact} onChange={setImpact}>
            <option value="tous">Tous</option>
            {Object.entries(NOMS_IMPACT).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </Filtre>
          <Filtre label="Critère affecté" valeur={critere} onChange={setCritere}>
            <option value="tous">Tous</option>
            {(grille?.criteres ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.libelle}
              </option>
            ))}
          </Filtre>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Rechercher
            </span>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="paraphrase, plan, exemple…"
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </label>
        </div>
        <p className="text-sm text-gray-500">
          {visibles.length} code{visibles.length > 1 ? 's' : ''} affiché
          {visibles.length > 1 ? 's' : ''} sur {taxonomie.length}.
        </p>
      </div>

      {parPortee.map(([portee, entrees]) => (
        <div key={portee} className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">{NOMS_PORTEE[portee] ?? portee}</h3>
          {entrees.map((e) => (
            <LigneErreur key={e.code} erreur={e} exercice={exercice} nomCritere={nomCritere} />
          ))}
        </div>
      ))}
    </div>
  );
}

function LigneErreur({
  erreur,
  exercice,
  nomCritere,
}: {
  erreur: TaxonomieV2;
  exercice: string;
  nomCritere: Map<string, string>;
}) {
  const critere = erreur.critere_principal[exercice];
  const regle =
    erreur.type_impact === 'criterion_score_cap'
      ? `score plafonné à ${fr(erreur.plafond_score ?? 0)}`
      : erreur.type_impact === 'criterion_level_cap'
        ? `niveau plafonné à « ${NOMS_NIVEAU[erreur.plafond_niveau ?? ''] ?? erreur.plafond_niveau} »`
        : erreur.type_impact === 'contextual_range'
          ? `fourchette indicative de ${fr(erreur.impact_min ?? 0)} à ${fr(erreur.impact_max ?? 0)} point(s)`
          : NOMS_IMPACT[erreur.type_impact];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-gray-900">
          <code className="text-purple-700">{erreur.code}</code> — {erreur.libelle}
        </p>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${COULEURS_IMPACT[erreur.type_impact]}`}
        >
          {regle}
        </span>
      </div>
      <p className="text-gray-700 mt-2 text-sm">{erreur.description}</p>
      <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Ligne terme="Critère affecté">
          {critere ? (nomCritere.get(critere) ?? critere) : 'aucun (incident, pas une faute)'}
        </Ligne>
        <Ligne terme="Gravité pédagogique">{NOMS_GRAVITE[erreur.gravite] ?? erreur.gravite}</Ligne>
        {erreur.conditions && <Ligne terme="Conditions">{erreur.conditions}</Ligne>}
        <Ligne terme="Pas de double sanction">{erreur.regle_non_double_sanction}</Ligne>
        <Ligne terme="Message à l’élève">« {erreur.message_pedagogique} »</Ligne>
        {erreur.relecture_humaine && (
          <Ligne terme="Relecture humaine">déclenchée systématiquement</Ligne>
        )}
      </dl>
    </div>
  );
}

/* ================================================================== */
/*  6. Copies étalons et calibration                                  */
/* ================================================================== */

function BlocEtalons({ etalons, calibration }: { etalons: EtalonV2[]; calibration: Calibration }) {
  const [exercice, setExercice] = useState<string>('hggsp_etude_critique');
  const visibles = etalons.filter((e) => e.exercise_type === exercice);
  const sujets = [...new Set(visibles.map((e) => e.subject_id))];
  const [sujet, setSujet] = useState<string>('tous');
  const liste = visibles.filter((e) => sujet === 'tous' || e.subject_id === sujet);

  return (
    <div className="space-y-5">
      <Carte titre="À quoi servent les copies étalons">
        <p className="text-gray-700 leading-relaxed">
          Une copie étalon est corrigée par un ou plusieurs professeurs, puis par le système, avec la{' '}
          <strong>même version de grille</strong>. On compare, on ajuste la grille, on recommence.
          Les étalons servent à <strong>calibrer la grille avant l’ouverture des corrections</strong>{' '}
          — jamais à modifier la note d’un élève parce que sa copie « ressemble » à une autre.
        </p>
        <div className="mt-4 grid sm:grid-cols-4 gap-3">
          <Chiffre valeur={calibration.etalons} libelle="copies étalons" />
          <Chiffre valeur={calibration.etalons_valides} libelle="validées par un prof" alerte={calibration.etalons_valides === 0} />
          <Chiffre valeur={calibration.corrections_humaines} libelle="corrections humaines" alerte={calibration.corrections_humaines === 0} />
          <Chiffre valeur={calibration.corrections_ia} libelle="corrections du système" />
        </div>
        {calibration.corrections_humaines === 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Nous ne présentons pas ce barème comme validé.</strong> Aucune copie étalon n’a
            encore été corrigée à la fois par un professeur et par le système : les profils ci-dessous
            sont des repères de calibration provisoires, pas de vraies copies notées. C’est
            exactement ce que nous vous demandons de contrôler.
          </p>
        )}
        {calibration.niveaux_manquants.length > 0 && (
          <p className="mt-3 text-sm text-gray-600">
            Niveaux sans étalon :{' '}
            {calibration.niveaux_manquants.map((n) => NOMS_NIVEAU_ETALON[n] ?? n).join(', ')}.
          </p>
        )}
      </Carte>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Filtre label="Exercice" valeur={exercice} onChange={setExercice}>
            <option value="hggsp_etude_critique">HGGSP — Étude critique de document(s)</option>
            <option value="hggsp_dissertation">HGGSP — Dissertation</option>
          </Filtre>
          <Filtre label="Sujet" valeur={sujet} onChange={setSujet}>
            <option value="tous">Tous les sujets</option>
            {sujets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Filtre>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2">Niveau</th>
                <th className="py-2">Sujet</th>
                <th className="py-2 text-right">Analytique</th>
                <th className="py-2 text-right">Officielle</th>
                <th className="py-2">Ce que fait la copie</th>
                <th className="py-2">Corrections humaines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liste.map((e) => (
                <tr key={e.id}>
                  <td className="py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {NOMS_NIVEAU_ETALON[e.niveau] ?? e.niveau}
                    {e.frontiere && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs">
                        frontière
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">{e.subject_id}</td>
                  <td className="py-3 text-right font-bold text-purple-700 whitespace-nowrap">
                    {fr(e.note_analytique)} / 20
                  </td>
                  <td className="py-3 text-right text-gray-700 whitespace-nowrap">
                    {fr(e.note_officielle)} / 10
                  </td>
                  <td className="py-3 text-gray-700">{e.description}</td>
                  <td className="py-3 text-center">
                    {e.corrections_humaines > 0 ? (
                      e.corrections_humaines
                    ) : (
                      <span className="text-amber-700 font-medium">aucune</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  7. Une copie réellement corrigée                                  */
/* ================================================================== */

function BlocCopies({ exemples }: { exemples: ExempleV2[] }) {
  const [i, setI] = useState(0);
  const e = exemples[i];
  if (!e) return null;

  return (
    <div className="space-y-5">
      {exemples.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {exemples.map((x, j) => (
            <button
              key={x.correctionId}
              type="button"
              onClick={() => setI(j)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                i === j ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-300'
              }`}
            >
              {NOMS_EXERCICE[x.exerciseType] ?? x.exerciseType}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {NOMS_EXERCICE[e.exerciseType] ?? e.exerciseType} — copie anonymisée
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Corrigée telle quelle par le système, sans retouche pour ce dossier.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-purple-700">
              {fr(e.analytique)}
              <span className="text-lg text-gray-500 font-medium"> / {fr(e.analytiqueMax)}</span>
            </p>
            <p className="text-sm text-gray-600">
              soit <strong>{fr(e.officiel)} / {fr(e.officielMax)}</strong> à l’échelle officielle
            </p>
          </div>
        </div>

        {e.ancienne && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <strong>Comparaison avec l’ancienne grille :</strong> le même devoir obtenait{' '}
            {fr(e.ancienne.note)} / {fr(e.ancienne.bareme)}, parce que le prélèvement d’informations
            exactes n’avait pas de critère à lui — il était noyé dans « critique du document », resté
            à 0,5 / 6. La nouvelle grille paie le prélèvement et maintient la critique au plus bas.
          </div>
        )}

        {e.pages.length > 0 && (
          <details className="rounded-xl border border-gray-200 bg-gray-50">
            <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-800 select-none">
              Lire la copie de l’élève ({e.pages.length} page{e.pages.length > 1 ? 's' : ''})
            </summary>
            <div className="px-5 pb-5 space-y-4">
              {e.pages.map((p, j) => (
                <p key={j} className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
                  {p}
                </p>
              ))}
            </div>
          </details>
        )}

        <div className="space-y-4">
          {e.criteres.map((c) => (
            <div key={c.criterion_id} className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="font-bold text-gray-900">{c.libelle}</h4>
                <p className="font-bold text-purple-700 whitespace-nowrap">
                  {fr(c.score)} <span className="text-gray-400 font-medium">/ {fr(c.max_score)}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-gray-500">
                    {NOMS_NIVEAU[c.level] ?? c.level}
                  </span>
                </p>
              </div>
              {typeof c.score_avant_plafond === 'number' && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                  Score ramené de {fr(c.score_avant_plafond)} à {fr(c.score)} par le plafond{' '}
                  {(c.plafonne_par ?? []).join(', ')}.
                </p>
              )}
              <p className="text-gray-700 mt-2 leading-relaxed">{c.feedback}</p>
              {c.evidence.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {c.evidence.map((p, j) => (
                    <li key={j} className="text-sm border-l-4 border-purple-200 pl-3">
                      <p className="italic text-gray-800">« {p.citation} »</p>
                      {p.explication && <p className="text-gray-600 mt-0.5">{p.explication}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {e.erreurs.length > 0 && (
          <div>
            <h4 className="font-bold text-gray-900 mb-2">
              Erreurs types signalées, et ce qu’elles ont fait à la note
            </h4>
            <ul className="space-y-2">
              {e.erreurs.map((x, j) => (
                <li key={j} className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                  <p>
                    <code className="font-bold text-amber-900">{x.taxonomy_code}</code> — {x.libelle}
                    <span
                      className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${COULEURS_IMPACT[x.impact_type]}`}
                    >
                      {NOMS_IMPACT[x.impact_type] ?? x.impact_type}
                    </span>
                  </p>
                  <p className="text-gray-700 mt-1">{x.scoring_effect}</p>
                  {x.is_consequence && (
                    <p className="text-gray-600 mt-1">
                      Déclarée conséquence{x.source_error_id ? ` de ${x.source_error_id}` : ''} : non
                      recomptée.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {e.forces.length > 0 && (
            <ListePastille titre="Points forts relevés" items={e.forces} couleur="emerald" />
          )}
          {e.priorites.length > 0 && (
            <ListePastille titre="Priorités données à l’élève" items={e.priorites} couleur="purple" />
          )}
        </div>

        {e.appreciation && (
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-5">
            <h4 className="font-bold text-gray-900 mb-1">Appréciation générale</h4>
            <p className="text-gray-700 leading-relaxed">{e.appreciation}</p>
          </div>
        )}

        {e.controles && (
          <div>
            <h4 className="font-bold text-gray-900 mb-2">Contrôles automatiques de cohérence</h4>
            <ul className="grid sm:grid-cols-2 gap-1 text-sm">
              {Object.entries(e.controles)
                .filter((entree): entree is [string, boolean] => typeof entree[1] === 'boolean')
                .map(([cle, v]) => (
                  <li key={cle} className="flex items-center gap-2">
                    <span className={v ? 'text-emerald-600' : 'text-red-600'}>{v ? '✓' : '✗'}</span>
                    <span className="text-gray-700">{NOMS_CONTROLE[cle] ?? cle}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {e.motifsRelecture.length > 0 && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
            <h4 className="font-bold text-gray-900 mb-2">Relecture humaine demandée</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {e.motifsRelecture.map((m, j) => (
                <li key={j}>{m.message}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-gray-600">
          L’élève ne voit pas ce détail brut : il reçoit un dossier pédagogique rédigé, et tant que la
          grille n’est pas validée par des professeurs, sa note lui est présentée{' '}
          <strong>en fourchette</strong>.{' '}
          <a
            href={`/dossier/${e.correctionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-700 font-semibold underline"
          >
            Ouvrir le dossier tel que l’élève le reçoit
          </a>
        </p>
      </div>
    </div>
  );
}

const NOMS_CONTROLE: Record<string, string> = {
  score_sum_valid: 'la somme des critères fait exactement la note',
  conversion_valid: 'la conversion sur 10 est exacte',
  step_valid: 'tous les scores sont au quart de point',
  no_double_penalty: 'aucune faiblesse comptée deux fois',
  evidence_verified: 'toutes les citations existent dans la copie',
  feedback_consistent: 'appréciation et scores concordent',
  taxonomy_valid: 'tous les codes d’erreur sont connus',
};

/* ================================================================== */
/*  Briques de présentation                                           */
/* ================================================================== */

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
      <h3 className="text-xl font-bold text-gray-900 mb-3">{titre}</h3>
      {children}
    </div>
  );
}

function Pastille({ children }: { children: React.ReactNode }) {
  return <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{children}</span>;
}

function Ligne({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-gray-800 inline">{terme} : </dt>
      <dd className="text-gray-700 inline">{children}</dd>
    </div>
  );
}

function Chiffre({ valeur, libelle, alerte }: { valeur: number; libelle: string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alerte ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
      <p className={`text-2xl font-bold ${alerte ? 'text-amber-800' : 'text-gray-900'}`}>{valeur}</p>
      <p className="text-sm text-gray-600">{libelle}</p>
    </div>
  );
}

function Filtre({
  label,
  valeur,
  onChange,
  children,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {children}
      </select>
    </label>
  );
}

function ListePastille({
  titre,
  items,
  couleur,
}: {
  titre: string;
  items: string[];
  couleur: 'emerald' | 'purple';
}) {
  const classes =
    couleur === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-purple-50 border-purple-100';
  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <h4 className="font-bold text-gray-900 mb-2">{titre}</h4>
      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
