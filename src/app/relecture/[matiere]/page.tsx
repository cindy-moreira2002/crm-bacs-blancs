import type { Metadata } from 'next';
import {
  chargerDonneesRelecture,
  jetonRelectureValide,
  type BaremeRelecture,
  type DonneesRelecture,
  type EntreeTaxonomie,
  type Grille,
} from '@/lib/relecture';
import { chargerRelectureHggsp } from '@/lib/relectureHggsp';
import { pipelineManquant } from '@/lib/pipeline';
import { FormulaireRelecture } from '@/components/FormulaireRelecture';
import { DossierRelectureHggsp } from '@/components/DossierRelectureHggsp';

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
  maths: 'Mathématiques',
  'physique-chimie': 'Physique-Chimie',
};

const NOMS_EXERCICES: Record<string, string> = {
  commentaire: 'Commentaire littéraire',
  dissertation: 'Dissertation',
  hg_question_problematisee: 'Question problématisée',
  hg_analyse_document: 'Analyse de document(s)',
  hg_croquis: 'Croquis',
  hg_tech_questions: 'Questions de connaissances (voie technologique)',
  // Sans ces deux lignes, la page affichait « Hggsp dissertation » et
  // « Hggsp etude critique » — sans accents ni majuscules.
  hggsp_dissertation: 'HGGSP — Dissertation',
  hggsp_etude_critique: 'HGGSP — Étude critique de document(s)',
};

const NOMS_NATURE: Record<string, { titre: string; explication: string }> = {
  eleve: {
    titre: 'Erreurs de l’élève',
    explication: 'Ce que la copie fait vraiment de faux. Seules ces erreurs relèvent de la pédagogie.',
  },
  transcription: {
    titre: 'Incidents de transcription',
    explication:
      'La copie manuscrite a mal été lue, ou un tableau/schéma n’a pas été transcrit. Ce n’est jamais une faute de l’élève : cela déclenche une relecture humaine.',
  },
  reconnaissance: {
    titre: 'Incertitudes de reconnaissance',
    explication:
      'Le correcteur automatique n’a pas su rattacher une démarche au barème. Jamais un zéro d’office : une relecture.',
  },
  sujet: {
    titre: 'Anomalies du sujet ou du corrigé',
    explication: 'Le problème vient de notre dispositif, pas de la copie.',
  },
};

const NOMS_GRAVITE: Record<string, string> = { majeure: 'forte', moderee: 'moyenne', mineure: 'faible' };

/** Nombre à la française : 3,75 et non 3.75. */
const fr = (n: number) => n.toLocaleString('fr-FR');

function nomExercice(exerciseType: string): string {
  return (
    NOMS_EXERCICES[exerciseType] ??
    exerciseType.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * Dossier de relecture pour un professeur de la matière.
 *
 * Réécrit le 7 août 2026. Ce que la page ne fait PLUS : demander de valider
 * une grille générique de compétences comme si elle produisait la note.
 * Ce qu'elle explique désormais :
 *   1. un barème propre au sujet produit la note, question par question ;
 *   2. la grille de compétences produit un diagnostic pédagogique ;
 *   3. les copies étalons servent à calibrer le système avant ouverture ;
 *   4. des garde-fous empêchent la double sanction et les hallucinations.
 *
 * Et surtout : elle ne montre une copie corrigée que s'il en existe une, et
 * elle ne pose la question « la note est-elle juste ? » que si une copie
 * étalon a réellement été corrigée des deux côtés. Sans cela, elle dit
 * franchement que la calibration n'a pas été faite.
 *
 * Accès par lien signé uniquement (?t=…), jamais indexé.
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

  // HGGSP a son propre moteur (deux grilles distinctes, deux échelles, une
  // taxonomie séparée par exercice) : elle a donc son propre dossier. Les
  // autres matières continuent de passer par l'affichage générique ci-dessous.
  if (matiere === 'hggsp') {
    const hggsp = await chargerRelectureHggsp();
    if (hggsp) return <PageHggsp donnees={hggsp} jeton={t!} matiere={matiere} />;
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
  const { grilles, taxonomie, taxonomieDiscipline, exemple, autresExemples, baremes } = donnees;

  const copiesComparees = baremes.reduce((n, b) => n + b.calibration.copies_comparees, 0);
  const calibrationFaite = copiesComparees > 0;
  const aUneCopieCorrigee = Boolean(exemple);

  // Numérotation des sections : elle change selon ce qui existe vraiment,
  // pour ne jamais afficher une section vide « pour la forme ».
  const sections: { cle: string; titre: string }[] = [
    ...(baremes.length ? [{ cle: 'bareme', titre: 'Le barème du sujet' }] : []),
    { cle: 'competences', titre: 'Le diagnostic de compétences' },
    { cle: 'taxonomie', titre: 'Les erreurs types' },
    { cle: 'calibration', titre: 'La calibration' },
    ...(aUneCopieCorrigee ? [{ cle: 'copie', titre: 'Une copie corrigée' }] : []),
    { cle: 'questions', titre: 'Vos réponses' },
  ];
  const numero = (cle: string) => String(sections.findIndex((s) => s.cle === cle) + 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* ---------------------------------------------------------- En-tête */}
        <header className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">
            Les Matinées du Bac — dossier de relecture professeur
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            {nomMatiere} : relisez notre dispositif de correction
          </h1>

          <div className="mt-5 space-y-3 text-gray-700 leading-relaxed">
            <p>Notre correction repose sur trois couches, volontairement séparées.</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>
                <strong>Un barème propre au sujet produit la note.</strong> La note sur 20 est la
                somme des points attribués question par question, avec le même barème et la même
                version pour toutes les copies d’un même bac blanc. L’IA n’a pas le droit de
                remplacer cette somme par une appréciation du « niveau » de l’élève.
              </li>
              <li>
                <strong>La grille de compétences produit un diagnostic, pas la note.</strong> Après
                l’attribution des points, on regarde ce que la copie montre de chaque compétence —
                pour donner des conseils, jamais pour recalculer quoi que ce soit.
              </li>
              <li>
                <strong>Les copies étalons servent à calibrer le barème avant de l’utiliser.</strong>{' '}
                Si des copies notées 13 par des professeurs ressortent à 10, c’est le barème qu’on
                reprend, pour toutes les copies — on n’ajoute jamais trois points à celles qui
                « ressemblent » aux étalons.
              </li>
            </ol>
            <p>
              <strong>Et des garde-fous.</strong> Une erreur commise tôt ne se paie qu’une fois ;
              tout point attribué doit s’appuyer sur une citation de la copie ; une méthode valide
              non prévue au barème part en relecture humaine plutôt qu’à zéro ; un doute de
              transcription n’est jamais imputé à l’élève.
            </p>
          </div>

          {!calibrationFaite && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
              <p className="font-bold text-amber-900">
                La calibration n’a pas encore été réalisée pour cette matière.
              </p>
              <p className="text-sm text-amber-900 mt-1 leading-relaxed">
                Aucune copie étalon n’a été corrigée à la fois par un professeur et par le système.
                Nous ne pouvons donc <strong>pas</strong> affirmer que nos notes sont fidèles à
                celles d’un correcteur : c’est précisément ce que votre relecture doit nous aider à
                établir. Nous ne vous demandons pas, à ce stade, si « la note est juste » — il n’y a
                rien à juger.
              </p>
            </div>
          )}

          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            {sections.map((s, i) => (
              <li key={s.cle} className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                {i + 1} · {s.titre}
              </li>
            ))}
          </ul>
        </header>

        {/* ---------------------------------------------- 1. Barème du sujet */}
        {baremes.length > 0 && (
          <section className="space-y-6">
            <TitreSection numero={numero('bareme')} titre="Le barème du sujet — c’est lui qui donne la note" />
            <p className="text-gray-700">
              Un barème par bac blanc. Chaque question porte son maximum, la réponse attendue, la
              démarche attendue, les fractions de points attribuables, les méthodes alternatives
              admises et les règles à appliquer quand l’élève se trompe tôt puis poursuit
              correctement. Le total doit valoir exactement 20 : sans cela, aucune copie ne peut
              être corrigée.
            </p>
            {baremes.map((b) => (
              <BlocBareme key={b.examId} bareme={b} />
            ))}
          </section>
        )}

        {/* ------------------------------------------ 2. Grille de compétences */}
        <section className="space-y-6">
          <TitreSection
            numero={numero('competences')}
            titre="Le diagnostic de compétences — il n’intervient pas dans la note"
          />
          <p className="text-gray-700">
            Cette grille servait autrefois à produire la note. Elle sert désormais à décrire ce que
            la copie montre de chaque compétence, une fois les points attribués. Elle alimente les
            conseils donnés à l’élève, et rien d’autre.
          </p>
          {baremes.length > 0 && baremes[0].competences.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                Compétences suivies en {nomMatiere.toLowerCase()}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Une compétence qu’aucune question du sujet ne mobilise est marquée{' '}
                <code className="text-xs">non_applicable</code> : elle ne reçoit jamais zéro et ne
                fait jamais baisser la note. Une compétence mobilisable mais impossible à juger sur
                la copie est marquée <code className="text-xs">non_observe</code>.
              </p>
              <ul className="space-y-3">
                {baremes[0].competences.map((c) => (
                  <li key={c.code} className="rounded-xl border border-gray-200 p-4">
                    <p className="font-bold text-gray-900">
                      {c.libelle}
                      {!c.toujours_mobilisee && (
                        <span className="ml-2 text-xs font-normal text-amber-700">
                          évaluée seulement si le sujet la mobilise
                        </span>
                      )}
                    </p>
                    {c.description && <p className="text-sm text-gray-600 mt-1">{c.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {grilles.map((g) => (
            <BlocGrille key={g.id} grille={g} nom={nomExercice(g.exercise_type)} />
          ))}
        </section>

        {/* -------------------------------------------------- 3. Taxonomie */}
        <section className="space-y-6">
          <TitreSection numero={numero('taxonomie')} titre="Les erreurs types que nous traquons" />
          <p className="text-gray-700">
            Chaque erreur détectée est enregistrée avec sa citation, sa certitude de détection, son
            éventuelle erreur source et son effet <em>réel</em> sur les points. La gravité
            pédagogique d’un code, elle, ne retire aucun point : seul le barème de la question
            décide de la note.
          </p>
          {taxonomieDiscipline.length > 0 ? (
            <BlocTaxonomieDiscipline entrees={taxonomieDiscipline} />
          ) : (
            <BlocTaxonomie taxonomie={taxonomie} />
          )}
        </section>

        {/* ------------------------------------------------ 4. Calibration */}
        <section className="space-y-6">
          <TitreSection numero={numero('calibration')} titre="La calibration par copies étalons" />
          {calibrationFaite ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-4">
              {baremes
                .filter((b) => b.calibration.copies_comparees > 0)
                .map((b) => (
                  <div key={b.examId} className="rounded-xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900">{b.examTitre}</h3>
                    <p className="text-sm text-gray-700 mt-1">
                      {b.calibration.copies_comparees} copie(s) corrigée(s) à la fois par un
                      professeur et par le système, avec la version {b.version} du barème. Écart
                      absolu moyen : <strong>{fr(b.calibration.ecart_absolu_moyen ?? 0)}</strong> point(s).
                      Biais moyen :{' '}
                      <strong>
                        {(b.calibration.biais_moyen ?? 0) > 0 ? '+' : ''}
                        {fr(b.calibration.biais_moyen ?? 0)}
                      </strong>{' '}
                      (positif = le système note plus haut que les professeurs).
                    </p>
                    {Math.abs(b.calibration.biais_moyen ?? 0) >= 1 && (
                      <p className="text-sm text-amber-800 mt-2">
                        Ce décalage est systématique : nous reprenons le barème avant d’ouvrir les
                        corrections, pour toutes les copies à la fois.
                      </p>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg border border-amber-200 p-8">
              <p className="text-gray-800 leading-relaxed">
                Aucune copie étalon n’a encore été corrigée des deux côtés pour cette matière.
                Tant que ce n’est pas fait, <strong>ce dispositif ne peut pas être présenté comme
                validé</strong>, et nous ne prétendons pas que nos notes valent celles d’un
                correcteur.
              </p>
              <p className="text-sm text-gray-600 mt-3">
                Ce qui nous manque : trois copies réelles notées par un professeur, si possible
                réparties sur toute l’échelle — dont une faible et une moyenne. Le bas de l’échelle
                est ce qui nous manque le plus : il n’existe nulle part en ligne.
              </p>
            </div>
          )}
        </section>

        {/* --------------------------------------------- 5. Copie corrigée */}
        {aUneCopieCorrigee && exemple && (
          <section className="space-y-6">
            <TitreSection numero={numero('copie')} titre="Une copie réelle, corrigée par le système" />
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {nomExercice(exemple.exerciseType)} — copie anonymisée
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Corrigée telle quelle, sans retouche pour ce dossier.
                  </p>
                </div>
                <p className="text-3xl font-bold text-purple-700">
                  {fr(exemple.noteFinale)}
                  <span className="text-lg text-gray-500 font-medium"> / {exemple.bareme}</span>
                </p>
              </div>

              {baremes.length === 0 && (
                <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                  Cette copie a été corrigée avec <strong>l’ancien dispositif</strong> : la note vient
                  de la grille de compétences, pas d’un barème propre au sujet. Elle est montrée pour
                  ce qu’elle est — un point de départ à améliorer, pas le fonctionnement cible.
                </p>
              )}

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
                      autre exemple : {nomExercice(a.exerciseType).toLowerCase()} ({fr(a.noteFinale)}/{a.bareme})
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </section>
        )}

        {/* ------------------------------------------------- 6. Questions */}
        <section className="space-y-6">
          <TitreSection numero={numero('questions')} titre="Vos réponses" />
          <p className="text-gray-700">
            Chaque question porte sur <strong>un</strong> élément du dispositif. Répondez à celles
            sur lesquelles vous avez un avis, laissez les autres vides.
          </p>
          <FormulaireRelecture
            matiere={matiere}
            jeton={t!}
            aUnBareme={baremes.length > 0}
            aUneCopieCorrigee={aUneCopieCorrigee}
            calibrationFaite={calibrationFaite}
          />
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

/**
 * Dossier HGGSP : en-tête, onglets, puis les questions posées au professeur.
 * L'en-tête dit d'emblée ce qui est demandé et combien de temps cela prend.
 */
function PageHggsp({
  donnees,
  jeton,
  matiere,
}: {
  donnees: NonNullable<Awaited<ReturnType<typeof chargerRelectureHggsp>>>;
  jeton: string;
  matiere: string;
}) {
  const { grilles, taxonomie, etalons, calibration, exemples } = donnees;
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">
            Les Matinées du Bac — dossier de relecture professeur
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            HGGSP : validez notre barème de correction
          </h1>
          <p className="text-gray-700 mt-4 leading-relaxed">
            Nous corrigeons des copies de bac blanc d’HGGSP avec deux grilles analytiques distinctes
            — une pour la dissertation, une pour l’étude critique de document(s) — conformes à la
            structure officielle de l’épreuve depuis la session 2026. Avant de nous appuyer
            durablement dessus, nous voulons les faire relire par des professeurs de la discipline.
          </p>
          <p className="text-gray-700 mt-3 leading-relaxed">
            Tout est rangé par onglets : vous n’avez pas à lire d’affilée. Comptez une trentaine de
            minutes pour vous faire un avis, puis répondez aux questions en bas de page — elles
            portent séparément sur la répartition des points, les descripteurs, les erreurs types,
            leurs impacts, les doubles sanctions et la note de la copie étalon.
          </p>
        </header>

        <DossierRelectureHggsp
          grilles={grilles}
          taxonomie={taxonomie}
          etalons={etalons}
          calibration={calibration}
          exemples={exemples}
        />

        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">Vos réponses</h2>
          <FormulaireRelecture
            matiere={matiere}
            jeton={jeton}
            jeu="redige"
            aUneCopieCorrigee={exemples.length > 0}
            calibrationFaite={calibration.corrections_humaines > 0}
          />
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

function BlocBareme({ bareme }: { bareme: BaremeRelecture }) {
  const totalOk = Math.abs(bareme.totalPoints - bareme.maxScore) < 0.001;
  const libelleCompetence = new Map(bareme.competences.map((c) => [c.code, c.libelle]));

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{bareme.examTitre}</h3>
          <p className="text-sm text-gray-500 mt-0.5">Version {bareme.version}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-2.5 py-0.5 rounded-full font-medium ${
              totalOk ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-800'
            }`}
          >
            {fr(bareme.totalPoints)} / {bareme.maxScore} points
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full font-medium ${
              bareme.verrouille ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {bareme.verrouille ? 'verrouillé' : 'brouillon — en attente de votre avis'}
          </span>
        </div>
      </div>

      {bareme.questions.length === 0 ? (
        <p className="text-gray-600">Ce barème ne contient encore aucune question.</p>
      ) : (
        <div className="space-y-3">
          {bareme.questions.map((q) => (
            <div key={q.question_key} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 flex items-baseline justify-between gap-3">
                <div>
                  <h4 className="font-bold text-gray-900">
                    {q.partie ? `${q.partie} · ` : ''}
                    {q.numero} {q.libelle && <span className="font-normal text-gray-600">— {q.libelle}</span>}
                  </h4>
                  {q.competences.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {q.competences.map((c) => libelleCompetence.get(c) ?? c).join(' · ')}
                    </p>
                  )}
                </div>
                <p className="font-bold text-purple-700 whitespace-nowrap">{fr(q.max_points)} pts</p>
              </div>

              <div className="px-5 py-4 space-y-2 text-sm">
                {q.reponse_attendue && (
                  <p className="text-gray-800">
                    <span className="font-semibold">Attendu : </span>
                    {q.reponse_attendue}
                  </p>
                )}
                {q.raisonnement_attendu && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Démarche attendue : </span>
                    {q.raisonnement_attendu}
                  </p>
                )}
                {q.paliers.length > 0 && (
                  <div>
                    <p className="font-semibold text-gray-800">Attribution des points</p>
                    <ul className="mt-1 space-y-0.5 text-gray-700">
                      {q.paliers.map((p, i) => (
                        <li key={i}>
                          <strong>{fr(p.points)} pt</strong> — {p.libelle}
                          {!p.cumulable && <span className="text-gray-500"> (palier exclusif)</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {q.etapes.length > 0 && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Étapes valorisées : </span>
                    {q.etapes.map((e) => e.libelle).join(' ; ')}
                  </p>
                )}
                {q.methodes_alternatives.length > 0 && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Méthodes alternatives admises : </span>
                    {q.methodes_alternatives.map((m) => m.libelle).join(' ; ')}
                  </p>
                )}
                {q.tolerances && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Tolérances : </span>
                    {q.tolerances}
                  </p>
                )}
                {q.depend_de.length > 0 && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Reprend le résultat de : </span>
                    {q.depend_de.join(', ')}
                    {q.regle_poursuite && ` — ${q.regle_poursuite}`}
                  </p>
                )}
                {q.regle_resultat_sans_justification && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Résultat juste sans justification : </span>
                    {q.regle_resultat_sans_justification}
                  </p>
                )}
                {q.regle_raisonnement_juste_calcul_faux && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Raisonnement juste, calcul faux : </span>
                    {q.regle_raisonnement_juste_calcul_faux}
                  </p>
                )}
                {q.criteres_relecture_humaine && (
                  <p className="text-gray-700">
                    <span className="font-semibold">Relecture humaine si : </span>
                    {q.criteres_relecture_humaine}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlocGrille({ grille, nom }: { grille: Grille; nom: string }) {
  const total = grille.rubric_json.criteria.reduce((s, c) => s + c.maximum_score, 0);
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xl font-bold text-gray-900">{nom}</h3>
        <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-sm">
          référence sur {total} points — sert au diagnostic, pas à la note
        </span>
      </div>

      {grille.rubric_json.criteria.map((c) => (
        <div key={c.code} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 flex items-baseline justify-between gap-3">
            <div>
              <h4 className="font-bold text-gray-900">{c.name}</h4>
              <p className="text-sm text-gray-600">{c.description}</p>
            </div>
          </div>
          {c.levels && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(c.levels)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([niveau, description]) => (
                      <tr key={niveau} className="border-t border-gray-100">
                        <td className="px-5 py-2 font-semibold text-gray-800 whitespace-nowrap w-24 align-top">
                          niveau {Number(niveau).toLocaleString('fr-FR')}
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

function BlocTaxonomieDiscipline({ entrees }: { entrees: DonneesRelecture['taxonomieDiscipline'] }) {
  const familles = new Map<string, DonneesRelecture['taxonomieDiscipline']>();
  for (const e of entrees) {
    const liste = familles.get(e.nature) ?? [];
    liste.push(e);
    familles.set(e.nature, liste);
  }

  return (
    <div className="space-y-6">
      {[...familles.entries()].map(([nature, liste]) => {
        const meta = NOMS_NATURE[nature] ?? { titre: nature, explication: '' };
        return (
          <div key={nature} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <h3 className="text-lg font-bold text-gray-900">{meta.titre}</h3>
            {meta.explication && <p className="text-sm text-gray-600 mt-1 mb-4">{meta.explication}</p>}
            <div className="space-y-3">
              {liste.map((e) => (
                <div key={e.code} className="rounded-xl border border-gray-200 p-4">
                  <p className="font-bold text-gray-900">
                    <code className="text-purple-700">{e.code}</code> — {e.description}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Gravité pédagogique : {NOMS_GRAVITE[e.gravite] ?? e.gravite}
                    {e.domaine && ` · domaine : ${e.domaine}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const NOMS_FAMILLES_TAXO: Record<string, string> = { tous: 'Toutes les épreuves' };

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
    couleur === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-purple-50 border-purple-100';
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
