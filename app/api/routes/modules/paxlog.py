"""PaxLog API routes — PAX profiles, credentials, compliance, AdS, incidents."""

import logging
import unicodedata
import re
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.references import generate_reference
from app.models.common import Tier, User
from app.models.paxlog import (
    Ads,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    PaxCredential,
    PaxGroup,
    PaxIncident,
    PaxProfile,
)
from app.schemas.paxlog import (
    AdsCreate,
    AdsRead,
    AdsSummary,
    AdsUpdate,
    ComplianceCheckResult,
    ComplianceMatrixCreate,
    ComplianceMatrixRead,
    CredentialTypeCreate,
    CredentialTypeRead,
    PaxCredentialCreate,
    PaxCredentialRead,
    PaxCredentialValidate,
    PaxIncidentCreate,
    PaxIncidentRead,
    PaxIncidentResolve,
    PaxProfileCreate,
    PaxProfileRead,
    PaxProfileSummary,
    PaxProfileUpdate,
)
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/api/v1/pax", tags=["paxlog"])
logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    """Normalize a name for fuzzy search: lowercase, no accents, no hyphens."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9 ]", "", ascii_str.lower()).strip()


def _compute_completeness(profile: PaxProfile) -> int:
    """Calculate profile completeness as a percentage (0-100)."""
    fields = [
        profile.first_name,
        profile.last_name,
        profile.birth_date,
        profile.nationality,
        profile.company_id,
        profile.badge_number,
    ]
    filled = sum(1 for f in fields if f is not None and f != "")
    return round(filled / len(fields) * 100)


# ═══════════════════════════════════════════════════════════════════════════════
# PAX PROFILES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profiles", response_model=PaginatedResponse[PaxProfileSummary])
async def list_profiles(
    search: str | None = None,
    status_filter: str | None = None,
    type_filter: str | None = None,
    company_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List PAX profiles for the current entity with company/user info."""
    query = (
        select(
            PaxProfile,
            Tier.name.label("company_name"),
            User.email.label("user_email"),
        )
        .outerjoin(Tier, Tier.id == PaxProfile.company_id)
        .outerjoin(User, User.id == PaxProfile.user_id)
        .where(PaxProfile.entity_id == entity_id, PaxProfile.archived == False)
    )
    if search:
        norm = _normalize_name(search)
        like = f"%{norm}%"
        query = query.where(
            PaxProfile.last_name_normalized.ilike(like)
            | PaxProfile.first_name_normalized.ilike(like)
            | PaxProfile.badge_number.ilike(f"%{search}%")
            | Tier.name.ilike(f"%{search}%")
        )
    if status_filter:
        query = query.where(PaxProfile.status == status_filter)
    if type_filter:
        query = query.where(PaxProfile.type == type_filter)
    if company_id:
        query = query.where(PaxProfile.company_id == company_id)
    query = query.order_by(PaxProfile.last_name, PaxProfile.first_name)

    # Custom paginate with row mapping (profile + joined fields)
    count_query = select(func.count()).select_from(
        query.with_only_columns(PaxProfile.id).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0
    offset = (pagination.page - 1) * pagination.page_size
    rows = (await db.execute(query.offset(offset).limit(pagination.page_size))).all()

    items = []
    for profile, comp_name, u_email in rows:
        d = PaxProfileSummary.model_validate(profile)
        d.company_name = comp_name
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.post("/profiles", response_model=PaxProfileRead, status_code=201)
async def create_profile(
    body: PaxProfileCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a PAX profile."""
    profile = PaxProfile(
        entity_id=entity_id,
        type=body.type,
        first_name=body.first_name,
        last_name=body.last_name,
        first_name_normalized=_normalize_name(body.first_name),
        last_name_normalized=_normalize_name(body.last_name),
        birth_date=body.birth_date,
        nationality=body.nationality,
        company_id=body.company_id,
        user_id=body.user_id,
        group_id=body.group_id,
        badge_number=body.badge_number,
    )
    profile.profile_completeness = _compute_completeness(profile)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    await record_audit(
        db,
        action="paxlog.profile.create",
        resource_type="pax_profile",
        resource_id=str(profile.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": f"{body.first_name} {body.last_name}", "type": body.type},
    )
    await db.commit()
    return profile


@router.get("/profiles/{profile_id}", response_model=PaxProfileRead)
async def get_profile(
    profile_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a PAX profile by ID with company/user info."""
    result = await db.execute(
        select(
            PaxProfile,
            Tier.name.label("company_name"),
            User.email.label("user_email"),
        )
        .outerjoin(Tier, Tier.id == PaxProfile.company_id)
        .outerjoin(User, User.id == PaxProfile.user_id)
        .where(
            PaxProfile.id == profile_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="PAX profile not found")
    profile, comp_name, u_email = row
    resp = PaxProfileRead.model_validate(profile)
    resp.company_name = comp_name
    resp.user_email = u_email
    return resp


@router.patch("/profiles/{profile_id}", response_model=PaxProfileRead)
async def update_profile(
    profile_id: UUID,
    body: PaxProfileUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update a PAX profile."""
    result = await db.execute(
        select(PaxProfile).where(
            PaxProfile.id == profile_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="PAX profile not found")

    if profile.synced_from_intranet:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce profil est synchronisé depuis l'intranet et ne peut pas être modifié manuellement.",
        )

    update_data = body.model_dump(exclude_unset=True)
    if "first_name" in update_data:
        update_data["first_name_normalized"] = _normalize_name(update_data["first_name"])
    if "last_name" in update_data:
        update_data["last_name_normalized"] = _normalize_name(update_data["last_name"])

    for field_name, value in update_data.items():
        setattr(profile, field_name, value)

    profile.profile_completeness = _compute_completeness(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


# ═══════════════════════════════════════════════════════════════════════════════
# CREDENTIAL TYPES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/credential-types", response_model=list[CredentialTypeRead])
async def list_credential_types(
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all credential types (global reference)."""
    query = select(CredentialType).where(CredentialType.active == True)
    if category:
        query = query.where(CredentialType.category == category)
    query = query.order_by(CredentialType.category, CredentialType.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/credential-types", response_model=CredentialTypeRead, status_code=201)
async def create_credential_type(
    body: CredentialTypeCreate,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credtype.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a credential type."""
    existing = await db.execute(
        select(CredentialType).where(CredentialType.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Credential type with code '{body.code}' already exists",
        )

    cred_type = CredentialType(
        code=body.code,
        name=body.name,
        category=body.category,
        has_expiry=body.has_expiry,
        validity_months=body.validity_months,
        proof_required=body.proof_required,
        booking_service_id=body.booking_service_id,
    )
    db.add(cred_type)
    await db.commit()
    await db.refresh(cred_type)
    return cred_type


# ═══════════════════════════════════════════════════════════════════════════════
# PAX CREDENTIALS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/profiles/{profile_id}/credentials",
    response_model=list[PaxCredentialRead],
)
async def list_credentials(
    profile_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List credentials for a PAX profile."""
    # Verify profile exists and belongs to entity
    pax_result = await db.execute(
        select(PaxProfile.id).where(
            PaxProfile.id == profile_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    if not pax_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="PAX profile not found")

    result = await db.execute(
        select(PaxCredential)
        .where(PaxCredential.pax_id == profile_id)
        .order_by(PaxCredential.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/profiles/{profile_id}/credentials",
    response_model=PaxCredentialRead,
    status_code=201,
)
async def create_credential(
    profile_id: UUID,
    body: PaxCredentialCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.create"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential to a PAX profile (status=pending_validation)."""
    pax_result = await db.execute(
        select(PaxProfile.id).where(
            PaxProfile.id == profile_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    if not pax_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="PAX profile not found")

    credential = PaxCredential(
        pax_id=profile_id,
        credential_type_id=body.credential_type_id,
        obtained_date=body.obtained_date,
        expiry_date=body.expiry_date,
        proof_url=body.proof_url,
        notes=body.notes,
        status="pending_validation",
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return credential


@router.patch(
    "/profiles/{profile_id}/credentials/{credential_id}/validate",
    response_model=PaxCredentialRead,
)
async def validate_credential(
    profile_id: UUID,
    credential_id: UUID,
    body: PaxCredentialValidate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a credential."""
    result = await db.execute(
        select(PaxCredential).where(
            PaxCredential.id == credential_id,
            PaxCredential.pax_id == profile_id,
        )
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    if body.action == "approve":
        credential.status = "valid"
    else:
        credential.status = "rejected"
        credential.rejection_reason = body.rejection_reason

    credential.validated_by = current_user.id
    credential.validated_at = func.now()
    await db.commit()
    await db.refresh(credential)
    return credential


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE MATRIX
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/compliance-matrix", response_model=list[ComplianceMatrixRead])
async def list_compliance_matrix(
    asset_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List compliance matrix entries for an entity."""
    query = select(ComplianceMatrixEntry).where(
        ComplianceMatrixEntry.entity_id == entity_id
    )
    if asset_id:
        query = query.where(ComplianceMatrixEntry.asset_id == asset_id)
    query = query.order_by(ComplianceMatrixEntry.effective_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/compliance-matrix",
    response_model=ComplianceMatrixRead,
    status_code=201,
)
async def create_compliance_entry(
    body: ComplianceMatrixCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a compliance requirement to the HSE matrix."""
    entry = ComplianceMatrixEntry(
        entity_id=entity_id,
        asset_id=body.asset_id,
        credential_type_id=body.credential_type_id,
        mandatory=body.mandatory,
        scope=body.scope,
        defined_by=body.defined_by,
        set_by=current_user.id,
        effective_date=body.effective_date or date.today(),
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/compliance-matrix/{entry_id}", status_code=204)
async def delete_compliance_entry(
    entry_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a compliance matrix entry."""
    result = await db.execute(
        select(ComplianceMatrixEntry).where(
            ComplianceMatrixEntry.id == entry_id,
            ComplianceMatrixEntry.entity_id == entity_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Compliance entry not found")
    await db.delete(entry)
    await db.commit()
    return None


@router.get(
    "/profiles/{profile_id}/compliance/{asset_id}",
    response_model=ComplianceCheckResult,
)
async def check_compliance(
    profile_id: UUID,
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check a PAX profile's compliance against a specific asset's requirements."""
    # Load profile
    pax_result = await db.execute(
        select(PaxProfile).where(
            PaxProfile.id == profile_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    profile = pax_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="PAX profile not found")

    # Load matrix requirements for this asset
    matrix_result = await db.execute(
        select(ComplianceMatrixEntry)
        .where(
            ComplianceMatrixEntry.entity_id == entity_id,
            ComplianceMatrixEntry.asset_id == asset_id,
            ComplianceMatrixEntry.mandatory == True,
        )
    )
    requirements = matrix_result.scalars().all()

    # Filter by scope
    filtered_reqs = []
    for req in requirements:
        if req.scope == "all_visitors":
            filtered_reqs.append(req)
        elif req.scope == "contractors_only" and profile.type == "external":
            filtered_reqs.append(req)
        elif req.scope == "permanent_staff_only" and profile.type == "internal":
            filtered_reqs.append(req)

    # Load PAX credentials
    creds_result = await db.execute(
        select(PaxCredential).where(PaxCredential.pax_id == profile_id)
    )
    credentials = {c.credential_type_id: c for c in creds_result.scalars().all()}

    # Check each requirement
    missing: list[str] = []
    expired: list[str] = []
    pending: list[str] = []

    for req in filtered_reqs:
        cred = credentials.get(req.credential_type_id)
        if not cred:
            # Load credential type name
            ct_result = await db.execute(
                select(CredentialType.name).where(CredentialType.id == req.credential_type_id)
            )
            ct_name = ct_result.scalar() or str(req.credential_type_id)
            missing.append(ct_name)
        elif cred.status == "expired" or (cred.expiry_date and cred.expiry_date < date.today()):
            ct_result = await db.execute(
                select(CredentialType.name).where(CredentialType.id == req.credential_type_id)
            )
            ct_name = ct_result.scalar() or str(req.credential_type_id)
            expired.append(ct_name)
        elif cred.status == "pending_validation":
            ct_result = await db.execute(
                select(CredentialType.name).where(CredentialType.id == req.credential_type_id)
            )
            ct_name = ct_result.scalar() or str(req.credential_type_id)
            pending.append(ct_name)

    return ComplianceCheckResult(
        pax_id=profile_id,
        asset_id=asset_id,
        compliant=len(missing) == 0 and len(expired) == 0,
        missing_credentials=missing,
        expired_credentials=expired,
        pending_credentials=pending,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# AVIS DE SÉJOUR (AdS)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads", response_model=PaginatedResponse[AdsSummary])
async def list_ads(
    status_filter: str | None = None,
    visit_category: str | None = None,
    site_asset_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Séjour for the current entity."""
    query = (
        select(Ads)
        .where(Ads.entity_id == entity_id, Ads.archived == False)
    )
    if status_filter:
        query = query.where(Ads.status == status_filter)
    if visit_category:
        query = query.where(Ads.visit_category == visit_category)
    if site_asset_id:
        query = query.where(Ads.site_entry_asset_id == site_asset_id)
    query = query.order_by(Ads.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/ads", response_model=AdsRead, status_code=201)
async def create_ads(
    body: AdsCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create an Avis de Séjour (draft)."""
    reference = await generate_reference("ADS", db, entity_id=entity_id)

    ads = Ads(
        entity_id=entity_id,
        reference=reference,
        type=body.type,
        status="draft",
        requester_id=current_user.id,
        site_entry_asset_id=body.site_entry_asset_id,
        visit_purpose=body.visit_purpose,
        visit_category=body.visit_category,
        start_date=body.start_date,
        end_date=body.end_date,
        outbound_transport_mode=body.outbound_transport_mode,
        outbound_departure_base_id=body.outbound_departure_base_id,
        outbound_notes=body.outbound_notes,
        return_transport_mode=body.return_transport_mode,
        return_departure_base_id=body.return_departure_base_id,
        return_notes=body.return_notes,
    )
    db.add(ads)
    await db.flush()

    # Add PAX entries
    for pax_id in body.pax_ids:
        ads_pax = AdsPax(ads_id=ads.id, pax_id=pax_id, status="pending_check")
        db.add(ads_pax)

    await db.commit()
    await db.refresh(ads)

    await record_audit(
        db,
        action="paxlog.ads.create",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": reference,
            "type": body.type,
            "site_asset_id": str(body.site_entry_asset_id),
            "dates": f"{body.start_date} → {body.end_date}",
            "pax_count": len(body.pax_ids),
        },
    )
    await db.commit()

    logger.info("AdS %s created by %s", reference, current_user.id)
    return ads


@router.get("/ads/{ads_id}", response_model=AdsRead)
async def get_ads(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get an AdS by ID."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    return ads


@router.patch("/ads/{ads_id}", response_model=AdsRead)
async def update_ads(
    ads_id: UUID,
    body: AdsUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AdS (draft only)."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if ads.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les brouillons peuvent être modifiés.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(ads, field_name, value)

    await db.commit()
    await db.refresh(ads)
    return ads


@router.post("/ads/{ads_id}/submit", response_model=AdsRead)
async def submit_ads(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.create"),
    db: AsyncSession = Depends(get_db),
):
    """Submit an AdS for validation (draft → submitted)."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de soumettre un AdS avec le statut '{ads.status}'.",
        )

    # Check at least 1 PAX
    pax_count_result = await db.execute(
        select(func.count(AdsPax.id)).where(AdsPax.ads_id == ads_id)
    )
    pax_count = pax_count_result.scalar() or 0
    if pax_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'AdS doit contenir au moins un PAX.",
        )

    ads.status = "submitted"
    ads.submitted_at = func.now()
    await db.commit()
    await db.refresh(ads)

    await record_audit(
        db,
        action="paxlog.ads.submit",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference, "pax_count": pax_count},
    )
    await db.commit()

    logger.info("AdS %s submitted by %s", ads.reference, current_user.id)
    return ads


@router.post("/ads/{ads_id}/cancel", response_model=AdsRead)
async def cancel_ads(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an AdS."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible d'annuler un AdS avec le statut '{ads.status}'.",
        )

    ads.status = "cancelled"
    await db.commit()
    await db.refresh(ads)
    return ads


# ═══════════════════════════════════════════════════════════════════════════════
# AdS PAX ENTRIES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/{ads_id}/pax", response_model=list[dict])
async def list_ads_pax(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List PAX entries for an AdS with profile details."""
    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    result = await db.execute(
        select(AdsPax, PaxProfile)
        .join(PaxProfile, PaxProfile.id == AdsPax.pax_id)
        .where(AdsPax.ads_id == ads_id)
        .order_by(PaxProfile.last_name, PaxProfile.first_name)
    )
    rows = result.all()
    return [
        {
            "id": str(ads_pax.id),
            "ads_id": str(ads_pax.ads_id),
            "pax_id": str(ads_pax.pax_id),
            "status": ads_pax.status,
            "compliance_summary": ads_pax.compliance_summary,
            "priority_score": ads_pax.priority_score,
            "pax_first_name": profile.first_name,
            "pax_last_name": profile.last_name,
            "pax_company_id": str(profile.company_id) if profile.company_id else None,
            "pax_badge": profile.badge_number,
            "pax_type": profile.type,
        }
        for ads_pax, profile in rows
    ]


@router.post("/ads/{ads_id}/pax/{pax_id}", status_code=201)
async def add_pax_to_ads(
    ads_id: UUID,
    pax_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a PAX to an AdS."""
    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if ads.status not in ("draft", "requires_review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PAX can only be added to draft or review-pending AdS.",
        )

    entry = AdsPax(ads_id=ads_id, pax_id=pax_id, status="pending_check")
    db.add(entry)
    await db.commit()
    return {"status": "added"}


@router.delete("/ads/{ads_id}/pax/{pax_id}", status_code=204)
async def remove_pax_from_ads(
    ads_id: UUID,
    pax_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a PAX from an AdS."""
    result = await db.execute(
        select(AdsPax).where(
            AdsPax.ads_id == ads_id,
            AdsPax.pax_id == pax_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="PAX entry not found in this AdS")
    await db.delete(entry)
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# PAX INCIDENTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/incidents", response_model=PaginatedResponse[PaxIncidentRead])
async def list_incidents(
    pax_id: UUID | None = None,
    active_only: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List PAX incidents."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)
    if pax_id:
        query = query.where(PaxIncident.pax_id == pax_id)
    if active_only:
        query = query.where(PaxIncident.resolved_at == None)
    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/incidents", response_model=PaxIncidentRead, status_code=201)
async def create_incident(
    body: PaxIncidentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Record a PAX incident."""
    incident = PaxIncident(
        entity_id=entity_id,
        pax_id=body.pax_id,
        company_id=body.company_id,
        asset_id=body.asset_id,
        severity=body.severity,
        description=body.description,
        incident_date=body.incident_date,
        ban_start_date=body.ban_start_date,
        ban_end_date=body.ban_end_date,
        recorded_by=current_user.id,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)

    await record_audit(
        db,
        action="paxlog.incident.create",
        resource_type="pax_incident",
        resource_id=str(incident.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": body.severity,
            "pax_id": str(body.pax_id) if body.pax_id else None,
        },
    )
    await db.commit()

    logger.info("PAX incident created (%s) by %s", body.severity, current_user.id)
    return incident


@router.patch("/incidents/{incident_id}/resolve", response_model=PaxIncidentRead)
async def resolve_incident(
    incident_id: UUID,
    body: PaxIncidentResolve,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve an active PAX incident."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == incident_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet incident est déjà résolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = body.resolution_notes
    await db.commit()
    await db.refresh(incident)
    return incident
