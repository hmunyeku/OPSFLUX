"""add_display_order_to_modules

Revision ID: 1495fd609218
Revises: 4b32774afc24
Create Date: 2025-10-17 17:00:59.553575

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '1495fd609218'
down_revision = '4b32774afc24'
branch_labels = None
depends_on = None


def upgrade():
    # Add display_order column to module table
    op.add_column('module', sa.Column('display_order', sa.Integer(), nullable=False, server_default='1000'))


def downgrade():
    # Remove display_order column from module table
    op.drop_column('module', 'display_order')
