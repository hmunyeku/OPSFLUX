"""Papyrus automated dispatch services."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger
from jinja2 import BaseLoader, Environment, Undefined
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import Entity, User
from app.models.papyrus import PapyrusDispatchRun
from app.models.papyrus_document import Document, Revision
from app.services.modules.papyrus_runtime_service import render_papyrus_document, resolve_ref
from app.services.modules.papyrus_versioning_service import ensure_papyrus_document

logger = logging.getLogger(__name__)

_jinja_env = Environment(loader=BaseLoader(), autoescape=False, undefined=Undefined)


async def get_document_schedule(
    *,
    doc_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    doc, revision = await _get_document_with_revision(doc_id=doc_id, entity_id=entity_id, db=db)
    canonical = ensure_papyrus_document(
        revision.content if revision else None,
        document_id=doc.id,
        title=doc.title,
        current_state=doc.status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )
    schedule = _normalize_schedule(canonical.get("schedule"))
    runs = await list_dispatch_runs(doc_id=doc_id, entity_id=entity_id, db=db, limit=2)
    if runs:
        schedule["last_run_at"] = runs[0].created_at
        schedule["last_status"] = runs[0].status
        for run in runs:
            if run.status == "success":
                schedule["last_success_at"] = run.created_at
                break
    return schedule


async def update_document_schedule(
    *,
    doc_id: UUID,
    entity_id: UUID,
    actor_id: UUID,
    body: Any,
    db: AsyncSession,
) -> dict[str, Any]:
    from app.services.modules.papyrus_document_service import _record_papyrus_snapshot

    doc, revision = await _get_document_with_revision(doc_id=doc_id, entity_id=entity_id, db=db)
    if revision is None:
        from fastapi import HTTPException

        raise HTTPException(400, "Document has no current revision")

    previous_content = revision.content or {}
    canonical = ensure_papyrus_document(
        previous_content,
        document_id=doc.id,
        title=doc.title,
        current_state=doc.status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )
    canonical["meta"]["document_type"] = "report"
    canonical["schedule"] = _normalize_schedule(body.model_dump())
    revision.content = canonical
    doc.updated_at = datetime.now(timezone.utc)

    await _record_papyrus_snapshot(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        previous_content=previous_content,
        new_content=revision.content,
        message="Papyrus schedule updated",
    )
    await db.commit()
    return await get_document_schedule(doc_id=doc.id, entity_id=entity_id, db=db)


async def list_dispatch_runs(
    *,
    doc_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
    limit: int = 20,
) -> list[PapyrusDispatchRun]:
    result = await db.execute(
        select(PapyrusDispatchRun)
        .where(
            PapyrusDispatchRun.document_id == doc_id,
            PapyrusDispatchRun.entity_id == entity_id,
        )
        .order_by(PapyrusDispatchRun.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def dispatch_document_now(
    *,
    doc_id: UUID,
    entity_id: UUID,
    triggered_by: UUID | None,
    db: AsyncSession,
) -> PapyrusDispatchRun:
    doc, revision = await _get_document_with_revision(doc_id=doc_id, entity_id=entity_id, db=db)
    run = await _dispatch_document(
        db=db,
        doc=doc,
        revision=revision,
        trigger_type="manual",
        trigger_key=f"manual:{datetime.now(timezone.utc).isoformat()}",
        scheduled_for=datetime.now(timezone.utc),
        triggered_by=triggered_by,
        schedule_override=None,
    )
    await db.commit()
    return run


async def process_due_papyrus_dispatches(
    *,
    db: AsyncSession,
) -> dict[str, int]:
    summary = {"checked": 0, "dispatched": 0, "skipped": 0, "failed": 0}
    result = await db.execute(
        select(Document, Revision, Entity)
        .join(Revision, Revision.id == Document.current_revision_id)
        .join(Entity, Entity.id == Document.entity_id)
        .where(Document.status.in_(("approved", "published")))
    )
    rows = result.all()
    now_utc = datetime.now(timezone.utc)

    for doc, revision, entity in rows:
        summary["checked"] += 1
        try:
            canonical = ensure_papyrus_document(
                revision.content,
                document_id=doc.id,
                title=doc.title,
                current_state=doc.status,
                created_at=doc.created_at,
                updated_at=doc.updated_at,
            )
            schedule = _normalize_schedule(canonical.get("schedule"))
            if not schedule["enabled"] or not schedule["cron"]:
                summary["skipped"] += 1
                continue

            entity_tz = schedule["timezone"] or entity.timezone or "UTC"
            due_times = _get_due_fire_times(
                cron_expression=schedule["cron"],
                now_utc=now_utc,
                timezone_name=entity_tz,
                grace_minutes=int(schedule["grace_minutes"]),
            )
            if not due_times:
                summary["skipped"] += 1
                continue

            dispatched_for_doc = 0
            for due_time in due_times:
                trigger_key = f"scheduled:{due_time.astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat()}"
                run = await _dispatch_document(
                    db=db,
                    doc=doc,
                    revision=revision,
                    trigger_type="scheduled",
                    trigger_key=trigger_key,
                    scheduled_for=due_time.astimezone(timezone.utc),
                    triggered_by=None,
                    schedule_override=schedule,
                )
                if run is not None:
                    dispatched_for_doc += 1
            if dispatched_for_doc:
                summary["dispatched"] += dispatched_for_doc
            else:
                summary["skipped"] += 1
        except Exception:
            summary["failed"] += 1
            logger.exception("Papyrus dispatch failed for document %s", doc.id)

    await db.commit()
    return summary


async def _dispatch_document(
    *,
    db: AsyncSession,
    doc: Document,
    revision: Revision | None,
    trigger_type: str,
    trigger_key: str,
    scheduled_for: datetime,
    triggered_by: UUID | None,
    schedule_override: dict[str, Any] | None,
) -> PapyrusDispatchRun | None:
    if revision is None:
        return None

    canonical = ensure_papyrus_document(
        revision.content,
        document_id=doc.id,
        title=doc.title,
        current_state=doc.status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )
    schedule = _normalize_schedule(schedule_override or canonical.get("schedule"))
    if trigger_type == "scheduled" and not await _conditions_match(
        db=db,
        entity_id=doc.entity_id,
        conditions=schedule.get("conditions", []),
    ):
        return None

    channel = schedule["channel"]
    resolved = await _resolve_recipients(
        db=db,
        entity_id=doc.entity_id,
        recipients=schedule.get("recipients", []),
    )
    try:
        async with db.begin_nested():
            run = PapyrusDispatchRun(
                entity_id=doc.entity_id,
                document_id=doc.id,
                revision_id=revision.id,
                trigger_key=trigger_key,
                trigger_type=trigger_type,
                scheduled_for=scheduled_for,
                channel_type=channel["type"],
                status="pending",
                recipients=schedule.get("recipients", []),
                triggered_by=triggered_by,
            )
            db.add(run)
            await db.flush()
    except IntegrityError:
        return None

    try:
        rendered = await render_papyrus_document(db=db, entity_id=doc.entity_id, document=canonical)
        dispatch_context = await _build_dispatch_context(db=db, doc=doc, revision=revision, rendered=rendered)
        subject = _render_template_string(
            channel.get("subject") or f"Papyrus - {doc.title}",
            dispatch_context,
        )
        body_html = _render_dispatch_html(rendered=rendered, doc=doc, subject=subject)

        if channel["type"] == "in_app":
            from app.core.notifications import send_in_app

            for user_info in resolved["users"]:
                await send_in_app(
                    db,
                    user_id=user_info["id"],
                    entity_id=doc.entity_id,
                    title=subject[:200],
                    body=f"Papyrus dispatch: {doc.number} - {doc.title}",
                    category="papyrus",
                    link="/papyrus",
                )
            delivered = len(resolved["users"])
        else:
            from app.core.notifications import send_email

            delivered = 0
            for email_info in resolved["emails"]:
                await send_email(
                    to=email_info["email"],
                    subject=subject,
                    body_html=body_html,
                    db=db,
                    user_id=email_info.get("user_id"),
                    category="papyrus",
                )
                delivered += 1

        run.status = "success"
        run.finished_at = datetime.now(timezone.utc)
        run.result_summary = {
            "delivered": delivered,
            "resolved_users": len(resolved["users"]),
            "resolved_emails": len(resolved["emails"]),
            "channel": channel["type"],
            "format": channel.get("format"),
        }
    except Exception as exc:
        run.status = "error"
        run.error_message = str(exc)
        run.finished_at = datetime.now(timezone.utc)
        logger.exception("Papyrus dispatch execution failed for document %s", doc.id)
    return run


async def _get_document_with_revision(
    *,
    doc_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> tuple[Document, Revision | None]:
    result = await db.execute(
        select(Document, Revision)
        .outerjoin(Revision, Revision.id == Document.current_revision_id)
        .where(Document.id == doc_id, Document.entity_id == entity_id)
    )
    row = result.first()
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(404, "Document not found")
    return row[0], row[1]


def _normalize_schedule(schedule: Any) -> dict[str, Any]:
    data = schedule if isinstance(schedule, dict) else {}
    channel = data.get("channel") if isinstance(data.get("channel"), dict) else {}
    return {
        "enabled": bool(data.get("enabled", False)),
        "cron": data.get("cron"),
        "timezone": data.get("timezone"),
        "grace_minutes": int(data.get("grace_minutes", 15) or 15),
        "conditions": list(data.get("conditions", [])) if isinstance(data.get("conditions"), list) else [],
        "recipients": list(data.get("recipients", [])) if isinstance(data.get("recipients"), list) else [],
        "channel": {
            "type": channel.get("type") or "email",
            "smtp_override": channel.get("smtp_override"),
            "from_address": channel.get("from_address"),
            "subject": channel.get("subject"),
            "format": channel.get("format") or "pdf_attached",
        },
    }


def _get_due_fire_times(
    *,
    cron_expression: str,
    now_utc: datetime,
    timezone_name: str,
    grace_minutes: int,
) -> list[datetime]:
    tz = ZoneInfo(timezone_name)
    local_now = now_utc.astimezone(tz)
    window_start = local_now - timedelta(minutes=grace_minutes)
    trigger = CronTrigger.from_crontab(cron_expression, timezone=tz)
    due: list[datetime] = []
    previous_fire_time = None
    cursor = window_start
    for _ in range(256):
        next_fire = trigger.get_next_fire_time(previous_fire_time, cursor)
        if next_fire is None or next_fire > local_now:
            break
        if next_fire >= window_start:
            due.append(next_fire)
        previous_fire_time = next_fire
        cursor = next_fire
    return due


async def _conditions_match(
    *,
    db: AsyncSession,
    entity_id: UUID,
    conditions: list[dict[str, Any]],
) -> bool:
    if not conditions:
        return True

    for condition in conditions:
        ref = condition.get("kpi")
        op = condition.get("op")
        expected = condition.get("value")
        if not isinstance(ref, str) or not isinstance(op, str):
            return False
        actual = await resolve_ref(db=db, entity_id=entity_id, ref=ref)
        if not _compare_condition(actual, op, expected):
            return False
    return True


def _compare_condition(actual: Any, op: str, expected: Any) -> bool:
    if op == "<":
        return actual is not None and actual < expected
    if op == "<=":
        return actual is not None and actual <= expected
    if op == ">":
        return actual is not None and actual > expected
    if op == ">=":
        return actual is not None and actual >= expected
    if op == "==":
        return actual == expected
    if op == "!=":
        return actual != expected
    if op == "contains":
        return actual is not None and str(expected) in str(actual)
    if op == "not_contains":
        return actual is not None and str(expected) not in str(actual)
    return False


async def _resolve_recipients(
    *,
    db: AsyncSession,
    entity_id: UUID,
    recipients: list[str],
) -> dict[str, list[dict[str, Any]]]:
    users: dict[str, dict[str, Any]] = {}
    emails: dict[str, dict[str, Any]] = {}

    for recipient in recipients:
        if not isinstance(recipient, str) or ":" not in recipient:
            continue
        kind, value = recipient.split(":", 1)
        kind = kind.strip().lower()
        value = value.strip()
        if kind == "user":
            user = await db.get(User, UUID(value))
            if user and user.active:
                payload = {"id": user.id, "email": user.email, "name": user.full_name}
                users[str(user.id)] = payload
                if user.email:
                    emails[user.email.lower()] = {"email": user.email, "user_id": user.id, "name": user.full_name}
        elif kind == "group":
            result = await db.execute(
                text(
                    """
                    SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
                    FROM user_group_members ugm
                    JOIN user_groups ug ON ug.id = ugm.group_id
                    JOIN user_group_roles ugr ON ugr.group_id = ug.id
                    JOIN users u ON u.id = ugm.user_id
                    WHERE ug.entity_id = :entity_id
                      AND ug.active = true
                      AND u.active = true
                      AND ugr.role_code = :role_code
                    """
                ),
                {"entity_id": str(entity_id), "role_code": value},
            )
            for row in result.fetchall():
                full_name = f"{row.first_name or ''} {row.last_name or ''}".strip() or row.email
                payload = {"id": row.id, "email": row.email, "name": full_name}
                users[str(row.id)] = payload
                if row.email:
                    emails[str(row.email).lower()] = {"email": row.email, "user_id": row.id, "name": full_name}
        elif kind == "email" and value:
            emails[value.lower()] = {"email": value, "user_id": None, "name": value}

    return {
        "users": list(users.values()),
        "emails": list(emails.values()),
    }


async def _build_dispatch_context(
    *,
    db: AsyncSession,
    doc: Document,
    revision: Revision,
    rendered: dict[str, Any],
) -> dict[str, Any]:
    entity = await db.get(Entity, doc.entity_id)
    project = None
    if doc.project_id:
        project = await resolve_ref(db=db, entity_id=doc.entity_id, ref=f"project://{doc.project_id}")
    return {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "document": {
            "id": str(doc.id),
            "number": doc.number,
            "title": doc.title,
            "status": doc.status,
            "revision": revision.rev_code,
        },
        "project": project or {},
        "entity": {
            "id": str(entity.id) if entity else None,
            "name": entity.name if entity else None,
            "timezone": entity.timezone if entity else "UTC",
        },
        "papyrus": rendered,
    }


def _render_template_string(template: str, context: dict[str, Any]) -> str:
    try:
        return _jinja_env.from_string(template).render(**context).strip()
    except Exception:
        logger.exception("Papyrus schedule template rendering failed")
        return template


def _render_dispatch_html(
    *,
    rendered: dict[str, Any],
    doc: Document,
    subject: str,
) -> str:
    body = _render_blocks_as_html(rendered.get("blocks"))
    if not body:
        body = "<p>Aucun contenu rendu.</p>"
    return (
        "<html><body style='font-family:Arial,Helvetica,sans-serif'>"
        f"<h2>{_escape_html(subject)}</h2>"
        f"<p><strong>{_escape_html(doc.number)}</strong> - {_escape_html(doc.title)}</p>"
        f"{body}"
        "</body></html>"
    )


def _render_blocks_as_html(blocks: Any) -> str:
    if not isinstance(blocks, list):
        return ""
    rendered_parts: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "paragraph")
        text_value = _extract_block_text(block)
        if block_type == "heading":
            level = 2
            props = block.get("props")
            if isinstance(props, dict):
                level = int(props.get("level") or 2)
            level = max(1, min(level, 4))
            rendered_parts.append(f"<h{level}>{_escape_html(text_value)}</h{level}>")
        elif block_type in {"paragraph", "codeBlock", "code"}:
            tag = "pre" if block_type in {"codeBlock", "code"} else "p"
            rendered_parts.append(f"<{tag}>{_escape_html(text_value)}</{tag}>")
        elif block_type == "separator":
            rendered_parts.append("<hr />")
        elif block_type in {"opsflux_kpi", "opsflux_asset", "opsflux_actions", "opsflux_gantt", "formula"}:
            label = block.get("label") or block.get("type")
            display = block.get("display_value")
            if display is None:
                display = block.get("computed_value")
            if display is None:
                display = block.get("resolved")
            rendered_parts.append(
                f"<p><strong>{_escape_html(str(label))}:</strong> {_escape_html(str(display) if display is not None else '--')}</p>"
            )
        else:
            rendered_parts.append(f"<p>{_escape_html(text_value or str(block.get('type') or 'Bloc'))}</p>")
    return "".join(rendered_parts)


def _extract_block_text(block: dict[str, Any]) -> str:
    content = block.get("content")
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        if parts:
            return "".join(parts)
    if isinstance(block.get("text"), str):
        return block["text"]
    return ""


def _escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
