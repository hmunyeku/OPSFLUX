"""add companies and contacts tables for tiers

Revision ID: 20251102_tiers
Revises: 20251102_add_stay_requests_pob
Create Date: 2025-11-02 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251102_tiers'
down_revision = '20251102_add_stay_requests_pob'
branch_labels = None
depends_on = None


def upgrade():
    # Create companies table
    op.create_table(
        'companies',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('legal_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('siret', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('status', sa.VARCHAR(length=20), nullable=False),
        sa.Column('sector', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('address', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('city', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('country', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('website', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('logo', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('revenue', sa.Float(), nullable=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('last_interaction', sa.DateTime(), nullable=True),
        sa.Column('types', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_companies_name'), 'companies', ['name'], unique=False)
    op.create_index(op.f('ix_companies_siret'), 'companies', ['siret'], unique=True)

    # Create contacts table
    op.create_table(
        'contacts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('first_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('last_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('phone', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('mobile', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('position', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('department', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('preferred_contact', sa.VARCHAR(length=10), nullable=False),
        sa.Column('last_contact', sa.DateTime(), nullable=True),
        sa.Column('notes', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
        sa.Column('avatar', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('linked_in', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('status', sa.VARCHAR(length=10), nullable=False),
        sa.Column('company_id', sa.UUID(), nullable=False),
        sa.Column('tags', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['deleted_by_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contacts_company_id'), 'contacts', ['company_id'], unique=False)
    op.create_index(op.f('ix_contacts_email'), 'contacts', ['email'], unique=False)
    op.create_index(op.f('ix_contacts_last_name'), 'contacts', ['last_name'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_contacts_last_name'), table_name='contacts')
    op.drop_index(op.f('ix_contacts_email'), table_name='contacts')
    op.drop_index(op.f('ix_contacts_company_id'), table_name='contacts')
    op.drop_table('contacts')
    op.drop_index(op.f('ix_companies_siret'), table_name='companies')
    op.drop_index(op.f('ix_companies_name'), table_name='companies')
    op.drop_table('companies')
