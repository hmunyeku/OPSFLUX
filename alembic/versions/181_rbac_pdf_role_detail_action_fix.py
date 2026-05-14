"""Refresh role_detail body — fix 'None' literal in action column.

Revision ID: 181_rbac_pdf_role_detail_action_fix
Revises: 180_rbac_pdf_matrix_role_perms_cover_fix
Create Date: 2026-05-14 18:35

role_detail.{fr,en}.body.html rendered `{{ perm.action }}` with no
default — so legacy 2-segment permission codes (where the DB column
is Python None) produced the literal string "None" in the action
column. Audit of role-detail PDF for role CAPITAINE in prod (2026-05)
showed 6 such cells.

Fix already applied on disk: `{{ perm.action or '—' }}` (commit XXXX).
This migration re-reads the file and overwrites the stored body in
`pdf_template_versions` for both FR and EN.

Same pattern as migrations 179 and 180. Idempotent. Downgrade is a
no-op (the previous content was the buggy version).
"""
from pathlib import Path

from alembic import op
from sqlalchemy import text


# revision identifiers
revision = "181_rbac_pdf_role_detail_action_fix"
down_revision = "180_rbac_pdf_matrix_role_perms_cover_fix"
branch_labels = None
depends_on = None


_STATIC_ROOT = Path(__file__).resolve().parents[2] / "app" / "static"
_RBAC_DIR = _STATIC_ROOT / "rbac_pdf_templates"
_SHARED_DIR = _RBAC_DIR / "_shared"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


_TARGET_SLUG = "core.rbac.role_detail"
_FILE_STEM = "role_detail"


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
        return
    template_id = tid_row[0]

    # Match migration 176's css_block formula exactly.
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
    # No meaningful rollback: previous content was the buggy version.
    pass
