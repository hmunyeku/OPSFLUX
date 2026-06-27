from dataclasses import dataclass
from typing import List
from rapidfuzz import fuzz
from app.modules.mto.engine.parsing import parse_diameter, detect_family, family_from_hierarchy
from app.modules.mto.engine.normalize import normalize_text
import re

# Un (fabricant, ref) partage par plus de N articles = valeur placeholder /
# donnee sale, jamais un vrai doublon -> ignore comme signal.
REF_GROUP_MAX = 8
# Au-dela de cette taille, pas de all-pairs flou intra-bloc (perf O(n^2)).
BLOCK_FUZZY_MAX = 800
# Valeurs de ref fabricant non discriminantes (placeholders) a ignorer.
_REF_PLACEHOLDERS = {
    "0", "00", "000", "1", "-", "--", ".", "..", "na", "n/a", "tba", "tbd",
    "x", "xx", "xxx", "none", "null", "neant", "sans", "?", "??", "s/o", "so",
}

def _clean_ref(v):
    s = str(v if v is not None else "").strip()
    return "" if (len(s) < 2 or s.lower() in _REF_PLACEHOLDERS) else s

@dataclass
class Cluster:
    articles: List[str]
    score: float
    confidence: str
    reason: str
    rows: list

class _UnionFind:
    def __init__(self):
        self.parent = {}
    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x
    def union(self, a, b):
        self.parent[self.find(a)] = self.find(b)

def _diam_from_designation(desig):
    m = re.search(r'(\d+(?:[ \-]\d+/\d+|/\d+)?)\s*"', str(desig))
    return parse_diameter(m.group(0))[0] if m else None

def find_duplicates(df, fuzzy_threshold=88):
    rows = df.to_dict("records")
    items = []
    for r in rows:
        fam = detect_family(str(r.get("designation", "")))
        if fam == "OTHER":
            fam = family_from_hierarchy(r.get("hier_pdt_desc"))
        items.append({
            "article": r.get("article"), "fam": fam,
            "diam": _diam_from_designation(r.get("designation")),
            "norm": normalize_text(f"{r.get('designation','')} {r.get('designation_long','')}"),
            "fab": str(r.get("fabricant") or "").strip(),
            "ref": _clean_ref(r.get("ref_fabricant")),
            "subst": str(r.get("subst_ca") or "").strip(),
            "row": r,
        })
    uf = _UnionFind()
    reason = {}
    by_art = {it["article"]: it for it in items}
    # 1) signal CERTAIN : substitution declaree dans SAP
    for it in items:
        if it["subst"] and it["subst"] in by_art:
            uf.union(it["article"], it["subst"])
            reason[frozenset((it["article"], it["subst"]))] = ("substitution SAP", "Certain", 100.0)
    # 1bis) signal CERTAIN : meme (fabricant, ref). On ignore les groupes trop
    # gros (placeholder / donnee sale, jamais un vrai doublon).
    by_ref = {}
    for it in items:
        if it["fab"] and it["ref"]:
            by_ref.setdefault((it["fab"], it["ref"]), []).append(it["article"])
    for arts in by_ref.values():
        if len(arts) > REF_GROUP_MAX:
            continue
        for other in arts[1:]:
            uf.union(arts[0], other)
            reason[frozenset((arts[0], other))] = ("ref fabricant identique", "Certain", 100.0)
    # 2) signal flou : blocking par (famille, diametre). On EXIGE un diametre :
    # un bloc sans diametre n'est pas discriminant -> sur-unions + explosion
    # O(n^2). On borne aussi la taille de bloc.
    blocks = {}
    for it in items:
        if it["fam"] == "OTHER" or it["diam"] is None:
            continue
        blocks.setdefault((it["fam"], round(it["diam"], 3)), []).append(it)
    for group in blocks.values():
        if len(group) < 2 or len(group) > BLOCK_FUZZY_MAX:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                sim = fuzz.token_set_ratio(a["norm"], b["norm"])
                if sim >= fuzzy_threshold:
                    uf.union(a["article"], b["article"])
                    fs = frozenset((a["article"], b["article"]))
                    if fs not in reason:
                        conf = "Élevé" if sim >= 92 else "Moyen"
                        reason[fs] = (f"attributs + texte proches ({sim})", conf, float(sim))
    # 3) reconstituer les clusters
    groups = {}
    for it in items:
        groups.setdefault(uf.find(it["article"]), []).append(it["article"])
    clusters = []
    for arts in groups.values():
        if len(arts) < 2:
            continue
        # confiance/score/raison du cluster = meilleur lien connu
        best = ("", "Faible", 0.0)
        for i in range(len(arts)):
            for j in range(i + 1, len(arts)):
                fs = frozenset((arts[i], arts[j]))
                if fs in reason and reason[fs][2] >= best[2]:
                    best = reason[fs]
        clusters.append(Cluster(
            articles=sorted(arts), score=best[2], confidence=best[1],
            reason=best[0], rows=[by_art[a]["row"] for a in sorted(arts)]))
    clusters.sort(key=lambda c: c.score, reverse=True)
    return clusters
