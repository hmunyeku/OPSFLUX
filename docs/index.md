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

[:material-rocket-launch: Déployer en production](DEPLOY_VPS.md){ .md-button .md-button--primary }
[:material-cube-outline: Explorer les modules](modules/index.md){ .md-button }
[:material-source-branch: Code sur GitHub](https://github.com/hmunyeku/OPSFLUX){ .md-button }

---

## Pour qui est cette doc ?

<div class="grid cards" markdown>

-   :material-account-tie: **Décideur / nouveau venu**

    ---

    Comprendre ce qu'OpsFlux résout, sa stack et l'ordre de grandeur
    d'un déploiement.

    [:octicons-arrow-right-24: Vue d'ensemble](README.md)

-   :material-account-hard-hat: **Utilisateur opérationnel**

    ---

    Saisir comment chaque module fonctionne au quotidien, avec
    workflows, captures d'écran et pièges à éviter.

    [:octicons-arrow-right-24: Modules](modules/index.md)

-   :material-server: **Ops / DevOps**

    ---

    Mettre OpsFlux en production sur n'importe quel host Docker, gérer
    sauvegardes, mises à jour, recovery.

    [:octicons-arrow-right-24: Guide VPS](DEPLOY_VPS.md)

-   :material-code-braces: **Développeur**

    ---

    Comprendre l'architecture, les patterns FastAPI/SQLAlchemy/React,
    contribuer un module.

    [:octicons-arrow-right-24: Spécifications](rebuilt/README.md)

</div>

---

## Modules métier

Quinze modules s'enregistrent au démarrage via le `ModuleRegistry`.
Chacun est indépendant ; les interactions se font via le bus d'événements
interne.

| Slug | Domaine | Statut doc |
|---|---|---|
| `tiers` | Entreprises, contacts, identifiants légaux | [Spec](rebuilt/modules/TIERS.md) · doc utilisateur à venir |
| `projets` | Projets multi-niveaux (WBS, CPM, ressources, pointage, MS Project-like) | [Spec](rebuilt/modules/PROJETS.md) · doc utilisateur à venir |
| `planner` | Planification opérationnelle scénarisée (heatmap, conflits, gantt) | [Spec](rebuilt/modules/PLANNER.md) · doc utilisateur à venir |
| `paxlog` | Mouvements de personnel (ADS, AVM, embarquement, conformité) | [Spec](rebuilt/modules/PAXLOG.md) · [Doc utilisateur](modules/paxlog.md) |
| `travelwiz` | Voyages affréteurs, cargo manifests, captain portal | [Spec](rebuilt/modules/TRAVELWIZ.md) · doc utilisateur à venir |
| `packlog` | Cargo & emballage tracé QR, scan flux | spec à venir · doc utilisateur à venir |
| `conformite` | Référentiel, règles, exemptions, fiches de poste, matrice | [Spec](rebuilt/modules/CONFORMITE.md) · doc utilisateur à venir |
| `papyrus` | Documents structurés versionnés, templates, formulaires, dispatch | [Spec](rebuilt/modules/PAPYRUS.md) · doc utilisateur à venir |
| `pid_pfd` | P&ID / PFD éditeur (xyflow + import) | [Spec](rebuilt/modules/PID_PFD.md) · doc utilisateur à venir |
| `asset_registry` | Hiérarchie assets O&G + civil (champs, sites, installations, équipements, pipelines) | [Spec](rebuilt/modules/ASSET_REGISTRY.md) · doc utilisateur à venir |
| `imputations` | Comptes analytiques, taux de change historiques, OTP | [Spec](rebuilt/modules/IMPUTATIONS.md) · doc utilisateur à venir |
| `workflow` | Moteur d'états (FSM générique pluggable sur tout module) | [Spec](rebuilt/modules/WORKFLOW.md) · doc utilisateur à venir |
| `support` | Tickets, agent IA auto-fix avec workflow CI | [Spec](rebuilt/modules/SUPPORT.md) · doc utilisateur à venir |
| `moc` | Management of Change | spec à venir · [Doc utilisateur](modules/MOC.md) |
| `dashboard` | Hybride : onglets rôle + GridStack libre (core) | [Spec](rebuilt/modules/DASHBOARD.md) · doc utilisateur à venir |

---

## Stack en bref

- **Backend** — Python 3.12 · FastAPI · SQLAlchemy 2 (async) · PostgreSQL 16 (pgvector + PostGIS + ltree + pg_trgm) · Alembic · APScheduler · Redis 7
- **Frontend web** — React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · React Query · Zustand · React Router · xyflow · react-konva
- **Mobile** — React Native (Expo)
- **Infra** — Docker Compose · Traefik (v2/v3) · Let's Encrypt · S3 / local storage
- **Déploiement** — vanilla `docker compose` ou n'importe quel control plane (Dokploy, Coolify, EasyPanel, Caprover, Portainer)

[:material-vector-arrange-below: Architecture détaillée](STACK.md){ .md-button }

---

## Communauté & support

- :material-github: [Issues GitHub](https://github.com/hmunyeku/OPSFLUX/issues) — bugs, demandes
- :material-book-open: [Spécifications complètes](rebuilt/README.md) — la "doc cible" architectes/devs
- :material-history: [Audits & dette technique](check/14_DOC_CODE_COHERENCE_AUDIT.md) — état réel du code vs spec
