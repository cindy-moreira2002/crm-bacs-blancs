# L'espace Direction devient une application de téléphone

*Mis en place le 20/09/2026.*

Trois choses ont changé :

1. **La direction a son propre espace**, `espaces.matineesdubac.fr/direction`,
   séparé de ton espace prof. Plusieurs personnes peuvent y entrer, chacune
   avec son compte — c'est ce qui permet de l'ouvrir à Maël sans lui donner tes
   identifiants, et sans qu'il voie ton espace prof à toi.
2. **Elle s'installe sur le téléphone** comme une application, avec son icône.
3. **Elle te prévient**, même fermée, quand un e-mail attend ton feu vert.

Ton espace prof (`/espace-prof`) redevient ce qu'il est : le tien, avec tes
matières, tes revenus, tes copies. Un bouton « 🧭 Espace direction » en haut y
mène, et l'inverse aussi.

Les anciennes adresses `/admin/...` continuent de marcher : elles renvoient
toutes seules vers `/direction/...`. Aucun favori n'est cassé.

---

## Ce qu'il te reste à faire (4 étapes, ~10 minutes)

### 1. Créer les deux tables (Supabase)

Ouvre le **SQL Editor du projet CRM** (celui des inscriptions) :
https://supabase.com/dashboard/project/orpbfnmdlvxmkvyrpvtj/sql/new

Colle le contenu de `supabase/sql/54_direction_web_app.sql`, puis **Run**.

*Résultat attendu :* `Success. No rows returned`. Le script est rejouable : le
relancer ne casse rien.

Sans cette étape, tout fonctionne **sauf** l'activation des notifications, qui
répondra « Impossible d'enregistrer l'abonnement ».

### 2. Poser les clés de notification (Vercel)

Les clés sont déjà écrites dans ton fichier local `~/crm-bacs-blancs/.env.local`,
tout en bas, sous le commentaire « Notifications push de l'espace Direction ».
Ce fichier n'est jamais envoyé sur GitHub.

Ouvre https://vercel.com/cindy-moreira2002/espaces-matineesdubac/settings/environment-variables
et ajoute **trois** variables, en recopiant les valeurs à l'identique :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | la ligne `VAPID_PUBLIC_KEY=` de `.env.local` |
| `VAPID_PRIVATE_KEY` | la ligne `VAPID_PRIVATE_KEY=` |
| `VAPID_SUBJECT` | `mailto:matineesdubac@gmail.com` |

Puis **Redeploy** le projet.

⚠️ Ces clés sont un couple. Si tu en regénères une un jour, tous les téléphones
déjà abonnés cessent de recevoir : il faudra réactiver les notifications sur
chaque appareil.

*Résultat attendu :* sur le téléphone, le bouton « Activer sur cet appareil »
ne répond plus « les clés ne sont pas encore posées ».

### 3. Installer l'application sur ton téléphone

1. Ouvre **https://espaces.matineesdubac.fr/direction** dans **Safari**
   (sur iPhone, ça ne marche que dans Safari — ni Chrome, ni Firefox).
2. Connecte-toi.
3. Touche le bouton **Partager** (le carré avec la flèche vers le haut).
4. Choisis **« Sur l'écran d'accueil »**, puis **Ajouter**.
5. **Ferme Safari** et ouvre l'icône **Direction MDB** depuis l'écran d'accueil.
6. Un encadré « 🔔 Activer les notifications » apparaît en bas → touche
   **« Activer sur cet appareil »**, puis **Autoriser**.
7. Touche **« Envoyer un test »** : une notification doit arriver.

⚠️ L'étape 5 n'est pas décorative : **sur iPhone, les notifications n'existent
que dans l'application installée**. Depuis Safari, le bouton d'activation
échouera toujours.

Sur Android, c'est la même chose en plus simple : Chrome propose « Installer
l'application » tout seul.

### 4. Faire entrer Maël

Dans l'application (ou sur ordinateur) : **⋯ Plus → Profs → 🧭 Inviter
quelqu'un dans la direction**. Tape son adresse e-mail, touche **Fabriquer le
lien**, puis **Copier le lien** et envoie-le-lui par message.

Le lien est valable **72 heures**. Maël y choisit **son** mot de passe — tu ne
le connaîtras jamais, et c'est voulu. Il arrive directement dans la direction.

S'il a déjà un compte prof, plus simple encore : **Profs → Gérer → 🧭 Donner
l'accès direction**.

Pour lui retirer l'accès un jour : même bouton, il devient « Retirer l'accès
direction ». Son espace prof, lui, n'est pas touché.

---

## Ce que tu reçois comme notification

| Quand | Ce que tu reçois | Où ça t'emmène |
|---|---|---|
| Un e-mail attend ton feu vert | 📬 À valider | `/direction/a-valider` |
| Une inscription arrive sans règlement | 💶 Nouvelle inscription | `/direction/paiements` |
| Une copie part en échec | 🎛️ Correction bloquée | `/direction/correction` |
| Un élève lève la main, le jour J | ✋ Un élève lève la main | l'accueil |

Deux règles :

- **Rien entre 22 h et 7 h** (sauf une main levée : il y a un élève devant sa
  copie). Au réveil, tu es prévenue de ce qui reste, pas de chaque message
  arrivé dans la nuit.
- **On ne te prévient que quand ça monte.** Valider trois e-mails fait tomber
  le compteur sans faire sonner quoi que ce soit.

Les notifications partent du cron qui tourne déjà toutes les 5 minutes. Tu peux
donc attendre jusqu'à 5 minutes entre l'événement et la notification.

**Maël et toi recevez les mêmes.** Si l'un valide un e-mail, le compteur de
l'autre tombe tout seul dans les 20 secondes.

---

## L'écran « À valider »

C'est l'écran fait pour le téléphone, celui que la notification ouvre. Par
message : **👀 Lire** (l'e-mail en entier, tel que la famille le recevra),
**✅ Envoyer** (avec une confirmation qui rappelle à qui il part), et
**Ne pas envoyer ce message**.

La console complète (**Console e-mails**) n'a pas bougé : historique, échecs,
réglages, parcours élève par élève. C'est toujours là qu'on comprend ; ici, on
décide.

Rappel : tant que le réglage **validation manuelle** est sur « oui », rien ne
part sans ce bouton. L'écran te le dit en rouge si quelqu'un l'a désactivé.

---

## Si quelque chose ne va pas

| Symptôme | Cause la plus probable |
|---|---|
| « Impossible d'enregistrer l'abonnement » | L'étape 1 (SQL) n'a pas été faite |
| « Les clés de notification ne sont pas encore posées » | L'étape 2 (Vercel) n'a pas été faite, ou pas redéployée |
| Le bouton d'activation ne fait rien sur iPhone | L'app n'est pas ouverte **depuis l'écran d'accueil** |
| « Notifications refusées » | Réglages iPhone → Notifications → Direction MDB → Autoriser |
| Le test dit « aucun appareil abonné » | Les notifications ont été coupées, ou l'app a été désinstallée |
| Les chiffres ne bougent pas | L'écran ne sonde plus quand il est caché : reviens dessus, il se remet à jour tout seul |
