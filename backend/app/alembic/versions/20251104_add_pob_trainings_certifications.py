"""Add POB trainings, certifications, and periods

Revision ID: 20251104_000000
Revises: 20250104_000000
Create Date: 2025-11-04 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251104_000000'
down_revision = '20250104_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to stay_requests table
    op.add_column('stay_requests', sa.Column('function', sa.String(length=255), nullable=True))
    op.add_column('stay_requests', sa.Column('accommodation', sa.String(length=255), nullable=True))
    op.add_column('stay_requests', sa.Column('is_first_stay', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('stay_requests', sa.Column('pickup_location', sa.String(length=255), nullable=True))
    op.add_column('stay_requests', sa.Column('pickup_address', sa.String(length=500), nullable=True))

    # Make reason column nullable
    op.alter_column('stay_requests', 'reason',
               existing_type=sa.Text(),
               nullable=True)

    # Create stay_request_trainings table
    op.create_table('stay_request_trainings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('stay_request_id', sa.UUID(), nullable=False),
        sa.Column('type', sa.String(length=255), nullable=False),
        sa.Column('training_date', sa.Date(), nullable=True),
        sa.Column('validity_date', sa.Date(), nullable=True),
        sa.Column('mandatory', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['stay_request_id'], ['stay_requests.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stay_request_trainings_id'), 'stay_request_trainings', ['id'], unique=False)

    # Create stay_request_certifications table
    op.create_table('stay_request_certifications',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('stay_request_id', sa.UUID(), nullable=False),
        sa.Column('type', sa.String(length=255), nullable=False),
        sa.Column('certification_date', sa.Date(), nullable=True),
        sa.Column('validity_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['stay_request_id'], ['stay_requests.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stay_request_certifications_id'), 'stay_request_certifications', ['id'], unique=False)

    # Create stay_request_periods table
    op.create_table('stay_request_periods',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('stay_request_id', sa.UUID(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['stay_request_id'], ['stay_requests.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_stay_request_periods_id'), 'stay_request_periods', ['id'], unique=False)


def downgrade():
    # Drop tables
    op.drop_index(op.f('ix_stay_request_periods_id'), table_name='stay_request_periods')
    op.drop_table('stay_request_periods')
    op.drop_index(op.f('ix_stay_request_certifications_id'), table_name='stay_request_certifications')
    op.drop_table('stay_request_certifications')
    op.drop_index(op.f('ix_stay_request_trainings_id'), table_name='stay_request_trainings')
    op.drop_table('stay_request_trainings')

    # Remove columns from stay_requests
    op.alter_column('stay_requests', 'reason',
               existing_type=sa.Text(),
               nullable=False)
    op.drop_column('stay_requests', 'pickup_address')
    op.drop_column('stay_requests', 'pickup_location')
    op.drop_column('stay_requests', 'is_first_stay')
    op.drop_column('stay_requests', 'accommodation')
    op.drop_column('stay_requests', 'function')
