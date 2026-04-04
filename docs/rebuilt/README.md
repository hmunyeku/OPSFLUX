# OpsFlux Documentation Rebuilt

Date: 2026-04-03

## Objet

Ce dossier reconstruit la documentation d'OpsFlux dans une logique plus simple:

- une vue système
- une référence Core
- des docs module par module
- des workflows multi-modules
- un cadre PDCA pour piloter l'évolution
- des règles UI/UX transverses
- un plan de remise en état rapide de PaxLog

Ces documents ont vocation à devenir la **nouvelle base de référence**.
Les anciens docs restent utiles comme matière source, mais ne doivent plus être
considérés comme la description unique de la réalité du système.

Statut officiel au 3 avril 2026:

- `docs/rebuilt/` = référence officielle
- le reste de `docs/` = legacy / archive / source secondaire

## Ordre de lecture

1. [00_SYSTEM_OVERVIEW.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/00_SYSTEM_OVERVIEW.md)
2. [01_CORE_REFERENCE.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/01_CORE_REFERENCE.md)
3. [02_PDCA_EXECUTION_MODEL.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/02_PDCA_EXECUTION_MODEL.md)
4. [03_CROSS_MODULE_WORKFLOWS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/03_CROSS_MODULE_WORKFLOWS.md)
5. [04_UI_UX_RULES.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/04_UI_UX_RULES.md)
6. [05_PAXLOG_WEEKEND_PLAN.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/05_PAXLOG_WEEKEND_PLAN.md)
7. [06_EXPLICIT_PLATFORM_AUDIT.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/06_EXPLICIT_PLATFORM_AUDIT.md)
8. [07_SECURITY_FIRST_CODE_PLAN.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/07_SECURITY_FIRST_CODE_PLAN.md)
9. [08_DEEP_FUNCTIONAL_ANALYSIS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/08_DEEP_FUNCTIONAL_ANALYSIS.md)
10. [09_ROLE_VIEW_PERMISSION_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/09_ROLE_VIEW_PERMISSION_MATRIX.md)
11. [10_ORG_ASSET_MODEL_AUDIT.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/10_ORG_ASSET_MODEL_AUDIT.md)
12. [11_ENTITY_BU_ASSET_OPERATING_MODEL.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/11_ENTITY_BU_ASSET_OPERATING_MODEL.md)
13. [12_REUSABLE_AND_POLYMORPHIC_COMPONENTS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/12_REUSABLE_AND_POLYMORPHIC_COMPONENTS.md)
14. [13_IMPUTATION_MODULE_TARGET.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/13_IMPUTATION_MODULE_TARGET.md)
15. [14_ALLOWED_OWNER_TYPES_AND_POLYMORPHIC_SECURITY.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/14_ALLOWED_OWNER_TYPES_AND_POLYMORPHIC_SECURITY.md)
16. [15_ROLE_TO_PERMISSION_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/15_ROLE_TO_PERMISSION_MATRIX.md)
17. [16_MODULE_VIEW_PERMISSIONS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/16_MODULE_VIEW_PERMISSIONS.md)
18. [17_STATUS_ACTION_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/17_STATUS_ACTION_MATRIX.md)
19. [18_EXECUTION_BACKLOG.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/18_EXECUTION_BACKLOG.md)
20. [19_WORKFLOW_ENGINE_AUDIT.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/19_WORKFLOW_ENGINE_AUDIT.md)
21. [20_WORKFLOW_ADS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/20_WORKFLOW_ADS.md)
22. [21_WORKFLOW_AVM.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/21_WORKFLOW_AVM.md)
23. [22_WORKFLOW_DOCUMENT.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/22_WORKFLOW_DOCUMENT.md)
24. [23_WORKFLOW_PID.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/23_WORKFLOW_PID.md)
25. [24_WORKFLOW_SUPPORT_TICKET.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/24_WORKFLOW_SUPPORT_TICKET.md)
26. [25_OWNER_TYPE_ENDPOINT_PERMISSION_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/25_OWNER_TYPE_ENDPOINT_PERMISSION_MATRIX.md)
27. [26_MODULE_HOME_RESOLVERS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/26_MODULE_HOME_RESOLVERS.md)
28. [27_WORKFLOW_DRIVEN_OBJECT_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/27_WORKFLOW_DRIVEN_OBJECT_MATRIX.md)
29. [28_TICKET_ACCEPTANCE_AND_TESTS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/28_TICKET_ACCEPTANCE_AND_TESTS.md)
30. [29_FILE_LEVEL_IMPLEMENTATION_PLAN.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/29_FILE_LEVEL_IMPLEMENTATION_PLAN.md)
31. [30_ROUTE_PERMISSION_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/30_ROUTE_PERMISSION_MATRIX.md)
32. [31_REFERENCE_TEST_DATASET.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/31_REFERENCE_TEST_DATASET.md)
33. [32_MODULE_GAP_MATRIX.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/32_MODULE_GAP_MATRIX.md)
34. [33_PAXLOG_FUNCTIONAL_RECIPE.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/33_PAXLOG_FUNCTIONAL_RECIPE.md)

## Modules

- [ASSET_REGISTRY.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/ASSET_REGISTRY.md)
- [TIERS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/TIERS.md)
- [DASHBOARD.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/DASHBOARD.md)
- [WORKFLOW.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/WORKFLOW.md)
- [PAXLOG.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/PAXLOG.md)
- [CONFORMITE.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/CONFORMITE.md)
- [PROJETS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/PROJETS.md)
- [PLANNER.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/PLANNER.md)
- [TRAVELWIZ.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/TRAVELWIZ.md)
- [REPORT_EDITOR.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/REPORT_EDITOR.md)
- [PID_PFD.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/PID_PFD.md)
- [MESSAGING.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/MESSAGING.md)
- [SUPPORT.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/SUPPORT.md)
- [IMPUTATIONS.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/rebuilt/modules/IMPUTATIONS.md)

## Règle de maintenance documentaire

Chaque évolution produit doit mettre à jour au minimum:

1. le module concerné
2. le workflow multi-module concerné si l'impact dépasse le module
3. la référence Core si l'impact touche auth, settings, events, permissions, multi-entité ou design system
