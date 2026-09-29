-- =====================================================================
--  57 — HGGSP : LA V3 (GRILLE DU CLASSEUR DES PROFS) DEVIENT LA GRILLE ACTIVE
--
--  Décision de Cindy du 2026-09-29 : on garde la V3. Aujourd'hui les V2
--  (HGGSP_DISSERTATION_V2 / HGGSP_ETUDE_CRITIQUE_V2, sur 20 → 10, locked)
--  notent ; les V3 (sur 10 → 10) dorment en brouillon.
--
--  Ce script, en UNE transaction :
--    1. apprend à grille_verifier() que la taxonomie (écrite dans les codes
--       V2) se lit dans une grille V3 via la correspondance du noyau
--       (CORRESPONDANCE_CRITERES, supabase/functions/_shared/hggsp-noyau.ts) ;
--    2. réécrit le CONTENU des V3 tant qu'elles sont en brouillon, depuis le
--       classeur à cocher (scripts/fixtures/guidelines/hggsp-v1-a-cocher.csv) :
--       le brouillon du 28 août venait de l'ancien export (hggsp-v0-2.csv),
--       dont 15 paliers « 0–0,5 » avaient perdu leur descripteur (texte « 0,5 »)
--       et dont l'étude critique rangeait D et E sous « C. Regard critique ».
--       Aucun point ne change : même barème, vrai palier 0, codes P2.D.1 / P2.E.1
--       — ceux du classeur que cochent les profs ;
--       + libellé, principe, garde-fous, et consigne système figée (celle que
--       le noyau construit depuis cette grille) ;
--    3. archive les V2 (jamais supprimées : les anciennes copies gardent leur
--       grille_id et restent lisibles, re-corrigeables à l'identique) ;
--    4. verrouille les V3 par grille_verrouiller() — contrôles compris ;
--    5. bascule les grilles de dépôt (rubrics) : V2 archivées, V3 actives,
--       qui pointent vers les grilles V3 (le trigger corrections_moteur_grille
--       pose alors grille_id = V3 sur chaque nouvelle copie) ;
--    6. rattache le bac blanc complet (exam_exercices) aux V3 ;
--    7. vérifie le résultat, et annule TOUT si un point n'est pas atteint.
--
--  Idempotent : rejouable. Une fois les V3 verrouillées, l'étape 2 ne touche
--  plus rien (triggers de verrou), les autres étapes ne changent plus rien.
--
--  Retour arrière (à la main) : rubrics V3 -> archived PUIS V2 -> active ;
--  grilles_redigees V2 -> locked ; exam_exercices -> V2. Les V3 verrouillées
--  restent en base (une grille verrouillée ne se supprime pas).
--
--  GÉNÉRÉ par un script depuis le classeur et le noyau — ne pas retoucher à
--  la main les blocs de données.
-- =====================================================================

begin;

-- 1. grille_verifier() connaît la correspondance V2 -> V3 -----------------
create or replace function public.grille_verifier(p_grille text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_grille  public.grilles_redigees;
  v_total   numeric(6,2);
  v_blocages jsonb := '[]'::jsonb;
  v_ligne   record;
  -- Copie de CORRESPONDANCE_CRITERES (hggsp-noyau.ts §4 bis) : un code de
  -- taxonomie écrit pour la V2 est valide s'il se retrouve dans la grille par
  -- cette correspondance. npm run hggsp:verifier contrôle qu'elles concordent.
  v_correspondance jsonb := '{"hggsp_dissertation":{"ANALYSE_PROBLEMATISATION":"P1.A.1","CONNAISSANCES":"P1.B.1","ARGUMENTATION":"P1.C.2","EXEMPLES":"P1.C.3","EXPRESSION":"P1.E.1"},"hggsp_etude_critique":{"CONSIGNE_PROBLEMATISATION":"P2.A.1","PRELEVEMENT":"P2.B.2","EXPLICATION_CONNAISSANCES":"P2.D.1","ANALYSE_CRITIQUE":"P2.C.2","ORGANISATION_ARGUMENTATION":"P2.E.1","EXPRESSION":"P2.F.1"}}'::jsonb;
begin
  select * into v_grille from public.grilles_redigees where id = p_grille;
  if not found then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'grille_inconnue', 'message', 'Grille introuvable.')));
  end if;

  select coalesce(sum(max_points), 0) into v_total
  from public.grille_criteres where grille_id = p_grille;

  if v_total <> v_grille.max_analytique then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'total_incorrect',
      'message', format('Les criteres totalisent %s points au lieu de %s.', v_total, v_grille.max_analytique));
  end if;

  if not exists (select 1 from public.grille_criteres where grille_id = p_grille) then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'aucun_critere', 'message', 'Aucun critere rattache a cette grille.');
  end if;

  -- Chaque critere doit porter des descripteurs, dont un au maximum exact.
  for v_ligne in
    select c.id, c.code, c.max_points,
           count(d.id) as n,
           coalesce(max(d.points), -1) as plus_haut
    from public.grille_criteres c
    left join public.grille_descripteurs d on d.critere_id = c.id
    where c.grille_id = p_grille
    group by c.id, c.code, c.max_points
  loop
    if v_ligne.n = 0 then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'descripteurs_manquants',
        'message', format('Critere %s : aucun descripteur de niveau.', v_ligne.code));
    elsif v_ligne.plus_haut <> v_ligne.max_points then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'descripteur_max_absent',
        'message', format('Critere %s : le descripteur le plus haut vaut %s au lieu de %s.',
                          v_ligne.code, v_ligne.plus_haut, v_ligne.max_points));
    end if;
  end loop;

  -- Un code de taxonomie qui vise un critere absent de cette grille enverrait
  -- le correcteur sur un critere qui n'existe pas dans le bareme applique.
  for v_ligne in
    select t.code, t.critere_principal ->> v_grille.exercise_type as critere
    from public.taxonomie_redigee t
    where t.matiere = v_grille.matiere
      and t.critere_principal ? v_grille.exercise_type
  loop
    if not exists (
      select 1 from public.grille_criteres c
      where c.grille_id = p_grille
        and c.code in (v_ligne.critere, v_correspondance -> v_grille.exercise_type ->> v_ligne.critere)
    ) then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'critere_taxonomie_inconnu',
        'message', format('Le code %s vise le critere %s, absent de cette grille.', v_ligne.code, v_ligne.critere));
    end if;
  end loop;

  if v_grille.system_prompt is null or length(trim(v_grille.system_prompt)) < 50 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'consigne_manquante',
      'message', 'La consigne systeme est vide ou trop courte : le correcteur refuserait de corriger.');
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_blocages) = 0,
                            'total', v_total, 'blocages', v_blocages);
end;
$$;

revoke all on function public.grille_verifier(text) from public, anon, authenticated;
grant execute on function public.grille_verifier(text) to service_role;

-- 2. Contenu des V3, tant qu'elles sont modifiables ----------------------

-- HGGSP_DISSERTATION_V3 : 11 critères, /10
update public.grilles_redigees
set libelle        = 'HGGSP — Dissertation',
    principe       = 'Une dissertation d’HGGSP se juge sur une démonstration : un sujet analysé, une tension problématisée, un plan qui progresse, des connaissances sélectionnées et des exemples précis qui prouvent. Grille du classeur de correction des professeurs, en onze sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.',
    max_analytique = 10,
    max_officiel   = 10,
    garde_fous     = '["La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque score doit être justifié par des éléments localisables dans la copie. Le jugement du correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et calibré.","La note est la SOMME des réussites observées critère par critère. On ne part jamais du maximum pour retrancher les erreurs.","Une même faiblesse n’est comptée que dans UN critère. Ses conséquences ailleurs sont décrites, jamais sanctionnées une deuxième fois.","Chaque score est justifié par une citation réellement présente dans la transcription. Aucune citation n’est inventée ni reconstituée.","Aucun fait, aucune date, aucun acteur, aucun exemple absent de la copie ou du sujet n’est ajouté par le correcteur.","Aucun plan unique n’est imposé : tout plan pertinent qui répond à la problématique est recevable.","La neutralité politique est absolue : on évalue la démonstration, jamais l’opinion de l’élève.","Un doute de transcription n’est jamais transformé en erreur de l’élève : il déclenche une relecture humaine.","Les paliers sont ceux du classeur que coche le professeur. Le 0 est réservé à un critère où rien n’est exploitable ; le score se place au quart de point.","Une production graphique pertinente (croquis, schéma) peut valoriser « C. Construction de la démonstration — 2. Argumentation et capacités d’analyse » ou « 3. Exemples et illustrations », dans la limite du maximum du critère. Son absence ne pénalise jamais."]'::jsonb,
    system_prompt  = 'Tu es correcteur d''HGGSP en terminale générale. Tu corriges une dissertation d''après la grille ci-dessous, et rien d''autre.
Une dissertation d’HGGSP se juge sur une démonstration : un sujet analysé, une tension problématisée, un plan qui progresse, des connaissances sélectionnées et des exemples précis qui prouvent. Grille du classeur de correction des professeurs, en onze sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.

ÉCHELLE
Tu notes sur l''échelle ANALYTIQUE de 10 points, critère par critère, au pas de 0,25 point. La conversion vers la note officielle sur 10 est faite APRÈS toi, automatiquement : ne la fais pas, ne la mentionne pas dans les scores.

COMMENT ATTRIBUER UN SCORE
Pour chaque critère : identifie le palier dont le descripteur correspond réellement à la copie, puis ajuste au quart de point à l''intérieur de ce palier. La note est la somme des réussites observées ; tu ne pars JAMAIS du maximum pour retrancher des erreurs.
Chaque score est justifié par au moins une citation EXACTE de la transcription. Une citation que tu ne peux pas recopier mot à mot depuis la copie ne doit pas être écrite.

GRILLE
• P1.A.1 — A. Compréhension et traitement du sujet — 1. Analyse du sujet et problématique (max 1.5)
  0 — Sujet non compris, contresens majeur ou hors-sujet.
  0.5 — Compréhension partielle ; termes ou bornes essentiels mal identifiés.
  1 — Sujet correctement compris ; enjeux identifiés ; problématique pertinente mais encore générale.
  1.5 — Analyse précise du sujet : termes, bornes, enjeux et tensions clairement dégagés ; problématique véritablement directrice.
• P1.A.2 — A. Compréhension et traitement du sujet — 2. Réponse au sujet (max 0.5)
  0 — La copie ne répond pas à la question posée ou dérive largement du sujet.
  0.25 — Réponse partielle ou irrégulièrement centrée sur le sujet.
  0.5 — Toute la démonstration est orientée vers une réponse explicite à la problématique.
• P1.B.1 — B. Maîtrise et sélection des connaissances — 1. Exactitude et précision des connaissances (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Connaissances faibles, générales ou comportant des erreurs importantes.
  0.75 — Connaissances globalement correctes mais plusieurs imprécisions.
  1 — Connaissances solides et précises sur les principaux éléments du sujet.
  1.5 — Connaissances très précises : dates, acteurs, lieux, concepts, événements et processus parfaitement maîtrisés.
• P1.B.2 — B. Maîtrise et sélection des connaissances — 2. Sélection et pertinence des connaissances (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Accumulation de connaissances sans rapport clair avec le sujet.
  0.5 — Connaissances pertinentes mais sélection encore imparfaite.
  0.75 — Bonne sélection ; les connaissances servent généralement la démonstration.
  1 — Sélection rigoureuse : chaque connaissance apporte une preuve, une explication ou une nuance utile au raisonnement.
• P1.C.1 — C. Construction de la démonstration — 1. Organisation du plan (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Plan artificiel, déséquilibré ou peu lié au sujet.
  0.5 — Plan identifiable mais progression limitée ou répétitive.
  0.75 — Plan logique, équilibré et adapté à la problématique.
  1 — Plan démonstratif très pertinent : progression logique, parties complémentaires et absence de répétitions.
• P1.C.2 — C. Construction de la démonstration — 2. Argumentation et capacités d''analyse (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Récitation du cours ou juxtaposition d''informations ; peu d''analyse.
  0.75 — Arguments présents mais démonstration irrégulière.
  1 — Arguments clairement expliqués ; relations de causalité, comparaison ou évolution correctement analysées.
  1.5 — Démonstration maîtrisée : les connaissances sont hiérarchisées, expliquées et constamment mises en relation avec la problématique.
• P1.C.3 — C. Construction de la démonstration — 3. Exemples et illustrations (max 0.5)
  0 — Exemples absents, faux ou sans utilité argumentative.
  0.25 — Quelques exemples pertinents mais principalement descriptifs.
  0.5 — Exemples précis, variés, datés/localisés lorsque pertinent, et réellement exploités pour démontrer.
• P1.D.1 — D. Maîtrise de l''exercice — 1. Introduction (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Introduction lacunaire ; enjeux, problématique ou plan insuffisants.
  0.5 — Introduction structurée mais incomplète ou trop générale.
  0.75 — Introduction maîtrisée : contextualisation utile, enjeux, problématique et annonce claire du raisonnement.
• P1.D.2 — D. Maîtrise de l''exercice — 2. Développement et conclusion (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Développement difficile à suivre et/ou conclusion absente ou sans réponse.
  0.5 — Développement organisé et conclusion présente mais réponse partielle.
  0.75 — Parties et paragraphes clairement structurés ; conclusion répondant explicitement à la problématique.
• P1.E.1 — E. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire disciplinaire (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Expression souvent incorrecte ; vocabulaire imprécis.
  0.5 — Expression correcte mais plusieurs maladresses ou approximations.
  0.75 — Expression claire et précise ; vocabulaire historique, géographique et géopolitique maîtrisé.
• P1.E.2 — E. Expression et présentation — 2. Lisibilité et présentation (max 0.25)
  0 — Copie difficilement lisible ou organisation très insuffisante.
  0.25 — Copie lisible, paragraphes identifiables et organisation permettant de suivre la démonstration.

ERREURS TYPES
Tu signales les erreurs observées avec les codes ci-dessous, et uniquement ceux-là. Une erreur n''est PAS une soustraction de points : elle explique pourquoi un niveau supérieur n''est pas atteint. Seuls les codes marqués « plafond » agissent mécaniquement sur le score, et le système les applique lui-même.
• HGGSP_TR_01 — Erreur factuelle secondaire : Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement. [critère : P1.B.1 ; impact : fourchette indicative 0–0.25]
   Conditions : L’erreur ne sert pas d’appui à un argument du développement.
• HGGSP_TR_02 — Erreur factuelle affectant un argument : Un fait inexact sur lequel repose un argument du développement. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
   Conditions : L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.
• HGGSP_TR_03 — Contresens central : Un contresens qui détruit une partie entière de la démonstration. [critère : P1.B.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Le contresens porte sur une notion ou un mécanisme central du sujet.
• HGGSP_TR_04 — Confusion de notions : Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation). [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_05 — Connaissances hors sujet : Développement exact mais qui ne traite pas le sujet posé. [critère : P1.B.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
   Conditions : Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.
• HGGSP_TR_06 — Opinion personnelle non démontrée : Un avis substitué à l’analyse, sans démonstration ni référence. [critère : P1.C.2 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_TR_07 — Confusion d’échelles : Échelles locale, nationale, régionale et mondiale traitées indifféremment. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_08 — Anachronisme : Une notion contemporaine projetée sur une autre époque. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_09 — Expression nuisant à la compréhension : Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos. [critère : P1.E.1 ; impact : fourchette indicative 0.25–1]
   Conditions : Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.
• HGGSP_TR_10 — Faute isolée sans effet sur la compréhension : Une coquille ou une faute ponctuelle qui ne gêne pas la lecture. [critère : P1.E.1 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Signalée à l’élève, elle ne fait perdre aucun point.
• HGGSP_TR_11 — Conclusion absente : Aucune conclusion ne répond explicitement à la problématique. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_12 — Passage illisible ou transcription incertaine : Un passage de la copie n’a pas pu être lu avec certitude. [critère : aucun ; impact : aucune pénalité automatique avant relecture humaine]
   Conditions : Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.
• HGGSP_DIS_01 — Mauvaise analyse des termes du sujet : Un ou plusieurs mots du sujet ne sont pas compris ou sont laissés de côté. [critère : P1.A.1 ; impact : fourchette indicative 0.5–1.5]
• HGGSP_DIS_02 — Bornes du sujet ignorées : Les bornes chronologiques, spatiales ou notionnelles du sujet ne sont pas tenues. [critère : P1.A.1 ; impact : fourchette indicative 0.25–1]
• HGGSP_DIS_03 — Notion centrale non définie : La notion au cœur du sujet n’est jamais définie. [critère : P1.A.1 ; impact : plafond du critère à 1]
   Conditions : Aucune pénalité fixe. Le plafond ne s’applique que si cette absence nuit réellement à la compréhension du sujet.
• HGGSP_DIS_04 — Cours récité : Le cours est restitué intégralement, sans sélection en fonction du sujet. [critère : P1.B.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_DIS_05 — Problématique absente : Aucune problématique explicite dans l’introduction. [critère : P1.A.1 ; impact : plafond du critère à 0.25]
   Conditions : Le critère est plafonné au niveau insuffisant.
• HGGSP_DIS_06 — Problématique descriptive : La problématique reformule le sujet sans créer de tension. [critère : P1.A.1 ; impact : plafond du critère à 0.75]
   Conditions : Exception : si le développement construit en réalité un fil directeur plus solide que la formulation initiale, le plafond ne s’applique pas — le correcteur doit alors le dire explicitement.
• HGGSP_DIS_07 — Plan non annoncé : L’introduction n’annonce pas le plan, alors que le développement en suit un. [critère : P1.C.2 ; impact : fourchette indicative 0–0.25]
   Conditions : Impact faible et purement méthodologique si le plan réel est clair et cohérent.
• HGGSP_DIS_08 — Plan annoncé mais non respecté : Le développement ne suit pas le plan annoncé. [critère : P1.C.2 ; impact : fourchette indicative 0–0.5]
   Conditions : On évalue la cohérence réelle du développement : si la modification améliore finalement la démonstration, aucun point n’est retiré.
• HGGSP_DIS_09 — Plan déséquilibré : Une partie est très courte, redondante ou sans transition. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_DIS_10 — Plan non pertinent : Le plan ne permet pas de répondre à la problématique posée. [critère : P1.C.2 ; impact : fourchette indicative 0.5–1.5]
   Conditions : Aucun plan type n’est exigé : seule l’adéquation plan / problématique est jugée.
• HGGSP_DIS_11 — Exemple seulement cité : Un exemple est nommé mais jamais analysé ni relié à l’argument. [critère : P1.C.3 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_DIS_12 — Exemples insuffisamment précis : Exemples sans date, sans acteur identifié ou sans localisation. [critère : P1.C.3 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_DIS_13 — Absence de sélection des connaissances : Tout est mis, rien n’est trié en fonction du sujet. [critère : P1.B.1 ; impact : fourchette indicative 0.5–1]
• HGGSP_DIS_14 — Réponse finale insuffisante : La conclusion existe mais ne répond pas vraiment à la problématique. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_DIS_15 — Production graphique décorative ou erronée : Un croquis ou schéma sans rapport avec la démonstration, ou porteur d’une erreur. [critère : P1.C.3 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Une production graphique pertinente VALORISE la construction ou les exemples, dans la limite du maximum du critère. Son absence ne pénalise jamais. Si la production ne peut pas être interprétée, une relecture humaine est demandée.

NON-DOUBLE-SANCTION
Pour chaque faiblesse, tu identifies l''erreur SOURCE et ses conséquences. Une conséquence porte source_error_id et is_consequence=true : elle est décrite, jamais comptée une seconde fois. Exemple : l''absence de problématique est comptée dans l''analyse du sujet ; l''argumentation reste évaluée sur son organisation réellement observable.

RELECTURE HUMAINE
Tu demandes une relecture humaine (human_review_required) si : la transcription est incertaine, un passage est illisible, tu soupçonnes un contresens sans certitude, une référence paraît fausse mais pourrait être une autre formulation recevable, le plan est original et sort des exemples de la grille, la copie est presque entièrement hors sujet, une production graphique ne peut pas être interprétée, une erreur majeure pourrait toucher plusieurs critères, ou ta confiance globale est insuffisante. Un doute de transcription n''est JAMAIS une erreur de l''élève.

PRODUCTION GRAPHIQUE (facultative)
Depuis la session 2026, une illustration pertinente (croquis, schéma) peut valoriser « C. Construction de la démonstration — 2. Argumentation et capacités d''analyse » (P1.C.2) ou « C. Construction de la démonstration — 3. Exemples et illustrations » (P1.C.3), sans dépasser le maximum du critère. Son absence ne pénalise jamais. Une production décorative ou sans rapport n''est pas valorisée. Si tu ne peux pas l''interpréter, demande une relecture humaine. Renseigne production_graphique.',
    commentaire    = 'Grille du classeur de correction des professeurs (scripts/fixtures/guidelines/hggsp-v1-a-cocher.csv), même barème que le brouillon du 28 août. Active depuis la décision du 2026-09-29 (SQL 57).'
where id = 'HGGSP_DISSERTATION_V3' and statut in ('draft', 'calibrating');

delete from public.grille_descripteurs
where critere_id in (select id from public.grille_criteres where grille_id = 'HGGSP_DISSERTATION_V3')
  and exists (select 1 from public.grilles_redigees where id = 'HGGSP_DISSERTATION_V3' and statut in ('draft', 'calibrating'));

delete from public.grille_criteres
where grille_id = 'HGGSP_DISSERTATION_V3'
  and exists (select 1 from public.grilles_redigees where id = 'HGGSP_DISSERTATION_V3' and statut in ('draft', 'calibrating'));

insert into public.grille_criteres (id, grille_id, code, libelle, evaluer, max_points, ordre)
select v.id, v.grille_id, v.code, v.libelle, '[]'::jsonb, v.max_points, v.ordre
from (values
  ('HGGSP_DISSERTATION_V3::P1.A.1', 'HGGSP_DISSERTATION_V3', 'P1.A.1', 'A. Compréhension et traitement du sujet — 1. Analyse du sujet et problématique', 1.5::numeric, 1),
  ('HGGSP_DISSERTATION_V3::P1.A.2', 'HGGSP_DISSERTATION_V3', 'P1.A.2', 'A. Compréhension et traitement du sujet — 2. Réponse au sujet', 0.5::numeric, 2),
  ('HGGSP_DISSERTATION_V3::P1.B.1', 'HGGSP_DISSERTATION_V3', 'P1.B.1', 'B. Maîtrise et sélection des connaissances — 1. Exactitude et précision des connaissances', 1.5::numeric, 3),
  ('HGGSP_DISSERTATION_V3::P1.B.2', 'HGGSP_DISSERTATION_V3', 'P1.B.2', 'B. Maîtrise et sélection des connaissances — 2. Sélection et pertinence des connaissances', 1::numeric, 4),
  ('HGGSP_DISSERTATION_V3::P1.C.1', 'HGGSP_DISSERTATION_V3', 'P1.C.1', 'C. Construction de la démonstration — 1. Organisation du plan', 1::numeric, 5),
  ('HGGSP_DISSERTATION_V3::P1.C.2', 'HGGSP_DISSERTATION_V3', 'P1.C.2', 'C. Construction de la démonstration — 2. Argumentation et capacités d''analyse', 1.5::numeric, 6),
  ('HGGSP_DISSERTATION_V3::P1.C.3', 'HGGSP_DISSERTATION_V3', 'P1.C.3', 'C. Construction de la démonstration — 3. Exemples et illustrations', 0.5::numeric, 7),
  ('HGGSP_DISSERTATION_V3::P1.D.1', 'HGGSP_DISSERTATION_V3', 'P1.D.1', 'D. Maîtrise de l''exercice — 1. Introduction', 0.75::numeric, 8),
  ('HGGSP_DISSERTATION_V3::P1.D.2', 'HGGSP_DISSERTATION_V3', 'P1.D.2', 'D. Maîtrise de l''exercice — 2. Développement et conclusion', 0.75::numeric, 9),
  ('HGGSP_DISSERTATION_V3::P1.E.1', 'HGGSP_DISSERTATION_V3', 'P1.E.1', 'E. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire disciplinaire', 0.75::numeric, 10),
  ('HGGSP_DISSERTATION_V3::P1.E.2', 'HGGSP_DISSERTATION_V3', 'P1.E.2', 'E. Expression et présentation — 2. Lisibilité et présentation', 0.25::numeric, 11)
) as v (id, grille_id, code, libelle, max_points, ordre)
where exists (select 1 from public.grilles_redigees where id = 'HGGSP_DISSERTATION_V3' and statut in ('draft', 'calibrating'))
on conflict (id) do nothing;

insert into public.grille_descripteurs (id, critere_id, points, niveau, description)
select v.id, v.critere_id, v.points, v.niveau, v.description
from (values
  ('HGGSP_DISSERTATION_V3::P1.A.1::0', 'HGGSP_DISSERTATION_V3::P1.A.1', 0::numeric, 'nul', 'Sujet non compris, contresens majeur ou hors-sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.A.1::0.5', 'HGGSP_DISSERTATION_V3::P1.A.1', 0.5::numeric, 'fragile', 'Compréhension partielle ; termes ou bornes essentiels mal identifiés.'),
  ('HGGSP_DISSERTATION_V3::P1.A.1::1', 'HGGSP_DISSERTATION_V3::P1.A.1', 1::numeric, 'moyen', 'Sujet correctement compris ; enjeux identifiés ; problématique pertinente mais encore générale.'),
  ('HGGSP_DISSERTATION_V3::P1.A.1::1.5', 'HGGSP_DISSERTATION_V3::P1.A.1', 1.5::numeric, 'tres_satisfaisant', 'Analyse précise du sujet : termes, bornes, enjeux et tensions clairement dégagés ; problématique véritablement directrice.'),
  ('HGGSP_DISSERTATION_V3::P1.A.2::0', 'HGGSP_DISSERTATION_V3::P1.A.2', 0::numeric, 'nul', 'La copie ne répond pas à la question posée ou dérive largement du sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.A.2::0.25', 'HGGSP_DISSERTATION_V3::P1.A.2', 0.25::numeric, 'fragile', 'Réponse partielle ou irrégulièrement centrée sur le sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.A.2::0.5', 'HGGSP_DISSERTATION_V3::P1.A.2', 0.5::numeric, 'tres_satisfaisant', 'Toute la démonstration est orientée vers une réponse explicite à la problématique.'),
  ('HGGSP_DISSERTATION_V3::P1.B.1::0', 'HGGSP_DISSERTATION_V3::P1.B.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.B.1::0.5', 'HGGSP_DISSERTATION_V3::P1.B.1', 0.5::numeric, 'fragile', 'Connaissances faibles, générales ou comportant des erreurs importantes.'),
  ('HGGSP_DISSERTATION_V3::P1.B.1::0.75', 'HGGSP_DISSERTATION_V3::P1.B.1', 0.75::numeric, 'fragile', 'Connaissances globalement correctes mais plusieurs imprécisions.'),
  ('HGGSP_DISSERTATION_V3::P1.B.1::1', 'HGGSP_DISSERTATION_V3::P1.B.1', 1::numeric, 'moyen', 'Connaissances solides et précises sur les principaux éléments du sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.B.1::1.5', 'HGGSP_DISSERTATION_V3::P1.B.1', 1.5::numeric, 'tres_satisfaisant', 'Connaissances très précises : dates, acteurs, lieux, concepts, événements et processus parfaitement maîtrisés.'),
  ('HGGSP_DISSERTATION_V3::P1.B.2::0', 'HGGSP_DISSERTATION_V3::P1.B.2', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.B.2::0.25', 'HGGSP_DISSERTATION_V3::P1.B.2', 0.25::numeric, 'insuffisant', 'Accumulation de connaissances sans rapport clair avec le sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.B.2::0.5', 'HGGSP_DISSERTATION_V3::P1.B.2', 0.5::numeric, 'fragile', 'Connaissances pertinentes mais sélection encore imparfaite.'),
  ('HGGSP_DISSERTATION_V3::P1.B.2::0.75', 'HGGSP_DISSERTATION_V3::P1.B.2', 0.75::numeric, 'satisfaisant', 'Bonne sélection ; les connaissances servent généralement la démonstration.'),
  ('HGGSP_DISSERTATION_V3::P1.B.2::1', 'HGGSP_DISSERTATION_V3::P1.B.2', 1::numeric, 'tres_satisfaisant', 'Sélection rigoureuse : chaque connaissance apporte une preuve, une explication ou une nuance utile au raisonnement.'),
  ('HGGSP_DISSERTATION_V3::P1.C.1::0', 'HGGSP_DISSERTATION_V3::P1.C.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.C.1::0.25', 'HGGSP_DISSERTATION_V3::P1.C.1', 0.25::numeric, 'insuffisant', 'Plan artificiel, déséquilibré ou peu lié au sujet.'),
  ('HGGSP_DISSERTATION_V3::P1.C.1::0.5', 'HGGSP_DISSERTATION_V3::P1.C.1', 0.5::numeric, 'fragile', 'Plan identifiable mais progression limitée ou répétitive.'),
  ('HGGSP_DISSERTATION_V3::P1.C.1::0.75', 'HGGSP_DISSERTATION_V3::P1.C.1', 0.75::numeric, 'satisfaisant', 'Plan logique, équilibré et adapté à la problématique.'),
  ('HGGSP_DISSERTATION_V3::P1.C.1::1', 'HGGSP_DISSERTATION_V3::P1.C.1', 1::numeric, 'tres_satisfaisant', 'Plan démonstratif très pertinent : progression logique, parties complémentaires et absence de répétitions.'),
  ('HGGSP_DISSERTATION_V3::P1.C.2::0', 'HGGSP_DISSERTATION_V3::P1.C.2', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.C.2::0.5', 'HGGSP_DISSERTATION_V3::P1.C.2', 0.5::numeric, 'fragile', 'Récitation du cours ou juxtaposition d''informations ; peu d''analyse.'),
  ('HGGSP_DISSERTATION_V3::P1.C.2::0.75', 'HGGSP_DISSERTATION_V3::P1.C.2', 0.75::numeric, 'fragile', 'Arguments présents mais démonstration irrégulière.'),
  ('HGGSP_DISSERTATION_V3::P1.C.2::1', 'HGGSP_DISSERTATION_V3::P1.C.2', 1::numeric, 'moyen', 'Arguments clairement expliqués ; relations de causalité, comparaison ou évolution correctement analysées.'),
  ('HGGSP_DISSERTATION_V3::P1.C.2::1.5', 'HGGSP_DISSERTATION_V3::P1.C.2', 1.5::numeric, 'tres_satisfaisant', 'Démonstration maîtrisée : les connaissances sont hiérarchisées, expliquées et constamment mises en relation avec la problématique.'),
  ('HGGSP_DISSERTATION_V3::P1.C.3::0', 'HGGSP_DISSERTATION_V3::P1.C.3', 0::numeric, 'nul', 'Exemples absents, faux ou sans utilité argumentative.'),
  ('HGGSP_DISSERTATION_V3::P1.C.3::0.25', 'HGGSP_DISSERTATION_V3::P1.C.3', 0.25::numeric, 'fragile', 'Quelques exemples pertinents mais principalement descriptifs.'),
  ('HGGSP_DISSERTATION_V3::P1.C.3::0.5', 'HGGSP_DISSERTATION_V3::P1.C.3', 0.5::numeric, 'tres_satisfaisant', 'Exemples précis, variés, datés/localisés lorsque pertinent, et réellement exploités pour démontrer.'),
  ('HGGSP_DISSERTATION_V3::P1.D.1::0', 'HGGSP_DISSERTATION_V3::P1.D.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.D.1::0.25', 'HGGSP_DISSERTATION_V3::P1.D.1', 0.25::numeric, 'fragile', 'Introduction lacunaire ; enjeux, problématique ou plan insuffisants.'),
  ('HGGSP_DISSERTATION_V3::P1.D.1::0.5', 'HGGSP_DISSERTATION_V3::P1.D.1', 0.5::numeric, 'moyen', 'Introduction structurée mais incomplète ou trop générale.'),
  ('HGGSP_DISSERTATION_V3::P1.D.1::0.75', 'HGGSP_DISSERTATION_V3::P1.D.1', 0.75::numeric, 'tres_satisfaisant', 'Introduction maîtrisée : contextualisation utile, enjeux, problématique et annonce claire du raisonnement.'),
  ('HGGSP_DISSERTATION_V3::P1.D.2::0', 'HGGSP_DISSERTATION_V3::P1.D.2', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.D.2::0.25', 'HGGSP_DISSERTATION_V3::P1.D.2', 0.25::numeric, 'fragile', 'Développement difficile à suivre et/ou conclusion absente ou sans réponse.'),
  ('HGGSP_DISSERTATION_V3::P1.D.2::0.5', 'HGGSP_DISSERTATION_V3::P1.D.2', 0.5::numeric, 'moyen', 'Développement organisé et conclusion présente mais réponse partielle.'),
  ('HGGSP_DISSERTATION_V3::P1.D.2::0.75', 'HGGSP_DISSERTATION_V3::P1.D.2', 0.75::numeric, 'tres_satisfaisant', 'Parties et paragraphes clairement structurés ; conclusion répondant explicitement à la problématique.'),
  ('HGGSP_DISSERTATION_V3::P1.E.1::0', 'HGGSP_DISSERTATION_V3::P1.E.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_DISSERTATION_V3::P1.E.1::0.25', 'HGGSP_DISSERTATION_V3::P1.E.1', 0.25::numeric, 'fragile', 'Expression souvent incorrecte ; vocabulaire imprécis.'),
  ('HGGSP_DISSERTATION_V3::P1.E.1::0.5', 'HGGSP_DISSERTATION_V3::P1.E.1', 0.5::numeric, 'moyen', 'Expression correcte mais plusieurs maladresses ou approximations.'),
  ('HGGSP_DISSERTATION_V3::P1.E.1::0.75', 'HGGSP_DISSERTATION_V3::P1.E.1', 0.75::numeric, 'tres_satisfaisant', 'Expression claire et précise ; vocabulaire historique, géographique et géopolitique maîtrisé.'),
  ('HGGSP_DISSERTATION_V3::P1.E.2::0', 'HGGSP_DISSERTATION_V3::P1.E.2', 0::numeric, 'nul', 'Copie difficilement lisible ou organisation très insuffisante.'),
  ('HGGSP_DISSERTATION_V3::P1.E.2::0.25', 'HGGSP_DISSERTATION_V3::P1.E.2', 0.25::numeric, 'tres_satisfaisant', 'Copie lisible, paragraphes identifiables et organisation permettant de suivre la démonstration.')
) as v (id, critere_id, points, niveau, description)
where exists (select 1 from public.grilles_redigees where id = 'HGGSP_DISSERTATION_V3' and statut in ('draft', 'calibrating'))
on conflict (id) do nothing;

-- HGGSP_ETUDE_CRITIQUE_V3 : 9 critères, /10
update public.grilles_redigees
set libelle        = 'HGGSP — Étude critique de document(s)',
    principe       = 'L’étude critique se juge sur trois gestes NETTEMENT SÉPARÉS : prélever, expliquer, critiquer. Un prélèvement exact est valorisé pour lui-même, même quand l’explication et la critique manquent. Grille du classeur de correction des professeurs, en neuf sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.',
    max_analytique = 10,
    max_officiel   = 10,
    garde_fous     = '["La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque score doit être justifié par des éléments localisables dans la copie. Le jugement du correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et calibré.","La note est la SOMME des réussites observées critère par critère. On ne part jamais du maximum pour retrancher les erreurs.","Une même faiblesse n’est comptée que dans UN critère. Ses conséquences ailleurs sont décrites, jamais sanctionnées une deuxième fois.","Chaque score est justifié par une citation réellement présente dans la transcription. Aucune citation n’est inventée ni reconstituée.","Aucun fait, aucune date, aucun acteur, aucun exemple absent de la copie ou du sujet n’est ajouté par le correcteur.","Aucun plan unique n’est imposé : tout plan pertinent qui répond à la problématique est recevable.","La neutralité politique est absolue : on évalue la démonstration, jamais l’opinion de l’élève.","Un doute de transcription n’est jamais transformé en erreur de l’élève : il déclenche une relecture humaine.","Les paliers sont ceux du classeur que coche le professeur. Le 0 est réservé à un critère où rien n’est exploitable ; le score se place au quart de point.","Prélever (B.2), expliquer par les connaissances (D) et critiquer (C.2) sont trois critères distincts : l’absence de critique ne fait jamais perdre les points du prélèvement.","Quand le sujet comporte deux documents, la confrontation est attendue — mais aucune opposition n’est imposée si les documents sont complémentaires."]'::jsonb,
    system_prompt  = 'Tu es correcteur d''HGGSP en terminale générale. Tu corriges une étude critique de document(s) d''après la grille ci-dessous, et rien d''autre.
L’étude critique se juge sur trois gestes NETTEMENT SÉPARÉS : prélever, expliquer, critiquer. Un prélèvement exact est valorisé pour lui-même, même quand l’explication et la critique manquent. Grille du classeur de correction des professeurs, en neuf sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.

ÉCHELLE
Tu notes sur l''échelle ANALYTIQUE de 10 points, critère par critère, au pas de 0,25 point. La conversion vers la note officielle sur 10 est faite APRÈS toi, automatiquement : ne la fais pas, ne la mentionne pas dans les scores.

COMMENT ATTRIBUER UN SCORE
Pour chaque critère : identifie le palier dont le descripteur correspond réellement à la copie, puis ajuste au quart de point à l''intérieur de ce palier. La note est la somme des réussites observées ; tu ne pars JAMAIS du maximum pour retrancher des erreurs.
Chaque score est justifié par au moins une citation EXACTE de la transcription. Une citation que tu ne peux pas recopier mot à mot depuis la copie ne doit pas être écrite.

GRILLE
• P2.A.1 — A. Compréhension du sujet et problématisation (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Consigne ou problématique mal comprise ; contresens sur le sujet.
  0.75 — Sujet compris mais problématique faible ou trop descriptive.
  1 — Problématique pertinente et adaptée aux documents.
  1.5 — Problématique précise, construite à partir du sujet, qui oriente effectivement toute l''étude critique.
• P2.B.1 — B. Compréhension et analyse du/des document(s) — 1. Identification et compréhension du sens (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Document mal compris ou contresens.
  0.5 — Sens général compris mais éléments importants négligés.
  0.75 — Sens général et informations principales correctement identifiés.
  1 — Compréhension fine : nature, auteur/acteur, contexte et message du document correctement appréhendés lorsque ces éléments sont disponibles.
• P2.B.2 — B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Paraphrase ou simple description du document.
  0.75 — Informations pertinentes sélectionnées mais hiérarchisation limitée.
  1 — Informations correctement sélectionnées, hiérarchisées et expliquées.
  1.5 — Analyse précise : informations majeures isolées, mises en relation et explicitées au regard de la problématique.
• P2.C.1 — C. Regard critique — 1. Mise en contexte et portée (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Contexte absent ou erroné.
  0.5 — Contexte présent mais superficiel.
  0.75 — Contexte pertinent permettant de mieux comprendre le document.
  1 — Contexte maîtrisé et utilisé pour expliquer la portée, les enjeux et/ou les limites du document.
• P2.C.2 — C. Regard critique — 2. Limites, biais, point de vue et portée (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Aucun recul critique ou critique générique (« document subjectif »).
  0.75 — Quelques limites identifiées mais peu démontrées.
  1 — Point de vue, objectif, biais ou limites correctement analysés.
  1.5 — Véritable étude critique : le document est confronté à son contexte, son auteur, sa nature, ses objectifs, ses silences et/ou ses limites.
• P2.D.1 — D. Mobilisation des connaissances personnelles (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Connaissances absentes ou hors sujet.
  0.5 — Quelques connaissances mais peu exploitées.
  1 — Connaissances pertinentes permettant d''éclairer ou de nuancer le document.
  1.5 — Connaissances précises et bien choisies, utilisées pour compléter, contextualiser, confirmer ou relativiser le document sans le remplacer.
• P2.E.1 — E. Organisation et maîtrise de l''exercice (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Réponse désorganisée ; introduction/conclusion très insuffisantes.
  0.5 — Organisation correcte mais transitions ou conclusion limitées.
  0.75 — Introduction problématisée, développement en paragraphes et conclusion répondant au sujet.
  1 — Organisation très claire et efficace : introduction, analyse structurée, transitions pertinentes et conclusion apportant une réponse nette.
• P2.F.1 — F. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Expression difficile à comprendre ou vocabulaire très imprécis.
  0.5 — Expression correcte mais maladroite ou parfois imprécise.
  0.75 — Expression claire, précise et vocabulaire disciplinaire maîtrisé.
• P2.F.2 — F. Expression et présentation — 2. Lisibilité et présentation (max 0.25)
  0 — Présentation rendant la lecture difficile.
  0.25 — Présentation lisible, paragraphes et organisation clairement identifiables.

ERREURS TYPES
Tu signales les erreurs observées avec les codes ci-dessous, et uniquement ceux-là. Une erreur n''est PAS une soustraction de points : elle explique pourquoi un niveau supérieur n''est pas atteint. Seuls les codes marqués « plafond » agissent mécaniquement sur le score, et le système les applique lui-même.
• HGGSP_TR_01 — Erreur factuelle secondaire : Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement. [critère : P2.D.1 ; impact : fourchette indicative 0–0.25]
   Conditions : L’erreur ne sert pas d’appui à un argument du développement.
• HGGSP_TR_02 — Erreur factuelle affectant un argument : Un fait inexact sur lequel repose un argument du développement. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
   Conditions : L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.
• HGGSP_TR_03 — Contresens central : Un contresens qui détruit une partie entière de la démonstration. [critère : P2.D.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Le contresens porte sur une notion ou un mécanisme central du sujet.
• HGGSP_TR_04 — Confusion de notions : Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation). [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_05 — Connaissances hors sujet : Développement exact mais qui ne traite pas le sujet posé. [critère : P2.D.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
   Conditions : Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.
• HGGSP_TR_06 — Opinion personnelle non démontrée : Un avis substitué à l’analyse, sans démonstration ni référence. [critère : P2.E.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_TR_07 — Confusion d’échelles : Échelles locale, nationale, régionale et mondiale traitées indifféremment. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_08 — Anachronisme : Une notion contemporaine projetée sur une autre époque. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_09 — Expression nuisant à la compréhension : Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos. [critère : P2.F.1 ; impact : fourchette indicative 0.25–1]
   Conditions : Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.
• HGGSP_TR_10 — Faute isolée sans effet sur la compréhension : Une coquille ou une faute ponctuelle qui ne gêne pas la lecture. [critère : P2.F.1 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Signalée à l’élève, elle ne fait perdre aucun point.
• HGGSP_TR_11 — Conclusion absente : Aucune conclusion ne répond explicitement à la problématique. [critère : P2.E.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_12 — Passage illisible ou transcription incertaine : Un passage de la copie n’a pas pu être lu avec certitude. [critère : aucun ; impact : aucune pénalité automatique avant relecture humaine]
   Conditions : Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.
• HGGSP_EC_01 — Paraphrase : Le document est reformulé ou recopié sans être expliqué ni critiqué. [critère : P2.C.2 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_EC_02 — Informations mal hiérarchisées : Détails secondaires traités comme des idées essentielles, ou inversement. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_EC_03 — Document non contextualisé : Le document n’est pas replacé dans son contexte historique ou géopolitique. [critère : P2.D.1 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_04 — Auteur ou source non interrogé : L’auteur ou l’institution productrice n’est ni identifié ni questionné. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_05 — Destinataire non identifié : Le destinataire du document n’est pas identifié alors qu’il éclaire son sens. [critère : P2.C.2 ; impact : fourchette indicative 0.25–0.5]
   Conditions : Ne s’applique que lorsque le destinataire est identifiable et pertinent.
• HGGSP_EC_06 — Intention non analysée : L’intention de l’auteur n’est jamais interrogée. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_07 — Point de vue non identifié : Le point de vue situé du document est pris pour un constat neutre. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_08 — Limites ou silences ignorés : Ce que le document ne dit pas n’est jamais interrogé. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_09 — Absence totale de mise à distance critique : Aucune critique explicite : ni nature, ni auteur, ni intention, ni portée, ni limites. [critère : P2.C.2 ; impact : plafond du critère à 0.75]
   Conditions : Le critère « Analyse critique » est plafonné à 50 % de son maximum, soit 2,5 / 5.
• HGGSP_EC_10 — Connaissances substituées au document : Le cours remplace le document au lieu de l’éclairer. [critère : P2.B.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_11 — Document utilisé sans citation ni localisation : Les informations sont attribuées au document sans citation ni renvoi précis. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_EC_12 — Deuxième document ignoré : Un des deux documents est absent ou presque absent de l’analyse. [critère : P2.B.2 ; impact : plafond du critère à 0.75]
   Conditions : Ne s’applique que si le sujet comporte réellement deux documents.
• HGGSP_EC_13 — Absence de confrontation : Deux analyses séparées, sans aucune mise en relation. [critère : P2.E.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Ne s’applique que si le sujet comporte deux documents et attend leur confrontation.
• HGGSP_EC_14 — Confrontation artificielle : Les documents sont opposés alors qu’ils sont complémentaires. [critère : P2.C.2 ; impact : fourchette indicative 0.25–0.5]
   Conditions : Aucune opposition n’est imposée : si les documents se complètent, il faut le dire.
• HGGSP_EC_15 — Confusion entre les documents ou les auteurs : Une citation ou un point de vue est attribué au mauvais document. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_EC_16 — Consigne partiellement traitée : Une dimension explicitement demandée par la consigne n’est jamais traitée. [critère : P2.A.1 ; impact : plafond du critère à 0.75]
   Conditions : La consigne comporte plusieurs volets et l’un d’eux est absent de la copie.

NON-DOUBLE-SANCTION
Pour chaque faiblesse, tu identifies l''erreur SOURCE et ses conséquences. Une conséquence porte source_error_id et is_consequence=true : elle est décrite, jamais comptée une seconde fois. Exemple : l''absence de problématique est comptée dans l''analyse du sujet ; l''argumentation reste évaluée sur son organisation réellement observable.

RELECTURE HUMAINE
Tu demandes une relecture humaine (human_review_required) si : la transcription est incertaine, un passage est illisible, tu soupçonnes un contresens sans certitude, une référence paraît fausse mais pourrait être une autre formulation recevable, le plan est original et sort des exemples de la grille, la copie est presque entièrement hors sujet, une production graphique ne peut pas être interprétée, une erreur majeure pourrait toucher plusieurs critères, ou ta confiance globale est insuffisante. Un doute de transcription n''est JAMAIS une erreur de l''élève.

PRÉLEVER, EXPLIQUER, CRITIQUER
Ces trois gestes sont notés dans TROIS critères distincts (« B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation » (P2.B.2), « D. Mobilisation des connaissances personnelles » (P2.D.1), « C. Regard critique — 2. Limites, biais, point de vue et portée » (P2.C.2)). Une copie qui prélève correctement mais n''explique ni ne critique garde ses points de prélèvement : tu ne mets jamais presque zéro à toute la partie documentaire au motif que la critique manque.',
    commentaire    = 'Grille du classeur de correction des professeurs (scripts/fixtures/guidelines/hggsp-v1-a-cocher.csv), même barème que le brouillon du 28 août. Active depuis la décision du 2026-09-29 (SQL 57).'
where id = 'HGGSP_ETUDE_CRITIQUE_V3' and statut in ('draft', 'calibrating');

delete from public.grille_descripteurs
where critere_id in (select id from public.grille_criteres where grille_id = 'HGGSP_ETUDE_CRITIQUE_V3')
  and exists (select 1 from public.grilles_redigees where id = 'HGGSP_ETUDE_CRITIQUE_V3' and statut in ('draft', 'calibrating'));

delete from public.grille_criteres
where grille_id = 'HGGSP_ETUDE_CRITIQUE_V3'
  and exists (select 1 from public.grilles_redigees where id = 'HGGSP_ETUDE_CRITIQUE_V3' and statut in ('draft', 'calibrating'));

insert into public.grille_criteres (id, grille_id, code, libelle, evaluer, max_points, ordre)
select v.id, v.grille_id, v.code, v.libelle, '[]'::jsonb, v.max_points, v.ordre
from (values
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.A.1', 'A. Compréhension du sujet et problématisation', 1.5::numeric, 1),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.B.1', 'B. Compréhension et analyse du/des document(s) — 1. Identification et compréhension du sens', 1::numeric, 2),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.B.2', 'B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation', 1.5::numeric, 3),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.C.1', 'C. Regard critique — 1. Mise en contexte et portée', 1::numeric, 4),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.C.2', 'C. Regard critique — 2. Limites, biais, point de vue et portée', 1.5::numeric, 5),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.D.1', 'D. Mobilisation des connaissances personnelles', 1.5::numeric, 6),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.E.1', 'E. Organisation et maîtrise de l''exercice', 1::numeric, 7),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.1', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.F.1', 'F. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire', 0.75::numeric, 8),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.2', 'HGGSP_ETUDE_CRITIQUE_V3', 'P2.F.2', 'F. Expression et présentation — 2. Lisibilité et présentation', 0.25::numeric, 9)
) as v (id, grille_id, code, libelle, max_points, ordre)
where exists (select 1 from public.grilles_redigees where id = 'HGGSP_ETUDE_CRITIQUE_V3' and statut in ('draft', 'calibrating'))
on conflict (id) do nothing;

insert into public.grille_descripteurs (id, critere_id, points, niveau, description)
select v.id, v.critere_id, v.points, v.niveau, v.description
from (values
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 0.5::numeric, 'fragile', 'Consigne ou problématique mal comprise ; contresens sur le sujet.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 0.75::numeric, 'fragile', 'Sujet compris mais problématique faible ou trop descriptive.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 1::numeric, 'moyen', 'Problématique pertinente et adaptée aux documents.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.A.1::1.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.A.1', 1.5::numeric, 'tres_satisfaisant', 'Problématique précise, construite à partir du sujet, qui oriente effectivement toute l''étude critique.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 0.25::numeric, 'insuffisant', 'Document mal compris ou contresens.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 0.5::numeric, 'fragile', 'Sens général compris mais éléments importants négligés.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 0.75::numeric, 'satisfaisant', 'Sens général et informations principales correctement identifiés.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.1::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.1', 1::numeric, 'tres_satisfaisant', 'Compréhension fine : nature, auteur/acteur, contexte et message du document correctement appréhendés lorsque ces éléments sont disponibles.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 0.5::numeric, 'fragile', 'Paraphrase ou simple description du document.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 0.75::numeric, 'fragile', 'Informations pertinentes sélectionnées mais hiérarchisation limitée.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 1::numeric, 'moyen', 'Informations correctement sélectionnées, hiérarchisées et expliquées.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.B.2::1.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.B.2', 1.5::numeric, 'tres_satisfaisant', 'Analyse précise : informations majeures isolées, mises en relation et explicitées au regard de la problématique.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 0.25::numeric, 'insuffisant', 'Contexte absent ou erroné.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 0.5::numeric, 'fragile', 'Contexte présent mais superficiel.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 0.75::numeric, 'satisfaisant', 'Contexte pertinent permettant de mieux comprendre le document.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.1::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.1', 1::numeric, 'tres_satisfaisant', 'Contexte maîtrisé et utilisé pour expliquer la portée, les enjeux et/ou les limites du document.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 0.5::numeric, 'fragile', 'Aucun recul critique ou critique générique (« document subjectif »).'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 0.75::numeric, 'fragile', 'Quelques limites identifiées mais peu démontrées.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 1::numeric, 'moyen', 'Point de vue, objectif, biais ou limites correctement analysés.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.C.2::1.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.C.2', 1.5::numeric, 'tres_satisfaisant', 'Véritable étude critique : le document est confronté à son contexte, son auteur, sa nature, ses objectifs, ses silences et/ou ses limites.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 0.25::numeric, 'insuffisant', 'Connaissances absentes ou hors sujet.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 0.5::numeric, 'fragile', 'Quelques connaissances mais peu exploitées.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 1::numeric, 'moyen', 'Connaissances pertinentes permettant d''éclairer ou de nuancer le document.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.D.1::1.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.D.1', 1.5::numeric, 'tres_satisfaisant', 'Connaissances précises et bien choisies, utilisées pour compléter, contextualiser, confirmer ou relativiser le document sans le remplacer.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 0.25::numeric, 'insuffisant', 'Réponse désorganisée ; introduction/conclusion très insuffisantes.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 0.5::numeric, 'fragile', 'Organisation correcte mais transitions ou conclusion limitées.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 0.75::numeric, 'satisfaisant', 'Introduction problématisée, développement en paragraphes et conclusion répondant au sujet.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.E.1::1', 'HGGSP_ETUDE_CRITIQUE_V3::P2.E.1', 1::numeric, 'tres_satisfaisant', 'Organisation très claire et efficace : introduction, analyse structurée, transitions pertinentes et conclusion apportant une réponse nette.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.1::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.1', 0::numeric, 'nul', 'Rien d''exploitable sur ce critère.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.1::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.1', 0.25::numeric, 'fragile', 'Expression difficile à comprendre ou vocabulaire très imprécis.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.1::0.5', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.1', 0.5::numeric, 'moyen', 'Expression correcte mais maladroite ou parfois imprécise.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.1::0.75', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.1', 0.75::numeric, 'tres_satisfaisant', 'Expression claire, précise et vocabulaire disciplinaire maîtrisé.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.2::0', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.2', 0::numeric, 'nul', 'Présentation rendant la lecture difficile.'),
  ('HGGSP_ETUDE_CRITIQUE_V3::P2.F.2::0.25', 'HGGSP_ETUDE_CRITIQUE_V3::P2.F.2', 0.25::numeric, 'tres_satisfaisant', 'Présentation lisible, paragraphes et organisation clairement identifiables.')
) as v (id, critere_id, points, niveau, description)
where exists (select 1 from public.grilles_redigees where id = 'HGGSP_ETUDE_CRITIQUE_V3' and statut in ('draft', 'calibrating'))
on conflict (id) do nothing;

-- 3. Les V2 sont archivées (jamais supprimées) ----------------------------
update public.grilles_redigees
set statut = 'archived'
where id in ('HGGSP_DISSERTATION_V2', 'HGGSP_ETUDE_CRITIQUE_V2')
  and statut <> 'archived';

-- 4. Les V3 sont verrouillées, contrôles compris ---------------------------
do $$
declare
  v_id text;
  v_res jsonb;
begin
  foreach v_id in array array['HGGSP_DISSERTATION_V3', 'HGGSP_ETUDE_CRITIQUE_V3'] loop
    v_res := public.grille_verrouiller(v_id, 'cindy — décision du 2026-09-29 (SQL 57)');
    if not (v_res ->> 'ok')::boolean then
      raise exception 'Verrouillage de % refusé : %', v_id, v_res;
    end if;
  end loop;
end;
$$;

-- 5. Les grilles de dépôt : V2 archivées PUIS V3 actives -------------------
--    (index one_active_rubric_per_matiere_exercise : une seule active)
update public.rubrics
set status = 'archived'
where id in ('HGGSP_DISSERTATION_V2', 'HGGSP_ETUDE_CRITIQUE_V2')
  and status <> 'archived';

insert into public.rubrics (
  id, track, matiere, exercise_type, version, status, system_prompt, rubric_json,
  moteur, grille_id, role, note_officielle, remplacee_par_bareme
)
values (
  'HGGSP_DISSERTATION_V3', 'generale', 'hggsp', 'hggsp_dissertation', 3, 'active',
  'Tu es correcteur d''HGGSP en terminale générale. Tu corriges une dissertation d''après la grille ci-dessous, et rien d''autre.
Une dissertation d’HGGSP se juge sur une démonstration : un sujet analysé, une tension problématisée, un plan qui progresse, des connaissances sélectionnées et des exemples précis qui prouvent. Grille du classeur de correction des professeurs, en onze sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.

ÉCHELLE
Tu notes sur l''échelle ANALYTIQUE de 10 points, critère par critère, au pas de 0,25 point. La conversion vers la note officielle sur 10 est faite APRÈS toi, automatiquement : ne la fais pas, ne la mentionne pas dans les scores.

COMMENT ATTRIBUER UN SCORE
Pour chaque critère : identifie le palier dont le descripteur correspond réellement à la copie, puis ajuste au quart de point à l''intérieur de ce palier. La note est la somme des réussites observées ; tu ne pars JAMAIS du maximum pour retrancher des erreurs.
Chaque score est justifié par au moins une citation EXACTE de la transcription. Une citation que tu ne peux pas recopier mot à mot depuis la copie ne doit pas être écrite.

GRILLE
• P1.A.1 — A. Compréhension et traitement du sujet — 1. Analyse du sujet et problématique (max 1.5)
  0 — Sujet non compris, contresens majeur ou hors-sujet.
  0.5 — Compréhension partielle ; termes ou bornes essentiels mal identifiés.
  1 — Sujet correctement compris ; enjeux identifiés ; problématique pertinente mais encore générale.
  1.5 — Analyse précise du sujet : termes, bornes, enjeux et tensions clairement dégagés ; problématique véritablement directrice.
• P1.A.2 — A. Compréhension et traitement du sujet — 2. Réponse au sujet (max 0.5)
  0 — La copie ne répond pas à la question posée ou dérive largement du sujet.
  0.25 — Réponse partielle ou irrégulièrement centrée sur le sujet.
  0.5 — Toute la démonstration est orientée vers une réponse explicite à la problématique.
• P1.B.1 — B. Maîtrise et sélection des connaissances — 1. Exactitude et précision des connaissances (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Connaissances faibles, générales ou comportant des erreurs importantes.
  0.75 — Connaissances globalement correctes mais plusieurs imprécisions.
  1 — Connaissances solides et précises sur les principaux éléments du sujet.
  1.5 — Connaissances très précises : dates, acteurs, lieux, concepts, événements et processus parfaitement maîtrisés.
• P1.B.2 — B. Maîtrise et sélection des connaissances — 2. Sélection et pertinence des connaissances (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Accumulation de connaissances sans rapport clair avec le sujet.
  0.5 — Connaissances pertinentes mais sélection encore imparfaite.
  0.75 — Bonne sélection ; les connaissances servent généralement la démonstration.
  1 — Sélection rigoureuse : chaque connaissance apporte une preuve, une explication ou une nuance utile au raisonnement.
• P1.C.1 — C. Construction de la démonstration — 1. Organisation du plan (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Plan artificiel, déséquilibré ou peu lié au sujet.
  0.5 — Plan identifiable mais progression limitée ou répétitive.
  0.75 — Plan logique, équilibré et adapté à la problématique.
  1 — Plan démonstratif très pertinent : progression logique, parties complémentaires et absence de répétitions.
• P1.C.2 — C. Construction de la démonstration — 2. Argumentation et capacités d''analyse (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Récitation du cours ou juxtaposition d''informations ; peu d''analyse.
  0.75 — Arguments présents mais démonstration irrégulière.
  1 — Arguments clairement expliqués ; relations de causalité, comparaison ou évolution correctement analysées.
  1.5 — Démonstration maîtrisée : les connaissances sont hiérarchisées, expliquées et constamment mises en relation avec la problématique.
• P1.C.3 — C. Construction de la démonstration — 3. Exemples et illustrations (max 0.5)
  0 — Exemples absents, faux ou sans utilité argumentative.
  0.25 — Quelques exemples pertinents mais principalement descriptifs.
  0.5 — Exemples précis, variés, datés/localisés lorsque pertinent, et réellement exploités pour démontrer.
• P1.D.1 — D. Maîtrise de l''exercice — 1. Introduction (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Introduction lacunaire ; enjeux, problématique ou plan insuffisants.
  0.5 — Introduction structurée mais incomplète ou trop générale.
  0.75 — Introduction maîtrisée : contextualisation utile, enjeux, problématique et annonce claire du raisonnement.
• P1.D.2 — D. Maîtrise de l''exercice — 2. Développement et conclusion (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Développement difficile à suivre et/ou conclusion absente ou sans réponse.
  0.5 — Développement organisé et conclusion présente mais réponse partielle.
  0.75 — Parties et paragraphes clairement structurés ; conclusion répondant explicitement à la problématique.
• P1.E.1 — E. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire disciplinaire (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Expression souvent incorrecte ; vocabulaire imprécis.
  0.5 — Expression correcte mais plusieurs maladresses ou approximations.
  0.75 — Expression claire et précise ; vocabulaire historique, géographique et géopolitique maîtrisé.
• P1.E.2 — E. Expression et présentation — 2. Lisibilité et présentation (max 0.25)
  0 — Copie difficilement lisible ou organisation très insuffisante.
  0.25 — Copie lisible, paragraphes identifiables et organisation permettant de suivre la démonstration.

ERREURS TYPES
Tu signales les erreurs observées avec les codes ci-dessous, et uniquement ceux-là. Une erreur n''est PAS une soustraction de points : elle explique pourquoi un niveau supérieur n''est pas atteint. Seuls les codes marqués « plafond » agissent mécaniquement sur le score, et le système les applique lui-même.
• HGGSP_TR_01 — Erreur factuelle secondaire : Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement. [critère : P1.B.1 ; impact : fourchette indicative 0–0.25]
   Conditions : L’erreur ne sert pas d’appui à un argument du développement.
• HGGSP_TR_02 — Erreur factuelle affectant un argument : Un fait inexact sur lequel repose un argument du développement. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
   Conditions : L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.
• HGGSP_TR_03 — Contresens central : Un contresens qui détruit une partie entière de la démonstration. [critère : P1.B.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Le contresens porte sur une notion ou un mécanisme central du sujet.
• HGGSP_TR_04 — Confusion de notions : Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation). [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_05 — Connaissances hors sujet : Développement exact mais qui ne traite pas le sujet posé. [critère : P1.B.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
   Conditions : Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.
• HGGSP_TR_06 — Opinion personnelle non démontrée : Un avis substitué à l’analyse, sans démonstration ni référence. [critère : P1.C.2 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_TR_07 — Confusion d’échelles : Échelles locale, nationale, régionale et mondiale traitées indifféremment. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_08 — Anachronisme : Une notion contemporaine projetée sur une autre époque. [critère : P1.B.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_09 — Expression nuisant à la compréhension : Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos. [critère : P1.E.1 ; impact : fourchette indicative 0.25–1]
   Conditions : Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.
• HGGSP_TR_10 — Faute isolée sans effet sur la compréhension : Une coquille ou une faute ponctuelle qui ne gêne pas la lecture. [critère : P1.E.1 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Signalée à l’élève, elle ne fait perdre aucun point.
• HGGSP_TR_11 — Conclusion absente : Aucune conclusion ne répond explicitement à la problématique. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_12 — Passage illisible ou transcription incertaine : Un passage de la copie n’a pas pu être lu avec certitude. [critère : aucun ; impact : aucune pénalité automatique avant relecture humaine]
   Conditions : Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.
• HGGSP_DIS_01 — Mauvaise analyse des termes du sujet : Un ou plusieurs mots du sujet ne sont pas compris ou sont laissés de côté. [critère : P1.A.1 ; impact : fourchette indicative 0.5–1.5]
• HGGSP_DIS_02 — Bornes du sujet ignorées : Les bornes chronologiques, spatiales ou notionnelles du sujet ne sont pas tenues. [critère : P1.A.1 ; impact : fourchette indicative 0.25–1]
• HGGSP_DIS_03 — Notion centrale non définie : La notion au cœur du sujet n’est jamais définie. [critère : P1.A.1 ; impact : plafond du critère à 1]
   Conditions : Aucune pénalité fixe. Le plafond ne s’applique que si cette absence nuit réellement à la compréhension du sujet.
• HGGSP_DIS_04 — Cours récité : Le cours est restitué intégralement, sans sélection en fonction du sujet. [critère : P1.B.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_DIS_05 — Problématique absente : Aucune problématique explicite dans l’introduction. [critère : P1.A.1 ; impact : plafond du critère à 0.25]
   Conditions : Le critère est plafonné au niveau insuffisant.
• HGGSP_DIS_06 — Problématique descriptive : La problématique reformule le sujet sans créer de tension. [critère : P1.A.1 ; impact : plafond du critère à 0.75]
   Conditions : Exception : si le développement construit en réalité un fil directeur plus solide que la formulation initiale, le plafond ne s’applique pas — le correcteur doit alors le dire explicitement.
• HGGSP_DIS_07 — Plan non annoncé : L’introduction n’annonce pas le plan, alors que le développement en suit un. [critère : P1.C.2 ; impact : fourchette indicative 0–0.25]
   Conditions : Impact faible et purement méthodologique si le plan réel est clair et cohérent.
• HGGSP_DIS_08 — Plan annoncé mais non respecté : Le développement ne suit pas le plan annoncé. [critère : P1.C.2 ; impact : fourchette indicative 0–0.5]
   Conditions : On évalue la cohérence réelle du développement : si la modification améliore finalement la démonstration, aucun point n’est retiré.
• HGGSP_DIS_09 — Plan déséquilibré : Une partie est très courte, redondante ou sans transition. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_DIS_10 — Plan non pertinent : Le plan ne permet pas de répondre à la problématique posée. [critère : P1.C.2 ; impact : fourchette indicative 0.5–1.5]
   Conditions : Aucun plan type n’est exigé : seule l’adéquation plan / problématique est jugée.
• HGGSP_DIS_11 — Exemple seulement cité : Un exemple est nommé mais jamais analysé ni relié à l’argument. [critère : P1.C.3 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_DIS_12 — Exemples insuffisamment précis : Exemples sans date, sans acteur identifié ou sans localisation. [critère : P1.C.3 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_DIS_13 — Absence de sélection des connaissances : Tout est mis, rien n’est trié en fonction du sujet. [critère : P1.B.1 ; impact : fourchette indicative 0.5–1]
• HGGSP_DIS_14 — Réponse finale insuffisante : La conclusion existe mais ne répond pas vraiment à la problématique. [critère : P1.C.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_DIS_15 — Production graphique décorative ou erronée : Un croquis ou schéma sans rapport avec la démonstration, ou porteur d’une erreur. [critère : P1.C.3 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Une production graphique pertinente VALORISE la construction ou les exemples, dans la limite du maximum du critère. Son absence ne pénalise jamais. Si la production ne peut pas être interprétée, une relecture humaine est demandée.

NON-DOUBLE-SANCTION
Pour chaque faiblesse, tu identifies l''erreur SOURCE et ses conséquences. Une conséquence porte source_error_id et is_consequence=true : elle est décrite, jamais comptée une seconde fois. Exemple : l''absence de problématique est comptée dans l''analyse du sujet ; l''argumentation reste évaluée sur son organisation réellement observable.

RELECTURE HUMAINE
Tu demandes une relecture humaine (human_review_required) si : la transcription est incertaine, un passage est illisible, tu soupçonnes un contresens sans certitude, une référence paraît fausse mais pourrait être une autre formulation recevable, le plan est original et sort des exemples de la grille, la copie est presque entièrement hors sujet, une production graphique ne peut pas être interprétée, une erreur majeure pourrait toucher plusieurs critères, ou ta confiance globale est insuffisante. Un doute de transcription n''est JAMAIS une erreur de l''élève.

PRODUCTION GRAPHIQUE (facultative)
Depuis la session 2026, une illustration pertinente (croquis, schéma) peut valoriser « C. Construction de la démonstration — 2. Argumentation et capacités d''analyse » (P1.C.2) ou « C. Construction de la démonstration — 3. Exemples et illustrations » (P1.C.3), sans dépasser le maximum du critère. Son absence ne pénalise jamais. Une production décorative ou sans rapport n''est pas valorisée. Si tu ne peux pas l''interpréter, demande une relecture humaine. Renseigne production_graphique.',
  '{"principle":"Une dissertation d’HGGSP se juge sur une démonstration : un sujet analysé, une tension problématisée, un plan qui progresse, des connaissances sélectionnées et des exemples précis qui prouvent. Grille du classeur de correction des professeurs, en onze sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.","maximum_score":10,"official_maximum_score":10,"conversion":"note_officielle_exercice = note_analytique (grille sur 10) ; note_finale = officielle(dissertation) + officielle(etude critique)","exam_formats":["full_exam","dissertation_only","document_study_only"],"criteria":[{"code":"P1.A.1","name":"A. Compréhension et traitement du sujet — 1. Analyse du sujet et problématique","maximum_score":1.5,"description":"","levels":{"0":"Sujet non compris, contresens majeur ou hors-sujet.","1":"Sujet correctement compris ; enjeux identifiés ; problématique pertinente mais encore générale.","0.5":"Compréhension partielle ; termes ou bornes essentiels mal identifiés.","1.5":"Analyse précise du sujet : termes, bornes, enjeux et tensions clairement dégagés ; problématique véritablement directrice."}},{"code":"P1.A.2","name":"A. Compréhension et traitement du sujet — 2. Réponse au sujet","maximum_score":0.5,"description":"","levels":{"0":"La copie ne répond pas à la question posée ou dérive largement du sujet.","0.25":"Réponse partielle ou irrégulièrement centrée sur le sujet.","0.5":"Toute la démonstration est orientée vers une réponse explicite à la problématique."}},{"code":"P1.B.1","name":"B. Maîtrise et sélection des connaissances — 1. Exactitude et précision des connaissances","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Connaissances solides et précises sur les principaux éléments du sujet.","0.5":"Connaissances faibles, générales ou comportant des erreurs importantes.","0.75":"Connaissances globalement correctes mais plusieurs imprécisions.","1.5":"Connaissances très précises : dates, acteurs, lieux, concepts, événements et processus parfaitement maîtrisés."}},{"code":"P1.B.2","name":"B. Maîtrise et sélection des connaissances — 2. Sélection et pertinence des connaissances","maximum_score":1,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Sélection rigoureuse : chaque connaissance apporte une preuve, une explication ou une nuance utile au raisonnement.","0.25":"Accumulation de connaissances sans rapport clair avec le sujet.","0.5":"Connaissances pertinentes mais sélection encore imparfaite.","0.75":"Bonne sélection ; les connaissances servent généralement la démonstration."}},{"code":"P1.C.1","name":"C. Construction de la démonstration — 1. Organisation du plan","maximum_score":1,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Plan démonstratif très pertinent : progression logique, parties complémentaires et absence de répétitions.","0.25":"Plan artificiel, déséquilibré ou peu lié au sujet.","0.5":"Plan identifiable mais progression limitée ou répétitive.","0.75":"Plan logique, équilibré et adapté à la problématique."}},{"code":"P1.C.2","name":"C. Construction de la démonstration — 2. Argumentation et capacités d''analyse","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Arguments clairement expliqués ; relations de causalité, comparaison ou évolution correctement analysées.","0.5":"Récitation du cours ou juxtaposition d''informations ; peu d''analyse.","0.75":"Arguments présents mais démonstration irrégulière.","1.5":"Démonstration maîtrisée : les connaissances sont hiérarchisées, expliquées et constamment mises en relation avec la problématique."}},{"code":"P1.C.3","name":"C. Construction de la démonstration — 3. Exemples et illustrations","maximum_score":0.5,"description":"","levels":{"0":"Exemples absents, faux ou sans utilité argumentative.","0.25":"Quelques exemples pertinents mais principalement descriptifs.","0.5":"Exemples précis, variés, datés/localisés lorsque pertinent, et réellement exploités pour démontrer."}},{"code":"P1.D.1","name":"D. Maîtrise de l''exercice — 1. Introduction","maximum_score":0.75,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","0.25":"Introduction lacunaire ; enjeux, problématique ou plan insuffisants.","0.5":"Introduction structurée mais incomplète ou trop générale.","0.75":"Introduction maîtrisée : contextualisation utile, enjeux, problématique et annonce claire du raisonnement."}},{"code":"P1.D.2","name":"D. Maîtrise de l''exercice — 2. Développement et conclusion","maximum_score":0.75,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","0.25":"Développement difficile à suivre et/ou conclusion absente ou sans réponse.","0.5":"Développement organisé et conclusion présente mais réponse partielle.","0.75":"Parties et paragraphes clairement structurés ; conclusion répondant explicitement à la problématique."}},{"code":"P1.E.1","name":"E. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire disciplinaire","maximum_score":0.75,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","0.25":"Expression souvent incorrecte ; vocabulaire imprécis.","0.5":"Expression correcte mais plusieurs maladresses ou approximations.","0.75":"Expression claire et précise ; vocabulaire historique, géographique et géopolitique maîtrisé."}},{"code":"P1.E.2","name":"E. Expression et présentation — 2. Lisibilité et présentation","maximum_score":0.25,"description":"","levels":{"0":"Copie difficilement lisible ou organisation très insuffisante.","0.25":"Copie lisible, paragraphes identifiables et organisation permettant de suivre la démonstration."}}],"guardrails":["La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque score doit être justifié par des éléments localisables dans la copie. Le jugement du correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et calibré.","La note est la SOMME des réussites observées critère par critère. On ne part jamais du maximum pour retrancher les erreurs.","Une même faiblesse n’est comptée que dans UN critère. Ses conséquences ailleurs sont décrites, jamais sanctionnées une deuxième fois.","Chaque score est justifié par une citation réellement présente dans la transcription. Aucune citation n’est inventée ni reconstituée.","Aucun fait, aucune date, aucun acteur, aucun exemple absent de la copie ou du sujet n’est ajouté par le correcteur.","Aucun plan unique n’est imposé : tout plan pertinent qui répond à la problématique est recevable.","La neutralité politique est absolue : on évalue la démonstration, jamais l’opinion de l’élève.","Un doute de transcription n’est jamais transformé en erreur de l’élève : il déclenche une relecture humaine.","Les paliers sont ceux du classeur que coche le professeur. Le 0 est réservé à un critère où rien n’est exploitable ; le score se place au quart de point.","Une production graphique pertinente (croquis, schéma) peut valoriser « C. Construction de la démonstration — 2. Argumentation et capacités d’analyse » ou « 3. Exemples et illustrations », dans la limite du maximum du critère. Son absence ne pénalise jamais."],"source_status":"classeur_profs_hggsp_v1_a_cocher","official_basis":"Note de service MENE2521923N (BO n° 33, 2025) : epreuve ecrite de specialite HGGSP = une dissertation sur 10 et une etude critique de document(s) sur 10, total sur 20.","common_error_taxonomy":[{"code":"HGGSP_TR_01","category":"transversale","severity":"mineure","description":"Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0,"impact_max":0.25,"criterion_cap":null,"criterion_level_cap":null,"conditions":"L’erreur ne sert pas d’appui à un argument du développement.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Une inexactitude ponctuelle : elle ne casse pas ta démonstration, mais vérifie tes repères.","human_review_required":false},{"code":"HGGSP_TR_02","category":"transversale","severity":"moderee","description":"Un fait inexact sur lequel repose un argument du développement.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.","no_double_penalty":"Comptée dans les connaissances. Si l’exemple porteur de cette erreur est par ailleurs jugé non exploité, l’erreur factuelle n’est pas retirée une deuxième fois dans « Exemples ».","student_message":"Ce fait est inexact et c’est lui qui portait ton argument : vérifie-le avant de t’appuyer dessus.","human_review_required":false},{"code":"HGGSP_TR_03","category":"transversale","severity":"majeure","description":"Un contresens qui détruit une partie entière de la démonstration.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Le contresens porte sur une notion ou un mécanisme central du sujet.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ce contresens fait tomber toute une partie : reprends la notion avant de refaire le devoir.","human_review_required":true},{"code":"HGGSP_TR_04","category":"transversale","severity":"moderee","description":"Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation).","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ces deux notions ne disent pas la même chose : définis-les avant de les employer.","human_review_required":false},{"code":"HGGSP_TR_05","category":"transversale","severity":"majeure","description":"Développement exact mais qui ne traite pas le sujet posé.","criterion":"P1.B.1","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.","no_double_penalty":"Les connaissances hors sujet ne rapportent simplement pas de points. Aucune pénalité supplémentaire n’est ajoutée par ailleurs.","student_message":"C’est juste, mais ça ne répond pas à la question posée : ces développements ne rapportent rien.","human_review_required":false},{"code":"HGGSP_TR_06","category":"transversale","severity":"moderee","description":"Un avis substitué à l’analyse, sans démonstration ni référence.","criterion":"P1.C.2","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ton avis ne vaut que s’il est démontré : appuie-le sur des faits et des exemples.","human_review_required":false},{"code":"HGGSP_TR_07","category":"transversale","severity":"moderee","description":"Échelles locale, nationale, régionale et mondiale traitées indifféremment.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Précise à quelle échelle tu raisonnes : le sens de ton argument en dépend.","human_review_required":false},{"code":"HGGSP_TR_08","category":"transversale","severity":"moderee","description":"Une notion contemporaine projetée sur une autre époque.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Cette notion n’existait pas à cette époque : situe-la dans son temps.","human_review_required":false},{"code":"HGGSP_TR_09","category":"transversale","severity":"moderee","description":"Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos.","criterion":"P1.E.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Certaines phrases ne se comprennent pas : relis-toi à voix haute pour repérer les ruptures.","human_review_required":false},{"code":"HGGSP_TR_10","category":"transversale","severity":"mineure","description":"Une coquille ou une faute ponctuelle qui ne gêne pas la lecture.","criterion":"P1.E.1","impact_type":"informational_only","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Signalée à l’élève, elle ne fait perdre aucun point.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Petite coquille sans conséquence sur ta note : un dernier relecture la ferait disparaître.","human_review_required":false},{"code":"HGGSP_TR_11","category":"transversale","severity":"moderee","description":"Aucune conclusion ne répond explicitement à la problématique.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Comptée une seule fois dans la construction / l’organisation. Aucune seconde pénalité ailleurs pour la même absence.","student_message":"Ta copie s’arrête sans répondre : une conclusion, même courte, doit trancher la question posée.","human_review_required":false},{"code":"HGGSP_TR_12","category":"transversale","severity":"majeure","description":"Un passage de la copie n’a pas pu être lu avec certitude.","impact_type":"human_review_required","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.","no_double_penalty":"Aucune pénalité automatique n’est appliquée sur ce motif.","student_message":"Un passage n’a pas pu être lu : ta copie est vérifiée par un professeur avant d’être rendue.","human_review_required":true},{"code":"HGGSP_DIS_01","category":"dissertation","severity":"majeure","description":"Un ou plusieurs mots du sujet ne sont pas compris ou sont laissés de côté.","criterion":"P1.A.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Chaque mot du sujet compte : analyse-les un par un avant de rédiger.","human_review_required":false},{"code":"HGGSP_DIS_02","category":"dissertation","severity":"moderee","description":"Les bornes chronologiques, spatiales ou notionnelles du sujet ne sont pas tenues.","criterion":"P1.A.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Le sujet fixe un cadre (dates, espaces, notions) : tout ce qui en sort ne compte pas.","human_review_required":false},{"code":"HGGSP_DIS_03","category":"dissertation","severity":"moderee","description":"La notion au cœur du sujet n’est jamais définie.","criterion":"P1.A.1","impact_type":"criterion_level_cap","impact_min":null,"impact_max":null,"criterion_cap":1,"criterion_level_cap":null,"conditions":"Aucune pénalité fixe. Le plafond ne s’applique que si cette absence nuit réellement à la compréhension du sujet.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Définis la notion centrale en introduction : sans elle, ton devoir avance sans repère.","human_review_required":false},{"code":"HGGSP_DIS_04","category":"dissertation","severity":"moderee","description":"Le cours est restitué intégralement, sans sélection en fonction du sujet.","criterion":"P1.B.1","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Le cours récité ne produit pas les points de sélection ; aucune pénalité supplémentaire n’est ajoutée dans l’argumentation.","student_message":"Tu sais ton cours : il faut maintenant n’en garder que ce qui répond au sujet.","human_review_required":false},{"code":"HGGSP_DIS_05","category":"dissertation","severity":"majeure","description":"Aucune problématique explicite dans l’introduction.","criterion":"P1.A.1","impact_type":"criterion_level_cap","impact_min":null,"impact_max":null,"criterion_cap":0.25,"criterion_level_cap":null,"conditions":"Le critère est plafonné au niveau insuffisant.","no_double_penalty":"L’absence elle-même est comptée ici, une seule fois. L’argumentation reste évaluée sur son organisation réellement observable, sans pénalité automatique supplémentaire.","student_message":"Il manque la question à laquelle ton devoir répond : formule-la explicitement en introduction.","human_review_required":false},{"code":"HGGSP_DIS_06","category":"dissertation","severity":"moderee","description":"La problématique reformule le sujet sans créer de tension.","criterion":"P1.A.1","impact_type":"criterion_level_cap","impact_min":null,"impact_max":null,"criterion_cap":0.75,"criterion_level_cap":null,"conditions":"Exception : si le développement construit en réalité un fil directeur plus solide que la formulation initiale, le plafond ne s’applique pas — le correcteur doit alors le dire explicitement.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ta question reformule le sujet : cherche la tension, ce qui fait vraiment débat.","human_review_required":false},{"code":"HGGSP_DIS_07","category":"dissertation","severity":"mineure","description":"L’introduction n’annonce pas le plan, alors que le développement en suit un.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0,"impact_max":0.25,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Impact faible et purement méthodologique si le plan réel est clair et cohérent.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Annonce ton plan en fin d’introduction : le correcteur doit savoir où tu l’emmènes.","human_review_required":false},{"code":"HGGSP_DIS_08","category":"dissertation","severity":"moderee","description":"Le développement ne suit pas le plan annoncé.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"On évalue la cohérence réelle du développement : si la modification améliore finalement la démonstration, aucun point n’est retiré.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ce que tu annonces et ce que tu fais doivent coïncider — ou alors annonce ce que tu fais vraiment.","human_review_required":false},{"code":"HGGSP_DIS_09","category":"dissertation","severity":"mineure","description":"Une partie est très courte, redondante ou sans transition.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Tes parties doivent peser à peu près autant : une partie expédiée se voit tout de suite.","human_review_required":false},{"code":"HGGSP_DIS_10","category":"dissertation","severity":"majeure","description":"Le plan ne permet pas de répondre à la problématique posée.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Aucun plan type n’est exigé : seule l’adéquation plan / problématique est jugée.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ton plan n’attaque pas la question posée : construis-le à partir de ta problématique.","human_review_required":false},{"code":"HGGSP_DIS_11","category":"dissertation","severity":"moderee","description":"Un exemple est nommé mais jamais analysé ni relié à l’argument.","criterion":"P1.C.3","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"L’exemple peut attester une connaissance et être valorisé à ce titre. Il ne reçoit simplement pas les points d’exploitation — et aucune pénalité supplémentaire n’est retirée après ce refus.","student_message":"Citer un exemple ne suffit pas : montre ce qu’il prouve, précisément.","human_review_required":false},{"code":"HGGSP_DIS_12","category":"dissertation","severity":"moderee","description":"Exemples sans date, sans acteur identifié ou sans localisation.","criterion":"P1.C.3","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.75,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Un exemple précis, c’est une date, un lieu, des acteurs. Ajoute-les.","human_review_required":false},{"code":"HGGSP_DIS_13","category":"dissertation","severity":"moderee","description":"Tout est mis, rien n’est trié en fonction du sujet.","criterion":"P1.B.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Trier, c’est déjà démontrer : garde ce qui sert la question, laisse le reste.","human_review_required":false},{"code":"HGGSP_DIS_14","category":"dissertation","severity":"moderee","description":"La conclusion existe mais ne répond pas vraiment à la problématique.","criterion":"P1.C.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Ne se cumule pas avec HGGSP_TR_11 (conclusion absente) : soit la conclusion manque, soit elle est insuffisante.","student_message":"Ta conclusion résume au lieu de répondre : tranche la question, en une phrase claire.","human_review_required":false},{"code":"HGGSP_DIS_15","category":"dissertation","severity":"mineure","description":"Un croquis ou schéma sans rapport avec la démonstration, ou porteur d’une erreur.","criterion":"P1.C.3","impact_type":"informational_only","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Une production graphique pertinente VALORISE la construction ou les exemples, dans la limite du maximum du critère. Son absence ne pénalise jamais. Si la production ne peut pas être interprétée, une relecture humaine est demandée.","no_double_penalty":"Une production graphique non valorisée ne fait perdre aucun point : elle est seulement écartée du calcul.","student_message":"Un croquis n’a de valeur que s’il démontre quelque chose : légende-le et relie-le à ton argument.","human_review_required":false}]}'::jsonb,
  'criteres_rediges', 'HGGSP_DISSERTATION_V3', 'note_officielle', true, false
)
on conflict (id) do update
set status        = 'active',
    system_prompt = excluded.system_prompt,
    rubric_json   = excluded.rubric_json,
    moteur        = excluded.moteur,
    grille_id     = excluded.grille_id;

insert into public.rubrics (
  id, track, matiere, exercise_type, version, status, system_prompt, rubric_json,
  moteur, grille_id, role, note_officielle, remplacee_par_bareme
)
values (
  'HGGSP_ETUDE_CRITIQUE_V3', 'generale', 'hggsp', 'hggsp_etude_critique', 3, 'active',
  'Tu es correcteur d''HGGSP en terminale générale. Tu corriges une étude critique de document(s) d''après la grille ci-dessous, et rien d''autre.
L’étude critique se juge sur trois gestes NETTEMENT SÉPARÉS : prélever, expliquer, critiquer. Un prélèvement exact est valorisé pour lui-même, même quand l’explication et la critique manquent. Grille du classeur de correction des professeurs, en neuf sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.

ÉCHELLE
Tu notes sur l''échelle ANALYTIQUE de 10 points, critère par critère, au pas de 0,25 point. La conversion vers la note officielle sur 10 est faite APRÈS toi, automatiquement : ne la fais pas, ne la mentionne pas dans les scores.

COMMENT ATTRIBUER UN SCORE
Pour chaque critère : identifie le palier dont le descripteur correspond réellement à la copie, puis ajuste au quart de point à l''intérieur de ce palier. La note est la somme des réussites observées ; tu ne pars JAMAIS du maximum pour retrancher des erreurs.
Chaque score est justifié par au moins une citation EXACTE de la transcription. Une citation que tu ne peux pas recopier mot à mot depuis la copie ne doit pas être écrite.

GRILLE
• P2.A.1 — A. Compréhension du sujet et problématisation (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Consigne ou problématique mal comprise ; contresens sur le sujet.
  0.75 — Sujet compris mais problématique faible ou trop descriptive.
  1 — Problématique pertinente et adaptée aux documents.
  1.5 — Problématique précise, construite à partir du sujet, qui oriente effectivement toute l''étude critique.
• P2.B.1 — B. Compréhension et analyse du/des document(s) — 1. Identification et compréhension du sens (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Document mal compris ou contresens.
  0.5 — Sens général compris mais éléments importants négligés.
  0.75 — Sens général et informations principales correctement identifiés.
  1 — Compréhension fine : nature, auteur/acteur, contexte et message du document correctement appréhendés lorsque ces éléments sont disponibles.
• P2.B.2 — B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Paraphrase ou simple description du document.
  0.75 — Informations pertinentes sélectionnées mais hiérarchisation limitée.
  1 — Informations correctement sélectionnées, hiérarchisées et expliquées.
  1.5 — Analyse précise : informations majeures isolées, mises en relation et explicitées au regard de la problématique.
• P2.C.1 — C. Regard critique — 1. Mise en contexte et portée (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Contexte absent ou erroné.
  0.5 — Contexte présent mais superficiel.
  0.75 — Contexte pertinent permettant de mieux comprendre le document.
  1 — Contexte maîtrisé et utilisé pour expliquer la portée, les enjeux et/ou les limites du document.
• P2.C.2 — C. Regard critique — 2. Limites, biais, point de vue et portée (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.5 — Aucun recul critique ou critique générique (« document subjectif »).
  0.75 — Quelques limites identifiées mais peu démontrées.
  1 — Point de vue, objectif, biais ou limites correctement analysés.
  1.5 — Véritable étude critique : le document est confronté à son contexte, son auteur, sa nature, ses objectifs, ses silences et/ou ses limites.
• P2.D.1 — D. Mobilisation des connaissances personnelles (max 1.5)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Connaissances absentes ou hors sujet.
  0.5 — Quelques connaissances mais peu exploitées.
  1 — Connaissances pertinentes permettant d''éclairer ou de nuancer le document.
  1.5 — Connaissances précises et bien choisies, utilisées pour compléter, contextualiser, confirmer ou relativiser le document sans le remplacer.
• P2.E.1 — E. Organisation et maîtrise de l''exercice (max 1)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Réponse désorganisée ; introduction/conclusion très insuffisantes.
  0.5 — Organisation correcte mais transitions ou conclusion limitées.
  0.75 — Introduction problématisée, développement en paragraphes et conclusion répondant au sujet.
  1 — Organisation très claire et efficace : introduction, analyse structurée, transitions pertinentes et conclusion apportant une réponse nette.
• P2.F.1 — F. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire (max 0.75)
  0 — Rien d''exploitable sur ce critère.
  0.25 — Expression difficile à comprendre ou vocabulaire très imprécis.
  0.5 — Expression correcte mais maladroite ou parfois imprécise.
  0.75 — Expression claire, précise et vocabulaire disciplinaire maîtrisé.
• P2.F.2 — F. Expression et présentation — 2. Lisibilité et présentation (max 0.25)
  0 — Présentation rendant la lecture difficile.
  0.25 — Présentation lisible, paragraphes et organisation clairement identifiables.

ERREURS TYPES
Tu signales les erreurs observées avec les codes ci-dessous, et uniquement ceux-là. Une erreur n''est PAS une soustraction de points : elle explique pourquoi un niveau supérieur n''est pas atteint. Seuls les codes marqués « plafond » agissent mécaniquement sur le score, et le système les applique lui-même.
• HGGSP_TR_01 — Erreur factuelle secondaire : Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement. [critère : P2.D.1 ; impact : fourchette indicative 0–0.25]
   Conditions : L’erreur ne sert pas d’appui à un argument du développement.
• HGGSP_TR_02 — Erreur factuelle affectant un argument : Un fait inexact sur lequel repose un argument du développement. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
   Conditions : L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.
• HGGSP_TR_03 — Contresens central : Un contresens qui détruit une partie entière de la démonstration. [critère : P2.D.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Le contresens porte sur une notion ou un mécanisme central du sujet.
• HGGSP_TR_04 — Confusion de notions : Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation). [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_05 — Connaissances hors sujet : Développement exact mais qui ne traite pas le sujet posé. [critère : P2.D.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
   Conditions : Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.
• HGGSP_TR_06 — Opinion personnelle non démontrée : Un avis substitué à l’analyse, sans démonstration ni référence. [critère : P2.E.1 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_TR_07 — Confusion d’échelles : Échelles locale, nationale, régionale et mondiale traitées indifféremment. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_08 — Anachronisme : Une notion contemporaine projetée sur une autre époque. [critère : P2.D.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_09 — Expression nuisant à la compréhension : Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos. [critère : P2.F.1 ; impact : fourchette indicative 0.25–1]
   Conditions : Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.
• HGGSP_TR_10 — Faute isolée sans effet sur la compréhension : Une coquille ou une faute ponctuelle qui ne gêne pas la lecture. [critère : P2.F.1 ; impact : signalée à l’élève, sans perte de points automatique]
   Conditions : Signalée à l’élève, elle ne fait perdre aucun point.
• HGGSP_TR_11 — Conclusion absente : Aucune conclusion ne répond explicitement à la problématique. [critère : P2.E.1 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_TR_12 — Passage illisible ou transcription incertaine : Un passage de la copie n’a pas pu être lu avec certitude. [critère : aucun ; impact : aucune pénalité automatique avant relecture humaine]
   Conditions : Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.
• HGGSP_EC_01 — Paraphrase : Le document est reformulé ou recopié sans être expliqué ni critiqué. [critère : P2.C.2 ; impact : l’élément est là mais ne rapporte pas les points attendus]
• HGGSP_EC_02 — Informations mal hiérarchisées : Détails secondaires traités comme des idées essentielles, ou inversement. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_EC_03 — Document non contextualisé : Le document n’est pas replacé dans son contexte historique ou géopolitique. [critère : P2.D.1 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_04 — Auteur ou source non interrogé : L’auteur ou l’institution productrice n’est ni identifié ni questionné. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_05 — Destinataire non identifié : Le destinataire du document n’est pas identifié alors qu’il éclaire son sens. [critère : P2.C.2 ; impact : fourchette indicative 0.25–0.5]
   Conditions : Ne s’applique que lorsque le destinataire est identifiable et pertinent.
• HGGSP_EC_06 — Intention non analysée : L’intention de l’auteur n’est jamais interrogée. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_07 — Point de vue non identifié : Le point de vue situé du document est pris pour un constat neutre. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_08 — Limites ou silences ignorés : Ce que le document ne dit pas n’est jamais interrogé. [critère : P2.C.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_09 — Absence totale de mise à distance critique : Aucune critique explicite : ni nature, ni auteur, ni intention, ni portée, ni limites. [critère : P2.C.2 ; impact : plafond du critère à 0.75]
   Conditions : Le critère « Analyse critique » est plafonné à 50 % de son maximum, soit 2,5 / 5.
• HGGSP_EC_10 — Connaissances substituées au document : Le cours remplace le document au lieu de l’éclairer. [critère : P2.B.2 ; impact : fourchette indicative 0.5–1]
• HGGSP_EC_11 — Document utilisé sans citation ni localisation : Les informations sont attribuées au document sans citation ni renvoi précis. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.75]
• HGGSP_EC_12 — Deuxième document ignoré : Un des deux documents est absent ou presque absent de l’analyse. [critère : P2.B.2 ; impact : plafond du critère à 0.75]
   Conditions : Ne s’applique que si le sujet comporte réellement deux documents.
• HGGSP_EC_13 — Absence de confrontation : Deux analyses séparées, sans aucune mise en relation. [critère : P2.E.1 ; impact : fourchette indicative 0.5–1]
   Conditions : Ne s’applique que si le sujet comporte deux documents et attend leur confrontation.
• HGGSP_EC_14 — Confrontation artificielle : Les documents sont opposés alors qu’ils sont complémentaires. [critère : P2.C.2 ; impact : fourchette indicative 0.25–0.5]
   Conditions : Aucune opposition n’est imposée : si les documents se complètent, il faut le dire.
• HGGSP_EC_15 — Confusion entre les documents ou les auteurs : Une citation ou un point de vue est attribué au mauvais document. [critère : P2.B.2 ; impact : fourchette indicative 0.25–0.5]
• HGGSP_EC_16 — Consigne partiellement traitée : Une dimension explicitement demandée par la consigne n’est jamais traitée. [critère : P2.A.1 ; impact : plafond du critère à 0.75]
   Conditions : La consigne comporte plusieurs volets et l’un d’eux est absent de la copie.

NON-DOUBLE-SANCTION
Pour chaque faiblesse, tu identifies l''erreur SOURCE et ses conséquences. Une conséquence porte source_error_id et is_consequence=true : elle est décrite, jamais comptée une seconde fois. Exemple : l''absence de problématique est comptée dans l''analyse du sujet ; l''argumentation reste évaluée sur son organisation réellement observable.

RELECTURE HUMAINE
Tu demandes une relecture humaine (human_review_required) si : la transcription est incertaine, un passage est illisible, tu soupçonnes un contresens sans certitude, une référence paraît fausse mais pourrait être une autre formulation recevable, le plan est original et sort des exemples de la grille, la copie est presque entièrement hors sujet, une production graphique ne peut pas être interprétée, une erreur majeure pourrait toucher plusieurs critères, ou ta confiance globale est insuffisante. Un doute de transcription n''est JAMAIS une erreur de l''élève.

PRÉLEVER, EXPLIQUER, CRITIQUER
Ces trois gestes sont notés dans TROIS critères distincts (« B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation » (P2.B.2), « D. Mobilisation des connaissances personnelles » (P2.D.1), « C. Regard critique — 2. Limites, biais, point de vue et portée » (P2.C.2)). Une copie qui prélève correctement mais n''explique ni ne critique garde ses points de prélèvement : tu ne mets jamais presque zéro à toute la partie documentaire au motif que la critique manque.',
  '{"principle":"L’étude critique se juge sur trois gestes NETTEMENT SÉPARÉS : prélever, expliquer, critiquer. Un prélèvement exact est valorisé pour lui-même, même quand l’explication et la critique manquent. Grille du classeur de correction des professeurs, en neuf sous-critères : l’échelle analytique est directement celle de l’exercice, sur 10.","maximum_score":10,"official_maximum_score":10,"conversion":"note_officielle_exercice = note_analytique (grille sur 10) ; note_finale = officielle(dissertation) + officielle(etude critique)","exam_formats":["full_exam","dissertation_only","document_study_only"],"criteria":[{"code":"P2.A.1","name":"A. Compréhension du sujet et problématisation","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Problématique pertinente et adaptée aux documents.","0.5":"Consigne ou problématique mal comprise ; contresens sur le sujet.","0.75":"Sujet compris mais problématique faible ou trop descriptive.","1.5":"Problématique précise, construite à partir du sujet, qui oriente effectivement toute l''étude critique."}},{"code":"P2.B.1","name":"B. Compréhension et analyse du/des document(s) — 1. Identification et compréhension du sens","maximum_score":1,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Compréhension fine : nature, auteur/acteur, contexte et message du document correctement appréhendés lorsque ces éléments sont disponibles.","0.25":"Document mal compris ou contresens.","0.5":"Sens général compris mais éléments importants négligés.","0.75":"Sens général et informations principales correctement identifiés."}},{"code":"P2.B.2","name":"B. Compréhension et analyse du/des document(s) — 2. Sélection, hiérarchisation et explicitation","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Informations correctement sélectionnées, hiérarchisées et expliquées.","0.5":"Paraphrase ou simple description du document.","0.75":"Informations pertinentes sélectionnées mais hiérarchisation limitée.","1.5":"Analyse précise : informations majeures isolées, mises en relation et explicitées au regard de la problématique."}},{"code":"P2.C.1","name":"C. Regard critique — 1. Mise en contexte et portée","maximum_score":1,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Contexte maîtrisé et utilisé pour expliquer la portée, les enjeux et/ou les limites du document.","0.25":"Contexte absent ou erroné.","0.5":"Contexte présent mais superficiel.","0.75":"Contexte pertinent permettant de mieux comprendre le document."}},{"code":"P2.C.2","name":"C. Regard critique — 2. Limites, biais, point de vue et portée","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Point de vue, objectif, biais ou limites correctement analysés.","0.5":"Aucun recul critique ou critique générique (« document subjectif »).","0.75":"Quelques limites identifiées mais peu démontrées.","1.5":"Véritable étude critique : le document est confronté à son contexte, son auteur, sa nature, ses objectifs, ses silences et/ou ses limites."}},{"code":"P2.D.1","name":"D. Mobilisation des connaissances personnelles","maximum_score":1.5,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Connaissances pertinentes permettant d''éclairer ou de nuancer le document.","0.25":"Connaissances absentes ou hors sujet.","0.5":"Quelques connaissances mais peu exploitées.","1.5":"Connaissances précises et bien choisies, utilisées pour compléter, contextualiser, confirmer ou relativiser le document sans le remplacer."}},{"code":"P2.E.1","name":"E. Organisation et maîtrise de l''exercice","maximum_score":1,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","1":"Organisation très claire et efficace : introduction, analyse structurée, transitions pertinentes et conclusion apportant une réponse nette.","0.25":"Réponse désorganisée ; introduction/conclusion très insuffisantes.","0.5":"Organisation correcte mais transitions ou conclusion limitées.","0.75":"Introduction problématisée, développement en paragraphes et conclusion répondant au sujet."}},{"code":"P2.F.1","name":"F. Expression et présentation — 1. Qualité rédactionnelle et vocabulaire","maximum_score":0.75,"description":"","levels":{"0":"Rien d''exploitable sur ce critère.","0.25":"Expression difficile à comprendre ou vocabulaire très imprécis.","0.5":"Expression correcte mais maladroite ou parfois imprécise.","0.75":"Expression claire, précise et vocabulaire disciplinaire maîtrisé."}},{"code":"P2.F.2","name":"F. Expression et présentation — 2. Lisibilité et présentation","maximum_score":0.25,"description":"","levels":{"0":"Présentation rendant la lecture difficile.","0.25":"Présentation lisible, paragraphes et organisation clairement identifiables."}}],"guardrails":["La copie est évaluée selon des critères explicites et communs à tous les élèves. Chaque score doit être justifié par des éléments localisables dans la copie. Le jugement du correcteur reste nécessaire dans une matière rédigée, mais il est encadré, traçable et calibré.","La note est la SOMME des réussites observées critère par critère. On ne part jamais du maximum pour retrancher les erreurs.","Une même faiblesse n’est comptée que dans UN critère. Ses conséquences ailleurs sont décrites, jamais sanctionnées une deuxième fois.","Chaque score est justifié par une citation réellement présente dans la transcription. Aucune citation n’est inventée ni reconstituée.","Aucun fait, aucune date, aucun acteur, aucun exemple absent de la copie ou du sujet n’est ajouté par le correcteur.","Aucun plan unique n’est imposé : tout plan pertinent qui répond à la problématique est recevable.","La neutralité politique est absolue : on évalue la démonstration, jamais l’opinion de l’élève.","Un doute de transcription n’est jamais transformé en erreur de l’élève : il déclenche une relecture humaine.","Les paliers sont ceux du classeur que coche le professeur. Le 0 est réservé à un critère où rien n’est exploitable ; le score se place au quart de point.","Prélever (B.2), expliquer par les connaissances (D) et critiquer (C.2) sont trois critères distincts : l’absence de critique ne fait jamais perdre les points du prélèvement.","Quand le sujet comporte deux documents, la confrontation est attendue — mais aucune opposition n’est imposée si les documents sont complémentaires."],"source_status":"classeur_profs_hggsp_v1_a_cocher","official_basis":"Note de service MENE2521923N (BO n° 33, 2025) : epreuve ecrite de specialite HGGSP = une dissertation sur 10 et une etude critique de document(s) sur 10, total sur 20.","common_error_taxonomy":[{"code":"HGGSP_TR_01","category":"transversale","severity":"mineure","description":"Une date, un acteur, un traité ou un événement inexact, sans effet sur le raisonnement.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0,"impact_max":0.25,"criterion_cap":null,"criterion_level_cap":null,"conditions":"L’erreur ne sert pas d’appui à un argument du développement.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Une inexactitude ponctuelle : elle ne casse pas ta démonstration, mais vérifie tes repères.","human_review_required":false},{"code":"HGGSP_TR_02","category":"transversale","severity":"moderee","description":"Un fait inexact sur lequel repose un argument du développement.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"L’argument concerné perd sa valeur démonstrative, mais la partie reste debout.","no_double_penalty":"Comptée dans les connaissances. Si l’exemple porteur de cette erreur est par ailleurs jugé non exploité, l’erreur factuelle n’est pas retirée une deuxième fois dans « Exemples ».","student_message":"Ce fait est inexact et c’est lui qui portait ton argument : vérifie-le avant de t’appuyer dessus.","human_review_required":false},{"code":"HGGSP_TR_03","category":"transversale","severity":"majeure","description":"Un contresens qui détruit une partie entière de la démonstration.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Le contresens porte sur une notion ou un mécanisme central du sujet.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ce contresens fait tomber toute une partie : reprends la notion avant de refaire le devoir.","human_review_required":true},{"code":"HGGSP_TR_04","category":"transversale","severity":"moderee","description":"Deux notions du programme employées l’une pour l’autre (puissance/hégémonie, histoire/mémoire, conflit/guerre, État/nation).","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ces deux notions ne disent pas la même chose : définis-les avant de les employer.","human_review_required":false},{"code":"HGGSP_TR_05","category":"transversale","severity":"majeure","description":"Développement exact mais qui ne traite pas le sujet posé.","criterion":"P2.D.1","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Le degré d’impact dépend de la proportion de la copie concernée : un passage ponctuel n’équivaut pas à un hors-sujet total. Une copie presque entièrement hors sujet déclenche une relecture humaine.","no_double_penalty":"Les connaissances hors sujet ne rapportent simplement pas de points. Aucune pénalité supplémentaire n’est ajoutée par ailleurs.","student_message":"C’est juste, mais ça ne répond pas à la question posée : ces développements ne rapportent rien.","human_review_required":false},{"code":"HGGSP_TR_06","category":"transversale","severity":"moderee","description":"Un avis substitué à l’analyse, sans démonstration ni référence.","criterion":"P2.E.1","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ton avis ne vaut que s’il est démontré : appuie-le sur des faits et des exemples.","human_review_required":false},{"code":"HGGSP_TR_07","category":"transversale","severity":"moderee","description":"Échelles locale, nationale, régionale et mondiale traitées indifféremment.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Précise à quelle échelle tu raisonnes : le sens de ton argument en dépend.","human_review_required":false},{"code":"HGGSP_TR_08","category":"transversale","severity":"moderee","description":"Une notion contemporaine projetée sur une autre époque.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Cette notion n’existait pas à cette époque : situe-la dans son temps.","human_review_required":false},{"code":"HGGSP_TR_09","category":"transversale","severity":"moderee","description":"Erreurs de langue répétées ou formulations ambiguës qui empêchent de comprendre le propos.","criterion":"P2.F.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Seulement si les erreurs sont répétées ou nuisent à la compréhension. L’effet reste limité au critère Expression, sauf si un passage devient réellement impossible à comprendre.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Certaines phrases ne se comprennent pas : relis-toi à voix haute pour repérer les ruptures.","human_review_required":false},{"code":"HGGSP_TR_10","category":"transversale","severity":"mineure","description":"Une coquille ou une faute ponctuelle qui ne gêne pas la lecture.","criterion":"P2.F.1","impact_type":"informational_only","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Signalée à l’élève, elle ne fait perdre aucun point.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Petite coquille sans conséquence sur ta note : un dernier relecture la ferait disparaître.","human_review_required":false},{"code":"HGGSP_TR_11","category":"transversale","severity":"moderee","description":"Aucune conclusion ne répond explicitement à la problématique.","criterion":"P2.E.1","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Comptée une seule fois dans la construction / l’organisation. Aucune seconde pénalité ailleurs pour la même absence.","student_message":"Ta copie s’arrête sans répondre : une conclusion, même courte, doit trancher la question posée.","human_review_required":false},{"code":"HGGSP_TR_12","category":"transversale","severity":"majeure","description":"Un passage de la copie n’a pas pu être lu avec certitude.","impact_type":"human_review_required","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Ce n’est jamais une erreur de l’élève : la copie d’origine doit être relue par un humain.","no_double_penalty":"Aucune pénalité automatique n’est appliquée sur ce motif.","student_message":"Un passage n’a pas pu être lu : ta copie est vérifiée par un professeur avant d’être rendue.","human_review_required":true},{"code":"HGGSP_EC_01","category":"etude_critique","severity":"majeure","description":"Le document est reformulé ou recopié sans être expliqué ni critiqué.","criterion":"P2.C.2","impact_type":"evidence_not_rewarded","impact_min":null,"impact_max":null,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Les informations correctement prélevées RESTENT valorisées dans « Prélèvement ». La paraphrase prive seulement des points d’explication et de critique — aucune pénalité supplémentaire n’est ajoutée après ce refus.","student_message":"Redire le document ne suffit pas : explique-le avec tes connaissances, puis prends du recul.","human_review_required":false},{"code":"HGGSP_EC_02","category":"etude_critique","severity":"moderee","description":"Détails secondaires traités comme des idées essentielles, ou inversement.","criterion":"P2.B.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.75,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Commence par les idées essentielles du document, garde les détails pour appuyer.","human_review_required":false},{"code":"HGGSP_EC_03","category":"etude_critique","severity":"moderee","description":"Le document n’est pas replacé dans son contexte historique ou géopolitique.","criterion":"P2.D.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Situe le document : quelle époque, quel contexte, quels enjeux au moment où il est produit ?","human_review_required":false},{"code":"HGGSP_EC_04","category":"etude_critique","severity":"majeure","description":"L’auteur ou l’institution productrice n’est ni identifié ni questionné.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Qui parle ? Un auteur, une institution, une position : c’est le début de la critique.","human_review_required":false},{"code":"HGGSP_EC_05","category":"etude_critique","severity":"moderee","description":"Le destinataire du document n’est pas identifié alors qu’il éclaire son sens.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Ne s’applique que lorsque le destinataire est identifiable et pertinent.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"À qui ce document s’adresse-t-il ? Le destinataire explique souvent le ton et les silences.","human_review_required":false},{"code":"HGGSP_EC_06","category":"etude_critique","severity":"majeure","description":"L’intention de l’auteur n’est jamais interrogée.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Pourquoi ce document a-t-il été produit ? L’intention change ce qu’il faut en retenir.","human_review_required":false},{"code":"HGGSP_EC_07","category":"etude_critique","severity":"majeure","description":"Le point de vue situé du document est pris pour un constat neutre.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Un document parle depuis quelque part : dis d’où, et ce que cela change.","human_review_required":false},{"code":"HGGSP_EC_08","category":"etude_critique","severity":"majeure","description":"Ce que le document ne dit pas n’est jamais interrogé.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Compare ce que le document montre et ce qu’il tait : les silences sont des arguments.","human_review_required":false},{"code":"HGGSP_EC_09","category":"etude_critique","severity":"majeure","description":"Aucune critique explicite : ni nature, ni auteur, ni intention, ni portée, ni limites.","criterion":"P2.C.2","impact_type":"criterion_score_cap","impact_min":null,"impact_max":null,"criterion_cap":0.75,"criterion_level_cap":null,"conditions":"Le critère « Analyse critique » est plafonné à 50 % de son maximum, soit 2,5 / 5.","no_double_penalty":"Le prélèvement correct reste valorisé dans son critère. On ne met JAMAIS presque zéro à toute la partie documentaire au motif que la critique manque.","student_message":"Il manque le cœur de l’exercice : la mise à distance du document. C’est là que se gagne la note.","human_review_required":false},{"code":"HGGSP_EC_10","category":"etude_critique","severity":"moderee","description":"Le cours remplace le document au lieu de l’éclairer.","criterion":"P2.B.2","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Le document est le point de départ : tes connaissances viennent l’expliquer, pas le remplacer.","human_review_required":false},{"code":"HGGSP_EC_11","category":"etude_critique","severity":"moderee","description":"Les informations sont attribuées au document sans citation ni renvoi précis.","criterion":"P2.B.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.75,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Cite entre guillemets et indique où : « ligne 12 », « deuxième paragraphe ».","human_review_required":false},{"code":"HGGSP_EC_12","category":"etude_critique","severity":"majeure","description":"Un des deux documents est absent ou presque absent de l’analyse.","criterion":"P2.B.2","impact_type":"criterion_score_cap","impact_min":null,"impact_max":null,"criterion_cap":0.75,"criterion_level_cap":null,"conditions":"Ne s’applique que si le sujet comporte réellement deux documents.","no_double_penalty":"Le plafond joue sur le prélèvement uniquement. L’analyse critique du document réellement traité reste valorisée.","student_message":"Un document sur deux est resté de côté : les deux doivent être exploités.","human_review_required":false},{"code":"HGGSP_EC_13","category":"etude_critique","severity":"moderee","description":"Deux analyses séparées, sans aucune mise en relation.","criterion":"P2.E.1","impact_type":"contextual_range","impact_min":0.5,"impact_max":1,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Ne s’applique que si le sujet comporte deux documents et attend leur confrontation.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Confronte les documents : convergences, divergences, complémentarités.","human_review_required":false},{"code":"HGGSP_EC_14","category":"etude_critique","severity":"moderee","description":"Les documents sont opposés alors qu’ils sont complémentaires.","criterion":"P2.C.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"Aucune opposition n’est imposée : si les documents se complètent, il faut le dire.","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Ces documents ne s’opposent pas : montre plutôt en quoi ils se complètent.","human_review_required":false},{"code":"HGGSP_EC_15","category":"etude_critique","severity":"moderee","description":"Une citation ou un point de vue est attribué au mauvais document.","criterion":"P2.B.2","impact_type":"contextual_range","impact_min":0.25,"impact_max":0.5,"criterion_cap":null,"criterion_level_cap":null,"conditions":"","no_double_penalty":"Cette faiblesse n’est comptée que dans son critère principal ; ses conséquences ailleurs sont décrites, jamais sanctionnées de nouveau.","student_message":"Vérifie l’attribution : chaque citation appartient à un document précis.","human_review_required":false},{"code":"HGGSP_EC_16","category":"etude_critique","severity":"majeure","description":"Une dimension explicitement demandée par la consigne n’est jamais traitée.","criterion":"P2.A.1","impact_type":"criterion_score_cap","impact_min":null,"impact_max":null,"criterion_cap":0.75,"criterion_level_cap":null,"conditions":"La consigne comporte plusieurs volets et l’un d’eux est absent de la copie.","no_double_penalty":"Le volet traité reste valorisé dans les autres critères ; l’oubli n’est compté que dans la compréhension de la consigne.","student_message":"La consigne comportait plusieurs demandes : traite-les toutes, explicitement.","human_review_required":false}]}'::jsonb,
  'criteres_rediges', 'HGGSP_ETUDE_CRITIQUE_V3', 'note_officielle', true, false
)
on conflict (id) do update
set status        = 'active',
    system_prompt = excluded.system_prompt,
    rubric_json   = excluded.rubric_json,
    moteur        = excluded.moteur,
    grille_id     = excluded.grille_id;

-- 6. Le bac blanc complet corrige ses nouveaux exercices en V3 ------------
update public.exam_exercices set grille_id = 'HGGSP_DISSERTATION_V3'
where grille_id = 'HGGSP_DISSERTATION_V2';
update public.exam_exercices set grille_id = 'HGGSP_ETUDE_CRITIQUE_V3'
where grille_id = 'HGGSP_ETUDE_CRITIQUE_V2';

-- 7. Le résultat, ou rien -------------------------------------------------
do $$
declare
  v_n int;
begin
  select count(*) into v_n
  from public.rubrics r
  join public.grilles_redigees g on g.id = r.grille_id
  where r.matiere = 'hggsp' and r.status = 'active'
    and r.moteur = 'criteres_rediges'
    and g.statut = 'locked' and g.version = '3';
  if v_n <> 2 then
    raise exception 'Attendu : 2 grilles de dépôt HGGSP actives sur une V3 verrouillée, trouvé %.', v_n;
  end if;

  select count(*) into v_n from public.rubrics
  where matiere = 'hggsp' and status = 'active' and id not like '%_V3';
  if v_n <> 0 then
    raise exception 'Une grille de dépôt HGGSP autre que V3 est encore active (%).', v_n;
  end if;

  select count(*) into v_n from public.grilles_redigees
  where id in ('HGGSP_DISSERTATION_V2', 'HGGSP_ETUDE_CRITIQUE_V2') and statut = 'archived';
  if v_n <> 2 then
    raise exception 'Les deux V2 devraient être archivées (trouvé %).', v_n;
  end if;
end;
$$;

commit;

-- Contrôle à relire après coup :
-- select r.id, r.status, r.grille_id, g.statut, g.version, g.max_analytique
-- from public.rubrics r left join public.grilles_redigees g on g.id = r.grille_id
-- where r.matiere = 'hggsp' order by r.exercise_type, r.version;
