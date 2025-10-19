"""add_signature_image_to_user

Revision ID: d7398f055368
Revises: 19e7d482d196
Create Date: 2025-10-19 16:27:53.731658

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'd7398f055368'
down_revision = '19e7d482d196'
branch_labels = None
depends_on = None


def upgrade():
    # Add signature_image column to user table
    op.add_column('user', sa.Column('signature_image', sa.Text(), nullable=True))


def downgrade():
    # Remove signature_image column from user table
    op.drop_column('user', 'signature_image')
