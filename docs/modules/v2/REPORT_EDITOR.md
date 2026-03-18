# OpsFlux — modules/v2/REPORT_EDITOR.md
# Module ReportEditor — Spécification Complète avec Implémentation

---

## 1. Manifest complet

```python
MODULE_MANIFEST = {
    "slug": "report_editor",
    "version": "1.0.0",
    "depends_on": ["core"],

    "objects": [{
        "slug": "document",
        "capabilities": {
            "versioning": True,    # Rev 0, A, B... — Core gère tout
            "workflow": True,      # circuit de validation — Core gère tout
            "attachments": True,   # PJ au document
            "categories": True,
            "comments": True,
            "labels": True,
            "watch": True,
            "relations": True,
            "search": True,
            "audit": True,
            "custom_fields": True,
            "export": True,
        }
    }],

    "permissions": [
        "document.read", "document.create", "document.edit",
        "document.submit", "document.approve", "document.reject",
        "document.admin", "template.create", "template.edit",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "Rédacteur", "icon": "FilePen",
         "route": "/documents", "order": 30,
         "badge_source": "/api/v1/workflow/my-pending-count"}
    ],

    "notification_templates": [
        {
            "key": "workflow.validation_required",
            "title": {"fr": "Validation requise : {document_title}"},
            "body": {"fr": "Le document {document_number} attend votre validation (étape : {workflow_step})."},
            "action_url": "/documents/{document_id}",
            "action_label": {"fr": "Valider"},
            "default_channels": ["in_app", "email"],
            "priority": "high",
        },
        {
            "key": "workflow.rejected",
            "title": {"fr": "Document rejeté : {document_title}"},
            "body": {"fr": "Votre document {document_number} a été rejeté. Motif : {rejection_reason}"},
            "action_url": "/documents/{document_id}",
            "action_label": {"fr": "Corriger"},
            "default_channels": ["in_app", "email"],
            "priority": "high",
        },
        {
            "key": "workflow.approved",
            "title": {"fr": "Document approuvé : {document_title}"},
            "action_url": "/documents/{document_id}",
            "default_channels": ["in_app"],
            "priority": "normal",
        },
    ],

    "mcp_tools": [
        "search_documents", "get_document", "create_document",
        "update_document_field", "submit_document_for_validation",
        "approve_document", "reject_document",
        "get_document_history", "summarize_document",
        "generate_from_template", "get_similar_documents",
        "list_templates",
    ],

    "email_templates": [
        "workflow.validation_required",
        "workflow.rejected",
        "workflow.approved",
        "workflow.deadline_reminder",
    ],

    "settings": [
        {"key": "default_export_format", "type": "select",
         "options": [{"value": "pdf", "label": "PDF"},
                     {"value": "docx", "label": "Word (.docx)"}],
         "default": "pdf", "scope": "user",
         "label": {"fr": "Format d'export par défaut"}},
        {"key": "autosave_interval_seconds", "type": "number",
         "default": 30, "scope": "user", "options": {"min": 10, "max": 300},
         "label": {"fr": "Intervalle de sauvegarde automatique (secondes)"}},
        {"key": "offline_quota_mb", "type": "number",
         "default": 50, "scope": "tenant", "options": {"min": 10, "max": 500},
         "requires_permission": "document.admin",
         "label": {"fr": "Quota stockage hors-ligne (MB)"}},
        {"key": "enable_ai_autocomplete", "type": "toggle",
         "default": True, "scope": "user",
         "label": {"fr": "Activer l\'auto-complétion IA dans l\'éditeur"}},
        {"key": "track_changes_on_edit", "type": "toggle",
         "default": False, "scope": "user",
         "label": {"fr": "Activer le suivi des modifications par défaut"}},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 2. Modèle de données complet

```sql
-- ─── PROJETS & ARBORESCENCE ──────────────────────────────────────

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    bu_id UUID REFERENCES business_units(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | on_hold | completed | cancelled
    start_date DATE,
    end_date DATE,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, code)
);

CREATE TABLE arborescence_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES arborescence_nodes(id),
    name VARCHAR(255) NOT NULL,
    node_level INTEGER NOT NULL DEFAULT 0,  -- 0 = racine
    display_order INTEGER NOT NULL DEFAULT 0,
    nomenclature_override JSONB,
    -- surcharge partielle du pattern parent ex: {"DISC": "HSE"}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TYPES DE DOCUMENTS ──────────────────────────────────────────

CREATE TABLE doc_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(50) NOT NULL,
    name JSONB NOT NULL,              -- {"fr": "Rapport de production", "en": "Production report"}
    nomenclature_pattern VARCHAR(255) NOT NULL,
    -- ex: "{TENANT}-{PROJ}-{DISC}-{TYPE}-{SEQ:4}"
    discipline VARCHAR(50),           -- PROC | HSE | MECH | ELEC | INST | CIVIL | ...
    default_template_id UUID,
    default_workflow_id UUID,
    default_language VARCHAR(10) DEFAULT 'fr',
    revision_scheme VARCHAR(20) DEFAULT 'alpha',
    -- alpha = 0,A,B,C... | numeric = 1,2,3... | semver = 1.0,1.1...
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    UNIQUE (entity_id, code)
);

-- ─── DOCUMENTS ───────────────────────────────────────────────────

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    bu_id UUID REFERENCES business_units(id),
    doc_type_id UUID NOT NULL REFERENCES doc_types(id),
    project_id UUID REFERENCES projects(id),
    arborescence_node_id UUID REFERENCES arborescence_nodes(id),

    number VARCHAR(100) NOT NULL,         -- généré par nomenclature_service
    title VARCHAR(500) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'fr',

    current_revision_id UUID,             -- FK vers revisions (set après création)
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft | in_review | approved | published | obsolete | archived

    -- Vecteur de recherche full-text (mis à jour par trigger ou lors de la publication)
    search_vector tsvector,

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entity_id, number)
);

CREATE INDEX idx_documents_tenant_status ON documents(entity_id, status, bu_id);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_fts ON documents USING gin(search_vector);

-- ─── RÉVISIONS ───────────────────────────────────────────────────

CREATE TABLE revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    rev_code VARCHAR(20) NOT NULL,        -- "0", "A", "B", "1", "1.0"...

    -- Contenu BlockNote (JSON ProseMirror)
    content JSONB NOT NULL DEFAULT '{}',

    -- Données structurées des champs formulaire (séparées du contenu riche)
    -- Indexables par l'IA, exploitables par les connecteurs
    form_data JSONB NOT NULL DEFAULT '{}',
    -- ex: {"daily_oil_bbl": 12450, "separator_pressure": 42.3, "platform": "BIPAGA"}

    -- État Yjs pour la collaboration (binaire compressé)
    yjs_state BYTEA,

    -- Métadonnées
    word_count INTEGER,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE une fois que la révision est approuvée — plus jamais modifiable

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE une fois is_locked = TRUE
);

CREATE INDEX idx_revisions_document ON revisions(document_id, created_at DESC);

-- ─── TEMPLATES ───────────────────────────────────────────────────

CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    doc_type_id UUID REFERENCES doc_types(id),
    version INTEGER NOT NULL DEFAULT 1,
    structure JSONB NOT NULL,   -- sections, blocs, champs (voir structure JSON ci-dessous)
    styles JSONB NOT NULL,      -- police, couleurs, espacements
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE template_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    section_id VARCHAR(100) NOT NULL,     -- ID de la section parente
    field_key VARCHAR(100) NOT NULL,      -- clé unique dans le template
    field_type VARCHAR(50) NOT NULL,
    label JSONB NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = non modifiable par l'éditeur (styles imposés, cartouche)
    options JSONB NOT NULL DEFAULT '{}',
    display_order INTEGER NOT NULL DEFAULT 0,
    validation_rules JSONB NOT NULL DEFAULT '{}',
    UNIQUE (template_id, section_id, field_key)
);
```

---

## 3. Nomenclature — Moteur complet

### Tokens supportés

| Token | Description | Exemple |
|---|---|---|
| `{TENANT}` | Code tenant (défini dans tenants.slug) | `PCM` |
| `{PROJ}` | Code projet | `BIPAGA` |
| `{DISC}` | Discipline du type de document | `PROC` |
| `{TYPE}` | Code du type de document | `RPT` |
| `{SEQ:N}` | Séquence auto-incrémentée sur N chiffres | `0042` |
| `{YEAR}` | Année en cours | `2025` |
| `{MONTH}` | Mois en cours (2 chiffres) | `03` |
| `{BU}` | Code de la Business Unit | `SUD` |
| `{PHASE}` | Phase projet (saisie libre) | `FEED` |
| `{FREE}` | Champ libre en saisie utilisateur | — |

### Service Python

```python
# app/services/modules/nomenclature_service.py

import re
from datetime import datetime

async def generate_document_number(
    doc_type: DocType,
    project: Project,
    tenant: Tenant,
    bu: BusinessUnit | None,
    free_parts: dict = {},
    db: AsyncSession = None,
) -> str:
    """
    Génère le prochain numéro de document selon le pattern du doc_type.
    Thread-safe grâce au FOR UPDATE sur la séquence.
    """
    pattern = doc_type.nomenclature_pattern

    # Récupérer le prochain numéro de séquence (avec verrou)
    seq = await _get_next_sequence(doc_type.id, project.id, db)

    # Construire le mapping des tokens
    replacements = {
        "TENANT": tenant.slug.upper(),
        "PROJ": project.code.upper(),
        "DISC": (doc_type.discipline or "").upper(),
        "TYPE": doc_type.code.upper(),
        "YEAR": str(datetime.now().year),
        "MONTH": f"{datetime.now().month:02d}",
        "BU": (bu.code if bu else "").upper(),
        "PHASE": free_parts.get("PHASE", "").upper(),
        "FREE": free_parts.get("FREE", ""),
    }

    result = pattern
    for key, val in replacements.items():
        result = result.replace(f"{{{key}}}", val)

    # Gérer {SEQ:N} avec padding
    result = re.sub(
        r'\{SEQ:(\d+)\}',
        lambda m: str(seq).zfill(int(m.group(1))),
        result
    )

    # Nettoyer les doubles tirets si un token est vide
    result = re.sub(r'-{2,}', '-', result).strip('-')

    return result

async def _get_next_sequence(doc_type_id: str, project_id: str, db: AsyncSession) -> int:
    """Incrémente atomiquement la séquence pour doc_type + project."""
    # SELECT FOR UPDATE pour éviter les doublons en concurrence
    seq_row = await db.execute(
        select(DocumentSequence)
        .where(
            DocumentSequence.doc_type_id == UUID(doc_type_id),
            DocumentSequence.project_id == UUID(project_id),
        )
        .with_for_update()
    ).scalar_one_or_none()

    if seq_row:
        seq_row.current_value += 1
        next_val = seq_row.current_value
    else:
        seq_row = DocumentSequence(
            doc_type_id=UUID(doc_type_id),
            project_id=UUID(project_id),
            current_value=1,
        )
        db.add(seq_row)
        next_val = 1

    await db.commit()
    return next_val

def generate_next_revision_code(current_code: str, scheme: str = "alpha") -> str:
    """Calcule le prochain code de révision."""
    if scheme == "alpha":
        if current_code == "0":
            return "A"
        if current_code.isalpha():
            return chr(ord(current_code[-1]) + 1)
        return "A"
    elif scheme == "numeric":
        return str(int(current_code) + 1)
    return current_code
```

---

## 4. Structure JSON d'un template (exhaustive)

```json
{
  "id": "uuid",
  "name": "Rapport Journalier Production",
  "doc_type_code": "RPT",
  "version": 3,

  "sections": [
    {
      "id": "cartouche",
      "type": "cartouche",
      "locked": true,
      "description": "En-tête officiel Perenco — non modifiable",
      "fields": [
        {"key": "title", "type": "text_short", "locked": true,
         "auto_value": "{document.title}", "label": {"fr": "Titre"}},
        {"key": "number", "type": "text_short", "locked": true,
         "auto_value": "{document.number}", "label": {"fr": "Numéro"}},
        {"key": "revision", "type": "text_short", "locked": true,
         "auto_value": "{revision.rev_code}", "label": {"fr": "Révision"}},
        {"key": "date", "type": "date", "locked": false,
         "auto_value": "{today}", "label": {"fr": "Date"}},
        {"key": "author", "type": "text_short", "locked": true,
         "auto_value": "{current_user.full_name}", "label": {"fr": "Rédacteur"}},
        {"key": "classification", "type": "select_static",
         "options": [{"value": "CONF", "label": "Confidentiel"},
                     {"value": "REST", "label": "Restreint"},
                     {"value": "INT", "label": "Usage interne"}],
         "default": "INT", "label": {"fr": "Classification"}}
      ]
    },
    {
      "id": "production_data",
      "type": "form",
      "title": {"fr": "Données de production"},
      "description": "Remplir avec les données de production du jour",
      "fields": [
        {"key": "report_date", "type": "date", "label": {"fr": "Date du rapport"},
         "required": true, "auto_value": "{yesterday}"},
        {"key": "platform", "type": "reference",
         "label": {"fr": "Plateforme"},
         "options": {"object_type": "asset_platform", "display_fields": ["code", "name"]},
         "required": true},
        {"key": "daily_oil_bbl", "type": "number_decimal",
         "label": {"fr": "Production huile (bbl/j)"},
         "options": {"min": 0, "unit": "bbl/j", "decimals": 0},
         "required": true},
        {"key": "daily_gas_mmscfd", "type": "number_decimal",
         "label": {"fr": "Production gaz (MMscfd)"},
         "options": {"min": 0, "unit": "MMscfd", "decimals": 3}},
        {"key": "water_injection_bbl", "type": "number_decimal",
         "label": {"fr": "Injection eau (bbl/j)"},
         "options": {"min": 0, "unit": "bbl/j", "decimals": 0}},
        {"key": "separator_pressure_bar", "type": "number_decimal",
         "label": {"fr": "Pression séparateur (bar)"},
         "options": {"min": 0, "max": 200, "unit": "bar", "decimals": 1}},
        {"key": "separator_temperature_c", "type": "number_decimal",
         "label": {"fr": "Température séparateur (°C)"},
         "options": {"unit": "°C", "decimals": 1}},
        {"key": "flare_gas_mmscfd", "type": "number_decimal",
         "label": {"fr": "Gaz torché (MMscfd)"},
         "options": {"min": 0, "unit": "MMscfd", "decimals": 3}},
        {"key": "uptime_percent", "type": "number_decimal",
         "label": {"fr": "Disponibilité (%)"},
         "options": {"min": 0, "max": 100, "unit": "%", "decimals": 1}}
      ]
    },
    {
      "id": "trend_chart",
      "type": "dynamic",
      "title": {"fr": "Tendance 7 jours"},
      "connector_id": null,
      "connector_placeholder": "Configurer le connecteur DCS BIPAGA",
      "query_config": {"metric": "daily_oil_bbl", "days": 7},
      "display": "line_chart",
      "refresh_mode": "snapshot",
      "locked": true
    },
    {
      "id": "shutdowns",
      "type": "table_form",
      "title": {"fr": "Arrêts et événements"},
      "description": "Listez les arrêts non planifiés et événements notables",
      "columns": [
        {"key": "start_time", "type": "datetime", "label": {"fr": "Début"}},
        {"key": "end_time", "type": "datetime", "label": {"fr": "Fin"}},
        {"key": "equipment_tag", "type": "text_short", "label": {"fr": "Équipement/Tag"}},
        {"key": "cause", "type": "text_short", "label": {"fr": "Cause"}},
        {"key": "impact", "type": "select_static",
         "options": [{"value": "production", "label": "Arrêt production"},
                     {"value": "partial", "label": "Réduction production"},
                     {"value": "none", "label": "Sans impact production"}]},
        {"key": "status", "type": "select_static",
         "options": [{"value": "resolved", "label": "Résolu"},
                     {"value": "ongoing", "label": "En cours"},
                     {"value": "monitoring", "label": "Surveillance"}]}
      ],
      "min_rows": 0
    },
    {
      "id": "narrative",
      "type": "rich_text",
      "title": {"fr": "Commentaires opérationnels"},
      "placeholder": {"fr": "Décrire les événements notables, décisions prises, points d'attention pour l'équipe suivante..."},
      "min_words": 0,
      "max_words": 2000
    },
    {
      "id": "next_actions",
      "type": "form",
      "title": {"fr": "Actions pour l'équipe suivante"},
      "fields": [
        {"key": "planned_maintenance", "type": "text_long",
         "label": {"fr": "Maintenances planifiées"}, "rows": 3},
        {"key": "watchpoints", "type": "text_long",
         "label": {"fr": "Points de vigilance"}, "rows": 3}
      ]
    }
  ],

  "styles": {
    "font_family": "Arial",
    "font_size": 11,
    "heading1_color": "#1B3A5C",
    "heading2_color": "#2E86AB",
    "accent_color": "#2E86AB",
    "page_format": "A4",
    "page_orientation": "portrait",
    "page_margins": {"top": 25, "right": 20, "bottom": 25, "left": 20},
    "header_logo": "perenco_logo.png",
    "footer_text": "Document confidentiel — Perenco Cameroun"
  }
}
```

---

## 5. BlockNote — Configuration et extensions custom

### Setup initial

```typescript
// src/components/modules/report/editor/useBlockNoteEditor.ts

import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core"
import { CartoucheBlock } from "./blocks/CartoucheBlock"
import { FormBlock } from "./blocks/FormBlock"
import { DynamicDataBlock } from "./blocks/DynamicDataBlock"
import { TableFormBlock } from "./blocks/TableFormBlock"

export const useReportEditor = (
    documentId: string,
    revisionId: string | null,
    template: Template,
    isReadOnly: boolean,
) => {
    const editor = useCreateBlockNote({
        schema: BlockNoteSchema.create({
            blockSpecs: {
                ...defaultBlockSpecs,
                cartouche: CartoucheBlock,
                form_block: FormBlock,
                dynamic_data: DynamicDataBlock,
                table_form: TableFormBlock,
            },
        }),
        initialContent: revisionId
            ? undefined  // sera chargé via setContent après mount
            : buildInitialContent(template),

        // Collaboration Yjs
        collaboration: {
            provider: new HocuspocusProvider({
                url: `${WS_URL}/hocuspocus`,
                name: `doc-${documentId}`,
                token: getAuthToken(),
            }),
            fragment: new Y.XmlFragment(),
            user: {
                name: getCurrentUser().full_name,
                color: getUserColor(getCurrentUser().id),
            },
        },
    })

    return editor
}

// Contenu initial depuis un template
function buildInitialContent(template: Template): PartialBlock[] {
    const blocks: PartialBlock[] = []

    for (const section of template.structure.sections) {
        if (section.type === "cartouche") {
            blocks.push({
                type: "cartouche",
                props: { section_id: section.id, template_section: JSON.stringify(section) },
            })
        } else if (section.type === "form") {
            blocks.push({
                type: "form_block",
                props: { section_id: section.id, template_section: JSON.stringify(section), values: "{}" },
            })
        } else if (section.type === "dynamic") {
            blocks.push({
                type: "dynamic_data",
                props: {
                    section_id: section.id,
                    connector_id: section.connector_id || "",
                    query_config: JSON.stringify(section.query_config || {}),
                    display_type: section.display || "table",
                    refresh_mode: section.refresh_mode || "snapshot",
                },
            })
        } else if (section.type === "table_form") {
            blocks.push({
                type: "table_form",
                props: { section_id: section.id, template_section: JSON.stringify(section), rows: "[]" },
            })
        } else if (section.type === "rich_text") {
            blocks.push({
                type: "heading",
                content: [{ type: "text", text: section.title?.fr || "", styles: {} }],
                props: { level: 2 },
            })
            if (section.placeholder?.fr) {
                blocks.push({
                    type: "paragraph",
                    content: [{ type: "text", text: section.placeholder.fr, styles: { textColor: "gray" } }],
                })
            }
        }
    }

    return blocks
}
```

### Extension CartoucheBlock

```typescript
// src/components/modules/report/editor/blocks/CartoucheBlock.tsx

import { createReactBlockSpec } from "@blocknote/react"

export const CartoucheBlock = createReactBlockSpec(
    {
        type: "cartouche",
        propSchema: {
            section_id: { default: "" },
            template_section: { default: "{}" },
        },
        content: "none",
    },
    {
        render: ({ block, editor }) => {
            const section = JSON.parse(block.props.template_section)
            const isReadOnly = !editor.isEditable

            return (
                <div
                    className="border-2 border-primary/30 rounded-md p-3 bg-primary/5 mb-4"
                    contentEditable={false}
                    data-section-id={block.props.section_id}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className="h-4 w-4 rounded bg-primary/20 flex-shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/60">
                            Cartouche — {section.description || "En-tête officiel"}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                            🔒 Non modifiable
                        </span>
                    </div>
                    <CartoucheGrid section={section} />
                </div>
            )
        },
    }
)

const CartoucheGrid = ({ section }: { section: TemplateSection }) => {
    const doc = useCurrentDocument()
    const revision = useCurrentRevision()
    const user = useCurrentUser()

    const getAutoValue = (autoValue: string) => {
        if (!autoValue) return ""
        return autoValue
            .replace("{document.title}", doc?.title || "")
            .replace("{document.number}", doc?.number || "")
            .replace("{revision.rev_code}", revision?.rev_code || "0")
            .replace("{today}", new Date().toLocaleDateString("fr-FR"))
            .replace("{yesterday}", new Date(Date.now() - 86400000).toLocaleDateString("fr-FR"))
            .replace("{current_user.full_name}", user?.full_name || "")
    }

    return (
        <table className="w-full border-collapse text-xs">
            <tbody>
                <tr>
                    <td className="border border-border p-1.5 w-1/4 bg-muted font-medium">Titre</td>
                    <td className="border border-border p-1.5 font-medium">
                        {getAutoValue("{document.title}") || "—"}
                    </td>
                    <td className="border border-border p-1.5 w-1/6 bg-muted font-medium">N°</td>
                    <td className="border border-border p-1.5">
                        {getAutoValue("{document.number}") || "Sera attribué"}
                    </td>
                </tr>
                <tr>
                    <td className="border border-border p-1.5 bg-muted font-medium">Date</td>
                    <td className="border border-border p-1.5">
                        {getAutoValue("{today}")}
                    </td>
                    <td className="border border-border p-1.5 bg-muted font-medium">Révision</td>
                    <td className="border border-border p-1.5">
                        {getAutoValue("{revision.rev_code}") || "0"}
                    </td>
                </tr>
                <tr>
                    <td className="border border-border p-1.5 bg-muted font-medium">Rédacteur</td>
                    <td className="border border-border p-1.5">{getAutoValue("{current_user.full_name}")}</td>
                    <td className="border border-border p-1.5 bg-muted font-medium">Classification</td>
                    <td className="border border-border p-1.5">Usage interne</td>
                </tr>
            </tbody>
        </table>
    )
}
```

### Extension FormBlock

```typescript
// src/components/modules/report/editor/blocks/FormBlock.tsx

export const FormBlock = createReactBlockSpec(
    {
        type: "form_block",
        propSchema: {
            section_id: { default: "" },
            template_section: { default: "{}" },
            values: { default: "{}" },    // JSON stringifié des valeurs
        },
        content: "none",
    },
    {
        render: ({ block, editor }) => {
            const section = JSON.parse(block.props.template_section)
            const values = JSON.parse(block.props.values)
            const isReadOnly = !editor.isEditable

            const handleChange = (fieldKey: string, value: any) => {
                if (isReadOnly) return
                const updated = { ...values, [fieldKey]: value }
                editor.updateBlock(block, {
                    props: { ...block.props, values: JSON.stringify(updated) },
                })
                // Sauvegarder form_data séparément (pour exploitabilité IA)
                saveFormData(block.props.section_id, updated)
            }

            return (
                <div
                    className="border border-border rounded-md p-3 mb-4 bg-background"
                    contentEditable={false}
                >
                    <h3 className="text-sm font-semibold mb-3 text-foreground">
                        {section.title?.fr}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {section.fields?.map((field: TemplateField) => (
                            <FormFieldRenderer
                                key={field.key}
                                field={field}
                                value={values[field.key]}
                                onChange={(v) => handleChange(field.key, v)}
                                readOnly={isReadOnly}
                            />
                        ))}
                    </div>
                </div>
            )
        },
    }
)
```

---

## 6. Offline — Stratégie complète avec Dexie.js

### Schema IndexedDB

```typescript
// src/lib/offline.ts

import Dexie, { type Table } from 'dexie'

interface DraftDocument {
    id: string                    // document_id
    content: any                  // BlockNote JSON
    form_data: Record<string, any>
    yjs_state?: Uint8Array
    document_meta: {
        title: string
        number: string
        doc_type_code: string
        project_code: string
    }
    updated_at: Date
    synced: boolean
    sync_attempts: number
}

interface OfflineAction {
    id: string                    // UUID local
    type: string                  // "submit_document" | "approve" | "create_document" | ...
    payload: any
    created_at: Date
    synced: boolean
    error?: string
}

interface CachedQuery {
    cache_key: string
    data: any
    expires_at: Date
}

class OpsFluxDB extends Dexie {
    drafts!: Table<DraftDocument>
    offline_actions!: Table<OfflineAction>
    cached_queries!: Table<CachedQuery>

    constructor() {
        super('opsflux')
        this.version(1).stores({
            drafts: 'id, updated_at, synced',
            offline_actions: 'id, type, created_at, synced',
            cached_queries: 'cache_key, expires_at',
        })
    }
}

export const db = new OpsFluxDB()
```

### Hook de sauvegarde auto + sync

```typescript
// src/hooks/useDocumentSync.ts

export const useDocumentSync = (documentId: string) => {
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [isOffline, setIsOffline] = useState(!navigator.onLine)
    const autosaveInterval = useUserPreference('autosave_interval_seconds', 30)[0]

    // Détecter l'état réseau
    useEffect(() => {
        const handleOnline = () => setIsOffline(false)
        const handleOffline = () => setIsOffline(true)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    // Sauvegarde locale (IndexedDB) — toujours, même offline
    const saveLocally = useCallback(async (content: any, formData: any) => {
        await db.drafts.put({
            id: documentId,
            content,
            form_data: formData,
            document_meta: { ... },
            updated_at: new Date(),
            synced: false,
            sync_attempts: 0,
        })
        setLastSaved(new Date())
    }, [documentId])

    // Sync vers API — seulement si online
    const syncToServer = useCallback(async (content: any, formData: any) => {
        if (!navigator.onLine) return
        setIsSyncing(true)
        try {
            await api.patch(`/api/v1/documents/${documentId}/draft`, {
                content,
                form_data: formData,
            })
            await db.drafts.update(documentId, { synced: true })
        } catch (err) {
            console.error('Sync failed, will retry:', err)
        } finally {
            setIsSyncing(false)
        }
    }, [documentId])

    // Auto-save avec debounce
    const debouncedSync = useDebouncedCallback(syncToServer, autosaveInterval * 1000)

    const handleContentChange = useCallback((content: any, formData: any) => {
        saveLocally(content, formData)    // immédiat (IndexedDB)
        debouncedSync(content, formData) // différé (API)
    }, [saveLocally, debouncedSync])

    // Sync de la queue offline au retour en ligne
    useEffect(() => {
        if (!isOffline) {
            syncOfflineQueue()
        }
    }, [isOffline])

    return { handleContentChange, isSyncing, lastSaved, isOffline }
}

async function syncOfflineQueue() {
    const unsynced = await db.drafts.where('synced').equals(0 as any).toArray()
    for (const draft of unsynced) {
        try {
            await api.patch(`/api/v1/documents/${draft.id}/draft`, {
                content: draft.content,
                form_data: draft.form_data,
            })
            await db.drafts.update(draft.id, { synced: true })
        } catch (err) {
            await db.drafts.update(draft.id, {
                sync_attempts: draft.sync_attempts + 1,
            })
        }
    }
}
```

### Gestion du quota IndexedDB

```typescript
// src/lib/offline.ts (suite)

export async function enforceOfflineQuota(maxMB: number = 50) {
    const estimate = await navigator.storage.estimate()
    const usedMB = (estimate.usage || 0) / (1024 * 1024)

    if (usedMB > maxMB) {
        // Supprimer les brouillons les plus anciens qui sont déjà syncs
        const lru = await db.drafts
            .where('synced').equals(1 as any)
            .sortBy('updated_at')

        let freed = 0
        for (const draft of lru) {
            const size = JSON.stringify(draft).length / (1024 * 1024)
            await db.drafts.delete(draft.id)
            freed += size
            if (usedMB - freed <= maxMB * 0.8) break  // libérer jusqu'à 80% du quota
        }
    }
}

// Appeler périodiquement
setInterval(enforceOfflineQuota, 5 * 60 * 1000)  // toutes les 5 minutes
```

---

## 7. Export PDF

```python
# app/services/modules/report_service.py

async def export_pdf(document_id: str, revision_id: str, entity_id: str) -> bytes:
    """Génère un PDF via Puppeteer headless."""
    doc = await get_document(document_id, entity_id)
    revision = await get_revision(revision_id)
    template = await get_template(doc.doc_type.default_template_id, entity_id)

    # 1. Convertir le contenu BlockNote en HTML
    blocknote_html = await convert_blocknote_to_html(revision.content)

    # 2. Injecter dans le template HTML/CSS Jinja2
    html = render_jinja2("templates/pdf/report.html", {
        "document": doc,
        "revision": revision,
        "template_styles": template.styles,
        "blocknote_html": blocknote_html,
        "form_data": revision.form_data,
        "tenant": await get_tenant(entity_id),
    })

    # 3. Puppeteer via subprocess (Node.js)
    async with aiofiles.tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
        await f.write(html.encode())
        html_path = f.name

    pdf_path = html_path.replace(".html", ".pdf")

    process = await asyncio.create_subprocess_exec(
        "node", "scripts/generate_pdf.js", html_path, pdf_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(f"PDF generation failed: {stderr.decode()}")

    async with aiofiles.open(pdf_path, "rb") as f:
        pdf_bytes = await f.read()

    # Cleanup
    os.unlink(html_path)
    os.unlink(pdf_path)

    return pdf_bytes
```

```javascript
// scripts/generate_pdf.js (Node.js)
const puppeteer = require('puppeteer')
const [,, htmlPath, pdfPath] = process.argv

;(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
    const page = await browser.newPage()
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' })
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `<div style="font-size:8px;text-align:center;width:100%;color:#666">
            Page <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    })
    await browser.close()
})()
```

---

## 8. API Endpoints

```python
# app/api/routes/modules/report.py

router = APIRouter(prefix="/documents", tags=["documents"])

@router.get("/", dependencies=[requires_permission("document.read")])
async def list_documents(
    project_id: Optional[str] = None,
    doc_type_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    request: Request = None,
):
    return await report_service.list_documents(
        entity_id=entity_id,
        bu_id=request.state.bu_id,
        project_id=project_id, doc_type_id=doc_type_id,
        status=status, search=search, page=page, page_size=page_size,
    )

@router.post("/", dependencies=[requires_permission("document.create")])
async def create_document(body: DocumentCreate, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await report_service.create_document(
        body=body,
        entity_id=entity_id,
        bu_id=request.state.bu_id,
        created_by=request.state.user_id,
    )

@router.get("/{doc_id}", dependencies=[requires_permission("document.read")])
async def get_document(doc_id: str, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    doc = await report_service.get_document(doc_id, entity_id)
    # Sélectionner l'objet pour le panneau dynamique
    await set_selected_object(request, "document", doc_id)
    return doc

@router.patch("/{doc_id}/draft", dependencies=[requires_permission("document.edit")])
async def save_draft(doc_id: str, body: RevisionDraft, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    """Sauvegarde auto (contenu + form_data). Ne crée pas une nouvelle révision."""
    return await report_service.save_draft(
        doc_id=doc_id,
        content=body.content,
        form_data=body.form_data,
        yjs_state=body.yjs_state,
        entity_id=entity_id,
        user_id=request.state.user_id,
    )

@router.post("/{doc_id}/submit", dependencies=[requires_permission("document.submit")])
async def submit_for_validation(doc_id: str, body: SubmitRequest, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    """Soumet le document au workflow de validation."""
    return await report_service.submit_document(
        doc_id=doc_id,
        comment=body.comment,
        entity_id=entity_id,
        actor_id=request.state.user_id,
    )

@router.post("/{doc_id}/approve", dependencies=[requires_permission("document.approve")])
async def approve_document(doc_id: str, body: ApproveRequest, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await report_service.approve_document(
        doc_id=doc_id, comment=body.comment,
        entity_id=entity_id, actor_id=request.state.user_id,
    )

@router.post("/{doc_id}/reject", dependencies=[requires_permission("document.approve")])
async def reject_document(doc_id: str, body: RejectRequest, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await report_service.reject_document(
        doc_id=doc_id, reason=body.reason,
        entity_id=entity_id, actor_id=request.state.user_id,
    )

@router.get("/{doc_id}/export/pdf")
async def export_pdf(doc_id: str, revision_id: Optional[str] = None, entity_id: UUID = Depends(get_current_entity)):
    pdf_bytes = await report_service.export_pdf(
        doc_id, revision_id, entity_id
    )
    filename = f"{(await get_document(doc_id, entity_id)).number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/{doc_id}/export/docx")
async def export_docx(doc_id: str, entity_id: UUID = Depends(get_current_entity)):
    docx_bytes = await report_service.export_docx(doc_id, entity_id)
    doc = await get_document(doc_id, entity_id)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{doc.number}.docx"'},
    )
```

---

## 9. Classification de documents

### Niveaux de classification

Chaque document possède un niveau de classification qui détermine les règles d'accès :

| Code | Libellé | Règle d'accès |
|---|---|---|
| `PUB` | Public | Accessible à tous les utilisateurs de l'entité |
| `INT` | Interne | Accessible à tous les utilisateurs authentifiés du tenant |
| `REST` | Restreint | Accessible uniquement aux membres du projet + liste nominative configurable |
| `CONF` | Confidentiel | Accessible uniquement à une liste nominative de personnes |

### Règles de contrôle d'accès

- La classification est définie à la création du document et modifiable uniquement par le propriétaire du document
- Un utilisateur sans accès au document voit le titre du document mais pas son contenu (message "Accès restreint")
- Pour les niveaux `REST` et `CONF`, le propriétaire du document gère les listes nominatives de personnes autorisées
- La classification est affichée dans le cartouche du document et dans les listes de documents

---

## 10. Listes de distribution

### Configuration

- Listes de distribution configurables par type de document
- Association : type de document → liste de destinataires (utilisateurs OpsFlux + emails externes)

### Comportement à la publication

- À la **publication** d'un document, le PDF est automatiquement envoyé par email à tous les membres de la liste de distribution associée au type de document
- Les destinataires externes (sans compte OpsFlux) reçoivent un lien de partage temporaire (validité configurable, défaut 30 jours)

### Gestion des listes

- CRUD des listes de distribution via l'interface admin du module
- Import/export des destinataires au format CSV
- Filtrage par type de document

### Modèle de données

```sql
CREATE TABLE distribution_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   UUID NOT NULL REFERENCES entities(id),
    name        VARCHAR(255) NOT NULL,
    doc_type_filter UUID REFERENCES doc_types(id),  -- NULL = tous les types
    recipients  JSONB NOT NULL DEFAULT '[]',
    -- [{"type": "user", "user_id": "..."}, {"type": "external", "email": "...", "name": "..."}]
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 11. Track changes — Suivi des modifications

### Fonctionnement

- Mode "Suivi des modifications" (track changes) intégré dans l'éditeur BlockNote
- Activable par l'utilisateur via un toggle dans la toolbar de l'éditeur
- Les modifications sont affichées en couleur avec le nom de l'auteur :
  - **Ajouts** : texte en vert
  - **Suppressions** : texte en rouge barré

### Gestion des modifications

- Le propriétaire du document peut accepter ou rejeter chaque modification individuellement
- Actions en batch : "Accepter tout" / "Rejeter tout"
- Désactivable par défaut dans les settings utilisateur (`report_editor.track_changes_on_edit`)

---

## 12. Commentaires inline avec résolution

### Création de commentaires

- Commentaires inline dans le corps du document : sélectionner du texte → action "Commenter"
- Support des @mentions pour notifier un utilisateur directement depuis le commentaire

### Résolution et historique

- Chaque commentaire peut être marqué "Résolu" par l'auteur du commentaire ou le propriétaire du document
- Historique des commentaires résolus visible via un filtre "Afficher les résolus"
- Fil de réponses sous chaque commentaire (discussion en thread)

---

## 13. Signatures électroniques

### Génération des signatures

- Signatures électroniques horodatées sur les documents validés
- Chaque approbation dans le workflow génère une signature avec :
  - Nom du signataire
  - Rôle du signataire
  - Date et heure de la signature
  - Hash du contenu au moment de la signature (intégrité)

### Affichage et vérification

- Les signatures sont affichées dans le cartouche du document et dans la page de métadonnées
- Vérification d'intégrité : si le contenu est modifié après signature, un avertissement est affiché indiquant que la signature ne correspond plus au contenu actuel

---

## 14. Lien de partage temporaire

### Création du lien

- Lien de partage temporaire pour les destinataires sans compte OpsFlux
- Durée de vie configurable : 1 jour, 7 jours, 30 jours
- Protection optionnelle par code OTP envoyé par email au destinataire

### Accès

- Le lien donne accès en lecture seule au document (PDF renderable)
- Aucun compte OpsFlux requis pour accéder au document via le lien

### Audit

- Chaque accès via le lien est logué avec : adresse IP, date, durée de consultation

---

## 15. Comparaison de versions (diff)

### Fonctionnement

- Comparaison côte à côte de deux versions d'un document
- Différences surlignées :
  - **Ajouts** : surlignage vert
  - **Suppressions** : surlignage rouge
  - **Modifications** : surlignage jaune
- Sélection des versions à comparer via un sélecteur dans l'historique des révisions

### Endpoint

```
GET /api/v1/documents/:id/diff?rev_a=:rev_a&rev_b=:rev_b
```

---

## 16. PDCA — Phase ReportEditor (Phase 4)

| Étape | Tâche | Critère de validation | Effort |
|---|---|---|---|
| PLAN | Confirmer le schéma DB (documents, revisions, templates, doc_types, projects) avec migration | `alembic upgrade head` fonctionne sur DB vide | 1j |
| DO | Service nomenclature : parser patterns + séquences atomiques | 20 numéros générés en parallèle sans doublon | 2j |
| DO | API CRUD documents + revisions + templates | Tests pytest : créer doc, sauvegarder brouillon, récupérer | 3j |
| DO | Intégration BlockNote : charger template → éditeur pré-rempli + CartoucheBlock | Ouvrir un template "Rapport Journalier" → sections visibles | 3j |
| DO | FormBlock : saisie de données structurées → sauvegardées dans `form_data` | Remplir 6 champs → form_data en DB correctement structuré | 3j |
| DO | DynamicDataBlock : connecteur → données dans l'éditeur | Bloc "Tendance 7j" avec données du connecteur DCS BIPAGA | 3j |
| DO | Auto-save 30s vers IndexedDB + sync vers API | Fermer onglet brutalement → données récupérées à la réouverture | 3j |
| DO | Mode offline complet : Dexie.js + Service Worker Workbox | Éditer offline 30 minutes → sync propre à la reconnexion | 3j |
| DO | Quota management IndexedDB : LRU eviction à 50MB | Test quota : 60MB de brouillons → les plus anciens supprimés | 1j |
| DO | Export PDF Puppeteer : cartouche + styles template + pagination | PDF A4 de 3 pages conforme au template Perenco | 3j |
| DO | Export DOCX : BlockNote JSON → docx.js | DOCX avec styles, tableaux, données formulaire | 2j |
| DO | Workflow : soumettre → approbation séquentielle → publication | Cycle complet : brouillon → approuvé → publié en DB | 2j |
| CHECK | Scénario offshore complet : rédiger rapport BIPAGA offline 45min → reconnexion → sync → soumettre → approbation → export PDF | 0 perte données, PDF conforme, workflow tracé | 2j |
| ACT | Test 3 utilisateurs réels Perenco : créer leur premier rapport sur OpsFlux | Au moins 3 rapports créés et exportés par de vrais utilisateurs | 2j |
