# Ce qu'il reste à saisir pour que le brevet note

## L'installation est complète

Vérifiable à tout moment : `npm run brevet:verifier` → **19 contrôles verts, 0 problème**.

- SQL `42_brevet_socle.sql` et `43_brevet_referentiels.sql` : **joués** (20 tables répondent)
- Edge Functions `correct-brevet-francais` (v1) et `correct-brevet-maths` (v2) : **déployées et ACTIVE**
- Référentiels : 6 compétences + 67 codes d'erreur en français, 6 + 45 en maths
- Sujets zéro 2026 installés : français, maths A, maths B
- Le baccalauréat est intact (17 corrections, 24 compétences, 53 codes hors brevet)

**Rien n'est cassé.** Ce qui bloque n'est pas technique.

## Pourquoi aucune copie ne peut être notée

Les sujets zéro sont **publiés par le ministère sans corrigé**. Le moteur refuse
donc de noter, et c'est voulu : `scripts/brevet/sujets-zero.mjs` dit
explicitement « on ne l'invente pas ».

État réel du barème français (version `fe8a7f55-c09c-4396-aa70-1b98a88b4d0a`) :

| Partie | Points saisis | Attendu | Ce qui manque |
|---|---|---|---|
| Compréhension | 32 | 32 | ✅ structure OK, mais 0 élément attendu |
| Grammaire | 8 | 18 | les 10 pts de réécriture (0 forme listée) |
| Dictée | 0 | 10 | les règles de retrait (texte présent) |
| Rédaction | 0 | 40 | les critères des 2 grilles |

**Total : 40 / 100 points. 15 blocages.**

Les 12 questions ont bien leur libellé officiel et leurs points, mais leur
champ `elements_attendus` est un tableau vide : personne n'a écrit le corrigé.

## Les quatre choses à saisir

### 1. Les éléments attendus des 12 questions — un professeur

C'est le corrigé. Il demande d'avoir lu le texte (Cendrars, *L'Homme foudroyé*)
et de décider ce qui vaut les points. Exemple, question 1 (4 pts) :
« Donnez un titre à chacune des quatre parties du texte. »

### 2. Les formes de la réécriture — mécanique, mais à vérifier

Consigne : remplacer « je » par « nous » dans un passage donné. Chaque forme à
modifier vaut une fraction des 10 points. La transformation est grammaticale,
donc dérivable — mais la répartition des points, non.

### 3. Les règles de retrait de la dictée — décision pédagogique

Le texte de la dictée **est en base**. Ce qui manque : combien on retire par
erreur, et jusqu'où. **Aucun barème national de dictée n'existe** — c'est à
l'établissement de trancher. Sans ces règles, le moteur renvoie `score: null`
plutôt que d'inventer une note.

### 4. Les critères des deux grilles de rédaction — décision pédagogique

Deux grilles distinctes de 40 points : *imagination* et *réflexion*. Leurs
intitulés officiels sont en base, leurs critères sont à définir.

## Où saisir

**Par l'interface** (elle valide, contrôle les totaux, et refuse ce qui ne colle
pas) :

    /admin/brevet/francais/51019c11-0385-4359-b932-9a0e5adf1c75
    /admin/brevet/mathematiques

Accès réservé à l'administratrice (`role = 'admin'`, connexion via `/espace-prof`).

**Pas par le SQL Editor.** Les tables ont des contraintes fines (catégories de
dictée fermées à 16 valeurs, unicité par version, triggers de recalcul) et
l'API `PUT /api/admin/brevet/francais/[examId]/bareme` les respecte. Écrire à la
main en SQL, c'est se tromper de colonne — `elements_attendus` est un `jsonb`,
pas du texte.

## L'alternative si personne n'a le corrigé du sujet zéro

Le sujet zéro sert de **structure de référence**, pas forcément de sujet
d'examen. Pour un vrai brevet blanc, créer un sujet Matinées du Bac avec son
propre corrigé (« + Nouveau brevet blanc ») est plus simple que de reconstituer
le corrigé d'un sujet officiel qui n'en a pas.

## Vérifier après saisie

    npm run brevet:verifier

Puis sur la page du sujet : les 15 blocages doivent disparaître et le total
passer à 100 / 100. Tant qu'il reste un blocage, le verrouillage de la version
est refusé — et c'est le verrouillage qui autorise la correction hors étalon.
