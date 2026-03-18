"""Redis async client for cache, pub/sub, OTP, rate limiting."""

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    """Initialize Redis connection (called at startup)."""
    global redis_client
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        max_connections=50,
    )
    await redis_client.ping()
    return redis_client


async def close_redis() -> None:
    """Close Redis connection (called at shutdown)."""
    global redis_client
    if redis_client:
        await redis_client.aclose()
        redis_client = None


def get_redis() -> aioredis.Redis:
    """Get the Redis client instance."""
    if redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return redis_client
