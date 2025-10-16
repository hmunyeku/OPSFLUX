"""add bookmarks table

Revision ID: l8m9n0o1p2q3
Revises: 65a0a92b9cc8
Create Date: 2025-10-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'l8m9n0o1p2q3'
down_revision = '65a0a92b9cc8'
branch_labels = None
depends_on = None


def upgrade():
    # Create bookmarks table
    op.create_table(
        'bookmarks',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('path', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deleted_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bookmarks_user_id'), 'bookmarks', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_bookmarks_user_id'), table_name='bookmarks')
    op.drop_table('bookmarks')
