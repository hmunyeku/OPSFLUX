"""Messaging module manifest — announcements, login security journal."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="messaging",
    name="Messagerie",
    version="1.0.0",
    permissions=[
        # Announcements
        "messaging.announcement.read",
        "messaging.announcement.create",
        "messaging.announcement.update",
        "messaging.announcement.delete",
        # Login security journal (admin)
        "messaging.login_events.read",
        "messaging.login_events.export",
        # Security rules
        "messaging.security_rules.read",
        "messaging.security_rules.manage",
    ],
    roles=[
        {
            "code": "COM_ADMIN",
            "name": "Administrateur Communication",
            "description": "Gestion des annonces et messages système",
            "permissions": [
                "messaging.announcement.read",
                "messaging.announcement.create",
                "messaging.announcement.update",
                "messaging.announcement.delete",
            ],
        },
        {
            "code": "SECURITY_ADMIN",
            "name": "Administrateur Sécurité",
            "description": "Consultation du journal de sécurité et gestion des règles",
            "permissions": [
                "messaging.login_events.read",
                "messaging.login_events.export",
                "messaging.security_rules.read",
                "messaging.security_rules.manage",
            ],
        },
    ],
    routes_prefix="/api/v1/messaging",
    event_publications=[
        "messaging.announcement.created",
        "messaging.announcement.published",
    ],
)
