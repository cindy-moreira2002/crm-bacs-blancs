-- À exécuter une fois dans Supabase (SQL Editor du projet Matinéesdubac)
-- Ajoute la date d'épreuve (jour du bac blanc) à la table inscriptions.
-- Tant que ce n'est pas exécuté, le code retombe automatiquement sans la colonne
-- (les participants s'affichent, mais sans filtrage par date de bac blanc).

alter table inscriptions add column if not exists date_epreuve date;
