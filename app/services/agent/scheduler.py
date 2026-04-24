"""Background scheduler for the autonomous maintenance agent.

Runs inside the FastAPI lifespan. Two independent loops:

  1. `auto_trigger_loop` (every 5 min) — finds eligible open bug
     tickets and launches agent runs when the current UTC hour falls
     inside the per-entity configured window. Stops when the per-
     window run cap is reached.
  2. `daily_digest_loop` (every 15 min) — once per day at the
     configured hour, sends a digest email summarising the last 24h
     of agent activity.

Both loops use a Postgres advisory lock keyed by a constant so only
ONE uvicorn worker in a multi-worker deployment runs the scheduler at
a time. Other workers quietly skip.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory as AsyncSessionLocal
from app.models.agent import SupportAgentConfig, SupportAgentRun
from app.models.support import SupportTicket

logger = logging.getLogger(__name__)

# Arbitrary-but-stable 64-bit integers for the advisory locks. The
# leader worker holds them for the lifetime of the process.
_TRIGGER_LOCK_ID = 0x4F50534E_54524947  # 'OPSN'+'TRIG' as hex
_DIGEST_LOCK_ID = 0x4F50534E_44494753  # 'OPSN'+'DIGS'

_TRIGGER_INTERVAL_S = int(os.getenv("AGENT_SCHEDULER_TRIGGER_INTERVAL_S", "300"))
_DIGEST_INTERVAL_S = int(os.getenv("AGENT_SCHEDULER_DIGEST_INTERVAL_S", "900"))


# ─── Lock primitives ──────────────────────────────────────────────────

async def _try_acquire_lock(db: AsyncSession, lock_id: int) -> bool:
    """Return True if this session got the advisory lock."""
    result = await db.execute(
        text("SELECT pg_try_advisory_lock(:id)").bindparams(id=lock_id),
    )
    return bool(result.scalar())


# ─── Window check ─────────────────────────────────────────────────────

def _is_in_window(now_hour: int, start: int | None, end: int | None) -> bool:
    """True when window is unset, or current hour is inside [start, end]."""
    if start is None or end is None:
        return True  # no window → always on
    if start == end:
        return False  # zero-width window = disabled
    if start < end:
        return start <= now_hour < end
    # wrap-around: e.g. 23 → 6
    return now_hour >= start or now_hour < end


# ─── Auto-trigger loop ────────────────────────────────────────────────

async def _run_auto_trigger_once() -> None:
    """One pass over every enabled entity config."""
    from app.services.agent.harness import HarnessError, launch_run

    async with AsyncSessionLocal() as db:
        # Only one worker actually runs this; others no-op.
        got_lock = await _try_acquire_lock(db, _TRIGGER_LOCK_ID)
        if not got_lock:
            return
        try:
            configs = (
                await db.execute(
                    select(SupportAgentConfig).where(
                        SupportAgentConfig.enabled == True,  # noqa: E712
                        SupportAgentConfig.automatic_trigger_enabled == True,  # noqa: E712
                    )
                )
            ).scalars().all()

            now = datetime.now(UTC)
            now_hour = now.hour

            for config in configs:
                if not _is_in_window(
                    now_hour,
                    config.auto_window_start_hour,
                    config.auto_window_end_hour,
                ):
                    continue

                # Count runs already launched inside the current window.
                # Simple heuristic: last N hours of the window.
                window_hours = _window_duration_hours(
                    config.auto_window_start_hour,
                    config.auto_window_end_hour,
                )
                since = now - timedelta(hours=window_hours)
                launched_count = (
                    await db.execute(
                        select(func.count(SupportAgentRun.id)).where(
                            SupportAgentRun.entity_id == config.entity_id,
                            SupportAgentRun.triggered_automatically == True,  # noqa: E712
                            SupportAgentRun.created_at >= since,
                        )
                    )
                ).scalar_one()

                remaining = max(0, config.auto_max_runs_per_window - launched_count)
                if remaining <= 0:
                    continue

                # Find eligible tickets: open bugs with no active run.
                eligible = await _find_eligible_tickets(db, config, limit=remaining)
                for ticket in eligible:
                    try:
                        # The harness validates all other pre-conditions
                        # (budget, circuit breaker, concurrent runs).
                        triggered_user = await _resolve_system_user(db)
                        run = await launch_run(
                            db, ticket=ticket, triggered_by=triggered_user,
                        )
                        run.triggered_automatically = True
                        logger.info(
                            "Auto-triggered agent run %s on ticket %s "
                            "(entity=%s, window=%s→%s)",
                            run.id, ticket.reference,
                            config.entity_id,
                            config.auto_window_start_hour,
                            config.auto_window_end_hour,
                        )
                    except HarnessError as exc:
                        logger.info(
                            "Auto-trigger skipped ticket %s: %s",
                            ticket.reference, exc,
                        )
                    except Exception:  # noqa: BLE001
                        logger.exception(
                            "Auto-trigger crashed on ticket %s",
                            ticket.reference,
                        )
                await db.commit()
        finally:
            await db.execute(
                text("SELECT pg_advisory_unlock(:id)").bindparams(id=_TRIGGER_LOCK_ID),
            )


async def _find_eligible_tickets(
    db: AsyncSession, config: SupportAgentConfig, limit: int,
) -> list[SupportTicket]:
    """Filter tickets per config.auto_trigger_filters + no-running-run check."""
    filters = config.auto_trigger_filters or {}
    types = filters.get("ticket_types") or ["bug"]
    priorities = filters.get("priorities") or [
        "low", "medium", "high",
    ]  # default: everything but `critical` — too risky at night
    blocking_keywords = [
        k.lower() for k in (filters.get("blocking_keywords") or [
            "security", "auth", "payment", "migration", "delete",
        ])
    ]
    allowed_tags = filters.get("allowed_tags")  # None = any

    # Tickets that already have an active run are excluded.
    subq = (
        select(SupportAgentRun.ticket_id)
        .where(SupportAgentRun.status.in_([
            "pending", "preparing", "running", "awaiting_human",
        ]))
    )
    # Tickets that have a recent (<72h) run in any final state are
    # also excluded — avoid retrying a reject loop.
    subq_recent = (
        select(SupportAgentRun.ticket_id)
        .where(SupportAgentRun.created_at >= datetime.now(UTC) - timedelta(hours=72))
    )

    rows = (
        await db.execute(
            select(SupportTicket)
            .where(
                SupportTicket.entity_id == config.entity_id,
                SupportTicket.status.in_(("open", "in_progress")),
                SupportTicket.ticket_type.in_(types),
                SupportTicket.priority.in_(priorities),
                SupportTicket.id.notin_(subq),
                SupportTicket.id.notin_(subq_recent),
            )
            .order_by(SupportTicket.created_at)
            .limit(limit * 3)  # over-fetch so we can apply post-filters
        )
    ).scalars().all()

    result: list[SupportTicket] = []
    for t in rows:
        # Keyword blocklist on the title
        title = (t.title or "").lower()
        if any(kw in title for kw in blocking_keywords):
            continue
        # Tag whitelist, when set
        if allowed_tags:
            ticket_tags = set(t.tags or [])
            if not ticket_tags & set(allowed_tags):
                continue
        result.append(t)
        if len(result) >= limit:
            break
    return result


async def _resolve_system_user(db: AsyncSession):
    """Return a User instance representing the system trigger.

    We reuse the first active admin user as the `triggered_by` owner.
    `triggered_automatically=True` distinguishes the audit trail.
    """
    from app.models.common import User

    row = (
        await db.execute(
            select(User).where(User.active == True).order_by(User.created_at).limit(1)  # noqa: E712
        )
    ).scalar_one_or_none()
    if not row:
        raise RuntimeError("No active user to bind as triggered_by")
    return row


def _window_duration_hours(start: int | None, end: int | None) -> int:
    if start is None or end is None:
        return 24
    if start < end:
        return end - start
    return (24 - start) + end  # wrap-around


# ─── Daily digest loop ────────────────────────────────────────────────

async def _run_daily_digest_once() -> None:
    async with AsyncSessionLocal() as db:
        got = await _try_acquire_lock(db, _DIGEST_LOCK_ID)
        if not got:
            return
        try:
            now = datetime.now(UTC)
            configs = (
                await db.execute(
                    select(SupportAgentConfig).where(
                        SupportAgentConfig.enabled == True,  # noqa: E712
                        SupportAgentConfig.auto_report_email.isnot(None),
                    )
                )
            ).scalars().all()

            for config in configs:
                # Only send once per day, at the configured hour.
                if now.hour != config.auto_report_hour_utc:
                    continue
                if config.last_digest_sent_at and (
                    now - config.last_digest_sent_at < timedelta(hours=23)
                ):
                    continue
                try:
                    await _send_digest_for_entity(db, config, now)
                    config.last_digest_sent_at = now
                    await db.commit()
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Digest send failed for entity %s", config.entity_id,
                    )
                    await db.rollback()
        finally:
            await db.execute(
                text("SELECT pg_advisory_unlock(:id)").bindparams(id=_DIGEST_LOCK_ID),
            )


async def _send_digest_for_entity(
    db: AsyncSession, config: SupportAgentConfig, now: datetime,
) -> None:
    """Aggregate last 24h + send HTML email."""
    since = now - timedelta(hours=24)
    runs = (
        await db.execute(
            select(SupportAgentRun)
            .where(
                SupportAgentRun.entity_id == config.entity_id,
                SupportAgentRun.created_at >= since,
            )
            .order_by(SupportAgentRun.created_at.desc())
        )
    ).scalars().all()

    if not runs:
        logger.info(
            "No runs in last 24h for entity %s — sending empty digest",
            config.entity_id,
        )

    # Stats
    total = len(runs)
    completed = sum(1 for r in runs if r.status == "completed")
    awaiting = sum(1 for r in runs if r.status == "awaiting_human")
    failed = sum(1 for r in runs if r.status in ("failed", "failed_and_reverted"))
    rejected = sum(1 for r in runs if r.status == "rejected")
    total_tokens = sum(int(r.llm_tokens_used or 0) for r in runs)
    total_cost = sum(float(r.llm_cost_usd or 0) for r in runs)

    # Build rows
    from app.models.support import SupportTicket

    ticket_ids = {r.ticket_id for r in runs}
    tickets_map: dict[UUID, SupportTicket] = {}
    if ticket_ids:
        ticket_rows = (
            await db.execute(
                select(SupportTicket).where(SupportTicket.id.in_(ticket_ids))
            )
        ).scalars().all()
        tickets_map = {t.id: t for t in ticket_rows}

    rows_html = []
    for r in runs[:50]:  # cap at 50 most recent for email size
        t = tickets_map.get(r.ticket_id)
        ref = t.reference if t else "?"
        title = (t.title if t else "?")[:80]
        pr_cell = (
            f'<a href="{r.github_pr_url}">#{r.github_pr_number}</a>'
            if r.github_pr_url else "—"
        )
        status_color = {
            "completed": "#16a34a", "awaiting_human": "#2563eb",
            "failed": "#dc2626", "failed_and_reverted": "#dc2626",
            "rejected": "#6b7280", "cancelled": "#6b7280",
            "running": "#ca8a04", "pending": "#ca8a04",
        }.get(r.status, "#6b7280")
        rows_html.append(f'''
        <tr>
          <td style="padding:6px 10px;font-family:monospace;font-size:11px;">{ref}</td>
          <td style="padding:6px 10px;font-size:12px;">{title}</td>
          <td style="padding:6px 10px;">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;
                         background:{status_color};color:#fff;font-size:11px;">
              {r.status}
            </span>
          </td>
          <td style="padding:6px 10px;text-align:right;font-size:11px;">
            {int(r.llm_tokens_used or 0):,}
          </td>
          <td style="padding:6px 10px;text-align:right;font-size:11px;">
            ${float(r.llm_cost_usd or 0):.3f}
          </td>
          <td style="padding:6px 10px;text-align:center;">{pr_cell}</td>
        </tr>
        ''')

    html = f'''
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;background:#111827;color:#fff;">
      <h1 style="margin:0;font-size:18px;">🤖 Agent OPSFLUX — rapport quotidien</h1>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.8;">
        Activité des 24 dernières heures · {now.strftime('%Y-%m-%d %H:%M UTC')}
      </p>
    </div>

    <div style="padding:20px;display:flex;flex-wrap:wrap;gap:12px;">
      <div style="flex:1;min-width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
        <div style="font-size:10px;text-transform:uppercase;color:#6b7280;">Runs</div>
        <div style="font-size:24px;font-weight:700;">{total}</div>
      </div>
      <div style="flex:1;min-width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
        <div style="font-size:10px;text-transform:uppercase;color:#16a34a;">Complétés</div>
        <div style="font-size:24px;font-weight:700;color:#16a34a;">{completed}</div>
      </div>
      <div style="flex:1;min-width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
        <div style="font-size:10px;text-transform:uppercase;color:#2563eb;">À review</div>
        <div style="font-size:24px;font-weight:700;color:#2563eb;">{awaiting}</div>
      </div>
      <div style="flex:1;min-width:100px;border:1px solid #e5e7eb;border-radius:6px;padding:10px;">
        <div style="font-size:10px;text-transform:uppercase;color:#dc2626;">Échecs</div>
        <div style="font-size:24px;font-weight:700;color:#dc2626;">{failed}</div>
      </div>
    </div>

    <div style="padding:0 20px 20px;">
      <div style="padding:10px;background:#f9fafb;border-radius:6px;font-size:12px;">
        <strong>Consommation :</strong> {total_tokens:,} tokens · ${total_cost:.3f} USD
        &nbsp;·&nbsp;
        Budget restant ce mois : ${float(config.monthly_budget_usd) - float(config.current_month_spent_usd):.2f} / ${float(config.monthly_budget_usd):.0f}
      </div>
    </div>

    { '<div style="padding:0 20px 20px;"><p style="text-align:center;color:#6b7280;font-size:13px;">Aucun run cette nuit.</p></div>' if total == 0 else f"""
    <div style="padding:0 20px 20px;">
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Ticket</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Titre</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Statut</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;">Tokens</th>
            <th style="padding:8px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;">Coût</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;">PR</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows_html)}
        </tbody>
      </table>
    </div>
    """}

    <div style="padding:15px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">
      {('⚠ <strong>Review requise :</strong> {} run(s) attendent ton approbation sur '
        '<a href="https://app.opsflux.io/support">app.opsflux.io/support</a>.'.format(awaiting)
        if awaiting > 0 else '✓ Rien ne nécessite ton intervention immédiate.')}
    </div>
  </div>
</body></html>
    '''.strip()

    # Send via aiosmtplib directly — no template seeding needed.
    import aiosmtplib
    from email.message import EmailMessage

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM_ADDRESS", smtp_user or "noreply@opsflux.io")
    smtp_from_name = os.getenv("SMTP_FROM_NAME", "OpsFlux Agent")

    if not (smtp_host and smtp_user and smtp_pass):
        logger.warning("SMTP not configured — skipping digest")
        return

    msg = EmailMessage()
    msg["Subject"] = f"🤖 Agent OPSFLUX — {total} run(s) dans les dernières 24h"
    msg["From"] = f"{smtp_from_name} <{smtp_from}>"
    msg["To"] = config.auto_report_email
    msg.set_content(
        f"Rapport agent OPSFLUX — {total} runs, {completed} complétés, "
        f"{awaiting} à review, {failed} échecs. "
        f"Consulte le HTML pour le détail."
    )
    msg.add_alternative(html, subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=smtp_host,
        port=smtp_port,
        username=smtp_user,
        password=smtp_pass,
        use_tls=True,
    )
    logger.info(
        "Digest sent to %s (entity=%s, runs=%d, cost=$%.3f)",
        config.auto_report_email, config.entity_id, total, total_cost,
    )


# ─── Loops ────────────────────────────────────────────────────────────

async def auto_trigger_loop() -> None:
    """Infinite loop that calls _run_auto_trigger_once every 5 min."""
    logger.info("Agent auto-trigger loop started (interval=%ds)", _TRIGGER_INTERVAL_S)
    while True:
        try:
            await _run_auto_trigger_once()
        except Exception:  # noqa: BLE001
            logger.exception("Auto-trigger pass crashed")
        await asyncio.sleep(_TRIGGER_INTERVAL_S)


async def daily_digest_loop() -> None:
    """Infinite loop that calls _run_daily_digest_once every 15 min."""
    logger.info("Agent daily-digest loop started (interval=%ds)", _DIGEST_INTERVAL_S)
    while True:
        try:
            await _run_daily_digest_once()
        except Exception:  # noqa: BLE001
            logger.exception("Digest pass crashed")
        await asyncio.sleep(_DIGEST_INTERVAL_S)


async def send_digest_now(db: AsyncSession, entity_id: UUID) -> dict[str, Any]:
    """Admin-triggered digest send for preview / testing."""
    config = (
        await db.execute(
            select(SupportAgentConfig).where(SupportAgentConfig.entity_id == entity_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise ValueError("Agent config not found for entity")
    if not config.auto_report_email:
        raise ValueError("auto_report_email is not set")
    await _send_digest_for_entity(db, config, datetime.now(UTC))
    return {
        "sent_to": config.auto_report_email,
        "timestamp": datetime.now(UTC).isoformat(),
    }
