"""PaxLog API routes — PAX profiles, credentials, compliance, AdS, incidents.

Integrates with:
- Compliance Matrix: auto-checks PAX credentials on AdS submit
- Planner: links AdS to planner activities via planner_activity_id
- TravelWiz: emits ads.approved event for auto-manifest creation
- Workflow Engine: FSM service manages AdS status transitions (D-014)
"""

import logging
import unicodedata
import re
from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.references import generate_reference
from app.models.common import Tier, TierContact, User
from app.models.paxlog import (
    Ads,
    AdsEvent,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    MissionStakeholder,
    PaxCredential,
    PaxGroup,
    PaxIncident,
)
from app.schemas.paxlog import (
    AdsCreate,
    AdsEventRead,
    AdsPaxEntry,
    AdsRead,
    AdsSummary,
    AdsUpdate,
    ComplianceCheckResult,
    ComplianceMatrixCreate,
    ComplianceMatrixRead,
    CredentialTypeCreate,
    CredentialTypeRead,
    MissionNoticeCreate,
    MissionNoticeRead,
    MissionNoticeSummary,
    MissionNoticeUpdate,
    MissionPreparationTaskRead,
    MissionProgramRead,
    PaxCredentialCreate,
    PaxCredentialRead,
    PaxCredentialValidate,
    PaxIncidentCreate,
    PaxIncidentRead,
    PaxIncidentResolve,
    PaxProfileRead,
    PaxProfileSummary,
    PaxProfileUpdate,
)
from app.schemas.common import PaginatedResponse
from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError

router = APIRouter(prefix="/api/v1/pax", tags=["paxlog"])
logger = logging.getLogger(__name__)

ADS_WORKFLOW_SLUG = "ads-workflow"
ADS_ENTITY_TYPE = "ads"


async def _try_ads_workflow_transition(
    db: AsyncSession,
    *,
    entity_id_str: str,
    to_state: str,
    actor_id: UUID,
    entity_id_scope: UUID,
    comment: str | None = None,
) -> tuple[str | None, object | None]:
    """Attempt FSM transition for an AdS.

    Returns (current_state, instance) if workflow definition exists.
    Returns (None, None) if no definition found (graceful fallback).
    Raises HTTPException on permission errors.
    """
    try:
        instance = await fsm_service.transition(
            db,
            workflow_slug=ADS_WORKFLOW_SLUG,
            entity_type=ADS_ENTITY_TYPE,
            entity_id=entity_id_str,
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
            entity_id_scope=entity_id_scope,
        )
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        if "not found" in str(e).lower():
            logger.debug(
                "No workflow definition '%s' found — direct status update",
                ADS_WORKFLOW_SLUG,
            )
            return None, None
        raise HTTPException(400, str(e))


def _normalize_name(name: str) -> str:
    """Normalize a name for fuzzy search: lowercase, no accents, no hyphens."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9 ]", "", ascii_str.lower()).strip()


def _compute_completeness(
    entity: User | TierContact,
    has_credentials: bool = False,
) -> int:
    """Calculate PAX profile completeness as a percentage (0-100).

    Works for both User and TierContact objects.
    Weights: first_name 15%, last_name 15%, birth_date 15%, nationality 15%,
    badge_number 15%, pax_group_id 10%, at least 1 credential 15%.
    """
    score = 0
    if getattr(entity, "first_name", None):
        score += 15
    if getattr(entity, "last_name", None):
        score += 15
    if getattr(entity, "birth_date", None):
        score += 15
    if getattr(entity, "nationality", None):
        score += 15
    if getattr(entity, "badge_number", None):
        score += 15
    if getattr(entity, "pax_group_id", None):
        score += 10
    if has_credentials:
        score += 15
    return min(score, 100)


def _user_to_pax_summary(u: User, company_name: str | None = None) -> PaxProfileSummary:
    """Build a PaxProfileSummary from a User row."""
    return PaxProfileSummary(
        id=u.id,
        pax_source="user",
        entity_id=u.default_entity_id,
        pax_type=u.pax_type,
        first_name=u.first_name,
        last_name=u.last_name,
        company_id=None,
        company_name=company_name,
        badge_number=u.badge_number,
        active=u.active,
        created_at=u.created_at,
    )


def _contact_to_pax_summary(c: TierContact, company_name: str | None = None) -> PaxProfileSummary:
    """Build a PaxProfileSummary from a TierContact row."""
    return PaxProfileSummary(
        id=c.id,
        pax_source="contact",
        entity_id=None,
        pax_type="external",
        first_name=c.first_name,
        last_name=c.last_name,
        company_id=c.tier_id,
        company_name=company_name,
        badge_number=c.badge_number,
        active=c.active,
        created_at=c.created_at,
    )


def _user_to_pax_read(u: User, company_name: str | None = None) -> PaxProfileRead:
    """Build a PaxProfileRead from a User row."""
    return PaxProfileRead(
        id=u.id,
        pax_source="user",
        entity_id=u.default_entity_id,
        pax_type=u.pax_type,
        first_name=u.first_name,
        last_name=u.last_name,
        birth_date=u.birth_date,
        nationality=u.nationality,
        company_id=None,
        company_name=company_name,
        group_id=u.pax_group_id,
        badge_number=u.badge_number,
        photo_url=u.avatar_url,
        email=u.email,
        active=u.active,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


def _contact_to_pax_read(c: TierContact, company_name: str | None = None) -> PaxProfileRead:
    """Build a PaxProfileRead from a TierContact row."""
    return PaxProfileRead(
        id=c.id,
        pax_source="contact",
        entity_id=None,
        pax_type="external",
        first_name=c.first_name,
        last_name=c.last_name,
        birth_date=c.birth_date,
        nationality=c.nationality,
        company_id=c.tier_id,
        company_name=company_name,
        group_id=c.pax_group_id,
        badge_number=c.badge_number,
        photo_url=c.photo_url,
        email=c.email,
        active=c.active,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def _resolve_pax_identity(
    db: AsyncSession,
    profile_id: UUID,
    pax_source: str,
) -> tuple[User | TierContact, str | None]:
    """Resolve a PAX entity (User or TierContact) by id and source.

    Returns (entity, company_name) or raises 404.
    """
    if pax_source == "user":
        result = await db.execute(select(User).where(User.id == profile_id))
        entity = result.scalar_one_or_none()
        if not entity:
            raise HTTPException(status_code=404, detail="PAX user not found")
        return entity, None
    elif pax_source == "contact":
        result = await db.execute(
            select(TierContact, Tier.name.label("company_name"))
            .outerjoin(Tier, Tier.id == TierContact.tier_id)
            .where(TierContact.id == profile_id)
        )
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="PAX contact not found")
        return row[0], row[1]
    else:
        raise HTTPException(status_code=400, detail="pax_source must be 'user' or 'contact'")


# ═══════════════════════════════════════════════════════════════════════════════
# PAX PROFILES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profiles", response_model=PaginatedResponse[PaxProfileSummary])
async def list_profiles(
    search: str | None = None,
    type_filter: str | None = None,
    company_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List PAX profiles — virtual UNION of Users + TierContacts."""
    like = f"%{search}%" if search else None
    items: list[PaxProfileSummary] = []

    # ── 1. Internal PAX (Users belonging to this entity) ──
    if type_filter in (None, "internal"):
        user_q = (
            select(User)
            .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
        )
        if like:
            user_q = user_q.where(
                User.first_name.ilike(like)
                | User.last_name.ilike(like)
                | User.badge_number.ilike(like)
                | User.email.ilike(like)
            )
        user_q = user_q.order_by(User.last_name, User.first_name)
        user_rows = (await db.execute(user_q)).scalars().all()
        for u in user_rows:
            items.append(_user_to_pax_summary(u))

    # ── 2. External PAX (TierContacts linked to entity's Tiers) ──
    if type_filter in (None, "external"):
        contact_q = (
            select(TierContact, Tier.name.label("company_name"))
            .join(Tier, Tier.id == TierContact.tier_id)
            .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
        )
        if like:
            contact_q = contact_q.where(
                TierContact.first_name.ilike(like)
                | TierContact.last_name.ilike(like)
                | TierContact.badge_number.ilike(like)
                | Tier.name.ilike(like)
            )
        if company_id:
            contact_q = contact_q.where(TierContact.tier_id == company_id)
        contact_q = contact_q.order_by(TierContact.last_name, TierContact.first_name)
        contact_rows = (await db.execute(contact_q)).all()
        for c, comp_name in contact_rows:
            items.append(_contact_to_pax_summary(c, comp_name))

    # ── Sort combined results by last_name, first_name ──
    items.sort(key=lambda x: (x.last_name.lower(), x.first_name.lower()))

    # ── Manual pagination ──
    total = len(items)
    offset = (pagination.page - 1) * pagination.page_size
    page_items = items[offset : offset + pagination.page_size]

    return {
        "items": page_items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


class _ExternalPaxCreate(BaseModel):
    """Body to create an external PAX (TierContact)."""
    first_name: str
    last_name: str
    company_id: UUID
    birth_date: date | None = None
    nationality: str | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    pax_group_id: UUID | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None


@router.post("/profiles", response_model=PaxProfileRead, status_code=201)
async def create_profile(
    body: _ExternalPaxCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create an external PAX (TierContact). Internal PAX are created via user management."""
    # ── Duplicate detection ──
    fn_norm = _normalize_name(body.first_name)
    ln_norm = _normalize_name(body.last_name)

    dup_query = (
        select(TierContact.id, TierContact.first_name, TierContact.last_name, TierContact.badge_number)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    dup_result = await db.execute(dup_query)
    duplicates = [
        d for d in dup_result.all()
        if _normalize_name(d.first_name) == fn_norm and _normalize_name(d.last_name) == ln_norm
    ]

    if duplicates:
        dup_info = [
            {"id": str(d.id), "name": f"{d.first_name} {d.last_name}", "badge": d.badge_number}
            for d in duplicates
        ]
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUPLICATE_PAX_PROFILE",
                "message": f"Un contact PAX similaire existe déjà ({len(duplicates)} doublon(s) détecté(s)).",
                "duplicates": dup_info,
            },
        )

    contact = TierContact(
        tier_id=body.company_id,
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        nationality=body.nationality,
        badge_number=body.badge_number,
        photo_url=body.photo_url,
        pax_group_id=body.pax_group_id,
        email=body.email,
        phone=body.phone,
        position=body.position,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)

    # Fetch company name
    tier_result = await db.execute(select(Tier.name).where(Tier.id == body.company_id))
    company_name = tier_result.scalar()

    await record_audit(
        db,
        action="paxlog.profile.create",
        resource_type="tier_contact",
        resource_id=str(contact.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": f"{body.first_name} {body.last_name}", "type": "external"},
    )
    await db.commit()
    return _contact_to_pax_read(contact, company_name)


@router.post("/profiles/check-duplicates")
async def check_profile_duplicates(
    first_name: str,
    last_name: str,
    birth_date: date | None = None,
    badge_number: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check for potential duplicate PAX (Users + TierContacts) before creation.

    Returns a list of similar profiles so the frontend can warn the user.
    """
    fn_norm = _normalize_name(first_name)
    ln_norm = _normalize_name(last_name)
    matches: list[dict] = []

    # ── Users with matching names ──
    user_q = (
        select(User.id, User.first_name, User.last_name, User.birth_date, User.badge_number)
        .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
    )
    user_rows = (await db.execute(user_q)).all()
    for r in user_rows:
        if _normalize_name(r.first_name) == fn_norm and _normalize_name(r.last_name) == ln_norm:
            matches.append({
                "id": str(r.id),
                "first_name": r.first_name,
                "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number,
                "pax_source": "user",
                "match_type": "name_exact",
            })

    # ── TierContacts with matching names ──
    contact_q = (
        select(TierContact.id, TierContact.first_name, TierContact.last_name,
               TierContact.birth_date, TierContact.badge_number)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    contact_rows = (await db.execute(contact_q)).all()
    for r in contact_rows:
        if _normalize_name(r.first_name) == fn_norm and _normalize_name(r.last_name) == ln_norm:
            matches.append({
                "id": str(r.id),
                "first_name": r.first_name,
                "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number,
                "pax_source": "contact",
                "match_type": "name_exact",
            })

    # ── Badge number match (if provided and no name match found) ──
    if badge_number and not matches:
        badge_user_q = (
            select(User.id, User.first_name, User.last_name, User.birth_date, User.badge_number)
            .where(
                User.default_entity_id == entity_id,
                User.badge_number == badge_number,
                User.active == True,  # noqa: E712
            )
        )
        for r in (await db.execute(badge_user_q)).all():
            matches.append({
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number, "pax_source": "user", "match_type": "badge_number",
            })

        badge_contact_q = (
            select(TierContact.id, TierContact.first_name, TierContact.last_name,
                   TierContact.birth_date, TierContact.badge_number)
            .join(Tier, Tier.id == TierContact.tier_id)
            .where(
                Tier.entity_id == entity_id,
                TierContact.badge_number == badge_number,
                TierContact.active == True,  # noqa: E712
            )
        )
        for r in (await db.execute(badge_contact_q)).all():
            matches.append({
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number, "pax_source": "contact", "match_type": "badge_number",
            })

    return {"has_duplicates": len(matches) > 0, "matches": matches}


@router.get("/profiles/{profile_id}", response_model=PaxProfileRead)
async def get_profile(
    profile_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a PAX profile by ID. Use pax_source=user or pax_source=contact."""
    entity, company_name = await _resolve_pax_identity(db, profile_id, pax_source)
    if pax_source == "user":
        return _user_to_pax_read(entity, company_name)  # type: ignore[arg-type]
    return _contact_to_pax_read(entity, company_name)  # type: ignore[arg-type]


@router.patch("/profiles/{profile_id}", response_model=PaxProfileRead)
async def update_profile(
    profile_id: UUID,
    body: PaxProfileUpdate,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update PAX-specific fields on a User or TierContact."""
    entity, company_name = await _resolve_pax_identity(db, profile_id, pax_source)

    update_data = body.model_dump(exclude_unset=True)
    # Map PaxProfileUpdate fields to entity fields
    field_mapping = {
        "birth_date": "birth_date",
        "nationality": "nationality",
        "badge_number": "badge_number",
        "photo_url": "photo_url" if pax_source == "contact" else "avatar_url",
        "pax_group_id": "pax_group_id",
    }
    for schema_field, model_field in field_mapping.items():
        if schema_field in update_data:
            setattr(entity, model_field, update_data[schema_field])

    await db.commit()
    await db.refresh(entity)

    if pax_source == "user":
        return _user_to_pax_read(entity, company_name)  # type: ignore[arg-type]
    return _contact_to_pax_read(entity, company_name)  # type: ignore[arg-type]


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


def _cred_pax_filter(profile_id: UUID, pax_source: str):
    """Return an or_() filter for PaxCredential matching user_id or contact_id."""
    if pax_source == "user":
        return PaxCredential.user_id == profile_id
    return PaxCredential.contact_id == profile_id


@router.get(
    "/profiles/{profile_id}/credentials",
    response_model=list[PaxCredentialRead],
)
async def list_credentials(
    profile_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List credentials for a PAX (user or contact)."""
    result = await db.execute(
        select(PaxCredential)
        .where(_cred_pax_filter(profile_id, pax_source))
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
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.create"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential to a PAX (status=pending_validation)."""
    credential = PaxCredential(
        user_id=profile_id if pax_source == "user" else None,
        contact_id=profile_id if pax_source == "contact" else None,
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
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a credential."""
    result = await db.execute(
        select(PaxCredential).where(
            PaxCredential.id == credential_id,
            _cred_pax_filter(profile_id, pax_source),
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
    # Junction record — physical delete (not policy-managed)
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
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check a PAX's compliance against a specific asset's requirements."""
    # Determine pax_type for scope filtering
    if pax_source == "user":
        u_result = await db.execute(select(User).where(User.id == profile_id))
        pax_entity = u_result.scalar_one_or_none()
        if not pax_entity:
            raise HTTPException(status_code=404, detail="PAX user not found")
        pax_type = pax_entity.pax_type
    else:
        c_result = await db.execute(select(TierContact).where(TierContact.id == profile_id))
        pax_entity = c_result.scalar_one_or_none()
        if not pax_entity:
            raise HTTPException(status_code=404, detail="PAX contact not found")
        pax_type = "external"

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
        elif req.scope == "contractors_only" and pax_type == "external":
            filtered_reqs.append(req)
        elif req.scope == "permanent_staff_only" and pax_type == "internal":
            filtered_reqs.append(req)

    # Load PAX credentials
    creds_result = await db.execute(
        select(PaxCredential).where(_cred_pax_filter(profile_id, pax_source))
    )
    credentials = {c.credential_type_id: c for c in creds_result.scalars().all()}

    # Check each requirement
    missing: list[str] = []
    expired: list[str] = []
    pending: list[str] = []

    for req in filtered_reqs:
        cred = credentials.get(req.credential_type_id)
        if not cred:
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
        user_id=profile_id if pax_source == "user" else None,
        contact_id=profile_id if pax_source == "contact" else None,
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
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Séjour for the current entity.

    Scope parameter controls data visibility:
      - scope=my  → only ADS where requester_id == current user
      - scope=all → all ADS in the entity (requires paxlog.ads.read_all)
      - omitted   → auto-detected: if user has read_all → all, else → my
    """
    query = (
        select(Ads)
        .where(Ads.entity_id == entity_id, Ads.archived == False)
    )

    # ── User-scoped data visibility ──
    if scope == "my":
        query = query.where(Ads.requester_id == current_user.id)
    elif scope == "all":
        # Explicit "all" requires read_all permission
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.ads.read_all", db
        )
        if not can_read_all:
            query = query.where(Ads.requester_id == current_user.id)
    else:
        # Auto-detect: default to own data unless user has read_all
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.ads.read_all", db
        )
        if not can_read_all:
            query = query.where(Ads.requester_id == current_user.id)

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
        planner_activity_id=body.planner_activity_id,
        project_id=body.project_id,
        outbound_transport_mode=body.outbound_transport_mode,
        outbound_departure_base_id=body.outbound_departure_base_id,
        outbound_notes=body.outbound_notes,
        return_transport_mode=body.return_transport_mode,
        return_departure_base_id=body.return_departure_base_id,
        return_notes=body.return_notes,
    )
    db.add(ads)
    await db.flush()

    # Add PAX entries (dual FK: user_id or contact_id)
    for entry in body.pax_entries:
        ads_pax = AdsPax(
            ads_id=ads.id,
            user_id=entry.user_id,
            contact_id=entry.contact_id,
            status="pending_check",
        )
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
            "pax_count": len(body.pax_entries),
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
    """Submit an AdS for validation.

    Runs automatic compliance check against site's compliance matrix.
    - If any PAX has missing/expired mandatory credentials → pending_compliance
    - If all PAX are compliant → pending_validation (ready for CDS review)
    """
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
    pax_entries_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    pax_entries = pax_entries_result.scalars().all()
    if len(pax_entries) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'AdS doit contenir au moins un PAX.",
        )

    # ── Automatic compliance check against site's matrix ─────────────────
    from datetime import date as date_type
    matrix_result = await db.execute(
        select(ComplianceMatrixEntry).where(
            ComplianceMatrixEntry.entity_id == entity_id,
            ComplianceMatrixEntry.asset_id == ads.site_entry_asset_id,
            ComplianceMatrixEntry.mandatory == True,
        )
    )
    requirements = matrix_result.scalars().all()

    has_compliance_issues = False
    for pax_entry in pax_entries:
        # Determine PAX type for scope filtering
        if pax_entry.user_id:
            u = await db.get(User, pax_entry.user_id)
            pax_type = u.pax_type if u else "internal"
            cred_filter = PaxCredential.user_id == pax_entry.user_id
        elif pax_entry.contact_id:
            pax_type = "external"
            cred_filter = PaxCredential.contact_id == pax_entry.contact_id
        else:
            continue

        # Filter requirements by scope
        applicable_reqs = []
        for req in requirements:
            if req.scope == "all_visitors":
                applicable_reqs.append(req)
            elif req.scope == "contractors_only" and pax_type == "external":
                applicable_reqs.append(req)
            elif req.scope == "permanent_staff_only" and pax_type == "internal":
                applicable_reqs.append(req)

        # Load PAX credentials
        creds_result = await db.execute(
            select(PaxCredential).where(cred_filter)
        )
        credentials = {c.credential_type_id: c for c in creds_result.scalars().all()}

        # Check each requirement
        missing = []
        expired = []
        for req in applicable_reqs:
            cred = credentials.get(req.credential_type_id)
            if not cred:
                ct = await db.get(CredentialType, req.credential_type_id)
                missing.append(ct.name if ct else str(req.credential_type_id))
            elif cred.status == "expired" or (cred.expiry_date and cred.expiry_date < date_type.today()):
                ct = await db.get(CredentialType, req.credential_type_id)
                expired.append(ct.name if ct else str(req.credential_type_id))
            elif cred.expiry_date and cred.expiry_date < ads.end_date:
                ct = await db.get(CredentialType, req.credential_type_id)
                expired.append(f"{ct.name if ct else ''} (expire pendant le séjour)")

        # Update PAX entry compliance
        pax_entry.compliance_checked_at = func.now()
        pax_entry.compliance_summary = {
            "missing": missing,
            "expired": expired,
            "compliant": len(missing) == 0 and len(expired) == 0,
        }
        if len(missing) > 0 or len(expired) > 0:
            pax_entry.status = "blocked"
            has_compliance_issues = True
        else:
            pax_entry.status = "compliant"

    # Set AdS status based on compliance check
    target_status = "pending_compliance" if has_compliance_issues else "pending_validation"

    # FSM transition: draft → pending_compliance or pending_validation
    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state=target_status,
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    ads.status = target_status
    ads.submitted_at = func.now()

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="submitted",
        old_status=from_state,
        new_status=target_status,
        actor_id=current_user.id,
    ))

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state=target_status,
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={
            "reference": ads.reference,
            "compliance_issues": has_compliance_issues,
        },
    )

    await record_audit(
        db,
        action="paxlog.ads.submit",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": ads.reference,
            "pax_count": len(pax_entries),
            "compliance_issues": has_compliance_issues,
        },
    )
    await db.commit()

    # Emit module-level events AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus

    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.submitted",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "site_name": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "pax_count": len(pax_entries),
        },
    ))

    if has_compliance_issues:
        # Count blocked PAX
        blocked_count = sum(
            1 for p in pax_entries
            if p.status == "blocked"
        )
        await _event_bus.publish(OpsFluxEvent(
            event_type="ads.compliance_failed",
            payload={
                "ads_id": str(ads.id),
                "entity_id": str(entity_id),
                "reference": ads.reference,
                "requester_id": str(ads.requester_id),
                "blocked_pax_count": blocked_count,
                "total_pax_count": len(pax_entries),
                "issues_summary": "",
            },
        ))

    logger.info(
        "AdS %s submitted by %s (compliance: %s)",
        ads.reference, current_user.id,
        "issues" if has_compliance_issues else "ok",
    )
    return ads


@router.post("/ads/{ads_id}/approve", response_model=AdsRead)
async def approve_ads(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Approve an AdS (pending_validation → approved).

    Emits ads.approved event which triggers TravelWiz auto-manifest.
    """
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status not in ("pending_validation", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible d'approuver un AdS avec le statut '{ads.status}'.",
        )

    # Mark all compliant PAX as approved
    pax_result = await db.execute(
        select(AdsPax).where(
            AdsPax.ads_id == ads_id,
            AdsPax.status.in_(["compliant", "pending_check"]),
        )
    )
    pax_entries = pax_result.scalars().all()
    for entry in pax_entries:
        entry.status = "approved"

    # FSM transition: pending_validation → approved
    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="approved",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    ads.status = "approved"
    ads.approved_at = func.now()

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="approved",
        old_status=from_state,
        new_status="approved",
        actor_id=current_user.id,
    ))

    await db.commit()
    await db.refresh(ads)

    # FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="approved",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"reference": ads.reference},
    )

    await record_audit(
        db,
        action="paxlog.ads.approve",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference, "approved_pax": len(pax_entries)},
    )
    await db.commit()

    # Emit module-level event AFTER commit → triggers TravelWiz auto-manifest
    from app.core.events import OpsFluxEvent, event_bus
    await event_bus.publish(OpsFluxEvent(
        event_type="ads.approved",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "site_asset_id": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "outbound_transport_mode": ads.outbound_transport_mode,
            "outbound_departure_base_id": str(ads.outbound_departure_base_id) if ads.outbound_departure_base_id else None,
            "requester_id": str(ads.requester_id),
            "reference": ads.reference,
        },
    ))

    logger.info("AdS %s approved by %s", ads.reference, current_user.id)
    return ads


@router.post("/ads/{ads_id}/reject", response_model=AdsRead)
async def reject_ads(
    ads_id: UUID,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Reject an AdS."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status in ("cancelled", "completed", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de rejeter un AdS avec le statut '{ads.status}'.",
        )

    # Mark all PAX as rejected
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    for entry in pax_result.scalars().all():
        entry.status = "rejected"

    # FSM transition: * → rejected
    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="rejected",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        comment=reason,
    )

    ads.status = "rejected"
    ads.rejected_at = func.now()
    ads.rejection_reason = reason

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="rejected",
        old_status=from_state,
        new_status="rejected",
        actor_id=current_user.id,
        reason=reason,
    ))

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="rejected",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"rejection_reason": reason},
    )

    # Emit module-level event AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.rejected",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "rejection_reason": reason or "",
        },
    ))

    logger.info("AdS %s rejected by %s", ads.reference, current_user.id)
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

    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="cancelled",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    ads.status = "cancelled"

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="cancelled",
        old_status=from_state,
        new_status="cancelled",
        actor_id=current_user.id,
    ))

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="cancelled",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
    )

    # Emit module-level event AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.cancelled",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "site_name": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
        },
    ))

    return ads


@router.get("/ads/{ads_id}/events", response_model=list[AdsEventRead])
async def list_ads_events(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("paxlog.ads.read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AdsEvent).where(
            AdsEvent.ads_id == ads_id,
            AdsEvent.entity_id == entity_id,
        ).order_by(AdsEvent.recorded_at.desc())
    )
    return result.scalars().all()


@router.post("/ads/{ads_id}/resubmit", response_model=AdsRead)
async def resubmit_ads(
    ads_id: UUID,
    reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Resubmit an AdS after requires_review — motif obligatoire."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if ads.status != "requires_review":
        raise HTTPException(status_code=400, detail=f"Cannot resubmit AdS with status '{ads.status}'")

    old_status = ads.status
    ads.status = "submitted"

    # Log event
    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="resubmitted",
        old_status=old_status,
        new_status="submitted",
        actor_id=current_user.id,
        reason=reason,
    ))

    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="submitted",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )
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
    """List PAX entries for an AdS with profile details (User + TierContact)."""
    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    entries = pax_result.scalars().all()

    items = []
    for ads_pax in entries:
        if ads_pax.user_id:
            u = await db.get(User, ads_pax.user_id)
            items.append({
                "id": str(ads_pax.id),
                "ads_id": str(ads_pax.ads_id),
                "user_id": str(ads_pax.user_id),
                "contact_id": None,
                "pax_source": "user",
                "status": ads_pax.status,
                "compliance_summary": ads_pax.compliance_summary,
                "priority_score": ads_pax.priority_score,
                "pax_first_name": u.first_name if u else "?",
                "pax_last_name": u.last_name if u else "?",
                "pax_company_id": None,
                "pax_badge": u.badge_number if u else None,
                "pax_type": u.pax_type if u else "internal",
            })
        elif ads_pax.contact_id:
            c = await db.get(TierContact, ads_pax.contact_id)
            items.append({
                "id": str(ads_pax.id),
                "ads_id": str(ads_pax.ads_id),
                "user_id": None,
                "contact_id": str(ads_pax.contact_id),
                "pax_source": "contact",
                "status": ads_pax.status,
                "compliance_summary": ads_pax.compliance_summary,
                "priority_score": ads_pax.priority_score,
                "pax_first_name": c.first_name if c else "?",
                "pax_last_name": c.last_name if c else "?",
                "pax_company_id": str(c.tier_id) if c else None,
                "pax_badge": c.badge_number if c else None,
                "pax_type": "external",
            })

    # Sort by last_name, first_name
    items.sort(key=lambda x: (x["pax_last_name"].lower(), x["pax_first_name"].lower()))
    return items


class AddPaxBody(BaseModel):
    """Body to add a PAX to an AdS. Provide exactly one of user_id or contact_id."""
    user_id: UUID | None = None
    contact_id: UUID | None = None


@router.get("/candidates")
async def search_pax_candidates(
    search: str = Query("", min_length=0),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Search for PAX candidates: Users + TierContacts.

    Returns a unified list for the PAX picker in the AdS detail panel.
    """
    candidates = []
    like = f"%{search}%"

    # 1. Users (internal PAX)
    user_q = select(User).where(User.active == True)  # noqa: E712
    if search:
        user_q = user_q.where(
            or_(
                User.first_name.ilike(like),
                User.last_name.ilike(like),
                User.email.ilike(like),
                User.badge_number.ilike(like),
            )
        )
    user_result = await db.execute(user_q.limit(15))
    for u in user_result.scalars().all():
        candidates.append({
            "id": str(u.id),
            "source": "user",
            "user_id": str(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "type": u.pax_type,
            "badge": u.badge_number,
            "company_id": None,
            "email": u.email,
        })

    # 2. Tier contacts (external PAX)
    contact_q = select(TierContact).where(TierContact.active == True)  # noqa: E712
    if search:
        contact_q = contact_q.where(
            or_(
                TierContact.first_name.ilike(like),
                TierContact.last_name.ilike(like),
                TierContact.email.ilike(like),
                TierContact.badge_number.ilike(like),
            )
        )
    contact_result = await db.execute(contact_q.limit(15))
    for c in contact_result.scalars().all():
        candidates.append({
            "id": str(c.id),
            "source": "contact",
            "contact_id": str(c.id),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "type": "external",
            "badge": c.badge_number,
            "company_id": str(c.tier_id) if c.tier_id else None,
            "position": c.position,
        })

    return candidates[:30]


@router.post("/ads/{ads_id}/add-pax", status_code=201)
async def add_pax_to_ads(
    ads_id: UUID,
    body: AddPaxBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a PAX to an AdS. Provide exactly one of user_id or contact_id."""
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

    if not body.user_id and not body.contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")
    if body.user_id and body.contact_id:
        raise HTTPException(status_code=400, detail="Provide only one of user_id or contact_id")

    # Verify the PAX entity exists
    if body.user_id:
        u = await db.get(User, body.user_id)
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        pax_name = f"{u.first_name} {u.last_name}"
        # Check not already in this AdS
        existing = await db.execute(
            select(AdsPax.id).where(AdsPax.ads_id == ads_id, AdsPax.user_id == body.user_id)
        )
    else:
        c = await db.get(TierContact, body.contact_id)
        if not c:
            raise HTTPException(status_code=404, detail="Contact not found")
        pax_name = f"{c.first_name} {c.last_name}"
        existing = await db.execute(
            select(AdsPax.id).where(AdsPax.ads_id == ads_id, AdsPax.contact_id == body.contact_id)
        )

    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce PAX est déjà dans cet AdS")

    entry = AdsPax(
        ads_id=ads_id,
        user_id=body.user_id,
        contact_id=body.contact_id,
        status="pending_check",
    )
    db.add(entry)
    await db.commit()

    return {
        "status": "added",
        "user_id": str(body.user_id) if body.user_id else None,
        "contact_id": str(body.contact_id) if body.contact_id else None,
        "name": pax_name,
    }


@router.delete("/ads/{ads_id}/pax/{entry_id}", status_code=204)
async def remove_pax_from_ads(
    ads_id: UUID,
    entry_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a PAX entry from an AdS by AdsPax id."""
    result = await db.execute(
        select(AdsPax).where(
            AdsPax.id == entry_id,
            AdsPax.ads_id == ads_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="PAX entry not found in this AdS")
    # Junction record — physical delete (not policy-managed)
    await db.delete(entry)
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# ADS — Lookup by reference + PDF ticket
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/by-reference/{reference}", response_model=AdsRead)
async def get_ads_by_reference(
    reference: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lookup an AdS by its unique reference number (e.g. ADS-2026-0001)."""
    result = await db.execute(
        select(Ads).where(
            Ads.entity_id == entity_id,
            Ads.reference == reference,
        )
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail=f"AdS «{reference}» introuvable")
    return ads


@router.get("/ads/{ads_id}/pdf")
async def download_ads_pdf(
    ads_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and download the AdS as a PDF ticket (boarding pass style).

    Uses the configurable PDF template system (slug: ads.ticket).
    Admins can customize the layout via Settings → PDF Templates.
    """
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf

    # Load ADS with all related data
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS introuvable")

    # Load PAX entries with profile details (User + TierContact)
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    pax_rows = pax_result.scalars().all()
    passengers = []
    for ads_pax in pax_rows:
        if ads_pax.user_id:
            u = await db.get(User, ads_pax.user_id)
            passengers.append({
                "first_name": u.first_name if u else "?",
                "last_name": u.last_name if u else "?",
                "badge_number": (u.badge_number if u else None) or "—",
                "company": "",
                "type": u.pax_type if u else "internal",
                "status": ads_pax.status or "pending",
                "compliant": (ads_pax.compliance_summary or {}).get("compliant", False),
            })
        elif ads_pax.contact_id:
            c = await db.get(TierContact, ads_pax.contact_id)
            passengers.append({
                "first_name": c.first_name if c else "?",
                "last_name": c.last_name if c else "?",
                "badge_number": (c.badge_number if c else None) or "—",
                "company": "",
                "type": "external",
                "status": ads_pax.status or "pending",
                "compliant": (ads_pax.compliance_summary or {}).get("compliant", False),
            })

    # Load requester info
    from sqlalchemy import text as sql_text
    req_row = await db.execute(
        sql_text("SELECT first_name, last_name, email FROM users WHERE id = :uid"),
        {"uid": ads.requester_id},
    )
    requester = req_row.first()
    requester_name = f"{requester[0]} {requester[1]}" if requester else "—"

    # Load site name
    site_row = await db.execute(
        sql_text("SELECT name FROM ar_installations WHERE id = :aid"),
        {"aid": ads.site_entry_asset_id},
    )
    site = site_row.first()
    site_name = site[0] if site else "—"

    # Load entity name
    entity_row = await db.execute(
        sql_text("SELECT name FROM entities WHERE id = :eid"),
        {"eid": entity_id},
    )
    entity = entity_row.first()
    entity_name = entity[0] if entity else "OpsFlux"

    variables = {
        "reference": ads.reference,
        "status": ads.status,
        "start_date": str(ads.start_date) if ads.start_date else "—",
        "end_date": str(ads.end_date) if ads.end_date else "—",
        "site_name": site_name,
        "visit_purpose": ads.visit_purpose or "—",
        "visit_category": ads.visit_category or "—",
        "outbound_transport_mode": ads.outbound_transport_mode or "—",
        "return_transport_mode": ads.return_transport_mode or "—",
        "requester_name": requester_name,
        "pax_count": len(passengers),
        "passengers": passengers,
        "entity_name": entity_name,
        "qr_data": ads.reference,
    }

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="ads.ticket",
            entity_id=entity_id,
            language=language,
            variables=variables,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    filename = f"ADS_{ads.reference.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PAX INCIDENTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/incidents", response_model=PaginatedResponse[PaxIncidentRead])
async def list_incidents(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    active_only: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List PAX incidents."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)
    if user_id:
        query = query.where(PaxIncident.user_id == user_id)
    if contact_id:
        query = query.where(PaxIncident.contact_id == contact_id)
    if active_only:
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711
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
        user_id=body.user_id,
        contact_id=body.contact_id,
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
            "user_id": str(body.user_id) if body.user_id else None,
            "contact_id": str(body.contact_id) if body.contact_id else None,
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


# ═══════════════════════════════════════════════════════════════════════════════
# AdS IMPUTATIONS (multi-project cost allocation)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/{ads_id}/imputations")
async def list_imputations(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List cost imputations for an AdS. Sum of percentages must = 100."""
    from sqlalchemy import text as sa_text

    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    result = await db.execute(
        sa_text(
            """
            SELECT id, ads_id, project_id, cost_center_id, wbs_id, percentage
            FROM ads_imputations
            WHERE ads_id = :ads_id
            ORDER BY id
            """
        ),
        {"ads_id": str(ads_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "ads_id": str(r[1]),
            "project_id": str(r[2]) if r[2] else None,
            "cost_center_id": str(r[3]) if r[3] else None,
            "wbs_id": str(r[4]) if r[4] else None,
            "percentage": float(r[5]),
        }
        for r in rows
    ]


@router.post("/ads/{ads_id}/imputations", status_code=201)
async def add_imputation(
    ads_id: UUID,
    project_id: UUID | None = None,
    cost_center_id: UUID | None = None,
    percentage: float = 100.0,
    wbs_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a cost imputation line. Validates sum <= 100."""
    from sqlalchemy import text as sa_text

    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    # Check current total
    total_result = await db.execute(
        sa_text("SELECT COALESCE(SUM(percentage), 0) FROM ads_imputations WHERE ads_id = :ads_id"),
        {"ads_id": str(ads_id)},
    )
    current_total = float(total_result.scalar() or 0)

    if current_total + percentage > 100.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Total des imputations dépasserait 100% ({current_total}% + {percentage}% = {current_total + percentage}%).",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO ads_imputations (ads_id, project_id, cost_center_id, wbs_id, percentage, created_at)
            VALUES (:ads_id, :project_id, :cc_id, :wbs_id, :percentage, NOW())
            RETURNING id
            """
        ),
        {
            "ads_id": str(ads_id),
            "project_id": str(project_id) if project_id else None,
            "cc_id": str(cost_center_id) if cost_center_id else None,
            "wbs_id": str(wbs_id) if wbs_id else None,
            "percentage": percentage,
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "ads_id": str(ads_id),
        "project_id": str(project_id) if project_id else None,
        "cost_center_id": str(cost_center_id) if cost_center_id else None,
        "wbs_id": str(wbs_id) if wbs_id else None,
        "percentage": percentage,
    }


@router.delete("/ads/{ads_id}/imputations/{imputation_id}", status_code=204)
async def delete_imputation(
    ads_id: UUID,
    imputation_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cost imputation line."""
    from sqlalchemy import text as sa_text

    # Verify AdS belongs to entity
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    # Junction record — physical delete (not policy-managed)
    result = await db.execute(
        sa_text(
            "DELETE FROM ads_imputations WHERE id = :imp_id AND ads_id = :ads_id RETURNING id"
        ),
        {"imp_id": str(imputation_id), "ads_id": str(ads_id)},
    )
    deleted = result.scalar()
    if not deleted:
        raise HTTPException(status_code=404, detail="Imputation not found")
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# ROTATION CYCLES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/rotation-cycles")
async def list_rotation_cycles(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    site_asset_id: UUID | None = None,
    status_filter: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List rotation cycles for the entity."""
    from sqlalchemy import text as sa_text

    conditions = ["entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}

    if user_id:
        conditions.append("user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if site_asset_id:
        conditions.append("site_asset_id = :site_id")
        params["site_id"] = str(site_asset_id)
    if status_filter:
        conditions.append("status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                   cycle_start_date, status,
                   auto_create_ads, ads_lead_days,
                   default_project_id, default_cc_id, created_at
            FROM pax_rotation_cycles
            WHERE {where_clause}
            ORDER BY created_at DESC
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "user_id": str(r[1]) if r[1] else None,
            "contact_id": str(r[2]) if r[2] else None,
            "site_asset_id": str(r[3]),
            "days_on": r[4],
            "days_off": r[5],
            "cycle_start_date": str(r[6]) if r[6] else None,
            "status": r[7],
            "auto_create_ads": r[8],
            "ads_lead_days": r[9],
            "default_project_id": str(r[10]) if r[10] else None,
            "default_cc_id": str(r[11]) if r[11] else None,
            "created_at": str(r[12]),
        }
        for r in rows
    ]


@router.post("/rotation-cycles", status_code=201)
async def create_rotation_cycle(
    site_asset_id: UUID,
    days_on: int,
    days_off: int,
    cycle_start_date: date,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    auto_create_ads: bool = True,
    ads_lead_days: int = 7,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a rotation cycle for a PAX on a site."""
    from sqlalchemy import text as sa_text

    if not user_id and not contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_rotation_cycles (
                entity_id, user_id, contact_id, site_asset_id, days_on, days_off,
                cycle_start_date, next_on_date, status,
                auto_create_ads, ads_lead_days,
                default_project_id, default_cc_id, created_at
            ) VALUES (
                :eid, :user_id, :contact_id, :site_id, :days_on, :days_off,
                :start_date, :start_date, 'active',
                :auto_ads, :lead_days,
                :project_id, :cc_id, NOW()
            ) RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
            "start_date": cycle_start_date,
            "auto_ads": auto_create_ads,
            "lead_days": ads_lead_days,
            "project_id": str(default_project_id) if default_project_id else None,
            "cc_id": str(default_cc_id) if default_cc_id else None,
        },
    )
    new_id = result.scalar()
    await db.commit()

    await record_audit(
        db,
        action="paxlog.rotation.create",
        resource_type="pax_rotation_cycle",
        resource_id=str(new_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_asset_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
        },
    )
    await db.commit()

    return {
        "id": str(new_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "site_asset_id": str(site_asset_id),
        "days_on": days_on,
        "days_off": days_off,
        "cycle_start_date": str(cycle_start_date),
        "status": "active",
    }


@router.patch("/rotation-cycles/{cycle_id}")
async def update_rotation_cycle(
    cycle_id: UUID,
    status_val: str | None = None,
    days_on: int | None = None,
    days_off: int | None = None,
    ads_lead_days: int | None = None,
    auto_create_ads: bool | None = None,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update a rotation cycle."""
    from sqlalchemy import text as sa_text

    # Verify cycle exists
    check = await db.execute(
        sa_text("SELECT id FROM pax_rotation_cycles WHERE id = :cid AND entity_id = :eid"),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not check.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")

    updates = []
    params: dict = {"cid": str(cycle_id)}

    if status_val is not None:
        updates.append("status = :status")
        params["status"] = status_val
    if days_on is not None:
        updates.append("days_on = :days_on")
        params["days_on"] = days_on
    if days_off is not None:
        updates.append("days_off = :days_off")
        params["days_off"] = days_off
    if ads_lead_days is not None:
        updates.append("ads_lead_days = :lead")
        params["lead"] = ads_lead_days
    if auto_create_ads is not None:
        updates.append("auto_create_ads = :auto")
        params["auto"] = auto_create_ads
    if default_project_id is not None:
        updates.append("default_project_id = :proj")
        params["proj"] = str(default_project_id)
    if default_cc_id is not None:
        updates.append("default_cc_id = :cc")
        params["cc"] = str(default_cc_id)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    set_clause = ", ".join(updates)
    await db.execute(
        sa_text(f"UPDATE pax_rotation_cycles SET {set_clause} WHERE id = :cid"),
        params,
    )
    await db.commit()

    return {"id": str(cycle_id), "updated_fields": list(params.keys() - {"cid"})}


@router.delete("/rotation-cycles/{cycle_id}", status_code=204)
async def end_rotation_cycle(
    cycle_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """End (deactivate) a rotation cycle."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "UPDATE pax_rotation_cycles SET status = 'ended' "
            "WHERE id = :cid AND entity_id = :eid RETURNING id"
        ),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# EXTERNAL ACCESS LINKS (portail externe Tiers)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/ads/{ads_id}/external-link", status_code=201)
async def create_external_link(
    ads_id: UUID,
    otp_required: bool = True,
    otp_sent_to: str | None = None,
    expires_hours: int = 72,
    max_uses: int = 1,
    preconfigured_data: dict | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a one-time external link for a Tiers to fill PAX data."""
    from sqlalchemy import text as sa_text
    import secrets

    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id, Ads.reference).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads_row = ads_result.first()
    if not ads_row:
        raise HTTPException(status_code=404, detail="AdS not found")

    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_hours)

    import json
    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_external_links (
                ads_id, entity_id, token, otp_required, otp_sent_to,
                expires_at, max_uses, uses_count, preconfigured_data, created_by, created_at
            ) VALUES (
                :ads_id, :eid, :token, :otp, :otp_to,
                :expires, :max_uses, 0, :preconf, :created_by, NOW()
            ) RETURNING id
            """
        ),
        {
            "ads_id": str(ads_id),
            "eid": str(entity_id),
            "token": token,
            "otp": otp_required,
            "otp_to": otp_sent_to,
            "expires": expires_at,
            "max_uses": max_uses,
            "preconf": json.dumps(preconfigured_data) if preconfigured_data else None,
            "created_by": str(current_user.id),
        },
    )
    link_id = result.scalar()
    await db.commit()

    await record_audit(
        db,
        action="paxlog.external_link.create",
        resource_type="pax_external_link",
        resource_id=str(link_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"ads_id": str(ads_id), "expires_hours": expires_hours},
    )
    await db.commit()

    logger.info("External link created for AdS %s by %s", ads_row[1], current_user.id)

    return {
        "id": str(link_id),
        "ads_id": str(ads_id),
        "token": token,
        "url": f"/api/v1/pax/external/{token}",
        "otp_required": otp_required,
        "expires_at": expires_at.isoformat(),
        "max_uses": max_uses,
    }


@router.get("/external/{token}")
async def access_external_link(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint -- validate token, return preconfigured data.

    No authentication required (external Tiers access).
    """
    from sqlalchemy import text as sa_text
    import json

    result = await db.execute(
        sa_text(
            """
            SELECT id, ads_id, entity_id, otp_required, expires_at,
                   max_uses, uses_count, preconfigured_data
            FROM pax_external_links
            WHERE token = :token
            """
        ),
        {"token": token},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Lien invalide ou expiré")

    link_id, ads_id, entity_id, otp_required, expires_at, max_uses, uses_count, preconf = row

    # Check expiry
    now = datetime.now(timezone.utc)
    if expires_at and expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=410, detail="Ce lien a expiré")

    # Check uses
    if max_uses and uses_count >= max_uses:
        raise HTTPException(status_code=410, detail="Ce lien a atteint le nombre maximum d'utilisations")

    # Increment use count
    await db.execute(
        sa_text("UPDATE pax_external_links SET uses_count = uses_count + 1 WHERE id = :lid"),
        {"lid": str(link_id)},
    )
    await db.commit()

    preconfigured = json.loads(preconf) if preconf else None

    return {
        "ads_id": str(ads_id),
        "entity_id": str(entity_id),
        "otp_required": otp_required,
        "preconfigured_data": preconfigured,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STAY PROGRAMS (deplacements intra-champ)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/stay-programs")
async def list_stay_programs(
    ads_id: UUID | None = None,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    status_filter: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List stay programs (intra-field movement plans)."""
    from sqlalchemy import text as sa_text

    conditions = ["sp.entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}

    if ads_id:
        conditions.append("sp.ads_id = :ads_id")
        params["ads_id"] = str(ads_id)
    if user_id:
        conditions.append("sp.user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("sp.contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if status_filter:
        conditions.append("sp.status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT sp.id, sp.ads_id, sp.user_id, sp.contact_id, sp.status, sp.movements, sp.created_at
            FROM stay_programs sp
            WHERE {where_clause}
            ORDER BY sp.created_at DESC
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "ads_id": str(r[1]),
            "user_id": str(r[2]) if r[2] else None,
            "contact_id": str(r[3]) if r[3] else None,
            "status": r[4],
            "movements": r[5],
            "created_at": str(r[6]),
        }
        for r in rows
    ]


@router.post("/stay-programs", status_code=201)
async def create_stay_program(
    ads_id: UUID,
    movements: list[dict],
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a stay program (intra-field movement plan for a PAX in an AdS)."""
    from sqlalchemy import text as sa_text
    import json

    if not user_id and not contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    # Verify AdS
    ads_result = await db.execute(
        select(Ads.id).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    if not ads_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="AdS not found")

    result = await db.execute(
        sa_text(
            """
            INSERT INTO stay_programs (entity_id, ads_id, user_id, contact_id, status, movements, created_by, created_at)
            VALUES (:eid, :ads_id, :user_id, :contact_id, 'draft', :movements, :created_by, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "ads_id": str(ads_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "movements": json.dumps(movements),
            "created_by": str(current_user.id),
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "ads_id": str(ads_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "status": "draft",
    }


@router.post("/stay-programs/{program_id}/submit")
async def submit_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Submit a stay program for approval."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'submitted' "
            "WHERE id = :pid AND entity_id = :eid AND status = 'draft' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-soumettable (doit etre en brouillon).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "submitted"}


@router.post("/stay-programs/{program_id}/approve")
async def approve_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve a submitted stay program."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'approved', approved_by = :uid, approved_at = NOW() "
            "WHERE id = :pid AND entity_id = :eid AND status = 'submitted' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id), "uid": str(current_user.id)},
    )
    if not result.scalar():
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-approvable (doit etre soumis).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "approved"}


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILE TYPES & HABILITATIONS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profile-types")
async def list_profile_types(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all PAX profile types (job roles/categories)."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            """
            SELECT id, code, name, description, created_at
            FROM pax_profile_types
            WHERE entity_id = :eid OR entity_id IS NULL
            ORDER BY name
            """
        ),
        {"eid": str(entity_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "created_at": str(r[4]),
        }
        for r in rows
    ]


@router.post("/profile-types", status_code=201)
async def create_profile_type(
    code: str,
    name: str,
    description: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a PAX profile type (job role/category)."""
    from sqlalchemy import text as sa_text

    # Check uniqueness
    existing = await db.execute(
        sa_text(
            "SELECT id FROM pax_profile_types WHERE code = :code AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"code": code, "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Profile type with code '{code}' already exists",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_profile_types (entity_id, code, name, description, created_at)
            VALUES (:eid, :code, :name, :desc, NOW())
            RETURNING id
            """
        ),
        {"eid": str(entity_id), "code": code, "name": name, "desc": description},
    )
    new_id = result.scalar()
    await db.commit()

    return {"id": str(new_id), "code": code, "name": name, "description": description}


@router.get("/pax/{pax_id}/profile-types")
async def list_pax_profile_types(
    pax_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List profile types assigned to a PAX (user or contact)."""
    from sqlalchemy import text as sa_text

    fk_col = "user_id" if pax_source == "user" else "contact_id"
    result = await db.execute(
        sa_text(
            f"""
            SELECT pt.id, pt.code, pt.name, pt.description, ppt.created_at
            FROM pax_profile_types ppt
            JOIN pax_profile_types pt ON pt.id = ppt.profile_type_id
            WHERE ppt.{fk_col} = :pax_id
            ORDER BY pt.name
            """
        ),
        {"pax_id": str(pax_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "assigned_at": str(r[4]) if r[4] else None,
        }
        for r in rows
    ]


@router.post("/pax/{pax_id}/profile-types/{profile_type_id}", status_code=201)
async def assign_profile_type(
    pax_id: UUID,
    profile_type_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Assign a profile type to a PAX (user or contact)."""
    from sqlalchemy import text as sa_text
    from app.models.paxlog import PaxProfileType

    fk_col = "user_id" if pax_source == "user" else "contact_id"

    # Check if already assigned
    existing = await db.execute(
        sa_text(
            f"SELECT 1 FROM pax_profile_types WHERE {fk_col} = :pax_id AND profile_type_id = :pt_id"
        ),
        {"pax_id": str(pax_id), "pt_id": str(profile_type_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile type already assigned to this PAX",
        )

    ppt = PaxProfileType(
        user_id=pax_id if pax_source == "user" else None,
        contact_id=pax_id if pax_source == "contact" else None,
        profile_type_id=profile_type_id,
    )
    db.add(ppt)
    await db.commit()

    return {"pax_id": str(pax_id), "pax_source": pax_source, "profile_type_id": str(profile_type_id), "status": "assigned"}


@router.get("/habilitation-matrix")
async def list_habilitation_matrix(
    profile_type_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List habilitation matrix entries (credentials required per profile type)."""
    from sqlalchemy import text as sa_text

    conditions = ["(hm.entity_id = :eid OR hm.entity_id IS NULL)"]
    params: dict = {"eid": str(entity_id)}

    if profile_type_id:
        conditions.append("hm.profile_type_id = :pt_id")
        params["pt_id"] = str(profile_type_id)

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT hm.id, hm.profile_type_id, pt.code AS profile_code, pt.name AS profile_name,
                   hm.credential_type_id, ct.code AS cred_code, ct.name AS cred_name,
                   hm.mandatory
            FROM habilitation_matrix hm
            JOIN pax_profile_types pt ON pt.id = hm.profile_type_id
            JOIN credential_types ct ON ct.id = hm.credential_type_id
            WHERE {where_clause}
            ORDER BY pt.name, ct.name
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "profile_type_id": str(r[1]),
            "profile_code": r[2],
            "profile_name": r[3],
            "credential_type_id": str(r[4]),
            "credential_code": r[5],
            "credential_name": r[6],
            "mandatory": r[7],
        }
        for r in rows
    ]


@router.post("/habilitation-matrix", status_code=201)
async def add_habilitation_requirement(
    profile_type_id: UUID,
    credential_type_id: UUID,
    mandatory: bool = True,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential requirement to a profile type in the habilitation matrix."""
    from sqlalchemy import text as sa_text

    # Check uniqueness
    existing = await db.execute(
        sa_text(
            "SELECT id FROM habilitation_matrix "
            "WHERE profile_type_id = :pt_id AND credential_type_id = :ct_id "
            "AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"pt_id": str(profile_type_id), "ct_id": str(credential_type_id), "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This credential requirement already exists for this profile type",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO habilitation_matrix (entity_id, profile_type_id, credential_type_id, mandatory, created_at)
            VALUES (:eid, :pt_id, :ct_id, :mandatory, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "pt_id": str(profile_type_id),
            "ct_id": str(credential_type_id),
            "mandatory": mandatory,
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "profile_type_id": str(profile_type_id),
        "credential_type_id": str(credential_type_id),
        "mandatory": mandatory,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE DASHBOARD DATA
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/compliance/expiring")
async def get_expiring_credentials(
    days_ahead: int = 30,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get PAX credentials expiring within N days. Used by dashboard widget."""
    from datetime import timedelta as td

    today = date.today()
    cutoff = today + td(days=days_ahead)

    # Credentials linked to Users
    user_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.user_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            User.first_name,
            User.last_name,
            User.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(User, User.id == PaxCredential.user_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            PaxCredential.user_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )
    # Credentials linked to TierContacts
    contact_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.contact_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            TierContact.first_name,
            TierContact.last_name,
            TierContact.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(TierContact, TierContact.id == PaxCredential.contact_id)
        .join(Tier, Tier.id == TierContact.tier_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            Tier.entity_id == entity_id,
            PaxCredential.contact_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )

    items = []
    for r in user_creds.all():
        items.append({
            "credential_id": str(r[0]),
            "user_id": str(r[1]),
            "contact_id": None,
            "pax_source": "user",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": (r[3] - today).days,
        })
    for r in contact_creds.all():
        items.append({
            "credential_id": str(r[0]),
            "user_id": None,
            "contact_id": str(r[1]),
            "pax_source": "contact",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": (r[3] - today).days,
        })

    items.sort(key=lambda x: x["expiry_date"])
    return items


@router.get("/compliance/stats")
async def get_compliance_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get compliance statistics per site. Used by dashboard widget."""
    from sqlalchemy import text as sa_text

    today = date.today()

    # Total active PAX count (Users in entity + TierContacts of entity's Tiers)
    user_count = await db.execute(
        select(func.count(User.id))
        .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
    )
    contact_count = await db.execute(
        select(func.count(TierContact.id))
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    total_pax_value = (user_count.scalar() or 0) + (contact_count.scalar() or 0)

    # Expired credentials count
    expired_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(
            PaxCredential.expiry_date < today,
            PaxCredential.status == "valid",
        )
    )

    # Pending validation count
    pending_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(PaxCredential.status == "pending_validation")
    )

    # Active incidents count
    active_incidents = await db.execute(
        select(func.count(PaxIncident.id)).where(
            PaxIncident.entity_id == entity_id,
            PaxIncident.resolved_at == None,  # noqa: E711
        )
    )

    # Per-site stats (top 10 sites by AdS count)
    site_stats = await db.execute(
        sa_text(
            """
            SELECT a.site_entry_asset_id, ast.name AS site_name,
                   COUNT(DISTINCT a.id) AS ads_count,
                   COUNT(DISTINCT ap.id) AS pax_count,
                   COUNT(DISTINCT CASE WHEN ap.status = 'blocked' THEN ap.id END) AS blocked_count
            FROM ads a
            JOIN ads_pax ap ON ap.ads_id = a.id
            LEFT JOIN ar_installations ast ON ast.id = a.site_entry_asset_id
            WHERE a.entity_id = :eid
              AND a.status IN ('submitted', 'pending_validation', 'approved', 'in_progress')
              AND a.archived = false
            GROUP BY a.site_entry_asset_id, ast.name
            ORDER BY ads_count DESC
            LIMIT 10
            """
        ),
        {"eid": str(entity_id)},
    )
    sites = site_stats.all()

    return {
        "total_active_pax": total_pax_value,
        "expired_credentials": expired_count.scalar() or 0,
        "pending_validations": pending_count.scalar() or 0,
        "active_incidents": active_incidents.scalar() or 0,
        "site_stats": [
            {
                "site_asset_id": str(s[0]),
                "site_name": s[1] or "N/A",
                "ads_count": s[2],
                "pax_count": s[3],
                "blocked_count": s[4],
            }
            for s in sites
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SIGNALEMENTS (formal incident reporting — via service layer)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/signalements")
async def list_signalements(
    pax_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List formal signalements (incidents, HSE violations, bans)."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)

    if pax_id:
        query = query.where(or_(PaxIncident.user_id == pax_id, PaxIncident.contact_id == pax_id))
    if asset_id:
        query = query.where(PaxIncident.asset_id == asset_id)
    if severity:
        query = query.where(PaxIncident.severity == severity)
    if status_filter == "resolved":
        query = query.where(PaxIncident.resolved_at != None)  # noqa: E711
    elif status_filter == "active":
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711

    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/signalements", response_model=PaxIncidentRead, status_code=201)
async def create_signalement(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str = "info",
    description: str = "",
    incident_date: date | None = None,
    ban_start_date: date | None = None,
    ban_end_date: date | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a formal signalement (incident, HSE violation, ban).

    If severity is temp_ban or permanent_ban, the PAX is auto-suspended.
    """
    from app.services.modules.paxlog_service import create_signalement as svc_create

    if not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required",
        )

    result = await svc_create(
        db,
        entity_id=entity_id,
        data={
            "user_id": user_id,
            "contact_id": contact_id,
            "asset_id": asset_id,
            "severity": severity,
            "description": description,
            "incident_date": incident_date or date.today(),
            "ban_start_date": ban_start_date,
            "ban_end_date": ban_end_date,
            "recorded_by": current_user.id,
        },
    )

    await record_audit(
        db,
        action="paxlog.signalement.create",
        resource_type="pax_incident",
        resource_id=str(result["id"]),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": severity,
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
        },
    )
    await db.commit()

    # Re-fetch for response model
    incident_result = await db.execute(
        select(PaxIncident).where(PaxIncident.id == result["id"])
    )
    return incident_result.scalar_one()


@router.post("/signalements/{signalement_id}/resolve", response_model=PaxIncidentRead)
async def resolve_signalement(
    signalement_id: UUID,
    resolution_notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a formal signalement with optional notes."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce signalement est deja resolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = resolution_notes

    # If PAX was suspended due to a ban, check if they can be re-activated
    pax_filter = None
    if incident.severity in ("temp_ban", "permanent_ban"):
        if incident.user_id:
            pax_filter = PaxIncident.user_id == incident.user_id
        elif incident.contact_id:
            pax_filter = PaxIncident.contact_id == incident.contact_id

    if pax_filter is not None:
        # Check if there are other unresolved bans
        other_bans = await db.execute(
            select(func.count(PaxIncident.id)).where(
                PaxIncident.entity_id == entity_id,
                pax_filter,
                PaxIncident.id != signalement_id,
                PaxIncident.severity.in_(["temp_ban", "permanent_ban"]),
                PaxIncident.resolved_at == None,  # noqa: E711
            )
        )
        if (other_bans.scalar() or 0) == 0:
            # No other active bans — log re-activation
            pax_id_str = str(incident.user_id or incident.contact_id)
            logger.info("PAX %s eligible for re-activation after signalement %s resolved", pax_id_str, signalement_id)

    await db.commit()
    await db.refresh(incident)

    await record_audit(
        db,
        action="paxlog.signalement.resolve",
        resource_type="pax_incident",
        resource_id=str(signalement_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()

    # Emit event
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.resolved",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "user_id": str(incident.user_id) if incident.user_id else None,
            "contact_id": str(incident.contact_id) if incident.contact_id else None,
            "severity": incident.severity,
            "resolved_by": str(current_user.id),
        },
    ))

    return incident


@router.post("/signalements/{signalement_id}/validate", response_model=PaxIncidentRead)
async def validate_signalement(
    signalement_id: UUID,
    decision: str | None = None,
    decision_duration_days: int | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Validate a signalement — confirms the decision (ban, warning, etc.)."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")

    if decision:
        incident.decision = decision
    if decision_duration_days:
        incident.decision_duration_days = decision_duration_days
        incident.decision_end_date = date.today() + timedelta(days=decision_duration_days)

    await db.commit()
    await db.refresh(incident)
    return incident


@router.post("/signalements/{signalement_id}/lift", response_model=PaxIncidentRead)
async def lift_signalement(
    signalement_id: UUID,
    lift_reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Lift a signalement — removes the ban/sanction with justification."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = f"[LEVEE] {lift_reason}"

    # Re-activate PAX if no other active bans
    if incident.severity in ("temp_ban", "permanent_ban"):
        pax_col = "user_id" if incident.user_id else "contact_id"
        pax_val = str(incident.user_id or incident.contact_id)
        if pax_val:
            other_bans = await db.execute(
                text(
                    f"SELECT COUNT(*) FROM pax_incidents "
                    f"WHERE entity_id = :eid AND {pax_col} = :pax_fk "
                    f"AND id != :sig_id "
                    f"AND severity IN ('temp_ban', 'permanent_ban') "
                    f"AND resolved_at IS NULL"
                ),
                {"eid": str(entity_id), "pax_fk": pax_val, "sig_id": str(signalement_id)},
            )
            if (other_bans.scalar() or 0) == 0:
                table = "users" if incident.user_id else "tier_contacts"
                await db.execute(
                    text(f"UPDATE {table} SET pax_status = 'active' WHERE id = :pid"),
                    {"pid": pax_val},
                )

    await db.commit()
    await db.refresh(incident)

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.lifted",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "lifted_by": str(current_user.id),
            "lift_reason": lift_reason,
        },
    ))

    return incident


# ═══════════════════════════════════════════════════════════════════════════════
# AVIS DE MISSION (AVM)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/avm", response_model=PaginatedResponse[MissionNoticeSummary])
async def list_avm(
    search: str | None = None,
    status_filter: str | None = None,
    mission_type: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Mission (AVM) for the current entity."""
    query = (
        select(
            MissionNotice,
            User.first_name.label("creator_first"),
            User.last_name.label("creator_last"),
        )
        .outerjoin(User, User.id == MissionNotice.created_by)
        .where(MissionNotice.entity_id == entity_id, MissionNotice.archived == False)  # noqa: E712
    )
    if search:
        like = f"%{search}%"
        query = query.where(
            MissionNotice.reference.ilike(like)
            | MissionNotice.title.ilike(like)
        )
    if status_filter:
        query = query.where(MissionNotice.status == status_filter)
    if mission_type:
        query = query.where(MissionNotice.mission_type == mission_type)
    query = query.order_by(MissionNotice.created_at.desc())

    count_query = select(func.count()).select_from(
        query.with_only_columns(MissionNotice.id).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0
    offset = (pagination.page - 1) * pagination.page_size
    rows = (await db.execute(query.offset(offset).limit(pagination.page_size))).all()

    items = []
    for avm, creator_first, creator_last in rows:
        # Count PAX across all program lines
        pax_count_result = await db.execute(
            select(func.count(func.distinct(MissionProgramPax.id))).select_from(
                MissionProgramPax
            ).join(
                MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id
            ).where(MissionProgram.mission_notice_id == avm.id)
        )
        pax_count = pax_count_result.scalar() or 0

        # Preparation progress
        from app.services.modules.paxlog_service import get_avm_preparation_status
        prep_status = await get_avm_preparation_status(db, avm.id)

        d = MissionNoticeSummary.model_validate(avm)
        d.creator_name = f"{creator_first or ''} {creator_last or ''}".strip() or None
        d.pax_count = pax_count
        d.preparation_progress = prep_status["progress_percent"]
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.post("/avm", response_model=MissionNoticeRead, status_code=201)
async def create_avm(
    body: MissionNoticeCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Avis de Mission (AVM) in draft status."""
    from app.services.modules.paxlog_service import generate_avm_reference

    reference = await generate_avm_reference(db, entity_id)

    avm = MissionNotice(
        entity_id=entity_id,
        reference=reference,
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        status="draft",
        planned_start_date=body.planned_start_date,
        planned_end_date=body.planned_end_date,
        mission_type=body.mission_type,
        requires_badge=body.requires_badge,
        requires_epi=body.requires_epi,
        requires_visa=body.requires_visa,
        eligible_displacement_allowance=body.eligible_displacement_allowance,
        epi_measurements=body.epi_measurements,
        pax_quota=body.pax_quota,
    )
    db.add(avm)
    await db.flush()

    # ── PAX capacity validation ──────────────────────────────────────────
    # Count total unique non-cancelled PAX across all program lines
    if avm.pax_quota > 0:
        total_pax_count = sum(len(prog_data.pax_entries) for prog_data in body.programs)
        if total_pax_count > avm.pax_quota:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mission PAX quota exceeded ({total_pax_count}/{avm.pax_quota})",
            )

    # Create program lines
    for idx, prog_data in enumerate(body.programs):
        prog = MissionProgram(
            mission_notice_id=avm.id,
            order_index=idx,
            activity_description=prog_data.activity_description,
            activity_type=prog_data.activity_type,
            site_asset_id=prog_data.site_asset_id,
            planned_start_date=prog_data.planned_start_date,
            planned_end_date=prog_data.planned_end_date,
            project_id=prog_data.project_id,
            notes=prog_data.notes,
        )
        db.add(prog)
        await db.flush()

        # ── PAX conflict detection — same PAX on overlapping missions ────
        for pax_entry in prog_data.pax_entries:
            if prog.planned_start_date and prog.planned_end_date:
                # Build filter for matching PAX
                if pax_entry.user_id:
                    pax_match = MissionProgramPax.user_id == pax_entry.user_id
                else:
                    pax_match = MissionProgramPax.contact_id == pax_entry.contact_id

                conflict_query = (
                    select(
                        MissionNotice.reference,
                        MissionProgram.planned_start_date,
                        MissionProgram.planned_end_date,
                    )
                    .select_from(MissionProgramPax)
                    .join(MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id)
                    .join(MissionNotice, MissionNotice.id == MissionProgram.mission_notice_id)
                    .where(
                        pax_match,
                        MissionNotice.id != avm.id,
                        MissionNotice.status != "cancelled",
                        MissionProgram.planned_start_date.isnot(None),
                        MissionProgram.planned_end_date.isnot(None),
                        MissionProgram.planned_start_date <= prog.planned_end_date,
                        MissionProgram.planned_end_date >= prog.planned_start_date,
                    )
                )
                conflict_result = await db.execute(conflict_query)
                conflict = conflict_result.first()
                if conflict:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"PAX already assigned to mission {conflict[0]} "
                            f"({conflict[1]} - {conflict[2]})"
                        ),
                    )

            db.add(MissionProgramPax(
                mission_program_id=prog.id,
                user_id=pax_entry.user_id,
                contact_id=pax_entry.contact_id,
            ))

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.create", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.get("/avm/{avm_id}", response_model=MissionNoticeRead)
async def get_avm(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get AVM detail with programs, preparation tasks, and progress."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    return await _build_avm_read(db, avm)


@router.put("/avm/{avm_id}", response_model=MissionNoticeRead)
async def update_avm(
    avm_id: UUID,
    body: MissionNoticeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AVM (only if draft or in_preparation)."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status not in ("draft", "in_preparation"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update AVM with status '{avm.status}'",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(avm, key, value)

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.update", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/submit", response_model=dict)
async def submit_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Submit AVM — triggers preparation checklist generation."""
    from app.services.modules.paxlog_service import submit_avm as _submit_avm

    try:
        result = await _submit_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.submit", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/approve", response_model=dict)
async def approve_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve AVM — auto-creates draft AdS for each program line."""
    from app.services.modules.paxlog_service import approve_avm as _approve_avm

    try:
        result = await _approve_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.approve", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/cancel", response_model=MissionNoticeRead)
async def cancel_avm(
    avm_id: UUID,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.cancel"),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an AVM. Cancels all pending preparation tasks."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel AVM with status '{avm.status}'",
        )

    avm.status = "cancelled"
    avm.cancellation_reason = reason

    # Cancel all pending preparation tasks
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.status.in_(["pending", "in_progress"]),
        ).values(status="cancelled")
    )

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.cancel", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    # Emit event
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.cancelled",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "cancelled_by": str(current_user.id),
            "reason": reason,
        },
    ))

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/modify", response_model=MissionNoticeRead)
async def modify_active_avm(
    avm_id: UUID,
    body: MissionNoticeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Modify an active AVM (PAX potentially on site).

    Allowed on status: active, in_preparation.
    Logs modification reason and notifies stakeholders.
    """
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status not in ("active", "in_preparation"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify AVM with status '{avm.status}'",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(avm, key, value)

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.modify_active", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
        details={"modified_fields": list(update_data.keys())},
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.modified",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "modified_by": str(current_user.id),
            "modified_fields": list(update_data.keys()),
        },
    ))

    return await _build_avm_read(db, avm)


# ── AVM helper ─────────────────────────────────────────────────

async def _build_avm_read(db: AsyncSession, avm: MissionNotice) -> MissionNoticeRead:
    """Build enriched AVM read response with programs, tasks, and progress."""
    # Creator name
    creator_result = await db.execute(
        select(User.first_name, User.last_name).where(User.id == avm.created_by)
    )
    cr = creator_result.first()
    creator_name = f"{cr[0] or ''} {cr[1] or ''}".strip() if cr else None

    # Programs with PAX IDs
    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm.id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()

    program_reads = []
    for prog in programs:
        pax_result = await db.execute(
            select(MissionProgramPax.user_id, MissionProgramPax.contact_id).where(
                MissionProgramPax.mission_program_id == prog.id,
            )
        )
        pax_entries = [
            AdsPaxEntry(user_id=row[0], contact_id=row[1])
            for row in pax_result.all()
        ]

        # Get site name if available
        site_name = None
        if prog.site_asset_id:
            from sqlalchemy import text as sql_text
            name_result = await db.execute(
                sql_text("SELECT name FROM ar_installations WHERE id = :aid"),
                {"aid": str(prog.site_asset_id)},
            )
            name_row = name_result.first()
            site_name = name_row[0] if name_row else None

        pr = MissionProgramRead.model_validate(prog)
        pr.pax_entries = pax_entries
        pr.site_name = site_name
        program_reads.append(pr)

    # Preparation tasks
    task_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm.id,
        ).order_by(MissionPreparationTask.created_at)
    )
    tasks = task_result.scalars().all()
    task_reads = [MissionPreparationTaskRead.model_validate(t) for t in tasks]

    # Preparation progress
    from app.services.modules.paxlog_service import get_avm_preparation_status
    prep_status = await get_avm_preparation_status(db, avm.id)

    read = MissionNoticeRead.model_validate(avm)
    read.creator_name = creator_name
    read.programs = program_reads
    read.preparation_tasks = task_reads
    read.preparation_progress = prep_status["progress_percent"]

    return read
