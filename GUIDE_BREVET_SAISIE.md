# Guide saisie du barème brevet

## État du système

✅ **Infrastructure complète**
- SQL 42/43 appliqués (schéma brevet)
- Edge Functions déployées (correct-brevet-francais, correct-brevet-maths)
- Sujets zéro chargés (français, maths A/B)
- Référentiels complets (6 compétences, 112 codes d'erreur)

❌ **Blocage : barèmes vides**
- Les barèmes v1.0 existent mais n'ont pas de corrigés
- Impossible de lancer une correction jusqu'à saisie complète

## Accès à l'interface admin

1. Allez sur http://localhost:3000/admin/brevet/francais (en dev)
2. Connectez-vous avec un compte admin
3. Cliquez sur le sujet zéro pour voir les blocages

**OU** Supabase SQL Editor (direct en base)
- Projet : xgdaibekjmtffvkwvcge
- Version français : fe8a7f55-c09c-4396-aa70-1b98a88b4d0a
- Exécutez le SQL dans `GUIDE_BREVET_SAISIE_SQL.md`

## À saisir pour francais

**15 blocages à lever :**

### 1. Éléments attendus (questions 1-7)

Allez dans `/admin/brevet/francais/[examId]` → onglet « Barème »

Pour chaque question, remplissez `éléments attendus` :
- Q1: Identité du narrateur et contexte personnel
- Q2: Une figure de style (ex: personification, métaphore)
- Q3: Le thème principal du texte
- Q4: Le ton et l'attitude de l'auteur
- Q5: Les formes acceptables de la réécriture
- Q6: Points clés de la dictée (6 erreurs)
- Q7: Consigne de la rédaction

### 2. Règles dictée

Dictée = 10 points. Aucune règle nationale de retrait n'existe.
**À saisir** : comment déduire les points (ex: -0.5 par erreur ortho, -1 par accord)

- Code d'erreur `ortho` : -0.5 pts par erreur, plafond 5 pts
- Code d'erreur `accord` : -1 pt par erreur, plafond 4 pts

### 3. Grilles rédaction (40 points)

Deux grilles : **imagination** (40 pts) et **réflexion** (40 pts)

**Grille imagination**
- Originalité des idées : 15 pts
- Cohérence du propos : 15 pts
- Qualité de la langue : 10 pts

**Grille réflexion**
- Argumentation : 20 pts
- Pertinence des exemples : 15 pts
- Nuance et profondeur : 5 pts

## Via Supabase SQL Editor

Copier-coller `GUIDE_BREVET_SAISIE_SQL.md` dans le SQL Editor et exécuter.

Cela peuplera un barème d'exemple prêt pour test E2E.

## Test de la correction

Après saisie :
1. Allez `/admin/brevet/francais/[examId]` → voir l'état du barème
2. Créez une copie test via `/admin/brevet/francais/copies`
3. Transcrivez du texte de test
4. Lancez la correction depuis `/admin/correction`

## Statut avant/après

**Avant**
- Barème v1.0 : 40/100 points (blocages = 15)

**Après saisie**
- Barème v1.0 : 100/100 points (complet)
- Status → « Prêt pour test » (ou « Verrouillé » si satisfait)

