"""Projects: add ProjectTask.pob_quota field.

Spec section 1.5 / 2.4: POB demande on a project task. When a task is sent
to the Planner, the linked PlannerActivity inherits pob_quota as its
initial pax_quota. Subsequent edits to pob_quota in Projects are mirrored
to linked Planner activities and trigger a revision suggestion notification
to the arbitre.

Revision ID: 117_project_task_pob_quota
Revises: 116_add_packlog_request_requester_and_sender_contact
"""
from alembic import op
import sqlalchemy as sa


revision = "117_project_task_pob_quota"
down_revision = "116_add_packlog_request_requester_and_sender_contact"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_tasks",
        sa.Column(
            "pob_quota",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.alter_column("project_tasks", "pob_quota", server_default=None)


def downgrade() -> None:
    op.drop_column("project_tasks", "pob_quota")
