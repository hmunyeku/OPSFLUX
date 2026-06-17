"""Messaging routes — announcements, login events journal, security rules."""

from datetime import datetime, UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_permission,
)
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import (
    User,
    UserGroupMember,
    UserGroupRole,
    Permission,
    RolePermission,
)
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
# ANNOUNCEMENTS — Helper functions
# ═══════════════════════════════════════════════════════════════════

async def _resolve_announcement_target_users(
    db: AsyncSession,
    announcement: Announcement,
    entity_id: UUID,
) -> list[UUID]:
    """Résout la liste des user_ids ciblés par une annonce selon target_type."""
    target_type = announcement.target_type
    target_value = announcement.target_value

    # Cas 1: "all" → tous les users actifs de l'entité (ou toutes les entités si global)
    if target_type == "all":
        if announcement.entity_id is None:
            # Annonce globale : tous les users actifs de toutes les entités
            stmt = select(User.id).where(User.active == True)
        else:
            # Annonce entity-scoped : tous les users actifs de cette entité
            stmt = select(User.id).where(
                User.entity_id == entity_id,
                User.active == True,
            )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    # Cas 2: "entity" → tous les users d'une entité spécifique
    if target_type == "entity" and target_value:
        stmt = select(User.id).where(
            User.entity_id == UUID(target_value),
            User.active == True,
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    # Cas 3: "user" → un seul user spécifique
    if target_type == "user" and target_value:
        try:
            return [UUID(target_value)]
        except (ValueError, TypeError):
            return []

    # Cas 4: "role" → tous les users ayant ce role via leurs groupes
    if target_type == "role" and target_value:
        stmt = (
            select(User.id)
            .join(UserGroupMember, UserGroupMember.user_id == User.id)
            .join(UserGroupRole, UserGroupRole.group_id == UserGroupMember.group_id)
            .where(
                UserGroupRole.role_code == target_value,
                User.entity_id == entity_id,
                User.active == True,
            )
            .distinct()
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    # Cas 5: "group" → tous les users membres de ce groupe
    if target_type == "group" and target_value:
        try:
            group_uuid = UUID(target_value)
            stmt = (
                select(User.id)
                .join(UserGroupMember, UserGroupMember.user_id == User.id)
                .where(
                    UserGroupMember.group_id == group_uuid,
                    User.entity_id == entity_id,
                    User.active == True,
                )
                .distinct()
            )
            result = await db.execute(stmt)
            return [row[0] for row in result.all()]
        except (ValueError, TypeError):
            return []

    # Cas 6: "module" → tous les users ayant au moins une permission sur ce module
    if target_type == "module" and target_value:
        stmt = (
            select(User.id)
            .join(UserGroupMember, UserGroupMember.user_id == User.id)
            .join(UserGroupRole, UserGroupRole.group_id == UserGroupMember.group_id)
            .join(RolePermission, RolePermission.role_code == UserGroupRole.role_code)
            .join(Permission, Permission.code == RolePermission.permission_code)
            .where(
                Permission.module == target_value,
                User.entity_id == entity_id,
                User.active == True,
            )
            .distinct()
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    # Cas 7: "page" → pas de filtrage serveur, le filtrage se fait côté client
    # On cible tous les users de l'entité
    if target_type == "page":
        stmt = select(User.id).where(
            User.entity_id == entity_id,
            User.active == True,
        )
        result = await db.execute(stmt)
        return [row[0] for row in result.all()]

    # Fallback : aucun user
    return []


async def _broadcast_announcement(
    db: AsyncSession,
    announcement: Announcement,
    entity_id: UUID,
) -> None:
    """Diffuse une annonce en temps réel via notifications in-app."""
    from app.core.notifications import send_in_app_bulk

    # Résoudre les users ciblés
    user_ids = await _resolve_announcement_target_users(db, announcement, entity_id)
    if not user_ids:
        return

    # Construire le lien vers l'annonce
    link = f"/support?announcement={announcement.id}"

    # Choisir l'icône selon la priorité
    priority_emoji = {
        "info": "ℹ️",
        "warning": "⚠️",
        "critical": "🚨",
        "maintenance": "🔧",
    }
    emoji = priority_emoji.get(announcement.priority, "📢")

    # Envoyer notification in-app à tous les users ciblés
    await send_in_app_bulk(
        db,
        user_ids=user_ids,
        entity_id=announcement.entity_id or entity_id,
        title=f"{emoji} {announcement.title}",
        body=announcement.body[:200],  # Truncate pour notification
        category="messaging",
        link=link,
        event_type="announcement_published",
    )


async def _send_announcement_emails(
    db: AsyncSession,
    announcement: Announcement,
    entity_id: UUID,
) -> None:
    """Envoie des emails pour une annonce si send_email=True."""
    from app.core.email_templates import render_and_send_email

    # Résoudre les users ciblés
    user_ids = await _resolve_announcement_target_users(db, announcement, entity_id)
    if not user_ids:
        return

    # Charger les users avec leurs emails
    stmt = select(User).where(User.id.in_(user_ids))
    result = await db.execute(stmt)
    users = result.scalars().all()

    # Envoyer un email à chaque user
    for user in users:
        if not user.email:
            continue

        try:
            await render_and_send_email(
                db=db,
                template_name="announcement_published",
                to_email=user.email,
                to_name=user.full_name,
                subject=f"[OpsFlux] {announcement.title}",
                context={
                    "user": user,
                    "announcement": announcement,
                    "priority": announcement.priority,
                    "body": announcement.body,
                    "link": f"https://app.opsflux.io/support?announcement={announcement.id}",
                },
            )
        except Exception as e:
            # Log mais ne fait pas échouer la création d'annonce
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Failed to send announcement email to {user.email}: {e}",
                exc_info=True,
            )


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

    # ── SUP-0043 : filtrage cible correct ────────────────────────────────
    # Avant ce fix, role/module passaient sans filtre = tout le monde
    # voyait toutes les annonces role/module. Maintenant chaque type est
    # filtre correctement via sous-requete SQL.
    #
    # Une annonce ciblee 'role' est visible si le user appartient a un
    # groupe qui a ce role attache.
    # Une annonce ciblee 'group' est visible si le user est membre du
    # groupe cible.
    # Une annonce ciblee 'module' est visible si le user a au moins une
    # permission rattachee a ce module (via ses groupes -> roles ->
    # permissions). On joint via subquery pour eviter un cross-join.
    # Une annonce ciblee 'page' est laissee passer cote serveur : le
    # filtrage par route active se fait cote frontend (cf Banner.tsx).
    user_role_codes_sq = (
        select(UserGroupRole.role_code)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroupRole.group_id)
        .where(UserGroupMember.user_id == current_user.id)
        .scalar_subquery()
    )
    user_group_ids_sq = (
        select(UserGroupMember.group_id)
        .where(UserGroupMember.user_id == current_user.id)
        .scalar_subquery()
    )
    user_module_codes_sq = (
        select(Permission.module)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroupRole.group_id)
        .where(
            UserGroupMember.user_id == current_user.id,
            Permission.module.isnot(None),
        )
        .scalar_subquery()
    )

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
            and_(
                Announcement.target_type == "role",
                Announcement.target_value.in_(user_role_codes_sq),
            ),
            and_(
                Announcement.target_type == "group",
                # Cast group_id UUID -> text pour comparer
                Announcement.target_value.in_(
                    select(func.cast(UserGroupMember.group_id, String))
                    .where(UserGroupMember.user_id == current_user.id)
                    .scalar_subquery()
                ),
            ),
            and_(
                Announcement.target_type == "module",
                Announcement.target_value.in_(user_module_codes_sq),
            ),
            # 'page' : pass-through. Filtrage cote frontend via location.
            Announcement.target_type == "page",
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
        active=True,
        pinned=body.pinned,
    )
    db.add(announcement)
    await db.flush()
    await db.commit()
    await db.refresh(announcement)

    # SUP-0043 FIX: Diffuser l'annonce en temps réel
    # Envoyer des notifications in-app à tous les utilisateurs ciblés
    await _broadcast_announcement(db, announcement, entity_id)

    # Si send_email=True, envoyer des emails aux utilisateurs ciblés
    if announcement.send_email:
        await _send_announcement_emails(db, announcement, entity_id)
        announcement.email_sent_at = datetime.now(UTC)
        await db.commit()

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
    # SUP-0043 fix : autoriser le dismiss aussi pour les annonces globales
    # (entity_id IS NULL). L'ancien filtre strict cassait le dismiss des
    # annonces 'all' qui sont par definition cross-tenant.
    # Tenant isolation : l'annonce doit etre de l'entite courante OU
    # globale (NULL). Le receipt cree est scope au user, donc pas de
    # leak inter-tenant possible.
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            or_(
                Announcement.entity_id == entity_id,
                Announcement.entity_id.is_(None),
            ),
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
