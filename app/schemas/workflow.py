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
        if isinstance(self.states, list):
            return self.states
        return []

    @computed_field
    @property
    def edges(self) -> list[dict[str, Any]]:
        """Return visual editor edges (stored in `transitions` when using editor format)."""
        if isinstance(self.transitions, list):
            return self.transitions
        return []


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


# ─── Workflow Instance schemas ───────────────────────────────────────────────

class WorkflowInstanceCreate(BaseModel):
    workflow_definition_id: UUID
    entity_type: str = Field(..., min_length=1, max_length=100)
    entity_id_ref: str = Field(
        ..., min_length=1, max_length=36,
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
