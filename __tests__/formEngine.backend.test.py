"""
Tests for the backend form engine — auto-generation from Pydantic schemas.

Run with: python -m pytest __tests__/formEngine.backend.test.py -v
(from the OPSFLUX root)
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from app.services.mobile.form_engine import generate_form_definition, _humanize, _extract_enum_options
from pydantic import BaseModel, Field
from datetime import date
from uuid import UUID


class SimpleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    category: str = Field(pattern=r"^(a|b|c)$")
    start_date: date
    count: int = Field(default=0, ge=0, le=999)
    active: bool = False
    project_id: UUID | None = None


def test_humanize():
    assert _humanize("first_name") == "First name"
    assert _humanize("site_entry_asset_id") == "Site entry asset"
    assert _humanize("description") == "Description"


def test_extract_enum_from_pattern():
    prop = {"pattern": "^(a|b|c)$"}
    opts = _extract_enum_options(prop)
    assert opts is not None
    assert len(opts) == 3
    assert opts[0] == {"value": "a", "label": "a"}


def test_generate_basic_form():
    result = generate_form_definition(
        SimpleCreate,
        form_id="simple_test",
        title="Test Form",
        submit_endpoint="/api/test",
    )

    assert result["id"] == "simple_test"
    assert result["title"] == "Test Form"
    assert result["submit"]["endpoint"] == "/api/test"
    assert result["submit"]["method"] == "post"
    assert "version" in result
    assert len(result["version"]) == 12  # sha256 hash truncated

    fields = result["fields"]
    assert "name" in fields
    assert "category" in fields
    assert "start_date" in fields

    # Name field
    assert fields["name"]["type"] == "text"
    assert fields["name"]["required"] is True
    assert fields["name"]["validation"]["min_length"] == 1
    assert fields["name"]["validation"]["max_length"] == 100

    # Category should be select (from pattern enum)
    assert fields["category"]["type"] == "select"
    assert len(fields["category"]["options"]) == 3

    # Date field
    assert fields["start_date"]["type"] == "date"

    # Count field with numeric bounds
    assert fields["count"]["type"] == "integer"
    assert fields["count"]["default"] == 0
    assert fields["count"]["validation"]["min"] == 0
    assert fields["count"]["validation"]["max"] == 999

    # Boolean
    assert fields["active"]["type"] == "toggle"

    # Optional UUID → should be text (no lookup enrichment)
    assert fields["project_id"]["required"] is False


def test_generate_with_steps():
    result = generate_form_definition(
        SimpleCreate,
        form_id="stepped",
        title="Stepped Form",
        submit_endpoint="/api/test",
        steps=[
            {"id": "info", "title": "Info", "fields": ["name", "description"]},
            {"id": "config", "title": "Config", "fields": ["category", "count", "active"]},
        ],
    )

    assert len(result["steps"]) == 2
    assert result["steps"][0]["id"] == "info"
    assert result["steps"][0]["fields"] == ["name", "description"]
    assert result["steps"][1]["fields"] == ["category", "count", "active"]


def test_generate_with_enrichments():
    result = generate_form_definition(
        SimpleCreate,
        form_id="enriched",
        title="Enriched",
        submit_endpoint="/api/test",
        enrichments={
            "project_id": {
                "label": "Projet",
                "type": "lookup",
                "lookup_source": {
                    "entity": "projects",
                    "endpoint": "/api/v1/projets",
                    "display": "name",
                    "value": "id",
                },
            },
            "category": {
                "label": "Catégorie",
                "options": [
                    {"value": "a", "label": "Alpha"},
                    {"value": "b", "label": "Bravo"},
                    {"value": "c", "label": "Charlie"},
                ],
            },
        },
    )

    fields = result["fields"]

    # Lookup enrichment
    assert fields["project_id"]["type"] == "lookup"
    assert fields["project_id"]["label"] == "Projet"
    assert fields["project_id"]["lookup_source"]["entity"] == "projects"

    # Label override
    assert fields["category"]["label"] == "Catégorie"
    assert fields["category"]["options"][0]["label"] == "Alpha"


def test_generate_with_hidden_fields():
    result = generate_form_definition(
        SimpleCreate,
        form_id="hidden",
        title="Hidden",
        submit_endpoint="/api/test",
        hidden_fields=["project_id", "active"],
    )

    assert "project_id" not in result["fields"]
    assert "active" not in result["fields"]
    assert "name" in result["fields"]


def test_generate_with_conditional_visibility():
    result = generate_form_definition(
        SimpleCreate,
        form_id="conditional",
        title="Conditional",
        submit_endpoint="/api/test",
        enrichments={
            "description": {
                "visible_when": {"field": "category", "op": "eq", "value": "a"},
            },
        },
    )

    assert result["fields"]["description"]["visible_when"]["field"] == "category"
    assert result["fields"]["description"]["visible_when"]["op"] == "eq"
    assert result["fields"]["description"]["visible_when"]["value"] == "a"


def test_version_changes_with_content():
    """Version hash should change when fields or steps change."""
    v1 = generate_form_definition(
        SimpleCreate, form_id="v", title="V", submit_endpoint="/api/test"
    )["version"]

    v2 = generate_form_definition(
        SimpleCreate,
        form_id="v",
        title="V",
        submit_endpoint="/api/test",
        hidden_fields=["active"],
    )["version"]

    assert v1 != v2


if __name__ == "__main__":
    test_humanize()
    test_extract_enum_from_pattern()
    test_generate_basic_form()
    test_generate_with_steps()
    test_generate_with_enrichments()
    test_generate_with_hidden_fields()
    test_generate_with_conditional_visibility()
    test_version_changes_with_content()
    print("All backend form engine tests passed!")
