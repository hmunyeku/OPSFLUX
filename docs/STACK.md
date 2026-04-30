# OpsFlux — Architecture & stack

Vue d'ensemble technique de la plateforme. À lire avant un déploiement
ou une intervention infra. Pour le pas-à-pas d'installation sur un VPS,
voir [`DEPLOY_VPS.md`](DEPLOY_VPS.md).

---

## 1. Schéma logique

```
                       ┌─────────────────────────┐
                       │   Reverse proxy (TLS)   │
                       │   Traefik (or nginx)    │
                       │   Let's Encrypt ACME    │
                       └────────────┬────────────┘
                                    │ :443
        ┌───────────┬───────────────┼──────────────┬───────────┬────────┐
        │           │               │              │           │        │
        ▼           ▼               ▼              ▼           ▼        ▼
  app.<dom>   api.<dom>      drawio.<dom>    db.<dom>    ext.<dom>  www.<dom>
   frontend   backend         drawio          pgAdmin    ext-paxlog vitrine
   (nginx)    (FastAPI)       (jgraph)        (web UI)   (nginx)    (nginx)
                  │
       ┌──────────┼──────────┐
       │          │          │
       ▼          ▼          ▼
   PostgreSQL   Redis     /opt/opsflux/static
   (pgvector              (volume — uploads,
    + PostGIS)             avatars, attachments)
```

**Réseaux Docker** :
- `default` (interne au projet compose) — backend ↔ db ↔ redis
- `proxy` (alias dans le compose ; **nom réel paramétrable** via
  `TRAEFIK_NETWORK`, défaut `dokploy-network`) — réseau externe partagé
  avec Traefik. Adapter selon la plateforme : `coolify`, `easypanel`,
  `captain-overlay-network`, `proxy`, etc.

---

## 2. Composants

| Service        | Image / source                | Port interne | Rôle |
|----------------|-------------------------------|--------------|------|
| `db`           | `pgvector/pgvector:pg16` + PostGIS (build local — `docker/Dockerfile.postgres`) | 5432 | Source de vérité — multi-tenant via `entity_id`, JSONB, vectoriel pgvector, GIS PostGIS, ltree |
| `redis`        | `redis:7-alpine`              | 6379 | Cache, rate-limit, leader-election scheduler, sessions |
| `backend`      | Build local (`Dockerfile`)    | 8000 | FastAPI · SQLAlchemy 2 async · Alembic. Sert `/api/*` et `/mcp-gw/*` |
| `frontend`     | Build local (`apps/main/Dockerfile`) | 80 | React 18 · Vite · TailwindCSS — buildé en statique, servi par nginx |
| `ext-paxlog`   | Build local (`apps/ext-paxlog/Dockerfile`) | 80 | Portail externe captain/passager (lien magique signé) |
| `vitrine`      | Build local (`apps/vitrine/Dockerfile`) | 80 | Site marketing — `www.<domain>` |
| `drawio`       | `jgraph/drawio:29.6.7` (figé) | 8080 | Éditeur Draw.io self-hosted (PID/PFD + plans navires TravelWiz) |
| `pgadmin`      | `dpage/pgadmin4:latest`       | 80 | UI DB superadmin |
| `agent-worker` | Build local ou `ghcr.io/hmunyeku/opsflux-agent-worker:latest` (compose séparé) | — | Pool de workers Claude (auto-fix support) |

> **Note Draw.io** : la version est figée à `29.6.7` parce que le tag `:latest`
> (`29.6.10`) embarque un `js/stencils.min.js` corrompu qui plante l'éditeur.

---

## 3. Volumes nommés (à sauvegarder)

| Volume         | Monté sur          | Service     | Critique ? |
|----------------|--------------------|-------------|------------|
| `pg_data`      | `/var/lib/postgresql/data` | db | **OUI — donnée métier** |
| `uploads_data` | `/opt/opsflux/static`     | backend | **OUI — pièces jointes, avatars** |
| `pgadmin_data` | `/var/lib/pgadmin` | pgadmin    | Non — sessions UI |
| `agent-repo-cache` | `/var/opsflux/agent-cache` | agent-worker | Non — cache git |

Toute autre donnée vit en DB → un dump SQL + tar du volume `uploads_data` =
backup complet.

---

## 4. Sous-domaines servis

`<DOMAIN>` est templaté depuis l'env (défaut `opsflux.io`).

| Sous-domaine        | Service     | Notes |
|---------------------|-------------|-------|
| `app.<DOMAIN>`      | frontend    | SPA principale |
| `api.<DOMAIN>`      | backend     | API REST + MCP |
| `mcp.<DOMAIN>`      | backend     | Alias HTTP du backend (MCP Gateway) |
| `ext.<DOMAIN>`      | ext-paxlog  | Portail captain (signed-link, sans auth complète) |
| `drawio.<DOMAIN>`   | drawio      | Éditeur embarqué (chargé via iframe + window.open) |
| `db.<DOMAIN>`       | pgadmin     | UI superadmin (à protéger par IP allowlist en prod) |
| `www.<DOMAIN>`      | vitrine     | Site marketing |
| `<DOMAIN>` (naked)  | vitrine     | Redirige 301 → `www.<DOMAIN>` |

---

## 5. Stack code

### Backend (Python 3.12)
- **FastAPI** + **uvicorn** (4 workers en prod)
- **SQLAlchemy 2.0 async** (asyncpg) + **Alembic** (migrations)
- **GeoAlchemy2** + **shapely** pour PostGIS
- **APScheduler** (jobs périodiques : seed i18n, agent scheduler, MOC reviews, …)
- **WeasyPrint** (PDFs : ADS, manifestes cargo, certificats)
- **lxml** + **openpyxl** (KMZ asset registry, imports XLSX)
- **python-jose** + **bcrypt** + **pyotp** (JWT, hash mdp, TOTP/MFA)
- **boto3** (storage S3/MinIO optionnel)
- **aiosmtplib** + **jinja2** (emails templatés)
- **ldap3** (auth Active Directory)
- **litellm** (abstraction LLM — Anthropic / Ollama / autres)
- **sentry-sdk** (monitoring erreurs)

### Frontend web (`apps/main`)
- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** + **shadcn/ui**
- **React Query** (cache serveur, BroadcastChannel cross-window)
- **React Router v6**
- **xyflow** (PID/PFD), **react-konva** (overlays canvas TravelWiz)
- **i18next** (FR/EN/ES/PT — clés en DB, pas en JSON)

### Mobile (`apps/mobile`)
Branche séparée [`mobile-standalone`](https://github.com/hmunyeku/OPSFLUX/tree/mobile-standalone) — Expo / React Native.

---

## 6. Cycle de boot du backend

Commande Docker au démarrage du conteneur `backend` (override depuis
`docker-compose.yml`) :

```sh
mkdir -p /opt/opsflux/static/avatars /opt/opsflux/static/attachments &&
alembic upgrade head &&
python -m scripts.seed_i18n &&
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

1. **Création des dossiers static** — idempotent, en cas de volume vierge.
2. **`alembic upgrade head`** — applique toutes les migrations pendantes.
   Si la DB pointe sur une révision inconnue (e.g. après un revert de code
   qui a supprimé un fichier de migration), Alembic échoue **et le boot
   échoue**. Voir [DEPLOY_VPS.md → Recovery](DEPLOY_VPS.md#recovery).
3. **`python -m scripts.seed_i18n`** — synchronise les clés i18n (FR/EN/ES/PT)
   depuis `apps/main/src/locales/*.json` vers la table `i18n_translations`.
   Idempotent, hashable.
4. **Premier boot uniquement** : `app/services/core/seed_service.py` crée
   l'entité initiale + l'utilisateur admin (cf. variables `FIRST_*`).
5. **uvicorn** démarre 4 workers — un seul élu leader pour le scheduler
   (verrou Redis).

---

## 7. Multi-tenant

**Règle d'or** : chaque ligne porte un `entity_id` (FK vers `entities`).
Le middleware `EntityScopeMiddleware` injecte le scope dans toutes les
requêtes SQL. Un super-admin peut basculer d'entité via l'header
`X-Entity-ID` (vérifié par `TenantSchemaMiddleware`).

Une seule installation OpsFlux peut héberger N organisations. Le seed
crée la première (`FIRST_ENTITY_CODE` / `FIRST_ENTITY_NAME`).

---

## 8. Modules métier

Voir [README.md → Modules](../README.md#modules) pour la liste.
Chaque module expose un `MANIFEST` enregistré au boot dans le
`ModuleRegistry` (`app/main.py:27-41`). Le manifest déclare :

- routes API
- permissions
- événements émis/consommés
- migrations Alembic associées
- entrées du menu frontend

Désactiver un module = retirer son `MANIFEST` de `app/main.py`. Pas de
flag d'env pour activer/désactiver — les modules sont compile-time.

---

## 9. Événements & pub/sub

- **Bus interne** : Redis pub/sub via `app/event_handlers/`
- **Cross-window front** : `QueryCache.subscribe` + `BroadcastChannel`
  (`apps/main/src/lib/queryClient.ts`) — invalide le cache d'un onglet
  quand un autre onglet (ou popup Draw.io) écrit en DB.

---

## 10. Sécurité — checklist prod

- `SECRET_KEY` et `JWT_SECRET_KEY` aléatoires (refus de boot sinon)
- `ENCRYPTION_KEY` Fernet généré via `Fernet.generate_key()`
- `ALLOWED_HOSTS` restreint aux domaines effectivement servis
- `ALLOWED_ORIGINS` restreint aux frontends autorisés
- `STORAGE_BACKEND=s3` ou `minio` recommandé (sinon les uploads vivent
  dans le volume Docker — perdu en cas de `docker volume rm`)
- Restriction IP sur `db.<domain>` (pgAdmin) — par middleware Traefik
  `ipAllowList` ou par règle nginx en amont
- `AUTH_PASSWORD_*` calés sur la politique mot de passe (défauts
  conformes AUP §5.2)
- `SENTRY_DSN` configuré (sinon zéro visibilité en cas d'incident)
- HTTPS only — `redirect-to-https` middleware Traefik actif sur tout

---

## 11. Voir aussi

- [`DEPLOY_VPS.md`](DEPLOY_VPS.md) — installation pas-à-pas sur un VPS
- [`AUDIT_TRAVELWIZ_MOC_2026-04.md`](AUDIT_TRAVELWIZ_MOC_2026-04.md) — état fonctionnel des modules
- [`check/00_PROJECT.md`](check/00_PROJECT.md) — cahier des charges fonctionnel
- [`adr/`](adr/) — décisions d'architecture
- [`../CLAUDE.md`](../CLAUDE.md) — conventions pour les sessions Claude Code
