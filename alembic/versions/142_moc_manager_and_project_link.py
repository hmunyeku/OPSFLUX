"""MOC — manager_id (chef de projet MOC) + project promotion link.

Revision ID: 142_moc_manager_project
Revises: 141_moc_hierarchy_close_sig

Two orthogonal additions, grouped because both revolve around who "owns"
the MOC after it has been validated:

  • `manager_id` — the Chef de Projet MOC. Any authenticated user can be
    designated as the operational manager of a MOC (not necessarily the
    initiator, not necessarily the CDS). Appears on the Fiche and drives
    notifications.

  • `project_id` — optional FK to a Project created via
    `POST /moc/{id}/promote-to-project`. Once linked, the project's
    progress drives the MOC execution progress; closing the project
    closes the MOC's execution phase.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "142_moc_manager_project"
down_revision = "141_moc_hierarchy_close_sig"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mocs",
        sa.Column(
            "manager_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="Chef de projet MOC — operational owner after validation.",
        ),
    )
    op.create_index("idx_mocs_manager", "mocs", ["manager_id"])

    op.add_column(
        "mocs",
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
            comment="Linked project when the MOC has been promoted to a project.",
        ),
    )
    op.create_index("idx_mocs_project", "mocs", ["project_id"])


def downgrade() -> None:
    op.drop_index("idx_mocs_project", table_name="mocs")
    op.drop_column("mocs", "project_id")
    op.drop_index("idx_mocs_manager", table_name="mocs")
    op.drop_column("mocs", "manager_id")
