import sqlite3
import pandas as pd


def _init(con):
    con.execute("""CREATE TABLE IF NOT EXISTS stock_snapshot (
        article TEXT, label TEXT, stock_ul_hors_mort REAL,
        PRIMARY KEY (article, label))""")


def stock_is_empty(path):
    con = sqlite3.connect(path)
    try:
        n = con.execute("SELECT COUNT(*) FROM stock").fetchone()[0]
    except sqlite3.OperationalError:
        n = 0
    con.close()
    return n == 0


def load_stock(path):
    con = sqlite3.connect(path)
    try:
        df = pd.read_sql("SELECT * FROM stock", con)
    except Exception:
        df = pd.DataFrame()
    con.close()
    return df


def _eq(a, b):
    try:
        return abs(float(a) - float(b)) < 1e-9
    except (TypeError, ValueError):
        return str(a) == str(b)


def import_stock(path, df_new, label, key_col="stock_ul_hors_mort"):
    """Actualise le stock : remplace l'etat courant par df_new (le fichier mensuel est
    un etat complet), calcule le diff (ajoutes / disparus / quantites changees) et archive
    un snapshot date pour l'historique. Retourne le resume des changements."""
    df_new = df_new.copy()
    df_new["article"] = df_new["article"].astype(str)
    df_old = load_stock(path)
    new_articles = set(df_new["article"])
    old_articles = set(df_old["article"].astype(str)) if len(df_old) else set()
    added = new_articles - old_articles
    removed = old_articles - new_articles
    common = new_articles & old_articles
    changed = 0
    if common and len(df_old) and key_col in df_old.columns and key_col in df_new.columns:
        old_q = dict(zip(df_old["article"].astype(str), df_old[key_col]))
        new_q = dict(zip(df_new["article"], df_new[key_col]))
        changed = sum(1 for a in common if not _eq(old_q.get(a), new_q.get(a)))
    con = sqlite3.connect(path)
    _init(con)
    df_new.to_sql("stock", con, if_exists="replace", index=False)
    if key_col in df_new.columns:
        con.execute("DELETE FROM stock_snapshot WHERE label=?", (label,))
        snap = df_new[["article", key_col]].rename(columns={key_col: "stock_ul_hors_mort"})
        snap = snap.assign(label=label)[["article", "label", "stock_ul_hors_mort"]]
        snap.to_sql("stock_snapshot", con, if_exists="append", index=False)
    con.commit()
    con.close()
    return {"total": len(df_new), "added": len(added), "removed": len(removed),
            "changed": changed, "unchanged": len(common) - changed}


def stock_history(path, article):
    """Evolution de la quantite d'un article a travers les imports : liste (label, qty)."""
    con = sqlite3.connect(path)
    try:
        rows = con.execute(
            "SELECT label, stock_ul_hors_mort FROM stock_snapshot WHERE article=? ORDER BY label",
            (str(article),)).fetchall()
    except sqlite3.OperationalError:
        rows = []
    con.close()
    return [(lbl, float(q) if q is not None else None) for lbl, q in rows]
