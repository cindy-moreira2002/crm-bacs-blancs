'use client';

/**
 * Vue « tout voir » d'une matière : tout ce que Supabase contient pour elle,
 * lisible sans mettre les pieds dans Supabase. Diagnostics en tête, puis
 * barèmes (critères, paliers, taxonomie), sujets avec leurs copies étalons,
 * gabarits du dossier élève, corrections et retours de la matière.
 *
 * Source : GET /api/admin/correction/matiere/[slug].
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  DetailMatiere as Detail,
  Diagnostic,
  EtalonDetail,
  GrilleDetail,
  SujetDetail,
} from '@/lib/pipelineDetail';

function dateCourte(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Briques ----------------------------------------------------------

function Etat({ status }: { status: string }) {
  return status === 'active' ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">visible</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">brouillon</span>
  );
}

function Section({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="font-bold text-gray-900">{titre}</h3>
      {sousTitre && <p className="text-xs text-gray-500 mt-0.5 mb-3">{sousTitre}</p>}
      {!sousTitre && <div className="mb-3" />}
      {children}
    </section>
  );
}

function BoutonCopier({ valeur, libelle }: { valeur: string; libelle: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(valeur);
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
      }}
      className="px-2.5 py-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs hover:bg-purple-100 transition-colors"
    >
      {copie ? '✓ copié' : libelle}
    </button>
  );
}

// --- Diagnostics ------------------------------------------------------

function BlocDiagnostics({ diags }: { diags: Diagnostic[] }) {
  const style: Record<Diagnostic['niveau'], { boite: string; icone: string }> = {
    bloquant: { boite: 'bg-red-50 border-red-200 text-red-800', icone: '⛔' },
    attention: { boite: 'bg-amber-50 border-amber-200 text-amber-800', icone: '⚠️' },
    ok: { boite: 'bg-emerald-50 border-emerald-200 text-emerald-800', icone: '✅' },
  };
  return (
    <div className="space-y-2">
      {diags.map((d, i) => (
        <div key={i} className={`border rounded-xl px-3 py-2 text-sm flex gap-2 ${style[d.niveau].boite}`}>
          <span className="shrink-0">{style[d.niveau].icone}</span>
          <div>
            <p>{d.texte}</p>
            {d.piste && <p className="text-xs opacity-75 mt-0.5">→ {d.piste}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Barèmes ----------------------------------------------------------

function CarteGrille({ g }: { g: GrilleDetail }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-semibold text-gray-800 text-sm">
          {g.label}
          <span className="ml-2 text-xs font-normal text-gray-400">
            {g.id} · v{String(g.version ?? '?')}
          </span>
        </p>
        <div className="flex items-center gap-2">
          {g.bareme_total != null && (
            <span className="text-xs text-gray-500">
              noté sur <b>{g.bareme_total}</b>
              {g.bareme_total !== 20 && (
                <span className={g.echelle_ok ? 'text-emerald-600' : 'text-red-600'}>
                  {' '}
                  · échelle /20 {g.echelle_ok ? 'expliquée ✓' : 'MANQUANTE'}
                </span>
              )}
            </span>
          )}
          <Etat status={g.status} />
        </div>
      </div>

      {g.principle && <p className="text-xs text-gray-500 italic mt-2">{g.principle}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {g.criteres.map((c) => (
          <details key={c.code} className="group">
            <summary className="cursor-pointer list-none inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-purple-100 text-xs text-gray-700">
              <b>{c.code}</b> {c.name}
              {c.maximum_score != null && <span className="text-gray-400">/{c.maximum_score}</span>}
            </summary>
            {c.levels && (
              <div className="mt-1 mb-2 ml-2 border-l-2 border-purple-200 pl-3 space-y-1">
                {Object.entries(c.levels)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([palier, description]) => (
                    <p key={palier} className="text-[11px] text-gray-600">
                      <b className="text-purple-700">{palier} pt</b> — {description}
                    </p>
                  ))}
              </div>
            )}
          </details>
        ))}
      </div>

      <div className="mt-3 text-[11px] text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>consigne correcteur : {g.system_prompt_chars.toLocaleString('fr-FR')} caractères</span>
        <span>garde-fous : {g.guardrails.length}</span>
        <span>
          taxonomie d’erreurs : {g.taxonomie.length > 0 ? `${g.taxonomie.length} codes` : 'aucune'}
        </span>
        {g.official_basis && <span title={g.official_basis}>base officielle ✓</span>}
      </div>

      {g.taxonomie.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-purple-700 hover:underline">voir les codes d’erreur</summary>
          <ul className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {g.taxonomie.map((t) => (
              <li key={t.code} className="text-[11px] text-gray-600">
                <b>{t.code}</b>
                {t.description && ` — ${t.description}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// --- Étalons ----------------------------------------------------------

function TableEtalons({ etalons }: { etalons: EtalonDetail[] }) {
  if (!etalons.length) return <p className="text-xs text-amber-700">Aucune copie étalon pour ce sujet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
            <th className="py-1 pr-3 font-medium">Note /20</th>
            <th className="py-1 pr-3 font-medium">Profil</th>
            <th className="py-1 pr-3 font-medium">Origine</th>
            <th className="py-1 pr-3 font-medium">Validation prof</th>
          </tr>
        </thead>
        <tbody>
          {etalons.map((e) => (
            <tr key={e.id} className="border-b border-gray-50 align-top">
              <td className="py-1.5 pr-3 font-bold text-gray-900">{e.note_sur_20 ?? '—'}</td>
              <td className="py-1.5 pr-3 text-gray-600 max-w-[360px]">
                <details>
                  <summary className="cursor-pointer list-none hover:text-purple-700">{e.profil ?? e.role ?? e.id}</summary>
                  {e.forces && (
                    <p className="mt-1 text-emerald-700">
                      <b>Forces :</b> {e.forces}
                    </p>
                  )}
                  {e.limites && (
                    <p className="mt-0.5 text-red-700">
                      <b>Limites :</b> {e.limites}
                    </p>
                  )}
                </details>
              </td>
              <td className="py-1.5 pr-3">
                {e.origine === 'synthetique' ? (
                  <span className="text-amber-700" title={e.warning ?? undefined}>
                    synthétique
                  </span>
                ) : (
                  <span className="text-emerald-700 font-medium">réelle</span>
                )}
              </td>
              <td className="py-1.5 pr-3">
                {e.validation_status === 'validated' ? (
                  <span className="text-emerald-700 font-medium">validée ✓</span>
                ) : (
                  <span className="text-gray-400">{e.validation_status ?? '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarteSujet({ s, onStatut, occupe }: { s: SujetDetail; onStatut: (corps: Record<string, string>) => void; occupe: boolean }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm">{s.libelle}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {s.id} · {s.label_exercice} · {s.etalons.length} étalon{s.etalons.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={occupe}
          onClick={() => onStatut({ cible: 'sujet', sujet_id: s.id, statut: s.status === 'active' ? 'draft' : 'active' })}
          className={`shrink-0 px-2 py-0.5 rounded-full border text-[11px] transition-colors disabled:opacity-40 ${
            s.status === 'active'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {s.status === 'active' ? 'visible au dépôt' : 'brouillon'}
        </button>
      </div>

      {s.warning && <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">{s.warning}</p>}

      {(s.pieges.length > 0 || s.attendus.length > 0) && (
        <div className="mt-2 grid sm:grid-cols-2 gap-3">
          {s.pieges.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-purple-700">
                {s.pieges.length} pièges surveillés par le correcteur
              </summary>
              <ul className="mt-1 space-y-0.5">
                {s.pieges.map((p, i) => (
                  <li key={i} className="text-[11px] text-gray-600">• {p}</li>
                ))}
              </ul>
            </details>
          )}
          {s.attendus.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-purple-700">
                {s.attendus.length} attendus / critères spéciaux
              </summary>
              <ul className="mt-1 space-y-0.5">
                {s.attendus.map((a, i) => (
                  <li key={i} className="text-[11px] text-gray-600">• {a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-3">
        <TableEtalons etalons={s.etalons} />
      </div>
    </div>
  );
}

// --- Vue principale ---------------------------------------------------

export function DetailMatiereVue({
  slug,
  onRetour,
  onStatut,
  occupe,
}: {
  slug: string;
  onRetour: () => void;
  onStatut: (corps: Record<string, string>) => void;
  occupe: boolean;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/correction/matiere/${slug}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setDetail(d);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  // Après un interrupteur : l'état global est rechargé par le parent, on
  // recharge aussi le détail pour rester en phase.
  const statutPuisRecharge = useCallback(
    (corps: Record<string, string>) => {
      onStatut({ ...corps, matiere: slug });
      setTimeout(charger, 800);
    },
    [onStatut, slug, charger],
  );

  if (erreur) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6">
        <p className="text-sm text-red-600 font-mono">{erreur}</p>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={charger} className="text-sm text-purple-700 hover:underline">Réessayer</button>
          <button type="button" onClick={onRetour} className="text-sm text-gray-500 hover:underline">← Retour</button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return <p className="text-gray-500 animate-pulse py-12 text-center">Lecture complète de la matière…</p>;
  }

  const etalonsTotal = detail.sujets.reduce((n, s) => n + s.etalons.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRetour}
            className="px-3 py-1.5 rounded-full bg-white border border-gray-200 hover:border-purple-300 text-gray-700 text-sm shadow-sm"
          >
            ← Toutes les matières
          </button>
          <h2 className="text-xl font-bold text-gray-900">{detail.label} — vue complète</h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <BoutonCopier valeur={`${window.location.origin}${detail.liens.relecture}`} libelle="copier le lien relecture prof" />
          <a href={detail.liens.depot} target="_blank" className="text-purple-700 hover:underline">
            dépôt ↗
          </a>
          <a href={detail.liens.supabase_tables} target="_blank" className="text-gray-400 hover:underline" title="Pour les curieuses seulement — tout est déjà ici.">
            Supabase ↗
          </a>
        </div>
      </div>

      <Section titre="Diagnostics" sousTitre="Calculés à l’instant sur la base réelle — bloquants d’abord.">
        <BlocDiagnostics diags={detail.diagnostics} />
      </Section>

      <Section
        titre={`Barèmes (${detail.grilles.length})`}
        sousTitre="Cliquer un critère déplie ses paliers de notation ; la consigne correcteur est le system_prompt envoyé à l’IA."
      >
        <div className="space-y-3">
          {detail.grilles.map((g) => (
            <CarteGrille key={g.id} g={g} />
          ))}
          {detail.grilles.length === 0 && <p className="text-sm text-red-600">Aucun barème en base pour cette matière.</p>}
        </div>
      </Section>

      <Section
        titre={`Sujets & copies étalons (${detail.sujets.length} sujets · ${etalonsTotal} étalons)`}
        sousTitre="Chaque sujet devrait avoir des étalons étagés du très insuffisant à l’excellent — ce sont eux qui calent la sévérité de la note."
      >
        <div className="space-y-3">
          {detail.sujets.map((s) => (
            <CarteSujet key={s.id} s={s} onStatut={statutPuisRecharge} occupe={occupe} />
          ))}
          {detail.sujets.length === 0 && <p className="text-sm text-red-600">Aucun sujet en base pour cette matière.</p>}
        </div>
      </Section>

      {detail.orphelins.length > 0 && (
        <Section
          titre={`Étalons orphelins (${detail.orphelins.length})`}
          sousTitre="Rattachés à la matière par leur épreuve mais liés à aucun sujet existant : ils ne participent plus au calage des notes."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
                  <th className="py-1 pr-3 font-medium">Id</th>
                  <th className="py-1 pr-3 font-medium">Épreuve</th>
                  <th className="py-1 pr-3 font-medium">Support d’origine</th>
                  <th className="py-1 pr-3 font-medium">Note /20</th>
                  <th className="py-1 pr-3 font-medium">Origine</th>
                </tr>
              </thead>
              <tbody>
                {detail.orphelins.map((o) => (
                  <tr key={o.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 font-mono text-gray-500">{o.id}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{o.exercise_type}</td>
                    <td className="py-1.5 pr-3 text-gray-600 max-w-[280px] truncate" title={o.support ?? undefined}>
                      {o.support ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 font-bold text-gray-900">{o.note_sur_20 ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      {o.origine === 'reel' ? (
                        <span className="text-emerald-700 font-medium">réelle</span>
                      ) : (
                        <span className="text-amber-700">synthétique</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section titre={`Dossiers élève (${detail.gabarits.length})`} sousTitre="Le gabarit transforme la correction en dossier remis à l’élève.">
        <div className="grid sm:grid-cols-2 gap-2">
          {detail.gabarits.map((g) => (
            <div key={g.id} className="border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 font-medium truncate">{g.label}</p>
                <p className="text-[11px] text-gray-400">
                  {g.audience} · v{String(g.version ?? '?')} · consigne {g.system_prompt_chars.toLocaleString('fr-FR')} car.
                  {g.output_format ? ` · ${g.output_format}` : ''}
                </p>
              </div>
              <Etat status={g.status} />
            </div>
          ))}
          {detail.gabarits.length === 0 && <p className="text-sm text-red-600">Aucun gabarit en base.</p>}
        </div>
      </Section>

      <Section titre={`Corrections de la matière (${detail.corrections.length})`} sousTitre="Les 100 dernières, de la plus récente à la plus ancienne.">
        {detail.corrections.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune copie corrigée pour cette matière — la page de relecture prof n’aura pas d’exemple corrigé à montrer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-gray-400 border-b border-gray-100">
                  <th className="py-1 pr-3 font-medium">Quand</th>
                  <th className="py-1 pr-3 font-medium">Sujet</th>
                  <th className="py-1 pr-3 font-medium">Élève</th>
                  <th className="py-1 pr-3 font-medium">État</th>
                  <th className="py-1 pr-3 font-medium">Note</th>
                  <th className="py-1 pr-3 font-medium">Dossier</th>
                </tr>
              </thead>
              <tbody>
                {detail.corrections.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-gray-500">{dateCourte(c.created_at)}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.subject_id ?? c.exercise_type}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.student_name ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      <span className={c.status.includes('failed') ? 'text-red-600 font-medium' : c.status.startsWith('corrected') ? 'text-emerald-700' : 'text-blue-700'}>
                        {c.status}
                      </span>
                      {c.processing_error && (
                        <p className="text-[10px] text-red-500 max-w-[220px]" title={c.processing_error}>
                          {c.processing_error.slice(0, 90)}
                        </p>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-bold text-gray-900">{c.note ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      {c.status.startsWith('corrected') ? (
                        <a href={`/dossier/${c.id}`} target="_blank" className="text-purple-700 hover:underline">
                          ouvrir ↗
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section titre={`Retours des profs relecteurs (${detail.retours.length})`}>
        {detail.retours.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun retour pour cette matière. Le lien de relecture est à copier en haut de page et à envoyer au prof.
          </p>
        ) : (
          <div className="space-y-2">
            {detail.retours.map((r) => (
              <div key={r.id} className="border border-gray-200 rounded-xl p-3">
                <p className="text-sm font-semibold text-gray-800">
                  {r.prof_nom} <span className="text-gray-400 font-normal">· {r.prof_email}</span>
                  <span className="text-gray-400 font-normal float-right text-xs">{dateCourte(r.created_at)}</span>
                </p>
                <dl className="mt-1 space-y-0.5">
                  {Object.entries(r.reponses ?? {}).map(([k, v]) =>
                    v ? (
                      <div key={k} className="text-xs">
                        <dt className="inline font-medium text-gray-500">{k.replace(/_/g, ' ')} : </dt>
                        <dd className="inline text-gray-700">{String(v)}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
