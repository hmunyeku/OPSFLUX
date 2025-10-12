"""Add session and login_attempt tables

Revision ID: 5f3e8a9d2c1b
Revises: 03451678c2db
Create Date: 2025-10-12 22:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '5f3e8a9d2c1b'
down_revision = '03451678c2db'
branch_labels = None
depends_on = None


def upgrade():
    # Create session table
    op.create_table(
        'session',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('device_type', sa.String(length=50), nullable=True),
        sa.Column('device_name', sa.String(length=100), nullable=True),
        sa.Column('location', sa.String(length=200), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_activity_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('refresh_token', sa.String(length=500), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_session_external_id', 'session', ['external_id'], unique=True)
    op.create_index('ix_session_id', 'session', ['id'], unique=False)
    op.create_index('ix_session_refresh_token', 'session', ['refresh_token'], unique=True)

    # Create login_attempt table
    op.create_table(
        'login_attempt',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('ip_address', sa.String(length=50), nullable=False),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('failure_reason', sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_login_attempt_external_id', 'login_attempt', ['external_id'], unique=True)
    op.create_index('ix_login_attempt_id', 'login_attempt', ['id'], unique=False)
    op.create_index('ix_login_attempt_email', 'login_attempt', ['email'], unique=False)
    op.create_index('ix_login_attempt_ip_address', 'login_attempt', ['ip_address'], unique=False)


def downgrade():
    # Drop login_attempt table
    op.drop_index('ix_login_attempt_ip_address', table_name='login_attempt')
    op.drop_index('ix_login_attempt_email', table_name='login_attempt')
    op.drop_index('ix_login_attempt_id', table_name='login_attempt')
    op.drop_index('ix_login_attempt_external_id', table_name='login_attempt')
    op.drop_table('login_attempt')

    # Drop session table
    op.drop_index('ix_session_refresh_token', table_name='session')
    op.drop_index('ix_session_id', table_name='session')
    op.drop_index('ix_session_external_id', table_name='session')
    op.drop_table('session')
