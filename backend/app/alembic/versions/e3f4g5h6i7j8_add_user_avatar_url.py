"""add user avatar_url

Revision ID: e3f4g5h6i7j8
Revises: d2e3f4g5h6i7
Create Date: 2025-10-13 20:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3f4g5h6i7j8'
down_revision = 'd2e3f4g5h6i7'
branch_labels = None
depends_on = None


def upgrade():
    # Add avatar_url column to user table
    op.add_column('user', sa.Column('avatar_url', sa.String(length=500), nullable=True))


def downgrade():
    # Remove avatar_url column from user table
    op.drop_column('user', 'avatar_url')
