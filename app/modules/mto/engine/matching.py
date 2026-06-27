import re
from dataclasses import dataclass, field
from typing import Optional
from rapidfuzz import fuzz
from app.modules.mto.engine.parsing import parse_item, family_from_hierarchy, detect_family, parse_diameter
from app.modules.mto.engine.normalize import normalize_text

WEIGHTS = {"diameter": 30, "thread": 30, "pressure": 15, "schedule": 10,
           "material": 10, "fuzzy": 25}

@dataclass
class Candidate:
    article: str
    designation: str
    score: float
    confidence: str
    attr_matches: dict
    sap_row: dict = field(default_factory=dict)

@dataclass
class SapIndex:
    by_family: dict          # family -> list[ (attrs, row_dict) ]
    by_ref: dict             # (fabricant, ref_fabricant) -> article
    by_article: dict         # code article -> row_dict (retrouver une ligne par code)
    attrs_by_article: dict = field(default_factory=dict)  # code -> attrs (scoring semantique hors-famille)

def _diam_from_text(text):
    # cote SAP, le diametre est dans la designation (pas de colonne dediee)
    m = re.search(r'(\d+(?:[ \-]\d+/\d+|/\d+)?)\s*"', str(text))
    return parse_diameter(m.group(0))[0] if m else None

def build_sap_index(df):
    by_family, by_ref, by_article, attrs_by_article = {}, {}, {}, {}
    for row in df.to_dict("records"):
        art = str(row.get("article"))
        by_article[art] = row
        desig = str(row.get("designation", ""))
        # famille fine via la designation (coherent avec le cote MTO, gere FR<->EN) ;
        # fallback sur la hierarchie SAP seulement si la designation est ambigue
        fam = detect_family(desig)
        if fam == "OTHER":
            fam = family_from_hierarchy(row.get("hier_pdt_desc"))
        text = f"{desig} {row.get('designation_long','')}"
        attrs = parse_item(text, "")
        attrs.diameter = _diam_from_text(desig)
        attrs.family = fam
        by_family.setdefault(fam, []).append((attrs, row))
        attrs_by_article[art] = attrs
        fab, ref = row.get("fabricant"), row.get("ref_fabricant")
        if fab and ref:
            by_ref[(str(fab).strip(), str(ref).strip())] = row.get("article")
    return SapIndex(by_family=by_family, by_ref=by_ref, by_article=by_article,
                    attrs_by_article=attrs_by_article)

def confidence_band(score, matches):
    if score >= 85 and matches.get("diameter") is True:
        return "Élevé"
    if score >= 60:
        return "Moyen"
    return "Faible"

def _score(mto_attrs, sap_attrs):
    earned = 0.0
    possible = 0.0
    matches = {}
    for attr in ("diameter", "thread", "pressure", "schedule", "material"):
        mv = getattr(mto_attrs, attr)
        sv = getattr(sap_attrs, attr)
        if mv is not None and sv is not None:
            possible += WEIGHTS[attr]
            ok = (abs(mv - sv) < 1e-6) if attr == "diameter" else (mv == sv)
            earned += WEIGHTS[attr] if ok else 0
            matches[attr] = bool(ok)
        else:
            matches[attr] = None
    ratio = fuzz.token_set_ratio(mto_attrs.norm_text, sap_attrs.norm_text) / 100.0
    earned += WEIGHTS["fuzzy"] * ratio
    possible += WEIGHTS["fuzzy"]
    score = 100.0 * earned / possible if possible else 0.0
    return score, matches

def match(mto_row, sap_index: SapIndex, top_n=5, sem=None, sem_weight=20.0, sem_k=15):
    """Classe les candidats SAP pour une ligne MTO. Si `sem` (SemanticIndex) est fourni,
    on ELARGIT le vivier avec les plus proches semantiques (recupere les equivalents
    FR<->EN que le fuzzy rate) et on combine le score regle avec le cosinus semantique."""
    desc = str(mto_row.get("description", ""))
    mto_attrs = parse_item(desc, mto_row.get("diameter", ""))
    pool = {str(row.get("article")): (a, row)
            for a, row in sap_index.by_family.get(mto_attrs.family, [])}
    qvec = None
    if sem is not None:
        qvec = sem.query_vec(desc)
        for art, _c in sem.search(desc, k=sem_k):
            if art not in pool and art in sap_index.by_article:
                a = sap_index.attrs_by_article.get(art)
                if a is not None:
                    pool[art] = (a, sap_index.by_article[art])
    w = sem_weight / 100.0
    scored = []
    for art, (sap_attrs, row) in pool.items():
        score, matches = _score(mto_attrs, sap_attrs)
        if sem is not None:
            score = (1 - w) * score + w * (sem.cos_to(qvec, art) * 100.0)
        conf = confidence_band(score, matches)
        scored.append(Candidate(
            article=row.get("article"), designation=row.get("designation"),
            score=round(score, 1), confidence=conf, attr_matches=matches, sap_row=row))
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[:top_n]


def score_pair(mto_row, sap_row):
    """Score un item MTO contre une ligne SAP precise (re-scoring des attributs).
    Sert a VALIDER une suggestion de la memoire floue avant de l'appliquer : on
    n'herite d'un code memorise que si famille/diametre/pression restent coherents
    (evite d'heriter du code d'une vanne de classe de pression differente)."""
    mto = parse_item(str(mto_row.get("description", "")), mto_row.get("diameter", ""))
    desig = str(sap_row.get("designation", ""))
    sap = parse_item(f"{desig} {sap_row.get('designation_long', '')}", "")
    sap.diameter = _diam_from_text(desig)
    return _score(mto, sap)
