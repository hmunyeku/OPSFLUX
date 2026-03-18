# Module Dashboard -- Specification Fusionnee

## 1. Principe -- Systeme hybride d'onglets

La page d'accueil d'OpsFlux est structuree en **onglets de dashboard**. Chaque onglet est un dashboard independant avec ses propres widgets.

**Multi-tenancy :** Tenant (schema PG) > Entity (entity_id) > BU.
**ORM :** SQLAlchemy 2.0 async.
**Event bus :** PostgreSQL LISTEN/NOTIFY.
**Domaines :** *.opsflux.io
**Temps reel :** SSE (Server-Sent Events) pour les widgets operationnels.

**Deux types d'onglets coexistent :**

**Onglets obligatoires** (definis par l'admin, par role) :
- L'admin tenant peut creer des onglets et les rendre obligatoires pour un role ou un groupe.
- Ces onglets apparaissent toujours en premier, ne peuvent pas etre fermes ni reordonnes par l'utilisateur.
- Exemple : "Operations du jour" impose a tous les CDS, "Vue flotte" imposee aux LOG_BASE.

**Onglets personnels** (configures par l'utilisateur) :
- L'utilisateur peut creer ses propres onglets supplementaires avec GridStack.js (drag-and-drop).
- Il peut les nommer, les reordonner, les fermer.
- Ils s'affichent apres les onglets obligatoires.

```
+------------------------------------------------------------------------+
|  [Operations du jour (verrouille)] [Planner ! 2 (verrouille)] [Mon suivi] [+]  |
|   ^ obligatoire                     ^ obligatoire               ^ personnel   |
|   (impose par admin)                (badge = alertes)           (configurable) |
+------------------------------------------------------------------------+
|  Contenu de l'onglet actif (widgets GridStack.js)                       |
+------------------------------------------------------------------------+
```

**Badge d'alerte sur l'onglet :** Si un onglet obligatoire contient des elements necessitant une action immediate (conflits, AdS a valider, urgences), un badge rouge avec le compteur s'affiche meme quand l'onglet n'est pas actif.

---

## 2. Manifest

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

## 3. Catalogue global de widgets

Les modules enregistrent leurs widgets dans un catalogue global via `ModuleRegistry`. L'admin (pour les onglets obligatoires) ou l'utilisateur (pour ses onglets) choisit dans ce catalogue.

### 3.1 Types de widgets generiques

| Type | Description | Permission |
|---|---|---|
| `chart` | Graphique (line, bar, pie, area, scatter, radar) | `dashboard.read` |
| `table` | Tableau avec tri, filtre, pagination, export CSV | `dashboard.read` |
| `kpi` | Metrique cle avec comparaison, alerte, mini-trend | `dashboard.read` |
| `map` | Carte geographique (assets geolocalises, clustering) | `dashboard.read` |
| `sql` | SQL personnalise (SELECT uniquement) | `dashboard.sql` |
| `pivot` | Tableau croise dynamique avec drill-down | `dashboard.pivot` |
| `text` | Contenu statique ou dynamique (Markdown, template) | `dashboard.read` |

### 3.2 Widgets predefinis par module

| Widget | Description | Roles typiques | Source |
|---|---|---|---|
| `alerts_urgent` | Alertes critiques temps reel (SSE) | Tous | Core |
| `pax_on_site` | PAX actuellement sur site(s) | CDS, OMAA, DO | PaxLog |
| `ads_pending` | AdS en attente de validation | CDS, CHSE, DPROD | PaxLog |
| `planner_gantt_mini` | Gantt compact du site/champ | CDS, DO, DPROD | Planner |
| `capacity_heatmap` | Heatmap charge PAX par site | DO, DPROD | Planner |
| `fleet_map` | Carte temps reel des vecteurs (SSE) | LOG_BASE, DO | TravelWiz |
| `trips_today` | Voyages du jour (departs/arrivees) | LOG_BASE | TravelWiz |
| `cargo_pending` | Cargo en attente de traitement | LOG_BASE | TravelWiz |
| `pickup_progress` | Avancement du ramassage en cours (SSE) | LOG_BASE | TravelWiz |
| `compliance_expiry` | Certifications expirant dans 30j | CHSE, CMEDIC | PaxLog |
| `signalements_actifs` | Signalements actifs par site | CHSE, CDS, DO | PaxLog |
| `project_status` | Statut des projets actifs | CHEF_PROJET, DPROJ | Projets |
| `my_ads` | Mes AdS en cours | DEMANDEUR | PaxLog |
| `kpi_fleet` | KPIs flotte (productivite, ponctualite) | LOG_BASE, DO | TravelWiz |
| `weather_sites` | Meteo des sites operationnels | LOG_BASE, DO | TravelWiz |

---

## 4. Modele de donnees complet

```sql
-- === DASHBOARDS (onglets personnels et configuration globale) ===

CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    entity_id UUID NOT NULL REFERENCES entities(id),
    bu_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    -- Navigation sidebar
    nav_menu_parent VARCHAR(100),
    nav_menu_label VARCHAR(255),
    nav_menu_icon VARCHAR(50),
    nav_menu_order INTEGER DEFAULT 999,
    nav_show_in_sidebar BOOLEAN DEFAULT TRUE,

    -- Filtres globaux
    global_filters JSONB NOT NULL DEFAULT '[]',

    -- Layouts GridStack (3 breakpoints independants)
    layout_mobile JSONB NOT NULL DEFAULT '[]',   -- 1 colonne
    layout_tablet JSONB NOT NULL DEFAULT '[]',   -- 4 colonnes
    layout_desktop JSONB NOT NULL DEFAULT '[]',  -- 12 colonnes

    -- Widgets
    widgets JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === ONGLETS OBLIGATOIRES (definis par admin, par role) ===

CREATE TABLE dashboard_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    -- true = impose par admin, non suppressible par l'utilisateur
    target_role VARCHAR(50),        -- role cible si is_mandatory=true (null = tous)
    target_group_id UUID,           -- ou groupe specifique
    tab_order SMALLINT NOT NULL DEFAULT 0,
    widgets JSONB NOT NULL DEFAULT '[]',
    -- [{widget_type, position: {x,y,w,h}, config: {...}}]
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === ONGLETS PERSONNELS ===

CREATE TABLE user_dashboard_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    entity_id UUID NOT NULL REFERENCES entities(id),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    tab_order SMALLINT NOT NULL DEFAULT 100,
    -- Les onglets personnels s'affichent apres les obligatoires
    widgets JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === PERMISSIONS DASHBOARD ===

CREATE TABLE dashboard_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    permission_type VARCHAR(50) NOT NULL,
    -- role | permission | user | bu | organization
    permission_value VARCHAR(255) NOT NULL,
    inherit_from_parent BOOLEAN NOT NULL DEFAULT FALSE,
    allow_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (dashboard_id, permission_type, permission_value)
);

-- === HOME PAGE SETTINGS ===

CREATE TABLE home_page_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    scope_type VARCHAR(20) NOT NULL,    -- global | role | user | bu
    scope_value VARCHAR(255),
    dashboard_id UUID REFERENCES dashboards(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, scope_type, scope_value)
);

-- === WIDGET CACHE ===

CREATE TABLE widget_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    widget_id VARCHAR(100) NOT NULL,
    cache_key VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    row_count INTEGER,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (widget_id, cache_key)
);
CREATE INDEX idx_widget_cache_expiry ON widget_cache(expires_at);

-- === ACCESS LOGS ===

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

## 5. Structure JSON d'un widget

```json
{
  "id": "w_prod_chart_7d",
  "type": "chart",
  "title": "Production huile -- 7 derniers jours",
  "description": "Debit huile en bbl/j sur les 7 derniers jours",

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
    "y_axis_field": "value",
    "y_axis_unit": "bbl/j",
    "colors": ["#2E86AB"],
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
    "connector_id": "uuid-du-connecteur",
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

### Configs specifiques par type de widget

**`chart` :** chart_type (line|bar|pie|area|scatter|radar|composed), axes, couleurs, legende, stacked, reference_line.

**`table` :** colonnes (field, label, type, sortable, width), default_sort, pagination, page_size, striped, show_totals.

**`kpi` :** value_field, label, unit, precision, comparison (period, show_percentage), alert (threshold, direction, color), trend (field, days), icon.

**`sql` :** query (SELECT uniquement), parameters, result_display (table|chart|kpi), timeout_seconds, max_rows.

**`pivot` :** rows, columns, values (field + aggregation), show_totals, drill_down_enabled.

**`map` :** asset_type, marker_color_field, marker_color_map, popup_fields, clustering, initial_zoom, initial_center.

**`text` :** content_type (static|template), static_content, template, template_data_source.

---

## 6. Validation SQL cote backend (securite)

```python
# app/services/modules/dashboard_service.py

FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "EXEC", "EXECUTE", "GRANT", "REVOKE", "COPY",
    "PG_", "INFORMATION_SCHEMA", "PG_CATALOG",
    "SET", "SHOW", "VACUUM", "ANALYZE",
}

FORBIDDEN_PATTERNS = [
    r"pg_read_file", r"pg_ls_dir", r"lo_import", r"lo_export",
    r"CURRENT_SETTING\s*\(", r"SET_CONFIG\s*\(",
    r"dblink", r"file_fdw",
]

async def validate_and_execute_widget_sql(
    query: str, params: dict, user: User,
    tenant_id: str, max_rows: int = 10000, timeout_seconds: int = 30,
) -> list[dict]:
    """Valide et execute une requete SQL de widget en toute securite."""

    # 1. Permission dashboard.sql requise
    if "dashboard.sql" not in user.effective_permissions:
        raise HTTPException(403, "Permission 'dashboard.sql' requise")

    # 2. Parser SQL -- une seule requete SELECT autorisee
    parsed = sqlparse.parse(query.strip())
    if len(parsed) != 1:
        raise ValueError("Une seule requete a la fois")

    # 3. Verifier que c'est un SELECT
    first_token = next(
        (t for t in parsed[0].flatten()
         if t.ttype not in (T.Whitespace, T.Newline, T.Comment.Single, T.Comment.Multiline)),
        None
    )
    if not first_token or first_token.normalized.upper() != "SELECT":
        raise ValueError("Seules les requetes SELECT sont autorisees")

    # 4. Mots-cles interdits
    query_upper = query.upper()
    for keyword in FORBIDDEN_KEYWORDS:
        if keyword in query_upper:
            raise ValueError(f"Instruction non autorisee : {keyword}")

    # 5. Patterns dangereux (regex)
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            raise ValueError("Pattern non autorise detecte")

    # 6. Injecter tenant_id obligatoirement
    params["_tenant_id"] = tenant_id

    # 7. Executer avec timeout
    async with asyncio.timeout(timeout_seconds):
        async with get_db() as db:
            result = await db.execute(text(query).bindparams(**params))
            rows = result.fetchmany(max_rows)

    # 8. Audit log
    await log_activity(
        tenant_id=tenant_id, actor_id=user.id,
        object_type="dashboard_widget", action="sql_executed",
        payload={"query_preview": query[:300], "rows_returned": len(rows)},
    )

    return [dict(row._mapping) for row in rows]
```

---

## 7. GridStack.js -- Configuration React

```tsx
// src/components/modules/dashboard/DashboardGrid.tsx

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
            staticGrid: mode === "view",  // desactive drag+resize en mode vue
        })

        if (mode === "edit") {
            gridRef.current.on("change", (event, items) => {
                const newLayout = items.map(item => ({
                    id: item.el?.dataset.widgetId,
                    x: item.x, y: item.y, w: item.w, h: item.h,
                }))
                setEditHistory(prev => [...prev.slice(-49), layout])
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
                    <div key={widget.id} className="gs-item"
                        gs-id={widget.id} gs-x={pos?.x} gs-y={pos?.y}
                        gs-w={pos?.w} gs-h={pos?.h} data-widget-id={widget.id}>
                        <WidgetCard widget={widget} mode={mode} />
                    </div>
                )
            })}
        </div>
    )
}
```

---

## 8. WidgetCard -- Composant complet

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
        <div className={cn("flex flex-col h-full bg-background border rounded-md overflow-hidden",
            isFullscreen && "fixed inset-4 z-[300] shadow-xl")}>

            {/* En-tete du widget */}
            {widget.options.showHeader && (
                <div className="flex items-center h-9 px-3 border-b flex-shrink-0 gap-2">
                    {mode === "edit" && (
                        <GripVertical className="h-3.5 w-3.5 cursor-grab widget-drag-handle" />
                    )}
                    <span className="text-xs font-medium truncate flex-1">{widget.title}</span>
                    {widget.options.showLastRefreshed && dataUpdatedAt && (
                        <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(dataUpdatedAt)}
                        </span>
                    )}
                    {/* Boutons: refresh, fullscreen, export, settings (edit), duplicate, delete */}
                </div>
            )}

            {/* Contenu */}
            <div className="flex-1 min-h-0 p-2">
                {error ? <WidgetError error={error} onRetry={refetch} />
                 : !data ? <WidgetSkeleton type={widget.type} />
                 : <WidgetRenderer widget={widget} data={data} />}
            </div>
        </div>
    )
}
```

---

## 9. SSE pour widgets temps reel

Les widgets operationnels (`fleet_map`, `pax_on_site`, `alerts_urgent`, `pickup_progress`) recoivent des mises a jour en temps reel via Server-Sent Events.

```python
# app/api/routes/core/sse.py

@router.get("/sse/dashboard/{widget_type}")
async def dashboard_sse(widget_type: str, request: Request):
    """Stream SSE pour widgets temps reel."""
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    async def event_generator():
        async for event in event_bus.subscribe(f"widget.{widget_type}.{tenant_id}"):
            yield {"event": widget_type, "data": json.dumps(event)}

    return EventSourceResponse(event_generator())
```

**Regles d'affichage des widgets :**
- Tous les widgets sont **scopes au perimetre du groupe** de l'utilisateur : un CDS ne voit que les donnees de son site.
- Les KPIs numeriques sont cliquables : redirection vers la liste filtree correspondante dans le module concerne.

---

## 10. Resolution page d'accueil

```python
# app/services/modules/dashboard_service.py

async def get_home_page_for_user(user: User, tenant_id: str, db: AsyncSession):
    """
    Resolution hierarchique de la page d'accueil.
    Ordre : utilisateur > role (priorite decroissante) > BU > global
    """

    # 1. Page personnalisee utilisateur
    if home := await get_home("user", str(user.id)):
        return home

    # 2. Page par role (essayer par ordre de priorite decroissante)
    user_roles = await get_user_roles(user.id, tenant_id, db)
    for role in sorted(user_roles, key=lambda r: ROLE_PRIORITY.get(r, 99)):
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

## 11. Onglets obligatoires par defaut (seeds)

Au demarrage, l'admin configure les onglets obligatoires pour chaque role :

**Pour le role CDS :**
- Onglet "Mon site" [obligatoire] : `pax_on_site` + `ads_pending` + `planner_gantt_mini` + `alerts_urgent`

**Pour le role LOG_BASE :**
- Onglet "Operations" [obligatoire] : `fleet_map` + `trips_today` + `cargo_pending` + `pickup_progress`

**Pour le role DO :**
- Onglet "Vue globale" [obligatoire] : `capacity_heatmap` + `alerts_urgent` + `fleet_map` + `signalements_actifs`

**Pour le role DEMANDEUR :**
- Onglet "Mes demandes" [obligatoire] : `my_ads` + `alerts_urgent`

**Pour le role CHEF_PROJET :**
- Onglet "Mes projets" [obligatoire] : `project_status` + `planner_gantt_mini` + `alerts_urgent`
- Widgets recommandes : avancement global des projets (KPI % completion), taches en retard (table filtree), Gantt miniature multi-projets, AdS liees aux projets actifs, suivi budget (KPI cout reel vs previsionnel si disponible)

**Pour le role CHSE :**
- Onglet "Compliance & HSE" [obligatoire] : `compliance_expiry` + `signalements_actifs` + `alerts_urgent`
- Widgets recommandes : certifications expirantes dans les 30 prochains jours (table avec countdown), signalements actifs par site (table groupee), score compliance par site (KPI avec code couleur vert/orange/rouge), anomalies HSE du jour (table filtree sur severity = critical | warning), statistiques incidents mensuels (chart bar empile par type)

---

## 12. Import/Export JSON

```python
# Export
async def export_dashboard_json(dashboard_id: str, tenant_id: str) -> dict:
    dashboard = await get_dashboard(dashboard_id, tenant_id)
    return {
        "schema_version": "1.0",
        "exported_at": datetime.utcnow().isoformat(),
        "dashboard": {
            "name": dashboard.name,
            "description": dashboard.description,
            "navigation": {
                "menu_parent": dashboard.nav_menu_parent,
                "menu_label": dashboard.nav_menu_label,
                "menu_icon": dashboard.nav_menu_icon,
            },
            "global_filters": dashboard.global_filters,
            "layout_mobile": dashboard.layout_mobile,
            "layout_tablet": dashboard.layout_tablet,
            "layout_desktop": dashboard.layout_desktop,
            "widgets": dashboard.widgets,
            # NB : permissions, owner_id et is_public ne sont PAS exportes
        }
    }

# Import avec validation et nouveaux UUIDs
async def import_dashboard_json(data: dict, owner_id: str, tenant_id: str,
                                 db: AsyncSession) -> Dashboard:
    # Valider le schema
    # Verifier que les connecteurs references existent
    # Creer le dashboard avec nouveaux UUIDs
    ...
```

### 12.1 Export PDF du dashboard complet

Export du dashboard complet en PDF : une page, disposition identique a l'ecran.

- **Bouton** : "Exporter en PDF" dans le menu contextuel du dashboard (icone `FileDown`).
- **Rendu** : capture cote serveur via Puppeteer/Playwright headless pour respecter fidelement le layout GridStack (positions, tailles, breakpoint desktop).
- **Contenu** : tous les widgets visibles avec leurs donnees au moment de l'export. Les widgets SSE sont captures dans leur etat courant.
- **En-tete PDF** : nom du dashboard, date/heure d'export, nom de l'entity.
- **Endpoint** : `POST /api/v1/dashboards/:id/export-pdf`
  - Retourne un fichier PDF en reponse binaire (`Content-Type: application/pdf`).
  - Timeout : 30 secondes maximum pour le rendu.

---

### 12.2 Mode TV — Affichage continu salle de controle

Mode affichage TV : lien permanent generable pour affichage continu sur ecran de salle de controle.

**Fonctionnement :**

1. **Generation du lien** : bouton "Generer lien TV" dans les options du dashboard (visible uniquement pour les utilisateurs avec permission `dashboard.admin`).
2. **Acces sans authentification** : le lien genere est accessible sans login pour les dashboards dont au moins une entree `dashboard_permissions` a `allow_anonymous = true`.
3. **Affichage** : le dashboard s'affiche en plein ecran, sans sidebar, sans header, avec rafraichissement automatique selon l'intervalle configure (defaut 60 secondes).
4. **Revocation** : le lien est revocable a tout moment par l'admin. Une fois revoque, le token devient invalide et retourne une erreur 403.

**Endpoints :**

```
POST   /api/v1/dashboards/:id/tv-link      Generer un token TV unique
       Response: { "token": "abc123...", "url": "https://app.opsflux.io/api/v1/dashboards/tv/abc123..." }

GET    /api/v1/dashboards/tv/:token         Acceder au dashboard en lecture seule sans authentification
       Response: HTML plein ecran avec le dashboard (widgets en mode view, refresh auto)

DELETE /api/v1/dashboards/:id/tv-link       Revoquer le lien TV
```

**Securite :**
- Le token est un UUID v4 genere aleatoirement, stocke dans `dashboard_permissions` avec `permission_type = 'tv_token'`.
- Le dashboard en mode TV n'expose aucune action (pas de boutons, pas de liens cliquables, lecture seule stricte).
- Les widgets SQL ne sont pas affiches en mode TV (risque de fuite de donnees via requetes personnalisees).

---

## 13. Enregistrement module

```python
# Au startup de l'application
from app.core.module_registry import module_registry

module_registry.register("dashboard", MODULE_MANIFEST)
```

---

## 14. PDCA -- Phase Dashboard (Phase 7)

| Etape | Tache | Critere de validation | Effort |
|---|---|---|---|
| PLAN | Modeliser tables : dashboards, dashboard_tabs, user_dashboard_tabs, permissions, home_page_settings, widget_cache, access_logs | ERD valide, migrations preparees | 1j |
| DO | Systeme d'onglets obligatoires (admin) + personnels (utilisateur) | Onglets obligatoires non suppressibles, personnels drag-and-drop | 3j |
| DO | DashboardContainer GridStack.js : mode edition (drag+drop+resize+undo/redo) | Deplacer, redimensionner, annuler -- 12 colonnes desktop | 4j |
| DO | DashboardContainer mode visualisation : auto-refresh, fullscreen, SSE temps reel | Mode vue sans modification, refresh sur interval, SSE actif | 2j |
| DO | Widget Chart (Recharts) : line, bar, pie, area | 4 types de graphiques fonctionnels | 3j |
| DO | Widget Table (TanStack) : tri, filtre, pagination, export CSV | Tableau avec tri + export CSV | 2j |
| DO | Widget KPI : valeur + comparaison + alerte + trend mini-graph | KPI avec couleur alerte si seuil depasse | 2j |
| DO | Widget Carte (Leaflet) : assets geolocalises + clustering | Carte avec assets de l'asset_registry | 2j |
| DO | Widget SQL : editeur SQL + validation securite (FORBIDDEN_KEYWORDS) + resultat | SELECT valide execute, SELECT interdit impossible | 3j |
| DO | Widget Pivot : PivotTable.js integre | Tableau croise avec drill-down | 2j |
| DO | Catalogue global de widgets : modules enregistrent leurs widgets au startup | Catalogue complet avec widgets de tous les modules | 2j |
| DO | Permissions dashboard granulaires + resolution home page (user>role>BU>global) | User manager voit son dashboard par defaut au login | 2j |
| DO | Import/Export JSON avec validation connecteurs | Export JSON + reimport sur autre tenant OK | 2j |
| DO | Galerie (marketplace interne) : dashboards publics clonables | Cloner un dashboard public et le personnaliser | 1j |
| CHECK | Creer dashboard "Production" : KPI + chart 7j + SQL + carte + home page manager + onglets obligatoires par role | Toutes les features fonctionnent, SSE actif | 2j |
| ACT | 5 dashboards crees par utilisateurs reels (pas par developpeur) | Feedback utilisateurs documente | 2j |
