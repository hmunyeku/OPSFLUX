"""Admin routes — system health, diagnostics, delete policies."""

import logging
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.common import User
from app.services.core.delete_service import (
    ENTITY_TYPE_REGISTRY,
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

    for entity_type, reg in ENTITY_TYPE_REGISTRY.items():
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
    if entity_type not in ENTITY_TYPE_REGISTRY:
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
    if entity_type not in ENTITY_TYPE_REGISTRY:
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
