# OpsFlux — 04_MODULE_DASHBOARD.md
# Module Dashboard Engine — Spécification Complète

> Ce module est à la fois dans le **Core** (moteur GridStack, types de base)
> et dans le **Module Dashboard** (widgets avancés SQL/Pivot, navigation, import/export).

---

## 1. Manifest

```python
MODULE_MANIFEST = {
    "slug": "dashboard",
    "version": "1.0.0",
    "depends_on": ["core"],
    "permissions": [
        "dashboard.read", "dashboard.create", "dashboard.edit",
        "dashboard.admin", "dashboard.sql", "dashboard.pivot",
    ],
    "menu_items": [
        {"zone": "sidebar", "label": "Pilotage", "icon": "LayoutDashboard",
         "route": "/dashboards", "order": 10}
    ],
    "mcp_tools": [
        "get_dashboard", "list_dashboards", "get_widget_data",
        "create_dashboard_from_template", "export_dashboard",
    ],
    "settings": [
        {"key": "default_refresh_interval", "type": "select",
         "options": [{"value": "0", "label": "Manuel"},
                     {"value": "30000", "label": "30 secondes"},
                     {"value": "60000", "label": "1 minute"},
                     {"value": "300000", "label": "5 minutes"}],
         "default": "0", "scope": "user"},
        {"key": "sql_widget_timeout_seconds", "type": "number",
         "default": 30, "scope": "tenant",
         "requires_permission": "dashboard.admin"},
    ],
    "migrations_path": "alembic/versions/",
}
```

---

## 2. Modèle de données complet

```sql
-- ─── DASHBOARDS ──────────────────────────────────────────────────

CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    bu_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    -- PUBLIC = visible dans la galerie interne du tenant

    -- Navigation : où ce dashboard apparaît dans la sidebar
    nav_menu_parent VARCHAR(100),
    -- slug d'un module ("report_editor", "pid_pfd") ou NULL
    nav_menu_label VARCHAR(255),
    nav_menu_icon VARCHAR(50),          -- nom d'icône Lucide
    nav_menu_order INTEGER DEFAULT 999,
    nav_show_in_sidebar BOOLEAN DEFAULT TRUE,

    -- Configuration globale
    global_filters JSONB NOT NULL DEFAULT '[]',
    -- [{key: "date_range", type: "daterange", label: {...}}, ...]
    -- Ces filtres s'appliquent à tous les widgets qui les supportent

    -- Layouts GridStack (3 layouts indépendants)
    layout_mobile JSONB NOT NULL DEFAULT '[]',
    -- [{id: "w1", x: 0, y: 0, w: 1, h: 4}, ...]  (1 colonne)
    layout_tablet JSONB NOT NULL DEFAULT '[]',
    -- [{id: "w1", x: 0, y: 0, w: 4, h: 4}, ...]  (4 colonnes)
    layout_desktop JSONB NOT NULL DEFAULT '[]',
    -- [{id: "w1", x: 0, y: 0, w: 6, h: 4}, ...]  (12 colonnes)

    -- Widgets (stockés dans le dashboard)
    widgets JSONB NOT NULL DEFAULT '[]',
    -- Voir structure JSON ci-dessous

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PERMISSIONS DASHBOARD ───────────────────────────────────────

CREATE TABLE dashboard_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL,
    -- role | permission | user | bu | organization
    permission_value VARCHAR(255) NOT NULL,
    -- ex: "manager" | "dashboard.read" | "user-uuid" | "bu-uuid"
    inherit_from_parent BOOLEAN NOT NULL DEFAULT FALSE,
    -- true = hérite des permissions du nav_menu_parent
    allow_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (dashboard_id, permission_type, permission_value)
);

-- ─── HOME PAGE SETTINGS ──────────────────────────────────────────

CREATE TABLE home_page_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    scope_type VARCHAR(20) NOT NULL,    -- global | role | user | bu
    scope_value VARCHAR(255),
    -- NULL si global, sinon: nom du rôle, UUID user, UUID bu
    dashboard_id UUID REFERENCES dashboards(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, scope_type, scope_value)
);

-- ─── WIDGET CACHE ────────────────────────────────────────────────

CREATE TABLE widget_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    widget_id VARCHAR(100) NOT NULL,
    cache_key VARCHAR(255) NOT NULL,    -- hash(connector_id + params + tenant_id)
    data JSONB NOT NULL,
    row_count INTEGER,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (widget_id, cache_key)
);
CREATE INDEX idx_widget_cache_expiry ON widget_cache(expires_at);

-- ─── ACCESS LOGS ─────────────────────────────────────────────────

CREATE TABLE dashboard_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    access_type VARCHAR(20) NOT NULL,   -- view | edit | export | clone | share
    ip_address INET,
    session_duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dashboard_access ON dashboard_access_logs(dashboard_id, created_at DESC);
```

---

## 3. Structure JSON d'un widget (exhaustive)

```json
{
  "id": "w_prod_chart_7d",
  "type": "chart",
  "title": "Production huile — 7 derniers jours",
  "description": "Débit huile en bbl/j sur les 7 derniers jours",

  "permissions": {
    "requiredPermissions": [],
    "hideIfNoAccess": true
  },

  "options": {
    "refreshInterval": 300000,
    "exportFormats": ["csv", "excel", "pdf", "image"],
    "allowFullscreen": true,
    "showHeader": true,
    "showLastRefreshed": true
  },

  "config": {
    "chart_type": "line",
    "x_axis_field": "date",
    "x_axis_label": "Date",
    "y_axis_field": "value",
    "y_axis_label": "bbl/j",
    "y_axis_unit": "bbl/j",
    "colors": ["#2E86AB"],
    "show_legend": false,
    "show_data_labels": false,
    "show_grid": true,
    "smooth_lines": true,
    "reference_line": {
      "enabled": true,
      "value": 10000,
      "label": "Objectif",
      "color": "#E84855",
      "style": "dashed"
    }
  },

  "dataSource": {
    "type": "connector",
    "connector_id": "uuid-du-connecteur-bipaga-dcs",
    "query_config": {
      "metric": "daily_oil_bbl",
      "days": 7,
      "aggregation": "sum",
      "group_by": "day"
    },
    "refresh_mode": "live",
    "cache_ttl_seconds": 300,
    "supports_global_filters": ["date_range"]
  }
}
```

### Tous les types de widgets avec leurs configs spécifiques

#### `chart` — Graphique
```json
{
  "config": {
    "chart_type": "line | bar | pie | area | scatter | radar | composed",
    "x_axis_field": "string",
    "y_axis_field": "string | string[]",
    "colors": ["#hex"],
    "show_legend": true,
    "stacked": false,
    "smooth_lines": false,
    "reference_line": {"enabled": false, "value": 0, "label": "", "color": "#E84855"}
  }
}
```

#### `table` — Tableau
```json
{
  "config": {
    "columns": [
      {"field": "date", "label": "Date", "type": "date", "sortable": true, "width": 120},
      {"field": "value", "label": "Valeur", "type": "number", "unit": "bbl/j", "sortable": true}
    ],
    "default_sort": {"field": "date", "direction": "desc"},
    "pagination": true,
    "page_size": 10,
    "striped": true,
    "compact": false,
    "show_totals": false
  }
}
```

#### `kpi` — Métrique clé
```json
{
  "config": {
    "value_field": "current_value",
    "label": "Production du jour",
    "unit": "bbl",
    "precision": 0,
    "comparison": {
      "enabled": true,
      "period": "previous_day | previous_week | previous_month",
      "comparison_field": "comparison_value",
      "show_percentage": true,
      "show_absolute": false
    },
    "alert": {
      "enabled": true,
      "threshold": 10000,
      "direction": "below",
      "color": "#E84855"
    },
    "trend": {
      "enabled": true,
      "field": "trend_values",
      "days": 7
    },
    "icon": "Droplets"
  }
}
```

#### `sql` — SQL personnalisé (permission dashboard.sql requise)
```json
{
  "config": {
    "query": "SELECT date_trunc('day', created_at) as day, COUNT(*) as count FROM documents WHERE tenant_id = :tenant_id AND status = 'published' GROUP BY 1 ORDER BY 1 DESC LIMIT 30",
    "parameters": {},
    "result_display": "table | chart | kpi",
    "chart_config": {},
    "cache_ttl_seconds": 60,
    "timeout_seconds": 30,
    "max_rows": 10000
  }
}
```

#### `pivot` — Tableau croisé (permission dashboard.pivot requise)
```json
{
  "config": {
    "rows": ["platform_name"],
    "columns": ["month"],
    "values": [
      {"field": "oil_production", "aggregation": "sum", "label": "Prod. Huile"}
    ],
    "show_totals": true,
    "show_grand_total": true,
    "drill_down_enabled": true
  }
}
```

#### `map` — Carte géographique
```json
{
  "config": {
    "asset_type": "platform | well | logistics_asset",
    "marker_color_field": "operational_status",
    "marker_color_map": {
      "producing": "#3BB273",
      "shutdown": "#E84855",
      "standby": "#F4A261"
    },
    "popup_fields": ["name", "code", "operational_status", "water_depth_m"],
    "clustering": true,
    "initial_zoom": 8,
    "initial_center": {"lat": 3.848, "lng": 10.497}
  }
}
```

#### `text` — Contenu statique ou dynamique
```json
{
  "config": {
    "content_type": "static | template",
    "static_content": "Markdown ou HTML sanitisé",
    "template": "Production du {{date}} : **{{value}} bbl**",
    "template_data_source": {
      "connector_id": "...",
      "fields_mapping": {"date": "date_field", "value": "oil_field"}
    }
  }
}
```

---

## 4. GridStack.js — Configuration React

```tsx
// src/components/modules/dashboard/DashboardGrid.tsx
import GridLayout from "gridstack/dist/gridstack.js"
import "gridstack/dist/gridstack.css"
import "gridstack/dist/gridstack-extra.css"

const GRID_CONFIG = {
    mobile:  { column: 1,  cellHeight: 80 },
    tablet:  { column: 4,  cellHeight: 80 },
    desktop: { column: 12, cellHeight: 80 },
}

const DashboardGrid = ({ dashboard, mode }: { dashboard: Dashboard; mode: "edit" | "view" }) => {
    const breakpoint = useCurrentBreakpoint()
    const gridRef = useRef<GridStack | null>(null)
    const { layout, widgets } = getLayoutForBreakpoint(dashboard, breakpoint)
    const [editHistory, setEditHistory] = useState<LayoutState[]>([])

    useEffect(() => {
        const config = GRID_CONFIG[breakpoint]
        gridRef.current = GridStack.init({
            column: config.column,
            cellHeight: config.cellHeight,
            animate: true,
            float: false,
            resizable: { handles: "se, sw" },
            draggable: { handle: ".widget-drag-handle" },
            staticGrid: mode === "view",      // désactive drag+resize en mode vue
        })

        if (mode === "edit") {
            gridRef.current.on("change", (event, items) => {
                const newLayout = items.map(item => ({
                    id: item.el?.dataset.widgetId,
                    x: item.x, y: item.y,
                    w: item.w, h: item.h,
                }))
                setEditHistory(prev => [...prev.slice(-49), getLayoutForBreakpoint(dashboard, breakpoint)])
                saveLayoutDebounced(breakpoint, newLayout)
            })
        }

        return () => gridRef.current?.destroy()
    }, [breakpoint, mode])

    const undo = () => {
        if (editHistory.length === 0) return
        const prev = editHistory[editHistory.length - 1]
        setEditHistory(h => h.slice(0, -1))
        gridRef.current?.load(prev.layout)
    }

    return (
        <div className="gs-container" ref={containerRef}>
            {widgets.map(widget => {
                const pos = layout.find(l => l.id === widget.id)
                return (
                    <div
                        key={widget.id}
                        className="gs-item"
                        gs-id={widget.id}
                        gs-x={pos?.x} gs-y={pos?.y}
                        gs-w={pos?.w} gs-h={pos?.h}
                        data-widget-id={widget.id}
                    >
                        <WidgetCard widget={widget} mode={mode} />
                    </div>
                )
            })}
        </div>
    )
}
```

---

## 5. WidgetCard — Composant complet

```tsx
// src/components/modules/dashboard/WidgetCard.tsx

const WidgetCard = ({ widget, mode }: { widget: Widget; mode: "edit" | "view" }) => {
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const { data, error, refetch, dataUpdatedAt } = useWidgetData(widget)
    const canAccess = useWidgetPermission(widget)

    if (!canAccess && widget.permissions.hideIfNoAccess) return null
    if (!canAccess) return <AccessDeniedWidget />

    return (
        <div className={cn(
            "flex flex-col h-full bg-background border border-border rounded-md overflow-hidden",
            isFullscreen && "fixed inset-4 z-[300] shadow-xl",
        )}>
            {/* ── En-tête du widget ── */}
            {widget.options.showHeader && (
                <div className="flex items-center h-9 px-3 border-b border-border flex-shrink-0 gap-2">
                    {/* Handle drag (mode édition uniquement) */}
                    {mode === "edit" && (
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab widget-drag-handle flex-shrink-0" />
                    )}

                    <span className="text-xs font-medium text-foreground truncate flex-1">
                        {widget.title}
                    </span>

                    {/* Indicateur fraîcheur des données */}
                    {widget.options.showLastRefreshed && dataUpdatedAt && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatRelativeTime(dataUpdatedAt)}
                        </span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-0.5">
                        <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6"
                            onClick={() => { setIsRefreshing(true); refetch().finally(() => setIsRefreshing(false)) }}
                        >
                            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                        </Button>

                        {widget.options.allowFullscreen && (
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={() => setIsFullscreen(!isFullscreen)}>
                                {isFullscreen
                                    ? <Minimize2 className="h-3 w-3" />
                                    : <Maximize2 className="h-3 w-3" />
                                }
                            </Button>
                        )}

                        {widget.options.exportFormats?.length > 0 && (
                            <WidgetExportMenu widget={widget} data={data} />
                        )}

                        {mode === "edit" && (
                            <>
                                <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => openWidgetConfig(widget)}>
                                    <Settings className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => duplicateWidget(widget.id)}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => deleteWidget(widget.id)}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Contenu du widget ── */}
            <div className="flex-1 min-h-0 p-2">
                {error ? (
                    <WidgetError error={error} onRetry={refetch} />
                ) : !data ? (
                    <WidgetSkeleton type={widget.type} />
                ) : (
                    <WidgetRenderer widget={widget} data={data} />
                )}
            </div>
        </div>
    )
}
```

---

## 6. Validation SQL côté backend (sécurité complète)

```python
# app/services/modules/dashboard_service.py

import sqlparse
from sqlparse import tokens as T
from sqlparse.sql import Statement

FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "COPY",
    "\\\\", "PG_", "INFORMATION_SCHEMA", "PG_CATALOG",
    "SET", "SHOW", "VACUUM", "ANALYZE", "EXPLAIN",  -- certains safe, mais on bloque tout pour simplicité
}

FORBIDDEN_PATTERNS = [
    r"pg_read_file", r"pg_ls_dir", r"lo_import", r"lo_export",
    r"CURRENT_SETTING\s*\(", r"SET_CONFIG\s*\(",
    r"dblink", r"file_fdw",
]

async def validate_and_execute_widget_sql(
    query: str,
    params: dict,
    user: User,
    tenant_id: str,
    max_rows: int = 10000,
    timeout_seconds: int = 30,
) -> list[dict]:
    """Valide et exécute une requête SQL de widget en toute sécurité."""

    # 1. Permission
    if "dashboard.sql" not in user.effective_permissions:
        raise HTTPException(403, "Permission 'dashboard.sql' requise pour les widgets SQL")

    # 2. Parser SQL
    parsed = sqlparse.parse(query.strip())
    if len(parsed) != 1:
        raise ValueError("Une seule requête à la fois")

    stmt = parsed[0]

    # 3. Vérifier que c'est un SELECT
    first_token = None
    for token in stmt.flatten():
        if token.ttype not in (T.Whitespace, T.Newline, T.Comment.Single, T.Comment.Multiline):
            first_token = token
            break

    if not first_token or first_token.normalized.upper() != "SELECT":
        raise ValueError("Seules les requêtes SELECT sont autorisées")

    # 4. Chercher les mots-clés interdits
    query_upper = query.upper()
    for keyword in FORBIDDEN_KEYWORDS:
        if keyword in query_upper:
            raise ValueError(f"Instruction non autorisée : {keyword}")

    # 5. Patterns dangereux (regex)
    import re
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            raise ValueError(f"Pattern non autorisé détecté")

    # 6. Injecter tenant_id obligatoirement si tables OpsFlux
    # (simplification : on ajoute en paramètre, et les tables doivent filtrer par tenant_id)
    params["_tenant_id"] = tenant_id

    # 7. Exécuter avec timeout
    async with asyncio.timeout(timeout_seconds):
        async with get_db() as db:
            result = await db.execute(
                text(query).bindparams(**params),
                execution_options={"no_parameters": False}
            )
            rows = result.fetchmany(max_rows)

    # 8. Audit log
    await log_activity(
        tenant_id=tenant_id,
        actor_id=user.id,
        object_type="dashboard_widget",
        action="sql_executed",
        payload={
            "query_preview": query[:300],
            "rows_returned": len(rows),
            "user_email": user.email,
        }
    )

    return [dict(row._mapping) for row in rows]
```

---

## 7. Résolution page d'accueil

```python
# app/services/modules/dashboard_service.py

async def get_home_page_for_user(user: User, tenant_id: str, db: AsyncSession) -> Optional[Dashboard]:
    """
    Résolution hiérarchique de la page d'accueil.
    Ordre : utilisateur > rôle (priorité décroissante) > BU > global
    """

    # Mapping de priorité des rôles (plus petit = plus prioritaire)
    ROLE_PRIORITY = {
        "super_admin": 0,
        "tenant_admin": 1,
        "template_manager": 2,
        "pid_manager": 3,
        "editor": 4,
        "reviewer": 5,
        "reader": 6,
    }

    async def get_home(scope_type: str, scope_value: Optional[str]) -> Optional[Dashboard]:
        result = await db.execute(
            select(HomePageSettings).where(
                HomePageSettings.tenant_id == tenant_id,
                HomePageSettings.scope_type == scope_type,
                HomePageSettings.scope_value == scope_value,
                HomePageSettings.dashboard_id.isnot(None),
            )
        )
        setting = result.scalar_one_or_none()
        if not setting:
            return None
        # Vérifier que l'user a accès à ce dashboard
        dashboard = await get_dashboard_if_accessible(setting.dashboard_id, user, tenant_id, db)
        return dashboard

    # 1. Page personnalisée utilisateur
    if home := await get_home("user", str(user.id)):
        return home

    # 2. Page par rôle (essayer par ordre de priorité décroissante)
    user_roles = await get_user_roles(user.id, tenant_id, db)
    sorted_roles = sorted(user_roles, key=lambda r: ROLE_PRIORITY.get(r, 99))
    for role in sorted_roles:
        if home := await get_home("role", role):
            return home

    # 3. Page BU
    if user.primary_bu_id:
        if home := await get_home("bu", str(user.primary_bu_id)):
            return home

    # 4. Page globale tenant
    if home := await get_home("global", None):
        return home

    return None
```

---

## 8. Import/Export JSON complet

```python
# Export
async def export_dashboard_json(dashboard_id: str, tenant_id: str) -> dict:
    dashboard = await get_dashboard(dashboard_id, tenant_id)
    return {
        "schema_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "exported_by": "OpsFlux",
        "dashboard": {
            "name": dashboard.name,
            "description": dashboard.description,
            "navigation": {
                "menu_parent": dashboard.nav_menu_parent,
                "menu_label": dashboard.nav_menu_label,
                "menu_icon": dashboard.nav_menu_icon,
                "menu_order": dashboard.nav_menu_order,
                "show_in_sidebar": dashboard.nav_show_in_sidebar,
            },
            "global_filters": dashboard.global_filters,
            "layout_mobile": dashboard.layout_mobile,
            "layout_tablet": dashboard.layout_tablet,
            "layout_desktop": dashboard.layout_desktop,
            "widgets": dashboard.widgets,
            # NB : permissions, owner_id et is_public ne sont PAS exportés
        }
    }

# Import avec validation et nouveaux UUIDs
async def import_dashboard_json(
    data: dict,
    owner_id: str,
    tenant_id: str,
    db: AsyncSession,
) -> Dashboard:
    # Valider le schéma
    schema_version = data.get("schema_version", "unknown")
    if schema_version not in ("1.0",):
        raise ValueError(f"Version de schéma non supportée : {schema_version}")

    dash_data = data["dashboard"]

    # Vérifier que les connecteurs référencés existent
    for widget in dash_data.get("widgets", []):
        if widget.get("dataSource", {}).get("connector_id"):
            connector_exists = await check_connector_exists(
                widget["dataSource"]["connector_id"], tenant_id, db
            )
            if not connector_exists:
                raise ValueError(
                    f"Connecteur introuvable : {widget['dataSource']['connector_id']}. "
                    f"Configurez ce connecteur avant d'importer ce dashboard."
                )

    # Vérifier que les requêtes SQL sont valides (si permission SQL)
    # (validation légère — exécution complète à l'affichage)

    # Créer le dashboard avec nouveaux UUIDs
    new_widgets = [{**w, "id": str(uuid4())} for w in dash_data.get("widgets", [])]

    nav = dash_data.get("navigation", {})
    dashboard = Dashboard(
        tenant_id=tenant_id,
        owner_id=owner_id,
        name=dash_data["name"],
        description=dash_data.get("description"),
        nav_menu_parent=nav.get("menu_parent"),
        nav_menu_label=nav.get("menu_label", dash_data["name"]),
        nav_menu_icon=nav.get("menu_icon", "LayoutDashboard"),
        nav_menu_order=nav.get("menu_order", 999),
        nav_show_in_sidebar=nav.get("show_in_sidebar", True),
        global_filters=dash_data.get("global_filters", []),
        layout_mobile=dash_data.get("layout_mobile", []),
        layout_tablet=dash_data.get("layout_tablet", []),
        layout_desktop=dash_data.get("layout_desktop", []),
        widgets=new_widgets,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return dashboard
```

---

## 9. PDCA — Phase Dashboard (Phase 7)

| Étape | Tâche | Critère de validation | Effort |
|---|---|---|---|
| PLAN | Modéliser tables : dashboards, dashboard_permissions, home_page_settings, widget_cache, access_logs | ERD validé, migrations préparées | 1j |
| DO | DashboardContainer GridStack.js : mode édition (drag+drop+resize+undo/redo) | Déplacer, redimensionner, annuler — 12 colonnes desktop | 4j |
| DO | DashboardContainer mode visualisation : auto-refresh, fullscreen par widget | Mode vue sans possibilité de modifier, refresh sur interval | 2j |
| DO | Widget Chart (Recharts) : line, bar, pie, area. Configurable via modal | 4 types de graphiques avec données connecteur | 3j |
| DO | Widget Table (TanStack) : tri, filtre, pagination, export CSV | Tableau avec tri colonne + export CSV fonctionnel | 2j |
| DO | Widget KPI : valeur + comparaison + alerte + trend mini-graph | KPI avec couleur alerte si seuil dépassé | 2j |
| DO | Widget Carte (Leaflet) : assets géolocalisés + clustering | Carte avec assets de l'asset_registry | 2j |
| DO | Widget SQL : éditeur SQL + validation sécurité + résultat table | SELECT valide exécuté, résultat affiché, SELECT interdit impossible | 3j |
| DO | Widget Pivot : PivotTable.js intégré | Tableau croisé avec drill-down | 2j |
| DO | Permissions dashboard granulaires (par rôle/user/BU) + résolution home page (user>rôle>BU>global) | User manager voit son dashboard par défaut au login | 2j |
| DO | Navigation : dashboard dans sidebar module + badge compteur | Dashboard "Production BIPAGA" visible sous "PID/PFD" | 2j |
| DO | Import/Export JSON avec validation connecteurs | Export JSON + réimport sur autre tenant OK | 2j |
| DO | Galerie (marketplace interne) : dashboards publics clonable | Cloner un dashboard public et le personnaliser | 1j |
| CHECK | Créer dashboard "Production BIPAGA" : KPI + chart 7j + SQL + carte plateformes + home page manager | Toutes les features fonctionnent, permissions correctes | 2j |
| ACT | 5 dashboards créés par utilisateurs réels Perenco (pas par développeur) | Feedback utilisateurs documenté dans backlog | 2j |
