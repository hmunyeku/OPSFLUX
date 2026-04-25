"""Add auth security columns to users, planner tables, travelwiz tables.

Covers:
- User model: auth_type, sso_subject, failed_login_count, locked_until,
  last_login_ip, account_expires_at, password_changed_at
- Planner module: planner_activities, planner_conflicts,
  planner_conflict_activities, planner_activity_dependencies
- TravelWiz module: transport_vectors, transport_vector_zones,
  transport_rotations, voyages, voyage_stops, voyage_manifests,
  manifest_passengers, cargo_items, captain_logs, vector_positions

Revision ID: 016_add_auth_security_planner_travelwiz
Revises: 015_add_planning_revisions_deliverables_actions_changelog
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "016_add_auth_security_planner_travelwiz"
down_revision: Union[str, None] = "015b_add_paxlog_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # AUTH SECURITY — User model columns (AUTH.md §7)
    # ══════════════════════════════════════════════════════════════

    op.add_column("users", sa.Column("auth_type", sa.String(20), nullable=False, server_default="email_password"))
    op.add_column("users", sa.Column("sso_subject", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("failed_login_count", sa.Integer, nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("last_login_ip", sa.String(45), nullable=True))
    op.add_column("users", sa.Column("account_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))

    # ══════════════════════════════════════════════════════════════
    # PLANNER MODULE
    # ══════════════════════════════════════════════════════════════

    # ── planner_activities ─────────────────────────────────────
    op.create_table(
        "planner_activities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("subtype", sa.String(30), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("pax_quota", sa.Integer, nullable=False, server_default="0"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end", sa.DateTime(timezone=True), nullable=True),
        # Type-specific fields
        sa.Column("well_reference", sa.String(100), nullable=True),
        sa.Column("rig_name", sa.String(100), nullable=True),
        sa.Column("spud_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("target_depth", sa.Float, nullable=True),
        sa.Column("drilling_program_ref", sa.String(100), nullable=True),
        sa.Column("regulatory_ref", sa.String(200), nullable=True),
        sa.Column("work_order_ref", sa.String(50), nullable=True),
        # Workflow
        sa.Column("submitted_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_planner_activities_entity", "planner_activities", ["entity_id"])
    op.create_index("idx_planner_activities_asset", "planner_activities", ["asset_id"])
    op.create_index("idx_planner_activities_status", "planner_activities", ["status"])
    op.create_index("idx_planner_activities_type", "planner_activities", ["type"])
    op.create_index("idx_planner_activities_project", "planner_activities", ["project_id"])
    op.create_index("idx_planner_activities_dates", "planner_activities", ["start_date", "end_date"])

    # ── planner_conflicts ──────────────────────────────────────
    op.create_table(
        "planner_conflicts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("conflict_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("resolution", sa.String(30), nullable=True),
        sa.Column("resolution_note", sa.Text, nullable=True),
        sa.Column("resolved_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_planner_conflicts_entity", "planner_conflicts", ["entity_id"])
    op.create_index("idx_planner_conflicts_asset", "planner_conflicts", ["asset_id"])
    op.create_index("idx_planner_conflicts_status", "planner_conflicts", ["status"])

    # ── planner_conflict_activities (junction) ─────────────────
    op.create_table(
        "planner_conflict_activities",
        sa.Column("conflict_id", UUID(as_uuid=True), sa.ForeignKey("planner_conflicts.id"), primary_key=True),
        sa.Column("activity_id", UUID(as_uuid=True), sa.ForeignKey("planner_activities.id"), primary_key=True),
    )

    # ── planner_activity_dependencies ──────────────────────────
    op.create_table(
        "planner_activity_dependencies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("predecessor_id", UUID(as_uuid=True), sa.ForeignKey("planner_activities.id"), nullable=False),
        sa.Column("successor_id", UUID(as_uuid=True), sa.ForeignKey("planner_activities.id"), nullable=False),
        sa.Column("dependency_type", sa.String(10), nullable=False, server_default="FS"),
        sa.Column("lag_days", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("idx_planner_deps_predecessor", "planner_activity_dependencies", ["predecessor_id"])
    op.create_index("idx_planner_deps_successor", "planner_activity_dependencies", ["successor_id"])

    # ══════════════════════════════════════════════════════════════
    # TRAVELWIZ MODULE
    # ══════════════════════════════════════════════════════════════

    # ── transport_rotations ────────────────────────────────────
    op.create_table(
        "transport_rotations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("vector_id", UUID(as_uuid=True), nullable=False),  # FK added after transport_vectors
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("departure_base_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("schedule_cron", sa.String(100), nullable=True),
        sa.Column("schedule_description", sa.String(300), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── transport_vectors ──────────────────────────────────────
    op.create_table(
        "transport_vectors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("registration", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("mode", sa.String(10), nullable=False),
        sa.Column("pax_capacity", sa.Integer, nullable=False, server_default="0"),
        sa.Column("weight_capacity_kg", sa.Float, nullable=True),
        sa.Column("volume_capacity_m3", sa.Float, nullable=True),
        sa.Column("home_base_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("requires_weighing", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("mmsi_number", sa.String(20), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_transport_vectors_entity", "transport_vectors", ["entity_id"])
    op.create_index("idx_transport_vectors_type", "transport_vectors", ["type"])

    # Now add FK from rotations to vectors
    op.create_foreign_key(
        "fk_transport_rotations_vector", "transport_rotations", "transport_vectors",
        ["vector_id"], ["id"]
    )

    # ── transport_vector_zones ─────────────────────────────────
    op.create_table(
        "transport_vector_zones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vector_id", UUID(as_uuid=True), sa.ForeignKey("transport_vectors.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("zone_type", sa.String(30), nullable=False),
        sa.Column("max_weight_kg", sa.Float, nullable=True),
        sa.Column("width_m", sa.Float, nullable=True),
        sa.Column("length_m", sa.Float, nullable=True),
        sa.Column("exclusion_zones", JSONB, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_vector_zones_vector", "transport_vector_zones", ["vector_id"])

    # ── voyages ────────────────────────────────────────────────
    op.create_table(
        "voyages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("vector_id", UUID(as_uuid=True), sa.ForeignKey("transport_vectors.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("departure_base_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delay_reason", sa.Text, nullable=True),
        sa.Column("rotation_id", UUID(as_uuid=True), sa.ForeignKey("transport_rotations.id"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_voyages_entity", "voyages", ["entity_id"])
    op.create_index("idx_voyages_vector", "voyages", ["vector_id"])
    op.create_index("idx_voyages_status", "voyages", ["status"])
    op.create_index("idx_voyages_scheduled", "voyages", ["scheduled_departure"])

    # ── voyage_stops ───────────────────────────────────────────
    op.create_table(
        "voyage_stops",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("voyage_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("stop_order", sa.Integer, nullable=False),
        sa.Column("scheduled_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_voyage_stops_voyage", "voyage_stops", ["voyage_id"])

    # ── voyage_manifests ───────────────────────────────────────
    op.create_table(
        "voyage_manifests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("voyage_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("manifest_type", sa.String(10), nullable=False, server_default="pax"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_voyage_manifests_voyage", "voyage_manifests", ["voyage_id"])

    # ── manifest_passengers ────────────────────────────────────
    op.create_table(
        "manifest_passengers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("manifest_id", UUID(as_uuid=True), sa.ForeignKey("voyage_manifests.id"), nullable=False),
        sa.Column("pax_profile_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("company", sa.String(200), nullable=True),
        sa.Column("destination_stop_id", UUID(as_uuid=True), sa.ForeignKey("voyage_stops.id"), nullable=True),
        sa.Column("declared_weight_kg", sa.Float, nullable=True),
        sa.Column("actual_weight_kg", sa.Float, nullable=True),
        sa.Column("boarding_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("boarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("priority_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("standby", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_manifest_passengers_manifest", "manifest_passengers", ["manifest_id"])

    # ── cargo_items ────────────────────────────────────────────
    op.create_table(
        "cargo_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("tracking_code", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("cargo_type", sa.String(30), nullable=False),
        sa.Column("weight_kg", sa.Float, nullable=False),
        sa.Column("width_cm", sa.Float, nullable=True),
        sa.Column("length_cm", sa.Float, nullable=True),
        sa.Column("height_cm", sa.Float, nullable=True),
        sa.Column("sender_tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=True),
        sa.Column("receiver_name", sa.String(200), nullable=True),
        sa.Column("destination_asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="registered"),
        sa.Column("manifest_id", UUID(as_uuid=True), sa.ForeignKey("voyage_manifests.id"), nullable=True),
        sa.Column("sap_article_code", sa.String(50), nullable=True),
        sa.Column("hazmat_validated", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("received_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("damage_notes", sa.Text, nullable=True),
        sa.Column("registered_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_cargo_items_entity", "cargo_items", ["entity_id"])
    op.create_index("idx_cargo_items_status", "cargo_items", ["status"])
    op.create_index("idx_cargo_items_manifest", "cargo_items", ["manifest_id"])
    op.create_index("idx_cargo_items_tracking", "cargo_items", ["tracking_code"])

    # ── captain_logs ───────────────────────────────────────────
    op.create_table(
        "captain_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("voyage_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("weather_conditions", JSONB, nullable=True),
        sa.Column("fuel_consumption_liters", sa.Float, nullable=True),
        sa.Column("created_by_name", sa.String(200), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_captain_logs_voyage", "captain_logs", ["voyage_id"])

    # ── vector_positions (IoT tracking) ────────────────────────
    op.create_table(
        "vector_positions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("vector_id", UUID(as_uuid=True), sa.ForeignKey("transport_vectors.id"), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("speed_knots", sa.Float, nullable=True),
    )
    op.create_index("idx_vector_positions_vector", "vector_positions", ["vector_id"])
    op.create_index("idx_vector_positions_recorded", "vector_positions", ["recorded_at"])


def downgrade() -> None:
    # TravelWiz
    op.drop_table("vector_positions")
    op.drop_table("captain_logs")
    op.drop_table("cargo_items")
    op.drop_table("manifest_passengers")
    op.drop_table("voyage_manifests")
    op.drop_table("voyage_stops")
    op.drop_table("voyages")
    op.drop_table("transport_vector_zones")
    op.drop_constraint("fk_transport_rotations_vector", "transport_rotations", type_="foreignkey")
    op.drop_table("transport_vectors")
    op.drop_table("transport_rotations")

    # Planner
    op.drop_table("planner_activity_dependencies")
    op.drop_table("planner_conflict_activities")
    op.drop_table("planner_conflicts")
    op.drop_table("planner_activities")

    # Auth security columns
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "account_expires_at")
    op.drop_column("users", "last_login_ip")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")
    op.drop_column("users", "sso_subject")
    op.drop_column("users", "auth_type")
