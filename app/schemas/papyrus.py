"""Papyrus JSON document schemas."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DocumentType = Literal["free", "template", "report", "form"]


class PapyrusMeta(BaseModel):
    id: str
    version: int = 1
    document_type: DocumentType = "free"
    title: str | None = None
    description: str | None = None
    template_id: str | None = None
    workflow_id: str | None = None
    current_state: str | None = None
    acl: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PapyrusWorkflow(BaseModel):
    workflow_id: str | None = None
    current_state: str | None = None


class PapyrusRender(BaseModel):
    html: bool = True
    pdf: bool = True
    pdf_engine: str = "opsflux_pdf_service"


class PapyrusDocument(BaseModel):
    id: str
    version: int = 1
    meta: PapyrusMeta
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    refs: list[dict[str, Any] | str] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
    workflow: PapyrusWorkflow = Field(default_factory=PapyrusWorkflow)
    schedule: dict[str, Any] = Field(default_factory=dict)
    render: PapyrusRender = Field(default_factory=PapyrusRender)


class PapyrusVersionSummary(BaseModel):
    id: UUID
    document_id: UUID
    revision_id: UUID | None = None
    version: int
    patch_type: Literal["snapshot", "diff"]
    created_by: UUID | None = None
    created_at: datetime | None = None
    message: str | None = None
    workflow_tag: str | None = None


class PapyrusFormCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: UUID | None = None
    doc_type_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    form_schema: dict[str, Any] = Field(default_factory=dict, alias="schema_json")
    settings_json: dict[str, Any] = Field(default_factory=dict)


class PapyrusFormUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_id: UUID | None = None
    doc_type_id: UUID | None = None
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    form_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    settings_json: dict[str, Any] | None = None
    is_active: bool | None = None


class PapyrusFormRead(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    entity_id: UUID
    document_id: UUID | None = None
    doc_type_id: UUID | None = None
    name: str
    description: str | None = None
    form_schema: dict[str, Any] = Field(alias="schema_json")
    settings_json: dict[str, Any]
    is_active: bool
    created_by: UUID | None = None
    created_at: datetime


class PapyrusExternalLinkCreate(BaseModel):
    expires_in_hours: int = Field(default=24, ge=1, le=24 * 90)
    max_submissions: int | None = Field(default=1, ge=1, le=100000)
    prefill: dict[str, Any] | None = None
    allowed_ips: list[str] | None = None
    require_identity: bool = False


class PapyrusExternalLinkRead(BaseModel):
    id: UUID
    form_id: UUID
    token_id: str
    expires_at: datetime
    max_submissions: int | None = None
    submission_count: int
    prefill: dict[str, Any] | None = None
    allowed_ips: list[str] | None = None
    require_identity: bool
    is_revoked: bool
    created_at: datetime
    external_url: str


class PapyrusExternalSubmissionCreate(BaseModel):
    respondent: dict[str, Any] | None = None
    answers: dict[str, Any] = Field(default_factory=dict)


class PapyrusExternalSubmissionRead(BaseModel):
    id: UUID
    form_id: UUID
    token_id: str
    submitted_at: datetime
    respondent: dict[str, Any] | None = None
    answers: dict[str, Any]
    ip_address: str | None = None
    status: str
    processed_by: UUID | None = None
    processed_at: datetime | None = None


class PapyrusEpiCollectImport(BaseModel):
    document_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    project: dict[str, Any] = Field(default_factory=dict)


class PapyrusEpiCollectExportRead(BaseModel):
    project: dict[str, Any]


class PapyrusScheduleChannel(BaseModel):
    type: Literal["email", "in_app"] = "email"
    smtp_override: dict[str, Any] | None = None
    from_address: str | None = None
    subject: str | None = None
    format: str = "pdf_attached"


class PapyrusScheduleCondition(BaseModel):
    kpi: str
    op: Literal["<", "<=", ">", ">=", "==", "!=", "contains", "not_contains"] = "<"
    value: Any


class PapyrusScheduleUpdate(BaseModel):
    enabled: bool = False
    cron: str | None = None
    timezone: str | None = None
    grace_minutes: int = Field(default=15, ge=1, le=24 * 60)
    conditions: list[PapyrusScheduleCondition] = Field(default_factory=list)
    recipients: list[str] = Field(default_factory=list)
    channel: PapyrusScheduleChannel = Field(default_factory=PapyrusScheduleChannel)


class PapyrusScheduleRead(PapyrusScheduleUpdate):
    last_run_at: datetime | None = None
    last_success_at: datetime | None = None
    last_status: str | None = None


class PapyrusDispatchRunRead(BaseModel):
    id: UUID
    document_id: UUID
    revision_id: UUID | None = None
    trigger_key: str
    trigger_type: str
    scheduled_for: datetime | None = None
    channel_type: str
    status: str
    recipients: list[Any] | None = None
    result_summary: dict[str, Any] | None = None
    error_message: str | None = None
    triggered_by: UUID | None = None
    created_at: datetime
    finished_at: datetime | None = None


class PapyrusPresetRead(BaseModel):
    key: str
    name: dict[str, str]
    description: dict[str, str]
    tags: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)


class PapyrusPresetInstantiate(BaseModel):
    project_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    language: str = Field(default="fr", max_length=10)
    classification: str = Field(
        default="INT",
        max_length=20,
        pattern=r"^(INT|CONF|REST|PUB)$",
    )
    create_document: bool = True
