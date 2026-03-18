# Module Projets — Spécification Technique Complète

> Version consolidée — Perenco Cameroun — Mars 2026

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Modèle de données](#2-modèle-de-données)
3. [Schémas Pydantic](#3-schémas-pydantic)
4. [Service layer](#4-service-layer)
5. [API endpoints](#5-api-endpoints)
6. [Règles de validation](#6-règles-de-validation)
7. [Événements émis](#7-événements-émis)
8. [Vue Kanban, Calendrier et notifications](#8-vue-kanban-calendrier-et-notifications)
9. [Gantt — SVAR MIT avec extensions custom](#9-gantt--svar-mit-avec-extensions-custom)

---


## 1. Rôle et périmètre

Le module Projets est le **référentiel central de tous les projets de l'entreprise**. Il fournit les données structurées (code projet, WBS, centre de coût, priorité, chef de projet) consommées par Planner, PaxLog et la comptabilité analytique.

Il contient également le moteur de **gestion de planning projet** (tâches, dépendances, CPM, versioning, simulation) qui est la couche projet de Planner.

---


---


## 2. Modèle de données

### 2.1 Project

```sql
CREATE TABLE projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  code                  VARCHAR(50) NOT NULL,
  name                  VARCHAR(300) NOT NULL,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft | active | on_hold | completed | cancelled
  type                  VARCHAR(20) NOT NULL,
  -- capital | opex | maintenance | inspection | study
  owner_id              UUID NOT NULL REFERENCES users(id),
  department_id         UUID REFERENCES departments(id),
  start_date            DATE,
  end_date              DATE,
  actual_start_date     DATE,
  actual_end_date       DATE,
  priority              VARCHAR(20) NOT NULL DEFAULT 'medium',
  -- critical | high | medium | low
  archived              BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, code)
);

CREATE INDEX idx_projects_entity  ON projects(entity_id);
CREATE INDEX idx_projects_status  ON projects(entity_id, status);
CREATE INDEX idx_projects_owner   ON projects(owner_id);

CREATE TABLE project_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id),
  old_status    VARCHAR(20),
  new_status    VARCHAR(20) NOT NULL,
  reason        TEXT NOT NULL,  -- OBLIGATOIRE pour toute transition
  changed_by    UUID NOT NULL REFERENCES users(id),
  changed_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 WBS (Work Breakdown Structure)

```sql
CREATE TABLE wbs_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES wbs_nodes(id),
  code              VARCHAR(50) NOT NULL,   -- ex: "1.2.3"
  name              VARCHAR(300) NOT NULL,
  cost_center_id    UUID REFERENCES cost_centers(id),
  estimated_budget  DECIMAL(15,2),
  currency          VARCHAR(10) DEFAULT 'XAF',
  sort_order        INTEGER DEFAULT 0,
  UNIQUE (project_id, code)
);

CREATE INDEX idx_wbs_project ON wbs_nodes(project_id);
CREATE INDEX idx_wbs_parent  ON wbs_nodes(parent_id);
```

### 2.3 ProjectSchedule (Version de planning)

```sql
CREATE TABLE project_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID REFERENCES entities(id),
  project_id            UUID NOT NULL REFERENCES projects(id),
  version_number        INTEGER NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- simulation | draft | active | archived
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  based_on_schedule_id  UUID REFERENCES project_schedules(id),
  created_by            UUID NOT NULL REFERENCES users(id),
  activated_by          UUID REFERENCES users(id),
  activated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, version_number)
);

-- Contrainte: un seul is_active=true par project
CREATE UNIQUE INDEX idx_one_active_schedule
  ON project_schedules(project_id)
  WHERE is_active = TRUE;

CREATE TABLE schedule_activations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id),
  new_schedule_id   UUID NOT NULL REFERENCES project_schedules(id),
  old_schedule_id   UUID REFERENCES project_schedules(id),
  activated_by      UUID NOT NULL REFERENCES users(id),
  activated_at      TIMESTAMPTZ DEFAULT NOW(),
  notes             TEXT
);
```

### 2.4 Task

```sql
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           UUID NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  parent_id             UUID REFERENCES tasks(id),
  wbs_code              VARCHAR(50) NOT NULL,   -- calculé auto ex: "1.2.3"
  name                  VARCHAR(300) NOT NULL,
  description           TEXT,
  type                  VARCHAR(20) NOT NULL DEFAULT 'task',
  -- task (feuille) | summary (récapitulatif) | milestone (jalon, durée=0)
  status                VARCHAR(20) NOT NULL DEFAULT 'not_started',
  -- not_started | in_progress | completed | on_hold | cancelled
  sort_order            INTEGER NOT NULL DEFAULT 0,
  -- Dates planifiées
  duration_days         DECIMAL(8,2),       -- null pour summary (calculé)
  start_date            DATE,
  end_date              DATE,
  -- Dates réelles
  actual_start_date     DATE,
  actual_end_date       DATE,
  -- Baseline (figée à la première activation)
  baseline_start_date   DATE,
  baseline_end_date     DATE,
  -- Avancement
  progress_pct          DECIMAL(5,2) DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  -- Ressources PAX
  pax_estimated         INTEGER DEFAULT 0,
  pax_unit              VARCHAR(20) DEFAULT 'per_day',  -- per_day | total
  -- Liens vers autres modules
  asset_id              UUID REFERENCES assets(id),
  cost_center_id        UUID REFERENCES cost_centers(id),
  -- Calculs CPM (mis à jour par le moteur de scheduling)
  early_start           DATE,
  early_finish          DATE,
  late_start            DATE,
  late_finish           DATE,
  total_float           DECIMAL(8,2),
  is_critical           BOOLEAN DEFAULT FALSE,
  -- Contraintes de dates
  constraint_type       VARCHAR(30),
  -- as_soon_as_possible | as_late_as_possible | must_start_on
  -- must_finish_on | start_no_earlier_than | finish_no_later_than
  constraint_date       DATE,
  -- Affichage
  color                 VARCHAR(7),   -- #RRGGBB optionnel
  UNIQUE (schedule_id, wbs_code)
);

CREATE INDEX idx_tasks_schedule  ON tasks(schedule_id);
CREATE INDEX idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX idx_tasks_critical  ON tasks(schedule_id) WHERE is_critical = TRUE;
CREATE INDEX idx_tasks_asset     ON tasks(asset_id) WHERE asset_id IS NOT NULL;
```

### 2.5 TaskLink (Dépendances)

```sql
CREATE TABLE task_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  predecessor_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type       VARCHAR(5) NOT NULL DEFAULT 'FS',
  -- FS (Fin→Début) | SS (Début→Début) | FF (Fin→Fin) | SF (Début→Fin)
  lag_days        DECIMAL(8,2) DEFAULT 0,  -- positif=attente, négatif=chevauchement
  lag_unit        VARCHAR(20) DEFAULT 'working_days',  -- working_days | calendar_days
  CHECK (predecessor_id <> successor_id),
  UNIQUE (predecessor_id, successor_id, link_type)
);

CREATE INDEX idx_links_pred  ON task_links(predecessor_id);
CREATE INDEX idx_links_succ  ON task_links(successor_id);
CREATE INDEX idx_links_sched ON task_links(schedule_id);
```

### 2.6 TaskResource

```sql
CREATE TABLE task_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_type   VARCHAR(20) NOT NULL,   -- named_pax | role | team
  pax_id          UUID REFERENCES pax_profiles(id),
  role_name       VARCHAR(100),
  quantity        DECIMAL(6,2) NOT NULL DEFAULT 1,
  allocation_pct  DECIMAL(5,2) DEFAULT 100 CHECK (allocation_pct BETWEEN 1 AND 100),
  notes           TEXT,
  CONSTRAINT resource_ref CHECK (
    (resource_type = 'named_pax' AND pax_id IS NOT NULL) OR
    (resource_type IN ('role', 'team') AND role_name IS NOT NULL)
  )
);
```

### 2.7 PlanningSimulation (temporaire)

```sql
CREATE TABLE planning_simulations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id),
  base_schedule_id    UUID NOT NULL REFERENCES project_schedules(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  -- Diff des modifications appliquées
  changes             JSONB NOT NULL DEFAULT '[]',
  -- [{type: 'update_task'|'add_task'|'delete_task'|'add_link'|'delete_link',
  --   entity_id: uuid, before: {}, after: {}}]
  -- Snapshot calculé après propagation (pour affichage frontend sans recalcul)
  calculated_tasks    JSONB,
  critical_path       JSONB,  -- [{task_id, wbs_code, name, float: 0}]
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL  -- NOW() + INTERVAL '4 hours' par défaut
);

CREATE INDEX idx_simulations_user    ON planning_simulations(project_id, user_id);
CREATE INDEX idx_simulations_expires ON planning_simulations(expires_at);
-- Job cron : DELETE FROM planning_simulations WHERE expires_at < NOW()
```

### 2.8 AdSImputation

```sql
CREATE TABLE ads_imputations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id              UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  wbs_id              UUID REFERENCES wbs_nodes(id),
  cost_center_id      UUID NOT NULL REFERENCES cost_centers(id),
  percentage          DECIMAL(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  cross_imputation    BOOLEAN DEFAULT FALSE,
  -- cross_imputation=true : PAX intervient pour project_id mais imputé sur cost_center_id différent
  notes               TEXT
  -- Contrainte applicative : SUM(percentage) par ads_id = 100
);
```

---


---


## 3. Schémas Pydantic

```python
# app/schemas/projects.py

class ProjectCreate(BaseModel):
    entity_id:      UUID
    code:           str = Field(..., min_length=2, max_length=50)
    name:           str = Field(..., min_length=2, max_length=300)
    description:    Optional[str] = None
    type:           Literal["capital","opex","maintenance","inspection","study"]
    owner_id:       UUID
    department_id:  Optional[UUID] = None
    start_date:     Optional[date] = None
    end_date:       Optional[date] = None
    priority:       Priority = Priority.medium

    @model_validator(mode='after')
    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date doit être >= start_date")
        return self

class ProjectRead(BaseModel):
    id:                 UUID
    entity_id:          UUID
    code:               str
    name:               str
    description:        Optional[str]
    status:             str
    type:               str
    owner_id:           UUID
    owner_name:         str
    department_id:      Optional[UUID]
    department_name:    Optional[str]
    start_date:         Optional[date]
    end_date:           Optional[date]
    actual_start_date:  Optional[date]
    actual_end_date:    Optional[date]
    priority:           str
    active_schedule_id: Optional[UUID]
    planner_activities_count: int   # nb d'activités Planner liées
    active_ads_count:   int         # nb d'AdS en cours
    created_at:         datetime
    updated_at:         datetime
    class Config: from_attributes = True

class StatusChangeRequest(BaseModel):
    new_status: Literal["active","on_hold","completed","cancelled"]
    reason:     str = Field(..., min_length=5)

class TaskCreate(BaseModel):
    schedule_id:        UUID
    parent_id:          Optional[UUID] = None
    name:               str = Field(..., min_length=2, max_length=300)
    type:               Literal["task","summary","milestone"] = "task"
    start_date:         Optional[date] = None
    end_date:           Optional[date] = None
    duration_days:      Optional[float] = Field(None, ge=0)
    pax_estimated:      int = Field(0, ge=0)
    pax_unit:           Literal["per_day","total"] = "per_day"
    asset_id:           Optional[UUID] = None
    cost_center_id:     Optional[UUID] = None
    constraint_type:    Optional[str] = None
    constraint_date:    Optional[date] = None
    color:              Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    sort_order:         int = 0

    @model_validator(mode='after')
    def validate_milestone(self):
        if self.type == 'milestone':
            self.duration_days = 0
        if self.type == 'summary' and self.duration_days is not None:
            raise ValueError("Les tâches summary n'ont pas de durée saisie — elle est calculée")
        return self

class TaskLinkCreate(BaseModel):
    schedule_id:    UUID
    predecessor_id: UUID
    successor_id:   UUID
    link_type:      Literal["FS","SS","FF","SF"] = "FS"
    lag_days:       float = 0
    lag_unit:       Literal["working_days","calendar_days"] = "working_days"

    @model_validator(mode='after')
    def no_self_link(self):
        if self.predecessor_id == self.successor_id:
            raise ValueError("Une tâche ne peut pas dépendre d'elle-même")
        return self

class SimulationChange(BaseModel):
    type:       Literal["update_task","add_task","delete_task","add_link","delete_link"]
    entity_id:  Optional[UUID] = None  # null pour add_task
    data:       dict  # champs modifiés ou données de création

class ScheduleActivateRequest(BaseModel):
    notes: Optional[str] = None
    # L'activation envoie automatiquement l'événement project.schedule_updated
```

---


---


## 4. Moteur de scheduling CPM

Le moteur CPM est implémenté **en TypeScript côté client** pour la simulation temps réel (0 latence) et **en Python côté serveur** pour la validation et la persistance.

```typescript
// apps/main/src/services/scheduling/cpm.ts

interface Task {
  id: string;
  duration_days: number;
  constraint_type?: string;
  constraint_date?: string;
  predecessors: Array<{ task_id: string; link_type: string; lag_days: number }>;
}

export function computeCPM(tasks: Task[]): CPMResult {
  // 1. Tri topologique (algorithme de Kahn)
  const sorted = topologicalSort(tasks);

  // 2. Forward pass — calcul Early Start / Early Finish
  for (const task of sorted) {
    task.early_start = computeEarlyStart(task, tasks);
    task.early_finish = task.early_start + task.duration_days;
    // Appliquer les contraintes de dates
    applyConstraint(task);
  }

  // 3. Backward pass — calcul Late Start / Late Finish
  const project_end = Math.max(...tasks.map(t => t.early_finish));
  for (const task of sorted.reverse()) {
    task.late_finish = computeLateFinish(task, tasks, project_end);
    task.late_start = task.late_finish - task.duration_days;
  }

  // 4. Calcul des marges et chemin critique
  for (const task of tasks) {
    task.total_float = task.late_start - task.early_start;
    task.is_critical = task.total_float === 0;
  }

  return {
    tasks,
    critical_path: tasks.filter(t => t.is_critical),
    project_duration: project_end,
    project_end_date: addWorkingDays(START_DATE, project_end)
  };
}

// Vérification de cycle avant ajout d'un lien (DFS)
export function wouldCreateCycle(
  tasks: Task[], predecessor_id: string, successor_id: string
): boolean {
  // DFS depuis successor_id — si on atteint predecessor_id → cycle
  const visited = new Set<string>();
  const stack = [successor_id];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === predecessor_id) return true;
    if (!visited.has(current)) {
      visited.add(current);
      const successors = getSuccessors(tasks, current);
      stack.push(...successors);
    }
  }
  return false;
}
```

```python
# app/services/projects/scheduling_engine.py

class SchedulingEngine:
    """Moteur CPM côté serveur — validation et persistance."""

    async def compute_full_schedule(self, schedule_id: UUID, db: AsyncSession) -> None:
        """
        Recalcul complet : forward pass + backward pass + chemin critique.
        Met à jour les champs early_start, early_finish, late_start, late_finish,
        total_float, is_critical sur toutes les tâches du schedule.
        Déclenché à l'activation d'une version ou sur demande.
        """
        tasks = await db.query(Task).filter(Task.schedule_id == schedule_id).all()
        links = await db.query(TaskLink).filter(TaskLink.schedule_id == schedule_id).all()

        # Construction du graphe
        graph = build_dag(tasks, links)

        # Vérification de cycle (obligatoire avant calcul)
        if has_cycle(graph):
            raise ValueError("Le planning contient une dépendance circulaire")

        # Tri topologique
        sorted_tasks = topological_sort(graph)

        # Forward pass
        for task in sorted_tasks:
            task.early_start = self._compute_early_start(task, graph, links)
            task.early_finish = task.early_start + (task.duration_days or 0)
            self._apply_constraint(task)  # Respecter les contraintes de dates

        # Backward pass
        project_end = max(t.early_finish for t in tasks)
        for task in reversed(sorted_tasks):
            task.late_finish = self._compute_late_finish(task, graph, links, project_end)
            task.late_start = task.late_finish - (task.duration_days or 0)
            task.total_float = task.late_start - task.early_start
            task.is_critical = abs(task.total_float) < 0.01  # float epsilon

        # Mise à jour en base (batch)
        await db.bulk_update_mappings(Task, [
            {'id': t.id, 'early_start': t.early_start, 'early_finish': t.early_finish,
             'late_start': t.late_start, 'late_finish': t.late_finish,
             'total_float': t.total_float, 'is_critical': t.is_critical}
            for t in tasks
        ])
        await db.commit()

    async def check_for_cycle(self, schedule_id: UUID, new_link: TaskLinkCreate, db) -> bool:
        """
        Vérification DFS avant d'insérer un nouveau lien.
        Retourne True si le lien créerait un cycle.
        DOIT être appelé dans la route POST /links avant l'INSERT.
        """

    async def compute_summary_tasks(self, schedule_id: UUID, db) -> None:
        """
        Recalcul des tâches summary (parent) depuis leurs enfants :
        - start_date = min(enfants.start_date)
        - end_date = max(enfants.end_date)
        - pax_estimated = sum(enfants.pax_estimated) — pour per_day
        - progress_pct = moyenne pondérée par durée
        """

    async def recalculate_wbs_codes(self, schedule_id: UUID, db) -> None:
        """
        Recalcul des codes WBS après déplacement/réordonnancement.
        DFS de l'arbre, compteur par niveau.
        Ex: root task 1 → "1", ses enfants "1.1", "1.2", petits-enfants "1.1.1" etc.
        Mise à jour batch en fin.
        """
```

---


---


## 5. Service layer

```python
# app/services/projects/project_service.py

class ProjectService:

    async def create_project(self, data: ProjectCreate, actor: User, db) -> Project:
        """
        1. Vérifier unicité du code dans l'entité
        2. Créer le projet en status=draft
        3. Créer automatiquement un premier ProjectSchedule vide en status=draft
        4. Audit log
        """

    async def change_status(
        self, project_id: UUID, req: StatusChangeRequest, actor: User, db
    ) -> Project:
        """
        Transitions autorisées :
          draft → active                : CHEF_PROJET (owner), DO
          active → on_hold              : CHEF_PROJET (owner), DO
          on_hold → active              : CHEF_PROJET (owner), DO
          active | on_hold → completed  : CHEF_PROJET (owner), DO
          * → cancelled                 : CHEF_PROJET (owner), DO (reason obligatoire)

        Effets sur cancelled/completed :
          - Le projet n'apparaît plus dans les listes de sélection de Planner
          - Les AdS actives liées reçoivent un avertissement
          - Émettre project.status_changed
        """

    async def activate_schedule(
        self, schedule_id: UUID, actor: User, db, notes: str = None
    ) -> ProjectSchedule:
        """
        Droits: CHEF_PROJET owner du projet ou DO.
        1. Désactiver l'ancien schedule actif (is_active=False, status=archived)
        2. Activer le nouveau (is_active=True, status=active, activated_by, activated_at)
        3. Si première activation → copier les dates tâches vers baseline_start/end
        4. Recalculer le planning CPM complet
        5. Enregistrer dans schedule_activations
        6. Émettre project.schedule_updated avec le diff des tâches
        7. Audit log
        """

    async def clone_schedule(
        self, source_schedule_id: UUID, name: str, actor: User, db
    ) -> ProjectSchedule:
        """
        Copie récursive de toutes les Tasks et TaskLinks.
        Génère de nouveaux UUIDs en maintenant la cohérence des FK.
        Map: {old_task_id → new_task_id} pour recréer les liens.
        Le nouveau schedule est en status=draft.
        """


# app/services/projects/simulation_service.py

class SimulationService:

    async def start_simulation(
        self, project_id: UUID, base_schedule_id: UUID, actor: User, db
    ) -> PlanningSimulation:
        """
        Crée une session de simulation avec expires_at = NOW() + 4h.
        Une seule simulation active par utilisateur par projet.
        Si une simulation existe déjà → la retourner (ne pas en créer une nouvelle).
        """

    async def apply_changes(
        self, simulation_id: UUID, changes: list[SimulationChange], db
    ) -> PlanningSimulation:
        """
        Ajoute les changements à la liste changes de la simulation.
        Ne persiste rien dans les tables de données réelles.
        Recalcule le snapshot calculated_tasks + critical_path.
        Met à jour expires_at (renouvèle le TTL à chaque action).
        """

    async def save_as_draft(
        self, simulation_id: UUID, name: str, actor: User, db
    ) -> ProjectSchedule:
        """
        1. Applique les changes sur un clone du base_schedule
        2. Crée un nouveau ProjectSchedule en status=draft avec les nouvelles tâches
        3. Supprime la simulation
        4. Retourne le nouveau schedule
        """

    async def discard(self, simulation_id: UUID, actor: User, db) -> None:
        """Supprime la simulation — aucun changement persisté."""
```

---


---


## 6. API endpoints

### 6.1 Projets

```
POST   /api/v1/projects
  Body: ProjectCreate
  Response 201: ProjectRead
  Erreurs:
    400 DUPLICATE_CODE        — code déjà utilisé dans l'entité
    400 INVALID_DATES
    403 FORBIDDEN

GET    /api/v1/projects
  Query: entity_id, status, type, owner_id, priority, q (recherche texte), page, per_page
  Response 200: PaginatedResponse[ProjectRead]

GET    /api/v1/projects/:id
  Response 200: ProjectRead

PATCH  /api/v1/projects/:id
  Body: ProjectUpdate (mêmes champs que Create, tous optionnels)
  Response 200: ProjectRead
  Note: code et entity_id non modifiables après création

POST   /api/v1/projects/:id/status
  Body: StatusChangeRequest
  Response 200: ProjectRead
  Erreurs:
    400 INVALID_TRANSITION    — transition non autorisée
    400 MISSING_REASON        — reason obligatoire pour certaines transitions
    403 NOT_OWNER_OR_DO

GET    /api/v1/projects/:id/status-history
  Response 200: list[StatusHistoryRead]

GET    /api/v1/projects/:id/wbs
  Response 200: list[WBSNodeRead]  -- arbre complet (hiérarchie)

POST   /api/v1/projects/:id/wbs
  Body: WBSNodeCreate
  Response 201: WBSNodeRead

PATCH  /api/v1/projects/:id/wbs/:wbs_id
  Body: WBSNodeUpdate
  Response 200: WBSNodeRead

DELETE /api/v1/projects/:id/wbs/:wbs_id
  Note: interdit si des tâches ou imputations AdS référencent ce nœud
  Response 200 | 409 WBS_IN_USE

GET    /api/v1/projects/:id/activities
  Response 200: list[ActivitySummary]  -- fenêtres Planner liées au projet

GET    /api/v1/projects/:id/ads
  Response 200: list[AdsSummary]  -- AdS liées au projet
```

### 6.2 Versions de planning (Schedules)

```
GET    /api/v1/projects/:id/schedules
  Response 200: list[ScheduleRead]

POST   /api/v1/projects/:id/schedules
  Body: { name: str, description: str, base_schedule_id: UUID (optionnel) }
  Response 201: ScheduleRead
  Note: si base_schedule_id fourni → clone, sinon → vide

GET    /api/v1/projects/:id/schedules/:sid
  Response 200: ScheduleRead (avec is_active, version_number)

PATCH  /api/v1/projects/:id/schedules/:sid
  Body: { name?: str, description?: str }
  Response 200: ScheduleRead

POST   /api/v1/projects/:id/schedules/:sid/activate
  Body: ScheduleActivateRequest
  Response 200: ScheduleRead
  Droits: CHEF_PROJET (owner) | DO
  Effets: désactive l'ancien, calcule CPM, émet project.schedule_updated

GET    /api/v1/projects/:id/schedules/:sid/diff/:sid2
  Response 200: ScheduleDiff
  -- {tasks_added, tasks_removed, tasks_modified: [{id, field, old, new}]}

POST   /api/v1/projects/:id/schedules/:sid/push-to-planner
  Body: { task_ids: list[UUID] }  -- si vide → toutes les tâches feuilles avec asset_id
  Response 200: { created_activities: int, updated_activities: int, skipped: int }
  Note: crée/met à jour des Activities dans Planner pour chaque tâche sélectionnée
```

### 6.3 Tâches

```
GET    /api/v1/schedules/:sid/tasks
  Response 200: list[TaskRead]  -- arbre complet avec hiérarchie

POST   /api/v1/schedules/:sid/tasks
  Body: TaskCreate
  Response 201: TaskRead
  Effets: recalcule wbs_codes + CPM des tâches liées

GET    /api/v1/schedules/:sid/tasks/:tid
  Response 200: TaskRead (avec predecessors, successors, resources)

PATCH  /api/v1/schedules/:sid/tasks/:tid
  Body: TaskUpdate
  Response 200: TaskRead
  Attention: modification de start_date/end_date/duration déclenche propagation CPM
  Note: interdit sur schedule active → passer par simulation

DELETE /api/v1/schedules/:sid/tasks/:tid
  Note: supprime aussi les sous-tâches (cascade) et les liens
  Response 200: { deleted_tasks: int, deleted_links: int }

POST   /api/v1/schedules/:sid/tasks/:tid/move
  Body: { new_parent_id: UUID | null, new_sort_order: int }
  Response 200: TaskRead
  Effets: recalcule wbs_codes

POST   /api/v1/schedules/:sid/tasks/reorder
  Body: [{ id: UUID, sort_order: int }]
  Response 200: list[TaskRead]
```

### 6.4 Liens de dépendance

```
GET    /api/v1/schedules/:sid/links
  Response 200: list[TaskLinkRead]

POST   /api/v1/schedules/:sid/links
  Body: TaskLinkCreate
  Response 201: TaskLinkRead
  Erreurs:
    409 WOULD_CREATE_CYCLE    — DFS détecte un cycle avant INSERT
    400 DUPLICATE_LINK        — lien déjà existant pour ce couple
  Effets: propagation CPM après création

DELETE /api/v1/schedules/:sid/links/:lid
  Response 200: { deleted: true }
  Effets: propagation CPM après suppression

GET    /api/v1/schedules/:sid/critical-path
  Response 200: list[TaskRead]  -- tâches avec is_critical=true, ordonnées

POST   /api/v1/schedules/:sid/recalculate
  Response 200: { tasks_updated: int, critical_path_length: int }
  Note: force un recalcul CPM complet côté serveur
```

### 6.5 Simulation

```
POST   /api/v1/projects/:id/simulation
  Body: { base_schedule_id: UUID }
  Response 201: SimulationRead  -- avec calculated_tasks snapshot
  Note: une seule simulation active par user/project

GET    /api/v1/projects/:id/simulation
  Response 200: SimulationRead | 404 si pas de simulation active

PATCH  /api/v1/projects/:id/simulation
  Body: { changes: list[SimulationChange] }
  Response 200: SimulationRead  -- avec snapshot recalculé
  Note: chaque PATCH renouvèle expires_at

POST   /api/v1/projects/:id/simulation/save
  Body: { name: str, activate_immediately: bool }
  Response 201: ScheduleRead
  Note: si activate_immediately=true → active directement (droits CHEF_PROJET requis)

DELETE /api/v1/projects/:id/simulation
  Response 200: { discarded: true }
```

### 6.6 Ressources tâches

```
GET    /api/v1/schedules/:sid/tasks/:tid/resources
  Response 200: list[TaskResourceRead]

POST   /api/v1/schedules/:sid/tasks/:tid/resources
  Body: TaskResourceCreate
  Response 201: TaskResourceRead

PATCH  /api/v1/schedules/:sid/tasks/:tid/resources/:rid
  Body: TaskResourceUpdate
  Response 200: TaskResourceRead

DELETE /api/v1/schedules/:sid/tasks/:tid/resources/:rid
  Response 200: { deleted: true }
```

---


---


## 7. Règles de validation exhaustives

| Règle | Condition | Erreur |
|---|---|---|
| R-PROJ-01 | Code projet unique par entité | `400 DUPLICATE_CODE` |
| R-PROJ-02 | end_date >= start_date | `400 INVALID_DATES` |
| R-PROJ-03 | Transition de statut valide | `400 INVALID_TRANSITION` |
| R-PROJ-04 | reason obligatoire sur cancelled/completed | `400 MISSING_REASON` |
| R-PROJ-05 | Projet cancelled/completed → non modifiable | `409 PROJECT_CLOSED` |
| R-PROJ-06 | Tâche milestone → duration=0 | `400 MILESTONE_DURATION` |
| R-PROJ-07 | Tâche summary → duration non saisie | `400 SUMMARY_NO_DURATION` |
| R-PROJ-08 | Lien créerait un cycle → rejeté | `409 WOULD_CREATE_CYCLE` |
| R-PROJ-09 | Lien sur soi-même interdit | `400 SELF_LINK` |
| R-PROJ-10 | Schedule active → tâches non modifiables directement | `409 USE_SIMULATION` |
| R-PROJ-11 | Un seul schedule active par projet | enforced par index unique PostgreSQL |
| R-PROJ-12 | Activation → droits CHEF_PROJET (owner) ou DO | `403 NOT_OWNER_OR_DO` |
| R-PROJ-13 | SUM(ads_imputation.percentage) = 100 par AdS | `400 IMPUTATION_NOT_100` |
| R-PROJ-14 | WBS référencé par AdS → non supprimable | `409 WBS_IN_USE` |

---


---


## 8. Vue Kanban, Calendrier, Notifications et Analytics


### A. Assignés par tâche

La table `tasks` n'a pas de champ `assigned_to`. Un chef de projet doit
pouvoir assigner une ou plusieurs personnes à chaque tâche.

```sql
CREATE TABLE task_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);
CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);
```

**Interface :** Champ "Assignés" dans la fiche tâche — sélection multiple
depuis les membres du projet. Affichage des avatars/initiales sur la carte
Kanban et dans la ligne Gantt.

**Règle :** Un utilisateur ne peut être assigné que s'il est membre du projet
(table `project_members` à créer — voir section B ci-dessous).

---

### B. Membres du projet

Un projet doit avoir une liste de membres avec leur rôle. Aujourd'hui seul
`owner_id` existe sur `projects`.

```sql
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL DEFAULT 'member',
  -- owner | manager | member | viewer
  added_by    UUID REFERENCES users(id),
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user    ON project_members(user_id);
```

Le `owner_id` du projet est automatiquement ajouté comme `role = 'owner'`
à la création.

---

### C. Commentaires sur les tâches

Fil de discussion par tâche, avec support des @mentions.

```sql
CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  -- Markdown supporté. @mentions parsées au format @{user_id}
  edited      BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at   TIMESTAMPTZ,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);

-- Mentions extraites du commentaire (pour notifications)
CREATE TABLE task_comment_mentions (
  comment_id  UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);
```

**Règles :**
- Seul l'auteur peut modifier ou supprimer son commentaire (soft delete)
- Les membres du projet peuvent commenter
- À la sauvegarde du commentaire, les @mentions déclenchent des notifications
- Le contenu est du Markdown (rendu côté client)

**Interface :** Section "Discussion" en bas de la fiche tâche (accordéon),
avec compteur de commentaires sur la carte Kanban et la ligne Gantt.

---

### D. Pièces jointes sur les tâches

Fichiers uploadés sur S3, liés à une tâche.

```sql
CREATE TABLE task_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  filename      VARCHAR(300) NOT NULL,
  file_url      TEXT NOT NULL,         -- URL S3 signée
  file_size_kb  INTEGER,
  mime_type     VARCHAR(100),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);
```

**Contraintes upload (cohérence avec les règles globales) :**
- Taille max : 10 MB par fichier
- Types acceptés : PDF, DOCX, XLSX, PNG, JPG, MP4 (liste configurable)
- Pas de quota par tâche, mais audit log sur chaque upload

---

### E. Vue Kanban

Vue complémentaire au Gantt — organisation des tâches par statut
avec drag & drop pour changer le statut.

**Colonnes :** `not_started` | `in_progress` | `on_hold` | `completed` | `cancelled`

Chaque carte affiche : nom de la tâche, WBS code, assignés (avatars),
date d'échéance (rouge si dépassée), priorité (badge couleur), compteur
de commentaires, indicateur pièces jointes.

**Filtres disponibles :**
- Par assigné (voir mes tâches)
- Par priorité
- Par date d'échéance (cette semaine, ce mois)
- Par type (tâche / jalon / récapitulatif)

**Drag & drop :** déplacer une carte entre colonnes → transition de statut +
entrée dans l'audit log + notification au CHEF_PROJET si tâche passée en
`completed`.

**Endpoint :**
```
PATCH /api/v1/projects/tasks/:id/status
  Body: { status: str, reason?: str }
  Note: reason obligatoire si passage en cancelled ou on_hold
```

---

### F. Vue Calendrier

Affichage des tâches et jalons sur un calendrier mensuel/hebdomadaire.

Chaque tâche est représentée par une barre de sa `start_date` à sa `end_date`.
Les jalons (type=milestone) apparaissent comme un point sur leur date.

**Codes couleur :**
- Tâche sur le chemin critique → rouge
- Tâche en retard (end_date dépassée et non completed) → orange
- Tâche normale → bleu
- Jalon → losange

**Filtres :** par assigné, par WBS niveau 1, par priorité.

Le calendrier est en lecture seule — les modifications de dates restent
dans le Gantt (source de vérité du planning).

---

### G. Notifications email — assignation et rappels d'échéance

**G.1 — Notification d'assignation**

Quand un utilisateur est ajouté dans `task_assignees` → email automatique :

```
Objet : [OpsFlux Projets] Vous avez été assigné à une tâche

Projet  : GCM-2026 — Campagne E-LINE ESF1
Tâche   : 1.2.3 — Installation équipement
Échéance : 18 mai 2026
Assigné par : Jean KOUASSI (Chef de Projet)

[Voir la tâche →]
```

**G.2 — Rappels avant échéance (batch quotidien 7h00)**

Pour chaque tâche `not_started` ou `in_progress` avec `end_date` dans les
prochains jours, envoyer un rappel aux assignés :

```env
TASK_REMINDER_DAYS=7,1
# Rappels envoyés J-7 et J-1 avant end_date
# Configurable : 14,7,3,1 selon les besoins
```

Le batch vérifie que la tâche n'est pas `completed` ou `cancelled` avant
d'envoyer — pas de rappel inutile.

**G.3 — Notification sur commentaire**

Quand un commentaire est posté sur une tâche :
- Les assignés de la tâche sont notifiés (in-app + email si activé)
- Les utilisateurs @mentionnés reçoivent une notification (in-app + email)
- Le CHEF_PROJET reçoit une notification in-app uniquement

---

### H. Analytics projet

Dashboard analytique accessible depuis la fiche projet.

**H.1 — Avancement global**

```
Projet GCM-2026 — Campagne E-LINE ESF1
─────────────────────────────────────────────────────
Avancement global    : 34%  ████████░░░░░░░░░░░░░░  (34/100 tâches complétées)
Chemin critique      : 8 tâches  |  Retard critique : 0
Tâches en retard     : 3   ⚠
Budget estimé        : 45 000 000 XAF
─────────────────────────────────────────────────────
```

**H.2 — Burndown chart**

Courbe théorique (tâches restantes si rythme constant) vs courbe réelle
(tâches effectivement complétées). Données calculées depuis `tasks.actual_end_date`.

**H.3 — Avancement par WBS (niveau 1)**

```
1. ÉTUDES         ████████████████████  100%  (4/4)
2. APPROVISIONNEMENT ████████░░░░░░  50%   (3/6)
3. INSTALLATION   ██░░░░░░░░░░░░░░   12%   (1/8)
4. TESTS          ░░░░░░░░░░░░░░░░    0%   (0/4)
```

**H.4 — Charge par assigné**

Qui a combien de tâches actives, combien sont en retard.
Utile pour rééquilibrer la charge entre les membres de l'équipe.

```
Jean DUPONT    : 5 tâches  (2 en retard ⚠)  ██████░░░░  60%
Amadou NZIE    : 3 tâches  (0 en retard ✓)   ████░░░░░░  40%
Marie FOTSO    : 8 tâches  (1 en retard ⚠)   █████████░  90% — surcharge
```

**Endpoint :**
```
GET /api/v1/projects/:id/analytics
  Response 200:
    {
      completion_pct: float,
      tasks_total: int, tasks_completed: int, tasks_overdue: int,
      critical_path_count: int, critical_overdue: int,
      burndown: [{date, planned_remaining, actual_remaining}],
      wbs_progress: [{wbs_code, name, pct, total, done}],
      workload: [{user_id, name, active, overdue}]
    }
```

---

### I. Synthèse des nouveaux endpoints

```
# Membres du projet
GET    /api/v1/projects/:id/members                  Liste des membres
POST   /api/v1/projects/:id/members                  Ajouter un membre
DELETE /api/v1/projects/:id/members/:user_id          Retirer un membre
PATCH  /api/v1/projects/:id/members/:user_id/role     Changer le rôle

# Assignés sur les tâches
POST   /api/v1/projects/tasks/:id/assignees           Assigner
DELETE /api/v1/projects/tasks/:id/assignees/:user_id  Désassigner

# Commentaires
GET    /api/v1/projects/tasks/:id/comments            Liste (chronologique)
POST   /api/v1/projects/tasks/:id/comments            Poster
PATCH  /api/v1/projects/tasks/:id/comments/:cid       Modifier (auteur uniquement)
DELETE /api/v1/projects/tasks/:id/comments/:cid       Supprimer (soft)

# Pièces jointes
GET    /api/v1/projects/tasks/:id/attachments         Liste
POST   /api/v1/projects/tasks/:id/attachments         Upload (multipart)
DELETE /api/v1/projects/tasks/:id/attachments/:aid    Supprimer

# Analytics
GET    /api/v1/projects/:id/analytics                 Dashboard analytique

# Vues (pas de nouveaux endpoints — données existantes, nouvelles représentations)
# Vue Kanban → GET /api/v1/projects/:id/schedule/:sid/tasks?view=kanban
# Vue Calendrier → GET /api/v1/projects/:id/schedule/:sid/tasks?view=calendar&month=2026-05
```

---


---


## 9. Gantt — SVAR MIT avec extensions custom


### Décision finale

Le module Projets utilise **SVAR React Gantt édition MIT (gratuite)** comme
socle, complété par des **extensions custom** pour les fonctionnalités PRO
(chemin critique, baselines, export PDF). Cette approche donne toute
l'interactivité de SVAR sans aucun coût de licence.

**Pourquoi c'est faisable sans la version PRO :**
Le CPM (Early/Late start, float, `is_critical`) et les baselines
(`baseline_start_date`, `baseline_end_date`) sont **entièrement calculés
côté backend Python** et stockés en base. La librairie frontend n'a pas
besoin de les recalculer — elle doit juste les **afficher**. Ce sont deux
problèmes distincts : calcul (backend ✓) et rendu (frontend custom).

---

### Ce que SVAR MIT fournit nativement (zéro code custom)

- Timeline interactive avec drag & drop des barres (déplace les dates)
- Redimensionnement des barres (change la durée)
- Dépendances FS / SS / FF / SF avec lag/lead — création/suppression sur la timeline
- Hiérarchie WBS avec expand/collapse des nœuds parents
- Zoom multi-niveaux : heure / jour / semaine / mois / trimestre / année
- Édition inline du nom de tâche directement sur la grille
- Types de tâches : `task`, `summary`, `milestone`
- Marqueur "Aujourd'hui"
- Colonnes de grille personnalisables avec templates React
- Événements `onTaskUpdate`, `onLinkCreate`, `onLinkDelete`
- Mode lecture seule (`readonly`)
- TypeScript natif, React 19, thèmes light/dark

---

### Extensions custom — ce qu'on ajoute par-dessus

#### Extension 1 — Chemin critique (rendu couleur depuis `is_critical`)

```tsx
// Coloriage des barres critiques via taskbarStyle
// SVAR expose un prop pour styler chaque barre selon les données de la tâche

const getTaskbarStyle = (task: SvarTask) => {
  if (task.is_critical) {
    return {
      background: "#ef4444",       // rouge critique
      border: "2px solid #b91c1c",
    };
  }
  if (task.type === "summary") {
    return { background: "#6366f1" };
  }
  return { background: "#3b82f6" };
};

// Coloration des flèches de dépendances critiques
const getLinkStyle = (link: SvarLink) => {
  if (link.is_critical_path) {
    return { stroke: "#ef4444", strokeWidth: 2 };
  }
  return { stroke: "#94a3b8" };
};
```

Le backend retourne `is_critical: true/false` sur chaque tâche et
`is_critical_path: true/false` sur chaque lien — calculé par le CPM.

#### Extension 2 — Baselines (barre grise en arrière-plan)

SVAR n'a pas de slot natif pour les baselines en version MIT. On les rend
via le prop `taskContent` (slot de contenu personnalisé dans chaque barre) :

```tsx
// Rendu d'une barre baseline en position absolue derrière la barre principale
const TaskWithBaseline = ({ task, getX, getWidth }: TaskContentProps) => {
  if (!task.baseline_start || !task.baseline_end) return null;

  const baselineLeft  = getX(task.baseline_start);
  const baselineWidth = getWidth(task.baseline_start, task.baseline_end);

  return (
    <div
      className="gantt-baseline"
      style={{
        position: "absolute",
        left:     baselineLeft,
        width:    baselineWidth,
        height:   "4px",
        bottom:   "-2px",         // juste sous la barre principale
        background: "#94a3b8",    // gris ardoise
        borderRadius: "2px",
        opacity: 0.7,
        pointerEvents: "none",    // pas d'interaction souris
      }}
      title={`Baseline : ${task.baseline_start} → ${task.baseline_end}`}
    />
  );
};
```

Les helpers `getX(date)` et `getWidth(start, end)` sont fournis par SVAR
dans les props du slot de contenu — ils convertissent les dates en pixels
selon l'échelle de zoom courante.

#### Extension 3 — Légende chemin critique / baseline

```tsx
// Barre de légende au-dessus du Gantt
const GanttLegend = () => (
  <div className="flex gap-4 text-xs text-slate-500 mb-2">
    <span className="flex items-center gap-1">
      <span className="w-4 h-3 bg-red-500 rounded-sm inline-block"/>
      Chemin critique
    </span>
    <span className="flex items-center gap-1">
      <span className="w-4 h-1 bg-slate-400 rounded-sm inline-block"/>
      Baseline
    </span>
    <span className="flex items-center gap-1">
      <span className="w-4 h-3 bg-blue-500 rounded-sm inline-block"/>
      Tâche normale
    </span>
    <span className="flex items-center gap-1">
      <span className="w-4 h-3 bg-indigo-500 rounded-sm inline-block"/>
      Récapitulatif
    </span>
  </div>
);
```

#### Extension 4 — Export PDF/PNG (WeasyPrint côté serveur)

SVAR PRO inclut l'export natif. En version MIT, l'export est déclenché
depuis le backend (cohérent avec la règle D-C14 sur WeasyPrint) :

```tsx
// Bouton export dans la toolbar du Gantt
const handleExportPDF = async () => {
  const response = await fetch(
    `/api/v1/projects/${projectId}/schedule/${scheduleId}/export?format=pdf`
  );
  const blob = await response.blob();
  downloadFile(blob, `gantt-${projectCode}.pdf`);
};
```

```python
# Backend — GET /api/v1/projects/:id/schedule/:sid/export
# Génère le PDF via WeasyPrint depuis un template HTML Gantt
# Le template reçoit les tâches avec is_critical, baselines, links
# et les rend comme un Gantt statique A3 paysage
```

#### Extension 5 — Indicateur float sur les tâches non critiques

Au survol d'une tâche, un tooltip enrichi affiche le float total :

```tsx
const TaskTooltip = ({ task }: { task: SvarTask }) => (
  <div className="gantt-tooltip">
    <strong>{task.text}</strong>
    <div>WBS : {task.wbs_code}</div>
    <div>Avancement : {task.progress * 100}%</div>
    {task.is_critical
      ? <div className="text-red-500 font-semibold">⚠ Chemin critique</div>
      : <div>Marge : {task.total_float}j</div>
    }
    {task.baseline_start && (
      <div className="text-slate-400 text-xs">
        Baseline : {task.baseline_start} → {task.baseline_end}
      </div>
    )}
  </div>
);
```

---

### Composant GanttView complet

```tsx
// client/src/features/projects/components/GanttView.tsx
import { Gantt } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";

const GanttView = ({ scheduleId }: { scheduleId: string }) => {
  const { data }  = useProjectGantt(scheduleId);
  const canEdit   = useCanEdit();

  const svarTasks = useMemo(() => data.tasks.map(t => ({
    id:         t.id,
    text:       t.name,
    start:      new Date(t.start_date),
    end:        new Date(t.end_date),
    progress:   t.progress_pct / 100,
    parent:     t.parent_id ?? 0,
    type:       t.type === "milestone" ? "milestone" : "task",
    // Données enrichies pour le rendu custom
    is_critical:     t.is_critical,
    total_float:     t.total_float,
    wbs_code:        t.wbs_code,
    baseline_start:  t.baseline_start_date,
    baseline_end:    t.baseline_end_date,
  })), [data.tasks]);

  const svarLinks = useMemo(() => data.links.map(l => ({
    id:     l.id,
    source: l.predecessor_id,
    target: l.successor_id,
    type:   { FS: 0, SS: 1, FF: 2, SF: 3 }[l.link_type],
    lag:    l.lag_days,
    // Lien sur le chemin critique
    is_critical_path: l.is_critical_path ?? false,
  })), [data.links]);

  return (
    <div className="flex flex-col h-full">
      <GanttToolbar
        onExportPDF={handleExportPDF}
        onToggleBaselines={toggleBaselines}
        onToggleCriticalPath={toggleCriticalPath}
        showBaselines={showBaselines}
        showCriticalPath={showCriticalPath}
      />
      <GanttLegend />
      <Gantt
        tasks={svarTasks}
        links={svarLinks}
        scales={[
          { unit: "month", step: 1, format: "MMMM yyyy" },
          { unit: "week",  step: 1, format: "wk %W" }
        ]}
        columns={[
          { name: "wbs_code",  label: "WBS",    width: 80 },
          { name: "text",      label: "Tâche",  width: 240, tree: true },
          { name: "start",     label: "Début",  width: 90  },
          { name: "end",       label: "Fin",    width: 90  },
          { name: "progress",  label: "%",      width: 50,
            template: (t) => <ProgressCell value={t.progress} /> },
          { name: "assignees", label: "Équipe", width: 80,
            template: (t) => <AssigneeAvatars paxIds={t.assignee_ids} /> },
        ]}
        // ── Rendu custom des barres (critique + baseline) ──────────────────
        taskStyle={getTaskbarStyle}
        taskContent={showBaselines ? TaskWithBaseline : undefined}
        tooltip={TaskTooltip}
        linkStyle={getLinkStyle}
        // ── Événements → API ───────────────────────────────────────────────
        onTaskUpdate={async (task) => {
          await patchTask(task.id, {
            start_date: task.start,
            end_date:   task.end,
            progress_pct: task.progress * 100,
          });
          // Le backend recalcule le CPM et retourne les nouvelles tâches
          // avec is_critical mis à jour → React Query invalide le cache
        }}
        onLinkCreate={async (link) => {
          await createTaskLink({
            predecessor_id: link.source,
            successor_id:   link.target,
            link_type:      ["FS","SS","FF","SF"][link.type],
            lag_days:       link.lag ?? 0,
          });
        }}
        onLinkDelete={async (linkId) => {
          await deleteTaskLink(linkId);
        }}
        readonly={!canEdit}
      />
    </div>
  );
};
```

---

### Recalcul CPM après modification

Quand l'utilisateur déplace une barre (drag) ou modifie une dépendance,
la séquence est :

```
1. onTaskUpdate / onLinkCreate déclenché par SVAR
2. PATCH /tasks/:id ou POST /tasks/:id/links → backend FastAPI
3. Le backend recalcule le CPM via le moteur Python (SchedulingEngine)
4. Retourne les tâches mises à jour avec is_critical, early_start, total_float
5. React Query invalide le cache du schedule → re-render automatique
6. Les barres critiques s'affichent en rouge, les non-critiques en bleu
```

Le recalcul CPM est **synchrone** (< 100ms pour 500 tâches) — l'utilisateur
voit le chemin critique mis à jour instantanément après chaque modification.

---

### Récapitulatif fonctionnel — parité avec SVAR PRO

| Fonctionnalité | SVAR PRO | OpsFlux (MIT + custom) |
|---|---|---|
| Timeline drag & drop | ✓ natif | ✓ natif SVAR MIT |
| Dépendances FS/SS/FF/SF + lag | ✓ natif | ✓ natif SVAR MIT |
| WBS hiérarchique expand/collapse | ✓ natif | ✓ natif SVAR MIT |
| Zoom multi-niveaux | ✓ natif | ✓ natif SVAR MIT |
| Édition inline | ✓ natif | ✓ natif SVAR MIT |
| Milestone / Summary | ✓ natif | ✓ natif SVAR MIT |
| Chemin critique (couleur rouge) | ✓ natif PRO | ✓ custom via `is_critical` backend |
| Baselines (barre grise) | ✓ natif PRO | ✓ custom via slot `taskContent` |
| Tooltip avec float/baseline | ✓ natif PRO | ✓ custom `tooltip` prop |
| Export PDF/PNG | ✓ natif PRO | ✓ WeasyPrint backend (D-C14) |
| Auto-scheduling | ✓ natif PRO | ✓ moteur CPM Python backend |
| Calendrier jours ouvrés | ✓ natif PRO | ✓ géré backend (lag_unit=working_days) |
| **Coût licence** | ~$524/dev | **0€** |


---

*Fin du document — Module Projets*
