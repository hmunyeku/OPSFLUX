"""Social network routes — polymorphic social links for any object."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.api.deps import check_polymorphic_owner_access, get_current_user
from app.core.database import get_db
from app.models.common import SocialNetwork, User
from app.schemas.common import SocialNetworkCreate, SocialNetworkRead, SocialNetworkUpdate
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/social-networks", tags=["social-networks"])


@router.get("", response_model=list[SocialNetworkRead])
async def list_social_networks(
    owner_type: str = Query(...),
    owner_id: UUID = Query(...),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_polymorphic_owner_access(owner_type, owner_id, current_user, db, request, write=False)
    result = await db.execute(
        select(SocialNetwork)
        .where(SocialNetwork.owner_type == owner_type, SocialNetwork.owner_id == owner_id)
        .order_by(SocialNetwork.sort_order, SocialNetwork.network)
    )
    return result.scalars().all()


@router.post("", response_model=SocialNetworkRead, status_code=201)
async def create_social_network(
    body: SocialNetworkCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_polymorphic_owner_access(body.owner_type, body.owner_id, current_user, db, request, write=True)
    sn = SocialNetwork(**body.model_dump())
    db.add(sn)
    await db.commit()
    await db.refresh(sn)
    return sn


@router.patch("/{item_id}", response_model=SocialNetworkRead)
async def update_social_network(
    item_id: UUID,
    body: SocialNetworkUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialNetwork).where(SocialNetwork.id == item_id))
    sn = result.scalar_one_or_none()
    if not sn:
        raise HTTPException(status_code=404, detail="Social network not found")
    await check_polymorphic_owner_access(sn.owner_type, sn.owner_id, current_user, db, request, write=True)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(sn, field, value)
    await db.commit()
    await db.refresh(sn)
    return sn


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_social_network(
    item_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialNetwork).where(SocialNetwork.id == item_id))
    sn = result.scalar_one_or_none()
    if not sn:
        raise HTTPException(status_code=404, detail="Social network not found")
    await check_polymorphic_owner_access(sn.owner_type, sn.owner_id, current_user, db, request, write=True)
    await delete_entity(sn, db, "social_network", entity_id=sn.id, user_id=current_user.id)
    await db.commit()
