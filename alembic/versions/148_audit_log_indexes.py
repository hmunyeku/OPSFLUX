"""Add composite indexes to audit_log for the common query patterns.

Revision ID: 148_audit_log_indexes
Revises:     147_notifications_indexes

The audit_log table was created in 001_initial_schema with no
secondary indexes. Every sensitive action (RBAC delete, login,
GDPR export, etc.) inserts a row; the Settings → Audit tab and the
per-resource audit drawers then read it back under one of three
filter patterns:

  * (entity_id, created_at desc)         — admin audit list
  * (resource_type, resource_id)         — "what happened to this?"
  * (user_id, created_at desc)           — "what did X do?"

All three were full scans. With a few thousand rows accumulated this
starts to show in p95 latency of the Settings tabs and the detail
drawers — cheap to fix before it becomes user-visible.
"""

from alembic import op


revision = "148_audit_log_indexes"
down_revision = "147_notifications_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created "
        "ON audit_log (entity_id, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_resource "
        "ON audit_log (resource_type, resource_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_user_created "
        "ON audit_log (user_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_audit_log_entity_created")
    op.execute("DROP INDEX IF EXISTS idx_audit_log_resource")
    op.execute("DROP INDEX IF EXISTS idx_audit_log_user_created")
