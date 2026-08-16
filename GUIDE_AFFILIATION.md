# Affiliation des profs — 10 € par élève amené

Ce guide décrit ce qui a changé et **les 2 choses que tu dois faire toi-même**.

---

## Ce qui manquait, et qui est réparé

Avant : chaque prof avait bien un lien d'affiliation dans son espace
(`…/inscription?ref=SONCODE`), mais **le formulaire d'inscription ne lisait pas
ce `?ref`**. Le code n'était écrit nulle part, aucune ligne d'argent n'était
créée, et la page Paiements ne parlait que des élèves. Autrement dit : un prof
pouvait amener dix élèves sans que ça laisse la moindre trace.

Maintenant, la chaîne complète :

1. le prof partage son lien (espace prof → « Mon lien d'affiliation ») ;
2. l'élève arrive sur le formulaire : le champ **« Code du professeur qui t'a
   recommandé »** est déjà rempli, et il voit « ✅ Recommandé par Cindy M. » ;
   s'il vient sans lien, il peut taper le code à la main ;
3. le code est enregistré sur son inscription (`inscriptions.code_affiliation`),
   après vérification qu'il correspond à un prof réel — un code inventé est
   ignoré, l'inscription passe quand même ;
4. **le jour où cet élève paie**, une ligne de 10 € apparaît automatiquement
   dans les revenus du prof. Tant que l'élève n'a pas payé, la page affiche
   « en attente du paiement de l'élève » : on ne doit rien tant que rien n'est
   encaissé ;
5. tu vois tout dans **Paiements → onglet 💸 Virements aux profs** et
   **onglet 🔗 Parrainages**, et tu coches « ✅ Viré » quand le virement part.

---

## 1. À faire par toi : jouer le script SQL (5 minutes)

Sans ce script, la page fonctionne mais affiche un bandeau orange « Les IBAN ne
sont pas encore stockables » et les 10 € ne peuvent pas être enregistrés.

1. Ouvre le **SQL Editor du projet CRM** :
   https://supabase.com/dashboard/project/orpbfnmdlvxmkvyrpvtj/sql/new
   (⚠️ le projet CRM `orpbfnmdlvxmkvyrpvtj`, **pas** le projet pipeline)
2. Ouvre le fichier `supabase/sql/47_affiliation.sql`, copie **tout** son
   contenu, colle-le dans l'éditeur.
3. Clique sur **Run** (en bas à droite).
4. Résultat attendu : un tableau d'une ligne avec
   `colonne_inscription_id = 1`, `colonnes_virement = 2`, puis le nombre de
   lignes d'affiliation et d'inscriptions parrainées (0 et 0 aujourd'hui,
   c'est normal, personne n'est encore venu par un lien).

Le script est **idempotent** : si tu le relances, il ne casse rien et ne crée
pas de doublon.

## 2. À faire par toi : recharger la page Paiements

https://espaces.matineesdubac.fr/admin/paiements

Le bandeau orange disparaît. Si des élèves parrainés avaient déjà payé avant le
script, clique sur **🔁 Rattraper les manquants** dans l'onglet
🔗 Parrainages : leurs 10 € sont créés d'un coup.

---

## La page Paiements, onglet par onglet

| Onglet | Ce qu'il répond |
|---|---|
| 👨‍🎓 **Élèves** | Qui n'a pas encore réglé sa matinée, depuis combien de jours, combien de relances sont parties. |
| 💸 **Virements aux profs** | Pour chaque prof : le montant à virer, son IBAN, et le détail (coaching / affiliation). Bouton **✅ Viré** ligne par ligne. |
| 🔗 **Parrainages** | Un élève par ligne : qui l'a amené, s'il a payé, et où en sont ses 10 €. |

Les 4 cartes du haut séparent l'argent qui **entre** (encaissé, à encaisser) de
l'argent qui **sort** (à virer aux profs, dont affiliation).

### Coaching : de « prévu » à « dû »

Quand un prof s'inscrit comme coach sur un bac blanc, sa rémunération est
d'abord une **prévision**. Elle apparaît dans son détail sous « Coaching prévu
— pas encore dans le dû ». Après l'épreuve, clique **Ajouter au dû** : la somme
rejoint le montant à virer. C'est volontaire — on ne doit pas d'argent pour une
matinée qui n'a pas eu lieu.

### IBAN

Dans le détail d'un prof, saisis l'IBAN et le titulaire du compte, puis
**Enregistrer**. Ils ne sont visibles que par toi (la table est protégée, et
l'espace prof ne les affiche pas).

---

## Le Google Sheet

Chaque tableau a deux boutons :

- **📋 Copier pour le classeur** → met le tableau dans le presse-papier au
  format tabulation. Tu cliques dans la première cellule de ton Google Sheet et
  tu fais `Cmd + V` : chaque colonne tombe à sa place.
- **⬇️ CSV** → télécharge le même tableau en `.csv` (point-virgule + accents
  corrects pour Google Sheets et Excel français).

### Le classeur automatique (celui que tu veux brancher)

Le classeur de suivi financier (`~/matinees-finances`) lit les revenus des
profs par `/api/finances` : chaque ligne d'affiliation arrive toute seule dans
l'onglet **`FACTURES_PROFESSEURS`**, avec le professeur, son e-mail, le montant
convenu, le statut (« Attendue » / « Payée ») — et, depuis aujourd'hui, la
**nature** de la somme dans la colonne *Commentaire* : « Affiliation — Marie
Dupont (Philosophie) » ou « Coaching — Philosophie du 2026-11-08 ». Sans cette
colonne, coaching et affiliation étaient impossibles à distinguer : même prof,
même colonne, montants voisins.

Le menu **💶 Payer les professeurs** du classeur trie ensuite par urgence et te
donne la liste prête à recopier dans Revolut. Il ne déclenche aucun virement.

**Rien à installer** : vérifié le 2026-08-16 dans Chrome, le classeur est en
place et branché (« 🔌 Tester la connexion au CRM » répond *Sessions : 11,
Inscriptions : 16, Professeurs : 3, Revenus professeurs : 0*), et la ligne qui
écrit la nature a été ajoutée directement dans son `11_SyncCRM.gs`.

Les 10 € y arriveront à la première synchronisation **lancée après** le SQL 47
et le déploiement du CRM — sachant que tu as choisi de ne pas importer le CRM
tant que ce sont des essais.

---

## Ce que voit le prof

Dans son espace : son lien, son code, le nombre d'élèves parrainés et le total
de son affiliation. Il ne voit ni les IBAN des autres, ni les élèves qu'il n'a
pas amenés.

## Le lien depuis matineesdubac.fr

La vitrine a été modifiée pour **retenir le `?ref=`** : si un prof partage
`matineesdubac.fr/?ref=SONCODE`, le code suit l'élève jusqu'au formulaire, même
s'il visite trois pages avant de cliquer sur « S'inscrire ». Le fichier
`~/Desktop/matieres-du-bac/index.html` est modifié mais **pas encore déployé**.
