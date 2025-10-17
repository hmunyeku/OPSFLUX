"""add_external_id_to_i18n_tables

Revision ID: daba4b9668a0
Revises: d1f75a4d8f3e
Create Date: 2025-10-17 16:10:51.371056

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'daba4b9668a0'
down_revision = 'd1f75a4d8f3e'
branch_labels = None
depends_on = None


def upgrade():
    # Add external_id column to language table
    op.add_column('language', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_language_external_id'), 'language', ['external_id'], unique=True)

    # Add external_id column to translation_namespace table
    op.add_column('translation_namespace', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_translation_namespace_external_id'), 'translation_namespace', ['external_id'], unique=True)

    # Add external_id column to translation table
    op.add_column('translation', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_translation_external_id'), 'translation', ['external_id'], unique=True)

    # Add external_id column to user_language_preference table
    op.add_column('user_language_preference', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_user_language_preference_external_id'), 'user_language_preference', ['external_id'], unique=True)


def downgrade():
    # Remove external_id column from user_language_preference table
    op.drop_index(op.f('ix_user_language_preference_external_id'), table_name='user_language_preference')
    op.drop_column('user_language_preference', 'external_id')

    # Remove external_id column from translation table
    op.drop_index(op.f('ix_translation_external_id'), table_name='translation')
    op.drop_column('translation', 'external_id')

    # Remove external_id column from translation_namespace table
    op.drop_index(op.f('ix_translation_namespace_external_id'), table_name='translation_namespace')
    op.drop_column('translation_namespace', 'external_id')

    # Remove external_id column from language table
    op.drop_index(op.f('ix_language_external_id'), table_name='language')
    op.drop_column('language', 'external_id')
