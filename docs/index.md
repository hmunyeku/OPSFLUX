---
hide:
  - navigation
  - toc
---

# OpsFlux

**ERP industriel modulaire** — opérations, conformité, projets, logistique.

Plateforme multi-tenant pour piloter le mouvement de personnel, le cargo,
les voyages affréteurs, les projets, la conformité réglementaire et les
modifications opérationnelles d'organisations industrielles (oil & gas,
maritime, énergie).

---

## Deux espaces de documentation

<div class="grid cards" markdown>

-   :material-account-hard-hat: **Espace Utilisateur**

    ---

    **Libre d'accès.** Comprendre OpsFlux, déployer, utiliser chaque
    module au quotidien.

    Pour : décideurs, utilisateurs opérationnels, intégrateurs,
    administrateurs systèmes.

    [:octicons-arrow-right-24: Entrer dans l'espace utilisateur](enduser/getting-started/overview.md){ .md-button .md-button--primary }

-   :material-code-braces: **Espace Développeur**

    ---

    :material-lock: **Authentification requise** — réservé à l'équipe.

    Architecture, spécifications détaillées par module, workflows
    bas-niveau, matrices de permissions, ADR, modèle de données.

    Pour : devs OpsFlux internes + contributeurs externes invités.

    [:octicons-arrow-right-24: Entrer dans l'espace développeur](developer/architecture/system-overview.md){ .md-button }

</div>

---

## Modules en un coup d'œil

15 modules s'enregistrent au démarrage via le `ModuleRegistry`. Chacun
est indépendant ; les interactions se font via le bus d'événements
interne.

| Slug | Domaine | Doc utilisateur | Spec dev |
|---|---|---|---|
| `tiers` | Entreprises, contacts, identifiants légaux | À venir | [Spec](developer/modules-spec/TIERS.md) |
| `projets` | Projets multi-niveaux (WBS, CPM, ressources) | À venir | [Spec](developer/modules-spec/PROJETS.md) |
| `planner` | Planification opérationnelle (heatmap, conflits, gantt) | À venir | [Spec](developer/modules-spec/PLANNER.md) |
| `paxlog` | Mouvements de personnel (ADS, AVM, conformité) | [:material-check-circle:](enduser/modules/paxlog.md) | [Spec](developer/modules-spec/PAXLOG.md) |
| `travelwiz` | Voyages affréteurs, manifestes, captain portal | À venir | [Spec](developer/modules-spec/TRAVELWIZ.md) |
| `packlog` | Cargo & emballage tracé QR | À venir | À venir |
| `conformite` | Référentiel, règles, exemptions, fiches de poste | À venir | [Spec](developer/modules-spec/CONFORMITE.md) |
| `papyrus` | Documents structurés versionnés, templates, dispatch | À venir | [Spec](developer/modules-spec/PAPYRUS.md) |
| `pid_pfd` | P&ID / PFD éditeur (xyflow + import) | À venir | [Spec](developer/modules-spec/PID_PFD.md) |
| `asset_registry` | Hiérarchie assets O&G + civil | À venir | [Spec](developer/modules-spec/ASSET_REGISTRY.md) |
| `imputations` | Comptes analytiques, taux de change, OTP | À venir | [Spec](developer/modules-spec/IMPUTATIONS.md) |
| `workflow` | Moteur d'états (FSM générique) | À venir | [Spec](developer/modules-spec/WORKFLOW.md) |
| `support` | Tickets, agent IA auto-fix avec workflow CI | À venir | [Spec](developer/modules-spec/SUPPORT.md) |
| `moc` | Management of Change | [:material-check-circle:](enduser/modules/MOC.md) | À venir |
| `dashboard` | Hybride : onglets rôle + GridStack libre | À venir | [Spec](developer/modules-spec/DASHBOARD.md) |

---

## Stack en bref

- **Backend** — Python 3.12 · FastAPI · SQLAlchemy 2 (async) · PostgreSQL 16 (pgvector + PostGIS + ltree + pg_trgm) · Alembic · APScheduler · Redis 7
- **Frontend web** — React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · React Query · Zustand · React Router · xyflow · react-konva
- **Mobile** — React Native (Expo)
- **Infra** — Docker Compose · Traefik (v2/v3) · Let's Encrypt · S3 / local storage
- **Déploiement** — vanilla `docker compose` ou n'importe quel control plane (Dokploy, Coolify, EasyPanel, Caprover, Portainer)

[:material-vector-arrange-below: Architecture détaillée (utilisateur)](enduser/getting-started/stack.md){ .md-button }

---

## Liens rapides

- :material-github: [Code source](https://github.com/hmunyeku/OPSFLUX)
- :material-rocket-launch: [Guide de déploiement VPS](enduser/getting-started/deploy.md) (libre d'accès)
- :material-bug: [Issues GitHub](https://github.com/hmunyeku/OPSFLUX/issues)
