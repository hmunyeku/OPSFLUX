"""Native OpsFlux MCP backend — unified tools across all OpsFlux modules.

This backend exposes OpsFlux business objects (Tiers, Projects, PaxLog, etc.)
to MCP clients (Claude.ai, Cursor, VS Code, …) via a single consolidated
tool set. It is served at ``/mcp-gw/opsflux/mcp`` and authenticated with the
same Bearer token as the Gouti backend.

Design mirrors ``gouti_tools.py``:
- A handful of consolidated tools (``list_tiers``, ``get_tier``,
  ``create_tier``, ``update_tier``, ``list_contacts``, …) that wrap the
  underlying SQL / service layer directly — no HTTP call to the REST API.
- Tools execute as the public/system user via a short-lived DB session.
  Because MCP is admin-facing, every tool requires the caller to already
  have passed the Bearer token validation at the gateway level.
- Responses are compact JSON with a hard size cap so long listings never
  blow up Claude's context window.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func as sqla_func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.references import generate_reference
from app.models.common import (
    Address, Attachment, ComplianceRecord, ComplianceRule, ComplianceType,
    ContactEmail, CostCenter, CostImputation, Entity, ExternalReference,
    ImputationReference, LegalIdentifier, Note, OpeningHour, Phone,
    Project, ProjectMember, ProjectMilestone, ProjectTask, ProjectTemplate,
    ProjectWBSNode,
    Setting, SocialNetwork, Tag, Tier, TierBlock, TierContact,
    TierContactTransfer, User,
)
from app.models.asset_registry import Installation, OilSite, OilField, RegistryEquipment
from app.models.paxlog import PaxGroup, Ads, AdsPax
from app.models.planner import PlannerActivity, PlannerConflict
from app.models.travelwiz import TransportVector, Voyage
from app.mcp.mcp_native import NativeBackend, NativeToolContext

logger = logging.getLogger(__name__)


# ─── Response envelopes ──────────────────────────────────────────────────────

_MAX_RESPONSE_CHARS = 80_000  # MCP clients (Claude.ai) handle up to ~100K comfortably
_MAX_LIST_ITEMS = 200


def _ok(data: Any) -> dict:
    """Return a compact MCP tool result with truncation safety."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)
    if len(text) > _MAX_RESPONSE_CHARS:
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            items = data["items"]
            # Remove items from the end one by one until we fit
            keep = len(items)
            while keep > 1:
                candidate = json.dumps(
                    {**data, "items": items[:keep]},
                    ensure_ascii=False, separators=(",", ":"), default=str,
                )
                if len(candidate) <= _MAX_RESPONSE_CHARS - 200:
                    break
                keep = max(1, keep - max(1, keep // 4))
            data = {
                **data,
                "items": items[:keep],
                "total_available": len(items),
                "truncated": keep < len(items),
                **({"truncation_note": (
                    f"{keep}/{len(items)} éléments affichés. "
                    "Utilisez search ou limit pour affiner."
                )} if keep < len(items) else {}),
            }
            text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)
        else:
            text = json.dumps({
                "truncated": True,
                "preview": text[:_MAX_RESPONSE_CHARS - 300],
                "truncation_note": "Réponse trop longue — aperçu seulement.",
            }, ensure_ascii=False)
    return {"content": [{"type": "text", "text": text}]}


def _err(message: str) -> dict:
    return {
        "content": [{"type": "text", "text": json.dumps({"error": message}, ensure_ascii=False)}],
        "isError": True,
    }


def _tier_to_dict(t: Tier, *, compact: bool = False) -> dict:
    """Serialize a Tier ORM object. ``compact`` strips less important fields."""
    if compact:
        return {
            "id": str(t.id),
            "code": t.code,
            "name": t.name,
            "type": t.type,
            "country": t.country,
            "active": t.active,
            "is_blocked": t.is_blocked,
        }
    return {
        "id": str(t.id),
        "code": t.code,
        "name": t.name,
        "alias": t.alias,
        "trade_name": t.trade_name,
        "type": t.type,
        "email": t.email,
        "phone": t.phone,
        "fax": t.fax,
        "website": t.website,
        "legal_form": t.legal_form,
        "registration_number": t.registration_number,
        "tax_id": t.tax_id,
        "vat_number": t.vat_number,
        "capital": float(t.capital) if t.capital is not None else None,
        "currency": t.currency,
        "industry": t.industry,
        "payment_terms": t.payment_terms,
        "description": t.description,
        "address_line1": t.address_line1,
        "address_line2": t.address_line2,
        "city": t.city,
        "state": t.state,
        "zip_code": t.zip_code,
        "country": t.country,
        "timezone": t.timezone,
        "language": t.language,
        "active": t.active,
        "is_blocked": t.is_blocked,
        "archived": t.archived,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _contact_to_dict(c: TierContact, *, compact: bool = False) -> dict:
    if compact:
        return {
            "id": str(c.id),
            "tier_id": str(c.tier_id),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "is_primary": c.is_primary,
        }
    return {
        "id": str(c.id),
        "tier_id": str(c.tier_id),
        "civility": c.civility,
        "first_name": c.first_name,
        "last_name": c.last_name,
        "email": c.email,
        "phone": c.phone,
        "position": c.position,
        "department": c.department,
        "is_primary": c.is_primary,
        "active": c.active,
    }


# ─── Entity scoping ──────────────────────────────────────────────────────────

async def _resolve_entity_id(session: AsyncSession, entity_code: str | None) -> UUID:
    """Resolve the active entity UUID for the request.

    If ``entity_code`` is provided, look it up. Otherwise fall back to the
    first non-archived entity in the database (suitable for the single-tenant
    deployments we target today).
    """
    if entity_code:
        result = await session.execute(
            select(Entity).where(Entity.code == entity_code)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise ValueError(f"Entity with code '{entity_code}' not found")
        return entity.id

    result = await session.execute(
        select(Entity).where(Entity.active == True).limit(1)  # noqa: E712
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise ValueError("No active entity found — create an Entity first")
    return entity.id


# ─── Tier tools ──────────────────────────────────────────────────────────────

async def _list_tiers(args: dict) -> dict:
    """List companies with optional search and filters."""
    search = (args.get("search") or "").strip()
    tier_type = args.get("type")
    limit = int(args.get("limit", 20) or 20)
    if limit <= 0:
        limit = 20
    limit = min(limit, 200)
    include_archived = bool(args.get("include_archived", False))
    entity_code = args.get("entity_code")

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, entity_code)
        query = select(Tier).where(Tier.entity_id == entity_id)
        if not include_archived:
            query = query.where(Tier.archived == False)  # noqa: E712
        if tier_type:
            query = query.where(Tier.type == tier_type)
        if search:
            pattern = f"%{search}%"
            query = query.where(or_(
                sqla_func.lower(Tier.name).ilike(pattern.lower()),
                sqla_func.lower(Tier.code).ilike(pattern.lower()),
                sqla_func.lower(Tier.alias).ilike(pattern.lower()),
                sqla_func.lower(Tier.trade_name).ilike(pattern.lower()),
            ))
        query = query.order_by(Tier.code).limit(limit + 1)

        result = await session.execute(query)
        rows = result.scalars().all()

    more = len(rows) > limit
    items = [_tier_to_dict(t, compact=True) for t in rows[:limit]]
    return _ok({"count": len(items), "items": items, "has_more": more})


async def _get_tier(args: dict) -> dict:
    """Fetch a single company by id or code."""
    tier_id = args.get("id")
    code = args.get("code")
    entity_code = args.get("entity_code")
    if not tier_id and not code:
        raise ValueError("id ou code requis")

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, entity_code)
        if tier_id:
            query = select(Tier).where(Tier.id == UUID(str(tier_id)), Tier.entity_id == entity_id)
        else:
            query = select(Tier).where(Tier.code == code, Tier.entity_id == entity_id)
        result = await session.execute(query)
        tier = result.scalar_one_or_none()
        if tier is None:
            return _err(f"Tier introuvable ({'id=' + tier_id if tier_id else 'code=' + code})")
        return _ok(_tier_to_dict(tier))


_TIER_WRITABLE_FIELDS = frozenset({
    "name", "alias", "trade_name", "type", "email", "phone", "fax",
    "website", "legal_form", "registration_number", "tax_id", "vat_number",
    "capital", "currency", "industry", "payment_terms", "description",
    "address_line1", "address_line2", "city", "state", "zip_code", "country",
    "timezone", "language", "fiscal_year_start",
})


async def _create_tier(args: dict) -> dict:
    """Create a new company. Code is auto-generated via the TIR pattern."""
    name = (args.get("name") or "").strip()
    if not name:
        raise ValueError("name requis")

    entity_code = args.get("entity_code")
    payload = {k: v for k, v in args.items() if k in _TIER_WRITABLE_FIELDS}
    payload["name"] = name

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, entity_code)

        # Duplicate check (case-insensitive name)
        dup = await session.execute(
            select(Tier.id, Tier.code).where(
                Tier.entity_id == entity_id,
                Tier.archived == False,  # noqa: E712
                sqla_func.lower(Tier.name) == name.lower(),
            )
        )
        existing = dup.first()
        if existing:
            return _err(
                f"Un tiers nommé «{name}» existe déjà (code: {existing.code})"
            )

        payload["code"] = await generate_reference("TIR", session, entity_id=entity_id)
        tier = Tier(entity_id=entity_id, **payload)
        session.add(tier)
        await session.commit()
        await session.refresh(tier)
        logger.info("MCP opsflux: created tier %s '%s'", tier.code, tier.name)
        return _ok(_tier_to_dict(tier))


async def _update_tier(args: dict) -> dict:
    """Update selected fields on an existing company."""
    tier_id = args.get("id")
    if not tier_id:
        raise ValueError("id requis")
    updates = {k: v for k, v in args.items() if k in _TIER_WRITABLE_FIELDS}
    if not updates:
        raise ValueError("Aucun champ modifiable fourni")

    async with async_session_factory() as session:
        result = await session.execute(
            select(Tier).where(Tier.id == UUID(str(tier_id)))
        )
        tier = result.scalar_one_or_none()
        if tier is None:
            return _err(f"Tier id={tier_id} introuvable")

        for k, v in updates.items():
            setattr(tier, k, v)
        await session.commit()
        await session.refresh(tier)
        return _ok(_tier_to_dict(tier))


async def _delete_tier(args: dict) -> dict:
    """Archive (soft-delete) a company."""
    tier_id = args.get("id")
    if not tier_id:
        raise ValueError("id requis")

    async with async_session_factory() as session:
        result = await session.execute(
            select(Tier).where(Tier.id == UUID(str(tier_id)))
        )
        tier = result.scalar_one_or_none()
        if tier is None:
            return _err(f"Tier id={tier_id} introuvable")
        tier.archived = True
        tier.active = False
        await session.commit()
        return _ok({"archived": True, "id": str(tier.id), "code": tier.code})


# ─── Contact tools ───────────────────────────────────────────────────────────

async def _list_contacts(args: dict) -> dict:
    """List contacts, optionally filtered by tier_id and/or search."""
    tier_id = args.get("tier_id")
    search = (args.get("search") or "").strip()
    limit = int(args.get("limit", 20) or 20)
    if limit <= 0:
        limit = 20
    limit = min(limit, 200)

    async with async_session_factory() as session:
        query = select(TierContact).where(TierContact.active == True)  # noqa: E712
        if tier_id:
            query = query.where(TierContact.tier_id == UUID(str(tier_id)))
        if search:
            pattern = f"%{search.lower()}%"
            query = query.where(or_(
                sqla_func.lower(TierContact.first_name).ilike(pattern),
                sqla_func.lower(TierContact.last_name).ilike(pattern),
                sqla_func.lower(TierContact.email).ilike(pattern),
            ))
        query = query.order_by(TierContact.last_name, TierContact.first_name).limit(limit + 1)
        rows = (await session.execute(query)).scalars().all()

    more = len(rows) > limit
    items = [_contact_to_dict(c, compact=True) for c in rows[:limit]]
    return _ok({"count": len(items), "items": items, "has_more": more})


async def _get_contact(args: dict) -> dict:
    contact_id = args.get("id")
    if not contact_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        result = await session.execute(
            select(TierContact).where(TierContact.id == UUID(str(contact_id)))
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            return _err(f"Contact id={contact_id} introuvable")
        return _ok(_contact_to_dict(contact))


_CONTACT_WRITABLE_FIELDS = frozenset({
    "civility", "first_name", "last_name", "email", "phone",
    "position", "department", "is_primary",
})


async def _create_contact(args: dict) -> dict:
    tier_id = args.get("tier_id")
    first_name = (args.get("first_name") or "").strip()
    last_name = (args.get("last_name") or "").strip()
    if not tier_id:
        raise ValueError("tier_id requis")
    if not first_name or not last_name:
        raise ValueError("first_name et last_name requis")

    payload = {k: v for k, v in args.items() if k in _CONTACT_WRITABLE_FIELDS}
    payload["first_name"] = first_name
    payload["last_name"] = last_name

    async with async_session_factory() as session:
        tier_uuid = UUID(str(tier_id))
        tier_check = await session.execute(select(Tier.id).where(Tier.id == tier_uuid))
        if tier_check.scalar_one_or_none() is None:
            return _err(f"Tier id={tier_id} introuvable")

        contact = TierContact(tier_id=tier_uuid, **payload)
        session.add(contact)
        await session.commit()
        await session.refresh(contact)
        return _ok(_contact_to_dict(contact))


async def _update_contact(args: dict) -> dict:
    contact_id = args.get("id")
    if not contact_id:
        raise ValueError("id requis")
    updates = {k: v for k, v in args.items() if k in _CONTACT_WRITABLE_FIELDS}
    if not updates:
        raise ValueError("Aucun champ modifiable fourni")

    async with async_session_factory() as session:
        result = await session.execute(
            select(TierContact).where(TierContact.id == UUID(str(contact_id)))
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            return _err(f"Contact id={contact_id} introuvable")
        for k, v in updates.items():
            setattr(contact, k, v)
        await session.commit()
        await session.refresh(contact)
        return _ok(_contact_to_dict(contact))


async def _archive_contact(args: dict) -> dict:
    contact_id = args.get("id")
    if not contact_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        result = await session.execute(
            select(TierContact).where(TierContact.id == UUID(str(contact_id)))
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            return _err(f"Contact id={contact_id} introuvable")
        contact.active = False
        await session.commit()
        return _ok({"archived": True, "id": str(contact.id)})


# ─── Polymorphic helpers (phones, emails, addresses, tags, notes) ─────────────

_VALID_OWNER_TYPES = frozenset({"tier", "tier_contact"})


def _validate_owner(owner_type: str, owner_id: str) -> tuple[str, UUID]:
    if owner_type not in _VALID_OWNER_TYPES:
        raise ValueError(
            f"owner_type doit être 'tier' ou 'tier_contact' (reçu: '{owner_type}')"
        )
    try:
        return owner_type, UUID(str(owner_id))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"owner_id invalide: {exc}")


async def _owner_exists(session: AsyncSession, owner_type: str, owner_id: UUID) -> bool:
    if owner_type == "tier":
        result = await session.execute(select(Tier.id).where(Tier.id == owner_id))
    else:
        result = await session.execute(select(TierContact.id).where(TierContact.id == owner_id))
    return result.scalar_one_or_none() is not None


# ─── Phones ────────────────────────────────────────────────────────────────

def _phone_to_dict(p: Phone) -> dict:
    return {
        "id": str(p.id),
        "owner_type": p.owner_type,
        "owner_id": str(p.owner_id),
        "label": p.label,
        "number": p.number,
        "country_code": p.country_code,
        "is_default": p.is_default,
        "verified": p.verified,
    }


async def _list_phones(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(Phone).where(
                Phone.owner_type == owner_type,
                Phone.owner_id == owner_id,
            ).order_by(Phone.is_default.desc(), Phone.label)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_phone_to_dict(p) for p in rows]})


async def _add_phone(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    number = (args.get("number") or "").strip()
    if not number:
        raise ValueError("number requis")
    label = (args.get("label") or "mobile").strip()
    country_code = args.get("country_code")
    is_default = bool(args.get("is_default", False))
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        if is_default:
            # Unset any existing default on the same owner
            existing = (await session.execute(
                select(Phone).where(
                    Phone.owner_type == owner_type,
                    Phone.owner_id == owner_id,
                    Phone.is_default == True,  # noqa: E712
                )
            )).scalars().all()
            for p in existing:
                p.is_default = False
        phone = Phone(
            owner_type=owner_type, owner_id=owner_id,
            label=label, number=number,
            country_code=country_code,
            is_default=is_default,
        )
        session.add(phone)
        await session.commit()
        await session.refresh(phone)
        return _ok(_phone_to_dict(phone))


async def _delete_phone(args: dict) -> dict:
    phone_id = args.get("id")
    if not phone_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        phone = (await session.execute(
            select(Phone).where(Phone.id == UUID(str(phone_id)))
        )).scalar_one_or_none()
        if phone is None:
            return _err(f"Phone id={phone_id} introuvable")
        await session.delete(phone)
        await session.commit()
        return _ok({"deleted": True, "id": str(phone_id)})


# ─── Emails (contact_emails) ───────────────────────────────────────────────

def _email_to_dict(e: ContactEmail) -> dict:
    return {
        "id": str(e.id),
        "owner_type": e.owner_type,
        "owner_id": str(e.owner_id),
        "label": e.label,
        "email": e.email,
        "is_default": e.is_default,
        "verified": e.verified,
    }


async def _list_emails(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(ContactEmail).where(
                ContactEmail.owner_type == owner_type,
                ContactEmail.owner_id == owner_id,
            ).order_by(ContactEmail.is_default.desc(), ContactEmail.label)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_email_to_dict(e) for e in rows]})


async def _add_email(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    email = (args.get("email") or "").strip()
    if not email or "@" not in email:
        raise ValueError("email valide requis")
    label = (args.get("label") or "work").strip()
    is_default = bool(args.get("is_default", False))
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        if is_default:
            existing = (await session.execute(
                select(ContactEmail).where(
                    ContactEmail.owner_type == owner_type,
                    ContactEmail.owner_id == owner_id,
                    ContactEmail.is_default == True,  # noqa: E712
                )
            )).scalars().all()
            for e in existing:
                e.is_default = False
        obj = ContactEmail(
            owner_type=owner_type, owner_id=owner_id,
            label=label, email=email, is_default=is_default,
        )
        session.add(obj)
        await session.commit()
        await session.refresh(obj)
        return _ok(_email_to_dict(obj))


async def _delete_email(args: dict) -> dict:
    email_id = args.get("id")
    if not email_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        obj = (await session.execute(
            select(ContactEmail).where(ContactEmail.id == UUID(str(email_id)))
        )).scalar_one_or_none()
        if obj is None:
            return _err(f"Email id={email_id} introuvable")
        await session.delete(obj)
        await session.commit()
        return _ok({"deleted": True, "id": str(email_id)})


# ─── Addresses ─────────────────────────────────────────────────────────────

def _address_to_dict(a: Address) -> dict:
    return {
        "id": str(a.id),
        "owner_type": a.owner_type,
        "owner_id": str(a.owner_id),
        "label": a.label,
        "address_line1": a.address_line1,
        "address_line2": a.address_line2,
        "city": a.city,
        "state_province": a.state_province,
        "postal_code": a.postal_code,
        "country": a.country,
        "latitude": a.latitude,
        "longitude": a.longitude,
        "is_default": a.is_default,
    }


async def _list_addresses(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(Address).where(
                Address.owner_type == owner_type,
                Address.owner_id == owner_id,
            ).order_by(Address.is_default.desc(), Address.label)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_address_to_dict(a) for a in rows]})


async def _add_address(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    line1 = (args.get("address_line1") or "").strip()
    city = (args.get("city") or "").strip()
    country = (args.get("country") or "").strip()
    if not line1 or not city or not country:
        raise ValueError("address_line1, city et country requis")
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        addr = Address(
            owner_type=owner_type, owner_id=owner_id,
            label=(args.get("label") or "main").strip(),
            address_line1=line1,
            address_line2=args.get("address_line2"),
            city=city,
            state_province=args.get("state_province"),
            postal_code=args.get("postal_code"),
            country=country,
            latitude=args.get("latitude"),
            longitude=args.get("longitude"),
            is_default=bool(args.get("is_default", False)),
        )
        session.add(addr)
        await session.commit()
        await session.refresh(addr)
        return _ok(_address_to_dict(addr))


async def _delete_address(args: dict) -> dict:
    addr_id = args.get("id")
    if not addr_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        obj = (await session.execute(
            select(Address).where(Address.id == UUID(str(addr_id)))
        )).scalar_one_or_none()
        if obj is None:
            return _err(f"Address id={addr_id} introuvable")
        await session.delete(obj)
        await session.commit()
        return _ok({"deleted": True, "id": str(addr_id)})


# ─── Notes ─────────────────────────────────────────────────────────────────

def _note_to_dict(n: Note) -> dict:
    return {
        "id": str(n.id),
        "owner_type": n.owner_type,
        "owner_id": str(n.owner_id),
        "content": n.content,
        "visibility": n.visibility,
        "pinned": n.pinned,
        "created_by": str(n.created_by),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


async def _list_notes(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(Note).where(
                Note.owner_type == owner_type,
                Note.owner_id == owner_id,
            ).order_by(Note.pinned.desc(), Note.created_at.desc())
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_note_to_dict(n) for n in rows]})


async def _add_note(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    content = (args.get("content") or "").strip()
    if not content:
        raise ValueError("content requis")
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        # Default author: the first admin user (system write via MCP has no session user).
        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif pour signer la note")
        note = Note(
            owner_type=owner_type, owner_id=owner_id,
            content=content,
            visibility=args.get("visibility", "public"),
            pinned=bool(args.get("pinned", False)),
            created_by=admin,
        )
        session.add(note)
        await session.commit()
        await session.refresh(note)
        return _ok(_note_to_dict(note))


async def _delete_note(args: dict) -> dict:
    note_id = args.get("id")
    if not note_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        obj = (await session.execute(
            select(Note).where(Note.id == UUID(str(note_id)))
        )).scalar_one_or_none()
        if obj is None:
            return _err(f"Note id={note_id} introuvable")
        await session.delete(obj)
        await session.commit()
        return _ok({"deleted": True, "id": str(note_id)})


# ─── Tags ──────────────────────────────────────────────────────────────────

def _tag_to_dict(t: Tag) -> dict:
    return {
        "id": str(t.id),
        "owner_type": t.owner_type,
        "owner_id": str(t.owner_id),
        "name": t.name,
        "color": t.color,
        "visibility": t.visibility,
    }


async def _list_tags(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(Tag).where(
                Tag.owner_type == owner_type,
                Tag.owner_id == owner_id,
            ).order_by(Tag.name)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_tag_to_dict(t) for t in rows]})


async def _add_tag(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    name = (args.get("name") or "").strip()
    if not name:
        raise ValueError("name requis")
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif")
        tag = Tag(
            owner_type=owner_type, owner_id=owner_id,
            name=name,
            color=args.get("color", "#6b7280"),
            visibility=args.get("visibility", "public"),
            created_by=admin,
        )
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return _ok(_tag_to_dict(tag))


async def _delete_tag(args: dict) -> dict:
    tag_id = args.get("id")
    if not tag_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        obj = (await session.execute(
            select(Tag).where(Tag.id == UUID(str(tag_id)))
        )).scalar_one_or_none()
        if obj is None:
            return _err(f"Tag id={tag_id} introuvable")
        await session.delete(obj)
        await session.commit()
        return _ok({"deleted": True, "id": str(tag_id)})


# ─── Legal Identifiers ─────────────────────────────────────────────────────

def _legal_id_to_dict(li: LegalIdentifier) -> dict:
    return {
        "id": str(li.id),
        "owner_type": li.owner_type,
        "owner_id": str(li.owner_id),
        "type": li.type,
        "value": li.value,
        "country": li.country,
        "issued_at": li.issued_at,
        "expires_at": li.expires_at,
    }


async def _list_legal_identifiers(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(LegalIdentifier).where(
                LegalIdentifier.owner_type == owner_type,
                LegalIdentifier.owner_id == owner_id,
            ).order_by(LegalIdentifier.type)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_legal_id_to_dict(li) for li in rows]})


async def _add_legal_identifier(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    type_ = (args.get("type") or "").strip()
    value = (args.get("value") or "").strip()
    if not type_ or not value:
        raise ValueError("type et value requis")
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        li = LegalIdentifier(
            owner_type=owner_type, owner_id=owner_id,
            type=type_, value=value,
            country=args.get("country"),
            issued_at=args.get("issued_at"),
            expires_at=args.get("expires_at"),
        )
        session.add(li)
        await session.commit()
        await session.refresh(li)
        return _ok(_legal_id_to_dict(li))


async def _delete_legal_identifier(args: dict) -> dict:
    li_id = args.get("id")
    if not li_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        obj = (await session.execute(
            select(LegalIdentifier).where(LegalIdentifier.id == UUID(str(li_id)))
        )).scalar_one_or_none()
        if obj is None:
            return _err(f"LegalIdentifier id={li_id} introuvable")
        await session.delete(obj)
        await session.commit()
        return _ok({"deleted": True, "id": str(li_id)})


# ─── External references ───────────────────────────────────────────────────

def _ext_ref_to_dict(r: ExternalReference) -> dict:
    return {
        "id": str(r.id),
        "owner_type": r.owner_type,
        "owner_id": str(r.owner_id),
        "system": r.system,
        "code": r.code,
    }


async def _list_external_refs(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(ExternalReference).where(
                ExternalReference.owner_type == owner_type,
                ExternalReference.owner_id == owner_id,
            ).order_by(ExternalReference.system)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_ext_ref_to_dict(r) for r in rows]})


async def _add_external_ref(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    system = (args.get("system") or "").strip()
    code = (args.get("code") or "").strip()
    if not system or not code:
        raise ValueError("system et code requis")
    async with async_session_factory() as session:
        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")
        ref = ExternalReference(
            owner_type=owner_type, owner_id=owner_id,
            system=system, code=code,
        )
        session.add(ref)
        await session.commit()
        await session.refresh(ref)
        return _ok(_ext_ref_to_dict(ref))


# ─── Tier blocks ───────────────────────────────────────────────────────────

async def _block_tier(args: dict) -> dict:
    tier_id = args.get("id")
    reason = (args.get("reason") or "").strip()
    if not tier_id:
        raise ValueError("id requis")
    if not reason:
        raise ValueError("reason requis")
    block_type = args.get("block_type", "all")

    async with async_session_factory() as session:
        tier = (await session.execute(
            select(Tier).where(Tier.id == UUID(str(tier_id)))
        )).scalar_one_or_none()
        if tier is None:
            return _err(f"Tier id={tier_id} introuvable")
        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif")
        block = TierBlock(
            entity_id=tier.entity_id,
            tier_id=tier.id,
            action="block",
            reason=reason,
            block_type=block_type,
            performed_by=admin,
        )
        tier.is_blocked = True
        session.add(block)
        await session.commit()
        return _ok({"id": str(tier.id), "code": tier.code, "is_blocked": True, "block_type": block_type})


async def _unblock_tier(args: dict) -> dict:
    tier_id = args.get("id")
    reason = (args.get("reason") or "").strip()
    if not tier_id:
        raise ValueError("id requis")
    if not reason:
        raise ValueError("reason requis")

    async with async_session_factory() as session:
        tier = (await session.execute(
            select(Tier).where(Tier.id == UUID(str(tier_id)))
        )).scalar_one_or_none()
        if tier is None:
            return _err(f"Tier id={tier_id} introuvable")
        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        block = TierBlock(
            entity_id=tier.entity_id,
            tier_id=tier.id,
            action="unblock",
            reason=reason,
            block_type="all",
            performed_by=admin,
        )
        tier.is_blocked = False
        session.add(block)
        await session.commit()
        return _ok({"id": str(tier.id), "code": tier.code, "is_blocked": False})


async def _list_tier_blocks(args: dict) -> dict:
    tier_id = args.get("tier_id")
    if not tier_id:
        raise ValueError("tier_id requis")
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(TierBlock).where(
                TierBlock.tier_id == UUID(str(tier_id))
            ).order_by(TierBlock.created_at.desc())
        )).scalars().all()
    items = [
        {
            "id": str(b.id),
            "action": b.action,
            "reason": b.reason,
            "block_type": b.block_type,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in rows
    ]
    return _ok({"count": len(items), "items": items})


# ─── Compliance ────────────────────────────────────────────────────────────

async def _check_compliance(args: dict) -> dict:
    """Run the canonical compliance verdict for a tier or contact."""
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    from app.services.modules.compliance_service import check_owner_compliance

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        try:
            verdict = await check_owner_compliance(
                session,
                owner_type=owner_type,
                owner_id=owner_id,
                entity_id=entity_id,
            )
        except Exception as exc:
            logger.exception("MCP: compliance check failed")
            return _err(f"Erreur check conformité: {exc}")
    return _ok(verdict)


def _compliance_record_to_dict(r: ComplianceRecord, type_name: str | None = None) -> dict:
    return {
        "id": str(r.id),
        "compliance_type_id": str(r.compliance_type_id),
        "compliance_type_name": type_name,
        "owner_type": r.owner_type,
        "owner_id": str(r.owner_id),
        "status": r.status,
        "issued_at": r.issued_at.isoformat() if r.issued_at else None,
        "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        "issuer": r.issuer,
        "reference_number": r.reference_number,
        "notes": r.notes,
        "active": r.active,
    }


async def _list_compliance_records(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(ComplianceRecord, ComplianceType.name)
            .join(ComplianceType, ComplianceType.id == ComplianceRecord.compliance_type_id)
            .where(
                ComplianceRecord.owner_type == owner_type,
                ComplianceRecord.owner_id == owner_id,
                ComplianceRecord.active == True,  # noqa: E712
            ).order_by(ComplianceRecord.expires_at.desc().nulls_last())
        )).all()
    items = [_compliance_record_to_dict(rec, type_name) for rec, type_name in rows]
    return _ok({"count": len(items), "items": items})


async def _add_compliance_record(args: dict) -> dict:
    owner_type, owner_id = _validate_owner(args.get("owner_type", ""), args.get("owner_id", ""))
    compliance_type = args.get("compliance_type_id") or args.get("compliance_type_code")
    if not compliance_type:
        raise ValueError("compliance_type_id ou compliance_type_code requis")

    def _parse_dt(s: str | None) -> datetime | None:
        if not s:
            return None
        try:
            if len(s) == 10:  # YYYY-MM-DD
                return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"Date invalide '{s}': {exc}")

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        # Resolve compliance type (by id or code)
        ct_query = select(ComplianceType).where(ComplianceType.entity_id == entity_id)
        try:
            ct_query = ct_query.where(ComplianceType.id == UUID(str(compliance_type)))
        except (TypeError, ValueError):
            ct_query = ct_query.where(ComplianceType.code == str(compliance_type))
        ct = (await session.execute(ct_query)).scalar_one_or_none()
        if ct is None:
            return _err(f"Type de conformité introuvable: {compliance_type}")

        if not await _owner_exists(session, owner_type, owner_id):
            return _err(f"{owner_type} id={owner_id} introuvable")

        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif")

        record = ComplianceRecord(
            entity_id=entity_id,
            compliance_type_id=ct.id,
            owner_type=owner_type,
            owner_id=owner_id,
            status=args.get("status", "valid"),
            issued_at=_parse_dt(args.get("issued_at")),
            expires_at=_parse_dt(args.get("expires_at")),
            issuer=args.get("issuer"),
            reference_number=args.get("reference_number"),
            notes=args.get("notes"),
            created_by=admin,
            active=True,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        return _ok(_compliance_record_to_dict(record, ct.name))


# ─── Contact transfer ─────────────────────────────────────────────────────

async def _transfer_contact(args: dict) -> dict:
    """Move a contact from one tier to another and log the transfer."""
    contact_id = args.get("contact_id")
    to_tier_id = args.get("to_tier_id")
    reason = (args.get("reason") or "").strip()
    if not contact_id or not to_tier_id:
        raise ValueError("contact_id et to_tier_id requis")
    if not reason:
        raise ValueError("reason requis (historisé sur le transfert)")

    transfer_date_str = args.get("transfer_date")
    try:
        transfer_date = (
            datetime.fromisoformat(transfer_date_str.replace("Z", "+00:00"))
            if transfer_date_str
            else datetime.now(timezone.utc)
        )
    except ValueError as exc:
        raise ValueError(f"transfer_date invalide: {exc}")

    async with async_session_factory() as session:
        contact = (await session.execute(
            select(TierContact).where(TierContact.id == UUID(str(contact_id)))
        )).scalar_one_or_none()
        if contact is None:
            return _err(f"Contact id={contact_id} introuvable")

        to_tier = (await session.execute(
            select(Tier).where(Tier.id == UUID(str(to_tier_id)))
        )).scalar_one_or_none()
        if to_tier is None:
            return _err(f"Tier cible id={to_tier_id} introuvable")

        from_tier_id = contact.tier_id
        if from_tier_id == to_tier.id:
            return _err("Le contact est déjà rattaché à cette entreprise")

        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif pour signer le transfert")

        transfer = TierContactTransfer(
            contact_id=contact.id,
            from_tier_id=from_tier_id,
            to_tier_id=to_tier.id,
            transfer_date=transfer_date,
            reason=reason,
            transferred_by=admin,
        )
        session.add(transfer)
        contact.tier_id = to_tier.id
        await session.commit()
        await session.refresh(transfer)

        from_tier = (await session.execute(
            select(Tier).where(Tier.id == from_tier_id)
        )).scalar_one_or_none()

        return _ok({
            "id": str(transfer.id),
            "contact_id": str(contact.id),
            "contact_name": f"{contact.first_name} {contact.last_name}",
            "from_tier_id": str(from_tier_id),
            "from_tier_name": from_tier.name if from_tier else None,
            "to_tier_id": str(to_tier.id),
            "to_tier_name": to_tier.name,
            "transfer_date": transfer.transfer_date.isoformat(),
            "reason": transfer.reason,
        })


async def _list_contact_transfers(args: dict) -> dict:
    """List a contact's transfer history."""
    contact_id = args.get("contact_id")
    if not contact_id:
        raise ValueError("contact_id requis")

    async with async_session_factory() as session:
        from_tier = Tier.__table__.alias("from_tier")
        to_tier = Tier.__table__.alias("to_tier")
        rows = (await session.execute(
            select(
                TierContactTransfer,
                from_tier.c.name.label("from_name"),
                from_tier.c.code.label("from_code"),
                to_tier.c.name.label("to_name"),
                to_tier.c.code.label("to_code"),
            )
            .join(from_tier, TierContactTransfer.from_tier_id == from_tier.c.id)
            .join(to_tier, TierContactTransfer.to_tier_id == to_tier.c.id)
            .where(TierContactTransfer.contact_id == UUID(str(contact_id)))
            .order_by(TierContactTransfer.transfer_date.desc())
        )).all()

    items = [
        {
            "id": str(row[0].id),
            "transfer_date": row[0].transfer_date.isoformat(),
            "reason": row[0].reason,
            "from_tier_id": str(row[0].from_tier_id),
            "from_tier_name": row[1],
            "from_tier_code": row[2],
            "to_tier_id": str(row[0].to_tier_id),
            "to_tier_name": row[3],
            "to_tier_code": row[4],
        }
        for row in rows
    ]
    return _ok({"count": len(items), "items": items})


async def _list_compliance_types(args: dict) -> dict:
    """List available compliance types for the current entity."""
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        rows = (await session.execute(
            select(ComplianceType).where(
                ComplianceType.entity_id == entity_id,
                ComplianceType.active == True,  # noqa: E712
            ).order_by(ComplianceType.category, ComplianceType.name)
        )).scalars().all()
    items = [
        {
            "id": str(ct.id),
            "code": ct.code,
            "name": ct.name,
            "category": ct.category,
            "description": ct.description,
            "validity_days": ct.validity_days,
            "is_mandatory": ct.is_mandatory,
        }
        for ct in rows
    ]
    return _ok({"count": len(items), "items": items})


# ═══════════════════════════════════════════════════════════════════════════════
# Asset Registry (sites + installations)
# ═══════════════════════════════════════════════════════════════════════════════


def _site_to_dict(s: OilSite) -> dict:
    return {
        "id": str(s.id),
        "code": s.code,
        "name": s.name,
        "site_type": s.site_type,
        "environment": s.environment,
        "country": s.country,
        "region": s.region,
        "status": s.status,
        "manned": s.manned,
        "pob_capacity": s.pob_capacity,
        "latitude": float(s.latitude) if s.latitude is not None else None,
        "longitude": float(s.longitude) if s.longitude is not None else None,
    }


def _installation_to_dict(inst: Installation, *, compact: bool = False) -> dict:
    if compact:
        return {
            "id": str(inst.id),
            "code": inst.code,
            "name": inst.name,
            "installation_type": inst.installation_type,
            "environment": inst.environment,
            "status": inst.status,
            "site_id": str(inst.site_id),
        }
    return {
        "id": str(inst.id),
        "code": inst.code,
        "name": inst.name,
        "site_id": str(inst.site_id),
        "installation_type": inst.installation_type,
        "environment": inst.environment,
        "status": inst.status,
        "is_manned": inst.is_manned,
        "is_normally_unmanned": inst.is_normally_unmanned,
        "pob_max": inst.pob_max,
        "helideck_available": inst.helideck_available,
        "latitude": float(inst.latitude) if inst.latitude is not None else None,
        "longitude": float(inst.longitude) if inst.longitude is not None else None,
        "installation_date": inst.installation_date.isoformat() if inst.installation_date else None,
        "commissioning_date": inst.commissioning_date.isoformat() if inst.commissioning_date else None,
        "design_life_years": inst.design_life_years,
        "notes": inst.notes,
    }


async def _list_sites(args: dict) -> dict:
    """List oil sites with optional search."""
    search = (args.get("search") or "").strip()
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(OilSite).where(
            OilSite.entity_id == entity_id,
            OilSite.deleted_at.is_(None),
        )
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(
                or_(
                    sqla_func.lower(OilSite.code).like(needle),
                    sqla_func.lower(OilSite.name).like(needle),
                )
            )
        query = query.order_by(OilSite.code).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({
        "count": len(rows),
        "items": [_site_to_dict(s) for s in rows],
    })


async def _list_assets(args: dict) -> dict:
    """List installations (assets). Optional filters: site_id, status, search."""
    search = (args.get("search") or "").strip()
    site_id_str = args.get("site_id")
    status_filter = args.get("status")
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Installation).where(
            Installation.entity_id == entity_id,
            Installation.deleted_at.is_(None),
        )
        if site_id_str:
            try:
                query = query.where(Installation.site_id == UUID(str(site_id_str)))
            except ValueError:
                return _err(f"site_id invalide: {site_id_str}")
        if status_filter:
            query = query.where(Installation.status == status_filter)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(
                or_(
                    sqla_func.lower(Installation.code).like(needle),
                    sqla_func.lower(Installation.name).like(needle),
                )
            )
        query = query.order_by(Installation.code).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({
        "count": len(rows),
        "items": [_installation_to_dict(r, compact=True) for r in rows],
    })


async def _get_asset(args: dict) -> dict:
    """Get an installation (asset) by id or by code."""
    asset_id = args.get("id")
    code = args.get("code")
    if not asset_id and not code:
        raise ValueError("id ou code requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Installation).where(
            Installation.entity_id == entity_id,
            Installation.deleted_at.is_(None),
        )
        if asset_id:
            try:
                query = query.where(Installation.id == UUID(str(asset_id)))
            except ValueError:
                return _err(f"id invalide: {asset_id}")
        else:
            query = query.where(Installation.code == str(code))
        inst = (await session.execute(query)).scalar_one_or_none()
        if inst is None:
            return _err("Asset introuvable")
    return _ok(_installation_to_dict(inst))


async def _list_fields(args: dict) -> dict:
    """List oil fields."""
    search = (args.get("search") or "").strip()
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(OilField).where(OilField.entity_id == entity_id, OilField.deleted_at.is_(None))
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(or_(sqla_func.lower(OilField.code).like(needle), sqla_func.lower(OilField.name).like(needle)))
        query = query.order_by(OilField.code).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(f.id), "code": f.code, "name": f.name, "country": f.country, "operator": f.operator, "status": f.status}
        for f in rows
    ]})


async def _get_field(args: dict) -> dict:
    """Get an oil field by id or code."""
    fid = args.get("id") or args.get("code")
    if not fid:
        raise ValueError("id ou code requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(OilField).where(OilField.entity_id == entity_id, OilField.deleted_at.is_(None))
        try:
            query = query.where(OilField.id == UUID(str(fid)))
        except (TypeError, ValueError):
            query = query.where(OilField.code == str(fid))
        f = (await session.execute(query)).scalar_one_or_none()
        if not f:
            return _err("Champ petrolier introuvable")
    return _ok({"id": str(f.id), "code": f.code, "name": f.name, "country": f.country,
                "operator": f.operator, "basin": f.basin, "status": f.status,
                "discovery_date": f.discovery_date.isoformat() if f.discovery_date else None,
                "working_interest_pct": float(f.working_interest_pct) if f.working_interest_pct else None,
                "notes": (f.notes or "")[:500]})


async def _list_equipment(args: dict) -> dict:
    """List equipment. Optional filters: installation_id, equipment_class, status, search."""
    search = (args.get("search") or "").strip()
    inst_id = args.get("installation_id")
    eq_class = args.get("equipment_class")
    status_filter = args.get("status")
    limit = min(max(int(args.get("limit", 30) or 30), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(RegistryEquipment).where(RegistryEquipment.entity_id == entity_id, RegistryEquipment.deleted_at.is_(None))
        if inst_id:
            try:
                query = query.where(RegistryEquipment.installation_id == UUID(str(inst_id)))
            except ValueError:
                return _err(f"installation_id invalide: {inst_id}")
        if eq_class:
            query = query.where(RegistryEquipment.equipment_class == eq_class)
        if status_filter:
            query = query.where(RegistryEquipment.status == status_filter)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(or_(sqla_func.lower(RegistryEquipment.tag_number).like(needle), sqla_func.lower(RegistryEquipment.name).like(needle)))
        query = query.order_by(RegistryEquipment.tag_number).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(e.id), "tag_number": e.tag_number, "name": e.name, "equipment_class": e.equipment_class,
         "status": e.status, "manufacturer": e.manufacturer, "installation_id": str(e.installation_id) if e.installation_id else None}
        for e in rows
    ]})


async def _get_equipment(args: dict) -> dict:
    """Get equipment by id or tag_number."""
    eid = args.get("id") or args.get("tag_number")
    if not eid:
        raise ValueError("id ou tag_number requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(RegistryEquipment).where(RegistryEquipment.entity_id == entity_id, RegistryEquipment.deleted_at.is_(None))
        try:
            query = query.where(RegistryEquipment.id == UUID(str(eid)))
        except (TypeError, ValueError):
            query = query.where(RegistryEquipment.tag_number == str(eid))
        e = (await session.execute(query)).scalar_one_or_none()
        if not e:
            return _err("Equipement introuvable")
    return _ok({"id": str(e.id), "tag_number": e.tag_number, "name": e.name, "equipment_class": e.equipment_class,
                "status": e.status, "manufacturer": e.manufacturer, "model": e.model, "serial_number": e.serial_number,
                "installation_id": str(e.installation_id) if e.installation_id else None,
                "commissioning_date": e.commissioning_date.isoformat() if e.commissioning_date else None,
                "design_pressure_bar": float(e.design_pressure_bar) if e.design_pressure_bar else None,
                "design_temperature_c": float(e.design_temperature_c) if e.design_temperature_c else None,
                "weight_kg": float(e.weight_kg) if e.weight_kg else None,
                "notes": (e.notes or "")[:500]})


async def _get_asset_hierarchy(args: dict) -> dict:
    """Get the full Field > Site > Installation hierarchy tree."""
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        fields = (await session.execute(
            select(OilField).where(OilField.entity_id == entity_id, OilField.deleted_at.is_(None)).order_by(OilField.code)
        )).scalars().all()
        sites = (await session.execute(
            select(OilSite).where(OilSite.entity_id == entity_id, OilSite.deleted_at.is_(None)).order_by(OilSite.code)
        )).scalars().all()
        installations = (await session.execute(
            select(Installation).where(Installation.entity_id == entity_id, Installation.deleted_at.is_(None)).order_by(Installation.code)
        )).scalars().all()
    site_map: dict[str, list] = {}
    for s in sites:
        fid = str(s.field_id) if s.field_id else "__none__"
        site_map.setdefault(fid, []).append(s)
    inst_map: dict[str, list] = {}
    for i in installations:
        sid = str(i.site_id)
        inst_map.setdefault(sid, []).append(i)
    tree = []
    for f in fields:
        field_sites = site_map.get(str(f.id), [])
        tree.append({
            "type": "field", "id": str(f.id), "code": f.code, "name": f.name,
            "sites": [{
                "type": "site", "id": str(s.id), "code": s.code, "name": s.name,
                "installations": [{"type": "installation", "id": str(i.id), "code": i.code, "name": i.name,
                                   "status": i.status, "type_detail": i.installation_type} for i in inst_map.get(str(s.id), [])]
            } for s in field_sites]
        })
    return _ok({"fields": len(fields), "sites": len(sites), "installations": len(installations), "tree": tree})


# ═══════════════════════════════════════════════════════════════════════════════
# PaxLog — ADS, PAX profiles
# ═══════════════════════════════════════════════════════════════════════════════


async def _list_ads(args: dict) -> dict:
    """List ADS (Autorisations De Sortie). Filters: status, type, search, limit."""
    search = (args.get("search") or "").strip()
    status_filter = args.get("status")
    ads_type = args.get("type")
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Ads).where(Ads.entity_id == entity_id, Ads.deleted_at.is_(None))
        if status_filter:
            query = query.where(Ads.status == status_filter)
        if ads_type:
            query = query.where(Ads.type == ads_type)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(or_(sqla_func.lower(Ads.reference).like(needle), sqla_func.lower(Ads.visit_purpose).like(needle)))
        query = query.order_by(Ads.created_at.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(a.id), "reference": a.reference, "type": a.type, "status": a.status,
         "visit_purpose": (a.visit_purpose or "")[:100], "visit_category": a.visit_category,
         "start_date": a.start_date.isoformat() if a.start_date else None,
         "end_date": a.end_date.isoformat() if a.end_date else None,
         "created_at": a.created_at.isoformat() if a.created_at else None}
        for a in rows
    ]})


async def _get_ads(args: dict) -> dict:
    """Get an ADS by id or reference."""
    aid = args.get("id") or args.get("reference")
    if not aid:
        raise ValueError("id ou reference requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Ads).where(Ads.entity_id == entity_id, Ads.deleted_at.is_(None))
        try:
            query = query.where(Ads.id == UUID(str(aid)))
        except (TypeError, ValueError):
            query = query.where(Ads.reference == str(aid))
        a = (await session.execute(query)).scalar_one_or_none()
        if not a:
            return _err("ADS introuvable")
        # Count PAX
        pax_count = (await session.execute(
            select(sqla_func.count(AdsPax.id)).where(AdsPax.ads_id == a.id)
        )).scalar() or 0
    return _ok({"id": str(a.id), "reference": a.reference, "type": a.type, "status": a.status,
                "visit_purpose": a.visit_purpose, "visit_category": a.visit_category,
                "start_date": a.start_date.isoformat() if a.start_date else None,
                "end_date": a.end_date.isoformat() if a.end_date else None,
                "outbound_transport_mode": a.outbound_transport_mode,
                "return_transport_mode": a.return_transport_mode,
                "cross_company_flag": a.cross_company_flag,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "approved_at": a.approved_at.isoformat() if a.approved_at else None,
                "pax_count": pax_count,
                "created_at": a.created_at.isoformat() if a.created_at else None})


async def _list_pax_groups(args: dict) -> dict:
    """List PAX groups."""
    search = (args.get("search") or "").strip()
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(PaxGroup).where(PaxGroup.entity_id == entity_id, PaxGroup.active == True)  # noqa: E712
        if search:
            query = query.where(sqla_func.lower(PaxGroup.name).like(f"%{search.lower()}%"))
        query = query.order_by(PaxGroup.name).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(g.id), "name": g.name, "company_id": str(g.company_id) if g.company_id else None}
        for g in rows
    ]})


# ═══════════════════════════════════════════════════════════════════════════════
# Planner — activities, conflicts
# ═══════════════════════════════════════════════════════════════════════════════


async def _list_planner_activities(args: dict) -> dict:
    """List planner activities. Filters: status, type, asset_id, priority, search, limit."""
    search = (args.get("search") or "").strip()
    status_filter = args.get("status")
    act_type = args.get("type")
    asset_id = args.get("asset_id")
    priority = args.get("priority")
    limit = min(max(int(args.get("limit", 30) or 30), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(PlannerActivity).where(PlannerActivity.entity_id == entity_id, PlannerActivity.deleted_at.is_(None))
        if status_filter:
            query = query.where(PlannerActivity.status == status_filter)
        if act_type:
            query = query.where(PlannerActivity.type == act_type)
        if asset_id:
            try:
                query = query.where(PlannerActivity.asset_id == UUID(str(asset_id)))
            except ValueError:
                return _err(f"asset_id invalide: {asset_id}")
        if priority:
            query = query.where(PlannerActivity.priority == priority)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(sqla_func.lower(PlannerActivity.title).like(needle))
        query = query.order_by(PlannerActivity.start_date.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(a.id), "title": a.title, "type": a.type, "status": a.status,
         "priority": a.priority, "pax_quota": a.pax_quota,
         "asset_id": str(a.asset_id) if a.asset_id else None,
         "start_date": a.start_date.isoformat() if a.start_date else None,
         "end_date": a.end_date.isoformat() if a.end_date else None}
        for a in rows
    ]})


async def _get_planner_activity(args: dict) -> dict:
    """Get a planner activity by id."""
    aid = args.get("id")
    if not aid:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(PlannerActivity).where(
            PlannerActivity.entity_id == entity_id, PlannerActivity.deleted_at.is_(None),
            PlannerActivity.id == UUID(str(aid)))
        a = (await session.execute(query)).scalar_one_or_none()
        if not a:
            return _err("Activite introuvable")
    return _ok({"id": str(a.id), "title": a.title, "type": a.type, "subtype": a.subtype,
                "status": a.status, "priority": a.priority, "pax_quota": a.pax_quota,
                "description": (a.description or "")[:500],
                "asset_id": str(a.asset_id) if a.asset_id else None,
                "project_id": str(a.project_id) if a.project_id else None,
                "start_date": a.start_date.isoformat() if a.start_date else None,
                "end_date": a.end_date.isoformat() if a.end_date else None,
                "actual_start": a.actual_start.isoformat() if a.actual_start else None,
                "actual_end": a.actual_end.isoformat() if a.actual_end else None,
                "well_reference": a.well_reference, "rig_name": a.rig_name,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "validated_at": a.validated_at.isoformat() if a.validated_at else None,
                "created_at": a.created_at.isoformat() if a.created_at else None})


async def _list_planner_conflicts(args: dict) -> dict:
    """List active planner conflicts."""
    limit = min(max(int(args.get("limit", 20) or 20), 1), 100)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(PlannerConflict).where(
            PlannerConflict.entity_id == entity_id,
            PlannerConflict.resolved == False,  # noqa: E712
        ).order_by(PlannerConflict.detected_at.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(c.id), "conflict_type": c.conflict_type, "severity": c.severity,
         "asset_id": str(c.asset_id) if c.asset_id else None,
         "conflict_date": c.conflict_date.isoformat() if c.conflict_date else None,
         "message": (c.message or "")[:200],
         "detected_at": c.detected_at.isoformat() if c.detected_at else None}
        for c in rows
    ]})


# ═══════════════════════════════════════════════════════════════════════════════
# TravelWiz — vectors, voyages
# ═══════════════════════════════════════════════════════════════════════════════


async def _list_vectors(args: dict) -> dict:
    """List transport vectors (helicopters, boats, vehicles). Filters: mode, type, search, limit."""
    search = (args.get("search") or "").strip()
    mode_filter = args.get("mode")
    type_filter = args.get("type")
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(TransportVector).where(TransportVector.entity_id == entity_id, TransportVector.deleted_at.is_(None))
        if mode_filter:
            query = query.where(TransportVector.mode == mode_filter)
        if type_filter:
            query = query.where(TransportVector.type == type_filter)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(or_(
                sqla_func.lower(TransportVector.registration).like(needle),
                sqla_func.lower(TransportVector.name).like(needle),
            ))
        query = query.order_by(TransportVector.registration).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(v.id), "registration": v.registration, "name": v.name,
         "type": v.type, "mode": v.mode, "pax_capacity": v.pax_capacity,
         "active": v.active}
        for v in rows
    ]})


async def _get_vector(args: dict) -> dict:
    """Get a transport vector by id or registration."""
    vid = args.get("id") or args.get("registration")
    if not vid:
        raise ValueError("id ou registration requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(TransportVector).where(TransportVector.entity_id == entity_id, TransportVector.deleted_at.is_(None))
        try:
            query = query.where(TransportVector.id == UUID(str(vid)))
        except (TypeError, ValueError):
            query = query.where(TransportVector.registration == str(vid))
        v = (await session.execute(query)).scalar_one_or_none()
        if not v:
            return _err("Vecteur introuvable")
    return _ok({"id": str(v.id), "registration": v.registration, "name": v.name,
                "type": v.type, "mode": v.mode, "pax_capacity": v.pax_capacity,
                "weight_capacity_kg": float(v.weight_capacity_kg) if v.weight_capacity_kg else None,
                "volume_capacity_m3": float(v.volume_capacity_m3) if v.volume_capacity_m3 else None,
                "home_base_id": str(v.home_base_id) if v.home_base_id else None,
                "requires_weighing": v.requires_weighing, "mmsi_number": v.mmsi_number,
                "active": v.active})


async def _list_voyages(args: dict) -> dict:
    """List voyages. Filters: status, vector_id, search, limit."""
    search = (args.get("search") or "").strip()
    status_filter = args.get("status")
    vector_id = args.get("vector_id")
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Voyage).where(Voyage.entity_id == entity_id, Voyage.deleted_at.is_(None))
        if status_filter:
            query = query.where(Voyage.status == status_filter)
        if vector_id:
            try:
                query = query.where(Voyage.vector_id == UUID(str(vector_id)))
            except ValueError:
                return _err(f"vector_id invalide: {vector_id}")
        if search:
            query = query.where(sqla_func.lower(Voyage.code).like(f"%{search.lower()}%"))
        query = query.order_by(Voyage.scheduled_departure.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(v.id), "code": v.code, "status": v.status,
         "vector_id": str(v.vector_id) if v.vector_id else None,
         "scheduled_departure": v.scheduled_departure.isoformat() if v.scheduled_departure else None,
         "scheduled_arrival": v.scheduled_arrival.isoformat() if v.scheduled_arrival else None,
         "actual_departure": v.actual_departure.isoformat() if v.actual_departure else None,
         "actual_arrival": v.actual_arrival.isoformat() if v.actual_arrival else None}
        for v in rows
    ]})


async def _get_voyage(args: dict) -> dict:
    """Get a voyage by id or code."""
    vid = args.get("id") or args.get("code")
    if not vid:
        raise ValueError("id ou code requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Voyage).where(Voyage.entity_id == entity_id, Voyage.deleted_at.is_(None))
        try:
            query = query.where(Voyage.id == UUID(str(vid)))
        except (TypeError, ValueError):
            query = query.where(Voyage.code == str(vid))
        v = (await session.execute(query)).scalar_one_or_none()
        if not v:
            return _err("Voyage introuvable")
    return _ok({"id": str(v.id), "code": v.code, "status": v.status,
                "vector_id": str(v.vector_id) if v.vector_id else None,
                "departure_base_id": str(v.departure_base_id) if v.departure_base_id else None,
                "scheduled_departure": v.scheduled_departure.isoformat() if v.scheduled_departure else None,
                "scheduled_arrival": v.scheduled_arrival.isoformat() if v.scheduled_arrival else None,
                "actual_departure": v.actual_departure.isoformat() if v.actual_departure else None,
                "actual_arrival": v.actual_arrival.isoformat() if v.actual_arrival else None,
                "delay_reason": v.delay_reason,
                "created_at": v.created_at.isoformat() if v.created_at else None})


# ═══════════════════════════════════════════════════════════════════════════════
# Compliance — rules and types creation
# ═══════════════════════════════════════════════════════════════════════════════


def _compliance_type_to_dict(ct: ComplianceType) -> dict:
    return {
        "id": str(ct.id),
        "code": ct.code,
        "name": ct.name,
        "category": ct.category,
        "description": ct.description,
        "validity_days": ct.validity_days,
        "is_mandatory": ct.is_mandatory,
        "compliance_source": ct.compliance_source,
        "external_provider": ct.external_provider,
        "active": ct.active,
    }


def _compliance_rule_to_dict(r: ComplianceRule) -> dict:
    return {
        "id": str(r.id),
        "compliance_type_id": str(r.compliance_type_id),
        "target_type": r.target_type,
        "target_value": r.target_value,
        "description": r.description,
        "version": r.version,
        "effective_from": r.effective_from.isoformat() if r.effective_from else None,
        "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        "active": r.active,
    }


async def _create_compliance_type(args: dict) -> dict:
    """Create a new compliance type (referentiel)."""
    code = (args.get("code") or "").strip()
    name = (args.get("name") or "").strip()
    category = (args.get("category") or "").strip()
    if not code or not name or not category:
        raise ValueError("code, name et category requis")
    if category not in {"formation", "certification", "habilitation", "audit", "medical", "epi"}:
        raise ValueError("category invalide")

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        dupe = (await session.execute(
            select(ComplianceType).where(
                ComplianceType.entity_id == entity_id,
                ComplianceType.code == code,
            )
        )).scalar_one_or_none()
        if dupe:
            return _err(f"Un type de conformité avec le code '{code}' existe déjà")

        ct = ComplianceType(
            entity_id=entity_id,
            code=code,
            name=name,
            category=category,
            description=args.get("description"),
            validity_days=args.get("validity_days"),
            is_mandatory=bool(args.get("is_mandatory", False)),
            compliance_source=args.get("compliance_source") or "opsflux",
            external_provider=args.get("external_provider"),
            active=True,
        )
        session.add(ct)
        await session.commit()
        await session.refresh(ct)
    return _ok(_compliance_type_to_dict(ct))


async def _list_compliance_rules(args: dict) -> dict:
    """List compliance rules, optionally filtered by type or target."""
    type_id_str = args.get("compliance_type_id")
    target_type = args.get("target_type")
    target_value = args.get("target_value")
    only_active = bool(args.get("only_active", True))
    limit = min(max(int(args.get("limit", 50) or 50), 1), 200)

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(ComplianceRule).where(ComplianceRule.entity_id == entity_id)
        if only_active:
            query = query.where(ComplianceRule.active == True, ComplianceRule.deleted_at.is_(None))  # noqa: E712
        if type_id_str:
            try:
                query = query.where(ComplianceRule.compliance_type_id == UUID(str(type_id_str)))
            except ValueError:
                return _err(f"compliance_type_id invalide: {type_id_str}")
        if target_type:
            query = query.where(ComplianceRule.target_type == target_type)
        if target_value:
            query = query.where(ComplianceRule.target_value == target_value)
        query = query.order_by(ComplianceRule.created_at.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({
        "count": len(rows),
        "items": [_compliance_rule_to_dict(r) for r in rows],
    })


async def _create_compliance_rule(args: dict) -> dict:
    """Create a compliance rule (who must have this compliance type)."""
    ct_ref = args.get("compliance_type_id") or args.get("compliance_type_code")
    target_type = (args.get("target_type") or "").strip()
    if not ct_ref or not target_type:
        raise ValueError("compliance_type_id (ou code) et target_type requis")
    if target_type not in {"tier_type", "asset", "department", "job_position", "all"}:
        raise ValueError("target_type invalide")

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        # Resolve compliance type
        ct_query = select(ComplianceType).where(ComplianceType.entity_id == entity_id)
        try:
            ct_query = ct_query.where(ComplianceType.id == UUID(str(ct_ref)))
        except (TypeError, ValueError):
            ct_query = ct_query.where(ComplianceType.code == str(ct_ref))
        ct = (await session.execute(ct_query)).scalar_one_or_none()
        if ct is None:
            return _err(f"Type de conformité introuvable: {ct_ref}")

        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()

        def _parse_date(s: str | None):
            if not s:
                return None
            try:
                return datetime.fromisoformat(s).date()
            except ValueError as exc:
                raise ValueError(f"Date invalide '{s}': {exc}")

        rule = ComplianceRule(
            entity_id=entity_id,
            compliance_type_id=ct.id,
            target_type=target_type,
            target_value=args.get("target_value"),
            description=args.get("description"),
            version=1,
            effective_from=_parse_date(args.get("effective_from")),
            effective_to=_parse_date(args.get("effective_to")),
            changed_by=admin,
            change_reason=args.get("change_reason") or "Created via MCP",
            active=True,
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
    return _ok(_compliance_rule_to_dict(rule))


# ═══════════════════════════════════════════════════════════════════════════════
# Cost imputations
# ═══════════════════════════════════════════════════════════════════════════════


def _cost_center_to_dict(cc: CostCenter) -> dict:
    return {
        "id": str(cc.id),
        "code": cc.code,
        "name": cc.name,
        "department_id": str(cc.department_id) if cc.department_id else None,
        "active": cc.active,
    }


def _imputation_ref_to_dict(r: ImputationReference) -> dict:
    return {
        "id": str(r.id),
        "code": r.code,
        "name": r.name,
        "description": r.description,
        "imputation_type": r.imputation_type,
        "otp_policy": r.otp_policy,
        "default_project_id": str(r.default_project_id) if r.default_project_id else None,
        "default_cost_center_id": str(r.default_cost_center_id) if r.default_cost_center_id else None,
        "valid_from": r.valid_from.isoformat() if r.valid_from else None,
        "valid_to": r.valid_to.isoformat() if r.valid_to else None,
        "active": r.active,
    }


def _cost_imputation_to_dict(c: CostImputation) -> dict:
    return {
        "id": str(c.id),
        "owner_type": c.owner_type,
        "owner_id": str(c.owner_id),
        "imputation_reference_id": str(c.imputation_reference_id) if c.imputation_reference_id else None,
        "project_id": str(c.project_id) if c.project_id else None,
        "wbs_id": str(c.wbs_id) if c.wbs_id else None,
        "cost_center_id": str(c.cost_center_id) if c.cost_center_id else None,
        "percentage": float(c.percentage),
        "cross_imputation": c.cross_imputation,
        "notes": c.notes,
    }


async def _list_cost_centers(args: dict) -> dict:
    """List cost centers for the current entity."""
    limit = min(max(int(args.get("limit", 100) or 100), 1), 500)
    only_active = bool(args.get("only_active", True))
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(CostCenter).where(CostCenter.entity_id == entity_id)
        if only_active:
            query = query.where(CostCenter.active == True)  # noqa: E712
        query = query.order_by(CostCenter.code).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [_cost_center_to_dict(c) for c in rows]})


async def _list_imputation_references(args: dict) -> dict:
    """List imputation references (OPEX/CAPEX codes) for the current entity."""
    search = (args.get("search") or "").strip()
    imputation_type = args.get("imputation_type")
    limit = min(max(int(args.get("limit", 50) or 50), 1), 500)
    only_active = bool(args.get("only_active", True))

    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(ImputationReference).where(ImputationReference.entity_id == entity_id)
        if only_active:
            query = query.where(ImputationReference.active == True)  # noqa: E712
        if imputation_type:
            query = query.where(ImputationReference.imputation_type == imputation_type)
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(
                or_(
                    sqla_func.lower(ImputationReference.code).like(needle),
                    sqla_func.lower(ImputationReference.name).like(needle),
                )
            )
        query = query.order_by(ImputationReference.code).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [_imputation_ref_to_dict(r) for r in rows]})


async def _list_imputations(args: dict) -> dict:
    """List cost imputations for a given owner (ads, voyage, mission, …)."""
    owner_type = (args.get("owner_type") or "").strip()
    owner_id_str = args.get("owner_id")
    if not owner_type or not owner_id_str:
        raise ValueError("owner_type et owner_id requis")
    try:
        owner_id = UUID(str(owner_id_str))
    except ValueError:
        return _err(f"owner_id invalide: {owner_id_str}")
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(CostImputation)
            .where(CostImputation.owner_type == owner_type, CostImputation.owner_id == owner_id)
            .order_by(CostImputation.created_at)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [_cost_imputation_to_dict(c) for c in rows]})


async def _add_imputation(args: dict) -> dict:
    """Add a cost imputation split to an owner.
    Sum of percentages per owner must stay ≤ 100 (warning only)."""
    owner_type = (args.get("owner_type") or "").strip()
    owner_id_str = args.get("owner_id")
    percentage = args.get("percentage")
    if not owner_type or not owner_id_str or percentage is None:
        raise ValueError("owner_type, owner_id et percentage requis")
    try:
        pct = float(percentage)
    except (TypeError, ValueError):
        raise ValueError("percentage doit être numérique")
    if pct <= 0 or pct > 100:
        raise ValueError("percentage doit être dans (0, 100]")
    try:
        owner_id = UUID(str(owner_id_str))
    except ValueError:
        return _err(f"owner_id invalide: {owner_id_str}")

    ref_id = args.get("imputation_reference_id")
    project_id = args.get("project_id")
    cost_center_id = args.get("cost_center_id")

    async with async_session_factory() as session:
        # Ensure sum ≤ 100
        existing_pct = (await session.execute(
            select(sqla_func.coalesce(sqla_func.sum(CostImputation.percentage), 0))
            .where(CostImputation.owner_type == owner_type, CostImputation.owner_id == owner_id)
        )).scalar_one()
        total = float(existing_pct or 0) + pct
        if total > 100.001:
            return _err(f"Somme des imputations dépasserait 100% ({total:.2f}%)")

        admin = (await session.execute(
            select(User.id).where(User.active == True).limit(1)  # noqa: E712
        )).scalar_one_or_none()
        if admin is None:
            return _err("Aucun utilisateur actif")

        imp = CostImputation(
            owner_type=owner_type,
            owner_id=owner_id,
            percentage=pct,
            imputation_reference_id=UUID(str(ref_id)) if ref_id else None,
            project_id=UUID(str(project_id)) if project_id else None,
            cost_center_id=UUID(str(cost_center_id)) if cost_center_id else None,
            cross_imputation=bool(args.get("cross_imputation", False)),
            notes=args.get("notes"),
            created_by=admin,
        )
        session.add(imp)
        await session.commit()
        await session.refresh(imp)
    return _ok(_cost_imputation_to_dict(imp))


async def _delete_imputation(args: dict) -> dict:
    imp_id = args.get("id")
    if not imp_id:
        raise ValueError("id requis")
    async with async_session_factory() as session:
        imp = (await session.execute(
            select(CostImputation).where(CostImputation.id == UUID(str(imp_id)))
        )).scalar_one_or_none()
        if imp is None:
            return _err(f"Imputation introuvable: {imp_id}")
        await session.delete(imp)
        await session.commit()
    return _ok({"deleted": imp_id})


# ═══════════════════════════════════════════════════════════════════════════════
# Users (read-only)
# ═══════════════════════════════════════════════════════════════════════════════


def _user_to_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "active": u.active,
        "language": u.language,
        "default_entity_id": str(u.default_entity_id) if u.default_entity_id else None,
        "tier_contact_id": str(u.tier_contact_id) if u.tier_contact_id else None,
        "auth_type": u.auth_type,
        "mfa_enabled": u.mfa_enabled,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


async def _list_users(args: dict) -> dict:
    """List user accounts. Read-only — cannot create/update users via MCP.
    Filters: search (email/name), only_active (default true)."""
    search = (args.get("search") or "").strip()
    only_active = bool(args.get("only_active", True))
    limit = min(max(int(args.get("limit", 30) or 30), 1), 200)
    async with async_session_factory() as session:
        query = select(User)
        if only_active:
            query = query.where(User.active == True)  # noqa: E712
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(
                or_(
                    sqla_func.lower(User.email).like(needle),
                    sqla_func.lower(User.first_name).like(needle),
                    sqla_func.lower(User.last_name).like(needle),
                )
            )
        query = query.order_by(User.last_name, User.first_name).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [_user_to_dict(u) for u in rows]})


async def _get_user(args: dict) -> dict:
    """Get a user by id or email."""
    user_id = args.get("id")
    email = args.get("email")
    if not user_id and not email:
        raise ValueError("id ou email requis")
    async with async_session_factory() as session:
        query = select(User)
        if user_id:
            try:
                query = query.where(User.id == UUID(str(user_id)))
            except ValueError:
                return _err(f"id invalide: {user_id}")
        else:
            query = query.where(sqla_func.lower(User.email) == str(email).lower())
        u = (await session.execute(query)).scalar_one_or_none()
        if u is None:
            return _err("Utilisateur introuvable")
    return _ok(_user_to_dict(u))


# ═══════════════════════════════════════════════════════════════════════════════
# Settings / configuration
# ═══════════════════════════════════════════════════════════════════════════════


def _setting_to_dict(s: Setting) -> dict:
    return {
        "id": str(s.id),
        "key": s.key,
        "value": s.value,
        "scope": s.scope,
        "scope_id": s.scope_id,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


async def _list_settings(args: dict) -> dict:
    """List settings. Filters: scope (tenant/entity/user), key_prefix."""
    scope = args.get("scope")
    key_prefix = (args.get("key_prefix") or "").strip()
    limit = min(max(int(args.get("limit", 50) or 50), 1), 500)
    async with async_session_factory() as session:
        query = select(Setting)
        if scope:
            if scope not in {"tenant", "entity", "user"}:
                return _err("scope doit être tenant|entity|user")
            query = query.where(Setting.scope == scope)
        if key_prefix:
            query = query.where(Setting.key.like(f"{key_prefix}%"))
        query = query.order_by(Setting.scope, Setting.key).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [_setting_to_dict(s) for s in rows]})


async def _get_setting(args: dict) -> dict:
    """Get a setting by key (+ optional scope and scope_id)."""
    key = (args.get("key") or "").strip()
    if not key:
        raise ValueError("key requis")
    scope = args.get("scope") or "tenant"
    scope_id = args.get("scope_id")
    async with async_session_factory() as session:
        query = select(Setting).where(Setting.key == key, Setting.scope == scope)
        if scope_id is not None:
            query = query.where(Setting.scope_id == str(scope_id))
        else:
            query = query.where(Setting.scope_id.is_(None))
        s = (await session.execute(query)).scalar_one_or_none()
        if s is None:
            return _err(f"Setting introuvable: {key}@{scope}")
    return _ok(_setting_to_dict(s))


async def _set_setting(args: dict) -> dict:
    """Create or update a setting. value must be a JSON-serialisable dict."""
    key = (args.get("key") or "").strip()
    if not key:
        raise ValueError("key requis")
    raw_value = args.get("value")
    if raw_value is None:
        raise ValueError("value requis")
    # Allow passing a JSON string — parse it
    if isinstance(raw_value, str):
        try:
            value = json.loads(raw_value)
        except json.JSONDecodeError:
            value = {"value": raw_value}
    elif isinstance(raw_value, dict):
        value = raw_value
    else:
        value = {"value": raw_value}
    scope = args.get("scope") or "tenant"
    if scope not in {"tenant", "entity", "user"}:
        raise ValueError("scope doit être tenant|entity|user")
    scope_id = args.get("scope_id")
    async with async_session_factory() as session:
        query = select(Setting).where(Setting.key == key, Setting.scope == scope)
        if scope_id is not None:
            query = query.where(Setting.scope_id == str(scope_id))
        else:
            query = query.where(Setting.scope_id.is_(None))
        existing = (await session.execute(query)).scalar_one_or_none()
        if existing:
            existing.value = value
            s = existing
        else:
            s = Setting(key=key, value=value, scope=scope, scope_id=str(scope_id) if scope_id else None)
            session.add(s)
        await session.commit()
        await session.refresh(s)
    return _ok(_setting_to_dict(s))


async def _delete_setting(args: dict) -> dict:
    """Delete a setting by key+scope(+scope_id)."""
    key = (args.get("key") or "").strip()
    if not key:
        raise ValueError("key requis")
    scope = args.get("scope") or "tenant"
    scope_id = args.get("scope_id")
    async with async_session_factory() as session:
        query = select(Setting).where(Setting.key == key, Setting.scope == scope)
        if scope_id is not None:
            query = query.where(Setting.scope_id == str(scope_id))
        else:
            query = query.where(Setting.scope_id.is_(None))
        s = (await session.execute(query)).scalar_one_or_none()
        if s is None:
            return _err(f"Setting introuvable: {key}@{scope}")
        await session.delete(s)
        await session.commit()
    return _ok({"deleted": key, "scope": scope})


# ═══════════════════════════════════════════════════════════════════════════════
# Project management tools
# ═══════════════════════════════════════════════════════════════════════════════


def _project_to_dict(p: Project, *, compact: bool = False) -> dict:
    if compact:
        return {"id": str(p.id), "code": p.code, "name": p.name, "status": p.status,
                "priority": p.priority, "progress": p.progress, "project_type": p.project_type}
    return {"id": str(p.id), "code": p.code, "name": p.name, "description": (p.description or "")[:500],
            "status": p.status, "priority": p.priority, "progress": p.progress,
            "project_type": p.project_type, "weather": p.weather,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "budget": p.budget, "external_ref": p.external_ref, "active": p.active}


async def _list_projects(args: dict) -> dict:
    search = (args.get("search") or "").strip()
    status_filter = args.get("status")
    ptype = args.get("project_type")
    limit = min(max(int(args.get("limit", 20) or 20), 1), 200)
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Project).where(Project.entity_id == entity_id, Project.archived == False)  # noqa: E712
        if search:
            needle = f"%{search.lower()}%"
            query = query.where(or_(sqla_func.lower(Project.name).like(needle), sqla_func.lower(Project.code).like(needle)))
        if status_filter:
            query = query.where(Project.status == status_filter)
        if ptype:
            query = query.where(Project.project_type == ptype)
        query = query.order_by(Project.created_at.desc()).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    return _ok({"count": len(rows), "items": [_project_to_dict(p, compact=True) for p in rows]})


async def _get_project(args: dict) -> dict:
    pid = args.get("id") or args.get("code")
    if not pid:
        raise ValueError("id ou code requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        query = select(Project).where(Project.entity_id == entity_id, Project.archived == False)  # noqa: E712
        try:
            query = query.where(Project.id == UUID(str(pid)))
        except (TypeError, ValueError):
            query = query.where(Project.code == str(pid))
        p = (await session.execute(query)).scalar_one_or_none()
        if not p:
            return _err("Projet introuvable")
    return _ok(_project_to_dict(p))


async def _create_project(args: dict) -> dict:
    name = (args.get("name") or "").strip()
    if not name:
        raise ValueError("name requis")
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        from app.core.references import generate_reference
        code = await generate_reference("PRJ", session, entity_id=entity_id)
        p = Project(
            entity_id=entity_id, code=code, name=name,
            description=args.get("description"),
            project_type=args.get("project_type") or "project",
            status=args.get("status") or "draft",
            priority=args.get("priority") or "medium",
            weather=args.get("weather") or "sunny",
            budget=float(args["budget"]) if args.get("budget") else None,
        )
        session.add(p); await session.commit(); await session.refresh(p)
    return _ok(_project_to_dict(p))


async def _update_project(args: dict) -> dict:
    pid = args.get("id")
    if not pid:
        raise ValueError("id requis")
    WRITABLE = {"name", "description", "status", "priority", "weather", "project_type", "budget", "start_date", "end_date"}
    async with async_session_factory() as session:
        p = (await session.execute(select(Project).where(Project.id == UUID(str(pid))))).scalar_one_or_none()
        if not p:
            return _err("Projet introuvable")
        for k, v in args.items():
            if k in WRITABLE and v is not None:
                if k in ("start_date", "end_date") and isinstance(v, str):
                    from app.api.routes.core.gouti_sync import _parse_gouti_date
                    v = _parse_gouti_date(v)
                if k == "budget":
                    v = float(v)
                setattr(p, k, v)
        await session.commit(); await session.refresh(p)
    return _ok(_project_to_dict(p))


async def _list_project_tasks(args: dict) -> dict:
    pid = args.get("project_id")
    if not pid:
        raise ValueError("project_id requis")
    status_filter = args.get("status")
    limit = min(max(int(args.get("limit", 50) or 50), 1), 500)
    async with async_session_factory() as session:
        query = select(ProjectTask).where(ProjectTask.project_id == UUID(str(pid)), ProjectTask.active == True)  # noqa: E712
        if status_filter:
            query = query.where(ProjectTask.status == status_filter)
        query = query.order_by(ProjectTask.order, ProjectTask.created_at).limit(limit)
        rows = (await session.execute(query)).scalars().all()
    items = [{"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority, "progress": t.progress,
              "parent_id": str(t.parent_id) if t.parent_id else None,
              "start_date": t.start_date.isoformat() if t.start_date else None,
              "due_date": t.due_date.isoformat() if t.due_date else None,
              "estimated_hours": t.estimated_hours, "order": t.order} for t in rows]
    return _ok({"count": len(items), "items": items})


async def _create_project_task(args: dict) -> dict:
    pid = args.get("project_id")
    title = (args.get("title") or "").strip()
    if not pid or not title:
        raise ValueError("project_id et title requis")
    async with async_session_factory() as session:
        task = ProjectTask(
            project_id=UUID(str(pid)), title=title,
            description=args.get("description"), status=args.get("status") or "todo",
            priority=args.get("priority") or "medium",
            parent_id=UUID(str(args["parent_id"])) if args.get("parent_id") else None,
            estimated_hours=float(args["estimated_hours"]) if args.get("estimated_hours") else None,
        )
        session.add(task); await session.commit(); await session.refresh(task)
    return _ok({"id": str(task.id), "title": task.title, "status": task.status})


async def _list_project_milestones(args: dict) -> dict:
    pid = args.get("project_id")
    if not pid:
        raise ValueError("project_id requis")
    async with async_session_factory() as session:
        rows = (await session.execute(
            select(ProjectMilestone).where(ProjectMilestone.project_id == UUID(str(pid)), ProjectMilestone.active == True)
            .order_by(ProjectMilestone.due_date)
        )).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(m.id), "name": m.name, "status": m.status,
         "due_date": m.due_date.isoformat() if m.due_date else None}
        for m in rows
    ]})


async def _get_project_cpm(args: dict) -> dict:
    pid = args.get("project_id")
    if not pid:
        raise ValueError("project_id requis")
    from app.services.cpm_service import compute_cpm
    async with async_session_factory() as session:
        result = await compute_cpm(session, UUID(str(pid)))
    return _ok(result)


async def _get_project_activity_feed(args: dict) -> dict:
    pid = args.get("project_id")
    if not pid:
        raise ValueError("project_id requis")
    limit = min(max(int(args.get("limit", 30) or 30), 1), 100)
    from app.models.common import ProjectStatusHistory, ProjectComment, TaskChangeLog
    async with async_session_factory() as session:
        feed: list[dict] = []
        # Status history
        for r in (await session.execute(
            select(ProjectStatusHistory).where(ProjectStatusHistory.project_id == UUID(str(pid)))
            .order_by(ProjectStatusHistory.changed_at.desc()).limit(limit)
        )).scalars().all():
            feed.append({"type": "status_change", "date": r.changed_at.isoformat(),
                         "detail": f"{r.from_status or '—'} → {r.to_status}", "reason": r.reason})
        # Task changes
        task_ids = (await session.execute(
            select(ProjectTask.id).where(ProjectTask.project_id == UUID(str(pid)))
        )).scalars().all()
        if task_ids:
            for cl in (await session.execute(
                select(TaskChangeLog).where(TaskChangeLog.task_id.in_(task_ids))
                .order_by(TaskChangeLog.created_at.desc()).limit(limit)
            )).scalars().all():
                feed.append({"type": "task_change", "date": cl.created_at.isoformat(),
                             "field": cl.field_name, "old": cl.old_value, "new": cl.new_value})
        feed.sort(key=lambda x: x["date"], reverse=True)
    return _ok({"count": len(feed[:limit]), "items": feed[:limit]})


async def _list_project_templates(args: dict) -> dict:
    async with async_session_factory() as session:
        entity_id = await _resolve_entity_id(session, args.get("entity_code"))
        rows = (await session.execute(
            select(ProjectTemplate).where(ProjectTemplate.entity_id == entity_id, ProjectTemplate.active == True)
            .order_by(ProjectTemplate.usage_count.desc())
        )).scalars().all()
    return _ok({"count": len(rows), "items": [
        {"id": str(t.id), "name": t.name, "category": t.category,
         "description": t.description, "usage_count": t.usage_count}
        for t in rows
    ]})


# ─── Tool registry ───────────────────────────────────────────────────────────

def _s(props: dict | None = None, required: list | None = None) -> dict:
    schema: dict[str, Any] = {"type": "object", "properties": props or {}}
    if required:
        schema["required"] = required
    return schema


OPSFLUX_TOOLS: list[tuple[str, str, dict, Any]] = [
    # ── Tiers ────────────────────────────────────────────────────────────
    ("list_tiers",
     "Liste les entreprises/tiers OpsFlux. Filtres optionnels: search (nom/code/alias), "
     "type (client/supplier/subcontractor/partner/service_provider), include_archived. "
     "limit=20 par défaut (max 200).",
     _s({
         "search": {"type": "string", "description": "Filtre texte (nom, code, alias)"},
         "type": {"type": "string", "description": "Filtre par type"},
         "limit": {"type": "integer", "description": "Nombre max (défaut 20, max 200)"},
         "include_archived": {"type": "boolean", "description": "Inclure les tiers archivés"},
         "entity_code": {"type": "string", "description": "Code entité (optionnel, prend la première sinon)"},
     }), _list_tiers),

    ("get_tier",
     "Récupère les détails d'un tiers par id ou code.",
     _s({
         "id": {"type": "string", "description": "UUID du tier"},
         "code": {"type": "string", "description": "Code du tier (ex: TIR-2026-0001)"},
         "entity_code": {"type": "string"},
     }), _get_tier),

    ("create_tier",
     "Crée une nouvelle entreprise. Le code est auto-généré (pattern TIR). "
     "Champs modifiables: name (requis), alias, trade_name, type, email, phone, fax, "
     "website, legal_form, tax_id, vat_number, capital, currency, industry, "
     "payment_terms, description, address_line1, address_line2, city, state, "
     "zip_code, country, timezone, language.",
     _s({
         "name": {"type": "string", "description": "Nom de l'entreprise (requis)"},
         "alias": {"type": "string"},
         "trade_name": {"type": "string"},
         "type": {"type": "string", "description": "client/supplier/subcontractor/partner/service_provider/other"},
         "email": {"type": "string"},
         "phone": {"type": "string"},
         "website": {"type": "string"},
         "legal_form": {"type": "string"},
         "tax_id": {"type": "string"},
         "capital": {"type": "number"},
         "currency": {"type": "string"},
         "industry": {"type": "string"},
         "payment_terms": {"type": "string"},
         "description": {"type": "string"},
         "address_line1": {"type": "string"},
         "city": {"type": "string"},
         "zip_code": {"type": "string"},
         "country": {"type": "string", "description": "Code ISO 2 lettres"},
         "timezone": {"type": "string"},
         "language": {"type": "string"},
         "entity_code": {"type": "string"},
     }, ["name"]), _create_tier),

    ("update_tier",
     "Met à jour les champs d'une entreprise existante.",
     _s({
         "id": {"type": "string", "description": "UUID du tier (requis)"},
         "name": {"type": "string"},
         "alias": {"type": "string"},
         "type": {"type": "string"},
         "email": {"type": "string"},
         "phone": {"type": "string"},
         "website": {"type": "string"},
         "description": {"type": "string"},
         "country": {"type": "string"},
         "address_line1": {"type": "string"},
         "city": {"type": "string"},
         "zip_code": {"type": "string"},
     }, ["id"]), _update_tier),

    ("archive_tier",
     "Archive (soft-delete) une entreprise.",
     _s({"id": {"type": "string"}}, ["id"]),
     _delete_tier),

    # ── Contacts ─────────────────────────────────────────────────────────
    ("list_contacts",
     "Liste les contacts/employés. Filtres: tier_id, search (prénom, nom, email).",
     _s({
         "tier_id": {"type": "string", "description": "Filtrer par entreprise"},
         "search": {"type": "string"},
         "limit": {"type": "integer", "description": "Défaut 20, max 200"},
     }), _list_contacts),

    ("get_contact",
     "Récupère les détails d'un contact par id.",
     _s({"id": {"type": "string"}}, ["id"]),
     _get_contact),

    ("create_contact",
     "Crée un nouveau contact/employé pour une entreprise. "
     "Champs: tier_id (requis), first_name, last_name (requis), civility, "
     "email, phone, position, department, is_primary.",
     _s({
         "tier_id": {"type": "string", "description": "UUID du tier parent (requis)"},
         "first_name": {"type": "string"},
         "last_name": {"type": "string"},
         "civility": {"type": "string", "description": "mr/mrs/miss/dr/prof"},
         "email": {"type": "string"},
         "phone": {"type": "string"},
         "position": {"type": "string"},
         "department": {"type": "string"},
         "is_primary": {"type": "boolean"},
     }, ["tier_id", "first_name", "last_name"]),
     _create_contact),

    ("update_contact",
     "Met à jour un contact existant.",
     _s({
         "id": {"type": "string"},
         "civility": {"type": "string"},
         "first_name": {"type": "string"},
         "last_name": {"type": "string"},
         "email": {"type": "string"},
         "phone": {"type": "string"},
         "position": {"type": "string"},
         "department": {"type": "string"},
         "is_primary": {"type": "boolean"},
     }, ["id"]),
     _update_contact),

    ("archive_contact",
     "Désactive (soft-delete) un contact.",
     _s({"id": {"type": "string"}}, ["id"]),
     _archive_contact),

    # ── Phones (polymorphic — tier ou tier_contact) ──────────────────────
    ("list_phones",
     "Liste les téléphones d'un tier ou d'un contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_phones),

    ("add_phone",
     "Ajoute un téléphone (labels: mobile, office, fax, home). "
     "is_default=true retire le flag des autres téléphones du même owner.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "number": {"type": "string"},
         "label": {"type": "string"},
         "country_code": {"type": "string"},
         "is_default": {"type": "boolean"},
     }, ["owner_type", "owner_id", "number"]), _add_phone),

    ("delete_phone",
     "Supprime un téléphone par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_phone),

    # ── Emails (polymorphic) ─────────────────────────────────────────────
    ("list_emails",
     "Liste les emails d'un tier ou d'un contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_emails),

    ("add_email",
     "Ajoute une adresse email (labels: work, personal, billing, support).",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "email": {"type": "string"},
         "label": {"type": "string"},
         "is_default": {"type": "boolean"},
     }, ["owner_type", "owner_id", "email"]), _add_email),

    ("delete_email",
     "Supprime un email par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_email),

    # ── Addresses (polymorphic) ──────────────────────────────────────────
    ("list_addresses",
     "Liste les adresses d'un tier ou d'un contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_addresses),

    ("add_address",
     "Ajoute une adresse. Champs requis: address_line1, city, country.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "label": {"type": "string", "description": "main/billing/shipping/…"},
         "address_line1": {"type": "string"},
         "address_line2": {"type": "string"},
         "city": {"type": "string"},
         "state_province": {"type": "string"},
         "postal_code": {"type": "string"},
         "country": {"type": "string"},
         "latitude": {"type": "number"},
         "longitude": {"type": "number"},
         "is_default": {"type": "boolean"},
     }, ["owner_type", "owner_id", "address_line1", "city", "country"]),
     _add_address),

    ("delete_address",
     "Supprime une adresse par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_address),

    # ── Notes (polymorphic) ──────────────────────────────────────────────
    ("list_notes",
     "Liste les notes attachées à un tier ou un contact. Ordonnées par pinned puis date descendante.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_notes),

    ("add_note",
     "Ajoute une note à un tier ou contact. visibility = public (défaut) ou private.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "content": {"type": "string"},
         "visibility": {"type": "string", "enum": ["public", "private"]},
         "pinned": {"type": "boolean"},
     }, ["owner_type", "owner_id", "content"]), _add_note),

    ("delete_note",
     "Supprime une note par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_note),

    # ── Tags (polymorphic) ───────────────────────────────────────────────
    ("list_tags",
     "Liste les tags d'un tier ou d'un contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_tags),

    ("add_tag",
     "Ajoute un tag. color = code hex (défaut #6b7280).",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "name": {"type": "string"},
         "color": {"type": "string"},
         "visibility": {"type": "string", "enum": ["public", "private"]},
     }, ["owner_type", "owner_id", "name"]), _add_tag),

    ("delete_tag",
     "Supprime un tag par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_tag),

    # ── Legal identifiers ────────────────────────────────────────────────
    ("list_legal_identifiers",
     "Liste les identifiants légaux (SIRET, RCCM, NIU, TVA, NIF, …) d'un tier ou contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_legal_identifiers),

    ("add_legal_identifier",
     "Ajoute un identifiant légal. type = code du dictionnaire legal_identifier_type "
     "(siret, rccm, niu, tva, nif, ninea, …). issued_at et expires_at au format ISO (YYYY-MM-DD).",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "type": {"type": "string"},
         "value": {"type": "string"},
         "country": {"type": "string"},
         "issued_at": {"type": "string"},
         "expires_at": {"type": "string"},
     }, ["owner_type", "owner_id", "type", "value"]),
     _add_legal_identifier),

    ("delete_legal_identifier",
     "Supprime un identifiant légal par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_legal_identifier),

    # ── External references (SAP, Gouti, Intranet, …) ───────────────────
    ("list_external_refs",
     "Liste les références externes (SAP, Gouti, Intranet, Legacy…) d'un tier ou contact.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_external_refs),

    ("add_external_ref",
     "Ajoute une référence externe (mapping d'ID vers un système externe).",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "system": {"type": "string", "description": "SAP/Gouti/Intranet/Legacy/Other"},
         "code": {"type": "string", "description": "Identifiant dans le système externe"},
     }, ["owner_type", "owner_id", "system", "code"]),
     _add_external_ref),

    # ── Tier blocks (block / unblock) ────────────────────────────────────
    ("block_tier",
     "Bloque une entreprise (achats, paiements ou complet). Motif obligatoire.",
     _s({
         "id": {"type": "string"},
         "reason": {"type": "string"},
         "block_type": {"type": "string", "enum": ["all", "purchasing", "payment"],
                         "description": "Défaut: all"},
     }, ["id", "reason"]), _block_tier),

    ("unblock_tier",
     "Débloque une entreprise précédemment bloquée. Motif obligatoire.",
     _s({
         "id": {"type": "string"},
         "reason": {"type": "string"},
     }, ["id", "reason"]), _unblock_tier),

    ("list_tier_blocks",
     "Historique des blocages/déblocages d'une entreprise.",
     _s({"tier_id": {"type": "string"}}, ["tier_id"]),
     _list_tier_blocks),

    # ── Compliance / conformité ──────────────────────────────────────────
    ("check_compliance",
     "Calcule le verdict de conformité canonique pour un tier ou un contact "
     "(tous les types applicables, validité, expirations, documents manquants). "
     "Retourne is_compliant + détails par type.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "entity_code": {"type": "string"},
     }, ["owner_type", "owner_id"]),
     _check_compliance),

    ("list_compliance_records",
     "Liste les enregistrements de conformité (certificats, habilitations, …) "
     "d'un tier ou contact — avec dates d'émission/expiration et statut.",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]),
     _list_compliance_records),

    ("add_compliance_record",
     "Ajoute un enregistrement de conformité. compliance_type_code est le code "
     "d'un type de conformité configuré (ex: 'MED_APTITUDE', 'H2S_BASIC'). "
     "Alternative: compliance_type_id (UUID direct).",
     _s({
         "owner_type": {"type": "string", "enum": ["tier", "tier_contact"]},
         "owner_id": {"type": "string"},
         "compliance_type_code": {"type": "string"},
         "compliance_type_id": {"type": "string"},
         "status": {"type": "string", "enum": ["valid", "expired", "pending", "rejected"]},
         "issued_at": {"type": "string", "description": "Date d'émission ISO YYYY-MM-DD"},
         "expires_at": {"type": "string", "description": "Date d'expiration ISO YYYY-MM-DD"},
         "issuer": {"type": "string", "description": "Organisme émetteur"},
         "reference_number": {"type": "string"},
         "notes": {"type": "string"},
         "entity_code": {"type": "string"},
     }, ["owner_type", "owner_id"]),
     _add_compliance_record),

    ("list_compliance_types",
     "Liste tous les types de conformité disponibles (formations, certifications, "
     "habilitations, audits, médical, EPI) configurés pour l'entité.",
     _s({"entity_code": {"type": "string"}}),
     _list_compliance_types),

    # ── Contact transfer (move employee between companies) ──────────────
    ("transfer_contact",
     "Transfère un employé d'une entreprise à une autre, avec historisation "
     "(date, motif, utilisateur). Le contact.tier_id est mis à jour et un "
     "TierContactTransfer est créé.",
     _s({
         "contact_id": {"type": "string", "description": "UUID du contact à transférer"},
         "to_tier_id": {"type": "string", "description": "UUID de la nouvelle entreprise"},
         "reason": {"type": "string", "description": "Motif du transfert (obligatoire pour l'historique)"},
         "transfer_date": {"type": "string", "description": "Date du transfert ISO (défaut: maintenant)"},
     }, ["contact_id", "to_tier_id", "reason"]),
     _transfer_contact),

    ("list_contact_transfers",
     "Historique des transferts d'un contact (mouvements entre entreprises).",
     _s({"contact_id": {"type": "string"}}, ["contact_id"]),
     _list_contact_transfers),

    # ── Assets (sites + installations) ───────────────────────────────────
    ("list_sites",
     "Liste les sites pétroliers (ar_sites) de l'entité. Filtres: search, limit. "
     "Un site regroupe plusieurs installations physiques.",
     _s({
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_sites),

    ("list_assets",
     "Liste les installations (ar_installations) = plateformes, terminaux, puits, "
     "FPSO… Filtres: site_id, status (OPERATIONAL/…), search, limit.",
     _s({
         "site_id": {"type": "string"},
         "status": {"type": "string"},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_assets),

    ("get_asset",
     "Récupère une installation (asset) par id ou par code.",
     _s({
         "id": {"type": "string"},
         "code": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_asset),

    ("list_fields",
     "Liste les champs pétroliers (ar_oil_fields). Filtres: search, limit.",
     _s({
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_fields),

    ("get_field",
     "Récupère un champ pétrolier par id ou code.",
     _s({
         "id": {"type": "string"},
         "code": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_field),

    ("list_equipment",
     "Liste les équipements (ar_equipment). Filtres: installation_id, equipment_class, status, search, limit.",
     _s({
         "installation_id": {"type": "string", "description": "UUID de l'installation"},
         "equipment_class": {"type": "string", "description": "Classe d'équipement (CRANE, SEPARATOR, PUMP, etc.)"},
         "status": {"type": "string", "description": "OPERATIONAL, STANDBY, DECOMMISSIONED, etc."},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_equipment),

    ("get_equipment",
     "Récupère un équipement par id ou tag_number.",
     _s({
         "id": {"type": "string"},
         "tag_number": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_equipment),

    ("get_asset_hierarchy",
     "Retourne l'arborescence complète Field > Site > Installation de l'entité.",
     _s({
         "entity_code": {"type": "string"},
     }), _get_asset_hierarchy),

    # ── PaxLog (ADS, groupes PAX) ───────────────────────────────────────
    ("list_ads",
     "Liste les ADS (Autorisations De Sortie). Filtres: status (draft/submitted/approved/rejected/closed), type, search, limit.",
     _s({
         "status": {"type": "string", "description": "draft, submitted, approved, rejected, closed, cancelled"},
         "type": {"type": "string", "description": "Type d'ADS"},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_ads),

    ("get_ads",
     "Récupère une ADS par id ou référence (ex: ADS-2026-0001). Inclut le nombre de PAX.",
     _s({
         "id": {"type": "string"},
         "reference": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_ads),

    ("list_pax_groups",
     "Liste les groupes PAX de l'entité. Filtre: search, limit.",
     _s({
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_pax_groups),

    # ── Planner (activités, conflits) ───────────────────────────────────
    ("list_planner_activities",
     "Liste les activités planifiées. Filtres: status (draft/submitted/validated/in_progress/completed/cancelled), "
     "type (project/workover/drilling/maintenance/inspection/event), asset_id, priority, search, limit.",
     _s({
         "status": {"type": "string"},
         "type": {"type": "string"},
         "asset_id": {"type": "string"},
         "priority": {"type": "string"},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_planner_activities),

    ("get_planner_activity",
     "Récupère une activité planifiée par id. Détails complets: dates, PAX quota, well, rig, etc.",
     _s({
         "id": {"type": "string", "description": "UUID de l'activité"},
         "entity_code": {"type": "string"},
     }, ["id"]), _get_planner_activity),

    ("list_planner_conflicts",
     "Liste les conflits de planification non résolus (surcharge capacité, chevauchements).",
     _s({
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_planner_conflicts),

    # ── TravelWiz (vecteurs, voyages) ───────────────────────────────────
    ("list_vectors",
     "Liste les vecteurs de transport (hélicoptères, bateaux, véhicules). Filtres: mode (air/sea/land), type, search, limit.",
     _s({
         "mode": {"type": "string", "description": "air, sea, land"},
         "type": {"type": "string"},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_vectors),

    ("get_vector",
     "Récupère un vecteur de transport par id ou immatriculation.",
     _s({
         "id": {"type": "string"},
         "registration": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_vector),

    ("list_voyages",
     "Liste les voyages TravelWiz. Filtres: status, vector_id, search, limit.",
     _s({
         "status": {"type": "string"},
         "vector_id": {"type": "string"},
         "search": {"type": "string"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_voyages),

    ("get_voyage",
     "Récupère un voyage par id ou code.",
     _s({
         "id": {"type": "string"},
         "code": {"type": "string"},
         "entity_code": {"type": "string"},
     }), _get_voyage),

    # ── Compliance rules (V2) ────────────────────────────────────────────
    ("create_compliance_type",
     "Crée un type de conformité (ex: H2S_BASIC, MED_APTITUDE). "
     "category doit être: formation, certification, habilitation, audit, medical, epi. "
     "validity_days null = permanent.",
     _s({
         "code": {"type": "string"},
         "name": {"type": "string"},
         "category": {"type": "string"},
         "description": {"type": "string"},
         "validity_days": {"type": "integer"},
         "is_mandatory": {"type": "boolean"},
         "compliance_source": {"type": "string", "description": "opsflux | external | both"},
         "external_provider": {"type": "string"},
         "entity_code": {"type": "string"},
     }, ["code", "name", "category"]), _create_compliance_type),

    ("list_compliance_rules",
     "Liste les règles de conformité (qui doit avoir quel type). "
     "Filtres: compliance_type_id, target_type (tier_type|asset|department|job_position|all), target_value.",
     _s({
         "compliance_type_id": {"type": "string"},
         "target_type": {"type": "string"},
         "target_value": {"type": "string"},
         "only_active": {"type": "boolean"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_compliance_rules),

    ("create_compliance_rule",
     "Crée une règle de conformité: tel ComplianceType est obligatoire pour telle cible. "
     "Accepte compliance_type_id (UUID) ou compliance_type_code. "
     "target_type: tier_type|asset|department|job_position|all. "
     "target_value: ex 'client', asset_id, 'Operations'.",
     _s({
         "compliance_type_id": {"type": "string"},
         "compliance_type_code": {"type": "string"},
         "target_type": {"type": "string"},
         "target_value": {"type": "string"},
         "description": {"type": "string"},
         "effective_from": {"type": "string", "description": "YYYY-MM-DD"},
         "effective_to": {"type": "string", "description": "YYYY-MM-DD"},
         "change_reason": {"type": "string"},
         "entity_code": {"type": "string"},
     }, ["target_type"]), _create_compliance_rule),

    # ── Cost imputations ─────────────────────────────────────────────────
    ("list_cost_centers",
     "Liste les centres de coûts de l'entité.",
     _s({
         "only_active": {"type": "boolean"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_cost_centers),

    ("list_imputation_references",
     "Liste les références d'imputation (codes OPEX/CAPEX configurés). "
     "Filtres: search, imputation_type (OPEX/CAPEX), only_active.",
     _s({
         "search": {"type": "string"},
         "imputation_type": {"type": "string"},
         "only_active": {"type": "boolean"},
         "limit": {"type": "integer"},
         "entity_code": {"type": "string"},
     }), _list_imputation_references),

    ("list_imputations",
     "Liste les imputations de coût d'un owner (ads/voyage/mission/purchase_order/…).",
     _s({
         "owner_type": {"type": "string"},
         "owner_id": {"type": "string"},
     }, ["owner_type", "owner_id"]), _list_imputations),

    ("add_imputation",
     "Ajoute une imputation (split de coût) à un owner. "
     "La somme des pourcentages par owner doit rester ≤ 100. "
     "owner_type: ads, voyage, mission, purchase_order, … "
     "Au moins une cible (imputation_reference_id, project_id, cost_center_id) est recommandée.",
     _s({
         "owner_type": {"type": "string"},
         "owner_id": {"type": "string"},
         "percentage": {"type": "number", "description": "(0, 100]"},
         "imputation_reference_id": {"type": "string"},
         "project_id": {"type": "string"},
         "cost_center_id": {"type": "string"},
         "cross_imputation": {"type": "boolean"},
         "notes": {"type": "string"},
     }, ["owner_type", "owner_id", "percentage"]), _add_imputation),

    ("delete_imputation",
     "Supprime une imputation par son id.",
     _s({"id": {"type": "string"}}, ["id"]), _delete_imputation),

    # ── Users (read-only) ────────────────────────────────────────────────
    ("list_users",
     "Liste les comptes utilisateurs. Lecture seule via MCP — la création de "
     "compte doit se faire dans OpsFlux directement. Filtres: search, only_active.",
     _s({
         "search": {"type": "string"},
         "only_active": {"type": "boolean"},
         "limit": {"type": "integer"},
     }), _list_users),

    ("get_user",
     "Récupère un utilisateur par id ou par email.",
     _s({
         "id": {"type": "string"},
         "email": {"type": "string"},
     }), _get_user),

    # ── Settings / configuration ─────────────────────────────────────────
    ("list_settings",
     "Liste les paramètres de configuration. Filtres: scope (tenant/entity/user), "
     "key_prefix (ex: 'integration.gouti.' pour ne voir que la config Gouti).",
     _s({
         "scope": {"type": "string"},
         "key_prefix": {"type": "string"},
         "limit": {"type": "integer"},
     }), _list_settings),

    ("get_setting",
     "Récupère un paramètre de config par key (+ scope et scope_id optionnels).",
     _s({
         "key": {"type": "string"},
         "scope": {"type": "string", "description": "tenant|entity|user (défaut tenant)"},
         "scope_id": {"type": "string"},
     }, ["key"]), _get_setting),

    ("set_setting",
     "Crée ou met à jour un paramètre de config. value peut être un objet JSON "
     "ou une chaîne — si chaîne, sera wrappée dans {\"value\": ...}. "
     "scope: tenant (défaut) | entity | user. scope_id identifie l'entité/user "
     "ciblé pour les scopes non-tenant.",
     _s({
         "key": {"type": "string"},
         "value": {},
         "scope": {"type": "string"},
         "scope_id": {"type": "string"},
     }, ["key", "value"]), _set_setting),

    ("delete_setting",
     "Supprime un paramètre de config par key(+scope+scope_id).",
     _s({
         "key": {"type": "string"},
         "scope": {"type": "string"},
         "scope_id": {"type": "string"},
     }, ["key"]), _delete_setting),

    # ── Projets (gestion de projets) ────────────────────────────────────
    ("list_projects",
     "Liste les projets OpsFlux. Filtres: search, status, project_type, limit (défaut 20, max 200).",
     _s({
         "search": {"type": "string", "description": "Filtre texte (nom ou code)"},
         "status": {"type": "string", "description": "Filtre par statut (draft, active, on_hold, completed, cancelled)"},
         "project_type": {"type": "string", "description": "Filtre par type (project, gouti)"},
         "limit": {"type": "integer", "description": "Nombre max de résultats"},
         "entity_code": {"type": "string", "description": "Code entité (optionnel)"},
     }), _list_projects),

    ("get_project",
     "Récupère les détails d'un projet par id (UUID) ou code (ex: PRJ-2026-0001).",
     _s({
         "id": {"type": "string", "description": "UUID du projet"},
         "code": {"type": "string", "description": "Code du projet"},
         "entity_code": {"type": "string"},
     }), _get_project),

    ("create_project",
     "Crée un nouveau projet. Seul 'name' est obligatoire.",
     _s({
         "name": {"type": "string", "description": "Nom du projet"},
         "description": {"type": "string"},
         "project_type": {"type": "string", "description": "project (défaut) ou gouti"},
         "status": {"type": "string", "description": "draft (défaut), active, on_hold, completed, cancelled"},
         "priority": {"type": "string", "description": "low, medium (défaut), high, critical"},
         "weather": {"type": "string", "description": "sunny (défaut), cloudy, rainy, stormy"},
         "budget": {"type": "number"},
         "entity_code": {"type": "string"},
     }, ["name"]), _create_project),

    ("update_project",
     "Met à jour un projet existant. Champs modifiables: name, description, status, priority, weather, project_type, budget, start_date, end_date.",
     _s({
         "id": {"type": "string", "description": "UUID du projet (obligatoire)"},
         "name": {"type": "string"},
         "description": {"type": "string"},
         "status": {"type": "string"},
         "priority": {"type": "string"},
         "weather": {"type": "string"},
         "project_type": {"type": "string"},
         "budget": {"type": "number"},
         "start_date": {"type": "string", "description": "Date ISO (YYYY-MM-DD)"},
         "end_date": {"type": "string", "description": "Date ISO (YYYY-MM-DD)"},
     }, ["id"]), _update_project),

    ("list_project_tasks",
     "Liste les tâches d'un projet. Filtres: status, limit (défaut 50, max 500).",
     _s({
         "project_id": {"type": "string", "description": "UUID du projet (obligatoire)"},
         "status": {"type": "string", "description": "Filtre par statut (todo, in_progress, done, cancelled)"},
         "limit": {"type": "integer"},
     }, ["project_id"]), _list_project_tasks),

    ("create_project_task",
     "Crée une tâche dans un projet. project_id et title obligatoires.",
     _s({
         "project_id": {"type": "string", "description": "UUID du projet"},
         "title": {"type": "string", "description": "Titre de la tâche"},
         "description": {"type": "string"},
         "status": {"type": "string", "description": "todo (défaut), in_progress, done, cancelled"},
         "priority": {"type": "string", "description": "low, medium (défaut), high, critical"},
         "parent_id": {"type": "string", "description": "UUID de la tâche parente (sous-tâche)"},
         "estimated_hours": {"type": "number"},
     }, ["project_id", "title"]), _create_project_task),

    ("list_project_milestones",
     "Liste les jalons d'un projet, triés par date.",
     _s({
         "project_id": {"type": "string", "description": "UUID du projet (obligatoire)"},
     }, ["project_id"]), _list_project_milestones),

    ("get_project_cpm",
     "Calcule le chemin critique (CPM) d'un projet: durées, marges, tâches critiques.",
     _s({
         "project_id": {"type": "string", "description": "UUID du projet (obligatoire)"},
     }, ["project_id"]), _get_project_cpm),

    ("get_project_activity_feed",
     "Flux d'activité unifié d'un projet: changements de statut, modifications de tâches. limit=30 par défaut.",
     _s({
         "project_id": {"type": "string", "description": "UUID du projet (obligatoire)"},
         "limit": {"type": "integer", "description": "Nombre max d'événements (défaut 30, max 100)"},
     }, ["project_id"]), _get_project_activity_feed),

    ("list_project_templates",
     "Liste les templates de projet disponibles, triés par popularité.",
     _s({
         "entity_code": {"type": "string", "description": "Code entité (optionnel)"},
     }), _list_project_templates),
]

def _resolve_tool_permissions(name: str) -> list[str]:
    """Return the minimum permission set required for an OpsFlux native tool.

    This is intentionally conservative for user-scoped MCP tokens. Unknown tools
    stay hidden until they are mapped explicitly.
    """
    if name in {"list_tiers", "get_tier", "list_contacts", "get_contact", "list_phones", "list_emails",
                "list_addresses", "list_notes", "list_tags", "list_legal_identifiers",
                "list_external_refs", "list_tier_blocks", "list_contact_transfers"}:
        return ["tier.read"]
    if name in {"create_tier"}:
        return ["tier.create"]
    if name in {"update_tier", "block_tier", "unblock_tier"}:
        return ["tier.update"]
    if name in {"archive_tier"}:
        return ["tier.delete"]
    if name in {"create_contact", "update_contact", "archive_contact", "transfer_contact"}:
        return ["tier.contact.manage"]
    if name in {"add_phone", "delete_phone", "add_email", "delete_email", "add_address", "delete_address",
                "add_note", "delete_note", "add_tag", "delete_tag", "add_legal_identifier",
                "delete_legal_identifier", "add_external_ref"}:
        return ["tier.update"]

    if name in {"check_compliance"}:
        return ["conformite.check"]
    if name in {"list_compliance_records"}:
        return ["conformite.record.read"]
    if name in {"add_compliance_record"}:
        return ["conformite.record.create"]
    if name in {"list_compliance_types"}:
        return ["conformite.type.read"]
    if name in {"create_compliance_type"}:
        return ["conformite.type.create"]
    if name in {"list_compliance_rules"}:
        return ["conformite.rule.read"]
    if name in {"create_compliance_rule"}:
        return ["conformite.rule.create"]

    if name in {"list_sites", "list_assets", "get_asset", "list_fields", "get_field",
                "list_equipment", "get_equipment", "get_asset_hierarchy"}:
        return ["asset.read"]

    if name in {"list_ads", "get_ads", "list_pax_groups"}:
        return ["paxlog.ads.read"]

    if name in {"list_planner_activities", "get_planner_activity"}:
        return ["planner.activity.read"]
    if name in {"list_planner_conflicts"}:
        return ["planner.conflict.read"]

    if name in {"list_vectors", "get_vector"}:
        return ["travelwiz.vector.read"]
    if name in {"list_voyages", "get_voyage"}:
        return ["travelwiz.voyage.read"]

    if name in {"list_cost_centers", "list_imputation_references", "list_imputations"}:
        return ["imputation.read"]
    if name in {"add_imputation", "delete_imputation"}:
        return ["imputation.assignment.manage"]

    if name in {"list_users", "get_user"}:
        return ["user.read"]

    if name in {"list_settings", "get_setting", "set_setting", "delete_setting"}:
        return ["core.settings.manage"]

    if name in {"list_projects", "get_project", "list_project_tasks", "list_project_milestones",
                "get_project_cpm", "get_project_activity_feed", "list_project_templates"}:
        return ["project.read"]
    if name in {"create_project"}:
        return ["project.create"]
    if name in {"update_project"}:
        return ["project.update"]
    if name in {"create_project_task"}:
        return ["project.task.create"]

    return []


def _tool_visible_for_context(tool_name: str, context: NativeToolContext | None) -> bool:
    if context is None:
        return True
    required = _resolve_tool_permissions(tool_name)
    if not required:
        return False
    return "*" in context.permissions or all(code in context.permissions for code in required)


OPSFLUX_TOOLS_LIST = [
    {
        "name": n,
        "description": d,
        "inputSchema": s,
        "permissions": _resolve_tool_permissions(n),
    }
    for n, d, s, _ in OPSFLUX_TOOLS
]
OPSFLUX_HANDLERS: dict[str, Any] = {n: h for n, _, _, h in OPSFLUX_TOOLS}


# ─── Factory ─────────────────────────────────────────────────────────────────

async def create_opsflux_backend(config: dict) -> NativeBackend:
    """Create the OpsFlux native MCP backend.

    ``config`` is unused today (no credentials needed — we access the
    OpsFlux DB directly) but kept for symmetry with other native backends.
    """
    logger.info("MCP opsflux: initializing backend (%d tools)", len(OPSFLUX_TOOLS_LIST))

    async def call_tool(name: str, arguments: dict) -> dict:
        handler = OPSFLUX_HANDLERS.get(name)
        if handler is None:
            raise ValueError(f"Outil inconnu: {name}")
        return await handler(arguments)

    async def list_tools_for_context(context: NativeToolContext | None) -> list[dict[str, Any]]:
        if context is None:
            return OPSFLUX_TOOLS_LIST
        return [tool for tool in OPSFLUX_TOOLS_LIST if _tool_visible_for_context(tool["name"], context)]

    async def call_tool_with_context(
        name: str,
        arguments: dict,
        context: NativeToolContext | None,
    ) -> dict:
        if not _tool_visible_for_context(name, context):
            raise ValueError(f"Outil non autorisé: {name}")
        return await call_tool(name, arguments)

    return NativeBackend(
        name="opsflux",
        version="1.0.0",
        tools_list=OPSFLUX_TOOLS_LIST,
        call_tool=call_tool,
        list_tools_fn=list_tools_for_context,
        call_tool_with_context=call_tool_with_context,
        close_fn=None,
    )
