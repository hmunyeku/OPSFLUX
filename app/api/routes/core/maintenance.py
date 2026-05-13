"""Admin maintenance routes — generate demo data + reset/purge tenant data.

These endpoints are scoped to the **current entity (tenant)**. They never
touch system-required data (users, RBAC, settings, dictionaries, i18n,
MCP, file types, conformite types/templates, pdf_templates, etc.).

All endpoints require the ``core.settings.manage`` permission and emit
audit log entries. The reset endpoint additionally requires a
confirm_phrase body field as a tripwire to make accidental purge
impossible from the UI.

Routes:
- GET  /api/v1/admin/maintenance/scopes         list available reset scopes
- POST /api/v1/admin/maintenance/generate-demo  populate demo data
- POST /api/v1/admin/maintenance/reset-tenant   purge tenant data (scoped)
"""

from __future__ import annotations

import logging
import random
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.models.common import (
    Project,
    ProjectTask,
    Tier,
    TierContact,
    User,
)
from app.models.asset_registry import OilField, OilSite

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/maintenance", tags=["admin-maintenance"])


# ──────────────────────────────────────────────────────────────────────────────
# Reset scopes — exhaustive whitelist of tenant tables, grouped by domain.
# ──────────────────────────────────────────────────────────────────────────────
#
# IMPORTANT — what is *NEVER* listed here (even as a side-effect):
#
#   - users, user_groups, user_group_members, user_group_roles
#   - entities, business_units
#   - settings (entity, user, tenant scoped — survives a reset)
#   - roles, permissions, role_permissions, *_permission_overrides
#   - dictionary_entries
#   - i18n_languages, i18n_messages, i18n_catalog_meta
#   - mcp_* (MCP backends, tools, etc.)
#   - file types / attachment_types
#   - compliance_types (templates), pdf_templates, email_templates (templates)
#   - workflow_definitions (system-defined state machines)
#   - reference_sequences (numbering counters)
#
# Each scope maps to one or more tables. Tables are deleted in dependency
# order (children first). All deletes are filtered by entity_id when the
# table has it, otherwise via a join to a parent that does.
#
# IMPORTANT — scope ORDER matters: scopes are run in dict-insertion order
# inside a single transaction. Cross-scope FKs (e.g. planner_activities ->
# ar_installations, voyages -> ar_installations) require the dependent
# scopes to run BEFORE the assets scope.
#
# Adding a new tenant-scoped module? Append a scope here. The keys are the
# values the frontend sends in `scopes`. Use ALL_SCOPES_KEY to mean "every
# scope below".

ALL_SCOPES_KEY = "all"


SCOPES: dict[str, dict[str, Any]] = {
    # ── 1. Module data first (these FK to tiers / assets) ────────────
    "support_tickets": {
        "label": "Tickets de support",
        "tables": [
            "DELETE FROM ticket_status_history WHERE ticket_id IN (SELECT id FROM support_tickets WHERE entity_id = :entity_id)",
            "DELETE FROM ticket_todos WHERE ticket_id IN (SELECT id FROM support_tickets WHERE entity_id = :entity_id)",
            "DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM support_tickets WHERE entity_id = :entity_id)",
            "DELETE FROM support_tickets WHERE entity_id = :entity_id",
        ],
        "count_table": "support_tickets",
    },
    "moc": {
        "label": "MOC — Management of Change",
        "tables": [
            "DELETE FROM moc_reminder_log WHERE moc_id IN (SELECT id FROM mocs WHERE entity_id = :entity_id)",
            "DELETE FROM moc_site_assignments WHERE moc_id IN (SELECT id FROM mocs WHERE entity_id = :entity_id)",
            "DELETE FROM moc_validations WHERE moc_id IN (SELECT id FROM mocs WHERE entity_id = :entity_id)",
            "DELETE FROM moc_status_history WHERE moc_id IN (SELECT id FROM mocs WHERE entity_id = :entity_id)",
            "DELETE FROM mocs WHERE entity_id = :entity_id",
        ],
        "count_table": "mocs",
    },
    "paxlog": {
        "label": "PaxLog — ADS, AVM, missions, incidents",
        "tables": [
            "DELETE FROM ads_events WHERE ads_id IN (SELECT id FROM ads WHERE entity_id = :entity_id)",
            "DELETE FROM external_access_links WHERE ads_id IN (SELECT id FROM ads WHERE entity_id = :entity_id)",
            "DELETE FROM ads_pax WHERE ads_id IN (SELECT id FROM ads WHERE entity_id = :entity_id)",
            "DELETE FROM ads_allowed_companies WHERE ads_id IN (SELECT id FROM ads WHERE entity_id = :entity_id)",
            "DELETE FROM mission_program_pax WHERE program_id IN (SELECT id FROM mission_programs WHERE entity_id = :entity_id)",
            "DELETE FROM mission_preparation_tasks WHERE notice_id IN (SELECT id FROM mission_notices WHERE entity_id = :entity_id)",
            "DELETE FROM mission_visa_followups WHERE notice_id IN (SELECT id FROM mission_notices WHERE entity_id = :entity_id)",
            "DELETE FROM mission_allowance_requests WHERE notice_id IN (SELECT id FROM mission_notices WHERE entity_id = :entity_id)",
            "DELETE FROM mission_stakeholders WHERE notice_id IN (SELECT id FROM mission_notices WHERE entity_id = :entity_id)",
            "DELETE FROM mission_programs WHERE entity_id = :entity_id",
            "DELETE FROM mission_notices WHERE entity_id = :entity_id",
            "DELETE FROM ads WHERE entity_id = :entity_id",
            "DELETE FROM pax_incidents WHERE entity_id = :entity_id",
            "DELETE FROM pax_credentials WHERE entity_id = :entity_id",
            "DELETE FROM pax_rotation_cycles WHERE entity_id = :entity_id",
            "DELETE FROM stay_programs WHERE entity_id = :entity_id",
            "DELETE FROM compliance_matrix WHERE entity_id = :entity_id",
            "DELETE FROM pax_company_groups WHERE entity_id = :entity_id",
            "DELETE FROM pax_groups WHERE entity_id = :entity_id",
        ],
        "count_table": "ads",
    },
    "voyages": {
        "label": "TravelWiz — voyages, vecteurs, manifestes",
        "tables": [
            "DELETE FROM trip_kpis WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM trip_code_access WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM voyage_events WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM weather_data WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM pickup_stop_assignments WHERE pickup_stop_id IN (SELECT ps.id FROM pickup_stops ps JOIN pickup_rounds pr ON ps.round_id = pr.id WHERE pr.entity_id = :entity_id)",
            "DELETE FROM pickup_stops WHERE round_id IN (SELECT id FROM pickup_rounds WHERE entity_id = :entity_id)",
            "DELETE FROM pickup_rounds WHERE entity_id = :entity_id",
            "DELETE FROM vector_positions WHERE vector_id IN (SELECT id FROM transport_vectors WHERE entity_id = :entity_id)",
            "DELETE FROM captain_logs WHERE manifest_id IN (SELECT m.id FROM voyage_manifests m JOIN voyages v ON m.voyage_id = v.id WHERE v.entity_id = :entity_id)",
            "DELETE FROM manifest_passengers WHERE manifest_id IN (SELECT m.id FROM voyage_manifests m JOIN voyages v ON m.voyage_id = v.id WHERE v.entity_id = :entity_id)",
            "DELETE FROM voyage_manifests WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM voyage_stops WHERE voyage_id IN (SELECT id FROM voyages WHERE entity_id = :entity_id)",
            "DELETE FROM voyages WHERE entity_id = :entity_id",
            "DELETE FROM transport_rotations WHERE entity_id = :entity_id",
            "DELETE FROM vehicle_certifications WHERE vector_id IN (SELECT id FROM transport_vectors WHERE entity_id = :entity_id)",
            "DELETE FROM transport_vector_zones WHERE vector_id IN (SELECT id FROM transport_vectors WHERE entity_id = :entity_id)",
            "DELETE FROM transport_vectors WHERE entity_id = :entity_id",
        ],
        "count_table": "voyages",
    },
    "cargo": {
        "label": "PackLog — colis, demandes, scans",
        "tables": [
            "DELETE FROM cargo_scan_events WHERE cargo_id IN (SELECT id FROM cargo_items WHERE entity_id = :entity_id)",
            "DELETE FROM cargo_attachment_evidences WHERE cargo_id IN (SELECT id FROM cargo_items WHERE entity_id = :entity_id)",
            "DELETE FROM cargo_items WHERE entity_id = :entity_id",
            "DELETE FROM cargo_requests WHERE entity_id = :entity_id",
            "DELETE FROM article_catalog WHERE entity_id = :entity_id",
            "DELETE FROM package_elements WHERE entity_id = :entity_id",
            "DELETE FROM deck_layout_items WHERE deck_layout_id IN (SELECT id FROM deck_layouts WHERE entity_id = :entity_id)",
            "DELETE FROM deck_layouts WHERE entity_id = :entity_id",
        ],
        "count_table": "cargo_items",
    },
    "planner": {
        "label": "Planner — activités et conflits",
        "tables": [
            "DELETE FROM planner_activity_dependencies WHERE predecessor_id IN (SELECT id FROM planner_activities WHERE entity_id = :entity_id) OR successor_id IN (SELECT id FROM planner_activities WHERE entity_id = :entity_id)",
            "DELETE FROM planner_conflict_audit WHERE conflict_id IN (SELECT id FROM planner_conflicts WHERE entity_id = :entity_id)",
            "DELETE FROM planner_conflict_activities WHERE conflict_id IN (SELECT id FROM planner_conflicts WHERE entity_id = :entity_id)",
            "DELETE FROM planner_conflicts WHERE entity_id = :entity_id",
            "DELETE FROM planner_scenario_activities WHERE scenario_id IN (SELECT id FROM planner_scenarios WHERE entity_id = :entity_id)",
            "DELETE FROM planner_scenarios WHERE entity_id = :entity_id",
            "DELETE FROM planner_activities WHERE entity_id = :entity_id",
        ],
        "count_table": "planner_activities",
    },
    "compliance_records": {
        "label": "Conformité — enregistrements employés",
        "tables": [
            "DELETE FROM compliance_exemptions WHERE entity_id = :entity_id",
            "DELETE FROM compliance_records WHERE entity_id = :entity_id",
        ],
        "count_table": "compliance_records",
    },
    "workflow_runtime": {
        "label": "Workflow — instances actives",
        "tables": [
            "DELETE FROM workflow_transitions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE entity_id = :entity_id)",
            "DELETE FROM workflow_instances WHERE entity_id = :entity_id",
        ],
        "count_table": "workflow_instances",
    },
    # ── 2. Projects: must come AFTER planner (planner FK → projects) ─
    "projects": {
        "label": "Projets et tâches",
        "tables": [
            "DELETE FROM project_status_history WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_situations WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_comments WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_task_dependencies WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM project_task_assignees WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM project_task_allocations WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM project_task_losses WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM project_time_entries WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM task_deliverables WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM task_actions WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM task_change_logs WHERE task_id IN (SELECT t.id FROM project_tasks t JOIN projects p ON t.project_id = p.id WHERE p.entity_id = :entity_id)",
            "DELETE FROM project_milestones WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_tasks WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM project_wbs_nodes WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM planning_revisions WHERE project_id IN (SELECT id FROM projects WHERE entity_id = :entity_id)",
            "DELETE FROM projects WHERE entity_id = :entity_id",
        ],
        "count_table": "projects",
    },
    # ── 3. Tiers (referenced by projects via tier_id but tiers also stand
    #         alone, so this can run after projects) ─────────────────────
    "tiers": {
        "label": "Tiers — sociétés et contacts",
        "tables": [
            # Polymorphic adjacencies that piggyback on tiers/contacts.
            # legal_identifiers + addresses + phones + contact_emails are
            # polymorphic on owner_type / owner_id — purge by owner.
            "DELETE FROM legal_identifiers WHERE owner_type IN ('tier','tier_contact') AND owner_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id UNION SELECT tc.id FROM tier_contacts tc JOIN tiers t ON tc.tier_id = t.id WHERE t.entity_id = :entity_id)",
            "DELETE FROM addresses WHERE owner_type IN ('tier','tier_contact') AND owner_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id UNION SELECT tc.id FROM tier_contacts tc JOIN tiers t ON tc.tier_id = t.id WHERE t.entity_id = :entity_id)",
            "DELETE FROM phones WHERE owner_type IN ('tier','tier_contact') AND owner_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id UNION SELECT tc.id FROM tier_contacts tc JOIN tiers t ON tc.tier_id = t.id WHERE t.entity_id = :entity_id)",
            "DELETE FROM contact_emails WHERE owner_type IN ('tier','tier_contact') AND owner_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id UNION SELECT tc.id FROM tier_contacts tc JOIN tiers t ON tc.tier_id = t.id WHERE t.entity_id = :entity_id)",
            "DELETE FROM tier_blocks WHERE entity_id = :entity_id",
            "DELETE FROM tier_contact_transfers WHERE from_tier_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id) OR to_tier_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id)",
            "DELETE FROM user_tier_links WHERE tier_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id)",
            "DELETE FROM tier_contacts WHERE tier_id IN (SELECT id FROM tiers WHERE entity_id = :entity_id)",
            "DELETE FROM tiers WHERE entity_id = :entity_id",
        ],
        "count_table": "tiers",
    },
    # ── 4. Assets — last (referenced by planner, projects, voyages, ...) ─
    "assets": {
        "label": "Actifs — installations et équipements",
        "tables": [
            "DELETE FROM ar_equipment_assignments WHERE equipment_id IN (SELECT id FROM ar_equipment WHERE entity_id = :entity_id)",
            "DELETE FROM ar_equipment_documents WHERE equipment_id IN (SELECT id FROM ar_equipment WHERE entity_id = :entity_id)",
            "DELETE FROM ar_equipment WHERE entity_id = :entity_id",
            "DELETE FROM ar_pipeline_waypoints WHERE pipeline_id IN (SELECT id FROM ar_pipelines WHERE entity_id = :entity_id)",
            "DELETE FROM ar_pipelines WHERE entity_id = :entity_id",
            "DELETE FROM ar_installations WHERE entity_id = :entity_id",
            "DELETE FROM ar_field_licenses WHERE field_id IN (SELECT id FROM ar_fields WHERE entity_id = :entity_id)",
            "DELETE FROM ar_sites WHERE entity_id = :entity_id",
            "DELETE FROM ar_fields WHERE entity_id = :entity_id",
        ],
        "count_table": "ar_installations",
    },
    # ── 5. Polymorphic / cross-cutting (last) ────────────────────────
    "polymorphic": {
        "label": "Pièces jointes, notes et étiquettes",
        # Only the truly entity-scoped ones — the polymorphic ones above
        # are handled inside their owning scope. attachments has
        # entity_id; the rest are bound via owner_type/owner_id.
        "tables": [
            "DELETE FROM attachments WHERE entity_id = :entity_id",
        ],
        "count_table": "attachments",
    },
    "notifications": {
        "label": "Notifications",
        "tables": [
            "DELETE FROM notifications WHERE entity_id = :entity_id",
        ],
        "count_table": "notifications",
    },
    "audit_log": {
        "label": "Journal d'audit",
        "tables": [
            "DELETE FROM audit_log WHERE entity_id = :entity_id",
        ],
        "count_table": "audit_log",
    },
}


# Phrase the user must type to confirm the destructive action.
RESET_CONFIRM_PHRASE = "RESET-ENTITY-DATA"


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ──────────────────────────────────────────────────────────────────────────────


class DemoCounts(BaseModel):
    tiers: int = Field(default=5, ge=0, le=200)
    contacts: int = Field(default=20, ge=0, le=2000)
    projects: int = Field(default=3, ge=0, le=100)
    sites: int = Field(default=3, ge=0, le=50)
    users: int = Field(default=2, ge=0, le=50)


class GenerateDemoBody(BaseModel):
    counts: DemoCounts = Field(default_factory=DemoCounts)


class GenerateDemoResponse(BaseModel):
    generated: dict[str, int]
    entity_id: UUID


class ResetTenantBody(BaseModel):
    confirm_phrase: str
    scopes: list[str] | None = Field(
        default=None,
        description=(
            "Liste de scopes à purger (voir /scopes). Si None ou ['all'], "
            "purge tous les scopes."
        ),
    )


class ResetTenantResponse(BaseModel):
    deleted: dict[str, int]
    scopes_executed: list[str]
    entity_id: UUID


class ScopeInfo(BaseModel):
    key: str
    label: str
    table_count: int


class ScopesListResponse(BaseModel):
    scopes: list[ScopeInfo]
    confirm_phrase: str


# ──────────────────────────────────────────────────────────────────────────────
# Demo data — French / Cameroonian / oil & gas
# ──────────────────────────────────────────────────────────────────────────────


_DEMO_COMPANIES: list[tuple[str, str, str]] = [
    # (name, type, industry)
    ("PERENCO Cameroun", "client", "petrole_gaz"),
    ("TotalEnergies E&P Cameroun", "client", "petrole_gaz"),
    ("Société Nationale des Hydrocarbures (SNH)", "client", "petrole_gaz"),
    ("CDR Cameroun (Chantiers Du Rhône)", "subcontractor", "btp"),
    ("Bouygues Bâtiment International", "subcontractor", "btp"),
    ("Razel-Bec Afrique Centrale", "subcontractor", "btp"),
    ("Bolloré Logistics Cameroun", "supplier", "logistique"),
    ("CMA CGM Cameroun", "supplier", "logistique"),
    ("Schlumberger Cameroun", "subcontractor", "petrole_gaz"),
    ("Halliburton Cameroon Ltd", "subcontractor", "petrole_gaz"),
    ("Baker Hughes Africa", "subcontractor", "petrole_gaz"),
    ("Société Camerounaise de Raffinage (SONARA)", "client", "petrole_gaz"),
    ("Addax Petroleum Cameroon", "client", "petrole_gaz"),
    ("Glencore Cameroun", "client", "petrole_gaz"),
    ("Eneo Cameroon S.A.", "supplier", "energie"),
    ("Camrail Société des Chemins de fer", "supplier", "logistique"),
    ("Camtainer Logistics", "supplier", "logistique"),
    ("Razgaz Industrial Services", "subcontractor", "industrie"),
    ("Tractafric Equipment", "supplier", "industrie"),
    ("SDV Logistique Cameroun", "supplier", "logistique"),
    ("Wärtsilä Cameroun SARL", "subcontractor", "industrie"),
    ("DHL Global Forwarding Cameroun", "supplier", "logistique"),
    ("Cameroon Oil Transport Company (COTCO)", "client", "petrole_gaz"),
    ("Saipem S.A.", "subcontractor", "petrole_gaz"),
    ("TechnipFMC Cameroun", "subcontractor", "petrole_gaz"),
    ("Subsea 7 Africa", "subcontractor", "petrole_gaz"),
    ("PCS Cameroun (Petroleum Construction)", "subcontractor", "btp"),
    ("Africa Oilfield Logistics", "supplier", "logistique"),
    ("Bureau Veritas Cameroun", "supplier", "controle_qualite"),
    ("SGS Cameroun", "supplier", "controle_qualite"),
]


_DEMO_FIRST_NAMES = [
    "Patrick", "Jean", "Pierre", "Paul", "Marc", "Eric", "Hervé", "Bertrand",
    "Sylvain", "Olivier", "Bernard", "Gérard", "Michel", "Christophe", "Joseph",
    "Marie-Claire", "Christine", "Brigitte", "Solange", "Carine", "Julienne",
    "Aïssatou", "Rebecca", "Estelle", "Géraldine", "Claudine",
    "Emmanuel", "Romain", "Nicolas", "Léopold", "François", "Aimé", "Désiré",
    "Aristide", "Cyrille", "Bonaventure", "Hyacinthe", "Achille",
]

_DEMO_LAST_NAMES = [
    "ABE", "ATANGANA", "BIYA", "EBOA", "EKAMBI", "ESSOMBA", "FOUDA", "MBALLA",
    "MBARGA", "NDOUMBE", "NGUEMA", "NJOYA", "NKOLO", "NTONGA", "OWONA", "PRISO",
    "TCHOUNDJEU", "WAMBA", "BOUM", "DJOMO", "ESSAMA", "KAMDEM", "MOMA", "TSAFACK",
    "DUPONT", "MARTIN", "BERNARD", "LEFEBVRE", "ROUSSEAU", "PETIT", "DURAND",
    "MOREAU", "LAURENT", "SIMON", "GIRARD", "BONNET", "FRANCOIS",
]

_DEMO_POSITIONS = [
    "Directeur des Opérations", "Chef de site", "Coordinateur HSE",
    "Responsable maintenance", "Superviseur production", "Logisticien",
    "Acheteur", "Gestionnaire de contrats", "Ingénieur procédés",
    "Ingénieur instrumentation", "Technicien méca/hydraulique", "Chef d'équipe",
    "Responsable RH", "Comptable", "Contrôleur de gestion", "Assistante de direction",
    "Coordinateur logistique", "Responsable qualité", "Auditeur interne",
    "Inspecteur QSE",
]

_DEMO_PROJECT_NAMES = [
    "Maintenance préventive plateforme Ekoundou",
    "Workover puits Kribi-7",
    "Inspection annuelle pipeline Bonny-Limbé",
    "Construction base logistique Douala-Bonabéri",
    "Audit conformité ISO 14001 SONARA",
    "Mise en service unité de traitement gaz",
    "Réhabilitation jetée pétrolière Limbé",
    "Étude HAZOP CPF Mokoko",
    "Forage de développement bloc OML-9",
    "Migration ERP comptabilité analytique",
    "Démantèlement structure offshore Yoyo",
    "Mise à niveau système ESD Bipaga",
    "Programme HSE 2026 — site Kombo",
    "Renouvellement contrat helitransport",
    "Étude impact environnemental zone marine",
]

_DEMO_PROJECT_TYPES = ["project", "workover", "drilling", "integrity", "maintenance", "inspection"]


_DEMO_SITES = [
    ("EKO", "Ekoundou", "OFFSHORE"),
    ("KRI", "Kribi", "ONSHORE"),
    ("LIM", "Limbé", "ONSHORE"),
    ("DLA", "Douala (base logistique)", "ONSHORE"),
    ("YOY", "Yoyo (FPSO)", "OFFSHORE"),
    ("BIP", "Bipaga", "ONSHORE"),
    ("MOK", "Mokoko CPF", "ONSHORE"),
    ("KOM", "Kombo", "ONSHORE"),
    ("BON", "Bonny", "OFFSHORE"),
    ("MUN", "Mungo", "ONSHORE"),
]


def _slug(value: str, max_len: int = 30) -> str:
    """Slug helper for codes — uppercase letters/numbers, dash separators."""
    out = "".join(c if c.isalnum() else "-" for c in value.upper()).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out[:max_len]


def _rand_birth() -> date:
    """Random birth date for someone aged 22–60."""
    year = datetime.now().year - random.randint(22, 60)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return date(year, month, day)


# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────


@router.get("/scopes", response_model=ScopesListResponse)
async def list_scopes(
    _: None = require_permission("core.settings.manage"),
) -> ScopesListResponse:
    """List the available reset scopes — the UI uses this to render checkboxes."""
    return ScopesListResponse(
        scopes=[
            ScopeInfo(
                key=key,
                label=cfg["label"],
                table_count=len(cfg["tables"]),
            )
            for key, cfg in SCOPES.items()
        ],
        confirm_phrase=RESET_CONFIRM_PHRASE,
    )


@router.post("/generate-demo", response_model=GenerateDemoResponse)
async def generate_demo(
    body: GenerateDemoBody,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("core.settings.manage"),
) -> GenerateDemoResponse:
    """Populate the current entity with realistic French/Cameroonian oil&gas demo data.

    Idempotent suffix: every code is suffixed with a short random token so
    re-running this never collides with prior demo runs (and never overwrites
    real data).
    """
    counts = body.counts
    suffix = secrets.token_hex(2).upper()  # e.g. "A3F7"
    generated: dict[str, int] = {
        "tiers": 0, "contacts": 0, "projects": 0, "sites": 0, "users": 0,
    }

    # ── 1. Tiers ──────────────────────────────────────────────────────────
    pool = list(_DEMO_COMPANIES)
    random.shuffle(pool)
    chosen_companies = pool[: counts.tiers]
    created_tiers: list[Tier] = []
    for idx, (name, ttype, industry) in enumerate(chosen_companies):
        code = f"{_slug(name, 20)}-{suffix}-{idx:03d}"[:50]
        tier = Tier(
            entity_id=entity_id,
            code=code,
            name=name,
            type=ttype,
            industry=industry,
            email=f"contact@{_slug(name, 15).lower()}.cm",
            phone=f"+237 6{random.randint(50, 99)} {random.randint(10, 99)} {random.randint(10, 99)} {random.randint(10, 99)}",
            city=random.choice(["Douala", "Yaoundé", "Kribi", "Limbé", "Bafoussam"]),
            country="Cameroun",
            currency="XAF",
            timezone="Africa/Douala",
            language="fr",
            description=f"[DEMO {suffix}] Société générée pour test. Type: {ttype}.",
            scope="local",
            active=True,
        )
        db.add(tier)
        created_tiers.append(tier)
    await db.flush()
    generated["tiers"] = len(created_tiers)

    # ── 2. Contacts ───────────────────────────────────────────────────────
    if counts.contacts > 0 and created_tiers:
        per_tier = max(1, counts.contacts // len(created_tiers))
        contacts_made = 0
        for tier in created_tiers:
            target = min(per_tier, counts.contacts - contacts_made)
            if target <= 0:
                break
            for k in range(target):
                first = random.choice(_DEMO_FIRST_NAMES)
                last = random.choice(_DEMO_LAST_NAMES)
                contact = TierContact(
                    tier_id=tier.id,
                    civility=random.choice(["M.", "Mme", "Dr"]),
                    first_name=first,
                    last_name=last,
                    email=f"{first.lower().replace(' ', '.')}.{last.lower()}@demo-{suffix.lower()}.cm",
                    phone=f"+237 6{random.randint(50, 99)} {random.randint(10, 99)} {random.randint(10, 99)} {random.randint(10, 99)}",
                    position=random.choice(_DEMO_POSITIONS),
                    department=random.choice(["Opérations", "HSE", "Maintenance", "Logistique", "RH", "Finance"]),
                    is_primary=(k == 0),
                    active=True,
                    birth_date=_rand_birth(),
                    nationality=random.choice(["CMR", "FRA", "GAB", "TCD", "NGA"]),
                )
                db.add(contact)
                contacts_made += 1
                if contacts_made >= counts.contacts:
                    break
            if contacts_made >= counts.contacts:
                break
        await db.flush()
        generated["contacts"] = contacts_made

    # ── 3. Sites (Field + Site) ───────────────────────────────────────────
    if counts.sites > 0:
        # One demo field per run holding all the demo sites.
        field = OilField(
            entity_id=entity_id,
            code=f"DEMO-{suffix}",
            name=f"Champ démonstration {suffix}",
            country="CMR",
            operator="DEMO Operator",
            environment="OFFSHORE",
            status="OPERATIONAL",
            notes=f"[DEMO {suffix}] Champ généré pour test.",
        )
        db.add(field)
        await db.flush()

        sites_pool = list(_DEMO_SITES)
        random.shuffle(sites_pool)
        chosen_sites = sites_pool[: counts.sites]
        for idx, (scode, sname, env) in enumerate(chosen_sites):
            code = f"{scode}-{suffix}-{idx:02d}"
            site = OilSite(
                entity_id=entity_id,
                field_id=field.id,
                code=code,
                name=f"{sname} (DEMO {suffix})",
                site_type="PRODUCTION" if env == "OFFSHORE" else "ONSHORE_PROCESSING",
                environment=env,
                country="CMR",
                manned=True,
                status="OPERATIONAL",
            )
            db.add(site)
        await db.flush()
        generated["sites"] = len(chosen_sites)

    # ── 4. Projects ──────────────────────────────────────────────────────
    if counts.projects > 0:
        names_pool = list(_DEMO_PROJECT_NAMES)
        random.shuffle(names_pool)
        for idx in range(counts.projects):
            name = names_pool[idx % len(names_pool)]
            code = f"PRJ-26-{suffix}-{idx:03d}"
            today = date.today()
            project = Project(
                entity_id=entity_id,
                code=code,
                name=f"{name} (DEMO {suffix})",
                description=f"[DEMO {suffix}] Projet généré automatiquement pour démonstration.",
                project_type=random.choice(_DEMO_PROJECT_TYPES),
                status=random.choice(["draft", "planned", "active", "active", "active"]),
                priority=random.choice(["medium", "medium", "high", "low"]),
                weather=random.choice(["sunny", "cloudy", "rainy"]),
                progress=random.randint(0, 80),
                start_date=datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc),
                end_date=datetime.combine(today + timedelta(days=random.randint(30, 180)),
                                          datetime.min.time()).replace(tzinfo=timezone.utc),
                budget=float(random.randint(50, 500)) * 1_000_000.0,  # XAF
                currency="XAF",
                manager_id=current_user.id,
                tier_id=random.choice(created_tiers).id if created_tiers else None,
                active=True,
                archived=False,
            )
            db.add(project)
            await db.flush()

            # 3-7 simple tasks per project so the Gantt has something to render
            task_count = random.randint(3, 7)
            for t_idx in range(task_count):
                task = ProjectTask(
                    project_id=project.id,
                    code=f"{code}-T{t_idx + 1:02d}",
                    title=f"Tâche {t_idx + 1} — {random.choice(['Préparation', 'Mobilisation', 'Exécution', 'Contrôle', 'Démobilisation', 'Reporting'])}",
                    status=random.choice(["todo", "in_progress", "done"]),
                    priority="medium",
                    progress=random.randint(0, 100),
                    estimated_hours=float(random.randint(8, 80)),
                    order=t_idx,
                    active=True,
                )
                db.add(task)
        await db.flush()
        generated["projects"] = counts.projects

    # ── 5. Users (test accounts inside the entity) ────────────────────────
    if counts.users > 0:
        from app.core.security import hash_password
        for idx in range(counts.users):
            first = random.choice(_DEMO_FIRST_NAMES)
            last = random.choice(_DEMO_LAST_NAMES)
            email = f"demo-{suffix.lower()}-{idx:02d}@opsflux.io"
            existing = await db.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                continue
            u = User(
                email=email,
                first_name=first,
                last_name=last,
                hashed_password=hash_password(f"Demo{suffix}!2026"),
                default_entity_id=entity_id,
                language="fr",
                active=True,
            )
            db.add(u)
        await db.flush()
        generated["users"] = counts.users

    await record_audit(
        db,
        action="generate_demo",
        resource_type="entity_data",
        resource_id=str(entity_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"counts": counts.model_dump(), "suffix": suffix, "generated": generated},
    )
    await db.commit()

    logger.info(
        "Demo data generated for entity %s by user %s — suffix=%s counts=%s",
        entity_id, current_user.id, suffix, generated,
    )
    return GenerateDemoResponse(generated=generated, entity_id=entity_id)


@router.post("/reset-tenant", response_model=ResetTenantResponse)
async def reset_tenant(
    body: ResetTenantBody,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("core.settings.manage"),
) -> ResetTenantResponse:
    """Purge ALL tenant data for the current entity (scoped).

    Safety:
    - Requires the literal confirm_phrase ``RESET-ENTITY-DATA``.
    - Wraps everything in one transaction (all-or-nothing).
    - NEVER touches users, RBAC, settings, dictionaries, i18n, MCP, file
      types, conformite types/templates, pdf_templates, workflow definitions,
      or reference sequences.
    - Audit log entry is recorded BEFORE running so it survives even when
      the audit_log scope is in the run list.
    """
    if body.confirm_phrase != RESET_CONFIRM_PHRASE:
        raise StructuredHTTPException(
            400,
            code="MAINTENANCE_INVALID_CONFIRM_PHRASE",
            message="La phrase de confirmation est invalide.",
            params={"expected": RESET_CONFIRM_PHRASE},
        )

    # Resolve scope keys → run-list. ['all'] or None means everything.
    requested = body.scopes
    if not requested or ALL_SCOPES_KEY in requested:
        run_list = list(SCOPES.keys())
    else:
        unknown = [s for s in requested if s not in SCOPES]
        if unknown:
            raise StructuredHTTPException(
                400,
                code="MAINTENANCE_UNKNOWN_SCOPE",
                message="Scope inconnu: {scope}",
                params={"scope": ", ".join(unknown)},
            )
        # Preserve dependency order — re-sort the requested list to match
        # the dict-insertion order in SCOPES so cross-scope FKs resolve.
        run_list = [k for k in SCOPES.keys() if k in requested]

    # Audit BEFORE running so it survives even if the audit_log scope is in
    # the run list. Commit it immediately so a partial failure of the purge
    # below leaves at least the trail behind.
    await record_audit(
        db,
        action="reset_tenant_start",
        resource_type="entity_data",
        resource_id=str(entity_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"scopes": run_list, "phrase_ok": True},
    )
    await db.commit()

    deleted: dict[str, int] = {}
    params = {"entity_id": str(entity_id)}

    # Run all scopes in one transaction.
    try:
        for scope_key in run_list:
            cfg = SCOPES[scope_key]
            count_before: int | None = None
            count_table = cfg.get("count_table")
            if count_table:
                # Best-effort headline count for the response. Skipped if the
                # table has no entity_id column (we just don't report a number).
                try:
                    res = await db.execute(
                        text(f"SELECT COUNT(*) FROM {count_table} WHERE entity_id = :entity_id"),
                        params,
                    )
                    count_before = int(res.scalar() or 0)
                except Exception:
                    count_before = None

            for stmt in cfg["tables"]:
                await db.execute(text(stmt), params)

            deleted[scope_key] = count_before if count_before is not None else 0

        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("reset_tenant failed for entity %s", entity_id)
        raise StructuredHTTPException(
            500,
            code="MAINTENANCE_RESET_FAILED",
            message="La réinitialisation a échoué — aucune donnée n'a été supprimée (rollback).",
        )

    # Final audit (best-effort — if the audit_log scope ran, this is the
    # first row of the new clean trail).
    await record_audit(
        db,
        action="reset_tenant_done",
        resource_type="entity_data",
        resource_id=str(entity_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"scopes": run_list, "deleted": deleted},
    )
    await db.commit()

    logger.warning(
        "Tenant data RESET for entity %s by user %s — scopes=%s deleted=%s",
        entity_id, current_user.id, run_list, deleted,
    )
    return ResetTenantResponse(
        deleted=deleted,
        scopes_executed=run_list,
        entity_id=entity_id,
    )
