"""MTO module ORM models — catalogue/stock SAP, besoins MTO, consolidation, validation.

Reutilise les entites Core : Project (rattachement affaire), Entity (scope multi-tenant),
User (validation). On ne cree QUE le specifique MTO ; le rapprochement s'appuie sur le
moteur app/modules/mto/engine/ (normalize, parsing, units, matching, consolidate).
"""

from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    AuditUserMixin,
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VerifiableMixin,
)


class SapCatalogItem(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Article du catalogue SAP (referentiel type ZMM60, ~86k lignes)."""

    __tablename__ = "mto_sap_catalog_items"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_mto_catalog_entity_code"),
        Index("idx_mto_catalog_entity", "entity_id"),
        Index("idx_mto_catalog_famille", "famille"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    designation: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    designation_long: Mapped[str | None] = mapped_column(Text)
    unite_base: Mapped[str | None] = mapped_column(String(20))
    groupe: Mapped[str | None] = mapped_column(String(100))
    hier_pdt_desc: Mapped[str | None] = mapped_column(String(200))
    fabricant: Mapped[str | None] = mapped_column(String(200))
    ref_fabricant: Mapped[str | None] = mapped_column(String(200))
    subst_ca: Mapped[str | None] = mapped_column(String(50))
    # attributs derives (caches) pour le matching
    famille: Mapped[str | None] = mapped_column(String(30))
    diametre: Mapped[str | None] = mapped_column(String(50))


class SapInventory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Stock SAP par article / magasin. Export mensuel = etat complet (idempotent par label)."""

    __tablename__ = "mto_sap_inventory"
    __table_args__ = (
        Index("idx_mto_inv_entity_code", "entity_id", "code"),
        Index("idx_mto_inv_label", "label"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    sap_item_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mto_sap_catalog_items.id", ondelete="SET NULL")
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False, default="")  # periode / date d'import
    dispo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cde: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    transit: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cq: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    bloque: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    magasin: Mapped[str | None] = mapped_column(String(50))
    emplacement: Mapped[str | None] = mapped_column(String(50))


class SapItemAlias(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Synonyme appris (FR<->EN) ou alias utilisateur -> terme catalogue, pour le matching."""

    __tablename__ = "mto_sap_item_aliases"
    __table_args__ = (
        UniqueConstraint("entity_id", "source_term", name="uq_mto_alias_entity_source"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    source_term: Mapped[str] = mapped_column(String(200), nullable=False)
    target_term: Mapped[str] = mapped_column(String(200), nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class MtoImportBatch(UUIDPrimaryKeyMixin, TimestampMixin, AuditUserMixin, SoftDeleteMixin, Base):
    """Un import de liste MTO, rattache a un projet (affaire) Core."""

    __tablename__ = "mto_import_batches"
    __table_args__ = (
        Index("idx_mto_batch_entity", "entity_id"),
        Index("idx_mto_batch_project", "project_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    project_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    filename: Mapped[str | None] = mapped_column(String(300))
    label: Mapped[str | None] = mapped_column(String(100))  # revision / lot
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="design")  # design|revise|unique
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="imported")  # imported|consolidated|validated


class MtoRequirement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Ligne de besoin MTO brute (telle qu'importee), avant consolidation."""

    __tablename__ = "mto_requirements"
    __table_args__ = (
        Index("idx_mto_req_batch", "batch_id"),
        Index("idx_mto_req_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    batch_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mto_import_batches.id", ondelete="CASCADE"), nullable=False
    )
    row: Mapped[int | None] = mapped_column(Integer)  # n° de ligne fichier (tracabilite)
    line_num: Mapped[str | None] = mapped_column(String(50))
    mark: Mapped[str | None] = mapped_column(String(100))
    tag: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    diameter: Mapped[str | None] = mapped_column(String(50))
    spec: Mapped[str | None] = mapped_column(String(100))
    code_article: Mapped[str | None] = mapped_column(String(50))
    total_qty: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    length: Mapped[float] = mapped_column(Float, default=0, nullable=False)


class MtoConsolidatedGroup(UUIDPrimaryKeyMixin, TimestampMixin, VerifiableMixin, Base):
    """Groupe consolide (items de meme nature sommes par unite) rapproche d'un article SAP.

    VerifiableMixin : verification_status pending/verified/rejected = validation du
    rapprochement par l'utilisateur (cf MtoValidationRecord pour l'apprentissage).
    """

    __tablename__ = "mto_consolidated_groups"
    __table_args__ = (
        Index("idx_mto_grp_batch", "batch_id"),
        Index("idx_mto_grp_entity", "entity_id"),
        Index("idx_mto_grp_statut", "statut"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    batch_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mto_import_batches.id", ondelete="CASCADE"), nullable=False
    )
    mto_key: Mapped[str] = mapped_column(String(500), nullable=False, default="")  # signature item (desc norm + Ø)
    # article SAP resolu
    sap_item_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mto_sap_catalog_items.id", ondelete="SET NULL")
    )
    article_code: Mapped[str | None] = mapped_column(String(50))
    designation_sap: Mapped[str | None] = mapped_column(String(500))
    source: Mapped[str | None] = mapped_column(String(20))  # code|memo|appris|match|none
    score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    confidence: Mapped[str | None] = mapped_column(String(20))
    found: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # attributs de l'item
    famille: Mapped[str | None] = mapped_column(String(30))
    diameter: Mapped[str | None] = mapped_column(String(50))
    # besoin consolide (somme puis converti vers l'unite SAP)
    sum_qty: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    sum_length: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    besoin: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    unite: Mapped[str | None] = mapped_column(String(20))
    unit_check: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    unit_detail: Mapped[str | None] = mapped_column(String(200))
    # stock de l'article resolu
    dispo: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cde: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    transit: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cq: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    bloque: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    emplacements: Mapped[str | None] = mapped_column(String(200))
    statut: Mapped[str | None] = mapped_column(String(20))  # en stock|partiel|a commander
    nb_lignes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    children: Mapped[list] = mapped_column(JSONB, default=list)  # lignes MTO d'origine (nested rows)


class MtoValidationRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Memoire de validation : signature MTO (desc normalisee + Ø) -> article SAP valide.

    Reappliquee aux imports suivants (apprentissage cross-import, partage par entite).
    """

    __tablename__ = "mto_validation_records"
    __table_args__ = (
        UniqueConstraint("entity_id", "mto_key", name="uq_mto_valrec_entity_key"),
        Index("idx_mto_valrec_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    mto_key: Mapped[str] = mapped_column(String(500), nullable=False)
    article_code: Mapped[str] = mapped_column(String(50), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="user")  # user|memo|appris
    validated_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
