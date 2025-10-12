"""Add AbstractBaseModel fields (audit trail, soft delete, external_id)

Revision ID: 03451678c2db
Revises: 1a31ce608336
Create Date: 2025-10-12 21:57:54.020203

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '03451678c2db'
down_revision = '1a31ce608336'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to user table
    op.add_column('user', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.add_column('user', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('user', sa.Column('created_by_id', sa.UUID(), nullable=True))
    op.add_column('user', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('user', sa.Column('updated_by_id', sa.UUID(), nullable=True))
    op.add_column('user', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('user', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Add indexes
    op.create_index('ix_user_external_id', 'user', ['external_id'], unique=True)

    # Add new columns to item table
    op.add_column('item', sa.Column('external_id', sa.String(length=255), nullable=True))
    op.add_column('item', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('item', sa.Column('created_by_id', sa.UUID(), nullable=True))
    op.add_column('item', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')))
    op.add_column('item', sa.Column('updated_by_id', sa.UUID(), nullable=True))
    op.add_column('item', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.add_column('item', sa.Column('deleted_by_id', sa.UUID(), nullable=True))

    # Add indexes
    op.create_index('ix_item_external_id', 'item', ['external_id'], unique=True)


def downgrade():
    # Drop indexes
    op.drop_index('ix_item_external_id', table_name='item')
    op.drop_index('ix_user_external_id', table_name='user')

    # Drop columns from item table
    op.drop_column('item', 'deleted_by_id')
    op.drop_column('item', 'deleted_at')
    op.drop_column('item', 'updated_by_id')
    op.drop_column('item', 'updated_at')
    op.drop_column('item', 'created_by_id')
    op.drop_column('item', 'created_at')
    op.drop_column('item', 'external_id')

    # Drop columns from user table
    op.drop_column('user', 'deleted_by_id')
    op.drop_column('user', 'deleted_at')
    op.drop_column('user', 'updated_by_id')
    op.drop_column('user', 'updated_at')
    op.drop_column('user', 'created_by_id')
    op.drop_column('user', 'created_at')
    op.drop_column('user', 'external_id')
