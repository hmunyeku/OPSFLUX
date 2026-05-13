# RBAC PDF & Email Templates — Developer Guide

This guide documents the RBAC export templates seeded by **migration 172**
(`alembic/versions/172_rbac_seed_pdf_email_templates.py`) and the runtime
infrastructure that renders them.

If you are looking for the underlying RBAC model itself (Permissions,
Roles, Groups, Delegations), see [`rbac.md`](./rbac.md).

---

## Overview

PR-B ships:

* **11 PDF templates** under the slug prefix `core.rbac.*`. All are seeded
  as **system templates** (`entity_id IS NULL`), visible to all tenants via
  the global-fallback path of `resolve_pdf_template_version()`.
* **4 email templates** under the slug prefix `rbac.delegation.*`. These
  are **per-tenant** templates (`entity_id` is `NOT NULL` in the schema);
  migration 172 seeds one copy for every existing entity, and
  `tenant_bootstrap` clones them for entities created later.
* **~80 i18n translation keys** (FR + EN) under
  `i18n_messages.namespace = 'rbac_pdf'`. All keys are `RBAC_*`-prefixed.

Every template ships in **both French and English**. The runtime renderer
selects the version matching the request `language` (falls back to the
first published version if the exact language is missing).

---

## File layout

```
app/static/
├── rbac_pdf_templates/
│   ├── _shared/
│   │   ├── header.html      ← inlined at seed time into header_html
│   │   ├── footer.html      ← inlined at seed time into footer_html
│   │   └── common.css       ← wrapped in <style>…</style> and prepended
│   │                          to every body_html at seed time
│   ├── matrix_role_permissions.fr.body.html
│   ├── matrix_role_permissions.en.body.html
│   ├── matrix_group_permissions.{fr,en}.body.html
│   ├── matrix_user_permissions.{fr,en}.body.html
│   ├── role_detail.{fr,en}.body.html
│   ├── group_detail.{fr,en}.body.html
│   ├── user_detail.{fr,en}.body.html
│   ├── role_modules.{fr,en}.body.html
│   ├── permission_catalog.{fr,en}.body.html
│   ├── sod_matrix.{fr,en}.body.html
│   ├── delegation_registry.{fr,en}.body.html
│   └── delegation_certificate.{fr,en}.body.html
└── rbac_email_templates/
    ├── delegation_granted.{fr,en}.subject.txt
    ├── delegation_granted.{fr,en}.body.html
    ├── delegation_received.{fr,en}.{subject.txt,body.html}
    ├── delegation_revoked.{fr,en}.{subject.txt,body.html}
    └── delegation_expired.{fr,en}.{subject.txt,body.html}
```

### Email templates are HTML-only

The OpsFlux `email_template_versions` table has no `body_text` column —
only `subject` and `body_html`. Earlier drafts of this PR shipped
`.body.txt` companion files for documentation, but they were dead
bytes that nothing referenced and have been removed. See
[Email templates: HTML-only](#email-templates-html-only) below for
the design rationale.

---

## Schema cheat-sheet

Migration 172 writes to these tables. Column names match the model
exactly — they do **not** match the original plan's draft SQL.

### `pdf_templates`

| Column | Notes |
|---|---|
| `entity_id` | NULL for system templates (this seed) |
| `slug` | e.g. `core.rbac.role_detail` |
| `name` | FR label at seed time |
| `object_type` | We use `'rbac_export'`. **Not `category`.** |
| `enabled` | `TRUE` |
| `page_size` | `'A4'` for all templates |
| `orientation` | `'portrait'` or `'landscape'` (depending on template) |
| `margin_*` | `15, 12, 15, 12` (top, right, bottom, left in mm) |

Unique index: `(entity_id, slug)` — but PostgreSQL treats NULL as
distinct so two NULL-entity rows with the same slug do NOT conflict.
That's why migration 172 uses **DELETE-then-INSERT** instead of
`ON CONFLICT`.

### `pdf_template_versions`

| Column | Notes |
|---|---|
| `template_id` | FK with `ON DELETE CASCADE` |
| `version_number` | `1` for the seed |
| `language` | `'fr'` or `'en'` |
| `body_html` | CSS-prepended HTML body |
| `header_html` | Shared header partial inlined at seed time |
| `footer_html` | Shared footer partial inlined at seed time |
| `is_published` | `TRUE` for the seeded version. **Not `published`.** |

Non-unique index `(template_id, language)` — there is **no** unique
constraint on `(template_id, language, version_number)`.

### `email_templates`

| Column | Notes |
|---|---|
| `entity_id` | `NOT NULL` — system seed loops over every entity |
| `slug` | e.g. `rbac.delegation.granted` |
| `name` | FR label at seed time |
| `description` | `'RBAC system seed'` — used by downgrade and tenant-bootstrap |
| `object_type` | We use `'rbac_delegation'`. **Not `category`.** |

### `email_template_versions`

| Column | Notes |
|---|---|
| `template_id` | FK with `ON DELETE CASCADE` |
| `version` | `1` for the seed. **Not `version_number`.** |
| `language` | `'fr'` or `'en'` |
| `subject` | First line of `*.{lang}.subject.txt` |
| `body_html` | Full `*.{lang}.body.html` contents |
| `is_active` | `TRUE` for the seeded version. **Not `is_published`.** |

There is **no `body_text` column**.

---

## How rendering works at runtime

Both PDF and email rendering use **Jinja2** under the hood. The flow:

1. The caller asks `render_pdf(db, slug=…, entity_id=…, language=…, variables=…)`
   (in `app/core/pdf_templates.py`).
2. The renderer calls `resolve_pdf_template_version(db, …)`:
   * tries `(slug, entity_id)` first;
   * falls back to `(slug, entity_id IS NULL)` (the system seed);
   * within the matched template, picks the version where
     `language` matches and `is_published = TRUE`.
3. The HTML body (with already-inlined CSS) is rendered with Jinja2,
   passing `variables`. Translation calls inside the body use a custom
   filter / helper that reads `i18n_messages` with
   `namespace='rbac_pdf'`.
4. The resulting HTML is converted to PDF via WeasyPrint with the
   page settings (`page_size`, `orientation`, margins) read from the
   `pdf_templates` row.

For emails the flow is identical except step 4 is skipped: the
rendered subject/body_html is handed to the SMTP layer.

---

## i18n translation keys

All keys live in `i18n_messages` with `namespace = 'rbac_pdf'`. The list
of keys is the constant `_RBAC_PDF_TRANSLATIONS` at the top of
migration 172. Each entry is a 3-tuple `(key, fr_value, en_value)`.

Inside a template body, reference a key with the helper exposed to the
Jinja2 environment (see `app/core/pdf_templates.py`):

```html
<h1>{{ _("RBAC_ROLE_DETAIL") }}</h1>
```

The helper is `_lookup_translation(key, language, namespace='rbac_pdf')`.
It is cached per `(language, key)` for the lifetime of the request to
avoid hammering the DB inside large matrix loops.

---

## How to add a new RBAC PDF template

1. **Pick a slug**. Convention: `core.rbac.<short_name>`.

2. **Write `app/static/rbac_pdf_templates/<short_name>.fr.body.html`**.
   Then duplicate to `.en.body.html` and translate.

3. **Use shared CSS classes** (`.matrix-table`, `.badge-rgpd`,
   `.cell-granted`, `.toc`, `.footer-iso-clause`, etc.) for visual
   consistency. The full set is documented in `_shared/common.css`.

4. **Use `{{ _("RBAC_KEY") }}` for every user-facing string**. Add the
   key to `_RBAC_PDF_TRANSLATIONS` in migration 172. **Both** FR and
   EN values are required.

5. **Add the template descriptor** to `_PDF_TEMPLATES` in migration 172:
   `(slug, name_fr, name_en, page_size, orientation)`. Use `'landscape'`
   for matrices and tabular layouts; `'portrait'` for fiches and
   catalogues.

6. **Write a builder** in `app/services/core/rbac_export_service.py`
   that returns the variables dict. Follow the signature pattern of
   the existing `build_*_variables` functions.

7. **Wire an export route** under `app/routes/admin/rbac_pdf.py` that
   calls `render_pdf(db, slug=…, entity_id=…, language=…,
   variables=await build_…_variables(…))`.

8. **Add a snapshot test** in `tests/test_rbac_pdf_templates_seed.py`
   following the existing pattern. Gate it on
   `RBAC_PR_B_TEMPLATES_SEEDED=1`.

9. **Run** `alembic upgrade head` and your render route.

---

## How to add a new translation key

1. Append a `(KEY, fr_value, en_value)` tuple to
   `_RBAC_PDF_TRANSLATIONS` in migration 172.
2. Use the new key in your template(s): `{{ _("KEY") }}`.
3. The next `alembic upgrade head` (or a fresh `downgrade` +
   `upgrade`) will reseed.

**Do not add new RBAC keys to other namespaces** — the i18n cache
clears per-namespace and mixing namespaces breaks invalidation.

**Do not remove a translation key** — runtime templates from older
deploys may still reference it. If a key is genuinely dead, remove
the template reference first, deploy, wait one release cycle, then
remove the seed entry.

---

## How to add a new RBAC email template

1. Create the 2 files for each language under
   `app/static/rbac_email_templates/`:
   * `<file_stem>.fr.subject.txt` (single line, plain text)
   * `<file_stem>.fr.body.html`
   * `<file_stem>.en.{subject.txt,body.html}`

2. Add a descriptor to `_EMAIL_TEMPLATES` in migration 172:
   `(slug, file_stem, name_fr, name_en)`.

3. Run `alembic downgrade -1 && alembic upgrade head` to reseed for
   all existing entities. **Important:** because email templates are
   per-tenant, an in-place re-upgrade only seeds for entities that
   exist at migration time. For new entities, the bootstrap routine
   handles cloning.

4. Trigger the new email type from your service layer using
   `render_email(db, slug=…, entity_id=…, language=…, variables=…)`
   (see `app/core/email_templates.py`).

### Email templates: HTML-only

RBAC delegation emails ship HTML-only (no plain-text alternative). The `EmailTemplateVersion`
model has no `body_text` column. Acceptable trade-off for ISO 27001 compliance — admins reading
these emails use modern clients that render HTML. If text-only fallback is needed for
accessibility or spam-filter mitigation, extend the model in a separate PR and re-seed via
`alembic stamp` + run a small backfill script.

---

## How the i18n cache works

`_lookup_translation()` in `app/core/pdf_templates.py` maintains a
per-process LRU cache keyed on `(language, key)`. It is sized to hold
~10k entries — large enough for the full RBAC keyset times every
supported language.

Cache invalidation is **lazy**: there is no pub/sub. After running
migration 172 (or any migration that writes to `i18n_messages`)
processes need a restart for the new strings to take effect. In
practice this is fine because seed migrations only run at deploy time.

If you need to force-invalidate without a restart, call
`_lookup_translation.cache_clear()` from a Python REPL connected to
the app process.

---

## Testing

Snapshot tests live in `tests/test_rbac_pdf_templates_seed.py`. They:

* are **gated** by `RBAC_PR_B_TEMPLATES_SEEDED=1`. Set this env var
  after running `alembic upgrade head` against your test DB.
* verify `pdf_bytes[:4] == b"%PDF"` and a minimum size threshold — they
  do not diff against golden files (the layout output of WeasyPrint
  drifts too much across versions).
* exercise every one of the 11 templates plus a bilingual
  cross-check on `delegation_certificate` (FR vs EN should produce
  different bytes — proves i18n is wired).

Run them with:

```bash
RBAC_PR_B_TEMPLATES_SEEDED=1 pytest tests/test_rbac_pdf_templates_seed.py -v
```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `render_pdf` returns `None` | Template not seeded for that slug, or `is_published = FALSE`. Check the DB. |
| Strings render as `RBAC_KEY_RAW` instead of translated text | The i18n key is missing for the requested language. Add it to `_RBAC_PDF_TRANSLATIONS` and rerun migration 172. |
| FR and EN renders are byte-identical | The template body isn't using `{{ _("KEY") }}` — hardcoded strings. |
| Layout looks broken (missing CSS) | `_shared/common.css` not inlined. Re-run migration 172. |
| WeasyPrint warns about unknown CSS properties | Stick to the property subset documented at https://doc.courtbouillon.org/weasyprint/stable/api_reference.html. Avoid Flexbox and CSS Grid in favor of `display: table`. |

---

## Related code

* `app/core/pdf_templates.py` — `render_pdf`, `resolve_pdf_template_version`, `_lookup_translation`.
* `app/core/email_templates.py` — analogous helpers for email.
* `app/services/core/rbac_export_service.py` — variables builders.
* `app/routes/admin/rbac_pdf.py` — HTTP routes for PDF exports.
* `app/services/core/rbac_delegation_service.py` — delegation events that
  trigger email sends.
* `alembic/versions/172_rbac_seed_pdf_email_templates.py` — the seed
  itself.
* `alembic/versions/126_*` — created the `i18n_messages` table.
* `alembic/versions/022_add_pdf_templates.py` — created the
  `pdf_templates` tables.
* `alembic/versions/005_add_email_templates.py` — created the
  `email_templates` tables.
