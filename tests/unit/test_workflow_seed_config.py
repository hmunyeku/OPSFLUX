import pytest
from fastapi import HTTPException
from uuid import uuid4

from app.api.routes.core.workflow import _validate_definition_structure
from app.api.routes.modules.paxlog import ADS_WORKFLOW_SLUG
from app.api.routes.modules.planner import PLANNER_WORKFLOW_SLUG
from app.api.routes.modules.travelwiz import VOYAGE_WORKFLOW_SLUG
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
        transition for transition in transitions
        if transition["from"] == "submitted" and transition["to"] == "pending_initiator_review"
    )
    submitted_to_project = next(
        transition for transition in transitions
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
    assert "workflow.transition" in event_types
    assert "ads.status_changed" in event_types
