"""Conformite module manifest — compliance types, rules, records, job positions, transfers."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="conformite",
    name="Conformité",
    version="1.1.0",
    permissions=[
        "conformite.type.read",
        "conformite.type.create",
        "conformite.type.update",
        "conformite.type.delete",
        "conformite.rule.read",
        "conformite.rule.create",
        "conformite.rule.update",
        "conformite.rule.delete",
        "conformite.record.read",
        "conformite.record.create",
        "conformite.record.update",
        "conformite.record.delete",
        "conformite.check",
        "conformite.jobposition.read",
        "conformite.jobposition.create",
        "conformite.jobposition.update",
        "conformite.jobposition.delete",
        "conformite.transfer.read",
        "conformite.transfer.create",
        "conformite.transfer.update",
        "conformite.transfer.delete",
        "conformite.verify",
        "conformite.import",
        "conformite.export",
    ],
    roles=[
        {
            "code": "RESPONSABLE_CONFORMITE",
            "name": "Responsable conformité",
            "description": "Full compliance management — types, rules, records, job positions",
            "permissions": [
                "conformite.type.read", "conformite.type.create", "conformite.type.update", "conformite.type.delete",
                "conformite.rule.read", "conformite.rule.create", "conformite.rule.update", "conformite.rule.delete",
                "conformite.record.read", "conformite.record.create", "conformite.record.update", "conformite.record.delete",
                "conformite.check",
                "conformite.jobposition.read", "conformite.jobposition.create", "conformite.jobposition.update", "conformite.jobposition.delete",
                "conformite.transfer.read", "conformite.transfer.create", "conformite.transfer.update", "conformite.transfer.delete",
                "conformite.verify",
            ],
        },
        {
            "code": "OPERATEUR_CONFORMITE",
            "name": "Opérateur conformité",
            "description": "Record management only — create/update compliance records",
            "permissions": [
                "conformite.type.read",
                "conformite.rule.read",
                "conformite.record.read", "conformite.record.create", "conformite.record.update",
                "conformite.check",
            ],
        },
    ],
    routes_prefix="/api/v1/conformite",
)
