# Brancher la correction automatique sur l'espace prof

Guide pas à pas. Compte environ 25 minutes la première fois.

À la fin : un prof choisit un bac blanc, glisse un PDF, et récupère le dossier
de correction de l'élève. Il ne voit jamais Supabase, ne tape jamais de SQL.

---

## Les deux Supabase à ne pas confondre

| Projet | Identifiant | Ce qu'il contient |
|---|---|---|
| **CRM** | `orpbfnmdlvxmkvyrpvtj` | inscriptions, copies, espace élève/prof |
| **Pipeline** | `xgdaibekjmtffvkwvcge` (nom : `matineesdubac`) | corrections, transcriptions, dossiers, barèmes |

**Tout ce guide se passe dans le projet PIPELINE.** Si tu vois une table
`inscriptions` dans la liste, tu es dans le mauvais projet.

---

## Étape 1 — Jouer la migration (dans Supabase)

1. Va sur https://supabase.com/dashboard
2. Ouvre le projet **`matineesdubac`** (référence `xgdaibekjmtffvkwvcge`).
3. Dans la barre latérale gauche, clique **SQL Editor** (icône `</>`).
4. Clique **+ New query** en haut.
5. Ouvre le fichier `MIGRATION_pipeline.sql` de ce dossier.
6. Copie **un bloc à la fois** (BLOC 0, puis 1, puis 2, puis 3), colle-le dans
   l'éditeur, et clique **Run** (ou `Cmd + Entrée`).
7. Après chaque bloc, lis le tableau de résultat. Chaque bloc dit dans ses
   commentaires ce qui est attendu.

### Ce que fait chaque bloc

| Bloc | Effet | Résultat attendu |
|---|---|---|
| **0** | Ne modifie rien. Vérifie que le moteur est bien là. | 2 fonctions listées, 8 tables `true` |
| **1** | Ajoute le nom / l'email de l'élève sur les corrections | 5 lignes |
| **2** | Crée les 2 points d'entrée de l'application | 2 lignes, `security_definer = true` |
| **3** | **Verrouille les 8 tables** (RLS) | 8 lignes `rls_active = true` |
| **4** | Test à blanc, optionnel | un nouveau dossier apparaît |

> **Si le BLOC 0 renvoie un tableau vide ou incomplet : arrête-toi et
> préviens-moi.** Ça voudrait dire que le moteur porte d'autres noms, et le
> BLOC 2 pointerait dans le vide.

### Ce que veut dire « verrouiller » (BLOC 3)

Activer RLS sans écrire aucune règle d'accès = **personne ne peut lire ni
écrire ces tables depuis un navigateur**. Continuent de fonctionner :

- le serveur de l'application (il utilise la clé secrète, qui passe outre) ;
- les 3 Edge Functions (même clé) ;
- les déclencheurs internes de la base ;
- toi, dans le SQL Editor.

C'est ça qui garantit qu'un prof ne pourra jamais toucher la base, même en
essayant.

---

## Étape 2 — Récupérer les deux valeurs secrètes

### a) La clé secrète du projet (service_role)

Toujours dans le projet `matineesdubac` :

1. Barre latérale, tout en bas : **Project Settings** (roue crantée).
2. Section **API Keys**.
3. Cherche la clé **`service_role`** (ou, dans la nouvelle interface, l'onglet
   **Secret keys** et une clé qui commence par `sb_secret_`).
4. Clique **Reveal** puis copie.

⚠️ Cette clé ouvre toute la base. Elle ne va **que** dans un fichier
d'environnement ou dans Vercel. Jamais dans le code, jamais dans une
conversation, jamais dans un mail.

### b) Le secret du pipeline

Il existe déjà (les Edge Functions s'en servent), mais l'interface ne le
réaffiche pas. On le relit dans le coffre-fort de la base :

**SQL Editor → New query →** colle ceci → **Run** :

```sql
select name, decrypted_secret
from vault.decrypted_secrets
where name = 'pipeline_internal_secret';
```

Copie la valeur de la colonne `decrypted_secret`.

---

## Étape 3 — Renseigner les clés en local (sur ton Mac)

Ouvre le fichier d'environnement local :

```bash
open -e ~/crm-bacs-blancs/.env.local
```

Ajoute ces deux lignes à la fin, en collant tes valeurs après le `=` :

```
PIPELINE_SUPABASE_SERVICE_ROLE_KEY=colle_la_cle_service_role_ici
PIPELINE_INTERNAL_SECRET=colle_le_secret_ici
```

Enregistre (`Cmd + S`), ferme.

Pas de guillemets nécessaires, pas d'espace autour du `=`, une ligne par clé.

> L'adresse du projet (`PIPELINE_SUPABASE_URL`) est déjà renseignée dans
> `.env`, tu n'as pas à la retaper.
>
> Ces fichiers sont ignorés par git : rien ne partira sur GitHub.

---

## Étape 4 — Renseigner les clés en production (dans Vercel)

1. Va sur https://vercel.com et ouvre le projet **`espaces-matineesdubac`**
   (c'est celui qui sert `crm-bacs-blancs-ihgf.vercel.app`).
2. Onglet **Settings** → **Environment Variables**.
3. Ajoute **trois** variables, une par une. Pour chacune, coche les trois
   environnements (**Production**, **Preview**, **Development**) :

| Name | Value |
|---|---|
| `PIPELINE_SUPABASE_URL` | `https://xgdaibekjmtffvkwvcge.supabase.co` |
| `PIPELINE_SUPABASE_SERVICE_ROLE_KEY` | la clé secrète de l'étape 2a |
| `PIPELINE_INTERNAL_SECRET` | le secret de l'étape 2b |

4. **Save**.
5. Onglet **Deployments** → sur le déploiement le plus récent, menu `…` →
   **Redeploy**. Sans ça, les nouvelles variables ne sont pas prises en compte.

---

## Étape 5 — Vérifier

Dis-moi « c'est fait » et je teste avec un vrai PDF.

Si tu veux vérifier toi-même : va sur `/espace-prof/deposer`.

- **Bandeau orange** nommant des variables → elles ne sont pas arrivées
  (mauvais environnement coché, ou pas de redéploiement).
- **Menu « Bac blanc » rempli** (commentaire Barbey d'Aurevilly, dissertation
  Musset) → tout est branché.

---

## Où arrivent les données ensuite

| Ce que fait le prof | Ce qui se passe |
|---|---|
| Il choisit le bac blanc | lu dans `subject_cards` + `rubrics` |
| Il glisse le PDF | envoyé direct au stockage `student-copies` |
| Il clique « Corriger » | une ligne dans `corrections`, puis le moteur démarre |
| Il attend | `copy_transcriptions`, puis la note dans `corrections.result_json` |
| Le dossier s'affiche | une ligne dans `dossiers`, servie en HTML |
| Il clique « Télécharger le PDF » | impression du navigateur → Enregistrer en PDF |

L'élève reçoit le lien `/dossier/<identifiant>`.
