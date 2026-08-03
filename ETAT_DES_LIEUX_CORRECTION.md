# État des lieux — pipeline de correction des copies

Relevé du **3 août 2026**, fait en interrogeant directement la base du pipeline
(Supabase `xgdaibekjmtffvkwvcge`) et le dépôt `~/crm-bacs-blancs`.
Rien n'a été modifié : lecture seule.

---

## 1. Ce qui fonctionne vraiment aujourd'hui

**Une seule matière est en service : le français.**

| | français |
|---|---|
| Grilles `active` | commentaire, dissertation |
| Sujets `active` | `FR-COM-2025-ENSORCELEE`, `FR-DISS-MUSSET-BADINE` |
| Gabarits de dossier `active` | 2 |
| Étalons (copies de référence) | 9 réels, dont **0 validé par un prof** (tous en `candidate`) |

Conséquence concrète : dans « Déposer une copie », le menu ne propose **que** les
deux sujets de français — l'API `/api/pipeline/sujets` ne liste que
`status='active'`. Et `generate-dossier` refuse de produire le dossier élève
pour toute matière dont le gabarit n'est pas `active`.

La chaîne technique (transcription → correction → dossier) est prouvée de bout
en bout sur 6 matières : les 15 dernières corrections passent
(`corrected` / `corrected_review`), 1 seul `transcription_failed` en juillet.

---

## 2. Les 6 matières installées mais bloquées en `draft`

Tout est en base, rien n'est visible par les élèves.

| Matière | Grilles | Sujets | Gabarits | Étalons | Nature des étalons |
|---|---|---|---|---|---|
| SES | 4 (draft) | 36 (draft) | 4 (draft) | 180 | **synthétiques** |
| physique-chimie | 4 (draft) | 7 (draft) | 4 (draft) | 35 | **synthétiques** |
| histoire-géo | 4 (draft) | 7 (draft) | 4 (draft) | 35 | **synthétiques** |
| HGGSP | 2 (draft) | 6 (draft) | 2 (draft) | 30 | **synthétiques** |
| HLP | 2 (draft) | 6 (draft) | 2 (draft) | 30 | **synthétiques** |
| SVT | 2 (draft) | 6 (draft) | 2 (draft) | 30 | **synthétiques** |

Les grilles sont complètes (critères, `system_prompt` de 1 500 à 4 000
caractères, taxonomie d'erreurs interne de 6 à 20 codes). **Ce qui manque n'est
pas de la donnée technique : c'est la validation humaine.**

Les 340 étalons portent `origin: "synthetic_calibration_profile"` et le
`warning` « profil synthétique de calibration provisoire, à remplacer ». Ce sont
des copies inventées pour caler l'échelle de notes. Tant qu'ils ne sont pas
remplacés par de **vraies copies notées par un prof**, la note reste approximative
— c'est exactement la « calibration trop sévère » déjà constatée.

---

## 3. Matières VENDUES mais totalement absentes du pipeline ⚠️

`src/lib/sessions.ts` ouvre 5 sessions à l'inscription. Deux n'ont **aucune**
grille, aucun sujet, aucun gabarit en base :

| Session | Date | Dans combien de temps | État pipeline |
|---|---|---|---|
| Français | 6 sept. 2026 | 34 j | ✅ prêt |
| **Mathématiques** | 13 sept. 2026 | 41 j | ❌ **rien du tout** |
| **Philosophie** | 20 sept. 2026 | 48 j | ❌ **rien du tout** |
| Histoire-Géo | 27 sept. 2026 | 55 j | 🟠 en draft |
| SES | 4 oct. 2026 | 62 j | 🟠 en draft |

Maths et philo sont le trou le plus urgent : un élève peut s'inscrire
aujourd'hui à un bac blanc dont la copie ne pourra pas être corrigée
automatiquement.

(`MATIERES_ENSEIGNEES` liste aussi l'anglais côté recrutement de profs — pas de
session, pas de grille : normal pour l'instant.)

---

## 4. SQL à jouer dans Supabase (rien n'est joué)

Deux tables sont **absentes de la base** alors que le code qui les lit est écrit :

| Fichier | Table | Conséquence aujourd'hui |
|---|---|---|
| `supabase/sql/15_relecture_prof.sql` | `relecture_feedback` | La page `/relecture/[matiere]` s'affiche, mais **l'envoi du formulaire échoue** : un prof ne peut pas rendre son avis. |
| `supabase/sql/19_profils_transcription.sql` | `transcription_profiles` | Les copies scientifiques (physique-chimie, maths) sont transcrites avec le modèle économique et les consignes génériques : un exposant ou une unité mal lu fausse la note sans que rien ne le signale. |

Scripts d'activation à jouer **après** validation des profs :

- `supabase/sql/07_activer_ses_apres_validation.sql` — non joué (SES en draft)
- `supabase/sql/18_activer_histoire_geo.sql` — non joué (dit lui-même « ce fichier n'a PAS été joué »)
- **Aucun fichier d'activation n'existe pour SVT, HGGSP, HLP, physique-chimie** — à écrire (5 lignes de `update … set status='active'` par matière).

⚠️ Collision de numérotation : deux fichiers `18_` différents
(`18_activer_histoire_geo.sql` et `19_profils_transcription.sql`).

---

## 5. Code écrit mais pas en production

- **1 commit non poussé** : `5ccf110 feat(pipeline): transcription scientifique par matière`.
- **Les Edge Functions ne se déploient pas toutes seules** — pas de CI, pas de
  GitHub Action. `transcribe-french-copy` doit être **redéployée à la main**
  pour que la lecture de `transcription_profiles` existe en prod.
- Fichier non versionné : `PROMPT_CHATGPT_NOUVELLE_MATIERE.md`.

---

## 6. Deux points de fragilité repérés

**a) Taxonomie d'erreurs du français injectée dans les corrections de SES.**
`correct-french-copy` (ligne 445) interroge `error_taxonomy` par
`exercise_type` seul — or cette table n'a pas de colonne `matiere` et ne
contient que du français. SES utilise le même nom d'épreuve `dissertation` que
le français : la correction d'une dissertation de SES reçoit donc les 8 codes
d'erreur de français. Les autres matières échappent au problème seulement parce
que leurs `exercise_type` sont préfixés (`hggsp_dissertation`, `svt_exercice_1`…).
La page de relecture, elle, a déjà été corrigée pour ça (`src/lib/relecture.ts:126`) ;
la fonction de correction non.

**b) Aucun étalon n'est `validated`.** 370 étalons en base, tous en `candidate`
ou `synthetic`. Le champ existe, personne ne s'en sert : on ne peut pas
distinguer une copie de référence vraiment notée par un prof d'un profil inventé.

---

## 7. Hors code : à faire côté comptes

- **Plafond de dépense Anthropic toujours à poser** (le solde a été vidé une
  fois). À faire dans la console Anthropic, pas dans le code.
- Vérifier sur Vercel que les variables du dépôt sont bien posées :
  `PIPELINE_SUPABASE_URL`, `PIPELINE_SUPABASE_SERVICE_ROLE_KEY`,
  `PIPELINE_INTERNAL_SECRET`, `DEPOT_ACCESS_CODE`, `DEPOT_MAX_PAR_HEURE`,
  `DEPOT_MAX_PAR_JOUR`, `PROF_SESSION_SECRET`.

---

## 8. Ordre de marche conseillé

**Cette semaine**
1. Jouer `15_relecture_prof.sql` (sans ça, aucun prof ne peut répondre).
2. Jouer `19_profils_transcription.sql`, puis `node scripts/profils-transcription.mjs --apply`.
3. Pousser `5ccf110` et **redéployer** `transcribe-french-copy`.
4. Poser le plafond de dépense Anthropic.

**Dans les 10 jours — ce qui conditionne tout le reste**
5. Envoyer les liens de relecture aux profs, matière par matière :
   `node scripts/lien-relecture.mjs ses` (idem `histoire-geo`, `svt`, `hggsp`, `hlp`, `physique-chimie`).
   Priorité : histoire-géo (session 27 sept.) puis SES (4 oct.).
6. Récupérer 3 vraies copies notées par matière pour remplacer les étalons
   synthétiques — c'est le seul vrai remède à la calibration trop sévère.

**Avant le 13 septembre**
7. Créer **maths** et **philosophie** dans le pipeline (données uniquement,
   via `PROMPT_CHATGPT_NOUVELLE_MATIERE.md` + `scripts/apply-matiere.mjs`),
   ou retirer ces deux sessions de l'inscription.

**Au fil de l'eau**
8. Écrire les SQL d'activation manquants (SVT, HGGSP, HLP, physique-chimie).
9. Corriger la requête `error_taxonomy` de `correct-french-copy`.
10. Faire passer les étalons relus par un prof en `validation_status='validated'`.
