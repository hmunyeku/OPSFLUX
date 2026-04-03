"""MCP plugin registration — called at startup."""

import logging

from app.mcp.registry import mcp_registry

logger = logging.getLogger(__name__)


async def _ensure_gouti_backend() -> None:
    """Ensure the Gouti native backend row exists in mcp_gateway_backends.

    Idempotent — creates the row only if slug 'gouti' doesn't exist yet.
    """
    from sqlalchemy import select, text
    from app.core.database import async_session_factory
    from app.models.mcp_gateway import McpGatewayBackend

    async with async_session_factory() as session:
        await session.execute(text("SET search_path TO public"))
        result = await session.execute(
            select(McpGatewayBackend).where(McpGatewayBackend.slug == "gouti")
        )
        if result.scalar_one_or_none() is not None:
            return  # already exists

        backend = McpGatewayBackend(
            slug="gouti",
            name="Gouti Project Management",
            upstream_url="internal://gouti",
            description="Native Gouti MCP tools (auto-created)",
            active=True,
        )
        session.add(backend)
        await session.commit()
        logger.info("MCP: auto-created Gouti native backend entry")


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
    register_native_initializer("gouti", create_gouti_backend)

    # Ensure Gouti backend row exists in DB (idempotent)
    try:
        await _ensure_gouti_backend()
    except Exception as exc:
        logger.warning("MCP: could not auto-create Gouti backend entry: %s", exc)

    logger.info("MCP: all plugins registered (%d tools total)", mcp_registry.tool_count)
