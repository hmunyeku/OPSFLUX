"""Reject requests whose body exceeds a configured maximum.

Prevents memory-exhaustion DoS and response-amplification attacks
(the 422 handler echoes back the body — a 10 MB upload becomes a
20 MB response). Sits above the route handler so FastAPI never
parses the oversized payload.

Multipart uploads (``Content-Type: multipart/form-data``) are
exempted — they have their own per-file limit in the attachment
endpoint and legitimately carry large payloads.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject any non-multipart request body > ``max_bytes``."""

    def __init__(self, app, max_bytes: int = 2 * 1024 * 1024) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Let multipart through — file uploads already size-gated at route.
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/"):
            return await call_next(request)

        # Check the advertised Content-Length first (cheap).
        cl_raw = request.headers.get("content-length")
        if cl_raw:
            try:
                cl = int(cl_raw)
            except ValueError:
                cl = 0
            if cl > self.max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": (
                            f"Payload too large (max {self.max_bytes // 1024} KB)"
                        )
                    },
                )

        return await call_next(request)
