-- =====================================================================
--  REFERENTIELS DU BREVET (DNB) : COMPETENCES, TAXONOMIES, SOURCES, REGLES
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Genere par scripts/seed-brevet.mjs - version 1.0.0.
--  Prerequis : supabase/sql/42_brevet_socle.sql.
--
--  12 competence(s), 112 code(s) d'erreur,
--  5 source(s) officielle(s), 27 regle(s), 5 parametre(s).
--
--  Idempotent : chaque insert est un upsert sur la cle primaire.
--  100% ASCII : les accents sont encodes en hexadecimal.
--
--  ETANCHEITE : la cle primaire de competence_referentiels et de
--  taxonomie_erreurs est (matiere, code). Les codes du brevet portent
--  'brevet_francais' ou 'brevet_mathematiques' : ils ne peuvent donc jamais
--  atteindre une copie du baccalaureat, ni l'une l'autre matiere.
--
--  RETOUR ARRIERE :
--    delete from public.brevet_parametres;
--    delete from public.brevet_regles_officielles;
--    delete from public.sources_officielles;
--    delete from public.taxonomie_erreurs where matiere like 'brevet_%';
--    delete from public.competence_referentiels where matiere like 'brevet_%';
-- =====================================================================


-- =====================================================================
--  BLOC 0 - COLONNES SUPPLEMENTAIRES DE LA TAXONOMIE
--
--  taxonomie_erreurs portait sept colonnes, suffisantes pour le bac. Le
--  cahier des charges du brevet en exige davantage : un libelle destine a
--  l'eleve, une penalite par defaut eventuelle avec sa regle et son
--  plafond, une regle de cumul, un exemple, un conseil, la source et la
--  version. Toutes sont AJOUTEES : les lignes du bac gardent NULL.
-- =====================================================================

begin;

alter table public.taxonomie_erreurs
  add column if not exists partie                    text,
  add column if not exists sous_categorie            text,
  add column if not exists libelle_eleve             text,
  add column if not exists penalite_defaut           numeric(5,2),
  add column if not exists regle_application         text,
  add column if not exists plafond_perte             numeric(5,2),
  add column if not exists cumul_autorise            boolean not null default false,
  add column if not exists points_partiels_possibles boolean not null default true,
  add column if not exists exemple                   text,
  add column if not exists conseil                   text,
  add column if not exists source                    text,
  add column if not exists version                   text;

comment on column public.taxonomie_erreurs.penalite_defaut is
  'La gravite seule ne suffit pas : quand c''est pertinent, un code porte une perte de points precise, avec sa regle d''application, son plafond et sa regle de cumul. NULL = code purement pedagogique, sans effet mecanique sur la note.';

commit;


-- =====================================================================
--  BLOC A - COMPETENCES
--
--  toujours_mobilisee = false : competence evaluee UNIQUEMENT quand le
--  sujet la mobilise (l'image en francais, la reecriture). Sinon
--  'non_applicable', jamais zero.
-- =====================================================================

begin;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'lire', 'Lire', 'Comprendre un texte litteraire, prelever une information explicite, degager le sens global, interpreter ce qui n''est pas dit.', 1, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'ecrire', 'Ecrire', 'Produire un texte coherent et construit, adapte a la consigne, en respectant les normes de la langue ecrite.', 2, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'langue', 'Comprendre le fonctionnement de la langue', 'Identifier natures et fonctions, analyser propositions et subordination, maitriser temps, modes et accords, manipuler la langue.', 3, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'culture', 'Culture litteraire et artistique', 'Mobiliser des reperes litteraires et artistiques, reconnaitre un genre, un procede, un effet, situer un texte dans son contexte.', 4, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'image', 'Analyse de l''image', 'Evaluee UNIQUEMENT si le sujet comporte une image. Sinon ''non_applicable'', jamais zero.', 5, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_francais', 'reecriture', 'Reecriture', 'Transformer des formes selon une consigne (temps, enonciation, personne, genre, nombre). Evaluee seulement si le sujet comporte l''exercice.', 6, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'chercher', 'Chercher', 'S''engager dans une recherche : extraire l''information utile, tester un cas particulier, essayer, reformuler la question.', 1, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'modeliser', 'Modeliser', 'Traduire une situation concrete en objet mathematique (equation, fonction, configuration, modele de probabilite) et revenir au concret pour interpreter.', 2, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'representer', 'Representer', 'Choisir un registre adapte : figure, graphique, tableau, arbre, ecriture algebrique, et passer de l''un a l''autre.', 3, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'raisonner', 'Raisonner', 'Poser les hypotheses, nommer la propriete employee, verifier ses conditions, enchainer les deductions, conclure. C''est la demonstration qui est notee, pas le resultat seul.', 4, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'calculer', 'Calculer', 'Mener un calcul exact ou approche, controler l''ordre de grandeur, respecter l''arrondi et l''unite demandes.', 5, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('brevet_mathematiques', 'communiquer', 'Communiquer', 'Rediger clairement, employer le vocabulaire et les notations justes, enoncer le resultat en phrase et le replacer dans le contexte.', 6, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

commit;


-- =====================================================================
--  BLOC B - TAXONOMIE D'ERREURS
--
--  nature separe quatre familles qui ne se confondent jamais : erreur de
--  l'eleve, incident de transcription, incertitude de reconnaissance,
--  anomalie du sujet. Les deux dernieres ne retirent JAMAIS de points.
-- =====================================================================

begin;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-COMP-01', 'comprehension', 'La reponse contredit ce que le texte affirme explicitement.', 'majeure', 'eleve', 'lire', 'texte', 'sens litteral', 'Tu n''as pas compris ce que dit le texte', null, null, null, false, true, null, 'Relis la phrase du texte qui contient la reponse, et reformule-la avec tes mots avant de repondre.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-COMP-02', 'comprehension', 'L''information prelevee vient d''un autre passage que celui que la question vise.', 'moderee', 'eleve', 'lire', 'texte', 'prelevement', 'Tu as cherche la reponse au mauvais endroit', null, null, null, false, true, null, 'Repere le mot de la question dans le texte : la reponse est presque toujours juste autour.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-COMP-03', 'comprehension', 'La reponse est exacte sur un point mais manque le sens general demande.', 'moderee', 'eleve', 'lire', 'texte', 'globale', 'Tu as compris un detail mais pas l''ensemble', null, null, null, false, true, null, 'Avant de repondre a une question globale, resume le texte en une phrase.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-INT-01', 'interpretation', 'La question demandait d''interpreter, la reponse se contente de reciter le texte.', 'moderee', 'eleve', 'lire', 'texte', 'implicite', 'Tu es reste a ce qui est ecrit', null, null, null, false, true, null, 'Demande-toi pourquoi l''auteur ecrit cela, pas seulement ce qu''il ecrit.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-INT-02', 'interpretation', 'L''interpretation ne s''appuie sur aucun element du texte.', 'moderee', 'eleve', 'lire', 'texte', 'sur-interpretation', 'Tu as invente ce que le texte ne dit pas', null, null, null, false, true, null, 'Chaque idee que tu avances doit pouvoir etre reliee a un mot precis du texte.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-INT-03', 'interpretation', convert_from(decode('4c65637475726520636f68c3a972656e74652065742065746179656520717565206c6520636f7272696765206e2761766169742070617320616e746963697065652e', 'hex'), 'UTF8'), 'mineure', 'sujet', 'lire', 'texte', 'defendable non prevue', 'Interpretation possible mais non prevue au corrige', null, 'Ne jamais mettre zero : declencher une validation humaine.', null, false, true, null, 'Continue a justifier tes lectures : celle-ci se defend.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-JUST-01', 'justification', convert_from(decode('4c61207265706f6e736520657374206a75737465206d616973206c65207465787465206e276573742070617320636f6e766f71756520636f6d6d65206c6520626172c3a86d65206c2765786967652e', 'hex'), 'UTF8'), 'moderee', 'eleve', 'lire', 'texte', 'absente', 'Tu as donne la bonne idee sans la justifier', null, null, null, false, true, null, convert_from(decode('416a6f75746520c2ab2070617263652071756520c2bb207375697669206427756e6520636f75727465206369746174696f6e2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-JUST-02', 'justification', 'La citation retenue ne soutient pas l''affirmation.', 'moderee', 'eleve', 'lire', 'texte', 'hors propos', 'Ta justification ne prouve pas ce que tu affirmes', null, null, null, false, true, null, 'Verifie que ta citation contient bien le mot qui prouve ton idee.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CIT-01', 'citation', convert_from(decode('4c6520626172c3a86d6520657869676561697420756e65206369746174696f6e2064752074657874652c20617563756e65206e276573742070726573656e74652e', 'hex'), 'UTF8'), 'moderee', 'eleve', 'lire', 'texte', 'absente', 'Il manque la citation demandee', null, null, null, false, true, null, 'Recopie entre guillemets le groupe de mots exact du texte.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CIT-02', 'citation', 'La citation est juste mais rien n''est dit de ce qu''elle prouve.', 'moderee', 'eleve', 'lire', 'texte', 'non expliquee', 'Tu cites sans expliquer', null, null, null, false, true, null, 'Apres chaque citation, ecris une phrase qui dit ce qu''elle montre.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CIT-03', 'citation', 'Les mots cites ne figurent pas tels quels dans le texte.', 'mineure', 'eleve', 'lire', 'texte', 'inexacte', 'Ta citation ne correspond pas au texte', null, null, null, false, true, null, 'Recopie mot pour mot, sans reformuler, entre guillemets.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-STYL-01', 'analyse_stylistique', 'Le procede attendu (comparaison, metaphore, hyperbole, personnification, gradation...) n''est pas identifie.', 'moderee', 'eleve', 'culture', 'texte', 'procede non identifie', 'Tu n''as pas nomme le procede', null, null, null, false, true, null, 'Apprends cinq figures et leur definition : elles reviennent a chaque brevet.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-STYL-02', 'analyse_stylistique', 'La figure est identifiee mais son effet sur le lecteur n''est pas explique.', 'moderee', 'eleve', 'culture', 'texte', 'effet non explique', 'Tu nommes le procede sans dire ce qu''il produit', null, null, null, false, true, null, convert_from(decode('5465726d696e6520746f756a6f7572732070617220c2ab2063652071756920646f6e6e65206c27696d7072657373696f6e20717565e280a620c2bb2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-IMG-01', 'interpretation', 'La question portait sur le lien entre l''image et le texte, la reponse ne parle que de l''un des deux.', 'moderee', 'eleve', 'image', 'texte', 'image', 'Tu n''as pas mis l''image en relation avec le texte', null, null, null, false, true, null, 'Decris d''abord ce que tu vois, puis dis ce que cela rappelle du texte.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-LEX-01', 'lexique', 'Le mot est compris hors de son contexte.', 'moderee', 'eleve', 'langue', 'texte', 'sens du mot', 'Le sens que tu donnes au mot n''est pas celui du texte', null, null, null, false, true, null, 'Remplace le mot par ta definition dans la phrase : si la phrase ne veut plus rien dire, ce n''est pas le bon sens.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-LEX-02', 'lexique', 'Le mot propose a un sens voisin mais ne fonctionne pas dans la phrase.', 'mineure', 'eleve', 'langue', 'texte', 'synonymie', 'Le synonyme propose ne convient pas ici', null, null, null, false, true, null, 'Verifie que ton synonyme garde la meme classe grammaticale et le meme registre.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-LEX-03', 'lexique', 'La decomposition du mot est erronee.', 'mineure', 'eleve', 'langue', 'texte', 'formation des mots', 'Tu n''as pas reconnu le radical, le prefixe ou le suffixe', null, null, null, false, true, null, 'Cherche un mot de la meme famille que tu connais bien.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-GRAM-01', 'grammaire', 'La classe grammaticale annoncee n''est pas la bonne.', 'moderee', 'eleve', 'langue', 'texte', 'nature', 'Tu as confondu la nature du mot', null, null, null, false, true, null, 'La nature ne change jamais : nom, verbe, adjectif, pronom, determinant, adverbe, preposition, conjonction.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-GRAM-02', 'grammaire', 'La fonction annoncee ne correspond pas au role du mot dans la phrase.', 'moderee', 'eleve', 'langue', 'texte', 'fonction', 'Tu as confondu la fonction du mot', null, null, null, false, true, null, convert_from(decode('4c6120666f6e6374696f6e20646570656e64206465206c6120706872617365203a20706f7365206c61207175657374696f6e20c2ab20717569203f2071756f69203f206120717569203f20c2bb2061752076657262652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-GRAM-03', 'grammaire', 'Le nombre ou les limites des propositions sont errones.', 'moderee', 'eleve', 'langue', 'texte', 'proposition', 'Le decoupage en propositions est faux', null, null, null, false, true, null, 'Compte les verbes conjugues : autant de verbes, autant de propositions.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-GRAM-04', 'grammaire', 'La nature de la subordonnee (relative, conjonctive, interrogative indirecte) est erronee.', 'moderee', 'eleve', 'langue', 'texte', 'subordination', 'La subordonnee n''est pas correctement identifiee', null, null, null, false, true, null, convert_from(decode('52656761726465206c65206d6f7420717569206c27696e74726f64756974203a20c2ab20717569202f20717565202f20646f6e74202f206f7520c2bb203d2072656c61746976652c20c2ab2071756520c2bb20617072657320756e207665726265203d20636f6e6a6f6e63746976652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CONJ-01', 'conjugaison', 'Le temps, le mode ou la personne identifies ne sont pas ceux du verbe.', 'moderee', 'eleve', 'langue', 'texte', 'temps et modes', 'Le temps ou le mode annonce est faux', null, null, null, false, true, null, 'Recite la conjugaison complete du verbe : la terminaison te donne le temps.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CONJ-02', 'conjugaison', 'Le temps est bien identifie mais sa valeur (action de premier plan, arriere-plan, habitude, verite generale) n''est pas donnee.', 'moderee', 'eleve', 'langue', 'texte', 'valeur des temps', 'Tu n''as pas explique la valeur du temps', null, null, null, false, true, null, 'Imparfait = decor ou habitude ; passe simple = action qui avance le recit.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ACC-01', 'orthographe_grammaticale', 'La marque de personne ou de nombre du verbe est erronee.', 'moderee', 'eleve', 'langue', 'toutes', 'accord sujet-verbe', 'Le verbe n''est pas accorde avec son sujet', null, null, null, false, true, null, convert_from(decode('456e6361647265206c652073756a65742c20706f7365206c61207175657374696f6e20c2ab20717569206573742d636520717569203f20c2bb206176616e74206c652076657262652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ACC-02', 'orthographe_grammaticale', 'Le determinant, le nom et l''adjectif ne s''accordent pas.', 'moderee', 'eleve', 'langue', 'toutes', 'accord dans le groupe nominal', 'L''accord dans le groupe nominal est faux', null, null, null, false, true, null, 'Repere le nom noyau, puis accorde tout ce qui l''entoure.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ACC-03', 'orthographe_grammaticale', 'La regle d''accord avec etre, avoir ou le COD antepose n''est pas appliquee.', 'moderee', 'eleve', 'langue', 'toutes', 'participe passe', 'L''accord du participe passe est faux', null, null, null, false, true, null, convert_from(decode('4176656320c2ab206574726520c2bb2c206f6e206163636f7264652061766563206c652073756a6574203b206176656320c2ab2061766f697220c2bb2c207365756c656d656e74207369206c6520434f4420657374206176616e742e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ORTH-01', 'orthographe_lexicale', 'Orthographe lexicale erronee, hors accord et hors conjugaison.', 'mineure', 'eleve', 'ecrire', 'toutes', 'orthographe d''usage', 'Le mot n''est pas ecrit correctement', null, null, null, false, true, null, 'Note les mots que tu rates dans un carnet et relis-le avant l''epreuve.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ORTH-02', 'orthographe_grammaticale', 'Confusion entre a/a, et/est, ou/ou, ce/se, ces/ses, on/ont, son/sont, la/la/l''a.', 'moderee', 'eleve', 'langue', 'toutes', 'homophone', 'Tu as confondu deux homophones', null, null, null, false, true, null, convert_from(decode('52656d706c6163652070617220756e2061757472652074656d7073206f7520756e6520617574726520706572736f6e6e65203a20c2ab20696c206120c2bb2064657669656e7420c2ab20696c20617661697420c2bb2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-SYNT-01', 'syntaxe', 'Phrase sans verbe, sans sujet, ou dont la construction rend le sens incertain.', 'moderee', 'eleve', 'ecrire', 'toutes', 'phrase incorrecte', 'Ta phrase n''est pas construite correctement', null, null, null, false, true, null, 'Relis chaque phrase a voix basse : si tu manques d''air, coupe-la en deux.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-SYNT-02', 'syntaxe', 'Tournure orale, negation incomplete, familiarite deplacee a l''ecrit.', 'mineure', 'eleve', 'ecrire', 'toutes', 'oral a l''ecrit', 'Tu ecris comme tu parles', null, null, null, false, true, null, convert_from(decode('4c61206e65676174696f6e206563726974652073652064697420746f756a6f75727320656e2064657578206d6f7473203a20c2ab206e65e280a62070617320c2bb2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-PONC-01', 'ponctuation', 'Absence de point, de virgule utile, ou ponctuation du dialogue erronee.', 'mineure', 'eleve', 'ecrire', 'toutes', 'absente ou fautive', 'La ponctuation manque ou est mal placee', null, null, null, false, true, null, 'Un point a la fin de chaque idee, une majuscule apres.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'REEC-TRANSFO', 'reecriture', 'La forme n''a pas ete modifiee, ou l''a ete autrement que ce que la consigne demandait.', 'majeure', 'eleve', 'reecriture', 'reecriture', 'transformation', 'La transformation demandee n''est pas faite', null, 'Une forme dont la transformation est manquee n''est jamais penalisee une seconde fois au titre de la copie.', null, false, true, null, 'Souligne d''abord toutes les formes a changer, puis change-les une par une.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'REEC-COPIE', 'reecriture', 'Erreur de pure copie, ne portant pas sur une forme a modifier. La note de service prevoit pour elle un bareme specifique, propre au sujet.', 'mineure', 'eleve', 'ecrire', 'reecriture', 'erreur de copie', 'Erreur de copie sur un mot qui ne devait pas changer', null, 'Penalite uniquement si le bareme du sujet la renseigne ; jamais cumulee avec REEC-TRANSFO sur la meme forme.', null, false, true, null, 'Recopie le passage mot pour mot, puis relis en pointant chaque mot du doigt.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'REEC-ABSENTE', 'absence_de_reponse', 'La forme attendue est absente de la copie.', 'moderee', 'eleve', 'reecriture', 'reecriture', null, 'Forme non recopiee', null, null, null, false, true, null, 'Verifie que tu as bien recopie tout le passage demande.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-ACCORD', 'dictee', 'Marque de genre, de nombre ou de participe passe erronee.', 'moderee', 'eleve', 'langue', 'dictee', 'accord', 'Erreur d''accord dans la dictee', null, null, null, false, true, null, 'A la relecture, cherche les sujets et accorde les verbes, puis les noms et leurs adjectifs.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-CONJ', 'dictee', 'Terminaison verbale erronee (temps, personne, mode).', 'moderee', 'eleve', 'langue', 'dictee', 'conjugaison', 'Erreur de conjugaison dans la dictee', null, null, null, false, true, null, 'Repere le temps du recit avant d''ecrire : il ne change presque jamais en cours de dictee.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-HOMO', 'dictee', 'Deux mots qui se prononcent pareil ont ete confondus.', 'moderee', 'eleve', 'langue', 'dictee', 'homophone', 'Homophone confondu dans la dictee', null, null, null, false, true, null, 'Apprends trois tests de remplacement : ils suffisent pour la plupart des homophones.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-LEX', 'dictee', 'Orthographe lexicale erronee.', 'mineure', 'eleve', 'ecrire', 'dictee', 'lexique', 'Mot mal orthographie dans la dictee', null, null, null, false, true, null, 'Si tu hesites sur un mot, ecris-le, continue, et reviens dessus a la relecture.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-ACCENT', 'dictee', 'Accent absent, en trop, ou du mauvais type.', 'mineure', 'eleve', 'ecrire', 'dictee', 'accent', 'Accent oublie ou mal choisi', null, null, null, false, true, null, 'Relis en cherchant uniquement les accents : une relecture, un seul objectif.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-MAJ', 'dictee', 'Majuscule absente en debut de phrase ou sur un nom propre, ou majuscule en trop.', 'mineure', 'eleve', 'ecrire', 'dictee', 'majuscule', 'Majuscule oubliee ou mal placee', null, null, null, false, true, null, 'Apres chaque point, une majuscule. Sans exception.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-PONC', 'dictee', 'Signe de ponctuation absent, en trop, ou different de celui qui a ete dicte.', 'mineure', 'eleve', 'ecrire', 'dictee', 'ponctuation', 'Ponctuation de la dictee erronee', null, null, null, false, true, null, 'Ecoute les pauses de la voix : elles indiquent les virgules et les points.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-OUBLI', 'dictee', 'Un mot dicte n''a pas ete ecrit.', 'moderee', 'eleve', 'ecrire', 'dictee', 'mot oublie', 'Un mot du texte manque', null, null, null, false, true, null, 'A la relecture finale, verifie que chaque phrase a bien un sens complet.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-AJOUT', 'dictee', 'Un mot absent du texte dicte a ete ecrit.', 'mineure', 'eleve', 'ecrire', 'dictee', 'mot ajoute', 'Un mot en trop', null, null, null, false, true, null, convert_from(decode('4e27616a6f757465207269656e2071756920c2ab20736f6e6e65206269656e20c2bb203a206563726973207365756c656d656e742063652071756520747520656e74656e64732e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-SEGM', 'dictee', 'Decoupage des mots errone.', 'mineure', 'eleve', 'ecrire', 'dictee', 'segmentation', 'Deux mots colles ou un mot coupe', null, null, null, false, true, null, convert_from(decode('56657269666965206c657320706574697473206d6f7473203a20c2ab20642761626f726420c2bb2c20c2ab2061207065696e6520c2bb2c20c2ab207175656c7175652074656d707320c2bb2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-TRAIT', 'dictee', 'Trait d''union absent ou ajoute a tort.', 'mineure', 'eleve', 'ecrire', 'dictee', 'trait d''union', 'Trait d''union oublie ou en trop', null, null, null, false, true, null, 'Les nombres composes et les verbes inverses prennent un trait d''union.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-APOS', 'dictee', 'Elision absente ou ajoutee a tort.', 'mineure', 'eleve', 'ecrire', 'dictee', 'apostrophe', 'Apostrophe oubliee ou en trop', null, null, null, false, true, null, convert_from(decode('446576616e7420756e6520766f79656c6c652c20c2ab206c6520c2bb2064657669656e7420c2ab206c2720c2bb203a206327657374207072657371756520746f756a6f757273206175746f6d6174697175652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-RECT', 'dictee', 'Graphie issue des rectifications orthographiques. Admise si le bareme du sujet la mentionne.', 'mineure', 'sujet', 'ecrire', 'dictee', 'graphie rectifiee', 'Graphie de l''orthographe rectifiee', null, 'Aucune penalite si la graphie figure dans les graphies admises du sujet.', null, false, true, null, 'Cette graphie est acceptee : rien a corriger.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'DICT-OCR', 'reconnaissance_incertaine', 'Ecart probablement du a la lecture de l''ecriture manuscrite, pas a une faute.', 'mineure', 'reconnaissance', null, 'dictee', 'decalage de transcription', 'Lecture incertaine de la dictee', null, 'Aucune penalite. Declenche une validation humaine bloquante si la note en depend.', null, false, true, null, null, 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CONS-01', 'respect_de_la_consigne', 'Une contrainte explicite du sujet n''est pas respectee.', 'majeure', 'eleve', 'ecrire', 'redaction', 'consigne', 'Tu n''as pas respecte tout ce que demandait le sujet', null, null, null, false, true, null, 'Souligne chaque contrainte du sujet et coche-la quand tu l''as traitee.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CONS-02', 'respect_de_la_consigne', 'Le narrateur, le temps ou le destinataire imposes ne sont pas tenus.', 'moderee', 'eleve', 'ecrire', 'redaction', 'enonciation', 'Tu n''as pas garde la bonne situation d''enonciation', null, null, null, false, true, null, convert_from(decode('456372697320656e206861757420646520746f6e2062726f75696c6c6f6e203a20c2ab206a65202f20696c20c2bb2c20c2ab207061737365202f2070726573656e7420c2bb2e205665726966696520612063686171756520706172616772617068652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-CONS-03', 'respect_de_la_consigne', 'La longueur minimale annoncee par le sujet n''est pas atteinte.', 'moderee', 'eleve', 'ecrire', 'redaction', 'longueur', 'Ton texte est trop court', null, convert_from(decode('4c61207065727465207365206661697420706172206c65206372697465726520c2ab206c6f6e677565757220c2bb206465206c61206772696c6c652c206a616d6169732070617220756e207265747261697420737570706c656d656e74616972652e', 'hex'), 'UTF8'), null, false, true, null, 'Compte tes lignes a mi-parcours : il te reste le temps d''en ajouter.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-COH-01', 'coherence', 'Deux elements du texte sont incompatibles.', 'moderee', 'eleve', 'ecrire', 'redaction', 'contradiction', 'Ton texte se contredit', null, null, null, false, true, null, 'Relis en te demandant : est-ce que tout cela peut arriver au meme personnage ?', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-COH-02', 'coherence', 'La suite ou la reponse contredit le texte support.', 'moderee', 'eleve', 'lire', 'redaction', 'texte support', 'Ton texte ne colle pas au texte de depart', null, null, null, false, true, null, 'Relis les cinq dernieres lignes du texte avant de commencer a ecrire.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ORG-01', 'organisation', 'Absence de decoupage, ou decoupage qui ne suit pas les idees.', 'moderee', 'eleve', 'ecrire', 'redaction', 'paragraphes', 'Ton texte n''est pas organise en paragraphes', null, null, null, false, true, null, 'Une idee, un paragraphe. Va a la ligne et decale la premiere ligne.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ORG-02', 'organisation', 'Absence de connecteurs logiques ou temporels.', 'mineure', 'eleve', 'ecrire', 'redaction', 'connecteurs', 'Tes idees ne sont pas reliees', null, null, null, false, true, null, 'Apprends six connecteurs : d''abord, ensuite, de plus, cependant, car, donc.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ARG-01', 'argumentation', 'Une opinion est avancee sans raison qui la soutienne.', 'majeure', 'eleve', 'ecrire', 'redaction', 'argument absent', 'Tu donnes ton avis sans argument', null, null, null, false, true, null, convert_from(decode('41707265732063686171756520617669732c20656372697320c2ab2070617263652071756520c2bb20657420636f6d706c6574652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ARG-02', 'argumentation', 'L''argument tient en une phrase et n''est pas explique.', 'moderee', 'eleve', 'ecrire', 'redaction', 'argument non developpe', 'Ton argument n''est pas developpe', null, null, null, false, true, null, 'Un argument = une affirmation + une explication + un exemple.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-EX-01', 'exemples', 'Aucun exemple ne vient appuyer les arguments.', 'moderee', 'eleve', 'culture', 'redaction', 'absent', 'Il manque des exemples', null, null, null, false, true, null, 'Prends tes exemples dans tes lectures, tes cours, ou ta vie : les trois comptent.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-EX-02', 'exemples', 'L''exemple est present mais son lien avec l''argument n''est pas explicite.', 'moderee', 'eleve', 'ecrire', 'redaction', 'non relie', 'Ton exemple ne prouve pas ton idee', null, null, null, false, true, null, convert_from(decode('5465726d696e6520746f6e206578656d706c652070617220c2ab20636520717569206d6f6e74726520717565e280a620c2bb2e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-EXP-01', 'expression', 'Emploi repete de mots passe-partout la ou un mot precis etait possible.', 'mineure', 'eleve', 'ecrire', 'redaction', 'vocabulaire', 'Ton vocabulaire reste tres general', null, null, null, false, true, null, convert_from(decode('52656d706c61636520c2ab2063686f736520c2bb2c20c2ab207472756320c2bb2c20c2ab20666169726520c2bb2070617220756e206d6f74207072656369732061206368617175652072656c6563747572652e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-EXP-02', 'expression', 'Repetitions evitables.', 'mineure', 'eleve', 'ecrire', 'redaction', 'repetition', 'Tu repetes les memes mots', null, null, null, false, true, null, 'Utilise des pronoms et des synonymes pour ne pas repeter le nom du personnage.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-HS-01', 'hors_sujet', 'La reponse porte sur autre chose que ce qui est demande.', 'majeure', 'eleve', 'lire', 'toutes', null, 'Ta reponse ne repond pas a la question posee', null, null, null, false, true, null, 'Recopie mentalement la question avant de repondre, et verifie que ta phrase y repond.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-INC-01', 'reponse_incomplete', 'Une partie de ce qui etait attendu manque.', 'moderee', 'eleve', 'lire', 'toutes', null, 'Ta reponse est commencee mais pas finie', null, null, null, false, true, null, convert_from(decode('436f6d70746520636520717565206c61207175657374696f6e2064656d616e6465203a20c2ab206465757820726169736f6e7320c2bb2076657574206469726520646575782e', 'hex'), 'UTF8'), 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ABS-01', 'absence_de_reponse', 'Aucune reponse n''est ecrite.', 'majeure', 'eleve', null, 'toutes', null, 'Tu n''as pas repondu', null, null, null, false, true, null, 'Ecris toujours quelque chose : une reponse partielle rapporte souvent des points.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-ILL-01', 'illisibilite', 'L''ecriture ne permet pas de lire la reponse. Ce n''est PAS une absence de reponse.', 'mineure', 'reconnaissance', null, 'toutes', null, 'Reponse illisible', null, 'Aucune penalite automatique. Validation humaine bloquante.', null, false, true, null, 'Prends le temps de former tes lettres : une reponse juste mais illisible ne rapporte rien.', 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-OCR-01', 'reconnaissance_incertaine', 'Le systeme n''est pas sur d''avoir bien lu ce passage.', 'mineure', 'reconnaissance', null, 'toutes', null, 'Lecture incertaine', null, 'Aucune penalite. Validation humaine.', null, false, true, null, null, 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_francais', 'FR-SUJET-01', 'reponse_incomplete', 'Le sujet, le corrige et le bareme ne concordent pas.', 'majeure', 'sujet', null, 'toutes', 'anomalie du sujet', 'Anomalie du sujet ou du corrige', null, 'Validation humaine bloquante. Aucune consequence pour l''eleve.', null, false, true, null, null, 'Programme de francais du cycle 4 et note de service NOR MENE2515977N', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-CONS-01', 'comprehension_consigne', 'La reponse porte sur autre chose que ce que l''enonce demande.', 'majeure', 'eleve', 'chercher', 'toutes', null, 'Tu n''as pas repondu a la question posee', null, null, null, false, true, null, 'Souligne la question dans l''enonce, et verifie a la fin que ta phrase de conclusion y repond.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-METH-01', 'choix_de_methode', 'La propriete ou l''outil retenu ne s''applique pas a cette situation.', 'majeure', 'eleve', 'modeliser', 'raisonnement', null, 'La methode choisie ne convient pas', null, null, null, false, true, null, 'Avant de calculer, ecris ce que tu cherches et ce que tu connais : la methode s''impose souvent d''elle-meme.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-METH-02', 'choix_de_methode', 'Demarche mathematiquement correcte que le corrige n''avait pas prevue.', 'mineure', 'sujet', 'chercher', 'raisonnement', 'alternative valide', 'Methode differente du corrige mais valide', null, 'Jamais zero d''office. Validation humaine, et points a la hauteur de la demarche.', null, false, true, null, 'Ta methode fonctionne : continue a la rediger clairement.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-RAIS-01', 'raisonnement', 'Une deduction est posee sans que ce qui la justifie soit ecrit.', 'moderee', 'eleve', 'raisonner', 'raisonnement', 'enchainement', 'Ton raisonnement saute une etape', null, null, null, false, true, null, 'Ecris chaque etape, meme celles qui te semblent evidentes : ce sont elles qui rapportent les points.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-RAIS-02', 'raisonnement', 'La conclusion est juste mais rien ne l''etablit.', 'majeure', 'eleve', 'raisonner', 'raisonnement', 'conclusion sans preuve', 'Tu conclus sans avoir demontre', null, null, null, false, true, null, 'Une conclusion correcte sans demonstration ne vaut pas une demonstration.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-RAIS-03', 'raisonnement', 'Un cas particulier est presente comme une preuve generale.', 'moderee', 'eleve', 'raisonner', 'raisonnement', 'exemple pris pour preuve', 'Un exemple ne demontre pas', null, null, null, false, true, null, 'Un exemple peut illustrer, jamais demontrer. Un contre-exemple, lui, suffit a refuter.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-CALC-01', 'calcul_numerique', 'Erreur dans un calcul numerique, sans erreur de methode.', 'mineure', 'eleve', 'calculer', 'toutes', null, 'Erreur de calcul', null, 'Une erreur de calcul isolee laisse intacts les points de raisonnement.', null, false, true, null, 'Refais le calcul de tete pour verifier l''ordre de grandeur.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-CALC-02', 'calcul_numerique', 'Multiplication, division, parentheses ou puissances traitees dans le mauvais ordre.', 'moderee', 'eleve', 'calculer', 'toutes', 'priorites', 'Les priorites operatoires ne sont pas respectees', null, null, null, false, true, null, 'Parentheses, puis puissances, puis multiplications et divisions, puis additions et soustractions.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-LIT-01', 'calcul_litteral', 'Distributivite mal appliquee.', 'moderee', 'eleve', 'calculer', 'toutes', 'developpement', 'Erreur de developpement', null, null, null, false, true, null, 'Multiplie chaque terme de la premiere parenthese par chaque terme de la seconde, sans en oublier.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-LIT-02', 'calcul_litteral', 'Facteur commun mal identifie ou identite remarquable mal employee.', 'moderee', 'eleve', 'calculer', 'toutes', 'factorisation', 'Erreur de factorisation', null, null, null, false, true, null, 'Cherche ce qui apparait dans TOUS les termes.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-LIT-03', 'calcul_litteral', 'Operation appliquee a un seul membre, ou changement de signe oublie.', 'moderee', 'eleve', 'calculer', 'raisonnement', 'equation', 'Erreur de resolution d''equation', null, null, null, false, true, null, 'Ce que tu fais d''un cote, fais-le de l''autre. Toujours.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-FRAC-01', 'fraction', 'Denominateur commun, simplification ou operation sur les fractions erronee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur sur les fractions', null, null, null, false, true, null, 'Pour additionner, meme denominateur ; pour multiplier, non.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-PUIS-01', 'puissance', 'Regle de calcul sur les puissances ou notation scientifique erronee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur sur les puissances', null, null, null, false, true, null, 'Meme base : on additionne les exposants pour un produit.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-PROP-01', 'proportionnalite', 'Situation traitee comme proportionnelle alors qu''elle ne l''est pas, ou coefficient errone.', 'moderee', 'eleve', 'modeliser', 'toutes', null, 'Erreur de proportionnalite', null, null, null, false, true, null, 'Verifie d''abord que le rapport est constant, puis seulement applique la regle.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-POUR-01', 'pourcentage', 'Augmentation, diminution ou pourcentage d''un nombre mal calcule.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur de pourcentage', null, null, null, false, true, null, 'Augmenter de 20 %, c''est multiplier par 1,2. Diminuer de 20 %, c''est multiplier par 0,8.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-FONC-01', 'fonction', 'Image et antecedent confondus, ou expression de la fonction mal utilisee.', 'moderee', 'eleve', 'representer', 'raisonnement', null, 'Erreur sur les fonctions', null, null, null, false, true, null, 'f(3) = 7 se lit : l''image de 3 est 7, l''antecedent de 7 est 3.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GRAPH-01', 'graphique', 'Lecture d''abscisse ou d''ordonnee erronee, ou echelle non prise en compte.', 'moderee', 'eleve', 'representer', 'toutes', null, 'Erreur de lecture graphique', null, null, null, false, true, null, 'Trace au crayon les pointilles jusqu''aux axes avant de lire.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-STAT-01', 'statistique', 'Moyenne, mediane, etendue ou frequence mal calculee ou mal interpretee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur sur les statistiques', null, null, null, false, true, null, 'La mediane se lit sur la serie ORDONNEE : range les valeurs d''abord.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-PROBA-01', 'probabilite', 'Issues mal denombrees, ou probabilite hors de l''intervalle [0 ; 1].', 'moderee', 'eleve', 'modeliser', 'toutes', null, 'Erreur de probabilite', null, null, null, false, true, null, 'Compte les cas favorables, puis tous les cas possibles. Le resultat est toujours entre 0 et 1.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ARITH-01', 'arithmetique', 'Diviseurs, multiples, PGCD, nombres premiers ou criteres de divisibilite errones.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur d''arithmetique', null, null, null, false, true, null, 'Apprends les criteres de divisibilite par 2, 3, 5 et 9 : ils reviennent tout le temps.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-01', 'geometrie', 'La propriete est employee sans que ses conditions d''application soient verifiees.', 'moderee', 'eleve', 'raisonner', 'raisonnement', 'hypotheses', 'Tu n''as pas ecrit les hypotheses', null, null, null, false, true, null, convert_from(decode('456372697320746f756a6f757273203a20c2ab2044616e73206c6520747269616e676c65204142432072656374616e676c6520656e2041e280a620c2bb2e', 'hex'), 'UTF8'), 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-02', 'theoreme', 'Hypotenuse mal identifiee, egalite mal ecrite, ou reciproque confondue avec le theoreme direct.', 'moderee', 'eleve', 'raisonner', 'raisonnement', 'Pythagore', 'Erreur sur le theoreme de Pythagore', null, null, null, false, true, null, 'L''hypotenuse est toujours le cote oppose a l''angle droit, et le plus long.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-03', 'theoreme', 'Configuration non reconnue, rapports mal ecrits, ou reciproque confondue.', 'moderee', 'eleve', 'raisonner', 'raisonnement', 'Thales', 'Erreur sur le theoreme de Thales', null, null, null, false, true, null, 'Ecris les trois rapports dans le meme ordre : petit triangle sur grand triangle.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-04', 'trigonometrie', 'Rapport (cosinus, sinus, tangente) mal choisi, ou cote mal identifie.', 'moderee', 'eleve', 'calculer', 'raisonnement', null, 'Erreur de trigonometrie', null, null, null, false, true, null, 'Cosinus = adjacent sur hypotenuse. Ecris les trois formules avant de choisir.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-05', 'aire', 'Formule d''aire erronee ou mal appliquee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur d''aire', null, null, null, false, true, null, 'Aire du triangle = base fois hauteur divise par 2. La hauteur est perpendiculaire a la base.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-06', 'volume', 'Formule de volume erronee ou mal appliquee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur de volume', null, null, null, false, true, null, 'Prisme et cylindre : aire de base fois hauteur. Pyramide et cone : le tiers.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-07', 'geometrie', 'Symetrie, translation, rotation ou homothetie mal construite ou mal identifiee.', 'moderee', 'eleve', 'representer', 'raisonnement', 'transformation', 'Erreur sur une transformation', null, null, null, false, true, null, 'Une homothetie de rapport k multiplie les longueurs par k et les aires par k au carre.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-GEO-08', 'geometrie', 'La reponse s''appuie sur une mesure prise sur la figure, qui n''est pas a l''echelle.', 'majeure', 'eleve', 'raisonner', 'raisonnement', 'mesure sur la figure', 'Tu as mesure sur le dessin', null, null, null, false, true, null, 'Les figures ne sont pas a l''echelle : ne mesure jamais, demontre.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-UNIT-01', 'unite', 'Le resultat est donne sans unite alors que la question en attend une.', 'mineure', 'eleve', 'communiquer', 'toutes', 'absente', 'Il manque l''unite', null, 'Une unite manquante ne se paie qu''une fois, et pas une seconde fois dans les 2 points de redaction.', null, false, true, null, convert_from(decode('5465726d696e6520746f756a6f7572732070617220756e65207068726173652061766563206c27756e697465203a20c2ab204c27616972652065737420646520323420636dc2b22e20c2bb2e', 'hex'), 'UTF8'), 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-UNIT-02', 'unite', 'Unite incoherente avec la grandeur calculee.', 'moderee', 'eleve', 'communiquer', 'toutes', 'erronee', 'L''unite n''est pas la bonne', null, null, null, false, true, null, convert_from(decode('556e65206c6f6e67756575722065737420656e20636d2c20756e65206169726520656e20636dc2b22c20756e20766f6c756d6520656e20636dc2b32e', 'hex'), 'UTF8'), 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-CONV-01', 'conversion', 'Conversion d''unites erronee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Erreur de conversion', null, null, null, false, true, null, 'Pour les aires, chaque rang vaut 100 ; pour les volumes, 1000.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ARR-01', 'arrondi', 'Arrondi different de celui que le sujet demande.', 'mineure', 'eleve', 'calculer', 'toutes', null, 'Erreur d''arrondi', null, null, null, false, true, null, convert_from(decode('52656c6973206c6120636f6e7369676e65203a20c2ab2061752064697869656d6520c2bb2c20c2ab2061206c27756e69746520c2bb2c20c2ab206120302c31207072657320c2bb206e65207665756c656e74207061732064697265206c61206d656d652063686f73652e', 'hex'), 'UTF8'), 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-VAL-01', 'valeur_exacte', 'Le sujet demandait la valeur exacte, une valeur approchee a ete donnee.', 'moderee', 'eleve', 'calculer', 'toutes', null, 'Valeur exacte attendue', null, null, null, false, true, null, 'Valeur exacte = on garde la racine ou la fraction, on n''utilise pas la calculatrice.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-VAL-02', 'valeur_approchee', 'Valeur approchee donnee la ou le sujet l''autorise.', 'mineure', 'eleve', 'calculer', 'toutes', null, 'Valeur approchee acceptable', null, 'Aucun retrait : le sujet l''autorise.', null, false, true, null, null, 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ALGO-01', 'algorithmique', 'Sequence d''instructions, boucle, condition ou variable mal interpretee.', 'moderee', 'eleve', 'representer', 'toutes', null, 'Erreur sur le programme ou l''algorithme', null, null, null, false, true, null, 'Deroule le programme pas a pas dans un tableau : une ligne par etape.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ALGO-02', 'algorithmique', 'Une partie du script ou de la capture n''est pas lisible avec certitude.', 'mineure', 'reconnaissance', null, 'toutes', 'bloc illisible', 'Bloc de programme illisible', null, 'Aucune penalite. Validation humaine.', null, false, true, null, null, 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-DEM-01', 'demonstration', 'Une des etapes exigees (hypotheses, propriete, remplacement, calcul, unite, conclusion) manque.', 'moderee', 'eleve', 'raisonner', 'raisonnement', null, 'Ta demonstration est incomplete', null, null, null, false, true, null, 'Six etapes : ce que je sais, la propriete, je remplace, je calcule, l''unite, je conclus.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-JUST-01', 'justification', 'Le resultat est donne sans justification, alors que le sujet impose de justifier sauf indication contraire.', 'moderee', 'eleve', 'raisonner', 'raisonnement', null, 'Ta reponse n''est pas justifiee', null, null, null, false, true, null, 'Ecris comment tu as trouve : c''est la demarche qui rapporte le plus de points.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-COM-01', 'communication', 'Calculs non presentes, etapes melangees, absence de phrase de conclusion.', 'mineure', 'eleve', 'communiquer', 'toutes', null, 'Ta redaction est difficile a suivre', null, null, null, false, true, null, 'Une ligne par etape, un signe egal par ligne, une phrase pour conclure.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-CASC-01', 'erreur_en_cascade', 'La reponse est fausse uniquement parce qu''elle reutilise un resultat faux obtenu plus haut, correctement exploite.', 'mineure', 'eleve', 'raisonner', 'raisonnement', null, 'Consequence d''une erreur precedente', null, 'Les points de methode sont CONSERVES. L''erreur initiale ne se paie qu''une fois.', null, false, true, null, 'Ta methode etait bonne : l''erreur venait d''avant.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-INC-01', 'reponse_incomplete', 'La demarche est engagee mais n''aboutit pas.', 'mineure', 'eleve', 'chercher', 'toutes', null, 'Tu n''as pas fini', null, 'Les essais et demarches engagees, meme non aboutis, doivent etre pris en compte (note de service).', null, false, true, null, 'Meme inachevee, ecris ta demarche : les essais engages comptent.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ABS-01', 'absence_de_reponse', 'Aucune trace de recherche.', 'majeure', 'eleve', null, 'toutes', null, 'Tu n''as rien ecrit', null, null, null, false, true, null, 'Ecris toujours ce que tu sais, meme sans finir : cela rapporte des points.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-ILL-01', 'illisibilite', 'Le calcul ou le raisonnement ne peut pas etre lu. Ce n''est PAS une absence de reponse.', 'mineure', 'reconnaissance', null, 'toutes', null, 'Ecriture illisible', null, 'Aucune penalite automatique. Validation humaine bloquante.', null, false, true, null, 'Ecris tes chiffres lisiblement : un 1 qui ressemble a un 7 coute des points.', 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-OCR-01', 'reconnaissance_incertaine', 'Doute sur un signe, un exposant, un indice ou une fraction manuscrite.', 'mineure', 'reconnaissance', null, 'toutes', null, 'Lecture incertaine', null, 'Lecture la plus favorable a l''eleve, puis validation humaine.', null, false, true, null, null, 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence, partie, sous_categorie, libelle_eleve, penalite_defaut, regle_application, plafond_perte, cumul_autorise, points_partiels_possibles, exemple, conseil, source, version)
values ('brevet_mathematiques', 'MA-SUJET-01', 'reponse_incomplete', 'Le sujet, le corrige et le bareme ne concordent pas.', 'majeure', 'sujet', null, 'toutes', 'anomalie du sujet', 'Anomalie du sujet ou du corrige', null, 'Validation humaine bloquante. Aucune consequence pour l''eleve.', null, false, true, null, null, 'Programme de mathematiques du cycle 4, note de service NOR MENE2515977N et liste indicative d''automatismes (octobre 2025)', '1.0.0')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence,
  partie = excluded.partie,
  sous_categorie = excluded.sous_categorie,
  libelle_eleve = excluded.libelle_eleve,
  penalite_defaut = excluded.penalite_defaut,
  regle_application = excluded.regle_application,
  plafond_perte = excluded.plafond_perte,
  cumul_autorise = excluded.cumul_autorise,
  points_partiels_possibles = excluded.points_partiels_possibles,
  exemple = excluded.exemple,
  conseil = excluded.conseil,
  source = excluded.source,
  version = excluded.version;

commit;


-- =====================================================================
--  BLOC C - SOURCES OFFICIELLES
--
--  Aucune regle n'est presentee comme officielle sans sa trace : titre,
--  organisme, URL exacte, date de publication, date de consultation,
--  session concernee et statut.
-- =====================================================================

begin;

insert into public.sources_officielles (code, titre, organisme, url, date_publication, date_maj, date_consultation, session_concernee, statut, resume)
values ('BO_MENE2515977N', 'Modalites d''attribution du diplome national du brevet a compter de la session 2026', convert_from(decode('4d696e697374657265206465206c27456475636174696f6e206e6174696f6e616c6520e280942042756c6c6574696e206f6666696369656c206ec2b0203333', 'hex'), 'UTF8'), 'https://www.education.gouv.fr/bo/2025/Hebdo33/MENE2515977N', '2025-09-02', '2025-09-04', '2026-08-08', 'a compter de 2026', 'officiel', 'Note de service. Source primaire de toutes les regles chiffrees des deux epreuves : duree, bareme total, repartition des points, sujets au choix, calculatrice, prise en compte des essais, programme de reference a partir de 2027.')
on conflict (code) do update set
  titre = excluded.titre,
  organisme = excluded.organisme,
  url = excluded.url,
  date_publication = excluded.date_publication,
  date_maj = excluded.date_maj,
  date_consultation = excluded.date_consultation,
  session_concernee = excluded.session_concernee,
  statut = excluded.statut,
  resume = excluded.resume;

insert into public.sources_officielles (code, titre, organisme, url, date_publication, date_maj, date_consultation, session_concernee, statut, resume)
values ('AUTOMATISMES_2025', 'Liste indicative d''automatismes susceptibles d''etre mobilises lors de l''epreuve ecrite de mathematiques (series generale et professionnelle)', 'Ministere de l''Education nationale', 'https://www.education.gouv.fr/sites/default/files/2025-10/dnb-2026-liste-indicative-d-automatismes-susceptibles-d-tre-mobilis-s-lors-de-l-preuve-crite-de-math-matiques-s-ries-g-n-rale-et-professionnelle--442401.pdf', '2025-10-01', null, '2026-08-08', '2026 et suivantes', 'officiel', 'Themes et intitules exacts des automatismes de la partie 1 : nombres et calculs, espace et geometrie, organisation et gestion de donnees et probabilites, proportionnalite et fonctions, algorithmique et programmation.')
on conflict (code) do update set
  titre = excluded.titre,
  organisme = excluded.organisme,
  url = excluded.url,
  date_publication = excluded.date_publication,
  date_maj = excluded.date_maj,
  date_consultation = excluded.date_consultation,
  session_concernee = excluded.session_concernee,
  statut = excluded.statut,
  resume = excluded.resume;

insert into public.sources_officielles (code, titre, organisme, url, date_publication, date_maj, date_consultation, session_concernee, statut, resume)
values ('EDUSCOL_EPREUVES_DNB', 'Les epreuves du DNB', convert_from(decode('45647573636f6c20e2809420446972656374696f6e2067656e6572616c65206465206c27656e736569676e656d656e742073636f6c61697265', 'hex'), 'UTF8'), 'https://eduscol.education.gouv.fr/5607/les-epreuves-du-dnb', null, null, '2026-08-08', '2026 et suivantes', 'complementaire', 'Page de reference qui heberge les sujets zero. Non consultable automatiquement le 8 aout 2026 (protection anti-robot) : a ouvrir a la main pour recuperer les sujets zero de francais et de mathematiques.')
on conflict (code) do update set
  titre = excluded.titre,
  organisme = excluded.organisme,
  url = excluded.url,
  date_publication = excluded.date_publication,
  date_maj = excluded.date_maj,
  date_consultation = excluded.date_consultation,
  session_concernee = excluded.session_concernee,
  statut = excluded.statut,
  resume = excluded.resume;

insert into public.sources_officielles (code, titre, organisme, url, date_publication, date_maj, date_consultation, session_concernee, statut, resume)
values ('SUJETS_ZERO_2026_SG', 'Sujets zero du DNB session 2026, serie generale : francais (grammaire et comprehension, dictee, redaction) et mathematiques (sujets A et B)', 'Ministere de l''Education nationale - Eduscol', 'https://eduscol.education.gouv.fr/5607/les-epreuves-du-dnb', '2025-12-05', null, '2026-08-09', '2026', 'officiel', 'Sujets zero officiels, lus integralement le 9 aout 2026. Ils attestent la structure reelle d''un sujet : en francais, comprehension 32 points + grammaire 18 points (dont reecriture 10) = 50, dictee 10, redaction 40 ; en mathematiques, 9 automatismes pour 6 points, et des exercices totalisant 12 points auxquels s''ajoutent les 2 points de redaction pour faire les 14 de la partie 2.')
on conflict (code) do update set
  titre = excluded.titre,
  organisme = excluded.organisme,
  url = excluded.url,
  date_publication = excluded.date_publication,
  date_maj = excluded.date_maj,
  date_consultation = excluded.date_consultation,
  session_concernee = excluded.session_concernee,
  statut = excluded.statut,
  resume = excluded.resume;

insert into public.sources_officielles (code, titre, organisme, url, date_publication, date_maj, date_consultation, session_concernee, statut, resume)
values ('BO_PROGRAMMES_CYCLE4_2026', 'Programmes d''enseignement de francais et de mathematiques du cycle 4', convert_from(decode('4d696e697374657265206465206c27456475636174696f6e206e6174696f6e616c6520e280942042756c6c6574696e206f6666696369656c206ec2b0203130', 'hex'), 'UTF8'), 'https://www.education.gouv.fr/bo/2026/Hebdo10/MENE2602912A', '2026-02-18', '2026-03-05', '2026-08-08', 'a confirmer', 'a_confirmer', 'Arrete du 18 fevrier 2026. Le calendrier d''entree en vigueur (5e en 2026, 4e en 2027, 3e en 2028) n''a PAS pu etre verifie sur la source primaire : la page renvoie HTTP 403. Tant qu''il n''est pas confirme, le dispositif ne s''appuie sur aucune de ses dispositions.')
on conflict (code) do update set
  titre = excluded.titre,
  organisme = excluded.organisme,
  url = excluded.url,
  date_publication = excluded.date_publication,
  date_maj = excluded.date_maj,
  date_consultation = excluded.date_consultation,
  session_concernee = excluded.session_concernee,
  statut = excluded.statut,
  resume = excluded.resume;

commit;


-- =====================================================================
--  BLOC D - REGLES OFFICIELLES CHIFFREES
--
--  statut = officiel              : ecrit tel quel dans la source ;
--           officiel_par_deduction: se deduit de la source, et on le dit ;
--           a_confirmer           : AUCUN effet sur la note.
-- =====================================================================

begin;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_DUREE', 'brevet_francais', 'Duree de l''epreuve de francais', '3 heures', null, 'officiel', 'BO_MENE2515977N', 'Duree de l''epreuve : 3 heures', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_TOTAL', 'brevet_francais', 'Bareme total, ramene sur 20', '100 points', 100, 'officiel', 'BO_MENE2515977N', 'Les exercices sont assortis d''un bareme totalisant 100 points, indique dans le sujet. La note obtenue est ensuite ramenee sur 20 pour le calcul de la moyenne.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_TEXTE', 'brevet_francais', 'Travail sur le texte litteraire et, eventuellement, sur une image', '50 points', 50, 'officiel', 'BO_MENE2515977N', 'Travail sur le texte litteraire et, eventuellement, sur une image (50 points - 1 heure et 10 minutes)', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_DICTEE', 'brevet_francais', 'Dictee', '10 points', 10, 'officiel', 'BO_MENE2515977N', 'Dictee (10 points - 20 minutes)', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_DICTEE_LONGUEUR', 'brevet_francais', 'Longueur du texte dicte, serie generale', '600 signes environ', 600, 'officiel', 'BO_MENE2515977N', 'Un texte de 600 signes environ, en lien avec l''oeuvre, est dicte aux candidats de la serie generale.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_REDACTION', 'brevet_francais', 'Redaction', '40 points', 40, 'officiel', 'BO_MENE2515977N', 'Redaction (40 points - 1 heure et 30 minutes)', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_REDACTION_CHOIX', 'brevet_francais', 'Deux sujets de redaction au choix', 'reflexion | imagination', null, 'officiel', 'BO_MENE2515977N', 'Deux sujets au choix sont proposes aux candidats : un sujet de reflexion et un sujet d''imagination.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_REECRITURE', 'brevet_francais', 'Reecriture : cinq ou dix formes, bareme specifique aux erreurs de copie', '5 ou 10 formes', null, 'officiel', 'BO_MENE2515977N', '...de maniere a obtenir cinq ou dix formes modifiees dans la copie de l''eleve. Les erreurs de pure copie ne portant pas sur les formes a modifier sont prises en compte dans l''evaluation selon un bareme specifique.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_DICTIONNAIRE', 'brevet_francais', 'Dictionnaire autorise pour la redaction', 'autorise', null, 'officiel', 'BO_MENE2515977N', 'Les candidats ont le droit, pour cette partie d''epreuve, de consulter un dictionnaire de langue francaise ou un dictionnaire bilingue.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_DUREE', 'brevet_mathematiques', 'Duree de l''epreuve de mathematiques', '2 heures', null, 'officiel', 'BO_MENE2515977N', 'Duree de l''epreuve : 2 heures', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_TOTAL', 'brevet_mathematiques', 'Note totale', '20 points', 20, 'officiel', 'BO_MENE2515977N', 'L''epreuve est notee sur 20.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_AUTOMATISMES', 'brevet_mathematiques', 'Partie 1 - Automatismes', '6 points, 20 minutes', 6, 'officiel', 'BO_MENE2515977N', 'Partie 1 - Automatismes : 6 points - 20 minutes', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_RAISONNEMENT', 'brevet_mathematiques', 'Partie 2 - Raisonnement et resolution de problemes', '14 points, 1 h 40', 14, 'officiel', 'BO_MENE2515977N', 'Partie 2 - Raisonnement et resolution de problemes : 14 points - 1 heure et 40 minutes.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_REDACTION', 'brevet_mathematiques', 'Qualite de la redaction', '2 points', 2, 'officiel', 'BO_MENE2515977N', 'L''evaluation doit prendre en compte la clarte et la precision des raisonnements ainsi que, plus largement, la qualite de la redaction qui sera evaluee sur 2 points.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_REDACTION_INCLUSE', 'brevet_mathematiques', 'Les 2 points de redaction sont COMPRIS dans les 14', 'incluse', null, 'officiel_par_deduction', 'BO_MENE2515977N', 'Deduction arithmetique : la note de service place la phrase dans la partie 2 et fixe le total a 20 pour 6 + 14. Les 2 points ne peuvent donc pas s''ajouter au-dessus des 14. CORROBORE par les deux sujets zero serie generale : leurs exercices de partie 2 totalisent 12 points (3+3+3+3 pour le sujet A, 3+2+4,5+2,5 pour le sujet B), les 2 points de redaction completant les 14 annonces.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_CALCULATRICE', 'brevet_mathematiques', 'Calculatrice', 'autorisee en partie 2 seulement', null, 'officiel', 'BO_MENE2515977N', 'La calculatrice n''est autorisee que sur la partie 2.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_BROUILLON', 'brevet_mathematiques', 'Brouillon', 'autorise sur l''ensemble de l''epreuve', null, 'officiel', 'BO_MENE2515977N', 'Le brouillon est autorise sur l''ensemble de l''epreuve.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_ESSAIS', 'brevet_mathematiques', 'Prise en compte des essais et demarches non abouties', 'obligatoire', null, 'officiel', 'BO_MENE2515977N', 'Doivent etre pris en compte les essais et les demarches engagees, meme non abouties.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_JUSTIFICATION', 'brevet_mathematiques', 'Justification des reponses', 'sauf indication contraire', null, 'officiel', 'BO_MENE2515977N', 'Le sujet precise que toutes les reponses doivent etre justifiees sauf si une indication contraire est donnee.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_EXERCICES_INDEPENDANTS', 'brevet_mathematiques', 'Exercices independants', 'oui', null, 'officiel', 'BO_MENE2515977N', 'Le sujet est constitue d''exercices qui doivent pouvoir etre traites par le candidat independamment les uns des autres.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_COMPETENCES', 'brevet_mathematiques', 'Competences mobilisees', 'chercher, modeliser, representer, raisonner, calculer, communiquer', null, 'officiel', 'BO_MENE2515977N', 'les candidats sont amenes a mobiliser les competences chercher, modeliser, representer, raisonner, calculer et communiquer.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_SOUS_PARTIES', 'brevet_francais', 'Sous-parties du bloc de 50 points', 'comprehension 32 + grammaire 18', null, 'complementaire', 'SUJETS_ZERO_2026_SG', 'Le sujet zero serie generale intitule "I. Comprehension et competences d''interpretation (32 points)" et "II. Grammaire et competences linguistiques (18 points)". La note de service ne fixe pas cette repartition : elle est propre au sujet.', '2026')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('FR_REECRITURE_POIDS', 'brevet_francais', 'Poids de la reecriture dans un sujet reel', '10 points sur les 18 de grammaire', 10, 'complementaire', 'SUJETS_ZERO_2026_SG', 'Question 10 du sujet zero : "Reecrivez le passage suivant en remplacant << je >> par << nous >>. (10 points)". La note de service ne fixe pas ce poids : il est propre au sujet.', '2026')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('MA_AUTOMATISMES_NOMBRE', 'brevet_mathematiques', 'Nombre d''items d''automatismes dans un sujet reel', '9 questions pour 6 points', 9, 'complementaire', 'SUJETS_ZERO_2026_SG', 'Les deux sujets zero serie generale comportent 9 questions d''automatismes. Le sujet B chiffre explicitement les questions 7, 8 et 9 a 1 point chacune. La note de service ne fixe aucun nombre d''items.', '2026')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('PROGRAMME_2027', 'commun', 'Programme de reference a partir de la session 2027', 'programme de la classe de troisieme', null, 'officiel', 'BO_MENE2515977N', 'declinees par le programme de francais de cycle 4 (ou de troisieme a partir de la session 2027)', '2027+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('SERIE', 'commun', 'Serie couverte par ce dispositif', 'generale', null, 'officiel', 'BO_MENE2515977N', 'La note de service distingue serie generale et serie professionnelle. Ce dispositif ne couvre que la serie generale.', '2026+')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

insert into public.brevet_regles_officielles (code, matiere, libelle, valeur, valeur_num, statut, source_code, citation, session)
values ('PROGRAMME_NOUVEAU_CYCLE4', 'commun', 'Calendrier des nouveaux programmes de cycle 4', null, null, 'a_confirmer', 'BO_PROGRAMMES_CYCLE4_2026', null, 'a confirmer')
on conflict (code, matiere) do update set
  libelle = excluded.libelle,
  valeur = excluded.valeur,
  valeur_num = excluded.valeur_num,
  statut = excluded.statut,
  source_code = excluded.source_code,
  citation = excluded.citation,
  session = excluded.session;

commit;


-- =====================================================================
--  BLOC E - PARAMETRES D'EXPLOITATION
-- =====================================================================

begin;

insert into public.brevet_parametres (matiere, cle, valeur, commentaire)
values ('commun', 'seuils_relecture', '{"seuils":[10],"tolerance":0.5}'::jsonb, 'Notes proches d''un seuil administratif : une copie a 9,5 ou 10,5 sur 20 declenche une alerte informative. 10 est le seuil d''obtention du diplome.')
on conflict (matiere, cle) do update set
  valeur = excluded.valeur,
  commentaire = excluded.commentaire;

insert into public.brevet_parametres (matiere, cle, valeur, commentaire)
values ('commun', 'ecart_evaluations_significatif', '{"points":2}'::jsonb, 'Au-dela de 2 points d''ecart entre deux evaluations d''une meme copie, la reference humaine n''est pas presentee comme objective.')
on conflict (matiere, cle) do update set
  valeur = excluded.valeur,
  commentaire = excluded.commentaire;

insert into public.brevet_parametres (matiere, cle, valeur, commentaire)
values ('commun', 'seuil_confiance', '{"valeur":0.85}'::jsonb, 'Sous ce seuil, la correction part systematiquement en validation humaine.')
on conflict (matiere, cle) do update set
  valeur = excluded.valeur,
  commentaire = excluded.commentaire;

insert into public.brevet_parametres (matiere, cle, valeur, commentaire)
values ('brevet_francais', 'seuil_decalage_ocr_dictee', '{"ecarts_consecutifs":6}'::jsonb, 'Serie d''ecarts consecutifs au-dela de laquelle on suspecte un decalage de transcription plutot qu''une avalanche de fautes.')
on conflict (matiere, cle) do update set
  valeur = excluded.valeur,
  commentaire = excluded.commentaire;

insert into public.brevet_parametres (matiere, cle, valeur, commentaire)
values ('brevet_mathematiques', 'qualite_redaction_max', '{"points":2,"incluse_dans_partie_2":true}'::jsonb, 'Les 2 points de qualite redactionnelle sont compris dans les 14 de la partie 2. brevet_verifier() refuse un bareme qui les ajouterait au-dessus.')
on conflict (matiere, cle) do update set
  valeur = excluded.valeur,
  commentaire = excluded.commentaire;

commit;


-- =====================================================================
--  BLOC F - VERIFICATION
-- =====================================================================

select matiere, count(*) as competences
from public.competence_referentiels where matiere like 'brevet_%' group by 1 order by 1;

select matiere, nature, count(*) as codes
from public.taxonomie_erreurs where matiere like 'brevet_%' group by 1, 2 order by 1, 2;

select statut, count(*) as regles from public.brevet_regles_officielles group by 1 order by 1;

-- Aucune regle officielle sans citation : attendu 0 ligne.
select code, matiere from public.brevet_regles_officielles
where statut = 'officiel' and coalesce(btrim(citation), '') = '';
