from __future__ import annotations

from app.models.common import ProjectChange
from app.models.moc import MOC


def test_moc_declares_polymorphic_context_columns():
    assert hasattr(MOC, "context_type")
    assert hasattr(MOC, "context_id")
    assert hasattr(MOC, "context_module")
    assert hasattr(MOC, "context_payload")


def test_project_change_declares_moc_compatibility_link():
    assert hasattr(ProjectChange, "moc_id")
