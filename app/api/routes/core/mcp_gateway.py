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
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db, async_session_factory
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
        await session.execute(text("SET search_path TO public"))
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
    config: dict | None = Field(
        default=None,
        description="Backend-specific config (credentials for native/internal:// backends)",
    )


class BackendUpdate(BaseModel):
    name: str | None = None
    upstream_url: str | None = None
    description: str | None = None
    active: bool | None = None
    config: dict | None = None


class BackendOut(BaseModel):
    id: UUID
    slug: str
    name: str
    upstream_url: str
    description: str | None
    active: bool
    has_config: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, b: "McpGatewayBackend") -> "BackendOut":
        return cls(
            id=b.id, slug=b.slug, name=b.name, upstream_url=b.upstream_url,
            description=b.description, active=b.active,
            has_config=bool(b.config),
            created_at=b.created_at, updated_at=b.updated_at,
        )


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
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
            select(McpGatewayBackend).order_by(McpGatewayBackend.slug)
        )
        return [BackendOut.from_model(b) for b in result.scalars().all()]


@admin_router.post("/backends", response_model=BackendOut, status_code=201)
async def create_backend(
    body: BackendCreate,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        backend = McpGatewayBackend(
            slug=body.slug,
            name=body.name,
            upstream_url=body.upstream_url.rstrip("/"),
            description=body.description,
            active=body.active,
            config=body.config,
        )
        pub_session.add(backend)
        await pub_session.commit()
        await pub_session.refresh(backend)
        return BackendOut.from_model(backend)


@admin_router.put("/backends/{backend_id}", response_model=BackendOut)
async def update_backend(
    backend_id: UUID,
    body: BackendUpdate,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
            select(McpGatewayBackend).where(McpGatewayBackend.id == backend_id)
        )
        backend = result.scalar_one_or_none()
        if not backend:
            raise HTTPException(404, "Backend not found")

        updates = body.model_dump(exclude_unset=True)
        config_changed = "config" in updates

        for field, value in updates.items():
            if field == "upstream_url" and value:
                value = value.rstrip("/")
            setattr(backend, field, value)

        await pub_session.commit()
        await pub_session.refresh(backend)

    # Invalidate cached native backend if config changed
    if config_changed:
        from app.mcp.mcp_native import invalidate_backend
        invalidate_backend(backend.slug)

    return BackendOut.from_model(backend)


@admin_router.delete("/backends/{backend_id}", status_code=204)
async def delete_backend(
    backend_id: UUID,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
            select(McpGatewayBackend).where(McpGatewayBackend.id == backend_id)
        )
        backend = result.scalar_one_or_none()
        if not backend:
            raise HTTPException(404, "Backend not found")
        slug = backend.slug
        await pub_session.delete(backend)
        await pub_session.commit()

    # Clean up cached native backend
    from app.mcp.mcp_native import invalidate_backend
    invalidate_backend(slug)


# ── Tokens CRUD ───────────────────────────────────────────────────────────────

@admin_router.get("/tokens", response_model=list[TokenOut])
async def list_tokens(
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
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

    # Use a dedicated public-schema session for MCP tables
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        token = McpGatewayToken(
            name=body.name,
            token_hash=_hash_token(raw_token),
            scopes=body.scopes,
            created_by=current_user.id,
            expires_at=expires_at,
        )
        pub_session.add(token)
        await pub_session.commit()
        await pub_session.refresh(token)

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
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
            select(McpGatewayToken).where(McpGatewayToken.id == token_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            raise HTTPException(404, "Token not found")
        token.revoked = True
        await pub_session.commit()
    return {"status": "revoked"}


@admin_router.delete("/tokens/{token_id}", status_code=204)
async def delete_token(
    token_id: UUID,
    _: None = require_permission("admin.system"),
    db: AsyncSession = Depends(get_db),
):
    async with async_session_factory() as pub_session:
        await pub_session.execute(text("SET search_path TO public"))
        result = await pub_session.execute(
            select(McpGatewayToken).where(McpGatewayToken.id == token_id)
        )
        token = result.scalar_one_or_none()
        if not token:
            raise HTTPException(404, "Token not found")
        await pub_session.delete(token)
        await pub_session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# Proxy router (MCP Bearer token auth — no JWT, no tenant middleware)
# ═══════════════════════════════════════════════════════════════════════════════

proxy_router = APIRouter(prefix="/mcp-gw", tags=["mcp-gateway-proxy"])


# ── OAuth2 endpoints (for Claude.ai and other MCP clients) ───────────────────

@proxy_router.get("/.well-known/oauth-authorization-server")
async def oauth_metadata(request: Request):
    """RFC 8414 — OAuth 2.0 Authorization Server Metadata.

    Claude.ai discovers this to learn how to authenticate with the MCP gateway.
    """
    base = str(request.base_url).rstrip("/")
    return JSONResponse({
        "issuer": base,
        "token_endpoint": f"{base}/mcp-gw/oauth/token",
        "registration_endpoint": f"{base}/mcp-gw/oauth/register",
        "response_types_supported": [],
        "grant_types_supported": ["client_credentials"],
        "token_endpoint_auth_methods_supported": ["client_secret_post"],
        "scopes_supported": ["mcp"],
    })


@proxy_router.post("/oauth/register")
async def oauth_register(request: Request):
    """Dynamic Client Registration (RFC 7591) — stub.

    MCP clients may call this before authenticating. We return the
    submitted client_id / client_secret unchanged (our tokens are
    pre-provisioned via the admin UI, not registered dynamically).
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    client_id = body.get("client_id", body.get("client_name", "mcp-client"))
    return JSONResponse({
        "client_id": client_id,
        "client_secret": "",
        "token_endpoint_auth_method": "client_secret_post",
    }, status_code=201)


@proxy_router.post("/oauth/token")
async def oauth_token(request: Request):
    """OAuth 2.0 Token Endpoint — client_credentials grant.

    Claude.ai sends client_id + client_secret (which is the MCP Bearer token
    created via the admin UI). We validate and return it as an access_token.
    """
    # Accept both form-encoded and JSON
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            data = await request.json()
        except Exception:
            data = {}
    else:
        form = await request.form()
        data = dict(form)

    grant_type = data.get("grant_type", "")
    client_secret = data.get("client_secret", "")

    if grant_type != "client_credentials":
        return JSONResponse(
            {"error": "unsupported_grant_type", "error_description": "Only client_credentials is supported"},
            status_code=400,
        )

    if not client_secret:
        return JSONResponse(
            {"error": "invalid_client", "error_description": "client_secret is required (use your MCP Bearer token)"},
            status_code=401,
        )

    # Validate the secret as a Bearer token
    token = await _verify_mcp_token(f"Bearer {client_secret}")
    if token is None:
        return JSONResponse(
            {"error": "invalid_client", "error_description": "Invalid token"},
            status_code=401,
        )

    return JSONResponse({
        "access_token": client_secret,
        "token_type": "bearer",
        "scope": "mcp",
    })


# ── Proxy route ──────────────────────────────────────────────────────────────

@proxy_router.api_route(
    "/{backend_slug}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
)
async def proxy_to_backend(backend_slug: str, path: str, request: Request):
    """Authenticate via MCP Bearer token, then proxy to the upstream backend."""

    # Skip OAuth well-known / token paths that matched the catch-all
    if backend_slug in (".well-known", "oauth"):
        return JSONResponse({"error": "Not found"}, status_code=404)

    # 1. Validate Bearer token
    auth_header = request.headers.get("authorization")
    token = await _verify_mcp_token(auth_header)
    if token is None:
        base = str(request.base_url).rstrip("/")
        return JSONResponse(
            {"error": "Unauthorized — invalid or missing Bearer token"},
            status_code=401,
            headers={
                "WWW-Authenticate": f'Bearer resource_metadata="{base}/mcp-gw/.well-known/oauth-authorization-server"',
            },
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
        await session.execute(text("SET search_path TO public"))
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

    # 4. Native backend — serve MCP protocol directly (no proxy)
    if backend.upstream_url.startswith("internal://"):
        from app.mcp.mcp_native import get_or_create_backend, handle_mcp_request
        try:
            native = await get_or_create_backend(backend.slug, backend.config or {})
        except Exception as exc:
            logger.error("Native backend '%s' init failed: %s", backend_slug, exc)
            return JSONResponse(
                {"error": f"Native backend '{backend_slug}' initialization failed: {str(exc)[:300]}"},
                status_code=503,
            )
        if native is None:
            return JSONResponse(
                {"error": f"Native backend '{backend_slug}' not configured"},
                status_code=500,
            )
        body = await request.body()
        return await handle_mcp_request(native, body)

    # 5. Build upstream request
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


# ── Root-level .well-known (some clients look here instead of /mcp-gw/) ──────

well_known_router = APIRouter(tags=["mcp-gateway-proxy"])


@well_known_router.get("/.well-known/oauth-authorization-server")
async def root_oauth_metadata(request: Request):
    """Root-level alias — redirects to /mcp-gw/.well-known/..."""
    return await oauth_metadata(request)


# Combined router for main.py registration
router = APIRouter()
router.include_router(admin_router)
router.include_router(proxy_router)
router.include_router(well_known_router)
