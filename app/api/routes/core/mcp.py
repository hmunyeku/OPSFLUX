"""MCP tool routes — list available tools and execute them."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.rbac import get_user_permissions
from app.mcp.registry import mcp_registry
from app.models.common import User

router = APIRouter(prefix="/api/v1/mcp", tags=["mcp"])


# ── Response schemas ─────────────────────────────────────────────────────────


class MCPToolInfo(BaseModel):
    """Public-facing tool information (excludes handler)."""

    name: str
    description: str
    parameters: dict[str, Any]
    module: str
    permissions: list[str]


class MCPToolListResponse(BaseModel):
    count: int
    tools: list[MCPToolInfo]


class MCPToolExecuteRequest(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)


class MCPToolExecuteResponse(BaseModel):
    tool: str
    result: dict[str, Any]


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/tools", response_model=MCPToolListResponse)
async def list_mcp_tools(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List available MCP tools, filtered by the current user's permissions.

    Only tools whose required permissions are all held by the user are returned.
    """
    user_permissions = await get_user_permissions(current_user.id, entity_id, db)
    tools = mcp_registry.list_tools(user_permissions=user_permissions)

    return MCPToolListResponse(
        count=len(tools),
        tools=[
            MCPToolInfo(
                name=t.name,
                description=t.description,
                parameters=t.parameters,
                module=t.module,
                permissions=t.permissions,
            )
            for t in tools
        ],
    )


@router.post("/tools/{tool_name}/execute", response_model=MCPToolExecuteResponse)
async def execute_mcp_tool(
    tool_name: str,
    body: MCPToolExecuteRequest,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Execute an MCP tool with the given parameters.

    Permission check is performed: the user must hold all permissions
    required by the tool. Returns 403 if permissions are insufficient,
    404 if the tool does not exist.
    """
    # Check tool exists
    tool = mcp_registry.get_tool(tool_name)
    if tool is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MCP tool '{tool_name}' not found.",
        )

    # Load user permissions
    user_permissions = await get_user_permissions(current_user.id, entity_id, db)

    try:
        result = await mcp_registry.execute_tool(
            name=tool_name,
            params=body.params,
            user=current_user,
            entity_id=entity_id,
            db=db,
            user_permissions=user_permissions,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tool execution failed: {exc}",
        )

    return MCPToolExecuteResponse(tool=tool_name, result=result)
