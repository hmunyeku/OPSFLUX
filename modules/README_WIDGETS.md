# Système de Widgets pour Modules

## Vue d'ensemble

Le système de widgets permet aux modules d'ajouter des widgets personnalisés qui peuvent être utilisés dans les dashboards. Les widgets sont **synchronisés automatiquement** entre le frontend et le backend lors du chargement des modules.

## Architecture

### 1. Définition des Widgets (Frontend)

Les widgets sont définis dans le fichier `frontend/widgets/registry.ts` du module :

```typescript
// modules/mon-module/frontend/widgets/registry.ts
import type { WidgetComponent } from "@/widgets/registry"
import MonWidget from "./mon-widget"

export const MES_WIDGETS: WidgetComponent[] = [
  {
    type: "mon_module_mon_widget",
    component: MonWidget,
    name: "Mon Widget",
    description: "Description du widget",
    category: "stats",
    icon: "chart-bar",
    requiredPermission: "mon_module:read",  // Permission requise
    defaultConfig: {
      title: "Mon Widget",
      refreshInterval: 60000
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 4
    }
  }
]
```

### 2. Configuration du Module (Frontend)

Le module exporte ses widgets via `module.config.ts` :

```typescript
// modules/mon-module/frontend/module.config.ts
import type { Module } from "@/lib/types/module"
import { MES_WIDGETS } from "./widgets/registry"

export const MonModule: Module = {
  config: {
    code: "mon-module",
    name: "Mon Module",
    version: "1.0.0",
    description: "Description du module"
  },
  widgets: MES_WIDGETS,  // Export des widgets
}

export default MonModule
```

### 3. Synchronisation Backend

Pour que les widgets soient disponibles dans les dashboards, ils doivent être synchronisés avec la base de données backend. **Cela se fait automatiquement** lors du chargement du module.

#### Option 1 : Synchronisation Automatique (Recommandé)

Créez un fichier `widgets.json` dans `modules/mon-module/backend/` :

```json
[
  {
    "widget_type": "mon_module_mon_widget",
    "name": "Mon Widget",
    "description": "Description du widget",
    "module_name": "mon-module",
    "category": "stats",
    "icon": "chart-bar",
    "required_permission": "mon_module:read",
    "is_active": true,
    "default_config": {
      "title": "Mon Widget",
      "refreshInterval": 60000
    },
    "default_size": {
      "w": 4,
      "h": 3,
      "minW": 3,
      "minH": 2,
      "maxW": 6,
      "maxH": 4
    }
  }
]
```

**Le ModuleLoader backend va automatiquement** :
1. Lire ce fichier lors du chargement du module
2. Créer ou mettre à jour les widgets dans la table `widget`
3. Appliquer les permissions définies

#### Option 2 : Script Manuel

Si vous préférez enregistrer manuellement les widgets :

```bash
docker exec -it opsflux-backend python backend/scripts/register_module_widgets.py mon-module
```

## Permissions et Sécurité

### Définir une Permission Requise

```json
{
  "widget_type": "mon_module_widget_sensible",
  "name": "Widget Sensible",
  "required_permission": "mon_module:admin",
  ...
}
```

### Comportement avec Permissions

**Utilisateurs SANS la permission** :
- ❌ Ne voient pas le widget dans le catalogue
- ❌ Ne peuvent pas l'ajouter à leurs dashboards
- ❌ Ne peuvent pas importer un dashboard JSON contenant ce widget

**Utilisateurs AVEC la permission** :
- ✅ Voient le widget dans le catalogue
- ✅ Peuvent l'ajouter à leurs dashboards
- ✅ Peuvent le configurer dans leurs dashboards

## Workflow Complet

### 1. Développement du Widget

```bash
modules/mon-module/
├── frontend/
│   └── widgets/
│       ├── registry.ts        # Définition des widgets
│       └── mon-widget.tsx     # Composant React
└── backend/
    └── widgets.json           # Configuration backend (AUTO-SYNC)
```

### 2. Enregistrement du Module

```bash
# Le module doit être enregistré dans la base de données
docker exec -it opsflux-backend python modules/mon-module/backend/register.py
```

### 3. Activation du Module

Via l'interface admin ou directement en base :

```sql
UPDATE module SET status = 'active' WHERE code = 'mon-module';
```

### 4. Chargement Automatique

Au démarrage du backend (ou via hot reload) :

1. **Backend** :
   - Le `ModuleLoader` charge les modules actifs
   - Lit `backend/widgets.json`
   - Synchronise les widgets dans la table `widget`
   - Applique les permissions

2. **Frontend** :
   - Le `ModuleLoader` charge les modules actifs
   - Import dynamique de `module.config.ts`
   - Enregistre les widgets dans le registry global
   - Les widgets sont immédiatement disponibles

## Mise à Jour des Widgets

### Modifier un Widget Existant

1. Modifier `frontend/widgets/registry.ts` (code React)
2. Modifier `backend/widgets.json` (métadonnées)
3. Redémarrer le backend ou attendre le hot reload

Le widget sera automatiquement mis à jour dans la base de données.

### Ajouter une Permission à un Widget

```json
{
  "widget_type": "mon_module_widget",
  "required_permission": "mon_module:read"  // Ajouter cette ligne
}
```

Après synchronisation :
- Les utilisateurs sans permission ne verront plus le widget
- Les instances existantes dans les dashboards restent fonctionnelles

### Désactiver un Widget

```json
{
  "widget_type": "mon_module_widget",
  "is_active": false  // Désactiver
}
```

Le widget disparaît du catalogue mais les instances existantes continuent de fonctionner.

## Debugging

### Vérifier les Widgets Enregistrés

```sql
SELECT widget_type, name, module_name, required_permission, is_active
FROM widget
WHERE module_name = 'mon-module';
```

### Logs de Chargement

Les logs du `ModuleLoader` backend affichent :

```
============================================================
🔌 MODULE LOADER - Hot reload des modules activés
============================================================

📦 1 module(s) activé(s) trouvé(s)

  → Chargement du module 'mon-module' v1.0.0
  ✓ Module models validated: 2 table(s) found
  ✓ Router registered: mon-module (prefix: /api/v1/mon-module)
  ✓ Widgets synchronisés: 3 créé(s), 0 mis à jour
  ✅ Module 'mon-module' chargé avec succès

============================================================
✅ Chargement terminé: 1 modules chargés
   - 1 routers
   - 3 widgets synchronisés
============================================================
```

### Problèmes Courants

**Les widgets n'apparaissent pas dans le catalogue**

1. Vérifier que le fichier `backend/widgets.json` existe
2. Vérifier que le module est `active` en base
3. Redémarrer le backend
4. Vérifier les logs du `ModuleLoader`

**Permission refusée lors de l'ajout d'un widget**

1. Vérifier que l'utilisateur a la permission requise :
   ```sql
   SELECT p.code
   FROM permission p
   JOIN role_permission_link rpl ON p.id = rpl.permission_id
   JOIN user_role_link url ON rpl.role_id = url.role_id
   WHERE url.user_id = <user_id>;
   ```

2. Vérifier la permission du widget :
   ```sql
   SELECT widget_type, required_permission
   FROM widget
   WHERE widget_type = 'mon_module_widget';
   ```

**Les widgets ne se synchronisent pas**

1. Vérifier la syntaxe JSON :
   ```bash
   python3 -c "import json; print(json.load(open('modules/mon-module/backend/widgets.json')))"
   ```

2. Vérifier les erreurs dans les logs backend

## Exemple Complet : Module Third Parties

Voir `modules/third-parties/` pour un exemple complet avec :
- 8 widgets différents
- Permission `third_parties:read` appliquée
- Synchronisation automatique via `widgets.json`
- Documentation complète

## Best Practices

1. **Toujours préfixer les types de widgets** avec le code du module :
   ✅ `mon_module_widget_name`
   ❌ `widget_name`

2. **Utiliser des permissions cohérentes** :
   - `module:read` pour la lecture
   - `module:write` pour l'écriture
   - `module:admin` pour l'administration

3. **Documenter les widgets** dans le README du module

4. **Tester avec et sans permissions** pour s'assurer du bon comportement

5. **Version sémantique** pour les modules et leurs widgets
