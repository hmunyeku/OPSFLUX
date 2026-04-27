"""Capture the concrete arbitration action details on planner conflict audits.

Adds two columns to `planner_conflict_audit`:

  * target_activity_id (UUID, nullable)
        The activity the operator acted upon (replanned, cancelled,
        had its quota reduced, …). NULL when the resolution was a
        pure decision (approve_both, deferred) with no concrete action.

  * action_payload (JSONB, nullable)
        Full applied-action summary as produced by the resolve
        endpoint. Shape:
            {
              "action": "shift" | "set_window" | "set_quota" | "cancel",
              "before": {start_date, end_date, pax_quota, status},
              "after":  {start_date, end_date, pax_quota, status},
              "params": {... action-specific input ...}
            }

Why: the audit row used to record only `new_resolution = 'reschedule'`,
which the operator's manager called "ambiguous" — *what* was rescheduled
and *by how much* lived only in the resolution_note free-text field
(which the operator might not fill in). With these columns the panel
and PDF can render an explicit decision line:

    "Replanifié l'activité X de +5 j (15 mai → 20 mai)"

instead of just "Replanifier".

This is a MERGE migration: 156_agent_run_attachments_manifest and
157_project_situations were two parallel heads at the time of writing;
declaring both as down_revision collapses them into a single linear
history.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# Revision identifiers, used by Alembic.
revision = "158_planner_conflict_audit_action_details"
down_revision = (
    "156_agent_run_attachments_manifest",
    "157_project_situations",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planner_conflict_audit",
        sa.Column(
            "target_activity_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "planner_conflict_audit",
        sa.Column(
            "action_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    # No FK constraint on target_activity_id: activities can be hard-
    # deleted in some flows (cancellation cleanup) and the audit row
    # MUST survive — it's append-only history of what the operator did.
    # We index for read-side filtering on "decisions touching activity X".
    op.create_index(
        "idx_planner_conflict_audit_target_activity",
        "planner_conflict_audit",
        ["target_activity_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_planner_conflict_audit_target_activity",
        table_name="planner_conflict_audit",
    )
    op.drop_column("planner_conflict_audit", "action_payload")
    op.drop_column("planner_conflict_audit", "target_activity_id")
