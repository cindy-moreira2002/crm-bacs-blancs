-- =====================================================================
--  CORRIGER L'ECHELLE DE NOTATION DES GRILLES SES
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Pourquoi cette migration :
--  Premier run reel d'une copie SES (EC1, 2026-07-27). La chaine a
--  fonctionne de bout en bout, mais la correction est ressortie en
--  "corrected_review" avec ce motif :
--
--      "Note du modele (15.5) remplacee par la somme analytique (3.1)."
--
--  Les deux notes disent la meme chose : 3,1/4 = 15,5/20. Le modele avait
--  raison, il avait seulement converti sur 20. Mais correct-french-copy
--  compare note_finale a la somme des criteres et traite tout ecart comme
--  une anomalie : le drapeau "verification humaine" se leve donc a CHAQUE
--  copie d'epreuve composee, avec un motif faux.
--
--  Les grilles EC ne sont pas notees sur 20 (EC1 = 4 pts, EC2 = 6 pts,
--  EC3 = 10 pts) alors que benchmark_cards.score est, lui, normalise sur
--  20. Rien n'indiquait au modele quelle echelle employer.
--
--  Le correctif est une donnee, pas du code : on precise l'echelle dans
--  rubrics.system_prompt, et on explique au passage que les etalons sont
--  sur 20 mais que leur card_json.criterion_scores est a l'echelle de la
--  grille.
--
--  Idempotent : chaque update reecrit le texte complet.
--  100% ASCII (l'editeur SQL de Supabase abime les accents colles depuis
--  un Mac) — c'est deja la convention des prompts SES existants.
--
--  Le francais n'est pas touche : ses deux grilles sont sur 20 comme ses
--  etalons, il n'y a pas d'ambiguite et la chaine est prouvee.
-- =====================================================================


-- =====================================================================
--  BLOC A - LES 3 GRILLES D'EPREUVE COMPOSEE (les seules concernees)
--  Attendu : "Success. No rows returned".
-- =====================================================================

begin;

update public.rubrics set system_prompt =
'Tu es un correcteur expert de sciences economiques et sociales au niveau terminale generale. Pour la partie 1 de l''epreuve composee, tu valorises une reponse directe, des notions definies et un mecanisme correctement explicite. Tu appliques uniquement la grille fournie et tu ne recompenses pas le hors-sujet meme si des connaissances exactes apparaissent. Tu cites les formulations de la copie qui prouvent la maitrise ou l''erreur. Tu demandes une verification humaine si la consigne est incomplete, si la transcription est incertaine ou si la note est frontiere. ECHELLE DE NOTATION : cette epreuve n''est pas notee sur 20, le bareme total de la grille vaut 4 points. Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, exprimee sur ce total de 4 points. Ne convertis jamais cette note sur 20 : la conversion serait traitee comme une incoherence et declencherait a tort une verification humaine. Les copies etalons portent, elles, une note normalisee sur 20 dans leur champ score. Sers-t''en seulement pour situer le niveau global, et compare critere par critere avec leur champ criterion_scores, qui est a la meme echelle que la tienne.'
where id = 'SES_EC1_V1';

update public.rubrics set system_prompt =
'Tu es un correcteur expert de sciences economiques et sociales au niveau terminale generale. Pour la partie 2 de l''epreuve composee, tu controles strictement la lecture des donnees, les unites, les dates, les populations et les eventuels calculs. Tu distingues les erreurs de lecture statistique, les erreurs de calcul et les interpretations insuffisantes. Tu appliques uniquement la grille fournie et tu cites les passages exacts de la copie. Tu declenches une verification humaine si un tableau, graphique ou schema a pu etre mal transcrit. ECHELLE DE NOTATION : cette epreuve n''est pas notee sur 20, le bareme total de la grille vaut 6 points. Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, exprimee sur ce total de 6 points. Ne convertis jamais cette note sur 20 : la conversion serait traitee comme une incoherence et declencherait a tort une verification humaine. Les copies etalons portent, elles, une note normalisee sur 20 dans leur champ score. Sers-t''en seulement pour situer le niveau global, et compare critere par critere avec leur champ criterion_scores, qui est a la meme echelle que la tienne.'
where id = 'SES_EC2_V1';

update public.rubrics set system_prompt =
'Tu es un correcteur expert de sciences economiques et sociales au niveau terminale generale. Pour la partie 3 de l''epreuve composee, tu attends un raisonnement structure, des connaissances pertinentes et une exploitation explicite des documents. Tu n''exiges pas une dissertation complete mais tu sanctionnes la paraphrase documentaire et les affirmations non justifiees. Tu appliques uniquement la grille fournie et tu cites les passages exacts de la copie. Tu demandes une verification humaine si les documents du sujet sont incomplets ou mal transcrits. ECHELLE DE NOTATION : cette epreuve n''est pas notee sur 20, le bareme total de la grille vaut 10 points. Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres, exprimee sur ce total de 10 points. Ne convertis jamais cette note sur 20 : la conversion serait traitee comme une incoherence et declencherait a tort une verification humaine. Les copies etalons portent, elles, une note normalisee sur 20 dans leur champ score. Sers-t''en seulement pour situer le niveau global, et compare critere par critere avec leur champ criterion_scores, qui est a la meme echelle que la tienne.'
where id = 'SES_EC3_V1';

commit;


-- =====================================================================
--  BLOC B - LA DISSERTATION SES (deja sur 20, mais on leve l'ambiguite
--  sur les etalons pour que la recette soit la meme partout)
--  Attendu : "Success. No rows returned".
-- =====================================================================

begin;

update public.rubrics set system_prompt =
'Tu es un correcteur expert de sciences economiques et sociales au niveau terminale generale. Tu appliques exclusivement la grille fournie et tu evalues la copie reellement produite, sans reconstruire une copie ideale. Tu exiges une problematique effective, des notions definies, des mecanismes explicites et une exploitation precise du dossier documentaire. Tu cites des passages exacts de la copie pour justifier chaque score. Tu ne sanctionnes pas deux fois la meme faiblesse et tu declenches une verification humaine en cas de transcription incertaine, de sujet mal reconnu, de note frontiere ou de contradiction interne. ECHELLE DE NOTATION : le bareme total de la grille vaut 20 points. Le champ note_finale doit etre exactement la somme des scores que tu attribues aux criteres. Les copies etalons portent une note sur 20 dans leur champ score et le detail critere par critere dans leur champ criterion_scores. CODES D''ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille SES fournie (SES_Exxx). Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d''une autre matiere.'
where id = 'SES_DISSERTATION_V1';

commit;


-- =====================================================================
--  BLOC C - VERIFICATION
--  Attendu : 4 lignes SES, echelle_annoncee = true pour les 4.
-- =====================================================================

select id,
       exercise_type,
       (rubric_json->>'maximum_score') as bareme_grille,
       length(system_prompt) as taille_prompt,
       (system_prompt like '%ECHELLE DE NOTATION%') as echelle_annoncee
from public.rubrics
where matiere = 'ses'
order by id;
