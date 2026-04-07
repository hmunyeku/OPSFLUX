"""Canonical event contracts for workflow-oriented orchestration.

Use these constants for workflow-adjacent event names that are shared across
modules. The goal is to avoid silent drift between emitters, bridges and
subscribers.

Classification:
- native business events:
  emitted directly by route/service code because downstream consumers need
  domain-specific payloads or product semantics.
- workflow backbone events:
  emitted systematically by the FSM service.
- legacy aliases:
  temporary compatibility subscriptions kept while older producers/consumers
  still exist.
"""

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.core.events import EventBus

WORKFLOW_TRANSITION_EVENT = "workflow.transition"

PROJECT_STATUS_CHANGED_EVENT = "project.status.changed"
PROJECT_STATUS_CHANGED_LEGACY_EVENT = "project.status_changed"
PROJECT_STATUS_CHANGED_SUBSCRIPTIONS = (
    PROJECT_STATUS_CHANGED_EVENT,
    PROJECT_STATUS_CHANGED_LEGACY_EVENT,
)

STATUS_CHANGED_EVENT_TEMPLATE = "{entity_type}.status_changed"
STATUS_DOTTED_CHANGED_EVENT_TEMPLATE = "{entity_type}.status.changed"

TRAVELWIZ_CARGO_WORKFLOW_CHANGED_EVENT = "travelwiz.cargo.workflow.changed"
TRAVELWIZ_CARGO_WORKFLOW_STATE_EVENT_TEMPLATE = "travelwiz.cargo.workflow.{to_state}"

PAXLOG_AVM_STATUS_CHANGED_EVENT = "paxlog.avm.status.changed"
PAXLOG_AVM_STATE_EVENT_TEMPLATE = "paxlog.avm.{to_state}"

# Narrow, intentional bridges from workflow backbone events to stable module
# aliases. Keep domain-rich events such as `ads.approved` or
# `paxlog.mission_notice.modified` as native emitters in route/service code.
WORKFLOW_SEMANTIC_BRIDGES: dict[tuple[str, str], dict[str, object]] = {
    (
        "travelwiz-cargo-workflow",
        "cargo_item_workflow",
    ): {
        "state_filter": None,
        "aliases": [
            TRAVELWIZ_CARGO_WORKFLOW_STATE_EVENT_TEMPLATE,
            TRAVELWIZ_CARGO_WORKFLOW_CHANGED_EVENT,
        ],
        "payload_map": {
            "cargo_id": "entity_id",
            "from_status": "from_state",
            "to_status": "to_state",
        },
    },
    (
        "avm-workflow",
        "avm",
    ): {
        "state_filter": {"ready", "in_preparation"},
        "aliases": [
            PAXLOG_AVM_STATE_EVENT_TEMPLATE,
            PAXLOG_AVM_STATUS_CHANGED_EVENT,
        ],
        "payload_map": {
            "avm_id": "entity_id",
            "from_status": "from_state",
            "to_status": "to_state",
        },
    },
}


def subscribe_with_aliases(
    bus: "EventBus",
    event_names: tuple[str, ...] | list[str],
    handler: Callable[..., Any],
) -> None:
    """Register a handler on a canonical event and its temporary aliases."""
    for event_name in event_names:
        bus.subscribe(event_name, handler)


def workflow_status_changed_event_names(entity_type: str) -> tuple[str, str]:
    """Return the canonical compatibility aliases emitted for FSM status changes."""
    return (
        STATUS_CHANGED_EVENT_TEMPLATE.format(entity_type=entity_type),
        STATUS_DOTTED_CHANGED_EVENT_TEMPLATE.format(entity_type=entity_type),
    )
