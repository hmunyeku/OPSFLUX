# OpsFlux

ERP industriel modulaire — opérations, conformité, projets, logistique.

**Production** : <https://app.opsflux.io> · **API** : <https://api.opsflux.io> · **Docs** : <https://docs.opsflux.io>

---

## Stack

- **Backend** — Python 3.12 · FastAPI · SQLAlchemy 2 (async) · PostgreSQL 16 (pgvector + PostGIS) · Alembic
- **Frontend web** — React 18 · TypeScript · Vite · TailwindCSS · React Query · React Router
- **Mobile** — React Native (Expo) · branche [`mobile-standalone`](https://github.com/hmunyeku/OPSFLUX/tree/mobile-standalone)
- **Infra** — Docker Compose · Traefik (v2/v3) · Redis · Let's Encrypt
- **Déploiement** — vanilla `docker compose` ou n'importe quel control plane (Dokploy, Coolify, EasyPanel, Caprover, Portainer, …). L'instance de référence tourne sur Hostinger VPS + Dokploy

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
# 1. Configuration
cp .env.example .env       # éditer SECRET_KEY, JWT_SECRET_KEY, POSTGRES_PASSWORD

# 2. Stack complète en local (mailhog inclus, pas de TLS)
docker compose -f docker-compose.dev.yml up

# Frontend : http://localhost:5173
# Backend  : http://localhost:8000/docs
# Mailhog  : http://localhost:8025
```

## Déploiement

Le `docker-compose.yml` est portable — il fonctionne avec :

- **Vanilla `docker compose`** sur un VPS générique (Docker + Traefik
  standalone) — chemin recommandé pour le contrôle total.
- **N'importe quel control plane** : Dokploy, Coolify, EasyPanel,
  Caprover, Portainer. Quatre variables `.env` suffisent à l'adapter
  (`DOMAIN`, `STACK_NAME`, `CERT_RESOLVER`, `TRAEFIK_NETWORK`).

Le guide complet par plateforme est dans
[`docs/DEPLOY_VPS.md`](docs/DEPLOY_VPS.md). L'instance de référence
sur `app.opsflux.io` tourne sur Dokploy ; trigger redeploy via API :

```bash
curl -X POST \
  -H "x-api-key: $API_DOKPLOY" \
  -H "Content-Type: application/json" \
  -d "{\"composeId\":\"$DOKPLOY_COMPOSE_ID\"}" \
  "$API_DOKPLOY_URL/compose.deploy"
```

Les migrations Alembic s'appliquent automatiquement au démarrage du
conteneur backend. Le seed initial (entité + admin) tourne au premier
boot — voir variables `FIRST_*` dans [`.env.example`](.env.example).

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

| Document | Pour qui / quoi |
|---|---|
| [`docs/STACK.md`](docs/STACK.md) | Architecture, services, volumes, sous-domaines, cycle de boot |
| [`docs/DEPLOY_VPS.md`](docs/DEPLOY_VPS.md) | **Guide pas-à-pas pour déployer sur un VPS** (générique, pas seulement Dokploy) |
| [`.env.example`](.env.example) | Référence canonique de toutes les variables d'environnement |
| [`CLAUDE.md`](CLAUDE.md) | Instructions pour les sessions Claude Code / Agent SDK |
| [`docs/check/00_PROJECT.md`](docs/check/00_PROJECT.md) | Cahier des charges fonctionnel |
| [`docs/check/`](docs/check/) | Audits ponctuels, dette technique |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records |

## Licence

Propriétaire — © OpsFlux. Usage interne uniquement.
