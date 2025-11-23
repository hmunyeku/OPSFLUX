# 🚀 Guide de développement local OPSFLUX

## Mode développement avec hot reload (SANS REBUILD)

### Démarrage rapide

```bash
# Démarrer en mode développement (avec volumes montés)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Voir les logs en temps réel
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend frontend
```

### Avantages du mode développement

✅ **Pas de rebuild nécessaire** - Les fichiers sont montés directement depuis votre bureau
✅ **Hot reload automatique** - Les changements sont détectés instantanément
✅ **Pas de cache Docker** - Vous modifiez directement les fichiers sources
✅ **Développement rapide** - Éditez et testez immédiatement

### Structure des volumes montés

**Backend (FastAPI)** :
- `./backend/app` → `/app/app` (code Python)
- `./backend/alembic.ini` → `/app/alembic.ini` (config migrations)
- `./backend/scripts` → `/app/scripts` (scripts utilitaires)

**Frontend (Next.js)** :
- `./frontend` → `/app` (tout le code Next.js)
- Exclusions : `node_modules`, `.next` (utilisent ceux du container)

**Modules** :
- `./modules` → `/modules` (modules métier HSE, Third Parties, etc.)

### Commandes utiles

```bash
# Arrêter les services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Redémarrer un service spécifique
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart backend

# Voir les logs d'un service
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend

# Exécuter une commande dans un container
docker-compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py shell

# Rebuild si vous changez les dépendances (package.json, requirements.txt)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Workflow de développement

1. **Modifier le code** dans votre éditeur (VS Code, etc.)
2. **Sauvegarder** - Le hot reload détecte automatiquement les changements
3. **Tester** - L'application se recharge automatiquement

### URLs de développement

- Frontend : http://localhost:3000
- Backend API : http://localhost:8000
- API Docs (Swagger) : http://localhost:8000/docs
- Adminer (DB) : http://localhost:8080

### Mode production (avec build)

Si vous voulez tester le mode production :

```bash
# Arrêter le mode dev
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Démarrer en mode production
docker-compose up -d --build
```

### Résolution de problèmes

**Les changements ne sont pas détectés** :
```bash
# Redémarrer le service concerné
docker-compose -f docker-compose.yml -f docker-compose.dev.yml restart backend
```

**Problème de permissions (Linux/Mac)** :
```bash
# Ajouter :cached ou :delegated aux volumes dans docker-compose.dev.yml
```

**Changement de dépendances (npm install, pip install)** :
```bash
# Rebuild l'image concernée
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend
# ou
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend
```

### Alias pratique (optionnel)

Ajoutez à votre `.bashrc` ou `.zshrc` :

```bash
alias dc-dev='docker-compose -f docker-compose.yml -f docker-compose.dev.yml'
```

Puis utilisez :
```bash
dc-dev up -d
dc-dev logs -f backend
dc-dev down
```
