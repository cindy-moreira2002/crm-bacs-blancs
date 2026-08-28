# La console du prof — ce qu'il te reste à faire

La refonte est livrée dans le code. Quatre étapes de ton côté, dans cet ordre.
Les deux premières sont indispensables, la 3 et la 4 sont chacune un « plus ».

---

## Ce que ça change, en une phrase

Le prof ouvre **un seul écran** le jour de l'épreuve —
`/espace-prof/session/<id>`, bouton « Ouvrir ma console → » — et y trouve : les
salles Discord, **son** classeur de correction, le dossier des copies, ses
élèves avec le lien de leur salle et de leur copie, et **un bandeau rouge avec
un bip quand un élève lève la main**.

---

## Étape 1 — Passer les deux scripts SQL (obligatoire)

Sans eux, les nouveautés ne s'écrivent nulle part. Le reste de l'espace prof
continue de marcher normalement — c'est volontaire.

Ouvre le **SQL Editor du projet CRM** (celui qui contient la table
`inscriptions`, PAS le projet pipeline) :
https://supabase.com/dashboard/project/orpbfnmdlvxmkvyrpvtj/sql/new

### 1a. `supabase/sql/51_console_prof.sql`

Colle tout le fichier → **Run**.

**Résultat attendu** — 5 lignes, **`1` dans la colonne `present` sur chacune** :

| quoi | nom | present |
|---|---|---|
| table | appels_aide | 1 |
| colonne | sessions_bacs_blancs.drive_copies_url | 1 |
| colonne | inscriptions.copie_doc_url | 1 |
| reglage | sheet_correction_url | 1 |
| reglage | drive_copies_url | 1 |

### 1b. `supabase/sql/52_classeurs_correction.sql`

Colle tout le fichier → **Run**.

**Résultat attendu** — une ligne : `table | classeurs_correction | 1`.

Les deux scripts sont rejouables : si une ligne affiche `0`, relance-les.

---

## Étape 2 — Le dossier des copies (1 minute)

1. https://inscription.matineesdubac.fr/admin/bacs-blancs
2. Encadré **🗝️ Réglages du jour J**, champ **📁 Dossier des copies** : colle
   l'adresse du dossier Drive → **Enregistrer**.

**Résultat attendu** : la phrase verte « Enregistré — visible par tous les profs. »

Le champ **📊 Grille de correction — classeur de secours** peut rester vide :
chaque matière a déjà son classeur.

---

## Étape 3 — Un classeur de correction par bac blanc (recommandé)

C'est ce que tu as demandé : chaque prof reçoit **sa copie** du classeur de sa
matière, intitulée **« Bac blanc — Mathématiques — 14 novembre 2026 — Léa
Dupont »**, partagée avec lui, rangée dans sa console **et** dans une archive
que tu retrouves des mois après.

Copier un fichier Google demande d'être identifié auprès de Google : ça passe
par un petit script qui tourne **sous ton compte**. Le CRM ne touche jamais ton
Drive, il ne sait que demander une copie.

> ⚠️ **Le compte compte.** Le script tourne sous le compte Google avec lequel tu
> le crées, et c'est CE compte qui doit pouvoir ouvrir les classeurs de matière.
> Ici, c'est **slaylefrancais@gmail.com** — pas cindyoce2002. Si tu as plusieurs
> comptes Google ouverts, vérifie l'avatar en haut à droite avant de commencer :
> l'écran de déploiement affiche « Exécuter en tant que : Moi (…) », c'est là
> que tu lis la vérité.

1. Va sur https://script.google.com → **Nouveau projet**. Nomme-le
   « Classeurs de correction — Les Matinées du Bac ».
2. Ouvre `GOOGLE_APPS_SCRIPT_CLASSEURS.js` (à la racine du projet) et **colle
   tout son contenu**, en remplaçant ce qu'il y a.
3. Remplace `JETON_A_REMPLACER` par une longue chaîne au hasard (30 caractères
   ou plus). **Garde-la sous la main.**
4. Rien à faire pour le rangement : le script crée tout seul un dossier Drive
   « Classeurs de correction » à son premier usage, et y dépose toutes les
   copies. (Pour en imposer un autre, colle son identifiant dans `DOSSIER_ID`.)
5. **Déployer** → **Nouveau déploiement** → type **Application web** :
   *Exécuter en tant que* **moi**, *Qui a accès* **tout le monde** → **Déployer**.
   Autorise l'accès quand Google le demande. Copie l'**URL /exec**.
6. Ouvre cette URL dans ton navigateur pour vérifier. Elle doit afficher :
   `{"ok":true,"message":"Classeurs de correction — prêt."}`
7. Vercel → projet du CRM → **Settings** → **Environment Variables**, deux
   variables (les trois environnements cochés à chaque fois) :
   - `CLASSEURS_WEBAPP_URL` = l'URL /exec
   - `CLASSEURS_WEBAPP_TOKEN` = le jeton de l'étape 3
8. **Deployments** → menu **⋯** du dernier déploiement → **Redeploy**.

**Résultat attendu** : dans la console d'un prof, l'encadré orange « Tu n'as pas
encore ton classeur pour ce bac blanc » avec le bouton **📋 Créer mon
classeur**. Un clic : la copie se crée, s'ouvre dans un nouvel onglet, et le
gros bouton vert devient **« Mon classeur de correction »**.

⚠️ **Les classeurs de matière sont dans le Drive de Maël**, partagés avec
**slaylefrancais@gmail.com**. Si le script répond « Modèle inaccessible », c'est
qu'il tourne sous un autre compte : refais l'étape 3 depuis le bon, ou demande à
Maël de partager le classeur avec le compte utilisé.

### Où tu les retrouves

https://inscription.matineesdubac.fr/admin/bacs-blancs → encadré
**🗄️ Archive des classeurs de correction** → **Ouvrir ▼**. Une ligne par
classeur : épreuve, matière, professeur, date de création, lien. Avec un filtre
par matière ou par prof. Rien ne s'y supprime.

> Tant que l'étape 3 n'est pas faite, le prof ouvre le classeur **commun** de sa
> matière, comme aujourd'hui. Rien n'est cassé, il n'y a juste pas de copie.

---

## Étape 4 — Le bouton « ✋ Appeler le prof » dans Discord (optionnel)

**Sans cette étape, la main levée marche déjà** : l'élève a son bouton
« ✋ Appeler le prof » dans son espace élève. Cette étape ajoute le même bouton
**dans sa salle Discord**, là où il est déjà pendant l'épreuve.

### 4a. Récupérer la clé publique

1. https://discord.com/developers/applications → ton application.
2. Onglet **General Information** → champ **Public Key** → **Copy** (64
   caractères).

### 4b. La poser sur Vercel

1. Vercel → projet du CRM → **Settings** → **Environment Variables**.
2. **Key** `DISCORD_PUBLIC_KEY`, **Value** = ce que tu viens de copier, les trois
   environnements cochés → **Save**.
3. **Deployments** → **⋯** → **Redeploy**.

### 4c. Donner l'adresse à Discord

1. Retour sur **General Information**.
2. Champ **Interactions Endpoint URL**, colle exactement :

   ```
   https://inscription.matineesdubac.fr/api/discord/interactions
   ```

3. **Save Changes**.

**Résultat attendu** : « All your edits have been carefully recorded ». S'il
refuse (« endpoint could not be verified »), le redéploiement de 4b n'est pas
fini : attends, puis re-clique **Save Changes**.

### 4d. Poser les boutons dans les salles

1. https://inscription.matineesdubac.fr/admin/discord
2. Sur le bac blanc concerné → **Préparer les salles**.

**Résultat attendu** : « *N* boutons « ✋ Appeler le prof » posés. »

Le bouton n'est posé **qu'une fois par élève** : rejouer « Préparer les salles »
n'empile pas dix messages dans sa salle.

---

## Ce que voit le prof

Sur `/espace-prof`, chaque bac blanc porte **« Ouvrir ma console → »**. Dedans :

- **Trois grands boutons** : 🎧 Salles Discord · 📊 Mon classeur de correction ·
  📁 Dossier des copies. Une adresse manquante ne fait pas disparaître le
  bouton : il reste, éteint, avec la phrase qui dit où la poser.
- **Un bandeau rouge** dès qu'un élève lève la main : son nom, depuis combien de
  temps il attend, **Le rejoindre** (ouvre sa salle Discord) et **✓ C'est
  réglé**. Rafraîchi tout seul toutes les 10 secondes.
- **Un bip discret** à chaque main levée (deux notes courtes), et le nombre
  d'élèves qui attendent dans le **titre de l'onglet** — « (2) ✋ Mathématiques
  — ma console ». Bouton **🔔 Bip activé / 🔕 Bip coupé** dans l'en-tête, choix
  retenu sur son navigateur.
- **Onglet 👀 Surveillance** : une ligne par élève, avec **les deux liens de
  copie** :
  - **✍️ Son écriture** — déjà rempli, ouvre sa copie dans l'application
    d'écriture (la même que la sienne, rien à coller) ;
  - **📄 Son Doc** — le Google Doc de l'élève. Le prof le colle une fois avec
    **＋ son Google Doc**, il apparaît alors aussi dans l'espace de l'élève.

  Les deux cohabitent le temps que l'application d'écriture soit finie. Le jour
  où l'une gagne, il n'y aura qu'un bouton à retirer.
- **Onglets 📄 Copies · ✍️ Corrections · 📝 Sujet et retour** : le reste, sans
  changer de page.

## Ce que voit l'élève

Pendant la fenêtre où sa salle est ouverte (1 h avant → 1 h après), un bouton
**✋ Appeler le prof** à côté de « Rejoindre mon salon ». Un deuxième clic annule
(« ✋ Le prof arrive — annuler »). À côté : **📄 Mon document de copie** (son
Google Doc, dès qu'il est renseigné) et **✍️ Écrire ma copie**.

Dans Discord, s'il a l'étape 4, un message l'attend avec trois boutons :
**✋ Appeler le prof**, **🛠️ Souci technique**, **↩️ Finalement, ça va**. La
réponse n'est visible que de lui.

---

## Installé le 28 août 2026

Le script tourne sous **slaylefrancais@gmail.com**, déploiement
« Copie du classeur de correction par bac blanc », version 1. Testé en réel : la
copie « Bac blanc — Mathématiques — 13 septembre 2026 — Cindy Moreira » a bien
été créée, partagée et archivée.

Un premier projet avait été créé par erreur sous **cindyoce2002@gmail.com** : il
ne sert plus, et peut être supprimé depuis https://script.google.com (compte
cindyoce2002) → menu du projet → Supprimer.

## En cas de doute

- **Le bandeau rouge ne s'affiche jamais** → étape 1a pas passée. La console
  s'ouvre quand même, elle ne sait juste pas où écrire les appels.
- **« La copie automatique n'est pas branchée »** → étape 3, points 7 et 8.
- **« Modèle inaccessible »** → ton compte Google ne peut pas ouvrir le classeur
  de cette matière. Demande le partage.
- **« Classeur créé mais l'archive n'existe pas encore »** → étape 1b pas passée.
  Le fichier existe dans ton Drive, il n'est simplement pas archivé.
- **Un élève clique dans Discord et lit « Cette salle n'est rattachée à aucune
  inscription »** → sa salle a été créée à la main. Relance « Préparer les
  salles » sur ce bac blanc.
