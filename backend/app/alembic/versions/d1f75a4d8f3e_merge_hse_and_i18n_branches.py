"""merge_hse_and_i18n_branches

Revision ID: d1f75a4d8f3e
Revises: 077a8f06f301, c9d4e5f12a11
Create Date: 2025-10-17 13:51:18.023653

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'd1f75a4d8f3e'
down_revision = ('077a8f06f301', 'c9d4e5f12a11')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
