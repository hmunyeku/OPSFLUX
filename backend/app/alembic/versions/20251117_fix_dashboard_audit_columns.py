"""fix dashboard tables audit columns naming

Revision ID: 20251117_fix_dashboard_audit_columns
Revises: 20251104_add_pob_trainings_certifications
Create Date: 2025-11-17 21:06:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251117000000'
down_revision = '20251104_add_external_id'
branch_labels = None
depends_on = None


def upgrade():
    """
    Rename audit columns to match AbstractBaseModel convention:
    - created_by -> created_by_id
    - updated_by -> updated_by_id
    - Add deleted_by_id column
    """

    # Fix dashboards table
    op.execute("ALTER TABLE dashboards RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE dashboards RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('dashboards', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Fix dashboard_widgets table
    op.execute("ALTER TABLE dashboard_widgets RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE dashboard_widgets RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('dashboard_widgets', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Fix dashboard_shares table
    op.execute("ALTER TABLE dashboard_shares RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE dashboard_shares RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('dashboard_shares', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Fix dashboard_favorites table
    op.execute("ALTER TABLE dashboard_favorites RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE dashboard_favorites RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('dashboard_favorites', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Fix dashboard_views table
    op.execute("ALTER TABLE dashboard_views RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE dashboard_views RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('dashboard_views', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Fix widget_templates table
    op.execute("ALTER TABLE widget_templates RENAME COLUMN created_by TO created_by_id")
    op.execute("ALTER TABLE widget_templates RENAME COLUMN updated_by TO updated_by_id")
    op.add_column('widget_templates', sa.Column('deleted_by_id', sa.UUID(), nullable=True))


def downgrade():
    """
    Revert audit columns back to original naming
    """

    # Revert dashboards table
    op.drop_column('dashboards', 'deleted_by_id')
    op.execute("ALTER TABLE dashboards RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE dashboards RENAME COLUMN updated_by_id TO updated_by")

    # Revert dashboard_widgets table
    op.drop_column('dashboard_widgets', 'deleted_by_id')
    op.execute("ALTER TABLE dashboard_widgets RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE dashboard_widgets RENAME COLUMN updated_by_id TO updated_by")

    # Revert dashboard_shares table
    op.drop_column('dashboard_shares', 'deleted_by_id')
    op.execute("ALTER TABLE dashboard_shares RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE dashboard_shares RENAME COLUMN updated_by_id TO updated_by")

    # Revert dashboard_favorites table
    op.drop_column('dashboard_favorites', 'deleted_by_id')
    op.execute("ALTER TABLE dashboard_favorites RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE dashboard_favorites RENAME COLUMN updated_by_id TO updated_by")

    # Revert dashboard_views table
    op.drop_column('dashboard_views', 'deleted_by_id')
    op.execute("ALTER TABLE dashboard_views RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE dashboard_views RENAME COLUMN updated_by_id TO updated_by")

    # Revert widget_templates table
    op.drop_column('widget_templates', 'deleted_by_id')
    op.execute("ALTER TABLE widget_templates RENAME COLUMN created_by_id TO created_by")
    op.execute("ALTER TABLE widget_templates RENAME COLUMN updated_by_id TO updated_by")
