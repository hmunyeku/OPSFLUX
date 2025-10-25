# Intégration des Dashboards dans les Menus

Ce document explique comment afficher des dashboards personnalisés dans les menus de la sidebar avec un système de tabs.

## Fonctionnalités

✅ **Affectation de dashboards aux menus** : Chaque dashboard peut être assigné à un menu via le champ `menu_key`
✅ **Système de tabs** : Si plusieurs dashboards partagent le même `menu_key`, ils s'affichent en tabs
✅ **Dashboard par défaut** : Le champ `is_default_in_menu` indique quel dashboard afficher par défaut
✅ **Tri automatique** : Les dashboards sont triés avec le dashboard par défaut en premier

## Structure de la base de données

### Nouveaux champs dans la table `dashboard`

```sql
menu_key VARCHAR(100) NULL          -- Clé du menu (ex: "hse", "warehouse", "production")
is_default_in_menu BOOLEAN DEFAULT false  -- Dashboard par défaut dans son menu
```

### Index créé

```sql
CREATE INDEX ix_dashboard_menu_key ON dashboard(menu_key);
```

## Configuration Backend

### Modèle Dashboard

```python
class Dashboard(AbstractBaseModel, DashboardBase, table=True):
    menu_key: Optional[str] = Field(default=None, max_length=100)
    is_default_in_menu: bool = Field(default=False)
```

### Route API

```
GET /api/v1/dashboards/menu/{menu_key}
```

Retourne tous les dashboards accessibles par l'utilisateur pour un menu donné, triés avec le dashboard par défaut en premier.

## Configuration Frontend

### 1. Créer des dashboards avec menu_key

```typescript
const dashboard: DashboardCreate = {
  name: "Dashboard HSE Principal",
  description: "Vue d'ensemble de la santé et sécurité",
  menu_key: "hse",  // Clé du menu
  is_default_in_menu: true,  // Dashboard par défaut
  is_active: true,
  widgets: [...]
}
```

### 2. Lier le menu au dashboard

Dans `frontend/src/components/layout/data/sidebar-data.tsx`:

```typescript
export const sidebarData = [
  {
    title: "HSE",
    icon: <IconShieldCheck />,
    // Option 1: Lien vers la page des dashboards du menu
    href: "/dashboards/menu/hse",

    // Option 2: Sous-menus avec dashboards
    items: [
      {
        title: "Vue d'ensemble",
        href: "/dashboards/menu/hse-overview",
        icon: <IconChartBar />
      },
      {
        title: "Incidents",
        href: "/dashboards/menu/hse-incidents",
        icon: <IconAlertTriangle />
      }
    ]
  }
]
```

### 3. Page d'affichage

La page `/dashboards/menu/[menuKey]` :
- Affiche un seul dashboard si `menu_key` n'a qu'un dashboard
- Affiche plusieurs tabs si plusieurs dashboards partagent le même `menu_key`
- Sélectionne automatiquement le dashboard marqué comme `is_default_in_menu`

## Exemples d'utilisation

### Exemple 1 : Menu HSE avec 3 dashboards

```typescript
// Dashboard 1 - Vue d'ensemble (par défaut)
{
  name: "Vue d'ensemble HSE",
  menu_key: "hse",
  is_default_in_menu: true,
  order: 0
}

// Dashboard 2 - Incidents
{
  name: "Suivi des Incidents",
  menu_key: "hse",
  is_default_in_menu: false,
  order: 1
}

// Dashboard 3 - Audits
{
  name: "Audits & Inspections",
  menu_key: "hse",
  is_default_in_menu: false,
  order: 2
}
```

Résultat : 3 tabs affichés, "Vue d'ensemble HSE" sélectionné par défaut.

### Exemple 2 : Menu Warehouse avec dashboard unique

```typescript
{
  name: "Gestion Entrepôt",
  menu_key: "warehouse",
  is_default_in_menu: true
}
```

Résultat : Dashboard affiché directement, pas de tabs.

## Scripts d'administration

### Créer les dashboards pour un menu

```python
# backend/scripts/create_menu_dashboards.py
from app.models_dashboard import Dashboard, DashboardWidget

dashboards_config = [
    {
        "name": "Vue HSE Globale",
        "menu_key": "hse",
        "is_default_in_menu": True,
        "is_mandatory": True,
        "scope": "global",
        "widgets": [...]
    },
    {
        "name": "Incidents HSE",
        "menu_key": "hse",
        "is_default_in_menu": False,
        "order": 1,
        "widgets": [...]
    }
]
```

### Mettre à jour un dashboard existant

```python
dashboard.menu_key = "hse"
dashboard.is_default_in_menu = True
session.commit()
```

## Routes disponibles

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/v1/dashboards` | Liste tous les dashboards de l'utilisateur |
| GET | `/api/v1/dashboards/menu/{menu_key}` | Dashboards d'un menu spécifique |
| GET | `/api/v1/dashboards/{id}` | Détails d'un dashboard |
| POST | `/api/v1/dashboards` | Créer un dashboard |
| PATCH | `/api/v1/dashboards/{id}` | Mettre à jour un dashboard |

## Permissions

- **Lecture** : `dashboards.read` - Voir les dashboards
- **Création** : `dashboards.create` - Créer des dashboards
- **Modification** : `dashboards.update` - Modifier des dashboards
- **Suppression** : `dashboards.delete` - Supprimer des dashboards

Note : Les dashboards obligatoires (`is_mandatory=true`) ne peuvent pas être supprimés par les utilisateurs.

## Exemple complet

Voir le fichier `backend/scripts/create_default_dashboard.py` pour un exemple complet de création de dashboard avec widgets.

Pour créer des dashboards de menu :

```bash
docker exec backend python scripts/create_hse_dashboards.py
```

## Migration

Pour ajouter les nouveaux champs à la base de données existante :

```bash
docker exec backend python scripts/add_dashboard_menu_fields.py
```
