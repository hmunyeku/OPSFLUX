"""Persistance des mappings d'import (SQLite, table `import_mappings`).

Un mapping enregistre = {kind, feuille, ligne d'en-tete, mapping champ->colonne, transfos}.
Deux modes de reutilisation :
  - AUTO : indexe par signature des colonnes source -> re-propose si un fichier a la meme
    structure (meme jeu de colonnes, ordre/casse/accents ignores).
  - MODELE : enregistre sous un nom -> rappelable explicitement dans une liste.
"""
import json
import sqlite3
from datetime import datetime

from app.modules.mto.engine.io_loaders import _canon_key


def init_db(db):
    con = sqlite3.connect(db)
    con.execute(
        """CREATE TABLE IF NOT EXISTS import_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, kind TEXT NOT NULL, sheet_name TEXT, header_row INTEGER,
            columns_sig TEXT, config_json TEXT NOT NULL, created_at TEXT)"""
    )
    con.commit()
    con.close()


def columns_signature(columns):
    """Signature stable d'un jeu de colonnes : ordre, casse et accents ignores."""
    keys = sorted({_canon_key(c) for c in columns if _canon_key(c)})
    return "|".join(keys)


def save_mapping(db, kind, sheet_name, header_row, columns, config, name=None):
    """Enregistre un mapping. Un modele (avec `name`) remplace l'ancien de meme nom ;
    un mapping auto (sans nom) remplace l'ancien de meme signature de colonnes."""
    init_db(db)
    sig = columns_signature(columns)
    con = sqlite3.connect(db)
    if name:
        con.execute("DELETE FROM import_mappings WHERE kind=? AND name=?", (kind, name))
    else:
        con.execute("DELETE FROM import_mappings WHERE kind=? AND name IS NULL AND columns_sig=?",
                    (kind, sig))
    con.execute(
        """INSERT INTO import_mappings
           (name, kind, sheet_name, header_row, columns_sig, config_json, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (name, kind, sheet_name, int(header_row), sig, json.dumps(config), datetime.now().isoformat()),
    )
    con.commit()
    con.close()


def find_by_signature(db, kind, columns):
    """Mapping AUTO le plus recent dont la signature de colonnes correspond, ou None."""
    init_db(db)
    sig = columns_signature(columns)
    con = sqlite3.connect(db)
    row = con.execute(
        """SELECT sheet_name, header_row, config_json FROM import_mappings
           WHERE kind=? AND columns_sig=? ORDER BY id DESC LIMIT 1""",
        (kind, sig),
    ).fetchone()
    con.close()
    if not row:
        return None
    return {"sheet_name": row[0], "header_row": row[1], "config": json.loads(row[2])}


def list_named(db, kind=None):
    """Liste des modeles nommes [{id, name, kind, sheet_name, header_row, config}]."""
    init_db(db)
    con = sqlite3.connect(db)
    q = ("SELECT id, name, kind, sheet_name, header_row, config_json "
         "FROM import_mappings WHERE name IS NOT NULL")
    params = ()
    if kind:
        q += " AND kind=?"
        params = (kind,)
    rows = con.execute(q + " ORDER BY name", params).fetchall()
    con.close()
    return [{"id": r[0], "name": r[1], "kind": r[2], "sheet_name": r[3],
             "header_row": r[4], "config": json.loads(r[5])} for r in rows]


def get_mapping(db, mapping_id):
    """Un mapping par id, ou None."""
    init_db(db)
    con = sqlite3.connect(db)
    row = con.execute(
        "SELECT name, kind, sheet_name, header_row, config_json FROM import_mappings WHERE id=?",
        (mapping_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    return {"name": row[0], "kind": row[1], "sheet_name": row[2],
            "header_row": row[3], "config": json.loads(row[4])}
