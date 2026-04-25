"""Projets module manifest — project management, tasks, milestones, members,
planning revisions, deliverables, actions, changelog."""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="projets",
    name="Projets",
    version="1.3.0",
    permissions=[
        # ── Project CRUD ──
        "project.read",
        "project.create",
        "project.update",
        "project.delete",
        "project.status_change",      # transition de statut (matrice par rôle)
        "project.export_sap",
        "project.import",
        "project.export",
        # ── Members / Équipe ──
        "project.member.manage",
        # ── Tasks ──
        "project.task.create",
        "project.task.update",
        "project.task.delete",
        "project.task.reorder",
        "project.task.assign",        # assigner un membre à une tâche
        # ── Milestones ──
        "project.milestone.create",
        "project.milestone.update",
        "project.milestone.delete",
        # ── Planning revisions ──
        "project.revision.create",
        "project.revision.update",
        "project.revision.apply",     # activer une révision (CHEF_PROJET only)
        "project.revision.delete",
        # ── Task deliverables ──
        "project.deliverable.create",
        "project.deliverable.update",
        "project.deliverable.delete",
        # ── Task actions / checklists ──
        "project.action.create",
        "project.action.update",
        "project.action.delete",
        # ── Comments ──
        "project.comment.create",
        "project.comment.delete",     # soft-delete (own comments or manager)
        # ── WBS ──
        "project.wbs.manage",
        # ── Planner link ──
        "project.planner.send",       # envoyer des tâches au Planner
    ],
    roles=[
        {
            "code": "CHEF_PROJET",
            "name": "Chef de projet",
            "description": "Accès complet au projet : CRUD, transitions de statut, révisions, WBS, Planner",
            "permissions": [
                "project.read", "project.create", "project.update", "project.delete",
                "project.status_change", "project.export_sap",
                "project.import", "project.export",
                "project.member.manage",
                "project.task.create", "project.task.update", "project.task.delete", "project.task.reorder", "project.task.assign",
                "project.milestone.create", "project.milestone.update", "project.milestone.delete",
                "project.revision.create", "project.revision.update", "project.revision.apply", "project.revision.delete",
                "project.deliverable.create", "project.deliverable.update", "project.deliverable.delete",
                "project.action.create", "project.action.update", "project.action.delete",
                "project.comment.create", "project.comment.delete",
                "project.wbs.manage",
                "project.planner.send",
            ],
        },
        {
            "code": "MEMBRE_PROJET",
            "name": "Membre de projet",
            "description": "Gestion des tâches, livrables et actions dans les projets assignés",
            "permissions": [
                "project.read",
                "project.task.create", "project.task.update",
                "project.deliverable.create", "project.deliverable.update",
                "project.action.create", "project.action.update",
                "project.comment.create",
            ],
        },
        {
            "code": "REVISEUR_PROJET",
            "name": "Réviseur de projet",
            "description": "Lecture complète + validation des livrables et révisions",
            "permissions": [
                "project.read",
                "project.status_change",
                "project.deliverable.update",   # accepter/rejeter livrables
                "project.revision.apply",       # activer une révision
                "project.comment.create",
            ],
        },
        {
            "code": "OBSERVATEUR_PROJET",
            "name": "Observateur",
            "description": "Lecture seule sur le projet et ses tâches",
            "permissions": [
                "project.read",
                "project.comment.create",       # peut commenter mais rien modifier
            ],
        },
    ],
    routes_prefix="/api/v1/projects",
)
