"""Complete Dashboard, Planner, PaxLog, TravelWiz schemas.

New tables:
  Dashboard: dashboards, dashboard_permissions, home_page_settings,
             widget_cache, dashboard_access_logs
  Planner:   asset_capacities, activity_recurrence_rules
  PaxLog:    ads_imputations, external_access_links, pax_rotation_cycles,
             stay_programs, profile_types, pax_profile_types,
             profile_habilitation_matrix, pax_company_groups
  TravelWiz: voyage_event_types, deck_layouts, deck_layout_items,
             package_elements, article_catalog, trip_kpis

New columns:
  dashboard_tabs: icon, target_group_id
  user_dashboard_tabs: icon
  planner_activities: pax_actual, maintenance_type, equipment_asset_id,
      estimated_duration_h, actual_duration_h, completion_notes,
      workover_type, well_name, location_free_text,
      priority_override_by, priority_override_reason, requester_id,
      notes, archived
  planner_conflicts: activity_a_id, activity_b_id, conflict_type,
      overflow_amount
  ads_pax: boarding_event_id, disembark_event_id, disembark_asset_id,
      profile_type_id
  cargo_items: (18 new columns)
  voyage_stops: purpose

Materialized view: daily_pax_load
Seed data: voyage_event_types (23 rows)

Revision ID: 026
Revises: 025_add_messaging_security_tables
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET

revision: str = "026"
down_revision: Union[str, None] = "025_add_messaging_security_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # 1. DASHBOARD — dashboards
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "dashboards",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("bu_id", UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("nav_menu_parent", sa.String(100), nullable=True),
        sa.Column("nav_menu_label", sa.String(255), nullable=True),
        sa.Column("nav_menu_icon", sa.String(50), nullable=True),
        sa.Column("nav_menu_order", sa.Integer, nullable=True, server_default="999"),
        sa.Column("nav_show_in_sidebar", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("global_filters", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("layout_mobile", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("layout_tablet", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("layout_desktop", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("widgets", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ══════════════════════════════════════════════════════════════
    # 2. DASHBOARD — dashboard_permissions
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "dashboard_permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_type", sa.String(50), nullable=False),
        sa.Column("permission_value", sa.String(255), nullable=False),
        sa.Column("inherit_from_parent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("allow_anonymous", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("dashboard_id", "permission_type", "permission_value", name="uq_dashboard_perm"),
    )

    # ══════════════════════════════════════════════════════════════
    # 3. DASHBOARD — home_page_settings
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "home_page_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("scope_value", sa.String(255), nullable=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("dashboards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "scope_type", "scope_value", name="uq_home_page_scope"),
    )

    # ══════════════════════════════════════════════════════════════
    # 4. DASHBOARD — widget_cache
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "widget_cache",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("widget_id", sa.String(100), nullable=False),
        sa.Column("cache_key", sa.String(255), nullable=False),
        sa.Column("data", JSONB, nullable=False),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("widget_id", "cache_key", name="uq_widget_cache_key"),
    )
    op.create_index("idx_widget_cache_expiry", "widget_cache", ["expires_at"])

    # ══════════════════════════════════════════════════════════════
    # 5. DASHBOARD — dashboard_access_logs
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "dashboard_access_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("access_type", sa.String(20), nullable=False),
        sa.Column("ip_address", INET, nullable=True),
        sa.Column("session_duration_seconds", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_dashboard_access",
        "dashboard_access_logs",
        ["dashboard_id", sa.text("created_at DESC")],
    )

    # ══════════════════════════════════════════════════════════════
    # 6. DASHBOARD — add columns to dashboard_tabs
    # ══════════════════════════════════════════════════════════════
    op.add_column("dashboard_tabs", sa.Column("icon", sa.String(50), nullable=True))
    op.add_column("dashboard_tabs", sa.Column("target_group_id", UUID(as_uuid=True), nullable=True))

    # ══════════════════════════════════════════════════════════════
    # 7. DASHBOARD — add column to user_dashboard_tabs
    # ══════════════════════════════════════════════════════════════
    op.add_column("user_dashboard_tabs", sa.Column("icon", sa.String(50), nullable=True))

    # ══════════════════════════════════════════════════════════════
    # 8. PLANNER — asset_capacities (historized)
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "asset_capacities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("max_pax_total", sa.SmallInteger, nullable=False),
        sa.Column("permanent_ops_quota", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("max_pax_per_company", JSONB, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("effective_date", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_asset_cap_asset", "asset_capacities", ["asset_id", sa.text("effective_date DESC")])
    op.create_index("idx_asset_cap_entity", "asset_capacities", ["entity_id"])

    # ══════════════════════════════════════════════════════════════
    # 9. PLANNER — activity_recurrence_rules
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "activity_recurrence_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("planner_activities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("interval_value", sa.SmallInteger, nullable=False, server_default="1"),
        sa.Column("day_of_week", sa.SmallInteger, nullable=True),
        sa.Column("day_of_month", sa.SmallInteger, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_recurrence_activity", "activity_recurrence_rules", ["activity_id"])

    # ══════════════════════════════════════════════════════════════
    # 10. PLANNER — add columns to planner_activities
    # ══════════════════════════════════════════════════════════════
    op.add_column("planner_activities", sa.Column("pax_actual", sa.Integer, nullable=True, server_default="0"))
    op.add_column("planner_activities", sa.Column("maintenance_type", sa.String(30), nullable=True))
    op.add_column("planner_activities", sa.Column("equipment_asset_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_planner_activities_equipment_asset",
        "planner_activities", "assets",
        ["equipment_asset_id"], ["id"],
    )
    op.add_column("planner_activities", sa.Column("estimated_duration_h", sa.Numeric(8, 2), nullable=True))
    op.add_column("planner_activities", sa.Column("actual_duration_h", sa.Numeric(8, 2), nullable=True))
    op.add_column("planner_activities", sa.Column("completion_notes", sa.Text, nullable=True))
    op.add_column("planner_activities", sa.Column("workover_type", sa.String(30), nullable=True))
    op.add_column("planner_activities", sa.Column("well_name", sa.String(200), nullable=True))
    op.add_column("planner_activities", sa.Column("location_free_text", sa.String(300), nullable=True))
    op.add_column("planner_activities", sa.Column("priority_override_by", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_planner_activities_priority_override_by",
        "planner_activities", "users",
        ["priority_override_by"], ["id"],
    )
    op.add_column("planner_activities", sa.Column("priority_override_reason", sa.Text, nullable=True))
    op.add_column("planner_activities", sa.Column("requester_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_planner_activities_requester",
        "planner_activities", "users",
        ["requester_id"], ["id"],
    )
    op.add_column("planner_activities", sa.Column("notes", sa.Text, nullable=True))
    op.add_column("planner_activities", sa.Column("archived", sa.Boolean, nullable=True, server_default=sa.text("false")))

    # ══════════════════════════════════════════════════════════════
    # 11. PLANNER — add columns to planner_conflicts
    # ══════════════════════════════════════════════════════════════
    op.add_column("planner_conflicts", sa.Column("activity_a_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_planner_conflicts_activity_a",
        "planner_conflicts", "planner_activities",
        ["activity_a_id"], ["id"],
    )
    op.add_column("planner_conflicts", sa.Column("activity_b_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_planner_conflicts_activity_b",
        "planner_conflicts", "planner_activities",
        ["activity_b_id"], ["id"],
    )
    op.add_column("planner_conflicts", sa.Column("conflict_type", sa.String(30), nullable=True, server_default="pax_overflow"))
    op.add_column("planner_conflicts", sa.Column("overflow_amount", sa.Integer, nullable=True, server_default="0"))

    # ══════════════════════════════════════════════════════════════
    # 12. PLANNER — daily_pax_load materialized view
    # ══════════════════════════════════════════════════════════════
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS daily_pax_load AS
        SELECT
            a.entity_id,
            a.asset_id,
            d::date AS load_date,
            SUM(a.pax_quota)  AS total_pax_quota,
            SUM(a.pax_actual) AS total_pax_actual
        FROM planner_activities a
        CROSS JOIN LATERAL generate_series(
            a.start_date::date,
            a.end_date::date,
            '1 day'::interval
        ) AS d
        WHERE a.status IN ('approved', 'in_progress', 'submitted')
          AND a.active = TRUE
        GROUP BY a.entity_id, a.asset_id, d::date
    """)
    op.execute("""
        CREATE UNIQUE INDEX idx_daily_pax_load_pk
        ON daily_pax_load(entity_id, asset_id, load_date)
    """)

    # ══════════════════════════════════════════════════════════════
    # 13. PAXLOG — ads_imputations
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "ads_imputations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("wbs_id", UUID(as_uuid=True), nullable=True),
        sa.Column("cost_center_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id"), nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2), nullable=False),
        sa.Column("cross_imputation", sa.Boolean, nullable=True, server_default=sa.text("false")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_ads_imp_pct"),
    )
    op.create_index("idx_ads_imp_ads", "ads_imputations", ["ads_id"])
    op.create_index("idx_ads_imp_project", "ads_imputations", ["project_id"])

    # ══════════════════════════════════════════════════════════════
    # 14. PAXLOG — external_access_links
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "external_access_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id"), nullable=False),
        sa.Column("token", sa.String(100), unique=True, nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("preconfigured_data", JSONB, nullable=True),
        sa.Column("otp_required", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("otp_sent_to", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_uses", sa.SmallInteger, nullable=True, server_default="1"),
        sa.Column("use_count", sa.SmallInteger, nullable=True, server_default="0"),
        sa.Column("revoked", sa.Boolean, nullable=True, server_default=sa.text("false")),
        sa.Column("access_log", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index(
        "idx_ext_links_token", "external_access_links", ["token"],
        postgresql_where=sa.text("revoked = FALSE"),
    )
    op.create_index("idx_ext_links_ads", "external_access_links", ["ads_id"])

    # ══════════════════════════════════════════════════════════════
    # 15. PAXLOG — pax_rotation_cycles
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_rotation_cycles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=False),
        sa.Column("site_asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("rotation_days_on", sa.SmallInteger, nullable=False),
        sa.Column("rotation_days_off", sa.SmallInteger, nullable=False),
        sa.Column("cycle_start_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("auto_create_ads", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("ads_lead_days", sa.SmallInteger, nullable=True, server_default="7"),
        sa.Column("default_project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("default_cc_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("rotation_days_on > 0", name="ck_rotation_days_on"),
        sa.CheckConstraint("rotation_days_off > 0", name="ck_rotation_days_off"),
        sa.UniqueConstraint("pax_id", "site_asset_id", "status", name="uq_rotation_pax_site_status"),
    )
    op.create_index("idx_rotation_pax", "pax_rotation_cycles", ["pax_id"])
    op.create_index("idx_rotation_site", "pax_rotation_cycles", ["site_asset_id"])
    op.create_index(
        "idx_rotation_active", "pax_rotation_cycles", ["entity_id"],
        postgresql_where=sa.text("status = 'active'"),
    )

    # ══════════════════════════════════════════════════════════════
    # 16. PAXLOG — stay_programs
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "stay_programs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id"), nullable=False),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("movements", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_stay_programs_ads", "stay_programs", ["ads_id"])
    op.create_index("idx_stay_programs_pax", "stay_programs", ["pax_id"])

    # ══════════════════════════════════════════════════════════════
    # 17. PAXLOG — profile_types
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "profile_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.UniqueConstraint("entity_id", "code", name="uq_profile_type_entity_code"),
    )

    # ══════════════════════════════════════════════════════════════
    # 18. PAXLOG — pax_profile_types (junction)
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_profile_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_type_id", UUID(as_uuid=True), sa.ForeignKey("profile_types.id"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("assigned_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("pax_id", "profile_type_id", name="uq_pax_profile_type"),
    )

    # ══════════════════════════════════════════════════════════════
    # 19. PAXLOG — profile_habilitation_matrix
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "profile_habilitation_matrix",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("profile_type_id", UUID(as_uuid=True), sa.ForeignKey("profile_types.id"), nullable=False),
        sa.Column("credential_type_id", UUID(as_uuid=True), sa.ForeignKey("credential_types.id"), nullable=False),
        sa.Column("mandatory", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("set_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint("entity_id", "profile_type_id", "credential_type_id", name="uq_hab_matrix"),
    )

    # ══════════════════════════════════════════════════════════════
    # 20. PAXLOG — pax_company_groups
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_company_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("tiers_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=False),
        sa.Column("group_name", sa.String(200), nullable=False),
        sa.Column("supervisor_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_pax_company_groups_tiers", "pax_company_groups", ["tiers_id"])

    # ══════════════════════════════════════════════════════════════
    # 21. PAXLOG — ads columns (visit_category, cross_company_flag
    #     already exist from 015b; skipping)
    # ══════════════════════════════════════════════════════════════

    # ══════════════════════════════════════════════════════════════
    # 22. PAXLOG — add columns to ads_pax
    #     (current_onboard, priority_score, priority_source already
    #      exist from 015b; adding only new ones)
    # ══════════════════════════════════════════════════════════════
    op.add_column("ads_pax", sa.Column("boarding_event_id", UUID(as_uuid=True), nullable=True))
    op.add_column("ads_pax", sa.Column("disembark_event_id", UUID(as_uuid=True), nullable=True))
    op.add_column("ads_pax", sa.Column("disembark_asset_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_ads_pax_disembark_asset",
        "ads_pax", "assets",
        ["disembark_asset_id"], ["id"],
    )
    op.add_column("ads_pax", sa.Column("profile_type_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_ads_pax_profile_type",
        "ads_pax", "profile_types",
        ["profile_type_id"], ["id"],
    )

    # ══════════════════════════════════════════════════════════════
    # 23. TRAVELWIZ — voyage_event_types (configurable catalog)
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "voyage_event_types",
        sa.Column("code", sa.String(50), primary_key=True),
        sa.Column("label_fr", sa.String(200), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("allowed_sources", JSONB, nullable=True, server_default=sa.text("'[\"captain_portal\",\"logistician\"]'::jsonb")),
        sa.Column("prerequisites", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("expected_payload", JSONB, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=True, server_default="0"),
        sa.Column("active", sa.Boolean, nullable=True, server_default=sa.text("true")),
    )

    # ══════════════════════════════════════════════════════════════
    # 24. TRAVELWIZ — deck_layouts + deck_layout_items
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "deck_layouts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trip_id", UUID(as_uuid=True), nullable=False),
        sa.Column("deck_surface_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("algo_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("layout_rules", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("trip_id", "deck_surface_id", name="uq_deck_layout_trip_surface"),
    )

    op.create_table(
        "deck_layout_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("deck_layout_id", UUID(as_uuid=True), sa.ForeignKey("deck_layouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cargo_item_id", UUID(as_uuid=True), nullable=False),
        sa.Column("x_m", sa.Numeric(8, 3), nullable=False),
        sa.Column("y_m", sa.Numeric(8, 3), nullable=False),
        sa.Column("rotation_deg", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("stack_level", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("placed_by", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint("deck_layout_id", "cargo_item_id", name="uq_deck_item_layout_cargo"),
    )

    # ══════════════════════════════════════════════════════════════
    # 25. TRAVELWIZ — package_elements
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "package_elements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("package_id", UUID(as_uuid=True), sa.ForeignKey("cargo_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_id", UUID(as_uuid=True), nullable=True),
        sa.Column("sap_code", sa.String(50), nullable=True),
        sa.Column("sap_code_status", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("management_type", sa.String(30), nullable=False),
        sa.Column("quantity_sent", sa.Numeric(12, 3), nullable=False),
        sa.Column("quantity_returned", sa.Numeric(12, 3), nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=False),
        sa.Column("unit_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("return_status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("return_notes", sa.Text, nullable=True),
    )
    op.create_index("idx_package_elements_parent", "package_elements", ["package_id"])

    # ══════════════════════════════════════════════════════════════
    # 26. TRAVELWIZ — article_catalog
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "article_catalog",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sap_code", sa.String(50), unique=True, nullable=True),
        sa.Column("internal_code", sa.String(50), nullable=True),
        sa.Column("description_fr", sa.String(500), nullable=False),
        sa.Column("description_en", sa.String(500), nullable=True),
        sa.Column("description_normalized", sa.Text, nullable=False),
        sa.Column("management_type", sa.String(30), nullable=False),
        sa.Column("unit_of_measure", sa.String(20), nullable=True),
        sa.Column("packaging_type", sa.String(50), nullable=True),
        sa.Column("is_hazmat", sa.Boolean, nullable=True, server_default=sa.text("false")),
        sa.Column("hazmat_class", sa.String(50), nullable=True),
        sa.Column("unit_weight_kg", sa.Numeric(10, 3), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("last_imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=True, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_article_sap", "article_catalog", ["sap_code"])

    # ══════════════════════════════════════════════════════════════
    # 27. TRAVELWIZ — trip_kpis
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "trip_kpis",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trip_id", UUID(as_uuid=True), unique=True, nullable=False),
        sa.Column("total_duration_min", sa.Integer, nullable=True),
        sa.Column("standby_duration_min", sa.Integer, nullable=True, server_default="0"),
        sa.Column("productive_duration_min", sa.Integer, nullable=True),
        sa.Column("boarding_duration_min", sa.Integer, nullable=True, server_default="0"),
        sa.Column("cargo_ops_duration_min", sa.Integer, nullable=True, server_default="0"),
        sa.Column("pax_boarded", sa.Integer, nullable=True, server_default="0"),
        sa.Column("pax_planned", sa.Integer, nullable=True, server_default="0"),
        sa.Column("no_shows", sa.Integer, nullable=True, server_default="0"),
        sa.Column("cargo_weight_loaded_kg", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("cargo_weight_planned_kg", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("fuel_consumed_litres", sa.Numeric(10, 2), nullable=True),
        sa.Column("distance_nm", sa.Numeric(10, 2), nullable=True),
        sa.Column("stops_count", sa.SmallInteger, nullable=True, server_default="0"),
        sa.Column("on_time", sa.Boolean, nullable=True),
        sa.Column("delay_minutes", sa.Integer, nullable=True, server_default="0"),
        sa.Column("incidents_count", sa.SmallInteger, nullable=True, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("idx_trip_kpis_trip", "trip_kpis", ["trip_id"])

    # ══════════════════════════════════════════════════════════════
    # 28. TRAVELWIZ — add columns to cargo_items
    # ══════════════════════════════════════════════════════════════
    op.add_column("cargo_items", sa.Column("slip_number", sa.String(100), nullable=True))
    op.add_column("cargo_items", sa.Column("external_reference", sa.String(200), nullable=True))
    op.add_column("cargo_items", sa.Column("sap_code_status", sa.String(20), nullable=True, server_default="unknown"))
    op.add_column("cargo_items", sa.Column("sap_suggestion_code", sa.String(50), nullable=True))
    op.add_column("cargo_items", sa.Column("sap_suggestion_confidence", sa.Numeric(4, 3), nullable=True))
    op.add_column("cargo_items", sa.Column("management_type", sa.String(30), nullable=True, server_default="unit"))
    op.add_column("cargo_items", sa.Column("packaging_type", sa.String(100), nullable=True))
    op.add_column("cargo_items", sa.Column("is_hazmat_explosive", sa.Boolean, nullable=True, server_default=sa.text("false")))
    op.add_column("cargo_items", sa.Column("owner_department", sa.String(100), nullable=True))
    op.add_column("cargo_items", sa.Column("cost_imputation_id", UUID(as_uuid=True), nullable=True))
    op.add_column("cargo_items", sa.Column("cost_imputation_required", sa.Boolean, nullable=True, server_default=sa.text("false")))
    op.add_column("cargo_items", sa.Column("current_location_asset_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_cargo_items_current_location_asset",
        "cargo_items", "assets",
        ["current_location_asset_id"], ["id"],
    )
    op.add_column("cargo_items", sa.Column("return_type", sa.String(30), nullable=True))
    op.add_column("cargo_items", sa.Column("photos", JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))
    op.add_column("cargo_items", sa.Column("photo_required_stages", JSONB, nullable=True, server_default=sa.text("'[\"anomaly\"]'::jsonb")))
    op.add_column("cargo_items", sa.Column("manifest_priority_score", sa.Integer, nullable=True, server_default="0"))
    op.add_column("cargo_items", sa.Column("is_urgent", sa.Boolean, nullable=True, server_default=sa.text("false")))
    op.add_column("cargo_items", sa.Column("urgent_reason", sa.Text, nullable=True))
    op.add_column("cargo_items", sa.Column("archived", sa.Boolean, nullable=True, server_default=sa.text("false")))

    # ══════════════════════════════════════════════════════════════
    # 29. TRAVELWIZ — add column to voyage_stops
    #     (stop_order already exists from 016; adding only purpose)
    # ══════════════════════════════════════════════════════════════
    op.add_column("voyage_stops", sa.Column("purpose", sa.Text, nullable=True))

    # ══════════════════════════════════════════════════════════════
    # 30. TRAVELWIZ — seed voyage_event_types
    # ══════════════════════════════════════════════════════════════
    op.execute("""
        INSERT INTO voyage_event_types (code, label_fr, category, allowed_sources, prerequisites, expected_payload, sort_order, active) VALUES
        ('ARRIVED_AT',            'Arrivée sur site',                  'navigation',  '["captain_portal"]',                           '[]',                                '{"fields":["asset_id"]}',           10,  TRUE),
        ('STANDBY',               'En attente',                        'operations',  '["captain_portal","logistician"]',              '[]',                                '{"fields":["reason"]}',             20,  TRUE),
        ('STANDBY_END',           'Fin d''attente',                    'operations',  '["captain_portal","logistician"]',              '["STANDBY"]',                       NULL,                                25,  TRUE),
        ('BOARDING_START',        'Début embarquement',                'pax',         '["captain_portal","logistician"]',              '["ARRIVED_AT"]',                    NULL,                                30,  TRUE),
        ('BOARDING_END',          'Fin embarquement',                  'pax',         '["captain_portal","logistician"]',              '["BOARDING_START"]',                '{"fields":["pax_count"]}',          35,  TRUE),
        ('CARGO_LOADING_START',   'Début chargement cargo',            'cargo',       '["captain_portal","logistician"]',              '["ARRIVED_AT"]',                    NULL,                                40,  TRUE),
        ('CARGO_LOADING_END',     'Fin chargement cargo',              'cargo',       '["captain_portal","logistician"]',              '["CARGO_LOADING_START"]',           '{"fields":["weight_kg"]}',          45,  TRUE),
        ('DEPARTURE',             'Départ',                            'navigation',  '["captain_portal"]',                           '[]',                                NULL,                                50,  TRUE),
        ('UNDERWAY',              'En route',                          'navigation',  '["captain_portal","ais"]',                     '["DEPARTURE"]',                     '{"fields":["speed_knots"]}',        55,  TRUE),
        ('STOPOVER',              'Escale',                            'navigation',  '["captain_portal"]',                           '["DEPARTURE"]',                     '{"fields":["asset_id"]}',           60,  TRUE),
        ('ANCHORED',              'Ancré / en attente mouillage',      'navigation',  '["captain_portal"]',                           '[]',                                NULL,                                65,  TRUE),
        ('STANDBY_REFUELLING',    'Ravitaillement en cours',           'operations',  '["captain_portal"]',                           '[]',                                '{"fields":["litres"]}',             70,  TRUE),
        ('REFUELLING_END',        'Fin ravitaillement',                'operations',  '["captain_portal"]',                           '["STANDBY_REFUELLING"]',            '{"fields":["litres_total"]}',       75,  TRUE),
        ('DISEMBARKATION_START',  'Début débarquement',                'pax',         '["captain_portal","logistician"]',              '["ARRIVED_AT"]',                    NULL,                                80,  TRUE),
        ('DISEMBARKATION_END',    'Fin débarquement',                  'pax',         '["captain_portal","logistician"]',              '["DISEMBARKATION_START"]',          '{"fields":["pax_count"]}',          85,  TRUE),
        ('CARGO_UNLOADING_START', 'Début déchargement cargo',          'cargo',       '["captain_portal","logistician"]',              '["ARRIVED_AT"]',                    NULL,                                90,  TRUE),
        ('CARGO_UNLOADING_END',   'Fin déchargement cargo',            'cargo',       '["captain_portal","logistician"]',              '["CARGO_UNLOADING_START"]',         '{"fields":["weight_kg"]}',          95,  TRUE),
        ('ARRIVED_DESTINATION',   'Arrivée destination finale',        'navigation',  '["captain_portal"]',                           '["DEPARTURE"]',                     NULL,                               100,  TRUE),
        ('WEATHER_UPDATE',        'Bulletin météo',                    'safety',      '["captain_portal"]',                           '[]',                                '{"fields":["conditions"]}',        110,  TRUE),
        ('INCIDENT',              'Incident',                          'safety',      '["captain_portal","logistician"]',              '[]',                                '{"fields":["severity","desc"]}',   120,  TRUE),
        ('MAINTENANCE_STOP',      'Arrêt maintenance',                 'operations',  '["captain_portal"]',                           '[]',                                '{"fields":["reason"]}',            130,  TRUE),
        ('MAINTENANCE_END',       'Fin maintenance',                   'operations',  '["captain_portal"]',                           '["MAINTENANCE_STOP"]',              NULL,                               135,  TRUE),
        ('TRIP_CLOSED',           'Voyage clôturé',                    'lifecycle',   '["logistician","system"]',                     '["ARRIVED_DESTINATION"]',           NULL,                               200,  TRUE)
        ON CONFLICT (code) DO NOTHING
    """)


def downgrade() -> None:
    # ── 30. Remove voyage_event_types seed data ──────────────────
    op.execute("""
        DELETE FROM voyage_event_types WHERE code IN (
            'ARRIVED_AT','STANDBY','STANDBY_END','BOARDING_START','BOARDING_END',
            'CARGO_LOADING_START','CARGO_LOADING_END','DEPARTURE','UNDERWAY',
            'STOPOVER','ANCHORED','STANDBY_REFUELLING','REFUELLING_END',
            'DISEMBARKATION_START','DISEMBARKATION_END','CARGO_UNLOADING_START',
            'CARGO_UNLOADING_END','ARRIVED_DESTINATION','WEATHER_UPDATE',
            'INCIDENT','MAINTENANCE_STOP','MAINTENANCE_END','TRIP_CLOSED'
        )
    """)

    # ── 29. voyage_stops — drop purpose ──────────────────────────
    op.drop_column("voyage_stops", "purpose")

    # ── 28. cargo_items — drop added columns ─────────────────────
    op.drop_column("cargo_items", "archived")
    op.drop_column("cargo_items", "urgent_reason")
    op.drop_column("cargo_items", "is_urgent")
    op.drop_column("cargo_items", "manifest_priority_score")
    op.drop_column("cargo_items", "photo_required_stages")
    op.drop_column("cargo_items", "photos")
    op.drop_column("cargo_items", "return_type")
    op.drop_constraint("fk_cargo_items_current_location_asset", "cargo_items", type_="foreignkey")
    op.drop_column("cargo_items", "current_location_asset_id")
    op.drop_column("cargo_items", "cost_imputation_required")
    op.drop_column("cargo_items", "cost_imputation_id")
    op.drop_column("cargo_items", "owner_department")
    op.drop_column("cargo_items", "is_hazmat_explosive")
    op.drop_column("cargo_items", "packaging_type")
    op.drop_column("cargo_items", "management_type")
    op.drop_column("cargo_items", "sap_suggestion_confidence")
    op.drop_column("cargo_items", "sap_suggestion_code")
    op.drop_column("cargo_items", "sap_code_status")
    op.drop_column("cargo_items", "external_reference")
    op.drop_column("cargo_items", "slip_number")

    # ── 27. trip_kpis ────────────────────────────────────────────
    op.drop_index("idx_trip_kpis_trip", table_name="trip_kpis")
    op.drop_table("trip_kpis")

    # ── 26. article_catalog ──────────────────────────────────────
    op.drop_index("idx_article_sap", table_name="article_catalog")
    op.drop_table("article_catalog")

    # ── 25. package_elements ─────────────────────────────────────
    op.drop_index("idx_package_elements_parent", table_name="package_elements")
    op.drop_table("package_elements")

    # ── 24. deck_layout_items + deck_layouts ─────────────────────
    op.drop_table("deck_layout_items")
    op.drop_table("deck_layouts")

    # ── 23. voyage_event_types ───────────────────────────────────
    op.drop_table("voyage_event_types")

    # ── 22. ads_pax — drop added columns ─────────────────────────
    op.drop_constraint("fk_ads_pax_profile_type", "ads_pax", type_="foreignkey")
    op.drop_column("ads_pax", "profile_type_id")
    op.drop_constraint("fk_ads_pax_disembark_asset", "ads_pax", type_="foreignkey")
    op.drop_column("ads_pax", "disembark_asset_id")
    op.drop_column("ads_pax", "disembark_event_id")
    op.drop_column("ads_pax", "boarding_event_id")

    # ── 20. pax_company_groups ───────────────────────────────────
    op.drop_index("idx_pax_company_groups_tiers", table_name="pax_company_groups")
    op.drop_table("pax_company_groups")

    # ── 19. profile_habilitation_matrix ──────────────────────────
    op.drop_table("profile_habilitation_matrix")

    # ── 18. pax_profile_types ────────────────────────────────────
    op.drop_table("pax_profile_types")

    # ── 17. profile_types ────────────────────────────────────────
    op.drop_table("profile_types")

    # ── 16. stay_programs ────────────────────────────────────────
    op.drop_index("idx_stay_programs_pax", table_name="stay_programs")
    op.drop_index("idx_stay_programs_ads", table_name="stay_programs")
    op.drop_table("stay_programs")

    # ── 15. pax_rotation_cycles ──────────────────────────────────
    op.drop_index("idx_rotation_active", table_name="pax_rotation_cycles")
    op.drop_index("idx_rotation_site", table_name="pax_rotation_cycles")
    op.drop_index("idx_rotation_pax", table_name="pax_rotation_cycles")
    op.drop_table("pax_rotation_cycles")

    # ── 14. external_access_links ────────────────────────────────
    op.drop_index("idx_ext_links_ads", table_name="external_access_links")
    op.drop_index("idx_ext_links_token", table_name="external_access_links")
    op.drop_table("external_access_links")

    # ── 13. ads_imputations ──────────────────────────────────────
    op.drop_index("idx_ads_imp_project", table_name="ads_imputations")
    op.drop_index("idx_ads_imp_ads", table_name="ads_imputations")
    op.drop_table("ads_imputations")

    # ── 12. daily_pax_load materialized view ─────────────────────
    op.execute("DROP MATERIALIZED VIEW IF EXISTS daily_pax_load")

    # ── 11. planner_conflicts — drop added columns ───────────────
    op.drop_column("planner_conflicts", "overflow_amount")
    op.drop_column("planner_conflicts", "conflict_type")
    op.drop_constraint("fk_planner_conflicts_activity_b", "planner_conflicts", type_="foreignkey")
    op.drop_column("planner_conflicts", "activity_b_id")
    op.drop_constraint("fk_planner_conflicts_activity_a", "planner_conflicts", type_="foreignkey")
    op.drop_column("planner_conflicts", "activity_a_id")

    # ── 10. planner_activities — drop added columns ──────────────
    op.drop_column("planner_activities", "archived")
    op.drop_column("planner_activities", "notes")
    op.drop_constraint("fk_planner_activities_requester", "planner_activities", type_="foreignkey")
    op.drop_column("planner_activities", "requester_id")
    op.drop_column("planner_activities", "priority_override_reason")
    op.drop_constraint("fk_planner_activities_priority_override_by", "planner_activities", type_="foreignkey")
    op.drop_column("planner_activities", "priority_override_by")
    op.drop_column("planner_activities", "location_free_text")
    op.drop_column("planner_activities", "well_name")
    op.drop_column("planner_activities", "workover_type")
    op.drop_column("planner_activities", "completion_notes")
    op.drop_column("planner_activities", "actual_duration_h")
    op.drop_column("planner_activities", "estimated_duration_h")
    op.drop_constraint("fk_planner_activities_equipment_asset", "planner_activities", type_="foreignkey")
    op.drop_column("planner_activities", "equipment_asset_id")
    op.drop_column("planner_activities", "maintenance_type")
    op.drop_column("planner_activities", "pax_actual")

    # ── 9. activity_recurrence_rules ─────────────────────────────
    op.drop_index("idx_recurrence_activity", table_name="activity_recurrence_rules")
    op.drop_table("activity_recurrence_rules")

    # ── 8. asset_capacities ──────────────────────────────────────
    op.drop_index("idx_asset_cap_entity", table_name="asset_capacities")
    op.drop_index("idx_asset_cap_asset", table_name="asset_capacities")
    op.drop_table("asset_capacities")

    # ── 7. user_dashboard_tabs — drop icon ───────────────────────
    op.drop_column("user_dashboard_tabs", "icon")

    # ── 6. dashboard_tabs — drop added columns ───────────────────
    op.drop_column("dashboard_tabs", "target_group_id")
    op.drop_column("dashboard_tabs", "icon")

    # ── 5. dashboard_access_logs ─────────────────────────────────
    op.drop_index("idx_dashboard_access", table_name="dashboard_access_logs")
    op.drop_table("dashboard_access_logs")

    # ── 4. widget_cache ──────────────────────────────────────────
    op.drop_index("idx_widget_cache_expiry", table_name="widget_cache")
    op.drop_table("widget_cache")

    # ── 3. home_page_settings ────────────────────────────────────
    op.drop_table("home_page_settings")

    # ── 2. dashboard_permissions ─────────────────────────────────
    op.drop_table("dashboard_permissions")

    # ── 1. dashboards ────────────────────────────────────────────
    op.drop_table("dashboards")
