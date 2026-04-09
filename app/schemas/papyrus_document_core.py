"""Papyrus document schemas.

Historical implementation file kept under ``report_editor`` while the module
transitions from the legacy naming. Covers document types, documents,
revisions, templates, template fields, arborescence nodes, distribution
lists, signatures, share links, workflow actions, and revision diffs.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import OpsFluxSchema


# ─── DocType schemas ────────────────────────────────────────────────────────


class DocTypeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: dict[str, Any] = Field(
        ..., description="JSONB multilingual name, e.g. {'fr': 'Note technique', 'en': 'Technical Note'}"
    )
    nomenclature_pattern: str = Field(
        ..., min_length=1, max_length=500,
        description="Pattern with tokens, e.g. '{ENTITY}-{DOCTYPE}-{PHASE}-{SEQ:4}'"
    )
    discipline: str | None = Field(None, max_length=100)
    default_template_id: UUID | None = None
    default_workflow_id: UUID | None = None
    default_language: str = Field(default="fr", max_length=10)
    revision_scheme: str = Field(
        default="alpha",
        max_length=20,
        pattern=r"^(alpha|numeric|semver)$",
        description="Revision numbering scheme: alpha (A,B,C…), numeric (1,2,3…), semver (1.0, 1.1…)"
    )


class DocTypeUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=50)
    name: dict[str, Any] | None = None
    nomenclature_pattern: str | None = Field(None, min_length=1, max_length=500)
    discipline: str | None = None
    default_template_id: UUID | None = None
    default_workflow_id: UUID | None = None
    default_language: str | None = Field(None, max_length=10)
    revision_scheme: str | None = Field(None, pattern=r"^(alpha|numeric|semver)$")
    is_active: bool | None = None


class DocTypeRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    code: str
    name: dict[str, Any]
    nomenclature_pattern: str
    discipline: str | None = None
    default_template_id: UUID | None = None
    default_workflow_id: UUID | None = None
    default_language: str
    revision_scheme: str
    is_active: bool
    created_by: UUID
    created_at: datetime


# ─── Document schemas ───────────────────────────────────────────────────────


class DocumentCreate(BaseModel):
    doc_type_id: UUID
    project_id: UUID | None = None
    arborescence_node_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=500)
    language: str = Field(default="fr", max_length=10)
    classification: str = Field(
        default="INT",
        max_length=20,
        pattern=r"^(INT|CONF|REST|PUB)$",
        description="Classification level: INT (internal), CONF (confidential), REST (restricted), PUB (public)"
    )
    free_parts: dict[str, Any] = Field(
        default_factory=dict,
        description="Free nomenclature tokens, e.g. {'PHASE': 'APD', 'FREE': 'STRUCT'}"
    )


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    classification: str | None = Field(None, pattern=r"^(INT|CONF|REST|PUB)$")
    arborescence_node_id: UUID | None = None


class DocumentRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    bu_id: UUID | None = None
    doc_type_id: UUID
    project_id: UUID | None = None
    arborescence_node_id: UUID | None = None
    number: str
    title: str
    language: str
    current_revision_id: UUID | None = None
    status: str
    classification: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched fields
    doc_type_name: str | None = None
    project_name: str | None = None
    creator_name: str | None = None
    revision_count: int = 0
    current_rev_code: str | None = None


class DocumentListRead(OpsFluxSchema):
    """Lightweight document read for list views — no content payload."""
    id: UUID
    entity_id: UUID
    bu_id: UUID | None = None
    doc_type_id: UUID
    project_id: UUID | None = None
    arborescence_node_id: UUID | None = None
    number: str
    title: str
    language: str
    current_revision_id: UUID | None = None
    status: str
    classification: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched fields
    doc_type_name: str | None = None
    project_name: str | None = None
    creator_name: str | None = None
    revision_count: int = 0
    current_rev_code: str | None = None


# ─── Revision schemas ───────────────────────────────────────────────────────


class RevisionDraft(BaseModel):
    """Payload for saving a draft revision (auto-save or manual save)."""
    content: dict[str, Any] = Field(
        ..., description="Structured document content (block-based editor JSON)"
    )
    form_data: dict[str, Any] = Field(
        ..., description="Template form field values, keyed by field_key"
    )
    yjs_state: bytes | None = Field(
        None, description="Yjs binary state vector for collaborative editing"
    )


class RevisionCreate(BaseModel):
    """Created when advancing to a new revision (rev_code is auto-generated
    based on the document's doc_type revision_scheme)."""
    pass


class RevisionRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    document_id: UUID
    rev_code: str
    content: dict[str, Any]
    form_data: dict[str, Any]
    word_count: int
    is_locked: bool
    created_by: UUID
    created_at: datetime
    # Enriched
    creator_name: str | None = None


class RevisionSummaryRead(OpsFluxSchema):
    """Lightweight revision read for list views — no content or form_data."""
    id: UUID
    document_id: UUID
    rev_code: str
    word_count: int
    is_locked: bool
    created_by: UUID
    created_at: datetime
    # Enriched
    creator_name: str | None = None


# ─── Template schemas ───────────────────────────────────────────────────────


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)
    doc_type_id: UUID | None = None
    structure: dict[str, Any] = Field(
        ..., description="Template layout: sections, field slots, page settings"
    )
    styles: dict[str, Any] = Field(
        ..., description="CSS/styling overrides: fonts, margins, headers/footers"
    )


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=1000)
    doc_type_id: UUID | None = None
    structure: dict[str, Any] | None = None
    styles: dict[str, Any] | None = None
    is_active: bool | None = None


class TemplateRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    description: str | None = None
    doc_type_id: UUID | None = None
    version: int
    structure: dict[str, Any]
    styles: dict[str, Any]
    is_active: bool
    created_by: UUID
    created_at: datetime
    # Enriched
    doc_type_name: str | None = None
    field_count: int = 0


# ─── TemplateField schemas ──────────────────────────────────────────────────


class TemplateFieldCreate(BaseModel):
    section_id: str = Field(
        ..., min_length=1, max_length=100,
        description="Identifier of the template section this field belongs to"
    )
    field_key: str = Field(
        ..., min_length=1, max_length=100,
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Unique key within the template, e.g. 'doc_title', 'revision_date'"
    )
    field_type: str = Field(
        ..., min_length=1, max_length=50,
        pattern=r"^(text|textarea|richtext|number|date|select|multiselect|checkbox|file|user|table)$",
        description="Field widget type"
    )
    label: dict[str, Any] = Field(
        ..., description="JSONB multilingual label, e.g. {'fr': 'Titre', 'en': 'Title'}"
    )
    is_required: bool = False
    is_locked: bool = Field(
        default=False, description="If true, field value cannot be changed after first revision lock"
    )
    options: dict[str, Any] = Field(
        default_factory=dict,
        description="Type-specific options, e.g. select choices, number min/max, table columns"
    )
    display_order: int = Field(default=0, ge=0)
    validation_rules: dict[str, Any] = Field(
        default_factory=dict,
        description="Custom validation rules, e.g. {'min_length': 10, 'regex': '^[A-Z]'}"
    )


class TemplateFieldUpdate(BaseModel):
    section_id: str | None = Field(None, min_length=1, max_length=100)
    field_key: str | None = Field(None, min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    field_type: str | None = Field(
        None, pattern=r"^(text|textarea|richtext|number|date|select|multiselect|checkbox|file|user|table)$"
    )
    label: dict[str, Any] | None = None
    is_required: bool | None = None
    is_locked: bool | None = None
    options: dict[str, Any] | None = None
    display_order: int | None = Field(None, ge=0)
    validation_rules: dict[str, Any] | None = None


class TemplateFieldRead(OpsFluxSchema):
    id: UUID
    template_id: UUID
    section_id: str
    field_key: str
    field_type: str
    label: dict[str, Any]
    is_required: bool
    is_locked: bool
    options: dict[str, Any]
    display_order: int
    validation_rules: dict[str, Any]


# ─── ArborescenceNode schemas ───────────────────────────────────────────────


class ArborescenceNodeCreate(BaseModel):
    project_id: UUID
    parent_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=200)
    display_order: int = Field(default=0, ge=0)
    nomenclature_override: dict[str, Any] | None = Field(
        None,
        description="Override nomenclature tokens at this node level, e.g. {'DISCIPLINE': 'ELEC'}"
    )


class ArborescenceNodeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    display_order: int | None = Field(None, ge=0)
    nomenclature_override: dict[str, Any] | None = None


class ArborescenceNodeRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    project_id: UUID
    parent_id: UUID | None = None
    name: str
    node_level: int
    display_order: int
    nomenclature_override: dict[str, Any] | None = None
    created_at: datetime
    # Enriched
    children_count: int = 0


# ─── DistributionList schemas ───────────────────────────────────────────────


class DistributionListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    doc_type_filter: UUID | None = Field(
        None, description="Optional doc_type_id to restrict this list to a specific document type"
    )
    recipients: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="List of recipients: [{'user_id': '…', 'role': 'approver'}, {'email': '…', 'role': 'cc'}]"
    )


class DistributionListUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    doc_type_filter: UUID | None = None
    recipients: list[dict[str, Any]] | None = None
    is_active: bool | None = None


class DistributionListRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    name: str
    doc_type_filter: UUID | None = None
    recipients: list[dict[str, Any]]
    is_active: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Enriched
    recipient_count: int = 0


# ─── DocumentSignature schemas ──────────────────────────────────────────────


class DocumentSignatureRead(OpsFluxSchema):
    id: UUID
    document_id: UUID
    revision_id: UUID
    signer_id: UUID
    signer_role: str
    content_hash: str
    signed_at: datetime
    # Enriched
    signer_name: str | None = None


# ─── ShareLink schemas ─────────────────────────────────────────────────────


class ShareLinkCreate(BaseModel):
    document_id: UUID
    expires_days: int = Field(default=30, ge=1, le=365)
    otp_required: bool = False
    max_accesses: int | None = Field(None, ge=1, le=10000)


class ShareLinkRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    document_id: UUID
    token: str
    expires_at: datetime
    otp_required: bool
    access_count: int
    max_accesses: int | None = None
    created_by: UUID
    created_at: datetime


# ─── Workflow Action schemas ────────────────────────────────────────────────


class SubmitRequest(BaseModel):
    """Submit a document revision for review."""
    comment: str | None = None


class ApproveRequest(BaseModel):
    """Approve a document revision."""
    comment: str | None = None


class RejectRequest(BaseModel):
    """Reject a document revision — reason is mandatory."""
    reason: str = Field(..., min_length=1, max_length=2000)


class PublishRequest(BaseModel):
    """Publish a document revision, optionally distributing to lists."""
    distribution_list_ids: list[UUID] = Field(default_factory=list)


# ─── Revision Diff schemas ─────────────────────────────────────────────────


class RevisionDiffResponse(BaseModel):
    """Structured diff between two revisions of a document."""
    rev_a: str = Field(..., description="Rev code of the base revision")
    rev_b: str = Field(..., description="Rev code of the compared revision")
    additions: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Content blocks added in rev_b, e.g. [{'path': 'section.1.2', 'content': '…'}]"
    )
    deletions: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Content blocks removed from rev_a, e.g. [{'path': 'section.1.3', 'content': '…'}]"
    )
    modifications: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Content blocks changed between revisions, e.g. [{'path': '…', 'old': '…', 'new': '…'}]"
    )
