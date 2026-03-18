# Module Planner — Spécification Technique Complète

> Version consolidée — Perenco Cameroun — Mars 2026
> Types d'activités : project | workover | drilling | integrity | maintenance | permanent_ops | inspection | event

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Modèle de données](#2-modèle-de-données)
3. [Schémas Pydantic](#3-schémas-pydantic)
4. [Service layer](#4-service-layer)
5. [API endpoints](#5-api-endpoints)
6. [Logique métier détaillée](#6-logique-métier-détaillée)
7. [Règles de validation](#7-règles-de-validation)
8. [Événements émis](#8-événements-émis)
9. [Tableaux de bord et vues UI](#9-tableaux-de-bord-et-vues-ui)
10. [Performance et indexation](#10-performance-et-indexation)
11. [Règle max_pax_per_company](#11-règle-max_pax_per_company)

---


## 1. Rôle et périmètre

Planner est le **module d'orchestration des activités sur site** et le **calendrier unique d'OpsFlux** (remplace le module Calendrier core — D-C6). Il gère :
- Le scheduling de toutes les activités consommant des PAX sur un asset (projet, maintenance, exploitation permanente, inspection, événement)
- La détection et résolution des conflits de capacité PAX entre activités concurrentes
- L'arbitrage par le Directeur des Opérations (rôle DO)
- L'exposition des vues Gantt, calendrier mensuel/hebdomadaire, timeline et PERT

Il est la **source de vérité de la charge PAX prévue** : PaxLog l'interroge pour valider les AdS, TravelWiz pour dimensionner les manifestes.

---


---


## 2. Modèle de données

### 2.1 Activity

```python
# app/models/planner.py
class ActivityType(str, Enum):
    project       = "project"        # Activité liée à un projet du module Projets
    workover      = "workover"       # Intervention sur puits existant (slickline, CT, wireline)
    drilling      = "drilling"       # Forage d'un nouveau puits
    integrity     = "integrity"      # Inspection d'intégrité (pipeline, structure, corrosion)
    maintenance   = "maintenance"    # OT maintenance général (CMMS natif)
    permanent_ops = "permanent_ops"  # Exploitation courante — quota incompressible
    inspection    = "inspection"     # Audit, inspection réglementaire externe
    event         = "event"          # Réunion, deadline — peut avoir pax_quota=0

# Note : la liste est extensible via l'admin (SYS_ADMIN peut ajouter des types custom).
# Les types ci-dessus sont les types systèmes fournis par défaut.

class ActivityStatus(str, Enum):
    draft       = "draft"
    submitted   = "submitted"
    approved    = "approved"
    rejected    = "rejected"
    cancelled   = "cancelled"
    in_progress = "in_progress"
    completed   = "completed"

class Priority(str, Enum):
    critical = "critical"   # score=4
    high     = "high"       # score=3
    medium   = "medium"     # score=2
    low      = "low"        # score=1

class MaintenanceType(str, Enum):
    preventive  = "preventive"
    corrective  = "corrective"
    regulatory  = "regulatory"
    inspection  = "inspection"
```

```sql
CREATE TABLE activities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  type                      VARCHAR(20) NOT NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft',
  workflow_id               UUID,  -- FK vers core.workflow_definitions (FSM core)
  title                     VARCHAR(300) NOT NULL,
  description               TEXT,
  asset_id                  UUID NOT NULL REFERENCES assets(id),
  project_id                UUID REFERENCES projects(id),       -- si type=project
  requester_id              UUID NOT NULL REFERENCES users(id),
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  pax_quota                 INTEGER NOT NULL DEFAULT 0 CHECK (pax_quota >= 0),
  pax_actual                INTEGER NOT NULL DEFAULT 0,  -- mis à jour par PaxLog
  priority                  VARCHAR(20) NOT NULL DEFAULT 'medium',
  priority_override_by      UUID REFERENCES users(id),
  priority_override_reason  TEXT,
  -- Champs CMMS (type=maintenance uniquement)
  maintenance_type          VARCHAR(20),
  -- preventive | corrective | regulatory
  equipment_asset_id        UUID REFERENCES assets(id),
  work_order_ref            VARCHAR(100),  -- référence OT interne (ACT-YYYY-NNNNN)
  estimated_duration_h      DECIMAL(6,2),
  actual_duration_h         DECIMAL(6,2),
  completion_notes          TEXT,
  -- Champs Workover (type=workover)
  well_reference            VARCHAR(100),  -- référence du puits concerné
  workover_type             VARCHAR(50),
  -- slickline | coiled_tubing | wireline | pump_change | chemical_treatment | other
  rig_name                  VARCHAR(100),  -- nom du rig/unité d'intervention
  -- Champs Forage (type=drilling)
  well_name                 VARCHAR(100),  -- nom du nouveau puits
  spud_date                 DATE,          -- date de début de forage prévue
  target_depth_m            DECIMAL(8,1),  -- profondeur cible en mètres
  drilling_program_ref      VARCHAR(100),  -- référence du programme de forage
  -- Champs Intégrité (type=integrity)
  integrity_scope           TEXT,          -- description : pipeline X, structure Y, zone Z
  integrity_method          VARCHAR(100),  -- pigging | UT | CVI | drone | autre
  regulatory_reference      VARCHAR(200),  -- référence réglementaire si applicable
  -- Champs event (type=event)
  location_free_text        VARCHAR(300),  -- si pas d'asset physique
  -- Métadonnées
  notes                     TEXT,
  archived                  BOOLEAN DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_entity   ON activities(entity_id);
CREATE INDEX idx_activities_asset    ON activities(asset_id);
CREATE INDEX idx_activities_status   ON activities(status);
CREATE INDEX idx_activities_project  ON activities(project_id);
CREATE INDEX idx_activities_dates    ON activities(start_date, end_date);
CREATE INDEX idx_activities_critical ON activities(entity_id, priority) WHERE status = 'approved';
```

### 2.2 AssetCapacity

Chaque modification crée un **nouvel enregistrement** — jamais de UPDATE. La capacité courante = enregistrement avec `effective_date <= TODAY()` le plus récent.

```sql
CREATE TABLE asset_capacities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  max_pax_total         INTEGER NOT NULL CHECK (max_pax_total >= 0),
  max_pax_per_company   INTEGER CHECK (max_pax_per_company > 0),
  permanent_ops_quota   INTEGER NOT NULL DEFAULT 0,
  effective_date        DATE NOT NULL,
  reason                TEXT NOT NULL,  -- OBLIGATOIRE
  set_by                UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asset_cap_asset_date ON asset_capacities(asset_id, effective_date DESC);

-- Vue : capacité courante par asset
CREATE VIEW current_asset_capacity AS
SELECT DISTINCT ON (asset_id)
  asset_id, entity_id, max_pax_total, max_pax_per_company,
  permanent_ops_quota, effective_date, set_by
FROM asset_capacities
ORDER BY asset_id, effective_date DESC;
```

### 2.3 ActivityConflict

```sql
CREATE TABLE activity_conflicts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  activity_a_id     UUID NOT NULL REFERENCES activities(id),
  activity_b_id     UUID NOT NULL REFERENCES activities(id),
  conflict_type     VARCHAR(30) NOT NULL,
  -- pax_overflow | priority_clash | resource_overlap
  overflow_amount   INTEGER,   -- nb de PAX en dépassement si pax_overflow
  detected_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution        TEXT,
  resolution_type   VARCHAR(30),
  -- approved_both | postponed_a | postponed_b | cancelled_a | cancelled_b | quota_reduced
  CHECK (activity_a_id <> activity_b_id)
);

CREATE INDEX idx_conflicts_entity   ON activity_conflicts(entity_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_conflicts_act_a    ON activity_conflicts(activity_a_id);
CREATE INDEX idx_conflicts_act_b    ON activity_conflicts(activity_b_id);
```

---


---


## 3. Schémas Pydantic

```python
# app/schemas/planner.py
from pydantic import BaseModel, Field, model_validator
from datetime import date
from uuid import UUID
from typing import Optional
from enum import Enum

class ActivityCreate(BaseModel):
    entity_id:          UUID
    type:               ActivityType
    title:              str = Field(..., min_length=2, max_length=300)
    description:        Optional[str] = None
    asset_id:           UUID
    project_id:         Optional[UUID] = None  # obligatoire si type=project
    start_date:         date
    end_date:           date
    pax_quota:          int = Field(..., ge=0)
    priority:           Priority = Priority.medium
    notes:              Optional[str] = None
    # Champs CMMS (si type=maintenance)
    maintenance_type:   Optional[MaintenanceType] = None
    equipment_asset_id: Optional[UUID] = None
    work_order_ref:     Optional[str] = None
    estimated_duration_h: Optional[float] = None

    @model_validator(mode='after')
    def validate_dates_and_type(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date doit être >= start_date")
        if self.type == ActivityType.project and not self.project_id:
            raise ValueError("project_id obligatoire pour type=project")
        if self.type == ActivityType.maintenance and not self.maintenance_type:
            raise ValueError("maintenance_type obligatoire pour type=maintenance")
        if self.type == ActivityType.workover and not self.well_reference:
            raise ValueError("well_reference obligatoire pour type=workover")
        if self.type == ActivityType.workover and not self.workover_type:
            raise ValueError("workover_type obligatoire pour type=workover")
        if self.type == ActivityType.drilling and not self.well_name:
            raise ValueError("well_name obligatoire pour type=drilling")
        if self.type == ActivityType.integrity and not self.integrity_scope:
            raise ValueError("integrity_scope obligatoire pour type=integrity")
        if self.type == ActivityType.permanent_ops and self.pax_quota == 0:
            raise ValueError("pax_quota > 0 obligatoire pour type=permanent_ops")
        return self

class ActivityUpdate(BaseModel):
    title:              Optional[str] = Field(None, min_length=2, max_length=300)
    description:        Optional[str] = None
    start_date:         Optional[date] = None
    end_date:           Optional[date] = None
    pax_quota:          Optional[int] = Field(None, ge=0)
    priority:           Optional[Priority] = None
    notes:              Optional[str] = None
    maintenance_type:   Optional[MaintenanceType] = None
    equipment_asset_id: Optional[UUID] = None
    work_order_ref:     Optional[str] = None
    estimated_duration_h: Optional[float] = None
    actual_duration_h:  Optional[float] = None
    completion_notes:   Optional[str] = None

class ActivityRead(BaseModel):
    id:               UUID
    entity_id:        UUID
    type:             ActivityType
    status:           ActivityStatus
    title:            str
    description:      Optional[str]
    asset_id:         UUID
    asset_name:       str          # dénormalisé pour l'affichage
    project_id:       Optional[UUID]
    project_code:     Optional[str]
    requester_id:     UUID
    requester_name:   str
    start_date:       date
    end_date:         date
    pax_quota:        int
    pax_actual:       int
    priority:         Priority
    priority_score:   int          # 1-4 calculé
    is_overflowing:   bool         # pax_actual > pax_quota
    residual_capacity: int         # calculé à la volée
    has_active_conflict: bool
    maintenance_type: Optional[MaintenanceType]
    work_order_ref:   Optional[str]
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True

class AvailabilityResponse(BaseModel):
    asset_id:              UUID
    asset_name:            str
    start_date:            date
    end_date:              date
    max_pax_total:         int
    permanent_ops_quota:   int
    approved_pax_sum:      int    # somme pax_quota activités approved sur la période
    residual_capacity:     int    # max_pax_total - permanent_ops_quota - approved_pax_sum
    activities_on_period:  list[ActivityRead]
    is_overbooked:         bool

class ImpactResponse(BaseModel):
    """Retourné avant d'appliquer une modification — permet au frontend d'afficher le modal."""
    activity_id:           UUID
    changes_proposed:      dict   # {field: {old, new}}
    affected_ads_count:    int
    affected_ads:          list[dict]  # [{ads_id, reference, status, requester}]
    affected_manifests:    list[dict]  # [{manifest_id, reference, trip_date}]
    new_conflicts:         list[dict]  # nouveaux conflits qui apparaîtraient
    resolved_conflicts:    list[dict]  # conflits qui disparaîtraient

class ConflictResolveRequest(BaseModel):
    resolution_type: str = Field(..., pattern="^(approved_both|postponed_a|postponed_b|cancelled_a|cancelled_b|quota_reduced)$")
    resolution:      str = Field(..., min_length=10)  # motif obligatoire
    # Si postponed_a ou postponed_b :
    new_start_date:  Optional[date] = None
    new_end_date:    Optional[date] = None
    # Si quota_reduced :
    new_quota_a:     Optional[int] = None
    new_quota_b:     Optional[int] = None

class CapacityUpdateRequest(BaseModel):
    max_pax_total:        int = Field(..., ge=0)
    max_pax_per_company:  Optional[int] = Field(None, gt=0)
    permanent_ops_quota:  int = Field(..., ge=0)
    effective_date:       date
    reason:               str = Field(..., min_length=10)  # motif obligatoire

    @model_validator(mode='after')
    def validate_quota(self):
        if self.permanent_ops_quota > self.max_pax_total:
            raise ValueError("permanent_ops_quota ne peut pas dépasser max_pax_total")
        return self
```

---


---


## 4. Service layer

```python
# app/services/planner/activity_service.py

class ActivityService:

    async def create_activity(
        self, data: ActivityCreate, requester: User, db: AsyncSession
    ) -> Activity:
        """
        Création d'une activité avec vérification immédiate de disponibilité.
        1. Vérifier les droits (rôle habilité pour ce type d'activité)
        2. Vérifier que l'asset appartient à l'entité de l'utilisateur
        3. Calculer la disponibilité sur la période
        4. Si pax_quota > residual_capacity → créer avec status=submitted + créer ActivityConflict
        5. Sinon → créer avec status=submitted
        6. Émettre audit_log
        """

    async def calculate_availability(
        self, asset_id: UUID, start_date: date, end_date: date, entity_id: UUID,
        exclude_activity_id: UUID | None = None
    ) -> AvailabilityResponse:
        """
        Calcul de disponibilité PAX sur un asset pour une période.

        Formule :
          capacity = current_asset_capacity(asset_id)
          approved_sum = SUM(pax_quota) WHERE asset_id=asset_id
                         AND status='approved'
                         AND start_date <= end_date_param
                         AND end_date >= start_date_param
                         AND id != exclude_activity_id  -- pour éviter de compter soi-même
          residual = capacity.max_pax_total
                   - capacity.permanent_ops_quota
                   - approved_sum

        Note : on utilise la logique de chevauchement standard :
          A chevauche B si A.start <= B.end AND A.end >= B.start
        """

    async def get_impact_preview(
        self, activity_id: UUID, changes: ActivityUpdate, db: AsyncSession
    ) -> ImpactResponse:
        """
        Calcule l'impact d'une modification SANS l'appliquer.
        Utilisé pour alimenter le modal de confirmation côté frontend.
        Appelé avant chaque PATCH sur une activité approved.
        """

    async def apply_update_with_notifications(
        self, activity_id: UUID, changes: ActivityUpdate,
        notify_stakeholders: bool, message: str | None,
        actor: User, db: AsyncSession
    ) -> Activity:
        """
        Applique la modification et envoie les notifications.
        1. Calculer l'impact (get_impact_preview)
        2. Appliquer les changements
        3. Passer les AdS liées en status='requires_review'
        4. Émettre l'événement activity.modified vers PaxLog et TravelWiz
        5. Si notify_stakeholders=True : envoyer notifications
        6. Audit log avec old_values / new_values
        """

    async def detect_and_create_conflicts(
        self, activity: Activity, db: AsyncSession
    ) -> list[ActivityConflict]:
        """
        Détecte les conflits sur l'asset de l'activité pour sa période.
        Crée les ActivityConflict si non existants.
        Notifie le DO.
        """


# app/services/planner/arbitrage_service.py

class ArbitragService:

    async def resolve_conflict(
        self, conflict_id: UUID, resolution: ConflictResolveRequest,
        do_user: User, db: AsyncSession
    ) -> ActivityConflict:
        """
        Seul le rôle DO peut résoudre un conflit.
        Actions selon resolution_type :
        - approved_both : vérifier si la capacité le permet réellement
        - postponed_a/b : appliquer les nouvelles dates + recalculer conflits
        - cancelled_a/b : annuler l'activité + notifier le demandeur
        - quota_reduced : réduire pax_quota + recalculer
        Émettre activity.modified pour chaque activité touchée.
        """

    async def escalate_ads_to_arbitrage(
        self, ads_id: UUID, db: AsyncSession
    ) -> None:
        """
        Appelé par PaxLog quand une AdS validée dépasse le pax_quota d'une activité.
        Crée un ActivityConflict de type 'pax_overflow' et notifie le DO.
        """
```

---


---


## 5. API endpoints

### 5.1 Activités

```
POST   /api/v1/planner/activities
  Body: ActivityCreate
  Response 201: ActivityRead
  Erreurs:
    400 INVALID_DATES         — end_date < start_date
    400 TYPE_REQUIRES_PROJECT — type=project sans project_id
    403 FORBIDDEN_ACTIVITY_TYPE — rôle non habilité pour ce type
    404 ASSET_NOT_FOUND
    409 CAPACITY_EXCEEDED     — retourne aussi ActivityConflict créé

GET    /api/v1/planner/activities
  Query params:
    entity_id: UUID (obligatoire)
    asset_id: UUID (optionnel)
    project_id: UUID (optionnel)
    type: ActivityType (optionnel)
    status: ActivityStatus | list[ActivityStatus]
    start_from: date
    start_to: date
    priority: Priority (optionnel)
    requester_id: UUID (optionnel)
    page: int = 1
    per_page: int = 20 (max 100)
  Response 200: PaginatedResponse[ActivityRead]

GET    /api/v1/planner/activities/:id
  Response 200: ActivityRead (avec has_active_conflict, residual_capacity calculés)

PATCH  /api/v1/planner/activities/:id
  Body: ActivityUpdate
  Query: preview_only=true  →  retourne ImpactResponse SANS appliquer (pour le modal)
  Response 200: ActivityRead | ImpactResponse
  Erreurs:
    403 CANNOT_EDIT_APPROVED — activité approved, doit passer par update_with_confirm
    409 NEW_CONFLICT_DETECTED

POST   /api/v1/planner/activities/:id/confirm-update
  Body:
    changes: ActivityUpdate
    notify_stakeholders: bool
    notification_message: str (optionnel)
    notify_ads: bool = true
    notify_manifests: bool = true
  Response 200: ActivityRead
  Note: endpoint séparé pour les modifications d'activités approved, après
        que l'utilisateur ait vu et confirmé le modal d'impact.

PATCH  /api/v1/planner/activities/:id/status
  Body: { status: ActivityStatus, reason: str }
  Response 200: ActivityRead
  Transitions autorisées par rôle:
    draft → submitted           : REQUESTER, CHEF_PROJET, CDS, CDS
    submitted → approved        : CDS, CDS, DPROD
    submitted → rejected        : CDS, CDS
    approved → cancelled        : DO, CDS (avec reason obligatoire)
    approved → in_progress      : CDS (automatique à start_date)
    in_progress → completed     : CDS, CHEF_PROJET

DELETE /api/v1/planner/activities/:id
  Note: soft delete uniquement (archived=true), statut → cancelled
  Autorisé si status IN (draft, submitted) et actor = requester ou DO
  Response 200: { archived: true }
```

### 5.2 Disponibilité et capacités

```
GET    /api/v1/planner/availability/:asset_id
  Query: start_date, end_date, exclude_activity_id (optionnel)
  Response 200: AvailabilityResponse
  Note: endpoint critique — appelé par PaxLog lors de la création d'AdS

GET    /api/v1/planner/capacity/:asset_id
  Response 200:
    {
      current: AssetCapacityRead,
      history: list[AssetCapacityRead]  -- 10 dernières modifications
    }

POST   /api/v1/planner/capacity/:asset_id
  Body: CapacityUpdateRequest
  Response 201: AssetCapacityRead
  Note: crée un nouvel enregistrement (pas de UPDATE)
  Autorisé: DO, CDS, SYS_ADMIN

GET    /api/v1/planner/capacity/:asset_id/history
  Query: limit=20
  Response 200: list[AssetCapacityRead]
```

### 5.3 Conflits et arbitrage

```
GET    /api/v1/planner/conflicts
  Query: entity_id, status=open|resolved, asset_id, type
  Response 200: PaginatedResponse[ConflictRead]
  Note: endpoint principal du tableau de bord DO

GET    /api/v1/planner/conflicts/:id
  Response 200: ConflictRead (avec détail des deux activités)

POST   /api/v1/planner/conflicts/:id/resolve
  Body: ConflictResolveRequest
  Response 200: ConflictRead
  Autorisé: DO uniquement (403 si autre rôle)
  Effets:
    - Résoudre le conflit (resolved_at, resolved_by, resolution_type)
    - Appliquer les changements sur les activités concernées
    - Émettre activity.modified pour chaque activité modifiée
    - Notifier les demandeurs des activités concernées

POST   /api/v1/planner/conflicts/:id/escalate
  Body: { message: str }
  Response 200: { escalated: true, notified_do: true }
  Note: escalade manuelle d'un conflit vers le DO (depuis un validateur)
```

### 5.4 Vues calendrier et Gantt

```
GET    /api/v1/planner/gantt
  Query:
    entity_id: UUID
    asset_ids: list[UUID] (optionnel — tous les assets si absent)
    start_date: date
    end_date: date
    type: list[ActivityType] (optionnel)
    status: list[ActivityStatus] (défaut: approved,in_progress)
    group_by: asset|project|type
  Response 200:
    {
      activities: list[GanttActivityRead],  -- avec barres de baseline
      conflicts: list[ConflictSummary],
      capacity_bars: list[CapacityBar]      -- charge PAX par asset par jour
    }

GET    /api/v1/planner/calendar/month
  Query: entity_id, year, month, asset_ids
  Response 200:
    {
      days: list[{
        date: date,
        activities: list[ActivitySummary],
        total_pax: int,
        capacity_status: "ok"|"warning"|"overflow"
      }]
    }

GET    /api/v1/planner/calendar/week
  Query: entity_id, year, week, asset_ids
  Response 200: même structure que month mais granularité journalière

GET    /api/v1/planner/calendar/timeline
  Query: entity_id, start_date, end_date, asset_ids
  Response 200: activités groupées par asset avec PAX par jour

GET    /api/v1/planner/push-to-paxlog/:activity_id
  Note: vérification de compatibilité avant la soumission
  Response 200: { eligible: bool, blocking_reasons: list[str] }

POST   /api/v1/planner/push-to-paxlog/:activity_id
  Response 201: { suggested_ads_draft: AdsSummary }
  Note: crée une AdS draft dans PaxLog liée à cette activité
```

---


---


## 6. Logique métier détaillée

### 6.1 Calcul de disponibilité (règle centrale)

```python
# Formule de disponibilité PAX sur un asset/période
def calculate_residual_capacity(
    asset_id: UUID,
    start_date: date,
    end_date: date,
    exclude_activity_id: UUID | None = None
) -> int:
    capacity = get_current_capacity(asset_id)
    
    # Somme des PAX des activités approuvées sur la période
    # Logique de chevauchement : A chevauche B si A.start <= B.end ET A.end >= B.start
    approved_sum = db.query(func.sum(Activity.pax_quota)).filter(
        Activity.asset_id == asset_id,
        Activity.status == 'approved',
        Activity.start_date <= end_date,
        Activity.end_date >= start_date,
        Activity.id != exclude_activity_id
    ).scalar() or 0
    
    residual = capacity.max_pax_total - capacity.permanent_ops_quota - approved_sum
    return max(0, residual)  # jamais négatif dans le retour
```

### 6.2 Héritage de capacité dans la hiérarchie asset

La limite effective pour un asset est le **minimum** entre la limite de cet asset et celles de ses parents dans la hiérarchie (Filiale > Champ > Site > Plateforme).

```python
async def get_effective_capacity(asset_id: UUID, db: AsyncSession) -> int:
    """
    Remonte la hiérarchie asset via ltree et prend le minimum des capacités.
    Un asset sans capacité définie hérite du parent.
    Si aucune capacité dans la hiérarchie → retourne sys.maxsize (pas de limite).
    """
    # Requête PostgreSQL avec ltree :
    # SELECT MIN(max_pax_total - permanent_ops_quota)
    # FROM asset_capacities c
    # JOIN assets a ON a.id = c.asset_id
    # WHERE target_asset.path <@ a.path  -- l'asset target est enfant de a
    # AND c.effective_date <= CURRENT_DATE
```

### 6.3 Transitions de statut et FSM core

Les transitions de statut utilisent le moteur FSM du core. La définition du workflow Planner est enregistrée au démarrage :

```python
# app/startup/register_workflows.py
from core.fsm import workflow_registry

PLANNER_ACTIVITY_WORKFLOW = {
    "name": "planner_activity",
    "states": ["draft", "submitted", "approved", "rejected", "cancelled", "in_progress", "completed"],
    "initial": "draft",
    "transitions": [
        {"from": "draft",        "to": "submitted",    "roles": ["CHEF_PROJET", "CDS", "CDS", "DO"]},
        {"from": "submitted",    "to": "approved",     "roles": ["CDS", "CDS", "DPROD", "DO"]},
        {"from": "submitted",    "to": "rejected",     "roles": ["CDS", "CDS", "DO"], "requires_reason": True},
        {"from": "approved",     "to": "cancelled",    "roles": ["DO", "CDS"],            "requires_reason": True},
        {"from": "approved",     "to": "in_progress",  "roles": ["SYSTEM"]},  # automatique à start_date
        {"from": "in_progress",  "to": "completed",    "roles": ["CDS", "CHEF_PROJET", "DO"]},
        {"from": ["draft", "submitted", "rejected"], "to": "cancelled", "roles": ["requester", "DO"]},
    ]
}

workflow_registry.register(PLANNER_ACTIVITY_WORKFLOW)
```

### 6.4 Priorité et arbitrage

Le score de priorité est calculé ainsi :

```python
PRIORITY_SCORES = {
    "critical": 40,
    "high":     30,
    "medium":   20,
    "low":      10,
}

ACTIVITY_TYPE_BONUS = {
    "permanent_ops": 50,  # toujours prioritaire
    "inspection":    15,  # réglementaire
    "project":        0,
    "maintenance":    5,
    "event":         -5,
}

def calculate_priority_score(activity: Activity) -> int:
    base = PRIORITY_SCORES[activity.priority]
    bonus = ACTIVITY_TYPE_BONUS[activity.type]
    override = 10 if activity.priority_override_by else 0  # surcharge DO = bonus
    return base + bonus + override
```

En cas de conflit, le DO voit les deux activités triées par score décroissant.

### 6.5 Notifications sur modification de planning

Quand une activité est modifiée (dates, quota), le système :
1. Calcule l'impact (AdS liées, manifestes)
2. Affiche un modal à l'utilisateur avec les impacts (voir `ImpactResponse`)
3. L'utilisateur coche qui notifier :
   - `notify_ads_requesters` (défaut: true)
   - `notify_travel_coordinators` (défaut: true)
   - `notify_other_activity_requesters` (défaut: false — effet domino)
4. Émet l'événement `activity.modified` après confirmation

La configuration par défaut des cases pré-cochées est paramétrable par l'admin (`SYS_ADMIN`).

---


---


## 7. Règles de validation exhaustives

| Règle | Condition | Erreur retournée |
|---|---|---|
| R-PLAN-01 | `end_date >= start_date` | `400 INVALID_DATES` |
| R-PLAN-02 | `type=project` → `project_id` non null | `400 MISSING_PROJECT` |
| R-PLAN-03 | `type=project` → projet en statut `active` | `400 PROJECT_NOT_ACTIVE` |
| R-PLAN-04 | `type=maintenance` → `maintenance_type` non null | `400 MISSING_MAINTENANCE_TYPE` |
| R-PLAN-05 | `type=workover` → `well_reference` + `workover_type` non null | `400 MISSING_WORKOVER_FIELDS` |
| R-PLAN-06 | `type=drilling` → `well_name` non null | `400 MISSING_DRILLING_FIELDS` |
| R-PLAN-07 | `type=integrity` → `integrity_scope` non null | `400 MISSING_INTEGRITY_FIELDS` |
| R-PLAN-05 | `type=permanent_ops` → `pax_quota > 0` | `400 ZERO_QUOTA_PERMANENT` |
| R-PLAN-06 | `asset_id` appartient à l'entité de l'user | `403 ASSET_NOT_IN_ENTITY` |
| R-PLAN-07 | `pax_quota <= residual_capacity` pour approbation | `409 CAPACITY_EXCEEDED` + conflit créé |
| R-PLAN-08 | Modification d'une activité `approved` → preview obligatoire | `400 PREVIEW_REQUIRED` |
| R-PLAN-09 | `permanent_ops_quota <= max_pax_total` | `400 INVALID_CAPACITY` |
| R-PLAN-10 | Résolution de conflit → rôle DO obligatoire | `403 DO_REQUIRED` |
| R-PLAN-11 | `effective_date` d'une capacité >= aujourd'hui | `400 CAPACITY_DATE_PAST` |
| R-PLAN-12 | Activité `completed` → non modifiable | `409 ACTIVITY_COMPLETED` |

---


---


## 8. Événements émis

| Événement | Déclencheur | Payload |
|---|---|---|
| `activity.created` | POST /activities | `{activity_id, type, asset_id, pax_quota, period}` |
| `activity.approved` | Transition → approved | `{activity_id, asset_id, start_date, end_date, pax_quota}` |
| `activity.modified` | confirm-update appliqué | `{activity_id, changed_fields, old_values, new_values, affected_ads, notify}` |
| `activity.cancelled` | Transition → cancelled | `{activity_id, reason, cancelled_by}` |
| `conflict.created` | Détection conflit | `{conflict_id, activity_a_id, activity_b_id, type, overflow}` |
| `conflict.resolved` | DO résout | `{conflict_id, resolution_type, resolution, affected_activities}` |
| `capacity.updated` | POST /capacity | `{asset_id, old_capacity, new_capacity, effective_date, reason}` |

---


---


## 9. Tableaux de bord et vues UI

### 9.1 Vue principale — Gantt

- Barre de navigation : filtres (asset, type, statut, période) + sélecteur de vue
- Axe vertical : assets groupés par champ, puis site, puis plateforme
- Axe horizontal : temps (zoom : jour / semaine / mois / trimestre)
- Barres : colorées par type d'activité, opacité par statut
- Indicateur de charge PAX : mini-barre sous chaque ligne asset (vert/orange/rouge)
- Clic sur une barre → panneau latéral avec le détail de l'activité et les boutons d'action
- Drag & drop : déplace les dates (statut draft ou submitted uniquement)
  - En déplaçant : recalcul temps réel de la disponibilité (appel `availability`)
  - En relâchant : si conflit → modal de confirmation avec ImpactResponse
- Liens de dépendance : affichés comme flèches (issus des tâches du planning projet)

### 9.2 Vue DO — Arbitrage

Tableau de bord dédié pour le rôle DO :
- Onglet "Conflits en attente" : liste des ActivityConflict non résolus, triés par urgence
  - Pour chaque conflit : les deux activités avec scores de priorité, PAX en dépassement, dates
  - Boutons : Approuver les deux / Reporter A / Reporter B / Annuler A / Annuler B / Réduire quota
- Onglet "Activités à arbitrer" : AdS remontées depuis PaxLog pour dépassement quota
- Indicateurs : nombre de conflits ouverts, PAX en dépassement total, assets critiques

### 9.3 Formulaire de création/modification

Champs affichés selon le type d'activité :
- **Tous** : Titre, Asset, Dates, Quota PAX, Priorité, Description, Notes
- **project** : + Projet associé (dropdown)
- **maintenance** : + Type maintenance, Équipement, Référence OT, Durée estimée
- **event** : + Lieu libre (si pas d'asset physique), Quota PAX peut être 0

---


---


## 10. Performance et indexation

Les requêtes critiques (disponibilité, Gantt) doivent répondre en < 200ms.

```sql
-- Index partiel pour les activités actives (requête la plus fréquente)
CREATE INDEX idx_activities_active_asset_dates
  ON activities(asset_id, start_date, end_date)
  WHERE status IN ('approved', 'in_progress');

-- Index pour le Gantt par entité
CREATE INDEX idx_activities_gantt
  ON activities(entity_id, start_date, end_date)
  WHERE archived = FALSE;

-- Vue matérialisée pour la charge PAX journalière (rafraîchie toutes les 5min)
CREATE MATERIALIZED VIEW daily_pax_load AS
SELECT
  a.asset_id,
  a.entity_id,
  d::date AS load_date,
  SUM(a.pax_quota) AS total_pax_booked,
  (SELECT max_pax_total - permanent_ops_quota
   FROM current_asset_capacity c WHERE c.asset_id = a.asset_id) AS capacity
FROM activities a,
     generate_series(a.start_date, a.end_date, '1 day'::interval) d
WHERE a.status = 'approved'
GROUP BY a.asset_id, a.entity_id, d::date;

CREATE UNIQUE INDEX ON daily_pax_load(asset_id, load_date);
```

---


---


## 11. Règle max_pax_per_company


### Règle

`max_pax_per_company` sur `asset_capacities` définit le nombre maximum de PAX
d'une même entreprise autorisés simultanément sur un asset donné. Cette règle
est **bloquante** : si une AdS ferait dépasser ce quota, elle est rejetée
(ou envoyée en arbitrage DO si la politique site l'autorise).

### Quand est-elle vérifiée ?

À la soumission d'une AdS dans PaxLog, après la vérification du quota total
`max_pax_total`, une vérification par entreprise est effectuée :

```python
async def check_company_quota(
    ads: AdS,
    company_id: UUID,
    pax_count: int,
    db: AsyncSession
) -> CompanyQuotaResult:
    """
    Vérifie si l'entreprise dépasse max_pax_per_company sur le site cible.
    Appelée depuis ComplianceService.check_all() après check_capacity().
    """
    capacity = await get_current_capacity(ads.site_entry_asset_id, db)

    if not capacity.max_pax_per_company:
        return CompanyQuotaResult(ok=True)  # pas de limite par entreprise sur ce site

    # Compter les PAX de cette entreprise déjà approuvés / in_progress sur ce site
    current_company_pax = await db.scalar(
        select(func.count(AdSPax.id))
        .join(AdS, AdS.id == AdSPax.ads_id)
        .join(PaxProfile, PaxProfile.id == AdSPax.pax_id)
        .where(
            AdS.site_entry_asset_id == ads.site_entry_asset_id,
            AdS.status.in_(["approved", "in_progress"]),
            AdS.start_date <= ads.end_date,
            AdS.end_date >= ads.start_date,
            AdS.id != ads.id,
            PaxProfile.company_id == company_id,
            AdSPax.status.in_(["approved", "no_show"])
            # no_show compté : le PAX était prévu, peut encore arriver
        )
    )

    total_after = current_company_pax + pax_count
    if total_after > capacity.max_pax_per_company:
        return CompanyQuotaResult(
            ok=False,
            current=current_company_pax,
            limit=capacity.max_pax_per_company,
            requested=pax_count,
            overflow=total_after - capacity.max_pax_per_company
        )

    return CompanyQuotaResult(ok=True, current=current_company_pax,
                              limit=capacity.max_pax_per_company)
```

### Comportement si dépassement

- Si `max_pax_per_company` dépassé par l'AdS → **bloquant** : l'AdS passe en
  `pending_arbitration` (envoyée au DO) même si la validation N1 est accordée
- Le DO peut décider d'approuver quand même avec dérogation (motif obligatoire)
- Le DO peut aussi réduire le quota d'une autre AdS en cours pour libérer de la place

### Affichage dans l'interface

Sur la fiche d'un asset (Asset Registry) et dans le tableau de bord Planner :

```
ESF1 — Capacité PAX
  Total      : 23 / 30  (quota Perenco : 12, SCHLUMBERGER : 8, autres : 3)
  Max total  : 30
  Max/entrep.: 10 ← quota par entreprise actif
  Perenco    : 12  ✓ (sous quota)
  SCHLUMBERGER: 8  ✓ (sous quota, 2 places restantes)
  WORKOVER   : 3   ✓
```

### Mise à jour de la Pydantic `AssetCapacityRead`

```python
class AssetCapacityRead(BaseModel):
    # ...
    max_pax_per_company:       Optional[int]
    # Stats calculées par entreprise (nouveau)
    company_breakdown:         list[CompanyPaxStat]
    # [{company_id, company_name, current_pax, limit_reached}]
```

---


---

*Fin du document — Module Planner*
