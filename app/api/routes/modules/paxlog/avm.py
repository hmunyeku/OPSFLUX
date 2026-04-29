"""PaxLog — Avis de Mission (AVM) routes and helpers.

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`, so URLs, tags and
dependencies remain identical.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_permission,
)
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pagination import PaginationParams
from app.models.common import (
    AuditLog,
    Entity,
    User,
    UserGroup,
    UserGroupMember,
)
from app.models.paxlog import (
    Ads,
    AdsEvent,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
)
from app.schemas.common import PaginatedResponse
from app.schemas.paxlog import (
    AdsPaxEntry,
    MissionNoticeCreate,
    MissionNoticeModifyRequest,
    MissionNoticeRead,
    MissionNoticeSummary,
    MissionNoticeUpdate,
    MissionPreparationTaskRead,
    MissionPreparationTaskUpdate,
    MissionProgramRead,
)
from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError

from . import router

logger = logging.getLogger(__name__)


AVM_WORKFLOW_SLUG = "avm-workflow"
AVM_ENTITY_TYPE = "avm"


def _json_safe(value: object | None) -> object | None:
    from datetime import date

    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


# ═══════════════════════════════════════════════════════════════════════════════
# AVM helpers
# ═══════════════════════════════════════════════════════════════════════════════


async def _try_avm_workflow_transition(
    db: AsyncSession,
    *,
    avm: MissionNotice,
    to_state: str,
    actor_id: UUID,
    comment: str | None = None,
) -> tuple[str | None, object | None]:
    """Attempt FSM transition for an AVM.

    Returns (current_state, instance) on success, (None, None) only when
    no workflow definition exists (graceful fallback). FSM-rejected
    transitions ("not allowed") propagate as 400 instead of being silently
    swallowed, so the route guards stay in sync with the state machine.
    """
    try:
        instance = await fsm_service.get_instance(
            db,
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
        )
        if not instance:
            await fsm_service.get_or_create_instance(
                db,
                workflow_slug=AVM_WORKFLOW_SLUG,
                entity_type=AVM_ENTITY_TYPE,
                entity_id=str(avm.id),
                initial_state=avm.status,
                entity_id_scope=avm.entity_id,
                created_by=actor_id,
            )
        instance = await fsm_service.transition(
            db,
            workflow_slug=AVM_WORKFLOW_SLUG,
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
            entity_id_scope=avm.entity_id,
            skip_role_check=True,
        )
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        err_msg = str(e).lower()
        if "not found" in err_msg:
            logger.debug(
                "Workflow '%s' FSM skip (%s) — direct status update",
                AVM_WORKFLOW_SLUG,
                str(e),
            )
            return None, None
        raise HTTPException(400, str(e))


async def _can_manage_avm(
    *,
    db: AsyncSession,
    avm: MissionNotice,
    current_user: User,
    entity_id: UUID,
) -> bool:
    """Whether the current user may manage this AVM.

    Owners can manage their own AVM. Arbitrators may override through stronger
    approval/completion permissions.
    """
    if avm.created_by == current_user.id:
        return True

    can_approve = await has_user_permission(current_user, entity_id, "paxlog.avm.approve", db)
    if can_approve:
        return True

    can_complete = await has_user_permission(current_user, entity_id, "paxlog.avm.complete", db)
    return can_complete


async def _can_read_avm(
    avm: MissionNotice,
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> bool:
    if avm.created_by == current_user.id:
        return True
    return await has_user_permission(current_user, entity_id, "paxlog.avm.read_all", db)


async def _assert_avm_read_access(
    avm: MissionNotice,
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    if not await _can_read_avm(avm, current_user=current_user, entity_id=entity_id, db=db):
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )


async def _build_avm_read(db: AsyncSession, avm: MissionNotice) -> MissionNoticeRead:
    """Build enriched AVM read response with programs, tasks, and progress."""
    creator_result = await db.execute(
        select(User.first_name, User.last_name).where(User.id == avm.created_by)
    )
    cr = creator_result.first()
    creator_name = f"{cr[0] or ''} {cr[1] or ''}".strip() if cr else None

    latest_modification_result = await db.execute(
        select(
            AuditLog.created_at,
            AuditLog.details,
            User.first_name,
            User.last_name,
        )
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(
            AuditLog.entity_id == avm.entity_id,
            AuditLog.resource_type == "mission_notice",
            AuditLog.resource_id == str(avm.id),
            AuditLog.action == "paxlog.avm.modify_active",
        )
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    latest_modification = latest_modification_result.first()
    last_modification_reason = None
    last_modified_at = None
    last_modified_by_name = None
    last_modified_fields: list[str] = []
    last_modification_changes = None
    last_linked_ads_set_to_review = 0
    last_linked_ads_references: list[str] = []
    if latest_modification:
        last_modified_at = latest_modification[0]
        details = latest_modification[1] or {}
        last_modification_reason = details.get("reason")
        last_modification_changes = details.get("changes")
        last_modified_fields = details.get("modified_fields") or []
        last_linked_ads_set_to_review = details.get("linked_ads_set_to_review") or 0
        last_linked_ads_references = details.get("linked_ads_references") or []
        modifier_name = f"{latest_modification[2] or ''} {latest_modification[3] or ''}".strip()
        last_modified_by_name = modifier_name or None

    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm.id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()

    program_reads = []
    for prog in programs:
        pax_result = await db.execute(
            select(MissionProgramPax.user_id, MissionProgramPax.contact_id).where(
                MissionProgramPax.mission_program_id == prog.id,
            )
        )
        pax_entries = [
            AdsPaxEntry(user_id=row[0], contact_id=row[1])
            for row in pax_result.all()
        ]

        site_name = None
        generated_ads_reference = None
        generated_ads_status = None
        if prog.site_asset_id:
            from sqlalchemy import text as sql_text
            name_result = await db.execute(
                sql_text("SELECT name FROM ar_installations WHERE id = :aid"),
                {"aid": str(prog.site_asset_id)},
            )
            name_row = name_result.first()
            site_name = name_row[0] if name_row else None
        if prog.generated_ads_id:
            ads_result = await db.execute(
                select(Ads.reference, Ads.status).where(Ads.id == prog.generated_ads_id)
            )
            ads_row = ads_result.first()
            if ads_row:
                generated_ads_reference = ads_row[0]
                generated_ads_status = ads_row[1]

        pr = MissionProgramRead.model_validate(prog)
        pr.pax_entries = pax_entries
        pr.site_name = site_name
        pr.generated_ads_reference = generated_ads_reference
        pr.generated_ads_status = generated_ads_status
        program_reads.append(pr)

    task_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm.id,
        ).order_by(MissionPreparationTask.created_at)
    )
    tasks = task_result.scalars().all()
    assigned_user_ids = list({task.assigned_to_user_id for task in tasks if task.assigned_to_user_id})
    assigned_names: dict[UUID, str] = {}
    if assigned_user_ids:
        assigned_users_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(User.id.in_(assigned_user_ids))
        )
        assigned_names = {
            row[0]: f"{row[1] or ''} {row[2] or ''}".strip()
            for row in assigned_users_result.all()
        }

    linked_ads_ids = list({task.linked_ads_id for task in tasks if task.linked_ads_id})
    linked_ads_refs: dict[UUID, str] = {}
    if linked_ads_ids:
        linked_ads_result = await db.execute(
            select(Ads.id, Ads.reference).where(Ads.id.in_(linked_ads_ids))
        )
        linked_ads_refs = {row[0]: row[1] for row in linked_ads_result.all()}

    task_reads = []
    for task in tasks:
        task_payload = MissionPreparationTaskRead.model_validate(task).model_dump()
        task_payload["assigned_to_user_name"] = assigned_names.get(task.assigned_to_user_id) if task.assigned_to_user_id else None
        task_payload["linked_ads_reference"] = linked_ads_refs.get(task.linked_ads_id) if task.linked_ads_id else None
        task_reads.append(MissionPreparationTaskRead(**task_payload))

    from app.services.modules.paxlog_service import get_avm_preparation_status
    prep_status = await get_avm_preparation_status(db, avm.id)
    effective_status = avm.status
    if avm.status in ("in_preparation", "ready"):
        effective_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"

    return MissionNoticeRead(
        id=avm.id,
        entity_id=avm.entity_id,
        reference=avm.reference,
        title=avm.title,
        description=avm.description,
        created_by=avm.created_by,
        status=effective_status,
        planned_start_date=avm.planned_start_date,
        planned_end_date=avm.planned_end_date,
        requires_badge=avm.requires_badge,
        requires_epi=avm.requires_epi,
        requires_visa=avm.requires_visa,
        eligible_displacement_allowance=avm.eligible_displacement_allowance,
        epi_measurements=avm.epi_measurements,
        mission_type=avm.mission_type,
        pax_quota=avm.pax_quota,
        archived=avm.archived,
        cancellation_reason=avm.cancellation_reason,
        created_at=avm.created_at,
        updated_at=avm.updated_at,
        creator_name=creator_name,
        programs=program_reads,
        preparation_tasks=task_reads,
        preparation_progress=prep_status["progress_percent"],
        open_preparation_tasks=prep_status["open_preparation_tasks"],
        ready_for_approval=prep_status["ready_for_approval"],
        last_modification_reason=last_modification_reason,
        last_modified_at=last_modified_at,
        last_modified_by_name=last_modified_by_name,
        last_modified_fields=last_modified_fields,
        last_modification_changes=last_modification_changes,
        last_linked_ads_set_to_review=last_linked_ads_set_to_review,
        last_linked_ads_references=last_linked_ads_references,
    )


async def _build_avm_pdf_template_variables(
    db: AsyncSession,
    *,
    avm: MissionNotice,
    entity_id: UUID,
) -> dict[str, Any]:
    entity = await db.get(Entity, entity_id)
    avm_read = await _build_avm_read(db, avm)

    generated_ads_references = [
        program.generated_ads_reference
        for program in avm_read.programs
        if getattr(program, "generated_ads_reference", None)
    ]

    programs = []
    for program in avm_read.programs:
        programs.append(
            {
                "activity_description": program.activity_description,
                "site_name": program.site_name,
                "planned_start_date": program.planned_start_date.strftime("%d/%m/%Y") if program.planned_start_date else "--",
                "planned_end_date": program.planned_end_date.strftime("%d/%m/%Y") if program.planned_end_date else "--",
                "generated_ads_reference": program.generated_ads_reference,
                "pax_count": len(program.pax_entries or []),
            }
        )

    return {
        "reference": avm.reference,
        "title": avm.title,
        "description": avm.description or "",
        "status": avm.status,
        "mission_type": avm.mission_type,
        "planned_start_date": avm.planned_start_date.strftime("%d/%m/%Y") if avm.planned_start_date else "--",
        "planned_end_date": avm.planned_end_date.strftime("%d/%m/%Y") if avm.planned_end_date else "--",
        "creator_name": avm_read.creator_name or "--",
        "pax_quota": avm.pax_quota,
        "requires_badge": avm.requires_badge,
        "requires_epi": avm.requires_epi,
        "requires_visa": avm.requires_visa,
        "eligible_displacement_allowance": avm.eligible_displacement_allowance,
        "preparation_progress": avm_read.preparation_progress,
        "open_preparation_tasks": avm_read.open_preparation_tasks,
        "programs": programs,
        "generated_ads_references": generated_ads_references,
        "entity": {
            "name": entity.name if entity else "",
            "code": entity.code if entity else "",
        },
        "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AVM routes
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/avm", response_model=PaginatedResponse[MissionNoticeSummary])
async def list_avm(
    search: str | None = None,
    status_filter: str | None = None,
    mission_type: str | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Mission (AVM) for the current entity."""
    query = (
        select(
            MissionNotice,
            User.first_name.label("creator_first"),
            User.last_name.label("creator_last"),
        )
        .outerjoin(User, User.id == MissionNotice.created_by)
        .where(MissionNotice.entity_id == entity_id, MissionNotice.archived == False)  # noqa: E712
    )
    if scope == "my":
        query = query.where(MissionNotice.created_by == current_user.id)
    else:
        # Default + explicit "all" both fall back to created_by filter
        # when the user lacks paxlog.avm.read_all.
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.avm.read_all", db
        )
        if not can_read_all:
            query = query.where(MissionNotice.created_by == current_user.id)
    if search:
        like = f"%{search}%"
        query = query.where(
            MissionNotice.reference.ilike(like)
            | MissionNotice.title.ilike(like)
        )
    if status_filter:
        query = query.where(MissionNotice.status == status_filter)
    if mission_type:
        query = query.where(MissionNotice.mission_type == mission_type)
    query = query.order_by(MissionNotice.created_at.desc())

    count_query = select(func.count()).select_from(
        query.with_only_columns(MissionNotice.id).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0
    offset = (pagination.page - 1) * pagination.page_size
    rows = (await db.execute(query.offset(offset).limit(pagination.page_size))).all()

    items = []
    for avm, creator_first, creator_last in rows:
        pax_count_result = await db.execute(
            select(func.count(func.distinct(MissionProgramPax.id))).select_from(
                MissionProgramPax
            ).join(
                MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id
            ).where(MissionProgram.mission_notice_id == avm.id)
        )
        pax_count = pax_count_result.scalar() or 0

        from app.services.modules.paxlog_service import get_avm_preparation_status
        prep_status = await get_avm_preparation_status(db, avm.id)

        effective_status = avm.status
        if avm.status in ("in_preparation", "ready"):
            effective_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"

        d = MissionNoticeSummary.model_validate(avm)
        d.status = effective_status
        d.creator_name = f"{creator_first or ''} {creator_last or ''}".strip() or None
        d.pax_count = pax_count
        d.preparation_progress = prep_status["progress_percent"]
        d.open_preparation_tasks = prep_status["open_preparation_tasks"]
        d.ready_for_approval = prep_status["ready_for_approval"]
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.post("/avm", response_model=MissionNoticeRead, status_code=201)
async def create_avm(
    body: MissionNoticeCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Avis de Mission (AVM) in draft status."""
    from app.services.modules.paxlog_service import generate_avm_reference

    reference = await generate_avm_reference(db, entity_id)

    avm = MissionNotice(
        entity_id=entity_id,
        reference=reference,
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        status="draft",
        planned_start_date=body.planned_start_date,
        planned_end_date=body.planned_end_date,
        mission_type=body.mission_type,
        requires_badge=body.requires_badge,
        requires_epi=body.requires_epi,
        requires_visa=body.requires_visa,
        eligible_displacement_allowance=body.eligible_displacement_allowance,
        epi_measurements=body.epi_measurements,
        pax_quota=body.pax_quota,
    )
    db.add(avm)
    await db.flush()

    # PAX capacity validation
    if avm.pax_quota > 0:
        total_pax_count = sum(len(prog_data.pax_entries) for prog_data in body.programs)
        if total_pax_count > avm.pax_quota:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mission PAX quota exceeded ({total_pax_count}/{avm.pax_quota})",
            )

    for idx, prog_data in enumerate(body.programs):
        prog = MissionProgram(
            mission_notice_id=avm.id,
            order_index=idx,
            activity_description=prog_data.activity_description,
            activity_type=prog_data.activity_type,
            site_asset_id=prog_data.site_asset_id,
            planned_start_date=prog_data.planned_start_date,
            planned_end_date=prog_data.planned_end_date,
            project_id=prog_data.project_id,
            notes=prog_data.notes,
        )
        db.add(prog)
        await db.flush()

        # PAX conflict detection — same PAX on overlapping missions
        for pax_entry in prog_data.pax_entries:
            if prog.planned_start_date and prog.planned_end_date:
                if pax_entry.user_id:
                    pax_match = MissionProgramPax.user_id == pax_entry.user_id
                else:
                    pax_match = MissionProgramPax.contact_id == pax_entry.contact_id

                conflict_query = (
                    select(
                        MissionNotice.reference,
                        MissionProgram.planned_start_date,
                        MissionProgram.planned_end_date,
                    )
                    .select_from(MissionProgramPax)
                    .join(MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id)
                    .join(MissionNotice, MissionNotice.id == MissionProgram.mission_notice_id)
                    .where(
                        pax_match,
                        MissionNotice.id != avm.id,
                        MissionNotice.status != "cancelled",
                        MissionProgram.planned_start_date.isnot(None),
                        MissionProgram.planned_end_date.isnot(None),
                        MissionProgram.planned_start_date <= prog.planned_end_date,
                        MissionProgram.planned_end_date >= prog.planned_start_date,
                    )
                )
                conflict_result = await db.execute(conflict_query)
                conflict = conflict_result.first()
                if conflict:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"PAX already assigned to mission {conflict[0]} "
                            f"({conflict[1]} - {conflict[2]})"
                        ),
                    )

            db.add(MissionProgramPax(
                mission_program_id=prog.id,
                user_id=pax_entry.user_id,
                contact_id=pax_entry.contact_id,
            ))

    if body.staging_ref:
        from app.services.core.staging_service import commit_staging_children
        await commit_staging_children(
            db,
            staging_owner_type="avm_staging",
            final_owner_type="avm",
            staging_ref=body.staging_ref,
            final_owner_id=avm.id,
            uploader_id=current_user.id,
            entity_id=entity_id,
        )

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.create", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.get("/avm/{avm_id}", response_model=MissionNoticeRead)
async def get_avm(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get AVM detail with programs, preparation tasks, and progress."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    await _assert_avm_read_access(avm, current_user=current_user, entity_id=entity_id, db=db)
    return await _build_avm_read(db, avm)


@router.get("/avm/{avm_id}/pdf")
async def get_avm_pdf(
    avm_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """Render an AVM PDF via the centralized PDF template engine."""
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf

    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    await _assert_avm_read_access(avm, current_user=current_user, entity_id=entity_id, db=db)

    variables = await _build_avm_pdf_template_variables(db=db, avm=avm, entity_id=entity_id)
    pdf_bytes = await render_pdf(
        db,
        slug="avm.ticket",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise StructuredHTTPException(
            404,
            code="TEMPLATE_PDF_AVM_TICKET_INTROUVABLE_CR",
            message="Template PDF 'avm.ticket' introuvable. Créez-le dans Paramètres > Modèles PDF.",
        )

    filename = f"AVM_{avm.reference.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.put("/avm/{avm_id}", response_model=MissionNoticeRead)
async def update_avm(
    avm_id: UUID,
    body: MissionNoticeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AVM (only if draft or in_preparation)."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    if avm.status not in ("draft", "in_preparation"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only update your own AVM unless you can arbitrate it.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(avm, key, value)

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.update", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/submit", response_model=dict)
async def submit_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Submit AVM — triggers preparation checklist generation."""
    from app.services.modules.paxlog_service import submit_avm as _submit_avm

    try:
        result_check = await db.execute(
            select(MissionNotice).where(
                MissionNotice.id == avm_id,
                MissionNotice.entity_id == entity_id,
            )
        )
        avm = result_check.scalar_one_or_none()
        if not avm:
            raise StructuredHTTPException(
                404,
                code="AVM_NOT_FOUND",
                message="AVM not found",
            )
        if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You may only submit your own AVM unless you can arbitrate it.",
            )
        result = await _submit_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.submit", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/approve", response_model=dict)
async def approve_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve AVM — auto-creates draft AdS for each program line."""
    from app.services.modules.paxlog_service import approve_avm as _approve_avm

    try:
        result = await _approve_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.approve", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/complete", response_model=dict)
async def complete_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.complete"),
    db: AsyncSession = Depends(get_db),
):
    """Complete AVM once all generated AdS are terminal."""
    from app.services.modules.paxlog_service import complete_avm as _complete_avm

    try:
        result = await _complete_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.complete", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/cancel", response_model=MissionNoticeRead)
async def cancel_avm(
    avm_id: UUID,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.cancel"),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an AVM. Cancels all pending preparation tasks."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only cancel your own AVM unless you can arbitrate it.",
        )
    if avm.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel AVM with status '{avm.status}'",
        )

    linked_ads_cancelled = 0
    linked_ads_reviewed = 0
    linked_ads_refs: list[str] = []
    linked_ads_result = await db.execute(
        select(Ads.id, Ads.reference, Ads.status, Ads.requester_id)
        .join(MissionProgram, MissionProgram.generated_ads_id == Ads.id)
        .where(
            MissionProgram.mission_notice_id == avm.id,
            Ads.entity_id == entity_id,
            Ads.status.not_in(("completed", "cancelled", "rejected")),
        )
    )
    linked_ads_rows = linked_ads_result.all()
    for linked_ads_id, linked_ads_ref, linked_ads_status, linked_ads_requester_id in linked_ads_rows:
        if linked_ads_status in {"draft", "requires_review", "submitted", "pending_compliance", "pending_validation"}:
            target_status = "cancelled"
            values = {
                "status": "cancelled",
                "updated_at": func.now(),
                "rejection_reason": reason or "AVM annulée",
            }
            linked_ads_cancelled += 1
        else:
            target_status = "requires_review"
            values = {
                "status": "requires_review",
                "updated_at": func.now(),
                "rejection_reason": reason or "AVM annulée",
            }
            linked_ads_reviewed += 1

        await db.execute(
            Ads.__table__.update()
            .where(Ads.id == linked_ads_id)
            .values(**values)
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=linked_ads_id,
            event_type="avm_cancelled",
            old_status=linked_ads_status,
            new_status=target_status,
            actor_id=current_user.id,
            reason=reason,
            metadata_json={
                "avm_id": str(avm.id),
                "avm_reference": avm.reference,
            },
        ))
        linked_ads_refs.append(linked_ads_ref)
        if linked_ads_requester_id:
            from app.core.notifications import send_in_app
            await send_in_app(
                db,
                user_id=linked_ads_requester_id,
                entity_id=entity_id,
                title="AVM annulée — AdS impactée",
                body=(
                    f"L'AVM {avm.reference} a été annulée. "
                    f"L'AdS {linked_ads_ref} passe en {target_status}."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{linked_ads_id}",
            )

    previous_status = avm.status
    await _try_avm_workflow_transition(
        db,
        avm=avm,
        to_state="cancelled",
        actor_id=current_user.id,
        comment=reason,
    )
    avm.status = "cancelled"
    avm.cancellation_reason = reason

    await db.execute(
        sql_update(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.status.in_(["pending", "in_progress"]),
        ).values(status="cancelled")
    )

    await db.commit()
    await db.refresh(avm)
    await fsm_service.emit_transition_event(
        entity_type=AVM_ENTITY_TYPE,
        entity_id=str(avm.id),
        from_state=previous_status,
        to_state=avm.status,
        actor_id=current_user.id,
        workflow_slug=AVM_WORKFLOW_SLUG,
        extra_payload={
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )

    await record_audit(
        db, action="paxlog.avm.cancel", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
        details={
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.cancelled",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "cancelled_by": str(current_user.id),
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    ))

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/modify", response_model=MissionNoticeRead)
async def modify_active_avm(
    avm_id: UUID,
    body: MissionNoticeModifyRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Modify an active AVM (PAX potentially on site).

    Allowed on status: active, in_preparation, ready.
    Logs modification reason and notifies stakeholders.
    """
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    if avm.status not in ("active", "in_preparation", "ready"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only modify your own AVM unless you can arbitrate it.",
        )

    update_data = body.model_dump(exclude_unset=True, exclude={"reason"})
    if not update_data:
        raise StructuredHTTPException(
            400,
            code="NO_AVM_CHANGES_PROVIDED",
            message="No AVM changes provided",
        )

    before_values = {key: getattr(avm, key, None) for key in update_data}
    if "planned_start_date" in update_data or "planned_end_date" in update_data:
        start_value = update_data.get("planned_start_date", avm.planned_start_date)
        end_value = update_data.get("planned_end_date", avm.planned_end_date)
        if start_value and end_value and start_value > end_value:
            raise StructuredHTTPException(
                400,
                code="PLANNED_END_DATE_MUST_GREATER_THAN",
                message="planned_end_date must be greater than or equal to planned_start_date",
            )

    for key, value in update_data.items():
        setattr(avm, key, value)

    changes = {}
    for key, old_value in before_values.items():
        new_value = getattr(avm, key, None)
        if old_value != new_value:
            changes[key] = {
                "before": _json_safe(old_value),
                "after": _json_safe(new_value),
            }
    if not changes:
        raise StructuredHTTPException(
            400,
            code="NO_AVM_CHANGES_DETECTED",
            message="No AVM changes detected",
        )

    linked_ads_reviewed = 0
    linked_ads_refs: list[str] = []
    linked_ads_result = await db.execute(
        select(Ads.id, Ads.reference, Ads.status, Ads.requester_id)
        .join(MissionProgram, MissionProgram.generated_ads_id == Ads.id)
        .where(
            MissionProgram.mission_notice_id == avm.id,
            Ads.entity_id == entity_id,
            Ads.status.in_((
                "submitted",
                "pending_compliance",
                "pending_validation",
                "approved",
                "in_progress",
            )),
        )
    )
    linked_ads_rows = linked_ads_result.all()
    for linked_ads_id, linked_ads_ref, linked_ads_status, linked_ads_requester_id in linked_ads_rows:
        await db.execute(
            Ads.__table__.update()
            .where(Ads.id == linked_ads_id)
            .values(status="requires_review", updated_at=func.now())
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=linked_ads_id,
            event_type="avm_modified_requires_review",
            old_status=linked_ads_status,
            new_status="requires_review",
            actor_id=current_user.id,
            reason=body.reason,
            metadata_json={
                "avm_id": str(avm.id),
                "avm_reference": avm.reference,
                "changes": changes,
            },
        ))
        linked_ads_reviewed += 1
        linked_ads_refs.append(linked_ads_ref)
        if linked_ads_requester_id:
            from app.core.notifications import send_in_app
            await send_in_app(
                db,
                user_id=linked_ads_requester_id,
                entity_id=entity_id,
                title="AdS à revoir suite à une modification d'AVM",
                body=(
                    f"L'AVM {avm.reference} a été modifiée. "
                    f"L'AdS {linked_ads_ref} repasse en revue. "
                    f"Motif: {body.reason}."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{linked_ads_id}",
            )

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.modify_active", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
        details={
            "reason": body.reason,
            "modified_fields": list(changes.keys()),
            "changes": changes,
            "linked_ads_set_to_review": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.modified",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "modified_by": str(current_user.id),
            "modified_fields": list(changes.keys()),
            "reason": body.reason,
            "changes": changes,
            "linked_ads_set_to_review": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    ))

    return await _build_avm_read(db, avm)


@router.patch("/avm/{avm_id}/preparation-tasks/{task_id}", response_model=MissionPreparationTaskRead)
async def update_avm_preparation_task(
    avm_id: UUID,
    task_id: UUID,
    body: MissionPreparationTaskUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AVM preparation task within the current entity."""
    avm_result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = avm_result.scalar_one_or_none()
    if not avm:
        raise StructuredHTTPException(
            404,
            code="AVM_NOT_FOUND",
            message="AVM not found",
        )
    if avm.status not in ("in_preparation", "ready", "active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update preparation tasks for AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only manage preparation for your own AVM unless you can arbitrate it.",
        )

    task_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.id == task_id,
            MissionPreparationTask.mission_notice_id == avm_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise StructuredHTTPException(
            404,
            code="PREPARATION_TASK_NOT_FOUND",
            message="Preparation task not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise StructuredHTTPException(
            400,
            code="NO_PREPARATION_TASK_CHANGES_PROVIDED",
            message="No preparation task changes provided",
        )

    if "assigned_to_user_id" in update_data and update_data["assigned_to_user_id"]:
        assigned_user_id = update_data["assigned_to_user_id"]
        assigned_user_result = await db.execute(
            select(User.id)
            .join(UserGroupMember, UserGroupMember.user_id == User.id)
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(
                User.id == assigned_user_id,
                User.active == True,  # noqa: E712
                UserGroup.entity_id == entity_id,
                UserGroup.active == True,  # noqa: E712
            )
            .limit(1)
        )
        if not assigned_user_result.scalar_one_or_none():
            raise StructuredHTTPException(
                400,
                code="ASSIGNED_USER_MUST_ACTIVE_BELONG_CURRENT",
                message="Assigned user must be active and belong to the current entity",
            )

    for key, value in update_data.items():
        setattr(task, key, value)

    if "status" in update_data:
        task.completed_at = datetime.now(timezone.utc) if task.status == "completed" else None

    previous_avm_status = avm.status
    if avm.status in ("in_preparation", "ready"):
        from app.services.modules.paxlog_service import get_avm_preparation_status
        await db.flush()
        prep_status = await get_avm_preparation_status(db, avm.id)
        next_avm_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"
        if next_avm_status != avm.status:
            await _try_avm_workflow_transition(
                db,
                avm=avm,
                to_state=next_avm_status,
                actor_id=current_user.id,
            )
            avm.status = next_avm_status

    await db.commit()
    await db.refresh(task)
    if avm.status != previous_avm_status:
        await fsm_service.emit_transition_event(
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
            from_state=previous_avm_status,
            to_state=avm.status,
            actor_id=current_user.id,
            workflow_slug=AVM_WORKFLOW_SLUG,
        )

    await record_audit(
        db,
        action="paxlog.avm.preparation_task.update",
        resource_type="mission_notice",
        resource_id=str(avm.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "task_id": str(task.id),
            "task_type": task.task_type,
            "changes": {
                key: _json_safe(value)
                for key, value in update_data.items()
            },
        },
    )
    await db.commit()

    assigned_to_user_name = None
    if task.assigned_to_user_id:
        assigned_user_result = await db.execute(
            select(User.first_name, User.last_name).where(User.id == task.assigned_to_user_id)
        )
        assigned_user = assigned_user_result.first()
        if assigned_user:
            assigned_to_user_name = f"{assigned_user[0] or ''} {assigned_user[1] or ''}".strip() or None

    linked_ads_reference = None
    if task.linked_ads_id:
        linked_ads_result = await db.execute(
            select(Ads.reference).where(Ads.id == task.linked_ads_id)
        )
        linked_ads_reference = linked_ads_result.scalar_one_or_none()

    task_payload = MissionPreparationTaskRead.model_validate(task).model_dump()
    task_payload["assigned_to_user_name"] = assigned_to_user_name
    task_payload["linked_ads_reference"] = linked_ads_reference
    return MissionPreparationTaskRead(**task_payload)
