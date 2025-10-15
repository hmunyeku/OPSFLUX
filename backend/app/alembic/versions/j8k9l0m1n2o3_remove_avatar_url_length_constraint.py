"""remove avatar_url length constraint

Revision ID: j8k9l0m1n2o3
Revises: i7j8k9l0m1n2
Create Date: 2025-10-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j8k9l0m1n2o3'
down_revision = 'i7j8k9l0m1n2'
branch_labels = None
depends_on = None


def upgrade():
    # Remove length constraint from avatar_url column to support base64 data URLs
    op.alter_column('user', 'avatar_url',
                   existing_type=sa.String(length=500),
                   type_=sa.Text(),
                   existing_nullable=True)


def downgrade():
    # Restore length constraint
    op.alter_column('user', 'avatar_url',
                   existing_type=sa.Text(),
                   type_=sa.String(length=500),
                   existing_nullable=True)
