from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.middleware.tenant import TenantSchemaMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(TenantSchemaMiddleware)

    @app.get("/mcp")
    async def mcp_probe(request: Request):
        return {"tenant_schema": getattr(request.state, "tenant_schema", None)}

    return app


def test_mcp_route_uses_x_tenant_header_when_present():
    client = TestClient(_make_app())
    response = client.get("/mcp", headers={"X-Tenant": "perenco"})
    assert response.status_code == 200
    assert response.json()["tenant_schema"] == "perenco"


def test_mcp_route_defaults_to_public_without_tenant_hint():
    client = TestClient(_make_app())
    response = client.get("/mcp")
    assert response.status_code == 200
    assert response.json()["tenant_schema"] == "public"
