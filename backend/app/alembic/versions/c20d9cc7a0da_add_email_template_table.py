"""add_email_template_table

Revision ID: c20d9cc7a0da
Revises: 1495fd609218
Create Date: 2025-10-17 17:17:32.825084

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'c20d9cc7a0da'
down_revision = '1495fd609218'
branch_labels = None
depends_on = None


def upgrade():
    # Create email_template table
    op.create_table(
        'email_template',
        sa.Column('id', sa.dialects.postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='custom'),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('html_content', sa.Text(), nullable=False),
        sa.Column('text_content', sa.Text(), nullable=True),
        sa.Column('available_variables', sa.dialects.postgresql.JSONB(), nullable=True, server_default='[]'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('preview_data', sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column('sent_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.dialects.postgresql.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.dialects.postgresql.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.dialects.postgresql.UUID(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_email_template_name', 'email_template', ['name'])
    op.create_index('ix_email_template_slug', 'email_template', ['slug'], unique=True)
    op.create_index('ix_email_template_category', 'email_template', ['category'])
    op.create_index('ix_email_template_external_id', 'email_template', ['external_id'], unique=True)


def downgrade():
    op.drop_index('ix_email_template_external_id', 'email_template')
    op.drop_index('ix_email_template_category', 'email_template')
    op.drop_index('ix_email_template_slug', 'email_template')
    op.drop_index('ix_email_template_name', 'email_template')
    op.drop_table('email_template')
