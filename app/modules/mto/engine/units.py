import math
import re

# familles d'unites SAP (unite_base), normalisees en majuscules
_LENGTH = {"M", "ML", "MTR", "MET", "MT", "MTL", "METRE", "METRES"}
_PIECE = {"PC", "PCE", "UN", "U", "EA", "NB", "PIECE", "PIECES", "P", "PIE"}
_PACK = {"BTE", "BOITE", "KIT", "SET", "LOT", "CAR", "CARTON", "FUT", "SAC",
         "PCK", "PAQUET", "ROUL", "ROULEAU", "PAIRE", "PAI"}

# unites SAP = troncon de tuyau a longueur FIXE connue (metres) : JR1=6m, JR2=9m, JR3=12m
_BAR_LENGTHS = {"JR1": 6.0, "JR2": 9.0, "JR3": 12.0}

DEFAULT_BAR_LENGTH_M = 6.0  # longueur d'une barre quand ni la designation ni l'unite ne la donnent

# "L=6M" / "L=11.8M" : le signe = est OBLIGATOIRE (sinon on capte le L de 'PSL2,6M')
_BARLEN_RE = re.compile(r"L\s*=\s*(\d{1,2}(?:[.,]\d)?)\s*M\b", re.I)
# entier precede d'un separateur : ' 6M', ',6M', '/12M' (longueur de barre)
_BARLEN_RE2 = re.compile(r"[\s,(/](\d{1,2})\s*M\b(?!M)", re.I)


def classify(sap_unit):
    """Famille de l'unite SAP : 'length' | 'piece' | 'pack' | 'unknown'."""
    u = str(sap_unit or "").strip().upper()
    if u in _LENGTH:
        return "length"
    if u in _PIECE or u == "":
        return "piece"
    if u in _PACK:
        return "pack"
    return "unknown"


def bar_length_from_desig(designation):
    """Longueur de barre (m) extraite de la designation SAP (ex 'L=6M', '12M').
    Retourne un float ou None si rien de plausible (3-13 m)."""
    if not designation:
        return None
    s = str(designation).upper()
    m = _BARLEN_RE.search(s)
    if m:
        v = float(m.group(1).replace(",", "."))
        if 1.0 <= v <= 20.0:
            return v
    for mm in _BARLEN_RE2.finditer(s):
        v = float(mm.group(1).replace(",", "."))
        if 3.0 <= v <= 13.0:  # longueur de barre plausible (evite faux positifs)
            return v
    return None


def convert_need(sap_unit, total_qty, length_mm, is_pipe=False, sap_designation="",
                 bar_length_m=DEFAULT_BAR_LENGTH_M):
    """Convertit le besoin MTO vers l'unite de l'article SAP.

    - unite longueur (M...)        -> besoin = longueur (mm) / 1000, en metres
    - tuyau vendu en barres (unite JR1/2/3, ou PC+is_pipe+longueur) -> nb de barres.
      Longueur de barre : 1) extraite de la designation (L=6M) 2) unite JR 3) defaut 6 m.
    - unite piece (composants) -> quantite (pieces)
    - conditionnement (BTE/KIT...) ou inconnu -> quantite, marque 'a verifier'

    Retourne (besoin, unite_affichee, a_verifier: bool, detail: str|None).
    """
    u = str(sap_unit or "").strip().upper()
    length_m = (length_mm or 0) / 1000.0
    kind = classify(u)
    is_bar_unit = u in _BAR_LENGTHS

    if kind == "length":
        return (length_m, "m", False, None)

    if is_bar_unit or (kind == "piece" and is_pipe and length_m > 0):
        # longueur de barre : designation (la plus precise) > unite JR > defaut
        bar = bar_length_from_desig(sap_designation)
        src = "désignation"
        if bar is None:
            bar = _BAR_LENGTHS.get(u)
            src = "unité " + u
        if bar is None:
            bar = bar_length_m
            src = "défaut"
        if length_m <= 0:  # unite barre mais pas de longueur de besoin -> quantite
            return (float(total_qty or 0), "barre(s)", False, f"barre {bar:.0f} m ({src})")
        n = math.ceil(length_m / bar) if bar > 0 else 0
        return (float(n), "barre(s)", False, f"{length_m:.1f} m ÷ {bar:.0f} m/barre ({src})")

    if kind == "piece":
        return (float(total_qty or 0), "PC", False, None)
    if kind == "pack":
        return (float(total_qty or 0), u, True, "conditionnement SAP, facteur de colisage inconnu")
    return (float(total_qty or 0), u or "PC", True, "unite SAP non reconnue")
