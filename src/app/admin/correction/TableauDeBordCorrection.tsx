'use client';

/**
 * Tableau de bord du pipeline de correction (côté client).
 *
 * Une seule source : GET /api/admin/correction/etat, rechargé toutes les
 * 30 secondes et après chaque action. Les interrupteurs passent par
 * POST /api/admin/correction/statut.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CorrectionLigne, MatiereEtat, RetourProf, SnapshotPipeline } from '@/lib/pipelineEtat';
import { DetailMatiereVue } from './DetailMatiere';
import { ExplicationPipeline } from './ExplicationPipeline';
import { SanteSystemeVue } from './SanteSysteme';
import { estSessionDeTest, LIBELLE_PREMIERE_SESSION } from '@/lib/calendrier';

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

/**
 * La couche qui produit la NOTE : un bac blanc = un barème propre au sujet,
 * verrouillé avant la première copie. Ce bandeau dit en un coup d'œil combien
 * sont prêts, et surtout combien corrigent SANS avoir été calibrés.
 */
function BandeauBaremes({
  b,
  matieres,
}: {
  b: SnapshotPipeline['baremes'];
  matieres: MatiereEtat[];
}) {
  // Les matières réellement notées par un barème par sujet. HGGSP n'en est pas :
  // elle est notée par une grille rédigée, qui a son propre bandeau.
  const parBareme = matieres.filter((m) => m.examens.some((e) => e.statut === 'correction_open'));
  const nonCalibres = matieres
    .flatMap((m) => m.examens)
    .filter((e) => e.statut === 'correction_open' && e.copies_comparees === 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🎯 Les épreuves à questions : un barème par sujet</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            <strong>Seulement</strong> pour les épreuves où les points dépendent des questions posées
            (maths, physique-chimie, brevet) : « exercice 2 question b » vaut 3 points{' '}
            <em>dans ce sujet-là</em>, donc chaque bac blanc a son barème. Les épreuves rédigées, elles,
            gardent une grille commune à tous les sujets — il n’y a rien à écrire pour elles ici.
          </p>
        </div>
        <Link
          href="/admin/bareme"
          className="text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-full px-3 py-1.5 whitespace-nowrap"
        >
          Ouvrir les barèmes →
        </Link>
      </div>

      {b.examens === 0 ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Aucun bac blanc à questions n’a encore son barème. Les matières concernées ne peuvent donc
          pas corriger.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { valeur: String(b.examens), legende: 'bacs blancs avec barème' },
              { valeur: String(b.verrouilles), legende: 'barèmes verrouillés' },
              { valeur: String(b.corrections_ouvertes), legende: 'corrections ouvertes' },
              { valeur: String(b.etalons), legende: 'copies étalons' },
              { valeur: String(b.copies_comparees), legende: 'copies comparées IA / profs' },
            ].map((k) => (
              <div key={k.legende} className="rounded-xl border border-gray-200 p-3">
                <p className="text-xl font-bold text-gray-900">{k.valeur}</p>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{k.legende}</p>
              </div>
            ))}
          </div>

          {nonCalibres.length > 0 && (
            <p className="mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              ⚠️ {nonCalibres.length} bac(s) blanc(s) corrigent des copies d’élèves sans qu’aucune
              copie étalon n’ait été comparée : {nonCalibres.map((e) => e.titre).join(', ')}. Le
              barème n’a jamais été confronté à un correcteur humain.
            </p>
          )}

          {parBareme.length > 0 && (
            <p className="mt-3 text-[11px] text-gray-500">
              Notées par un barème de sujet :{' '}
              <strong>{parBareme.map((m) => m.label).join(', ')}</strong>. Les autres matières sont
              notées par leur grille commune ou leur grille rédigée — c’est voulu, pas un retard.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * La 3ᵉ couche : les grilles RÉDIGÉES (HGGSP). Ni grille de compétences, ni
 * barème par sujet — des critères décrits, une note analytique sur 20 convertie
 * en note officielle, et un verrouillage en base.
 *
 * Le bandeau existe pour dire deux choses qu'on ne voit nulle part ailleurs :
 * une grille non verrouillée rend TOUTES ses notes provisoires, et un étalon
 * qui n'a pas été corrigé par un humain ne calibre rien.
 */
function BandeauRedigees({
  r,
  matieres,
}: {
  r: SnapshotPipeline['redigees'];
  matieres: MatiereEtat[];
}) {
  if (r.grilles === 0) return null;

  const concernees = matieres.filter((m) => m.grilles_redigees.length > 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">📝 Les épreuves rédigées : grilles à critères</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Une grille par exercice, critère par critère. La copie est notée sur une échelle
            analytique de 20 points, convertie automatiquement en note officielle. Tant que la grille
            n’est pas verrouillée, chaque note est <strong>provisoire</strong>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { valeur: String(r.grilles), legende: 'grilles rédigées' },
          { valeur: String(r.verrouillees), legende: 'verrouillées' },
          { valeur: String(r.copies), legende: 'copies notées' },
          { valeur: `${r.etalons_humains}/${r.etalons}`, legende: 'étalons corrigés par un prof' },
          { valeur: String(r.relectures_ouvertes), legende: 'relectures en attente' },
        ].map((k) => (
          <div key={k.legende} className="rounded-xl border border-gray-200 p-3">
            <p className="text-xl font-bold text-gray-900">{k.valeur}</p>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{k.legende}</p>
          </div>
        ))}
      </div>

      {r.en_calibration > 0 && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          ⚠️ {r.en_calibration} grille(s) pas encore verrouillée(s) : les notes produites sont
          affichées en fourchette à l’élève et doivent être validées par un professeur.
        </p>
      )}

      {r.etalons_humains === 0 && r.etalons > 0 && (
        <p className="mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          ⚠️ Aucune des {r.etalons} copies étalons n’a été corrigée par un professeur. L’échelle
          repose entièrement sur des repères inventés — c’est le seul vrai remède à une notation
          trop sévère ou trop généreuse.
        </p>
      )}

      {r.examens_complets > 0 && (
        <p className={`mt-2 text-xs rounded-xl px-3 py-2 border ${
          r.groupes_complets > 0
            ? 'text-gray-600 bg-gray-50 border-gray-200'
            : 'text-amber-800 bg-amber-50 border-amber-200'
        }`}>
          Bac blanc complet (deux exercices, note finale sur 20) : {r.examens_complets} préparé(s),{' '}
          {r.groupes_complets} copie(s) réellement déposée(s) sous cette forme.
          {r.groupes_complets === 0 && ' Ce chemin n’a donc jamais servi pour de vrai.'}
        </p>
      )}

      {concernees.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-500">
          Notées par grille rédigée : <strong>{concernees.map((m) => m.label).join(', ')}</strong>.
        </p>
      )}
    </section>
  );
}

function CarteMatiere({
  m,
  onStatut,
  occupe,
  onToutVoir,
  depliee = false,
  sujetVise = null,
}: {
  m: MatiereEtat;
  onStatut: (corps: Record<string, string>) => void;
  occupe: boolean;
  onToutVoir: () => void;
  /** Arrivée depuis « À faire » : la carte s'ouvre déjà dépliée. */
  depliee?: boolean;
  /** Le sujet exact sur lequel la tâche portait, mis en évidence. */
  sujetVise?: string | null;
}) {
  const [ouverte, setOuverte] = useState(depliee);
  const t = m.totaux;
  const etalonsReels = t.etalons - t.etalons_synthetiques;

  // La couche 1 en premier : c'est elle qui donne la note.
  const ouverts = m.examens.filter((e) => e.statut === 'correction_open');
  const compares = m.examens.reduce((n, e) => n + e.copies_comparees, 0);

  // La couche 3, quand c'est elle qui note ici. Une grille non verrouillée rend
  // toutes ses notes provisoires : c'est le point qui prime sur tout le reste.
  const VERROUILLEES = ['locked', 'in_use'];
  const redigees = m.grilles_redigees;
  const redigeesProvisoires = redigees.filter((g) => !VERROUILLEES.includes(g.statut)).length;
  const etalonsHumains = redigees.reduce((n, g) => n + g.corrections_humaines, 0);
  const relecturesRedigees = redigees.reduce((n, g) => n + g.relectures_ouvertes, 0);

  // Selon le moteur, les deux premiers points de la check-list ne parlent pas
  // de la même chose : afficher « aucun barème propre » à une matière notée par
  // grille rédigée serait un faux reproche.
  const pointsMoteur: { ok: boolean; texte: string }[] = redigees.length
    ? [
        {
          ok: redigeesProvisoires === 0,
          texte:
            redigeesProvisoires === 0
              ? `${redigees.length} grille(s) rédigée(s) verrouillée(s) — les notes sont définitives`
              : `${redigeesProvisoires} grille(s) rédigée(s) sur ${redigees.length} pas encore verrouillée(s) : notes provisoires`,
        },
        {
          ok: etalonsHumains > 0,
          texte:
            etalonsHumains > 0
              ? `${etalonsHumains} copie(s) étalon corrigée(s) par un professeur`
              : 'Aucune copie étalon corrigée par un professeur : l’échelle n’a jamais été confrontée à un humain',
        },
      ]
    : m.moteur_attendu === 'bareme_sujet'
      ? [
          // Épreuve à questions : le barème dépend du sujet, donc il en faut
          // un par bac blanc. Son absence est un vrai manque.
          {
            ok: m.examens.length > 0,
            texte:
              m.examens.length > 0
                ? `${m.examens.length} bac(s) blanc(s) avec leur barème, dont ${ouverts.length} en correction`
                : 'Aucun bac blanc n’a encore son barème question par question',
          },
          {
            // Le point qui manquait : ouverte au dépôt sans barème branché,
            // les copies sont notées à la grille de compétences sans que rien
            // ne le dise.
            ok: m.moteur_note === 'bareme_sujet' || m.moteur_note === 'mixte',
            texte:
              m.moteur_note === 'bareme_sujet' || m.moteur_note === 'mixte'
                ? 'Les copies sont bien notées par le barème du sujet'
                : m.visibilite === 'draft'
                  ? 'Barème pas encore branché (la matière est fermée, rien ne part de travers)'
                  : '⚠️ Ouverte au dépôt SANS barème branché : les copies sont notées par la grille de compétences',
          },
          {
            ok: compares > 0,
            texte:
              compares > 0
                ? `${compares} copie(s) étalon comparée(s) IA / professeurs`
                : 'Barème jamais confronté à un correcteur humain (aucune copie comparée)',
          },
        ]
      : [
          // Épreuve rédigée : une grille commune suffit, et c'est la décision.
          // Réclamer ici un « barème propre au sujet » serait un faux reproche :
          // il n'y en aura jamais, et il n'en faut pas.
          {
            ok: t.grilles_actives > 0,
            texte:
              t.grilles_actives > 0
                ? `Notée par sa grille commune — rien à écrire à chaque nouveau sujet`
                : 'Aucune grille active : cette matière ne peut rien noter',
          },
        ];

  const points: { ok: boolean; texte: string }[] = [
    ...pointsMoteur,
    ...(relecturesRedigees > 0
      ? [{ ok: false, texte: `${relecturesRedigees} relecture(s) humaine(s) en attente sur des copies notées` }]
      : []),
    { ok: t.grilles_actives === t.grilles && t.grilles > 0, texte: `Grilles de compétences actives (${t.grilles_actives}/${t.grilles})` },
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
    <div
      id={`matiere-${m.matiere}`}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        depliee ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'
      }`}
    >
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900">{m.label}</h3>
            {m.visibilite === 'active' && <Pastille ton="vert">visible au dépôt</Pastille>}
            {m.visibilite === 'partielle' && <Pastille ton="orange">partiellement visible</Pastille>}
            {m.visibilite === 'draft' && <Pastille ton="gris">brouillon</Pastille>}
            {/* D'où sort la note ici : c'est la question la plus importante
                de cette carte, elle se lit donc au premier coup d'œil. */}
            {m.moteur_note === 'bareme_sujet' && <Pastille ton="bleu">note : barème du sujet</Pastille>}
            {m.moteur_note === 'criteres_rediges' && <Pastille ton="bleu">note : grille rédigée</Pastille>}
            {m.moteur_note === 'mixte' && <Pastille ton="orange">note : plusieurs moteurs</Pastille>}
            {m.moteur_note === 'grille_generique' && m.visibilite !== 'draft' && (
              <Pastille ton="gris">note : grille de compétences</Pastille>
            )}
            {redigeesProvisoires > 0 && <Pastille ton="orange">notes provisoires</Pastille>}
            {/* Le moteur en service n'est pas celui que la forme de l'épreuve
                appelle : la copie est notée, mais autrement que décidé. */}
            {m.moteur_note !== m.moteur_attendu && m.moteur_note !== 'mixte' && (
              <Pastille ton="rouge">pas le bon moteur</Pastille>
            )}
          </div>
          {m.session ? (
            <p className="text-xs text-gray-500 mt-1">
              {/* Un essai n'a pas d'échéance : pas de J−N, sinon on prépare
                  dans l'urgence une épreuve qui n'aura pas lieu. */}
              {estSessionDeTest(m.session.date_epreuve) ? (
                <>
                  Essai du{' '}
                  {new Date(m.session.date_epreuve + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  <span className="text-gray-400"> · pas une vraie session</span>
                </>
              ) : (
                <>
                  Session le{' '}
                  {new Date(m.session.date_epreuve + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  {jours !== null && jours >= 0 && (
                    <span className={jours <= 14 ? 'text-red-600 font-semibold' : 'text-gray-500'}> · J−{jours}</span>
                  )}
                </>
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
              className={`h-full rounded-full ${prets >= points.length - 1 ? 'bg-emerald-500' : prets >= points.length - 3 ? 'bg-amber-400' : 'bg-red-400'}`}
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

          {/* Les bacs blancs et leurs barèmes — la couche qui donne la note */}
          {m.examens.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">Barèmes par sujet</p>
              {m.examens.map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/bareme/${e.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-3 hover:border-purple-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 min-w-0 truncate">{e.titre}</p>
                    {e.statut === 'correction_open' ? (
                      <Pastille ton="vert">corrections ouvertes</Pastille>
                    ) : e.statut_version === 'locked' ? (
                      <Pastille ton="bleu">barème verrouillé</Pastille>
                    ) : (
                      <Pastille ton="gris">{e.statut}</Pastille>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Version {e.version ?? '—'} · {e.total_points ?? '—'} / {e.max_score ?? 20} points ·{' '}
                    {e.etalons} étalon(s) · {e.copies} copie(s) notée(s)
                  </p>
                  {e.blocages > 0 && (
                    <p className="text-[11px] text-red-700 mt-1">
                      {e.blocages} blocage(s) : le barème ne peut pas être verrouillé.
                    </p>
                  )}
                  {e.versions_utilisees > 1 && (
                    <p className="text-[11px] text-red-700 mt-1">
                      ⚠️ {e.versions_utilisees} versions de barème dans le même lot — deux élèves
                      n’ont pas été notés pareil.
                    </p>
                  )}
                  {e.copies_comparees === 0 ? (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Calibration non réalisée : aucune copie étalon corrigée des deux côtés.
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500 mt-1">
                      Calibration : {e.copies_comparees} copie(s) comparée(s), biais{' '}
                      {e.biais_moyen !== null && e.biais_moyen > 0 ? '+' : ''}
                      {e.biais_moyen ?? '—'}
                      {e.biais_moyen !== null && Math.abs(e.biais_moyen) >= 1 && (
                        <span className="text-amber-700 font-semibold"> — écart systématique, reprendre le barème</span>
                      )}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* Les grilles rédigées — l'autre couche qui donne la note */}
          {redigees.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">Grilles rédigées</p>
              {redigees.map((g) => (
                <div key={g.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800 min-w-0 truncate">{g.libelle}</p>
                    {VERROUILLEES.includes(g.statut) ? (
                      <Pastille ton="vert">{g.statut === 'in_use' ? 'en service' : 'verrouillée'}</Pastille>
                    ) : g.statut === 'validated' ? (
                      <Pastille ton="bleu">validée, pas verrouillée</Pastille>
                    ) : (
                      <Pastille ton="orange">{g.statut}</Pastille>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Version {g.version} · {g.criteres} critères · {g.max_analytique} pts analytiques →{' '}
                    {g.max_officiel} officiels · {g.copies} copie(s) notée(s)
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Étalons : {g.etalons}
                    {g.etalons_synthetiques > 0 && ` (dont ${g.etalons_synthetiques} inventés)`} ·{' '}
                    {g.corrections_humaines} corrigé(s) par un prof
                    {g.biais_moyen !== null && (
                      <>
                        {' '}· biais {g.biais_moyen > 0 ? '+' : ''}
                        {g.biais_moyen}
                      </>
                    )}
                  </p>
                  {!VERROUILLEES.includes(g.statut) && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Grille non verrouillée : chaque note produite est provisoire et doit être
                      validée par un professeur.
                    </p>
                  )}
                  {g.valide_par && (
                    <p className="text-[11px] text-gray-500 mt-1">Validée par {g.valide_par}.</p>
                  )}
                  {g.relectures_ouvertes > 0 && (
                    <p className="text-[11px] text-red-700 mt-1">
                      {g.relectures_ouvertes} relecture(s) humaine(s) en attente.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

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
                    <li
                      key={s.id}
                      className={`flex items-center justify-between gap-2 text-xs rounded px-1 ${
                        sujetVise === s.id ? 'bg-amber-100 text-gray-900 font-medium' : 'text-gray-600'
                      }`}
                    >
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

function TableCorrections({
  lignes,
  copieVisee,
  onAction,
  occupe,
}: {
  lignes: CorrectionLigne[];
  /** Copie sur laquelle la liste « À faire » a envoyé : on la met en évidence. */
  copieVisee: string | null;
  onAction: (id: string, action: 'relancer' | 'dossier') => void;
  occupe: boolean;
}) {
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
            <th className="py-2 px-3 font-medium">Réparer</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((c) => (
            <tr
              key={c.id}
              id={`copie-${c.id}`}
              className={`border-b border-gray-100 align-top ${
                copieVisee === c.id
                  ? 'bg-amber-100 ring-2 ring-amber-400 ring-inset'
                  : 'hover:bg-purple-50/40'
              }`}
            >
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
              {/* Réparer sur place : c'est ici qu'on atterrit depuis « À faire ».
                  Les deux actions rappellent l'API Anthropic, donc elles
                  demandent confirmation — ce ne sont pas des boutons gratuits. */}
              <td className="py-2 px-3 whitespace-nowrap">
                {c.status.includes('failed') || !c.status.startsWith('corrected') ? (
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => onAction(c.id, 'relancer')}
                    className="text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-full px-2.5 py-1 disabled:opacity-40"
                  >
                    Relancer
                  </button>
                ) : c.status.startsWith('corrected') ? (
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => onAction(c.id, 'dossier')}
                    className="text-[11px] font-medium text-purple-700 border border-purple-200 hover:bg-purple-50 rounded-full px-2.5 py-1 disabled:opacity-40"
                  >
                    Refaire le dossier
                  </button>
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

  // --- Atterrissage depuis « À faire » --------------------------------
  // La liste des tâches envoie ici avec l'objet exact dans l'adresse
  // (?copie=…, ?matiere=…, ?sujet=…). Sans ça, on retombe en haut d'une page
  // de trois écrans et il faut chercher soi-même la ligne concernée.
  const [vise, setVise] = useState<{ copie?: string; matiere?: string; sujet?: string }>({});
  const atterri = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const copie = p.get('copie') ?? undefined;
      const matiere = p.get('matiere') ?? undefined;
      const sujet = p.get('sujet') ?? undefined;
      if (copie || matiere || sujet) setVise({ copie, matiere, sujet });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Le défilement n'a de sens qu'une fois les données arrivées : avant, la
  // ligne visée n'existe pas encore dans la page. Une seule fois, sinon le
  // rafraîchissement automatique ramènerait la page en arrière toutes les 30 s.
  useEffect(() => {
    if (!etat || atterri.current) return;
    const ancre = vise.copie ? `copie-${vise.copie}` : vise.matiere ? `matiere-${vise.matiere}` : null;
    if (!ancre) return;

    // Trois tentatives espacées, et pas une seule : la page continue de
    // grandir après l'arrivée des données (l'analyse de santé s'insère
    // au-dessus), ce qui déplace la ligne visée sous nos pieds.
    // `behavior: 'auto'` volontairement — le défilement animé est ignoré dans
    // certains navigateurs pilotés, et sur 3 000 pixels il est surtout pénible.
    const minuteries = [200, 900, 2200].map((delai) =>
      setTimeout(() => {
        const el = document.getElementById(ancre);
        if (!el) return;
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
        atterri.current = true;
      }, delai),
    );
    return () => minuteries.forEach(clearTimeout);
  }, [etat, vise]);

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

  /**
   * Réparer une copie sur place : relancer la chaîne, ou refaire son dossier.
   * Les deux rappellent l'API Anthropic — d'où la confirmation, et le rappel
   * du coût dans la question.
   */
  const agirSurCopie = useCallback(
    async (id: string, action: 'relancer' | 'dossier') => {
      const question =
        action === 'relancer'
          ? 'Relancer cette copie ?\n\nLa lecture et la correction repartent de zéro. Ça rappelle l’IA, donc ça coûte (~0,20 $).'
          : 'Refaire le dossier de cette copie ?\n\nLa note ne bouge pas, seul le dossier de l’élève est reconstruit (~0,05 $).';
      if (!window.confirm(question)) return;
      setOccupe(true);
      try {
        const r = await fetch(`/api/pipeline/correction/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
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
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Trois moteurs de note, à ne pas confondre. Le <strong>barème propre au sujet</strong>,
              question par question, là où il existe. La <strong>grille rédigée</strong>, critère par
              critère, pour les épreuves rédigées (HGGSP) : note analytique sur 20 convertie en note
              officielle. Et la <strong>grille de compétences</strong> partout ailleurs — qui, pour
              les deux premiers, ne produit plus que le <em>diagnostic pédagogique</em>.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {/* Cette page dit ce qui ne va pas dans les mots de la base. Quand
                on cherche quoi FAIRE, c'est l'autre page qu'il faut. */}
            <Link
              href="/admin/a-faire"
              className="font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-full px-3 py-1.5 whitespace-nowrap"
            >
              ✅ Qu’est-ce que je dois faire ?
            </Link>
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
        {/* Couche 1 — la note officielle */}
        <BandeauBaremes b={etat.baremes} matieres={etat.matieres} />

        {/* Couche 3 — les épreuves rédigées */}
        <BandeauRedigees r={etat.redigees} matieres={etat.matieres} />

        <p className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          Les vrais bacs blancs commencent en <strong>{LIBELLE_PREMIERE_SESSION}</strong>. Les sessions
          datées avant sont des essais, faits pour vérifier que la chaîne fonctionne — elles ne
          créent aucune échéance.
        </p>

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
                depliee={vise.matiere === m.matiere}
                sujetVise={vise.matiere === m.matiere ? vise.sujet ?? null : null}
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
          <TableCorrections
            lignes={etat.corrections}
            copieVisee={vise.copie ?? null}
            onAction={agirSurCopie}
            occupe={occupe}
          />
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
