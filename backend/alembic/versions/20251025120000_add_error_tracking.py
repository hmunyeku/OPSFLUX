"""add error_logs table for error tracking

Revision ID: 20251025120000
Revises: 20251025110000
Create Date: 2025-10-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251025120000'
down_revision = '20251025110000'
branch_labels = None
depends_on = None


def upgrade():
    # Create error_logs table
    op.create_table(
        'error_logs',
        # AbstractBaseModel fields
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), nullable=True),

        # ErrorLog specific fields
        sa.Column('error_type', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),

        # Contexte technique
        sa.Column('stacktrace', sa.Text(), nullable=True),
        sa.Column('file_path', sa.String(length=500), nullable=True),
        sa.Column('line_number', sa.Integer(), nullable=True),
        sa.Column('function_name', sa.String(length=255), nullable=True),

        # Contexte utilisateur
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('request_path', sa.String(length=1000), nullable=True),
        sa.Column('request_method', sa.String(length=10), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),

        # Métadonnées (renommé car 'metadata' est réservé)
        sa.Column('extra_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),

        # Résolution
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resolution_notes', sa.Text(), nullable=True),

        # Grouping
        sa.Column('error_hash', sa.String(length=64), nullable=True),
        sa.Column('occurrence_count', sa.Integer(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),

        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for better query performance
    op.create_index('ix_error_logs_id', 'error_logs', ['id'])
    op.create_index('ix_error_logs_external_id', 'error_logs', ['external_id'], unique=True)
    op.create_index('ix_error_logs_error_hash', 'error_logs', ['error_hash'])
    op.create_index('ix_error_logs_severity', 'error_logs', ['severity'])
    op.create_index('ix_error_logs_source', 'error_logs', ['source'])
    op.create_index('ix_error_logs_status', 'error_logs', ['status'])
    op.create_index('ix_error_logs_created_at', 'error_logs', ['created_at'])
    op.create_index('ix_error_logs_last_seen_at', 'error_logs', ['last_seen_at'])


def downgrade():
    op.drop_index('ix_error_logs_last_seen_at', table_name='error_logs')
    op.drop_index('ix_error_logs_created_at', table_name='error_logs')
    op.drop_index('ix_error_logs_status', table_name='error_logs')
    op.drop_index('ix_error_logs_source', table_name='error_logs')
    op.drop_index('ix_error_logs_severity', table_name='error_logs')
    op.drop_index('ix_error_logs_error_hash', table_name='error_logs')
    op.drop_index('ix_error_logs_external_id', table_name='error_logs')
    op.drop_index('ix_error_logs_id', table_name='error_logs')
    op.drop_table('error_logs')
