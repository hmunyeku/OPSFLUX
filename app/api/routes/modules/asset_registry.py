"""Asset Registry module routes — O&G hierarchy CRUD.

Hierarchy: Field -> Site -> Installation -> Equipment, plus Pipelines.
"""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import select, func as sqla_func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import (
    OilField,
    FieldLicense,
    OilSite,
    Installation,
    InstallationDeck,
    RegistryEquipment,
    RegistryPipeline,
    PipelineWaypoint,
    # Specialized equipment sub-tables
    Crane, Separator, Pump, GasCompressor, DieselGenerator, StorageTank,
    HeatExchanger, PressureVessel, Instrument, GasTurbine, LiftingAccessory,
    ProcessColumn, PressureSafetyValve, RuptureDisk, FiredHeater, FanBlower,
    SteamTurbine, Turboexpander, AirCompressorPackage, NitrogenUnit,
    FiscalMeteringSkid, ChemicalInjectionSkid, GasDehydrationUnit,
    ProducedWaterTreatmentUnit, FireGasSystem, HPUUnit, HVACUnit, UPSSystem,
    TelecomSystem, Switchgear, MotorControlCenter, PipingLine, Manifold,
    PigStation, Wellhead, DownholeCompletion, FlareSystem, ESDSystem,
    FireWaterSystem, TransformerEquipment, SubseaChristmasTree,
    SubseaUmbilical, SubseaPlemPlet, Riser, SubseaControlSystem,
    MarineLoadingArm, MooringSystem, SurvivalCraft,
    CathodicProtectionSystem, Building, StructuralElement,
    PotableWaterSystem, SewageTreatmentSystem, CoolingWaterSystem,
    DrainageSystem, ProcessFilter,
    # Sub-model children
    CraneConfiguration, CraneHookBlock, CraneReevingGuide,
    CraneLoadChartPoint, CraneLiftZone,
    SeparatorNozzle, SeparatorProcessCase,
    PumpCurvePoint, ColumnSection,
    # Installation 1:1 sub-details
    InstallationOffshoreDetails, InstallationOnshoreDetails,
    InstallationWellPad, InstallationTerminal, InstallationTankFarm,
    InstallationJacketPlatform, InstallationBuoy,
    # Audit trail
    AssetChangeLog,
)
from app.models.common import User
from app.schemas.asset_registry import (
    OilFieldCreate, OilFieldUpdate, OilFieldRead,
    FieldLicenseCreate, FieldLicenseUpdate, FieldLicenseRead,
    OilSiteCreate, OilSiteUpdate, OilSiteRead,
    InstallationCreate, InstallationUpdate, InstallationRead,
    InstallationDeckCreate, InstallationDeckUpdate, InstallationDeckRead,
    EquipmentCreate, EquipmentUpdate, EquipmentRead,
    PipelineCreate, PipelineUpdate, PipelineRead,
    # Sub-model schemas
    CraneConfigurationCreate, CraneConfigurationUpdate, CraneConfigurationRead,
    CraneLoadChartPointCreate, CraneLoadChartPointUpdate, CraneLoadChartPointRead,
    CraneLiftZoneCreate, CraneLiftZoneUpdate, CraneLiftZoneRead,
    CraneHookBlockCreate, CraneHookBlockUpdate, CraneHookBlockRead,
    CraneReevingGuideCreate, CraneReevingGuideUpdate, CraneReevingGuideRead,
    SeparatorNozzleCreate, SeparatorNozzleUpdate, SeparatorNozzleRead,
    SeparatorProcessCaseCreate, SeparatorProcessCaseUpdate, SeparatorProcessCaseRead,
    PumpCurvePointCreate, PumpCurvePointUpdate, PumpCurvePointRead,
    ColumnSectionCreate, ColumnSectionUpdate, ColumnSectionRead,
    AssetChangeLogRead,
)
from app.core.errors import StructuredHTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/asset-registry", tags=["asset-registry"], dependencies=[require_module_enabled("asset_registry")])

# ── Equipment class → specialized model mapping ──────────────
EQUIPMENT_CLASS_MODEL_MAP: dict[str, type] = {
    "CRANE": Crane,
    "SEPARATOR": Separator,
    "PUMP": Pump,
    "GAS_COMPRESSOR": GasCompressor,
    "DIESEL_GENERATOR": DieselGenerator,
    "STORAGE_TANK": StorageTank,
    "HEAT_EXCHANGER": HeatExchanger,
    "PRESSURE_VESSEL": PressureVessel,
    "INSTRUMENT": Instrument,
    "GAS_TURBINE": GasTurbine,
    "LIFTING_ACCESSORY": LiftingAccessory,
    "PROCESS_COLUMN": ProcessColumn,
    "PSV": PressureSafetyValve,
    "RUPTURE_DISK": RuptureDisk,
    "FIRED_HEATER": FiredHeater,
    "FAN_BLOWER": FanBlower,
    "STEAM_TURBINE": SteamTurbine,
    "TURBOEXPANDER": Turboexpander,
    "AIR_COMPRESSOR": AirCompressorPackage,
    "NITROGEN_UNIT": NitrogenUnit,
    "METERING_SKID": FiscalMeteringSkid,
    "CHEMICAL_INJECTION": ChemicalInjectionSkid,
    "GAS_DEHYDRATION": GasDehydrationUnit,
    "WATER_TREATMENT": ProducedWaterTreatmentUnit,
    "FIRE_GAS_SYSTEM": FireGasSystem,
    "HPU": HPUUnit,
    "HVAC": HVACUnit,
    "UPS": UPSSystem,
    "TELECOM": TelecomSystem,
    "SWITCHGEAR": Switchgear,
    "MCC": MotorControlCenter,
    "PIPING_LINE": PipingLine,
    "MANIFOLD": Manifold,
    "PIG_STATION": PigStation,
    "WELLHEAD": Wellhead,
    "DOWNHOLE_COMPLETION": DownholeCompletion,
    "FLARE_SYSTEM": FlareSystem,
    "ESD_SYSTEM": ESDSystem,
    "FIRE_WATER_SYSTEM": FireWaterSystem,
    "TRANSFORMER": TransformerEquipment,
    "SUBSEA_XT": SubseaChristmasTree,
    "SUBSEA_UMBILICAL": SubseaUmbilical,
    "SUBSEA_PLEM_PLET": SubseaPlemPlet,
    "RISER": Riser,
    "SUBSEA_CONTROL_SYSTEM": SubseaControlSystem,
    "MARINE_LOADING_ARM": MarineLoadingArm,
    "MOORING_SYSTEM": MooringSystem,
    "SURVIVAL_CRAFT": SurvivalCraft,
    "CATHODIC_PROTECTION": CathodicProtectionSystem,
    "BUILDING": Building,
    "STRUCTURAL_ELEMENT": StructuralElement,
    "POTABLE_WATER_SYSTEM": PotableWaterSystem,
    "SEWAGE_SYSTEM": SewageTreatmentSystem,
    "COOLING_WATER_SYSTEM": CoolingWaterSystem,
    "DRAINAGE_SYSTEM": DrainageSystem,
    "FILTER": ProcessFilter,
}


# ── Helpers ───────────────────────────────────────────────────────────────


async def _get_or_404(db: AsyncSession, model, obj_id: UUID, entity_id: UUID, label: str = "Resource"):
    """Fetch a single entity-scoped record or raise 404."""
    result = await db.execute(
        select(model).where(
            model.id == obj_id,
            model.entity_id == entity_id,
            model.archived == False,
        )
    )
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="NOT_FOUND",
            message="{label} not found",
            params={
                "label": label,
            },
        )
    return obj


# ── Audit trail helper ────────────────────────────────────────────────────

def _stringify(val) -> str | None:
    """Convert any value to a string suitable for the change log, or None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, Decimal):
        return str(val)
    return str(val)


async def _log_ar_changes(
    db: AsyncSession,
    entity_type: str,
    entity_id: UUID,
    entity_code: str,
    old_data: dict,
    new_data: dict,
    user_id: UUID,
    tenant_id: UUID,
    change_type: str = "update",
):
    """Compare old_data vs new_data dicts and insert AssetChangeLog rows for each diff."""
    for field_name, new_val in new_data.items():
        old_val = old_data.get(field_name)
        if _stringify(old_val) != _stringify(new_val):
            db.add(AssetChangeLog(
                tenant_id=tenant_id,
                entity_type=entity_type,
                entity_id=entity_id,
                entity_code=entity_code,
                field_name=field_name,
                old_value=_stringify(old_val),
                new_value=_stringify(new_val),
                change_type=change_type,
                changed_by=user_id,
            ))


def _snapshot_fields(obj, field_names: list[str]) -> dict:
    """Take a snapshot of the given fields from a model instance."""
    return {f: getattr(obj, f, None) for f in field_names}


# ════════════════════════════════════════════════════════════════════════════
# CHANGE LOG ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/history/{entity_type}/{entity_id}", dependencies=[require_permission("asset.read")])
async def get_entity_change_log(
    entity_type: str,
    entity_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    entity_id_tenant: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated change history for a specific AR entity."""
    _user_name = sqla_func.concat(User.first_name, ' ', User.last_name).label("changed_by_name")
    query = (
        select(
            AssetChangeLog,
            _user_name,
        )
        .outerjoin(User, User.id == AssetChangeLog.changed_by)
        .where(
            AssetChangeLog.tenant_id == entity_id_tenant,
            AssetChangeLog.entity_type == entity_type,
            AssetChangeLog.entity_id == entity_id,
        )
        .order_by(AssetChangeLog.changed_at.desc())
    )
    # count
    count_q = select(sqla_func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    pages = (total + page_size - 1) // page_size if total > 0 else 0
    # fetch page
    rows = (await db.execute(query.offset((page - 1) * page_size).limit(page_size))).all()
    items = []
    for log_obj, name in rows:
        d = {
            "id": log_obj.id,
            "tenant_id": log_obj.tenant_id,
            "entity_type": log_obj.entity_type,
            "entity_id": log_obj.entity_id,
            "entity_code": log_obj.entity_code,
            "field_name": log_obj.field_name,
            "old_value": log_obj.old_value,
            "new_value": log_obj.new_value,
            "change_type": log_obj.change_type,
            "changed_by": log_obj.changed_by,
            "changed_at": log_obj.changed_at.isoformat() if log_obj.changed_at else None,
            "changed_by_name": name,
        }
        items.append(d)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.get("/history/recent", dependencies=[require_permission("asset.read")])
async def get_recent_changes(
    limit: int = Query(10, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the N most recent changes across all AR entities for this tenant."""
    _user_name = sqla_func.concat(User.first_name, ' ', User.last_name).label("changed_by_name")
    query = (
        select(
            AssetChangeLog,
            _user_name,
        )
        .outerjoin(User, User.id == AssetChangeLog.changed_by)
        .where(AssetChangeLog.tenant_id == entity_id)
        .order_by(AssetChangeLog.changed_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(query)).all()
    items = []
    for log_obj, name in rows:
        d = {
            "id": log_obj.id,
            "tenant_id": log_obj.tenant_id,
            "entity_type": log_obj.entity_type,
            "entity_id": log_obj.entity_id,
            "entity_code": log_obj.entity_code,
            "field_name": log_obj.field_name,
            "old_value": log_obj.old_value,
            "new_value": log_obj.new_value,
            "change_type": log_obj.change_type,
            "changed_by": log_obj.changed_by,
            "changed_at": log_obj.changed_at.isoformat() if log_obj.changed_at else None,
            "changed_by_name": name,
        }
        items.append(d)
    return items


# ════════════════════════════════════════════════════════════════════════════
# FIELDS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/fields", dependencies=[require_permission("asset.read")])
async def list_fields(
    search: str | None = None,
    status: str | None = None,
    country: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(OilField).where(
        OilField.entity_id == entity_id,
        OilField.archived == False,
    )
    if search:
        query = query.where(
            or_(OilField.name.ilike(f"%{search}%"), OilField.code.ilike(f"%{search}%"))
        )
    if status:
        query = query.where(OilField.status == status)
    if country:
        query = query.where(OilField.country == country)
    query = query.order_by(OilField.code)
    return await paginate(db, query, pagination)


@router.get("/fields/{field_id}", response_model=OilFieldRead, dependencies=[require_permission("asset.read")])
async def get_field(
    field_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, OilField, field_id, entity_id, "Field")


@router.post("/fields", response_model=OilFieldRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_field(
    body: OilFieldCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = OilField(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/fields/{field_id}", response_model=OilFieldRead, dependencies=[require_permission("asset.update")])
async def update_field(
    field_id: UUID,
    body: OilFieldUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilField, field_id, entity_id, "Field")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_field", field_id, obj.code, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/fields/{field_id}", dependencies=[require_permission("asset.delete")])
async def delete_field(
    field_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilField, field_id, entity_id, "Field")
    # Block if field has active child sites
    child_count = (await db.execute(
        select(sqla_func.count()).select_from(OilSite).where(OilSite.field_id == field_id, OilSite.archived == False)
    )).scalar() or 0
    if child_count > 0:
        raise StructuredHTTPException(
            409,
            code="CANNOT_ARCHIVE_FIELD_ACTIVE_SITE_S",
            message="Cannot archive field: {child_count} active site(s) reference it. Remove or reassign them first.",
            params={
                "child_count": child_count,
            },
        )
    obj.archived = True
    await _log_ar_changes(db, "ar_field", field_id, obj.code, {"archived": False}, {"archived": True}, current_user.id, entity_id, "archive")
    await db.commit()
    return {"detail": "Field archived"}


# ════════════════════════════════════════════════════════════════════════════
# FIELD LICENSES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/fields/{field_id}/licenses", response_model=list[FieldLicenseRead], dependencies=[require_permission("asset.read")])
async def list_field_licenses(
    field_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, OilField, field_id, entity_id, "Field")
    result = await db.execute(
        select(FieldLicense).where(FieldLicense.field_id == field_id).order_by(FieldLicense.created_at.desc())
    )
    return result.scalars().all()


@router.post("/fields/{field_id}/licenses", response_model=FieldLicenseRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_field_license(
    field_id: UUID,
    body: FieldLicenseCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, OilField, field_id, entity_id, "Field")
    obj = FieldLicense(field_id=field_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/fields/{field_id}/licenses/{license_id}", response_model=FieldLicenseRead, dependencies=[require_permission("asset.update")])
async def update_field_license(
    field_id: UUID,
    license_id: UUID,
    body: FieldLicenseUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    field_obj = await _get_or_404(db, OilField, field_id, entity_id, "Field")
    result = await db.execute(
        select(FieldLicense).where(FieldLicense.id == license_id, FieldLicense.field_id == field_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LICENSE_NOT_FOUND",
            message="License not found",
        )
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_field", field_id, field_obj.code, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/fields/{field_id}/licenses/{license_id}", dependencies=[require_permission("asset.delete")])
async def delete_field_license(
    field_id: UUID,
    license_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, OilField, field_id, entity_id, "Field")
    result = await db.execute(
        select(FieldLicense).where(FieldLicense.id == license_id, FieldLicense.field_id == field_id)
    )
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LICENSE_NOT_FOUND",
            message="License not found",
        )
    await db.delete(obj)
    await db.commit()
    return {"detail": "License deleted"}


# ════════════════════════════════════════════════════════════════════════════
# SITES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/sites", dependencies=[require_permission("asset.read")])
async def list_sites(
    field_id: UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    site_type: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(OilSite).where(
        OilSite.entity_id == entity_id,
        OilSite.archived == False,
    )
    if field_id:
        query = query.where(OilSite.field_id == field_id)
    if search:
        query = query.where(
            or_(OilSite.name.ilike(f"%{search}%"), OilSite.code.ilike(f"%{search}%"))
        )
    if status:
        query = query.where(OilSite.status == status)
    if site_type:
        query = query.where(OilSite.site_type == site_type)
    query = query.order_by(OilSite.code)
    return await paginate(db, query, pagination)


@router.get("/sites/{site_id}", response_model=OilSiteRead, dependencies=[require_permission("asset.read")])
async def get_site(
    site_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, OilSite, site_id, entity_id, "Site")


@router.post("/sites", response_model=OilSiteRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_site(
    body: OilSiteCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate parent field exists and belongs to entity
    parent = await _get_or_404(db, OilField, body.field_id, entity_id, "Parent field")
    obj = OilSite(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/sites/{site_id}", response_model=OilSiteRead, dependencies=[require_permission("asset.update")])
async def update_site(
    site_id: UUID,
    body: OilSiteUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilSite, site_id, entity_id, "Site")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_site", site_id, obj.code, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/sites/{site_id}", dependencies=[require_permission("asset.delete")])
async def delete_site(
    site_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilSite, site_id, entity_id, "Site")
    # Block if site has active child installations
    child_count = (await db.execute(
        select(sqla_func.count()).select_from(Installation).where(Installation.site_id == site_id, Installation.archived == False)
    )).scalar() or 0
    if child_count > 0:
        raise StructuredHTTPException(
            409,
            code="CANNOT_ARCHIVE_SITE_ACTIVE_INSTALLATION_S",
            message="Cannot archive site: {child_count} active installation(s) reference it. Remove or reassign them first.",
            params={
                "child_count": child_count,
            },
        )
    obj.archived = True
    await _log_ar_changes(db, "ar_site", site_id, obj.code, {"archived": False}, {"archived": True}, current_user.id, entity_id, "archive")
    await db.commit()
    return {"detail": "Site archived"}


# ════════════════════════════════════════════════════════════════════════════
# INSTALLATIONS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/installations", dependencies=[require_permission("asset.read")])
async def list_installations(
    site_id: UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    installation_type: str | None = None,
    environment: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Installation).where(
        Installation.entity_id == entity_id,
        Installation.archived == False,
    )
    if site_id:
        query = query.where(Installation.site_id == site_id)
    if search:
        query = query.where(
            or_(Installation.name.ilike(f"%{search}%"), Installation.code.ilike(f"%{search}%"))
        )
    if status:
        query = query.where(Installation.status == status)
    if installation_type:
        query = query.where(Installation.installation_type == installation_type)
    if environment:
        query = query.where(Installation.environment == environment)
    query = query.order_by(Installation.code)
    return await paginate(db, query, pagination)


# ── Installation type → specialized model mapping ────────────
INSTALLATION_TYPE_MODEL_MAP: dict[str, type] = {
    "WELL_PAD": InstallationWellPad,
    "TERMINAL": InstallationTerminal,
    "TANK_FARM": InstallationTankFarm,
    "JACKET_PLATFORM": InstallationJacketPlatform,
    "FIXED_PLATFORM": InstallationJacketPlatform,
    "BUOY": InstallationBuoy,
    "SPM": InstallationBuoy,
    "CALM": InstallationBuoy,
}


@router.get("/installations/{installation_id}", response_model=InstallationRead, dependencies=[require_permission("asset.read")])
async def get_installation(
    installation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")

    # Load 1:1 offshore details
    offshore_details = None
    result = await db.execute(select(InstallationOffshoreDetails).where(InstallationOffshoreDetails.id == installation_id))
    off_obj = result.scalars().first()
    if off_obj:
        from sqlalchemy import inspect as sa_inspect
        mapper = sa_inspect(InstallationOffshoreDetails)
        offshore_details = {col.key: (float(v) if isinstance(v := getattr(off_obj, col.key), Decimal) else v) for col in mapper.columns if col.key != "id"}

    # Load 1:1 onshore details
    onshore_details = None
    result = await db.execute(select(InstallationOnshoreDetails).where(InstallationOnshoreDetails.id == installation_id))
    on_obj = result.scalars().first()
    if on_obj:
        from sqlalchemy import inspect as sa_inspect
        mapper = sa_inspect(InstallationOnshoreDetails)
        onshore_details = {col.key: (float(v) if isinstance(v := getattr(on_obj, col.key), Decimal) else v) for col in mapper.columns if col.key != "id"}

    # Load 1:1 type-specific details
    type_details = None
    type_model = INSTALLATION_TYPE_MODEL_MAP.get(obj.installation_type)
    if type_model:
        result = await db.execute(select(type_model).where(type_model.id == installation_id))
        type_obj = result.scalars().first()
        if type_obj:
            from sqlalchemy import inspect as sa_inspect
            mapper = sa_inspect(type_model)
            type_details = {col.key: (float(v) if isinstance(v := getattr(type_obj, col.key), Decimal) else v) for col in mapper.columns if col.key != "id"}

    resp = InstallationRead.model_validate(obj)
    resp.inst_offshore_details = offshore_details
    resp.inst_onshore_details = onshore_details
    resp.inst_type_details = type_details
    return resp


@router.post("/installations", response_model=InstallationRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_installation(
    body: InstallationCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate parent site exists and belongs to entity
    parent = await _get_or_404(db, OilSite, body.site_id, entity_id, "Parent site")
    obj = Installation(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/installations/{installation_id}", response_model=InstallationRead, dependencies=[require_permission("asset.update")])
async def update_installation(
    installation_id: UUID,
    body: InstallationUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_installation", installation_id, obj.code, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/installations/{installation_id}", dependencies=[require_permission("asset.delete")])
async def delete_installation(
    installation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    # Block if installation has active child equipment
    child_count = (await db.execute(
        select(sqla_func.count()).select_from(RegistryEquipment).where(
            RegistryEquipment.installation_id == installation_id, RegistryEquipment.archived == False
        )
    )).scalar() or 0
    if child_count > 0:
        raise StructuredHTTPException(
            409,
            code="CANNOT_ARCHIVE_INSTALLATION_ACTIVE_EQUIPMENT_S",
            message="Cannot archive installation: {child_count} active equipment(s) reference it. Remove or reassign them first.",
            params={
                "child_count": child_count,
            },
        )
    obj.archived = True
    await _log_ar_changes(db, "ar_installation", installation_id, obj.code, {"archived": False}, {"archived": True}, current_user.id, entity_id, "archive")
    await db.commit()
    return {"detail": "Installation archived"}


# ── Installation 1:1 sub-details (upsert) ─────────────────────────────────

async def _upsert_1to1_detail(db: AsyncSession, model, installation_id: UUID, data: dict):
    """Create or update a 1:1 sub-detail record for an installation."""
    result = await db.execute(select(model).where(model.id == installation_id))
    obj = result.scalars().first()
    if obj:
        for key, value in data.items():
            setattr(obj, key, value)
    else:
        obj = model(id=installation_id, **data)
        db.add(obj)
    await db.commit()
    await db.refresh(obj)
    from sqlalchemy import inspect as sa_inspect
    mapper = sa_inspect(model)
    return {col.key: (float(v) if isinstance(v := getattr(obj, col.key), Decimal) else v) for col in mapper.columns if col.key != "id"}


@router.put("/installations/{installation_id}/offshore-details", dependencies=[require_permission("asset.update")])
async def upsert_offshore_details(
    installation_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    return await _upsert_1to1_detail(db, InstallationOffshoreDetails, installation_id, body)


@router.put("/installations/{installation_id}/onshore-details", dependencies=[require_permission("asset.update")])
async def upsert_onshore_details(
    installation_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    return await _upsert_1to1_detail(db, InstallationOnshoreDetails, installation_id, body)


@router.put("/installations/{installation_id}/type-details", dependencies=[require_permission("asset.update")])
async def upsert_type_details(
    installation_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inst = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    type_model = INSTALLATION_TYPE_MODEL_MAP.get(inst.installation_type)
    if not type_model:
        raise StructuredHTTPException(
            400,
            code="NO_TYPE_DETAILS_INSTALLATION_TYPE",
            message="No type details for installation_type '{installation_type}'",
            params={
                "installation_type": inst.installation_type,
            },
        )
    return await _upsert_1to1_detail(db, type_model, installation_id, body)


# ── Installation Decks ────────────────────────────────────────────────────


@router.get("/installations/{installation_id}/decks", response_model=list[InstallationDeckRead], dependencies=[require_permission("asset.read")])
async def list_installation_decks(
    installation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate installation belongs to entity
    await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    result = await db.execute(
        select(InstallationDeck)
        .where(InstallationDeck.installation_id == installation_id)
        .order_by(InstallationDeck.deck_order)
    )
    return result.scalars().all()


@router.post("/installations/{installation_id}/decks", response_model=InstallationDeckRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_installation_deck(
    installation_id: UUID,
    body: InstallationDeckCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    obj = InstallationDeck(installation_id=installation_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/installations/{installation_id}/decks/{deck_id}", response_model=InstallationDeckRead, dependencies=[require_permission("asset.update")])
async def update_installation_deck(
    installation_id: UUID,
    deck_id: UUID,
    body: InstallationDeckUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inst = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    result = await db.execute(
        select(InstallationDeck).where(
            InstallationDeck.id == deck_id,
            InstallationDeck.installation_id == installation_id,
        )
    )
    deck = result.scalars().first()
    if not deck:
        raise StructuredHTTPException(
            404,
            code="DECK_NOT_FOUND",
            message="Deck not found",
        )
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(deck, list(updates.keys()))
    for key, value in updates.items():
        setattr(deck, key, value)
    await _log_ar_changes(db, "ar_installation", installation_id, inst.code, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(deck)
    return deck


@router.delete("/installations/{installation_id}/decks/{deck_id}", dependencies=[require_permission("asset.delete")])
async def delete_installation_deck(
    installation_id: UUID,
    deck_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    result = await db.execute(
        select(InstallationDeck).where(
            InstallationDeck.id == deck_id,
            InstallationDeck.installation_id == installation_id,
        )
    )
    deck = result.scalars().first()
    if not deck:
        raise StructuredHTTPException(
            404,
            code="DECK_NOT_FOUND",
            message="Deck not found",
        )
    await db.delete(deck)
    await db.commit()
    return {"detail": "Deck deleted"}


# ════════════════════════════════════════════════════════════════════════════
# EQUIPMENT
# ════════════════════════════════════════════════════════════════════════════


@router.get("/equipment", dependencies=[require_permission("asset.read")])
async def list_equipment(
    installation_id: UUID | None = None,
    equipment_class: str | None = None,
    search: str | None = None,
    status: str | None = None,
    criticality: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(RegistryEquipment).where(
        RegistryEquipment.entity_id == entity_id,
        RegistryEquipment.archived == False,
    )
    if installation_id:
        query = query.where(RegistryEquipment.installation_id == installation_id)
    if equipment_class:
        query = query.where(RegistryEquipment.equipment_class == equipment_class)
    if search:
        query = query.where(
            or_(
                RegistryEquipment.name.ilike(f"%{search}%"),
                RegistryEquipment.tag_number.ilike(f"%{search}%"),
            )
        )
    if status:
        query = query.where(RegistryEquipment.status == status)
    if criticality:
        query = query.where(RegistryEquipment.criticality == criticality)
    query = query.order_by(RegistryEquipment.tag_number)
    return await paginate(db, query, pagination)


@router.get("/equipment/{equipment_id}", response_model=EquipmentRead, dependencies=[require_permission("asset.read")])
async def get_equipment(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")

    # Load specialized sub-table data if available
    # Wrapped in try/except so any sub-table issue (missing row, serialization,
    # schema drift) doesn't 500 the whole equipment GET — the base equipment
    # fields are always returned, specialized_data falls back to None.
    specialized_data = None
    try:
        spec_model = EQUIPMENT_CLASS_MODEL_MAP.get(obj.equipment_class) if obj.equipment_class else None
        if spec_model is not None:
            result = await db.execute(select(spec_model).where(spec_model.id == equipment_id))
            spec_obj = result.scalars().first()
            if spec_obj:
                from sqlalchemy import inspect as sa_inspect
                mapper = sa_inspect(spec_model)
                specialized_data = {}
                for col in mapper.columns:
                    if col.key == "id":
                        continue
                    val = getattr(spec_obj, col.key, None)
                    # Convert non-JSON-serializable types
                    if isinstance(val, Decimal):
                        val = float(val)
                    elif isinstance(val, (datetime, date)):
                        val = val.isoformat()
                    elif val is not None and not isinstance(val, (str, int, float, bool, list, dict)):
                        # Unknown type — stringify as last resort
                        val = str(val)
                    specialized_data[col.key] = val
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Failed to load specialized_data for equipment %s (class=%s): %s",
            equipment_id, obj.equipment_class, exc,
        )
        specialized_data = None

    # Attach specialized_data to the response
    resp = EquipmentRead.model_validate(obj)
    resp.specialized_data = specialized_data
    return resp


@router.post("/equipment", response_model=EquipmentRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_equipment(
    body: EquipmentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate parent installation if provided
    if body.installation_id:
        await _get_or_404(db, Installation, body.installation_id, entity_id, "Parent installation")
    obj = RegistryEquipment(
        entity_id=entity_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}", response_model=EquipmentRead, dependencies=[require_permission("asset.update")])
async def update_equipment(
    equipment_id: UUID,
    body: EquipmentUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, obj.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}", dependencies=[require_permission("asset.delete")])
async def delete_equipment(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")
    obj.archived = True
    await _log_ar_changes(db, "ar_equipment", equipment_id, obj.tag_number, {"archived": False}, {"archived": True}, current_user.id, entity_id, "archive")
    await db.commit()
    return {"detail": "Equipment archived"}


# ════════════════════════════════════════════════════════════════════════════
# PIPELINES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/pipelines", dependencies=[require_permission("asset.read")])
async def list_pipelines(
    search: str | None = None,
    status: str | None = None,
    service: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(RegistryPipeline).where(
        RegistryPipeline.entity_id == entity_id,
        RegistryPipeline.archived == False,
    )
    if search:
        query = query.where(
            or_(
                RegistryPipeline.name.ilike(f"%{search}%"),
                RegistryPipeline.pipeline_id.ilike(f"%{search}%"),
            )
        )
    if status:
        query = query.where(RegistryPipeline.status == status)
    if service:
        query = query.where(RegistryPipeline.service == service)
    query = query.order_by(RegistryPipeline.pipeline_id)
    return await paginate(db, query, pagination)


@router.get("/pipelines/{pipeline_id}", dependencies=[require_permission("asset.read")])
async def get_pipeline(
    pipeline_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RegistryPipeline)
        .options(selectinload(RegistryPipeline.waypoints))
        .where(
            RegistryPipeline.id == pipeline_id,
            RegistryPipeline.entity_id == entity_id,
            RegistryPipeline.archived == False,
        )
    )
    pipe = result.scalars().first()
    if not pipe:
        raise StructuredHTTPException(
            404,
            code="PIPELINE_NOT_FOUND",
            message="Pipeline not found",
        )
    return {
        **PipelineRead.model_validate(pipe).model_dump(),
        "waypoints": [
            {
                "id": str(wp.id),
                "sequence_no": wp.sequence_no,
                "latitude": wp.latitude,
                "longitude": wp.longitude,
                "elevation_m": wp.elevation_m,
                "chainage_km": wp.chainage_km,
                "environment": wp.environment,
                "water_depth_m": wp.water_depth_m,
                "waypoint_type": wp.waypoint_type,
                "waypoint_name": wp.waypoint_name,
                "notes": wp.notes,
            }
            for wp in sorted(pipe.waypoints, key=lambda w: w.sequence_no)
        ],
    }


@router.post("/pipelines", response_model=PipelineRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_pipeline(
    body: PipelineCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate both endpoint installations belong to entity
    await _get_or_404(db, Installation, body.from_installation_id, entity_id, "From installation")
    await _get_or_404(db, Installation, body.to_installation_id, entity_id, "To installation")
    obj = RegistryPipeline(entity_id=entity_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineRead, dependencies=[require_permission("asset.update")])
async def update_pipeline(
    pipeline_id: UUID,
    body: PipelineUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryPipeline, pipeline_id, entity_id, "Pipeline")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_pipeline", pipeline_id, obj.pipeline_id, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/pipelines/{pipeline_id}", dependencies=[require_permission("asset.delete")])
async def delete_pipeline(
    pipeline_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryPipeline, pipeline_id, entity_id, "Pipeline")
    obj.archived = True
    await _log_ar_changes(db, "ar_pipeline", pipeline_id, obj.pipeline_id, {"archived": False}, {"archived": True}, current_user.id, entity_id, "archive")
    await db.commit()
    return {"detail": "Pipeline archived"}


# ════════════════════════════════════════════════════════════════════════════
# HIERARCHY & STATS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/hierarchy", dependencies=[require_permission("asset.read")])
async def get_hierarchy(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full hierarchy tree: fields -> sites -> installations with counts."""
    # Fetch all active fields
    fields_result = await db.execute(
        select(OilField)
        .where(OilField.entity_id == entity_id, OilField.archived == False)
        .order_by(OilField.code)
    )
    fields = fields_result.scalars().all()

    # Fetch all active sites
    sites_result = await db.execute(
        select(OilSite)
        .where(OilSite.entity_id == entity_id, OilSite.archived == False)
        .order_by(OilSite.code)
    )
    sites = sites_result.scalars().all()

    # Fetch all active installations
    installations_result = await db.execute(
        select(Installation)
        .where(Installation.entity_id == entity_id, Installation.archived == False)
        .order_by(Installation.code)
    )
    installations = installations_result.scalars().all()

    # Equipment counts per installation
    equip_counts_result = await db.execute(
        select(
            RegistryEquipment.installation_id,
            sqla_func.count(RegistryEquipment.id).label("count"),
        )
        .where(
            RegistryEquipment.entity_id == entity_id,
            RegistryEquipment.archived == False,
        )
        .group_by(RegistryEquipment.installation_id)
    )
    equip_counts = {row.installation_id: row.count for row in equip_counts_result.all()}

    # Build tree
    installations_by_site: dict[UUID, list] = {}
    for inst in installations:
        installations_by_site.setdefault(inst.site_id, []).append({
            "id": str(inst.id),
            "code": inst.code,
            "name": inst.name,
            "installation_type": inst.installation_type,
            "status": inst.status,
            "equipment_count": equip_counts.get(inst.id, 0),
        })

    sites_by_field: dict[UUID, list] = {}
    for site in sites:
        sites_by_field.setdefault(site.field_id, []).append({
            "id": str(site.id),
            "code": site.code,
            "name": site.name,
            "site_type": site.site_type,
            "status": site.status,
            "installation_count": len(installations_by_site.get(site.id, [])),
            "installations": installations_by_site.get(site.id, []),
        })

    tree = []
    for field in fields:
        tree.append({
            "id": str(field.id),
            "code": field.code,
            "name": field.name,
            "country": field.country,
            "status": field.status,
            "site_count": len(sites_by_field.get(field.id, [])),
            "sites": sites_by_field.get(field.id, []),
        })

    return tree


@router.get("/stats", dependencies=[require_permission("asset.read")])
async def get_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated statistics for the asset registry."""
    # Counts per top-level entity
    field_count = (await db.execute(
        select(sqla_func.count()).where(OilField.entity_id == entity_id, OilField.archived == False)
    )).scalar() or 0

    site_count = (await db.execute(
        select(sqla_func.count()).where(OilSite.entity_id == entity_id, OilSite.archived == False)
    )).scalar() or 0

    installation_count = (await db.execute(
        select(sqla_func.count()).where(Installation.entity_id == entity_id, Installation.archived == False)
    )).scalar() or 0

    equipment_count = (await db.execute(
        select(sqla_func.count()).where(RegistryEquipment.entity_id == entity_id, RegistryEquipment.archived == False)
    )).scalar() or 0

    pipeline_count = (await db.execute(
        select(sqla_func.count()).where(RegistryPipeline.entity_id == entity_id, RegistryPipeline.archived == False)
    )).scalar() or 0

    # Equipment by class
    class_result = await db.execute(
        select(
            RegistryEquipment.equipment_class,
            sqla_func.count(RegistryEquipment.id).label("count"),
        )
        .where(
            RegistryEquipment.entity_id == entity_id,
            RegistryEquipment.archived == False,
        )
        .group_by(RegistryEquipment.equipment_class)
        .order_by(sqla_func.count(RegistryEquipment.id).desc())
    )
    equipment_by_class = [
        {"equipment_class": row.equipment_class, "count": row.count}
        for row in class_result.all()
    ]

    # Equipment by status
    status_result = await db.execute(
        select(
            RegistryEquipment.status,
            sqla_func.count(RegistryEquipment.id).label("count"),
        )
        .where(
            RegistryEquipment.entity_id == entity_id,
            RegistryEquipment.archived == False,
        )
        .group_by(RegistryEquipment.status)
    )
    equipment_by_status = [
        {"status": row.status, "count": row.count}
        for row in status_result.all()
    ]

    # Sites by type
    site_type_result = await db.execute(
        select(
            OilSite.site_type,
            sqla_func.count(OilSite.id).label("count"),
        )
        .where(
            OilSite.entity_id == entity_id,
            OilSite.archived == False,
        )
        .group_by(OilSite.site_type)
    )
    sites_by_type = [
        {"site_type": row.site_type, "count": row.count}
        for row in site_type_result.all()
    ]

    return {
        "field_count": field_count,
        "site_count": site_count,
        "installation_count": installation_count,
        "equipment_count": equipment_count,
        "pipeline_count": pipeline_count,
        "equipment_by_class": equipment_by_class,
        "equipment_by_status": equipment_by_status,
        "sites_by_type": sites_by_type,
    }


# ════════════════════════════════════════════════════════════════════════════
# EQUIPMENT SUB-MODEL HELPERS
# ════════════════════════════════════════════════════════════════════════════

async def _verify_equipment_entity(db: AsyncSession, equipment_id: UUID, entity_id: UUID):
    """Verify equipment belongs to current entity (used for sub-model routes)."""
    result = await db.execute(
        select(RegistryEquipment).where(
            RegistryEquipment.id == equipment_id,
            RegistryEquipment.entity_id == entity_id,
            RegistryEquipment.archived == False,
        )
    )
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="EQUIPMENT_NOT_FOUND",
            message="Equipment not found",
        )
    return obj


async def _submodel_crud_list(db, model, fk_col, parent_id, order_col):
    result = await db.execute(select(model).where(fk_col == parent_id).order_by(order_col))
    return result.scalars().all()


async def _submodel_crud_get(db, model, fk_col, parent_id, item_id, label="Item"):
    result = await db.execute(select(model).where(model.id == item_id, fk_col == parent_id))
    obj = result.scalars().first()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="NOT_FOUND",
            message="{label} not found",
            params={
                "label": label,
            },
        )
    return obj


# ════════════════════════════════════════════════════════════════════════════
# CRANE — CONFIGURATIONS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/crane-configurations", response_model=list[CraneConfigurationRead], dependencies=[require_permission("asset.read")])
async def list_crane_configurations(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneConfiguration, CraneConfiguration.crane_id, equipment_id, CraneConfiguration.config_code)


@router.post("/equipment/{equipment_id}/crane-configurations", response_model=CraneConfigurationRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_crane_configuration(
    equipment_id: UUID,
    body: CraneConfigurationCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = CraneConfiguration(crane_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/crane-configurations/{config_id}", response_model=CraneConfigurationRead, dependencies=[require_permission("asset.update")])
async def update_crane_configuration(
    equipment_id: UUID, config_id: UUID, body: CraneConfigurationUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneConfiguration, CraneConfiguration.crane_id, equipment_id, config_id, "Configuration")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-configurations/{config_id}", dependencies=[require_permission("asset.delete")])
async def delete_crane_configuration(
    equipment_id: UUID, config_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneConfiguration, CraneConfiguration.crane_id, equipment_id, config_id, "Configuration")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Configuration deleted"}


# ════════════════════════════════════════════════════════════════════════════
# CRANE — HOOK BLOCKS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/crane-hook-blocks", response_model=list[CraneHookBlockRead], dependencies=[require_permission("asset.read")])
async def list_crane_hook_blocks(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneHookBlock, CraneHookBlock.crane_id, equipment_id, CraneHookBlock.block_reference)


@router.post("/equipment/{equipment_id}/crane-hook-blocks", response_model=CraneHookBlockRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_crane_hook_block(
    equipment_id: UUID, body: CraneHookBlockCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = CraneHookBlock(crane_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/crane-hook-blocks/{block_id}", response_model=CraneHookBlockRead, dependencies=[require_permission("asset.update")])
async def update_crane_hook_block(
    equipment_id: UUID, block_id: UUID, body: CraneHookBlockUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneHookBlock, CraneHookBlock.crane_id, equipment_id, block_id, "Hook block")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-hook-blocks/{block_id}", dependencies=[require_permission("asset.delete")])
async def delete_crane_hook_block(
    equipment_id: UUID, block_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneHookBlock, CraneHookBlock.crane_id, equipment_id, block_id, "Hook block")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Hook block deleted"}


# ════════════════════════════════════════════════════════════════════════════
# CRANE — REEVING GUIDE
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/crane-reeving-guide", response_model=list[CraneReevingGuideRead], dependencies=[require_permission("asset.read")])
async def list_crane_reeving_guide(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneReevingGuide, CraneReevingGuide.crane_id, equipment_id, CraneReevingGuide.reeving_parts)


@router.post("/equipment/{equipment_id}/crane-reeving-guide", response_model=CraneReevingGuideRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_crane_reeving_guide(
    equipment_id: UUID, body: CraneReevingGuideCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = CraneReevingGuide(crane_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/crane-reeving-guide/{guide_id}", response_model=CraneReevingGuideRead, dependencies=[require_permission("asset.update")])
async def update_crane_reeving_guide(
    equipment_id: UUID, guide_id: UUID, body: CraneReevingGuideUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneReevingGuide, CraneReevingGuide.crane_id, equipment_id, guide_id, "Reeving guide")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-reeving-guide/{guide_id}", dependencies=[require_permission("asset.delete")])
async def delete_crane_reeving_guide(
    equipment_id: UUID, guide_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneReevingGuide, CraneReevingGuide.crane_id, equipment_id, guide_id, "Reeving guide")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Reeving guide entry deleted"}


# ════════════════════════════════════════════════════════════════════════════
# SEPARATOR — NOZZLES
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/separator-nozzles", response_model=list[SeparatorNozzleRead], dependencies=[require_permission("asset.read")])
async def list_separator_nozzles(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, SeparatorNozzle, SeparatorNozzle.separator_id, equipment_id, SeparatorNozzle.nozzle_mark)


@router.post("/equipment/{equipment_id}/separator-nozzles", response_model=SeparatorNozzleRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_separator_nozzle(
    equipment_id: UUID, body: SeparatorNozzleCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = SeparatorNozzle(separator_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/separator-nozzles/{nozzle_id}", response_model=SeparatorNozzleRead, dependencies=[require_permission("asset.update")])
async def update_separator_nozzle(
    equipment_id: UUID, nozzle_id: UUID, body: SeparatorNozzleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorNozzle, SeparatorNozzle.separator_id, equipment_id, nozzle_id, "Nozzle")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/separator-nozzles/{nozzle_id}", dependencies=[require_permission("asset.delete")])
async def delete_separator_nozzle(
    equipment_id: UUID, nozzle_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorNozzle, SeparatorNozzle.separator_id, equipment_id, nozzle_id, "Nozzle")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Nozzle deleted"}


# ════════════════════════════════════════════════════════════════════════════
# SEPARATOR — PROCESS CASES
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/separator-process-cases", response_model=list[SeparatorProcessCaseRead], dependencies=[require_permission("asset.read")])
async def list_separator_process_cases(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, SeparatorProcessCase, SeparatorProcessCase.separator_id, equipment_id, SeparatorProcessCase.case_name)


@router.post("/equipment/{equipment_id}/separator-process-cases", response_model=SeparatorProcessCaseRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_separator_process_case(
    equipment_id: UUID, body: SeparatorProcessCaseCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = SeparatorProcessCase(separator_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/separator-process-cases/{case_id}", response_model=SeparatorProcessCaseRead, dependencies=[require_permission("asset.update")])
async def update_separator_process_case(
    equipment_id: UUID, case_id: UUID, body: SeparatorProcessCaseUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorProcessCase, SeparatorProcessCase.separator_id, equipment_id, case_id, "Process case")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/separator-process-cases/{case_id}", dependencies=[require_permission("asset.delete")])
async def delete_separator_process_case(
    equipment_id: UUID, case_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorProcessCase, SeparatorProcessCase.separator_id, equipment_id, case_id, "Process case")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Process case deleted"}


# ════════════════════════════════════════════════════════════════════════════
# PUMP — CURVE POINTS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/pump-curve-points", response_model=list[PumpCurvePointRead], dependencies=[require_permission("asset.read")])
async def list_pump_curve_points(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, PumpCurvePoint, PumpCurvePoint.pump_id, equipment_id, PumpCurvePoint.flow_m3h)


@router.post("/equipment/{equipment_id}/pump-curve-points", response_model=PumpCurvePointRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_pump_curve_point(
    equipment_id: UUID, body: PumpCurvePointCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = PumpCurvePoint(pump_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/pump-curve-points/{point_id}", response_model=PumpCurvePointRead, dependencies=[require_permission("asset.update")])
async def update_pump_curve_point(
    equipment_id: UUID, point_id: UUID, body: PumpCurvePointUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, PumpCurvePoint, PumpCurvePoint.pump_id, equipment_id, point_id, "Curve point")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/pump-curve-points/{point_id}", dependencies=[require_permission("asset.delete")])
async def delete_pump_curve_point(
    equipment_id: UUID, point_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, PumpCurvePoint, PumpCurvePoint.pump_id, equipment_id, point_id, "Curve point")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Curve point deleted"}


# ════════════════════════════════════════════════════════════════════════════
# PROCESS COLUMN — SECTIONS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/column-sections", response_model=list[ColumnSectionRead], dependencies=[require_permission("asset.read")])
async def list_column_sections(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, ColumnSection, ColumnSection.column_id, equipment_id, ColumnSection.section_number)


@router.post("/equipment/{equipment_id}/column-sections", response_model=ColumnSectionRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_column_section(
    equipment_id: UUID, body: ColumnSectionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = ColumnSection(column_id=equipment_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/column-sections/{section_id}", response_model=ColumnSectionRead, dependencies=[require_permission("asset.update")])
async def update_column_section(
    equipment_id: UUID, section_id: UUID, body: ColumnSectionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, ColumnSection, ColumnSection.column_id, equipment_id, section_id, "Column section")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/column-sections/{section_id}", dependencies=[require_permission("asset.delete")])
async def delete_column_section(
    equipment_id: UUID, section_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, ColumnSection, ColumnSection.column_id, equipment_id, section_id, "Column section")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Column section deleted"}


# ════════════════════════════════════════════════════════════════════════════
# CRANE CONFIG — LOAD CHART POINTS
# ════════════════════════════════════════════════════════════════════════════

async def _verify_config_entity(db: AsyncSession, equipment_id: UUID, config_id: UUID, entity_id: UUID):
    """Verify equipment ownership + config belongs to equipment."""
    await _verify_equipment_entity(db, equipment_id, entity_id)
    result = await db.execute(
        select(CraneConfiguration).where(CraneConfiguration.id == config_id, CraneConfiguration.crane_id == equipment_id)
    )
    cfg = result.scalars().first()
    if not cfg:
        raise StructuredHTTPException(
            404,
            code="CONFIGURATION_NOT_FOUND",
            message="Configuration not found",
        )
    return cfg


@router.get("/equipment/{equipment_id}/crane-configurations/{config_id}/load-chart-points", response_model=list[CraneLoadChartPointRead], dependencies=[require_permission("asset.read")])
async def list_crane_load_chart_points(
    equipment_id: UUID, config_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    return await _submodel_crud_list(db, CraneLoadChartPoint, CraneLoadChartPoint.config_id, config_id, CraneLoadChartPoint.radius_m)


@router.post("/equipment/{equipment_id}/crane-configurations/{config_id}/load-chart-points", response_model=CraneLoadChartPointRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_crane_load_chart_point(
    equipment_id: UUID, config_id: UUID,
    body: CraneLoadChartPointCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    obj = CraneLoadChartPoint(config_id=config_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/crane-configurations/{config_id}/load-chart-points/{point_id}", response_model=CraneLoadChartPointRead, dependencies=[require_permission("asset.update")])
async def update_crane_load_chart_point(
    equipment_id: UUID, config_id: UUID, point_id: UUID,
    body: CraneLoadChartPointUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneLoadChartPoint, CraneLoadChartPoint.config_id, config_id, point_id, "Load chart point")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-configurations/{config_id}/load-chart-points/{point_id}", dependencies=[require_permission("asset.delete")])
async def delete_crane_load_chart_point(
    equipment_id: UUID, config_id: UUID, point_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    obj = await _submodel_crud_get(db, CraneLoadChartPoint, CraneLoadChartPoint.config_id, config_id, point_id, "Load chart point")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Load chart point deleted"}


# ════════════════════════════════════════════════════════════════════════════
# CRANE CONFIG — LIFT ZONES
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/crane-configurations/{config_id}/lift-zones", response_model=list[CraneLiftZoneRead], dependencies=[require_permission("asset.read")])
async def list_crane_lift_zones(
    equipment_id: UUID, config_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    return await _submodel_crud_list(db, CraneLiftZone, CraneLiftZone.config_id, config_id, CraneLiftZone.zone_name)


@router.post("/equipment/{equipment_id}/crane-configurations/{config_id}/lift-zones", response_model=CraneLiftZoneRead, status_code=201, dependencies=[require_permission("asset.create")])
async def create_crane_lift_zone(
    equipment_id: UUID, config_id: UUID,
    body: CraneLiftZoneCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    obj = CraneLiftZone(config_id=config_id, **body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/equipment/{equipment_id}/crane-configurations/{config_id}/lift-zones/{zone_id}", response_model=CraneLiftZoneRead, dependencies=[require_permission("asset.update")])
async def update_crane_lift_zone(
    equipment_id: UUID, config_id: UUID, zone_id: UUID,
    body: CraneLiftZoneUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    equip = await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneLiftZone, CraneLiftZone.config_id, config_id, zone_id, "Lift zone")
    updates = body.model_dump(exclude_unset=True)
    old_data = _snapshot_fields(obj, list(updates.keys()))
    for key, value in updates.items():
        setattr(obj, key, value)
    await _log_ar_changes(db, "ar_equipment", equipment_id, equip.tag_number, old_data, updates, current_user.id, entity_id)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-configurations/{config_id}/lift-zones/{zone_id}", dependencies=[require_permission("asset.delete")])
async def delete_crane_lift_zone(
    equipment_id: UUID, config_id: UUID, zone_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_config_entity(db, equipment_id, config_id, entity_id)
    obj = await _submodel_crud_get(db, CraneLiftZone, CraneLiftZone.config_id, config_id, zone_id, "Lift zone")
    await db.delete(obj)
    await db.commit()
    return {"detail": "Lift zone deleted"}


# ════════════════════════════════════════════════════════════════════════════
# KMZ IMPORT / EXPORT
# ════════════════════════════════════════════════════════════════════════════
# Import workflow:
#   1. POST /kmz/preview — upload a KMZ, returns counts + samples. No DB write.
#   2. POST /kmz/import?field_id=<uuid> — commits parsed records under the given
#      OilField. Upsert keyed by ArcGIS globalid / normalised code, so reruns
#      are idempotent. Registers an ImportRun row for audit + rollback.
#   3. POST /kmz/import/{run_id}/rollback — soft-deletes everything the run
#      created, idempotent.
#   4. GET /kmz/import-runs — lists prior runs with report + rollback status.
#
# Export workflow:
#   GET /kmz/export — returns a KMZ built from the entity's current registry.
#     Installations → Point placemarks, Wells → Point placemarks, Pipelines →
#     LineString placemarks, grouped in 3 top-level Folders, styled per fluid.


@router.post("/kmz/preview", dependencies=[require_permission("asset.read")])
async def kmz_preview(
    file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
):
    """
    Parse a KMZ file and return a preview of what it contains:
    count + attribute schema + first 5 samples per category (platforms,
    wells, pipelines, cables, structures). Does not touch the database.
    """
    from app.services.kmz_parser import parse_kmz_preview

    if not file.filename or not file.filename.lower().endswith(".kmz"):
        raise StructuredHTTPException(
            400,
            code="FILE_MUST_KMZ_ARCHIVE",
            message="File must be a .kmz archive",
        )
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise StructuredHTTPException(
            400,
            code="KMZ_TOO_LARGE_MAX_100_MB",
            message="KMZ too large (max 100 MB)",
        )
    try:
        preview = parse_kmz_preview(content)
    except ValueError as exc:
        raise StructuredHTTPException(
            400,
            code="INVALID_KMZ",
            message="Invalid KMZ: {exc}",
            params={
                "exc": exc,
            },
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("KMZ preview failed for %s", file.filename)
        raise StructuredHTTPException(
            500,
            code="PARSE_ERROR",
            message="Parse error: {exc}",
            params={
                "exc": exc,
            },
        ) from exc
    preview["uploaded_by"] = str(current_user.id)
    preview["entity_id"] = str(entity_id)
    preview["filename"] = file.filename
    return preview


@router.get("/kmz/export", dependencies=[require_permission("asset.read")])
async def kmz_export(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Build and stream back a KMZ containing the current entity's assets.
    """
    from app.services.kmz_export import build_kmz

    try:
        kmz_bytes = await build_kmz(db, entity_id, title=f"OpsFlux — Asset Registry ({current_user.first_name or ''})")
    except Exception as exc:  # noqa: BLE001
        logger.exception("KMZ export failed for entity %s", entity_id)
        raise StructuredHTTPException(
            500,
            code="EXPORT_ERROR",
            message="Export error: {exc}",
            params={
                "exc": exc,
            },
        ) from exc

    filename = "opsflux-assets.kmz"
    return Response(
        content=kmz_bytes,
        media_type="application/vnd.google-earth.kmz",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/kmz/import", dependencies=[require_permission("asset.create")])
async def kmz_import(
    file: UploadFile = File(...),
    field_id: UUID = Query(..., description="Target OilField id"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Import a KMZ into the Asset Registry under the given OilField.

    Uses upsert semantics keyed by ArcGIS globalid / normalised code so
    re-running the same import is idempotent. Records the operation in
    ar_import_runs for audit + rollback.
    """
    from app.services.kmz_import import import_kmz

    if not file.filename or not file.filename.lower().endswith(".kmz"):
        raise StructuredHTTPException(
            400,
            code="FILE_MUST_KMZ_ARCHIVE",
            message="File must be a .kmz archive",
        )
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise StructuredHTTPException(
            400,
            code="KMZ_TOO_LARGE_MAX_100_MB",
            message="KMZ too large (max 100 MB)",
        )
    try:
        report = await import_kmz(
            db,
            entity_id=entity_id,
            field_id=field_id,
            user_id=current_user.id,
            kmz_bytes=content,
            filename=file.filename,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        logger.exception("KMZ import failed for entity %s", entity_id)
        raise StructuredHTTPException(
            500,
            code="IMPORT_ERROR",
            message="Import error: {exc}",
            params={
                "exc": exc,
            },
        ) from exc

    await db.commit()
    return report.to_dict()


@router.post(
    "/kmz/import/{run_id}/rollback",
    dependencies=[require_permission("asset.delete")],
)
async def kmz_import_rollback(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete every asset created by a given import run. Idempotent:
    calling it twice marks the run rolled_back but is a no-op on the
    second call.
    """
    from datetime import datetime, timezone

    from app.models.asset_registry_import import ImportRun

    run = (
        await db.execute(
            select(ImportRun).where(ImportRun.id == run_id, ImportRun.entity_id == entity_id)
        )
    ).scalar_one_or_none()
    if not run:
        raise StructuredHTTPException(
            404,
            code="IMPORT_RUN_NOT_FOUND",
            message="Import run not found",
        )
    if run.rolled_back_at is not None:
        return {"detail": "Already rolled back", "rolled_back_at": run.rolled_back_at.isoformat()}

    soft_deleted = {"sites": 0, "installations": 0, "equipment": 0, "pipelines": 0}
    for pid in run.created_pipeline_ids:
        obj = (await db.execute(select(RegistryPipeline).where(RegistryPipeline.id == pid))).scalar_one_or_none()
        if obj and not obj.archived:
            obj.archived = True
            soft_deleted["pipelines"] += 1
    for eid in run.created_equipment_ids:
        obj = (await db.execute(select(RegistryEquipment).where(RegistryEquipment.id == eid))).scalar_one_or_none()
        if obj and not obj.archived:
            obj.archived = True
            soft_deleted["equipment"] += 1
    for iid in run.created_installation_ids:
        obj = (await db.execute(select(Installation).where(Installation.id == iid))).scalar_one_or_none()
        if obj and not obj.archived:
            obj.archived = True
            soft_deleted["installations"] += 1
    for sid in run.created_site_ids:
        obj = (await db.execute(select(OilSite).where(OilSite.id == sid))).scalar_one_or_none()
        if obj and not obj.archived:
            obj.archived = True
            soft_deleted["sites"] += 1

    run.rolled_back_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Rollback completed", "soft_deleted": soft_deleted, "run_id": str(run.id)}


@router.get("/kmz/import-runs", dependencies=[require_permission("asset.read")])
async def list_import_runs(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List the most recent KMZ import runs for this entity (for audit UI).
    """
    from app.models.asset_registry_import import ImportRun

    runs = (
        await db.execute(
            select(ImportRun)
            .where(ImportRun.entity_id == entity_id)
            .order_by(ImportRun.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "field_id": str(r.field_id) if r.field_id else None,
            "source_filename": r.source_filename,
            "document_name": r.document_name,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "rolled_back_at": r.rolled_back_at.isoformat() if r.rolled_back_at else None,
            "report": r.report,
        }
        for r in runs
    ]
