"""Papyrus preset registry and bootstrap helpers."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import Installation
from app.models.common import Project, User
from app.models.papyrus import PapyrusForm
from app.models.papyrus_document import DocType, Revision, Template
from app.services.modules.papyrus_document_service import (
    create_doc_type,
    create_document,
    create_template,
)
from app.services.modules.papyrus_forms_service import create_form


def list_presets() -> list[dict[str, Any]]:
    return [
        {
            "key": "field_supervision_report",
            "name": {
                "fr": "Rapport de supervision terrain",
                "en": "Field supervision report",
            },
            "description": {
                "fr": "Kit Papyrus réutilisable pour rapports terrain structurés avec contexte, observations, tableaux d'effectifs, équipements et actions.",
                "en": "Reusable Papyrus starter kit for structured field reports with context, observations, workforce tables, equipment and actions.",
            },
            "tags": ["papyrus", "report", "field", "operations"],
            "capabilities": [
                "doc_type",
                "template",
                "form_blueprint",
                "starter_document",
            ],
        }
    ]


def _get_preset(key: str) -> dict[str, Any]:
    for preset in list_presets():
        if preset["key"] == key:
            return preset
    raise KeyError(key)


def _field_supervision_form_schema() -> dict[str, Any]:
    return {
        "version": 2,
        "kind": "structured_report",
        "profile_key": "field_supervision_report",
        "fields": [
            {"id": "section_context", "type": "section", "label": "Contexte du rapport"},
            {
                "id": "report_title",
                "type": "input_text",
                "label": "Titre du rapport",
                "required": True,
                "section": "context",
            },
            {
                "id": "report_date",
                "type": "input_date",
                "label": "Date du rapport",
                "required": True,
                "section": "context",
            },
            {"id": "report_shift", "type": "input_text", "label": "Quart / plage horaire", "section": "context"},
            {"id": "project_name", "type": "input_text", "label": "Projet", "required": True, "section": "context"},
            {"id": "project_code", "type": "input_text", "label": "Code projet", "section": "context"},
            {"id": "site_name", "type": "input_text", "label": "Site / zone", "required": True, "section": "context"},
            {"id": "workfront_area", "type": "input_text", "label": "Zone de travail / front", "section": "context"},
            {"id": "supervisor_name", "type": "input_text", "label": "Superviseur", "section": "context"},
            {"id": "company_name", "type": "input_text", "label": "Entreprise principale", "section": "context"},
            {"id": "client_name", "type": "input_text", "label": "Client / donneur d'ordre", "section": "context"},
            {"id": "permit_reference", "type": "input_text", "label": "Permis / référence", "section": "context"},
            {"id": "weather_conditions", "type": "input_text", "label": "Conditions / météo", "section": "context"},
            {"id": "progress_percent", "type": "input_number", "label": "Avancement estimé (%)", "section": "context"},
            {
                "id": "hse_topics",
                "type": "input_multiselect",
                "label": "Points HSE suivis",
                "section": "context",
                "options": [
                    {"label": "Causerie sécurité", "value": "toolbox_talk"},
                    {"label": "EPI conformes", "value": "ppe_ok"},
                    {"label": "Balisage / consignation", "value": "isolation"},
                    {"label": "Levage", "value": "lifting"},
                    {"label": "Travail en hauteur", "value": "working_at_height"},
                    {"label": "Coactivité", "value": "simultaneous_operations"},
                ],
            },
            {"id": "section_observations", "type": "section", "label": "Observations terrain"},
            {
                "id": "general_observations",
                "type": "textarea",
                "label": "Observations générales",
                "section": "observations",
            },
            {"id": "achievements", "type": "textarea", "label": "Réalisations", "section": "observations"},
            {"id": "blocking_points", "type": "textarea", "label": "Blocages", "section": "observations"},
            {
                "id": "forecast_next_steps",
                "type": "textarea",
                "label": "Prévisions / prochaines étapes",
                "section": "observations",
            },
            {"id": "safety_highlights", "type": "textarea", "label": "Sécurité / incidents", "section": "observations"},
            {
                "id": "next_day_requirements",
                "type": "textarea",
                "label": "Besoins pour la suite",
                "section": "observations",
            },
            {"id": "section_resources", "type": "section", "label": "Ressources engagées"},
            {
                "id": "personnel_table",
                "type": "input_table",
                "label": "Personnel présent",
                "section": "resources",
                "columns": [
                    {"key": "name", "label": "Nom"},
                    {"key": "company", "label": "Entreprise"},
                    {"key": "role", "label": "Fonction"},
                    {"key": "headcount", "label": "Effectif", "type": "number"},
                ],
            },
            {
                "id": "equipment_table",
                "type": "input_table",
                "label": "Équipements utilisés",
                "section": "resources",
                "columns": [
                    {"key": "designation", "label": "Équipement"},
                    {"key": "quantity", "label": "Qté", "type": "number"},
                    {
                        "key": "status",
                        "label": "État",
                        "type": "select",
                        "options": [
                            {"label": "Disponible", "value": "available"},
                            {"label": "En service", "value": "in_service"},
                            {"label": "En panne", "value": "down"},
                            {"label": "En attente", "value": "standby"},
                        ],
                    },
                    {"key": "remarks", "label": "Remarques"},
                ],
            },
            {
                "id": "incidents_table",
                "type": "input_table",
                "label": "Incidents / écarts",
                "section": "observations",
                "columns": [
                    {"key": "category", "label": "Catégorie"},
                    {"key": "description", "label": "Description"},
                    {
                        "key": "severity",
                        "label": "Sévérité",
                        "type": "select",
                        "options": [
                            {"label": "Faible", "value": "low"},
                            {"label": "Moyenne", "value": "medium"},
                            {"label": "Critique", "value": "critical"},
                        ],
                    },
                    {"key": "action_taken", "label": "Action prise"},
                ],
            },
            {"id": "section_actions", "type": "section", "label": "Actions et décisions"},
            {
                "id": "actions_table",
                "type": "input_table",
                "label": "Actions / décisions",
                "section": "actions",
                "columns": [
                    {"key": "title", "label": "Action"},
                    {"key": "owner", "label": "Responsable"},
                    {"key": "due_date", "label": "Échéance", "type": "date"},
                    {
                        "key": "status",
                        "label": "Statut",
                        "type": "select",
                        "options": [
                            {"label": "Ouvert", "value": "open"},
                            {"label": "En cours", "value": "in_progress"},
                            {"label": "Clos", "value": "closed"},
                        ],
                    },
                ],
            },
            {"id": "section_attachments", "type": "section", "label": "Preuves et photos"},
            {"id": "site_photos", "type": "input_file", "label": "Photos de terrain", "section": "attachments"},
            {"id": "safety_evidence", "type": "input_file", "label": "Preuves sécurité", "section": "attachments"},
            {
                "id": "attachments_overview",
                "type": "textarea",
                "label": "Photos / pièces jointes",
                "section": "attachments",
                "placeholder": "Décrivez les photos de terrain ou rattachez-les via le gestionnaire de pièces jointes du document.",
            },
        ],
    }


def _field_supervision_template_structure() -> dict[str, Any]:
    return {
        "version": 1,
        "meta": {
            "document_type": "report",
            "title": "Rapport de supervision terrain",
            "description": "Rapport structuré Papyrus pour supervision terrain",
            "tags": ["fieldlog", "operations", "supervision"],
        },
        "data": {
            "profile_key": "field_supervision_report",
        },
        "blocks": [
            {
                "id": "field_supervision_report_html",
                "type": "html_template",
                "template": """
<section style="font-family: Arial, sans-serif; color: #0f172a; padding: 8px 0;">
  <header style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569;">Papyrus structured report</div>
    <h1 style="margin: 4px 0 0; font-size: 24px;">{{ document.form_data.get("report_title") or document.form_data.get("project_name") or document.data.get("profile_key") or "Rapport terrain" }}</h1>
    <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px;">
      <div><div style="font-size: 11px; color: #64748b;">Date</div><div style="font-weight: 600;">{{ document.form_data.get("report_date") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Site</div><div style="font-weight: 600;">{{ document.form_data.get("site_name") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Superviseur</div><div style="font-weight: 600;">{{ document.form_data.get("supervisor_name") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Entreprise</div><div style="font-weight: 600;">{{ document.form_data.get("company_name") or "--" }}</div></div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 10px;">
      <div><div style="font-size: 11px; color: #64748b;">Projet</div><div style="font-weight: 600;">{{ document.form_data.get("project_name") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Code projet</div><div style="font-weight: 600;">{{ document.form_data.get("project_code") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Quart</div><div style="font-weight: 600;">{{ document.form_data.get("report_shift") or "--" }}</div></div>
      <div><div style="font-size: 11px; color: #64748b;">Avancement</div><div style="font-weight: 600;">{{ document.form_data.get("progress_percent") or "--" }}{% if document.form_data.get("progress_percent") %}%{% endif %}</div></div>
    </div>
  </header>

  <section style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px;">
    <div><div style="font-size: 11px; color: #64748b;">Zone de travail</div><div style="font-weight: 600;">{{ document.form_data.get("workfront_area") or "--" }}</div></div>
    <div><div style="font-size: 11px; color: #64748b;">Client</div><div style="font-weight: 600;">{{ document.form_data.get("client_name") or "--" }}</div></div>
    <div><div style="font-size: 11px; color: #64748b;">Permis / référence</div><div style="font-weight: 600;">{{ document.form_data.get("permit_reference") or "--" }}</div></div>
    <div><div style="font-size: 11px; color: #64748b;">Météo</div><div style="font-weight: 600;">{{ document.form_data.get("weather_conditions") or "--" }}</div></div>
  </section>

  {% set hse_topics = document.form_data.get("hse_topics") or [] %}
  {% if hse_topics %}
  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Points HSE suivis</h2>
    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
      {% for item in hse_topics %}
      <span style="display: inline-block; border: 1px solid #cbd5e1; border-radius: 9999px; padding: 4px 10px; font-size: 11px;">{{ item }}</span>
      {% endfor %}
    </div>
  </section>
  {% endif %}

  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Observations générales</h2>
    <div style="white-space: pre-wrap;">{{ document.form_data.get("general_observations") or "--" }}</div>
  </section>

  <section style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px;">
    <div><h3 style="font-size: 14px; margin-bottom: 6px;">Réalisations</h3><div style="white-space: pre-wrap;">{{ document.form_data.get("achievements") or "--" }}</div></div>
    <div><h3 style="font-size: 14px; margin-bottom: 6px;">Blocages</h3><div style="white-space: pre-wrap;">{{ document.form_data.get("blocking_points") or "--" }}</div></div>
    <div><h3 style="font-size: 14px; margin-bottom: 6px;">Prévisions</h3><div style="white-space: pre-wrap;">{{ document.form_data.get("forecast_next_steps") or "--" }}</div></div>
    <div><h3 style="font-size: 14px; margin-bottom: 6px;">Sécurité / incidents</h3><div style="white-space: pre-wrap;">{{ document.form_data.get("safety_highlights") or "--" }}</div></div>
  </section>

  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Besoins pour la suite</h2>
    <div style="white-space: pre-wrap;">{{ document.form_data.get("next_day_requirements") or "--" }}</div>
  </section>

  {% set personnel = document.form_data.get("personnel_table") or [] %}
  {% if personnel %}
  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Personnel présent</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Nom</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Entreprise</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Fonction</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Effectif</th>
        </tr>
      </thead>
      <tbody>
        {% for row in personnel %}
        <tr>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("name") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("company") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("role") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("headcount") or "--" }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </section>
  {% endif %}

  {% set equipment = document.form_data.get("equipment_table") or [] %}
  {% if equipment %}
  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Équipements utilisés</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Équipement</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Qté</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">État</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Remarques</th>
        </tr>
      </thead>
      <tbody>
        {% for row in equipment %}
        <tr>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("designation") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("quantity") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("status") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("remarks") or "--" }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </section>
  {% endif %}

  {% set incidents = document.form_data.get("incidents_table") or [] %}
  {% if incidents %}
  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Incidents / écarts</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Catégorie</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Description</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Sévérité</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Action prise</th>
        </tr>
      </thead>
      <tbody>
        {% for row in incidents %}
        <tr>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("category") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("description") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("severity") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("action_taken") or "--" }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </section>
  {% endif %}

  {% set actions = document.form_data.get("actions_table") or [] %}
  {% if actions %}
  <section style="margin-bottom: 18px;">
    <h2 style="font-size: 16px; margin-bottom: 8px;">Actions / décisions</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
      <thead>
        <tr>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Action</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Responsable</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Échéance</th>
          <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 6px;">Statut</th>
        </tr>
      </thead>
      <tbody>
        {% for row in actions %}
        <tr>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("title") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("owner") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("due_date") or "--" }}</td>
          <td style="border-bottom: 1px solid #e2e8f0; padding: 6px;">{{ row.get("status") or "--" }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </section>
  {% endif %}

  <section>
    <h2 style="font-size: 16px; margin-bottom: 8px;">Photos / pièces jointes</h2>
    <div style="white-space: pre-wrap;">{{ document.form_data.get("attachments_overview") or "Utilisez les pièces jointes du document pour rattacher les photos terrain." }}</div>
  </section>
</section>
""".strip(),
            }
        ],
        "refs": [],
        "render": {
            "html": True,
            "pdf": True,
            "pdf_engine": "opsflux_pdf_service",
        },
    }


async def _find_field_supervision_assets(
    *,
    entity_id: UUID,
    db: AsyncSession,
) -> tuple[DocType | None, Template | None, PapyrusForm | None]:
    doc_type = await db.scalar(
        select(DocType).where(
            DocType.entity_id == entity_id,
            DocType.code == "FSR",
        )
    )

    template = None
    if doc_type:
        template = await db.scalar(
            select(Template).where(
                Template.entity_id == entity_id,
                Template.doc_type_id == doc_type.id,
                Template.name.in_(
                    [
                        "Rapport de supervision terrain",
                        "Field supervision report",
                    ]
                ),
            )
        )

    form = None
    if doc_type:
        form = await db.scalar(
            select(PapyrusForm).where(
                PapyrusForm.entity_id == entity_id,
                PapyrusForm.doc_type_id == doc_type.id,
                PapyrusForm.document_id.is_(None),
            )
        )

    return doc_type, template, form


async def _build_field_supervision_prefill(
    *,
    project_id: UUID | None,
    title: str,
    db: AsyncSession,
) -> dict[str, Any]:
    prefill: dict[str, Any] = {
        "report_title": title,
        "report_date": date.today().isoformat(),
        "personnel_table": [],
        "equipment_table": [],
        "incidents_table": [],
        "actions_table": [],
    }
    if not project_id:
        return prefill

    project = await db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        return prefill

    prefill["project_name"] = project.name
    prefill["project_code"] = getattr(project, "code", None)

    if getattr(project, "asset_id", None):
        installation = await db.scalar(select(Installation).where(Installation.id == project.asset_id))
        if installation:
            prefill["site_name"] = installation.name

    if getattr(project, "manager_id", None):
        manager = await db.scalar(select(User).where(User.id == project.manager_id))
        if manager:
            full_name = " ".join(
                part for part in [getattr(manager, "first_name", None), getattr(manager, "last_name", None)] if part
            ).strip()
            prefill["supervisor_name"] = full_name or getattr(manager, "email", None) or ""

    return prefill


async def instantiate_preset(
    *,
    preset_key: str,
    entity_id: UUID,
    created_by: UUID,
    body: Any,
    db: AsyncSession,
) -> dict[str, Any]:
    from fastapi import HTTPException

    if preset_key != "field_supervision_report":
        raise KeyError(preset_key)

    preset = _get_preset(preset_key)
    language = getattr(body, "language", None) or "fr"
    classification = getattr(body, "classification", None) or "INT"
    project_id = getattr(body, "project_id", None)

    if getattr(body, "create_document", True) and not project_id:
        raise HTTPException(
            status_code=400,
            detail="Le preset 'Field supervision report' requiert un projet. Sélectionnez un projet avant de créer le kit.",
        )

    doc_type, template, form = await _find_field_supervision_assets(entity_id=entity_id, db=db)

    if not doc_type:
        doc_type = await create_doc_type(
            body=SimpleNamespace(
                code="FSR",
                name=preset["name"],
                nomenclature_pattern="{ENTITY}-{DOCTYPE}-{SEQ:4}",
                discipline="OPS",
                default_template_id=None,
                default_workflow_id=None,
                default_language=language,
                revision_scheme="numeric",
            ),
            entity_id=entity_id,
            created_by=created_by,
            db=db,
        )

    if not template:
        template = await create_template(
            body=SimpleNamespace(
                name=preset["name"].get(language) or preset["name"].get("fr") or "Field supervision report",
                description=preset["description"].get(language) or preset["description"].get("fr"),
                doc_type_id=doc_type.id,
                structure=_field_supervision_template_structure(),
                styles={"preset_key": preset_key},
            ),
            entity_id=entity_id,
            created_by=created_by,
            db=db,
        )

    if doc_type.default_template_id != template.id:
        doc_type.default_template_id = template.id
        await db.commit()
        await db.refresh(doc_type)

    doc_type_id = doc_type.id
    doc_type_code = doc_type.code
    doc_type_name = doc_type.name
    template_id = template.id
    template_name = template.name
    template_doc_type_id = template.doc_type_id
    template_version = template.version
    form_id = form.id if form else None
    form_name = form.name if form else None
    form_document_id = form.document_id if form else None
    form_doc_type_id = form.doc_type_id if form else None
    default_template_id = doc_type.default_template_id

    if not form:
        form = await create_form(
            entity_id=entity_id,
            created_by=created_by,
            body=SimpleNamespace(
                document_id=None,
                doc_type_id=doc_type_id,
                name=preset["name"].get(language) or preset["name"].get("fr") or "Field supervision report",
                description=preset["description"].get(language) or preset["description"].get("fr"),
                form_schema=_field_supervision_form_schema(),
                settings_json={
                    "preset_key": preset_key,
                    "scope": "doc_type",
                },
            ),
            db=db,
        )
        form_id = form.id
        form_name = form.name
        form_document_id = form.document_id
        form_doc_type_id = form.doc_type_id

    document = None
    document_payload = None
    if getattr(body, "create_document", True):
        document_title = (
            getattr(body, "title", None)
            or preset["name"].get(language)
            or preset["name"].get("fr")
            or "Field supervision report"
        )
        document = await create_document(
            body=SimpleNamespace(
                doc_type_id=doc_type_id,
                project_id=project_id,
                arborescence_node_id=None,
                title=document_title,
                language=language,
                classification=classification,
                free_parts={},
            ),
            entity_id=entity_id,
            bu_id=None,
            created_by=created_by,
            db=db,
        )
        document_payload = {
            "id": str(document.id),
            "number": document.number,
            "title": document.title,
            "doc_type_id": str(document.doc_type_id),
        }
        revision = await db.get(Revision, document.current_revision_id) if document.current_revision_id else None
        if revision:
            revision.form_data = await _build_field_supervision_prefill(
                project_id=project_id,
                title=document_title,
                db=db,
            )
            await db.commit()

    return {
        "preset": preset,
        "doc_type": {
            "id": str(doc_type_id),
            "code": doc_type_code,
            "name": doc_type_name,
            "default_template_id": str(default_template_id) if default_template_id else None,
        },
        "template": {
            "id": str(template_id),
            "name": template_name,
            "doc_type_id": str(template_doc_type_id) if template_doc_type_id else None,
            "version": template_version,
        },
        "form": {
            "id": str(form_id),
            "name": form_name,
            "document_id": str(form_document_id) if form_document_id else None,
            "doc_type_id": str(form_doc_type_id) if form_doc_type_id else None,
        },
        "document": document_payload,
    }
