# Modèle de données — DDL PostgreSQL Complet

## Conventions globales

```sql
-- Toutes les extensions requises (migration 001)
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- Fuzzy search PAX noms
CREATE EXTENSION IF NOT EXISTS vector;     -- Embeddings SAP matching (pgvector)
CREATE EXTENSION IF NOT EXISTS ltree;      -- Hiérarchie assets
CREATE EXTENSION IF NOT EXISTS postgis;    -- Géométrie surfaces deck, coordonnées
CREATE EXTENSION IF NOT EXISTS pg_partman; -- Partitionnement automatique
```

Conventions :
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` sur toutes les tables
- `created_at TIMESTAMPTZ DEFAULT NOW()` sur toutes les tables métier
- `updated_at TIMESTAMPTZ DEFAULT NOW()` mis à jour par trigger sur les tables mutables
- `archived BOOLEAN DEFAULT FALSE` — jamais de DELETE physique
- `entity_id UUID NOT NULL REFERENCES entities(id)` sur toutes les tables métier principales
- Les statuts sont des `VARCHAR(30)` avec contraintes CHECK explicites

---

## 1. Core — Entités et référentiels

```sql
-- ─── Entités (filiales / organisations) ─────────────────────────────────────
CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) UNIQUE NOT NULL,  -- PER_CMR, PER_COG, PER_GAB
  name        VARCHAR(200) NOT NULL,
  country     VARCHAR(100),
  timezone    VARCHAR(50) NOT NULL DEFAULT 'Africa/Douala',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Assets (Asset Registry — lecture seule pour les modules métier) ─────────
CREATE TABLE assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  parent_id           UUID REFERENCES assets(id),
  type                VARCHAR(50) NOT NULL,
  -- subsidiary | field | site | platform | well | base | helipad | jetty | other
  code                VARCHAR(50) UNIQUE NOT NULL,
  name                VARCHAR(200) NOT NULL,
  path                ltree,
  -- ex: perenco_cam.champ_ebome.site_munja.plateforme_esf1
  latitude            DECIMAL(9,6),
  longitude           DECIMAL(9,6),
  geom                geometry(Point, 4326),  -- PostGIS pour calculs géo
  boundary            geometry(Polygon, 4326),  -- périmètre de la zone
  allow_overlap       BOOLEAN NOT NULL DEFAULT TRUE,
  -- false = chevauchement AdS interdit sur ce site
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  metadata            JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assets_entity   ON assets(entity_id);
CREATE INDEX idx_assets_path     ON assets USING gist(path);
CREATE INDEX idx_assets_parent   ON assets(parent_id);
CREATE INDEX idx_assets_type     ON assets(entity_id, type);
CREATE INDEX idx_assets_geom     ON assets USING gist(geom);

-- ─── Tiers (entreprises — Module Tiers core) ────────────────────────────────
CREATE TABLE tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(50),  -- contractor | supplier | client | internal
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tiers_type ON tiers(type);

-- ─── Départements ────────────────────────────────────────────────────────────
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id),
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(200) NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (entity_id, code)
);

-- ─── Centres de coût ────────────────────────────────────────────────────────
CREATE TABLE cost_centers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  code          VARCHAR(50) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  department_id UUID REFERENCES departments(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (entity_id, code)
);
CREATE INDEX idx_cost_centers_entity ON cost_centers(entity_id);

-- ─── Utilisateurs et rôles ───────────────────────────────────────────────────
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE NOT NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  hashed_password     VARCHAR(200),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  default_entity_id   UUID REFERENCES entities(id),
  intranet_id         VARCHAR(100) UNIQUE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_intranet_id ON users(intranet_id);

CREATE TABLE roles (
  code        VARCHAR(50) PRIMARY KEY,
  -- DO | HSE_ADMIN | PAX_ADMIN | SITE_MGR | PROJ_MGR | MAINT_MGR
  -- LOG_COORD | TRANSP_COORD | VAL_N1 | VAL_N2 | REQUESTER
  -- EXT_SUPV | MEDICAL | READER
  name        VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE user_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id),
  name        VARCHAR(200) NOT NULL,
  role_code   VARCHAR(50) NOT NULL REFERENCES roles(code),
  asset_scope UUID REFERENCES assets(id),
  -- null = tous les assets de l'entité
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE user_group_members (
  user_id   UUID NOT NULL REFERENCES users(id),
  group_id  UUID NOT NULL REFERENCES user_groups(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  VARCHAR(200) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked = FALSE;

-- ─── Séquences de référence ──────────────────────────────────────────────────
CREATE TABLE reference_sequences (
  prefix      VARCHAR(20) NOT NULL,
  year        SMALLINT NOT NULL,
  last_value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);
-- Préfixes: ADS | TRIP | MAN-PAX | MAN-CGO | CGO | CYCLE | PROJ | ACT

-- ─── Event store (bus événements inter-modules) ───────────────────────────────
CREATE TABLE event_store (
  id            VARCHAR(36) PRIMARY KEY,
  event_name    VARCHAR(100) NOT NULL,
  payload       JSONB NOT NULL,
  emitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  handler       VARCHAR(100),
  retry_count   SMALLINT NOT NULL DEFAULT 0,
  error         TEXT
);
CREATE INDEX idx_event_store_name    ON event_store(event_name);
CREATE INDEX idx_event_store_pending ON event_store(processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_event_store_emitted ON event_store(emitted_at DESC);
```

---

## 2. Module Projets

```sql
-- ─── Projets ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  code                VARCHAR(50) NOT NULL,
  name                VARCHAR(300) NOT NULL,
  description         TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','on_hold','completed','cancelled')),
  type                VARCHAR(20) NOT NULL
                      CHECK (type IN ('capital','opex','maintenance','inspection','study')),
  owner_id            UUID NOT NULL REFERENCES users(id),
  department_id       UUID REFERENCES departments(id),
  start_date          DATE,
  end_date            DATE,
  actual_start_date   DATE,
  actual_end_date     DATE,
  priority            VARCHAR(20) NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('critical','high','medium','low')),
  archived            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, code)
);
CREATE INDEX idx_projects_entity   ON projects(entity_id);
CREATE INDEX idx_projects_status   ON projects(entity_id, status);
CREATE INDEX idx_projects_owner    ON projects(owner_id);

CREATE TABLE project_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id),
  old_status    VARCHAR(20),
  new_status    VARCHAR(20) NOT NULL,
  reason        TEXT NOT NULL,
  changed_by    UUID NOT NULL REFERENCES users(id),
  changed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WBS ─────────────────────────────────────────────────────────────────────
CREATE TABLE wbs_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES wbs_nodes(id),
  code              VARCHAR(50) NOT NULL,
  name              VARCHAR(300) NOT NULL,
  cost_center_id    UUID REFERENCES cost_centers(id),
  estimated_budget  DECIMAL(15,2),
  currency          VARCHAR(10) NOT NULL DEFAULT 'XAF',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, code)
);
CREATE INDEX idx_wbs_project ON wbs_nodes(project_id);

-- ─── Versions de planning ─────────────────────────────────────────────────────
CREATE TABLE project_schedules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID REFERENCES entities(id),
  project_id            UUID NOT NULL REFERENCES projects(id),
  version_number        INTEGER NOT NULL,
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('simulation','draft','active','archived')),
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  based_on_schedule_id  UUID REFERENCES project_schedules(id),
  created_by            UUID NOT NULL REFERENCES users(id),
  activated_by          UUID REFERENCES users(id),
  activated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, version_number)
);
-- Un seul schedule actif par projet
CREATE UNIQUE INDEX idx_one_active_schedule ON project_schedules(project_id)
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

-- ─── Tâches ──────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           UUID NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  parent_id             UUID REFERENCES tasks(id),
  wbs_code              VARCHAR(50) NOT NULL,
  name                  VARCHAR(300) NOT NULL,
  description           TEXT,
  type                  VARCHAR(20) NOT NULL DEFAULT 'task'
                        CHECK (type IN ('task','summary','milestone')),
  status                VARCHAR(20) NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started','in_progress','completed',
                                          'on_hold','cancelled')),
  sort_order            INTEGER NOT NULL DEFAULT 0,
  duration_days         DECIMAL(8,2),
  start_date            DATE,
  end_date              DATE,
  actual_start_date     DATE,
  actual_end_date       DATE,
  baseline_start_date   DATE,
  baseline_end_date     DATE,
  progress_pct          DECIMAL(5,2) NOT NULL DEFAULT 0
                        CHECK (progress_pct BETWEEN 0 AND 100),
  pax_estimated         INTEGER NOT NULL DEFAULT 0 CHECK (pax_estimated >= 0),
  pax_unit              VARCHAR(20) NOT NULL DEFAULT 'per_day'
                        CHECK (pax_unit IN ('per_day','total')),
  asset_id              UUID REFERENCES assets(id),
  cost_center_id        UUID REFERENCES cost_centers(id),
  -- CPM (calculé par scheduling_engine.py)
  early_start           DATE,
  early_finish          DATE,
  late_start            DATE,
  late_finish           DATE,
  total_float           DECIMAL(8,2),
  is_critical           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Contraintes
  constraint_type       VARCHAR(30)
                        CHECK (constraint_type IN (
                          'as_soon_as_possible','as_late_as_possible',
                          'must_start_on','must_finish_on',
                          'start_no_earlier_than','finish_no_later_than'
                        )),
  constraint_date       DATE,
  color                 VARCHAR(7)  CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  UNIQUE (schedule_id, wbs_code)
);
CREATE INDEX idx_tasks_schedule  ON tasks(schedule_id);
CREATE INDEX idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX idx_tasks_critical  ON tasks(schedule_id) WHERE is_critical = TRUE;
CREATE INDEX idx_tasks_asset     ON tasks(asset_id) WHERE asset_id IS NOT NULL;

-- ─── Liens de dépendance ──────────────────────────────────────────────────────
CREATE TABLE task_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  predecessor_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type       VARCHAR(5) NOT NULL DEFAULT 'FS'
                  CHECK (link_type IN ('FS','SS','FF','SF')),
  lag_days        DECIMAL(8,2) NOT NULL DEFAULT 0,
  lag_unit        VARCHAR(20) NOT NULL DEFAULT 'working_days'
                  CHECK (lag_unit IN ('working_days','calendar_days')),
  CHECK (predecessor_id <> successor_id),
  UNIQUE (predecessor_id, successor_id, link_type)
);
CREATE INDEX idx_links_pred  ON task_links(predecessor_id);
CREATE INDEX idx_links_succ  ON task_links(successor_id);
CREATE INDEX idx_links_sched ON task_links(schedule_id);

-- ─── Ressources tâches ────────────────────────────────────────────────────────
CREATE TABLE task_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  resource_type   VARCHAR(20) NOT NULL
                  CHECK (resource_type IN ('named_pax','role','team')),
  pax_id          UUID REFERENCES pax_profiles(id),
  role_name       VARCHAR(100),
  quantity        DECIMAL(6,2) NOT NULL DEFAULT 1,
  allocation_pct  DECIMAL(5,2) NOT NULL DEFAULT 100
                  CHECK (allocation_pct BETWEEN 1 AND 100),
  notes           TEXT
);

-- ─── Simulations de planning (TTL 4h) ────────────────────────────────────────
CREATE TABLE planning_simulations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id),
  base_schedule_id    UUID NOT NULL REFERENCES project_schedules(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  changes             JSONB NOT NULL DEFAULT '[]',
  calculated_tasks    JSONB,
  critical_path       JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_simulations_user    ON planning_simulations(project_id, user_id);
CREATE INDEX idx_simulations_expires ON planning_simulations(expires_at);
```

---

## 3. Module Planner

```sql
-- ─── Activités ───────────────────────────────────────────────────────────────
CREATE TABLE activities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  type                      VARCHAR(20) NOT NULL
                            CHECK (type IN (
                                              'project','workover','drilling','integrity',
                                              'maintenance','permanent_ops','inspection','event'
                                            )),
  status                    VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN (
                                              'draft',
                                              'pending_initiator_review',
                                              'pending_project_review',
                                              'pending_compliance',
                                              'pending_validation',
                                              'approved','rejected',
                                              'cancelled','requires_review',
                                              'pending_arbitration',
                                              'in_progress','completed'
                                            )),
  workflow_id               UUID,
  title                     VARCHAR(300) NOT NULL,
  description               TEXT,
  asset_id                  UUID NOT NULL REFERENCES assets(id),
  project_id                UUID REFERENCES projects(id),
  requester_id              UUID NOT NULL REFERENCES users(id),
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  pax_quota                 INTEGER NOT NULL DEFAULT 0 CHECK (pax_quota >= 0),
  pax_actual                INTEGER NOT NULL DEFAULT 0 CHECK (pax_actual >= 0),
  priority                  VARCHAR(20) NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('critical','high','medium','low')),
  priority_override_by      UUID REFERENCES users(id),
  priority_override_reason  TEXT,
  -- Champs CMMS (type=maintenance)
  maintenance_type          VARCHAR(20)
                            CHECK (maintenance_type IN ('preventive','corrective',
                                                         'regulatory','inspection')),
  equipment_asset_id        UUID REFERENCES assets(id),
  work_order_ref            VARCHAR(100),
  estimated_duration_h      DECIMAL(6,2),
  actual_duration_h         DECIMAL(6,2),
  completion_notes          TEXT,
  -- Champs event (type=event)
  location_free_text        VARCHAR(300),
  notes                     TEXT,
  archived                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_activities_entity   ON activities(entity_id);
CREATE INDEX idx_activities_asset    ON activities(asset_id);
CREATE INDEX idx_activities_status   ON activities(entity_id, status);
CREATE INDEX idx_activities_project  ON activities(project_id);
CREATE INDEX idx_activities_dates    ON activities(start_date, end_date);
CREATE INDEX idx_activities_active   ON activities(asset_id, start_date, end_date)
  WHERE status IN ('approved','in_progress');

-- ─── Capacités asset (immuable — INSERT uniquement) ──────────────────────────
CREATE TABLE asset_capacities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  max_pax_total         INTEGER NOT NULL CHECK (max_pax_total >= 0),
  max_pax_per_company   INTEGER CHECK (max_pax_per_company > 0),
  permanent_ops_quota   INTEGER NOT NULL DEFAULT 0 CHECK (permanent_ops_quota >= 0),
  effective_date        DATE NOT NULL,
  reason                TEXT NOT NULL,
  set_by                UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  CHECK (permanent_ops_quota <= max_pax_total)
);
CREATE INDEX idx_asset_cap_asset_date ON asset_capacities(asset_id, effective_date DESC);

-- Vue: capacité courante par asset
CREATE VIEW current_asset_capacity AS
SELECT DISTINCT ON (asset_id)
  asset_id, entity_id, max_pax_total, max_pax_per_company,
  permanent_ops_quota, effective_date, set_by, reason
FROM asset_capacities
ORDER BY asset_id, effective_date DESC;

-- Vue matérialisée: charge PAX journalière (rafraîchie toutes les 5min)
CREATE MATERIALIZED VIEW daily_pax_load AS
SELECT
  a.asset_id,
  a.entity_id,
  d::date AS load_date,
  SUM(a.pax_quota) AS total_pax_booked,
  c.max_pax_total - c.permanent_ops_quota AS net_capacity
FROM activities a
CROSS JOIN generate_series(a.start_date, a.end_date, '1 day'::interval) d
JOIN current_asset_capacity c ON c.asset_id = a.asset_id
WHERE a.status = 'approved'
GROUP BY a.asset_id, a.entity_id, d::date, c.max_pax_total, c.permanent_ops_quota;
CREATE UNIQUE INDEX ON daily_pax_load(asset_id, entity_id, load_date);

-- ─── Conflits et arbitrage ────────────────────────────────────────────────────
CREATE TABLE activity_conflicts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  activity_a_id     UUID NOT NULL REFERENCES activities(id),
  activity_b_id     UUID NOT NULL REFERENCES activities(id),
  conflict_type     VARCHAR(30) NOT NULL
                    CHECK (conflict_type IN ('pax_overflow','priority_clash',
                                              'resource_overlap')),
  overflow_amount   INTEGER,
  detected_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution        TEXT,
  resolution_type   VARCHAR(30)
                    CHECK (resolution_type IN ('approved_both','postponed_a','postponed_b',
                                               'cancelled_a','cancelled_b','quota_reduced')),
  CHECK (activity_a_id <> activity_b_id)
);
CREATE INDEX idx_conflicts_entity ON activity_conflicts(entity_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_conflicts_act_a  ON activity_conflicts(activity_a_id);
CREATE INDEX idx_conflicts_act_b  ON activity_conflicts(activity_b_id);
```

---

## 4. Module PaxLog

```sql
-- ─── Groupes PAX (extension module Tiers) ────────────────────────────────────
CREATE TABLE pax_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id),
  name        VARCHAR(200) NOT NULL,
  company_id  UUID REFERENCES tiers(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_pax_groups_entity  ON pax_groups(entity_id);
CREATE INDEX idx_pax_groups_company ON pax_groups(company_id);

CREATE TABLE pax_company_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  tiers_id      UUID NOT NULL REFERENCES tiers(id),
  group_name    VARCHAR(200) NOT NULL,
  supervisor_id UUID REFERENCES users(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pax_company_groups_tiers ON pax_company_groups(tiers_id);

-- ─── Profils PAX ─────────────────────────────────────────────────────────────
CREATE TABLE pax_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               UUID NOT NULL REFERENCES entities(id),
  type                    VARCHAR(20) NOT NULL CHECK (type IN ('internal','external')),
  first_name              VARCHAR(100) NOT NULL,
  last_name               VARCHAR(100) NOT NULL,
  first_name_normalized   VARCHAR(100) NOT NULL,  -- calculé: minusc, sans accents, sans tirets
  last_name_normalized    VARCHAR(100) NOT NULL,
  birth_date              DATE,
  nationality             VARCHAR(100),
  company_id              UUID REFERENCES tiers(id),
  group_id                UUID REFERENCES pax_groups(id),
  user_id                 UUID REFERENCES users(id),
  badge_number            VARCHAR(100),
  photo_url               TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','incomplete','suspended','archived')),
  profile_completeness    SMALLINT NOT NULL DEFAULT 0
                          CHECK (profile_completeness BETWEEN 0 AND 100),
  synced_from_intranet    BOOLEAN NOT NULL DEFAULT FALSE,
  intranet_id             VARCHAR(100),
  last_synced_at          TIMESTAMPTZ,
  archived                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pax_entity    ON pax_profiles(entity_id);
CREATE INDEX idx_pax_company   ON pax_profiles(company_id);
CREATE INDEX idx_pax_user      ON pax_profiles(user_id);
CREATE INDEX idx_pax_intranet  ON pax_profiles(intranet_id) WHERE intranet_id IS NOT NULL;
-- Index GIN pour recherche fuzzy pg_trgm
CREATE INDEX idx_pax_trgm_last  ON pax_profiles USING gin(last_name_normalized gin_trgm_ops);
CREATE INDEX idx_pax_trgm_first ON pax_profiles USING gin(first_name_normalized gin_trgm_ops);

-- ─── Types de certifications (référentiel global, sans entity_id) ─────────────
CREATE TABLE credential_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  VARCHAR(50) UNIQUE NOT NULL,
  -- H2S_AWARENESS | MEDIC_FIT | BOSIET | FOET | HUET | OPITO_STCW | ...
  name                  VARCHAR(200) NOT NULL,
  category              VARCHAR(30) NOT NULL
                        CHECK (category IN ('safety','medical','technical','administrative')),
  has_expiry            BOOLEAN NOT NULL DEFAULT TRUE,
  validity_months       SMALLINT CHECK (validity_months > 0),
  proof_required        BOOLEAN NOT NULL DEFAULT TRUE,
  booking_service_id    UUID REFERENCES departments(id),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Certifications PAX ──────────────────────────────────────────────────────
CREATE TABLE pax_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  obtained_date         DATE NOT NULL,
  expiry_date           DATE CHECK (expiry_date > obtained_date),
  proof_url             TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'pending_validation'
                        CHECK (status IN ('valid','expired','pending_validation','rejected')),
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  rejection_reason      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pax_id, credential_type_id)
);
CREATE INDEX idx_creds_pax    ON pax_credentials(pax_id);
CREATE INDEX idx_creds_status ON pax_credentials(status);
CREATE INDEX idx_creds_expiry ON pax_credentials(expiry_date)
  WHERE expiry_date IS NOT NULL;

-- ─── Matrice compliance HSE ──────────────────────────────────────────────────
CREATE TABLE compliance_matrix (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  mandatory             BOOLEAN NOT NULL DEFAULT TRUE,
  scope                 VARCHAR(30) NOT NULL DEFAULT 'all_visitors'
                        CHECK (scope IN ('all_visitors','contractors_only',
                                          'permanent_staff_only')),
  defined_by            VARCHAR(20) NOT NULL
                        CHECK (defined_by IN ('hse_central','site')),
  set_by                UUID NOT NULL REFERENCES users(id),
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT,
  UNIQUE (entity_id, asset_id, credential_type_id, scope)
);
CREATE INDEX idx_matrix_asset ON compliance_matrix(asset_id);

-- ─── Avis de Séjour (AdS) ────────────────────────────────────────────────────
CREATE TABLE ads (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                         UUID NOT NULL REFERENCES entities(id),
  reference                         VARCHAR(50) UNIQUE NOT NULL,
  type                              VARCHAR(20) NOT NULL DEFAULT 'individual'
                                    CHECK (type IN ('individual','team')),
  status                            VARCHAR(40) NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                      'draft','submitted',
                                      'pending_initiator_review',
                                      'pending_project_review',
                                      'pending_compliance',
                                      'pending_validation','approved','rejected',
                                      'cancelled','requires_review',
                                      'pending_arbitration','in_progress','completed'
                                    )),
  workflow_id                       UUID,
  requester_id                      UUID NOT NULL REFERENCES users(id),
  site_entry_asset_id               UUID NOT NULL REFERENCES assets(id),
  planner_activity_id               UUID REFERENCES activities(id),
  visit_purpose                     TEXT NOT NULL,
  visit_category                    VARCHAR(50) NOT NULL
                                    CHECK (visit_category IN (
                                      'project_work','maintenance','inspection',
                                      'visit','permanent_ops','other'
                                    )),
  visit_category_requires_planner   BOOLEAN NOT NULL DEFAULT FALSE,
  start_date                        DATE NOT NULL,
  end_date                          DATE NOT NULL,
  -- Transport préférences (aller et retour indépendants)
  outbound_transport_mode           VARCHAR(50),
  -- Type de vecteur aller souhaité (ex: 'helicopter', 'boat') — null = pas de préférence
  -- Valeurs issues de DISTINCT(vehicles.type) de l'entité
  outbound_departure_base_id        UUID REFERENCES assets(id),
  -- Point de départ aller (ex: Wouri Base) — null = base habituelle
  outbound_notes                    TEXT,
  -- Notes libres aller
  return_transport_mode             VARCHAR(50),
  -- Type de vecteur retour souhaité — peut différer de l'aller
  return_departure_base_id          UUID REFERENCES assets(id),
  -- Point de départ retour (pré-rempli avec le site de l'AdS)
  return_notes                      TEXT,
  -- Notes libres retour
  cross_company_flag                BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at                      TIMESTAMPTZ,
  approved_at                       TIMESTAMPTZ,
  rejected_at                       TIMESTAMPTZ,
  rejection_reason                  TEXT,
  archived                          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                        TIMESTAMPTZ DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_ads_entity    ON ads(entity_id);
CREATE INDEX idx_ads_status    ON ads(entity_id, status);
CREATE INDEX idx_ads_asset     ON ads(site_entry_asset_id);
CREATE INDEX idx_ads_dates     ON ads(start_date, end_date);
CREATE INDEX idx_ads_activity  ON ads(planner_activity_id);
CREATE INDEX idx_ads_requester ON ads(requester_id);

-- ─── PAX dans une AdS ─────────────────────────────────────────────────────────
CREATE TABLE ads_pax (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id                  UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  pax_id                  UUID NOT NULL REFERENCES pax_profiles(id),
  status                  VARCHAR(30) NOT NULL DEFAULT 'pending_check'
                          CHECK (status IN ('pending_check','compliant','blocked',
                                            'approved','rejected','no_show')),
  compliance_checked_at   TIMESTAMPTZ,
  compliance_summary      JSONB,
  booking_request_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  boarding_event_id       UUID,
  disembark_event_id      UUID,
  disembark_asset_id      UUID REFERENCES assets(id),
  current_onboard         BOOLEAN NOT NULL DEFAULT FALSE,
  priority_score          INTEGER NOT NULL DEFAULT 0,
  priority_source         VARCHAR(50),
  UNIQUE (ads_id, pax_id)
);
CREATE INDEX idx_ads_pax_ads    ON ads_pax(ads_id);
CREATE INDEX idx_ads_pax_pax    ON ads_pax(pax_id);
CREATE INDEX idx_ads_pax_status ON ads_pax(status);

-- ─── Imputations AdS ─────────────────────────────────────────────────────────
CREATE TABLE ads_imputations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id              UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  wbs_id              UUID REFERENCES wbs_nodes(id),
  cost_center_id      UUID NOT NULL REFERENCES cost_centers(id),
  percentage          DECIMAL(5,2) NOT NULL
                      CHECK (percentage > 0 AND percentage <= 100),
  cross_imputation    BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT
  -- Contrainte applicative: SUM(percentage) par ads_id = 100
);
CREATE INDEX idx_imputations_ads     ON ads_imputations(ads_id);
CREATE INDEX idx_imputations_project ON ads_imputations(project_id);

-- ─── Incidents PAX ────────────────────────────────────────────────────────────
CREATE TABLE pax_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  pax_id            UUID REFERENCES pax_profiles(id),
  company_id        UUID REFERENCES tiers(id),
  asset_id          UUID REFERENCES assets(id),
  severity          VARCHAR(20) NOT NULL
                    CHECK (severity IN ('info','warning','temp_ban','permanent_ban')),
  description       TEXT NOT NULL,
  incident_date     DATE NOT NULL,
  ban_start_date    DATE,
  ban_end_date      DATE,
  recorded_by       UUID NOT NULL REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_incidents_pax     ON pax_incidents(pax_id);
CREATE INDEX idx_incidents_company ON pax_incidents(company_id);
CREATE INDEX idx_incidents_active  ON pax_incidents(entity_id) WHERE resolved_at IS NULL;

-- ─── Liens d'accès externes (portail sous-traitant) ─────────────────────────
CREATE TABLE external_access_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id              UUID NOT NULL REFERENCES ads(id),
  token               VARCHAR(100) UNIQUE NOT NULL,
  created_by          UUID NOT NULL REFERENCES users(id),
  preconfigured_data  JSONB,
  otp_required        BOOLEAN NOT NULL DEFAULT TRUE,
  otp_sent_to         VARCHAR(255),
  expires_at          TIMESTAMPTZ NOT NULL,
  max_uses            SMALLINT NOT NULL DEFAULT 1,
  use_count           SMALLINT NOT NULL DEFAULT 0,
  revoked             BOOLEAN NOT NULL DEFAULT FALSE,
  access_log          JSONB NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ext_links_token ON external_access_links(token) WHERE revoked = FALSE;
CREATE INDEX idx_ext_links_ads   ON external_access_links(ads_id);

-- ─── Cycles de rotation PAX ──────────────────────────────────────────────────
CREATE TABLE pax_rotation_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  site_asset_id       UUID NOT NULL REFERENCES assets(id),
  rotation_days_on    SMALLINT NOT NULL CHECK (rotation_days_on > 0),
  rotation_days_off   SMALLINT NOT NULL CHECK (rotation_days_off > 0),
  cycle_start_date    DATE NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','suspended','ended')),
  auto_create_ads     BOOLEAN NOT NULL DEFAULT TRUE,
  ads_lead_days       SMALLINT NOT NULL DEFAULT 7 CHECK (ads_lead_days BETWEEN 1 AND 60),
  default_project_id  UUID REFERENCES projects(id),
  default_cc_id       UUID REFERENCES cost_centers(id),
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  UNIQUE (pax_id, site_asset_id, status)
);
CREATE INDEX idx_rotation_pax    ON pax_rotation_cycles(pax_id);
CREATE INDEX idx_rotation_site   ON pax_rotation_cycles(site_asset_id);
CREATE INDEX idx_rotation_active ON pax_rotation_cycles(entity_id) WHERE status = 'active';

-- ─── Programme de Séjour (Phase 2) ───────────────────────────────────────────
CREATE TABLE stay_programs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  ads_id            UUID NOT NULL REFERENCES ads(id),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','approved','rejected')),
  movements         JSONB NOT NULL DEFAULT '[]',
  submitted_at      TIMESTAMPTZ,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stay_programs_ads ON stay_programs(ads_id);
CREATE INDEX idx_stay_programs_pax ON stay_programs(pax_id);
```

---

## 5. Module TravelWiz

```sql
-- ─── Vecteurs de transport ────────────────────────────────────────────────────
CREATE TABLE vehicles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  name                  VARCHAR(200) NOT NULL,
  registration          VARCHAR(100),
  type                  VARCHAR(50) NOT NULL,
  transport_mode        VARCHAR(20) NOT NULL
                        CHECK (transport_mode IN ('air','sea','road')),
  provider_id           UUID REFERENCES tiers(id),
  capacity_pax          SMALLINT NOT NULL CHECK (capacity_pax >= 0),
  capacity_weight_kg    DECIMAL(10,2),
  capacity_volume_m3    DECIMAL(10,2),
  home_base_asset_id    UUID REFERENCES assets(id),
  ais_mmsi              VARCHAR(20),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vehicles_entity ON vehicles(entity_id);
CREATE INDEX idx_vehicles_mode   ON vehicles(entity_id, transport_mode);

-- ─── Surfaces de chargement (deck) ───────────────────────────────────────────
CREATE TABLE deck_surfaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id              UUID NOT NULL REFERENCES vehicles(id),
  name                    VARCHAR(200) NOT NULL,
  surface_type            VARCHAR(20) NOT NULL
                          CHECK (surface_type IN ('deck','hold','rack','flat')),
  definition_mode         VARCHAR(20) NOT NULL DEFAULT 'rectangle'
                          CHECK (definition_mode IN ('rectangle','polygon',
                                                      'image_overlay','composite')),
  width_m                 DECIMAL(8,3),
  length_m                DECIMAL(8,3),
  height_constraint_m     DECIMAL(6,3),
  polygon_points          JSONB,
  background_image_url    TEXT,
  exclusion_zones         JSONB,
  max_weight_kg           DECIMAL(12,3) NOT NULL,
  max_surface_load_kg_m2  DECIMAL(8,3),
  usable_area_m2          DECIMAL(10,3),
  stacking_allowed        BOOLEAN NOT NULL DEFAULT FALSE,
  max_stack_height_m      DECIMAL(6,3),
  notes                   TEXT,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_deck_surfaces_vehicle ON deck_surfaces(vehicle_id);

-- ─── Rotations périodiques ────────────────────────────────────────────────────
CREATE TABLE rotations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  name                      VARCHAR(200) NOT NULL,
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
  origin_asset_id           UUID NOT NULL REFERENCES assets(id),
  destination_asset_id      UUID NOT NULL REFERENCES assets(id),
  recurrence_rule           TEXT NOT NULL,
  effective_start           DATE NOT NULL,
  effective_end             DATE,
  status                    VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','suspended','cancelled')),
  workflow_id               UUID,
  created_by                UUID NOT NULL REFERENCES users(id),
  validated_by              UUID REFERENCES users(id),
  validated_at              TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rotations_entity  ON rotations(entity_id);
CREATE INDEX idx_rotations_vehicle ON rotations(vehicle_id);
CREATE INDEX idx_rotations_active  ON rotations(entity_id) WHERE status = 'active';

-- ─── Voyages ──────────────────────────────────────────────────────────────────
CREATE TABLE trips (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  reference                 VARCHAR(50) UNIQUE NOT NULL,
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
  origin_asset_id           UUID NOT NULL REFERENCES assets(id),
  destination_asset_id      UUID NOT NULL REFERENCES assets(id),
  departure_datetime        TIMESTAMPTZ,
  arrival_datetime          TIMESTAMPTZ,
  actual_departure          TIMESTAMPTZ,
  actual_arrival            TIMESTAMPTZ,
  status                    VARCHAR(20) NOT NULL DEFAULT 'planned'
                            CHECK (status IN ('planned','confirmed','boarding','departed',
                                              'arrived','completed','cancelled','delayed')),
  rotation_id               UUID REFERENCES rotations(id),
  is_intrafield             BOOLEAN NOT NULL DEFAULT FALSE,
  created_by                UUID NOT NULL REFERENCES users(id),
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trips_entity      ON trips(entity_id);
CREATE INDEX idx_trips_vehicle     ON trips(vehicle_id);
CREATE INDEX idx_trips_status      ON trips(entity_id, status);
CREATE INDEX idx_trips_departure   ON trips(departure_datetime);
CREATE INDEX idx_trips_destination ON trips(destination_asset_id);
CREATE INDEX idx_trips_active      ON trips(entity_id)
  WHERE status NOT IN ('completed','cancelled');

-- ─── Code accès portail capitaine ─────────────────────────────────────────────
CREATE TABLE trip_code_access (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES trips(id),
  access_code   VARCHAR(10) UNIQUE NOT NULL,
  qr_code_url   TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  access_log    JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_trip_codes_active ON trip_code_access(access_code) WHERE revoked = FALSE;

-- ─── Manifestes PAX ───────────────────────────────────────────────────────────
CREATE TABLE pax_manifests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID REFERENCES entities(id),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  trip_id               UUID NOT NULL REFERENCES trips(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_validation','validated',
                                          'requires_review','closed','cancelled')),
  workflow_id           UUID,
  generated_from_ads    BOOLEAN NOT NULL DEFAULT FALSE,
  total_pax_confirmed   SMALLINT NOT NULL DEFAULT 0,
  total_weight_kg       DECIMAL(10,2) NOT NULL DEFAULT 0,
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pax_manifests_trip   ON pax_manifests(trip_id);
CREATE INDEX idx_pax_manifests_status ON pax_manifests(entity_id, status);

-- ─── Entrées manifeste PAX ────────────────────────────────────────────────────
CREATE TABLE pax_manifest_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id       UUID NOT NULL REFERENCES pax_manifests(id),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  ads_pax_id        UUID REFERENCES ads_pax(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','standby','cancelled',
                                      'no_show','boarded','disembarked')),
  weight_kg         DECIMAL(6,2) CHECK (weight_kg > 0),
  boarding_order    SMALLINT,
  priority_score    INTEGER NOT NULL DEFAULT 0,
  priority_source   VARCHAR(50),
  standby_reason    TEXT,
  added_manually    BOOLEAN NOT NULL DEFAULT FALSE,
  added_by          UUID REFERENCES users(id),
  notes             TEXT,
  UNIQUE (manifest_id, pax_id)
);
CREATE INDEX idx_pme_manifest ON pax_manifest_entries(manifest_id);
CREATE INDEX idx_pme_pax      ON pax_manifest_entries(pax_id);
CREATE INDEX idx_pme_ads_pax  ON pax_manifest_entries(ads_pax_id);

-- ─── Catalogue articles SAP ───────────────────────────────────────────────────
CREATE TABLE article_catalog (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_code                VARCHAR(50) UNIQUE,
  internal_code           VARCHAR(50),
  description_fr          VARCHAR(500) NOT NULL,
  description_en          VARCHAR(500),
  description_normalized  TEXT NOT NULL,
  management_type         VARCHAR(30) NOT NULL
                          CHECK (management_type IN ('unit','bulk_quantity',
                            'consumable_volume','consumable_discrete',
                            'package','waste')),
  unit_of_measure         VARCHAR(20),
  packaging_type          VARCHAR(50),
  is_hazmat               BOOLEAN NOT NULL DEFAULT FALSE,
  hazmat_class            VARCHAR(50),
  unit_weight_kg          DECIMAL(10,3),
  embedding               vector(384),
  source                  VARCHAR(20) NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('sap_import','manual','ai_created')),
  last_imported_at        TIMESTAMPTZ,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_article_sap   ON article_catalog(sap_code);
CREATE INDEX idx_article_trgm  ON article_catalog
  USING gin(description_normalized gin_trgm_ops);
CREATE INDEX idx_article_embed ON article_catalog
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── Colis cargo ──────────────────────────────────────────────────────────────
CREATE TABLE cargo_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                   UUID NOT NULL REFERENCES entities(id),
  tracking_number             VARCHAR(50) UNIQUE NOT NULL,
  external_reference          VARCHAR(200),
  slip_number                 VARCHAR(100),
  management_type             VARCHAR(30) NOT NULL
                              CHECK (management_type IN ('unit','bulk_quantity',
                                'consumable_volume','consumable_discrete','package','waste')),
  article_id                  UUID REFERENCES article_catalog(id),
  sap_code                    VARCHAR(50),
  sap_code_status             VARCHAR(20) NOT NULL DEFAULT 'unknown'
                              CHECK (sap_code_status IN ('confirmed','ai_suggested',
                                                          'manual','unknown')),
  sap_suggestion_code         VARCHAR(50),
  sap_suggestion_confidence   DECIMAL(4,3),
  description                 TEXT NOT NULL,
  packaging_type              VARCHAR(100),
  quantity                    DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_of_measure             VARCHAR(20) NOT NULL,
  unit_weight_kg              DECIMAL(10,3),
  total_weight_kg             DECIMAL(12,3),
  dimensions_l_m              DECIMAL(8,3),
  dimensions_w_m              DECIMAL(8,3),
  dimensions_h_m              DECIMAL(8,3),
  is_hazmat                   BOOLEAN NOT NULL DEFAULT FALSE,
  hazmat_class                VARCHAR(50),
  is_hazmat_explosive         BOOLEAN NOT NULL DEFAULT FALSE,
  sender_id                   UUID REFERENCES users(id),
  sender_name                 VARCHAR(200) NOT NULL,
  recipient_id                UUID REFERENCES users(id),
  recipient_name              VARCHAR(200),
  owner_department            VARCHAR(100),
  cost_imputation_id          UUID REFERENCES cost_centers(id),
  project_id                  UUID REFERENCES projects(id),
  cost_imputation_required    BOOLEAN NOT NULL DEFAULT FALSE,
  origin_asset_id             UUID NOT NULL REFERENCES assets(id),
  destination_asset_id        UUID NOT NULL REFERENCES assets(id),
  current_location_asset_id   UUID REFERENCES assets(id),
  status                      VARCHAR(30) NOT NULL DEFAULT 'registered'
                              CHECK (status IN ('registered','ready_for_loading','loaded',
                                'in_transit','delivered','return_declared',
                                'return_in_transit','returned','reintegrated','scrapped','lost')),
  return_type                 VARCHAR(30)
                              CHECK (return_type IN ('waste','contractor_return',
                                'stock_reintegration','scrap','yard_storage')),
  photos                      JSONB NOT NULL DEFAULT '[]',
  photo_required_stages       JSONB NOT NULL DEFAULT '["anomaly"]',
  is_urgent                   BOOLEAN NOT NULL DEFAULT FALSE,
  urgent_reason               TEXT,
  archived                    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cargo_tracking  ON cargo_items(tracking_number);
CREATE INDEX idx_cargo_entity    ON cargo_items(entity_id);
CREATE INDEX idx_cargo_status    ON cargo_items(entity_id, status);
CREATE INDEX idx_cargo_origin    ON cargo_items(origin_asset_id);
CREATE INDEX idx_cargo_dest      ON cargo_items(destination_asset_id);
CREATE INDEX idx_cargo_location  ON cargo_items(current_location_asset_id);

-- ─── Éléments d'un package ────────────────────────────────────────────────────
CREATE TABLE package_elements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id          UUID NOT NULL REFERENCES cargo_items(id) ON DELETE CASCADE,
  article_id          UUID REFERENCES article_catalog(id),
  sap_code            VARCHAR(50),
  sap_code_status     VARCHAR(20) NOT NULL DEFAULT 'unknown',
  description         TEXT NOT NULL,
  management_type     VARCHAR(30) NOT NULL,
  quantity_sent       DECIMAL(12,3) NOT NULL CHECK (quantity_sent > 0),
  quantity_returned   DECIMAL(12,3),
  unit_of_measure     VARCHAR(20) NOT NULL,
  unit_weight_kg      DECIMAL(10,3),
  return_status       VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (return_status IN ('pending','fully_returned',
                                               'partially_returned','consumed','lost')),
  return_notes        TEXT
);
CREATE INDEX idx_package_elements_parent ON package_elements(package_id);

-- ─── Manifestes cargo ─────────────────────────────────────────────────────────
CREATE TABLE cargo_manifests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID REFERENCES entities(id),
  reference         VARCHAR(50) UNIQUE NOT NULL,
  trip_id           UUID NOT NULL REFERENCES trips(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_validation','validated',
                                      'requires_review','closed','cancelled')),
  workflow_id       UUID,
  validated_by      UUID REFERENCES users(id),
  validated_at      TIMESTAMPTZ,
  total_weight_kg   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_volume_m3   DECIMAL(10,2),
  has_hazmat        BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cargo_manifests_trip   ON cargo_manifests(trip_id);
CREATE INDEX idx_cargo_manifests_status ON cargo_manifests(entity_id, status);

-- ─── Entrées manifeste cargo ──────────────────────────────────────────────────
CREATE TABLE cargo_manifest_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_manifest_id     UUID NOT NULL REFERENCES cargo_manifests(id),
  cargo_item_id         UUID NOT NULL REFERENCES cargo_items(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'listed'
                        CHECK (status IN ('listed','loaded','unloaded','cancelled')),
  loaded_at             TIMESTAMPTZ,
  unloaded_at           TIMESTAMPTZ,
  notes                 TEXT,
  UNIQUE (cargo_manifest_id, cargo_item_id)
);
CREATE INDEX idx_cme_manifest ON cargo_manifest_entries(cargo_manifest_id);
CREATE INDEX idx_cme_item     ON cargo_manifest_entries(cargo_item_id);

-- ─── Mouvements cargo (immuable — append-only) ────────────────────────────────
CREATE TABLE cargo_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_item_id       UUID NOT NULL REFERENCES cargo_items(id),
  movement_type       VARCHAR(30) NOT NULL,
  from_asset_id       UUID REFERENCES assets(id),
  to_asset_id         UUID REFERENCES assets(id),
  trip_id             UUID REFERENCES trips(id),
  performed_by        UUID REFERENCES users(id),
  performed_by_name   VARCHAR(200) NOT NULL,
  validation_type     VARCHAR(20) NOT NULL DEFAULT 'click'
                      CHECK (validation_type IN ('click','tablet_signature',
                                                  'otp','photo')),
  photo_url           TEXT,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_cargo_mvt_item   ON cargo_movements(cargo_item_id, recorded_at DESC);
CREATE INDEX idx_cargo_mvt_trip   ON cargo_movements(trip_id);

-- ─── Organisation deck ────────────────────────────────────────────────────────
CREATE TABLE deck_layouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES trips(id),
  deck_surface_id   UUID NOT NULL REFERENCES deck_surfaces(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','proposed_by_algo','validated','locked')),
  algo_run_at       TIMESTAMPTZ,
  validated_by      UUID REFERENCES users(id),
  validated_at      TIMESTAMPTZ,
  layout_rules      JSONB NOT NULL DEFAULT '{}',
  UNIQUE (trip_id, deck_surface_id)
);

CREATE TABLE deck_layout_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_layout_id    UUID NOT NULL REFERENCES deck_layouts(id) ON DELETE CASCADE,
  cargo_item_id     UUID NOT NULL REFERENCES cargo_items(id),
  x_m               DECIMAL(8,3) NOT NULL,
  y_m               DECIMAL(8,3) NOT NULL,
  rotation_deg      SMALLINT NOT NULL DEFAULT 0
                    CHECK (rotation_deg IN (0,90,180,270)),
  stack_level       SMALLINT NOT NULL DEFAULT 0,
  placed_by         VARCHAR(20) NOT NULL DEFAULT 'manual'
                    CHECK (placed_by IN ('algorithm','manual')),
  notes             TEXT,
  UNIQUE (deck_layout_id, cargo_item_id)
);
CREATE INDEX idx_deck_layout_items ON deck_layout_items(deck_layout_id);

-- ─── Types d'événements voyage ────────────────────────────────────────────────
CREATE TABLE voyage_event_types (
  code              VARCHAR(50) PRIMARY KEY,
  label_fr          VARCHAR(200) NOT NULL,
  category          VARCHAR(30) NOT NULL
                    CHECK (category IN ('navigation','pax_ops','cargo_ops',
                                         'standby','weather','incident',
                                         'maintenance','admin')),
  allowed_sources   JSONB NOT NULL DEFAULT '["logistician"]',
  prerequisites     JSONB NOT NULL DEFAULT '[]',
  expected_payload  JSONB,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── Événements voyage (journal de bord) — partitionné ───────────────────────
CREATE TABLE voyage_events (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES trips(id),
  event_code        VARCHAR(50) NOT NULL REFERENCES voyage_event_types(code),
  event_label       VARCHAR(200) NOT NULL,
  category          VARCHAR(30) NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude          DECIMAL(9,6),
  longitude         DECIMAL(9,6),
  asset_id          UUID REFERENCES assets(id),
  location_label    VARCHAR(200),
  performed_by      UUID REFERENCES users(id),
  performed_by_name VARCHAR(200) NOT NULL,
  source            VARCHAR(20) NOT NULL
                    CHECK (source IN ('captain_portal','logistician',
                                       'iot_auto','mcp')),
  trip_code_used    VARCHAR(10),
  payload           JSONB,
  offline_sync      BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_vevt_trip     ON voyage_events(trip_id, recorded_at);
CREATE INDEX idx_vevt_category ON voyage_events(category, recorded_at DESC);

-- ─── KPIs voyage ──────────────────────────────────────────────────────────────
CREATE TABLE trip_kpis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                     UUID UNIQUE NOT NULL REFERENCES trips(id),
  total_duration_min          INTEGER,
  navigation_time_min         INTEGER,
  standby_time_min            INTEGER,
  boarding_time_min           INTEGER,
  disembarkation_time_min     INTEGER,
  loading_time_min            INTEGER,
  unloading_time_min          INTEGER,
  maintenance_time_min        INTEGER,
  refuelling_time_min         INTEGER,
  distance_nm                 DECIMAL(10,2),
  distance_km                 DECIMAL(10,2),
  distance_source             VARCHAR(20)
                              CHECK (distance_source IN ('gps_track','calculated','manual')),
  fuel_start_litres           DECIMAL(10,2),
  fuel_end_litres             DECIMAL(10,2),
  fuel_consumed_litres        DECIMAL(10,2),
  fuel_consumption_per_nm     DECIMAL(8,4),
  pax_boarded_count           INTEGER NOT NULL DEFAULT 0,
  pax_disembarked_count       INTEGER NOT NULL DEFAULT 0,
  pax_no_show_count           INTEGER NOT NULL DEFAULT 0,
  max_pax_onboard             INTEGER NOT NULL DEFAULT 0,
  cargo_loaded_kg             DECIMAL(12,2),
  cargo_unloaded_kg           DECIMAL(12,2),
  avg_wind_knots              DECIMAL(6,2),
  avg_wave_height_m           DECIMAL(6,2),
  dominant_condition          VARCHAR(50),
  productive_time_pct         DECIMAL(5,2),
  stops_count                 INTEGER,
  gps_coverage_pct            DECIMAL(5,2),
  events_completeness_pct     DECIMAL(5,2),
  calculated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trip_kpis_trip ON trip_kpis(trip_id);

-- ─── Météo — partitionné par mois ────────────────────────────────────────────
CREATE TABLE weather_records (
  id                    UUID NOT NULL DEFAULT gen_random_uuid(),
  asset_id              UUID REFERENCES assets(id),
  trip_id               UUID REFERENCES trips(id),
  voyage_event_id       UUID,
  source                VARCHAR(20) NOT NULL
                        CHECK (source IN ('api_auto','captain_manual',
                                          'logistician_manual','iot_sensor')),
  recorded_at           TIMESTAMPTZ NOT NULL,
  latitude              DECIMAL(9,6),
  longitude             DECIMAL(9,6),
  condition             VARCHAR(50),
  visibility_km         DECIMAL(6,2),
  wind_direction_deg    SMALLINT,
  wind_speed_knots      DECIMAL(6,2),
  wind_beaufort         SMALLINT,
  wave_height_m         DECIMAL(5,2),
  wave_period_s         DECIMAL(5,2),
  swell_direction_deg   SMALLINT,
  air_temp_c            DECIMAL(5,2),
  sea_temp_c            DECIMAL(5,2),
  pressure_hpa          DECIMAL(7,2),
  humidity_pct          SMALLINT,
  raw_api_response      JSONB,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_weather_asset ON weather_records(asset_id, recorded_at DESC);
CREATE INDEX idx_weather_trip  ON weather_records(trip_id);

-- ─── Devices IoT ──────────────────────────────────────────────────────────────
CREATE TABLE iot_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  device_id       VARCHAR(100) UNIQUE NOT NULL,
  device_type     VARCHAR(50),
  api_key_hash    VARCHAR(200) NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_iot_devices_vehicle ON iot_devices(vehicle_id);

-- ─── Positions GPS (append-only, partitionné par semaine) ────────────────────
CREATE TABLE vehicle_positions (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  device_id       VARCHAR(100),
  recorded_at     TIMESTAMPTZ NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude        DECIMAL(9,6) NOT NULL,
  longitude       DECIMAL(9,6) NOT NULL,
  speed_knots     DECIMAL(6,2),
  heading_deg     DECIMAL(5,2),
  altitude_m      DECIMAL(8,2),
  status          VARCHAR(30),
  fuel_level_pct  SMALLINT CHECK (fuel_level_pct BETWEEN 0 AND 100),
  trip_id         UUID REFERENCES trips(id),
  custom_data     JSONB,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_vpos_vehicle ON vehicle_positions(vehicle_id, recorded_at DESC);
CREATE INDEX idx_vpos_trip    ON vehicle_positions(trip_id, recorded_at DESC);

-- ─── Config export SAP ────────────────────────────────────────────────────────
CREATE TABLE sap_export_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  export_type     VARCHAR(50) NOT NULL
                  CHECK (export_type IN ('article_catalog','stock_movements',
                                          'cost_imputations','cargo_returns')),
  name            VARCHAR(200) NOT NULL,
  column_mapping  JSONB NOT NULL,
  filters         JSONB,
  delimiter       VARCHAR(5) NOT NULL DEFAULT ';',
  encoding        VARCHAR(20) NOT NULL DEFAULT 'UTF-8',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Config synchronisation intranet ─────────────────────────────────────────
CREATE TABLE intranet_sync_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  mode                      VARCHAR(20) NOT NULL CHECK (mode IN ('api','ldap','csv')),
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  api_base_url              TEXT,
  api_key_encrypted         TEXT,
  api_field_mapping         JSONB,
  ldap_host                 VARCHAR(200),
  ldap_port                 INTEGER DEFAULT 389,
  ldap_base_dn              TEXT,
  ldap_bind_dn              TEXT,
  ldap_password_encrypted   TEXT,
  ldap_filter               VARCHAR(200) DEFAULT '(objectClass=person)',
  ldap_field_mapping        JSONB,
  sync_cron                 VARCHAR(50) NOT NULL DEFAULT '0 */4 * * *',
  last_sync_at              TIMESTAMPTZ,
  last_sync_status          VARCHAR(20),
  last_sync_count           INTEGER DEFAULT 0,
  last_sync_errors          JSONB NOT NULL DEFAULT '[]',
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Module IA

```sql
-- ─── Anomalies détectées ──────────────────────────────────────────────────────
CREATE TABLE ai_anomalies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID REFERENCES entities(id),
  type              VARCHAR(50) NOT NULL,
  severity          VARCHAR(20) NOT NULL
                    CHECK (severity IN ('critical','warning','info')),
  entity_type       VARCHAR(50),
  entity_obj_id     UUID,
  description       TEXT NOT NULL,
  suggested_action  TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','resolved','false_positive')),
  acknowledged_by   UUID REFERENCES users(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  detected_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_anomalies_status   ON ai_anomalies(entity_id, status);
CREATE INDEX idx_anomalies_severity ON ai_anomalies(severity, status);

-- ─── Suggestions IA ───────────────────────────────────────────────────────────
CREATE TABLE ai_suggestions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type     VARCHAR(30) NOT NULL
                      CHECK (suggestion_type IN ('sap_match','pax_dedup')),
  entity_id           UUID,
  entity_type         VARCHAR(50),
  suggested_value     VARCHAR(200) NOT NULL,
  confidence_score    DECIMAL(4,3) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','rejected')),
  reviewed_by         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Sessions MCP ─────────────────────────────────────────────────────────────
CREATE TABLE mcp_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  entity_id       UUID REFERENCES entities(id),
  client_type     VARCHAR(50),
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  mutation_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mcp_sessions_user ON mcp_sessions(user_id);

-- ─── Appels outils MCP ────────────────────────────────────────────────────────
CREATE TABLE mcp_tool_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES mcp_sessions(id),
  tool_name       VARCHAR(100) NOT NULL,
  input_params    JSONB NOT NULL,
  output_summary  TEXT,
  success         BOOLEAN NOT NULL,
  error_message   TEXT,
  duration_ms     INTEGER,
  called_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mcp_calls_session ON mcp_tool_calls(session_id);
CREATE INDEX idx_mcp_calls_tool    ON mcp_tool_calls(tool_name, called_at DESC);
```

---

## 7. Audit log

```sql
CREATE TABLE audit_log (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  entity_type       VARCHAR(100) NOT NULL,
  entity_id         UUID,
  action            VARCHAR(50) NOT NULL,
  changed_fields    JSONB,
  old_values        JSONB,
  new_values        JSONB,
  performed_by      UUID REFERENCES users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source            VARCHAR(20) NOT NULL DEFAULT 'api'
                    CHECK (source IN ('api','mcp','system','batch')),
  mcp_tool          VARCHAR(100),
  source_event      VARCHAR(100),
  source_module     VARCHAR(50),
  source_entity_id  UUID,
  ip_address        INET,
  user_agent        TEXT,
  PRIMARY KEY (id, performed_at)
) PARTITION BY RANGE (performed_at);
-- Partitionnement par trimestre via pg_partman
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user   ON audit_log(performed_by);
CREATE INDEX idx_audit_at     ON audit_log(performed_at DESC);
```

---

## 8. Partitionnement automatique (pg_partman)

```sql
-- audit_log — trimestriel
SELECT partman.create_parent(
  p_parent_table => 'public.audit_log',
  p_control => 'performed_at',
  p_type => 'native',
  p_interval => '3 months',
  p_premake => 3
);

-- vehicle_positions — hebdomadaire
SELECT partman.create_parent(
  p_parent_table => 'public.vehicle_positions',
  p_control => 'recorded_at',
  p_type => 'native',
  p_interval => '1 week',
  p_premake => 4
);

-- cargo_movements — trimestriel
SELECT partman.create_parent(
  p_parent_table => 'public.cargo_movements',
  p_control => 'recorded_at',
  p_type => 'native',
  p_interval => '3 months',
  p_premake => 2
);

-- voyage_events — hebdomadaire
SELECT partman.create_parent(
  p_parent_table => 'public.voyage_events',
  p_control => 'recorded_at',
  p_type => 'native',
  p_interval => '1 week',
  p_premake => 4
);

-- weather_records — mensuel
SELECT partman.create_parent(
  p_parent_table => 'public.weather_records',
  p_control => 'recorded_at',
  p_type => 'native',
  p_interval => '1 month',
  p_premake => 2
);
```

---

## 9. Trigger updated_at automatique

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer sur toutes les tables mutables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entities','assets','tiers','departments','cost_centers',
    'users','projects','project_schedules','tasks',
    'activities','pax_profiles','pax_credentials','compliance_matrix',
    'ads','stay_programs','pax_rotation_cycles',
    'vehicles','deck_surfaces','rotations','trips',
    'pax_manifests','cargo_manifests','cargo_items',
    'article_catalog','intranet_sync_config'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
```

---

## 10. Table pax_medical_records (Informations santé situationnelles)

Table distincte des `pax_credentials`. Stocke les observations médicales situationnelles
enregistrées par le MEDIC sur site. Accès strictement limité à MEDIC, CMEDIC, DO.

```sql
CREATE TABLE pax_medical_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  site_id           UUID REFERENCES assets(id),       -- site où se trouve le PAX
  recorded_by       UUID NOT NULL REFERENCES users(id), -- rôle MEDIC obligatoire
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity          VARCHAR(20) NOT NULL
                    CHECK (severity IN ('blocking', 'informative')),
  -- blocking = empêche l'embarquement
  -- informative = visible MEDIC/CMEDIC/DO uniquement, pas de blocage
  description       TEXT NOT NULL,
  -- CONFIDENTIEL — jamais affiché hors MEDIC/CMEDIC/DO
  expires_at        TIMESTAMPTZ,  -- null = actif jusqu'à levée manuelle
  lifted_by         UUID REFERENCES users(id),  -- CMEDIC ou DO
  lifted_at         TIMESTAMPTZ,
  lift_notes        TEXT,
  archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la recherche rapide des records actifs d'un PAX
CREATE INDEX idx_med_records_pax ON pax_medical_records(pax_id)
  WHERE lifted_at IS NULL AND archived = FALSE;

-- Index pour les records en cours sur un site
CREATE INDEX idx_med_records_site ON pax_medical_records(site_id)
  WHERE lifted_at IS NULL AND archived = FALSE;

-- Seuls MEDIC, CMEDIC, DO peuvent accéder à cette table
-- La vérification est faite au niveau du service (check_medical_access())
-- Les autres rôles voient uniquement l'existence d'un blocage via :
--   GET /api/v1/pax/profiles/:id/medical-status
--   → retourne { has_active_restriction: bool } SANS description
```

---

## 11. Tables Signalement (PaxLog)

```sql
-- Signalement principal
CREATE TABLE signalements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  target_type           VARCHAR(20) NOT NULL
                        CHECK (target_type IN ('pax','team','company')),
  target_company_id     UUID REFERENCES tiers(id),
  scope_asset_id        UUID REFERENCES assets(id),
  event_date            DATE NOT NULL,
  event_description     TEXT NOT NULL,
  reason                TEXT NOT NULL,
  evidence_urls         JSONB NOT NULL DEFAULT '[]',
  decision              VARCHAR(30) NOT NULL
                        CHECK (decision IN (
                          'avertissement','exclusion_site',
                          'blacklist_temporaire','blacklist_permanent'
                        )),
  decision_duration_days INTEGER CHECK (decision_duration_days > 0),
  decision_end_date     DATE,
  decision_notes        TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft','submitted','under_review',
                          'validated','rejected','lifted','expired'
                        )),
  created_by            UUID NOT NULL REFERENCES users(id),
  submitted_at          TIMESTAMPTZ,
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  rejection_reason      TEXT,
  lifted_by             UUID REFERENCES users(id),
  lifted_at             TIMESTAMPTZ,
  lift_reason           TEXT NOT NULL DEFAULT '',
  archived              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sig_entity     ON signalements(entity_id);
CREATE INDEX idx_sig_company    ON signalements(target_company_id)
  WHERE target_company_id IS NOT NULL;
CREATE INDEX idx_sig_status     ON signalements(entity_id, status);
CREATE INDEX idx_sig_asset      ON signalements(scope_asset_id)
  WHERE scope_asset_id IS NOT NULL;
-- Index pour les signalements actifs (lookup rapide pendant validation AdS)
CREATE INDEX idx_sig_active     ON signalements(entity_id)
  WHERE status = 'validated'
  AND (decision_end_date IS NULL OR decision_end_date >= CURRENT_DATE);

-- Pivot PAX ↔ Signalement
CREATE TABLE signalement_pax (
  signalement_id    UUID NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  PRIMARY KEY (signalement_id, pax_id)
);
CREATE INDEX idx_sig_pax_pax ON signalement_pax(pax_id);

-- Historique des changements de décision
CREATE TABLE signalement_decision_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signalement_id    UUID NOT NULL REFERENCES signalements(id),
  old_decision      VARCHAR(30),
  new_decision      VARCHAR(30) NOT NULL,
  changed_by        UUID NOT NULL REFERENCES users(id),
  changed_at        TIMESTAMPTZ DEFAULT NOW(),
  reason            TEXT NOT NULL
);
CREATE INDEX idx_sig_hist ON signalement_decision_history(signalement_id);
```

### Vue matérialisée : signalements actifs par PAX

Utilisée lors de la validation des AdS pour un lookup ultra-rapide.

```sql
CREATE MATERIALIZED VIEW active_signalements_by_pax AS
SELECT
  sp.pax_id,
  s.id             AS signalement_id,
  s.reference,
  s.decision,
  s.decision_end_date,
  s.scope_asset_id,
  s.entity_id
FROM signalement_pax sp
JOIN signalements s ON s.id = sp.signalement_id
WHERE s.status = 'validated'
  AND (s.decision_end_date IS NULL OR s.decision_end_date >= CURRENT_DATE)
UNION ALL
-- Signalements d'entreprise (s'appliquent à tous les PAX de la compagnie)
SELECT
  pp.id            AS pax_id,
  s.id             AS signalement_id,
  s.reference,
  s.decision,
  s.decision_end_date,
  s.scope_asset_id,
  s.entity_id
FROM pax_profiles pp
JOIN signalements s ON s.target_company_id = pp.company_id
WHERE s.status = 'validated'
  AND s.target_type = 'company'
  AND (s.decision_end_date IS NULL OR s.decision_end_date >= CURRENT_DATE);

CREATE UNIQUE INDEX ON active_signalements_by_pax(pax_id, signalement_id);
CREATE INDEX ON active_signalements_by_pax(pax_id);
-- Rafraîchissement : lors de tout changement de statut signalement
-- + batch toutes les heures pour les expirations
```

---

## 12. Politique de suppression — champ `hidden`

### Principe

OpsFlux ne supprime physiquement aucune donnée ayant atteint un niveau d'avancement. Le champ `hidden` remplace la suppression pour les données sensibles ou demandées à la masquage.

```
Niveau d'avancement     | DELETE physique | archived=true | hidden=true | Immuable
------------------------|-----------------|---------------|-------------|----------
draft jamais soumis     | ✓ autorisé     | ✓            | —           | —
soumis / en validation  | ✗ interdit     | ✓            | ✓ (ADMIN)  | —
validé / approuvé       | ✗ interdit     | ✗            | ✓ (ADMIN)  | —
clôturé / completed     | ✗ interdit     | ✗            | ✗           | ✓ total
```

### Ajout du champ `hidden` sur les tables concernées

```sql
-- Tables recevant le champ hidden
ALTER TABLE pax_profiles          ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_credentials       ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ads                   ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ads_pax               ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_medical_records   ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signalements          ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_manifest_entries  ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cargo_items           ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE external_access_links ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- Index pour les requêtes standard (filtrage automatique hidden=false)
CREATE INDEX idx_pax_visible   ON pax_profiles(entity_id) WHERE hidden = FALSE;
CREATE INDEX idx_ads_visible   ON ads(entity_id)          WHERE hidden = FALSE;
```

### Comportement API

```python
# Dans chaque service, le filtre est appliqué automatiquement par défaut
# via un mixin sur toutes les queries SQLAlchemy

class VisibilityMixin:
    """Injecté automatiquement dans tous les selects sauf SYS_ADMIN."""
    @classmethod
    def apply_visibility(cls, query, actor: User):
        if actor.role != 'SYS_ADMIN':
            query = query.filter(cls.hidden == False)
        return query

# Exemple : dans PaxService.get_pax_list()
query = select(PaxProfile)
query = PaxProfile.apply_visibility(query, actor)
# → Un SYS_ADMIN peut ajouter ?include_hidden=true dans l'URL
```

### Affichage des données masquées dans les anciens documents

Quand un profil PAX est passé à `hidden = true`, ses références dans les manifestes et AdS clôturés restent mais s'affichent ainsi :

```
MAN-PAX-2026-03412 — Voyage Wouri → Munja — 14/09/2026
───────────────────────────────────────────────────────
1. Jean DUPONT          SCHLUMBERGER    boarded
2. [Profil masqué]      [Entreprise masquée]   boarded
3. Paul MBALLA          GEOCOMP         no_show
```

La ligne masquée est toujours comptée dans les totaux et les KPIs. Elle n'est juste pas nominative pour les utilisateurs standards.

---

## 13. Tables analytics — Tracking no-shows, rejets, compliance

```sql
-- Vue matérialisée : tableau de bord no-shows par PAX
CREATE MATERIALIZED VIEW mv_noshows_by_pax AS
SELECT
  pme.pax_id,
  COUNT(*)                        AS total_no_shows,
  COUNT(*) FILTER (
    WHERE m.departure_datetime >= NOW() - INTERVAL '12 months'
  )                               AS no_shows_12m,
  MAX(m.departure_datetime)       AS last_no_show_date,
  pp.last_name || ' ' || pp.first_name AS pax_name,
  pp.company_id
FROM pax_manifest_entries pme
JOIN pax_manifests pm ON pm.id = pme.manifest_id
JOIN trips t          ON t.id  = pm.trip_id
JOIN pax_profiles pp  ON pp.id = pme.pax_id
WHERE pme.status = 'no_show'
  AND pme.hidden = FALSE
  AND pp.hidden  = FALSE
GROUP BY pme.pax_id, pp.last_name, pp.first_name, pp.company_id;

CREATE UNIQUE INDEX ON mv_noshows_by_pax(pax_id);
-- Rafraîchi à chaque clôture de manifeste

-- Vue matérialisée : tableau de bord rejets par entreprise
CREATE MATERIALIZED VIEW mv_rejections_by_company AS
SELECT
  pp.company_id,
  t.name                          AS company_name,
  COUNT(*)                        AS total_rejections,
  COUNT(*) FILTER (
    WHERE a.rejected_at >= NOW() - INTERVAL '12 months'
  )                               AS rejections_12m,
  COUNT(*) FILTER (
    WHERE ap.status = 'blocked'
    AND   ap.compliance_summary::text LIKE '%missing%'
  )                               AS blocked_compliance,
  COUNT(*) FILTER (
    WHERE a.status = 'rejected'
    AND   a.rejection_reason IS NOT NULL
  )                               AS manual_rejections
FROM ads_pax ap
JOIN pax_profiles pp  ON pp.id  = ap.pax_id
JOIN ads a            ON a.id   = ap.ads_id
JOIN tiers t          ON t.id   = pp.company_id
WHERE ap.status IN ('rejected', 'blocked')
  AND ap.hidden  = FALSE
  AND pp.hidden  = FALSE
GROUP BY pp.company_id, t.name;

CREATE UNIQUE INDEX ON mv_rejections_by_company(company_id);

-- Table de log des événements AdS (append-only, audit complet)
CREATE TABLE ads_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id          UUID NOT NULL REFERENCES ads(id),
  ads_pax_id      UUID REFERENCES ads_pax(id),  -- null si événement sur l'AdS entière
  entity_id       UUID NOT NULL REFERENCES entities(id),
  event_type      VARCHAR(50) NOT NULL,
  -- Types : created | submitted | compliance_checked | blocked | unblocked |
  --         validated_n1 | validated_n2 | rejected | cancelled | approved |
  --         arbitration_requested | arbitration_resolved | requires_review |
  --         no_show | boarded | completed | hidden
  actor_id        UUID REFERENCES users(id),  -- null si événement système
  actor_role      VARCHAR(30),
  event_data      JSONB,
  -- Payload selon le type : {reason, old_status, new_status, credential_type, ...}
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index analytiques
CREATE INDEX idx_ads_events_ads      ON ads_events(ads_id);
CREATE INDEX idx_ads_events_pax      ON ads_events(ads_pax_id) WHERE ads_pax_id IS NOT NULL;
CREATE INDEX idx_ads_events_type     ON ads_events(entity_id, event_type);
CREATE INDEX idx_ads_events_time     ON ads_events(entity_id, recorded_at DESC);
-- Partitionné trimestriellement (volume élevé)
-- pg_partman : PART BY RANGE (recorded_at), intervalle = 3 mois
```

---

## 14. External access links — mise à jour complète

```sql
-- Remplacement de la table externe (version étendue)
DROP TABLE IF EXISTS external_access_links;

CREATE TABLE external_access_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  token               VARCHAR(100) UNIQUE NOT NULL,
  link_type           VARCHAR(20) NOT NULL DEFAULT 'ads'
                      CHECK (link_type IN ('ads', 'team_management')),

  -- Pour link_type = 'ads' : ads_id renseigné
  ads_id              UUID REFERENCES ads(id),

  -- Pour link_type = 'team_management' : company_id renseigné
  target_company_id   UUID REFERENCES tiers(id),
  scope_asset_id      UUID REFERENCES assets(id),
  -- null = compliance globale visible, renseigné = compliance pour cet asset

  -- Permissions granulaires (pour team_management)
  can_add_pax              BOOLEAN NOT NULL DEFAULT FALSE,
  can_update_profiles      BOOLEAN NOT NULL DEFAULT TRUE,
  can_update_certifications BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_compliance      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Paramètres communs
  created_by          UUID NOT NULL REFERENCES users(id),
  preconfigured_data  JSONB,
  instructions        TEXT,
  otp_required        BOOLEAN NOT NULL DEFAULT TRUE,
  otp_sent_to         VARCHAR(255),
  expires_at          TIMESTAMPTZ NOT NULL,
  max_uses            SMALLINT,   -- null = illimité (pour team_management)
  use_count           INTEGER NOT NULL DEFAULT 0,
  revoked             BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_by          UUID REFERENCES users(id),
  revoked_at          TIMESTAMPTZ,
  revoked_reason      TEXT,

  -- Log de chaque accès
  access_log          JSONB NOT NULL DEFAULT '[]',
  -- [{ip, geolocation, user_agent, timestamp, action, otp_validated}]

  hidden              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ext_link_token   ON external_access_links(token) WHERE revoked = FALSE;
CREATE INDEX idx_ext_link_ads     ON external_access_links(ads_id) WHERE ads_id IS NOT NULL;
CREATE INDEX idx_ext_link_company ON external_access_links(target_company_id)
  WHERE target_company_id IS NOT NULL;
```

---

## 15. Mise à jour `credential_types` — périodes de grâce et validité minimale

```sql
-- Ajout sur la table existante
ALTER TABLE credential_types
  ADD COLUMN grace_period_days  INTEGER NOT NULL DEFAULT 0
    CHECK (grace_period_days >= 0),
  ADD COLUMN min_validity_days  INTEGER NOT NULL DEFAULT 0
    CHECK (min_validity_days >= 0);

-- Signification :
-- grace_period_days : nb de jours APRÈS expiration où la certif reste acceptable
--   Défaut 0 = aucune grâce, expiration stricte
--   Exemple 30 : BOSIET expiré le 1/05 → encore valide jusqu'au 31/05
--
-- min_validity_days : nb de jours de validité résiduelle requis AU DÉPART du séjour
--   Défaut 0 = la certif doit juste couvrir jusqu'à la fin du séjour
--   Exemple 30 : HUET doit encore avoir 30 jours à compter du start_date de l'AdS
--
-- Règle effective de validation :
--   effective_expiry = expiry_date + grace_period_days
--   required_until   = MAX(ads_end_date, ads_start_date + min_validity_days)
--   valid            = effective_expiry >= required_until
```

### Vue d'aide à la configuration (pour l'interface admin)

```sql
-- Vue montrant la fenêtre de validité effective pour chaque type
CREATE VIEW credential_types_validity AS
SELECT
  id,
  code,
  name,
  has_expiry,
  validity_months,
  grace_period_days,
  min_validity_days,
  CASE
    WHEN NOT has_expiry THEN 'Sans expiration'
    WHEN grace_period_days = 0 AND min_validity_days = 0
      THEN 'Doit couvrir exactement la durée du séjour'
    WHEN grace_period_days > 0 AND min_validity_days = 0
      THEN format('Doit couvrir le séjour + grâce de %s jours', grace_period_days)
    WHEN grace_period_days = 0 AND min_validity_days > 0
      THEN format('Doit avoir au moins %s jours de validité au départ', min_validity_days)
    ELSE format('Grâce %s j + validité min %s j au départ',
                grace_period_days, min_validity_days)
  END AS validity_rule_summary
FROM credential_types
WHERE active = TRUE;
```

---

## 16. Distinction manifeste aller / retour

### Pourquoi c'est critique

Un PAX a deux manifestes dans sa vie sur site :
- **Manifeste aller** (outbound) : Wouri → Munja → AdS passe en `in_progress`
- **Manifeste retour** (inbound) : Munja → Wouri → AdS passe en `completed`

Sans ce champ, PaxLog ne sait pas si la clôture d'un manifeste signifie "arrivée sur site" ou "départ du site".

### Mise à jour table `pax_manifests`

```sql
ALTER TABLE pax_manifests
  ADD COLUMN direction VARCHAR(10) NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound'));
-- outbound : voyage vers le site (arrivée PAX)
-- inbound  : voyage de retour (départ PAX du site)
-- La direction est définie à la création du manifeste selon l'AdS liée
-- ou manuellement par le LOG_BASE

COMMENT ON COLUMN pax_manifests.direction IS
  'outbound = vers le site (fermeture → AdS in_progress), '
  'inbound = retour (fermeture → AdS completed)';
```

### Règle de détermination automatique

À la création automatique d'un manifeste (depuis `ads.approved`) :
```python
# Le manifeste généré depuis une AdS est toujours outbound
manifest.direction = 'outbound'

# Quand un PAX demande un retour (retour site) et est ajouté à un
# manifeste en direction de la base :
#   → le manifeste de retour est créé avec direction='inbound'
#   → ou le LOG_BASE le crée manuellement avec direction='inbound'
```

Le LOG_BASE peut toujours modifier la direction avant validation du manifeste.

---

## 17. Mise à jour `ads_pax` — champs retour

```sql
-- Champs ajoutés pour tracer le retour du PAX
ALTER TABLE ads_pax
  ADD COLUMN departed_at               TIMESTAMPTZ,
  -- Heure réelle de départ du site (depuis manifeste retour ou déclaration OMAA)
  ADD COLUMN departed_via_manifest_id  UUID REFERENCES pax_manifests(id),
  -- Manifeste inbound ayant clôturé l'AdS (si applicable)
  ADD COLUMN missed_return_manifest    BOOLEAN NOT NULL DEFAULT FALSE,
  -- PAX prévu dans un manifeste retour mais absent (no-show retour)
  ADD COLUMN never_arrived             BOOLEAN NOT NULL DEFAULT FALSE;
  -- PAX no-show au départ initial (jamais monté)
```

---

## 18. Corrections et compléments — Cargo

### 18.1 `cargo_movements` — champs manquants ajoutés

La table `cargo_movements` définie en section 5 est complétée avec les champs
manquants identifiés dans la spec fonctionnelle (anomalies, signature électronique,
lien OTP, manifeste) :

```sql
ALTER TABLE cargo_movements
  ADD COLUMN cargo_manifest_id    UUID REFERENCES cargo_manifests(id),
  -- Manifeste auquel ce mouvement est associé (peut être null pour les
  -- mouvements hors manifeste ex: enregistrement initial)

  ADD COLUMN anomaly              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN anomaly_description  TEXT,
  -- Si anomaly=true : description obligatoire (colis endommagé, manquant, hors manifeste)

  ADD COLUMN signature_data       TEXT,
  -- Signature électronique tablette encodée en base64
  -- Utilisé quand validation_type='tablet_signature'

  ADD COLUMN otp_token_id         UUID REFERENCES external_access_links(id),
  -- Référence du lien OTP utilisé pour la validation
  -- Utilisé quand validation_type='otp'

  ADD COLUMN quantity_moved       DECIMAL(10,3);
  -- Pour les articles bulk/volume : combien d'unités ont été déplacées
  -- Null pour les articles de type 'unit'
```

### 18.2 `ads` — champs modification

```sql
ALTER TABLE ads
  ADD COLUMN last_modification_reason TEXT,
  ADD COLUMN modification_count        SMALLINT NOT NULL DEFAULT 0;
```

### 18.3 `ads_pax` — champs no-show retour

(Complète la section 17)

```sql
ALTER TABLE ads_pax
  ADD COLUMN missed_return_manifest BOOLEAN NOT NULL DEFAULT FALSE;
  -- PAX attendu sur manifeste retour mais absent (≠ no_show aller)
```

### 18.4 Vue tracking colis (équivalent ads_events pour cargo)

La table `cargo_movements` est **append-only** et joue le même rôle que `ads_events`
pour les AdS : c'est le grand livre immuable de tout ce qui s'est passé sur un colis.

```sql
-- Vue utilitaire pour l'affichage de la timeline d'un colis
CREATE VIEW cargo_item_timeline AS
SELECT
  cm.id,
  cm.cargo_item_id,
  ci.tracking_number,
  cm.movement_type,
  cm.from_asset_id,
  fa.name            AS from_asset_name,
  cm.to_asset_id,
  ta.name            AS to_asset_name,
  cm.trip_id,
  t.reference        AS trip_reference,
  cm.performed_by_name,
  cm.validation_type,
  cm.anomaly,
  cm.anomaly_description,
  cm.quantity_moved,
  cm.notes,
  cm.recorded_at
FROM cargo_movements cm
JOIN cargo_items ci ON ci.id = cm.cargo_item_id
LEFT JOIN assets fa  ON fa.id = cm.from_asset_id
LEFT JOIN assets ta  ON ta.id = cm.to_asset_id
LEFT JOIN trips t    ON t.id  = cm.trip_id
ORDER BY cm.recorded_at;
```

### 18.5 Numérotation des références — récapitulatif complet

| Entité | Format | Exemple |
|---|---|---|
| Avis de Séjour | `ADS-YYYY-NNNNN` | ADS-2026-04521 |
| Voyage (Trip) | `TRIP-YYYY-NNNNN` | TRIP-2026-03412 |
| Manifeste PAX | `MAN-PAX-YYYY-NNNNN` | MAN-PAX-2026-03412 |
| Manifeste Cargo | `MAN-CGO-YYYY-NNNNN` | MAN-CGO-2026-01832 |
| Colis (Cargo Item) | `CGO-YYYY-NNNNN` | CGO-2026-004521 |
| Signalement | `SIG-YYYY-NNNNN` | SIG-2026-00042 |
| Urgence vecteur | `EMR-YYYY-NNNNN` | EMR-2026-00012 |
| Circuit ramassage | `PKP-YYYY-NNNNN` | PKP-2026-00315 |
| Projet | Code libre | GCM-2026 |
| Activité (OT) | `ACT-YYYY-NNNNN` | ACT-2026-03204 |

Tous générés via `generate_reference(prefix, db)` avec LOCK atomique sur `reference_sequences`.

---

## 19. Corrections cargo_manifest_entries et cargo_items — cas manquants

```sql
-- cargo_manifest_entries — champs ajoutés (cas C-02, C-04, C-05)
ALTER TABLE cargo_manifest_entries
  ADD COLUMN quantity_received      DECIMAL(12,3),
  -- Quantité réellement reçue au déchargement (si ≠ quantity déclarée sur cargo_item)
  ADD COLUMN has_anomaly            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN anomaly_notes          TEXT,
  ADD COLUMN dispute_reference      VARCHAR(100),
  ADD COLUMN recipient_actual_name  VARCHAR(200),
  -- Qui a physiquement réceptionné (si ≠ destinataire prévu)
  ADD COLUMN reception_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN reception_confirmed_at TIMESTAMPTZ;

-- Contrainte de statut mise à jour (ajout 'missing')
ALTER TABLE cargo_manifest_entries
  DROP CONSTRAINT IF EXISTS chk_cme_status,
  ADD CONSTRAINT chk_cme_status
    CHECK (status IN ('listed','loaded','unloaded','missing','cancelled'));
-- 'missing' : item non retrouvé lors du déchargement

-- cargo_items — champs ajoutés (cas C-02, C-03)
ALTER TABLE cargo_items
  ADD COLUMN has_anomaly            BOOLEAN NOT NULL DEFAULT FALSE;
  -- Dénormalisé depuis cargo_manifest_entries pour filtrage rapide

-- Statut 'delivered_intermediate' ajouté (cas C-03)
-- Modification de la contrainte CHECK sur status :
ALTER TABLE cargo_items DROP CONSTRAINT IF EXISTS cargo_items_status_check;
ALTER TABLE cargo_items ADD CONSTRAINT cargo_items_status_check
  CHECK (status IN (
    'registered','ready_for_loading','loaded','in_transit',
    'delivered_intermediate',   -- ← nouveau : livré à étape intermédiaire
    'delivered',
    'return_declared','return_in_transit','returned',
    'reintegrated','scrapped','lost'
  ));
```

---

## 20. Données complémentaires — Gaps G1, G2, G3

### 20.1 Poids PAX — champs ajoutés (G1)

```sql
-- Sur vehicles : configuration du besoin de pesée
ALTER TABLE vehicles
  ADD COLUMN requires_pax_weight   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN default_pax_weight_kg DECIMAL(6,2) DEFAULT 85.0;

-- Sur pax_profiles : poids déclaré mémorisé
ALTER TABLE pax_profiles
  ADD COLUMN declared_weight_kg  DECIMAL(6,2),
  ADD COLUMN weight_declared_at  TIMESTAMPTZ;

-- Sur pax_manifest_entries : poids saisi (déclaré ou pesé)
-- weight_kg existait déjà — ajout de la source
ALTER TABLE pax_manifest_entries
  ADD COLUMN weight_source  VARCHAR(20) DEFAULT 'declared'
    CHECK (weight_source IN ('declared', 'weighed', 'default', 'estimated'));
-- declared : saisi dans l'AdS
-- weighed  : repesé à l'embarquement (valeur finale)
-- default  : valeur par défaut du vecteur (vehicle.default_pax_weight_kg)
-- estimated: saisi manuellement par LOG_BASE
```

### 20.2 Délégation de validation (G2)

```sql
CREATE TABLE user_delegations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id      UUID NOT NULL REFERENCES users(id),
  delegate_id       UUID NOT NULL REFERENCES users(id),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  asset_scope_id    UUID REFERENCES assets(id),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  include_pending   BOOLEAN NOT NULL DEFAULT FALSE,
  message           TEXT,
  revoked           BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_delegation_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_no_self_delegation CHECK (delegator_id <> delegate_id)
);
CREATE INDEX idx_delegations_delegate ON user_delegations(delegate_id, start_date, end_date)
  WHERE revoked = FALSE;

-- Sur workflow_transitions : traçabilité délégation
ALTER TABLE workflow_transitions
  ADD COLUMN delegation_id UUID REFERENCES user_delegations(id);
-- Non null si l'action a été effectuée par un délégué
```

---

## 21. Champs transport aller/retour — Addendum

### Mise à jour `ads_pax` — surcharge transport retour individuel

```sql
-- Pour les AdS d'équipe où un PAX rentre différemment des autres
ALTER TABLE ads_pax
  ADD COLUMN return_transport_override   VARCHAR(50),
  -- Surcharge individuelle du mode retour (null = utilise ads.return_transport_mode)
  ADD COLUMN return_departure_override   UUID REFERENCES assets(id),
  ADD COLUMN return_override_reason      TEXT;
  -- Motif obligatoire si override ≠ null
```

### Nouveau type d'événement dans `ads_events`

```sql
-- Ajout à la liste des event_type valides (CHECK constraint)
-- 'transport_return_modified' : changement du vecteur retour en cours de séjour
-- Payload: {old_mode, new_mode, reason, impacted_manifest_id}
```

### Mise à jour du payload `ads.approved` vers TravelWiz

```json
{
  "outbound_transport_mode": "helicopter",
  "outbound_departure_base_id": "uuid-wouri-base",
  "return_transport_mode": "boat",
  "return_departure_base_id": "uuid-munja",
  "pax_list": [
    {
      "ads_pax_id": "uuid",
      "return_transport_override": null,
      "return_departure_override": null
    }
  ]
}
```

TravelWiz utilise `return_transport_mode` (ou `return_transport_override` par PAX)
pour filtrer les voyages retour compatibles quand il génère le manifeste inbound.

---

## 22. Nouveaux modèles — Module Projets (fonctionnalités manquantes)

```sql
-- Membres d'un projet
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','manager','member','viewer')),
  added_by    UUID REFERENCES users(id),
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- Assignés par tâche (plusieurs possible)
CREATE TABLE task_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, user_id)
);

-- Commentaires sur les tâches
CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  edited      BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at   TIMESTAMPTZ,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Mentions dans les commentaires
CREATE TABLE task_comment_mentions (
  comment_id  UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

-- Pièces jointes sur les tâches
CREATE TABLE task_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  filename      VARCHAR(300) NOT NULL,
  file_url      TEXT NOT NULL,
  file_size_kb  INTEGER,
  mime_type     VARCHAR(100),
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user    ON project_members(user_id);
CREATE INDEX idx_task_assignees_task     ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_user     ON task_assignees(user_id);
CREATE INDEX idx_task_comments_task      ON task_comments(task_id, created_at);
CREATE INDEX idx_task_attachments_task   ON task_attachments(task_id);
```

---

## 23. Profils métier PAX et habilitations

```sql
-- Référentiel profils métier
CREATE TABLE profile_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  code          VARCHAR(50) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, code)
);

-- Association PAX ↔ profils métier (plusieurs profils possibles)
CREATE TABLE pax_profile_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id) ON DELETE CASCADE,
  profile_type_id   UUID NOT NULL REFERENCES profile_types(id),
  assigned_at       TIMESTAMPTZ DEFAULT NOW(),
  assigned_by       UUID REFERENCES users(id),
  UNIQUE (pax_id, profile_type_id)
);

-- Matrice d'habilitation par profil métier
CREATE TABLE profile_habilitation_matrix (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  profile_type_id       UUID NOT NULL REFERENCES profile_types(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  mandatory             BOOLEAN NOT NULL DEFAULT TRUE,
  set_by                UUID NOT NULL REFERENCES users(id),
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT,
  UNIQUE (entity_id, profile_type_id, credential_type_id)
);

-- Sur ads_pax : profil déclaré + autodéclarations
ALTER TABLE ads_pax
  ADD COLUMN declared_profile_type_id UUID REFERENCES profile_types(id),
  ADD COLUMN profile_self_declaration JSONB DEFAULT '[]';
  -- [{credential_type_id, declared, proof_url, validated, validated_by, validated_at}]

CREATE INDEX idx_profile_types_entity ON profile_types(entity_id);
CREATE INDEX idx_pax_profile_types    ON pax_profile_types(pax_id);
CREATE INDEX idx_phm_profile          ON profile_habilitation_matrix(profile_type_id);

-- Décisions archit.
-- D-C17 : SVAR UI Gantt pour module Projets
-- D-C18 : React Modern Gantt pour module Planner
```

---

## 24. Module AVM — Avis de Mission

```sql
-- Référence AVM dans reference_sequences (préfixe 'AVM')
-- generate_reference("AVM", db) → AVM-2026-00021

-- Sur ads : lien vers l'AVM source
ALTER TABLE ads
  ADD COLUMN source_avm_id        UUID REFERENCES mission_notices(id),
  ADD COLUMN source_avm_reference VARCHAR(50);
  -- Tracabilité : cette AdS a été générée depuis l'AVM X

-- Deux nouveaux statuts FSM ads (D-C20)
-- pending_initiator_review : en attente de confirmation de l'initiateur
-- pending_project_review   : en attente de validation du chef de projet

-- Tables principales (voir 21_MODULE_AVM.md pour DDL complet)
-- mission_notices, mission_notice_projects, mission_programs
-- mission_program_pax, mission_preparation_tasks, mission_stakeholders
```

---

## 25. Corrections de cohérence

### I-1 — Statuts ads.status : ajout pending_initiator_review et pending_project_review

```sql
-- Remplacer la contrainte CHECK existante sur ads.status
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;
ALTER TABLE ads ADD CONSTRAINT ads_status_check
  CHECK (status IN (
    'draft',
    'pending_initiator_review',   -- ← nouveau : attente validation initiateur
    'pending_project_review',     -- ← nouveau : attente validation chef de projet
    'pending_compliance',
    'pending_validation',
    'approved',
    'rejected',
    'cancelled',
    'requires_review',
    'pending_arbitration',
    'in_progress',
    'completed'
  ));
```

### I-2 — activity_links (liens inter-projets Planner)

```sql
CREATE TABLE activity_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  predecessor_id    UUID NOT NULL REFERENCES activities(id),
  successor_id      UUID NOT NULL REFERENCES activities(id),
  link_type         VARCHAR(5) NOT NULL DEFAULT 'FS'
    CHECK (link_type IN ('FS','SS','FF','SF')),
  lag_days          DECIMAL(8,2) DEFAULT 0,
  lag_unit          VARCHAR(20) DEFAULT 'calendar_days'
    CHECK (lag_unit IN ('calendar_days','working_days')),
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_no_self_link CHECK (predecessor_id <> successor_id),
  UNIQUE (predecessor_id, successor_id, link_type)
);
CREATE INDEX idx_activity_links_pred ON activity_links(predecessor_id);
CREATE INDEX idx_activity_links_succ ON activity_links(successor_id);
```

### I-3 — Tables AVM (intégrées dans PaxLog section 10)

```sql
-- Voir modules/v1/PAXLOG.md §10.2 pour les DDL complets.
-- Résumé des tables :
--   mission_notices            Dossier de mission principal
--   mission_notice_projects    Liens projets/tâches (N-N)
--   mission_programs           Lignes du programme de mission
--   mission_program_pax        Intervenants par ligne
--   mission_preparation_tasks  Travaux préparatoires (auto + manuels)
--   mission_stakeholders       Parties prenantes avec niveau notif
--
-- Sur ads : ADD COLUMN source_avm_id, source_avm_reference (déjà dans §24)
-- reference_sequences : préfixe 'AVM' → AVM-YYYY-NNNNN

-- Index manquants à ajouter :
CREATE INDEX idx_mission_program_avm  ON mission_programs(mission_notice_id, order_index);
CREATE INDEX idx_mission_prep_avm     ON mission_preparation_tasks(mission_notice_id, status);
CREATE INDEX idx_mission_stake_avm    ON mission_stakeholders(mission_notice_id);
CREATE INDEX idx_mission_pax          ON mission_program_pax(mission_program_id);
```

### I-4 — cargo_manifest_entries : correction contrainte CHECK

```sql
-- La contrainte originale (ligne 1104) doit être remplacée par :
ALTER TABLE cargo_manifest_entries DROP CONSTRAINT IF EXISTS cargo_manifest_entries_status_check;
ALTER TABLE cargo_manifest_entries ADD CONSTRAINT cargo_manifest_entries_status_check
  CHECK (status IN ('listed','loaded','unloaded','missing','cancelled'));
-- 'missing' : item non retrouvé lors du déchargement (ajouté dans addendum C-05)
```

---

## 26. Corrections AVM — P1/P3/P4/P5

### Statuts FSM mission_notices (P1/P3)

```sql
ALTER TABLE mission_notices DROP CONSTRAINT IF EXISTS mission_notices_status_check;
ALTER TABLE mission_notices ADD CONSTRAINT mission_notices_status_check
  CHECK (status IN ('draft','in_preparation','active','completed','cancelled'));
-- 'submitted' supprimé — FSM simplifié
```

### MissionProgram — champs project_id et task_id ajoutés (P4)

```sql
ALTER TABLE mission_programs
  ADD COLUMN project_id UUID REFERENCES projects(id),
  ADD COLUMN task_id    UUID REFERENCES tasks(id);
-- Chaque ligne précise son projet d'imputation (indépendant des autres lignes)
```

### Tables créneaux de réunion (P5)

```sql
CREATE TABLE mission_meeting_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  title               VARCHAR(300) NOT NULL,
  meeting_date        DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME,
  location            TEXT,
  organizer_id        UUID REFERENCES users(id),
  organizer_name      VARCHAR(200),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_meeting_slots_avm ON mission_meeting_slots(mission_notice_id, meeting_date);

CREATE TABLE mission_meeting_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID NOT NULL REFERENCES mission_meeting_slots(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  external_name   VARCHAR(200),
  external_email  VARCHAR(200),
  confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (meeting_id, user_id)
);
```

---

## 27. Corrections AVM — P7/P8/P10

### P7 — Documents AVM : global vs par PAX

```sql
-- Remplacement de attachments_config sur mission_notices
-- (déjà géré dans §23 via global_attachments_config + per_pax_attachments_config)

-- Nouvelles tables (DDL complet dans modules/v1/PAXLOG.md §10.2)
-- mission_global_documents   : docs liés à la mission (LOI, ordre de mission, etc.)
-- mission_pax_documents      : docs par PAX (passeport, visa) — UNIQUE (mission, pax, doc_type)
```

### P8 — Statut 'ready' ajouté au FSM AVM

```sql
-- Mise à jour constraint (remplace §26)
ALTER TABLE mission_notices DROP CONSTRAINT IF EXISTS mission_notices_status_check;
ALTER TABLE mission_notices ADD CONSTRAINT mission_notices_status_check
  CHECK (status IN ('draft','in_preparation','active','ready','completed','cancelled'));
-- 'ready' : toutes tâches prépa OK + toutes AdS approuvées — mission prête à partir
```

### P10 — Règle de modification programme + endpoints

Voir modules/v1/PAXLOG.md §10.7 pour les règles détaillées.
Résumé : PATCH programme bloqué si `generated_ads_id` pointe vers une AdS
en statut `submitted`, `pending_*`, `approved`, ou `in_progress`.

### Tables réunion (P5 — déjà dans §26, index complémentaires)

```sql
CREATE INDEX idx_meeting_participants ON mission_meeting_participants(meeting_id);
```

---

## 28. Tables visa, indemnité, annulation AVM

```sql
-- Champ cancellation_reason sur mission_notices
ALTER TABLE mission_notices
  ADD COLUMN cancellation_reason TEXT;

-- Demandes de visa (une par PAX par AVM)
CREATE TABLE mission_visa_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  destination_country VARCHAR(100) NOT NULL,
  visa_type           VARCHAR(50),
  -- touriste | affaires | travail | transit
  application_date    DATE,
  status              VARCHAR(30) NOT NULL DEFAULT 'to_initiate'
    CHECK (status IN ('to_initiate','submitted','in_review','obtained','refused','cancelled')),
  submitted_at        DATE,
  obtained_at         DATE,
  refused_at          DATE,
  refusal_reason      TEXT,
  visa_expiry_date    DATE,
  handled_by          UUID REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_notice_id, pax_id)
);
CREATE INDEX idx_visa_req_mission ON mission_visa_requests(mission_notice_id);

-- Demandes d'indemnité grand déplacement
CREATE TABLE mission_allowance_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','paid','rejected')),
  duration_days       SMALLINT,
  amount_requested    DECIMAL(12,2),
  currency            VARCHAR(3) DEFAULT 'XAF',
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  payment_reference   VARCHAR(100),
  rejection_reason    TEXT,
  handled_by          UUID REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_notice_id, pax_id)
);
CREATE INDEX idx_allowance_mission ON mission_allowance_requests(mission_notice_id);
```


---

## 29. Colonnes spécifiques activités Workover / Forage / Intégrité

```sql
ALTER TABLE activities
  -- Workover
  ADD COLUMN well_reference       VARCHAR(100),
  -- Référence du puits concerné (ex: MJ-14, ESF-07)
  ADD COLUMN workover_type        VARCHAR(50)
    CHECK (workover_type IN (
      'slickline','coiled_tubing','wireline',
      'pump_change','chemical_treatment','other'
    )),
  ADD COLUMN rig_name             VARCHAR(100),
  -- Nom du rig / unité d'intervention (ex: WOU Rig 2)

  -- Drilling (Forage)
  ADD COLUMN well_name            VARCHAR(100),
  -- Nom du nouveau puits (ex: MJ-20)
  ADD COLUMN spud_date            DATE,
  -- Date de début de forage prévue
  ADD COLUMN target_depth_m       DECIMAL(8,1),
  -- Profondeur cible en mètres TVD
  ADD COLUMN drilling_program_ref VARCHAR(100),
  -- Référence du programme de forage approuvé

  -- Integrity (Intégrité)
  ADD COLUMN integrity_scope      TEXT,
  -- Description de l'équipement / pipeline / zone inspecté
  ADD COLUMN integrity_method     VARCHAR(100),
  -- pigging | UT | CVI | drone | IRIS | MFL | autre
  ADD COLUMN regulatory_reference VARCHAR(200);
  -- Référence réglementaire si inspection obligatoire

CREATE INDEX idx_activities_well ON activities(well_reference)
  WHERE well_reference IS NOT NULL;
```
