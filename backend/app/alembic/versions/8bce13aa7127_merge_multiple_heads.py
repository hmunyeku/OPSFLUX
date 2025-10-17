"""merge_multiple_heads

Revision ID: 8bce13aa7127
Revises: 5a6e193f86fe, 98bb2dda688e
Create Date: 2025-10-17 06:24:12.471653

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '8bce13aa7127'
down_revision = ('5a6e193f86fe', '98bb2dda688e')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
