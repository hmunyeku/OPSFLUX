"""Quick script to run the migration SQL directly using psycopg v3 (sync)."""
import psycopg

conn = psycopg.connect(
    "host=localhost port=5432 dbname=opsflux user=opsflux password=opsflux_dev",
    autocommit=True,
)
cur = conn.cursor()

print("=== Running migration 011_enrich_tiers_contacts ===")

# ── Tier: new columns ──
for col, col_type in [
    ("alias", "VARCHAR(200)"),
    ("website", "VARCHAR(500)"),
    ("legal_form", "VARCHAR(100)"),
    ("capital", "DOUBLE PRECISION"),
    ("currency", "VARCHAR(10) NOT NULL DEFAULT 'XAF'"),
    ("industry", "VARCHAR(100)"),
    ("payment_terms", "VARCHAR(100)"),
    ("description", "TEXT"),
]:
    cur.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name='tiers' AND column_name=%s",
        (col,),
    )
    if not cur.fetchone():
        sql = f"ALTER TABLE tiers ADD COLUMN {col} {col_type}"
        print(f"  + {sql}")
        cur.execute(sql)
    else:
        print(f"  = tiers.{col} exists")

# ── TierContact: new columns ──
for col, col_type in [
    ("civility", "VARCHAR(20)"),
    ("department", "VARCHAR(100)"),
]:
    cur.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name='tier_contacts' AND column_name=%s",
        (col,),
    )
    if not cur.fetchone():
        sql = f"ALTER TABLE tier_contacts ADD COLUMN {col} {col_type}"
        print(f"  + {sql}")
        cur.execute(sql)
    else:
        print(f"  = tier_contacts.{col} exists")

# ── Index on tier_contacts.tier_id ──
cur.execute("SELECT 1 FROM pg_indexes WHERE indexname='idx_tier_contacts_tier'")
if not cur.fetchone():
    print("  + CREATE INDEX idx_tier_contacts_tier")
    cur.execute("CREATE INDEX idx_tier_contacts_tier ON tier_contacts (tier_id)")
else:
    print("  = idx_tier_contacts_tier exists")

# ── TierIdentifier table ──
cur.execute("SELECT 1 FROM information_schema.tables WHERE table_name='tier_identifiers'")
if not cur.fetchone():
    print("  + CREATE TABLE tier_identifiers")
    cur.execute("""
        CREATE TABLE tier_identifiers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tier_id UUID NOT NULL REFERENCES tiers(id),
            type VARCHAR(50) NOT NULL,
            value VARCHAR(200) NOT NULL,
            country VARCHAR(100),
            issued_at VARCHAR(20),
            expires_at VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    cur.execute("CREATE INDEX idx_tier_identifiers_tier ON tier_identifiers (tier_id)")
else:
    print("  = tier_identifiers table exists")

# ── Update alembic version ──
cur.execute("SELECT version_num FROM alembic_version")
current = cur.fetchone()
print(f"  Alembic version: {current}")
if current and current[0] != "011_enrich_tiers_contacts":
    cur.execute("UPDATE alembic_version SET version_num='011_enrich_tiers_contacts'")
    print("  -> Updated to 011_enrich_tiers_contacts")

cur.close()
conn.close()
print("=== Done ===")
