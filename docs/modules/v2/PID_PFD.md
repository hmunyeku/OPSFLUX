# OpsFlux — modules/v2/PID_PFD.md
# Module PID/PFD Intelligent + TagRegistry + LibraryBuilder

> Ce module transforme draw.io en système de gestion de données d'ingénierie.
> Chaque objet graphique est un objet métier avec propriétés, connexions et entrée en DB.
> Claude Code lit ce fichier entier avant de toucher au code de ce module.

---

## 1. Manifest complet

```python
MODULE_MANIFEST = {
    "slug": "pid_pfd",
    "version": "1.0.0",
    "depends_on": ["core", "asset_registry"],

    "objects": [
        {
            "slug": "pid_document",
            "capabilities": {
                "versioning": True, "workflow": True, "attachments": True,
                "categories": True, "comments": True, "relations": True,
                "search": True, "audit": True, "custom_fields": True, "export": True,
            }
        },
        {
            "slug": "equipment",
            "capabilities": {
                "versioning": False, "attachments": True, "comments": True,
                "relations": True, "search": True, "audit": True,
                "custom_fields": True, "geolocation": True,
            }
        },
        {
            "slug": "process_line",
            "capabilities": {
                "versioning": False, "relations": True, "search": True,
                "audit": True, "custom_fields": True,
            }
        },
    ],

    "permissions": [
        "pid.read", "pid.write", "pid.publish", "pid.admin",
        "tag.read", "tag.create", "tag.rename", "tag.admin",
        "library.read", "library.write",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "PID / PFD", "icon": "GitBranch",
         "route": "/pid", "order": 50}
    ],

    "mcp_tools": [
        "search_equipment", "get_equipment", "trace_process_line",
        "get_pid_for_equipment", "list_pid_documents",
        "suggest_tag_name", "validate_tag_name", "get_equipment_documents",
    ],

    "map_layers": [
        {"key": "equipements", "label": "Équipements process", "object_type": "equipment"},
        {"key": "lignes_process", "label": "Lignes de procédé", "object_type": "process_line"},
    ],

    "settings": [
        {"key": "default_line_spec", "type": "select",
         "options": [{"value": "150", "label": "150# ASME"},
                     {"value": "300", "label": "300# ASME"},
                     {"value": "600", "label": "600# ASME"}],
         "default": "150", "scope": "tenant",
         "label": {"fr": "Classe de ligne par défaut"}},
        {"key": "auto_suggest_tags", "type": "toggle",
         "default": True, "scope": "user",
         "label": {"fr": "Activer les suggestions automatiques de tags"}},
        {"key": "drawio_grid_size", "type": "number",
         "default": 10, "scope": "user", "options": {"min": 5, "max": 50},
         "label": {"fr": "Taille de grille draw.io (px)"}},
        {"key": "tag_naming_strict_mode", "type": "toggle",
         "default": True, "scope": "tenant",
         "label": {"fr": "Mode strict : interdire les tags non conformes aux règles"}},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 2. Modèle de données complet

```sql
-- ─── PID DOCUMENTS ───────────────────────────────────────────────

CREATE TABLE pid_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id),
    -- lien vers table documents (Core) pour versioning, workflow, PJ, etc.
    project_id UUID REFERENCES projects(id),
    bu_id UUID REFERENCES business_units(id),

    number VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,

    pid_type VARCHAR(30) NOT NULL DEFAULT 'process',
    -- process | utility | instrumentation | electrical | demolition | modification | as_built

    xml_content TEXT,               -- XML mxGraph complet (draw.io)
    -- ATTENTION : peut faire plusieurs MB pour un PID complexe
    -- Stocké en TEXT pour flexibilité, pas JSONB car c'est du XML

    revision VARCHAR(20) NOT NULL DEFAULT '0',
    status VARCHAR(30) NOT NULL DEFAULT 'ifc',
    -- ifc (issued for comment) | ifd (issued for design) | afc (approved for construction)
    -- as_built | obsolete | superseded

    sheet_format VARCHAR(10) NOT NULL DEFAULT 'A1',
    -- A0 | A1 | A2 | A3
    scale VARCHAR(20) DEFAULT '1:100',
    drawing_number VARCHAR(100),    -- numéro de plan officiel Perenco

    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entity_id, number)
);

CREATE INDEX idx_pid_documents_project ON pid_documents(project_id, status);

-- ─── RÉVISIONS PID ───────────────────────────────────────────────

CREATE TABLE pid_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pid_document_id UUID NOT NULL REFERENCES pid_documents(id) ON DELETE CASCADE,
    revision_code VARCHAR(20) NOT NULL,   -- "0", "A", "B", "As-Built"...
    xml_content TEXT NOT NULL,            -- snapshot IMMUABLE du XML à cette révision
    change_description TEXT,
    change_type VARCHAR(30) DEFAULT 'modification',
    -- initial | modification | demolition | as_built | correction
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- IMMUABLE : jamais UPDATE/DELETE après création
);

-- ─── ÉQUIPEMENTS ─────────────────────────────────────────────────

CREATE TABLE equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    project_id UUID REFERENCES projects(id),
    pid_document_id UUID REFERENCES pid_documents(id),
    asset_id UUID,                  -- lien optionnel vers Asset Registry (asset.id)

    tag VARCHAR(100) NOT NULL,      -- ex: V-101, P-101A, E-201
    description TEXT,
    equipment_type VARCHAR(100) NOT NULL,
    -- vessel | pump | compressor | heat_exchanger | valve | filter
    -- separator | column | tank | instrument | motor | generator | other

    service VARCHAR(255),           -- ex: "Séparateur de production"
    fluid VARCHAR(100),             -- ex: "Huile + gaz + eau"
    fluid_phase VARCHAR(20),        -- liquid | gas | mixed | steam

    -- Données de design
    design_pressure_barg NUMERIC,
    design_temperature_c NUMERIC,
    operating_pressure_barg NUMERIC,
    operating_temperature_c NUMERIC,
    material_of_construction VARCHAR(100),

    -- Données de capacité
    capacity_value NUMERIC,
    capacity_unit VARCHAR(30),      -- ex: "m³", "m³/h", "kW", "bbl/d"

    -- Géolocalisation (si sur une plateforme géolocalisée)
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),

    -- Lien avec draw.io
    mxgraph_cell_id VARCHAR(100),   -- ID de la cellule dans le XML draw.io
    -- Utilisé pour synchronisation bidirectionnelle XML ↔ DB

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entity_id, project_id, tag)
);

CREATE INDEX idx_equipment_tag ON equipment(entity_id, tag);
CREATE INDEX idx_equipment_pid ON equipment(pid_document_id);
CREATE INDEX idx_equipment_asset ON equipment(asset_id) WHERE asset_id IS NOT NULL;

-- ─── LIGNES DE PROCÉDÉ ───────────────────────────────────────────

CREATE TABLE process_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    project_id UUID REFERENCES projects(id),

    line_number VARCHAR(100) NOT NULL,  -- ex: 6"-HC-A1B-001
    -- Format typique : DN"-SERVICE-SPEC-SEQ

    nominal_diameter_inch NUMERIC,      -- DN en pouces (ex: 6 pour 6")
    nominal_diameter_mm INTEGER,        -- DN en mm (ex: 150 pour 6")
    pipe_schedule VARCHAR(30),          -- ex: "SCH 40", "SCH 80", "STD"
    spec_class VARCHAR(50),             -- ex: "150# ASME A1B", "300# ASME B2C"
    spec_code VARCHAR(20),              -- code court ex: "A1B"

    fluid VARCHAR(100),                 -- ex: "HC" (hydrocarbures), "WI" (water injection)
    fluid_full_name VARCHAR(255),

    insulation_type VARCHAR(20),        -- none | thermal | acoustic | fire_proofing
    insulation_thickness_mm INTEGER,
    heat_tracing BOOLEAN NOT NULL DEFAULT FALSE,
    heat_tracing_type VARCHAR(30),      -- electric | steam | none

    design_pressure_barg NUMERIC,
    design_temperature_c NUMERIC,
    material_of_construction VARCHAR(100),
    length_m NUMERIC,

    mxgraph_cell_id VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_id, project_id, line_number)
);

-- ─── CONNEXIONS PROCESS (graphe) ─────────────────────────────────

CREATE TABLE pid_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    pid_document_id UUID NOT NULL REFERENCES pid_documents(id) ON DELETE CASCADE,

    from_entity_type VARCHAR(50) NOT NULL,  -- equipment | process_line | instrument | utility
    from_entity_id UUID NOT NULL,
    from_connection_point VARCHAR(30),      -- ex: "outlet", "inlet", "N1", "N2"

    to_entity_type VARCHAR(50) NOT NULL,
    to_entity_id UUID NOT NULL,
    to_connection_point VARCHAR(30),

    connection_type VARCHAR(30) NOT NULL DEFAULT 'process',
    -- process | instrument | utility | drain | vent

    continuation_ref VARCHAR(100),
    -- si la connexion sort du PID : référence au PID de continuation
    -- ex: "PID-PCM-BIPAGA-0102 Sheet 2" ou "→ PID-0102"

    flow_direction VARCHAR(10) DEFAULT 'forward',
    -- forward | reverse | bidirectional

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pid_connections_entities ON pid_connections(
    entity_id, from_entity_type, from_entity_id
);

-- ─── TAGS DCS (Rockwell) ─────────────────────────────────────────

CREATE TABLE dcs_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    project_id UUID REFERENCES projects(id),

    tag_name VARCHAR(100) NOT NULL,
    description TEXT,

    tag_type VARCHAR(20) NOT NULL,
    -- PT (pressure transmitter) | TT (temperature) | FT (flow) | LT (level)
    -- PDT (differential pressure) | AT (analyzer) | XV (on/off valve)
    -- FV (flow control valve) | LV (level control valve) | PV (pressure control valve)
    -- HS (hand switch) | ZT (position transmitter) | other

    area VARCHAR(50),               -- ex: "BIP" (BIPAGA), "EBM" (EBOME)
    equipment_id UUID REFERENCES equipment(id),
    -- équipement sur lequel est installé cet instrument (optionnel)
    pid_document_id UUID REFERENCES pid_documents(id),

    -- Données techniques
    dcs_address VARCHAR(100),       -- adresse dans le DCS Rockwell
    range_min NUMERIC,
    range_max NUMERIC,
    engineering_unit VARCHAR(30),   -- ex: "bar", "°C", "m³/h", "bbl/d"
    alarm_lo NUMERIC,
    alarm_hi NUMERIC,
    trip_lo NUMERIC,
    trip_hi NUMERIC,

    -- Métadonnées
    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    -- csv (importé depuis DCS) | manual (saisi) | suggested (par IA)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entity_id, project_id, tag_name)
);

CREATE INDEX idx_dcs_tags_type_area ON dcs_tags(entity_id, tag_type, area);
CREATE INDEX idx_dcs_tags_equipment ON dcs_tags(equipment_id) WHERE equipment_id IS NOT NULL;

-- ─── RÈGLES DE NOMMAGE DES TAGS ──────────────────────────────────

CREATE TABLE tag_naming_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    pattern TEXT NOT NULL,
    -- ex: "{AREA}-{TYPE}-{SEQ:3}"
    -- Généré automatiquement depuis segments

    segments JSONB NOT NULL,
    -- [{
    --   "key": "AREA",
    --   "type": "select",
    --   "label": {"fr": "Zone"},
    --   "options": [{"value": "BIP", "label": "BIPAGA"},
    --               {"value": "EBM", "label": "EBOME"},
    --               {"value": "CLV", "label": "CLIVANA"}]
    -- }, {
    --   "key": "TYPE",
    --   "type": "tag_type_auto",
    --   "label": {"fr": "Type instrument"},
    --   "description": "Rempli automatiquement selon le type d'instrument"
    -- }, {
    --   "key": "SEQ",
    --   "type": "sequence",
    --   "label": {"fr": "Numéro"},
    --   "digits": 3
    -- }]

    separator VARCHAR(5) NOT NULL DEFAULT '-',
    applies_to_types JSONB NOT NULL DEFAULT '[]',
    -- ["PT", "TT", "FT"] — types de tags couverts par cette règle
    -- [] = s'applique à tous les types

    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BIBLIOTHÈQUE D'OBJETS PROCESS ───────────────────────────────

CREATE TABLE process_lib_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),

    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    -- vessel | pump | compressor | valve | heat_exchanger | separator
    -- instrument | line | fitting | other
    subcategory VARCHAR(100),       -- ex: "centrifugal" pour pump

    svg_template TEXT NOT NULL,     -- SVG de la forme draw.io (texte XML)
    mxgraph_style TEXT NOT NULL,    -- style draw.io (ex: "shape=mxgraph.pid.pumps.centrifugalPump;")

    properties_schema JSONB NOT NULL,
    -- Définition des propriétés de l'objet
    -- {
    --   "tag": {"type": "text", "label": "Tag", "required": true},
    --   "design_pressure_barg": {"type": "number", "label": "Pression de design (barg)", "unit": "barg"},
    --   "capacity_m3h": {"type": "number", "label": "Débit (m³/h)", "unit": "m³/h"}
    -- }

    connection_points JSONB NOT NULL,
    -- Points de connexion de l'objet (relatifs à sa taille 100×100)
    -- [{
    --   "id": "inlet",
    --   "label": "Entrée",
    --   "x": 0, "y": 50,       -- position relative (0-100)
    --   "direction": "W",       -- N|S|E|W
    --   "type": "process"       -- process|instrument|utility|drain|vent
    -- }]

    equipment_type_mapping VARCHAR(100),
    -- type d'équipement dans la table `equipment` (ex: "pump")

    autocad_block_name VARCHAR(100),
    -- nom du bloc AutoCAD correspondant (pour export DXF futur)

    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lib_items_category ON process_lib_items(entity_id, category, is_active);
```

---

## 3. Intégration draw.io — Implémentation React complète

### Composant principal PIDEditor

```tsx
// src/components/modules/pid/PIDEditor.tsx

import { useRef, useEffect, useCallback, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

interface DrawioMessage {
    event: "init" | "load" | "save" | "close" | "export"
    xml?: string
    data?: string
}

export const PIDEditor = ({ pidDocumentId }: { pidDocumentId: string }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isDrawioReady, setIsDrawioReady] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
    const queryClient = useQueryClient()

    const { data: pidDoc } = useQuery({
        queryKey: ["pid-document", pidDocumentId],
        queryFn: () => api.get(`/api/v1/pid/${pidDocumentId}`).then(r => r.data),
    })

    const saveMutation = useMutation({
        mutationFn: async (xml: string) => {
            setIsSaving(true)
            await api.patch(`/api/v1/pid/${pidDocumentId}`, { xml_content: xml })
            // Déclencher la synchronisation DB en background (APScheduler job)
            await api.post(`/api/v1/pid/${pidDocumentId}/sync-db`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pid-document", pidDocumentId] })
            setIsSaving(false)
        },
        onError: () => setIsSaving(false),
    })

    // Écouter les messages de draw.io (iframe → parent)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data) return
            let msg: DrawioMessage
            try {
                msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data
            } catch {
                return
            }

            switch (msg.event) {
                case "init":
                    // draw.io est prêt → charger le XML existant
                    setIsDrawioReady(true)
                    if (pidDoc?.xml_content) {
                        sendToDiagram({ action: "load", xml: pidDoc.xml_content })
                    } else {
                        sendToDiagram({ action: "load", xml: getBlankPIDXML(pidDoc) })
                    }
                    break

                case "save":
                    // draw.io sauvegarde → persister en DB
                    if (msg.xml) {
                        saveMutation.mutate(msg.xml)
                    }
                    break

                case "load":
                    // XML chargé dans draw.io
                    break
            }
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [pidDoc, saveMutation])

    // Envoyer un message à draw.io (parent → iframe)
    const sendToDiagram = useCallback((message: object) => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
                JSON.stringify(message),
                "*"
            )
        }
    }, [])

    // Construire l'URL draw.io avec les paramètres nécessaires
    const drawioUrl = buildDrawioUrl({
        embed: 1,
        spin: 1,
        proto: "json",
        saveAndExit: 0,          // 0 = bouton Sauvegarder sans fermer
        noSaveBtn: 0,
        noExitBtn: 1,
        libraries: 1,            // activer les bibliothèques custom
        customLibraries: `opsflux_${pidDocumentId}`,
        grid: getSetting("drawio_grid_size", 10),
    })

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar PID */}
            <PIDToolbar
                pidDocument={pidDoc}
                isSaving={isSaving}
                selectedCellId={selectedCellId}
                onCreateRevision={() => createRevision(pidDocumentId)}
                onExport={(format) => exportPID(pidDocumentId, format)}
            />

            <div className="flex flex-1 min-h-0">
                {/* draw.io en iframe */}
                <iframe
                    ref={iframeRef}
                    src={drawioUrl}
                    className="flex-1 border-0"
                    style={{ minHeight: 0 }}
                    title="PID Editor"
                />

                {/* Panneau propriétés (à droite) */}
                {selectedCellId && (
                    <PIDPropertiesPanel
                        pidDocumentId={pidDocumentId}
                        cellId={selectedCellId}
                        onClose={() => setSelectedCellId(null)}
                        onUpdate={() => {
                            // Re-synchroniser DB → draw.io si nécessaire
                            queryClient.invalidateQueries({
                                queryKey: ["equipment", pidDocumentId]
                            })
                        }}
                    />
                )}
            </div>
        </div>
    )
}

function getBlankPIDXML(pidDoc: any): string {
    return `<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- Cartouche vide -->
    <mxCell id="cartouche" value="${pidDoc?.number || 'Nouveau PID'}" 
      style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;fontSize=14;fontStyle=1;"
      vertex="1" parent="1">
      <mxGeometry x="10" y="10" width="400" height="40" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`
}
```

### Panneau propriétés d'un objet PID

```tsx
// src/components/modules/pid/PIDPropertiesPanel.tsx

const PIDPropertiesPanel = ({
    pidDocumentId, cellId, onClose, onUpdate
}: PIDPropertiesPanelProps) => {
    const { data: cellData } = useQuery({
        queryKey: ["pid-cell", pidDocumentId, cellId],
        queryFn: () => api.get(`/api/v1/pid/${pidDocumentId}/cell/${cellId}`).then(r => r.data),
    })

    if (!cellData) return null

    const isEquipment = cellData.entity_type === "equipment"
    const isLine = cellData.entity_type === "process_line"
    const isInstrument = cellData.entity_type === "instrument"

    return (
        <aside className="w-[280px] flex-shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
            <div className="flex items-center h-[40px] border-b border-border px-3 gap-2 flex-shrink-0">
                <span className="text-sm font-medium truncate flex-1">
                    {cellData.tag || cellData.line_number || "Objet process"}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {isEquipment && (
                    <EquipmentPropertiesForm
                        equipment={cellData.entity}
                        onSave={async (data) => {
                            await api.patch(`/api/v1/pid/equipment/${cellData.entity.id}`, data)
                            onUpdate()
                        }}
                    />
                )}
                {isLine && (
                    <ProcessLinePropertiesForm
                        line={cellData.entity}
                        onSave={async (data) => {
                            await api.patch(`/api/v1/pid/process-lines/${cellData.entity.id}`, data)
                            onUpdate()
                        }}
                    />
                )}
                {isInstrument && (
                    <InstrumentPropertiesForm
                        instrument={cellData.entity}
                        onSave={async (data) => {
                            await api.patch(`/api/v1/pid/dcs-tags/${cellData.entity.id}`, data)
                            onUpdate()
                        }}
                    />
                )}
            </div>

            {/* Tags DCS liés (si équipement) */}
            {isEquipment && cellData.entity?.id && (
                <div className="border-t border-border">
                    <PanelSection title="Tags DCS associés" collapsible>
                        <LinkedTagsList equipmentId={cellData.entity.id} />
                    </PanelSection>
                </div>
            )}

            {/* Documents liés */}
            {cellData.entity?.id && (
                <div className="border-t border-border">
                    <PanelSection title="Documents liés" collapsible defaultCollapsed>
                        <LinkedDocumentsList
                            objectType={cellData.entity_type}
                            objectId={cellData.entity.id}
                        />
                    </PanelSection>
                </div>
            )}
        </aside>
    )
}
```

---

## 4. Parser XML mxGraph → DB (service Python)

```python
# app/services/modules/pid_service.py

import xml.etree.ElementTree as ET
from typing import Optional

async def parse_and_sync_pid(
    pid_id: str,
    xml_content: str,
    entity_id: str,
    db: AsyncSession,
) -> dict:
    """
    Parse le XML mxGraph et synchronise les objets en DB.
    Appelé après chaque sauvegarde dans draw.io.
    Retourne un résumé des opérations effectuées.
    """
    root = ET.fromstring(xml_content)
    cells = root.findall(".//mxCell")

    stats = {"equipment": 0, "lines": 0, "connections": 0, "instruments": 0}

    for cell in cells:
        style = cell.get("style", "")
        cell_id = cell.get("id", "")
        value = cell.get("value", "")

        if not cell_id or cell_id in ("0", "1"):
            continue

        # Détecter le type d'objet via le style draw.io
        if _is_equipment_style(style):
            await _sync_equipment(cell, pid_id, entity_id, db)
            stats["equipment"] += 1

        elif _is_process_line_style(style):
            await _sync_process_line(cell, pid_id, entity_id, db)
            stats["lines"] += 1

        elif _is_instrument_style(style):
            await _sync_instrument(cell, pid_id, entity_id, db)
            stats["instruments"] += 1

    # Synchroniser les connexions (edges entre objets)
    edges = root.findall(".//mxCell[@edge='1']")
    for edge in edges:
        await _sync_connection(edge, pid_id, entity_id, db)
        stats["connections"] += 1

    await db.commit()
    return stats

def _is_equipment_style(style: str) -> bool:
    """Détermine si une cellule draw.io est un équipement OpsFlux."""
    EQUIPMENT_STYLE_PREFIXES = [
        "shape=mxgraph.pid.pumps",
        "shape=mxgraph.pid.vessels",
        "shape=mxgraph.pid.compressors",
        "shape=mxgraph.pid.heat_exchangers",
        "opsflux.equipment=",  # style custom OpsFlux
    ]
    return any(style.startswith(p) for p in EQUIPMENT_STYLE_PREFIXES)

def _parse_cell_properties(cell: ET.Element) -> dict:
    """
    Extrait les propriétés d'une cellule mxGraph.
    Les propriétés custom sont stockées comme attributs XML sur la cellule.
    Ex: <mxCell ... opsflux_tag="V-101" opsflux_design_pressure="45" .../>
    """
    props = {}
    for attr_name, attr_value in cell.attrib.items():
        if attr_name.startswith("opsflux_"):
            key = attr_name.replace("opsflux_", "")
            props[key] = attr_value
    return props

async def _sync_equipment(
    cell: ET.Element,
    pid_id: str,
    entity_id: str,
    db: AsyncSession,
):
    """Crée ou met à jour un équipement depuis une cellule draw.io."""
    props = _parse_cell_properties(cell)
    tag = props.get("tag") or cell.get("value", "").strip()
    cell_id = cell.get("id")

    if not tag:
        return  # Cellule sans tag → pas un équipement process

    # Déterminer le type depuis le style
    style = cell.get("style", "")
    equipment_type = _infer_equipment_type(style)

    # Récupérer l'ID du projet depuis le PID
    pid = await db.get(PIDDocument, pid_id)

    existing = await db.execute(
        select(Equipment).where(
            Equipment.entity_id == entity_id,
            Equipment.pid_document_id == UUID(pid_id),
            Equipment.mxgraph_cell_id == cell_id,
        )
    ).scalar_one_or_none()

    if existing:
        # Mettre à jour uniquement les champs présents dans le XML
        if tag:
            existing.tag = tag
        if props.get("description"):
            existing.description = props["description"]
        if props.get("design_pressure_barg"):
            existing.design_pressure_barg = float(props["design_pressure_barg"])
        if props.get("design_temperature_c"):
            existing.design_temperature_c = float(props["design_temperature_c"])
        existing.updated_at = datetime.utcnow()
    else:
        db.add(Equipment(
            entity_id=entity_id,
            project_id=pid.project_id,
            pid_document_id=UUID(pid_id),
            tag=tag,
            equipment_type=equipment_type,
            description=props.get("description"),
            design_pressure_barg=float(props["design_pressure_barg"]) if props.get("design_pressure_barg") else None,
            design_temperature_c=float(props["design_temperature_c"]) if props.get("design_temperature_c") else None,
            mxgraph_cell_id=cell_id,
        ))

def _infer_equipment_type(style: str) -> str:
    STYLE_TO_TYPE = {
        "pumps": "pump",
        "vessels": "vessel",
        "separators": "separator",
        "compressors": "compressor",
        "heat_exchangers": "heat_exchanger",
        "valves": "valve",
        "columns": "column",
        "tanks": "tank",
        "filters": "filter",
    }
    for key, etype in STYLE_TO_TYPE.items():
        if key in style.lower():
            return etype
    return "other"
```

---

## 5. TagRegistry — Implémentation complète

### Service Python

```python
# app/services/modules/tag_service.py

async def suggest_tag_name(
    tag_type: str,
    area: str,
    equipment_id: Optional[str],
    entity_id: str,
    project_id: str,
    db: AsyncSession,
) -> list[str]:
    """
    Génère des suggestions de noms de tags conformes aux règles.
    Combine les règles DSL + IA pour des suggestions contextuelles.
    """
    # 1. Récupérer les règles applicables
    rules = await db.execute(
        select(TagNamingRule).where(
            TagNamingRule.entity_id == entity_id,
            or_(
                TagNamingRule.applies_to_types.contains([tag_type]),
                TagNamingRule.applies_to_types == cast('[]', JSONB),
            )
        ).order_by(TagNamingRule.is_default.desc())
    ).scalars().all()

    if not rules:
        return [f"{area}-{tag_type}-001"]  # fallback minimal

    rule = rules[0]

    # 2. Prochain numéro de séquence
    next_seq = await _get_next_tag_sequence(entity_id, project_id, tag_type, area, db)

    # 3. Générer depuis le pattern DSL
    suggestions = []
    generated = _apply_tag_rule(rule, {
        "AREA": area,
        "TYPE": tag_type,
        "SEQ": str(next_seq).zfill(_get_seq_digits(rule.pattern)),
    })
    suggestions.append(generated)

    # 4. Suggestions alternatives via LLM (si setting activé)
    if await get_module_setting("pid_pfd", "auto_suggest_tags", entity_id, db):
        # Récupérer les tags existants similaires pour contexte
        similar_tags = await db.execute(
            select(DCSTag.tag_name)
            .where(
                DCSTag.entity_id == entity_id,
                DCSTag.tag_type == tag_type,
                DCSTag.area == area,
            )
            .order_by(DCSTag.tag_name)
            .limit(10)
        ).scalars().all()

        equipment_context = ""
        if equipment_id:
            eq = await db.get(Equipment, equipment_id)
            if eq:
                equipment_context = f"sur équipement {eq.tag} ({eq.equipment_type})"

        ai_prompt = (
            f"Propose 2 noms de tags DCS supplémentaires pour un instrument de type '{tag_type}' "
            f"{equipment_context} en zone '{area}'. "
            f"Tags existants dans cette zone : {', '.join(similar_tags[:5])}. "
            f"Règle de nommage : {rule.pattern}. "
            f"Réponds uniquement avec 2 noms de tags, un par ligne, sans explication."
        )

        try:
            ai_response = await core_ai_service.complete(
                prompt=ai_prompt,
                entity_id=entity_id,
                max_tokens=50,
            )
            ai_suggestions = [s.strip() for s in ai_response.strip().split("\n") if s.strip()]
            suggestions.extend(ai_suggestions[:2])
        except Exception:
            pass  # Continuer sans suggestions IA si erreur

    return suggestions[:3]  # max 3 suggestions

async def validate_tag_name(
    tag_name: str,
    tag_type: str,
    entity_id: str,
    project_id: str,
    db: AsyncSession,
) -> dict:
    """Valide un nom de tag : conformité aux règles + unicité."""
    errors = []
    warnings = []

    # 1. Vérifier l'unicité
    existing = await db.execute(
        select(DCSTag).where(
            DCSTag.entity_id == entity_id,
            DCSTag.project_id == project_id,
            DCSTag.tag_name == tag_name,
        )
    ).scalar_one_or_none()

    if existing:
        errors.append(f"Le tag '{tag_name}' existe déjà dans ce projet")

    # 2. Vérifier la conformité aux règles
    strict_mode = await get_module_setting("pid_pfd", "tag_naming_strict_mode", entity_id, db)
    rules = await get_applicable_rules(tag_type, entity_id, db)

    if rules:
        rule = rules[0]
        conforms = _tag_matches_rule(tag_name, rule)
        if not conforms and strict_mode:
            errors.append(f"Le tag '{tag_name}' ne respecte pas la règle : {rule.pattern}")
        elif not conforms:
            warnings.append(f"Le tag '{tag_name}' ne respecte pas la règle recommandée : {rule.pattern}")

    # 3. Vérifications de convention
    if tag_name != tag_name.upper():
        warnings.append("Convention : les tags sont généralement en majuscules")
    if " " in tag_name:
        errors.append("Un tag ne peut pas contenir d'espaces")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "tag_name": tag_name,
    }

async def import_tags_from_csv(
    file_content: bytes,
    project_id: str,
    entity_id: str,
    user_id: str,
    db: AsyncSession,
) -> dict:
    """
    Import de tags depuis un CSV exporté du DCS Rockwell.
    Colonnes attendues (flexibles via mapping) :
    TAG_NAME, TAG_TYPE, AREA, DESCRIPTION, ENG_UNIT, RANGE_MIN, RANGE_MAX, DCS_ADDRESS
    """
    import io
    import csv

    reader = csv.DictReader(io.StringIO(file_content.decode("utf-8", errors="replace")))
    stats = {"created": 0, "updated": 0, "errors": [], "duplicates": 0}

    for row in reader:
        tag_name = (row.get("TAG_NAME") or row.get("Tag") or "").strip().upper()
        if not tag_name:
            continue

        # Valider le tag
        validation = await validate_tag_name(tag_name, row.get("TAG_TYPE", "other"), entity_id, project_id, db)
        if not validation["is_valid"]:
            stats["errors"].append({"tag": tag_name, "error": validation["errors"][0]})
            continue

        existing = await db.execute(
            select(DCSTag).where(
                DCSTag.entity_id == entity_id,
                DCSTag.project_id == UUID(project_id),
                DCSTag.tag_name == tag_name,
            )
        ).scalar_one_or_none()

        tag_data = {
            "tag_type": (row.get("TAG_TYPE") or "other").upper()[:20],
            "area": (row.get("AREA") or "").upper()[:50],
            "description": row.get("DESCRIPTION") or row.get("DESC"),
            "engineering_unit": row.get("ENG_UNIT") or row.get("UNIT"),
            "range_min": float(row["RANGE_MIN"]) if row.get("RANGE_MIN") else None,
            "range_max": float(row["RANGE_MAX"]) if row.get("RANGE_MAX") else None,
            "dcs_address": row.get("DCS_ADDRESS") or row.get("ADDRESS"),
            "source": "csv",
        }

        if existing:
            for k, v in tag_data.items():
                if v is not None:
                    setattr(existing, k, v)
            stats["updated"] += 1
        else:
            db.add(DCSTag(
                entity_id=entity_id,
                project_id=UUID(project_id),
                tag_name=tag_name,
                created_by=UUID(user_id),
                **tag_data,
            ))
            stats["created"] += 1

    await db.commit()
    return stats
```

### UI TagRegistry

```tsx
// src/pages/modules/pid/TagRegistryPage.tsx

const TagRegistryPage = ({ projectId }: { projectId: string }) => {
    const [searchQuery, setSearchQuery] = useState("")
    const [filterType, setFilterType] = useState<string | null>(null)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState(false)

    const { data: tags, isLoading } = useQuery({
        queryKey: ["dcs-tags", projectId, searchQuery, filterType],
        queryFn: () => api.get("/api/v1/pid/dcs-tags", {
            params: { project_id: projectId, search: searchQuery, tag_type: filterType }
        }).then(r => r.data),
    })

    const { data: namingRules } = useQuery({
        queryKey: ["tag-naming-rules"],
        queryFn: () => api.get("/api/v1/pid/tag-naming-rules").then(r => r.data),
    })

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b flex-shrink-0">
                <Input
                    placeholder="Rechercher un tag..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="max-w-[240px] h-8 text-sm"
                />
                <Select value={filterType || ""} onValueChange={v => setFilterType(v || null)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue placeholder="Tous les types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">Tous</SelectItem>
                        {TAG_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Import CSV
                    </Button>
                    <Button size="sm" onClick={() => setShowCreateModal(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Nouveau tag
                    </Button>
                </div>
            </div>

            {/* Table des tags */}
            <div className="flex-1 overflow-auto">
                <DataTable
                    data={tags?.items || []}
                    isLoading={isLoading}
                    columns={[
                        { key: "tag_name", label: "Tag", sortable: true,
                          render: (v) => <code className="text-xs font-mono bg-muted px-1 rounded">{v}</code> },
                        { key: "tag_type", label: "Type", width: 60,
                          render: (v) => <Badge variant="outline" className="text-[10px]">{v}</Badge> },
                        { key: "area", label: "Zone", width: 60 },
                        { key: "description", label: "Description" },
                        { key: "engineering_unit", label: "Unité", width: 60 },
                        { key: "equipment", label: "Équipement",
                          render: (_, row) => row.equipment?.tag
                            ? <code className="text-xs">{row.equipment.tag}</code>
                            : <span className="text-muted-foreground text-xs">—</span> },
                        { key: "source", label: "Source", width: 60,
                          render: (v) => <SourceBadge source={v} /> },
                    ]}
                    onRowClick={(tag) => setSelectedObject({ type: "dcs_tag", id: tag.id })}
                />
            </div>

            {/* Modales */}
            {showImportModal && (
                <TagImportModal
                    projectId={projectId}
                    onClose={() => setShowImportModal(false)}
                    onSuccess={() => {
                        setShowImportModal(false)
                        queryClient.invalidateQueries({ queryKey: ["dcs-tags"] })
                    }}
                />
            )}
            {showCreateModal && (
                <TagCreateModal
                    projectId={projectId}
                    namingRules={namingRules}
                    onClose={() => setShowCreateModal(false)}
                />
            )}
        </div>
    )
}

const TAG_TYPES = [
    { value: "PT", label: "PT — Pression" },
    { value: "TT", label: "TT — Température" },
    { value: "FT", label: "FT — Débit" },
    { value: "LT", label: "LT — Niveau" },
    { value: "PDT", label: "PDT — Pression diff." },
    { value: "AT", label: "AT — Analyseur" },
    { value: "XV", label: "XV — Vanne ON/OFF" },
    { value: "FV", label: "FV — Vanne débit" },
    { value: "LV", label: "LV — Vanne niveau" },
    { value: "PV", label: "PV — Vanne pression" },
    { value: "HS", label: "HS — Sélecteur manu" },
    { value: "ZT", label: "ZT — Position" },
]
```

---

## 6. Traçage multi-PID — API et service

```python
# app/services/modules/pid_service.py (suite)

async def trace_process_line(
    line_number: str,
    entity_id: str,
    project_id: str,
    db: AsyncSession,
) -> dict:
    """
    Trace une ligne de procédé à travers tous les PID où elle apparaît.
    Retourne le graphe de traçage complet.
    """
    # 1. Trouver la ligne en DB
    line = await db.execute(
        select(ProcessLine).where(
            ProcessLine.entity_id == entity_id,
            ProcessLine.project_id == UUID(project_id),
            ProcessLine.line_number == line_number,
        )
    ).scalar_one_or_none()

    if not line:
        raise HTTPException(404, f"Ligne '{line_number}' introuvable dans ce projet")

    # 2. Trouver toutes les connexions impliquant cette ligne
    connections = await db.execute(
        select(PIDConnection).where(
            PIDConnection.entity_id == entity_id,
            or_(
                and_(
                    PIDConnection.from_entity_type == "process_line",
                    PIDConnection.from_entity_id == line.id,
                ),
                and_(
                    PIDConnection.to_entity_type == "process_line",
                    PIDConnection.to_entity_id == line.id,
                ),
            )
        )
    ).scalars().all()

    # 3. Construire le résultat de traçage
    pid_appearances = {}
    equipment_connected = []

    for conn in connections:
        # PID de cette connexion
        pid = await db.get(PIDDocument, conn.pid_document_id)
        if pid:
            if str(pid.id) not in pid_appearances:
                pid_appearances[str(pid.id)] = {
                    "pid_id": str(pid.id),
                    "pid_number": pid.number,
                    "pid_title": pid.title,
                    "pid_status": pid.status,
                    "continuation_ref": conn.continuation_ref,
                    "connected_equipment": [],
                }

            # Équipement connecté
            other_type = conn.to_entity_type if conn.from_entity_id == line.id else conn.from_entity_type
            other_id = conn.to_entity_id if conn.from_entity_id == line.id else conn.from_entity_id

            if other_type == "equipment":
                eq = await db.get(Equipment, other_id)
                if eq:
                    pid_appearances[str(pid.id)]["connected_equipment"].append({
                        "tag": eq.tag,
                        "type": eq.equipment_type,
                        "connection_point": conn.from_connection_point or conn.to_connection_point,
                    })
                    equipment_connected.append(eq.tag)

    return {
        "line_number": line_number,
        "line_details": {
            "nominal_diameter_inch": line.nominal_diameter_inch,
            "spec_class": line.spec_class,
            "fluid": line.fluid,
            "design_pressure_barg": line.design_pressure_barg,
        },
        "pid_count": len(pid_appearances),
        "pids": list(pid_appearances.values()),
        "equipment_connected": list(set(equipment_connected)),
    }
```

---

## 7. API Endpoints complets

```python
# app/api/routes/modules/pid_pfd.py

router = APIRouter(prefix="/pid", tags=["pid_pfd"])

# ─── PID Documents ───────────────────────────────────────────────

@router.get("/", dependencies=[requires_permission("pid.read")])
async def list_pid_documents(project_id: Optional[str] = None, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await pid_service.list_pid_documents(
        entity_id=entity_id,
        project_id=project_id,
        bu_id=request.state.bu_id,
    )

@router.post("/", dependencies=[requires_permission("pid.write")])
async def create_pid_document(body: PIDDocumentCreate, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await pid_service.create_pid_document(body, entity_id, request.state.user_id)

@router.patch("/{pid_id}", dependencies=[requires_permission("pid.write")])
async def save_pid_xml(pid_id: str, body: PIDXMLUpdate, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    """Sauvegarde le XML draw.io et déclenche la sync DB en background."""
    await pid_service.save_xml(pid_id, body.xml_content, entity_id, request.state.user_id)
    # Sync asynchrone (APScheduler job)
    await scheduler.add_job(sync_pid_to_db, args=[pid_id, entity_id])
    return {"status": "saved"}

@router.post("/{pid_id}/sync-db", dependencies=[requires_permission("pid.write")])
async def sync_pid_db(pid_id: str, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    """Force la synchronisation immédiate XML → DB."""
    pid = await get_pid_document(pid_id, entity_id)
    stats = await pid_service.parse_and_sync_pid(pid_id, pid.xml_content, entity_id)
    return stats

@router.post("/{pid_id}/revision", dependencies=[requires_permission("pid.write")])
async def create_revision(pid_id: str, body: RevisionCreate, request: Request):
    return await pid_service.create_pid_revision(
        pid_id, body.description, body.change_type, request.state.user_id
    )

@router.get("/{pid_id}/diff/{rev_a}/{rev_b}", dependencies=[requires_permission("pid.read")])
async def diff_revisions(pid_id: str, rev_a: str, rev_b: str, request: Request):
    return await pid_service.diff_revisions(rev_a, rev_b)

# ─── Équipements ─────────────────────────────────────────────────

@router.get("/equipment", dependencies=[requires_permission("pid.read")])
async def search_equipment(
    search: Optional[str] = None,
    tag_type: Optional[str] = None,
    pid_id: Optional[str] = None,
    entity_id: UUID = Depends(get_current_entity),
):
    return await pid_service.search_equipment(
        entity_id=entity_id,
        search=search, tag_type=tag_type, pid_id=pid_id,
    )

@router.patch("/equipment/{eq_id}", dependencies=[requires_permission("pid.write")])
async def update_equipment(eq_id: str, body: dict, entity_id: UUID = Depends(get_current_entity), request: Request = None):
    return await pid_service.update_equipment(eq_id, body, entity_id, request.state.user_id)

# ─── Traçage ─────────────────────────────────────────────────────

@router.get("/trace/line", dependencies=[requires_permission("pid.read")])
async def trace_line(
    line_number: str = Query(...),
    project_id: str = Query(...),
    entity_id: UUID = Depends(get_current_entity),
):
    return await pid_service.trace_process_line(
        line_number, entity_id, project_id
    )

# ─── Tag Registry ─────────────────────────────────────────────────

@router.get("/dcs-tags", dependencies=[requires_permission("tag.read")])
async def list_dcs_tags(
    project_id: Optional[str] = None,
    search: Optional[str] = None,
    tag_type: Optional[str] = None,
    area: Optional[str] = None,
    page: int = 1, page_size: int = 50,
    entity_id: UUID = Depends(get_current_entity),
):
    return await tag_service.list_tags(
        entity_id=entity_id,
        project_id=project_id, search=search,
        tag_type=tag_type, area=area, page=page, page_size=page_size,
    )

@router.post("/dcs-tags/suggest", dependencies=[requires_permission("tag.read")])
async def suggest_tag(body: TagSuggestRequest, entity_id: UUID = Depends(get_current_entity)):
    suggestions = await tag_service.suggest_tag_name(
        tag_type=body.tag_type, area=body.area,
        equipment_id=body.equipment_id,
        entity_id=entity_id,
        project_id=body.project_id,
    )
    return {"suggestions": suggestions}

@router.post("/dcs-tags/validate", dependencies=[requires_permission("tag.read")])
async def validate_tag(body: TagValidateRequest, entity_id: UUID = Depends(get_current_entity)):
    return await tag_service.validate_tag_name(
        body.tag_name, body.tag_type, entity_id, body.project_id
    )

@router.post("/dcs-tags/import-csv", dependencies=[requires_permission("tag.create")])
async def import_tags_csv(
    project_id: str,
    file: UploadFile,
    entity_id: UUID = Depends(get_current_entity),
    request: Request = None,
):
    content = await file.read()
    return await tag_service.import_tags_from_csv(
        content, project_id, entity_id, request.state.user_id
    )

# ─── Export ──────────────────────────────────────────────────────

@router.get("/{pid_id}/export/svg", dependencies=[requires_permission("pid.read")])
async def export_svg(pid_id: str, entity_id: UUID = Depends(get_current_entity)):
    svg_bytes = await pid_service.export_svg(pid_id, entity_id)
    pid = await get_pid_document(pid_id, entity_id)
    return Response(
        content=svg_bytes, media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="{pid.number}.svg"'},
    )

@router.get("/{pid_id}/export/pdf", dependencies=[requires_permission("pid.read")])
async def export_pdf(pid_id: str, entity_id: UUID = Depends(get_current_entity)):
    pdf_bytes = await pid_service.export_pdf(pid_id, entity_id)
    pid = await get_pid_document(pid_id, entity_id)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pid.number}.pdf"'},
    )
```

---

## 8. Validation avant passage AFC

### Contrôles obligatoires

Validation systématique avant passage au statut AFC (Approved For Construction) :

- **Équipements** : tous les équipements doivent avoir leurs propriétés obligatoires renseignées
- **Instruments** : tous les instruments doivent avoir un tag DCS valide
- **Lignes de procédé** : toutes les lignes de procédé doivent avoir leur spécification complète (diamètre, classe, matériau)
- **Connecteurs** : pas de connecteurs orphelins (flags de continuation sans PID correspondant)

### Rapport de validation

- Si des erreurs sont détectées, un rapport de validation est affiché avec la liste complète des problèmes
- Le passage en AFC est **bloqué** tant que les erreurs critiques ne sont pas corrigées
- Les avertissements (non bloquants) sont également listés pour information

### Endpoint

```
POST /api/v1/pid/:id/validate-afc
```

---

## 9. Renommage en masse des tags DCS

### Fonctionnalité

- Fonctionnalité de renommage en masse des tags :
  - Sélection multiple de tags par filtre (zone, type, pattern)
  - Règle de renommage : pattern avec substitution (ex: `ZONE-A-*` → `ZONE-B-*`)
  - Prévisualisation avant application : ancien nom → nouveau nom pour chaque tag affecté

### Propagation et audit

- Mise à jour automatique de tous les PID où les tags renommés apparaissent
- Audit : chaque renommage est logué avec ancien et nouveau nom

### Endpoint

```
POST /api/v1/tags/bulk-rename
```

---

## 10. Versionnement des objets de bibliothèque

### Principe

- La modification d'un objet de bibliothèque (symbole) crée une **nouvelle version** de l'objet
- Les PID existants conservent l'ancienne version de l'objet — pas de mise à jour automatique

### Mise à jour dans les PID

- L'utilisateur peut choisir de mettre à jour un objet dans un PID vers la dernière version de la bibliothèque
- La mise à jour est effectuée objet par objet (pas de mise à jour globale automatique)

### Historique

- Historique des versions avec diff visuel : changements de forme, de connecteurs, de propriétés

---

## 11. Traçage d'un équipement

### Fonctionnement

- Traçage d'un équipement à travers tous les PID où il apparaît :
  - Recherche par tag ou par nom d'équipement
  - Liste de tous les PID contenant cet équipement, avec miniature
  - Clic sur un PID → navigation directe avec mise en évidence (highlight) de l'équipement

### Analogie

- Analogue au traçage de ligne (section 6) mais appliqué aux équipements

### Endpoint

```
GET /api/v1/equipment/:id/appearances
```

---

## 12. PDCA — Phase PID/PFD (Phase 8)

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | ERD validé avec ingénieurs Perenco. Migrations préparées pour 6 tables | `alembic upgrade head` sans erreur sur DB vide | 3j |
| DO | Intégration draw.io iframe : `PIDEditor.tsx` avec échange de messages JSON | draw.io s'ouvre in-app, sauvegarder → XML en DB | 3j |
| DO | Parser XML → DB : `parse_and_sync_pid()` détecte équipements et lignes | Poser une pompe dans draw.io → equipment record en DB | 5j |
| DO | Panneau propriétés React : cliquer cellule → formulaire → PATCH API | Modifier `design_pressure` → mis à jour en DB sans recharger la page | 3j |
| DO | Library Builder : UI création d'objet (SVG + propriétés + connexions) | Créer objet "Séparateur 3 phases" utilisable dans draw.io | 6j |
| DO | Library Builder : script import typicals DWG/DXF → SVG OpsFlux | 5 typicals Perenco convertis et disponibles dans la bibliothèque | 8j |
| DO | TagRegistry page : liste + filtres + inline edit du tag_name | Double-cliquer un tag → éditer → validation conformité en temps réel | 4j |
| DO | Import CSV Rockwell : upload → rapport erreurs → stats créé/mis à jour | Import 100 tags CSV Rockwell → 0 doublon, 3 erreurs signalées clairement | 4j |
| DO | Formulaire visuel de nommage : segments → pattern DSL + preview | Configurer `{AREA}-{TYPE}-{SEQ:3}` → preview "BIP-PT-001" en direct | 3j |
| DO | Suggestions tag via LLM + règles | Créer tag PT pour V-101 zone BIP → suggestion "BIP-PT-XXX" conforme | 3j |
| DO | Continuation flags multi-PID + traçage | `GET /pid/trace/line?line_number=6-HC-001` → 2 PID retournés avec positions | 4j |
| DO | Versionning PID : snapshot révision + diff visuel | Diff Rev 0 → Rev A : objets ajoutés/supprimés listés avec leur tag | 5j |
| DO | Recherche équipement global → clic → PID ouvert centré sur équipement | Chercher "V-101" → PID-BIPAGA-0101 s'ouvre, cellule V-101 sélectionnée | 3j |
| DO | Export SVG haute résolution + PDF A1 (via Puppeteer) + DXF basique | PDF A1 avec cartouche officiel Perenco imprimable sans pixelisation | 4j |
| CHECK | PID BIPAGA complet : 10 équipements (dont 2 multi-PID), 5 lignes, 50 tags importés, export PDF A1 | Toutes données cohérentes en DB, PDF A1 imprimable, diff Rev 0→A correct | 5j |
| ACT | Conversion de 3 PID existants Perenco + formation 2 ingénieurs process | Ingénieurs créent un nouveau PID autonomement, sans aide | 5j |
