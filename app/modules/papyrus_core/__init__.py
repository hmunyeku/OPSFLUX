"""Papyrus module manifest — document management, nomenclature,
templates, revisions, workflow, distribution, share links."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="papyrus",
    name="Papyrus",
    version="2.0.0",
    permissions=[
        # Documents
        "document.read",
        "document.create",
        "document.edit",
        "document.delete",
        # Workflow
        "document.submit",
        "document.approve",
        "document.reject",
        "document.publish",
        # Admin
        "document.admin",
        # Templates
        "template.read",
        "template.create",
        "template.edit",
        "template.delete",
        # Share
        "document.share",
    ],
    roles=[
        {
            "code": "DOC_ADMIN",
            "name": "Administrateur Documents",
            "description": "Full access: types, templates, nomenclature, distribution lists",
            "permissions": [
                "document.read", "document.create", "document.edit", "document.delete",
                "document.submit", "document.approve", "document.reject", "document.publish",
                "document.admin", "document.share",
                "template.read", "template.create", "template.edit", "template.delete",
            ],
        },
        {
            "code": "DOC_MANAGER",
            "name": "Gestionnaire Documents",
            "description": "Create, edit, submit, approve and publish documents",
            "permissions": [
                "document.read", "document.create", "document.edit",
                "document.submit", "document.approve", "document.publish",
                "document.share",
                "template.read",
            ],
        },
        {
            "code": "DOC_REVIEWER",
            "name": "R\u00e9viseur Documents",
            "description": "Review and approve documents",
            "permissions": [
                "document.read",
                "document.approve", "document.reject",
                "template.read",
            ],
        },
        {
            "code": "DOC_AUTHOR",
            "name": "Auteur Documents",
            "description": "Create and edit documents, submit for review",
            "permissions": [
                "document.read", "document.create", "document.edit",
                "document.submit",
                "template.read",
            ],
        },
        {
            "code": "DOC_READER",
            "name": "Lecteur Documents",
            "description": "Read-only access to documents",
            "permissions": [
                "document.read",
                "template.read",
            ],
        },
    ],
    routes_prefix="/api/v1/documents",
)
