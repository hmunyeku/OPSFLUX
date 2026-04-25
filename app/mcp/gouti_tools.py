"""Native Gouti MCP tools — async API client + 43 data tool definitions.

Replaces the external mcp-gouti container with native tool handlers
served directly from OpsFlux via the MCP Gateway.
"""

import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Input validation (ported from mcp-gouti security.py)
# ═══════════════════════════════════════════════════════════════════════════════

_SAFE_SEGMENT = re.compile(r"^[a-zA-Z0-9_\-.@]+$")
_DATE_FMT = re.compile(r"^\d{2}-\d{2}-\d{4}$")
_YEAR_FMT = re.compile(r"^\d{4}$")
_WEEK_FMT = re.compile(r"^\d{1,2}$")


def _seg(val: str, name: str) -> str:
    """Validate a single URL path segment."""
    val = val.strip()
    if not val:
        raise ValueError(f"{name} requis.")
    if "\x00" in val or ".." in val or "/" in val or "\\" in val:
        raise ValueError(f"{name} contient un caractère interdit.")
    if not _SAFE_SEGMENT.match(val):
        raise ValueError(f"{name}: caractères non autorisés.")
    return val


def _path_validate(val: str, name: str) -> str:
    """Validate a multi-segment API path."""
    val = val.strip().strip("/")
    if not val or "\x00" in val:
        raise ValueError(f"{name} invalide.")
    for s in val.split("/"):
        if not s:
            raise ValueError(f"{name}: double slash interdit.")
        _seg(s, name)
    return val


def _date(val: str, name: str) -> str:
    val = val.strip()
    if not _DATE_FMT.match(val):
        raise ValueError(f"{name} doit être au format dd-mm-yyyy.")
    return val


def _year(val: str, name: str) -> str:
    val = val.strip()
    if not _YEAR_FMT.match(val):
        raise ValueError(f"{name} doit être une année à 4 chiffres.")
    return val


def _week(val: str, name: str) -> str:
    val = val.strip()
    if not _WEEK_FMT.match(val):
        raise ValueError(f"{name}: numéro de semaine invalide.")
    if not 1 <= int(val) <= 53:
        raise ValueError(f"{name} hors limites (1-53).")
    return val


# ═══════════════════════════════════════════════════════════════════════════════
# Gouti API Client
# ═══════════════════════════════════════════════════════════════════════════════

class GoutiApiClient:
    """Async Gouti API client with automatic token refresh on 401."""

    def __init__(self, *, base_url: str, client_id: str,
                 client_secret: str = "", entity_code: str = "",
                 token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.entity_code = entity_code
        self._token = token
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))

    async def authenticate(self) -> str:
        """Two-step OAuth: request code → exchange for token."""
        code_resp = await self._http.post(
            f"{self.base_url}/code",
            json={"callback_url": f"{self.base_url}/callback", "client_id": self.client_id},
            headers={"Accept": "application/json"},
        )
        code_resp.raise_for_status()
        code_data = code_resp.json()
        code = code_data.get("code") or code_data.get("authorization_code")
        if not code:
            raise RuntimeError("Gouti: aucun code d'autorisation retourné.")

        token_resp = await self._http.post(
            f"{self.base_url}/token",
            json={"code": code, "client_id": self.client_id, "secret_client": self.client_secret},
            headers={"Accept": "application/json"},
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
        token = token_data.get("token") or token_data.get("access_token")
        if not token:
            raise RuntimeError("Gouti: aucun token retourné.")
        self._token = token
        logger.info("Gouti: authenticated successfully")
        return token

    def _auth_headers(self) -> dict[str, str]:
        if not self._token:
            raise RuntimeError("Gouti: token non disponible — authentification requise.")
        h: dict[str, str] = {
            "Authorization": f"Bearer {self._token}",
            "Client-Id": self.client_id,
            "Accept": "application/json",
        }
        if self.entity_code:
            h["Entity-Code"] = self.entity_code
        return h

    async def call(self, path: str, method: str = "GET",
                   body: dict | None = None,
                   params: dict | None = None) -> dict[str, Any]:
        """Call Gouti API with auto-refresh on 401."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        kw: dict[str, Any] = {"headers": self._auth_headers()}
        if body is not None:
            kw["json"] = body
            kw["headers"] = {**kw["headers"], "Content-Type": "application/json"}
        if params:
            kw["params"] = params

        resp = await self._http.request(method, url, **kw)

        # Auto-refresh on 401
        if resp.status_code == 401 and self.client_secret:
            try:
                await self.authenticate()
                kw["headers"] = self._auth_headers()
                if body is not None:
                    kw["headers"] = {**kw["headers"], "Content-Type": "application/json"}
                resp = await self._http.request(method, url, **kw)
            except Exception as exc:
                logger.warning("Gouti token refresh failed: %s", exc)

        try:
            data = resp.json()
        except Exception:
            data = resp.text

        return {"ok": 200 <= resp.status_code < 300, "status": resp.status_code, "data": data}

    async def close(self):
        await self._http.aclose()


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _req(args: dict, key: str) -> str:
    val = str(args.get(key, "")).strip()
    if not val:
        raise ValueError(f"{key} requis.")
    return val


def _pid(args: dict) -> str:
    return _seg(_req(args, "project_id"), "project_id")


def _uid(args: dict) -> str:
    return _seg(_req(args, "user_id"), "user_id")


_REF_KEYS = ("ref_ta", "ref_pr", "ref_ac", "ref_is", "Ref", "ref", "id", "Id", "ID")


def _inject_id(item: dict, explicit: str | None = None) -> dict:
    """Return a shallow copy of ``item`` with a stable ``_id`` field.

    Tries the explicit argument first (used when the source dict was keyed
    by ID), otherwise falls back to any Gouti ref_* or id field found in
    the object.
    """
    out = dict(item)
    if explicit is not None:
        out.setdefault("_id", explicit)
        return out
    for k in _REF_KEYS:
        if k in out and out[k]:
            out.setdefault("_id", str(out[k]))
            break
    return out


def _items(data: Any, key: str) -> list:
    """Extract list items from various Gouti response formats.

    Gouti returns list endpoints in several shapes:
    - ``[...]`` : a plain list
    - ``{"projects": [...]}`` : explicit key wrapper
    - ``{"data": [...]}`` / ``{"items": [...]}`` : generic wrappers
    - ``{"28364": {...}, "28365": {...}}`` : dict keyed by entity ID
      (this is the most common shape for projects, users, tasks, …)

    Every returned item is passed through ``_inject_id`` so callers always
    have a stable ``_id`` field (derived from the container key or from any
    ``ref_*``/``id`` field inside the item).
    """
    if data is None:
        return []
    if isinstance(data, list):
        return [_inject_id(it) if isinstance(it, dict) else it for it in data]
    if isinstance(data, dict):
        # 1. Explicit list wrappers
        for candidate_key in (key, "data", "items", "results"):
            val = data.get(candidate_key)
            if isinstance(val, list):
                return [_inject_id(it) if isinstance(it, dict) else it for it in val]
            if isinstance(val, dict):
                # Wrapped dict keyed by ID — flatten to list of values
                nested = list(val.values())
                if nested and all(isinstance(v, dict) for v in nested):
                    return [_inject_id(v, explicit=k) for k, v in val.items()]
        # 2. Top-level dict keyed by ID (common Gouti pattern)
        values = list(data.values())
        if values and all(isinstance(v, dict) for v in values):
            return [_inject_id(v, explicit=k) for k, v in data.items()]
        return []
    return []


# Fields to keep when summarising list items (keeps responses compact)
_SUMMARY_FIELDS = {
    "_id",  # synthetic id injected by _items() when flattening dict-keyed dicts
    "id", "Id", "ID", "name", "Name", "label", "Label", "title", "Title",
    "status", "Status", "state", "code", "Code", "slug", "type", "Type",
    # Gouti domain suffixes (_ta=task, _pr=project, _ac=action, _is=issue)
    "name_ta", "name_pr", "name_ac", "name_is",
    "ref", "Ref", "ref_ta", "ref_pr", "ref_ac", "ref_is",
    "status_ta", "status_pr", "status_ac", "status_is",
    "progress_ta", "progress_pr", "progress_ac", "progress_is",
    "initial_start_date_ta", "initial_end_date_ta",
    "actual_start_date_ta", "actual_end_date_ta",
    "start_date", "end_date", "due_date", "priority", "Priority",
    "assigned_to", "owner", "matricule", "email", "first_name", "last_name",
    "description", "description_ta", "description_ac", "description_is",
}

_MAX_LIST_ITEMS = 200


def _summarise_list(items: list, max_items: int = _MAX_LIST_ITEMS) -> dict:
    """Return a compact summary of a list, keeping only key fields."""
    total = len(items)
    truncated = items[:max_items]
    compact = []
    for item in truncated:
        if isinstance(item, dict):
            row = {
                k: v for k, v in item.items()
                if k in _SUMMARY_FIELDS or "name" in k.lower() or k.lower() == "id"
            }
            compact.append(row if row else item)
        else:
            compact.append(item)
    result: dict = {"count": total, "items": compact}
    if total > max_items:
        result["note"] = f"{max_items}/{total} éléments affichés. Utilisez search ou limit pour affiner."
    return result


_MAX_RESPONSE_CHARS = 80_000  # MCP clients handle up to ~100K comfortably


def _ok(data: Any) -> dict:
    """Format a successful MCP tool result, truncating if too large."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(text) > _MAX_RESPONSE_CHARS:
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            items = data["items"]
            keep = len(items)
            while keep > 1:
                candidate = json.dumps(
                    {**data, "items": items[:keep]},
                    ensure_ascii=False, separators=(",", ":"),
                )
                if len(candidate) <= _MAX_RESPONSE_CHARS - 200:
                    break
                keep = max(1, keep - max(1, keep // 4))
            reduced = {
                **data,
                "items": items[:keep],
                "total_available": len(items),
                "truncated": keep < len(items),
                **({"truncation_note": (
                    f"{keep}/{len(items)} éléments affichés. "
                    "Utilisez search ou limit pour affiner."
                )} if keep < len(items) else {}),
            }
            text = json.dumps(reduced, ensure_ascii=False, separators=(",", ":"))
        else:
            preview = text[:_MAX_RESPONSE_CHARS - 300]
            text = json.dumps({
                "truncated": True,
                "truncation_note": "Réponse trop longue — aperçu seulement.",
                "preview": preview,
            }, ensure_ascii=False)
    return {"content": [{"type": "text", "text": text}]}


# ═══════════════════════════════════════════════════════════════════════════════
# Tool handlers — each takes (client, args) and returns MCP content dict
# ═══════════════════════════════════════════════════════════════════════════════

# ── Entity categories ────────────────────────────────────────────────────────

async def _list_entity_categories(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call("e-categories"))


async def _get_entity_category(c: GoutiApiClient, a: dict) -> dict:
    cid = _seg(_req(a, "category_id"), "category_id")
    return _ok(await c.call(f"e-categories/{cid}"))


# ── Activity labels ──────────────────────────────────────────────────────────

async def _list_activity_labels(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call("activities-labels"))


async def _get_activity_label(c: GoutiApiClient, a: dict) -> dict:
    lid = _seg(_req(a, "label_id"), "label_id")
    return _ok(await c.call(f"activities-labels/{lid}"))


# ── Projects ─────────────────────────────────────────────────────────────────

async def _list_projects(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call("projects")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "projects")))
    return _ok(resp)


async def _list_archived_projects(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call("projects/archived")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "projects")))
    return _ok(resp)


async def _get_project(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"projects/{_pid(a)}"))


async def _update_project(c: GoutiApiClient, a: dict) -> dict:
    payload = a.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload objet requis.")
    return _ok(await c.call(f"projects/{_pid(a)}", "POST", payload))


# ── Tasks ────────────────────────────────────────────────────────────────────

async def _list_project_tasks(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/tasks")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "tasks")))
    return _ok(resp)


async def _get_task(c: GoutiApiClient, a: dict) -> dict:
    tid = _seg(_req(a, "task_id"), "task_id")
    return _ok(await c.call(f"projects/{_pid(a)}/tasks/{tid}"))


async def _update_task(c: GoutiApiClient, a: dict) -> dict:
    tid = _seg(_req(a, "task_id"), "task_id")
    payload = a.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload objet requis. Champs: name_ta, description_ta, status_ta, progress_ta, workload.")
    return _ok(await c.call(f"projects/{_pid(a)}/tasks/{tid}", "POST", payload))


async def _refresh_tasks(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"projects/{_pid(a)}/tasks/refresh", "POST"))


# ── Actions ──────────────────────────────────────────────────────────────────

async def _list_project_actions(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/actions")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "actions")))
    return _ok(resp)


async def _get_action(c: GoutiApiClient, a: dict) -> dict:
    aid = _seg(_req(a, "action_id"), "action_id")
    return _ok(await c.call(f"projects/{_pid(a)}/actions/{aid}"))


async def _update_action(c: GoutiApiClient, a: dict) -> dict:
    aid = _seg(_req(a, "action_id"), "action_id")
    payload = a.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload objet requis. Champs: description_ac, status_ac, progress_ac.")
    return _ok(await c.call(f"projects/{_pid(a)}/actions/{aid}", "POST", payload))


# ── Issues ───────────────────────────────────────────────────────────────────

async def _list_project_issues(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/issues")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "issues")))
    return _ok(resp)


async def _get_issue(c: GoutiApiClient, a: dict) -> dict:
    iid = _seg(_req(a, "issue_id"), "issue_id")
    return _ok(await c.call(f"projects/{_pid(a)}/issues/{iid}"))


async def _update_issue(c: GoutiApiClient, a: dict) -> dict:
    iid = _seg(_req(a, "issue_id"), "issue_id")
    payload = a.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload objet requis. Champs: description_is, status_is, progress_is.")
    return _ok(await c.call(f"projects/{_pid(a)}/issues/{iid}", "POST", payload))


# ── Deliverables ─────────────────────────────────────────────────────────────

async def _list_project_deliverables(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/deliverables")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "deliverables")))
    return _ok(resp)


async def _get_deliverable(c: GoutiApiClient, a: dict) -> dict:
    did = _seg(_req(a, "deliverable_id"), "deliverable_id")
    return _ok(await c.call(f"projects/{_pid(a)}/deliverables/{did}"))


# ── Goals ────────────────────────────────────────────────────────────────────

async def _list_project_goals(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/goals")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "goals")))
    return _ok(resp)


async def _get_goal(c: GoutiApiClient, a: dict) -> dict:
    gid = _seg(_req(a, "goal_id"), "goal_id")
    return _ok(await c.call(f"projects/{_pid(a)}/goals/{gid}"))


# ── Organization ─────────────────────────────────────────────────────────────

async def _list_project_organization(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"projects/{_pid(a)}/organization"))


async def _get_organization_unit(c: GoutiApiClient, a: dict) -> dict:
    oid = _seg(_req(a, "orga_id"), "orga_id")
    return _ok(await c.call(f"projects/{_pid(a)}/organization/{oid}"))


# ── Reports ──────────────────────────────────────────────────────────────────

async def _list_project_reports(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"projects/{_pid(a)}/reports")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "reports")))
    return _ok(resp)


# ── Comments ─────────────────────────────────────────────────────────────────

async def _get_comments(c: GoutiApiClient, a: dict) -> dict:
    atype = _req(a, "activity_type")
    if atype not in ("tasks", "actions", "issues"):
        raise ValueError("activity_type doit être 'tasks', 'actions' ou 'issues'.")
    aid = _seg(_req(a, "activity_id"), "activity_id")
    return _ok(await c.call(f"projects/{_pid(a)}/{atype}/{aid}/comments"))


# ── Users ────────────────────────────────────────────────────────────────────

async def _list_users(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call("users")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "users")))
    return _ok(resp)


async def _get_user(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"users/{_uid(a)}"))


async def _get_user_by_matricule(c: GoutiApiClient, a: dict) -> dict:
    mat = _seg(_req(a, "matricule"), "matricule")
    return _ok(await c.call(f"users/ByMatricule/{mat}"))


async def _list_user_tasks(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"users/{_uid(a)}/tasks")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "tasks")))
    return _ok(resp)


async def _list_user_actions(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"users/{_uid(a)}/actions")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "actions")))
    return _ok(resp)


async def _list_user_issues(c: GoutiApiClient, a: dict) -> dict:
    resp = await c.call(f"users/{_uid(a)}/issues")
    if resp["ok"]:
        return _ok(_summarise_list(_items(resp["data"], "issues")))
    return _ok(resp)


# ── Notifications ────────────────────────────────────────────────────────────

async def _list_user_notifications(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"users/{_uid(a)}/notifications"))


async def _check_notification(c: GoutiApiClient, a: dict) -> dict:
    nid = _seg(_req(a, "notification_id"), "notification_id")
    return _ok(await c.call(f"users/{_uid(a)}/checked-notifications/{nid}", "POST"))


async def _delete_notification(c: GoutiApiClient, a: dict) -> dict:
    nid = _seg(_req(a, "notification_id"), "notification_id")
    return _ok(await c.call(f"users/{_uid(a)}/delete-notification/{nid}"))


# ── Personal notes ───────────────────────────────────────────────────────────

async def _get_user_notes(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"users/{_uid(a)}/personnals-notes"))


async def _save_user_notes(c: GoutiApiClient, a: dict) -> dict:
    note = _req(a, "note")
    return _ok(await c.call(f"users/{_uid(a)}/personnals-notes", "POST", {"note_no": note}))


# ── Timesheets ───────────────────────────────────────────────────────────────

async def _get_timesheet_control(c: GoutiApiClient, a: dict) -> dict:
    return _ok(await c.call(f"timesheets/users/{_uid(a)}/timesheet-controle"))


async def _get_timesheet(c: GoutiApiClient, a: dict) -> dict:
    yr = _year(_req(a, "year"), "year")
    wk = _week(_req(a, "week"), "week")
    ts_type = _seg(a.get("type", "1") or "1", "type")
    return _ok(await c.call(
        f"timesheets/users/{_uid(a)}/timesheet/year/{yr}/week/{wk}/type/{ts_type}"))


async def _insert_timesheet(c: GoutiApiClient, a: dict) -> dict:
    dt = _date(_req(a, "date"), "date")
    ref = _seg(_req(a, "ref"), "ref")
    ts_type = _seg(_req(a, "type"), "type")
    value = _seg(_req(a, "value"), "value")
    return _ok(await c.call(
        f"timesheets/users/{_uid(a)}/timesheet-insert/date/{dt}/ref/{ref}/type/{ts_type}/value/{value}",
        "POST"))


async def _validate_timesheet(c: GoutiApiClient, a: dict) -> dict:
    dt = _date(_req(a, "date"), "date")
    st = _seg(_req(a, "status"), "status")
    return _ok(await c.call(
        f"timesheets/users/{_uid(a)}/timesheet-validation/date/{dt}/timesheetStatus/{st}",
        "POST"))


# ── Generic (escape hatch) ──────────────────────────────────────────────────

async def _api_get(c: GoutiApiClient, a: dict) -> dict:
    p = _path_validate(_req(a, "path"), "path")
    params = a.get("params") or None
    if params is not None and not isinstance(params, dict):
        raise ValueError("params doit être un objet {clé: valeur}.")
    return _ok(await c.call(p, params=params))


async def _api_post(c: GoutiApiClient, a: dict) -> dict:
    p = _path_validate(_req(a, "path"), "path")
    payload = a.get("payload") or {}
    params = a.get("params") or None
    if params is not None and not isinstance(params, dict):
        raise ValueError("params doit être un objet {clé: valeur}.")
    return _ok(await c.call(p, "POST", payload, params=params))


# ═══════════════════════════════════════════════════════════════════════════════
# Consolidated tool handlers (12 tools instead of 43)
# ═══════════════════════════════════════════════════════════════════════════════

# ── list: unified listing ────────────────────────────────────────────────────

_LIST_ROUTES: dict[str, tuple[str, str]] = {
    # type → (url_template, items_key)   — {pid} and {uid} are replaced at runtime
    "projects":             ("projects", "projects"),
    "archived_projects":    ("projects/archived", "projects"),
    "tasks":                ("projects/{pid}/tasks", "tasks"),
    "actions":              ("projects/{pid}/actions", "actions"),
    "issues":               ("projects/{pid}/issues", "issues"),
    "deliverables":         ("projects/{pid}/deliverables", "deliverables"),
    "goals":                ("projects/{pid}/goals", "goals"),
    "reports":              ("projects/{pid}/reports", "reports"),
    "organization":         ("projects/{pid}/organization", "organization"),
    "users":                ("users", "users"),
    "user_tasks":           ("users/{uid}/tasks", "tasks"),
    "user_actions":         ("users/{uid}/actions", "actions"),
    "user_issues":          ("users/{uid}/issues", "issues"),
    "entity_categories":    ("e-categories", "e-categories"),
    "activity_labels":      ("activities-labels", "activities-labels"),
    "notifications":        ("users/{uid}/notifications", "notifications"),
}


_SEARCH_KEYS = (
    # Generic
    "Name", "name", "Ref", "ref", "Code", "code", "Title", "title",
    "Description", "description", "Label", "label",
    "first_name", "last_name", "email", "matricule",
    # Gouti domain-suffixed fields (_ta=task, _pr=project, _ac=action, _is=issue)
    "name_ta", "name_pr", "name_ac", "name_is",
    "ref_ta", "ref_pr", "ref_ac", "ref_is",
    "description_ta", "description_pr", "description_ac", "description_is",
)


def _matches_search(item: Any, query: str) -> bool:
    """Case-insensitive substring match across common text fields."""
    if not isinstance(item, dict):
        return query.lower() in str(item).lower()
    q = query.lower()
    for key in _SEARCH_KEYS:
        val = item.get(key)
        if val and q in str(val).lower():
            return True
    return False


async def _handle_list(c: GoutiApiClient, a: dict) -> dict:
    entity_type = _req(a, "type")
    route = _LIST_ROUTES.get(entity_type)
    if not route:
        return _ok({"error": f"Type inconnu: '{entity_type}'", "types_disponibles": sorted(_LIST_ROUTES)})

    url_tpl, items_key = route
    url = url_tpl
    if "{pid}" in url:
        url = url.replace("{pid}", _pid(a))
    if "{uid}" in url:
        url = url.replace("{uid}", _uid(a))

    resp = await c.call(url)
    if not resp.get("ok"):
        return _ok(resp)

    items = _items(resp["data"], items_key)

    # Optional search filter (client-side, case-insensitive substring match)
    search = (a.get("search") or "").strip()
    if search:
        items = [it for it in items if _matches_search(it, search)]

    # Pagination / summarisation
    limit = int(a.get("limit", 20) or 0)
    total = len(items)

    if limit == 0:
        # Explicit "give me everything" — return full objects, but still capped
        # by the global response truncation (_MAX_RESPONSE_CHARS in _ok).
        return _ok({"count": total, "items": items, "search": search or None})

    return _ok(_summarise_list(items, max_items=limit))


# ── get: unified detail ──────────────────────────────────────────────────────

_GET_ROUTES: dict[str, str] = {
    "project":           "projects/{id}",
    "task":              "projects/{pid}/tasks/{id}",
    "action":            "projects/{pid}/actions/{id}",
    "issue":             "projects/{pid}/issues/{id}",
    "deliverable":       "projects/{pid}/deliverables/{id}",
    "goal":              "projects/{pid}/goals/{id}",
    "organization_unit": "projects/{pid}/organization/{id}",
    "user":              "users/{id}",
    "entity_category":   "e-categories/{id}",
    "activity_label":    "activities-labels/{id}",
}


async def _handle_get(c: GoutiApiClient, a: dict) -> dict:
    entity_type = _req(a, "type")
    route = _GET_ROUTES.get(entity_type)
    if not route:
        return _ok({"error": f"Type inconnu: '{entity_type}'", "types_disponibles": sorted(_GET_ROUTES)})

    url = route.replace("{id}", _seg(_req(a, "id"), "id"))
    if "{pid}" in url:
        url = url.replace("{pid}", _pid(a))
    return _ok(await c.call(url))


# ── update: unified update ───────────────────────────────────────────────────

# Per official Gouti Postman collection v1 EVO 07-2025, only tasks/actions/
# issues expose a POST /{entity}/{id} update endpoint. Projects cannot be
# updated through the public API.
_UPDATE_ROUTES: dict[str, str] = {
    "task":    "projects/{pid}/tasks/{id}",
    "action":  "projects/{pid}/actions/{id}",
    "issue":   "projects/{pid}/issues/{id}",
}

# Writable fields per entity type — any other field is silently dropped by
# Gouti (based on the official Postman collection payloads). Passing a field
# not in this whitelist results in a warning in the response.
_WRITABLE_FIELDS: dict[str, frozenset[str]] = {
    "task":   frozenset({"name_ta",  "description_ta", "status_ta", "progress_ta", "workload"}),
    "action": frozenset({"name_ac",  "description_ac", "status_ac", "progress_ac"}),
    "issue":  frozenset({"name_is",  "description_is", "status_is", "progress_is"}),
}


# Date fields that Gouti expects in DD-MM-YYYY format (not ISO).
_DATE_FIELD_RE = re.compile(r"(_date_|^date_|_date$|^date$|_dt_|_dt$)", re.IGNORECASE)
_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def _normalise_payload(payload: dict, entity_type: str) -> tuple[dict, list[str]]:
    """Normalise a payload before sending to Gouti.

    1. Filter to the official whitelist from the Gouti Postman collection
       (fields outside the whitelist are silently dropped by Gouti — we
       return them in ``dropped`` so the caller sees a clear warning).
    2. ``progress_*`` → integer (Gouti rejects strings/floats with
       "Progress format is not good.").
    3. ``workload`` / integer fields coerced to int when possible.
    """
    normalised: dict = {}
    dropped: list[str] = []
    writable = _WRITABLE_FIELDS.get(entity_type)
    for k, v in payload.items():
        if writable is not None and k not in writable:
            dropped.append(k)
            continue

        # Progress → int
        if k.startswith("progress_"):
            try:
                normalised[k] = int(float(v)) if v not in (None, "") else 0
            except (TypeError, ValueError):
                normalised[k] = v
            continue

        # workload → int
        if k == "workload":
            try:
                normalised[k] = int(float(v)) if v not in (None, "") else 0
            except (TypeError, ValueError):
                normalised[k] = v
            continue

        normalised[k] = v
    return normalised, dropped


# Kept for backward compatibility / unit tests
def _normalise_date_fields(payload: dict) -> dict:
    """Legacy helper: convert ISO YYYY-MM-DD dates to Gouti DD-MM-YYYY.

    No longer used by update (Gouti doesn't accept date updates) but kept
    exported for callers that deal with other endpoints accepting dates.
    """
    out: dict = {}
    for k, v in payload.items():
        if isinstance(v, str) and _DATE_FIELD_RE.search(k):
            m = _ISO_DATE_RE.match(v.strip())
            if m:
                yyyy, mm, dd = m.groups()
                out[k] = f"{dd}-{mm}-{yyyy}"
                continue
        out[k] = v
    return out


# Fields that Gouti requires as "principal argument" on POST /{entity}/{id}.
# Always included on update (pre-fetched from current record if not provided).
_PRINCIPAL_FIELDS = {
    "task":    ("name_ta",  lambda pid, tid: f"projects/{pid}/tasks/{tid}"),
    "action":  ("name_ac",  lambda pid, tid: f"projects/{pid}/actions/{tid}"),
    "issue":   ("name_is",  lambda pid, tid: f"projects/{pid}/issues/{tid}"),
}


async def _handle_update(c: GoutiApiClient, a: dict) -> dict:
    entity_type = _req(a, "type")
    route = _UPDATE_ROUTES.get(entity_type)
    if not route:
        return _ok({
            "error": f"Type '{entity_type}' non updatable via l'API Gouti. "
                     "Note: l'API Gouti ne supporte PAS la modification de projects, "
                     "deliverables, goals, users, organization units, etc.",
            "types_updatable": sorted(_UPDATE_ROUTES),
        })

    raw_payload = a.get("payload")
    if not isinstance(raw_payload, dict):
        raise ValueError("payload objet requis.")

    entity_id = _seg(_req(a, "id"), "id")
    url = route.replace("{id}", entity_id)
    project_id = None
    if "{pid}" in url:
        project_id = _pid(a)
        url = url.replace("{pid}", project_id)

    # Filter to writable fields + coerce types (progress_*, workload → int)
    payload, dropped = _normalise_payload(raw_payload, entity_type)

    # Pre-fetch principal argument (name_*) if missing — Gouti errors otherwise
    principal = _PRINCIPAL_FIELDS.get(entity_type)
    if principal and principal[0] not in payload:
        field_name, fetch_url_fn = principal
        try:
            fetch_url = fetch_url_fn(project_id, entity_id)
            current = await c.call(fetch_url)
            if current.get("ok"):
                data = current.get("data")
                current_value = None
                if isinstance(data, dict):
                    if field_name in data:
                        current_value = data[field_name]
                    elif isinstance(data.get("data"), dict) and field_name in data["data"]:
                        current_value = data["data"][field_name]
                elif isinstance(data, list) and data:
                    first = data[0]
                    if isinstance(first, dict) and field_name in first:
                        current_value = first[field_name]
                if current_value:
                    payload[field_name] = current_value
        except Exception as exc:
            logger.warning("Gouti update: could not pre-fetch %s: %s", field_name, exc)

    # Call Gouti and wrap the response with a clear warning about dropped
    # fields so the caller knows which inputs Gouti does not accept.
    resp = await c.call(url, "POST", payload)
    result: dict[str, Any] = dict(resp)
    if dropped:
        result["mcp_warning"] = {
            "message": "Certains champs ne sont pas modifiables via l'API Gouti et ont été ignorés.",
            "dropped_fields": dropped,
            "writable_fields": sorted(_WRITABLE_FIELDS.get(entity_type, set())),
        }
    return _ok(result)


# ── timesheet: unified timesheet ops ─────────────────────────────────────────

async def _handle_timesheet(c: GoutiApiClient, a: dict) -> dict:
    action = _req(a, "action")
    uid = _uid(a)

    if action == "control":
        return _ok(await c.call(f"timesheets/users/{uid}/timesheet-controle"))

    if action == "get":
        yr = _year(_req(a, "year"), "year")
        wk = _week(_req(a, "week"), "week")
        ts_type = _seg(a.get("ts_type", "1") or "1", "ts_type")
        return _ok(await c.call(
            f"timesheets/users/{uid}/timesheet/year/{yr}/week/{wk}/type/{ts_type}"))

    if action == "insert":
        dt = _date(_req(a, "date"), "date")
        ref = _seg(_req(a, "ref"), "ref")
        ts_type = _seg(_req(a, "ts_type"), "ts_type")
        value = _seg(_req(a, "value"), "value")
        return _ok(await c.call(
            f"timesheets/users/{uid}/timesheet-insert/date/{dt}/ref/{ref}/type/{ts_type}/value/{value}",
            "POST"))

    if action == "validate":
        dt = _date(_req(a, "date"), "date")
        st = _seg(_req(a, "status"), "status")
        return _ok(await c.call(
            f"timesheets/users/{uid}/timesheet-validation/date/{dt}/timesheetStatus/{st}",
            "POST"))

    return _ok({"error": f"Action inconnue: '{action}'", "actions_disponibles": ["control", "get", "insert", "validate"]})


# ── notifications: unified ───────────────────────────────────────────────────

async def _handle_notifications(c: GoutiApiClient, a: dict) -> dict:
    action = a.get("action", "list")
    uid = _uid(a)

    if action == "list":
        return _ok(await c.call(f"users/{uid}/notifications"))
    if action == "check":
        nid = _seg(_req(a, "notification_id"), "notification_id")
        return _ok(await c.call(f"users/{uid}/checked-notifications/{nid}", "POST"))
    if action == "delete":
        nid = _seg(_req(a, "notification_id"), "notification_id")
        return _ok(await c.call(f"users/{uid}/delete-notification/{nid}"))

    return _ok({"error": f"Action inconnue: '{action}'", "actions_disponibles": ["list", "check", "delete"]})


# ── user_notes: unified ──────────────────────────────────────────────────────

async def _handle_user_notes(c: GoutiApiClient, a: dict) -> dict:
    action = a.get("action", "get")
    uid = _uid(a)

    if action == "get":
        return _ok(await c.call(f"users/{uid}/personnals-notes"))
    if action == "save":
        note = _req(a, "note")
        return _ok(await c.call(f"users/{uid}/personnals-notes", "POST", {"note_no": note}))

    return _ok({"error": f"Action inconnue: '{action}'", "actions_disponibles": ["get", "save"]})


# ═══════════════════════════════════════════════════════════════════════════════
# Aggregation tools — parallelized multi-call handlers
# ═══════════════════════════════════════════════════════════════════════════════

import asyncio
from datetime import date, datetime


def _parse_pct(val: str | None) -> int:
    """Parse '85%' or '85' to int."""
    if not val:
        return 0
    return int(str(val).replace("%", "").strip() or "0")


def _parse_by_status(raw: Any) -> dict:
    """Parse byStatus JSON string from Gouti."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}


def _extract_items(data: Any) -> list[dict]:
    """Extract items from various Gouti response shapes."""
    if isinstance(data, list):
        return [i for i in data if isinstance(i, dict)]
    if isinstance(data, dict):
        for key in ("items", "data", "results"):
            if key in data and isinstance(data[key], list):
                return [i for i in data[key] if isinstance(i, dict)]
            if key in data and isinstance(data[key], dict):
                return [v for v in data[key].values() if isinstance(v, dict)]
        # Fallback: dict keyed by ID — only keep dict values (skip bool, int, str metadata)
        return [v for v in data.values() if isinstance(v, dict)]
    return []


def _project_summary(p: dict, today: str) -> dict:
    """Build lean project summary from Gouti project dict."""
    if not isinstance(p, dict):
        return {"id": None, "name": str(p), "status": "unknown", "today": today}
    pm = p.get("Project_manager") or {}
    cats = p.get("Enterprise_categories") or []
    return {
        "id": p.get("Ref"),
        "name": p.get("Name"),
        "status": p.get("Status"),
        "start": p.get("Start_date"),
        "end": p.get("Target_date"),
        "planned_end": None,
        "today": today,
        "pct": _parse_pct(p.get("Tasks_progress")),
        "delta_w1": p.get("Delta_progress_w1"),
        "delta_w4": p.get("Delta_progress_w4"),
        "pm": pm.get("name_us"),
        "pm_id": pm.get("ref_us"),
        "weather": p.get("Weather"),
        "trend": p.get("Trend"),
        "criticality": p.get("Criticality"),
        "last_update": p.get("Last_update_date"),
        "categories": [{"id": c.get("id"), "name": c.get("name")} for c in (cats if isinstance(cats, list) else [])],
    }


def _project_with_counts(p: dict, today: str) -> dict:
    """Project summary + parsed status counts."""
    base = _project_summary(p, today)
    base["counts"] = {
        "tasks": {"total": (p.get("Tasks") or {}).get("number", 0), "by_status": _parse_by_status((p.get("Tasks") or {}).get("byStatus"))},
        "milestones": {"total": (p.get("Milestones") or {}).get("number", 0), "by_status": _parse_by_status((p.get("Milestones") or {}).get("byStatus"))},
        "actions": {"total": (p.get("Actions") or {}).get("number", 0), "by_status": _parse_by_status((p.get("Actions") or {}).get("byStatus"))},
        "issues": {"total": (p.get("Issues") or {}).get("number", 0), "by_status": _parse_by_status((p.get("Issues") or {}).get("byStatus"))},
        "deliverables": {"total": (p.get("Deliverables") or {}).get("number", 0), "by_status": _parse_by_status((p.get("Deliverables") or {}).get("byStatus"))},
        "risks": {"total": (p.get("Active_risks") or {}).get("number", 0), "by_severity": _parse_by_status((p.get("Active_risks") or {}).get("byStatus"))},
    }
    return base


def _filter_projects(projects: list[dict], args: dict) -> list[dict]:
    """Apply status_filter and exclude_status."""
    status_filter = args.get("status_filter")
    exclude_status = args.get("exclude_status")
    filtered = projects
    if status_filter:
        filtered = [p for p in filtered if p.get("Status") in status_filter]
    if exclude_status:
        filtered = [p for p in filtered if p.get("Status") not in exclude_status]
    return filtered


def _sort_projects(projects: list[dict], sort_by: str) -> list[dict]:
    """Sort project summaries."""
    key_map = {"start": "start", "end": "end", "pct": "pct", "name": "name", "last_update": "last_update"}
    key = key_map.get(sort_by, "start")
    reverse = sort_by in ("last_update", "pct")
    return sorted(projects, key=lambda p: p.get(key) or "", reverse=reverse)


async def _handle_gantt_summary(c: "GoutiApiClient", a: dict) -> dict:
    """Portfolio Gantt data for all projects."""
    include_archived = a.get("include_archived", False)
    calls = [c.call("projects")]
    if include_archived:
        calls.append(c.call("projects/archived"))
    results = await asyncio.gather(*calls, return_exceptions=True)

    all_projects = []
    for r in results:
        if isinstance(r, Exception):
            continue
        all_projects.extend(_extract_items(r))

    filtered = _filter_projects(all_projects, a)
    # Exclude projects without dates
    filtered = [p for p in filtered if p.get("Start_date") or p.get("Target_date")]

    today = date.today().isoformat()
    summaries = [_project_summary(p, today) for p in filtered]
    summaries = _sort_projects(summaries, a.get("sort_by", "start"))

    return _ok({"today": today, "count": len(summaries), "items": summaries})


async def _handle_macro_tasks(c: "GoutiApiClient", a: dict) -> dict:
    """Level-1 macro phase tasks for one project."""
    pid = _req(a, "project_id")
    data = await c.call(f"projects/{pid}/tasks")
    tasks = _extract_items(data)

    today = date.today().isoformat()
    phases = []
    for t in tasks:
        if str(t.get("level_ta")) != "1":
            continue
        initial_end = t.get("initial_end_date_ta")
        actual_end = t.get("actual_end_date_ta")
        delay_days = None
        if initial_end and actual_end:
            try:
                d1 = date.fromisoformat(str(initial_end)[:10])
                d2 = date.fromisoformat(str(actual_end)[:10])
                delay_days = (d2 - d1).days
            except (ValueError, TypeError):
                pass
        phases.append({
            "id": t.get("ref_ta"),
            "order": t.get("order_ta"),
            "name": t.get("name_ta"),
            "planned_start": t.get("initial_start_date_ta"),
            "planned_end": initial_end,
            "actual_start": t.get("actual_start_date_ta"),
            "actual_end": actual_end,
            "today": today,
            "pct": _parse_pct(t.get("progress_ta")),
            "status": t.get("status_ta"),
            "is_milestone": bool(int(t.get("milestone_ta") or "0")),
            "color": t.get("macro_color_ta"),
            "duration_days": t.get("duration_ta"),
            "delay_days": delay_days,
        })
    phases.sort(key=lambda p: int(p.get("order") or 0))

    return _ok({"project_id": pid, "today": today, "phases": phases})


async def _handle_tcm_snapshot(c: "GoutiApiClient", a: dict) -> dict:
    """Complete project snapshot for TCM/status reporting."""
    import time
    t0 = time.monotonic()
    pid = _req(a, "project_id")
    max_comments = int(a.get("max_comments_per_item", 5))
    include_closed = a.get("include_closed_issues", True)
    include_phase_comments = a.get("include_phase_comments", False)
    today = date.today().isoformat()
    gouti_calls = 0

    # Wave 1: parallel fetch
    wave1 = await asyncio.gather(
        c.call(f"projects/{pid}"),
        c.call(f"projects/{pid}/tasks"),
        c.call(f"projects/{pid}/issues"),
        c.call(f"projects/{pid}/actions"),
        c.call(f"projects/{pid}/deliverables"),
        c.call(f"projects/{pid}/goals"),
        c.call(f"projects/{pid}/organization"),
        return_exceptions=True,
    )
    gouti_calls += 7
    proj_data, tasks_data, issues_data, actions_data, deliverables_data, goals_data, org_data = wave1
    proj = proj_data if isinstance(proj_data, dict) else {}
    tasks = _extract_items(tasks_data) if not isinstance(tasks_data, Exception) else []
    issues = _extract_items(issues_data) if not isinstance(issues_data, Exception) else []
    actions = _extract_items(actions_data) if not isinstance(actions_data, Exception) else []
    deliverables = _extract_items(deliverables_data) if not isinstance(deliverables_data, Exception) else []
    goals = _extract_items(goals_data) if not isinstance(goals_data, Exception) else []
    org = _extract_items(org_data) if not isinstance(org_data, Exception) else []

    # Wave 2: transform
    macro_phases = []
    for t in tasks:
        if str(t.get("level_ta")) != "1":
            continue
        ie, ae = t.get("initial_end_date_ta"), t.get("actual_end_date_ta")
        delay = None
        if ie and ae:
            try:
                delay = (date.fromisoformat(str(ae)[:10]) - date.fromisoformat(str(ie)[:10])).days
            except Exception:
                pass
        macro_phases.append({
            "id": t.get("ref_ta"), "order": t.get("order_ta"), "name": t.get("name_ta"),
            "planned_start": t.get("initial_start_date_ta"), "planned_end": ie,
            "actual_start": t.get("actual_start_date_ta"), "actual_end": ae,
            "today": today, "pct": _parse_pct(t.get("progress_ta")), "status": t.get("status_ta"),
            "is_milestone": bool(int(t.get("milestone_ta") or "0")),
            "color": t.get("macro_color_ta"), "duration_days": t.get("duration_ta"), "delay_days": delay,
        })
    macro_phases.sort(key=lambda p: int(p.get("order") or 0))

    milestones = []
    for t in tasks:
        if str(t.get("milestone_ta")) != "1":
            continue
        ise, ase = t.get("initial_start_date_ta"), t.get("actual_start_date_ta")
        delay = None
        if ise and ase:
            try:
                delay = (date.fromisoformat(str(ase)[:10]) - date.fromisoformat(str(ise)[:10])).days
            except Exception:
                pass
        milestones.append({
            "id": t.get("ref_ta"), "order": t.get("order_ta"), "name": t.get("name_ta"),
            "planned_date": ise, "actual_date": ase,
            "today": today, "pct": _parse_pct(t.get("progress_ta")), "status": t.get("status_ta"), "delay_days": delay,
        })
    milestones.sort(key=lambda m: m.get("actual_date") or m.get("planned_date") or "")

    open_issues = [{"id": i.get("ref_is"), "subject": i.get("subject_is"), "description": i.get("description_is"),
                     "priority": i.get("priority_is"), "creation_date": i.get("creation_date_is"), "status": i.get("status_is")}
                    for i in issues if str(i.get("status_is")) in ("0", "1")]
    open_issues.sort(key=lambda x: (x.get("priority") or "", x.get("creation_date") or ""), reverse=True)

    closed_issues = [{"id": i.get("ref_is"), "subject": i.get("subject_is"), "creation_date": i.get("creation_date_is")}
                      for i in issues if str(i.get("status_is")) == "7"] if include_closed else []

    open_actions = [{"id": a_.get("ref_ac"), "name": a_.get("name_ac"), "description": a_.get("description_ac"),
                      "domain": a_.get("domain_ac"), "target_date": a_.get("actual_target_date_ac"),
                      "creation_date": a_.get("creation_date_ac"), "status": a_.get("status_ac"),
                      "progress": _parse_pct(a_.get("progress_ac"))}
                     for a_ in actions if str(a_.get("status_ac")) in ("0", "1")]
    open_actions.sort(key=lambda x: x.get("target_date") or "")

    pending_deliverables = [{"id": d.get("ref_de"), "name": d.get("name_de"), "description": d.get("description_de"),
                              "type": d.get("type_de"), "due_date": d.get("previsional_delivery_date_de"),
                              "last_delivery": d.get("last_delivery_date_de"), "status": d.get("status_de")}
                             for d in deliverables if str(d.get("status_de")) != "2"]
    pending_deliverables.sort(key=lambda x: x.get("due_date") or "")

    goals_out = [{"id": g.get("ref_go"), "name": g.get("name_go"), "description": g.get("description_go"),
                   "status": g.get("status_go"), "date": g.get("date_status_go")} for g in goals]

    team = [{"id": o.get("id"), "name": f'{o.get("lastname", "")} {o.get("firstname", "")}'.strip(),
              "initials": o.get("initials"), "role": o.get("role"), "ref_user": o.get("refUser")} for o in org]

    # Wave 3: comments (parallel)
    comment_calls = []
    comment_targets: list[tuple[str, str, int]] = []  # (type, id, index)
    for idx, oi in enumerate(open_issues):
        comment_calls.append(c.call(f"projects/{pid}/issues/{oi['id']}/comments"))
        comment_targets.append(("issue", oi["id"], idx))
    for idx, oa in enumerate(open_actions):
        comment_calls.append(c.call(f"projects/{pid}/actions/{oa['id']}/comments"))
        comment_targets.append(("action", oa["id"], idx))
    if include_phase_comments:
        for idx, mp in enumerate(macro_phases):
            comment_calls.append(c.call(f"projects/{pid}/tasks/{mp['id']}/comments"))
            comment_targets.append(("phase", mp["id"], idx))

    if comment_calls:
        comment_results = await asyncio.gather(*comment_calls, return_exceptions=True)
        gouti_calls += len(comment_calls)
        for (ctype, cid, cidx), cr in zip(comment_targets, comment_results):
            if isinstance(cr, Exception):
                continue
            raw_comments = _extract_items(cr)
            raw_comments.sort(key=lambda x: x.get("date_co") or "", reverse=True)
            formatted = [{"id": co.get("ref_co"), "text": co.get("comment_co"), "date": co.get("date_co"),
                           "author": f'{co.get("firstname_us", "")} {co.get("lastname_us", "")}'.strip(),
                           "initials": co.get("initials_us")} for co in raw_comments[:max_comments]]
            if ctype == "issue":
                open_issues[cidx]["comments"] = formatted
            elif ctype == "action":
                open_actions[cidx]["comments"] = formatted
            elif ctype == "phase":
                macro_phases[cidx]["comments"] = formatted

    # Build project header
    pm = proj.get("Project_manager") or {}
    sponsor = proj.get("Sponsor") or {}
    cats = proj.get("Enterprise_categories") or []
    custom_ind = proj.get("Custom_indicators") or []
    project_header = {
        "id": proj.get("Ref"), "name": proj.get("Name"), "status": proj.get("Status"),
        "start_date": proj.get("Start_date"), "target_date": proj.get("Target_date"), "today": today,
        "general_situation": proj.get("General_situation"), "detailed_situation": proj.get("Detailed_situation"),
        "description": proj.get("Description"),
        "pct": _parse_pct(proj.get("Tasks_progress")), "delta_w1": proj.get("Delta_progress_w1"), "delta_w4": proj.get("Delta_progress_w4"),
        "weather": proj.get("Weather"), "trend": proj.get("Trend"), "criticality": proj.get("Criticality"),
        "last_update": proj.get("Last_update_date"),
        "pm": {"id": pm.get("ref_us"), "name": pm.get("name_us")},
        "sponsor": {"name": sponsor.get("lastname"), "firstname": sponsor.get("firstname"), "org_id": sponsor.get("organization_id")},
        "categories": [{"id": c_.get("id"), "name": c_.get("name")} for c_ in (cats if isinstance(cats, list) else [])],
        "custom_indicators": [{"title": ci.get("title"), "value": ci.get("value"), "type": ci.get("type")} for ci in (custom_ind if isinstance(custom_ind, list) else [])],
        "risk_summary": {"total": (proj.get("Active_risks") or {}).get("number", 0), "by_severity": _parse_by_status((proj.get("Active_risks") or {}).get("byStatus"))},
        "task_summary": {"total": (proj.get("Tasks") or {}).get("number", 0), "by_status": _parse_by_status((proj.get("Tasks") or {}).get("byStatus"))},
        "milestone_summary": {"total": (proj.get("Milestones") or {}).get("number", 0), "by_status": _parse_by_status((proj.get("Milestones") or {}).get("byStatus"))},
        "action_summary": {"total": (proj.get("Actions") or {}).get("number", 0), "by_status": _parse_by_status((proj.get("Actions") or {}).get("byStatus"))},
        "issue_summary": {"total": (proj.get("Issues") or {}).get("number", 0), "by_status": _parse_by_status((proj.get("Issues") or {}).get("byStatus"))},
        "deliverable_summary": {"total": (proj.get("Deliverables") or {}).get("number", 0), "by_status": _parse_by_status((proj.get("Deliverables") or {}).get("byStatus"))},
    }

    duration_ms = int((time.monotonic() - t0) * 1000)
    return _ok({
        "project": project_header, "macro_phases": macro_phases, "milestones": milestones,
        "open_issues": open_issues, "closed_issues": closed_issues, "open_actions": open_actions,
        "pending_deliverables": pending_deliverables, "goals": goals_out, "team": team,
        "_meta": {"generated_at": datetime.utcnow().isoformat() + "Z", "today": today,
                  "project_id": pid, "gouti_calls": gouti_calls, "duration_ms": duration_ms},
    })


async def _handle_portfolio_health(c: "GoutiApiClient", a: dict) -> dict:
    """Health snapshot for all projects with parsed status counts."""
    include_archived = a.get("include_archived", False)
    calls = [c.call("projects")]
    if include_archived:
        calls.append(c.call("projects/archived"))
    results = await asyncio.gather(*calls, return_exceptions=True)

    all_projects = []
    for r in results:
        if isinstance(r, Exception):
            continue
        all_projects.extend(_extract_items(r))

    filtered = _filter_projects(all_projects, a)
    today = date.today().isoformat()
    summaries = [_project_with_counts(p, today) for p in filtered]
    summaries = _sort_projects(summaries, a.get("sort_by", "last_update"))

    return _ok({"today": today, "count": len(summaries), "items": summaries})


async def _handle_pm_portfolio(c: "GoutiApiClient", a: dict) -> dict:
    """All projects managed by a specific user."""
    user_id = _req(a, "user_id")
    include_archived = a.get("include_archived", False)
    calls = [c.call("projects")]
    if include_archived:
        calls.append(c.call("projects/archived"))
    results = await asyncio.gather(*calls, return_exceptions=True)

    all_projects = []
    for r in results:
        if isinstance(r, Exception):
            continue
        all_projects.extend(_extract_items(r))

    # Filter by PM
    pm_projects = [p for p in all_projects if str((p.get("Project_manager") or {}).get("ref_us")) == str(user_id)]
    filtered = _filter_projects(pm_projects, a)
    today = date.today().isoformat()
    summaries = [_project_with_counts(p, today) for p in filtered]
    summaries.sort(key=lambda p: p.get("end") or "9999")

    return _ok({"user_id": user_id, "today": today, "count": len(summaries), "items": summaries})


async def _handle_weekly_timesheets(c: "GoutiApiClient", a: dict) -> dict:
    """Aggregated timesheet data for a given ISO week."""
    import time
    t0 = time.monotonic()
    week_start = _req(a, "week_start")
    d = date.fromisoformat(week_start)
    year, week_num, _ = d.isocalendar()
    period_end = (d + __import__("datetime").timedelta(days=4)).isoformat()
    filter_pid = a.get("filter_project_id")
    user_ids = a.get("user_ids")
    all_users_fetched = False
    gouti_calls = 0

    if not user_ids:
        users_data = await c.call("users")
        gouti_calls += 1
        all_users_fetched = True
        users_list = _extract_items(users_data)
        user_ids = [str(u.get("Ref") or u.get("ref_us") or u.get("id")) for u in users_list if u.get("Ref") or u.get("ref_us")]

    # Parallel timesheet fetch
    ts_calls = [c.call(f"timesheets/users/{uid}/timesheet/year/{year}/week/{week_num}/type/1") for uid in user_ids]
    ts_results = await asyncio.gather(*ts_calls, return_exceptions=True)
    gouti_calls += len(ts_calls)

    by_user = []
    project_totals: dict[str, dict] = {}

    for uid, tr in zip(user_ids, ts_results):
        if isinstance(tr, Exception):
            continue
        entries = _extract_items(tr)
        user_projects: dict[str, float] = {}
        user_name = ""
        for e in entries:
            pid = str(e.get("project_id") or e.get("ref_pr") or "")
            pname = str(e.get("project_name") or e.get("name_pr") or pid)
            hours = float(e.get("value") or e.get("hours") or 0)
            if not user_name:
                user_name = str(e.get("user_name") or e.get("name_us") or uid)
            if filter_pid and pid != filter_pid:
                continue
            user_projects[pid] = user_projects.get(pid, 0) + hours
            if pid not in project_totals:
                project_totals[pid] = {"project_id": pid, "project_name": pname, "total_hours": 0, "contributors": set()}
            project_totals[pid]["total_hours"] += hours
            project_totals[pid]["contributors"].add(uid)

        total = sum(user_projects.values())
        if total > 0:
            by_user.append({
                "user_id": uid, "user_name": user_name, "total_hours": round(total, 2),
                "by_project": [{"project_id": k, "hours": round(v, 2)} for k, v in user_projects.items()],
            })

    by_project = [{"project_id": v["project_id"], "project_name": v["project_name"],
                    "total_hours": round(v["total_hours"], 2), "contributors": len(v["contributors"])}
                   for v in project_totals.values()]
    by_project.sort(key=lambda x: x["total_hours"], reverse=True)

    return _ok({
        "week": f"{year}-W{week_num:02d}", "period": {"start": week_start, "end": period_end},
        "today": date.today().isoformat(),
        "by_user": by_user, "by_project": by_project,
        "team_total_hours": round(sum(u["total_hours"] for u in by_user), 2),
        "coverage": {"users_with_data": len(by_user), "users_total": len(user_ids)},
        "_meta": {"gouti_calls": gouti_calls, "duration_ms": int((time.monotonic() - t0) * 1000), "all_users_fetched": all_users_fetched},
    })


async def _handle_user_dashboard(c: "GoutiApiClient", a: dict) -> dict:
    """Personal dashboard for one Gouti user."""
    import time
    t0 = time.monotonic()
    uid = _req(a, "user_id")
    today = date.today().isoformat()

    results = await asyncio.gather(
        c.call(f"users/{uid}"),
        c.call(f"users/{uid}/tasks"),
        c.call(f"users/{uid}/actions"),
        c.call(f"users/{uid}/issues"),
        c.call(f"users/{uid}/notifications"),
        c.call(f"users/{uid}/personnals-notes"),
        return_exceptions=True,
    )

    user_data = results[0] if not isinstance(results[0], Exception) else {}
    tasks = _extract_items(results[1]) if not isinstance(results[1], Exception) else []
    actions_raw = _extract_items(results[2]) if not isinstance(results[2], Exception) else []
    issues_raw = _extract_items(results[3]) if not isinstance(results[3], Exception) else []
    notifs = _extract_items(results[4]) if not isinstance(results[4], Exception) else []
    notes = _extract_items(results[5]) if not isinstance(results[5], Exception) else []

    # Filter open tasks/actions/issues
    open_tasks = [t for t in tasks if str(t.get("status_ta")) in ("0", "1")]
    open_tasks.sort(key=lambda t: t.get("actual_end_date_ta") or "9999")
    open_actions = [a_ for a_ in actions_raw if str(a_.get("status_ac")) in ("0", "1")]
    open_issues = [i for i in issues_raw if str(i.get("status_is")) in ("0", "1")]

    tasks_overdue = sum(1 for t in open_tasks
                        if t.get("actual_end_date_ta") and str(t.get("actual_end_date_ta"))[:10] < today and str(t.get("status_ta")) != "2")

    user_info = {"id": user_data.get("ref_us") or uid,
                  "name": f'{user_data.get("lastname", "")} {user_data.get("firstname", "")}'.strip(),
                  "initials": user_data.get("initials")}

    return _ok({
        "user": user_info, "today": today,
        "open_tasks": [{"id": t.get("ref_ta"), "project_id": t.get("ref_pr_ta"), "project_name": t.get("name_pr"),
                         "name": t.get("name_ta"), "due_date": t.get("actual_end_date_ta"),
                         "pct": _parse_pct(t.get("progress_ta")), "status": t.get("status_ta"),
                         "overdue": bool(t.get("actual_end_date_ta") and str(t.get("actual_end_date_ta"))[:10] < today)}
                        for t in open_tasks],
        "open_actions": [{"id": a_.get("ref_ac"), "project_id": a_.get("ref_pr_ac"), "project_name": a_.get("name_pr"),
                           "name": a_.get("name_ac"), "due_date": a_.get("actual_target_date_ac"),
                           "status": a_.get("status_ac"), "progress": _parse_pct(a_.get("progress_ac"))}
                          for a_ in open_actions],
        "open_issues": [{"id": i.get("ref_is"), "project_id": i.get("ref_pr_is"), "project_name": i.get("name_pr"),
                          "subject": i.get("subject_is"), "priority": i.get("priority_is"), "status": i.get("status_is")}
                         for i in open_issues],
        "notifications": [{"id": n.get("ref_no") or n.get("id"), "message": n.get("message") or n.get("text"),
                            "date": n.get("date") or n.get("created_at")} for n in notifs[:20]],
        "personal_notes": [{"id": n.get("ref_no") or n.get("id"), "text": n.get("note_no") or n.get("text")} for n in notes[:20]],
        "_summary": {"tasks_total": len(open_tasks), "tasks_overdue": tasks_overdue,
                      "actions_total": len(open_actions), "issues_total": len(open_issues),
                      "notifications_total": len(notifs)},
        "_meta": {"gouti_calls": 6, "duration_ms": int((time.monotonic() - t0) * 1000)},
    })


# ═══════════════════════════════════════════════════════════════════════════════
# Tool definitions — 12 consolidated tools + 7 aggregation tools
# ═══════════════════════════════════════════════════════════════════════════════

def _s(props: dict | None = None, required: list | None = None) -> dict:
    schema: dict[str, Any] = {"type": "object", "properties": props or {}}
    if required:
        schema["required"] = required
    return schema


GOUTI_TOOLS: list[tuple[str, str, dict, Any]] = [
    ("list",
     "Liste des entités Gouti avec filtre optionnel. Types: projects, archived_projects, tasks, "
     "actions, issues, deliverables, goals, reports, organization, users, user_tasks, user_actions, "
     "user_issues, entity_categories, activity_labels, notifications. "
     "Passer project_id pour les types liés à un projet, user_id pour ceux liés à un utilisateur. "
     "search filtre les résultats (nom, code, ref, description…). "
     "limit=20 par défaut, limit=0 pour tout récupérer.",
     _s({
         "type": {"type": "string", "description": "Type d'entité à lister"},
         "project_id": {"type": "string", "description": "ID projet (si type lié à un projet)"},
         "user_id": {"type": "string", "description": "ID utilisateur (si type lié à un user)"},
         "search": {"type": "string", "description": "Filtre texte (insensible à la casse)"},
         "limit": {"type": "integer", "description": "Max items (défaut 20, 0=tous)"},
     }, ["type"]),
     _handle_list),

    ("get",
     "Détail d'une entité Gouti. Types: project, task, action, issue, deliverable, goal, "
     "organization_unit, user, entity_category, activity_label. "
     "Passer project_id pour les types liés à un projet.",
     _s({
         "type": {"type": "string", "description": "Type d'entité"},
         "id": {"type": "string", "description": "ID de l'entité"},
         "project_id": {"type": "string", "description": "ID projet (si applicable)"},
     }, ["type", "id"]),
     _handle_get),

    ("update",
     "Met à jour une entité Gouti. Types supportés: task, action, issue. "
     "L'API Gouti NE PERMET PAS la mise à jour de projects, deliverables, goals, "
     "users ni organization units. "
     "IMPORTANT — champs réellement modifiables (source: Postman collection officielle Gouti v1 EVO 07-2025): "
     "• task: name_ta, description_ta, status_ta, progress_ta (int), workload (int). "
     "• action: name_ac, description_ac, status_ac, progress_ac (int). "
     "• issue: name_is, description_is, status_is, progress_is (int). "
     "Les dates (initial_start_date_ta, initial_end_date_ta, actual_*_date_ta), "
     "duration_ta et les autres champs NE SONT PAS modifiables via l'API Gouti — "
     "ils seront ignorés et listés dans mcp_warning.dropped_fields de la réponse. "
     "Le nom (name_ta/ac/is) est auto-rempli depuis le record courant si absent du payload. "
     "progress_* et workload doivent être des entiers (conversion automatique faite par le MCP).",
     _s({
         "type": {"type": "string", "enum": ["task", "action", "issue"],
                  "description": "Type d'entité (project non supporté)"},
         "id": {"type": "string", "description": "ID de l'entité"},
         "project_id": {"type": "string", "description": "ID projet (obligatoire)"},
         "payload": {"type": "object",
                     "description": "Champs à modifier (filtrés à la whitelist Gouti)"},
     }, ["type", "id", "project_id", "payload"]),
     _handle_update),

    ("search_user",
     "Recherche un utilisateur par matricule.",
     _s({"matricule": {"type": "string"}}, ["matricule"]),
     _get_user_by_matricule),

    ("get_comments",
     "Commentaires d'une activité (tâche, action ou issue) dans un projet.",
     _s({
         "project_id": {"type": "string"},
         "activity_type": {"type": "string", "enum": ["tasks", "actions", "issues"]},
         "activity_id": {"type": "string"},
     }, ["project_id", "activity_type", "activity_id"]),
     _get_comments),

    ("refresh_tasks",
     "Recalcule les tâches d'un projet.",
     _s({"project_id": {"type": "string"}}, ["project_id"]),
     _refresh_tasks),

    ("timesheet",
     "Gestion des feuilles de temps. Actions: control (état), get (semaine), insert (saisie), validate.",
     _s({
         "action": {"type": "string", "enum": ["control", "get", "insert", "validate"]},
         "user_id": {"type": "string"},
         "year": {"type": "string", "description": "Année 4 chiffres (get)"},
         "week": {"type": "string", "description": "Numéro de semaine (get)"},
         "ts_type": {"type": "string", "description": "Type timesheet, défaut 1 (get/insert)"},
         "date": {"type": "string", "description": "dd-mm-yyyy (insert/validate)"},
         "ref": {"type": "string", "description": "Réf activité (insert)"},
         "value": {"type": "string", "description": "Heures (insert)"},
         "status": {"type": "string", "description": "Statut validation (validate)"},
     }, ["action", "user_id"]),
     _handle_timesheet),

    ("notifications",
     "Gestion des notifications utilisateur. Actions: list, check (marquer lue), delete.",
     _s({
         "action": {"type": "string", "enum": ["list", "check", "delete"]},
         "user_id": {"type": "string"},
         "notification_id": {"type": "string", "description": "ID notification (check/delete)"},
     }, ["user_id"]),
     _handle_notifications),

    ("user_notes",
     "Notes personnelles d'un utilisateur. Actions: get, save.",
     _s({
         "action": {"type": "string", "enum": ["get", "save"]},
         "user_id": {"type": "string"},
         "note": {"type": "string", "description": "Contenu (save)"},
     }, ["user_id"]),
     _handle_user_notes),

    ("api_get",
     "GET générique vers l'API Gouti. Paramètres query via l'objet params (ex: params={search: 'BIPAGA', limit: 10}).",
     _s({
         "path": {"type": "string", "description": "Chemin relatif (ex: 'projects')"},
         "params": {"type": "object", "description": "Query params (ex: {search: 'x', limit: 10})"},
     }, ["path"]),
     _api_get),

    ("api_post",
     "POST générique vers l'API Gouti.",
     _s({
         "path": {"type": "string"},
         "payload": {"type": "object"},
         "params": {"type": "object", "description": "Query params optionnels"},
     }, ["path"]),
     _api_post),

    # ── Aggregation tools (parallelized multi-call) ─────────────────
    ("get_gantt_summary",
     "Portfolio Gantt data for all Gouti projects. Returns start date, current target end date, today (server-generated), progress %, velocity deltas, weather, trend, and raw enterprise categories. planned_end is always null at project level. No client-specific category interpretation.",
     _s({
         "status_filter": {"type": "array", "items": {"type": "string"}, "description": "Keep only projects with Status in this list"},
         "exclude_status": {"type": "array", "items": {"type": "string"}, "description": "Exclude projects with Status in this list"},
         "include_archived": {"type": "boolean", "default": False},
         "sort_by": {"type": "string", "enum": ["start", "end", "pct", "name", "last_update"], "default": "start"},
     }), _handle_gantt_summary),

    ("get_macro_tasks",
     "Level-1 macro phase tasks for one project. Returns all 4 dates per phase: planned_start/end (baseline) and actual_start/end (current), plus today and delay_days. Use for planned vs actual Gantt.",
     _s({"project_id": {"type": "string"}}, ["project_id"]),
     _handle_macro_tasks),

    ("get_tcm_snapshot",
     "Complete project snapshot for status reporting and TCM slides. Single MCP call returning project header, macro phases with planned vs actual, milestones with delay, open issues + comments, open actions + comments, pending deliverables, goals, team. All Gouti sub-calls parallelized across 3 waves.",
     _s({
         "project_id": {"type": "string"},
         "max_comments_per_item": {"type": "integer", "default": 5},
         "include_closed_issues": {"type": "boolean", "default": True},
         "include_phase_comments": {"type": "boolean", "default": False},
     }, ["project_id"]),
     _handle_tcm_snapshot),

    ("get_portfolio_health",
     "Health snapshot for all Gouti projects. Returns weather, trend, progress velocity, and parsed status counts for tasks/milestones/issues/actions/deliverables/risks. Does NOT compute RAG. Client-agnostic.",
     _s({
         "status_filter": {"type": "array", "items": {"type": "string"}},
         "exclude_status": {"type": "array", "items": {"type": "string"}},
         "include_archived": {"type": "boolean", "default": False},
         "sort_by": {"type": "string", "enum": ["last_update", "pct", "end", "name", "start"], "default": "last_update"},
     }), _handle_portfolio_health),

    ("get_pm_portfolio",
     "All projects managed by a specific user (filtered by Project_manager.ref_us). Returns lean project data with dates and status counts. Useful for personal weekly reports.",
     _s({
         "user_id": {"type": "string", "description": "Gouti user ref_us"},
         "status_filter": {"type": "array", "items": {"type": "string"}},
         "exclude_status": {"type": "array", "items": {"type": "string"}},
         "include_archived": {"type": "boolean", "default": False},
     }, ["user_id"]),
     _handle_pm_portfolio),

    ("get_weekly_timesheets",
     "Aggregated timesheet data for a given ISO week, grouped by user and by project. Pass user_ids explicitly for best performance. All user calls parallelized.",
     _s({
         "week_start": {"type": "string", "description": "ISO date of the Monday (YYYY-MM-DD)"},
         "user_ids": {"type": "array", "items": {"type": "string"}, "description": "Gouti user IDs. If absent, fetches all users (slow)."},
         "filter_project_id": {"type": "string", "description": "Filter output to this project only"},
     }, ["week_start"]),
     _handle_weekly_timesheets),

    ("get_user_dashboard",
     "Personal dashboard for one Gouti user. Returns open tasks sorted by deadline (with overdue flag), open actions, open issues, notifications, and personal notes. All 6 Gouti calls parallelized.",
     _s({"user_id": {"type": "string", "description": "Gouti user ID (ref_us)"}}, ["user_id"]),
     _handle_user_dashboard),
]

GOUTI_TOOLS_LIST = [{"name": n, "description": d, "inputSchema": s} for n, d, s, _ in GOUTI_TOOLS]
GOUTI_HANDLERS: dict[str, Any] = {n: h for n, _, _, h in GOUTI_TOOLS}


# ═══════════════════════════════════════════════════════════════════════════════
# Load Gouti credentials from integration settings (DB)
# ═══════════════════════════════════════════════════════════════════════════════

_GOUTI_PREFIX = "integration.gouti"

# Schemas to ignore when scanning for Gouti settings
_SYSTEM_SCHEMAS = frozenset({
    "information_schema", "pg_catalog", "pg_toast",
})


async def _find_gouti_settings() -> tuple[str, dict[str, str]]:
    """Auto-detect which tenant schema has Gouti configured.

    Scans all non-system schemas for integration.gouti.* settings
    with a valid client_id. Returns (schema_name, settings_dict).
    """
    from sqlalchemy import text
    from app.core.database import async_session_factory

    async with async_session_factory() as session:
        # List tenant schemas
        result = await session.execute(text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name NOT LIKE 'pg_%'"
        ))
        schemas = [
            row[0] for row in result.fetchall()
            if row[0] not in _SYSTEM_SCHEMAS
        ]
        logger.debug("Gouti settings scan: checking %d schemas: %s", len(schemas), schemas)

    # Use a separate session per schema to avoid broken transaction state
    # when a schema doesn't have a settings table
    for schema in schemas:
        if not schema.isidentifier():
            continue
        try:
            async with async_session_factory() as session:
                await session.execute(text(f"SET search_path TO {schema}"))
                result = await session.execute(text(
                    "SELECT key, value FROM settings "
                    "WHERE key LIKE 'integration.gouti.%' "
                    "AND scope = 'entity'"
                ))
                rows = result.fetchall()
        except Exception as exc:
            logger.debug("Gouti settings scan: schema '%s' skipped (%s)", schema, exc)
            continue

        if not rows:
            logger.debug("Gouti settings scan: schema '%s' has no gouti settings", schema)
            continue

        settings: dict[str, str] = {}
        for row in rows:
            field = row[0].replace(_GOUTI_PREFIX + ".", "")
            val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
            settings[field] = str(val).strip() if val else ""

        logger.debug("Gouti settings scan: schema '%s' has keys: %s", schema, list(settings.keys()))

        # Accept if we have client_id + (token OR client_secret)
        if settings.get("client_id") and (
            settings.get("token") or settings.get("client_secret")
        ):
            logger.info(
                "Gouti native: found settings in schema '%s' (%d keys, token=%s)",
                schema, len(settings), bool(settings.get("token")),
            )
            return schema, settings

    raise RuntimeError(
        "Aucun tenant avec Gouti configuré trouvé. "
        "Configurez Gouti dans Paramètres > Intégrations > Gouti "
        "(client_id + token ou client_secret requis)."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Factory — creates a NativeBackend from integration settings
# ═══════════════════════════════════════════════════════════════════════════════

async def create_gouti_backend(config: dict) -> "NativeBackend":
    """Create a Gouti NativeBackend.

    Reads credentials from the existing integration.gouti.* settings
    already configured in the OpsFlux UI (Paramètres > Intégrations > Gouti).
    Auto-detects which tenant schema contains the settings.
    """
    from app.mcp.mcp_native import NativeBackend

    # Auto-detect tenant schema + load settings from DB
    try:
        schema, settings = await _find_gouti_settings()
        logger.info("Gouti native: using credentials from schema '%s'", schema)
    except RuntimeError:
        logger.error(
            "Gouti native: aucun tenant avec Gouti configuré. "
            "Configurez Gouti dans Paramètres > Intégrations > Gouti."
        )
        raise

    client = GoutiApiClient(
        base_url=settings.get("base_url", "https://apiprd.gouti.net/v1/client"),
        client_id=settings["client_id"],
        client_secret=settings.get("client_secret", ""),
        entity_code=settings.get("entity_code", ""),
        token=settings.get("token"),
    )

    # Authenticate via OAuth2 only if no token and we have a secret
    if not client._token and client.client_secret:
        await client.authenticate()
        logger.info("Gouti native: authenticated via OAuth2 to %s", client.base_url)
    elif client._token:
        logger.info("Gouti native: using existing token for %s", client.base_url)
    else:
        raise RuntimeError(
            "Gouti: ni token ni client_secret configuré — impossible de s'authentifier."
        )

    async def call_tool(name: str, arguments: dict) -> dict:
        handler = GOUTI_HANDLERS.get(name)
        if handler is None:
            raise ValueError(f"Outil Gouti inconnu: {name}")
        return await handler(client, arguments)

    async def close():
        await client.close()

    return NativeBackend(
        name="opsflux-gouti",
        version="1.0.0",
        tools_list=GOUTI_TOOLS_LIST,
        call_tool=call_tool,
        close_fn=close,
    )
