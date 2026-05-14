"""Phase 3 — Cleanup of deprecated legacy permission codes.

Revision ID: 178_rbac_phase3_cleanup_legacy_codes
Revises: 177_rbac_phase2_role_permissions_matrix
Create Date: 2026-05-14

Final step of the RBAC roadmap. After PR-E (backend require_permission sweep)
and PR-F (frontend permission check sweep), no application code references the
legacy 2-segment codes anymore. This migration:

1. Propagates any remaining (role/group/user, legacy_code) liaisons to
   the namespaced replacement code (idempotent — most have been mirrored
   already by seed_starter_role_matrix at runtime, this is the safety net
   for tenant customizations).
2. Deletes all role_permissions, group_permission_overrides, and
   user_permission_overrides rows that reference a legacy code.
3. Deletes the legacy codes themselves from the permissions table.

After this migration applies AND the app restarts (permission_sync now
translates manifest codes at collection time via DEPRECATED_PERMISSION_MAPPING),
the legacy codes are gone from the system entirely.

Idempotent: re-running the migration finds no legacy codes to clean up and
does nothing (the DELETE WHERE deprecated=true clause is a no-op when the
column is reset to its default).

Safety: the deprecated column was added by migration 175 and populated by
permission_sync._mark_deprecated_permissions(). If the column is missing
(e.g. partial PR-A deploy), the migration is a no-op too.

Conformity: ISO 27001 §A.9.4.1 — Access control policy review.
"""
from alembic import op


# revision identifiers
revision = "178_rbac_phase3_cleanup_legacy_codes"
down_revision = "177_rbac_phase2_role_permissions_matrix"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Propagate any straggler liaisons (safety net) ──
    # For tenant-customized role_permissions / group_permission_overrides /
    # user_permission_overrides that still point to a legacy code, ensure
    # the corresponding namespaced code is also linked.
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT rp.role_code, p.deprecated_for
        FROM role_permissions rp
        JOIN permissions p ON p.code = rp.permission_code
        WHERE p.deprecated = true AND p.deprecated_for IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    op.execute("""
        INSERT INTO group_permission_overrides (group_id, permission_code, granted)
        SELECT gpo.group_id, p.deprecated_for, gpo.granted
        FROM group_permission_overrides gpo
        JOIN permissions p ON p.code = gpo.permission_code
        WHERE p.deprecated = true AND p.deprecated_for IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    op.execute("""
        INSERT INTO user_permission_overrides (user_id, permission_code, granted)
        SELECT upo.user_id, p.deprecated_for, upo.granted
        FROM user_permission_overrides upo
        JOIN permissions p ON p.code = upo.permission_code
        WHERE p.deprecated = true AND p.deprecated_for IS NOT NULL
        ON CONFLICT DO NOTHING
    """)

    # ── 2. Delete liaisons that reference any deprecated (legacy) code ──
    op.execute("""
        DELETE FROM role_permissions
        WHERE permission_code IN (
            SELECT code FROM permissions WHERE deprecated = true
        )
    """)
    op.execute("""
        DELETE FROM group_permission_overrides
        WHERE permission_code IN (
            SELECT code FROM permissions WHERE deprecated = true
        )
    """)
    op.execute("""
        DELETE FROM user_permission_overrides
        WHERE permission_code IN (
            SELECT code FROM permissions WHERE deprecated = true
        )
    """)

    # ── 3. Delete the legacy permission rows themselves ──
    op.execute("""
        DELETE FROM permissions WHERE deprecated = true
    """)


def downgrade():
    # Downgrade is intentionally a no-op. The legacy codes can be reseeded by
    # restarting the application with the previous permission_sync.py version
    # that didn't translate manifest codes (i.e. rolling back permission_sync.py).
    # Recreating them here would conflict with the new permission_sync logic
    # and force the deprecated column to be re-flagged on every startup —
    # cleaner to roll forward than to roll back.
    pass
