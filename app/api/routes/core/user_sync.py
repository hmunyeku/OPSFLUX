"""
User sync routes — import users from external identity providers.

Endpoints:
  GET  /api/v1/user-sync/providers   — list configured providers
  POST /api/v1/user-sync/preview     — fetch users from provider (dry-run)
  POST /api/v1/user-sync/execute     — import selected users
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.security import hash_password
from app.models.common import User, Setting, UserGroup, UserGroupMember
from app.services.connectors.user_sync_service import (
    PROVIDER_REGISTRY,
    PROVIDER_SETTINGS_PREFIX,
    get_provider,
)
from app.core.errors import StructuredHTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/user-sync", tags=["user-sync"])


# ── Schemas ───────────────────────────────────────────────────

class ProviderInfo(BaseModel):
    id: str
    label: str
    configured: bool
    last_sync_at: str | None = None


class PreviewRequest(BaseModel):
    provider: str


class PreviewUser(BaseModel):
    external_ref: str
    email: str
    first_name: str
    last_name: str
    department: str | None = None
    position: str | None = None
    phone: str | None = None
    groups: list[str] = []
    active: bool = True
    already_exists: bool = False


class PreviewResponse(BaseModel):
    provider: str
    total: int
    users: list[PreviewUser]
    new_count: int
    existing_count: int


class GroupMappingEntry(BaseModel):
    source_group: str
    target_group_id: str | None = None


class ExecuteRequest(BaseModel):
    provider: str
    selected_emails: list[str]  # emails of users to import
    group_mapping: list[GroupMappingEntry] = []
    duplicate_strategy: str = "skip"  # skip | update
    default_password: str = "Changeme123!"  # temporary password


class ExecuteResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]


# ── Helper: read provider settings from DB ────────────────────

async def _get_provider_settings(db: AsyncSession, prefix: str) -> dict[str, str]:
    """Read all settings with given prefix and return as flat dict."""
    result = await db.execute(
        select(Setting).where(Setting.key.startswith(prefix + "."))
    )
    settings: dict[str, str] = {}
    for row in result.scalars():
        # key = "integration.ldap.server_url" → field = "server_url"
        field = row.key[len(prefix) + 1:]
        val = row.value
        if isinstance(val, dict):
            val = val.get("v", "")
        settings[field] = str(val) if val else ""
    return settings


# ── Routes ────────────────────────────────────────────────────

@router.get("/providers", response_model=list[ProviderInfo], dependencies=[require_permission("admin.users.read")])
async def list_providers(
    db: AsyncSession = Depends(get_db),
):
    """List available user sync providers and their configuration status."""
    providers: list[ProviderInfo] = []

    for pid, cls in PROVIDER_REGISTRY.items():
        prefix = PROVIDER_SETTINGS_PREFIX.get(pid, "")
        settings = await _get_provider_settings(db, prefix) if prefix else {}

        # Check if minimally configured (has at least one non-empty setting)
        configured = any(v.strip() for v in settings.values())

        last_sync = settings.get("last_user_sync_at")

        providers.append(ProviderInfo(
            id=pid,
            label=cls.label,
            configured=configured,
            last_sync_at=last_sync,
        ))

    return providers


@router.post("/preview", response_model=PreviewResponse, dependencies=[require_permission("admin.users.create")])
async def preview_sync(
    body: PreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Fetch users from external provider without importing (dry-run)."""
    prefix = PROVIDER_SETTINGS_PREFIX.get(body.provider)
    if not prefix:
        from fastapi import HTTPException
        raise StructuredHTTPException(
            400,
            code="UNKNOWN_PROVIDER",
            message="Unknown provider: {provider}",
            params={
                "provider": body.provider,
            },
        )

    settings = await _get_provider_settings(db, prefix)
    provider = get_provider(body.provider, settings)

    # Fetch from external system
    ext_users = await provider.fetch_users()

    # Check which emails already exist in DB
    existing_emails_result = await db.execute(select(User.email))
    existing_emails = {row[0].lower() for row in existing_emails_result}

    preview_users: list[PreviewUser] = []
    new_count = 0
    existing_count = 0

    for u in ext_users:
        exists = u.email.lower() in existing_emails
        if exists:
            existing_count += 1
        else:
            new_count += 1

        preview_users.append(PreviewUser(
            external_ref=u.external_ref,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            department=u.department,
            position=u.position,
            phone=u.phone,
            groups=u.groups,
            active=u.active,
            already_exists=exists,
        ))

    return PreviewResponse(
        provider=body.provider,
        total=len(preview_users),
        users=preview_users,
        new_count=new_count,
        existing_count=existing_count,
    )


@router.post("/execute", response_model=ExecuteResponse, dependencies=[require_permission("admin.users.create")])
async def execute_sync(
    body: ExecuteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import selected users from external provider."""
    prefix = PROVIDER_SETTINGS_PREFIX.get(body.provider)
    if not prefix:
        from fastapi import HTTPException
        raise StructuredHTTPException(
            400,
            code="UNKNOWN_PROVIDER",
            message="Unknown provider: {provider}",
            params={
                "provider": body.provider,
            },
        )

    settings = await _get_provider_settings(db, prefix)
    provider = get_provider(body.provider, settings)

    # Fetch from external system
    ext_users = await provider.fetch_users()

    # Filter to selected emails
    selected = {e.lower() for e in body.selected_emails}
    to_import = [u for u in ext_users if u.email.lower() in selected]

    # Build group mapping: source group name → target group id
    group_map: dict[str, str] = {}
    for gm in body.group_mapping:
        if gm.target_group_id:
            group_map[gm.source_group] = gm.target_group_id

    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for ext_user in to_import:
        try:
            # Check if user already exists
            result = await db.execute(
                select(User).where(User.email == ext_user.email)
            )
            existing = result.scalar_one_or_none()

            if existing:
                if body.duplicate_strategy == "skip":
                    skipped += 1
                    continue
                elif body.duplicate_strategy == "update":
                    existing.first_name = ext_user.first_name or existing.first_name
                    existing.last_name = ext_user.last_name or existing.last_name
                    existing.external_ref = ext_user.external_ref
                    existing.active = ext_user.active
                    updated += 1
                else:
                    skipped += 1
                    continue
            else:
                # Create new user
                new_user = User(
                    email=ext_user.email,
                    first_name=ext_user.first_name,
                    last_name=ext_user.last_name,
                    hashed_password=hash_password(body.default_password),
                    active=ext_user.active,
                    language="fr",
                    external_ref=ext_user.external_ref,
                )
                db.add(new_user)
                await db.flush()  # get new_user.id
                created += 1

                # Assign to groups
                target_user = new_user
                for src_group in ext_user.groups:
                    target_group_id = group_map.get(src_group)
                    if target_group_id:
                        # Check group exists
                        grp = await db.execute(
                            select(UserGroup).where(UserGroup.id == target_group_id)
                        )
                        if grp.scalar_one_or_none():
                            db.add(UserGroupMember(
                                group_id=target_group_id,
                                user_id=str(target_user.id),
                            ))

        except Exception as exc:
            errors.append(f"{ext_user.email}: {exc}")
            logger.warning("Failed to import user %s: %s", ext_user.email, exc)

    await db.commit()

    # Record audit
    await record_audit(
        db,
        action="user_sync.execute",
        resource_type="user",
        resource_id=body.provider,
        user_id=str(current_user.id),
        details={
            "provider": body.provider,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "error_count": len(errors),
        },
    )

    # Update last sync timestamp
    now = datetime.now(timezone.utc).isoformat()
    sync_setting = await db.execute(
        select(Setting).where(Setting.key == f"{prefix}.last_user_sync_at")
    )
    existing_setting = sync_setting.scalar_one_or_none()
    if existing_setting:
        existing_setting.value = {"v": now}
    else:
        db.add(Setting(key=f"{prefix}.last_user_sync_at", value={"v": now}))
    await db.commit()

    return ExecuteResponse(
        created=created,
        updated=updated,
        skipped=skipped,
        errors=errors,
    )
