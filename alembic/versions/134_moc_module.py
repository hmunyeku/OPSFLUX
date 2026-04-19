"""MOCTrack module — create mocs, moc_status_history, moc_validations.

Revision ID: 134_moc_module
Revises: 133_kmz_import_external_id

Implements CDC rev 00 (PERENCO Cameroun) — Digitalisation du suivi des MOCs.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "134_moc_module"
down_revision = "133_kmz_import_external_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── mocs ───────────────────────────────────────────────────────────────
    op.create_table(
        "mocs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("reference", sa.String(length=60), nullable=False),
        # Initiator
        sa.Column("initiator_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("initiator_name", sa.String(length=200), nullable=True),
        sa.Column("initiator_function", sa.String(length=200), nullable=True),
        # Location
        sa.Column("site_label", sa.String(length=100), nullable=False),
        sa.Column("site_id", UUID(as_uuid=True), sa.ForeignKey("ar_sites.id", ondelete="SET NULL"), nullable=True),
        sa.Column("platform_code", sa.String(length=60), nullable=False),
        sa.Column("installation_id", UUID(as_uuid=True), sa.ForeignKey("ar_installations.id", ondelete="SET NULL"), nullable=True),
        # Content
        sa.Column("objectives", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("current_situation", sa.Text(), nullable=True),
        sa.Column("proposed_changes", sa.Text(), nullable=True),
        sa.Column("impact_analysis", sa.Text(), nullable=True),
        sa.Column("modification_type", sa.String(length=20), nullable=True),
        sa.Column("temporary_duration_days", sa.Integer(), nullable=True),
        # Hierarchy review
        sa.Column("is_real_change", sa.Boolean(), nullable=True),
        sa.Column("hierarchy_reviewer_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("hierarchy_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hierarchy_review_comment", sa.Text(), nullable=True),
        # Site chief
        sa.Column("site_chief_approved", sa.Boolean(), nullable=True),
        sa.Column("site_chief_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("site_chief_approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("site_chief_comment", sa.Text(), nullable=True),
        # Director
        sa.Column("director_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("director_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("director_comment", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=1), nullable=True),
        # Study
        sa.Column("lead_process_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("responsible_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("study_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("study_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_cost_mxaf", sa.Numeric(12, 2), nullable=True),
        sa.Column("cost_bucket", sa.String(length=20), nullable=True),
        # Flags
        sa.Column("hazop_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("hazop_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("hazid_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("hazid_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("environmental_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("environmental_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("pid_update_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("pid_update_completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("esd_update_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("esd_update_completed", sa.Boolean(), server_default="false", nullable=False),
        # Execution
        sa.Column("execution_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_supervisor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        # Status
        sa.Column("status", sa.String(length=30), server_default="created", nullable=False),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        # Dates
        sa.Column("planned_implementation_date", sa.Date(), nullable=True),
        sa.Column("actual_implementation_date", sa.Date(), nullable=True),
        # Extras
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.CheckConstraint(
            "status IN ('created','approved','submitted_to_confirm','cancelled',"
            "'stand_by','approved_to_study','under_study','study_in_validation',"
            "'validated','execution','executed_docs_pending','closed')",
            name="ck_moc_status",
        ),
        sa.CheckConstraint(
            "modification_type IS NULL OR modification_type IN ('permanent','temporary')",
            name="ck_moc_modification_type",
        ),
        sa.CheckConstraint(
            "priority IS NULL OR priority IN ('1','2','3')",
            name="ck_moc_priority",
        ),
        sa.CheckConstraint(
            "cost_bucket IS NULL OR cost_bucket IN ('lt_20','20_to_50','50_to_100','gt_100')",
            name="ck_moc_cost_bucket",
        ),
        sa.UniqueConstraint("entity_id", "reference", name="uq_moc_entity_reference"),
    )
    op.create_index("idx_mocs_entity", "mocs", ["entity_id"])
    op.create_index("idx_mocs_status", "mocs", ["entity_id", "status"])
    op.create_index("idx_mocs_site", "mocs", ["entity_id", "site_id"])
    op.create_index("idx_mocs_installation", "mocs", ["entity_id", "installation_id"])
    op.create_index("idx_mocs_initiator", "mocs", ["initiator_id"])
    op.create_index("idx_mocs_created", "mocs", ["entity_id", "created_at"])

    # ── moc_status_history ────────────────────────────────────────────────
    op.create_table(
        "moc_status_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("moc_id", UUID(as_uuid=True), sa.ForeignKey("mocs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=False),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_moc_status_history_moc", "moc_status_history", ["moc_id"])

    # ── moc_validations ───────────────────────────────────────────────────
    op.create_table(
        "moc_validations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("moc_id", UUID(as_uuid=True), sa.ForeignKey("mocs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("metier_code", sa.String(length=40), nullable=True),
        sa.Column("required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("completed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=True),
        sa.Column("validator_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validator_name", sa.String(length=200), nullable=True),
        sa.Column("level", sa.String(length=20), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('hse','lead_process','production_manager','gas_manager',"
            "'maintenance_manager','metier')",
            name="ck_moc_validation_role",
        ),
        sa.CheckConstraint(
            "level IS NULL OR level IN ('DO','DG','DO_AND_DG')",
            name="ck_moc_validation_level",
        ),
        sa.UniqueConstraint("moc_id", "role", "metier_code", name="uq_moc_validation_role"),
    )
    op.create_index("idx_moc_validations_moc", "moc_validations", ["moc_id"])


def downgrade() -> None:
    op.drop_index("idx_moc_validations_moc", table_name="moc_validations")
    op.drop_table("moc_validations")
    op.drop_index("idx_moc_status_history_moc", table_name="moc_status_history")
    op.drop_table("moc_status_history")
    for idx in (
        "idx_mocs_created", "idx_mocs_initiator", "idx_mocs_installation",
        "idx_mocs_site", "idx_mocs_status", "idx_mocs_entity",
    ):
        op.drop_index(idx, table_name="mocs")
    op.drop_table("mocs")
