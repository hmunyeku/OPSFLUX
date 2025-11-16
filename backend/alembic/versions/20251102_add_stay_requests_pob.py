"""add stay requests and pob management

Revision ID: 20251102_add_stay_requests_pob
Revises: 20251026_add_bookmarks_table
Create Date: 2025-11-02 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251102_add_stay_requests_pob'
down_revision = '20251026_add_bookmarks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create stay_requests table
    op.create_table(
        'stay_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('person_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('person_user_id', sa.UUID(), nullable=True),
        sa.Column('site', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('reason', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('project', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='draft'),
        sa.Column('validation_level', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_levels', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('company', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('department', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('cost_center', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('emergency_contact', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('special_requirements', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['person_user_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stay_requests_status'), 'stay_requests', ['status'], unique=False)
    op.create_index(op.f('ix_stay_requests_site'), 'stay_requests', ['site'], unique=False)
    op.create_index(op.f('ix_stay_requests_start_date'), 'stay_requests', ['start_date'], unique=False)
    op.create_index(op.f('ix_stay_requests_created_at'), 'stay_requests', ['created_at'], unique=False)
    op.create_index(op.f('ix_stay_requests_deleted_at'), 'stay_requests', ['deleted_at'], unique=False)

    # Create stay_request_validators table
    op.create_table(
        'stay_request_validators',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('stay_request_id', sa.UUID(), nullable=False),
        sa.Column('validator_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('validator_user_id', sa.UUID(), nullable=True),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='pending'),
        sa.Column('validation_date', sa.DateTime(), nullable=True),
        sa.Column('validation_notes', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['stay_request_id'], ['stay_requests.id'], ),
        sa.ForeignKeyConstraint(['validator_user_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stay_request_validators_stay_request_id'), 'stay_request_validators', ['stay_request_id'], unique=False)
    op.create_index(op.f('ix_stay_request_validators_level'), 'stay_request_validators', ['level'], unique=False)
    op.create_index(op.f('ix_stay_request_validators_status'), 'stay_request_validators', ['status'], unique=False)
    op.create_index(op.f('ix_stay_request_validators_deleted_at'), 'stay_request_validators', ['deleted_at'], unique=False)


def downgrade() -> None:
    # Drop stay_request_validators table
    op.drop_index(op.f('ix_stay_request_validators_deleted_at'), table_name='stay_request_validators')
    op.drop_index(op.f('ix_stay_request_validators_status'), table_name='stay_request_validators')
    op.drop_index(op.f('ix_stay_request_validators_level'), table_name='stay_request_validators')
    op.drop_index(op.f('ix_stay_request_validators_stay_request_id'), table_name='stay_request_validators')
    op.drop_table('stay_request_validators')

    # Drop stay_requests table
    op.drop_index(op.f('ix_stay_requests_deleted_at'), table_name='stay_requests')
    op.drop_index(op.f('ix_stay_requests_created_at'), table_name='stay_requests')
    op.drop_index(op.f('ix_stay_requests_start_date'), table_name='stay_requests')
    op.drop_index(op.f('ix_stay_requests_site'), table_name='stay_requests')
    op.drop_index(op.f('ix_stay_requests_status'), table_name='stay_requests')
    op.drop_table('stay_requests')
