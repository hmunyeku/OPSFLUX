"""Compare modeles SQLAlchemy declares vs colonnes presentes en BDD."""
import json

# Load both
models = json.load(open(r'C:/Users/matth/AppData/Local/Temp/models.json', encoding='utf-8'))
bdd_dump = json.load(open(r'C:/Users/matth/AppData/Local/Temp/bdd_cols.json', encoding='utf-8'))

# Build BDD : table -> set of columns
bdd = {}
for row in bdd_dump.get('rows', []):
    if isinstance(row, list) and len(row) >= 2:
        tbl, col = row[0], row[1]
        bdd.setdefault(tbl, set()).add(col)

# Compare
missing_in_db = []  # model declared but missing in BDD = BUG
orphaned_in_db = []  # in BDD but not in model = stale
table_not_in_db = []  # table declared in model but not in BDD

for table, info in models.items():
    model_cols = set(info['model_cols'])
    if table not in bdd:
        table_not_in_db.append((table, info['class'], info['file']))
        continue
    db_cols = bdd[table]
    miss = model_cols - db_cols
    orph = db_cols - model_cols
    if miss:
        missing_in_db.append((table, info['class'], sorted(miss)))
    if orph:
        # Filtre les colonnes 'standard' qui sont des FK des modeles
        # parent et qu'on n'a pas pu detecter via le regex Mapped[]
        orphaned_in_db.append((table, info['class'], sorted(orph)))

print(f'=== Tables declarees dans modeles mais absentes en BDD : {len(table_not_in_db)}')
for t, c, f in table_not_in_db[:20]:
    print(f'  {t} ({c} dans {f})')

print()
print(f'=== Colonnes MODELE mais MANQUANTES en BDD (vrais bugs) : {len(missing_in_db)}')
for t, c, cols in missing_in_db[:50]:
    print(f'  {t} ({c}) : {", ".join(cols)}')

print()
print(f'=== Colonnes BDD mais pas declarees en modele (potentiellement OK si detectees a posteriori) : {len(orphaned_in_db)}')
# Cas frequent : FK columns nommes par convention SQLAlchemy
for t, c, cols in orphaned_in_db[:10]:
    print(f'  {t} ({c}) : {", ".join(cols[:5])}')
