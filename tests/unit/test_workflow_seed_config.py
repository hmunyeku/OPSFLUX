from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.core import workflow as workflow_routes
from app.api.routes.core.workflow import _validate_definition_structure
from app.api.routes.modules.paxlog import ADS_WORKFLOW_SLUG
from app.api.routes.modules.planner import PLANNER_WORKFLOW_SLUG
from app.api.routes.modules.travelwiz import VOYAGE_WORKFLOW_SLUG
from app.core.event_contracts import WORKFLOW_TRANSITION_EVENT, workflow_status_changed_event_names
from app.services.core.fsm_service import fsm_service
from app.services.core.seed_service import _default_workflow_definitions


def test_default_workflow_seed_slugs_match_module_constants():
    definitions = {definition["slug"]: definition for definition in _default_workflow_definitions()}

    assert ADS_WORKFLOW_SLUG in definitions
    assert PLANNER_WORKFLOW_SLUG in definitions
    assert VOYAGE_WORKFLOW_SLUG in definitions


def test_ads_workflow_seed_covers_runtime_statuses():
    definitions = {definition["slug"]: definition for definition in _default_workflow_definitions()}
    ads_workflow = definitions[ADS_WORKFLOW_SLUG]

    expected_states = {
        "draft",
        "submitted",
        "pending_initiator_review",
        "pending_project_review",
        "pending_compliance",
        "pending_validation",
        "pending_arbitration",
        "approved",
        "rejected",
        "cancelled",
        "requires_review",
        "in_progress",
        "completed",
    }

    assert expected_states.issubset(set(ads_workflow["states"]))


def test_ads_workflow_seed_uses_declarative_conditions_for_entry_steps():
    definitions = {definition["slug"]: definition for definition in _default_workflow_definitions()}
    ads_workflow = definitions[ADS_WORKFLOW_SLUG]
    transitions = ads_workflow["transitions"]

    submitted_to_initiator = next(
        transition
        for transition in transitions
        if transition["from"] == "submitted" and transition["to"] == "pending_initiator_review"
    )
    submitted_to_project = next(
        transition
        for transition in transitions
        if transition["from"] == "submitted" and transition["to"] == "pending_project_review"
    )

    assert submitted_to_initiator["condition"] == {
        "field": "created_by",
        "op": "ne",
        "value_from": "requester_id",
    }
    assert submitted_to_project["condition"]["all"][1] == {
        "field": "project_reviewer_id",
        "op": "truthy",
    }


def test_fsm_resolves_ads_next_transition_from_definition_context():
    definitions = {definition["slug"]: definition for definition in _default_workflow_definitions()}
    ads_workflow = definitions[ADS_WORKFLOW_SLUG]

    transition = fsm_service.resolve_next_transition(
        transitions=ads_workflow["transitions"],
        from_state="submitted",
        context={
            "created_by": "creator-1",
            "requester_id": "requester-1",
            "project_reviewer_id": "manager-1",
        },
    )
    assert transition is not None
    assert transition.to_state == "pending_initiator_review"

    transition = fsm_service.resolve_next_transition(
        transitions=ads_workflow["transitions"],
        from_state="submitted",
        context={
            "created_by": "requester-1",
            "requester_id": "requester-1",
            "project_reviewer_id": "manager-1",
        },
    )
    assert transition is not None
    assert transition.to_state == "pending_project_review"

    transition = fsm_service.resolve_next_transition(
        transitions=ads_workflow["transitions"],
        from_state="submitted",
        context={
            "created_by": "requester-1",
            "requester_id": "requester-1",
            "project_reviewer_id": None,
        },
    )
    assert transition is not None
    assert transition.to_state == "pending_compliance"


def test_workflow_definition_validation_accepts_declarative_runtime_metadata():
    _validate_definition_structure(
        {"draft": {}, "pending_review": {}, "approved": {}},
        [
            {
                "from": "draft",
                "to": "pending_review",
                "condition": {"field": "requester_id", "op": "truthy"},
                "assignee": {"resolver": "role", "role_code": "HSE"},
                "sla_hours": 24,
            },
            {"from": "pending_review", "to": "approved"},
        ],
    )


def test_workflow_definition_validation_rejects_invalid_runtime_metadata():
    with pytest.raises(HTTPException) as exc:
        _validate_definition_structure(
            {"draft": {}, "approved": {}},
            [
                {
                    "from": "draft",
                    "to": "approved",
                    "condition": {"field": "requester_id", "op": "eq"},
                    "assignee": {"resolver": "field"},
                    "sla_hours": 0,
                }
            ],
        )

    detail = exc.value.detail
    assert detail["message"] == "Le workflow n'est pas valide pour la publication"
    assert any("assignee.field" in error for error in detail["errors"])
    assert any("sla_hours" in error for error in detail["errors"])


@pytest.mark.asyncio
async def test_emit_transition_event_also_publishes_generic_workflow_transition(monkeypatch):
    published = []

    async def fake_publish(event):
        published.append(event)

    monkeypatch.setattr("app.services.core.fsm_service.event_bus.publish", fake_publish)

    await fsm_service.emit_transition_event(
        entity_type="ads",
        entity_id=str(uuid4()),
        from_state="draft",
        to_state="pending_compliance",
        actor_id=uuid4(),
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"reference": "ADS-001"},
    )

    event_types = [event.event_type for event in published]
    assert "ads.pending_compliance" in event_types
    assert WORKFLOW_TRANSITION_EVENT in event_types
    for event_name in workflow_status_changed_event_names("ads"):
        assert event_name in event_types


@pytest.mark.asyncio
async def test_execute_transition_uses_fsm_service_runtime_flow(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    instance_id = uuid4()
    definition_id = uuid4()

    instance = SimpleNamespace(
        id=instance_id,
        entity_id=entity_id,
        workflow_definition_id=definition_id,
        entity_type="ads",
        entity_id_ref=str(uuid4()),
        current_state="draft",
        version=1,
        metadata_={"requester_id": "req-1"},
    )
    definition = SimpleNamespace(
        id=definition_id,
        slug=ADS_WORKFLOW_SLUG,
        states=[
            {"id": "draft", "type": "start"},
            {"id": "pending_review", "type": "human_validation"},
        ],
    )

    class _ScalarResult:
        def __init__(self, value):
            self.value = value

        def scalar_one_or_none(self):
            return self.value

    class _FakeDB:
        def __init__(self):
            self._results = [_ScalarResult(instance), _ScalarResult(definition)]
            self.commits = 0
            self.refreshed = None

        async def execute(self, _stmt):
            return self._results.pop(0)

        async def commit(self):
            self.commits += 1

        async def refresh(self, value):
            self.refreshed = value

    fake_db = _FakeDB()
    transition_calls = []
    emitted_events = []

    async def fake_transition(db, **kwargs):
        transition_calls.append(kwargs)
        instance.current_state = kwargs["to_state"]
        instance.version = 2
        instance.metadata_ = {
            "requester_id": "req-1",
            "assigned_role_code": "HSE",
            "current_state_sla_hours": 24,
        }
        return instance

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    monkeypatch.setattr(workflow_routes.fsm_service, "transition", fake_transition)
    monkeypatch.setattr(workflow_routes.fsm_service, "emit_transition_event", fake_emit_transition_event)

    response = await workflow_routes.execute_transition(
        instance_id=instance_id,
        body=workflow_routes.TransitionRequest(to_state="pending_review", comment="go"),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=fake_db,
    )

    assert response is instance
    assert transition_calls and transition_calls[0]["workflow_slug"] == ADS_WORKFLOW_SLUG
    assert transition_calls[0]["entity_type"] == "ads"
    assert transition_calls[0]["entity_id"] == instance.entity_id_ref
    assert transition_calls[0]["to_state"] == "pending_review"
    assert transition_calls[0]["comment"] == "go"
    assert transition_calls[0]["entity_id_scope"] == entity_id
    assert fake_db.commits == 1
    assert fake_db.refreshed is instance
    assert emitted_events and emitted_events[0]["extra_payload"]["metadata"]["assigned_role_code"] == "HSE"
    assert emitted_events[0]["extra_payload"]["instance_id"] == str(instance_id)
    assert emitted_events[0]["extra_payload"]["to_node_type"] == "human_validation"
