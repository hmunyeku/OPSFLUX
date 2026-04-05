from app.api.routes.modules.paxlog import ADS_WORKFLOW_SLUG
from app.api.routes.modules.planner import PLANNER_WORKFLOW_SLUG
from app.api.routes.modules.travelwiz import VOYAGE_WORKFLOW_SLUG
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
