# Tableau de bord des bacs blancs

Une page pour organiser les épreuves : **`/admin/bacs-blancs`** (bouton
📅 Bacs blancs en haut de l'espace prof, visible de l'administratrice seule).

Elle ne remplace pas `/admin/correction` : là-bas on surveille la machine à
corriger, ici on organise l'épreuve elle-même.

---

## Créer un bac blanc

Bouton **« ＋ Nouveau bac blanc »**, en haut à droite de la page. La fenêtre
demande, dans l'ordre : la matière, la date, l'heure de début et de fin, le
nombre de places, le nombre de professeurs prévus — puis **la liste complète des
professeurs de la base**, à cocher. Ceux qui déclarent la matière choisie
remontent en tête avec une pastille verte. Un professeur oublié se rattrape
depuis la carte de l'épreuve : le menu « Choisir un professeur… » est le même.

Deux refus au moment de créer, plutôt qu'une mauvaise surprise plus tard :

- **une heure de début illisible** (« le matin », « 9 heures ») — toute la
  publication automatique du sujet se calcule depuis elle ;
- **un doublon** matière + date, que la base refuserait avec un message
  incompréhensible.

La liste des professeurs, elle, se gère sur **`/admin/profs`** (onglet
👥 Profs & accès) : valider une candidature, définir un mot de passe, suspendre
un compte. Tout professeur qui y figure et n'est pas suspendu apparaît dans la
fenêtre de création.

**Une session créée ici est immédiatement proposée aux familles** sur la page
d'inscription : elles lisent `/api/sessions`, donc la base. Le tableau
`SESSIONS_PLATEFORME` de `src/lib/sessions.ts` ne sert plus que de secours si
Supabase ne répond pas.

Si des dates ne figurent que dans ce fichier (c'était le cas des six brevets
blancs), une commande les recopie en base et rattache au passage les
inscriptions restées orphelines :

```bash
npm run sessions:verifier       # rapport, n'écrit rien
npm run sessions:synchroniser   # écrit
```

---

## Ce que la page montre, par bac blanc

| | |
|---|---|
| **Compte à rebours** | vert au-delà de 3 semaines, orange en dessous, rouge à moins d'une semaine |
| **Élèves inscrits** | compté en direct dans `inscriptions`, avec le nombre de places |
| **Professeurs** | assigner / retirer, avec les profs qui déclarent la matière en tête de liste |
| **Sujet** | déposer un fichier, le rendre visible du prof ou le garder masqué, le télécharger, le supprimer |
| **Retours** | une fois l'épreuve passée, ce que chaque prof a répondu |

En haut, les alertes : épreuve à moins de 3 semaines sans sujet, sans prof, ou
retour de prof qui manque.

---

## Ce que le prof voit

Sur la page de sa session (`/espace-prof/session/<id>`), sous les élèves :

1. **Le sujet de l'épreuve** — seulement ceux marqués « visible du prof ». Le
   fichier n'est jamais servi par une URL fixe : un lien signé de **15 minutes**
   est fabriqué à la demande. Un sujet d'examen ne doit pas traîner dans un
   historique de navigateur partagé.
2. **Le questionnaire de fin de session**, qui n'apparaît qu'une fois l'épreuve
   passée : déroulement, présents / absents, durée, difficulté du sujet, niveau
   du groupe, incidents, ce qu'ont dit les élèves, ce qui lui manquerait, note
   d'organisation sur 5, et s'il recommencerait. Tout est facultatif, et il peut
   modifier sa réponse autant qu'il veut.

Un prof ne voit que les sessions où il est assigné : les deux routes vérifient
l'assignation avant de répondre, pas seulement la connexion.

---

## Mise en service — une seule chose à faire

**1. Le bucket de stockage** ✅ déjà créé (`sujets`, privé, 25 Mo par fichier).
Refaire au besoin : `node scripts/preparer-bacs-blancs.mjs --apply`.

**2. Les deux tables** ⚠️ **à jouer par toi** : ouvre le **SQL Editor du projet
CRM** (celui de `NEXT_PUBLIC_SUPABASE_URL`, pas celui du pipeline de
correction), colle tout `supabase/sql/41_bacs_blancs_pilotage.sql`, Run.

Ça crée `session_sujets` et `session_retours`. Tant que ce n'est pas fait, la
page fonctionne mais affiche un bandeau : l'assignation des profs marche déjà
(elle utilise `session_coachs`, qui existait), le dépôt de sujet et les retours
non.

Pour vérifier après coup :

```bash
node scripts/preparer-bacs-blancs.mjs
```

---

## Ce qui a été vérifié, et ce qui ne l'a pas été

Vérifié en local sur la vraie base : la page charge les 5 sessions avec le bon
nombre d'élèves, l'assignation d'un prof s'écrit et se retire, les deux routes
refusent un visiteur non connecté et un prof non assigné, et la page dégrade
proprement quand les tables manquent.

**Pas encore vérifié** : le dépôt d'un sujet et l'envoi d'un retour — ils ont
besoin des deux tables. À faire une fois le SQL joué : dépose un PDF sur le bac
blanc de français, coche « visible du prof », et ouvre la session côté prof.

---

## Le lien avec le pipeline de correction

`session_sujets.subject_card_id` peut porter l'identifiant de la fiche du sujet
dans le pipeline (`subject_cards`, autre projet Supabase). C'est le pont entre
« le sujet que le prof distribue » et « le sujet sur lequel l'IA corrige ».

Aujourd'hui ce champ se remplit à la main. Le sujet déposé ici **n'installe pas
tout seul** la fiche du pipeline : envoie-le-moi, ou dis-moi de brancher les
deux, et le dépôt créera la fiche de correction dans la foulée.
