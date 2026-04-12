"""IP geolocation service — resolves IP addresses to approximate locations.

Uses ip-api.com free tier (non-commercial, 45 req/min).
Results are cached in-memory for 1 hour.
"""

from datetime import UTC, datetime

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
        if (datetime.now(UTC) - ts).total_seconds() < _CACHE_TTL:
            return data

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,lat,lon,isp,org"
            )
            if resp.status_code == 200:
                data = resp.json()
                _cache[ip] = (data, datetime.now(UTC))
                return data
    except Exception:
        pass

    return None
