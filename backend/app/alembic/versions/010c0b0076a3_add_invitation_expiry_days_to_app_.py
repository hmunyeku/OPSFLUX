"""add_invitation_expiry_days_to_app_settings

Revision ID: 010c0b0076a3
Revises: 5e88c831fdee
Create Date: 2025-10-18 23:13:54.683528

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '010c0b0076a3'
down_revision = '5e88c831fdee'
branch_labels = None
depends_on = None


def upgrade():
    # Add invitation_expiry_days column to app_settings table
    op.add_column('app_settings', sa.Column('invitation_expiry_days', sa.Integer(), nullable=True))

    # Set default value for existing rows
    op.execute("UPDATE app_settings SET invitation_expiry_days = 7 WHERE invitation_expiry_days IS NULL")


def downgrade():
    # Remove invitation_expiry_days column
    op.drop_column('app_settings', 'invitation_expiry_days')
