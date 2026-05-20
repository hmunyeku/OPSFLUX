from __future__ import annotations

import inspect

from app.models.common import ProjectChange
from app.models.moc import MOC
from app.api.routes.modules import moc as moc_routes
from app.schemas import moc as moc_schemas
from app.services.modules import moc_service


def test_moc_declares_polymorphic_context_columns():
    assert hasattr(MOC, "context_type")
    assert hasattr(MOC, "context_id")
    assert hasattr(MOC, "context_module")
    assert hasattr(MOC, "context_payload")
    assert hasattr(MOC, "workflow_profile")


def test_project_change_declares_moc_compatibility_link():
    assert hasattr(ProjectChange, "moc_id")


def test_moc_context_resolver_denies_unknown_context_types():
    src = inspect.getsource(moc_service.resolve_moc_context_owner)
    assert 'raise HTTPException(404, "Context owner not found")' in src
    assert 'context_type == "project"' in src
    assert 'context_type == "project_task"' in src


def test_contextual_moc_creation_helper_sets_context_fields():
    src = inspect.getsource(moc_service.create_contextual_moc)
    assert "context_type=context_type" in src
    assert "context_id=context_id" in src
    assert "context_module=context_module" in src
    assert "context_payload=context_payload_with_profile" in src
    assert 'workflow_profile="project_change"' in src or '"project_change"' in src
    assert 'initial_status = "draft"' in src


def test_project_change_fsm_is_profile_specific():
    assert hasattr(moc_service, "PROJECT_CHANGE_FSM")
    assert moc_service.PROJECT_CHANGE_FSM["draft"]["submitted"] == "moc.change.transition"
    assert "execution" not in moc_service.PROJECT_CHANGE_FSM
    assert moc_service.allowed_transitions("draft", "project_change") == ["submitted", "rejected"]


def test_moc_context_payload_schema_exists():
    assert hasattr(moc_schemas, "MOCContextCreate")
    fields = moc_schemas.MOCContextCreate.model_fields
    assert "title" in fields
    assert "context_payload" in fields
    assert "initial_validators" in fields
    assert "workflow_profile" in fields


def test_moc_routes_expose_context_endpoints():
    src = inspect.getsource(moc_routes)
    assert '"/context/{context_type}/{context_id}"' in src
    assert "list_contextual_mocs" in src
    assert "create_contextual_moc" in src
