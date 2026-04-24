"""Add attachments_manifest to support_agent_runs.

Stores the list of ticket attachments + inline description images the
worker should make available to the agent container under
`/workspace/.attachments/`. Populated by the harness at run creation;
read by the worker daemon right before docker launch.

Shape:
  [
    {
      "attachment_id": "uuid",
      "filename": "screenshot.png",
      "original_name": "Capture d'écran 2026-04-24.png",
      "content_type": "image/png",
      "size_bytes": 123456,
      "storage_path": "attachments/support_ticket/...",
      "source": "ticket" | "comment" | "description_img",
      "description": null
    },
    ...
  ]

Why a dedicated column instead of piggybacking on `report_json`:
  - `report_json` gets fully overwritten by the agent at the end of
    the run, so any manifest stored there disappears.
  - Dedicated column keeps inputs (manifest) separate from outputs
    (report) — cleaner to audit and debug.

Revision ID: 156_agent_run_attachments_manifest
Revises: 155_ticket_sla_satisfaction
Create Date: 2026-04-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "156_agent_run_attachments_manifest"
down_revision = "155_ticket_sla_satisfaction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "support_agent_runs",
        sa.Column("attachments_manifest", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("support_agent_runs", "attachments_manifest")
