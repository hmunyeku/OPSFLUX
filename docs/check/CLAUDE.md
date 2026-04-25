# CLAUDE.md — Guide Claude Code pour OpsFlux

> **Lis ce fichier en premier. Toujours. Avant tout autre fichier du repo.**

---

## Ce qu'est OpsFlux

Plateforme PWA enterprise multi-tenant pour Perenco (Oil & Gas Cameroun).
Développée en solo par H.B. assisté de Claude Code.
Pattern : **Platform/Plugin** — Core de services réutilisables + Modules qui s'enregistrent.

**Stack** : FastAPI Python 3.12 + PostgreSQL 16 + pgvector + Redis + ARQ + React 18 +
TypeScript + TailwindCSS + shadcn/ui + BlockNote + Yjs + Hocuspocus + draw.io + GridStack.js

---

## Ordre de lecture des specs

```
docs/
├── CLAUDE.md                           ← tu es ici
├── 00_PROJECT.md                       ← architecture, stack, DB Core, CI/CD, envs
├── 01_CORE.md                          ← services Core (EventBus, Workflow, Email, Storage...)
├── 10_FUNCTIONAL_ANALYSIS.md          ← analyse fonctionnelle complète (lire en priorité)
├── 11_BOOTSTRAP.md                     ← main.py, api.ts, queryClient.ts, module registration
├── 12_DECISIONS_COMPLEMENTAIRES.md    ← LIRE AVANT CHAQUE MODULE — décisions finales
├── 02_MODULE_REPORT.md
├── 03_MODULE_PID_PFD.md
├── 04_MODULE_DASHBOARD.md
├── 05_MODULE_ASSET_REGISTRY.md
├── 06_MODULE_TIERS.md
├── 07_MODULE_AI_MCP.md
├── 08_ROADMAP.md                       ← phase en cours + tâches PDCA
└── 09_DESIGN_SYSTEM.md                ← layout Pajamas, composants React, Quick Entry
```

**Règle** : pour tout travail sur un module → lire `10_FUNCTIONAL_ANALYSIS.md` + `12_DECISIONS_COMPLEMENTAIRES.md` + fichier de spec du module.

---

## Phase en cours : P0 — Foundation

Voir `08_ROADMAP.md §Phase 0`. Tâches P0 par ordre :
1. Cloner `fastapi/full-stack-fastapi-template`, adapter structure (voir `00_PROJECT.md §4`)
2. PostgreSQL 16 + pgvector + migrations Core (voir `00_PROJECT.md §6`)
3. SSO Azure AD / Entra ID (voir `12_DECISIONS §19`)
4. Multi-tenant middleware + RBAC (voir `00_PROJECT.md §5`)
5. Frontend shell vide avec topbar + sidebar (voir `09_DESIGN_SYSTEM.md §2-4`)
6. 3 envs Dokploy : dev / staging / prod (voir `00_PROJECT.md §7`)
7. CI/CD GitHub Actions (voir `00_PROJECT.md §8`)
8. Accès Claude Code remote validé

---

## Domaines et URLs

```bash
APP_URL=https://app.opsflux.io      # Application principale
WEB_URL=https://web.opsflux.io      # Portail public (ShareLinks, partenaires)
WWW_URL=https://www.opsflux.io      # Landing marketing (discret)
API_URL=https://api.opsflux.io      # Backend API

# Dev local
APP_URL=http://localhost:5173
API_URL=http://localhost:8000
```

---

## Démarrage local

```bash
cp .env.example .env.dev
docker compose -f docker/docker-compose.dev.yml up -d
cd backend && alembic upgrade head
cd frontend && npm install && npm run dev
```

- Frontend app : http://localhost:5173
- API + Swagger : http://localhost:8000/docs
- MailHog : http://localhost:8025
- Hocuspocus : ws://localhost:1234

---

## Architecture Docker (6 conteneurs)

| Conteneur | Image | Rôle |
|---|---|---|
| `backend` | opsflux-backend | FastAPI API |
| `arq-worker` | opsflux-backend (même) | Jobs async ARQ |
| `hocuspocus` | opsflux-hocuspocus | Collab RT Yjs (Node.js) |
| `frontend` | opsflux-frontend | React app (nginx) |
| `web-portal` | opsflux-web-portal | web.opsflux.io |
| `postgres` | pgvector/pgvector:pg16 | DB |
| `redis` | redis:7-alpine | Cache + queue |
| `traefik` | traefik:v3 | Reverse proxy SSL |

---

## Conventions

### Branches
```
main          → production (deploy manuel avec approbation GitHub)
develop       → staging (deploy automatique)
feature/P{N}-{description}   ex: feature/P0-azure-sso
fix/{description}
```

### Commits
```
feat(module): description
fix(core): description
migration(P1): ajouter tables documents
chore(infra): configurer traefik wildcard cert
```

---

## Règles absolues — Ce qu'un module NE FAIT JAMAIS

```
❌ SMTP direct              → core.email.queue()
❌ Notification directe     → core.notify()
❌ Event direct             → core.events.publish()
❌ LLM direct               → core.ai_service.complete()
❌ Filesystem direct        → core.storage_service.upload()
❌ tenant_id hardcodé       → toujours request.state.tenant_id
❌ Sans BU scope            → toujours request.state.bu_id
❌ Logique métier en route  → tout dans les services
❌ Swagger en prod/staging  → docs_url=None si ENVIRONMENT != "development"
```

### Pattern endpoint FastAPI correct

```python
@router.post("/documents", dependencies=[requires_permission("document.create")])
async def create_document(body: DocumentCreate, request: Request,
                           db: AsyncSession = Depends(get_db)):
    return await report_service.create_document(
        body=body,
        tenant_id=request.state.tenant_id,
        bu_id=request.state.bu_id,
        created_by=request.state.user_id,
        db=db,
    )
```

### Pattern composant React correct

```tsx
// Données serveur → React Query
const { data } = useQuery({
    queryKey: ["documents", filters],
    queryFn: () => api.get("/api/v1/documents", { params: filters }).then(r => r.data),
})

// State UI → Zustand
const { sidebarExpanded } = useUIStore()

// Préférences persistées → hook
const [pageSize, setPageSize] = useUserPreference("table.documents.page_size", 25)

// Formulaire création → QuickEntryForm (§27 Design System)
// Confirmation action → InlineConfirmButton (§21 Design System)
// Loading initial → Skeleton (§20 Design System)
// Loading action → Spinner dans bouton (§20 Design System)
```

---

## Tests

```bash
cd backend && pytest tests/ -x --tb=short
cd frontend && npm run test
cd frontend && npm run typecheck
```

Critère : 0 test cassé avant tout commit sur `develop`.

---

## Checklist PR

```
□ ruff check + format → 0 erreur
□ pytest → 0 test cassé
□ npm run typecheck → 0 erreur TypeScript
□ alembic upgrade head sur DB vide → OK
□ .env.example mis à jour si nouvelles variables
□ CHANGELOG.md mis à jour
□ Pas de TODO non résolu dans le code commité
```

---

## Quand tu es bloqué

1. `12_DECISIONS_COMPLEMENTAIRES.md` — consulter d'abord
2. `10_FUNCTIONAL_ANALYSIS.md` — comportement attendu côté utilisateur
3. Fichier de spec du module concerné
4. `01_CORE.md` — services Core disponibles
5. `09_DESIGN_SYSTEM.md` — composants UI
6. **Ne jamais inventer une architecture non spécifiée — poser la question**
