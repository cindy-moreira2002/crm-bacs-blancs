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
 * Écran de correction d'une copie de FRANÇAIS au brevet.
 *
 * Cinq onglets : Texte et langue, Réécriture, Dictée, Rédaction, Synthèse.
 * Sur chaque unité de notation, le correcteur voit la réponse détectée, la
 * réponse attendue, l'analyse, les points proposés, le maximum, la source de
 * la règle appliquée, les erreurs types et le niveau de confiance — et peut
 * modifier la note, avec justification obligatoire au-delà d'un point d'écart.
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
  transcription_incertaine: boolean;
};

type Forme = {
  cle: string;
  forme_originale: string;
  forme_attendue: string;
  forme_produite: string;
  transformation: string;
  statut: string;
  points: number;
  points_humain: number | null;
  max_points: number;
  type_erreur: string | null;
  justification: string;
  ambigu: boolean;
};

type ErreurDictee = {
  rang: number;
  segment_attendu: string;
  segment_produit: string;
  categorie: string;
  sous_categorie: string | null;
  regle: string;
  penalite_prevue: number;
  penalite_appliquee: number;
  explication: string;
  certitude: number | null;
  repetition_de: number | null;
  retenue_par_humain: boolean | null;
};

type Critere = {
  code: string;
  libelle: string;
  score: number;
  points_humain: number | null;
  max_points: number;
  niveau: string | null;
  preuves: string[];
  points_forts: string[];
  insuffisances: string[];
  conseil: string | null;
  certitude: number | null;
};

type Detail = {
  correction: {
    id: string;
    status: string;
    score_raw: number | null;
    score_validated: number | null;
    max_score: number | null;
    human_review_required: boolean | null;
    validee_par: string | null;
    result_json: {
      score?: { score_out_of_20?: number; note_partielle?: boolean; blocs_non_notes?: string[] };
      student_feedback?: {
        reussites: string[];
        priorites: string[];
        erreurs_expliquees: { titre: string; explication: string; conseil: string }[];
        a_retravailler: string[];
        strategie: string;
        avertissement_lisibilite: string | null;
      };
      document_quality?: { statut: string; anomalies: { code: string; detail: string }[] };
    } | null;
  };
  examen: { titre: string; sujet_texte: string | null; corrige_texte: string | null } | null;
  questions: Question[];
  reecriture: Forme[];
  dictee: ErreurDictee[];
  redaction: { sujet_choisi: string; grille_appliquee: string | null; score: number | null; max_points: number; longueur_estimee: number | null } | null;
  redactionCriteres: Critere[];
  documentQualite: { statut: string; anomalies: { code: string; detail: string }[]; missing_pages: number[] } | null;
  validations: { id: string; code_motif: string; motif: string; degre: string; statut: string }[];
  modifications: { id: number; cible_type: string; cible_cle: string; valeur_ia: number | null; valeur_humaine: number; correcteur: string; motif: string; impact_note: number; cree_le: string }[];
};

export function CorrectionFrancais({ correctionId }: { correctionId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [onglet, setOnglet] = useState('texte');
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/brevet/francais/copies/${correctionId}`);
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
        const r = await fetch(`/api/admin/brevet/francais/copies/${correctionId}`, {
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
  const resultat = c.result_json;
  const note20 = resultat?.score?.score_out_of_20 ?? null;
  const ouvertes = detail.validations.filter((v) => v.statut === 'ouverte');
  const bloquantes = ouvertes.filter((v) => v.degre === 'bloquante').length;

  const questionsTexte = detail.questions.filter((q) => q.bloc === 'texte' && q.partie !== 'reecriture');
  const blocReecriture = detail.questions.find((q) => q.partie === 'reecriture');
  const blocDictee = detail.questions.find((q) => q.bloc === 'dictee');
  const blocRedaction = detail.questions.find((q) => q.bloc === 'redaction');

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere="brevet_francais"
          titre={detail.examen?.titre ?? 'Copie de français'}
          fil={[
            { href: '/admin/brevet', texte: 'Brevet' },
            { href: '/admin/brevet/francais', texte: 'Français' },
            { href: '/admin/brevet/francais/copies', texte: 'Copies' },
          ]}
          soustitre={
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold text-gray-900">{note20 ?? '—'} / 20</span>
              <span className="text-sm text-gray-600">
                soit {c.score_validated ?? c.score_raw ?? '—'} / {c.max_score ?? '—'} points
              </span>
              {resultat?.score?.note_partielle && (
                <Badge texte={`Note partielle — ${(resultat.score.blocs_non_notes ?? []).join(', ')} non noté(s)`} ton="ambre" />
              )}
              {c.validee_par && <Badge texte={`Validée par ${c.validee_par}`} ton="vert" />}
            </div>
          }
          actions={
            <Bouton
              disabled={bloquantes > 0 || Boolean(c.validee_par)}
              titre={
                bloquantes > 0
                  ? `${bloquantes} validation(s) obligatoire(s) restent ouvertes.`
                  : undefined
              }
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
            <p className="mt-2 italic">
              Une zone illisible n’est jamais comptée comme une absence de réponse.
            </p>
          </div>
        )}

        <Onglets
          actif={onglet}
          surChangement={setOnglet}
          onglets={[
            { code: 'texte', libelle: 'Texte et langue' },
            { code: 'reecriture', libelle: 'Réécriture' },
            { code: 'dictee', libelle: 'Dictée' },
            { code: 'redaction', libelle: 'Rédaction' },
            { code: 'synthese', libelle: 'Synthèse', pastille: ouvertes.length || undefined },
          ]}
        />

        {onglet === 'texte' && (
          <Carte titre={`Travail sur le texte — ${questionsTexte.length} question(s)`}>
            <div className="space-y-4">
              {questionsTexte.map((q) => (
                <LigneQuestion key={q.question_key} q={q} agir={agir} />
              ))}
            </div>
          </Carte>
        )}

        {onglet === 'reecriture' && (
          <Carte
            titre="Réécriture — forme par forme"
            aide="Une erreur de TRANSFORMATION et une erreur de PURE COPIE relèvent de barèmes différents : elles ne se cumulent jamais sur la même forme."
          >
            {blocReecriture && (
              <div className="mb-4">
                <JaugeBloc
                  libelle="Points du bloc"
                  saisi={blocReecriture.points_humain ?? blocReecriture.points}
                  attendu={blocReecriture.max_points}
                />
              </div>
            )}
            {detail.reecriture.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune forme de réécriture sur ce sujet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2">Forme d’origine</th>
                    <th className="pb-2">Attendue</th>
                    <th className="pb-2">Produite</th>
                    <th className="pb-2">Statut</th>
                    <th className="pb-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.reecriture.map((f) => (
                    <tr key={f.cle} className={`border-b border-gray-100 ${f.ambigu ? 'bg-amber-50' : ''}`}>
                      <td className="py-2">{f.forme_originale}</td>
                      <td className="py-2 text-gray-600">{f.forme_attendue}</td>
                      <td className="py-2 font-mono text-xs">{f.forme_produite || '—'}</td>
                      <td className="py-2">
                        <Badge texte={f.statut.replace(/_/g, ' ')} ton={STATUT_REECRITURE[f.statut] ?? 'gris'} />
                        <p className="text-xs text-gray-500 mt-1">{f.justification}</p>
                        {f.type_erreur && <code className="text-xs text-gray-400">{f.type_erreur}</code>}
                      </td>
                      <td className="py-2 text-right">
                        <span className="font-bold">{f.points_humain ?? f.points}</span> / {f.max_points}
                        <Retouche
                          valeurIa={f.points}
                          max={f.max_points}
                          surEnvoi={(valeur, motif) =>
                            agir(
                              { action: 'retoucher', cible_type: 'reecriture', cible_cle: f.cle, valeur, motif },
                              'Forme retouchée.',
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

        {onglet === 'dictee' && (
          <Carte
            titre="Dictée"
            aide="Chaque écart est classé, rattaché à sa règle et à la pénalité que le barème du sujet prévoit. Une répétition n’est comptée qu’une fois, sauf si la règle dit le contraire, et un décalage de transcription n’est jamais compté."
          >
            {blocDictee ? (
              <div className="mb-4">
                <JaugeBloc
                  libelle="Points du bloc"
                  saisi={blocDictee.points_humain ?? blocDictee.points}
                  attendu={blocDictee.max_points}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 mb-4">
                La dictée n’a pas été notée : aucune règle de retrait n’est définie pour ce sujet. Le
                moteur préfère refuser de noter plutôt qu’inventer un barème.
              </div>
            )}
            {detail.dictee.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun écart relevé.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2">Attendu</th>
                    <th className="pb-2">Écrit</th>
                    <th className="pb-2">Catégorie</th>
                    <th className="pb-2 text-right">Prévue</th>
                    <th className="pb-2 text-right">Appliquée</th>
                    <th className="pb-2">Décision</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.dictee.map((e) => (
                    <tr key={e.rang} className="border-b border-gray-100">
                      <td className="py-2 font-mono text-xs">{e.segment_attendu || '—'}</td>
                      <td className="py-2 font-mono text-xs">{e.segment_produit || '—'}</td>
                      <td className="py-2">
                        <Badge texte={e.categorie.replace(/_/g, ' ')} ton="gris" />
                        <p className="text-xs text-gray-500 mt-1">{e.explication}</p>
                        {e.repetition_de !== null && (
                          <p className="text-xs text-sky-700">répétition de l’erreur n° {e.repetition_de}</p>
                        )}
                      </td>
                      <td className="py-2 text-right text-gray-500">−{e.penalite_prevue}</td>
                      <td className="py-2 text-right font-bold">−{e.penalite_appliquee}</td>
                      <td className="py-2">
                        {e.retenue_par_humain === null ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                agir(
                                  { action: 'trancher_dictee', rang: e.rang, retenue: true, motif: 'Erreur confirmée.' },
                                  'Erreur retenue.',
                                )
                              }
                              className="text-xs font-semibold text-emerald-800 hover:underline"
                            >
                              Retenir
                            </button>
                            <button
                              onClick={() =>
                                agir(
                                  { action: 'trancher_dictee', rang: e.rang, retenue: false, motif: 'Erreur écartée par le correcteur.' },
                                  'Erreur écartée.',
                                )
                              }
                              className="text-xs font-semibold text-gray-600 hover:underline"
                            >
                              Écarter
                            </button>
                          </div>
                        ) : (
                          <Badge texte={e.retenue_par_humain ? 'Retenue' : 'Écartée'} ton={e.retenue_par_humain ? 'ambre' : 'vert'} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Carte>
        )}

        {onglet === 'redaction' && (
          <Carte
            titre="Rédaction"
            aide="Une seule grille est appliquée : celle du sujet que l’élève a traité. Les deux grilles ne se mélangent jamais."
          >
            {detail.redaction ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Badge
                    texte={`Sujet traité : ${detail.redaction.sujet_choisi.replace(/_/g, ' ')}`}
                    ton={
                      detail.redaction.grille_appliquee ? 'vert' : 'rouge'
                    }
                  />
                  {detail.redaction.longueur_estimee !== null && (
                    <Badge texte={`${detail.redaction.longueur_estimee} lignes estimées`} ton="gris" />
                  )}
                </div>
                {blocRedaction && (
                  <div className="mb-4">
                    <JaugeBloc
                      libelle="Points du bloc"
                      saisi={blocRedaction.points_humain ?? blocRedaction.points}
                      attendu={blocRedaction.max_points}
                    />
                  </div>
                )}
                {!detail.redaction.grille_appliquee && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 mb-4">
                    Le sujet traité n’a pas pu être identifié avec certitude : aucune note n’a été
                    posée sur les 40 points. Un humain doit trancher.
                  </div>
                )}
                <div className="space-y-3">
                  {detail.redactionCriteres.map((cr) => (
                    <div key={cr.code} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{cr.libelle}</p>
                          {cr.niveau && <p className="text-xs text-gray-500">niveau : {cr.niveau}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-bold">
                            {cr.points_humain ?? cr.score} / {cr.max_points}
                          </p>
                          <Retouche
                            valeurIa={cr.score}
                            max={cr.max_points}
                            surEnvoi={(valeur, motif) =>
                              agir(
                                { action: 'retoucher', cible_type: 'redaction_critere', cible_cle: cr.code, valeur, motif },
                                'Critère retouché.',
                              )
                            }
                          />
                        </div>
                      </div>
                      {cr.preuves.length > 0 && (
                        <ul className="mt-2 text-sm text-gray-700 space-y-1">
                          {cr.preuves.map((p, i) => (
                            <li key={i} className="italic">« {p} »</li>
                          ))}
                        </ul>
                      )}
                      {cr.points_forts.length > 0 && (
                        <p className="text-sm text-emerald-800 mt-1">+ {cr.points_forts.join(' · ')}</p>
                      )}
                      {cr.insuffisances.length > 0 && (
                        <p className="text-sm text-amber-900 mt-1">− {cr.insuffisances.join(' · ')}</p>
                      )}
                      {cr.conseil && <p className="text-sm text-gray-600 mt-1">Conseil : {cr.conseil}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Aucune rédaction enregistrée.</p>
            )}
          </Carte>
        )}

        {onglet === 'synthese' && (
          <div className="space-y-5">
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

            {resultat?.student_feedback && (
              <Carte titre="Rapport élève" aide="C’est ce que l’élève lira. Trois réussites au plus, trois priorités au plus, chacune appuyée sur un passage de sa copie.">
                {resultat.student_feedback.avertissement_lisibilite && (
                  <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mb-3">
                    {resultat.student_feedback.avertissement_lisibilite}
                  </p>
                )}
                <p className="text-sm font-semibold text-gray-800">Ce qui a marché</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 mb-3">
                  {resultat.student_feedback.reussites.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <p className="text-sm font-semibold text-gray-800">À travailler en priorité</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 mb-3">
                  {resultat.student_feedback.priorites.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {resultat.student_feedback.erreurs_expliquees.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-800">Les erreurs qui coûtent le plus</p>
                    <ul className="text-sm text-gray-700 space-y-2 mb-3">
                      {resultat.student_feedback.erreurs_expliquees.map((e, i) => (
                        <li key={i}>
                          <strong>{e.titre}</strong> — {e.explication}
                          <br />
                          <span className="text-teal-800">→ {e.conseil}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {resultat.student_feedback.strategie && (
                  <p className="text-sm text-gray-700">
                    <strong>Pour le prochain brevet blanc :</strong> {resultat.student_feedback.strategie}
                  </p>
                )}
              </Carte>
            )}

            <Carte
              titre="Historique des retouches"
              aide="Rien ne s’efface : chaque modification conserve la valeur proposée par l’IA, son auteur, sa date, son motif et son impact sur la note."
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
                        <td className="py-1 text-xs text-gray-500">
                          {new Date(m.cree_le).toLocaleString('fr-FR')}
                        </td>
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
                <Bouton
                  ton="secondaire"
                  onClick={() => agir({ action: 'relancer_correction' }, 'Correction relancée.')}
                >
                  Relancer la correction
                </Bouton>
                <Link href="/admin/brevet/francais/copies">
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

const STATUT_REECRITURE: Record<string, Parameters<typeof Badge>[0]['ton']> = {
  exacte: 'vert',
  variante_admise: 'vert',
  erreur_de_copie_seule: 'bleu',
  transformation_partielle: 'ambre',
  transformation_manquee: 'rouge',
  absente: 'rouge',
  illisible: 'ambre',
};

function LigneQuestion({
  q,
  agir,
}: {
  q: Question;
  agir: (corps: Record<string, unknown>, message: string) => Promise<void>;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        q.motifs_relecture.length ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex-1 min-w-[16rem]">
          <p className="font-bold text-gray-900">
            Question <code>{q.question_key}</code>
          </p>
          {q.statut_reponse && <Badge texte={q.statut_reponse.replace(/_/g, ' ')} ton="gris" />}
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

      {q.elements_observes.length > 0 && (
        <p className="text-sm text-emerald-800 mt-2">Trouvé : {q.elements_observes.join(' · ')}</p>
      )}
      {q.elements_manquants.length > 0 && (
        <p className="text-sm text-amber-900 mt-1">Manque : {q.elements_manquants.join(' · ')}</p>
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
        <p className="text-xs text-gray-500 mt-2">
          Erreurs types : {q.erreurs.map((e) => e.code).join(', ')}
        </p>
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
