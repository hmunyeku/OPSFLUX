"""Add polymorphic phones and contact_emails tables.

Revision ID: 007_add_phones_contact_emails
Revises: 006_add_tag_hierarchy
"""

from alembic import op
import sqlalchemy as sa

revision = "007_add_phones_contact_emails"
down_revision = "006_add_tag_hierarchy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Phones table ──────────────────────────────────────────
    op.create_table(
        "phones",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(50), nullable=False, server_default="mobile"),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("country_code", sa.String(10), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_phones_owner", "phones", ["owner_type", "owner_id"])

    # ── Contact emails table ──────────────────────────────────
    op.create_table(
        "contact_emails",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(50), nullable=False, server_default="work"),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_contact_emails_owner", "contact_emails", ["owner_type", "owner_id"])


def downgrade() -> None:
    op.drop_table("contact_emails")
    op.drop_table("phones")
