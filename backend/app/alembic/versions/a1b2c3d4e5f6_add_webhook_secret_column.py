"""add_webhook_secret_column

Revision ID: a1b2c3d4e5f6
Revises: s1t2u3v4w5x6
Create Date: 2025-10-23 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import secrets

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 's1t2u3v4w5x6'
branch_labels = None
depends_on = None


def upgrade():
    # Add secret column to webhook table with a temporary default
    # We use a temporary default to handle existing rows
    op.add_column('webhook', sa.Column('secret', sa.String(length=128), nullable=True))

    # Generate secrets for existing webhooks
    # Note: This is done in Python code during migration
    # In production, you might want to run a separate script to notify users
    connection = op.get_bind()
    result = connection.execute(sa.text("SELECT id FROM webhook"))
    webhook_ids = result.fetchall()

    for (webhook_id,) in webhook_ids:
        new_secret = secrets.token_hex(32)  # Generate 64 character hex string
        connection.execute(
            sa.text("UPDATE webhook SET secret = :secret WHERE id = :id"),
            {"secret": new_secret, "id": webhook_id}
        )

    # Now make the column non-nullable
    op.alter_column('webhook', 'secret', nullable=False)


def downgrade():
    # Remove secret column from webhook table
    op.drop_column('webhook', 'secret')
