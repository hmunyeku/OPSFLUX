"""Support module manifest — ticket system for bug reports, feature requests, user guides."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="support",
    name="Support & Feedback",
    version="1.0.0",
    permissions=[
        "support.ticket.read",
        "support.ticket.create",
        "support.ticket.update",
        "support.ticket.manage",
        "support.ticket.delete",
        "support.comment.create",
        "support.comment.internal",
        "support.stats.read",
        "support.guide.read",
        "support.guide.manage",
    ],
    roles=[
        {
            "code": "SUPPORT_ADMIN",
            "name": "Administrateur Support",
            "description": "Gestion complète du support — tickets, assignation, résolution, guides",
            "permissions": [
                "support.ticket.read",
                "support.ticket.create",
                "support.ticket.update",
                "support.ticket.manage",
                "support.ticket.delete",
                "support.comment.create",
                "support.comment.internal",
                "support.stats.read",
                "support.guide.read",
                "support.guide.manage",
            ],
        },
        {
            "code": "SUPPORT_USER",
            "name": "Utilisateur Support",
            "description": "Soumettre et suivre ses propres tickets",
            "permissions": [
                "support.ticket.read",
                "support.ticket.create",
                "support.ticket.update",
                "support.comment.create",
                "support.guide.read",
            ],
        },
    ],
    routes_prefix="/api/v1/support",
    event_publications=[
        "support.ticket.created",
        "support.ticket.status_changed",
        "support.ticket.assigned",
        "support.ticket.resolved",
        "support.ticket.commented",
    ],
)
