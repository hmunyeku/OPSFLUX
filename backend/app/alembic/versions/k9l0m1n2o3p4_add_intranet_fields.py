"""add intranet fields

Revision ID: k9l0m1n2o3p4
Revises: j8k9l0m1n2o3
Create Date: 2025-10-15 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'k9l0m1n2o3p4'
down_revision = 'j8k9l0m1n2o3'
branch_labels = None
depends_on = None


def upgrade():
    # Add intranet_identifier to user table
    op.add_column('user', sa.Column('intranet_identifier', sa.String(length=255), nullable=True))

    # Add intranet_url to app_settings table
    op.add_column('app_settings', sa.Column('intranet_url', sa.String(length=500), nullable=True))


def downgrade():
    # Remove columns
    op.drop_column('user', 'intranet_identifier')
    op.drop_column('app_settings', 'intranet_url')
