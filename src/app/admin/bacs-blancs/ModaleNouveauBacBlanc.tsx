'use client';

/**
 * « ＋ Nouveau bac blanc » — la fenêtre de création.
 *
 * Créer une épreuve se faisait jusqu'ici à la main dans Supabase. Tout est
 * réuni ici, dans l'ordre où on y pense : la matière et la date, puis QUI
 * l'encadre — la liste complète des professeurs de la base, cochable, ceux qui
 * enseignent la matière choisie remontés en tête. Un bac blanc créé sans prof
 * reste rattrapable (la carte de l'épreuve a le même menu), mais le moment où
 * on choisit la date est aussi celui où on sait qui sera là.
 *
 * Une fois créée, la session est immédiatement proposée aux familles sur la
 * page d'inscription : `/api/sessions` lit la base, plus le fichier en dur.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MATIERES_ENSEIGNEES } from '@/lib/sessions';
import type { ProfLite } from '@/lib/bacsBlancs';

const AUTRE = '__autre__';

/** Comparaison de matières tolérante aux accents et à la casse. */
const norm = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function ModaleNouveauBacBlanc({
  profs,
  agir,
  occupe,
  onFerme,
}: {
  profs: ProfLite[];
  agir: (corps: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  occupe: boolean;
  onFerme: () => void;
}) {
  const [choixMatiere, setChoixMatiere] = useState(MATIERES_ENSEIGNEES[0] ?? '');
  const [matiereLibre, setMatiereLibre] = useState('');
  const [date, setDate] = useState('');
  const [heureDebut, setHeureDebut] = useState('9h');
  const [heureFin, setHeureFin] = useState('13h');
  const [places, setPlaces] = useState('8');
  const [coachs, setCoachs] = useState('1');
  const [choisis, setChoisis] = useState<string[]>([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const matiere = (choixMatiere === AUTRE ? matiereLibre : choixMatiere).trim();

  // Les profs qui déclarent la matière d'abord : c'est presque toujours eux.
  const listeProfs = useMemo(() => {
    const q = norm(recherche);
    const visibles = profs
      .filter((p) => p.statut_compte !== 'suspendu')
      .filter((p) => !q || norm(`${p.prenom ?? ''} ${p.nom} ${p.email}`).includes(q));
    const enseigne = (p: ProfLite) => (p.matieres ?? []).some((m) => norm(m) === norm(matiere));
    return [...visibles.filter(enseigne), ...visibles.filter((p) => !enseigne(p))];
  }, [profs, recherche, matiere]);

  const basculer = (id: string) =>
    setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const creer = async () => {
    setErreur(null);
    if (!matiere) return setErreur('Choisis une matière.');
    if (!date) return setErreur('Choisis la date de l’épreuve.');

    setEnvoi(true);
    const reponse = await agir({
      action: 'creer-bac-blanc',
      matiere,
      date_epreuve: date,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      places: Number(places),
      coachs_recherches: Number(coachs),
      professeur_ids: choisis,
    });
    setEnvoi(false);

    // `agir` renvoie null et affiche l'erreur en haut de page quand la création
    // a échoué : dans ce cas la fenêtre reste ouverte, la saisie n'est pas perdue.
    if (!reponse) return;
    const avertissements = (reponse.avertissements as string[] | undefined) ?? [];
    if (avertissements.length) {
      setErreur(`Bac blanc créé, mais : ${avertissements.join(' · ')}`);
      return;
    }
    onFerme();
  };

  const champ = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau bac blanc"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Nouveau bac blanc</h2>
          <button
            type="button"
            onClick={onFerme}
            className="ml-auto text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Matière</span>
              <select
                value={choixMatiere}
                onChange={(e) => setChoixMatiere(e.target.value)}
                className={`${champ} mt-1`}
              >
                {MATIERES_ENSEIGNEES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={AUTRE}>Autre matière…</option>
              </select>
              {choixMatiere === AUTRE && (
                <input
                  autoFocus
                  value={matiereLibre}
                  onChange={(e) => setMatiereLibre(e.target.value)}
                  placeholder="Nom de la matière"
                  className={`${champ} mt-2`}
                />
              )}
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Date de l’épreuve</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${champ} mt-1`}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Début</span>
                <input value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className={`${champ} mt-1`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Fin</span>
                <input value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className={`${champ} mt-1`} />
              </label>
              <p className="col-span-2 text-xs text-gray-500 -mt-1">
                Écrire « 9h » ou « 9h30 ». L’ouverture automatique du sujet aux élèves se calcule
                depuis cette heure : une heure illisible et le sujet ne part pas.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Places</span>
                <input
                  type="number"
                  min={1}
                  value={places}
                  onChange={(e) => setPlaces(e.target.value)}
                  className={`${champ} mt-1`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Profs prévus</span>
                <input
                  type="number"
                  min={0}
                  value={coachs}
                  onChange={(e) => setCoachs(e.target.value)}
                  className={`${champ} mt-1`}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
              <h3 className="text-sm font-semibold text-gray-800">
                Professeurs {choisis.length > 0 && <span className="text-gray-500">({choisis.length} choisi{choisis.length > 1 ? 's' : ''})</span>}
              </h3>
              <span className="text-xs text-gray-500">
                Tous les professeurs de la base — gérer les comptes dans{' '}
                <Link href="/admin/profs" className="text-purple-700 hover:underline">
                  👥 Profs &amp; accès
                </Link>
              </span>
            </div>

            {profs.length > 3 && (
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un professeur…"
                className={`${champ} mb-2`}
              />
            )}

            {listeProfs.length === 0 ? (
              <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl p-4">
                {profs.length === 0 ? (
                  <>
                    Aucun professeur dans la base.{' '}
                    <Link href="/admin/profs" className="text-purple-700 hover:underline">
                      En ajouter →
                    </Link>
                  </>
                ) : (
                  'Aucun professeur ne correspond à cette recherche.'
                )}
              </p>
            ) : (
              <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {listeProfs.map((p) => {
                  const enseigne = (p.matieres ?? []).some((m) => norm(m) === norm(matiere));
                  return (
                    <li key={p.id}>
                      <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={choisis.includes(p.id)}
                          onChange={() => basculer(p.id)}
                        />
                        <span className="text-sm text-gray-900">
                          {p.prenom} {p.nom}
                          <span className="block text-xs text-gray-500">
                            {(p.matieres ?? []).length ? (p.matieres ?? []).join(', ') : 'aucune matière déclarée'}
                          </span>
                        </span>
                        {enseigne && matiere && (
                          <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                            enseigne {matiere}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {erreur && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erreur}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button type="button" onClick={onFerme} className="text-sm text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            type="button"
            onClick={creer}
            disabled={envoi || occupe}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-40"
          >
            {envoi ? 'Création…' : 'Créer le bac blanc'}
          </button>
        </div>
      </div>
    </div>
  );
}
