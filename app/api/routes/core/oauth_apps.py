"""OAuth application routes — manage apps and authorizations."""

import secrets
from hashlib import sha256
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.deps import get_current_entity, get_current_user
from app.core.audit import record_audit
from app.core.database import get_db
from app.models.common import OAuthApplication, OAuthAuthorization, User
from app.schemas.common import (
    OAuthAppCreate,
    OAuthAppCreatedResponse,
    OAuthAppRead,
    OAuthAuthorizationRead,
)

router = APIRouter(prefix="/api/v1/oauth", tags=["oauth"])


@router.get("/applications", response_model=list[OAuthAppRead])
async def list_oauth_apps(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List OAuth applications created by the current user."""
    result = await db.execute(
        select(OAuthApplication)
        .where(
            OAuthApplication.user_id == current_user.id,
            OAuthApplication.active == True,
        )
        .order_by(OAuthApplication.created_at.desc())
    )
    return result.scalars().all()


@router.post("/applications", response_model=OAuthAppCreatedResponse, status_code=201)
async def create_oauth_app(
    body: OAuthAppCreate,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an OAuth application. The client_secret is returned ONLY once."""
    client_id = secrets.token_urlsafe(32)
    client_secret = None
    client_secret_hash = None

    if body.confidential:
        client_secret = secrets.token_urlsafe(48)
        client_secret_hash = sha256(client_secret.encode()).hexdigest()

    oauth_app = OAuthApplication(
        user_id=current_user.id,
        name=body.name,
        client_id=client_id,
        client_secret_hash=client_secret_hash,
        redirect_uris=body.redirect_uris,
        scopes=body.scopes,
        confidential=body.confidential,
    )
    db.add(oauth_app)
    await db.commit()
    await db.refresh(oauth_app)

    await record_audit(
        db,
        action="create",
        resource_type="oauth_application",
        resource_id=str(oauth_app.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": body.name, "client_id": client_id},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return OAuthAppCreatedResponse(
        id=oauth_app.id,
        name=oauth_app.name,
        client_id=oauth_app.client_id,
        client_secret=client_secret,
        redirect_uris=oauth_app.redirect_uris,
        scopes=oauth_app.scopes,
        confidential=oauth_app.confidential,
    )


@router.delete("/applications/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_oauth_app(
    app_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate an OAuth application (set active=False)."""
    result = await db.execute(
        select(OAuthApplication).where(
            OAuthApplication.id == app_id,
            OAuthApplication.user_id == current_user.id,
        )
    )
    oauth_app = result.scalar_one_or_none()
    if not oauth_app:
        raise HTTPException(status_code=404, detail="OAuth application not found")

    oauth_app.active = False
    await db.commit()

    await record_audit(
        db,
        action="deactivate",
        resource_type="oauth_application",
        resource_id=str(app_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": oauth_app.name},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()


@router.get("/authorizations", response_model=list[OAuthAuthorizationRead])
async def list_authorizations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List third-party apps authorized by the current user."""
    result = await db.execute(
        select(OAuthAuthorization)
        .options(joinedload(OAuthAuthorization.application))
        .where(
            OAuthAuthorization.user_id == current_user.id,
            OAuthAuthorization.revoked == False,
        )
        .order_by(OAuthAuthorization.created_at.desc())
    )
    return result.scalars().unique().all()


@router.delete("/authorizations/{auth_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_authorization(
    auth_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an OAuth authorization (set revoked=True)."""
    result = await db.execute(
        select(OAuthAuthorization).where(
            OAuthAuthorization.id == auth_id,
            OAuthAuthorization.user_id == current_user.id,
            OAuthAuthorization.revoked == False,
        )
    )
    auth = result.scalar_one_or_none()
    if not auth:
        raise HTTPException(status_code=404, detail="Authorization not found")

    auth.revoked = True
    await db.commit()

    await record_audit(
        db,
        action="revoke",
        resource_type="oauth_authorization",
        resource_id=str(auth_id),
        user_id=current_user.id,
        entity_id=entity_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
