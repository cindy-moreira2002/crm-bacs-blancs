# Brevet blanc — guide complet

Livré le **8 août 2026**. Deux matières nouvelles, séparées de tout le reste :
**Français — Brevet** (`brevet_francais`) et **Mathématiques — Brevet**
(`brevet_mathematiques`), série générale, session de référence **2027**.

Le baccalauréat n'est pas concerné : `GUIDE_BAREME_PAR_SUJET.md`,
`ETAT_DES_LIEUX_CORRECTION.md` et `GUIDE_HGGSP_V2.md` restent vrais mot pour mot.

---

## 1. Architecture générale

### 1.1 Ce qui est réutilisé, et pourquoi

Le moteur « barème propre au sujet » du bac (SQL 33) apporte un socle
**générique** : un examen, des versions de barème immuables, un verrouillage,
des copies étalons, et une note qui est une **somme mécanique faite par un
trigger**. Le brevet s'y greffe plutôt que de le dupliquer.

| Réutilisé tel quel | Pourquoi c'est légitime |
|---|---|
| `exams`, `bareme_versions`, `bareme_exercices`, `bareme_questions`, `bareme_awards` | rien de pédagogique : un examen, des versions, des questions |
| `correction_questions` + trigger `correction_recalcule_note` | la note est une somme ; c'est vrai des deux examens |
| `etalon_copies`, `etalon_corrections_*`, `calibration_runs` | la calibration est la même démarche |
| `relectures_humaines`, `bareme_audit` | la traçabilité est la même |
| `transcribe-french-copy` | la lecture d'une copie manuscrite ne dépend pas de l'examen |

### 1.2 Ce qui est neuf, et pourquoi ça ne pouvait pas être partagé

| Neuf | Pourquoi |
|---|---|
| `exams.examen` / `serie` / `niveau` | les tables ne connaissaient que le bac |
| `brevet_parties` | le bac a UN maximum ; le brevet en a trois (50/10/40) ou deux (6/14) |
| moteur de **dictée** | comparaison mot à mot avec un barème de retrait propre au sujet — rien d'équivalent au bac |
| moteur de **réécriture** | distinction transformation / pure copie, avec deux barèmes distincts |
| **deux grilles de rédaction** | la note de service impose deux sujets au choix |
| **automatismes** | item par item, sans calculatrice |
| **erreurs en cascade** explicites | le bac les vérifiait ; le brevet les déclare et les valorise |
| `correction_document_qualite` | douze anomalies documentaires à détecter |
| `correction_modifications_humaines` | audit append-only des retouches |
| `sources_officielles`, `brevet_regles_officielles` | traçabilité réglementaire |

### 1.3 Les quatre moteurs, après ce chantier

| `corrections.moteur` | Edge Function | Examen |
|---|---|---|
| `grille_generique` | `correct-french-copy` | BAC |
| `bareme_sujet` | `correct-copy-bareme` | BAC |
| `brevet_francais` | **`correct-brevet-francais`** | DNB |
| `brevet_mathematiques` | **`correct-brevet-maths`** | DNB |

L'aiguillage est dans `private.auto_launch_french_correction()`. Les deux
branches du bac sont **reprises mot pour mot** ; deux branches s'ajoutent.

### 1.4 L'étanchéité, vérifiée à cinq endroits

« Aucune copie du brevet ne doit pouvoir être corrigée accidentellement avec une
grille du bac. » Le garde-fou est rejoué cinq fois, indépendamment :

1. **contrainte en base** `exams_brevet_coherence` : matière `brevet_*` ⇔ `examen = 'DNB'`, dans les deux sens ;
2. **`pipeline_diagnostic()`** refuse une copie dont l'examen n'est pas DNB, ou dont la matière ne correspond pas au moteur ;
3. **`verifierAppariementMatiere()`** dans chaque Edge Function, **avant tout appel à Claude** ;
4. **`chargerExamenBrevet(examId, matiere)`** renvoie `null` si l'examen n'est pas un DNB de cette matière — ouvrir l'URL d'un examen de maths dans l'écran de français ne montre rien ;
5. **routes physiquement séparées** : la matière est écrite en dur dans chaque fichier de route, jamais lue dans le corps de la requête.

Les tests `2.4` et `5.4` de `test-brevet-nonregression.ts` le vérifient sur
toutes les combinaisons.

---

## 2. Français — brevet

### 2.1 L'épreuve

3 heures, **100 points ramenés sur 20**. Trois blocs indépendants :

| Bloc | Points | Durée | Moteur |
|---|---|---|---|
| Travail sur le texte (réécriture comprise) | **50** | 1 h 10 | questions + module réécriture |
| Dictée | **10** | 20 min | comparaison mot à mot |
| Rédaction | **40** | 1 h 30 | grille du sujet choisi |

Le bloc de 50 se **subdivise**, dans les sujets réels, en deux sous-parties que
le sujet zéro de la session 2026 nomme explicitement — `comprehension`
(32 points) et `grammaire` (18 points, réécriture comprise). Le moteur accepte
les deux, plus une partie générique `texte` pour un sujet qui ne les
distinguerait pas ; il vérifie seulement que leur somme fait 50.

### 2.2 Travail sur le texte

Le barème est reconstruit **question par question**. Chacune porte : identifiant
stable, numéro et sous-numéro, formulation, compétence, type de réponse
(25 types), éléments attendus, points, réponses alternatives, citations
attendues, degré de justification, règles de points partiels, erreurs
caractéristiques, dépendances, codes d'erreur.

Douze statuts de réponse sont distingués. Trois règles pèsent sur les points :

- **le plein est réservé** à `exacte` et `equivalente_vocabulaire_different` :
  une reformulation qui répond réellement à la question vaut le plein, une
  formulation identique au corrigé n'est **jamais** exigée ;
- **`illisible` n'est pas `absence_de_reponse`** : la question part en
  validation humaine, et l'écran le dit ;
- une **citation sans explication** quand le barème exige une citation expliquée
  ne vaut pas le plein ; une **explication sans la citation exigée** ne vaut
  jamais zéro d'office — le cas est signalé pour arbitrage.

### 2.3 Réécriture

Traitement forme par forme (`evaluerReecriture`). Pour chacune : forme
originale, forme attendue, forme produite, transformation demandée, statut,
points, type d'erreur, justification.

Sept statuts, dont les deux qui comptent :

- **`transformation_manquee`** — la transformation demandée n'est pas faite ;
- **`erreur_de_copie_seule`** — la transformation est réussie, l'écart porte sur
  la copie (accent, casse). Les points de transformation **restent acquis**, et
  l'erreur relève du « barème spécifique » prévu par la note de service.

Une forme ne peut jamais être pénalisée **deux fois**. Et sans barème de copie
saisi, **aucune pénalité n'est appliquée** : le moteur ne l'invente pas.

### 2.4 Dictée

**Le point le plus important du dispositif** : aucun barème national de dictée
n'existe. Sans règles de retrait saisies pour le sujet, `evaluerDictee()`
renvoie `score: null`, le bloc n'est pas noté, et la copie part en validation
humaine bloquante. Le moteur refuse de noter plutôt que d'inventer.

Quand les règles existent, l'algorithme aligne le texte attendu et le texte
transcrit (Needleman-Wunsch avec coût de substitution dégressif selon la
ressemblance), puis classe chaque écart en 16 catégories : mot oublié, mot
ajouté, accord, grammaire, lexique, conjugaison, homophone, accent, majuscule,
ponctuation, trait d'union, apostrophe, segmentation, graphie rectifiée,
reconnaissance OCR.

Cinq garde-fous, tous testés :

| Garde-fou | Comment |
|---|---|
| pas de double pénalisation | une même erreur (attendu → produit) n'est comptée qu'une fois, sauf `cumul_repetitions` |
| pas de multiplication par décalage OCR | ≥ 6 écarts consécutifs **avec au moins un mot aligné** ⇒ décalage suspecté, pénalités annulées, relecture demandée |
| une graphie illisible n'est pas une faute | `[illisible]` est ignoré et signalé |
| pas de faute inventée sur une lecture incertaine | la certitude tombe à 0,3 sur une zone douteuse |
| plafond par catégorie | appliqué après coup, jamais dépassé |

Une **copie blanche** n'est pas un décalage : le cas est distingué (aucun mot
aligné), la note tombe au plancher, et une alerte demande de vérifier que la
dictée n'a pas simplement été oubliée à la transcription.

Le texte attendu **n'est jamais transmis au modèle** : sinon il le recopierait
au lieu de lire la copie. Le modèle transcrit, le serveur compare.

### 2.5 Rédaction

Le sujet traité est identifié d'abord : `imagination`, `reflexion`, `incertain`,
`les_deux`, `non_identifiable`. Dans les trois derniers cas, **aucune note n'est
posée** sur les 40 points et un humain tranche.

Deux grilles **distinctes**, jamais fusionnées, chacune obligatoire. Vingt axes
chacune (§6.4 du cahier des charges), avec les descripteurs du sujet.

**Non-double-pénalisation** : chaque critère appartient à une famille (`langue`,
`consigne`, `organisation`, `contenu`). Une même faiblesse ne fait perdre des
points que dans **un** critère de sa famille, sauf `cumul_famille_autorise`.

La **longueur insuffisante** se paie par le critère « longueur attendue » du
barème, jamais par un retrait supplémentaire décidé par le moteur.

### 2.6 Taxonomie

67 codes, 25 catégories minimales, quatre natures (`eleve`, `transcription`,
`reconnaissance`, `sujet`). Chaque code porte : libellé élève, explication,
gravité, pénalité par défaut éventuelle **avec sa règle d'application**, plafond
de perte, cumul autorisé, points partiels possibles, exemple, conseil,
compétence, source, version.

La gravité est **pédagogique** : elle ne retire aucun point. Seul le barème du
sujet, ou une `penalite_defaut` explicitement renseignée avec sa règle, agit sur
la note.

---

## 3. Mathématiques — brevet

### 3.1 L'épreuve

2 heures, **20 points**, exercices indépendants.

| Partie | Points | Durée | Calculatrice |
|---|---|---|---|
| 1 — Automatismes | **6** | 20 min | **interdite** |
| 2 — Raisonnement et résolution de problèmes | **14** *(dont 2 de rédaction)* | 1 h 40 | autorisée |

### 3.2 Partie 1 — automatismes

Item par item : numéro, notion, thème (les cinq de la liste ministérielle
d'octobre 2025), compétence, réponse attendue, variantes acceptées, unité,
tolérance, forme exigée, points.

Neuf statuts. **Point de vigilance explicite** : l'absence de calculatrice
n'autorise aucun retrait quand la réponse est correcte. Si le modèle propose
moins que le maximum sur une réponse `exacte`, le moteur **rétablit** le plein
et le signale.

### 3.3 Partie 2 — raisonnement

Dix-neuf statuts distingués. Six règles pèsent sur les points :

1. **Essais et démarches non aboutis** — la note de service l'impose. Le
   plancher d'une question est la somme des **étapes valorisables** validées.
   Une question sans étape valorisable est un **blocage de barème**.
2. **Erreurs en cascade** — champs `depends_on_question`, `inherited_value`,
   `cascade_error`, `method_valid_from_student_value`,
   `cascade_penalty_applied`. Une poursuite correcte sur un résultat faux garde
   ses points ; une question à 0 qui dépend d'une question ratée sans poursuite
   déclarée est signalée comme **double sanction possible**.
3. **Méthodes alternatives** — jamais zéro d'office. Une méthode valide non
   prévue part en validation humaine avec les points qu'elle mérite.
4. **Pas de points sur des mots-clés** — des points attribués sans qu'aucune
   étape du barème ne soit identifiée déclenchent une alerte.
5. **Géométrie** — six étapes exigibles (hypothèses, propriété, remplacement
   numérique, calcul, unité, conclusion). Une conclusion correcte sans elles
   n'est pas une démonstration complète : le plein est refusé.
6. **Illisible ≠ faux** — lecture la plus favorable, validation humaine.

Les figures ne sont pas à l'échelle : le prompt interdit de mesurer sur un
dessin, et `MA-GEO-08` sanctionne l'usage d'une mesure prise sur la figure.

**Algorithmique et Scratch** : le prompt impose la prudence, et un bloc illisible
déclenche `transcription_incertaine` plutôt qu'une lecture devinée.

### 3.4 Les 2 points de qualité rédactionnelle

Huit points de contrôle : clarté, précision, présentation des calculs,
justification, vocabulaire, unités, conclusions, enchaînement.

Deux garanties :

- **ils sont COMPRIS dans les 14.** `verifierTotauxMaths()` et
  `brevet_verifier()` refusent tous deux un barème où les questions totalisent
  14 **et** la rédaction 2 (code `redaction_ajoutee_au_dessus`) ;
- **ils ne doublonnent pas.** Un défaut de justification ou une unité manquante
  déjà sanctionnés question par question neutralisent le critère correspondant,
  qui retrouve son maximum. La liste des doublons évités est affichée.

### 3.5 Taxonomie

45 codes, 33 catégories minimales, même structure complète qu'en français.
Aucun code n'est partagé avec le français (vérifié par le test `2.6`).

---

## 4. Structure des barèmes

### 4.1 Français

```
bareme_versions (max_score = 100)
├── bareme_questions (partie = 'comprehension')    → 32 dans le sujet zéro
├── bareme_questions (partie = 'grammaire')        → 8 + réécriture 10 = 18
├── brevet_reecriture_config + _items              → comprise dans les 50
├── brevet_dictee_config + brevet_dictee_regles    → 10
└── brevet_redaction_grilles (×2) + _criteres      → 40 chacune
```

### 4.2 Mathématiques

```
bareme_versions (max_score = 20)
├── brevet_automatismes                            → 6
├── bareme_questions (partie = 'raisonnement')     → 14 − qualité
└── brevet_qualite_redaction_criteres              → 2, COMPRIS dans les 14
```

### 4.3 Ce que `brevet_verifier()` refuse

| Code | Message |
|---|---|
| `bloc_texte_incorrect` | compréhension + grammaire + réécriture ne font pas 50 |
| `bloc_dictee_incorrect` | la dictée n'est pas sur 10 |
| `bloc_redaction_incorrect` | la rédaction n'est pas sur 40 |
| `total_incorrect` | le total ne fait pas 100 (français) ou 20 (maths) |
| `dictee_sans_regles` | aucune règle de retrait : le bloc ne serait pas noté |
| `dictee_sans_texte` | pas de texte attendu : aucune comparaison possible |
| `grilles_redaction_incompletes` | une seule grille de rédaction |
| `grille_redaction_incoherente` | les critères ne totalisent pas les 40 |
| `corrige_manquant` | une question sans élément ou résultat attendu |
| `automatismes_incorrect` | les automatismes ne font pas 6 |
| `partie2_incorrecte` | la partie 2 ne fait pas 14 |
| `redaction_ajoutee_au_dessus` | **les 2 points ajoutés au-dessus des 14** |
| `etapes_manquantes` | une question sans étape valorisable |
| `competence_manquante` / `competence_inconnue` | compétence absente ou hors référentiel |
| `dependance_inconnue` | `depend_de` pointe vers une question inexistante |
| `calculatrice_partie1` | calculatrice autorisée en partie 1 |

Avertissements non bloquants : points partiels manquants, réécriture absente,
barème de copie non renseigné, règle de cascade manquante, aucune méthode
alternative, corrigé de l'examen absent, qualité rédactionnelle ≠ 2 points.

---

## 5. Structure des prompts

| Fichier | Contenu |
|---|---|
| `supabase/functions/_shared/brevet-francais-prompt.ts` | consigne système + schéma JSON + validateur |
| `supabase/functions/_shared/brevet-maths-prompt.ts` | idem, mathématiques |

Les deux consignes imposent le même **ordre de priorité**, énoncé en tête :

1. `subject_bareme` — barème détaillé du sujet ;
2. `official_correction` — corrigé officiel ou validé ;
3. `admin_instruction` — consignes de l'administratrice ;
4. `official_exam_rule` — règles officielles du DNB ;
5. `default_rubric` — grille par défaut, en dernier ressort.

Le dossier remis au modèle est **ordonné dans cet ordre** (`priorite_1_…` à
`priorite_4_…`) : la hiérarchie n'est pas seulement écrite, elle est structurelle.

Chaque décision remonte sa `source_decision` et sa `nature_decision`
(`prevue_par_bareme` / `interpretation_raisonnable` / `a_valider`).

**Ce que les prompts interdisent explicitement** : inventer une réponse, une
citation ou le contenu d'une zone illisible ; attribuer une réponse à la
mauvaise question ; écrire une note, un total ou un pourcentage ; employer un
code hors taxonomie ; écrire quoi que ce soit d'humiliant ou de médical.

Versions : `VERSION_PROMPT_FRANCAIS`, `VERSION_PROMPT_MATHS`,
`VERSION_CORRECTION_BREVET`. Elles voyagent dans les métadonnées du résultat.

---

## 6. Schémas JSON

Le modèle ne renvoie **jamais de note**. Il n'y a nulle part où en écrire une :
les schémas n'ont aucun champ de total, et le validateur refuse `note`,
`note_finale`, `score_total`, `total`, `note_sur_20`, `score_out_of_20`.

`question_key`, `item_key`, `cle` et les codes de critères sont des `enum`
construits depuis le barème du sujet : une question inventée est impossible.

Le validateur serveur (`validerSortieFrancais` / `validerSortieMaths`) ajoute ce
qu'un schéma ne sait pas exprimer :

- aucune chaîne à la place d'un nombre ;
- aucune clé hors barème, aucune clé en double ;
- `certitude` et `confidence` dans [0 ; 1] ;
- `null` seulement là où l'information est réellement indisponible ;
- **cohérence de cascade** : `cascade_error` sans `depends_on_question` est
  refusé ; `method_valid_from_student_value` sans `cascade_error` aussi.

Toute violation est une **erreur de validation** : la correction échoue et rien
n'est écrit. Voir `metadata` / `document_quality` / `sections` / `score` /
`errors` / `student_feedback` / `human_review` dans le résultat.

Le serveur **recalcule les totaux** dans tous les cas, puis le trigger
`correction_recalcule_note` les recalcule une seconde fois en base. Si les deux
divergeaient, la base fait foi — c'est elle que lisent les écrans.

---

## 7. Tables Supabase

**Nouvelles** (20, toutes RLS activée sans policy) :

`brevet_parties` · `brevet_reecriture_config` · `brevet_reecriture_items` ·
`brevet_dictee_config` · `brevet_dictee_regles` · `brevet_redaction_grilles` ·
`brevet_redaction_criteres` · `brevet_automatismes` ·
`brevet_qualite_redaction_criteres` · `correction_automatismes` ·
`correction_reecriture_formes` · `correction_dictee_erreurs` ·
`correction_redaction` · `correction_redaction_criteres` ·
`correction_qualite_redaction` · `correction_document_qualite` ·
`correction_modifications_humaines` · `sources_officielles` ·
`brevet_regles_officielles` · `brevet_parametres`

**Colonnes ajoutées** (toutes en `if not exists`, aucune ligne existante touchée) :

- `exams` : `examen`, `niveau`, `serie` ;
- `corrections` : `amenagements` ;
- `correction_questions` : `bloc`, `partie`, `statut_reponse`, `source_regle`,
  `nature_decision`, `certitude`, `depends_on_question`, `inherited_value`,
  `cascade_error`, `method_valid_from_student_value`, `cascade_penalty_applied` ;
- `bareme_questions` : `sous_numero`, `type_reponse`, `elements_attendus`,
  `citations_attendues`, `degre_justification`, `domaines`, `connaissances`,
  `justification_attendue`, `regle_cascade`, `etapes_geometrie`,
  `regles_points_partiels` ;
- `relectures_humaines` : `degre` ;
- `taxonomie_erreurs` : douze colonnes (libellé élève, pénalité, règle, plafond,
  cumul, exemple, conseil, source, version…).

**Contraintes élargies, jamais rétrécies** : `corrections_moteur_valide`
(+2 valeurs), `etalon_copies_niveau` (+4 niveaux).

**Traçabilité** : `correction_modifications_humaines` est **append-only** — un
trigger refuse tout `UPDATE` et tout `DELETE`. On n'efface pas une décision, on
en ajoute une nouvelle.

---

## 8. Procédure : ajouter un sujet

1. **`/admin/brevet`** → choisir la matière → **« + Nouveau brevet blanc »**.
   Identifiant stable, titre, session (2027), date. Le barème 1.0 naît avec lui,
   en brouillon, avec ses blocs au bon maximum.
2. **Onglet « Examen »** : coller le **sujet**, le **corrigé** et les **consignes
   particulières**. En mathématiques, décrire par écrit les figures, tableaux et
   scripts : le correcteur ne reçoit que du texte.
3. **Français** — quatre onglets à remplir :
   - *Texte et langue* : une ligne par question, avec ses éléments attendus (obligatoire) et ses règles de points partiels ;
   - *Réécriture* : les 5 ou 10 formes, et le barème spécifique aux erreurs de copie ;
   - *Dictée* : le texte attendu (~600 signes), la provenance du barème, et les règles de retrait — **sans elles, la dictée ne sera pas notée** ;
   - *Rédaction* : les **deux** grilles, chacune totalisant 40.
4. **Mathématiques** — trois onglets :
   - *Automatismes* : les items, jusqu'à 6 points exactement ;
   - *Partie 2* : les questions, avec leurs **étapes valorisables**, leurs méthodes alternatives, leurs dépendances et leurs règles de cascade ;
   - *Qualité de la rédaction* : 2 points, **compris dans les 14**.
5. **« Vérifier »**. Le bandeau liste les blocages. Tant qu'il en reste un,
   « Verrouiller » est gris.

---

## 9. Procédure : corriger

1. Le barème est **verrouillé**, l'examen est en **`correction_open`**.
2. La copie est déposée par le circuit habituel, avec
   `moteur = 'brevet_francais'` ou `'brevet_mathematiques'` et son `exam_id`.
3. `transcribe-french-copy` transcrit ; le trigger aiguille vers la bonne Edge
   Function ; celle-ci vérifie l'appariement, appelle Claude, valide la sortie,
   recalcule tout, écrit le détail.
4. **`/admin/brevet/<matière>/copies`** : la liste, filtrable sur « à vérifier ».
5. L'écran de correction montre, pour chaque unité : réponse détectée, réponse
   attendue, analyse, points proposés, maximum, **source de la règle**, erreurs
   types, niveau de confiance, et le bouton de modification.

Une copie étalon (`est_etalon = true`) peut être corrigée **avant** verrouillage :
c'est précisément à quoi elle sert.

---

## 10. Procédure : valider

Trois degrés, jamais confondus :

| Degré | Effet |
|---|---|
| **information** | affiché, n'empêche rien |
| **validation recommandée** | la copie passe en `corrected_review` |
| **validation obligatoire** | **bloque** la validation de la note |

Quatorze déclencheurs (`MOTIFS_VALIDATION`). Bloquants par défaut : copie
partiellement illisible, page manquante, sujet de rédaction ambigu, barème
incomplet, contradiction barème/corrigé, total incohérent, erreur OCR impactant
les points, appariement sujet/copie douteux.

**Retoucher un score** : la valeur proposée par l'IA, la nouvelle valeur, le
correcteur, la date, le motif, le commentaire et l'impact sur la note sont
conservés. **Au-delà d'un point d'écart, la justification est obligatoire** —
vérifié côté serveur, pas seulement dans le formulaire.

**Trancher une erreur de dictée** : « Retenir » ou « Écarter ». La pénalité est
recalculée et le bloc mis à jour par `points_humain`, ce qui laisse la trace de
ce que l'IA avait proposé.

**Valider la note** : refusé tant qu'un motif **bloquant** reste ouvert.

---

## 11. Procédure : calibrer

1. Importer des copies étalons sur l'examen, avec leur **niveau visé** (neuf
   niveaux, dont *copie atypique*, *incomplète*, *difficile à lire*).
2. Saisir la correction **de chaque professeur séparément** — jamais fusionnées.
3. Faire corriger par l'IA (le barème n'a pas besoin d'être verrouillé).
4. Onglet **Calibration** : écart par copie, écart absolu moyen, taux d'accord
   question par question, **faux positifs**, **faux négatifs**, désaccords,
   catégories les moins fiables, fréquence des retouches humaines.
5. Le bandeau **« Prêt pour la production ? »** répond **non** tant que : moins
   de 6 copies comparées, plus de 3 niveaux absents du corpus, ou écart absolu
   moyen > 1 point. **C'est un garde-fou, pas un feu vert** — il ne dit jamais
   oui tout seul.

> **Le système n'est pas prêt pour la production sans calibration humaine.**
> Aucune ligne de code ne change cela.

---

## 12. Mise à jour réglementaire

Voir **`SOURCES_OFFICIELLES_DNB.md`, §3** — procédure en 7 étapes.

---

## 13. Sources officielles

Voir **`SOURCES_OFFICIELLES_DNB.md`**. En résumé : note de service NOR
**MENE2515977N** (BO n° 33 du 4 septembre 2025) pour toutes les valeurs
chiffrées, et la **liste indicative d'automatismes** (octobre 2025) pour les
thèmes de la partie 1.

---

## 14. Limites connues

1. **Le correcteur ne reçoit que du texte.** Aucune figure, aucun graphique,
   aucune capture Scratch, aucune image du sujet de français ne lui parvient.
   C'est la limite principale. Elle est portée par le prompt, et toute question
   qui en dépend part en validation humaine. Remède partiel : décrire les
   documents par écrit dans le champ « sujet ».
2. **Aucun barème réel n'est encore saisi.** L'infrastructure, les moteurs,
   l'interface et les tests sont livrés ; le premier sujet reste à écrire.
3. **Aucune copie réelle n'a été corrigée.** Les moteurs n'ont jamais tourné
   contre Claude : les 125 tests sont hors ligne. La première correction réelle
   est aussi le premier test de bout en bout.
4. **Les sujets zéro officiels sont installés** (`npm run brevet:sujets-zero`),
   mais publiés **sans corrigé** : leurs barèmes arrivent en brouillon, avec des
   blocages qui listent exactement ce qu'un professeur doit saisir. Trois
   réponses d'automatismes dépendent d'une figure non transmise. La **série
   professionnelle** n'est pas installée : elle est hors du dispositif.
5. **Le calendrier des nouveaux programmes de cycle 4 reste à confirmer.**
6. **Le plafond de dépense Anthropic n'est toujours pas posé** (voir
   `ETAT_DES_LIEUX_CORRECTION.md`). Corriger des copies consomme du crédit.
7. **La saisie du barème est manuelle.** Aucun import automatique depuis un PDF.
8. **Le rapport élève n'a pas encore d'écran côté élève** : il est produit,
   stocké dans `result_json.student_feedback`, et visible dans l'onglet
   *Synthèse* de l'écran de correction. Le brancher sur `/dossier/[id]` reste à
   faire.
9. **La série professionnelle n'est pas couverte.** Le dispositif ne traite que
   la série générale.

---

## 15. Sécurité

- **Aucune clé côté client.** `PIPELINE_SUPABASE_SERVICE_ROLE_KEY` et
  `ANTHROPIC_API_KEY` ne sont lues que par le serveur et les Edge Functions. Les
  écrans passent tous par `/api/admin/brevet/*`.
- **RLS activée sans aucune policy** sur les 20 tables nouvelles : `anon` et
  `authenticated` ne peuvent ni lire ni écrire. Seuls `service_role` et le SQL
  Editor y accèdent.
- **`brevet_verifier()` et `brevet_verrouiller()`** sont révoquées de `public`,
  `anon` et `authenticated`, et accordées à `service_role` seul.
- **Toutes les routes d'administration** exigent `role = 'admin'` (`gardeAdminBrevet`).
- **Les Edge Functions** se protègent par `x-pipeline-secret`, comme les quatre
  autres.
- **La matière n'est jamais lue dans le corps d'une requête** : elle est écrite
  en dur dans chaque route. Trafiquer le JSON ne permet pas d'envoyer une copie
  de français au moteur de mathématiques.
- **L'historique des retouches est append-only**, garanti par trigger.

---

## 16. Commandes de test

```bash
npm run test:brevet
```

125 tests hors ligne, sans réseau : 55 en français, 44 en mathématiques,
26 de non-régression du baccalauréat.

```bash
npm run test:brevet:francais        # les trois blocs, la dictée, la réécriture
npm run test:brevet:maths           # automatismes, cascades, totaux 6+14
npm run test:brevet:nonregression   # le bac n'a pas bougé
npm run seed:brevet                 # contrôle des référentiels
```

Les suites du baccalauréat restent vertes :

```bash
npm run test:bareme    # 58 tests
npm run test:hggsp     # 49 tests
```

---

## 17. Procédure de retour arrière

**En base** : le **bloc 12** de `supabase/sql/42_brevet_socle.sql`, en
commentaire, défait le fichier dans l'ordre inverse — rétablissement de
l'aiguillage à deux branches, suppression des 20 tables, rétrécissement de la
contrainte de moteur. Les référentiels se retirent par les cinq `delete` en tête
de `43_brevet_referentiels.sql`.

> À jouer **uniquement** tant qu'aucun examen DNB n'a de correction. Sinon,
> passer les examens en `statut = 'archived'` : le principe du dispositif est
> qu'aucune donnée ne disparaît. Le retrécissement de `corrections_moteur_valide`
> échouera d'ailleurs s'il reste des copies de brevet — c'est voulu.

**Côté code** : supprimer les répertoires `src/app/admin/brevet`,
`src/app/api/admin/brevet`, les fichiers `src/lib/brevet*.ts`,
`src/lib/matieresBrevet.ts`, `supabase/functions/_shared/brevet-*.ts`,
`supabase/functions/correct-brevet-*`, `scripts/brevet/`,
`scripts/seed-brevet.mjs`, `scripts/installer-sujets-zero.ts`,
`scripts/test-brevet-*.ts`, et retirer les cinq scripts npm. Deux retouches à défaire ailleurs : les deux valeurs ajoutées à
`EdgeFunctionName` dans `src/lib/pipeline.ts`. **Aucun autre fichier existant
n'a été modifié.**

**Côté Supabase** : les deux Edge Functions se suppriment depuis le dashboard.
Les quatre autres n'ont pas été touchées.
