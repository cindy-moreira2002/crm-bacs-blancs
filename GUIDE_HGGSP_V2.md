# HGGSP session 2026 — correction analytique des épreuves rédigées

Tout ce qu'il faut pour faire tourner, relire, valider et faire évoluer le
nouveau système de correction d'HGGSP. Écrit le 7 août 2026, après la mise en
place complète (base, moteur, page de relecture, tests).

---

## 1. Ce qui a changé, en une page

| | Avant | Maintenant |
|---|---|---|
| Structure de l'épreuve | une note sur 20 par exercice, sans lien avec le BO | dissertation **/10** + étude critique **/10** = **/20** (note de service MENE2521923N) |
| Échelle de travail | 20 points, sans conversion | 20 points **analytiques internes**, convertis automatiquement en /10 |
| Grilles | 2 grilles proches, même squelette | 2 grilles **réellement distinctes** (5 critères / 6 critères, un seul commun) |
| Prélèvement en étude critique | noyé dans « critique du document » (6 pts) | **critère à lui seul** (3 pts) — un prélèvement exact est payé même sans critique |
| Erreurs types | 20 codes, une gravité, dupliqués sur les 2 exercices | **43 codes** en 3 ensembles (transversal / dissertation / étude critique), chacun avec sa **règle d'impact** et sa **règle de non-double-sanction** |
| Effet d'une erreur | implicite | 6 types explicites, dont **2 seulement** agissent sur la note (plafond de score, plafond de niveau) |
| Versionnement | aucun | statut + verrouillage en base, une modification crée une nouvelle version |
| Contrôles | somme des critères | somme, conversion, pas de 0,25, double sanction, citations réellement présentes, cohérence appréciation/scores |
| Relecture humaine | 2 déclencheurs | **12 déclencheurs**, chacun tracé dans `relectures_humaines` |

Rien n'a été supprimé : les grilles v1, les gabarits v1 et les corrections déjà
enregistrées sont conservés et marqués `archived` / `moteur = grille_generique`.

---

## 2. Où vit quoi

| Élément | Emplacement |
|---|---|
| **Toutes les règles** (grilles, descripteurs, taxonomie, impacts, contrôles) | `supabase/functions/_shared/hggsp-noyau.ts` — fichier pur, sans réseau |
| Ré-export pour l'application Next.js | `src/lib/hggspNoyau.ts` |
| Moteur de correction (Edge Function) | `supabase/functions/correct-copy-redigee/index.ts` |
| Structure de la base | `supabase/sql/40_hggsp_redige_v2.sql` |
| Données (grilles, taxonomie, étalons…) | `supabase/sql/41_hggsp_donnees_v2.sql`, généré par `scripts/apply-hggsp.mjs` |
| Chargement du dossier de relecture | `src/lib/relectureHggsp.ts` |
| Page de relecture professeur | `src/app/relecture/[matiere]/page.tsx` + `src/components/DossierRelectureHggsp.tsx` |
| Questions posées au professeur | `src/components/FormulaireRelecture.tsx` (jeu `redige`) |
| Tests hors ligne | `scripts/test-hggsp.mjs` — `npm run test:hggsp` |
| Vérification de la base | `scripts/verifier-hggsp-base.mjs` — `npm run hggsp:verifier` |
| Dépôt d'un bac blanc complet | `src/components/DepotCopiePipeline.tsx` + `/api/pipeline/sujets`, `/api/pipeline/deposer`, `/api/pipeline/groupe/[id]` |
| Pilotage (3ᵉ couche) | `src/lib/pipelineEtat.ts` → `/admin/correction` |

**Le noyau fait foi.** Le script d'installation écrit en base exactement ce
qu'il contient, et la consigne système remise au correcteur est *construite* à
partir de la grille : il est impossible que le prompt décrive un barème
différent de celui qui sera appliqué au résultat.

---

## 3. Créer un bac blanc HGGSP

### 3.1 Un entraînement à un seul exercice (le cas courant aujourd'hui)

Rien à faire de particulier : déposer la copie sur un sujet HGGSP existant. Le
format est déduit de l'exercice (`dissertation_only` ou `document_study_only`)
et l'élève voit sa note d'entraînement sur 20 **et** son équivalent sur 10.

### 3.2 Un bac blanc complet (dissertation + étude critique)

**Depuis l'écran « Déposer une copie »** (le cas normal) : le bac blanc complet
apparaît en haut du menu déroulant, dans son propre groupe. Le formulaire
demande alors **une copie par exercice**, les envoie sous un même
`groupe_copie_id` généré automatiquement, suit les deux corrections côte à côte
et affiche la note du bac blanc — la somme des notes officielles, lue dans
`v_notes_examen_redige`. Rien à écrire à la main.

Trois refus volontaires côté serveur, parce qu'ils produiraient une note fausse
sans prévenir : déposer un sujet qui n'appartient pas à l'examen annoncé,
déposer deux fois le même exercice pour un élève, et proposer au dépôt un bac
blanc dont un exercice n'a pas de sujet visible (il serait noté sur une moitié
d'épreuve).

**Créer une nouvelle session** (le SQL reste nécessaire — l'examen et ses
exercices ne se créent pas depuis l'application) :

1. Créer l'examen et ses deux exercices (déjà fait pour
   `HGGSP_BAC_BLANC_2026_01`, à dupliquer pour une nouvelle session) :

```sql
insert into public.exams (code, matiere, track, titre, session, exam_format, statut)
values ('HGGSP_BAC_BLANC_2026_02', 'hggsp', 'generale',
        'HGGSP - bac blanc complet', '2026', 'full_exam', 'calibrating');

insert into public.exam_exercices (exam_id, exercise_type, grille_id, subject_id, ordre)
select id, 'hggsp_dissertation', 'HGGSP_DISSERTATION_V2', 'HGGSP2027_DISS_01', 1
from public.exams where code = 'HGGSP_BAC_BLANC_2026_02'
union all
select id, 'hggsp_etude_critique', 'HGGSP_ETUDE_CRITIQUE_V2', 'HGGSP2027_EC_01', 2
from public.exams where code = 'HGGSP_BAC_BLANC_2026_02';
```

2. Déposer les **deux** copies du même élève depuis l'écran de dépôt. (Si on
   passe par l'API à la main : `exam_id` = l'examen ci-dessus, `exam_format =
   'full_exam'`, et **le même `groupe_copie_id`** sur les deux.)

3. La note finale se lit alors dans la vue :

```sql
select * from public.v_notes_examen_redige where groupe_copie_id = '<uuid>';
```

Elle vaut **la somme des deux notes officielles sur 10**. Deux notes sur 20 ne
sont jamais additionnées — ni par le moteur, ni par la vue, ni par le dossier
élève.

### 3.3 Ajouter un sujet

Un sujet = une ligne dans `subject_cards`. Pour une étude critique à **deux
documents**, mettre `card_json.documents` (2 entrées) et
`card_json.nombre_documents = 2` : le moteur ajoute alors de lui-même les règles
de confrontation (§7 du cahier des charges) à la consigne du correcteur.
`HGGSP2027_EC_04` sert de modèle.

---

## 4. Importer des copies étalons

Les 56 étalons actuels sont des **profils de calibration synthétiques** : des
repères inventés pour caler l'échelle, pas de vraies copies. Ils portent
`origin: synthetic_calibration_profile_v2` et un avertissement. Tant qu'ils ne
sont pas remplacés, la note reste approximative — c'est dit sur la page de
relecture, en clair.

Pour importer une **vraie** copie étalon :

1. Créer la copie étalon (une ligne par copie) :

```sql
insert into public.etalon_copies (libelle, niveau_cible, frontiere, grille_id, exercise_type, matiere, statut)
values ('Copie Léa — étude critique Arctique', 'moyen', false,
        'HGGSP_ETUDE_CRITIQUE_V2', 'hggsp_etude_critique', 'hggsp', 'importee');
```

2. Enregistrer la correction **de chaque professeur**, séparément :

```sql
insert into public.etalon_corrections_humaines
  (etalon_copie_id, grille_id, prof_nom, prof_email, note_totale, score_analytique, score_officiel, commentaire)
values ('<uuid etalon>', 'HGGSP_ETUDE_CRITIQUE_V2', 'Mme X', 'x@…', 11.5, 11.5, 5.75, '…');

insert into public.etalon_correction_humaine_criteres (correction_humaine_id, critere_code, points, justification)
values ('<uuid correction humaine>', 'PRELEVEMENT', 2.25, '…'),
       ('<uuid correction humaine>', 'ANALYSE_CRITIQUE', 2.5, '…');
```

Deux professeurs qui corrigent la même copie donnent **deux lignes** : moyenne,
médiane et amplitude sont calculées à la lecture, et l'amplitude est affichée.
Quand deux correcteurs divergent de plus de 2 points, la « vérité » humaine
n'est pas présentée comme objective.

3. Faire corriger la même copie par le système (dépôt normal), puis rattacher :

```sql
update public.etalon_copies set correction_id = '<uuid correction>', statut = 'corrigee_ia'
where id = '<uuid etalon>';
```

4. La comparaison alimente la page de relecture (onglet 6) et le tableau de
   calibration.

---

## 5. Valider puis verrouiller une grille

Les statuts, dans l'ordre : `draft` → `calibrating` → `ready_for_validation` →
`validated` → `locked` → `in_use` → `archived`.
Aujourd'hui, les deux grilles v2 sont en **`calibrating`**.

```sql
-- 1. Vérifier : total, descripteurs, codes de taxonomie, consigne
select public.grille_verifier('HGGSP_ETUDE_CRITIQUE_V2');

-- 2. Consigner la validation d'un professeur
update public.grilles_redigees
set statut = 'validated', valide_par = 'Mme X (lycée …)', valide_le = now()
where id = 'HGGSP_ETUDE_CRITIQUE_V2';

-- 3. Verrouiller (refuse si un contrôle bloque)
select public.grille_verrouiller('HGGSP_ETUDE_CRITIQUE_V2', 'Cindy');

-- 4. Ouvrir les corrections
update public.grilles_redigees set statut = 'in_use' where id = 'HGGSP_ETUDE_CRITIQUE_V2';
```

Une fois verrouillée, la base **refuse** toute modification de la grille, de ses
critères et de ses descripteurs. Pour la faire évoluer :

```sql
-- Crée HGGSP_ETUDE_CRITIQUE_V2_1 en 'draft', avec une copie de tous les critères
select public.grille_nouvelle_version('HGGSP_ETUDE_CRITIQUE_V2', '2.1', 'Cindy');

-- Quelles copies ont été corrigées avec l'ancienne version ?
select * from public.grille_copies_concernees('HGGSP_ETUDE_CRITIQUE_V2');
```

Les corrections déjà faites **gardent leur version** et ne sont jamais écrasées.
Relancer une copie avec une nouvelle version est une décision explicite :
déposer une nouvelle correction, jamais modifier l'ancienne.

Tant que la grille n'est pas verrouillée, chaque correction porte
`calibration_metadata.note_provisoire = true` : la note est affichée **en
fourchette** à l'élève et doit être validée par un professeur.

---

## 6. Traiter une relecture humaine

Douze situations déclenchent une relecture (transcription incertaine, passage
illisible, contresens soupçonné, référence douteuse, plan original non prévu,
copie presque hors sujet, production graphique non interprétable, erreur majeure
touchant plusieurs critères, contradiction entre scores et appréciation, écart
fort aux étalons, confiance insuffisante, citation introuvable dans la copie).

La correction passe alors en `corrected_review` et chaque motif devient une
ligne ouvrable :

```sql
select r.code_motif, r.motif, r.question_key as critere, c.student_name
from public.relectures_humaines r
join public.corrections c on c.id = r.correction_id
where r.statut = 'ouverte' and c.matiere = 'hggsp'
order by r.cree_le desc;
```

Après examen humain :

```sql
update public.relectures_humaines
set statut = 'traitee', traite_par = 'Cindy', traite_le = now(),
    decision = '{"verdict": "note confirmée"}'::jsonb
where id = '<uuid>';

-- Si la note change, c'est un humain qui l'écrit — le calcul ne l'écrasera plus.
update public.corrections
set score_validated = 12.5, validee_par = 'Mme X', validee_le = now()
where id = '<uuid correction>';
```

**Un doute de transcription n'est jamais une erreur de l'élève** : le moteur ne
retire aucun point sur ce motif, il demande une vérification.

---

## 6 bis. Vérifier que la base dit bien ce que le code dit

```bash
npm run hggsp:verifier
```

Strictement en lecture, rejouable en production. Il compare la base au **noyau**,
qui fait foi, et s'arrête en rouge si l'un des deux a dérivé de l'autre.

Ce qu'il contrôle, dans l'ordre : les 11 tables de la couche rédigée ; les deux
grilles (échelles, critères, somme des critères = échelle, nombre de
descripteurs) ; **la consigne système stockée, caractère par caractère, contre
celle que le noyau construit** — c'est le contrôle qui compte, puisqu'une
consigne qui a dérivé ferait appliquer un barème que le code ne décrit plus ; la
taxonomie des 43 codes et sa répartition par portée ; le routage (une seule
grille active par exercice, moteur `criteres_rediges`, v1 archivée) ; l'état réel
de la calibration ; le bac blanc complet et ses exercices ; les relectures en
attente.

Il distingue trois niveaux : ✓ conforme, ✗ problème (sortie en code 1), et
· remarque — un fait à savoir qui ne fait pas échouer le script (grille non
verrouillée, étalons synthétiques, chemin jamais emprunté).

Ce que le pilotage `/admin/correction` en montre : le bandeau
« 📝 Les épreuves rédigées » donne les mêmes chiffres en continu — grilles,
verrouillages, copies notées, **étalons corrigés par un prof sur le total**, et
relectures en attente. HGGSP y porte la pastille « note : grille rédigée » et,
tant que les grilles ne sont pas verrouillées, « notes provisoires ».

---

## 7. Faire relire par un professeur

Le lien (à ne pas publier — le jeton fait office de mot de passe) :

```bash
node scripts/lien-relecture.mjs hggsp
```

La page présente, en onglets : l'épreuve officielle et les deux échelles, la
grille de dissertation, celle d'étude critique, les deux côte à côte, les
43 erreurs types filtrables (par exercice, par type d'impact, par critère
affecté, par mot-clé), les copies étalons avec l'état réel de la calibration, et
une copie réellement corrigée avec le détail des plafonds appliqués.

Les réponses arrivent dans `relecture_feedback` :

```sql
select prof_nom, etablissement, reponses, cree_le
from public.relecture_feedback where matiere = 'hggsp' order by cree_le desc;
```

---

## 8. Modifier une règle

1. Modifier `supabase/functions/_shared/hggsp-noyau.ts` (grille, descripteur,
   code d'erreur, règle d'impact).
2. `npm run test:hggsp` — 49 tests, dont la conversion /20 → /10, la
   non-double-sanction, les plafonds et les contrôles de cohérence.
3. `node scripts/apply-hggsp.mjs --check` puis `--apply --sql supabase/sql/41_hggsp_donnees_v2.sql`.
   ⚠️ Si la grille visée est verrouillée, la base refusera : créer d'abord une
   nouvelle version.
4. Redéployer le moteur :

```bash
node scripts/deployer-edge.mjs correct-copy-redigee supabase/functions/_shared/hggsp-noyau.ts
```

---

## 9. Pièges rencontrés (et déjà réglés)

- **La CLI `supabase functions deploy` reste bloquée sans rien afficher** sur ce
  poste. `scripts/deployer-edge.mjs` fait la même chose par l'API Management et
  répond en quelques secondes.
- **`WORKER_RESOURCE_LIMIT` (HTTP 546)** : la réflexion adaptative est active
  par défaut sur `claude-sonnet-5` et consommait tout le budget de sortie avant
  d'écrire la correction. Le moteur envoie donc `thinking: disabled` +
  `effort: medium`, et ne répète pas la grille dans le dossier stable (elle est
  déjà dans la consigne système). Une correction prend ~45 s.
- **Une seule grille active par (track, matière, exercice)** : la v1 doit être
  archivée **avant** d'insérer la v2, sinon la base refuse l'insertion.
- **`corrections_coherence_moteur`** : une copie rédigée doit porter
  `subject_id`, `rubric_id` **et** `grille_id`, sinon l'insertion est rejetée.
  Le trigger `correction_moteur_depuis_grille` les pose tout seul depuis la
  grille de dépôt.
- **L'éditeur SQL de Supabase abîme les accents** collés depuis un Mac : tout le
  SQL généré est en ASCII pur, les textes accentués passent par
  `convert_from(decode(…,'hex'),'UTF8')`.

---

## 10. Ce qui reste à faire

### Ce que le logiciel ne peut pas faire à ta place

1. **Remplacer les 56 étalons synthétiques** par de vraies copies notées (au
   moins 3 par sujet, dont une copie frontière autour de 9–10 et 11–12), et
   saisir la correction humaine de chacune (§4). C'est le seul vrai remède à une
   calibration trop sévère ou trop généreuse — `npm run hggsp:verifier` reste en
   rouge tant que ce n'est pas fait, volontairement.
2. **Faire relire les grilles** par des professeurs d'HGGSP (§7), puis valider et
   verrouiller (§5). Tant qu'elles sont en `calibrating`, chaque note est
   provisoire, et la page de pilotage le dit.
3. **Poser le plafond de dépense Anthropic** (console Anthropic, pas dans le
   code) — le solde a déjà été vidé une fois.

### Fait le 14 août 2026

4. ~~Déployer la page de relecture~~ — poussée avec le reste du chantier v2.
5. ~~Le cas bac blanc complet n'a jamais servi~~ — il est maintenant **déposable
   depuis l'application** (§3.2) : le menu de dépôt propose le bac blanc complet,
   demande une copie par exercice, les relie par un `groupe_copie_id` et affiche
   la note finale sur 20. Il reste à le faire tourner **une fois sur de vraies
   copies** avant la première session vendue : le script de vérification le
   signale tant que `v_notes_examen_redige` est vide.
6. ~~Le pilotage ignorait ce moteur~~ — `/admin/correction` connaît désormais les
   trois moteurs : HGGSP y est annoncée comme notée par grille rédigée, avec le
   statut des grilles, l'état des étalons et les relectures en attente (§6 bis).
   Au passage, un étalon synthétique n'est plus compté comme « validé par un
   prof » : il ne l'a jamais été.
