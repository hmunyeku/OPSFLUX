"""Add performance indexes identified by module audits.

Indexes added:
  - idx_ads_status_entity_dates on ads (status, entity_id, start_date)
      Speeds up the ADS list queries that filter by status + entity + date
      range. The waitlist and capacity-check code iterates daily windows
      and was doing full table scans.

  - idx_ads_pax_status on ads_pax (ads_id, pax_status)
      Composite index for the common pattern of loading all PAX for a
      given ADS filtered by compliance status (compliant / blocked /
      waitlisted).

  - idx_cargo_created_at on cargo_items (created_at)
      History queries (cargo/{id}/history) and date-range list filters
      ORDER BY created_at — was doing a full table scan. This index was
      already added in the ORM model during the PackLog isolation
      refactor but the actual CREATE INDEX was missing as a migration.

  - idx_planner_activity_entity_dates on planner_activities (entity_id, start_date, end_date)
      The Gantt data loader and capacity heatmap query activities by
      entity + date range on every page load. Without this index the
      WHERE clause on start_date/end_date scans the full table.

Revision ID: 124
"""

from alembic import op

revision = "124_add_performance_indexes"
down_revision = "123_planner_activity_progress_weight"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADS performance indexes
    op.create_index(
        "idx_ads_status_entity_dates",
        "ads",
        ["status", "entity_id", "start_date"],
        if_not_exists=True,
    )
    op.create_index(
        "idx_ads_pax_status",
        "ads_pax",
        ["ads_id", "status"],
        if_not_exists=True,
    )

    # Cargo history / date-range queries
    op.create_index(
        "idx_cargo_created_at",
        "cargo_items",
        ["created_at"],
        if_not_exists=True,
    )

    # Planner Gantt + heatmap queries
    op.create_index(
        "idx_planner_activity_entity_dates",
        "planner_activities",
        ["entity_id", "start_date", "end_date"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("idx_planner_activity_entity_dates", table_name="planner_activities")
    op.drop_index("idx_cargo_created_at", table_name="cargo_items")
    op.drop_index("idx_ads_pax_status", table_name="ads_pax")
    op.drop_index("idx_ads_status_entity_dates", table_name="ads")
