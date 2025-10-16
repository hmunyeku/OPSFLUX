"""Add HSE Incident table

Revision ID: p1q2r3s4t5u6
Revises: 5a6e193f86fe
Create Date: 2025-10-16 21:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'p1q2r3s4t5u6'
down_revision: Union[str, None] = '5a6e193f86fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if table already exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    if 'hse_incident' in inspector.get_table_names():
        print("Table hse_incident already exists, skipping creation")
        return

    # Create hse_incident table (using VARCHAR for enums to avoid conflicts)
    op.create_table(
        'hse_incident',
        # Colonnes héritées de AbstractBaseModel
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),

        # Colonnes spécifiques à Incident
        sa.Column('number', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),  # enum as string
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('severity_level', sa.String(length=20), nullable=False),  # enum as string
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=False),
        sa.Column('location', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('site_id', sa.UUID(), nullable=True),
        sa.Column('incident_date', sa.DateTime(), nullable=False),
        sa.Column('reported_by_id', sa.UUID(), nullable=True),
        sa.Column('witnesses', sa.TEXT(), nullable=True),
        sa.Column('injured_persons', sa.TEXT(), nullable=True),
        sa.Column('requires_investigation', sa.Boolean(), nullable=False),
        sa.Column('investigation_started_at', sa.DateTime(), nullable=True),
        sa.Column('investigation_completed_at', sa.DateTime(), nullable=True),
        sa.Column('investigation_notes', sa.TEXT(), nullable=True),
        sa.Column('corrective_actions', sa.TEXT(), nullable=True),
        sa.Column('preventive_actions', sa.TEXT(), nullable=True),
        sa.Column('is_closed', sa.Boolean(), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('closed_by_id', sa.UUID(), nullable=True),

        # Contraintes
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['reported_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['closed_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('number')
    )

    # Create indexes
    op.create_index('ix_hse_incident_id', 'hse_incident', ['id'])
    op.create_index('ix_hse_incident_external_id', 'hse_incident', ['external_id'])
    op.create_index('ix_hse_incident_number', 'hse_incident', ['number'], unique=True)
    op.create_index('ix_hse_incident_type', 'hse_incident', ['type'])
    op.create_index('ix_hse_incident_severity_level', 'hse_incident', ['severity_level'])
    op.create_index('ix_hse_incident_is_closed', 'hse_incident', ['is_closed'])
    op.create_index('ix_hse_incident_incident_date', 'hse_incident', ['incident_date'])
    op.create_index('ix_hse_incident_deleted_at', 'hse_incident', ['deleted_at'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_hse_incident_deleted_at', table_name='hse_incident')
    op.drop_index('ix_hse_incident_incident_date', table_name='hse_incident')
    op.drop_index('ix_hse_incident_is_closed', table_name='hse_incident')
    op.drop_index('ix_hse_incident_severity_level', table_name='hse_incident')
    op.drop_index('ix_hse_incident_type', table_name='hse_incident')
    op.drop_index('ix_hse_incident_number', table_name='hse_incident')
    op.drop_index('ix_hse_incident_external_id', table_name='hse_incident')
    op.drop_index('ix_hse_incident_id', table_name='hse_incident')

    # Drop table
    op.drop_table('hse_incident')

    # Drop enum types
    incident_severity = postgresql.ENUM('low', 'medium', 'high', 'critical', name='incidentseverity')
    incident_severity.drop(op.get_bind(), checkfirst=True)

    incident_type = postgresql.ENUM('near_miss', 'injury', 'environmental', 'equipment', 'property_damage', name='incidenttype')
    incident_type.drop(op.get_bind(), checkfirst=True)
