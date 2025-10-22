"""Add AI and cache TTL settings

Revision ID: fdc46ca7d3eb
Revises: d7398f055368
Create Date: 2025-10-22 08:23:28.333558

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes

# revision identifiers, used by Alembic.
revision = 'fdc46ca7d3eb'
down_revision = 'd7398f055368'
branch_labels = None
depends_on = None


def upgrade():
    # Add Redis cache TTL fields
    op.add_column('app_settings', sa.Column('redis_default_ttl', sa.Integer(), nullable=False, server_default='3600'))
    op.add_column('app_settings', sa.Column('redis_max_ttl', sa.Integer(), nullable=False, server_default='86400'))

    # Add AI configuration fields
    op.add_column('app_settings', sa.Column('ai_provider', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True))
    op.add_column('app_settings', sa.Column('ai_openai_api_key', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('ai_openai_model', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False, server_default="gpt-4o"))
    op.add_column('app_settings', sa.Column('ai_openai_base_url', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True))
    op.add_column('app_settings', sa.Column('ai_anthropic_api_key', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('ai_anthropic_model', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False, server_default="claude-3-5-sonnet-20241022"))
    op.add_column('app_settings', sa.Column('ai_max_tokens', sa.Integer(), nullable=False, server_default='4096'))
    op.add_column('app_settings', sa.Column('ai_temperature', sa.Float(), nullable=False, server_default='0.7'))


def downgrade():
    # Remove AI configuration fields
    op.drop_column('app_settings', 'ai_temperature')
    op.drop_column('app_settings', 'ai_max_tokens')
    op.drop_column('app_settings', 'ai_anthropic_model')
    op.drop_column('app_settings', 'ai_anthropic_api_key')
    op.drop_column('app_settings', 'ai_openai_base_url')
    op.drop_column('app_settings', 'ai_openai_model')
    op.drop_column('app_settings', 'ai_openai_api_key')
    op.drop_column('app_settings', 'ai_provider')

    # Remove Redis cache TTL fields
    op.drop_column('app_settings', 'redis_max_ttl')
    op.drop_column('app_settings', 'redis_default_ttl')
