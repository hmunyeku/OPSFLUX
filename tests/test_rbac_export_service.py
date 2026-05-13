"""Test the export variable builders for RBAC PDF templates."""
import os
import pytest

from app.services.core.rbac_export_service import (
    build_matrix_role_permissions_variables,
    build_role_detail_variables,
    build_permission_catalog_variables,
)

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema (roles + permissions seeded).",
)


@pytest.mark.asyncio
async def test_build_matrix_role_permissions_variables(db_session, sample_entity, sample_user):
    """Builder returns roles[], permissions[], grants{}, modules[]."""
    vars = await build_matrix_role_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr", include_disabled=False
    )
    assert "roles" in vars
    assert "permissions" in vars
    assert "grants" in vars
    assert "modules" in vars
    assert "tenant" in vars
    assert "generated_at" in vars
    assert "generated_by" in vars
    assert isinstance(vars["roles"], list)
    assert isinstance(vars["permissions"], list)


@pytest.mark.asyncio
async def test_build_role_detail_variables(db_session, sample_entity, sample_user):
    """Builder for a single role returns role + permissions_by_module + groups_using_role + users_via_groups."""
    vars = await build_role_detail_variables(
        db_session, sample_entity.id, sample_user, role_code="TENANT_ADMIN", lang="fr"
    )
    assert vars["role"]["code"] == "TENANT_ADMIN"
    assert "permissions_by_module" in vars
    assert "groups_using_role" in vars


@pytest.mark.asyncio
async def test_build_permission_catalog_variables(db_session, sample_entity, sample_user):
    """Builder returns permissions grouped by module."""
    vars = await build_permission_catalog_variables(
        db_session, sample_entity.id, sample_user, lang="fr", group_by="module", include_disabled=False
    )
    assert "permissions_by_module" in vars
    assert "tenant" in vars
