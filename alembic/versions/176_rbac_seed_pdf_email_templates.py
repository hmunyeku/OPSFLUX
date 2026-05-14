"""RBAC seed PDF templates, email templates, and i18n translations.

Revision ID: 176_rbac_seed_pdf_email_templates
Revises: 175_rbac_bootstrap_phase1
Create Date: 2026-05-13 18:00:00

This migration is ADDITIVE: it inserts seed data only. No DDL changes.
Idempotent: re-running produces the same end state (delete-then-insert
inside a transaction).

Three independent seeds are performed by ``upgrade()``:

  1. ``_seed_i18n_translations()``  -- ~80 RBAC_* translation keys
     into ``i18n_messages`` (namespace='rbac_pdf'). Group 1 of PR-B.

  2. ``_seed_pdf_templates()``       -- 11 system PdfTemplate rows
     (entity_id IS NULL, visible to all tenants) and their FR+EN
     versions (22 rows in ``pdf_template_versions``). HTML bodies are
     read from ``app/static/rbac_pdf_templates/`` at migration time and
     the shared CSS partial is inlined at the top of each body. Group 8.

  3. ``_seed_email_templates()``     -- 4 email templates per existing
     entity (``rbac.delegation.granted|received|revoked|expired``).
     Email templates require ``entity_id NOT NULL`` per the model, so
     we seed one copy of each template for every existing entity. If
     more entities are created later, the tenant-bootstrap routine is
     responsible for cloning these system templates. Group 8.

Storage decision for i18n: the plan assumed a ``references`` table
with (domain, code, lang, label). That table does not exist in
OpsFlux. The project uses ``i18n_messages`` (key, language_code,
namespace, value) with a unique index ``uq_i18n_message`` on
(key, language_code). We use ``namespace='rbac_pdf'`` to play the role
of the planned ``domain``. The runtime helper ``_lookup_translation``
in ``app/core/pdf_templates.py`` reads this same namespace via the
``I18nMessage`` SQLAlchemy model.

Schema notes (verified against ``app/models/common.py``):

* ``pdf_templates``: column is ``object_type`` (not ``category``).
  Page settings live on the template, not the version: ``page_size``,
  ``orientation``. Unique index is ``(entity_id, slug)`` and PostgreSQL
  treats NULL as distinct in unique indexes, so we delete-then-insert
  keyed on ``slug WHERE entity_id IS NULL`` rather than relying on
  ``ON CONFLICT``.

* ``pdf_template_versions``: column is ``version_number``; activation
  flag is ``is_published``. ``idx_ptv_template_lang`` is non-unique,
  so we delete-then-insert keyed on (template_id, language).

* ``email_templates``: ``entity_id`` is NOT NULL -- system seed loops
  over every existing entity. Column is ``object_type``.

* ``email_template_versions``: column is ``version`` (not
  ``version_number``); activation flag is ``is_active`` (not
  ``is_published``). There is no ``body_text`` column -- only
  ``subject`` and ``body_html``. We discard the ``.body.txt`` files at
  seed time; they remain on disk for documentation but are not stored.
"""
from pathlib import Path

from alembic import op

# revision identifiers
revision = "176_rbac_seed_pdf_email_templates"
down_revision = "175_rbac_bootstrap_phase1"
branch_labels = None
depends_on = None


# ── Static file root ──────────────────────────────────────────────────────
# This file lives at ``alembic/versions/172_*.py``. Going two ``parent`` hops
# reaches the repo root, where ``app/static/`` is located.
_STATIC_ROOT = Path(__file__).resolve().parent.parent.parent / "app" / "static"


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
    ("RBAC_OVERRIDE_GRANTED", "✓ accordée", "✓ granted"),
    ("RBAC_OVERRIDE_REVOKED", "✗ révoquée", "✗ revoked"),
    ("RBAC_NO_OVERRIDES", "Aucune surcharge.", "No overrides."),
    ("RBAC_LABEL_FROM", "De", "From"),
    ("RBAC_LABEL_TO", "À", "To"),
    ("RBAC_NO_GROUPS_USING_ROLE", "Aucun groupe n'utilise ce rôle.", "No group uses this role."),
]


# ── PDF templates to seed (slug, name_fr, name_en, page_size, orientation) ─
# All system templates (entity_id IS NULL) -- visible to all tenants via
# the global-fallback path in resolve_pdf_template_version.
_PDF_TEMPLATES: list[tuple[str, str, str, str, str]] = [
    ("core.rbac.matrix_role_permissions",   "Matrice Rôles × Permissions",          "Roles × Permissions Matrix",   "A4", "landscape"),
    ("core.rbac.matrix_group_permissions",  "Matrice Groupes × Permissions",        "Groups × Permissions Matrix",  "A4", "landscape"),
    ("core.rbac.matrix_user_permissions",   "Matrice Utilisateurs × Permissions",   "Users × Permissions Matrix",   "A4", "landscape"),
    ("core.rbac.role_detail",               "Fiche détaillée d'un rôle",            "Role detail sheet",            "A4", "portrait"),
    ("core.rbac.group_detail",              "Fiche détaillée d'un groupe",          "Group detail sheet",           "A4", "portrait"),
    ("core.rbac.user_detail",               "Fiche détaillée d'un utilisateur",     "User detail sheet",            "A4", "portrait"),
    ("core.rbac.role_modules",              "Vue Rôles × Modules",                  "Roles × Modules View",         "A4", "portrait"),
    ("core.rbac.permission_catalog",        "Catalogue de permissions",             "Permission catalog",           "A4", "portrait"),
    ("core.rbac.sod_matrix",                "Matrice de ségrégation des devoirs",   "Segregation of Duties Matrix", "A4", "portrait"),
    ("core.rbac.delegation_registry",       "Registre des délégations",             "Delegations registry",         "A4", "landscape"),
    ("core.rbac.delegation_certificate",    "Certificat de délégation",             "Delegation certificate",       "A4", "portrait"),
]


# ── Email templates to seed (slug, file_stem, name_fr, name_en) ───────────
_EMAIL_TEMPLATES: list[tuple[str, str, str, str]] = [
    ("rbac.delegation.granted",  "delegation_granted",  "Délégation accordée",  "Delegation granted"),
    ("rbac.delegation.received", "delegation_received", "Délégation reçue",     "Delegation received"),
    ("rbac.delegation.revoked",  "delegation_revoked",  "Délégation révoquée",  "Delegation revoked"),
    ("rbac.delegation.expired",  "delegation_expired",  "Délégation expirée",   "Delegation expired"),
]


def upgrade():
    _seed_i18n_translations()
    _seed_pdf_templates()
    _seed_email_templates()


# ── Helpers ───────────────────────────────────────────────────────────────


def _read_file(path: Path) -> str:
    """Read a UTF-8 text file. Raises FileNotFoundError if missing."""
    return path.read_text(encoding="utf-8")


def _read_shared_partials() -> tuple[str, str, str]:
    """Read the 3 shared HTML partials (header, footer, CSS).

    These get inlined into every PDF template at seed time so each row in
    ``pdf_template_versions`` is self-contained -- the runtime renderer
    does not need to know about the static directory.
    """
    base = _STATIC_ROOT / "rbac_pdf_templates" / "_shared"
    header = _read_file(base / "header.html")
    footer = _read_file(base / "footer.html")
    css = _read_file(base / "common.css")
    return header, footer, css


# ── Seed: i18n translations (Group 1) ─────────────────────────────────────


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
    conn.execute(stmt, rows)


# ── Seed: PDF templates (Group 8) ─────────────────────────────────────────


def _seed_pdf_templates():
    """Seed 11 system PdfTemplate + 22 PdfTemplateVersion rows.

    All rows are global (``entity_id IS NULL``) so every tenant resolves
    them through the global-fallback path.

    Idempotency strategy: we cannot rely on ``ON CONFLICT (entity_id, slug)``
    because the unique index treats NULL as distinct (PostgreSQL semantics).
    Instead we delete any pre-existing rows for these slugs and re-insert.
    The DELETE on ``pdf_templates`` cascades to ``pdf_template_versions``.
    """
    from sqlalchemy import text

    conn = op.get_bind()

    header_html, footer_html, common_css = _read_shared_partials()
    css_block = f"<style>{common_css}</style>"

    base_dir = _STATIC_ROOT / "rbac_pdf_templates"

    # 1) Wipe any previous seed of these slugs (cascades to versions).
    conn.execute(text(
        """
        DELETE FROM pdf_templates
        WHERE entity_id IS NULL
          AND slug = ANY(:slugs)
        """
    ), {"slugs": [t[0] for t in _PDF_TEMPLATES]})

    # 2) Re-insert templates + versions.
    for slug, name_fr, _name_en, page_size, orientation in _PDF_TEMPLATES:
        file_stem = slug.split(".")[-1]

        # Insert the PdfTemplate row and capture its generated UUID.
        result = conn.execute(
            text(
                """
                INSERT INTO pdf_templates (
                    id, entity_id, slug, name, description,
                    object_type, enabled, variables_schema,
                    page_size, orientation,
                    margin_top, margin_right, margin_bottom, margin_left,
                    created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), NULL, :slug, :name, NULL,
                    'rbac_export', TRUE, NULL,
                    :page_size, :orientation,
                    15, 12, 15, 12,
                    NOW(), NOW()
                )
                RETURNING id
                """
            ),
            {
                "slug": slug,
                "name": name_fr,
                "page_size": page_size,
                "orientation": orientation,
            },
        )
        template_id = result.scalar_one()

        for lang in ("fr", "en"):
            body_path = base_dir / f"{file_stem}.{lang}.body.html"
            if not body_path.exists():
                # English file may be a copy/placeholder of FR; fall back.
                body_path = base_dir / f"{file_stem}.fr.body.html"
            body_html = css_block + "\n" + _read_file(body_path)

            conn.execute(
                text(
                    """
                    INSERT INTO pdf_template_versions (
                        id, template_id, version_number, language,
                        body_html, header_html, footer_html,
                        is_published, created_by, created_at
                    ) VALUES (
                        gen_random_uuid(), :tid, 1, :lang,
                        :body, :header, :footer,
                        TRUE, NULL, NOW()
                    )
                    """
                ),
                {
                    "tid": template_id,
                    "lang": lang,
                    "body": body_html,
                    "header": header_html,
                    "footer": footer_html,
                },
            )


# ── Seed: Email templates (Group 8) ───────────────────────────────────────


def _seed_email_templates():
    """Seed 4 EmailTemplate rows + their FR/EN versions per existing entity.

    Unlike PDF templates, ``email_templates.entity_id`` is NOT NULL: there
    are no global email templates in the OpsFlux schema. So we seed one
    copy of each (slug, entity_id) pair for every entity that currently
    exists in the database.

    For entities created AFTER this migration runs, the
    ``app/services/core/tenant_bootstrap`` routine is responsible for
    cloning these system templates into the new tenant. This migration
    leaves a hint behind via ``description = 'RBAC system seed'`` so that
    code can detect already-cloned templates.

    If the database currently contains zero entities (e.g. a fresh
    install where the bootstrap hasn't run yet), this function is a
    no-op. The next entity-creation flow will seed the templates.
    """
    from sqlalchemy import text

    conn = op.get_bind()

    # Find every existing entity.
    entity_rows = conn.execute(text("SELECT id FROM entities")).all()
    if not entity_rows:
        return  # nothing to seed against; tenant-bootstrap will handle later

    base_dir = _STATIC_ROOT / "rbac_email_templates"

    # 1) Wipe any previous seed of these slugs across all entities
    #    (cascades to versions).
    conn.execute(text(
        """
        DELETE FROM email_templates
        WHERE slug = ANY(:slugs)
          AND description = 'RBAC system seed'
        """
    ), {"slugs": [t[0] for t in _EMAIL_TEMPLATES]})

    # 2) Re-insert one (slug, entity_id) combo for every entity.
    for (entity_id,) in entity_rows:
        for slug, file_stem, name_fr, _name_en in _EMAIL_TEMPLATES:
            result = conn.execute(
                text(
                    """
                    INSERT INTO email_templates (
                        id, entity_id, slug, name, description,
                        object_type, enabled, variables_schema,
                        created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :entity_id, :slug, :name,
                        'RBAC system seed',
                        'rbac_delegation', TRUE, NULL,
                        NOW(), NOW()
                    )
                    RETURNING id
                    """
                ),
                {"entity_id": entity_id, "slug": slug, "name": name_fr},
            )
            template_id = result.scalar_one()

            for lang in ("fr", "en"):
                subject_path = base_dir / f"{file_stem}.{lang}.subject.txt"
                body_html_path = base_dir / f"{file_stem}.{lang}.body.html"

                if not subject_path.exists():
                    subject_path = base_dir / f"{file_stem}.fr.subject.txt"
                if not body_html_path.exists():
                    body_html_path = base_dir / f"{file_stem}.fr.body.html"

                subject = _read_file(subject_path).strip()
                body_html = _read_file(body_html_path)

                conn.execute(
                    text(
                        """
                        INSERT INTO email_template_versions (
                            id, template_id, version, language,
                            subject, body_html, is_active,
                            valid_from, valid_until, created_by, created_at
                        ) VALUES (
                            gen_random_uuid(), :tid, 1, :lang,
                            :subject, :html, TRUE,
                            NULL, NULL, NULL, NOW()
                        )
                        """
                    ),
                    {
                        "tid": template_id,
                        "lang": lang,
                        "subject": subject,
                        "html": body_html,
                    },
                )


def downgrade():
    """Reverse all three seeds.

    Order matters: delete versions/leaf rows before parent rows to be
    explicit (the CASCADE on ``pdf_template_versions.template_id`` and
    ``email_template_versions.template_id`` would handle it, but
    explicit is safer in case of partial transaction).
    """
    # 1) Email templates seeded by us (identified by description tag).
    op.execute(
        """
        DELETE FROM email_template_versions
        WHERE template_id IN (
            SELECT id FROM email_templates
            WHERE description = 'RBAC system seed'
              AND slug LIKE 'rbac.delegation.%'
        )
        """
    )
    op.execute(
        """
        DELETE FROM email_templates
        WHERE description = 'RBAC system seed'
          AND slug LIKE 'rbac.delegation.%'
        """
    )

    # 2) System PDF templates (entity_id IS NULL).
    op.execute(
        """
        DELETE FROM pdf_template_versions
        WHERE template_id IN (
            SELECT id FROM pdf_templates
            WHERE entity_id IS NULL
              AND slug LIKE 'core.rbac.%'
        )
        """
    )
    op.execute(
        """
        DELETE FROM pdf_templates
        WHERE entity_id IS NULL
          AND slug LIKE 'core.rbac.%'
        """
    )

    # 3) i18n translations (Group 1).
    op.execute("DELETE FROM i18n_messages WHERE namespace = 'rbac_pdf'")
