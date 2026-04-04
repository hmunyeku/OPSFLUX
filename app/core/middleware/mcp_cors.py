"""Permissive CORS for MCP gateway paths.

Claude.ai (and other remote MCP clients) need unrestricted CORS on the MCP
gateway endpoints.  The main CORSMiddleware only allows app-specific origins,
so this middleware intercepts MCP-related paths first and adds open CORS
headers — including the ``Mcp-Session-Id`` header used by Streamable HTTP.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_MCP_PREFIXES = ("/mcp-gw/", "/.well-known/oauth", "/authorize", "/oauth/")

_ALLOW_HEADERS = "Authorization, Content-Type, Accept, Mcp-Session-Id"
_ALLOW_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
_EXPOSE_HEADERS = "Mcp-Session-Id"


class McpCorsMiddleware(BaseHTTPMiddleware):
    """Return permissive CORS headers for MCP gateway paths."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if not any(path.startswith(p) for p in _MCP_PREFIXES):
            return await call_next(request)

        origin = request.headers.get("origin", "*")

        # Preflight — answer immediately so the main CORSMiddleware never
        # rejects the request with 400.
        if request.method == "OPTIONS":
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": _ALLOW_METHODS,
                    "Access-Control-Allow-Headers": _ALLOW_HEADERS,
                    "Access-Control-Max-Age": "86400",
                },
            )

        # Normal request — forward, then stamp CORS headers on the response.
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = _ALLOW_HEADERS
        response.headers["Access-Control-Expose-Headers"] = _EXPOSE_HEADERS
        return response
