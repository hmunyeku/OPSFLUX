"""Support routes — ticket CRUD, comments, stats, status management."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_module_enabled,
    require_permission,
)
from app.core.acting_context import get_effective_actor_user_id
from app.core.database import get_db
from app.models.common import User
from app.models.support import SupportTicket, TicketComment, TicketStatusHistory, TicketTodo
from app.schemas.common import PaginatedResponse
from app.schemas.support import (
    CommentCreate,
    CommentRead,
    StatusHistoryRead,
    TicketAssign,
    TicketCreate,
    TicketRead,
    TicketResolve,
    TicketStats,
    TicketUpdate,
    TodoCreate,
    TodoRead,
    TodoUpdate,
)
from app.core.errors import StructuredHTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/support", tags=["support"], dependencies=[require_module_enabled("support")])


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _next_reference(db: AsyncSession, entity_id: UUID) -> str:
    """Generate next ticket reference: SUP-0001, SUP-0002, etc."""
    result = await db.execute(
        select(func.count()).where(SupportTicket.entity_id == entity_id)
    )
    count = result.scalar() or 0
    return f"SUP-{count + 1:04d}"


def _enrich_ticket(ticket: SupportTicket, users_map: dict[UUID, str]) -> dict:
    """Add enriched fields to ticket dict."""
    d = {c.name: getattr(ticket, c.name) for c in ticket.__table__.columns}
    d["reporter_name"] = users_map.get(ticket.reporter_id)
    d["assignee_name"] = users_map.get(ticket.assignee_id) if ticket.assignee_id else None
    d["comment_count"] = len(ticket.comments) if ticket.comments else 0
    return d


async def _users_map(db: AsyncSession, user_ids: set[UUID]) -> dict[UUID, str]:
    """Fetch user display names by IDs."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(User.id, User.first_name, User.last_name).where(User.id.in_(user_ids))
    )
    return {r.id: f"{r.first_name} {r.last_name}".strip() for r in result.all()}


async def _can_access_ticket(
    *,
    ticket: SupportTicket,
    request: Request | None,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> bool:
    is_admin = await has_user_permission(current_user, entity_id, "support.ticket.manage", db)
    if is_admin:
        return True
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    return ticket.reporter_id == acting_user_id


async def _log_status_change(
    db: AsyncSession, ticket_id: UUID, old_status: str | None, new_status: str,
    changed_by: UUID, note: str | None = None,
):
    db.add(TicketStatusHistory(
        ticket_id=ticket_id, old_status=old_status, new_status=new_status,
        changed_by=changed_by, note=note,
    ))


async def _notify_ticket_event(
    db: AsyncSession, event: str, ticket: SupportTicket,
    entity_id: UUID, actor_id: UUID, extra: dict | None = None,
):
    """Send in-app notification for ticket events."""
    try:
        from app.core.notifications import send_in_app, send_in_app_bulk

        link = f"/support?ticket={ticket.id}"

        if event == "created":
            # Notify every active user holding `support.ticket.manage` on this
            # entity. Resolution is the same 3-layer RBAC used elsewhere; we
            # iterate active users and filter — fine for realistic tenant
            # sizes (admin groups are small).
            from app.api.deps import has_user_permission
            active_users = await db.execute(
                select(User).where(User.active == True, User.id != actor_id)
            )
            admin_ids: list[UUID] = []
            for user in active_users.scalars().all():
                try:
                    if await has_user_permission(
                        user, entity_id, "support.ticket.manage", db
                    ):
                        admin_ids.append(user.id)
                except Exception:
                    logger.debug(
                        "Perm check failed for user %s on support.ticket.manage",
                        user.id, exc_info=True,
                    )
            if admin_ids:
                await send_in_app_bulk(
                    db, user_ids=admin_ids, entity_id=entity_id,
                    title=f"Nouveau ticket {ticket.reference}",
                    body=f"« {ticket.title} » — priorité {ticket.priority}.",
                    category="info", link=link,
                    event_type="ticket.created",
                )
            logger.info(
                "Ticket %s created by %s — notified %d admin(s)",
                ticket.reference, actor_id, len(admin_ids),
            )

        elif event == "resolved":
            await send_in_app(
                db, user_id=ticket.reporter_id, entity_id=entity_id,
                title=f"Ticket {ticket.reference} résolu",
                body=ticket.resolution_notes or "Votre ticket a été résolu.",
                category="success", link=link,
                event_type="ticket.resolved",
            )

        elif event == "assigned":
            if ticket.assignee_id:
                await send_in_app(
                    db, user_id=ticket.assignee_id, entity_id=entity_id,
                    title=f"Ticket {ticket.reference} assigné",
                    body=f"Le ticket « {ticket.title} » vous a été assigné.",
                    category="info", link=link,
                    event_type="ticket.assigned",
                )

        elif event == "commented":
            # Notify reporter + assignee (excluding the commenter)
            recipients = {ticket.reporter_id}
            if ticket.assignee_id:
                recipients.add(ticket.assignee_id)
            recipients.discard(actor_id)
            if recipients:
                await send_in_app_bulk(
                    db, user_ids=list(recipients), entity_id=entity_id,
                    title=f"Nouveau commentaire sur {ticket.reference}",
                    body=f"Un commentaire a été ajouté au ticket « {ticket.title} ».",
                    category="info", link=link,
                    event_type="ticket.commented",
                )
                # Send email notification to reporter when admin comments
                from app.core.email_templates import render_and_send_email
                for uid in recipients:
                    user = await db.get(User, uid)
                    if user and user.email:
                        await render_and_send_email(
                            db, slug="ticket_comment", entity_id=entity_id,
                            language=user.language or "fr", to=user.email,
                            variables={
                                "reference": ticket.reference,
                                "title": ticket.title,
                                "link": f"https://app.opsflux.io/support",
                            },
                        )
    except Exception:
        logger.warning("Failed to send notification for ticket %s event %s", ticket.reference, event, exc_info=True)


# ═══════════════════════════════════════════════════════════════════
# TICKETS
# ═══════════════════════════════════════════════════════════════════


@router.get("/tickets", response_model=PaginatedResponse[TicketRead])
async def list_tickets(
    request: Request = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    priority: str | None = None,
    ticket_type: str | None = None,
    assignee_id: str | None = None,
    search: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.read"),
    db: AsyncSession = Depends(get_db),
):
    """List tickets. Regular users see own tickets only. Admins see all."""
    query = (
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.entity_id == entity_id, SupportTicket.archived == False)
    )

    # Non-admin: only own tickets
    if not await has_user_permission(current_user, entity_id, "support.ticket.manage", db):
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
        query = query.where(SupportTicket.reporter_id == acting_user_id)

    # Filters
    if status:
        query = query.where(SupportTicket.status == status)
    if priority:
        query = query.where(SupportTicket.priority == priority)
    if ticket_type:
        query = query.where(SupportTicket.ticket_type == ticket_type)
    if assignee_id:
        query = query.where(SupportTicket.assignee_id == UUID(assignee_id))
    if search:
        like = f"%{search}%"
        query = query.where(
            SupportTicket.title.ilike(like) | SupportTicket.reference.ilike(like) | SupportTicket.description.ilike(like)
        )

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    query = query.order_by(SupportTicket.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    tickets = result.scalars().all()

    # Enrich with user names
    user_ids: set[UUID] = set()
    for t in tickets:
        user_ids.add(t.reporter_id)
        if t.assignee_id:
            user_ids.add(t.assignee_id)
    umap = await _users_map(db, user_ids)

    items = [_enrich_ticket(t, umap) for t in tickets]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("/tickets", response_model=TicketRead, status_code=201)
async def create_ticket(
    body: TicketCreate,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.create"),
    db: AsyncSession = Depends(get_db),
):
    """Submit a new support ticket."""
    ref = await _next_reference(db, entity_id)
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)

    # AUP §4.6 — auto-redact anything that looks like a password, API key,
    # JWT or credit-card number. Applied to both title and description
    # before the row is persisted. The redaction is idempotent so
    # comments added later go through the same filter.
    from app.services.core.secret_redaction import redact_secrets
    safe_title = redact_secrets(body.title) or body.title
    safe_description = redact_secrets(body.description)

    ticket = SupportTicket(
        entity_id=entity_id,
        reference=ref,
        title=safe_title,
        description=safe_description,
        ticket_type=body.ticket_type,
        priority=body.priority,
        source_url=body.source_url,
        browser_info=body.browser_info,
        reporter_id=acting_user_id,
        tags=body.tags,
    )
    db.add(ticket)
    await db.flush()  # flush to get ticket.id before adding status history

    # Initial status history
    db.add(TicketStatusHistory(
        ticket_id=ticket.id, old_status=None, new_status="open",
        changed_by=acting_user_id, note="Ticket créé",
    ))

    # Commit polymorphic children (screenshots, logs, repro files)
    # staged during the Create panel.
    staging_ref = getattr(body, "staging_ref", None)
    if staging_ref:
        from app.services.core.staging_service import commit_staging_children
        await commit_staging_children(
            db,
            staging_owner_type="support_ticket_staging",
            final_owner_type="support_ticket",
            staging_ref=staging_ref,
            final_owner_id=ticket.id,
            uploader_id=current_user.id,
            entity_id=entity_id,
        )

    await db.commit()
    await db.refresh(ticket, ["comments"])

    umap = await _users_map(db, {acting_user_id})
    await _notify_ticket_event(db, "created", ticket, entity_id, acting_user_id)

    return _enrich_ticket(ticket, umap)


@router.get("/tickets/{ticket_id}", response_model=TicketRead)
async def get_ticket(
    ticket_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single ticket."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id, SupportTicket.archived == False)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    # Non-admin can only view own tickets
    if not await _can_access_ticket(
        ticket=ticket,
        request=request,
        current_user=current_user,
        entity_id=entity_id,
        db=db,
    ):
        raise StructuredHTTPException(
            403,
            code="ACCESS_DENIED",
            message="Access denied",
        )

    user_ids = {ticket.reporter_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    umap = await _users_map(db, user_ids)

    return _enrich_ticket(ticket, umap)


@router.patch("/tickets/{ticket_id}", response_model=TicketRead)
async def update_ticket(
    ticket_id: UUID,
    body: TicketUpdate,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket. Users can update own (title, description, priority). Admins can change status, assign, etc."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id, SupportTicket.archived == False)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    is_admin = await has_user_permission(current_user, entity_id, "support.ticket.manage", db)
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    if not await _can_access_ticket(
        ticket=ticket,
        request=request,
        current_user=current_user,
        entity_id=entity_id,
        db=db,
    ):
        raise StructuredHTTPException(
            403,
            code="ACCESS_DENIED",
            message="Access denied",
        )

    update_data = body.model_dump(exclude_unset=True)

    # Track status change
    if "status" in update_data and update_data["status"] != ticket.status:
        if not is_admin:
            raise StructuredHTTPException(
                403,
                code="ONLY_ADMINS_CAN_CHANGE_TICKET_STATUS",
                message="Only admins can change ticket status",
            )
        await _log_status_change(db, ticket.id, ticket.status, update_data["status"], acting_user_id)

    for field, value in update_data.items():
        setattr(ticket, field, value)

    await db.commit()
    await db.refresh(ticket, ["comments"])

    user_ids = {ticket.reporter_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    umap = await _users_map(db, user_ids)

    return _enrich_ticket(ticket, umap)


@router.delete("/tickets/{ticket_id}", status_code=204)
async def delete_ticket(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.delete"),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete (archive) a ticket."""
    result = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id,
            SupportTicket.archived == False,
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    ticket.archived = True
    await db.commit()


@router.post("/tickets/{ticket_id}/assign", response_model=TicketRead)
async def assign_ticket(
    ticket_id: UUID,
    body: TicketAssign,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Assign a ticket to a user."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    ticket.assignee_id = body.assignee_id
    if ticket.status == "open":
        old = ticket.status
        ticket.status = "in_progress"
        await _log_status_change(db, ticket.id, old, "in_progress", current_user.id, "Assigné")

    await db.commit()
    await db.refresh(ticket, ["comments"])

    user_ids = {ticket.reporter_id, body.assignee_id}
    umap = await _users_map(db, user_ids)
    await _notify_ticket_event(db, "assigned", ticket, entity_id, current_user.id)

    return _enrich_ticket(ticket, umap)


@router.post("/tickets/{ticket_id}/resolve", response_model=TicketRead)
async def resolve_ticket(
    ticket_id: UUID,
    body: TicketResolve,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a ticket and notify the reporter."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    old = ticket.status
    ticket.status = "resolved"
    ticket.resolved_at = datetime.now(UTC)
    ticket.resolved_by = current_user.id
    ticket.resolution_notes = body.resolution_notes
    await _log_status_change(db, ticket.id, old, "resolved", current_user.id, body.resolution_notes)

    # Close the linked GitHub Issue when the ticket is resolved.
    if ticket.github_sync_enabled and ticket.github_issue_number:
        from app.services.integrations.github_support_sync import mirror_status_change
        await mirror_status_change(db, ticket, new_status="resolved")

    await db.commit()

    # Re-fetch with comments eagerly loaded to avoid MissingGreenlet
    refreshed = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id)
    )
    ticket = refreshed.scalar_one()

    user_ids = {ticket.reporter_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    umap = await _users_map(db, user_ids)
    await _notify_ticket_event(db, "resolved", ticket, entity_id, current_user.id)

    # Send email notification to reporter
    try:
        from app.core.email_templates import render_and_send_email
        reporter = await db.get(User, ticket.reporter_id)
        if reporter:
            await render_and_send_email(
                db, slug="ticket_resolved", entity_id=entity_id,
                language=reporter.language or "fr", to=reporter.email,
                variables={
                    "ticket": {"reference": ticket.reference, "title": ticket.title, "resolution_notes": ticket.resolution_notes or ""},
                    "user": {"first_name": reporter.first_name},
                },
            )
    except Exception:
        logger.warning("Failed to send ticket resolution email for %s", ticket.reference, exc_info=True)

    return _enrich_ticket(ticket, umap)


@router.post("/tickets/{ticket_id}/close", response_model=TicketRead)
async def close_ticket(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Close a ticket."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    old = ticket.status
    ticket.status = "closed"
    ticket.closed_at = datetime.now(UTC)
    await _log_status_change(db, ticket.id, old, "closed", current_user.id)

    await db.commit()
    await db.refresh(ticket, ["comments"])

    user_ids = {ticket.reporter_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    umap = await _users_map(db, user_ids)
    return _enrich_ticket(ticket, umap)


@router.post("/tickets/{ticket_id}/reopen", response_model=TicketRead)
async def reopen_ticket(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Reopen a resolved/closed ticket."""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.comments))
        .where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    old = ticket.status
    ticket.status = "open"
    ticket.resolved_at = None
    ticket.resolved_by = None
    await _log_status_change(db, ticket.id, old, "open", current_user.id, "Réouvert")

    await db.commit()
    await db.refresh(ticket, ["comments"])

    user_ids = {ticket.reporter_id}
    if ticket.assignee_id:
        user_ids.add(ticket.assignee_id)
    umap = await _users_map(db, user_ids)
    return _enrich_ticket(ticket, umap)


# ═══════════════════════════════════════════════════════════════════
# COMMENTS
# ═══════════════════════════════════════════════════════════════════


@router.get("/tickets/{ticket_id}/comments", response_model=list[CommentRead])
async def list_comments(
    ticket_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.read"),
    db: AsyncSession = Depends(get_db),
):
    """List comments for a ticket. Internal comments filtered for non-admins."""
    # Verify ticket access
    ticket = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id,
        )
    )
    t = ticket.scalar_one_or_none()
    if not t:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )
    if not await _can_access_ticket(
        ticket=t,
        request=request,
        current_user=current_user,
        entity_id=entity_id,
        db=db,
    ):
        raise StructuredHTTPException(
            403,
            code="ACCESS_DENIED",
            message="Access denied",
        )

    is_admin = await has_user_permission(current_user, entity_id, "support.comment.internal", db)

    query = select(TicketComment).where(TicketComment.ticket_id == ticket_id)
    if not is_admin:
        query = query.where(TicketComment.is_internal == False)
    query = query.order_by(TicketComment.created_at)

    result = await db.execute(query)
    comments = result.scalars().all()

    # Enrich with author names
    author_ids = {c.author_id for c in comments}
    umap = await _users_map(db, author_ids)

    return [
        CommentRead(
            id=c.id, ticket_id=c.ticket_id, author_id=c.author_id,
            body=c.body, is_internal=c.is_internal,
            created_at=c.created_at, updated_at=c.updated_at,
            author_name=umap.get(c.author_id),
        )
        for c in comments
    ]


@router.post("/tickets/{ticket_id}/comments", response_model=CommentRead, status_code=201)
async def add_comment(
    ticket_id: UUID,
    body: CommentCreate,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.comment.create"),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a ticket."""
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    ticket = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id,
        )
    )
    t = ticket.scalar_one_or_none()
    if not t:
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )
    if not await _can_access_ticket(
        ticket=t,
        request=request,
        current_user=current_user,
        entity_id=entity_id,
        db=db,
    ):
        raise StructuredHTTPException(
            403,
            code="ACCESS_DENIED",
            message="Access denied",
        )

    # Internal comments require special permission
    if body.is_internal:
        can_internal = await has_user_permission(current_user, entity_id, "support.comment.internal", db)
        if not can_internal:
            raise StructuredHTTPException(
                403,
                code="PERMISSION_DENIED_INTERNAL_COMMENTS",
                message="Permission denied for internal comments",
            )

    # AUP §4.6 — same redaction as ticket creation. Keeps the audit trail
    # clean even if users paste secrets into follow-up comments.
    from app.services.core.secret_redaction import redact_secrets
    safe_body = redact_secrets(body.body) or body.body

    comment = TicketComment(
        ticket_id=ticket_id,
        author_id=acting_user_id,
        body=safe_body,
        is_internal=body.is_internal,
        attachment_ids=[str(a) for a in body.attachment_ids] if body.attachment_ids else None,
    )
    db.add(comment)
    await db.flush()

    # Mirror to GitHub if the ticket is linked + sync is on. Kept on the
    # same transaction so a GitHub API error rolls back the comment
    # rather than leaving it un-mirrored — safer than fire-and-forget
    # when GitHub is the source of truth for an ongoing discussion.
    if t.github_sync_enabled and t.github_issue_number and not body.is_internal:
        from app.services.integrations.github_support_sync import mirror_comment
        await mirror_comment(db, t, comment)

    await db.commit()
    await db.refresh(comment)

    umap = await _users_map(db, {acting_user_id})
    await _notify_ticket_event(db, "commented", t, entity_id, acting_user_id)

    return CommentRead(
        id=comment.id, ticket_id=comment.ticket_id, author_id=comment.author_id,
        body=comment.body, is_internal=comment.is_internal,
        attachment_ids=comment.attachment_ids,
        created_at=comment.created_at, updated_at=comment.updated_at,
        author_name=umap.get(acting_user_id),
    )


# ═══════════════════════════════════════════════════════════════════
# STATUS HISTORY
# ═══════════════════════════════════════════════════════════════════


@router.get("/tickets/{ticket_id}/history", response_model=list[StatusHistoryRead])
async def get_status_history(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get status change history for a ticket."""
    result = await db.execute(
        select(TicketStatusHistory)
        .where(TicketStatusHistory.ticket_id == ticket_id)
        .order_by(TicketStatusHistory.created_at.desc())
    )
    entries = result.scalars().all()

    user_ids = {e.changed_by for e in entries}
    umap = await _users_map(db, user_ids)

    return [
        StatusHistoryRead(
            id=e.id, ticket_id=e.ticket_id, old_status=e.old_status,
            new_status=e.new_status, changed_by=e.changed_by,
            note=e.note, created_at=e.created_at,
            changed_by_name=umap.get(e.changed_by),
        )
        for e in entries
    ]


# ═══════════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════════


@router.get("/stats", response_model=TicketStats)
async def get_ticket_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.stats.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket statistics for the entity."""
    base = select(SupportTicket).where(
        SupportTicket.entity_id == entity_id, SupportTicket.archived == False,
    )

    # Total
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    # By status
    status_counts = {}
    for st in ("open", "in_progress", "waiting_info", "resolved", "closed", "rejected"):
        c = (await db.execute(
            select(func.count()).where(
                SupportTicket.entity_id == entity_id, SupportTicket.archived == False,
                SupportTicket.status == st,
            )
        )).scalar() or 0
        status_counts[st] = c

    # By type
    type_result = await db.execute(
        select(SupportTicket.ticket_type, func.count())
        .where(SupportTicket.entity_id == entity_id, SupportTicket.archived == False)
        .group_by(SupportTicket.ticket_type)
    )
    by_type = {r[0]: r[1] for r in type_result.all()}

    # By priority
    prio_result = await db.execute(
        select(SupportTicket.priority, func.count())
        .where(SupportTicket.entity_id == entity_id, SupportTicket.archived == False)
        .group_by(SupportTicket.priority)
    )
    by_priority = {r[0]: r[1] for r in prio_result.all()}

    # Avg resolution time
    avg_result = await db.execute(
        select(func.avg(func.extract("epoch", SupportTicket.resolved_at - SupportTicket.created_at) / 3600))
        .where(
            SupportTicket.entity_id == entity_id,
            SupportTicket.resolved_at.isnot(None),
        )
    )
    avg_hours = avg_result.scalar()

    # Resolved this week
    from datetime import timedelta
    week_ago = datetime.now(UTC) - timedelta(days=7)
    resolved_week = (await db.execute(
        select(func.count()).where(
            SupportTicket.entity_id == entity_id,
            SupportTicket.resolved_at >= week_ago,
        )
    )).scalar() or 0

    return TicketStats(
        total=total,
        open=status_counts.get("open", 0),
        in_progress=status_counts.get("in_progress", 0),
        resolved=status_counts.get("resolved", 0),
        closed=status_counts.get("closed", 0),
        by_type=by_type,
        by_priority=by_priority,
        avg_resolution_hours=round(avg_hours, 1) if avg_hours else None,
        resolved_this_week=resolved_week,
    )


# ═══════════════════════════════════════════════════════════════════
# TICKET TODOS / CHECKLIST
# ═══════════════════════════════════════════════════════════════════


@router.get("/tickets/{ticket_id}/todos", response_model=list[TodoRead])
async def list_ticket_todos(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all todo items for a ticket."""
    result = await db.execute(
        select(TicketTodo)
        .where(TicketTodo.ticket_id == ticket_id)
        .order_by(TicketTodo.order, TicketTodo.created_at)
    )
    return [TodoRead.model_validate(t) for t in result.scalars().all()]


@router.post("/tickets/{ticket_id}/todos", response_model=TodoRead, status_code=201)
async def add_ticket_todo(
    ticket_id: UUID,
    body: TodoCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("support.ticket.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a todo item to a ticket."""
    # Verify ticket exists
    ticket = await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.entity_id == entity_id)
    )
    if not ticket.scalar_one_or_none():
        raise StructuredHTTPException(
            404,
            code="TICKET_NOT_FOUND",
            message="Ticket not found",
        )

    todo = TicketTodo(ticket_id=ticket_id, title=body.title, order=body.order)
    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    return TodoRead.model_validate(todo)


@router.patch(
    "/todos/{todo_id}",
    response_model=TodoRead,
    dependencies=[require_permission("support.ticket.manage")],
)
async def update_ticket_todo(
    todo_id: UUID,
    body: TodoUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket todo item (title, completed, order). Tenant-scoped via parent ticket."""
    result = await db.execute(
        select(TicketTodo)
        .join(SupportTicket, SupportTicket.id == TicketTodo.ticket_id)
        .where(TicketTodo.id == todo_id, SupportTicket.entity_id == entity_id)
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise StructuredHTTPException(
            404,
            code="TODO_NOT_FOUND",
            message="Todo not found",
        )

    if body.title is not None:
        todo.title = body.title
    if body.order is not None:
        todo.order = body.order
    if body.completed is not None:
        todo.completed = body.completed
        if body.completed:
            todo.completed_at = datetime.now(UTC)
            todo.completed_by = current_user.id
        else:
            todo.completed_at = None
            todo.completed_by = None

    await db.commit()
    await db.refresh(todo)
    return TodoRead.model_validate(todo)


@router.delete(
    "/todos/{todo_id}",
    status_code=204,
    dependencies=[require_permission("support.ticket.manage")],
)
async def delete_ticket_todo(
    todo_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete a ticket todo item. Tenant-scoped via parent ticket."""
    result = await db.execute(
        select(TicketTodo)
        .join(SupportTicket, SupportTicket.id == TicketTodo.ticket_id)
        .where(TicketTodo.id == todo_id, SupportTicket.entity_id == entity_id)
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise StructuredHTTPException(
            404,
            code="TODO_NOT_FOUND",
            message="Todo not found",
        )

    await db.delete(todo)
    await db.commit()


# ── GitHub sync ──────────────────────────────────────────────────────────

from pydantic import BaseModel as _PydBase  # local import: keep module top clean


class GithubSyncEnableBody(_PydBase):
    connection_id: UUID


@router.post("/tickets/{ticket_id}/github-sync/enable", response_model=TicketRead)
async def enable_github_sync(
    ticket_id: UUID,
    body: GithubSyncEnableBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm=require_permission("support.ticket.manage"),
):
    """Link the ticket to a GitHub connector and create the Issue.

    Idempotent: calling it again on an already-linked ticket just
    flips `github_sync_enabled` back on without creating a duplicate
    Issue.
    """
    from app.services.integrations.github_support_sync import enable_sync

    # Eager-load `comments` so `_enrich_ticket` (which touches
    # `ticket.comments` for the count) doesn't trigger a lazy SELECT
    # after commit — that would raise MissingGreenlet since the async
    # session is already closed by that point.
    ticket = (
        await db.execute(
            select(SupportTicket)
            .options(selectinload(SupportTicket.comments))
            .where(
                SupportTicket.id == ticket_id,
                SupportTicket.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(404, code="TICKET_NOT_FOUND", message="Ticket not found")

    try:
        await enable_sync(db, ticket, body.connection_id)
    except ValueError as exc:
        raise StructuredHTTPException(400, code="GITHUB_SYNC_ERROR", message=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("enable_github_sync failed")
        raise StructuredHTTPException(500, code="GITHUB_SYNC_ERROR", message=str(exc))

    await db.commit()
    # Re-fetch with comments eagerly loaded (refresh doesn't re-run
    # the selectinload options, so a plain refresh + _enrich_ticket
    # would hit the same lazy-load trap).
    ticket = (
        await db.execute(
            select(SupportTicket)
            .options(selectinload(SupportTicket.comments))
            .where(SupportTicket.id == ticket_id)
        )
    ).scalar_one()

    users_map = await _users_map(db, {ticket.reporter_id, *([ticket.assignee_id] if ticket.assignee_id else [])})
    return _enrich_ticket(ticket, users_map)


@router.post("/tickets/{ticket_id}/github-sync/disable", response_model=TicketRead)
async def disable_github_sync(
    ticket_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _perm=require_permission("support.ticket.manage"),
):
    """Pause outbound mirroring. The link (issue number, URL) is kept so
    the admin can resume later without recreating the remote Issue."""
    # Eager-load `comments` for the same MissingGreenlet reason as
    # `enable_github_sync` — `_enrich_ticket` touches `ticket.comments`
    # which is a lazy-loaded relationship.
    ticket = (
        await db.execute(
            select(SupportTicket)
            .options(selectinload(SupportTicket.comments))
            .where(
                SupportTicket.id == ticket_id,
                SupportTicket.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not ticket:
        raise StructuredHTTPException(404, code="TICKET_NOT_FOUND", message="Ticket not found")
    ticket.github_sync_enabled = False
    await db.commit()
    # refresh() does not replay selectinload options — re-query instead.
    ticket = (
        await db.execute(
            select(SupportTicket)
            .options(selectinload(SupportTicket.comments))
            .where(SupportTicket.id == ticket_id)
        )
    ).scalar_one()
    users_map = await _users_map(db, {ticket.reporter_id, *([ticket.assignee_id] if ticket.assignee_id else [])})
    return _enrich_ticket(ticket, users_map)
