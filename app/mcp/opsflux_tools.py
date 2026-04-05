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
    Address,
    Attachment,
    ComplianceRecord,
    ComplianceType,
    ContactEmail,
    Entity,
    ExternalReference,
    LegalIdentifier,
    Note,
    OpeningHour,
    Phone,
    SocialNetwork,
    Tag,
    Tier,
    TierBlock,
    TierContact,
    TierContactTransfer,
    User,
)
from app.mcp.mcp_native import NativeBackend

logger = logging.getLogger(__name__)


# ─── Response envelopes ──────────────────────────────────────────────────────

_MAX_RESPONSE_CHARS = 12_000
_MAX_LIST_ITEMS = 50


def _ok(data: Any) -> dict:
    """Return a compact MCP tool result with truncation safety."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)
    if len(text) > _MAX_RESPONSE_CHARS:
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            items = data["items"]
            truncated = list(items)
            while truncated and len(json.dumps(
                {**data, "items": truncated},
                ensure_ascii=False, separators=(",", ":"), default=str,
            )) > _MAX_RESPONSE_CHARS - 200:
                truncated = truncated[:max(1, len(truncated) // 2)]
            data = {
                **data,
                "items": truncated,
                "truncated": True,
                "truncation_note": (
                    f"Affichage réduit à {len(truncated)}/{len(items)} éléments. "
                    "Utilisez search ou un limit plus petit."
                ),
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
]

OPSFLUX_TOOLS_LIST = [
    {"name": n, "description": d, "inputSchema": s} for n, d, s, _ in OPSFLUX_TOOLS
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

    return NativeBackend(
        name="opsflux",
        version="1.0.0",
        tools_list=OPSFLUX_TOOLS_LIST,
        call_tool=call_tool,
        close_fn=None,
    )
