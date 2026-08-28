# Classeur HGGSP — ce qu'il reste à corriger

_Pour Maël. Écrit le 28 août 2026, après lecture automatique du classeur
« Guideline correction épreuve bac HGGSP V0_2 » par le CRM._

Le classeur est **lu correctement** : les deux exercices sont reconnus,
dissertation /10 et étude critique /10, total 20, et les 20 critères ressortent
avec leurs paliers. Rien n'est cassé. Ce qui suit, ce sont trois points de mise
en forme qui font que le CRM range ou compte les choses autrement que tu ne
l'as prévu.

---

## 1. Dans l'étude critique, les lettres ne veulent pas toutes dire la même chose

C'est le point le plus visible pour le professeur qui corrige.

Dans la **dissertation** (partie I), chaque lettre est un titre de famille, et
ce qui se note est toujours numéroté en dessous :

```
A. Compréhension et traitement du sujet          — /2      ← famille
   1. Analyse du sujet et problématique          — /1,5    ← ce qui se coche
   2. Réponse au sujet                           — /0,5    ← ce qui se coche
```

Dans l'**étude critique** (partie II), trois lettres suivent cette règle
(`B. Compréhension et analyse du/des document(s)`, `C. Regard critique`,
`F. Expression et présentation`) mais trois autres portent directement leurs
paliers, sans rien de numéroté en dessous :

```
A. Compréhension du sujet et problématisation    — /1,5    ← se coche directement
D. Mobilisation des connaissances personnelles   — /1,5    ← se coche directement
E. Organisation et maîtrise de l'exercice        — /1      ← se coche directement
```

**Ce que ça donne aujourd'hui.** Le CRM ne peut pas deviner qu'une lettre change
de rôle en cours de page. `D.` et `E.` arrivant juste après `C. Regard
critique`, il les range **à l'intérieur** de « Regard critique ». Le professeur
qui corrige voit donc « Mobilisation des connaissances personnelles » et
« Organisation et maîtrise de l'exercice » présentées comme des sous-parties du
regard critique — ce qu'elles ne sont pas. Les **points restent justes** (le
total fait bien 10), c'est le regroupement qui est faux, et il se retrouve tel
quel dans le dossier remis à l'élève.

**Le correctif.** Aligner la partie II sur la partie I : donner à `A.`, `D.` et
`E.` une ligne numérotée en dessous, qui porte les points et les paliers.
Exemple pour `D.` :

```
D. Mobilisation des connaissances personnelles   — /1,5
   1. Mobilisation des connaissances personnelles — /1,5
      0     Connaissances absentes ou hors sujet.
      0,5   Quelques connaissances mais peu exploitées.
      1     Connaissances pertinentes permettant d'éclairer ou de nuancer…
      1,5   Connaissances précises et bien choisies, utilisées pour…
```

La règle qui rend un classeur lisible sans ambiguïté : **une lettre chapeaute,
un numéro se coche.** Jamais les deux à la fois.

---

## 2. Un contresens ne peut pas valoir 0

C'est le point qui change réellement les notes, et il concerne **15 critères sur
20**.

Les paliers les plus bas sont écrits en fourchette :

```
0–0,5    Connaissances faibles, générales ou comportant des erreurs importantes.
0–0,25   Contexte absent ou erroné.
```

Le professeur coche **une case**, donc le CRM doit en retenir **un nombre** — et
il retient le haut de la fourchette. « Contexte absent ou erroné » vaut donc
0,25, pas 0. Il n'existe aucune façon de ne rien accorder sur ces critères.

**Ce que ça donne au total.** Une copie qui coche partout le palier le plus bas
obtient :

- **2,25 sur 10** en dissertation ;
- **2,75 sur 10** en étude critique ;
- soit **5 sur 20** au minimum absolu, quoi qu'écrive l'élève.

Personne n'a décidé ce plancher : c'est un effet de la fourchette. Il est
désormais annoncé noir sur blanc quand on relit le classeur (voir « Pour
vérifier après correction » en fin de note), pour que ça ne passe plus
inaperçu.

**Le correctif.** Une valeur par ligne, jamais de fourchette, et un vrai palier
`0` en bas de chaque critère. Cinq critères du classeur le font déjà
correctement (`1. Analyse du sujet et problématique`, `2. Réponse au sujet`,
`3. Exemples et illustrations`, et les deux `2. Lisibilité et présentation`) :
c'est exactement cette forme-là qu'il faut reprendre partout.

```
0        Contexte absent ou erroné.
0,25     Contexte présent mais superficiel.
0,75     Contexte pertinent permettant de mieux comprendre le document.
1        Contexte maîtrisé et utilisé pour expliquer la portée…
```

À noter : **les six autres classeurs ont le même souci** (12 critères sur 14 en
français, 23 sur 25 en philo, 17 sur 20 en SES). Autant le régler d'un coup, la
règle est la même partout.

---

## 3. La production graphique n'a pas de barème

Dans la dissertation, la ligne :

```
F. Production graphique facultative | Valorisation
```

annonce une valorisation mais **aucun nombre de points**. Le CRM ne peut ni la
compter, ni la faire cocher au professeur : elle est simplement ignorée, et le
croquis d'un élève ne lui rapporte rien.

**Le correctif**, au choix :

- lui donner une valeur explicite (`— /0,5`, avec ses paliers `0` et `0,5`), et
  ajuster le reste pour que le total reste à 10 ;
- ou l'écrire hors du tableau de barème, comme une consigne au correcteur, si
  la valorisation doit rester à son appréciation.

Aujourd'hui c'est le second cas qui s'applique de fait — mais sans que ce soit
écrit nulle part.

---

## Ce qui n'est PAS à corriger dans le classeur

- **Le bloc `F. Expression et présentation` de l'étude critique.** Le CRM ne le
  reconnaissait pas comme une famille (il ne savait lire les lettres que
  jusqu'à `E`) et rangeait ses deux critères sous `C.`, en écrasant deux
  critères existants. **Corrigé côté CRM le 28 août** — rien à faire dans le
  classeur.
- **L'échelle de notation.** Le classeur note chaque exercice sur 10 ; la grille
  installée dans le pipeline notait jusqu'ici sur 20 avant de convertir en 10,
  ce qui permettait des demi-points là où le classeur descend au quart de point.
  C'est une décision de Cindy, pas un défaut du classeur.

---

## Pour vérifier après correction

Une fois le classeur repris, exporter la page en CSV et la relire avec la
commande de relecture (Cindy peut la lancer, elle n'écrit rien, elle affiche
seulement ce que le CRM comprend) :

```bash
node --import tsx scripts/importer-guideline.mjs --csv <le-fichier.csv>
```

Elle liste les familles, les critères, les paliers, et toutes les remarques
ci-dessus si elles subsistent. Les trois points sont réglés quand :

1. dans l'étude critique, plus aucun critère n'apparaît sous une famille à
   laquelle il n'appartient pas ;
2. la remarque « … n'ont aucun palier à 0 … obtient 5 sur 20 » a disparu ;
3. la production graphique est soit chiffrée, soit sortie du tableau.
