#!/usr/bin/env python3
"""
Reconstruit le classeur HGGSP dans la mise en forme que le CRM lit sans erreur
(celle de SES et des maths de première).

Le barème n'est pas réécrit : chaque critère, chaque point et chaque descripteur
est repris tel quel du classeur V0_2. Seules trois choses de FORME changent :

  1. dans l'étude critique, les lettres A, D et E portaient directement leurs
     paliers alors que B, C et F chapeautaient des sous-critères numérotés. On
     leur donne un sous-critère numéroté, comme partout ailleurs ;
  2. les paliers écrits en fourchette (« 0–0,5 ») deviennent deux lignes : un
     vrai 0, puis la valeur haute avec le descripteur d'origine ;
  3. « F. Production graphique facultative | Valorisation », qui n'a aucun
     point, sort du tableau de barème et devient une note au correcteur.

Et on ajoute la zone de correction (trois élèves, « niveau ? » + commentaire),
que le classeur V0_2 n'avait pas — 12 élèves, comme les autres matières.
"""

import csv
import io
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

SOURCE = '/Users/cindymoreira/crm-bacs-blancs/scripts/fixtures/guidelines/hggsp-v0-2.csv'
SORTIE = sys.argv[1] if len(sys.argv) > 1 else 'HGGSP.xlsx'
NB_ELEVES = 12

RE_PTS = re.compile(r'^[—–-]?\s*/\s*(\d+(?:[,.]\d+)?)\s*$')
RE_LETTRE = re.compile(r'^([A-Z])[.)]\s+(.{3,})$')
RE_NUM = re.compile(r'^(\d+)\.\s+(.+)$')
RE_VAL = re.compile(r'^(\d+(?:[,.]\d+)?)$')
RE_PLAGE = re.compile(r'^(\d+(?:[,.]\d+)?)\s*[–—-]\s*(\d+(?:[,.]\d+)?)$')
RE_PARTIE = re.compile(r'^PARTIE\s+[IVX]+\b', re.I)

DESCRIPTEUR_ZERO = "Rien d'exploitable sur ce critère."


# --------------------------------------------------------------------------
#  Lecture du classeur d'origine
# --------------------------------------------------------------------------

def lire_source():
    """parties -> familles -> critères -> paliers, tels qu'écrits aujourd'hui."""
    rows = [[(c or '').strip() for c in r] for r in csv.reader(io.open(SOURCE, encoding='utf8'))]

    parties, notes_bas = [], []
    partie = famille = critere = None
    dans_synthese = False

    for cells in rows:
        pleines = [c for c in cells if c]
        if not pleines:
            continue
        tete = cells[0]
        points = next((c for c in cells[1:] if RE_PTS.match(c)), None)
        second = next((c for c in cells[1:] if c and not RE_PTS.match(c)), '')

        # Le barème synthétique de fin de page ne fait pas partie de la grille.
        if tete.upper().startswith('BARÈME SYNTHÉTIQUE'):
            dans_synthese = True
            continue
        if dans_synthese:
            if tete.startswith('⚠️') or tete.upper().startswith('IMPORTANT'):
                notes_bas.append(' — '.join(pleines))
            continue

        if RE_PARTIE.match(tete):
            partie = {'titre': tete, 'points': points or second, 'familles': []}
            parties.append(partie)
            famille = critere = None
            continue

        if partie is None:
            notes_bas.append(' — '.join(pleines)) if len(pleines) > 1 else None
            continue

        m = RE_LETTRE.match(tete)
        if m and points:
            famille = {'lettre': m.group(1), 'titre': tete, 'points': points, 'criteres': []}
            partie['familles'].append(famille)
            critere = None
            continue
        if m and not points:
            # « F. Production graphique facultative | Valorisation » : pas de
            # points, donc pas un élément du barème.
            notes_bas.append(f'{tete} — {second}' if second else tete)
            famille = critere = None
            continue

        if RE_NUM.match(tete) and points and famille is not None:
            critere = {'titre': tete, 'points': points, 'paliers': []}
            famille['criteres'].append(critere)
            continue

        if (RE_VAL.match(tete) or RE_PLAGE.match(tete)) and second:
            cible = critere
            if cible is None and famille is not None:
                # Une lettre qui porte ses paliers directement : on lui fabrique
                # un porteur, il deviendra un sous-critère numéroté.
                cible = {'titre': None, 'points': famille['points'], 'paliers': []}
                famille['criteres'].append(cible)
                critere = cible
            if cible is not None:
                cible['paliers'].append({'valeur': tete, 'texte': second})
            continue

        if tete and tete.lower().startswith('principe') and second:
            notes_bas.append(f'{tete} : {second}')

    return parties, notes_bas


# --------------------------------------------------------------------------
#  Les trois corrections de forme
# --------------------------------------------------------------------------

def corriger(parties):
    """Ne touche à aucun point : réorganise, et ouvre les fourchettes."""
    ajouts_zero = 0
    sous_criteres_crees = []

    for partie in parties:
        for famille in partie['familles']:
            for critere in famille['criteres']:
                # (1) une lettre qui se cochait directement reçoit son numéro
                if critere['titre'] is None:
                    intitule = RE_LETTRE.match(famille['titre']).group(2)
                    critere['titre'] = f'1. {intitule}'
                    sous_criteres_crees.append(famille['titre'])

                # (2) « 0–0,5 » devient un vrai 0 puis 0,5
                paliers = []
                for p in critere['paliers']:
                    plage = RE_PLAGE.match(p['valeur'])
                    if not plage:
                        paliers.append(p)
                        continue
                    bas, haut = plage.group(1), plage.group(2)
                    if float(bas.replace(',', '.')) == 0:
                        paliers.append({'valeur': '0', 'texte': DESCRIPTEUR_ZERO, 'ajoute': True})
                        ajouts_zero += 1
                    paliers.append({'valeur': haut, 'texte': p['texte']})
                # un critère qui n'aurait toujours aucun 0 en reçoit un
                if paliers and not any(
                    float(p['valeur'].replace(',', '.')) == 0 for p in paliers
                ):
                    paliers.insert(0, {'valeur': '0', 'texte': DESCRIPTEUR_ZERO, 'ajoute': True})
                    ajouts_zero += 1
                critere['paliers'] = paliers

    return ajouts_zero, sous_criteres_crees


def points_de(txt):
    return float(RE_PTS.match(txt).group(1).replace(',', '.'))


# --------------------------------------------------------------------------
#  Écriture du classeur
# --------------------------------------------------------------------------

POLICE = 'Arial'
GRIS = PatternFill('solid', fgColor='EFEFEF')
BLEU = PatternFill('solid', fgColor='D9E2F3')
JAUNE = PatternFill('solid', fgColor='FFF2CC')
VERT = PatternFill('solid', fgColor='E2EFDA')
FIN = Side(style='thin', color='BFBFBF')
CADRE = Border(left=FIN, right=FIN, top=FIN, bottom=FIN)

# A intitulé/valeur · B descripteur · C, D libres · E points · F séparateur
# puis deux colonnes par élève, exactement comme le classeur de SES.
COL_POINTS = 5
COL_ELEVE1 = 7


def ecrire(parties, notes_bas, ajouts_zero, sous_criteres_crees):
    wb = Workbook()
    ws = wb.active
    ws.title = 'Correction HGGSP'

    def police(cell, **kw):
        cell.font = Font(name=POLICE, **kw)
        return cell

    def put(ligne, col, valeur, **kw):
        c = ws.cell(row=ligne, column=col, value=valeur)
        return police(c, **kw)

    lignes_criteres = []  # (ligne, titre, points) pour la feuille de vérification

    # --- en-tête, dans les 40 premières lignes : le CRM y cherche les élèves --
    put(1, 1, 'NE PAS TOUCHER — cette page est lue automatiquement par le CRM',
        bold=True, color='C00000')
    put(1, COL_ELEVE1, 'Élèves', bold=True)

    put(2, 1, 'BARÈME DE CORRECTION — HGGSP TERMINALE — BACCALAURÉAT', bold=True, size=13)
    put(3, 1,
        "Grille analytique construite à partir des attendus officiels de l'épreuve HGGSP. "
        "À compter de la session 2026 : dissertation /10 + étude critique de document(s) /10. "
        "Les sous-points constituent une grille pédagogique de correction, et non un barème "
        "national détaillé sous-critère par sous-critère.",
        size=9, italic=True)
    ws.row_dimensions[3].height = 42
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
        'Le commentaire est facultatif. '
        'Ne rien écrire dans les colonnes A à E : c’est le barème.',
        size=9, italic=True)

    ligne = 6

    for partie in parties:
        put(ligne, 1, partie['titre'], bold=True, size=12).fill = GRIS
        put(ligne, COL_POINTS, partie['points'], bold=True).fill = GRIS
        for col in range(2, COL_POINTS + 1):
            ws.cell(row=ligne, column=col).fill = GRIS
        ligne += 2

        for famille in partie['familles']:
            put(ligne, 1, famille['titre'], bold=True).fill = VERT
            put(ligne, COL_POINTS, famille['points'], bold=True).fill = VERT
            for col in range(2, COL_POINTS + 1):
                ws.cell(row=ligne, column=col).fill = VERT
            ligne += 1

            for critere in famille['criteres']:
                put(ligne, 1, critere['titre'], bold=True)
                put(ligne, COL_POINTS, critere['points'], bold=True)
                lignes_criteres.append((ligne, critere['titre'], famille['titre']))
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

    # --- ce qui ne se compte pas, dit franchement ------------------------
    put(ligne, 1, 'NOTES AU CORRECTEUR — hors barème', bold=True).fill = GRIS
    ligne += 1
    for note in notes_bas:
        put(ligne, 1, note, size=9, italic=True)
        ws.cell(row=ligne, column=1).alignment = Alignment(wrap_text=True, vertical='top')
        ligne += 1

    ligne += 1
    put(ligne, 1, 'CE QUI A CHANGÉ PAR RAPPORT À LA V0_2 (forme seulement)', bold=True)
    ligne += 1
    for texte in [
        "Aucun point n'a été modifié : chaque critère garde exactement son barème.",
        f"Dans l'étude critique, {len(sous_criteres_crees)} lettres portaient leurs paliers "
        "directement (A, D, E) alors que B, C et F chapeautaient des sous-critères numérotés. "
        "Elles ont maintenant un sous-critère numéroté, comme partout ailleurs — sinon le CRM "
        "rangeait D et E à l'intérieur de « C. Regard critique ».",
        f"{ajouts_zero} paliers écrits en fourchette (« 0–0,5 ») ont été ouverts en deux "
        "lignes : un vrai 0, puis la valeur haute avec son descripteur d'origine. Sans cela "
        "aucun critère ne pouvait valoir 0 et une copie cochée partout au plus bas obtenait "
        "5 sur 20. Les descripteurs de niveau 0 sont écrits en gris : à relire.",
        "« Production graphique facultative » n'avait aucun point : elle est passée en note "
        "au correcteur, ci-dessus, au lieu d'être ignorée en silence.",
        "La zone de correction (nom de l'élève, « niveau ? », commentaire) a été ajoutée, "
        "pour 12 élèves : le classeur V0_2 était un barème seul, sans rien à cocher.",
    ]:
        put(ligne, 1, texte, size=9, italic=True)
        ws.cell(row=ligne, column=1).alignment = Alignment(wrap_text=True, vertical='top')
        ligne += 1

    # --- largeurs et gel ---------------------------------------------------
    ws.column_dimensions['A'].width = 46
    ws.column_dimensions['B'].width = 88
    ws.column_dimensions['C'].width = 3
    ws.column_dimensions['D'].width = 3
    ws.column_dimensions['E'].width = 11
    ws.column_dimensions['F'].width = 3
    for i in range(NB_ELEVES):
        ws.column_dimensions[get_column_letter(COL_ELEVE1 + i * 2)].width = 11
        ws.column_dimensions[get_column_letter(COL_ELEVE1 + i * 2 + 1)].width = 30
    ws.freeze_panes = 'A4'

    # --- feuille de vérification, avec de vraies formules -------------------
    v = wb.create_sheet('Vérification du barème')
    police(v.cell(row=1, column=1, value='VÉRIFICATION DU BARÈME'), bold=True, size=12)
    police(v.cell(row=2, column=1,
                  value="Les points sont lus dans la page « Correction HGGSP » : "
                        "si un barème y change, les totaux ci-dessous suivent."),
           size=9, italic=True)
    for col, titre in enumerate(['Famille', 'Critère', 'Points'], start=1):
        police(v.cell(row=4, column=col, value=titre), bold=True).fill = BLEU

    l = 5
    premiere = l
    for ligne_src, titre, famille in lignes_criteres:
        police(v.cell(row=l, column=1, value=famille), size=9)
        police(v.cell(row=l, column=2, value=titre), size=9)
        ref = f"'Correction HGGSP'!${get_column_letter(COL_POINTS)}${ligne_src}"
        # « — /1,5 » : on prend ce qui suit la barre. VALUE lit le séparateur
        # décimal de la locale — la virgule passe en français, le point en
        # anglais. On essaie les deux plutôt que de parier sur l'une.
        brut = f'MID({ref},FIND("/",{ref})+1,20)'
        police(v.cell(
            row=l, column=3,
            value=f'=IFERROR(VALUE({brut}),IFERROR(VALUE(SUBSTITUTE({brut},",",".")),0))',
        ), size=9).number_format = '0.00'
        l += 1

    police(v.cell(row=l + 1, column=2, value='TOTAL DE L’ÉPREUVE'), bold=True)
    total = police(v.cell(row=l + 1, column=3,
                          value=f'=SUM(C{premiere}:C{l - 1})'), bold=True)
    total.number_format = '0.00'
    total.fill = JAUNE
    police(v.cell(row=l + 2, column=2, value='Attendu'), size=9, italic=True)
    police(v.cell(row=l + 2, column=3, value=20), size=9, italic=True)
    police(v.cell(row=l + 3, column=2, value='Écart'), size=9, italic=True)
    ecart = police(v.cell(row=l + 3, column=3, value=f'=C{l + 1}-C{l + 2}'), size=9, italic=True)
    ecart.number_format = '0.00'

    v.column_dimensions['A'].width = 44
    v.column_dimensions['B'].width = 52
    v.column_dimensions['C'].width = 10

    wb.save(SORTIE)
    return len(lignes_criteres)


if __name__ == '__main__':
    parties, notes_bas = lire_source()
    ajouts, crees = corriger(parties)
    nb = ecrire(parties, notes_bas, ajouts, crees)
    total = sum(
        points_de(c['points'])
        for p in parties for f in p['familles'] for c in f['criteres']
    )
    print(f'{SORTIE} : {nb} critères, total {total}, {ajouts} paliers 0 ajoutés, '
          f'{len(crees)} sous-critères créés')
    for p in parties:
        s = sum(points_de(c['points']) for f in p['familles'] for c in f['criteres'])
        print(f"  {p['titre']} -> {s}")
