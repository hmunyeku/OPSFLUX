"""MCP Gateway — admin CRUD + authenticated reverse proxy for remote MCP servers.

Admin routes (JWT auth, admin.system permission):
    GET/POST/PUT/DELETE  /api/v1/mcp-gateway/backends
    GET/POST/DELETE      /api/v1/mcp-gateway/tokens

Proxy routes (MCP Bearer token auth, no tenant/entity middleware):
    ANY  /mcp-gw/{backend_slug}/{path:path}
"""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db, async_session_factory
from app.core.tenant_context import set_tenant_schema
from app.models.common import User
from app.models.mcp_gateway import McpGatewayBackend, McpGatewayToken

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Shared httpx client (created lazily, closed at shutdown via lifespan)
# ═══════════════════════════════════════════════════════════════════════════════

_http_client: httpx.AsyncClient | None = None

HOP_BY_HOP = frozenset({
    "transfer-encoding", "connection", "keep-alive",
    "te", "trailers", "upgrade",
    "proxy-authorization", "proxy-authenticate",
})


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0),
            follow_redirects=False,
        )
    return _http_client


async def close_http_client():
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ═══════════════════════════════════════════════════════════════════════════════
# Token helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def _verify_mcp_token(
    auth_header: str | None,
) -> McpGatewayToken | None:
    """Validate a Bearer token from the Authorization header.

    Uses a fresh DB session in the public schema (no tenant context needed).
    Returns the token row if valid, None otherwise.
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    raw = auth_header[7:]
    token_hash = _hash_token(raw)

    async with async_session_factory() as session:
        await session.execute(
            __import__("sqlalchemy").text("SET search_path TO public")
        )
        result = await session.execute(
            select(McpGatewayToken).where(
                McpGatewayToken.token_hash == token_hash,
                McpGatewayToken.revoked == False,  # noqa: E712
            )
        )
        token = result.scalar_one_or_none()

        if token is None:
            return None

        # Check expiry
        if token.expires_at and token.expires_at < datetime.now(UTC):
            return None

        # Update last_used_at (fire-and-forget)
        await session.execute(
            update(McpGatewayToken)
            .where(McpGatewayToken.id == token.id)
            .values(last_used_at=datetime.now(UTC))
        )
        await session.commit()

        return token


# ═══════════════════════════════════════════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════════════════════════════════════════

class BackendCreate(BaseModel):
    slug: str = Field(max_length=50, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(max_length=200)
    upstream_url: str = Field(max_length=500)
    description: str | None = None
    active: bool = True


class BackendUpdate(BaseModel):
    name: str | None = None
    upstream_url: str | None = None
    description: str | None = None
    active: bool | None = None


class BackendOut(BaseModel):
    id: UUID
    slug: str
    name: str
    upstream_url: str
    description: str | None
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TokenCreate(BaseModel):
    name: str = Field(max_length=200)
    scopes: str = Field(default="*", max_length=500)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class TokenOut(BaseModel):
    id: UUID
    name: str
    scopes: str
    created_at: datetime
    expires_at: datetime | None
    revoked: bool
    last_used_at: datetime | None
    token_preview: str  # first 8 chars

    model_config = {"from_attributes": True}


class TokenCreated(BaseModel):
    id: UUID
    name: str
    token: str  # shown once
    scopes: str
    expires_at: datetime | None


# ═══════════════════════════════════════════════════════════════════════════════
# Admin router (JWT auth)
# ═══════════════════════════════════════════════════════════════════════════════

admin_router = APIRouter(
    prefix="/api/v1/mcp-gateway",
    tags=["mcp-gateway"],
)


# ── Backends CRUD ─────────────────────────────────────────────────────────────

@admin_router.get("/backends", response_model=list[BackendOut])
async def list_backends(
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayBackend).order_by(McpGatewayBackend.slug)
    )
    return result.scalars().all()


@admin_router.post("/backends", response_model=BackendOut, status_code=201)
async def create_backend(
    body: BackendCreate,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    backend = McpGatewayBackend(
        slug=body.slug,
        name=body.name,
        upstream_url=body.upstream_url.rstrip("/"),
        description=body.description,
        active=body.active,
    )
    db.add(backend)
    await db.commit()
    await db.refresh(backend)
    return backend


@admin_router.put("/backends/{backend_id}", response_model=BackendOut)
async def update_backend(
    backend_id: UUID,
    body: BackendUpdate,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayBackend).where(McpGatewayBackend.id == backend_id)
    )
    backend = result.scalar_one_or_none()
    if not backend:
        raise HTTPException(404, "Backend not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "upstream_url" and value:
            value = value.rstrip("/")
        setattr(backend, field, value)

    await db.commit()
    await db.refresh(backend)
    return backend


@admin_router.delete("/backends/{backend_id}", status_code=204)
async def delete_backend(
    backend_id: UUID,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayBackend).where(McpGatewayBackend.id == backend_id)
    )
    backend = result.scalar_one_or_none()
    if not backend:
        raise HTTPException(404, "Backend not found")
    await db.delete(backend)
    await db.commit()


# ── Tokens CRUD ───────────────────────────────────────────────────────────────

@admin_router.get("/tokens", response_model=list[TokenOut])
async def list_tokens(
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayToken).order_by(McpGatewayToken.created_at.desc())
    )
    tokens = result.scalars().all()
    return [
        TokenOut(
            id=t.id,
            name=t.name,
            scopes=t.scopes,
            created_at=t.created_at,
            expires_at=t.expires_at,
            revoked=t.revoked,
            last_used_at=t.last_used_at,
            token_preview=t.token_hash[:8] + "...",
        )
        for t in tokens
    ]


@admin_router.post("/tokens", response_model=TokenCreated, status_code=201)
async def create_token(
    body: TokenCreate,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    raw_token = secrets.token_hex(32)
    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)

    token = McpGatewayToken(
        name=body.name,
        token_hash=_hash_token(raw_token),
        scopes=body.scopes,
        created_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)

    return TokenCreated(
        id=token.id,
        name=token.name,
        token=raw_token,
        scopes=token.scopes,
        expires_at=token.expires_at,
    )


@admin_router.post("/tokens/{token_id}/revoke", status_code=200)
async def revoke_token(
    token_id: UUID,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayToken).where(McpGatewayToken.id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(404, "Token not found")
    token.revoked = True
    await db.commit()
    return {"status": "revoked"}


@admin_router.delete("/tokens/{token_id}", status_code=204)
async def delete_token(
    token_id: UUID,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(McpGatewayToken).where(McpGatewayToken.id == token_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(404, "Token not found")
    await db.delete(token)
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Proxy router (MCP Bearer token auth — no JWT, no tenant middleware)
# ═══════════════════════════════════════════════════════════════════════════════

proxy_router = APIRouter(prefix="/mcp-gw", tags=["mcp-gateway-proxy"])


@proxy_router.api_route(
    "/{backend_slug}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_to_backend(backend_slug: str, path: str, request: Request):
    """Authenticate via MCP Bearer token, then proxy to the upstream backend."""

    # 1. Validate Bearer token
    auth_header = request.headers.get("authorization")
    token = await _verify_mcp_token(auth_header)
    if token is None:
        return JSONResponse(
            {"error": "Unauthorized — invalid or missing Bearer token"},
            status_code=401,
        )

    # 2. Check scope
    if token.scopes != "*":
        allowed = {s.strip() for s in token.scopes.split(",")}
        if backend_slug not in allowed:
            return JSONResponse(
                {"error": f"Forbidden — token does not have access to '{backend_slug}'"},
                status_code=403,
            )

    # 3. Look up backend
    async with async_session_factory() as session:
        await session.execute(
            __import__("sqlalchemy").text("SET search_path TO public")
        )
        result = await session.execute(
            select(McpGatewayBackend).where(
                McpGatewayBackend.slug == backend_slug,
                McpGatewayBackend.active == True,  # noqa: E712
            )
        )
        backend = result.scalar_one_or_none()

    if backend is None:
        return JSONResponse(
            {"error": f"Backend '{backend_slug}' not found or inactive"},
            status_code=404,
        )

    # 4. Build upstream request
    upstream_url = f"{backend.upstream_url}/{path}"
    if request.url.query:
        upstream_url += f"?{request.url.query}"

    # Forward headers (strip auth and hop-by-hop)
    forward_headers = {}
    for key, value in request.headers.items():
        if key.lower() in ("host", "authorization") or key.lower() in HOP_BY_HOP:
            continue
        forward_headers[key] = value

    body = await request.body()
    client = _get_http_client()

    try:
        upstream_req = client.build_request(
            method=request.method,
            url=upstream_url,
            headers=forward_headers,
            content=body,
        )
        upstream_resp = await client.send(upstream_req, stream=True)
    except httpx.ConnectError:
        return JSONResponse(
            {"error": f"Cannot reach backend '{backend_slug}'"},
            status_code=502,
        )
    except httpx.TimeoutException:
        return JSONResponse(
            {"error": f"Backend '{backend_slug}' timed out"},
            status_code=504,
        )

    # 5. Stream response back (handles SSE and JSON)
    response_headers = {
        k: v for k, v in upstream_resp.headers.items()
        if k.lower() not in HOP_BY_HOP
        and k.lower() not in ("content-length", "content-encoding")
    }

    async def stream_body():
        try:
            async for chunk in upstream_resp.aiter_bytes():
                yield chunk
        finally:
            await upstream_resp.aclose()

    return StreamingResponse(
        stream_body(),
        status_code=upstream_resp.status_code,
        headers=response_headers,
    )


# Combined router for main.py registration
router = APIRouter()
router.include_router(admin_router)
router.include_router(proxy_router)
