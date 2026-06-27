"""Transformations appliquables a une colonne lors de l'import, chainables.

Chaque transfo prend une Series pandas et retourne une Series. Les valeurs manquantes
sont traitees comme du vide (jamais la chaine 'nan'). La transfo 'concat' (fusion de deux
colonnes) est un cas a part : elle a besoin d'une 2e colonne et est geree dans
io_loaders.apply_mapping, pas ici.
"""
import re
import numpy as np
import pandas as pd


def _as_str(s):
    """Series -> texte propre : NaN/None -> '' (et pas 'nan')."""
    return s.astype(object).where(s.notna(), "").astype(str)


def _trim(s, **_):
    return _as_str(s).str.strip()


def _to_number(s, **_):
    txt = _as_str(s).str.replace(",", ".", regex=False).str.replace(r"[^0-9.\-]", "", regex=True)
    return pd.to_numeric(txt, errors="coerce")


def _to_text(s, **_):
    """Force texte ; retire un '.0' final (codes article lus comme float par Excel)."""
    out = _as_str(s).str.strip()
    return out.str.replace(r"\.0$", "", regex=True)


def _upper(s, **_):
    return _as_str(s).str.upper()


def _lower(s, **_):
    return _as_str(s).str.lower()


def _default(s, value="", **_):
    """Remplace les valeurs vides par `value`."""
    out = _as_str(s)
    return out.mask(out.str.strip() == "", str(value))


def _extract_number(s, **_):
    """Extrait le 1er nombre rencontre (ex 'DN50' -> 50, '12,5 mm' -> 12.5)."""
    m = _as_str(s).str.extract(r"(\d+(?:[.,]\d+)?)")[0].str.replace(",", ".", regex=False)
    return pd.to_numeric(m, errors="coerce")


def _replace(s, find="", repl="", regex=False, **_):
    return _as_str(s).str.replace(find, repl, regex=bool(regex))


TRANSFORMS = {
    "trim": _trim,
    "to_number": _to_number,
    "to_text": _to_text,
    "upper": _upper,
    "lower": _lower,
    "default": _default,
    "extract_number": _extract_number,
    "replace": _replace,
}

# libelles pour le wizard (les transfos a 2 colonnes comme 'concat' sont gerees ailleurs)
TRANSFORM_LABELS = {
    "trim": "Nettoyer les espaces",
    "to_number": "Forcer en nombre",
    "to_text": "Forcer en texte",
    "upper": "MAJUSCULES",
    "lower": "minuscules",
    "default": "Valeur par défaut si vide",
    "extract_number": "Extraire le 1er nombre",
    "replace": "Remplacer",
}


def apply_transform(series, name, params=None):
    """Applique une transfo nommee a une Series (renvoie la Series inchangee si inconnue)."""
    fn = TRANSFORMS.get(name)
    return series if fn is None else fn(series, **(params or {}))


def apply_chain(series, steps):
    """Applique une sequence de transfos : steps = [{'type': name, 'params': {...}}, ...]."""
    out = series
    for step in steps or []:
        out = apply_transform(out, step.get("type"), step.get("params"))
    return out
