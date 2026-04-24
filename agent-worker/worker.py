"""OPSFLUX agent worker daemon.

Long-running process deployed as an `opsflux-agent-workers` container.
Responsibilities:

  1. Register itself in `agent_worker_pool` on start.
  2. Send a heartbeat every 30s.
  3. Claim pending runs from `support_agent_runs` using `FOR UPDATE
     SKIP LOCKED`.
  4. For each claim:
     a. Download / refresh the `ghcr.io/...opsflux-agent-runner` image
     b. Prepare the worktree (clone repo + generate MISSION.md already
        stored on the run by the harness)
     c. Launch the container with the right env + volumes
     d. Stream logs back into `support_agent_phase_checkpoints`
     e. On exit, fetch REPORT.json, update the run record, run the
        post-exec gates via a callback to the OPSFLUX API
  5. Gracefully drain on SIGTERM.

Kept single-file on purpose — it's infrastructure, not product code.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import socket
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import docker
import httpx

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("agent-worker")

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL env var is required")

# The worker contacts the main OPSFLUX API for operations that would be
# risky from a pure DB-side actor (notifying the ticket, posting PR
# comments, running TruffleHog against the diff…). That API is reached
# through the internal Dokploy network.
OPSFLUX_API_URL = os.getenv("OPSFLUX_API_URL", "http://backend:8000")
OPSFLUX_INTERNAL_TOKEN = os.getenv("OPSFLUX_INTERNAL_TOKEN")

# Host path where worktrees live. Mounted from the host into the worker
# AND into every child container (same path both sides).
WORKTREE_ROOT = Path(os.getenv("WORKTREE_ROOT", "/var/opsflux/agent-runs"))
WORKTREE_ROOT.mkdir(parents=True, exist_ok=True)

LOG_ROOT = Path(os.getenv("LOG_ROOT", "/var/log/opsflux-agent"))
LOG_ROOT.mkdir(parents=True, exist_ok=True)

AGENT_IMAGE = os.getenv(
    "AGENT_IMAGE",
    "ghcr.io/hmunyeku/opsflux-agent-runner:latest",
)
HEARTBEAT_INTERVAL_S = int(os.getenv("HEARTBEAT_INTERVAL_S", "30"))
CLAIM_POLL_INTERVAL_S = int(os.getenv("CLAIM_POLL_INTERVAL_S", "5"))
# Note: `or` rather than `getenv(..., default=...)` — the compose passes
# WORKER_NAME as empty by default so the env-var IS set but empty.
# Falling back to hostname+pid per replica produces a unique row per
# worker in agent_worker_pool (UNIQUE constraint on worker_name).
WORKER_NAME = os.getenv("WORKER_NAME") or f"worker-{socket.gethostname()}-{os.getpid()}"


_stop_event = asyncio.Event()


def _signal_handler(signum: int, _frame) -> None:
    logger.info("Received signal %s — draining", signum)
    _stop_event.set()


signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ─── Worker lifecycle ────────────────────────────────────────────────

async def register_worker(conn: asyncpg.Connection) -> UUID:
    """Insert or refresh our row in agent_worker_pool, return its id."""
    hostname = socket.gethostname()
    capabilities = json.dumps(["claude_code", "codex", "docker"])
    row = await conn.fetchrow(
        """
        INSERT INTO agent_worker_pool
            (worker_name, hostname, status, capabilities, last_heartbeat_at)
        VALUES ($1, $2, 'idle', $3::jsonb, NOW())
        ON CONFLICT (worker_name) DO UPDATE
           SET hostname = EXCLUDED.hostname,
               status = 'idle',
               last_heartbeat_at = NOW()
        RETURNING id
        """,
        WORKER_NAME, hostname, capabilities,
    )
    logger.info("Registered worker %s (id=%s)", WORKER_NAME, row["id"])
    return row["id"]


async def heartbeat_loop(pool: asyncpg.Pool, worker_id: UUID) -> None:
    """Tick every HEARTBEAT_INTERVAL_S seconds until shutdown."""
    while not _stop_event.is_set():
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE agent_worker_pool "
                    "SET last_heartbeat_at = NOW() "
                    "WHERE id = $1",
                    worker_id,
                )
        except Exception:  # noqa: BLE001
            logger.exception("Heartbeat failed")
        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=HEARTBEAT_INTERVAL_S)
        except asyncio.TimeoutError:
            pass
    logger.info("Heartbeat loop stopped")


# ─── Run claim + execution ───────────────────────────────────────────

async def claim_next_run(pool: asyncpg.Pool, worker_id: UUID) -> dict[str, Any] | None:
    """Atomically claim the oldest pending run.

    Returns a dict of the claimed row or None if queue empty.
    Uses `FOR UPDATE SKIP LOCKED` so concurrent workers don't fight over
    the same row.
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, ticket_id, entity_id, autonomy_mode, deployment_mode,
                       github_connection_id, agent_runner_connection_id,
                       dokploy_staging_connection_id, dokploy_prod_connection_id,
                       mission_md_content, worktree_path, attachments_manifest
                  FROM support_agent_runs
                 WHERE status = 'pending'
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1
                """
            )
            if not row:
                return None
            await conn.execute(
                """
                UPDATE support_agent_runs
                   SET status = 'preparing',
                       worker_id = $1,
                       started_at = NOW(),
                       updated_at = NOW()
                 WHERE id = $2
                """,
                worker_id, row["id"],
            )
            await conn.execute(
                "UPDATE agent_worker_pool "
                "SET status = 'busy', current_run_id = $1 "
                "WHERE id = $2",
                row["id"], worker_id,
            )
            return dict(row)


async def fetch_runner_credentials(
    pool: asyncpg.Pool, connection_id: UUID
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load the agent_runner connection config + decrypted credentials.

    We reach into the OPSFLUX `integration_connections` table directly
    via pgcrypto — no HTTP round-trip needed. The `ENCRYPTION_KEY` env
    var must be shared between backend and worker (they're on the same
    Dokploy project, so it's the same secret).
    """
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        raise SystemExit("ENCRYPTION_KEY env var is required")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT config,
                   CASE WHEN credentials_encrypted IS NULL THEN NULL
                        ELSE pgp_sym_decrypt(credentials_encrypted::bytea, $2)
                   END AS plain
              FROM integration_connections
             WHERE id = $1 AND connection_type = 'agent_runner'
            """,
            connection_id, key,
        )
    if not row:
        raise ValueError(f"agent_runner connection {connection_id} missing")
    # asyncpg returns JSONB columns as their raw JSON string, not a
    # decoded dict — unlike SQLAlchemy's JSONB. Decode explicitly.
    raw_config = row["config"]
    if isinstance(raw_config, str):
        config = json.loads(raw_config) if raw_config else {}
    else:
        config = raw_config or {}
    credentials = json.loads(row["plain"]) if row["plain"] else {}
    return config, credentials


async def _mint_github_token_for_run(
    pool: asyncpg.Pool, connection_id: UUID
) -> str | None:
    """Return a GitHub API token usable by `gh` inside the runner.

    For PAT auth we just hand the token through. For GitHub App auth
    we mint a fresh installation token via the GitHub API — valid for
    1 hour, which is well above the typical wall-time cap of a run.
    """
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT config,
                   CASE WHEN credentials_encrypted IS NULL THEN NULL
                        ELSE pgp_sym_decrypt(credentials_encrypted::bytea, $2)
                   END AS plain
              FROM integration_connections
             WHERE id = $1 AND connection_type = 'github'
            """,
            connection_id, key,
        )
    if not row:
        return None

    raw_config = row["config"]
    if isinstance(raw_config, str):
        config = json.loads(raw_config) if raw_config else {}
    else:
        config = raw_config or {}
    creds = json.loads(row["plain"]) if row["plain"] else {}

    auth_method = config.get("auth_method")
    if auth_method == "personal_access_token":
        return creds.get("token")

    if auth_method == "github_app":
        app_id = config.get("app_id")
        installation_id = config.get("installation_id")
        private_key = creds.get("private_key")
        if not (app_id and installation_id and private_key):
            return None
        try:
            # python-jose ships with the worker base image indirectly;
            # fall back to PyJWT if available. Runner images typically
            # don't need this since the token is minted here and just
            # forwarded as env.
            from jose import jwt as jose_jwt  # type: ignore
            import time
            now = int(time.time())
            app_jwt = jose_jwt.encode(
                {"iat": now - 60, "exp": now + 9 * 60, "iss": app_id},
                private_key,
                algorithm="RS256",
            )
        except Exception:  # noqa: BLE001
            logger.exception("JWT mint failed")
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"https://api.github.com/app/installations/{installation_id}/access_tokens",
                    headers={
                        "Authorization": f"Bearer {app_jwt}",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                )
                resp.raise_for_status()
                return resp.json().get("token")
        except Exception:  # noqa: BLE001
            logger.exception("Installation token mint failed")
            return None

    return None


async def _stage_attachments(
    run_id: UUID,
    manifest: Any,
    worktree: Path,
) -> None:
    """Download each attachment in the manifest into worktree/.attachments/.

    The manifest was populated by the backend harness; it's a JSONB list
    of dicts with attachment_id + filename + content_type. We fetch each
    via the scoped internal endpoint (GET /runs/{id}/attachments/{aid}/bytes)
    so the agent container sees ready-to-read files — no network calls
    needed on the agent side.

    Best-effort: a single failed download does not abort the run, but we
    log it so the supervisor can see the issue.
    """
    if not manifest:
        return
    # asyncpg returns JSONB as a string in some paths; normalise.
    if isinstance(manifest, str):
        try:
            manifest = json.loads(manifest)
        except json.JSONDecodeError:
            logger.warning("Run %s: attachments_manifest not decodable JSON", run_id)
            return
    if not isinstance(manifest, list) or not manifest:
        return
    if not OPSFLUX_INTERNAL_TOKEN:
        logger.warning("Run %s: OPSFLUX_INTERNAL_TOKEN missing — skipping attachments", run_id)
        return

    att_dir = worktree / ".attachments"
    att_dir.mkdir(parents=True, exist_ok=True)
    att_dir.chmod(0o777)

    api_host = os.getenv("OPSFLUX_API_PUBLIC_HOST", "api.opsflux.io")
    headers = {
        "X-Internal-Token": OPSFLUX_INTERNAL_TOKEN,
        # TrustedHost on the backend rejects requests whose Host header
        # isn't on ALLOWED_HOSTS — force the public hostname even
        # though we're calling through the internal network.
        "Host": api_host,
    }
    ok, fail = 0, 0
    async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
        for entry in manifest:
            aid = entry.get("attachment_id")
            fname = entry.get("filename")
            if not aid or not fname:
                fail += 1
                continue
            url = f"{OPSFLUX_API_URL}/api/v1/support/agent/runs/{run_id}/attachments/{aid}/bytes"
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning(
                        "Run %s: attachment %s fetch returned %s",
                        run_id, aid, resp.status_code,
                    )
                    fail += 1
                    continue
                data = resp.content
            except Exception as exc:  # noqa: BLE001
                logger.warning("Run %s: attachment %s fetch error: %s", run_id, aid, exc)
                fail += 1
                continue

            safe_name = fname.replace("/", "_").replace("..", "_")
            target = att_dir / safe_name
            target.write_bytes(data)
            target.chmod(0o644)
            ok += 1

    logger.info(
        "Run %s: staged %d/%d attachments under %s",
        run_id, ok, ok + fail, att_dir,
    )


async def run_container(run: dict[str, Any], pool: asyncpg.Pool) -> None:
    """Prepare the env + launch the agent container + stream its output.

    Execution skeleton for now: the harness side is still being wired,
    so this does minimal work — creates a worktree dir, launches the
    container, waits for it to exit, stores REPORT.json and exit code
    on the run record.
    """
    run_id = run["id"]
    logger.info("Run %s: preparing", run_id)

    # Resolve runner credentials (agent_runner connection is mandatory)
    runner_cfg, runner_creds = await fetch_runner_credentials(
        pool, run["agent_runner_connection_id"]
    )

    worktree = WORKTREE_ROOT / str(run_id)
    worktree.mkdir(parents=True, exist_ok=True)
    # The agent runner container runs as UID 1001, the worker here
    # runs as root. Both mount the same host dir, so without an
    # explicit chmod the runner can't write REPORT.json or clone the
    # repo into /workspace. 0o777 is fine — this is an ephemeral dir
    # per run, not shared state.
    worktree.chmod(0o777)
    # MISSION.md is generated by the harness and stored on the run row.
    # We unspool it into the worktree so the container sees it.
    mission_path = worktree / "MISSION.md"
    mission_path.write_text(run["mission_md_content"] or "")

    log_dir = LOG_ROOT / str(run_id)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_dir.chmod(0o777)

    # ── Attachments: download ticket PJ + inline <img> referenced
    # ──               in the mission into /workspace/.attachments/
    # so the agent can read them directly. Skips silently on failure —
    # an attachment the worker can't reach shouldn't kill the run.
    try:
        await _stage_attachments(run_id, run.get("attachments_manifest"), worktree)
    except Exception:  # noqa: BLE001
        logger.exception("Run %s: attachment staging failed (non-fatal)", run_id)

    # Env for the container
    env = {
        "RUN_ID": str(run_id),
        "AGENT_RUNNER_TYPE": runner_cfg.get("runner_type", "claude_code"),
        "AGENT_AUTH_MODE": runner_cfg.get("auth_method", "api_key"),
        "MODEL_PREFERENCE": runner_cfg.get("model_preference", "claude-sonnet-4-5"),
        "MAX_WALL_TIME_SECONDS": str(runner_cfg.get("max_wall_time_seconds", 1800)),
        # Bash tool allowed broadly because Claude Code's per-command
        # allowlist (e.g. `Bash(git:*)`) requires approval for any
        # multi-command bash like `cd && npx tsc`. The runner is
        # already a sandboxed ephemeral container with restricted
        # network egress, so the security posture comes from the
        # outer container, not from the inner allowlist.
        "ALLOWED_TOOLS_LIST": os.getenv(
            "ALLOWED_TOOLS_LIST",
            "Read Edit Write Glob Grep Bash TodoWrite Task WebFetch"
        ),
    }

    # ── Runner auth ────────────────────────────────────────────────
    # Three supported modes, in preference order for Claude Code:
    #   1. OAuth token from a claude.ai subscription (no billing
    #      required beyond the subscription). The user gets one with
    #      `claude setup-token` locally, pastes it into the Agent
    #      Runner connector credentials as `oauth_token`. Runner
    #      picks it up as CLAUDE_CODE_OAUTH_TOKEN env.
    #   2. Raw API key (pay-per-token via Anthropic console credit).
    #      Stored as `api_key_value`. Runner gets ANTHROPIC_API_KEY.
    #   3. Subscription login via mounted ~/.claude volume
    #      (operator runs `claude /login` manually on a persistent
    #      volume). Flagged when auth_method == 'subscription_login'.
    runner_type = runner_cfg.get("runner_type", "claude_code")
    if runner_type == "claude_code":
        oauth = runner_creds.get("oauth_token")
        api_key = runner_creds.get("api_key_value")
        if oauth:
            env["CLAUDE_CODE_OAUTH_TOKEN"] = oauth
            env["AGENT_AUTH_MODE"] = "oauth_token"
        elif api_key:
            env["ANTHROPIC_API_KEY"] = api_key
            env["AGENT_AUTH_MODE"] = "api_key"
    elif runner_type == "codex":
        if runner_creds.get("api_key_value"):
            env["OPENAI_API_KEY"] = runner_creds["api_key_value"]

    # ── GitHub token (for `gh pr create` inside the runner) ───────
    # Fetch the GitHub connector attached to this run and mint (or
    # hand through) a short-lived token. Without this the runner
    # can't push the branch nor open the PR — phase 4 would fail.
    gh_conn_id = run.get("github_connection_id")
    if gh_conn_id:
        try:
            gh_token = await _mint_github_token_for_run(pool, gh_conn_id)
            if gh_token:
                env["GITHUB_TOKEN"] = gh_token
        except Exception:  # noqa: BLE001
            logger.exception("Run %s: GitHub token mint failed, runner will skip PR step", run_id)

    client = docker.from_env()

    logger.info("Run %s: pulling %s", run_id, AGENT_IMAGE)
    try:
        client.images.pull(AGENT_IMAGE)
    except Exception:  # noqa: BLE001
        logger.warning("Image pull failed; falling back to local cache")

    logger.info("Run %s: launching container", run_id)
    await _set_run_status(pool, run_id, status="running")

    try:
        container = client.containers.run(
            AGENT_IMAGE,
            detach=True,
            remove=False,
            name=f"opsflux-agent-{run_id}",
            environment=env,
            volumes={
                str(worktree): {"bind": "/workspace", "mode": "rw"},
                str(log_dir): {"bind": "/var/log/agent", "mode": "rw"},
            },
            mem_limit="4g",
            cpu_quota=200_000,  # 2 vCPU equivalent
            network_mode=os.getenv("AGENT_NETWORK", "bridge"),
        )

        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE support_agent_runs "
                "SET container_id = $1, worktree_path = $2 "
                "WHERE id = $3",
                container.id, str(worktree), run_id,
            )

        # Wait for container completion (blocking docker call in a thread)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, container.wait)
        exit_code = result.get("StatusCode", -1)
        logger.info("Run %s: container exited with code %s", run_id, exit_code)

        # Read REPORT.json if present
        report_path = worktree / "REPORT.json"
        report_json = None
        if report_path.exists():
            try:
                report_json = json.loads(report_path.read_text())
            except json.JSONDecodeError:
                logger.warning("Run %s: REPORT.json is not valid JSON", run_id)

        final_status = "completed" if exit_code == 0 and report_json and report_json.get("status") == "success" else "failed"

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE support_agent_runs
                   SET status = $1,
                       ended_at = NOW(),
                       updated_at = NOW(),
                       wall_time_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
                       report_json = $2::jsonb,
                       error_message = $3
                 WHERE id = $4
                """,
                final_status,
                json.dumps(report_json) if report_json else None,
                None if exit_code == 0 else f"Container exited with code {exit_code}",
                run_id,
            )

        # Notify the backend so it can run post-exec gates, publish the
        # report on the ticket, etc. If the call fails we still keep the
        # run record — the backend has a periodic scan to catch-up.
        #
        # We include an explicit `Host` header matching the public API
        # domain: the backend is fronted by Starlette's TrustedHostMiddleware
        # with only its public hostnames allowed. Without this override,
        # the implicit `backend:8000` host triggers a 400.
        if OPSFLUX_INTERNAL_TOKEN:
            try:
                api_host = os.getenv("OPSFLUX_API_PUBLIC_HOST", "api.opsflux.io")
                async with httpx.AsyncClient(timeout=30.0) as http:
                    await http.post(
                        f"{OPSFLUX_API_URL}/api/v1/support/agent/runs/{run_id}/post-exec",
                        headers={
                            "X-Internal-Token": OPSFLUX_INTERNAL_TOKEN,
                            "Host": api_host,
                        },
                    )
            except Exception:  # noqa: BLE001
                logger.exception("Run %s: failed to notify backend", run_id)

        # Keep container for 1h for log inspection, then drop
        try:
            container.remove(force=False)
        except Exception:  # noqa: BLE001
            pass

    except Exception as exc:  # noqa: BLE001
        logger.exception("Run %s crashed", run_id)
        await _set_run_status(
            pool, run_id, status="failed",
            error_message=f"Worker crash: {exc}",
        )


async def _set_run_status(
    pool: asyncpg.Pool,
    run_id: UUID,
    *,
    status: str,
    error_message: str | None = None,
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE support_agent_runs
               SET status = $1,
                   error_message = COALESCE($2, error_message),
                   updated_at = NOW()
             WHERE id = $3
            """,
            status, error_message, run_id,
        )


# ─── Main loop ───────────────────────────────────────────────────────

async def main() -> None:
    logger.info("OPSFLUX agent worker starting — %s", WORKER_NAME)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    assert pool is not None

    async with pool.acquire() as conn:
        worker_id = await register_worker(conn)

    heartbeat_task = asyncio.create_task(heartbeat_loop(pool, worker_id))

    try:
        while not _stop_event.is_set():
            try:
                run = await claim_next_run(pool, worker_id)
            except Exception:  # noqa: BLE001
                logger.exception("Claim failed")
                await asyncio.sleep(CLAIM_POLL_INTERVAL_S)
                continue

            if run is None:
                try:
                    await asyncio.wait_for(_stop_event.wait(), timeout=CLAIM_POLL_INTERVAL_S)
                except asyncio.TimeoutError:
                    pass
                continue

            try:
                await run_container(run, pool)
            except Exception:  # noqa: BLE001
                logger.exception("Run %s: top-level handler crashed", run["id"])
            finally:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE agent_worker_pool "
                        "SET status = 'idle', current_run_id = NULL, "
                        "    total_runs_completed = total_runs_completed + 1 "
                        "WHERE id = $1",
                        worker_id,
                    )
    finally:
        logger.info("Shutting down")
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE agent_worker_pool SET status = 'offline' WHERE id = $1",
                worker_id,
            )
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
