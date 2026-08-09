'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Bouton, Carte, EnteteBrevet, Message } from './ui';
import {
  LABELS_COURTS_BREVET,
  SEGMENT_MATIERE,
  type MatiereBrevetUI,
} from '@/lib/matieresBrevet';

/**
 * Liste des copies d'UNE matière du brevet.
 *
 * Ce composant est partagé parce qu'il ne porte aucune règle pédagogique : il
 * affiche des lignes, une note, un état et un lien. La matière lui est
 * transmise en propriété, et l'API interrogée ne renvoie jamais les copies de
 * l'autre matière — encore moins celles du baccalauréat.
 */

type Copie = {
  id: string;
  exam_id: string | null;
  status: string;
  score_raw: number | null;
  score_validated: number | null;
  max_score: number | null;
  human_review_required: boolean | null;
  student_email: string | null;
  created_at: string;
  est_etalon: boolean | null;
  processing_error: string | null;
};

const ETATS: Record<string, { texte: string; ton: Parameters<typeof Badge>[0]['ton'] }> = {
  uploaded: { texte: 'Reçue', ton: 'gris' },
  transcribing: { texte: 'Lecture', ton: 'bleu' },
  transcribed: { texte: 'Transcrite', ton: 'bleu' },
  transcription_review: { texte: 'Transcription à vérifier', ton: 'ambre' },
  queued_correction: { texte: 'En file', ton: 'bleu' },
  correcting: { texte: 'Correction en cours', ton: 'bleu' },
  corrected: { texte: 'Corrigée', ton: 'vert' },
  corrected_review: { texte: 'À valider', ton: 'ambre' },
  transcription_failed: { texte: 'Échec de lecture', ton: 'rouge' },
  correction_failed: { texte: 'Échec de correction', ton: 'rouge' },
};

/** Note sur 20, quelle que soit l'échelle du barème (100 en français, 20 en maths). */
function sur20(score: number | null, max: number | null): string {
  if (score === null || !max) return '—';
  return (Math.round((score / max) * 20 * 100) / 100).toString();
}

export function ListeCopies({ matiere }: { matiere: MatiereBrevetUI }) {
  const segment = SEGMENT_MATIERE[matiere];
  const [copies, setCopies] = useState<Copie[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aVerifier, setAVerifier] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/admin/brevet/${segment}/copies${aVerifier ? '?aVerifier=1' : ''}`,
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Lecture impossible');
      setCopies(j.copies);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, [segment, aVerifier]);

  useEffect(() => {
    const t = setTimeout(() => {
      void charger();
    }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere={matiere}
          titre={`Copies — ${LABELS_COURTS_BREVET[matiere]}`}
          fil={[
            { href: '/admin/brevet', texte: 'Brevet' },
            { href: `/admin/brevet/${segment}`, texte: LABELS_COURTS_BREVET[matiere] },
          ]}
          soustitre="Seules les copies corrigées par le moteur de cette matière apparaissent ici."
          actions={
            <Bouton ton={aVerifier ? 'principal' : 'secondaire'} onClick={() => setAVerifier((v) => !v)}>
              {aVerifier ? 'Voir toutes les copies' : 'Ne voir que celles à vérifier'}
            </Bouton>
          }
        />

        <Message texte={erreur} ton="erreur" />

        {copies === null ? (
          <p className="text-gray-500">Chargement…</p>
        ) : copies.length === 0 ? (
          <Carte>
            <p className="text-gray-700">
              {aVerifier
                ? 'Aucune copie n’attend de validation humaine.'
                : 'Aucune copie n’a encore été corrigée dans cette matière.'}
            </p>
          </Carte>
        ) : (
          <Carte>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2">Copie</th>
                  <th className="pb-2">État</th>
                  <th className="pb-2 text-right">Note / 20</th>
                  <th className="pb-2 text-right">Brute</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {copies.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2">
                      <p className="font-medium text-gray-900">
                        {c.student_email ?? 'élève anonyme'}
                        {c.est_etalon && <Badge texte="Étalon" ton="bleu" />}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(c.created_at).toLocaleDateString('fr-FR')} · <code>{c.id.slice(0, 8)}</code>
                      </p>
                      {c.processing_error && (
                        <p className="text-xs text-red-700 mt-1">{c.processing_error}</p>
                      )}
                    </td>
                    <td className="py-2">
                      <Badge
                        texte={ETATS[c.status]?.texte ?? c.status}
                        ton={ETATS[c.status]?.ton ?? 'gris'}
                      />
                      {c.human_review_required && (
                        <span className="ml-2">
                          <Badge texte="Validation demandée" ton="ambre" />
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-bold text-gray-900">
                      {sur20(c.score_validated ?? c.score_raw, c.max_score)}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {c.score_validated ?? c.score_raw ?? '—'} / {c.max_score ?? '—'}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/admin/brevet/${segment}/copies/${c.id}`}
                        className="text-teal-700 font-semibold hover:underline"
                      >
                        Ouvrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Carte>
        )}
      </div>
    </div>
  );
}
