"""Add user sub-model tables for passports, visas, emergency contacts, etc.

Creates 7 new tables linked to users via FK:
- user_passports
- user_visas
- emergency_contacts
- social_securities
- user_vaccines
- user_languages
- driving_licenses

Revision ID: 038
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. user_passports
    op.create_table(
        "user_passports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("passport_name", sa.String(200), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("document_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_passports_user_id", "user_passports", ["user_id"])

    # 2. user_visas
    op.create_table(
        "user_visas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("visa_type", sa.String(100), nullable=False),
        sa.Column("number", sa.String(100), nullable=True),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("document_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_visas_user_id", "user_visas", ["user_id"])

    # 3. emergency_contacts
    op.create_table(
        "emergency_contacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("relationship_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone_number", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_emergency_contacts_user_id", "emergency_contacts", ["user_id"])

    # 4. social_securities
    op.create_table(
        "social_securities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("number", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_social_securities_user_id", "social_securities", ["user_id"])
    op.create_index("ix_social_securities_user_id_country", "social_securities", ["user_id", "country"], unique=True)

    # 5. user_vaccines
    op.create_table(
        "user_vaccines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("vaccine_type", sa.String(100), nullable=False),
        sa.Column("date_administered", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("batch_number", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_vaccines_user_id", "user_vaccines", ["user_id"])

    # 6. user_languages
    op.create_table(
        "user_languages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("language_code", sa.String(10), nullable=False),
        sa.Column("proficiency_level", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_languages_user_id", "user_languages", ["user_id"])
    op.create_index("ix_user_languages_user_id_language_code", "user_languages", ["user_id", "language_code"], unique=True)

    # 7. driving_licenses
    op.create_table(
        "driving_licenses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("license_type", sa.String(50), nullable=False),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("document_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_driving_licenses_user_id", "driving_licenses", ["user_id"])


def downgrade() -> None:
    op.drop_table("driving_licenses")
    op.drop_table("user_languages")
    op.drop_table("user_vaccines")
    op.drop_table("social_securities")
    op.drop_table("emergency_contacts")
    op.drop_table("user_visas")
    op.drop_table("user_passports")
