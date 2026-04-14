"""Cargo scan events: GPS-stamped scan log for package tracking.

Revision ID: 130_cargo_scan_events
Revises: 129_schema_drift_travelwiz
Create Date: 2026-04-14

Every time a mobile operator scans a cargo label, we capture the
scanner's GPS position and compare it against the nearest
ar_installation to auto-suggest the cargo's current location. Scan
events feed the package tracking timeline (DHL-style "arrived at
depot X") and are the source of truth for status transitions done via
scan rather than via desktop UI.

Also seeds the ``packlog.scan_radius_m`` tenant-level Setting
(default: 500m) that controls how far a scan can be from an
installation to still be "matched".
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "130_cargo_scan_events"
down_revision = "129_schema_drift_travelwiz"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cargo_scan_events",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "entity_id",
            UUID(as_uuid=True),
            sa.ForeignKey("entities.id"),
            nullable=False,
        ),
        sa.Column(
            "cargo_item_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cargo_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("accuracy_m", sa.Float, nullable=True),
        sa.Column(
            "matched_asset_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ar_installations.id"),
            nullable=True,
        ),
        sa.Column("matched_distance_m", sa.Float, nullable=True),
        sa.Column(
            "confirmed_asset_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ar_installations.id"),
            nullable=True,
        ),
        sa.Column("status_before", sa.String(40), nullable=True),
        sa.Column("status_after", sa.String(40), nullable=True),
        sa.Column("action", sa.String(40), nullable=False, server_default="scan"),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("device_id", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_cargo_scan_events_cargo", "cargo_scan_events", ["cargo_item_id"]
    )
    op.create_index(
        "idx_cargo_scan_events_scanned_at", "cargo_scan_events", ["scanned_at"]
    )
    op.create_index(
        "idx_cargo_scan_events_user", "cargo_scan_events", ["user_id"]
    )

    # Seed tenant-level default radius (idempotent — insert only if absent).
    op.execute(
        """
        INSERT INTO settings (id, key, value, scope, scope_id, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            'packlog.scan_radius_m',
            '500'::jsonb,
            'tenant',
            NULL,
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM settings
            WHERE key = 'packlog.scan_radius_m' AND scope = 'tenant'
        )
        """
    )


def downgrade() -> None:
    op.drop_index("idx_cargo_scan_events_user", table_name="cargo_scan_events")
    op.drop_index("idx_cargo_scan_events_scanned_at", table_name="cargo_scan_events")
    op.drop_index("idx_cargo_scan_events_cargo", table_name="cargo_scan_events")
    op.drop_table("cargo_scan_events")
    op.execute(
        "DELETE FROM settings WHERE key = 'packlog.scan_radius_m' AND scope = 'tenant'"
    )
