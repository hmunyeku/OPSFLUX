"""add app_settings table

Revision ID: h6i7j8k9l0m1
Revises: g5h6i7j8k9l0
Create Date: 2025-10-14 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


# revision identifiers, used by Alembic.
revision = 'h6i7j8k9l0m1'
down_revision = 'g5h6i7j8k9l0'
branch_labels = None
depends_on = None


def upgrade():
    # Create app_settings table
    op.create_table(
        'app_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('app_name', sa.String(length=255), nullable=False, server_default='OpsFlux'),
        sa.Column('app_logo', sa.String(length=500), nullable=True),
        sa.Column('default_theme', sa.String(length=100), nullable=False, server_default='amethyst-haze'),
        sa.Column('default_language', sa.String(length=10), nullable=False, server_default='fr'),
        sa.Column('font', sa.String(length=100), nullable=False, server_default='inter'),
        sa.Column('company_name', sa.String(length=255), nullable=True),
        sa.Column('company_logo', sa.String(length=500), nullable=True),
        sa.Column('company_tax_id', sa.String(length=100), nullable=True),
        sa.Column('company_address', sa.String(length=500), nullable=True),
        # Audit fields from AbstractBaseModel
        sa.Column('external_id', sa.String(length=255), nullable=True, unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Insert default settings record
    op.execute("""
        INSERT INTO app_settings (id, app_name, default_theme, default_language, font)
        VALUES (gen_random_uuid(), 'OpsFlux', 'amethyst-haze', 'fr', 'inter')
    """)


def downgrade():
    # Drop app_settings table
    op.drop_table('app_settings')
