'use client';

/**
 * Ce que le prof voit pour UN bac blanc, en plus des élèves et des copies :
 *   - le sujet de l'épreuve, quand l'administratrice l'a rendu visible ;
 *   - le questionnaire de fin de session, une fois l'épreuve passée.
 *
 * Le composant lit /api/prof/bacs-blancs (qui ne renvoie que les sessions où
 * ce prof est assigné) et filtre sur la session affichée. Le fichier du sujet
 * n'est jamais servi en direct : on demande un lien signé de 15 minutes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BacBlancProf, RetourSession } from '@/lib/bacsBlancs';

const CHOIX = {
  deroulement: [
    ['tres_bien', 'Très bien'],
    ['bien', 'Bien'],
    ['moyen', 'Moyen'],
    ['difficile', 'Difficile'],
  ],
  duree_adaptee: [
    ['trop_court', 'Trop court'],
    ['juste', 'Juste'],
    ['trop_long', 'Trop long'],
  ],
  difficulte_sujet: [
    ['trop_facile', 'Trop facile'],
    ['adapte', 'Adapté'],
    ['trop_difficile', 'Trop difficile'],
  ],
  niveau_eleves: [
    ['faible', 'Faible'],
    ['heterogene', 'Hétérogène'],
    ['bon', 'Bon'],
  ],
} as const;

type Champ = keyof typeof CHOIX;

function Radios({
  champ,
  legende,
  valeur,
  onChange,
}: {
  champ: Champ;
  legende: string;
  valeur: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-800 mb-1.5">{legende}</legend>
      <div className="flex flex-wrap gap-2">
        {CHOIX[champ].map(([cle, label]) => (
          <button
            key={cle}
            type="button"
            onClick={() => onChange(cle)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              valeur === cle
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SujetEtRetour({ sessionId }: { sessionId: string }) {
  const [bac, setBac] = useState<BacBlancProf | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const premier = useRef(true);

  const [reponses, setReponses] = useState<Partial<RetourSession>>({});

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/prof/bacs-blancs', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) {
        setErreur(d.error);
        return;
      }
      const mien = (d.bacs_blancs as BacBlancProf[]).find((b) => b.session_id === sessionId) ?? null;
      setBac(mien);
      if (mien?.retour) setReponses(mien.retour);
    } catch {
      setErreur('Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!premier.current) return;
    premier.current = false;
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const telecharger = async (sujetId: string) => {
    const r = await fetch('/api/prof/bacs-blancs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lien-sujet', session_id: sessionId, sujet_id: sujetId }),
    });
    const d = await r.json();
    if (d.url) window.open(d.url, '_blank', 'noopener');
    else setErreur(d.error ?? 'Sujet indisponible.');
  };

  const envoyer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch('/api/prof/bacs-blancs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retour', session_id: sessionId, reponses }),
      });
      const d = await r.json();
      if (d.error) setErreur(d.error);
      else {
        setEnregistre(true);
        await charger();
        setTimeout(() => setEnregistre(false), 4000);
      }
    } catch {
      setErreur('Envoi impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) return null;
  if (!bac) return null;

  const maj = (patch: Partial<RetourSession>) => setReponses((r) => ({ ...r, ...patch }));

  return (
    <div className="space-y-5 mt-6">
      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{erreur}</div>
      )}

      {/* --- Le sujet --- */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Le sujet de l’épreuve</h2>
        {bac.sujets.length === 0 ? (
          <p className="text-sm text-gray-500">
            Pas encore disponible. Il apparaîtra ici dès que l’équipe l’aura déposé.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bac.sujets.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{s.type}</span>
                <span className="font-medium text-gray-800">{s.titre || s.fichier_nom || 'Sujet'}</span>
                {s.consigne && <span className="text-gray-500 text-xs w-full">{s.consigne}</span>}
                {s.fichier_path && (
                  <button
                    type="button"
                    onClick={() => telecharger(s.id)}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                  >
                    Ouvrir
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Le lien de téléchargement expire au bout de 15 minutes : c’est un sujet d’examen, il ne
          circule pas par une URL qui traîne.
        </p>
      </section>

      {/* --- Le questionnaire --- */}
      {bac.passe && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h2 className="font-bold text-gray-900">Comment ça s’est passé ?</h2>
            {bac.retour ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                déjà envoyé — modifiable
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                à remplir
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Quelques minutes suffisent. Tout est facultatif : un retour partiel vaut mieux qu’un
            retour jamais envoyé.
          </p>

          <div className="space-y-5">
            <Radios
              champ="deroulement"
              legende="Le déroulement de la matinée"
              valeur={reponses.deroulement ?? null}
              onChange={(v) => maj({ deroulement: v })}
            />

            <div className="flex flex-wrap gap-4">
              <label className="text-sm text-gray-800">
                Élèves présents
                <input
                  type="number"
                  min={0}
                  value={reponses.nb_eleves_presents ?? ''}
                  onChange={(e) => maj({ nb_eleves_presents: e.target.value === '' ? null : Number(e.target.value) })}
                  className="block mt-1 w-24 px-2 py-1.5 border border-gray-300 rounded-lg"
                />
              </label>
              <label className="text-sm text-gray-800">
                Absents
                <input
                  type="number"
                  min={0}
                  value={reponses.nb_eleves_absents ?? ''}
                  onChange={(e) => maj({ nb_eleves_absents: e.target.value === '' ? null : Number(e.target.value) })}
                  className="block mt-1 w-24 px-2 py-1.5 border border-gray-300 rounded-lg"
                />
              </label>
            </div>

            <Radios
              champ="duree_adaptee"
              legende="La durée de l’épreuve"
              valeur={reponses.duree_adaptee ?? null}
              onChange={(v) => maj({ duree_adaptee: v })}
            />
            <Radios
              champ="difficulte_sujet"
              legende="La difficulté du sujet"
              valeur={reponses.difficulte_sujet ?? null}
              onChange={(v) => maj({ difficulte_sujet: v })}
            />
            <Radios
              champ="niveau_eleves"
              legende="Le niveau du groupe"
              valeur={reponses.niveau_eleves ?? null}
              onChange={(v) => maj({ niveau_eleves: v })}
            />

            <fieldset>
              <legend className="text-sm font-medium text-gray-800 mb-1.5">
                L’organisation, de votre côté (1 = à revoir, 5 = parfait)
              </legend>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => maj({ note_organisation: n })}
                    className={`w-10 h-10 rounded-full border text-sm font-semibold transition-colors ${
                      reponses.note_organisation === n
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>

            {[
              ['incidents', 'Un incident à signaler ? (retard, salle, matériel, comportement)'],
              ['retours_eleves', 'Ce que les élèves vous ont dit'],
              ['besoins', 'Ce qui vous manquerait la prochaine fois'],
            ].map(([champ, legende]) => (
              <label key={champ} className="block">
                <span className="text-sm font-medium text-gray-800">{legende}</span>
                <textarea
                  rows={3}
                  value={(reponses[champ as keyof RetourSession] as string) ?? ''}
                  onChange={(e) => maj({ [champ]: e.target.value } as Partial<RetourSession>)}
                  className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </label>
            ))}

            <fieldset>
              <legend className="text-sm font-medium text-gray-800 mb-1.5">
                Referiez-vous une matinée avec nous ?
              </legend>
              <div className="flex gap-2">
                {[
                  [true, 'Oui'],
                  [false, 'Non'],
                ].map(([v, label]) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => maj({ recommanderait: v as boolean })}
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                      reponses.recommanderait === v
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                    }`}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={envoyer}
                disabled={envoi}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-40"
              >
                {envoi ? 'Envoi…' : bac.retour ? 'Mettre à jour mon retour' : 'Envoyer mon retour'}
              </button>
              {enregistre && <span className="text-sm text-emerald-700">Merci, c’est enregistré.</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
