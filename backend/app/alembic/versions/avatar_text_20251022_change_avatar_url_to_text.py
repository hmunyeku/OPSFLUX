"""change_avatar_url_to_text

Revision ID: avatar_text_20251022
Revises: fdc46ca7d3eb
Create Date: 2025-10-22 09:00:44.211991

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'avatar_text_20251022'
down_revision = 'fdc46ca7d3eb'
branch_labels = None
depends_on = None


def upgrade():
    # Change avatar_url column from VARCHAR(500) to TEXT to support base64 images
    op.alter_column('user', 'avatar_url',
                    type_=sa.Text(),
                    existing_type=sa.String(length=500),
                    nullable=True)


def downgrade():
    # Revert avatar_url column back to VARCHAR(500)
    op.alter_column('user', 'avatar_url',
                    type_=sa.String(length=500),
                    existing_type=sa.Text(),
                    nullable=True)
