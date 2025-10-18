"""add_core_services_settings

Revision ID: 706bec489af5
Revises: 767d66a8dd67
Create Date: 2025-10-18 18:11:30.224204

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '706bec489af5'
down_revision = '767d66a8dd67'
branch_labels = None
depends_on = None


def upgrade():
    # === Cache (Redis) ===
    op.add_column('app_settings', sa.Column('redis_host', sa.String(length=255), nullable=False, server_default='localhost'))
    op.add_column('app_settings', sa.Column('redis_port', sa.Integer(), nullable=False, server_default='6379'))
    op.add_column('app_settings', sa.Column('redis_db', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('app_settings', sa.Column('redis_password', sa.String(length=255), nullable=True))

    # === Storage (S3/MinIO) ===
    op.add_column('app_settings', sa.Column('storage_backend', sa.String(length=50), nullable=False, server_default='local'))
    op.add_column('app_settings', sa.Column('s3_endpoint', sa.String(length=500), nullable=True))
    op.add_column('app_settings', sa.Column('s3_access_key', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('s3_secret_key', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('s3_bucket', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('s3_region', sa.String(length=100), nullable=False, server_default='us-east-1'))

    # === Search (PostgreSQL/Elasticsearch/Typesense) ===
    op.add_column('app_settings', sa.Column('search_backend', sa.String(length=50), nullable=False, server_default='postgresql'))
    op.add_column('app_settings', sa.Column('search_language', sa.String(length=50), nullable=False, server_default='french'))
    op.add_column('app_settings', sa.Column('elasticsearch_url', sa.String(length=500), nullable=True))
    op.add_column('app_settings', sa.Column('typesense_api_key', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('typesense_host', sa.String(length=255), nullable=True))

    # === Audit Logs ===
    op.add_column('app_settings', sa.Column('audit_retention_days', sa.Integer(), nullable=False, server_default='90'))
    op.add_column('app_settings', sa.Column('audit_log_level', sa.String(length=50), nullable=False, server_default='INFO'))
    op.add_column('app_settings', sa.Column('audit_enabled', sa.Boolean(), nullable=False, server_default='true'))


def downgrade():
    # Remove CORE services configuration columns in reverse order
    op.drop_column('app_settings', 'audit_enabled')
    op.drop_column('app_settings', 'audit_log_level')
    op.drop_column('app_settings', 'audit_retention_days')

    op.drop_column('app_settings', 'typesense_host')
    op.drop_column('app_settings', 'typesense_api_key')
    op.drop_column('app_settings', 'elasticsearch_url')
    op.drop_column('app_settings', 'search_language')
    op.drop_column('app_settings', 'search_backend')

    op.drop_column('app_settings', 's3_region')
    op.drop_column('app_settings', 's3_bucket')
    op.drop_column('app_settings', 's3_secret_key')
    op.drop_column('app_settings', 's3_access_key')
    op.drop_column('app_settings', 's3_endpoint')
    op.drop_column('app_settings', 'storage_backend')

    op.drop_column('app_settings', 'redis_password')
    op.drop_column('app_settings', 'redis_db')
    op.drop_column('app_settings', 'redis_port')
    op.drop_column('app_settings', 'redis_host')
