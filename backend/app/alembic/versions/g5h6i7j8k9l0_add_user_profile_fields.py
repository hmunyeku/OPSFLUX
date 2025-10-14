"""add user profile fields

Revision ID: g5h6i7j8k9l0
Revises: f4g5h6i7j8k9
Create Date: 2025-10-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'g5h6i7j8k9l0'
down_revision = 'f4g5h6i7j8k9'
branch_labels = None
depends_on = None


def upgrade():
    # Add new user profile columns
    op.add_column('user', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('user', sa.Column('last_name', sa.String(length=100), nullable=True))
    op.add_column('user', sa.Column('initials', sa.String(length=10), nullable=True))
    op.add_column('user', sa.Column('recovery_email', sa.String(length=255), nullable=True))
    op.add_column('user', sa.Column('phone_numbers', postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade():
    # Remove new user profile columns
    op.drop_column('user', 'phone_numbers')
    op.drop_column('user', 'recovery_email')
    op.drop_column('user', 'initials')
    op.drop_column('user', 'last_name')
    op.drop_column('user', 'first_name')
