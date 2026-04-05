"""MCP plugin registration — called at startup."""

import hashlib
import logging
import os

from app.mcp.registry import mcp_registry

logger = logging.getLogger(__name__)


async def _ensure_native_backend(
    slug: str, name: str, description: str,
) -> None:
    """Ensure a native backend row exists in mcp_gateway_backends.

    Idempotent — creates the row only if the slug doesn't exist yet.
    """
    from sqlalchemy import select, text
    from app.core.database import async_session_factory
    from app.models.mcp_gateway import McpGatewayBackend

    async with async_session_factory() as session:
        await session.execute(text("SET search_path TO public"))
        result = await session.execute(
            select(McpGatewayBackend).where(McpGatewayBackend.slug == slug)
        )
        if result.scalar_one_or_none() is not None:
            return

        backend = McpGatewayBackend(
            slug=slug,
            name=name,
            upstream_url=f"internal://{slug}",
            description=description,
            active=True,
        )
        session.add(backend)
        await session.commit()
        logger.info("MCP: auto-created '%s' native backend entry", slug)


async def _ensure_gouti_backend() -> None:
    await _ensure_native_backend(
        slug="gouti",
        name="Gouti Project Management",
        description="Native Gouti MCP tools (auto-created)",
    )


async def _ensure_opsflux_backend() -> None:
    await _ensure_native_backend(
        slug="opsflux",
        name="OpsFlux",
        description="Native OpsFlux MCP tools (tiers, contacts, projects, ...) — auto-created",
    )


async def _ensure_mcp_token() -> None:
    """Ensure at least one MCP gateway token exists.

    If MCP_GATEWAY_TOKEN env var is set, creates a token with that value
    (idempotent by name). Otherwise skips — tokens are managed via admin UI.
    """
    raw_token = os.environ.get("MCP_GATEWAY_TOKEN", "")
    if not raw_token:
        return

    from sqlalchemy import select, text
    from app.core.database import async_session_factory
    from app.models.mcp_gateway import McpGatewayToken

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    async with async_session_factory() as session:
        await session.execute(text("SET search_path TO public"))
        result = await session.execute(
            select(McpGatewayToken).where(McpGatewayToken.token_hash == token_hash)
        )
        if result.scalar_one_or_none() is not None:
            return  # already exists

        token = McpGatewayToken(
            name="auto-mcp-token",
            token_hash=token_hash,
            scopes="*",
        )
        session.add(token)
        await session.commit()
        logger.info("MCP: auto-created gateway token from MCP_GATEWAY_TOKEN env")


async def register_mcp_plugins() -> None:
    """Register all MCP tool plugins from active modules.

    Called during application startup (lifespan). Each module that provides
    MCP tools has a ``register_*_tools(registry)`` function.
    """
    from app.mcp.core_tools import register_core_tools

    register_core_tools(mcp_registry)

    # Register native MCP backend initializers (lazy — actual init on first request)
    from app.mcp.mcp_native import register_native_initializer
    from app.mcp.gouti_tools import create_gouti_backend
    from app.mcp.opsflux_tools import create_opsflux_backend
    register_native_initializer("gouti", create_gouti_backend)
    register_native_initializer("opsflux", create_opsflux_backend)

    # Ensure native backend rows + MCP token exist in DB (idempotent)
    try:
        await _ensure_gouti_backend()
    except Exception as exc:
        logger.warning("MCP: could not auto-create Gouti backend entry: %s", exc)
    try:
        await _ensure_opsflux_backend()
    except Exception as exc:
        logger.warning("MCP: could not auto-create OpsFlux backend entry: %s", exc)

    try:
        await _ensure_mcp_token()
    except Exception as exc:
        logger.warning("MCP: could not auto-create MCP token: %s", exc)

    logger.info("MCP: all plugins registered (%d tools total)", mcp_registry.tool_count)
