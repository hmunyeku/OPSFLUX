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


def _items(data: Any, key: str) -> list:
    """Extract list items from various Gouti response formats.

    Gouti returns list endpoints in several shapes:
    - ``[...]`` : a plain list
    - ``{"projects": [...]}`` : explicit key wrapper
    - ``{"data": [...]}`` / ``{"items": [...]}`` : generic wrappers
    - ``{"28364": {...}, "28365": {...}}`` : dict keyed by entity ID
      (this is the most common shape for projects, users, tasks, …)
    """
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # 1. Explicit list wrappers
        for candidate_key in (key, "data", "items", "results"):
            val = data.get(candidate_key)
            if isinstance(val, list):
                return val
            if isinstance(val, dict):
                # Wrapped dict keyed by ID — flatten to list of values
                nested = list(val.values())
                if nested and all(isinstance(v, dict) for v in nested):
                    # Preserve the ID as a field for later reference
                    out = []
                    for k, v in val.items():
                        item = dict(v)
                        item.setdefault("_id", k)
                        out.append(item)
                    return out
        # 2. Top-level dict keyed by ID (common Gouti pattern)
        values = list(data.values())
        if values and all(isinstance(v, dict) for v in values):
            out = []
            for k, v in data.items():
                item = dict(v)
                item.setdefault("_id", k)
                out.append(item)
            return out
        return []
    return []


# Fields to keep when summarising list items (keeps responses compact)
_SUMMARY_FIELDS = {
    "id", "Id", "ID", "name", "Name", "label", "Label", "title", "Title",
    "status", "Status", "state", "code", "Code", "slug", "type", "Type",
    "start_date", "end_date", "due_date", "priority", "Priority",
    "assigned_to", "owner", "matricule", "email", "first_name", "last_name",
    "description",
}

_MAX_LIST_ITEMS = 50


def _summarise_list(items: list, max_items: int = _MAX_LIST_ITEMS) -> dict:
    """Return a compact summary of a list, keeping only key fields."""
    total = len(items)
    truncated = items[:max_items]
    compact = []
    for item in truncated:
        if isinstance(item, dict):
            # Keep only essential fields + any field containing "name" or "id"
            row = {
                k: v for k, v in item.items()
                if k in _SUMMARY_FIELDS or "name" in k.lower() or k.lower() == "id"
            }
            compact.append(row if row else item)
        else:
            compact.append(item)
    result: dict = {"count": total, "items": compact}
    if total > max_items:
        result["note"] = f"Affichage limité à {max_items}/{total} éléments. Utilisez limit=0 pour tout récupérer ou affinez votre requête."
    return result


_MAX_RESPONSE_CHARS = 12_000  # ~3 000 tokens — keeps Claude context manageable


def _ok(data: Any) -> dict:
    """Format a successful MCP tool result, truncating if too large."""
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(text) > _MAX_RESPONSE_CHARS:
        text = text[:_MAX_RESPONSE_CHARS] + '\n... [tronqué — réponse trop longue, affinez votre requête]'
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


def _matches_search(item: Any, query: str) -> bool:
    """Case-insensitive substring match across common text fields."""
    if not isinstance(item, dict):
        return query.lower() in str(item).lower()
    q = query.lower()
    for key in ("Name", "name", "Ref", "ref", "Code", "code", "Title", "title",
                "Description", "description", "Label", "label",
                "first_name", "last_name", "email", "matricule"):
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

_UPDATE_ROUTES: dict[str, str] = {
    "project": "projects/{id}",
    "task":    "projects/{pid}/tasks/{id}",
    "action":  "projects/{pid}/actions/{id}",
    "issue":   "projects/{pid}/issues/{id}",
}


# Date fields that Gouti expects in DD-MM-YYYY format (not ISO).
_DATE_FIELD_RE = re.compile(r"(_date_|^date_|_date$|^date$|_dt_|_dt$)", re.IGNORECASE)
_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")


def _normalise_date_fields(payload: dict) -> dict:
    """Convert ISO dates (YYYY-MM-DD) to Gouti's DD-MM-YYYY format.

    Gouti silently drops dates in wrong formats, so we normalise here.
    Only fields whose name matches a date pattern are touched.
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
# If they're missing on update we pre-fetch the current value to avoid the
# "Missing principal argument" error.
_PRINCIPAL_FIELDS = {
    "task":    ("name_ta",  lambda pid, tid: f"projects/{pid}/tasks/{tid}"),
    "action":  ("name_ac",  lambda pid, tid: f"projects/{pid}/actions/{tid}"),
    "issue":   ("name_is",  lambda pid, tid: f"projects/{pid}/issues/{tid}"),
    "project": ("name_pr",  lambda _pid, tid: f"projects/{tid}"),
}


async def _handle_update(c: GoutiApiClient, a: dict) -> dict:
    entity_type = _req(a, "type")
    route = _UPDATE_ROUTES.get(entity_type)
    if not route:
        return _ok({"error": f"Type inconnu: '{entity_type}'", "types_disponibles": sorted(_UPDATE_ROUTES)})

    raw_payload = a.get("payload")
    if not isinstance(raw_payload, dict):
        raise ValueError("payload objet requis.")

    entity_id = _seg(_req(a, "id"), "id")
    url = route.replace("{id}", entity_id)
    project_id = None
    if "{pid}" in url:
        project_id = _pid(a)
        url = url.replace("{pid}", project_id)

    # Normalise ISO dates → DD-MM-YYYY (Gouti silently drops wrong formats)
    payload = _normalise_date_fields(raw_payload)

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
                    # Some endpoints wrap the record in a list/dict
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
                    logger.debug("Gouti update: pre-filled %s=%r", field_name, current_value)
        except Exception as exc:
            logger.warning("Gouti update: could not pre-fetch %s: %s", field_name, exc)

    # Call Gouti — response includes updated_fields so the caller sees
    # exactly what was applied (or silently dropped).
    return _ok(await c.call(url, "POST", payload))


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
# Tool definitions — 12 consolidated tools
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
     "Met à jour une entité Gouti. Types: project, task, action, issue. "
     "Passer project_id pour task/action/issue. "
     "Les dates peuvent être au format ISO (YYYY-MM-DD), elles seront converties. "
     "Champs tâche: name_ta, description_ta, status_ta, progress_ta, workload_ta, "
     "initial_start_date_ta, initial_end_date_ta, actual_start_date_ta, actual_end_date_ta, "
     "duration_ta, milestone_ta. "
     "Champs action: description_ac, status_ac, progress_ac. "
     "Champs issue: description_is, status_is, progress_is. "
     "Le nom (name_ta/ac/is/pr) est auto-rempli si absent du payload. "
     "La réponse retourne updated_fields indiquant ce qui a effectivement été modifié.",
     _s({
         "type": {"type": "string", "description": "Type: project, task, action, issue"},
         "id": {"type": "string", "description": "ID de l'entité"},
         "project_id": {"type": "string", "description": "ID projet (requis pour task/action/issue)"},
         "payload": {"type": "object", "description": "Champs à modifier"},
     }, ["type", "id", "payload"]),
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
