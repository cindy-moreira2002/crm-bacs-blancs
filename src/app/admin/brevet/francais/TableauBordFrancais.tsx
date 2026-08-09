'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  BandeauControles,
  Bouton,
  Carte,
  Champ,
  classeInput,
  EnteteBrevet,
  JaugeBloc,
  Message,
} from '../ui';

/**
 * Tableau de bord du FRANÇAIS au brevet.
 *
 * Écran propre à la matière : il connaît ses trois blocs (50 / 10 / 40) et son
 * total de 100 points ramené sur 20. Il n'affiche jamais un examen de
 * mathématiques ni un bac blanc — l'API interrogée ne renvoie que la matière
 * `brevet_francais`.
 */

type Version = {
  id: string;
  version: string;
  statut: string;
  total_points: number;
  max_score: number;
  controles: { ok?: boolean; blocages?: { code: string; message: string }[] } | null;
};

type Examen = {
  id: string;
  code: string;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  statut: string;
  bareme_version_active: string | null;
  versions: Version[];
  nb_etalons: number;
  nb_corrections: number;
  nb_en_relecture: number;
};

type Stats = {
  copies: { total: number; corrigees: number; en_validation: number; en_echec: number; etalons: number };
  notes: {
    moyenne_sur_20: number | null;
    mediane_sur_20: number | null;
    minimum: number | null;
    maximum: number | null;
    distribution: { tranche: string; copies: number }[];
    sous_le_seuil: number;
  };
  parties: { code: string; libelle: string; moyenne: number | null; max: number; taux: number | null }[];
  erreurs_frequentes: { code: string; libelle: string | null; occurrences: number; effet_moyen: number }[];
  retouches: { total: number; impact_moyen: number | null };
};

const LIBELLES_STATUT: Record<string, { texte: string; ton: Parameters<typeof Badge>[0]['ton'] }> = {
  draft: { texte: 'Brouillon', ton: 'gris' },
  calibrating: { texte: 'En calibration', ton: 'ambre' },
  ready_for_validation: { texte: 'À valider', ton: 'ambre' },
  validated: { texte: 'Validé', ton: 'bleu' },
  locked: { texte: 'Barème verrouillé', ton: 'teal' },
  correction_open: { texte: 'Corrections ouvertes', ton: 'vert' },
  archived: { texte: 'Archivé', ton: 'gris' },
};

export function TableauBordFrancais() {
  const [examens, setExamens] = useState<Examen[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [rE, rS] = await Promise.all([
        fetch('/api/admin/brevet/francais'),
        fetch('/api/admin/brevet/francais/statistiques'),
      ]);
      const jE = await rE.json();
      if (!rE.ok) throw new Error(jE.error ?? 'Lecture impossible');
      setExamens(jE.examens);
      if (rS.ok) setStats(await rS.json());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }, []);

  useEffect(() => {
    // setTimeout(…, 0) et non un appel direct : Next 16 refuse un setState
    // synchrone dans un effet (react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      void charger();
    }, 0);
    return () => clearTimeout(t);
  }, [charger]);

  async function creer(form: FormData) {
    setEnCours(true);
    try {
      const r = await fetch('/api/admin/brevet/francais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.get('code'),
          titre: form.get('titre'),
          session: form.get('session') || null,
          date_epreuve: form.get('date_epreuve') || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Création impossible');
      setOuvert(false);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <EnteteBrevet
          matiere="brevet_francais"
          titre="Français — brevet blanc"
          fil={[{ href: '/admin/brevet', texte: 'Brevet' }]}
          soustitre={
            <>
              <p>
                L’épreuve dure 3 heures et son barème totalise{' '}
                <strong>100 points, ramenés sur 20</strong> : travail sur le texte{' '}
                <strong>50</strong> (réécriture comprise), dictée <strong>10</strong>, rédaction{' '}
                <strong>40</strong>. Chaque bloc est corrigé par son propre moteur.
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Source : note de service NOR MENE2515977N, BO n° 33 du 4 septembre 2025.
              </p>
            </>
          }
          actions={
            <>
              <Link href="/admin/brevet/francais/copies">
                <Bouton ton="secondaire">Les copies</Bouton>
              </Link>
              <Bouton onClick={() => setOuvert((v) => !v)}>
                {ouvert ? 'Annuler' : '+ Nouveau brevet blanc'}
              </Bouton>
            </>
          }
        />

        <Message texte={erreur} ton="erreur" />

        {ouvert && (
          <Carte
            titre="Créer un brevet blanc de français"
            aide="Le barème 1.0 naît avec lui : les trois blocs à 50 / 10 / 40, les deux grilles de rédaction vides, et une dictée sans règles de retrait — qu’il faudra saisir avant toute correction."
          >
            <form action={creer} className="grid sm:grid-cols-2 gap-4">
              <Champ label="Identifiant" aide="Stable, il ne se renomme plus ensuite.">
                <input name="code" required placeholder="brevet_francais_2027_01" className={classeInput} />
              </Champ>
              <Champ label="Titre">
                <input name="titre" required placeholder="Brevet blanc de français — janvier" className={classeInput} />
              </Champ>
              <Champ label="Session">
                <input name="session" defaultValue="2027" className={classeInput} />
              </Champ>
              <Champ label="Date de l’épreuve">
                <input name="date_epreuve" type="date" className={classeInput} />
              </Champ>
              <div className="sm:col-span-2">
                <Bouton disabled={enCours}>
                  {enCours ? 'Création…' : 'Créer le brevet blanc et son barème 1.0'}
                </Bouton>
              </div>
            </form>
          </Carte>
        )}

        {stats && stats.copies.total > 0 && (
          <Carte titre="Statistiques du français" aide="Elles ne sont jamais mêlées à celles des mathématiques ni à celles du baccalauréat.">
            <div className="grid sm:grid-cols-4 gap-4 mb-5">
              <Chiffre libelle="Copies corrigées" valeur={stats.copies.corrigees} />
              <Chiffre libelle="En attente de validation" valeur={stats.copies.en_validation} alerte={stats.copies.en_validation > 0} />
              <Chiffre libelle="Moyenne / 20" valeur={stats.notes.moyenne_sur_20 ?? '—'} />
              <Chiffre libelle="Sous 10 / 20" valeur={stats.notes.sous_le_seuil} />
            </div>

            {stats.parties.length > 0 && (
              <div className="space-y-3 mb-5">
                <p className="text-sm font-semibold text-gray-800">Réussite moyenne par bloc</p>
                {stats.parties.map((p) => (
                  <JaugeBloc
                    key={p.code}
                    libelle={p.libelle}
                    saisi={p.moyenne ?? 0}
                    attendu={p.max || 1}
                  />
                ))}
              </div>
            )}

            {stats.erreurs_frequentes.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Erreurs les plus fréquentes</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {stats.erreurs_frequentes.slice(0, 8).map((e) => (
                    <li key={e.code} className="flex justify-between gap-4">
                      <span>
                        <code className="text-xs text-gray-500 mr-2">{e.code}</code>
                        {e.libelle ?? ''}
                      </span>
                      <span className="text-gray-500 whitespace-nowrap">
                        {e.occurrences} × · −{e.effet_moyen} pt en moyenne
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stats.retouches.total > 0 && (
              <p className="text-xs text-gray-500 mt-4">
                {stats.retouches.total} retouche(s) humaine(s), impact moyen{' '}
                {stats.retouches.impact_moyen ?? 0} point(s). Chacune conserve la valeur proposée par
                l’IA, son auteur, sa date et son motif.
              </p>
            )}
          </Carte>
        )}

        {examens === null ? (
          <p className="text-gray-500">Chargement…</p>
        ) : examens.length === 0 ? (
          <Carte>
            <p className="text-gray-700 font-medium">Aucun brevet blanc de français n’existe encore.</p>
            <p className="text-sm text-gray-500 mt-2">
              Crée-en un, colle le sujet et son corrigé, puis saisis le barème question par question.
            </p>
          </Carte>
        ) : (
          <div className="space-y-4">
            {examens.map((e) => (
              <CarteExamen key={e.id} examen={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chiffre({
  libelle,
  valeur,
  alerte,
}: {
  libelle: string;
  valeur: number | string;
  alerte?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${alerte ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
      <p className="text-2xl font-bold text-gray-900">{valeur}</p>
      <p className="text-xs text-gray-600 mt-1">{libelle}</p>
    </div>
  );
}

function CarteExamen({ examen }: { examen: Examen }) {
  const active = examen.versions.find((v) => v.id === examen.bareme_version_active);
  const derniere = active ?? examen.versions[examen.versions.length - 1];
  const statut = LIBELLES_STATUT[examen.statut] ?? { texte: examen.statut, ton: 'gris' as const };

  return (
    <Link
      href={`/admin/brevet/francais/${examen.id}`}
      className="block bg-white rounded-2xl border border-gray-200 hover:border-teal-400 shadow-sm p-5 transition"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-gray-900">{examen.titre}</h3>
            <Badge texte={statut.texte} ton={statut.ton} />
            {derniere && <Badge texte={`Barème ${derniere.version}`} ton="gris" />}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            <code>{examen.code}</code>
            {examen.session ? ` · session ${examen.session}` : ''}
            {examen.date_epreuve ? ` · ${examen.date_epreuve}` : ''}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-gray-700">
            {examen.nb_corrections} copie{examen.nb_corrections > 1 ? 's' : ''}
          </p>
          {examen.nb_en_relecture > 0 && (
            <p className="text-amber-800 font-semibold">{examen.nb_en_relecture} à vérifier</p>
          )}
          <p className="text-gray-500">{examen.nb_etalons} étalon(s)</p>
        </div>
      </div>

      {derniere && (
        <div className="mt-4">
          <JaugeBloc
            libelle="Total du barème"
            saisi={Number(derniere.total_points)}
            attendu={Number(derniere.max_score)}
          />
          <div className="mt-3">
            <BandeauControles controles={derniere.controles} />
          </div>
        </div>
      )}
    </Link>
  );
}
