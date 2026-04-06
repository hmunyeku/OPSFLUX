"""TravelWiz ORM models — vectors, voyages, manifests, cargo, rotations,
captain logs, deck zones, IoT positions."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── Transport Vectors ──────────────────────────────────────────────────────

class TransportVector(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "transport_vectors"
    __table_args__ = (
        Index("idx_vector_entity", "entity_id"),
        Index("idx_vector_type", "type"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    registration: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)  # helicopter, ship, bus, surfer, barge, commercial_flight, vehicle
    mode: Mapped[str] = mapped_column(String(10), nullable=False)  # air, sea, road
    pax_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weight_capacity_kg: Mapped[float | None] = mapped_column(Float)
    volume_capacity_m3: Mapped[float | None] = mapped_column(Float)
    home_base_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    requires_weighing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mmsi_number: Mapped[str | None] = mapped_column(String(20))  # AIS tracking (ships)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    zones: Mapped[list["TransportVectorZone"]] = relationship(
        back_populates="vector", cascade="all, delete-orphan"
    )
    voyages: Mapped[list["Voyage"]] = relationship(back_populates="vector")
    positions: Mapped[list["VectorPosition"]] = relationship(back_populates="vector")


# ─── Transport Vector Zones (Deck zones) ────────────────────────────────────

class TransportVectorZone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "transport_vector_zones"
    __table_args__ = (
        Index("idx_zone_vector", "vector_id"),
    )

    vector_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vectors.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    zone_type: Mapped[str] = mapped_column(String(30), nullable=False)  # main_deck, rear_deck, hold, cabin
    max_weight_kg: Mapped[float | None] = mapped_column(Float)
    width_m: Mapped[float | None] = mapped_column(Float)
    length_m: Mapped[float | None] = mapped_column(Float)
    exclusion_zones: Mapped[dict | None] = mapped_column(JSONB)  # [{x, y, w, h, reason}]
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vector: Mapped["TransportVector"] = relationship(back_populates="zones")


# ─── Transport Rotations ────────────────────────────────────────────────────

class TransportRotation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "transport_rotations"
    __table_args__ = (
        Index("idx_rotation_entity", "entity_id"),
        Index("idx_rotation_vector", "vector_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    vector_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vectors.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    departure_base_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    schedule_cron: Mapped[str | None] = mapped_column(String(100))  # e.g. "0 7 * * 1"
    schedule_description: Mapped[str | None] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    voyages: Mapped[list["Voyage"]] = relationship(back_populates="rotation")


# ─── Voyages ────────────────────────────────────────────────────────────────

class Voyage(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "voyages"
    __table_args__ = (
        Index("idx_voyage_entity", "entity_id"),
        Index("idx_voyage_vector", "vector_id"),
        Index("idx_voyage_status", "status"),
        Index("idx_voyage_departure", "scheduled_departure"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    vector_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vectors.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)  # VYG-2026-NNNNN
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="planned"
    )  # planned, confirmed, boarding, departed, arrived, closed, delayed, cancelled
    departure_base_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    scheduled_departure: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    scheduled_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_departure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delay_reason: Mapped[str | None] = mapped_column(Text)
    rotation_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_rotations.id")
    )
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vector: Mapped["TransportVector"] = relationship(back_populates="voyages")
    rotation: Mapped["TransportRotation | None"] = relationship(back_populates="voyages")
    stops: Mapped[list["VoyageStop"]] = relationship(
        back_populates="voyage", cascade="all, delete-orphan"
    )
    manifests: Mapped[list["VoyageManifest"]] = relationship(
        back_populates="voyage", cascade="all, delete-orphan"
    )
    captain_logs: Mapped[list["CaptainLog"]] = relationship(
        back_populates="voyage", cascade="all, delete-orphan"
    )


# ─── Voyage Stops (multi-stop support) ──────────────────────────────────────

class VoyageStop(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "voyage_stops"
    __table_args__ = (
        Index("idx_stop_voyage", "voyage_id"),
    )

    voyage_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    stop_order: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    voyage: Mapped["Voyage"] = relationship(back_populates="stops")


# ─── Voyage Manifests ───────────────────────────────────────────────────────

class VoyageManifest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "voyage_manifests"
    __table_args__ = (
        Index("idx_manifest_voyage", "voyage_id"),
    )

    voyage_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    manifest_type: Mapped[str] = mapped_column(
        String(10), nullable=False, default="pax"
    )  # pax, cargo
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )  # draft, validated, closed
    validated_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    voyage: Mapped["Voyage"] = relationship(back_populates="manifests")
    passengers: Mapped[list["ManifestPassenger"]] = relationship(
        back_populates="manifest", cascade="all, delete-orphan"
    )
    cargo_items: Mapped[list["CargoItem"]] = relationship(back_populates="manifest")


# ─── Manifest Passengers ────────────────────────────────────────────────────

class ManifestPassenger(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "manifest_passengers"
    __table_args__ = (
        Index("idx_mpax_manifest", "manifest_id"),
        Index("idx_mpax_user", "user_id"),
        Index("idx_mpax_contact", "contact_id"),
    )

    manifest_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyage_manifests.id"), nullable=False
    )
    user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    contact_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tier_contacts.id")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    company: Mapped[str | None] = mapped_column(String(200))
    destination_stop_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyage_stops.id")
    )
    declared_weight_kg: Mapped[float | None] = mapped_column(Float)
    actual_weight_kg: Mapped[float | None] = mapped_column(Float)
    boarding_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending, boarded, no_show, offloaded
    boarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    standby: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ads_pax_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads_pax.id")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    manifest: Mapped["VoyageManifest"] = relationship(back_populates="passengers")


# ─── Cargo Items ────────────────────────────────────────────────────────────

class CargoRequest(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cargo_requests"
    __table_args__ = (
        UniqueConstraint("request_code", name="uq_cargo_request_code"),
        Index("idx_cargo_request_entity", "entity_id"),
        Index("idx_cargo_request_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    request_code: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    imputation_reference_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("imputation_references.id", ondelete="SET NULL")
    )
    sender_tier_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id")
    )
    receiver_name: Mapped[str | None] = mapped_column(String(200))
    destination_asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    requester_name: Mapped[str | None] = mapped_column(String(200))
    requested_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CargoItem(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cargo_items"
    __table_args__ = (
        UniqueConstraint("tracking_code", name="uq_cargo_tracking_code"),
        Index("idx_cargo_entity", "entity_id"),
        Index("idx_cargo_tracking", "tracking_code"),
        Index("idx_cargo_status", "status"),
        Index("idx_cargo_manifest", "manifest_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    request_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_requests.id", ondelete="SET NULL")
    )
    tracking_code: Mapped[str] = mapped_column(String(50), nullable=False)  # CGO-2026-NNNNN
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(255))
    cargo_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # unit, bulk, consumable, packaging, waste, hazmat
    workflow_status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    width_cm: Mapped[float | None] = mapped_column(Float)
    length_cm: Mapped[float | None] = mapped_column(Float)
    height_cm: Mapped[float | None] = mapped_column(Float)
    surface_m2: Mapped[float | None] = mapped_column(Float)
    package_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    stackable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sender_tier_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tiers.id")
    )
    receiver_name: Mapped[str | None] = mapped_column(String(200))
    destination_asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    imputation_reference_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("imputation_references.id", ondelete="SET NULL")
    )
    ownership_type: Mapped[str | None] = mapped_column(String(30))
    pickup_location_label: Mapped[str | None] = mapped_column(String(255))
    pickup_latitude: Mapped[float | None] = mapped_column(Float)
    pickup_longitude: Mapped[float | None] = mapped_column(Float)
    requester_name: Mapped[str | None] = mapped_column(String(200))
    document_prepared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pickup_contact_user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    pickup_contact_tier_contact_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tier_contacts.id", ondelete="SET NULL")
    )
    pickup_contact_name: Mapped[str | None] = mapped_column(String(200))
    pickup_contact_phone: Mapped[str | None] = mapped_column(String(80))
    lifting_provider: Mapped[str | None] = mapped_column(String(200))
    lifting_points_certified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    weight_ticket_provided: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    photo_evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    document_attachment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="registered"
    )  # registered, ready, loaded, in_transit, delivered_intermediate, delivered_final, damaged, missing
    manifest_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyage_manifests.id")
    )
    sap_article_code: Mapped[str | None] = mapped_column(String(50))
    hazmat_validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    received_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    damage_notes: Mapped[str | None] = mapped_column(Text)
    registered_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    manifest: Mapped["VoyageManifest | None"] = relationship(back_populates="cargo_items")


class CargoAttachmentEvidence(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cargo_attachment_evidences"
    __table_args__ = (
        UniqueConstraint("attachment_id", name="uq_cargo_attachment_evidence_attachment"),
        Index("idx_cargo_attachment_evidence_cargo", "cargo_item_id"),
        Index("idx_cargo_attachment_evidence_type", "evidence_type"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    cargo_item_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_items.id", ondelete="CASCADE"), nullable=False
    )
    attachment_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False
    )
    evidence_type: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )


# ─── Captain Logs ───────────────────────────────────────────────────────────

class CaptainLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "captain_logs"
    __table_args__ = (
        Index("idx_caplog_voyage", "voyage_id"),
    )

    voyage_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # departure, arrival, weather, technical, fuel, safety, incident
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    weather_conditions: Mapped[dict | None] = mapped_column(JSONB)
    fuel_consumption_liters: Mapped[float | None] = mapped_column(Float)
    created_by_name: Mapped[str | None] = mapped_column(String(200))  # captain name
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    voyage: Mapped["Voyage"] = relationship(back_populates="captain_logs")


# ─── Vector Positions (IoT tracking) ────────────────────────────────────────

class VectorPosition(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vector_positions"
    __table_args__ = (
        Index("idx_vecpos_vector", "vector_id"),
        Index("idx_vecpos_recorded", "recorded_at"),
    )

    vector_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vectors.id"), nullable=False
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # ais, gps, manual
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    speed_knots: Mapped[float | None] = mapped_column(Float)
    heading: Mapped[float | None] = mapped_column(Float)
    payload: Mapped[dict | None] = mapped_column(JSONB)

    vector: Mapped["TransportVector"] = relationship(back_populates="positions")


# ─── Pickup Rounds (Ramassage terrestre) ─────────────────────────────────────

class PickupRound(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pickup_rounds"
    __table_args__ = (
        Index("idx_pickup_round_entity", "entity_id"),
        Index("idx_pickup_round_trip", "trip_id"),
        Index("idx_pickup_round_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    trip_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    route_name: Mapped[str] = mapped_column(String(200), nullable=False)
    scheduled_departure: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    actual_departure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    driver_name: Mapped[str | None] = mapped_column(String(200))
    driver_phone: Mapped[str | None] = mapped_column(String(50))
    vehicle_registration: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="planned"
    )  # planned, in_progress, completed, cancelled
    total_pax_picked: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    stops: Mapped[list["PickupStop"]] = relationship(
        back_populates="pickup_round", cascade="all, delete-orphan"
    )


class PickupStop(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pickup_stops"
    __table_args__ = (
        Index("idx_pickup_stop_round", "pickup_round_id"),
        Index("idx_pickup_stop_order", "pickup_round_id", "pickup_order"),
    )

    pickup_round_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pickup_rounds.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    pickup_order: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pax_expected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pax_picked_up: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending, arrived, completed, skipped
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    pickup_round: Mapped["PickupRound"] = relationship(back_populates="stops")
    assignments: Mapped[list["PickupStopAssignment"]] = relationship(
        back_populates="pickup_stop", cascade="all, delete-orphan"
    )


class PickupStopAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pickup_stop_assignments"
    __table_args__ = (
        Index("idx_pickup_assignment_stop", "pickup_stop_id"),
        Index("idx_pickup_assignment_passenger", "manifest_passenger_id"),
        UniqueConstraint("pickup_stop_id", "manifest_passenger_id", name="uq_pickup_stop_assignment"),
    )

    pickup_stop_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pickup_stops.id", ondelete="CASCADE"), nullable=False
    )
    manifest_passenger_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manifest_passengers.id", ondelete="CASCADE"), nullable=False
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    pickup_stop: Mapped["PickupStop"] = relationship(back_populates="assignments")


# ─── Weather Data ────────────────────────────────────────────────────────────

class WeatherData(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "weather_data"
    __table_args__ = (
        Index("idx_weather_entity", "entity_id"),
        Index("idx_weather_asset", "asset_id"),
        Index("idx_weather_recorded", "recorded_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    asset_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    source: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # manual | api_open_meteo | api_openweather | captain_report
    wind_speed_knots: Mapped[float | None] = mapped_column(Numeric(6, 2))
    wind_direction_deg: Mapped[int | None] = mapped_column(SmallInteger)
    wave_height_m: Mapped[float | None] = mapped_column(Numeric(5, 2))
    visibility_nm: Mapped[float | None] = mapped_column(Numeric(6, 2))
    sea_state: Mapped[str | None] = mapped_column(
        String(20)
    )  # calm | slight | moderate | rough | very_rough | high | phenomenal
    temperature_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    weather_code: Mapped[str | None] = mapped_column(
        String(50)
    )  # clear | cloudy | rain | storm | fog | thunderstorm
    flight_conditions: Mapped[str | None] = mapped_column(
        String(10)
    )  # vfr | mvfr | ifr | lifr
    raw_data: Mapped[dict | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── Trip Code Access (Captain Portal) ──────────────────────────────────────

class TripCodeAccess(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """6-digit code for captain portal authentication."""
    __tablename__ = "trip_code_access"
    __table_args__ = (
        Index(
            "idx_trip_codes_active",
            "access_code",
            postgresql_where=text("revoked = FALSE"),
        ),
    )

    trip_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    access_code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    qr_code_url: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_log: Mapped[list | None] = mapped_column(JSONB, default=list)


# ─── Voyage Event Types (Configurable catalog) ─────────────────────────────

class VoyageEventType(Base):
    """Configurable event type catalog for digital logbook."""
    __tablename__ = "voyage_event_types"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    label_fr: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    allowed_sources: Mapped[list | None] = mapped_column(
        JSONB, default=lambda: ["captain_portal", "logistician"]
    )
    prerequisites: Mapped[list | None] = mapped_column(JSONB, default=list)
    expected_payload: Mapped[dict | None] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── Voyage Events (Digital Logbook) ───────────────────────────────────────

class VoyageEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Structured event in a voyage's digital logbook."""
    __tablename__ = "voyage_events"
    __table_args__ = (
        Index("idx_vevt_trip", "trip_id", "recorded_at"),
        Index("idx_vevt_category", "category", "recorded_at"),
    )

    trip_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    event_code: Mapped[str] = mapped_column(String(50), nullable=False)
    event_label: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_installations.id")
    )
    location_label: Mapped[str | None] = mapped_column(String(200))
    performed_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    performed_by_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    trip_code_used: Mapped[str | None] = mapped_column(String(10))
    payload: Mapped[dict | None] = mapped_column(JSONB)
    offline_sync: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


# ─── Trip KPI (Computed at close) ──────────────────────────────────────────

class TripKPI(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """KPIs computed when a trip is closed."""
    __tablename__ = "trip_kpis"
    __table_args__ = (
        Index("idx_trip_kpis_trip", "trip_id", unique=True),
    )

    trip_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), unique=True, nullable=False
    )
    total_duration_min: Mapped[int | None] = mapped_column(Integer)
    sailing_duration_min: Mapped[int | None] = mapped_column(Integer)
    standby_duration_min: Mapped[int | None] = mapped_column(Integer)
    loading_duration_min: Mapped[int | None] = mapped_column(Integer)
    pax_boarded: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    pax_no_show: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    cargo_loaded_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    cargo_unloaded_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    fuel_consumed_litres: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    on_time_departure: Mapped[bool | None] = mapped_column(Boolean)
    on_time_arrival: Mapped[bool | None] = mapped_column(Boolean)
    departure_delay_min: Mapped[int | None] = mapped_column(Integer)
    stops_count: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    incidents_count: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Article Catalog (SAP matching) ───────────────────────────────────────

class ArticleCatalog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """SAP article master for cargo matching."""
    __tablename__ = "article_catalog"
    __table_args__ = (
        Index("idx_article_sap", "sap_code"),
    )

    sap_code: Mapped[str | None] = mapped_column(String(50), unique=True)
    internal_code: Mapped[str | None] = mapped_column(String(50))
    description_fr: Mapped[str] = mapped_column(String(500), nullable=False)
    description_en: Mapped[str | None] = mapped_column(String(500))
    description_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    management_type: Mapped[str] = mapped_column(String(30), nullable=False)
    unit_of_measure: Mapped[str | None] = mapped_column(String(20))
    packaging_type: Mapped[str | None] = mapped_column(String(50))
    is_hazmat: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hazmat_class: Mapped[str | None] = mapped_column(String(50))
    unit_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    last_imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ─── Package Element (Sub-items in cargo) ──────────────────────────────────

class PackageElement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Sub-item within a composite cargo package."""
    __tablename__ = "package_elements"
    __table_args__ = (
        Index("idx_package_elements_parent", "package_id"),
    )

    package_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_items.id", ondelete="CASCADE"), nullable=False
    )
    article_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("article_catalog.id")
    )
    sap_code: Mapped[str | None] = mapped_column(String(50))
    sap_code_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    management_type: Mapped[str] = mapped_column(String(30), nullable=False)
    quantity_sent: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    quantity_returned: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    unit_of_measure: Mapped[str] = mapped_column(String(20), nullable=False)
    unit_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    return_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    return_notes: Mapped[str | None] = mapped_column(Text)


# ─── Deck Layout (Cargo placement) ────────────────────────────────────────

class DeckLayout(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cargo deck placement plan for a trip+surface."""
    __tablename__ = "deck_layouts"
    __table_args__ = (
        Index("idx_deck_layouts_trip", "trip_id", "deck_surface_id", unique=True),
    )

    trip_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False
    )
    deck_surface_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vector_zones.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    algo_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    layout_rules: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DeckLayoutItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Individual cargo item placement on a deck."""
    __tablename__ = "deck_layout_items"
    __table_args__ = (
        Index("idx_deck_layout_items_layout", "deck_layout_id"),
    )

    deck_layout_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("deck_layouts.id", ondelete="CASCADE"), nullable=False
    )
    cargo_item_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_items.id"), nullable=False
    )
    x_m: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    y_m: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    rotation_deg: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    stack_level: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    placed_by: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


# ─── Vehicle Certification (Synergie-like) ─────────────────────────────────

class VehicleCertification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Vessel/vehicle certification tracking (like Synergie)."""
    __tablename__ = "vehicle_certifications"
    __table_args__ = (
        Index("idx_vehicle_certs_vehicle", "vehicle_id"),
        Index("idx_vehicle_certs_expiry", "expiry_date"),
    )

    vehicle_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vectors.id"), nullable=False
    )
    cert_type: Mapped[str] = mapped_column(String(100), nullable=False)
    cert_name: Mapped[str] = mapped_column(String(300), nullable=False)
    issuing_authority: Mapped[str | None] = mapped_column(String(200))
    cert_number: Mapped[str | None] = mapped_column(String(100))
    issued_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="valid", nullable=False)
    proof_url: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    alert_days_before: Mapped[int] = mapped_column(SmallInteger, default=30, nullable=False)
