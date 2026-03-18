# OpsFlux — Index des Cahiers des Charges Fonctionnels

> Perenco Cameroun — Mars 2026
>
> Ce répertoire contient les cahiers des charges fonctionnels de chaque module OpsFlux.
> Ces documents décrivent le comportement attendu du système du point de vue métier,
> sans détails techniques d'implémentation.

---

## Documents disponibles

| Fichier | Module | Périmètre |
|---|---|---|
| `CDC_00_CORE.md` | **Core** | Authentification, utilisateurs, droits (RBAC), délégations, notifications, audit |
| `CDC_01_ASSET_REGISTRY.md` | **Asset Registry** | Référentiel des sites et équipements, hiérarchie géographique, règles HSE par site |
| `CDC_02_TIERS.md` | **Tiers** | Référentiel des entreprises externes, portail fournisseur, sanctions |
| `CDC_03_PROJETS.md` | **Projets** | Cycle de vie des projets, WBS, planning, chemin critique, collaboration |
| `CDC_04_PLANNER.md` | **Planner** | Planification des activités sur site, capacité PAX, conflits et arbitrage |
| `CDC_05_PAXLOG.md` | **PaxLog** | Profils PAX, certifications HSE, Avis de Séjour, AVM, signalements |
| `CDC_06_TRAVELWIZ.md` | **TravelWiz** | Transport PAX et cargo, vecteurs, manifestes, ramassage, IoT |
| `CDC_07_IA_MCP.md` | **IA & MCP** | Assistant IA, matching SAP, détection d'anomalies, base de connaissances |
| `CDC_08_REPORT_EDITOR.md` | **Report Editor** | Création et validation de documents, collaboration, export |
| `CDC_09_DASHBOARD_ADMIN.md` | **Dashboard & Admin** | Tableaux de bord personnalisables, administration système |

---

## Guide de lecture

Les cahiers des charges fonctionnels sont rédigés **sans jargon technique**. Ils sont destinés à :
- Les équipes métier qui souhaitent comprendre et valider les fonctionnalités
- Les nouveaux membres de l'équipe projet
- Les auditeurs et parties prenantes externes

Pour les spécifications techniques (API, modèle de données, code), se référer aux fichiers `NN_MODULE_*.md` de la spec technique.

---

## Interactions entre modules

```
Asset Registry ─────────────┬─────────────────────────────────────┐
                            │ (sites, capacités, règles HSE)      │
                            ↓                                      ↓
Tiers ──────────────→  PaxLog ──────→ Planner             TravelWiz
(entreprises)        (AdS, compliance,  (activités,          (voyages,
(profils PAX)         AVM, signalements)  capacité, conflits)   cargo)
                            │
                            ↓
                         Projets
                    (WBS, planning)
                            │
                            ↓
                         Planner
                    (activités terrain)
```

**Flux principal d'une mobilisation :**
1. L'asset existe dans **Asset Registry** avec ses règles HSE
2. Le projet est défini dans **Projets** avec son planning
3. L'activité terrain est planifiée dans **Planner** (réservation de capacité)
4. L'Avis de Séjour est soumis dans **PaxLog** (conformité HSE + validation)
5. TravelWiz récupère automatiquement les PAX approuvés pour les manifestes
6. Le capitaine pointe l'embarquement, les données remontent dans **TravelWiz**
7. Le retour est tracé → l'AdS **PaxLog** est clôturée automatiquement
