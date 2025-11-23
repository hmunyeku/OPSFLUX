# OpsFlux - Guide de Developpement

## Modes de Deploiement

OpsFlux utilise Docker Compose avec un systeme de **profiles** pour gerer differents modes:

| Mode | Commande | DB/Redis | Description |
|------|----------|----------|-------------|
| **Dev Local** | `docker-compose --profile local up -d` | Locaux | Developement avec DB/Redis locaux |
| **Production** | `docker-compose up -d` | Externes | Prod avec DB/Redis externes |
| **Dev Override** | `docker-compose --profile local -f docker-compose.yml -f docker-compose.override.yml up -d` | Locaux | Dev avec hot-reload |

## Configuration via .env

Toute la configuration se fait dans le fichier `.env`. Aucune valeur n'est en dur dans les Dockerfiles.

### Copier le fichier d'exemple

```bash
cp .env.example .env
```

### Variables obligatoires

```bash
# Stack
STACK_NAME=opsflux              # Nom unique du stack
DOMAIN=opsflux.io               # Domaine (URLs: api.DOMAIN, app.DOMAIN)

# Docker Images
DOCKER_IMAGE_BACKEND=opsflux-backend
DOCKER_IMAGE_FRONTEND=opsflux-frontend

# Database
POSTGRES_SERVER=db              # 'db' pour local, hostname pour externe
POSTGRES_USER=opsflux_user
POSTGRES_PASSWORD=changethis   # CHANGER EN PROD!

# Redis
REDIS_HOST=redis               # 'redis' pour local, hostname pour externe

# Security
SECRET_KEY=your-secret-key-min-32-chars

# Admin
FIRST_SUPERUSER=admin@opsflux.com
FIRST_SUPERUSER_PASSWORD=AdminPass123!

# Frontend
FRONTEND_HOST=https://app.opsflux.io
```

## Developpement Local

### 1. Demarrer avec DB/Redis locaux

```bash
# Demarrer le stack complet avec DB et Redis locaux
docker-compose --profile local up -d

# Verifier les services
docker-compose ps
```

### 2. Demarrer avec hot-reload (recommande)

```bash
# Utiliser l'override pour le hot-reload
docker-compose --profile local -f docker-compose.yml -f docker-compose.override.yml up -d
```

### 3. Demarrer le frontend separement (Windows)

Pour le developpement sur Windows, il est recommande de lancer le frontend en dehors de Docker:

```bash
# Demarrer seulement backend + DB + Redis
docker-compose --profile local up -d backend db redis

# Lancer le frontend localement
cd frontend
npm install
npm run dev
```

### URLs de Developpement

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs
- **API Docs (ReDoc)**: http://localhost:8000/redoc
- **Adminer (DB Admin)**: http://localhost:8080

## Production

### Avec DB/Redis Externes

En production, vous pouvez utiliser des services de base de donnees geres (AWS RDS, Google Cloud SQL, etc.).

```bash
# Dans .env:
POSTGRES_SERVER=your-db-hostname.rds.amazonaws.com
POSTGRES_USER=prod_user
POSTGRES_PASSWORD=super_secure_password

REDIS_HOST=your-redis-hostname.elasticache.amazonaws.com
REDIS_PASSWORD=redis_password

# Lancer sans le profile "local" (pas de DB/Redis locaux)
docker-compose up -d
```

### URLs de Production

Remplacez `opsflux.io` par votre domaine:

- **Frontend**: https://app.opsflux.io
- **Backend API**: https://api.opsflux.io
- **API Docs**: https://api.opsflux.io/docs
- **Adminer** (si active): https://adminer.opsflux.io

## Commandes Utiles

### Logs

```bash
# Tous les logs
docker-compose logs -f

# Logs d'un service specifique
docker-compose logs -f backend

# Logs avec timestamps
docker-compose logs -f --timestamps backend
```

### Gestion des Services

```bash
# Redemarrer un service
docker-compose restart backend

# Arreter le stack
docker-compose down

# Arreter et supprimer les volumes (reset complet)
docker-compose down -v
```

### Migrations de Base de Donnees

```bash
# Executer les migrations
docker-compose exec backend alembic upgrade head

# Creer une nouvelle migration
docker-compose exec backend alembic revision --autogenerate -m "description"
```

### Prestart (Migrations + Setup Initial)

```bash
# Executer le prestart manuellement
docker-compose run --rm prestart
```

## Structure des Fichiers Docker

```
OPSFLUX/
├── docker-compose.yml           # Config principale (prod)
├── docker-compose.override.yml  # Overrides pour dev (hot-reload)
├── .env                         # Variables d'environnement (local)
├── .env.example                 # Template des variables
├── backend/
│   └── Dockerfile               # Image Python/FastAPI
└── frontend/
    └── Dockerfile               # Image Node.js/Next.js
```

## Variables d'Environnement Completes

Voir `.env.example` pour la liste complete des variables avec leur documentation.

### Variables Specifiques aux Modes

| Variable | Dev Local | Production |
|----------|-----------|------------|
| `ENVIRONMENT` | local | production |
| `POSTGRES_SERVER` | db | external-hostname |
| `REDIS_HOST` | redis | external-hostname |
| `TRAEFIK_ENABLE` | false | true |
| `FRONTEND_HOST` | http://localhost:3000 | https://app.domain.com |

## Troubleshooting

### Port deja utilise

```bash
# Verifier quel processus utilise le port
netstat -ano | findstr :3000
netstat -ano | findstr :8000

# Sur Linux/Mac
lsof -i :3000
```

### Probleme de connexion DB

```bash
# Verifier si PostgreSQL repond
docker-compose exec db pg_isready

# Se connecter manuellement
docker-compose exec db psql -U opsflux_user -d opsflux
```

### Reset complet

```bash
# Arreter tout et supprimer les volumes
docker-compose down -v

# Supprimer les images
docker-compose down --rmi local

# Reconstruire
docker-compose --profile local build
docker-compose --profile local up -d
```
