"""Projets module manifest — project management, tasks, milestones, members,
planning revisions, deliverables, actions, changelog."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="projets",
    name="Projets",
    version="1.2.0",
    permissions=[
        # Project CRUD (per 06_RBAC.md §5.1)
        "project.read",
        "project.create",
        "project.update",
        "project.delete",
        "project.status_change",
        "project.export_sap",
        # Members
        "project.member.manage",
        # Tasks
        "project.task.create",
        "project.task.update",
        "project.task.delete",
        "project.task.reorder",
        # Milestones
        "project.milestone.create",
        "project.milestone.update",
        "project.milestone.delete",
        # Planning revisions
        "project.revision.create",
        "project.revision.update",
        "project.revision.apply",
        "project.revision.delete",
        # Task deliverables
        "project.deliverable.create",
        "project.deliverable.update",
        "project.deliverable.delete",
        # Task actions / checklists
        "project.action.create",
        "project.action.update",
        "project.action.delete",
        "project.import",
        "project.export",
    ],
    roles=[
        {
            "code": "CHEF_PROJET",
            "name": "Chef de projet",
            "description": "Full project management access",
            "permissions": [
                "project.read", "project.create", "project.update", "project.delete",
                "project.status_change", "project.export_sap",
                "project.member.manage",
                "project.task.create", "project.task.update", "project.task.delete", "project.task.reorder",
                "project.milestone.create", "project.milestone.update", "project.milestone.delete",
                "project.revision.create", "project.revision.update", "project.revision.apply", "project.revision.delete",
                "project.deliverable.create", "project.deliverable.update", "project.deliverable.delete",
                "project.action.create", "project.action.update", "project.action.delete",
            ],
        },
        {
            "code": "MEMBRE_PROJET",
            "name": "Membre de projet",
            "description": "Task and deliverable management within assigned projects",
            "permissions": [
                "project.read",
                "project.task.create", "project.task.update",
                "project.deliverable.create", "project.deliverable.update",
                "project.action.create", "project.action.update",
            ],
        },
    ],
    routes_prefix="/api/v1/projects",
)
