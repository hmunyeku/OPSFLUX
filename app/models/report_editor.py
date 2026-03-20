"""Report Editor ORM models — doc types, documents, revisions, templates,
arborescence, distribution lists, signatures, access grants, share links."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── Document Types ─────────────────────────────────────────────────────────

class DocType(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Type de document — définit nomenclature, discipline, workflow par défaut."""
    __tablename__ = "doc_types"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_doc_type_entity_code"),
        CheckConstraint(
            "revision_scheme IN ('alpha','numeric','semver')",
            name="ck_doc_type_revision_scheme",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    nomenclature_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    discipline: Mapped[str | None] = mapped_column(String(50))
    default_template_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id", use_alter=True)
    )
    default_workflow_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    default_language: Mapped[str] = mapped_column(
        String(10), nullable=False, default="fr"
    )
    revision_scheme: Mapped[str] = mapped_column(
        String(20), nullable=False, default="alpha"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )

    # Relationships
    documents: Mapped[list["Document"]] = relationship(
        back_populates="doc_type", cascade="all, delete-orphan"
    )
    templates: Mapped[list["Template"]] = relationship(
        foreign_keys="Template.doc_type_id",
        back_populates="doc_type",
    )
    sequences: Mapped[list["DocumentSequence"]] = relationship(
        back_populates="doc_type", cascade="all, delete-orphan"
    )
    distribution_lists: Mapped[list["DistributionList"]] = relationship(
        back_populates="doc_type_filter_rel",
    )


# ─── Documents ──────────────────────────────────────────────────────────────

class Document(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    """Document — entité centrale du module Report Editor."""
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("entity_id", "number", name="uq_document_entity_number"),
        Index("idx_documents_entity_status_bu", "entity_id", "status", "bu_id"),
        Index("idx_documents_project", "project_id"),
        Index("idx_documents_fts", "search_vector", postgresql_using="gin"),
        CheckConstraint(
            "status IN ('draft','in_review','approved','published','obsolete','archived')",
            name="ck_document_status",
        ),
        CheckConstraint(
            "classification IN ('PUB','INT','REST','CONF')",
            name="ck_document_classification",
        ),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    bu_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    doc_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doc_types.id"), nullable=False
    )
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id")
    )
    arborescence_node_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arborescence_nodes.id")
    )

    number: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="fr")

    current_revision_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id", use_alter=True)
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")

    # Full-text search vector (updated by trigger or on publish)
    search_vector = mapped_column(
        "search_vector",
        type_=Text,  # tsvector — managed at DB level via raw DDL / migration
        nullable=True,
    )

    classification: Mapped[str] = mapped_column(
        String(4), nullable=False, default="INT"
    )

    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    doc_type: Mapped["DocType"] = relationship(back_populates="documents")
    revisions: Mapped[list["Revision"]] = relationship(
        foreign_keys="Revision.document_id",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    current_revision: Mapped["Revision | None"] = relationship(
        foreign_keys=[current_revision_id],
        post_update=True,
    )
    arborescence_node: Mapped["ArborescenceNode | None"] = relationship(
        back_populates="documents"
    )
    signatures: Mapped[list["DocumentSignature"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    access_grants: Mapped[list["DocumentAccessGrant"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )
    share_links: Mapped[list["ShareLink"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


# ─── Revisions ──────────────────────────────────────────────────────────────

class Revision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Révision de document — immutable une fois verrouillée (is_locked)."""
    __tablename__ = "revisions"
    __table_args__ = (
        Index("idx_revisions_document_created", "document_id", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    rev_code: Mapped[str] = mapped_column(String(20), nullable=False)

    # Content — BlockNote JSON (ProseMirror)
    content: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    # Structured form field data — indexable by AI, exploitable by connectors
    form_data: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    # Yjs state for real-time collaboration (compressed binary)
    yjs_state: Mapped[bytes | None] = mapped_column(LargeBinary)

    word_count: Mapped[int | None] = mapped_column(Integer)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    document: Mapped["Document"] = relationship(
        foreign_keys=[document_id],
        back_populates="revisions",
    )
    signatures: Mapped[list["DocumentSignature"]] = relationship(
        back_populates="revision",
    )


# ─── Templates ──────────────────────────────────────────────────────────────

class Template(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Template de document — structure, styles, champs."""
    __tablename__ = "templates"

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    doc_type_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doc_types.id")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    structure: Mapped[dict] = mapped_column(JSONB, nullable=False)
    styles: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    doc_type: Mapped["DocType | None"] = relationship(
        foreign_keys=[doc_type_id],
        back_populates="templates",
    )
    fields: Mapped[list["TemplateField"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


# ─── Template Fields ────────────────────────────────────────────────────────

class TemplateField(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Définition d'un champ dans un template — type, label, validation."""
    __tablename__ = "template_fields"
    __table_args__ = (
        UniqueConstraint(
            "template_id", "section_id", "field_key",
            name="uq_template_field_section_key",
        ),
        CheckConstraint(
            "field_type IN ('text_short','text_long','number_decimal','number_integer',"
            "'date','datetime','select_static','reference','toggle','rich_text')",
            name="ck_template_field_type",
        ),
    )

    template_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    section_id: Mapped[str] = mapped_column(String(100), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    options: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    validation_rules: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    # Relationships
    template: Mapped["Template"] = relationship(back_populates="fields")


# ─── Document Sequences ─────────────────────────────────────────────────────

class DocumentSequence(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Séquence auto-incrémentée pour la nomenclature des documents."""
    __tablename__ = "document_sequences"
    __table_args__ = (
        UniqueConstraint(
            "doc_type_id", "project_id",
            name="uq_doc_sequence_type_project",
        ),
    )

    doc_type_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doc_types.id"), nullable=False
    )
    project_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    current_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    doc_type: Mapped["DocType"] = relationship(back_populates="sequences")


# ─── Arborescence Nodes ─────────────────────────────────────────────────────

class ArborescenceNode(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Noeud d'arborescence projet — structure arborescente des documents."""
    __tablename__ = "arborescence_nodes"
    __table_args__ = (
        Index("idx_arborescence_project", "project_id"),
        Index("idx_arborescence_parent", "parent_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arborescence_nodes.id")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    node_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    nomenclature_override: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    parent: Mapped["ArborescenceNode | None"] = relationship(
        remote_side="ArborescenceNode.id",
        back_populates="children",
    )
    children: Mapped[list["ArborescenceNode"]] = relationship(
        back_populates="parent",
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="arborescence_node",
    )


# ─── Distribution Lists ─────────────────────────────────────────────────────

class DistributionList(UUIDPrimaryKeyMixin, SoftDeleteMixin, Base):
    """Liste de distribution — envoi automatique à la publication."""
    __tablename__ = "distribution_lists"

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type_filter: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doc_types.id")
    )
    recipients: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    doc_type_filter_rel: Mapped["DocType | None"] = relationship(
        back_populates="distribution_lists",
    )


# ─── Document Signatures ────────────────────────────────────────────────────

class DocumentSignature(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Signature électronique horodatée sur un document validé."""
    __tablename__ = "document_signatures"
    __table_args__ = (
        Index("idx_doc_signatures_document", "document_id"),
    )

    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    revision_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
    signer_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    signer_role: Mapped[str] = mapped_column(String(100), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="signatures")
    revision: Mapped["Revision"] = relationship(back_populates="signatures")


# ─── Document Access Grants ─────────────────────────────────────────────────

class DocumentAccessGrant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Autorisation d'accès nominative pour documents REST/CONF."""
    __tablename__ = "document_access_grants"
    __table_args__ = (
        UniqueConstraint(
            "document_id", "user_id",
            name="uq_doc_access_grant_document_user",
        ),
    )

    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    granted_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="access_grants")


# ─── Share Links ────────────────────────────────────────────────────────────

class ShareLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Lien de partage temporaire — accès lecture seule sans compte OpsFlux."""
    __tablename__ = "share_links"
    __table_args__ = (
        UniqueConstraint("token", name="uq_share_link_token"),
        Index("idx_share_links_token", "token"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False
    )
    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    otp_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_accesses: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    document: Mapped["Document"] = relationship(back_populates="share_links")
