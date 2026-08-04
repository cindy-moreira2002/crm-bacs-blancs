# État des lieux — pipeline de correction des copies

Relevé du **3 août 2026**, fait en interrogeant directement la base du pipeline
(Supabase `xgdaibekjmtffvkwvcge`) et le dépôt `~/crm-bacs-blancs`.
Mis à jour le même jour après le chantier décrit en partie 9.

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
en bout sur 6 matières : les dernières corrections passent
(`corrected` / `corrected_review`), 1 seul `transcription_failed` en juillet.

---

## 2. Les 8 matières installées mais bloquées en `draft`

Tout est en base, rien n'est visible par les élèves.

| Matière | Grilles | Sujets | Gabarits | Étalons | Nature des étalons |
|---|---|---|---|---|---|
| SES | 4 | 36 | 4 | 180 | **synthétiques** |
| **maths** | 4 | 9 | 4 | 45 | **synthétiques** |
| physique-chimie | 4 | 7 | 4 | 35 | **synthétiques** |
| histoire-géo | 4 | 7 | 4 | 35 | **synthétiques** |
| HGGSP | 2 | 6 | 2 | 30 | **synthétiques** |
| HLP | 2 | 6 | 2 | 30 | **synthétiques** |
| SVT | 2 | 6 | 2 | 30 | **synthétiques** |
| **philosophie** | 2 | 6 | 2 | 30 | **synthétiques** |

Les grilles sont complètes (critères, `system_prompt` de 1 500 à 4 000
caractères, taxonomie d'erreurs interne de 6 à 20 codes). **Ce qui manque n'est
pas de la donnée technique : c'est la validation humaine.**

Les 415 étalons portent `origin: "synthetic_calibration_profile"` et un
`warning` « profil synthétique de calibration provisoire, à remplacer ». Ce sont
des copies inventées pour caler l'échelle de notes. Tant qu'ils ne sont pas
remplacés par de **vraies copies notées par un prof**, la note reste approximative
— c'est exactement la « calibration trop sévère » déjà constatée.

---

## 3. Les sessions vendues et leur état

| Session | Date | Dans combien de temps | État pipeline |
|---|---|---|---|
| Français | 6 sept. 2026 | 34 j | ✅ en service |
| Mathématiques | 13 sept. 2026 | 41 j | 🟠 installée le 3 août, en draft |
| Philosophie | 20 sept. 2026 | 48 j | 🟠 installée le 3 août, en draft |
| Histoire-Géo | 27 sept. 2026 | 55 j | 🟠 en draft |
| SES | 4 oct. 2026 | 62 j | 🟠 en draft |

Plus aucune session vendue n'est sans grille. Il reste à faire relire les
barèmes puis à activer, matière par matière.

(`MATIERES_ENSEIGNEES` liste aussi l'anglais côté recrutement de profs — pas de
session, pas de grille : normal pour l'instant.)

---

## 4. SQL — les deux tables manquantes sont posées ✅ (3 août)

| Fichier | Table | État |
|---|---|---|
| `supabase/sql/15_relecture_prof.sql` | `relecture_feedback` | ✅ jouée — le formulaire de relecture prof enregistre |
| `supabase/sql/19_profils_transcription.sql` | `transcription_profiles` | ✅ jouée — `maths` et `physique-chimie` en `claude-sonnet-5`, `active`, accents propres |

Le SQL 19 pose la table **et** les deux profils : `profils-transcription.mjs --apply`
n'est utile que pour modifier un profil plus tard.

Fichiers d'activation, à jouer **seulement après** validation par des profs —
ou à remplacer par `node scripts/activer-matiere.mjs <matiere> --apply --profs-ont-valide` :

- `07_activer_ses_apres_validation.sql`, `18_activer_histoire_geo.sql` (déjà là)
- `20_activer_svt.sql`, `21_activer_hggsp.sql`, `22_activer_hlp.sql`,
  `23_activer_physique-chimie.sql`, `26_activer_maths.sql`,
  `27_activer_philosophie.sql` (écrits le 3 août)

---

## 5. Code : poussé et déployé ✅ (3 août)

Tout est sur `main`, et les deux Edge Functions concernées ont été redéployées :

- `transcribe-french-copy` : lecture de `transcription_profiles` (commit `5ccf110`).
- `correct-french-copy` : correctif de la taxonomie d'erreurs (commit `8dea06e`).

Vérifié après déploiement : les deux répondent `Accès refusé.` à un appel sans
secret — accent correct, donc **aucun mojibake**, et la porte est bien fermée.

Rappel pour la prochaine fois (pas de CI, le déploiement est manuel) :

```bash
cd ~/crm-bacs-blancs && npx --yes supabase@latest functions deploy <nom> --project-ref xgdaibekjmtffvkwvcge --no-verify-jwt
```

Le `--no-verify-jwt` est obligatoire. Ne **jamais** coller le code des fonctions
dans l'éditeur du dashboard : il abîme les accents.

---

## 6. Points de fragilité restants

**a) Aucun étalon n'est `validated`.** 415 étalons en base, tous `candidate` ou
`synthetic`. Le champ existe, personne ne s'en sert : on ne peut pas distinguer
une copie de référence vraiment notée par un prof d'un profil inventé.

**b) Maths et philosophie n'ont aucune copie corrigée à montrer aux relecteurs.**
La page `/relecture/[matiere]` affiche le barème, la taxonomie **et une copie
réellement corrigée** — cette dernière n'existe que pour les matières qui ont
déjà tourné. Pour maths et philo, il faudrait lancer une correction de test, ce
qui consomme du crédit Anthropic : à décider **après** avoir posé le plafond de
dépense.

**c) La note dépend d'étalons inventés.** Vrai pour les 8 matières en draft.
C'est le seul vrai remède à la calibration trop sévère, et il n'est pas
technique : il faut 3 vraies copies notées par matière.

---

## 7. Hors code : à faire côté comptes

- **Plafond de dépense Anthropic toujours à poser** (le solde a été vidé une
  fois). Console Anthropic, pas dans le code.
- Vérifier sur Vercel que les variables sont bien posées :
  `PIPELINE_SUPABASE_URL`, `PIPELINE_SUPABASE_SERVICE_ROLE_KEY`,
  `PIPELINE_INTERNAL_SECRET`, `DEPOT_ACCESS_CODE`, `DEPOT_MAX_PAR_HEURE`,
  `DEPOT_MAX_PAR_JOUR`, `PROF_SESSION_SECRET`.

---

## 8. Ce qu'il reste à faire, dans l'ordre

**Cette semaine**
1. ~~Jouer `15_relecture_prof.sql`~~ ✅ fait le 3 août.
2. ~~Jouer `19_profils_transcription.sql`~~ ✅ fait le 3 août.
3. ~~Redéployer les deux Edge Functions~~ ✅ fait le 3 août.
4. **Poser le plafond de dépense Anthropic** — seul point restant, console
   Anthropic. Tant qu'il n'est pas posé, aucun run E2E n'est lancé.

**Dans les 10 jours — ce qui conditionne tout le reste**
5. Envoyer les liens de relecture aux profs. Ils sont déjà générés dans
   `~/LIENS_RELECTURE_PROFS.txt` (un lien par matière, à ne pas publier : le
   jeton fait office de mot de passe). Priorité : maths (13 sept.), philo
   (20 sept.), histoire-géo (27 sept.), SES (4 oct.).
6. Récupérer 3 vraies copies notées par matière pour remplacer les étalons
   synthétiques.

**À mesure que les profs répondent**
7. Activer matière par matière :
   `node scripts/activer-matiere.mjs <matiere> --apply --profs-ont-valide`
   (ou le SQL correspondant). Vérifier ensuite avec
   `node scripts/activer-matiere.mjs <matiere>`.
8. Passer en `validation_status='validated'` les étalons qu'un prof a relus.

---

## 9. Ce qui a été fait le 3 août 2026

- **Maths installée** : 4 grilles (analyse, probabilités, géométrie dans
  l'espace, QCM justifié), 9 sujets, 45 étalons, 4 gabarits. Chaque exercice est
  une épreuve autonome ramenée sur 20.
- **Philosophie installée** : 2 grilles (dissertation, explication de texte),
  6 sujets, 30 étalons, 2 gabarits. Les trois textes à expliquer sont du domaine
  public (Descartes, Pascal, Rousseau) et **doivent être vérifiés mot à mot** par
  le prof relecteur sur une édition de référence.
- **Correctif taxonomie** : la correction d'une dissertation de SES ne reçoit
  plus les codes d'erreur du français (`correct-french-copy`, commit `8dea06e`).
- **`scripts/activer-matiere.mjs`** : état réel d'une matière, génération du SQL
  d'activation, application par API derrière le drapeau `--profs-ont-valide`.
- **6 SQL d'activation** écrits (SVT, HGGSP, HLP, physique-chimie, maths, philo).
- **Collision de numérotation levée** : profils de transcription en `19_`.
- **Liens de relecture générés** pour les 9 matières dans `~/LIENS_RELECTURE_PROFS.txt`.
