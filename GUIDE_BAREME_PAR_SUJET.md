# Barème propre au sujet — guide complet

Refonte du 7 août 2026. Ce document remplace, pour les mathématiques et la
physique-chimie, ce que `ETAT_DES_LIEUX_CORRECTION.md` décrit du calcul de la
note. Les autres matières continuent de fonctionner exactement comme avant.

> **Ce n'est pas une migration à terminer.** Un barème par bac blanc n'a de sens
> que là où les points dépendent des questions posées : maths, physique-chimie,
> brevet. Une épreuve rédigée — français, philosophie, histoire-géo, SES, HLP,
> SVT — se juge sur une grille écrite UNE FOIS pour l'épreuve : les critères
> d'un commentaire ne changent pas selon que le texte est de Hugo ou de
> Colette, donc un nouveau bac blanc n'y demande que son sujet. L'HGGSP a son
> propre cas, la grille rédigée (voir `GUIDE_HGGSP_V2.md`). La répartition
> officielle vit dans `src/lib/moteurs.ts` — c'est elle qui fait foi, et le
> pilotage ne réclame plus de barème là où il n'en faut pas.

---

## 1. Le problème, et ce qui change

**Avant.** La note sur 20 sortait d'une **grille générique de compétences**
(chercher, modéliser, représenter, raisonner, calculer, communiquer), la même
pour tous les sujets d'une matière. L'Edge Function `correct-french-copy`
demandait au modèle un score par critère, puis recalculait la note comme la
somme de ces scores. Un correcteur de bac ne travaille pas ainsi : il applique
le barème du sujet, question par question.

**Après.** Trois couches, nettement séparées.

| Couche | Ce qu'elle produit | Ce qu'elle n'a pas le droit de faire |
|---|---|---|
| **1. Barème du sujet** | la **note officielle** : somme des points question par question | rien d'autre ne produit la note |
| **2. Compétences** | un **diagnostic** pédagogique et des conseils | recalculer la note |
| **3. Copies étalons** | la **calibration** du barème avant verrouillage | rattraper la note d'un élève après coup |

Trois règles qui découlent de cette séparation, et qui sont vérifiées par des
tests :

- `note_brute = somme des points attribués à toutes les questions`. La somme est
  faite par un trigger Postgres (`correction_recalcule_note`), pas par l'IA.
- Un profil de compétences catastrophique ne fait pas baisser la note d'un
  quart de point (test `8.6` hors ligne, test `4.6` en base).
- Aucun code ne permet d'ajouter des points à une copie « qui ressemble aux
  étalons ». Si les étalons montrent un décalage, on reprend **le barème**,
  pour toutes les copies, avant verrouillage.

---

## 2. Architecture

### 2.1 Les tables (Supabase `xgdaibekjmtffvkwvcge`)

Seize tables nouvelles. **Aucune table existante n'a été supprimée**, aucune
ligne n'a été effacée.

**L'examen et son barème**

| Table | Rôle |
|---|---|
| `exams` | un bac blanc précis : matière, date, sujet, corrigé, consignes, statut |
| `bareme_versions` | une version immuable de barème (`1.0`, `1.1`, `2.0`), unique par examen |
| `bareme_exercices` | les exercices, pour l'ordre et les titres |
| `bareme_questions` | **le cœur** : une ligne par question, avec tout ce qu'un correcteur doit savoir |
| `bareme_awards` | les fractions de points attribuables, au quart de point, cumulables ou exclusives |

**Les référentiels, par discipline**

| Table | Rôle |
|---|---|
| `competence_referentiels` | les compétences de la discipline. `toujours_mobilisee = false` = évaluée seulement si le sujet la mobilise |
| `taxonomie_erreurs` | les codes d'erreur, avec `nature` : `eleve` / `transcription` / `reconnaissance` / `sujet` |

**La calibration**

| Table | Rôle |
|---|---|
| `etalon_copies` | une copie étalon rattachée à un examen, avec son niveau visé |
| `etalon_corrections_humaines` | **une ligne par professeur** — jamais fusionnées |
| `etalon_correction_humaine_questions` | le détail humain, question par question |
| `etalon_corrections_ia` | la correction IA, rattachée à **une version précise** |
| `calibration_runs` | un tableau de calibration figé et daté |

**La correction d'une copie**

| Table | Rôle |
|---|---|
| `correction_questions` | points, éléments observés/manquants, erreurs, preuves, incertitudes, compétences |
| `correction_competences` | le profil de compétences — aucune fonction ne le fait remonter vers la note |
| `relectures_humaines` | une ligne par motif de relecture déclenché |
| `bareme_audit` | l'historique non destructif (verrouillages, nouvelles versions, recalculs) |

**Colonnes ajoutées à `corrections`** : `exam_id`, `bareme_version_id`,
`moteur`, `score_raw`, `score_validated`, `max_score`,
`human_review_required`, `validee_par`, `validee_le`, `est_etalon`.

`moteur` distingue les deux mondes sans ambiguïté possible :
`grille_generique` (ancienne note) ou `bareme_sujet` (nouvelle note). Une
contrainte (`corrections_coherence_moteur`) impose à chacun ce dont il a
besoin, et rien de plus.

### 2.2 Les garde-fous en base

Ce que le code applicatif ne peut pas garantir seul :

| Garde-fou | Où |
|---|---|
| `total_points` se recalcule à chaque question | trigger `bareme_recalcule_total` |
| paliers cumulables ≤ maximum de la question | trigger `bareme_awards_dans_le_max` |
| une version **verrouillée** refuse toute écriture | triggers `bareme_version_verrouillee` (+ ligne de version) |
| `score_raw` = somme des `correction_questions.points` | trigger `correction_recalcule_note` |
| `points` ∈ [0, `max_points`] | contrainte `correction_questions_bornes` |
| niveaux de compétence limités aux six valeurs prévues | contrainte `correction_competences_niveau` |
| impossible de verrouiller un barème incomplet | `bareme_verrouiller()` rejoue `bareme_verifier()` |
| impossible d'ouvrir les corrections sans verrou | `exam_ouvrir_correction()` |
| RLS active, **zéro policy**, `anon`/`authenticated` révoqués | bloc 10 du SQL 33 |

### 2.3 Les fichiers

| Fichier | Rôle |
|---|---|
| `supabase/sql/33_bareme_par_sujet.sql` | tables, triggers, fonctions, aiguillage, RLS |
| `supabase/sql/34_referentiels_disciplines.sql` | 24 compétences, 53 codes d'erreur (maths + physique-chimie) |
| `supabase/sql/35_bareme_correctifs.sql` | `consignes_correcteur`, diagnostic des étalons, vue `vue_versions_par_examen` |
| `supabase/sql/38_corrections_sans_grille.sql` | contrainte conditionnelle selon le moteur |
| `supabase/functions/_shared/bareme-noyau.ts` | **les règles**, pures et sans dépendance |
| `supabase/functions/correct-copy-bareme/index.ts` | l'Edge Function de correction |
| `src/lib/baremeNoyau.ts` | ré-export du noyau pour l'application |
| `src/lib/bareme.ts` | accès base : examens, versions, questions, verrouillage |
| `src/lib/calibration.ts` | étalons, comparaison IA/humain, statistiques |
| `src/app/admin/bareme/**` | l'interface d'administration |
| `src/app/api/admin/bareme/**` | les routes, réservées à l'administratrice |
| `scripts/seed-referentiels.mjs` | (re)pose les référentiels d'une discipline |
| `scripts/test-bareme.ts` | 58 tests hors ligne |
| `scripts/test-bareme-supabase.mjs` | 45 tests contre la vraie base |

Le noyau vit sous `supabase/functions/_shared/` parce que la CLI Supabase ne
bundle que ce qui s'y trouve. `src/lib/baremeNoyau.ts` le ré-exporte : **une
seule écriture des règles**, et les tests portent sur le code réellement
exécuté en production.

### 2.4 L'aiguillage

Rien n'a été débranché. Le trigger `auto_launch_french_correction` regarde
`corrections.moteur` après la transcription :

- `bareme_sujet` → `correct-copy-bareme` ;
- tout le reste → `correct-french-copy`, exactement comme avant.

`pipeline_diagnostic()` fait la même bascule. Pour le nouveau moteur, il exige
un fichier, un barème dont les contrôles passent et dont le total vaut le
maximum, et :

- pour une **copie d'élève** : barème `locked` **et** examen `correction_open` ;
- pour une **copie étalon** : n'importe quel statut de barème — tester le
  barème avant de le verrouiller est précisément le but.

---

## 3. Ce que porte chaque question du barème

`bareme_questions` stocke, pour chaque question :

identifiant stable (`question_key`), numéro, libellé, exercice, partie,
maximum de points, réponse attendue, raisonnement attendu, étapes
intermédiaires, réponses équivalentes acceptées, méthodes alternatives, unités
attendues, précision ou arrondi, conditions et hypothèses à vérifier, usage de
la calculatrice, tolérances, compétences mobilisées, codes d'erreurs possibles,
questions dont elle reprend le résultat (`depend_de`), règle de
non-double-sanction, règle de poursuite, règle du résultat juste sans
justification, règle du raisonnement juste avec calcul faux, critères de
relecture humaine.

`bareme_awards` porte les **fractions de points**. Aucun plafond de « cinq
niveaux » : autant de paliers que nécessaire, au quart de point.
`cumulable = false` pour des paliers exclusifs (0,25 **ou** 0,5),
`cumulable = true` pour des points qui s'additionnent.

**Exemple** — Exercice 1, question 1.a, maximum 0,5 point :

| Points | Nature | Libellé | Cumulable |
|---|---|---|---|
| 0,25 | méthode | Formule générale correctement appliquée mais erreur de simplification | non |
| 0,5 | résultat | Dérivée exacte | non |

Compétence principale : `calculer`. Méthode alternative admise : passage par la
forme développée. Erreur fréquente : `MA-DERIV-01`.

---

## 4. Les règles de correction, et où elles sont écrites

| Règle | Où | Test |
|---|---|---|
| Une erreur commise tôt ne se paie qu'une fois | `verifierNonDoubleSanction()` + consigne du correcteur | `4.1` `4.2` `4.4` |
| Poursuite correcte sur un résultat antérieur faux : les points de méthode restent | `depend_de` + `poursuite_depuis` | `4.1` |
| Résultat juste sans justification : le barème de la question décide | `bareme_awards` (nature `resultat` / `methode`) | `4.5` |
| Raisonnement correct avec erreur de calcul : les points de raisonnement restent | consigne + paliers | `4.6` |
| Méthode alternative valide non prévue : relecture, jamais zéro d'office | `motifsRelectureHumaine()` | `4.7` `4.8` |
| Transcription incertaine : pas une erreur de l'élève | `transcription_incertaine` | `4.9` |
| Compétence absente du sujet : `non_applicable`, jamais zéro | `profilCompetences()` | `6.1` |

**Les onze déclencheurs de relecture humaine** (`CodeMotifRelecture`) :
transcription incertaine · formule illisible · méthode alternative non prévue ·
anomalie du sujet · points hors barème · total incohérent · règles
contradictoires · justification non localisable · double sanction possible ·
confiance insuffisante · cas non couvert par le barème.

---

## 5. Format de sortie d'une correction

```json
{
  "exam_id": "…",
  "bareme_version_id": "…",
  "rubric_version": "1.0",
  "moteur": "bareme_sujet",
  "score_raw": 11.75,
  "score_validated": 11.75,
  "max_score": 20,
  "human_review_required": false,
  "human_review_reasons": [],
  "questions": [
    {
      "question_key": "ex1_q1a",
      "numero": "1.a",
      "points": 0.25,
      "max_points": 0.5,
      "elements_observes": ["formule du produit posée"],
      "elements_manquants": ["simplification"],
      "erreurs": [{ "code": "MA-DERIV-01", "citation": "…", "certitude": 0.9 }],
      "preuves": [{ "page": 2, "citation": "…", "explication": "…" }],
      "transcription_incertaine": false,
      "relecture_humaine": false,
      "motifs_relecture": [],
      "methode_alternative": false,
      "poursuite_depuis": null,
      "competences": ["calculer"]
    }
  ],
  "competency_profile": {
    "chercher": "non_observe",
    "modeliser": "satisfactory",
    "representer": "fragile",
    "raisonner": "fragile",
    "calculer": "satisfactory",
    "communiquer": "satisfactory",
    "algorithmique": "non_applicable"
  },
  "priority_feedback": ["Justifier complètement une récurrence"],
  "taxonomy_events": [
    { "code": "MA-DERIV-01", "question_key": "ex1_q1a", "effet_points": 0.25, "relecture_humaine": false }
  ],
  "calibration_metadata": { "rubric_calibrated": true, "rubric_locked": true, "etalons_compares": 7 }
}
```

Les six niveaux de compétence, distincts et non interchangeables :

- `non_applicable` — la compétence n'est mobilisée par **aucune** question du
  sujet. Jamais zéro, aucun effet sur la note.
- `non_observe` — mobilisable, mais la copie ne permet pas de la juger.
- `insufficient` · `fragile` · `satisfactory` · `very_satisfactory` — niveau
  réellement observé, déduit du taux de réussite sur les questions concernées.
  Le modèle peut nuancer d'**un cran** au plus.

---

## 6. Physique-chimie

L'architecture est commune : même tables, même moteur, même Edge Function.
Ce qui diffère est **de la donnée**, pas du code.

Le référentiel de physique-chimie (`competence_referentiels`) porte 17 entrées :
les cinq compétences de la démarche scientifique — **s'approprier, analyser,
réaliser, valider, communiquer** — toujours évaluées, puis douze aspects fins
évalués **seulement quand le sujet les mobilise** (`toujours_mobilisee = false`,
donc `non_applicable` sinon) : démarche expérimentale, exploitation de
documents, exploitation de graphiques, schémas et modélisation, unités et
conversions, chiffres significatifs, incertitudes de mesure, équations
chimiques, bilans de matière, sens physique du résultat, conformité du
protocole, sécurité expérimentale.

La taxonomie d'erreurs `physique-chimie` (25 codes) est reprise de
`scripts/matieres/physique-chimie.mjs` : rien n'a été réinventé, on l'a
seulement sortie de `rubric_json` pour la rendre interrogeable et lui ajouter
la séparation `eleve` / `transcription` / `reconnaissance` / `sujet`.

**Ajouter une troisième discipline scientifique** : ajouter ses lignes dans
`COMPETENCES` (`scripts/seed-referentiels.mjs`), pointer le module de sa matière
pour la taxonomie, jouer `--apply`. Aucun code du moteur ne bouge, et les
compétences des disciplines ne se mélangent jamais : la clé primaire est
`(matiere, code)`, et `bareme_verifier()` refuse une compétence absente du
référentiel de **cette** discipline.

---

## 7. Ce qui n'a pas changé

- Les grilles génériques sont toutes là, étiquetées `role =
  'diagnostic_competences'`. Elles produisent toujours la note dans les matières
  dont l'épreuve est rédigée — ce n'est pas un provisoire, c'est le bon moteur
  pour elles — et servent de **contexte disciplinaire** au barème par sujet
  (conventions de transcription, limites de la matière), avec un avertissement
  explicite qui leur retire toute autorité sur la note là où un barème existe.
- Les 16 corrections déjà en base gardent leur note, marquées
  `moteur = 'grille_generique'`. Leur `score_raw` a été recopié depuis
  `result_json.note_finale`, sans retouche, pour que les écrans puissent
  afficher les deux mondes sans les confondre.
- `subject_cards`, `benchmark_cards`, `dossier_templates`, `error_taxonomy`,
  `transcription_profiles`, `relecture_feedback` : intacts.
- La transcription (`transcribe-french-copy`) et le dossier élève
  (`generate-dossier`) n'ont pas été touchés.

---

## 8. Tests

```bash
npm run test:bareme
```

58 tests hors ligne, sans réseau : contrôles du barème, ouverture des
corrections, somme mécanique, les sept règles de correction, les onze
déclencheurs de relecture, le diagnostic de compétences, la taxonomie, le
résultat structuré, la calibration, l'étanchéité entre les couches.

```bash
npm run test:bareme:supabase
```

45 tests contre la vraie base, sur un examen jetable créé puis supprimé :
recalcul automatique des totaux, refus des paliers hors maximum, verrouillage,
immuabilité d'une version verrouillée, nouvelles versions, duplication,
contraintes de cohérence, note posée par le trigger, note validée après
décision humaine, suivi des versions par lot, historique, **RLS et rôles**,
et la preuve que l'ancien système est intact.

Résultat au 7 août 2026 : **103 tests, 0 échec**.

---

## 9. Les trois procédures

### A. Créer un nouveau bac blanc

1. **`/admin/bareme` → « + Nouveau bac blanc »**. Renseigne un identifiant
   (`maths_bac_blanc_2027_01`), la matière, le titre, éventuellement le type
   d'épreuve, la session et la date. Le barème **1.0** est créé avec lui, vide,
   en brouillon. L'examen est en `draft` : rien n'est visible d'un élève.
2. **Onglet « Examen »** : colle le **texte du sujet** et celui du **corrigé**,
   et les consignes particulières s'il y en a (« l'exercice 3 admet la méthode
   matricielle »). Plus c'est complet, moins l'IA devine, moins il y a de
   relectures. Relie la fiche sujet existante si elle existe (`subject_cards.id`).
3. **Onglet « Éditeur de barème »** : crée les exercices, puis les questions.
   Pour chacune : identifiant stable, numéro, libellé, **maximum de points**,
   **réponse attendue** (obligatoire), démarche attendue, **fractions de points**
   (0,25 · 0,5 …), méthodes alternatives, erreurs fréquentes, unités, précision,
   tolérances, **compétences mobilisées** (obligatoire), codes d'erreur, et les
   questions dont elle reprend le résultat. La barre du haut affiche le total en
   permanence : **elle doit indiquer exactement 20 / 20**.
4. **« Enregistrer le barème »**, puis **« Vérifier »**. Le bandeau liste les
   blocages restants. Tant qu'il en reste un, le bouton « Verrouiller » est gris.

Erreurs que le système refuse : total ≠ 20 · question sans réponse attendue ·
question sans règle d'attribution · paliers au-dessus du maximum · compétence
absente du référentiel · dépendance vers une question inexistante.

### B. Importer et valider les copies étalons

1. **Onglet « Copies étalons » → « Importer une copie étalon »**. Donne un
   libellé, le **niveau visé** et le chemin du PDF dans le bucket
   `student-copies`. Coche « copie frontière » autour de 9–10, 11–12 et 15–16.
   Le bandeau de couverture montre les niveaux encore manquants.
2. **« + Correction d'un professeur »** : saisis les points **question par
   question**. Le total se calcule tout seul. Les points au-dessus du maximum
   sont refusés. **Un professeur = une correction** : si deux professeurs
   corrigent la même copie, saisis-les séparément — le module calcule alors la
   moyenne, la médiane, l'amplitude, et signale les questions sur lesquelles ils
   ne sont pas d'accord.
3. **« Faire corriger par l'IA »** : lance la chaîne complète (transcription
   puis correction) sur cette copie, avec la version affichée. C'est le seul cas
   où le barème n'a pas besoin d'être verrouillé.
4. Le tableau sous chaque copie compare les deux corrections, question par
   question. Les écarts de 0,5 point ou plus sont surlignés.
5. **Onglet « Calibration »** : les chiffres d'ensemble. Le nombre qui compte est
   le **biais moyen**. Au-delà de ±1 point, le message le dit : reprends le
   barème, **pour toutes les copies**, puis relance les étalons. Recommence
   jusqu'à ce que le biais soit tenu.
6. Quand une copie est jugée conforme, passe son statut à **`validee`**.
   « Figer ce tableau » enregistre une trace datée de ce que valait le barème.

Si les professeurs divergent de plus de 2 points sur une copie, le module le
dit et n'utilise pas cette copie comme vérité : tranche entre eux d'abord.

### C. Verrouiller le barème et ouvrir les corrections

1. **« Vérifier »** une dernière fois : zéro blocage.
2. Onglet « Calibration » → passe la version en **`validated`** quand un
   professeur a donné son accord.
3. **« Verrouiller cette version »**. À partir de là, la version ne peut plus
   être modifiée — ni par l'interface, ni par l'API, ni par le SQL Editor : un
   trigger la protège. Elle devient la version active de l'examen.
4. **« Ouvrir les corrections »**. L'examen passe en `correction_open` : les
   copies d'élèves peuvent être déposées et corrigées.

**Si une erreur impose une correction après ouverture** :

1. **« Créer une nouvelle version »** (1.1). Elle naît en brouillon, avec tout le
   contenu de la 1.0 ; la 1.0 reste intacte, et les copies déjà corrigées
   gardent la leur.
2. Corrige, vérifie, verrouille la 1.1.
3. Onglet « Calibration » → **« Relancer les copies d'une version périmée »**.
   Le bandeau de l'écran examen affiche un avertissement tant que le lot mélange
   deux versions. Les corrections précédentes sont conservées dans
   `bareme_audit` — rien n'est perdu.

---

## 10. Limites connues

1. **Le correcteur ne reçoit que du texte.** Aucun tableau de variations tracé,
   aucune courbe, aucun arbre, aucune figure ne lui parvient. C'est la limite
   principale, la même qu'avant ; elle est portée dans la consigne, et toute
   question qui en dépend part en relecture humaine.
2. **Aucun barème réel n'est encore saisi.** L'infrastructure, l'interface, le
   moteur et les tests sont livrés ; le premier barème de mathématiques reste à
   écrire, sujet en main. Tant qu'aucun examen n'existe, rien n'est visible
   pour un élève et rien n'a changé pour lui.
3. **La calibration ne peut pas commencer sans copies réelles notées.** C'est le
   même mur qu'avant : Internet ne publie que des copies à 14-20/20. Le bas de
   l'échelle ne peut venir que des professeurs partenaires.
4. **Le plafond de dépense Anthropic n'est toujours pas posé.** Faire corriger
   sept copies étalons consomme du crédit. À faire dans la console Anthropic,
   avant la première calibration.
5. **La saisie du barème reste manuelle.** Il n'y a pas d'import automatique
   depuis un PDF de sujet. La duplication d'un barème existant sert de point de
   départ pour une épreuve de structure comparable.
6. **Une seule note validée par copie.** Le modèle de données prépare l'analyse
   longitudinale (`correction_competences` porte la matière et la compétence,
   `corrections` porte l'examen), mais aucun écran ne l'exploite encore.
