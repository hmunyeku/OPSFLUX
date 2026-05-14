"""RBAC PDF export routes — 10 endpoints + async polling.

All endpoints:
- Require permission `core.rbac.export` (or `core.user.audit_export` for user-related)
- Accept ?lang=fr|en (default = user.language)
- Accept ?include_disabled_modules=false
- Log a RbacAuditEvent with file_hash_sha256
- Return application/pdf in sync, or 202 + poll URL in async

Content hash strategy
─────────────────────
Two distinct hashes are computed:

1. **Data hash** — `sha256(canonical_json(variables))`. Stable for given inputs
   (same data → same hash). Injected into the rendered PDF footer so any
   verifier can recompute it from the underlying data and confirm the
   document hasn't been forged. This is the value visible in the footer
   (`SHA-256: <16 hex chars>`).

2. **File hash** — `sha256(pdf_bytes)`. Captured AFTER render and stored on
   the `RbacAuditEvent` for transit integrity / forensics. Returned in the
   `X-Content-Hash` response header. Not embedded in the PDF (chicken-and-egg).
"""
import hashlib
import io
import json
from datetime import datetime, timezone
from typing import Awaitable, Callable
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.models.common import RbacAuditEvent, User
from app.services.core.rbac_export_service import (
    build_delegations_registry_variables,
    build_group_detail_variables,
    build_matrix_group_permissions_variables,
    build_matrix_role_permissions_variables,
    build_matrix_user_permissions_variables,
    build_permission_catalog_variables,
    build_role_detail_variables,
    build_role_modules_variables,
    build_sod_matrix_variables,
    build_user_detail_variables,
)

router = APIRouter(prefix="/api/v1/rbac/exports", tags=["rbac-export"])


async def _render_and_audit(
    db: AsyncSession,
    request: Request,
    current_user: User,
    entity_id: UUID,
    *,
    event_type: str,
    target: str,
    slug: str,
    lang: str,
    builder: Callable[..., Awaitable[dict]],
    builder_kwargs: dict,
    filename: str,
    params: dict,
) -> StreamingResponse:
    """Common pipeline: build vars → render PDF → audit → stream response."""
    start = datetime.now(timezone.utc)

    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type=event_type,
        target=target,
        params=params,
        actor_user_id=current_user.id,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="pending",
    )
    db.add(audit)
    await db.flush()

    try:
        variables = await builder(
            db=db, entity_id=entity_id, user=current_user, lang=lang,
            audit_event_id=str(audit.id),
            **builder_kwargs,
        )
    except Exception as e:
        audit.status = "failure"
        audit.error_code = "BUILDER_FAILED"
        audit.error_detail = str(e)[:1000]
        audit.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise

    # Compute the DATA hash before rendering so it can be embedded in the
    # footer. We canonicalise the variables dict (sorted keys, ASCII fallback,
    # UTC-stable) and exclude the `content_hash` field itself (which is empty
    # at this point) so the hash is reproducible: hashing the same data
    # always yields the same value, regardless of when the PDF is generated.
    hashable_vars = {k: v for k, v in variables.items() if k != "content_hash"}
    canonical = json.dumps(hashable_vars, sort_keys=True, default=str, ensure_ascii=False)
    data_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    variables["content_hash"] = data_hash

    pdf_bytes = await render_pdf(
        db, slug=slug, entity_id=entity_id, language=lang, variables=variables
    )
    if pdf_bytes is None:
        audit.status = "failure"
        audit.error_code = "RBAC_TEMPLATE_NOT_FOUND"
        audit.error_detail = f"Template '{slug}' not seeded or disabled"
        audit.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise StructuredHTTPException(
            404, code="RBAC_TEMPLATE_NOT_FOUND",
            message=f"PDF template '{slug}' is not seeded yet. Deploy PR-B.",
        )

    # File-level hash for audit / transit integrity (different purpose
    # from `data_hash` above — this one changes if any byte of the PDF
    # changes, including non-deterministic WeasyPrint metadata).
    file_hash = hashlib.sha256(pdf_bytes).hexdigest()
    audit.file_hash_sha256 = file_hash
    audit.status = "success"
    audit.completed_at = datetime.now(timezone.utc)
    audit.duration_ms = int((audit.completed_at - start).total_seconds() * 1000)
    audit.result_summary = {
        "size_bytes": len(pdf_bytes),
        "data_hash_sha256": data_hash,
    }
    await db.commit()

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audit-Event-Id": str(audit.id),
            "X-Content-Hash": file_hash,
            "X-Data-Hash": data_hash,
        },
    )


def _date_suffix() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


# 1. Matrix Roles × Permissions

@router.get("/matrix/role-permissions.pdf")
async def export_matrix_role_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_disabled_modules: bool = Query(False),
    module: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_role",
        target="matrix_role_permissions",
        slug="core.rbac.matrix_role_permissions",
        lang=lang,
        builder=build_matrix_role_permissions_variables,
        builder_kwargs={"include_disabled": include_disabled_modules},
        filename=f"rbac_matrix_role_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "include_disabled": include_disabled_modules, "module": module},
    )


# 2. Matrix Groups × Permissions

@router.get("/matrix/group-permissions.pdf")
async def export_matrix_group_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_disabled_modules: bool = Query(False),
    group_id: list[UUID] | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_group",
        target="matrix_group_permissions",
        slug="core.rbac.matrix_group_permissions",
        lang=lang,
        builder=build_matrix_group_permissions_variables,
        builder_kwargs={"include_disabled": include_disabled_modules, "group_ids": group_id},
        filename=f"rbac_matrix_group_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "group_ids": [str(g) for g in (group_id or [])]},
    )


# 3. Matrix Users × Permissions (sensitive RGPD)

@router.get("/matrix/user-permissions.pdf")
async def export_matrix_user_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    user_id: list[UUID] | None = Query(None),
    role_code: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.user.audit_export"),
    db: AsyncSession = Depends(get_db),
):
    # Async threshold check
    if not user_id:
        from sqlalchemy import func, select as _select
        from app.models.common import UserGroup, UserGroupMember
        count_stmt = (
            _select(func.count(func.distinct(UserGroupMember.user_id)))
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(UserGroup.entity_id == entity_id)
        )
        total_users = (await db.execute(count_stmt)).scalar() or 0

        from app.services.core.rbac_delegation_service import _get_tenant_setting
        threshold = await _get_tenant_setting(db, entity_id, "rbac.export.async_threshold_users", 500)
        if total_users > int(threshold):
            # Defer: log audit pending and return 202 (full async wiring is out of scope for PR-A;
            # for now, we still return JSON 202 to signal the limit was hit).
            # Capture client_ip + user_agent (security review 2026-05-14, W2):
            # the sync path at _render_and_audit logs them, the async one
            # was missing them — same forensic value, same data, no reason
            # for the asymmetry.
            audit = RbacAuditEvent(
                tenant_id=entity_id,
                event_type="export.matrix_user",
                target="matrix_user_permissions",
                params={"reason": "async_threshold_exceeded", "user_count": total_users, "threshold": threshold},
                actor_user_id=current_user.id,
                client_ip=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                status="pending",
            )
            db.add(audit)
            await db.commit()
            return JSONResponse(
                status_code=202,
                content={
                    "audit_event_id": str(audit.id),
                    "status": "pending",
                    "poll_url": f"/api/v1/rbac/exports/jobs/{audit.id}",
                    "estimated_seconds": max(45, int(total_users / 10)),
                    "message": "Export deferred to async (threshold exceeded). Polling endpoint to be implemented.",
                },
            )

    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_user",
        target="matrix_user_permissions",
        slug="core.rbac.matrix_user_permissions",
        lang=lang,
        builder=build_matrix_user_permissions_variables,
        builder_kwargs={"user_ids": user_id, "role_code": role_code},
        filename=f"rbac_matrix_user_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "user_ids": [str(u) for u in (user_id or [])], "role_code": role_code},
    )


# 4. Role detail

@router.get("/role/{role_code}.pdf")
async def export_role_detail(
    role_code: str,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.role",
        target=role_code,
        slug="core.rbac.role_detail",
        lang=lang,
        builder=build_role_detail_variables,
        builder_kwargs={"role_code": role_code},
        filename=f"rbac_role_{role_code}_{_date_suffix()}.pdf",
        params={"lang": lang, "role_code": role_code},
    )


# 5. Group detail

@router.get("/group/{group_id}.pdf")
async def export_group_detail(
    group_id: UUID,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.group",
        target=str(group_id),
        slug="core.rbac.group_detail",
        lang=lang,
        builder=build_group_detail_variables,
        builder_kwargs={"group_id": group_id},
        filename=f"rbac_group_{group_id}_{_date_suffix()}.pdf",
        params={"lang": lang, "group_id": str(group_id)},
    )


# 6. User detail (RGPD-sensitive)

@router.get("/user/{user_id}.pdf")
async def export_user_detail(
    user_id: UUID,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_delegations: bool = Query(True),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.user.audit_export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.user",
        target=str(user_id),
        slug="core.rbac.user_detail",
        lang=lang,
        builder=build_user_detail_variables,
        builder_kwargs={"target_user_id": user_id, "include_delegations": include_delegations},
        filename=f"rbac_user_{user_id}_{_date_suffix()}.pdf",
        params={"lang": lang, "user_id": str(user_id), "include_delegations": include_delegations},
    )


# 7. Roles × Modules

@router.get("/matrix/role-modules.pdf")
async def export_role_modules(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.role_modules",
        target="role_modules_view",
        slug="core.rbac.role_modules",
        lang=lang,
        builder=build_role_modules_variables,
        builder_kwargs={},
        filename=f"rbac_role_modules_{_date_suffix()}.pdf",
        params={"lang": lang},
    )


# 8. Permission catalog

@router.get("/catalog/permissions.pdf")
async def export_permission_catalog(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    group_by: str = Query("module", regex=r"^(module|action)$"),
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.catalog",
        target="permission_catalog",
        slug="core.rbac.permission_catalog",
        lang=lang,
        builder=build_permission_catalog_variables,
        builder_kwargs={"group_by": group_by, "include_disabled": include_disabled_modules},
        filename=f"rbac_permission_catalog_{_date_suffix()}.pdf",
        params={"lang": lang, "group_by": group_by, "include_disabled": include_disabled_modules},
    )


# 9. SoD matrix

@router.get("/matrix/sod.pdf")
async def export_sod_matrix(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.sod",
        target="sod_matrix",
        slug="core.rbac.sod_matrix",
        lang=lang,
        builder=build_sod_matrix_variables,
        builder_kwargs={},
        filename=f"rbac_sod_matrix_{_date_suffix()}.pdf",
        params={"lang": lang},
    )


# 10. Delegations registry

@router.get("/delegations/registry.pdf")
async def export_delegations_registry(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    status: str | None = Query(None, regex=r"^(active|programmed|expired|revoked)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.delegations",
        target="delegations_registry",
        slug="core.rbac.delegation_registry",
        lang=lang,
        builder=build_delegations_registry_variables,
        builder_kwargs={"status": status, "start_date": start_date, "end_date": end_date},
        filename=f"rbac_delegations_registry_{_date_suffix()}.pdf",
        params={"lang": lang, "status": status},
    )


# 11. Async job polling (status + download stub)

@router.get("/jobs/{audit_event_id}")
async def get_export_job_status(
    audit_event_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of an async export job."""
    event = await db.get(RbacAuditEvent, audit_event_id)
    if not event or event.tenant_id != entity_id:
        raise StructuredHTTPException(404, code="JOB_NOT_FOUND", message="Job not found")

    return {
        "audit_event_id": str(event.id),
        "status": event.status,  # pending | success | failure
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.isoformat(),
        "completed_at": event.completed_at.isoformat() if event.completed_at else None,
        "duration_ms": event.duration_ms,
        "error_code": event.error_code,
        "error_detail": event.error_detail,
        "download_url": f"/api/v1/rbac/exports/jobs/{event.id}/download" if event.status == "success" else None,
    }


@router.get("/jobs/{audit_event_id}/download")
async def download_export_job(
    audit_event_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    """Download the PDF result of an async job. Stub for PR-A — full async pipeline in a later PR.

    Returns 501 Not Implemented for now.
    """
    raise StructuredHTTPException(
        501,
        code="ASYNC_DOWNLOAD_NOT_IMPLEMENTED",
        message="Full async pipeline is staged for a follow-up. Use synchronous endpoints in the meantime.",
    )
