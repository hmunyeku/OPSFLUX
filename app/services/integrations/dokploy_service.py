"""Dokploy integration — connection testing (Sprint 1 scope).

Reuses the Dokploy REST API already used by the `.env`-based deploy
scripts. A connector can target either an `application_id` (classic
single-container app) or a `compose_id` (docker-compose stack); the test
endpoint differs but both are covered here.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TEST_TIMEOUT_S = 15.0


async def test_connection(
    config: dict[str, Any],
    credentials: dict[str, Any],
) -> tuple[bool, str, dict[str, Any]]:
    """Verify a Dokploy connector is usable.

    Calls `GET /api/project.one?projectId=<id>` first to prove the token
    and project are valid, then confirms the application_id / compose_id
    exists in that project. Returns a details dict with the resolved
    application name so the admin can verify they targeted the right
    thing.
    """
    api_url = (config.get("api_url") or "").rstrip("/")
    project_id = config.get("project_id")
    application_id = config.get("application_id")
    compose_id = config.get("compose_id")
    api_token = credentials.get("api_token")

    if not (api_url and project_id and api_token):
        return False, "api_url, project_id and credentials.api_token are required", {}

    if not (application_id or compose_id):
        return False, "Either application_id or compose_id must be set", {}

    headers = {"x-api-key": api_token, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=_TEST_TIMEOUT_S) as client:
            # Step 1 — project reachable
            proj_resp = await client.get(
                f"{api_url}/project.one",
                params={"projectId": project_id},
                headers=headers,
            )
            if proj_resp.status_code == 401:
                return False, "Authentication rejected", {}
            if proj_resp.status_code == 404:
                return False, "Project not found", {}
            proj_resp.raise_for_status()
            proj_data = proj_resp.json()

            # Step 2 — resource reachable
            if compose_id:
                res_resp = await client.get(
                    f"{api_url}/compose.one",
                    params={"composeId": compose_id},
                    headers=headers,
                )
                res_kind = "compose"
                res_id_field = "composeId"
            else:
                res_resp = await client.get(
                    f"{api_url}/application.one",
                    params={"applicationId": application_id},
                    headers=headers,
                )
                res_kind = "application"
                res_id_field = "applicationId"

            if res_resp.status_code == 404:
                return False, f"{res_kind.capitalize()} not found in project", {}
            res_resp.raise_for_status()
            res_data = res_resp.json()

        details = {
            "project_name": proj_data.get("name"),
            "resource_kind": res_kind,
            "resource_name": res_data.get("name") or res_data.get("appName"),
            res_id_field: compose_id or application_id,
            "current_status": res_data.get("composeStatus") or res_data.get("applicationStatus"),
        }
        label = details["resource_name"] or details.get(res_id_field)
        return True, f"Connected to Dokploy {res_kind} '{label}'", details

    except httpx.HTTPError as exc:
        logger.warning("Dokploy test HTTP error: %s", exc)
        return False, f"HTTP error: {exc}", {}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected Dokploy test failure")
        return False, f"Unexpected error: {exc}", {}
