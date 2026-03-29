"""Remove pax_profiles table — migrate PAX identity to users + tier_contacts.

Add badge_number and pax_group_id to users and tier_contacts.
Convert 8 child tables from pax_id FK to dual FK (user_id + contact_id).
Backfill data from pax_profiles, then drop the table.

Revision ID: 073_remove_pax_profiles
Revises: 072_deleted_at
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "073_remove_pax_profiles"
down_revision = "072_deleted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Step 1: Add PAX fields to users ──────────────────────────────
    op.add_column("users", sa.Column("badge_number", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("pax_group_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_users_pax_group", "users", "pax_groups", ["pax_group_id"], ["id"], ondelete="SET NULL")

    # ── Step 2: Add PAX fields to tier_contacts ──────────────────────
    op.add_column("tier_contacts", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("tier_contacts", sa.Column("nationality", sa.String(100), nullable=True))
    op.add_column("tier_contacts", sa.Column("badge_number", sa.String(100), nullable=True))
    op.add_column("tier_contacts", sa.Column("photo_url", sa.Text(), nullable=True))
    op.add_column("tier_contacts", sa.Column("pax_group_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_tc_pax_group", "tier_contacts", "pax_groups", ["pax_group_id"], ["id"], ondelete="SET NULL")

    # ── Step 3: Add dual FK columns to all 8 child tables ────────────
    child_tables = [
        "pax_credentials",
        "ads_pax",
        "pax_incidents",
        "mission_program_pax",
        "pax_rotation_cycles",
        "stay_programs",
        "pax_profile_types",
    ]
    for table in child_tables:
        op.add_column(table, sa.Column("user_id", UUID(as_uuid=True), nullable=True))
        op.add_column(table, sa.Column("contact_id", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_{table}_user", table, "users", ["user_id"], ["id"])
        op.create_foreign_key(f"fk_{table}_contact", table, "tier_contacts", ["contact_id"], ["id"])

    # manifest_passengers already has pax_profile_id, add user_id + contact_id
    op.add_column("manifest_passengers", sa.Column("user_id", UUID(as_uuid=True), nullable=True))
    op.add_column("manifest_passengers", sa.Column("contact_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_mpax_user", "manifest_passengers", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_mpax_contact", "manifest_passengers", "tier_contacts", ["contact_id"], ["id"])

    # ── Step 4: Backfill — resolve user_id/contact_id from pax_profiles ──
    conn = op.get_bind()

    # 4a: Backfill badge_number from pax_profiles to users
    conn.execute(sa.text("""
        UPDATE users u SET
            badge_number = pp.badge_number,
            pax_group_id = pp.group_id
        FROM pax_profiles pp
        WHERE pp.user_id = u.id AND pp.archived = false
    """))

    # 4b: Backfill tier_contacts from pax_profiles (external PAX)
    conn.execute(sa.text("""
        UPDATE tier_contacts tc SET
            birth_date = COALESCE(tc.birth_date, pp.birth_date),
            nationality = COALESCE(tc.nationality, pp.nationality),
            badge_number = COALESCE(tc.badge_number, pp.badge_number),
            photo_url = COALESCE(tc.photo_url, pp.photo_url),
            pax_group_id = COALESCE(tc.pax_group_id, pp.group_id)
        FROM pax_profiles pp
        WHERE pp.company_id = tc.tier_id
          AND LOWER(TRIM(pp.first_name)) = LOWER(TRIM(tc.first_name))
          AND LOWER(TRIM(pp.last_name)) = LOWER(TRIM(tc.last_name))
          AND pp.user_id IS NULL
          AND pp.archived = false
    """))

    # 4c: For each child table, set user_id from pax_profiles.user_id
    for table in child_tables:
        conn.execute(sa.text(f"""
            UPDATE {table} t SET user_id = pp.user_id
            FROM pax_profiles pp
            WHERE pp.id = t.pax_id AND pp.user_id IS NOT NULL
        """))

    # 4d: For each child table, resolve contact_id via name matching
    for table in child_tables:
        conn.execute(sa.text(f"""
            UPDATE {table} t SET contact_id = tc.id
            FROM pax_profiles pp
            JOIN tier_contacts tc ON tc.tier_id = pp.company_id
              AND LOWER(TRIM(tc.first_name)) = LOWER(TRIM(pp.first_name))
              AND LOWER(TRIM(tc.last_name)) = LOWER(TRIM(pp.last_name))
            WHERE pp.id = t.pax_id AND pp.user_id IS NULL
              AND t.user_id IS NULL
        """))

    # 4e: manifest_passengers — same backfill
    conn.execute(sa.text("""
        UPDATE manifest_passengers mp SET user_id = pp.user_id
        FROM pax_profiles pp
        WHERE pp.id = mp.pax_profile_id AND pp.user_id IS NOT NULL
    """))
    conn.execute(sa.text("""
        UPDATE manifest_passengers mp SET contact_id = tc.id
        FROM pax_profiles pp
        JOIN tier_contacts tc ON tc.tier_id = pp.company_id
          AND LOWER(TRIM(tc.first_name)) = LOWER(TRIM(pp.first_name))
          AND LOWER(TRIM(tc.last_name)) = LOWER(TRIM(pp.last_name))
        WHERE pp.id = mp.pax_profile_id AND pp.user_id IS NULL
          AND mp.user_id IS NULL
    """))

    # 4f: Migrate polymorphic records (tags, attachments, notes)
    for poly_table in ["tags", "attachments", "notes"]:
        # Internal PAX → owner_type = 'user', owner_id = users.id
        conn.execute(sa.text(f"""
            UPDATE {poly_table} p SET owner_type = 'user', owner_id = pp.user_id::text
            FROM pax_profiles pp
            WHERE p.owner_type = 'pax_profile'
              AND p.owner_id::text = pp.id::text
              AND pp.user_id IS NOT NULL
        """))
        # External PAX → owner_type = 'tier_contact', resolve contact_id
        conn.execute(sa.text(f"""
            UPDATE {poly_table} p SET owner_type = 'tier_contact', owner_id = tc.id::text
            FROM pax_profiles pp
            JOIN tier_contacts tc ON tc.tier_id = pp.company_id
              AND LOWER(TRIM(tc.first_name)) = LOWER(TRIM(pp.first_name))
              AND LOWER(TRIM(tc.last_name)) = LOWER(TRIM(pp.last_name))
            WHERE p.owner_type = 'pax_profile'
              AND p.owner_id::text = pp.id::text
              AND pp.user_id IS NULL
        """))

    # ── Step 5: Drop old FK constraints and pax_id columns ───────────

    # Drop old unique constraints that reference pax_id
    # pax_credentials: uq_pax_credential (pax_id, credential_type_id)
    op.execute("ALTER TABLE pax_credentials DROP CONSTRAINT IF EXISTS uq_pax_credential")
    op.execute("ALTER TABLE ads_pax DROP CONSTRAINT IF EXISTS uq_ads_pax")
    op.execute("ALTER TABLE pax_profile_types DROP CONSTRAINT IF EXISTS uq_pax_profile_type")
    op.execute("ALTER TABLE mission_program_pax DROP CONSTRAINT IF EXISTS uq_mission_program_pax")

    # Drop FK constraints on pax_id
    for table in child_tables:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {table}_pax_id_fkey")
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_pax_id")

    # Drop pax_id columns
    for table in child_tables:
        op.drop_column(table, "pax_id")

    # manifest_passengers: drop pax_profile_id
    op.execute("ALTER TABLE manifest_passengers DROP CONSTRAINT IF EXISTS manifest_passengers_pax_profile_id_fkey")
    op.execute("ALTER TABLE manifest_passengers DROP CONSTRAINT IF EXISTS fk_manifest_passengers_pax_profile_id")
    op.drop_column("manifest_passengers", "pax_profile_id")

    # ── Step 6: Add XOR check constraints ────────────────────────────
    for table in child_tables:
        if table == "pax_incidents":
            # Incidents: allow both NULL (company-level)
            op.create_check_constraint(
                f"ck_{table}_pax_xor",
                table,
                "NOT (user_id IS NOT NULL AND contact_id IS NOT NULL)",
            )
        else:
            op.create_check_constraint(
                f"ck_{table}_pax_xor",
                table,
                "(user_id IS NOT NULL AND contact_id IS NULL) OR (user_id IS NULL AND contact_id IS NOT NULL)",
            )

    # manifest_passengers: allow both NULL (walk-on passengers)
    op.create_check_constraint(
        "ck_manifest_passengers_pax_xor",
        "manifest_passengers",
        "NOT (user_id IS NOT NULL AND contact_id IS NOT NULL)",
    )

    # ── Step 7: Add new unique constraints ───────────────────────────
    op.create_unique_constraint("uq_cred_user", "pax_credentials", ["user_id", "credential_type_id"])
    op.create_unique_constraint("uq_cred_contact", "pax_credentials", ["contact_id", "credential_type_id"])
    op.create_unique_constraint("uq_adspax_user", "ads_pax", ["ads_id", "user_id"])
    op.create_unique_constraint("uq_adspax_contact", "ads_pax", ["ads_id", "contact_id"])
    op.create_unique_constraint("uq_mppax_user", "mission_program_pax", ["mission_program_id", "user_id"])
    op.create_unique_constraint("uq_mppax_contact", "mission_program_pax", ["mission_program_id", "contact_id"])
    op.create_unique_constraint("uq_ppt_user", "pax_profile_types", ["user_id", "profile_type_id"])
    op.create_unique_constraint("uq_ppt_contact", "pax_profile_types", ["contact_id", "profile_type_id"])

    # ── Step 8: Drop pax_profiles table ──────────────────────────────
    op.drop_table("pax_profiles")


def downgrade() -> None:
    # Recreate pax_profiles is complex — for dev, just raise
    raise NotImplementedError("Downgrade not supported for pax_profiles removal. Restore from backup.")
