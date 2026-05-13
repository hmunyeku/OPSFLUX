"""RBAC seed PDF templates, email templates, and i18n translations.

Revision ID: 172_rbac_seed_pdf_email_templates
Revises: 171_rbac_bootstrap_phase1
Create Date: 2026-05-13 18:00:00

This migration is ADDITIVE: it inserts seed data only. No DDL changes.
Idempotent via ON CONFLICT DO UPDATE.

Group 1 of PR-B is implemented here (i18n translations only). PDF templates,
email templates, and HTML partial inlining come from later groups in the
same migration -- this file is meant to grow with each merged group.

Storage decision: the plan assumed a `references` table with
(domain, code, lang, label). That table does not exist in OpsFlux. The
project uses `i18n_messages` (key, language_code, namespace, value) with a
unique index `uq_i18n_message` on (key, language_code). We use
`namespace = 'rbac_pdf'` to play the role of the planned `domain`. The
runtime helper `_lookup_translation` in app/core/pdf_templates.py reads
this same namespace via the I18nMessage SQLAlchemy model.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "172_rbac_seed_pdf_email_templates"
down_revision = "171_rbac_bootstrap_phase1"
branch_labels = None
depends_on = None


# ── Translations table: (key, fr, en) ─────────────────────────────────────
#
# All keys are prefixed with `RBAC_` so they cannot collide with another
# namespace's keys (the unique index on i18n_messages is on (key, lang),
# not on (namespace, key, lang) -- see migration 126).

_RBAC_PDF_TRANSLATIONS: list[tuple[str, str, str]] = [
    # Common UI strings
    ("RBAC_GENERATED_AT", "Généré le", "Generated on"),
    ("RBAC_BY", "Par", "By"),
    ("RBAC_CONFIDENTIAL", "CONFIDENTIEL", "CONFIDENTIAL"),
    ("RBAC_PAGE", "Page", "Page"),
    ("RBAC_OF", "sur", "of"),
    # Matrix titles
    ("RBAC_MATRIX_ROLES_PERMISSIONS", "Matrice Rôles × Permissions", "Roles × Permissions Matrix"),
    ("RBAC_MATRIX_GROUPS_PERMISSIONS", "Matrice Groupes × Permissions", "Groups × Permissions Matrix"),
    ("RBAC_MATRIX_USERS_PERMISSIONS", "Matrice Utilisateurs × Permissions", "Users × Permissions Matrix"),
    ("RBAC_MATRIX_ROLES_MODULES", "Vue Rôles × Modules", "Roles × Modules View"),
    ("RBAC_MATRIX_SOD", "Matrice de Ségrégation des Devoirs", "Segregation of Duties Matrix"),
    # Fiches
    ("RBAC_ROLE_DETAIL", "Fiche détaillée du rôle", "Role detail sheet"),
    ("RBAC_GROUP_DETAIL", "Fiche détaillée du groupe", "Group detail sheet"),
    ("RBAC_USER_DETAIL", "Fiche détaillée de l'utilisateur", "User detail sheet"),
    ("RBAC_PERMISSION_CATALOG", "Catalogue de permissions", "Permission catalog"),
    ("RBAC_DELEGATIONS_REGISTRY", "Registre des délégations", "Delegations registry"),
    ("RBAC_DELEGATION_CERTIFICATE", "Certificat de délégation de permissions", "Permission delegation certificate"),
    # Section headers
    ("RBAC_SECTION_SYNTHESIS", "Synthèse", "Synthesis"),
    ("RBAC_SECTION_TOC", "Sommaire", "Table of contents"),
    ("RBAC_SECTION_LEGEND", "Légende", "Legend"),
    ("RBAC_SECTION_PERMISSIONS", "Permissions", "Permissions"),
    ("RBAC_SECTION_ROLES", "Rôles", "Roles"),
    ("RBAC_SECTION_GROUPS", "Groupes", "Groups"),
    ("RBAC_SECTION_MEMBERS", "Membres", "Members"),
    ("RBAC_SECTION_DELEGATIONS_RECEIVED", "Délégations reçues", "Delegations received"),
    ("RBAC_SECTION_DELEGATIONS_GIVEN", "Délégations données", "Delegations given"),
    ("RBAC_SECTION_OVERRIDES", "Surcharges", "Overrides"),
    ("RBAC_SECTION_EFFECTIVE_PERMISSIONS", "Permissions effectives", "Effective permissions"),
    # Field labels
    ("RBAC_LABEL_CODE", "Code", "Code"),
    ("RBAC_LABEL_NAME", "Nom", "Name"),
    ("RBAC_LABEL_DESCRIPTION", "Description", "Description"),
    ("RBAC_LABEL_MODULE", "Module", "Module"),
    ("RBAC_LABEL_NAMESPACE", "Namespace", "Namespace"),
    ("RBAC_LABEL_RESOURCE", "Ressource", "Resource"),
    ("RBAC_LABEL_ACTION", "Action", "Action"),
    ("RBAC_LABEL_TENANT", "Locataire", "Tenant"),
    ("RBAC_LABEL_DELEGATOR", "Délégant", "Delegator"),
    ("RBAC_LABEL_DELEGATE", "Délégué", "Delegate"),
    ("RBAC_LABEL_PERIOD", "Période effective", "Effective period"),
    ("RBAC_LABEL_DURATION", "Durée", "Duration"),
    ("RBAC_LABEL_DAYS", "jours", "days"),
    ("RBAC_LABEL_REASON", "Motif", "Reason"),
    ("RBAC_LABEL_STATUS", "Statut", "Status"),
    ("RBAC_LABEL_SOURCE", "Source", "Source"),
    ("RBAC_LABEL_ROLES_AT_DATE", "Rôles à la date", "Roles at date"),
    ("RBAC_LABEL_ASSET_SCOPE", "Périmètre asset", "Asset scope"),
    # Status values
    ("RBAC_STATUS_ACTIVE", "Active", "Active"),
    ("RBAC_STATUS_PROGRAMMED", "Programmée", "Programmed"),
    ("RBAC_STATUS_EXPIRED", "Expirée", "Expired"),
    ("RBAC_STATUS_REVOKED", "Révoquée", "Revoked"),
    # Permission sources (4-layer)
    ("RBAC_SOURCE_USER", "Surcharge utilisateur", "User override"),
    ("RBAC_SOURCE_ROLE", "Via rôle", "Via role"),
    ("RBAC_SOURCE_GROUP", "Surcharge groupe", "Group override"),
    ("RBAC_SOURCE_DELEGATION", "Via délégation", "Via delegation"),
    # Legend cells
    ("RBAC_LEGEND_GRANTED", "Permission accordée", "Permission granted"),
    ("RBAC_LEGEND_NOT_GRANTED", "Permission non accordée", "Permission not granted"),
    ("RBAC_LEGEND_RGPD_FLAG", "Permission sensible RGPD", "GDPR-sensitive permission"),
    ("RBAC_LEGEND_MODULE_DISABLED", "Module désactivé dans ce tenant", "Module disabled in this tenant"),
    # ISO compliance footnotes
    ("RBAC_ISO_DOC_OPPOSABLE", "Document opposable, conforme ISO 27001 §A.9 Contrôle des accès.", "Legally binding document, ISO 27001 §A.9 Access Control compliant."),
    ("RBAC_ISO_CLAUSE_REVIEW", "ISO 27001 §A.9.2.5 — Revue des droits d'accès des utilisateurs.", "ISO 27001 §A.9.2.5 — Review of user access rights."),
    ("RBAC_ISO_CLAUSE_DELEGATION", "ISO 27001 §A.9.2.6 — Suppression ou ajustement des droits d'accès.", "ISO 27001 §A.9.2.6 — Removal or adjustment of access rights."),
    ("RBAC_AUDIT_EVENT", "Référence audit", "Audit reference"),
    ("RBAC_CONTENT_HASH", "Empreinte SHA-256", "SHA-256 fingerprint"),
    # Delegations specifics
    ("RBAC_DELEGATION_TITLE", "CERTIFICAT DE DÉLÉGATION", "DELEGATION CERTIFICATE"),
    ("RBAC_DELEGATION_SUBTITLE", "de permissions d'accès", "of access permissions"),
    ("RBAC_DELEGATION_PERMISSIONS_DELEGATED", "Permissions déléguées", "Delegated permissions"),
    ("RBAC_DELEGATION_REVOCATION_BLOCK", "RÉVOCATION", "REVOCATION"),
    ("RBAC_DELEGATION_REVOKED_BY", "Révoqué par", "Revoked by"),
    ("RBAC_DELEGATION_REVOKED_AT", "Date de révocation", "Revocation date"),
    ("RBAC_DELEGATION_EXPIRY_J3_NOTICE", "Cette délégation expirera dans 3 jours.", "This delegation will expire in 3 days."),
    ("RBAC_DELEGATION_EXPIRY_J0_NOTICE", "Cette délégation expire aujourd'hui.", "This delegation expires today."),
    # SoD specifics
    ("RBAC_SOD_VIOLATIONS_COUNT", "Conflits détectés", "Conflicts detected"),
    ("RBAC_SOD_NO_VIOLATIONS", "Aucun conflit de ségrégation des devoirs détecté.", "No segregation of duties conflicts detected."),
    ("RBAC_SOD_RULE", "Règle", "Rule"),
    ("RBAC_SOD_AFFECTED_ROLE", "Rôle concerné", "Affected role"),
    # Counters
    ("RBAC_COUNT_ROLES", "rôles", "roles"),
    ("RBAC_COUNT_PERMISSIONS", "permissions", "permissions"),
    ("RBAC_COUNT_GROUPS", "groupes", "groups"),
    ("RBAC_COUNT_USERS", "utilisateurs", "users"),
    ("RBAC_COUNT_DELEGATIONS", "délégations", "delegations"),
    ("RBAC_COUNT_LINKS", "liaisons actives", "active links"),
]


def upgrade():
    _seed_i18n_translations()
    # PDF templates, email templates, and shared partial inlining come from
    # Groups 2-8 of PR-B (later commits append to this migration).


def _seed_i18n_translations():
    """Seed RBAC PDF translation keys into i18n_messages (namespace='rbac_pdf').

    For each (code, fr, en) triple we insert two rows: one in fr, one in en.
    Idempotent: ON CONFLICT (key, language_code) DO UPDATE keeps the seed
    consistent if the migration is rerun (e.g. downgrade + upgrade).

    The conflict target is (key, language_code) because that's the column
    pair covered by the unique index `uq_i18n_message` (migration 126).
    RBAC keys are all `RBAC_*`-prefixed so they cannot collide with other
    namespaces.
    """
    from sqlalchemy import text

    conn = op.get_bind()

    rows: list[dict[str, str]] = []
    for code, fr, en in _RBAC_PDF_TRANSLATIONS:
        rows.append({"key": code, "lang": "fr", "value": fr})
        rows.append({"key": code, "lang": "en", "value": en})

    stmt = text(
        """
        INSERT INTO i18n_messages (key, language_code, namespace, value)
        VALUES (:key, :lang, 'rbac_pdf', :value)
        ON CONFLICT (key, language_code)
        DO UPDATE SET value = EXCLUDED.value, namespace = EXCLUDED.namespace
        """
    )
    # executemany via a list of bound-param dicts
    conn.execute(stmt, rows)


def downgrade():
    """Drop only the rbac_pdf-namespace rows seeded by this migration.

    Identifying by namespace='rbac_pdf' is safe: no other migration writes
    to that namespace. PDF/email template seeds added by later groups in
    PR-B will extend this downgrade with their own deletions.
    """
    op.execute("DELETE FROM i18n_messages WHERE namespace = 'rbac_pdf'")
