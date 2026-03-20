"""PID/PFD module manifest — process diagrams, equipment registry,
DCS tag management, process line tracing, library builder."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="pid_pfd",
    name="PID/PFD",
    version="2.0.0",
    permissions=[
        # PID Documents
        "pid.read",
        "pid.create",
        "pid.edit",
        "pid.delete",
        # Equipment
        "pid.equipment.read",
        "pid.equipment.edit",
        # DCS Tags
        "pid.tags.read",
        "pid.tags.edit",
        "pid.tags.import",
        # Library
        "pid.library.read",
        "pid.library.edit",
        # Administration
        "pid.admin",
        # AFC validation
        "pid.validate_afc",
        # Export
        "pid.export",
    ],
    roles=[
        {
            "code": "PID_ADMIN",
            "name": "Administrateur PID",
            "description": "Full access: PID documents, equipment, tags, library, AFC validation",
            "permissions": [
                "pid.read", "pid.create", "pid.edit", "pid.delete",
                "pid.equipment.read", "pid.equipment.edit",
                "pid.tags.read", "pid.tags.edit", "pid.tags.import",
                "pid.library.read", "pid.library.edit",
                "pid.admin", "pid.validate_afc", "pid.export",
            ],
        },
        {
            "code": "PID_ENGINEER",
            "name": "Ing\u00e9nieur Process",
            "description": "Create/edit PIDs, manage equipment and tags, validate AFC",
            "permissions": [
                "pid.read", "pid.create", "pid.edit",
                "pid.equipment.read", "pid.equipment.edit",
                "pid.tags.read", "pid.tags.edit",
                "pid.library.read",
                "pid.validate_afc", "pid.export",
            ],
        },
        {
            "code": "PID_DRAFTER",
            "name": "Dessinateur PID",
            "description": "Edit PIDs, manage equipment properties",
            "permissions": [
                "pid.read", "pid.edit",
                "pid.equipment.read", "pid.equipment.edit",
                "pid.tags.read",
                "pid.library.read",
                "pid.export",
            ],
        },
        {
            "code": "INSTRUMENT_TECH",
            "name": "Technicien Instrumentation",
            "description": "Manage DCS tags and instrument data",
            "permissions": [
                "pid.read",
                "pid.equipment.read",
                "pid.tags.read", "pid.tags.edit", "pid.tags.import",
                "pid.library.read",
            ],
        },
        {
            "code": "PID_READER",
            "name": "Lecteur PID",
            "description": "Read-only access to PIDs and equipment data",
            "permissions": [
                "pid.read",
                "pid.equipment.read",
                "pid.tags.read",
                "pid.library.read",
            ],
        },
    ],
    routes_prefix="/api/v1/pid",
)
