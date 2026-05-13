"""RBAC delegation service — create/modify/revoke with ISO 27001 guardrails."""
import hashlib
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_templates import render_and_send_email
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.core.rbac import (
    get_user_permissions_with_sources,
    invalidate_rbac_cache,
)
from app.models.common import (
    RbacAuditEvent,
    Setting,
    User,
    UserDelegation,
)
from app.schemas.rbac_delegation import DelegationCreate


async def _get_tenant_setting(db: AsyncSession, entity_id: UUID, key: str, default):
    """Read a tenant-scoped setting, fallback to default."""
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    if isinstance(row, dict) and "value" in row:
        return row["value"]
    return row


async def validate_delegation_constraints(
    db: AsyncSession,
    body: DelegationCreate,
    delegator: User,
    entity_id: UUID,
) -> None:
    """Raise StructuredHTTPException if any ISO guardrail fails."""
    # 1. Duration check
    max_days = await _get_tenant_setting(db, entity_id, "rbac.delegation.max_duration_days", 365)
    duration_days = (body.end_date - body.start_date).days
    if duration_days > max_days:
        raise StructuredHTTPException(
            400,
            code="RBAC_DELEGATION_DURATION_EXCEEDED",
            message=f"Duration {duration_days}d exceeds max {max_days}d allowed",
        )
    if body.end_date <= body.start_date:
        raise StructuredHTTPException(
            400,
            code="RBAC_DELEGATION_INVALID_PERIOD",
            message="end_date must be strictly after start_date",
        )

    # 2. Effective permissions check (must have the perms NOT via delegation only)
    sources = await get_user_permissions_with_sources(delegator.id, entity_id, db)
    delegator_owned = {code for code, source in sources.items() if source != "delegation"}

    # Distinguish: not having vs having only via delegation
    all_perms = set(sources.keys())
    not_having = set(body.permissions) - all_perms
    via_delegation_only = (set(body.permissions) - delegator_owned) - not_having

    if not_having:
        raise StructuredHTTPException(
            403,
            code="RBAC_DELEGATION_INSUFFICIENT_PERMS",
            message=f"Delegator does not have these permissions: {sorted(not_having)}",
        )
    if via_delegation_only:
        raise StructuredHTTPException(
            403,
            code="RBAC_DELEGATION_SUB_DELEGATION_DENIED",
            message=f"Cannot sub-delegate permissions received via delegation: {sorted(via_delegation_only)}",
        )


async def _build_certificate_variables(
    db: AsyncSession,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
    entity_id: UUID,
) -> dict:
    """Variables for rendering the delegation certificate PDF and emails."""
    from app.models.common import Entity, Permission

    entity = await db.get(Entity, entity_id)

    # Fetch permission details
    perms_result = await db.execute(
        select(Permission).where(Permission.code.in_(delegation.permissions))
    )
    permissions_full = [
        {"code": p.code, "name": p.name, "module": p.module}
        for p in perms_result.scalars().all()
    ]

    duration_days = (delegation.end_date - delegation.start_date).days

    return {
        "delegation": {
            "id": str(delegation.id),
            "permissions": delegation.permissions,
            "permissions_full": permissions_full,
            "start_date": delegation.start_date.isoformat(),
            "end_date": delegation.end_date.isoformat(),
            "reason": delegation.reason,
        },
        "delegator": {
            "id": str(delegator.id),
            "full_name": delegator.full_name,
            "email": delegator.email,
            "roles_at_date": [],  # filled by route layer if available
        },
        "delegate": {
            "id": str(delegate.id),
            "full_name": delegate.full_name,
            "email": delegate.email,
        },
        "tenant": {
            "id": str(entity.id) if entity else "",
            "name": entity.name if entity else "",
            "logo_url": entity.logo_url if entity else None,
        },
        "delegation_duration_days": duration_days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "iso_clause": "ISO 27001 §A.9.2.5 — Revue des droits d'accès des utilisateurs",
        "audit_event_id": "",
        "content_hash": "",
    }


async def _notify_security_officers(
    db: AsyncSession,
    entity_id: UUID,
    cert_vars: dict,
    attachments: list,
) -> None:
    """Send the granted email to each SECURITY_OFFICER in the tenant."""
    from app.models.common import UserGroup, UserGroupMember, UserGroupRole

    so_users_stmt = (
        select(User.email, User.language)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .join(UserGroupRole, UserGroupRole.group_id == UserGroup.id)
        .where(
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,  # noqa: E712
            UserGroupRole.role_code == "SECURITY_OFFICER",
        )
        .distinct()
    )
    result = await db.execute(so_users_stmt)
    for email, lang in result.all():
        await render_and_send_email(
            db,
            slug="rbac.delegation.granted",
            entity_id=entity_id,
            language=lang or "fr",
            to=email,
            variables=cert_vars,
            attachments=attachments,
        )


async def create_delegation(
    db: AsyncSession,
    body: DelegationCreate,
    delegator: User,
    entity_id: UUID,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> UserDelegation:
    """Create a delegation with all ISO guardrails, emails, PDF and audit trail."""
    await validate_delegation_constraints(db, body, delegator, entity_id)

    # Fetch delegate
    delegate = await db.get(User, body.delegate_id)
    if not delegate:
        raise StructuredHTTPException(404, code="USER_NOT_FOUND", message="Delegate not found")

    # 1. Persist delegation
    delegation = UserDelegation(
        delegator_id=delegator.id,
        delegate_id=body.delegate_id,
        entity_id=entity_id,
        permissions=body.permissions,
        start_date=body.start_date,
        end_date=body.end_date,
        active=True,
        reason=body.reason,
    )
    db.add(delegation)
    await db.flush()

    # 2. Build PDF certificate variables
    cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, entity_id)

    # 3. Render certificate PDF (may return None if template not seeded yet — PR-B)
    cert_pdf = await render_pdf(
        db,
        slug="core.rbac.delegation_certificate",
        entity_id=entity_id,
        language=delegate.language or "fr",
        variables=cert_vars,
    )
    cert_hash = hashlib.sha256(cert_pdf).hexdigest() if cert_pdf else None

    # 4. Audit event
    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type="delegation.created",
        target=str(delegation.id),
        params={
            "delegator_id": str(delegator.id),
            "delegate_id": str(body.delegate_id),
            "permissions_count": len(body.permissions),
            "duration_days": (body.end_date - body.start_date).days,
        },
        result_summary={"permissions": body.permissions, "reason": body.reason},
        file_hash_sha256=cert_hash,
        actor_user_id=delegator.id,
        client_ip=client_ip,
        user_agent=user_agent,
        status="success",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(delegation)

    # 5. Send emails (granted + received), with cert PDF attached if available
    attachments = [("certificate.pdf", cert_pdf)] if cert_pdf else []

    await render_and_send_email(
        db,
        slug="rbac.delegation.granted",
        entity_id=entity_id,
        language=delegator.language or "fr",
        to=delegator.email,
        variables=cert_vars,
        attachments=attachments,
    )
    await render_and_send_email(
        db,
        slug="rbac.delegation.received",
        entity_id=entity_id,
        language=delegate.language or "fr",
        to=delegate.email,
        variables=cert_vars,
        attachments=attachments,
    )

    # 6. Optionally CC SECURITY_OFFICERs
    notify_so = await _get_tenant_setting(db, entity_id, "rbac.delegation.notify_security_officer", True)
    if notify_so:
        await _notify_security_officers(db, entity_id, cert_vars, attachments)

    # 7. Invalidate delegate's cache
    await invalidate_rbac_cache(body.delegate_id)

    return delegation
