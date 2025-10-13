"""add_address_tables

Revision ID: c1d2e3f4g5h6
Revises: b2c3d4e5f6a7
Create Date: 2025-01-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4g5h6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create address_type table
    op.create_table('address_type',
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('icon', sa.String(length=100), nullable=True),
        sa.Column('color', sa.String(length=50), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_address_type_code'),
        sa.UniqueConstraint('external_id')
    )

    op.create_index('ix_address_type_code', 'address_type', ['code'])
    op.create_index('ix_address_type_is_active', 'address_type', ['is_active'])
    op.create_index(op.f('ix_address_type_id'), 'address_type', ['id'])
    op.create_index(op.f('ix_address_type_external_id'), 'address_type', ['external_id'])

    # Create address table
    op.create_table('address',
        sa.Column('address_type_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('street_line1', sa.String(length=255), nullable=False),
        sa.Column('street_line2', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('state', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=False),
        sa.Column('country', sa.String(length=2), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('place_id', sa.String(length=255), nullable=True),
        sa.Column('formatted_address', sa.String(length=500), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.String(length=1000), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['address_type_id'], ['address_type.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id')
    )

    op.create_index('ix_address_entity', 'address', ['entity_type', 'entity_id'])
    op.create_index('ix_address_type', 'address', ['address_type_id'])
    op.create_index('ix_address_country', 'address', ['country'])
    op.create_index('ix_address_postal_code', 'address', ['postal_code'])
    op.create_index('ix_address_is_default', 'address', ['is_default'])
    op.create_index('ix_address_geo', 'address', ['latitude', 'longitude'])
    op.create_index(op.f('ix_address_id'), 'address', ['id'])
    op.create_index(op.f('ix_address_external_id'), 'address', ['external_id'])
    op.create_index(op.f('ix_address_entity_type'), 'address', ['entity_type'])
    op.create_index(op.f('ix_address_entity_id'), 'address', ['entity_id'])

    # Insert default address types
    op.execute("""
        INSERT INTO address_type (id, code, name, description, icon, color, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'BUREAU', 'Bureau', 'Adresse professionnelle - Bureau', 'building-2', 'blue', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'DOMICILE', 'Domicile', 'Adresse personnelle - Domicile', 'home', 'green', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'ATELIER', 'Atelier', 'Adresse d''atelier ou site de production', 'hammer', 'orange', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'ENTREPOT', 'Entrepôt', 'Adresse d''entrepôt de stockage', 'warehouse', 'purple', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'LIVRAISON', 'Livraison', 'Adresse de livraison', 'truck', 'cyan', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'FACTURATION', 'Facturation', 'Adresse de facturation', 'receipt', 'red', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'AUTRE', 'Autre', 'Autre type d''adresse', 'map-pin', 'gray', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_address_entity_id'), table_name='address')
    op.drop_index(op.f('ix_address_entity_type'), table_name='address')
    op.drop_index(op.f('ix_address_external_id'), table_name='address')
    op.drop_index(op.f('ix_address_id'), table_name='address')
    op.drop_index('ix_address_geo', table_name='address')
    op.drop_index('ix_address_is_default', table_name='address')
    op.drop_index('ix_address_postal_code', table_name='address')
    op.drop_index('ix_address_country', table_name='address')
    op.drop_index('ix_address_type', table_name='address')
    op.drop_index('ix_address_entity', table_name='address')
    op.drop_table('address')

    op.drop_index(op.f('ix_address_type_external_id'), table_name='address_type')
    op.drop_index(op.f('ix_address_type_id'), table_name='address_type')
    op.drop_index('ix_address_type_is_active', table_name='address_type')
    op.drop_index('ix_address_type_code', table_name='address_type')
    op.drop_table('address_type')
