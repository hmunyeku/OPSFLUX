from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import get_user_permissions
from app.models.common import User, UserDelegation

ACTING_CONTEXT_HEADER = "X-Acting-Context"


@dataclass(slots=True)
class ResolvedActingContext:
    key: str
    mode: str
    permissions: set[str]
    target_user_id: UUID | None = None
    cumulative: bool = False
    target_user: User | None = None
    delegation: UserDelegation | None = None


def parse_acting_context_header(value: str | None) -> tuple[str, UUID | None]:
    if not value or value == "own":
        return ("own", None)

    parts = value.split(":", 1)
    if len(parts) != 2 or parts[0] not in {"delegate", "simulate"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid acting context header",
        )

    try:
        return (parts[0], UUID(parts[1]))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid acting context target",
        ) from exc


async def resolve_acting_context(
    request: Request | None,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> ResolvedActingContext:
    mode, target_user_id = parse_acting_context_header(
        request.headers.get(ACTING_CONTEXT_HEADER) if request is not None else None
    )
    own_permissions = await get_user_permissions(current_user.id, entity_id, db)

    if mode == "own" or target_user_id is None:
        return ResolvedActingContext(
            key="own",
            mode="own",
            permissions=own_permissions,
        )

    target_user = await db.get(User, target_user_id)
    if not target_user or not target_user.active:
        raise HTTPException(status_code=404, detail="Target user not found")

    if mode == "delegate":
        now = datetime.now(UTC)
        result = await db.execute(
            select(UserDelegation).where(
                UserDelegation.delegator_id == target_user_id,
                UserDelegation.delegate_id == current_user.id,
                UserDelegation.entity_id == entity_id,
                UserDelegation.active == True,  # noqa: E712
                UserDelegation.start_date <= now,
                UserDelegation.end_date >= now,
            )
        )
        delegation = result.scalar_one_or_none()
        if delegation is None:
            raise HTTPException(status_code=403, detail="Delegation not available")

        delegator_permissions = await get_user_permissions(target_user_id, entity_id, db)
        delegated_permissions = set(delegation.permissions or []).intersection(
            delegator_permissions
        )
        return ResolvedActingContext(
            key=f"delegate:{target_user_id}",
            mode="delegate",
            permissions=own_permissions.union(delegated_permissions),
            target_user_id=target_user_id,
            cumulative=True,
            target_user=target_user,
            delegation=delegation,
        )

    if "*" not in own_permissions and "admin.system" not in own_permissions:
        raise HTTPException(status_code=403, detail="Simulation not allowed")

    simulated_permissions = await get_user_permissions(target_user_id, entity_id, db)
    return ResolvedActingContext(
        key=f"simulate:{target_user_id}",
        mode="simulate",
        permissions=simulated_permissions,
        target_user_id=target_user_id,
        cumulative=False,
        target_user=target_user,
    )


async def get_acting_target_user_id(
    request: Request | None,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> UUID | None:
    if request is None:
        return None
    context = await resolve_acting_context(request, current_user, entity_id, db)
    return context.target_user_id


async def get_effective_actor_user_id(
    request: Request | None,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> UUID:
    if request is None:
        return current_user.id
    return (await get_acting_target_user_id(request, current_user, entity_id, db)) or current_user.id
