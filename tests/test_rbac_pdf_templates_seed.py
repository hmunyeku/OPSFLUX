"""Snapshot tests for RBAC PDF templates — verifies WeasyPrint renders cleanly."""
import hashlib
import os
import pytest
from pathlib import Path

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_B_TEMPLATES_SEEDED") != "1",
    reason="Requires migration 172 (PR-B templates seed) applied. "
           "Set RBAC_PR_B_TEMPLATES_SEEDED=1 after `alembic upgrade head`.",
)


@pytest.mark.asyncio
async def test_render_delegation_certificate_does_not_raise(db_session, sample_entity, sample_user, another_user):
    """The delegation_certificate template renders without WeasyPrint errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_delegation_service import _build_certificate_variables
    from app.models.common import UserDelegation
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="snapshot test",
    )
    db_session.add(delegation)
    await db_session.flush()

    cert_vars = await _build_certificate_variables(db_session, delegation, sample_user, another_user, sample_entity.id)

    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.delegation_certificate",
        entity_id=sample_entity.id,
        language="fr",
        variables=cert_vars,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000, f"PDF suspiciously small: {len(pdf_bytes)} bytes"


@pytest.mark.asyncio
async def test_render_matrix_role_permissions_does_not_raise(db_session, sample_entity, sample_user):
    """The matrix_role_permissions template renders without WeasyPrint errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_matrix_role_permissions_variables

    vars_dict = await build_matrix_role_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr", include_disabled=False
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.matrix_role_permissions",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 5000  # matrix is bigger than certificate


@pytest.mark.parametrize("slug,builder_path,extra_kwargs", [
    ("core.rbac.delegation_certificate", "rbac_delegation_certificate_fixture", {}),
    ("core.rbac.matrix_role_permissions", "build_matrix_role_permissions_variables", {"include_disabled": False}),
    ("core.rbac.matrix_group_permissions", "build_matrix_group_permissions_variables", {"include_disabled": False}),
    ("core.rbac.matrix_user_permissions", "build_matrix_user_permissions_variables", {}),
    ("core.rbac.role_detail", "build_role_detail_variables", {"role_code": "TENANT_ADMIN"}),
    ("core.rbac.role_modules", "build_role_modules_variables", {}),
    ("core.rbac.permission_catalog", "build_permission_catalog_variables", {"group_by": "module", "include_disabled": False}),
    ("core.rbac.sod_matrix", "build_sod_matrix_variables", {}),
    ("core.rbac.delegation_registry", "build_delegations_registry_variables", {}),
])
@pytest.mark.asyncio
async def test_render_bilingual_differs(
    db_session, sample_entity, sample_user, another_user,
    slug, builder_path, extra_kwargs,
):
    """FR and EN renders of every PDF template must produce different bytes (i18n proven).

    Catches regressions where hardcoded French (or English) text bypasses the _() translator.
    Templates that need specific data (e.g., delegation_certificate, group_detail, user_detail)
    are skipped via the conditional below — they have dedicated single-language tests above.
    """
    import hashlib
    from app.core.pdf_templates import render_pdf

    # Build the variables dict for this template
    if builder_path == "rbac_delegation_certificate_fixture":
        # Special case: delegation_certificate needs a UserDelegation to be created first
        from app.services.core.rbac_delegation_service import _build_certificate_variables
        from app.models.common import UserDelegation
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        delegation = UserDelegation(
            delegator_id=sample_user.id, delegate_id=another_user.id,
            entity_id=sample_entity.id, permissions=["asset.asset.read"],
            start_date=now, end_date=now + timedelta(days=7),
            active=True, reason="bilingual differential test",
        )
        db_session.add(delegation)
        await db_session.flush()
        vars_dict = await _build_certificate_variables(db_session, delegation, sample_user, another_user, sample_entity.id)
    else:
        # Generic case: call the builder
        from app.services.core import rbac_export_service
        builder = getattr(rbac_export_service, builder_path)
        vars_dict = await builder(db_session, sample_entity.id, sample_user, lang="fr", **extra_kwargs)

    pdf_fr = await render_pdf(db_session, slug=slug, entity_id=sample_entity.id, language="fr", variables=vars_dict)
    pdf_en = await render_pdf(db_session, slug=slug, entity_id=sample_entity.id, language="en", variables=vars_dict)
    assert pdf_fr is not None and pdf_fr[:4] == b"%PDF", f"FR render of {slug} failed"
    assert pdf_en is not None and pdf_en[:4] == b"%PDF", f"EN render of {slug} failed"
    fr_hash = hashlib.sha256(pdf_fr).hexdigest()
    en_hash = hashlib.sha256(pdf_en).hexdigest()
    assert fr_hash != en_hash, (
        f"{slug}: FR and EN renders are byte-identical. "
        f"Translator is not catching hardcoded strings in the template."
    )


# ─── Snapshot tests for the 9 remaining RBAC templates ─────────────────────
# Each test follows the same pattern: build variables via the matching
# builder in rbac_export_service, call render_pdf, verify the output starts
# with %PDF and is non-trivially sized.


@pytest.mark.asyncio
async def test_render_matrix_group_permissions(db_session, sample_entity, sample_user):
    """Snapshot test for matrix_group_permissions — renders without errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_matrix_group_permissions_variables

    vars_dict = await build_matrix_group_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr", include_disabled=False
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.matrix_group_permissions",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_matrix_user_permissions(db_session, sample_entity, sample_user):
    """Snapshot test for matrix_user_permissions — renders without errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_matrix_user_permissions_variables

    vars_dict = await build_matrix_user_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.matrix_user_permissions",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_role_detail(db_session, sample_entity, sample_user):
    """Snapshot test for role_detail — uses TENANT_ADMIN role from migration 171."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_role_detail_variables

    vars_dict = await build_role_detail_variables(
        db_session, sample_entity.id, sample_user, role_code="TENANT_ADMIN", lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.role_detail",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_group_detail(db_session, sample_entity, sample_user, sample_group):
    """Snapshot test for group_detail — requires a sample group fixture."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_group_detail_variables

    vars_dict = await build_group_detail_variables(
        db_session, sample_entity.id, sample_user, group_id=sample_group.id, lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.group_detail",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_user_detail(db_session, sample_entity, sample_user):
    """Snapshot test for user_detail — renders for sample_user with delegations."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_user_detail_variables

    vars_dict = await build_user_detail_variables(
        db_session, sample_entity.id, sample_user,
        target_user_id=sample_user.id, lang="fr", include_delegations=True,
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.user_detail",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_role_modules(db_session, sample_entity, sample_user):
    """Snapshot test for role_modules — Roles × Modules summary view."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_role_modules_variables

    vars_dict = await build_role_modules_variables(
        db_session, sample_entity.id, sample_user, lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.role_modules",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_permission_catalog(db_session, sample_entity, sample_user):
    """Snapshot test for permission_catalog — grouped by module."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_permission_catalog_variables

    vars_dict = await build_permission_catalog_variables(
        db_session, sample_entity.id, sample_user, lang="fr",
        group_by="module", include_disabled=False,
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.permission_catalog",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_sod_matrix(db_session, sample_entity, sample_user):
    """Snapshot test for sod_matrix — Segregation of Duties matrix."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_sod_matrix_variables

    vars_dict = await build_sod_matrix_variables(
        db_session, sample_entity.id, sample_user, lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.sod_matrix",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000


@pytest.mark.asyncio
async def test_render_delegation_registry(db_session, sample_entity, sample_user):
    """Snapshot test for delegation_registry — list of delegations in the tenant."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_delegations_registry_variables

    vars_dict = await build_delegations_registry_variables(
        db_session, sample_entity.id, sample_user, lang="fr"
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.delegation_registry",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000
