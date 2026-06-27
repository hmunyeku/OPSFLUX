import sqlite3
import pandas as pd


def import_catalogue(path, df, label):
    """Remplace la base catalogue par df (referentiel ZMM60 complet, deja aux cles
    canoniques). Le code article est stocke en texte. Retourne un resume."""
    df = df.copy()
    df["article"] = df["article"].astype(str)
    con = sqlite3.connect(path)
    df.to_sql("catalogue", con, if_exists="replace", index=False)
    con.execute("CREATE TABLE IF NOT EXISTS catalogue_meta (k TEXT PRIMARY KEY, v TEXT)")
    con.execute("INSERT OR REPLACE INTO catalogue_meta VALUES ('label', ?)", (str(label),))
    con.execute("INSERT OR REPLACE INTO catalogue_meta VALUES ('n', ?)", (str(len(df)),))
    con.commit()
    con.close()
    return {"total": len(df), "label": label}


def load_catalogue_db(path):
    con = sqlite3.connect(path)
    try:
        df = pd.read_sql("SELECT * FROM catalogue", con)
    except Exception:
        df = pd.DataFrame()
    con.close()
    return df


def catalogue_is_empty(path):
    con = sqlite3.connect(path)
    try:
        n = con.execute("SELECT COUNT(*) FROM catalogue").fetchone()[0]
    except sqlite3.OperationalError:
        n = 0
    con.close()
    return n == 0


def catalogue_info(path):
    """Retourne {label, n} du dernier import catalogue, ou None si vide."""
    con = sqlite3.connect(path)
    try:
        d = dict(con.execute("SELECT k, v FROM catalogue_meta").fetchall())
    except sqlite3.OperationalError:
        d = {}
    con.close()
    if not d:
        return None
    return {"label": d.get("label"), "n": int(d.get("n", 0))}
