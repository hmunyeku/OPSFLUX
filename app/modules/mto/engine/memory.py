import sqlite3
import json
import pandas as pd
from rapidfuzz import fuzz

def init_db(path):
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE IF NOT EXISTS match_memory (
            mto_key TEXT PRIMARY KEY, sap_article TEXT NOT NULL,
            source TEXT, validated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS dup_decision (
            article_a TEXT, article_b TEXT, decision TEXT,
            decided_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (article_a, article_b));
        CREATE TABLE IF NOT EXISTS learned_synonyms (
            source TEXT PRIMARY KEY, target TEXT NOT NULL,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS mto_mapping (
            signature TEXT PRIMARY KEY, mapping TEXT NOT NULL,
            saved_at TEXT DEFAULT CURRENT_TIMESTAMP);
    """)
    con.commit()
    con.close()

def save_match(path, mto_key, sap_article, source="user"):
    con = sqlite3.connect(path)
    con.execute(
        "INSERT INTO match_memory(mto_key, sap_article, source) VALUES(?,?,?) "
        "ON CONFLICT(mto_key) DO UPDATE SET sap_article=excluded.sap_article, source=excluded.source",
        (mto_key, sap_article, source))
    con.commit()
    con.close()

def get_match(path, mto_key):
    con = sqlite3.connect(path)
    cur = con.execute("SELECT sap_article FROM match_memory WHERE mto_key=?", (mto_key,))
    row = cur.fetchone()
    con.close()
    return row[0] if row else None

def save_dup_decision(path, article_a, article_b, decision):
    a, b = sorted((str(article_a), str(article_b)))
    con = sqlite3.connect(path)
    con.execute(
        "INSERT INTO dup_decision(article_a, article_b, decision) VALUES(?,?,?) "
        "ON CONFLICT(article_a, article_b) DO UPDATE SET decision=excluded.decision",
        (a, b, decision))
    con.commit()
    con.close()

def seed_from_substitutions(path, df):
    """Injecte les paires de substitution SAP comme doublons confirmes. Retourne le nb insere."""
    n = 0
    con = sqlite3.connect(path)
    for r in df.to_dict("records"):
        a, b = r.get("article"), r.get("subst_ca")
        if a and pd.notna(b) and str(b).strip():
            x, y = sorted((str(a), str(b)))
            con.execute(
                "INSERT OR IGNORE INTO dup_decision(article_a, article_b, decision) VALUES(?,?,?)",
                (x, y, "confirmed"))
            n += 1
    con.commit()
    con.close()
    return n


def get_fuzzy_match(path, norm_desc, norm_diam, threshold=88):
    """A. Mémoire floue : la validation la plus proche (fuzzy sur la description normalisée)
    AU MÊME diamètre, si similarité >= threshold. Retourne (article, score) ou (None, 0)."""
    con = sqlite3.connect(path)
    rows = con.execute("SELECT mto_key, sap_article FROM match_memory").fetchall()
    con.close()
    best_art, best_score = None, 0
    target_diam = str(norm_diam).strip()
    for key, art in rows:
        parts = str(key).split(" | ", 1)
        if len(parts) != 2:
            continue
        kdesc, kdiam = parts[0], parts[1].strip()
        if kdiam != target_diam:
            continue
        score = fuzz.token_set_ratio(norm_desc, kdesc)
        if score >= threshold and score > best_score:
            best_art, best_score = art, score
    return (best_art, best_score) if best_art else (None, 0)


def add_learned_synonym(path, source, target):
    s, t = str(source).strip().lower(), str(target).strip().lower()
    if not s or not t:
        return
    con = sqlite3.connect(path)
    con.execute("INSERT INTO learned_synonyms(source, target) VALUES(?,?) "
                "ON CONFLICT(source) DO UPDATE SET target=excluded.target", (s, t))
    con.commit()
    con.close()


def get_learned_synonyms(path):
    con = sqlite3.connect(path)
    rows = con.execute("SELECT source, target FROM learned_synonyms").fetchall()
    con.close()
    return {s: t for s, t in rows}


def save_mto_mapping(path, signature, mapping):
    con = sqlite3.connect(path)
    con.execute("INSERT INTO mto_mapping(signature, mapping) VALUES(?,?) "
                "ON CONFLICT(signature) DO UPDATE SET mapping=excluded.mapping",
                (str(signature), json.dumps(mapping)))
    con.commit()
    con.close()


def get_mto_mapping(path, signature):
    con = sqlite3.connect(path)
    cur = con.execute("SELECT mapping FROM mto_mapping WHERE signature=?", (str(signature),))
    row = cur.fetchone()
    con.close()
    return json.loads(row[0]) if row else None
