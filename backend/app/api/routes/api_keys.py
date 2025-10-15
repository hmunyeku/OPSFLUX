import uuid
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
)
from app.models import (
    ApiKey,
    ApiKeyCreate,
    ApiKeyPublic,
    ApiKeysPublic,
    ApiKeyUpdate,
    Message,
)

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def generate_api_key(key_type: str = "secret", environment: str = "production") -> str:
    """Generate a new API key with prefix based on type and environment."""
    # Prefix format: sk_env_random or pk_env_random
    prefix = "sk" if key_type == "secret" else "pk"
    env_prefix = environment[:4].lower()  # prod, test, dev

    # Generate 32 random bytes and convert to hex (64 characters)
    random_part = secrets.token_hex(32)

    return f"{prefix}_{env_prefix}_{random_part}"


def mask_api_key(key: str) -> str:
    """Mask API key showing only first 7 and last 4 characters."""
    if len(key) < 12:
        return key[:4] + "..." + key[-2:]
    return key[:7] + "..." + key[-4:]


@router.get("/", response_model=ApiKeysPublic)
def read_api_keys(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve API keys for current user.
    """
    count_statement = (
        select(func.count())
        .select_from(ApiKey)
        .where(ApiKey.user_id == current_user.id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .order_by(ApiKey.created_at.desc())
    )
    api_keys = session.exec(statement).all()

    # Convert to public model with masked keys
    public_keys = []
    for key in api_keys:
        public_keys.append(
            ApiKeyPublic(
                id=key.id,
                name=key.name,
                key_preview=mask_api_key(key.key),
                environment=key.environment,
                key_type=key.key_type,
                is_active=key.is_active,
                user_id=key.user_id,
                created_at=key.created_at.isoformat() if key.created_at else None,
            )
        )

    return ApiKeysPublic(data=public_keys, count=count)


@router.post("/", response_model=dict)
def create_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    api_key_in: ApiKeyCreate,
) -> Any:
    """
    Create new API key for current user.
    Returns the full key only once - it won't be shown again.
    """
    # Generate the API key
    key = generate_api_key(
        key_type=api_key_in.key_type,
        environment=api_key_in.environment
    )

    # Create the API key record
    db_api_key = ApiKey(
        name=api_key_in.name,
        key=key,  # In production, this should be hashed
        environment=api_key_in.environment,
        key_type=api_key_in.key_type,
        is_active=True,
        user_id=current_user.id,
    )

    session.add(db_api_key)
    session.commit()
    session.refresh(db_api_key)

    # Return the full key only this once
    return {
        "id": db_api_key.id,
        "name": db_api_key.name,
        "key": key,  # Full key shown only once
        "key_preview": mask_api_key(key),
        "environment": db_api_key.environment,
        "key_type": db_api_key.key_type,
        "is_active": db_api_key.is_active,
        "user_id": db_api_key.user_id,
        "created_at": db_api_key.created_at.isoformat() if db_api_key.created_at else None,
        "message": "Save this key securely - it won't be shown again!",
    }


@router.get("/{api_key_id}", response_model=ApiKeyPublic)
def read_api_key(
    api_key_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific API key by id.
    """
    api_key = session.get(ApiKey, api_key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    if api_key.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this API key",
        )

    return ApiKeyPublic(
        id=api_key.id,
        name=api_key.name,
        key_preview=mask_api_key(api_key.key),
        environment=api_key.environment,
        key_type=api_key.key_type,
        is_active=api_key.is_active,
        user_id=api_key.user_id,
        created_at=api_key.created_at.isoformat() if api_key.created_at else None,
    )


@router.patch("/{api_key_id}", response_model=ApiKeyPublic)
def update_api_key(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    api_key_id: uuid.UUID,
    api_key_in: ApiKeyUpdate,
) -> Any:
    """
    Update an API key (name or active status only).
    """
    db_api_key = session.get(ApiKey, api_key_id)
    if not db_api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    if db_api_key.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to update this API key",
        )

    # Update only provided fields
    update_data = api_key_in.model_dump(exclude_unset=True)
    db_api_key.sqlmodel_update(update_data)

    session.add(db_api_key)
    session.commit()
    session.refresh(db_api_key)

    return ApiKeyPublic(
        id=db_api_key.id,
        name=db_api_key.name,
        key_preview=mask_api_key(db_api_key.key),
        environment=db_api_key.environment,
        key_type=db_api_key.key_type,
        is_active=db_api_key.is_active,
        user_id=db_api_key.user_id,
        created_at=db_api_key.created_at.isoformat() if db_api_key.created_at else None,
    )


@router.delete("/{api_key_id}", response_model=Message)
def delete_api_key(
    session: SessionDep,
    current_user: CurrentUser,
    api_key_id: uuid.UUID,
) -> Message:
    """
    Delete an API key.
    """
    api_key = session.get(ApiKey, api_key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    if api_key.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this API key",
        )

    session.delete(api_key)
    session.commit()
    return Message(message="API key deleted successfully")
