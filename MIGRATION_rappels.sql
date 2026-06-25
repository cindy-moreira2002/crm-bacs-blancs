-- Colonnes tracking des rappels emails (J-1 et H-1 avant bac blanc)
alter table inscriptions add column if not exists rappel_j1_envoye boolean default false;
alter table inscriptions add column if not exists rappel_h1_envoye boolean default false;
