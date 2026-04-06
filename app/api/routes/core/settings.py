"""Settings routes — scoped settings with explicit permissions."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.common import CostCenter, Project, Setting, User
from app.schemas.common import SettingRead, SettingWrite

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

_SENSITIVE_SETTING_SUFFIXES = {
    "token",
    "access_token",
    "refresh_token",
    "password",
    "secret",
    "client_secret",
    "secret_key",
    "access_key",
    "auth_token",
    "consumer_key",
    "application_key",
    "application_secret",
    "api_key",
    "api_secret",
    "private_key",
}
_SENSITIVE_SETTING_KEYS = {
    "integration.gouti.token",
}


def _is_sensitive_setting_key(key: str) -> bool:
    normalized = key.strip().lower()
    if normalized in _SENSITIVE_SETTING_KEYS:
        return True
    last_segment = normalized.rsplit(".", 1)[-1]
    return last_segment in _SENSITIVE_SETTING_SUFFIXES


def _redact_setting_value(key: str, value: dict[str, Any]) -> dict[str, Any]:
    if not _is_sensitive_setting_key(key):
        return value

    secret_value = value.get("v")
    if secret_value in (None, ""):
        return value

    redacted = dict(value)
    redacted["v"] = "********"
    redacted["masked"] = True
    redacted["has_value"] = True
    return redacted


def _validate_scope(scope: str) -> str:
    if scope not in {"tenant", "entity", "user"}:
        raise HTTPException(status_code=400, detail="Invalid settings scope")
    return scope


def _validate_paxlog_compliance_sequence_setting(value: dict[str, Any]) -> None:
    payload = value.get("v", value)
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="Invalid paxlog.compliance_sequence payload")
    allowed = {"site_requirements", "job_profile", "self_declaration"}
    normalized = [item for item in payload if isinstance(item, str)]
    if len(normalized) != len(payload):
        raise HTTPException(status_code=400, detail="Invalid paxlog.compliance_sequence values")
    if len(set(normalized)) != len(normalized):
        raise HTTPException(status_code=400, detail="Duplicate paxlog.compliance_sequence values are not allowed")
    if set(normalized) != allowed:
        raise HTTPException(status_code=400, detail="paxlog.compliance_sequence must contain site_requirements, job_profile, self_declaration exactly once")


def _validate_travelwiz_numeric_setting(body: SettingWrite) -> None:
    numeric_constraints: dict[str, tuple[float, float | None]] = {
        "travelwiz.delay_reassign_threshold_hours": (0.25, None),
        "travelwiz.weight_alert_ratio": (0.1, 1.0),
        "travelwiz.weather_alert_beaufort_threshold": (1.0, 12.0),
        "travelwiz.weather_sync_interval_minutes": (5.0, None),
        "travelwiz.signal_stale_minutes": (1.0, None),
        "travelwiz.captain_session_minutes": (5.0, None),
        "travelwiz.driver_session_minutes": (5.0, None),
        "travelwiz.pickup_sms_lead_minutes": (1.0, None),
        "travelwiz.pickup_confirm_radius_meters": (10.0, None),
    }
    bounds = numeric_constraints.get(body.key)
    if bounds is None:
        return
    payload = body.value.get("v", body.value)
    try:
        numeric_value = float(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid numeric value for {body.key}") from exc
    minimum, maximum = bounds
    if numeric_value < minimum:
        raise HTTPException(status_code=400, detail=f"{body.key} must be >= {minimum}")
    if maximum is not None and numeric_value > maximum:
        raise HTTPException(status_code=400, detail=f"{body.key} must be <= {maximum}")


async def _require_settings_manage(current_user: User, entity_id: UUID, db: AsyncSession) -> None:
    if not await has_user_permission(current_user, entity_id, "core.settings.manage", db):
        raise HTTPException(status_code=403, detail="Permission denied: core.settings.manage")


def _as_uuid_or_none(value: Any, field_name: str) -> UUID | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: expected UUID string")
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: malformed UUID") from exc


async def _validate_default_imputation_setting(
    value: dict[str, Any],
    *,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    payload = value.get("v", value)
    if payload in (None, ""):
        return
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid core.default_imputation payload")

    allowed_keys = {"project_id", "cost_center_id"}
    unknown_keys = set(payload.keys()) - allowed_keys
    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid core.default_imputation keys: {', '.join(sorted(unknown_keys))}",
        )

    project_id = _as_uuid_or_none(payload.get("project_id"), "project_id")
    cost_center_id = _as_uuid_or_none(payload.get("cost_center_id"), "cost_center_id")

    if project_id is not None:
        project = await db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.entity_id == entity_id,
                Project.active.is_(True),
                Project.archived.is_(False),
            )
        )
        if project is None:
            raise HTTPException(status_code=400, detail="Invalid project_id for core.default_imputation")

    if cost_center_id is not None:
        cost_center = await db.scalar(
            select(CostCenter).where(
                CostCenter.id == cost_center_id,
                CostCenter.entity_id == entity_id,
                CostCenter.active.is_(True),
            )
        )
        if cost_center is None:
            raise HTTPException(status_code=400, detail="Invalid cost_center_id for core.default_imputation")


@router.get("", response_model=list[SettingRead])
async def list_settings(
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List settings for the current scope."""
    scope = _validate_scope(scope)
    query = select(Setting).where(Setting.scope == scope)

    if scope == "user":
        query = query.where(Setting.scope_id == str(current_user.id))
    elif scope == "entity":
        await _require_settings_manage(current_user, entity_id, db)
        query = query.where(Setting.scope_id == str(entity_id))
    else:
        await _require_settings_manage(current_user, entity_id, db)

    result = await db.execute(query)
    settings = result.scalars().all()
    return [
        SettingRead(
            key=setting.key,
            value=_redact_setting_value(setting.key, setting.value),
            scope=setting.scope,
            scope_id=setting.scope_id,
        )
        for setting in settings
    ]


@router.put("")
async def upsert_setting(
    body: SettingWrite,
    scope: str = "tenant",
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a setting."""
    scope = _validate_scope(scope)

    if body.key == "core.default_imputation":
        await _validate_default_imputation_setting(body.value, entity_id=entity_id, db=db)
    elif body.key == "paxlog.compliance_sequence":
        _validate_paxlog_compliance_sequence_setting(body.value)
    elif body.key.startswith("travelwiz."):
        _validate_travelwiz_numeric_setting(body)

    if scope == "user":
        scope_id = str(current_user.id)
    elif scope == "entity":
        await _require_settings_manage(current_user, entity_id, db)
        scope_id = str(entity_id)
    else:
        await _require_settings_manage(current_user, entity_id, db)
        scope_id = None

    result = await db.execute(
        select(Setting).where(
            Setting.key == body.key,
            Setting.scope == scope,
            Setting.scope_id == scope_id if scope_id is not None else Setting.scope_id.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.value = body.value
    else:
        db.add(Setting(
            key=body.key,
            value=body.value,
            scope=scope,
            scope_id=scope_id,
        ))

    await db.commit()
    return {"detail": "Setting saved"}
