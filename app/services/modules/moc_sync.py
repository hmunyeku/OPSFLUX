"""MOC ↔ Project synchronisation.

When a MOC is promoted to a Project via `POST /moc/{id}/promote-to-project`,
the two rows stay linked through `mocs.project_id`. This module keeps them
consistent in one direction:

    Project progress / status  →  MOC execution progress / FSM status

The reverse direction (MOC execution_started_at → Project start_date, etc.)
is not automated on purpose — the Project is the operational truth once
the MOC has been validated.

Rules
-----
* `project.progress` (0-100) is mirrored onto the MOC as-is. No explicit
  `execution_progress` column exists today; the value is stored in
  `mocs.metadata_['execution_progress']` for now, so the UI can render it
  without a schema change. A first-class column can be added later.
* When `project.status == 'completed'`:
    - The MOC auto-advances to the next status along the execution axis,
      stopping at `executed_docs_pending`. It does NOT auto-close because
      the CDS must still sign off on the closure (PID/ESD updates).
    - The MOC's `execution_completed_at` is stamped with now().
* When `project.status == 'cancelled'`, the MOC is not auto-cancelled
  (too destructive). A warning is logged so an operator can decide.

Idempotency: every call computes the target state from scratch and only
writes when something changes. Safe to call on every progress roll-up.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import Project
from app.models.moc import MOC, MOCStatusHistory

logger = logging.getLogger(__name__)


async def sync_moc_from_project(db: AsyncSession, project: Project) -> None:
    """Propagate a Project's progress and completion state to its linked MOC.

    Silently noop if the project is not linked to any MOC. All changes are
    flushed but not committed — the caller controls the transaction.
    """
    moc = (
        await db.execute(
            select(MOC).where(
                MOC.project_id == project.id,
                MOC.archived == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if moc is None:
        return

    changed = False

    # 1. Mirror progress — stored in JSONB metadata for now.
    meta = dict(moc.metadata_ or {})
    current_progress = meta.get("execution_progress")
    if current_progress != project.progress:
        meta["execution_progress"] = project.progress
        moc.metadata_ = meta
        changed = True

    # 2. Auto-advance FSM on project completion.
    now = datetime.now(UTC)
    if project.status == "completed":
        if moc.status == "execution":
            # Execution phase done — move to executed_docs_pending so the
            # CDS can verify PID/ESD updates then formally close.
            old = moc.status
            moc.status = "executed_docs_pending"
            moc.status_changed_at = now
            moc.execution_completed_at = moc.execution_completed_at or now
            db.add(MOCStatusHistory(
                moc_id=moc.id,
                old_status=old,
                new_status="executed_docs_pending",
                changed_by=project.manager_id or moc.initiator_id,
                note=(
                    f"Avancement auto : projet lié {project.code} complété "
                    "— passage en mise à jour documentaire."
                ),
            ))
            changed = True

    # 3. Cancellation — log only, no auto-cancel.
    if project.status == "cancelled" and moc.status not in ("cancelled", "closed"):
        logger.warning(
            "Linked project %s was cancelled but MOC %s is still %s — "
            "operator must decide whether to cancel the MOC too.",
            project.code, moc.reference, moc.status,
        )

    if changed:
        await db.flush()
