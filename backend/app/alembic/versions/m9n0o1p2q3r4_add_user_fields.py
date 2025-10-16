"""add user fields: civility, birth_date, extension, signature

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2025-10-16 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm9n0o1p2q3r4'
down_revision = 'l8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to user table
    op.add_column('user', sa.Column('civility', sa.String(length=10), nullable=True))
    op.add_column('user', sa.Column('birth_date', sa.String(), nullable=True))
    op.add_column('user', sa.Column('extension', sa.String(length=20), nullable=True))
    op.add_column('user', sa.Column('signature', sa.String(length=500), nullable=True))


def downgrade():
    # Remove columns
    op.drop_column('user', 'signature')
    op.drop_column('user', 'extension')
    op.drop_column('user', 'birth_date')
    op.drop_column('user', 'civility')
