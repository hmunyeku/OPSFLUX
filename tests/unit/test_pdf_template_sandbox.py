from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.core.pdf_templates import _assert_publishable_template_version
from app.core.pdf_templates import (
    render_html_from_version,
    render_pdf_from_version,
    validate_pdf_template_source,
)


def _template(**overrides):
    payload = {
        "slug": "document.export",
        "variables_schema": {"document_title": "Titre", "items": "Liste", "entity.name": "Entite"},
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def _version(**overrides):
    payload = {
        "body_html": "<h1>{{ document_title }}</h1>",
        "header_html": None,
        "footer_html": None,
        "language": "fr",
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def test_validate_pdf_template_source_detects_blocking_errors():
    result = validate_pdf_template_source(
        body_html="<div>{% if user %}<span>{{ missing_var }}</div>",
        variables_schema={"user": "Utilisateur"},
    )

    assert result["valid"] is False
    assert any(issue["level"] == "error" for issue in result["issues"])


def test_validate_pdf_template_source_reports_unknown_variables_as_warning():
    result = validate_pdf_template_source(
        body_html="<h1>{{ document_title }}</h1><p>{{ undeclared_value }}</p>",
        variables_schema={"document_title": "Titre"},
    )

    assert "undeclared_value" in result["unknown_variables"]
    assert any(issue["area"] == "variables" for issue in result["issues"])


@pytest.mark.asyncio
async def test_render_html_from_version_returns_safe_invalid_template_page():
    html = await render_html_from_version(
        _version(body_html="<div>{% if broken %}</span></div>"),
        variables={"broken": True},
    )

    assert "Template PDF invalide" in html


@pytest.mark.asyncio
async def test_render_pdf_from_version_uses_fallback_html_when_template_invalid(monkeypatch):
    captured = {}

    def fake_html_to_pdf(html, template=None):
        captured["html"] = html
        captured["template"] = template
        return b"pdf"

    monkeypatch.setattr("app.core.pdf_templates._html_to_pdf", fake_html_to_pdf)

    pdf_bytes = await render_pdf_from_version(
        _version(body_html="<div>{% if broken %}</span></div>"),
        _template(),
        variables={"broken": True},
    )

    assert pdf_bytes == b"pdf"
    assert "Template PDF invalide" in captured["html"]


def test_publishable_template_version_rejects_invalid_template():
    with pytest.raises(HTTPException) as exc:
        _assert_publishable_template_version(
            template=_template(),
            body_html="<div>{% if broken %}</span></div>",
            header_html=None,
            footer_html=None,
        )

    assert exc.value.status_code == 422
