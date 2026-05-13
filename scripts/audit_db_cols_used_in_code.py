"""Audit inverse : pour chaque colonne BDD qui n'est PAS dans le modele
SQLAlchemy correspondant, verifier si elle est utilisee dans le code
applicatif. Si oui -> bug type #29 (Attachment.category) : code utilise
une colonne BDD via `Model.col == ...` mais l'attribut Mapped[] manque.

Run apres scripts/audit_model_vs_db.py et compare_model_vs_db.py (qui
genere C:/Users/matth/AppData/Local/Temp/models.json et bdd_cols.json).
"""
import json
import os
import re


SRC_ROOT = r"C:/Users/matth/Desktop/OPSFLUX/app"


def walk_py(root: str):
    for dirpath, _, files in os.walk(root):
        if "__pycache__" in dirpath or ".venv" in dirpath:
            continue
        for f in files:
            if f.endswith(".py"):
                yield os.path.join(dirpath, f)


def main():
    models = json.load(open(r"C:/Users/matth/AppData/Local/Temp/models.json", encoding="utf-8"))
    bdd_dump = json.load(open(r"C:/Users/matth/AppData/Local/Temp/bdd_cols.json", encoding="utf-8"))

    # Build BDD : table -> set(cols)
    bdd = {}
    for row in bdd_dump.get("rows", []):
        if isinstance(row, list) and len(row) >= 2:
            tbl, col = row[0], row[1]
            bdd.setdefault(tbl, set()).add(col)

    # For each model, compute orphan cols (BDD present but not in model)
    candidates = []  # (table, class_name, orphan_col)
    for tbl, info in models.items():
        if tbl not in bdd:
            continue
        model_cols = set(info["model_cols"])
        db_cols = bdd[tbl]
        orphans = db_cols - model_cols
        # Filter out FK columns that the regex couldn't catch :
        # we focus on cols that look like business fields.
        for col in orphans:
            # Skip obvious FK : ends with _id, looks like uuid generated
            if col in ("created_at", "updated_at", "id", "archived", "deleted_at"):
                continue
            candidates.append((tbl, info["class"], col))

    # Now grep the source for `ClassName.col` patterns
    findings = []  # (table, class, col, file:line)
    py_files = list(walk_py(SRC_ROOT))
    # Build a fast index of (class_name, col_name) -> regex pattern
    pats = {}
    for tbl, cls, col in candidates:
        pat = re.compile(rf"\b{re.escape(cls)}\.{re.escape(col)}\b")
        pats.setdefault((tbl, cls, col), pat)

    for path in py_files:
        try:
            with open(path, encoding="utf-8") as f:
                src = f.read()
        except Exception:
            continue
        for key, pat in pats.items():
            tbl, cls, col = key
            for m in pat.finditer(src):
                # Get line number
                line_no = src[:m.start()].count("\n") + 1
                findings.append((tbl, cls, col, path.replace("\\", "/"), line_no))
                break  # 1 finding per file/key suffices

    # Group by (table, class, col) for clarity
    by_key: dict[tuple, list[str]] = {}
    for tbl, cls, col, path, line_no in findings:
        rel = path.replace(SRC_ROOT.replace("\\", "/") + "/", "")
        by_key.setdefault((tbl, cls, col), []).append(f"{rel}:{line_no}")

    print(f"=== Colonnes orphelines en BDD utilisees dans le code applicatif : {len(by_key)} cas ===\n")
    for (tbl, cls, col), refs in sorted(by_key.items()):
        print(f"  >> {tbl}.{col} (class {cls}) :")
        for r in refs[:3]:
            print(f"      {r}")
        if len(refs) > 3:
            print(f"      ... +{len(refs)-3} more")


if __name__ == "__main__":
    main()
