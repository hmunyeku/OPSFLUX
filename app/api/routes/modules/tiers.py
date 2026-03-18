"""Tiers (companies) module routes — companies + contacts + identifiers."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import Tier, TierContact, TierIdentifier, User
from app.schemas.common import (
    PaginatedResponse,
    TierCreate, TierRead, TierUpdate,
    TierContactCreate, TierContactRead, TierContactUpdate, TierContactWithTier,
    TierIdentifierCreate, TierIdentifierRead, TierIdentifierUpdate,
)

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
    tier = Tier(entity_id=entity_id, **body.model_dump())
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return tier


@router.get("/{tier_id}", response_model=TierRead)
async def get_tier(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
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
    _: None = require_permission("tier.delete"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    tier.archived = True
    tier.active = False
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
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    contact = await _get_contact_or_404(db, contact_id, tier_id)
    contact.active = False
    await db.commit()
    return {"detail": "Contact deleted"}


# ── Tier Identifiers CRUD ───────────────────────────────────────────────────


@router.get("/{tier_id}/identifiers", response_model=list[TierIdentifierRead])
async def list_tier_identifiers(
    tier_id: UUID, entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(TierIdentifier)
        .where(TierIdentifier.tier_id == tier_id)
        .order_by(TierIdentifier.type)
    )
    return result.scalars().all()


@router.post("/{tier_id}/identifiers", response_model=TierIdentifierRead, status_code=201)
async def create_tier_identifier(
    tier_id: UUID, body: TierIdentifierCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    tier = await _get_tier_or_404(db, tier_id, entity_id)
    ident = TierIdentifier(tier_id=tier.id, **body.model_dump())
    db.add(ident)
    await db.commit()
    await db.refresh(ident)
    return ident


@router.patch("/{tier_id}/identifiers/{ident_id}", response_model=TierIdentifierRead)
async def update_tier_identifier(
    tier_id: UUID, ident_id: UUID, body: TierIdentifierUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(TierIdentifier).where(TierIdentifier.id == ident_id, TierIdentifier.tier_id == tier_id)
    )
    ident = result.scalar_one_or_none()
    if not ident:
        raise HTTPException(status_code=404, detail="Identifier not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ident, field, value)
    await db.commit()
    await db.refresh(ident)
    return ident


@router.delete("/{tier_id}/identifiers/{ident_id}")
async def delete_tier_identifier(
    tier_id: UUID, ident_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("tier.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_tier_or_404(db, tier_id, entity_id)
    result = await db.execute(
        select(TierIdentifier).where(TierIdentifier.id == ident_id, TierIdentifier.tier_id == tier_id)
    )
    ident = result.scalar_one_or_none()
    if not ident:
        raise HTTPException(status_code=404, detail="Identifier not found")
    await db.delete(ident)
    await db.commit()
    return {"detail": "Identifier deleted"}


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
