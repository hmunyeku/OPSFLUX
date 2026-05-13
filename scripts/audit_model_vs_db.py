"""Audit : comparer les colonnes declarees dans les modeles SQLAlchemy
avec celles presentes en BDD. Detecter les "tv_token-like" gaps.

Strategie :
1. Importer tous les modeles (qui s'enregistrent dans Base.metadata)
2. Pour chaque table, executer SELECT column_name FROM information_schema.columns
3. Comparer : modele_cols - bdd_cols = colonnes manquantes en BDD
            bdd_cols - modele_cols = colonnes orphelines en BDD

Run via API admin sql-runner (read-only).
"""
import json
import sys

# Source code path (we don't run this on the server, just generate the audit
# locally by parsing the model files and asking the API for BDD schema).

import os
import re

MODELS_DIR = r"C:/Users/matth/Desktop/OPSFLUX/app/models"

# 1. Extract (table_name, [columns]) from each model file via regex.
# Pattern : `__tablename__ = "xxx"` then collect `xxx: Mapped[...] = mapped_column(...)`
# until next class.


def extract_model_columns(path: str):
    """Yield (class_name, table_name, columns_set) for each class in the file."""
    with open(path, encoding="utf-8") as f:
        src = f.read()

    # Split into class blocks
    class_re = re.compile(
        r"^class\s+(\w+)\s*\([^)]*\)\s*:\s*\n(.+?)(?=^class\s|\Z)",
        re.DOTALL | re.MULTILINE,
    )
    # ONLY columns with mapped_column(...) — exclude relationship(...) calls.
    # Some declarations span multiple lines, so we look for the assignment.
    col_re = re.compile(
        r"^\s{4}(\w+)\s*:\s*Mapped\[[^=]+?\]\s*=\s*mapped_column\(",
        re.MULTILINE | re.DOTALL,
    )
    table_re = re.compile(r'__tablename__\s*=\s*[\'"]([^\'"]+)[\'"]')

    for m in class_re.finditer(src):
        class_name = m.group(1)
        body = m.group(2)
        tbl_match = table_re.search(body)
        if not tbl_match:
            continue
        tablename = tbl_match.group(1)
        cols = set(col_re.findall(body))
        # Add mixin-derived columns
        # UUIDPrimaryKeyMixin -> id
        # TimestampMixin -> created_at, updated_at
        # SoftDeleteMixin -> archived, deleted_at
        # Heuristic via class declaration
        cls_decl_match = re.search(
            rf"class\s+{class_name}\s*\(([^)]*)\)", src
        )
        if cls_decl_match:
            bases = cls_decl_match.group(1)
            if "UUIDPrimaryKeyMixin" in bases:
                cols.add("id")
            if "TimestampMixin" in bases:
                cols.add("created_at")
                cols.add("updated_at")
            if "SoftDeleteMixin" in bases:
                cols.add("archived")
                cols.add("deleted_at")
        yield class_name, tablename, cols


def main():
    out = {}
    for fname in os.listdir(MODELS_DIR):
        if not fname.endswith(".py") or fname.startswith("_"):
            continue
        path = os.path.join(MODELS_DIR, fname)
        for class_name, table, cols in extract_model_columns(path):
            out[table] = {
                "class": class_name,
                "file": fname,
                "model_cols": sorted(cols),
            }

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
