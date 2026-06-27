import pandas as pd
from app.modules.mto.engine.io_loaders import _canon_key

# en-tete ZMM60 (une fois canonise) -> cle canonique (compatible build_sap_index)
# en-tete catalogue (canonise) -> cle canonique. Plusieurs variantes par cle car les
# exports SAP different (ZMM60 verbeux vs BASE_ARTICLE abrege).
_CATALOGUE_MAP = {
    "article": "article",
    "designation article": "designation",
    "unite de qte base": "unite_base",
    "unite": "unite_base",
    "texte de commande": "designation_long",
    "groupe marchandises": "groupe",
    "grpemarch": "groupe",
    "hierarchie produits": "hier_produits",
    "hier pdts": "hier_produits",
    "description hierarchie pdt": "hier_pdt_desc",
    "description hier pdts": "hier_pdt_desc",
    "description hier pdt": "hier_pdt_desc",
    "fabricant": "fabricant",
    "no de piece fabricant": "ref_fabricant",
    "npf": "ref_fabricant",
}


def load_catalogue(path, sheet=0):
    """Charge le referentiel articles SAP (ZMM60) en auto (mapping _CATALOGUE_MAP),
    pret pour build_sap_index. Le code article est normalise en TEXTE."""
    df = pd.read_excel(path, sheet_name=sheet, engine="openpyxl")
    rename = {}
    for c in df.columns:
        canon = _CATALOGUE_MAP.get(_canon_key(c))
        if canon and canon not in rename.values():
            rename[c] = canon
    return finalize_catalogue(df.rename(columns=rename))


def finalize_catalogue(df):
    """Post-traitement du catalogue APRES mapping vers les cles canoniques (auto OU
    wizard) : filtre/dedup des articles, fusion des 'Texte de commande' 2/3 bruts
    restants dans designation_long, colonnes garanties pour build_sap_index."""
    df = df[df["article"].notna()].copy()
    df["article"] = df["article"].astype(str).str.strip()
    df = df.drop_duplicates(subset="article", keep="last")
    if "designation_long" not in df.columns:
        df["designation_long"] = ""
    # fusionner les "Texte de commande" 2/3 (non mappes) dans designation_long :
    # plus de contexte (specs, normes, references) pour le fuzzy ET le semantique
    extra = [c for c in df.columns if isinstance(c, str) and _canon_key(c).startswith("texte de commande")]
    if extra:
        dl = df["designation_long"].fillna("").astype(str)
        for c in extra:
            dl = dl.str.cat(df[c].fillna("").astype(str), sep=" ")
        df["designation_long"] = dl.str.replace(r"\s+", " ", regex=True).str.strip()
        df = df.drop(columns=extra)
    if "subst_ca" not in df.columns:
        df["subst_ca"] = ""  # le catalogue n'a pas de colonne substitution
    return df.reset_index(drop=True)


def join_stock(catalogue_df, stock_df, stock_cols):
    """Enrichit le catalogue avec les quantites de stock par jointure sur 'article'.
    Les articles du catalogue absents du stock recoivent des quantites nulles."""
    out = catalogue_df.copy()
    out["article"] = out["article"].astype(str).str.strip()
    if stock_df is None or not len(stock_df):
        for c in stock_cols:
            out[c] = None
        return out
    keep = ["article"] + [c for c in stock_cols if c in stock_df.columns]
    s = stock_df[keep].drop_duplicates(subset="article").copy()
    s["article"] = s["article"].astype(str).str.strip()
    return out.merge(s, on="article", how="left")
