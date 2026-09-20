-- =====================================================================
--  55 — ANGLAIS (LLCER) : echelle expliquee + taxonomie d'erreurs
--
--  Deux constats de /direction/a-faire, poses le 20 septembre 2026 :
--    • « Bareme ANG_LLCER_SYNTHESE_V1 note sur 16 mais la consigne
--       n'explique pas la conversion sur 20 » (idem TRADUCTION sur 4) ;
--    • « sans taxonomie d'erreurs : les codes d'erreur du dossier
--       seront pauvres ».
--
--  L'ecrit de specialite LLCER vaut 20 points = synthese 16 + traduction 4.
--  Aucune des deux grilles ne doit ramener sa note sur 20 elle-meme :
--  c'est l'application qui additionne. Le system_prompt le dit maintenant
--  explicitement, ce que verifie echelleExpliquee() (src/lib/pipelineVerifs.ts).
--
--  Les codes suivent la convention SES : code / category / severity
--  (major | moderate | minor) / description, dans rubric_json.
--  common_error_taxonomy.
--
--  Idempotent : a rejouer sans risque.
-- =====================================================================

update public.rubrics
set system_prompt = system_prompt ||
  case when system_prompt like '%ECHELLE DE NOTATION%' then '' else
    ' ECHELLE DE NOTATION : cette grille note la SYNTHESE sur 16 points, et seulement elle. Le champ note_finale doit etre exactement la somme des scores des criteres, exprimee sur 16 : tu ne la ramenes jamais sur 20 toi-meme. Les 4 points restants de l''epreuve viennent de la traduction, corrigee par une autre grille ; l''application additionne les deux pour faire la note sur 20 de l''ecrit de specialite.'
  end ||
  case when system_prompt like '%CODES D''ERREUR%' then '' else
    ' CODES D''ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille fournie. Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d''une autre matiere.'
  end,
    rubric_json = jsonb_set(rubric_json, '{common_error_taxonomy}', jsonb_build_array(
      jsonb_build_object('code','ANG_E001','category','contresens_document','severity','major','description','Contresens sur le propos ou la these d''un document'),
      jsonb_build_object('code','ANG_E002','category','resume_successif','severity','major','description','Documents resumes l''un apres l''autre, sans mise en relation'),
      jsonb_build_object('code','ANG_E003','category','document_ignore','severity','major','description','Un document du dossier n''est pas exploite'),
      jsonb_build_object('code','ANG_E004','category','hors_sujet','severity','major','description','La reponse ne traite pas la consigne posee'),
      jsonb_build_object('code','ANG_E005','category','langue_reponse','severity','major','description','Synthese redigee en francais au lieu de l''anglais'),
      jsonb_build_object('code','ANG_E006','category','point_de_vue_manque','severity','moderate','description','Point de vue ou enonciateur du document non identifie'),
      jsonb_build_object('code','ANG_E007','category','implicite_manque','severity','moderate','description','Implicite, ironie ou sous-entendu non percu'),
      jsonb_build_object('code','ANG_E008','category','affirmation_non_etayee','severity','moderate','description','Affirmation avancee sans appui sur le dossier'),
      jsonb_build_object('code','ANG_E009','category','paraphrase','severity','moderate','description','Citation recopiee sans exploitation'),
      jsonb_build_object('code','ANG_E010','category','plan_absent','severity','moderate','description','Aucun fil directeur : le plan suit l''ordre des documents'),
      jsonb_build_object('code','ANG_E011','category','calque_francais','severity','moderate','description','Calque syntaxique ou lexical du francais'),
      jsonb_build_object('code','ANG_E012','category','temps_aspect','severity','moderate','description','Temps ou aspect mal employes (preterit, present perfect)'),
      jsonb_build_object('code','ANG_E013','category','accord_base','severity','minor','description','Erreur de base repetee (s de 3e personne, accord, ordre des mots)'),
      jsonb_build_object('code','ANG_E014','category','lexique_pauvre','severity','minor','description','Lexique pauvre ou repetitif, non reinvesti du dossier'),
      jsonb_build_object('code','ANG_E015','category','connecteurs','severity','minor','description','Connecteurs logiques absents ou mal employes'),
      jsonb_build_object('code','ANG_E016','category','longueur','severity','minor','description','Longueur nettement hors consigne')
    ))
where id = 'ANG_LLCER_SYNTHESE_V1';

update public.rubrics
set system_prompt = system_prompt ||
  case when system_prompt like '%ECHELLE DE NOTATION%' then '' else
    ' ECHELLE DE NOTATION : cette grille note la TRADUCTION sur 4 points, et seulement elle. Le champ note_finale doit etre exactement la somme des scores des criteres, exprimee sur 4 : tu ne la ramenes jamais sur 20 toi-meme. Les 16 autres points de l''epreuve viennent de la synthese, corrigee par une autre grille ; l''application additionne les deux pour faire la note sur 20 de l''ecrit de specialite.'
  end ||
  case when system_prompt like '%CODES D''ERREUR%' then '' else
    ' CODES D''ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille fournie. Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d''une autre matiere.'
  end,
    rubric_json = jsonb_set(rubric_json, '{common_error_taxonomy}', jsonb_build_array(
      jsonb_build_object('code','ANG_T001','category','contresens','severity','major','description','Sens inverse ou perdu sur un segment'),
      jsonb_build_object('code','ANG_T002','category','omission','severity','major','description','Segment du passage non traduit'),
      jsonb_build_object('code','ANG_T003','category','faux_sens','severity','moderate','description','Nuance manquee : le sens general tient, la precision non'),
      jsonb_build_object('code','ANG_T004','category','temps_modaux','severity','moderate','description','Temps ou modal mal transpose en francais'),
      jsonb_build_object('code','ANG_T005','category','voix_passive','severity','moderate','description','Passif anglais calque au lieu d''etre transpose'),
      jsonb_build_object('code','ANG_T006','category','calque_syntaxe','severity','moderate','description','Ordre des mots anglais conserve en francais'),
      jsonb_build_object('code','ANG_T007','category','faux_ami','severity','moderate','description','Faux ami non detecte'),
      jsonb_build_object('code','ANG_T008','category','non_traduit','severity','moderate','description','Mot ou expression laisse en anglais sans raison'),
      jsonb_build_object('code','ANG_T009','category','registre','severity','minor','description','Registre de langue inadapte au passage'),
      jsonb_build_object('code','ANG_T010','category','francais_bancal','severity','minor','description','Sens juste, francais maladroit'),
      jsonb_build_object('code','ANG_T011','category','orthographe_fr','severity','minor','description','Orthographe ou accord fautif en francais'),
      jsonb_build_object('code','ANG_T012','category','realia','severity','minor','description','Nom propre ou realia traduit a tort, ou non adapte')
    ))
where id = 'ANG_LLCER_TRADUCTION_V1';

-- Verification :
--   select id, jsonb_array_length(rubric_json->'common_error_taxonomy') as codes,
--          system_prompt like '%ECHELLE DE NOTATION%' as echelle_dite
--   from public.rubrics where id like 'ANG_LLCER_%';
--   attendu : SYNTHESE 16 / true, TRADUCTION 12 / true
