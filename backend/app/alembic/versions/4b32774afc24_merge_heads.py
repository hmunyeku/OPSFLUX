"""merge_heads

Revision ID: 4b32774afc24
Revises: ab7cd30d0b00, daba4b9668a0
Create Date: 2025-10-17 17:00:54.941937

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '4b32774afc24'
down_revision = ('ab7cd30d0b00', 'daba4b9668a0')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
