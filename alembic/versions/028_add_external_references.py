"""Add external_references polymorphic table.

New table:
  external_references — multiple external IDs per any OpsFlux object
                        (SAP code, legacy ID, partner ref, customs number, etc.)

Revision ID: 028
Revises: 027
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_references",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("system", sa.String(50), nullable=False),
        sa.Column("code", sa.String(200), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_ext_ref_owner", "external_references", ["owner_type", "owner_id"])
    op.create_index("idx_ext_ref_system_code", "external_references", ["system", "code"])


def downgrade() -> None:
    op.drop_index("idx_ext_ref_system_code", table_name="external_references")
    op.drop_index("idx_ext_ref_owner", table_name="external_references")
    op.drop_table("external_references")
