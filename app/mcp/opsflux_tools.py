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
from typing import Any
from uuid import UUID

from sqlalchemy import func as sqla_func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.references import generate_reference
from app.models.common import Tier, TierContact, Entity
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
