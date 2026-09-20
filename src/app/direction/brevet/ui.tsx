'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { BADGE_EXAMEN, LABELS_COURTS_BREVET, type MatiereBrevetUI } from '@/lib/matieresBrevet';

/**
 * Briques d'interface COMMUNES aux deux matières du brevet.
 *
 * Ce fichier ne contient que du présentationnel : un bandeau, un badge, un
 * champ, un onglet, une jauge. Aucune règle pédagogique n'y vit — elles sont
 * dans les composants propres à chaque matière, qui ne se connaissent pas.
 *
 * Le repère visuel principal : le brevet est en TEAL, le baccalauréat reste en
 * violet. On doit distinguer Bac / Brevet / Français brevet / Maths brevet
 * d'un coup d'œil, sans lire le titre.
 */

export function EnteteBrevet({
  matiere,
  titre,
  soustitre,
  fil,
  actions,
}: {
  matiere: MatiereBrevetUI;
  titre: string;
  soustitre?: ReactNode;
  fil?: { href: string; texte: string }[];
  actions?: ReactNode;
}) {
  return (
    <header className="border-b-4 border-teal-500 pb-5 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 flex flex-wrap items-center gap-1">
            <BadgeExamen examen="DNB" />
            {(fil ?? []).map((f) => (
              <span key={f.href}>
                <Link href={f.href} className="hover:underline">
                  {f.texte}
                </Link>
                <span className="mx-1">›</span>
              </span>
            ))}
            <span className="font-semibold text-teal-800">{LABELS_COURTS_BREVET[matiere]}</span>
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">{titre}</h1>
          {soustitre && <div className="text-gray-700 mt-3 max-w-3xl leading-relaxed">{soustitre}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function BadgeExamen({ examen }: { examen: 'BAC' | 'DNB' }) {
  const b = BADGE_EXAMEN[examen];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold ${b.classe}`}>
      {b.texte}
    </span>
  );
}

export function Badge({ texte, ton = 'gris' }: { texte: string; ton?: Ton }) {
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${TONS[ton]}`}>{texte}</span>;
}

type Ton = 'gris' | 'vert' | 'ambre' | 'rouge' | 'bleu' | 'teal';

const TONS: Record<Ton, string> = {
  gris: 'bg-gray-100 text-gray-700',
  vert: 'bg-emerald-100 text-emerald-800',
  ambre: 'bg-amber-100 text-amber-900',
  rouge: 'bg-red-100 text-red-800',
  bleu: 'bg-sky-100 text-sky-800',
  teal: 'bg-teal-100 text-teal-900',
};

export function Carte({
  titre,
  aide,
  children,
  action,
}: {
  titre?: string;
  aide?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {(titre || action) && (
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            {titre && <h2 className="text-lg font-bold text-gray-900">{titre}</h2>}
            {aide && <p className="text-sm text-gray-600 mt-1 max-w-2xl">{aide}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Bandeau de blocages et d'avertissements du barème. */
export function BandeauControles({
  controles,
}: {
  controles: {
    ok?: boolean;
    blocages?: { code: string; message: string }[];
    avertissements?: { code: string; message: string }[];
  } | null;
}) {
  if (!controles) return null;
  const blocages = controles.blocages ?? [];
  const avertis = controles.avertissements ?? [];
  if (!blocages.length && !avertis.length) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        ✅ Aucun blocage : ce barème peut être verrouillé.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {blocages.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-bold text-red-900 text-sm mb-2">
            {blocages.length} blocage{blocages.length > 1 ? 's' : ''} — le verrouillage est impossible
          </p>
          <ul className="text-sm text-red-900 space-y-1 list-disc pl-5">
            {blocages.map((b, i) => (
              <li key={`${b.code}-${i}`}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}
      {avertis.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-bold text-amber-900 text-sm mb-2">
            {avertis.length} avertissement{avertis.length > 1 ? 's' : ''}
          </p>
          <ul className="text-sm text-amber-900 space-y-1 list-disc pl-5">
            {avertis.map((a, i) => (
              <li key={`${a.code}-${i}`}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Jauge d'un bloc de barème : ce qui est saisi contre ce qui est attendu. */
export function JaugeBloc({
  libelle,
  saisi,
  attendu,
}: {
  libelle: string;
  saisi: number;
  attendu: number;
}) {
  const ok = Math.abs(saisi - attendu) < 0.001;
  const largeur = Math.min(100, attendu > 0 ? (saisi / attendu) * 100 : 0);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-800">{libelle}</span>
        <span className={ok ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold'}>
          {saisi} / {attendu}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full ${ok ? 'bg-emerald-500' : saisi > attendu ? 'bg-red-500' : 'bg-amber-400'}`}
          style={{ width: `${largeur}%` }}
        />
      </div>
    </div>
  );
}

export function Onglets({
  onglets,
  actif,
  surChangement,
}: {
  onglets: { code: string; libelle: string; pastille?: number }[];
  actif: string;
  surChangement: (code: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {onglets.map((o) => (
        <button
          key={o.code}
          onClick={() => surChangement(o.code)}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition ${
            actif === o.code
              ? 'border-teal-600 text-teal-800 bg-teal-50'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {o.libelle}
          {o.pastille ? (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs">
              {o.pastille}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-gray-800">{label}</span>
      {aide && <span className="block text-xs text-gray-500 mt-0.5">{aide}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const classeInput =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none';

export function Bouton({
  children,
  onClick,
  ton = 'principal',
  disabled,
  titre,
}: {
  children: ReactNode;
  onClick?: () => void;
  ton?: 'principal' | 'secondaire' | 'danger';
  disabled?: boolean;
  titre?: string;
}) {
  const classes =
    ton === 'principal'
      ? 'bg-teal-600 text-white hover:bg-teal-700'
      : ton === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titre}
      className={`px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

export function Message({ texte, ton }: { texte: string | null; ton: 'erreur' | 'succes' }) {
  if (!texte) return null;
  const classes =
    ton === 'erreur'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return <div className={`rounded-xl border p-4 text-sm whitespace-pre-line ${classes}`}>{texte}</div>;
}

/**
 * Bloc de confiance et de provenance, affiché sur chaque unité de notation.
 * Il dit d'où vient la décision — c'est ce que le cahier des charges exige de
 * conserver pour chaque point attribué.
 */
export function Provenance({
  source,
  nature,
  certitude,
}: {
  source: string | null;
  nature: string | null;
  certitude: number | null;
}) {
  const LIB_SOURCE: Record<string, string> = {
    subject_bareme: 'Barème du sujet',
    official_correction: 'Corrigé officiel',
    admin_instruction: 'Consigne administratrice',
    official_exam_rule: 'Règle officielle du DNB',
    default_rubric: 'Grille par défaut',
    human_override: 'Décision humaine',
  };
  const LIB_NATURE: Record<string, { texte: string; ton: Ton }> = {
    prevue_par_bareme: { texte: 'Prévu par le barème', ton: 'vert' },
    interpretation_raisonnable: { texte: 'Interprétation raisonnable', ton: 'ambre' },
    a_valider: { texte: 'À valider', ton: 'rouge' },
  };
  const n = nature ? LIB_NATURE[nature] : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {source && <Badge texte={LIB_SOURCE[source] ?? source} ton={source === 'human_override' ? 'bleu' : 'gris'} />}
      {n && <Badge texte={n.texte} ton={n.ton} />}
      {typeof certitude === 'number' && (
        <span className={certitude < 0.85 ? 'text-red-700 font-semibold' : 'text-gray-500'}>
          confiance {Math.round(certitude * 100)} %
        </span>
      )}
    </div>
  );
}

/**
 * Formulaire de retouche humaine.
 *
 * La justification devient obligatoire dès que l'écart avec la proposition de
 * l'IA atteint un point : le serveur le vérifie aussi, ce champ n'est qu'une
 * politesse pour ne pas faire un aller-retour inutile.
 */
export function Retouche({
  valeurIa,
  max,
  surEnvoi,
}: {
  valeurIa: number;
  max: number;
  surEnvoi: (valeur: number, motif: string) => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(String(valeurIa));
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);

  const ecart = Math.abs(Number(valeur) - valeurIa);
  const motifObligatoire = Number.isFinite(ecart) && ecart >= 1;

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="text-xs text-teal-700 font-semibold hover:underline"
      >
        ✎ Modifier
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <input
          type="number"
          step="0.25"
          min={0}
          max={max}
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          className="w-24 rounded-lg border border-gray-300 px-2 py-1"
        />
        <span className="text-gray-500">/ {max}</span>
        <span className="text-xs text-gray-500">proposé par l’IA : {valeurIa}</span>
      </div>
      <textarea
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
        rows={2}
        placeholder={
          motifObligatoire
            ? 'Justification OBLIGATOIRE (écart d’au moins 1 point)'
            : 'Motif de la modification'
        }
        className={`w-full rounded-lg border px-2 py-1 text-sm ${
          motifObligatoire && motif.trim().length < 10 ? 'border-red-300 bg-red-50' : 'border-gray-300'
        }`}
      />
      <div className="flex gap-2">
        <Bouton
          disabled={enCours || (motifObligatoire && motif.trim().length < 10)}
          onClick={async () => {
            setEnCours(true);
            try {
              await surEnvoi(Number(valeur), motif);
              setOuvert(false);
            } finally {
              setEnCours(false);
            }
          }}
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
        <Bouton ton="secondaire" onClick={() => setOuvert(false)}>
          Annuler
        </Bouton>
      </div>
    </div>
  );
}

/** Liste des motifs de validation humaine, triés du plus grave au moins grave. */
export function Validations({
  validations,
  surTraitement,
}: {
  validations: { id: string; code_motif: string; motif: string; degre: string; statut: string }[];
  surTraitement?: (id: string, decision: 'traitee' | 'rejetee') => Promise<void>;
}) {
  const ordre = { bloquante: 0, recommandee: 1, information: 2 } as Record<string, number>;
  const triees = [...validations].sort((a, b) => (ordre[a.degre] ?? 3) - (ordre[b.degre] ?? 3));
  if (!triees.length) {
    return <p className="text-sm text-gray-500">Aucune validation humaine demandée sur cette copie.</p>;
  }
  return (
    <ul className="space-y-2">
      {triees.map((v) => (
        <li
          key={v.id}
          className={`rounded-xl border p-3 text-sm ${
            v.statut !== 'ouverte'
              ? 'border-gray-200 bg-gray-50 text-gray-500'
              : v.degre === 'bloquante'
                ? 'border-red-300 bg-red-50'
                : v.degre === 'recommandee'
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-sky-200 bg-sky-50'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge
              texte={
                v.degre === 'bloquante'
                  ? 'Validation obligatoire'
                  : v.degre === 'recommandee'
                    ? 'Validation recommandée'
                    : 'Information'
              }
              ton={v.degre === 'bloquante' ? 'rouge' : v.degre === 'recommandee' ? 'ambre' : 'bleu'}
            />
            <code className="text-xs text-gray-500">{v.code_motif}</code>
            {v.statut !== 'ouverte' && <Badge texte="Traitée" ton="gris" />}
          </div>
          <p>{v.motif}</p>
          {surTraitement && v.statut === 'ouverte' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => surTraitement(v.id, 'traitee')}
                className="text-xs font-semibold text-emerald-800 hover:underline"
              >
                ✓ Traitée
              </button>
              <button
                onClick={() => surTraitement(v.id, 'rejetee')}
                className="text-xs font-semibold text-gray-600 hover:underline"
              >
                ✕ Sans objet
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
