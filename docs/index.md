---
hide:
  - navigation
  - toc
title: Bienvenue
---

# Bienvenue sur la documentation OpsFlux

**ERP industriel modulaire** — opérations, conformité, projets, logistique.

Choisissez votre destination :

<div class="grid cards" markdown>

-   :material-account-hard-hat:{ .lg .middle } &nbsp; **Espace Utilisateur**

    ---

    :material-lock-open-variant: **Libre d'accès.**

    Comprendre OpsFlux, déployer, utiliser chaque module au quotidien.

    Pour : décideurs, utilisateurs opérationnels, intégrateurs,
    administrateurs systèmes.

    [:octicons-arrow-right-24: Accéder](enduser/getting-started/overview.md){ .md-button .md-button--primary }

-   :material-code-braces:{ .lg .middle } &nbsp; **Espace Développeur**

    ---

    :material-lock: **Authentification requise.**

    Architecture, spécifications détaillées, workflows bas-niveau,
    matrices de permissions, ADR, modèle de données.

    Pour : devs OpsFlux internes + contributeurs invités.

    [:octicons-arrow-right-24: Accéder](developer/architecture/system-overview.md){ .md-button }

-   :material-web:{ .lg .middle } &nbsp; **Site vitrine**

    ---

    :material-link-variant: **Retour à www.opsflux.io.**

    Page produit, présentation marketing, contact commercial,
    démonstrations.

    [:octicons-arrow-right-24: Aller à www.opsflux.io](https://www.opsflux.io){ .md-button }

</div>

---

## En bref

OpsFlux est une plateforme **multi-tenant** pour piloter le mouvement
de personnel, le cargo, les voyages affréteurs, les projets, la
conformité réglementaire et les modifications opérationnelles
d'organisations industrielles (oil & gas, maritime, énergie).

**15 modules** s'enregistrent au démarrage via le `ModuleRegistry`.
Chacun est indépendant ; les interactions se font via le bus
d'événements interne.

| Slug | Domaine | Doc utilisateur | Spec dev :material-lock: |
|---|---|---|---|
| `paxlog` | Mouvements de personnel (ADS, AVM, conformité) | [:material-check-circle:](enduser/modules/paxlog.md) | [Spec](developer/modules-spec/PAXLOG.md) |
| `moc` | Management of Change | [:material-check-circle:](enduser/modules/MOC.md) | À venir |
| `travelwiz` | Voyages affréteurs, manifestes, captain portal | [:material-check-circle:](enduser/modules/travelwiz.md) | [Spec](developer/modules-spec/TRAVELWIZ.md) |
| `tiers` | Entreprises, contacts, identifiants légaux | À venir | [Spec](developer/modules-spec/TIERS.md) |
| `projets` | Projets multi-niveaux (WBS, CPM, ressources) | À venir | [Spec](developer/modules-spec/PROJETS.md) |
| `planner` | Planification opérationnelle (heatmap, gantt) | À venir | [Spec](developer/modules-spec/PLANNER.md) |
| `packlog` | Cargo & emballage tracé QR | À venir | À venir |
| `conformite` | Référentiel, règles, exemptions, fiches de poste | À venir | [Spec](developer/modules-spec/CONFORMITE.md) |
| `papyrus` | Documents structurés versionnés, templates, dispatch | À venir | [Spec](developer/modules-spec/PAPYRUS.md) |
| `pid_pfd` | P&ID / PFD éditeur (xyflow + import) | À venir | [Spec](developer/modules-spec/PID_PFD.md) |
| `asset_registry` | Hiérarchie assets O&G + civil | À venir | [Spec](developer/modules-spec/ASSET_REGISTRY.md) |
| `imputations` | Comptes analytiques, taux de change, OTP | À venir | [Spec](developer/modules-spec/IMPUTATIONS.md) |
| `workflow` | Moteur d'états (FSM générique) | À venir | [Spec](developer/modules-spec/WORKFLOW.md) |
| `support` | Tickets, agent IA auto-fix avec workflow CI | À venir | [Spec](developer/modules-spec/SUPPORT.md) |
| `dashboard` | Hybride : onglets rôle + GridStack libre | À venir | [Spec](developer/modules-spec/DASHBOARD.md) |

---

## Stack technique

Backend Python 3.12 / FastAPI / SQLAlchemy 2 async / PostgreSQL 16
(pgvector + PostGIS + ltree + pg_trgm) / Redis 7. Frontend React 18 /
TypeScript / Vite / TailwindCSS / shadcn/ui. Mobile React Native (Expo).
Infra Docker Compose / Traefik / Let's Encrypt.

[:material-vector-arrange-below: Architecture détaillée](enduser/getting-started/stack.md){ .md-button } &nbsp;
[:material-rocket-launch: Guide de déploiement](enduser/getting-started/deploy.md){ .md-button } &nbsp;
[:material-github: Code source](https://github.com/hmunyeku/OPSFLUX){ .md-button }
