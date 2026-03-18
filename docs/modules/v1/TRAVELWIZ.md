# Module TravelWiz — Spécification Technique Complète

> Version consolidée — Perenco Cameroun — Mars 2026

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Modèle de données](#2-modèle-de-données)
3. [Schémas Pydantic](#3-schémas-pydantic)
4. [Service layer](#4-service-layer)
5. [API endpoints](#5-api-endpoints)
6. [Règles métier](#6-règles-métier)
7. [Voyages multi-escales](#7-voyages-multi-escales)
8. [Urgences et pannes](#8-urgences-et-pannes)
9. [Prolongation de séjour](#9-prolongation-de-séjour)
13. [Perte de certification en cours de séjour](#13-perte-de-certification-en-cours-de-séjour)
11. [Ramassage terrestre](#11-ramassage-terrestre)
12. [Cargo — cas manquants et clarifications](#12-cargo--cas-manquants-et-clarifications)
13. [Trip delayed — seuil de réassignation](#13-trip-delayed--seuil-de-réassignation)
14. [IoT multi-devices — priorité par vecteur](#14-iot-multi-devices--priorité-par-vecteur)
15. [Événements émis](#15-événements-émis)

---


## 1. Rôle et périmètre

TravelWiz est le **module de gestion logistique des déplacements**. Il couvre :
- Enregistrement et gestion des vecteurs de transport (hélicoptère, navette, surfeur, bus, vol, etc.)
- Génération et validation des manifestes PAX (depuis les AdS approuvées par PaxLog)
- Gestion du cargo : enregistrement, tracking, organisation de deck, back cargo
- Rotations périodiques et planning surfeur intra-champ
- Tracking IoT temps réel (positions GPS, événements voyage, journal de bord numérique)
- Données météo par zone/voyage
- KPIs et analytics flotte
- Dashboard opérationnel type MarineTraffic
- Rapports officiels (via Report Editor core) et exports terrain (WeasyPrint)

**Deux flux indépendants** :
- **Flux PAX** : alimenté par PaxLog (AdS approuvées), manifestes propres
- **Flux Cargo** : indépendant, manifestes séparés, même vecteur possible

---


---


## 2. Modèle de données

### 2.1 Vehicle (Vecteur de transport)

```sql
CREATE TABLE vehicles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  name                  VARCHAR(200) NOT NULL,
  registration          VARCHAR(100),             -- immatriculation
  type                  VARCHAR(50) NOT NULL,
  -- helicopter | boat | surfer | bus | 4x4 | commercial_flight | barge | tug | ...
  -- valeur libre configurable par l'admin
  transport_mode        VARCHAR(20) NOT NULL,
  -- air | sea | road
  provider_id           UUID REFERENCES tiers(id),
  capacity_pax          SMALLINT NOT NULL CHECK (capacity_pax >= 0),
  capacity_weight_kg    DECIMAL(10,2),
  capacity_volume_m3    DECIMAL(10,2),
  home_base_asset_id    UUID REFERENCES assets(id),
  ais_mmsi              VARCHAR(20),              -- identifiant AIS pour navires
  active                BOOLEAN DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vehicles_entity ON vehicles(entity_id);
CREATE INDEX idx_vehicles_type   ON vehicles(entity_id, type);
```

### 2.2 DeckSurface (Surface de chargement)

Un vecteur peut avoir plusieurs zones de chargement (pont avant, pont arrière, soute, etc.).

```sql
CREATE TABLE deck_surfaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id              UUID NOT NULL REFERENCES vehicles(id),
  name                    VARCHAR(200) NOT NULL,
  surface_type            VARCHAR(20) NOT NULL,
  -- deck | hold | rack | flat
  definition_mode         VARCHAR(20) NOT NULL DEFAULT 'rectangle',
  -- rectangle | polygon | image_overlay | composite
  width_m                 DECIMAL(8,3),
  length_m                DECIMAL(8,3),
  height_constraint_m     DECIMAL(6,3),           -- null = pas de contrainte hauteur
  polygon_points          JSONB,                  -- [{x, y}] en mètres si mode=polygon
  background_image_url    TEXT,                   -- plan du pont (mode=image_overlay)
  exclusion_zones         JSONB,                  -- [{x, y, w, h, label}] obstacles fixes
  max_weight_kg           DECIMAL(12,3) NOT NULL,
  max_surface_load_kg_m2  DECIMAL(8,3),
  usable_area_m2          DECIMAL(10,3),          -- calculé après exclusions
  stacking_allowed        BOOLEAN DEFAULT FALSE,
  max_stack_height_m      DECIMAL(6,3),
  notes                   TEXT,
  active                  BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_deck_surfaces_vehicle ON deck_surfaces(vehicle_id);
```

### 2.3 Rotation (Rotation périodique)

```sql
CREATE TABLE rotations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  name                      VARCHAR(200) NOT NULL,
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
  origin_asset_id           UUID NOT NULL REFERENCES assets(id),
  destination_asset_id      UUID NOT NULL REFERENCES assets(id),
  recurrence_rule           TEXT NOT NULL,
  -- RRule iCal : ex: FREQ=WEEKLY;BYDAY=MO;BYHOUR=7;BYMINUTE=0
  effective_start           DATE NOT NULL,
  effective_end             DATE,                 -- null = indéfini
  status                    VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active | suspended | cancelled
  workflow_id               UUID,                 -- FSM core
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
```

### 2.4 Trip (Voyage)

```sql
CREATE TABLE trips (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 UUID NOT NULL REFERENCES entities(id),
  reference                 VARCHAR(50) UNIQUE NOT NULL,
  -- TRIP-2026-03412
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
  origin_asset_id           UUID NOT NULL REFERENCES assets(id),
  destination_asset_id      UUID NOT NULL REFERENCES assets(id),
  departure_datetime        TIMESTAMPTZ,           -- null si pas encore planifié
  arrival_datetime          TIMESTAMPTZ,
  actual_departure          TIMESTAMPTZ,
  actual_arrival            TIMESTAMPTZ,
  status                    VARCHAR(20) NOT NULL DEFAULT 'planned',
  -- planned | confirmed | boarding | departed | arrived | completed | cancelled | delayed
  rotation_id               UUID REFERENCES rotations(id),
  is_intrafield             BOOLEAN DEFAULT FALSE, -- vrai pour les trips surfeur intra-champ
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
  WHERE status NOT IN ('completed', 'cancelled');
```

### 2.5 TripCodeAccess (Code portail capitaine)

```sql
CREATE TABLE trip_code_access (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES trips(id),
  access_code   VARCHAR(10) UNIQUE NOT NULL,  -- 6 chiffres
  qr_code_url   TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,                  -- null = valide durée du voyage
  revoked       BOOLEAN DEFAULT FALSE,
  access_log    JSONB DEFAULT '[]'
  -- [{ip, user_agent, timestamp, action}]
);
CREATE INDEX idx_trip_codes_active ON trip_code_access(access_code)
  WHERE revoked = FALSE;
```

### 2.6 PaxManifest

```sql
CREATE TABLE pax_manifests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID REFERENCES entities(id),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  -- MAN-PAX-2026-03412
  trip_id               UUID NOT NULL REFERENCES trips(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | pending_validation | validated | requires_review | closed | cancelled
  workflow_id           UUID,                     -- FSM core
  generated_from_ads    BOOLEAN DEFAULT FALSE,
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  total_pax_confirmed   SMALLINT DEFAULT 0,       -- calculé
  total_weight_kg       DECIMAL(10,2) DEFAULT 0,  -- calculé
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pax_manifests_trip   ON pax_manifests(trip_id);
CREATE INDEX idx_pax_manifests_status ON pax_manifests(entity_id, status);
```

### 2.7 PaxManifestEntry

```sql
CREATE TABLE pax_manifest_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id       UUID NOT NULL REFERENCES pax_manifests(id),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  ads_pax_id        UUID REFERENCES ads_pax(id),  -- null si ajout manuel
  status            VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  -- confirmed | standby | cancelled | no_show | boarded | disembarked
  weight_kg         DECIMAL(6,2),
  boarding_order    SMALLINT,
  priority_score    INTEGER DEFAULT 0,
  priority_source   VARCHAR(50),
  standby_reason    TEXT,
  added_manually    BOOLEAN DEFAULT FALSE,
  added_by          UUID REFERENCES users(id),
  notes             TEXT,
  UNIQUE (manifest_id, pax_id)
);
CREATE INDEX idx_pme_manifest ON pax_manifest_entries(manifest_id);
CREATE INDEX idx_pme_pax      ON pax_manifest_entries(pax_id);
CREATE INDEX idx_pme_ads_pax  ON pax_manifest_entries(ads_pax_id);
```

### 2.8 CargoManifest

```sql
CREATE TABLE cargo_manifests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID REFERENCES entities(id),
  reference         VARCHAR(50) UNIQUE NOT NULL,
  -- MAN-CGO-2026-03412
  trip_id           UUID NOT NULL REFERENCES trips(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | pending_validation | validated | requires_review | closed | cancelled
  workflow_id       UUID,
  validated_by      UUID REFERENCES users(id),
  validated_at      TIMESTAMPTZ,
  total_weight_kg   DECIMAL(12,2) DEFAULT 0,
  total_volume_m3   DECIMAL(10,2),
  has_hazmat        BOOLEAN DEFAULT FALSE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.9 ArticleCatalog (Base articles SAP importée)

```sql
CREATE TABLE article_catalog (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_code                VARCHAR(50) UNIQUE,
  internal_code           VARCHAR(50),
  description_fr          VARCHAR(500) NOT NULL,
  description_en          VARCHAR(500),
  description_normalized  TEXT NOT NULL,  -- pour matching IA (minuscules, sans accents)
  management_type         VARCHAR(30) NOT NULL,
  -- unit | bulk_quantity | consumable_volume | consumable_discrete | package | waste
  unit_of_measure         VARCHAR(20),    -- pcs | kg | L | m3 | m | bundle
  packaging_type          VARCHAR(50),    -- Basket | Skid | Tool Box | Container 10FT | ...
  is_hazmat               BOOLEAN DEFAULT FALSE,
  hazmat_class            VARCHAR(50),    -- classe IMDG/IATA
  unit_weight_kg          DECIMAL(10,3),
  -- Embeddings pour matching IA (pgvector)
  embedding               vector(384),   -- sentence-transformers all-MiniLM-L6-v2
  source                  VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- sap_import | manual | ai_created
  last_imported_at        TIMESTAMPTZ,
  active                  BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_article_sap    ON article_catalog(sap_code);
-- Index GIN pg_trgm pour recherche fuzzy
CREATE INDEX idx_article_trgm   ON article_catalog
  USING gin(description_normalized gin_trgm_ops);
-- Index IVFFlat pour recherche vectorielle pgvector
CREATE INDEX idx_article_embed  ON article_catalog
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 2.10 CargoItem (Colis / Article cargo)

```sql
CREATE TABLE cargo_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                   UUID NOT NULL REFERENCES entities(id),
  tracking_number             VARCHAR(50) UNIQUE NOT NULL,
  -- CGO-2026-004521 (séquentiel)
  external_reference          VARCHAR(200),  -- P19 493, QR code, DRLG 1123, etc.
  slip_number                 VARCHAR(100),  -- N° Slip bordereau logistique
  management_type             VARCHAR(30) NOT NULL,
  article_id                  UUID REFERENCES article_catalog(id),
  sap_code                    VARCHAR(50),
  sap_code_status             VARCHAR(20) NOT NULL DEFAULT 'unknown',
  -- confirmed | ai_suggested | manual | unknown
  sap_suggestion_code         VARCHAR(50),
  sap_suggestion_confidence   DECIMAL(4,3),  -- score 0-1
  description                 TEXT NOT NULL,
  packaging_type              VARCHAR(100),
  quantity                    DECIMAL(12,3) NOT NULL,
  unit_of_measure             VARCHAR(20) NOT NULL,
  unit_weight_kg              DECIMAL(10,3),
  total_weight_kg             DECIMAL(12,3),
  dimensions_l_m              DECIMAL(8,3),
  dimensions_w_m              DECIMAL(8,3),
  dimensions_h_m              DECIMAL(8,3),
  is_hazmat                   BOOLEAN DEFAULT FALSE,
  hazmat_class                VARCHAR(50),
  is_hazmat_explosive         BOOLEAN DEFAULT FALSE,
  sender_id                   UUID REFERENCES users(id),
  sender_name                 VARCHAR(200) NOT NULL,
  recipient_id                UUID REFERENCES users(id),
  recipient_name              VARCHAR(200),
  owner_department            VARCHAR(100),
  cost_imputation_id          UUID REFERENCES cost_centers(id),
  project_id                  UUID REFERENCES projects(id),
  cost_imputation_required    BOOLEAN DEFAULT FALSE,
  origin_asset_id             UUID NOT NULL REFERENCES assets(id),
  destination_asset_id        UUID NOT NULL REFERENCES assets(id),
  current_location_asset_id   UUID REFERENCES assets(id),
  status                      VARCHAR(30) NOT NULL DEFAULT 'registered',
  -- registered | ready_for_loading | loaded | in_transit | delivered
  -- | return_declared | return_in_transit | returned | reintegrated | scrapped | lost
  return_type                 VARCHAR(30),
  -- waste | contractor_return | stock_reintegration | scrap | yard_storage
  photos                      JSONB DEFAULT '[]',
  -- [{url, stage, timestamp, uploaded_by}]
  -- stage: registration | loading | unloading | anomaly | return
  photo_required_stages       JSONB DEFAULT '["anomaly"]',
  manifest_priority_score     INTEGER DEFAULT 0,
  is_urgent                   BOOLEAN DEFAULT FALSE,
  urgent_reason               TEXT,
  archived                    BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cargo_tracking  ON cargo_items(tracking_number);
CREATE INDEX idx_cargo_entity    ON cargo_items(entity_id);
CREATE INDEX idx_cargo_status    ON cargo_items(entity_id, status);
CREATE INDEX idx_cargo_origin    ON cargo_items(origin_asset_id);
CREATE INDEX idx_cargo_dest      ON cargo_items(destination_asset_id);
CREATE INDEX idx_cargo_location  ON cargo_items(current_location_asset_id);
CREATE INDEX idx_cargo_sap       ON cargo_items(sap_code);
```

### 2.11 PackageElement (Éléments d'un package mixte)

```sql
CREATE TABLE package_elements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id              UUID NOT NULL REFERENCES cargo_items(id) ON DELETE CASCADE,
  article_id              UUID REFERENCES article_catalog(id),
  sap_code                VARCHAR(50),
  sap_code_status         VARCHAR(20) NOT NULL DEFAULT 'unknown',
  description             TEXT NOT NULL,
  management_type         VARCHAR(30) NOT NULL,
  -- unit | bulk_quantity | consumable_volume | consumable_discrete
  quantity_sent           DECIMAL(12,3) NOT NULL,
  quantity_returned       DECIMAL(12,3),          -- renseigné au retour
  unit_of_measure         VARCHAR(20) NOT NULL,
  unit_weight_kg          DECIMAL(10,3),
  return_status           VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- pending | fully_returned | partially_returned | consumed | lost
  return_notes            TEXT
);
CREATE INDEX idx_package_elements_parent ON package_elements(package_id);
```

### 2.12 CargoManifestEntry

```sql
CREATE TABLE cargo_manifest_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_manifest_id     UUID NOT NULL REFERENCES cargo_manifests(id),
  cargo_item_id         UUID NOT NULL REFERENCES cargo_items(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'listed',
  -- listed | loaded | unloaded | cancelled
  loaded_at             TIMESTAMPTZ,
  unloaded_at           TIMESTAMPTZ,
  notes                 TEXT,
  UNIQUE (cargo_manifest_id, cargo_item_id)
);
```

### 2.13 DeckLayout (Organisation de deck)

```sql
CREATE TABLE deck_layouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES trips(id),
  deck_surface_id   UUID NOT NULL REFERENCES deck_surfaces(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft | proposed_by_algo | validated | locked
  algo_run_at       TIMESTAMPTZ,
  validated_by      UUID REFERENCES users(id),
  validated_at      TIMESTAMPTZ,
  layout_rules      JSONB NOT NULL DEFAULT '{}',
  -- {hazmat_isolated, explosive_separate, heavy_bottom,
  --  priority_unloading, weight_distribution, max_surface_load,
  --  destination_grouping}
  UNIQUE (trip_id, deck_surface_id)
);

CREATE TABLE deck_layout_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_layout_id    UUID NOT NULL REFERENCES deck_layouts(id) ON DELETE CASCADE,
  cargo_item_id     UUID NOT NULL REFERENCES cargo_items(id),
  x_m               DECIMAL(8,3) NOT NULL,
  y_m               DECIMAL(8,3) NOT NULL,
  rotation_deg      SMALLINT NOT NULL DEFAULT 0,  -- 0, 90, 180, 270
  stack_level       SMALLINT NOT NULL DEFAULT 0,
  placed_by         VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- algorithm | manual
  notes             TEXT,
  UNIQUE (deck_layout_id, cargo_item_id)
);
CREATE INDEX idx_deck_layout_items ON deck_layout_items(deck_layout_id);
```

### 2.14 VoyageEvent (Journal de bord numérique)

```sql
-- Catalogue configurable des types d'événements
CREATE TABLE voyage_event_types (
  code              VARCHAR(50) PRIMARY KEY,
  label_fr          VARCHAR(200) NOT NULL,
  category          VARCHAR(30) NOT NULL,
  -- navigation | pax_ops | cargo_ops | standby | weather | incident | maintenance | admin
  allowed_sources   JSONB DEFAULT '["captain_portal","logistician"]',
  prerequisites     JSONB DEFAULT '[]',  -- codes d'événements devant précéder
  expected_payload  JSONB,               -- schéma des champs additionnels attendus
  sort_order        INTEGER DEFAULT 0,
  active            BOOLEAN DEFAULT TRUE
);

-- Données initiales (INSERT au démarrage ou migration)
-- ARRIVED_AT | STANDBY | STANDBY_END | BOARDING_START | BOARDING_END
-- CARGO_LOADING_START | CARGO_LOADING_END | DEPARTURE | UNDERWAY
-- STOPOVER | ANCHORED | STANDBY_REFUELLING | REFUELLING_END
-- DISEMBARKATION_START | DISEMBARKATION_END
-- CARGO_UNLOADING_START | CARGO_UNLOADING_END
-- ARRIVED_DESTINATION | WEATHER_UPDATE | INCIDENT
-- MAINTENANCE_STOP | MAINTENANCE_END | TRIP_CLOSED

CREATE TABLE voyage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES trips(id),
  event_code      VARCHAR(50) NOT NULL REFERENCES voyage_event_types(code),
  event_label     VARCHAR(200) NOT NULL,   -- dénormalisé
  category        VARCHAR(30) NOT NULL,    -- dénormalisé
  recorded_at     TIMESTAMPTZ NOT NULL,    -- horodatage réel (device)
  received_at     TIMESTAMPTZ DEFAULT NOW(), -- horodatage serveur
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  asset_id        UUID REFERENCES assets(id),
  location_label  VARCHAR(200),            -- libellé libre si pas d'asset
  performed_by    UUID REFERENCES users(id),
  performed_by_name VARCHAR(200) NOT NULL,
  source          VARCHAR(20) NOT NULL,
  -- captain_portal | logistician | iot_auto | mcp
  trip_code_used  VARCHAR(10),
  payload         JSONB,
  -- {pax_count, cargo_weight_kg, fuel_litres, weather: {...}, ...}
  offline_sync    BOOLEAN DEFAULT FALSE,
  notes           TEXT
) PARTITION BY RANGE (recorded_at);
-- Partition par semaine
CREATE INDEX idx_vevt_trip     ON voyage_events(trip_id, recorded_at);
CREATE INDEX idx_vevt_category ON voyage_events(category, recorded_at DESC);
```

### 2.15 TripKPI (KPIs calculés par voyage)

```sql
CREATE TABLE trip_kpis (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id                     UUID UNIQUE NOT NULL REFERENCES trips(id),
  -- Temps (en minutes)
  total_duration_min          INTEGER,
  navigation_time_min         INTEGER,
  standby_time_min            INTEGER,
  boarding_time_min           INTEGER,
  disembarkation_time_min     INTEGER,
  loading_time_min            INTEGER,
  unloading_time_min          INTEGER,
  maintenance_time_min        INTEGER,
  refuelling_time_min         INTEGER,
  -- Distances
  distance_nm                 DECIMAL(10,2),
  distance_km                 DECIMAL(10,2),
  distance_source             VARCHAR(20),  -- gps_track | calculated | manual
  -- Carburant
  fuel_start_litres           DECIMAL(10,2),
  fuel_end_litres             DECIMAL(10,2),
  fuel_consumed_litres        DECIMAL(10,2),
  fuel_consumption_per_nm     DECIMAL(8,4),
  -- PAX
  pax_boarded_count           INTEGER,
  pax_disembarked_count       INTEGER,
  pax_no_show_count           INTEGER,
  max_pax_onboard             INTEGER,
  -- Cargo
  cargo_loaded_kg             DECIMAL(12,2),
  cargo_unloaded_kg           DECIMAL(12,2),
  -- Météo moyenne
  avg_wind_knots              DECIMAL(6,2),
  avg_wave_height_m           DECIMAL(6,2),
  dominant_condition          VARCHAR(50),
  -- Productivité
  productive_time_pct         DECIMAL(5,2),  -- navigation / total * 100
  stops_count                 INTEGER,
  -- Qualité données
  gps_coverage_pct            DECIMAL(5,2),
  events_completeness_pct     DECIMAL(5,2),
  calculated_at               TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.16 WeatherRecord (Données météo)

```sql
CREATE TABLE weather_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              UUID REFERENCES assets(id),
  trip_id               UUID REFERENCES trips(id),
  voyage_event_id       UUID REFERENCES voyage_events(id),
  source                VARCHAR(20) NOT NULL,
  -- api_auto | captain_manual | logistician_manual | iot_sensor
  recorded_at           TIMESTAMPTZ NOT NULL,
  latitude              DECIMAL(9,6),
  longitude             DECIMAL(9,6),
  condition             VARCHAR(50),  -- clear | cloudy | rain | storm | fog | harmattan
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
  raw_api_response      JSONB
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_weather_asset ON weather_records(asset_id, recorded_at DESC);
CREATE INDEX idx_weather_trip  ON weather_records(trip_id);
```

### 2.17 IoTDevice

```sql
CREATE TABLE iot_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  device_id       VARCHAR(100) UNIQUE NOT NULL,
  device_type     VARCHAR(50),  -- gps_tracker | ais | mobile_app | acars
  api_key_hash    VARCHAR(200) NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicle_positions (
  id              UUID DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id),
  device_id       VARCHAR(100),
  recorded_at     TIMESTAMPTZ NOT NULL,
  received_at     TIMESTAMPTZ DEFAULT NOW(),
  latitude        DECIMAL(9,6) NOT NULL,
  longitude       DECIMAL(9,6) NOT NULL,
  speed_knots     DECIMAL(6,2),
  heading_deg     DECIMAL(5,2),
  altitude_m      DECIMAL(8,2),
  status          VARCHAR(30),
  fuel_level_pct  SMALLINT,
  trip_id         UUID REFERENCES trips(id),
  custom_data     JSONB,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);
CREATE INDEX idx_vpos_vehicle_time ON vehicle_positions(vehicle_id, recorded_at DESC);
CREATE INDEX idx_vpos_trip         ON vehicle_positions(trip_id, recorded_at DESC);
```

### 2.18 AISyncConfig et SAPExportConfig

```sql
CREATE TABLE intranet_sync_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               UUID NOT NULL REFERENCES entities(id),
  mode                    VARCHAR(20) NOT NULL,  -- api | ldap | csv
  is_active               BOOLEAN DEFAULT TRUE,
  api_base_url            TEXT,
  api_key_encrypted       TEXT,
  api_field_mapping       JSONB,
  ldap_host               VARCHAR(200),
  ldap_port               INTEGER DEFAULT 389,
  ldap_base_dn            TEXT,
  ldap_bind_dn            TEXT,
  ldap_password_encrypted TEXT,
  ldap_filter             VARCHAR(200) DEFAULT '(objectClass=person)',
  ldap_field_mapping      JSONB,
  sync_cron               VARCHAR(50) DEFAULT '0 */4 * * *',
  last_sync_at            TIMESTAMPTZ,
  last_sync_status        VARCHAR(20),
  last_sync_count         INTEGER DEFAULT 0,
  last_sync_errors        JSONB DEFAULT '[]',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sap_export_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  export_type     VARCHAR(50) NOT NULL,
  -- article_catalog | stock_movements | cost_imputations | cargo_returns
  name            VARCHAR(200) NOT NULL,
  column_mapping  JSONB NOT NULL,
  filters         JSONB,
  delimiter       VARCHAR(5) DEFAULT ';',
  encoding        VARCHAR(20) DEFAULT 'UTF-8',
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---


---


## 3. Schémas Pydantic

```python
# app/schemas/travelwiz.py

class TransportMode(str, Enum):
    air  = "air"
    sea  = "sea"
    road = "road"

class TripStatus(str, Enum):
    planned    = "planned"
    confirmed  = "confirmed"
    boarding   = "boarding"
    departed   = "departed"
    arrived    = "arrived"
    completed  = "completed"
    cancelled  = "cancelled"
    delayed    = "delayed"

class ManifestStatus(str, Enum):
    draft               = "draft"
    pending_validation  = "pending_validation"
    validated           = "validated"
    requires_review     = "requires_review"
    closed              = "closed"
    cancelled           = "cancelled"

class ManagementType(str, Enum):
    unit                = "unit"
    bulk_quantity       = "bulk_quantity"
    consumable_volume   = "consumable_volume"
    consumable_discrete = "consumable_discrete"
    package             = "package"
    waste               = "waste"

class CargoItemStatus(str, Enum):
    registered          = "registered"
    ready_for_loading   = "ready_for_loading"
    loaded              = "loaded"
    in_transit          = "in_transit"
    delivered           = "delivered"
    return_declared     = "return_declared"
    return_in_transit   = "return_in_transit"
    returned            = "returned"
    reintegrated        = "reintegrated"
    scrapped            = "scrapped"
    lost                = "lost"

# ─── Vehicle ───────────────────────────────────────────────

class VehicleCreate(BaseModel):
    entity_id:              UUID
    name:                   str = Field(..., min_length=2, max_length=200)
    registration:           Optional[str] = None
    type:                   str = Field(..., min_length=2, max_length=50)
    transport_mode:         TransportMode
    provider_id:            Optional[UUID] = None
    capacity_pax:           int = Field(..., ge=0)
    capacity_weight_kg:     Optional[float] = Field(None, gt=0)
    capacity_volume_m3:     Optional[float] = Field(None, gt=0)
    home_base_asset_id:     Optional[UUID] = None
    ais_mmsi:               Optional[str] = None
    notes:                  Optional[str] = None

class VehicleRead(BaseModel):
    id:                     UUID
    entity_id:              UUID
    name:                   str
    registration:           Optional[str]
    type:                   str
    transport_mode:         TransportMode
    provider_name:          Optional[str]
    capacity_pax:           int
    capacity_weight_kg:     Optional[float]
    capacity_volume_m3:     Optional[float]
    home_base_asset_name:   Optional[str]
    ais_mmsi:               Optional[str]
    active:                 bool
    deck_surfaces:          list["DeckSurfaceRead"]
    current_position:       Optional["VehiclePositionRead"]  # depuis Redis
    active_trip_id:         Optional[UUID]
    class Config: from_attributes = True

# ─── Trip ──────────────────────────────────────────────────

class TripCreate(BaseModel):
    entity_id:              UUID
    vehicle_id:             UUID
    origin_asset_id:        UUID
    destination_asset_id:   UUID
    departure_datetime:     Optional[datetime] = None
    arrival_datetime:       Optional[datetime] = None
    rotation_id:            Optional[UUID] = None
    is_intrafield:          bool = False
    notes:                  Optional[str] = None

    @model_validator(mode='after')
    def validate_trip(self):
        if (self.departure_datetime and self.arrival_datetime and
                self.arrival_datetime <= self.departure_datetime):
            raise ValueError("arrival_datetime doit être postérieure à departure_datetime")
        if self.origin_asset_id == self.destination_asset_id:
            raise ValueError("L'origine et la destination ne peuvent pas être identiques")
        return self

class TripRead(BaseModel):
    id:                     UUID
    entity_id:              UUID
    reference:              str
    vehicle_id:             UUID
    vehicle_name:           str
    vehicle_type:           str
    origin_asset_id:        UUID
    origin_asset_name:      str
    destination_asset_id:   UUID
    destination_asset_name: str
    departure_datetime:     Optional[datetime]
    arrival_datetime:       Optional[datetime]
    actual_departure:       Optional[datetime]
    actual_arrival:         Optional[datetime]
    status:                 TripStatus
    is_intrafield:          bool
    pax_manifest_id:        Optional[UUID]
    cargo_manifest_id:      Optional[UUID]
    pax_count_confirmed:    int   # calculé
    cargo_weight_total:     float # calculé
    access_code:            Optional[str]  # code portail capitaine
    created_at:             datetime
    class Config: from_attributes = True

# ─── Manifeste PAX ─────────────────────────────────────────

class PaxManifestEntryAdd(BaseModel):
    pax_id:     UUID
    ads_pax_id: Optional[UUID] = None
    weight_kg:  Optional[float] = Field(None, gt=0, le=500)
    notes:      Optional[str] = None

class PaxManifestValidateRequest(BaseModel):
    action:  Literal["validate", "reject", "close"]
    comment: Optional[str] = None

    @model_validator(mode='after')
    def comment_if_reject(self):
        if self.action == "reject" and not self.comment:
            raise ValueError("comment obligatoire pour reject")
        return self

class PaxManifestRead(BaseModel):
    id:                   UUID
    entity_id:            UUID
    reference:            str
    trip_id:              UUID
    trip_reference:       str
    status:               ManifestStatus
    generated_from_ads:   bool
    entries:              list["PaxManifestEntryRead"]
    total_pax_confirmed:  int
    total_weight_kg:      float
    capacity_remaining:   int   # vehicle.capacity_pax - confirmed_count
    weight_remaining:     Optional[float]
    validated_by_name:    Optional[str]
    validated_at:         Optional[datetime]
    class Config: from_attributes = True

# ─── Cargo ─────────────────────────────────────────────────

class CargoItemCreate(BaseModel):
    entity_id:              UUID
    external_reference:     Optional[str] = None
    slip_number:            Optional[str] = None
    management_type:        ManagementType
    article_id:             Optional[UUID] = None
    sap_code:               Optional[str] = None
    description:            str = Field(..., min_length=2)
    packaging_type:         Optional[str] = None
    quantity:               float = Field(..., gt=0)
    unit_of_measure:        str = Field(..., min_length=1, max_length=20)
    unit_weight_kg:         Optional[float] = Field(None, gt=0)
    dimensions_l_m:         Optional[float] = None
    dimensions_w_m:         Optional[float] = None
    dimensions_h_m:         Optional[float] = None
    is_hazmat:              bool = False
    hazmat_class:           Optional[str] = None
    is_hazmat_explosive:    bool = False
    sender_name:            str = Field(..., min_length=2)
    recipient_name:         Optional[str] = None
    owner_department:       Optional[str] = None
    cost_imputation_id:     Optional[UUID] = None
    project_id:             Optional[UUID] = None
    origin_asset_id:        UUID
    destination_asset_id:   UUID

    @model_validator(mode='after')
    def validate_cargo(self):
        if self.is_hazmat and not self.hazmat_class:
            raise ValueError("hazmat_class obligatoire si is_hazmat=True")
        if self.is_hazmat_explosive and not self.is_hazmat:
            raise ValueError("is_hazmat doit être True si is_hazmat_explosive=True")
        if self.unit_weight_kg:
            self.total_weight_kg = round(self.quantity * self.unit_weight_kg, 3)
        return self

class CargoReturnRequest(BaseModel):
    return_type:        Literal["waste","contractor_return","stock_reintegration",
                                "scrap","yard_storage"]
    elements_returned:  Optional[list["PackageElementReturn"]] = None
    # Pour packages : liste des éléments retournés
    quantity_returned:  Optional[float] = None
    # Pour bulk_quantity / consumable : quantité retournée
    notes:              Optional[str] = None
    photo_required:     bool = False

class PackageElementReturn(BaseModel):
    element_id:         UUID
    quantity_returned:  float
    return_status:      Literal["fully_returned","partially_returned","consumed","lost"]
    notes:              Optional[str] = None

class SAPMatchRequest(BaseModel):
    description:    str = Field(..., min_length=3)
    packaging_type: Optional[str] = None

class SAPMatchResponse(BaseModel):
    suggestions:    list["SAPSuggestion"]
    query_normalized: str

class SAPSuggestion(BaseModel):
    sap_code:       str
    description_fr: str
    management_type: str
    confidence:     float  # 0-1
    match_method:   str    # tfidf | embedding | exact

# ─── Voyage Events ─────────────────────────────────────────

class VoyageEventCreate(BaseModel):
    trip_id:        UUID
    event_code:     str
    recorded_at:    datetime
    latitude:       Optional[float] = Field(None, ge=-90, le=90)
    longitude:      Optional[float] = Field(None, ge=-180, le=180)
    asset_id:       Optional[UUID] = None
    location_label: Optional[str] = None
    payload:        Optional[dict] = None
    notes:          Optional[str] = None

class VoyageEventRead(BaseModel):
    id:               UUID
    trip_id:          UUID
    event_code:       str
    event_label:      str
    category:         str
    recorded_at:      datetime
    received_at:      datetime
    latitude:         Optional[float]
    longitude:        Optional[float]
    asset_name:       Optional[str]
    location_label:   Optional[str]
    performed_by_name: str
    source:           str
    payload:          Optional[dict]
    offline_sync:     bool
```

---


---


## 4. Service layer

```python
# app/services/travelwiz/manifest_service.py

class ManifestService:

    async def get_or_create_draft_manifest(
        self, trip_id: UUID, entity_id: UUID, db: AsyncSession
    ) -> PaxManifest:
        """
        Retourne le manifeste PAX draft du trip, ou en crée un.
        Appelé par le handler ads.approved.
        """
        existing = await db.query(PaxManifest).filter(
            PaxManifest.trip_id == trip_id,
            PaxManifest.status.notin_(["cancelled"])
        ).first()
        if existing:
            return existing

        reference = await generate_reference("MAN-PAX", db)
        manifest = PaxManifest(
            entity_id=entity_id,
            reference=reference,
            trip_id=trip_id,
            status="draft",
            generated_from_ads=True
        )
        db.add(manifest)
        await db.flush()
        return manifest

    async def add_pax_to_manifest(
        self,
        manifest_id: UUID,
        ads_pax_id: UUID | None,
        pax_id: UUID,
        status: str,
        priority_score: int,
        priority_source: str,
        db: AsyncSession
    ) -> PaxManifestEntry:
        """
        Ajoute un PAX au manifeste. Vérifie la capacité du vecteur.
        Si manifeste validé → status=standby automatiquement.
        """
        manifest = await db.get(PaxManifest, manifest_id)
        if manifest.status == "validated":
            status = "standby"

        # Vérifier capacité si on veut ajouter en confirmed
        if status == "confirmed":
            confirmed_count = await db.scalar(
                select(func.count(PaxManifestEntry.id)).where(
                    PaxManifestEntry.manifest_id == manifest_id,
                    PaxManifestEntry.status == "confirmed"
                )
            )
            vehicle = await db.get(Vehicle, manifest.trip.vehicle_id)
            if confirmed_count >= vehicle.capacity_pax:
                status = "standby"  # auto-déclassement si plus de place

        entry = PaxManifestEntry(
            manifest_id=manifest_id,
            pax_id=pax_id,
            ads_pax_id=ads_pax_id,
            status=status,
            priority_score=priority_score,
            priority_source=priority_source
        )
        db.add(entry)
        await self._recalculate_manifest_totals(manifest_id, db)
        return entry

    async def validate_manifest(
        self, manifest_id: UUID, actor: User, db: AsyncSession
    ) -> PaxManifest:
        """
        Transition draft/pending_validation → validated.
        Vérifie: capacité OK, pas de PAX sans compliance valide.
        """
        manifest = await db.get(PaxManifest, manifest_id)
        entries = await db.query(PaxManifestEntry).filter(
            PaxManifestEntry.manifest_id == manifest_id,
            PaxManifestEntry.status == "confirmed"
        ).all()

        vehicle = await db.get(Vehicle, manifest.trip.vehicle_id)
        if len(entries) > vehicle.capacity_pax:
            raise HTTPException(409, "CAPACITY_EXCEEDED")

        manifest.status = "validated"
        manifest.validated_by = actor.id
        manifest.validated_at = datetime.utcnow()
        await db.commit()
        return manifest

    async def close_manifest(
        self,
        manifest_id: UUID,
        boarded_pax: list[dict],
        no_show_pax: list[dict],
        actor: User,
        db: AsyncSession
    ) -> PaxManifest:
        """
        Clôture le manifeste après le voyage.
        Émet pax_manifest.closed vers PaxLog.
        Déclenche le calcul des KPIs du voyage.
        """
        manifest = await db.get(PaxManifest, manifest_id)

        # Mettre à jour les statuts des entrées
        for pax_entry in boarded_pax:
            entry = await db.query(PaxManifestEntry).filter(
                PaxManifestEntry.manifest_id == manifest_id,
                PaxManifestEntry.pax_id == pax_entry["pax_id"]
            ).first()
            if entry:
                entry.status = "boarded"

        for no_show in no_show_pax:
            entry = await db.query(PaxManifestEntry).filter(
                PaxManifestEntry.manifest_id == manifest_id,
                PaxManifestEntry.pax_id == no_show["pax_id"]
            ).first()
            if entry:
                entry.status = "no_show"

        manifest.status = "closed"
        manifest.closed_at = datetime.utcnow()
        await db.commit()

        # Émettre vers PaxLog
        await event_bus.emit(
            "pax_manifest.closed",
            {
                "manifest_id": str(manifest_id),
                "manifest_reference": manifest.reference,
                "trip_id": str(manifest.trip_id),
                "entity_id": str(manifest.entity_id),
                "boarded_pax": boarded_pax,
                "no_show_pax": no_show_pax,
            },
            db
        )
        # Déclencher calcul KPIs
        await event_bus.emit("trip.closed",
                             {"trip_id": str(manifest.trip_id),
                              "entity_id": str(manifest.entity_id)}, db)
        return manifest


# app/services/travelwiz/cargo_service.py

class CargoService:

    async def register_cargo_item(
        self, data: CargoItemCreate, actor: User, db: AsyncSession
    ) -> CargoItem:
        """
        1. Générer tracking_number (CGO-YYYY-NNNNN)
        2. Si description sans sap_code → lancer matching IA asynchrone
        3. Calculer total_weight_kg
        4. Créer CargoMovement initial (registered)
        5. Audit log
        """
        tracking = await generate_reference("CGO", db)

        item = CargoItem(
            entity_id=data.entity_id,
            tracking_number=tracking,
            external_reference=data.external_reference,
            management_type=data.management_type.value,
            description=data.description,
            quantity=data.quantity,
            unit_of_measure=data.unit_of_measure,
            unit_weight_kg=data.unit_weight_kg,
            total_weight_kg=(data.quantity * data.unit_weight_kg
                             if data.unit_weight_kg else None),
            origin_asset_id=data.origin_asset_id,
            destination_asset_id=data.destination_asset_id,
            current_location_asset_id=data.origin_asset_id,
            sender_name=data.sender_name,
            recipient_name=data.recipient_name,
            is_hazmat=data.is_hazmat,
            hazmat_class=data.hazmat_class,
            is_hazmat_explosive=data.is_hazmat_explosive,
            status="registered",
            sap_code_status="unknown"
        )
        db.add(item)
        await db.flush()

        # Mouvement initial
        await self._create_movement(
            item.id, "registered",
            from_asset=None, to_asset=data.origin_asset_id,
            actor=actor, db=db
        )

        # Lancer matching SAP en arrière-plan si pas de sap_code
        if not data.sap_code:
            await sap_matcher.suggest_async(item.id, data.description, db)

        await db.commit()
        return item

    async def declare_return(
        self, cargo_item_id: UUID, req: CargoReturnRequest,
        actor: User, db: AsyncSession
    ) -> CargoItem:
        """
        Déclaration retour site. Workflow selon return_type:
        - waste: zone dédiée + bordereau spécifique
        - contractor_return: laissez-passer + double signature
        - stock_reintegration: codes SAP obligatoires
        - scrap: mention obligatoire + photos si manquante
        - yard_storage: mention + justification
        """
        item = await db.get(CargoItem, cargo_item_id)

        # Validation selon le return_type
        if req.return_type == "stock_reintegration":
            if not item.sap_code or item.sap_code_status != "confirmed":
                raise HTTPException(
                    400, "SAP_CODE_REQUIRED",
                    detail="Code SAP confirmé obligatoire pour réintégration stock"
                )

        if req.return_type == "scrap":
            # Vérifier que la mention "ferraille" est dans les notes ou la description
            if not item.notes or "rebut" not in item.notes.lower():
                # Déclencher obligation photo
                item.photo_required_stages = json.dumps(
                    ["registration", "loading", "return"]
                )

        # Traiter les éléments pour un package
        if item.management_type == "package" and req.elements_returned:
            for elem_return in req.elements_returned:
                element = await db.get(PackageElement, elem_return.element_id)
                element.quantity_returned = elem_return.quantity_returned
                element.return_status = elem_return.return_status
                element.return_notes = elem_return.notes

        # Traiter quantité pour bulk/consommable
        if req.quantity_returned is not None:
            if req.quantity_returned > item.quantity:
                raise HTTPException(400, "RETURN_EXCEEDS_SENT")

        item.status = "return_declared"
        item.return_type = req.return_type
        await self._create_movement(
            item.id, "return_declared",
            from_asset=item.current_location_asset_id,
            to_asset=None,
            actor=actor, db=db
        )
        await db.commit()
        return item

    async def _create_movement(
        self, cargo_item_id: UUID, movement_type: str,
        from_asset: UUID | None, to_asset: UUID | None,
        actor: User, db: AsyncSession,
        trip_id: UUID | None = None,
        validation_type: str = "click"
    ) -> None:
        """Enregistre un mouvement dans cargo_movements (table immuable)."""
        await db.execute(insert(CargoMovement).values(
            cargo_item_id=cargo_item_id,
            movement_type=movement_type,
            from_asset_id=from_asset,
            to_asset_id=to_asset,
            trip_id=trip_id,
            performed_by=actor.id if actor else None,
            performed_by_name=actor.full_name if actor else "SYSTEM",
            validation_type=validation_type,
            recorded_at=datetime.utcnow()
        ))


# app/services/travelwiz/deck_optimizer.py

class DeckOptimizer:
    """
    Algorithme de bin packing 2D avec contraintes métier.
    Optimise le placement des colis sur les surfaces de deck d'un vecteur.
    """

    LAYOUT_RULES_DEFAULT = {
        "hazmat_isolated": True,
        "explosive_separate": True,
        "heavy_bottom": True,
        "priority_unloading": True,
        "weight_distribution": True,
        "max_surface_load": True,
        "destination_grouping": True
    }

    async def optimize(
        self,
        trip_id: UUID,
        rules: dict | None = None,
        db: AsyncSession = None
    ) -> list[DeckLayout]:
        """
        Lance l'optimisation pour toutes les surfaces du vecteur.
        Retourne les layouts proposés (status=proposed_by_algo).
        """
        trip = await db.get(Trip, trip_id)
        vehicle = await db.get(Vehicle, trip.vehicle_id)
        surfaces = await db.query(DeckSurface).filter(
            DeckSurface.vehicle_id == vehicle.id,
            DeckSurface.active == True
        ).all()

        # Récupérer les colis à placer
        cargo_items = await self._get_cargo_for_trip(trip_id, db)

        effective_rules = {**self.LAYOUT_RULES_DEFAULT, **(rules or {})}
        layouts = []

        for surface in surfaces:
            # Séparer les colis selon les règles
            hazmat_items, explosive_items, normal_items = \
                self._classify_items(cargo_items, effective_rules)

            # Bin packing 2D (First Fit Decreasing par surface occupée)
            placed = self._pack_surface(
                surface=surface,
                items=normal_items,
                hazmat_items=hazmat_items if effective_rules["hazmat_isolated"] else [],
                explosive_items=explosive_items if effective_rules["explosive_separate"] else [],
                rules=effective_rules
            )

            # Créer le DeckLayout et les DeckLayoutItems
            layout = await self._save_layout(
                trip_id=trip_id,
                surface=surface,
                placed_items=placed,
                rules=effective_rules,
                db=db
            )
            layouts.append(layout)

        return layouts

    def _pack_surface(
        self,
        surface: DeckSurface,
        items: list,
        hazmat_items: list,
        explosive_items: list,
        rules: dict
    ) -> list[dict]:
        """
        First Fit Decreasing (FFD) adapté pour rectangles 2D.
        Trie les colis par surface (L×W) décroissante.
        Place chaque colis à la première position disponible.
        Respecte: poids surfacique max, groupement par destination.
        """
        placed = []
        usable_w = surface.width_m
        usable_l = surface.length_m

        # Trier par surface décroissante (plus grands en premier)
        sorted_items = sorted(
            items,
            key=lambda x: (x.dimensions_l_m or 1) * (x.dimensions_w_m or 1),
            reverse=True
        )

        # Guillotine split algorithm simplifié
        free_rectangles = [{"x": 0, "y": 0, "w": usable_w, "l": usable_l}]

        for item in sorted_items:
            item_w = item.dimensions_w_m or 1.0
            item_l = item.dimensions_l_m or 1.0

            best_rect = None
            best_rotation = 0

            for rect in free_rectangles:
                # Essayer sans rotation
                if item_w <= rect["w"] and item_l <= rect["l"]:
                    best_rect = rect
                    best_rotation = 0
                    break
                # Essayer avec rotation 90°
                if item_l <= rect["w"] and item_w <= rect["l"]:
                    best_rect = rect
                    best_rotation = 90
                    break

            if best_rect:
                placed_w = item_w if best_rotation == 0 else item_l
                placed_l = item_l if best_rotation == 0 else item_w
                placed.append({
                    "cargo_item_id": item.id,
                    "x_m": best_rect["x"],
                    "y_m": best_rect["y"],
                    "rotation_deg": best_rotation,
                    "stack_level": 0,
                    "placed_by": "algorithm"
                })
                # Mettre à jour les rectangles libres (guillotine split)
                free_rectangles.remove(best_rect)
                # Rectangle droit
                if best_rect["w"] - placed_w > 0.1:
                    free_rectangles.append({
                        "x": best_rect["x"] + placed_w,
                        "y": best_rect["y"],
                        "w": best_rect["w"] - placed_w,
                        "l": placed_l
                    })
                # Rectangle haut
                if best_rect["l"] - placed_l > 0.1:
                    free_rectangles.append({
                        "x": best_rect["x"],
                        "y": best_rect["y"] + placed_l,
                        "w": best_rect["w"],
                        "l": best_rect["l"] - placed_l
                    })
            # Items non placés → signalés dans le résultat

        return placed


# app/services/travelwiz/kpi_service.py

class KPIService:

    async def calculate_trip_kpis(self, trip_id: UUID, db: AsyncSession) -> TripKPI:
        """
        Calcul complet des KPIs d'un voyage à sa clôture.
        Lit les voyage_events pour calculer les durées par catégorie.
        """
        events = await db.query(VoyageEvent).filter(
            VoyageEvent.trip_id == trip_id
        ).order_by(VoyageEvent.recorded_at).all()

        trip = await db.get(Trip, trip_id)

        # Calculer les durées par catégorie
        durations = self._calculate_durations(events)

        # Calculer la distance (depuis GPS ou calcul haversine)
        positions = await db.query(VehiclePosition).filter(
            VehiclePosition.trip_id == trip_id
        ).order_by(VehiclePosition.recorded_at).all()

        distance_nm, source = self._calculate_distance(positions, trip)

        # PAX
        boarded = await db.scalar(
            select(func.count(PaxManifestEntry.id)).where(
                PaxManifestEntry.manifest_id.in_(
                    select(PaxManifest.id).where(PaxManifest.trip_id == trip_id)
                ),
                PaxManifestEntry.status == "boarded"
            )
        )
        no_shows = await db.scalar(
            select(func.count(PaxManifestEntry.id)).where(
                PaxManifestEntry.manifest_id.in_(
                    select(PaxManifest.id).where(PaxManifest.trip_id == trip_id)
                ),
                PaxManifestEntry.status == "no_show"
            )
        )

        # Météo moyenne
        weather = await db.query(WeatherRecord).filter(
            WeatherRecord.trip_id == trip_id
        ).all()
        avg_wind = (sum(w.wind_speed_knots for w in weather if w.wind_speed_knots) /
                    max(len(weather), 1))
        avg_wave = (sum(w.wave_height_m for w in weather if w.wave_height_m) /
                    max(len(weather), 1))

        total_min = durations.get("total", 0)
        nav_min = durations.get("navigation", 0)
        productive_pct = (nav_min / total_min * 100) if total_min > 0 else 0

        kpi = TripKPI(
            trip_id=trip_id,
            total_duration_min=total_min,
            navigation_time_min=nav_min,
            standby_time_min=durations.get("standby", 0),
            boarding_time_min=durations.get("boarding", 0),
            disembarkation_time_min=durations.get("disembarkation", 0),
            loading_time_min=durations.get("loading", 0),
            unloading_time_min=durations.get("unloading", 0),
            maintenance_time_min=durations.get("maintenance", 0),
            refuelling_time_min=durations.get("refuelling", 0),
            distance_nm=distance_nm,
            distance_km=round(distance_nm * 1.852, 2) if distance_nm else None,
            distance_source=source,
            pax_boarded_count=boarded or 0,
            pax_no_show_count=no_shows or 0,
            avg_wind_knots=round(avg_wind, 2) if avg_wind else None,
            avg_wave_height_m=round(avg_wave, 2) if avg_wave else None,
            productive_time_pct=round(productive_pct, 2),
            calculated_at=datetime.utcnow()
        )
        db.add(kpi)
        await db.commit()
        return kpi

    def _calculate_durations(
        self, events: list[VoyageEvent]
    ) -> dict[str, int]:
        """
        Parse la séquence d'événements pour calculer les durées.
        Ex: BOARDING_START → BOARDING_END = durée embarquement
        """
        durations = {
            "total": 0, "navigation": 0, "standby": 0,
            "boarding": 0, "disembarkation": 0,
            "loading": 0, "unloading": 0,
            "maintenance": 0, "refuelling": 0
        }
        start_times = {}

        START_END_PAIRS = {
            "BOARDING_START": ("BOARDING_END", "boarding"),
            "DISEMBARKATION_START": ("DISEMBARKATION_END", "disembarkation"),
            "CARGO_LOADING_START": ("CARGO_LOADING_END", "loading"),
            "CARGO_UNLOADING_START": ("CARGO_UNLOADING_END", "unloading"),
            "STANDBY": ("STANDBY_END", "standby"),
            "STANDBY_REFUELLING": ("REFUELLING_END", "refuelling"),
            "MAINTENANCE_STOP": ("MAINTENANCE_END", "maintenance"),
            "DEPARTURE": ("ARRIVED_DESTINATION", "navigation"),
        }

        for event in events:
            code = event.event_code
            # Enregistrer les débuts
            for start_code, (end_code, category) in START_END_PAIRS.items():
                if code == start_code:
                    start_times[category] = event.recorded_at
                elif code == end_code and category in start_times:
                    delta = (event.recorded_at - start_times[category]).total_seconds() / 60
                    durations[category] = durations.get(category, 0) + int(delta)
                    del start_times[category]

        # Durée totale depuis DEPARTURE jusqu'à ARRIVED_DESTINATION
        departure = next((e for e in events if e.event_code == "DEPARTURE"), None)
        arrived = next((e for e in events if e.event_code == "ARRIVED_DESTINATION"), None)
        if departure and arrived:
            durations["total"] = int(
                (arrived.recorded_at - departure.recorded_at).total_seconds() / 60
            )

        return durations

    def _calculate_distance(
        self, positions: list[VehiclePosition], trip: Trip
    ) -> tuple[float | None, str]:
        """Distance calculée via haversine sur les positions GPS."""
        if len(positions) >= 2:
            total_nm = 0.0
            for i in range(1, len(positions)):
                total_nm += haversine_nm(
                    positions[i-1].latitude, positions[i-1].longitude,
                    positions[i].latitude, positions[i].longitude
                )
            return round(total_nm, 2), "gps_track"

        # Fallback: distance haversine directe origine→destination
        origin = await get_asset_coordinates(trip.origin_asset_id)
        dest = await get_asset_coordinates(trip.destination_asset_id)
        if origin and dest:
            direct_nm = haversine_nm(
                origin.lat, origin.lon, dest.lat, dest.lon
            )
            return round(direct_nm, 2), "calculated"

        return None, "manual"


def haversine_nm(lat1, lon1, lat2, lon2) -> float:
    """Calcule la distance en milles nautiques entre deux points GPS."""
    import math
    R = 3440.065  # Rayon Terre en miles nautiques
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon/2)**2)
    return R * 2 * math.asin(math.sqrt(a))


# app/services/travelwiz/weather_service.py

class WeatherService:

    async def fetch_for_trip(self, trip_id: UUID, db: AsyncSession) -> WeatherRecord | None:
        """Fetch météo depuis l'API configurée pour la position actuelle du vecteur."""
        trip = await db.get(Trip, trip_id)

        # Obtenir la position actuelle depuis Redis
        pos_data = await redis.get(f"vehicle:position:{trip.vehicle_id}")
        if not pos_data:
            return None

        pos = json.loads(pos_data)
        return await self._fetch_from_api(
            lat=pos["lat"], lon=pos["lon"],
            trip_id=trip_id, db=db
        )

    async def _fetch_from_api(
        self, lat: float, lon: float,
        trip_id: UUID, db: AsyncSession,
        asset_id: UUID | None = None
    ) -> WeatherRecord:
        provider = settings.WEATHER_PROVIDER

        if provider == "open_meteo":
            # API gratuite — pas de clé requise
            url = (f"https://api.open-meteo.com/v1/forecast"
                   f"?latitude={lat}&longitude={lon}"
                   f"&current=wind_speed_10m,wind_direction_10m,"
                   f"temperature_2m,precipitation,cloud_cover"
                   f"&hourly=wave_height,swell_wave_height"
                   f"&wind_speed_unit=kn")
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=10)
                data = resp.json()

            current = data.get("current", {})
            record = WeatherRecord(
                trip_id=trip_id,
                asset_id=asset_id,
                source="api_auto",
                recorded_at=datetime.utcnow(),
                latitude=lat,
                longitude=lon,
                wind_speed_knots=current.get("wind_speed_10m"),
                wind_direction_deg=current.get("wind_direction_10m"),
                air_temp_c=current.get("temperature_2m"),
                raw_api_response=data
            )

        elif provider == "stormglass":
            # API spécialisée maritime
            url = f"https://api.stormglass.io/v2/weather/point"
            params = {"lat": lat, "lng": lon,
                      "params": "waveHeight,wavePeriod,swellDirection,"
                                "windSpeed,windDirection,airTemperature"}
            headers = {"Authorization": settings.WEATHER_API_KEY}
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, headers=headers, timeout=10)
                data = resp.json()

            hours = data.get("hours", [{}])
            current = hours[0] if hours else {}
            record = WeatherRecord(
                trip_id=trip_id,
                source="api_auto",
                recorded_at=datetime.utcnow(),
                latitude=lat, longitude=lon,
                wave_height_m=current.get("waveHeight", {}).get("sg"),
                wave_period_s=current.get("wavePeriod", {}).get("sg"),
                swell_direction_deg=current.get("swellDirection", {}).get("sg"),
                wind_speed_knots=current.get("windSpeed", {}).get("sg"),
                wind_direction_deg=current.get("windDirection", {}).get("sg"),
                air_temp_c=current.get("airTemperature", {}).get("sg"),
                raw_api_response=data
            )

        db.add(record)
        await db.flush()
        return record
```

---


---


## 5. API endpoints

### 5.1 Vecteurs

```
POST   /api/v1/travelwiz/vehicles
  Body: VehicleCreate
  Response 201: VehicleRead
  Droits: TRANSP_COORD | DO

GET    /api/v1/travelwiz/vehicles
  Query: entity_id, type, transport_mode, active, provider_id, page, per_page
  Response 200: PaginatedResponse[VehicleRead]

GET    /api/v1/travelwiz/vehicles/:id
  Response 200: VehicleRead (avec position courante depuis Redis)

PATCH  /api/v1/travelwiz/vehicles/:id
  Body: VehicleUpdate
  Response 200: VehicleRead
  Droits: TRANSP_COORD | DO

GET    /api/v1/travelwiz/vehicles/:id/schedule
  Query: start_date, end_date
  Response 200: list[TripSummary]  -- planning du vecteur sur la période

GET    /api/v1/travelwiz/vehicles/live
  Query: entity_id
  Response 200: list[VehicleLiveStatus]
  Note: données depuis Redis uniquement (< 10ms), pas de DB
  VehicleLiveStatus: {vehicle_id, name, type, lat, lon, speed, heading,
                      status, stale, trip_id, pax_onboard, eta}

# Surfaces de deck
GET    /api/v1/travelwiz/vehicles/:id/deck-surfaces
  Response 200: list[DeckSurfaceRead]

POST   /api/v1/travelwiz/vehicles/:id/deck-surfaces
  Body: DeckSurfaceCreate
  Response 201: DeckSurfaceRead
  Droits: TRANSP_COORD | LOG_COORD | DO
```

### 5.2 Rotations périodiques

```
GET    /api/v1/travelwiz/rotations
  Query: entity_id, vehicle_id, status, origin_asset_id, destination_asset_id
  Response 200: list[RotationRead]

POST   /api/v1/travelwiz/rotations
  Body: RotationCreate
  Response 201: RotationRead
  Droits: TRANSP_COORD
  Validation: recurrence_rule doit être un RRule valide

POST   /api/v1/travelwiz/rotations/:id/validate
  Droits: LOG_COORD | DO
  Response 200: RotationRead
  Effets: génère automatiquement les Trips planned sur les 30 prochains jours

PATCH  /api/v1/travelwiz/rotations/:id/suspend
  Body: { reason: str }
  Response 200: RotationRead
  Effets: les Trips futurs planned → cancelled avec notification LOG_COORD

GET    /api/v1/travelwiz/rotations/:id/generated-trips
  Query: from_date, to_date
  Response 200: list[TripSummary]
```

### 5.3 Voyages

```
POST   /api/v1/travelwiz/trips
  Body: TripCreate
  Response 201: TripRead
  Droits: LOG_COORD | TRANSP_COORD | DO

GET    /api/v1/travelwiz/trips
  Query: entity_id, vehicle_id, status, destination_asset_id,
         departure_from, departure_to, is_intrafield, page, per_page
  Response 200: PaginatedResponse[TripRead]

GET    /api/v1/travelwiz/trips/:id
  Response 200: TripRead (avec manifestes associés)

PATCH  /api/v1/travelwiz/trips/:id
  Body: TripUpdate
  Response 200: TripRead
  Note: modification departure_datetime → recalcule ETA + notifie PAX embarqués

PATCH  /api/v1/travelwiz/trips/:id/status
  Body: { status: TripStatus, reason?: str }
  Response 200: TripRead
  Transitions autorisées:
    planned → confirmed : LOG_COORD
    confirmed → boarding : LOG_COORD | TRANSP_COORD
    boarding → departed  : LOG_COORD | capitaine (portail)
    departed → arrived   : LOG_COORD | capitaine (portail)
    arrived → completed  : LOG_COORD
    * → cancelled        : LOG_COORD | DO (reason obligatoire)
    * → delayed          : LOG_COORD

POST   /api/v1/travelwiz/trips/:id/captain-code
  Response 201: { access_code: str, qr_code_url: str, expires_at: datetime }
  Droits: LOG_COORD | TRANSP_COORD
  Note: génère le code 6 chiffres pour le portail capitaine

GET    /api/v1/travelwiz/trips/:id/timeline
  Response 200: list[VoyageEventRead]  -- journal de bord chronologique

GET    /api/v1/travelwiz/trips/:id/kpis
  Response 200: TripKPIRead | null
  Note: null si trip pas encore clôturé
```

### 5.4 Manifestes PAX

```
GET    /api/v1/travelwiz/pax-manifests
  Query: entity_id, trip_id, status, page, per_page
  Response 200: PaginatedResponse[PaxManifestRead]

GET    /api/v1/travelwiz/pax-manifests/:id
  Response 200: PaxManifestRead (avec toutes les entrées, triées par priority_score DESC)

POST   /api/v1/travelwiz/pax-manifests/:id/entries
  Body: PaxManifestEntryAdd
  Response 201: PaxManifestEntryRead
  Droits: LOG_COORD | DO
  Note: ajout manuel — added_manually=True

DELETE /api/v1/travelwiz/pax-manifests/:id/entries/:entry_id
  Body: { reason: str }
  Response 200: { cancelled: true }
  Note: soft delete — status=cancelled

PATCH  /api/v1/travelwiz/pax-manifests/:id/entries/:entry_id
  Body: { status?: str, weight_kg?: float, boarding_order?: int, notes?: str }
  Response 200: PaxManifestEntryRead

POST   /api/v1/travelwiz/pax-manifests/:id/validate
  Body: PaxManifestValidateRequest { action: "validate" }
  Droits: LOG_COORD | DO
  Response 200: PaxManifestRead
  Erreurs:
    409 CAPACITY_EXCEEDED
    409 MANIFEST_EMPTY

POST   /api/v1/travelwiz/pax-manifests/:id/close
  Body: { boarded_pax: [{pax_id, ads_pax_id}],
          no_show_pax: [{pax_id, ads_pax_id, reason}] }
  Droits: LOG_COORD | DO
  Response 200: PaxManifestRead
  Effets: émet pax_manifest.closed → PaxLog, émet trip.closed → KPIs

GET    /api/v1/travelwiz/pax-manifests/:id/export
  Query: format=pdf
  Response: application/pdf
  Note: PDF terrain via WeasyPrint (format fixe, non éditable)
```

### 5.5 Cargo — Colis

```
POST   /api/v1/travelwiz/cargo-items
  Body: CargoItemCreate
  Response 201: CargoItemRead (avec tracking_number généré)
  Note: lancement matching SAP en arrière-plan si pas de sap_code

GET    /api/v1/travelwiz/cargo-items
  Query: entity_id, status, management_type, origin_asset_id,
         destination_asset_id, sap_code, q (recherche description),
         page, per_page
  Response 200: PaginatedResponse[CargoItemRead]

GET    /api/v1/travelwiz/cargo-items/:id
  Response 200: CargoItemRead

GET    /api/v1/travelwiz/cargo-items/:id/history
  Response 200: list[CargoMovementRead]  -- timeline complète

POST   /api/v1/travelwiz/cargo-items/:id/move
  Body: { movement_type: str, from_asset_id?: UUID, to_asset_id?: UUID,
          trip_id?: UUID, validation_type?: str, photo_url?: str, notes?: str }
  Response 200: CargoItemRead
  Note: enregistre un mouvement + met à jour current_location_asset_id

POST   /api/v1/travelwiz/cargo-items/:id/return
  Body: CargoReturnRequest
  Response 200: CargoItemRead

POST   /api/v1/travelwiz/cargo-items/:id/photos
  Body: multipart/form-data { file: File, stage: str }
  Response 200: { photo_url: str }

POST   /api/v1/travelwiz/cargo-items/:id/sap-confirm
  Body: { sap_code: str, confirmed: bool }
  Response 200: CargoItemRead
  Note: si confirmed=True → sap_code_status=confirmed + enrichit article_catalog
        si confirmed=False → sap_code_status=unknown, suggestion rejetée

POST   /api/v1/travelwiz/cargo-items/sap-match
  Body: SAPMatchRequest
  Response 200: SAPMatchResponse
  Note: endpoint synchrone pour matching IA à la demande

# Éléments d'un package
GET    /api/v1/travelwiz/cargo-items/:id/elements
  Response 200: list[PackageElementRead]

POST   /api/v1/travelwiz/cargo-items/:id/elements
  Body: PackageElementCreate
  Response 201: PackageElementRead

PATCH  /api/v1/travelwiz/cargo-items/:id/elements/:eid
  Body: PackageElementUpdate (pour retour : quantity_returned, return_status)
  Response 200: PackageElementRead
```

### 5.6 Cargo — Manifestes

```
GET    /api/v1/travelwiz/cargo-manifests
  Query: entity_id, trip_id, status, has_hazmat, page, per_page
  Response 200: PaginatedResponse[CargoManifestRead]

POST   /api/v1/travelwiz/cargo-manifests
  Body: { trip_id, entity_id, notes? }
  Response 201: CargoManifestRead

POST   /api/v1/travelwiz/cargo-manifests/:id/entries
  Body: { cargo_item_id: UUID }
  Response 201: CargoManifestEntryRead
  Validation: colis doit être en statut ready_for_loading ou registered

DELETE /api/v1/travelwiz/cargo-manifests/:id/entries/:entry_id
  Response 200: { removed: true }

POST   /api/v1/travelwiz/cargo-manifests/:id/validate
  Droits: LOG_COORD | DO (+ validation HSE supplémentaire si has_hazmat=True)
  Response 200: CargoManifestRead

GET    /api/v1/travelwiz/cargo-manifests/:id/export
  Query: format=pdf|csv
  Response: application/pdf ou text/csv
```

### 5.7 Organisation de deck

```
GET    /api/v1/travelwiz/trips/:id/deck-layout
  Response 200: list[DeckLayoutRead]  -- un layout par surface

POST   /api/v1/travelwiz/trips/:id/deck-layout/optimize
  Body: { rules?: dict }  -- surcharge des règles par défaut
  Response 200: list[DeckLayoutRead]  -- status=proposed_by_algo
  Note: recalcul synchrone (< 2s pour 50 colis)

PATCH  /api/v1/travelwiz/trips/:id/deck-layout/:surface_id
  Body: { items: [{cargo_item_id, x_m, y_m, rotation_deg, stack_level}] }
  Response 200: DeckLayoutRead
  Note: mise à jour manuelle (drag & drop frontend)

POST   /api/v1/travelwiz/trips/:id/deck-layout/:surface_id/validate
  Response 200: DeckLayoutRead  -- status=validated
  Droits: LOG_COORD | DO
```

### 5.8 Événements voyage (Journal de bord)

```
GET    /api/v1/travelwiz/trips/:id/events
  Response 200: list[VoyageEventRead]

POST   /api/v1/travelwiz/trips/:id/events
  Body: VoyageEventCreate
  Response 201: VoyageEventRead
  Droits: LOG_COORD | capitaine via portail | TRANSP_COORD
  Validation: event_code doit exister dans voyage_event_types
              les prerequisites doivent être satisfaits

GET    /api/v1/travelwiz/trips/:id/events/next-allowed
  Response 200: list[VoyageEventTypeRead]
  Note: retourne uniquement les événements contextuellement valides
        (selon statut actuel du voyage + dernier événement enregistré)

# Portail capitaine (auth par access_code)
GET    /api/captain/:code/trip
  Response 200: TripCaptainView (manifeste + événements + météo)

POST   /api/captain/:code/events
  Body: VoyageEventCreate
  Response 201: VoyageEventRead
  Note: source=captain_portal, offline_sync possible

POST   /api/captain/:code/pax/:pax_id/board
  Response 200: { boarded: true }

POST   /api/captain/:code/pax/:pax_id/disembark
  Body: { disembark_asset_id: UUID }
  Response 200: { disembarked: true }
```

### 5.9 Météo

```
GET    /api/v1/travelwiz/weather/:asset_id
  Response 200: WeatherRecord | null  -- dernière météo pour cet asset

POST   /api/v1/travelwiz/weather/manual
  Body: { trip_id?, asset_id?, condition, wind_speed_knots, wave_height_m, ... }
  Response 201: WeatherRecord
  Note: saisie manuelle (capitaine ou logisticien)

POST   /api/v1/travelwiz/weather/fetch/:trip_id
  Response 200: WeatherRecord
  Note: force un fetch API pour la position actuelle du vecteur
```

### 5.10 Analytics et KPIs

```
GET    /api/v1/travelwiz/analytics/fleet
  Query: entity_id, vehicle_id?, start_date, end_date
  Response 200: FleetKPIReport
  -- {total_trips, total_pax, total_distance_nm, avg_productive_pct,
  --   no_show_rate, on_time_rate, by_vehicle: [...]}

GET    /api/v1/travelwiz/analytics/route
  Query: entity_id, origin_asset_id, destination_asset_id, period_months=6
  Response 200: RouteAnalysis
  -- {avg_duration_min, variability, weather_impact, incident_count,
  --   best_departure_window, recommended_vehicle}

GET    /api/v1/travelwiz/analytics/cargo
  Query: entity_id, start_date, end_date
  Response 200: CargoKPIReport

GET    /api/v1/travelwiz/trips/:id/kpis
  Response 200: TripKPIRead

# Export CSV pour SAP
GET    /api/v1/travelwiz/export/sap/:config_id
  Query: start_date, end_date, format=csv
  Response: text/csv
```

### 5.11 IoT

```
POST   /api/v1/iot/vehicle-position
  Header: X-Device-API-Key: {api_key}
  Body: VehiclePositionPayload
  Response 200: { received: true }
  Note: endpoint public (auth par clé API device, pas JWT)

GET    /api/v1/iot/stream
  Header: Authorization: Bearer {jwt}
  Query: vehicle_ids=uuid1,uuid2,...,  entity_id
  Accept: text/event-stream
  Response: SSE stream des positions en temps réel

GET    /api/v1/travelwiz/geo/assets
  Query: entity_id, type?, has_coordinates=true
  Response 200: list[AssetGeoRead]  -- avec lat/lon (GeoJSON compatible)

GET    /api/v1/travelwiz/geo/vehicles/live
  Query: entity_id
  Response 200: GeoJSON FeatureCollection
  Note: depuis Redis uniquement

PATCH  /api/v1/travelwiz/geo/assets/:id
  Body: { latitude: float, longitude: float, boundary?: GeoJSON? }
  Response 200: AssetGeoRead
  Droits: PAX_ADMIN | DO
```

---


---


## 6. Règles de validation exhaustives

| Règle | Condition | Erreur |
|---|---|---|
| R-TRV-01 | origine ≠ destination sur un Trip | `400 SAME_ORIGIN_DESTINATION` |
| R-TRV-02 | arrival_datetime > departure_datetime | `400 INVALID_TRIP_DATES` |
| R-TRV-03 | PAX ajouté > capacity_pax vecteur → standby auto | auto-déclassement |
| R-TRV-04 | Manifeste validé ne peut plus recevoir de confirmed | entrée en standby |
| R-TRV-05 | Cargo hazmat → hazmat_class obligatoire | `400 HAZMAT_CLASS_REQUIRED` |
| R-TRV-06 | Cargo explosive → is_hazmat doit être True | `400 EXPLOSIVE_REQUIRES_HAZMAT` |
| R-TRV-07 | Retour stock_reintegration → SAP code confirmed obligatoire | `400 SAP_CODE_REQUIRED` |
| R-TRV-08 | quantity_returned > quantity_sent | `400 RETURN_EXCEEDS_SENT` |
| R-TRV-09 | Code capitaine → access_code expiré ou révoqué | `401 LINK_EXPIRED` |
| R-TRV-10 | Clôture manifeste → tous PAX doivent être boarded ou no_show | `409 UNCHECKED_PAX` |
| R-TRV-11 | Validation rotation → recurrence_rule invalide (RRule) | `400 INVALID_RRULE` |
| R-TRV-12 | DeckLayout → poids total > surface.max_weight_kg | `409 DECK_OVERWEIGHT` |
| R-TRV-13 | Événement voyage → prerequisite non satisfait | `409 PREREQUISITE_NOT_MET` |
| R-TRV-14 | Cargo hazmat explosive → zone séparée obligatoire (algo deck) | alerte dans layout |
| R-TRV-15 | Manifeste cargo hazmat → validation HSE supplémentaire | workflow enrichi |

---


---


## 7. Rapports TravelWiz (D-C14)

### 7.1 Rapports formels (Report Editor core)

Templates prédéfinis dans le Report Editor core :

| Rapport | Template | Déclencheur | Format |
|---|---|---|---|
| Manifeste PAX officiel | `travelwiz/manifeste_pax_v1` | Validation manifeste | PDF/Word |
| Manifeste cargo officiel | `travelwiz/manifeste_cargo_v1` | Validation manifeste cargo | PDF/Word |
| Rapport de déchargement | `travelwiz/rapport_dechargement_v1` | Clôture voyage | PDF |
| Rapport mensuel flotte | `travelwiz/rapport_flotte_mensuel_v1` | Batch mensuel | PDF/Word |
| Rapport retour site | `travelwiz/rapport_back_cargo_v1` | Manuel | PDF |

### 7.2 Exports terrain (WeasyPrint — format fixe)

```python
# app/services/travelwiz/pdf_export.py

from weasyprint import HTML
from jinja2 import Environment, FileSystemLoader

template_env = Environment(
    loader=FileSystemLoader(settings.MANIFEST_PDF_TEMPLATE_DIR)
)

async def export_pax_manifest_pdf(
    manifest_id: UUID, db: AsyncSession
) -> bytes:
    """
    Manifeste PAX terrain — format fixe, impression directe.
    Template: templates/pdf/pax_manifest_print.html
    """
    manifest = await db.get(PaxManifest, manifest_id)
    entries = sorted(
        manifest.entries,
        key=lambda e: (e.priority_score or 0),
        reverse=True
    )
    template = template_env.get_template("pax_manifest_print.html")
    html_content = template.render(
        manifest=manifest,
        entries=entries,
        trip=manifest.trip,
        vehicle=manifest.trip.vehicle,
        generated_at=datetime.utcnow()
    )
    return HTML(string=html_content).write_pdf()

async def export_voyage_journal_pdf(trip_id: UUID, db: AsyncSession) -> bytes:
    """Journal de bord du voyage — timeline complète des événements."""
    events = await db.query(VoyageEvent).filter(
        VoyageEvent.trip_id == trip_id
    ).order_by(VoyageEvent.recorded_at).all()
    kpis = await db.query(TripKPI).filter(
        TripKPI.trip_id == trip_id
    ).first()

    template = template_env.get_template("voyage_journal.html")
    html_content = template.render(
        trip=await db.get(Trip, trip_id),
        events=events,
        kpis=kpis,
        generated_at=datetime.utcnow()
    )
    return HTML(string=html_content).write_pdf()

async def export_cargo_item_label_pdf(
    cargo_item_id: UUID, db: AsyncSession
) -> bytes:
    """
    Étiquette colis avec QR code du tracking_number.
    Format A6 (étiquette imprimable).
    """
    import qrcode
    import io

    item = await db.get(CargoItem, cargo_item_id)
    # Générer QR code
    qr = qrcode.make(item.tracking_number)
    qr_buffer = io.BytesIO()
    qr.save(qr_buffer, format='PNG')
    qr_b64 = base64.b64encode(qr_buffer.getvalue()).decode()

    template = template_env.get_template("cargo_label.html")
    html_content = template.render(item=item, qr_b64=qr_b64)
    return HTML(string=html_content).write_pdf(
        presentational_hints=True,
        stylesheets=["templates/pdf/label.css"]
    )

# Règle de décision (D-C14) :
# Rapport officiel / diffusé / archivé / signé  →  Report Editor core
# Export terrain / temps réel / format fixe     →  WeasyPrint ici
```

---


---


## 8. Back cargo — Workflows par type de retour

```python
# app/services/travelwiz/back_cargo_service.py

class BackCargoWorkflowService:

    RETURN_WORKFLOWS = {
        "waste": {
            "required_fields": ["return_type"],
            "required_signature_roles": ["LOG_COORD"],
            "storage_zone": "waste_area",
            "mandatory_marking": True,  # marquage site/rig de provenance
            "generate_label": True,
        },
        "contractor_return": {
            "required_fields": ["return_type", "contractor_representative"],
            "required_signature_roles": ["LOG_COORD", "EXT_SUPV"],
            "requires_laissez_passer": True,
            "requires_inventory": True,
        },
        "stock_reintegration": {
            "required_fields": ["return_type"],
            "requires_sap_code": True,  # SAP code confirmed obligatoire
            "required_signature_roles": ["LOG_COORD"],
            "requires_reintegration_form": True,
        },
        "scrap": {
            "required_fields": ["return_type"],
            "required_mention": "ferraille",  # mention dans notes obligatoire
            "requires_photo_if_mention_missing": True,
            "storage_zone": "scrap_area",
            "required_signature_roles": ["LOG_COORD"],
            "requires_qhse_if_hazmat": True,
        },
        "yard_storage": {
            "required_fields": ["return_type", "storage_justification"],
            "required_mention": "stockage Yard",
            "storage_zone": "yard_storage",
            "required_signature_roles": ["LOG_COORD"],
        }
    }

    async def validate_return_prerequisites(
        self, item: CargoItem, req: CargoReturnRequest, db: AsyncSession
    ) -> list[str]:
        """
        Vérifie que toutes les conditions sont remplies pour ce type de retour.
        Retourne la liste des erreurs (vide = OK).
        """
        errors = []
        workflow = self.RETURN_WORKFLOWS.get(req.return_type, {})

        if workflow.get("requires_sap_code"):
            if not item.sap_code or item.sap_code_status != "confirmed":
                errors.append("Code SAP confirmé obligatoire pour réintégration stock")

        if workflow.get("required_mention"):
            mention = workflow["required_mention"]
            if not item.notes or mention.lower() not in item.notes.lower():
                if workflow.get("requires_photo_if_mention_missing"):
                    # Autoriser mais déclencher obligation photo
                    item.photo_required_stages = json.dumps(
                        ["return", "loading"]
                    )
                    # Pas une erreur bloquante mais une exigence photo
                else:
                    errors.append(
                        f"La mention '{mention}' est obligatoire dans les notes du colis"
                    )

        if workflow.get("requires_inventory") and item.management_type == "package":
            if not req.elements_returned:
                errors.append(
                    "Inventaire des éléments obligatoire pour retour sous-traitant"
                )

        return errors
```

---


---


## 9. Événements émis

| Événement | Déclencheur | Payload clé |
|---|---|---|
| `trip.created` | POST /trips | `{trip_id, reference, vehicle_id, destination_asset_id}` |
| `trip.status_changed` | PATCH /trips/:id/status | `{trip_id, old_status, new_status}` |
| `trip.closed` | close manifest | `{trip_id, entity_id}` → calcul KPIs |
| `pax_manifest.validated` | POST /validate | `{manifest_id, trip_id, pax_count}` |
| `pax_manifest.closed` | POST /close | `{manifest_id, boarded_pax, no_show_pax}` → PaxLog |
| `cargo_item.registered` | POST /cargo-items | `{tracking_number, management_type}` |
| `cargo_item.status_changed` | POST /move | `{cargo_item_id, old_status, new_status}` |
| `vehicle.signal_lost` | IoT monitor batch | `{vehicle_id, trip_id, last_signal}` |
| `rotation.trip_generated` | Batch rotation | `{rotation_id, trip_id, date}` |

---


---


## 10. Voyages multi-escales


### Concept

Un vecteur peut desservir plusieurs destinations en une seule sortie :
Wouri Jetty → Munja → ESF1 → RDRW. Chaque escale est un arrêt où des PAX
embarquent ou débarquent.

### Modèle de données

```sql
-- Ajout sur la table trips
ALTER TABLE trips ADD COLUMN is_multistop BOOLEAN NOT NULL DEFAULT FALSE;

-- Escales d'un voyage multi-escales
CREATE TABLE trip_stops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES trips(id),
  stop_order        SMALLINT NOT NULL,          -- 1, 2, 3...
  asset_id          UUID NOT NULL REFERENCES assets(id),
  stop_type         VARCHAR(20) NOT NULL
    CHECK (stop_type IN ('origin','intermediate','final')),
  scheduled_arrival TIMESTAMPTZ,
  scheduled_departure TIMESTAMPTZ,
  actual_arrival    TIMESTAMPTZ,
  actual_departure  TIMESTAMPTZ,
  pax_embarking     INTEGER DEFAULT 0,   -- PAX montant à cette escale
  pax_disembarking  INTEGER DEFAULT 0,   -- PAX descendant à cette escale
  UNIQUE (trip_id, stop_order)
);

-- Destination par PAX dans le manifeste
ALTER TABLE pax_manifest_entries
  ADD COLUMN disembarkation_stop_id UUID REFERENCES trip_stops(id);
-- null = voyage complet jusqu'au terminus
```

### Manifeste global avec destination par PAX

Le manifeste PAX est **unique** pour tout le voyage. Chaque entrée précise
l'escale de débarquement du PAX.

Vue du manifeste multi-escales :
```
MAN-PAX-2026-05412 — HERA P — Wouri → Munja → ESF1 → RDRW

[Photo] Jean DUPONT      → RDRW      confirmed
[Photo] Amadou NZIE      → Munja     confirmed
[Photo] Marie EKWALLA    → ESF1      confirmed
[Photo] Paul MBALLA      → Munja     confirmed
[Photo] 3 PAX visiteurs  → ESF1      confirmed

Récapitulatif par escale :
  Munja  : 2 PAX descendent (Amadou NZIE, Paul MBALLA)
  ESF1   : 4 PAX descendent (Marie EKWALLA + 3 visiteurs)
  RDRW   : 1 PAX descend (Jean DUPONT)
```

Le capitaine (portail) voit les PAX à pointer par escale. Le journal de bord
enregistre un événement `STOPOVER` + `DISEMBARKATION_START/END` à chaque escale.

---


---


## 11. Urgences et pannes


### Déclenchement

Le capitaine déclare un incident `INCIDENT` dans le journal de bord depuis
son portail avec `severity = 'critical'` et `type = 'breakdown'` ou `'medical_emergency'`.

### Effets immédiats automatiques

1. Alerte push/SMS instantanée vers : LOG_BASE, CDS(s) des destinations, DO
2. Le voyage passe en statut `emergency`
3. Un ticket `emergency_case` est créé avec un numéro de référence

```sql
CREATE TABLE emergency_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  reference       VARCHAR(50) UNIQUE NOT NULL,  -- EMR-2026-00012
  trip_id         UUID NOT NULL REFERENCES trips(id),
  emergency_type  VARCHAR(30) NOT NULL
    CHECK (emergency_type IN (
      'breakdown','medical_emergency','weather_diversion',
      'security_incident','man_overboard'
    )),
  declared_by     UUID REFERENCES users(id),  -- null si via portail capitaine
  declared_at     TIMESTAMPTZ DEFAULT NOW(),
  description     TEXT NOT NULL,
  pax_at_risk     INTEGER,  -- nombre de PAX à bord au moment de l'incident
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','resolved','closed')),
  resolution_notes TEXT,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  actions         JSONB DEFAULT '[]'
  -- [{actor, action, timestamp, note}] — log de toutes les actions prises
);
```

### Workflow d'évacuation

Le LOG_BASE prend en charge depuis le dashboard d'urgence :
1. **Identifier les PAX à bord** (depuis le manifeste du voyage)
2. **Déclarer un vecteur de substitution** (autre navire disponible)
3. **Créer un voyage d'évacuation** avec les PAX du voyage en panne
4. **Notifier les destinataires et familles** (via contacts d'urgence si renseignés)
5. **Clôturer l'urgence** avec notes de résolution

Le DO reçoit une notification push et peut suivre l'urgence en temps réel.

---


---


## 12. Prolongation de séjour


### Processus

Un PAX a une AdS approuvée du 10 au 20 mai. Il doit rester jusqu'au 25 mai.

**Deux options selon le contexte :**

**Option A — Prolongation directe (même site, même activité) :**
Le demandeur ouvre l'AdS existante → "Prolonger le séjour".
- Il saisit la nouvelle date de fin
- Une nouvelle vérification de compliance est effectuée
- Le système vérifie que la capacité site est disponible sur la période ajoutée
- Si OK → l'AdS existante est modifiée, son historique est conservé
- Si dépassement capacité → arbitrage DO

**Option B — Nouvelle AdS (activité différente ou demande par un autre) :**
Création d'une nouvelle AdS standard pour la période complémentaire.
L'ancienne AdS est clôturée à sa date de fin initiale.

```sql
ALTER TABLE ads
  ADD COLUMN extended_from_ads_id UUID REFERENCES ads(id),
  ADD COLUMN is_extension BOOLEAN NOT NULL DEFAULT FALSE;
-- Traçabilité : cette AdS est une prolongation de l'AdS parente
```

**Règle :** On ne modifie jamais la date de fin d'une AdS `completed`.
Une AdS dont la date de fin est passée est `completed` — on ne peut que créer
une nouvelle AdS ou une extension.

---


---


## 13. Perte de certification en cours de séjour en cours de séjour


Quand une certification expire pour un PAX actuellement sur site (`AdS.status = 'in_progress'`) :

1. **Alerte automatique** (batch quotidien + temps réel pour les expirations du jour) :
   - Notification au CDS du site
   - Notification au CHSE
   - Notification au demandeur de l'AdS

2. **L'AdS reste techniquement valide** (le PAX était conforme au moment de l'approbation)

3. **Le CDS décide** via le dashboard :
   - Autoriser le PAX à terminer son séjour (décision tracée dans audit log)
   - Déclencher un retour anticipé
   - Exiger le renouvellement avant de laisser repartir (ex: BOSIET expiré → pas d'évacuation hélico possible → le PAX est bloqué sur site jusqu'à renouvellement ou évacuation bateau)

4. **La prochaine AdS du PAX** sera automatiquement bloquée pour cette certification
   même si la précédente est en `completed`.


---


---


## 14. Ramassage terrestre


> Le ramassage est le premier tronçon du voyage : transport terrestre du domicile/hôtel
> du PAX vers le point d'embarquement (jetty, base, aéroport). Il fait partie intégrante
> de la logistique TravelWiz.
>
> Le point de ramassage est **déclaré dans l'AdS PaxLog** (préférence du PAX),
> puis **consommé par TravelWiz** pour construire et gérer les circuits terrain.

### Configuration par vecteur

```sql
ALTER TABLE vehicles
  ADD COLUMN requires_pickup BOOLEAN NOT NULL DEFAULT FALSE;
-- TRUE  : tous les voyages sur ce vecteur déclenchent le workflow ramassage
-- FALSE : pas de ramassage par défaut (demande exceptionnelle possible)
```

**Exemples :**
- Navire HERA P — départ Wouri Jetty → `requires_pickup = true`
- Hélico Dolphin 1 — départ base Perenco → `requires_pickup = false`
- Vol commercial → `requires_pickup = false`

### Saisie du point de ramassage dans l'AdS

Le champ apparaît dans le formulaire AdS uniquement si le vecteur a `requires_pickup = true`
ou si le demandeur coche "Je demande un ramassage" (demande exceptionnelle).

**Trois modes de saisie :**
1. **Point habituel** : pré-rempli depuis l'historique (`pax_pickup_history`)
2. **Adresse** : géocodée via Nominatim (OpenStreetMap) ou Google Geocoding API
3. **Géo-picker** : carte interactive avec drag du marqueur

**AdS d'équipe :** un point commun par défaut, modifiable individuellement par PAX.

### Données

```sql
-- Point de ramassage lié à une AdS (par PAX)
CREATE TABLE pax_pickup_points (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  ads_pax_id            UUID NOT NULL REFERENCES ads_pax(id),
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  trip_id               UUID REFERENCES trips(id),
  -- Renseigné quand le pickup est intégré à un circuit TravelWiz

  latitude              DECIMAL(10,7) NOT NULL,
  longitude             DECIMAL(10,7) NOT NULL,
  address_label         TEXT,
  notes                 TEXT,          -- "Sonner au gardien, entrée B"

  -- Statut du ramassage
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',         -- déclaré, pas encore planifié
      'planned',         -- intégré à un circuit
      'notified',        -- PAX notifié de l'heure d'arrivée estimée
      'picked_up',       -- marqué ramassé par le logisticien terrain
      'no_show',         -- logisticien passé, PAX absent
      'skipped',         -- logisticien a décidé de passer
      'cancelled'        -- AdS annulée ou PAX se déplace seul
    )),

  -- Demande exceptionnelle (si vecteur sans ramassage par défaut)
  is_exceptional             BOOLEAN NOT NULL DEFAULT FALSE,
  exceptional_status         VARCHAR(20)
    CHECK (exceptional_status IN ('pending_approval','approved','rejected')),
  exceptional_approved_by    UUID REFERENCES users(id),
  exceptional_rejection_reason TEXT,

  pickup_time_estimated TIMESTAMPTZ,
  pickup_time_actual    TIMESTAMPTZ,
  no_show_reason        TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pickup_pax    ON pax_pickup_points(pax_id);
CREATE INDEX idx_pickup_trip   ON pax_pickup_points(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_pickup_status ON pax_pickup_points(status);

-- Historique pour pré-remplissage (par PAX × destination)
CREATE TABLE pax_pickup_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  destination_asset_id  UUID NOT NULL REFERENCES assets(id),
  latitude              DECIMAL(10,7) NOT NULL,
  longitude             DECIMAL(10,7) NOT NULL,
  address_label         TEXT,
  last_used_at          TIMESTAMPTZ DEFAULT NOW(),
  use_count             INTEGER DEFAULT 1,
  UNIQUE (pax_id, destination_asset_id, latitude, longitude)
);

-- Circuit de ramassage (regroupement de points pour un voyage donné)
CREATE TABLE pickup_circuits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  trip_id           UUID NOT NULL REFERENCES trips(id),
  pickup_vehicle_id UUID REFERENCES vehicles(id),   -- véhicule terrestre
  driver_name       TEXT,
  driver_phone      TEXT,
  driver_user_id    UUID REFERENCES users(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','completed','cancelled')),
  departure_time    TIMESTAMPTZ NOT NULL,
  route_order       JSONB NOT NULL DEFAULT '[]',
  -- [uuid_pickup_point_1, uuid_pickup_point_2, ...]  — ordre des arrêts
  optimized_by      UUID REFERENCES users(id),
  optimized_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### Demande exceptionnelle

Si `vehicle.requires_pickup = false` mais qu'un PAX demande quand même un ramassage :
1. Demandeur coche "Ramassage souhaité" dans l'AdS → `is_exceptional = true`
2. `exceptional_status = 'pending_approval'` → notification au LOG_BASE
3. LOG_BASE valide ou refuse avec motif
4. Si validé → intégré au circuit du jour comme tout autre point

### Organisation du circuit (vue LOG_BASE)

Le LOG_BASE regroupe les points de ramassage par voyage depuis le dashboard TravelWiz
(onglet "Ramassages") :

1. Sélectionne le voyage du jour
2. Voit la liste de tous les `pax_pickup_points` liés (via `trip_id`)
3. Clique **"Optimiser le circuit"** → algorithme TSP (OSRM open-source ou
   Google Routes API) calcule l'ordre optimal des arrêts
4. Réordonne manuellement si besoin (drag & drop)
5. Assigne le véhicule terrestre et le chauffeur
6. Génère la **fiche de ramassage PDF** et le lien PWA pour le chauffeur

**Fiche de ramassage PDF générée :**
```
FICHE DE RAMASSAGE — 14/05/2026
Voyage : HERA P — Wouri → Munja — Départ 07:00
Chauffeur : Roger EKWALLA — +237 699 XXX XXX
Départ base : 05:30

1. 05:45  Jean DUPONT (SCHLUMBERGER)
   Carrefour Deido, face station Total
   GPS: 4.0521, 9.7138  |  Tel: +237 677 XXX XXX

2. 05:55  Amadou NZIE + Marie EKWALLA — 2 PAX (DIXSTONE)
   Hôtel Ibis Akwa, entrée principale  |  GPS: 4.0489, 9.7112

3. 06:15  Paul MBALLA (GEOCOMP)
   Résidence Les Cocotiers, bât C
   GPS: 4.0612, 9.7245  |  Note: Sonner au gardien

Arrivée jetty estimée : 06:50
```

### PWA Chauffeur (portail terrain)

**URL :** `https://pickup.app.opsflux.io/{circuit_id}`
Authentification par OTP envoyé au téléphone du chauffeur.

**Interface :**
- Carte avec tous les points de ramassage et itinéraire tracé
- Bouton **"Suivre l'itinéraire"** → ouvre le GPS natif (Google Maps / Waze / Maps)
  avec tous les waypoints pré-chargés

**Détection géographique automatique :**
- La PWA suit la position GPS du chauffeur (Service Worker + Geolocation API)
- Dans un rayon de **100m** (configurable) d'un arrêt → le bouton ✓ RAMASSÉ
  s'active et vibre sur l'appareil
- **X minutes avant l'arrivée** (configurable, défaut 5 min) → SMS automatique
  au PAX : *"Votre véhicule arrive dans ~5 min. Chauffeur : Roger EKWALLA +237 699..."*

**Actions chauffeur par arrêt :**

| Action | Statut → | Conséquences |
|---|---|---|
| ✓ **Ramassé** | `picked_up` | Heure réelle enregistrée, notif SSE LOG_BASE, arrêt suivant activé |
| ✗ **Absent** | `no_show` | Motif requis, notif LOG_BASE + demandeur AdS, LOG_BASE décide |
| ↩ **Passer** | `skipped` | Motif requis, notif LOG_BASE |

**Mode offline :** Les arrêts et coordonnées sont mis en cache au démarrage.
Les actions hors connexion sont en file locale et synchronisées à la reconnexion
avec les horodatages réels de saisie.

### Dashboard temps réel LOG_BASE

Via SSE (`/api/v1/travelwiz/pickup/stream?entity_id=...`) :

```
RAMASSAGES EN COURS — 14/05/2026

Circuit 1 — HERA P 07:00 (Roger EKWALLA)
  [████████████░░░░] 3/5 PAX ramassés
  ✓ Jean DUPONT          05:48
  ✓ Amadou NZIE          05:56
  ✓ Marie EKWALLA        05:56
  ⏳ Paul MBALLA          ETA 06:12
  ⏳ Visiteurs TOTAL (3)  ETA 06:32
  🚗 Position : 4.0555, 9.7201 — [voir sur carte]

Circuit 2 — Dolphin 1 09:00 (Alphonse MANGA)
  Départ base dans 88 min — 0/3 PAX ramassés
```

### No-show ramassage ≠ no-show manifeste

Un PAX absent au ramassage peut arriver à la jetty par ses propres moyens.
L'absence au pickup est tracée mais **ne retire pas le PAX du manifeste**.
C'est le pointage manifeste (OMAA / Capitaine) qui reste l'acte officiel.

Un no-show ramassage répété est comptabilisé dans l'historique du PAX et
peut informer le validateur lors des prochaines AdS.

### API Ramassage (dans TravelWiz)

```
# Points de ramassage — déclarés depuis PaxLog, gérés ici
GET    /api/v1/travelwiz/pickup/points?trip_id=...&status=...
PATCH  /api/v1/travelwiz/pickup/points/:id/status   Mise à jour statut
POST   /api/v1/travelwiz/pickup/exceptional/:id/approve  Valider demande exceptionnelle
POST   /api/v1/travelwiz/pickup/exceptional/:id/reject

# Circuits
GET    /api/v1/travelwiz/pickup/circuits?date=...&trip_id=...
POST   /api/v1/travelwiz/pickup/circuits              Créer un circuit
GET    /api/v1/travelwiz/pickup/circuits/:id
PATCH  /api/v1/travelwiz/pickup/circuits/:id/route-order  Réordonner manuellement
POST   /api/v1/travelwiz/pickup/circuits/:id/optimize  Lancer TSP
PATCH  /api/v1/travelwiz/pickup/circuits/:id/status
GET    /api/v1/travelwiz/pickup/circuits/:id/export   PDF fiche de ramassage

# PWA chauffeur (public, auth OTP)
GET    /api/pickup/driver/:circuit_id           Accès portail
POST   /api/pickup/driver/:circuit_id/otp       Valider OTP
GET    /api/pickup/driver/:circuit_id/stops     Liste ordonnée des arrêts
PATCH  /api/pickup/driver/:circuit_id/stops/:id Action : picked_up / no_show / skipped
POST   /api/pickup/driver/:circuit_id/position  Update GPS (toutes les 30s)

# Stream SSE
GET    /api/v1/travelwiz/pickup/stream?entity_id=...

# Historique PAX (consommé par PaxLog pour pré-remplissage)
GET    /api/v1/travelwiz/pickup/history/:pax_id?destination_asset_id=...
```

### RBAC Ramassage

| Action | DO | LOG_BASE | TRANSP_COORD | OMAA | CDS | DEMANDEUR | EXT_SUPV |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Déclarer un point (via AdS) | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ (son groupe) |
| Valider demande exceptionnelle | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Créer / optimiser un circuit | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Accès PWA chauffeur | — | — | — | — | — | — | — (OTP) |
| Voir dashboard temps réel | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Voir historique no-shows | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

---


---


## 15. Cargo — cas manquants et clarifications et clarifications


### C-01 : Trip annulé avec cargo déjà chargé

**Situation :** Un Trip est annulé (`* → cancelled`) alors que des colis ont
déjà le statut `loaded` ou `in_transit`.

**Comportement :**
1. Au moment de l'annulation du Trip, le LOG_BASE voit une alerte bloquante :
   "N colis sont marqués comme chargés sur ce voyage. Confirmer leur statut."
2. Pour chaque `cargo_manifest_entry` avec statut `loaded` :
   - Option A : "Colis déchargé — retour à la base" → statut `ready_for_loading`
     + mouvement `return_to_base` créé dans `cargo_movements`
   - Option B : "Colis transféré sur un autre voyage" → saisir le nouveau `trip_id`
3. Si le LOG_BASE ne répond pas → colis passent en `ready_for_loading` automatiquement
   avec note "Retour automatique — voyage annulé"
4. Les `cargo_manifest_entries` passent en `cancelled`

```sql
-- Statut ajouté dans cargo_movements.movement_type
-- 'return_to_base' : retour à l'origine suite à annulation voyage
```

---

### C-02 : Colis endommagé ou avec écart à la livraison

**Situation :** À l'arrivée sur site, le destinataire (OMAA / agent site)
constate que le colis est endommagé, ou que la quantité reçue est différente
de celle déclarée.

**Workflow :**
1. L'agent déclare l'anomalie : bouton "Signaler un problème" dans la fiche colis
2. Il saisit : type d'anomalie, description, photos obligatoires
3. `cargo_movements` reçoit un enregistrement `anomaly_reported` avec `anomaly=true`
4. Statut du colis : reste `delivered` mais avec `has_anomaly = true`
5. Notification automatique : LOG_BASE, expéditeur, responsable du service
6. Pour un écart de quantité (`bulk_quantity`) : saisie de la quantité réellement reçue
   → `quantity_received` stocké dans `cargo_manifest_entries`
7. Le LOG_BASE ouvre un dossier de litige si nécessaire (champ `dispute_reference`)

```sql
ALTER TABLE cargo_manifest_entries
  ADD COLUMN quantity_received   DECIMAL(12,3),
  -- null = pas d'écart / quantité non vérifiée
  -- renseigné si quantité réelle ≠ déclarée
  ADD COLUMN has_anomaly         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN anomaly_notes       TEXT,
  ADD COLUMN dispute_reference   VARCHAR(100);
  -- référence de litige externe si escalade

ALTER TABLE cargo_items
  ADD COLUMN has_anomaly         BOOLEAN NOT NULL DEFAULT FALSE;
  -- dénormalisé pour filtrage rapide dans les listes
```

---

### C-03 : Colis en transit multi-voyages (escales intermédiaires)

**Situation :** Un colis doit aller de la Base Wouri à ESF1, mais le seul
vecteur disponible ce jour va jusqu'à Munja. Le colis repart de Munja le
lendemain sur un autre vecteur vers ESF1.

**Règle :** Un `CargoItem` peut être associé à plusieurs voyages successifs.
La `destination_asset_id` sur le colis est la **destination finale**. Chaque
étape est tracée dans `cargo_movements`.

**Flux statuts :**
```
registered
  → loaded (voyage 1 : Base → Munja)
    → in_transit
      → delivered_intermediate (arrivée Munja — étape intermédiaire)
        → loaded (voyage 2 : Munja → ESF1)
          → in_transit
            → delivered (arrivée ESF1 — destination finale)
```

```sql
-- Statut ajouté dans CargoItemStatus
'delivered_intermediate'  -- livré à une étape intermédiaire, pas la destination finale
-- Condition : current_location_asset_id ≠ destination_asset_id
```

**Interface :** La fiche colis affiche clairement "En transit via Munja →
destination finale : ESF1" quand le statut est `delivered_intermediate`.

---

### C-04 : Colis livré — destinataire absent

**Situation :** Le vecteur arrive sur site mais la personne désignée comme
destinataire n'est pas disponible pour réceptionner le colis.

**Comportement :**
- Le colis est quand même déchargé et confié à l'OMAA ou agent site
- Le mouvement `delivered` est enregistré avec `recipient_actual_name` ≠ destinataire prévu
- Une notification est envoyée au destinataire prévu : "Votre colis a été
  déposé sur site Munja auprès de l'OMAA Joseph ATEBA"
- Le destinataire confirme la réception ultérieurement (bouton "Confirmer la réception")

```sql
ALTER TABLE cargo_manifest_entries
  ADD COLUMN recipient_actual_name VARCHAR(200),
  -- Nom de la personne qui a physiquement réceptionné (si ≠ destinataire prévu)
  ADD COLUMN reception_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN reception_confirmed_at TIMESTAMPTZ;
```

---

### C-05 : Clôture du manifeste cargo

**Gap identifié :** L'endpoint `POST /cargo-manifests/:id/close` est absent
de la spec. Voici comment il fonctionne.

**Quand fermer un manifeste cargo ?**
- À la fin du déchargement sur le site de destination
- Après vérification physique de tous les colis

**Processus de clôture :**
1. Le LOG_BASE ou l'OMAA destination ouvre la vue de clôture
2. Pour chaque `cargo_manifest_entry` :
   - Confirmer "Reçu" → `status = 'unloaded'`, `unloaded_at = now()`
   - Signaler écart → `has_anomaly = true`, saisie quantité reçue
   - Signaler manquant → `status = 'missing'` (nouveau statut)
3. Le manifeste passe en `closed` après confirmation de tous les items
4. Un rapport de déchargement est généré automatiquement (PDF)
5. L'événement `cargo_manifest.closed` est émis

```sql
-- Nouveau statut dans cargo_manifest_entries
-- 'missing' : item non retrouvé au déchargement
ALTER TABLE cargo_manifest_entries
  ADD CONSTRAINT chk_cme_status
    CHECK (status IN ('listed','loaded','unloaded','missing','cancelled'));

-- Endpoint manquant à ajouter
POST /api/v1/travelwiz/cargo-manifests/:id/close
  Body: {
    entries: [
      { entry_id: UUID, status: 'unloaded' | 'missing',
        quantity_received?: float, anomaly?: bool, anomaly_notes?: str }
    ],
    notes?: str
  }
  Droits: LOG_BASE | OMAA | DO
  Response 200: CargoManifestRead
  Effets: émet cargo_manifest.closed, génère rapport déchargement
```

---

### C-06 : Rapport de déchargement — contenu complet

**Généré automatiquement à la clôture d'un manifeste cargo.**

```
RAPPORT DE DÉCHARGEMENT
Manifeste : MAN-CGO-2026-01832
Voyage    : HERA P — Wouri Base → Munja  — 14/09/2026
─────────────────────────────────────────────────────────────
CGO-2026-004521  Basket outils E-LINE        340 kg   ✓ Reçu
CGO-2026-004522  Basket chimie QHSE          85 kg    ✓ Reçu
CGO-2026-004523  Rack gaz B (12 bouteilles)  240 kg   ⚠ Écart : 10 bouteilles reçues / 12 déclarées
CGO-2026-004524  Container 20 FT matériel    2100 kg  ✗ Manquant — non retrouvé
─────────────────────────────────────────────────────────────
Total déclaré  : 2765 kg  (4 items)
Total reçu     : 2508 kg  (3 items complets + 1 partiel)
Écarts         : 1 item manquant, 1 item incomplet
─────────────────────────────────────────────────────────────
Réceptionné par : Joseph ATEBA (OMAA Munja)
Signature      : [signature tablette]
Date / Heure   : 14/09/2026 — 17:30
─────────────────────────────────────────────────────────────
```

Le rapport est diffusé automatiquement à : LOG_BASE, expéditeurs des items
avec écart, responsables des services concernés.

---

### C-07 : Poids non renseigné — règle de validation

**Situation :** Un colis est enregistré sans `unit_weight_kg` (ex: valise
de documents, matériel léger dont le poids n'est pas connu).

**Règle :**
- `unit_weight_kg` est **optionnel** à l'enregistrement
- Si null → `total_weight_kg = null`
- Un colis sans poids peut être ajouté à un manifeste cargo
- À la validation du manifeste : si des colis n'ont pas de poids, un
  avertissement (non bloquant) est affiché : "3 colis sans poids déclaré —
  le total peut être inexact"
- Le LOG_BASE peut saisir le poids estimé avant validation
- Pour l'algorithme deck : les colis sans poids sont placés en dernier
  (priorité de placement la plus basse)

---

### C-08 : Recherche par QR code / référence externe

**Endpoint manquant :**

```
GET /api/v1/travelwiz/cargo-items/search
  Query:
    q: str              # recherche dans description, tracking_number, external_reference
    tracking_number: str  # recherche exacte par CGO-YYYY-NNNNN
    external_reference: str  # recherche exacte par référence externe (P19 493, DRLG 1123)
    status: str
    entity_id: UUID
  Response 200: PaginatedResponse[CargoItemRead]

POST /api/v1/travelwiz/cargo-items/scan
  Body: { code: str }   # valeur scannée depuis QR code ou code-barres
  Response 200: CargoItemRead | { not_found: true }
  Note: cherche dans tracking_number ET external_reference
  Note: utilisé depuis l'interface mobile du LOG_BASE (scan terrain)
```

---

### C-09 : Statuts complets — diagramme de transition

```
registered
  ↓ (ajouté à un manifeste cargo)
ready_for_loading
  ↓ (manifeste validé + chargement physique confirmé)
loaded
  ↓ (voyage departed)
in_transit
  ↓ (arrivée à destination intermédiaire si multi-escale)
delivered_intermediate  ←→ loaded (re-embarquement)
  ↓ (arrivée à destination finale)
delivered
  ↓ (déclaration retour depuis le site)
return_declared
  ↓ (chargement sur manifeste retour)
return_in_transit
  ↓ (arrivée à la base)
returned
  ↓ (dispatch final selon return_type)
  ├── reintegrated  (stock_reintegration)
  ├── scrapped      (scrap)
  └── returned      (yard_storage, contractor_return, waste → statut final = returned)

Statuts terminaux exceptionnels :
  lost       (colis déclaré perdu après investigation)
  ← Tout statut avant delivered peut passer en lost avec motif + validation DO
```

---

### C-10 : Qui peut faire quoi sur le cargo — RBAC complet

| Action | DO | LOG_BASE | TRANSP_COORD | OMAA | CDS | CHEF_PROJET | DEMANDEUR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Enregistrer un colis | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Modifier avant chargement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (le sien) | ✓ (le sien) |
| Modifier après chargement | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Ajouter au manifeste cargo | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Valider manifeste cargo | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Valider manifeste hazmat | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Clôturer manifeste cargo | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Déclarer retour | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Signaler anomalie livraison | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Déclarer colis perdu | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Imprimer étiquette / QR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voir timeline colis | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (le sien) | ✓ (le sien) |

---


---


### 12bis Compliance PAX ajouté manuellement au manifeste


### Règle (A3 confirmée)

Quand un LOG_BASE ajoute manuellement un PAX à un manifeste PAX (sans AdS
associée, `added_manually = true`), la vérification compliance HSE est
**obligatoire et bloquante**, exactement comme pour un PAX venant d'une AdS.

Le fait qu'il s'agisse d'une urgence ne dispense pas du contrôle HSE —
un PAX non conforme sur un site offshore est un risque réel quelle que
soit l'urgence administrative.

### Endpoint mis à jour

```
POST /api/v1/travelwiz/pax-manifests/:id/entries
  Body:
    pax_id:           UUID              (obligatoire)
    ads_pax_id:       UUID | null       (null si ajout manuel)
    weight_kg:        float | null
    notes:            str | null
    manual_reason:    str               (obligatoire si ads_pax_id = null)
    -- Motif de l'ajout manuel (ex: "Urgence technique — technicien E-LINE")

  Comportement:
    1. Si ads_pax_id fourni → PAX normal depuis AdS, pas de re-vérification
    2. Si ads_pax_id null (ajout manuel) :
       a. Appel à ComplianceService.check_pax_for_asset(pax_id, trip.destination_asset_id)
       b. Si non conforme → 409 COMPLIANCE_FAILED avec détail des certifications manquantes
       c. Si conforme → PAX ajouté avec added_manually=true + manual_reason tracé
       d. Audit log : qui, quand, motif, résultat compliance

  Erreurs:
    409 COMPLIANCE_FAILED  — PAX non conforme HSE pour ce site
      { missing_credentials: [{type, status}], can_override: false }
    400 MANUAL_REASON_REQUIRED — motif obligatoire si pas d'AdS
    409 CAPACITY_EXCEEDED  — vecteur plein (standby possible)
```

### Cas du PAX non conforme en urgence absolue

Si le LOG_BASE doit quand même embarquer un PAX non conforme (ex : évacuation
médicale d'un PAX blessé dont le BOSIET est expiré) → seul le **DO** peut
forcer l'embarquement via un endpoint de dérogation :

```
POST /api/v1/travelwiz/pax-manifests/:id/entries/override-compliance
  Droits: DO uniquement
  Body:
    pax_id:             UUID
    override_reason:    str (min 20 caractères)
    -- Motif détaillé obligatoire
    risk_acknowledged:  bool (= true obligatoire)

  Effets:
    → PAX ajouté avec compliance_override=true + override_reason
    → Notification immédiate DQHSE + CHSE
    → Audit log avec flag DO_OVERRIDE
    → Incident automatique créé dans PaxLog (severity='warning')
      "Embarquement hors compliance autorisé par DO — [motif]"
```

### Champs ajoutés sur `pax_manifest_entries`

```sql
ALTER TABLE pax_manifest_entries
  ADD COLUMN manual_reason          TEXT,
  -- Motif de l'ajout manuel (non null si added_manually=true)
  ADD COLUMN compliance_override    BOOLEAN NOT NULL DEFAULT FALSE,
  -- true si DO a autorisé malgré non-conformité
  ADD COLUMN compliance_override_reason TEXT;
  -- Motif de la dérogation DO
```

---


---


### Prolongation séjour — retrait automatique manifeste retour


### Règle (B2 confirmée)

Quand une AdS est prolongée (Option A — modification de la date de fin),
et qu'un manifeste retour (`direction = 'inbound'`) existe déjà pour ce PAX,
**OpsFlux retire automatiquement le PAX de ce manifeste** et le remet en
attente pour la nouvelle date.

### Comportement automatique à la prolongation

```python
async def handle_ads_extension(
    ads: AdS,
    new_end_date: date,
    actor: User,
    db: AsyncSession
) -> None:
    """
    Appelé quand une AdS in_progress est prolongée (Option A).
    Retire le PAX de tout manifeste retour existant et notifie le LOG_BASE.
    """
    # Trouver les entrées dans des manifestes retour (inbound) pour ce PAX
    inbound_entries = await db.execute(
        select(PaxManifestEntry)
        .join(PaxManifest, PaxManifest.id == PaxManifestEntry.manifest_id)
        .where(
            PaxManifestEntry.ads_pax_id.in_(
                select(AdSPax.id).where(AdSPax.ads_id == ads.id)
            ),
            PaxManifest.direction == "inbound",
            PaxManifest.status.in_(["draft", "pending_validation", "validated"])
            # Ne touche jamais aux manifestes déjà clôturés
        )
    )

    for entry in inbound_entries.scalars():
        manifest = await db.get(PaxManifest, entry.manifest_id)

        # Retirer le PAX du manifeste retour
        entry.status = "cancelled"
        entry.notes = (
            f"Retiré automatiquement — AdS prolongée jusqu'au {new_end_date} "
            f"par {actor.full_name}"
        )

        # Si le manifeste était validé → repasse en requires_review
        if manifest.status == "validated":
            manifest.status = "requires_review"
            await audit_log.record(
                entity_type="pax_manifest", entity_id=manifest.id,
                action="status_changed",
                old_values={"status": "validated"},
                new_values={"status": "requires_review"},
                notes=f"AdS {ads.reference} prolongée — PAX retiré automatiquement"
            )

        # Notifier le LOG_BASE
        await notification_service.send(
            roles=["LOG_BASE"],
            message=(
                f"⚠ Prolongation AdS {ads.reference} : "
                f"{entry.pax_name} retiré du manifeste retour "
                f"{manifest.reference}. "
                f"Nouvelle date de fin : {new_end_date}."
            ),
            link=f"/travelwiz/pax-manifests/{manifest.id}"
        )

    await db.commit()
```

### Ce que voit le LOG_BASE

La notification pointe directement vers le manifeste retour affecté.
Le LOG_BASE doit :
1. Vérifier le manifeste retour (passé en `requires_review` si valide)
2. Ré-assigner le PAX sur un manifeste retour pour la nouvelle date de fin
3. Re-valider le manifeste retour

Si la capacité du vecteur initial est toujours disponible pour la nouvelle date,
TravelWiz propose de réinscrire le PAX sur le prochain manifeste retour compatible.

### Manifeste retour déjà clôturé — cas impossible

Un manifeste retour `closed` signifie que le PAX a **physiquement embarqué**
pour le retour. Si son AdS est prolongée après ça, cela signifie que TravelWiz
a déjà émis `pax_manifest.closed (inbound)` → l'AdS est déjà `completed`.
On ne peut pas prolonger une AdS `completed` — la prolongation est donc
impossible dans ce cas et OpsFlux le bloque avec une erreur explicite.

---


---


## 16. Trip delayed — seuil de réassignation — seuil de réassignation


### Comportement immédiat au passage en `delayed`

Quand le statut d'un Trip passe en `delayed` (via portail capitaine ou LOG_BASE) :

1. **Notification immédiate** à tous les PAX du manifeste (`confirmed` + `standby`)
2. **Notification au LOG_BASE** avec lien direct vers le trip
3. **Le manifeste reste `validated`** — le délai ne remet pas le manifeste en cause

```
✈ HERA P — Départ retardé
Wouri Base → Munja  |  Départ prévu 08:30

Nouveau départ estimé : [saisir l'heure — obligatoire]
Raison : [champ libre — obligatoire]

→ Notification envoyée aux 12 PAX du manifeste
→ Notification envoyée au LOG_BASE
```

### Champs ajoutés sur `trips`

```sql
ALTER TABLE trips
  ADD COLUMN delay_reason          TEXT,
  -- Motif du retard (obligatoire quand status=delayed)
  ADD COLUMN estimated_departure   TIMESTAMPTZ,
  -- Nouvelle heure de départ estimée (obligatoire quand status=delayed)
  ADD COLUMN delay_notified_at     TIMESTAMPTZ;
  -- Heure à laquelle les PAX ont été notifiés
```

### Seuil de réassignation (configurable)

Une variable d'environnement `TRIP_DELAY_REASSIGN_THRESHOLD_HOURS` (défaut : **4 heures**)
définit à partir de quand le LOG_BASE peut décider d'annuler le trip retardé
et de réassigner les PAX sur un autre voyage.

```
Si (estimated_departure - departure_datetime_original) > THRESHOLD :
  → Bouton "Annuler et réassigner" disponible pour le LOG_BASE
  → Le LOG_BASE voit la liste des trips alternatifs disponibles
     (même destination, date compatible, capacité suffisante)
  → Il sélectionne le trip de remplacement
  → OpsFlux transfère automatiquement les PAX `confirmed` sur le nouveau manifeste
  → Les PAX reçoivent une nouvelle notification avec le nouveau vecteur et l'heure
```

### Workflow de réassignation

```python
async def reassign_delayed_trip(
    original_trip_id: UUID,
    replacement_trip_id: UUID,
    actor: User,
    db: AsyncSession
) -> None:
    """
    Transfère les PAX confirmed d'un trip retardé vers un trip de remplacement.
    """
    original_manifest = await get_pax_manifest_for_trip(original_trip_id, db)
    replacement_manifest = await get_or_create_pax_manifest(replacement_trip_id, db)

    confirmed_entries = [
        e for e in original_manifest.entries
        if e.status == "confirmed"
    ]

    for entry in confirmed_entries:
        # Vérifier la capacité du vecteur de remplacement
        await check_and_add_to_manifest(
            manifest_id=replacement_manifest.id,
            pax_id=entry.pax_id,
            ads_pax_id=entry.ads_pax_id,
            weight_kg=entry.weight_kg,
            db=db
        )
        # Annuler l'entrée dans le manifeste original
        entry.status = "cancelled"
        entry.notes = f"Réassigné sur {replacement_manifest.reference} — retard trip"

    # Annuler le trip original
    original_trip = await db.get(Trip, original_trip_id)
    original_trip.status = "cancelled"
    original_manifest.status = "cancelled"

    # Notifier les PAX du nouveau trip
    replacement_trip = await db.get(Trip, replacement_trip_id)
    await notify_pax_list(
        pax_ids=[e.pax_id for e in confirmed_entries],
        message=(
            f"Votre transport a été réassigné suite au retard de "
            f"{original_trip.vehicle_name}. "
            f"Nouveau départ : {replacement_trip.vehicle_name} "
            f"à {replacement_trip.departure_datetime.strftime('%H:%M')}."
        )
    )

    await db.commit()
```

### Variable d'environnement

```env
TRIP_DELAY_REASSIGN_THRESHOLD_HOURS=4
# Délai au-delà duquel le bouton "Annuler et réassigner" devient disponible
```

---


---


### Recherche cargo par scan — résultats multiples


### Règle

`external_reference` n'est pas unique — le même numéro de panier physique
(P19 493) peut exister plusieurs fois dans OpsFlux (usages successifs du même
panier au fil des années). Pas de contrainte UNIQUE en base.

Quand la recherche par scan retourne plusieurs résultats, ils sont tous
affichés et l'utilisateur choisit.

### Interface du scan

```
Résultats pour "P19 493"  (3 colis trouvés)

[CGO-2026-004521]  Basket outils E-LINE
  Statut : LIVRÉ ✓   Site actuel : ESF1   14/09/2026

[CGO-2025-003102]  Basket outils E-LINE
  Statut : RÉINTÉGRÉ ✓   Site actuel : Magasin Base   12/03/2025

[CGO-2024-001847]  Basket câbles électriques
  Statut : ARCHIVÉ   Site actuel : —   08/11/2024

[Sélectionner →]   [Sélectionner →]   [Sélectionner →]
```

Les résultats sont **triés par date décroissante** (le plus récent en haut)
car dans la quasi-totalité des cas, l'utilisateur cherche le colis actif le
plus récent. L'affichage montre toujours : tracking_number, description,
statut, site actuel, date d'enregistrement.

### Endpoint scan mis à jour

```
POST /api/v1/travelwiz/cargo-items/scan
  Body: { code: str }
  Response 200:
    Si un seul résultat : CargoItemRead directement
    Si plusieurs résultats :
      {
        "multiple": true,
        "count": 3,
        "items": [
          {
            "tracking_number": "CGO-2026-004521",
            "external_reference": "P19 493",
            "description": "Basket outils E-LINE",
            "status": "delivered",
            "current_location_asset_name": "ESF1",
            "created_at": "2026-09-14"
          },
          ...
        ]
      }
    Après sélection : GET /api/v1/travelwiz/cargo-items/:id
```

---


---


## 17. IoT multi-devices — priorité configurable — priorité configurable par vecteur


### Règle

Un vecteur peut avoir plusieurs dispositifs IoT actifs simultanément
(ex : GPS tracker embarqué + transpondeur AIS pour les navires).
La position affichée sur la carte est déterminée par la **priorité
configurable par vecteur**.

### Configuration sur `iot_devices`

```sql
ALTER TABLE iot_devices
  ADD COLUMN priority   SMALLINT NOT NULL DEFAULT 10;
  -- Plus la valeur est basse, plus la priorité est haute
  -- GPS tracker : priority=5, AIS : priority=10 → GPS prioritaire
  -- AIS : priority=5, GPS : priority=10 → AIS prioritaire
  -- En cas d'égalité → last-write-wins (la plus récente)
```

**Exemples de configuration recommandée :**

| Type de vecteur | Device prioritaire | Raison |
|---|---|---|
| Navire (bateau, barge) | AIS (`priority=1`) | AIS obligatoire légalement, plus fiable en mer |
| Hélicoptère | GPS tracker (`priority=1`) | Pas d'AIS sur les appareils aériens |
| Véhicule terrestre | GPS tracker (`priority=1`) | AIS non pertinent à terre |

### Logique de sélection dans le cache Redis

```python
async def update_vehicle_position_cache(
    vehicle_id: UUID,
    device_id: str,
    position: VehiclePositionPayload,
    db: AsyncSession
) -> None:
    """
    Met à jour le cache Redis de la position courante du vecteur.
    Respecte la priorité des devices : un device de priorité haute
    écrase la position, un device de priorité basse ne l'écrase pas
    si une position plus récente d'un device prioritaire existe.
    """
    # Récupérer la priorité du device émetteur
    device = await db.execute(
        select(IoTDevice).where(
            IoTDevice.vehicle_id == vehicle_id,
            IoTDevice.device_id == device_id
        )
    )
    device = device.scalar_one_or_none()
    if not device:
        return  # device inconnu → rejeté

    incoming_priority = device.priority

    # Lire la position actuelle en cache
    cache_key = f"vehicle:position:{vehicle_id}"
    cached_raw = await redis.get(cache_key)

    if cached_raw:
        cached = json.loads(cached_raw)
        cached_priority = cached.get("device_priority", 999)
        cached_ts = datetime.fromisoformat(cached["updated_at"])
        stale_threshold = timedelta(minutes=5)

        # Ne pas écraser si :
        # - Le device en cache est plus prioritaire (valeur plus basse)
        # - ET sa position date de moins de 5 minutes (pas stale)
        if (cached_priority < incoming_priority and
                datetime.utcnow() - cached_ts < stale_threshold):
            # Position du device prioritaire encore fraîche → ignorer
            # Mais quand même enregistrer en DB pour historique
            await db.execute(insert(VehiclePosition).values(
                vehicle_id=vehicle_id,
                device_id=device_id,
                **position.dict()
            ))
            return

    # Mettre à jour le cache avec la nouvelle position
    await redis.setex(
        cache_key,
        86400,  # TTL 24h
        json.dumps({
            "lat": position.latitude,
            "lon": position.longitude,
            "speed": position.speed_knots,
            "heading": position.heading_deg,
            "status": position.status,
            "device_id": device_id,
            "device_priority": incoming_priority,
            "updated_at": datetime.utcnow().isoformat()
        })
    )
    await db.execute(insert(VehiclePosition).values(
        vehicle_id=vehicle_id,
        device_id=device_id,
        **position.dict()
    ))
```

### Règle de staleness

Si le device prioritaire n'a pas émis depuis plus de **5 minutes**
(seuil configurable : `IOT_PRIORITY_STALE_THRESHOLD_MIN`), sa position
est considérée "stale" et le device secondaire peut prendre le relais.
La carte affiche alors un indicateur "Position secondaire (GPS)" ou
"Position secondaire (AIS)" pour signaler que la source n'est pas la
source prioritaire.

```env
IOT_PRIORITY_STALE_THRESHOLD_MIN=5
# Au-delà de ce délai sans signal du device prioritaire,
# le device secondaire peut mettre à jour le cache
```


---


## 18. Événements émis


| Événement | Déclencheur | Payload clé |
|---|---|---|
| `trip.created` | POST /trips | `{trip_id, reference, vehicle_id, destination_asset_id}` |
| `trip.status_changed` | PATCH /trips/:id/status | `{trip_id, old_status, new_status}` |
| `trip.closed` | close manifest | `{trip_id, entity_id}` → calcul KPIs |
| `pax_manifest.validated` | POST /validate | `{manifest_id, trip_id, pax_count}` |
| `pax_manifest.closed` | POST /close | `{manifest_id, boarded_pax, no_show_pax}` → PaxLog |
| `cargo_item.registered` | POST /cargo-items | `{tracking_number, management_type}` |
| `cargo_item.status_changed` | POST /move | `{cargo_item_id, old_status, new_status}` |
| `vehicle.signal_lost` | IoT monitor batch | `{vehicle_id, trip_id, last_signal}` |
| `rotation.trip_generated` | Batch rotation | `{rotation_id, trip_id, date}` |

---


---

*Fin du document — Module TravelWiz*
