"""PID/PFD ORM models — process diagrams, equipment, lines, connections, DCS tags, library."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── PID Documents ──────────────────────────────────────────────────────────


class PIDDocument(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """PID/PFD document — process, utility, instrumentation, etc."""
    __tablename__ = "pid_documents"
    __table_args__ = (
        UniqueConstraint("entity_id", "number", name="uq_pid_documents_entity_number"),
        Index("idx_pid_documents_project_status", "project_id", "status"),
        Index("idx_pid_documents_entity", "entity_id"),
        CheckConstraint(
            "pid_type IN ('pid','pfd','uid','ufd','cause_effect','sld','layout','tie_in')",
            name="ck_pid_documents_pid_type",
        ),
        CheckConstraint(
            "status IN ('draft','in_review','ifd','afc','approved','issued','as_built','obsolete','superseded','cancelled')",
            name="ck_pid_documents_status",
        ),
        CheckConstraint(
            "sheet_format IS NULL OR sheet_format IN ('A0','A1','A2','A3')",
            name="ck_pid_documents_sheet_format",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    document_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # nullable FK to Core documents (no physical FK — table may not exist yet)
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    bu_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )  # nullable FK to business_units (no physical FK — table may not exist yet)
    number: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    pid_type: Mapped[str] = mapped_column(String(30), nullable=False)
    xml_content: Mapped[str | None] = mapped_column(Text, nullable=True)  # draw.io XML, can be several MB
    revision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    sheet_format: Mapped[str | None] = mapped_column(String(5), nullable=True)
    scale: Mapped[str | None] = mapped_column(String(20), nullable=True)
    drawing_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Relationships
    revisions: Mapped[list["PIDRevision"]] = relationship(
        back_populates="pid_document", cascade="all, delete-orphan"
    )
    equipment_items: Mapped[list["Equipment"]] = relationship(
        back_populates="pid_document"
    )
    connections: Mapped[list["PIDConnection"]] = relationship(
        back_populates="pid_document", cascade="all, delete-orphan"
    )
    dcs_tags: Mapped[list["DCSTag"]] = relationship(
        back_populates="pid_document"
    )
    lock: Mapped["PIDLock | None"] = relationship(
        back_populates="pid_document", uselist=False
    )


# ─── PID Revisions (immutable snapshots) ────────────────────────────────────


class PIDRevision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Immutable revision snapshot — never UPDATE/DELETE after creation."""
    __tablename__ = "pid_revisions"
    __table_args__ = (
        Index("idx_pid_revisions_document", "pid_document_id"),
        CheckConstraint(
            "change_type IN ('creation','modification','correction','addition','deletion','reissue')",
            name="ck_pid_revisions_change_type",
        ),
    )

    pid_document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pid_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_code: Mapped[str] = mapped_column(String(20), nullable=False)
    xml_content: Mapped[str] = mapped_column(Text, nullable=False)
    change_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_type: Mapped[str] = mapped_column(String(20), nullable=False, default="creation")
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    pid_document: Mapped["PIDDocument"] = relationship(back_populates="revisions")


# ─── Equipment ──────────────────────────────────────────────────────────────


class Equipment(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Process equipment entry — vessels, pumps, exchangers, instruments, etc."""
    __tablename__ = "equipment"
    __table_args__ = (
        UniqueConstraint("entity_id", "project_id", "tag", name="uq_equipment_entity_project_tag"),
        Index("idx_equipment_entity_tag", "entity_id", "tag"),
        Index("idx_equipment_pid_document", "pid_document_id"),
        Index(
            "idx_equipment_asset",
            "asset_id",
            postgresql_where="asset_id IS NOT NULL",
        ),
        CheckConstraint(
            "equipment_type IN ("
            "'vessel','heat_exchanger','pump','compressor','turbine','column','reactor',"
            "'tank','filter','valve','instrument','mixer','dryer','boiler','furnace',"
            "'conveyor','centrifuge','ejector','flare','separator','pig_launcher',"
            "'pig_receiver','manifold','wellhead','christmas_tree','choke',"
            "'safety_valve','control_valve','other')",
            name="ck_equipment_type",
        ),
        CheckConstraint(
            "fluid_phase IS NULL OR fluid_phase IN ("
            "'liquid','gas','two_phase','multiphase','solid','slurry','steam','vapour')",
            name="ck_equipment_fluid_phase",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    pid_document_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pid_documents.id"), nullable=True
    )
    asset_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True
    )  # link to Asset Registry
    tag: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    equipment_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fluid: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fluid_phase: Mapped[str | None] = mapped_column(String(20), nullable=True)
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(
        Numeric, nullable=True
    )
    design_temperature_c: Mapped[Decimal | None] = mapped_column(
        Numeric, nullable=True
    )
    operating_pressure_barg: Mapped[Decimal | None] = mapped_column(
        Numeric, nullable=True
    )
    operating_temperature_c: Mapped[Decimal | None] = mapped_column(
        Numeric, nullable=True
    )
    material_of_construction: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    capacity_value: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    capacity_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    lng: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    mxgraph_cell_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # draw.io sync
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    removed_from_pid: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )  # D-093: soft-remove from PID without physical delete

    # Relationships
    pid_document: Mapped["PIDDocument | None"] = relationship(
        back_populates="equipment_items"
    )
    dcs_tags: Mapped[list["DCSTag"]] = relationship(back_populates="equipment")


# ─── Process Lines ──────────────────────────────────────────────────────────


class ProcessLine(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Process piping line — line number, specs, insulation, heat tracing."""
    __tablename__ = "process_lines"
    __table_args__ = (
        UniqueConstraint(
            "entity_id", "project_id", "line_number",
            name="uq_process_lines_entity_project_line",
        ),
        Index("idx_process_lines_entity", "entity_id"),
        CheckConstraint(
            "insulation_type IS NULL OR insulation_type IN ("
            "'none','hot','cold','acoustic','personnel_protection','anti_condensation')",
            name="ck_process_lines_insulation_type",
        ),
        CheckConstraint(
            "heat_tracing_type IS NULL OR heat_tracing_type IN ('electric','steam','hot_water','glycol')",
            name="ck_process_lines_heat_tracing_type",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    line_number: Mapped[str] = mapped_column(String(100), nullable=False)
    nominal_diameter_inch: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    nominal_diameter_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pipe_schedule: Mapped[str | None] = mapped_column(String(30), nullable=True)
    spec_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    spec_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fluid: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fluid_full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    insulation_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    insulation_thickness_mm: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    heat_tracing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    heat_tracing_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    design_temperature_c: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    material_of_construction: Mapped[str | None] = mapped_column(String(100), nullable=True)
    length_m: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    mxgraph_cell_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # draw.io sync
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── PID Connections (graph edges) ──────────────────────────────────────────


class PIDConnection(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Process graph edge — equipment-to-equipment via lines (cross-PID capable)."""
    __tablename__ = "pid_connections"
    __table_args__ = (
        Index(
            "idx_pid_connections_from",
            "entity_id", "from_entity_type", "from_entity_id",
        ),
        Index("idx_pid_connections_document", "pid_document_id"),
        CheckConstraint(
            "connection_type IN ('process','instrument','utility','drain','vent')",
            name="ck_pid_connections_type",
        ),
        CheckConstraint(
            "flow_direction IN ('forward','reverse','bidirectional')",
            name="ck_pid_connections_flow_direction",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    pid_document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pid_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # equipment, line, instrument
    from_entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    from_connection_point: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    to_entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    to_connection_point: Mapped[str | None] = mapped_column(String(50), nullable=True)
    connection_type: Mapped[str] = mapped_column(String(20), nullable=False, default="process")
    continuation_ref: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # cross-PID reference
    flow_direction: Mapped[str] = mapped_column(
        String(20), nullable=False, default="forward"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    pid_document: Mapped["PIDDocument"] = relationship(back_populates="connections")


# ─── DCS Tags (Rockwell registry) ──────────────────────────────────────────


class DCSTag(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """DCS tag — Rockwell tag registry for instruments and control loops."""
    __tablename__ = "dcs_tags"
    __table_args__ = (
        UniqueConstraint("entity_id", "project_id", "tag_name", name="uq_dcs_tags_entity_project_tag"),
        Index("idx_dcs_tags_entity_type_area", "entity_id", "tag_type", "area"),
        Index(
            "idx_dcs_tags_equipment",
            "equipment_id",
            postgresql_where="equipment_id IS NOT NULL",
        ),
        Index("idx_dcs_tags_pid_document", "pid_document_id"),
        CheckConstraint(
            "tag_type IN ("
            "'AI','AO','DI','DO','PI','TI','FI','LI','PDI','TT','PT','FT','LT',"
            "'PIC','TIC','FIC','LIC','PCV','TCV','FCV','LCV',"
            "'PAH','PAL','PAHH','PALL','TAH','TAL','TAHH','TALL',"
            "'FAH','FAL','FAHH','FALL','LAH','LAL','LAHH','LALL',"
            "'PSV','TSV','FSV','LSV','XV','HV','MOV','SOV',"
            "'ZSO','ZSC','HS','YS',"
            "'calc','virtual','manual','other')",
            name="ck_dcs_tags_tag_type",
        ),
        CheckConstraint(
            "source IN ('csv','manual','suggested')",
            name="ck_dcs_tags_source",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    tag_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tag_type: Mapped[str] = mapped_column(String(20), nullable=False)
    area: Mapped[str | None] = mapped_column(String(50), nullable=True)
    equipment_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("equipment.id"), nullable=True
    )
    pid_document_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pid_documents.id"), nullable=True
    )
    dcs_address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    range_min: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    range_max: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    engineering_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    alarm_lo: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    alarm_hi: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    trip_lo: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    trip_hi: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="manual")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    # Relationships
    equipment: Mapped["Equipment | None"] = relationship(back_populates="dcs_tags")
    pid_document: Mapped["PIDDocument | None"] = relationship(back_populates="dcs_tags")


# ─── Tag Naming Rules ──────────────────────────────────────────────────────


class TagNamingRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tag naming convention rule — pattern + segments for auto-validation."""
    __tablename__ = "tag_naming_rules"
    __table_args__ = (
        Index("idx_tag_naming_rules_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    pattern: Mapped[str] = mapped_column(Text, nullable=False)  # regex or template pattern
    segments: Mapped[dict] = mapped_column(JSONB, nullable=False)  # segment definitions
    separator: Mapped[str | None] = mapped_column(String(5), nullable=True)
    applies_to_types: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="'[]'::jsonb"
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── Process Library Items ──────────────────────────────────────────────────


class ProcessLibItem(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Library of process symbol shapes — predefined and custom."""
    __tablename__ = "process_lib_items"
    __table_args__ = (
        Index("idx_process_lib_items_entity_category", "entity_id", "category", "is_active"),
        CheckConstraint(
            "category IN ('vessel','pump','compressor','valve','heat_exchanger',"
            "'separator','instrument','line','fitting','other')",
            name="ck_process_lib_items_category",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    subcategory: Mapped[str | None] = mapped_column(String(50), nullable=True)
    svg_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    mxgraph_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    properties_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    connection_points: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    equipment_type_mapping: Mapped[str | None] = mapped_column(String(30), nullable=True)
    autocad_block_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_predefined: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ─── PID Lock (Redis-backed editing lock — D-092) ──────────────────────────


class PIDLock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """PID editing lock — ensures single-user editing with heartbeat expiry (D-092)."""
    __tablename__ = "pid_locks"
    __table_args__ = (
        UniqueConstraint("pid_document_id", name="uq_pid_locks_document"),
    )

    pid_document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pid_documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    locked_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    locked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    pid_document: Mapped["PIDDocument"] = relationship(back_populates="lock")
