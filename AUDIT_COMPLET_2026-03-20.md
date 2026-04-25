# AUDIT COMPLET OPSFLUX — 20 Mars 2026

## Score Global : 68/100

| Dimension | Score | Résumé |
|-----------|-------|--------|
| Fonctionnel (modules) | 65/100 | CRUD solide, logique métier incomplète |
| Inter-modules | 55/100 | CrossModuleLink existe mais sous-utilisé (5/40+ liens) |
| Cohérence visuelle | 78/100 | Design system bien conçu, settings panels non-conformes |
| Architecture | 80/100 | Modèles riches, migrations propres, RBAC complet |

---

# PARTIE 1 — AUDIT FONCTIONNEL MODULE PAR MODULE

## 1. USERS & ENTITIES — Note : C+

### Présent
- User (13 champs), Entity (5), Department (5), CostCenter (6)
- RBAC complet : Role, Permission, UserGroup, UserGroupMember
- Auth : MFA/TOTP, PAT, OAuth, Sessions, Backup codes
- Routes : CRUD users, entities, /me/roles, /me/groups, /me/permissions
- Frontend : DataTable + Grid view, CreatePanel, DetailPanel (2 tabs: Infos, Entités)

### Manquant — Backend
- `User` : department_id, cost_center_id, employee_id, manager_id, title, hire_date, phone/mobile
- `Entity` : legal_form, capital, vat_number, registration_number, hq_address_id
- `Department` : parent_department_id (hiérarchie), budget, manager_id
- Schemas manquants : Department, CostCenter, Role, Permission, UserGroup
- Routes manquantes : /departments, /cost-centers, /users/{id}/roles, /organizations/chart
- Logique : pas de lockout login, pas d'expiration compte, pas de policy mot de passe, pas d'org chart

### Manquant — Frontend
- Batch deactivate : handler = console.log (stub)
- Pas de filtre par département/rôle dans la DataTable
- Pas de vue organigramme

---

## 2. AUTH & SÉCURITÉ — Note : B-

### Présent
- Login, MFA, Refresh, Logout, Backup codes
- Sessions : list, revoke, revoke all
- PAT : CRUD complet
- OAuth Applications : CRUD

### Manquant
- **Critique** : Pas de forgot-password / reset-password / change-password endpoints
- OAuth flow (authorize/token) non implémenté (modèles existent)
- SAML 2.0 / LDAP non implémenté
- Rate limiting login non appliqué (champs existent mais pas de logique)
- Token scopes non validés dans les routes
- Session timeout inactivité absente

---

## 3. ASSETS — Note : B

### Présent
- Asset (11 champs) + AssetTypeConfig (11 champs)
- CRUD complet + tree endpoint
- GeoEditor polymorphique (point/linestring/polygon)
- Frontend : DataTable + TreeView, CreatePanel, DetailPanel avec tabs
- AddressManager, FileManager, NotesManager intégrés

### Manquant — Backend
- `Asset` : status (operational|maintenance|decommissioned), operator_tier_id, owner_tier_id, criticality_level, operational_since, insurance_value
- Routes manquantes : /asset-types CRUD, /assets/{id}/lineage, /assets/{id}/inspections
- Logique : pas de validation circulaire parent_id, pas de cascade désactivation enfants
- Performance : tree endpoint charge tout en mémoire (O(n) sans limite)

### Manquant — Frontend
- Validation formulaire minimale (HTML5 required only, pas d'erreurs affichées)
- Pas de champ status dans le create/detail panel
- metadata_ pas éditable dans l'UI (champ JSONB ignoré)
- Code auto-généré mais pas de preview du format

---

## 4. TIERS — Note : B

### Présent
- Tier (14 champs), TierContact (13), TierIdentifier (6), TierContactTransfer (6)
- CRUD complet pour tiers, contacts, identifiants, transferts
- Frontend : DataTable + Cards, CreatePanel complet, DetailPanel multi-tabs (Contacts, Identifiants, Adresses, Fichiers, Conformité)

### Manquant — Backend
- Modèles : TierBankAccount, TierContract, TierRelationship (parent/filiale), TierCertification
- `Tier` : primary_contact_id, credit_limit, credit_rating, vat_number, is_blacklisted
- `TierContact` : emergency_contact, is_operational_contact, is_financial_contact
- Routes : /tiers/{id}/addresses (polymorphique), /tiers/{id}/contracts, /tiers/{id}/compliance-status
- Logique : pas de détection doublon, pas de validation SIRET/NIF, pas de check blacklist

### Manquant — Frontend
- Pas de détection doublon à la création
- Pas de vue relations (parent/filiale/JV)
- Pas d'onglet contrats

---

## 5. CONFORMITÉ — Note : C+

### Présent
- ComplianceType (7), ComplianceRule (6), ComplianceRecord (12), JobPosition (5)
- Routes CRUD complet + compliance check + bulk upload
- Frontend : 5 tabs (Referentiel, Enregistrements, Fiches, Règles, Transferts)

### Manquant — Backend
- Modèles : ComplianceAudit, ComplianceExemption, SafetyIncident, ComplianceNotification
- `ComplianceRecord` : attachment_id (preuve), expiry_warning_sent_at, renewal_date
- Routes : /non-compliant-list, /send-reminders, /exemptions, /audit-log
- **Logique critique** : pas d'auto-expiration (status jamais mis à jour automatiquement), pas de blocage opérations si non-conforme, pas de notification avant expiration

### Manquant — Frontend
- Pas de dashboard conformité (% conforme, expirations proches)
- Pas de lien pièce jointe/preuve
- Pas de timeline audit

---

## 6. PROJETS — Note : B-

### Présent
- Project (17), ProjectTask (15), ProjectMember (5), ProjectMilestone (6)
- PlanningRevision (7), TaskDeliverable (7), TaskAction (6), TaskChangeLog (7)
- Routes CRUD complet + revisions, deliverables, actions, changelog
- Frontend : 3 vues (Projets DataTable, Tableur MS Project, Planning Gantt)

### Manquant — Backend
- Modèles : ProjectBudget, ProjectCost, ProjectRisk, ProjectDependency, ProjectApproval
- `Project` : cost_center_id, approved_budget, hse_classification, approval_workflow_id
- `ProjectTask` : pas de dépendances inter-tâches (finish-to-start etc.)
- Routes : /budget, /costs, /risks, /critical-path, /gantt-data, /approve, /burndown
- **Logique critique** : budget field existe mais unused, pas de chemin critique, pas de propagation status parent←enfants, pas de détection conflit ressources

### Manquant — Frontend
- Pas d'onglet budget/coûts
- Pas de vue risques
- Pas de workflow approbation
- Pas de comparaison revisions planning

---

## 7. PAXLOG — Note : C+

### Présent
- PaxProfile (15), PaxGroup (4), CredentialType (7), PaxCredential (10)
- MissionProgram (8), MissionProgramPax (5), Ads (5), AdsPax (4)
- ProfileType (5), ProfileHabilitationMatrix (5), ComplianceMatrix
- Routes CRUD complet + bulk upload + compliance check
- Frontend : Complet (profils, missions, ADS, credentials, groupes)

### Manquant — Backend
- Modèles : EmergencyContact, PaxMedicalInfo, PaxContractAssignment, PaxAbsence, PaxAvailability
- `PaxProfile` : email/phone (dupliqués vs polymorphique), emergency_contact_id, availability_status
- `MissionProgram` : approval_workflow, asset_id, risk_assessment_id, estimated_cost
- Routes : /profiles/{id}/emergency-contact, /missions/{id}/approve, /availability-calendar
- **Logique critique** : profile_completeness jamais calculé, pas de détection conflit (même PAX sur 2 missions), pas d'enforcement capacité mission, pas de vérification conformité avant assignation

---

## 8. PLANNER — Note : B

### Présent
- Activity (15+ champs), ActivityConflict, ActivityComment
- Routes CRUD + conflict detection + drag-and-drop scheduling
- Frontend : vue calendrier/Gantt complet, détection conflits

### Manquant
- Pas de récurrence automatique
- Pas de template d'activités
- Pas de lien budget/coût par activité

---

## 9. TRAVELWIZ — Note : B-

### Présent
- TransportVector (11), Voyage (12+), VoyageStop, VoyageManifest, ManifestPassenger
- TransportRotation, TransportZone, Cargo, PickupRound
- Routes CRUD complet
- Frontend : Complet (vecteurs, voyages, manifests, cargo)

### Manquant
- Feature rotations commentée dans le frontend
- Pas de tracking temps réel (AIS/GPS)
- Pas de calcul coût voyage
- Pas de validation poids/capacité avant embarcation

---

## 10. PID/PFD (Diagrammes Process) — Note : B

### Présent
- DAG editor (React Flow), composants process, import/export
- Frontend complet avec éditeur visuel

### Manquant
- Pas de versioning diagrammes
- Pas de lien vers assets (quel diagramme pour quel équipement)

---

## 11. WORKFLOW — Note : B+

### Présent
- WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowInstance
- Éditeur visuel React Flow, exécution instances, state machine
- Publish/Archive/Clone lifecycle
- Frontend : Éditeur drag-and-drop complet

### Manquant
- WebSocket/polling pour instances en cours
- Parallel branch merge strategy
- Sub-workflows

---

## 12. SETTINGS — Note : A-

### Présent
- 18 tabs complets : Profile, Security, Tokens, Apps, Sessions, Emails, Addresses, Notifications, General, Integrations, Email Templates, PDF Templates, Numbering, Delete Policies, Audit, System Health, Activity, RBAC
- Registry system avec sidebar collapsible

### Manquant
- Webhook delivery logs (UI existe mais pas les données)
- Test connection pour intégrations

---

# PARTIE 2 — AUDIT LIENS INTER-MODULES

## CrossModuleLink — Composant existant mais sous-utilisé

**Composant** : `apps/main/src/components/shared/CrossModuleLink.tsx`
- Supporte 10 modules cibles
- 2 modes : `panel` (side panel) et `navigate` (route + panel)

### Liens implémentés (5 seulement)

| Source | → Cible | Contexte |
|--------|---------|----------|
| PaxLog.Ads | Assets | site_entry_asset_id |
| PaxLog.Ads | PaxLog.Profile | pax_id (subtype='profile') |
| Planner.Activity | Assets | asset_id |
| Planner.Activity | Projets | project_id |
| Projets.Project | Tiers | tier_id (contractor) |

### Liens manquants critiques (35+)

**Depuis Assets (vue détail) :**
- → Planner : activités planifiées sur cet asset
- → PaxLog : ADS/missions déployées ici
- → Conformite : audits/certifications de cet asset
- → TravelWiz : voyages vers/depuis cet asset
- → Projets : projets liés à cet asset

**Depuis Tiers (vue détail) :**
- → Projets : projets où ce tiers est contractor
- → PaxLog : profils PAX de cette entreprise
- → Conformite : certifications de cette entreprise
- → TravelWiz : voyages opérés par ce tiers

**Depuis Conformite :**
- → Assets : sites audités
- → Tiers : entreprises auditées
- → PaxLog : certifications des profils

**Depuis PaxLog.Profile :**
- → Tiers : entreprise employeur
- → Conformite : certifications compliance
- → TravelWiz : voyages/manifests

**Depuis Projets :**
- → Assets : localisation projet
- → Planner : activités du projet
- → PaxLog : équipes mobilisées

### EventBus — Système d'événements

**Existant** : `apps/main/src/lib/eventBus.ts`
- Pattern pub/sub avec EventEmitter
- Événement clé : `ads.approved` → auto-recherche voyage TravelWiz

**Événements manquants :**
- `conformite.record.expired` → notification utilisateur
- `project.status.changed` → mise à jour planner
- `asset.decommissioned` → blocage opérations
- `pax.credential.expiring` → alerte 30j avant
- `voyage.completed` → clôture ADS liées

### FK Database — Graphe de dépendances

```
Entity ──┬── User
         ├── Asset ──┬── Planner.Activity
         │           ├── PaxLog.Ads
         │           ├── TravelWiz.Voyage (origin/dest)
         │           └── TravelWiz.VoyageStop
         │
         ├── Tier ──┬── TierContact
         │          ├── PaxLog.PaxProfile (company)
         │          ├── Projets.Project (contractor)
         │          └── TravelWiz.Voyage (contractor)
         │
         ├── Projets.Project ── Planner.Activity
         │
         └── Conformite ── ❌ ISOLÉ (pas de FK vers Assets/Tiers)
```

**Problème majeur** : Le module Conformité est isolé au niveau données — il utilise owner_type/owner_id (polymorphique) sans FK réelles.

---

# PARTIE 3 — AUDIT COHÉRENCE VISUELLE

## Score : 78/100

### Design System — Bien conçu

| Composant | Statut |
|-----------|--------|
| DynamicPanelShell | ✅ Utilisé partout |
| FormSection | ✅ Cohérent |
| FormGrid | ✅ Cohérent |
| InlineEditableRow | ✅ Cohérent |
| ReadOnlyRow | ✅ Cohérent |
| DataTable | ✅ Parfaitement cohérent |
| PanelHeader + ToolbarButton | ✅ Cohérent |
| ConfirmDialog (useConfirm) | ✅ Cohérent |
| panelInputClass | ⚠️ Non utilisé dans Settings panels |

### Matrice de conformité par module

| Composant | Assets | Users | Tiers | Projets | Conformite | Settings |
|-----------|--------|-------|-------|---------|------------|----------|
| DynamicPanelShell | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| panelInputClass | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| PanelContentLayout | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| SectionHeader | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Checkbox standard | ❌ | ❌ | ✅ | ✅ | ❌ | — |

### Incohérences détectées

**1. Input class hardcodé (HIGH)** — 3 fichiers Settings
- `CreateTokenPanel.tsx` : `className="gl-form-input"` au lieu de `panelInputClass`
- `CreateAppPanel.tsx` : idem
- `EditEmailTemplatePanel.tsx` : idem
- **Fix** : Importer et utiliser `panelInputClass`

**2. PanelContentLayout manquant (HIGH)** — 4 fichiers
- `AssetsPage.tsx:262` : `<div className="p-4 space-y-5">` au lieu de `<PanelContentLayout>`
- `CreateTokenPanel.tsx`, `CreateAppPanel.tsx`, `EditEmailTemplatePanel.tsx`
- **Fix** : Wrapper avec `<PanelContentLayout>`

**3. SectionHeader sous-utilisé (MEDIUM)** — Assets, Conformité
- Detail panels utilisent `FormSection` pour sections read-only
- Devrait utiliser `SectionHeader` quand pas d'édition inline
- **Fix** : Remplacer FormSection (read-only) par SectionHeader

**4. Checkbox non standardisé (LOW)**
- Assets : `focus:ring-primary/30`
- Users : `focus:ring-primary` (pas d'opacité)
- Conformité : juste `rounded border-border`
- **Fix** : Créer classe `.gl-checkbox` dans index.css

---

# PARTIE 4 — LISTE DE CORRECTIONS PRIORISÉE

## 🔴 CRITIQUE (Bloquant production)

| # | Module | Correction | Effort |
|---|--------|-----------|--------|
| C1 | Auth | Implémenter forgot-password + reset-password + change-password | 4h |
| C2 | Conformité | Auto-expiration des ComplianceRecord (cron ou query-time check) | 3h |
| C3 | Conformité | FK réelles vers Assets/Tiers (pas juste owner_type/owner_id polymorphique) | 2h |
| C4 | Users | Batch deactivate : remplacer console.log par vrai handler | 30min |
| C5 | PaxLog | Validation capacité mission avant ajout PAX | 1h |
| C6 | PaxLog | Détection conflit : même PAX sur 2 missions simultanées | 2h |

## 🟠 HAUTE PRIORITÉ (Fonctionnel incomplet)

| # | Module | Correction | Effort |
|---|--------|-----------|--------|
| H1 | Assets | Routes CRUD pour AssetTypeConfig (/asset-types) | 2h |
| H2 | Assets | Validation circulaire parent_id + cascade désactivation | 1h |
| H3 | Assets | Ajouter champ `status` (operational/maintenance/decommissioned) | 1h |
| H4 | Projets | Modèle ProjectDependency (finish-to-start etc.) | 3h |
| H5 | Projets | Budget tracking (endpoint + UI) — field existe, non utilisé | 4h |
| H6 | Tiers | Détection doublon (même SIRET/NIF) à la création | 1h |
| H7 | Inter-modules | Ajouter 10+ CrossModuleLinks manquants (Asset→Planner, Tiers→Projets, etc.) | 3h |
| H8 | PaxLog | Calcul automatique profile_completeness | 1h |
| H9 | Conformité | Route /non-compliant-list (qui est en retard) | 1h |
| H10 | Auth | Rate limiting login (enforce failed_login_count + locked_until) | 2h |

## 🟡 MOYENNE PRIORITÉ (Cohérence & qualité)

| # | Module | Correction | Effort |
|---|--------|-----------|--------|
| M1 | Design | Settings panels : panelInputClass au lieu de hardcoded "gl-form-input" | 15min |
| M2 | Design | PanelContentLayout manquant dans Assets + Settings panels | 15min |
| M3 | Design | SectionHeader au lieu de FormSection pour sections read-only | 30min |
| M4 | Design | Créer classe .gl-checkbox standardisée | 15min |
| M5 | Users | Schemas manquants : DepartmentRead/Create, CostCenterRead/Create | 1h |
| M6 | Users | Routes /departments CRUD, /cost-centers CRUD | 2h |
| M7 | Projets | Status propagation parent←enfants automatique | 2h |
| M8 | TravelWiz | Validation poids/capacité avant manifest | 1h |
| M9 | Inter-modules | Événements EventBus manquants (conformite.expired, pax.credential.expiring) | 2h |
| M10 | Assets | Tree endpoint : pagination ou lazy-loading (performance) | 2h |

## 🟢 BASSE PRIORITÉ (Nice-to-have)

| # | Module | Correction | Effort |
|---|--------|-----------|--------|
| L1 | Assets | Champs operator_tier_id, owner_tier_id, criticality_level | 1h |
| L2 | Tiers | Modèles TierBankAccount, TierContract, TierRelationship | 4h |
| L3 | PaxLog | Modèles EmergencyContact, PaxMedicalInfo | 3h |
| L4 | Projets | Modèles ProjectRisk, ProjectCost | 3h |
| L5 | Auth | OAuth authorize/token flow complet | 6h |
| L6 | Auth | SAML 2.0 / LDAP support | 8h |
| L7 | Conformité | Modèles ComplianceAudit, ComplianceExemption | 3h |
| L8 | Workflow | WebSocket pour instances en temps réel | 4h |
| L9 | PID/PFD | Versioning diagrammes + lien assets | 3h |
| L10 | Search | Syntaxe avancée (AND/OR), filtres facettés | 4h |

---

## RÉSUMÉ EFFORT TOTAL

| Priorité | Items | Effort estimé |
|----------|-------|---------------|
| 🔴 Critique | 6 | ~12h |
| 🟠 Haute | 10 | ~21h |
| 🟡 Moyenne | 10 | ~12h |
| 🟢 Basse | 10 | ~39h |
| **TOTAL** | **36** | **~84h** |

---

*Rapport généré par audit automatisé — 5 agents parallèles couvrant backend, frontend (2 groupes), inter-modules, et design system.*
