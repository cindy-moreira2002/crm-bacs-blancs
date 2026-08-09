'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Bouton,
  Carte,
  EnteteBrevet,
  JaugeBloc,
  Message,
  Onglets,
  Provenance,
  Retouche,
  Validations,
} from '../../../ui';

/**
 * Écran de correction d'une copie de MATHÉMATIQUES au brevet.
 *
 * Quatre onglets : Automatismes, Exercices, Qualité de la rédaction, Synthèse.
 * Les erreurs en cascade sont montrées explicitement : quand une question
 * réutilise correctement un résultat faux, l'écran le dit et affiche la
 * question source — c'est ce qui permet de vérifier qu'une erreur n'a pas été
 * payée deux fois.
 */

type Question = {
  question_key: string;
  points: number;
  points_humain: number | null;
  max_points: number;
  bloc: string | null;
  partie: string | null;
  statut_reponse: string | null;
  source_regle: string | null;
  nature_decision: string | null;
  certitude: number | null;
  elements_observes: string[];
  elements_manquants: string[];
  erreurs: { code: string; citation: string | null }[];
  preuves: { page: number | null; citation: string; explication: string }[];
  motifs_relecture: { message: string }[];
  depends_on_question: string | null;
  inherited_value: string | null;
  cascade_error: boolean;
  method_valid_from_student_value: boolean;
  cascade_penalty_applied: boolean;
  methode_alternative: boolean;
};

type Automatisme = {
  item_key: string;
  numero: string;
  notion: string | null;
  competence: string | null;
  reponse_attendue: string | null;
  reponse_eleve: string | null;
  statut: string;
  points: number;
  points_humain: number | null;
  max_points: number;
  justification: string | null;
  certitude: number | null;
};

type Qualite = {
  code: string;
  libelle: string;
  score: number;
  max_points: number;
  observation: string | null;
  neutralise: boolean;
};

type Detail = {
  correction: {
    id: string;
    status: string;
    score_raw: number | null;
    score_validated: number | null;
    max_score: number | null;
    validee_par: string | null;
    result_json: {
      score?: {
        automatismes?: { score: number; max: number };
        reasoning_and_problem_solving?: { score: number; max: number; writing_quality_included: { score: number; max: number } };
        score_out_of_20?: number;
      };
      competency_profile?: Record<string, string>;
      cascades?: { question_key: string; source: string; valeur_heritee: string | null; points_preserves: number }[];
      student_feedback?: {
        reussites: string[];
        priorites: string[];
        erreurs_expliquees: { titre: string; explication: string; conseil: string }[];
        a_retravailler: string[];
        strategie: string;
        avertissement_lisibilite: string | null;
      };
    } | null;
  };
  examen: { titre: string } | null;
  questions: Question[];
  automatismes: Automatisme[];
  qualiteRedaction: Qualite[];
  documentQualite: { statut: string; anomalies: { code: string; detail: string }[] } | null;
  validations: { id: string; code_motif: string; motif: string; degre: string; statut: string }[];
  modifications: { id: number; cible_type: string; cible_cle: string; valeur_ia: number | null; valeur_humaine: number; correcteur: string; motif: string; impact_note: number; cree_le: string }[];
};

export function CorrectionMaths({ correctionId }: { correctionId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [onglet, setOnglet] = useState('automatismes');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/brevet/mathematiques/copies/${correctionId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
      setDetail(j);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, [correctionId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void charger();
    }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const agir = useCallback(
    async (corps: Record<string, unknown>, message: string) => {
      try {
        const r = await fetch(`/api/admin/brevet/mathematiques/copies/${correctionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Action impossible');
        if (j.ok === false && j.raison) throw new Error(j.raison);
        setSucces(message);
        setErreur(null);
        await charger();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    },
    [correctionId, charger],
  );

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <Message texte={erreur} ton="erreur" />
          {!erreur && <p className="text-gray-500">Chargement…</p>}
        </div>
      </div>
    );
  }

  const c = detail.correction;
  const score = c.result_json?.score;
  const ouvertes = detail.validations.filter((v) => v.statut === 'ouverte');
  const bloquantes = ouvertes.filter((v) => v.degre === 'bloquante').length;
  const questionsP2 = detail.questions.filter((q) => q.partie === 'raisonnement');
  const cascades = c.result_json?.cascades ?? [];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere="brevet_mathematiques"
          titre={detail.examen?.titre ?? 'Copie de mathématiques'}
          fil={[
            { href: '/admin/brevet', texte: 'Brevet' },
            { href: '/admin/brevet/mathematiques', texte: 'Mathématiques' },
            { href: '/admin/brevet/mathematiques/copies', texte: 'Copies' },
          ]}
          soustitre={
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold text-gray-900">
                {score?.score_out_of_20 ?? c.score_validated ?? '—'} / 20
              </span>
              {score && (
                <span className="text-sm text-gray-600">
                  automatismes {score.automatismes?.score} / {score.automatismes?.max} · partie 2{' '}
                  {score.reasoning_and_problem_solving?.score} / {score.reasoning_and_problem_solving?.max}{' '}
                  (dont rédaction {score.reasoning_and_problem_solving?.writing_quality_included.score} /{' '}
                  {score.reasoning_and_problem_solving?.writing_quality_included.max})
                </span>
              )}
              {c.validee_par && <Badge texte={`Validée par ${c.validee_par}`} ton="vert" />}
            </div>
          }
          actions={
            <Bouton
              disabled={bloquantes > 0 || Boolean(c.validee_par)}
              titre={bloquantes > 0 ? `${bloquantes} validation(s) obligatoire(s) restent ouvertes.` : undefined}
              onClick={() => agir({ action: 'valider' }, 'Correction validée.')}
            >
              Valider la note
            </Bouton>
          }
        />

        <Message texte={erreur} ton="erreur" />
        <Message texte={succes} ton="succes" />

        {detail.documentQualite && detail.documentQualite.statut !== 'readable' && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold mb-1">Qualité documentaire : {detail.documentQualite.statut}</p>
            <ul className="list-disc pl-5 space-y-1">
              {detail.documentQualite.anomalies.map((a, i) => (
                <li key={i}>
                  <code className="text-xs">{a.code}</code> — {a.detail}
                </li>
              ))}
            </ul>
            <p className="mt-2 italic">Une écriture illisible n’est jamais comptée comme une erreur.</p>
          </div>
        )}

        {cascades.length > 0 && (
          <Carte
            titre="Erreurs en cascade"
            aide="L’élève a réutilisé correctement un résultat faux obtenu plus haut. Les points de méthode restent acquis : l’erreur initiale ne se paie qu’une fois."
          >
            <ul className="text-sm text-gray-700 space-y-1">
              {cascades.map((c2, i) => (
                <li key={i}>
                  <code>{c2.question_key}</code> reprend <code>{c2.source}</code>
                  {c2.valeur_heritee && <> avec la valeur {c2.valeur_heritee}</>} —{' '}
                  <strong>{c2.points_preserves} point(s) préservés</strong>.
                </li>
              ))}
            </ul>
          </Carte>
        )}

        <Onglets
          actif={onglet}
          surChangement={setOnglet}
          onglets={[
            { code: 'automatismes', libelle: 'Automatismes' },
            { code: 'exercices', libelle: 'Exercices' },
            { code: 'qualite', libelle: 'Qualité de la rédaction' },
            { code: 'synthese', libelle: 'Synthèse', pastille: ouvertes.length || undefined },
          ]}
        />

        {onglet === 'automatismes' && (
          <Carte
            titre="Partie 1 — Automatismes"
            aide="Sans calculatrice. Une réponse juste écrite sous une autre forme correcte reste juste : l’absence de calculatrice n’autorise aucun retrait."
          >
            {detail.automatismes.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun automatisme enregistré.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2">N°</th>
                    <th className="pb-2">Notion</th>
                    <th className="pb-2">Attendu</th>
                    <th className="pb-2">Réponse de l’élève</th>
                    <th className="pb-2">Statut</th>
                    <th className="pb-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.automatismes.map((a) => (
                    <tr key={a.item_key} className="border-b border-gray-100">
                      <td className="py-2 font-semibold">{a.numero}</td>
                      <td className="py-2">{a.notion}</td>
                      <td className="py-2 font-mono text-xs text-gray-600">{a.reponse_attendue}</td>
                      <td className="py-2 font-mono text-xs">{a.reponse_eleve || '—'}</td>
                      <td className="py-2">
                        <Badge texte={a.statut.replace(/_/g, ' ')} ton={STATUT_AUTO[a.statut] ?? 'gris'} />
                        {a.justification && <p className="text-xs text-gray-500 mt-1">{a.justification}</p>}
                      </td>
                      <td className="py-2 text-right">
                        <span className="font-bold">{a.points_humain ?? a.points}</span> / {a.max_points}
                        <Retouche
                          valeurIa={a.points}
                          max={a.max_points}
                          surEnvoi={(valeur, motif) =>
                            agir(
                              { action: 'retoucher', cible_type: 'automatisme', cible_cle: a.item_key, valeur, motif },
                              'Item retouché.',
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>
        )}

        {onglet === 'exercices' && (
          <Carte
            titre={`Partie 2 — ${questionsP2.length} question(s)`}
            aide="Les étapes valorisées apparaissent en vert : ce sont elles qui font compter les démarches engagées, même non abouties."
          >
            <div className="space-y-4">
              {questionsP2.map((q) => (
                <LigneQuestionMaths key={q.question_key} q={q} agir={agir} />
              ))}
            </div>
          </Carte>
        )}

        {onglet === 'qualite' && (
          <Carte
            titre="Qualité de la rédaction — comprise dans les 14"
            aide="Un critère neutralisé l’est parce que la même faiblesse est déjà sanctionnée question par question : la double pénalisation est évitée."
          >
            {score?.reasoning_and_problem_solving && (
              <div className="mb-4">
                <JaugeBloc
                  libelle="Points de rédaction"
                  saisi={score.reasoning_and_problem_solving.writing_quality_included.score}
                  attendu={score.reasoning_and_problem_solving.writing_quality_included.max}
                />
              </div>
            )}
            {detail.qualiteRedaction.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun élément de qualité rédactionnelle.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2">Point de contrôle</th>
                    <th className="pb-2">Observation</th>
                    <th className="pb-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.qualiteRedaction.map((c2) => (
                    <tr key={c2.code} className={`border-b border-gray-100 ${c2.neutralise ? 'bg-sky-50' : ''}`}>
                      <td className="py-2">
                        {c2.libelle}
                        {c2.neutralise && (
                          <span className="ml-2">
                            <Badge texte="Neutralisé" ton="bleu" />
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-gray-600">{c2.observation}</td>
                      <td className="py-2 text-right font-bold">
                        {c2.score} / {c2.max_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>
        )}

        {onglet === 'synthese' && (
          <div className="space-y-5">
            {c.result_json?.competency_profile && (
              <Carte
                titre="Profil de compétences"
                aide="Diagnostic pédagogique, construit APRÈS la note et à partir d’elle. Il ne modifie jamais la note."
              >
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  {Object.entries(c.result_json.competency_profile).map(([comp, niveau]) => (
                    <div key={comp} className="rounded-lg border border-gray-200 p-2">
                      <p className="font-semibold text-gray-900 capitalize">{comp}</p>
                      <Badge texte={String(niveau).replace(/_/g, ' ')} ton={TON_NIVEAU[String(niveau)] ?? 'gris'} />
                    </div>
                  ))}
                </div>
              </Carte>
            )}

            <Carte titre="Validations humaines">
              <Validations
                validations={detail.validations}
                surTraitement={(id, decision) =>
                  agir(
                    { action: 'traiter_validation', validation_id: id, decision, commentaire: '' },
                    'Validation traitée.',
                  )
                }
              />
            </Carte>

            {c.result_json?.student_feedback && (
              <Carte titre="Rapport élève">
                {c.result_json.student_feedback.avertissement_lisibilite && (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mb-3">
                    {c.result_json.student_feedback.avertissement_lisibilite}
                  </p>
                )}
                <p className="text-sm font-semibold text-gray-800">Ce qui a marché</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 mb-3">
                  {c.result_json.student_feedback.reussites.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <p className="text-sm font-semibold text-gray-800">À travailler en priorité</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 mb-3">
                  {c.result_json.student_feedback.priorites.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {c.result_json.student_feedback.strategie && (
                  <p className="text-sm text-gray-700">
                    <strong>Pour le prochain brevet blanc :</strong> {c.result_json.student_feedback.strategie}
                  </p>
                )}
              </Carte>
            )}

            <Carte
              titre="Historique des retouches"
              aide="Rien ne s’efface : chaque modification conserve la valeur proposée par l’IA, son auteur, sa date, son motif et son impact."
            >
              {detail.modifications.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune retouche humaine sur cette copie.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="pb-2">Quand</th>
                      <th className="pb-2">Où</th>
                      <th className="pb-2 text-right">IA</th>
                      <th className="pb-2 text-right">Humain</th>
                      <th className="pb-2 text-right">Impact</th>
                      <th className="pb-2">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.modifications.map((m) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="py-1 text-xs text-gray-500">{new Date(m.cree_le).toLocaleString('fr-FR')}</td>
                        <td className="py-1">
                          {m.cible_type} · <code className="text-xs">{m.cible_cle}</code>
                        </td>
                        <td className="py-1 text-right">{m.valeur_ia ?? '—'}</td>
                        <td className="py-1 text-right font-bold">{m.valeur_humaine}</td>
                        <td className="py-1 text-right">{m.impact_note > 0 ? `+${m.impact_note}` : m.impact_note}</td>
                        <td className="py-1 text-xs text-gray-600">
                          {m.motif}
                          <span className="block text-gray-400">{m.correcteur}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Carte>

            <Carte>
              <div className="flex flex-wrap gap-2">
                <Bouton ton="secondaire" onClick={() => agir({ action: 'relancer_correction' }, 'Correction relancée.')}>
                  Relancer la correction
                </Bouton>
                <Link href="/admin/brevet/mathematiques/copies">
                  <Bouton ton="secondaire">Retour aux copies</Bouton>
                </Link>
              </div>
            </Carte>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUT_AUTO: Record<string, Parameters<typeof Badge>[0]['ton']> = {
  exacte: 'vert',
  variante_acceptee: 'vert',
  dans_la_tolerance: 'vert',
  exacte_forme_non_conforme: 'ambre',
  unite_absente: 'ambre',
  unite_erronee: 'ambre',
  fausse: 'rouge',
  absente: 'rouge',
  illisible: 'ambre',
};

const TON_NIVEAU: Record<string, Parameters<typeof Badge>[0]['ton']> = {
  tres_satisfaisant: 'vert',
  very_satisfactory: 'vert',
  satisfaisant: 'vert',
  satisfactory: 'vert',
  fragile: 'ambre',
  insuffisant: 'rouge',
  insufficient: 'rouge',
  non_observe: 'gris',
  non_applicable: 'gris',
};

function LigneQuestionMaths({
  q,
  agir,
}: {
  q: Question;
  agir: (corps: Record<string, unknown>, message: string) => Promise<void>;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        q.cascade_penalty_applied
          ? 'border-red-300 bg-red-50'
          : q.motifs_relecture.length
            ? 'border-amber-300 bg-amber-50'
            : 'border-gray-200'
      }`}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex-1 min-w-[16rem]">
          <p className="font-bold text-gray-900">
            Question <code>{q.question_key}</code>
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {q.statut_reponse && <Badge texte={q.statut_reponse.replace(/_/g, ' ')} ton="gris" />}
            {q.methode_alternative && <Badge texte="Méthode alternative" ton="bleu" />}
            {q.cascade_error && q.method_valid_from_student_value && (
              <Badge texte="Poursuite valide sur un résultat faux" ton="vert" />
            )}
            {q.cascade_penalty_applied && <Badge texte="Double sanction possible" ton="rouge" />}
          </div>
          <div className="mt-2">
            <Provenance source={q.source_regle} nature={q.nature_decision} certitude={q.certitude} />
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">
            {q.points_humain ?? q.points} / {q.max_points}
          </p>
          <Retouche
            valeurIa={q.points}
            max={q.max_points}
            surEnvoi={(valeur, motif) =>
              agir(
                { action: 'retoucher', cible_type: 'question', cible_cle: q.question_key, valeur, motif },
                'Question retouchée.',
              )
            }
          />
        </div>
      </div>

      {q.cascade_error && (
        <p className="text-sm text-sky-900 mt-2">
          Reprend le résultat de <code>{q.depends_on_question}</code>
          {q.inherited_value && <> (valeur utilisée : {q.inherited_value})</>}.
        </p>
      )}
      {q.elements_observes.length > 0 && (
        <p className="text-sm text-emerald-800 mt-2">Étapes validées : {q.elements_observes.join(' · ')}</p>
      )}
      {q.elements_manquants.length > 0 && (
        <p className="text-sm text-amber-900 mt-1">Étapes manquantes : {q.elements_manquants.join(' · ')}</p>
      )}
      {q.preuves.length > 0 && (
        <ul className="mt-2 text-sm text-gray-700 space-y-1">
          {q.preuves.map((p, i) => (
            <li key={i}>
              <span className="italic">« {p.citation} »</span>
              {p.explication && <span className="text-gray-500"> — {p.explication}</span>}
            </li>
          ))}
        </ul>
      )}
      {q.erreurs.length > 0 && (
        <p className="text-xs text-gray-500 mt-2">Erreurs types : {q.erreurs.map((e) => e.code).join(', ')}</p>
      )}
      {q.motifs_relecture.length > 0 && (
        <ul className="mt-2 text-sm text-amber-900 list-disc pl-5">
          {q.motifs_relecture.map((m, i) => (
            <li key={i}>{m.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
