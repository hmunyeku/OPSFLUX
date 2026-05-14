"""Audit specifique : tables avec created_by/updated_by en BDD mais
ou le modele SQLAlchemy ne declare PAS ces attributs.
"""
import json

models = json.load(open(r"C:/Users/matth/AppData/Local/Temp/models.json", encoding="utf-8"))
bdd = json.load(open(r"C:/Users/matth/AppData/Local/Temp/tables_auditable.json", encoding="utf-8"))

bdd_tables = set()
for row in bdd.get("rows", []):
    if isinstance(row, list):
        bdd_tables.add(row[0])

orphans = []
for table in sorted(bdd_tables):
    if table not in models:
        continue
    info = models[table]
    model_cols = set(info["model_cols"])
    missing = []
    if "created_by" not in model_cols:
        missing.append("created_by")
    if "updated_by" not in model_cols:
        missing.append("updated_by")
    if missing:
        orphans.append((table, info["class"], info["file"], missing))

print(f"=== Tables BDD avec created_by/updated_by mais modele incomplet : {len(orphans)} ===\n")
for tbl, cls, fname, miss in orphans:
    print(f"  {tbl} -> {cls} ({fname}) manque : {', '.join(miss)}")
