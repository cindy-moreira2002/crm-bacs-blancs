# E-mails automatiques — guide de mise en service

Ce document est la marche à suivre complète. Il est séparé en trois parties :
**ce qui est déjà fait**, **ce que tu dois faire** (5 étapes, ~20 minutes), et
**comment vérifier**.

Rien ne part tant que tu n'as pas fait les 5 étapes. Aucun e-mail ne sera envoyé
rétroactivement aux 16 inscriptions déjà en base.

---

## 1. Ce qui est déjà fait (dans le code)

| Élément | Où |
|---|---|
| Client Brevo (serveur uniquement) | `src/lib/emails/brevo.ts` |
| File d'attente + anti-doublon | `src/lib/emails/file.ts` |
| Planificateur (qui, quoi, quand) | `src/lib/emails/planificateur.ts` |
| Moteur d'envoi + vérifications | `src/lib/emails/envoi.ts` |
| Déclencheurs (inscription, paiement…) | `src/lib/emails/declencheurs.ts` |
| **Les 25 modèles d'e-mails** | `src/lib/emails/modeles/index.ts` |
| Mise en page commune | `src/lib/emails/modeles/mise-en-page.ts` |
| Réglages (tous les délais) | `src/lib/emails/reglages.ts` |
| Battement de cœur (cron) | `src/app/api/emails/cron/route.ts` |
| Webhook Brevo | `src/app/api/emails/webhook-brevo/route.ts` |
| Désinscription | `src/app/api/emails/desinscription/route.ts` + `/desinscription` |
| Demandes du site vitrine | `src/app/api/preinscriptions/route.ts` |
| **Administration** | `/admin/emails` |
| Tests hors ligne (28) | `scripts/test-emails.ts` |
| Aperçu de tous les modèles | `scripts/apercu-emails.ts` |
| Migrations | `supabase/sql/28_emails_brevo.sql`, `29_emails_cron.sql` |

Rien n'a été supprimé : l'ancien envoi Gmail (Apps Script) reste en place et
continue de fonctionner **tant que `BREVO_API_KEY` n'est pas posée**.

---

## 2. Ce que tu dois faire

### Étape 1 — Créer la clé API dans Brevo (3 min)

1. Va sur <https://app.brevo.com> et connecte-toi.
2. En haut à droite, clique sur ton nom → **SMTP & API** (ou
   <https://app.brevo.com/settings/keys/api>).
3. Onglet **API Keys** → bouton **Generate a new API key**.
4. Nom : `Matinées du Bac — site`. Clique **Generate**.
5. **Copie la clé** (elle commence par `xkeysib-`). Elle ne sera plus affichée
   ensuite.
6. ⚠️ **Ne colle cette clé nulle part d'autre que Vercel (étape 3).** Pas dans
   le chat, pas dans un fichier, pas dans un message.

### Étape 2 — Valider l'adresse d'expédition dans Brevo (2 min)

1. Toujours dans Brevo : **Senders, Domains & Dedicated IPs** →
   <https://app.brevo.com/senders/list>.
2. Bouton **Add a sender**.
3. Nom : `Les Matinées du Bac` — Adresse : `matineesdubac@gmail.com`.
4. Brevo envoie un e-mail de validation à cette adresse : ouvre-le et clique
   sur le lien de confirmation.
5. Vérifie que l'adresse apparaît bien avec la pastille verte.

> **À savoir, sans urgence.** Brevo n'autorise pas une adresse `@gmail.com`
> comme expéditeur de **campagnes commerciales**, et la délivrabilité des
> messages est moins bonne qu'avec ton propre domaine. Le jour où tu veux
> passer à `bonjour@matineesdubac.fr`, la procédure est en partie 4 — c'est une
> variable à changer sur Vercel, aucune modification de code.

### Étape 3 — Poser les variables d'environnement sur Vercel (7 min)

1. <https://vercel.com> → projet **espaces-matineesdubac** → **Settings** →
   **Environment Variables**.
2. Ajoute les variables ci-dessous, **une par une**, en cochant les trois
   environnements (Production, Preview, Development) :

| Nom | Valeur à mettre |
|---|---|
| `BREVO_API_KEY` | la clé copiée à l'étape 1 |
| `EMAILS_CRON_SECRET` | une longue valeur aléatoire — voir encadré ci-dessous |
| `EMAILS_WEBHOOK_SECRET` | une **autre** longue valeur aléatoire |
| `EMAILS_EXPEDITEUR` | `matineesdubac@gmail.com` |
| `EMAILS_EXPEDITEUR_NOM` | `Les Matinées du Bac` |
| `EMAILS_REPONSE_A` | `matineesdubac@gmail.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://crm-bacs-blancs-ihgf.vercel.app` |
| `NEXT_PUBLIC_VITRINE_URL` | `https://matineesdubac.fr` |

**Vérifie aussi que ces variables existent déjà** (elles sont nécessaires et
utilisées par le reste du site) : `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `PROF_SESSION_SECRET`, `PIPELINE_INTERNAL_SECRET`.

> **Pour fabriquer les deux secrets aléatoires** — ouvre le Terminal.
>
> Pour `EMAILS_CRON_SECRET` (il voyage dans un en-tête, tout caractère est permis) :
>
> ```bash
> openssl rand -base64 32
> ```
>
> Pour `EMAILS_WEBHOOK_SECRET`, il faut **impérativement** une valeur sans
> caractère spécial : ce secret part dans une URL, et un `+` y serait
> interprété comme un espace — Brevo se ferait refuser à chaque appel.
>
> ```bash
> openssl rand -hex 32
> ```

3. Une fois toutes les variables posées : onglet **Deployments** → sur le
   dernier déploiement, menu `···` → **Redeploy**.

### Étape 4 — Créer les tables dans Supabase (3 min)

1. <https://supabase.com/dashboard> → projet **orpbfnmdlvxmkvyrpvtj**
   (⚠️ **pas** le projet `xgdaibekjmtffvkwvcge`, qui est celui des corrections).
2. Menu de gauche → **SQL Editor** → **New query**.
3. Ouvre le fichier `supabase/sql/28_emails_brevo.sql`, copie **tout** son
   contenu, colle-le, puis clique **Run**.
4. Le tableau de résultat doit afficher :
   `emails, email_contacts, email_reglages, preinscriptions` et `RLS actif partout : oui`.

Ce script est rejouable : le relancer ne casse rien et n'efface rien.

### Étape 5 — Faire tourner le moteur toutes les 5 minutes (4 min)

1. Toujours dans le SQL Editor du **même projet**, nouvelle requête.
2. Ouvre `supabase/sql/29_emails_cron.sql`.
3. **Avant de coller**, remplace dans le texte :
   - `__URL_DU_SITE__` → `https://crm-bacs-blancs-ihgf.vercel.app`
   - `__SECRET_CRON__` → la valeur **exacte** de `EMAILS_CRON_SECRET` posée à
     l'étape 3
4. Colle et clique **Run**. Le résultat doit afficher une ligne `emails-moteur`
   avec `active = true`.
5. Si Supabase refuse `create extension` : menu **Database** → **Extensions** →
   cherche `pg_cron`, active-le ; idem pour `pg_net` ; puis relance le script.

### Étape 6 — Le webhook Brevo (2 min) — FACULTATIF

> **À faire quand tu veux, même dans un mois.** Sans webhook, tout fonctionne :
> les e-mails partent, les rappels se déclenchent, l'administration affiche
> « envoyé ». Le webhook ajoute seulement le retour de Brevo — délivré, ouvert,
> cliqué, adresse qui rebondit — et l'enregistrement automatique des
> désinscriptions faites depuis un e-mail.

1. Brevo → en haut à droite, clique sur **le nom de ton compte** → **Settings**
   → entrée **Webhooks** → créer un **webhook SORTANT** (*outbound*).
   Choisis bien la catégorie **Transactional email** (les webhooks
   « Marketing » sont un autre écran et ne servent pas ici).

   ⚠️ **Sortant, pas entrant.** Les deux noms sont donnés du point de vue de
   Brevo : *sortant* = Brevo envoie l'information vers notre site (« délivré »,
   « ouvert », « a rebondi ») — c'est ce dont on a besoin, et c'est inclus dans
   l'offre gratuite. *Entrant* = un autre outil écrit dans Brevo ; on ne s'en
   sert pas, et il est réservé aux forfaits supérieurs.
2. URL à coller (remplace `TON_SECRET` par la valeur de `EMAILS_WEBHOOK_SECRET`) :

   ```
   https://crm-bacs-blancs-ihgf.vercel.app/api/emails/webhook-brevo?jeton=TON_SECRET
   ```

3. Coche les événements : **Delivered, Opened, Clicked, Soft bounce, Hard
   bounce, Spam, Unsubscribed, Blocked**.
4. Enregistre.

### Étape 7 — Arrêter l'ancien système Gmail (1 min, IMPORTANT)

Sans cette étape, certains élèves recevraient **deux** confirmations (une de
Gmail, une de Brevo).

Tu as plusieurs projets Apps Script, et le repère n'est **pas** le nom du projet
mais **le nom de la fonction : `tachePrincipale`**.

1. Va sur [script.google.com](https://script.google.com) → menu de gauche →
   **Mes déclencheurs**. Cette page liste TOUS les déclencheurs, tous projets
   confondus, avec la fonction exécutée.
2. Repère la ligne dont la fonction est **`tachePrincipale`** (toutes les 5 min).
3. `⋮` → **Supprimer le déclencheur**. Supprime **le déclencheur, pas le
   projet** : le code reste, il ne se lance simplement plus tout seul.

**Comment distinguer tes projets :**

| Projet | Signe distinctif | Action |
|---|---|---|
| Celui à couper | `tachePrincipale`, `envoyerRappelsJ1`, `envoyerRappelsH1` ; contient `orpbfnmdlvxmkvyrpvtj.supabase.co` | supprimer le déclencheur |
| Professeurs — Les Matinées du Bac | seulement `doPost`, écrit dans un Sheet ; aucun e-mail | ne rien toucher |
| Prospection MDB | menu « Prospection MDB », brouillons Gmail, `scanNewProspectsAndCreateDrafts` | **ne rien toucher** |

⚠️ **Piège** : « Prospection MDB » a lui aussi un déclencheur toutes les
5 minutes. Se fier au rythme plutôt qu'au nom de la fonction couperait ta
prospection écoles. Fie-toi à `tachePrincipale`.

> Filet de sécurité : même si tu oublies, le nouveau système lit les anciens
> drapeaux (`email_envoye`, `rappel_j1_envoye`, `rappel_h1_envoye`) et les met à
> jour après chaque envoi. Les deux systèmes ne peuvent donc pas doubler la
> confirmation ni les rappels — mais mieux vaut couper proprement.

### Étape 8 — (optionnel) Le site vitrine

Le formulaire de la page **Calendrier** du site vitrine a été modifié pour
envoyer les demandes au CRM (avant, il n'envoyait aucun e-mail alors que la page
promettait une confirmation).

Fichier modifié : `~/Desktop/matieres-du-bac/index.html`.
Pour que ce soit en ligne, il faut **redéployer le projet
`matineesdubac-officiel`** (c'est un projet Vercel séparé du CRM).

---

## 3. Comment vérifier que tout marche

### Le tableau de bord

Connecte-toi sur `/espace-prof` avec ton compte administratrice, puis clique sur
**📬 E-mails** (ou va directement sur `/admin/emails`).

Tu y trouves :

- **les alertes** en haut (configuration incomplète, quota, messages bloqués) ;
- **le compteur du jour** (X/300) avec la marge de sécurité ;
- **la liste des messages** : programmés, envoyés, en échec, bloqués, avec le
  destinataire, l'élève, la matière, la session, la date prévue et la date réelle ;
- **les filtres** : statut, catégorie, type, destinataire, matière, session, période, adresse ;
- **les actions** sur chaque ligne : `Voir` (aperçu exact), `Test` (copie vers
  ton adresse), `Annuler`, `Renvoyer` (avec confirmation détaillée) ;
- l'onglet **Paiements à confirmer** : c'est là que tu marques « payé » après un
  virement Revolut ;
- l'onglet **Réglages** : tous les délais.

### La répétition générale (rien ne part)

Bouton **Répétition générale** en haut à droite : le système construit tous les
messages dus, vérifie les données, et te dit ce qui partirait — sans contacter
Brevo ni aucun destinataire.

Tu peux aussi mettre le réglage **« Envoi réel actif »** sur `non` : tout est
préparé et visible, mais rien ne part. Remets-le sur `oui` quand tu es prête.

### Le premier vrai test

1. Réglages → vérifie que **Envoi réel actif** = `oui`.
2. Dans la liste, prends un message et clique **Test** : la copie arrive dans ta
   boîte, avec `[TEST]` devant l'objet.
3. Fais une inscription de bout en bout avec **ta propre adresse** sur
   `/inscription`. Tu dois voir apparaître la confirmation dans `/admin/emails`
   dans les 5 minutes, puis la recevoir.

### Vérifier les échecs

- Filtre **Statut = En échec** : la colonne de gauche affiche la cause exacte
  (adresse rejetée, Brevo indisponible…). Bouton `Renvoyer` pour réessayer.
- Filtre **Statut = Bloqué** : il manque une donnée. La cause est écrite
  (« Donnée(s) manquante(s) : session_date »). Corrige la donnée en base, puis
  `Renvoyer`. Un message bloqué **ne part jamais incomplet**.

### Les tests automatiques

```bash
npm run test:emails
```

28 scénarios hors ligne (aucun envoi) : idempotence, quota, lien de visio du bon
élève, session reportée, correction non publiée, désinscription, erreur Brevo…

```bash
npm run apercu:emails
```

Écrit les 25 modèles en HTML dans `./apercu-emails/` — pratique pour relire les
textes ou vérifier le rendu sur téléphone.

---

## 4. Passer plus tard à `bonjour@matineesdubac.fr`

Aujourd'hui, le domaine `matineesdubac.fr` n'a **ni MX, ni SPF, ni DKIM, ni
DMARC** : aucune adresse `@matineesdubac.fr` n'existe. Le jour où tu veux une
adresse professionnelle (recommandé : meilleure délivrabilité, et obligatoire
pour les campagnes commerciales) :

1. **Chez Hostinger** (où sont tes DNS) : crée une redirection e-mail
   `bonjour@matineesdubac.fr` → ta boîte Gmail. Sinon, les réponses envoyées
   directement à cette adresse seraient perdues.
2. **Dans Brevo** : Senders, Domains → **Domains** → **Add a domain** →
   `matineesdubac.fr`. Brevo affiche 3 enregistrements DNS à créer
   (un `brevo-code` en TXT, un DKIM en TXT, parfois un CNAME).
3. **Chez Hostinger** : DNS → ajoute exactement ces enregistrements
   (type, nom, valeur — copie/colle sans rien modifier).
4. Ajoute aussi un DMARC : type `TXT`, nom `_dmarc`, valeur
   `v=DMARC1; p=none; rua=mailto:matineesdubac@gmail.com`
5. Reviens dans Brevo → **Authenticate** / **Verify**. La validation prend de
   quelques minutes à quelques heures.
6. Une fois la pastille verte : sur Vercel, change `EMAILS_EXPEDITEUR` en
   `bonjour@matineesdubac.fr`, puis **Redeploy**. C'est tout.

⚠️ Je ne modifie aucun DNS sans ton accord explicite : ces enregistrements sont
à créer par toi, ou avec toi si tu préfères qu'on le fasse ensemble.

---

## 5. Les messages prévus et leurs délais

Tous les délais sont modifiables dans `/admin/emails` → onglet **Réglages**.

### Élèves (et parents quand l'adresse existe)

| Message | Quand | Parent |
|---|---|---|
| Demande reçue (préinscription) | tout de suite | — |
| Inscription confirmée | tout de suite | oui |
| Paiement confirmé | quand tu marques « payé » | oui |
| Relance paiement manquant | 48 h après l'inscription, 2 fois max | oui |
| Informations pratiques | 5 jours avant, à 10 h | — |
| Lien de visioconférence | 2 jours avant, à 10 h | — |
| Rappel la veille | la veille à 18 h | — |
| Dernier rappel | 60 min avant le début | — |
| Session modifiée | dès la modification | oui |
| Session annulée | dès l'annulation | oui |
| Copie bien reçue | quand la copie est marquée reçue | — |
| Correction disponible | quand la correction est publiée | oui |
| Demande d'avis | 3 jours après la correction | — |

### Professeurs

| Message | Quand |
|---|---|
| Affectation à une session | dès l'affectation |
| Informations pratiques | 5 jours avant |
| Rappel | 24 h avant |
| Session modifiée / annulée | dès le changement |
| Copies disponibles | dès qu'une copie est déposée |
| Correction à terminer | 7 jours après la session |
| Mission terminée | quand toutes les copies sont corrigées |

### Commercial (jamais sans consentement, toujours avec désinscription)

Relance des intéressés non inscrits · fermeture des inscriptions · nouvelle date
· retour d'un ancien participant.

---

## 6. Les règles de sécurité appliquées

- La clé Brevo n'est lue que dans `src/lib/emails/brevo.ts`, côté serveur. Elle
  n'apparaît ni dans le navigateur, ni dans une URL, ni sur GitHub.
- Les tables `emails`, `email_contacts`, `email_reglages`, `preinscriptions` ont
  **RLS actif sans policy publique** : la clé anon du navigateur ne peut rien y
  lire. Un élève ne peut pas voir l'adresse, le lien ou l'historique d'un autre.
- Le lien de visioconférence est **recalculé à partir de l'inscription en cours
  de traitement**. Il est structurellement impossible d'envoyer à un élève le
  salon d'un autre (c'est le test n° 19).
- Les e-mails aux professeurs ne contiennent **aucune adresse d'élève ni aucun
  lien de salon** : le prof passe par son espace.
- Un e-mail de paiement ne peut pas être déclenché par un paramètre d'URL : le
  statut est écrit en base, côté serveur, par l'administratrice.
- L'adresse d'un message ne peut pas être modifiée depuis l'administration ;
  seuls les envois de test partent vers ton adresse.
- Les routes `cron` et `webhook` exigent un secret ; la désinscription utilise un
  jeton signé (HMAC) qui ne contient pas d'adresse en clair.

---

## 7. Ce qui reste à faire un jour (non bloquant)

- Passer à `bonjour@matineesdubac.fr` (partie 4) — nécessaire avant toute
  campagne commerciale, Brevo refusant les domaines gratuits pour cet usage.
- Renseigner le réglage **Instructions de virement** (ton IBAN / la référence à
  indiquer) : il apparaît alors dans les e-mails de paiement. Tant qu'il est
  vide, les messages invitent simplement à répondre à l'e-mail.
- Renseigner **Adresse du questionnaire d'avis** si tu veux un bouton dans la
  demande d'avis (sinon, la personne répond simplement à l'e-mail).
- Redéployer le site vitrine pour activer l'envoi des demandes (étape 8).
- Les campagnes commerciales de masse (annonce d'une nouvelle date à toute la
  base) ne sont **volontairement pas automatisées** : les modèles existent, mais
  l'envoi groupé demandera une action explicite de ta part.
