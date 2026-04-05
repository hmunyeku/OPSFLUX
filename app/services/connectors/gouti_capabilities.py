"""Gouti API capability probing & storage.

When the Gouti connector is configured and tested, we probe the remote API
to discover what is actually supported (read endpoints reachable, write
endpoints accepted). The result is persisted as an ``integration.gouti
.capabilities`` setting so the rest of the app (backend validators,
frontend UI) can apply read-only locks that match what Gouti itself allows.

The probe is cheap and read-only: it issues GET requests against a small
set of canonical endpoints and records which ones return 2xx. Write
capabilities are NOT live-probed (we refuse to mutate real data during a
test) — they are tracked via a static knowledge base derived from the
Gouti MCP tools' empirical findings. The knowledge base lives here so it
is the single source of truth and is easy to extend.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import Setting

logger = logging.getLogger(__name__)


# ── Static write capability knowledge base ─────────────────────────────────
#
# Gouti's API exposes read for almost everything under /v1/client, but write
# support is limited and undocumented. The Gouti MCP backend
# (app/mcp/gouti_tools.py) contains the canonical list of what it found to
# work through live testing against production. We mirror that here so
# OpsFlux can enforce the same rules at the edit boundary.
#
# Keys map resource types to the set of field names Gouti accepts in a PATCH.
# Empty set = fully read-only. ``None`` = unknown (no probe result yet).

_WRITABLE_FIELDS_BY_RESOURCE: dict[str, set[str]] = {
    # Projects: fully read-only per Gouti API v1/client
    "project": set(),
    # Tasks: only these fields can be PATCHed. progress_ta must be int 0-100.
    "task": {"name_ta", "description_ta", "status_ta", "progress_ta", "workload"},
    # Actions: name + description
    "action": {"name_ac", "description_ac"},
    # Issues: name + description
    "issue": {"name_is", "description_is"},
    # Fully read-only per MCP findings
    "organization": set(),
    "goal": set(),
    "deliverable": set(),
    "report": set(),
}

# Read endpoints probed during connector test. Each tuple is
# (resource_key, relative_path, whether auth errors should block the test).
# e-categories is our anchor endpoint — already used by _test_gouti today.
_READ_PROBE_ENDPOINTS: list[tuple[str, str]] = [
    ("e_categories", "/e-categories"),
    ("projects", "/projects"),
    ("users", "/users"),
]


def default_capabilities() -> dict[str, Any]:
    """Return a fresh baseline capability matrix (no live probe results)."""
    return {
        "probed_at": None,
        "reads": {key: None for key, _ in _READ_PROBE_ENDPOINTS},
        "writes": {res: sorted(fields) for res, fields in _WRITABLE_FIELDS_BY_RESOURCE.items()},
    }


async def probe_read_capabilities(
    base_url: str,
    auth_headers: dict[str, str],
    timeout: float = 10.0,
) -> dict[str, bool]:
    """GET each probe endpoint and return {resource_key: reachable}.

    Any non-2xx status (including timeouts and connection errors) is mapped
    to ``False``. Errors are logged but never raised — probing is best
    effort and must not block a valid connector test.
    """
    results: dict[str, bool] = {}
    base = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=timeout) as client:
        for key, path in _READ_PROBE_ENDPOINTS:
            try:
                resp = await client.get(f"{base}{path}", headers=auth_headers)
                results[key] = 200 <= resp.status_code < 300
            except Exception as exc:
                logger.debug("Gouti probe %s failed: %s", path, exc)
                results[key] = False
    return results


def build_capabilities(read_results: dict[str, bool]) -> dict[str, Any]:
    """Combine a live read probe result with the static write knowledge base."""
    return {
        "probed_at": datetime.now(timezone.utc).isoformat(),
        "reads": {key: read_results.get(key, False) for key, _ in _READ_PROBE_ENDPOINTS},
        "writes": {res: sorted(fields) for res, fields in _WRITABLE_FIELDS_BY_RESOURCE.items()},
    }


async def save_capabilities(
    db: AsyncSession, entity_id: UUID, capabilities: dict[str, Any]
) -> None:
    """Persist the capability matrix as integration.gouti.capabilities."""
    key = "integration.gouti.capabilities"
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = capabilities
    else:
        db.add(
            Setting(
                key=key,
                value=capabilities,
                scope="entity",
                scope_id=str(entity_id),
            )
        )
    await db.commit()


async def load_capabilities(
    db: AsyncSession, entity_id: UUID
) -> dict[str, Any]:
    """Fetch the cached capability matrix, falling back to defaults."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == "integration.gouti.capabilities",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row and isinstance(row.value, dict):
        # Merge with defaults so newly-added probe keys get sensible values.
        base = default_capabilities()
        base["reads"].update(row.value.get("reads") or {})
        base["writes"].update(row.value.get("writes") or {})
        base["probed_at"] = row.value.get("probed_at")
        return base
    return default_capabilities()


def is_field_writable(capabilities: dict[str, Any], resource: str, field: str) -> bool:
    """Check whether a given resource.field is writable per the capability matrix."""
    writes = capabilities.get("writes", {}) or {}
    allowed = writes.get(resource)
    if not allowed:
        return False
    return field in allowed
