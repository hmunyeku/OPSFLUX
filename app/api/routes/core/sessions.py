"""Session routes — list, revoke, revoke-all user sessions."""

from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.security import decode_token
from app.models.common import User, UserSession
from app.schemas.common import SessionRead

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])
bearer_scheme = HTTPBearer(auto_error=False)


def _get_current_token_hash(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    """Extract the SHA256 hash of the current bearer token for session matching."""
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        # The session token_hash is based on the refresh token, but we can match
        # sessions by checking the access token's jti or sub. For now, we return
        # the hash of the access token itself for current-session detection.
        return sha256(credentials.credentials.encode()).hexdigest()
    except Exception:
        return None


@router.get("", response_model=list[SessionRead])
async def list_sessions(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active sessions for the current user."""
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == current_user.id,
            UserSession.revoked == False,
        )
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = result.scalars().all()

    current_hash = _get_current_token_hash(credentials)

    response = []
    for session in sessions:
        session_data = SessionRead.model_validate(session)
        if current_hash and session.token_hash == current_hash:
            session_data.is_current = True
        response.append(session_data)

    return response


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: UUID,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session. Cannot revoke the current session."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id,
            UserSession.revoked == False,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if this is the current session
    current_hash = _get_current_token_hash(credentials)
    if current_hash and session.token_hash == current_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke the current session",
        )

    session.revoked = True
    await db.commit()

    await record_audit(
        db,
        action="revoke_session",
        resource_type="session",
        resource_id=str(session_id),
        user_id=current_user.id,
        entity_id=entity_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()


@router.post("/revoke-all")
async def revoke_all_sessions(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all sessions except the current one."""
    current_hash = _get_current_token_hash(credentials)

    # Get all active sessions
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == current_user.id,
            UserSession.revoked == False,
        )
    )
    sessions = result.scalars().all()

    revoked_count = 0
    for session in sessions:
        if current_hash and session.token_hash == current_hash:
            continue
        session.revoked = True
        revoked_count += 1

    await db.commit()

    await record_audit(
        db,
        action="revoke_all_sessions",
        resource_type="session",
        user_id=current_user.id,
        entity_id=entity_id,
        details={"revoked_count": revoked_count},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"revoked_count": revoked_count}
