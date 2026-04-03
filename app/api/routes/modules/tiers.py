"""Tiers (companies) module routes — companies + contacts + identifiers + blocks + refs + SAP import."""

import io
import logging
from datetime import date as date_type
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    Address, ExternalReference, Tag, Tier, TierBlock, TierContact, User,
)
from app.schemas.common import (
    PaginatedResponse,
    TierCreate, TierRead, TierUpdate,
    TierContactCreate, TierContactRead, TierContactUpdate, TierContactWithTier,
    TierBlockCreate, TierBlockRead,
    ExternalReferenceCreate, ExternalReferenceRead,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tiers", tags=["tiers"])


# ── Tier CRUD ────────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[TierRead])
async def list_tiers(
    type: str | None = None,
    search: str | None = None,
    active: bool | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    """List companies/organizations with contact count."""
    contact_count_sq = (
        select(
            TierContact.tier_id,
            sqla_func.count(TierContact.id).label("contact_count"),
        )
        .where(TierContact.active == True)
        .group_by(TierContact.tier_id)
        .subquery()
    )

    query = (
        select(
            Tier,
            sqla_func.coalesce(contact_count_sq.c.contact_count, 0).label("contact_count"),
        )
        .outerjoin(contact_count_sq, Tier.id == contact_count_sq.c.tier_id)
        .where(Tier.entity_id == entity_id, Tier.archived == False)
    )
    if type:
        query = query.where(Tier.type == type)
    if active is not None:
        query = query.where(Tier.active == active)
    if search:
        like = f"%{search}%"
        query = query.where(Tier.name.ilike(like) | Tier.code.ilike(like))
    query = query.order_by(Tier.name)

    return await paginate(db, query, pagination, transform=_tier_with_count)


def _tier_with_count(row) -> dict:
    tier = row[0] if hasattr(row, '__getitem__') else row.Tier
    count = row[1] if hasattr(row, '__getitem__') else row.contact_count
    d = {c.key: getattr(tier, c.key) for c in tier.__table__.columns}
    d["contact_count"] = count
    return d


@router.post("", response_model=TierRead, status_code=201)
async def create_tier(
    body: TierCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.create"),
    db: AsyncSession = Depends(get_db),
):
    # ── Duplicate detection: same name (case-insensitive) in same entity ──
    dup_result = await db.execute(
        select(Tier.id, Tier.code).where(
            Tier.entity_id == entity_id,
            Tier.archived == False,  # noqa: E712
            sqla_func.lower(Tier.name) == body.name.strip().lower(),
        )
    )
    existing = dup_result.first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUPLICATE_TIER_NAME",
                "message": f"Un tiers avec le nom «{body.name}» existe déjà (code: {existing.code}).",
            },
        )

    tier = Tier(entity_id=entity_id, **body.model_dump())
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return tier



# ── Tier CRUD (by ID) ────────────────────────────────────────────────────────


@router.get("/{tier_id}", response_model=TierRead)
async def get_tier(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    count_result = await db.execute(
        select(sqla_func.count()).select_from(TierContact)
        .where(TierContact.tier_id == tier_id, TierContact.active == True)
    )
    d = {c.key: getattr(tier, c.key) for c in tier.__table__.columns}
    d["contact_count"] = count_result.scalar() or 0
    return d


@router.patch("/{tier_id}", response_model=TierRead)
async def update_tier(
    tier_id: UUID, body: TierUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tier, field, value)
    await db.commit()
    await db.refresh(tier)
    return tier


@router.delete("/{tier_id}")
async def archive_tier(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.delete"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    await delete_entity(tier, db, "tier", entity_id=tier.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Tier archived"}


# ── Global Contacts (all companies) ────────────────────────────────────────


@router.get("/contacts/all", response_model=PaginatedResponse[TierContactWithTier])
async def list_all_contacts(
    search: str | None = None,
    tier_id: UUID | None = None,
    department: str | None = None,
    is_primary: bool | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all contacts across all companies, with search and filters."""
    query = (
        select(TierContact, Tier.name.label("tier_name"), Tier.code.label("tier_code"))
        .join(Tier, TierContact.tier_id == Tier.id)
        .where(Tier.entity_id == entity_id, Tier.archived == False, TierContact.active == True)
    )
    if tier_id:
        query = query.where(TierContact.tier_id == tier_id)
    if department:
        query = query.where(TierContact.department.ilike(f"%{department}%"))
    if is_primary is not None:
        query = query.where(TierContact.is_primary == is_primary)
    if search:
        like = f"%{search}%"
        query = query.where(
            TierContact.first_name.ilike(like)
            | TierContact.last_name.ilike(like)
            | TierContact.position.ilike(like)
            | TierContact.department.ilike(like)
            | Tier.name.ilike(like)
        )
    query = query.order_by(TierContact.last_name, TierContact.first_name)

    return await paginate(db, query, pagination, transform=_contact_with_tier)


def _contact_with_tier(row) -> dict:
    contact = row[0] if hasattr(row, '__getitem__') else row.TierContact
    tier_name = row[1] if hasattr(row, '__getitem__') else row.tier_name
    tier_code = row[2] if hasattr(row, '__getitem__') else row.tier_code
    d = {c.key: getattr(contact, c.key) for c in contact.__table__.columns}
    d["tier_name"] = tier_name
    d["tier_code"] = tier_code
    return d


# ── Tier Contacts CRUD ──────────────────────────────────────────────────────


@router.get("/{tier_id}/contacts", response_model=list[TierContactRead])
async def list_tier_contacts(
    tier_id: UUID, entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(TierContact)
        .where(TierContact.tier_id == tier_id, TierContact.active == True)
        .order_by(TierContact.is_primary.desc(), TierContact.last_name)
    )
    return result.scalars().all()


@router.get("/{tier_id}/contacts/count")
async def count_tier_contacts(
    tier_id: UUID, entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(sqla_func.count()).select_from(TierContact)
        .where(TierContact.tier_id == tier_id, TierContact.active == True)
    )
    return {"count": result.scalar() or 0}


@router.get("/{tier_id}/contacts/{contact_id}", response_model=TierContactRead)
async def get_tier_contact(
    tier_id: UUID, contact_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    return await _get_contact_or_404(db, contact_id, tier_id)


@router.post("/{tier_id}/contacts", response_model=TierContactRead, status_code=201)
async def create_tier_contact(
    tier_id: UUID, body: TierContactCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)

    # ── Duplicate detection: same email or same (first+last name) at same tier ──
    if body.email:
        dup_email = await db.execute(
            select(TierContact.id).where(
                TierContact.tier_id == tier.id,
                TierContact.email == body.email,
                TierContact.active == True,  # noqa: E712
            )
        )
        if dup_email.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUPLICATE_CONTACT_EMAIL",
                    "message": f"Un contact avec l'email «{body.email}» existe déjà pour ce tiers.",
                },
            )

    if body.first_name and body.last_name:
        dup_name = await db.execute(
            select(TierContact.id).where(
                TierContact.tier_id == tier.id,
                sqla_func.lower(TierContact.first_name) == body.first_name.lower(),
                sqla_func.lower(TierContact.last_name) == body.last_name.lower(),
                TierContact.active == True,  # noqa: E712
            )
        )
        if dup_name.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUPLICATE_CONTACT_NAME",
                    "message": f"Un contact «{body.first_name} {body.last_name}» existe déjà pour ce tiers.",
                },
            )

    if body.is_primary:
        await _unset_primary_contacts(db, tier.id)
    contact = TierContact(tier_id=tier.id, **body.model_dump())
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.patch("/{tier_id}/contacts/{contact_id}", response_model=TierContactRead)
async def update_tier_contact(
    tier_id: UUID, contact_id: UUID, body: TierContactUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    contact = await _get_contact_or_404(db, contact_id, tier_id)
    update_data = body.model_dump(exclude_unset=True)
    if update_data.get("is_primary"):
        await _unset_primary_contacts(db, tier_id)
    for field, value in update_data.items():
        setattr(contact, field, value)
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/{tier_id}/contacts/{contact_id}")
async def delete_tier_contact(
    tier_id: UUID, contact_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    contact = await _get_contact_or_404(db, contact_id, tier_id)
    await delete_entity(contact, db, "tier_contact", entity_id=contact.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Contact deleted"}


# ── Tier Identifiers — now served by /api/v1/legal-identifiers/{owner_type}/{owner_id}
# Old routes removed. Use LegalIdentifierManager with ownerType="tier".


# ── Tier Blocks (blocking/unblocking) ────────────────────────────────────────


@router.get("/{tier_id}/blocks", response_model=list[TierBlockRead])
async def list_tier_blocks(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    """List the blocking/unblocking history for a tier."""
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(TierBlock, (User.first_name + " " + User.last_name).label("performer_name"))
        .outerjoin(User, TierBlock.performed_by == User.id)
        .where(TierBlock.tier_id == tier_id, TierBlock.entity_id == entity_id)
        .order_by(TierBlock.created_at.desc())
    )
    rows = result.all()
    out = []
    for row in rows:
        block = row[0]
        d = {c.key: getattr(block, c.key) for c in block.__table__.columns}
        d["performer_name"] = row[1]
        out.append(d)
    return out


@router.post("/{tier_id}/block", response_model=TierBlockRead, status_code=201)
async def block_tier(
    tier_id: UUID,
    body: TierBlockCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    """Block a tier — creates a TierBlock record and sets tier.is_blocked=True."""
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    block = TierBlock(
        entity_id=entity_id,
        tier_id=tier.id,
        action="block",
        reason=body.reason,
        block_type=body.block_type,
        start_date=body.start_date or date_type.today(),
        end_date=body.end_date,
        performed_by=current_user.id,
        active=True,
    )
    db.add(block)
    tier.is_blocked = True
    await db.commit()
    await db.refresh(block)
    d = {c.key: getattr(block, c.key) for c in block.__table__.columns}
    d["performer_name"] = current_user.full_name
    return d


@router.post("/{tier_id}/unblock", response_model=TierBlockRead, status_code=201)
async def unblock_tier(
    tier_id: UUID,
    body: TierBlockCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    """Unblock a tier — creates a TierBlock record with action='unblock' and sets tier.is_blocked=False."""
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    # Deactivate previous active blocks
    prev_blocks = await db.execute(
        select(TierBlock).where(
            TierBlock.tier_id == tier.id,
            TierBlock.action == "block",
            TierBlock.active == True,
        )
    )
    for prev in prev_blocks.scalars().all():
        prev.active = False

    block = TierBlock(
        entity_id=entity_id,
        tier_id=tier.id,
        action="unblock",
        reason=body.reason,
        block_type=body.block_type,
        start_date=body.start_date or date_type.today(),
        end_date=None,
        performed_by=current_user.id,
        active=True,
    )
    db.add(block)
    tier.is_blocked = False
    await db.commit()
    await db.refresh(block)
    d = {c.key: getattr(block, c.key) for c in block.__table__.columns}
    d["performer_name"] = current_user.full_name
    return d


# ── External References CRUD ────────────────────────────────────────────────


@router.get("/{tier_id}/external-refs", response_model=list[ExternalReferenceRead])
async def list_external_refs(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.read"),
    db: AsyncSession = Depends(get_db),
):
    """List external references (SAP, Gouti, etc.) for a tier."""
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(ExternalReference)
        .where(ExternalReference.owner_type == "tier", ExternalReference.owner_id == tier_id)
        .order_by(ExternalReference.system, ExternalReference.code)
    )
    return result.scalars().all()


@router.post("/{tier_id}/external-refs", response_model=ExternalReferenceRead, status_code=201)
async def create_external_ref(
    tier_id: UUID,
    body: ExternalReferenceCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    """Create an external reference for a tier."""
    await _get_tier_or_404(db, tier_id, entity_id)
    ref = ExternalReference(
        owner_type="tier",
        owner_id=tier_id,
        system=body.system,
        code=body.code,
        label=body.label,
        url=body.url,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(ref)
    await db.commit()
    await db.refresh(ref)
    return ref


@router.delete("/{tier_id}/external-refs/{ref_id}")
async def delete_external_ref(
    tier_id: UUID,
    ref_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    """Delete an external reference for a tier."""
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(ExternalReference).where(
            ExternalReference.id == ref_id,
            ExternalReference.owner_type == "tier",
            ExternalReference.owner_id == tier_id,
        )
    )
    ref = result.scalar_one_or_none()
    if not ref:
        raise HTTPException(status_code=404, detail="External reference not found")
    await delete_entity(ref, db, "external_reference", entity_id=ref.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "External reference deleted"}


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_tier_or_404(db: AsyncSession, tier_id: UUID, entity_id: UUID) -> Tier:
    result = await db.execute(
        select(Tier).where(Tier.id == tier_id, Tier.entity_id == entity_id)
    )
    tier = result.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    return tier


async def _get_contact_or_404(db: AsyncSession, contact_id: UUID, tier_id: UUID) -> TierContact:
    result = await db.execute(
        select(TierContact).where(TierContact.id == contact_id, TierContact.tier_id == tier_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


async def _unset_primary_contacts(db: AsyncSession, tier_id: UUID) -> None:
    result = await db.execute(
        select(TierContact).where(TierContact.tier_id == tier_id, TierContact.is_primary == True)
    )
    for c in result.scalars().all():
        c.is_primary = False
