"""MOC — explicit temporary_start_date / temporary_end_date + reminder log.

Revision ID: 137_moc_temp_dates_reminders
Revises: 136_moc_exec_accord_process_engineer

The CDC and the Perenco paper form ask to record the exact period of a
temporary modification (start → end), not just a duration in days. We keep
`temporary_duration_days` as a legacy/backup field but the business logic
shifts to the two dates. Also add a `moc_reminder_log` table so the
scheduler job can stay idempotent (never send the same J-N reminder twice
for the same MOC).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "137_moc_temp_dates_reminders"
down_revision = "136_moc_exec_accord_process_engineer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Temporary modification period ─────────────────────────────
    op.add_column("mocs", sa.Column("temporary_start_date", sa.Date(), nullable=True))
    op.add_column("mocs", sa.Column("temporary_end_date", sa.Date(), nullable=True))
    op.create_index("idx_mocs_temporary_end", "mocs", ["temporary_end_date"])

    # ── Reminder log (idempotent dispatch) ────────────────────────
    op.create_table(
        "moc_reminder_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("moc_id", UUID(as_uuid=True), sa.ForeignKey("mocs.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "reminder_kind",
            sa.String(length=40),
            nullable=False,
            comment="temporary_expiry | execution_overdue | validation_overdue",
        ),
        sa.Column(
            "days_before",
            sa.Integer(),
            nullable=False,
            comment="Threshold (in days) that triggered this reminder",
        ),
        sa.Column(
            "target_date",
            sa.Date(),
            nullable=False,
            comment="The date the reminder was targeting (e.g. temporary_end_date)",
        ),
        sa.Column("sent_to_count", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint(
            "moc_id", "reminder_kind", "days_before",
            name="uq_moc_reminder_once_per_threshold",
        ),
    )
    op.create_index("idx_moc_reminder_log_moc", "moc_reminder_log", ["moc_id"])


def downgrade() -> None:
    op.drop_index("idx_moc_reminder_log_moc", table_name="moc_reminder_log")
    op.drop_table("moc_reminder_log")
    op.drop_index("idx_mocs_temporary_end", table_name="mocs")
    op.drop_column("mocs", "temporary_end_date")
    op.drop_column("mocs", "temporary_start_date")
