'use client';

/**
 * Les salles vocales des bacs blancs, bac blanc par bac blanc.
 *
 * Le cycle de vie d'une épreuve, en trois boutons :
 *   1. « Préparer les salles » — crée la catégorie privée, les deux salons
 *      textuels et une salle vocale par élève inscrit. Rejouable : un élève
 *      inscrit après coup obtient sa salle sans toucher aux autres.
 *   2. « Fermer les salles »   — à la fin de l'épreuve, plus personne n'entre.
 *   3. « Supprimer »           — le ménage, une fois les copies récupérées.
 *
 * Aucun état n'est stocké en base : on lit Discord à chaque fois, donc ce que
 * montre cet écran est ce qui existe vraiment sur le serveur.
 */
import { useCallback, useEffect, useState } from 'react';

type Salle = { id: string; nom: string; verrouille: boolean };

type SessionDiscord = {
  session_id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  jours: number;
  passe: boolean;
  nb_eleves: number;
  categorie_nom: string;
  categorie_id: string | null;
  salons_texte: string[];
  salles: Salle[];
  manquantes: number;
};

type EtatSalons = {
  genere_le: string;
  configure: boolean;
  manquants: string[];
  erreur: string | null;
  serveur: string | null;
  sessions: SessionDiscord[];
  categories_orphelines: { id: string; nom: string; salons: number }[];
};

type Resultat = { ok: boolean; message: string; details: string[] };

function quand(jours: number) {
  if (jours < 0) return `il y a ${-jours} j`;
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  return `dans ${jours} j`;
}

const dateLisible = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export function SallesBacsBlancs() {
  const [etat, setEtat] = useState<EtatSalons | null>(null);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch('/api/admin/discord/salons', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data.error ?? 'Lecture impossible.');
        return;
      }
      setEtat(data as EtatSalons);
      setErreur(null);
    } catch {
      setErreur('Impossible de joindre le serveur.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    // Différé d'un tick : appeler charger() dans le corps de l'effet déclenche
    // un setState synchrone, que la règle react-hooks de Next 16 refuse.
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const agir = async (cle: string, corps: Record<string, unknown>, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setOccupe(cle);
    setResultat(null);
    try {
      const r = await fetch('/api/admin/discord/salons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data.error ?? 'Action refusée.');
        return;
      }
      setResultat(data as Resultat);
      await charger();
    } catch {
      setErreur('Impossible de joindre le serveur.');
    } finally {
      setOccupe(null);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Les salles des bacs blancs</h2>
          <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
            Une salle vocale privée par élève, plus les salons « informations » et « assistance
            technique ». Personne d’autre que l’équipe ne voit ces salles.
          </p>
        </div>
        <button
          onClick={charger}
          disabled={chargement}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {chargement ? '…' : '↻ Actualiser'}
        </button>
      </div>

      {etat?.serveur && (
        <p className="text-xs text-slate-400 mb-4">Serveur relié : {etat.serveur}</p>
      )}

      {erreur && (
        <p className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{erreur}</p>
      )}

      {etat && !etat.configure && (
        <p className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          Discord n’est pas encore relié — les boutons resteront inactifs. Variables manquantes :{' '}
          <span className="font-mono text-xs">{etat.manquants.join(', ')}</span>. La liste ci-dessous
          montre quand même les épreuves prévues.
        </p>
      )}

      {etat?.erreur && (
        <p className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {etat.erreur}
        </p>
      )}

      {resultat && (
        <div
          className={`mb-4 rounded-xl border p-3 text-sm ${
            resultat.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <p className="font-semibold">{resultat.message}</p>
          {resultat.details.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {resultat.details.map((d) => (
                <li key={d}>· {d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {chargement && !etat ? (
        <p className="text-sm text-slate-400 py-6 text-center">Lecture du serveur Discord…</p>
      ) : !etat?.sessions.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
          Aucun bac blanc à venir : rien à préparer.
        </p>
      ) : (
        <ul className="space-y-3">
          {etat.sessions.map((s) => {
            const pret = s.categorie_id !== null && s.manquantes === 0;
            const toutesFermees = s.salles.length > 0 && s.salles.every((x) => x.verrouille);
            return (
              <li
                key={s.session_id}
                className="rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900">{s.matiere}</h3>
                    <span className="text-xs text-slate-500">
                      {dateLisible(s.date_epreuve)} · {quand(s.jours)}
                      {s.heure_debut ? ` · ${s.heure_debut}` : ''}
                    </span>
                    {s.categorie_id === null ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                        salles non créées
                      </span>
                    ) : pret && toutesFermees ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
                        salles fermées
                      </span>
                    ) : pret ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                        prêt
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                        {s.manquantes} salle{s.manquantes > 1 ? 's' : ''} à créer
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    {s.nb_eleves} élève{s.nb_eleves > 1 ? 's' : ''} inscrit{s.nb_eleves > 1 ? 's' : ''} ·{' '}
                    {s.salles.length} salle{s.salles.length > 1 ? 's' : ''} vocale
                    {s.salles.length > 1 ? 's' : ''}
                    {s.salons_texte.length > 0 && ` · ${s.salons_texte.join(', ')}`}
                  </p>

                  {s.salles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.salles.map((salle) => (
                        <span
                          key={salle.id}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono ${
                            salle.verrouille
                              ? 'bg-slate-100 text-slate-400 line-through'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          🔊 {salle.nom}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 mt-2 font-mono">{s.categorie_nom}</p>
                </div>

                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button
                    onClick={() => agir(s.session_id, { action: 'preparer', session_id: s.session_id })}
                    disabled={!etat.configure || occupe === s.session_id || s.nb_eleves === 0}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"
                  >
                    {occupe === s.session_id
                      ? '…'
                      : s.categorie_id === null
                        ? 'Préparer les salles'
                        : 'Compléter les salles'}
                  </button>
                  <button
                    onClick={() =>
                      agir(
                        `${s.session_id}-lock`,
                        { action: 'verrouiller', categorie_id: s.categorie_id },
                        'Fermer toutes les salles de ce bac blanc ? Plus personne ne pourra y entrer.',
                      )
                    }
                    disabled={!etat.configure || !s.categorie_id || occupe === `${s.session_id}-lock`}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Fermer les salles
                  </button>
                  <button
                    onClick={() =>
                      agir(
                        `${s.session_id}-del`,
                        { action: 'supprimer', categorie_id: s.categorie_id },
                        `Supprimer définitivement « ${s.categorie_nom} » et tous ses salons ? Cette action est irréversible.`,
                      )
                    }
                    disabled={!etat.configure || !s.categorie_id || occupe === `${s.session_id}-del`}
                    className="px-3 py-2 rounded-lg border border-red-300 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {etat && etat.categories_orphelines.length > 0 && (
        <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <h3 className="text-sm font-bold text-amber-900">Catégories à nettoyer</h3>
          <p className="text-xs text-amber-800 mt-0.5 mb-3">
            Bacs blancs terminés dont les salles existent encore sur Discord.
          </p>
          <ul className="space-y-2">
            {etat.categories_orphelines.map((c) => (
              <li key={c.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 font-mono text-xs text-amber-900">
                  {c.nom} <span className="text-amber-600">({c.salons} salon{c.salons > 1 ? 's' : ''})</span>
                </span>
                <button
                  onClick={() =>
                    agir(
                      c.id,
                      { action: 'supprimer', categorie_id: c.id },
                      `Supprimer définitivement « ${c.nom} » et ses ${c.salons} salon(s) ?`,
                    )
                  }
                  disabled={occupe === c.id}
                  className="px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 disabled:opacity-40"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
