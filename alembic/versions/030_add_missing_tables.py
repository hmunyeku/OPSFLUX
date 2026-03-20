"""Add missing TravelWiz tables.

New tables:
  pickup_rounds           — ground pickup rounds (ramassage terrestre)
  pickup_stops            — individual stops within a pickup round
  weather_data            — weather observations per site/asset
  trip_code_access        — captain portal 6-digit access codes
  voyage_events           — digital logbook events for voyages
  vehicle_certifications  — vessel/vehicle certification tracking

Revision ID: 030
Revises: 029
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers
revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── pickup_rounds ───────────────────────────────────────────────────
    op.create_table(
        "pickup_rounds",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("trip_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("route_name", sa.String(200), nullable=False),
        sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_arrival", sa.DateTime(timezone=True), nullable=True),
        sa.Column("driver_name", sa.String(200), nullable=True),
        sa.Column("driver_phone", sa.String(50), nullable=True),
        sa.Column("vehicle_registration", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("total_pax_picked", sa.Integer, nullable=False, server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        # TimestampMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_pickup_round_entity", "pickup_rounds", ["entity_id"])
    op.create_index("idx_pickup_round_trip", "pickup_rounds", ["trip_id"])
    op.create_index("idx_pickup_round_status", "pickup_rounds", ["status"])

    # ── pickup_stops ────────────────────────────────────────────────────
    op.create_table(
        "pickup_stops",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pickup_round_id", UUID(as_uuid=True), sa.ForeignKey("pickup_rounds.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("pickup_order", sa.Integer, nullable=False),
        sa.Column("scheduled_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pax_expected", sa.Integer, nullable=False, server_default="0"),
        sa.Column("pax_picked_up", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        # TimestampMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_pickup_stop_round", "pickup_stops", ["pickup_round_id"])
    op.create_index("idx_pickup_stop_order", "pickup_stops", ["pickup_round_id", "pickup_order"])

    # ── weather_data ────────────────────────────────────────────────────
    op.create_table(
        "weather_data",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("wind_speed_knots", sa.Numeric(6, 2), nullable=True),
        sa.Column("wind_direction_deg", sa.SmallInteger, nullable=True),
        sa.Column("wave_height_m", sa.Numeric(5, 2), nullable=True),
        sa.Column("visibility_nm", sa.Numeric(6, 2), nullable=True),
        sa.Column("sea_state", sa.String(20), nullable=True),
        sa.Column("temperature_c", sa.Numeric(5, 2), nullable=True),
        sa.Column("weather_code", sa.String(50), nullable=True),
        sa.Column("flight_conditions", sa.String(10), nullable=True),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        # TimestampMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_weather_entity", "weather_data", ["entity_id"])
    op.create_index("idx_weather_asset", "weather_data", ["asset_id"])
    op.create_index("idx_weather_recorded", "weather_data", ["recorded_at"])

    # ── trip_code_access ────────────────────────────────────────────────
    op.create_table(
        "trip_code_access",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("access_code", sa.String(10), unique=True, nullable=False),
        sa.Column("qr_code_url", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("access_log", JSONB, nullable=True),
    )
    op.create_index(
        "idx_trip_codes_active",
        "trip_code_access",
        ["access_code"],
        postgresql_where=sa.text("revoked = FALSE"),
    )

    # ── voyage_events ───────────────────────────────────────────────────
    op.create_table(
        "voyage_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("trip_id", UUID(as_uuid=True), sa.ForeignKey("voyages.id"), nullable=False),
        sa.Column("event_code", sa.String(50), nullable=False),
        sa.Column("event_label", sa.String(200), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("location_label", sa.String(200), nullable=True),
        sa.Column("performed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("performed_by_name", sa.String(200), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("trip_code_used", sa.String(10), nullable=True),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("offline_sync", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("idx_vevt_trip", "voyage_events", ["trip_id", "recorded_at"])
    op.create_index("idx_vevt_category", "voyage_events", ["category", "recorded_at"])

    # ── vehicle_certifications ──────────────────────────────────────────
    op.create_table(
        "vehicle_certifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("vehicle_id", UUID(as_uuid=True), sa.ForeignKey("transport_vectors.id"), nullable=False),
        sa.Column("cert_type", sa.String(100), nullable=False),
        sa.Column("cert_name", sa.String(300), nullable=False),
        sa.Column("issuing_authority", sa.String(200), nullable=True),
        sa.Column("cert_number", sa.String(100), nullable=True),
        sa.Column("issued_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="valid"),
        sa.Column("proof_url", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("alert_days_before", sa.SmallInteger, nullable=False, server_default="30"),
        # TimestampMixin columns
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_vehicle_certs_vehicle", "vehicle_certifications", ["vehicle_id"])
    op.create_index("idx_vehicle_certs_expiry", "vehicle_certifications", ["expiry_date"])


def downgrade() -> None:
    op.drop_table("vehicle_certifications")
    op.drop_table("voyage_events")
    op.drop_table("trip_code_access")
    op.drop_table("weather_data")
    op.drop_table("pickup_stops")
    op.drop_table("pickup_rounds")
