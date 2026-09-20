# Parcours utilisateur de A à Z — checklist de test

Objectif : dérouler tout le chemin, de « un élève découvre les Matinées » jusqu'à
« l'argent est encaissé et le dossier de correction est dans son espace », et
cocher ce qui marche vraiment.

Relevé le 20 septembre 2026, sur le dépôt `~/crm-bacs-blancs` (dernier commit
`5b65df5`, 12 septembre 2026).

---

## ⚠️ À lire AVANT de tester

**Ce que tu vois en production n'est pas ce qu'il y a sur ton Mac.**
19 fichiers sont modifiés et non commités, dont tout le paiement à
l'inscription (`src/lib/paiementCompte.ts`, `src/lib/emails/expiration.ts`,
`src/components/FormInscription.tsx`, `src/app/api/inscriptions/route.ts`).

Donc :

- sur **inscription.matineesdubac.fr** → ancien écran de confirmation, **pas**
  d'écran rouge « En attente de paiement », pas d'IBAN, pas d'expiration ;
- sur **ton Mac** (`npm run dev`) → le nouveau parcours complet.

👉 Décide avant de commencer : soit tu testes en local (`npm run dev`, port
3000), soit tu commites + déploies puis tu testes en prod. Tester en prod
sans déployer = tu vas chercher des écrans qui n'y sont pas.

Trois réglages pilotent tout, dans **/direction/emails** :

| Réglage | Effet si mal posé |
| --- | --- |
| `paiement_iban` | vide → aucun cadre de virement nulle part, ni écran ni e-mail |
| `envoi_actif` | `non` → tout est préparé, rien ne part (répétition générale) |
| `validation_manuelle` | `oui` → rien ne part sans ton clic « Valider et envoyer » |

---

## Acte 0 — Elle découvre les Matinées

**Qui** : une mère, un élève de Terminale.

1. Site vitrine **matineesdubac.fr** (`~/Desktop/matieres-du-bac/index.html`).
2. Bouton d'inscription → `https://inscription.matineesdubac.fr/inscription?examen=bac`.
3. Variante : elle hésite → formulaire de préinscription → `POST /api/preinscriptions`
   → e-mail **« Demande reçue (préinscription) »**, puis relance
   **« Relance — intéressé non inscrit »** si elle ne finalise pas (uniquement
   si elle a coché « me recontacter »).

- [ ] Le bouton du site vitrine pointe bien vers l'inscription
- [ ] La préinscription arrive dans la table `preinscriptions`
- [ ] L'accusé de réception arrive dans la boîte mail
- [ ] ⚠️ La partie Brevet est archivée depuis le 12/09 — vérifier qu'aucun lien mort ne traîne

---

## Acte 1 — L'élève s'inscrit

**Où** : `/inscription`

Champs : prénom, nom, e-mail élève, **e-mail parent**, téléphone parent,
matière, **date (liste des sessions ouvertes)**, code d'affiliation
(facultatif, pré-rempli si arrivée par `?ref=CLAIRE3F7B`).

Ce que fait `POST /api/inscriptions` :

1. écrit dans `inscriptions` ;
2. **rattache à la session** (`sessions_bacs_blancs`) par matière + date ;
3. vérifie le code d'affiliation (code inconnu → ignoré, l'inscription passe) ;
4. met les e-mails **en file** (jamais d'envoi direct).

- [ ] La liste des dates montre bien les vraies sessions ouvertes
- [ ] Sans date choisie → l'inscription reste **non rattachée** à une session (bug d'affichage « 0 élève » plus tard)
- [ ] Double envoi du formulaire → `409 « Vous êtes déjà inscrit à cette matière »`, pas de doublon
- [ ] Code d'affiliation inventé → l'inscription passe quand même
- [ ] L'inscription apparaît dans **/direction/bacs-blancs** sous la bonne session

---

## Acte 2 — Le paiement

**⚠️ Partie non déployée à ce jour.**

Écran attendu juste après l'inscription : titre **« Inscription enregistrée »**,
sous-titre rouge **« En attente de paiement »**, cadre de virement (titulaire,
IBAN, BIC, montant, **référence = nom + début d'identifiant**), délai en
minutes (10 par défaut).

Puis :

- e-mail **« Inscription confirmée »** à l'élève, **parent en copie** ;
- relance **« Relance — paiement manquant »** après `relance_paiement_heures_apres` ;
- si `paiement_expiration_active = oui` : passé le délai, l'inscription est
  **annulée en base** et le parent reçoit **« Inscription annulée — délai dépassé »** ;
- toi, tu marques payé à la main dans **/direction/paiements** → e-mail **« Paiement confirmé »**.

- [ ] `paiement_iban` est renseigné dans /direction/emails (sinon l'écran dit juste « les coordonnées arrivent par e-mail »)
- [ ] La référence de virement est lisible sur un relevé bancaire
- [ ] Le parent reçoit bien la confirmation en copie
- [ ] L'expiration annule vraiment la ligne (à tester avec `paiement_delai_minutes = 1`)
- [ ] `/direction/paiements` : marquer payé → l'e-mail « Paiement confirmé » part
- [ ] 🔜 Remplacement prévu par Revolut (voir conversation du 20/09) : carte au lieu du virement

---

## Acte 3 — Les e-mails automatiques

25 modèles, file Supabase + `pg_cron` toutes les 5 minutes
(`/api/emails/cron`), tableau de bord **/direction/emails**.

Ceux du parcours élève, dans l'ordre :

`preinscription_recue` → `inscription_confirmee` → `paiement_attente` →
`paiement_confirme` / `inscription_expiree` → `infos_pratiques` → `lien_visio`
→ `rappel_veille` → `dernier_rappel` → `session_terminee` →
`correction_disponible` → `demande_avis`.
Plus : `session_modifiee`, `session_annulee`, `facture_disponible`.

Côté prof : `prof_affectation`, `prof_infos_session`, `prof_rappel_veille`,
`prof_copies_disponibles`, `prof_rappel_correction`, `prof_mission_terminee`.

- [ ] **Jamais vérifié à ce jour : qu'un e-mail arrive RÉELLEMENT dans une boîte.** C'est le test n°1.
- [ ] Un message en statut « bloqué — donnée manquante » = une variable absente : lequel ?
- [ ] Le quota quotidien Brevo n'est pas dépassé
- [ ] Le lien de désinscription fonctionne (`/desinscription`)
- [ ] Déplacer une session dans Supabase → « Session modifiée » part tout seul
- [ ] `actif_depuis` est bien posé (sinon envoi rétroactif sur de vieilles lignes)

---

## Acte 4 — L'élève entre dans son espace

**Où** : `espaces.matineesdubac.fr/espace-eleve`

1. Il saisit son adresse → `POST /api/eleve/code`.
2. Code à 6 chiffres envoyé **en direct par Brevo** (hors file, valable 15 min).
3. Connexion → cookie signé. L'identité vient **uniquement** du cookie :
   impossible de voir l'espace d'un camarade en changeant l'adresse.

⚠️ Sans `BREVO_API_KEY`, la connexion est **refusée** (pas de repli).

Ce qu'il voit : sa prochaine matinée, le bouton **« Écrire ma copie »**, la
carte **« Mon sujet »**, la liaison Discord, et plus bas **« Mes anciens bacs
blancs & mes copies »**.

- [ ] Adresse inconnue → même écran que adresse connue (pas d'annuaire)
- [ ] Le code arrive en moins d'une minute
- [ ] Code périmé (> 15 min) → refus propre
- [ ] Le bon nom, la bonne matière, la bonne date s'affichent
- [ ] Déconnexion → l'espace redemande le code

---

## Acte 5 — Liaison Discord

Salle vocale **privée par élève**, sans bot de modération.

1. L'élève clique « Relier mon compte Discord » → OAuth
   (`/api/discord/oauth/depart` → `/retour`).
2. Toi, dans **/direction/discord** → bouton **« Préparer les salles »** → une salle par élève.
3. Jour J : le bouton de l'élève s'ouvre, le prof passe de salle en salle.

- [ ] ⚠️ **Jamais exercé en conditions réelles.** À faire au moins une fois avec un vrai élève.
- [ ] L'élève non relié voit l'avertissement **avant** le jour J, pas le matin même
- [ ] `403` au moment de créer les salles = le bot n'a pas accès à la catégorie
- [ ] Un élève ne peut pas entrer dans la salle d'un autre
- [ ] Le prof voit bien la catégorie entière depuis sa console

---

## Acte 6 — Avant l'épreuve

- `infos_pratiques` part J-`infos_pratiques_jours_avant`
- `lien_visio` part J-`lien_visio_jours_avant`
- `rappel_veille` à l'heure réglée
- `dernier_rappel` X minutes avant
- **Le sujet s'ouvre tout seul 10 minutes avant** (`pg_cron` + `/api/eleve/sujets`)

⚠️ Publication auto du sujet : **SQL 44 à jouer**, code non commité. Et si
l'heure de la session est illisible, **la publication ne se fait pas du tout**.

- [ ] Toutes les sessions ont une heure de début lisible
- [ ] Avant l'heure : la carte « Mon sujet » s'affiche **sans fichier**, avec l'heure d'ouverture
- [ ] À l'heure : le PDF s'ouvre (lien signé 5 minutes)
- [ ] Un élève non inscrit à cette session ne peut pas ouvrir le sujet
- [ ] Le sujet déposé pour la session est bien celui sur lequel on corrigera ensuite

---

## Acte 7 — Le jour J

### Côté prof — `/espace-prof/session/<id>`

Trois gros boutons en haut : **Salles Discord**, **Mon classeur de correction**,
**Dossier des copies**. Plus : bip sonore, mains levées, liste des élèves,
bouton « Créer mon classeur », bloc « Après l'épreuve ».

### Côté élève — application d'écriture (`~/matinees-ecriture`)

- ordinateur : `/copie/{code}` — la copie A4 + le QR d'appairage
- téléphone : `/ecrire/{code}` — la surface d'écriture (paysage)
- le prof ouvre la même page en `?prof=1` : il **commente au clavier**
  (bulles + fil de discussion), il n'écrit plus à l'encre

⚠️ `ecriture_commentaires` : **SQL à jouer**.

- [ ] Le QR s'appaire du premier coup (si mort en local : `allowedDevOrigins`)
- [ ] Le trait apparaît en temps réel sur l'ordinateur
- [ ] Le téléphone perd le réseau 30 s → rien n'est perdu (localStorage fait foi)
- [ ] Mode Géométrie (📐) : règle + compas
- [ ] L'élève lève la main → le prof entend le bip et voit le nom
- [ ] Le prof ouvre `?prof=1` → son commentaire apparaît chez l'élève
- [ ] ⚠️ Ne jamais changer le secret HMAC : toutes les copies en cours deviennent illisibles

---

## Acte 8 — La copie part à la correction

**Où** : `/espace-prof/deposer` (le prof) ou la console de session.

`POST /api/pipeline/deposer` : garde d'accès → **plafond de dépense** →
transcription → correction (3 Edge Functions Anthropic) → dossier.

- [ ] Le sujet proposé au dépôt est bien celui de la session (sinon `409`)
- [ ] Le quota de dépôt bloque proprement (`429`) au lieu de brûler du crédit
- [ ] **Lire l'état en base, jamais le code HTTP** : une copie peut être « en cours » alors que la réponse était 200
- [ ] `/direction/correction` : la matière est bien en `active` (sinon le sujet n'apparaît pas au dépôt)
- [ ] ⚠️ **Plafond Anthropic toujours à poser** — un dépôt en boucle coûte cher
- [ ] Une copie bloquée apparaît dans **/direction/a-faire**

---

## Acte 9 — La note

- Matières à questions numérotées (maths…) → **barème par sujet** (`/direction/bareme`)
- Matières rédigées (philo, HGGSP…) → **grille commune**
- Hybride : **la note du prof fait foi**, l'IA rédige (Edge v5)
- Échelles : SES 4+6+10, HGGSP 10+10, HG /10 — **une note pas sur 20 n'est pas un bug**

⚠️ Grilles de correction profs (Sheet) : **SQL 50 à jouer**.

- [ ] Import de la grille CSV du prof → la note remonte
- [ ] `bareme_verifier()` passe au vert
- [ ] Le relecteur voit les attendus, l'élève non
- [ ] HGGSP : les 2 grilles verrouillées donnent des notes définitives (56 étalons **jamais relus par un prof**)

---

## Acte 10 — Le dossier revient à l'élève

1. Dossier généré → e-mail **« Correction disponible »**.
2. Espace élève → **« Mes anciens bacs blancs & mes copies »** → 📄 Ma copie
   (`/api/copies/fichier`) et 📘 Mon dossier de correction (`/api/copies/pdf`).
3. X jours plus tard → **« Demande d'avis »** (lien `lien_avis_url`).

- [ ] Le PDF s'ouvre depuis un téléphone
- [ ] Un autre élève connecté ne peut pas ouvrir ce dossier (`autoriserCopie`)
- [ ] Tant que la correction tourne : l'élève lit **« Correction en cours »**, pas une erreur
- [ ] `lien_avis_url` est bien rempli, sinon la demande d'avis part vers le vide
- [ ] Le dossier montre l'énoncé à côté de la correction

---

## Acte 11 — L'argent

- **/direction/paiements** : qui a payé, qui relancer, combien est encaissé
- **Affiliation prof** : 10 €/élève via `?ref=` → `revenus_prof` au paiement
  (⚠️ **non commité, SQL 47 à jouer**)
- **Suivi financier** : classeur Google Sheets (`~/matinees-finances`),
  branché au CRM. CA Urssaf = **encaissé parents**, les factures profs ne se
  déduisent pas. ⚠️ **SIRET manquant.**
- E-mail **« Facture envoyée au parent »** : déclenché par le classeur, jamais
  par le planificateur

- [ ] Un paiement marqué payé remonte dans le classeur
- [ ] Le prof voit son gain dans « Bacs blancs passés » sur son tableau de bord
- [ ] Le lien d'affiliation d'un prof crée bien la ligne de revenu

---

## Ton poste de pilotage

| Page | À quoi elle sert |
| --- | --- |
| **/crm** (Vue direction) | essais / vrais bacs blancs séparés, readiness 9 colonnes |
| **/direction/a-faire** | ce qui bloque, en rouge |
| **/direction/bacs-blancs** | ＋ Nouveau bac blanc, sujets, profs, retours |
| **/direction/emails** | 25 modèles, réglages, « Valider et envoyer » |
| **/direction/paiements** | qui doit payer |
| **/direction/correction** | activer une matière / un sujet |
| **/direction/bareme** | barèmes par sujet |
| **/direction/discord** | préparer les salles |
| **/direction/profs**, **/direction/acces** | comptes profs, « Voir comme » |

---

## Les trous connus, par ordre de gravité

| # | Trou | Où |
| --- | --- | --- |
| 1 | **Aucun e-mail n'a jamais été vu arriver pour de vrai** | Acte 3 |
| 2 | Paiement à l'inscription **non déployé** (19 fichiers non commités) | Acte 2 |
| 3 | `paiement_iban` vide → aucun moyen de payer affiché | Acte 2 |
| 4 | **SIRET manquant** → pas de compte pro, pas de Revolut | Acte 11 |
| 5 | Discord **jamais exercé en réel** | Acte 5 |
| 6 | SQL non joués : **44** (sujets auto), **47** (affiliation), **50** (grilles profs), `ecriture_commentaires` | Actes 6, 9, 11 |
| 7 | **Plafond Anthropic non posé** sur la correction | Acte 8 |
| 8 | 56 étalons HGGSP **jamais relus par un prof** | Acte 9 |
| 9 | Faux comptes de test à purger avant novembre | partout |
| 10 | Doublons de projets Vercel à nettoyer | infra |

📅 Rappel : les **vrais** bacs blancs commencent **en novembre 2026**. Tout ce
qui est en base avant est un **essai** — ne jamais l'annoncer comme une
échéance à une famille.

---

## Ordre de test conseillé (une demi-journée)

1. Poser `paiement_iban`, `envoi_actif = oui`, `validation_manuelle = oui` dans /direction/emails
2. T'inscrire toi-même avec deux adresses (élève + parent) sur une session d'**essai**
3. Regarder /direction/emails : les messages sont-ils en file ? Cliquer « Valider et envoyer »
4. **Vérifier les deux boîtes mail** ← le test qui compte
5. Te connecter à l'espace élève avec le code reçu
6. Relier un compte Discord, préparer les salles, entrer dans la tienne
7. Ouvrir la copie sur ordinateur + téléphone, écrire trois mots, commenter en `?prof=1`
8. Déposer la copie, suivre l'état **en base**, récupérer le dossier côté élève
9. Marquer payé, vérifier le classeur financier
10. Purger les lignes de test
