# Espaces Prof — mise en service

Tout le code est en place. Il reste 4 branchements à faire, dans cet ordre.

---

## 1. Créer les tables (Supabase)

Ouvre le **projet CRM `orpbfnmdlvxmkvyrpvtj`** (pas le projet pipeline), SQL Editor,
et colle le contenu de :

```
supabase/sql/09_espaces_prof_schema.sql
```

Le script est idempotent : tu peux le relancer sans rien casser.

À la fin, la requête de vérification doit afficher :

- `tables` → `corrections_grille, professeurs, revenus_prof, session_coachs, sessions_bacs_blancs`
- `sessions seedees` → `5`

Ce que ça crée :

| Table | Rôle |
|---|---|
| `professeurs` | fiche prof — **aucun mot de passe ici** |
| `sessions_bacs_blancs` | les bacs blancs (remplace le tableau en dur de `src/lib/sessions.ts`) |
| `session_coachs` | quel prof coache quelle session |
| `revenus_prof` | affiliation + coaching |
| `corrections_grille` | ce que le prof a importé du Google Sheet, après relecture |

Les inscriptions élèves gagnent aussi `session_id` et `code_affiliation`.

---

## 2. Ajouter les variables d'environnement (Vercel)

Projet **espaces-matineesdubac** → Settings → Environment Variables.

| Variable | Où la trouver |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, projet CRM → Settings → API → `service_role` |
| `PROF_SESSION_SECRET` | à générer, voir ci-dessous |

Pour générer le secret de session (dans un terminal) :

```bash
openssl rand -base64 48
```

Colle le résultat dans `PROF_SESSION_SECRET`. C'est lui qui signe les cookies de
session : s'il change, tout le monde est déconnecté (rien n'est perdu).

Puis **redéploie**.

> Tant que ces deux variables manquent, `/espace-prof` affiche un écran
> « Espace prof non configuré » qui liste précisément ce qui manque — pas une
> erreur 500.

Pour tester en local, mets-les aussi dans `.env.local`.

---

## 3. Te donner l'accès administratrice

L'accès admin est un compte prof avec `role = 'admin'`. Donc :

1. Va sur `/devenir-coach` et **candidate avec ton propre e-mail**.
2. Puis dans le SQL Editor du CRM :

```sql
update public.professeurs
set role = 'admin', statut_candidature = 'acceptee'
where email = 'ton.email@exemple.fr';
```

À partir de là tu peux :

- **lister tous les profs** → `GET /api/admin/professeurs`
- **modifier une fiche / réinitialiser un mot de passe** → `PATCH /api/admin/professeurs`
  avec `{ "id": "...", "nouveauMotDePasse": "..." }`
- **entrer dans l'espace de n'importe quel prof** → `POST /api/admin/voir-comme`
  avec `{ "professeurId": "..." }`, puis va sur `/espace-prof`.
  Un bandeau rouge te rappelle en permanence que tu es dans l'espace de
  quelqu'un d'autre, avec un bouton « Revenir chez moi ».

**Tu ne peux jamais lire un mot de passe** — ni toi, ni personne. Ils sont hachés
par Supabase Auth. Si un prof oublie le sien, tu lui en définis un nouveau et il
le change ensuite. C'est volontaire : c'est ce qui rend le système sûr.

---

## 4. Google Sheet de suivi des profs (facultatif)

Suis les instructions en tête de `GOOGLE_APPS_SCRIPT_PROFS.js`.
Résumé : crée un Sheet, colle le script, déploie en web app, puis ajoute dans Vercel :

- `PROFS_SHEET_WEBAPP_URL` = l'URL `/exec`
- `PROFS_SHEET_TOKEN` = le même jeton que dans le script

Colonnes du Sheet : prénom, nom, e-mail, téléphone, matières, date d'inscription,
statut candidature, statut compte, bacs blancs.

**Aucun mot de passe n'y est envoyé**, et le script refuse activement toute
donnée qui ressemblerait à un mot de passe.

Si ces variables sont absentes, tout fonctionne — seul le Sheet n'est pas alimenté.

---

## Ce qui existe maintenant

| Écran | Chemin |
|---|---|
| Devenir coach (candidature + connexion) | `/devenir-coach` |
| Tableau de bord prof (4 onglets) | `/espace-prof` |
| Détail d'un bac blanc (3 sous-onglets) | `/espace-prof/session/[id]` |
| Import de la grille de correction | `/espace-prof/session/[id]/import` |
| Ancien suivi des dossiers | `/espace-prof/corrections` |
| Dépôt d'une copie (pipeline) | `/espace-prof/deposer` |

---

## Restes à faire

- **Le vrai Google Sheet de correction n'existe pas encore.** L'onglet
  « Corrections » d'une session affiche un lien de démonstration, clairement
  signalé comme tel. Quand le vrai Sheet sera prêt :

  ```sql
  update public.sessions_bacs_blancs
  set sheet_correction_url = 'https://docs.google.com/spreadsheets/d/…'
  where id = '…';
  ```

  Le lien est remplacé partout automatiquement, sans toucher au code.

- **Rémunérations.** `revenus_prof` est créée et lue par le tableau de bord,
  mais rien ne l'alimente encore : il faut décider les montants (par élève
  parrainé, par matinée coachée) avant de brancher le calcul automatique.

- **`src/lib/sessions.ts`** contient encore les sessions en dur : c'est ce que
  lit le formulaire d'inscription élève. Les sessions sont maintenant aussi en
  base ; il faudra faire lire la base au formulaire élève pour n'avoir qu'une
  seule source.

- **Rattachement des copies au pipeline.** L'import de grille génère les dossiers
  pour les élèves qui ont déjà une correction dans le pipeline (rapprochés par
  nom). Les autres sont listés à l'écran. Un identifiant partagé entre
  `inscriptions` et `corrections` rendrait ce rapprochement exact.
