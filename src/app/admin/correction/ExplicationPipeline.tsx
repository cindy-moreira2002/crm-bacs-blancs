'use client';

/**
 * « Comprendre le système » — le lexique du pipeline en français courant,
 * pour piloter sans jamais ouvrir Supabase. Contenu statique, replié par
 * défaut, pensé pour être relu six mois plus tard sans contexte.
 */
import { useState } from 'react';

const ETAPES_FLUX = [
  {
    n: '0',
    titre: 'Avant tout : le barème',
    texte: 'Un bac blanc ne peut pas être corrigé tant que son barème n’est pas écrit question par question, testé sur des copies étalons, validé et VERROUILLÉ. Une fois verrouillé il ne bouge plus : c’est ce qui garantit que toutes les copies du lot sont notées avec le même barème. Tout se passe dans /admin/bareme.',
  },
  {
    n: '1',
    titre: 'Dépôt',
    texte: 'Un prof glisse le PDF de la copie sur « Déposer une copie ». Le fichier part dans le stockage (bucket student-copies), une ligne apparaît dans la table corrections avec le statut « uploaded ».',
  },
  {
    n: '2',
    titre: 'Transcription',
    texte: 'L’IA recopie la copie manuscrite en texte (table copy_transcriptions). Pour les matières scientifiques, un profil de transcription spécial (transcription_profiles) lui apprend à lire formules et schémas.',
  },
  {
    n: '3',
    titre: 'Correction',
    texte: 'Là où le bac blanc a un barème propre, l’IA attribue des points QUESTION PAR QUESTION et la note est leur somme, calculée par la base. Le profil de compétences est construit ensuite, et ne touche pas la note. Pour les matières non encore migrées, l’IA note par critères sur la grille de compétences, comme avant.',
  },
  {
    n: '4',
    titre: 'Dossier élève',
    texte: 'Le gabarit transforme la correction brute en dossier lisible remis à l’élève (table dossiers). L’élève voit une fourchette de note ; la note exacte reste ici, dans l’administration.',
  },
];

const COUCHES = [
  {
    titre: '1 · Le barème du sujet donne la NOTE',
    texte:
      'La note sur 20 est la somme des points attribués question par question, avec le même barème et la même version pour toutes les copies d’un bac blanc. La somme est faite par la base, pas par l’IA — elle n’a pas le droit de la remplacer par une appréciation du « niveau » de l’élève.',
  },
  {
    titre: '2 · La grille de compétences donne un DIAGNOSTIC',
    texte:
      'Après l’attribution des points, on regarde ce que la copie montre de chaque compétence (chercher, raisonner, calculer…). Cela sert aux conseils donnés à l’élève. Une compétence qu’aucune question ne mobilise sort en « non applicable » : jamais zéro, jamais d’effet sur la note.',
  },
  {
    titre: '3 · Les copies étalons servent à CALIBRER',
    texte:
      'Des copies notées par des professeurs, corrigées aussi par le système, avec le même barème. Si l’IA met 10 là où trois profs mettent 13, on corrige le barème — pour toutes les copies, avant verrouillage. On n’ajoute jamais de points aux copies qui « ressemblent » aux étalons.',
  },
];

const NOTIONS: { terme: string; simple: string; precis: string }[] = [
  {
    terme: 'Bac blanc et son barème (tables exams, bareme_versions, bareme_questions)',
    simple:
      'Un bac blanc précis avec SON barème : chaque question porte son maximum, la réponse attendue, la démarche attendue et les fractions de points attribuables.',
    precis:
      'Le total doit valoir exactement 20, chaque question doit avoir sa réponse attendue, sa règle d’attribution et ses compétences : sinon le barème ne peut pas être verrouillé, et sans verrou aucune copie d’élève ne peut être corrigée. Une version verrouillée est immuable — la modifier oblige à créer une 1.1, et les copies déjà notées gardent la leur.',
  },
  {
    terme: 'Fractions de points (table bareme_awards)',
    simple:
      'Les paliers d’une question : « 0,25 si la formule est posée », « 0,5 si la dérivée est exacte ». Autant qu’il en faut, au quart de point.',
    precis:
      'Cumulables = les points s’additionnent ; exclusifs = c’est 0,25 OU 0,5. La base refuse que les paliers cumulables dépassent le maximum de la question.',
  },
  {
    terme: 'Copie étalon de barème (table etalon_copies)',
    simple:
      'Une copie corrigée à la fois par des professeurs et par le système, sur le même barème, pour vérifier que l’IA note comme eux.',
    precis:
      'Une correction humaine PAR PROFESSEUR, jamais fusionnées : quand deux profs divergent de plus de 2 points, le tableau le dit et ne cale pas le barème dessus. À ne pas confondre avec les benchmark_cards, qui calent l’ANCIENNE grille de compétences.',
  },
  {
    terme: 'Calibration (tables etalon_corrections_ia, calibration_runs)',
    simple:
      'La comparaison chiffrée entre ce que mettent les profs et ce que met le système, copie par copie et question par question.',
    precis:
      'Le chiffre qui compte est le BIAIS MOYEN : au-delà de ±1 point, le décalage est systématique et c’est le barème qu’il faut reprendre. Tant qu’aucune copie n’a été corrigée des deux côtés, la calibration n’a PAS été réalisée — et le système ne doit pas être présenté comme validé.',
  },
  {
    terme: 'Relecture humaine (table relectures_humaines)',
    simple:
      'Les cas où le système refuse de trancher seul : transcription douteuse, méthode valide non prévue au barème, justification introuvable, anomalie du sujet…',
    precis:
      'Onze déclencheurs. Aucun d’eux ne retire de points : ils marquent la copie pour qu’un humain regarde. Une méthode valide absente du barème n’est jamais mise à zéro d’office.',
  },
  {
    terme: 'Moteur de la note (colonne corrections.moteur)',
    simple:
      'Dit d’où vient la note d’une copie : « barème du sujet » (nouveau) ou « grille de compétences » (ancien).',
    precis:
      'Les deux mondes coexistent pendant la migration. Ne jamais comparer une note de l’un à une note de l’autre sans le dire : elles ne sont pas produites de la même façon.',
  },
  {
    terme: 'Grille de compétences (table rubrics)',
    simple:
      'La grille générique d’une épreuve : les compétences, leurs paliers, et la consigne donnée au correcteur IA. Elle produisait la note ; elle produit désormais le DIAGNOSTIC.',
    precis:
      'Elle reste la meilleure source sur les conventions de lecture d’une matière (comment transcrire une fraction, ce que l’IA ne voit pas d’une figure), et le nouveau moteur la lui emprunte à ce titre — en lui retirant explicitement toute autorité sur la note. Pour les matières qui n’ont pas encore de barème propre, elle continue de produire la note, comme avant.',
  },
  {
    terme: 'Sujet (table subject_cards)',
    simple: 'Un sujet de bac blanc précis (ex. « La liberté consiste-t-elle à n’obéir à personne ? »), avec ses pièges et ses attendus.',
    precis:
      'La fiche du sujet liste les pièges classiques que le correcteur doit repérer (hors-sujet, récitation de cours…) et les notions attendues. « Visible au dépôt » = les profs peuvent déposer des copies dessus ; « brouillon » = invisible.',
  },
  {
    terme: 'Copie étalon (table benchmark_cards)',
    simple:
      'Une copie d’élève DÉJÀ NOTÉE qui sert de référence : le correcteur compare la nouvelle copie aux étalons pour caler sa sévérité. Ce ne sont PAS des corrections produites par le système.',
    precis:
      'Chaque sujet a idéalement 5 étalons étagés (3/20, 7/20, 11/20, 14/20, 18/20) décrivant le profil de copie correspondant. Aujourd’hui presque tous sont « synthétiques » : inventés à l’installation pour avoir une échelle, en attendant de VRAIES copies notées par des profs. C’est LA cause des notes trop sévères — remplacer 3 étalons par matière par de vraies copies suffit à recaler. « Validée » = un prof a confirmé la note de l’étalon.',
  },
  {
    terme: 'Gabarit de dossier (table dossier_templates)',
    simple: 'Le patron du dossier remis à l’élève : structure, ton, ce qu’on montre et ce qu’on garde en interne.',
    precis:
      'Sans gabarit actif, generate-dossier refuse de produire le dossier — c’est un des verrous qui empêchaient les matières en brouillon de sortir des notes non vérifiées.',
  },
  {
    terme: 'Correction (table corrections)',
    simple: 'Une copie déposée, à n’importe quelle étape du tapis roulant : déposée → transcrite → corrigée → dossier produit.',
    precis:
      'Le statut dit où elle en est ; « failed » = la chaîne s’est arrêtée (le message d’erreur est conservé). La note interne exacte est dans result_json ; l’élève ne voit qu’une fourchette.',
  },
  {
    terme: 'Transcription (table copy_transcriptions)',
    simple: 'Le texte que l’IA a lu dans le PDF manuscrit, conservé tel quel.',
    precis: 'Utile pour vérifier une note contestée : on voit exactement ce que le correcteur a lu — une transcription trop courte signale une copie mal lue.',
  },
  {
    terme: 'Dossier (table dossiers)',
    simple: 'Le dossier de correction final, celui que l’élève ouvre via son lien.',
    precis: 'Une ligne par copie corrigée, servie en HTML sur /dossier/<id>. Impression navigateur = PDF.',
  },
  {
    terme: 'Retour de relecture (table relecture_feedback)',
    simple: 'Ce qu’un prof relecteur a répondu après avoir examiné le barème et une copie corrigée de sa matière.',
    precis: 'C’est la validation humaine qui autorise à activer une matière en confiance. Les liens de relecture s’envoient depuis la vue matière (bouton copier).',
  },
  {
    terme: 'Profil de transcription (table transcription_profiles)',
    simple: 'Le réglage de lecture des copies scientifiques : quel modèle IA lit les maths et la physique, et comment.',
    precis: 'Modifiable sans redéployer. Si la lecture des copies manuscrites se dégrade, c’est ici qu’on monte en gamme de modèle.',
  },
];

export function ExplicationPipeline() {
  const [ouvert, setOuvert] = useState(false);
  const [notionOuverte, setNotionOuverte] = useState<string | null>(null);

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-purple-50/50 transition-colors"
      >
        <div>
          <h2 className="text-lg font-bold text-gray-900">📖 Comprendre le système en 2 minutes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Étalons, barèmes, gabarits… à quoi correspond chaque chose, et le trajet d’une copie de A à Z.
          </p>
        </div>
        <span className="text-purple-600 text-sm shrink-0 ml-3">{ouvert ? 'replier ▲' : 'ouvrir ▼'}</span>
      </button>

      {ouvert && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
          {/* Les trois couches — à lire avant tout le reste */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Les trois couches, et ce qui les sépare</h3>
            <div className="grid sm:grid-cols-3 gap-2">
              {COUCHES.map((c) => (
                <div key={c.titre} className="rounded-xl bg-white border border-purple-200 p-3">
                  <p className="text-xs font-bold text-purple-700 mb-1">{c.titre}</p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{c.texte}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Le trajet d'une copie */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Le trajet d’une copie</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {ETAPES_FLUX.map((e) => (
                <div key={e.n} className="rounded-xl bg-purple-50/60 border border-purple-100 p-3">
                  <p className="text-xs font-bold text-purple-700 mb-1">
                    {e.n} · {e.titre}
                  </p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{e.texte}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lexique */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Chaque notion, en clair</h3>
            <div className="space-y-1.5">
              {NOTIONS.map((n) => (
                <div key={n.terme} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNotionOuverte(notionOuverte === n.terme ? null : n.terme)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-semibold text-gray-800">{n.terme}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{n.simple}</p>
                  </button>
                  {notionOuverte === n.terme && (
                    <p className="px-3 pb-3 text-xs text-gray-500 leading-relaxed bg-gray-50/60 pt-2 border-t border-gray-100">
                      {n.precis}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-gray-400">
            À préparer pour un nouveau bac blanc : son barème question par question, ses copies étalons, sa
            calibration, puis le verrouillage (dans /admin/bareme). À préparer par matière : la grille de
            compétences, les sujets et les gabarits de dossier. Le reste (corrections, transcriptions,
            dossiers) se remplit tout seul quand les copies arrivent.
          </p>
        </div>
      )}
    </section>
  );
}
