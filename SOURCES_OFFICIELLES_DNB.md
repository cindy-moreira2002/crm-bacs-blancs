# Sources officielles du DNB — traçabilité réglementaire

Chaque règle appliquée par les deux moteurs du brevet est adossée à une source
identifiée. Ce fichier en est la trace lisible ; la même information est en base
dans `sources_officielles` et `brevet_regles_officielles`, et dans le code dans
`scripts/brevet/referentiels.mjs` et `supabase/functions/_shared/brevet-noyau.ts`.

**Trois statuts, jamais confondus.**

| Statut | Ce que cela veut dire | Effet sur la note |
|---|---|---|
| `officiel` | écrit tel quel dans un texte officiel, avec la citation | appliqué |
| `officiel_par_deduction` | se déduit mécaniquement du texte, et on le dit | appliqué, en le signalant |
| `complementaire` | source sérieuse mais non réglementaire | jamais seul |
| `a_confirmer` | non vérifié sur la source primaire | **aucun** |

---

## 1. Sources consultées

### S1 — Note de service NOR MENE2515977N *(source primaire)*

| | |
|---|---|
| **Titre** | Modalités d'attribution du diplôme national du brevet à compter de la session 2026 |
| **Organisme** | Ministère de l'Éducation nationale — Bulletin officiel n° 33 |
| **URL** | https://www.education.gouv.fr/bo/2025/Hebdo33/MENE2515977N |
| **Publication** | note de service du 2 septembre 2025, BO du 4 septembre 2025 |
| **Consultée le** | 8 août 2026 |
| **Session** | à compter de 2026 |
| **Statut** | **officiel** |

C'est de ce texte que viennent **toutes** les valeurs chiffrées des deux
épreuves. Il a été lu intégralement (6 pages).

### S2 — Liste indicative d'automatismes

| | |
|---|---|
| **Titre** | Liste indicative d'automatismes susceptibles d'être mobilisés lors de l'épreuve écrite de mathématiques (séries générale et professionnelle) |
| **Organisme** | Ministère de l'Éducation nationale |
| **URL** | https://www.education.gouv.fr/sites/default/files/2025-10/dnb-2026-liste-indicative-d-automatismes-susceptibles-d-tre-mobilis-s-lors-de-l-preuve-crite-de-math-matiques-s-ries-g-n-rale-et-professionnelle--442401.pdf |
| **Publication** | octobre 2025 |
| **Consultée le** | 8 août 2026 |
| **Statut** | **officiel** |

Les cinq thèmes de `brevet_automatismes.theme` sont les intitulés exacts de ce
document : *Nombres et calculs*, *Espace et géométrie*, *Organisation et gestion
de données et probabilités*, *Proportionnalité, fonctions*, *Algorithmique et
programmation*.

### S3 — Sujets zéro officiels de la session 2026, série générale

| | |
|---|---|
| **Titre** | Sujets zéro du DNB session 2026 : français (grammaire et compréhension `26GENFRQGCME1`, dictée `26GENFRDME1`, rédaction `26GENFRRME1`) et mathématiques (sujets A et B) |
| **Organisme** | Ministère de l'Éducation nationale — Éduscol |
| **URL** | https://eduscol.education.gouv.fr/5607/les-epreuves-du-dnb |
| **Publication** | 5 décembre 2025 |
| **Consultée le** | **9 août 2026** — PDF fournis à la main (la page bloque la lecture automatique) |
| **Statut** | **officiel** |

Lus intégralement. Ils **attestent la structure réelle** d'un sujet, que la note
de service ne détaille pas :

- **français** : « I. Compréhension et compétences d'interprétation **(32 points)** »
  et « II. Grammaire et compétences linguistiques **(18 points)** », dont la
  **réécriture à 10 points** (question 10) → 32 + 18 = 50 ; dictée 10 ;
  rédaction 40 → **100** ;
- **mathématiques** : **9 items** d'automatismes pour 6 points, et des exercices
  de partie 2 totalisant **12 points** — 3+3+3+3 pour le sujet A, 3+2+4,5+2,5
  pour le sujet B — les 2 points de rédaction complétant les **14** annoncés.

Les deux sujets sont publiés **sans corrigé**.

### S4 — Programmes de cycle 4, arrêté du 18 février 2026

| | |
|---|---|
| **URL** | https://www.education.gouv.fr/bo/2026/Hebdo10/MENE2602912A |
| **Statut** | **à confirmer** |

Le calendrier d'entrée en vigueur (5ᵉ à la rentrée 2026, 4ᵉ en 2027, 3ᵉ en 2028)
n'a **pas** pu être vérifié sur la source primaire : la page renvoie HTTP 403.
Tant qu'il ne l'est pas, **le dispositif ne s'appuie sur aucune de ses
dispositions**. Si le calendrier se confirme, la classe de troisième de la
session 2027 relève encore du programme de cycle 4 actuel — c'est ce que le
dispositif suppose aujourd'hui, sans l'affirmer.

---

## 2. Les règles appliquées, une par une

### Français — épreuve écrite (coefficient 2)

| Règle | Valeur | Statut | Citation |
|---|---|---|---|
| Durée | 3 heures | officiel | « Durée de l'épreuve : 3 heures » |
| Barème total | **100 points, ramenés sur 20** | officiel | « Les exercices sont assortis d'un barème totalisant 100 points, indiqué dans le sujet. La note obtenue est ensuite ramenée sur 20 pour le calcul de la moyenne. » |
| Travail sur le texte (et éventuellement une image) | **50 points**, 1 h 10 | officiel | « Travail sur le texte littéraire et, éventuellement, sur une image (50 points – 1 heure et 10 minutes) » |
| Dictée | **10 points**, 20 min | officiel | « Dictée (10 points – 20 minutes) » |
| Longueur de la dictée, série générale | ~600 signes | officiel | « Un texte de 600 signes environ, en lien avec l'œuvre, est dicté aux candidats de la série générale. » |
| Rédaction | **40 points**, 1 h 30 | officiel | « Rédaction (40 points – 1 heure et 30 minutes) » |
| Deux sujets au choix | réflexion / imagination | officiel | « Deux sujets au choix sont proposés aux candidats : un sujet de réflexion et un sujet d'imagination. » |
| Réécriture | 5 ou 10 formes, **barème spécifique** aux erreurs de pure copie | officiel | « …de manière à obtenir cinq ou dix formes modifiées dans la copie de l'élève. Les erreurs de pure copie ne portant pas sur les formes à modifier sont prises en compte dans l'évaluation selon un barème spécifique. » |
| Dictionnaire | autorisé pour la rédaction | officiel | « Les candidats ont le droit, pour cette partie d'épreuve, de consulter un dictionnaire de langue française ou un dictionnaire bilingue. » |

**Ce que le texte officiel ne dit PAS**, et que le dispositif n'invente donc pas :

- **aucun barème national de retrait pour la dictée.** Le nombre de points par
  faute, les plafonds, le traitement des répétitions : rien de tout cela n'est
  fixé nationalement. Conséquence directe dans le code : sans règles saisies
  pour le sujet, `evaluerDictee()` renvoie `score: null` et la copie part en
  validation humaine. Le moteur **refuse de noter** plutôt que d'appliquer un
  barème inventé ;
- **aucune grille nationale de rédaction.** Les deux grilles viennent du sujet.
  À défaut, la grille par défaut est appliquée, marquée `default_rubric`, et la
  correction part en validation humaine ;
- **aucune valeur chiffrée pour le « barème spécifique » des erreurs de copie**
  en réécriture. Sans valeur saisie, aucune pénalité n'est appliquée.

### Mathématiques — épreuve écrite (coefficient 2)

| Règle | Valeur | Statut | Citation |
|---|---|---|---|
| Durée | 2 heures | officiel | « Durée de l'épreuve : 2 heures » |
| Note | sur 20 | officiel | « L'épreuve est notée sur 20. » |
| Partie 1 — Automatismes | **6 points**, 20 min | officiel | « Partie 1 – Automatismes : 6 points – 20 minutes » |
| Partie 2 — Raisonnement et résolution de problèmes | **14 points**, 1 h 40 | officiel | « Partie 2 – Raisonnement et résolution de problèmes : 14 points – 1 heure et 40 minutes. » |
| Qualité de la rédaction | **2 points** | officiel | « L'évaluation doit prendre en compte la clarté et la précision des raisonnements ainsi que, plus largement, la qualité de la rédaction qui sera évaluée sur 2 points. » |
| Ces 2 points sont **compris** dans les 14 | inclusion | **officiel par déduction, corroboré** | La phrase figure dans la partie 2, et le total de l'épreuve vaut 20 pour 6 + 14 : les 2 points ne peuvent pas s'ajouter au-dessus des 14. **Corroboré par les deux sujets zéro** (S3), dont les exercices de partie 2 s'arrêtent à 12 points. `brevet_verifier()` refuse le barème qui les ajouterait (code `redaction_ajoutee_au_dessus`). |
| Calculatrice | **partie 2 seulement** | officiel | « La calculatrice n'est autorisée que sur la partie 2. » |
| Brouillon | autorisé partout | officiel | « Le brouillon est autorisé sur l'ensemble de l'épreuve. » |
| Essais et démarches non aboutis | **à prendre en compte** | officiel | « Doivent être pris en compte les essais et les démarches engagées, même non abouties. » |
| Justification | sauf indication contraire du sujet | officiel | « Le sujet précise que toutes les réponses doivent être justifiées sauf si une indication contraire est donnée. » |
| Exercices indépendants | oui | officiel | « Le sujet est constitué d'exercices qui doivent pouvoir être traités par le candidat indépendamment les uns des autres. » |
| Compétences | chercher, modéliser, représenter, raisonner, calculer, communiquer | officiel | « les candidats sont amenés à mobiliser les compétences chercher, modéliser, représenter, raisonner, calculer et communiquer. » |

### Structure attestée par les sujets zéro *(complémentaire — propre au sujet, pas au règlement)*

| Règle | Valeur | Statut | Source |
|---|---|---|---|
| Sous-parties du bloc de 50 points | compréhension **32** + grammaire **18** | complémentaire | S3 |
| Poids de la réécriture | **10 points** sur les 18 de grammaire | complémentaire | S3 |
| Nombre d'items d'automatismes | **9 questions** pour 6 points | complémentaire | S3 |

Ces trois valeurs sont **propres au sujet**, pas au règlement : la note de
service ne les fixe pas. Le moteur les accepte donc sans les imposer — il
vérifie seulement que les sous-parties **totalisent** les 50 points.

### Commun

| Règle | Valeur | Statut | Citation |
|---|---|---|---|
| Programme de référence à partir de 2027 | **programme de la classe de troisième** | officiel | « …déclinées par le programme de français de cycle 4 (ou de troisième à partir de la session 2027) » |
| Série couverte | générale | officiel | La note de service distingue série générale et série professionnelle. **Ce dispositif ne couvre que la série générale.** |
| Calendrier des nouveaux programmes de cycle 4 | — | **à confirmer** | Source primaire inaccessible (HTTP 403). Aucun effet sur la note. |

---

## 3. Procédure de mise à jour réglementaire

Quand un texte plus récent contredit ce qui précède :

1. **Ajouter la source** dans `SOURCES_OFFICIELLES` (`scripts/brevet/referentiels.mjs`)
   avec son URL exacte, sa date de publication et sa date de consultation.
2. **Modifier ou ajouter la règle** dans `REGLES_OFFICIELLES`, avec la citation
   exacte du nouveau texte et le statut qui convient. **Ne pas supprimer
   l'ancienne** : la faire passer en `complementaire` avec sa session, pour que
   les corrections déjà rendues restent explicables.
3. **Répercuter dans le noyau** : `REGLES_OFFICIELLES_DNB`
   (`supabase/functions/_shared/brevet-noyau.ts`) et, si la valeur change, les
   constantes de `brevet-francais-noyau.ts` / `brevet-maths-noyau.ts`.
4. **Adapter `brevet_verifier()`** (`supabase/sql/42_brevet_socle.sql`) si un
   total change.
5. `npm run test:brevet` — les tests de totaux échoueront si une valeur a bougé
   sans que le contrôle suive. C'est voulu.
6. `node scripts/seed-brevet.mjs --sql supabase/sql/4X_...sql --apply`.
7. Incrémenter `VERSION_REFERENTIELS` et `VERSION_PROMPT_BREVET`. Les barèmes
   déjà verrouillés gardent leur version : rien n'est réécrit rétroactivement.

**Règle absolue** : une information non vérifiée sur sa source primaire entre en
`a_confirmer` et n'a aucun effet sur la note. Une hypothèse n'est jamais
présentée comme une règle officielle.

---

*Dernière vérification documentaire : 9 août 2026 (ajout des sujets zéro officiels).*
