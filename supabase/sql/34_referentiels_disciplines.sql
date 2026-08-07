-- =====================================================================
--  REFERENTIELS PAR DISCIPLINE : COMPETENCES + TAXONOMIE D'ERREURS
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Genere par scripts/seed-referentiels.mjs, deja applique par API.
--  Prerequis : supabase/sql/33_bareme_par_sujet.sql.
--
--  24 competence(s), 53 code(s) d'erreur.
--  Idempotent : chaque insert est un upsert sur la cle primaire.
--  100% ASCII : accents encodes en hexadecimal.
-- =====================================================================

-- =====================================================================
--  BLOC A - COMPETENCES
--  toujours_mobilisee = false : competence evaluee UNIQUEMENT quand le
--  sujet la mobilise. Sinon 'non_applicable', jamais zero.
-- =====================================================================

begin;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'chercher', 'Chercher', 'S''engager dans la recherche : extraire l''information utile, tester, essayer un cas particulier, reformuler la question en termes mathematiques.', 1, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'modeliser', 'Modeliser', 'Traduire une situation en objet mathematique (fonction, suite, loi de probabilite, configuration de l''espace) et revenir a la situation pour interpreter.', 2, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'representer', 'Representer', 'Choisir et employer un registre adapte : graphique, tableau de variations, arbre pondere, figure, ecriture algebrique, et passer de l''un a l''autre.', 3, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'raisonner', 'Raisonner', 'Demontrer : enoncer les hypotheses, nommer le theoreme employe, verifier ses conditions, enchainer les deductions, conclure. C''est la demonstration qui est notee, pas le resultat.', 4, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'calculer', 'Calculer', 'Mener un calcul exact ou approche, controler son ordre de grandeur, respecter l''arrondi et l''unite demandes.', 5, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'communiquer', 'Communiquer', 'Rediger avec des notations justes, des quantificateurs et des connecteurs logiques, et enoncer le resultat en phrase, replace dans le contexte.', 6, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('maths', 'algorithmique', 'Algorithmique et programmation', 'Lire, completer ou ecrire un algorithme ou un script Python. Evaluee UNIQUEMENT si le sujet en comporte : sinon ''non_applicable'', jamais zero.', 7, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'approprier', 'S''approprier', 'S''approprier la situation : identifier le systeme etudie, le referentiel, l''etat initial et l''etat final, reformuler la question posee, reperer les grandeurs pertinentes dans l''enonce.', 1, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'analyser', 'Analyser / Raisonner', 'Construire la demarche : choisir une loi ou un modele, verifier son domaine de validite, organiser les etapes de la resolution, formuler des hypotheses.', 2, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'realiser', 'Realiser', 'Mener les calculs, appliquer les relations, effectuer les conversions, exploiter les donnees numeriques.', 3, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'valider', 'Valider', 'Controler la coherence du resultat : ordre de grandeur, signe, unite, comparaison a une valeur de reference, retour critique sur les hypotheses.', 4, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'communiquer', 'Communiquer', 'Rendre compte de facon scientifique : vocabulaire exact, notations, phrase de conclusion, presentation lisible du raisonnement.', 5, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'demarche_experimentale', 'Demarche experimentale', 'Concevoir ou critiquer un protocole, choisir un materiel, identifier une source d''erreur experimentale. Evaluee seulement si le sujet comporte une partie experimentale.', 6, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'exploitation_documents', 'Exploitation de documents', 'Extraire et croiser l''information utile de documents fournis, sans paraphraser ni ajouter ce qui n''y est pas.', 7, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'exploitation_graphiques', 'Exploitation de graphiques', 'Lire une courbe, determiner un coefficient directeur, une asymptote, un temps caracteristique, une tangente.', 8, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'schemas_modelisation', 'Schemas et modelisation', 'Produire un schema legende, un bilan des forces, un circuit, un schema de montage conforme aux conventions.', 9, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'unites_conversions', 'Unites et conversions', 'Employer l''unite juste, convertir, controler l''homogeneite d''une relation.', 10, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'chiffres_significatifs', 'Chiffres significatifs', 'Afficher une precision compatible avec celle des donnees de l''enonce.', 11, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'incertitudes', 'Incertitudes de mesure', 'Estimer et exprimer une incertitude, comparer un ecart a l''incertitude. Evaluee seulement lorsque le sujet l''attend explicitement.', 12, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'equations_chimiques', 'Equations chimiques', 'Ecrire et ajuster une equation de reaction, respecter les etats physiques et la conservation des elements et des charges.', 13, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'bilans_matiere', 'Bilans de matiere', 'Construire un tableau d''avancement, identifier le reactif limitant, mener un bilan de quantite de matiere.', 14, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'sens_physique', 'Sens physique du resultat', 'Interpreter le resultat dans la situation reelle : ce que vaut un ordre de grandeur, ce qu''un signe signifie, ce qu''un resultat aberrant revele.', 15, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'conformite_protocole', 'Conformite du protocole', 'Verifier que le protocole propose repond bien a la question posee et respecte les conditions d''usage du materiel.', 16, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('physique-chimie', 'securite', 'Securite experimentale', 'Reperer et prendre en compte les risques (pictogrammes, equipements de protection, elimination des dechets). Evaluee seulement quand le sujet la mobilise.', 17, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle,
  description = excluded.description,
  ordre = excluded.ordre,
  toujours_mobilisee = excluded.toujours_mobilisee;

commit;


-- =====================================================================
--  BLOC B - TAXONOMIE D'ERREURS
--  nature separe les quatre familles : erreur de l'eleve, incident de
--  transcription, incertitude de reconnaissance, anomalie du sujet.
--  gravite est PEDAGOGIQUE : elle ne retire aucun point.
-- =====================================================================

begin;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-ALGO-01', 'algorithmique', 'Algorithme ou script Python non executable : condition d''arret fausse, variable non initialisee, boucle qui ne se termine pas, resultat renvoye au mauvais moment.', 'moderee', 'eleve', 'algorithmique')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-ARBRE-01', 'arbre', 'Arbre pondere incomplet ou incoherent : branches d''un meme noeud dont la somme ne fait pas 1, evenement contraire oublie.', 'moderee', 'eleve', 'modeliser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-BINOM-01', 'loi_binomiale', 'Loi binomiale invoquee sans verifier ses conditions (repetition identique, independance, deux issues) ou parametres n et p mal identifies.', 'majeure', 'eleve', 'modeliser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-CALC-01', 'calcul_elementaire', 'Erreurs de calcul elementaires repetees (signes, fractions, developpement, puissances) qui faussent les resultats sans que la demarche soit en cause.', 'moderee', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-COND-01', 'probabilites_conditionnelles', 'Confusion entre P_A(B) et P(A inter B), ou formule des probabilites totales appliquee sur une partition qui n''en est pas une.', 'majeure', 'eleve', 'modeliser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-CTREX-01', 'contre_exemple', convert_from(decode('41666669726d6174696f6e2066617573736520726566757465652070617220756e206578656d706c652069736f6c652070726573656e746520636f6d6d6520756e65207072657576652067656e6572616c652c206f752061666669726d6174696f6e20767261696520c2ab2070726f7576656520c2bb2070617220756e207365756c2063617320706172746963756c6965722e', 'hex'), 'UTF8'), 'moderee', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-DERIV-01', 'derivation', 'Derivee fausse : regle du produit, du quotient ou de la composee mal appliquee, derivee de exp ou de ln inexacte.', 'majeure', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-ESP-01', 'esperance', 'Esperance, variance ou ecart-type mal calcules, ou interpretes comme une valeur certaine plutot que comme une moyenne sur un grand nombre de repetitions.', 'moderee', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-EXP-01', 'exp_et_ln', 'Regles de calcul sur exp et ln mal appliquees : ln(a+b) traite comme ln(a)+ln(b), exponentielle rendue negative, domaine de definition du logarithme ignore.', 'moderee', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-INT-01', 'integration', 'Primitive fausse, bornes oubliees ou interverties, aire donnee sans unite d''aire ni signe controle.', 'majeure', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-JUST-01', 'justification', convert_from(decode('41666669726d6174696f6e20706f7365652073616e732064656d6f6e7374726174696f6e203a20c2ab206f6e20766f69742071756520c2bb2c20c2ab20696c206573742065766964656e742071756520c2bb2c206c6563747572652067726170686971756520646f6e6e656520636f6d6d65207072657576652e20456e206d617468656d617469717565732c206c6520726573756c746174206e2765737420706173206c61207265706f6e73652c206c61206a757374696669636174696f6e206c276573742e', 'hex'), 'UTF8'), 'majeure', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-LIM-01', 'limites', 'Forme indeterminee annoncee puis conclue sans etre levee, ou limite affirmee sans theoreme (comparaison, encadrement, croissances comparees).', 'majeure', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-PARAM-01', 'parametrage', 'Representation parametrique mal employee : meme parametre reutilise pour deux droites distinctes, systeme resolu sans verifier la solution.', 'moderee', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-PLAN-01', 'plans_et_droites', 'Vecteur normal et vecteur directeur confondus, ou equation cartesienne de plan utilisee comme une representation parametrique.', 'majeure', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-QCM-01', 'reponse_non_justifiee', 'Reponse choisie sans justification dans un exercice qui l''exige : la justification EST l''objet de l''evaluation, la bonne case ne vaut rien seule.', 'majeure', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-RECUR-01', 'recurrence', 'Recurrence incomplete : initialisation absente, hypothese de recurrence jamais enoncee, ou heredite qui utilise ce qu''elle doit demontrer.', 'majeure', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-REDAC-01', 'redaction', 'Redaction non mathematique : quantificateurs absents, meme lettre employee pour deux objets differents, resultat jamais enonce en phrase, aucune conclusion en contexte.', 'moderee', 'eleve', 'communiquer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-SCAL-01', 'produit_scalaire', 'Produit scalaire mal calcule ou mal interprete : nul confondu avec colineaire, norme oubliee dans la formule de l''angle.', 'moderee', 'eleve', 'calculer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-SUITE-01', 'suites', 'Nature d''une suite affirmee sans preuve (raison jamais calculee), ou suite auxiliaire introduite sans montrer qu''elle est geometrique ou arithmetique.', 'moderee', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-TRANS-01', 'transcription', 'Symbole, indice, exposant ou signe incertain dans la transcription : declenche une relecture humaine, jamais une sanction.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-UNIT-01', 'interpretation', 'Resultat livre sans unite, sans arrondi conforme a la consigne ou sans interpretation dans la situation etudiee.', 'mineure', 'eleve', 'communiquer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-VAR-01', 'variations', 'Tableau de variations incoherent avec le signe reellement etudie, ou variations annoncees sans etude de signe.', 'moderee', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'MA-VECT-01', 'vecteurs', 'Colinearite, orthogonalite ou coplanarite affirmee sans calcul : le dessin ou l''intuition tiennent lieu de preuve.', 'majeure', 'eleve', 'raisonner')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'TR-ILLISIBLE-01', 'transcription', 'Formule, symbole, indice, exposant ou signe illisible ou incertain dans la transcription. Ce n''est jamais une erreur de l''eleve : cela declenche une verification de l''image d''origine.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'TR-NON-TRANSCRIT-01', 'transcription', 'Production non textuelle absente de la transcription (tableau de variations, courbe, figure, arbre, schema, montage). Le correcteur ne la juge pas, il la signale.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'RC-METHODE-ALTERNATIVE-01', 'reconnaissance', 'L''eleve emploie une methode qui parait mathematiquement ou physiquement valide mais qui n''est pas prevue au bareme. Relecture humaine obligatoire, jamais zero d''office.', 'moderee', 'reconnaissance', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'SU-ANOMALIE-01', 'sujet', 'Le sujet ou le corrige parait comporter une erreur, une ambiguite ou une contradiction. Anomalie du dispositif, pas de la copie.', 'majeure', 'sujet', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('maths', 'SU-BAREME-CONTRADICTION-01', 'sujet', 'Deux regles du bareme se contredisent sur cette question. Relecture humaine obligatoire.', 'majeure', 'sujet', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-ADV-01', 'avancement', 'Tableau d''avancement incoherent : etat initial, avancement maximal ou reactif limitant mal identifies.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-CHEM-01', 'equation_chimique', 'Equation chimique non ajustee ou espece mal ecrite : la stoechiometrie qui en decoule est fausse.', 'majeure', 'eleve', 'realiser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-CONCL-01', 'conclusion', 'Resultat numerique livre sans phrase de conclusion ni controle de vraisemblance.', 'moderee', 'eleve', 'communiquer')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-DOC-01', 'paraphrase', 'Document paraphrase sans exploitation : la donnee est recopiee, jamais prelevee ni reliee a la question posee.', 'moderee', 'eleve', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-ENER-01', 'bilan_energetique', 'Bilan energetique conduit sans definir le systeme ni ses frontieres : transferts comptes deux fois ou oublies.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-FORCE-01', 'bilan_des_forces', 'Bilan des forces incomplet ou faux : force oubliee, force inventee, systeme etudie non defini.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-GRAPH-01', 'graphique', 'Exploitation graphique defaillante : axes non legendes, unites absentes, lecture ou pente non justifiee.', 'moderee', 'eleve', 'realiser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-INCERT-01', 'incertitudes', 'Incertitude ignoree ou traitee comme une erreur : sources non identifiees, resultat donne sans intervalle.', 'moderee', 'eleve', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-KIN-01', 'cinetique', 'Confusion entre vitesse de reaction, temps de demi-reaction et etat d''equilibre.', 'moderee', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-MODEL-01', 'modele_non_justifie', 'Modele ou loi employe hors de son domaine de validite, ou applique sans justifier les hypotheses (systeme, referentiel, conditions).', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-PH-01', 'ph_concentration', 'Confusion entre pH, concentration et quantite de matiere : grandeurs employees les unes pour les autres.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-PROTO-01', 'protocole_non_reproductible', 'Protocole non reproductible : etapes dans le desordre, volumes ou concentrations non chiffres, verrerie non nommee.', 'majeure', 'eleve', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-RC-01', 'circuit_rc', 'Confusion charge / decharge, ou constante de temps mal lue, mal calculee ou mal interpretee.', 'moderee', 'eleve', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-SAFE-01', 'securite', 'Securite absente ou fausse : ni EPI, ni pictogramme, ni precaution, alors que les especes manipulees l''exigent.', 'majeure', 'eleve', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-SIG-01', 'chiffres_significatifs', 'Chiffres significatifs injustifies : precision affichee sans rapport avec celle des donnees de l''enonce.', 'mineure', 'eleve', 'valider')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-SIGN-01', 'signe_projection', 'Erreur de signe ou de projection vectorielle : axe choisi puis non respecte, composante inversee.', 'moderee', 'eleve', 'realiser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-TITR-01', 'equivalence', 'Equivalence mal identifiee ou relation a l''equivalence fausse : la stoechiometrie du titrage n''est pas respectee.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-TRANS-01', 'transcription', 'Symbole, indice, exposant ou puissance de dix incertain dans la transcription : declenche une relecture humaine, jamais une sanction.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-UNIT-01', 'unites', 'Unite absente, incompatible ou non convertie : le resultat numerique n''a pas de sens physique tant que son unite n''est pas juste.', 'majeure', 'eleve', 'realiser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'PC-WAVE-01', 'ondes', 'Confusion entre periode, frequence, longueur d''onde et celerite ; relation employee sans verifier ses grandeurs.', 'majeure', 'eleve', 'analyser')
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'TR-ILLISIBLE-01', 'transcription', 'Formule, symbole, indice, exposant ou signe illisible ou incertain dans la transcription. Ce n''est jamais une erreur de l''eleve : cela declenche une verification de l''image d''origine.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'TR-NON-TRANSCRIT-01', 'transcription', 'Production non textuelle absente de la transcription (tableau de variations, courbe, figure, arbre, schema, montage). Le correcteur ne la juge pas, il la signale.', 'majeure', 'transcription', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'RC-METHODE-ALTERNATIVE-01', 'reconnaissance', 'L''eleve emploie une methode qui parait mathematiquement ou physiquement valide mais qui n''est pas prevue au bareme. Relecture humaine obligatoire, jamais zero d''office.', 'moderee', 'reconnaissance', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'SU-ANOMALIE-01', 'sujet', 'Le sujet ou le corrige parait comporter une erreur, une ambiguite ou une contradiction. Anomalie du dispositif, pas de la copie.', 'majeure', 'sujet', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence)
values ('physique-chimie', 'SU-BAREME-CONTRADICTION-01', 'sujet', 'Deux regles du bareme se contredisent sur cette question. Relecture humaine obligatoire.', 'majeure', 'sujet', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine,
  description = excluded.description,
  gravite = excluded.gravite,
  nature = excluded.nature,
  competence = excluded.competence;

commit;


-- =====================================================================
--  BLOC C - VERIFICATION
-- =====================================================================

select matiere, count(*) as competences from public.competence_referentiels group by 1 order by 1;
select matiere, nature, count(*) as codes from public.taxonomie_erreurs group by 1, 2 order by 1, 2;
