"""fix birth_date type from date to varchar

Revision ID: n0o1p2q3r4s5
Revises: b2c3d4e5f6g7
Create Date: 2025-10-23 14:30:00.000000

This migration fixes the birth_date column type to match the Python model.
The column was incorrectly set to 'date' type in the database, but the
Python model expects a string (ISO format date string).

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'n0o1p2q3r4s5'
down_revision = 'avatar_text_20251022'
branch_labels = None
depends_on = None


def upgrade():
    # Change birth_date from date to varchar to match Python model
    # This allows storing ISO format date strings (YYYY-MM-DD) as text
    op.alter_column('user', 'birth_date',
                    existing_type=sa.Date(),
                    type_=sa.String(),
                    existing_nullable=True,
                    postgresql_using='birth_date::text')


def downgrade():
    # Revert birth_date from varchar back to date
    op.alter_column('user', 'birth_date',
                    existing_type=sa.String(),
                    type_=sa.Date(),
                    existing_nullable=True,
                    postgresql_using='birth_date::date')
