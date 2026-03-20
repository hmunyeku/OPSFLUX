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
    Address, ExternalReference, Tag, Tier, TierBlock, TierContact, TierIdentifier, User,
)
from app.schemas.common import (
    PaginatedResponse,
    TierCreate, TierRead, TierUpdate,
    TierContactCreate, TierContactRead, TierContactUpdate, TierContactWithTier,
    TierIdentifierCreate, TierIdentifierRead, TierIdentifierUpdate,
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


# ── SAP Supplier Import ─────────────────────────────────────────────────────
# NOTE: Must be declared BEFORE /{tier_id} routes to avoid path conflicts.


@router.post("/import/sap", summary="Import SAP suppliers (XLSX)")
async def import_sap_suppliers(
    file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("tier.create"),
    db: AsyncSession = Depends(get_db),
):
    """Import suppliers from SAP XLSX export.

    Column mapping:
      0 Fournisseur        -> ExternalReference(system=SAP, code=value)
      1 Nom du fournisseur  -> Tier.name
      2 Rue                 -> Address.address_line1
      3 Pays                -> Address.country
      4 Code postal         -> Address.postal_code
      5 Ville               -> Address.city
      6 Groupe de comptes   -> Tag(sap_group)
      7 Critere recherche   -> Tier.alias
      8 Achats bloques      -> TierBlock if 'X'
      9 Organisation achats -> ExternalReference metadata / Tag
     10-11 Incoterms        -> Tier.payment_terms
     13 Devise de la cde    -> Tier.currency

    Deduplicates by Fournisseur code (Col 0). Skips existing SAP refs.
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl is not installed")

    if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only XLSX files are accepted")

    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    if not ws:
        raise HTTPException(status_code=400, detail="Empty workbook")

    rows = list(ws.iter_rows(min_row=2, values_only=True))  # skip header
    if not rows:
        return {"created": 0, "updated": 0, "skipped": 0, "blocked": 0, "errors": []}

    # Group by Fournisseur code (col 0)
    from collections import defaultdict
    grouped: dict[str, list] = defaultdict(list)
    for row in rows:
        code = str(row[0]).strip() if row[0] else None
        if not code:
            continue
        grouped[code].append(row)

    created = 0
    updated = 0
    skipped = 0
    blocked = 0
    errors: list[str] = []

    for sap_code, code_rows in grouped.items():
        try:
            first_row = code_rows[0]

            # Determine scope: PER* codes are local (Perenco internal), others international
            tier_scope = "local" if sap_code.startswith("PER") else "international"

            # Check if ExternalReference with system=SAP + code already exists
            existing_ref_query = select(ExternalReference).where(
                ExternalReference.system == "SAP",
                ExternalReference.code == sap_code,
                ExternalReference.owner_type == "tier",
            )
            if tier_scope == "international":
                # For international tiers: check across ALL entities
                existing_ref = await db.execute(existing_ref_query)
            else:
                # For local tiers: only check in current entity (via the tier's entity_id)
                existing_ref = await db.execute(
                    existing_ref_query.join(Tier, ExternalReference.owner_id == Tier.id)
                    .where(Tier.entity_id == entity_id)
                )
            ref_row = existing_ref.scalar_one_or_none()

            if ref_row:
                if tier_scope == "international" and ref_row.owner_id:
                    # International tier exists in another entity — link to it, skip creation
                    skipped += 1
                    continue
                # Already imported — skip
                skipped += 1
                continue

            # Extract data from first row
            name = str(first_row[1]).strip() if first_row[1] else f"SAP-{sap_code}"
            street = str(first_row[2]).strip() if first_row[2] else None
            country = str(first_row[3]).strip() if first_row[3] else None
            postal_code = str(first_row[4]).strip() if first_row[4] else None
            city = str(first_row[5]).strip() if first_row[5] else None
            sap_group = str(first_row[6]).strip() if first_row[6] else None
            alias = str(first_row[7]).strip() if first_row[7] else None
            purchasing_blocked = str(first_row[8]).strip().upper() == "X" if first_row[8] else False

            # Collect org achats from all duplicate rows
            org_achats_set: set[str] = set()
            for r in code_rows:
                if r[9]:
                    org_achats_set.add(str(r[9]).strip())

            incoterm = str(first_row[10]).strip() if len(first_row) > 10 and first_row[10] else None
            incoterm_city = str(first_row[11]).strip() if len(first_row) > 11 and first_row[11] else None

            currency = str(first_row[13]).strip() if len(first_row) > 13 and first_row[13] else "XAF"

            # Generate unique code
            tier_code = f"SAP-{sap_code}"

            # Check if tier with this code already exists
            existing_tier = await db.execute(
                select(Tier).where(Tier.entity_id == entity_id, Tier.code == tier_code)
            )
            tier = existing_tier.scalar_one_or_none()

            if tier:
                # Update existing tier
                if name:
                    tier.name = name
                if alias:
                    tier.alias = alias
                if incoterm:
                    tier.incoterm = incoterm
                if incoterm_city:
                    tier.incoterm_city = incoterm_city
                if currency and currency != "XAF":
                    tier.currency = currency
                tier.scope = tier_scope
                updated += 1
            else:
                # Create new tier
                tier = Tier(
                    entity_id=entity_id,
                    code=tier_code,
                    name=name,
                    alias=alias,
                    type="supplier",
                    currency=currency or "XAF",
                    incoterm=incoterm,
                    incoterm_city=incoterm_city,
                    is_blocked=purchasing_blocked,
                    scope=tier_scope,
                )
                db.add(tier)
                await db.flush()  # get tier.id
                created += 1

            # Create ExternalReference for SAP code
            sap_ref = ExternalReference(
                owner_type="tier",
                owner_id=tier.id,
                system="SAP",
                code=sap_code,
                label="SAP Fournisseur",
                created_by=current_user.id,
            )
            db.add(sap_ref)

            # Create address if we have street or city
            if street or city:
                addr = Address(
                    owner_type="tier",
                    owner_id=tier.id,
                    label="principal",
                    address_line1=street or "—",
                    city=city or "—",
                    postal_code=postal_code,
                    country=country or "—",
                    is_default=True,
                )
                db.add(addr)

            # Create tag for SAP group
            if sap_group:
                tag = Tag(
                    owner_type="tier",
                    owner_id=tier.id,
                    name=f"SAP: {sap_group}",
                    color="#2563eb",
                    visibility="public",
                    created_by=current_user.id,
                )
                db.add(tag)

            # Create tags for org achats
            for org in org_achats_set:
                org_tag = Tag(
                    owner_type="tier",
                    owner_id=tier.id,
                    name=f"Org achats: {org}",
                    color="#7c3aed",
                    visibility="public",
                    created_by=current_user.id,
                )
                db.add(org_tag)

            # Create TierBlock if purchasing blocked
            if purchasing_blocked:
                block = TierBlock(
                    entity_id=entity_id,
                    tier_id=tier.id,
                    action="block",
                    reason="Import SAP - achats bloques",
                    block_type="purchasing",
                    start_date=date_type.today(),
                    performed_by=current_user.id,
                    active=True,
                )
                db.add(block)
                blocked += 1

        except Exception as exc:
            errors.append(f"SAP {sap_code}: {str(exc)}")
            logger.warning("SAP import error for %s: %s", sap_code, exc, exc_info=True)

    await db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "blocked": blocked,
        "errors": errors,
    }


# ── Tier CRUD (by ID) ────────────────────────────────────────────────────────


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
    current_user: User = Depends(get_current_user),
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
    await delete_entity(ident, db, "tier_identifier", entity_id=ident_id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Identifier deleted"}


# ── Tier Blocks (blocking/unblocking) ────────────────────────────────────────


@router.get("/{tier_id}/blocks", response_model=list[TierBlockRead])
async def list_tier_blocks(
    tier_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
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
    await db.delete(ref)
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
