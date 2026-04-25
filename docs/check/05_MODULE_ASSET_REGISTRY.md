# OpsFlux — 05_MODULE_ASSET_REGISTRY.md
# Module Asset Registry — Entity Manager Dynamique

> Pattern : **DocType Frappe / Custom Objects Salesforce**
> Un admin définit un type d'asset → le système génère TOUT automatiquement.

---

## 1. Principe fondamental

```
ADMIN définit un AssetType "Plateforme offshore"
  → Avec 8 champs : code (requis), type, water_depth, statut, lat, lng, field_id, commissioning_date

LE SYSTÈME génère AUTOMATIQUEMENT :
  → Table de données via extrafield_definitions (pas de migration DB supplémentaire)
  → API REST complète : GET/POST/PUT/DELETE /api/v1/assets/platform/
  → Vue liste avec colonnes filtrables + tri + pagination
  → Formulaire de création/édition avec validation
  → Vue détail avec TOUTES les capacités Core activées
  → Indexation dans Global Search
  → Disponibilité comme source dans les Connecteurs de données
  → Disponibilité comme référence dans d'autres Custom Fields
  → Vue Carte automatique si geolocation=True
  → Import/Export CSV automatique
```

## 2. Distinction fondamentale : Asset ≠ Tag

```
ASSET = objet physique/logistique avec identité propre dans le référentiel métier

  Exemples :
    - Séparateur V-101  (equipment, sur plateforme EBOME)
    - Pompe P-101A      (equipment, sur plateforme BIPAGA)
    - Plateforme EBOME  (infrastructure)
    - Hélico F-HJYC     (logistics)
    - Puits LOBE-04     (well)

  Propriétés typiques : nom, code, emplacement, statut, spécifications
  Géré par : Module Asset Registry
  Relation avec tags : un asset PEUT avoir des tags DCS associés (relation Core)

TAG = point de mesure/contrôle dans un système technique (DCS, PID, SCADA)

  Exemples :
    - PT-1011  (capteur pression sur V-101)
    - TT-1012  (capteur température sur P-101A)
    - FT-2034  (capteur débit sur ligne 6"-HC-001)
    - XV-3021  (vanne sur PID-101)

  Propriétés : tag_name, type (PT/TT/FT...), range, unit, DCS address
  Géré par : Module TagRegistry (sous-module de PID_PFD)
  Peut être rattaché à un asset (optionnel — ex: sonde d'ambiance = pas d'asset parent clair)
```

---

## 3. Manifest

```python
MODULE_MANIFEST = {
    "slug": "asset_registry",
    "version": "1.0.0",
    "depends_on": ["core"],

    "permissions": [
        "asset.read", "asset.create", "asset.edit", "asset.delete", "asset.admin",
        "asset_type.create", "asset_type.edit",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "Assets", "icon": "Building2",
         "route": "/assets", "order": 40}
    ],

    "mcp_tools": [
        "search_assets", "get_asset", "create_asset", "update_asset",
        "list_asset_types", "get_assets_on_map", "get_asset_relations",
    ],

    "map_layers": [
        {"key": "platforms", "label": "Plateformes", "asset_type": "platform"},
        {"key": "wells", "label": "Puits", "asset_type": "well"},
        {"key": "logistics", "label": "Moyens logistiques", "asset_type": "logistics_asset"},
    ],

    "settings": [
        {"key": "default_import_mode", "type": "select",
         "options": [{"value": "create_only", "label": "Créer seulement"},
                     {"value": "upsert", "label": "Créer ou mettre à jour"}],
         "default": "upsert", "scope": "tenant"},
        {"key": "map_default_zoom", "type": "number", "default": 8, "scope": "user"},
        {"key": "map_default_lat", "type": "number", "default": 3.848, "scope": "tenant"},
        {"key": "map_default_lng", "type": "number", "default": 10.497, "scope": "tenant"},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 4. Modèle de données

```sql
-- ─── TYPES D'ASSETS ──────────────────────────────────────────────

CREATE TABLE asset_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name JSONB NOT NULL,                -- {"fr": "Plateforme", "en": "Platform"}
    description JSONB,
    icon VARCHAR(50) NOT NULL DEFAULT 'Building2',    -- Lucide icon name
    color VARCHAR(20) NOT NULL DEFAULT '#2E86AB',
    parent_type_id UUID REFERENCES asset_types(id),
    -- Hiérarchie : ChampPétrolier > Plateforme > Puits
    -- Un asset de type Puits peut avoir un parent de type Plateforme

    -- Capacités Core activées pour ce type
    capability_versioning BOOLEAN NOT NULL DEFAULT TRUE,
    capability_workflow BOOLEAN NOT NULL DEFAULT FALSE,
    capability_attachments BOOLEAN NOT NULL DEFAULT TRUE,
    capability_comments BOOLEAN NOT NULL DEFAULT TRUE,
    capability_geolocation BOOLEAN NOT NULL DEFAULT FALSE,
    capability_relations BOOLEAN NOT NULL DEFAULT TRUE,
    capability_categories BOOLEAN NOT NULL DEFAULT TRUE,
    capability_custom_fields BOOLEAN NOT NULL DEFAULT TRUE,
    capability_export BOOLEAN NOT NULL DEFAULT TRUE,
    capability_import BOOLEAN NOT NULL DEFAULT TRUE,

    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
    -- true = type fourni par OpsFlux (Perenco defaults), false = créé par admin

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- Les champs d'un asset type sont stockés dans extrafield_definitions
-- avec object_type = "asset_{slug}" et module_origin = "asset_registry"
-- Cela permet au Custom Fields Engine de les gérer uniformément

-- ─── INSTANCES D'ASSETS ──────────────────────────────────────────

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_type_id UUID NOT NULL REFERENCES asset_types(id),
    bu_id UUID REFERENCES business_units(id),
    project_id UUID,                    -- optionnel: asset lié à un projet
    parent_asset_id UUID REFERENCES assets(id),
    -- pour la hiérarchie : Puits a parent_asset_id = Plateforme

    -- Champs communs à tous les assets (indépendants du type)
    code VARCHAR(100),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    -- active | inactive | maintenance | decommissioned

    -- Géolocalisation (si capability_geolocation = true)
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    altitude NUMERIC(8, 2),

    -- Les champs spécifiques au type sont dans extrafield_values
    -- object_type = "asset_{type_slug}", object_id = assets.id

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, asset_type_id, code)
);

CREATE INDEX idx_assets_tenant_type ON assets(tenant_id, asset_type_id);
CREATE INDEX idx_assets_parent ON assets(parent_asset_id);
CREATE INDEX idx_assets_bu ON assets(bu_id);
CREATE INDEX idx_assets_geo ON assets(lat, lng) WHERE lat IS NOT NULL;
```

---

## 5. Types Perenco prédéfinis — Définitions complètes

### Comment les types prédéfinis sont créés

```python
# app/services/modules/asset_service.py
# Appelé lors de l'activation du module pour un nouveau tenant

PERENCO_PREDEFINED_TYPES = [
    {
        "slug": "oil_field",
        "name": {"fr": "Champ pétrolier", "en": "Oil field"},
        "icon": "Layers",
        "color": "#1B3A5C",
        "capabilities": {
            "geolocation": True,
            "versioning": True,
            "attachments": True,
            "workflow": False,
        },
        "fields": [
            {"key": "code", "type": "text_short", "label": {"fr": "Code champ", "en": "Field code"},
             "required": True, "searchable": True, "group": "Identification"},
            {"key": "country", "type": "select_static", "label": {"fr": "Pays", "en": "Country"},
             "options": [{"value": "CM", "label": "Cameroun"}, {"value": "GA", "label": "Gabon"},
                         {"value": "FR", "label": "France"}, {"value": "UK", "label": "Royaume-Uni"},
                         {"value": "RD", "label": "Congo"}, {"value": "EQ", "label": "Guinée Équatoriale"}],
             "required": True, "group": "Identification"},
            {"key": "operator", "type": "text_short", "label": {"fr": "Opérateur", "en": "Operator"},
             "group": "Identification"},
            {"key": "license_number", "type": "text_short",
             "label": {"fr": "N° licence", "en": "License number"}, "group": "Identification"},
            {"key": "area_km2", "type": "number_decimal",
             "label": {"fr": "Superficie (km²)", "en": "Area (km²)"}, "unit": "km²", "group": "Données techniques"},
            {"key": "water_depth_range", "type": "text_short",
             "label": {"fr": "Profondeur eau", "en": "Water depth"}, "group": "Données techniques"},
            {"key": "first_oil_date", "type": "date",
             "label": {"fr": "Date premier pétrole", "en": "First oil date"}, "group": "Historique"},
            {"key": "production_status", "type": "select_static",
             "label": {"fr": "Statut production", "en": "Production status"},
             "options": [{"value": "producing", "label": {"fr": "En production", "en": "Producing"}},
                         {"value": "development", "label": {"fr": "En développement", "en": "Development"}},
                         {"value": "exploration", "label": {"fr": "Exploration", "en": "Exploration"}},
                         {"value": "abandoned", "label": {"fr": "Abandonné", "en": "Abandoned"}}],
             "group": "Statut"},
        ]
    },
    {
        "slug": "platform",
        "name": {"fr": "Plateforme / Site", "en": "Platform / Site"},
        "icon": "Building",
        "color": "#2E86AB",
        "parent_type_slug": "oil_field",    # les plateformes appartiennent à un champ
        "capabilities": {
            "geolocation": True,
            "versioning": True,
            "attachments": True,
            "workflow": False,
        },
        "fields": [
            {"key": "code", "type": "text_short", "label": {"fr": "Code plateforme"}, "required": True, "group": "Identification"},
            {"key": "platform_type", "type": "select_static",
             "label": {"fr": "Type de plateforme"},
             "options": [{"value": "fixed_jacket", "label": "Jacket fixe"},
                         {"value": "fpso", "label": "FPSO"},
                         {"value": "fso", "label": "FSO"},
                         {"value": "onshore_terminal", "label": "Terminal terrestre"},
                         {"value": "subsea_manifold", "label": "Manifold sous-marin"},
                         {"value": "wellhead_platform", "label": "Wellhead platform"}],
             "required": True, "group": "Données techniques"},
            {"key": "water_depth_m", "type": "number_int",
             "label": {"fr": "Profondeur eau (m)"}, "unit": "m",
             "options": {"min": 0, "max": 3000}, "group": "Données techniques"},
            {"key": "topsides_weight_te", "type": "number_decimal",
             "label": {"fr": "Poids topsides (te)"}, "unit": "te", "group": "Données techniques"},
            {"key": "operational_status", "type": "select_static",
             "label": {"fr": "Statut opérationnel"},
             "options": [{"value": "producing", "label": "En production"},
                         {"value": "standby", "label": "En veille"},
                         {"value": "shutdown", "label": "Arrêté"},
                         {"value": "decommissioned", "label": "Démantelé"},
                         {"value": "construction", "label": "En construction"}],
             "group": "Statut"},
            {"key": "first_production_date", "type": "date",
             "label": {"fr": "Date première production"}, "group": "Historique"},
            {"key": "crew_capacity_pax", "type": "number_int",
             "label": {"fr": "Capacité équipage (pax)"}, "unit": "pax", "group": "Capacités"},
            {"key": "oil_treatment_capacity_bbl", "type": "number_int",
             "label": {"fr": "Capacité traitement huile (bbl/j)"}, "unit": "bbl/j", "group": "Capacités"},
            {"key": "gas_treatment_capacity_mmscfd", "type": "number_decimal",
             "label": {"fr": "Capacité traitement gaz (MMscfd)"}, "unit": "MMscfd", "group": "Capacités"},
        ]
    },
    {
        "slug": "well",
        "name": {"fr": "Puits", "en": "Well"},
        "icon": "Waypoints",
        "color": "#3BB273",
        "parent_type_slug": "platform",
        "capabilities": {
            "geolocation": True,
            "versioning": True,
            "attachments": True,
            "workflow": False,
        },
        "fields": [
            {"key": "well_name", "type": "text_short", "label": {"fr": "Nom du puits"},
             "required": True, "group": "Identification"},
            {"key": "uwi", "type": "text_short",
             "label": {"fr": "UWI (Unique Well Identifier)"}, "group": "Identification"},
            {"key": "well_type", "type": "select_static",
             "label": {"fr": "Type de puits"},
             "options": [{"value": "oil_producer", "label": "Producteur huile"},
                         {"value": "gas_producer", "label": "Producteur gaz"},
                         {"value": "water_injector", "label": "Injecteur eau"},
                         {"value": "gas_injector", "label": "Injecteur gaz"},
                         {"value": "observation", "label": "Observation"},
                         {"value": "abandoned", "label": "Abandonné"}],
             "required": True, "group": "Données techniques"},
            {"key": "fluid_type", "type": "select_static",
             "label": {"fr": "Fluide principal"},
             "options": [{"value": "oil", "label": "Huile"},
                         {"value": "gas", "label": "Gaz"},
                         {"value": "gas_condensate", "label": "Condensat"},
                         {"value": "water", "label": "Eau"}],
             "group": "Données techniques"},
            {"key": "total_depth_m", "type": "number_int",
             "label": {"fr": "Profondeur totale (m MD)"}, "unit": "m MD",
             "group": "Données forages"},
            {"key": "tvd_m", "type": "number_int",
             "label": {"fr": "Profondeur vraie (TVD m)"}, "unit": "m TVD",
             "group": "Données forages"},
            {"key": "spud_date", "type": "date",
             "label": {"fr": "Date début forage (Spud)"}, "group": "Historique"},
            {"key": "completion_date", "type": "date",
             "label": {"fr": "Date completion"}, "group": "Historique"},
            {"key": "production_status", "type": "select_static",
             "label": {"fr": "Statut production"},
             "options": [{"value": "producing", "label": "En production"},
                         {"value": "shut_in", "label": "Fermé (shut-in)"},
                         {"value": "workover", "label": "En workover"},
                         {"value": "abandoned", "label": "Abandonné"}],
             "group": "Statut"},
            {"key": "reservoir", "type": "text_short",
             "label": {"fr": "Réservoir principal"}, "group": "Données techniques"},
        ]
    },
    {
        "slug": "logistics_asset",
        "name": {"fr": "Moyen logistique", "en": "Logistics asset"},
        "icon": "Truck",
        "color": "#F4A261",
        "capabilities": {
            "geolocation": True,
            "versioning": False,
            "attachments": True,
            "workflow": False,
        },
        "fields": [
            {"key": "asset_name", "type": "text_short", "label": {"fr": "Nom / Immatriculation"},
             "required": True, "group": "Identification"},
            {"key": "asset_subtype", "type": "select_static",
             "label": {"fr": "Type de moyen"},
             "options": [{"value": "helicopter", "label": "Hélicoptère"},
                         {"value": "supply_vessel", "label": "Bateau ravitailleur"},
                         {"value": "crew_boat", "label": "Crew boat"},
                         {"value": "fpso_vessel", "label": "FPSO / FSO"},
                         {"value": "truck", "label": "Camion"},
                         {"value": "crane", "label": "Grue / Barge grue"},
                         {"value": "other", "label": "Autre"}],
             "required": True, "group": "Identification"},
            {"key": "operator_tiers_id", "type": "reference",
             "label": {"fr": "Opérateur / Affréteur"},
             "options": {"object_type": "tiers", "display_fields": ["company_name", "short_name"]},
             "group": "Identification"},
            {"key": "registration", "type": "text_short",
             "label": {"fr": "Immatriculation"}, "group": "Identification"},
            {"key": "capacity_pax", "type": "number_int",
             "label": {"fr": "Capacité passagers (pax)"}, "unit": "pax",
             "group": "Capacités"},
            {"key": "capacity_cargo_te", "type": "number_decimal",
             "label": {"fr": "Capacité cargo (te)"}, "unit": "te",
             "group": "Capacités"},
            {"key": "range_km", "type": "number_int",
             "label": {"fr": "Rayon d'action (km)"}, "unit": "km",
             "group": "Capacités"},
            {"key": "availability_status", "type": "select_static",
             "label": {"fr": "Disponibilité"},
             "options": [{"value": "available", "label": "Disponible"},
                         {"value": "deployed", "label": "Déployé"},
                         {"value": "maintenance", "label": "En maintenance"},
                         {"value": "retired", "label": "Retiré du service"}],
             "group": "Statut"},
            {"key": "contract_expiry", "type": "date",
             "label": {"fr": "Expiration contrat"}, "group": "Contrat"},
        ]
    },
]
```

---

## 6. Auto-génération CRUD — Endpoints dynamiques

```python
# app/api/routes/modules/assets.py
# Les routes sont générées dynamiquement pour chaque asset_type actif

from fastapi import APIRouter, Depends, Query
from app.core.middleware.rbac import requires_permission
from app.services.modules.asset_service import AssetService

router = APIRouter(prefix="/assets", tags=["assets"])

@router.get("/{type_slug}", dependencies=[requires_permission("asset.read")])
async def list_assets(
    type_slug: str,
    bu_id: Optional[str] = Query(None, description="Filtrer par BU (défaut: BU active de l'user)"),
    search: Optional[str] = Query(None, description="Recherche texte sur nom et code"),
    status: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None, description="Filtrer par asset parent"),
    with_geo: bool = Query(False, description="Inclure uniquement les assets géolocalisés"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort_field: str = Query("name"),
    sort_direction: str = Query("asc"),
    request: Request = None,
):
    """
    Liste les assets d'un type donné.
    Les colonnes retournées incluent automatiquement les extrafields de ce type.
    """
    tenant_id = request.state.tenant_id
    active_bu_id = bu_id or request.state.bu_id  # BU active injectée par middleware

    return await AssetService.list_assets(
        type_slug=type_slug,
        tenant_id=tenant_id,
        bu_id=active_bu_id,
        search=search,
        status=status,
        parent_id=parent_id,
        with_geo=with_geo,
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_direction=sort_direction,
    )

@router.post("/{type_slug}", dependencies=[requires_permission("asset.create")])
async def create_asset(
    type_slug: str,
    body: dict,     # Validé dynamiquement selon les champs du type
    request: Request,
):
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id
    return await AssetService.create_asset(type_slug, body, tenant_id, user_id)

@router.get("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.read")])
async def get_asset(type_slug: str, asset_id: str, request: Request):
    return await AssetService.get_asset(type_slug, asset_id, request.state.tenant_id)

@router.put("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.edit")])
async def update_asset(type_slug: str, asset_id: str, body: dict, request: Request):
    return await AssetService.update_asset(
        type_slug, asset_id, body, request.state.tenant_id, request.state.user_id
    )

@router.delete("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.delete")])
async def archive_asset(type_slug: str, asset_id: str, request: Request):
    # Soft delete : is_active = False + log activité
    return await AssetService.archive_asset(
        type_slug, asset_id, request.state.tenant_id, request.state.user_id
    )

@router.post("/{type_slug}/import", dependencies=[requires_permission("asset.create")])
async def import_assets_csv(
    type_slug: str,
    file: UploadFile,
    column_mapping: str,  # JSON stringifié : {"CSV Col": "field_key"}
    import_mode: str = "upsert",   # create_only | upsert
    request: Request = None,
):
    """Import depuis CSV/Excel avec mapping de colonnes."""
    mapping = json.loads(column_mapping)
    return await AssetService.import_from_csv(
        type_slug=type_slug,
        file=file,
        column_mapping=mapping,
        import_mode=import_mode,
        tenant_id=request.state.tenant_id,
        user_id=request.state.user_id,
    )
```

---

## 7. Vue liste auto-générée — Composant React

```tsx
// src/components/modules/assets/AssetListView.tsx
// Ce composant est générique pour TOUS les types d'assets

const AssetListView = ({ typeSlug }: { typeSlug: string }) => {
    const { data: assetType } = useAssetType(typeSlug)
    const { data: assets, isLoading } = useAssets(typeSlug, filters)
    const { activeBuId } = useUIStore()
    const [viewMode, setViewMode] = useState<"list" | "map">("list")
    const columns = useAssetColumns(assetType)  // colonnes générées depuis les champs du type

    if (!assetType) return <Skeleton />

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b">
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                    <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="sm" className="h-7 px-2"
                        onClick={() => setViewMode("list")}
                    >
                        <List className="h-3.5 w-3.5" />
                    </Button>
                    {assetType.capability_geolocation && (
                        <Button
                            variant={viewMode === "map" ? "secondary" : "ghost"}
                            size="sm" className="h-7 px-2"
                            onClick={() => setViewMode("map")}
                        >
                            <Map className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
                <AssetFilters typeSlug={typeSlug} assetType={assetType} />
                <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={exportCSV}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export CSV
                    </Button>
                    <Button size="sm" onClick={() => navigate(`/assets/${typeSlug}/new`)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Nouveau
                    </Button>
                </div>
            </div>

            {/* Contenu : liste ou carte */}
            {viewMode === "list" ? (
                <DataTable
                    data={assets?.items || []}
                    columns={columns}
                    isLoading={isLoading}
                    onRowClick={(asset) => {
                        navigate(`/assets/${typeSlug}/${asset.id}`)
                        setSelectedObject({ type: `asset_${typeSlug}`, id: asset.id })
                    }}
                    pagination={{
                        total: assets?.total || 0,
                        page: assets?.page || 1,
                        pageSize: assets?.page_size || 25,
                    }}
                />
            ) : (
                <AssetMapView typeSlug={typeSlug} assets={assets?.items || []} />
            )}
        </div>
    )
}

// Génération automatique des colonnes depuis les fields du type
const useAssetColumns = (assetType: AssetType | undefined) => {
    return useMemo(() => {
        if (!assetType) return []

        const baseColumns = [
            { key: "code", label: "Code", sortable: true, width: 100 },
            { key: "name", label: "Nom", sortable: true, flex: 1 },
            { key: "status", label: "Statut", render: (v: string) => <AssetStatusBadge status={v} /> },
        ]

        // Ajouter les champs marqués is_filterable du type
        const typeColumns = assetType.fields
            .filter(f => f.is_filterable && !["code", "name"].includes(f.field_key))
            .slice(0, 4)  // max 4 colonnes de type en plus des colonnes de base
            .map(f => ({
                key: f.field_key,
                label: f.label[getCurrentLanguage()],
                sortable: f.is_searchable,
                render: (v: any) => renderFieldValue(f, v),
            }))

        return [...baseColumns, ...typeColumns]
    }, [assetType])
}
```

---

## 8. Import CSV/Excel — Mapping visuel

```tsx
// src/components/modules/assets/AssetImportModal.tsx
// Interface en 3 étapes : upload → mapping → import

const AssetImportModal = ({ typeSlug }: { typeSlug: string }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [csvHeaders, setCsvHeaders] = useState<string[]>([])
    const [mapping, setMapping] = useState<Record<string, string>>({})
    const [previewData, setPreviewData] = useState<any[]>([])
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const { data: assetType } = useAssetType(typeSlug)

    const assetFields = assetType?.fields.filter(f => f.is_importable) || []

    return (
        <Dialog>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Importer des {assetType?.name.fr}</DialogTitle>
                </DialogHeader>

                {/* Indicateur d'étapes */}
                <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3].map(s => (
                        <React.Fragment key={s}>
                            <div className={cn(
                                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium",
                                step >= s ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                            )}>{s}</div>
                            {s < 3 && <div className="flex-1 h-px bg-border" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Étape 1 : Upload */}
                {step === 1 && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Chargez un fichier CSV ou Excel (.xlsx).
                            La première ligne doit contenir les en-têtes de colonnes.
                        </p>
                        <FileDropzone
                            accept=".csv,.xlsx,.xls"
                            onUpload={async (file) => {
                                const { headers, preview } = await parseFileHeaders(file)
                                setCsvHeaders(headers)
                                setPreviewData(preview)
                                setStep(2)
                            }}
                        />
                    </div>
                )}

                {/* Étape 2 : Mapping des colonnes */}
                {step === 2 && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Associez les colonnes du fichier aux champs OpsFlux.
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {assetFields.map(field => (
                                <div key={field.field_key} className="flex items-center gap-3">
                                    <div className="flex-1 text-sm">
                                        {field.label.fr}
                                        {field.is_required && (
                                            <span className="text-destructive ml-1">*</span>
                                        )}
                                    </div>
                                    <Select
                                        value={mapping[field.field_key] || ""}
                                        onValueChange={(v) => setMapping(m => ({...m, [field.field_key]: v}))}
                                    >
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="Sélectionner colonne..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">— Ignorer —</SelectItem>
                                            {csvHeaders.map(h => (
                                                <SelectItem key={h} value={h}>{h}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                        {/* Aperçu des 3 premières lignes */}
                        <div>
                            <p className="text-xs font-medium mb-1">Aperçu (3 premières lignes)</p>
                            <ImportPreviewTable data={previewData.slice(0, 3)} mapping={mapping} fields={assetFields} />
                        </div>
                        <Button
                            onClick={() => setStep(3)}
                            disabled={!assetFields.filter(f => f.is_required).every(f => mapping[f.field_key])}
                        >
                            Lancer l'import
                        </Button>
                    </div>
                )}

                {/* Étape 3 : Résultat */}
                {step === 3 && importResult && (
                    <ImportResultDisplay result={importResult} />
                )}
            </DialogContent>
        </Dialog>
    )
}
```

---

## 9. PDCA — Phase Asset Registry (Phase 2)

| Étape | Tâche | Critère de validation | Effort |
|---|---|---|---|
| PLAN | ERD Asset Registry : asset_types + assets + champs via extrafield_definitions | ERD validé, migration P2-001 préparée | 1j |
| DO | Créer les 4 types Perenco prédéfinis en DB (script d'init) | Les 4 types apparaissent dans Settings → Asset Registry | 2j |
| DO | API CRUD assets dynamique : GET/POST/PUT/DELETE /assets/{type_slug}/ | Tests pytest : CRUD plateforme + puits fonctionnels | 3j |
| DO | UI Liste générique AssetListView avec colonnes auto-générées | Liste des plateformes avec colonnes code/nom/statut/type | 3j |
| DO | UI Formulaire générique AssetFormView avec champs auto-générés | Créer une plateforme avec tous ses champs | 3j |
| DO | UI Vue Détail avec capacités Core (timeline, PJ, commentaires, relations) | Fiche plateforme complète avec timeline | 2j |
| DO | Import CSV avec mapping visuel en 3 étapes | Import 20 plateformes depuis CSV, rapport erreurs clair | 3j |
| DO | Vue Carte Leaflet : assets géolocalisés + clustering + popup | Carte avec plateformes BIPAGA et EBOME cliquables | 2j |
| DO | Toggle vue liste / vue carte dans la toolbar | Switch list↔map sans rechargement des données | 1j |
| DO | Schema Builder UI : admin peut créer un nouveau type d'asset | Créer type "Compresseur" avec 5 champs personnalisés | 4j |
| CHECK | Scénario complet : créer type "Zone HSE" → ajouter 3 zones BIPAGA → importer 10 autres depuis CSV → voir sur carte | Toutes les fonctions marchent sans erreur | 2j |
| ACT | Former 1 admin Perenco à la création de types d'assets | Admin crée type "Contract" autonomement, sans aide | 1j |
