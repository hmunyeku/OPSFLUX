"""
TravelWiz - Back Cargo System Routes
Routes API pour le système de gestion de chargement bateau et retours site
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_travelwiz import (
    BackCargoManifest,
    BackCargoTypeEnum,
    CargoItem,
    LoadingManifest,
    ManifestStatusEnum,
    UnloadingDiscrepancy,
    VesselArrival,
    VesselArrivalStatusEnum,
    YardDispatch,
    YardDispatchStatusEnum,
)
from app.schemas_travelwiz import (
    BackCargoManifestCreate,
    BackCargoManifestPublic,
    BackCargoManifestsPublic,
    BackCargoManifestUpdate,
    LoadingManifestCreate,
    LoadingManifestPublic,
    LoadingManifestsPublic,
    LoadingManifestUpdate,
    TravelWizDashboard,
    TravelWizStats,
    UnloadingDiscrepanciesPublic,
    UnloadingDiscrepancyCreate,
    UnloadingDiscrepancyPublic,
    UnloadingDiscrepancyUpdate,
    VesselArrivalCreate,
    VesselArrivalPublic,
    VesselArrivalsPublic,
    VesselArrivalUpdate,
    YardDispatchCreate,
    YardDispatchPublic,
    YardDispatchesPublic,
    YardDispatchUpdate,
)

router = APIRouter(prefix="/travelwiz", tags=["TravelWiz"])


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def generate_manifest_number() -> str:
    """Generate unique manifest number (format: MAN-YYYY-XXXX)"""
    year = datetime.now().year
    # En production, utiliser un compteur séquentiel de la DB
    random_part = str(uuid4())[:4].upper()
    return f"MAN-{year}-{random_part}"


def generate_back_cargo_number() -> str:
    """Generate unique back cargo number (format: BC-YYYY-XXXX)"""
    year = datetime.now().year
    random_part = str(uuid4())[:4].upper()
    return f"BC-{year}-{random_part}"


def generate_exit_pass_number() -> str:
    """Generate unique exit pass number (format: LP-YYYY-XXXX)"""
    year = datetime.now().year
    random_part = str(uuid4())[:4].upper()
    return f"LP-{year}-{random_part}"


def get_compliance_rules(cargo_type: BackCargoTypeEnum) -> dict:
    """Get compliance rules for a back cargo type"""
    rules = {
        BackCargoTypeEnum.DECHETS_DIS: {
            "requiresMarking": True,
            "requiresShipmentSlip": True,
            "requiresDedicatedStorage": True,
            "wasteType": "DIS",
        },
        BackCargoTypeEnum.DECHETS_DIB: {
            "requiresMarking": True,
            "requiresShipmentSlip": True,
            "requiresDedicatedStorage": True,
            "wasteType": "DIB",
        },
        BackCargoTypeEnum.DECHETS_DMET: {
            "requiresMarking": True,
            "requiresShipmentSlip": True,
            "requiresDedicatedStorage": True,
            "wasteType": "DMET",
        },
        BackCargoTypeEnum.MATERIEL_SOUS_TRAITANT: {
            "requiresInventory": True,
            "requiresSiteSignature": True,
            "requiresSubcontractorSignature": True,
            "requiresExitPass": True,
            "requiresBlueCopyToStore": True,
            "requiresYardOfficerSignature": True,
        },
        BackCargoTypeEnum.REINTEGRATION_STOCK: {
            "requiresSapCodes": True,
            "requiresReintegrationForm": True,
        },
        BackCargoTypeEnum.A_REBUTER: {
            "requiresScrapMention": True,
            "requiresPhotosIfMentionMissing": True,
            "requiresApprovalIfMentionMissing": True,
            "directToScrapArea": True,
        },
        BackCargoTypeEnum.A_FERRAILLER: {
            "requiresScrapMention": True,
            "requiresPhotosIfMentionMissing": True,
            "requiresApprovalIfMentionMissing": True,
            "directToScrapArea": True,
        },
        BackCargoTypeEnum.STOCKAGE_YARD: {
            "requiresStorageJustification": True,
            "requiresYardStorageMention": True,
        },
    }
    return rules.get(cargo_type, {})


# ============================================================================
# LOADING MANIFESTS ROUTES
# ============================================================================

@router.get("/manifests", response_model=LoadingManifestsPublic)
def read_loading_manifests(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    status: ManifestStatusEnum | None = None,
) -> Any:
    """
    Retrieve loading manifests with pagination and optional filtering by status.
    """
    count_statement = select(func.count()).select_from(LoadingManifest).where(
        LoadingManifest.deleted_at.is_(None)
    )
    if status:
        count_statement = count_statement.where(LoadingManifest.status == status)

    count = session.exec(count_statement).one()

    statement = select(LoadingManifest).where(LoadingManifest.deleted_at.is_(None))
    if status:
        statement = statement.where(LoadingManifest.status == status)

    statement = statement.offset(skip).limit(limit).order_by(LoadingManifest.created_at.desc())
    manifests = session.exec(statement).all()

    return LoadingManifestsPublic(data=manifests, count=count)


@router.get("/manifests/{manifest_id}", response_model=LoadingManifestPublic)
def read_loading_manifest(
    manifest_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific loading manifest by ID.
    """
    manifest = session.get(LoadingManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Loading manifest not found")
    return manifest


@router.post("/manifests", response_model=LoadingManifestPublic)
def create_loading_manifest(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    manifest_in: LoadingManifestCreate,
) -> Any:
    """
    Create new loading manifest with items.
    """
    # Generate unique manifest number
    manifest_number = generate_manifest_number()

    # Calculate totals
    total_weight = sum(item.weight * item.quantity for item in manifest_in.items)
    total_packages = sum(item.quantity for item in manifest_in.items)

    # Create manifest
    manifest_data = manifest_in.model_dump(exclude={"items"})
    manifest = LoadingManifest(
        **manifest_data,
        manifest_number=manifest_number,
        total_weight=total_weight,
        total_packages=total_packages,
        created_by=str(current_user.id),
    )
    session.add(manifest)
    session.flush()

    # Create cargo items
    for item_data in manifest_in.items:
        item = CargoItem(
            **item_data.model_dump(),
            loading_manifest_id=manifest.id,
            qr_code=f"MAN-{manifest.manifest_number}-{item_data.item_number}",
        )
        session.add(item)

    session.commit()
    session.refresh(manifest)
    return manifest


@router.patch("/manifests/{manifest_id}", response_model=LoadingManifestPublic)
def update_loading_manifest(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    manifest_id: UUID,
    manifest_in: LoadingManifestUpdate,
) -> Any:
    """
    Update a loading manifest.
    """
    manifest = session.get(LoadingManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Loading manifest not found")

    manifest_data = manifest_in.model_dump(exclude_unset=True)
    manifest.sqlmodel_update(manifest_data)
    session.add(manifest)
    session.commit()
    session.refresh(manifest)
    return manifest


@router.delete("/manifests/{manifest_id}")
def delete_loading_manifest(
    manifest_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Soft delete a loading manifest.
    """
    manifest = session.get(LoadingManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Loading manifest not found")

    manifest.deleted_at = datetime.now(timezone.utc)
    session.add(manifest)
    session.commit()
    return Message(message="Loading manifest deleted successfully")


# ============================================================================
# BACK CARGO MANIFESTS ROUTES
# ============================================================================

@router.get("/back-cargo", response_model=BackCargoManifestsPublic)
def read_back_cargo_manifests(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    type: BackCargoTypeEnum | None = None,
    status: ManifestStatusEnum | None = None,
) -> Any:
    """
    Retrieve back cargo manifests with pagination and optional filtering.
    """
    count_statement = select(func.count()).select_from(BackCargoManifest).where(
        BackCargoManifest.deleted_at.is_(None)
    )
    if type:
        count_statement = count_statement.where(BackCargoManifest.type == type)
    if status:
        count_statement = count_statement.where(BackCargoManifest.status == status)

    count = session.exec(count_statement).one()

    statement = select(BackCargoManifest).where(BackCargoManifest.deleted_at.is_(None))
    if type:
        statement = statement.where(BackCargoManifest.type == type)
    if status:
        statement = statement.where(BackCargoManifest.status == status)

    statement = statement.offset(skip).limit(limit).order_by(BackCargoManifest.created_at.desc())
    manifests = session.exec(statement).all()

    return BackCargoManifestsPublic(data=manifests, count=count)


@router.get("/back-cargo/{manifest_id}", response_model=BackCargoManifestPublic)
def read_back_cargo_manifest(
    manifest_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific back cargo manifest by ID.
    """
    manifest = session.get(BackCargoManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Back cargo manifest not found")
    return manifest


@router.post("/back-cargo", response_model=BackCargoManifestPublic)
def create_back_cargo_manifest(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    manifest_in: BackCargoManifestCreate,
) -> Any:
    """
    Create new back cargo manifest with items and compliance rules.
    """
    # Generate unique back cargo number
    back_cargo_number = generate_back_cargo_number()

    # Get compliance rules for this type
    compliance_rules = get_compliance_rules(manifest_in.type)

    # Calculate totals
    total_weight = sum(item.weight * item.quantity for item in manifest_in.items)
    total_packages = sum(item.quantity for item in manifest_in.items)

    # Create manifest
    manifest_data = manifest_in.model_dump(exclude={"items"})
    manifest = BackCargoManifest(
        **manifest_data,
        back_cargo_number=back_cargo_number,
        compliance_rules=compliance_rules,
        total_weight=total_weight,
        total_packages=total_packages,
        created_by=str(current_user.id),
    )
    session.add(manifest)
    session.flush()

    # Create cargo items
    for item_data in manifest_in.items:
        item = CargoItem(
            **item_data.model_dump(),
            back_cargo_manifest_id=manifest.id,
            qr_code=f"BC-{manifest.back_cargo_number}-{item_data.item_number}",
        )
        session.add(item)

    session.commit()
    session.refresh(manifest)
    return manifest


@router.patch("/back-cargo/{manifest_id}", response_model=BackCargoManifestPublic)
def update_back_cargo_manifest(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    manifest_id: UUID,
    manifest_in: BackCargoManifestUpdate,
) -> Any:
    """
    Update a back cargo manifest.
    """
    manifest = session.get(BackCargoManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Back cargo manifest not found")

    manifest_data = manifest_in.model_dump(exclude_unset=True)
    manifest.sqlmodel_update(manifest_data)
    session.add(manifest)
    session.commit()
    session.refresh(manifest)
    return manifest


@router.delete("/back-cargo/{manifest_id}")
def delete_back_cargo_manifest(
    manifest_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Soft delete a back cargo manifest.
    """
    manifest = session.get(BackCargoManifest, manifest_id)
    if not manifest or manifest.deleted_at:
        raise HTTPException(status_code=404, detail="Back cargo manifest not found")

    manifest.deleted_at = datetime.now(timezone.utc)
    session.add(manifest)
    session.commit()
    return Message(message="Back cargo manifest deleted successfully")


# ============================================================================
# VESSEL ARRIVALS ROUTES
# ============================================================================

@router.get("/vessel-arrivals", response_model=VesselArrivalsPublic)
def read_vessel_arrivals(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    status: VesselArrivalStatusEnum | None = None,
    upcoming_days: int | None = Query(None, description="Filter by ETA within X days"),
) -> Any:
    """
    Retrieve vessel arrivals with pagination and optional filtering.
    """
    count_statement = select(func.count()).select_from(VesselArrival).where(
        VesselArrival.deleted_at.is_(None)
    )
    if status:
        count_statement = count_statement.where(VesselArrival.status == status)
    if upcoming_days:
        cutoff_date = datetime.now(timezone.utc) + timedelta(days=upcoming_days)
        count_statement = count_statement.where(VesselArrival.eta <= cutoff_date)

    count = session.exec(count_statement).one()

    statement = select(VesselArrival).where(VesselArrival.deleted_at.is_(None))
    if status:
        statement = statement.where(VesselArrival.status == status)
    if upcoming_days:
        cutoff_date = datetime.now(timezone.utc) + timedelta(days=upcoming_days)
        statement = statement.where(VesselArrival.eta <= cutoff_date)

    statement = statement.offset(skip).limit(limit).order_by(VesselArrival.eta.asc())
    arrivals = session.exec(statement).all()

    return VesselArrivalsPublic(data=arrivals, count=count)


@router.get("/vessel-arrivals/{arrival_id}", response_model=VesselArrivalPublic)
def read_vessel_arrival(
    arrival_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific vessel arrival by ID.
    """
    arrival = session.get(VesselArrival, arrival_id)
    if not arrival or arrival.deleted_at:
        raise HTTPException(status_code=404, detail="Vessel arrival not found")
    return arrival


@router.post("/vessel-arrivals", response_model=VesselArrivalPublic)
def create_vessel_arrival(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    arrival_in: VesselArrivalCreate,
) -> Any:
    """
    Create new vessel arrival record.
    """
    arrival = VesselArrival(**arrival_in.model_dump(), created_by=str(current_user.id))
    session.add(arrival)
    session.commit()
    session.refresh(arrival)
    return arrival


@router.patch("/vessel-arrivals/{arrival_id}", response_model=VesselArrivalPublic)
def update_vessel_arrival(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    arrival_id: UUID,
    arrival_in: VesselArrivalUpdate,
) -> Any:
    """
    Update a vessel arrival record.
    """
    arrival = session.get(VesselArrival, arrival_id)
    if not arrival or arrival.deleted_at:
        raise HTTPException(status_code=404, detail="Vessel arrival not found")

    arrival_data = arrival_in.model_dump(exclude_unset=True)
    arrival.sqlmodel_update(arrival_data)
    session.add(arrival)
    session.commit()
    session.refresh(arrival)
    return arrival


@router.delete("/vessel-arrivals/{arrival_id}")
def delete_vessel_arrival(
    arrival_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Soft delete a vessel arrival.
    """
    arrival = session.get(VesselArrival, arrival_id)
    if not arrival or arrival.deleted_at:
        raise HTTPException(status_code=404, detail="Vessel arrival not found")

    arrival.deleted_at = datetime.now(timezone.utc)
    session.add(arrival)
    session.commit()
    return Message(message="Vessel arrival deleted successfully")


# ============================================================================
# UNLOADING DISCREPANCIES ROUTES
# ============================================================================

@router.get("/discrepancies", response_model=UnloadingDiscrepanciesPublic)
def read_unloading_discrepancies(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    vessel_arrival_id: UUID | None = None,
    resolved: bool | None = None,
) -> Any:
    """
    Retrieve unloading discrepancies with pagination and optional filtering.
    """
    count_statement = select(func.count()).select_from(UnloadingDiscrepancy).where(
        UnloadingDiscrepancy.deleted_at.is_(None)
    )
    if vessel_arrival_id:
        count_statement = count_statement.where(UnloadingDiscrepancy.vessel_arrival_id == vessel_arrival_id)
    if resolved is not None:
        count_statement = count_statement.where(UnloadingDiscrepancy.resolved == resolved)

    count = session.exec(count_statement).one()

    statement = select(UnloadingDiscrepancy).where(UnloadingDiscrepancy.deleted_at.is_(None))
    if vessel_arrival_id:
        statement = statement.where(UnloadingDiscrepancy.vessel_arrival_id == vessel_arrival_id)
    if resolved is not None:
        statement = statement.where(UnloadingDiscrepancy.resolved == resolved)

    statement = statement.offset(skip).limit(limit).order_by(UnloadingDiscrepancy.detected_at.desc())
    discrepancies = session.exec(statement).all()

    return UnloadingDiscrepanciesPublic(data=discrepancies, count=count)


@router.post("/discrepancies", response_model=UnloadingDiscrepancyPublic)
def create_unloading_discrepancy(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    discrepancy_in: UnloadingDiscrepancyCreate,
) -> Any:
    """
    Create new unloading discrepancy.
    """
    # Verify vessel arrival exists
    arrival = session.get(VesselArrival, discrepancy_in.vessel_arrival_id)
    if not arrival or arrival.deleted_at:
        raise HTTPException(status_code=404, detail="Vessel arrival not found")

    discrepancy = UnloadingDiscrepancy(**discrepancy_in.model_dump(), created_by=str(current_user.id))
    session.add(discrepancy)
    session.commit()
    session.refresh(discrepancy)
    return discrepancy


@router.patch("/discrepancies/{discrepancy_id}", response_model=UnloadingDiscrepancyPublic)
def update_unloading_discrepancy(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    discrepancy_id: UUID,
    discrepancy_in: UnloadingDiscrepancyUpdate,
) -> Any:
    """
    Update an unloading discrepancy (typically to mark as resolved).
    """
    discrepancy = session.get(UnloadingDiscrepancy, discrepancy_id)
    if not discrepancy or discrepancy.deleted_at:
        raise HTTPException(status_code=404, detail="Unloading discrepancy not found")

    discrepancy_data = discrepancy_in.model_dump(exclude_unset=True)
    discrepancy.sqlmodel_update(discrepancy_data)
    session.add(discrepancy)
    session.commit()
    session.refresh(discrepancy)
    return discrepancy


# ============================================================================
# YARD DISPATCH ROUTES
# ============================================================================

@router.get("/yard-dispatches", response_model=YardDispatchesPublic)
def read_yard_dispatches(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    status: YardDispatchStatusEnum | None = None,
) -> Any:
    """
    Retrieve yard dispatches with pagination and optional filtering.
    """
    count_statement = select(func.count()).select_from(YardDispatch).where(
        YardDispatch.deleted_at.is_(None)
    )
    if status:
        count_statement = count_statement.where(YardDispatch.status == status)

    count = session.exec(count_statement).one()

    statement = select(YardDispatch).where(YardDispatch.deleted_at.is_(None))
    if status:
        statement = statement.where(YardDispatch.status == status)

    statement = statement.offset(skip).limit(limit).order_by(YardDispatch.created_at.desc())
    dispatches = session.exec(statement).all()

    return YardDispatchesPublic(data=dispatches, count=count)


@router.get("/yard-dispatches/{dispatch_id}", response_model=YardDispatchPublic)
def read_yard_dispatch(
    dispatch_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific yard dispatch by ID.
    """
    dispatch = session.get(YardDispatch, dispatch_id)
    if not dispatch or dispatch.deleted_at:
        raise HTTPException(status_code=404, detail="Yard dispatch not found")
    return dispatch


@router.post("/yard-dispatches", response_model=YardDispatchPublic)
def create_yard_dispatch(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dispatch_in: YardDispatchCreate,
) -> Any:
    """
    Create new yard dispatch record.
    """
    # Verify back cargo exists
    back_cargo = session.get(BackCargoManifest, dispatch_in.back_cargo_id)
    if not back_cargo or back_cargo.deleted_at:
        raise HTTPException(status_code=404, detail="Back cargo manifest not found")

    dispatch = YardDispatch(**dispatch_in.model_dump(), created_by=str(current_user.id))
    session.add(dispatch)
    session.commit()
    session.refresh(dispatch)
    return dispatch


@router.patch("/yard-dispatches/{dispatch_id}", response_model=YardDispatchPublic)
def update_yard_dispatch(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dispatch_id: UUID,
    dispatch_in: YardDispatchUpdate,
) -> Any:
    """
    Update a yard dispatch record.
    """
    dispatch = session.get(YardDispatch, dispatch_id)
    if not dispatch or dispatch.deleted_at:
        raise HTTPException(status_code=404, detail="Yard dispatch not found")

    dispatch_data = dispatch_in.model_dump(exclude_unset=True)

    # Auto-generate exit pass number if needed
    if dispatch_data.get("exit_pass_generated") and not dispatch.exit_pass_number:
        dispatch_data["exit_pass_number"] = generate_exit_pass_number()

    dispatch.sqlmodel_update(dispatch_data)
    session.add(dispatch)
    session.commit()
    session.refresh(dispatch)
    return dispatch


# ============================================================================
# DASHBOARD ROUTES
# ============================================================================

@router.get("/dashboard", response_model=TravelWizDashboard)
def read_travelwiz_dashboard(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get TravelWiz dashboard data with statistics and recent items.
    """
    # Calculate statistics
    active_manifests = session.exec(
        select(func.count()).select_from(LoadingManifest).where(
            LoadingManifest.deleted_at.is_(None),
            LoadingManifest.status.in_([
                ManifestStatusEnum.VALIDE,
                ManifestStatusEnum.CHARGE,
                ManifestStatusEnum.EN_TRANSIT,
            ])
        )
    ).one()

    cutoff_date = datetime.now(timezone.utc) + timedelta(days=7)
    vessels_expected = session.exec(
        select(func.count()).select_from(VesselArrival).where(
            VesselArrival.deleted_at.is_(None),
            VesselArrival.eta <= cutoff_date,
            VesselArrival.status.in_([
                VesselArrivalStatusEnum.ATTENDU,
                VesselArrivalStatusEnum.EN_APPROCHE,
            ])
        )
    ).one()

    back_cargo_to_dispatch = session.exec(
        select(func.count()).select_from(YardDispatch).where(
            YardDispatch.deleted_at.is_(None),
            YardDispatch.status.in_([
                YardDispatchStatusEnum.EN_ATTENTE_RECEPTION,
                YardDispatchStatusEnum.RECEPTIONNE,
                YardDispatchStatusEnum.VERIFIE,
            ])
        )
    ).one()

    # Calculate compliance rate
    total_back_cargo = session.exec(
        select(func.count()).select_from(BackCargoManifest).where(
            BackCargoManifest.deleted_at.is_(None)
        )
    ).one()

    compliant_back_cargo = session.exec(
        select(func.count()).select_from(BackCargoManifest).where(
            BackCargoManifest.deleted_at.is_(None),
            BackCargoManifest.pending_approval == False
        )
    ).one()

    compliance_rate = (compliant_back_cargo / total_back_cargo * 100) if total_back_cargo > 0 else 100.0

    # Calculate packages and weight in transit
    transit_stats = session.exec(
        select(
            func.sum(LoadingManifest.total_packages),
            func.sum(LoadingManifest.total_weight)
        ).where(
            LoadingManifest.deleted_at.is_(None),
            LoadingManifest.status == ManifestStatusEnum.EN_TRANSIT
        )
    ).one()

    total_packages_in_transit = transit_stats[0] or 0
    total_weight_in_transit = transit_stats[1] or 0.0

    stats = TravelWizStats(
        active_manifests=active_manifests,
        vessels_expected_7_days=vessels_expected,
        back_cargo_to_dispatch=back_cargo_to_dispatch,
        compliance_rate=compliance_rate,
        total_packages_in_transit=total_packages_in_transit,
        total_weight_in_transit=total_weight_in_transit,
    )

    # Get recent items
    recent_manifests = session.exec(
        select(LoadingManifest).where(LoadingManifest.deleted_at.is_(None))
        .order_by(LoadingManifest.created_at.desc())
        .limit(5)
    ).all()

    recent_back_cargo = session.exec(
        select(BackCargoManifest).where(BackCargoManifest.deleted_at.is_(None))
        .order_by(BackCargoManifest.created_at.desc())
        .limit(5)
    ).all()

    upcoming_vessels = session.exec(
        select(VesselArrival).where(
            VesselArrival.deleted_at.is_(None),
            VesselArrival.eta <= cutoff_date
        )
        .order_by(VesselArrival.eta.asc())
        .limit(5)
    ).all()

    pending_dispatches = session.exec(
        select(YardDispatch).where(
            YardDispatch.deleted_at.is_(None),
            YardDispatch.status.in_([
                YardDispatchStatusEnum.EN_ATTENTE_RECEPTION,
                YardDispatchStatusEnum.RECEPTIONNE,
                YardDispatchStatusEnum.VERIFIE,
            ])
        )
        .order_by(YardDispatch.created_at.desc())
        .limit(5)
    ).all()

    return TravelWizDashboard(
        stats=stats,
        recent_manifests=recent_manifests,
        recent_back_cargo=recent_back_cargo,
        upcoming_vessels=upcoming_vessels,
        pending_dispatches=pending_dispatches,
    )
