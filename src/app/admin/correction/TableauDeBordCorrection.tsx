'use client';

/**
 * Tableau de bord du pipeline de correction (côté client).
 *
 * Une seule source : GET /api/admin/correction/etat, rechargé toutes les
 * 30 secondes et après chaque action. Les interrupteurs passent par
 * POST /api/admin/correction/statut.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CorrectionLigne, MatiereEtat, RetourProf, SnapshotPipeline } from '@/lib/pipelineEtat';
import { DetailMatiereVue } from './DetailMatiere';
import { ExplicationPipeline } from './ExplicationPipeline';
import { SanteSystemeVue } from './SanteSysteme';

const RAFRAICHISSEMENT_MS = 30_000;

// --- Petites briques --------------------------------------------------

function Pastille({ ton, children }: { ton: 'vert' | 'orange' | 'rouge' | 'gris' | 'bleu'; children: React.ReactNode }) {
  const classes = {
    vert: 'bg-emerald-100 text-emerald-800',
    orange: 'bg-amber-100 text-amber-800',
    rouge: 'bg-red-100 text-red-700',
    gris: 'bg-gray-100 text-gray-600',
    bleu: 'bg-blue-100 text-blue-800',
  }[ton];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${classes}`}>
      {children}
    </span>
  );
}

function pastilleStatutCorrection(status: string) {
  if (status.includes('failed')) return <Pastille ton="rouge">échec — {status}</Pastille>;
  if (status === 'corrected_review') return <Pastille ton="orange">corrigée · relecture conseillée</Pastille>;
  if (status === 'corrected') return <Pastille ton="vert">corrigée</Pastille>;
  if (status === 'transcribed') return <Pastille ton="bleu">transcrite…</Pastille>;
  if (status === 'uploaded') return <Pastille ton="bleu">déposée…</Pastille>;
  return <Pastille ton="gris">{status}</Pastille>;
}

function dateCourte(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function joursAvant(dateIso: string): number {
  return Math.ceil((new Date(dateIso + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
}

// --- Interrupteur activer / draft ------------------------------------

function Interrupteur({
  actif,
  partiel,
  libelle,
  onBascule,
  occupe,
}: {
  actif: boolean;
  partiel?: boolean;
  libelle: string;
  onBascule: (versActif: boolean) => void;
  occupe: boolean;
}) {
  return (
    <button
      type="button"
      disabled={occupe}
      onClick={() => onBascule(!actif)}
      title={actif ? `Repasser ${libelle} en brouillon (invisible au dépôt)` : `Rendre ${libelle} visible au dépôt`}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        actif ? 'bg-emerald-500' : partiel ? 'bg-amber-400' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          actif ? 'translate-x-5' : partiel ? 'translate-x-3' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// --- Check-list par matière ------------------------------------------

function CarteMatiere({
  m,
  onStatut,
  occupe,
  onToutVoir,
}: {
  m: MatiereEtat;
  onStatut: (corps: Record<string, string>) => void;
  occupe: boolean;
  onToutVoir: () => void;
}) {
  const [ouverte, setOuverte] = useState(false);
  const t = m.totaux;
  const etalonsReels = t.etalons - t.etalons_synthetiques;

  const points: { ok: boolean; texte: string }[] = [
    { ok: t.grilles_actives === t.grilles && t.grilles > 0, texte: `Barèmes actifs (${t.grilles_actives}/${t.grilles})` },
    { ok: t.sujets_actifs > 0, texte: `Sujets visibles au dépôt (${t.sujets_actifs}/${t.sujets})` },
    { ok: t.gabarits_actifs === t.gabarits && t.gabarits > 0, texte: `Dossiers élève prêts (${t.gabarits_actifs}/${t.gabarits})` },
    {
      ok: etalonsReels > 0,
      texte:
        etalonsReels > 0
          ? `${etalonsReels} copies étalons réelles (+ ${t.etalons_synthetiques} synthétiques)`
          : `Copies étalons 100 % synthétiques (${t.etalons}) — inventées pour caler l’échelle, note approximative`,
    },
    { ok: t.etalons_valides > 0, texte: t.etalons_valides > 0 ? `${t.etalons_valides} étalons validés par un prof` : 'Aucun étalon validé par un prof' },
    { ok: t.corrections_reussies > 0, texte: t.corrections_reussies > 0 ? `${t.corrections_reussies} copie(s) corrigée(s) récemment` : 'Aucune copie corrigée pour l’instant' },
    { ok: t.retours_profs > 0, texte: t.retours_profs > 0 ? `${t.retours_profs} retour(s) de prof relecteur` : 'Pas encore de retour de prof relecteur' },
  ];
  const prets = points.filter((p) => p.ok).length;

  const jours = m.session ? joursAvant(m.session.date_epreuve) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900">{m.label}</h3>
            {m.visibilite === 'active' && <Pastille ton="vert">visible au dépôt</Pastille>}
            {m.visibilite === 'partielle' && <Pastille ton="orange">partiellement visible</Pastille>}
            {m.visibilite === 'draft' && <Pastille ton="gris">brouillon</Pastille>}
          </div>
          {m.session ? (
            <p className="text-xs text-gray-500 mt-1">
              Session le{' '}
              {new Date(m.session.date_epreuve + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              {jours !== null && jours >= 0 && (
                <span className={jours <= 14 ? 'text-red-600 font-semibold' : 'text-gray-500'}> · J−{jours}</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">Pas de session programmée</p>
          )}
        </div>
        <Interrupteur
          actif={m.visibilite === 'active'}
          partiel={m.visibilite === 'partielle'}
          libelle={m.label}
          occupe={occupe}
          onBascule={(vers) => {
            const question = vers
              ? `Rendre ${m.label} visible au dépôt ?\n\nLes profs pourront déposer des copies et les élèves recevront des notes calées sur ${
                  etalonsReels > 0 ? 'les étalons en base' : 'des étalons SYNTHÉTIQUES (note approximative)'
                }.`
              : `Repasser ${m.label} en brouillon ?\n\nSes sujets disparaîtront du menu « Déposer une copie ».`;
            if (window.confirm(question)) onStatut({ cible: 'matiere', matiere: m.matiere, statut: vers ? 'active' : 'draft' });
          }}
        />
      </div>

      {/* Jauge de préparation */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${prets >= 6 ? 'bg-emerald-500' : prets >= 4 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${(prets / points.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 whitespace-nowrap">{prets}/{points.length} prêts</span>
          <button type="button" onClick={() => setOuverte(!ouverte)} className="text-xs text-purple-700 hover:underline whitespace-nowrap">
            {ouverte ? 'replier' : 'détail'}
          </button>
          <button
            type="button"
            onClick={onToutVoir}
            className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-full px-2.5 py-1 whitespace-nowrap"
            title={`Tout ce que Supabase contient pour ${m.label} : barèmes, critères, sujets, étalons, diagnostics`}
          >
            🔎 tout voir
          </button>
        </div>
      </div>

      {ouverte && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/60">
          <ul className="space-y-1">
            {points.map((p) => (
              <li key={p.texte} className={`text-xs flex items-start gap-1.5 ${p.ok ? 'text-gray-600' : 'text-amber-700'}`}>
                <span>{p.ok ? '✅' : '⚠️'}</span>
                <span>{p.texte}</span>
              </li>
            ))}
          </ul>

          {/* Épreuves et sujets, avec leurs interrupteurs fins */}
          <div className="space-y-2">
            {m.exercices.map((ex) => (
              <div key={ex.track + ex.exercise_type} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {ex.label}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      barème {ex.grille ? (ex.grille.status === 'active' ? 'actif' : 'brouillon') : 'absent'} · dossier{' '}
                      {ex.gabarit ? (ex.gabarit.status === 'active' ? 'actif' : 'brouillon') : 'absent'} · étalons {ex.etalons.total}
                      {ex.etalons.synthetiques === ex.etalons.total && ex.etalons.total > 0 ? ' (synth.)' : ''}
                    </span>
                  </p>
                  <Interrupteur
                    actif={Boolean(ex.grille?.status === 'active' && ex.gabarit?.status === 'active' && ex.sujets.every((s) => s.status === 'active'))}
                    partiel={ex.sujets.some((s) => s.status === 'active') || ex.grille?.status === 'active'}
                    libelle={`${m.label} — ${ex.label}`}
                    occupe={occupe}
                    onBascule={(vers) =>
                      onStatut({
                        cible: 'exercice',
                        matiere: m.matiere,
                        track: ex.track,
                        exercise_type: ex.exercise_type,
                        statut: vers ? 'active' : 'draft',
                      })
                    }
                  />
                </div>
                <ul className="mt-2 space-y-1">
                  {ex.sujets.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span className="truncate" title={s.id}>
                        {s.libelle}
                      </span>
                      <button
                        type="button"
                        disabled={occupe}
                        onClick={() => onStatut({ cible: 'sujet', matiere: m.matiere, sujet_id: s.id, statut: s.status === 'active' ? 'draft' : 'active' })}
                        className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] transition-colors disabled:opacity-40 ${
                          s.status === 'active'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {s.status === 'active' ? 'visible' : 'brouillon'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Corrections en direct -------------------------------------------

function TableCorrections({ lignes }: { lignes: CorrectionLigne[] }) {
  if (!lignes.length) {
    return <p className="text-sm text-gray-500">Aucune copie déposée pour l’instant.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
            <th className="py-2 px-3 font-medium">Quand</th>
            <th className="py-2 px-3 font-medium">Matière · épreuve</th>
            <th className="py-2 px-3 font-medium">Élève</th>
            <th className="py-2 px-3 font-medium">État</th>
            <th className="py-2 px-3 font-medium">Note</th>
            <th className="py-2 px-3 font-medium">Dossier</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-purple-50/40 align-top">
              <td className="py-2 px-3 whitespace-nowrap text-gray-500 text-xs">{dateCourte(c.created_at)}</td>
              <td className="py-2 px-3">
                <span className="font-medium text-gray-800">{c.matiere ?? '—'}</span>
                <span className="text-gray-400 text-xs block">{c.subject_id ?? c.exercise_type}</span>
              </td>
              <td className="py-2 px-3 text-gray-600 text-xs">
                {c.student_name ?? '—'}
                {c.teacher_email && <span className="block text-gray-400">{c.teacher_email}</span>}
              </td>
              <td className="py-2 px-3">
                {pastilleStatutCorrection(c.status)}
                {c.processing_error && (
                  <p className="text-[11px] text-red-600 mt-1 max-w-[240px]" title={c.processing_error}>
                    {c.processing_error.slice(0, 120)}
                  </p>
                )}
              </td>
              <td className="py-2 px-3 whitespace-nowrap">
                {c.note != null ? (
                  <span className="font-semibold text-gray-900" title="Note interne exacte (l’élève voit une fourchette)">
                    {c.note}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
                {c.review === 'true' && <span className="block text-[11px] text-amber-600">à relire</span>}
              </td>
              <td className="py-2 px-3">
                {c.status.startsWith('corrected') ? (
                  <a href={`/dossier/${c.id}`} target="_blank" className="text-purple-700 hover:underline text-xs">
                    ouvrir ↗
                  </a>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Retours profs ----------------------------------------------------

function BlocRetours({ retours }: { retours: RetourProf[] }) {
  if (!retours.length) {
    return (
      <p className="text-sm text-gray-500">
        Aucun retour pour l’instant. Les liens de relecture (un par matière) sont à envoyer aux profs —
        leurs réponses apparaîtront ici.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {retours.map((r) => (
        <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-800">
              {r.prof_nom} <span className="text-gray-400 font-normal">· {r.prof_email}</span>
              {r.etablissement && <span className="text-gray-400 font-normal"> · {r.etablissement}</span>}
            </p>
            <div className="flex items-center gap-2">
              <Pastille ton="bleu">{r.matiere}</Pastille>
              <span className="text-xs text-gray-400">{dateCourte(r.created_at)}</span>
            </div>
          </div>
          <dl className="mt-2 space-y-1">
            {Object.entries(r.reponses ?? {}).map(([cle, valeur]) =>
              valeur ? (
                <div key={cle} className="text-xs">
                  <dt className="inline font-medium text-gray-500">{cle.replace(/_/g, ' ')} : </dt>
                  <dd className="inline text-gray-700">{String(valeur)}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

// --- Page -------------------------------------------------------------

export function TableauDeBordCorrection() {
  const [etat, setEtat] = useState<SnapshotPipeline | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [depuis, setDepuis] = useState(0); // secondes depuis le dernier chargement
  const [matiereOuverte, setMatiereOuverte] = useState<string | null>(null);
  const chrono = useRef<ReturnType<typeof setInterval> | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/correction/etat', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setEtat(d);
      setErreur(null);
      setDepuis(0);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, []);

  useEffect(() => {
    // Premier chargement différé d'un tick : l'effet ne pose pas d'état
    // de façon synchrone (règle react-hooks/set-state-in-effect).
    const premier = setTimeout(charger, 0);
    const relance = setInterval(charger, RAFRAICHISSEMENT_MS);
    chrono.current = setInterval(() => setDepuis((s) => s + 1), 1000);
    return () => {
      clearTimeout(premier);
      clearInterval(relance);
      if (chrono.current) clearInterval(chrono.current);
    };
  }, [charger]);

  const envoyerStatut = useCallback(
    async (corps: Record<string, string>) => {
      setOccupe(true);
      try {
        const r = await fetch('/api/admin/correction/statut', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
        await charger();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setOccupe(false);
      }
    },
    [charger],
  );

  if (erreur && !etat) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Impossible de charger l’état</h1>
          <p className="text-sm text-red-600 font-mono">{erreur}</p>
          <button type="button" onClick={charger} className="mt-4 text-sm text-purple-700 hover:underline">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!etat) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Lecture de la base de correction…</p>
      </div>
    );
  }

  const c = etat.couts;
  const visibles = etat.matieres.filter((m) => m.visibilite !== 'draft').length;
  const usd = (n: number) => (n * c.usd_par_copie).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* En-tête */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-purple-700 font-medium">Les Matinées du Bac · administration</p>
            <h1 className="text-3xl font-bold text-gray-900">Pilotage de la correction</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>à jour il y a {depuis} s</span>
            <button
              type="button"
              onClick={charger}
              className="px-3 py-1.5 rounded-full bg-white border border-gray-200 hover:border-purple-300 text-gray-700 shadow-sm"
            >
              ↻ Actualiser
            </button>
          </div>
        </header>

        {erreur && (
          <p className="text-xs text-red-600">Dernier rafraîchissement en erreur : {erreur} (données affichées : précédentes)</p>
        )}

        {matiereOuverte && (
          <DetailMatiereVue
            slug={matiereOuverte}
            onRetour={() => setMatiereOuverte(null)}
            onStatut={envoyerStatut}
            occupe={occupe}
          />
        )}

        {/* Santé et lexique restent MONTÉS quand une matière est ouverte
            (simplement masqués) : l'analyse santé est coûteuse en egress
            Supabase, la démonter la relancerait à chaque aller-retour. */}
        <div className={matiereOuverte ? 'hidden' : 'space-y-8'}>
          <SanteSystemeVue onOuvrirMatiere={setMatiereOuverte} />
          <ExplicationPipeline />
        </div>

        {!matiereOuverte && (
        <>
        {/* Synthèse */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { valeur: `${visibles}/${etat.matieres.length}`, legende: 'matières visibles au dépôt' },
            { valeur: String(c.corrections_7j), legende: 'copies corrigées sur 7 jours' },
            { valeur: usd(c.corrections_30j), legende: 'dépense estimée sur 30 jours' },
            { valeur: String(etat.retours.length), legende: 'retours de profs relecteurs' },
          ].map((k) => (
            <div key={k.legende} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{k.valeur}</p>
              <p className="text-xs text-gray-500 mt-1">{k.legende}</p>
            </div>
          ))}
        </section>

        {/* Les alertes détaillées vivent dans « Santé du système » ; on ne
            garde ici que celle que la santé ne voit pas (base CRM muette). */}
        {!etat.sessions_disponibles && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            ⚠️ Base CRM injoignable d’ici : les dates de sessions ne sont pas affichées.
          </p>
        )}

        {/* Matières */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Matières</h2>
            <p className="text-xs text-gray-500">
              L’interrupteur rend la matière visible dans « Déposer une copie » — vert = tout, ambre = en partie.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {etat.matieres.map((m) => (
              <CarteMatiere
                key={m.matiere}
                m={m}
                onStatut={envoyerStatut}
                occupe={occupe}
                onToutVoir={() => setMatiereOuverte(m.matiere)}
              />
            ))}
          </div>
        </section>

        {/* Corrections en direct */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Corrections en direct</h2>
          <p className="text-xs text-gray-500 mb-3">
            Les 60 dernières copies déposées, de la plus récente à la plus ancienne. La note est la note interne exacte —
            l’élève, lui, voit une fourchette.
          </p>
          <TableCorrections lignes={etat.corrections} />
        </section>

        {/* Coûts */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Dépense Anthropic estimée</h2>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {[
              { n: c.corrections_7j, l: '7 jours' },
              { n: c.corrections_30j, l: '30 jours' },
              { n: c.corrections_total, l: 'depuis le début' },
            ].map((p) => (
              <div key={p.l} className="rounded-xl bg-gray-50 p-3">
                <p className="text-lg font-bold text-gray-900">{usd(p.n)}</p>
                <p className="text-xs text-gray-500">
                  {p.n} copie{p.n > 1 ? 's' : ''} · {p.l}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Estimation à ~{c.usd_par_copie.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} par copie
            (transcription + correction + dossier). Le seul plafond dur reste celui de{' '}
            <a href="https://console.anthropic.com" target="_blank" className="text-purple-700 hover:underline">
              console.anthropic.com
            </a>{' '}
            — à poser si ce n’est pas déjà fait.
          </p>
        </section>

        {/* Retours profs */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Retours des profs relecteurs</h2>
          <BlocRetours retours={etat.retours} />
        </section>
        </>
        )}

        <footer className="text-center text-xs text-gray-400 pb-8">
          Données lues en direct dans la base du pipeline · rafraîchies toutes les 30 s.
        </footer>
      </div>
    </div>
  );
}
