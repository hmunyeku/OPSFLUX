"""Compliance rules V2: versioning, constraints, history table.

Adds versioning, effective dates, per-rule constraint overrides,
and a full audit history table for compliance rules.

Revision ID: 053
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
from alembic import op

revision = "053"
down_revision = "052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend compliance_rules with V2 fields ──
    op.add_column("compliance_rules", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    op.add_column("compliance_rules", sa.Column("effective_from", sa.Date(), nullable=True))
    op.add_column("compliance_rules", sa.Column("effective_to", sa.Date(), nullable=True))
    op.add_column("compliance_rules", sa.Column("superseded_by", UUID(as_uuid=True), nullable=True))
    op.add_column("compliance_rules", sa.Column("change_reason", sa.String(500), nullable=True))
    op.add_column("compliance_rules", sa.Column("changed_by", UUID(as_uuid=True), nullable=True))

    # Per-rule constraint overrides
    op.add_column("compliance_rules", sa.Column("override_validity_days", sa.Integer(), nullable=True))
    op.add_column("compliance_rules", sa.Column("grace_period_days", sa.Integer(), nullable=True))
    op.add_column("compliance_rules", sa.Column("renewal_reminder_days", sa.Integer(), nullable=True))
    op.add_column("compliance_rules", sa.Column("priority", sa.String(20), server_default="normal", nullable=False))
    op.add_column("compliance_rules", sa.Column("condition_json", JSONB(), nullable=True))

    # FK for changed_by → users
    op.create_foreign_key(
        "fk_compliance_rules_changed_by",
        "compliance_rules", "users",
        ["changed_by"], ["id"],
        ondelete="SET NULL",
    )
    # FK for superseded_by → compliance_rules (self-referential)
    op.create_foreign_key(
        "fk_compliance_rules_superseded_by",
        "compliance_rules", "compliance_rules",
        ["superseded_by"], ["id"],
        ondelete="SET NULL",
    )

    # ── Create compliance_rule_history table ──
    op.create_table(
        "compliance_rule_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rule_id", UUID(as_uuid=True), sa.ForeignKey("compliance_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),  # created, updated, archived, restored
        sa.Column("snapshot", JSONB(), nullable=False),  # full state of the rule at this point
        sa.Column("change_reason", sa.String(500), nullable=True),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_rule_history_rule_id", "compliance_rule_history", ["rule_id"])
    op.create_index("idx_rule_history_changed_at", "compliance_rule_history", ["changed_at"])


def downgrade() -> None:
    op.drop_table("compliance_rule_history")

    op.drop_constraint("fk_compliance_rules_superseded_by", "compliance_rules", type_="foreignkey")
    op.drop_constraint("fk_compliance_rules_changed_by", "compliance_rules", type_="foreignkey")

    op.drop_column("compliance_rules", "condition_json")
    op.drop_column("compliance_rules", "priority")
    op.drop_column("compliance_rules", "renewal_reminder_days")
    op.drop_column("compliance_rules", "grace_period_days")
    op.drop_column("compliance_rules", "override_validity_days")
    op.drop_column("compliance_rules", "changed_by")
    op.drop_column("compliance_rules", "change_reason")
    op.drop_column("compliance_rules", "superseded_by")
    op.drop_column("compliance_rules", "effective_to")
    op.drop_column("compliance_rules", "effective_from")
    op.drop_column("compliance_rules", "version")
