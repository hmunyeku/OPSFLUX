"""Admin routes — system health, diagnostics, delete policies, security settings, user management."""

import hashlib
import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.common import RefreshToken, Setting, User
from app.services.core.delete_service import (
    _ensure_registry,
    get_archived_counts,
    get_delete_policy,
    purge_archived,
    upsert_delete_policy,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Track application start time
_START_TIME = time.time()


@router.get(
    "/health",
    dependencies=[require_permission("admin.system")],
)
async def system_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """System health check for admin dashboard.

    Returns status of core services (database, Redis), resource usage,
    and uptime information.
    """
    # ── Database check ────────────────────────────────────────────
    db_ok = True
    db_latency_ms: float | None = None
    db_connections: int | None = None
    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
        # Connection pool stats
        pool_result = await db.execute(
            text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()")
        )
        db_connections = pool_result.scalar() or 0
    except Exception as e:
        logger.warning("Database health check failed: %s", e)
        db_ok = False

    # ── Redis check ───────────────────────────────────────────────
    redis_ok = True
    redis_latency_ms: float | None = None
    try:
        redis = get_redis()
        t0 = time.monotonic()
        await redis.ping()
        redis_latency_ms = round((time.monotonic() - t0) * 1000, 2)
    except Exception as e:
        logger.warning("Redis health check failed: %s", e)
        redis_ok = False

    # ── System metrics (best-effort, psutil optional) ─────────────
    memory_mb: float | None = None
    cpu_percent: float | None = None
    disk_usage_percent: float | None = None
    try:
        import psutil

        process = psutil.Process()
        memory_mb = round(process.memory_info().rss / 1024 / 1024, 2)
        cpu_percent = psutil.cpu_percent(interval=0)
        disk_usage_percent = psutil.disk_usage("/").percent
    except ImportError:
        logger.debug("psutil not available — skipping system metrics")
    except Exception as e:
        logger.warning("System metrics collection failed: %s", e)

    uptime_seconds = int(time.time() - _START_TIME)

    overall = "healthy" if (db_ok and redis_ok) else "degraded"

    return {
        "status": overall,
        "database": {
            "status": "ok" if db_ok else "error",
            "latency_ms": db_latency_ms,
            "active_connections": db_connections,
        },
        "redis": {
            "status": "ok" if redis_ok else "error",
            "latency_ms": redis_latency_ms,
        },
        "uptime_seconds": uptime_seconds,
        "memory_mb": memory_mb,
        "cpu_percent": cpu_percent,
        "disk_usage_percent": disk_usage_percent,
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


# ══════════════════════════════════════════════════════════════════════════════
# DELETE POLICIES
# ══════════════════════════════════════════════════════════════════════════════


class DeletePolicyUpdate(BaseModel):
    mode: str  # "soft" | "soft_purge" | "hard"
    retention_days: int = 0


@router.get(
    "/delete-policies",
    dependencies=[require_permission("admin.system")],
)
async def list_delete_policies(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all entity types with their current delete policy and archived counts."""
    counts = await get_archived_counts(db)
    policies = []

    registry = _ensure_registry()
    for entity_type, reg in registry.items():
        policy = await get_delete_policy(entity_type, db, entity_id)
        policies.append({
            "entity_type": entity_type,
            "label": reg["label"],
            "category": reg["category"],
            "table": reg["table"],
            "mode": policy.get("mode", reg["default_mode"]),
            "retention_days": policy.get("retention_days", 0),
            "default_mode": reg["default_mode"],
            "archived_count": counts.get(entity_type, 0),
        })

    return policies


@router.put(
    "/delete-policies/{entity_type}",
    dependencies=[require_permission("admin.system")],
)
async def update_delete_policy(
    entity_type: str,
    body: DeletePolicyUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a delete policy for an entity type."""
    registry = _ensure_registry()
    if entity_type not in registry:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")
    if body.mode not in ("soft", "soft_purge", "hard"):
        raise HTTPException(status_code=400, detail=f"Invalid mode: {body.mode}")
    if body.mode == "soft_purge" and body.retention_days <= 0:
        raise HTTPException(status_code=400, detail="retention_days must be > 0 for soft_purge mode")

    await upsert_delete_policy(entity_type, body.mode, body.retention_days, db, entity_id)

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="update",
        resource_type="delete_policy",
        resource_id=entity_type,
        user_id=current_user.id,
        entity_id=entity_id,
        details={"mode": body.mode, "retention_days": body.retention_days},
    )
    await db.commit()

    return {"detail": "Policy saved", "entity_type": entity_type, "mode": body.mode}


@router.post(
    "/purge/{entity_type}",
    dependencies=[require_permission("admin.system")],
)
async def manual_purge(
    entity_type: str,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger purge of archived records for a specific entity type."""
    registry = _ensure_registry()
    if entity_type not in registry:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")

    policy = await get_delete_policy(entity_type, db, entity_id)
    retention_days = policy.get("retention_days", 0)

    # If no retention configured, purge ALL archived records
    if retention_days <= 0:
        retention_days = 0

    count = await purge_archived(entity_type, retention_days, db)

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="purge",
        resource_type="delete_policy",
        resource_id=entity_type,
        user_id=current_user.id,
        entity_id=entity_id,
        details={"purged_count": count, "retention_days": retention_days},
    )
    await db.commit()

    return {"detail": f"{count} records purged", "entity_type": entity_type, "purged_count": count}


@router.get(
    "/delete-policies/stats",
    dependencies=[require_permission("admin.system")],
)
async def delete_policy_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get archived record counts per entity type."""
    counts = await get_archived_counts(db)
    return counts


# ── Scheduler Admin ──────────────────────────────────────────────────────


@router.get(
    "/scheduler/jobs",
    dependencies=[require_permission("admin.system")],
)
async def list_scheduler_jobs(
    current_user: User = Depends(get_current_user),
):
    """List all registered scheduled jobs with status."""
    from app.tasks.scheduler import scheduler

    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name,
            "trigger": str(job.trigger),
            "next_run_at": next_run.isoformat() if next_run else None,
            "pending": job.pending,
        })
    return {"jobs": jobs, "total": len(jobs)}


class RunJobRequest(BaseModel):
    job_id: str


@router.post(
    "/scheduler/run",
    dependencies=[require_permission("admin.system")],
)
async def run_scheduler_job(
    body: RunJobRequest,
    current_user: User = Depends(get_current_user),
):
    """Manually trigger a scheduled job to run now."""
    from app.tasks.scheduler import scheduler

    job = scheduler.get_job(body.job_id)
    if not job:
        raise HTTPException(404, f"Job '{body.job_id}' not found")

    # Run the job function directly (async)
    import asyncio
    func = job.func
    if asyncio.iscoroutinefunction(func):
        asyncio.create_task(func())
    else:
        func()

    return {"detail": f"Job '{body.job_id}' triggered", "job_id": body.job_id}


# ══════════════════════════════════════════════════════════════════════════════
# SECURITY SETTINGS (DB-driven, admin-configurable)
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/security-settings",
    dependencies=[require_permission("admin.system")],
)
async def get_security_settings_admin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all auth/security settings (DB values merged with env defaults)."""
    from app.core.auth_settings import SECRET_KEYS, get_security_settings

    cfg = await get_security_settings(db)
    # Mask secret keys — only indicate if they are set
    result = {}
    for key, value in cfg.items():
        if key in SECRET_KEYS:
            result[f"{key}_set"] = bool(value)
        else:
            result[key] = value
    return result


class SecuritySettingsUpdate(BaseModel):
    settings: dict[str, Any]


@router.put(
    "/security-settings",
    dependencies=[require_permission("admin.system")],
)
async def update_security_settings_admin(
    body: SecuritySettingsUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-update auth/security settings in the DB Setting table."""
    from app.core.audit import record_audit
    from app.core.auth_settings import ALLOWED_KEYS, invalidate_security_settings_cache

    changed = {}
    for key, value in body.settings.items():
        if key not in ALLOWED_KEYS:
            raise HTTPException(400, f"Unknown security setting: {key}")
        db_key = f"auth.{key}"
        # Upsert into Setting table
        existing = await db.execute(
            select(Setting).where(Setting.key == db_key, Setting.scope == "tenant")
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = {"v": value}
        else:
            db.add(Setting(key=db_key, value={"v": value}, scope="tenant"))
        changed[key] = value

    await record_audit(
        db,
        action="update",
        resource_type="security_settings",
        resource_id="tenant",
        user_id=current_user.id,
        entity_id=entity_id,
        details={"changed": changed},
    )
    await db.commit()
    await invalidate_security_settings_cache()

    return {"detail": "Security settings updated", "changed": list(changed.keys())}


# ══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT (admin)
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/users",
    dependencies=[require_permission("admin.system")],
)
async def admin_list_users(
    status_filter: str | None = Query(None, description="locked | inactive | expired | active"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users with admin-level detail (lock status, failed attempts, etc.)."""
    now = datetime.now(UTC)
    query = select(User)

    # Filters
    if status_filter == "locked":
        query = query.where(User.locked_until > now)
    elif status_filter == "inactive":
        query = query.where(User.active == False)  # noqa: E712
    elif status_filter == "expired":
        query = query.where(User.account_expires_at < now)
    elif status_filter == "active":
        query = query.where(User.active == True)  # noqa: E712

    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                User.email.ilike(term),
                User.first_name.ilike(term),
                User.last_name.ilike(term),
            )
        )

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    query = query.order_by(User.last_name, User.first_name)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        is_locked = bool(u.locked_until and u.locked_until > now)
        lock_remaining = None
        if is_locked:
            lock_remaining = max(1, int((u.locked_until - now).total_seconds() / 60))

        items.append({
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "active": u.active,
            "avatar_url": u.avatar_url,
            "auth_type": u.auth_type or "email_password",
            "mfa_enabled": u.mfa_enabled,
            "failed_login_count": u.failed_login_count or 0,
            "locked_until": u.locked_until.isoformat() if u.locked_until else None,
            "is_locked": is_locked,
            "lock_remaining_minutes": lock_remaining,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "last_login_ip": u.last_login_ip,
            "account_expires_at": u.account_expires_at.isoformat() if u.account_expires_at else None,
            "created_at": u.created_at.isoformat(),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post(
    "/users/{user_id}/unlock",
    dependencies=[require_permission("admin.system")],
)
async def admin_unlock_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Unlock a locked user account (reset failed_login_count and locked_until)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.failed_login_count = 0
    user.locked_until = None

    # Clear Redis rate limit keys for this user's email
    try:
        redis = get_redis()
        email_hash = hashlib.sha256(user.email.lower().encode()).hexdigest()[:16]
        await redis.delete(f"auth:ratelimit:email:{email_hash}")
    except Exception:
        pass  # non-critical

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="admin_unlock",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"unlocked_user": user.email},
    )
    await db.commit()

    return {"detail": f"Account {user.email} unlocked"}


@router.post(
    "/users/{user_id}/force-password-reset",
    dependencies=[require_permission("admin.system")],
)
async def admin_force_password_reset(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Send a password reset email to the user (admin-triggered)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    from app.core.security import create_password_reset_token
    token = create_password_reset_token(user_id=user.id, email=user.email)
    reset_url = f"{settings.APP_URL}/reset-password?token={token}"

    # Try email template engine, fallback to direct send
    try:
        from app.core.email_templates import render_and_send_email

        if user.default_entity_id:
            sent = await render_and_send_email(
                db,
                slug="password_reset",
                entity_id=user.default_entity_id,
                to=user.email,
                context={"user": user, "reset_url": reset_url},
            )
            if not sent:
                raise Exception("Template send returned False")
        else:
            raise Exception("No entity for template")
    except Exception:
        from app.core.notifications import send_email
        await send_email(
            to=user.email,
            subject="OpsFlux — Réinitialisation de votre mot de passe",
            body_html=(
                f"<p>Bonjour {user.first_name},</p>"
                f'<p>Un administrateur a demandé la réinitialisation de votre mot de passe.</p>'
                f'<p><a href="{reset_url}">Réinitialiser mon mot de passe</a></p>'
                f"<p>Ce lien expire dans 1 heure.</p>"
            ),
        )

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="admin_force_password_reset",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"target_user": user.email},
    )
    await db.commit()

    return {"detail": f"Password reset email sent to {user.email}"}


@router.post(
    "/users/{user_id}/deactivate",
    dependencies=[require_permission("admin.system")],
)
async def admin_deactivate_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user account (set active=False, revoke all sessions)."""
    if user_id == current_user.id:
        raise HTTPException(400, "Vous ne pouvez pas désactiver votre propre compte.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.active = False
    # Revoke all refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
        .values(revoked=True)
    )

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="admin_deactivate",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"deactivated_user": user.email},
    )
    await db.commit()

    return {"detail": f"Account {user.email} deactivated"}


@router.post(
    "/users/{user_id}/reactivate",
    dependencies=[require_permission("admin.system")],
)
async def admin_reactivate_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a previously deactivated user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    user.active = True

    from app.core.audit import record_audit
    await record_audit(
        db,
        action="admin_reactivate",
        resource_type="user",
        resource_id=str(user.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reactivated_user": user.email},
    )
    await db.commit()

    return {"detail": f"Account {user.email} reactivated"}
