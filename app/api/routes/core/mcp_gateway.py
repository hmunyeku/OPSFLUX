"""MCP Gateway — admin CRUD + authenticated reverse proxy for remote MCP servers.

Admin routes (JWT auth, admin.system permission):
    GET/POST/PUT/DELETE  /api/v1/mcp-gateway/backends
    GET/POST/DELETE      /api/v1/mcp-gateway/tokens

Proxy routes (MCP Bearer token auth, no tenant/entity middleware):
    ANY  /mcp-gw/{backend_slug}/{path:path}
"""

import base64
import hashlib
import logging
import secrets
from dataclasses import dataclass, field as dc_field
from datetime import UTC, datetime, timedelta
from time import time as _now
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
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


# ── OAuth2 Authorization Code + PKCE (for Claude.ai) ─────────────────────────
#
# Flow:
# 1. Claude.ai redirects browser → GET /mcp-gw/oauth/authorize?...
# 2. User sees a form, pastes their MCP Bearer token, clicks Authorize
# 3. POST /mcp-gw/oauth/authorize validates token, generates auth code,
#    redirects to claude.ai callback with ?code=XXX&state=YYY
# 4. Claude.ai exchanges code → POST /mcp-gw/oauth/token (authorization_code)
# 5. Token endpoint verifies PKCE, returns access_token
#
# Auth codes are stored in-memory with 120s TTL.

@dataclass
class _AuthCode:
    bearer_token: str
    code_challenge: str
    code_challenge_method: str
    redirect_uri: str
    client_id: str
    created_at: float = dc_field(default_factory=_now)

_auth_codes: dict[str, _AuthCode] = {}
_AUTH_CODE_TTL = 120  # seconds


def _cleanup_codes():
    now = _now()
    expired = [k for k, v in _auth_codes.items() if now - v.created_at > _AUTH_CODE_TTL]
    for k in expired:
        del _auth_codes[k]


def _verify_pkce(verifier: str, challenge: str, method: str) -> bool:
    if method == "S256":
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return secrets.compare_digest(expected, challenge)
    if method == "plain":
        return secrets.compare_digest(verifier, challenge)
    return False


def _get_base_url(request: Request) -> str:
    """Return the public-facing base URL (handles reverse proxy)."""
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    return f"{proto}://{host}"


@proxy_router.get("/.well-known/oauth-authorization-server")
async def oauth_metadata(request: Request):
    """RFC 8414 — OAuth 2.0 Authorization Server Metadata."""
    base = _get_base_url(request)
    return JSONResponse({
        "issuer": base,
        "authorization_endpoint": f"{base}/authorize",
        "token_endpoint": f"{base}/mcp-gw/oauth/token",
        "registration_endpoint": f"{base}/mcp-gw/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["mcp"],
    })


@proxy_router.post("/oauth/register")
async def oauth_register(request: Request):
    """Dynamic Client Registration (RFC 7591) — stub."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    client_id = body.get("client_id", body.get("client_name", "mcp-client"))
    return JSONResponse({
        "client_id": client_id,
        "client_secret": "",
        "token_endpoint_auth_method": "none",
    }, status_code=201)


from string import Template as _T

_AUTHORIZE_HTML = _T("""\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpsFlux MCP — Autorisation</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       background:#0f172a;color:#e2e8f0;display:flex;align-items:center;
       justify-content:center;min-height:100vh;padding:1rem}
  .card{background:#1e293b;border-radius:12px;padding:2rem;max-width:420px;
        width:100%;box-shadow:0 25px 50px rgba(0,0,0,.5)}
  h1{font-size:1.25rem;margin-bottom:.25rem}
  .sub{color:#94a3b8;font-size:.85rem;margin-bottom:1.5rem}
  label{display:block;font-size:.8rem;font-weight:600;margin-bottom:.5rem;color:#cbd5e1}
  input[type=password]{width:100%;padding:.65rem .75rem;border-radius:8px;border:1px solid #334155;
        background:#0f172a;color:#f1f5f9;font-family:monospace;font-size:.85rem}
  input:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.3)}
  .hint{color:#64748b;font-size:.75rem;margin-top:.35rem}
  .actions{display:flex;gap:.75rem;margin-top:1.5rem}
  button{flex:1;padding:.65rem;border-radius:8px;font-size:.9rem;font-weight:600;
         border:none;cursor:pointer;transition:all .15s}
  .btn-primary{background:#3b82f6;color:#fff}
  .btn-primary:hover{background:#2563eb}
  .error{background:#450a0a;border:1px solid #991b1b;color:#fca5a5;
         padding:.6rem .75rem;border-radius:8px;font-size:.8rem;margin-bottom:1rem}
  .app{color:#60a5fa;font-weight:600}
</style>
</head>
<body>
<div class="card">
  <h1>OpsFlux MCP Gateway</h1>
  <p class="sub">
    <span class="app">$client_id</span> demande l'acc&egrave;s aux outils MCP.
  </p>
  $error
  <form method="POST" action="$form_action">
    <input type="hidden" name="response_type" value="$response_type">
    <input type="hidden" name="client_id" value="$client_id">
    <input type="hidden" name="redirect_uri" value="$redirect_uri">
    <input type="hidden" name="code_challenge" value="$code_challenge">
    <input type="hidden" name="code_challenge_method" value="$code_challenge_method">
    <input type="hidden" name="state" value="$state">
    <input type="hidden" name="scope" value="$scope">
    <label for="token">Token MCP Bearer</label>
    <input type="password" id="token" name="token" placeholder="Collez votre token MCP ici"
           autofocus required>
    <p class="hint">Cr&eacute;ez un token dans OpsFlux &gt; Param&egrave;tres &gt; MCP Gateway</p>
    <div class="actions">
      <button type="submit" class="btn-primary">Autoriser</button>
    </div>
  </form>
</div>
</body>
</html>""")


def _render_authorize(request: Request, error: str = "", **overrides) -> str:
    params = request.query_params
    base = _get_base_url(request)
    vals = {
        "client_id": params.get("client_id", "MCP Client"),
        "response_type": params.get("response_type", "code"),
        "redirect_uri": params.get("redirect_uri", ""),
        "code_challenge": params.get("code_challenge", ""),
        "code_challenge_method": params.get("code_challenge_method", "S256"),
        "state": params.get("state", ""),
        "scope": params.get("scope", ""),
        "form_action": f"{base}/mcp-gw/oauth/authorize",
        "error": error,
    }
    vals.update(overrides)
    return _AUTHORIZE_HTML.safe_substitute(vals)


@proxy_router.get("/oauth/authorize")
async def oauth_authorize_form(request: Request):
    """Show authorization form — user pastes their MCP Bearer token."""
    return HTMLResponse(_render_authorize(request))


@proxy_router.post("/oauth/authorize")
async def oauth_authorize_submit(request: Request):
    """Validate token, generate auth code, redirect to callback."""
    form = await request.form()
    raw_token = str(form.get("token", "")).strip()
    redirect_uri = str(form.get("redirect_uri", ""))
    state = str(form.get("state", ""))
    code_challenge = str(form.get("code_challenge", ""))
    code_challenge_method = str(form.get("code_challenge_method", "S256"))
    client_id = str(form.get("client_id", ""))

    # Validate the token
    verified = await _verify_mcp_token(f"Bearer {raw_token}")
    if verified is None:
        html = _render_authorize(
            request,
            error='<div class="error">Token invalide. Vérifiez votre token MCP et réessayez.</div>',
            client_id=client_id or "MCP Client",
            redirect_uri=redirect_uri,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            state=state,
        )
        return HTMLResponse(html, status_code=400)

    if not redirect_uri:
        return HTMLResponse('<p>Erreur: redirect_uri manquant</p>', status_code=400)

    # Generate auth code
    _cleanup_codes()
    code = secrets.token_urlsafe(48)
    _auth_codes[code] = _AuthCode(
        bearer_token=raw_token,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        redirect_uri=redirect_uri,
        client_id=client_id,
    )

    # Redirect back to Claude.ai with the code
    sep = "&" if "?" in redirect_uri else "?"
    callback = f"{redirect_uri}{sep}code={code}"
    if state:
        callback += f"&state={state}"
    return RedirectResponse(callback, status_code=302)


@proxy_router.post("/oauth/token")
async def oauth_token(request: Request):
    """OAuth 2.0 Token Endpoint — authorization_code + PKCE."""
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

    # ── Authorization Code exchange ──
    if grant_type == "authorization_code":
        code = data.get("code", "")
        code_verifier = data.get("code_verifier", "")

        _cleanup_codes()
        auth = _auth_codes.pop(code, None)
        if auth is None:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": "Invalid or expired authorization code"},
                status_code=400,
            )

        # Verify PKCE
        if auth.code_challenge and not _verify_pkce(code_verifier, auth.code_challenge, auth.code_challenge_method):
            return JSONResponse(
                {"error": "invalid_grant", "error_description": "PKCE verification failed"},
                status_code=400,
            )

        return JSONResponse({
            "access_token": auth.bearer_token,
            "token_type": "bearer",
            "scope": "mcp",
        })

    # ── Client Credentials (fallback) ──
    if grant_type == "client_credentials":
        client_secret = data.get("client_secret", "")
        if not client_secret:
            return JSONResponse(
                {"error": "invalid_client", "error_description": "client_secret required"},
                status_code=401,
            )
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

    return JSONResponse(
        {"error": "unsupported_grant_type"},
        status_code=400,
    )


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


# ── Root-level OAuth endpoints (Claude.ai uses {issuer}/authorize) ────────────

root_oauth_router = APIRouter(tags=["mcp-gateway-proxy"])


@root_oauth_router.get("/.well-known/oauth-authorization-server")
async def root_oauth_metadata(request: Request):
    return await oauth_metadata(request)


@root_oauth_router.get("/authorize")
async def root_authorize_form(request: Request):
    return await oauth_authorize_form(request)


@root_oauth_router.post("/authorize")
async def root_authorize_submit(request: Request):
    return await oauth_authorize_submit(request)


# Combined router for main.py registration
router = APIRouter()
router.include_router(admin_router)
router.include_router(proxy_router)
router.include_router(root_oauth_router)
