import type { Metadata } from 'next';
import {
  chargerDonneesRelecture,
  jetonRelectureValide,
  type EntreeTaxonomie,
  type Grille,
} from '@/lib/relecture';
import { pipelineManquant } from '@/lib/pipeline';
import { FormulaireRelecture } from '@/components/FormulaireRelecture';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dossier de relecture professeur — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

const NOMS_MATIERES: Record<string, string> = {
  francais: 'Français',
  ses: 'SES',
  svt: 'SVT',
  hggsp: 'HGGSP',
  hlp: 'HLP',
  'histoire-geo': 'Histoire-Géographie',
  philosophie: 'Philosophie',
};

const NOMS_EXERCICES: Record<string, string> = {
  commentaire: 'Commentaire littéraire',
  dissertation: 'Dissertation',
  hg_question_problematisee: 'Question problématisée',
  hg_analyse_document: 'Analyse de document(s)',
  hg_croquis: 'Croquis',
  hg_tech_questions: 'Questions de connaissances (voie technologique)',
};

/**
 * Fourchette telle que l'élève la voit : demi-largeur de 5 % du barème,
 * arrondie au demi-point — la même règle que celle donnée aux gabarits de
 * dossier. Sur 20 cela fait ±1 point, sur 10 ±0,5.
 */
function fourchette(note: number, bareme: number): string {
  const demi = Math.max(0.5, Math.round(bareme * 0.05 * 2) / 2);
  const borne = (v: number) => Math.min(bareme, Math.max(0, Math.round(v * 2) / 2));
  return `${fr(borne(note - demi))} – ${fr(borne(note + demi))}`;
}

/** Nombre a la francaise : 3,75 et non 3.75. */
const fr = (n: number) => n.toLocaleString('fr-FR');

function nomExercice(exerciseType: string): string {
  return (
    NOMS_EXERCICES[exerciseType] ??
    exerciseType.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * Dossier de relecture pour un professeur de la matière : barème en clair,
 * taxonomie d'erreurs, une copie réellement corrigée par le pipeline, et
 * trois questions. Accès par lien signé uniquement (?t=…), jamais indexé.
 */
export default async function PageRelecture({
  params,
  searchParams,
}: {
  params: Promise<{ matiere: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { matiere } = await params;
  const { t } = await searchParams;

  if (pipelineManquant().length) {
    return (
      <Ecran titre="Service indisponible">
        Le pipeline de correction n’est pas configuré sur ce déploiement.
      </Ecran>
    );
  }

  if (!jetonRelectureValide(matiere, t)) {
    return (
      <Ecran titre="Lien invalide">
        Ce dossier de relecture est accessible uniquement par le lien personnel qui vous a été
        transmis. Contactez Les Matinées du Bac pour recevoir un nouveau lien.
      </Ecran>
    );
  }

  const donnees = await chargerDonneesRelecture(matiere);
  if (!donnees) {
    return (
      <Ecran titre="Matière introuvable">
        Aucune grille d’évaluation n’est installée pour « {matiere} ».
      </Ecran>
    );
  }

  const nomMatiere = NOMS_MATIERES[matiere] ?? matiere;
  const { grilles, taxonomie, exemple, autresExemples } = donnees;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* ---------------------------------------------------------- En-tête */}
        <header className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">
            Les Matinées du Bac — dossier de relecture professeur
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            {nomMatiere} : validez notre barème de correction
          </h1>
          <p className="text-gray-700 mt-4 leading-relaxed">
            Nous corrigeons des copies de bac blanc avec un barème analytique appliqué critère par
            critère, chaque point étant justifié par des citations de la copie. Avant de nous
            appuyer durablement sur ce barème, nous voulons le faire relire par des professeurs de
            la discipline. Ce dossier contient tout ce qu’il faut pour vous faire un avis en une
            trentaine de minutes : le barème en clair, la liste des erreurs types que nous
            traquons, et une copie réelle corrigée de bout en bout.
          </p>
          <p className="text-gray-700 mt-3 leading-relaxed">
            À la fin, <strong>trois questions</strong> vous sont posées. Vos réponses sont
            enregistrées telles quelles et servent directement à ajuster le barème.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            <li className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
              1 · Le barème
            </li>
            <li className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
              2 · Les erreurs types
            </li>
            <li className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
              3 · Une copie corrigée
            </li>
            <li className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
              4 · Vos trois questions
            </li>
          </ul>
        </header>

        {/* ---------------------------------------------------------- Barème */}
        <section className="space-y-6">
          <TitreSection numero="1" titre="Le barème, en clair" />
          <p className="text-gray-700">
            Une grille par type d’épreuve. Pour chaque critère, le correcteur choisit un niveau et
            doit citer la copie pour justifier le score. La somme des critères fait exactement la
            note finale : aucun point n’est attribué « au jugé ».
          </p>
          {grilles.map((g) => (
            <BlocGrille key={g.id} grille={g} nom={nomExercice(g.exercise_type)} />
          ))}
        </section>

        {/* ------------------------------------------------------- Taxonomie */}
        <section className="space-y-6">
          <TitreSection numero="2" titre="Les erreurs types que nous traquons" />
          <p className="text-gray-700">
            En plus des scores, le correcteur signale les erreurs récurrentes à l’aide de cette
            taxonomie. Chaque code est défini par ce qu’on observe concrètement dans la copie, et
            par les critères du barème qu’il affecte. C’est cette liste qui alimente ensuite les
            conseils personnalisés donnés à l’élève.
          </p>
          <BlocTaxonomie taxonomie={taxonomie} />
        </section>

        {/* --------------------------------------------------------- Exemple */}
        <section className="space-y-6">
          <TitreSection numero="3" titre="Une copie réelle, corrigée avec ce barème" />
          {exemple ? (
            <>
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {nomExercice(exemple.exerciseType)} — copie anonymisée
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Corrigée telle quelle par le pipeline, sans retouche pour ce dossier.
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">
                    {fr(exemple.noteFinale)}
                    <span className="text-lg text-gray-500 font-medium"> / {exemple.bareme}</span>
                  </p>
                </div>

                {exemple.pagesCopie.length > 0 && (
                  <details className="rounded-xl border border-gray-200 bg-gray-50">
                    <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-800 select-none">
                      Lire la copie de l’élève ({exemple.pagesCopie.length} page
                      {exemple.pagesCopie.length > 1 ? 's' : ''})
                    </summary>
                    <div className="px-5 pb-5 space-y-4">
                      {exemple.pagesCopie.map((page, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                            Page {i + 1}
                          </p>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
                            {page}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="space-y-4">
                  {exemple.criteria.map((c) => (
                    <div key={c.code} className="rounded-xl border border-gray-200 p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h4 className="font-bold text-gray-900">{c.name}</h4>
                        <p className="font-bold text-purple-700 whitespace-nowrap">
                          {fr(c.score)} <span className="text-gray-400 font-medium">/ {fr(c.maximum)}</span>
                        </p>
                      </div>
                      <p className="text-gray-700 mt-2 leading-relaxed">{c.justification}</p>
                      {(c.evidence ?? []).length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {c.evidence!.map((e, i) => (
                            <li key={i} className="text-sm border-l-4 border-purple-200 pl-3">
                              <p className="italic text-gray-800">« {e.quote} »</p>
                              <p className="text-gray-600 mt-0.5">{e.explanation}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {c.improvement && (
                        <p className="text-sm text-gray-600 mt-3">
                          <span className="font-semibold text-gray-800">Pour progresser : </span>
                          {c.improvement}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {exemple.detectedErrors.length > 0 && (
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Erreurs types signalées</h4>
                    <ul className="space-y-2">
                      {exemple.detectedErrors.map((e, i) => (
                        <li key={i} className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                          <p>
                            <code className="font-bold text-amber-900">{e.code}</code>
                            {e.evidence && <span className="italic text-gray-700"> — « {e.evidence} »</span>}
                          </p>
                          {e.impact && <p className="text-gray-600 mt-1">{e.impact}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {exemple.pointsForts.length > 0 && (
                    <ListePastille titre="Points forts relevés" items={exemple.pointsForts} couleur="emerald" />
                  )}
                  {exemple.priorites.length > 0 && (
                    <ListePastille titre="Priorités données à l’élève" items={exemple.priorites} couleur="purple" />
                  )}
                </div>

                {exemple.appreciation && (
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-5">
                    <h4 className="font-bold text-gray-900 mb-1">Appréciation générale</h4>
                    <p className="text-gray-700 leading-relaxed">{exemple.appreciation}</p>
                  </div>
                )}

                <p className="text-sm text-gray-600">
                  L’élève, lui, ne voit pas ce détail brut : il reçoit un dossier pédagogique
                  rédigé. Dans les matières dont la grille n’est pas encore validée par des
                  professeurs, sa note est affichée <strong>en fourchette</strong> (ici «{' '}
                  {fourchette(exemple.noteFinale, exemple.bareme)} / {exemple.bareme} »), élargie
                  quand le correcteur doute ; le nombre exact reste interne.{' '}
                  <a
                    href={`/dossier/${exemple.correctionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-700 font-semibold underline"
                  >
                    Ouvrir le dossier tel que l’élève le reçoit
                  </a>
                  {autresExemples.map((a) => (
                    <span key={a.correctionId}>
                      {' · '}
                      <a
                        href={`/dossier/${a.correctionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-700 font-semibold underline"
                      >
                        autre exemple : {nomExercice(a.exerciseType).toLowerCase()} ({fr(a.noteFinale)}/
                        {a.bareme})
                      </a>
                    </span>
                  ))}
                </p>
              </div>
            </>
          ) : (
            <p className="text-gray-600">
              Aucune copie corrigée n’est encore disponible pour cette matière.
            </p>
          )}
        </section>

        {/* ------------------------------------------------------- Questions */}
        <section className="space-y-6">
          <TitreSection numero="4" titre="Vos trois questions" />
          <FormulaireRelecture matiere={matiere} jeton={t!} />
        </section>

        <footer className="text-center text-sm text-gray-500 pb-6">
          Merci pour votre temps — chaque réponse compte vraiment.
          <br />
          Les Matinées du Bac
        </footer>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  Sous-composants serveur (présentation uniquement).                   */
/* --------------------------------------------------------------------- */

function Ecran({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">{titre}</h1>
        <p className="text-gray-600 mt-3">{children}</p>
      </div>
    </div>
  );
}

function TitreSection({ numero, titre }: { numero: string; titre: string }) {
  return (
    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
      <span className="flex-none w-9 h-9 rounded-full bg-purple-600 text-white text-lg flex items-center justify-center">
        {numero}
      </span>
      {titre}
    </h2>
  );
}

function BlocGrille({ grille, nom }: { grille: Grille; nom: string }) {
  const total = grille.rubric_json.criteria.reduce((s, c) => s + c.maximum_score, 0);
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xl font-bold text-gray-900">{nom}</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            sur {total} points
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full font-medium ${
              grille.status === 'active'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {grille.status === 'active' ? 'appliquée aujourd’hui' : 'brouillon — en attente de votre avis'}
          </span>
        </div>
      </div>

      {grille.rubric_json.criteria.map((c) => (
        <div key={c.code} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 flex items-baseline justify-between gap-3">
            <div>
              <h4 className="font-bold text-gray-900">{c.name}</h4>
              <p className="text-sm text-gray-600">{c.description}</p>
            </div>
            <p className="font-bold text-purple-700 whitespace-nowrap">{c.maximum_score} pts</p>
          </div>
          {c.levels && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {/* Number() et pas parseInt() : les niveaux valent souvent un
                    quart ou un demi-point (0,25 · 0,75 · 1,25 en histoire-géo). */}
                {Object.entries(c.levels)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([niveau, description]) => (
                    <tr key={niveau} className="border-t border-gray-100">
                      <td className="px-5 py-2 font-semibold text-gray-800 whitespace-nowrap w-24 align-top">
                        {Number(niveau).toLocaleString('fr-FR')} pt{Number(niveau) >= 2 ? 's' : ''}
                      </td>
                      <td className="px-5 py-2 text-gray-700">{description}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ))}

      {(grille.rubric_json.guardrails ?? []).length > 0 && (
        <div className="rounded-xl bg-purple-50 border border-purple-100 p-5">
          <h4 className="font-bold text-gray-900 mb-2">Garde-fous imposés au correcteur</h4>
          <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
            {grille.rubric_json.guardrails!.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {grille.system_prompt && (
        <details className="rounded-xl border border-gray-200 bg-gray-50">
          <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-800 select-none">
            Lire la consigne exacte donnée au correcteur
          </summary>
          <p className="px-5 pb-5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {grille.system_prompt}
          </p>
        </details>
      )}
    </div>
  );
}

const NOMS_FAMILLES_TAXO: Record<string, string> = {
  tous: 'Toutes les épreuves',
};

const NOMS_GRAVITE: Record<string, string> = {
  major: 'forte',
  moderate: 'moyenne',
  minor: 'faible',
};

function BlocTaxonomie({ taxonomie }: { taxonomie: EntreeTaxonomie[] }) {
  const familles = new Map<string, EntreeTaxonomie[]>();
  for (const e of taxonomie) {
    const liste = familles.get(e.exercise_type) ?? [];
    liste.push(e);
    familles.set(e.exercise_type, liste);
  }

  return (
    <div className="space-y-6">
      {[...familles.entries()].map(([famille, entrees]) => (
        <div key={famille} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {NOMS_FAMILLES_TAXO[famille] ?? nomExercice(famille)}
          </h3>
          <div className="space-y-4">
            {entrees.map((e) => (
              <div key={e.code} className="rounded-xl border border-gray-200 p-4">
                <p className="font-bold text-gray-900">
                  <code className="text-purple-700">{e.code}</code> — {e.definition}
                </p>
                {e.signals && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold text-gray-800">Signaux dans la copie : </span>
                    {e.signals}
                  </p>
                )}
                {e.severite && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold text-gray-800">Gravité : </span>
                    {NOMS_GRAVITE[e.severite] ?? e.severite}
                  </p>
                )}
                {(e.affected_criteria ?? []).length > 0 && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-semibold text-gray-800">Critères affectés : </span>
                    {e.affected_criteria.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListePastille({
  titre,
  items,
  couleur,
}: {
  titre: string;
  items: string[];
  couleur: 'emerald' | 'purple';
}) {
  const classes =
    couleur === 'emerald'
      ? 'bg-emerald-50 border-emerald-100'
      : 'bg-purple-50 border-purple-100';
  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <h4 className="font-bold text-gray-900 mb-2">{titre}</h4>
      <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
