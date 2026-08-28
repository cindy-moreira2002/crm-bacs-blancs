-- =====================================================================
--  50 - CORRECTION HYBRIDE : LA GRILLE DU PROFESSEUR ENTRE DANS LE PIPELINE
--
--  Decision de Cindy du 16 aout 2026. Quand un professeur a corrige la copie
--  dans son Google Sheet (classeur « Grilles de correction », une ligne par
--  eleve) et l'a importee dans sa session, sa correction fait foi :
--
--    - sa NOTE remplace la note de l'IA dans le dossier de l'eleve ;
--    - ses niveaux par critere (Excellent -> Non traite) priment sur les
--      scores de l'IA en cas de desaccord ;
--    - ses « points forts » et « points a travailler » sont repris tels quels,
--      presentes comme venant du professeur.
--
--  L'IA ne renote plus : elle REDIGE et met en forme a partir des elements du
--  professeur, en s'appuyant sur sa propre lecture de la copie pour le detail
--  (citations, erreurs precises). Une copie SANS grille prof reste corrigee
--  100 % IA, comme avant : les deux modes coexistent.
--
--  Ce fichier ne pose qu'UNE colonne : le CRM (route
--  /api/prof/sessions/[id]/generer) y recopie la grille validee par le prof
--  juste avant de demander le dossier, et l'Edge Function generate-dossier la
--  lit. Tant que cette colonne n'existe pas, tout marche comme avant --
--  l'ecriture echoue proprement cote CRM et le dossier reste 100 % IA.
--
--  Ce fichier est IDEMPOTENT : le rejouer ne casse rien.
--  A coller dans le SQL Editor du projet Supabase du PIPELINE (xgdaibekjmtffvkwvcge).
-- =====================================================================

alter table public.corrections
  add column if not exists grille_prof jsonb;

comment on column public.corrections.grille_prof is
  'Correction du professeur importee depuis sa grille (Sheet -> CSV -> espace prof). '
  'Forme : { note, epreuve, criteres: {intitule: niveau/texte}, colonnes: [entetes], '
  'professeur: {id, nom, email}, enregistre_le }. Quand elle existe, sa note fait foi '
  'et generate-dossier redige le dossier A PARTIR d''elle (l''IA ne renote pas).';

-- =====================================================================
--  VERIFICATION apres execution — doit renvoyer une ligne :
--
--  select column_name, data_type from information_schema.columns
--  where table_name = 'corrections' and column_name = 'grille_prof';
-- =====================================================================
