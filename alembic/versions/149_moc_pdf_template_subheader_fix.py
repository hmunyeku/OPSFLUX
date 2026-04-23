"""Propagate MOC PDF template sub-header cosmetic fix to existing entities.

The `moc.report` PDF template had a small divergence from the PERENCO paper
form (rev. 06, octobre 2025): the sub-header of "Tableau 2 — Conclusions MOC"
showed "Process Engineer" in the entity column where the Word form leaves it
empty. The template was seeded into every entity verbatim, so each tenant's
`pdf_template_versions` row carries the old markup.

Because the seed endpoint is idempotent (it only creates a template when the
slug is missing), fixing `app/core/pdf_templates.py` alone does not reach
existing entities. This migration walks every published FR/EN version of
`moc.report`, detects the old sub-header substring, and when found:

  * creates a new `pdf_template_versions` row with body_html patched,
    version_number bumped, is_published=True, tagged with a marker comment
    so downgrade can identify its own work;
  * unpublishes the previous version.

Entities whose admin already rewrote that section are left untouched
(substring match fails → row skipped).

Revision ID: 149_moc_pdf_template_subheader_fix
Revises: 148_audit_log_indexes
Create Date: 2026-04-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "149_moc_pdf_template_subheader_fix"
down_revision = "148_audit_log_indexes"
branch_labels = None
depends_on = None


# Exact substring that appears in the un-modified seeded template. Anchored
# to enough surrounding context to avoid false positives — this is the only
# place in the MOC body that combines the "Process Engineer" label with the
# "greymid Nécessaire" cell.
_OLD_SUBHEADER = (
    '<!-- Sub-header Nécessaire / Réalisé -->\n'
    '  <tr>\n'
    '    <td class="label">Process Engineer</td>\n'
    '    <td class="greymid">Nécessaire</td>\n'
    '    <td class="greymid">Réalisé</td>\n'
    '    <td></td>\n'
    '  </tr>'
)

# New version with entity cell emptied + marker comment so downgrade can
# recognise rows this migration created.
_NEW_SUBHEADER = (
    '<!-- Sub-header Nécessaire / Réalisé (Word leaves entity cell empty) -->\n'
    '  <!-- mig:149_moc_subheader -->\n'
    '  <tr>\n'
    '    <td></td>\n'
    '    <td class="greymid">Nécessaire</td>\n'
    '    <td class="greymid">Réalisé</td>\n'
    '    <td></td>\n'
    '  </tr>'
)

_MARKER = "<!-- mig:149_moc_subheader -->"


def upgrade() -> None:
    bind = op.get_bind()

    # Pull every published FR/EN version of `moc.report`.
    rows = bind.execute(
        sa.text(
            """
            SELECT v.id, v.template_id, v.version_number, v.language, v.body_html,
                   v.header_html, v.footer_html, v.created_by, t.entity_id
              FROM pdf_template_versions v
              JOIN pdf_templates t ON t.id = v.template_id
             WHERE t.slug = 'moc.report'
               AND v.is_published = true
               AND v.language IN ('fr','en')
            """
        )
    ).fetchall()

    patched_count = 0
    for row in rows:
        body = row.body_html or ""
        if _OLD_SUBHEADER not in body:
            continue  # admin-forked or already patched — skip

        new_body = body.replace(_OLD_SUBHEADER, _NEW_SUBHEADER, 1)

        # Compute next version_number for this template.
        next_n = bind.execute(
            sa.text(
                "SELECT COALESCE(MAX(version_number), 0) + 1 "
                "FROM pdf_template_versions WHERE template_id = :tid"
            ),
            {"tid": row.template_id},
        ).scalar_one()

        # Insert the patched version as published.
        bind.execute(
            sa.text(
                """
                INSERT INTO pdf_template_versions (
                    id, template_id, version_number, language,
                    body_html, header_html, footer_html,
                    is_published, created_by, created_at
                ) VALUES (
                    gen_random_uuid(), :tid, :n, :lang,
                    :body, :header, :footer,
                    true, :created_by, NOW()
                )
                """
            ),
            {
                "tid": row.template_id,
                "n": next_n,
                "lang": row.language,
                "body": new_body,
                "header": row.header_html,
                "footer": row.footer_html,
                "created_by": row.created_by,
            },
        )

        # Unpublish the old version (only that same language, same template).
        bind.execute(
            sa.text(
                "UPDATE pdf_template_versions SET is_published = false "
                "WHERE id = :vid"
            ),
            {"vid": row.id},
        )
        patched_count += 1

    # Surface patched count in the alembic log — useful during rollout.
    if patched_count:
        print(f"[149_moc_pdf_template_subheader_fix] patched {patched_count} version(s)")


def downgrade() -> None:
    """Best-effort rollback.

    Removes any version this migration created (identified by the marker
    comment) and republishes the previously-published version in that same
    (template_id, language) pair.
    """
    bind = op.get_bind()

    # Rows created by this migration.
    migrated = bind.execute(
        sa.text(
            """
            SELECT id, template_id, language
              FROM pdf_template_versions
             WHERE body_html LIKE '%' || :marker || '%'
            """
        ),
        {"marker": _MARKER},
    ).fetchall()

    for row in migrated:
        # Re-publish the previous version (highest version_number whose id is
        # not this row and which belongs to the same template+language).
        prev = bind.execute(
            sa.text(
                """
                SELECT id FROM pdf_template_versions
                 WHERE template_id = :tid
                   AND language = :lang
                   AND id <> :this_id
                 ORDER BY version_number DESC
                 LIMIT 1
                """
            ),
            {"tid": row.template_id, "lang": row.language, "this_id": row.id},
        ).scalar_one_or_none()

        if prev:
            bind.execute(
                sa.text(
                    "UPDATE pdf_template_versions SET is_published = true "
                    "WHERE id = :vid"
                ),
                {"vid": prev},
            )

        # Delete the migration-created row.
        bind.execute(
            sa.text("DELETE FROM pdf_template_versions WHERE id = :vid"),
            {"vid": row.id},
        )
