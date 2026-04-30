# Modules

OpsFlux est une plateforme **Core + Modules**. Le core fournit
l'authentification, le workflow engine, les notifications, le storage,
le multi-tenant et l'i18n. Chaque module métier s'y branche au démarrage
via le `ModuleRegistry`.

Cette section est la **doc utilisateur final**. Pour la spec
architecturale (modèle de données, API, permissions, événements émis),
voir [Spécifications → Modules](../rebuilt/modules/PAXLOG.md).

## État de la doc utilisateur

La doc utilisateur est en construction module par module. Chaque page
suit le même plan :

1. **À quoi ça sert** — problème métier résolu
2. **Concepts clés** — vocabulaire et entités principales
3. **Workflow type** — diagramme + step-by-step
4. **Procédures utilisateur** — comment faire X dans l'UI
5. **Permissions et rôles** — qui peut quoi
6. **Pièges & FAQ** — erreurs fréquentes, troubleshooting
7. **Liens** — spec, audits, ADR

| Module | Doc utilisateur | Spec architecturale |
|---|---|---|
| **PaxLog** | [Disponible](paxlog.md) | [Spec](../rebuilt/modules/PAXLOG.md) |
| **MOC** | [Disponible](MOC.md) | spec à venir |
| **TravelWiz** | À venir | [Spec](../rebuilt/modules/TRAVELWIZ.md) |
| **PackLog** | À venir | à venir |
| **Tiers** | À venir | [Spec](../rebuilt/modules/TIERS.md) |
| **Projets** | À venir | [Spec](../rebuilt/modules/PROJETS.md) |
| **Planner** | À venir | [Spec](../rebuilt/modules/PLANNER.md) |
| **Conformité** | À venir | [Spec](../rebuilt/modules/CONFORMITE.md) |
| **Papyrus** | À venir | [Spec](../rebuilt/modules/PAPYRUS.md) |
| **PID/PFD** | À venir | [Spec](../rebuilt/modules/PID_PFD.md) |
| **Asset Registry** | À venir | [Spec](../rebuilt/modules/ASSET_REGISTRY.md) |
| **Imputations** | À venir | [Spec](../rebuilt/modules/IMPUTATIONS.md) |
| **Workflow** | À venir | [Spec](../rebuilt/modules/WORKFLOW.md) |
| **Support** | À venir | [Spec](../rebuilt/modules/SUPPORT.md) |
| **Dashboard** | À venir | [Spec](../rebuilt/modules/DASHBOARD.md) |

## Comment lire la doc d'un module

Chaque page module commence par un **résumé en 30 secondes** : le
problème métier résolu et les 3-5 concepts à maîtriser. Si tu n'as
besoin que d'une vue d'ensemble, lis ce bloc et arrête-toi là.

Les sections suivantes sont **indépendantes** : un manager habilitations
peut sauter directement au workflow ADS sans lire le workflow AVM, par
exemple.

Les **diagrammes Mermaid** sont cliquables : zoom dans le navigateur
si besoin.

---

!!! info "Tu veux contribuer ?"

    Ajouter une page module suit le template de [PaxLog](paxlog.md).
    Forke, copie le template, remplis. Ouvre une PR.

    Une page module bien faite tient en **800-1200 lignes** : assez pour
    couvrir les workflows et les pièges, pas tellement qu'on s'y noie.
