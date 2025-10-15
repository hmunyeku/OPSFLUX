"""add_auto_save_delay_to_app_settings

Revision ID: e12ece912c0a
Revises: 1c74e1d97be6
Create Date: 2025-10-14 22:33:11.662754

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'e12ece912c0a'
down_revision = '1c74e1d97be6'
branch_labels = None
depends_on = None


def upgrade():
    # Ajout du paramètre auto_save_delay_seconds
    op.add_column('app_settings', sa.Column('auto_save_delay_seconds', sa.Integer(), nullable=True, server_default='3'))


def downgrade():
    # Suppression du paramètre
    op.drop_column('app_settings', 'auto_save_delay_seconds')
