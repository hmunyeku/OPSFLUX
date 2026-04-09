"""Drop legacy tables, migrate assets FK → ar_installations, drop assets.

1. Seed ar_* hierarchy (field → site → installation) reusing asset UUIDs
2. Migrate all FK constraints from assets → ar_installations
3. Drop 11 empty legacy tables + the assets table

Revision ID: 069
Revises: 068
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "069"
down_revision = "068"
branch_labels = None
depends_on = None

# ── The 5 existing asset records ───────────────────────────────────
ENTITY_ID = "2f31924f-6328-4a06-a858-1d63dc46a448"

# New parent UUIDs (deterministic for reproducibility)
FIELD_ID = "00000000-0001-4000-8000-000000000001"
SITE_EBOME_ID = "00000000-0002-4000-8000-000000000001"
SITE_MUNJA_ID = "00000000-0002-4000-8000-000000000002"
SITE_WOURI_ID = "00000000-0002-4000-8000-000000000003"

# Old asset UUIDs → reused as ar_installations IDs
EBOME_ID = "3ae0a97f-d7e6-4fb4-ade1-267a62a483b6"
ESF1_ID = "8dd319f7-841b-4776-94ae-7fe12caeb07a"
KLF3_ID = "cdc9bad3-a361-4bea-b449-cce45100c9b7"
MUNJA_ID = "a57f2337-aa19-42b4-a6ea-7f21b7d9356e"
WOURI_ID = "599ed29c-1bb0-416b-b317-79f207018a9b"


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # STEP 1 — Drop empty legacy tables (dependency order)
    # ══════════════════════════════════════════════════════════════
    op.drop_table("deck_layout_items")
    op.drop_table("deck_layouts")
    op.drop_table("dcs_tags")
    op.drop_table("asset_capacities")
    op.drop_table("crane_lifting_charts")
    op.drop_table("activity_recurrence_rules")
    op.drop_table("asset_type_configs")
    op.drop_table("process_lib_items")
    op.drop_table("process_lines")

    # equipment has FK to assets — drop it before assets
    op.drop_table("equipment")
    # platform_decks is referenced by assets.deck_id — drop FK first
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_deck_id_fkey")
    op.drop_table("platform_decks")

    # ══════════════════════════════════════════════════════════════
    # STEP 2 — Seed ar_* hierarchy (field → sites → installations)
    # ══════════════════════════════════════════════════════════════

    # -- Field: Perenco Cameroon Operations (skip if entity doesn't exist)
    op.execute(f"""
        INSERT INTO ar_fields (id, entity_id, code, name, country, operator, environment, status)
        SELECT '{FIELD_ID}', '{ENTITY_ID}', 'PCM', 'Perenco Cameroon', 'CM', 'Perenco', 'OFFSHORE', 'OPERATIONAL'
        WHERE EXISTS (SELECT 1 FROM entities WHERE id = '{ENTITY_ID}')
        ON CONFLICT (id) DO NOTHING
    """)

    # -- Sites (skip if entity/field doesn't exist)
    for site_id, code, name, stype, env in [
        (SITE_EBOME_ID, 'EBOME', 'Site Ebome', 'PRODUCTION', 'OFFSHORE'),
        (SITE_MUNJA_ID, 'MUNJA', 'Site Munja', 'PRODUCTION', 'ONSHORE'),
        (SITE_WOURI_ID, 'WOURI', 'Base Wouri', 'SHORE_BASE', 'ONSHORE'),
    ]:
        op.execute(f"""
            INSERT INTO ar_sites (id, entity_id, field_id, code, name, site_type, environment, country, manned, status)
            SELECT '{site_id}', '{ENTITY_ID}', '{FIELD_ID}', '{code}', '{name}', '{stype}', '{env}', 'CM', true, 'OPERATIONAL'
            WHERE EXISTS (SELECT 1 FROM ar_fields WHERE id = '{FIELD_ID}')
            ON CONFLICT (id) DO NOTHING
        """)

    # -- Installations (reuse OLD asset UUIDs so existing FKs still resolve)
    for inst_id, site_id, code, name, itype, env in [
        (EBOME_ID, SITE_EBOME_ID, 'EBOME', 'Champ Ebome', 'CPF', 'OFFSHORE'),
        (ESF1_ID,  SITE_EBOME_ID, 'ESF1',  'Plateforme ESF1', 'FIXED_PLATFORM', 'OFFSHORE'),
        (KLF3_ID,  SITE_EBOME_ID, 'KLF3',  'Plateforme KLF3', 'FIXED_PLATFORM', 'OFFSHORE'),
        (MUNJA_ID, SITE_MUNJA_ID, 'MUNJA', 'Munja', 'ONSHORE_PLANT', 'ONSHORE'),
        (WOURI_ID, SITE_WOURI_ID, 'WOURI', 'Base Logistique Wouri', 'ONSHORE_PLANT', 'ONSHORE'),
    ]:
        op.execute(f"""
            INSERT INTO ar_installations (id, entity_id, site_id, code, name, installation_type, environment, status, is_manned)
            SELECT '{inst_id}', '{ENTITY_ID}', '{site_id}', '{code}', '{name}', '{itype}', '{env}', 'OPERATIONAL', true
            WHERE EXISTS (SELECT 1 FROM ar_sites WHERE id = '{site_id}')
            ON CONFLICT (id) DO NOTHING
        """)

    # ══════════════════════════════════════════════════════════════
    # STEP 3 — Migrate FK constraints: assets → ar_installations
    # ══════════════════════════════════════════════════════════════

    # -- ads (3 FK columns)
    _migrate_fk("ads", "site_entry_asset_id", "ads_site_entry_asset_id_fkey")
    _migrate_fk("ads", "outbound_departure_base_id", "ads_outbound_departure_base_id_fkey")
    _migrate_fk("ads", "return_departure_base_id", "ads_return_departure_base_id_fkey")

    # -- ads_pax
    _migrate_fk("ads_pax", "disembark_asset_id", "fk_ads_pax_disembark_asset")

    # -- pax_incidents
    _migrate_fk("pax_incidents", "asset_id", "pax_incidents_asset_id_fkey")

    # -- pax_rotation_cycles
    _migrate_fk("pax_rotation_cycles", "site_asset_id", "pax_rotation_cycles_site_asset_id_fkey")

    # -- mission_programs
    _migrate_fk("mission_programs", "site_asset_id", "mission_programs_site_asset_id_fkey")

    # -- compliance_matrix
    _migrate_fk("compliance_matrix", "asset_id", "compliance_matrix_asset_id_fkey")

    # -- planner_activities (2 FK columns)
    _migrate_fk("planner_activities", "asset_id", "planner_activities_asset_id_fkey")
    _migrate_fk("planner_activities", "equipment_asset_id", "fk_planner_activities_equipment_asset")

    # -- planner_conflicts
    _migrate_fk("planner_conflicts", "asset_id", "planner_conflicts_asset_id_fkey")

    # -- transport_vectors
    _migrate_fk("transport_vectors", "home_base_id", "transport_vectors_home_base_id_fkey")

    # -- transport_rotations
    _migrate_fk("transport_rotations", "departure_base_id", "transport_rotations_departure_base_id_fkey")

    # -- voyages
    _migrate_fk("voyages", "departure_base_id", "voyages_departure_base_id_fkey")

    # -- voyage_stops
    _migrate_fk("voyage_stops", "asset_id", "voyage_stops_asset_id_fkey")

    # -- voyage_events
    _migrate_fk("voyage_events", "asset_id", "voyage_events_asset_id_fkey")

    # -- cargo_items (2 FK columns)
    _migrate_fk("cargo_items", "destination_asset_id", "cargo_items_destination_asset_id_fkey")
    _migrate_fk("cargo_items", "current_location_asset_id", "fk_cargo_items_current_location_asset")

    # -- pickup_stops
    _migrate_fk("pickup_stops", "asset_id", "pickup_stops_asset_id_fkey")

    # -- weather_data
    _migrate_fk("weather_data", "asset_id", "weather_data_asset_id_fkey")

    # -- projects
    _migrate_fk("projects", "asset_id", "projects_asset_id_fkey")

    # -- user_groups
    _migrate_fk("user_groups", "asset_scope", "user_groups_asset_scope_fkey")

    # ══════════════════════════════════════════════════════════════
    # STEP 4 — Drop the assets table
    # ══════════════════════════════════════════════════════════════

    # Drop self-referential FKs
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_parent_id_fkey")
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_connected_asset_id_fkey")
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_update_assets_updated_at ON assets")
    # Drop the table
    op.drop_table("assets")


def _migrate_fk(table: str, column: str, old_constraint: str) -> None:
    """Drop old FK to assets, add new FK to ar_installations."""
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {old_constraint}")
    op.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {old_constraint} "
        f"FOREIGN KEY ({column}) REFERENCES ar_installations(id)"
    )


def downgrade() -> None:
    # This migration is not reversible — the assets table and legacy data are gone.
    raise NotImplementedError("Cannot reverse: legacy assets table has been dropped")
