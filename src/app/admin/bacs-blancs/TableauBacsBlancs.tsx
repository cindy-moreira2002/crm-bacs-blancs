'use client';

/**
 * Tableau de bord des bacs blancs (côté client).
 *
 * Une seule source : GET /api/admin/bacs-blancs. Toutes les actions passent
 * par POST sur la même route, puis rechargent l'état — jamais de mise à jour
 * optimiste : ce qui s'affiche est ce que la base contient.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BacBlanc, EtatBacsBlancs, ProfLite, RetourSession, SujetSession } from '@/lib/bacsBlancs';

const TYPES_SUJET = [
  { cle: 'sujet', label: 'Sujet' },
  { cle: 'corrige', label: 'Corrigé' },
  { cle: 'bareme', label: 'Barème' },
  { cle: 'annexe', label: 'Annexe' },
];

const LIBELLES_RETOUR: Record<string, Record<string, string>> = {
  deroulement: { tres_bien: 'Très bien', bien: 'Bien', moyen: 'Moyen', difficile: 'Difficile' },
  duree_adaptee: { trop_court: 'Trop court', juste: 'Juste', trop_long: 'Trop long' },
  difficulte_sujet: { trop_facile: 'Trop facile', adapte: 'Adapté', trop_difficile: 'Trop difficile' },
  niveau_eleves: { faible: 'Faible', heterogene: 'Hétérogène', bon: 'Bon' },
};

const lib = (champ: string, valeur: string | null) =>
  valeur ? (LIBELLES_RETOUR[champ]?.[valeur] ?? valeur) : '—';

function dateLongue(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function Pastille({ ton, children }: { ton: 'vert' | 'orange' | 'rouge' | 'gris'; children: React.ReactNode }) {
  const classes = {
    vert: 'bg-emerald-100 text-emerald-800',
    orange: 'bg-amber-100 text-amber-800',
    rouge: 'bg-red-100 text-red-700',
    gris: 'bg-gray-100 text-gray-600',
  }[ton];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${classes}`}>
      {children}
    </span>
  );
}

function compteARebours(b: BacBlanc) {
  if (b.passe) return <Pastille ton="gris">passé</Pastille>;
  if (b.jours === 0) return <Pastille ton="rouge">aujourd’hui</Pastille>;
  if (b.jours <= 7) return <Pastille ton="rouge">dans {b.jours} j</Pastille>;
  if (b.jours <= 21) return <Pastille ton="orange">dans {b.jours} j</Pastille>;
  return <Pastille ton="vert">dans {b.jours} j</Pastille>;
}

// --- Bloc « sujets » --------------------------------------------------

function BlocSujets({
  bac,
  agir,
  occupe,
  bloque,
}: {
  bac: BacBlanc;
  agir: (corps: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  occupe: boolean;
  bloque: boolean;
}) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState('sujet');
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const deposer = async () => {
    if (!fichier) return;
    setErreur(null);
    setEnvoi(true);
    try {
      // 1) URL signée, 2) téléversement direct vers le Storage, 3) fiche.
      const prep = (await agir({
        action: 'preparer-depot',
        session_id: bac.id,
        fichier_nom: fichier.name,
      })) as { path?: string; signed_url?: string } | null;
      if (!prep?.signed_url || !prep.path) throw new Error('Dépôt impossible.');

      const up = await fetch(prep.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': fichier.type || 'application/octet-stream' },
        body: fichier,
      });
      if (!up.ok) throw new Error('Le téléversement a échoué.');

      await agir({
        action: 'enregistrer-sujet',
        session_id: bac.id,
        type,
        titre: titre || null,
        fichier_path: prep.path,
        fichier_nom: fichier.name,
        fichier_octets: fichier.size,
        visible_prof: visible,
      });
      setFichier(null);
      setTitre('');
      setVisible(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnvoi(false);
    }
  };

  const telecharger = async (s: SujetSession) => {
    const r = (await agir({ action: 'lien-sujet', fichier_path: s.fichier_path })) as { url?: string } | null;
    if (r?.url) window.open(r.url, '_blank', 'noopener');
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800 mb-2">Sujet de l’épreuve</h4>

      {bloque && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Table <code>session_sujets</code> absente : le dépôt est inactif tant que le SQL n’est pas joué.
        </p>
      )}

      {bac.sujets.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Aucun sujet déposé.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {bac.sujets.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm border border-gray-200 rounded-xl px-3 py-2">
              <Pastille ton="gris">{TYPES_SUJET.find((t) => t.cle === s.type)?.label ?? s.type}</Pastille>
              <span className="font-medium text-gray-800">{s.titre || s.fichier_nom || 'sans titre'}</span>
              {s.visible_prof ? (
                <Pastille ton="vert">visible du prof</Pastille>
              ) : (
                <Pastille ton="orange">masqué</Pastille>
              )}
              {s.subject_card_id && (
                <span className="text-xs text-gray-400 font-mono">{s.subject_card_id}</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                {s.fichier_path && (
                  <button
                    type="button"
                    onClick={() => telecharger(s)}
                    disabled={occupe}
                    className="text-xs text-purple-700 hover:underline disabled:opacity-40"
                  >
                    télécharger
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => agir({ action: 'maj-sujet', sujet_id: s.id, visible_prof: !s.visible_prof })}
                  disabled={occupe}
                  className="text-xs text-gray-600 hover:underline disabled:opacity-40"
                >
                  {s.visible_prof ? 'masquer' : 'rendre visible'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Supprimer ce sujet et son fichier ?')) {
                      agir({ action: 'supprimer-sujet', sujet_id: s.id });
                    }
                  }}
                  disabled={occupe}
                  className="text-xs text-red-600 hover:underline disabled:opacity-40"
                >
                  supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
        <label className="text-xs text-gray-600">
          Fichier
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            disabled={bloque}
            className="block mt-1 text-sm file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-purple-100 file:text-purple-700 file:text-xs"
          />
        </label>
        <label className="text-xs text-gray-600">
          Titre
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex. Commentaire — Baudelaire"
            disabled={bloque}
            className="block mt-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-56"
          />
        </label>
        <label className="text-xs text-gray-600">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={bloque}
            className="block mt-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            {TYPES_SUJET.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 flex items-center gap-1.5 pb-2">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} disabled={bloque} />
          visible du prof tout de suite
        </label>
        <button
          type="button"
          onClick={deposer}
          disabled={!fichier || envoi || bloque}
          className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40"
        >
          {envoi ? 'Envoi…' : 'Déposer'}
        </button>
      </div>
      {erreur && <p className="text-xs text-red-600 mt-2">{erreur}</p>}
    </div>
  );
}

// --- Bloc « profs » ---------------------------------------------------

function BlocProfs({
  bac,
  profs,
  agir,
  occupe,
}: {
  bac: BacBlanc;
  profs: ProfLite[];
  agir: (corps: Record<string, unknown>) => Promise<unknown>;
  occupe: boolean;
}) {
  const [choix, setChoix] = useState('');
  const dejaLa = new Set(bac.profs.map((p) => p.id));
  const norm = (s: string) => s.trim().toLowerCase();
  const candidats = profs.filter((p) => !dejaLa.has(p.id) && p.statut_compte !== 'suspendu');
  // Les profs qui déclarent la matière d'abord : c'est presque toujours eux.
  const tries = [
    ...candidats.filter((p) => (p.matieres ?? []).some((m) => norm(m) === norm(bac.matiere))),
    ...candidats.filter((p) => !(p.matieres ?? []).some((m) => norm(m) === norm(bac.matiere))),
  ];

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800 mb-2">
        Professeurs
        {bac.coachs_recherches ? (
          <span className="ml-2 text-xs font-normal text-gray-500">
            {bac.profs.length}/{bac.coachs_recherches} prévu{bac.coachs_recherches > 1 ? 's' : ''}
          </span>
        ) : null}
      </h4>

      {bac.profs.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Aucun professeur assigné.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 mb-3">
          {bac.profs.map((p) => (
            <li key={p.assignation_id} className="flex items-center gap-2 border border-gray-200 rounded-full pl-3 pr-2 py-1 text-sm">
              <span className="text-gray-800">
                {p.prenom} {p.nom}
              </span>
              {bac.passe &&
                (p.retour ? <Pastille ton="vert">retour reçu</Pastille> : <Pastille ton="orange">retour attendu</Pastille>)}
              <button
                type="button"
                onClick={() => agir({ action: 'retirer-prof', assignation_id: p.assignation_id })}
                disabled={occupe}
                className="text-gray-400 hover:text-red-600 text-sm leading-none disabled:opacity-40"
                title="Retirer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm max-w-xs"
        >
          <option value="">Choisir un professeur…</option>
          {tries.map((p) => (
            <option key={p.id} value={p.id}>
              {p.prenom} {p.nom}
              {(p.matieres ?? []).length ? ` — ${(p.matieres ?? []).join(', ')}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={async () => {
            if (!choix) return;
            await agir({ action: 'assigner-prof', session_id: bac.id, professeur_id: choix });
            setChoix('');
          }}
          disabled={!choix || occupe}
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-40"
        >
          Assigner
        </button>
      </div>
    </div>
  );
}

// --- Bloc « retours » -------------------------------------------------

function CarteRetour({ retour, nom }: { retour: RetourSession; nom: string }) {
  const lignes: [string, string][] = [
    ['Déroulement', lib('deroulement', retour.deroulement)],
    ['Présents', retour.nb_eleves_presents == null ? '—' : String(retour.nb_eleves_presents)],
    ['Absents', retour.nb_eleves_absents == null ? '—' : String(retour.nb_eleves_absents)],
    ['Durée', lib('duree_adaptee', retour.duree_adaptee)],
    ['Difficulté du sujet', lib('difficulte_sujet', retour.difficulte_sujet)],
    ['Niveau des élèves', lib('niveau_eleves', retour.niveau_eleves)],
    ['Organisation', retour.note_organisation == null ? '—' : `${retour.note_organisation}/5`],
    ['Recommanderait', retour.recommanderait == null ? '—' : retour.recommanderait ? 'oui' : 'non'],
  ];
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <p className="font-semibold text-gray-900 text-sm mb-2">{nom}</p>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
        {lignes.map(([k, v]) => (
          <div key={k}>
            <dt className="text-gray-500">{k}</dt>
            <dd className="text-gray-900 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {[
        ['Incidents', retour.incidents],
        ['Ce qu’ont dit les élèves', retour.retours_eleves],
        ['Ce qui lui manquerait', retour.besoins],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <p key={String(k)} className="mt-2 text-xs">
            <span className="text-gray-500">{k} : </span>
            <span className="text-gray-800">{v}</span>
          </p>
        ))}
    </div>
  );
}

// --- Une carte par bac blanc -----------------------------------------

function CarteBacBlanc({
  bac,
  profs,
  agir,
  occupe,
  tablesManquantes,
}: {
  bac: BacBlanc;
  profs: ProfLite[];
  agir: (corps: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  occupe: boolean;
  tablesManquantes: string[];
}) {
  const [ouvert, setOuvert] = useState(!bac.passe);
  const retours = bac.profs.filter((p) => p.retour);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="w-full text-left p-5 flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <span className="text-gray-400 text-sm">{ouvert ? '▾' : '▸'}</span>
        <span>
          <span className="font-bold text-gray-900">{bac.matiere}</span>
          <span className="block text-sm text-gray-500 capitalize">
            {dateLongue(bac.date_epreuve)}
            {bac.heure_debut ? ` · ${bac.heure_debut}${bac.heure_fin ? ` — ${bac.heure_fin}` : ''}` : ''}
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {compteARebours(bac)}
          <Pastille ton={bac.nb_eleves > 0 ? 'vert' : 'gris'}>
            {bac.nb_eleves} élève{bac.nb_eleves > 1 ? 's' : ''}
            {bac.places ? ` / ${bac.places}` : ''}
          </Pastille>
          <Pastille ton={bac.profs.length ? 'vert' : 'orange'}>
            {bac.profs.length} prof{bac.profs.length > 1 ? 's' : ''}
          </Pastille>
          <Pastille ton={bac.sujets.some((s) => s.type === 'sujet') ? 'vert' : 'orange'}>
            {bac.sujets.some((s) => s.type === 'sujet') ? 'sujet déposé' : 'sujet manquant'}
          </Pastille>
          {bac.passe && bac.retours_attendus > 0 && (
            <Pastille ton="orange">{bac.retours_attendus} retour(s) attendu(s)</Pastille>
          )}
        </span>
      </button>

      {ouvert && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-5">
          <BlocProfs bac={bac} profs={profs} agir={agir} occupe={occupe} />
          <BlocSujets
            bac={bac}
            agir={agir}
            occupe={occupe}
            bloque={tablesManquantes.includes('session_sujets')}
          />
          {retours.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                Retours des professeurs ({retours.length})
              </h4>
              <div className="space-y-3">
                {retours.map((p) => (
                  <CarteRetour key={p.id} retour={p.retour!} nom={`${p.prenom ?? ''} ${p.nom}`.trim()} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// --- La page ----------------------------------------------------------

export function TableauBacsBlancs() {
  const [etat, setEtat] = useState<EtatBacsBlancs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [voirPasses, setVoirPasses] = useState(false);
  const premierChargement = useRef(true);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/bacs-blancs', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) setErreur(d.error);
      else {
        setEtat(d as EtatBacsBlancs);
        setErreur(null);
      }
    } catch {
      setErreur('Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    if (!premierChargement.current) return;
    premierChargement.current = false;
    // setTimeout : ne pas poser d'état pendant le rendu de l'effet (Next 16).
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const agir = useCallback(
    async (corps: Record<string, unknown>) => {
      setOccupe(true);
      try {
        const r = await fetch('/api/admin/bacs-blancs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const d = await r.json();
        if (d.error) {
          setErreur(d.error);
          return null;
        }
        // Les actions de préparation ne changent rien en base : pas de rechargement.
        if (corps.action !== 'preparer-depot' && corps.action !== 'lien-sujet') await charger();
        return d as Record<string, unknown>;
      } catch {
        setErreur('Action impossible.');
        return null;
      } finally {
        setOccupe(false);
      }
    },
    [charger],
  );

  if (!etat) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <p className="max-w-5xl mx-auto text-gray-500">{erreur ?? 'Chargement…'}</p>
      </div>
    );
  }

  const aVenir = etat.bacs_blancs.filter((b) => !b.passe);
  const passes = etat.bacs_blancs.filter((b) => b.passe).reverse();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <Link href="/espace-prof" className="text-sm text-purple-700 hover:underline">
            ← Mon espace
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Bacs blancs</h1>
          <p className="text-gray-600 mt-1">
            Chaque épreuve à venir : qui l’encadre, quel sujet, combien d’élèves. Et, une fois
            passée, ce que les professeurs en ont dit.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            {aVenir.length} à venir · {passes.length} passé{passes.length > 1 ? 's' : ''} ·{' '}
            <Link href="/admin/correction" className="text-purple-700 hover:underline">
              pilotage de la correction
            </Link>
          </p>
        </header>

        {erreur && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{erreur}</div>
        )}

        {etat.alertes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
            {etat.alertes.map((a, i) => (
              <p key={i} className="text-sm text-amber-900 flex gap-2">
                <span>⚠️</span>
                <span>{a}</span>
              </p>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {aVenir.length === 0 && <p className="text-gray-500">Aucun bac blanc à venir.</p>}
          {aVenir.map((b) => (
            <CarteBacBlanc
              key={b.id}
              bac={b}
              profs={etat.profs}
              agir={agir}
              occupe={occupe}
              tablesManquantes={etat.tables_manquantes}
            />
          ))}
        </div>

        {passes.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setVoirPasses((v) => !v)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {voirPasses ? '▾' : '▸'} Bacs blancs passés ({passes.length})
            </button>
            {voirPasses && (
              <div className="space-y-4 mt-4">
                {passes.map((b) => (
                  <CarteBacBlanc
                    key={b.id}
                    bac={b}
                    profs={etat.profs}
                    agir={agir}
                    occupe={occupe}
                    tablesManquantes={etat.tables_manquantes}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
