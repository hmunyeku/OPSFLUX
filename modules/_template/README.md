# Template de Module OpsFlux

Ce dossier est un **template** pour créer de nouveaux modules. Ne l'utilisez pas directement !

## Créer un nouveau module à partir de ce template

### 1. Copier le template

```bash
# Depuis la racine du projet
cd modules
cp -r _template mon-nouveau-module
cd mon-nouveau-module
```

### 2. Remplacer les placeholders

Dans tous les fichiers du module, remplacez :

- `[MODULE_CODE]` → votre code en kebab-case (ex: `inventory-management`)
- `[MODULE_NAME]` → votre nom de module (ex: `Inventory Management`)
- `MyModule` → nom de votre export (ex: `InventoryModule`)
- `MY_WIDGETS` → nom de votre array de widgets (ex: `INVENTORY_WIDGETS`)

### 3. Structure créée

```
mon-nouveau-module/
├── backend/
│   ├── __init__.py              # Version du module
│   └── register.py              # Script d'enregistrement
└── frontend/
    ├── module.config.ts         # ⭐ Configuration principale
    ├── index.ts                 # Point d'entrée
    ├── types.ts                 # Types TypeScript
    ├── api.ts                   # Client API
    └── widgets/
        └── registry.ts          # Registre des widgets
```

### 4. Développer votre module

1. **Backend** :
   - Créez vos routes dans `backend/api/`
   - Définissez vos modèles dans `backend/models/`
   - Ajoutez la logique métier dans `backend/services/`

2. **Frontend** :
   - Créez vos widgets dans `frontend/widgets/`
   - Définissez vos types dans `frontend/types.ts`
   - Implémentez l'API client dans `frontend/api.ts`

3. **Configuration** :
   - Complétez `module.config.ts` avec vos widgets et hooks
   - Exportez tout dans `index.ts`

### 5. Enregistrer le module

```bash
# Enregistrer en base de données
docker exec -it opsflux-backend python modules/mon-nouveau-module/backend/register.py
```

### 6. Tester

Rechargez l'application frontend, votre module devrait se charger automatiquement !

## Fichiers importants

### `frontend/module.config.ts`

C'est le **cœur** de votre module. Il doit exporter :
- `config` : métadonnées du module
- `widgets` : tableau de widgets
- `routes` : routes personnalisées (optionnel)
- `onInit()` : hook d'initialisation (optionnel)
- `onDestroy()` : hook de nettoyage (optionnel)

### `frontend/widgets/registry.ts`

Liste tous vos widgets avec leur configuration :
- Type unique (préfixé avec le code du module)
- Composant React
- Métadonnées (nom, description, icône)
- Configuration par défaut
- Taille par défaut

### `backend/register.py`

Script pour enregistrer le module en base de données.
À exécuter une seule fois ou après chaque changement de métadonnées.

## Besoin d'aide ?

- Consultez `modules/third-parties/` pour un exemple complet
- Lisez `modules/README.md` pour la documentation complète
- Regardez `frontend/src/lib/module-loader.ts` pour comprendre le chargement

## Checklist

Avant de finaliser votre module :

- [ ] Tous les placeholders sont remplacés
- [ ] `module.config.ts` exporte un objet Module valide
- [ ] Les types de widgets sont préfixés avec le code du module
- [ ] Le module est enregistré en base de données
- [ ] Les imports dans `index.ts` sont corrects
- [ ] La documentation dans README.md est à jour
- [ ] Les hooks `onInit()` et `onDestroy()` sont implémentés si nécessaire
- [ ] Le code est testé et fonctionne

Bon développement ! 🚀
