# OpsFlux

ERP industriel modulaire — opérations, conformité, projets, logistique.

**Production** : <https://app.opsflux.io> · **API** : <https://api.opsflux.io>

---

## Stack

- **Backend** — Python 3.12 · FastAPI · SQLAlchemy 2 (async) · PostgreSQL 16 (pgvector + PostGIS) · Alembic
- **Frontend web** — React 18 · TypeScript · Vite · TailwindCSS · React Query · React Router
- **Mobile** — React Native (Expo) · branche [`mobile-standalone`](https://github.com/hmunyeku/OPSFLUX/tree/mobile-standalone)
- **Infra** — Docker Compose · Dokploy (Traefik + Let's Encrypt) · Redis · Hostinger VPS

## Modules

| Slug | Domaine |
|---|---|
| `tiers` | Entreprises, contacts, identifiants légaux |
| `projets` | Projets multi-niveaux (WBS, CPM, antécédents, ressources, pointage, pertes, rapports MS Project-like) |
| `planner` | Planification opérationnelle scénarisée (heatmap, conflits, gantt) |
| `paxlog` | Mouvements de personnel (ADS, AVM, embarquement, conformité) |
| `travelwiz` | Voyages affréteurs, cargo manifests, captain portal |
| `packlog` | Cargo & emballage tracé QR, scan flux |
| `conformite` | Référentiel, règles, exemptions, fiches de poste, matrice |
| `papyrus` | Documents structurés versionnés, templates, formulaires, dispatch |
| `pid_pfd` | P&ID / PFD éditeur (xyflow + import) |
| `asset_registry` | Hiérarchie assets O&G + civil (champs, sites, installations, équipements, pipelines) |
| `imputations` | Comptes analytiques, taux de change historiques, OTP |
| `workflow` | Moteur d'états (FSM générique pluggable sur tout module) |
| `support` | Tickets, agent IA auto-fix avec workflow CI |
| `moc` | Management of Change |

## Architecture

```
apps/
├── main/           Frontend web (React + Vite)
├── mobile/         Frontend mobile (Expo) — voir branche mobile-standalone
├── ext-paxlog/     Portail externe captain/passager (statique)

app/                Backend FastAPI
├── api/routes/     Endpoints HTTP (modules + core)
├── models/         SQLAlchemy ORM
├── schemas/        Pydantic
├── services/       Business logic
├── tasks/          APScheduler jobs

agent-runner/       Container exécutant les sessions Claude pour le support agent
agent-worker/       Coordinateur des runs (queue, lifecycle)
alembic/            Migrations DB
docker/             Dockerfiles auxiliaires (postgres, etc.)
docs/               Documentation (rebuilt/ = doc cible, legacy = historique)
scripts/            Scripts ops (deploy, cleanup, seed staging)
tests/              pytest unit + intégration
```

## Branches

Le repo n'a **que deux branches** :

- **`main`** — backend + frontend web. Source de vérité du produit. Déployée sur prod via Dokploy + GitHub.
- **`mobile-standalone`** — application mobile Expo. Déployée via EAS Build.

Toute autre branche est éphémère (PR / fix temporaire) et doit être supprimée après merge.

## Développement local

```bash
# 1. Backend + DB + Redis
cp .env.example .env
docker compose up -d db redis
docker compose up backend

# 2. Frontend web
cd apps/main
npm install
npm run dev

# 3. Migrations DB
docker compose exec backend alembic upgrade head
```

## Déploiement

```bash
# Trigger un deploy via Dokploy API (ne JAMAIS docker run --name X
# en parallèle — Dokploy compose entre en conflit, cf
# scripts/cleanup-branches.sh pour le contexte historique)
curl -X POST \
  -H "x-api-key: $API_DOKPLOY" \
  -H "Content-Type: application/json" \
  -d "{\"composeId\":\"$DOKPLOY_COMPOSE_ID\"}" \
  "$API_DOKPLOY_URL/compose.deploy"
```

Les migrations Alembic s'appliquent automatiquement au démarrage du conteneur backend (cf `Dockerfile`).

## Tests

```bash
# Backend
docker compose exec backend pytest -q

# Frontend type-check
cd apps/main && npm run typecheck

# Frontend build (vérifie aussi tailwind, imports, etc.)
cd apps/main && npm run build
```

## Documentation

- [`docs/rebuilt/README.md`](docs/rebuilt/README.md) — architecture cible (source de vérité doc)
- [`CLAUDE.md`](CLAUDE.md) — instructions pour les sessions Claude Code / Agent SDK
- [`docs/check/`](docs/check/) — audits ponctuels, dette technique

## Licence

Propriétaire — © OpsFlux. Usage interne uniquement.
