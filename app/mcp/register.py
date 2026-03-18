"""MCP plugin registration — called at startup."""

import logging

from app.mcp.registry import mcp_registry

logger = logging.getLogger(__name__)


async def register_mcp_plugins() -> None:
    """Register all MCP tool plugins from active modules.

    Called during application startup (lifespan). Each module that provides
    MCP tools has a ``register_*_tools(registry)`` function.
    """
    from app.mcp.core_tools import register_core_tools

    register_core_tools(mcp_registry)

    logger.info("MCP: all plugins registered (%d tools total)", mcp_registry.tool_count)
