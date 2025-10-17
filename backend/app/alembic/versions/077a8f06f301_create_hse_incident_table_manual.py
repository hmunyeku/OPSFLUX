"""create_hse_incident_table_manual

Revision ID: 077a8f06f301
Revises: 8bce13aa7127
Create Date: 2025-10-17 06:45:41.670601

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '077a8f06f301'
down_revision = '8bce13aa7127'
branch_labels = None
depends_on = None


def upgrade():
    # Créer la table hse_incident pour le module HSE
    op.create_table(
        'hse_incident',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(), nullable=True),
        sa.Column('updated_by_id', postgresql.UUID(), nullable=True),
        sa.Column('deleted_by_id', postgresql.UUID(), nullable=True),

        # Champs spécifiques HSE
        sa.Column('number', sa.String(length=50), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('severity_level', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=False),
        sa.Column('site_id', postgresql.UUID(), nullable=True),
        sa.Column('incident_date', sa.DateTime(), nullable=False),
        sa.Column('reported_by_id', postgresql.UUID(), nullable=True),
        sa.Column('witnesses', sa.Text(), nullable=True),
        sa.Column('injured_persons', sa.Text(), nullable=True),
        sa.Column('requires_investigation', sa.Boolean(), nullable=False),
        sa.Column('investigation_started_at', sa.DateTime(), nullable=True),
        sa.Column('investigation_completed_at', sa.DateTime(), nullable=True),
        sa.Column('investigation_notes', sa.Text(), nullable=True),
        sa.Column('corrective_actions', sa.Text(), nullable=True),
        sa.Column('preventive_actions', sa.Text(), nullable=True),
        sa.Column('is_closed', sa.Boolean(), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('closed_by_id', postgresql.UUID(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        # sa.ForeignKeyConstraint(['site_id'], ['business_unit.id']),  # Table business_unit n'existe pas encore
        sa.ForeignKeyConstraint(['reported_by_id'], ['user.id']),
        sa.ForeignKeyConstraint(['closed_by_id'], ['user.id']),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id']),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id']),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id']),
    )

    # Créer les index
    op.create_index('ix_hse_incident_number', 'hse_incident', ['number'], unique=True)
    op.create_index('ix_hse_incident_type', 'hse_incident', ['type'])
    op.create_index('ix_hse_incident_severity_level', 'hse_incident', ['severity_level'])
    op.create_index('ix_hse_incident_is_closed', 'hse_incident', ['is_closed'])
    op.create_index('ix_hse_incident_incident_date', 'hse_incident', ['incident_date'])


def downgrade():
    op.drop_index('ix_hse_incident_incident_date', table_name='hse_incident')
    op.drop_index('ix_hse_incident_is_closed', table_name='hse_incident')
    op.drop_index('ix_hse_incident_severity_level', table_name='hse_incident')
    op.drop_index('ix_hse_incident_type', table_name='hse_incident')
    op.drop_index('ix_hse_incident_number', table_name='hse_incident')
    op.drop_table('hse_incident')
