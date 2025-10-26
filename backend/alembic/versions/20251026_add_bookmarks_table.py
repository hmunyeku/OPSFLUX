"""add bookmarks table

Revision ID: 20251026_add_bookmarks
Revises: 20251025130000_add_user_notification_preferences
Create Date: 2025-10-26 09:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251026_add_bookmarks'
down_revision = '20251025130000_add_user_notification_preferences'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create bookmarks table
    op.create_table(
        'bookmarks',
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('path', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index on user_id for performance
    op.create_index(op.f('ix_bookmarks_user_id'), 'bookmarks', ['user_id'], unique=False)

    # Create index on external_id
    op.create_index(op.f('ix_bookmarks_external_id'), 'bookmarks', ['external_id'], unique=False)


def downgrade() -> None:
    # Drop indexes first
    op.drop_index(op.f('ix_bookmarks_external_id'), table_name='bookmarks')
    op.drop_index(op.f('ix_bookmarks_user_id'), table_name='bookmarks')

    # Drop table
    op.drop_table('bookmarks')
