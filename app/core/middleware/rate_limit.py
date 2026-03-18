"""RateLimitMiddleware — Redis-based sliding window rate limiting."""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.redis_client import get_redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Global rate limiting: configurable per-IP requests per window."""

    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    # Paths exempt from rate limiting
    EXEMPT_PATHS = {"/api/health", "/api/docs", "/api/redoc"}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        redis = get_redis()
        key = f"ratelimit:{client_ip}"

        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, self.window_seconds)

        if current > self.max_requests:
            ttl = await redis.ttl(key)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(ttl)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(max(0, self.max_requests - current))
        return response
