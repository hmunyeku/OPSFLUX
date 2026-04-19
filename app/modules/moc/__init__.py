"""MOCTrack module manifest — digitalised Management of Change workflow.

Implements the CDC rev 00 (PERENCO Cameroon) specification: 11-status FSM
for modification requests on industrial installations, parallel multi-role
validation matrix, HAZOP/HAZID/Environmental checks, PID/ESD update
tracking, and real-time notifications to every intervening stakeholder.
"""

from app.core.module_registry import ModuleManifest

MANIFEST = ModuleManifest(
    slug="moc",
    name="MOCTrack",
    version="1.0.0",
    routes_prefix="/api/v1/moc",
    permissions=[
        # CRUD
        "moc.read",
        "moc.create",
        "moc.update",
        "moc.delete",
        "moc.manage",
        # Workflow — one permission per transition actor role
        "moc.transition",
        "moc.validate",
        "moc.initiator.cancel",
        "moc.site_chief.approve",
        "moc.site_chief.submit",
        "moc.site_chief.cancel",
        "moc.site_chief.start_execution",
        "moc.site_chief.complete_execution",
        "moc.director.confirm",
        "moc.director.cancel",
        "moc.director.stand_by",
        "moc.director.resume",
        "moc.director.validate_study",
        "moc.director.return_for_rework",
        "moc.lead_process.start_study",
        "moc.responsible.submit_study",
        "moc.responsible.cancel",
        "moc.responsible.close",
        # Parallel validation — one permission per role on the matrix
        "moc.hse.validate",
        "moc.maintenance.validate",
        "moc.metier.validate",
        "moc.stats.read",
    ],
    roles=[
        {
            "code": "MOC_INITIATOR",
            "name": "Initiateur MOC",
            "description": "Peut créer et suivre ses propres MOCs",
            "permissions": [
                "moc.read", "moc.create", "moc.update",
                "moc.initiator.cancel",
            ],
        },
        {
            "code": "MOC_SITE_CHIEF",
            "name": "Chef de site (OM/CDS) — MOC",
            "description": "Approuve/soumet les MOC initiés sur son site, pilote l'exécution",
            "permissions": [
                "moc.read", "moc.update", "moc.transition",
                "moc.site_chief.approve", "moc.site_chief.submit",
                "moc.site_chief.cancel", "moc.site_chief.start_execution",
                "moc.site_chief.complete_execution",
            ],
        },
        {
            "code": "MOC_DIRECTOR",
            "name": "Directeur Production / Gaz — MOC",
            "description": "Confirme ou annule les MOC, définit la priorité, valide l'étude",
            "permissions": [
                "moc.read", "moc.update", "moc.transition", "moc.stats.read",
                "moc.director.confirm", "moc.director.cancel",
                "moc.director.stand_by", "moc.director.resume",
                "moc.director.validate_study", "moc.director.return_for_rework",
            ],
        },
        {
            "code": "MOC_LEAD_PROCESS",
            "name": "Lead Process — MOC",
            "description": "Démarre les études, désigne le responsable process engineer",
            "permissions": [
                "moc.read", "moc.update", "moc.transition",
                "moc.lead_process.start_study",
                "moc.validate", "moc.metier.validate",
            ],
        },
        {
            "code": "MOC_PROCESS_ENGINEER",
            "name": "Process Engineer (Responsable MOC)",
            "description": "Conduit l'étude, coordonne, clôture après MAJ documentaire",
            "permissions": [
                "moc.read", "moc.update", "moc.transition",
                "moc.responsible.submit_study", "moc.responsible.cancel",
                "moc.responsible.close",
            ],
        },
        {
            "code": "MOC_HSE",
            "name": "HSE / Safety Process — MOC",
            "description": "Valide le volet HSE (HAZOP/HAZID/Environmental)",
            "permissions": [
                "moc.read", "moc.validate", "moc.hse.validate",
            ],
        },
        {
            "code": "MOC_MAINTENANCE_MANAGER",
            "name": "Maintenance Manager — MOC",
            "description": "Valide l'impact maintenance",
            "permissions": [
                "moc.read", "moc.validate", "moc.maintenance.validate",
            ],
        },
        {
            "code": "MOC_METIER",
            "name": "Métier (Electricité / Instrumentation / …)",
            "description": "Valide son volet métier",
            "permissions": [
                "moc.read", "moc.validate", "moc.metier.validate",
            ],
        },
        {
            "code": "MOC_ADMIN",
            "name": "Administrateur MOC",
            "description": "Accès complet au module MOC — gestion, suppression, stats",
            "permissions": [
                "moc.read", "moc.create", "moc.update", "moc.delete", "moc.manage",
                "moc.transition", "moc.validate", "moc.stats.read",
                "moc.site_chief.approve", "moc.site_chief.submit",
                "moc.site_chief.cancel", "moc.site_chief.start_execution",
                "moc.site_chief.complete_execution",
                "moc.director.confirm", "moc.director.cancel",
                "moc.director.stand_by", "moc.director.resume",
                "moc.director.validate_study", "moc.director.return_for_rework",
                "moc.lead_process.start_study",
                "moc.responsible.submit_study", "moc.responsible.cancel",
                "moc.responsible.close",
                "moc.hse.validate", "moc.maintenance.validate",
                "moc.metier.validate", "moc.initiator.cancel",
            ],
        },
    ],
    event_publications=[
        "moc.created",
        "moc.approved",
        "moc.submitted_to_confirm",
        "moc.cancelled",
        "moc.stand_by",
        "moc.approved_to_study",
        "moc.under_study",
        "moc.study_in_validation",
        "moc.validated",
        "moc.execution",
        "moc.executed_docs_pending",
        "moc.closed",
    ],
)
