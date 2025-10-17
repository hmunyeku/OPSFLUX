"""add_i18n_tables

Revision ID: c9d4e5f12a11
Revises: o0p1q2r3s4t5
Create Date: 2025-10-17 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


# revision identifiers, used by Alembic.
revision = 'c9d4e5f12a11'
down_revision = 'o0p1q2r3s4t5'
branch_labels = None
depends_on = None


def upgrade():
    # Créer la table language
    op.create_table(
        'language',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('native_name', sa.String(length=100), nullable=False),
        sa.Column('flag_emoji', sa.String(length=10), nullable=True),
        sa.Column('direction', sa.String(length=3), nullable=False, server_default='ltr'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('translation_progress', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_language_code'), 'language', ['code'], unique=False)

    # Créer la table translation_namespace
    op.create_table(
        'translation_namespace',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('namespace_type', sa.String(length=50), nullable=False),
        sa.Column('module_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['module_id'], ['module.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_translation_namespace_code'), 'translation_namespace', ['code'], unique=False)
    op.create_index(op.f('ix_translation_namespace_namespace_type'), 'translation_namespace', ['namespace_type'], unique=False)
    op.create_index(op.f('ix_translation_namespace_module_id'), 'translation_namespace', ['module_id'], unique=False)

    # Créer la table translation
    op.create_table(
        'translation',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('namespace_id', sa.UUID(), nullable=False),
        sa.Column('language_id', sa.UUID(), nullable=False),
        sa.Column('key', sa.String(length=255), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('context', sa.Text(), nullable=True),
        sa.Column('pluralized', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_by_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['namespace_id'], ['translation_namespace.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_id'], ['language.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['verified_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('namespace_id', 'language_id', 'key', name='uq_translation_namespace_language_key')
    )
    op.create_index(op.f('ix_translation_namespace_id'), 'translation', ['namespace_id'], unique=False)
    op.create_index(op.f('ix_translation_language_id'), 'translation', ['language_id'], unique=False)
    op.create_index(op.f('ix_translation_key'), 'translation', ['key'], unique=False)

    # Créer la table user_language_preference
    op.create_table(
        'user_language_preference',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('language_id', sa.UUID(), nullable=False),
        sa.Column('fallback_language_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_id'], ['language.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['fallback_language_id'], ['language.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_user_language_preference_user_id'), 'user_language_preference', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_language_preference_language_id'), 'user_language_preference', ['language_id'], unique=False)

    # Insérer les langues par défaut (Français et Anglais)
    conn = op.get_bind()

    # Français (langue par défaut)
    fr_id = str(uuid.uuid4())
    conn.execute(
        sa.text("""
            INSERT INTO language (id, code, name, native_name, flag_emoji, direction, is_active, is_default, display_order, translation_progress, created_at, updated_at)
            VALUES (:id, 'fr', 'Français', 'Français', '🇫🇷', 'ltr', true, true, 0, 0.0, NOW(), NOW())
        """),
        {"id": fr_id}
    )

    # Anglais
    en_id = str(uuid.uuid4())
    conn.execute(
        sa.text("""
            INSERT INTO language (id, code, name, native_name, flag_emoji, direction, is_active, is_default, display_order, translation_progress, created_at, updated_at)
            VALUES (:id, 'en', 'English', 'English', '🇬🇧', 'ltr', true, false, 1, 0.0, NOW(), NOW())
        """),
        {"id": en_id}
    )

    # Créer le namespace CORE pour les traductions de l'application
    core_namespace_id = str(uuid.uuid4())
    conn.execute(
        sa.text("""
            INSERT INTO translation_namespace (id, code, name, description, namespace_type, created_at, updated_at)
            VALUES (:id, 'core.common', 'Core Common', 'Traductions communes de l''application', 'core', NOW(), NOW())
        """),
        {"id": core_namespace_id}
    )


def downgrade():
    op.drop_table('user_language_preference')
    op.drop_table('translation')
    op.drop_table('translation_namespace')
    op.drop_table('language')
