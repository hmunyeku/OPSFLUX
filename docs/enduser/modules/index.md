# Modules — espace utilisateur

Cette section explique **comment chaque module fonctionne au quotidien**
pour ses utilisateurs : workflows, procédures pas-à-pas, pièges
fréquents, FAQ.

Pour la spécification architecturale (modèle de données, API, événements,
permissions techniques), voir l'[Espace Développeur](../../developer/architecture/system-overview.md)
*(authentification requise)*.

## Format des pages module

Chaque page module suit le même plan :

1. **Résumé en 30 secondes** — problème métier, concepts à maîtriser
2. **À quoi ça sert** — qui utilise, quel rôle, quelles permissions
3. **Concepts clés** — vocabulaire (entités principales)
4. **Architecture data** — diagramme des entités et leurs liens
5. **Workflows** — diagrammes d'états + transitions clés
6. **Step-by-step utilisateur** — par profil (demandeur, valideur, admin…)
7. **Permissions matrix** — qui voit / fait quoi
8. **Événements** — émis et consommés (intégrations cross-modules)
9. **Pièges & FAQ** — erreurs fréquentes, troubleshooting
10. **Liens** — vers la spec dev (auth requise) + code source

Les pages tiennent en **800-1500 lignes** : assez pour couvrir les
workflows et les pièges sans noyer le lecteur.

## État de la doc utilisateur

| Module | Doc utilisateur | Spec dev (auth) |
|---|---|---|
| **PaxLog** | :material-check-circle: [Disponible](paxlog.md) | [Spec](../../developer/modules-spec/PAXLOG.md) |
| **MOC** | :material-check-circle: [Disponible](MOC.md) | À venir |
| **TravelWiz** | :material-check-circle: [Disponible](travelwiz.md) | [Spec](../../developer/modules-spec/TRAVELWIZ.md) |
| **PackLog** | À venir | À venir |
| **Tiers** | À venir | [Spec](../../developer/modules-spec/TIERS.md) |
| **Projets** | À venir | [Spec](../../developer/modules-spec/PROJETS.md) |
| **Planner** | À venir | [Spec](../../developer/modules-spec/PLANNER.md) |
| **Conformité** | À venir | [Spec](../../developer/modules-spec/CONFORMITE.md) |
| **Papyrus** | À venir | [Spec](../../developer/modules-spec/PAPYRUS.md) |
| **PID/PFD** | À venir | [Spec](../../developer/modules-spec/PID_PFD.md) |
| **Asset Registry** | À venir | [Spec](../../developer/modules-spec/ASSET_REGISTRY.md) |
| **Imputations** | À venir | [Spec](../../developer/modules-spec/IMPUTATIONS.md) |
| **Workflow** | À venir | [Spec](../../developer/modules-spec/WORKFLOW.md) |
| **Support** | À venir | [Spec](../../developer/modules-spec/SUPPORT.md) |
| **Dashboard** | À venir | [Spec](../../developer/modules-spec/DASHBOARD.md) |

!!! info "Comment lire"

    Chaque page commence par un **résumé en 30 secondes** : si tu n'as
    besoin que d'une vue d'ensemble, lis ce bloc et arrête-toi là. Les
    sections suivantes sont **indépendantes** — un manager habilitations
    peut sauter directement au workflow ADS sans lire le workflow AVM,
    par exemple.
