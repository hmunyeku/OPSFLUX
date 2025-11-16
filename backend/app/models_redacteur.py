"""
Modèles SQLModel pour le module rédacteur (reports).
Permet la gestion de rapports/documents avec Tiptap et blocs personnalisés.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlmodel import Column, Field, JSON, Relationship, SQLModel

from app.core.models import AbstractBaseModel


# ============================================================================
# REPORTS (Rapports)
# ============================================================================


class ReportBase(SQLModel):
    """Base model for reports."""

    title: str = Field(max_length=500)
    type: str = Field(default="general", max_length=100)
    content: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    status: str = Field(
        default="draft", max_length=50
    )  # draft, published, archived, deleted
    template_id: Optional[UUID] = Field(default=None, foreign_key="report_templates.id")
    report_metadata: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    version: int = Field(default=1)
    parent_id: Optional[UUID] = Field(
        default=None, foreign_key="reports.id", description="Parent report for versions"
    )


class Report(AbstractBaseModel, ReportBase, table=True):
    """
    Modèle de rapport/document avec éditeur Tiptap.
    Supporte les blocs personnalisés, la collaboration et le versioning.
    """

    __tablename__ = "reports"

    # Relations
    template: Optional["ReportTemplate"] = Relationship(back_populates="reports")
    versions: list["ReportVersion"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    collaborators: list["ReportCollaborator"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    comments: list["ReportComment"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    audit_logs: list["ReportAuditLog"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    exports: list["ReportExport"] = Relationship(
        back_populates="report",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ReportCreate(SQLModel):
    """Schema for creating a report."""

    title: str = Field(max_length=500)
    type: str = Field(default="general", max_length=100)
    content: dict[str, Any] = Field(default_factory=dict)
    status: str = Field(default="draft", max_length=50)
    template_id: Optional[UUID] = None
    report_metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class ReportUpdate(SQLModel):
    """Schema for updating a report."""

    title: Optional[str] = Field(default=None, max_length=500)
    type: Optional[str] = Field(default=None, max_length=100)
    content: Optional[dict[str, Any]] = None
    status: Optional[str] = Field(default=None, max_length=50)
    template_id: Optional[UUID] = None
    report_metadata: Optional[dict[str, Any]] = None
    tags: Optional[list[str]] = None


class ReportPublic(ReportBase):
    """Public report model."""

    id: UUID
    created_by: UUID
    updated_by: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ReportsPublic(SQLModel):
    """List of reports with pagination."""

    data: list[ReportPublic]
    count: int


# ============================================================================
# REPORT TEMPLATES (Gabarits)
# ============================================================================


class ReportTemplateBase(SQLModel):
    """Base model for report templates."""

    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    type: str = Field(default="general", max_length=100)
    content_template: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    metadata_schema: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    is_active: bool = Field(default=True)
    is_system: bool = Field(default=False)
    category: Optional[str] = Field(default=None, max_length=100)


class ReportTemplate(AbstractBaseModel, ReportTemplateBase, table=True):
    """
    Modèle de gabarit de rapport.
    Permet aux admins de créer des modèles réutilisables.
    """

    __tablename__ = "report_templates"

    # Relations
    reports: list["Report"] = Relationship(back_populates="template")


class ReportTemplateCreate(SQLModel):
    """Schema for creating a report template."""

    name: str = Field(max_length=255)
    description: Optional[str] = None
    type: str = Field(default="general", max_length=100)
    content_template: dict[str, Any] = Field(default_factory=dict)
    metadata_schema: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = Field(default=True)
    category: Optional[str] = None


class ReportTemplateUpdate(SQLModel):
    """Schema for updating a report template."""

    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, max_length=100)
    content_template: Optional[dict[str, Any]] = None
    metadata_schema: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None
    category: Optional[str] = None


class ReportTemplatePublic(ReportTemplateBase):
    """Public report template model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class ReportTemplatesPublic(SQLModel):
    """List of report templates."""

    data: list[ReportTemplatePublic]
    count: int


# ============================================================================
# CUSTOM BLOCKS (Blocs personnalisés configurables)
# ============================================================================


class CustomBlockBase(SQLModel):
    """Base model for custom blocks."""

    name: str = Field(max_length=255, unique=True, index=True)
    display_name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    block_type: str = Field(
        max_length=100
    )  # dataFetch, chart, formula, signature, etc.
    configuration: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    is_active: bool = Field(default=True)
    category: str = Field(default="custom", max_length=100)
    icon: Optional[str] = Field(default=None, max_length=100)


class CustomBlock(AbstractBaseModel, CustomBlockBase, table=True):
    """
    Modèle de bloc personnalisé configurable.
    Permet aux admins de définir des blocs réutilisables.
    """

    __tablename__ = "custom_blocks"


class CustomBlockCreate(SQLModel):
    """Schema for creating a custom block."""

    name: str = Field(max_length=255)
    display_name: str = Field(max_length=255)
    description: Optional[str] = None
    block_type: str = Field(max_length=100)
    configuration: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = Field(default=True)
    category: str = Field(default="custom", max_length=100)
    icon: Optional[str] = None


class CustomBlockUpdate(SQLModel):
    """Schema for updating a custom block."""

    display_name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    configuration: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None
    category: Optional[str] = Field(default=None, max_length=100)
    icon: Optional[str] = None


class CustomBlockPublic(CustomBlockBase):
    """Public custom block model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class CustomBlocksPublic(SQLModel):
    """List of custom blocks."""

    data: list[CustomBlockPublic]
    count: int


# ============================================================================
# REPORT VERSIONS (Historique des versions)
# ============================================================================


class ReportVersionBase(SQLModel):
    """Base model for report versions."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    version_number: int
    content_snapshot: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    change_summary: Optional[str] = Field(default=None, max_length=1000)
    metadata_snapshot: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )


class ReportVersion(AbstractBaseModel, ReportVersionBase, table=True):
    """
    Modèle de version de rapport.
    Stocke des snapshots automatiques à chaque modification.
    """

    __tablename__ = "report_versions"

    # Relations
    report: Optional["Report"] = Relationship(back_populates="versions")


class ReportVersionPublic(ReportVersionBase):
    """Public report version model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class ReportVersionsPublic(SQLModel):
    """List of report versions."""

    data: list[ReportVersionPublic]
    count: int


# ============================================================================
# REPORT COLLABORATORS (Collaborateurs par rapport)
# ============================================================================


class ReportCollaboratorBase(SQLModel):
    """Base model for report collaborators."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    user_id: UUID = Field(index=True)
    role: str = Field(default="viewer", max_length=50)  # owner, editor, viewer
    can_edit: bool = Field(default=False)
    can_comment: bool = Field(default=True)
    can_delete: bool = Field(default=False)


class ReportCollaborator(AbstractBaseModel, ReportCollaboratorBase, table=True):
    """
    Modèle de collaborateur sur un rapport.
    Gère les permissions par rapport.
    """

    __tablename__ = "report_collaborators"

    # Relations
    report: Optional["Report"] = Relationship(back_populates="collaborators")


class ReportCollaboratorCreate(SQLModel):
    """Schema for creating a report collaborator."""

    user_id: UUID
    role: str = Field(default="viewer", max_length=50)
    can_edit: bool = Field(default=False)
    can_comment: bool = Field(default=True)
    can_delete: bool = Field(default=False)


class ReportCollaboratorUpdate(SQLModel):
    """Schema for updating a report collaborator."""

    role: Optional[str] = Field(default=None, max_length=50)
    can_edit: Optional[bool] = None
    can_comment: Optional[bool] = None
    can_delete: Optional[bool] = None


class ReportCollaboratorPublic(ReportCollaboratorBase):
    """Public report collaborator model."""

    id: UUID
    created_at: datetime


class ReportCollaboratorsPublic(SQLModel):
    """List of report collaborators."""

    data: list[ReportCollaboratorPublic]
    count: int


# ============================================================================
# REPORT COMMENTS (Commentaires)
# ============================================================================


class ReportCommentBase(SQLModel):
    """Base model for report comments."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    parent_id: Optional[UUID] = Field(default=None, foreign_key="report_comments.id")
    content: str
    position: Optional[dict[str, Any]] = Field(
        default=None, sa_column=Column(JSON), description="Position in document"
    )
    mentions: list[UUID] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="User IDs mentioned in comment",
    )
    resolved: bool = Field(default=False)
    resolved_by: Optional[UUID] = None
    resolved_at: Optional[datetime] = None


class ReportComment(AbstractBaseModel, ReportCommentBase, table=True):
    """
    Modèle de commentaire sur un rapport.
    Supporte les réponses (threading) et les @mentions.
    """

    __tablename__ = "report_comments"

    # Relations
    report: Optional["Report"] = Relationship(back_populates="comments")


class ReportCommentCreate(SQLModel):
    """Schema for creating a report comment."""

    content: str
    parent_id: Optional[UUID] = None
    position: Optional[dict[str, Any]] = None
    mentions: list[UUID] = Field(default_factory=list)


class ReportCommentUpdate(SQLModel):
    """Schema for updating a report comment."""

    content: Optional[str] = None
    resolved: Optional[bool] = None


class ReportCommentPublic(ReportCommentBase):
    """Public report comment model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class ReportCommentsPublic(SQLModel):
    """List of report comments."""

    data: list[ReportCommentPublic]
    count: int


# ============================================================================
# REPORT AUDIT LOG (Journal d'audit)
# ============================================================================


class ReportAuditLogBase(SQLModel):
    """Base model for report audit log."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    action: str = Field(max_length=100)  # created, updated, published, deleted, etc.
    changes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = None


class ReportAuditLog(AbstractBaseModel, ReportAuditLogBase, table=True):
    """
    Modèle de journal d'audit pour les rapports.
    Enregistre toutes les actions effectuées sur les rapports.
    """

    __tablename__ = "report_audit_log"

    # Relations
    report: Optional["Report"] = Relationship(back_populates="audit_logs")


class ReportAuditLogPublic(ReportAuditLogBase):
    """Public report audit log model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class ReportAuditLogsPublic(SQLModel):
    """List of report audit logs."""

    data: list[ReportAuditLogPublic]
    count: int


# ============================================================================
# REPORT EXPORTS (Exports de rapports)
# ============================================================================


class ReportExportBase(SQLModel):
    """Base model for report exports."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    format: str = Field(max_length=50)  # pdf, docx, xlsx
    status: str = Field(
        default="pending", max_length=50
    )  # pending, processing, completed, failed
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    export_options: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    completed_at: Optional[datetime] = None


class ReportExport(AbstractBaseModel, ReportExportBase, table=True):
    """
    Modèle d'export de rapport.
    Gère les exports en PDF, Word, Excel avec queue de traitement.
    """

    __tablename__ = "report_exports"

    # Relations
    report: Optional["Report"] = Relationship(back_populates="exports")


class ReportExportCreate(SQLModel):
    """Schema for creating a report export."""

    format: str = Field(max_length=50)
    export_options: dict[str, Any] = Field(default_factory=dict)


class ReportExportPublic(ReportExportBase):
    """Public report export model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class ReportExportsPublic(SQLModel):
    """List of report exports."""

    data: list[ReportExportPublic]
    count: int


# ============================================================================
# AI SUGGESTIONS (Suggestions IA)
# ============================================================================


class AISuggestionBase(SQLModel):
    """Base model for AI suggestions."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    suggestion_type: str = Field(
        max_length=100
    )  # completion, correction, translation, summary
    original_text: Optional[str] = None
    suggested_text: str
    context: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    applied: bool = Field(default=False)
    applied_at: Optional[datetime] = None


class AISuggestion(AbstractBaseModel, AISuggestionBase, table=True):
    """
    Modèle de suggestion IA pour les rapports.
    Stocke les suggestions générées par l'IA.
    """

    __tablename__ = "ai_suggestions"


class AISuggestionCreate(SQLModel):
    """Schema for creating an AI suggestion."""

    suggestion_type: str = Field(max_length=100)
    original_text: Optional[str] = None
    suggested_text: str
    context: dict[str, Any] = Field(default_factory=dict)


class AISuggestionPublic(AISuggestionBase):
    """Public AI suggestion model."""

    id: UUID
    created_by: UUID
    created_at: datetime


class AISuggestionsPublic(SQLModel):
    """List of AI suggestions."""

    data: list[AISuggestionPublic]
    count: int


# ============================================================================
# OFFLINE SYNC QUEUE (File d'attente de synchronisation offline)
# ============================================================================


class OfflineSyncQueueBase(SQLModel):
    """Base model for offline sync queue."""

    report_id: UUID = Field(foreign_key="reports.id", index=True)
    user_id: UUID = Field(index=True)
    operation: str = Field(
        max_length=50
    )  # create, update, delete, add_comment, etc.
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    client_timestamp: datetime
    synced: bool = Field(default=False)
    synced_at: Optional[datetime] = None
    conflict_detected: bool = Field(default=False)
    conflict_resolution: Optional[str] = Field(
        default=None, max_length=50
    )  # server_wins, client_wins, merged


class OfflineSyncQueue(AbstractBaseModel, OfflineSyncQueueBase, table=True):
    """
    Modèle de file d'attente de synchronisation offline.
    Gère les modifications effectuées hors ligne.
    """

    __tablename__ = "offline_sync_queue"


class OfflineSyncQueuePublic(OfflineSyncQueueBase):
    """Public offline sync queue model."""

    id: UUID
    created_at: datetime


class OfflineSyncQueuesPublic(SQLModel):
    """List of offline sync queue items."""

    data: list[OfflineSyncQueuePublic]
    count: int
