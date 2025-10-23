"""Add dashboard and widget tables for customizable dashboards system

Revision ID: t6u7v8w9x0y1
Revises: n0o1p2q3r4s5
Create Date: 2025-10-23 15:30:00.000000

This migration adds the complete dashboard and widget system:
- widget: Catalog of available widgets
- dashboard: User dashboards with customizable layouts
- dashboard_widget: Association table for widgets in dashboards
- user_dashboard: User preferences for dashboards
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 't6u7v8w9x0y1'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade():
    # Create widget table
    op.create_table(
        'widget',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('widget_type', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('module_name', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('icon', sa.String(length=50), nullable=True),
        sa.Column('required_permission', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('default_config', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('default_size', postgresql.JSONB(), nullable=False, server_default='{"w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6}'),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('widget_type', name='uq_widget_type'),
        sa.UniqueConstraint('external_id', name='uq_widget_external_id')
    )

    # Create indexes for widget
    op.create_index('ix_widget_type', 'widget', ['widget_type'], unique=False)
    op.create_index('ix_widget_module_name', 'widget', ['module_name'], unique=False)
    op.create_index('ix_widget_category', 'widget', ['category'], unique=False)

    # Create dashboard table
    op.create_table(
        'dashboard',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_mandatory', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('scope', sa.String(length=50), nullable=True),
        sa.Column('scope_id', postgresql.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('layout_config', postgresql.JSONB(), nullable=False, server_default='{"column": 12, "cellHeight": 70, "margin": 10}'),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id', name='uq_dashboard_external_id')
    )

    # Create indexes for dashboard
    op.create_index('ix_dashboard_created_by_id', 'dashboard', ['created_by_id'], unique=False)
    op.create_index('ix_dashboard_is_mandatory', 'dashboard', ['is_mandatory'], unique=False)
    op.create_index('ix_dashboard_scope', 'dashboard', ['scope'], unique=False)
    op.create_index('ix_dashboard_scope_id', 'dashboard', ['scope_id'], unique=False)

    # Create dashboard_widget association table
    op.create_table(
        'dashboard_widget',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('dashboard_id', postgresql.UUID(), nullable=False),
        sa.Column('widget_id', postgresql.UUID(), nullable=False),
        sa.Column('x', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('y', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('w', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('h', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('config', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboard.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['widget_id'], ['widget.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dashboard_id', 'widget_id', name='uq_dashboard_widget'),
        sa.UniqueConstraint('external_id', name='uq_dashboard_widget_external_id')
    )

    # Create indexes for dashboard_widget
    op.create_index('ix_dashboard_widget_dashboard_id', 'dashboard_widget', ['dashboard_id'], unique=False)
    op.create_index('ix_dashboard_widget_widget_id', 'dashboard_widget', ['widget_id'], unique=False)

    # Create user_dashboard preferences table
    op.create_table(
        'user_dashboard',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(), nullable=False),
        sa.Column('dashboard_id', postgresql.UUID(), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('custom_layout', postgresql.JSONB(), nullable=True),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboard.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'dashboard_id', name='uq_user_dashboard'),
        sa.UniqueConstraint('external_id', name='uq_user_dashboard_external_id')
    )

    # Create indexes for user_dashboard
    op.create_index('ix_user_dashboard_user_id', 'user_dashboard', ['user_id'], unique=False)
    op.create_index('ix_user_dashboard_dashboard_id', 'user_dashboard', ['dashboard_id'], unique=False)
    op.create_index('ix_user_dashboard_is_default', 'user_dashboard', ['is_default'], unique=False)


def downgrade():
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_index('ix_user_dashboard_is_default', table_name='user_dashboard')
    op.drop_index('ix_user_dashboard_dashboard_id', table_name='user_dashboard')
    op.drop_index('ix_user_dashboard_user_id', table_name='user_dashboard')
    op.drop_table('user_dashboard')

    op.drop_index('ix_dashboard_widget_widget_id', table_name='dashboard_widget')
    op.drop_index('ix_dashboard_widget_dashboard_id', table_name='dashboard_widget')
    op.drop_table('dashboard_widget')

    op.drop_index('ix_dashboard_scope_id', table_name='dashboard')
    op.drop_index('ix_dashboard_scope', table_name='dashboard')
    op.drop_index('ix_dashboard_is_mandatory', table_name='dashboard')
    op.drop_index('ix_dashboard_created_by_id', table_name='dashboard')
    op.drop_table('dashboard')

    op.drop_index('ix_widget_category', table_name='widget')
    op.drop_index('ix_widget_module_name', table_name='widget')
    op.drop_index('ix_widget_type', table_name='widget')
    op.drop_table('widget')
