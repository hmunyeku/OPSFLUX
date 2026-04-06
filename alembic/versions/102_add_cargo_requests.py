"""add cargo requests

Revision ID: 102_add_cargo_requests
Revises: 101_add_cargo_attachment_evidence
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "102_add_cargo_requests"
down_revision = "101_add_cargo_attachment_evidence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cargo_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_code", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="draft"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("imputation_reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sender_tier_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("receiver_name", sa.String(length=200), nullable=True),
        sa.Column("destination_asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("requester_name", sa.String(length=200), nullable=True),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["destination_asset_id"], ["ar_installations.id"]),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["imputation_reference_id"], ["imputation_references.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["sender_tier_id"], ["tiers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_code", name="uq_cargo_request_code"),
    )
    op.create_index("idx_cargo_request_entity", "cargo_requests", ["entity_id"])
    op.create_index("idx_cargo_request_status", "cargo_requests", ["status"])
    op.add_column("cargo_items", sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_cargo_items_request_id",
        "cargo_items",
        "cargo_requests",
        ["request_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column("cargo_requests", "status", server_default=None)
    op.alter_column("cargo_requests", "active", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_cargo_items_request_id", "cargo_items", type_="foreignkey")
    op.drop_column("cargo_items", "request_id")
    op.drop_index("idx_cargo_request_status", table_name="cargo_requests")
    op.drop_index("idx_cargo_request_entity", table_name="cargo_requests")
    op.drop_table("cargo_requests")
