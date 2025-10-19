"""Add backup configuration to app_settings

Revision ID: 19e7d482d196
Revises: f1g2h3i4j5k6
Create Date: 2025-10-19 13:37:13.708442

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '19e7d482d196'
down_revision = 'f1g2h3i4j5k6'
branch_labels = None
depends_on = None


def upgrade():
    # Add backup configuration columns to app_settings table
    op.add_column('app_settings', sa.Column('backup_storage_type', sa.String(length=50), nullable=False, server_default='local'))
    op.add_column('app_settings', sa.Column('backup_local_path', sa.String(length=500), nullable=True, server_default='/backups'))
    op.add_column('app_settings', sa.Column('backup_s3_bucket', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_s3_endpoint', sa.String(length=500), nullable=True))
    op.add_column('app_settings', sa.Column('backup_s3_access_key', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_s3_secret_key', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_s3_region', sa.String(length=100), nullable=True))
    op.add_column('app_settings', sa.Column('backup_ftp_host', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_ftp_port', sa.Integer(), nullable=True, server_default='21'))
    op.add_column('app_settings', sa.Column('backup_ftp_username', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_ftp_password', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('backup_ftp_path', sa.String(length=500), nullable=True, server_default='/backups'))
    op.add_column('app_settings', sa.Column('backup_retention_days', sa.Integer(), nullable=False, server_default='30'))
    op.add_column('app_settings', sa.Column('backup_auto_cleanup', sa.Boolean(), nullable=False, server_default='true'))


def downgrade():
    # Remove backup configuration columns from app_settings table
    op.drop_column('app_settings', 'backup_auto_cleanup')
    op.drop_column('app_settings', 'backup_retention_days')
    op.drop_column('app_settings', 'backup_ftp_path')
    op.drop_column('app_settings', 'backup_ftp_password')
    op.drop_column('app_settings', 'backup_ftp_username')
    op.drop_column('app_settings', 'backup_ftp_port')
    op.drop_column('app_settings', 'backup_ftp_host')
    op.drop_column('app_settings', 'backup_s3_region')
    op.drop_column('app_settings', 'backup_s3_secret_key')
    op.drop_column('app_settings', 'backup_s3_access_key')
    op.drop_column('app_settings', 'backup_s3_endpoint')
    op.drop_column('app_settings', 'backup_s3_bucket')
    op.drop_column('app_settings', 'backup_local_path')
    op.drop_column('app_settings', 'backup_storage_type')
