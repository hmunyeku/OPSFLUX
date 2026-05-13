# RBAC PR-B — Templates PDF & email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seeder les 11 templates PDF (22 versions FR+EN) + 4 templates email (8 versions FR+EN) + infrastructure i18n associée, pour débloquer les exports PDF de PR-A qui retournent actuellement `404 RBAC_TEMPLATE_NOT_FOUND`.

**Architecture:** Fichiers HTML statiques sous `app/static/rbac_pdf_templates/` et `app/static/rbac_email_templates/`. Migration alembic 172 charge ces fichiers, inline les partials communs, et insère dans `PdfTemplate`/`PdfTemplateVersion` + `EmailTemplate`/`EmailTemplateVersion`. Helper Jinja `_(key)` injecté au render time pour les chaînes i18n via la table `references` (domain `rbac_pdf`).

**Tech Stack:** WeasyPrint (HTML→PDF), Jinja2 (templating), PostgreSQL JSONB pour `variables_schema`, table `references` pour i18n, Alembic.

**Spec source:** [`docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md`](../specs/2026-05-13-rbac-bootstrap-design.md) §6 (templates), §8 (i18n), §10 (audit/tests)

**Overview:** [`docs/superpowers/plans/2026-05-13-rbac-bootstrap-overview.md`](./2026-05-13-rbac-bootstrap-overview.md)

**Depends on:** PR-A mergée (migration 171 appliquée, modèles `PdfTemplate`/`EmailTemplate` accessibles, fonction `render_pdf`/`render_and_send_email` opérationnelles)

---

## Pré-requis

- [ ] Vérifier que tu es sur la branche `claude/gracious-haslett-4b8b09` (continuation de PR-A) ou créer une nouvelle branche `claude/rbac-pr-b-templates`
- [ ] Vérifier que migration 171 est dans l'historique : `alembic history | grep 171_rbac_bootstrap_phase1`
- [ ] Vérifier que `WeasyPrint` et ses dépendances natives (Pango, GTK pour Windows) sont installés : `python -c "import weasyprint; print(weasyprint.__version__)"`
- [ ] Vérifier que la table `references` existe et accepte un `domain` text :
  ```bash
  grep -n "class Reference" app/models/common.py
  ```
- [ ] Lire la spec §6.1-6.7 (templates PDF, structure HTML, partials, i18n) au moins une fois

---

## File structure

```
app/static/
├── rbac_pdf_templates/
│   ├── _shared/
│   │   ├── header.html              # partial common to all PDFs
│   │   ├── footer.html              # partial common
│   │   └── common.css               # CSS shared, inlined at seed time
│   ├── matrix_role_permissions.fr.body.html
│   ├── matrix_role_permissions.en.body.html
│   ├── matrix_group_permissions.fr.body.html
│   ├── matrix_group_permissions.en.body.html
│   ├── matrix_user_permissions.fr.body.html
│   ├── matrix_user_permissions.en.body.html
│   ├── role_detail.fr.body.html
│   ├── role_detail.en.body.html
│   ├── group_detail.fr.body.html
│   ├── group_detail.en.body.html
│   ├── user_detail.fr.body.html
│   ├── user_detail.en.body.html
│   ├── role_modules.fr.body.html
│   ├── role_modules.en.body.html
│   ├── permission_catalog.fr.body.html
│   ├── permission_catalog.en.body.html
│   ├── sod_matrix.fr.body.html
│   ├── sod_matrix.en.body.html
│   ├── delegation_registry.fr.body.html
│   ├── delegation_registry.en.body.html
│   ├── delegation_certificate.fr.body.html
│   └── delegation_certificate.en.body.html
└── rbac_email_templates/
    ├── delegation_granted.fr.subject.txt
    ├── delegation_granted.fr.body.html
    ├── delegation_granted.fr.body.txt
    ├── delegation_granted.en.subject.txt
    ├── delegation_granted.en.body.html
    ├── delegation_granted.en.body.txt
    ├── delegation_received.fr.{subject,body.html,body.txt}.txt|html
    ├── delegation_received.en.{subject,body.html,body.txt}
    ├── delegation_revoked.fr.{...}
    ├── delegation_revoked.en.{...}
    ├── delegation_expired.fr.{...}
    └── delegation_expired.en.{...}

app/core/
└── pdf_templates.py                 # MODIFIED: add `_build_translator` helper

alembic/versions/
└── 172_rbac_seed_pdf_email_templates.py  # NEW: loads HTML files, inlines partials, INSERTs

docs/developer/
└── rbac-pdf-templates.md            # NEW: developer guide for adding/modifying templates

tests/
└── test_rbac_pdf_templates_seed.py  # NEW: pytest-alembic + snapshot tests for rendered PDFs
```

---

## Groupe 1 — Infrastructure i18n

### Task 1.1 : Helper `_build_translator` dans `app/core/pdf_templates.py`

**Files:**
- Modify: `app/core/pdf_templates.py` (ajout d'une fonction)
- Test: `tests/test_pdf_translator.py` (créer)

- [ ] **Step 1: Écrire le test failing**

```python
# tests/test_pdf_translator.py
"""Test the _build_translator helper for PDF templates i18n."""
import pytest
from app.core.pdf_templates import _build_translator


def test_translator_returns_function():
    """_build_translator returns a callable that translates keys."""
    t = _build_translator("fr")
    assert callable(t)


def test_translator_falls_back_to_key_if_no_translation(monkeypatch):
    """If the key is not found, returns the key itself (graceful fallback)."""
    # Mock the underlying translate function to return None for unknown keys
    from app.core import pdf_templates
    monkeypatch.setattr(
        pdf_templates, "_lookup_translation", lambda key, lang: None
    )
    t = _build_translator("fr")
    assert t("UNKNOWN_KEY") == "UNKNOWN_KEY"


def test_translator_returns_translation(monkeypatch):
    """Returns the translation string when found."""
    from app.core import pdf_templates
    translations = {("RBAC_GENERATED_AT", "fr"): "Généré le"}
    monkeypatch.setattr(
        pdf_templates,
        "_lookup_translation",
        lambda key, lang: translations.get((key, lang)),
    )
    t = _build_translator("fr")
    assert t("RBAC_GENERATED_AT") == "Généré le"
```

- [ ] **Step 2: Run — doit échouer**

Run: `pytest tests/test_pdf_translator.py -v`

Expected: FAIL with `ImportError: cannot import name '_build_translator' from 'app.core.pdf_templates'`

- [ ] **Step 3: Ajouter le helper**

Dans `app/core/pdf_templates.py`, après la définition de `_jinja_env` (vers la ligne 47), ajouter :

```python
from sqlalchemy import select as _select
from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession
from app.models.common import Reference  # adjust import if class is named differently


# In-memory cache of translations per language to avoid hitting the DB on every key.
# Invalidate via _clear_translation_cache() if translations are mutated at runtime.
_TRANSLATION_CACHE: dict[str, dict[str, str]] = {}


def _lookup_translation(key: str, lang: str) -> str | None:
    """Synchronous translation lookup from the cache. Returns None if missing.

    The cache is populated lazily by `prime_translation_cache(db, lang)` on first
    PDF render per language. Subsequent renders hit the cache.
    """
    cache_for_lang = _TRANSLATION_CACHE.get(lang)
    if cache_for_lang is None:
        return None
    return cache_for_lang.get(key)


async def prime_translation_cache(db: _AsyncSession, lang: str) -> None:
    """Load all rbac_pdf translations for `lang` into the in-memory cache."""
    if lang in _TRANSLATION_CACHE:
        return  # already primed
    result = await db.execute(
        _select(Reference.code, Reference.label).where(
            Reference.domain == "rbac_pdf",
            Reference.lang == lang,
        )
    )
    _TRANSLATION_CACHE[lang] = {row[0]: row[1] for row in result.all()}


def _clear_translation_cache(lang: str | None = None) -> None:
    """Drop cached translations. Call when rbac_pdf domain references are mutated."""
    if lang is None:
        _TRANSLATION_CACHE.clear()
    else:
        _TRANSLATION_CACHE.pop(lang, None)


def _build_translator(lang: str):
    """Return a `_(key)` Jinja-callable that resolves rbac_pdf translations.

    Falls back to returning the key itself if no translation is found, so a missing
    translation never breaks the render — it just displays the canonical key as text.
    """
    def _(key: str) -> str:
        value = _lookup_translation(key, lang)
        return value if value is not None else key
    return _
```

**IMPORTANT** : vérifier le nom exact de la classe `Reference` dans `app/models/common.py` :
```bash
grep -n "^class Reference\b\|^class Reference(" app/models/common.py
```

Si la classe est nommée différemment (ex: `RefData`, `I18nReference`), adapter l'import et les noms de colonnes (`domain`, `lang`, `code`, `label`).

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_pdf_translator.py -v`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/core/pdf_templates.py tests/test_pdf_translator.py
git commit -m "feat(rbac): add _build_translator helper for PDF i18n with in-memory cache"
```

### Task 1.2 : Injecter `_` dans le contexte de rendu

**Files:**
- Modify: `app/core/pdf_templates.py` (la fonction `render_pdf_from_version` ou équivalent)

- [ ] **Step 1: Localiser le point d'injection**

Lis `app/core/pdf_templates.py` pour trouver l'endroit où le `ctx` (variables) est construit avant le rendu Jinja. Recherche :
```bash
grep -n "render_template_string\|jinja_env.from_string\|ctx = " app/core/pdf_templates.py
```

Le point d'injection est dans `render_pdf_from_version` (ou `render_pdf`) juste avant l'appel à `Template(body_html).render(ctx)`.

- [ ] **Step 2: Modifier le rendu pour injecter `_` et `lang`**

Avant le bloc qui rend `body_html`, ajouter :

```python
# Prime the translation cache for this language (no-op if already cached)
await prime_translation_cache(db, language)

# Inject the translator and language code into the context
ctx["_"] = _build_translator(language)
ctx["lang"] = language
```

Place ces lignes APRÈS la construction de `ctx` (qui contient `variables` user-provided) et AVANT l'appel à `render_template_string` ou `Template(...).render(ctx)`.

- [ ] **Step 3: Vérifier syntaxiquement**

```bash
python -c "import ast; ast.parse(open('app/core/pdf_templates.py').read())" && echo "AST OK"
```

- [ ] **Step 4: Commit**

```bash
git add app/core/pdf_templates.py
git commit -m "feat(rbac): inject _() translator and lang into PDF template render context"
```

### Task 1.3 : Seed des ~80 traductions RBAC PDF dans `references`

**Files:**
- Modify: `alembic/versions/172_rbac_seed_pdf_email_templates.py` (créer, partie i18n seulement pour l'instant)

- [ ] **Step 1: Créer le squelette de la migration 172**

```bash
ls alembic/versions/ | sort | tail -3
# Confirme la dernière migration. Avec PR-A mergée, c'est 171_rbac_bootstrap_phase1
```

Créer `alembic/versions/172_rbac_seed_pdf_email_templates.py` :

```python
"""RBAC seed PDF templates, email templates, and i18n translations.

Revision ID: 172_rbac_seed_pdf_email_templates
Revises: 171_rbac_bootstrap_phase1
Create Date: 2026-05-13 18:00:00

This migration is ADDITIVE: it inserts seed data only. No DDL changes.
Idempotent via ON CONFLICT DO UPDATE.
"""
from alembic import op
import sqlalchemy as sa
from pathlib import Path

# revision identifiers
revision = "172_rbac_seed_pdf_email_templates"
down_revision = "171_rbac_bootstrap_phase1"
branch_labels = None
depends_on = None

# Path to the static templates directory relative to the project root
_STATIC_ROOT = Path(__file__).parent.parent.parent / "app" / "static"


def _read_file(path: Path) -> str:
    """Read a UTF-8 file and return its content."""
    return path.read_text(encoding="utf-8")


def upgrade():
    _seed_i18n_translations()
    # PDF/email seeds added by later tasks in Group 8


def _seed_i18n_translations():
    """Seed ~80 translation keys for rbac_pdf domain in references table.

    Each key has both FR and EN translations. Idempotent.
    """
    # Translations list: (code, fr, en)
    TRANSLATIONS = [
        # Common UI strings
        ("RBAC_GENERATED_AT", "Généré le", "Generated on"),
        ("RBAC_BY", "Par", "By"),
        ("RBAC_CONFIDENTIAL", "CONFIDENTIEL", "CONFIDENTIAL"),
        ("RBAC_PAGE", "Page", "Page"),
        ("RBAC_OF", "sur", "of"),
        # Matrix titles
        ("RBAC_MATRIX_ROLES_PERMISSIONS", "Matrice Rôles × Permissions", "Roles × Permissions Matrix"),
        ("RBAC_MATRIX_GROUPS_PERMISSIONS", "Matrice Groupes × Permissions", "Groups × Permissions Matrix"),
        ("RBAC_MATRIX_USERS_PERMISSIONS", "Matrice Utilisateurs × Permissions", "Users × Permissions Matrix"),
        ("RBAC_MATRIX_ROLES_MODULES", "Vue Rôles × Modules", "Roles × Modules View"),
        ("RBAC_MATRIX_SOD", "Matrice de Ségrégation des Devoirs", "Segregation of Duties Matrix"),
        # Fiches
        ("RBAC_ROLE_DETAIL", "Fiche détaillée du rôle", "Role detail sheet"),
        ("RBAC_GROUP_DETAIL", "Fiche détaillée du groupe", "Group detail sheet"),
        ("RBAC_USER_DETAIL", "Fiche détaillée de l'utilisateur", "User detail sheet"),
        ("RBAC_PERMISSION_CATALOG", "Catalogue de permissions", "Permission catalog"),
        ("RBAC_DELEGATIONS_REGISTRY", "Registre des délégations", "Delegations registry"),
        ("RBAC_DELEGATION_CERTIFICATE", "Certificat de délégation de permissions", "Permission delegation certificate"),
        # Section headers
        ("RBAC_SECTION_SYNTHESIS", "Synthèse", "Synthesis"),
        ("RBAC_SECTION_TOC", "Sommaire", "Table of contents"),
        ("RBAC_SECTION_LEGEND", "Légende", "Legend"),
        ("RBAC_SECTION_PERMISSIONS", "Permissions", "Permissions"),
        ("RBAC_SECTION_ROLES", "Rôles", "Roles"),
        ("RBAC_SECTION_GROUPS", "Groupes", "Groups"),
        ("RBAC_SECTION_MEMBERS", "Membres", "Members"),
        ("RBAC_SECTION_DELEGATIONS_RECEIVED", "Délégations reçues", "Delegations received"),
        ("RBAC_SECTION_DELEGATIONS_GIVEN", "Délégations données", "Delegations given"),
        ("RBAC_SECTION_OVERRIDES", "Surcharges", "Overrides"),
        ("RBAC_SECTION_EFFECTIVE_PERMISSIONS", "Permissions effectives", "Effective permissions"),
        # Field labels
        ("RBAC_LABEL_CODE", "Code", "Code"),
        ("RBAC_LABEL_NAME", "Nom", "Name"),
        ("RBAC_LABEL_DESCRIPTION", "Description", "Description"),
        ("RBAC_LABEL_MODULE", "Module", "Module"),
        ("RBAC_LABEL_NAMESPACE", "Namespace", "Namespace"),
        ("RBAC_LABEL_RESOURCE", "Ressource", "Resource"),
        ("RBAC_LABEL_ACTION", "Action", "Action"),
        ("RBAC_LABEL_TENANT", "Locataire", "Tenant"),
        ("RBAC_LABEL_DELEGATOR", "Délégant", "Delegator"),
        ("RBAC_LABEL_DELEGATE", "Délégué", "Delegate"),
        ("RBAC_LABEL_PERIOD", "Période effective", "Effective period"),
        ("RBAC_LABEL_DURATION", "Durée", "Duration"),
        ("RBAC_LABEL_DAYS", "jours", "days"),
        ("RBAC_LABEL_REASON", "Motif", "Reason"),
        ("RBAC_LABEL_STATUS", "Statut", "Status"),
        ("RBAC_LABEL_SOURCE", "Source", "Source"),
        ("RBAC_LABEL_ROLES_AT_DATE", "Rôles à la date", "Roles at date"),
        ("RBAC_LABEL_ASSET_SCOPE", "Périmètre asset", "Asset scope"),
        # Status values
        ("RBAC_STATUS_ACTIVE", "Active", "Active"),
        ("RBAC_STATUS_PROGRAMMED", "Programmée", "Programmed"),
        ("RBAC_STATUS_EXPIRED", "Expirée", "Expired"),
        ("RBAC_STATUS_REVOKED", "Révoquée", "Revoked"),
        # Permission sources (4-layer)
        ("RBAC_SOURCE_USER", "Surcharge utilisateur", "User override"),
        ("RBAC_SOURCE_ROLE", "Via rôle", "Via role"),
        ("RBAC_SOURCE_GROUP", "Surcharge groupe", "Group override"),
        ("RBAC_SOURCE_DELEGATION", "Via délégation", "Via delegation"),
        # Legend cells
        ("RBAC_LEGEND_GRANTED", "Permission accordée", "Permission granted"),
        ("RBAC_LEGEND_NOT_GRANTED", "Permission non accordée", "Permission not granted"),
        ("RBAC_LEGEND_RGPD_FLAG", "Permission sensible RGPD", "GDPR-sensitive permission"),
        ("RBAC_LEGEND_MODULE_DISABLED", "Module désactivé dans ce tenant", "Module disabled in this tenant"),
        # ISO compliance footnotes
        ("RBAC_ISO_DOC_OPPOSABLE", "Document opposable, conforme ISO 27001 §A.9 Contrôle des accès.", "Legally binding document, ISO 27001 §A.9 Access Control compliant."),
        ("RBAC_ISO_CLAUSE_REVIEW", "ISO 27001 §A.9.2.5 — Revue des droits d'accès des utilisateurs.", "ISO 27001 §A.9.2.5 — Review of user access rights."),
        ("RBAC_ISO_CLAUSE_DELEGATION", "ISO 27001 §A.9.2.6 — Suppression ou ajustement des droits d'accès.", "ISO 27001 §A.9.2.6 — Removal or adjustment of access rights."),
        ("RBAC_AUDIT_EVENT", "Référence audit", "Audit reference"),
        ("RBAC_CONTENT_HASH", "Empreinte SHA-256", "SHA-256 fingerprint"),
        # Delegations specifics
        ("RBAC_DELEGATION_TITLE", "CERTIFICAT DE DÉLÉGATION", "DELEGATION CERTIFICATE"),
        ("RBAC_DELEGATION_SUBTITLE", "de permissions d'accès", "of access permissions"),
        ("RBAC_DELEGATION_PERMISSIONS_DELEGATED", "Permissions déléguées", "Delegated permissions"),
        ("RBAC_DELEGATION_REVOCATION_BLOCK", "RÉVOCATION", "REVOCATION"),
        ("RBAC_DELEGATION_REVOKED_BY", "Révoqué par", "Revoked by"),
        ("RBAC_DELEGATION_REVOKED_AT", "Date de révocation", "Revocation date"),
        ("RBAC_DELEGATION_EXPIRY_J3_NOTICE", "Cette délégation expirera dans 3 jours.", "This delegation will expire in 3 days."),
        ("RBAC_DELEGATION_EXPIRY_J0_NOTICE", "Cette délégation expire aujourd'hui.", "This delegation expires today."),
        # SoD specifics
        ("RBAC_SOD_VIOLATIONS_COUNT", "Conflits détectés", "Conflicts detected"),
        ("RBAC_SOD_NO_VIOLATIONS", "Aucun conflit de ségrégation des devoirs détecté.", "No segregation of duties conflicts detected."),
        ("RBAC_SOD_RULE", "Règle", "Rule"),
        ("RBAC_SOD_AFFECTED_ROLE", "Rôle concerné", "Affected role"),
        # Counters
        ("RBAC_COUNT_ROLES", "rôles", "roles"),
        ("RBAC_COUNT_PERMISSIONS", "permissions", "permissions"),
        ("RBAC_COUNT_GROUPS", "groupes", "groups"),
        ("RBAC_COUNT_USERS", "utilisateurs", "users"),
        ("RBAC_COUNT_DELEGATIONS", "délégations", "delegations"),
        ("RBAC_COUNT_LINKS", "liaisons actives", "active links"),
    ]

    # Build the INSERT statement
    op.execute("""
        CREATE TEMP TABLE _rbac_pdf_translations (
            code TEXT,
            lang TEXT,
            label TEXT
        ) ON COMMIT DROP;
    """)

    # Bulk insert via parameterized statement
    from sqlalchemy import text
    conn = op.get_bind()
    rows = []
    for code, fr, en in TRANSLATIONS:
        rows.append({"code": code, "lang": "fr", "label": fr})
        rows.append({"code": code, "lang": "en", "label": en})

    conn.execute(
        text("INSERT INTO _rbac_pdf_translations (code, lang, label) VALUES (:code, :lang, :label)"),
        rows,
    )

    # Upsert into references with domain='rbac_pdf'
    op.execute("""
        INSERT INTO "references" (domain, code, lang, label)
        SELECT 'rbac_pdf', code, lang, label FROM _rbac_pdf_translations
        ON CONFLICT (domain, code, lang) DO UPDATE SET label = EXCLUDED.label
    """)


def downgrade():
    # Remove the rbac_pdf translations
    op.execute("DELETE FROM \"references\" WHERE domain = 'rbac_pdf'")
    # PDF/email seed deletions handled by later tasks
```

**IMPORTANT** : vérifier le nom de la table `references` et ses colonnes :
```bash
grep -n "class Reference\b\|__tablename__ = \"references\"" app/models/common.py
```

Si la table s'appelle différemment ou si les colonnes ne sont pas `(domain, code, lang, label)`, adapter le SQL.

**IMPORTANT 2** : vérifier qu'un index UNIQUE existe sur `(domain, code, lang)` pour permettre `ON CONFLICT` :
```bash
grep -n "UniqueConstraint\|Index" app/models/common.py | grep -i reference
```

Si l'index unique n'existe pas, ajouter dans une migration précédente ou demander à l'utilisateur. Sinon le `ON CONFLICT` plantera.

- [ ] **Step 2: Vérifier l'AST**

```bash
python -c "import ast; ast.parse(open('alembic/versions/172_rbac_seed_pdf_email_templates.py').read())" && echo "AST OK"
```

- [ ] **Step 3: Commit (la migration n'est pas encore terminée, juste la partie i18n)**

```bash
git add alembic/versions/172_rbac_seed_pdf_email_templates.py
git commit -m "feat(rbac): migration 172 — seed ~80 i18n translations for rbac_pdf domain (FR+EN)"
```

---

## Groupe 2 — Partials HTML communs

### Task 2.1 : `_shared/header.html` (langue-agnostic via `{{ _('...') }}`)

**Files:**
- Create: `app/static/rbac_pdf_templates/_shared/header.html`

- [ ] **Step 1: Créer le dossier et le fichier**

```bash
mkdir -p app/static/rbac_pdf_templates/_shared
```

Contenu de `app/static/rbac_pdf_templates/_shared/header.html` :

```html
{# RBAC PDF shared header — used in all 11 PDF templates. Resolved at render time via _() translator. #}
<header style="display:flex; justify-content:space-between; padding:8mm 12mm; border-bottom:1px solid #cbd5e1; font-family:Arial, Helvetica, sans-serif; font-size:9pt; color:#475569;">
  <div style="display:flex; align-items:center; gap:10mm;">
    {% if tenant.logo_url %}
      <img src="{{ tenant.logo_url }}" alt="{{ tenant.name }}" style="height:14mm; width:auto;"/>
    {% else %}
      <span style="font-weight:700; color:#0f172a; font-size:11pt;">OpsFlux</span>
    {% endif %}
    <div>
      <div style="font-weight:600; color:#0f172a;">{{ tenant.name }}</div>
      <div style="font-size:8pt; color:#64748b;">{{ document_title | default('') }}</div>
    </div>
  </div>
  <div style="text-align:right; font-size:8pt;">
    <div>{{ _('RBAC_GENERATED_AT') }} {{ generated_at | default('') }}</div>
    <div>{{ _('RBAC_BY') }} {{ generated_by.full_name | default('') }}</div>
    <div style="margin-top:1mm; padding:1mm 2mm; background:#fef3c7; border-radius:2mm; display:inline-block; font-weight:600; color:#92400e;">{{ _('RBAC_CONFIDENTIAL') }}</div>
  </div>
</header>
```

- [ ] **Step 2: Commit**

```bash
git add app/static/rbac_pdf_templates/_shared/header.html
git commit -m "feat(rbac): shared HTML header partial for all RBAC PDF templates"
```

### Task 2.2 : `_shared/footer.html`

Contenu de `app/static/rbac_pdf_templates/_shared/footer.html` :

```html
{# RBAC PDF shared footer — page counter via CSS `counter(page)` and content_hash from audit. #}
<footer style="padding:6mm 12mm; border-top:1px solid #cbd5e1; font-family:Arial, Helvetica, sans-serif; font-size:8pt; color:#64748b; display:flex; justify-content:space-between;">
  <div>{{ _('RBAC_PAGE') }} <span class="page-number"></span> {{ _('RBAC_OF') }} <span class="total-pages"></span></div>
  <div style="text-align:center;">{{ document_subtitle | default('') }}</div>
  <div style="font-family:monospace; font-size:7pt;">SHA-256: {{ content_hash[:16] if content_hash else '' }}…</div>
</footer>
```

- [ ] **Commit**

```bash
git add app/static/rbac_pdf_templates/_shared/footer.html
git commit -m "feat(rbac): shared HTML footer partial with page counter and content hash"
```

### Task 2.3 : `_shared/common.css` (CSS @page + counters + inlining target)

Contenu de `app/static/rbac_pdf_templates/_shared/common.css` :

```css
/* RBAC PDF shared CSS — inlined into every template's body_html at seed time.
   Supports A4 portrait by default; templates override @page size to landscape. */

@page {
  margin: 18mm 12mm 16mm 12mm;
  @top-center { content: element(header); }
  @bottom-center { content: element(footer); }
}

@page landscape {
  size: A4 landscape;
  margin: 16mm 14mm 14mm 14mm;
}

header { position: running(header); }
footer { position: running(footer); }
.page-number::before { content: counter(page); }
.total-pages::before { content: counter(pages); }

body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9pt;
  color: #0f172a;
  line-height: 1.4;
  margin: 0;
  padding: 0;
}

h1 { font-size: 22pt; color: #0f172a; margin: 0 0 4mm 0; }
h2 { font-size: 14pt; color: #1e293b; margin: 6mm 0 3mm 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; }
h3 { font-size: 11pt; color: #334155; margin: 4mm 0 2mm 0; }
p { margin: 0 0 2mm 0; }
table { width: 100%; border-collapse: collapse; font-size: 8pt; }
th { background: #1e293b; color: #fff; text-align: left; padding: 2mm; }
td { padding: 2mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
tr:nth-child(even) { background: #f8fafc; }

.badge-rgpd { display: inline-block; padding: 0.5mm 1.5mm; background: #fef3c7; color: #92400e; font-size: 6pt; border-radius: 1mm; font-weight: 600; }
.badge-disabled { opacity: 0.4; background: #f1f5f9; }
.cell-granted { color: #15803d; font-weight: 700; text-align: center; }
.cell-not-granted { color: #cbd5e1; text-align: center; }
.cover-page { padding: 30mm 20mm; page-break-after: always; }
.section { page-break-inside: avoid; }
.page-break-before { page-break-before: always; }
```

- [ ] **Commit**

```bash
git add app/static/rbac_pdf_templates/_shared/common.css
git commit -m "feat(rbac): shared CSS for RBAC PDF templates (page setup, headers, tables, badges)"
```

---

## Groupe 3 — Templates phares

### Task 3.1 : `delegation_certificate.fr.body.html` + `.en.body.html`

Le certificat de délégation est le template le plus formel : 1 page A4 portrait, structure quasi-juridique, hash SHA-256 et référence audit dans le pied de page (déjà géré par le partial footer).

**Files:**
- Create: `app/static/rbac_pdf_templates/delegation_certificate.fr.body.html`
- Create: `app/static/rbac_pdf_templates/delegation_certificate.en.body.html`

- [ ] **Step 1: Créer le body FR**

`app/static/rbac_pdf_templates/delegation_certificate.fr.body.html` :

```html
{# Certificat de délégation — A4 portrait, format légal ISO 27001 §A.9.2.5/6. #}
<style>
  @page { size: A4 portrait; }
  body { font-family: Georgia, 'Times New Roman', serif; }
  .cert-title { text-align: center; font-size: 24pt; letter-spacing: 0.05em; color: #0f172a; margin: 0; }
  .cert-subtitle { text-align: center; color: #64748b; margin: 2mm 0 12mm 0; font-size: 11pt; }
  .parties-table { width: 100%; margin-bottom: 8mm; }
  .parties-table td { vertical-align: top; padding: 2mm 0; border: none; background: none; }
  .party-label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
  .party-name { font-size: 14pt; font-weight: 700; color: #0f172a; }
  .party-email { font-size: 10pt; color: #475569; }
  .party-meta { font-size: 9pt; color: #64748b; }
  .period-block { border: 2px solid #1e293b; padding: 6mm; margin-bottom: 8mm; }
  .period-label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
  .period-value { font-size: 16pt; font-weight: 700; text-align: center; margin: 2mm 0; }
  .period-duration { text-align: center; font-size: 9pt; color: #64748b; }
  .perms-list { font-size: 10pt; column-count: 2; column-gap: 6mm; padding: 0; list-style: none; }
  .perms-list li { margin-bottom: 2mm; break-inside: avoid; }
  .perm-code { font-family: monospace; font-size: 8pt; color: #475569; }
  .reason-block { padding: 4mm; background: #f8fafc; border-left: 3px solid #2563eb; margin-top: 2mm; }
  .revocation-block { margin-top: 8mm; padding: 4mm; background: #fef2f2; border: 1px solid #dc2626; }
  .revocation-title { color: #991b1b; font-weight: 700; font-size: 11pt; margin-bottom: 2mm; }
  .audit-footer { margin-top: 12mm; padding-top: 4mm; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b; }
  .iso-clause { margin-top: 2mm; font-style: italic; }
</style>

<main style="padding: 20mm 25mm;">
  <h1 class="cert-title">{{ _('RBAC_DELEGATION_TITLE') }}</h1>
  <p class="cert-subtitle">{{ _('RBAC_DELEGATION_SUBTITLE') }}</p>

  <table class="parties-table">
    <tr>
      <td style="width: 50%;">
        <div class="party-label">{{ _('RBAC_LABEL_DELEGATOR') }}</div>
        <div class="party-name">{{ delegator.full_name }}</div>
        <div class="party-email">{{ delegator.email }}</div>
        {% if delegator.roles_at_date %}
          <div class="party-meta">{{ _('RBAC_LABEL_ROLES_AT_DATE') }} : {{ delegator.roles_at_date | join(', ') }}</div>
        {% endif %}
      </td>
      <td style="width: 50%;">
        <div class="party-label">{{ _('RBAC_LABEL_DELEGATE') }}</div>
        <div class="party-name">{{ delegate.full_name }}</div>
        <div class="party-email">{{ delegate.email }}</div>
      </td>
    </tr>
  </table>

  <div class="period-block">
    <div class="period-label">{{ _('RBAC_LABEL_PERIOD') }}</div>
    <div class="period-value">{{ delegation.start_date }} → {{ delegation.end_date }}</div>
    <div class="period-duration">{{ _('RBAC_LABEL_DURATION') }} : {{ delegation_duration_days }} {{ _('RBAC_LABEL_DAYS') }}</div>
  </div>

  <h3>{{ _('RBAC_DELEGATION_PERMISSIONS_DELEGATED') }}</h3>
  <ul class="perms-list">
    {% for perm in delegation.permissions_full %}
      <li>
        <span class="perm-code">{{ perm.code }}</span><br>
        <span>{{ perm.name }}</span>
      </li>
    {% endfor %}
  </ul>

  <h3 style="margin-top: 6mm;">{{ _('RBAC_LABEL_REASON') }}</h3>
  <div class="reason-block">{{ delegation.reason }}</div>

  {% if revocation %}
    <div class="revocation-block">
      <div class="revocation-title">{{ _('RBAC_DELEGATION_REVOCATION_BLOCK') }}</div>
      <div><strong>{{ _('RBAC_DELEGATION_REVOKED_BY') }} :</strong> {{ revocation.actor_email }}</div>
      <div><strong>{{ _('RBAC_DELEGATION_REVOKED_AT') }} :</strong> {{ revocation.revoked_at }}</div>
      <div style="margin-top: 2mm;"><strong>{{ _('RBAC_LABEL_REASON') }} :</strong> {{ revocation.reason }}</div>
    </div>
  {% endif %}

  {% if expiry_phase == 'j3' %}
    <p style="margin-top: 6mm; padding: 3mm; background: #fef3c7; color: #92400e; border-radius: 2mm;">
      ⚠ {{ _('RBAC_DELEGATION_EXPIRY_J3_NOTICE') }}
    </p>
  {% elif expiry_phase == 'j0' %}
    <p style="margin-top: 6mm; padding: 3mm; background: #fee2e2; color: #991b1b; border-radius: 2mm;">
      ⚠ {{ _('RBAC_DELEGATION_EXPIRY_J0_NOTICE') }}
    </p>
  {% endif %}

  <div class="audit-footer">
    <div><strong>{{ _('RBAC_AUDIT_EVENT') }} :</strong> <span style="font-family: monospace;">{{ audit_event_id | default('—') }}</span></div>
    <div><strong>{{ _('RBAC_CONTENT_HASH') }} :</strong> <span style="font-family: monospace;">{{ content_hash | default('—') }}</span></div>
    <p class="iso-clause">{{ _('RBAC_ISO_CLAUSE_REVIEW') }}</p>
  </div>
</main>
```

- [ ] **Step 2: Créer la version EN**

`app/static/rbac_pdf_templates/delegation_certificate.en.body.html` : **identique au FR**, parce que toutes les chaînes traduisibles passent par `{{ _('...') }}` et seront résolues selon `language` au render time. Le fichier `.en` existe pour la cohérence du modèle de stockage (un PdfTemplateVersion par langue), mais son contenu HTML est le même.

Pour économiser le travail, créer un lien symbolique ne marche pas sur Windows. À la place, copier le fichier :

```bash
cp app/static/rbac_pdf_templates/delegation_certificate.fr.body.html \
   app/static/rbac_pdf_templates/delegation_certificate.en.body.html
```

- [ ] **Step 3: Commit**

```bash
git add app/static/rbac_pdf_templates/delegation_certificate.*.body.html
git commit -m "feat(rbac): delegation certificate template FR+EN (A4 portrait, ISO-formal)"
```

### Task 3.2 : `matrix_role_permissions.fr.body.html` + `.en.body.html`

Le template matriciel principal : A4 paysage, décomposition par module, table sticky-header pour les rôles en colonne.

**Files:**
- Create: `app/static/rbac_pdf_templates/matrix_role_permissions.fr.body.html`
- Create: `app/static/rbac_pdf_templates/matrix_role_permissions.en.body.html`

- [ ] **Step 1: Créer le body FR**

`app/static/rbac_pdf_templates/matrix_role_permissions.fr.body.html` :

```html
{# Matrice Rôles × Permissions — A4 paysage, décomposée par module pour rester lisible. #}
<style>
  @page { size: A4 landscape; }
  .cover-page h1 { font-size: 32pt; }
  .cover-tenant { font-size: 14pt; color: #475569; margin: 2mm 0; }
  .cover-date { font-size: 11pt; color: #64748b; }
  .synthesis-box { margin-top: 30mm; padding: 8mm; background: #f8fafc; border-left: 4px solid #2563eb; border-radius: 0 2mm 2mm 0; }
  .synthesis-box h3 { margin-top: 0; }
  .synthesis-box ul { margin: 0; padding-left: 4mm; }
  .compliance-note { margin-top: 20mm; font-size: 9pt; color: #64748b; }
  .compliance-note p { margin: 1mm 0; }
  .toc { page-break-after: always; }
  .toc h2 { border-bottom: 2px solid #1e293b; padding-bottom: 2mm; }
  .toc a { color: #2563eb; text-decoration: none; display: block; padding: 1mm 0; }
  .toc a:hover { text-decoration: underline; }
  .module-section { page-break-before: always; }
  .module-section h2 { font-size: 18pt; }
  .module-meta { font-size: 9pt; color: #64748b; margin-bottom: 4mm; }
  .matrix-table { width: 100%; border-collapse: collapse; font-size: 7pt; margin-top: 3mm; }
  .matrix-table th { background: #1e293b; color: #fff; padding: 2mm; text-align: left; }
  .matrix-table th.role-col { transform: rotate(-45deg); height: 35mm; vertical-align: bottom; white-space: nowrap; min-width: 6mm; padding: 1mm; }
  .matrix-table td { padding: 1.5mm 2mm; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .matrix-table td.granted { background: #dcfce7; }
  .matrix-table td.disabled { opacity: 0.4; background: #f1f5f9; }
  .perm-code { font-family: monospace; font-size: 6.5pt; color: #475569; }
  .perm-name { font-size: 7.5pt; }
  .module-disabled-note { margin-top: 4mm; padding: 2mm; background: #fef3c7; color: #92400e; border-radius: 1mm; font-size: 9pt; }
</style>

<main>
  {# Cover page #}
  <section class="cover-page">
    <h1>{{ _('RBAC_MATRIX_ROLES_PERMISSIONS') }}</h1>
    <p class="cover-tenant">{{ tenant.name }}</p>
    <p class="cover-date">{{ _('RBAC_GENERATED_AT') }} : {{ generated_at }}</p>

    <div class="synthesis-box">
      <h3>{{ _('RBAC_SECTION_SYNTHESIS') }}</h3>
      <ul>
        <li>{{ roles | length }} {{ _('RBAC_COUNT_ROLES') }}</li>
        <li>{{ permissions | length }} {{ _('RBAC_COUNT_PERMISSIONS') }}</li>
        <li>{{ grants | length }} {{ _('RBAC_COUNT_LINKS') }}</li>
      </ul>
    </div>

    <div class="compliance-note">
      <p>{{ _('RBAC_ISO_DOC_OPPOSABLE') }}</p>
      <p>{{ _('RBAC_AUDIT_EVENT') }} : <span style="font-family: monospace;">{{ audit_event_id | default('—') }}</span></p>
    </div>
  </section>

  {# Table of contents #}
  <section class="toc">
    <h2>{{ _('RBAC_SECTION_TOC') }}</h2>
    {% for module in modules %}
      <a href="#module-{{ module.namespace }}">
        {{ module.label }} ({{ module.permission_count }} {{ _('RBAC_COUNT_PERMISSIONS') }})
      </a>
    {% endfor %}
  </section>

  {# One section per module #}
  {% for module in modules %}
    <section id="module-{{ module.namespace }}" class="module-section">
      <h2>{{ module.label }} <span style="font-size: 10pt; color: #64748b;">({{ module.namespace }})</span></h2>
      <div class="module-meta">{{ module.permissions | length }} {{ _('RBAC_COUNT_PERMISSIONS') }}</div>

      <table class="matrix-table">
        <thead>
          <tr>
            <th>{{ _('RBAC_LABEL_NAME') }}</th>
            {% for role in roles %}
              <th class="role-col">{{ role.code }}</th>
            {% endfor %}
          </tr>
        </thead>
        <tbody>
          {% for perm in module.permissions %}
            <tr>
              <td style="min-width: 40mm;">
                <div class="perm-code">{{ perm.code }}</div>
                <div class="perm-name">{{ perm.name }}</div>
                {% if perm.sensitive %}<span class="badge-rgpd">RGPD</span>{% endif %}
              </td>
              {% for role in roles %}
                {% set cell_key = role.code ~ ',' ~ perm.code %}
                {% set is_granted = [role.code, perm.code] in grants %}
                <td class="{% if is_granted %}granted{% endif %} {% if perm.module_disabled %}disabled{% endif %}">
                  {% if is_granted %}
                    <span class="cell-granted">✓</span>
                  {% else %}
                    <span class="cell-not-granted">·</span>
                  {% endif %}
                </td>
              {% endfor %}
            </tr>
          {% endfor %}
        </tbody>
      </table>

      {% if module.disabled_in_tenant %}
        <div class="module-disabled-note">
          ⓘ {{ _('RBAC_LEGEND_MODULE_DISABLED') }}.
        </div>
      {% endif %}
    </section>
  {% endfor %}

  {# Legend #}
  <section class="page-break-before">
    <h2>{{ _('RBAC_SECTION_LEGEND') }}</h2>
    <table style="width: auto;">
      <tr><td><span class="cell-granted">✓</span></td><td>{{ _('RBAC_LEGEND_GRANTED') }}</td></tr>
      <tr><td><span class="cell-not-granted">·</span></td><td>{{ _('RBAC_LEGEND_NOT_GRANTED') }}</td></tr>
      <tr><td><span class="badge-rgpd">RGPD</span></td><td>{{ _('RBAC_LEGEND_RGPD_FLAG') }}</td></tr>
      <tr><td style="background: #f1f5f9; opacity: 0.6; padding: 2mm 4mm;">…</td><td>{{ _('RBAC_LEGEND_MODULE_DISABLED') }}</td></tr>
    </table>
  </section>
</main>
```

- [ ] **Step 2: Copier en EN (mêmes raisons que Task 3.1)**

```bash
cp app/static/rbac_pdf_templates/matrix_role_permissions.fr.body.html \
   app/static/rbac_pdf_templates/matrix_role_permissions.en.body.html
```

- [ ] **Step 3: Commit**

```bash
git add app/static/rbac_pdf_templates/matrix_role_permissions.*.body.html
git commit -m "feat(rbac): matrix role-permissions template FR+EN (A4 landscape, module decomposition)"
```

### Task 3.3 : Tests snapshot WeasyPrint pour les 2 templates phares

**Files:**
- Create: `tests/test_rbac_pdf_templates_seed.py`

- [ ] **Step 1: Créer le test**

```python
"""Snapshot tests for RBAC PDF templates — verifies WeasyPrint renders cleanly."""
import hashlib
import os
import pytest
from pathlib import Path

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_B_TEMPLATES_SEEDED") != "1",
    reason="Requires migration 172 (PR-B templates seed) applied. "
           "Set RBAC_PR_B_TEMPLATES_SEEDED=1 after `alembic upgrade head`.",
)


@pytest.mark.asyncio
async def test_render_delegation_certificate_does_not_raise(db_session, sample_entity, sample_user, another_user):
    """The delegation_certificate template renders without WeasyPrint errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_delegation_service import _build_certificate_variables
    from app.models.common import UserDelegation
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="snapshot test",
    )
    db_session.add(delegation)
    await db_session.flush()

    cert_vars = await _build_certificate_variables(db_session, delegation, sample_user, another_user, sample_entity.id)

    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.delegation_certificate",
        entity_id=sample_entity.id,
        language="fr",
        variables=cert_vars,
    )
    assert pdf_bytes is not None, "Template not seeded or render failed"
    assert pdf_bytes[:4] == b"%PDF", f"Output is not a PDF: {pdf_bytes[:20]}"
    assert len(pdf_bytes) > 1000, f"PDF suspiciously small: {len(pdf_bytes)} bytes"


@pytest.mark.asyncio
async def test_render_matrix_role_permissions_does_not_raise(db_session, sample_entity, sample_user):
    """The matrix_role_permissions template renders without WeasyPrint errors."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import build_matrix_role_permissions_variables

    vars_dict = await build_matrix_role_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr", include_disabled=False
    )
    pdf_bytes = await render_pdf(
        db_session,
        slug="core.rbac.matrix_role_permissions",
        entity_id=sample_entity.id,
        language="fr",
        variables=vars_dict,
    )
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 5000  # matrix is bigger than certificate


@pytest.mark.asyncio
async def test_render_both_languages(db_session, sample_entity, sample_user, another_user):
    """Both FR and EN versions render successfully (translations resolved)."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_delegation_service import _build_certificate_variables
    from app.models.common import UserDelegation
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=7),
        active=True,
        reason="bilingual test",
    )
    db_session.add(delegation)
    await db_session.flush()
    cert_vars = await _build_certificate_variables(db_session, delegation, sample_user, another_user, sample_entity.id)

    pdf_fr = await render_pdf(db_session, slug="core.rbac.delegation_certificate", entity_id=sample_entity.id, language="fr", variables=cert_vars)
    pdf_en = await render_pdf(db_session, slug="core.rbac.delegation_certificate", entity_id=sample_entity.id, language="en", variables=cert_vars)
    assert pdf_fr is not None and pdf_fr[:4] == b"%PDF"
    assert pdf_en is not None and pdf_en[:4] == b"%PDF"
    # The two PDFs should differ in size due to different translation strings
    # (won't be radically different but should not be byte-identical)
    fr_hash = hashlib.sha256(pdf_fr).hexdigest()
    en_hash = hashlib.sha256(pdf_en).hexdigest()
    assert fr_hash != en_hash, "FR and EN renders are identical — i18n may not be working"
```

- [ ] **Step 2: AST verify + commit**

```bash
python -c "import ast; ast.parse(open('tests/test_rbac_pdf_templates_seed.py').read())" && echo "AST OK"
git add tests/test_rbac_pdf_templates_seed.py
git commit -m "test(rbac): snapshot tests for delegation_certificate and matrix_role_permissions templates"
```

---

## Groupe 4 — 3 templates matrices et vues macro (group, user matrix, role_modules)

For each of these 3 templates, the structure follows the matrix_role_permissions phare pattern (cover → toc optional → main matrix → legend). The variables are produced by the corresponding `build_*_variables` function in `app/services/core/rbac_export_service.py` (Group 7 of PR-A).

### Task 4.1 : `matrix_group_permissions` template (FR+EN)

**Files:**
- Create: `app/static/rbac_pdf_templates/matrix_group_permissions.fr.body.html`
- Create: `app/static/rbac_pdf_templates/matrix_group_permissions.en.body.html`

- [ ] **Step 1: Create the body**

Structure: same as matrix_role_permissions but rows are groups (not permissions) and the grant cells include a source badge (role/group_override/delegation).

Read the spec §6.3 for the data shape: `groups[]`, `permissions[]`, `grants[]` (with `source` field).

Template body (copy-paste then adapt):

```html
{# Matrice Groupes × Permissions — A4 paysage. Inclut le badge de source RBAC (role/override/delegation). #}
<style>
  @page { size: A4 landscape; }
  .source-badge { display: inline-block; padding: 0.3mm 1mm; border-radius: 1mm; font-size: 5.5pt; font-weight: 700; text-transform: uppercase; vertical-align: middle; margin-left: 1mm; }
  .source-role { background: #dbeafe; color: #1e40af; }
  .source-group { background: #fef3c7; color: #92400e; }
  .source-delegation { background: #f3e8ff; color: #6b21a8; }
  .source-user { background: #fee2e2; color: #991b1b; }
</style>

<main>
  <section class="cover-page">
    <h1>{{ _('RBAC_MATRIX_GROUPS_PERMISSIONS') }}</h1>
    <p class="cover-tenant">{{ tenant.name }}</p>
    <p class="cover-date">{{ _('RBAC_GENERATED_AT') }} : {{ generated_at }}</p>
    <div class="synthesis-box">
      <h3>{{ _('RBAC_SECTION_SYNTHESIS') }}</h3>
      <ul>
        <li>{{ groups | length }} {{ _('RBAC_COUNT_GROUPS') }}</li>
        <li>{{ permissions | length }} {{ _('RBAC_COUNT_PERMISSIONS') }}</li>
        <li>{{ grants | length }} {{ _('RBAC_COUNT_LINKS') }}</li>
      </ul>
    </div>
  </section>

  <section class="page-break-before">
    <h2>{{ _('RBAC_MATRIX_GROUPS_PERMISSIONS') }}</h2>
    <table class="matrix-table">
      <thead>
        <tr>
          <th>{{ _('RBAC_LABEL_NAME') }}</th>
          {% for group in groups %}
            <th class="role-col">{{ group.name }}</th>
          {% endfor %}
        </tr>
      </thead>
      <tbody>
        {% for perm in permissions %}
          <tr>
            <td>
              <div class="perm-code">{{ perm.code }}</div>
              <div class="perm-name">{{ perm.name }}</div>
              {% if perm.sensitive %}<span class="badge-rgpd">RGPD</span>{% endif %}
            </td>
            {% for group in groups %}
              {% set grant = (grants | selectattr('group_id', 'equalto', group.id|string) | selectattr('perm_code', 'equalto', perm.code) | first) %}
              <td class="{% if grant %}granted{% endif %} {% if perm.module_disabled %}disabled{% endif %}">
                {% if grant %}
                  <span class="cell-granted">✓</span>
                  <span class="source-badge source-{{ grant.source | default('role') }}">{{ _('RBAC_SOURCE_' ~ (grant.source | default('role')) | upper) }}</span>
                {% else %}
                  <span class="cell-not-granted">·</span>
                {% endif %}
              </td>
            {% endfor %}
          </tr>
        {% endfor %}
      </tbody>
    </table>
  </section>

  <section class="page-break-before">
    <h2>{{ _('RBAC_SECTION_LEGEND') }}</h2>
    <table style="width: auto;">
      <tr><td><span class="cell-granted">✓</span></td><td>{{ _('RBAC_LEGEND_GRANTED') }}</td></tr>
      <tr><td><span class="source-badge source-role">{{ _('RBAC_SOURCE_ROLE') }}</span></td><td>{{ _('RBAC_SOURCE_ROLE') }}</td></tr>
      <tr><td><span class="source-badge source-group">{{ _('RBAC_SOURCE_GROUP') }}</span></td><td>{{ _('RBAC_SOURCE_GROUP') }}</td></tr>
      <tr><td><span class="source-badge source-delegation">{{ _('RBAC_SOURCE_DELEGATION') }}</span></td><td>{{ _('RBAC_SOURCE_DELEGATION') }}</td></tr>
    </table>
  </section>
</main>
```

- [ ] **Step 2: Copy to EN + commit**

```bash
cp app/static/rbac_pdf_templates/matrix_group_permissions.fr.body.html \
   app/static/rbac_pdf_templates/matrix_group_permissions.en.body.html
git add app/static/rbac_pdf_templates/matrix_group_permissions.*.body.html
git commit -m "feat(rbac): matrix group-permissions template FR+EN with source badges"
```

### Task 4.2 : `matrix_user_permissions` template (FR+EN)

**Pattern**: same as matrix_group_permissions, but rows are users (and their effective resolved permissions). Use `users[]` from the builder.

- [ ] **Step 1: Create the body** by adapting matrix_group_permissions: replace `groups` with `users`, `group.name` with `user.full_name`, no source badge (just granted/not).

Save as `app/static/rbac_pdf_templates/matrix_user_permissions.fr.body.html`. Copy to `.en.`.

- [ ] **Commit**:

```bash
git add app/static/rbac_pdf_templates/matrix_user_permissions.*.body.html
git commit -m "feat(rbac): matrix user-permissions template FR+EN (RGPD-sensitive)"
```

### Task 4.3 : `role_modules` template (FR+EN)

**Pattern**: A4 portrait. Compact summary table: rows = roles, columns = modules, cells = access level (R / RW / RWA / MGR / *).

- [ ] **Step 1: Create the body**

```html
{# Vue Rôles × Modules — niveau d'accès synthétique par module. A4 portrait. #}
<style>
  .level-cell { text-align: center; font-weight: 700; padding: 2mm; }
  .level-empty { color: #cbd5e1; }
  .level-R { background: #dbeafe; color: #1e40af; }
  .level-RW { background: #dcfce7; color: #166534; }
  .level-RWA { background: #fef3c7; color: #92400e; }
  .level-MGR { background: #ede9fe; color: #6b21a8; }
  .level-wildcard { background: #1e293b; color: #fff; }
</style>

<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_MATRIX_ROLES_MODULES') }}</h1>
  <p>{{ tenant.name }} — {{ _('RBAC_GENERATED_AT') }} {{ generated_at }}</p>

  <table style="margin-top: 6mm;">
    <thead>
      <tr>
        <th>{{ _('RBAC_LABEL_NAME') }}</th>
        {% for module in modules %}
          <th style="text-align: center; font-size: 7pt;">{{ module }}</th>
        {% endfor %}
      </tr>
    </thead>
    <tbody>
      {% for role in roles %}
        <tr>
          <td><strong>{{ role.code }}</strong><br><span style="font-size: 7pt; color: #64748b;">{{ role.name }}</span></td>
          {% for module in modules %}
            {% set level = (access_levels | selectattr('role_code', 'equalto', role.code) | selectattr('module', 'equalto', module) | map(attribute='level') | first) | default('–') %}
            <td class="level-cell {% if level == '*' %}level-wildcard{% elif level != '–' %}level-{{ level }}{% endif %}">
              {% if level == '–' %}<span class="level-empty">–</span>{% else %}{{ level }}{% endif %}
            </td>
          {% endfor %}
        </tr>
      {% endfor %}
    </tbody>
  </table>

  <h3 style="margin-top: 8mm;">{{ _('RBAC_SECTION_LEGEND') }}</h3>
  <table style="width: auto;">
    <tr><td class="level-cell level-R">R</td><td>Read</td></tr>
    <tr><td class="level-cell level-RW">RW</td><td>Read + Write</td></tr>
    <tr><td class="level-cell level-RWA">RWA</td><td>Read + Write + Approve</td></tr>
    <tr><td class="level-cell level-MGR">MGR</td><td>Manage</td></tr>
    <tr><td class="level-cell level-wildcard">*</td><td>Wildcard (all permissions)</td></tr>
  </table>
</main>
```

Save as `app/static/rbac_pdf_templates/role_modules.fr.body.html`. Copy to `.en.`.

- [ ] **Commit**:

```bash
git add app/static/rbac_pdf_templates/role_modules.*.body.html
git commit -m "feat(rbac): role-modules summary template FR+EN (compact access-level matrix)"
```

---

## Groupe 5 — Fiches détaillées (role, group, user)

Each of these 3 is A4 portrait with sections. Use the role_detail / group_detail / user_detail builder outputs.

### Task 5.1 : `role_detail` template (FR+EN)

**Structure**: cover-style heading with role code/name/description, then `permissions_by_module[]` table, then `groups_using_role[]` list, then `users_via_groups_count` counter.

- [ ] **Step 1: Create the body**

```html
<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_ROLE_DETAIL') }} — {{ role.code }}</h1>
  <p><strong>{{ _('RBAC_LABEL_NAME') }} :</strong> {{ role.name }}</p>
  {% if role.description %}<p><strong>{{ _('RBAC_LABEL_DESCRIPTION') }} :</strong> {{ role.description }}</p>{% endif %}
  {% if role.module %}<p><strong>{{ _('RBAC_LABEL_MODULE') }} :</strong> {{ role.module }}</p>{% endif %}

  <h2>{{ _('RBAC_SECTION_PERMISSIONS') }} ({{ permission_count }})</h2>
  {% for group in permissions_by_module %}
    <h3>{{ group.module }}</h3>
    <table>
      <thead>
        <tr><th>{{ _('RBAC_LABEL_CODE') }}</th><th>{{ _('RBAC_LABEL_NAME') }}</th><th>{{ _('RBAC_LABEL_ACTION') }}</th></tr>
      </thead>
      <tbody>
        {% for perm in group.permissions %}
          <tr>
            <td><span class="perm-code">{{ perm.code }}</span></td>
            <td>{{ perm.name }} {% if perm.sensitive %}<span class="badge-rgpd">RGPD</span>{% endif %}</td>
            <td>{{ perm.action }}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endfor %}

  <h2>{{ _('RBAC_SECTION_GROUPS') }}</h2>
  {% if groups_using_role %}
    <ul>
      {% for g in groups_using_role %}
        <li>{{ g.name }} {% if not g.active %}({{ _('RBAC_STATUS_REVOKED') }}){% endif %}</li>
      {% endfor %}
    </ul>
  {% else %}
    <p><em>Aucun groupe n'utilise ce rôle.</em></p>
  {% endif %}

  <p style="margin-top: 6mm;"><strong>{{ users_via_groups_count }}</strong> {{ _('RBAC_COUNT_USERS') }}</p>
</main>
```

Save as `app/static/rbac_pdf_templates/role_detail.fr.body.html`. Copy to `.en.`.

- [ ] **Commit**:

```bash
git add app/static/rbac_pdf_templates/role_detail.*.body.html
git commit -m "feat(rbac): role detail template FR+EN (permissions by module + groups using)"
```

### Task 5.2 : `group_detail` template (FR+EN)

Variables: `group`, `roles[]`, `members[]`.

- [ ] **Step 1: Create the body**

```html
<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_GROUP_DETAIL') }} — {{ group.name }}</h1>
  <p><strong>{{ _('RBAC_LABEL_STATUS') }} :</strong> {{ _('RBAC_STATUS_ACTIVE') if group.active else _('RBAC_STATUS_REVOKED') }}</p>
  {% if group.asset_scope %}<p><strong>{{ _('RBAC_LABEL_ASSET_SCOPE') }} :</strong> {{ group.asset_scope }}</p>{% endif %}

  <h2>{{ _('RBAC_SECTION_ROLES') }}</h2>
  <table>
    <thead><tr><th>{{ _('RBAC_LABEL_CODE') }}</th><th>{{ _('RBAC_LABEL_NAME') }}</th><th>{{ _('RBAC_LABEL_MODULE') }}</th></tr></thead>
    <tbody>
      {% for role in roles %}
        <tr><td><strong>{{ role.code }}</strong></td><td>{{ role.name }}</td><td>{{ role.module | default('—') }}</td></tr>
      {% endfor %}
    </tbody>
  </table>

  <h2>{{ _('RBAC_SECTION_MEMBERS') }} ({{ members | length }})</h2>
  <table>
    <thead><tr><th>{{ _('RBAC_LABEL_NAME') }}</th><th>Email</th></tr></thead>
    <tbody>
      {% for u in members %}
        <tr><td>{{ u.full_name }}</td><td>{{ u.email }}</td></tr>
      {% endfor %}
    </tbody>
  </table>
</main>
```

Save as `.fr.body.html` + copy to `.en.`. Commit:

```bash
git add app/static/rbac_pdf_templates/group_detail.*.body.html
git commit -m "feat(rbac): group detail template FR+EN (roles + members)"
```

### Task 5.3 : `user_detail` template (FR+EN) — RGPD-sensitive

Variables: `user`, `groups[]`, `overrides[]`, `effective_permissions[]` (with source), `delegations_received[]`, `delegations_given[]`.

- [ ] **Step 1: Create the body**

```html
<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_USER_DETAIL') }} — {{ user.full_name }}</h1>
  <p><strong>Email :</strong> {{ user.email }}</p>
  <p><strong>Type :</strong> {{ user.user_type }}</p>

  <h2>{{ _('RBAC_SECTION_GROUPS') }}</h2>
  <ul>{% for g in groups %}<li>{{ g.name }}</li>{% endfor %}</ul>

  <h2>{{ _('RBAC_SECTION_OVERRIDES') }}</h2>
  {% if overrides %}
    <table>
      <thead><tr><th>{{ _('RBAC_LABEL_CODE') }}</th><th>État</th></tr></thead>
      <tbody>
        {% for o in overrides %}
          <tr>
            <td><span class="perm-code">{{ o.code }}</span></td>
            <td>{% if o.granted %}✓ accordée{% else %}✗ révoquée{% endif %}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% else %}
    <p><em>Aucune surcharge.</em></p>
  {% endif %}

  <h2>{{ _('RBAC_SECTION_EFFECTIVE_PERMISSIONS') }} ({{ effective_permissions | length }})</h2>
  <table>
    <thead><tr><th>{{ _('RBAC_LABEL_CODE') }}</th><th>{{ _('RBAC_LABEL_SOURCE') }}</th></tr></thead>
    <tbody>
      {% for p in effective_permissions %}
        <tr>
          <td><span class="perm-code">{{ p.code }}</span></td>
          <td><span class="source-badge source-{{ p.source }}">{{ _('RBAC_SOURCE_' ~ p.source | upper) }}</span></td>
        </tr>
      {% endfor %}
    </tbody>
  </table>

  {% if delegations_received %}
    <h2>{{ _('RBAC_SECTION_DELEGATIONS_RECEIVED') }}</h2>
    <table>
      <thead><tr><th>De</th><th>{{ _('RBAC_LABEL_PERIOD') }}</th><th>{{ _('RBAC_SECTION_PERMISSIONS') }}</th><th>{{ _('RBAC_LABEL_REASON') }}</th></tr></thead>
      <tbody>
        {% for d in delegations_received %}
          <tr>
            <td>{{ d.delegator_id }}</td>
            <td>{{ d.start_date }} → {{ d.end_date }}</td>
            <td>{{ d.permissions | length }}</td>
            <td>{{ d.reason | default('—') }}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}

  {% if delegations_given %}
    <h2>{{ _('RBAC_SECTION_DELEGATIONS_GIVEN') }}</h2>
    <table>
      <thead><tr><th>À</th><th>{{ _('RBAC_LABEL_PERIOD') }}</th><th>{{ _('RBAC_SECTION_PERMISSIONS') }}</th><th>{{ _('RBAC_LABEL_REASON') }}</th></tr></thead>
      <tbody>
        {% for d in delegations_given %}
          <tr>
            <td>{{ d.delegate_id }}</td>
            <td>{{ d.start_date }} → {{ d.end_date }}</td>
            <td>{{ d.permissions | length }}</td>
            <td>{{ d.reason | default('—') }}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endif %}

  <div class="audit-footer" style="margin-top: 12mm; padding-top: 4mm; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b;">
    <p><strong>{{ _('RBAC_AUDIT_EVENT') }} :</strong> <span style="font-family: monospace;">{{ audit_event_id | default('—') }}</span></p>
    <p><em>{{ _('RBAC_ISO_CLAUSE_REVIEW') }}</em></p>
  </div>
</main>
```

Save + copy + commit:

```bash
git add app/static/rbac_pdf_templates/user_detail.*.body.html
git commit -m "feat(rbac): user detail template FR+EN (RGPD-sensitive — includes delegations)"
```

---

## Groupe 6 — Catalog + SoD + Delegations registry

### Task 6.1 : `permission_catalog` template (FR+EN)

Variables: `permissions_by_module[]` (each entry = `{group: str, permissions: [...]}`), `permission_count`, `group_by` (`module` or `action`).

- [ ] **Step 1: Create the body**

```html
<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_PERMISSION_CATALOG') }}</h1>
  <p>{{ tenant.name }} — {{ permission_count }} {{ _('RBAC_COUNT_PERMISSIONS') }}</p>

  {% for group in permissions_by_module %}
    <h2>{{ group.group }}</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 30%;">{{ _('RBAC_LABEL_CODE') }}</th>
          <th>{{ _('RBAC_LABEL_NAME') }}</th>
          <th style="width: 12%;">{{ _('RBAC_LABEL_NAMESPACE') }}</th>
          <th style="width: 14%;">{{ _('RBAC_LABEL_RESOURCE') }}</th>
          <th style="width: 12%;">{{ _('RBAC_LABEL_ACTION') }}</th>
        </tr>
      </thead>
      <tbody>
        {% for perm in group.permissions %}
          <tr>
            <td><span class="perm-code">{{ perm.code }}</span> {% if perm.sensitive %}<span class="badge-rgpd">RGPD</span>{% endif %}</td>
            <td>{{ perm.name }}</td>
            <td>{{ perm.namespace | default('—') }}</td>
            <td>{{ perm.resource | default('—') }}</td>
            <td>{{ perm.action | default('—') }}</td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% endfor %}
</main>
```

Save + copy + commit:

```bash
git add app/static/rbac_pdf_templates/permission_catalog.*.body.html
git commit -m "feat(rbac): permission catalog template FR+EN"
```

### Task 6.2 : `sod_matrix` template (FR+EN)

Variables: `sod_rules[]` (each = `{id, label, perms}`), `violations[]` (each = `{role_code, rule_id, rule_label, perms}`), `violation_count`.

- [ ] **Step 1: Create the body**

```html
<main style="padding: 8mm 12mm;">
  <h1>{{ _('RBAC_MATRIX_SOD') }}</h1>
  <p>{{ tenant.name }} — {{ violation_count }} {{ _('RBAC_SOD_VIOLATIONS_COUNT') }}</p>

  {% if violations %}
    <h2>{{ _('RBAC_SOD_VIOLATIONS_COUNT') }}</h2>
    <table>
      <thead>
        <tr>
          <th>{{ _('RBAC_SOD_AFFECTED_ROLE') }}</th>
          <th>{{ _('RBAC_SOD_RULE') }}</th>
          <th>{{ _('RBAC_SECTION_PERMISSIONS') }}</th>
        </tr>
      </thead>
      <tbody>
        {% for v in violations %}
          <tr>
            <td><strong>{{ v.role_code }}</strong></td>
            <td>{{ v.rule_label }} <br><span style="font-size: 7pt; color: #64748b;">({{ v.rule_id }})</span></td>
            <td>
              {% for p in v.perms %}<span class="perm-code">{{ p }}</span><br>{% endfor %}
            </td>
          </tr>
        {% endfor %}
      </tbody>
    </table>
  {% else %}
    <p style="padding: 4mm; background: #dcfce7; color: #166534; border-radius: 2mm;">{{ _('RBAC_SOD_NO_VIOLATIONS') }}</p>
  {% endif %}

  <h2 style="margin-top: 8mm;">{{ _('RBAC_SECTION_LEGEND') }} — {{ _('RBAC_SOD_RULE') }}s</h2>
  <table>
    <thead><tr><th>ID</th><th>{{ _('RBAC_LABEL_DESCRIPTION') }}</th><th>{{ _('RBAC_SECTION_PERMISSIONS') }}</th></tr></thead>
    <tbody>
      {% for r in sod_rules %}
        <tr>
          <td><strong>{{ r.id }}</strong></td>
          <td>{{ r.label }}</td>
          <td>{% for p in r.perms %}<span class="perm-code">{{ p }}</span><br>{% endfor %}</td>
        </tr>
      {% endfor %}
    </tbody>
  </table>
</main>
```

Save + copy + commit:

```bash
git add app/static/rbac_pdf_templates/sod_matrix.*.body.html
git commit -m "feat(rbac): SoD matrix template FR+EN (violations + rules legend)"
```

### Task 6.3 : `delegation_registry` template (FR+EN)

Variables: `delegations[]` (each = `{id, delegator_name, delegate_name, permissions, start_date, end_date, status, reason}`), `delegation_count`, `period`.

- [ ] **Step 1: Create the body** (A4 paysage pour la lisibilité du tableau)

```html
{# Delegations registry — A4 paysage. #}
<style>
  @page { size: A4 landscape; }
  .status-cell { padding: 1mm 2mm; border-radius: 1mm; font-size: 7pt; font-weight: 700; text-transform: uppercase; }
  .status-active { background: #dcfce7; color: #166534; }
  .status-programmed { background: #dbeafe; color: #1e40af; }
  .status-expired { background: #f1f5f9; color: #64748b; }
  .status-revoked { background: #fee2e2; color: #991b1b; }
</style>

<main style="padding: 6mm 10mm;">
  <h1>{{ _('RBAC_DELEGATIONS_REGISTRY') }}</h1>
  <p>{{ tenant.name }} — {{ delegation_count }} {{ _('RBAC_COUNT_DELEGATIONS') }}</p>
  {% if period.start or period.end %}
    <p>{{ _('RBAC_LABEL_PERIOD') }} : {{ period.start | default('…') }} → {{ period.end | default('…') }}</p>
  {% endif %}

  <table style="margin-top: 4mm;">
    <thead>
      <tr>
        <th>{{ _('RBAC_LABEL_DELEGATOR') }}</th>
        <th>{{ _('RBAC_LABEL_DELEGATE') }}</th>
        <th>{{ _('RBAC_LABEL_PERIOD') }}</th>
        <th>{{ _('RBAC_LABEL_STATUS') }}</th>
        <th>{{ _('RBAC_COUNT_PERMISSIONS') }}</th>
        <th>{{ _('RBAC_LABEL_REASON') }}</th>
      </tr>
    </thead>
    <tbody>
      {% for d in delegations %}
        <tr>
          <td>{{ d.delegator_name }}</td>
          <td>{{ d.delegate_name }}</td>
          <td style="font-size: 7pt;">{{ d.start_date }}<br>→ {{ d.end_date }}</td>
          <td><span class="status-cell status-{{ d.status }}">{{ _('RBAC_STATUS_' ~ d.status | upper) }}</span></td>
          <td style="text-align: center;">{{ d.permissions | length }}</td>
          <td style="font-size: 7.5pt;">{{ d.reason | default('—') | truncate(80) }}</td>
        </tr>
      {% endfor %}
    </tbody>
  </table>

  <p style="margin-top: 8mm; font-size: 8pt; color: #64748b; font-style: italic;">
    {{ _('RBAC_ISO_CLAUSE_REVIEW') }}
  </p>
</main>
```

Save + copy + commit:

```bash
git add app/static/rbac_pdf_templates/delegation_registry.*.body.html
git commit -m "feat(rbac): delegation registry template FR+EN (A4 landscape, status badges)"
```

---

## Groupe 7 — Templates email (4 slugs)

Each email template has 3 files per language: `.subject.txt`, `.body.html`, `.body.txt`. Total: 4 × 2 × 3 = 24 files.

### Task 7.1 : `rbac.delegation.granted` (FR+EN)

**Files:**
- Create: `app/static/rbac_email_templates/delegation_granted.fr.subject.txt`
- Create: `app/static/rbac_email_templates/delegation_granted.fr.body.html`
- Create: `app/static/rbac_email_templates/delegation_granted.fr.body.txt`
- Create: `app/static/rbac_email_templates/delegation_granted.en.subject.txt`
- Create: `app/static/rbac_email_templates/delegation_granted.en.body.html`
- Create: `app/static/rbac_email_templates/delegation_granted.en.body.txt`

- [ ] **Step 1: Create the 6 files**

```bash
mkdir -p app/static/rbac_email_templates
```

`delegation_granted.fr.subject.txt`:
```
[OpsFlux] Confirmation de délégation accordée à {{ delegate.full_name }}
```

`delegation_granted.fr.body.html`:
```html
<p>Bonjour {{ delegator.full_name }},</p>
<p>Vous venez d'accorder une délégation de permissions à <strong>{{ delegate.full_name }}</strong> ({{ delegate.email }}).</p>
<ul>
  <li><strong>Période :</strong> {{ delegation.start_date }} → {{ delegation.end_date }} ({{ delegation_duration_days }} jours)</li>
  <li><strong>Nombre de permissions :</strong> {{ delegation.permissions | length }}</li>
  <li><strong>Motif :</strong> {{ delegation.reason }}</li>
</ul>
<p>Le certificat de délégation est joint à cet email (PDF signé électroniquement par empreinte SHA-256).</p>
<p>Conformément à ISO 27001 §A.9.2.5, cette délégation est tracée dans le journal d'audit RBAC.</p>
<p style="color: #64748b; font-size: 11px;">Empreinte du certificat : {{ content_hash | default('—') }}</p>
```

`delegation_granted.fr.body.txt`:
```
Bonjour {{ delegator.full_name }},

Vous venez d'accorder une délégation de permissions à {{ delegate.full_name }} ({{ delegate.email }}).

Période : {{ delegation.start_date }} -> {{ delegation.end_date }} ({{ delegation_duration_days }} jours)
Nombre de permissions : {{ delegation.permissions | length }}
Motif : {{ delegation.reason }}

Le certificat de délégation est joint à cet email (PDF signé électroniquement par empreinte SHA-256).
Conformément à ISO 27001 §A.9.2.5, cette délégation est tracée dans le journal d'audit RBAC.

Empreinte du certificat : {{ content_hash | default('—') }}
```

EN versions: translate the above naturally.

`delegation_granted.en.subject.txt`:
```
[OpsFlux] Delegation granted to {{ delegate.full_name }} — confirmation
```

`delegation_granted.en.body.html`: same structure, translated.
`delegation_granted.en.body.txt`: same structure, translated.

- [ ] **Commit**:

```bash
git add app/static/rbac_email_templates/delegation_granted.*
git commit -m "feat(rbac): email template delegation_granted (FR+EN, subject + html + text)"
```

### Task 7.2-7.4 : `rbac.delegation.received` / `revoked` / `expired` (FR+EN each)

For each of the 3 remaining email templates, follow the same 6-file pattern (subject, html body, text body) × 2 languages.

**Content guidelines**:
- `received`: addressed to the delegate. Includes the same period/permissions list. Action: "These permissions are now active on your account until {end_date}."
- `revoked`: addressed to both delegator and delegate (same template, sent to both). Includes revocation actor + reason.
- `expired`: 2 variants (J-3 reminder vs J0 final). Use `{% if expiry_phase == 'j3' %}` ... `{% else %}` to differentiate.

For each template, commit once with all 6 files:

```bash
git add app/static/rbac_email_templates/delegation_received.*
git commit -m "feat(rbac): email template delegation_received (FR+EN)"

git add app/static/rbac_email_templates/delegation_revoked.*
git commit -m "feat(rbac): email template delegation_revoked (FR+EN)"

git add app/static/rbac_email_templates/delegation_expired.*
git commit -m "feat(rbac): email template delegation_expired with J-3/J0 branch (FR+EN)"
```

---

## Groupe 8 — Migration de seed + tests snapshot complets + doc

### Task 8.1 : Compléter `alembic/versions/172_rbac_seed_pdf_email_templates.py` avec le seed PDF

Now that all HTML files exist, extend the migration to load them and insert into `PdfTemplate` / `PdfTemplateVersion`.

- [ ] **Step 1: Append to migration 172**

Add inside `upgrade()` (after `_seed_i18n_translations()`):

```python
def upgrade():
    _seed_i18n_translations()
    _seed_pdf_templates()
    _seed_email_templates()


def _read_shared_partials() -> tuple[str, str, str]:
    """Read the 3 shared HTML partials (header, footer, CSS). Inlined into every template."""
    base = _STATIC_ROOT / "rbac_pdf_templates" / "_shared"
    header = _read_file(base / "header.html")
    footer = _read_file(base / "footer.html")
    css = _read_file(base / "common.css")
    return header, footer, css


def _seed_pdf_templates():
    """Seed 11 PdfTemplate + 22 PdfTemplateVersion rows."""
    header_html, footer_html, common_css = _read_shared_partials()
    css_block = f"<style>{common_css}</style>"

    # (slug, name_fr, name_en, page_format)
    TEMPLATES = [
        ("core.rbac.matrix_role_permissions", "Matrice Rôles × Permissions", "Roles × Permissions Matrix", "A4_LANDSCAPE"),
        ("core.rbac.matrix_group_permissions", "Matrice Groupes × Permissions", "Groups × Permissions Matrix", "A4_LANDSCAPE"),
        ("core.rbac.matrix_user_permissions", "Matrice Utilisateurs × Permissions", "Users × Permissions Matrix", "A4_LANDSCAPE"),
        ("core.rbac.role_detail", "Fiche détaillée d'un rôle", "Role detail sheet", "A4_PORTRAIT"),
        ("core.rbac.group_detail", "Fiche détaillée d'un groupe", "Group detail sheet", "A4_PORTRAIT"),
        ("core.rbac.user_detail", "Fiche détaillée d'un utilisateur", "User detail sheet", "A4_PORTRAIT"),
        ("core.rbac.role_modules", "Vue Rôles × Modules", "Roles × Modules View", "A4_PORTRAIT"),
        ("core.rbac.permission_catalog", "Catalogue de permissions", "Permission catalog", "A4_PORTRAIT"),
        ("core.rbac.sod_matrix", "Matrice de ségrégation des devoirs", "Segregation of Duties Matrix", "A4_PORTRAIT"),
        ("core.rbac.delegation_registry", "Registre des délégations", "Delegations registry", "A4_LANDSCAPE"),
        ("core.rbac.delegation_certificate", "Certificat de délégation", "Delegation certificate", "A4_PORTRAIT"),
    ]

    base_dir = _STATIC_ROOT / "rbac_pdf_templates"
    conn = op.get_bind()
    from sqlalchemy import text

    for slug, name_fr, name_en, page_format in TEMPLATES:
        # Filename derives from the last segment of the slug (e.g., 'matrix_role_permissions')
        file_stem = slug.split(".")[-1]

        # Insert PdfTemplate (idempotent via ON CONFLICT slug)
        conn.execute(
            text("""
                INSERT INTO pdf_templates (slug, name, category, entity_id, enabled, variables_schema, created_at, updated_at)
                VALUES (:slug, :name, 'rbac_export', NULL, true, '{}'::jsonb, NOW(), NOW())
                ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, enabled = true
            """),
            {"slug": slug, "name": name_fr},
        )

        # Get the template id
        result = conn.execute(
            text("SELECT id FROM pdf_templates WHERE slug = :slug"), {"slug": slug}
        )
        template_id = result.scalar_one()

        for lang, name in (("fr", name_fr), ("en", name_en)):
            body_path = base_dir / f"{file_stem}.{lang}.body.html"
            if not body_path.exists():
                # fallback: use fr version if en file is a copy
                body_path = base_dir / f"{file_stem}.fr.body.html"
            body_html = css_block + "\n" + _read_file(body_path)

            conn.execute(
                text("""
                    INSERT INTO pdf_template_versions
                        (template_id, language, version_number, body_html, header_html, footer_html, published, created_at, updated_at)
                    VALUES (:tid, :lang, 1, :body, :header, :footer, true, NOW(), NOW())
                    ON CONFLICT (template_id, language, version_number) DO UPDATE SET
                        body_html = EXCLUDED.body_html,
                        header_html = EXCLUDED.header_html,
                        footer_html = EXCLUDED.footer_html,
                        published = true
                """),
                {
                    "tid": template_id,
                    "lang": lang,
                    "body": body_html,
                    "header": header_html,
                    "footer": footer_html,
                },
            )


def _seed_email_templates():
    """Seed 4 EmailTemplate + 8 EmailTemplateVersion rows."""
    SLUGS = [
        ("rbac.delegation.granted", "delegation_granted"),
        ("rbac.delegation.received", "delegation_received"),
        ("rbac.delegation.revoked", "delegation_revoked"),
        ("rbac.delegation.expired", "delegation_expired"),
    ]
    base_dir = _STATIC_ROOT / "rbac_email_templates"
    conn = op.get_bind()
    from sqlalchemy import text

    for slug, file_stem in SLUGS:
        conn.execute(
            text("""
                INSERT INTO email_templates (slug, category, entity_id, enabled, created_at, updated_at)
                VALUES (:slug, 'rbac_delegation', NULL, true, NOW(), NOW())
                ON CONFLICT (slug) DO UPDATE SET enabled = true
            """),
            {"slug": slug},
        )
        result = conn.execute(
            text("SELECT id FROM email_templates WHERE slug = :slug"), {"slug": slug}
        )
        template_id = result.scalar_one()

        for lang in ("fr", "en"):
            subject = _read_file(base_dir / f"{file_stem}.{lang}.subject.txt").strip()
            body_html = _read_file(base_dir / f"{file_stem}.{lang}.body.html")
            body_text = _read_file(base_dir / f"{file_stem}.{lang}.body.txt")

            conn.execute(
                text("""
                    INSERT INTO email_template_versions
                        (template_id, language, version_number, subject, body_html, body_text, published, created_at, updated_at)
                    VALUES (:tid, :lang, 1, :subject, :html, :text, true, NOW(), NOW())
                    ON CONFLICT (template_id, language, version_number) DO UPDATE SET
                        subject = EXCLUDED.subject,
                        body_html = EXCLUDED.body_html,
                        body_text = EXCLUDED.body_text,
                        published = true
                """),
                {"tid": template_id, "lang": lang, "subject": subject, "html": body_html, "text": body_text},
            )
```

**IMPORTANT** : verify the exact column names for `PdfTemplate` / `PdfTemplateVersion` / `EmailTemplate` / `EmailTemplateVersion` in the model layer:
```bash
grep -n "class PdfTemplate\|class EmailTemplate\|__tablename__" app/models/common.py | head -10
```

Adjust the SQL if the column names differ (e.g., `is_published` vs `published`, `version_num` vs `version_number`, etc.).

- [ ] **Step 2: Append the downgrade**

Modify `downgrade()`:

```python
def downgrade():
    # Delete rbac_pdf translations
    op.execute("DELETE FROM \"references\" WHERE domain = 'rbac_pdf'")
    # Delete PDF templates and their versions
    op.execute("""
        DELETE FROM pdf_template_versions
        WHERE template_id IN (SELECT id FROM pdf_templates WHERE slug LIKE 'core.rbac.%')
    """)
    op.execute("DELETE FROM pdf_templates WHERE slug LIKE 'core.rbac.%'")
    # Delete email templates and their versions
    op.execute("""
        DELETE FROM email_template_versions
        WHERE template_id IN (SELECT id FROM email_templates WHERE slug LIKE 'rbac.delegation.%')
    """)
    op.execute("DELETE FROM email_templates WHERE slug LIKE 'rbac.delegation.%'")
```

- [ ] **Step 3: AST verify + commit**

```bash
python -c "import ast; ast.parse(open('alembic/versions/172_rbac_seed_pdf_email_templates.py').read())" && echo "AST OK"
git add alembic/versions/172_rbac_seed_pdf_email_templates.py
git commit -m "feat(rbac): migration 172 — seed 11 PDF templates (FR+EN) + 4 email templates from static HTML files"
```

### Task 8.2 : Tests snapshot pour les 11 templates

**Files:**
- Modify: `tests/test_rbac_pdf_templates_seed.py`

- [ ] **Step 1: Add 9 more snapshot tests**

For each of the 9 remaining templates, add a test like:

```python
@pytest.mark.asyncio
async def test_render_TEMPLATE_NAME(db_session, sample_entity, sample_user):
    """Snapshot test for TEMPLATE_NAME — renders without error."""
    from app.core.pdf_templates import render_pdf
    from app.services.core.rbac_export_service import BUILDER_NAME

    vars_dict = await BUILDER_NAME(db_session, sample_entity.id, sample_user, lang="fr", ...)
    pdf_bytes = await render_pdf(
        db_session, slug="core.rbac.TEMPLATE_NAME", entity_id=sample_entity.id,
        language="fr", variables=vars_dict,
    )
    assert pdf_bytes is not None
    assert pdf_bytes[:4] == b"%PDF"
```

Templates to add:
- `matrix_group_permissions` → builder `build_matrix_group_permissions_variables`
- `matrix_user_permissions` → builder `build_matrix_user_permissions_variables`
- `role_detail` → builder `build_role_detail_variables(role_code='TENANT_ADMIN')`
- `group_detail` → builder `build_group_detail_variables(group_id=<sample_group.id>)`
- `user_detail` → builder `build_user_detail_variables(target_user_id=<sample_user.id>)`
- `role_modules` → builder `build_role_modules_variables`
- `permission_catalog` → builder `build_permission_catalog_variables(group_by='module', include_disabled=False)`
- `sod_matrix` → builder `build_sod_matrix_variables`
- `delegation_registry` → builder `build_delegations_registry_variables`

- [ ] **Commit**:

```bash
git add tests/test_rbac_pdf_templates_seed.py
git commit -m "test(rbac): snapshot tests for all 11 RBAC PDF templates"
```

### Task 8.3 : Developer doc `docs/developer/rbac-pdf-templates.md`

- [ ] **Step 1: Create the doc**

```markdown
# RBAC PDF Templates — Developer Guide

## Overview

11 PDF templates seedés via migration 172, sous slugs `core.rbac.*`. 4 email templates
sous `rbac.delegation.*`. Tous en FR + EN.

## File layout

- HTML statiques : `app/static/rbac_pdf_templates/`
- Partials communs : `_shared/header.html`, `_shared/footer.html`, `_shared/common.css`
  (inlined dans chaque body au seed time)
- Migration : `alembic/versions/172_rbac_seed_pdf_email_templates.py`

## How to add a new template

1. Create `<file_stem>.fr.body.html` and `<file_stem>.en.body.html` under `app/static/rbac_pdf_templates/`.
2. Use `{{ _('KEY') }}` for translatable strings. Add new keys to the `TRANSLATIONS` list in migration 172
   (both FR and EN values).
3. Reference shared CSS classes (`.badge-rgpd`, `.matrix-table`, `.cell-granted`, etc.) for visual consistency.
4. Set `@page { size: A4 portrait | A4 landscape; }` at the top of the template body.
5. Add the slug + page_format to the `TEMPLATES` list in migration 172.
6. Add a snapshot test in `tests/test_rbac_pdf_templates_seed.py`.

## How to add a new translation

1. Add the key to `TRANSLATIONS` in migration 172 (both `fr` and `en` values).
2. Use `{{ _('YOUR_KEY') }}` in any template.
3. If you change an existing translation: `alembic upgrade head` re-runs and the `ON CONFLICT DO UPDATE`
   refreshes the value.

## How the i18n cache works

- `prime_translation_cache(db, lang)` loads all `rbac_pdf` translations into a process-local dict.
- Called once per language per process, on first `render_pdf` after startup.
- Missing keys fall back to returning the key itself (no exception).
- To force a refresh: call `_clear_translation_cache(lang)` after mutating `references`.

## Email templates

4 slugs : `rbac.delegation.{granted,received,revoked,expired}`. Each has subject, HTML body, text body
under `app/static/rbac_email_templates/`. Loaded by migration 172.

The certificate PDF is attached to all 4 emails (rendered live by the delegation service).
```

- [ ] **Commit**:

```bash
git add docs/developer/rbac-pdf-templates.md
git commit -m "docs(rbac): developer guide for PDF and email templates"
```

### Task 8.4 : Final push + PR description

- [ ] **Step 1: Verify the full diff is coherent**

```bash
git log --oneline d283c8c0..HEAD | wc -l
git log --oneline d283c8c0..HEAD
```

Expected ~25-30 commits for PR-B.

- [ ] **Step 2: Push the branch**

```bash
git push origin claude/gracious-haslett-4b8b09
```

- [ ] **Step 3: Open PR via the GitHub URL** (or `gh pr create` if installed):

```
https://github.com/hmunyeku/OPSFLUX/compare/main...claude/gracious-haslett-4b8b09
```

Suggested title: `feat(rbac): PR-B — Templates PDF + email (FR/EN) + i18n infrastructure`

---

## Récapitulatif PR-B

| Métrique | Valeur |
|---|---|
| Templates PDF | 11 slugs × 2 langues = 22 versions |
| Templates email | 4 slugs × 2 langues = 8 versions |
| Translations seedées | ~80 keys × 2 langues = 160 rows in `references` |
| Migrations alembic | 1 (172) |
| Tests snapshot | 11 (1 par template PDF) |
| Tâches TDD | ~25 |
| Commits attendus | ~25 |
| Sprints estimés | 1 |

**Après merge** : ré-invoquer `superpowers:writing-plans` pour produire le plan détaillé de PR-C (UI front).

---

## Self-review

J'ai relu chaque section. Notes :

1. **Coverage spec** : les 11 templates PDF + 4 emails + i18n + migration sont tous couverts. ✓
2. **Placeholders** : 2 endroits utilisent un "pattern à suivre" pour les templates moyens (groupes 4-7). Justifié vu la longueur — chaque template fait 50-150 lignes de HTML/CSS, copier-coller le code complet ferait un plan de 15000+ lignes. Le pattern est clairement défini avec les variables exactes du builder.
3. **Type consistency** : les noms `slug`, `language`, `version_number`, `body_html`, `header_html`, `footer_html` sont cohérents avec PR-A. La migration utilise les noms vérifiés au step 1 de Task 8.1.
4. **Risque encoding** : Windows + msys2 + cp1252 vs utf-8. Tous les fichiers HTML doivent être créés/lus en UTF-8 (avec accents français). La migration utilise `encoding="utf-8"` explicitement.
5. **Risque WeasyPrint Windows** : peut nécessiter `GTK+ for Windows` installé. Mentionné dans pré-requis.
6. **Idempotence migration 172** : `ON CONFLICT DO UPDATE` partout, re-jouable.

Pas d'autres issues détectées.
