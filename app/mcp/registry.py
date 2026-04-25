"""MCP Tool Registry — central registry for all MCP tools across modules.

Modules register tools as plugins via ``mcp_registry.register_tool()``.
The registry enforces permission checks before execution and provides
a filterable listing of available tools.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass
class MCPToolDef:
    """Definition of an MCP tool that a module registers."""

    name: str
    """Tool name (e.g. ``search_assets``)."""

    description: str
    """Human-readable description."""

    parameters: dict[str, Any]
    """JSON Schema for the tool parameters."""

    handler: Callable
    """Async function to execute: ``async def handler(params, user, entity_id, db) -> dict``."""

    module: str
    """Module slug that registered this tool (e.g. ``core``, ``asset_registry``)."""

    permissions: list[str] = field(default_factory=list)
    """Required permissions to use this tool. Empty = any authenticated user."""


class MCPRegistry:
    """Central registry for all MCP tools across modules.

    Singleton pattern — use the global ``mcp_registry`` instance.
    """

    def __init__(self) -> None:
        self._tools: dict[str, MCPToolDef] = {}

    def register_tool(self, tool: MCPToolDef) -> None:
        """Register an MCP tool definition.

        If a tool with the same name already exists it will be overwritten
        (allows hot-reload in dev).
        """
        if tool.name in self._tools:
            logger.warning("MCP: overwriting existing tool '%s'", tool.name)
        self._tools[tool.name] = tool
        logger.info(
            "MCP: registered tool '%s' (module=%s, perms=%s)",
            tool.name,
            tool.module,
            tool.permissions,
        )

    def unregister_tool(self, name: str) -> None:
        """Remove a previously registered tool."""
        self._tools.pop(name, None)

    def get_tool(self, name: str) -> MCPToolDef | None:
        """Return a tool definition by name, or ``None``."""
        return self._tools.get(name)

    def list_tools(self, user_permissions: list[str] | set[str] | None = None) -> list[MCPToolDef]:
        """Return all tools the user is allowed to see.

        If ``user_permissions`` is ``None``, return all tools (admin use).
        Otherwise, only tools whose required permissions are a subset of
        the user's permissions are returned. The wildcard ``*`` permission
        grants access to everything.
        """
        if user_permissions is None:
            return list(self._tools.values())

        perm_set = set(user_permissions)
        result: list[MCPToolDef] = []

        for tool in self._tools.values():
            if not tool.permissions:
                # No permissions required — available to any authenticated user
                result.append(tool)
            elif "*" in perm_set:
                result.append(tool)
            elif all(p in perm_set for p in tool.permissions):
                result.append(tool)

        return result

    async def execute_tool(
        self,
        name: str,
        params: dict[str, Any],
        user: Any,
        entity_id: UUID,
        db: AsyncSession,
        user_permissions: set[str] | None = None,
    ) -> dict[str, Any]:
        """Execute a registered MCP tool with permission checking.

        Parameters
        ----------
        name : str
            Tool name to execute.
        params : dict
            Parameters to pass to the tool handler.
        user : User
            The authenticated user making the request.
        entity_id : UUID
            Current entity scope.
        db : AsyncSession
            Active database session.
        user_permissions : set[str] | None
            Pre-loaded user permissions. If ``None``, permission check is
            skipped (use with caution — only for internal calls).

        Returns
        -------
        dict
            Result from the tool handler.

        Raises
        ------
        ValueError
            If the tool is not found.
        PermissionError
            If the user lacks the required permissions.
        """
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"MCP tool '{name}' not found")

        # Permission check
        if user_permissions is not None and tool.permissions:
            if "*" not in user_permissions:
                missing = [p for p in tool.permissions if p not in user_permissions]
                if missing:
                    raise PermissionError(
                        f"Missing permissions for tool '{name}': {', '.join(missing)}"
                    )

        logger.info(
            "MCP: executing tool '%s' (user=%s, entity=%s)",
            name,
            getattr(user, "id", "unknown"),
            entity_id,
        )

        try:
            result = await tool.handler(
                params=params,
                user=user,
                entity_id=entity_id,
                db=db,
            )
            return result
        except Exception:
            logger.exception("MCP: error executing tool '%s'", name)
            raise

    @property
    def tool_count(self) -> int:
        """Number of registered tools."""
        return len(self._tools)


# Global singleton instance
mcp_registry = MCPRegistry()
