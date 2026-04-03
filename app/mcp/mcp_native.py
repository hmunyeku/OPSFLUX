"""MCP Streamable HTTP protocol handler for native (internal) backends.

Handles JSON-RPC 2.0 requests per the MCP protocol specification:
- initialize → server capabilities
- notifications/* → 202 acknowledgment
- tools/list → available tools
- tools/call → execute a tool and return result

Native backends are registered by slug and lazily initialized from
the McpGatewayBackend.config column on first request.
"""

import json
import logging
from typing import Any, Callable, Awaitable

from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class NativeBackend:
    """A native MCP backend serving tools without external proxy."""

    def __init__(
        self,
        name: str,
        version: str,
        tools_list: list[dict[str, Any]],
        call_tool: Callable[[str, dict], Awaitable[dict]],
        close_fn: Callable[[], Awaitable[None]] | None = None,
    ):
        self.name = name
        self.version = version
        self.tools_list = tools_list
        self.call_tool = call_tool
        self._close_fn = close_fn

    async def close(self):
        if self._close_fn:
            await self._close_fn()


# ═══════════════════════════════════════════════════════════════════════════════
# Registry
# ═══════════════════════════════════════════════════════════════════════════════

# Factory functions that create a NativeBackend from config: async (dict) -> NativeBackend
_initializers: dict[str, Callable[[dict], Awaitable[NativeBackend]]] = {}

# Cached live backends by slug
_backends: dict[str, NativeBackend] = {}


def register_native_initializer(
    slug: str,
    initializer: Callable[[dict], Awaitable[NativeBackend]],
) -> None:
    """Register a factory that creates a NativeBackend from backend config."""
    _initializers[slug] = initializer
    logger.info("MCP native: registered initializer for '%s'", slug)


async def get_or_create_backend(slug: str, config: dict) -> NativeBackend | None:
    """Get a cached backend or create one from config using the registered initializer."""
    if slug in _backends:
        return _backends[slug]

    initializer = _initializers.get(slug)
    if initializer is None:
        return None

    logger.info("MCP native: initializing backend '%s'", slug)
    backend = await initializer(config)
    _backends[slug] = backend
    logger.info("MCP native: backend '%s' ready (%d tools)", slug, len(backend.tools_list))
    return backend


def invalidate_backend(slug: str) -> None:
    """Remove a cached backend (e.g. after config update)."""
    removed = _backends.pop(slug, None)
    if removed:
        logger.info("MCP native: invalidated cached backend '%s'", slug)


async def close_all_backends() -> None:
    """Close all cached native backends (called at shutdown)."""
    for slug, backend in _backends.items():
        try:
            await backend.close()
        except Exception:
            logger.exception("MCP native: error closing backend '%s'", slug)
    _backends.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# MCP Streamable HTTP protocol handler
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_mcp_request(backend: NativeBackend, body: bytes) -> JSONResponse:
    """Handle a single MCP Streamable HTTP request (JSON-RPC 2.0).

    Returns a JSONResponse with Content-Type: application/json.
    """
    # Parse JSON-RPC request
    try:
        rpc = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _jsonrpc_error(None, -32700, "Parse error")

    method = rpc.get("method", "")
    req_id = rpc.get("id")  # None for notifications
    params = rpc.get("params", {})

    # ── initialize ──────────────────────────────────────────────────────
    if method == "initialize":
        return _jsonrpc_ok(req_id, {
            "protocolVersion": "2025-03-26",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": backend.name, "version": backend.version},
        })

    # ── notifications (no id → no response body needed) ────────────────
    if req_id is None:
        return JSONResponse(content=None, status_code=202)

    # ── tools/list ─────────────────────────────────────────────────────
    if method == "tools/list":
        return _jsonrpc_ok(req_id, {"tools": backend.tools_list})

    # ── tools/call ─────────────────────────────────────────────────────
    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})

        try:
            result = await backend.call_tool(tool_name, arguments)
            return _jsonrpc_ok(req_id, result)
        except ValueError as exc:
            # Validation error → return as tool error (not protocol error)
            return _jsonrpc_ok(req_id, {
                "content": [{"type": "text", "text": str(exc)}],
                "isError": True,
            })
        except Exception as exc:
            logger.exception("MCP native: error in tool '%s'", tool_name)
            return _jsonrpc_ok(req_id, {
                "content": [{"type": "text", "text": f"Erreur interne: {str(exc)[:500]}"}],
                "isError": True,
            })

    # ── ping ───────────────────────────────────────────────────────────
    if method == "ping":
        return _jsonrpc_ok(req_id, {})

    # ── Unknown method ─────────────────────────────────────────────────
    return _jsonrpc_error(req_id, -32601, f"Method not found: {method}")


def _jsonrpc_ok(req_id: Any, result: Any) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})


def _jsonrpc_error(req_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})
