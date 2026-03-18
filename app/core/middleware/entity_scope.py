"""EntityScopeMiddleware — inject entity_id from X-Entity-ID header."""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class EntityScopeMiddleware(BaseHTTPMiddleware):
    """Extracts X-Entity-ID header and stores it on request.state."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        entity_id = request.headers.get("X-Entity-ID")
        request.state.entity_id = entity_id
        return await call_next(request)
