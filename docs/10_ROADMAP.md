# OpsFlux — 08_ROADMAP.md
# Roadmap Complète — Développement PDCA Solo

> **Règle absolue** : ne jamais passer à la phase suivante avant que la phase en cours
> soit **FONCTIONNELLE + TESTÉE + DÉPLOYÉE sur staging + VALIDÉE par un utilisateur réel**.

---

## Checklist de fin de phase (obligatoire avant de continuer)

```
□  Tous les critères PDCA de la phase sont satisfaits (vert)
□  0 bug bloquant connu (les non-bloquants sont documentés dans le backlog)
□  alembic upgrade head fonctionne sur une DB vide fraîche
□  Tests critiques (endpoints + services clés) passent en CI
□  Au moins 1 utilisateur Perenco a testé la fonctionnalité en conditions réelles
□  Variables d'env nouvelles documentées dans .env.example
□  Déployé et fonctionnel sur staging (URL: https://opsflux-staging.perenco.com)
□  CHANGELOG.md mis à jour avec les features de la phase
□  README.md mis à jour si nouvelle dépendance ou setup requis
```

---

## Vue d'ensemble

| Phase | Module | Durée | Dépend de | Statut |
|---|---|---|---|---|
| **P0** | Foundation : repo, infra, SSO, CI/CD | 4 sem. | — | 🔴 À faire |
| **P1** | Core Objects : arborescence, nomenclature, custom fields | 3 sem. | P0 | ⬜ |
| **P2** | Asset Registry + Tiers | 4 sem. | P1 | ⬜ |
| **P3** | Templates + RBAC + Module Settings | 3 sem. | P1 | ⬜ |
| **P4** | Éditeur BlockNote + Offline | 5 sem. | P3 | ⬜ |
| **P5** | Workflow de Validation | 5 sem. | P3 + P4 | ⬜ |
| **P6** | Collaboration RT + Connecteurs | 6 sem. | P4 | ⬜ |
| **P7** | Dashboard Engine | 4 sem. | P1 + P6 | ⬜ |
| **P8** | PID/PFD Intelligent | 12 sem. | P2 + P6 | ⬜ |
| **P9** | Couche IA & MCP Server | 6 sem. | P4 + P6 | ⬜ |

**Total estimé** : ~52 semaines développement solo

---

## Phase 0 — Foundation (4 semaines) 🔴 BLOQUANT

> Rien ne peut commencer avant P0. C'est le socle de toute la plateforme.

### Objectif
Application OpsFlux déployée sur 3 environnements, sécurisée, avec SSO fonctionnel,
multi-tenant opérationnel, CI/CD automatisé, et accès Claude Code remote sans blocage.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Créer repo GitHub `opsflux` avec branches `main`, `develop`, `feature/*` + protections | Push sur main bloqué sans PR, CI requise | 0.5j |
| PLAN | Créer `.env.example` avec TOUTES les variables (voir 00_PROJECT.md §7) | Nouvelle personne peut démarrer avec cp .env.example .env.dev | 0.5j |
| DO | Déployer `fastapi/full-stack-fastapi-template` en local avec Docker Compose | `docker compose up` → frontend React + API FastAPI + PostgreSQL OK | 1j |
| DO | Adapter le template : supprimer le code exemple, garder l'infrastructure | Structure de dossiers conforme à 00_PROJECT.md §4 | 1j |
| DO | PostgreSQL 16 + pgvector installé + Alembic configuré + migration initiale (tables Core) | `alembic upgrade head` crée toutes les tables Core en DB vide | 2j |
| DO | Redis démarré et connecté à APScheduler | Worker APScheduler démarre sans erreur | 0.5j |
| DO | Intégrer OAuth2/OIDC avec l'Identity Provider Perenco (protocole OIDC) | Login via SSO → token JWT avec user_id + entity_id → API répond 200 | 3j |
| DO | Implémenter TenantMiddleware + RBAC middleware + BU scope injection | Endpoint avec `@requires_permission("document.read")` retourne 403 sans le bon rôle | 2j |
| DO | Modèle multi-tenant : tables tenants, user_tenants, business_units + API CRUD | Créer 2 tenants, assigner un user avec rôles différents, switcher via token | 2j |
| DO | Frontend React + Vite + TailwindCSS + shadcn/ui : shell vide avec topbar + sidebar vide | App accessible sur http://localhost:5173 avec login SSO qui fonctionne | 2j |
| DO | Mettre en place les 3 environnements sur Dokploy (dev/staging/prod) avec Docker Compose | 3 URLs HTTPS accessibles et distinctes, chacune avec sa DB | 2j |
| DO | CI/CD GitHub Actions : lint + test + build + deploy staging auto (voir 00_PROJECT.md §8) | Push sur `develop` → staging déployé automatiquement en < 5 min | 1j |
| DO | Configurer accès Claude Code remote : GitHub PAT + SSH VPS + Dokploy API token | Claude Code peut push, SSH sur VPS, trigger un deploy Dokploy | 0.5j |
| CHECK | Login SSO sur les 3 envs, switch tenant, RBAC vérifié, 403 correct | Matrice RBAC : 6 rôles × 5 endpoints testés, 0 régression | 2j |
| CHECK | CI verte sur push, deploy staging auto déclenché | Temps de déploiement staging < 5 min mesuré | 0.5j |
| ACT | Déployer P0 en production, documenter dans CHANGELOG.md | URL prod accessible par 3 utilisateurs Perenco test, 0 bug bloquant | 0.5j |

---

## Phase 1 — Core Objects & Arborescence (3 semaines)

### Objectif
Le système peut créer des projets avec arborescence, définir des types de documents
avec nomenclature, créer et versionner des documents vides, et gérer les custom fields.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | ERD complet : projects, arborescence_nodes, doc_types, document_sequences, documents, revisions | ERD sur papier/Mermaid validé, 0 champ manquant | 1j |
| DO | Migrations Alembic pour les tables Module Report (sans les tables template/BlockNote) | `alembic upgrade head` crée les tables | 1j |
| DO | API CRUD projects : POST /projects, GET /projects, PUT /projects/{id} | Tests pytest : créer projet BIPAGA, lister, modifier le statut | 1j |
| DO | API arborescence : POST /projects/{id}/nodes, drag & drop reorder | Créer arborescence 3 niveaux : BIPAGA > Procédé > Rapports | 1j |
| DO | Service nomenclature : parser patterns + séquences atomiques + `generate_document_number()` | 100 appels parallèles → 0 doublon, séquences correctes | 2j |
| DO | API CRUD doc_types + test des patterns | Créer type RPT avec pattern `PCM-{PROJ}-{DISC}-{SEQ:4}` | 1j |
| DO | API CRUD documents : créer, changer statut, créer révision | Créer RPT-PCM-BIPAGA-0001, statut "draft", révision "0" | 2j |
| DO | Custom Fields Engine : API CRUD definitions + valeurs | Ajouter champ "platform_code" sur "document", sauvegarder une valeur | 2j |
| DO | UI : gestionnaire de projets + arborescence (TreeView drag & drop avec shadcn/ui) | Créer projet, ajouter 3 niveaux d'arborescence en UI | 2j |
| DO | UI : configurateur de nomenclature (tokens disponibles, preview temps réel) | Saisir pattern → preview "PCM-BIPAGA-PROC-0042" mis à jour en direct | 1j |
| CHECK | Scénario : créer projet BIPAGA → type RPT → doc RPT-PCM-BIPAGA-0001-0 avec 2 custom fields | Numéro correct, statut draft, custom fields en DB, révision "0" | 1j |
| ACT | Démo à 2 utilisateurs Perenco. Feedback documenté dans backlog GitHub (Issues) | Au moins 1 projet réel créé par un utilisateur | 1j |

---

## Phase 2 — Asset Registry + Tiers (4 semaines)

### Objectif
Asset Registry avec les 4 types Perenco prédéfinis, importables depuis CSV.
Module Tiers avec contacts et tiers virtuel. Géolocalisation et vue carte.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | ERD Asset Registry + Module Tiers (voir 05_ASSET_REGISTRY.md §4 et 06_TIERS.md §3) | ERD validé, migrations préparées | 1j |
| DO | Migrations Alembic : asset_types, assets, tiers, tiers_addresses, contacts | `alembic upgrade head` sans erreur | 1j |
| DO | Script d'initialisation : créer les 4 types Perenco prédéfinis (oil_field, platform, well, logistics_asset) via PERENCO_PREDEFINED_TYPES | Les 4 types apparaissent dans GET /asset-types | 2j |
| DO | API CRUD assets dynamique : endpoints générés par type_slug | Tests : CRUD complet sur type "platform" | 3j |
| DO | UI AssetListView générique : colonnes auto-générées depuis les champs du type | Liste plateformes avec colonnes code/nom/statut/type | 2j |
| DO | UI AssetFormView générique : formulaire auto-généré selon les champs | Créer une plateforme avec ses 8 champs | 2j |
| DO | Import CSV en 3 étapes (upload → mapping → import) avec rapport d'erreurs | Import 20 plateformes depuis CSV, rapport clair si 2 erreurs | 3j |
| DO | Schema Builder UI : admin peut créer un nouveau Asset Type | Créer type "Zone HSE" avec 4 champs custom | 3j |
| DO | Module Tiers : CRUD tiers + contacts + tiers virtuel auto | Créer contact sans tiers → tiers virtuel créé auto | 3j |
| DO | Géolocalisation : champs lat/lng + vue carte Leaflet/OSM + clustering | Carte avec 5 plateformes cliquables, clustering si zoom out | 2j |
| DO | Toggle vue liste / vue carte dans la toolbar des assets | Switch immédiat sans rechargement | 1j |
| CHECK | Importer 10 plateformes BIPAGA depuis CSV → vérifier carte + custom fields + export CSV | Toutes les données cohérentes, export CSV identique à l'import | 2j |
| ACT | Former 1 admin Perenco : créer un type d'asset custom + importer une liste | Admin autonome, sans aide, crée un type "Contrat" avec import | 1j |

---

## Phase 3 — Templates + RBAC + Module Settings (3 semaines)

### Objectif
Un Template Manager peut créer un template complet. L'interface RBAC est opérationnelle.
Les settings des modules sont auto-générés depuis les manifests.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Définir le JSON schema complet d'un template (voir modules/v2/REPORT_EDITOR.md §4) | Schema documenté dans le code (Pydantic TemplateSchema) | 1j |
| DO | Migrations templates + template_fields | Tables créées | 0.5j |
| DO | API CRUD templates : créer, versionner, activer/désactiver | Créer template "Rapport Journalier" v1, puis v2, v1 reste accessible | 2j |
| DO | Template Builder UI — Sections : ajouter/supprimer/réordonner des sections | Créer 4 sections différentes (cartouche, form, rich_text, dynamic) | 3j |
| DO | Template Builder UI — Champs formulaire : 8 types (text, number, date, select, reference, file, table, dynamic) | Ajouter 8 champs typés avec options et validation | 3j |
| DO | Styles imposés : configurer via Template Builder → appliqués à l'éditeur | Police Arial 11pt dans le template → non modifiable par l'éditeur | 1j |
| DO | Interface admin RBAC : gérer rôles (6 rôles système), permissions, assignations users | Assigner rôle "editor" à un user, vérifier qu'il ne peut pas approuver | 2j |
| DO | RBAC : délégation de permission temporaire | User A délègue sa validation à User B jusqu'au vendredi | 1j |
| DO | Module Settings UI : chargement auto depuis manifests | Settings du module "report_editor" visibles dans Settings → Modules | 1j |
| DO | Prévisualisation template : aperçu rendu dans l'éditeur avant utilisation | Cliquer "Aperçu" → rendu fidèle du template dans une modale | 1j |
| CHECK | Créer template "Rapport Journalier Production" avec cartouche + 6 champs form + 1 section rich_text | Un Editor peut créer un doc depuis ce template, styles respectés | 1j |
| ACT | 3 templates créés par les Template Managers Perenco (sans aide du développeur) | Templates actifs et utilisables par les editors | 1j |

---

## Phase 4 — Éditeur BlockNote + Offline (5 semaines)

### Objectif
Éditeur riche fonctionnel avec tous les blocs custom. Mode offline complet.
Export PDF et DOCX conformes au template.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Setup BlockNote + configuration extensions + dépendances npm | `npm run dev` lance l'éditeur BlockNote vide sans erreur | 1j |
| DO | CartoucheBlock : rendu non-éditable, auto-valeurs depuis le document | Cartouche affiché avec numéro, titre, date, révision auto-remplis | 2j |
| DO | FormBlock : grille de champs depuis la section template, onChange → form_data | Remplir 6 champs → form_data mis à jour dans l'état React | 3j |
| DO | DynamicDataBlock : connecteur → tableau ou graphique dans l'éditeur | Bloc avec données mockées (connecteur réel en Phase 6) | 2j |
| DO | TableFormBlock : grille de saisie multi-lignes (arrêts, événements) | Ajouter 3 lignes dans le tableau "Arrêts et événements" | 2j |
| DO | Sauvegarde auto vers IndexedDB (30s) + sync API (debounce 30s) | Fermer onglet → rouvrir → contenu récupéré depuis IndexedDB | 2j |
| DO | Mode offline : Service Worker Workbox + Dexie.js schema + sync queue | Couper le réseau → éditer 20 min → reconnecter → sync propre | 3j |
| DO | Gestion quota IndexedDB : LRU eviction à 50MB | Remplir 55MB → brouillons anciens syncs supprimés automatiquement | 1j |
| DO | Images offline : upload → base64 → IndexedDB → sync à la reconnexion | Insérer image offline → visible après reconnexion | 2j |
| DO | Indicateur UI offline : badge rouge "Hors-ligne" + indicateur "Sauvegardé" / "En attente de sync" | User voit clairement s'il est offline et l'état de sa sauvegarde | 1j |
| DO | Export PDF Puppeteer : styles template, cartouche, pagination, footer page X/Y | PDF A4 de 2 pages conforme au template Perenco (vérifier manuellement) | 3j |
| DO | Export DOCX : BlockNote JSON → docx.js avec styles | DOCX téléchargeable avec styles, tableaux, images | 2j |
| CHECK | Scénario offshore : créer rapport BIPAGA offline 45 min (avec image) → reconnecter → sync → export PDF | 0 perte données, PDF conforme, image présente, sync en < 30s | 2j |
| ACT | Test sur connexion 50kbps simulée (throttling DevTools). Optimisations si > 5s de lag | Latence de sauvegarde acceptable documentée | 2j |

---

## Phase 5 — Workflow de Validation (5 semaines)

### Objectif
Un workflow visuel peut être défini et appliqué à un document.
Validateurs notifiés, délégations, deadlines et relances opérationnels.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Modéliser FSM : nœuds, edges, états, transitions (voir 01_CORE.md §4) | ERD workflow_definitions + instances + transitions + delegations | 1j |
| DO | Migration Alembic pour les tables workflow | Tables créées | 0.5j |
| DO | Éditeur React Flow : palette de nœuds (start, sequential, parallel, conditional, notification, end) | Créer un workflow 4 nœuds, sauvegarder en JSON en DB | 4j |
| DO | Configuration par nœud : assignee_role, deadline_days, rejection_target, threshold | Modal de config par nœud avec formulaire complet | 2j |
| DO | WorkflowFSM Python : interpréter JSON React Flow, `start()` et `transition()` | Soumettre un doc → instance créée → nœud 1 actif | 3j |
| DO | Gestion parallèle : nœud parallel → N validateurs simultanés, seuil "all" ou "majority" | 3 validateurs assignés, passe si 2/3 approuvent | 2j |
| DO | Gestion conditionnel : brancher selon valeur form_data | Workflow branché selon `form_data.daily_oil_bbl > 10000` | 2j |
| DO | Interface validateur : liste "À valider" avec filtres, boutons Approuver/Rejeter + commentaire obligatoire | Appuyer "Approuver" → statut document change → suivant notifié | 2j |
| DO | Notifications email + in-app (WebSocket) à chaque transition | Email reçu < 2 min après soumission, notif in-app en temps réel | 2j |
| DO | Délégation : User A délègue à User B avec date de fin | B voit les docs à valider de A pendant la période | 1j |
| DO | Deadlines : job APScheduler `check_workflow_deadlines` → alertes J-2 et J+0 | Recommandation "Validation en retard" créée à J+1 | 2j |
| DO | Rejeter → retour au nœud configuré avec commentaire obligatoire | Rejet → doc revient au rédacteur avec le motif affiché | 1j |
| CHECK | Cycle complet : brouillon → soumettre → 2 validateurs parallèles (seuil majority) → 1 rejette avec motif → correction → 2 approuvent → publié | Historique de 7 transitions immuable en DB, statut final "published" | 2j |
| ACT | Créer les workflows réels pour 3 types de documents Perenco | 3 workflows en production testés par de vrais utilisateurs | 2j |

---

## Phase 6 — Collaboration RT + Connecteurs (6 semaines)

### Objectif
Édition simultanée avec Yjs. Connecteurs de données (Excel, API REST, DCS).
Blocs dynamiques dans l'éditeur.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Architecture Yjs + Hocuspocus + schéma connecteurs (types, requêtes, cache) | Documenté, test de latence Hocuspocus local < 50ms | 1j |
| DO | Déployer Hocuspocus en Docker, connexion BlockNote + Yjs | 2 onglets simultanés sur le même document → édition en sync | 3j |
| DO | Curseurs nommés (Awareness Yjs) + liste des présents | Voir le curseur rouge "Marie" dans l'éditeur de "Pierre" | 1j |
| DO | Persistence Yjs en DB (yjs_state BYTEA dans revisions) | Rejoindre un doc en cours → état complet chargé | 2j |
| DO | Merge CRDT offline → online (cas edge documentés dans modules/v2/REPORT_EDITOR.md §6) | User offline 30 min + user online modifient la même section → merge propre | 3j |
| DO | Connector Manager UI : créer/tester connecteur Excel, API REST, CSV DCS | Connecteur "DCS BIPAGA CSV" : charger fichier CSV, voir preview 5 lignes | 4j |
| DO | API REST connector : URL + headers + params + JSONPath | Connecteur météo offshore : données JSON récupérées et affichées | 2j |
| DO | DB connector : connexion PostgreSQL externe + requête SQL | Connecteur DB interne : SELECT sur table historique | 2j |
| DO | DynamicDataBlock complet : connecté à un vrai connecteur | Bloc "Tendance 7j" avec données réelles du connecteur DCS BIPAGA | 3j |
| DO | Mode snapshot vs live : configurable par bloc | PDF exporté avec snapshot figé, bloc live mis à jour à l'ouverture | 2j |
| DO | Graphique auto-généré dans un bloc (Recharts) | Bloc "Débit 7j" affiché comme courbe Recharts dans l'éditeur | 2j |
| CHECK | Rapport journalier avec : 3 éditeurs simultanés + tableau débit CSV + graphique tendance + météo API + export PDF | PDF correct avec données connecteurs, 0 conflit de collaboration | 2j |
| ACT | Former 2 Template Managers à la création de connecteurs | 2 connecteurs créés autonomement, sans aide | 1j |

---

## Phase 7 — Dashboard Engine (4 semaines)

### Objectif
Dashboard complet avec GridStack, 7 types de widgets, permissions granulaires,
home page par rôle, SQL sécurisé.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Migrations : dashboards, dashboard_permissions, home_page_settings, widget_cache | Tables créées | 0.5j |
| DO | DashboardContainer mode édition : GridStack 12 colonnes + drag + resize + undo/redo 50 états | Déplacer, redimensionner, annuler la dernière action | 4j |
| DO | DashboardContainer mode visualisation : read-only + auto-refresh configurable | Mode vue sans possibilité de modifier, refresh sur interval | 2j |
| DO | WidgetCard : en-tête avec refresh, fullscreen, export, config, delete | Cliquer fullscreen → widget plein écran, cliquer refresh → données rechargées | 2j |
| DO | Widget Chart (Recharts) : line, bar, pie, area — données depuis connecteur | Graphique "Production 7j" avec données DCS BIPAGA | 3j |
| DO | Widget Table (TanStack) : tri, filtre, pagination, export CSV | Tableau de 100 lignes avec tri colonne, export CSV téléchargeable | 2j |
| DO | Widget KPI : valeur + comparaison période + alerte + trend mini-graph | KPI rouge si débit < 10 000 bbl | 2j |
| DO | Widget Carte (Leaflet) : assets géolocalisés depuis asset_registry | Carte avec 5 plateformes, click → fiche asset | 1j |
| DO | Widget SQL sécurisé : éditeur SQL + validation + résultat | SELECT valid → résultat, INSERT → erreur 403 | 3j |
| DO | Widget Pivot (PivotTable.js) : tableau croisé avec drill-down | Pivot production par plateforme × mois | 2j |
| DO | Permissions dashboard granulaires + résolution home page (user > rôle > BU > global) | Manager se connecte → son dashboard par défaut s'affiche | 2j |
| DO | Navigation : dashboard dans sidebar module + badge | "Production BIPAGA" visible sous "Rédacteur" dans sidebar | 1j |
| DO | Import/Export JSON dashboard avec validation connecteurs | Export JSON → importer sur autre tenant → dashboard fonctionnel | 2j |
| CHECK | Dashboard "Production BIPAGA" : KPI + chart + SQL + carte + home page par défaut pour managers | Dashboard opérationnel, home page correcte selon rôle, SQL sécurisé | 2j |
| ACT | 5 dashboards créés par utilisateurs réels (pas par développeur) | Feedback utilisateurs documenté dans backlog GitHub | 2j |

---

## Phase 8 — PID/PFD Intelligent (12 semaines)

### Objectif
draw.io intelligent avec binding DB. Library Builder. TagRegistry complet.
Traçage multi-PID. Export SVG/PDF A1/DXF.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | ERD engineering validé avec ingénieurs procédé Perenco (voir 03_PID_PFD.md §4) | Tables pid_documents, equipment, process_lines, connections, dcs_tags, lib_items | 3j |
| DO | Migrations Alembic pour toutes les tables engineering | `alembic upgrade head` sans erreur | 1j |
| DO | Intégration draw.io iframe API : ouvrir/fermer/sauvegarder XML mxGraph depuis React | draw.io s'ouvre en iframe, fermeture → XML sauvegardé en DB | 3j |
| DO | Parser XML → DB : `parse_and_sync_pid()` — détecter équipements et lignes | Poser une "pompe" → equipment record créé en DB | 5j |
| DO | Panneau propriétés : cliquer sur un objet draw.io → afficher/éditer ses propriétés | Modifier `design_pressure` d'un équipement → mis à jour en DB | 3j |
| DO | Library Builder : UI de création d'un objet process (SVG + propriétés + connexions) | Créer objet "Pompe centrifuge" avec 4 propriétés et 3 points de connexion | 6j |
| DO | Library Builder : importer les typicals AutoCAD → convertir en objets OpsFlux | 5 typicals DWG/DXF convertis et utilisables dans draw.io | 8j |
| DO | TagRegistry : import CSV Rockwell, validation doublons, contrôle cohérence | Import 100 tags CSV → 0 doublon, erreurs clairement signalées | 4j |
| DO | TagRegistry : formulaire visuel de nommage → pattern DSL + validation | Configurer règle `{AREA}-{TYPE}-{SEQ:3}` → preview "BIP-PT-001" | 3j |
| DO | Suggestions nommage tag via LLM + règles contextuelles | Créer tag PT pour V-101 en zone BIP → suggestion "BIP-PT-XXX" pertinente | 3j |
| DO | Renommage tag sur interface PID : double-clic → renommage avec propagation | Renommer "BIP-PT-001" → "BIP-PT-101" → propagé dans tous les PID | 3j |
| DO | Continuation flags multi-PID : marker de continuation + référence PID cible | Ligne `6"-HC-001` tracée sur 2 PID → graphe en DB correct | 4j |
| DO | API traçage : `trace_process_line("6-HC-001")` → liste de PID + positions | GET /pid/trace/line → retourne 2 PID avec coordonnées dans chacun | 2j |
| DO | Versioning PID : créer révision + diff visuel (objets ajoutés/supprimés/modifiés) | Diff Rev 0 → Rev A : 3 équipements ajoutés listés clairement | 5j |
| DO | Recherche globale équipement → PID → position exacte dans draw.io | Chercher "V-101" → cliquer → PID s'ouvre centré sur V-101 | 3j |
| DO | Export SVG haute résolution + PDF A1 avec cartouche + DXF basique | PDF A1 imprimable avec cartouche Perenco officiel | 4j |
| CHECK | PID BIPAGA complet : 10 équipements, 3 lignes multi-PID, 50 tags importés, export PDF A1 | Toutes les données cohérentes en DB, PDF A1 imprimable, diff Rev 0→A clair | 5j |
| ACT | Conversion progressive de 3 PID existants Perenco + formation ingénieurs process | 3 PID anciens convertis, ingénieurs autonomes pour créer un nouveau PID | 5j |

---

## Phase 9 — Couche IA & MCP Server (6 semaines)

### Objectif
RAG opérationnel sur le corpus Perenco. MCP Server avec 15 tools.
Génération de brouillons. Auto-complétion dans l'éditeur.

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Configurer LiteLLM proxy + Ollama on-premise avec modèle llama3 ou Mistral | `curl localhost:11434/api/generate` répond en < 3s | 1j |
| PLAN | Définir le catalogue complet des tools MCP (voir modules/core/AI_MCP.md §3) | Liste de 15 tools documentés avec permissions | 1j |
| DO | UI Config IA admin : ajouter providers par tenant (Ollama URL, modèle, fonction assignée) | Ajouter Ollama + optionnel Claude API → switch sans redémarrage | 3j |
| DO | Pipeline indexation : document publié → APScheduler job → chunking 600 tokens → embedding → pgvector | Document publié → vecteurs stockés en < 30s, vérifiés en DB | 4j |
| DO | Interface RAG "Demander à OpsFlux" dans le panneau IA | "Quelle était la pression V-101 en jan 2024 ?" → réponse avec source citée | 4j |
| DO | MCP Server : server.py stdio/SSE + 15 tools avec RBAC + audit | 15 tools déclarés, `search_documents` retourne les bons résultats filtrés | 5j |
| DO | Confirmation avant actions critiques MCP (submit, approve, create) | `submit_document` → message de confirmation → user confirme → exécuté | 2j |
| DO | Génération de brouillon : `generate_from_template()` → LLM → document créé | Rapport journalier généré depuis prompt + données connecteur DCS | 4j |
| DO | Auto-complétion BlockNote : suggestion inline au Tab selon contexte + historique | Taper "La pression du séparateur" + Tab → suggestion LLM pertinente | 3j |
| DO | Extraction legacy : uploader PDF/Word → LLM extrait form_data → stocké en DB | Upload rapport Word 2023 → 8 valeurs extraites et vérifiables | 5j |
| DO | Intelligence Panel (panneau IA) : briefing au démarrage avec recommandations | Ouvrir OpsFlux le matin → voir 2 validations urgentes + 1 suggestion | 2j |
| CHECK | RAG sur 50 documents réels Perenco. Test de 20 questions/réponses. Score pertinence > 70% | Score mesuré et documenté. Sources citées correctement dans 80%+ des cas | 3j |
| CHECK | MCP Server : tester les 15 tools avec scénario réel (générer rapport BIPAGA via MCP) | Rapport généré et soumis en workflow via commandes MCP uniquement | 2j |
| ACT | Dashboard usage IA : tokens consommés par tenant, coûts, latence, pertinence | Dashboard Grafana actif, alertes si coût > budget défini | 2j |

---

## Backlog — Modules futurs (priorité définie par Perenco)

| Module | Description courte |
|---|---|
| `PaxLog` | Avis de séjour, gestion mobilisations, certifications offshore |
| `Planner` | Planification projets, Gantt, CPM, jalons |
| `Calendar` | Calendrier équipe, sync Exchange/Outlook |
| `ActionTracker` | Suivi des actions/issues issues des réunions/audits |
| `MeetingMinutes` | PV de réunions → actions automatiques |
| `HSE` | Incidents, near-misses, drills, TRIR/LTIR |
| `Budget` | Suivi coûts projets, courbes S |
| `KPI_Analytics` | Tableaux de bord analytiques avancés |
| `MOC` | Management of Change |
| `Maintenance` | Ordres de travail, historique interventions |
