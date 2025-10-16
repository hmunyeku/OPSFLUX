"""add_module_management_tables

Revision ID: 5a6e193f86fe
Revises: 98bb2dda688e
Create Date: 2025-10-16 21:27:44.630811

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '5a6e193f86fe'
down_revision = '98bb2dda688e'
branch_labels = None
depends_on = None


def upgrade():
    # Créer table module
    op.create_table(
        'module',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('code', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('slug', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('long_description', sa.Text, nullable=True),
        sa.Column('author', sa.String(255), nullable=True),
        sa.Column('author_email', sa.String(255), nullable=True),
        sa.Column('license', sa.String(100), nullable=True),
        sa.Column('homepage_url', sa.String(500), nullable=True),
        sa.Column('documentation_url', sa.String(500), nullable=True),
        sa.Column('repository_url', sa.String(500), nullable=True),
        sa.Column('icon', sa.String(100), nullable=True, server_default='Package'),
        sa.Column('color', sa.String(7), nullable=True, server_default='#3B82F6'),
        sa.Column('category', sa.String(50), nullable=True, server_default='other'),
        sa.Column('status', sa.String(20), nullable=False, server_default='available', index=True),
        sa.Column('installed_at', sa.DateTime, nullable=True),
        sa.Column('installed_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('activated_at', sa.DateTime, nullable=True),
        sa.Column('deactivated_at', sa.DateTime, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('manifest', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('config', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('usage_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_used_at', sa.DateTime, nullable=True),
        sa.Column('is_system', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_required', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('requires_license', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('size_bytes', sa.BigInteger, nullable=True),
        sa.Column('frontend_path', sa.String(500), nullable=True),
        sa.Column('backend_path', sa.String(500), nullable=True),
        # Champs AbstractBaseModel
        sa.Column('external_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
    )

    # Créer table module_dependency
    op.create_table(
        'module_dependency',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('module_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('required_module_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('min_version', sa.String(20), nullable=True),
        sa.Column('is_optional', sa.Boolean, nullable=False, server_default='false'),
    )

    # Créer table module_permission
    op.create_table(
        'module_permission',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('module_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('code', sa.String(255), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('category', sa.String(100), nullable=True, server_default='general'),
        # Champs AbstractBaseModel
        sa.Column('external_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
    )

    # Créer table module_menu_item
    op.create_table(
        'module_menu_item',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('module_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('route', sa.String(500), nullable=False),
        sa.Column('icon', sa.String(100), nullable=True),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module_menu_item.id', ondelete='CASCADE'), nullable=True),
        sa.Column('order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('permission_code', sa.String(255), nullable=True),
        sa.Column('badge_source', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        # Champs AbstractBaseModel
        sa.Column('external_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
    )

    # Créer table module_hook
    op.create_table(
        'module_hook',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('module_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('module.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('event', sa.String(255), nullable=False, index=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('priority', sa.Integer, nullable=False, server_default='0'),
        sa.Column('conditions', postgresql.JSONB, nullable=True),
        sa.Column('actions', postgresql.JSONB, nullable=False, server_default='[]'),
        # Champs AbstractBaseModel
        sa.Column('external_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
    )

    # Créer table module_registry
    op.create_table(
        'module_registry',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('code', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('version', sa.String(20), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('long_description', sa.Text, nullable=True),
        sa.Column('author', sa.String(255), nullable=True),
        sa.Column('category', sa.String(50), nullable=True, server_default='other'),
        sa.Column('icon', sa.String(100), nullable=True, server_default='Package'),
        sa.Column('color', sa.String(7), nullable=True, server_default='#3B82F6'),
        sa.Column('download_url', sa.String(500), nullable=False),
        sa.Column('download_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('size_bytes', sa.BigInteger, nullable=True),
        sa.Column('requires_license', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('min_opsflux_version', sa.String(20), nullable=True),
        sa.Column('rating', sa.Float, nullable=True),
        sa.Column('rating_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('install_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_featured', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_verified', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_deprecated', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('published_at', sa.DateTime, nullable=True),
        sa.Column('last_updated_at', sa.DateTime, nullable=True),
        sa.Column('screenshots', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('changelog', sa.Text, nullable=True),
        # Champs AbstractBaseModel
        sa.Column('external_id', sa.String(255), unique=True, nullable=True, index=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('user.id'), nullable=True),
    )

    # Créer les index
    op.create_index('ix_module_status_active', 'module', ['status'], unique=False, postgresql_where=sa.text("status = 'active'"))
    op.create_index('ix_module_category', 'module', ['category'], unique=False)
    op.create_index('ix_module_registry_category', 'module_registry', ['category'], unique=False)


def downgrade():
    # Supprimer les tables dans l'ordre inverse
    op.drop_table('module_registry')
    op.drop_table('module_hook')
    op.drop_table('module_menu_item')
    op.drop_table('module_permission')
    op.drop_table('module_dependency')
    op.drop_table('module')
