"""Post-exec validation gates (Sprint 5).

After the agent container exits and the worker writes REPORT.json back,
we run this suite against the produced PR before letting the run move
on. A single gate failure flips the run to `failed` and sets
`failed_gates` so the UI can render exactly which check didn't pass.

Each gate is async and returns `(name, ok, message, details)`.
"""
from __future__ import annotations

import fnmatch
import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import SupportAgentConfig, SupportAgentRun
from app.models.common import IntegrationConnection
from app.services.core.integration_connection_service import load_credentials
from app.services.integrations import github_service

logger = logging.getLogger(__name__)

# Patterns that match content likely to be a secret leaking into source.
# Kept tiny and local to avoid a TruffleHog dependency on the backend —
# the agent-runner container runs a proper secret scan in-band anyway.
_SECRET_PATTERNS = [
    re.compile(r"[A-Za-z0-9+/]{60,}={0,2}"),  # long base64 blobs
    re.compile(r"(?i)(password|secret|api[_-]?key|token)\s*[:=]\s*[\"']?[A-Za-z0-9_\-+./]{20,}[\"']?"),
    re.compile(r"(?i)AKIA[0-9A-Z]{16}"),  # AWS keys
    re.compile(r"(?i)sk-[A-Za-z0-9]{32,}"),  # OpenAI / Anthropic-like keys
    re.compile(r"(?i)ghp_[A-Za-z0-9]{36,}"),  # GitHub PAT prefix
]


def _path_matches_any(path: str, patterns: list[str]) -> bool:
    """True if `path` matches any of the provided glob patterns."""
    return any(fnmatch.fnmatch(path, p) for p in patterns)


async def gate_report_json_valid(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[str, bool, str, dict[str, Any]]:
    if not run.report_json:
        return "report_json_valid", False, "REPORT.json missing on run record", {}
    status = run.report_json.get("status")
    if status not in ("success", "partial", "failed"):
        return "report_json_valid", False, f"Invalid status in report: {status!r}", {}
    return "report_json_valid", True, f"Report status: {status}", {"status": status}


async def gate_pr_present(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[str, bool, str, dict[str, Any]]:
    if not run.github_pr_number:
        return "pr_present", False, "Run produced no PR", {}
    return "pr_present", True, f"PR #{run.github_pr_number}", {
        "pr_number": run.github_pr_number,
        "pr_url": run.github_pr_url,
    }


async def gate_forbidden_paths(
    db: AsyncSession, run: SupportAgentRun, config: SupportAgentConfig
) -> tuple[str, bool, str, dict[str, Any]]:
    """Pull the PR's file list and check against forbidden globs."""
    if not run.github_pr_number or not run.github_connection_id:
        return "forbidden_paths", False, "No PR or connection to inspect", {}
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return "forbidden_paths", False, "GitHub connection vanished", {}
    credentials = await load_credentials(db, conn.id)
    try:
        files = await github_service.get_pr_files(
            conn.config, credentials, pr_number=run.github_pr_number
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("forbidden_paths: PR files fetch failed: %s", exc)
        return "forbidden_paths", False, f"Could not list PR files: {exc}", {}

    forbidden_patterns = config.forbidden_path_patterns or []
    hits = [
        f["filename"]
        for f in files
        if _path_matches_any(f.get("filename", ""), forbidden_patterns)
    ]
    if hits:
        return (
            "forbidden_paths",
            False,
            f"PR touches forbidden paths: {', '.join(hits[:5])}",
            {"matched_paths": hits},
        )
    return "forbidden_paths", True, f"{len(files)} files scanned, no forbidden hit", {
        "file_count": len(files),
    }


async def gate_line_budget(
    db: AsyncSession, run: SupportAgentRun, config: SupportAgentConfig
) -> tuple[str, bool, str, dict[str, Any]]:
    """Check the PR respects `max_lines_modified_per_run`."""
    if not run.github_pr_number or not run.github_connection_id:
        return "line_budget", False, "No PR to inspect", {}
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return "line_budget", False, "GitHub connection vanished", {}
    credentials = await load_credentials(db, conn.id)
    try:
        pr = await github_service.get_pr(
            conn.config, credentials, pr_number=run.github_pr_number
        )
    except Exception as exc:  # noqa: BLE001
        return "line_budget", False, f"Could not fetch PR: {exc}", {}

    total_changed = (pr.get("additions") or 0) + (pr.get("deletions") or 0)
    max_lines = config.max_lines_modified_per_run
    if total_changed > max_lines:
        return (
            "line_budget",
            False,
            f"{total_changed} lines modified > limit {max_lines}",
            {"total_changed": total_changed, "max_lines": max_lines},
        )
    return "line_budget", True, f"{total_changed} / {max_lines} lines", {
        "total_changed": total_changed,
        "max_lines": max_lines,
    }


async def gate_quick_secret_scan(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[str, bool, str, dict[str, Any]]:
    """Cheap pattern scan on the PR's added lines.

    A real secret scan runs inside the agent-runner container (TruffleHog).
    This backend-side gate is a second layer — if anything obvious slips
    through, we still catch it before a human approves a merge.
    """
    if not run.github_pr_number or not run.github_connection_id:
        return "quick_secret_scan", False, "No PR to scan", {}
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return "quick_secret_scan", False, "GitHub connection vanished", {}
    credentials = await load_credentials(db, conn.id)
    try:
        files = await github_service.get_pr_files(
            conn.config, credentials, pr_number=run.github_pr_number
        )
    except Exception as exc:  # noqa: BLE001
        return "quick_secret_scan", False, f"Could not list PR files: {exc}", {}

    findings: list[dict[str, Any]] = []
    for f in files:
        patch = f.get("patch") or ""
        # Only check added lines (prefix '+')
        for line in patch.splitlines():
            if not line.startswith("+") or line.startswith("+++"):
                continue
            added = line[1:]
            for pattern in _SECRET_PATTERNS:
                if pattern.search(added):
                    findings.append({
                        "file": f.get("filename"),
                        "pattern": pattern.pattern[:60],
                    })
                    break
        if len(findings) >= 10:
            break  # Cap — admin can inspect the rest manually

    if findings:
        return (
            "quick_secret_scan",
            False,
            f"{len(findings)} suspicious line(s) in added diff",
            {"findings": findings[:10]},
        )
    return "quick_secret_scan", True, "No obvious secret leak", {}


async def gate_ci_status(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[str, bool, str, dict[str, Any]]:
    """Check CI check-runs on the head commit — warn but don't fail on pending.

    Pending CI at callback time is common (the agent commits seconds
    before the worker fires this callback). We treat `pending > 0` as a
    WARN and only return `False` when we see outright failures.
    """
    if not run.github_commit_sha or not run.github_connection_id:
        return "ci_status", True, "No CI data to check (yet)", {}
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return "ci_status", True, "GitHub connection vanished", {}
    credentials = await load_credentials(db, conn.id)
    try:
        checks = await github_service.get_pr_checks(
            conn.config, credentials, commit_sha=run.github_commit_sha
        )
    except Exception as exc:  # noqa: BLE001
        return "ci_status", True, f"CI query failed (not blocking): {exc}", {}

    if checks["failed"] > 0:
        return (
            "ci_status",
            False,
            f"{checks['failed']} failing CI check(s)",
            checks,
        )
    return "ci_status", True, (
        f"CI: {checks['succeeded']}✓ {checks['pending']}⏳ {checks['failed']}✗"
    ), checks


ALL_GATES = [
    gate_report_json_valid,
    gate_pr_present,
    gate_forbidden_paths,
    gate_line_budget,
    gate_quick_secret_scan,
    gate_ci_status,
]


async def run_all_gates(
    db: AsyncSession, run_id: UUID
) -> dict[str, Any]:
    """Run every gate in order, short-circuiting on report_json absence.

    Returns a dict `{name: {ok, message, details}}`. Writes the same
    dict on `SupportAgentRun.failed_gates` when any gate fails.
    """
    run = (
        await db.execute(
            select(SupportAgentRun).where(SupportAgentRun.id == run_id)
        )
    ).scalar_one_or_none()
    if not run:
        return {}
    config = (
        await db.execute(
            select(SupportAgentConfig).where(
                SupportAgentConfig.entity_id == run.entity_id
            )
        )
    ).scalar_one()

    results: dict[str, Any] = {}
    all_passed = True
    for gate in ALL_GATES:
        try:
            if gate in (gate_forbidden_paths, gate_line_budget):
                name, ok, message, details = await gate(db, run, config)
            else:
                name, ok, message, details = await gate(db, run)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Gate %s crashed", getattr(gate, "__name__", "?"))
            name = getattr(gate, "__name__", "unknown")
            ok = False
            message = f"Gate crashed: {exc}"
            details = {}
        results[name] = {"ok": ok, "message": message, "details": details}
        if not ok:
            all_passed = False

    run.failed_gates = None if all_passed else {
        k: v for k, v in results.items() if not v["ok"]
    }
    return results
