# Publier une correction dans l'espace d'un élève

**Quand :** Cindy dit « envoie la correction de X sur son espace ». Claude lance la commande ; rien ne se fait à la main.

## La commande

```bash
cd ~/crm-bacs-blancs
# 1. Toujours d'abord la simulation (n'écrit rien)
npm run correction:publier -- <correction_id> --dry-run
#    ou, si on connaît l'élève et la matière :
npm run correction:publier -- <email-eleve> <matiere> --dry-run      # matiere : francais, philosophie, maths, ses, svt, hggsp, hlp, physique-chimie, anglais

# 2. Si le récapitulatif est juste : la même chose sans --dry-run
npm run correction:publier -- <correction_id>
```

Options : `--eleve <email>` (correction sans e-mail), `--inscription <id>` (plusieurs bacs blancs dans la matière), `--remplacer` (recorrection : remplace la correction déjà publiée), `--sans-note` / `--avec-note`.

## Ce que ça fait

1. Lit la correction du **pipeline** (`corrections` + dernier `dossiers`) : elle doit être corrigée, avoir un dossier élève, et ne pas être une copie étalon.
2. Trouve l'inscription CRM **par e-mail + matière**, jamais par le nom. En cas de doute, la commande s'arrête et liste les candidats.
3. Crée (ou met à jour) **une** ligne `copies` (`envoye = true`, reliée par `remarques.pipeline.correction_id`). L'espace élève affiche la note /20 et le bouton **📘 Mon dossier de correction**, qui ouvre `/dossier/<correction_id>`.
4. Pose `inscriptions.correction_publiee_le` (s'il est vide) et met en file l'e-mail **« correction disponible »**. Avec `validation_manuelle = oui`, **il attend** : il faut cliquer « Valider et envoyer » sur `/admin/emails`. L'e-mail « demande d'avis » est aussi programmé 3 jours plus tard (même règle de validation).

La relancer ne crée aucun doublon (même ligne `copies`, même clé d'e-mail).

## La note affichée

- Si `note_source = professeur` : c'est la note du prof, qui fait foi.
- Sinon : la note de l'IA, sauf si le dossier n'affiche **qu'une fourchette** (« 4 – 8 / 20 »). Dans ce cas l'espace montre « ✓ Corrigé » sans chiffre, pour ne pas contredire le dossier (`--avec-note` force la note).
- Un barème différent de 20 est ramené sur 20 (au quart de point) et le récapitulatif le signale.

## Refus volontaires

Copie étalon, correction pas terminée, pas de dossier, élève non inscrit(e), inscription annulée, plusieurs corrections ou plusieurs inscriptions possibles, et **bac blanc en plusieurs exercices** (`groupe_copie_id`, par exemple l'HGGSP complète). Ce dernier cas n'est pas encore géré.
