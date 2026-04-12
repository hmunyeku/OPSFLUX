"""Critical Path Method (CPM) service for project scheduling.

Given the tasks of a project and their dependencies, computes:
- Forward pass: early start (ES) and early finish (EF) for each task
- Backward pass: late start (LS) and late finish (LF)
- Total float (slack) = LS - ES
- Critical path: the chain of tasks with slack = 0

Task duration is derived from estimated_hours (1 day = 8h) as a fallback,
or from the calendar span between start_date and due_date when both are
set. Lag_days on dependencies is applied as an offset on the successor.

Only finish_to_start (FS) dependencies are fully modeled; other types
degrade gracefully (treated like FS). This is the documented "v1 CPM"
per the functional spec.
"""

from __future__ import annotations

from collections import defaultdict, deque
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import ProjectTask, ProjectTaskDependency


def _duration_days(task: ProjectTask) -> int:
    """Best-effort duration estimate in calendar days."""
    # Prefer start/due span if both set and positive
    if task.start_date and task.due_date:
        delta = (task.due_date - task.start_date).days
        if delta > 0:
            return delta
    # Fallback: 8h per day
    if task.estimated_hours and task.estimated_hours > 0:
        return max(1, int((task.estimated_hours + 7) // 8))
    return 1  # minimum duration so the task has presence in the CPM graph


async def compute_cpm(db: AsyncSession, project_id: UUID) -> dict:
    """Run CPM analysis for a project. Returns a dict matching CPMResult schema."""
    # Fetch active tasks for the project
    tasks_rows = await db.execute(
        select(ProjectTask).where(
            ProjectTask.project_id == project_id,
            ProjectTask.active == True,  # noqa: E712
        )
    )
    tasks = list(tasks_rows.scalars().all())
    if not tasks:
        return {
            "project_duration_days": 0,
            "critical_path_task_ids": [],
            "tasks": [],
            "has_cycles": False,
            "warnings": ["Aucune tâche active"],
        }

    task_by_id: dict[UUID, ProjectTask] = {t.id: t for t in tasks}
    durations: dict[UUID, int] = {t.id: _duration_days(t) for t in tasks}

    # Fetch dependencies (only active ones between tasks of this project)
    task_ids = list(task_by_id.keys())
    deps_rows = await db.execute(
        select(ProjectTaskDependency).where(
            ProjectTaskDependency.from_task_id.in_(task_ids),
            ProjectTaskDependency.to_task_id.in_(task_ids),
            ProjectTaskDependency.active == True,  # noqa: E712
        )
    )
    dependencies = list(deps_rows.scalars().all())

    # Build adjacency: predecessors[to] = [(from, lag_days), ...]
    predecessors: dict[UUID, list[tuple[UUID, int]]] = defaultdict(list)
    successors: dict[UUID, list[tuple[UUID, int]]] = defaultdict(list)
    for d in dependencies:
        predecessors[d.to_task_id].append((d.from_task_id, d.lag_days or 0))
        successors[d.from_task_id].append((d.to_task_id, d.lag_days or 0))

    # Topological sort (Kahn's algorithm)
    in_degree: dict[UUID, int] = {tid: len(predecessors[tid]) for tid in task_ids}
    queue: deque[UUID] = deque([tid for tid, d in in_degree.items() if d == 0])
    topo: list[UUID] = []
    while queue:
        current = queue.popleft()
        topo.append(current)
        for succ, _lag in successors.get(current, []):
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)

    has_cycles = len(topo) < len(task_ids)
    warnings: list[str] = []
    if has_cycles:
        warnings.append("Cycle détecté dans les dépendances — CPM partiel")
        # Append remaining tasks arbitrarily so they still appear in output
        remaining = [t for t in task_ids if t not in topo]
        topo.extend(remaining)

    # Forward pass: ES/EF
    early_start: dict[UUID, int] = {}
    early_finish: dict[UUID, int] = {}
    for tid in topo:
        max_pred_ef_plus_lag = 0
        for p, lag in predecessors.get(tid, []):
            if p in early_finish:
                candidate = early_finish[p] + lag
                if candidate > max_pred_ef_plus_lag:
                    max_pred_ef_plus_lag = candidate
        es = max_pred_ef_plus_lag
        ef = es + durations[tid]
        early_start[tid] = es
        early_finish[tid] = ef

    project_duration = max(early_finish.values()) if early_finish else 0

    # Backward pass: LS/LF
    late_finish: dict[UUID, int] = {}
    late_start: dict[UUID, int] = {}
    # Initialize sinks (no successors) to project_duration
    for tid in reversed(topo):
        if not successors.get(tid):
            late_finish[tid] = project_duration
        else:
            min_succ_ls_minus_lag = float("inf")
            for s, lag in successors.get(tid, []):
                if s in late_start:
                    candidate = late_start[s] - lag
                    if candidate < min_succ_ls_minus_lag:
                        min_succ_ls_minus_lag = candidate
            late_finish[tid] = int(min_succ_ls_minus_lag) if min_succ_ls_minus_lag != float("inf") else project_duration
        late_start[tid] = late_finish[tid] - durations[tid]

    # Build result
    task_infos = []
    critical_ids: list[UUID] = []
    for tid in task_ids:
        t = task_by_id[tid]
        slack = late_start[tid] - early_start[tid]
        is_critical = slack == 0 and not has_cycles
        if is_critical:
            critical_ids.append(tid)
        task_infos.append(
            {
                "id": tid,
                "title": t.title,
                "early_start": early_start[tid],
                "early_finish": early_finish[tid],
                "late_start": late_start[tid],
                "late_finish": late_finish[tid],
                "slack": slack,
                "is_critical": is_critical,
                "duration_days": durations[tid],
            }
        )

    return {
        "project_duration_days": project_duration,
        "critical_path_task_ids": critical_ids,
        "tasks": task_infos,
        "has_cycles": has_cycles,
        "warnings": warnings,
    }
