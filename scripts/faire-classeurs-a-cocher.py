#!/usr/bin/env python3
"""
Reconstruit les classeurs de correction de FRANÇAIS, PHILOSOPHIE et MATHS
SPÉCIALITÉ dans la mise en forme « élèves en colonnes » que le CRM lit
(celle de SES, des maths de première et d'HGGSP V1).

Les classeurs V0 sont des barèmes seuls : le professeur a les critères sous
les yeux mais nulle part où cocher ses copies. On ajoute la zone de correction
(un nom, une colonne « niveau ? » et une colonne « commentaire » par élève).

Le barème n'est pas réécrit : chaque critère, chaque point et chaque
descripteur est repris tel quel des exports V0 (scripts/fixtures/guidelines).
Deux choses de FORME changent, les mêmes que pour HGGSP :

  1. un bloc (lettre) qui porte ses paliers directement reçoit un
     sous-critère numéroté, comme partout ailleurs ;
  2. les paliers écrits en fourchette (« 0–0,5 ») deviennent deux lignes :
     un vrai 0, puis la valeur haute avec le descripteur d'origine. Sans ça
     aucun critère ne peut valoir 0 et une copie faible bute sur un plancher.

    python3 scripts/faire-classeurs-a-cocher.py <dossier de sortie>
"""

import csv
import io
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ICI = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(ICI, 'fixtures', 'guidelines')
NB_ELEVES = 12

RE_PTS = re.compile(r'^[—–-]?\s*/\s*(\d+(?:[,.]\d+)?)\s*$')
RE_LETTRE = re.compile(r'^([A-Z])[.)]\s+(.{3,})$', re.S)
RE_NUM = re.compile(r'^(\d+)\.\s+(.+)$', re.S)
RE_VAL = re.compile(r'^(\d+(?:[,.]\d+)?)$')
RE_PLAGE = re.compile(r'^(\d+(?:[,.]\d+)?)\s*[–—-]\s*(\d+(?:[,.]\d+)?)$')
RE_PARTIE = re.compile(r'^PARTIE\s+[IVX]+\b', re.I)

DESCRIPTEUR_ZERO = "Rien d'exploitable sur ce critère."

# Ce qui, dans un export V0, n'est plus le barème : on s'arrête de lire les
# critères. Les lignes « ⚠️ » et les puces qui suivent deviennent des notes.
RE_FIN = re.compile(
    r'^(BARÈME SYNTHÉTIQUE|Vérification du barème|Questions à prise d.initiative|💡)',
    re.I,
)

CLASSEURS = [
    {
        'fichier': 'Guideline correction français V1.xlsx',
        'feuille': 'Correction français',
        'titre': 'BARÈME DE CORRECTION — ÉPREUVE ANTICIPÉE DE FRANÇAIS — VOIE GÉNÉRALE',
        'intro': "Grille analytique construite à partir des attendus officiels des EAF. "
                 "Le candidat choisit le commentaire OU la dissertation : cocher seulement "
                 "la partie qu'il a traitée, l'autre est ignorée dans sa note. La notation "
                 "officielle est globale sur 20 : les sous-critères servent à homogénéiser "
                 "la correction entre correcteurs.",
        # Le français est livré en deux pages : chacune devient une partie.
        'sources': [
            ('francais-commentaire.csv', 'PARTIE I — COMMENTAIRE', '20 points'),
            ('francais-dissertation.csv', 'PARTIE II — DISSERTATION', '20 points'),
        ],
        'notes_source': 'francais-bareme-general.csv',
    },
    {
        'fichier': 'Guideline correction philo V1.xlsx',
        'feuille': 'Correction philosophie',
        'titre': 'BARÈME DE CORRECTION — PHILOSOPHIE TERMINALE — BACCALAURÉAT',
        'intro': "Grille analytique construite à partir des attendus officiels de l'épreuve "
                 "de philosophie. Le candidat choisit une dissertation OU l'explication de "
                 "texte : cocher seulement la partie qu'il a traitée, l'autre est ignorée "
                 "dans sa note. La notation officielle est globale sur 20.",
        'sources': [('philo.csv', None, None)],
    },
    {
        'fichier': 'Guideline correction spé maths V1.xlsx',
        'feuille': 'Correction maths',
        'titre': 'BARÈME DE CORRECTION — SPÉCIALITÉ MATHÉMATIQUES — TERMINALE',
        'intro': "Grille par compétences, construite à partir du cadrage officiel de "
                 "l'épreuve. Elle dit COMMENT juger la copie dans son ensemble ; le barème "
                 "du sujet (points par question) reste dans l'espace Direction. La notation "
                 "officielle est globale sur 20.",
        'sources': [('maths-specialite.csv', None, None)],
        # « EXERCICES : COMPÉTENCES MATHÉMATIQUES — /20 » tient lieu de partie.
        'partie_implicite': (re.compile(r'^EXERCICES\s*:', re.I),
                             'PARTIE I — COMPÉTENCES MATHÉMATIQUES'),
    },
]


# --------------------------------------------------------------------------
#  Lecture d'un export V0
# --------------------------------------------------------------------------

def normaliser_ligne(cells):
    """Deux mises en page coexistent : palier en colonne A (philo, HGGSP) ou
    en colonne B après une colonne A vide (français, maths). On ramène la
    seconde à la première."""
    if len(cells) > 1 and not cells[0] and (RE_VAL.match(cells[1]) or RE_PLAGE.match(cells[1])):
        return cells[1:]
    return cells


def lire_source(nom, partie_forcee, points_forces, config, notes_bas):
    chemin = os.path.join(FIXTURES, nom)
    rows = [[(c or '').strip() for c in r] for r in csv.reader(io.open(chemin, encoding='utf8'))]

    parties = []
    partie = famille = critere = None
    fini = False

    if partie_forcee:
        partie = {'titre': partie_forcee, 'points': points_forces, 'familles': []}
        parties.append(partie)

    implicite = config.get('partie_implicite')

    for brut in rows:
        cells = normaliser_ligne(brut)
        pleines = [c for c in cells if c]
        if not pleines:
            continue
        tete = cells[0]
        points = next((c for c in cells[1:] if RE_PTS.match(c)), None)
        second = next((c for c in cells[1:] if c and not RE_PTS.match(c)), '')

        if RE_FIN.match(tete):
            fini = True
            if not tete.upper().startswith(('BARÈME SYNTHÉTIQUE', 'VÉRIFICATION')):
                notes_bas.append(tete)
            continue
        if fini:
            if tete.startswith(('⚠️', '•')) or tete.upper().startswith('IMPORTANT'):
                notes_bas.append(tete)
            continue

        if RE_PARTIE.match(tete):
            partie = {'titre': tete, 'points': points or second, 'familles': []}
            parties.append(partie)
            famille = critere = None
            continue
        if implicite and implicite[0].match(tete):
            partie = {'titre': implicite[1], 'points': points or second, 'familles': []}
            parties.append(partie)
            famille = critere = None
            continue

        if partie is None:
            continue

        m = RE_LETTRE.match(tete)
        if m and points:
            famille = {'lettre': m.group(1), 'titre': tete, 'points': points, 'criteres': []}
            partie['familles'].append(famille)
            critere = None
            continue

        if RE_NUM.match(tete) and points:
            if famille is None:
                # Les maths numérotent leurs compétences sans lettre au-dessus.
                famille = {'lettre': None, 'titre': None, 'points': None, 'criteres': []}
                partie['familles'].append(famille)
            critere = {'titre': tete, 'points': points, 'paliers': []}
            famille['criteres'].append(critere)
            continue

        if (RE_VAL.match(tete) or RE_PLAGE.match(tete)) and second:
            cible = critere
            if cible is None and famille is not None:
                cible = {'titre': None, 'points': famille['points'], 'paliers': []}
                famille['criteres'].append(cible)
                critere = cible
            if cible is not None:
                cible['paliers'].append({'valeur': tete, 'texte': second})
            continue

    return parties


def lire_notes(nom, notes_bas):
    chemin = os.path.join(FIXTURES, nom)
    for r in csv.reader(io.open(chemin, encoding='utf8')):
        tete = (r[0] if r else '').strip()
        if tete.startswith('⚠️') or tete.upper().startswith('IMPORTANT'):
            notes_bas.append(tete)


# --------------------------------------------------------------------------
#  Les corrections de forme
# --------------------------------------------------------------------------

def num(txt):
    return float(txt.replace(',', '.'))


def corriger(parties):
    ajouts_zero = 0
    sous_criteres_crees = []
    for partie in parties:
        for famille in partie['familles']:
            for critere in famille['criteres']:
                if critere['titre'] is None:
                    intitule = RE_LETTRE.match(famille['titre']).group(2)
                    critere['titre'] = f'1. {intitule}'
                    sous_criteres_crees.append(famille['titre'])

                paliers = []
                for p in critere['paliers']:
                    plage = RE_PLAGE.match(p['valeur'])
                    if not plage:
                        paliers.append(p)
                        continue
                    bas, haut = plage.group(1), plage.group(2)
                    if num(bas) == 0:
                        paliers.append({'valeur': '0', 'texte': DESCRIPTEUR_ZERO, 'ajoute': True})
                        ajouts_zero += 1
                    paliers.append({'valeur': haut, 'texte': p['texte']})
                if paliers and not any(num(p['valeur']) == 0 for p in paliers):
                    paliers.insert(0, {'valeur': '0', 'texte': DESCRIPTEUR_ZERO, 'ajoute': True})
                    ajouts_zero += 1
                critere['paliers'] = paliers
    return ajouts_zero, sous_criteres_crees


def points_de(txt):
    return num(RE_PTS.match(txt).group(1))


def points_partie(partie):
    return sum(points_de(c['points']) for f in partie['familles'] for c in f['criteres'])


# --------------------------------------------------------------------------
#  Écriture du classeur (même mise en page qu'HGGSP V1)
# --------------------------------------------------------------------------

POLICE = 'Arial'
GRIS = PatternFill('solid', fgColor='EFEFEF')
BLEU = PatternFill('solid', fgColor='D9E2F3')
JAUNE = PatternFill('solid', fgColor='FFF2CC')
VERT = PatternFill('solid', fgColor='E2EFDA')
FIN = Side(style='thin', color='BFBFBF')
CADRE = Border(left=FIN, right=FIN, top=FIN, bottom=FIN)

COL_POINTS = 5
COL_ELEVE1 = 7


def ecrire(config, parties, notes_bas, ajouts_zero, sous_criteres_crees, sortie):
    wb = Workbook()
    ws = wb.active
    ws.title = config['feuille']

    def put(ligne, col, valeur, **kw):
        c = ws.cell(row=ligne, column=col, value=valeur)
        c.font = Font(name=POLICE, **kw)
        return c

    lignes_criteres = []

    # --- en-tête, dans les 40 premières lignes : le CRM y cherche les élèves --
    put(1, 1, 'NE PAS TOUCHER — cette page est lue automatiquement par le CRM',
        bold=True, color='C00000')
    put(1, COL_ELEVE1, 'Élèves', bold=True)
    put(2, 1, config['titre'], bold=True, size=13)
    put(3, 1, config['intro'], size=9, italic=True)
    ws.row_dimensions[3].height = 52
    ws['A3'].alignment = Alignment(wrap_text=True, vertical='top')

    for i in range(NB_ELEVES):
        col = COL_ELEVE1 + i * 2
        put(2, col, f'Élève {i + 1}', bold=True).fill = JAUNE
        put(3, col, 'niveau ?', bold=True).fill = BLEU
        put(3, col + 1, 'commentaire\n(optionnel)', bold=True, size=9).fill = BLEU
        ws.cell(row=3, column=col + 1).alignment = Alignment(wrap_text=True, vertical='center')

    put(4, 1, 'Mode d’emploi', bold=True)
    put(4, 2,
        'Remplacer « Élève 1 », « Élève 2 »… en ligne 2 par le prénom et le nom de '
        'chaque élève, puis cocher UNE case « niveau ? » par critère — celle du palier '
        'atteint. Une colonne restée « Élève N » sans case cochée est ignorée à l’import. '
        'Le commentaire est facultatif. Ne rien écrire dans les colonnes A à E : '
        'c’est le barème.',
        size=9, italic=True)
    ws['B4'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.row_dimensions[4].height = 40

    ligne = 6
    for partie in parties:
        put(ligne, 1, partie['titre'], bold=True, size=12).fill = GRIS
        put(ligne, COL_POINTS, partie['points'], bold=True).fill = GRIS
        for col in range(2, COL_POINTS + 1):
            ws.cell(row=ligne, column=col).fill = GRIS
        ligne += 2

        for famille in partie['familles']:
            if famille['titre']:
                put(ligne, 1, famille['titre'], bold=True).fill = VERT
                put(ligne, COL_POINTS, famille['points'], bold=True).fill = VERT
                for col in range(2, COL_POINTS + 1):
                    ws.cell(row=ligne, column=col).fill = VERT
                ligne += 1

            for critere in famille['criteres']:
                put(ligne, 1, critere['titre'], bold=True)
                put(ligne, COL_POINTS, critere['points'], bold=True)
                lignes_criteres.append((ligne, critere['titre'], partie['titre']))
                ligne += 1

                put(ligne, 1, 'Niveau', bold=True, size=9)
                put(ligne, 2, 'Attendu', bold=True, size=9)
                ligne += 1

                for palier in critere['paliers']:
                    put(ligne, 1, palier['valeur'])
                    put(ligne, 2, palier['texte'],
                        italic=bool(palier.get('ajoute')),
                        color='808080' if palier.get('ajoute') else '000000')
                    ws.cell(row=ligne, column=2).alignment = Alignment(wrap_text=True,
                                                                       vertical='top')
                    for i in range(NB_ELEVES):
                        c = ws.cell(row=ligne, column=COL_ELEVE1 + i * 2, value=False)
                        c.border = CADRE
                        c.alignment = Alignment(horizontal='center')
                    ligne += 1
                ligne += 1
        ligne += 1

    if notes_bas:
        put(ligne, 1, 'NOTES AU CORRECTEUR — hors barème', bold=True).fill = GRIS
        ligne += 1
        for note in notes_bas:
            put(ligne, 1, note, size=9, italic=True)
            ws.cell(row=ligne, column=1).alignment = Alignment(wrap_text=True, vertical='top')
            ligne += 1
        ligne += 1

    put(ligne, 1, 'CE QUI A CHANGÉ PAR RAPPORT À LA V0 (forme seulement)', bold=True)
    ligne += 1
    changements = [
        "Aucun point n'a été modifié : chaque critère garde exactement son barème.",
        "La zone de correction (nom de l'élève, « niveau ? », commentaire) a été ajoutée : "
        "la V0 était un barème seul, sans rien à cocher.",
        f"{ajouts_zero} paliers écrits en fourchette (« 0–0,5 ») ont été ouverts en deux "
        "lignes : un vrai 0, puis la valeur haute avec son descripteur d'origine. Sans cela "
        "aucun critère ne pouvait valoir 0. Les descripteurs de niveau 0 sont en gris : à relire.",
    ]
    if sous_criteres_crees:
        changements.append(
            f"{len(sous_criteres_crees)} bloc(s) portaient leurs paliers directement "
            f"({', '.join(t.split('.')[0] for t in sous_criteres_crees)}) : ils ont reçu un "
            "sous-critère numéroté, sinon le CRM les rangeait sous le bloc précédent.")
    if len(config['sources']) > 1:
        changements.append(
            "Les pages séparées de la V0 sont réunies sur une seule page, une partie par "
            "exercice : le professeur n'a qu'un fichier à exporter.")
    for texte in changements:
        put(ligne, 1, texte, size=9, italic=True)
        ws.cell(row=ligne, column=1).alignment = Alignment(wrap_text=True, vertical='top')
        ligne += 1

    ws.column_dimensions['A'].width = 46
    ws.column_dimensions['B'].width = 88
    ws.column_dimensions['C'].width = 3
    ws.column_dimensions['D'].width = 3
    ws.column_dimensions['E'].width = 11
    ws.column_dimensions['F'].width = 3
    for i in range(NB_ELEVES):
        ws.column_dimensions[get_column_letter(COL_ELEVE1 + i * 2)].width = 11
        ws.column_dimensions[get_column_letter(COL_ELEVE1 + i * 2 + 1)].width = 30
    ws.freeze_panes = 'C4'

    # --- vérification du barème, avec de vraies formules --------------------
    v = wb.create_sheet('Vérification du barème')

    def vput(l, c, valeur, **kw):
        cell = v.cell(row=l, column=c, value=valeur)
        cell.font = Font(name=POLICE, **kw)
        return cell

    feuille = config['feuille']
    vput(1, 1, 'VÉRIFICATION DU BARÈME', bold=True, size=12)
    vput(2, 1, f"Les points sont lus dans la page « {feuille} » : si un barème y change, "
               "les totaux ci-dessous suivent.", size=9, italic=True)
    for col, titre in enumerate(['Partie', 'Critère', 'Points'], start=1):
        vput(4, col, titre, bold=True).fill = BLEU

    l = 5
    premiere = l
    for ligne_src, titre, partie in lignes_criteres:
        vput(l, 1, partie, size=9)
        vput(l, 2, titre, size=9)
        ref = f"'{feuille}'!${get_column_letter(COL_POINTS)}${ligne_src}"
        brut = f'MID({ref},FIND("/",{ref})+1,20)'
        vput(l, 3, f'=IFERROR(VALUE({brut}),IFERROR(VALUE(SUBSTITUTE({brut},",",".")),0))',
             size=9).number_format = '0.00'
        l += 1
    derniere = l - 1

    l += 1
    for partie in parties:
        vput(l, 2, f"Total — {partie['titre']}", bold=True)
        total = vput(l, 3, f'=SUMIF(A{premiere}:A{derniere},"{partie["titre"]}",'
                           f'C{premiere}:C{derniere})', bold=True)
        total.number_format = '0.00'
        total.fill = JAUNE
        vput(l, 4, 'attendu : 20', size=9, italic=True)
        l += 1

    v.column_dimensions['A'].width = 40
    v.column_dimensions['B'].width = 60
    v.column_dimensions['C'].width = 10
    v.column_dimensions['D'].width = 14

    wb.save(sortie)
    return len(lignes_criteres)


def construire(config, dossier):
    notes_bas = []
    parties = []
    for nom, partie, points in config['sources']:
        parties += lire_source(nom, partie, points, config, notes_bas)
    if config.get('notes_source'):
        lire_notes(config['notes_source'], notes_bas)
    ajouts, crees = corriger(parties)
    sortie = os.path.join(dossier, config['fichier'])
    nb = ecrire(config, parties, notes_bas, ajouts, crees, sortie)
    print(f"{config['fichier']} : {nb} critères, {ajouts} paliers 0 ajoutés, "
          f"{len(crees)} sous-critères créés")
    for p in parties:
        print(f"  {p['titre']} -> {points_partie(p)}")
    return parties


if __name__ == '__main__':
    dossier = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(dossier, exist_ok=True)
    for config in CLASSEURS:
        construire(config, dossier)
