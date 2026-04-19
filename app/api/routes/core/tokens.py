"""Personal access token routes — list, create, revoke."""

import secrets
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import PersonalAccessToken, User
from app.schemas.common import (
    PaginatedResponse,
    TokenCreate,
    TokenCreatedResponse,
    TokenRead,
)
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/tokens", tags=["tokens"])


@router.get("", response_model=PaginatedResponse[TokenRead])
async def list_tokens(
    pagination: PaginationParams = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List personal access tokens for the current user."""
    query = (
        select(PersonalAccessToken)
        .where(PersonalAccessToken.user_id == current_user.id)
        .order_by(PersonalAccessToken.created_at.desc())
    )
    return await paginate(db, query, pagination)


@router.post("", response_model=TokenCreatedResponse, status_code=201)
async def create_token(
    body: TokenCreate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a personal access token. The full token is returned ONLY once."""
    # Generate a secure random token
    raw_token = secrets.token_hex(32)
    token_hash = sha256(raw_token.encode()).hexdigest()
    token_prefix = raw_token[:8]

    pat = PersonalAccessToken(
        user_id=current_user.id,
        name=body.name,
        token_hash=token_hash,
        token_prefix=token_prefix,
        scopes=body.scopes,
        expires_at=body.expires_at,
    )
    db.add(pat)
    await db.commit()
    await db.refresh(pat)

    await record_audit(
        db,
        action="create",
        resource_type="personal_access_token",
        resource_id=str(pat.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": body.name, "scopes": body.scopes},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return TokenCreatedResponse(
        id=pat.id,
        name=pat.name,
        token=raw_token,
        scopes=pat.scopes,
        expires_at=pat.expires_at,
        created_at=pat.created_at,
    )


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a personal access token (soft revoke, not physical delete)."""
    result = await db.execute(
        select(PersonalAccessToken).where(
            PersonalAccessToken.id == token_id,
            PersonalAccessToken.user_id == current_user.id,
        )
    )
    pat = result.scalar_one_or_none()
    if not pat:
        raise StructuredHTTPException(
            404,
            code="TOKEN_NOT_FOUND",
            message="Token not found",
        )

    pat.revoked = True
    await db.commit()

    await record_audit(
        db,
        action="revoke",
        resource_type="personal_access_token",
        resource_id=str(token_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": pat.name},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
