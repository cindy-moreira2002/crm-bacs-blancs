'use client';

import { useState } from 'react';

type Statut = 'saisie' | 'envoi' | 'envoye' | 'erreur';

const QUESTIONS = [
  {
    cle: 'bareme',
    titre: '1. Le barème correspond-il à vos exigences de correcteur ?',
    detail:
      'Répartition des points entre critères, formulation des niveaux, garde-fous : ' +
      'qu’ajusteriez-vous, et pourquoi ?',
    choix: [
      ['valider', 'Je le validerais tel quel'],
      ['ajuster', 'Bon socle, mais des ajustements sont nécessaires'],
      ['revoir', 'À revoir en profondeur'],
    ],
    placeholder: 'Ex. : l’analyse mérite 8 points plutôt que 7 ; le niveau 2 de la langue est trop indulgent…',
  },
  {
    cle: 'copie',
    titre: '2. Sur la copie exemple, la note et son détail vous semblent-ils justes ?',
    detail:
      'Vous auriez mis combien ? Y a-t-il un critère où le score ou la justification ne ' +
      'correspond pas à ce que vous auriez fait ?',
    choix: [
      ['severe', 'Trop sévère'],
      ['juste', 'Juste'],
      ['genereuse', 'Trop généreuse'],
    ],
    placeholder: 'Ex. : j’aurais mis 14, la compréhension vaut 4/4 ici ; la justification de l’analyse est fidèle…',
  },
  {
    cle: 'taxonomie',
    titre: '3. La liste des erreurs types couvre-t-elle ce que vous voyez en copies ?',
    detail:
      'Quelles erreurs récurrentes de vos élèves manquent à cette liste ? ' +
      'Certains codes vous semblent-ils inutiles ou mal définis ?',
    choix: null,
    placeholder: 'Ex. : il manque l’introduction récitée sans lien avec le texte ; C-CIT et C-CATA se recoupent…',
  },
] as const;

/**
 * Les trois questions du dossier de relecture. Les réponses partent vers
 * /api/relecture avec le jeton du lien ; rien d'autre n'est demandé au prof.
 */
export function FormulaireRelecture({ matiere, jeton }: { matiere: string; jeton: string }) {
  const [statut, setStatut] = useState<Statut>('saisie');
  const [erreur, setErreur] = useState('');

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const reponses: Record<string, string> = {};
    for (const q of QUESTIONS) {
      if (q.choix) reponses[`${q.cle}_choix`] = String(form.get(`${q.cle}_choix`) ?? '');
      reponses[`${q.cle}_commentaire`] = String(form.get(`${q.cle}_commentaire`) ?? '').trim();
    }

    setStatut('envoi');
    setErreur('');
    try {
      const res = await fetch('/api/relecture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matiere,
          jeton,
          prof_nom: String(form.get('prof_nom') ?? '').trim(),
          prof_email: String(form.get('prof_email') ?? '').trim(),
          etablissement: String(form.get('etablissement') ?? '').trim(),
          reponses,
          site: String(form.get('site') ?? ''), // pot de miel anti-robot
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setStatut('envoye');
    } catch (err) {
      setStatut('erreur');
      setErreur(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  }

  if (statut === 'envoye') {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
        <p className="text-4xl mb-3">✓</p>
        <h3 className="text-xl font-bold text-gray-900">Merci, vos réponses sont enregistrées.</h3>
        <p className="text-gray-600 mt-2">
          Elles seront reprises point par point dans la prochaine version du barème. Si vous avez
          pensé à autre chose après coup, rouvrez simplement ce lien : vous pouvez répondre à
          nouveau.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-8">
      {QUESTIONS.map((q) => (
        <fieldset key={q.cle}>
          <legend className="font-bold text-gray-900 text-lg">{q.titre}</legend>
          <p className="text-sm text-gray-600 mt-1 mb-3">{q.detail}</p>
          {q.choix && (
            <div className="flex flex-wrap gap-2 mb-3">
              {q.choix.map(([valeur, libelle]) => (
                <label
                  key={valeur}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer has-checked:border-purple-600 has-checked:bg-purple-50"
                >
                  <input
                    type="radio"
                    name={`${q.cle}_choix`}
                    value={valeur}
                    required
                    className="accent-purple-600"
                  />
                  <span className="text-sm font-medium text-gray-800">{libelle}</span>
                </label>
              ))}
            </div>
          )}
          <textarea
            name={`${q.cle}_commentaire`}
            rows={4}
            maxLength={8000}
            placeholder={q.placeholder}
            className="w-full rounded-lg border border-gray-300 p-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </fieldset>
      ))}

      <fieldset className="grid sm:grid-cols-3 gap-4 border-t border-gray-200 pt-6">
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Votre nom *</span>
          <input
            name="prof_nom"
            required
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Votre e-mail *</span>
          <input
            name="prof_email"
            type="email"
            required
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Établissement (facultatif)</span>
          <input
            name="etablissement"
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
      </fieldset>

      {/* Champ invisible : un humain le laisse vide, un robot le remplit. */}
      <input
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      {statut === 'erreur' && (
        <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erreur}
        </p>
      )}

      <button
        type="submit"
        disabled={statut === 'envoi'}
        className="w-full sm:w-auto px-8 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
      >
        {statut === 'envoi' ? 'Envoi…' : 'Envoyer mes réponses'}
      </button>
    </form>
  );
}
