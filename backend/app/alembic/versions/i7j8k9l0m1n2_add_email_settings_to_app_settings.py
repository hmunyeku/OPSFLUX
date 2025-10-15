"""add_email_settings_to_app_settings

Revision ID: i7j8k9l0m1n2
Revises: e12ece912c0a
Create Date: 2025-10-14 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i7j8k9l0m1n2'
down_revision = 'e12ece912c0a'
branch_labels = None
depends_on = None


def upgrade():
    # Add email configuration fields to app_settings
    op.add_column('app_settings', sa.Column('email_host', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('email_port', sa.Integer(), nullable=True))
    op.add_column('app_settings', sa.Column('email_username', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('email_password', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('email_from', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('email_from_name', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('email_use_tls', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('app_settings', sa.Column('email_use_ssl', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    # Remove email configuration fields
    op.drop_column('app_settings', 'email_use_ssl')
    op.drop_column('app_settings', 'email_use_tls')
    op.drop_column('app_settings', 'email_from_name')
    op.drop_column('app_settings', 'email_from')
    op.drop_column('app_settings', 'email_password')
    op.drop_column('app_settings', 'email_username')
    op.drop_column('app_settings', 'email_port')
    op.drop_column('app_settings', 'email_host')
