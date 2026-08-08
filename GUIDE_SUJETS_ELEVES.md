# Le sujet arrive tout seul dans l'espace élève

Le jour du bac blanc, le sujet s'ouvre dans l'espace de chaque élève inscrit, **dix minutes avant le début de l'épreuve** — sans que personne ait à cliquer à l'heure dite.

Ce document dit quoi faire pour le mettre en service, puis comment s'en servir chaque session.

---

## 1. Mise en service — une seule fois

### Étape 1 — jouer le SQL

Dans **Supabase, projet CRM** (`orpbfnmdlvxmkvyrpvtj`) → SQL Editor → New query → coller tout `supabase/sql/44_sujets_eleves.sql` → Run.

Prérequis : `41_bacs_blancs_pilotage.sql` doit déjà avoir été joué (tables `session_sujets` et `session_retours`).

Le script est rejouable sans risque.

### Étape 2 — vérifier les heures de début

Le script ajoute une vraie heure de début (`debut_le`) aux sessions, calculée à partir de la date et de l'heure écrite à la main (`9h`, `9 h 30`, `14h00`), **en heure de Paris**.

La dernière requête du script liste les sessions dont l'heure n'a pas pu être lue :

```sql
select id, matiere, date_epreuve, heure_debut
from public.sessions_bacs_blancs
where debut_le is null;
```

**Toute session qui ressort ici ne publiera jamais son sujet.** Corriger l'heure (`9h` plutôt que « le matin »), et `debut_le` se recalcule tout seul.

La page de pilotage affiche aussi une alerte rouge dans ce cas, à condition qu'une publication ait été programmée.

### Étape 3 — vérifier que l'horloge tourne

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'sujets-publication';
```

Une ligne, `* * * * *`, `active = true`. La tâche tourne **chaque minute** : à cinq minutes près, « dix minutes avant » ne voudrait plus rien dire.

Rien d'autre à poser : aucune variable d'environnement, aucun secret. Contrairement aux e-mails, la publication ne sort pas de la base — elle ne fait qu'un `update`.

---

## 2. Chaque session — ce que fait l'administratrice

Dans **`/admin/bacs-blancs`**, sur la session concernée :

1. **Déposer le sujet** (bloc « Sujet de l'épreuve », type **Sujet**).
2. Sur la ligne du sujet, dans la barre « Élèves » :
   - cocher **publier automatiquement** ;
   - régler le nombre de **minutes avant le début** (10 par défaut).
3. La pastille indique alors : « s'ouvre le 12 mars, 08:50 ».

C'est tout. À 8 h 50, le sujet apparaît chez les élèves inscrits à cette session.

**Le bouton « ouvrir maintenant »** force l'ouverture immédiate — pour le jour où la salle attend. **« refermer »** annule l'ouverture.

---

## 3. Ce que voit l'élève

Dans son espace, section **« 📄 Mon sujet »** :

- avant l'ouverture : `🔒 Il s'ouvre à 08:50 — dans 7 min`, avec un décompte qui se met à jour tout seul (la page interroge le serveur chaque minute quand l'heure approche : l'élève n'a rien à recharger) ;
- après : un bouton **« 📄 Ouvrir mon sujet »**.

Le lien de téléchargement est signé et **ne vaut que cinq minutes**. Il est demandé au moment du clic : rien de partageable ne traîne dans la page.

Aperçu sans se connecter : `/espace-eleve?demo=1`.

---

## 4. Les garde-fous

| Règle | Où elle est appliquée |
|---|---|
| **Un corrigé ou un barème ne s'ouvre jamais aux élèves** | contrainte SQL `session_sujets_eleves_sujet_seulement`, filtre `type = 'sujet'` du planificateur, et code de lecture (`lib/bacsBlancs.ts`) |
| Rien ne part sans avoir été armé | `publication_active`, faux par défaut |
| Un élève ne voit que les sujets de SES sessions | `sessionsDeLEleve()`, à partir du cookie signé — jamais d'adresse passée dans l'URL |
| Un sujet sans fichier ne s'ouvre pas | condition du planificateur |
| Une session sans heure lisible ne publie pas | `debut_le is not null` |
| Qui a téléchargé quoi, et quand | table `sujet_telechargements` |

Ces règles sont couvertes par `npm run test:sujets` (19 tests, hors ligne) — y compris la présence des garde-fous dans le fichier SQL, pour qu'ils ne disparaissent pas à une relecture distraite.

---

## 5. Dépannage

**Le sujet ne s'est pas ouvert.**

```sql
select matiere, titre, publication_active, minutes_avant,
       debut_le, publication_prevue, visible_eleve, publie_le
from public.v_sujets_publication
order by publication_prevue nulls last;
```

Lire dans l'ordre : `publication_active` faux → pas armé · `debut_le` vide → heure illisible · `publication_prevue` dans le futur → normal, ça vient · tout est bon mais `visible_eleve` faux → la tâche pg_cron ne tourne pas (étape 3).

Pour publier immédiatement tout ce qui est dû :

```sql
select public.publier_sujets_dus();
```

**Un élève ne voit pas le sujet alors que d'autres le voient.** Son inscription n'est probablement rattachée à aucune session (`inscriptions.session_id` vide) et sa matière ou sa date ne correspond pas exactement à celle de la session. Vérifier :

```sql
select id, email, matiere, date_epreuve, session_id
from public.inscriptions
where email ilike 'adresse@exemple.fr';
```

**Tout arrêter :** `select cron.unschedule('sujets-publication');` — aucune donnée n'est perdue, les sujets déjà ouverts le restent.
