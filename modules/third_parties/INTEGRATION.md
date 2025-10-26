# Third Parties Module - Guide d'Intégration

Ce document explique comment le module Third Parties s'intègre dans l'application OpsFlux.

## Architecture Modulaire

Le module Third Parties suit l'architecture modulaire d'OpsFlux où **tout reste dans le dossier du module**.

```
/code/
├── backend/          # Backend principal
├── frontend/         # Frontend principal
└── modules/          # Tous les modules
    └── third-parties/
        ├── backend/
        │   ├── __init__.py
        │   ├── models.py       # Modèles SQLModel
        │   └── routes.py       # Routes API FastAPI
        └── frontend/
            ├── api.ts          # Client API TypeScript
            ├── types/          # Types TypeScript
            ├── widgets/        # Widgets React
            │   ├── registry.ts # Définition des widgets
            │   └── *.tsx       # Composants widgets
            └── index.ts        # Point d'entrée du module
```

## Intégration Backend

### 1. Chargement Automatique via ModuleLoader

Le `ModuleLoader` (`backend/app/core/module_loader.py`) charge automatiquement :
- Les **modèles** (tables de base de données)
- Les **routes API** (endpoints FastAPI)

**Fichier**: `backend/app/main.py`
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Charger les modules activés au démarrage
    loaded = ModuleLoader.load_active_modules(session, app=app)
    yield
```

### 2. Routes API

Les routes du module sont définies dans `/modules/third-parties/backend/routes.py` :

```python
router = APIRouter(prefix="/third-parties", tags=["third-parties"])

@router.get("/companies", response_model=CompaniesPublic)
@require_permission("companies.read")
def read_companies(...):
    # ...
```

Le router est automatiquement enregistré dans FastAPI au démarrage.

### 3. Modèles de Données

Les modèles SQLModel sont définis dans `/modules/third-parties/backend/models.py` :

```python
class Company(AbstractBaseModel, CompanyBase, table=True):
    __tablename__ = "company"
    # ...

class Contact(AbstractBaseModel, ContactBase, table=True):
    __tablename__ = "contact"
    # ...
```

Les tables sont créées automatiquement via les migrations Alembic.

## Intégration Frontend

### 1. Chargement Automatique des Widgets

Le système de chargement des widgets fonctionne en 3 étapes :

#### Étape 1: Définition des Widgets
**Fichier**: `/modules/third-parties/frontend/widgets/registry.ts`

```typescript
export const THIRD_PARTIES_WIDGETS: WidgetComponent[] = [
  {
    type: "third_parties_stats_overview",
    component: ThirdPartiesStatsOverview,
    name: "Aperçu Statistiques Tiers",
    // ...
  },
  // ... 7 autres widgets
]
```

#### Étape 2: Module Loader Frontend
**Fichier**: `/frontend/src/lib/module-loader.ts`

```typescript
export function initializeModuleWidgets(): void {
  const thirdPartiesWidgets = require("../../../../modules/third-parties/frontend/widgets/registry").default
  registerWidgets(thirdPartiesWidgets)
}
```

#### Étape 3: Initialisation au Démarrage
**Fichier**: `/frontend/src/app/providers.tsx`

```typescript
export function Providers({ children }: Props) {
  useEffect(() => {
    initializeModuleWidgets() // ← Charge tous les widgets des modules
  }, [])
  // ...
}
```

### 2. Widgets Disponibles

8 widgets sont disponibles pour le module Third Parties :

| Widget | Type | Catégorie | Description |
|--------|------|-----------|-------------|
| Stats Overview | `third_parties_stats_overview` | stats | Statistiques globales |
| Companies by Type | `third_parties_companies_by_type` | charts | Répartition par type |
| Companies by Status | `third_parties_companies_by_status` | charts | Répartition par statut |
| Recent Companies | `third_parties_recent_companies` | lists | Entreprises récentes |
| Recent Contacts | `third_parties_recent_contacts` | lists | Contacts récents |
| Pending Invitations | `third_parties_pending_invitations` | notifications | Invitations en attente |
| Contacts Evolution | `third_parties_contacts_evolution` | charts | Évolution temporelle |
| Top Companies | `third_parties_top_companies` | analytics | Classement entreprises |

### 3. Utilisation dans les Dashboards

Une fois enregistrés, les widgets sont automatiquement disponibles dans :
- Le widget picker des dashboards personnalisables
- Le panneau de configuration des widgets
- Les layouts de dashboard prédéfinis

## Configuration du Module

### Manifest.json

Le fichier `/modules/third-parties/manifest.json` définit :
- **Permissions** : 11 permissions (companies.*, contacts.*)
- **Menu Items** : 4 items de navigation
- **Hooks** : 5 hooks pour les événements
- **Widgets** : 8 définitions de widgets
- **Settings** : 4 paramètres globaux
- **User Preferences** : 3 préférences utilisateur

### Activation du Module

Le module peut être activé/désactivé via :
- L'interface d'administration : Settings → Modules
- L'API : `POST /api/v1/modules/install` avec `{"code": "third_parties"}`

## Hot Reload

Le système supporte le hot reload :
- **Backend** : Les routes peuvent être rechargées sans redémarrer
- **Frontend** : Les widgets sont chargés dynamiquement

Pour recharger un module :
```python
# Décharger
ModuleLoader.unload_module_router("third_parties", app)

# Recharger
ModuleLoader.load_module_router("third_parties", app)
```

## Ajouter un Nouveau Module

Pour créer un nouveau module suivant le même pattern :

### 1. Structure du Module
```
/modules/mon-module/
├── manifest.json
├── README.md
├── backend/
│   ├── __init__.py
│   ├── models.py
│   └── routes.py
└── frontend/
    ├── index.ts
    ├── api.ts
    ├── types/
    └── widgets/
        ├── registry.ts
        └── *.tsx
```

### 2. Ajouter au Module Loader

**Backend** : Le module sera automatiquement découvert s'il est dans `/modules/` et a un `manifest.json` valide.

**Frontend** : Ajouter dans `/frontend/src/lib/module-loader.ts` :

```typescript
export function initializeModuleWidgets(): void {
  // Third Parties
  const thirdPartiesWidgets = require("../../../../modules/third-parties/frontend/widgets/registry").default
  registerWidgets(thirdPartiesWidgets)

  // Nouveau module
  const monModuleWidgets = require("../../../../modules/mon-module/frontend/widgets/registry").default
  registerWidgets(monModuleWidgets)
}
```

### 3. Créer le Widget Registry

**Fichier** : `/modules/mon-module/frontend/widgets/registry.ts`

```typescript
import type { WidgetComponent } from "@/widgets/registry"
import MonWidget from "./mon-widget"

export const MON_MODULE_WIDGETS: WidgetComponent[] = [
  {
    type: "mon_module_mon_widget",
    component: MonWidget,
    name: "Mon Widget",
    description: "Description du widget",
    category: "stats",
    icon: "chart-bar",
    defaultConfig: {},
    defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
  },
]

export default MON_MODULE_WIDGETS
```

## Bonnes Pratiques

### Backend
1. ✅ Utiliser `AbstractBaseModel` pour tous les modèles
2. ✅ Définir les permissions avec `@require_permission()`
3. ✅ Utiliser le soft delete (deleted_at) au lieu de DELETE
4. ✅ Ajouter des filtres de recherche sur les endpoints list
5. ✅ Documenter les endpoints avec docstrings

### Frontend
1. ✅ Tous les widgets doivent être "use client"
2. ✅ Gérer les états loading et error
3. ✅ Typer toutes les props avec TypeScript
4. ✅ Utiliser les composants Shadcn UI
5. ✅ Respecter les design patterns du registry
6. ✅ Utiliser le système de permissions

## Dépannage

### Les widgets ne s'affichent pas

Vérifier :
1. Le fichier `registry.ts` exporte bien un tableau par défaut
2. Le module loader importe le bon chemin
3. La fonction `initializeModuleWidgets()` est appelée
4. La console du navigateur pour voir les erreurs

### Erreur d'import des widgets

```
Error: Cannot find module '../../../../modules/...'
```

Solution : Vérifier que le chemin relatif est correct depuis `/frontend/src/lib/`

### Les routes API ne sont pas chargées

Vérifier :
1. Le module est activé dans la base de données
2. Le fichier `routes.py` exporte bien un `router`
3. Le ModuleLoader est appelé dans `main.py`
4. Les logs du backend au démarrage

## Support

Pour toute question :
- Documentation : `/modules/third-parties/README.md`
- Widgets : `/modules/third-parties/frontend/widgets/README.md`
- API : Voir les docstrings dans `routes.py`
