'use client';

/**
 * « Comprendre le système » — le lexique du pipeline en français courant,
 * pour piloter sans jamais ouvrir Supabase. Contenu statique, replié par
 * défaut, pensé pour être relu six mois plus tard sans contexte.
 */
import { useState } from 'react';

const ETAPES_FLUX = [
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
    texte: 'L’IA note le texte en suivant le barème de l’épreuve, en comparant la copie aux copies étalons du sujet, et en surveillant les pièges listés sur le sujet. Résultat : la note et le détail par critère, dans corrections.result_json.',
  },
  {
    n: '4',
    titre: 'Dossier élève',
    texte: 'Le gabarit transforme la correction brute en dossier lisible remis à l’élève (table dossiers). L’élève voit une fourchette de note ; la note exacte reste ici, dans l’administration.',
  },
];

const NOTIONS: { terme: string; simple: string; precis: string }[] = [
  {
    terme: 'Barème (table rubrics)',
    simple: 'La grille de notation d’UNE épreuve : les critères, leurs points, et la consigne complète donnée au correcteur IA.',
    precis:
      'Chaque critère (ex. PROB « problématisation ») a des paliers décrits noir sur blanc — c’est exactement ce que tu déplies dans la vue matière. Le system_prompt est la consigne intégrale envoyée à l’IA ; la taxonomie d’erreurs est la liste des codes d’erreur qu’elle a le droit d’utiliser dans le dossier. Un barème par type d’épreuve et par filière.',
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
          {/* Le trajet d'une copie */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2">Le trajet d’une copie</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
            À préparer par matière : barèmes + sujets + étalons + gabarits (les 4 tables de préparation). Le reste
            (corrections, transcriptions, dossiers) se remplit tout seul quand les copies arrivent.
          </p>
        </div>
      )}
    </section>
  );
}
