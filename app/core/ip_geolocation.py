"""IP geolocation service — resolves IP addresses to approximate locations.

Uses ip-api.com free tier (non-commercial, 45 req/min).
Results are cached in-memory for 1 hour.
"""

import asyncio
from functools import lru_cache
from datetime import datetime, timezone

import httpx

_cache: dict[str, tuple[dict, datetime]] = {}
_CACHE_TTL = 3600  # 1 hour


async def get_ip_location(ip: str) -> dict | None:
    """Return location dict for an IP, or None if unavailable."""
    if ip in ("127.0.0.1", "::1", "0.0.0.0"):
        return {"status": "private", "message": "Private/localhost IP"}

    # Check cache
    if ip in _cache:
        data, ts = _cache[ip]
        if (datetime.now(timezone.utc) - ts).total_seconds() < _CACHE_TTL:
            return data

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,lat,lon,isp,org")
            if resp.status_code == 200:
                data = resp.json()
                _cache[ip] = (data, datetime.now(timezone.utc))
                return data
    except Exception:
        pass

    return None
