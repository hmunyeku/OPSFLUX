"""FastAPI dependencies — auth, entity scoping, permissions."""

from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.services.core.module_lifecycle_service import is_module_enabled
from app.core.acting_context import resolve_acting_context
from app.core.redis_client import get_redis
from app.core.security import JWTError, decode_token
from app.models.common import (
    Permission,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(
        select(User)
        .options(selectinload(User.job_position), selectinload(User.business_unit))
        .where(User.id == UUID(user_id))
    )
    user = result.scalar_one_or_none()

    if not user or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return user


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Best-effort current user resolver for routes that may be public.

    Returns ``None`` when no bearer token is provided. Invalid credentials still
    raise 401 because they indicate an active but bad auth attempt rather than
    an anonymous public access.
    """
    if not credentials:
        return None
    return await get_current_user(credentials=credentials, db=db)


async def get_current_entity(
    request: Request,
    x_entity_id: str | None = Header(None, alias="X-Entity-ID"),
    current_user: User = Depends(get_current_user),
) -> UUID:
    """Resolve the current entity from header or user default."""
    if x_entity_id:
        try:
            return UUID(x_entity_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Entity-ID header",
            )

    if current_user.default_entity_id:
        return current_user.default_entity_id

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No entity context. Set X-Entity-ID header or user default entity.",
    )


def require_permission(permission_code: str):
    """Factory returning a dependency that checks user has a specific permission.

    Uses the full 3-layer RBAC resolution (group overrides → role perms → user overrides)
    via get_user_permissions() with Redis caching.
    """

    async def _check_permission(
        request: Request,
        current_user: User = Depends(get_current_user),
        entity_id: UUID = Depends(get_current_entity),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        context = await resolve_acting_context(request, current_user, entity_id, db)
        permissions = context.permissions

        if permission_code not in permissions and "*" not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_code}",
            )

    return Depends(_check_permission)


def require_any_permission(*permission_codes: str):
    """Factory returning a dependency that checks user has at least one permission.

    Uses the full 3-layer RBAC resolution via get_user_permissions().
    """

    async def _check_permissions(
        request: Request,
        current_user: User = Depends(get_current_user),
        entity_id: UUID = Depends(get_current_entity),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        context = await resolve_acting_context(request, current_user, entity_id, db)
        permissions = context.permissions

        if "*" not in permissions and not any(
            code in permissions for code in permission_codes
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: one of {', '.join(permission_codes)}",
            )

    return Depends(_check_permissions)


def require_module_enabled(module_slug: str):
    """Factory returning a dependency that blocks access when a module is disabled for the entity."""

    async def _check_module_enabled(
        request: Request,
        current_user: User | None = Depends(get_optional_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        entity_id: UUID | None = None

        x_entity_id = request.headers.get("X-Entity-ID")
        if x_entity_id:
            try:
                entity_id = UUID(x_entity_id)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid X-Entity-ID header",
                ) from exc
        elif current_user and current_user.default_entity_id:
            entity_id = current_user.default_entity_id

        # Public external Pax routes must still be module-gated, but they do not
        # carry a bearer token. Resolve the entity through the external link token.
        if (
            entity_id is None
            and module_slug == "paxlog"
            and "/api/v1/pax/external/" in request.url.path
        ):
            from app.models.paxlog import Ads, ExternalAccessLink

            token = request.path_params.get("token")
            if token:
                result = await db.execute(
                    select(Ads.entity_id)
                    .select_from(ExternalAccessLink)
                    .join(Ads, Ads.id == ExternalAccessLink.ads_id)
                    .where(
                        ExternalAccessLink.token == token,
                        ExternalAccessLink.revoked == False,  # noqa: E712
                    )
                    .limit(1)
                )
                entity_id = result.scalar_one_or_none()

        # Public PackLog tracking routes have the same shape: anyone with a
        # tracking code (cargo or voyage) can hit them without auth.
        # Resolve the entity by looking up the cargo or voyage and reading
        # its entity_id. The caller learns nothing about other tenants
        # because the tracking_code is unique per cargo and the entity is
        # used only for module-gating, not for content filtering.
        if (
            entity_id is None
            and module_slug == "packlog"
            and "/api/v1/packlog/public/" in request.url.path
        ):
            from app.models.packlog import CargoItem
            from app.models.travelwiz import Voyage

            tracking_code = request.path_params.get("tracking_code")
            if tracking_code:
                result = await db.execute(
                    select(CargoItem.entity_id)
                    .where(CargoItem.tracking_code == tracking_code)
                    .limit(1)
                )
                entity_id = result.scalar_one_or_none()
            else:
                voyage_code = request.path_params.get("voyage_code")
                if voyage_code:
                    result = await db.execute(
                        select(Voyage.entity_id)
                        .where(Voyage.code == voyage_code)
                        .limit(1)
                    )
                    entity_id = result.scalar_one_or_none()

        if entity_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No entity context for module check",
            )

        if not await is_module_enabled(db, entity_id, module_slug):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Module unavailable: {module_slug}",
            )

    return Depends(_check_module_enabled)


async def has_user_permission(
    user: User,
    entity_id: UUID,
    permission_code: str,
    db: AsyncSession,
) -> bool:
    """Check if user has a specific permission (non-raising).

    Returns True if user has the permission or wildcard '*'.
    Uses the full 3-layer RBAC resolution via get_user_permissions().
    Used for conditional query scoping (e.g., read_all vs own data).
    """
    from app.core.rbac import get_user_permissions

    permissions = await get_user_permissions(user.id, entity_id, db)
    return permission_code in permissions or "*" in permissions


# Permission mapping for polymorphic owner types
# Mapping of owner_type → (SQLAlchemy model, entity-scoped?).
# Used to validate that the target row actually exists before accepting
# a polymorphic write (attachment, note, tag, etc.). Without this check
# a client can POST attachments with any random UUID and create orphan
# rows (storage DoS + silent corruption).
def _resolve_owner_model(owner_type: str):
    """Return (Model, entity_scoped: bool) for the given owner_type,
    or (None, False) if unknown. Imports are local so we don't create
    circular dependencies at module-import time."""
    if owner_type == "tier":
        from app.models.common import Tier
        return (Tier, True)
    if owner_type == "tier_contact":
        from app.models.common import TierContact
        return (TierContact, True)
    if owner_type == "entity":
        from app.models.common import Entity
        return (Entity, False)
    if owner_type == "ads":
        from app.models.paxlog import Ads
        return (Ads, True)
    if owner_type in ("cargo_item", "cargo"):
        from app.models.packlog import CargoItem
        return (CargoItem, True)
    if owner_type == "cargo_request":
        from app.models.packlog import CargoRequest
        return (CargoRequest, True)
    if owner_type == "project":
        from app.models.common import Project
        return (Project, True)
    if owner_type == "project_task":
        from app.models.common import ProjectTask
        return (ProjectTask, True)
    if owner_type == "voyage":
        from app.models.travelwiz import Voyage
        return (Voyage, True)
    if owner_type == "vector":
        from app.models.travelwiz import TransportVector
        return (TransportVector, True)
    if owner_type == "rotation":
        from app.models.travelwiz import TransportRotation
        return (TransportRotation, True)
    if owner_type == "manifest":
        from app.models.travelwiz import VoyageManifest
        return (VoyageManifest, False)  # manifests linked via voyage
    if owner_type == "support_ticket":
        from app.models.support import SupportTicket
        return (SupportTicket, True)
    if owner_type == "document":
        from app.models.papyrus_document_core import Document
        return (Document, True)
    if owner_type == "planner_activity":
        from app.models.planner import PlannerActivity
        return (PlannerActivity, True)
    if owner_type == "moc":
        from app.models.moc import MOC
        return (MOC, True)
    # Unmapped (asset, medical_check, passport, etc.) fall through to
    # permission-only check upstream. Doesn't close the orphan loophole
    # for those types but doesn't regress them either.
    return (None, False)


async def _assert_owner_row_exists(
    owner_type: str,
    owner_id: UUID,
    entity_id: UUID | None,
    db: AsyncSession,
) -> None:
    """404 if the polymorphic owner row doesn't exist."""
    Model, entity_scoped = _resolve_owner_model(owner_type)
    if Model is None:
        return  # unmapped types: rely on permission check alone
    query = select(Model.id).where(Model.id == owner_id)
    if entity_scoped and entity_id is not None and hasattr(Model, "entity_id"):
        query = query.where(Model.entity_id == entity_id)
    result = await db.execute(query.limit(1))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{owner_type} not found",
        )


_OWNER_PERMISSION_MAP: dict[str, tuple[str, str]] = {
    # owner_type: (read_permission, write_permission)
    "tier": ("tiers.read", "tiers.update"),
    "tier_contact": ("tiers.read", "tiers.update"),
    "entity": ("core.entity.read", "core.entity.update"),
    "asset": ("assets.read", "assets.update"),
    "compliance_rule": ("conformite.rule.read", "conformite.rule.update"),
    "compliance_type": ("conformite.type.read", "conformite.type.update"),
    "compliance_record": ("conformite.record.read", "conformite.record.update"),
    "compliance_exemption": ("conformite.exemption.read", "conformite.exemption.approve"),
    "job_position": ("conformite.jobposition.read", "conformite.jobposition.update"),
    # User sub-models (medical, passports, etc.) — accessed via user permissions
    "medical_check": ("core.users.read", "core.users.manage"),
    "passport": ("core.users.read", "core.users.manage"),
    "visa": ("core.users.read", "core.users.manage"),
    "social_security": ("core.users.read", "core.users.manage"),
    "vaccine": ("core.users.read", "core.users.manage"),
    "driving_license": ("core.users.read", "core.users.manage"),
    "emergency_contact": ("core.users.read", "core.users.manage"),
    # Support tickets
    "support_ticket": ("support.ticket.read", "support.ticket.update"),
    "ticket_comment": ("support.ticket.read", "support.comment.create"),
    # PaxLog
    "ads": ("paxlog.ads.read", "paxlog.ads.update"),
    # Projets — projects and their sub-tasks can carry polymorphic notes,
    # attachments, tags, addresses via the shared managers.
    "project": ("project.read", "project.update"),
    "project_task": ("project.task.read", "project.task.update"),
    "project_milestone": ("project.read", "project.milestone.manage"),
    "project_wbs_node": ("project.read", "project.update"),
    # Planner — activities carry attachments, notes, tags via the shared managers
    "planner_activity": ("planner.activity.read", "planner.activity.update"),
    # PackLog / cargo
    "cargo_item": ("packlog.cargo.read", "packlog.cargo.update"),
    "cargo": ("packlog.cargo.read", "packlog.cargo.update"),
    "cargo_request": ("packlog.cargo.read", "packlog.cargo.update"),
    # TravelWiz — voyages, vectors, manifests, rotations carry attachments/notes/tags
    "voyage": ("travelwiz.voyage.read", "travelwiz.voyage.update"),
    "vector": ("travelwiz.vector.read", "travelwiz.vector.update"),
    "manifest": ("travelwiz.voyage.read", "travelwiz.voyage.update"),
    "rotation": ("travelwiz.voyage.read", "travelwiz.voyage.update"),
    # Papyrus documents
    "document": ("document.read", "document.edit"),
    # MOC — attachments (PIDs, ESD, photos, études) + notes piggyback on
    # the read/update perms. A user who can read the MOC can list its
    # attachments; a user who can update can upload/delete.
    "moc": ("moc.read", "moc.update"),
}

# Auto-fallback for `{module}_staging` owner types: any module present in
# `_OWNER_PERMISSION_MAP` automatically gets a matching `*_staging` entry
# that requires the **write** permission (staging is an act of creation).
# This means every Create panel can use the staging pattern without the
# admin having to register each `_staging` explicitly.
#
# Usage: e.g. `owner_type="project_staging"` will resolve to
# `("project.update", "project.update")` at runtime via the helper below.


async def check_polymorphic_owner_access(
    owner_type: str,
    owner_id: UUID,
    current_user: User,
    db: AsyncSession,
    request: Request | None = None,
    *,
    write: bool = False,
) -> None:
    """Validate current user has access to the polymorphic parent object.

    For user-owned data: self-service or core.users.manage.
    For other owner types: maps to the appropriate module permission.
    """
    if owner_type == "user":
        await check_user_data_access(owner_id, current_user, db, request)
        return

    perms = _OWNER_PERMISSION_MAP.get(owner_type)
    if not perms and owner_type.endswith("_staging"):
        # Generic staging fallback — any `{module}_staging` inherits the
        # base module's WRITE permission for both read & write operations.
        # Only the user who staged a row may access it (enforced by the
        # staging-scoped APIs themselves via uploaded_by/created_by).
        base = owner_type[: -len("_staging")]
        base_perms = _OWNER_PERMISSION_MAP.get(base)
        if base_perms:
            perms = (base_perms[1], base_perms[1])
    if not perms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported owner type: {owner_type}",
        )

    permission_code = perms[1] if write else perms[0]

    # Resolve entity context
    entity_id: UUID | None = None
    if request:
        raw = request.headers.get("X-Entity-ID")
        if raw:
            try:
                entity_id = UUID(raw)
            except ValueError:
                pass
    if not entity_id and current_user.default_entity_id:
        entity_id = current_user.default_entity_id

    if not entity_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No entity context for permission check",
        )

    if owner_type == "ads":
        from app.models.paxlog import Ads

        result = await db.execute(
            select(Ads).where(Ads.id == owner_id, Ads.entity_id == entity_id)
        )
        ads = result.scalar_one_or_none()
        if ads is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="AdS not found",
            )

        acting_user_id: UUID | None = None
        if request and entity_id:
            try:
                acting_context = await resolve_acting_context(
                    request, current_user, entity_id, db
                )
                acting_user_id = acting_context.target_user_id
            except HTTPException:
                acting_user_id = None

        if (
            ads.requester_id == current_user.id
            or ads.created_by == current_user.id
            or (acting_user_id and (ads.requester_id == acting_user_id or ads.created_by == acting_user_id))
        ):
            return

        if write:
            if await has_user_permission(current_user, entity_id, "paxlog.ads.update", db):
                return
            if await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db):
                return
        else:
            if await has_user_permission(current_user, entity_id, "paxlog.ads.read", db):
                return
            if await has_user_permission(current_user, entity_id, "paxlog.ads.read_all", db):
                return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )

    if not await has_user_permission(current_user, entity_id, permission_code, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )

    # Now that permissions pass, verify the target row actually exists.
    # This closes the orphan-attachment loophole (CONC-003) where a
    # permitted user could POST attachments against arbitrary UUIDs.
    await _assert_owner_row_exists(owner_type, owner_id, entity_id, db)


async def check_user_data_access(
    user_id: UUID,
    current_user: User,
    db: AsyncSession,
    request: Request | None = None,
) -> None:
    """Ensure current user can access target user's personal data.

    Self-service (user_id == current_user.id) is always allowed.
    Managing another user's data requires core.users.manage permission.
    """
    if current_user.id == user_id:
        return  # self-service always allowed

    # Resolve entity context for RBAC check
    entity_id: UUID | None = None
    if request:
        raw = request.headers.get("X-Entity-ID")
        if raw:
            try:
                entity_id = UUID(raw)
            except ValueError:
                pass
    if not entity_id and current_user.default_entity_id:
        entity_id = current_user.default_entity_id

    if request and entity_id:
        try:
            acting_context = await resolve_acting_context(request, current_user, entity_id, db)
            if acting_context.target_user_id == user_id:
                return
        except HTTPException:
            pass

    if entity_id and await has_user_permission(current_user, entity_id, "core.users.manage", db):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Permission denied",
    )


async def check_verified_lock(
    record,
    current_user: User,
    *,
    allow_permission: str = "conformite.verify",
    entity_id=None,
    db=None,
) -> None:
    """Block updates on verified records unless user has the allow_permission.

    Raises 403 if the record is locked (verification_status == 'verified')
    and the current user doesn't have the required permission.
    """
    if not hasattr(record, 'verification_status'):
        return  # model doesn't use VerifiableMixin
    if record.verification_status != "verified":
        return  # not locked, allow edit

    # Record is verified/locked — check if user has override permission
    if entity_id and db:
        has_perm = await _has_permission(current_user, allow_permission, entity_id, db)
        if has_perm:
            return  # user has override permission, allow edit

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Cet enregistrement est vérifié et verrouillé. Seul un responsable conformité peut le modifier.",
    )
