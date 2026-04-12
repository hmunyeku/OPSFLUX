"""
Dynamic Form Engine — auto-generates mobile form definitions from Pydantic schemas.

Architecture:
  1. Pydantic schema.model_json_schema() → raw JSON Schema
  2. FormMeta enrichments → steps, labels, lookups, UI hints, conditional logic
  3. Combined → complete mobile form definition JSON

The mobile app fetches these definitions and renders forms dynamically,
so no app update is needed when forms change server-side.

Inspired by Epicollect5 but improved with:
  - Multi-field steps (not one-question-per-screen)
  - Conditional visibility (visible_when / required_when)
  - Lookup fields referencing server entities
  - Computed fields
  - Signature, photo, barcode, GPS field types
  - Optimistic versioning for offline conflict resolution
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from typing import Any, Type
from uuid import UUID

from pydantic import BaseModel


# ── Field UI Type Mapping ──────────────────────────────────────────────

# Maps JSON Schema types + formats to mobile field widget types
_JSON_SCHEMA_TO_FIELD_TYPE: dict[tuple[str, str | None], str] = {
    ("string", None): "text",
    ("string", "date"): "date",
    ("string", "date-time"): "datetime",
    ("string", "email"): "email",
    ("string", "uuid"): "text",  # overridden by lookup enrichments
    ("string", "uri"): "url",
    ("integer", None): "integer",
    ("number", None): "decimal",
    ("boolean", None): "toggle",
    ("array", None): "repeater",
    ("object", None): "group",
}

# Python type → JSON Schema format hints for better inference
_PYTHON_TYPE_HINTS: dict[type, str] = {
    UUID: "uuid",
    date: "date",
    datetime: "date-time",
}


def _infer_field_type(
    prop: dict[str, Any],
    field_name: str,
    enrichment: dict[str, Any] | None = None,
) -> str:
    """Infer the best mobile field widget type from a JSON Schema property."""
    # Enrichment override takes priority
    if enrichment and "type" in enrichment:
        return enrichment["type"]

    # Handle anyOf (Optional types in Pydantic)
    if "anyOf" in prop:
        non_null = [t for t in prop["anyOf"] if t.get("type") != "null"]
        if non_null:
            prop = non_null[0]

    schema_type = prop.get("type", "string")
    schema_format = prop.get("format")

    # Pattern-based enum detection → select/radio
    if "pattern" in prop:
        pattern = prop["pattern"]
        # Extract enum values from pattern like ^(a|b|c)$
        match = re.match(r"^\^\((.+)\)\$$", pattern)
        if match:
            return "select"

    # Enum → select
    if "enum" in prop:
        return "select"

    # Array of UUIDs → multi_lookup
    if schema_type == "array":
        items = prop.get("items", {})
        if items.get("format") == "uuid":
            return "multi_lookup"
        # Array of objects with $ref → repeater
        if "$ref" in items:
            return "repeater"
        return "tags"

    return _JSON_SCHEMA_TO_FIELD_TYPE.get(
        (schema_type, schema_format), "text"
    )


def _extract_enum_options(prop: dict[str, Any]) -> list[dict[str, str]] | None:
    """Extract enum options from a JSON Schema pattern or enum."""
    if "enum" in prop:
        return [{"value": v, "label": v} for v in prop["enum"]]

    # Handle anyOf for Optional types
    effective = prop
    if "anyOf" in prop:
        non_null = [t for t in prop["anyOf"] if t.get("type") != "null"]
        if non_null:
            effective = non_null[0]

    if "pattern" in effective:
        match = re.match(r"^\^\((.+)\)\$$", effective["pattern"])
        if match:
            values = match.group(1).split("|")
            return [{"value": v, "label": v} for v in values]
    return None


def _extract_validation(prop: dict[str, Any]) -> dict[str, Any]:
    """Extract validation rules from JSON Schema property."""
    rules: dict[str, Any] = {}

    effective = prop
    if "anyOf" in prop:
        non_null = [t for t in prop["anyOf"] if t.get("type") != "null"]
        if non_null:
            effective = non_null[0]

    if "minLength" in effective:
        rules["min_length"] = effective["minLength"]
    if "maxLength" in effective:
        rules["max_length"] = effective["maxLength"]
    if "minimum" in effective:
        rules["min"] = effective["minimum"]
    if "exclusiveMinimum" in effective:
        rules["exclusive_min"] = effective["exclusiveMinimum"]
    if "maximum" in effective:
        rules["max"] = effective["maximum"]
    if "exclusiveMaximum" in effective:
        rules["exclusive_max"] = effective["exclusiveMaximum"]
    if "pattern" in effective:
        # Don't include enum patterns as regex validation
        match = re.match(r"^\^\((.+)\)\$$", effective["pattern"])
        if not match:
            rules["pattern"] = effective["pattern"]
    return rules


def generate_form_definition(
    schema_class: Type[BaseModel],
    *,
    form_id: str,
    title: str,
    description: str = "",
    submit_endpoint: str,
    submit_method: str = "post",
    icon: str = "file-text",
    module: str = "",
    permission: str = "",
    enrichments: dict[str, dict[str, Any]] | None = None,
    steps: list[dict[str, Any]] | None = None,
    hidden_fields: list[str] | None = None,
    field_order: list[str] | None = None,
) -> dict[str, Any]:
    """
    Auto-generate a complete mobile form definition from a Pydantic schema.

    Parameters
    ----------
    schema_class:
        The Pydantic BaseModel (e.g. AdsCreate, CargoRequestCreate).
    form_id:
        Unique identifier for this form (e.g. "ads_create").
    title:
        Human-readable form title.
    description:
        Form description shown to the user.
    submit_endpoint:
        API endpoint to POST/PATCH the form data.
    submit_method:
        HTTP method (post, patch, put).
    icon:
        Icon name for the mobile app.
    module:
        Module slug this form belongs to (e.g. "paxlog").
    permission:
        Permission required to use this form.
    enrichments:
        Per-field overrides. Keys are field names, values are dicts with:
        - label: str (display label, default = field name humanized)
        - type: str (override widget type: lookup, photo, signature, barcode, etc.)
        - placeholder: str
        - help_text: str
        - lookup_source: dict (for lookup fields: entity, display, value, filter)
        - visible_when: dict (conditional visibility rule)
        - required_when: dict (conditional required rule)
        - options: list[dict] (override enum options with labels)
        - step: str (assign field to a step by step id)
        - order: int (display order within step)
        - ui_width: "full" | "half" (layout hint)
        - auto_populate_from: str (fill from another field)
        - computed_formula: str (expression for computed fields)
    steps:
        Step definitions. If not provided, all fields go in a single step.
        Each step: {"id": "...", "title": "...", "description": "...", "visible_when": {...}}
    hidden_fields:
        Fields to exclude from the form (e.g. internal server-set fields).
    field_order:
        Explicit field ordering. If not set, uses schema definition order.

    Returns
    -------
    Complete form definition dict ready to serialize as JSON.
    """
    enrichments = enrichments or {}
    hidden_fields = set(hidden_fields or [])

    # 1. Get JSON Schema from Pydantic
    json_schema = schema_class.model_json_schema()
    properties = json_schema.get("properties", {})
    required_fields = set(json_schema.get("required", []))

    # Resolve $defs references
    defs = json_schema.get("$defs", {})

    def _resolve_ref(prop: dict) -> dict:
        if "$ref" in prop:
            ref_name = prop["$ref"].rsplit("/", 1)[-1]
            return defs.get(ref_name, prop)
        return prop

    # 2. Build field definitions
    fields: dict[str, dict[str, Any]] = {}
    ordered_names = field_order or list(properties.keys())

    for idx, field_name in enumerate(ordered_names):
        if field_name in hidden_fields or field_name not in properties:
            continue

        raw_prop = properties[field_name]
        prop = _resolve_ref(raw_prop)
        enrichment = enrichments.get(field_name, {})

        field_type = _infer_field_type(prop, field_name, enrichment)
        is_required = field_name in required_fields
        is_nullable = "anyOf" in raw_prop and any(
            t.get("type") == "null" for t in raw_prop.get("anyOf", [])
        )

        field_def: dict[str, Any] = {
            "type": field_type,
            "label": enrichment.get("label", _humanize(field_name)),
            "required": is_required and not is_nullable,
            "order": enrichment.get("order", idx),
        }

        # Default value
        if "default" in raw_prop and raw_prop["default"] is not None:
            field_def["default"] = raw_prop["default"]

        # Placeholder & help
        if "placeholder" in enrichment:
            field_def["placeholder"] = enrichment["placeholder"]
        if "help_text" in enrichment:
            field_def["help_text"] = enrichment["help_text"]

        # Enum options
        options = enrichment.get("options") or _extract_enum_options(prop)
        if options:
            field_def["options"] = options

        # Validation rules
        validation = _extract_validation(prop)
        if validation:
            field_def["validation"] = validation

        # Lookup configuration
        if "lookup_source" in enrichment:
            field_def["lookup_source"] = enrichment["lookup_source"]
            if field_def["type"] == "text":
                field_def["type"] = "lookup"

        # UI hints
        if "ui_width" in enrichment:
            field_def["ui_width"] = enrichment["ui_width"]
        if "auto_populate_from" in enrichment:
            field_def["auto_populate_from"] = enrichment["auto_populate_from"]
        if "computed_formula" in enrichment:
            field_def["type"] = "computed"
            field_def["formula"] = enrichment["computed_formula"]

        # Conditional logic
        if "visible_when" in enrichment:
            field_def["visible_when"] = enrichment["visible_when"]
        if "required_when" in enrichment:
            field_def["required_when"] = enrichment["required_when"]

        # Repeater/sub-form items
        if field_type == "repeater" and "items" in prop:
            items_ref = prop["items"]
            if "$ref" in items_ref:
                ref_name = items_ref["$ref"].rsplit("/", 1)[-1]
                sub_schema = defs.get(ref_name, {})
                field_def["item_fields"] = _build_sub_fields(sub_schema, enrichment.get("item_enrichments", {}))

        fields[field_name] = field_def

    # 3. Build steps
    if steps:
        # Assign fields to steps based on enrichment or default to first step
        for fname, fdef in fields.items():
            enrichment = enrichments.get(fname, {})
            if "step" in enrichment:
                fdef["step"] = enrichment["step"]
            # If no step assigned, find by step field lists or default
        built_steps = []
        for step_def in steps:
            step_fields = step_def.get("fields", [])
            if not step_fields:
                # Auto-assign: fields with matching step id
                step_fields = [
                    fn for fn, fd in fields.items()
                    if fd.get("step") == step_def["id"]
                ]
            built_steps.append({
                "id": step_def["id"],
                "title": step_def["title"],
                "description": step_def.get("description", ""),
                "fields": step_fields,
                **({"visible_when": step_def["visible_when"]} if "visible_when" in step_def else {}),
            })
    else:
        # Single step with all fields
        built_steps = [{
            "id": "main",
            "title": title,
            "description": description,
            "fields": list(fields.keys()),
        }]

    # 4. Build version hash (changes when schema or enrichments change)
    content_hash = hashlib.sha256(
        json.dumps({"fields": fields, "steps": built_steps}, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]

    return {
        "id": form_id,
        "version": content_hash,
        "title": title,
        "description": description,
        "icon": icon,
        "module": module,
        "permission": permission,
        "submit": {
            "endpoint": submit_endpoint,
            "method": submit_method,
        },
        "steps": built_steps,
        "fields": fields,
    }


def _build_sub_fields(
    schema_props: dict[str, Any],
    enrichments: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Build field definitions for a sub-schema (repeater items)."""
    props = schema_props.get("properties", {})
    required = set(schema_props.get("required", []))
    sub_fields: dict[str, dict[str, Any]] = {}

    for idx, (fname, prop) in enumerate(props.items()):
        enrichment = enrichments.get(fname, {})
        field_type = _infer_field_type(prop, fname, enrichment)
        is_nullable = "anyOf" in prop and any(
            t.get("type") == "null" for t in prop.get("anyOf", [])
        )
        sub_fields[fname] = {
            "type": field_type,
            "label": enrichment.get("label", _humanize(fname)),
            "required": fname in required and not is_nullable,
            "order": idx,
        }
        options = _extract_enum_options(prop)
        if options:
            sub_fields[fname]["options"] = options
        validation = _extract_validation(prop)
        if validation:
            sub_fields[fname]["validation"] = validation

    return sub_fields


def _humanize(name: str) -> str:
    """Convert snake_case field name to a readable label."""
    return name.replace("_", " ").replace("id", "").strip().capitalize()


# ── Portal / Action Definitions ────────────────────────────────────────

def build_portal_config(
    *,
    portal_id: str,
    title: str,
    description: str = "",
    icon: str = "layout-dashboard",
    permissions: list[str] | None = None,
    role_slugs: list[str] | None = None,
    actions: list[dict[str, Any]],
    quick_scans: list[dict[str, Any]] | None = None,
    dashboard_cards: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Build a portal configuration for the mobile app.

    A portal is a role-based landing page with quick actions,
    scan shortcuts, and dashboard cards.
    """
    return {
        "id": portal_id,
        "title": title,
        "description": description,
        "icon": icon,
        "access": {
            "permissions": permissions or [],
            "role_slugs": role_slugs or [],
        },
        "actions": actions,
        "quick_scans": quick_scans or [],
        "dashboard_cards": dashboard_cards or [],
    }
