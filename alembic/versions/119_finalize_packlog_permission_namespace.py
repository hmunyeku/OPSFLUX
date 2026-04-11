"""finalize packlog permission namespace

Revision ID: 119_finalize_packlog_permission_namespace
Revises: 118_add_project_currency
Create Date: 2026-04-11
"""

from collections.abc import Sequence

from alembic import op


revision: str = "119_finalize_packlog_permission_namespace"
down_revision: str | Sequence[str] | None = "118_add_project_currency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PERMISSION_MAP: tuple[tuple[str, str, str], ...] = (
    ("travelwiz.cargo.read", "packlog.cargo.read", "Read cargo requests and cargo items"),
    ("travelwiz.cargo.read_all", "packlog.cargo.read_all", "Read all cargo requests and cargo items"),
    ("travelwiz.cargo.create", "packlog.cargo.create", "Create cargo requests and cargo items"),
    ("travelwiz.cargo.update", "packlog.cargo.update", "Update cargo requests and cargo items"),
    ("travelwiz.cargo.receive", "packlog.cargo.receive", "Receive cargo items and confirm delivery"),
)


def _upsert_permission(new_code: str, description: str) -> None:
    op.execute(
        f"""
        INSERT INTO permissions (code, name, module, description)
        VALUES (
            '{new_code}',
            '{new_code}',
            'packlog',
            '{description}'
        )
        ON CONFLICT (code) DO UPDATE
        SET module = EXCLUDED.module,
            description = COALESCE(permissions.description, EXCLUDED.description)
        """
    )


def _migrate_permission(old_code: str, new_code: str) -> None:
    op.execute(
        f"""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT rp.role_code, '{new_code}'
        FROM role_permissions rp
        WHERE rp.permission_code = '{old_code}'
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        f"""
        INSERT INTO group_permission_overrides (group_id, permission_code, granted)
        SELECT gpo.group_id, '{new_code}', gpo.granted
        FROM group_permission_overrides gpo
        WHERE gpo.permission_code = '{old_code}'
        ON CONFLICT (group_id, permission_code) DO UPDATE
        SET granted = EXCLUDED.granted
        """
    )
    op.execute(
        f"""
        INSERT INTO user_permission_overrides (user_id, permission_code, granted)
        SELECT upo.user_id, '{new_code}', upo.granted
        FROM user_permission_overrides upo
        WHERE upo.permission_code = '{old_code}'
        ON CONFLICT (user_id, permission_code) DO UPDATE
        SET granted = EXCLUDED.granted
        """
    )
    op.execute(f"DELETE FROM role_permissions WHERE permission_code = '{old_code}'")
    op.execute(f"DELETE FROM group_permission_overrides WHERE permission_code = '{old_code}'")
    op.execute(f"DELETE FROM user_permission_overrides WHERE permission_code = '{old_code}'")
    op.execute(f"DELETE FROM permissions WHERE code = '{old_code}'")


def _migrate_workflow_slug() -> None:
    op.execute(
        """
        WITH slug_pairs AS (
            SELECT old.id AS old_id, new.id AS new_id
            FROM workflow_definitions old
            JOIN workflow_definitions new
              ON new.entity_id = old.entity_id
             AND new.slug = 'packlog-cargo-workflow'
            WHERE old.slug = 'travelwiz-cargo-workflow'
        )
        UPDATE workflow_instances wi
        SET workflow_definition_id = slug_pairs.new_id
        FROM slug_pairs
        WHERE wi.workflow_definition_id = slug_pairs.old_id
        """
    )
    op.execute(
        """
        DELETE FROM workflow_definitions old
        USING workflow_definitions new
        WHERE old.slug = 'travelwiz-cargo-workflow'
          AND new.entity_id = old.entity_id
          AND new.slug = 'packlog-cargo-workflow'
        """
    )
    op.execute(
        """
        UPDATE workflow_definitions wd
        SET slug = 'packlog-cargo-workflow',
            name = 'PackLog Cargo Workflow'
        WHERE wd.slug = 'travelwiz-cargo-workflow'
          AND NOT EXISTS (
              SELECT 1
              FROM workflow_definitions existing
              WHERE existing.entity_id = wd.entity_id
                AND existing.slug = 'packlog-cargo-workflow'
          )
        """
    )


def upgrade() -> None:
    for old_code, new_code, description in PERMISSION_MAP:
        _upsert_permission(new_code, description)
        _migrate_permission(old_code, new_code)
    _migrate_workflow_slug()


def downgrade() -> None:
    # This migration intentionally normalizes permissions/workflow ownership to PackLog.
    # Downgrading would require reconstructing deprecated TravelWiz cargo permissions.
    pass
