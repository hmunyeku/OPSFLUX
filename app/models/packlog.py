"""PackLog ORM models — cargo requests, cargo items, evidence, package
elements, article catalog, deck layouts.

PackLog owns the cargo + tracking domain end-to-end. These entities used
to live in `app/models/travelwiz.py` but were extracted as part of the
PackLog ↔ TravelWiz isolation work so cargo flows can evolve
independently of voyage / PAX flows. See
`memory/project_packlog_isolation.md` for the architectural rationale.

Cross-module foreign keys are still allowed (and necessary) — a
CargoItem references `voyage_manifests.id` (TravelWiz) via `manifest_id`,
and `transport_vector_zones.id` via `planned_zone_id`. The FK is just a
schema-level pointer; both modules share the same SQLAlchemy `Base`,
so SQLAlchemy resolves the join targets automatically as long as both
modules are imported into `app/models/__init__.py`.

The reverse-direction back_populates relationship lives in TravelWiz:
`VoyageManifest.cargo_items: Mapped[list["CargoItem"]] = relationship(...)`
uses a string forward ref so the import order doesn't matter.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
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
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

# ─── Cargo Requests ─────────────────────────────────────────────────────────


class CargoRequest(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cargo_requests"
    __table_args__ = (
        UniqueConstraint("request_code", name="uq_cargo_request_code"),
        Index("idx_cargo_request_entity", "entity_id"),
        Index("idx_cargo_request_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    request_code: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    project_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
    imputation_reference_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("imputation_references.id", ondelete="SET NULL")
    )
    sender_tier_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"))
    receiver_name: Mapped[str | None] = mapped_column(String(200))
    destination_asset_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"))
    requester_user_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    sender_contact_tier_contact_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tier_contacts.id", ondelete="SET NULL")
    )
    requester_name: Mapped[str | None] = mapped_column(String(200))
    requested_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


# ─── Cargo Items ────────────────────────────────────────────────────────────


class CargoItem(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cargo_items"
    __table_args__ = (
        UniqueConstraint("tracking_code", name="uq_cargo_tracking_code"),
        Index("idx_cargo_entity", "entity_id"),
        Index("idx_cargo_tracking", "tracking_code"),
        Index("idx_cargo_status", "status"),
        Index("idx_cargo_manifest", "manifest_id"),
        # Created_at index added during PackLog isolation — history
        # queries (cargo/{id}/history) and date-range filters were
        # doing full table scans on a column that's almost always in
        # the WHERE / ORDER BY clause.
        Index("idx_cargo_created_at", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
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
    sender_tier_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tiers.id"))
    receiver_name: Mapped[str | None] = mapped_column(String(200))
    destination_asset_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"))
    project_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"))
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
    manifest_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("voyage_manifests.id"))
    planned_zone_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vector_zones.id", ondelete="SET NULL")
    )
    sap_article_code: Mapped[str | None] = mapped_column(String(50))
    hazmat_validated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    received_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    damage_notes: Mapped[str | None] = mapped_column(Text)
    registered_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Forward ref to TravelWiz so we don't import the class directly
    # (would create a circular import). SQLAlchemy resolves the string
    # at mapper configuration time, which happens after both modules
    # are loaded via app/models/__init__.py.
    manifest: Mapped["VoyageManifest | None"] = relationship(  # noqa: F821
        back_populates="cargo_items"
    )


# ─── Cargo Attachment Evidence ──────────────────────────────────────────────


class CargoAttachmentEvidence(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cargo_attachment_evidences"
    __table_args__ = (
        UniqueConstraint("attachment_id", name="uq_cargo_attachment_evidence_attachment"),
        Index("idx_cargo_attachment_evidence_cargo", "cargo_item_id"),
        Index("idx_cargo_attachment_evidence_type", "evidence_type"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    cargo_item_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_items.id", ondelete="CASCADE"), nullable=False
    )
    attachment_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False
    )
    evidence_type: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)


# ─── Article Catalog (SAP matching) ─────────────────────────────────────────


class ArticleCatalog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """SAP article master for cargo matching.

    The catalog can be either GLOBAL (entity_id NULL — shared across all
    entities of the tenant) or PER-ENTITY (entity_id set). The choice is
    governed by the entity-scoped admin setting
    `packlog.article_catalog_global` (default: False → per-entity with NULL
    fallback so shared seed data remains visible to every entity).
    """

    __tablename__ = "article_catalog"
    __table_args__ = (
        Index("idx_article_sap", "sap_code"),
        Index("idx_article_catalog_entity_id", "entity_id"),
        Index("idx_article_catalog_entity_sap", "entity_id", "sap_code"),
    )

    entity_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="SET NULL"),
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ─── Package Element (Sub-items in cargo) ───────────────────────────────────


class PackageElement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Sub-item within a composite cargo package."""

    __tablename__ = "package_elements"
    __table_args__ = (Index("idx_package_elements_parent", "package_id"),)

    package_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cargo_items.id", ondelete="CASCADE"), nullable=False
    )
    article_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("article_catalog.id"))
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


# ─── Deck Layout (Cargo placement) ──────────────────────────────────────────


class DeckLayout(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cargo deck placement plan for a trip+surface.

    The trip_id and deck_surface_id columns reference TravelWiz tables
    (voyages, transport_vector_zones) — both schema-level FKs only, no
    Python imports.
    """

    __tablename__ = "deck_layouts"
    __table_args__ = (Index("idx_deck_layouts_trip", "trip_id", "deck_surface_id", unique=True),)

    trip_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("voyages.id"), nullable=False)
    deck_surface_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transport_vector_zones.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    algo_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    validated_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    layout_rules: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DeckLayoutItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Individual cargo item placement on a deck."""

    __tablename__ = "deck_layout_items"
    __table_args__ = (Index("idx_deck_layout_items_layout", "deck_layout_id"),)

    deck_layout_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("deck_layouts.id", ondelete="CASCADE"), nullable=False
    )
    cargo_item_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cargo_items.id"), nullable=False)
    x_m: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    y_m: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    rotation_deg: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    stack_level: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    placed_by: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
