begin;

-- Compléments utiles au pipeline.
alter table public.corrections
  add column if not exists processing_error text,
  add column if not exists updated_at timestamptz default now();

alter table public.copy_transcriptions
  add column if not exists model_name text,
  add column if not exists raw_response_json jsonb;

create unique index if not exists one_transcription_per_correction
  on public.copy_transcriptions(correction_id);

create index if not exists corrections_status_idx
  on public.corrections(status, created_at);

create index if not exists subject_cards_lookup_idx
  on public.subject_cards(track, exercise_type, status);

-- Premier sujet pilote complet.
insert into public.subject_cards (
  id,
  track,
  exercise_type,
  work_id,
  card_json,
  status
)
values (
  'FR-COM-2025-ENSORCELEE',
  'generale',
  'commentaire',
  'barbey-aurevilly-ensorcelee',
  '{"session":2025,"exam_code":"25-FRGEME1","location":"Métropole","exam_date":"2025-06-13","exercise":"Commentaire littéraire","maximum_score":20,"study_object":"Le roman et le récit du Moyen Âge au XXIe siècle","author":"Jules Barbey d’Aurevilly","work":"L’Ensorcelée","publication_year":1854,"extract_location":"Chapitre 1","introductory_note":"Ce texte évoque la lande normande de Lessay, paysage désertique dans lequel se déroule le récit.","instruction":"Vous commenterez le texte suivant.","source_text":"Placé entre la Haie-du-Puits et Coutances, ce désert normand, où l’on ne rencontrait\nni arbres, ni maisons, ni haies, ni traces d’homme ou de bêtes que celles du passant\nou du troupeau du matin dans la poussière, s’il faisait sec, ou dans l’argile détrempée\ndu sentier, s’il avait plu, déployait une grandeur de solitude et de tristesse désolée qu’il\nn’était pas facile d’oublier. La lande, disait-on, avait sept lieues de tour. Ce qui est\ncertain, c’est que, pour la traverser en droite ligne, il fallait à un homme à cheval et\nbien monté plus d’une couple d’heures. Dans l’opinion de tout le pays, c’était un\npassage redoutable. Quand de Saint-Sauveur-le-Vicomte, cette bourgade jolie comme\nun village d’Écosse et qui a vu Du Guesclin défendre son donjon contre les Anglais,\nou du littoral de la presqu’île, on avait affaire à Coutances et que, pour arriver plus vite,\non voulait prendre la traverse, car la route départementale et les voitures publiques\nn’étaient pas de ce côté, on s’associait plusieurs pour passer la terrible lande ; et c’était\nsi bien en usage qu’on citait longtemps comme des téméraires, dans les paroisses,\nles hommes, en très petit nombre, il est vrai, qui avaient passé seuls à Lessay de nuit\nou de jour.\n\nOn parlait vaguement d’assassinats qui s’y étaient commis à d’autres époques. Et\nvraiment, un tel lieu prêtait à de telles traditions. Il aurait été difficile de choisir une\nplace plus commode pour détrousser un voyageur ou pour dépêcher un ennemi.\nL’étendue, devant et autour de soi, était si considérable et si claire qu’on pouvait\ndécouvrir de très loin, pour les éviter ou les fuir, les personnes qui auraient pu venir au\nsecours des gens attaqués par les bandits de ces parages, et, dans la nuit, un si vaste\nsilence aurait dévoré tous les cris qu’on aurait poussés dans son sein. Mais ce n’était\npas tout.\n\nSi l’on en croyait les récits des charretiers qui s’y attardaient, la lande de Lessay\nétait le théâtre des plus singulières apparitions. Dans le langage du pays, il y revenait.\nPour ces populations musculaires, braves et prudentes, qui s’arment de précautions\net de courage contre un danger tangible et certain, c’était là le côté véritablement\nsinistre et menaçant de la lande, car l’imagination continuera d’être, d’ici longtemps, la\nplus puissante réalité qu’il y ait dans la vie des hommes. Aussi cela seul, bien plus que\nl’idée d’une attaque nocturne, faisait trembler le pied de frêne dans la main du plus\nvigoureux gaillard qui se hasardait à passer Lessay à la tombée.","lexical_notes":[{"term":"lieue","definition":"Unité de longueur valant environ 4 kilomètres."},{"term":"un homme à cheval et bien monté","definition":"Un homme voyageant sur un bon cheval."},{"term":"Du Guesclin","definition":"Célèbre guerrier du XIVe siècle."},{"term":"dépêcher","definition":"En finir avec quelqu’un en le tuant."},{"term":"tangible","definition":"Perceptible, concret."},{"term":"pied de frêne","definition":"Bâton de bois utilisé pour assommer ou tuer quelqu’un."}],"text_movements":[{"order":1,"scope":"Du début à « de nuit ou de jour »","function":"Une description géographique et sociale qui construit l’immensité, le vide et la réputation redoutable de la lande."},{"order":2,"scope":"De « On parlait vaguement » à « Mais ce n’était pas tout »","function":"Le paysage devient un lieu propice au crime ; le silence et l’espace sont personnifiés comme des forces menaçantes."},{"order":3,"scope":"De « Si l’on en croyait » à la fin","function":"Les récits collectifs font glisser le danger tangible vers les apparitions et le fantastique, jusqu’à l’affirmation de la puissance de l’imagination."}],"central_dynamic":"Progression d’une description réaliste et géographique vers un espace de peur, de légende et de possible surnaturel.","main_issues":["La construction progressive d’une atmosphère inquiétante et fantastique.","La transformation du paysage en force active, presque en personnage romanesque.","Le rôle des rumeurs, des voix collectives et de l’imagination dans la perception du réel.","Le passage du danger humain et tangible au danger légendaire ou surnaturel.","L’inscription de la peur dans l’espace, le silence et les réactions des habitants."],"acceptable_problem_questions":["Comment la description de la lande crée-t-elle progressivement une atmosphère inquiétante et fantastique ?","Comment Barbey d’Aurevilly transforme-t-il un paysage réel en espace romanesque de peur et de légende ?","De quelle manière le texte montre-t-il que l’imagination des hommes métamorphose la réalité du paysage ?","Comment la lande devient-elle davantage qu’un simple décor dans cet incipit ?"],"key_textual_evidence":[{"evidence":"« désert normand » ; « ni arbres, ni maisons, ni haies »","analysis":"Hyperbole et accumulation négative qui installent le vide et l’hostilité."},{"evidence":"« grandeur de solitude et de tristesse désolée »","analysis":"Amplification et lexique affectif donnant au paysage une puissance mémorable."},{"evidence":"« disait-on », « On parlait vaguement », « Si l’on en croyait »","analysis":"Énonciation collective et indéterminée qui fait circuler la rumeur et la légende."},{"evidence":"« un si vaste silence aurait dévoré tous les cris »","analysis":"Personnification ou métaphore monstrueuse : le paysage semble absorber les victimes."},{"evidence":"« Mais ce n’était pas tout »","analysis":"Rupture narrative qui relance la peur et prépare le passage au surnaturel."},{"evidence":"« le théâtre des plus singulières apparitions »","analysis":"Superlatif et lexique de l’apparition qui ouvrent une lecture fantastique."},{"evidence":"« l’imagination [...] la plus puissante réalité »","analysis":"Formule générale qui donne la clé du passage : la peur collective agit comme une réalité."},{"evidence":"« faisait trembler le pied de frêne »","analysis":"Métonymie concrète de la peur, même chez les hommes réputés vigoureux."}],"acceptable_plan_families":[{"name":"Progression du réel vers le fantastique","axes":["Un paysage immense, vide et hostile","Un espace rationnellement favorable au danger","Une terre de légendes dominée par l’imagination"]},{"name":"La lande comme personnage romanesque","axes":["Une présence spatiale imposante","Une puissance menaçante et presque monstrueuse","Une réalité reconstruite par les discours et la peur"]},{"name":"Construction de la peur","axes":["L’isolement et la vulnérabilité","Le souvenir du crime et la menace humaine","La rumeur fantastique et la contagion de l’imagination"]}],"common_misreadings":[{"code":"C-COMP","description":"Affirmer comme un fait certain que des fantômes existent dans la lande, alors que le texte rapporte des récits et entretient l’incertitude."},{"code":"C-COMPST","description":"Réduire le texte à une description statique de la nature et ignorer sa progression vers le crime puis les apparitions."},{"code":"C-PARA","description":"Raconter successivement que la lande est grande, dangereuse puis hantée sans analyser la fabrication littéraire de cette peur."},{"code":"C-CATA","description":"Énumérer négations, hyperboles, métaphores et personnifications sans expliquer leur effet dans la progression."},{"code":"C-SUR","description":"Attribuer au narrateur une croyance personnelle absolue dans le surnaturel ou inventer des intentions psychologiques non établies."},{"code":"C-TERM","description":"Employer indistinctement fantastique, merveilleux, gothique, romantique ou épique sans justification précise."},{"code":"C-PROB","description":"Choisir une problématique trop générale telle que « Comment l’auteur décrit-il la lande ? »."}],"non_required_elements":["Reproduire exactement un plan de corrigé.","Connaître l’intégralité de L’Ensorcelée.","Employer obligatoirement le mot « fantastique » si la progression inquiétante est analysée avec précision.","Identifier tous les procédés présents.","Organiser le devoir en exactement trois parties.","Fournir des informations biographiques sur Barbey d’Aurevilly sans lien avec le texte."],"evaluation_priorities":["La fidélité au sens et à l’incertitude du texte.","La compréhension de la progression du passage.","L’articulation citation-procédé-effet-interprétation.","La construction d’un projet de lecture cohérent.","La capacité à ne pas confondre repérage et analyse.","La qualité et la précision de l’expression."],"source_references":[{"type":"official_annals_index","url":"https://eduscol.education.gouv.fr/5199/annales-des-epreuves-du-baccalaureat-des-voies-generale-et-technologique"},{"type":"public_subject_transcription","url":"https://www.leparisien.fr/etudiant/lycee/bac/bac-francais-2025-les-sujets-de-lepreuve-anticipee-en-fin-de-premiere-O5WWNGWUFZBXNOWJIV5R2UEAAU.php"}]}'::jsonb,
  'active'
)
on conflict (id) do update set
  track = excluded.track,
  exercise_type = excluded.exercise_type,
  work_id = excluded.work_id,
  card_json = excluded.card_json,
  status = excluded.status;

-- Les cinq copies authentiques portant sur ce même sujet sont reliées au sujet.
update public.benchmark_cards
set
  subject_id = 'FR-COM-2025-ENSORCELEE',
  error_codes = array['C-COMPST','C-SUR']::text[],
  card_json = card_json || '{"benchmark_role":"niveau_16_analyse_incomplete","same_subject":true}'::jsonb
where id = 'R04';

update public.benchmark_cards
set
  subject_id = 'FR-COM-2025-ENSORCELEE',
  error_codes = array['C-TERM','C-COMPST']::text[],
  card_json = card_json || '{"benchmark_role":"niveau_16_vocabulaire_et_explication","same_subject":true}'::jsonb
where id = 'R05';

update public.benchmark_cards
set
  subject_id = 'FR-COM-2025-ENSORCELEE',
  error_codes = array['C-PROB','C-COMPST']::text[],
  card_json = card_json || '{"benchmark_role":"niveau_18_tres_bon_avec_limites_formelles","same_subject":true}'::jsonb
where id = 'R06';

update public.benchmark_cards
set
  subject_id = 'FR-COM-2025-ENSORCELEE',
  error_codes = array[]::text[],
  card_json = card_json || '{"benchmark_role":"niveau_20_reference_superieure","same_subject":true}'::jsonb
where id = 'R07';

update public.benchmark_cards
set
  subject_id = 'FR-COM-2025-ENSORCELEE',
  error_codes = array['C-COMP','C-SUR','L-LANG']::text[],
  card_json = card_json || '{"benchmark_role":"niveau_18_interpretation_parfois_vague","same_subject":true}'::jsonb
where id = 'R09';

commit;

-- Vérification immédiate.
select id, track, exercise_type, status
from public.subject_cards
where id = 'FR-COM-2025-ENSORCELEE';

select id, score, subject_id, error_codes, validation_status
from public.benchmark_cards
where subject_id = 'FR-COM-2025-ENSORCELEE'
order by score, id;
