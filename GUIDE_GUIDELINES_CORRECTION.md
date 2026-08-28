# Les guidelines de correction — la base de la correction

_Écrit le 28 août 2026. Décision de Cindy : **le classeur du professeur est la
base de la correction**. L'IA ne note pas — elle prend la correction du prof et
la transforme en dossier détaillé pour l'élève._

---

## 1. Le principe

1. Le professeur corrige dans **le classeur de sa matière** (la « guideline ») :
   il coche un palier par critère et écrit ses commentaires.
2. Il exporte la page en CSV et la dépose dans **l'espace prof → Importer la
   grille**.
3. Le CRM **calcule la note** (somme des paliers cochés), montre tout au prof,
   qui relit et corrige à l'écran.
4. À « Générer les dossiers » : la correction du prof est recopiée sur la copie
   du pipeline (`corrections.grille_prof`), **sa note devient la note affichée
   partout** (`result_json.note_finale`, `score_validated`), et l'Edge Function
   `generate-dossier` (v6) construit le dossier **sur ses critères, dans son
   ordre, avec ses points**. L'IA développe, explique, illustre, propose les
   exercices — elle ne renote jamais et n'invente aucun critère.

La note de l'IA n'est pas perdue : elle est conservée dans
`result_json.note_ia`, et `note_source` dit d'où vient le chiffre affiché.

---

## 2. Les classeurs, matière par matière

Ce que le CRM lit aujourd'hui de chaque classeur réel (Drive de Maël) :

| Matière | Classeur | Ce qui est lu | Colonnes élèves |
|---|---|---|---|
| Français — commentaire | français V0 | 14 critères, /20 | ❌ pas encore |
| Français — dissertation | français V0 | 14 critères, /20 | ❌ |
| Philosophie | philo V0 | 25 critères, dissertation /20 + explication /20 | ❌ |
| SES | SES V0 | 21 critères, dissertation /20 + épreuve composée /20 | ✅ 3 colonnes |
| HGGSP | HGGSP V0_2 | 20 critères, dissertation /10 + étude critique /10 | ❌ |
| Maths spécialité | spé maths V0 | 6 compétences, /20 | ❌ |
| Maths 1ère | 1ère tronc commun V0 | 6 compétences, /14 (+ QCM /6 non détaillé) | ✅ 3 colonnes |

« Colonnes élèves » = la zone où le prof coche (deux colonnes par élève :
`niveau ?` et `commentaire`). **Seuls SES et maths 1ère l'ont** : dans les
autres classeurs, le prof n'a nulle part où cocher. Ces deux colonnes se
recopient (les élèves en en-tête, au-dessus) dans les cinq autres — sans
urgence tant qu'on est en essai, puisque les vrais bacs blancs ne commencent
qu'en novembre 2026. À poser avant la mise en service réelle.

Le contrôle `npm run test:guideline` fige ces chiffres : si un classeur change
de barème ou de mise en page, il tombe.

---

## 3. Les trois mises en page acceptées

Le prof ne choisit rien, le CRM reconnaît :

1. **élèves en colonnes** (SES, maths 1ère — la forme récente) : barème à
   gauche, deux colonnes par élève à droite, une case par palier ;
2. **élèves en blocs** (HGGSP V0) : un bloc de lignes par élève ;
3. **grille à plat** (ancien classeur `Grilles_correction_MatineesDuBac`) : une
   ligne par élève, une colonne par critère, note saisie.

Règles de lecture, les mêmes partout :

- **le palier le plus haut coché fait foi** — que le prof coche une seule case
  ou toutes les cases jusqu'au niveau atteint ;
- **un critère sans case cochée n'est jamais compté 0 en silence** : il remonte
  en avertissement à l'écran ;
- **une partie entièrement non cochée est ignorée** : en philo (dissertation OU
  explication) et en SES (dissertation OU épreuve composée), l'élève ne traite
  qu'un sujet — sa note est ramenée sur la partie traitée, pas sur 40 ;
- si le barème de la page ne fait pas 20, la note est ramenée sur 20 et la
  conversion est écrite noir sur blanc, modifiable à l'écran ;
- un élève écrit en **prénom seul** est retrouvé parmi les inscrits ; deux
  homonymes → le CRM refuse de trancher et demande le nom complet.

---

## 4. Donner la même grille à l'IA (quand elle corrige seule)

Quand aucun prof n'a corrigé la copie, l'IA applique la grille en base, pas la
guideline. Depuis le 28 août 2026, **les barèmes des guidelines y sont
installés** : une seule source, aucun écart entre ce que le prof coche et ce que
la machine applique.

Le script choisit la destination d'après la matière (`moteurAttendu`,
`src/lib/moteurs.ts`) — pas d'après la main qui tape la commande :

| Moteur de la matière | Destination | Lue par |
|---|---|---|
| `grille_generique` (français, philo, SES…) | `public.rubrics` | `correct-french-copy` |
| `criteres_rediges` (HGGSP) | `grilles_redigees` + `grille_criteres` + `grille_descripteurs` | `correct-copy-redigee` |
| `bareme_sujet` (maths, physique-chimie, SVT) | **refus** | — |

Le refus n'est pas une limite technique : ce que vaut la question 2b n'existe
que dans le sujet du jour, et s'écrit dans `/admin/bareme`. La guideline de ces
matières dit COMMENT compter, pas COMBIEN.

```bash
node --import tsx scripts/importer-guideline.mjs --csv <fichier.csv> \
  [--partie 1] [--bloc C] --matiere ses --exercice dissertation --version v2 \
  [--max-officiel 10] [--apply]
```

- sans `--apply` : **aperçu seulement** (critères, points, paliers, remarques,
  et ce qui serait hérité de la version précédente) ;
- avec `--apply` : écrit la grille en **brouillon**, à côté de celle qui note
  aujourd'hui. Une version verrouillée — ou simplement active — n'est jamais
  réécrite : on passe une nouvelle `--version` ;
- `--partie` garde une partie de l'épreuve (philo : dissertation OU
  explication) ; `--bloc` descend jusqu'à un bloc de cette partie (les trois
  parties de l'épreuve composée de SES vivent dans les blocs A, B et C de la
  partie II) ;
- `--url <lien du Sheet>` marche si le classeur est partagé en lecture.

**Ce que le script ne réécrit jamais** : le `system_prompt`, le principe, le
cadrage de l'épreuve et la taxonomie d'erreurs de la version précédente sont
hérités tels quels. Une guideline dit combien vaut un critère, pas comment
parler à l'élève. Les règles « ne pas faire / faire » du classeur s'ajoutent aux
garde-fous existants, sans jamais les effacer.

### Ce qui est installé (28 août 2026)

Tout en **brouillon** — les grilles qui notent aujourd'hui sont intactes.

| Grille | Critères | Barème | Remplacerait |
|---|---|---|---|
| `FRANCAIS_COMMENTAIRE_V2` | 14 | /20 | `fr_commentaire_general_v1` (5 critères) |
| `FRANCAIS_DISSERTATION_V2` | 14 | /20 | `fr_dissertation_general_v1` (5) |
| `PHILO_DISSERTATION_V2` | 14 | /20 | `PHILO_DISSERTATION_V1` (5) |
| `PHILO_EXPLICATION_TEXTE_V2` | 11 | /20 | `PHILO_EXPLICATION_V1` (5) |
| `SES_DISSERTATION_V2` | 13 | /20 | `SES_DISSERTATION_V1` (5) |
| `SES_EPREUVE_COMPOSEE_PARTIE_1_V2` | **1** | /4 | `SES_EC1_V1` (3) |
| `SES_EPREUVE_COMPOSEE_PARTIE_2_V2` | **2** | /6 | `SES_EC2_V1` (4) |
| `SES_EPREUVE_COMPOSEE_PARTIE_3_V2` | 5 | /10 | `SES_EC3_V1` (5) |
| `HGGSP_DISSERTATION_V3` | 11 | 10 → 10 | `HGGSP_DISSERTATION_V2` (20 → 10, `locked`) |
| `HGGSP_ETUDE_CRITIQUE_V3` | 9 | 10 → 10 | `HGGSP_ETUDE_CRITIQUE_V2` (20 → 10, `locked`) |

Deux réserves à lever **avant** de passer une de ces grilles en `active` :

1. **L'épreuve composée de SES y perd en finesse.** La guideline ne détaille pas
   la partie 1 (un seul critère /4 là où la grille en base en a trois) ni la
   partie 2 (deux critères /6 contre quatre). L'IA aura donc moins de prises
   pour justifier ses points sur ces deux exercices. À faire détailler dans le
   classeur, ou à garder en V1.
2. **L'HGGSP change d'échelle de travail.** Les V2 notent sur 20 puis
   convertissent en 10 ; les V3 notent directement sur 10, donc par paliers de
   0,25. Les notes ne sont pas fausses, elles sont moins fines. Les V2 restent
   `locked` et continuent de noter tant qu'on ne bascule pas.

⚠️ Et dans tous les cas : les étalons de chaque matière sont exprimés dans les
critères de l'**ancienne** grille (`PROB`, `ARG`… contre `P1.A.1`, `P1.B.2`…).
Une V2 activée ne se compare plus aux étalons existants. **À faire matière par
matière, après relecture par un prof.**

---

## 5. Les points à trancher

1. **Maths — laissé en l'état (décision du 28 août).** La guideline de
   spécialité note /20 sur six compétences et dit que les points se réajustent à
   chaque sujet ; le CRM note les maths au **barème par sujet, question par
   question** (`moteurs.ts`, décision du 16 août). Les deux coexistent
   aujourd'hui sans se contredire en pratique : **la note du prof fait foi**, et
   celle du barème du sujet est conservée en `note_ia`. Le script refuse
   d'installer une guideline `bareme_sujet` en grille du pipeline, ce qui
   trancherait la question dans un sens ou dans l'autre. À rouvrir quand un vrai
   bac blanc de maths sera corrigé.
2. **Le plancher des barèmes.** Les paliers les plus bas sont écrits en
   fourchette (« 0–0,5 ») dans presque tous les classeurs. Le prof coche une
   case, le CRM doit retenir un nombre : il retient le haut. Résultat, une copie
   cochée partout au plus bas ne peut pas descendre sous **5,25/20** en
   français, **5/20** en HGGSP, **10,75/40** en philo, **9,75/40** en SES.
   Personne n'a décidé ce plancher — c'est la mise en forme. Il est désormais
   annoncé, avec son chiffre, dans l'aperçu du script d'import (« … n'ont aucun
   palier à 0 … »). Il n'apparaît **pas** dans l'espace prof : c'est une
   information sur le classeur, à traiter une fois par Maël, pas un
   avertissement à resservir au correcteur à chaque copie. Le correctif
   appartient aux classeurs : une valeur par ligne, et un vrai palier `0`. Voir
   `GUIDE_CLASSEUR_HGGSP.md`, qui détaille le cas de l'HGGSP pour Maël.
3. **Structure de l'étude critique HGGSP** : trois lettres y chapeautent des
   sous-critères, trois autres se cochent directement, si bien que `D.` et `E.`
   se retrouvent rangés sous `C. Regard critique`. Points justes, regroupement
   faux. Détaillé dans `GUIDE_CLASSEUR_HGGSP.md`.
4. **Colonnes élèves manquantes** dans cinq classeurs sur sept (voir tableau
   § 2). Pas bloquant pendant les essais ; indispensable avant les vrais bacs
   blancs de novembre 2026.

---

## 6. Contrôles

```bash
npm run test:guideline
```

42 contrôles hors ligne, joués sur les **vrais** exports des classeurs
(`scripts/fixtures/guidelines/`) : barèmes matière par matière, découpage des
parties, colonnes d'élèves, paliers cochés, partie non traitée, prénoms
ambigus, unicité des codes de critères, plancher du barème, et non-régression
des deux anciennes mises en page.
