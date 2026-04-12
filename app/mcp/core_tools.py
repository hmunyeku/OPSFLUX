"""Core MCP tools — registered at startup.

These tools provide AI/MCP clients access to common OpsFlux operations:
search assets, get asset details, search tiers, etc.

Each handler follows the signature:
    async def handler(*, params: dict, user: User, entity_id: UUID, db: AsyncSession) -> dict
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.registry import MCPRegistry, MCPToolDef
from app.models.asset_registry import Installation
from app.models.common import (
    # Installation removed — use Installation
    Notification,
    Tier,
    User,
    WorkflowInstance,
)

logger = logging.getLogger(__name__)


# ── Tool handlers ────────────────────────────────────────────────────────────


async def _search_assets(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Search assets by name, code, or type within the current entity."""
    query = select(Installation).where(
        Installation.entity_id == entity_id,
        Installation.archived == False,
    )

    search = params.get("search")
    asset_type = params.get("type")
    limit = min(params.get("limit", 25), 100)

    if search:
        like = f"%{search}%"
        query = query.where(Installation.name.ilike(like) | Installation.code.ilike(like))
    if asset_type:
        query = query.where(Installation.installation_type == asset_type)

    query = query.order_by(Installation.name).limit(limit)
    result = await db.execute(query)
    assets = result.scalars().all()

    return {
        "count": len(assets),
        "assets": [
            {
                "id": str(a.id),
                "code": a.code,
                "name": a.name,
                "type": a.type,
                "active": a.active,
                "parent_id": str(a.parent_id) if a.parent_id else None,
            }
            for a in assets
        ],
    }


async def _get_asset(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Get asset details by ID or code."""
    asset_id = params.get("id")
    asset_code = params.get("code")

    if not asset_id and not asset_code:
        return {"error": "Provide either 'id' or 'code' parameter."}

    query = select(Installation).where(Installation.entity_id == entity_id)
    if asset_id:
        try:
            query = query.where(Installation.id == UUID(asset_id))
        except ValueError:
            return {"error": f"Invalid UUID: {asset_id}"}
    elif asset_code:
        query = query.where(Installation.code == asset_code)

    result = await db.execute(query)
    asset = result.scalar_one_or_none()

    if not asset:
        return {"error": "Asset not found."}

    return {
        "id": str(asset.id),
        "code": asset.code,
        "name": asset.name,
        "type": asset.type,
        "active": asset.active,
        "path": asset.path,
        "parent_id": str(asset.parent_id) if asset.parent_id else None,
        "latitude": asset.latitude,
        "longitude": asset.longitude,
        "metadata": asset.metadata_,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
    }


async def _search_tiers(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Search companies/tiers by name or code."""
    query = select(Tier).where(
        Tier.entity_id == entity_id,
        Tier.active == True,
        Tier.archived == False,
    )

    search = params.get("search")
    tier_type = params.get("type")
    limit = min(params.get("limit", 25), 100)

    if search:
        like = f"%{search}%"
        query = query.where(Tier.name.ilike(like) | Tier.code.ilike(like))
    if tier_type:
        query = query.where(Tier.type == tier_type)

    query = query.order_by(Tier.name).limit(limit)
    result = await db.execute(query)
    tiers = result.scalars().all()

    return {
        "count": len(tiers),
        "tiers": [
            {
                "id": str(t.id),
                "code": t.code,
                "name": t.name,
                "type": t.type,
                "email": t.email,
                "phone": t.phone,
                "active": t.active,
            }
            for t in tiers
        ],
    }


async def _get_tier(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Get tier/company details by ID or code."""
    tier_id = params.get("id")
    tier_code = params.get("code")

    if not tier_id and not tier_code:
        return {"error": "Provide either 'id' or 'code' parameter."}

    query = select(Tier).where(Tier.entity_id == entity_id)
    if tier_id:
        try:
            query = query.where(Tier.id == UUID(tier_id))
        except ValueError:
            return {"error": f"Invalid UUID: {tier_id}"}
    elif tier_code:
        query = query.where(Tier.code == tier_code)

    result = await db.execute(query)
    tier = result.scalar_one_or_none()

    if not tier:
        return {"error": "Tier not found."}

    return {
        "id": str(tier.id),
        "code": tier.code,
        "name": tier.name,
        "type": tier.type,
        "email": tier.email,
        "phone": tier.phone,
        "active": tier.active,
        "metadata": tier.metadata_,
        "created_at": tier.created_at.isoformat() if tier.created_at else None,
        "updated_at": tier.updated_at.isoformat() if tier.updated_at else None,
    }


async def _search_users(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Search users by name or email."""
    query = select(User).where(User.active == True)

    search = params.get("search")
    limit = min(params.get("limit", 25), 100)

    if search:
        like = f"%{search}%"
        query = query.where(User.first_name.ilike(like) | User.last_name.ilike(like) | User.email.ilike(like))

    query = query.order_by(User.last_name, User.first_name).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "count": len(users),
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "full_name": u.full_name,
                "active": u.active,
            }
            for u in users
        ],
    }


async def _get_notifications(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Get recent notifications for the current user."""
    unread_only = params.get("unread_only", False)
    limit = min(params.get("limit", 20), 100)

    query = (
        select(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.entity_id == entity_id,
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )

    if unread_only:
        query = query.where(Notification.read == False)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return {
        "count": len(notifications),
        "notifications": [
            {
                "id": str(n.id),
                "title": n.title,
                "body": n.body,
                "category": n.category,
                "link": n.link,
                "read": n.read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ],
    }


async def _get_workflow_status(
    *,
    params: dict,
    user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Get status of a workflow instance by ID or entity reference."""
    instance_id = params.get("id")
    entity_type = params.get("entity_type")
    entity_id_ref = params.get("entity_id_ref")

    query = select(WorkflowInstance)

    if instance_id:
        try:
            query = query.where(WorkflowInstance.id == UUID(instance_id))
        except ValueError:
            return {"error": f"Invalid UUID: {instance_id}"}
    elif entity_type and entity_id_ref:
        query = query.where(
            WorkflowInstance.entity_type == entity_type,
            WorkflowInstance.entity_id_ref == entity_id_ref,
        )
    else:
        return {"error": "Provide 'id' or both 'entity_type' and 'entity_id_ref'."}

    result = await db.execute(query)
    instance = result.scalar_one_or_none()

    if not instance:
        return {"error": "Workflow instance not found."}

    return {
        "id": str(instance.id),
        "workflow_definition_id": str(instance.workflow_definition_id),
        "entity_type": instance.entity_type,
        "entity_id_ref": instance.entity_id_ref,
        "current_state": instance.current_state,
        "metadata": instance.metadata_,
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
        "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
    }


# ── Registration ─────────────────────────────────────────────────────────────


def register_core_tools(registry: MCPRegistry) -> None:
    """Register all core MCP tools with the registry."""

    registry.register_tool(
        MCPToolDef(
            name="search_assets",
            description="Search assets by name, code, or type within the current entity.",
            parameters={
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search term (matches name or code, case-insensitive).",
                    },
                    "type": {
                        "type": "string",
                        "description": "Filter by asset type (e.g. 'platform', 'well', 'pipeline').",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return (default 25, max 100).",
                        "default": 25,
                    },
                },
            },
            handler=_search_assets,
            module="core",
            permissions=["asset.read"],
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="get_asset",
            description="Get detailed information about a specific asset by ID or code.",
            parameters={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Asset UUID.",
                    },
                    "code": {
                        "type": "string",
                        "description": "Asset code (e.g. 'AST-2026-0001').",
                    },
                },
            },
            handler=_get_asset,
            module="core",
            permissions=["asset.read"],
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="search_tiers",
            description="Search companies/organizations (tiers) by name or code.",
            parameters={
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search term (matches name or code, case-insensitive).",
                    },
                    "type": {
                        "type": "string",
                        "description": "Filter by tier type.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return (default 25, max 100).",
                        "default": 25,
                    },
                },
            },
            handler=_search_tiers,
            module="core",
            permissions=["tier.read"],
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="get_tier",
            description="Get detailed information about a specific company/tier by ID or code.",
            parameters={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Tier UUID.",
                    },
                    "code": {
                        "type": "string",
                        "description": "Tier code.",
                    },
                },
            },
            handler=_get_tier,
            module="core",
            permissions=["tier.read"],
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="search_users",
            description="Search users by name or email.",
            parameters={
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Search term (matches first name, last name, or email).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return (default 25, max 100).",
                        "default": 25,
                    },
                },
            },
            handler=_search_users,
            module="core",
            permissions=["user.read"],
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="get_notifications",
            description="Get recent notifications for the current user.",
            parameters={
                "type": "object",
                "properties": {
                    "unread_only": {
                        "type": "boolean",
                        "description": "Only return unread notifications.",
                        "default": False,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum notifications to return (default 20, max 100).",
                        "default": 20,
                    },
                },
            },
            handler=_get_notifications,
            module="core",
            permissions=[],  # Any authenticated user can see their own notifications
        )
    )

    registry.register_tool(
        MCPToolDef(
            name="get_workflow_status",
            description="Get the current status of a workflow instance by ID or entity reference.",
            parameters={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Workflow instance UUID.",
                    },
                    "entity_type": {
                        "type": "string",
                        "description": "Entity type (e.g. 'purchase_request').",
                    },
                    "entity_id_ref": {
                        "type": "string",
                        "description": "Entity ID reference (UUID string of the owning object).",
                    },
                },
            },
            handler=_get_workflow_status,
            module="core",
            permissions=["workflow.instance.read"],
        )
    )

    logger.info("MCP: %d core tools registered", registry.tool_count)
