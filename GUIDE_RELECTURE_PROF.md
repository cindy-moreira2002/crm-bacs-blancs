# Dossier de relecture prof — mode d'emploi

La page `/relecture/[matiere]` montre à un professeur de la discipline, sur un
seul écran : le barème en clair, la taxonomie d'erreurs, une copie réellement
corrigée par le pipeline, puis **trois questions**. Ses réponses sont
enregistrées en base et servent à valider ou ajuster le barème avant
activation.

## Mise en service (une fois)

1. **Jouer `supabase/sql/15_relecture_prof.sql`** dans le SQL Editor du projet
   pipeline (`xgdaibekjmtffvkwvcge`) — crée la table `relecture_feedback`.
   À faire **avant** le déploiement de la page.
2. Déployer (push sur `main` comme d'habitude). Aucune variable Vercel à
   ajouter : l'accès est signé avec `PIPELINE_INTERNAL_SECRET`, déjà en place.

## Envoyer le dossier à un prof

```bash
node scripts/lien-relecture.mjs francais
```

Le script imprime le lien production et le lien localhost. C'est ce lien (avec
son `?t=…`) que tu envoies au prof — sans le jeton, la page refuse poliment.
Le même lien vaut pour tous les profs de la matière ; il ne change pas tant
que `PIPELINE_INTERNAL_SECRET` ne change pas.

Matières disponibles : `francais` aujourd'hui ; `ses`, `svt`, `hggsp`, `hlp`
fonctionneront avec le même lien signé dès qu'on voudra les faire relire (la
page lit tout en base, il n'y a rien à coder en plus).

## Lire les réponses

Rejouer le **BLOC B** de `15_relecture_prof.sql` dans le SQL Editor : une
ligne par réponse, avec les choix (valider / ajuster / revoir, sévère / juste /
généreuse) et le début des commentaires. Le détail complet est dans la colonne
`reponses` (JSON).

## Ce que le prof voit

1. **Le barème** — chaque grille de la matière (critères, niveaux, garde-fous,
   consigne exacte du correcteur), avec son statut : « appliquée aujourd'hui »
   ou « brouillon — en attente de votre avis ».
2. **Les erreurs types** — la taxonomie par épreuve (définition, signaux dans
   la copie, critères affectés).
3. **Une copie corrigée** — la vraie sortie du pipeline (note, scores par
   critère, citations justificatives, erreurs signalées), la copie de l'élève
   en dépliant, et le lien vers le dossier tel que l'élève le reçoit.
4. **Trois questions** — barème (valider / ajuster / revoir), justesse de la
   note sur la copie exemple, manques de la taxonomie. Nom + e-mail demandés,
   établissement facultatif.
