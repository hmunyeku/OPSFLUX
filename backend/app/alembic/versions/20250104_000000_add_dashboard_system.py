"""add dashboard system

Revision ID: 20250104_000000
Revises: 20250103_000000
Create Date: 2025-01-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlmodel import Column, JSON

# revision identifiers, used by Alembic.
revision = '20250104_000000'
down_revision = '20250103_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================================================
    # DROP EXISTING ENUMS IF THEY EXIST (for idempotency)
    # ============================================================================
    op.execute("DROP TYPE IF EXISTS menuparentenum CASCADE")
    op.execute("DROP TYPE IF EXISTS widgettypeenum CASCADE")
    op.execute("DROP TYPE IF EXISTS datasourcetypeenum CASCADE")
    op.execute("DROP TYPE IF EXISTS refreshintervalenum CASCADE")
    op.execute("DROP TYPE IF EXISTS layoutbreakpointenum CASCADE")

    # ============================================================================
    # CREATE ENUMS
    # ============================================================================

    # MenuParentEnum - OpsFlux menus
    op.execute("""
        CREATE TYPE menuparentenum AS ENUM (
            'pilotage',
            'tiers',
            'projects',
            'organizer',
            'redacteur',
            'pobvue',
            'travelwiz',
            'mocvue',
            'cleanvue',
            'powertrace'
        )
    """)

    # WidgetTypeEnum - Types de widgets
    op.execute("""
        CREATE TYPE widgettypeenum AS ENUM (
            'stats_card',
            'line_chart',
            'bar_chart',
            'pie_chart',
            'area_chart',
            'table',
            'list',
            'progress_card',
            'gauge',
            'map',
            'calendar',
            'timeline',
            'kanban',
            'heatmap',
            'metric',
            'custom'
        )
    """)

    # DataSourceTypeEnum - Sources de données
    op.execute("""
        CREATE TYPE datasourcetypeenum AS ENUM (
            'api',
            'sql',
            'static',
            'realtime',
            'websocket'
        )
    """)

    # RefreshIntervalEnum - Intervalles de rafraîchissement
    op.execute("""
        CREATE TYPE refreshintervalenum AS ENUM (
            'realtime',
            '5s',
            '10s',
            '30s',
            '1m',
            '5m',
            '10m',
            '30m',
            '1h',
            'manual'
        )
    """)

    # LayoutBreakpointEnum - Breakpoints responsive
    op.execute("""
        CREATE TYPE layoutbreakpointenum AS ENUM (
            'mobile',
            'tablet',
            'desktop'
        )
    """)

    # ============================================================================
    # CREATE TABLES
    # ============================================================================

    # Table: dashboards
    op.create_table(
        'dashboards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        # Métadonnées de base
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('version', sa.String(length=20), nullable=False, server_default='1.0'),

        # Navigation
        sa.Column('menu_parent', postgresql.ENUM('pilotage', 'tiers', 'projects', 'organizer', 'redacteur',
                                         'pobvue', 'travelwiz', 'mocvue', 'cleanvue', 'powertrace',
                                         name='menuparentenum', create_type=False), nullable=False),
        sa.Column('menu_label', sa.String(length=100), nullable=False),
        sa.Column('menu_icon', sa.String(length=50), nullable=False, server_default='LayoutDashboard'),
        sa.Column('menu_order', sa.Integer(), nullable=False, server_default='999'),
        sa.Column('show_in_sidebar', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_home_page', sa.Boolean(), nullable=False, server_default='false'),

        # Permissions
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('required_roles', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('required_permissions', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('restricted_to_users', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('restricted_to_organizations', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('inherit_from_parent', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('allow_anonymous', sa.Boolean(), nullable=False, server_default='false'),

        # Layout responsive
        sa.Column('layout_mobile', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('layout_tablet', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('layout_desktop', postgresql.JSON(astext_type=sa.Text()), nullable=True),

        # Configuration
        sa.Column('auto_refresh', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('refresh_interval', postgresql.ENUM('realtime', '5s', '10s', '30s', '1m', '5m', '10m', '30m', '1h', 'manual',
                                              name='refreshintervalenum', create_type=False), nullable=False, server_default='manual'),
        sa.Column('enable_filters', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enable_export', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('enable_fullscreen', sa.Boolean(), nullable=False, server_default='true'),

        # Style & Thème
        sa.Column('theme', sa.String(length=50), nullable=True),
        sa.Column('custom_css', sa.String(length=5000), nullable=True),

        # Métadonnées
        sa.Column('is_template', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=True),

        # Relations
        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['user.id'], ondelete='SET NULL'),
    )

    # Table: dashboard_widgets
    op.create_table(
        'dashboard_widgets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        # Référence dashboard
        sa.Column('dashboard_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboards.id'], ondelete='CASCADE'),

        # Métadonnées
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('widget_type', postgresql.ENUM('stats_card', 'line_chart', 'bar_chart', 'pie_chart', 'area_chart',
                                         'table', 'list', 'progress_card', 'gauge', 'map', 'calendar',
                                         'timeline', 'kanban', 'heatmap', 'metric', 'custom',
                                         name='widgettypeenum', create_type=False), nullable=False),

        # Position et taille (grid layout)
        sa.Column('position_x', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('position_y', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('width', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('height', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('min_width', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('min_height', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('max_width', sa.Integer(), nullable=True),
        sa.Column('max_height', sa.Integer(), nullable=True),

        # Ordre d'affichage
        sa.Column('z_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),

        # Source de données
        sa.Column('data_source_type', postgresql.ENUM('api', 'sql', 'static', 'realtime', 'websocket',
                                              name='datasourcetypeenum', create_type=False), nullable=False),
        sa.Column('data_source_config', postgresql.JSON(astext_type=sa.Text()), nullable=False),

        # Configuration du widget
        sa.Column('widget_config', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),

        # Style
        sa.Column('background_color', sa.String(length=50), nullable=True),
        sa.Column('border_color', sa.String(length=50), nullable=True),
        sa.Column('custom_css', sa.String(length=2000), nullable=True),

        # Comportement
        sa.Column('is_visible', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_resizable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_draggable', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_removable', sa.Boolean(), nullable=False, server_default='true'),

        # Rafraîchissement
        sa.Column('auto_refresh', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('refresh_interval', postgresql.ENUM('realtime', '5s', '10s', '30s', '1m', '5m', '10m', '30m', '1h', 'manual',
                                              name='refreshintervalenum', create_type=False), nullable=False, server_default='manual'),

        # Cache
        sa.Column('enable_cache', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('cache_ttl', sa.Integer(), nullable=True, server_default='300'),
    )

    # Table: widget_templates
    op.create_table(
        'widget_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('widget_type', postgresql.ENUM('stats_card', 'line_chart', 'bar_chart', 'pie_chart', 'area_chart',
                                         'table', 'list', 'progress_card', 'gauge', 'map', 'calendar',
                                         'timeline', 'kanban', 'heatmap', 'metric', 'custom',
                                         name='widgettypeenum', create_type=False), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),

        # Configuration par défaut
        sa.Column('default_config', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('default_data_source', postgresql.JSON(astext_type=sa.Text()), nullable=False),

        # Dimensions recommandées
        sa.Column('recommended_width', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('recommended_height', sa.Integer(), nullable=False, server_default='3'),

        # Métadonnées
        sa.Column('icon', sa.String(length=50), nullable=False, server_default='LayoutDashboard'),
        sa.Column('preview_image', sa.String(length=500), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=True),

        sa.Column('author_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['author_id'], ['user.id'], ondelete='SET NULL'),
    )

    # Table: dashboard_shares
    op.create_table(
        'dashboard_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('dashboard_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboards.id'], ondelete='CASCADE'),

        sa.Column('shared_with_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['shared_with_user_id'], ['user.id'], ondelete='CASCADE'),

        sa.Column('shared_with_role', sa.String(length=100), nullable=True),
        sa.Column('shared_with_organization_id', postgresql.UUID(as_uuid=True), nullable=True),

        # Permissions
        sa.Column('can_view', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('can_edit', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('can_delete', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('can_share', sa.Boolean(), nullable=False, server_default='false'),

        # Expiration
        sa.Column('expires_at', sa.DateTime(), nullable=True),

        sa.Column('shared_by_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['shared_by_user_id'], ['user.id'], ondelete='CASCADE'),
    )

    # Table: dashboard_favorites
    op.create_table(
        'dashboard_favorites',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('dashboard_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboards.id'], ondelete='CASCADE'),

        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),

        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
    )

    # Table: dashboard_views
    op.create_table(
        'dashboard_views',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('dashboard_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['dashboard_id'], ['dashboards.id'], ondelete='CASCADE'),

        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='SET NULL'),

        sa.Column('viewed_at', sa.DateTime(), nullable=False),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('device_type', sa.String(length=50), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
    )

    # ============================================================================
    # CREATE INDEXES
    # ============================================================================

    op.create_index('ix_dashboards_menu_parent', 'dashboards', ['menu_parent'])
    op.create_index('ix_dashboards_author_id', 'dashboards', ['author_id'])
    op.create_index('ix_dashboard_widgets_dashboard_id', 'dashboard_widgets', ['dashboard_id'])
    op.create_index('ix_dashboard_shares_dashboard_id', 'dashboard_shares', ['dashboard_id'])
    op.create_index('ix_dashboard_favorites_user_id', 'dashboard_favorites', ['user_id'])
    op.create_index('ix_dashboard_views_dashboard_id', 'dashboard_views', ['dashboard_id'])
    op.create_index('ix_dashboard_views_user_id', 'dashboard_views', ['user_id'])


def downgrade() -> None:
    # ============================================================================
    # DROP TABLES
    # ============================================================================

    op.drop_table('dashboard_views')
    op.drop_table('dashboard_favorites')
    op.drop_table('dashboard_shares')
    op.drop_table('widget_templates')
    op.drop_table('dashboard_widgets')
    op.drop_table('dashboards')

    # ============================================================================
    # DROP ENUMS
    # ============================================================================

    op.execute('DROP TYPE IF EXISTS layoutbreakpointenum')
    op.execute('DROP TYPE IF EXISTS refreshintervalenum')
    op.execute('DROP TYPE IF EXISTS datasourcetypeenum')
    op.execute('DROP TYPE IF EXISTS widgettypeenum')
    op.execute('DROP TYPE IF EXISTS menuparentenum')
