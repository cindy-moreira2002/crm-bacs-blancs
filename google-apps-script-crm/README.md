# CRM de prospection Google Sheets - Les Matinées du Bac

## Architecture courte

Ce MVP utilise un Google Sheets comme interface principale et Google Apps Script comme moteur d'automatisation.

- Le classeur contient un onglet par catégorie de prospect, un tableau de bord, une configuration, une liste d'exclusion, une base de templates et un journal d'actions.
- Le script ne fait jamais d'envoi automatique. Il crée uniquement des brouillons Gmail.
- Les sécurités importantes sont centralisées : mode test, limite de brouillons, exclusion globale, vérification manuelle obligatoire de l'e-mail, verrouillage avec `LockService`.
- Les données publiques peuvent être importées par CSV ou proposées depuis le site officiel, mais elles ne sont jamais validées automatiquement.

## Fichiers à créer dans Apps Script

Créez un projet Apps Script lié au Google Sheets, puis créez ces fichiers dans l'éditeur :

1. `appsscript.json`
2. `Config.gs`
3. `Main.gs`
4. `Setup.gs`
5. `DataValidation.gs`
6. `Imports.gs`
7. `Deduplication.gs`
8. `Scoring.gs`
9. `Templates.gs`
10. `Personalization.gs`
11. `GmailDrafts.gs`
12. `FollowUps.gs`
13. `GmailTracking.gs`
14. `Dashboard.gs`
15. `Logging.gs`
16. `Utils.gs`
17. `PublicData.gs`

Copiez le contenu de chaque fichier livré dans ce dossier dans le fichier Apps Script portant le même nom.

## Créer le Google Sheets

1. Ouvrez Google Drive.
2. Créez un nouveau Google Sheets.
3. Nommez-le par exemple `CRM Prospection - Les Matinées du Bac`.
4. Ouvrez `Extensions > Apps Script`.
5. Collez les fichiers listés ci-dessus.
6. Enregistrez le projet Apps Script.
7. Rechargez le Google Sheets.
8. Le menu `Prospection MDB` apparaît.
9. Cliquez sur `Prospection MDB > Initialiser le CRM`.

L'initialisation crée automatiquement :

- `TABLEAU_DE_BORD`
- `CSE`
- `LYCEES_PRIVES`
- `LYCEES_PUBLICS`
- `MAIRIES`
- `ASSOCIATIONS_PARENTS`
- `ASSOCIATIONS_EDUCATIVES`
- `TEMPLATES`
- `CONFIGURATION`
- `LISTE_EXCLUSION`
- `JOURNAL_ACTIONS`
- `RELANCES_DU_JOUR`

## Autorisations Google nécessaires

Au premier lancement, Google demandera des autorisations pour :

- lire et modifier le Google Sheets ;
- créer des brouillons Gmail et rechercher des réponses potentielles ;
- accéder aux fichiers Drive nécessaires aux exports ou aux pièces jointes ;
- afficher des fenêtres dans le Google Sheets ;
- consulter des pages publiques si vous utilisez la recherche de pistes sur site officiel.

Le script ne demande pas d'autorisation d'envoi Gmail automatique.

## Remplir CONFIGURATION

Après l'initialisation, ouvrez `CONFIGURATION`.

Champs à vérifier en priorité :

- `Nom de l'expéditrice`
- `Adresse e-mail`
- `Numéro de téléphone`
- `URL du site`
- `URL de la brochure PDF`
- `URL d'un exemple de correction`
- `URL de prise de rendez-vous`
- `Adresse e-mail de test`
- `Mode test : Oui/Non`

Valeurs déjà prévues :

- Relance 1 : `5` jours ouvrés
- Relance 2 : `8` jours ouvrés après la première relance
- Maximum : `20` brouillons par traitement
- Mode test : `Oui`

Gardez `Mode test : Oui` tant que vous n'avez pas relu les brouillons.

## Données fictives d'exemple

L'initialisation ajoute quelques lignes fictives :

- `Entreprise Alpha Exemple`
- `Lycée Saint-Exemple`
- `Mairie de Ville-Exemple`

Les domaines utilisent `.invalid`, donc ils ne correspondent pas à de vrais destinataires.

## Importer une liste

Méthode simple :

1. Ouvrez l'onglet de catégorie souhaité, par exemple `CSE`.
2. Collez vos lignes directement sous les en-têtes.
3. Lancez `Prospection MDB > Vérifier les données`.

Méthode CSV :

1. Ouvrez l'onglet cible.
2. Lancez `Prospection MDB > Importer un CSV dans l'onglet actif`.
3. Collez le contenu CSV.
4. Validez.
5. Lancez `Vérifier les données`, puis `Détecter les doublons`.

Les colonnes du CSV doivent idéalement suivre l'ordre du CRM. Si certaines colonnes manquent, elles peuvent être complétées ensuite à la main.

## Utiliser des données publiques

Règles à respecter :

- utilisez uniquement des contacts professionnels publiquement accessibles ;
- conservez toujours l'URL de la source ;
- indiquez la date de collecte ;
- n'utilisez pas LinkedIn ;
- ne contournez aucune protection technique ;
- ne collectez pas d'adresses privées.

Pour une ligne disposant d'un site officiel :

1. Sélectionnez la ligne.
2. Lancez `Prospection MDB > Chercher des pistes sur le site officiel`.
3. Le script ajoute des pistes dans `Notes`.
4. Vérifiez manuellement chaque information avant de la recopier dans les colonnes utiles.

## Vérifier les données

Lancez `Prospection MDB > Vérifier les données`.

Le script :

- crée les ID manquants ;
- renseigne le type d'organisation ;
- normalise les téléphones français ;
- détecte les e-mails génériques ;
- signale les e-mails invalides ;
- signale l'URL de source manquante ;
- applique la liste d'exclusion ;
- complète un angle, une offre et une personnalisation neutre si nécessaire.

## Éviter les doublons

Lancez `Prospection MDB > Détecter les doublons`.

Le script signale :

- les doublons par e-mail ;
- les doublons par nom d'organisation et ville.

Les doublons sont marqués en jaune et une note est ajoutée. Le script ne supprime rien automatiquement.

## Calculer les scores

Lancez `Prospection MDB > Calculer les scores`.

Le score sur 100 tient compte notamment de :

- coordonnées complètes ;
- contact décisionnaire ;
- taille ou potentiel de bénéficiaires ;
- intérêt éducatif ou parentalité ;
- capacité de financement ;
- période d'examen ;
- élément de personnalisation.

La priorité devient automatiquement :

- `Haute` à partir de 70 ;
- `Moyenne` à partir de 40 ;
- `Basse` en dessous.

## Générer les messages

1. Dans un onglet de prospection, mettez les prospects validés au statut `Prêt à contacter`.
2. Vérifiez qu'une adresse e-mail est présente.
3. Lancez `Prospection MDB > Générer les messages`.

Le script remplit :

- `Objet généré`
- `Message généré`

Le prénom, l’organisation et la ville utilisent automatiquement une formulation neutre lorsqu’ils manquent. Les lignes optionnelles sans valeur (téléphone, site, brochure ou exemple de correction) sont retirées proprement. Si un modèle contient une variable inconnue ou un ancien marqueur à compléter, aucun brouillon Gmail n’est créé et une note explique le blocage.

## Créer les brouillons Gmail

1. Gardez `Mode test : Oui`.
2. Renseignez `Adresse e-mail de test`.
3. Lancez `Prospection MDB > Créer les brouillons Gmail`.
4. Ouvrez Gmail > Brouillons.
5. Relisez les messages.

Le script crée un brouillon seulement si :

- le statut est `Prêt à contacter` ;
- l'e-mail est syntaxiquement valide ;
- le prospect n'est pas dans `LISTE_EXCLUSION` ;
- `Ne plus contacter` n'est pas `Oui` ;
- aucun brouillon ou contact précédent n'est déjà indiqué.

Si vous supprimez un brouillon dans Gmail sans l'envoyer, le CRM le détecte au prochain lancement de `Créer les brouillons Gmail` ou lors de la synchronisation automatique. La ligne revient à `Prêt à contacter`, les indicateurs du brouillon sont remis à zéro et le message peut être recréé. Si le brouillon a réellement été envoyé, le CRM le classe au contraire comme `Envoyé` afin d'éviter tout doublon.

En mode test, le brouillon est adressé à l'adresse de test, avec le vrai destinataire indiqué dans l'objet.

## Préparer automatiquement 20 brouillons par jour

La commande `Prospection MDB > Activer la préparation quotidienne des brouillons` installe une préparation chaque matin. Le CRM choisit jusqu'à 20 contacts en rotation entre toutes les catégories et crée directement les brouillons, sans demander de cocher `Prêt à contacter`.

Tous les contacts disposant d'une adresse e-mail au format valide peuvent être retenus, sans vérification manuelle supplémentaire. Les contacts déjà approchés, exclus, sans adresse, déjà présents dans les brouillons ou déjà envoyés sont ignorés. Les lignes sans adresse restent disponibles pour une nouvelle recherche au lieu d'être supprimées automatiquement. Le CRM crée uniquement les brouillons : l'envoi reste toujours manuel.

La commande `Préparer maintenant 20 brouillons répartis` permet de lancer immédiatement la même sélection. La catégorie servie en premier change à chaque lancement afin que la répartition reste équitable dans le temps.

## Marquer un message comme envoyé

La création d'un brouillon ne démarre plus les dates de contact ou de relance. Vous pouvez donc préparer plusieurs jours de brouillons à l'avance.

Après l'envoi dans Gmail, lancez `Prospection MDB > Synchroniser les envois Gmail`. Le CRM recherche les messages réellement présents dans le dossier Envoyés, puis met à jour le statut et les dates. Pour automatiser cette vérification toutes les heures, lancez une seule fois `Prospection MDB > Activer la synchronisation automatique` et accordez les autorisations demandées.

La ligne entière devient verte lorsque le statut passe à `Envoyé`.

La commande manuelle reste disponible en secours :

Après envoi manuel dans Gmail :

1. Revenez dans le CRM.
2. Sélectionnez la ligne du prospect.
3. Lancez `Prospection MDB > Marquer la ligne active comme envoyée`.

Le script met à jour :

- `Statut = Envoyé`
- `Date du premier contact`
- `Date de la dernière action`
- `Date de prochaine relance`

## Préparer les relances

Lancez `Prospection MDB > Préparer les relances`.

Le script crée des brouillons de relance uniquement si :

- la date de relance est atteinte ;
- il n'y a pas de réponse reçue ;
- il n'y a pas de refus ;
- `Ne plus contacter` n'est pas `Oui` ;
- le prospect n'est pas dans la liste d'exclusion ;
- le nombre de relances est inférieur à 2.

La vue `RELANCES_DU_JOUR` liste les relances à traiter.

## Rechercher les réponses

Lancez `Prospection MDB > Rechercher les réponses`.

Le script cherche une réponse potentielle dans Gmail à partir :

- de l'adresse du prospect ;
- de l'objet généré ;
- du fil Gmail probable.

Il ne qualifie pas la réponse comme positive ou négative. Il indique seulement `Réponse reçue` et ajoute l'identifiant du fil en note. Vous qualifiez ensuite manuellement le résultat.

## Gérer une demande de désinscription

Si une personne demande à ne plus être contactée :

1. Sélectionnez sa ligne.
2. Lancez `Prospection MDB > Ajouter à la liste d'exclusion`.

Le script :

- ajoute l'e-mail dans `LISTE_EXCLUSION` ;
- met `Ne plus contacter = Oui` ;
- met le statut `Ne plus contacter`.

Aucune génération de brouillon ou relance ne sera faite pour cette adresse.

## Supprimer les données d'un contact

Si une personne demande la suppression de ses données :

1. Sélectionnez sa ligne.
2. Lancez `Prospection MDB > Supprimer les données de la ligne active`.
3. Confirmez.

Le script vide les données personnelles de la ligne, conserve une trace anonymisée et ajoute l'adresse à `LISTE_EXCLUSION` lorsqu'elle était présente.

## Tableau de bord

Lancez `Prospection MDB > Actualiser le tableau de bord`.

Le tableau de bord affiche :

- total prospects ;
- prospects par catégorie ;
- prospects à contacter ;
- brouillons créés ;
- messages envoyés ;
- réponses ;
- rendez-vous ;
- propositions envoyées ;
- partenariats signés ;
- taux de réponse ;
- taux de rendez-vous ;
- valeur potentielle du pipeline ;
- prochaines relances ;
- prospects prioritaires sans action.

Deux graphiques simples sont créés automatiquement.

## Exporter les prospects

Lancez `Prospection MDB > Exporter les prospects`.

Si `Dossier Drive destiné aux exports` contient un ID ou une URL de dossier Drive, le fichier CSV sera créé dans ce dossier. Sinon, il sera créé dans Mon Drive.

## Limites connues

- Le script ne vérifie pas l'existence réelle d'une boîte e-mail.
- Les réponses Gmail sont détectées de façon prudente, mais une validation humaine reste nécessaire.
- Les relances peuvent ne pas se rattacher au même fil si Gmail ne retrouve pas le fil de manière fiable.
- La recherche de pistes sur site officiel est volontairement limitée et doit être contrôlée manuellement.
- Aucun connecteur payant d'enrichissement ou de vérification d'e-mail n'est inclus.
- Les données publiques officielles doivent être importées via CSV ou via une fonction dédiée à chaque source.

## Améliorations possibles en phase 2

- Ajouter des imports dédiés depuis des jeux de données publics officiels.
- Ajouter une vraie colonne `ID fil Gmail`.
- Ajouter des filtres enregistrés avancés par segment.
- Créer un système de tags par campagne.
- Ajouter un export vers PDF ou Google Docs pour les propositions partenaires.
- Ajouter des statistiques par région, département et source.
- Ajouter une validation semi-automatique des domaines professionnels.
- Ajouter un connecteur optionnel de vérification d'e-mail, sans bloquer le MVP.

## Sécurité et conformité

Le système est conçu pour rester prudent :

- pas d'envoi automatique ;
- un brouillon par organisation ;
- pas de copie groupée ;
- liste d'exclusion globale ;
- phrase de désinscription par défaut ;
- journalisation des actions ;
- aucune clé API dans le code ;
- pas de collecte LinkedIn ;
- aucune donnée inventée.
