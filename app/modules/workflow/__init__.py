"""Workflow Engine module manifest."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="workflow",
    name="Workflow Engine",
    version="1.0.0",
    permissions=[
        "workflow.definition.read",
        "workflow.definition.create",
        "workflow.definition.update",
        "workflow.instance.read",
        "workflow.instance.create",
        "workflow.instance.transition",
        "workflow.delegation.manage",
    ],
    routes_prefix="/api/v1/workflow",
)
