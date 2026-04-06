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
