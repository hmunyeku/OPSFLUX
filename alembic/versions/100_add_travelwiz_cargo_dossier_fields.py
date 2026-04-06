"""add travelwiz cargo dossier fields

Revision ID: 100_add_travelwiz_cargo_dossier_fields
Revises: 099_project_templates_custom_fields
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "100_add_travelwiz_cargo_dossier_fields"
down_revision = "099_project_templates_custom_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cargo_items", sa.Column("designation", sa.String(length=255), nullable=True))
    op.add_column("cargo_items", sa.Column("workflow_status", sa.String(length=30), nullable=False, server_default="draft"))
    op.add_column("cargo_items", sa.Column("surface_m2", sa.Float(), nullable=True))
    op.add_column("cargo_items", sa.Column("package_count", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("cargo_items", sa.Column("stackable", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("cargo_items", sa.Column("imputation_reference_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("cargo_items", sa.Column("ownership_type", sa.String(length=30), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_location_label", sa.String(length=255), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_latitude", sa.Float(), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_longitude", sa.Float(), nullable=True))
    op.add_column("cargo_items", sa.Column("requester_name", sa.String(length=200), nullable=True))
    op.add_column("cargo_items", sa.Column("document_prepared_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cargo_items", sa.Column("available_from", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_contact_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_contact_tier_contact_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_contact_name", sa.String(length=200), nullable=True))
    op.add_column("cargo_items", sa.Column("pickup_contact_phone", sa.String(length=80), nullable=True))
    op.add_column("cargo_items", sa.Column("lifting_provider", sa.String(length=200), nullable=True))
    op.add_column("cargo_items", sa.Column("lifting_points_certified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("cargo_items", sa.Column("weight_ticket_provided", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("cargo_items", sa.Column("photo_evidence_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("cargo_items", sa.Column("document_attachment_count", sa.Integer(), nullable=False, server_default="0"))

    op.create_foreign_key(
        "fk_cargo_items_imputation_reference_id",
        "cargo_items",
        "imputation_references",
        ["imputation_reference_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cargo_items_pickup_contact_user_id",
        "cargo_items",
        "users",
        ["pickup_contact_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cargo_items_pickup_contact_tier_contact_id",
        "cargo_items",
        "tier_contacts",
        ["pickup_contact_tier_contact_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.alter_column("cargo_items", "workflow_status", server_default=None)
    op.alter_column("cargo_items", "package_count", server_default=None)
    op.alter_column("cargo_items", "stackable", server_default=None)
    op.alter_column("cargo_items", "lifting_points_certified", server_default=None)
    op.alter_column("cargo_items", "weight_ticket_provided", server_default=None)
    op.alter_column("cargo_items", "photo_evidence_count", server_default=None)
    op.alter_column("cargo_items", "document_attachment_count", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_cargo_items_pickup_contact_tier_contact_id", "cargo_items", type_="foreignkey")
    op.drop_constraint("fk_cargo_items_pickup_contact_user_id", "cargo_items", type_="foreignkey")
    op.drop_constraint("fk_cargo_items_imputation_reference_id", "cargo_items", type_="foreignkey")

    op.drop_column("cargo_items", "document_attachment_count")
    op.drop_column("cargo_items", "photo_evidence_count")
    op.drop_column("cargo_items", "weight_ticket_provided")
    op.drop_column("cargo_items", "lifting_points_certified")
    op.drop_column("cargo_items", "lifting_provider")
    op.drop_column("cargo_items", "pickup_contact_phone")
    op.drop_column("cargo_items", "pickup_contact_name")
    op.drop_column("cargo_items", "pickup_contact_tier_contact_id")
    op.drop_column("cargo_items", "pickup_contact_user_id")
    op.drop_column("cargo_items", "available_from")
    op.drop_column("cargo_items", "document_prepared_at")
    op.drop_column("cargo_items", "requester_name")
    op.drop_column("cargo_items", "pickup_longitude")
    op.drop_column("cargo_items", "pickup_latitude")
    op.drop_column("cargo_items", "pickup_location_label")
    op.drop_column("cargo_items", "ownership_type")
    op.drop_column("cargo_items", "imputation_reference_id")
    op.drop_column("cargo_items", "stackable")
    op.drop_column("cargo_items", "package_count")
    op.drop_column("cargo_items", "surface_m2")
    op.drop_column("cargo_items", "workflow_status")
    op.drop_column("cargo_items", "designation")
