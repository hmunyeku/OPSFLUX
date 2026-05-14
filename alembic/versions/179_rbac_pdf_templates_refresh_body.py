"""Refresh RBAC PDF template bodies after on-disk template fixes.

Revision ID: 179_rbac_pdf_templates_refresh_body
Revises: 178_rbac_phase3_cleanup_legacy_codes
Create Date: 2026-05-14 18:15

The runtime renderer reads template bodies from ``pdf_template_versions``
(seeded by migration 176), NOT from disk. After fixing three rendering
defects directly in the on-disk template files (commit `5a9a166e`):

  * ``_shared/footer.html`` — show real SHA-256, drop the leading "…"
    when ``content_hash`` is empty.
  * ``permission_catalog.{fr,en}.body.html`` — replace
    ``| default('—')`` (only fires on Undefined) with ``or '—'`` (also
    fires on Python ``None``) for namespace/resource/action columns.
  * ``group_detail.{fr,en}.body.html`` — same fix for ``role.module``.

…the DB rows still hold the OLD body. This migration re-reads the
affected files from disk and overwrites the matching version rows.

Three groups of UPDATEs:

  1. **footer_html** on EVERY ``pdf_template_versions`` row whose
     template lives in ``app/static/rbac_pdf_templates/`` (slugs
     starting with ``core.rbac.``) — both languages.

  2. **body_html** for ``permission_catalog`` and ``group_detail``
     (FR + EN) re-built from disk with the css_block prepended (same
     formula as migration 176).

Idempotent: re-running just overwrites with the same content. Safe to
re-run after future template edits to bring the DB back in sync.

Downgrade is a no-op: there is no meaningful "old body" to restore —
the previous content was incorrect.
"""
from pathlib import Path

from alembic import op
from sqlalchemy import text


# revision identifiers
revision = "179_rbac_pdf_templates_refresh_body"
down_revision = "178_rbac_phase3_cleanup_legacy_codes"
branch_labels = None
depends_on = None


_STATIC_ROOT = Path(__file__).resolve().parents[2] / "app" / "static"
_RBAC_DIR = _STATIC_ROOT / "rbac_pdf_templates"
_SHARED_DIR = _RBAC_DIR / "_shared"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# Template files affected by the body fixes (slug, file_stem).
_BODY_REFRESH_TARGETS: list[tuple[str, str]] = [
    ("core.rbac.permission_catalog", "permission_catalog"),
    ("core.rbac.group_detail", "group_detail"),
]


def upgrade():
    conn = op.get_bind()

    # ── 1. Refresh footer_html on every RBAC template version ──
    # New shared footer fixes the "SHA-256: …" leak by guarding on
    # an empty content_hash and rendering first-16 + last-8 chars.
    footer_html = _read(_SHARED_DIR / "footer.html")
    conn.execute(
        text(
            """
            UPDATE pdf_template_versions ptv
            SET footer_html = :footer
            FROM pdf_templates pt
            WHERE ptv.template_id = pt.id
              AND pt.slug LIKE 'core.rbac.%'
            """
        ),
        {"footer": footer_html},
    )

    # ── 2. Refresh body_html for permission_catalog + group_detail ──
    # Both FR and EN per template. The seed prepends the shared CSS
    # block (common.css) at the top of body_html; we replicate the
    # exact formula here so the rendered output stays consistent.
    # Match migration 176 exactly: f"<style>{common_css}</style>" with no
    # surrounding newlines so the diff in body_html reflects only the
    # template fix, not whitespace noise.
    common_css = _read(_SHARED_DIR / "common.css")
    css_inlined = f"<style>{common_css}</style>"

    for slug, file_stem in _BODY_REFRESH_TARGETS:
        # Resolve template_id from slug (system template, entity_id IS NULL)
        tid_row = conn.execute(
            text(
                "SELECT id FROM pdf_templates "
                "WHERE slug = :slug AND entity_id IS NULL"
            ),
            {"slug": slug},
        ).first()
        if not tid_row:
            # Template not seeded yet — skip silently (migration 176
            # not applied; nothing to refresh).
            continue
        template_id = tid_row[0]

        for lang in ("fr", "en"):
            body_path = _RBAC_DIR / f"{file_stem}.{lang}.body.html"
            if not body_path.exists():
                body_path = _RBAC_DIR / f"{file_stem}.fr.body.html"
            body_html = css_inlined + "\n" + _read(body_path)

            conn.execute(
                text(
                    """
                    UPDATE pdf_template_versions
                    SET body_html = :body
                    WHERE template_id = :tid AND language = :lang
                    """
                ),
                {"body": body_html, "tid": template_id, "lang": lang},
            )


def downgrade():
    # No meaningful rollback: the previous content was the buggy version.
    # Roll back by reverting the source files and re-applying.
    pass
