"""Merge Alembic heads + add composite indexes on the notifications table.

Revision ID: 147_notifications_indexes
Revises:     095_project_debt_cleanup, 096_add_pickup_stop_assignments,
             146_migrate_legacy_milestones

Two motivations bundled because they block each other:

1. The notifications table was created (via 001_initial_schema) with
   NO secondary indexes beyond the UUID primary key. The notification
   bell polls `COUNT(*) WHERE user_id AND entity_id AND read=false`
   every minute per connected user, which degenerates to a full table
   scan as the table grows — noticeable backend load once each user
   accumulates hundreds of notifications.

   Two composite indexes cover the common access patterns:
     * (user_id, entity_id, read)        — unread-count badge
     * (user_id, entity_id, created_at)  — journal / dropdown ORDER BY

2. The repo had THREE Alembic heads at the time this fix was written:
     - 095_project_debt_cleanup
     - 096_add_pickup_stop_assignments
     - 146_migrate_legacy_milestones
   Alembic upgrade head would fail with 'Multiple head revisions are
   present'. This migration declares all three as down_revision so it
   becomes the single new head and future migrations can just chain
   off it.
"""

from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────

revision = "147_notifications_indexes"
down_revision = (
    "095_project_debt_cleanup",
    "096_add_pickup_stop_assignments",
    "146_migrate_legacy_milestones",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS because the index could already be present on older
    # deployments where someone ran the equivalent DDL by hand.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_entity_read "
        "ON notifications (user_id, entity_id, read)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_entity_created "
        "ON notifications (user_id, entity_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_notifications_user_entity_read")
    op.execute("DROP INDEX IF EXISTS idx_notifications_user_entity_created")
