"""Schemas Pydantic du module MTO (DTO Read + corps de requete)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class _Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CatalogItemRead(_Read):
    id: UUID
    code: str
    designation: str
    unite_base: str | None = None
    famille: str | None = None
    diametre: str | None = None
    fabricant: str | None = None
    ref_fabricant: str | None = None


class BatchRead(_Read):
    id: UUID
    project_id: UUID | None = None
    project_name: str | None = None
    filename: str | None = None
    label: str | None = None
    status: str
    created_at: datetime | None = None


class BatchStatsRead(BatchRead):
    nb_lignes: int = 0
    nb_groupes: int = 0
    nb_trouves: int = 0
    couverture: dict[str, int] = {}


class GroupRead(_Read):
    id: UUID
    batch_id: UUID
    mto_key: str
    article_code: str | None = None
    designation_sap: str | None = None
    famille: str | None = None
    diameter: str | None = None
    besoin: float
    unite: str | None = None
    unit_check: bool
    unit_detail: str | None = None
    dispo: float
    emplacements: str | None = None
    statut: str | None = None
    confidence: str | None = None
    found: bool
    verification_status: str
    nb_lignes: int
    children: list = []


class ImportResult(BaseModel):
    imported: int
    kind: str


class ConsolidateResult(BaseModel):
    batch_id: str
    lines: int
    groups: int
    found: int


class CorrectRequest(BaseModel):
    article_code: str
