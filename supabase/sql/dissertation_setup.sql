-- =====================================================================
--  DISSERTATION FRANÇAIS — grille + sujet + étalons
--  Idempotent : rejouable sans risque.
-- =====================================================================
begin;

-- 1) GRILLE (rubric) dissertation, active ---------------------------------
insert into public.rubrics (id, track, exercise_type, version, status, rubric_json)
values (
  'fr_dissertation_general_v1',
  'generale',
  'dissertation',
  1,
  'active',
  '{"maximum_score":20,"principle":"Barème analytique interne à calibrer et valider par des enseignants.","criteria":[{"code":"PROBLEMATISATION","name":"Analyse du sujet et problématisation","maximum_score":4,"description":"Définir les termes du sujet, repérer la tension et construire une question directrice qui appelle une réponse.","levels":{"0":"Sujet ignoré ou reformulé sans compréhension.","1":"Termes non définis, problématique absente ou plaquée.","2":"Sujet compris mais problématisation faible ou partielle.","3":"Termes définis et tension dégagée, problématique correcte.","4":"Analyse fine du sujet et problématique riche, réellement directrice."}},{"code":"ARGUMENTATION","name":"Construction argumentative","maximum_score":5,"description":"Développer une réponse organisée, progressive, nuancée et centrée sur le sujet.","levels":{"0-1":"Pas de plan exploitable ou hors sujet.","2":"Plan juxtaposé, peu progressif.","3":"Plan clair mais déséquilibré ou peu dialectique.","4":"Argumentation progressive et nuancée.","5":"Démonstration convaincante, dialectique maîtrisée et dépassement."}},{"code":"CONNAISSANCE_OEUVRE","name":"Connaissance de l’œuvre et du parcours","maximum_score":6,"description":"Mobiliser scènes, personnages, motifs et éléments de parcours exacts et variés.","levels":{"0-1":"Œuvre quasi absente ou erronée.","2-3":"Références rares, imprécises ou répétitives.","4":"Références exactes mais peu variées.","5":"Œuvre bien connue et variée.","6":"Connaissance fine de l’œuvre ET du parcours, parfaitement exploitée."}},{"code":"EXEMPLES","name":"Exploitation des exemples et nuance","maximum_score":3,"description":"Analyser les exemples au service de l’argument (les faire parler) au lieu de les lister.","levels":{"0":"Exemples absents ou décoratifs.","1":"Exemples cités mais non analysés.","2":"Exemples analysés mais inégalement reliés au sujet.","3":"Exemples finement exploités et nuancés."}},{"code":"LANGUE","name":"Maîtrise de la langue et présentation","maximum_score":2,"description":"Clarté, syntaxe, orthographe, lexique et lisibilité.","levels":{"0":"Expression très difficile à comprendre.","1":"Erreurs fréquentes ou imprécisions.","2":"Expression claire, fluide et correcte."}}],"guardrails":["Ne pas imposer un plan unique.","Ne pas récompenser la simple longueur.","Ne pas confondre exemple cité et exemple analysé.","Ne pas pénaliser deux fois la même faiblesse.","Justifier chaque score avec des éléments précis de la copie."]}'::jsonb
)
on conflict (id) do update set
  track = excluded.track,
  exercise_type = excluded.exercise_type,
  version = excluded.version,
  status = excluded.status,
  rubric_json = excluded.rubric_json;

-- 2) SUJET (subject_card) dissertation — Musset -------------------------
--    >>> La QUESTION est modifiable : remplace "instruction" par le sujet de ton bac blanc.
insert into public.subject_cards (id, track, exercise_type, work_id, card_json, status)
values (
  'FR-DISS-MUSSET-BADINE',
  'generale',
  'dissertation',
  'musset-on-ne-badine',
  '{"exercise":"Dissertation","maximum_score":20,"study_object":"Le théâtre du XVIIe siècle au XXIe siècle","author":"Alfred de Musset","work":"On ne badine pas avec l’amour","parcours":"Les jeux du cœur et de la parole","publication_year":1834,"instruction":"Dans On ne badine pas avec l’amour de Musset, peut-on dire que les jeux du cœur et de la parole mènent inévitablement au drame ?","consignes":"Vous répondrez à cette question en vous appuyant sur l’œuvre étudiée, sur le parcours associé et sur votre culture personnelle.","main_issues":["Le badinage amoureux comme moteur à la fois comique et tragique.","Le pouvoir ambigu de la parole (jeu, orgueil, mensonge) sur les sentiments.","La responsabilité des personnages face au dénouement funeste.","La tension entre comédie (proverbe) et tragédie romantique."],"acceptable_plan_families":[{"name":"Plan dialectique","axes":["Oui, les jeux du cœur et de la parole conduisent au drame (orgueil, mensonge, malentendus)","Mais le drame naît moins du jeu que de son refus d’y renoncer à temps","Dépassement : le jeu révèle une vérité des sentiments que les personnages n’osent avouer"]},{"name":"Plan par enjeux","axes":["Le badinage comme divertissement et esprit","Le basculement du jeu vers la souffrance","La portée tragique et morale du proverbe"]}],"evaluation_priorities":["La problématisation réelle du sujet.","La connaissance précise de l’œuvre et du parcours.","L’analyse des exemples (les faire parler).","La nuance et la dialectique.","La qualité de l’expression."]}'::jsonb,
  'active'
)
on conflict (id) do update set
  track = excluded.track,
  exercise_type = excluded.exercise_type,
  work_id = excluded.work_id,
  card_json = excluded.card_json,
  status = excluded.status;

-- 3) ÉTALONS — 4 dissertations Musset reliées au sujet ------------------
--    (R10=15, R14=16, R17=17, R19=20)
update public.benchmark_cards set
  subject_id = 'FR-DISS-MUSSET-BADINE',
  track = 'generale',
  exercise_type = 'dissertation',
  validation_status = 'candidate',
  card_json = card_json || '{"benchmark_role":"dissertation_musset","same_subject":true}'::jsonb
where id in ('R10','R14','R17','R19');

commit;

-- Vérifications immédiates -----------------------------------------------
select id, track, exercise_type, status from public.rubrics
where id = 'fr_dissertation_general_v1';

select id, track, exercise_type, status from public.subject_cards
where id = 'FR-DISS-MUSSET-BADINE';

select id, score, validation_status, subject_id from public.benchmark_cards
where subject_id = 'FR-DISS-MUSSET-BADINE' order by score;
