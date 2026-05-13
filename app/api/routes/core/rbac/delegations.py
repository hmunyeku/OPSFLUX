"""RBAC delegations routes — CRUD + revoke + certificate.

Permissions:
- core.delegation.read : list/view in tenant
- core.delegation.create : create on own perms
- core.delegation.manage : modify any
- core.delegation.revoke : revoke any
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
import io
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.models.common import User, UserDelegation
from app.schemas.rbac_delegation import (
    DelegationCreate,
    DelegationListItem,
    DelegationRead,
    DelegationRevoke,
    DelegationUpdate,
)
from app.services.core.rbac_delegation_service import (
    create_delegation,
    revoke_delegation,
)

router = APIRouter(prefix="/api/v1/rbac/delegations", tags=["rbac-delegation"])


def _build_status(d: UserDelegation) -> str:
    now = datetime.now(timezone.utc)
    if not d.active:
        return "revoked"
    if d.start_date > now:
        return "programmed"
    if d.end_date <= now:
        return "expired"
    return "active"


def _to_read(d: UserDelegation, delegator: User | None = None, delegate: User | None = None) -> DelegationRead:
    return DelegationRead(
        id=d.id,
        delegator_id=d.delegator_id,
        delegate_id=d.delegate_id,
        entity_id=d.entity_id,
        permissions=d.permissions,
        start_date=d.start_date,
        end_date=d.end_date,
        active=d.active,
        reason=d.reason,
        created_at=d.created_at,
        delegator_name=delegator.full_name if delegator else None,
        delegate_name=delegate.full_name if delegate else None,
        status=_build_status(d),
        duration_days=(d.end_date - d.start_date).days,
    )


@router.post("/", response_model=DelegationRead, status_code=201)
async def create_route(
    request: Request,
    body: DelegationCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.delegation.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a delegation. Server-side validates duration, effective perms, sub-delegation."""
    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    delegation = await create_delegation(db, body, current_user, entity_id, client_ip, ua)
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.get("/", response_model=list[DelegationListItem])
async def list_tenant(
    status: str | None = None,
    delegator_id: UUID | None = None,
    delegate_id: UUID | None = None,
    _: None = require_permission("core.delegation.read"),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List delegations in tenant. Filters: status, delegator_id, delegate_id."""
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if delegator_id:
        stmt = stmt.where(UserDelegation.delegator_id == delegator_id)
    if delegate_id:
        stmt = stmt.where(UserDelegation.delegate_id == delegate_id)
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    items = []
    for d in delegations:
        s = _build_status(d)
        if status and s != status:
            continue
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        items.append(DelegationListItem(
            id=d.id,
            delegator_name=delegator.full_name if delegator else "?",
            delegate_name=delegate.full_name if delegate else "?",
            permissions_count=len(d.permissions),
            start_date=d.start_date,
            end_date=d.end_date,
            status=s,
            reason=d.reason,
        ))
    return items


@router.get("/mine", response_model=list[DelegationListItem])
async def list_mine(
    direction: str | None = None,  # received | given | None=both
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List delegations involving the current user (received and/or given)."""
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if direction == "received":
        stmt = stmt.where(UserDelegation.delegate_id == current_user.id)
    elif direction == "given":
        stmt = stmt.where(UserDelegation.delegator_id == current_user.id)
    else:
        stmt = stmt.where(
            (UserDelegation.delegator_id == current_user.id) | (UserDelegation.delegate_id == current_user.id)
        )
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    items = []
    for d in delegations:
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        items.append(DelegationListItem(
            id=d.id,
            delegator_name=delegator.full_name if delegator else "?",
            delegate_name=delegate.full_name if delegate else "?",
            permissions_count=len(d.permissions),
            start_date=d.start_date,
            end_date=d.end_date,
            status=_build_status(d),
            reason=d.reason,
        ))
    return items


@router.get("/{delegation_id}", response_model=DelegationRead)
async def get_one(
    delegation_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get a delegation. Accessible by delegator, delegate, or holders of core.delegation.read."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    # Authorization
    if delegation.delegator_id != current_user.id and delegation.delegate_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.read", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="No access")

    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.patch("/{delegation_id}", response_model=DelegationRead)
async def patch_one(
    delegation_id: UUID,
    body: DelegationUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Modify reason or shorten end_date. Delegator or core.delegation.manage."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")
    if not delegation.active:
        raise StructuredHTTPException(400, code="RBAC_DELEGATION_INACTIVE", message="Cannot modify inactive delegation")

    if delegation.delegator_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.manage", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="Not authorized")

    if body.reason is not None:
        delegation.reason = body.reason
    if body.end_date is not None:
        if body.end_date >= delegation.end_date:
            raise StructuredHTTPException(400, code="RBAC_DELEGATION_CAN_ONLY_SHORTEN", message="end_date can only be shortened")
        delegation.end_date = body.end_date

    await db.commit()
    await db.refresh(delegation)
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.post("/{delegation_id}/revoke", response_model=DelegationRead)
async def revoke_route(
    delegation_id: UUID,
    body: DelegationRevoke,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a delegation. Delegator or core.delegation.revoke."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    if delegation.delegator_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.revoke", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="Not authorized")

    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    revoked = await revoke_delegation(db, delegation_id, current_user, entity_id, body.reason, client_ip, ua)
    delegator = await db.get(User, revoked.delegator_id)
    delegate = await db.get(User, revoked.delegate_id)
    return _to_read(revoked, delegator, delegate)


@router.get("/{delegation_id}/certificate.pdf")
async def get_certificate(
    delegation_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Re-download the delegation certificate PDF. Hash re-computed must match audit event."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    if delegation.delegator_id != current_user.id and delegation.delegate_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.read", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="No access")

    from app.services.core.rbac_delegation_service import _build_certificate_variables
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, entity_id)

    pdf_bytes = await render_pdf(
        db,
        slug="core.rbac.delegation_certificate",
        entity_id=entity_id,
        language=current_user.language or "fr",
        variables=cert_vars,
    )
    if pdf_bytes is None:
        raise StructuredHTTPException(
            404, code="RBAC_TEMPLATE_NOT_FOUND",
            message="Certificate template not seeded (PR-B not deployed yet)",
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="delegation_{delegation.id}.pdf"',
        },
    )
