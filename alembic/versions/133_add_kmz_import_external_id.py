"""Add external_id to asset registry entities + ar_import_runs table for KMZ import idempotency & rollback.

Supports ADR 003: round-trip with ArcGIS globalid, idempotent re-imports,
and bulk rollback of a specific import run.

Revision ID: 133_kmz_import_external_id
Down revision: 132_planner_scenario_reference
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "133_kmz_import_external_id"
down_revision = "132_planner_scenario_reference"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # External identity — the canonical stable ID from the source system
    # (ArcGIS globalid). Lets us upsert on re-import instead of duplicating.
    for table in ("ar_sites", "ar_installations", "ar_equipment", "ar_pipelines"):
        op.add_column(table, sa.Column("external_id", sa.String(length=100), nullable=True))
        op.create_index(f"idx_{table}_external_id", table, ["entity_id", "external_id"])

    # Import run ledger — one row per KMZ import. Used for report display
    # and rollback (soft-delete everything a given run created).
    op.create_table(
        "ar_import_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("field_id", UUID(as_uuid=True), sa.ForeignKey("ar_fields.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("source_filename", sa.String(length=255), nullable=True),
        sa.Column("document_name", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="completed", nullable=False),
        sa.Column("report", JSONB(), nullable=True),
        sa.Column("created_installation_ids", JSONB(), server_default="[]", nullable=False),
        sa.Column("created_equipment_ids", JSONB(), server_default="[]", nullable=False),
        sa.Column("created_pipeline_ids", JSONB(), server_default="[]", nullable=False),
        sa.Column("created_site_ids", JSONB(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_ar_import_runs_entity", "ar_import_runs", ["entity_id"])
    op.create_index("idx_ar_import_runs_field", "ar_import_runs", ["field_id"])


def downgrade() -> None:
    op.drop_index("idx_ar_import_runs_field", table_name="ar_import_runs")
    op.drop_index("idx_ar_import_runs_entity", table_name="ar_import_runs")
    op.drop_table("ar_import_runs")
    for table in ("ar_sites", "ar_installations", "ar_equipment", "ar_pipelines"):
        op.drop_index(f"idx_{table}_external_id", table_name=table)
        op.drop_column(table, "external_id")
