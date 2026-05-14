"""Refresh matrix_role_permissions cover page body in DB.

Revision ID: 180_rbac_pdf_matrix_role_perms_cover_fix
Revises: 179_rbac_pdf_templates_refresh_body
Create Date: 2026-05-14 18:30

The cover page of the role-permissions matrix produced a near-empty
page 2 in prod (only the `Référence audit : <uuid>` paragraph + footer).
Root cause: `.compliance-note { margin-top: 20mm }` + the height of the
first paragraph pushed the second paragraph onto the next page, even
though the cover-page section had no explicit page-break-after.

Fix (already applied on disk in commit XXXX):
  * reduce ``.compliance-note`` margin-top from 20mm → 12mm
  * add ``page-break-inside: avoid`` so the two paragraphs render
    together on whichever page they fit

Like migration 179 this re-reads the file from disk and overwrites
the stored ``body_html`` for both FR and EN versions. Idempotent.
Downgrade is a no-op (the previous content was the buggy version).
"""
from pathlib import Path

from alembic import op
from sqlalchemy import text


# revision identifiers
revision = "180_rbac_pdf_matrix_role_perms_cover_fix"
down_revision = "179_rbac_pdf_templates_refresh_body"
branch_labels = None
depends_on = None


_STATIC_ROOT = Path(__file__).resolve().parents[2] / "app" / "static"
_RBAC_DIR = _STATIC_ROOT / "rbac_pdf_templates"
_SHARED_DIR = _RBAC_DIR / "_shared"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


_TARGET_SLUG = "core.rbac.matrix_role_permissions"
_FILE_STEM = "matrix_role_permissions"


def upgrade():
    conn = op.get_bind()

    tid_row = conn.execute(
        text(
            "SELECT id FROM pdf_templates "
            "WHERE slug = :slug AND entity_id IS NULL"
        ),
        {"slug": _TARGET_SLUG},
    ).first()
    if not tid_row:
        # Template not seeded (migration 176 not applied) — nothing to do.
        return
    template_id = tid_row[0]

    # Match migration 176's css_block formula exactly so the diff in the
    # stored body_html reflects only the cover-page CSS fix.
    common_css = _read(_SHARED_DIR / "common.css")
    css_inlined = f"<style>{common_css}</style>"

    for lang in ("fr", "en"):
        body_path = _RBAC_DIR / f"{_FILE_STEM}.{lang}.body.html"
        if not body_path.exists():
            body_path = _RBAC_DIR / f"{_FILE_STEM}.fr.body.html"
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
    pass
