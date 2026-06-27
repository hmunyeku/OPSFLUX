import re
import unicodedata

# Synonymes FR -> EN (token a token, sur texte deja minuscule/sans accents)
SYNONYMS = {
    "vanne": "valve", "robinet": "valve", "soupape": "valve", "clapet": "check",
    "coude": "elbow", "bride": "flange", "joint": "gasket", "garniture": "gasket",
    "tuyau": "pipe", "tube": "pipe", "tige": "rod", "acier": "steel",
    "reduction": "reducer", "reduit": "reducer", "te": "tee", "bouchon": "cap",
    "manchon": "coupling", "ecrou": "nut", "boulon": "bolt", "vis": "screw",
    "rondelle": "washer", "pompe": "pump", "roulement": "bearing",
    "filtre": "filter", "regulation": "control", "regulat": "control",
    "plate": "flat", "plein": "blind", "spirale": "spiral",
}

# Synonymes APPRIS : persistes en base, charges au runtime par l'app (set_learned_synonyms).
# Appliques en priorite sur SYNONYMS statiques. Permettent a l'outil d'enrichir le
# vocabulaire FR/EN au fil des validations sans toucher au code.
_LEARNED = {}

def set_learned_synonyms(d):
    _LEARNED.clear()
    _LEARNED.update({str(k).strip().lower(): str(v).strip().lower()
                     for k, v in (d or {}).items() if str(k).strip() and str(v).strip()})

# Unites a uniformiser (avant tokenisation)
_UNIT_SUBS = [
    (r"#", "lb"),       # 900# -> 900lb
    (r'"', " in "),     # 12" -> 12 in
    (r"\bIN\b", "in"),
]

def normalize_text(s: str) -> str:
    if s is None:
        return ""
    s = str(s)
    # retirer le caractere de remplacement issu du mauvais encodage SAP
    s = s.replace("�", "")
    # enlever accents
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper()
    for pat, rep in _UNIT_SUBS:
        s = re.sub(pat, rep, s)
    s = s.lower()
    # tokeniser sur tout ce qui n'est pas alphanumerique
    tokens = re.findall(r"[a-z0-9]+", s)
    tokens = [(_LEARNED.get(t) or SYNONYMS.get(t, t)) for t in tokens]
    return " ".join(tokens)
