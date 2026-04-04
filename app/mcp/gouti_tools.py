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
                   body: dict | None = None) -> dict[str, Any]:
        """Call Gouti API with auto-refresh on 401."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        kw: dict[str, Any] = {"headers": self._auth_headers()}
        if body is not None:
            kw["json"] = body
            kw["headers"] = {**kw["headers"], "Content-Type": "application/json"}

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


def _items(data: Any, key: str) -> Any:
    """Extract list items from various Gouti response formats."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get(key) or data.get("data") or data.get("items") or []
    return data


# Fields to keep when summarising list items (keeps responses compact)
_SUMMARY_FIELDS = {
    "id", "Id", "ID", "name", "Name", "label", "Label", "title", "Title",
    "status", "Status", "state", "code", "Code", "slug", "type", "Type",
    "start_date", "end_date", "due_date", "priority", "Priority",
    "assigned_to", "owner", "matricule", "email", "first_name", "last_name",
    "description",
}

_MAX_LIST_ITEMS = 50


def _summarise_list(items: list) -> dict:
    """Return a compact summary of a list, keeping only key fields."""
    total = len(items)
    truncated = items[:_MAX_LIST_ITEMS]
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
    if total > _MAX_LIST_ITEMS:
        result["note"] = f"Affichage limité à {_MAX_LIST_ITEMS}/{total} éléments. Utilisez un filtre pour affiner."
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
    return _ok(await c.call(p))


async def _api_post(c: GoutiApiClient, a: dict) -> dict:
    p = _path_validate(_req(a, "path"), "path")
    payload = a.get("payload") or {}
    return _ok(await c.call(p, "POST", payload))


# ═══════════════════════════════════════════════════════════════════════════════
# Tool definitions (name, description, inputSchema, handler)
# ═══════════════════════════════════════════════════════════════════════════════

def _s(props: dict | None = None, required: list | None = None) -> dict:
    schema: dict[str, Any] = {"type": "object", "properties": props or {}}
    if required:
        schema["required"] = required
    return schema


_P = {"project_id": {"type": "string", "description": "ID du projet Gouti"}}
_U = {"user_id": {"type": "string", "description": "ID de l'utilisateur Gouti"}}

GOUTI_TOOLS: list[tuple[str, str, dict, Any]] = [
    # Entity categories
    ("list_entity_categories",
     "Liste les catégories d'entités Gouti.",
     _s(), _list_entity_categories),
    ("get_entity_category",
     "Récupère une catégorie d'entité par ID.",
     _s({"category_id": {"type": "string"}}, ["category_id"]),
     _get_entity_category),

    # Activity labels
    ("list_activity_labels",
     "Liste les labels d'activités Gouti.",
     _s(), _list_activity_labels),
    ("get_activity_label",
     "Récupère un label d'activité par ID.",
     _s({"label_id": {"type": "string"}}, ["label_id"]),
     _get_activity_label),

    # Projects
    ("list_projects",
     "Liste tous les projets Gouti (sauf archivés).",
     _s(), _list_projects),
    ("list_archived_projects",
     "Liste les projets archivés.",
     _s(), _list_archived_projects),
    ("get_project",
     "Récupère les détails d'un projet.",
     _s(_P, ["project_id"]), _get_project),
    ("update_project",
     "Met à jour un projet (POST). Payload: progress_pr, status_pr, etc.",
     _s({**_P, "payload": {"type": "object", "description": "Champs à modifier"}},
        ["project_id", "payload"]),
     _update_project),

    # Tasks
    ("list_project_tasks",
     "Liste les tâches d'un projet.",
     _s(_P, ["project_id"]), _list_project_tasks),
    ("get_task",
     "Récupère le détail d'une tâche.",
     _s({**_P, "task_id": {"type": "string"}}, ["project_id", "task_id"]),
     _get_task),
    ("update_task",
     "Met à jour une tâche. Payload: name_ta, description_ta, status_ta, progress_ta, workload.",
     _s({**_P, "task_id": {"type": "string"}, "payload": {"type": "object"}},
        ["project_id", "task_id", "payload"]),
     _update_task),
    ("refresh_tasks",
     "Rafraîchit/recalcule les tâches d'un projet (POST tasks/refresh).",
     _s(_P, ["project_id"]), _refresh_tasks),

    # Actions
    ("list_project_actions",
     "Liste les actions d'un projet.",
     _s(_P, ["project_id"]), _list_project_actions),
    ("get_action",
     "Récupère le détail d'une action.",
     _s({**_P, "action_id": {"type": "string"}}, ["project_id", "action_id"]),
     _get_action),
    ("update_action",
     "Met à jour une action. Payload: description_ac, status_ac, progress_ac.",
     _s({**_P, "action_id": {"type": "string"}, "payload": {"type": "object"}},
        ["project_id", "action_id", "payload"]),
     _update_action),

    # Issues
    ("list_project_issues",
     "Liste les issues d'un projet.",
     _s(_P, ["project_id"]), _list_project_issues),
    ("get_issue",
     "Récupère le détail d'une issue.",
     _s({**_P, "issue_id": {"type": "string"}}, ["project_id", "issue_id"]),
     _get_issue),
    ("update_issue",
     "Met à jour une issue. Payload: description_is, status_is, progress_is.",
     _s({**_P, "issue_id": {"type": "string"}, "payload": {"type": "object"}},
        ["project_id", "issue_id", "payload"]),
     _update_issue),

    # Deliverables
    ("list_project_deliverables",
     "Liste les livrables d'un projet.",
     _s(_P, ["project_id"]), _list_project_deliverables),
    ("get_deliverable",
     "Récupère un livrable par ID.",
     _s({**_P, "deliverable_id": {"type": "string"}}, ["project_id", "deliverable_id"]),
     _get_deliverable),

    # Goals
    ("list_project_goals",
     "Liste les objectifs d'un projet.",
     _s(_P, ["project_id"]), _list_project_goals),
    ("get_goal",
     "Récupère un objectif par ID.",
     _s({**_P, "goal_id": {"type": "string"}}, ["project_id", "goal_id"]),
     _get_goal),

    # Organization
    ("list_project_organization",
     "Récupère l'organisation d'un projet.",
     _s(_P, ["project_id"]), _list_project_organization),
    ("get_organization_unit",
     "Récupère une unité d'organisation.",
     _s({**_P, "orga_id": {"type": "string"}}, ["project_id", "orga_id"]),
     _get_organization_unit),

    # Reports
    ("list_project_reports",
     "Récupère les rapports d'un projet (situation, météo, tendance, avancement).",
     _s(_P, ["project_id"]), _list_project_reports),

    # Comments
    ("get_comments",
     "Récupère les commentaires d'une activité (tâche, action ou issue).",
     _s({**_P,
         "activity_type": {"type": "string", "enum": ["tasks", "actions", "issues"]},
         "activity_id": {"type": "string"}},
        ["project_id", "activity_type", "activity_id"]),
     _get_comments),

    # Users
    ("list_users",
     "Liste tous les utilisateurs Gouti.",
     _s(), _list_users),
    ("get_user",
     "Récupère un utilisateur par ID.",
     _s(_U, ["user_id"]), _get_user),
    ("get_user_by_matricule",
     "Récupère un utilisateur par numéro de matricule.",
     _s({"matricule": {"type": "string"}}, ["matricule"]),
     _get_user_by_matricule),
    ("list_user_tasks",
     "Liste les tâches assignées à un utilisateur.",
     _s(_U, ["user_id"]), _list_user_tasks),
    ("list_user_actions",
     "Liste les actions assignées à un utilisateur.",
     _s(_U, ["user_id"]), _list_user_actions),
    ("list_user_issues",
     "Liste les issues assignées à un utilisateur.",
     _s(_U, ["user_id"]), _list_user_issues),

    # Notifications
    ("list_user_notifications",
     "Liste les notifications d'un utilisateur.",
     _s(_U, ["user_id"]), _list_user_notifications),
    ("check_notification",
     "Marque une notification comme lue.",
     _s({**_U, "notification_id": {"type": "string"}}, ["user_id", "notification_id"]),
     _check_notification),
    ("delete_notification",
     "Supprime une notification.",
     _s({**_U, "notification_id": {"type": "string"}}, ["user_id", "notification_id"]),
     _delete_notification),

    # Personal notes
    ("get_user_notes",
     "Récupère les notes personnelles d'un utilisateur.",
     _s(_U, ["user_id"]), _get_user_notes),
    ("save_user_notes",
     "Sauvegarde les notes personnelles d'un utilisateur.",
     _s({**_U, "note": {"type": "string"}}, ["user_id", "note"]),
     _save_user_notes),

    # Timesheets
    ("get_timesheet_control",
     "Récupère le contrôle de feuille de temps d'un utilisateur.",
     _s(_U, ["user_id"]), _get_timesheet_control),
    ("get_timesheet",
     "Récupère la feuille de temps pour une semaine donnée.",
     _s({**_U, "year": {"type": "string"}, "week": {"type": "string"},
         "type": {"type": "string", "description": "Type de timesheet (défaut: 1)"}},
        ["user_id", "year", "week"]),
     _get_timesheet),
    ("insert_timesheet",
     "Insère/met à jour une entrée de feuille de temps.",
     _s({**_U,
         "date": {"type": "string", "description": "Format: dd-mm-yyyy"},
         "ref": {"type": "string", "description": "Référence de l'activité"},
         "type": {"type": "string", "description": "Type: ta (tâche), ac (action), etc."},
         "value": {"type": "string", "description": "Nombre d'heures"}},
        ["user_id", "date", "ref", "type", "value"]),
     _insert_timesheet),
    ("validate_timesheet",
     "Valide une feuille de temps pour une date donnée.",
     _s({**_U,
         "date": {"type": "string", "description": "Format: dd-mm-yyyy"},
         "status": {"type": "string", "description": "Statut de validation (1=validé)"}},
        ["user_id", "date", "status"]),
     _validate_timesheet),

    # Generic
    ("api_get",
     "Appel GET générique vers un endpoint Gouti relatif à la base URL.",
     _s({"path": {"type": "string"}}, ["path"]), _api_get),
    ("api_post",
     "Appel POST générique vers un endpoint Gouti.",
     _s({"path": {"type": "string"}, "payload": {"type": "object"}}, ["path"]),
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
