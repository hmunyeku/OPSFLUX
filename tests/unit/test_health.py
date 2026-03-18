"""Test health check endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "1.0.0"


@pytest.mark.asyncio
async def test_docs_available_in_dev(client: AsyncClient):
    response = await client.get("/api/docs")
    assert response.status_code == 200
