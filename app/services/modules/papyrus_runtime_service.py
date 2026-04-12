"""Papyrus runtime services — ref resolution, formula evaluation and render prep."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from jinja2 import BaseLoader, Environment, StrictUndefined
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import Installation
from app.models.common import Project, ProjectTask, ProjectTaskDependency
from app.models.papyrus import PapyrusExternalSubmission, PapyrusForm
from app.services.modules.papyrus_formula_service import evaluate_formula_expression
from app.services.modules.papyrus_versioning_service import ensure_papyrus_document

_template_env = Environment(loader=BaseLoader(), autoescape=False, undefined=StrictUndefined)


async def render_papyrus_document(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document: dict[str, Any],
) -> dict[str, Any]:
    """Resolve refs and formulas into a render-ready Papyrus payload."""

    rendered = deepcopy(document)
    rendered_refs: dict[str, Any] = {}
    rendered_data: dict[str, Any] = rendered.get("data", {}) if isinstance(rendered.get("data"), dict) else {}
    rendered_form_data: dict[str, Any] = (
        rendered_data.get("form_data", {}) if isinstance(rendered_data.get("form_data"), dict) else {}
    )

    refs = rendered.get("refs", [])
    if isinstance(refs, list):
        for ref_item in refs:
            ref_value = ref_item if isinstance(ref_item, str) else ref_item.get("ref")
            if isinstance(ref_value, str):
                rendered_refs[ref_value] = await resolve_ref(db=db, entity_id=entity_id, ref=ref_value)

    blocks = rendered.get("blocks", [])
    resolved_blocks: list[dict[str, Any]] = []
    for block in blocks if isinstance(blocks, list) else []:
        resolved_blocks.append(
            await _render_block(
                db=db,
                entity_id=entity_id,
                block=block,
                rendered_refs=rendered_refs,
                rendered_form_data=rendered_form_data,
                rendered_data=rendered_data,
            )
        )

    rendered["blocks"] = resolved_blocks
    rendered["resolved_refs"] = rendered_refs
    rendered["rendered_at"] = datetime.utcnow().isoformat() + "Z"
    return rendered


async def _render_block(
    *,
    db: AsyncSession,
    entity_id: UUID,
    block: dict[str, Any],
    rendered_refs: dict[str, Any],
    rendered_form_data: dict[str, Any],
    rendered_data: dict[str, Any],
) -> dict[str, Any]:
    current = deepcopy(block)
    block_type = current.get("type")

    if block_type in {"opsflux_kpi", "opsflux_asset", "opsflux_actions", "opsflux_gantt"}:
        ref = current.get("ref")
        if isinstance(ref, str):
            current["resolved"] = rendered_refs.get(ref)
            if block_type == "opsflux_asset" and isinstance(current["resolved"], dict):
                current["display_value"] = current["resolved"].get("name")
            elif block_type == "opsflux_actions" and isinstance(current["resolved"], list):
                current["display_value"] = len(current["resolved"])
            elif block_type == "opsflux_gantt" and isinstance(current["resolved"], dict):
                current["display_value"] = len(current["resolved"].get("tasks", []))
            elif block_type == "opsflux_kpi":
                current["display_value"] = current["resolved"]

    if block_type == "formula":
        expression = current.get("expression")
        if isinstance(expression, str):
            value = await evaluate_formula(
                db=db,
                entity_id=entity_id,
                expression=expression,
                rendered_refs=rendered_refs,
            )
            current["computed_value"] = value
            current["computed_at"] = datetime.utcnow().isoformat() + "Z"

    if block_type == "html_template":
        template_source = current.get("template") or current.get("html") or current.get("source")
        if isinstance(template_source, str):
            current["rendered_html"] = _render_html_template(
                template_source,
                {
                    "refs": rendered_refs,
                    "form_data": rendered_form_data,
                    "block": current,
                    "document": {
                        "resolved_refs": rendered_refs,
                        "form_data": rendered_form_data,
                        "data": rendered_data,
                    },
                },
            )

    children = current.get("children")
    if isinstance(children, list):
        current["children"] = [
            await _render_block(
                db=db,
                entity_id=entity_id,
                block=child,
                rendered_refs=rendered_refs,
                rendered_form_data=rendered_form_data,
                rendered_data=rendered_data,
            )
            if isinstance(child, dict)
            else child
            for child in children
        ]

    return current


async def evaluate_formula(
    *,
    db: AsyncSession,
    entity_id: UUID,
    expression: str,
    rendered_refs: dict[str, Any] | None = None,
) -> Any:
    """Evaluate a safe subset of formula expressions with ref support."""

    rendered_refs = rendered_refs or {}
    return await evaluate_formula_expression(
        db=db,
        entity_id=entity_id,
        expression=expression,
        rendered_refs=rendered_refs,
        resolve_ref=lambda ref: resolve_ref(db=db, entity_id=entity_id, ref=ref),
    )


async def resolve_ref(
    *,
    db: AsyncSession,
    entity_id: UUID,
    ref: str,
) -> Any:
    """Resolve a Papyrus ref URI into current OpsFlux data."""

    if ref.startswith("project://"):
        project_path = ref.removeprefix("project://")
        project_id, _, field = project_path.partition("/")
        project = await db.scalar(select(Project).where(Project.id == UUID(project_id), Project.entity_id == entity_id))
        if project is None:
            return None
        payload = {
            "id": str(project.id),
            "code": project.code,
            "name": project.name,
            "status": project.status,
            "progress": project.progress,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "asset_id": str(project.asset_id) if project.asset_id else None,
        }
        if field == "actions":
            return await _resolve_project_actions(db=db, project_id=project.id)
        if field == "gantt":
            return await _resolve_project_gantt(db=db, project_id=project.id)
        return payload.get(field) if field else payload

    if ref.startswith("asset://"):
        asset_path = ref.removeprefix("asset://")
        asset_id, _, field = asset_path.partition("/")
        installation = await db.scalar(
            select(Installation).where(Installation.id == UUID(asset_id), Installation.entity_id == entity_id)
        )
        if installation is None:
            return None
        payload = {
            "id": str(installation.id),
            "code": installation.code,
            "name": installation.name,
            "status": str(getattr(installation, "operational_status", "")),
            "pob_capacity": getattr(installation, "pob_capacity", None),
            "latitude": getattr(installation, "latitude", None),
            "longitude": getattr(installation, "longitude", None),
        }
        return payload.get(field) if field else payload

    if ref.startswith("task://"):
        task_path = ref.removeprefix("task://")
        task_id, _, field = task_path.partition("/")
        task = await db.scalar(select(ProjectTask).where(ProjectTask.id == UUID(task_id)))
        if task is None:
            return None
        payload = {
            "id": str(task.id),
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "progress": task.progress,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "start_date": task.start_date.isoformat() if task.start_date else None,
        }
        return payload.get(field) if field else payload

    if ref.startswith("kpi://"):
        kpi_path = ref.removeprefix("kpi://")
        if kpi_path.startswith("project/"):
            _, project_id, metric = kpi_path.split("/", 2)
            project_uuid = UUID(project_id)
            project_data = await resolve_ref(db=db, entity_id=entity_id, ref=f"project://{project_id}")
            actions = await _resolve_project_actions(db=db, project_id=project_uuid)
            today = datetime.now(UTC)
            open_actions = [task for task in actions if task.get("status") not in {"done", "cancelled"}]
            overdue_actions = [
                task
                for task in open_actions
                if task.get("due_date")
                and _parse_iso_datetime(task["due_date"])
                and _parse_iso_datetime(task["due_date"]) < today
            ]
            completed_actions = [task for task in actions if task.get("status") in {"done", "cancelled"}]
            if not isinstance(project_data, dict):
                project_data = {}
            metric_map = {
                "progress": project_data.get("progress"),
                "status": project_data.get("status"),
                "total_actions": len(actions),
                "open_actions": len(open_actions),
                "completed_actions": len(completed_actions),
                "overdue_actions": len(overdue_actions),
                "completion_ratio": (len(completed_actions) / len(actions)) if actions else 0,
            }
            return metric_map.get(metric)

    if ref.startswith("form://"):
        form_path = ref.removeprefix("form://")
        form_id, _, field = form_path.partition("/")
        form = await db.scalar(
            select(PapyrusForm).where(PapyrusForm.id == UUID(form_id), PapyrusForm.entity_id == entity_id)
        )
        if form is None:
            return None
        submissions_result = await db.execute(
            select(PapyrusExternalSubmission).where(PapyrusExternalSubmission.form_id == form.id)
        )
        submissions = list(submissions_result.scalars().all())
        payload = {
            "id": str(form.id),
            "name": form.name,
            "description": form.description,
            "is_active": form.is_active,
            "fields": (form.schema_json or {}).get("fields", []),
            "submission_count": len(submissions),
            "accepted_count": len([s for s in submissions if s.status == "accepted"]),
            "pending_count": len([s for s in submissions if s.status == "pending"]),
        }
        return payload.get(field) if field else payload

    if ref.startswith("file://"):
        file_path = ref.removeprefix("file://")
        filename = file_path.replace("\\", "/").rstrip("/").split("/")[-1]
        payload = {
            "uri": ref,
            "path": file_path,
            "filename": filename,
            "extension": filename.rsplit(".", 1)[-1].lower() if "." in filename else None,
        }
        return payload.get("path") if file_path and "/" not in file_path and not filename else payload

    if ref.startswith("formula://"):
        expression = ref.removeprefix("formula://").strip()
        if not expression:
            return None
        return await evaluate_formula(db=db, entity_id=entity_id, expression=expression)

    return None


async def get_renderable_papyrus_for_document(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document_id: UUID,
    title: str | None,
    workflow_id: UUID | None,
    current_state: str | None,
    created_at: datetime | None,
    updated_at: datetime | None,
    content: dict[str, Any] | list[Any] | None,
) -> dict[str, Any]:
    canonical = ensure_papyrus_document(
        content,
        document_id=document_id,
        title=title,
        workflow_id=workflow_id,
        current_state=current_state,
        created_at=created_at,
        updated_at=updated_at,
    )
    return await render_papyrus_document(db=db, entity_id=entity_id, document=canonical)


async def _resolve_project_actions(*, db: AsyncSession, project_id: UUID) -> list[dict[str, Any]]:
    result = await db.execute(
        select(ProjectTask)
        .where(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.start_date.asc().nulls_last(), ProjectTask.created_at.asc())
    )
    tasks = list(result.scalars().all())
    return [
        {
            "id": str(task.id),
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "progress": task.progress,
            "start_date": task.start_date.isoformat() if task.start_date else None,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "parent_id": str(task.parent_id) if task.parent_id else None,
        }
        for task in tasks
    ]


async def _resolve_project_gantt(*, db: AsyncSession, project_id: UUID) -> dict[str, Any]:
    tasks_result = await db.execute(
        select(ProjectTask)
        .where(ProjectTask.project_id == project_id)
        .order_by(ProjectTask.start_date.asc().nulls_last(), ProjectTask.created_at.asc())
    )
    tasks = list(tasks_result.scalars().all())

    dependencies_result = await db.execute(
        select(ProjectTaskDependency)
        .join(ProjectTask, ProjectTask.id == ProjectTaskDependency.from_task_id)
        .where(ProjectTask.project_id == project_id)
    )
    dependencies = list(dependencies_result.scalars().all())

    return {
        "project_id": str(project_id),
        "tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "progress": task.progress,
                "start_date": task.start_date.isoformat() if task.start_date else None,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "parent_id": str(task.parent_id) if task.parent_id else None,
                "wbs_node_id": str(task.wbs_node_id) if task.wbs_node_id else None,
            }
            for task in tasks
        ],
        "dependencies": [
            {
                "id": str(dep.id),
                "from_task_id": str(dep.from_task_id),
                "to_task_id": str(dep.to_task_id),
                "dependency_type": dep.dependency_type,
                "lag_days": dep.lag_days,
            }
            for dep in dependencies
        ],
    }


def _render_html_template(template_source: str, context: dict[str, Any]) -> str:
    try:
        return _template_env.from_string(template_source).render(**context)
    except Exception as exc:
        return f"<div class='papyrus-template-error'>Template render error: {exc}</div>"


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None
