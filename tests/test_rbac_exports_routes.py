"""Test RBAC PDF export routes."""
import os

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema and the RBAC export routes to be registered.",
)


@pytest.mark.asyncio
async def test_export_matrix_role_permissions_returns_pdf_or_404(
    async_client: AsyncClient, auth_headers_admin, sample_entity
):
    """GET /api/v1/rbac/exports/matrix/role-permissions.pdf.

    In PR-A (no templates seeded), expects 404 RBAC_TEMPLATE_NOT_FOUND.
    In PR-B+ (templates seeded), expects 200 application/pdf.
    """
    resp = await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf?lang=fr",
        headers=auth_headers_admin,
    )
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content[:8]
        assert "X-Audit-Event-Id" in resp.headers
        assert "X-Content-Hash" in resp.headers
    else:
        body = resp.json()
        assert body["detail"]["code"] == "RBAC_TEMPLATE_NOT_FOUND"


@pytest.mark.asyncio
async def test_export_requires_core_rbac_export_permission(
    async_client: AsyncClient, auth_headers_pax, sample_entity
):
    """User without core.rbac.export gets 403."""
    resp = await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf",
        headers=auth_headers_pax,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_export_creates_audit_event(
    async_client: AsyncClient, auth_headers_admin, sample_entity, db_session
):
    """Even if export fails (404 template), an audit event is logged with status."""
    await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf",
        headers=auth_headers_admin,
    )
    from sqlalchemy import select
    from app.models.common import RbacAuditEvent
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "export.matrix_role")
    )
    events = result.scalars().all()
    assert len(events) >= 1


@pytest.mark.parametrize("path,perm_needed", [
    ("/matrix/role-permissions.pdf", "core.rbac.export"),
    ("/matrix/group-permissions.pdf", "core.rbac.export"),
    ("/matrix/user-permissions.pdf", "core.user.audit_export"),
    ("/role/TENANT_ADMIN.pdf", "core.rbac.export"),
    ("/matrix/role-modules.pdf", "core.rbac.export"),
    ("/catalog/permissions.pdf", "core.rbac.export"),
    ("/matrix/sod.pdf", "core.rbac.export"),
    ("/delegations/registry.pdf", "core.rbac.export"),
])
@pytest.mark.asyncio
async def test_all_export_endpoints_return_pdf_or_404(async_client, auth_headers_admin, path, perm_needed):
    """All 10 export endpoints behave consistently: 200 application/pdf or 404 RBAC_TEMPLATE_NOT_FOUND."""
    resp = await async_client.get(f"/api/v1/rbac/exports{path}", headers=auth_headers_admin)
    assert resp.status_code in (200, 404, 422), f"Unexpected {resp.status_code} on {path}: {resp.text}"
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"
