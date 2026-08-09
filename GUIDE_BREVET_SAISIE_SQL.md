# SQL pour peupler le barème français de test

Exécutez ce SQL dans le **SQL Editor de Supabase** (projet xgdaibekjmtffvkwvcge).

```sql
-- Version ID : fe8a7f55-c09c-4396-aa70-1b98a88b4d0a (français sujet zéro)

-- 1. Remplir les éléments attendus des questions
UPDATE bareme_questions
SET elements_attendus = 'Le narrateur raconte un épisode personnel de sa jeunesse.'
WHERE version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND numero = 1;

UPDATE bareme_questions
SET elements_attendus = 'Procédé stylistique : la personnification.'
WHERE version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND numero = 2;

UPDATE bareme_questions
SET elements_attendus = 'Le thème principal : la mémoire et le passage du temps.'
WHERE version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND numero = 3;

UPDATE bareme_questions
SET elements_attendus = 'Ton de l''auteur : nostalgique et mélancolique.'
WHERE version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND numero = 4;

-- 2. Ajouter critères de rédaction (imagination)
INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'originalite', 'Originalité et richesse des idées', 15, 1
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'imagination'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 15;

INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'coherence', 'Cohérence et logique du propos', 15, 2
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'imagination'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 15;

INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'langue', 'Qualité de la langue écrite', 10, 3
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'imagination'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 10;

-- 3. Ajouter critères de rédaction (réflexion)
INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'argumentation', 'Qualité de l''argumentation', 20, 1
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'reflexion'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 20;

INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'pertinence', 'Pertinence des exemples', 15, 2
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'reflexion'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 15;

INSERT INTO brevet_redaction_criteres (grille_id, code, libelle, max_points, ordre)
SELECT id, 'nuance', 'Nuance et profondeur', 5, 3
FROM brevet_redaction_grilles
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a' AND code = 'reflexion'
ON CONFLICT (grille_id, code) DO UPDATE SET max_points = 5;

-- 4. Ajouter règles dictée
INSERT INTO brevet_dictee_regles (config_id, code, description, penalite, plafond)
SELECT id, 'ortho', 'Erreur d''orthographe', 0.5, 5
FROM brevet_dictee_config
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a'
ON CONFLICT (config_id, code) DO UPDATE SET penalite = 0.5, plafond = 5;

INSERT INTO brevet_dictee_regles (config_id, code, description, penalite, plafond)
SELECT id, 'accord', 'Erreur d''accord', 1, 4
FROM brevet_dictee_config
WHERE bareme_version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a'
ON CONFLICT (config_id, code) DO UPDATE SET penalite = 1, plafond = 4;

-- Vérifier l'état après
SELECT 'Elements attendus chargés' as etape,
       COUNT(*) as count,
       SUM(CASE WHEN elements_attendus IS NOT NULL THEN 1 ELSE 0 END) as remplis
FROM bareme_questions
WHERE version_id = 'fe8a7f55-c09c-4396-aa70-1b98a88b4d0a';

SELECT 'Total points barème' as etape,
       SUM(CASE WHEN code = 'imagination' THEN max_points ELSE 0 END) as imagination,
       SUM(CASE WHEN code = 'reflexion' THEN max_points ELSE 0 END) as reflexion;
```

## Après exécution

1. Aller `/admin/brevet/francais/[examId]`
2. Vérifier que le barème passe de 40/100 à 100/100
3. Blocages résoluš
4. Prêt pour test de correction

