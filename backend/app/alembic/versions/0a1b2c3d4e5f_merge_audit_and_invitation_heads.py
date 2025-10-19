"""merge_audit_and_invitation_heads

Revision ID: 0a1b2c3d4e5f
Revises: 1ae168ef4313, 010c0b0076a3
Create Date: 2025-10-19 09:56:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0a1b2c3d4e5f'
down_revision = ('1ae168ef4313', '010c0b0076a3')
branch_labels = None
depends_on = None


def upgrade():
    # This is a merge migration - no changes needed
    pass


def downgrade():
    # This is a merge migration - no changes needed
    pass
