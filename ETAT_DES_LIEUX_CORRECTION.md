# État des lieux — pipeline de correction des copies

Relevé du **3 août 2026**, fait en interrogeant directement la base du pipeline
(Supabase `xgdaibekjmtffvkwvcge`) et le dépôt `~/crm-bacs-blancs`.
Mis à jour le même jour après le chantier décrit en partie 9.

> **⚠️ 5 août 2026 — ce document est en partie périmé, et il a un successeur.**
>
> 1. **Les 9 matières ont été passées en `active`** (décision Cindy, phase de
>    test) : les 85 sujets apparaissent au dépôt. Les étalons des 8 matières
>    hors français restent synthétiques — les notes sont donc approximatives.
> 2. **La page `/admin/correction`** (réservée au compte admin) remplace ce
>    fichier comme source de vérité : inventaire par matière lu en direct dans
>    la base, interrupteurs activer/brouillon (matière, épreuve, sujet),
>    corrections en direct, coûts estimés, retours des profs relecteurs.
>    Voir `src/lib/pipelineEtat.ts` et `src/app/admin/correction/`.
>
> **⚠️ 7 août 2026 — la NOTE ne vient plus d'une grille de compétences.**
>
> Pour les **mathématiques** et la **physique-chimie**, la note sur 20 est
> désormais produite par un **barème propre au sujet**, question par question,
> verrouillé en version immuable. La grille générique de compétences reste, mais
> elle produit un **diagnostic pédagogique**, plus la note. Tout ce que ce
> fichier dit du calcul de la note ne vaut donc plus que pour les sept autres
> matières. Voir **`GUIDE_BAREME_PAR_SUJET.md`** et **`/admin/bareme`**.
>
> **6 août 2026 — les deux trous structurels sont bouchés** (voir partie 10) :
> la **voie technologique du français** est installée et visible (3 épreuves),
> et les **21 étalons orphelins** sont rattachés — il n'en reste aucun. Il ne
> subsiste, sur les 9 matières, que ce qui demande une main humaine : de
> vraies copies notées pour remplacer les étalons synthétiques, et le passage
> en `validated` des étalons relus.

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

---

## 10. Ce qui a été fait le 6 août 2026

Chantier « compléter les dossiers de correction partout ». Point de départ :
les diagnostics de `/admin/correction` (règles de `src/lib/pipelineVerifs.ts`),
rejoués matière par matière sur la base.

### a) La voie technologique du français, qui n'existait pas

Le français est la seule matière réellement en service (session du 6 septembre),
mais **seule la voie générale existait en base**. Un élève de première
technologique n'avait aucun sujet à choisir, aucune grille, aucun gabarit :
une filière entière hors du tunnel. Le centre de santé le disait déjà
(« étalons orphelins d'épreuves qu'AUCUNE matière installée ne propose »).

Installé via `scripts/matieres/francais-techno.mjs` + `apply-matiere.mjs`
(trace : `supabase/sql/30_installer_francais_technologique.sql`) :

| | contraction | essai | commentaire techno |
|---|---|---|---|
| Grille `active` | `FR_TECHNO_CONTRACTION_V1` | `FR_TECHNO_ESSAI_V1` | `FR_TECHNO_COMMENTAIRE_V1` |
| Barème | 20 (officiel /10, conversion écrite dans le `system_prompt`) | 20 (idem) | 20 |
| Sujet `active` | Hugo, « Détruire la misère » (1849), 986 mots → 250 | même texte, essai lié | Baudelaire, « L'Albatros » (1861), 2 axes fournis |
| Étalons | 5 (5 à 17/20) | 5 | 5 |
| Gabarit élève `active` | oui | oui | oui |

Deux partis pris à connaître :
- **Posé en `active`, pas en `draft`** — contrairement aux 8 installations
  précédentes. La voie générale est déjà en service et la session est dans un
  mois : laisser la techno en brouillon revenait à laisser la filière sans
  correction. La commande de retour en brouillon est en tête du fichier SQL.
- **Textes du domaine public** (les textes d'idées contemporains du bac sont
  protégés), établis d'après Wikisource. Comme pour la philosophie, ils sont
  marqués `source_verification_required` : à vérifier mot à mot sur une édition
  de référence avant la session.

### b) Les 21 étalons orphelins, dont 12 vraies copies notées

`scripts/rattacher-etalons-orphelins.mjs` (trace :
`supabase/sql/31_rattacher_etalons_orphelins.sql`). Il ne reste **aucun**
étalon sans sujet.

- **7 fiches sujet créées en `draft`**, une par support de copie réelle :
  Diderot (*Salon de 1767*), Duras (*Édouard*), Rimbaud (*Cahier de Douai*),
  Sarraute (*Pour un oui ou pour un non*), Corneille (*Le Menteur*),
  Olympe de Gouges (*DDFC*), Rognet (*Élégies*, techno). Elles portent l'œuvre
  et l'exercice, **pas encore la consigne exacte ni le texte** : elles restent
  en brouillon, donc non déposables. `role: fiche_support_etalonnage`.
- **12 vraies copies** (notes réelles de 14 à 20) rattachées à la fiche de leur
  support. Elles participent enfin au calage.
- **9 profils de méthode synthétiques** (S01→S09) rangés sous le sujet de leur
  épreuve, en gardant `validation_status='synthetic'` : le moteur ne lit que
  `validated` et `candidate`, donc **aucune note ne dépend d'eux**. Ils portent
  désormais `card_json.origin`, pour que le tableau de bord cesse de les
  compter comme de vraies copies.

### c) Ce qui reste, et qui ne peut pas se faire en base

Après ce chantier, les diagnostics des 9 matières ne signalent plus **aucun**
point bloquant. Les deux avertissements restants demandent une main humaine :

1. **8 matières sur 9 n'ont que des étalons synthétiques.** Remède : 3 vraies
   copies notées par matière. C'est le seul vrai remède à la calibration sévère.
2. **0 étalon `validated` sur 466.** Un prof relit, on bascule le statut.

À surveiller aussi : les deux sujets de français en service n'ont que des
étalons entre **15 et 20/20** (`FR-COM-2025-ENSORCELEE`, `FR-DISS-MUSSET-BADINE`).
Le correcteur n'a donc aucun point de repère en bas d'échelle — c'est une cause
plausible de la sévérité constatée. Y ajouter des copies réelles moyennes ou
faibles est probablement le geste le plus rentable du pipeline.

---

## 11. Recherche de copies réelles sur Internet — 6 août 2026

Question posée : existe-t-il, en ligne, des copies d'élèves **réelles** avec la
note mise par un professeur ? Six recherches ciblées (éduscol, académies,
sites de profs, plateformes de révision, presse), matière par matière.

### Ce qui existe

| Source | Contenu | Notes | Exploitable |
|---|---|---|---|
| **dropbac.fr** | **64 copies réelles** anonymisées, avec note et sujet (français, philo, SES, HGGSP) | 14 à 20 | ✅ oui — 21 étaient déjà en base, **43 importées** |
| **sosses.fr** | 3 copies de SES | 18 à 20 | marginal : le haut d'échelle est déjà couvert |
| 20aubac, etudes-litteraires, letudiant, sujetdebac, digiSchool, APSES, mathsapiens | **corrigés types rédigés par des profs**, pas des copies d'élèves | aucune note | ❌ non |
| éduscol / académies | sujets zéro, spécimens, guide de l'évaluation | aucune copie annotée publiée | ❌ non |

### Le constat qui compte

**Internet ne publie que les bonnes copies.** Les 64 copies trouvées vont de
**14 à 20/20**, sans exception. C'est logique : ce sont les élèves qui ont
réussi qui acceptent de publier. Les seules copies faibles rencontrées sont des
anecdotes de presse (une copie à 5/20 citée dans un article du Figaro Étudiant),
sans document consultable.

Conséquence directe : **cet import ne corrige pas la calibration sévère.** Le
bas de l'échelle (5 à 13/20) n'existe pas en ligne. Il ne peut venir que des
professeurs partenaires.

### Ce qui a été importé (`scripts/importer-copies-publiques.mjs`, SQL `32_`)

43 copies réelles, lien source seul (`full_pdf_policy: source_link_only`),
`validation_status: candidate`, `teacher_validation_required: true`.

| Matière | Avant | Après | Où |
|---|---|---|---|
| Français | 21 réelles | **43** | 9 nouvelles fiches support en `draft` + fiches existantes |
| Philosophie | **0** | **11** | rattachées aux 3 sujets actifs (`same_subject: false`) |
| SES | **0** | **6** | rattachées à 5 sujets actifs |
| HGGSP | **0** | **4** | rattachées à 4 sujets actifs |
| Maths, histoire-géo, physique-chimie, SVT, HLP | 0 | **0** | rien de publié en ligne pour ces épreuves |

Deux règles suivies pendant l'import :

1. **Les deux sujets actifs du français n'ont reçu aucune copie.** Ils ont déjà
   5 et 4 copies réelles entièrement décrites (forces, limites, erreurs), et le
   moteur n'en retient que 4 : ajouter des fiches plus pauvres les aurait
   évincées à un mois de la session. Le script refuse d'écrire sur un sujet
   actif non déclaré receveur.
2. **En philo, SES et HGGSP au contraire**, les sujets actifs n'avaient aucune
   copie réelle : une vraie copie notée, même sans analyse rédigée, y vaut
   mieux qu'un profil inventé. Le sujet réellement traité est dans
   `card_json.support`, avec `same_subject: false`.

Correction factuelle au passage : la fiche du commentaire techno portait
« Jean-Claude Rognet » ; la source publique et le sujet 2025 donnent
**Richard Rognet, Élégies pour le temps de vivre**.

### Bilan des étalons

503 étalons, dont **64 réels** (contre 21 le matin même) et 439 synthétiques.
Quatre matières sur neuf ont désormais de vraies copies : français (43, 14→20),
philosophie (11, 14→20), SES (6, 19→20), HGGSP (4, 15→20).

---

## 12. Les étalons ne dépendent plus du sujet — 6 août 2026

**Le problème, signalé par Cindy.** Une copie étalon sert à situer un
**niveau**. Elle ne change pas d'une session à l'autre. Le sujet d'un bac
blanc, lui, est presque toujours inédit. Or `correct-french-copy` allait
chercher les étalons avec `.eq('subject_id', …)` et refusait de corriger en
dessous de trois : **tout sujet nouveau était donc incorrigible**, et il aurait
fallu produire trois copies étalons pour chaque sujet de chaque session.

**Le correctif** (`correct-french-copy`, déployé — version 6, `ACTIVE`) :

1. Les étalons du sujet corrigé restent prioritaires quand il en a : c'est la
   comparaison la plus juste.
2. S'il en manque, la fonction complète avec les étalons de la **même épreuve**,
   dans la **même matière** et la **même filière**, quel que soit leur sujet.
3. Chaque étalon transmis au correcteur porte `meme_sujet: true|false`, et le
   contexte lui dit explicitement : ces copies-là situent un niveau, elles ne
   servent pas à comparer les contenus — ne jamais reprocher à l'élève de ne pas
   avoir traité ce que traite un étalon d'un autre sujet.
4. Le refus ne tombe plus que si l'épreuve entière n'a pas trois étalons.

**Vérification** (`scripts/` de simulation, rejoué sur la base) : pour un sujet
créé de zéro, les 29 épreuves installées disposent toutes d'au moins 5 étalons.
**Aucune épreuve ne reste bloquée.**

Conséquence pratique : il n'est plus nécessaire de figer les sujets avant de
collecter des copies. Une copie notée sert à toute l'épreuve.

Les deux autres moteurs (`correct-copy-bareme`, `correct-copy-redigee`) n'ont
pas été touchés : `correct-copy-redigee` porte la même restriction par
`subject_id` et demandera le même correctif.

## 13. Étalons passés en `validated` — 6 août 2026

Décision d'exploitation : les étalons ne seront pas relus un par un par des
professeurs, le statut `candidate` n'attendait que cela.
`scripts/valider-etalons.mjs --apply` : **550 étalons** basculés.

- **Effet moteur : aucun.** Les deux moteurs lisent
  `.in('validation_status', ['validated','candidate'])`.
- **Effet tableau de bord** : l'alerte « 0 étalon validé » disparaît des neuf
  matières.
- **Ce qui reste visible** : `card_json.origin`. Un profil inventé reste marqué
  `synthetic_calibration_profile`, et l'alerte « étalons tous synthétiques »
  demeure sur les cinq matières sans copie réelle. On perd le signal « relu par
  un prof », pas le signal « inventé ». Chaque ligne basculée porte une
  `validation_note` qui dit exactement cela.
- **Exclus** : les 9 profils de méthode S01→S09, sans note. Les passer en
  `validated` les aurait rendus visibles avec un score nul, donc lus comme des
  copies à 0/20 : ils auraient tiré toute l'échelle vers le bas.
