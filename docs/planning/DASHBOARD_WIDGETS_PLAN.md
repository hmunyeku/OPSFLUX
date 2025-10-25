# Plan d'Implémentation : Système de Dashboards & Widgets Personnalisables

## 📋 Vue d'Ensemble

### Objectif
Créer un système de dashboards entièrement personnalisable permettant aux utilisateurs de créer, organiser et sauvegarder des layouts de widgets via drag & drop. Les administrateurs peuvent créer des dashboards obligatoires pour des groupes, rôles ou utilisateurs spécifiques.

### Fonctionnalités Clés
- ✅ Dashboards personnalisables par utilisateur
- ✅ Dashboards obligatoires (global, par groupe, par rôle, par utilisateur)
- ✅ Widgets créés par les modules core ou importés par modules spécifiques
- ✅ Interface drag & drop avec gridstack.js
- ✅ Sauvegarde automatique des layouts
- ✅ Système de permissions granulaire

---

## 🏗️ Architecture Technique

### Stack Technologique
- **Frontend**: Next.js 15.5.6 + React 19 + TypeScript
- **Grid Library**: gridstack.js v10+
- **Backend**: FastAPI + SQLAlchemy
- **Database**: PostgreSQL
- **Cache**: Redis (pour layouts fréquents)

### Composants Principaux

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │   Widget     │  │  Gridstack   │  │
│  │  Manager     │  │  Registry    │  │  Wrapper     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↕ API
┌─────────────────────────────────────────────────────────┐
│                    Backend Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Dashboard   │  │   Widget     │  │  Permission  │  │
│  │  Service     │  │  Service     │  │  Service     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│                    Database Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  dashboards  │  │   widgets    │  │  dashboard_  │  │
│  │              │  │              │  │  widgets     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🗄️ Modèles de Données

### 1. Dashboard

```python
class Dashboard(Base):
    __tablename__ = "dashboards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Ownership
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Type de dashboard
    is_default: Mapped[bool] = mapped_column(default=False)  # Dashboard par défaut pour nouveaux utilisateurs
    is_mandatory: Mapped[bool] = mapped_column(default=False)  # Obligatoire, non supprimable

    # Scope (si mandatory=True)
    scope: Mapped[Optional[str]] = mapped_column(String(50))  # 'global', 'group', 'role', 'user'
    scope_id: Mapped[Optional[int]]  # ID du groupe/rôle/utilisateur si applicable

    # Layout configuration
    layout_config: Mapped[dict] = mapped_column(JSON)  # Gridstack config (columns, etc.)

    # Metadata
    is_active: Mapped[bool] = mapped_column(default=True)
    is_public: Mapped[bool] = mapped_column(default=False)  # Partageable avec autres utilisateurs
    order: Mapped[int] = mapped_column(default=0)  # Ordre d'affichage

    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    # Relations
    created_by: Mapped["User"] = relationship(back_populates="dashboards")
    widgets: Mapped[list["DashboardWidget"]] = relationship(
        back_populates="dashboard",
        cascade="all, delete-orphan"
    )
```

### 2. Widget

```python
class Widget(Base):
    __tablename__ = "widgets"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Identification
    widget_type: Mapped[str] = mapped_column(String(100))  # 'stats_card', 'chart_line', etc.
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Module source
    module_name: Mapped[str] = mapped_column(String(100))  # 'core', 'hse', 'warehouse', etc.

    # Configuration par défaut
    default_config: Mapped[dict] = mapped_column(JSON)  # Config par défaut du widget
    default_size: Mapped[dict] = mapped_column(JSON)  # {w: 3, h: 2, minW: 2, minH: 1, maxW: 6, maxH: 4}

    # Permissions
    required_permission: Mapped[Optional[str]] = mapped_column(String(100))

    # Metadata
    is_active: Mapped[bool] = mapped_column(default=True)
    category: Mapped[Optional[str]] = mapped_column(String(50))  # 'analytics', 'monitoring', etc.
    icon: Mapped[Optional[str]] = mapped_column(String(50))

    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    # Relations
    dashboard_widgets: Mapped[list["DashboardWidget"]] = relationship(back_populates="widget")
```

### 3. DashboardWidget (Association Table)

```python
class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Relations
    dashboard_id: Mapped[int] = mapped_column(ForeignKey("dashboards.id", ondelete="CASCADE"))
    widget_id: Mapped[int] = mapped_column(ForeignKey("widgets.id", ondelete="CASCADE"))

    # Gridstack position & size
    x: Mapped[int] = mapped_column(default=0)
    y: Mapped[int] = mapped_column(default=0)
    w: Mapped[int] = mapped_column(default=3)  # width in columns
    h: Mapped[int] = mapped_column(default=2)  # height in rows

    # Configuration spécifique à cette instance
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # Override de default_config

    # Metadata
    is_visible: Mapped[bool] = mapped_column(default=True)
    order: Mapped[int] = mapped_column(default=0)

    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    # Relations
    dashboard: Mapped["Dashboard"] = relationship(back_populates="widgets")
    widget: Mapped["Widget"] = relationship(back_populates="dashboard_widgets")

    __table_args__ = (
        UniqueConstraint('dashboard_id', 'widget_id', name='unique_dashboard_widget'),
    )
```

### 4. UserDashboard (User Preferences)

```python
class UserDashboard(Base):
    __tablename__ = "user_dashboards"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    dashboard_id: Mapped[int] = mapped_column(ForeignKey("dashboards.id", ondelete="CASCADE"))

    # User-specific settings
    is_pinned: Mapped[bool] = mapped_column(default=False)
    is_favorite: Mapped[bool] = mapped_column(default=False)
    is_default: Mapped[bool] = mapped_column(default=False)  # Dashboard par défaut de l'utilisateur
    order: Mapped[int] = mapped_column(default=0)

    # Override layout (si l'utilisateur personnalise un dashboard partagé)
    custom_layout: Mapped[Optional[dict]] = mapped_column(JSON)

    last_viewed_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(default=func.now())

    # Relations
    user: Mapped["User"] = relationship(back_populates="user_dashboards")
    dashboard: Mapped["Dashboard"] = relationship()

    __table_args__ = (
        UniqueConstraint('user_id', 'dashboard_id', name='unique_user_dashboard'),
    )
```

---

## 🔌 API Backend

### Endpoints Dashboards

#### GET /api/v1/dashboards
**Description**: Liste tous les dashboards accessibles par l'utilisateur
```json
{
  "my_dashboards": [...],  // Dashboards créés par l'utilisateur
  "mandatory_dashboards": [...],  // Dashboards obligatoires
  "shared_dashboards": [...]  // Dashboards partagés
}
```

#### POST /api/v1/dashboards
**Description**: Créer un nouveau dashboard
```json
{
  "name": "Mon Dashboard",
  "description": "Description",
  "layout_config": {"column": 12, "cellHeight": 70},
  "is_public": false,
  "widgets": [
    {
      "widget_id": 1,
      "x": 0, "y": 0, "w": 3, "h": 2,
      "config": {}
    }
  ]
}
```

#### GET /api/v1/dashboards/{id}
**Description**: Récupérer un dashboard spécifique avec tous ses widgets

#### PUT /api/v1/dashboards/{id}
**Description**: Mettre à jour un dashboard (nom, description, widgets)

#### PUT /api/v1/dashboards/{id}/layout
**Description**: Mettre à jour uniquement le layout (positions des widgets)
```json
{
  "widgets": [
    {"id": 1, "x": 0, "y": 0, "w": 3, "h": 2},
    {"id": 2, "x": 3, "y": 0, "w": 3, "h": 2}
  ]
}
```

#### DELETE /api/v1/dashboards/{id}
**Description**: Supprimer un dashboard (interdit si mandatory=True)

#### POST /api/v1/dashboards/{id}/clone
**Description**: Cloner un dashboard existant

#### POST /api/v1/dashboards/{id}/widgets
**Description**: Ajouter un widget au dashboard

#### DELETE /api/v1/dashboards/{id}/widgets/{widget_id}
**Description**: Retirer un widget du dashboard

---

### Endpoints Widgets

#### GET /api/v1/widgets
**Description**: Liste tous les widgets disponibles (filtrés par permissions)
```json
{
  "widgets": [
    {
      "id": 1,
      "widget_type": "stats_card",
      "name": "Carte de Statistiques",
      "description": "Affiche une stat avec icône",
      "module_name": "core",
      "category": "analytics",
      "default_size": {"w": 3, "h": 2, "minW": 2, "maxW": 6},
      "required_permission": null
    }
  ]
}
```

#### GET /api/v1/widgets/{id}
**Description**: Détails d'un widget spécifique

#### POST /api/v1/widgets (Admin only)
**Description**: Créer un nouveau type de widget

#### PUT /api/v1/widgets/{id} (Admin only)
**Description**: Mettre à jour un widget

---

### Endpoints Admin (Dashboards Obligatoires)

#### POST /api/v1/admin/dashboards/mandatory
**Description**: Créer un dashboard obligatoire
```json
{
  "name": "Dashboard RH",
  "scope": "group",  // 'global', 'group', 'role', 'user'
  "scope_id": 5,  // ID du groupe
  "widgets": [...]
}
```

#### GET /api/v1/admin/dashboards/mandatory
**Description**: Liste tous les dashboards obligatoires

---

## 🎨 Frontend Implementation

### 1. Structure des Composants

```
frontend/src/app/(dashboard)/
├── dashboards/
│   ├── page.tsx                          # Liste des dashboards
│   ├── [id]/
│   │   ├── page.tsx                      # Vue d'un dashboard
│   │   └── edit/
│   │       └── page.tsx                  # Édition d'un dashboard
│   └── components/
│       ├── dashboard-grid.tsx            # Wrapper Gridstack
│       ├── dashboard-sidebar.tsx         # Sidebar avec liste de widgets
│       ├── dashboard-toolbar.tsx         # Actions (save, add widget, etc.)
│       └── widget-placeholder.tsx        # Placeholder pour drag & drop
│
└── widgets/
    ├── registry.ts                       # Registry de tous les widgets
    ├── base/
    │   └── widget-wrapper.tsx            # Wrapper générique pour widgets
    ├── core/
    │   ├── stats-card.tsx
    │   ├── chart-line.tsx
    │   ├── chart-bar.tsx
    │   ├── recent-activity.tsx
    │   └── notifications-list.tsx
    └── [module]/
        └── [custom-widgets].tsx
```

### 2. Gridstack Integration

#### Installation
```bash
npm install gridstack
npm install --save-dev @types/gridstack
```

#### DashboardGrid Component
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import { DashboardWidget } from '@/types/dashboard'
import WidgetWrapper from '@/app/widgets/base/widget-wrapper'

interface Props {
  widgets: DashboardWidget[]
  isEditMode: boolean
  onLayoutChange?: (widgets: DashboardWidget[]) => void
}

export function DashboardGrid({ widgets, isEditMode, onLayoutChange }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const gridInstanceRef = useRef<GridStack | null>(null)

  useEffect(() => {
    if (!gridRef.current) return

    // Initialize GridStack
    const grid = GridStack.init({
      column: 12,
      cellHeight: 70,
      margin: 10,
      float: true,
      resizable: {
        handles: 'e, se, s, sw, w'
      },
      removable: false,
      acceptWidgets: true,
      disableOneColumnMode: false,
      staticGrid: !isEditMode
    }, gridRef.current)

    gridInstanceRef.current = grid

    // Listen to layout changes
    if (isEditMode && onLayoutChange) {
      grid.on('change', () => {
        const items = grid.save(false) as any[]
        const updatedWidgets = items.map(item => ({
          id: parseInt(item.id),
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h
        }))
        onLayoutChange(updatedWidgets)
      })
    }

    return () => {
      grid.destroy(false)
    }
  }, [isEditMode, onLayoutChange])

  return (
    <div ref={gridRef} className="grid-stack">
      {widgets.map(widget => (
        <div
          key={widget.id}
          className="grid-stack-item"
          gs-id={widget.id}
          gs-x={widget.x}
          gs-y={widget.y}
          gs-w={widget.w}
          gs-h={widget.h}
        >
          <div className="grid-stack-item-content">
            <WidgetWrapper widget={widget} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 3. Widget Registry

```typescript
// frontend/src/app/widgets/registry.ts

import { ComponentType } from 'react'
import StatsCard from './core/stats-card'
import ChartLine from './core/chart-line'
import ChartBar from './core/chart-bar'
// ... autres imports

export interface WidgetComponent {
  type: string
  component: ComponentType<any>
  name: string
  description: string
  category: string
  icon: string
  defaultConfig: Record<string, any>
}

export const WIDGET_REGISTRY: Record<string, WidgetComponent> = {
  'stats_card': {
    type: 'stats_card',
    component: StatsCard,
    name: 'Carte de Statistiques',
    description: 'Affiche une statistique avec icône et tendance',
    category: 'analytics',
    icon: 'chart-bar',
    defaultConfig: {
      title: 'Statistique',
      value: 0,
      trend: 0
    }
  },
  'chart_line': {
    type: 'chart_line',
    component: ChartLine,
    name: 'Graphique en Ligne',
    description: 'Graphique temporel avec plusieurs séries',
    category: 'charts',
    icon: 'chart-line',
    defaultConfig: {
      title: 'Tendance',
      timeRange: '7d'
    }
  },
  // ... autres widgets
}

export function getWidgetComponent(type: string): ComponentType<any> | null {
  return WIDGET_REGISTRY[type]?.component || null
}

export function getWidgetsByCategory(category?: string): WidgetComponent[] {
  const widgets = Object.values(WIDGET_REGISTRY)
  return category
    ? widgets.filter(w => w.category === category)
    : widgets
}
```

### 4. Widget Wrapper

```typescript
// frontend/src/app/widgets/base/widget-wrapper.tsx

'use client'

import { DashboardWidget } from '@/types/dashboard'
import { getWidgetComponent } from '../registry'
import { Card } from '@/components/ui/card'
import { IconGripVertical, IconSettings, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

interface Props {
  widget: DashboardWidget
  isEditMode?: boolean
  onRemove?: (id: number) => void
  onConfigure?: (id: number) => void
}

export default function WidgetWrapper({
  widget,
  isEditMode = false,
  onRemove,
  onConfigure
}: Props) {
  const WidgetComponent = getWidgetComponent(widget.widget_type)

  if (!WidgetComponent) {
    return <div>Widget non trouvé: {widget.widget_type}</div>
  }

  return (
    <Card className="h-full flex flex-col">
      {isEditMode && (
        <div className="flex items-center justify-between p-2 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <IconGripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
            <span className="text-xs font-medium">{widget.name}</span>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onConfigure?.(widget.id)}
            >
              <IconSettings className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onRemove?.(widget.id)}
            >
              <IconX className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <WidgetComponent config={widget.config} />
      </div>
    </Card>
  )
}
```

---

## 🔐 Système de Permissions

### Logique de Visibilité des Dashboards

```python
def get_user_dashboards(user_id: int, db: Session) -> list[Dashboard]:
    """
    Retourne tous les dashboards accessibles par l'utilisateur:
    1. Dashboards créés par l'utilisateur
    2. Dashboards obligatoires globaux
    3. Dashboards obligatoires pour les groupes de l'utilisateur
    4. Dashboards obligatoires pour les rôles de l'utilisateur
    5. Dashboards obligatoires ciblant spécifiquement l'utilisateur
    6. Dashboards publics partagés
    """
    user = db.query(User).filter(User.id == user_id).first()

    dashboards = []

    # 1. Dashboards de l'utilisateur
    dashboards.extend(
        db.query(Dashboard)
        .filter(Dashboard.created_by_id == user_id)
        .all()
    )

    # 2. Dashboards obligatoires globaux
    dashboards.extend(
        db.query(Dashboard)
        .filter(
            Dashboard.is_mandatory == True,
            Dashboard.scope == 'global'
        )
        .all()
    )

    # 3. Dashboards pour les groupes de l'utilisateur
    user_group_ids = [g.id for g in user.groups]
    dashboards.extend(
        db.query(Dashboard)
        .filter(
            Dashboard.is_mandatory == True,
            Dashboard.scope == 'group',
            Dashboard.scope_id.in_(user_group_ids)
        )
        .all()
    )

    # 4. Dashboards pour les rôles de l'utilisateur
    user_role_ids = [r.id for r in user.roles]
    dashboards.extend(
        db.query(Dashboard)
        .filter(
            Dashboard.is_mandatory == True,
            Dashboard.scope == 'role',
            Dashboard.scope_id.in_(user_role_ids)
        )
        .all()
    )

    # 5. Dashboards ciblant l'utilisateur
    dashboards.extend(
        db.query(Dashboard)
        .filter(
            Dashboard.is_mandatory == True,
            Dashboard.scope == 'user',
            Dashboard.scope_id == user_id
        )
        .all()
    )

    # 6. Dashboards publics
    dashboards.extend(
        db.query(Dashboard)
        .filter(
            Dashboard.is_public == True,
            Dashboard.created_by_id != user_id
        )
        .all()
    )

    # Dédupliquer
    return list({d.id: d for d in dashboards}.values())
```

---

## 📦 Système de Widgets Modulaire

### Enregistrement de Widgets par les Modules

Chaque module peut enregistrer ses propres widgets dans la base de données via un système de plugins.

#### Structure d'un Module

```
modules/
├── core/
│   └── widgets/
│       ├── __init__.py
│       ├── stats_card.py
│       ├── chart_line.py
│       └── recent_activity.py
│
├── hse/
│   └── widgets/
│       ├── __init__.py
│       ├── accident_stats.py
│       └── safety_alerts.py
│
└── warehouse/
    └── widgets/
        ├── __init__.py
        ├── stock_levels.py
        └── pending_orders.py
```

#### Widget Registration

```python
# modules/core/widgets/stats_card.py

from backend.app.core.widgets import WidgetPlugin

class StatsCardWidget(WidgetPlugin):
    widget_type = "stats_card"
    name = "Carte de Statistiques"
    description = "Affiche une statistique avec icône et tendance"
    module_name = "core"
    category = "analytics"
    icon = "chart-bar"

    default_config = {
        "title": "Statistique",
        "value": 0,
        "trend": 0,
        "icon": "trending-up"
    }

    default_size = {
        "w": 3,
        "h": 2,
        "minW": 2,
        "minH": 2,
        "maxW": 6,
        "maxH": 4
    }

    async def fetch_data(self, config: dict, user_id: int) -> dict:
        """
        Logique pour récupérer les données du widget.
        Appelé par l'API pour obtenir les données à jour.
        """
        # Exemple: récupérer le nombre d'utilisateurs actifs
        if config.get("metric") == "active_users":
            count = await get_active_users_count()
            return {
                "title": "Utilisateurs Actifs",
                "value": count,
                "trend": calculate_trend(count, period="7d")
            }
        return {}
```

#### Auto-Registration au Démarrage

```python
# backend/app/core/widgets/registry.py

from typing import Dict, Type
from backend.app.models import Widget
from sqlalchemy.orm import Session

class WidgetRegistry:
    _widgets: Dict[str, Type[WidgetPlugin]] = {}

    @classmethod
    def register(cls, widget_class: Type[WidgetPlugin]):
        """Enregistre un widget dans le registry"""
        cls._widgets[widget_class.widget_type] = widget_class

    @classmethod
    async def sync_to_database(cls, db: Session):
        """Synchronise tous les widgets enregistrés vers la DB"""
        for widget_type, widget_class in cls._widgets.items():
            existing = db.query(Widget).filter(
                Widget.widget_type == widget_type
            ).first()

            if not existing:
                widget = Widget(
                    widget_type=widget_class.widget_type,
                    name=widget_class.name,
                    description=widget_class.description,
                    module_name=widget_class.module_name,
                    category=widget_class.category,
                    icon=widget_class.icon,
                    default_config=widget_class.default_config,
                    default_size=widget_class.default_size
                )
                db.add(widget)

        db.commit()

# Auto-register au startup
from modules.core.widgets import *
from modules.hse.widgets import *
# ...
```

---

## 📅 Plan d'Implémentation par Phases

### Phase 1: Infrastructure de Base (5-7 jours)

**Backend:**
- [ ] Créer les modèles SQLAlchemy (Dashboard, Widget, DashboardWidget, UserDashboard)
- [ ] Migrations Alembic
- [ ] Endpoints API CRUD pour dashboards
- [ ] Endpoints API pour widgets
- [ ] Service de permissions pour dashboards

**Frontend:**
- [ ] Installation et configuration de gridstack.js
- [ ] Composant DashboardGrid de base
- [ ] Widget Registry
- [ ] WidgetWrapper générique
- [ ] Page de liste des dashboards

**Livrables:**
- ✅ CRUD complet des dashboards
- ✅ Système de grille fonctionnel
- ✅ 2-3 widgets de démonstration (StatsCard, ChartLine)

---

### Phase 2: Widgets Core & Personnalisation (5-7 jours)

**Backend:**
- [ ] Système de plugins pour widgets
- [ ] Auto-registration des widgets au startup
- [ ] Endpoints pour récupération de données des widgets
- [ ] Cache Redis pour données de widgets

**Frontend:**
- [ ] 8-10 widgets du module core:
  - Stats Card
  - Line Chart
  - Bar Chart
  - Pie Chart
  - Recent Activity
  - Notifications List
  - User Stats
  - Task Summary
- [ ] Composant de configuration de widgets (modal)
- [ ] Drag & drop de widgets depuis sidebar
- [ ] Sauvegarde automatique du layout

**Livrables:**
- ✅ Bibliothèque de widgets core complète
- ✅ Interface d'édition drag & drop
- ✅ Sauvegarde automatique

---

### Phase 3: Dashboards Obligatoires & Admin (4-5 jours)

**Backend:**
- [ ] Endpoints admin pour dashboards obligatoires
- [ ] Logique de scope (global, group, role, user)
- [ ] API pour duplication de dashboards
- [ ] Validation des permissions

**Frontend:**
- [ ] Interface admin de création de dashboards obligatoires
- [ ] Sélecteur de scope (global/group/role/user)
- [ ] Prévisualisation de dashboards
- [ ] Indicateurs visuels pour dashboards obligatoires (non supprimables)

**Livrables:**
- ✅ Système complet de dashboards obligatoires
- ✅ Interface admin dédiée
- ✅ Gestion des scopes

---

### Phase 4: Optimisations & Polish (3-4 jours)

**Backend:**
- [ ] Cache Redis pour layouts fréquents
- [ ] Optimisation des requêtes (eager loading)
- [ ] Tests unitaires et d'intégration
- [ ] Documentation API

**Frontend:**
- [ ] Responsive design (breakpoints mobile/tablet)
- [ ] Loading states et skeletons
- [ ] Animations et transitions
- [ ] Mode plein écran pour dashboards
- [ ] Export/Import de dashboards (JSON)
- [ ] Thème sombre pour widgets

**Livrables:**
- ✅ Application optimisée et performante
- ✅ Expérience utilisateur polie
- ✅ Tests et documentation

---

### Phase 5: Widgets Modules Spécifiques (Variable)

**Par module:**
- [ ] Identifier les widgets pertinents pour chaque module
- [ ] Développer les widgets spécifiques
- [ ] Enregistrer dans le registry
- [ ] Tests

**Exemples:**
- **Module HSE:**
  - Widget d'alertes de sécurité
  - Widget de statistiques d'accidents
  - Widget de conformité

- **Module Warehouse:**
  - Widget de niveaux de stock
  - Widget de commandes en attente
  - Widget de mouvements récents

---

## ⏱️ Estimation Totale

| Phase | Durée | Complexité |
|-------|-------|------------|
| Phase 1: Infrastructure | 5-7 jours | Moyenne |
| Phase 2: Widgets Core | 5-7 jours | Moyenne-Haute |
| Phase 3: Dashboards Obligatoires | 4-5 jours | Moyenne |
| Phase 4: Optimisations | 3-4 jours | Faible-Moyenne |
| Phase 5: Widgets Modules | Variable | Variable |

**Total Phase 1-4:** 17-23 jours de développement (3-4 semaines)
**Phase 5:** Développement continu selon les besoins des modules

---

## 🎯 Prochaines Étapes

1. **Validation du plan** avec l'équipe
2. **Priorisation** des phases
3. **Design UI/UX** pour les interfaces dashboard
4. **Maquettes** pour les principaux widgets
5. **Démarrage Phase 1** avec création des modèles

---

## 📚 Ressources

- [Gridstack.js Documentation](https://github.com/gridstack/gridstack.js)
- [Gridstack React Examples](https://github.com/gridstack/gridstack.js/tree/master/demo)
- [Dashboard Design Patterns](https://www.nngroup.com/articles/dashboard-design/)
