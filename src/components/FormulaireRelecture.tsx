'use client';

import { useState } from 'react';

type Statut = 'saisie' | 'envoi' | 'envoye' | 'erreur';

type Question = {
  cle: string;
  titre: string;
  detail: string;
  choix: [string, string][] | null;
  placeholder: string;
  /** Conditions d'affichage : on ne pose jamais une question sans objet. */
  exige?: 'bareme' | 'copie' | 'calibration';
};

/**
 * Les questions posées au professeur relecteur, une par élément du dispositif.
 *
 * Elles remplacent les trois anciennes, qui faisaient valider une grille
 * générique comme si elle produisait seule la note. Chacune porte désormais
 * sur UN objet précis, et celles qui n'ont pas d'objet ne s'affichent pas :
 * on ne demande pas si « la note est juste » quand aucune copie étalon n'a
 * été corrigée des deux côtés.
 *
 * Les clés doivent rester en [a-z_] : /api/relecture filtre là-dessus.
 */
const QUESTIONS: Question[] = [
  {
    cle: 'bareme_sujet',
    titre: 'Le barème du sujet correspond-il à ce que vous corrigeriez ?',
    detail:
      'Découpage en questions, maximum de chacune, répartition des 20 points : qu’ajusteriez-vous, et pourquoi ?',
    choix: [
      ['valider', 'Je le validerais tel quel'],
      ['ajuster', 'Bon socle, des ajustements sont nécessaires'],
      ['revoir', 'À revoir en profondeur'],
    ],
    placeholder:
      'Ex. : la question 2.b vaut 0,75 chez moi, pas 0,5 ; l’exercice 3 pèse trop lourd par rapport à l’exercice 1…',
    exige: 'bareme',
  },
  {
    cle: 'detail_points',
    titre: 'Le détail des points par question vous paraît-il correct ?',
    detail:
      'Réponse attendue, démarche attendue, fractions de points, étapes valorisées : ce que nous donnons pour une réponse partielle correspond-il à votre pratique ?',
    choix: [
      ['oui', 'Oui, c’est ce que je ferais'],
      ['partiel', 'En partie'],
      ['non', 'Non'],
    ],
    placeholder:
      'Ex. : sur 1.a, la formule générale correctement appliquée mérite 0,25 même si la simplification est fausse — nous sommes d’accord ; en revanche sur 2.a…',
    exige: 'bareme',
  },
  {
    cle: 'methodes_alternatives',
    titre: 'Manque-t-il des méthodes alternatives valides ?',
    detail:
      'Une méthode valide qui n’est pas prévue au barème part en relecture humaine plutôt qu’à zéro. Quelles démarches vos élèves emploient-ils que nous n’avons pas listées ?',
    choix: null,
    placeholder:
      'Ex. : beaucoup passent par la variation de la fonction auxiliaire plutôt que par la dérivée seconde ; certains démontrent par récurrence là où le corrigé utilise le TVI…',
    exige: 'bareme',
  },
  {
    cle: 'regles_poursuite',
    titre: 'Les règles de poursuite après erreur vous conviennent-elles ?',
    detail:
      'Une erreur commise au début ne se paie qu’une fois : si l’élève poursuit correctement avec son résultat faux, il garde les points de méthode et de raisonnement. Est-ce bien ainsi que vous corrigez ? Y a-t-il des questions où cette règle ne devrait pas s’appliquer ?',
    choix: [
      ['oui', 'Oui'],
      ['nuancer', 'Oui, mais à nuancer selon les questions'],
      ['non', 'Non'],
    ],
    placeholder:
      'Ex. : sur 3.c, une erreur de signe au départ rend la suite sans objet — là, je ne valorise rien…',
    exige: 'bareme',
  },
  {
    cle: 'copies_etalons',
    titre: 'Sur les copies étalons, nos notes valent-elles les vôtres ?',
    detail:
      'Nous comparons ce que des professeurs mettent et ce que le système met, question par question, sur les mêmes copies et le même barème. Là où nous nous écartons, avons-nous tort ?',
    choix: [
      ['severe', 'Le système est trop sévère'],
      ['juste', 'Les notes correspondent'],
      ['genereux', 'Le système est trop généreux'],
    ],
    placeholder:
      'Ex. : sur la copie B j’aurais mis 13 et non 10 ; l’écart vient surtout de la question 2.b, où une justification incomplète vaut quand même la moitié des points chez moi…',
    exige: 'calibration',
  },
  {
    cle: 'copie_corrigee',
    titre: 'Sur la copie corrigée montrée plus haut, la correction est-elle fidèle ?',
    detail:
      'Sans parler de la note : les justifications citent-elles bien la copie ? Les manques relevés sont-ils les bons ?',
    choix: null,
    placeholder:
      'Ex. : la justification du critère « raisonner » cite un passage qui ne dit pas ce qu’on lui fait dire…',
    exige: 'copie',
  },
  {
    cle: 'competences',
    titre: 'Le profil de compétences décrit-il utilement l’élève ?',
    detail:
      'Cette couche ne change pas la note : elle sert aux conseils. Les compétences suivies sont-elles les bonnes ? En manque-t-il ? Certaines sont-elles inutiles pour votre matière ?',
    choix: null,
    placeholder:
      'Ex. : « représenter » ne veut pas dire grand-chose sur un sujet sans figure ; il faudrait distinguer le calcul littéral du calcul numérique…',
  },
  {
    cle: 'taxonomie',
    titre: 'La liste des erreurs types couvre-t-elle ce que vous voyez en copies ?',
    detail:
      'Quelles erreurs récurrentes de vos élèves manquent ? Certains codes se recoupent-ils ou sont-ils mal définis ?',
    choix: null,
    placeholder:
      'Ex. : il manque l’oubli du domaine de définition avant de dériver ; MA-CALC-01 et MA-EXP-01 se recoupent…',
  },
  {
    cle: 'garde_fous',
    titre: 'Les garde-fous vous semblent-ils suffisants ?',
    detail:
      'Pas de double sanction ; tout point attribué doit s’appuyer sur une citation de la copie ; un doute de transcription n’est jamais imputé à l’élève ; une méthode non prévue part en relecture humaine. Que faudrait-il ajouter ?',
    choix: null,
    placeholder:
      'Ex. : il faudrait aussi une relecture systématique quand la copie repose sur un tableau de variations que vous ne voyez pas…',
  },
];

/**
 * Les questions posées sur une matière RÉDIGÉE (HGGSP).
 *
 * Elles portent chacune sur UN objet précis du dispositif — répartition des
 * points, descripteurs, note de la copie étalon, erreurs détectées, impacts,
 * doubles sanctions, fidélité à une correction réelle — au lieu de demander
 * un avis global sur « le barème ». Un professeur peut n'en remplir qu'une.
 */
const QUESTIONS_REDIGE: Question[] = [
  {
    cle: 'repartition_points',
    titre: 'La répartition des points vous paraît-elle juste ?',
    detail:
      'Dissertation : analyse du sujet et problématisation 4, connaissances 5, construction et argumentation 5, exemples 4, expression 2. Étude critique : consigne et problématisation 3, prélèvement 3, explication par les connaissances 4, analyse critique 5, organisation 3, expression 2. Que déplaceriez-vous, et pourquoi ?',
    choix: [
      ['valider', 'Je la validerais telle quelle'],
      ['ajuster', 'Bon socle, des ajustements sont nécessaires'],
      ['revoir', 'À revoir en profondeur'],
    ],
    placeholder:
      'Ex. : en étude critique, l’analyse critique devrait peser 6 et l’organisation 2 ; en dissertation, les exemples valent 3 chez moi…',
  },
  {
    cle: 'descripteurs',
    titre: 'Les descripteurs décrivent-ils les copies que vous corrigez ?',
    detail:
      'Pour chaque critère, un palier est décrit par ce qu’on observe dans la copie. Reconnaissez-vous vos élèves dans ces descriptions ? Un palier est-il trop haut, trop bas, ou ambigu ?',
    choix: [
      ['oui', 'Oui, ils correspondent'],
      ['partiel', 'En partie'],
      ['non', 'Non'],
    ],
    placeholder:
      'Ex. : « quelques remarques critiques mais paraphrase dominante » vaut 2/5 chez vous, 1,5 chez moi ; le palier 3 de « connaissances » est trop généreux…',
  },
  {
    cle: 'note_etalon',
    titre: 'Les notes des copies étalons correspondent-elles aux vôtres ?',
    detail:
      'Les profils de calibration donnent, pour chaque niveau, une note analytique sur 20 et son détail critère par critère. Mettriez-vous la même chose ? Nous ne présentons pas ces profils comme validés : c’est précisément ce que nous vous demandons.',
    choix: [
      ['severe', 'Le système est trop sévère'],
      ['juste', 'Les notes correspondent'],
      ['genereux', 'Le système est trop généreux'],
    ],
    placeholder:
      'Ex. : le profil « très faible » à 5/20 en étude critique me paraît juste, mais « assez bonne » à 13,5 est trop haut : je mettrais 12…',
  },
  {
    cle: 'erreurs_detectees',
    titre: 'La liste des erreurs types couvre-t-elle ce que vous voyez en copies ?',
    detail:
      'Trois ensembles : erreurs transversales, erreurs propres à la dissertation, erreurs propres à l’étude critique. Qu’est-ce qui manque ? Quels codes se recoupent, ou sont mal définis ?',
    choix: null,
    placeholder:
      'Ex. : il manque « conclusion qui ouvre sur un hors-sujet » ; HGGSP_EC_04 et HGGSP_EC_07 se recoupent chez moi…',
  },
  {
    cle: 'impacts',
    titre: 'Les impacts proposés vous semblent-ils bien calibrés ?',
    detail:
      'Chaque erreur porte une règle explicite : plafond de score (ex. absence totale de critique → 2,5/5 maximum), plafond de niveau (ex. problématique absente → niveau insuffisant), fourchette indicative, ou aucun effet automatique. Ces règles correspondent-elles à votre correction ?',
    choix: [
      ['oui', 'Oui'],
      ['nuancer', 'Oui, mais à nuancer'],
      ['non', 'Non'],
    ],
    placeholder:
      'Ex. : plafonner l’analyse critique à 2,5/5 quand aucune critique n’est faite me paraît encore trop généreux ; le plan non annoncé ne coûte rien chez moi…',
  },
  {
    cle: 'double_sanction',
    titre: 'Voyez-vous une faiblesse comptée deux fois ?',
    detail:
      'Règle du dispositif : une même faiblesse n’est comptée que dans un critère, ses conséquences ailleurs sont décrites sans être re-sanctionnées. Sur la copie corrigée et sur les règles d’impact, repérez-vous un endroit où l’élève paie deux fois la même chose ?',
    choix: [
      ['non', 'Non, la règle tient'],
      ['oui', 'Oui, j’ai repéré un cas'],
    ],
    placeholder:
      'Ex. : la paraphrase fait perdre l’explication ET la critique — pour moi c’est une double peine sur le même geste…',
  },
  {
    cle: 'fidelite_correction',
    titre: 'Sur la copie corrigée, la correction est-elle fidèle à la copie ?',
    detail:
      'Sans parler de la note : les citations sont-elles réellement dans la copie ? Les manques relevés sont-ils les bons ? L’appréciation correspond-elle aux scores ?',
    choix: null,
    placeholder:
      'Ex. : la justification du prélèvement cite un passage qui ne dit pas ce qu’on lui fait dire ; l’appréciation est plus sévère que les scores…',
    exige: 'copie',
  },
  {
    cle: 'garde_fous',
    titre: 'Les garde-fous vous semblent-ils suffisants ?',
    detail:
      'Chaque score cite la copie ; un doute de transcription n’est jamais imputé à l’élève ; aucun plan unique n’est imposé ; la neutralité politique est absolue ; une production graphique absente ne pénalise jamais. Que faudrait-il ajouter ?',
    choix: null,
    placeholder:
      'Ex. : il faudrait aussi une relecture humaine systématique quand la copie tient sur moins d’une page…',
  },
];

export function FormulaireRelecture({
  matiere,
  jeton,
  aUnBareme = false,
  aUneCopieCorrigee = false,
  calibrationFaite = false,
  jeu = 'bareme',
}: {
  matiere: string;
  jeton: string;
  aUnBareme?: boolean;
  aUneCopieCorrigee?: boolean;
  calibrationFaite?: boolean;
  /** 'bareme' = barème question par question ; 'redige' = grille par critères (HGGSP). */
  jeu?: 'bareme' | 'redige';
}) {
  const [statut, setStatut] = useState<Statut>('saisie');
  const [erreur, setErreur] = useState('');

  const posees = (jeu === 'redige' ? QUESTIONS_REDIGE : QUESTIONS).filter((q) => {
    if (q.exige === 'bareme') return aUnBareme;
    if (q.exige === 'copie') return aUneCopieCorrigee;
    if (q.exige === 'calibration') return calibrationFaite;
    return true;
  });

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const reponses: Record<string, string> = {};
    for (const q of posees) {
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
          Elles seront reprises point par point dans la prochaine version du barème — et une nouvelle
          version signifie que toutes les copies concernées seront recorrigées avec elle. Si vous
          pensez à autre chose après coup, rouvrez simplement ce lien.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-8">
      {!calibrationFaite && jeu === 'bareme' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          La question sur la justesse de nos notes n’est volontairement pas posée : aucune copie
          étalon n’a encore été corrigée à la fois par un professeur et par le système. Nous ne
          pouvons rien vous faire juger là-dessus, et nous ne présentons pas le dispositif comme
          validé.
        </p>
      )}

      {posees.map((q, i) => (
        <fieldset key={q.cle}>
          <legend className="font-bold text-gray-900 text-lg">
            {i + 1}. {q.titre}
          </legend>
          <p className="text-sm text-gray-600 mt-1 mb-3">{q.detail}</p>
          {q.choix && (
            <div className="flex flex-wrap gap-2 mb-3">
              {q.choix.map(([valeur, libelle]) => (
                <label
                  key={valeur}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer has-checked:border-purple-600 has-checked:bg-purple-50"
                >
                  <input type="radio" name={`${q.cle}_choix`} value={valeur} className="accent-purple-600" />
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
      <input name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

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
