"""Phase 2 — Seed atomique de la matrice role × permission selon spec §5.

Revision ID: 177_rbac_phase2_role_permissions_matrix
Revises: 176_rbac_seed_pdf_email_templates
Create Date: 2026-05-14

This migration populates ``role_permissions`` for the 17 starter roles seeded
by migration 175 (SECURITY_OFFICER, DO, DPROD, SITE_MGR, PROJ_MGR, HSE_MGR,
MAINT_MGR, DOC_CONTROLLER, PAX_COORD, LOG_COORD, TRANSP_COORD, PLANNER,
MOC_VALIDATOR, OPERATOR, PAX, TIER_CONTACT, INTEGRATION_BOT) plus the aliases
PLATFORM_ADMIN/PAX_COORD/HSE_MGR (cloned from SUPER_ADMIN/PAX_ADMIN/HSE_ADMIN).

Strategy: declarative SQL using ``INSERT … SELECT FROM permissions WHERE …``
plus explicit lists for cross-cutting permissions (workflow approvals, etc.).
This is more maintainable than 1200 hardcoded liaisons and adapts to new
permissions added in the future.

Idempotent: every INSERT uses ``ON CONFLICT DO NOTHING``. Safe to re-run.

Sources of truth (spec sections):
- §5.1: list of 20 roles
- §5.2 vue 5.A: transversal permissions (system, core.*)
- §5.2 vue 5.B: data + documents
- §5.2 vue 5.C: operations

Legend used in the spec:
- ``R``  = read only on a namespace
- ``RW`` = R + create + update + delete
- ``RWS`` = RW + submit
- ``RWA`` = RWS + approve + validate
- ``MGR`` = manage (full CRUD + admin actions)
- ``*``  = wildcard (all permissions of the namespace)
- ``OWN`` = restricted to own data (route-level filter, NOT a permission)

``OWN`` is not enforced here — it's a route-level filter (see ``docs/developer/rbac.md``).
We grant the underlying permission and the route restricts by ``user_id``/``tier_id`` etc.

Conformity: ISO 27001 §A.9.2.2 Provisionnement des accès, §A.9.2.3 Gestion
des privilèges, §A.9.2.5 Revue des droits.
"""
from alembic import op

# revision identifiers
revision = "177_rbac_phase2_role_permissions_matrix"
down_revision = "176_rbac_seed_pdf_email_templates"
branch_labels = None
depends_on = None


# ─────────────────────────────────────────────────────────────────────────────
# Permission lists per role (explicit cross-cutting permissions)
# ─────────────────────────────────────────────────────────────────────────────

# DO (Directeur des Opérations): top-level approvals + read everything
DO_EXTRA = [
    "moc.change.approve", "moc.change.transition", "moc.change.production_validate",
    "paxlog.ads.approve",
    "planner.activity.approve", "planner.activity.validate",
    "papyrus.document.approve", "papyrus.document.publish",
    "core.delegation.read", "core.delegation.create",
]

# DPROD: under DO, production validation
DPROD_EXTRA = [
    "asset.asset.update", "asset.installation.update",
    "moc.change.validate", "moc.change.production_validate", "moc.change.transition",
    "paxlog.ads.approve",
    "planner.activity.validate",
    "papyrus.document.approve",
    "pid.diagram.validate_afc",
    "core.delegation.read", "core.delegation.create",
]

# SITE_MGR (Chef de Site): RWS on installation scope
SITE_MGR_EXTRA = [
    "asset.asset.update", "asset.installation.update",
    "moc.change.create", "moc.change.update", "moc.change.submit", "moc.change.delete",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "planner.activity.cancel",
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit",
    "paxlog.profile.create", "paxlog.profile.update",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "conformite.record.create", "conformite.record.update",
    "support.ticket.create", "support.ticket.update",
    "teams.member.manage",
    "core.delegation.read", "core.delegation.create",
]

# PROJ_MGR (Chef de Projet)
PROJ_MGR_EXTRA = [
    "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "planner.activity.cancel", "planner.activity.validate",
    "planner.capacity.update", "planner.conflict.resolve", "planner.priority.override",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "papyrus.template.create", "papyrus.template.update",
    "papyrus.form.create", "papyrus.form.update",
    "report.report.create", "report.report.update",
    "support.ticket.create", "support.ticket.update",
    "imputation.imputation.create", "imputation.imputation.update",
    "core.delegation.read", "core.delegation.create",
]

# HSE_MGR (ex HSE_ADMIN): manages conformity & compliance
HSE_MGR_EXTRA = [
    "conformite.record.create", "conformite.record.update", "conformite.record.delete",
    "conformite.record.check", "conformite.record.verify",
    "conformite.rule.create", "conformite.rule.update", "conformite.rule.delete",
    "conformite.type.create", "conformite.type.update", "conformite.type.delete",
    "conformite.exemption.create", "conformite.exemption.update", "conformite.exemption.approve",
    "conformite.transfer.create",
    "conformite.job_position.create", "conformite.job_position.update", "conformite.job_position.delete",
    "paxlog.compliance.manage",
    "paxlog.signalement.create",
    "paxlog.incident.create", "paxlog.incident.update",
    "moc.change.create", "moc.change.update", "moc.change.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "support.ticket.create", "support.ticket.update",
    "core.audit.read",
    "core.delegation.read", "core.delegation.create",
]

# MAINT_MGR (Responsable Maintenance)
MAINT_MGR_EXTRA = [
    "asset.asset.update",
    "asset.installation.update",
    "pid.diagram.update", "pid.equipment.update", "pid.library.update", "pid.tag.update",
    "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# DOC_CONTROLLER (Papyrus master)
DOC_CONTROLLER_EXTRA = [
    # Papyrus full except final approve (kept for DO/DPROD)
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.delete",
    "papyrus.document.submit", "papyrus.document.reject", "papyrus.document.publish",
    "papyrus.document.share", "papyrus.document.manage",
    "papyrus.template.create", "papyrus.template.update",
    "papyrus.form.create", "papyrus.form.update",
    "papyrus.distribution_list.manage",
    "papyrus.arborescence.manage",
    "papyrus.nomenclature.validate",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# PAX_COORD (ex PAX_ADMIN): paxlog full except final approve
PAX_COORD_EXTRA = [
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit", "paxlog.ads.cancel",
    "paxlog.profile.create", "paxlog.profile.update",
    "paxlog.credential.create", "paxlog.credential.validate",
    "paxlog.credential_type.manage",
    "paxlog.compliance.manage",
    "paxlog.signalement.create",
    "paxlog.incident.create", "paxlog.incident.update",
    "paxlog.rotation.create", "paxlog.rotation.update",
    "paxlog.stay_program.create",
    "travelwiz.boarding.manage",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# LOG_COORD (Logistique / Packlog)
LOG_COORD_EXTRA = [
    "packlog.cargo.create", "packlog.cargo.update", "packlog.cargo.submit",
    "packlog.cargo.approve", "packlog.cargo.cancel",
    "packlog.request.create", "packlog.request.update",
    "tier.contact.manage",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# TRANSP_COORD (Transport / TravelWiz)
TRANSP_COORD_EXTRA = [
    "travelwiz.boarding.manage",
    "travelwiz.tracking.update",
    "travelwiz.voyage.create", "travelwiz.voyage.update",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# PLANNER (new role): planner full
PLANNER_EXTRA = [
    "planner.activity.create", "planner.activity.update", "planner.activity.delete",
    "planner.activity.submit", "planner.activity.validate", "planner.activity.cancel",
    "planner.capacity.update",
    "planner.conflict.resolve",
    "planner.priority.override",
    "workflow.instance.transition",
    "support.ticket.create", "support.ticket.update",
    "core.delegation.read", "core.delegation.create",
]

# MOC_VALIDATOR (new role): validate MOC without creating (segregation of duties)
MOC_VALIDATOR_EXTRA = [
    "moc.change.approve", "moc.change.validate", "moc.change.production_validate",
    "moc.change.transition",
    "moc.validator.invite",
    "core.delegation.read", "core.delegation.create",
]

# OPERATOR (new role): saisie / submission, no approve
OPERATOR_EXTRA = [
    "moc.change.create", "moc.change.update", "moc.change.submit",
    "planner.activity.create", "planner.activity.update", "planner.activity.submit",
    "paxlog.profile.update",
    "paxlog.ads.create", "paxlog.ads.update", "paxlog.ads.submit",
    "paxlog.signalement.create",
    "papyrus.document.create", "papyrus.document.update", "papyrus.document.submit",
    "papyrus.form.update",
    "conformite.record.create", "conformite.record.update",
    "support.ticket.create", "support.ticket.update",
]

# PAX (new role, user_type=external): self-service
# Most actions filtered by route (OWN). We grant the base read/update perms.
PAX_EXTRA = [
    "paxlog.profile.read", "paxlog.profile.update",
    "paxlog.ads.read",
    "paxlog.compliance.read",
    "paxlog.signalement.create",
    "travelwiz.tracking.read",
    "support.ticket.create", "support.ticket.update",
]

# TIER_CONTACT (new role, external company contact): very limited
TIER_CONTACT_EXTRA = [
    "tier.tier.read", "tier.contact.read",
    "packlog.cargo.read",
    "support.ticket.create",
]

# INTEGRATION_BOT (new role, system account): MCP + integration callbacks
INTEGRATION_BOT_EXTRA = [
    "mcp.gateway.manage", "mcp.token.create", "mcp.agent.execute",
    "workflow.instance.transition",
    "travelwiz.tracking.update",
    "paxlog.compliance.read",
    "imputation.imputation.read",
    "core.notification.read",
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _grant_explicit(role_code: str, codes: list[str]) -> None:
    """Grant a fixed list of permissions to a role (idempotent)."""
    if not codes:
        return
    # SQL-quote each code (escape single quotes by doubling)
    values_rows = ",".join(
        f"('{role_code}', '{c.replace(chr(39), chr(39) * 2)}')" for c in codes
    )
    op.execute(f"""
        INSERT INTO role_permissions (role_code, permission_code)
        VALUES {values_rows}
        ON CONFLICT DO NOTHING
    """)


def _grant_all_reads(role_code: str, exclude_namespaces: list[str] | None = None) -> None:
    """Grant every non-deprecated, non-sensitive *.read permission to a role.

    ``exclude_namespaces``: list of namespaces to skip (e.g. ['system'] for tenant-scoped roles).
    """
    excl_ns = (
        ", ".join(f"'{ns}'" for ns in exclude_namespaces) if exclude_namespaces else ""
    )
    ns_clause = f"AND namespace NOT IN ({excl_ns})" if excl_ns else ""
    op.execute(f"""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT '{role_code}', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          {ns_clause}
        ON CONFLICT DO NOTHING
    """)


def _clone_role_perms(source_role: str, target_role: str) -> None:
    """Copy all role_permissions from source_role into target_role (idempotent)."""
    op.execute(f"""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT '{target_role}', permission_code FROM role_permissions
        WHERE role_code = '{source_role}'
        ON CONFLICT DO NOTHING
    """)


# ─────────────────────────────────────────────────────────────────────────────
# upgrade / downgrade
# ─────────────────────────────────────────────────────────────────────────────

def upgrade():
    # ── PLATFORM_ADMIN: wildcard via permission_sync at startup (handled in code).
    # If you want to make it explicit, you could clone from SUPER_ADMIN here.
    _clone_role_perms("SUPER_ADMIN", "PLATFORM_ADMIN")

    # ── PAX_COORD / HSE_MGR aliases: clone perms of the legacy codes if any
    _clone_role_perms("PAX_ADMIN", "PAX_COORD")
    _clone_role_perms("HSE_ADMIN", "HSE_MGR")

    # ── READER: every non-sensitive *.read across the system
    _grant_all_reads("READER")

    # ── SECURITY_OFFICER: all reads (incl. sensitive RGPD perms) + revoke delegations
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'SECURITY_OFFICER', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
        ON CONFLICT DO NOTHING
    """)
    _grant_explicit("SECURITY_OFFICER", [
        "core.rbac.export",
        "core.user.audit_export",
        "core.delegation.read",
        "core.delegation.revoke",
        "core.audit.read",
    ])

    # ── DO: read everything tenant-scoped + top-level approvals
    _grant_all_reads("DO", exclude_namespaces=["system"])
    _grant_explicit("DO", DO_EXTRA)

    # ── DPROD: under DO, production validation
    _grant_all_reads("DPROD", exclude_namespaces=["system"])
    _grant_explicit("DPROD", DPROD_EXTRA)

    # ── SITE_MGR: Chef de Site, RWS on installation scope
    _grant_all_reads("SITE_MGR", exclude_namespaces=["system"])
    _grant_explicit("SITE_MGR", SITE_MGR_EXTRA)

    # ── PROJ_MGR: Chef de Projet
    _grant_all_reads("PROJ_MGR", exclude_namespaces=["system"])
    _grant_explicit("PROJ_MGR", PROJ_MGR_EXTRA)

    # ── HSE_MGR: conformity & HSE
    _grant_all_reads("HSE_MGR", exclude_namespaces=["system"])
    _grant_explicit("HSE_MGR", HSE_MGR_EXTRA)

    # ── MAINT_MGR: Maintenance + PID
    _grant_all_reads("MAINT_MGR", exclude_namespaces=["system"])
    _grant_explicit("MAINT_MGR", MAINT_MGR_EXTRA)

    # ── DOC_CONTROLLER: Papyrus full (except final approve)
    _grant_all_reads("DOC_CONTROLLER", exclude_namespaces=["system"])
    _grant_explicit("DOC_CONTROLLER", DOC_CONTROLLER_EXTRA)

    # ── PAX_COORD: paxlog full except final approve (also has alias clone from above)
    _grant_all_reads("PAX_COORD", exclude_namespaces=["system"])
    _grant_explicit("PAX_COORD", PAX_COORD_EXTRA)

    # ── LOG_COORD: packlog full
    _grant_all_reads("LOG_COORD", exclude_namespaces=["system"])
    _grant_explicit("LOG_COORD", LOG_COORD_EXTRA)

    # ── TRANSP_COORD: travelwiz
    _grant_all_reads("TRANSP_COORD", exclude_namespaces=["system"])
    _grant_explicit("TRANSP_COORD", TRANSP_COORD_EXTRA)

    # ── PLANNER: planner full
    _grant_all_reads("PLANNER", exclude_namespaces=["system"])
    _grant_explicit("PLANNER", PLANNER_EXTRA)

    # ── MOC_VALIDATOR: validate-only on MOC (separation of duties — no create)
    # Note: only reads MOC + has approve/validate. Other modules: read only.
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'MOC_VALIDATOR', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          AND namespace IN ('moc', 'core', 'workflow', 'dashboard')
        ON CONFLICT DO NOTHING
    """)
    _grant_explicit("MOC_VALIDATOR", MOC_VALIDATOR_EXTRA)

    # ── OPERATOR: saisie & submission, no approve
    # Reads on operational modules.
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'OPERATOR', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          AND namespace IN (
            'asset', 'tier', 'moc', 'planner', 'paxlog', 'packlog', 'travelwiz',
            'pid', 'conformite', 'imputation', 'dashboard', 'workflow',
            'messaging', 'support', 'teams', 'papyrus', 'report'
          )
        ON CONFLICT DO NOTHING
    """)
    _grant_explicit("OPERATOR", OPERATOR_EXTRA)

    # ── PAX: self-service (filter OWN at route level)
    # Limited reads on personal data namespaces only.
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'PAX', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          AND namespace IN ('paxlog', 'travelwiz', 'dashboard', 'messaging')
        ON CONFLICT DO NOTHING
    """)
    _grant_explicit("PAX", PAX_EXTRA)

    # ── TIER_CONTACT: external company contact, very limited
    op.execute("""
        INSERT INTO role_permissions (role_code, permission_code)
        SELECT 'TIER_CONTACT', code FROM permissions
        WHERE action = 'read'
          AND COALESCE(deprecated, false) = false
          AND COALESCE(sensitive, false) = false
          AND namespace IN ('tier', 'packlog', 'dashboard', 'messaging')
        ON CONFLICT DO NOTHING
    """)
    _grant_explicit("TIER_CONTACT", TIER_CONTACT_EXTRA)

    # ── INTEGRATION_BOT: service account, no UI reads
    _grant_explicit("INTEGRATION_BOT", INTEGRATION_BOT_EXTRA)


def downgrade():
    """Remove all role_permissions for the 17 starter roles + aliases."""
    starter_roles = [
        "PLATFORM_ADMIN", "SECURITY_OFFICER", "DO", "DPROD", "SITE_MGR", "PROJ_MGR",
        "HSE_MGR", "MAINT_MGR", "DOC_CONTROLLER", "PAX_COORD", "LOG_COORD",
        "TRANSP_COORD", "PLANNER", "MOC_VALIDATOR", "OPERATOR", "PAX",
        "TIER_CONTACT", "INTEGRATION_BOT",
    ]
    # Note: we do NOT touch SUPER_ADMIN, PAX_ADMIN, HSE_ADMIN, READER, TENANT_ADMIN
    # (seeded by migration 001 and managed by permission_sync.py at startup).
    codes_in = ", ".join(f"'{r}'" for r in starter_roles)
    op.execute(f"""
        DELETE FROM role_permissions
        WHERE role_code IN ({codes_in})
    """)
