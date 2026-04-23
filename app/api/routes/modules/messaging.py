"""Messaging routes — announcements, login events journal, security rules."""

from datetime import datetime, UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_permission,
)
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import User
from app.models.messaging import (
    Announcement,
    AnnouncementReceipt,
    LoginEvent,
    SecurityRule,
)
from app.schemas.common import PaginatedResponse
from app.schemas.messaging import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    LoginEventRead,
    LoginEventStats,
    SecurityRuleCreate,
    SecurityRuleRead,
    SecurityRuleUpdate,
)
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/messaging", tags=["messaging"])


# ═══════════════════════════════════════════════════════════════════
# ANNOUNCEMENTS
# ═══════════════════════════════════════════════════════════════════

@router.get("/announcements", response_model=PaginatedResponse[AnnouncementRead])
async def list_announcements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    priority: str | None = None,
    display_location: str | None = None,
    active_only: bool = True,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List announcements visible to the current user."""
    now = datetime.now(UTC)

    stmt = select(Announcement).where(
        or_(
            Announcement.entity_id == entity_id,
            Announcement.entity_id.is_(None),  # Global announcements
        ),
    )

    if active_only:
        stmt = stmt.where(Announcement.active == True)
        stmt = stmt.where(
            or_(
                Announcement.published_at.is_(None),
                Announcement.published_at <= now,
            )
        )
        stmt = stmt.where(
            or_(
                Announcement.expires_at.is_(None),
                Announcement.expires_at > now,
            )
        )

    # Target filtering
    stmt = stmt.where(
        or_(
            Announcement.target_type == "all",
            and_(
                Announcement.target_type == "entity",
                Announcement.target_value == str(entity_id),
            ),
            and_(
                Announcement.target_type == "user",
                Announcement.target_value == str(current_user.id),
            ),
            # Role-based and module-based require permission checks
            Announcement.target_type.in_(["role", "module"]),
        )
    )

    if priority:
        stmt = stmt.where(Announcement.priority == priority)
    if display_location:
        stmt = stmt.where(
            or_(
                Announcement.display_location == display_location,
                Announcement.display_location == "all",
            )
        )

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginate
    stmt = stmt.order_by(
        Announcement.pinned.desc(),
        Announcement.created_at.desc(),
    ).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    announcements = result.scalars().all()

    # Check read status for current user
    if announcements:
        ann_ids = [a.id for a in announcements]
        receipts_result = await db.execute(
            select(AnnouncementReceipt.announcement_id).where(
                AnnouncementReceipt.user_id == current_user.id,
                AnnouncementReceipt.announcement_id.in_(ann_ids),
            )
        )
        read_ids = {r[0] for r in receipts_result.all()}

        # Get sender names
        sender_ids = list({a.sender_id for a in announcements})
        sender_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(User.id.in_(sender_ids))
        )
        sender_map = {r[0]: f"{r[1]} {r[2]}" for r in sender_result.all()}
    else:
        read_ids = set()
        sender_map = {}

    items = []
    for a in announcements:
        data = AnnouncementRead.model_validate(a)
        data.is_read = a.id in read_ids
        data.sender_name = sender_map.get(a.sender_id)
        items.append(data)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.get(
    "/announcements/public",
    response_model=list[AnnouncementRead],
)
async def list_public_announcements(
    display_location: str = Query("login"),
    db: AsyncSession = Depends(get_db),
):
    """List public announcements (no auth required) — login page, etc."""
    now = datetime.now(UTC)

    stmt = (
        select(Announcement)
        .where(
            Announcement.active == True,
            Announcement.target_type == "all",
            or_(
                Announcement.display_location == display_location,
                Announcement.display_location == "all",
            ),
            or_(
                Announcement.published_at.is_(None),
                Announcement.published_at <= now,
            ),
            or_(
                Announcement.expires_at.is_(None),
                Announcement.expires_at > now,
            ),
        )
        .order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
        .limit(10)
    )

    result = await db.execute(stmt)
    announcements = result.scalars().all()

    items = []
    for a in announcements:
        data = AnnouncementRead.model_validate(a)
        items.append(data)
    return items


@router.post(
    "/announcements",
    response_model=AnnouncementRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("messaging.announcement.create")],
)
async def create_announcement(
    body: AnnouncementCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create a new announcement."""
    announcement = Announcement(
        entity_id=entity_id if body.target_type != "all" else None,
        title=body.title,
        body=body.body,
        body_html=body.body_html,
        priority=body.priority,
        target_type=body.target_type,
        target_value=body.target_value,
        display_location=body.display_location,
        published_at=body.published_at or datetime.now(UTC),
        expires_at=body.expires_at,
        send_email=body.send_email,
        sender_id=current_user.id,
        pinned=body.pinned,
    )
    db.add(announcement)
    await db.flush()
    await db.commit()
    await db.refresh(announcement)

    data = AnnouncementRead.model_validate(announcement)
    data.sender_name = current_user.full_name
    return data


@router.patch(
    "/announcements/{announcement_id}",
    response_model=AnnouncementRead,
    dependencies=[require_permission("messaging.announcement.update")],
)
async def update_announcement(
    announcement_id: UUID,
    body: AnnouncementUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update an announcement."""
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.entity_id == entity_id,
        )
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise StructuredHTTPException(
            404,
            code="ANNONCE_NON_TROUV_E",
            message="Annonce non trouvée",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(announcement, key, value)

    await db.commit()
    await db.refresh(announcement)

    data = AnnouncementRead.model_validate(announcement)
    data.sender_name = current_user.full_name
    return data


@router.delete(
    "/announcements/{announcement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("messaging.announcement.delete")],
)
async def delete_announcement(
    announcement_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete an announcement."""
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.entity_id == entity_id,
        )
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise StructuredHTTPException(
            404,
            code="ANNONCE_NON_TROUV_E",
            message="Annonce non trouvée",
        )

    await delete_entity(announcement, db, "announcement", entity_id=announcement.id, user_id=current_user.id)
    await db.commit()


@router.post("/announcements/{announcement_id}/dismiss")
async def dismiss_announcement(
    announcement_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Mark an announcement as read/dismissed by the current user."""
    # Tenant isolation: without the entity_id filter any authenticated
    # user could probe for — and mark as dismissed — announcements
    # belonging to sibling tenants. Low severity leak (marks read on
    # their own receipt only) but violates cloisonnement contract.
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.entity_id == entity_id,
        )
    )
    if not result.scalar_one_or_none():
        raise StructuredHTTPException(
            404,
            code="ANNONCE_NON_TROUV_E",
            message="Annonce non trouvée",
        )

    # Check if already dismissed
    existing = await db.execute(
        select(AnnouncementReceipt).where(
            AnnouncementReceipt.announcement_id == announcement_id,
            AnnouncementReceipt.user_id == current_user.id,
        )
    )
    receipt = existing.scalar_one_or_none()

    if receipt:
        receipt.dismissed = True
    else:
        db.add(AnnouncementReceipt(
            announcement_id=announcement_id,
            user_id=current_user.id,
            dismissed=True,
        ))

    await db.commit()
    return {"status": "dismissed"}


# ═══════════════════════════════════════════════════════════════════
# LOGIN EVENTS JOURNAL (Admin)
# ═══════════════════════════════════════════════════════════════════

@router.get(
    "/login-events",
    response_model=PaginatedResponse[LoginEventRead],
    dependencies=[require_permission("messaging.login_events.read")],
)
async def list_login_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: UUID | None = None,
    email: str | None = None,
    ip_address: str | None = None,
    success: bool | None = None,
    suspicious: bool | None = None,
    blocked: bool | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List login events for admin security review."""
    stmt = select(LoginEvent)

    if user_id:
        stmt = stmt.where(LoginEvent.user_id == user_id)
    if email:
        stmt = stmt.where(LoginEvent.email.ilike(f"%{email}%"))
    if ip_address:
        stmt = stmt.where(LoginEvent.ip_address == ip_address)
    if success is not None:
        stmt = stmt.where(LoginEvent.success == success)
    if suspicious is not None:
        stmt = stmt.where(LoginEvent.suspicious == suspicious)
    if blocked is not None:
        stmt = stmt.where(LoginEvent.blocked == blocked)
    if date_from:
        stmt = stmt.where(LoginEvent.created_at >= date_from)
    if date_to:
        stmt = stmt.where(LoginEvent.created_at <= date_to)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(LoginEvent.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)

    result = await db.execute(stmt)
    items = [LoginEventRead.model_validate(e) for e in result.scalars().all()]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.get(
    "/login-events/stats",
    response_model=LoginEventStats,
    dependencies=[require_permission("messaging.login_events.read")],
)
async def login_event_stats(
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get login event statistics for the admin dashboard."""
    from datetime import timedelta

    since = datetime.now(UTC) - timedelta(days=days)
    base = select(LoginEvent).where(LoginEvent.created_at >= since)

    # Total
    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar() or 0

    # Successful
    successful = (await db.execute(
        select(func.count()).where(
            LoginEvent.created_at >= since, LoginEvent.success == True
        )
    )).scalar() or 0

    # Failed
    failed = (await db.execute(
        select(func.count()).where(
            LoginEvent.created_at >= since, LoginEvent.success == False
        )
    )).scalar() or 0

    # Blocked
    blocked = (await db.execute(
        select(func.count()).where(
            LoginEvent.created_at >= since, LoginEvent.blocked == True
        )
    )).scalar() or 0

    # Suspicious
    suspicious = (await db.execute(
        select(func.count()).where(
            LoginEvent.created_at >= since, LoginEvent.suspicious == True
        )
    )).scalar() or 0

    # Unique IPs
    unique_ips = (await db.execute(
        select(func.count(func.distinct(LoginEvent.ip_address))).where(
            LoginEvent.created_at >= since
        )
    )).scalar() or 0

    # Top failure reasons
    reason_result = await db.execute(
        select(
            LoginEvent.failure_reason,
            func.count().label("count"),
        )
        .where(
            LoginEvent.created_at >= since,
            LoginEvent.success == False,
            LoginEvent.failure_reason.isnot(None),
        )
        .group_by(LoginEvent.failure_reason)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_failure_reasons = [
        {"reason": r[0], "count": r[1]} for r in reason_result.all()
    ]

    return LoginEventStats(
        total=total,
        successful=successful,
        failed=failed,
        blocked=blocked,
        suspicious=suspicious,
        unique_ips=unique_ips,
        top_failure_reasons=top_failure_reasons,
        attempts_by_hour=[],  # Can be enriched later
    )


@router.get(
    "/login-events/my",
    response_model=PaginatedResponse[LoginEventRead],
)
async def my_login_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User-facing: view own login history (for profile journal page)."""
    stmt = select(LoginEvent).where(LoginEvent.user_id == current_user.id)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(LoginEvent.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)

    result = await db.execute(stmt)
    items = [LoginEventRead.model_validate(e) for e in result.scalars().all()]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


# ═══════════════════════════════════════════════════════════════════
# SECURITY RULES
# ═══════════════════════════════════════════════════════════════════

@router.get(
    "/security-rules",
    response_model=list[SecurityRuleRead],
    dependencies=[require_permission("messaging.security_rules.read")],
)
async def list_security_rules(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all security rules (global + entity-specific)."""
    stmt = (
        select(SecurityRule)
        .where(
            or_(
                SecurityRule.entity_id == entity_id,
                SecurityRule.entity_id.is_(None),
            )
        )
        .order_by(SecurityRule.priority.desc(), SecurityRule.created_at.asc())
    )
    result = await db.execute(stmt)
    return [SecurityRuleRead.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/security-rules",
    response_model=SecurityRuleRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("messaging.security_rules.manage")],
)
async def create_security_rule(
    body: SecurityRuleCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create a new security rule."""
    rule = SecurityRule(
        entity_id=entity_id,
        rule_type=body.rule_type,
        name=body.name,
        description=body.description,
        config=body.config,
        enabled=body.enabled,
        priority=body.priority,
        created_by=current_user.id,
    )
    db.add(rule)
    await db.flush()
    await db.commit()
    await db.refresh(rule)
    return SecurityRuleRead.model_validate(rule)


@router.patch(
    "/security-rules/{rule_id}",
    response_model=SecurityRuleRead,
    dependencies=[require_permission("messaging.security_rules.manage")],
)
async def update_security_rule(
    rule_id: UUID,
    body: SecurityRuleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update a security rule.

    Tenant-scoped: can only update rules owned by the caller's entity.
    Global rules (entity_id=NULL) are not editable through this endpoint.
    """
    result = await db.execute(
        select(SecurityRule).where(
            SecurityRule.id == rule_id,
            SecurityRule.entity_id == entity_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise StructuredHTTPException(
            404,
            code="R_GLE_NON_TROUV_E",
            message="Règle non trouvée",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)

    await db.commit()
    await db.refresh(rule)
    return SecurityRuleRead.model_validate(rule)


@router.delete(
    "/security-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("messaging.security_rules.manage")],
)
async def delete_security_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete a security rule. Tenant-scoped."""
    result = await db.execute(
        select(SecurityRule).where(
            SecurityRule.id == rule_id,
            SecurityRule.entity_id == entity_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise StructuredHTTPException(
            404,
            code="R_GLE_NON_TROUV_E",
            message="Règle non trouvée",
        )

    await delete_entity(rule, db, "security_rule", entity_id=rule.id, user_id=current_user.id)
    await db.commit()
