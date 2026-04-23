"""PDF template rendering engine.

Resolves, renders, and generates PDF documents from HTML templates:
  1. Looks up the published PdfTemplateVersion for a slug + entity + language
  2. Renders body_html (+ optional header/footer) with Jinja2 variable substitution
  3. Converts rendered HTML to PDF using WeasyPrint
  4. Returns bytes (PDF content) or rendered HTML (for admin preview)

If no template is found or template is disabled, returns None -- the caller
decides whether to skip the action or fall back.

Usage:
    pdf_bytes = await render_pdf(
        db=db,
        slug="ads.ticket",
        entity_id=entity_id,
        language="fr",
        variables={"reference": "ADS-2026-001", "passengers": [...]},
    )
    if pdf_bytes is None:
        # Template not configured
        pass
"""

import base64
import io
import logging
import re
from datetime import UTC, datetime
from html.parser import HTMLParser
from uuid import UUID

from jinja2 import BaseLoader, Environment, TemplateSyntaxError, Undefined, meta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.common import PdfTemplate, PdfTemplateVersion

logger = logging.getLogger(__name__)

# Jinja2 env with sandboxed auto-escape (safe for HTML → PDF)
_jinja_env = Environment(
    loader=BaseLoader(),
    autoescape=True,
    undefined=Undefined,  # missing vars render as empty string
)


# ── QR code helper ───────────────────────────────────────────────────────

def generate_qr_base64(data: str, box_size: int = 6, border: int = 2) -> str:
    """Generate a QR code PNG encoded as a base64 data URI.

    Returns a string like 'data:image/png;base64,...' suitable for <img src="...">.
    """
    try:
        import qrcode
        from qrcode.image.pil import PilImage

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img: PilImage = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except ImportError:
        logger.warning("qrcode library not installed -- QR codes will be empty")
        return ""
    except Exception:
        logger.exception("Failed to generate QR code for data=%s", data[:50])
        return ""


def build_image_tag(
    src: str | None,
    alt: str = "",
    width: int | None = None,
    height: int | None = None,
    css_class: str | None = None,
) -> str:
    """Return a small HTML img tag string for template usage."""
    if not src:
        return ""
    attrs = [f'src="{src}"', f'alt="{alt}"']
    if width and width > 0:
        attrs.append(f'width="{int(width)}"')
    if height and height > 0:
        attrs.append(f'height="{int(height)}"')
    if css_class:
        attrs.append(f'class="{css_class}"')
    return f"<img {' '.join(attrs)} />"


def build_link_tag(
    href: str | None,
    label: str | None = None,
    css_class: str | None = None,
) -> str:
    """Return a small HTML anchor tag string for template usage."""
    if not href:
        return ""
    text = label or href
    attrs = [f'href="{href}"']
    if css_class:
        attrs.append(f'class="{css_class}"')
    return f"<a {' '.join(attrs)}>{text}</a>"


TEMPLATE_GLOBAL_HELPERS = {
    "qr_code": generate_qr_base64,
    "image_tag": build_image_tag,
    "link_tag": build_link_tag,
}
_jinja_env.globals.update(TEMPLATE_GLOBAL_HELPERS)


class _TemplateHtmlValidator(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.issues: list[dict[str, str]] = []
        self._stack: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self._stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            return
        if not self._stack:
            self.issues.append({"level": "error", "area": "html", "message": f"Balise de fermeture inattendue </{tag}>."})
            return
        expected = self._stack.pop()
        if expected != tag:
            self.issues.append({"level": "error", "area": "html", "message": f"Balises mal imbriquees: attendu </{expected}> mais trouve </{tag}>."})

    def close(self) -> None:
        super().close()
        while self._stack:
            tag = self._stack.pop()
            self.issues.append({"level": "error", "area": "html", "message": f"Balise non fermee <{tag}>."})


def validate_pdf_template_source(
    *,
    body_html: str,
    header_html: str | None = None,
    footer_html: str | None = None,
    variables_schema: dict | None = None,
) -> dict[str, object]:
    issues: list[dict[str, str]] = []
    declared = set(variables_schema.keys()) if variables_schema else set()
    referenced: set[str] = set()

    sections = [
        ("body", body_html or ""),
        ("header", header_html or ""),
        ("footer", footer_html or ""),
    ]

    for area, source in sections:
        if not source.strip():
            continue
        try:
            ast = _jinja_env.parse(source)
            referenced.update(meta.find_undeclared_variables(ast))
        except TemplateSyntaxError as exc:
            issues.append({"level": "error", "area": area, "message": f"Syntaxe template invalide: {exc.message} (ligne {exc.lineno})."})
            continue
        except Exception as exc:
            issues.append({"level": "error", "area": area, "message": f"Template invalide: {exc}."})
            continue

        parser = _TemplateHtmlValidator()
        try:
            parser.feed(source)
            parser.close()
            issues.extend(parser.issues)
        except Exception as exc:
            issues.append({"level": "warning", "area": area, "message": f"Analyse HTML incomplete: {exc}."})

        style_blocks = re.findall(r"<style[^>]*>(.*?)</style>", source, flags=re.IGNORECASE | re.DOTALL)
        for css in style_blocks:
            if css.count("{") != css.count("}"):
                issues.append({"level": "error", "area": "css", "message": f"Accolades CSS non equilibrees dans {area}."})
            if css.count("(") != css.count(")"):
                issues.append({"level": "warning", "area": "css", "message": f"Parentheses CSS non equilibrees dans {area}."})

    helper_names = set(TEMPLATE_GLOBAL_HELPERS.keys())
    unknown = sorted(
        var_name for var_name in referenced
        if var_name not in helper_names
        and var_name not in declared
        and not any(declared_name.startswith(f"{var_name}.") for declared_name in declared)
    )
    for var_name in unknown:
        issues.append({"level": "warning", "area": "variables", "message": f"Variable non déclarée dans le schéma : {var_name}."})

    return {
        "valid": not any(issue["level"] == "error" for issue in issues),
        "issues": issues,
        "referenced_variables": sorted(referenced),
        "unknown_variables": unknown,
    }


def _build_invalid_template_html(*, title: str, issues: list[dict[str, str]]) -> str:
    items = "".join(
        f"<li><strong>{issue['area']}</strong> - {issue['message']}</li>"
        for issue in issues
    )
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <style>
    body {{ font-family: Arial, Helvetica, sans-serif; color: #1f2937; padding: 24px; }}
    .box {{ border: 2px solid #dc2626; background: #fef2f2; border-radius: 8px; padding: 20px; }}
    h1 {{ color: #991b1b; font-size: 20px; margin: 0 0 12px 0; }}
    p {{ margin: 0 0 10px 0; }}
    ul {{ margin: 12px 0 0 18px; padding: 0; }}
    li {{ margin: 6px 0; }}
  </style>
</head>
<body>
  <div class="box">
    <h1>{title}</h1>
    <p>Le modèle PDF publié contient des erreurs bloquantes. Le document d'origine n'a pas été exécuté comme template libre.</p>
    <p>Diagnostics :</p>
    <ul>{items or '<li>Aucun detail disponible.</li>'}</ul>
  </div>
</body>
</html>"""


def _has_rendered_qr_markup(section_html: str | None) -> bool:
    if not section_html:
        return False
    normalized = section_html.lower()
    return (
        "data:image/png;base64" in normalized
        or 'alt="qr code"' in normalized
        or "scan-label" in normalized
        or "qr-fallback" in normalized
    )


def _ensure_ads_ticket_operational_elements(
    *,
    body_html: str,
    header_html: str | None,
    footer_html: str | None,
    variables: dict | None,
) -> tuple[str, str | None, str | None]:
    ctx = variables or {}
    qr_payload = ctx.get("qr_data") or ctx.get("reference")
    if not isinstance(qr_payload, str) or not qr_payload.strip():
        return body_html, header_html, footer_html

    if any(_has_rendered_qr_markup(section) for section in (body_html, header_html, footer_html)):
        return body_html, header_html, footer_html

    qr_label = "Scanner pour pointage embarquement"
    qr_link = ctx.get("qr_url") or qr_payload
    qr_image = generate_qr_base64(qr_payload)
    if not qr_image:
        return body_html, header_html, footer_html

    fallback_panel = f"""
<section class="qr-fallback" style="margin-top:12px;padding:12px;border:1px dashed #94a3b8;border-radius:10px;background:#f8fafc;">
  <div style="display:flex;align-items:center;gap:14px;">
    <img src="{qr_image}" alt="QR Code" style="width:96px;height:96px;flex:0 0 auto;border:1px solid #e2e8f0;background:#fff;padding:4px;border-radius:8px;" />
    <div style="min-width:0;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;">{qr_label}</div>
      <div style="margin-top:4px;font-size:12px;color:#334155;">Ce QR ouvre directement la fiche de scan terrain pour confirmer les personnes reellement montees.</div>
      <div style="margin-top:6px;font-size:10px;word-break:break-all;color:#64748b;">{qr_link}</div>
    </div>
  </div>
</section>"""
    return f"{body_html}{fallback_panel}", header_html, footer_html


def _ensure_packlog_lt_operational_elements(
    *,
    body_html: str,
    header_html: str | None,
    footer_html: str | None,
    variables: dict | None,
) -> tuple[str, str | None, str | None]:
    ctx = variables or {}
    qr_payload = ctx.get("request_qr_data") or ctx.get("request_code")
    if not isinstance(qr_payload, str) or not qr_payload.strip():
        return body_html, header_html, footer_html

    if any(_has_rendered_qr_markup(section) for section in (body_html, header_html, footer_html)):
        return body_html, header_html, footer_html

    qr_link = ctx.get("request_qr_url") or qr_payload
    qr_image = generate_qr_base64(qr_payload)
    if not qr_image:
        return body_html, header_html, footer_html

    fallback_panel = f"""
<section class="qr-fallback" style="margin-top:10px;padding:8px 10px;border:1px solid #333;">
  <div style="display:flex;align-items:center;gap:12px;">
    <img src="{qr_image}" alt="QR Code" style="width:72px;height:72px;flex:0 0 auto;border:1px solid #999;background:#fff;padding:3px;" />
    <div style="min-width:0;">
      <div style="font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#111;">Scanner pour ouvrir la demande d'expedition</div>
      <div style="margin-top:3px;font-size:7.5pt;color:#333;">Ce QR ouvre la fiche PackLog de la lettre de transport.</div>
      <div style="margin-top:4px;font-size:7pt;word-break:break-all;color:#666;">{qr_link}</div>
    </div>
  </div>
</section>"""
    return f"{body_html}{fallback_panel}", header_html, footer_html


def _build_pdf_document_html(
    *,
    body_html: str,
    header_html: str | None = None,
    footer_html: str | None = None,
    template: "PdfTemplate | None" = None,
) -> str:
    mt = max(0, min(int(getattr(template, "margin_top", 15) or 15), 100))
    mr = max(0, min(int(getattr(template, "margin_right", 12) or 12), 100))
    mb = max(0, min(int(getattr(template, "margin_bottom", 15) or 15), 100))
    ml = max(0, min(int(getattr(template, "margin_left", 12) or 12), 100))

    has_header = bool((header_html or "").strip())
    has_footer = bool((footer_html or "").strip())
    reserved_header_mm = 16 if has_header else 0
    reserved_footer_mm = 14 if has_footer else 0

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <style>
    html, body {{
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    .pdf-shell {{
      position: relative;
      min-height: 100%;
      box-sizing: border-box;
      padding-top: {reserved_header_mm}mm;
      padding-bottom: {reserved_footer_mm}mm;
    }}
    .pdf-header {{
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      box-sizing: border-box;
      min-height: {reserved_header_mm}mm;
      padding: 0 {mr}mm 2mm {ml}mm;
      z-index: 20;
    }}
    .pdf-footer {{
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      box-sizing: border-box;
      min-height: {reserved_footer_mm}mm;
      padding: 2mm {mr}mm 0 {ml}mm;
      z-index: 20;
    }}
    .pdf-body {{
      box-sizing: border-box;
      width: 100%;
    }}
  </style>
</head>
<body>
  {f'<div class="pdf-header">{header_html}</div>' if has_header else ''}
  {f'<div class="pdf-footer">{footer_html}</div>' if has_footer else ''}
  <main class="pdf-shell">
    <div class="pdf-body">{body_html}</div>
  </main>
</body>
</html>"""


# ── Known template slugs with default variable schemas ────────────────────
# These are seeded on first migration / seed endpoint.

DEFAULT_PDF_TEMPLATES: list[dict] = [
    {
        "slug": "ads.ticket",
        "name": "ADS Ticket / Boarding Pass",
        "description": "Travel ticket for AdS (Avis de séjour). "
                       "Used as boarding pass for helicopter, boat, or vehicle transport.",
        "object_type": "ads",
        "page_size": "A5",
        "orientation": "landscape",
        "margin_top": 8,
        "margin_right": 8,
        "margin_bottom": 8,
        "margin_left": 8,
        "variables_schema": {
            "reference": "ADS reference number (e.g. ADS-2026-001)",
            "entity.name": "Entity name",
            "entity.code": "Entity code",
            "departure_date": "Departure date (formatted)",
            "return_date": "Return date (formatted, optional)",
            "departure_base": "Departure base name",
            "destination_site": "Destination site name",
            "transport_mode": "Transport mode (helicopter / boat / vehicle)",
            "visit_purpose": "Purpose of the visit",
            "visit_category": "Visit category (routine / emergency / VIP)",
            "approval_status": "Approval status (approved / pending / rejected)",
            "approver_name": "Full name of the approver",
            "approved_at": "Approval timestamp",
            "passengers": "List of passenger objects [{name, first_name, last_name, company, badge_number, compliance_status (ok/blocked), compliant (bool), status, type}]",
            "generated_at": "PDF generation timestamp",
            "qr_data": "Data to encode in QR code (defaults to reference)",
            "qr_url": "Operational QR target URL for boarding scan",
        },
        "default_versions": {
            "fr": {
                "body_html": "",  # patched below
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",  # patched below
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "ads.manifest",
        "name": "ADS Passenger Manifest",
        "description": "Full manifest of passengers for an ADS voyage. "
                       "Designed for A4 portrait printing.",
        "object_type": "ads",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
        "variables_schema": {
            "reference": "ADS reference number",
            "entity.name": "Entity name",
            "departure_date": "Departure date",
            "departure_base": "Departure base",
            "destination_site": "Destination site",
            "transport_mode": "Transport mode",
            "passengers": "List of passenger dicts with name, company, badge_number, compliance_status, seat_number",
            "total_passengers": "Total passenger count",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "document.export",
        "name": "Document Export (Papyrus)",
        "description": "Export a Papyrus document as a styled PDF.",
        "object_type": "document",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 20,
        "margin_right": 15,
        "margin_bottom": 20,
        "margin_left": 15,
        "variables_schema": {
            "document_number": "Document reference number",
            "document_title": "Document title",
            "document_body": "HTML body content of the document",
            "author_name": "Author full name",
            "revision": "Revision number",
            "status": "Document status",
            "entity.name": "Entity name",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "avm.ticket",
        "name": "AVM Mission Notice",
        "description": "Mission notice summary for AVM (Avis de Mission).",
        "object_type": "avm",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
        "variables_schema": {
            "reference": "AVM reference number",
            "title": "Mission title",
            "description": "Mission description",
            "status": "Mission status",
            "mission_type": "Mission type",
            "planned_start_date": "Planned mission start date",
            "planned_end_date": "Planned mission end date",
            "creator_name": "Mission creator full name",
            "pax_quota": "Planned pax quota",
            "requires_badge": "Whether site badge is required",
            "requires_epi": "Whether PPE is required",
            "requires_visa": "Whether visa is required",
            "eligible_displacement_allowance": "Whether mission is eligible to displacement allowance",
            "preparation_progress": "Preparation progress percentage",
            "open_preparation_tasks": "Open preparation tasks count",
            "programs": "Mission program lines",
            "generated_ads_references": "Generated AdS references",
            "entity.name": "Entity name",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "voyage.manifest",
        "name": "TravelWiz Voyage Manifest",
        "description": "Passenger manifest for a TravelWiz voyage (flight, boat, vehicle).",
        "object_type": "voyage",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
        "variables_schema": {
            "voyage_number": "Voyage reference number",
            "entity.name": "Entity name",
            "transport_type": "Transport type (helicopter / boat / vehicle)",
            "carrier": "Carrier / operator name",
            "vector_name": "Vector name",
            "vector_type": "Vector type (helicopter / ship / vehicle)",
            "vector_registration": "Vector registration number",
            "vector_mode": "Vector mode (air / sea / road)",
            "departure_date": "Departure date and time",
            "departure_location": "Departure location",
            "arrival_location": "Arrival location",
            "route": "Human-readable route string (A -> B -> C)",
            "stops": "List of intermediate stop dicts",
            "captain_name": "Captain full name",
            "co_pilot_name": "Co-pilot full name",
            "weather": "Latest weather dict (wind, sea, visibility, etc.)",
            "passengers": "List of passenger dicts (seat_number, name, company, badge_number, declared_weight_kg, actual_weight_kg, emergency_contact, compliance_status)",
            "total_passengers": "Total passenger count",
            "total_declared_weight_kg": "Sum of declared passenger weights",
            "total_actual_weight_kg": "Sum of actual passenger weights",
            "max_capacity": "Maximum capacity",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "voyage.cargo_manifest",
        "name": "TravelWiz Cargo Manifest",
        "description": "Cargo manifest for a TravelWiz voyage, including package list and weights.",
        "object_type": "travelwiz",
        "page_size": "A4",
        "orientation": "landscape",
        "margin_top": 12,
        "margin_right": 10,
        "margin_bottom": 12,
        "margin_left": 10,
        "variables_schema": {
            "voyage_number": "Voyage reference number",
            "entity.name": "Entity name",
            "transport_type": "Transport type",
            "carrier": "Carrier / operator name",
            "vector_name": "Vector name",
            "vector_type": "Vector type",
            "vector_registration": "Vector registration",
            "vector_weight_capacity_kg": "Vector total weight capacity (kg)",
            "departure_date": "Departure date and time",
            "departure_location": "Departure location",
            "arrival_location": "Arrival location",
            "route": "Human-readable route string",
            "captain_name": "Captain full name",
            "cargo_items": "List of cargo dicts (reference, request_code, designation, sender_name, receiver_name, destination_name, weight_kg, volume_m3, package_count, is_hazmat, hazmat_class, hazmat_un_number, is_urgent, handling_notes, status_label)",
            "total_cargo_items": "Total cargo item count",
            "total_weight_kg": "Total cargo weight (kg)",
            "total_volume_m3": "Total cargo volume (m3)",
            "total_packages": "Total package count",
            "hazmat_count": "Number of hazmat cargo items",
            "urgent_count": "Number of urgent cargo items",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "cargo.lt",
        "name": "Lettre de Transport Cargo",
        "description": "Printable shipping request / transport letter for validated cargo operations.",
        "object_type": "travelwiz",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 14,
        "margin_right": 12,
        "margin_bottom": 14,
        "margin_left": 12,
        "variables_schema": {
            "request_code": "Shipping request reference",
            "request_title": "Shipping request title",
            "request_status": "Shipping request status",
            "entity.name": "Entity name",
            "sender_name": "Sender company name",
            "sender_address": "Sender full address (multiline)",
            "receiver_name": "Receiver name",
            "destination_name": "Destination installation name",
            "requester_name": "Requester name",
            "sender_contact_name": "Sender contact person name",
            "description": "Shipping request description",
            "imputation_reference": "Imputation reference",
            "request_qr_data": "QR target URL for the transport request",
            "request_qr_url": "PackLog request URL",
            "request_ready": "Whether the request is complete and ready",
            "request_missing_requirements": "Missing request requirements",
            "cargo_items": "List of cargo items with dimensions, hazmat, pickup info",
            "total_cargo_items": "Total cargo item count",
            "total_weight_kg": "Total cargo weight",
            "total_volume_m3": "Total cargo volume in cubic metres",
            "total_packages": "Total package count",
            "has_hazmat": "Whether any cargo item is hazmat",
            "transport_voyage_code": "Voyage code if cargo is loaded on a voyage",
            "transport_vector_name": "Transport vector name",
            "transport_vector_registration": "Transport vector registration",
            "status_breakdown": "Cargo status counters",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "project.report",
        "name": "Rapport de projet",
        "description": "Rapport PDF complet d'un projet : fiche, tâches, jalons, WBS.",
        "object_type": "project",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
        "variables_schema": {
            "project.code": "Code du projet",
            "project.name": "Nom du projet",
            "project.status": "Statut",
            "project.priority": "Priorité",
            "project.progress": "Pourcentage d'avancement",
            "project.weather": "Météo du projet",
            "project.start_date": "Date de début",
            "project.end_date": "Date de fin prévue",
            "project.budget": "Budget",
            "project.description": "Description",
            "project.manager_name": "Chef de projet",
            "tasks": "Liste des tâches [{title, status, priority, progress, start, end}]",
            "milestones": "Liste des jalons [{name, due_date, status}]",
            "wbs_nodes": "Nœuds WBS [{code, name, budget}]",
            "task_count": "Nombre de tâches",
            "milestone_count": "Nombre de jalons",
            "generated_at": "Date de génération",
        },
        "default_versions": {
            "fr": {
                "body_html": "",  # patched below
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",  # patched below
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "pid.export",
        "name": "PID/PFD Export",
        "description": "Export PDF d'un schema PID/PFD avec rendu du canvas SVG.",
        "object_type": "document",
        "page_size": "A3",
        "orientation": "landscape",
        "margin_top": 10,
        "margin_right": 10,
        "margin_bottom": 10,
        "margin_left": 10,
        "variables_schema": {
            "pid_number": "Numéro du document PID",
            "pid_title": "Titre du PID",
            "revision": "Révision courante",
            "drawing_number": "Numéro de dessin",
            "status": "Statut du document",
            "sheet_format": "Format de feuille",
            "svg_content": "Contenu SVG du schéma",
            "generated_at": "Date de génération",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "planner.gantt_export",
        "name": "Planner Gantt Export",
        "description": "Export PDF A3 paysage du Gantt du Planner (capture image + meta).",
        "object_type": "system",
        "page_size": "A3",
        "orientation": "landscape",
        "margin_top": 10,
        "margin_right": 10,
        "margin_bottom": 10,
        "margin_left": 10,
        "variables_schema": {
            "title": "Titre du document",
            "subtitle": "Sous-titre / portée",
            "date_range": "Plage de dates affichée",
            "scale": "Échelle (jour / semaine / mois / ...)",
            "image_data_uri": "Image base64 du Gantt (data:image/png;base64,...)",
            "generated_at": "Date de génération",
            "generated_by": "Utilisateur ayant généré le PDF",
            "entity.name": "Nom de l'entité",
        },
        "default_versions": {
            "fr": {
                "body_html": "",  # patched below
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        "slug": "packlog.cargo_label",
        "name": "PackLog Cargo Label",
        "description": (
            "Physical label affixed to each cargo item, scannable by the "
            "mobile app to capture GPS + status changes. 10×15 cm."
        ),
        "object_type": "cargo",
        # A6 (105×148mm) — closest ISO size to the 100×150mm standard
        # shipping-label format. Renders cleanly on most thermal printers.
        "page_size": "A6",
        "orientation": "portrait",
        "margin_top": 5,
        "margin_right": 5,
        "margin_bottom": 5,
        "margin_left": 5,
        "variables_schema": {
            "tracking_code": "Unique cargo tracking code (QR payload)",
            "reference": "Human-readable cargo reference",
            "description": "Cargo description",
            "cargo_type": "Cargo type (GENERAL, REFRIG, HAZMAT, ...)",
            "weight_kg": "Cargo weight in kg",
            "sender_name": "Sender tier name",
            "recipient_name": "Recipient name",
            "destination_name": "Destination installation name",
            "hazmat": "Whether the cargo is hazardous (bool)",
            "request_code": "Cargo request (LT) reference if any",
            "qr_code_data_uri": "Base64-encoded QR code PNG data URI",
            "entity.name": "Entity name",
            "generated_at": "Generation timestamp",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
    {
        # Rapport MOC — réplique du Formulaire MOC (rev. 06, oct. 2025).
        # Un seul PDF couvre : demande, revue hiérarchie, accord chef de site,
        # étude process, matrice de validation parallèle, accords DO/DG.
        "slug": "moc.report",
        "name": "Rapport MOC",
        "description": (
            "Formulaire complet d'un MOC — demande, revues, matrice de "
            "validation, accords DO/DG — au format du formulaire standard."
        ),
        "object_type": "moc",
        "page_size": "A4",
        "orientation": "portrait",
        "margin_top": 15,
        "margin_right": 12,
        "margin_bottom": 15,
        "margin_left": 12,
        "variables_schema": {
            "reference": "Référence MOC (MOC_NNN_PF)",
            "status_label": "Statut actuel humanisé",
            "moc_type_label": "Libellé du type de MOC (ou '—')",
            "site_label": "Site (RDR East / RDR West / …)",
            "platform_code": "Code plateforme",
            "initiator_display": "Nom du demandeur",
            "initiator_function": "Fonction du demandeur",
            "created_at": "Date de création (formatée)",
            "objectives": "Objectif(s) des modifications",
            "description": "Description complète (markdown → HTML)",
            "current_situation": "Situation actuelle (markdown → HTML)",
            "proposed_changes": "Modifications proposées (markdown → HTML)",
            "impact_analysis": "Analyse d'impact (markdown → HTML)",
            "modification_type_label": "Permanent / Temporaire",
            "temporary_start_date": "Date début si temporaire",
            "temporary_end_date": "Date fin si temporaire",
            "is_real_change": "Booléen revue hiérarchie",
            "hierarchy_review_comment": "Commentaire revue hiérarchie",
            "site_chief_approved": "Accord chef de site",
            "site_chief_display": "Nom chef de site",
            "site_chief_approved_at": "Date approbation CDS",
            "site_chief_comment": "Commentaire CDS",
            "director_display": "Nom directeur",
            "director_confirmed_at": "Date confirmation directeur",
            "director_comment": "Commentaire directeur",
            "priority": "Priorité (1/2/3)",
            "estimated_cost_mxaf": "Coût estimé (MXAF)",
            "cost_bucket_label": "Tranche de coût",
            "validation_level_label": "DO / DO + DG",
            "hazop_required": "HAZOP nécessaire",
            "hazop_completed": "HAZOP réalisé",
            "hazid_required": "HAZID nécessaire",
            "hazid_completed": "HAZID réalisé",
            "environmental_required": "Étude environnementale nécessaire",
            "environmental_completed": "Étude environnementale réalisée",
            "pid_update_required": "MAJ PID nécessaire",
            "pid_update_completed": "MAJ PID réalisée",
            "esd_update_required": "MAJ ESD nécessaire",
            "esd_update_completed": "MAJ ESD réalisée",
            "study_conclusion": "Conclusions de l'étude (markdown → HTML)",
            "responsible_display": "Process Engineer en charge",
            "study_completed_at": "Date fin d'étude",
            "validations": (
                "Liste des validations : [{role_label, validator_name, "
                "comments, validated_at, approved, level}]"
            ),
            "do_execution_accord": "Accord DO (True/False/None)",
            "do_execution_accord_at": "Date accord DO",
            "do_execution_comment": "Commentaire DO",
            "dg_execution_accord": "Accord DG (True/False/None)",
            "dg_execution_accord_at": "Date accord DG",
            "dg_execution_comment": "Commentaire DG",
            "entity": "Objet entity avec .name et .code",
            "generated_at": "Horodatage de génération",
        },
        "default_versions": {
            "fr": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
            "en": {
                "body_html": "",
                "header_html": None,
                "footer_html": None,
            },
        },
    },
]


# ── ADS Ticket HTML Templates ────────────────────────────────────────────

_ADS_TICKET_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .ticket { width: 100%; border: 2px solid #16213e; border-radius: 8px; overflow: hidden; }
  .ticket-header { background: linear-gradient(135deg, #16213e, #0f3460); color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
  .ticket-header .logo-area { font-size: 16pt; font-weight: 700; letter-spacing: 1px; }
  .ticket-header .entity-name { font-size: 10pt; opacity: 0.85; }
  .ticket-header .ref-block { text-align: right; }
  .ticket-header .ref-number { font-size: 14pt; font-weight: 700; font-family: 'Courier New', monospace; }
  .ticket-header .ref-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
  .ticket-body { display: flex; padding: 0; }
  .ticket-main { flex: 1; padding: 14px 20px; }
  .ticket-sidebar { width: 140px; background: #f8f9fa; border-left: 1px dashed #ccc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 14px 10px; }
  .ticket-sidebar img { width: 110px; height: 110px; }
  .ticket-sidebar .scan-label { font-size: 7pt; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { margin-bottom: 10px; }
  .section-title { font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; color: #0f3460; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #e0e0e0; padding-bottom: 2px; }
  .field-row { display: flex; gap: 20px; margin-bottom: 3px; }
  .field { flex: 1; }
  .field-label { font-size: 7pt; color: #888; text-transform: uppercase; }
  .field-value { font-size: 9pt; font-weight: 600; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  .status-approved { background: #d4edda; color: #155724; }
  .status-pending { background: #fff3cd; color: #856404; }
  .status-rejected { background: #f8d7da; color: #721c24; }
  .pax-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 4px; }
  .pax-table th { background: #e8edf3; text-align: left; padding: 3px 6px; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #16213e; }
  .pax-table td { padding: 3px 6px; border-bottom: 1px solid #eee; }
  .pax-table tr:last-child td { border-bottom: none; }
  .compliance-ok { color: #155724; font-weight: 600; }
  .compliance-nok { color: #721c24; font-weight: 600; }
  .ticket-footer { background: #f8f9fa; padding: 6px 20px; font-size: 7pt; color: #888; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="ticket">
  <div class="ticket-header">
    <div>
      <div class="logo-area">OPSFLUX</div>
      <div class="entity-name">{{ entity.name | default('') }}</div>
    </div>
    <div class="ref-block">
      <div class="ref-label">Avis de séjour</div>
      <div class="ref-number">{{ reference }}</div>
    </div>
  </div>
  <div class="ticket-body">
    <div class="ticket-main">
      <div class="section">
        <div class="section-title">Informations de voyage</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Date de depart</div>
            <div class="field-value">{{ departure_date }}</div>
          </div>
          <div class="field">
            <div class="field-label">Date de retour</div>
            <div class="field-value">{{ return_date | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Mode de transport</div>
            <div class="field-value">{{ transport_mode }}</div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Base de depart</div>
            <div class="field-value">{{ departure_base }}</div>
          </div>
          <div class="field">
            <div class="field-label">Site de destination</div>
            <div class="field-value">{{ destination_site }}</div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Motif de visite</div>
            <div class="field-value">{{ visit_purpose | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Catégorie</div>
            <div class="field-value">{{ visit_category | default('--') }}</div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Passagers</div>
        <table class="pax-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nom</th>
              <th>Société</th>
              <th>Badge</th>
              <th>Conformité</th>
            </tr>
          </thead>
          <tbody>
            {% for pax in passengers %}
            <tr>
              <td>{{ loop.index }}</td>
              <td>{{ pax.name }}</td>
              <td>{{ pax.company | default('--') }}</td>
              <td>{{ pax.badge_number | default('--') }}</td>
              <td>
                {% if pax.compliance_status == 'ok' or pax.compliance_status == 'conforme' %}
                  <span class="compliance-ok">OK</span>
                {% else %}
                  <span class="compliance-nok">NON CONFORME</span>
                {% endif %}
              </td>
            </tr>
            {% endfor %}
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Approbation</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Statut</div>
            <div class="field-value">
              {% if approval_status == 'approved' %}
                <span class="status-badge status-approved">APPROUVE</span>
              {% elif approval_status == 'rejected' %}
                <span class="status-badge status-rejected">REJETE</span>
              {% else %}
                <span class="status-badge status-pending">EN ATTENTE</span>
              {% endif %}
            </div>
          </div>
          <div class="field">
            <div class="field-label">Approuve par</div>
            <div class="field-value">{{ approver_name | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Date d'approbation</div>
            <div class="field-value">{{ approved_at | default('--') }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="ticket-sidebar">
      {% if qr_data or reference %}
        <img src="{{ qr_code(qr_data | default(reference)) }}" alt="QR Code"/>
        <div class="scan-label">Scanner pour verifier</div>
      {% endif %}
    </div>
  </div>
  <div class="ticket-footer">
    <span>Document généré le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- Avis de séjour</span>
  </div>
</div>
</body>
</html>"""

_ADS_TICKET_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .ticket { width: 100%; border: 2px solid #16213e; border-radius: 8px; overflow: hidden; }
  .ticket-header { background: linear-gradient(135deg, #16213e, #0f3460); color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
  .ticket-header .logo-area { font-size: 16pt; font-weight: 700; letter-spacing: 1px; }
  .ticket-header .entity-name { font-size: 10pt; opacity: 0.85; }
  .ticket-header .ref-block { text-align: right; }
  .ticket-header .ref-number { font-size: 14pt; font-weight: 700; font-family: 'Courier New', monospace; }
  .ticket-header .ref-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
  .ticket-body { display: flex; padding: 0; }
  .ticket-main { flex: 1; padding: 14px 20px; }
  .ticket-sidebar { width: 140px; background: #f8f9fa; border-left: 1px dashed #ccc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 14px 10px; }
  .ticket-sidebar img { width: 110px; height: 110px; }
  .ticket-sidebar .scan-label { font-size: 7pt; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section { margin-bottom: 10px; }
  .section-title { font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; color: #0f3460; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #e0e0e0; padding-bottom: 2px; }
  .field-row { display: flex; gap: 20px; margin-bottom: 3px; }
  .field { flex: 1; }
  .field-label { font-size: 7pt; color: #888; text-transform: uppercase; }
  .field-value { font-size: 9pt; font-weight: 600; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
  .status-approved { background: #d4edda; color: #155724; }
  .status-pending { background: #fff3cd; color: #856404; }
  .status-rejected { background: #f8d7da; color: #721c24; }
  .pax-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 4px; }
  .pax-table th { background: #e8edf3; text-align: left; padding: 3px 6px; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #16213e; }
  .pax-table td { padding: 3px 6px; border-bottom: 1px solid #eee; }
  .pax-table tr:last-child td { border-bottom: none; }
  .compliance-ok { color: #155724; font-weight: 600; }
  .compliance-nok { color: #721c24; font-weight: 600; }
  .ticket-footer { background: #f8f9fa; padding: 6px 20px; font-size: 7pt; color: #888; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="ticket">
  <div class="ticket-header">
    <div>
      <div class="logo-area">OPSFLUX</div>
      <div class="entity-name">{{ entity.name | default('') }}</div>
    </div>
    <div class="ref-block">
      <div class="ref-label">Stay Notice</div>
      <div class="ref-number">{{ reference }}</div>
    </div>
  </div>
  <div class="ticket-body">
    <div class="ticket-main">
      <div class="section">
        <div class="section-title">Travel Information</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Departure Date</div>
            <div class="field-value">{{ departure_date }}</div>
          </div>
          <div class="field">
            <div class="field-label">Return Date</div>
            <div class="field-value">{{ return_date | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Transport Mode</div>
            <div class="field-value">{{ transport_mode }}</div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Departure Base</div>
            <div class="field-value">{{ departure_base }}</div>
          </div>
          <div class="field">
            <div class="field-label">Destination Site</div>
            <div class="field-value">{{ destination_site }}</div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Visit Purpose</div>
            <div class="field-value">{{ visit_purpose | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Category</div>
            <div class="field-value">{{ visit_category | default('--') }}</div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Passengers</div>
        <table class="pax-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Company</th>
              <th>Badge</th>
              <th>Compliance</th>
            </tr>
          </thead>
          <tbody>
            {% for pax in passengers %}
            <tr>
              <td>{{ loop.index }}</td>
              <td>{{ pax.name }}</td>
              <td>{{ pax.company | default('--') }}</td>
              <td>{{ pax.badge_number | default('--') }}</td>
              <td>
                {% if pax.compliance_status == 'ok' or pax.compliance_status == 'compliant' %}
                  <span class="compliance-ok">OK</span>
                {% else %}
                  <span class="compliance-nok">NON-COMPLIANT</span>
                {% endif %}
              </td>
            </tr>
            {% endfor %}
          </tbody>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Approval</div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Status</div>
            <div class="field-value">
              {% if approval_status == 'approved' %}
                <span class="status-badge status-approved">APPROVED</span>
              {% elif approval_status == 'rejected' %}
                <span class="status-badge status-rejected">REJECTED</span>
              {% else %}
                <span class="status-badge status-pending">PENDING</span>
              {% endif %}
            </div>
          </div>
          <div class="field">
            <div class="field-label">Approved By</div>
            <div class="field-value">{{ approver_name | default('--') }}</div>
          </div>
          <div class="field">
            <div class="field-label">Approval Date</div>
            <div class="field-value">{{ approved_at | default('--') }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="ticket-sidebar">
      {% if qr_data or reference %}
        <img src="{{ qr_code(qr_data | default(reference)) }}" alt="QR Code"/>
        <div class="scan-label">Scan to verify</div>
      {% endif %}
    </div>
  </div>
  <div class="ticket-footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- Stay Notice</span>
  </div>
</div>
</body>
</html>"""

# ── ADS Manifest HTML Templates ──────────────────────────────────────────

_ADS_MANIFEST_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 16px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 9pt; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
  .total-row { font-weight: 700; background: #e8edf3 !important; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">MANIFESTE PASSAGERS</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-row">
    <div class="meta-item"><div class="label">Reference</div><div class="value">{{ reference }}</div></div>
    <div class="meta-item"><div class="label">Date de depart</div><div class="value">{{ departure_date }}</div></div>
    <div class="meta-item"><div class="label">Base de depart</div><div class="value">{{ departure_base }}</div></div>
    <div class="meta-item"><div class="label">Destination</div><div class="value">{{ destination_site }}</div></div>
    <div class="meta-item"><div class="label">Transport</div><div class="value">{{ transport_mode }}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Nom complet</th>
        <th>Société</th>
        <th>N. Badge</th>
        <th>Conformité</th>
        <th>Siège</th>
      </tr>
    </thead>
    <tbody>
      {% for pax in passengers %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ pax.name }}</td>
        <td>{{ pax.company | default('--') }}</td>
        <td>{{ pax.badge_number | default('--') }}</td>
        <td>{{ pax.compliance_status | default('--') }}</td>
        <td>{{ pax.seat_number | default('--') }}</td>
      </tr>
      {% endfor %}
      <tr class="total-row">
        <td colspan="5">Total passagers</td>
        <td>{{ total_passengers | default(passengers | length) }}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <span>Généré le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- Manifeste ADS</span>
  </div>
</body>
</html>"""

_ADS_MANIFEST_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 16px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 9pt; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
  .total-row { font-weight: 700; background: #e8edf3 !important; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">PASSENGER MANIFEST</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-row">
    <div class="meta-item"><div class="label">Reference</div><div class="value">{{ reference }}</div></div>
    <div class="meta-item"><div class="label">Departure Date</div><div class="value">{{ departure_date }}</div></div>
    <div class="meta-item"><div class="label">Departure Base</div><div class="value">{{ departure_base }}</div></div>
    <div class="meta-item"><div class="label">Destination</div><div class="value">{{ destination_site }}</div></div>
    <div class="meta-item"><div class="label">Transport</div><div class="value">{{ transport_mode }}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Full Name</th>
        <th>Company</th>
        <th>Badge No.</th>
        <th>Compliance</th>
        <th>Seat</th>
      </tr>
    </thead>
    <tbody>
      {% for pax in passengers %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ pax.name }}</td>
        <td>{{ pax.company | default('--') }}</td>
        <td>{{ pax.badge_number | default('--') }}</td>
        <td>{{ pax.compliance_status | default('--') }}</td>
        <td>{{ pax.seat_number | default('--') }}</td>
      </tr>
      {% endfor %}
      <tr class="total-row">
        <td colspan="5">Total Passengers</td>
        <td>{{ total_passengers | default(passengers | length) }}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- ADS Manifest</span>
  </div>
</body>
</html>"""

# ── Document Export HTML Templates ────────────────────────────────────────

_DOCUMENT_EXPORT_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #333; line-height: 1.5; }
  .doc-header { border-bottom: 3px solid #16213e; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-header .entity { font-size: 9pt; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .doc-header .doc-number { font-size: 10pt; color: #0f3460; font-family: 'Courier New', monospace; margin-top: 4px; }
  .doc-header .doc-title { font-size: 18pt; font-weight: 700; color: #16213e; margin-top: 8px; }
  .doc-meta { display: flex; gap: 30px; font-size: 9pt; color: #666; margin-bottom: 24px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
  .doc-meta .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #aaa; }
  .doc-body { min-height: 400px; }
  .doc-body h1, .doc-body h2, .doc-body h3 { color: #16213e; }
  .doc-footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; text-align: center; }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="entity">{{ entity.name | default('OpsFlux') }}</div>
    <div class="doc-number">{{ document_number }}</div>
    <div class="doc-title">{{ document_title }}</div>
  </div>
  <div class="doc-meta">
    <div class="meta-item"><div class="label">Auteur</div><div>{{ author_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Revision</div><div>{{ revision | default('1') }}</div></div>
    <div class="meta-item"><div class="label">Statut</div><div>{{ status | default('--') }}</div></div>
  </div>
  <div class="doc-body">
    {{ document_body }}
  </div>
  <div class="doc-footer">
    {{ entity.name | default('OpsFlux') }} &mdash; {{ document_number }} &mdash; Généré le {{ generated_at | default('--') }}
  </div>
</body>
</html>"""

_DOCUMENT_EXPORT_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #333; line-height: 1.5; }
  .doc-header { border-bottom: 3px solid #16213e; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-header .entity { font-size: 9pt; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .doc-header .doc-number { font-size: 10pt; color: #0f3460; font-family: 'Courier New', monospace; margin-top: 4px; }
  .doc-header .doc-title { font-size: 18pt; font-weight: 700; color: #16213e; margin-top: 8px; }
  .doc-meta { display: flex; gap: 30px; font-size: 9pt; color: #666; margin-bottom: 24px; padding: 10px; background: #f8f9fa; border-radius: 4px; }
  .doc-meta .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #aaa; }
  .doc-body { min-height: 400px; }
  .doc-body h1, .doc-body h2, .doc-body h3 { color: #16213e; }
  .doc-footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; text-align: center; }
</style>
</head>
<body>
  <div class="doc-header">
    <div class="entity">{{ entity.name | default('OpsFlux') }}</div>
    <div class="doc-number">{{ document_number }}</div>
    <div class="doc-title">{{ document_title }}</div>
  </div>
  <div class="doc-meta">
    <div class="meta-item"><div class="label">Author</div><div>{{ author_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Revision</div><div>{{ revision | default('1') }}</div></div>
    <div class="meta-item"><div class="label">Status</div><div>{{ status | default('--') }}</div></div>
  </div>
  <div class="doc-body">
    {{ document_body }}
  </div>
  <div class="doc-footer">
    {{ entity.name | default('OpsFlux') }} &mdash; {{ document_number }} &mdash; Generated on {{ generated_at | default('--') }}
  </div>
</body>
</html>"""

# ── Voyage Manifest HTML Templates ───────────────────────────────────────

_VOYAGE_MANIFEST_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #16213e; margin-bottom: 14px; }
  .header .left .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .left .subtitle { font-size: 9pt; color: #555; margin-top: 2px; }
  .header .right { text-align: right; font-size: 9pt; }
  .header .right .voyage-no { font-size: 13pt; font-weight: 700; color: #16213e; font-family: 'Courier New', monospace; }
  .header .right .label { font-size: 7pt; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .meta-grid .meta-item { flex: 1; min-width: 130px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-grid .label { font-size: 6.5pt; text-transform: uppercase; color: #888; letter-spacing: 0.4px; }
  .meta-grid .value { font-size: 9.5pt; font-weight: 600; }
  .panel { display: flex; gap: 10px; margin-bottom: 12px; }
  .panel .box { flex: 1; padding: 8px 10px; background: #f1f4f8; border-left: 3px solid #16213e; border-radius: 3px; font-size: 8.5pt; }
  .panel .box .ttl { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; margin-bottom: 2px; }
  .panel .box .row { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 5px 6px; font-size: 7.5pt; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 8.5pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .totals { display: flex; gap: 10px; margin-top: 10px; }
  .totals .total-box { flex: 1; padding: 6px 10px; background: #e8edf3; border-radius: 4px; }
  .totals .total-box .label { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; }
  .totals .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  .signatures { margin-top: 18px; display: flex; gap: 16px; }
  .signatures .sig { flex: 1; border-top: 1px solid #888; padding-top: 4px; font-size: 8pt; color: #555; }
  .footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="left">
      <div class="title">MANIFESTE PASSAGERS</div>
      <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
    </div>
    <div class="right">
      <div class="label">N. de voyage</div>
      <div class="voyage-no">{{ voyage_number }}</div>
      <div class="label" style="margin-top:4px;">Date / Heure depart</div>
      <div>{{ departure_date }}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Vecteur</div><div class="value">{{ vector_name | default(carrier) }}</div></div>
    <div class="meta-item"><div class="label">Type</div><div class="value">{{ vector_type | default(transport_type) }}</div></div>
    <div class="meta-item"><div class="label">Immatriculation</div><div class="value">{{ vector_registration | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Mode</div><div class="value">{{ vector_mode | default('--') }}</div></div>
  </div>
  <div class="panel">
    <div class="box">
      <div class="ttl">Itineraire</div>
      <div>{{ route | default(departure_location ~ ' -> ' ~ arrival_location) }}</div>
      {% if stops %}<div style="margin-top:3px; color:#555; font-size:7.5pt;">{{ stops | length }} escale(s) intermediaire(s)</div>{% endif %}
    </div>
    <div class="box">
      <div class="ttl">Equipage</div>
      <div class="row"><span>Commandant</span><strong>{{ captain_name | default('--') }}</strong></div>
      <div class="row"><span>Co-pilote</span><strong>{{ co_pilot_name | default('--') }}</strong></div>
    </div>
    {% if weather %}
    <div class="box">
      <div class="ttl">Meteo</div>
      <div class="row"><span>Vent</span><strong>{{ weather.wind_speed_knots | default('--') }} kn</strong></div>
      <div class="row"><span>Mer / Visibilite</span><strong>{{ weather.sea_state | default('--') }} / {{ weather.visibility_nm | default('--') }} NM</strong></div>
      <div class="row"><span>Conditions</span><strong>{{ weather.weather_code | default(weather.flight_conditions | default('--')) }}</strong></div>
    </div>
    {% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:5%;">Siege</th>
        <th>Nom</th>
        <th>Société</th>
        <th>Badge</th>
        <th>Poids decl. (kg)</th>
        <th>Poids réel (kg)</th>
        <th>Contact urgence</th>
        <th>Conformité</th>
      </tr>
    </thead>
    <tbody>
      {% for pax in passengers %}
      <tr>
        <td>{{ pax.seat_number | default(loop.index) }}</td>
        <td>{{ pax.name }}</td>
        <td>{{ pax.company | default('--') }}</td>
        <td>{{ pax.badge_number | default('--') }}</td>
        <td>{{ pax.declared_weight_kg | default('--') }}</td>
        <td>{{ pax.actual_weight_kg | default('--') }}</td>
        <td>{{ pax.emergency_contact | default('--') }}</td>
        <td>{{ pax.compliance_status | default('--') }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="totals">
    <div class="total-box"><div class="label">Total PAX</div><div class="value">{{ total_passengers | default(passengers | length) }}{% if max_capacity %} / {{ max_capacity }}{% endif %}</div></div>
    <div class="total-box"><div class="label">Poids déclaré</div><div class="value">{{ total_declared_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Poids réel</div><div class="value">{{ total_actual_weight_kg | default('--') }} kg</div></div>
  </div>
  <div class="signatures">
    <div class="sig">Visa preparation</div>
    <div class="sig">Visa commandant</div>
    <div class="sig">Date</div>
  </div>
  <div class="footer">
    <span>Généré le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- TravelWiz</span>
  </div>
</body>
</html>"""

_VOYAGE_MANIFEST_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #16213e; margin-bottom: 14px; }
  .header .left .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .left .subtitle { font-size: 9pt; color: #555; margin-top: 2px; }
  .header .right { text-align: right; font-size: 9pt; }
  .header .right .voyage-no { font-size: 13pt; font-weight: 700; color: #16213e; font-family: 'Courier New', monospace; }
  .header .right .label { font-size: 7pt; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .meta-grid .meta-item { flex: 1; min-width: 130px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-grid .label { font-size: 6.5pt; text-transform: uppercase; color: #888; letter-spacing: 0.4px; }
  .meta-grid .value { font-size: 9.5pt; font-weight: 600; }
  .panel { display: flex; gap: 10px; margin-bottom: 12px; }
  .panel .box { flex: 1; padding: 8px 10px; background: #f1f4f8; border-left: 3px solid #16213e; border-radius: 3px; font-size: 8.5pt; }
  .panel .box .ttl { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; margin-bottom: 2px; }
  .panel .box .row { display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 5px 6px; font-size: 7.5pt; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 8.5pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .totals { display: flex; gap: 10px; margin-top: 10px; }
  .totals .total-box { flex: 1; padding: 6px 10px; background: #e8edf3; border-radius: 4px; }
  .totals .total-box .label { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; }
  .totals .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  .signatures { margin-top: 18px; display: flex; gap: 16px; }
  .signatures .sig { flex: 1; border-top: 1px solid #888; padding-top: 4px; font-size: 8pt; color: #555; }
  .footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="left">
      <div class="title">PASSENGER MANIFEST</div>
      <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
    </div>
    <div class="right">
      <div class="label">Voyage No.</div>
      <div class="voyage-no">{{ voyage_number }}</div>
      <div class="label" style="margin-top:4px;">Departure date / time</div>
      <div>{{ departure_date }}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Vector</div><div class="value">{{ vector_name | default(carrier) }}</div></div>
    <div class="meta-item"><div class="label">Type</div><div class="value">{{ vector_type | default(transport_type) }}</div></div>
    <div class="meta-item"><div class="label">Registration</div><div class="value">{{ vector_registration | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Mode</div><div class="value">{{ vector_mode | default('--') }}</div></div>
  </div>
  <div class="panel">
    <div class="box">
      <div class="ttl">Route</div>
      <div>{{ route | default(departure_location ~ ' -> ' ~ arrival_location) }}</div>
      {% if stops %}<div style="margin-top:3px; color:#555; font-size:7.5pt;">{{ stops | length }} intermediate stop(s)</div>{% endif %}
    </div>
    <div class="box">
      <div class="ttl">Crew</div>
      <div class="row"><span>Captain</span><strong>{{ captain_name | default('--') }}</strong></div>
      <div class="row"><span>Co-pilot</span><strong>{{ co_pilot_name | default('--') }}</strong></div>
    </div>
    {% if weather %}
    <div class="box">
      <div class="ttl">Weather</div>
      <div class="row"><span>Wind</span><strong>{{ weather.wind_speed_knots | default('--') }} kn</strong></div>
      <div class="row"><span>Sea / Visibility</span><strong>{{ weather.sea_state | default('--') }} / {{ weather.visibility_nm | default('--') }} NM</strong></div>
      <div class="row"><span>Conditions</span><strong>{{ weather.weather_code | default(weather.flight_conditions | default('--')) }}</strong></div>
    </div>
    {% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:5%;">Seat</th>
        <th>Name</th>
        <th>Company</th>
        <th>Badge</th>
        <th>Decl. weight (kg)</th>
        <th>Actual weight (kg)</th>
        <th>Emergency contact</th>
        <th>Compliance</th>
      </tr>
    </thead>
    <tbody>
      {% for pax in passengers %}
      <tr>
        <td>{{ pax.seat_number | default(loop.index) }}</td>
        <td>{{ pax.name }}</td>
        <td>{{ pax.company | default('--') }}</td>
        <td>{{ pax.badge_number | default('--') }}</td>
        <td>{{ pax.declared_weight_kg | default('--') }}</td>
        <td>{{ pax.actual_weight_kg | default('--') }}</td>
        <td>{{ pax.emergency_contact | default('--') }}</td>
        <td>{{ pax.compliance_status | default('--') }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="totals">
    <div class="total-box"><div class="label">Total PAX</div><div class="value">{{ total_passengers | default(passengers | length) }}{% if max_capacity %} / {{ max_capacity }}{% endif %}</div></div>
    <div class="total-box"><div class="label">Declared weight</div><div class="value">{{ total_declared_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Actual weight</div><div class="value">{{ total_actual_weight_kg | default('--') }} kg</div></div>
  </div>
  <div class="signatures">
    <div class="sig">Preparation signature</div>
    <div class="sig">Captain signature</div>
    <div class="sig">Date</div>
  </div>
  <div class="footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- TravelWiz</span>
  </div>
</body>
</html>"""

_VOYAGE_CARGO_MANIFEST_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #16213e; margin-bottom: 12px; }
  .header .left .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .left .subtitle { font-size: 9pt; color: #555; margin-top: 2px; }
  .header .right { text-align: right; font-size: 9pt; }
  .header .right .voyage-no { font-size: 13pt; font-weight: 700; color: #16213e; font-family: 'Courier New', monospace; }
  .header .right .label { font-size: 7pt; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .meta-item { flex: 1; min-width: 130px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 6.5pt; text-transform: uppercase; color: #888; letter-spacing: 0.4px; }
  .meta-item .value { font-size: 9.5pt; font-weight: 600; }
  .panel { display: flex; gap: 10px; margin-bottom: 10px; }
  .panel .box { flex: 1; padding: 6px 10px; background: #f1f4f8; border-left: 3px solid #16213e; border-radius: 3px; font-size: 8.5pt; }
  .panel .box .ttl { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; margin-bottom: 2px; }
  .totals { display: flex; gap: 8px; margin-bottom: 10px; }
  .total-box { flex: 1; background: #e8edf3; border-radius: 4px; padding: 6px 10px; }
  .total-box .label { font-size: 6.5pt; text-transform: uppercase; color: #667085; letter-spacing: 0.4px; }
  .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  .total-box.warn { background: #fff4e0; }
  .total-box.warn .value { color: #b86b00; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #16213e; color: #fff; text-align: left; padding: 5px 6px; font-size: 7pt; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 8pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .haz { background: #ffe6e6 !important; }
  .urg { background: #fff4d6 !important; }
  .haz-tag { display: inline-block; padding: 1px 4px; background: #c0392b; color: #fff; font-size: 6.5pt; border-radius: 2px; margin-left: 2px; }
  .urg-tag { display: inline-block; padding: 1px 4px; background: #e67e22; color: #fff; font-size: 6.5pt; border-radius: 2px; margin-left: 2px; }
  .signatures { margin-top: 16px; display: flex; gap: 16px; }
  .signatures .sig { flex: 1; border-top: 1px solid #888; padding-top: 4px; font-size: 8pt; color: #555; }
  .footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="left">
      <div class="title">MANIFESTE CARGO</div>
      <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
    </div>
    <div class="right">
      <div class="label">N. de voyage</div>
      <div class="voyage-no">{{ voyage_number }}</div>
      <div class="label" style="margin-top:4px;">Date depart</div>
      <div>{{ departure_date }}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Vecteur</div><div class="value">{{ vector_name | default(carrier) }}</div></div>
    <div class="meta-item"><div class="label">Type</div><div class="value">{{ vector_type | default(transport_type) }}</div></div>
    <div class="meta-item"><div class="label">Immatriculation</div><div class="value">{{ vector_registration | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Capacite poids</div><div class="value">{{ vector_weight_capacity_kg | default('--') }} kg</div></div>
  </div>
  <div class="panel">
    <div class="box">
      <div class="ttl">Itineraire</div>
      <div>{{ route | default(departure_location ~ ' -> ' ~ arrival_location) }}</div>
    </div>
    <div class="box">
      <div class="ttl">Equipage</div>
      <div>Commandant: <strong>{{ captain_name | default('--') }}</strong></div>
    </div>
  </div>
  <div class="totals">
    <div class="total-box"><div class="label">Colis</div><div class="value">{{ total_cargo_items | default(cargo_items | length) }}</div></div>
    <div class="total-box"><div class="label">Packages</div><div class="value">{{ total_packages | default('--') }}</div></div>
    <div class="total-box"><div class="label">Poids total</div><div class="value">{{ total_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Volume total</div><div class="value">{{ total_volume_m3 | default('--') }} m3</div></div>
    {% if hazmat_count %}<div class="total-box warn"><div class="label">Hazmat</div><div class="value">{{ hazmat_count }}</div></div>{% endif %}
    {% if urgent_count %}<div class="total-box warn"><div class="label">Urgent</div><div class="value">{{ urgent_count }}</div></div>{% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Reference</th>
        <th>Demande</th>
        <th>Désignation</th>
        <th>Expéditeur</th>
        <th>Destinataire</th>
        <th>Destination</th>
        <th>Poids (kg)</th>
        <th>Volume (m3)</th>
        <th>Colis</th>
        <th>Notes / Hazmat</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr class="{% if cargo.is_hazmat %}haz{% elif cargo.is_urgent %}urg{% endif %}">
        <td>{{ loop.index }}</td>
        <td>{{ cargo.reference | default(cargo.tracking_code) }}</td>
        <td>{{ cargo.request_code | default('--') }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}{% if cargo.is_hazmat %}<span class="haz-tag">HAZ</span>{% endif %}{% if cargo.is_urgent %}<span class="urg-tag">URG</span>{% endif %}</td>
        <td>{{ cargo.sender_name | default('--') }}</td>
        <td>{{ cargo.receiver_name | default('--') }}</td>
        <td>{{ cargo.destination_name | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.volume_m3 | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>
          {% if cargo.is_hazmat %}Hazmat{% if cargo.hazmat_class %} cl. {{ cargo.hazmat_class }}{% endif %}{% if cargo.hazmat_un_number %} UN {{ cargo.hazmat_un_number }}{% endif %}{% if cargo.hazmat_validated %} (validé){% endif %}{% if cargo.handling_notes %}<br/>{% endif %}{% endif %}
          {{ cargo.handling_notes | default('') }}
        </td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="signatures">
    <div class="sig">Visa preparation</div>
    <div class="sig">Visa manutentionnaire</div>
    <div class="sig">Date</div>
  </div>
  <div class="footer">
    <span>Généré le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- TravelWiz Cargo</span>
  </div>
</body>
</html>"""

_VOYAGE_CARGO_MANIFEST_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #16213e; margin-bottom: 12px; }
  .header .left .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .left .subtitle { font-size: 9pt; color: #555; margin-top: 2px; }
  .header .right { text-align: right; font-size: 9pt; }
  .header .right .voyage-no { font-size: 13pt; font-weight: 700; color: #16213e; font-family: 'Courier New', monospace; }
  .header .right .label { font-size: 7pt; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .meta-item { flex: 1; min-width: 130px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 6.5pt; text-transform: uppercase; color: #888; letter-spacing: 0.4px; }
  .meta-item .value { font-size: 9.5pt; font-weight: 600; }
  .panel { display: flex; gap: 10px; margin-bottom: 10px; }
  .panel .box { flex: 1; padding: 6px 10px; background: #f1f4f8; border-left: 3px solid #16213e; border-radius: 3px; font-size: 8.5pt; }
  .panel .box .ttl { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; margin-bottom: 2px; }
  .totals { display: flex; gap: 8px; margin-bottom: 10px; }
  .total-box { flex: 1; background: #e8edf3; border-radius: 4px; padding: 6px 10px; }
  .total-box .label { font-size: 6.5pt; text-transform: uppercase; color: #667085; letter-spacing: 0.4px; }
  .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  .total-box.warn { background: #fff4e0; }
  .total-box.warn .value { color: #b86b00; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #16213e; color: #fff; text-align: left; padding: 5px 6px; font-size: 7pt; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 8pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .haz { background: #ffe6e6 !important; }
  .urg { background: #fff4d6 !important; }
  .haz-tag { display: inline-block; padding: 1px 4px; background: #c0392b; color: #fff; font-size: 6.5pt; border-radius: 2px; margin-left: 2px; }
  .urg-tag { display: inline-block; padding: 1px 4px; background: #e67e22; color: #fff; font-size: 6.5pt; border-radius: 2px; margin-left: 2px; }
  .signatures { margin-top: 16px; display: flex; gap: 16px; }
  .signatures .sig { flex: 1; border-top: 1px solid #888; padding-top: 4px; font-size: 8pt; color: #555; }
  .footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="left">
      <div class="title">CARGO MANIFEST</div>
      <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
    </div>
    <div class="right">
      <div class="label">Voyage No.</div>
      <div class="voyage-no">{{ voyage_number }}</div>
      <div class="label" style="margin-top:4px;">Departure date</div>
      <div>{{ departure_date }}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Vector</div><div class="value">{{ vector_name | default(carrier) }}</div></div>
    <div class="meta-item"><div class="label">Type</div><div class="value">{{ vector_type | default(transport_type) }}</div></div>
    <div class="meta-item"><div class="label">Registration</div><div class="value">{{ vector_registration | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Weight capacity</div><div class="value">{{ vector_weight_capacity_kg | default('--') }} kg</div></div>
  </div>
  <div class="panel">
    <div class="box">
      <div class="ttl">Route</div>
      <div>{{ route | default(departure_location ~ ' -> ' ~ arrival_location) }}</div>
    </div>
    <div class="box">
      <div class="ttl">Crew</div>
      <div>Captain: <strong>{{ captain_name | default('--') }}</strong></div>
    </div>
  </div>
  <div class="totals">
    <div class="total-box"><div class="label">Cargo items</div><div class="value">{{ total_cargo_items | default(cargo_items | length) }}</div></div>
    <div class="total-box"><div class="label">Packages</div><div class="value">{{ total_packages | default('--') }}</div></div>
    <div class="total-box"><div class="label">Total weight</div><div class="value">{{ total_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Total volume</div><div class="value">{{ total_volume_m3 | default('--') }} m3</div></div>
    {% if hazmat_count %}<div class="total-box warn"><div class="label">Hazmat</div><div class="value">{{ hazmat_count }}</div></div>{% endif %}
    {% if urgent_count %}<div class="total-box warn"><div class="label">Urgent</div><div class="value">{{ urgent_count }}</div></div>{% endif %}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Reference</th>
        <th>Request</th>
        <th>Description</th>
        <th>Sender</th>
        <th>Receiver</th>
        <th>Destination</th>
        <th>Weight (kg)</th>
        <th>Volume (m3)</th>
        <th>Packages</th>
        <th>Notes / Hazmat</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr class="{% if cargo.is_hazmat %}haz{% elif cargo.is_urgent %}urg{% endif %}">
        <td>{{ loop.index }}</td>
        <td>{{ cargo.reference | default(cargo.tracking_code) }}</td>
        <td>{{ cargo.request_code | default('--') }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}{% if cargo.is_hazmat %}<span class="haz-tag">HAZ</span>{% endif %}{% if cargo.is_urgent %}<span class="urg-tag">URG</span>{% endif %}</td>
        <td>{{ cargo.sender_name | default('--') }}</td>
        <td>{{ cargo.receiver_name | default('--') }}</td>
        <td>{{ cargo.destination_name | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.volume_m3 | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>
          {% if cargo.is_hazmat %}Hazmat{% if cargo.hazmat_class %} cl. {{ cargo.hazmat_class }}{% endif %}{% if cargo.hazmat_un_number %} UN {{ cargo.hazmat_un_number }}{% endif %}{% if cargo.hazmat_validated %} (validated){% endif %}{% if cargo.handling_notes %}<br/>{% endif %}{% endif %}
          {{ cargo.handling_notes | default('') }}
        </td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="signatures">
    <div class="sig">Preparation signature</div>
    <div class="sig">Handler signature</div>
    <div class="sig">Date</div>
  </div>
  <div class="footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- TravelWiz Cargo</span>
  </div>
</body>
</html>"""

_CARGO_LT_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/></head>
<body>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }

  /* ── Top bar ── */
  .top-bar {
    display: flex; align-items: stretch;
    border-bottom: 3pt solid #000; margin-bottom: 0;
  }
  .brand-block {
    background: #000; color: #fff; padding: 5mm 6mm;
    display: flex; flex-direction: column; justify-content: center;
    min-width: 55mm;
  }
  .brand-block .company { font-size: 18pt; font-weight: 900; letter-spacing: 1pt; }
  .brand-block .sub     { font-size: 7pt; text-transform: uppercase; letter-spacing: 1.5pt; opacity: 0.7; margin-top: 1mm; }
  .lt-ref-block {
    flex: 1; padding: 4mm 6mm;
    display: flex; flex-direction: column; justify-content: center;
    border-left: 2pt solid #000;
  }
  .lt-ref-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1pt; color: #555; font-weight: 700; }
  .lt-ref-code  { font-family: 'Courier New', monospace; font-size: 22pt; font-weight: 900; letter-spacing: 1pt; line-height: 1.1; }
  .lt-status    { margin-top: 1.5mm; }
  .status-chip  {
    display: inline-block; padding: 1mm 3mm;
    font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5pt;
    border: 1pt solid #000; border-radius: 1mm;
  }
  .qr-block {
    width: 38mm; padding: 3mm;
    border-left: 2pt solid #000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .qr-block img { width: 30mm; height: 30mm; }
  .qr-lbl { font-size: 5.5pt; color: #666; margin-top: 1mm; text-align: center; text-transform: uppercase; letter-spacing: 0.3pt; }

  /* ── HAZMAT bar ── */
  .hazmat-bar {
    background: #ffcc00; color: #000;
    text-align: center; font-weight: 900; font-size: 9pt;
    padding: 2mm; letter-spacing: 1pt; text-transform: uppercase;
    border-bottom: 2pt solid #000;
  }

  /* ── Sections ── */
  .section-grid { display: flex; border-bottom: 1.5pt solid #000; }
  .section-box  { flex: 1; padding: 3mm 5mm; border-right: 1pt solid #ccc; }
  .section-box:last-child { border-right: none; }
  .section-title {
    font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1pt;
    font-weight: 900; background: #000; color: #fff;
    display: inline-block; padding: 0.5mm 2mm; margin-bottom: 2mm;
  }
  .field { margin-bottom: 2mm; }
  .field-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.3pt; color: #666; font-weight: 700; }
  .field-val  { font-size: 9pt; font-weight: 700; line-height: 1.3; }
  .field-val.big { font-size: 11pt; font-weight: 900; }

  /* ── Cargo table ── */
  .cargo-section { padding: 3mm 5mm; border-bottom: 1.5pt solid #000; }
  .cargo-table {
    width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 2mm;
  }
  .cargo-table th {
    background: #000; color: #fff;
    text-align: left; padding: 1.5mm 2mm;
    font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5pt; font-weight: 700;
  }
  .cargo-table td { padding: 1.5mm 2mm; border-bottom: 0.5pt solid #e0e0e0; vertical-align: top; }
  .cargo-table tr:last-child td { border-bottom: none; }
  .cargo-table td.ref { font-family: monospace; font-weight: 700; font-size: 8pt; }
  .hazmat-chip {
    background: #ffcc00; color: #000;
    font-size: 6pt; font-weight: 900; padding: 0.3mm 1.5mm;
    border-radius: 0.5mm; white-space: nowrap;
  }

  /* ── Totals ── */
  .totals-row {
    display: flex; border-top: 2pt solid #000; border-bottom: 1.5pt solid #000;
  }
  .total-box {
    flex: 1; padding: 2.5mm 5mm; border-right: 1pt solid #ccc; text-align: center;
  }
  .total-box:last-child { border-right: none; }
  .total-box .t-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #555; font-weight: 700; }
  .total-box .t-val { font-size: 14pt; font-weight: 900; line-height: 1.2; }
  .total-box .t-unit { font-size: 7pt; color: #555; }

  /* ── Footer ── */
  .doc-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 2mm 5mm; font-size: 6.5pt; color: #666;
    border-top: 0.5pt dashed #ccc; margin-top: auto;
  }
  .footer-note { max-width: 65%; line-height: 1.4; }
</style>

<!-- TOP BAR: brand + LT ref + QR -->
<div class="top-bar">
  <div class="brand-block">
    <div class="company">{{ entity.name or 'OpsFlux' }}</div>
    <div class="sub">Lettre de Transport</div>
  </div>
  <div class="lt-ref-block">
    <div class="lt-ref-label">N° Lettre de Transport</div>
    <div class="lt-ref-code">{{ request_code }}</div>
    <div class="lt-status">
      <span class="status-chip">{{ request_status or 'En cours' }}</span>
    </div>
  </div>
  <div class="qr-block">
    {% if request_qr_data or request_code %}
    <img src="{{ qr_code(request_qr_data or request_code) }}" alt="QR LT"/>
    <div class="qr-lbl">Scanner la LT</div>
    {% endif %}
  </div>
</div>

{% if has_hazmat %}
<div class="hazmat-bar">&#9888; EXPÉDITION CONTENANT DES MATIÈRES DANGEREUSES — HAZMAT &#9888;</div>
{% endif %}

<!-- FROM / TO / INFO -->
<div class="section-grid">
  <div class="section-box">
    <div class="section-title">Expéditeur</div>
    <div class="field">
      <div class="field-lbl">Société</div>
      <div class="field-val big">{{ sender_name or '—' }}</div>
    </div>
    {% if sender_contact_name %}
    <div class="field">
      <div class="field-lbl">Contact</div>
      <div class="field-val">{{ sender_contact_name }}</div>
    </div>
    {% endif %}
    {% if requester_name %}
    <div class="field">
      <div class="field-lbl">Demandeur</div>
      <div class="field-val">{{ requester_name }}</div>
    </div>
    {% endif %}
  </div>
  <div class="section-box">
    <div class="section-title">Destinataire / Destination</div>
    <div class="field">
      <div class="field-lbl">Destinataire</div>
      <div class="field-val big">{{ receiver_name or '—' }}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Site de destination</div>
      <div class="field-val">{{ destination_name or '—' }}</div>
    </div>
  </div>
  <div class="section-box">
    <div class="section-title">Transport</div>
    {% if transport_voyage_code %}
    <div class="field">
      <div class="field-lbl">Voyage</div>
      <div class="field-val">{{ transport_voyage_code }}</div>
    </div>
    {% endif %}
    {% if transport_vector_name %}
    <div class="field">
      <div class="field-lbl">Vecteur</div>
      <div class="field-val">{{ transport_vector_name }}</div>
    </div>
    {% endif %}
    {% if transport_vector_registration %}
    <div class="field">
      <div class="field-lbl">Immatriculation</div>
      <div class="field-val">{{ transport_vector_registration }}</div>
    </div>
    {% endif %}
    {% if imputation_reference %}
    <div class="field">
      <div class="field-lbl">Imputation</div>
      <div class="field-val">{{ imputation_reference }}</div>
    </div>
    {% endif %}
  </div>
</div>

<!-- TOTALS -->
<div class="totals-row">
  <div class="total-box">
    <div class="t-lbl">Colis</div>
    <div class="t-val">{{ total_cargo_items or '—' }}</div>
  </div>
  <div class="total-box">
    <div class="t-lbl">Poids total</div>
    <div class="t-val">{{ total_weight_kg or '—' }}</div>
    <div class="t-unit">kg</div>
  </div>
  <div class="total-box">
    <div class="t-lbl">Volume total</div>
    <div class="t-val">{{ total_volume_m3 or '—' }}</div>
    <div class="t-unit">m³</div>
  </div>
  <div class="total-box">
    <div class="t-lbl">Total emballages</div>
    <div class="t-val">{{ total_packages or '—' }}</div>
  </div>
</div>

<!-- CARGO ITEMS TABLE -->
<div class="cargo-section">
  <div class="section-title">Détail des colis</div>
  <table class="cargo-table">
    <thead>
      <tr>
        <th>Réf.</th>
        <th>Désignation</th>
        <th>Poids</th>
        <th>Vol.</th>
        <th>Colis</th>
        <th>Statut</th>
        <th>Spécial</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td class="ref">{{ cargo.reference }}</td>
        <td>{{ cargo.designation or cargo.description or '—' }}</td>
        <td>{% if cargo.weight_kg %}{{ cargo.weight_kg }} kg{% else %}—{% endif %}</td>
        <td>{% if cargo.volume_m3 %}{{ cargo.volume_m3 }} m³{% else %}—{% endif %}</td>
        <td>{{ cargo.package_count or 1 }}</td>
        <td>{{ cargo.status_label or cargo.status or '—' }}</td>
        <td>
          {% if cargo.is_hazmat %}<span class="hazmat-chip">HAZMAT</span>{% endif %}
          {% if cargo.is_urgent %}<span style="font-weight:900;font-size:7pt;">URGENT</span>{% endif %}
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
</div>

<!-- FOOTER -->
<div class="doc-footer">
  <div class="footer-note">
    Ce document est une lettre de transport officielle générée par {{ entity.name or 'OpsFlux' }}.
    Scanner le QR code pour vérifier et suivre l'expédition en temps réel.
    {% if description %} — {{ description }}{% endif %}
  </div>
  <div>Généré le {{ generated_at }}</div>
</div>

</body>
</html>"""

_CARGO_LT_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/></head>
<body>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .top-bar { display: flex; align-items: stretch; border-bottom: 3pt solid #000; }
  .brand-block { background: #000; color: #fff; padding: 5mm 6mm; display: flex; flex-direction: column; justify-content: center; min-width: 55mm; }
  .brand-block .company { font-size: 18pt; font-weight: 900; letter-spacing: 1pt; }
  .brand-block .sub { font-size: 7pt; text-transform: uppercase; letter-spacing: 1.5pt; opacity: 0.7; margin-top: 1mm; }
  .lt-ref-block { flex: 1; padding: 4mm 6mm; display: flex; flex-direction: column; justify-content: center; border-left: 2pt solid #000; }
  .lt-ref-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1pt; color: #555; font-weight: 700; }
  .lt-ref-code { font-family: 'Courier New', monospace; font-size: 22pt; font-weight: 900; letter-spacing: 1pt; line-height: 1.1; }
  .status-chip { display: inline-block; padding: 1mm 3mm; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5pt; border: 1pt solid #000; border-radius: 1mm; }
  .qr-block { width: 38mm; padding: 3mm; border-left: 2pt solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .qr-block img { width: 30mm; height: 30mm; }
  .qr-lbl { font-size: 5.5pt; color: #666; margin-top: 1mm; text-align: center; text-transform: uppercase; letter-spacing: 0.3pt; }
  .hazmat-bar { background: #ffcc00; color: #000; text-align: center; font-weight: 900; font-size: 9pt; padding: 2mm; letter-spacing: 1pt; text-transform: uppercase; border-bottom: 2pt solid #000; }
  .section-grid { display: flex; border-bottom: 1.5pt solid #000; }
  .section-box { flex: 1; padding: 3mm 5mm; border-right: 1pt solid #ccc; }
  .section-box:last-child { border-right: none; }
  .section-title { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1pt; font-weight: 900; background: #000; color: #fff; display: inline-block; padding: 0.5mm 2mm; margin-bottom: 2mm; }
  .field { margin-bottom: 2mm; }
  .field-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.3pt; color: #666; font-weight: 700; }
  .field-val { font-size: 9pt; font-weight: 700; line-height: 1.3; }
  .field-val.big { font-size: 11pt; font-weight: 900; }
  .cargo-section { padding: 3mm 5mm; border-bottom: 1.5pt solid #000; }
  .cargo-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 2mm; }
  .cargo-table th { background: #000; color: #fff; text-align: left; padding: 1.5mm 2mm; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5pt; font-weight: 700; }
  .cargo-table td { padding: 1.5mm 2mm; border-bottom: 0.5pt solid #e0e0e0; vertical-align: top; }
  .cargo-table tr:last-child td { border-bottom: none; }
  .cargo-table td.ref { font-family: monospace; font-weight: 700; font-size: 8pt; }
  .hazmat-chip { background: #ffcc00; color: #000; font-size: 6pt; font-weight: 900; padding: 0.3mm 1.5mm; border-radius: 0.5mm; white-space: nowrap; }
  .totals-row { display: flex; border-top: 2pt solid #000; border-bottom: 1.5pt solid #000; }
  .total-box { flex: 1; padding: 2.5mm 5mm; border-right: 1pt solid #ccc; text-align: center; }
  .total-box:last-child { border-right: none; }
  .total-box .t-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #555; font-weight: 700; }
  .total-box .t-val { font-size: 14pt; font-weight: 900; line-height: 1.2; }
  .total-box .t-unit { font-size: 7pt; color: #555; }
  .doc-footer { display: flex; align-items: center; justify-content: space-between; padding: 2mm 5mm; font-size: 6.5pt; color: #666; border-top: 0.5pt dashed #ccc; }
  .footer-note { max-width: 65%; line-height: 1.4; }

  /* ── Status line ── */
  .status-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 8pt; }
  .status-tag { display: inline-block; padding: 2px 7px; border: 1px solid #333; font-weight: 700; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.04em; }
  .status-tag.hazmat { border-color: #111; background: #111; color: #fff; }

  /* ── Two-column address blocks ── */
  .addr-row { display: flex; gap: 0; margin-bottom: 10px; }
  .addr-box { flex: 1; border: 1px solid #333; padding: 8px 10px; }
  .addr-box + .addr-box { border-left: none; }
  .addr-box .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.10em; color: #666; font-weight: 700; margin-bottom: 4px; }
  .addr-box .name { font-size: 9pt; font-weight: 700; color: #111; }
  .addr-box .detail { font-size: 8pt; color: #333; white-space: pre-line; margin-top: 3px; line-height: 1.35; }

  /* ── Info grid ── */
  .info-grid { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 10px; }
  .info-cell { flex: 1; min-width: 120px; border: 1px solid #333; padding: 5px 8px; margin-right: -1px; margin-bottom: -1px; }
  .info-cell .lbl { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #666; }
  .info-cell .val { font-size: 9pt; font-weight: 700; color: #111; margin-top: 2px; }

  /* ── Transport section ── */
  .transport-section { margin-bottom: 10px; }
  .transport-grid { display: flex; gap: 0; }
  .transport-cell { flex: 1; border: 1px solid #333; padding: 5px 8px; margin-right: -1px; }
  .transport-cell .lbl { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #666; }
  .transport-cell .val { font-size: 9pt; font-weight: 700; color: #111; margin-top: 2px; }

  /* ── Section titles ── */
  .sect-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.10em; color: #111; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 6px; margin-top: 10px; }

  /* ── Description ── */
  .desc-block { font-size: 8pt; color: #333; white-space: pre-wrap; line-height: 1.4; padding: 6px 0; border-bottom: 1px solid #ccc; margin-bottom: 6px; }
  .req-block { margin-top: 4px; font-size: 7.5pt; color: #333; }
  .req-block strong { font-size: 7.5pt; }
  .req-block .line { margin-top: 2px; }

  /* ── HAZMAT warning ── */
  .hazmat-warn { border: 2px solid #111; padding: 5px 8px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .hazmat-warn .icon { font-size: 12pt; }
  .hazmat-warn .text { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }

  /* ── Cargo table ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #f0f0f0; color: #111; text-align: left; padding: 4px 5px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid #333; }
  td { padding: 4px 5px; border: 1px solid #999; font-size: 7.5pt; vertical-align: top; color: #111; }
  .footer-note { max-width: 65%; line-height: 1.4; }
</style>
<div class="top-bar">
  <div class="brand-block">
    <div class="company">{{ entity.name or 'OpsFlux' }}</div>
    <div class="sub">Transport Letter</div>
  </div>
  <div class="lt-ref-block">
    <div class="lt-ref-label">Transport Letter No.</div>
    <div class="lt-ref-code">{{ request_code }}</div>
    <div style="margin-top:1.5mm"><span class="status-chip">{{ request_status or 'In progress' }}</span></div>
  </div>
  <div class="qr-block">
    {% if request_qr_data or request_code %}
    <img src="{{ qr_code(request_qr_data or request_code) }}" alt="QR LT"/>
    <div class="qr-lbl">Scan LT</div>
    {% endif %}
  </div>
</div>
{% if has_hazmat %}
<div class="hazmat-bar">&#9888; SHIPMENT CONTAINS HAZARDOUS MATERIALS — HAZMAT &#9888;</div>
{% endif %}
<div class="section-grid">
  <div class="section-box">
    <div class="section-title">Sender</div>
    <div class="field"><div class="field-lbl">Company</div><div class="field-val big">{{ sender_name or '—' }}</div></div>
    {% if sender_contact_name %}<div class="field"><div class="field-lbl">Contact</div><div class="field-val">{{ sender_contact_name }}</div></div>{% endif %}
    {% if requester_name %}<div class="field"><div class="field-lbl">Requester</div><div class="field-val">{{ requester_name }}</div></div>{% endif %}
  </div>
  <div class="section-box">
    <div class="section-title">Recipient / Destination</div>
    <div class="field"><div class="field-lbl">Recipient</div><div class="field-val big">{{ receiver_name or '—' }}</div></div>
    <div class="field"><div class="field-lbl">Destination site</div><div class="field-val">{{ destination_name or '—' }}</div></div>
  </div>
  <div class="section-box">
    <div class="section-title">Transport</div>
    {% if transport_voyage_code %}<div class="field"><div class="field-lbl">Voyage</div><div class="field-val">{{ transport_voyage_code }}</div></div>{% endif %}
    {% if transport_vector_name %}<div class="field"><div class="field-lbl">Vector</div><div class="field-val">{{ transport_vector_name }}</div></div>{% endif %}
    {% if transport_vector_registration %}<div class="field"><div class="field-lbl">Registration</div><div class="field-val">{{ transport_vector_registration }}</div></div>{% endif %}
    {% if imputation_reference %}<div class="field"><div class="field-lbl">Imputation</div><div class="field-val">{{ imputation_reference }}</div></div>{% endif %}
  </div>
</div>
<div class="totals-row">
  <div class="total-box"><div class="t-lbl">Cargo items</div><div class="t-val">{{ total_cargo_items or '—' }}</div></div>
  <div class="total-box"><div class="t-lbl">Total weight</div><div class="t-val">{{ total_weight_kg or '—' }}</div><div class="t-unit">kg</div></div>
  <div class="total-box"><div class="t-lbl">Total volume</div><div class="t-val">{{ total_volume_m3 or '—' }}</div><div class="t-unit">m³</div></div>
  <div class="total-box"><div class="t-lbl">Total packages</div><div class="t-val">{{ total_packages or '—' }}</div></div>
</div>
<div class="cargo-section">
  <div class="section-title">Cargo details</div>
  <table class="cargo-table">
    <thead><tr><th>Ref.</th><th>Description</th><th>Weight</th><th>Vol.</th><th>Pkgs</th><th>Status</th><th>Special</th></tr></thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td class="ref">{{ cargo.reference }}</td>
        <td>{{ cargo.designation or cargo.description or '—' }}</td>
        <td>{% if cargo.weight_kg %}{{ cargo.weight_kg }} kg{% else %}—{% endif %}</td>
        <td>{% if cargo.volume_m3 %}{{ cargo.volume_m3 }} m³{% else %}—{% endif %}</td>
        <td>{{ cargo.package_count or 1 }}</td>
        <td>{{ cargo.status_label or cargo.status or '—' }}</td>
        <td>{% if cargo.is_hazmat %}<span class="hazmat-chip">HAZMAT</span>{% endif %}{% if cargo.is_urgent %}<span style="font-weight:900;font-size:7pt;">URGENT</span>{% endif %}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
</div>
<div class="doc-footer">
  <div class="footer-note">This is an official transport letter generated by {{ entity.name or 'OpsFlux' }}. Scan the QR code to verify and track the shipment in real time.{% if description %} — {{ description }}{% endif %}</div>
  <div>Generated {{ generated_at }}</div>
</div>
</body>
</html>"""

# ── Patch default versions with actual HTML ──────────────────────────────
# (Avoids forward-reference issues with the walrus operator placeholders above)

DEFAULT_PDF_TEMPLATES[0]["default_versions"]["fr"]["body_html"] = _ADS_TICKET_BODY_FR
DEFAULT_PDF_TEMPLATES[0]["default_versions"]["en"]["body_html"] = _ADS_TICKET_BODY_EN
DEFAULT_PDF_TEMPLATES[1]["default_versions"]["fr"]["body_html"] = _ADS_MANIFEST_BODY_FR
DEFAULT_PDF_TEMPLATES[1]["default_versions"]["en"]["body_html"] = _ADS_MANIFEST_BODY_EN
DEFAULT_PDF_TEMPLATES[2]["default_versions"]["fr"]["body_html"] = _DOCUMENT_EXPORT_BODY_FR
DEFAULT_PDF_TEMPLATES[2]["default_versions"]["en"]["body_html"] = _DOCUMENT_EXPORT_BODY_EN
DEFAULT_PDF_TEMPLATES[4]["default_versions"]["fr"]["body_html"] = _VOYAGE_MANIFEST_BODY_FR
DEFAULT_PDF_TEMPLATES[4]["default_versions"]["en"]["body_html"] = _VOYAGE_MANIFEST_BODY_EN
DEFAULT_PDF_TEMPLATES[5]["default_versions"]["fr"]["body_html"] = _VOYAGE_CARGO_MANIFEST_BODY_FR
DEFAULT_PDF_TEMPLATES[5]["default_versions"]["en"]["body_html"] = _VOYAGE_CARGO_MANIFEST_BODY_EN
DEFAULT_PDF_TEMPLATES[6]["default_versions"]["fr"]["body_html"] = _CARGO_LT_BODY_FR
DEFAULT_PDF_TEMPLATES[6]["default_versions"]["en"]["body_html"] = _CARGO_LT_BODY_EN

# ── Project Report HTML ─────────────────────────────────────────────────

_AVM_TICKET_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.45; }
  h1 { margin: 0; font-size: 20px; color: #0f172a; }
  h2 { margin: 18px 0 8px 0; font-size: 13px; color: #0f172a; }
  .subtitle { margin-top: 4px; color: #6b7280; font-size: 11px; }
  .hero { border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin-top: 10px; }
  .meta { display: flex; gap: 6px; min-width: 220px; }
  .meta strong { color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  td { padding: 6px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) { background: #fafafa; }
  ul { margin: 6px 0 0 18px; padding: 0; }
  .footer { margin-top: 24px; font-size: 9px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
  <div class="hero">
    <h1>{{ reference }} — {{ title }}</h1>
    <div class="subtitle">Avis de mission · {{ entity.name | default('OpsFlux') }}</div>
  </div>

  <div class="grid">
    <div class="meta"><strong>Statut</strong><span>{{ status }}</span></div>
    <div class="meta"><strong>Type</strong><span>{{ mission_type }}</span></div>
    <div class="meta"><strong>Créateur</strong><span>{{ creator_name or '--' }}</span></div>
    <div class="meta"><strong>Fenêtre</strong><span>{{ planned_start_date or '--' }} → {{ planned_end_date or '--' }}</span></div>
    <div class="meta"><strong>PAX prévus</strong><span>{{ pax_quota }}</span></div>
    <div class="meta"><strong>Préparation</strong><span>{{ preparation_progress }}% · {{ open_preparation_tasks }} tâche(s) ouverte(s)</span></div>
  </div>

  {% if description %}
  <div class="card">
    <strong>Description</strong>
    <div>{{ description }}</div>
  </div>
  {% endif %}

  <div class="card">
    <strong>Exigences mission</strong>
    <ul>
      <li>Badge site requis : {{ 'Oui' if requires_badge else 'Non' }}</li>
      <li>EPI requis : {{ 'Oui' if requires_epi else 'Non' }}</li>
      <li>Visa requis : {{ 'Oui' if requires_visa else 'Non' }}</li>
      <li>Indemnité de déplacement : {{ 'Oui' if eligible_displacement_allowance else 'Non' }}</li>
    </ul>
  </div>

  <h2>Programme mission</h2>
  {% if programs %}
  <table>
    <thead>
      <tr><th>#</th><th>Activité</th><th>Site</th><th>Période</th><th>PAX</th><th>AdS générée</th></tr>
    </thead>
    <tbody>
      {% for program in programs %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ program.activity_description }}</td>
        <td>{{ program.site_name or '--' }}</td>
        <td>{{ program.planned_start_date or '--' }} → {{ program.planned_end_date or '--' }}</td>
        <td>{{ program.pax_count or 0 }}</td>
        <td>{{ program.generated_ads_reference or '--' }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% else %}
  <p>Aucune ligne de programme.</p>
  {% endif %}

  {% if generated_ads_references %}
  <h2>AdS générées</h2>
  <p>{{ generated_ads_references | join(', ') }}</p>
  {% endif %}

  <div class="footer">OpsFlux — AVM générée le {{ generated_at }}</div>
</body>
</html>
"""

_AVM_TICKET_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.45; }
  h1 { margin: 0; font-size: 20px; color: #0f172a; }
  h2 { margin: 18px 0 8px 0; font-size: 13px; color: #0f172a; }
  .subtitle { margin-top: 4px; color: #6b7280; font-size: 11px; }
  .hero { border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin-top: 10px; }
  .meta { display: flex; gap: 6px; min-width: 220px; }
  .meta strong { color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  td { padding: 6px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) { background: #fafafa; }
  ul { margin: 6px 0 0 18px; padding: 0; }
  .footer { margin-top: 24px; font-size: 9px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
  <div class="hero">
    <h1>{{ reference }} — {{ title }}</h1>
    <div class="subtitle">Mission notice · {{ entity.name | default('OpsFlux') }}</div>
  </div>

  <div class="grid">
    <div class="meta"><strong>Status</strong><span>{{ status }}</span></div>
    <div class="meta"><strong>Type</strong><span>{{ mission_type }}</span></div>
    <div class="meta"><strong>Creator</strong><span>{{ creator_name or '--' }}</span></div>
    <div class="meta"><strong>Window</strong><span>{{ planned_start_date or '--' }} → {{ planned_end_date or '--' }}</span></div>
    <div class="meta"><strong>Planned PAX</strong><span>{{ pax_quota }}</span></div>
    <div class="meta"><strong>Preparation</strong><span>{{ preparation_progress }}% · {{ open_preparation_tasks }} open task(s)</span></div>
  </div>

  {% if description %}
  <div class="card">
    <strong>Description</strong>
    <div>{{ description }}</div>
  </div>
  {% endif %}

  <div class="card">
    <strong>Mission requirements</strong>
    <ul>
      <li>Site badge required: {{ 'Yes' if requires_badge else 'No' }}</li>
      <li>PPE required: {{ 'Yes' if requires_epi else 'No' }}</li>
      <li>Visa required: {{ 'Yes' if requires_visa else 'No' }}</li>
      <li>Displacement allowance: {{ 'Yes' if eligible_displacement_allowance else 'No' }}</li>
    </ul>
  </div>

  <h2>Mission program</h2>
  {% if programs %}
  <table>
    <thead>
      <tr><th>#</th><th>Activity</th><th>Site</th><th>Window</th><th>PAX</th><th>Generated visit notice</th></tr>
    </thead>
    <tbody>
      {% for program in programs %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ program.activity_description }}</td>
        <td>{{ program.site_name or '--' }}</td>
        <td>{{ program.planned_start_date or '--' }} → {{ program.planned_end_date or '--' }}</td>
        <td>{{ program.pax_count or 0 }}</td>
        <td>{{ program.generated_ads_reference or '--' }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  {% else %}
  <p>No mission program line.</p>
  {% endif %}

  {% if generated_ads_references %}
  <h2>Generated visit notices</h2>
  <p>{{ generated_ads_references | join(', ') }}</p>
  {% endif %}

  <div class="footer">OpsFlux — AVM generated on {{ generated_at }}</div>
</body>
</html>
"""

DEFAULT_PDF_TEMPLATES[3]["default_versions"]["fr"]["body_html"] = _AVM_TICKET_BODY_FR
DEFAULT_PDF_TEMPLATES[3]["default_versions"]["en"]["body_html"] = _AVM_TICKET_BODY_EN

_PROJECT_REPORT_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 4px 0; color: #1e3a5f; }
  h2 { font-size: 14px; margin: 20px 0 8px 0; color: #1e3a5f; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 16px; }
  .meta-item { display: flex; gap: 6px; }
  .meta-label { font-weight: 600; color: #374151; min-width: 90px; }
  .meta-value { color: #1a1a1a; }
  .description { background: #f9fafb; border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 12px 0; font-size: 10px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #fafafa; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .progress-bar { background: #e5e7eb; border-radius: 4px; height: 8px; width: 80px; display: inline-block; vertical-align: middle; }
  .progress-fill { background: #3b82f6; border-radius: 4px; height: 100%; }
  .footer { margin-top: 24px; font-size: 9px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
<h1>{{ project.code }} &mdash; {{ project.name }}</h1>
<div class="subtitle">Rapport de projet &bull; {{ generated_at }}</div>

<h2>Fiche projet</h2>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Statut</span><span class="meta-value">{{ project.status }}</span></div>
  <div class="meta-item"><span class="meta-label">Priorité</span><span class="meta-value">{{ project.priority }}</span></div>
  <div class="meta-item"><span class="meta-label">Météo</span><span class="meta-value">{{ project.weather }}</span></div>
  <div class="meta-item"><span class="meta-label">Avancement</span><span class="meta-value">{{ project.progress }}%</span></div>
  <div class="meta-item"><span class="meta-label">Chef de projet</span><span class="meta-value">{{ project.manager_name }}</span></div>
  <div class="meta-item"><span class="meta-label">Budget</span><span class="meta-value">{{ project.budget }}</span></div>
  <div class="meta-item"><span class="meta-label">Début</span><span class="meta-value">{{ project.start_date }}</span></div>
  <div class="meta-item"><span class="meta-label">Fin prévue</span><span class="meta-value">{{ project.end_date }}</span></div>
</div>

{% if project.description %}
<h2>Description</h2>
<div class="description">{{ project.description }}</div>
{% endif %}

<h2>Tâches ({{ task_count }})</h2>
{% if tasks %}
<table>
  <thead><tr><th>Tâche</th><th>Statut</th><th>Priorité</th><th>%</th><th>Début</th><th>Fin</th></tr></thead>
  <tbody>
  {% for t in tasks %}
  <tr>
    <td>{{ t.title }}</td>
    <td>{{ t.status }}</td>
    <td>{{ t.priority }}</td>
    <td>{{ t.progress }}%</td>
    <td>{{ t.start }}</td>
    <td>{{ t.end }}</td>
  </tr>
  {% endfor %}
  </tbody>
</table>
{% else %}
<p>Aucune tâche.</p>
{% endif %}

{% if milestones %}
<h2>Jalons ({{ milestone_count }})</h2>
<table>
  <thead><tr><th>Jalon</th><th>Échéance</th><th>Statut</th></tr></thead>
  <tbody>
  {% for m in milestones %}
  <tr><td>{{ m.name }}</td><td>{{ m.due_date }}</td><td>{{ m.status }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}

{% if wbs_nodes %}
<h2>WBS</h2>
<table>
  <thead><tr><th>Code</th><th>Nom</th><th>Budget</th></tr></thead>
  <tbody>
  {% for w in wbs_nodes %}
  <tr><td>{{ w.code }}</td><td>{{ w.name }}</td><td>{{ w.budget }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}

<div class="footer">OpsFlux &mdash; Rapport généré le {{ generated_at }}</div>
</body>
</html>
"""

DEFAULT_PDF_TEMPLATES[7]["default_versions"]["fr"]["body_html"] = _PROJECT_REPORT_BODY_FR

_PROJECT_REPORT_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 4px 0; color: #1e3a5f; }
  h2 { font-size: 14px; margin: 20px 0 8px 0; color: #1e3a5f; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 16px; }
  .meta-item { display: flex; gap: 6px; }
  .meta-label { font-weight: 600; color: #374151; min-width: 90px; }
  .meta-value { color: #1a1a1a; }
  .description { background: #f9fafb; border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 12px 0; font-size: 10px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #fafafa; }
  .footer { margin-top: 24px; font-size: 9px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
<h1>{{ project.code }} &mdash; {{ project.name }}</h1>
<div class="subtitle">Project Report &bull; {{ generated_at }}</div>

<h2>Project Summary</h2>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">{{ project.status }}</span></div>
  <div class="meta-item"><span class="meta-label">Priority</span><span class="meta-value">{{ project.priority }}</span></div>
  <div class="meta-item"><span class="meta-label">Weather</span><span class="meta-value">{{ project.weather }}</span></div>
  <div class="meta-item"><span class="meta-label">Progress</span><span class="meta-value">{{ project.progress }}%</span></div>
  <div class="meta-item"><span class="meta-label">Project Manager</span><span class="meta-value">{{ project.manager_name }}</span></div>
  <div class="meta-item"><span class="meta-label">Budget</span><span class="meta-value">{{ project.budget }}</span></div>
  <div class="meta-item"><span class="meta-label">Start</span><span class="meta-value">{{ project.start_date }}</span></div>
  <div class="meta-item"><span class="meta-label">End (planned)</span><span class="meta-value">{{ project.end_date }}</span></div>
</div>

{% if project.description %}
<h2>Description</h2>
<div class="description">{{ project.description }}</div>
{% endif %}

<h2>Tasks ({{ task_count }})</h2>
{% if tasks %}
<table>
  <thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>%</th><th>Start</th><th>End</th></tr></thead>
  <tbody>
  {% for t in tasks %}
  <tr>
    <td>{{ t.title }}</td>
    <td>{{ t.status }}</td>
    <td>{{ t.priority }}</td>
    <td>{{ t.progress }}%</td>
    <td>{{ t.start }}</td>
    <td>{{ t.end }}</td>
  </tr>
  {% endfor %}
  </tbody>
</table>
{% else %}
<p>No tasks.</p>
{% endif %}

{% if milestones %}
<h2>Milestones ({{ milestone_count }})</h2>
<table>
  <thead><tr><th>Milestone</th><th>Due Date</th><th>Status</th></tr></thead>
  <tbody>
  {% for m in milestones %}
  <tr><td>{{ m.name }}</td><td>{{ m.due_date }}</td><td>{{ m.status }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}

{% if wbs_nodes %}
<h2>WBS</h2>
<table>
  <thead><tr><th>Code</th><th>Name</th><th>Budget</th></tr></thead>
  <tbody>
  {% for w in wbs_nodes %}
  <tr><td>{{ w.code }}</td><td>{{ w.name }}</td><td>{{ w.budget }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}

<div class="footer">OpsFlux &mdash; Report generated on {{ generated_at }}</div>
</body>
</html>
"""

DEFAULT_PDF_TEMPLATES[7]["default_versions"]["en"]["body_html"] = _PROJECT_REPORT_BODY_EN


_PID_EXPORT_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; font-size: 10px; color: #6b7280; }
  .meta strong { color: #111827; }
  .canvas { border: 1px solid #d1d5db; padding: 8px; background: white; }
  .canvas svg { width: 100%; height: auto; display: block; }
</style>
</head>
<body>
  <div class="meta">
    <span><strong>Document</strong> {{ pid_number }}</span>
    <span><strong>Titre</strong> {{ pid_title }}</span>
    <span><strong>Revision</strong> {{ revision or '-' }}</span>
    <span><strong>Dessin</strong> {{ drawing_number or '-' }}</span>
    <span><strong>Statut</strong> {{ status }}</span>
    <span><strong>Feuille</strong> {{ sheet_format or 'A1' }}</span>
    <span><strong>Généré le</strong> {{ generated_at }}</span>
  </div>
  <div class="canvas">{{ svg_content | safe }}</div>
</body>
</html>
"""

_PID_EXPORT_BODY_EN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; font-size: 10px; color: #6b7280; }
  .meta strong { color: #111827; }
  .canvas { border: 1px solid #d1d5db; padding: 8px; background: white; }
  .canvas svg { width: 100%; height: auto; display: block; }
</style>
</head>
<body>
  <div class="meta">
    <span><strong>Document</strong> {{ pid_number }}</span>
    <span><strong>Title</strong> {{ pid_title }}</span>
    <span><strong>Revision</strong> {{ revision or '-' }}</span>
    <span><strong>Drawing</strong> {{ drawing_number or '-' }}</span>
    <span><strong>Status</strong> {{ status }}</span>
    <span><strong>Sheet</strong> {{ sheet_format or 'A1' }}</span>
    <span><strong>Generated</strong> {{ generated_at }}</span>
  </div>
  <div class="canvas">{{ svg_content | safe }}</div>
</body>
</html>
"""

DEFAULT_PDF_TEMPLATES[8]["default_versions"]["fr"]["body_html"] = _PID_EXPORT_BODY_FR
DEFAULT_PDF_TEMPLATES[8]["default_versions"]["en"]["body_html"] = _PID_EXPORT_BODY_EN


# ── Planner Gantt Export (A3 landscape) ─────────────────────────────────

_PLANNER_GANTT_EXPORT_BODY_FR = """\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  @page {
    size: A3 landscape;
    margin: 8mm 10mm 14mm 10mm;
    @bottom-left { content: "{{ entity.name or '' }}"; font-size: 7pt; color: #9ca3af; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    @bottom-center { content: "Page " counter(page) " / " counter(pages); font-size: 7pt; color: #9ca3af; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    @bottom-right { content: "OpsFlux Planner · {{ generated_at }}"; font-size: 7pt; color: #9ca3af; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; font-size: 8pt; }

  /* Header: title on the left, meta grid on the right — compact so we
     leave max vertical space to the Gantt content. */
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f3460; padding-bottom: 3mm; margin-bottom: 3mm; }
  .header .title-block h1 { font-size: 14pt; margin: 0; color: #0f3460; font-weight: 700; letter-spacing: -0.2px; }
  .header .title-block .subtitle { font-size: 8pt; color: #64748b; margin-top: 1mm; }
  .header .meta { display: grid; grid-template-columns: auto auto; gap: 0 8px; font-size: 7pt; color: #475569; }
  .header .meta dt { font-weight: 600; color: #0f3460; text-align: right; padding: 0; margin: 0; }
  .header .meta dd { margin: 0; padding: 0; text-align: left; }

  /* Gantt table — borderless, tight, with a small fixed task column */
  table.gantt {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 6.5pt;
  }
  table.gantt th, table.gantt td {
    border: 0.4pt solid #e5e7eb;
    padding: 0;
    text-align: center;
    vertical-align: middle;
    overflow: hidden;
    white-space: nowrap;
  }
  /* Task column on the left — variable width, dark border to separate
     it from the timeline area. */
  table.gantt .task-col {
    width: 38mm;
    text-align: left;
    padding: 1mm 1.5mm;
    border-right: 1pt solid #94a3b8;
    background: #f8fafc;
  }
  table.gantt thead .task-col {
    background: #0f3460;
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 6pt;
    letter-spacing: 0.5px;
  }
  /* Timeline header rows */
  table.gantt thead .group-row th {
    background: #f1f5f9;
    color: #0f3460;
    font-weight: 700;
    font-size: 7pt;
    padding: 1mm 0;
  }
  table.gantt thead .day-row th {
    background: #f8fafc;
    color: #475569;
    font-weight: 600;
    padding: 0.6mm 0;
    font-size: 5.5pt;
  }
  table.gantt thead .day-row th.dim { color: #cbd5e1; }
  table.gantt thead .day-row th.today { background: #fee2e2; color: #b91c1c; }
  /* Body rows */
  table.gantt tbody tr { height: 5mm; }
  table.gantt tbody tr.heatmap-row { height: 4mm; background: #fff; }
  table.gantt tbody tr.activity-row { height: 5mm; background: #fff; }
  table.gantt tbody td.label-cell {
    text-align: left;
    padding: 0.5mm 1.5mm;
    font-weight: 500;
    color: #0f172a;
    background: #f8fafc;
    border-right: 1pt solid #94a3b8;
  }
  table.gantt tbody tr.heatmap-row td.label-cell {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 6pt;
    color: #0f3460;
  }
  table.gantt tbody td.label-cell.indent-1 { padding-left: 4mm; }
  table.gantt tbody td.label-cell.indent-2 { padding-left: 6mm; }
  table.gantt tbody td.label-cell.indent-3 { padding-left: 8mm; }
  table.gantt tbody td.label-cell .sublabel { color: #94a3b8; font-weight: 400; font-size: 5.5pt; }

  /* Heatmap value cells */
  table.gantt td.cell-bg { font-weight: 600; font-size: 5.5pt; }
  table.gantt td.cell-bg.dim { opacity: 0.45; }

  /* Activity bar — rendered as colored cells spanning the bar's range.
     Uses background color + rounded corners on the first/last cell. */
  table.gantt td.bar-cell {
    background: #3b82f6;
    color: #fff;
    font-weight: 600;
    font-size: 5.5pt;
  }
  table.gantt td.bar-cell.first { border-top-left-radius: 1mm; border-bottom-left-radius: 1mm; }
  table.gantt td.bar-cell.last { border-top-right-radius: 1mm; border-bottom-right-radius: 1mm; }
  table.gantt td.bar-cell.draft { opacity: 0.55; }
  table.gantt td.bar-cell.critical { box-shadow: inset 0 0 0 0.5pt #ef4444; }

  .empty { color: #9ca3af; text-align: center; padding: 40mm 0; font-style: italic; }
</style>
</head>
<body>
  <div class="header">
    <div class="title-block">
      <h1>{{ title or 'Planner — Gantt' }}</h1>
      {% if subtitle %}<div class="subtitle">{{ subtitle }}</div>{% endif %}
    </div>
    <dl class="meta">
      <dt>Période</dt><dd>{{ date_range or '—' }}</dd>
      <dt>Échelle</dt><dd>{{ scale or '—' }}</dd>
      {% if generated_by %}<dt>Par</dt><dd>{{ generated_by }}</dd>{% endif %}
    </dl>
  </div>

  {% if rows and columns %}
  <table class="gantt">
    <colgroup>
      <col style="width: 38mm" />
      {% for col in columns %}<col />{% endfor %}
    </colgroup>
    <thead>
      {% if column_groups %}
      <tr class="group-row">
        <th class="task-col" rowspan="2">{{ task_col_label }}</th>
        {% for g in column_groups %}<th colspan="{{ g.span }}">{{ g.label }}</th>{% endfor %}
      </tr>
      {% else %}
      <tr><th class="task-col">{{ task_col_label }}</th>{% for col in columns %}<th></th>{% endfor %}</tr>
      {% endif %}
      <tr class="day-row">
        {% for col in columns %}
        <th class="{% if col.is_dim %}dim{% endif %}{% if col.is_today %} today{% endif %}">{{ col.label }}</th>
        {% endfor %}
      </tr>
    </thead>
    <tbody>
      {% for row in rows %}
      {% if row.is_heatmap %}
      <tr class="heatmap-row">
        <td class="label-cell indent-{{ row.level }}">
          {{ row.label }}{% if row.sublabel %} <span class="sublabel">· {{ row.sublabel }}</span>{% endif %}
        </td>
        {% for cell in row.heatmap_cells %}
        <td class="cell-bg{% if columns[loop.index0].is_dim %} dim{% endif %}"
            style="{% if cell.bg %}background:{{ cell.bg }};{% endif %}{% if cell.fg %}color:{{ cell.fg }};{% endif %}">{{ cell.value }}</td>
        {% endfor %}
      </tr>
      {% else %}
      <tr class="activity-row">
        <td class="label-cell indent-{{ row.level }}">
          {{ row.label }}{% if row.sublabel %} <span class="sublabel">· {{ row.sublabel }}</span>{% endif %}
        </td>
        {% for col in columns %}
          {% set in_bar = row.bar and loop.index0 >= row.bar.start_col and loop.index0 <= row.bar.end_col %}
          {% if in_bar %}
            {% set rel = loop.index0 - row.bar.start_col %}
            <td class="bar-cell{% if loop.index0 == row.bar.start_col %} first{% endif %}{% if loop.index0 == row.bar.end_col %} last{% endif %}{% if row.bar.is_draft %} draft{% endif %}{% if row.bar.is_critical %} critical{% endif %}"
                style="background:{{ row.bar.color }};color:{{ row.bar.text_color }}">{% if row.bar.cell_labels and rel < row.bar.cell_labels|length %}{{ row.bar.cell_labels[rel] }}{% endif %}</td>
          {% else %}
            <td class="{% if col.is_dim %}dim{% endif %}"></td>
          {% endif %}
        {% endfor %}
      </tr>
      {% endif %}
      {% endfor %}
    </tbody>
  </table>
  {% else %}
  <p class="empty">Aucune donnée Gantt à exporter.</p>
  {% endif %}
</body>
</html>
"""

# English template — keep in sync with the FR one above. Only the header
# labels and the empty-state copy differ.
_PLANNER_GANTT_EXPORT_BODY_EN = _PLANNER_GANTT_EXPORT_BODY_FR.replace(
    'lang="fr"', 'lang="en"'
).replace(
    '<dt>Période</dt>', '<dt>Range</dt>'
).replace(
    '<dt>Échelle</dt>', '<dt>Scale</dt>'
).replace(
    '<dt>Par</dt>', '<dt>By</dt>'
).replace(
    'Aucune donnée Gantt à exporter.', 'No Gantt data to export.'
)

DEFAULT_PDF_TEMPLATES[9]["default_versions"]["fr"]["body_html"] = _PLANNER_GANTT_EXPORT_BODY_FR
DEFAULT_PDF_TEMPLATES[9]["default_versions"]["en"]["body_html"] = _PLANNER_GANTT_EXPORT_BODY_EN


# ── PackLog Cargo Label HTML (index 10) ─────────────────────────────────
# 10×15 cm physical label. Kept deliberately simple so it prints clearly
# on cheap thermal printers and handheld-camera-friendly QR stays large.

_CARGO_LABEL_BODY_FR = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: #fff; color: #000;
    width: 100%; font-size: 9pt;
  }
  .label {
    width: 100%;
    border: 2pt solid #000;
    display: flex; flex-direction: column;
    min-height: 130mm;
  }

  /* ── Header: branding + service ── */
  .hdr {
    display: flex; align-items: stretch;
    border-bottom: 2pt solid #000;
  }
  .hdr-brand {
    flex: 1; background: #000; color: #fff;
    padding: 2.5mm 3mm;
    display: flex; flex-direction: column; justify-content: center;
  }
  .hdr-brand .company { font-size: 13pt; font-weight: 900; letter-spacing: 1pt; line-height: 1; }
  .hdr-brand .module  { font-size: 7pt; font-weight: 600; text-transform: uppercase;
                        letter-spacing: 1pt; opacity: 0.75; margin-top: 0.5mm; }
  .hdr-service {
    padding: 2.5mm 3mm;
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
    border-left: 1.5pt solid #000;
    min-width: 28mm;
  }
  .service-chip {
    background: #000; color: #fff;
    font-size: 7.5pt; font-weight: 900;
    text-transform: uppercase; letter-spacing: 0.5pt;
    padding: 1mm 2mm; border-radius: 1mm;
  }
  .service-date { font-size: 6pt; color: #666; margin-top: 1mm; }

  /* ── HAZMAT banner ── */
  .hazmat {
    background: #ffcc00; color: #000;
    font-weight: 900; font-size: 8.5pt;
    text-align: center; padding: 1.5mm 3mm;
    letter-spacing: 1pt; text-transform: uppercase;
    border-bottom: 2pt solid #000;
    border-top: 0.5pt solid #b8960a;
  }

  /* ── Reference block ── */
  .ref-block {
    display: flex; align-items: stretch;
    border-bottom: 2pt solid #000;
  }
  .ref-main {
    flex: 1; padding: 2.5mm 3mm;
    display: flex; flex-direction: column; justify-content: center;
  }
  .ref-sup { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #666; font-weight: 700; }
  .ref-code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 20pt; font-weight: 900;
    letter-spacing: 1pt; line-height: 1.1;
    color: #000;
  }
  .tracking-mono {
    font-family: 'Courier New', Courier, monospace;
    font-size: 6.5pt; color: #555; letter-spacing: 0.5pt;
    margin-top: 0.5mm;
  }
  .qr-col {
    width: 34mm; padding: 2mm;
    border-left: 1.5pt solid #000;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #fafafa;
  }
  .qr-col img { width: 28mm; height: 28mm; display: block; }
  .qr-col .scan-lbl { font-size: 5.5pt; color: #666; margin-top: 1mm;
                       text-transform: uppercase; letter-spacing: 0.3pt; text-align: center; }

  /* ── FROM / TO ── */
  .route {
    display: flex; border-bottom: 1.5pt solid #000;
  }
  .addr-block { flex: 1; padding: 2mm 3mm; }
  .addr-block.from { border-right: 1pt solid #ccc; }
  .addr-badge {
    display: inline-block;
    background: #000; color: #fff;
    font-size: 6pt; font-weight: 900;
    text-transform: uppercase; letter-spacing: 1.5pt;
    padding: 0.5mm 2mm; margin-bottom: 1.5mm;
  }
  .from-name { font-size: 8pt; font-weight: 700; line-height: 1.3; }
  .to-name   { font-size: 10.5pt; font-weight: 900; line-height: 1.25; text-transform: uppercase; }
  .to-sub    { font-size: 7.5pt; font-weight: 600; color: #333; margin-top: 0.5mm; }

  /* ── Details grid ── */
  .details {
    padding: 2mm 3mm;
    border-bottom: 1pt solid #ddd;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }
  .d-item { padding: 1mm 0; }
  .d-item.full { grid-column: 1 / -1; }
  .d-lbl  { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.3pt; color: #777; font-weight: 700; }
  .d-val  { font-size: 9pt; font-weight: 700; line-height: 1.2; }

  /* ── Footer ── */
  .meta {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.5mm 3mm;
    border-top: 0.5pt dashed #ccc;
  }
  .lt-badge { font-size: 6.5pt; font-weight: 700; }
  .lt-badge span { font-family: monospace; font-size: 8pt; font-weight: 900; }
  .gen-date { font-size: 5.5pt; color: #999; }
</style>

<div class="label">

  <!-- Header -->
  <div class="hdr">
    <div class="hdr-brand">
      <div class="company">{{ entity.name or 'OpsFlux' }}</div>
      <div class="module">PackLog</div>
    </div>
    <div class="hdr-service">
      <div class="service-chip">{{ cargo_type or 'GÉNÉRAL' }}</div>
      <div class="service-date">{{ generated_at }}</div>
    </div>
  </div>

  <!-- HAZMAT banner -->
  {% if hazmat %}
  <div class="hazmat">&#9888;&nbsp;&nbsp;MATIÈRE DANGEREUSE — MANIPULATION SPÉCIALE&nbsp;&nbsp;&#9888;</div>
  {% endif %}

  <!-- Reference + QR -->
  <div class="ref-block">
    <div class="ref-main">
      <div class="ref-sup">Référence colis</div>
      <div class="ref-code">{{ reference or tracking_code }}</div>
      <div class="tracking-mono">{{ tracking_code }}</div>
    </div>
    <div class="qr-col">
      {% if qr_code_data_uri %}
      <img src="{{ qr_code_data_uri }}" alt="QR"/>
      <div class="scan-lbl">Scanner</div>
      {% endif %}
    </div>
  </div>

  <!-- FROM / TO -->
  <div class="route">
    <div class="addr-block from">
      <div class="addr-badge">DE</div>
      <div class="from-name">{{ sender_name or '—' }}</div>
    </div>
    <div class="addr-block">
      <div class="addr-badge">À</div>
      <div class="to-name">{{ destination_name or recipient_name or '—' }}</div>
      {% if destination_name and recipient_name and destination_name != recipient_name %}
      <div class="to-sub">{{ recipient_name }}</div>
      {% endif %}
    </div>
  </div>

  <!-- Details -->
  <div class="details">
    {% if description %}
    <div class="d-item full">
      <div class="d-lbl">Désignation</div>
      <div class="d-val">{{ description }}</div>
    </div>
    {% endif %}
    {% if weight_kg %}
    <div class="d-item">
      <div class="d-lbl">Poids</div>
      <div class="d-val">{{ weight_kg }} kg</div>
    </div>
    {% endif %}
    {% if package_count %}
    <div class="d-item">
      <div class="d-lbl">Colis</div>
      <div class="d-val">{{ package_count }}</div>
    </div>
    {% endif %}
  </div>

  <!-- Footer / meta -->
  <div class="meta">
    {% if request_code %}
    <div class="lt-badge">N° LT : <span>{{ request_code }}</span></div>
    {% else %}
    <div></div>
    {% endif %}
    <div class="gen-date">Généré le {{ generated_at }}</div>
  </div>

</div>
</body>
</html>"""

_CARGO_LABEL_BODY_EN = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: #fff; color: #000;
    width: 100%; font-size: 9pt;
  }
  .label {
    width: 100%;
    border: 2pt solid #000;
    display: flex; flex-direction: column;
    min-height: 130mm;
  }
  .hdr { display: flex; align-items: stretch; border-bottom: 2pt solid #000; }
  .hdr-brand {
    flex: 1; background: #000; color: #fff;
    padding: 2.5mm 3mm;
    display: flex; flex-direction: column; justify-content: center;
  }
  .hdr-brand .company { font-size: 13pt; font-weight: 900; letter-spacing: 1pt; line-height: 1; }
  .hdr-brand .module  { font-size: 7pt; font-weight: 600; text-transform: uppercase;
                        letter-spacing: 1pt; opacity: 0.75; margin-top: 0.5mm; }
  .hdr-service {
    padding: 2.5mm 3mm;
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
    border-left: 1.5pt solid #000; min-width: 28mm;
  }
  .service-chip {
    background: #000; color: #fff;
    font-size: 7.5pt; font-weight: 900;
    text-transform: uppercase; letter-spacing: 0.5pt;
    padding: 1mm 2mm; border-radius: 1mm;
  }
  .service-date { font-size: 6pt; color: #666; margin-top: 1mm; }
  .hazmat {
    background: #ffcc00; color: #000;
    font-weight: 900; font-size: 8.5pt;
    text-align: center; padding: 1.5mm 3mm;
    letter-spacing: 1pt; text-transform: uppercase;
    border-bottom: 2pt solid #000; border-top: 0.5pt solid #b8960a;
  }
  .ref-block { display: flex; align-items: stretch; border-bottom: 2pt solid #000; }
  .ref-main { flex: 1; padding: 2.5mm 3mm; display: flex; flex-direction: column; justify-content: center; }
  .ref-sup { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.5pt; color: #666; font-weight: 700; }
  .ref-code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 20pt; font-weight: 900; letter-spacing: 1pt; line-height: 1.1; color: #000;
  }
  .tracking-mono { font-family: 'Courier New', Courier, monospace; font-size: 6.5pt; color: #555; letter-spacing: 0.5pt; margin-top: 0.5mm; }
  .qr-col { width: 34mm; padding: 2mm; border-left: 1.5pt solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fafafa; }
  .qr-col img { width: 28mm; height: 28mm; display: block; }
  .qr-col .scan-lbl { font-size: 5.5pt; color: #666; margin-top: 1mm; text-transform: uppercase; letter-spacing: 0.3pt; text-align: center; }
  .route { display: flex; border-bottom: 1.5pt solid #000; }
  .addr-block { flex: 1; padding: 2mm 3mm; }
  .addr-block.from { border-right: 1pt solid #ccc; }
  .addr-badge { display: inline-block; background: #000; color: #fff; font-size: 6pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5pt; padding: 0.5mm 2mm; margin-bottom: 1.5mm; }
  .from-name { font-size: 8pt; font-weight: 700; line-height: 1.3; }
  .to-name   { font-size: 10.5pt; font-weight: 900; line-height: 1.25; text-transform: uppercase; }
  .to-sub    { font-size: 7.5pt; font-weight: 600; color: #333; margin-top: 0.5mm; }
  .details { padding: 2mm 3mm; border-bottom: 1pt solid #ddd; display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .d-item { padding: 1mm 0; }
  .d-item.full { grid-column: 1 / -1; }
  .d-lbl { font-size: 6pt; text-transform: uppercase; letter-spacing: 0.3pt; color: #777; font-weight: 700; }
  .d-val { font-size: 9pt; font-weight: 700; line-height: 1.2; }
  .meta { display: flex; align-items: center; justify-content: space-between; padding: 1.5mm 3mm; border-top: 0.5pt dashed #ccc; }
  .lt-badge { font-size: 6.5pt; font-weight: 700; }
  .lt-badge span { font-family: monospace; font-size: 8pt; font-weight: 900; }
  .gen-date { font-size: 5.5pt; color: #999; }
</style>

<div class="label">

  <div class="hdr">
    <div class="hdr-brand">
      <div class="company">{{ entity.name or 'OpsFlux' }}</div>
      <div class="module">PackLog</div>
    </div>
    <div class="hdr-service">
      <div class="service-chip">{{ cargo_type or 'GENERAL' }}</div>
      <div class="service-date">{{ generated_at }}</div>
    </div>
  </div>

  {% if hazmat %}
  <div class="hazmat">&#9888;&nbsp;&nbsp;HAZARDOUS MATERIAL — SPECIAL HANDLING&nbsp;&nbsp;&#9888;</div>
  {% endif %}

  <div class="ref-block">
    <div class="ref-main">
      <div class="ref-sup">Package reference</div>
      <div class="ref-code">{{ reference or tracking_code }}</div>
      <div class="tracking-mono">{{ tracking_code }}</div>
    </div>
    <div class="qr-col">
      {% if qr_code_data_uri %}
      <img src="{{ qr_code_data_uri }}" alt="QR"/>
      <div class="scan-lbl">Scan</div>
      {% endif %}
    </div>
  </div>

  <div class="route">
    <div class="addr-block from">
      <div class="addr-badge">FROM</div>
      <div class="from-name">{{ sender_name or '—' }}</div>
    </div>
    <div class="addr-block">
      <div class="addr-badge">TO</div>
      <div class="to-name">{{ destination_name or recipient_name or '—' }}</div>
      {% if destination_name and recipient_name and destination_name != recipient_name %}
      <div class="to-sub">{{ recipient_name }}</div>
      {% endif %}
    </div>
  </div>

  <div class="details">
    {% if description %}
    <div class="d-item full">
      <div class="d-lbl">Description</div>
      <div class="d-val">{{ description }}</div>
    </div>
    {% endif %}
    {% if weight_kg %}
    <div class="d-item">
      <div class="d-lbl">Weight</div>
      <div class="d-val">{{ weight_kg }} kg</div>
    </div>
    {% endif %}
    {% if package_count %}
    <div class="d-item">
      <div class="d-lbl">Packages</div>
      <div class="d-val">{{ package_count }}</div>
    </div>
    {% endif %}
  </div>

  <div class="meta">
    {% if request_code %}
    <div class="lt-badge">LT # : <span>{{ request_code }}</span></div>
    {% else %}
    <div></div>
    {% endif %}
    <div class="gen-date">Generated {{ generated_at }}</div>
  </div>

</div>
</body>
</html>"""

DEFAULT_PDF_TEMPLATES[10]["default_versions"]["fr"]["body_html"] = _CARGO_LABEL_BODY_FR
DEFAULT_PDF_TEMPLATES[10]["default_versions"]["en"]["body_html"] = _CARGO_LABEL_BODY_EN


# ── MOC Report HTML Template ─────────────────────────────────────────────
# Réplique du Formulaire MOC (rev. 06, oct. 2025). Cinq blocs :
#   1. Demande de modifications (objectifs, description, situation actuelle,
#      modifications proposées, analyse d'impact, type).
#   2. Revue préalable de la hiérarchie + accord chef de site.
#   3. Conclusions du process engineer + drapeaux HAZOP/HAZID/ENV/PID/ESD.
#   4. Matrice de validation parallèle (HSE, Lead Process, Production, Gaz,
#      Maintenance, Métier) avec commentaires + date/visa.
#   5. Coût & niveau de validation + accords DO/DG.
# Les zones texte riches passent par le filtre `| safe` ; le service doit
# convertir le markdown source en HTML avant d'injecter les variables.

_MOC_REPORT_BODY_FR = r"""\
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<style>
  @page {
    size: A4 portrait;
    margin: 16mm 13mm 18mm 13mm;
    @bottom-center {
      content: "Formulaire MOC — Rev. 06 / Octobre 2025 — Page " counter(page) " / " counter(pages);
      font-family: "Times New Roman", serif;
      font-size: 8pt;
      color: #555;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", serif;
    font-size: 10pt;
    color: #000;
    margin: 0;
    line-height: 1.25;
  }
  h1 {
    font-size: 15pt;
    text-align: center;
    margin: 0 0 4mm 0;
    font-weight: 700;
    letter-spacing: 0.3pt;
  }
  .rev {
    text-align: right;
    font-size: 8.5pt;
    color: #333;
    margin: 0 0 4mm 0;
  }
  table.moc {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 5mm 0;
    font-size: 10pt;
    table-layout: fixed;
  }
  table.moc td, table.moc th {
    border: 0.5pt solid #000;
    padding: 1.8mm 2mm;
    vertical-align: top;
    word-wrap: break-word;
  }
  /* Teal section band — brand accent */
  .band {
    background: #11A09E;
    color: #FFFFFF;
    font-weight: 700;
    font-size: 10.5pt;
    text-align: left;
    padding: 2mm 2.5mm;
  }
  /* Light-grey sub-rows (flag questions / cost buckets) */
  .grey    { background: #F2F2F2; }
  /* Medium-grey sub-header (Nécessaire/Réalisé) */
  .greymid { background: #A6A6A6; font-weight: 700; text-align: center; }
  .label   { font-weight: 700; }
  .center  { text-align: center; }
  .rich    { font-size: 10pt; }
  .rich p  { margin: 0 0 1.5mm 0; }
  .rich ul, .rich ol { margin: 0 0 1.5mm 4mm; padding: 0; }
  .rich li { margin: 0 0 0.5mm 0; }
  /* Checkbox glyph */
  .cb {
    display: inline-block;
    width: 10pt;
    height: 10pt;
    border: 0.7pt solid #000;
    margin: 0 2pt -1pt 0;
    text-align: center;
    line-height: 10pt;
    font-size: 8pt;
    font-weight: 900;
    color: #000;
  }
  .cb.on::after { content: "\2713"; }
  /* Signature block */
  .sig-wrap  { min-height: 14mm; }
  .sig-wrap img { max-height: 14mm; max-width: 45mm; }
  .meta-small { font-size: 8.5pt; color: #333; }
  /* Inline return-motive highlight */
  .renvoi {
    border-left: 2pt solid #B22222;
    background: #FDF4F4;
    padding: 1.5mm 2mm;
    margin-top: 1.5mm;
    font-size: 9pt;
  }
  .renvoi strong { color: #B22222; }
  /* Sloted-image illustrations (schema current / proposed / impact) */
  .schema-box {
    margin-top: 2mm;
    text-align: center;
  }
  .schema-box img {
    max-width: 100%;
    max-height: 65mm;
    border: 0.3pt solid #BBB;
    padding: 1mm;
    background: #FFF;
  }
  .schema-caption {
    font-size: 8pt;
    color: #555;
    margin-top: 0.5mm;
    font-style: italic;
  }
  /* Inline images inserted via Tiptap — constrain so large schemas
     stay within the page without blowing pagination. */
  .rich img {
    max-width: 100%;
    max-height: 90mm;
    display: block;
    margin: 1.5mm auto;
  }
  /* Tables inserted via Tiptap in rich-text fields */
  .rich table {
    width: 100%;
    margin: 2mm 0;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .rich table td, .rich table th {
    border: 0.4pt solid #999;
    padding: 1.2mm 1.8mm;
    vertical-align: top;
  }
  .rich table th {
    background: #F2F2F2;
    font-weight: 700;
    text-align: left;
  }
</style>
</head>
<body>

<div class="rev">Rev. 06 I Octobre 2025</div>
<h1>Formulaire MOC</h1>

<!-- ══════════════ TABLEAU 1 — DEMANDE DE MODIFICATIONS ══════════════ -->
<table class="moc">
  <colgroup>
    <col style="width: 34%" />
    <col style="width: 33%" />
    <col style="width: 33%" />
  </colgroup>

  <!-- R0 — ID + titre section -->
  <tr>
    <td colspan="3">
      <strong>MOC ID N°</strong> {{ reference }}
      {% if title %} — <em>{{ title }}</em>{% endif %}
      <span class="meta-small">&nbsp;&nbsp;·&nbsp;&nbsp;I. Demande de modifications</span>
    </td>
  </tr>

  <!-- R1 — Band teal "Changement Envisagé" -->
  <tr><td colspan="3" class="band">Changement Envisagé</td></tr>

  <!-- R2 — Demandeur / Date / Signature (3 cols) -->
  <tr>
    <td>
      <span class="label">Demandeur :</span><br/>
      {{ initiator_display or '—' }}
      {% if initiator_function %}<br/><span class="meta-small">{{ initiator_function }}</span>{% endif %}
      {% if initiator_email %}<br/><span class="meta-small">{{ initiator_email }}</span>{% endif %}
    </td>
    <td>
      <span class="label">Date :</span><br/>
      {{ created_at or '—' }}
    </td>
    <td>
      <span class="label">Signature :</span>
      <div class="sig-wrap">
        {% if initiator_signature %}<img src="{{ initiator_signature }}" alt=""/>{% endif %}
      </div>
    </td>
  </tr>

  <!-- R3 — Objectif(s) des Modifications -->
  <tr>
    <td colspan="3">
      <span class="label">Objectif(s) des Modifications (brève description)</span>
      <div class="rich">{{ objectives or '—' }}</div>
    </td>
  </tr>

  <!-- R4 — Situation actuelle + schéma / Présentation + schéma -->
  <tr>
    <td colspan="3">
      <span class="label">Situation actuelle</span>
      <div class="rich">{{ current_situation | safe if current_situation else '—' }}</div>
      {% for src in schema_current_images %}
        <div class="schema-box">
          <img src="{{ src }}" alt="Schéma situation actuelle"/>
          <div class="schema-caption">Schéma situation actuelle{% if loop.length > 1 %} ({{ loop.index }}/{{ loop.length }}){% endif %}</div>
        </div>
      {% endfor %}
      <div style="margin-top:3mm;"></div>
      <span class="label">Présentation des modifications proposées</span>
      <div class="rich">{{ proposed_changes | safe if proposed_changes else '—' }}</div>
      {% for src in schema_proposed_images %}
        <div class="schema-box">
          <img src="{{ src }}" alt="Schéma modifications proposées"/>
          <div class="schema-caption">Schéma modifications proposées{% if loop.length > 1 %} ({{ loop.index }}/{{ loop.length }}){% endif %}</div>
        </div>
      {% endfor %}
      {% if impact_analysis or impact_images %}
        <div style="margin-top:3mm;"></div>
        <span class="label">Analyse d'impact</span>
        {% if impact_analysis %}<div class="rich">{{ impact_analysis | safe }}</div>{% endif %}
        {% for src in impact_images %}
          <div class="schema-box">
            <img src="{{ src }}" alt="Illustration impact"/>
            <div class="schema-caption">Illustration impact{% if loop.length > 1 %} ({{ loop.index }}/{{ loop.length }}){% endif %}</div>
          </div>
        {% endfor %}
      {% endif %}
    </td>
  </tr>

  <!-- R5 — Type de Modification -->
  <tr>
    <td colspan="3">
      <span class="label">Type de Modification (cocher la case appropriée)</span><br/>
      <span class="cb {% if modification_type_label == 'Permanent' %}on{% endif %}"></span> Permanent
      &nbsp;&nbsp;&nbsp;&nbsp;
      <span class="cb {% if modification_type_label == 'Temporaire' %}on{% endif %}"></span> Temporaire
      {% if temporary_start_date or temporary_end_date %}
        <span class="meta-small">&nbsp;&nbsp;—&nbsp; du {{ temporary_start_date or '?' }} au {{ temporary_end_date or '?' }}</span>
      {% endif %}
      {% if nature %}
        <br/><span class="meta-small">Nature : <strong>{{ nature }}</strong></span>
      {% endif %}
      {% if metiers %}
        <br/><span class="meta-small">Métiers : {{ metiers | join(', ') }}</span>
      {% endif %}
    </td>
  </tr>

  <!-- R6 — Band teal "Revue préalable de la Hiérarchie" -->
  <tr><td colspan="3" class="band">Revue préalable de la Hiérarchie</td></tr>

  <!-- R7 — Véritable changement au sens MOC ? -->
  <tr>
    <td colspan="3">
      <span class="label">Les modifications constituent-elles un véritable Changement au sens MOC&nbsp;?</span> (cocher)<br/>
      <span class="cb {% if is_real_change == True %}on{% endif %}"></span> Oui
      &nbsp;&nbsp;&nbsp;&nbsp;
      <span class="cb {% if is_real_change == False %}on{% endif %}"></span> Non
      {% if hierarchy_review_comment %}
        <div class="rich" style="margin-top:2mm;">{{ hierarchy_review_comment | safe }}</div>
      {% endif %}
    </td>
  </tr>

  <!-- R8 — Hiérarchie / Date / Signature -->
  <tr>
    <td>
      <span class="label">Hiérarchie :</span><br/>
      {{ site_chief_display or '—' }} &amp; Chef de site
    </td>
    <td>
      <span class="label">Date (jj/mm/aa) :</span><br/>
      {{ site_chief_approved_at or '—' }}
    </td>
    <td>
      <span class="label">Signature :</span>
      <div class="sig-wrap">
        {% if hierarchy_reviewer_signature %}<img src="{{ hierarchy_reviewer_signature }}" alt=""/>{% endif %}
      </div>
    </td>
  </tr>

  <!-- R9 — Band teal "Approbation préalable du Chef de Site" -->
  <tr><td colspan="3" class="band">Approbation préalable du Chef de Site (CDS/OM)</td></tr>

  <!-- R10 — Commentaires CDS -->
  <tr>
    <td colspan="3">
      <span class="label">Commentaires :</span>
      <div class="rich">{{ site_chief_comment | safe if site_chief_comment else '—' }}</div>
      {% if site_chief_return_requested and site_chief_return_reason %}
        <div class="renvoi"><strong>Renvoi pour modification :</strong> {{ site_chief_return_reason }}</div>
      {% endif %}
    </td>
  </tr>

  <!-- R11 — Accord de Principe -->
  <tr>
    <td colspan="3">
      <span class="label">Accord de Principe ?</span> (cocher)<br/>
      <span class="cb {% if site_chief_approved == True %}on{% endif %}"></span> Oui
      &nbsp;&nbsp;&nbsp;&nbsp;
      <span class="cb {% if site_chief_approved == False %}on{% endif %}"></span> Non
    </td>
  </tr>

  <!-- R12 — Nom du CDS / Date / Signature -->
  <tr>
    <td>
      <span class="label">Nom du CDS (OM) :</span><br/>
      {{ site_chief_display or '—' }}
    </td>
    <td>
      <span class="label">Date (jj/mm/aa) :</span><br/>
      {{ site_chief_approved_at or '—' }}
    </td>
    <td>
      <span class="label">Signature :</span>
      <div class="sig-wrap">
        {% if site_chief_signature %}<img src="{{ site_chief_signature }}" alt=""/>{% endif %}
      </div>
    </td>
  </tr>
</table>

<!-- ══════════════ TABLEAU 2 — CONCLUSIONS MOC (Process Engineer + drapeaux) ══════════════ -->
<table class="moc">
  <colgroup>
    <col style="width: 24%" />
    <col style="width: 27%" />
    <col style="width: 27%" />
    <col style="width: 22%" />
  </colgroup>

  <tr>
    <th class="band">Entité</th>
    <th class="band" colspan="2">Conclusions MOC — à transmettre au site après étude.<br/>Préalables à prendre en compte avant réalisations sur site.</th>
    <th class="band">Date / visa</th>
  </tr>

  <tr>
    <td class="label">Process Engineer</td>
    <td colspan="2">
      <div class="rich">{{ study_conclusion | safe if study_conclusion else '—' }}</div>
    </td>
    <td>
      {{ study_completed_at or '—' }}
      <div class="sig-wrap">
        {% if process_engineer_signature %}<img src="{{ process_engineer_signature }}" alt=""/>{% endif %}
      </div>
      <span class="meta-small">{{ responsible_display or '' }}</span>
    </td>
  </tr>

  <!-- Sub-header Nécessaire / Réalisé (Word leaves entity cell empty) -->
  <tr>
    <td></td>
    <td class="greymid">Nécessaire</td>
    <td class="greymid">Réalisé</td>
    <td></td>
  </tr>

  <tr>
    <td class="grey label">HAZOP / HAZID</td>
    <td class="grey center">
      <span class="cb {% if hazop_required or hazid_required %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not (hazop_required or hazid_required) %}on{% endif %}"></span> Non
    </td>
    <td class="grey center">
      <span class="cb {% if hazop_completed or hazid_completed %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not (hazop_completed or hazid_completed) %}on{% endif %}"></span> Non
    </td>
    <td></td>
  </tr>

  <tr>
    <td class="grey label">ENVIRONMENTAL ASSESSMENT</td>
    <td class="grey center">
      <span class="cb {% if environmental_required %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not environmental_required %}on{% endif %}"></span> Non
    </td>
    <td class="grey center">
      <span class="cb {% if environmental_completed %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not environmental_completed %}on{% endif %}"></span> Non
    </td>
    <td></td>
  </tr>

  <tr>
    <td class="grey label">MAJ PID</td>
    <td class="grey center">
      <span class="cb {% if pid_update_required %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not pid_update_required %}on{% endif %}"></span> Non
    </td>
    <td class="grey center">
      <span class="cb {% if pid_update_completed %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not pid_update_completed %}on{% endif %}"></span> Non
    </td>
    <td></td>
  </tr>

  <tr>
    <td class="grey label">MAJ ESD</td>
    <td class="grey center">
      <span class="cb {% if esd_update_required %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not esd_update_required %}on{% endif %}"></span> Non
    </td>
    <td class="grey center">
      <span class="cb {% if esd_update_completed %}on{% endif %}"></span> Oui
      &nbsp;
      <span class="cb {% if not esd_update_completed %}on{% endif %}"></span> Non
    </td>
    <td></td>
  </tr>
</table>

<!-- ══════════════ TABLEAU 3 — MATRICE DE VALIDATION PARALLÈLE ══════════════ -->
<table class="moc">
  <colgroup>
    <col style="width: 26%" />
    <col style="width: 52%" />
    <col style="width: 22%" />
  </colgroup>

  <tr>
    <th class="band">Entité</th>
    <th class="band">Commentaires / recommandations</th>
    <th class="band">Date / visa</th>
  </tr>

  {% for v in validations %}
  <tr>
    <td class="label">
      {{ v.role_label }}
      {% if v.metier_name %}<br/><span class="meta-small">{{ v.metier_name }}</span>{% endif %}
    </td>
    <td>
      <div class="rich">{{ v.comments | safe if v.comments else '—' }}</div>
      {% if v.level %}<div class="meta-small">Niveau : <strong>{{ v.level }}</strong></div>{% endif %}
      {% if v.return_requested and v.return_reason %}
        <div class="renvoi"><strong>Renvoi :</strong> {{ v.return_reason }}</div>
      {% endif %}
    </td>
    <td>
      {{ v.validated_at or '' }}
      {% if v.approved == True %}<div class="meta-small" style="color:#0a6b2e;"><strong>✓ Approuvé</strong></div>
      {% elif v.approved == False %}<div class="meta-small" style="color:#B22222;"><strong>✗ Refusé</strong></div>
      {% endif %}
      <div class="sig-wrap">
        {% if v.signature %}<img src="{{ v.signature }}" alt=""/>{% endif %}
      </div>
      <span class="meta-small">{{ v.validator_name or '' }}</span>
    </td>
  </tr>
  {% else %}
  <tr><td colspan="3" class="center" style="color:#666; font-style:italic;">Aucune validation enregistrée.</td></tr>
  {% endfor %}
</table>

<!-- ══════════════ TABLEAU 4 — COÛT DU MOC / NIVEAU DE VALIDATION ══════════════ -->
<table class="moc">
  <colgroup>
    <col style="width: 60%" />
    <col style="width: 40%" />
  </colgroup>

  <tr>
    <th class="band">Coût du MOC</th>
    <th class="band">Niveau Validation</th>
  </tr>
  <tr>
    <td class="grey">
      <span class="cb {% if cost_bucket_label == '< 20 MXAF' %}on{% endif %}"></span>
      0 &lt; X &lt; 20 MXAF
    </td>
    <td class="center">D.O</td>
  </tr>
  <tr>
    <td class="grey">
      <span class="cb {% if cost_bucket_label == '20 – 50 MXAF' %}on{% endif %}"></span>
      20 MXAF &lt; X &lt; 50 MXAF
    </td>
    <td class="center">D.O</td>
  </tr>
  <tr>
    <td class="grey">
      <span class="cb {% if cost_bucket_label == '50 – 100 MXAF' %}on{% endif %}"></span>
      50 MXAF &lt; X &lt; 100 MXAF
    </td>
    <td class="center">D.O</td>
  </tr>
  <tr>
    <td class="grey">
      <span class="cb {% if cost_bucket_label == '> 100 MXAF' %}on{% endif %}"></span>
      X &gt; 100 MXAF
    </td>
    <td class="center">D.O + D.G</td>
  </tr>
  {% if estimated_cost_mxaf %}
  <tr>
    <td colspan="2" class="meta-small">
      <strong>Coût estimé saisi :</strong> {{ estimated_cost_mxaf }} MXAF
    </td>
  </tr>
  {% endif %}
</table>

<h1 style="margin-top:8mm;">Formulaire Validation MOC</h1>

<!-- ══════════════ TABLEAU 5 — RÉALISATION DU MOC (Accords DO/DG) ══════════════ -->
<table class="moc">
  <colgroup>
    <col style="width: 18%" />
    <col style="width: 60%" />
    <col style="width: 22%" />
  </colgroup>

  <tr>
    <th class="band">Entité</th>
    <th class="band">Réalisation du MOC</th>
    <th class="band">Date / visa</th>
  </tr>

  <tr>
    <td class="label">D.O</td>
    <td class="grey">
      <span class="cb {% if do_execution_accord == True %}on{% endif %}"></span> Accord
      &nbsp;&nbsp;&nbsp;&nbsp;
      <span class="cb {% if do_execution_accord == False %}on{% endif %}"></span> Refus
      {% if do_execution_comment %}<div class="rich" style="margin-top:2mm;">{{ do_execution_comment | safe }}</div>{% endif %}
      {% if do_return_requested and do_return_reason %}
        <div class="renvoi"><strong>Renvoi :</strong> {{ do_return_reason }}</div>
      {% endif %}
    </td>
    <td>
      {{ do_execution_accord_at or '' }}
      <div class="sig-wrap">
        {% if do_signature %}<img src="{{ do_signature }}" alt=""/>{% endif %}
      </div>
    </td>
  </tr>

  <tr>
    <td class="label">D.G</td>
    <td class="grey">
      <span class="cb {% if dg_execution_accord == True %}on{% endif %}"></span> Accord
      &nbsp;&nbsp;&nbsp;&nbsp;
      <span class="cb {% if dg_execution_accord == False %}on{% endif %}"></span> Refus
      {% if dg_execution_comment %}<div class="rich" style="margin-top:2mm;">{{ dg_execution_comment | safe }}</div>{% endif %}
      {% if dg_return_requested and dg_return_reason %}
        <div class="renvoi"><strong>Renvoi :</strong> {{ dg_return_reason }}</div>
      {% endif %}
    </td>
    <td>
      {{ dg_execution_accord_at or '' }}
      <div class="sig-wrap">
        {% if dg_signature %}<img src="{{ dg_signature }}" alt=""/>{% endif %}
      </div>
    </td>
  </tr>
</table>

</body>
</html>"""

# EN fallback — same structure, English labels only
_MOC_REPORT_BODY_EN = _MOC_REPORT_BODY_FR \
    .replace("Formulaire MOC", "MOC Form") \
    .replace("Formulaire validation MOC", "MOC Validation Form") \
    .replace("Rev. 06 / Octobre 2025", "Rev. 06 / October 2025") \
    .replace("Référence", "Reference") \
    .replace("Site :", "Site:") \
    .replace("I. Demande de modifications", "I. Change request") \
    .replace("Type de MOC", "MOC type") \
    .replace("Changement envisagé", "Proposed change") \
    .replace("Demandeur", "Initiator") \
    .replace("Objectif(s) des modifications", "Change objective(s)") \
    .replace("Situation actuelle", "Current situation") \
    .replace("Modifications proposées", "Proposed changes") \
    .replace("Analyse d'impact", "Impact analysis") \
    .replace("Type de modification", "Modification type") \
    .replace("Temporaire", "Temporary") \
    .replace("II. Revue préalable de la hiérarchie", "II. Preliminary hierarchy review") \
    .replace("Les modifications constituent-elles un véritable changement au sens MOC ?",
             "Is this a real change per MOC rules?") \
    .replace("Commentaires hiérarchie", "Hierarchy comments") \
    .replace("Approbation préalable du chef de site (CDS / OM)",
             "Site chief approval (CDS / OM)") \
    .replace("Accord de principe", "Preliminary approval") \
    .replace("Commentaires CDS", "Site chief comments") \
    .replace("Nom du CDS / OM", "Site chief name") \
    .replace("III. Confirmation à étudier (Direction)",
             "III. Direction confirmation") \
    .replace("Directeur", "Director") \
    .replace("Priorité", "Priority") \
    .replace("1 — Haute", "1 — High") \
    .replace("2 — Normale", "2 — Normal") \
    .replace("3 — Basse", "3 — Low") \
    .replace("Commentaires directeur", "Director comments") \
    .replace("Entité", "Entity") \
    .replace("Conclusions MOC — à transmettre au site après étude",
             "MOC conclusions — to be sent to site after study") \
    .replace("Date / visa", "Date / signature") \
    .replace("Préalables à prendre en compte", "Prerequisites") \
    .replace("Étape", "Step") \
    .replace("Nécessaire", "Required") \
    .replace("Réalisé", "Completed") \
    .replace("Oui", "Yes") \
    .replace("Non", "No") \
    .replace("Commentaires / recommandations", "Comments / recommendations") \
    .replace("Niveau", "Level") \
    .replace("Approuvé", "Approved") \
    .replace("Refusé", "Rejected") \
    .replace("— Aucune validation enregistrée —", "— No validation recorded —") \
    .replace("Coût du MOC", "MOC cost") \
    .replace("Niveau de validation", "Validation level") \
    .replace("Coût estimé", "Estimated cost") \
    .replace("Réalisation du MOC", "MOC execution") \
    .replace("Accord", "Approval") \
    .replace("Refus", "Refusal") \
    .replace("Période : du", "Period: from") \
    .replace(" au ", " to ") \
    .replace("Document généré le", "Document generated on") \
    .replace("Ce formulaire reproduit le Rapport MOC",
             "This form reproduces the MOC Report")


DEFAULT_PDF_TEMPLATES[11]["default_versions"]["fr"]["body_html"] = _MOC_REPORT_BODY_FR
DEFAULT_PDF_TEMPLATES[11]["default_versions"]["en"]["body_html"] = _MOC_REPORT_BODY_EN


# ── Rendering helpers ────────────────────────────────────────────────────

def render_template_string(template_str: str, variables: dict) -> str:
    """Render a Jinja2 template string with the given variables."""
    try:
        tpl = _jinja_env.from_string(template_str)
        return tpl.render(**variables)
    except TemplateSyntaxError as e:
        logger.exception("PDF template syntax error: %s", e)
        return f"<div style='color:red;padding:16px;border:2px solid red'><b>Erreur de syntaxe dans le template PDF:</b><br>{e}</div>"
    except Exception as e:
        logger.exception("PDF template render error: %s", e)
        return f"<div style='color:red;padding:16px;border:2px solid red'><b>Erreur de rendu PDF:</b><br>{e}</div>"


# ── Page size mapping ────────────────────────────────────────────────────

PAGE_SIZES = {
    "A4": {"width": "210mm", "height": "297mm"},
    "A5": {"width": "148mm", "height": "210mm"},
    "A6": {"width": "105mm", "height": "148mm"},
    "Letter": {"width": "216mm", "height": "279mm"},
}


# ── Core resolve & render functions ──────────────────────────────────────

async def resolve_pdf_template_version(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
) -> PdfTemplateVersion | None:
    """Find the published version for a slug + entity + language.

    Resolution order:
      1. Published version in requested language for the entity
      2. Published version in any language for the entity (fallback)
      3. Global template (entity_id IS NULL) in requested language
      4. Global template in any language
      5. None if nothing found
    """
    # 1. Entity-scoped template
    result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(
            PdfTemplate.slug == slug,
            PdfTemplate.entity_id == entity_id,
            PdfTemplate.enabled == True,  # noqa: E712
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        # 3. Global template (no entity)
        result = await db.execute(
            select(PdfTemplate)
            .options(selectinload(PdfTemplate.versions))
            .where(
                PdfTemplate.slug == slug,
                PdfTemplate.entity_id.is_(None),
                PdfTemplate.enabled == True,  # noqa: E712
            )
        )
        template = result.scalar_one_or_none()

    if not template:
        return None

    # Filter published versions
    published = [v for v in template.versions if v.is_published]
    if not published:
        return None

    # Exact language match
    for v in published:
        if v.language == language:
            return v

    # Fallback to any published version
    return published[0]


async def render_pdf(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
    variables: dict | None = None,
) -> bytes | None:
    """Resolve and render a PDF template. Returns PDF bytes or None.

    Uses WeasyPrint to convert rendered HTML to PDF.
    """
    html = await render_pdf_preview(
        db, slug=slug, entity_id=entity_id, language=language, variables=variables,
    )
    if html is None:
        return None

    # Get template for page settings
    version = await resolve_pdf_template_version(
        db, slug=slug, entity_id=entity_id, language=language,
    )
    if not version:
        return None

    template = None
    # Re-fetch template for page settings
    result = await db.execute(
        select(PdfTemplate).where(PdfTemplate.id == version.template_id)
    )
    template = result.scalar_one_or_none()

    return _html_to_pdf(html, template)


def _html_to_pdf(html: str, template: "PdfTemplate | None" = None) -> bytes:
    """Convert HTML string to PDF bytes using WeasyPrint."""
    _VALID_SIZES = {"A3", "A4", "A5", "A6", "Letter", "Legal"}
    _VALID_ORIENT = {"portrait", "landscape"}
    try:
        from weasyprint import HTML, CSS

        # Build @page CSS from template settings with validation
        page_css = "@page {"
        if template:
            size = template.page_size if template.page_size in _VALID_SIZES else "A4"
            orient = template.orientation if template.orientation in _VALID_ORIENT else "portrait"
            page_css += f" size: {size} {orient};"
            mt = max(0, min(int(template.margin_top or 15), 100))
            mr = max(0, min(int(template.margin_right or 12), 100))
            mb = max(0, min(int(template.margin_bottom or 15), 100))
            ml = max(0, min(int(template.margin_left or 12), 100))
            page_css += f" margin: {mt}mm {mr}mm {mb}mm {ml}mm;"
        else:
            page_css += " size: A4 portrait; margin: 15mm 12mm 15mm 12mm;"
        page_css += " }"

        html_doc = HTML(string=html)
        css = CSS(string=page_css)
        pdf_bytes = html_doc.write_pdf(stylesheets=[css])
        return pdf_bytes
    except ImportError:
        logger.exception(
            "weasyprint is not installed. Install with: pip install weasyprint"
        )
        raise RuntimeError("weasyprint is required for PDF generation but is not installed")


async def render_pdf_preview(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
    language: str = "fr",
    variables: dict | None = None,
) -> str | None:
    """Resolve and render a PDF template. Returns rendered HTML for preview, or None."""
    template_result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(
            PdfTemplate.slug == slug,
            ((PdfTemplate.entity_id == entity_id) | (PdfTemplate.entity_id.is_(None))),
            PdfTemplate.enabled == True,  # noqa: E712
        )
        .order_by(PdfTemplate.entity_id.is_(None))
    )
    template_candidates = template_result.scalars().all()

    version = await resolve_pdf_template_version(
        db, slug=slug, entity_id=entity_id, language=language,
    )
    if not version:
        logger.info("PDF template '%s' not found or disabled for entity %s", slug, entity_id)
        return None

    template = next((candidate for candidate in template_candidates if candidate.id == version.template_id), None)
    validation = validate_pdf_template_source(
        body_html=version.body_html,
        header_html=version.header_html,
        footer_html=version.footer_html,
        variables_schema=template.variables_schema if template else None,
    )
    if not validation["valid"]:
        logger.warning("Invalid published PDF template '%s' for entity %s", slug, entity_id)
        return _build_invalid_template_html(
            title=f"Template PDF invalide: {slug}",
            issues=[issue for issue in validation["issues"] if issue["level"] == "error"],
        )

    ctx = variables or {}
    body_html = render_template_string(version.body_html, ctx)
    header_html = render_template_string(version.header_html, ctx) if version.header_html else None
    footer_html = render_template_string(version.footer_html, ctx) if version.footer_html else None
    if slug == "ads.ticket":
        body_html, header_html, footer_html = _ensure_ads_ticket_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )
    elif slug == "cargo.lt":
        body_html, header_html, footer_html = _ensure_packlog_lt_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )

    return _build_pdf_document_html(
        body_html=body_html,
        header_html=header_html,
        footer_html=footer_html,
        template=template,
    )


async def render_pdf_from_version(
    version: PdfTemplateVersion,
    template: PdfTemplate,
    variables: dict | None = None,
) -> bytes:
    """Render a specific version to PDF (for preview from admin routes)."""
    validation = validate_pdf_template_source(
        body_html=version.body_html,
        header_html=version.header_html,
        footer_html=version.footer_html,
        variables_schema=template.variables_schema,
    )
    if not validation["valid"]:
        return _html_to_pdf(
            _build_invalid_template_html(
                title=f"Template PDF invalide: {template.slug}",
                issues=[issue for issue in validation["issues"] if issue["level"] == "error"],
            ),
            template,
        )

    ctx = variables or {}
    body_html = render_template_string(version.body_html, ctx)
    header_html = render_template_string(version.header_html, ctx) if version.header_html else None
    footer_html = render_template_string(version.footer_html, ctx) if version.footer_html else None
    if template.slug == "ads.ticket":
        body_html, header_html, footer_html = _ensure_ads_ticket_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )
    elif template.slug == "cargo.lt":
        body_html, header_html, footer_html = _ensure_packlog_lt_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )

    return _html_to_pdf(
        _build_pdf_document_html(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            template=template,
        ),
        template,
    )


async def render_html_from_version(
    version: PdfTemplateVersion,
    template: PdfTemplate | None = None,
    variables: dict | None = None,
) -> str:
    """Render a specific version to HTML (for admin preview)."""
    validation = validate_pdf_template_source(
        body_html=version.body_html,
        header_html=version.header_html,
        footer_html=version.footer_html,
    )
    if not validation["valid"]:
        return _build_invalid_template_html(
            title="Template PDF invalide",
            issues=[issue for issue in validation["issues"] if issue["level"] == "error"],
        )

    ctx = variables or {}
    body_html = render_template_string(version.body_html, ctx)
    header_html = render_template_string(version.header_html, ctx) if version.header_html else None
    footer_html = render_template_string(version.footer_html, ctx) if version.footer_html else None
    if template and template.slug == "ads.ticket":
        body_html, header_html, footer_html = _ensure_ads_ticket_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )
    elif template and template.slug == "cargo.lt":
        body_html, header_html, footer_html = _ensure_packlog_lt_operational_elements(
            body_html=body_html,
            header_html=header_html,
            footer_html=footer_html,
            variables=ctx,
        )

    return _build_pdf_document_html(
        body_html=body_html,
        header_html=header_html,
        footer_html=footer_html,
        template=template,
    )


async def is_pdf_template_available(
    db: AsyncSession,
    *,
    slug: str,
    entity_id: UUID,
) -> bool:
    """Check if a PDF template is configured and has a published version."""
    result = await db.execute(
        select(PdfTemplate.id)
        .where(
            PdfTemplate.slug == slug,
            PdfTemplate.entity_id == entity_id,
            PdfTemplate.enabled == True,  # noqa: E712
        )
    )
    template_id = result.scalar_one_or_none()
    if not template_id:
        return False

    result2 = await db.execute(
        select(PdfTemplateVersion.id)
        .where(
            PdfTemplateVersion.template_id == template_id,
            PdfTemplateVersion.is_published == True,  # noqa: E712
        )
        .limit(1)
    )
    return result2.scalar_one_or_none() is not None
