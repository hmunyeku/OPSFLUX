"""Workflow Engine Pydantic schemas — request/response models.

Supports two data formats for definitions:
  1. Visual editor format: nodes[] + edges[]  (frontend React Flow editor)
  2. FSM format: states{} + transitions[]     (programmatic / FSM service)

Both formats are stored in the same JSONB columns (states, transitions).
Read responses include computed `nodes` and `edges` for the visual editor.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

STRUCTURE_LOCKED_WORKFLOW_SLUGS = frozenset(
    {
        "project",
        "ads-workflow",
        "planner-activity",
        "voyage-workflow",
        "packlog-cargo-workflow",
        "avm-workflow",
    }
)


def _humanize_state_name(value: str) -> str:
    return value.replace("_", " ").replace("-", " ").strip().title()


def _infer_system_node_type(state: str, *, initial: bool, terminal: bool) -> str:
    normalized = state.lower()
    if initial:
        return "start"
    if terminal:
        if "reject" in normalized:
            return "end_rejected"
        if "cancel" in normalized or "archive" in normalized:
            return "end_cancelled"
        return "end_approved"
    if any(token in normalized for token in ("check", "compliance", "system")):
        return "system_check"
    if any(token in normalized for token in ("notify", "notification", "message")):
        return "notification"
    if any(token in normalized for token in ("timer", "wait", "delay", "timeout")):
        return "timer"
    return "human_validation"


def _extract_state_names(states: Any) -> list[str]:
    if isinstance(states, list):
        extracted: list[str] = []
        for item in states:
            if isinstance(item, str):
                extracted.append(item)
            elif isinstance(item, dict):
                extracted.append(str(item.get("id") or item.get("name") or ""))
        return [item for item in extracted if item]
    if isinstance(states, dict):
        return [str(key) for key in states.keys()]
    return []


def _fsm_nodes(states: Any, transitions: Any) -> list[dict[str, Any]]:
    state_names = _extract_state_names(states)
    if not state_names:
        return []

    outgoing: dict[str, int] = {name: 0 for name in state_names}
    incoming: dict[str, int] = {name: 0 for name in state_names}
    if isinstance(transitions, list):
        for transition in transitions:
            if not isinstance(transition, dict):
                continue
            source = transition.get("from") or transition.get("source")
            target = transition.get("to") or transition.get("target")
            if isinstance(source, str) and source in outgoing:
                outgoing[source] += 1
            if isinstance(target, str) and target in incoming:
                incoming[target] += 1

    rows = max(1, min(4, len(state_names)))
    nodes: list[dict[str, Any]] = []
    for index, state in enumerate(state_names):
        initial = index == 0
        terminal = outgoing.get(state, 0) == 0 and not initial
        nodes.append(
            {
                "id": state,
                "type": _infer_system_node_type(state, initial=initial, terminal=terminal),
                "label": _humanize_state_name(state),
                "config": {
                    "fsm_state": state,
                    "system_managed": True,
                    "incoming_count": incoming.get(state, 0),
                    "outgoing_count": outgoing.get(state, 0),
                },
                "position": {
                    "x": 220 * (index // rows),
                    "y": 120 * (index % rows),
                },
            }
        )
    return nodes


def _fsm_edges(transitions: Any) -> list[dict[str, Any]]:
    if not isinstance(transitions, list):
        return []
    edges: list[dict[str, Any]] = []
    for index, transition in enumerate(transitions):
        if not isinstance(transition, dict):
            continue
        source = transition.get("source") or transition.get("from")
        target = transition.get("target") or transition.get("to")
        if not isinstance(source, str) or not isinstance(target, str):
            continue
        required_roles = transition.get("required_roles")
        required_role = None
        if isinstance(required_roles, list) and required_roles:
            required_role = required_roles[0]
        edges.append(
            {
                "id": str(transition.get("id") or f"edge-{index + 1}-{source}-{target}"),
                "source": source,
                "target": target,
                "label": transition.get("label") or _humanize_state_name(target),
                "condition": transition.get("condition"),
                "condition_expression": transition.get("condition_expression"),
                "required_role": transition.get("required_role") or required_role,
                "required_roles": required_roles if isinstance(required_roles, list) else None,
                "required_permission": transition.get("required_permission"),
                "comment_required": bool(transition.get("comment_required"))
                if "comment_required" in transition
                else None,
                "assignee": transition.get("assignee") if isinstance(transition.get("assignee"), dict) else None,
                "sla_hours": transition.get("sla_hours"),
                "trigger": transition.get("trigger") or "human",
            }
        )
    return edges


# ─── Base ────────────────────────────────────────────────────────────────────


class OpsFluxSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Workflow Definition schemas ─────────────────────────────────────────────


class WorkflowDefinitionCreate(BaseModel):
    """Create a workflow definition.

    Frontend visual editor sends `nodes`/`edges`.
    FSM service sends `states`/`transitions`.
    At least one pair must be provided. `slug` is auto-generated from name if absent.
    """

    name: str = Field(..., min_length=1, max_length=200)
    slug: str | None = Field(None, max_length=100)
    description: str | None = None
    entity_type: str = Field("workflow", max_length=100)
    # Visual editor format (preferred for frontend)
    nodes: list[dict[str, Any]] | None = Field(
        None, description="Visual editor node definitions [{id, type, label, config, position}]"
    )
    edges: list[dict[str, Any]] | None = Field(
        None, description="Visual editor edge definitions [{id, source, target, label}]"
    )
    # FSM format (backward compat, programmatic use)
    states: dict[str, Any] | None = None
    transitions: list[dict[str, Any]] | None = None

    @model_validator(mode="after")
    def require_graph_or_fsm(self) -> "WorkflowDefinitionCreate":
        has_graph = self.nodes is not None
        has_fsm = self.states is not None
        if not has_graph and not has_fsm:
            raise ValueError("Either nodes/edges or states/transitions must be provided")
        return self


class WorkflowDefinitionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    entity_type: str | None = Field(None, min_length=1, max_length=100)
    # Visual editor format
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    # FSM format
    states: dict[str, Any] | None = None
    transitions: list[dict[str, Any]] | None = None


class WorkflowDefinitionRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    slug: str
    name: str
    description: str | None
    entity_type: str
    version: int
    status: str
    states: Any  # JSONB — can be dict (FSM) or list (nodes)
    transitions: Any  # JSONB — can be list[dict] (edges or FSM transitions)
    active: bool
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def nodes(self) -> list[dict[str, Any]]:
        """Return visual editor nodes (stored in `states` when using editor format)."""
        if isinstance(self.states, list) and all(isinstance(item, dict) and "id" in item for item in self.states):
            return self.states
        return _fsm_nodes(self.states, self.transitions)

    @computed_field
    @property
    def edges(self) -> list[dict[str, Any]]:
        """Return visual editor edges (stored in `transitions` when using editor format)."""
        if isinstance(self.transitions, list) and all(
            isinstance(item, dict) and "source" in item and "target" in item for item in self.transitions
        ):
            return self.transitions
        return _fsm_edges(self.transitions)

    @computed_field
    @property
    def structure_locked(self) -> bool:
        return self.slug in STRUCTURE_LOCKED_WORKFLOW_SLUGS


class WorkflowDefinitionSummary(OpsFluxSchema):
    """Lightweight read for list views — includes counts but not full node/edge data."""

    id: UUID
    entity_id: UUID
    slug: str
    name: str
    description: str | None
    entity_type: str
    version: int
    status: str
    active: bool
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    # Loaded from ORM but excluded from serialization — used only for counts
    states: Any = Field(default=None, exclude=True)
    transitions: Any = Field(default=None, exclude=True)

    @computed_field
    @property
    def node_count(self) -> int:
        """Number of nodes/states in the definition."""
        if isinstance(self.states, list):
            return len(self.states)
        if isinstance(self.states, dict):
            return len(self.states)
        return 0

    @computed_field
    @property
    def edge_count(self) -> int:
        """Number of edges/transitions in the definition."""
        if isinstance(self.transitions, list):
            return len(self.transitions)
        return 0

    @computed_field
    @property
    def structure_locked(self) -> bool:
        return self.slug in STRUCTURE_LOCKED_WORKFLOW_SLUGS


# ─── Workflow Instance schemas ───────────────────────────────────────────────


class WorkflowInstanceCreate(BaseModel):
    workflow_definition_id: UUID
    entity_type: str = Field(..., min_length=1, max_length=100)
    entity_id_ref: str = Field(
        ...,
        min_length=1,
        max_length=36,
        description="UUID of the linked object (e.g. a purchase order, work order, etc.)",
    )
    metadata: dict[str, Any] | None = None


class WorkflowInstanceRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    workflow_definition_id: UUID
    entity_type: str
    entity_id_ref: str
    current_state: str
    metadata: dict[str, Any] | None = Field(None, alias="metadata_")
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class WorkflowInstanceDetail(WorkflowInstanceRead):
    """Instance detail including definition info."""

    definition_name: str | None = None
    definition_slug: str | None = None
    allowed_transitions: list[str] = []


# ─── Workflow Transition schemas ─────────────────────────────────────────────


class TransitionRequest(BaseModel):
    to_state: str = Field(..., min_length=1, max_length=50)
    comment: str | None = None


class WorkflowTransitionRead(OpsFluxSchema):
    id: UUID
    instance_id: UUID
    from_state: str
    to_state: str
    actor_id: UUID
    comment: str | None
    created_at: datetime


# ─── Statistics ──────────────────────────────────────────────────────────────


class WorkflowStateBucket(BaseModel):
    state: str
    count: int


class WorkflowDefinitionStats(BaseModel):
    definition_id: UUID
    definition_name: str
    definition_slug: str
    by_state: list[WorkflowStateBucket]
    total: int
