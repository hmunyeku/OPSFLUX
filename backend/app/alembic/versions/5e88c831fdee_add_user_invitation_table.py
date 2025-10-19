"""add_user_invitation_table

Revision ID: 5e88c831fdee
Revises: 1c073ccd24b7
Create Date: 2025-10-18 22:52:03.894674

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '5e88c831fdee'
down_revision = '1c073ccd24b7'
branch_labels = None
depends_on = None


def upgrade():
    # Create user_invitation table
    op.create_table(
        'userinvitation',
        sa.Column('id', postgresql.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role_id', postgresql.UUID(), nullable=True),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('invited_by_id', postgresql.UUID(), nullable=False),
        sa.Column('expires_at', sa.String(), nullable=False),
        sa.Column('accepted_at', sa.String(), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['invited_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['role_id'], ['role.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index(op.f('ix_userinvitation_email'), 'userinvitation', ['email'], unique=False)
    op.create_index(op.f('ix_userinvitation_token'), 'userinvitation', ['token'], unique=True)


def downgrade():
    # Drop indexes
    op.drop_index(op.f('ix_userinvitation_token'), table_name='userinvitation')
    op.drop_index(op.f('ix_userinvitation_email'), table_name='userinvitation')

    # Drop table
    op.drop_table('userinvitation')
