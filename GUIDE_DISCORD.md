# Guide de configuration Discord — Les Matinées du Bac

Guide clic par clic, à suivre une seule fois. Compte pour environ 20 minutes.

**Règle absolue : le token du bot et le Client Secret ne doivent JAMAIS être
collés dans une conversation, dans le code, ni dans GitHub.** Ils vont
uniquement dans les variables d'environnement Vercel. Si l'un des deux
apparaît quelque part par accident, on le régénère (procédure en fin de guide).

---

## Étape A — Créer le serveur Discord

Une seule fois. Ce serveur est **permanent** : on ne le recrée jamais, on y
crée seulement une catégorie temporaire par bac blanc.

1. Ouvre <https://discord.com/app> et connecte-toi (ou crée un compte).
2. Dans la colonne de gauche, clique sur le gros bouton rond **`+`**
   (« Ajouter un serveur »), tout en bas de la liste des serveurs.
3. Clique **« Créer le mien »** (*Create My Own*).
4. À la question « Parle-nous un peu plus de ton serveur », clique
   **« Passer cette question »** (*Skip this question*).
5. Nom du serveur : **`Les Matinées du Bac`**.
6. Clique **« Créer »**.

Le serveur apparaît. Tu en es automatiquement propriétaire.

### A bis — Empêcher les élèves d'inviter n'importe qui

1. Clique sur le **nom du serveur** en haut à gauche → **« Paramètres du serveur »**.
2. Menu de gauche → **« Rôles »**.
3. Clique sur le rôle **`@everyone`**.
4. Onglet **« Permissions »**, puis désactive :
   - **« Créer une invitation »** (*Create Invite*)
   - **« Changer de pseudo »** (*Change Nickname*) — facultatif
5. Clique **« Enregistrer les modifications »** en bas.

---

## Étape B — Activer le mode développeur et copier l'ID du serveur

L'ID du serveur n'est **pas un secret** : c'est un numéro public.

1. Clique sur la **roue dentée** en bas à gauche (« Paramètres utilisateur »).
2. Menu de gauche, tout en bas → **« Avancés »** (*Advanced*).
3. Active **« Mode développeur »** (*Developer Mode*).
4. Ferme les paramètres (croix en haut à droite ou touche `Échap`).
5. **Clic droit sur l'icône du serveur** « Les Matinées du Bac » dans la
   colonne de gauche → **« Copier l'identifiant du serveur »**
   (*Copy Server ID*).

Colle-le dans un bloc-notes. C'est la valeur de `DISCORD_GUILD_ID`
(18 à 20 chiffres).

---

## Étape C — Créer le rôle « Équipe Matinées »

Ce rôle unique donne l'accès à toutes les salles aux personnes de confiance
(toi, et plus tard une assistante). C'est **le seul rôle permanent** du
système : les élèves et les profs n'ont pas de rôle, ils reçoivent des
permissions posées directement sur leur salon.

1. Nom du serveur → **« Paramètres du serveur »** → **« Rôles »**.
2. Clique **« Créer un rôle »**.
3. Nom : **`Équipe Matinées`**. Choisis une couleur si tu veux.
4. Onglet **« Permissions »** : n'active **rien**. Le rôle sert uniquement à
   être reconnu sur les salons privés, pas à donner des pouvoirs sur le serveur.
5. Clique **« Enregistrer les modifications »**.
6. Reviens sur la liste **« Rôles »**, **clic droit sur `Équipe Matinées`** →
   **« Copier l'identifiant du rôle »** (*Copy Role ID*).

Note-le : c'est `DISCORD_ROLE_STAFF_ID`. Pas un secret non plus.

### C bis — T'attribuer le rôle

1. Paramètres du serveur → **« Membres »**.
2. Trouve ton nom, clique sur le **`+`** à côté → coche **`Équipe Matinées`**.

### C ter — Créer le rôle « Prof »

Ce rôle ouvre la zone permanente réservée aux professeurs. **Tu n'auras
jamais à l'attribuer à la main** : le bot le pose automatiquement quand un
prof relie son compte Discord depuis son espace (le site sait déjà qui est
prof grâce à la table `professeurs`).

1. Paramètres du serveur → **« Rôles »** → **« Créer un rôle »**.
2. Nom : **`Prof`**. N'active **aucune** permission.
3. **« Enregistrer les modifications »**.
4. Liste des rôles → **clic droit sur `Prof`** → **« Copier l'identifiant du
   rôle »**.

Note-le : c'est `DISCORD_ROLE_PROF_ID`. Pas un secret.

> Le rôle `Prof` doit rester **sous** celui du bot dans la liste, sinon le bot
> ne pourra pas l'attribuer. Ce sera le cas si tu fais bien l'étape G bis.

---

## Étape C quater — Les salons permanents

Ces salons ne sont **jamais touchés par le bot** : il ne gère que les
catégories temporaires des bacs blancs, qu'il a lui-même créées et dont il a
enregistré l'identifiant en base. Une catégorie créée à la main est invisible
pour la suppression automatique.

### La zone ÉQUIPE (profs + staff uniquement)

1. Dans la liste des salons, **clic droit sur un espace vide** →
   **« Créer une catégorie »**.
2. Nom : **`ÉQUIPE`**.
3. **Active l'interrupteur « Catégorie privée »** (*Private Category*).
4. Dans la liste qui apparaît, coche **`Prof`** et **`Équipe Matinées`**.
5. **« Créer une catégorie »**.

Puis, quatre fois : **clic droit sur la catégorie `ÉQUIPE`** →
**« Créer un salon »** → type **Textuel** → nom :

| Salon | À quoi il sert |
|---|---|
| `annonces` | Toi tu écris, les profs lisent |
| `salle-des-profs` | Discussion libre entre profs |
| `qui-fait-quoi` | Sondages : qui prend quelle matinée |
| `entraide-correction` | Questions de barème, cas difficiles |

Les quatre héritent automatiquement de la confidentialité de la catégorie :
aucun élève ne les verra, même en étant membre du serveur.

**Verrouiller `annonces` en lecture seule** : clic droit sur le salon →
**« Modifier le salon »** → **« Permissions »** → sélectionne le rôle `Prof`
→ désactive **« Envoyer des messages »** → **« Enregistrer »**.

### La zone ACCUEIL (visible par tous)

1. Clic droit sur un espace vide → **« Créer une catégorie »** → nom
   **`ACCUEIL`** → **ne coche PAS « Catégorie privée »** → Créer.
2. Clic droit sur `ACCUEIL` → **« Créer un salon »** → Textuel → `bienvenue`.

C'est la seule chose qu'un élève verra en dehors de sa propre salle.

### Résultat attendu

```
Les Matinées du Bac
├─ ACCUEIL          → #bienvenue                      (tout le monde)
├─ ÉQUIPE           → #annonces #salle-des-profs
│                     #qui-fait-quoi #entraide-correction   (profs + staff)
└─ (les catégories de bacs blancs viendront ici, créées par le bot)
```

---

## Étape D — Créer l'application Discord

1. Ouvre <https://discord.com/developers/applications>.
2. Bouton bleu **« New Application »** en haut à droite.
3. Nom : **`Matinées du Bac — Salles`**.
4. Coche la case d'acceptation des conditions, puis **« Create »**.

Tu arrives sur la page **General Information** de l'application.

5. Repère la ligne **« Application ID »** → clique **« Copy »**.

C'est `DISCORD_CLIENT_ID`. Pas un secret (il apparaît dans les URLs).

---

## Étape E — Le bot et son token

1. Menu de gauche → **« Bot »**.
2. Section **« Privileged Gateway Intents »** : **laisse les trois
   interrupteurs DÉSACTIVÉS**
   (*Presence Intent*, *Server Members Intent*, *Message Content Intent*).
   Le système n'utilise pas la passerelle temps réel de Discord, uniquement
   l'API REST. Moins de permissions = moins de risque.
3. Section **« Authorization Flow »** :
   - **« Public Bot »** → **DÉSACTIVE**. Seule toi peux inviter ce bot.
   - **« Requires OAuth2 Code Grant »** → **laisse désactivé** (l'activer
     casserait l'invitation).
4. Clique **« Save Changes »** en bas.
5. Section **« Token »** en haut → clique **« Reset Token »** →
   confirme **« Yes, do it! »** (un code à 6 chiffres peut être demandé si tu
   as la double authentification).
6. Le token s'affiche **une seule fois**. Clique **« Copy »**.

**Va immédiatement à l'étape H1 pour le coller dans Vercel.** Si tu fermes
la page sans l'avoir collé, il faudra recliquer sur « Reset Token » (ce n'est
pas grave, mais le token précédent devient invalide).

---

## Étape F — OAuth2 : relier les comptes Discord des élèves et des profs

1. Menu de gauche → **« OAuth2 »**.
2. Section **« Client Secret »** → clique **« Reset Secret »** →
   confirme → **« Copy »**.
   → C'est `DISCORD_CLIENT_SECRET`. **Le plus sensible avec le token.**
   Colle-le tout de suite dans Vercel (étape H1).
3. Section **« Redirects »** → clique **« Add Redirect »** et saisis
   **exactement** cette adresse (aucun espace, aucune barre oblique finale) :

   ```
   https://crm-bacs-blancs-ihgf.vercel.app/api/discord/oauth/retour
   ```

4. Clique **« Add Redirect »** une deuxième fois et ajoute :

   ```
   https://espaces.matineesdubac.fr/api/discord/oauth/retour
   ```

5. **« Add Redirect »** une troisième fois, pour les tests en local :

   ```
   http://localhost:3000/api/discord/oauth/retour
   ```

6. Clique **« Save Changes »** en bas.

> Discord compare ces adresses **caractère par caractère**. Une majuscule ou
> une barre oblique en trop et la connexion échouera avec
> `invalid_redirect_uri`.

---

## Étape G — Inviter le bot sur le serveur

1. Toujours dans **« OAuth2 »**, descends jusqu'à **« OAuth2 URL Generator »**.
2. Dans **« Scopes »**, coche **uniquement** : **`bot`**.
3. Une liste **« Bot Permissions »** apparaît en dessous. Coche **exactement
   ces six cases**, rien d'autre :

   | Case à cocher (FR) | Nom anglais | Pourquoi |
   |---|---|---|
   | Créer une invitation | Create Instant Invite | Exigé par l'API pour ajouter un élève au serveur automatiquement |
   | Gérer les salons | Manage Channels | Créer, renommer et supprimer la catégorie et les salons |
   | Gérer les rôles | Manage Roles | **Indispensable** : sans elle, impossible d'écrire les permissions qui rendent un salon privé |
   | Voir les salons | View Channels | Le bot ne peut pas gérer ce qu'il ne voit pas |
   | Envoyer des messages | Send Messages | Poster les consignes dans `informations` et `assistance-technique` |
   | Se connecter | Connect | Discord refuse d'accorder à un élève une permission que le bot n'a pas lui-même |

4. Vérifie en bas de page que le nombre affiché après `permissions=` est
   **exactement `269487121`**. Si ce n'est pas le cas, une case est mal cochée.

   > **Ne coche jamais « Administrateur ».** Elle donnerait au bot le droit de
   > supprimer ton serveur entier, alors que six permissions suffisent.

5. Copie l'URL générée (bouton **« Copy »** tout en bas), colle-la dans un
   nouvel onglet du navigateur, puis **Entrée**.
6. Dans la liste déroulante **« Ajouter à : »**, choisis
   **`Les Matinées du Bac`** → **« Continuer »**.
7. Vérifie que les six permissions sont bien listées → **« Autoriser »**.
8. Valide le captcha si Discord le demande.

Le bot apparaît dans la liste des membres du serveur, hors ligne (c'est
normal : il n'utilise pas la passerelle temps réel).

### G bis — Monter le rôle du bot

Discord interdit à un bot de modifier ce qui est au-dessus de lui dans la
hiérarchie. Sans cette étape, la création des salons échouera un jour sans
raison apparente.

1. Paramètres du serveur → **« Rôles »**.
2. Attrape le rôle **`Matinées du Bac — Salles`** et **fais-le glisser tout
   en haut de la liste**, juste sous ton propre rôle d'administrateur s'il y
   en a un.
3. Le déplacement s'enregistre tout seul.

---

## Étape H — Poser les secrets dans Vercel

Cinq variables. Aucune ne doit être écrite ailleurs que dans cet écran.

### H1 — Les deux secrets (à faire en priorité)

1. Ouvre <https://vercel.com/cindy-moreira2026/espaces-matineesdubac/settings/environment-variables>.
2. Clique **« Add Another »** (ou **« Add New »** si la liste est vide).
3. **Key** : `DISCORD_BOT_TOKEN`
   **Value** : colle le token de l'étape E6.
   **Environments** : coche **Production** et **Preview**.
   Coche **« Sensitive »** si l'option est proposée.
   → **« Save »**.
4. Recommence pour :
   **Key** : `DISCORD_CLIENT_SECRET`
   **Value** : le secret de l'étape F2.
   Mêmes environnements, même case « Sensitive ». → **« Save »**.

### H2 — Les trois identifiants (non secrets)

Même écran, même méthode :

| Key | Value | D'où elle vient |
|---|---|---|
| `DISCORD_CLIENT_ID` | l'Application ID | étape D5 |
| `DISCORD_GUILD_ID` | l'ID du serveur | étape B5 |
| `DISCORD_ROLE_STAFF_ID` | l'ID du rôle Équipe Matinées | étape C6 |
| `DISCORD_ROLE_PROF_ID` | l'ID du rôle Prof | étape C ter 4 |

Coche **Production** et **Preview** pour les quatre.

### H3 — Vérifier

Recharge la page. Tu dois voir **six nouvelles lignes** commençant par
`DISCORD_`. Les valeurs restent masquées : c'est normal et voulu.

---

## Étape H bis — Le script SQL 45 (2 min, à faire une seule fois)

Sans ce script, les salles se créeront bien sur Discord, mais **aucun élève ne
recevra son lien** : il n'y aurait nulle part où noter quelle salle appartient
à qui.

1. <https://supabase.com/dashboard> → projet **orpbfnmdlvxmkvyrpvtj**
   (⚠️ **pas** `xgdaibekjmtffvkwvcge`, qui est celui des corrections).
2. **SQL Editor** → **New query**.
3. Ouvre `supabase/sql/45_discord_salons.sql`, copie tout, colle, **Run**.
4. Le tableau de résultat doit afficher **quatre lignes** :
   `inscriptions.discord_salon_id`, `discord_salon_nom`, `discord_salon_pose_le`
   et `sessions_bacs_blancs.discord_categorie_id`.

Le script est rejouable : le relancer n'efface rien.

---

## Étape H ter — Le script SQL 46 (1 min, à faire une seule fois)

Le script 45 donne une salle à chaque élève. Celui-ci retient **qui est qui sur
Discord** — sans lui, l'élève voit son lien, clique, et tombe sur une salle qui
ne le laisse pas entrer : une salle privée n'ouvre qu'aux comptes qu'on y a
nommément autorisés.

1. Même projet **orpbfnmdlvxmkvyrpvtj**, **SQL Editor** → **New query**.
2. Ouvre `supabase/sql/46_discord_comptes.sql`, copie tout, colle, **Run**.
3. Le tableau de résultat doit afficher **cinq lignes** :
   `inscriptions.discord_user_id`, `discord_relie_le`, `discord_acces_pose_le`,
   et `professeurs.discord_user_id`, `discord_relie_le`.

Rejouable, comme le précédent.

---

## Étape H quater — Relier son compte (chacun, une fois)

Rien à faire de ton côté : le bouton apparaît tout seul dans chaque espace.

- **Toi et les professeurs** : `/espace-prof` → **« Relier mon compte Discord »**.
  Le rôle `Prof` est posé automatiquement — c'est lui qui ouvre la zone `ÉQUIPE`
  et toutes les salles d'élèves. Personne n'attribue de rôle à la main.
- **Les élèves** : `/espace-eleve` → même bouton. Leur compte est alors autorisé
  sur **leur** salle, et sur aucune autre.

L'ordre n'a pas d'importance : un élève qui relie son compte après la création
des salles est autorisé aussitôt, et un élève qui l'a relié avant voit sa salle
naître déjà ouverte.

> **Le chiffre à regarder avant une épreuve** : « Préparer les salles » termine
> par un avertissement quand des élèves n'ont pas relié leur compte. Ceux-là
> verront leur lien sans pouvoir entrer. C'est le seul point qui casse une
> matinée, et il se voit la veille.

---

## Étape I — Ce que je vérifie ensuite (côté code)

Une fois les six variables posées, je lance une vérification automatique qui
contrôle, sans rien créer de définitif :

- le token est valide et le bot est bien membre du serveur ;
- le bot possède les six permissions, ni plus ni moins ;
- son rôle est assez haut dans la hiérarchie ;
- les rôles `Équipe Matinées` et `Prof` existent et leurs ID correspondent ;
- le rôle `Prof` est bien situé sous celui du bot (sinon il ne pourra pas
  l'attribuer aux professeurs) ;
- la catégorie `ÉQUIPE` est bien privée ;
- la création puis la suppression d'un salon de test fonctionnent
  (salon nommé `zz-test-technique`, supprimé immédiatement).

---

## En cas de fuite d'un secret

Si le token ou le Client Secret se retrouve dans une capture d'écran, un
message, ou un fichier commité :

1. **Token** : Developer Portal → ton application → **Bot** → **« Reset
   Token »**. L'ancien devient immédiatement invalide.
2. **Client Secret** : **OAuth2** → **« Reset Secret »**.
3. Remplace la valeur dans Vercel (même écran qu'en H1, bouton **« Edit »**
   sur la ligne concernée).
4. Redéploie le projet pour que la nouvelle valeur soit prise en compte.

Aucune donnée n'est perdue dans l'opération : les salons et les liaisons de
comptes restent intacts.

---

## Pour désactiver proprement l'intégration Discord (plus tard)

1. Dans l'administration du site : **« Supprimer les salles »** sur chaque
   bac blanc encore actif.
2. Supprimer les six variables `DISCORD_*` dans Vercel → l'interface
   affichera « Discord non configuré » au lieu de planter, et les boutons
   Discord disparaîtront des espaces élève et prof.
3. Facultatif : Developer Portal → **General Information** → tout en bas →
   **« Delete App »**.

⚠️ Jitsi a été retiré du code : Discord est désormais la seule salle. Désactiver
l'intégration laisse donc les espaces sans salon du tout — à ne faire qu'entre
deux sessions, jamais la veille d'un bac blanc.
