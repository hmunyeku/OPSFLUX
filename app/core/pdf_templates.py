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
        issues.append({"level": "warning", "area": "variables", "message": f"Variable non declaree dans le schema: {var_name}."})

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
    <p>Le modele PDF publie contient des erreurs bloquantes. Le document d'origine n'a pas ete execute comme template libre.</p>
    <p>Diagnostics:</p>
    <ul>{items or '<li>Aucun detail disponible.</li>'}</ul>
  </div>
</body>
</html>"""


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
        "description": "Travel authorization ticket for ADS (Autorisation De Sortie). "
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
            "passengers": "List of passenger objects [{name, company, badge_number, compliance_status}]",
            "generated_at": "PDF generation timestamp",
            "qr_data": "Data to encode in QR code (defaults to reference)",
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
        "name": "Document Export (Report Editor)",
        "description": "Export a Report Editor document as a styled PDF.",
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
            "departure_date": "Departure date and time",
            "departure_location": "Departure location",
            "arrival_location": "Arrival location",
            "passengers": "List of passenger dicts",
            "total_passengers": "Total passenger count",
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
            "departure_date": "Departure date and time",
            "departure_location": "Departure location",
            "arrival_location": "Arrival location",
            "cargo_items": "List of cargo dicts",
            "total_cargo_items": "Total cargo item count",
            "total_weight_kg": "Total cargo weight",
            "total_packages": "Total package count",
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
            "receiver_name": "Receiver name",
            "destination_name": "Destination installation name",
            "requester_name": "Requester name",
            "description": "Shipping request description",
            "imputation_reference": "Imputation reference",
            "cargo_items": "List of cargo items linked to the request",
            "total_cargo_items": "Total cargo item count",
            "total_weight_kg": "Total cargo weight",
            "total_packages": "Total package count",
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
        "description": "Rapport PDF complet d'un projet: fiche, taches, jalons, WBS.",
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
            "project.priority": "Priorite",
            "project.progress": "Pourcentage d'avancement",
            "project.weather": "Meteo du projet",
            "project.start_date": "Date de debut",
            "project.end_date": "Date de fin prevue",
            "project.budget": "Budget",
            "project.description": "Description",
            "project.manager_name": "Chef de projet",
            "tasks": "Liste des taches [{title, status, priority, progress, start, end}]",
            "milestones": "Liste des jalons [{name, due_date, status}]",
            "wbs_nodes": "Noeuds WBS [{code, name, budget}]",
            "task_count": "Nombre de taches",
            "milestone_count": "Nombre de jalons",
            "generated_at": "Date de generation",
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
            "pid_number": "Numero du document PID",
            "pid_title": "Titre du PID",
            "revision": "Revision courante",
            "drawing_number": "Numero de dessin",
            "status": "Statut du document",
            "sheet_format": "Format de feuille",
            "svg_content": "Contenu SVG du schema",
            "generated_at": "Date de generation",
            "entity.name": "Nom de l'entite",
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
      <div class="ref-label">Autorisation de Sortie</div>
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
            <div class="field-label">Categorie</div>
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
              <th>Societe</th>
              <th>Badge</th>
              <th>Conformite</th>
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
    <span>Document genere le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- Autorisation de Sortie</span>
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
      <div class="ref-label">Travel Authorization</div>
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
    <span>{{ entity.name | default('OpsFlux') }} -- Travel Authorization</span>
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
        <th>Societe</th>
        <th>N. Badge</th>
        <th>Conformite</th>
        <th>Siege</th>
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
    <span>Genere le {{ generated_at | default('--') }}</span>
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
    {{ entity.name | default('OpsFlux') }} &mdash; {{ document_number }} &mdash; Genere le {{ generated_at | default('--') }}
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
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 16px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
  .meta-grid .meta-item { flex: 1; min-width: 140px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-grid .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-grid .value { font-size: 10pt; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .capacity-bar { margin-top: 12px; padding: 8px; background: #e8edf3; border-radius: 4px; text-align: center; font-size: 9pt; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">MANIFESTE DE VOYAGE</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">N. Voyage</div><div class="value">{{ voyage_number }}</div></div>
    <div class="meta-item"><div class="label">Type de transport</div><div class="value">{{ transport_type }}</div></div>
    <div class="meta-item"><div class="label">Transporteur</div><div class="value">{{ carrier | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Date de depart</div><div class="value">{{ departure_date }}</div></div>
    <div class="meta-item"><div class="label">Lieu de depart</div><div class="value">{{ departure_location }}</div></div>
    <div class="meta-item"><div class="label">Lieu d'arrivee</div><div class="value">{{ arrival_location }}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Nom</th><th>Societe</th><th>Badge</th><th>Conformite</th></tr></thead>
    <tbody>
      {% for pax in passengers %}
      <tr><td>{{ loop.index }}</td><td>{{ pax.name }}</td><td>{{ pax.company | default('--') }}</td><td>{{ pax.badge_number | default('--') }}</td><td>{{ pax.compliance_status | default('--') }}</td></tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="capacity-bar">
    Passagers : <strong>{{ total_passengers | default(passengers | length) }}</strong> / {{ max_capacity | default('--') }}
  </div>
  <div class="footer">
    <span>Genere le {{ generated_at | default('--') }}</span>
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
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 16px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
  .meta-grid .meta-item { flex: 1; min-width: 140px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-grid .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-grid .value { font-size: 10pt; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .capacity-bar { margin-top: 12px; padding: 8px; background: #e8edf3; border-radius: 4px; text-align: center; font-size: 9pt; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">VOYAGE MANIFEST</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Voyage No.</div><div class="value">{{ voyage_number }}</div></div>
    <div class="meta-item"><div class="label">Transport Type</div><div class="value">{{ transport_type }}</div></div>
    <div class="meta-item"><div class="label">Carrier</div><div class="value">{{ carrier | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Departure Date</div><div class="value">{{ departure_date }}</div></div>
    <div class="meta-item"><div class="label">Departure Location</div><div class="value">{{ departure_location }}</div></div>
    <div class="meta-item"><div class="label">Arrival Location</div><div class="value">{{ arrival_location }}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Name</th><th>Company</th><th>Badge</th><th>Compliance</th></tr></thead>
    <tbody>
      {% for pax in passengers %}
      <tr><td>{{ loop.index }}</td><td>{{ pax.name }}</td><td>{{ pax.company | default('--') }}</td><td>{{ pax.badge_number | default('--') }}</td><td>{{ pax.compliance_status | default('--') }}</td></tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="capacity-bar">
    Passengers: <strong>{{ total_passengers | default(passengers | length) }}</strong> / {{ max_capacity | default('--') }}
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
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 14px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .meta-item { flex: 1; min-width: 140px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-size: 10pt; font-weight: 600; }
  .totals { display: flex; gap: 10px; margin-bottom: 14px; }
  .total-box { flex: 1; background: #e8edf3; border-radius: 4px; padding: 8px; }
  .total-box .label { font-size: 7pt; text-transform: uppercase; color: #667085; }
  .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 7px; font-size: 7.5pt; text-transform: uppercase; }
  td { padding: 5px 7px; border-bottom: 1px solid #ddd; font-size: 8.5pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">MANIFESTE CARGO</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Voyage</div><div class="value">{{ voyage_number }}</div></div>
    <div class="meta-item"><div class="label">Transport</div><div class="value">{{ transport_type }}</div></div>
    <div class="meta-item"><div class="label">Vecteur</div><div class="value">{{ carrier | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Depart</div><div class="value">{{ departure_location }}</div></div>
    <div class="meta-item"><div class="label">Arrivee</div><div class="value">{{ arrival_location }}</div></div>
    <div class="meta-item"><div class="label">Date</div><div class="value">{{ departure_date }}</div></div>
  </div>
  <div class="totals">
    <div class="total-box"><div class="label">Colis</div><div class="value">{{ total_cargo_items | default(cargo_items | length) }}</div></div>
    <div class="total-box"><div class="label">Poids total</div><div class="value">{{ total_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Packages</div><div class="value">{{ total_packages | default('--') }}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Tracking</th>
        <th>Demande</th>
        <th>Designation</th>
        <th>Destination</th>
        <th>Destinataire</th>
        <th>Poids</th>
        <th>Colis</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ cargo.tracking_code }}</td>
        <td>{{ cargo.request_code | default('--') }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}</td>
        <td>{{ cargo.destination_name | default('--') }}</td>
        <td>{{ cargo.receiver_name | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="footer">
    <span>Genere le {{ generated_at | default('--') }}</span>
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
  .header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #16213e; margin-bottom: 14px; }
  .header .title { font-size: 16pt; font-weight: 700; color: #16213e; }
  .header .subtitle { font-size: 10pt; color: #555; margin-top: 4px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .meta-item { flex: 1; min-width: 140px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-size: 10pt; font-weight: 600; }
  .totals { display: flex; gap: 10px; margin-bottom: 14px; }
  .total-box { flex: 1; background: #e8edf3; border-radius: 4px; padding: 8px; }
  .total-box .label { font-size: 7pt; text-transform: uppercase; color: #667085; }
  .total-box .value { font-size: 11pt; font-weight: 700; color: #16213e; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 7px; font-size: 7.5pt; text-transform: uppercase; }
  td { padding: 5px 7px; border-bottom: 1px solid #ddd; font-size: 8.5pt; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">CARGO MANIFEST</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Voyage</div><div class="value">{{ voyage_number }}</div></div>
    <div class="meta-item"><div class="label">Transport</div><div class="value">{{ transport_type }}</div></div>
    <div class="meta-item"><div class="label">Vector</div><div class="value">{{ carrier | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Departure</div><div class="value">{{ departure_location }}</div></div>
    <div class="meta-item"><div class="label">Arrival</div><div class="value">{{ arrival_location }}</div></div>
    <div class="meta-item"><div class="label">Date</div><div class="value">{{ departure_date }}</div></div>
  </div>
  <div class="totals">
    <div class="total-box"><div class="label">Cargo items</div><div class="value">{{ total_cargo_items | default(cargo_items | length) }}</div></div>
    <div class="total-box"><div class="label">Total weight</div><div class="value">{{ total_weight_kg | default('--') }} kg</div></div>
    <div class="total-box"><div class="label">Packages</div><div class="value">{{ total_packages | default('--') }}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Tracking</th>
        <th>Request</th>
        <th>Description</th>
        <th>Destination</th>
        <th>Receiver</th>
        <th>Weight</th>
        <th>Packages</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ cargo.tracking_code }}</td>
        <td>{{ cargo.request_code | default('--') }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}</td>
        <td>{{ cargo.destination_name | default('--') }}</td>
        <td>{{ cargo.receiver_name | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- TravelWiz Cargo</span>
  </div>
</body>
</html>"""

_CARGO_LT_BODY_FR = """\
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
  .meta-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .meta-item { flex: 1; min-width: 160px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-size: 10pt; font-weight: 600; }
  .description { margin-bottom: 14px; padding: 10px; background: #f8f9fa; border-left: 3px solid #16213e; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">LETTRE DE TRANSPORT</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Reference</div><div class="value">{{ request_code }}</div></div>
    <div class="meta-item"><div class="label">Intitule</div><div class="value">{{ request_title }}</div></div>
    <div class="meta-item"><div class="label">Statut</div><div class="value">{{ request_status }}</div></div>
    <div class="meta-item"><div class="label">Expediteur</div><div class="value">{{ sender_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Destinataire</div><div class="value">{{ receiver_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Destination</div><div class="value">{{ destination_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Demandeur</div><div class="value">{{ requester_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Imputation</div><div class="value">{{ imputation_reference | default('--') }}</div></div>
  </div>
  <div class="description">{{ description | default('--') }}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Tracking</th>
        <th>Designation</th>
        <th>Type</th>
        <th>Poids</th>
        <th>Colis</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ cargo.tracking_code }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}</td>
        <td>{{ cargo.cargo_type | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="footer">
    <span>Genere le {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- LT Cargo</span>
  </div>
</body>
</html>"""

_CARGO_LT_BODY_EN = """\
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
  .meta-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .meta-item { flex: 1; min-width: 160px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
  .meta-item .label { font-size: 7pt; text-transform: uppercase; color: #888; }
  .meta-item .value { font-size: 10pt; font-weight: 600; }
  .description { margin-bottom: 14px; padding: 10px; background: #f8f9fa; border-left: 3px solid #16213e; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #16213e; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 9pt; }
  tr:nth-child(even) { background: #f8f9fa; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 7pt; color: #888; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">TRANSPORT LETTER</div>
    <div class="subtitle">{{ entity.name | default('OpsFlux') }}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><div class="label">Reference</div><div class="value">{{ request_code }}</div></div>
    <div class="meta-item"><div class="label">Title</div><div class="value">{{ request_title }}</div></div>
    <div class="meta-item"><div class="label">Status</div><div class="value">{{ request_status }}</div></div>
    <div class="meta-item"><div class="label">Sender</div><div class="value">{{ sender_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Receiver</div><div class="value">{{ receiver_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Destination</div><div class="value">{{ destination_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Requester</div><div class="value">{{ requester_name | default('--') }}</div></div>
    <div class="meta-item"><div class="label">Imputation</div><div class="value">{{ imputation_reference | default('--') }}</div></div>
  </div>
  <div class="description">{{ description | default('--') }}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Tracking</th>
        <th>Description</th>
        <th>Type</th>
        <th>Weight</th>
        <th>Packages</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {% for cargo in cargo_items %}
      <tr>
        <td>{{ loop.index }}</td>
        <td>{{ cargo.tracking_code }}</td>
        <td>{{ cargo.designation | default(cargo.description) }}</td>
        <td>{{ cargo.cargo_type | default('--') }}</td>
        <td>{{ cargo.weight_kg | default('--') }}</td>
        <td>{{ cargo.package_count | default('--') }}</td>
        <td>{{ cargo.status_label | default(cargo.status) }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
  <div class="footer">
    <span>Generated on {{ generated_at | default('--') }}</span>
    <span>{{ entity.name | default('OpsFlux') }} -- Cargo LT</span>
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
DEFAULT_PDF_TEMPLATES[3]["default_versions"]["fr"]["body_html"] = _VOYAGE_MANIFEST_BODY_FR
DEFAULT_PDF_TEMPLATES[3]["default_versions"]["en"]["body_html"] = _VOYAGE_MANIFEST_BODY_EN
DEFAULT_PDF_TEMPLATES[4]["default_versions"]["fr"]["body_html"] = _VOYAGE_CARGO_MANIFEST_BODY_FR
DEFAULT_PDF_TEMPLATES[4]["default_versions"]["en"]["body_html"] = _VOYAGE_CARGO_MANIFEST_BODY_EN
DEFAULT_PDF_TEMPLATES[5]["default_versions"]["fr"]["body_html"] = _CARGO_LT_BODY_FR
DEFAULT_PDF_TEMPLATES[5]["default_versions"]["en"]["body_html"] = _CARGO_LT_BODY_EN

# ── Project Report HTML ─────────────────────────────────────────────────

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
  <div class="meta-item"><span class="meta-label">Priorite</span><span class="meta-value">{{ project.priority }}</span></div>
  <div class="meta-item"><span class="meta-label">Meteo</span><span class="meta-value">{{ project.weather }}</span></div>
  <div class="meta-item"><span class="meta-label">Avancement</span><span class="meta-value">{{ project.progress }}%</span></div>
  <div class="meta-item"><span class="meta-label">Chef de projet</span><span class="meta-value">{{ project.manager_name }}</span></div>
  <div class="meta-item"><span class="meta-label">Budget</span><span class="meta-value">{{ project.budget }}</span></div>
  <div class="meta-item"><span class="meta-label">Debut</span><span class="meta-value">{{ project.start_date }}</span></div>
  <div class="meta-item"><span class="meta-label">Fin prevue</span><span class="meta-value">{{ project.end_date }}</span></div>
</div>

{% if project.description %}
<h2>Description</h2>
<div class="description">{{ project.description }}</div>
{% endif %}

<h2>Taches ({{ task_count }})</h2>
{% if tasks %}
<table>
  <thead><tr><th>Tache</th><th>Statut</th><th>Priorite</th><th>%</th><th>Debut</th><th>Fin</th></tr></thead>
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
<p>Aucune tache.</p>
{% endif %}

{% if milestones %}
<h2>Jalons ({{ milestone_count }})</h2>
<table>
  <thead><tr><th>Jalon</th><th>Echeance</th><th>Statut</th></tr></thead>
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

<div class="footer">OpsFlux &mdash; Rapport genere le {{ generated_at }}</div>
</body>
</html>
"""

DEFAULT_PDF_TEMPLATES[6]["default_versions"]["fr"]["body_html"] = _PROJECT_REPORT_BODY_FR

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

DEFAULT_PDF_TEMPLATES[6]["default_versions"]["en"]["body_html"] = _PROJECT_REPORT_BODY_EN


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
    <span><strong>Genere le</strong> {{ generated_at }}</span>
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

DEFAULT_PDF_TEMPLATES[7]["default_versions"]["fr"]["body_html"] = _PID_EXPORT_BODY_FR
DEFAULT_PDF_TEMPLATES[7]["default_versions"]["en"]["body_html"] = _PID_EXPORT_BODY_EN


# ── Rendering helpers ────────────────────────────────────────────────────

def render_template_string(template_str: str, variables: dict) -> str:
    """Render a Jinja2 template string with the given variables."""
    try:
        tpl = _jinja_env.from_string(template_str)
        return tpl.render(**variables)
    except TemplateSyntaxError as e:
        logger.error("PDF template syntax error: %s", e)
        return f"<div style='color:red;padding:16px;border:2px solid red'><b>Erreur de syntaxe dans le template PDF:</b><br>{e}</div>"
    except Exception as e:
        logger.error("PDF template render error: %s", e)
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
        logger.error(
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

    return _build_pdf_document_html(
        body_html=body_html,
        header_html=header_html,
        footer_html=footer_html,
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
