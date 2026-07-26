-- Ne lancer qu’après validation pédagogique de la grille par un professeur.
update public.rubrics
set status = 'active'
where id = 'fr_commentaire_general_v1';

select id, track, exercise_type, version, status
from public.rubrics
where id = 'fr_commentaire_general_v1';
