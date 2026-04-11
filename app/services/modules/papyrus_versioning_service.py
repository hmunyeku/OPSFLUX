"""Papyrus versioning helpers for canonical document snapshots and diffs."""

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.papyrus import PapyrusVersion, PapyrusWorkflowEvent

try:
    import jsonpatch
except ImportError:  # pragma: no cover - graceful fallback until dependency is installed
    jsonpatch = None


def ensure_papyrus_document(
    content: dict[str, Any] | list[Any] | None,
    *,
    document_id: UUID,
    title: str | None,
    workflow_id: UUID | None = None,
    current_state: str | None = None,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
    form_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize legacy editor content into the Papyrus root contract."""

    if isinstance(content, dict) and "meta" in content and "blocks" in content:
        normalized = deepcopy(content)
    else:
        normalized = {
            "id": str(document_id),
            "version": 1,
            "meta": {
                "id": str(document_id),
                "version": 1,
                "document_type": "free",
                "title": title,
                "description": None,
                "template_id": None,
                "workflow_id": str(workflow_id) if workflow_id else None,
                "current_state": current_state,
                "acl": {},
                "tags": [],
                "created_at": created_at.isoformat() if created_at else None,
                "updated_at": updated_at.isoformat() if updated_at else None,
            },
            "blocks": _coerce_blocks(content),
            "refs": [],
            "data": {
                "form_data": deepcopy(form_data or {}),
            },
            "workflow": {
                "workflow_id": str(workflow_id) if workflow_id else None,
                "current_state": current_state,
            },
            "schedule": {},
            "render": {
                "html": True,
                "pdf": True,
                "pdf_engine": "opsflux_pdf_service",
            },
        }

    normalized.setdefault("id", str(document_id))
    normalized.setdefault("version", 1)
    meta = normalized.setdefault("meta", {})
    meta.setdefault("id", str(document_id))
    meta.setdefault("version", normalized.get("version", 1))
    meta.setdefault("document_type", "free")
    meta["title"] = title if title is not None else meta.get("title")
    meta["workflow_id"] = str(workflow_id) if workflow_id else meta.get("workflow_id")
    meta["current_state"] = current_state if current_state is not None else meta.get("current_state")
    meta["created_at"] = created_at.isoformat() if created_at else meta.get("created_at")
    meta["updated_at"] = updated_at.isoformat() if updated_at else meta.get("updated_at")
    normalized.setdefault("blocks", [])
    normalized.setdefault("refs", [])
    data = normalized.setdefault("data", {})
    data["form_data"] = deepcopy(form_data or data.get("form_data") or {})
    workflow = normalized.setdefault("workflow", {})
    workflow["workflow_id"] = str(workflow_id) if workflow_id else workflow.get("workflow_id")
    workflow["current_state"] = current_state if current_state is not None else workflow.get("current_state")
    normalized.setdefault("schedule", {})
    normalized.setdefault("render", {"html": True, "pdf": True, "pdf_engine": "opsflux_pdf_service"})
    return normalized


async def list_document_versions(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document_id: UUID,
) -> list[PapyrusVersion]:
    result = await db.execute(
        select(PapyrusVersion)
        .where(
            PapyrusVersion.entity_id == entity_id,
            PapyrusVersion.document_id == document_id,
        )
        .order_by(PapyrusVersion.version.desc())
    )
    return list(result.scalars().all())


async def reconstruct_document_version(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document_id: UUID,
    version: int | None = None,
) -> dict[str, Any] | None:
    versions = await list_document_versions(db=db, entity_id=entity_id, document_id=document_id)
    if not versions:
        return None

    ordered = sorted(versions, key=lambda item: item.version)
    if version is not None:
        ordered = [item for item in ordered if item.version <= version]
        if not ordered:
            return None

    snapshot_index = None
    for idx in range(len(ordered) - 1, -1, -1):
        if ordered[idx].patch_type == "snapshot":
            snapshot_index = idx
            break

    if snapshot_index is None:
        return None

    current = deepcopy(ordered[snapshot_index].payload)
    for item in ordered[snapshot_index + 1:]:
        if item.patch_type == "snapshot":
            current = deepcopy(item.payload)
            continue
        if jsonpatch is None:
            current = deepcopy(item.payload)
            continue
        current = jsonpatch.apply_patch(current, item.payload, in_place=False)
    return current


def summarize_document_diff(
    old_doc: dict[str, Any],
    new_doc: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    additions: list[dict[str, Any]] = []
    deletions: list[dict[str, Any]] = []
    modifications: list[dict[str, Any]] = []

    if jsonpatch is not None:
        patch_ops = jsonpatch.make_patch(old_doc, new_doc).patch
        for op in patch_ops:
            path = op.get("path", "")
            value = op.get("value")
            if op.get("op") == "add":
                additions.append({"path": path, "value": value})
            elif op.get("op") == "remove":
                deletions.append({"path": path})
            else:
                modifications.append({"path": path, "value": value, "op": op.get("op")})
        return {
            "additions": additions,
            "deletions": deletions,
            "modifications": modifications,
        }

    old_blocks = old_doc.get("blocks", [])
    new_blocks = new_doc.get("blocks", [])
    max_len = max(len(old_blocks), len(new_blocks))
    for idx in range(max_len):
        old_block = old_blocks[idx] if idx < len(old_blocks) else None
        new_block = new_blocks[idx] if idx < len(new_blocks) else None
        if old_block is None and new_block is not None:
            additions.append({"path": f"/blocks/{idx}", "value": new_block})
        elif old_block is not None and new_block is None:
            deletions.append({"path": f"/blocks/{idx}", "value": old_block})
        elif old_block != new_block:
            modifications.append({"path": f"/blocks/{idx}", "old": old_block, "new": new_block})
    return {
        "additions": additions,
        "deletions": deletions,
        "modifications": modifications,
    }


async def record_document_version(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document_id: UUID,
    revision_id: UUID | None,
    actor_id: UUID | None,
    title: str | None,
    workflow_id: UUID | None,
    current_state: str | None,
    previous_content: dict[str, Any] | list[Any] | None,
    new_content: dict[str, Any] | list[Any] | None,
    created_at: datetime | None,
    updated_at: datetime | None,
    message: str | None = None,
    workflow_tag: str | None = None,
) -> PapyrusVersion | None:
    """Persist a Papyrus snapshot or diff for the current document content."""

    previous_doc = (
        ensure_papyrus_document(
            previous_content,
            document_id=document_id,
            title=title,
            workflow_id=workflow_id,
            current_state=current_state,
            created_at=created_at,
            updated_at=updated_at,
        )
        if previous_content is not None
        else None
    )
    new_doc = ensure_papyrus_document(
        new_content,
        document_id=document_id,
        title=title,
        workflow_id=workflow_id,
        current_state=current_state,
        created_at=created_at,
        updated_at=updated_at or datetime.now(timezone.utc),
    )

    current_max = (
        await db.execute(
            select(func.max(PapyrusVersion.version)).where(PapyrusVersion.document_id == document_id)
        )
    ).scalar_one()
    next_version = int(current_max or 0) + 1

    force_snapshot = previous_doc is None or workflow_tag is not None
    if not force_snapshot and previous_doc == new_doc:
        return None

    patch_type = "snapshot"
    payload: dict[str, Any] | list[Any] = new_doc

    if not force_snapshot and jsonpatch is not None:
        latest_snapshot = (
            await db.execute(
                select(func.max(PapyrusVersion.version)).where(
                    PapyrusVersion.document_id == document_id,
                    PapyrusVersion.patch_type == "snapshot",
                )
            )
        ).scalar_one()
        versions_since_snapshot = int(current_max or 0) - int(latest_snapshot or 0)
        patch = jsonpatch.make_patch(previous_doc, new_doc).patch
        if patch and versions_since_snapshot < 20:
            patch_type = "diff"
            payload = patch

    version_row = PapyrusVersion(
        entity_id=entity_id,
        document_id=document_id,
        revision_id=revision_id,
        version=next_version,
        patch_type=patch_type,
        payload=payload,
        created_by=actor_id,
        message=message,
        workflow_tag=workflow_tag,
    )
    db.add(version_row)
    await db.flush()
    return version_row


async def record_workflow_event(
    *,
    db: AsyncSession,
    entity_id: UUID,
    document_id: UUID,
    from_state: str | None,
    to_state: str,
    actor_id: UUID | None,
    comment: str | None = None,
    version_tag: int | None = None,
) -> PapyrusWorkflowEvent:
    """Persist a Papyrus workflow audit event."""

    event = PapyrusWorkflowEvent(
        entity_id=entity_id,
        document_id=document_id,
        from_state=from_state,
        to_state=to_state,
        actor_id=actor_id,
        comment=comment,
        version_tag=version_tag,
    )
    db.add(event)
    await db.flush()
    return event


def _coerce_blocks(content: dict[str, Any] | list[Any] | None) -> list[dict[str, Any]]:
    if content is None:
        return []
    if isinstance(content, list):
        return deepcopy(content)
    if isinstance(content, dict):
        if isinstance(content.get("blocks"), list):
            return deepcopy(content["blocks"])
        if "type" in content:
            return [deepcopy(content)]
        if not content:
            return []
        return [
            {
                "id": "legacy_payload",
                "type": "legacy_payload",
                "locked": False,
                "payload": deepcopy(content),
            }
        ]
    return [
        {
            "id": "legacy_payload",
            "type": "legacy_payload",
            "locked": False,
            "payload": {"value": content},
        }
    ]
