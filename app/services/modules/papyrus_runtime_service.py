"""Papyrus runtime services — ref resolution, formula evaluation and render prep."""

from __future__ import annotations

import ast
from copy import deepcopy
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import Installation
from app.models.common import Project, ProjectTask
from app.services.modules.papyrus_versioning_service import ensure_papyrus_document


async def render_papyrus_document(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document: dict[str, Any],
) -> dict[str, Any]:
    """Resolve refs and formulas into a render-ready Papyrus payload."""

    rendered = deepcopy(document)
    rendered_refs: dict[str, Any] = {}

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

    children = current.get("children")
    if isinstance(children, list):
        current["children"] = [
            await _render_block(db=db, entity_id=entity_id, block=child, rendered_refs=rendered_refs)
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
    runtime = _FormulaRuntime(db=db, entity_id=entity_id, rendered_refs=rendered_refs)
    tree = ast.parse(expression, mode="eval")
    return await runtime.eval(tree.body)


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
        project = await db.scalar(
            select(Project).where(Project.id == UUID(project_id), Project.entity_id == entity_id)
        )
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
        }
        return payload.get(field) if field else payload

    if ref.startswith("kpi://"):
        # Minimal KPI mapping backed by project fields for now.
        kpi_path = ref.removeprefix("kpi://")
        if kpi_path.startswith("project/"):
            _, project_id, metric = kpi_path.split("/", 2)
            project_data = await resolve_ref(db=db, entity_id=entity_id, ref=f"project://{project_id}")
            if not isinstance(project_data, dict):
                return None
            metric_map = {
                "progress": project_data.get("progress"),
            }
            return metric_map.get(metric)

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


class _FormulaRuntime:
    def __init__(self, *, db: AsyncSession, entity_id: UUID, rendered_refs: dict[str, Any]) -> None:
        self.db = db
        self.entity_id = entity_id
        self.rendered_refs = rendered_refs

    async def eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -(await self.eval(node.operand))
        if isinstance(node, ast.BinOp):
            left = await self.eval(node.left)
            right = await self.eval(node.right)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            raise ValueError("Unsupported binary operator")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            func_name = node.func.id.upper()
            args = [await self.eval(arg) for arg in node.args]
            if func_name == "SUM":
                values = _flatten(args)
                return sum(v for v in values if isinstance(v, (int, float)))
            if func_name == "MIN":
                values = _flatten(args)
                return min(v for v in values if isinstance(v, (int, float)))
            if func_name == "MAX":
                values = _flatten(args)
                return max(v for v in values if isinstance(v, (int, float)))
            if func_name == "ABS":
                return abs(args[0])
            if func_name == "ROUND":
                if len(args) == 1:
                    return round(args[0])
                return round(args[0], int(args[1]))
            if func_name == "REF":
                ref = args[0]
                if not isinstance(ref, str):
                    raise ValueError("REF expects a string URI")
                return await self._resolve_formula_ref(ref)
            raise ValueError(f"Unsupported function {func_name}")
        raise ValueError("Unsupported formula expression")

    async def _resolve_formula_ref(self, ref: str) -> Any:
        if ref not in self.rendered_refs:
            self.rendered_refs[ref] = await resolve_ref(db=self.db, entity_id=self.entity_id, ref=ref)
        return self.rendered_refs[ref]


def _flatten(values: list[Any]) -> list[Any]:
    flattened: list[Any] = []
    for value in values:
        if isinstance(value, list):
            flattened.extend(_flatten(value))
        else:
            flattened.append(value)
    return flattened
