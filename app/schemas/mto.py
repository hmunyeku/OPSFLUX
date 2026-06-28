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
    role: str = "design"  # design|revise|unique
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


class MtoDiffItem(BaseModel):
    mto_key: str
    designation: str
    diameter: str | None = None
    unite: str | None = None
    besoin_design: float
    besoin_revise: float
    delta: float  # besoin_revise - besoin_design
    change_type: str  # added|removed|changed|unchanged


class MtoDiffResult(BaseModel):
    design_batch_id: UUID
    revise_batch_id: UUID
    summary: dict[str, int]  # {added, removed, changed, unchanged}
    items: list[MtoDiffItem]


class ReconcileItem(BaseModel):
    code_article: str
    designation: str | None = None
    besoin: float
    a_commander: float
    consomme: float
    a_retourner: float  # max(besoin - consomme, 0) — reliquat a retourner a PERENCO


class ReconcileResult(BaseModel):
    batch_id: UUID
    summary: dict  # {lines, total_a_retourner, total_consomme, total_besoin}
    items: list[ReconcileItem]


# --- Analytics d'approvisionnement (P5) — agregats multi-batches/projets ----- #
class AnalyticsTopItem(BaseModel):
    code_article: str
    designation: str | None = None
    total: float


class AnalyticsFreqItem(BaseModel):
    code_article: str
    designation: str | None = None
    count: int


class AnalyticsPair(BaseModel):
    article_a: str
    article_b: str
    count: int


class AnalyticsOverview(BaseModel):
    nb_batches: int
    nb_articles: int
    taux_dispo: float  # 0..1 = groupes "en stock" / total groupes
    total_a_commander: float  # Σ max(besoin - dispo, 0)
    total_consomme: float  # Σ qte MtoConsumption du perimetre


class AnalyticsResult(BaseModel):
    overview: AnalyticsOverview
    top_consommes: list[AnalyticsTopItem]
    top_demandes: list[AnalyticsTopItem]
    top_frequence: list[AnalyticsFreqItem]
    co_occurrence: list[AnalyticsPair]
