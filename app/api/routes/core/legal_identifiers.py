"""Legal identifier routes — polymorphic CRUD for legal/fiscal identifiers."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.models.common import LegalIdentifier, User
from app.schemas.common import LegalIdentifierCreate, LegalIdentifierRead, LegalIdentifierUpdate
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/legal-identifiers", tags=["legal-identifiers"])


@router.get("/{owner_type}/{owner_id}", response_model=list[LegalIdentifierRead])
async def list_legal_identifiers(
    owner_type: str,
    owner_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LegalIdentifier)
        .where(LegalIdentifier.owner_type == owner_type, LegalIdentifier.owner_id == owner_id)
        .order_by(LegalIdentifier.type)
    )
    return result.scalars().all()


@router.post("/{owner_type}/{owner_id}", response_model=LegalIdentifierRead, status_code=201)
async def create_legal_identifier(
    owner_type: str,
    owner_id: UUID,
    body: LegalIdentifierCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    obj = LegalIdentifier(**body.model_dump(), owner_type=owner_type, owner_id=owner_id)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/{ident_id}", response_model=LegalIdentifierRead)
async def update_legal_identifier(
    ident_id: UUID,
    body: LegalIdentifierUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LegalIdentifier).where(LegalIdentifier.id == ident_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LEGAL_IDENTIFIER_NOT_FOUND",
            message="Legal identifier not found",
        )
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise StructuredHTTPException(
            400,
            code="NO_FIELDS_UPDATE",
            message="No fields to update",
        )
    for field, value in update_data.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{ident_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_legal_identifier(
    ident_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LegalIdentifier).where(LegalIdentifier.id == ident_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise StructuredHTTPException(
            404,
            code="LEGAL_IDENTIFIER_NOT_FOUND",
            message="Legal identifier not found",
        )
    await delete_entity(obj, db, "legal_identifier", entity_id=obj.id, user_id=current_user.id)
    await db.commit()
