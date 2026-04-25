"""Pydantic schemas for PID/PFD module — documents, equipment, lines, connections, DCS tags."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


# ══════════════════════════════════════════════════════════════════════════════
# PID DOCUMENTS
# ══════════════════════════════════════════════════════════════════════════════


class PIDDocumentCreate(BaseModel):
    project_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=500)
    pid_type: str = Field(
        ...,
        pattern=r"^(pid|pfd|uid|ufd|cause_effect|sld|layout|tie_in)$",
    )
    sheet_format: str = Field(default="A1", max_length=20)
    scale: str | None = Field(default=None, max_length=50)
    drawing_number: str | None = Field(default=None, max_length=100)


class PIDDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    pid_type: str | None = Field(
        default=None,
        pattern=r"^(pid|pfd|uid|ufd|cause_effect|sld|layout|tie_in)$",
    )
    sheet_format: str | None = Field(default=None, max_length=20)
    scale: str | None = None
    drawing_number: str | None = None
    status: str | None = Field(
        default=None,
        pattern=r"^(draft|in_review|approved|issued|superseded|cancelled)$",
    )


class PIDXMLUpdate(BaseModel):
    """Used by the save endpoint to persist draw.io XML content."""
    xml_content: str = Field(..., min_length=1)


class PIDDocumentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    document_id: UUID | None = None
    project_id: UUID | None = None
    bu_id: UUID | None = None
    number: str
    title: str
    pid_type: str
    revision: str
    status: str
    sheet_format: str
    scale: str | None = None
    drawing_number: str | None = None
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched
    project_name: str | None = None
    equipment_count: int = 0
    creator_name: str | None = None


class PIDDocumentDetailRead(PIDDocumentRead):
    """Extended read with XML content — only for detail/editor view."""
    xml_content: str | None = None


# ══════════════════════════════════════════════════════════════════════════════
# PID REVISIONS
# ══════════════════════════════════════════════════════════════════════════════


class PIDRevisionCreate(BaseModel):
    description: str | None = Field(default=None, max_length=2000)
    change_type: str = Field(
        default="modification",
        pattern=r"^(creation|modification|correction|addition|deletion|reissue)$",
    )


class PIDRevisionRead(OpsFluxSchema):
    id: UUID
    pid_document_id: UUID
    revision_code: str
    change_description: str | None = None
    change_type: str
    created_by: UUID
    created_at: datetime
    # Enriched
    creator_name: str | None = None


class PIDRevisionDetailRead(PIDRevisionRead):
    """Extended read with full XML snapshot — only for detail/diff view."""
    xml_content: str


# ══════════════════════════════════════════════════════════════════════════════
# EQUIPMENT
# ══════════════════════════════════════════════════════════════════════════════


class EquipmentCreate(BaseModel):
    project_id: UUID | None = None
    pid_document_id: UUID | None = None
    asset_id: UUID | None = None
    tag: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    equipment_type: str = Field(
        ...,
        pattern=(
            r"^(vessel|heat_exchanger|pump|compressor|turbine|column|reactor|"
            r"tank|filter|valve|instrument|mixer|dryer|boiler|furnace|"
            r"conveyor|centrifuge|ejector|flare|separator|pig_launcher|"
            r"pig_receiver|manifold|wellhead|christmas_tree|choke|"
            r"safety_valve|control_valve|other)$"
        ),
    )
    service: str | None = Field(default=None, max_length=200)
    fluid: str | None = Field(default=None, max_length=100)
    fluid_phase: str | None = Field(
        default=None,
        pattern=r"^(liquid|gas|two_phase|multiphase|solid|slurry|steam|vapour)$",
    )
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    operating_pressure_barg: float | None = None
    operating_temperature_c: float | None = None
    material_of_construction: str | None = Field(default=None, max_length=200)
    capacity_value: float | None = Field(default=None, ge=0)
    capacity_unit: str | None = Field(default=None, max_length=20)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    mxgraph_cell_id: str | None = Field(default=None, max_length=100)


class EquipmentUpdate(BaseModel):
    """All optional — tag rename is handled by a separate bulk-rename endpoint."""
    project_id: UUID | None = None
    pid_document_id: UUID | None = None
    asset_id: UUID | None = None
    description: str | None = None
    equipment_type: str | None = Field(
        default=None,
        pattern=(
            r"^(vessel|heat_exchanger|pump|compressor|turbine|column|reactor|"
            r"tank|filter|valve|instrument|mixer|dryer|boiler|furnace|"
            r"conveyor|centrifuge|ejector|flare|separator|pig_launcher|"
            r"pig_receiver|manifold|wellhead|christmas_tree|choke|"
            r"safety_valve|control_valve|other)$"
        ),
    )
    service: str | None = None
    fluid: str | None = None
    fluid_phase: str | None = Field(
        default=None,
        pattern=r"^(liquid|gas|two_phase|multiphase|solid|slurry|steam|vapour)$",
    )
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    operating_pressure_barg: float | None = None
    operating_temperature_c: float | None = None
    material_of_construction: str | None = None
    capacity_value: float | None = Field(default=None, ge=0)
    capacity_unit: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    mxgraph_cell_id: str | None = None


class EquipmentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID | None = None
    pid_document_id: UUID | None = None
    asset_id: UUID | None = None
    tag: str
    description: str | None = None
    equipment_type: str
    service: str | None = None
    fluid: str | None = None
    fluid_phase: str | None = None
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    operating_pressure_barg: float | None = None
    operating_temperature_c: float | None = None
    material_of_construction: str | None = None
    capacity_value: float | None = None
    capacity_unit: str | None = None
    lat: float | None = None
    lng: float | None = None
    mxgraph_cell_id: str | None = None
    is_active: bool
    removed_from_pid: bool = False
    created_at: datetime
    updated_at: datetime
    # Enriched
    pid_number: str | None = None
    project_name: str | None = None
    asset_name: str | None = None
    dcs_tag_count: int = 0


# ══════════════════════════════════════════════════════════════════════════════
# PROCESS LINES
# ══════════════════════════════════════════════════════════════════════════════


class ProcessLineCreate(BaseModel):
    project_id: UUID | None = None
    line_number: str = Field(..., min_length=1, max_length=200)
    nominal_diameter_inch: float | None = Field(default=None, ge=0)
    nominal_diameter_mm: int | None = Field(default=None, ge=0)
    pipe_schedule: str | None = Field(default=None, max_length=20)
    spec_class: str | None = Field(default=None, max_length=50)
    spec_code: str | None = Field(default=None, max_length=50)
    fluid: str | None = Field(default=None, max_length=100)
    fluid_full_name: str | None = Field(default=None, max_length=200)
    insulation_type: str = Field(
        default="none",
        pattern=r"^(none|hot|cold|acoustic|personnel_protection|anti_condensation)$",
    )
    insulation_thickness_mm: int | None = Field(default=None, ge=0)
    heat_tracing: bool = False
    heat_tracing_type: str | None = Field(
        default=None,
        pattern=r"^(electric|steam|hot_water|glycol)$",
    )
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    material_of_construction: str | None = Field(default=None, max_length=200)
    length_m: float | None = Field(default=None, ge=0)
    mxgraph_cell_id: str | None = Field(default=None, max_length=100)


class ProcessLineUpdate(BaseModel):
    line_number: str | None = Field(default=None, min_length=1, max_length=200)
    nominal_diameter_inch: float | None = Field(default=None, ge=0)
    nominal_diameter_mm: int | None = Field(default=None, ge=0)
    pipe_schedule: str | None = None
    spec_class: str | None = None
    spec_code: str | None = None
    fluid: str | None = None
    fluid_full_name: str | None = None
    insulation_type: str | None = Field(
        default=None,
        pattern=r"^(none|hot|cold|acoustic|personnel_protection|anti_condensation)$",
    )
    insulation_thickness_mm: int | None = Field(default=None, ge=0)
    heat_tracing: bool | None = None
    heat_tracing_type: str | None = Field(
        default=None,
        pattern=r"^(electric|steam|hot_water|glycol)$",
    )
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    material_of_construction: str | None = None
    length_m: float | None = Field(default=None, ge=0)
    mxgraph_cell_id: str | None = None


class ProcessLineRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID | None = None
    line_number: str
    nominal_diameter_inch: float | None = None
    nominal_diameter_mm: int | None = None
    pipe_schedule: str | None = None
    spec_class: str | None = None
    spec_code: str | None = None
    fluid: str | None = None
    fluid_full_name: str | None = None
    insulation_type: str
    insulation_thickness_mm: int | None = None
    heat_tracing: bool
    heat_tracing_type: str | None = None
    design_pressure_barg: float | None = None
    design_temperature_c: float | None = None
    material_of_construction: str | None = None
    length_m: float | None = None
    mxgraph_cell_id: str | None = None
    is_active: bool = True
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# PID CONNECTIONS
# ══════════════════════════════════════════════════════════════════════════════


class PIDConnectionCreate(BaseModel):
    pid_document_id: UUID
    from_entity_type: str = Field(
        ...,
        pattern=r"^(equipment|process_line|instrument|nozzle|off_page)$",
    )
    from_entity_id: UUID
    from_connection_point: str | None = Field(default=None, max_length=100)
    to_entity_type: str = Field(
        ...,
        pattern=r"^(equipment|process_line|instrument|nozzle|off_page)$",
    )
    to_entity_id: UUID
    to_connection_point: str | None = Field(default=None, max_length=100)
    connection_type: str = Field(
        default="process",
        pattern=r"^(process|utility|signal|pneumatic|hydraulic|electrical|capillary)$",
    )
    continuation_ref: str | None = Field(default=None, max_length=100)
    flow_direction: str = Field(
        default="forward",
        pattern=r"^(forward|reverse|bidirectional|undefined)$",
    )


class PIDConnectionRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    pid_document_id: UUID
    from_entity_type: str
    from_entity_id: UUID
    from_connection_point: str | None = None
    to_entity_type: str
    to_entity_id: UUID
    to_connection_point: str | None = None
    connection_type: str
    continuation_ref: str | None = None
    flow_direction: str
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# DCS TAGS
# ══════════════════════════════════════════════════════════════════════════════


class DCSTagCreate(BaseModel):
    project_id: UUID | None = None
    tag_name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    tag_type: str = Field(
        ...,
        pattern=(
            r"^(AI|AO|DI|DO|PI|TI|FI|LI|PDI|TT|PT|FT|LT|"
            r"PIC|TIC|FIC|LIC|PCV|TCV|FCV|LCV|"
            r"PAH|PAL|PAHH|PALL|TAH|TAL|TAHH|TALL|"
            r"FAH|FAL|FAHH|FALL|LAH|LAL|LAHH|LALL|"
            r"PSV|TSV|FSV|LSV|XV|HV|MOV|SOV|"
            r"ZSO|ZSC|HS|YS|"
            r"calc|virtual|manual|other)$"
        ),
    )
    area: str | None = Field(default=None, max_length=50)
    equipment_id: UUID | None = None
    pid_document_id: UUID | None = None
    dcs_address: str | None = Field(default=None, max_length=100)
    range_min: float | None = None
    range_max: float | None = None
    engineering_unit: str | None = Field(default=None, max_length=30)
    alarm_lo: float | None = None
    alarm_hi: float | None = None
    trip_lo: float | None = None
    trip_hi: float | None = None


class DCSTagUpdate(BaseModel):
    tag_name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    tag_type: str | None = Field(
        default=None,
        pattern=(
            r"^(AI|AO|DI|DO|PI|TI|FI|LI|PDI|TT|PT|FT|LT|"
            r"PIC|TIC|FIC|LIC|PCV|TCV|FCV|LCV|"
            r"PAH|PAL|PAHH|PALL|TAH|TAL|TAHH|TALL|"
            r"FAH|FAL|FAHH|FALL|LAH|LAL|LAHH|LALL|"
            r"PSV|TSV|FSV|LSV|XV|HV|MOV|SOV|"
            r"ZSO|ZSC|HS|YS|"
            r"calc|virtual|manual|other)$"
        ),
    )
    area: str | None = Field(default=None, max_length=50)
    equipment_id: UUID | None = None
    pid_document_id: UUID | None = None
    dcs_address: str | None = None
    range_min: float | None = None
    range_max: float | None = None
    engineering_unit: str | None = None
    alarm_lo: float | None = None
    alarm_hi: float | None = None
    trip_lo: float | None = None
    trip_hi: float | None = None


class DCSTagRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID | None = None
    tag_name: str
    description: str | None = None
    tag_type: str
    area: str | None = None
    equipment_id: UUID | None = None
    pid_document_id: UUID | None = None
    dcs_address: str | None = None
    range_min: float | None = None
    range_max: float | None = None
    engineering_unit: str | None = None
    alarm_lo: float | None = None
    alarm_hi: float | None = None
    trip_lo: float | None = None
    trip_hi: float | None = None
    source: str | None = None
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched
    equipment_tag: str | None = None
    pid_number: str | None = None


# ══════════════════════════════════════════════════════════════════════════════
# TAG NAMING RULES
# ══════════════════════════════════════════════════════════════════════════════


class TagNamingRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    pattern: str = Field(..., min_length=1, max_length=500)
    segments: list[dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="Ordered list of segment definitions, e.g. [{name, type, values, length}]",
    )
    separator: str = Field(default="-", max_length=5)
    applies_to_types: list[str] = Field(default_factory=list)
    is_default: bool = False


class TagNamingRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    pattern: str | None = Field(default=None, min_length=1, max_length=500)
    segments: list[dict[str, Any]] | None = None
    separator: str | None = Field(default=None, max_length=5)
    applies_to_types: list[str] | None = None
    is_default: bool | None = None


class TagNamingRuleRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    description: str | None = None
    pattern: str
    segments: list[dict[str, Any]]
    separator: str
    applies_to_types: list[str]
    is_default: bool
    created_by: UUID
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# PROCESS LIBRARY ITEMS
# ══════════════════════════════════════════════════════════════════════════════


class ProcessLibItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(
        ...,
        pattern=(
            r"^(vessel|heat_exchanger|pump|compressor|turbine|column|reactor|"
            r"tank|filter|valve|instrument|piping|fitting|nozzle|"
            r"electrical|safety|utility|annotation|other)$"
        ),
    )
    subcategory: str | None = Field(default=None, max_length=100)
    svg_template: str = Field(..., min_length=1)
    mxgraph_style: str = Field(..., min_length=1)
    properties_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="JSON Schema defining configurable properties for this symbol",
    )
    connection_points: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of connection point definitions [{id, label, x, y, direction}]",
    )
    equipment_type_mapping: str | None = Field(default=None, max_length=50)
    autocad_block_name: str | None = Field(default=None, max_length=100)


class ProcessLibItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(
        default=None,
        pattern=(
            r"^(vessel|heat_exchanger|pump|compressor|turbine|column|reactor|"
            r"tank|filter|valve|instrument|piping|fitting|nozzle|"
            r"electrical|safety|utility|annotation|other)$"
        ),
    )
    subcategory: str | None = None
    svg_template: str | None = Field(default=None, min_length=1)
    mxgraph_style: str | None = Field(default=None, min_length=1)
    properties_schema: dict[str, Any] | None = None
    connection_points: list[dict[str, Any]] | None = None
    equipment_type_mapping: str | None = None
    autocad_block_name: str | None = None


class ProcessLibItemRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    category: str
    subcategory: str | None = None
    svg_template: str
    mxgraph_style: str
    properties_schema: dict[str, Any]
    connection_points: list[dict[str, Any]]
    equipment_type_mapping: str | None = None
    autocad_block_name: str | None = None
    version: int
    is_active: bool
    is_predefined: bool
    created_by: UUID
    created_at: datetime


# ══════════════════════════════════════════════════════════════════════════════
# TAG SUGGESTION / VALIDATION
# ══════════════════════════════════════════════════════════════════════════════


class TagSuggestRequest(BaseModel):
    """Request body for the tag suggestion endpoint."""
    tag_type: str = Field(..., min_length=1, max_length=50)
    area: str = Field(..., min_length=1, max_length=50)
    equipment_id: UUID | None = None
    project_id: str = Field(..., min_length=1)


class TagSuggestResponse(BaseModel):
    suggestions: list[str]


class TagValidateRequest(BaseModel):
    """Request body for the tag validation endpoint."""
    tag_name: str = Field(..., min_length=1, max_length=100)
    tag_type: str = Field(..., min_length=1, max_length=50)
    project_id: str = Field(..., min_length=1)


class TagValidateResponse(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    tag_name: str


# ══════════════════════════════════════════════════════════════════════════════
# BULK RENAME
# ══════════════════════════════════════════════════════════════════════════════


class BulkRenameRequest(BaseModel):
    """Request for bulk tag/equipment rename — supports wildcard pattern."""
    filter_area: str | None = Field(default=None, max_length=50)
    filter_type: str | None = Field(default=None, max_length=50)
    filter_pattern: str | None = Field(
        default=None,
        max_length=200,
        description="Glob-style filter pattern, e.g. ZONE-A-*",
    )
    rename_pattern: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Rename pattern, e.g. ZONE-B-* (wildcards map positionally)",
    )


class BulkRenamePreviewItem(BaseModel):
    old_name: str
    new_name: str


class BulkRenamePreviewResponse(BaseModel):
    preview: list[BulkRenamePreviewItem]


# ══════════════════════════════════════════════════════════════════════════════
# AFC VALIDATION
# ══════════════════════════════════════════════════════════════════════════════


class AFCValidationError(BaseModel):
    code: str
    severity: str = Field(default="error", pattern=r"^(error|critical)$")
    message: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    entity_tag: str | None = None
    field: str | None = None


class AFCValidationWarning(BaseModel):
    code: str
    severity: str = Field(default="warning", pattern=r"^(warning|info)$")
    message: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    entity_tag: str | None = None
    field: str | None = None


class AFCValidationResult(BaseModel):
    """Result of Approved-for-Construction validation on a PID document."""
    is_valid: bool
    errors: list[AFCValidationError] = Field(default_factory=list)
    warnings: list[AFCValidationWarning] = Field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════════════
# TRACE (LINE / EQUIPMENT)
# ══════════════════════════════════════════════════════════════════════════════


class LineTracePIDInfo(BaseModel):
    pid_document_id: UUID
    pid_number: str
    sheet_format: str | None = None


class LineTraceResponse(BaseModel):
    """Trace result showing everywhere a process line appears and what it connects."""
    line_number: str
    line_details: dict[str, Any]
    pid_count: int
    pids: list[LineTracePIDInfo]
    equipment_connected: list[str]


class EquipmentAppearanceInfo(BaseModel):
    pid_document_id: UUID
    pid_number: str
    mxgraph_cell_id: str | None = None
    sheet_format: str | None = None


class EquipmentAppearancesResponse(BaseModel):
    """Shows all PID sheets where a given equipment tag appears."""
    tag: str
    appearances: list[EquipmentAppearanceInfo]


# ══════════════════════════════════════════════════════════════════════════════
# CELL DATA (draw.io side-panel)
# ══════════════════════════════════════════════════════════════════════════════


class PIDCellDataRead(BaseModel):
    """Data returned when clicking a cell in the draw.io editor."""
    entity_type: str
    entity: dict[str, Any] | None = None
    tag: str | None = None
    line_number: str | None = None
