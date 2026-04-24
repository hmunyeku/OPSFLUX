#!/usr/bin/env python3
"""Idempotent post-deploy setup for the autonomous-agent staging chain.

Run this **once after the first deploy** (or any time the staging chain
drifts out of sync). Subsequent runs are no-ops — everything is
detected via stable identifiers, never duplicated.

What it sets up end-to-end:

  1. **Dokploy staging environment** under the same project as the
     production compose (default: PERENCO → new env `staging`).
  2. **Dokploy staging compose** — same GitHub repo, `./docker-compose.staging.yml`
     path, branch parameterized via the deploy API per agent run.
     autoDeploy is DISABLED (we don't want a random push on an agent
     branch to auto-rebuild staging; the agent triggers it explicitly
     via deploy_and_verify.py).
  3. **OpsFlux `IntegrationConnection`** of type `dokploy` flagged
     `usage='staging'`, pointing at the new composeId, with the
     Dokploy API token encrypted via pgp_sym_encrypt.
  4. **Agent config** (`support_agent_config.default_dokploy_staging_id`)
     updated to point at this connection for every new run that
     doesn't override it.

Inputs — environment variables (all REQUIRED except marked optional):

    DOKPLOY_API_URL           e.g. http://72.60.188.156:3000/api
    DOKPLOY_API_TOKEN         the master API key
    DOKPLOY_PROJECT_ID        project that holds the existing prod compose
    DOKPLOY_PROD_COMPOSE_ID   the prod compose — used to clone env vars

    DATABASE_URL              postgresql://...
    ENCRYPTION_KEY            same as backend (for pgp_sym_encrypt)
    ENTITY_ID                 OPTIONAL — defaults to 'all entities with
                              a default_github_connection_id'

Usage:
    python scripts/setup_agent_staging.py

Safe to re-run: detects existing env / compose / connector by name and
skips creation if already present. If you change DOMAIN or other
variables, re-running updates the compose env in place.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any
from uuid import uuid4

import asyncpg
import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("setup-staging")


STAGING_ENV_NAME = "staging"
STAGING_COMPOSE_NAME = "OPSFLUX-staging"
STAGING_COMPOSE_PATH = "./docker-compose.staging.yml"


def _req(name: str) -> str:
    v = os.getenv(name)
    if not v:
        logger.error("Missing required env var: %s", name)
        sys.exit(2)
    return v


async def _dokploy(client: httpx.AsyncClient, method: str, path: str, **kw: Any) -> Any:
    r = await client.request(method, path, **kw)
    if r.status_code >= 400:
        logger.error("Dokploy %s %s → %s: %s", method, path, r.status_code, r.text[:300])
        r.raise_for_status()
    return r.json() if r.content else {}


async def ensure_staging_env(client: httpx.AsyncClient, project_id: str) -> str:
    """Return the staging environmentId, creating it if missing."""
    project = await _dokploy(client, "GET", "/project.one", params={"projectId": project_id})
    for e in project.get("environments", []):
        if e.get("name") == STAGING_ENV_NAME:
            logger.info("Reusing existing environment '%s' (id=%s)", STAGING_ENV_NAME, e["environmentId"])
            return e["environmentId"]
    created = await _dokploy(
        client, "POST", "/environment.create",
        json={
            "projectId": project_id,
            "name": STAGING_ENV_NAME,
            "description": "Staging pour vérification des PR agent IA (redeploy per-run).",
        },
    )
    logger.info("Created environment '%s' (id=%s)", STAGING_ENV_NAME, created["environmentId"])
    return created["environmentId"]


async def ensure_staging_compose(
    client: httpx.AsyncClient,
    env_id: str,
    prod_compose: dict[str, Any],
    staging_env_vars: str,
) -> str:
    """Return the staging composeId, creating and configuring it if missing."""
    # Find existing by name (no filter param — list all then filter).
    all_in_env = await _dokploy(client, "GET", "/environment.one", params={"environmentId": env_id})
    for c in all_in_env.get("compose", []):
        if c.get("name") == STAGING_COMPOSE_NAME:
            logger.info("Reusing existing staging compose (id=%s)", c["composeId"])
            # Update env vars in case DOMAIN / secrets changed.
            await _dokploy(
                client, "POST", "/compose.update",
                json={"composeId": c["composeId"], "env": staging_env_vars},
            )
            logger.info("Updated staging compose env vars")
            return c["composeId"]

    # Create new compose.
    created = await _dokploy(
        client, "POST", "/compose.create",
        json={
            "name": STAGING_COMPOSE_NAME,
            "description": "Staging pour vérification PR agent IA — redeploy sur une branche par run.",
            "environmentId": env_id,
            "composeType": "docker-compose",
        },
    )
    compose_id = created["composeId"]
    logger.info("Created staging compose (id=%s)", compose_id)

    # Wire GitHub source + path + disable autoDeploy. We clone the GH
    # provider reference from the prod compose so we don't need to
    # re-authenticate a fresh GitHub App installation.
    await _dokploy(
        client, "POST", "/compose.update",
        json={
            "composeId": compose_id,
            "sourceType": "github",
            "githubId": prod_compose.get("githubId"),
            "owner": prod_compose.get("owner"),
            "repository": prod_compose.get("repository"),
            "branch": "main",  # default — agent overrides per-deploy
            "composePath": STAGING_COMPOSE_PATH,
            "autoDeploy": False,  # only agent-triggered
            "env": staging_env_vars,
            "isolatedDeployment": True,  # separate network / volumes from prod
        },
    )
    logger.info("Configured staging compose (github source, path=%s, autoDeploy=false)", STAGING_COMPOSE_PATH)
    return compose_id


def _build_staging_env_vars(prod_env: str, domain_suffix: str = "staging.opsflux.io") -> str:
    """Derive staging env vars from prod env.

    The prod env is a flat KEY=VALUE text block. We clone it and only
    override what MUST differ: DOMAIN (so staging uses a different
    hostname) and BUILD_ID (so VITE_API_URL compiles into the
    staging frontend).
    """
    lines = []
    seen_keys: set[str] = set()
    for raw in (prod_env or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            lines.append(raw)
            continue
        if "=" in line:
            key = line.split("=", 1)[0]
            seen_keys.add(key)
            if key == "DOMAIN":
                lines.append(f"DOMAIN={domain_suffix}")
                continue
        lines.append(raw)
    if "DOMAIN" not in seen_keys:
        lines.append(f"DOMAIN={domain_suffix}")
    # Tag the env so ops sees this isn't prod.
    lines.append("# ── Auto-set by setup_agent_staging.py ──")
    lines.append("ENVIRONMENT=staging")
    return "\n".join(lines)


async def ensure_db_connector(
    pool: asyncpg.Pool,
    dokploy_api_url: str,
    dokploy_api_token: str,
    staging_compose_id: str,
    encryption_key: str,
) -> str:
    """Insert/update the `dokploy` IntegrationConnection for staging.

    The API token is encrypted via Postgres `pgp_sym_encrypt` with the
    same ENCRYPTION_KEY the backend uses — matching existing
    `integration_connections` rows.
    """
    staging_url = f"https://staging.opsflux.io"
    async with pool.acquire() as conn:
        # Find existing staging connector by compose_id in config.
        row = await conn.fetchrow(
            """
            SELECT id FROM integration_connections
             WHERE connection_type = 'dokploy'
               AND (config->>'compose_id') = $1
               AND deleted_at IS NULL
             LIMIT 1
            """,
            staging_compose_id,
        )
        connector_id: str
        if row:
            connector_id = str(row["id"])
            logger.info("Reusing existing Dokploy staging connector (id=%s)", connector_id)
            # Refresh token + config in case they rotated.
            await conn.execute(
                """
                UPDATE integration_connections
                   SET config = $1::jsonb,
                       credentials_encrypted = pgp_sym_encrypt($2, $3),
                       name = $4,
                       updated_at = NOW()
                 WHERE id = $5::uuid
                """,
                json.dumps({
                    "api_url": dokploy_api_url,
                    "compose_id": staging_compose_id,
                    "usage": "staging",
                    "health_check_url": staging_url,
                }),
                json.dumps({"api_token": dokploy_api_token}),
                encryption_key,
                "Dokploy staging (agent verify)",
                connector_id,
            )
        else:
            connector_id = str(uuid4())
            await conn.execute(
                """
                INSERT INTO integration_connections
                    (id, connection_type, name, config, credentials_encrypted,
                     is_active, created_at, updated_at)
                VALUES
                    ($1::uuid, 'dokploy', $2, $3::jsonb,
                     pgp_sym_encrypt($4, $5), TRUE, NOW(), NOW())
                """,
                connector_id,
                "Dokploy staging (agent verify)",
                json.dumps({
                    "api_url": dokploy_api_url,
                    "compose_id": staging_compose_id,
                    "usage": "staging",
                    "health_check_url": staging_url,
                }),
                json.dumps({"api_token": dokploy_api_token}),
                encryption_key,
            )
            logger.info("Created new Dokploy staging connector (id=%s)", connector_id)
    return connector_id


async def wire_connector_on_agent_config(pool: asyncpg.Pool, connector_id: str, entity_id_filter: str | None) -> None:
    """Set `default_dokploy_staging_id` on every matching agent config."""
    async with pool.acquire() as conn:
        if entity_id_filter:
            updated = await conn.fetchval(
                """
                UPDATE support_agent_config
                   SET default_dokploy_staging_id = $1::uuid, updated_at = NOW()
                 WHERE entity_id = $2::uuid
                 RETURNING entity_id
                """,
                connector_id, entity_id_filter,
            )
            if updated:
                logger.info("Wired connector on agent_config for entity %s", updated)
            else:
                logger.warning("No support_agent_config row for entity %s", entity_id_filter)
        else:
            rows = await conn.fetch(
                """
                UPDATE support_agent_config
                   SET default_dokploy_staging_id = $1::uuid, updated_at = NOW()
                 WHERE default_github_connection_id IS NOT NULL
                   AND (default_dokploy_staging_id IS NULL OR default_dokploy_staging_id <> $1::uuid)
                 RETURNING entity_id
                """,
                connector_id,
            )
            for r in rows:
                logger.info("Wired connector on agent_config for entity %s", r["entity_id"])
            if not rows:
                logger.info("All matching agent configs already pointed at this connector")


async def main() -> None:
    api_url = _req("DOKPLOY_API_URL").rstrip("/")
    api_token = _req("DOKPLOY_API_TOKEN")
    project_id = _req("DOKPLOY_PROJECT_ID")
    prod_compose_id = _req("DOKPLOY_PROD_COMPOSE_ID")
    db_url = _req("DATABASE_URL")
    encryption_key = _req("ENCRYPTION_KEY")
    entity_id = os.getenv("ENTITY_ID")  # optional

    async with httpx.AsyncClient(
        base_url=api_url,
        headers={"x-api-key": api_token, "Content-Type": "application/json"},
        timeout=30.0,
    ) as client:
        prod_compose = await _dokploy(client, "GET", "/compose.one", params={"composeId": prod_compose_id})
        logger.info("Loaded prod compose '%s' (branch=%s, env vars=%d bytes)",
                    prod_compose.get("name"), prod_compose.get("branch"),
                    len(prod_compose.get("env") or ""))

        staging_env_id = await ensure_staging_env(client, project_id)
        staging_env_vars = _build_staging_env_vars(prod_compose.get("env") or "")
        staging_compose_id = await ensure_staging_compose(
            client, staging_env_id, prod_compose, staging_env_vars,
        )

    pool = await asyncpg.create_pool(db_url, min_size=1, max_size=2)
    try:
        connector_id = await ensure_db_connector(
            pool, api_url, api_token, staging_compose_id, encryption_key,
        )
        await wire_connector_on_agent_config(pool, connector_id, entity_id)
    finally:
        await pool.close()

    logger.info("")
    logger.info("✅ Staging chain ready:")
    logger.info("   Dokploy staging composeId: %s", staging_compose_id)
    logger.info("   OpsFlux connector id     : %s", connector_id)
    logger.info("   Next PR agent run will see 'Déployer + vérifier (staging)' active.")


if __name__ == "__main__":
    asyncio.run(main())
