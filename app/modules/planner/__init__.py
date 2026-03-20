"""Planner module manifest — site capacity management, activity scheduling,
conflict detection & arbitration."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="planner",
    name="Planner",
    version="1.0.0",
    permissions=[
        # Activities
        "planner.activity.read",
        "planner.activity.create",
        "planner.activity.update",
        "planner.activity.delete",
        "planner.activity.submit",
        "planner.activity.validate",
        "planner.activity.cancel",
        # Conflicts
        "planner.conflict.read",
        "planner.conflict.resolve",
        # Capacity
        "planner.capacity.read",
        # Permanent ops
        "planner.permanent_ops.manage",
        # Emergency maintenance
        "planner.emergency.approve",
    ],
    roles=[
        {
            "code": "DO",
            "name": "Directeur des Op\u00e9rations",
            "description": "Full planner access including conflict arbitration",
            "permissions": [
                "planner.activity.read", "planner.activity.create", "planner.activity.update",
                "planner.activity.delete", "planner.activity.submit", "planner.activity.validate",
                "planner.activity.cancel",
                "planner.conflict.read", "planner.conflict.resolve",
                "planner.capacity.read", "planner.permanent_ops.manage", "planner.emergency.approve",
            ],
        },
        {
            "code": "DPROD",
            "name": "Directeur de Production",
            "description": "Activity validation and capacity management",
            "permissions": [
                "planner.activity.read", "planner.activity.create", "planner.activity.update",
                "planner.activity.submit", "planner.activity.validate",
                "planner.capacity.read", "planner.permanent_ops.manage",
            ],
        },
        {
            "code": "CDS",
            "name": "Chef de Site",
            "description": "Site-scoped activity validation",
            "permissions": [
                "planner.activity.read", "planner.activity.create", "planner.activity.update",
                "planner.activity.submit", "planner.activity.validate",
                "planner.capacity.read", "planner.permanent_ops.manage",
            ],
        },
        {
            "code": "PLANNEUR",
            "name": "Planificateur",
            "description": "Activity creation and submission",
            "permissions": [
                "planner.activity.read", "planner.activity.create", "planner.activity.update",
                "planner.activity.submit", "planner.capacity.read",
            ],
        },
    ],
    routes_prefix="/api/v1/planner",
)
