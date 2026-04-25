"""Test health check endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["version"] == "1.0.0"
    assert data["database"] in ("ok", "error")
    assert data["redis"] in ("ok", "error")


@pytest.mark.asyncio
async def test_docs_available_in_dev(client: AsyncClient):
    response = await client.get("/api/docs")
    assert response.status_code == 200
