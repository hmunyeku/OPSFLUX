"""Schemas for the Excel/CSV import assistant."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema

# ── Enums ──────────────────────────────────────────────────────────────────

TargetObject = Literal[
    "asset", "tier", "contact", "pax_profile", "project", "compliance_record", "imputation_reference", "imputation_otp_template", "imputation_assignment"
]

DuplicateStrategy = Literal["skip", "update", "fail"]


class UserSyncProvider(str, Enum):
    ldap = "ldap"
    azure_ad = "azure_ad"
    gouti = "gouti"
    okta = "okta"
    keycloak = "keycloak"


# ── Target object field descriptor ─────────────────────────────────────────

class TargetFieldDef(BaseModel):
    """Describes one importable field on a target object."""
    key: str
    label: str
    type: str  # string, integer, float, date, datetime, boolean, lookup
    required: bool = False
    example: str | None = None
    lookup_target: str | None = None  # e.g. "tier.code" for FK lookups


class TargetObjectInfo(BaseModel):
    """Metadata about a target object for the mapping UI."""
    key: str
    label: str
    fields: list[TargetFieldDef]


# ── Import Mapping CRUD ────────────────────────────────────────────────────

class ImportMappingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    target_object: TargetObject
    column_mapping: dict[str, str]
    transforms: dict[str, Any] | None = None  # {target_field: {type, params}}
    file_headers: list[str] | None = None  # original file column names for auto-match
    file_settings: dict[str, Any] | None = None


class ImportMappingUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    column_mapping: dict[str, str] | None = None
    transforms: dict[str, Any] | None = None
    file_headers: list[str] | None = None
    file_settings: dict[str, Any] | None = None


class ImportMappingRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    description: str | None
    target_object: str
    column_mapping: dict[str, str]
    transforms: dict[str, Any] | None
    file_headers: list[str] | None
    file_settings: dict[str, Any] | None
    last_used_at: datetime | None
    use_count: int
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


# ── Auto-detect ────────────────────────────────────────────────────────────

class AutoDetectRequest(BaseModel):
    target_object: TargetObject
    file_headers: list[str]


class AutoDetectResponse(BaseModel):
    suggested_mapping: dict[str, str]  # file_col -> target_field
    confidence: dict[str, float]  # file_col -> 0..1


# ── Validate / Preview ────────────────────────────────────────────────────

class RowValidationError(BaseModel):
    row_index: int
    field: str
    message: str
    severity: Literal["error", "warning"] = "error"


class ImportPreviewRequest(BaseModel):
    target_object: TargetObject
    column_mapping: dict[str, str]
    rows: list[dict[str, Any]]
    duplicate_strategy: DuplicateStrategy = "skip"
    transforms: list[dict[str, Any]] | None = None


class ImportPreviewResponse(BaseModel):
    valid_count: int
    error_count: int
    warning_count: int
    duplicate_count: int
    errors: list[RowValidationError]
    preview_rows: list[dict[str, Any]]


# ── Execute import ─────────────────────────────────────────────────────────

class ImportExecuteRequest(BaseModel):
    target_object: TargetObject
    column_mapping: dict[str, str]
    rows: list[dict[str, Any]]
    duplicate_strategy: DuplicateStrategy = "skip"
    transforms: list[dict[str, Any]] | None = None
    mapping_id: UUID | None = None
    max_rows: int | None = None  # Limit import to N valid rows (null = unlimited)


class ImportExecuteResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[RowValidationError]
    total_processed: int
