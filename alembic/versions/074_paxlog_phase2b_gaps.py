"""PaxLog Phase 2b gaps — pax_status, ads_events, enriched signalements.

1. Add pax_status column to users and tier_contacts
2. Create ads_events audit log table
3. Enrich pax_incidents with signalement fields

Revision ID: 074_paxlog_phase2b_gaps
Revises: 073_remove_pax_profiles
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "074_paxlog_phase2b_gaps"
down_revision = "073_remove_pax_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. pax_status on users + tier_contacts ────────────────────────
    op.add_column(
        "users",
        sa.Column("pax_status", sa.String(20), nullable=False, server_default="active"),
    )
    op.add_column(
        "tier_contacts",
        sa.Column("pax_status", sa.String(20), nullable=False, server_default="active"),
    )

    # ── 2. ads_events (immutable audit log) ───────────────────────────
    op.create_table(
        "ads_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ads_pax_id", UUID(as_uuid=True), sa.ForeignKey("ads_pax.id"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("old_status", sa.String(40), nullable=True),
        sa.Column("new_status", sa.String(40), nullable=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata_json", JSONB(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("idx_ads_events_ads", "ads_events", ["ads_id"])
    op.create_index("idx_ads_events_type", "ads_events", ["entity_id", "event_type"])
    op.create_index("idx_ads_events_time", "ads_events", ["entity_id", "recorded_at"])

    # ── 3. Enrich pax_incidents for signalements ──────────────────────
    op.add_column("pax_incidents", sa.Column("reference", sa.String(50), nullable=True))
    op.add_column("pax_incidents", sa.Column("category", sa.String(30), nullable=True))
    op.add_column("pax_incidents", sa.Column("decision", sa.String(40), nullable=True))
    op.add_column("pax_incidents", sa.Column("decision_duration_days", sa.SmallInteger(), nullable=True))
    op.add_column("pax_incidents", sa.Column("decision_end_date", sa.Date(), nullable=True))
    op.add_column("pax_incidents", sa.Column("evidence_urls", JSONB(), nullable=True))


def downgrade() -> None:
    # pax_incidents enrichment
    op.drop_column("pax_incidents", "evidence_urls")
    op.drop_column("pax_incidents", "decision_end_date")
    op.drop_column("pax_incidents", "decision_duration_days")
    op.drop_column("pax_incidents", "decision")
    op.drop_column("pax_incidents", "category")
    op.drop_column("pax_incidents", "reference")

    # ads_events
    op.drop_index("idx_ads_events_time", table_name="ads_events")
    op.drop_index("idx_ads_events_type", table_name="ads_events")
    op.drop_index("idx_ads_events_ads", table_name="ads_events")
    op.drop_table("ads_events")

    # pax_status
    op.drop_column("tier_contacts", "pax_status")
    op.drop_column("users", "pax_status")
