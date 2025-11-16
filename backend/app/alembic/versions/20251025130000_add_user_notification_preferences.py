"""add user_notification_preferences table

Revision ID: 20251025130000
Revises: 20251025120000
Create Date: 2025-10-25 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251025130000'
down_revision = '20251025120000'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_notification_preferences table
    op.create_table(
        'user_notification_preferences',
        # AbstractBaseModel fields
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),

        # UserNotificationPreferences specific fields
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('notification_type', sa.String(length=20), nullable=False, server_default='mentions'),
        sa.Column('mobile_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('communication_emails', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('social_emails', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('marketing_emails', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('security_emails', sa.Boolean(), nullable=False, server_default='true'),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    )

    # Create indexes for better query performance
    op.create_index('ix_user_notification_preferences_id', 'user_notification_preferences', ['id'])
    op.create_index('ix_user_notification_preferences_external_id', 'user_notification_preferences', ['external_id'], unique=True)
    op.create_index('ix_user_notification_preferences_user_id', 'user_notification_preferences', ['user_id'], unique=True)


def downgrade():
    op.drop_index('ix_user_notification_preferences_user_id', table_name='user_notification_preferences')
    op.drop_index('ix_user_notification_preferences_external_id', table_name='user_notification_preferences')
    op.drop_index('ix_user_notification_preferences_id', table_name='user_notification_preferences')
    op.drop_table('user_notification_preferences')
