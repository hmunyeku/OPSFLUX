# Système de Modules OpsFlux

Ce dossier contient tous les modules de l'application OpsFlux. Chaque module est un package autonome qui peut fournir des widgets, des routes, des API, etc.

## Architecture

```
modules/
├── third-parties/                 # Module de gestion des tiers
│   ├── backend/                   # Code backend du module
│   │   ├── __init__.py
│   │   ├── api/                   # Routes API
│   │   ├── models/                # Modèles de données
│   │   ├── schemas/               # Schémas Pydantic
│   │   └── services/              # Logique métier
│   └── frontend/                  # Code frontend du module
│       ├── module.config.ts       # Configuration du module ⭐
│       ├── api.ts                 # Client API
│       ├── types.ts               # Types TypeScript
│       └── widgets/               # Widgets du module
│           ├── registry.ts        # Registre des widgets
│           └── *.tsx              # Composants widgets
└── [autre-module]/
    ├── backend/
    └── frontend/
        └── module.config.ts       # Chaque module a sa config
```

## Créer un nouveau module

### 1. Structure de base

```bash
modules/
└── mon-module/
    ├── backend/
    │   ├── __init__.py
    │   └── api/
    │       └── routes.py
    └── frontend/
        ├── module.config.ts      # ⭐ OBLIGATOIRE
        ├── types.ts
        └── widgets/
            └── registry.ts
```

### 2. Fichier `module.config.ts`

C'est le **point d'entrée** de votre module. Il doit exporter un objet de type `Module`.

```typescript
// modules/mon-module/frontend/module.config.ts
import type { Module } from "@/lib/types/module"
import { MES_WIDGETS } from "./widgets/registry"

export const MonModule: Module = {
  // Configuration
  config: {
    code: "mon-module",              // Identifiant unique
    name: "Mon Super Module",        // Nom d'affichage
    version: "1.0.0",
    description: "Description du module",
    author: "Votre Nom",
    dependencies: [],                // Autres modules requis
  },

  // Widgets fournis par le module
  widgets: MES_WIDGETS,              // Export depuis widgets/registry.ts

  // Routes personnalisées (optionnel)
  routes: [],

  // Hook d'initialisation (optionnel)
  onInit: async () => {
    console.log("Mon module est initialisé !")
  },

  // Hook de nettoyage (optionnel)
  onDestroy: async () => {
    console.log("Mon module est déchargé")
  },
}

// Export par défaut OBLIGATOIRE pour le chargement dynamique
export default MonModule
```

### 3. Widgets

Créez vos widgets dans `widgets/` et enregistrez-les dans `widgets/registry.ts` :

```typescript
// modules/mon-module/frontend/widgets/registry.ts
import type { WidgetComponent } from "@/widgets/registry"
import MonWidget from "./mon-widget"

export const MES_WIDGETS: WidgetComponent[] = [
  {
    type: "mon_module_mon_widget",           // Préfixez avec le nom du module
    component: MonWidget,
    name: "Mon Widget",
    description: "Description du widget",
    category: "stats",                       // stats, charts, lists, etc.
    icon: "chart-bar",
    defaultConfig: {
      // Configuration par défaut
      showTitle: true,
      refreshInterval: 60000,
    },
    defaultSize: {
      w: 4,
      h: 3,
      minW: 3,
      minH: 2,
      maxW: 6,
      maxH: 4,
    },
  },
]
```

### 4. Enregistrement backend

Créez un script d'enregistrement dans `backend/` :

```python
# modules/mon-module/backend/register.py
import asyncio
from app.db.session import get_async_session
from app.api.routes.modules import create_module

async def register_module():
    """Enregistre le module dans la base de données"""
    async for session in get_async_session():
        await create_module(
            session=session,
            code="mon-module",
            name="Mon Super Module",
            description="Description du module",
            version="1.0.0",
            status="active"
        )

if __name__ == "__main__":
    asyncio.run(register_module())
```

Puis exécutez :
```bash
docker exec -it opsflux-backend python modules/mon-module/backend/register.py
```

## Chargement automatique

Le système de chargement est **entièrement automatique** :

1. **Backend** : Les modules actifs sont stockés en base de données
2. **Frontend** : Au démarrage de l'app (`providers.tsx`) :
   - Le `ModuleLoader` récupère la liste des modules actifs via l'API
   - Pour chaque module, il charge `modules/{code}/frontend/module.config.ts`
   - Les widgets sont automatiquement enregistrés dans le registry global
   - Les hooks `onInit()` sont appelés

### Hot Reload

Le système surveille automatiquement les nouveaux modules :
- Vérification toutes les 30 secondes (configurable)
- Chargement automatique sans rechargement de page
- Logs dans la console pour debug

## Conventions

### Nommage

- **Code du module** : `kebab-case` (ex: `third-parties`, `mon-module`)
- **Types de widgets** : Préfixez avec le code du module (ex: `third_parties_stats_overview`)
- **Fichiers** : Suivez les conventions TypeScript/Python du projet

### Organisation

```
modules/mon-module/
├── backend/                 # Tout le code Python
│   ├── api/                # Routes FastAPI
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic schemas
│   └── services/           # Business logic
└── frontend/               # Tout le code TypeScript/React
    ├── module.config.ts    # ⭐ Configuration principale
    ├── api.ts              # Client API (fetch)
    ├── types.ts            # Types TypeScript
    ├── hooks/              # React hooks
    ├── components/         # Composants React
    └── widgets/            # Widgets pour dashboard
        ├── registry.ts     # Liste des widgets
        └── *.tsx           # Composants widgets
```

### Isolation

- **Chaque module est autonome** : il ne doit pas dépendre d'autres modules sauf via `dependencies`
- **Pas d'imports cross-modules** : utilisez l'API pour communiquer entre modules
- **Types partagés** : utilisez les types de `@/lib/types/module.ts`

## API

### Backend

Endpoints pour gérer les modules :

```
GET    /api/v1/modules              # Liste des modules
POST   /api/v1/modules              # Créer un module
GET    /api/v1/modules/{code}       # Détails d'un module
PATCH  /api/v1/modules/{code}       # Mettre à jour
DELETE /api/v1/modules/{code}       # Supprimer
```

### Frontend

Fonctions utilitaires :

```typescript
import {
  initializeModuleWidgets,  // Initialise tous les modules
  checkForNewModules,       // Vérifie les nouveaux modules
  startModuleWatcher,       // Démarre la surveillance auto
  getLoadedModules,         // Liste des modules chargés
  getModule,                // Récupère un module spécifique
  unloadModule,             // Décharge un module
} from "@/lib/module-loader"
```

## Exemple complet : Third Parties

Voir `modules/third-parties/` pour un exemple complet avec :
- 8 widgets différents
- API complète (companies, contacts, invitations)
- Types TypeScript
- Documentation d'intégration

## Debugging

### Logs du module loader

Ouvrez la console du navigateur pour voir :
```
🔌 Initializing modules...
  📋 Found 1 active module(s): third-parties
  📦 Loading module: third-parties...
    ✓ Registered 8 widget(s)
    ✓ Module initialized
  ✅ Module third-parties loaded successfully
✅ Modules initialization complete: 1 loaded, 0 failed
🔍 Starting module watcher (interval: 30000ms)
```

### Problèmes courants

**Le module ne se charge pas**
- Vérifiez que `module.config.ts` existe et exporte un objet par défaut
- Vérifiez que le code du module correspond au nom du dossier
- Regardez les erreurs dans la console

**Les widgets n'apparaissent pas**
- Vérifiez que `widgets` est bien défini dans `module.config.ts`
- Vérifiez que les types de widgets sont uniques
- Rechargez la page

**Hot reload ne fonctionne pas**
- Vérifiez que le module est bien `active` en base de données
- Le hot reload a un délai de 30 secondes par défaut
- Regardez les logs dans la console

## Best Practices

1. **Toujours préfixer les types de widgets** avec le code du module
2. **Documenter les widgets** dans `widgets/README.md`
3. **Tester l'initialisation** avec `onInit()` pour valider les dépendances
4. **Gérer les erreurs** proprement dans les hooks
5. **Nettoyer les ressources** dans `onDestroy()`
6. **Suivre le versioning** SemVer pour `version`

## Migration depuis l'ancien système

Si vous avez des widgets qui ne sont pas dans un module :

1. Créez un module `core` ou intégrez-les dans un module existant
2. Déplacez les composants dans `modules/{code}/frontend/widgets/`
3. Créez le `module.config.ts`
4. Supprimez les imports statiques de widgets dans le code principal

## Support

Pour toute question sur le système de modules :
- Consultez le code de `third-parties` comme référence
- Regardez `frontend/src/lib/module-loader.ts` pour comprendre le chargement
- Voir `frontend/src/lib/types/module.ts` pour les types disponibles
