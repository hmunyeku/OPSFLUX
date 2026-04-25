"""add_mfa_fields_to_users

Revision ID: 535582507b0f
Revises: 001
Create Date: 2026-03-16 06:59:04.036287
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '535582507b0f'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── MFA columns on users ────────────────────────────────────
    op.add_column('users', sa.Column('totp_secret', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('mfa_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('mfa_backup_codes', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # ── New settings tables ─────────────────────────────────────
    op.create_table('personal_access_tokens',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('token_prefix', sa.String(length=8), nullable=False),
        sa.Column('scopes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )

    op.create_table('user_emails',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False),
        sa.Column('is_notification', sa.Boolean(), nullable=False),
        sa.Column('verified', sa.Boolean(), nullable=False),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verification_token', sa.String(length=128), nullable=True),
        sa.Column('verification_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('user_sessions',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('browser', sa.String(length=100), nullable=True),
        sa.Column('os', sa.String(length=100), nullable=True),
        sa.Column('device_type', sa.String(length=20), nullable=False),
        sa.Column('last_active_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('user_addresses',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.String(length=50), nullable=False),
        sa.Column('address_line1', sa.String(length=255), nullable=False),
        sa.Column('address_line2', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('state_province', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('oauth_applications',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('client_id', sa.String(length=64), nullable=False),
        sa.Column('client_secret_hash', sa.String(length=128), nullable=True),
        sa.Column('redirect_uris', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('scopes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('confidential', sa.Boolean(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('client_id'),
    )

    op.create_table('notification_preferences',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('global_level', sa.String(length=20), nullable=False),
        sa.Column('notification_email_id', sa.UUID(), nullable=True),
        sa.Column('notify_own_actions', sa.Boolean(), nullable=False),
        sa.Column('group_overrides', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['notification_email_id'], ['user_emails.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    op.create_table('oauth_authorizations',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('application_id', sa.UUID(), nullable=False),
        sa.Column('scopes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['application_id'], ['oauth_applications.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('oauth_authorizations')
    op.drop_table('notification_preferences')
    op.drop_table('oauth_applications')
    op.drop_table('user_addresses')
    op.drop_table('user_sessions')
    op.drop_table('user_emails')
    op.drop_table('personal_access_tokens')
    op.drop_column('users', 'mfa_backup_codes')
    op.drop_column('users', 'mfa_enabled')
    op.drop_column('users', 'totp_secret')
