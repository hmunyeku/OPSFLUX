"""MOC — types catalogue with template validation matrix + invited validators.

Revision ID: 138_moc_types_invited_validators
Revises: 137_moc_temp_dates_reminders

Introduces:
  * `moc_types` — per-entity catalogue of MOC categories, each with its own
    default validation matrix (e.g. "Modification process", "Dérogation
    temporaire"...). Admins manage them via Settings → MOCtrack.
  * `moc_type_validation_rules` — template rows duplicated onto a new MOC
    when it is created with a given type.
  * `mocs.moc_type_id` FK (nullable — existing MOCs stay typeless).
  * `moc_validations`: add `source`, `invited_by`, `invited_at`; relax the
    unique constraint so multiple users can be invited for the same role.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "138_moc_types_invited_validators"
down_revision = "137_moc_temp_dates_reminders"
branch_labels = None
depends_on = None


MOC_VALIDATION_ROLES = (
    "hse",
    "lead_process",
    "production_manager",
    "gas_manager",
    "maintenance_manager",
    "process_engineer",
    "metier",
)
MOC_VALIDATION_LEVELS = ("DO", "DG", "DO_AND_DG")


def upgrade() -> None:
    # ── moc_types ────────────────────────────────────────────────
    op.create_table(
        "moc_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.UniqueConstraint("entity_id", "code", name="uq_moc_type_entity_code"),
    )
    op.create_index("idx_moc_types_entity", "moc_types", ["entity_id"])

    # ── moc_type_validation_rules ────────────────────────────────
    op.create_table(
        "moc_type_validation_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "moc_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("moc_types.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("metier_code", sa.String(length=40), nullable=True),
        sa.Column("metier_name", sa.String(length=120), nullable=True),
        sa.Column("required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint(
            f"role IN {MOC_VALIDATION_ROLES}",
            name="ck_moc_type_rule_role",
        ),
        sa.CheckConstraint(
            f"level IS NULL OR level IN {MOC_VALIDATION_LEVELS}",
            name="ck_moc_type_rule_level",
        ),
        sa.UniqueConstraint("moc_type_id", "role", "metier_code", name="uq_moc_type_rule_role"),
    )
    op.create_index(
        "idx_moc_type_rules_type", "moc_type_validation_rules", ["moc_type_id"],
    )

    # ── mocs.moc_type_id ────────────────────────────────────────
    op.add_column(
        "mocs",
        sa.Column(
            "moc_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("moc_types.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_mocs_moc_type", "mocs", ["moc_type_id"])

    # ── moc_validations: invited-validator columns + relaxed uniqueness ─
    op.add_column(
        "moc_validations",
        sa.Column("source", sa.String(length=20), server_default="manual", nullable=False),
    )
    op.add_column(
        "moc_validations",
        sa.Column(
            "invited_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "moc_validations",
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Replace (moc_id, role, metier_code) → (moc_id, role, metier_code, validator_id)
    # so multiple invited users can coexist for the same role.
    op.drop_constraint("uq_moc_validation_role", "moc_validations", type_="unique")
    op.create_unique_constraint(
        "uq_moc_validation_role_validator",
        "moc_validations",
        ["moc_id", "role", "metier_code", "validator_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_moc_validation_role_validator", "moc_validations", type_="unique",
    )
    op.create_unique_constraint(
        "uq_moc_validation_role",
        "moc_validations",
        ["moc_id", "role", "metier_code"],
    )
    op.drop_column("moc_validations", "invited_at")
    op.drop_column("moc_validations", "invited_by")
    op.drop_column("moc_validations", "source")

    op.drop_index("idx_mocs_moc_type", table_name="mocs")
    op.drop_column("mocs", "moc_type_id")

    op.drop_index("idx_moc_type_rules_type", table_name="moc_type_validation_rules")
    op.drop_table("moc_type_validation_rules")

    op.drop_index("idx_moc_types_entity", table_name="moc_types")
    op.drop_table("moc_types")
