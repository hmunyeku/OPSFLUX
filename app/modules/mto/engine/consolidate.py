from collections import OrderedDict
from app.modules.mto.engine.parsing import parse_item
from app.modules.mto.engine.normalize import normalize_text
from app.modules.mto.engine.matching import match, score_pair
from app.modules.mto.engine.memory import get_match, get_fuzzy_match
from app.modules.mto.engine import units

# source d'identification de l'article -> libelle de confiance + rang (le plus fort prime)
_SRC_CONF = {"code": "Code article", "memo": "Validé", "appris": "Appris"}
_SRC_RANK = {"none": 0, "match": 1, "appris": 2, "memo": 3, "code": 4}


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return x if x == x else 0.0  # NaN -> 0


def _s(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() in ("nan", "none", "-") else s


def _clean_code(v):
    """Normalise un code article MTO : '2082469.0' (float Excel) -> '2082469'."""
    s = _s(v)
    if not s:
        return None
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s


def _band(score, source, found):
    if not found:
        return "Non trouvé"
    if source in _SRC_CONF:
        return _SRC_CONF[source]
    if score >= 85:
        return "Élevé"
    if score >= 60:
        return "Moyen"
    return "Faible"


def _statut(found, besoin, dispo):
    if not found:
        return "à commander"
    if dispo > 0 and dispo >= besoin:
        return "en stock"
    if dispo > 0:
        return "partiel"
    return "à commander"


def _resolve(row, desc, code, sap_index, sem, mem_db, min_score):
    """Identifie l'article SAP d'une ligne, par ordre de fiabilite decroissant :
    code article direct -> memoire exacte (validee) -> memoire floue (kNN, avec garde
    score_pair) -> matching attributs+fuzzy+semantique. Retourne (sap_row, score, source, code)."""
    if code and code in sap_index.by_article:
        return sap_index.by_article[code], 100.0, "code", code
    if mem_db:
        nd = normalize_text(desc)
        ndiam = normalize_text(str(row.get("diameter", "")))
        known = get_match(mem_db, f"{nd} | {ndiam}")
        if known and str(known) in sap_index.by_article:
            return sap_index.by_article[str(known)], 100.0, "memo", str(known)
        fz, _fs = get_fuzzy_match(mem_db, nd, ndiam, threshold=90)
        if fz and str(fz) in sap_index.by_article:
            ps, pm = score_pair(row, sap_index.by_article[str(fz)])
            if ps >= 85 and pm.get("diameter") is True:  # garde : ne pas heriter a tort
                return sap_index.by_article[str(fz)], ps, "appris", str(fz)
    cands = match(row, sap_index, top_n=1, sem=sem)
    if cands and cands[0].score >= min_score:
        return cands[0].sap_row, cands[0].score, "match", _s(cands[0].article)
    return None, 0.0, "none", code


def consolidate(mto_rows, sap_index, min_score=60.0, stock_field="stock_ul_hors_mort",
                sem=None, mem_db=None, bar_length_m=units.DEFAULT_BAR_LENGTH_M):
    """Consolide le MTO PUIS rapproche : les lignes de meme signature MTO partagent une
    seule recherche (cache), les besoins sont sommes (qte + longueur), puis convertis vers
    l'unite SAP de l'article (units.convert_need). Regroupement final par article.

    Identification : code -> memoire exacte -> memoire floue -> matching (semantique).
    Retourne une liste de groupes (dict) prets pour l'affichage imbrique.
    """
    groups = OrderedDict()
    resolve_cache = {}  # signature MTO -> (sap_row, score, source, code) : 1 recherche par item unique
    for row in mto_rows:
        desc = str(row.get("description", ""))
        attrs = parse_item(desc, row.get("diameter", ""))
        code0 = _clean_code(row.get("code_article"))
        ndesc = normalize_text(desc)
        ndiam = normalize_text(str(row.get("diameter", "")))
        sig = ("code", code0) if code0 else ("desc", ndesc, ndiam)
        if sig in resolve_cache:
            sap_row, score, source, code = resolve_cache[sig]
        else:
            sap_row, score, source, code = _resolve(row, desc, code0, sap_index, sem, mem_db, min_score)
            resolve_cache[sig] = (sap_row, score, source, code)
        found = sap_row is not None

        # Regroupement par ITEM MTO, JAMAIS par code SAP resolu : sinon des pieces de
        # diametres differents (STUD M16 / M20 / M24...) qui matchent le meme article
        # SAP seraient fusionnees a tort. Le Ø brut (ndiam) est TOUJOURS dans la cle,
        # meme quand un code article MTO est fourni (il peut etre generique).
        key = ("code", code0, ndiam) if code0 else ("desc", ndesc, ndiam)

        g = groups.get(key)
        if g is None:
            g = groups[key] = {
                "article": code or "", "sap_row": sap_row,
                "designation_sap": _s((sap_row or {}).get("designation")),
                "min_score": score if found else 0.0, "source": source, "found": found,
                "famille": attrs.family, "diameter": _s(row.get("diameter")),
                "pressure": attrs.pressure, "schedule": attrs.schedule, "material": attrs.material,
                "sum_qty": 0.0, "sum_length": 0.0, "children": [],
                "mto_key": f"{ndesc} | {ndiam}",
            }
        else:
            if found and _SRC_RANK.get(source, 0) > _SRC_RANK.get(g["source"], 0):
                g["source"] = source
            if source == "match":
                g["min_score"] = min(g["min_score"], score) if g["min_score"] else score

        g["sum_qty"] += _num(row.get("total_qty"))
        g["sum_length"] += _num(row.get("length"))
        g["children"].append({
            "row": _s(row.get("_row")), "line_num": _s(row.get("line_num")), "mark": _s(row.get("mark")),
            "tag": _s(row.get("tag")), "diameter": _s(row.get("diameter")),
            "description": desc, "qte": _num(row.get("total_qty")), "length": _num(row.get("length")),
        })

    out = []
    for g in groups.values():
        sr = g["sap_row"] or {}
        sap_desig = f"{sr.get('designation', '')} {sr.get('designation_long', '')}"
        besoin, unite, a_verifier, detail = units.convert_need(
            sr.get("unite_base"), g["sum_qty"], g["sum_length"],
            is_pipe=(g["famille"] == "PIPE"), sap_designation=sap_desig, bar_length_m=bar_length_m)
        g["besoin"] = besoin
        g["unite"] = unite
        g["unit_check"] = a_verifier
        g["unit_detail"] = detail
        dispo = _num(sr.get(stock_field))
        g["dispo"] = dispo
        g["cde"] = _num(sr.get("stock_cde"))
        g["transit"] = _num(sr.get("stock_transit"))
        g["cq"] = _num(sr.get("stock_cq"))            # controle qualite (distinct)
        g["bloque"] = _num(sr.get("stock_bloque"))
        g["emplacements"] = _s(sr.get("emplacements"))  # magasins/emplacements pour le picking
        g["confiance"] = _band(g["min_score"], g["source"], g["found"])
        g["statut"] = _statut(g["found"], besoin, dispo)
        g["nb_lignes"] = len(g["children"])
        out.append(g)
    return out
