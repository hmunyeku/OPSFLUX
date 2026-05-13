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


@pytest.mark.asyncio
async def test_render_both_languages(db_session, sample_entity, sample_user, another_user):
    """Both FR and EN versions render successfully (translations resolved)."""
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
        start_date=now,
        end_date=now + timedelta(days=7),
        active=True,
        reason="bilingual test",
    )
    db_session.add(delegation)
    await db_session.flush()
    cert_vars = await _build_certificate_variables(db_session, delegation, sample_user, another_user, sample_entity.id)

    pdf_fr = await render_pdf(db_session, slug="core.rbac.delegation_certificate", entity_id=sample_entity.id, language="fr", variables=cert_vars)
    pdf_en = await render_pdf(db_session, slug="core.rbac.delegation_certificate", entity_id=sample_entity.id, language="en", variables=cert_vars)
    assert pdf_fr is not None and pdf_fr[:4] == b"%PDF"
    assert pdf_en is not None and pdf_en[:4] == b"%PDF"
    # The two PDFs should differ in size due to different translation strings
    # (won't be radically different but should not be byte-identical)
    fr_hash = hashlib.sha256(pdf_fr).hexdigest()
    en_hash = hashlib.sha256(pdf_en).hexdigest()
    assert fr_hash != en_hash, "FR and EN renders are identical — i18n may not be working"
