"""Asset Registry module routes — O&G hierarchy CRUD.

Hierarchy: Field -> Site -> Installation -> Equipment, plus Pipelines.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sqla_func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user, require_permission
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
    SeparatorNozzle, SeparatorProcessCase,
    PumpCurvePoint, ColumnSection,
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
    CraneHookBlockCreate, CraneHookBlockUpdate, CraneHookBlockRead,
    CraneReevingGuideCreate, CraneReevingGuideUpdate, CraneReevingGuideRead,
    SeparatorNozzleCreate, SeparatorNozzleUpdate, SeparatorNozzleRead,
    SeparatorProcessCaseCreate, SeparatorProcessCaseUpdate, SeparatorProcessCaseRead,
    PumpCurvePointCreate, PumpCurvePointUpdate, PumpCurvePointRead,
    ColumnSectionCreate, ColumnSectionUpdate, ColumnSectionRead,
)

router = APIRouter(prefix="/api/v1/asset-registry", tags=["asset-registry"])

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
        raise HTTPException(404, f"{label} not found")
    return obj


# ════════════════════════════════════════════════════════════════════════════
# FIELDS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/fields")
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


@router.get("/fields/{field_id}", response_model=OilFieldRead)
async def get_field(
    field_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, OilField, field_id, entity_id, "Field")


@router.post("/fields", response_model=OilFieldRead, status_code=201)
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


@router.patch("/fields/{field_id}", response_model=OilFieldRead)
async def update_field(
    field_id: UUID,
    body: OilFieldUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilField, field_id, entity_id, "Field")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/fields/{field_id}")
async def delete_field(
    field_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilField, field_id, entity_id, "Field")
    obj.archived = True
    await db.commit()
    return {"detail": "Field archived"}


# ════════════════════════════════════════════════════════════════════════════
# FIELD LICENSES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/fields/{field_id}/licenses", response_model=list[FieldLicenseRead])
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


@router.post("/fields/{field_id}/licenses", response_model=FieldLicenseRead, status_code=201)
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


@router.patch("/fields/{field_id}/licenses/{license_id}", response_model=FieldLicenseRead)
async def update_field_license(
    field_id: UUID,
    license_id: UUID,
    body: FieldLicenseUpdate,
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
        raise HTTPException(404, "License not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/fields/{field_id}/licenses/{license_id}")
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
        raise HTTPException(404, "License not found")
    await db.delete(obj)
    await db.commit()
    return {"detail": "License deleted"}


# ════════════════════════════════════════════════════════════════════════════
# SITES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/sites")
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


@router.get("/sites/{site_id}", response_model=OilSiteRead)
async def get_site(
    site_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, OilSite, site_id, entity_id, "Site")


@router.post("/sites", response_model=OilSiteRead, status_code=201)
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


@router.patch("/sites/{site_id}", response_model=OilSiteRead)
async def update_site(
    site_id: UUID,
    body: OilSiteUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilSite, site_id, entity_id, "Site")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/sites/{site_id}")
async def delete_site(
    site_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, OilSite, site_id, entity_id, "Site")
    obj.archived = True
    await db.commit()
    return {"detail": "Site archived"}


# ════════════════════════════════════════════════════════════════════════════
# INSTALLATIONS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/installations")
async def list_installations(
    site_id: UUID | None = None,
    search: str | None = None,
    status: str | None = None,
    installation_type: str | None = None,
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
    query = query.order_by(Installation.code)
    return await paginate(db, query, pagination)


@router.get("/installations/{installation_id}", response_model=InstallationRead)
async def get_installation(
    installation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_or_404(db, Installation, installation_id, entity_id, "Installation")


@router.post("/installations", response_model=InstallationRead, status_code=201)
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


@router.patch("/installations/{installation_id}", response_model=InstallationRead)
async def update_installation(
    installation_id: UUID,
    body: InstallationUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/installations/{installation_id}")
async def delete_installation(
    installation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, Installation, installation_id, entity_id, "Installation")
    obj.archived = True
    await db.commit()
    return {"detail": "Installation archived"}


# ── Installation Decks ────────────────────────────────────────────────────


@router.get("/installations/{installation_id}/decks", response_model=list[InstallationDeckRead])
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


@router.post("/installations/{installation_id}/decks", response_model=InstallationDeckRead, status_code=201)
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


@router.patch("/installations/{installation_id}/decks/{deck_id}", response_model=InstallationDeckRead)
async def update_installation_deck(
    installation_id: UUID,
    deck_id: UUID,
    body: InstallationDeckUpdate,
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
        raise HTTPException(404, "Deck not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(deck, key, value)
    await db.commit()
    await db.refresh(deck)
    return deck


@router.delete("/installations/{installation_id}/decks/{deck_id}")
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
        raise HTTPException(404, "Deck not found")
    await db.delete(deck)
    await db.commit()
    return {"detail": "Deck deleted"}


# ════════════════════════════════════════════════════════════════════════════
# EQUIPMENT
# ════════════════════════════════════════════════════════════════════════════


@router.get("/equipment")
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


@router.get("/equipment/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")

    # Load specialized sub-table data if available
    spec_model = EQUIPMENT_CLASS_MODEL_MAP.get(obj.equipment_class)
    specialized_data = None
    if spec_model is not None:
        result = await db.execute(select(spec_model).where(spec_model.id == equipment_id))
        spec_obj = result.scalars().first()
        if spec_obj:
            # Convert to dict, exclude the 'id' (same as equipment id)
            from sqlalchemy import inspect as sa_inspect
            mapper = sa_inspect(spec_model)
            specialized_data = {}
            for col in mapper.columns:
                if col.key == "id":
                    continue
                val = getattr(spec_obj, col.key)
                # Convert Decimal to float for JSON serialization
                if isinstance(val, Decimal):
                    val = float(val)
                specialized_data[col.key] = val

    # Attach specialized_data to the response
    resp = EquipmentRead.model_validate(obj)
    resp.specialized_data = specialized_data
    return resp


@router.post("/equipment", response_model=EquipmentRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}", response_model=EquipmentRead)
async def update_equipment(
    equipment_id: UUID,
    body: EquipmentUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}")
async def delete_equipment(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryEquipment, equipment_id, entity_id, "Equipment")
    obj.archived = True
    await db.commit()
    return {"detail": "Equipment archived"}


# ════════════════════════════════════════════════════════════════════════════
# PIPELINES
# ════════════════════════════════════════════════════════════════════════════


@router.get("/pipelines")
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


@router.get("/pipelines/{pipeline_id}")
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
        raise HTTPException(404, "Pipeline not found")
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


@router.post("/pipelines", response_model=PipelineRead, status_code=201)
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


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineRead)
async def update_pipeline(
    pipeline_id: UUID,
    body: PipelineUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryPipeline, pipeline_id, entity_id, "Pipeline")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = await _get_or_404(db, RegistryPipeline, pipeline_id, entity_id, "Pipeline")
    obj.archived = True
    await db.commit()
    return {"detail": "Pipeline archived"}


# ════════════════════════════════════════════════════════════════════════════
# HIERARCHY & STATS
# ════════════════════════════════════════════════════════════════════════════


@router.get("/hierarchy")
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


@router.get("/stats")
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
        raise HTTPException(404, "Equipment not found")
    return obj


async def _submodel_crud_list(db, model, fk_col, parent_id, order_col):
    result = await db.execute(select(model).where(fk_col == parent_id).order_by(order_col))
    return result.scalars().all()


async def _submodel_crud_get(db, model, fk_col, parent_id, item_id, label="Item"):
    result = await db.execute(select(model).where(model.id == item_id, fk_col == parent_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(404, f"{label} not found")
    return obj


# ════════════════════════════════════════════════════════════════════════════
# CRANE — CONFIGURATIONS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/equipment/{equipment_id}/crane-configurations", response_model=list[CraneConfigurationRead])
async def list_crane_configurations(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneConfiguration, CraneConfiguration.crane_id, equipment_id, CraneConfiguration.config_code)


@router.post("/equipment/{equipment_id}/crane-configurations", response_model=CraneConfigurationRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/crane-configurations/{config_id}", response_model=CraneConfigurationRead)
async def update_crane_configuration(
    equipment_id: UUID, config_id: UUID, body: CraneConfigurationUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneConfiguration, CraneConfiguration.crane_id, equipment_id, config_id, "Configuration")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-configurations/{config_id}")
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

@router.get("/equipment/{equipment_id}/crane-hook-blocks", response_model=list[CraneHookBlockRead])
async def list_crane_hook_blocks(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneHookBlock, CraneHookBlock.crane_id, equipment_id, CraneHookBlock.block_reference)


@router.post("/equipment/{equipment_id}/crane-hook-blocks", response_model=CraneHookBlockRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/crane-hook-blocks/{block_id}", response_model=CraneHookBlockRead)
async def update_crane_hook_block(
    equipment_id: UUID, block_id: UUID, body: CraneHookBlockUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneHookBlock, CraneHookBlock.crane_id, equipment_id, block_id, "Hook block")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-hook-blocks/{block_id}")
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

@router.get("/equipment/{equipment_id}/crane-reeving-guide", response_model=list[CraneReevingGuideRead])
async def list_crane_reeving_guide(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, CraneReevingGuide, CraneReevingGuide.crane_id, equipment_id, CraneReevingGuide.reeving_parts)


@router.post("/equipment/{equipment_id}/crane-reeving-guide", response_model=CraneReevingGuideRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/crane-reeving-guide/{guide_id}", response_model=CraneReevingGuideRead)
async def update_crane_reeving_guide(
    equipment_id: UUID, guide_id: UUID, body: CraneReevingGuideUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, CraneReevingGuide, CraneReevingGuide.crane_id, equipment_id, guide_id, "Reeving guide")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/crane-reeving-guide/{guide_id}")
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

@router.get("/equipment/{equipment_id}/separator-nozzles", response_model=list[SeparatorNozzleRead])
async def list_separator_nozzles(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, SeparatorNozzle, SeparatorNozzle.separator_id, equipment_id, SeparatorNozzle.nozzle_mark)


@router.post("/equipment/{equipment_id}/separator-nozzles", response_model=SeparatorNozzleRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/separator-nozzles/{nozzle_id}", response_model=SeparatorNozzleRead)
async def update_separator_nozzle(
    equipment_id: UUID, nozzle_id: UUID, body: SeparatorNozzleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorNozzle, SeparatorNozzle.separator_id, equipment_id, nozzle_id, "Nozzle")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/separator-nozzles/{nozzle_id}")
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

@router.get("/equipment/{equipment_id}/separator-process-cases", response_model=list[SeparatorProcessCaseRead])
async def list_separator_process_cases(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, SeparatorProcessCase, SeparatorProcessCase.separator_id, equipment_id, SeparatorProcessCase.case_name)


@router.post("/equipment/{equipment_id}/separator-process-cases", response_model=SeparatorProcessCaseRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/separator-process-cases/{case_id}", response_model=SeparatorProcessCaseRead)
async def update_separator_process_case(
    equipment_id: UUID, case_id: UUID, body: SeparatorProcessCaseUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, SeparatorProcessCase, SeparatorProcessCase.separator_id, equipment_id, case_id, "Process case")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/separator-process-cases/{case_id}")
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

@router.get("/equipment/{equipment_id}/pump-curve-points", response_model=list[PumpCurvePointRead])
async def list_pump_curve_points(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, PumpCurvePoint, PumpCurvePoint.pump_id, equipment_id, PumpCurvePoint.flow_m3h)


@router.post("/equipment/{equipment_id}/pump-curve-points", response_model=PumpCurvePointRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/pump-curve-points/{point_id}", response_model=PumpCurvePointRead)
async def update_pump_curve_point(
    equipment_id: UUID, point_id: UUID, body: PumpCurvePointUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, PumpCurvePoint, PumpCurvePoint.pump_id, equipment_id, point_id, "Curve point")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/pump-curve-points/{point_id}")
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

@router.get("/equipment/{equipment_id}/column-sections", response_model=list[ColumnSectionRead])
async def list_column_sections(
    equipment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    return await _submodel_crud_list(db, ColumnSection, ColumnSection.column_id, equipment_id, ColumnSection.section_number)


@router.post("/equipment/{equipment_id}/column-sections", response_model=ColumnSectionRead, status_code=201)
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


@router.patch("/equipment/{equipment_id}/column-sections/{section_id}", response_model=ColumnSectionRead)
async def update_column_section(
    equipment_id: UUID, section_id: UUID, body: ColumnSectionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_equipment_entity(db, equipment_id, entity_id)
    obj = await _submodel_crud_get(db, ColumnSection, ColumnSection.column_id, equipment_id, section_id, "Column section")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/equipment/{equipment_id}/column-sections/{section_id}")
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
