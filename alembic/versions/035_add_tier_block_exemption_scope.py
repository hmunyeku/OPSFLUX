"""Add tier scope, incoterm fields, is_blocked flag, tier_blocks and compliance_exemptions tables.

- tiers.is_blocked (Boolean, default false)
- tiers.incoterm (String 20, nullable)
- tiers.incoterm_city (String 100, nullable)
- tiers.scope (String 20, default 'local', not null)
- tier_blocks table (block/unblock history)
- compliance_exemptions table (exemption workflow)

Revision ID: 035
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- tiers.is_blocked --
    op.add_column(
        "tiers",
        sa.Column(
            "is_blocked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # -- tiers.incoterm --
    op.add_column(
        "tiers",
        sa.Column(
            "incoterm",
            sa.String(20),
            nullable=True,
        ),
    )

    # -- tiers.incoterm_city --
    op.add_column(
        "tiers",
        sa.Column(
            "incoterm_city",
            sa.String(100),
            nullable=True,
        ),
    )

    # -- tiers.scope --
    op.add_column(
        "tiers",
        sa.Column(
            "scope",
            sa.String(20),
            nullable=False,
            server_default="local",
        ),
    )

    # -- tier_blocks table --
    op.create_table(
        "tier_blocks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tier_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tiers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("block_type", sa.String(20), nullable=False, server_default="purchasing"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("performed_by", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # -- compliance_exemptions table --
    op.create_table(
        "compliance_exemptions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("compliance_record_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("compliance_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("approved_by", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("conditions", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("compliance_exemptions")
    op.drop_table("tier_blocks")
    op.drop_column("tiers", "scope")
    op.drop_column("tiers", "incoterm_city")
    op.drop_column("tiers", "incoterm")
    op.drop_column("tiers", "is_blocked")
