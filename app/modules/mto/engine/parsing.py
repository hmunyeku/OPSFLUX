import re
from fractions import Fraction
from dataclasses import dataclass
from typing import Optional
from app.modules.mto.engine.normalize import normalize_text

_BOLT_RE = re.compile(r"^\s*M\d+\s*[xX]\s*\d+", re.I)

def _to_inches(token: str):
    """'2 1/16' -> 2.0625 ; '3/4' -> 0.75 ; '3' -> 3.0"""
    token = token.strip()
    if not token:
        return None
    total = Fraction(0)
    for part in token.split():
        try:
            total += Fraction(part)
        except (ValueError, ZeroDivisionError):
            return None
    return float(total)

def parse_diameter(s):
    """Retourne (d1, d2) en pouces decimaux. d2 != None pour les reductions
    'AxB'. (None, None) pour boulons metriques ou valeur absente."""
    if s is None:
        return (None, None)
    s = str(s).strip()
    if not s or _BOLT_RE.match(s):
        return (None, None)
    # '"' et '-' sont des separateurs internes ; les normaliser en espace
    cleaned = s.replace('"', " ").replace("-", " ").replace("IN", " ").replace("in", " ")
    # reduction : separateur x/X entre deux cotes
    parts = re.split(r"[xX]", cleaned)
    d1 = _to_inches(parts[0])
    d2 = _to_inches(parts[1]) if len(parts) > 1 else None
    return (d1, d2)


# M16, M36X580, M20x135... : le filetage est souvent colle a la longueur (xNN),
# donc pas de \b final ; on borne par un caractere non-chiffre (ou la fin).
_THREAD_RE = re.compile(r"\bM(\d{1,2})(?=\D|$)")

def parse_thread(text, diameter):
    """Filetage metrique d'un boulon (M16, M20...) depuis le Ø ou la description. None sinon."""
    for src in (str(diameter or ""), str(text or "")):
        m = _THREAD_RE.search(src)
        if m:
            return "M" + m.group(1)
    return None


@dataclass
class ItemAttributes:
    family: str
    diameter: Optional[float]
    diameter2: Optional[float]
    pressure: Optional[float]
    schedule: Optional[str]
    material: Optional[str]
    face: Optional[str]
    norm_text: str
    thread: Optional[str] = None

# Detection famille : (mots-cles requis, mots-cles optionnels) -> famille.
# Applique sur texte normalise (FR deja traduit en EN).
def detect_family(text: str) -> str:
    t = normalize_text(text)
    toks = t.split()
    has = lambda *ws: all(w in t for w in ws)
    if "olet" in t or "o let" in t:
        return "OLET"
    if has("elbow"):
        return "ELBOW_45" if "45" in toks else "ELBOW_90"
    if "ell" in t.split():
        return "ELBOW_45" if "45" in toks else "ELBOW_90"
    if has("reducer") or "red" in t.split():
        if "ecc" in t:
            return "REDUCER_ECC"
        if "conc" in t:
            return "REDUCER_CONC"
    if "tee" in toks:  # mot entier : 'steel' contient le substring 'tee'
        return "TEE"
    if has("valve"):
        if "ball" in t: return "VALVE_BALL"
        if "gate" in t: return "VALVE_GATE"
        if "globe" in t: return "VALVE_GLOBE"
        if "check" in t: return "VALVE_CHECK"
        if "control" in t: return "VALVE_CONTROL"
        return "VALVE_OTHER"
    if has("flange") or "flg" in t.split():
        if "blind" in t: return "FLANGE_BLIND"
        if "slip" in t or " so " in f" {t} ": return "FLANGE_SO"
        if "weld" in t and "neck" in t: return "FLANGE_WN"
        if "wn" in t.split(): return "FLANGE_WN"
        return "FLANGE_OTHER"
    if has("gasket"):
        if "spiral" in t: return "GASKET_SPIRAL"
        if "flat" in t: return "GASKET_FLAT"
        return "GASKET"
    if "stud" in t or "bolt" in t:
        return "STUD_BOLT"
    if "pipe" in t.split():
        return "PIPE"
    if "cap" in t.split():
        return "CAP"
    return "OTHER"

def parse_pressure(text: str) -> Optional[float]:
    t = text.upper()
    m = re.search(r"(\d+(?:\.\d+)?)\s*K\s*PSI", t)
    if m:
        return float(m.group(1)) * 1000
    m = re.search(r"(\d+(?:\.\d+)?)\s*PSI", t)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:LB|#)", t)
    if m:
        return float(m.group(1))
    return None

def parse_schedule(text: str) -> Optional[str]:
    m = re.search(r"SCH\s*\.?\s*(\d+|STD|XS|XXS)", text, re.I)
    return m.group(1).upper() if m else None

# Normes ASTM piping courantes (evite de capturer un "A"+chiffres quelconque, ex un n de piece)
_ASTM_GRADES = {"53", "105", "106", "182", "193", "194", "216", "234", "266",
                "276", "312", "320", "333", "350", "352", "403", "420", "694"}

def parse_material(text: str) -> Optional[str]:
    for m in re.finditer(r"\bA(\d{2,3})\b", text, re.I):
        if m.group(1) in _ASTM_GRADES:
            return f"A{m.group(1)}"
    return None

def parse_face(text: str) -> Optional[str]:
    for face in ("RTJ", "RJ", "RF", "FF"):
        if re.search(rf"\b{face}\b", text, re.I):
            return "RTJ" if face == "RJ" else face
    return None

def parse_item(text: str, diameter) -> ItemAttributes:
    d1, d2 = parse_diameter(diameter)
    return ItemAttributes(
        family=detect_family(text),
        diameter=d1,
        diameter2=d2,
        pressure=parse_pressure(text),
        schedule=parse_schedule(text),
        material=parse_material(text),
        face=parse_face(text),
        norm_text=normalize_text(text),
        thread=parse_thread(text, diameter),
    )

# Mapping hierarchie produit SAP (Desc Hierarchie pdt) -> famille canonique.
FAMILY_FROM_HIERARCHY = {
    "BALL VALVE": "VALVE_BALL", "GATE VALVE": "VALVE_GATE",
    "GLOBE VALVE": "VALVE_GLOBE", "CHECK VALVE": "VALVE_CHECK",
    "GATE & CHOKE VALVE": "VALVE_GATE", "BLOCK AND BLEED VALVE": "VALVE_OTHER",
    "BUTTERFLY VALVE": "VALVE_OTHER", "PRESSURE SAFETY VALVE": "VALVE_OTHER",
    "ASSEMBLED VALVE": "VALVE_OTHER", "OTHER VALVE": "VALVE_OTHER", "VALVES": "VALVE_OTHER",
    "WELDING NECK FLANGE": "FLANGE_WN", "BLIND FLANGE": "FLANGE_BLIND",
    "SLIP ON FLANGE": "FLANGE_SO", "SOCKET WELDING FLANGE": "FLANGE_OTHER",
    "ORIFICE FLANGE": "FLANGE_OTHER", "OTHER FLANGE": "FLANGE_OTHER", "FLANGE": "FLANGE_OTHER",
    "GASKET - SEAL": "GASKET", "GASKET": "GASKET",
    "STUD BOLT": "STUD_BOLT", "BOLT": "STUD_BOLT", "BOLT ON HEAD": "STUD_BOLT",
    "LINE PIPE API5L": "PIPE", "METAL PIPING": "PIPE", "OTHER PIPING": "PIPE",
    "REINFORCED BRANCH FITTING": "OLET", "SPECIAL FITTING": "OTHER",
}

def family_from_hierarchy(hier_pdt_desc: str) -> str:
    if hier_pdt_desc is None:
        return "OTHER"
    return FAMILY_FROM_HIERARCHY.get(str(hier_pdt_desc).strip().upper(), "OTHER")
