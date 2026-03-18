# Module Asset Registry -- Specification Fusionnee

## 1. Role et positionnement

L'Asset Registry est le **referentiel de la hierarchie geographique et physique** d'OpsFlux. C'est le module "zero" : il est deploye et rempli en premier, avant tout autre module. Les modules metier (Planner, PaxLog, TravelWiz, Projets) le consomment via l'API avec un acces controle par roles (RBAC).

**Multi-tenancy :** Tenant (schema PG) > Entity (entity_id) > BU.
**ORM :** SQLAlchemy 2.0 async.
**Event bus :** PostgreSQL LISTEN/NOTIFY.
**Domaines :** *.opsflux.io

---

## 2. Principe fondamental -- Hierarchie dynamique, types configurables par tenant

```
ADMIN definit un AssetType "Plateforme offshore"
  -> Avec N champs : code (requis), type, water_depth, statut, lat, lng, etc.

LE SYSTEME genere AUTOMATIQUEMENT :
  -> Stockage via extrafield_definitions (pas de migration DB supplementaire)
  -> API REST complete : GET/POST/PUT/DELETE /api/v1/assets/{type_slug}/
  -> Vue liste avec colonnes filtrables + tri + pagination
  -> Formulaire de creation/edition avec validation
  -> Vue detail avec TOUTES les capacites Core activees
  -> Indexation dans Global Search
  -> Disponibilite comme source dans les Connecteurs de donnees
  -> Disponibilite comme reference dans d'autres Custom Fields
  -> Vue Carte automatique si geolocation=True
  -> Import/Export CSV automatique
```

**Les types d'assets sont dynamiques :** un admin tenant peut creer de nouveaux types, ajouter des champs, configurer les capacites. Des types predefinis sont fournis au deploiement initial.

**Hierarchie ltree :** Chaque asset possede un chemin ltree calcule automatiquement (ex: `perenco_cam.ebome.munja.esf1`). Cela permet des requetes hierarchiques performantes (enfants, ancetres, descendants).

---

## 3. Acces par role -- Ni lecture seule ni acces libre

L'Asset Registry n'est **pas en lecture seule** pour tous les modules. L'acces en ecriture est controle par permissions granulaires (resource.action) :

| Action | ASSET_ADMIN | Ingenieur / DO | Autres modules |
|---|:---:|:---:|:---:|
| Creer un asset (direct) | Oui | -- | -- |
| Creer un asset (draft + validation) | Oui | Oui (via PID, soumis en draft) | -- |
| Modifier un asset | Oui | Oui (champs autorises) | -- |
| Desactiver un asset | Oui | Oui (DO) | -- |
| Deplacer dans la hierarchie | Oui | -- | -- |
| Configurer les coordonnees GPS | Oui | -- | -- |
| Configurer les perimetres (polygones) | Oui | -- | -- |
| Creer/modifier un asset_type | Oui | -- | -- |
| Voir tous les assets | Oui | Oui | Oui (tous roles authentifies) |
| Recherche et navigation | Oui | Oui | Oui (tous roles authentifies) |

**Ajout d'equipements par les ingenieurs :**
- Un ingenieur peut ajouter un equipement via PID : l'asset est cree en **statut draft** et soumis a validation ASSET_ADMIN.
- Un ASSET_ADMIN cree directement les assets sans passer par le draft.

**`ASSET_ADMIN`** : role dedie, distinct de `SYS_ADMIN`. Typiquement un referent geomatique ou responsable donnees operationnelles.

---

## 4. Distinction fondamentale : Asset ≠ Tag

```
ASSET = objet physique/logistique avec identite propre dans le referentiel metier

  Exemples :
    - Separateur V-101  (equipment, sur plateforme EBOME)
    - Pompe P-101A      (equipment, sur plateforme BIPAGA)
    - Plateforme EBOME  (infrastructure)
    - Helico F-HJYC     (logistics)
    - Puits LOBE-04     (well)

  Proprietes typiques : nom, code, emplacement, statut, specifications
  Gere par : Module Asset Registry
  Relation avec tags : un asset PEUT avoir des tags DCS associes (relation Core)

TAG = point de mesure/controle dans un systeme technique (DCS, PID, SCADA)

  Exemples :
    - PT-1011  (capteur pression sur V-101)
    - TT-1012  (capteur temperature sur P-101A)
    - FT-2034  (capteur debit sur ligne 6"-HC-001)
    - XV-3021  (vanne sur PID-101)

  Proprietes : tag_name, type (PT/TT/FT...), range, unit, DCS address
  Gere par : Module TagRegistry (sous-module de PID_PFD)
  Peut etre rattache a un asset (optionnel)
```

---

## 5. Manifest

```python
MODULE_MANIFEST = {
    "slug": "asset_registry",
    "version": "1.0.0",
    "depends_on": ["core"],

    "permissions": [
        "asset.read", "asset.create", "asset.edit", "asset.delete", "asset.admin",
        "asset.draft",           # creation en mode draft (ingenieurs)
        "asset_type.create", "asset_type.edit",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "Assets", "icon": "Building2",
         "route": "/assets", "order": 40}
    ],

    "mcp_tools": [
        "search_assets", "get_asset", "create_asset", "update_asset",
        "list_asset_types", "get_assets_on_map", "get_asset_relations",
    ],

    "map_layers": [
        {"key": "platforms", "label": "Plateformes", "asset_type": "platform"},
        {"key": "wells", "label": "Puits", "asset_type": "well"},
        {"key": "logistics", "label": "Moyens logistiques", "asset_type": "logistics_asset"},
    ],

    "settings": [
        {"key": "default_import_mode", "type": "select",
         "options": [{"value": "create_only", "label": "Creer seulement"},
                     {"value": "upsert", "label": "Creer ou mettre a jour"}],
         "default": "upsert", "scope": "tenant"},
        {"key": "map_default_zoom", "type": "number", "default": 8, "scope": "user"},
        {"key": "map_default_lat", "type": "number", "default": 3.848, "scope": "tenant"},
        {"key": "map_default_lng", "type": "number", "default": 10.497, "scope": "tenant"},
        {"key": "engineer_draft_mode", "type": "toggle",
         "default": True, "scope": "tenant",
         "description": "Les ingenieurs creent les assets en mode draft (validation requise)"},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 6. Hierarchie des assets

```
Tenant (schema PG)
  -> Entity (entity_id)
      -> Filiale / Pays
            -> Champ (Field)
                  -> Site
                        -> Plateforme / Infrastructure
                              -> Puits / Equipement
```

**Exemples Perenco Cameroun :**
```
Perenco Cameroun (entity)
  -> Champ EBOME
        |-- Site Munja
        |     |-- Plateforme ESF1
        |     |-- Plateforme KLF3
        |     +-- Plateforme BTF1
        +-- Site RDRW
              |-- Plateforme RDRW-A
              +-- ...
  -> Base Wouri
        |-- Wouri Jetty
        +-- Yard Base
```

**Types d'assets (`asset_type`) :** Configurables par tenant. Types predefinis : `entity`, `country`, `field`, `site`, `platform`, `well`, `base`, `jetty`, `yard`, `office`, `equipment`, `infrastructure`, `logistics_asset`. L'admin peut en creer d'autres.

---

## 7. Modele de donnees

```sql
-- === TYPES D'ASSETS (dynamiques, configurables par tenant) ===

CREATE TABLE asset_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name JSONB NOT NULL,                -- {"fr": "Plateforme", "en": "Platform"}
    description JSONB,
    icon VARCHAR(50) NOT NULL DEFAULT 'Building2',    -- Lucide icon name
    color VARCHAR(20) NOT NULL DEFAULT '#2E86AB',
    parent_type_id UUID REFERENCES asset_types(id),
    -- Hierarchie de types : ChampPetrolier > Plateforme > Puits
    -- Un asset de type Puits peut avoir un parent de type Plateforme

    -- Capacites Core activees pour ce type
    capability_versioning BOOLEAN NOT NULL DEFAULT TRUE,
    capability_workflow BOOLEAN NOT NULL DEFAULT FALSE,
    capability_attachments BOOLEAN NOT NULL DEFAULT TRUE,
    capability_comments BOOLEAN NOT NULL DEFAULT TRUE,
    capability_geolocation BOOLEAN NOT NULL DEFAULT FALSE,
    capability_relations BOOLEAN NOT NULL DEFAULT TRUE,
    capability_categories BOOLEAN NOT NULL DEFAULT TRUE,
    capability_custom_fields BOOLEAN NOT NULL DEFAULT TRUE,
    capability_export BOOLEAN NOT NULL DEFAULT TRUE,
    capability_import BOOLEAN NOT NULL DEFAULT TRUE,

    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_predefined BOOLEAN NOT NULL DEFAULT FALSE,
    -- true = type fourni par OpsFlux (defaults), false = cree par admin

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- Les champs d'un asset type sont stockes dans extrafield_definitions
-- avec object_type = "asset_{slug}" et module_origin = "asset_registry"

-- === INSTANCES D'ASSETS ===

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id),
    asset_type_id UUID NOT NULL REFERENCES asset_types(id),
    bu_id UUID REFERENCES business_units(id),
    project_id UUID,                    -- optionnel: asset lie a un projet
    parent_asset_id UUID REFERENCES assets(id),

    -- Champs communs a tous les assets
    code VARCHAR(100) NOT NULL,
    name VARCHAR(500) NOT NULL,
    short_name VARCHAR(50),
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    -- active | inactive | maintenance | decommissioned | draft

    -- Hierarchie ltree (calculee automatiquement)
    path ltree,
    -- ex: 'perenco_cam.ebome.munja.esf1'

    -- Geolocalisation (PostGIS + GPS)
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    altitude NUMERIC(8, 2),
    boundary_geojson JSONB,             -- GeoJSON Polygon pour perimetre du champ/site

    -- Metadonnees extensibles
    metadata JSONB,
    -- ex: {offshore: true, water_depth_m: 45, installation_year: 1992}

    -- Capacite PAX (snapshot courant)
    current_max_pax INTEGER DEFAULT 0,
    current_perm_quota INTEGER DEFAULT 0,

    -- Parametres PaxLog
    allow_ads_overlap BOOLEAN NOT NULL DEFAULT FALSE,

    -- Points logistiques
    is_logistic_point BOOLEAN NOT NULL DEFAULT FALSE,
    -- base, jetty, yard, office ont ce flag a true

    -- Les champs specifiques au type sont dans extrafield_values
    -- object_type = "asset_{type_slug}", object_id = assets.id

    -- Statut draft (creation par ingenieur)
    is_draft BOOLEAN NOT NULL DEFAULT FALSE,
    draft_submitted_by UUID REFERENCES users(id),
    draft_validated_by UUID REFERENCES users(id),
    draft_validated_at TIMESTAMPTZ,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, asset_type_id, code)
);

-- Index ltree pour requetes hierarchiques
CREATE INDEX idx_assets_path ON assets USING gist(path);
CREATE INDEX idx_assets_parent ON assets(parent_asset_id);
CREATE INDEX idx_assets_entity ON assets(entity_id);
CREATE INDEX idx_assets_tenant_type ON assets(tenant_id, asset_type_id);
CREATE INDEX idx_assets_bu ON assets(bu_id);
CREATE INDEX idx_assets_geo ON assets(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX idx_assets_active ON assets(entity_id) WHERE is_active = TRUE;
CREATE INDEX idx_assets_type ON assets(entity_id, asset_type_id);
```

---

## 8. Types predefinis -- Definitions completes

### Comment les types predefinis sont crees

```python
# app/services/modules/asset_service.py
# Appele lors de l'activation du module pour un nouveau tenant

PREDEFINED_TYPES = [
    {
        "slug": "oil_field",
        "name": {"fr": "Champ petrolier", "en": "Oil field"},
        "icon": "Layers",
        "color": "#1B3A5C",
        "capabilities": {
            "geolocation": True,
            "versioning": True,
            "attachments": True,
            "workflow": False,
        },
        "fields": [
            {"key": "code", "type": "text_short", "label": {"fr": "Code champ", "en": "Field code"},
             "required": True, "searchable": True, "group": "Identification"},
            {"key": "country", "type": "select_static", "label": {"fr": "Pays", "en": "Country"},
             "options": [{"value": "CM", "label": "Cameroun"}, {"value": "GA", "label": "Gabon"},
                         {"value": "FR", "label": "France"}, {"value": "UK", "label": "Royaume-Uni"},
                         {"value": "RD", "label": "Congo"}, {"value": "EQ", "label": "Guinee Equatoriale"}],
             "required": True, "group": "Identification"},
            {"key": "operator", "type": "text_short", "label": {"fr": "Operateur", "en": "Operator"},
             "group": "Identification"},
            {"key": "license_number", "type": "text_short",
             "label": {"fr": "N. licence", "en": "License number"}, "group": "Identification"},
            {"key": "area_km2", "type": "number_decimal",
             "label": {"fr": "Superficie (km2)", "en": "Area (km2)"}, "unit": "km2", "group": "Donnees techniques"},
            {"key": "water_depth_range", "type": "text_short",
             "label": {"fr": "Profondeur eau", "en": "Water depth"}, "group": "Donnees techniques"},
            {"key": "first_oil_date", "type": "date",
             "label": {"fr": "Date premier petrole", "en": "First oil date"}, "group": "Historique"},
            {"key": "production_status", "type": "select_static",
             "label": {"fr": "Statut production", "en": "Production status"},
             "options": [{"value": "producing", "label": {"fr": "En production"}},
                         {"value": "development", "label": {"fr": "En developpement"}},
                         {"value": "exploration", "label": {"fr": "Exploration"}},
                         {"value": "abandoned", "label": {"fr": "Abandonne"}}],
             "group": "Statut"},
        ]
    },
    {
        "slug": "platform",
        "name": {"fr": "Plateforme / Site", "en": "Platform / Site"},
        "icon": "Building",
        "color": "#2E86AB",
        "parent_type_slug": "oil_field",
        "capabilities": {"geolocation": True, "versioning": True, "attachments": True, "workflow": False},
        "fields": [
            {"key": "code", "type": "text_short", "label": {"fr": "Code plateforme"}, "required": True, "group": "Identification"},
            {"key": "platform_type", "type": "select_static", "label": {"fr": "Type de plateforme"},
             "options": [{"value": "fixed_jacket", "label": "Jacket fixe"},
                         {"value": "fpso", "label": "FPSO"}, {"value": "fso", "label": "FSO"},
                         {"value": "onshore_terminal", "label": "Terminal terrestre"},
                         {"value": "subsea_manifold", "label": "Manifold sous-marin"},
                         {"value": "wellhead_platform", "label": "Wellhead platform"}],
             "required": True, "group": "Donnees techniques"},
            {"key": "water_depth_m", "type": "number_int", "label": {"fr": "Profondeur eau (m)"}, "unit": "m", "group": "Donnees techniques"},
            {"key": "topsides_weight_te", "type": "number_decimal", "label": {"fr": "Poids topsides (te)"}, "unit": "te", "group": "Donnees techniques"},
            {"key": "operational_status", "type": "select_static", "label": {"fr": "Statut operationnel"},
             "options": [{"value": "producing", "label": "En production"},
                         {"value": "standby", "label": "En veille"}, {"value": "shutdown", "label": "Arrete"},
                         {"value": "decommissioned", "label": "Demantele"},
                         {"value": "construction", "label": "En construction"}],
             "group": "Statut"},
            {"key": "first_production_date", "type": "date", "label": {"fr": "Date premiere production"}, "group": "Historique"},
            {"key": "crew_capacity_pax", "type": "number_int", "label": {"fr": "Capacite equipage (pax)"}, "unit": "pax", "group": "Capacites"},
            {"key": "oil_treatment_capacity_bbl", "type": "number_int", "label": {"fr": "Capacite traitement huile (bbl/j)"}, "unit": "bbl/j", "group": "Capacites"},
            {"key": "gas_treatment_capacity_mmscfd", "type": "number_decimal", "label": {"fr": "Capacite traitement gaz (MMscfd)"}, "unit": "MMscfd", "group": "Capacites"},
        ]
    },
    {
        "slug": "well",
        "name": {"fr": "Puits", "en": "Well"},
        "icon": "Waypoints",
        "color": "#3BB273",
        "parent_type_slug": "platform",
        "capabilities": {"geolocation": True, "versioning": True, "attachments": True, "workflow": False},
        "fields": [
            {"key": "well_name", "type": "text_short", "label": {"fr": "Nom du puits"}, "required": True, "group": "Identification"},
            {"key": "uwi", "type": "text_short", "label": {"fr": "UWI (Unique Well Identifier)"}, "group": "Identification"},
            {"key": "well_type", "type": "select_static", "label": {"fr": "Type de puits"},
             "options": [{"value": "oil_producer", "label": "Producteur huile"},
                         {"value": "gas_producer", "label": "Producteur gaz"},
                         {"value": "water_injector", "label": "Injecteur eau"},
                         {"value": "gas_injector", "label": "Injecteur gaz"},
                         {"value": "observation", "label": "Observation"},
                         {"value": "abandoned", "label": "Abandonne"}],
             "required": True, "group": "Donnees techniques"},
            {"key": "fluid_type", "type": "select_static", "label": {"fr": "Fluide principal"},
             "options": [{"value": "oil", "label": "Huile"}, {"value": "gas", "label": "Gaz"},
                         {"value": "gas_condensate", "label": "Condensat"}, {"value": "water", "label": "Eau"}],
             "group": "Donnees techniques"},
            {"key": "total_depth_m", "type": "number_int", "label": {"fr": "Profondeur totale (m MD)"}, "unit": "m MD", "group": "Donnees forages"},
            {"key": "tvd_m", "type": "number_int", "label": {"fr": "Profondeur vraie (TVD m)"}, "unit": "m TVD", "group": "Donnees forages"},
            {"key": "spud_date", "type": "date", "label": {"fr": "Date debut forage (Spud)"}, "group": "Historique"},
            {"key": "completion_date", "type": "date", "label": {"fr": "Date completion"}, "group": "Historique"},
            {"key": "production_status", "type": "select_static", "label": {"fr": "Statut production"},
             "options": [{"value": "producing", "label": "En production"},
                         {"value": "shut_in", "label": "Ferme (shut-in)"},
                         {"value": "workover", "label": "En workover"},
                         {"value": "abandoned", "label": "Abandonne"}], "group": "Statut"},
            {"key": "reservoir", "type": "text_short", "label": {"fr": "Reservoir principal"}, "group": "Donnees techniques"},
        ]
    },
    {
        "slug": "logistics_asset",
        "name": {"fr": "Moyen logistique", "en": "Logistics asset"},
        "icon": "Truck",
        "color": "#F4A261",
        "capabilities": {"geolocation": True, "versioning": False, "attachments": True, "workflow": False},
        "fields": [
            {"key": "asset_name", "type": "text_short", "label": {"fr": "Nom / Immatriculation"}, "required": True, "group": "Identification"},
            {"key": "asset_subtype", "type": "select_static", "label": {"fr": "Type de moyen"},
             "options": [{"value": "helicopter", "label": "Helicoptere"},
                         {"value": "supply_vessel", "label": "Bateau ravitailleur"},
                         {"value": "crew_boat", "label": "Crew boat"},
                         {"value": "fpso_vessel", "label": "FPSO / FSO"},
                         {"value": "truck", "label": "Camion"},
                         {"value": "crane", "label": "Grue / Barge grue"},
                         {"value": "other", "label": "Autre"}],
             "required": True, "group": "Identification"},
            {"key": "operator_tiers_id", "type": "reference", "label": {"fr": "Operateur / Affreteur"},
             "options": {"object_type": "tiers", "display_fields": ["company_name", "short_name"]}, "group": "Identification"},
            {"key": "registration", "type": "text_short", "label": {"fr": "Immatriculation"}, "group": "Identification"},
            {"key": "capacity_pax", "type": "number_int", "label": {"fr": "Capacite passagers (pax)"}, "unit": "pax", "group": "Capacites"},
            {"key": "capacity_cargo_te", "type": "number_decimal", "label": {"fr": "Capacite cargo (te)"}, "unit": "te", "group": "Capacites"},
            {"key": "range_km", "type": "number_int", "label": {"fr": "Rayon d'action (km)"}, "unit": "km", "group": "Capacites"},
            {"key": "availability_status", "type": "select_static", "label": {"fr": "Disponibilite"},
             "options": [{"value": "available", "label": "Disponible"}, {"value": "deployed", "label": "Deploye"},
                         {"value": "maintenance", "label": "En maintenance"}, {"value": "retired", "label": "Retire du service"}],
             "group": "Statut"},
            {"key": "contract_expiry", "type": "date", "label": {"fr": "Expiration contrat"}, "group": "Contrat"},
        ]
    },
]
```

---

## 9. Operations sur la hierarchie

### 9.1 Creation d'un asset

**Par un ASSET_ADMIN (creation directe) :**
1. Selectionne le parent dans l'arborescence.
2. Choisit le type d'asset (liste filtree selon le type du parent).
3. Saisit le code (unique dans le tenant + type), le nom, et les donnees optionnelles.
4. Le `path` ltree est calcule automatiquement : `parent.path + '.' + sanitize(code)`.
5. L'asset est cree avec `status = 'active'`, `is_draft = false`.

**Par un ingenieur (creation via PID, mode draft) :**
1. L'ingenieur identifie un equipement sur un PID et demande son ajout.
2. L'asset est cree avec `status = 'draft'`, `is_draft = true`, `draft_submitted_by = user_id`.
3. Un ASSET_ADMIN recoit une notification de validation.
4. Apres validation : `is_draft = false`, `status = 'active'`, `draft_validated_by` et `draft_validated_at` renseignes.

**Contrainte de type :** La hierarchie autorisee est verifiee par le service (ex: on ne peut pas creer un `well` directement sous un `field`).

### 9.2 Deplacement dans la hierarchie

Operation delicate -- uniquement `ASSET_ADMIN`.

**Consequences d'un deplacement :**
- Mise a jour du `path` ltree de l'asset ET de tous ses enfants (cascade)
- Recalcul des compliance matrices heritees (PaxLog)
- Recalcul des capacites heritees (Planner)
- Notification au DO et aux modules impactes via evenement `asset.moved`

**Protection :** Si l'asset a des AdS `in_progress` ou des activites Planner `approved`, le deplacement est bloque jusqu'a leur cloture.

### 9.3 Desactivation d'un asset

Un asset ne peut etre desactive que si :
- Aucune AdS PaxLog en `approved` ou `in_progress` pour cet asset
- Aucune activite Planner `approved` ou `in_progress` sur cet asset
- Aucun voyage TravelWiz `confirmed` ou en cours vers cet asset

Si ces conditions sont remplies : `is_active = false`. L'asset n'apparait plus dans les listes de selection des formulaires. Les donnees historiques restent intactes.

### 9.4 Regles HSE par asset (prerequis d'acces)

Chaque asset peut definir des **prerequis d'acces HSE** : liste de certifications obligatoires pour acceder au site (ex: BOSIET, HUET, aptitude medicale offshore).

**Heritage parent-enfant :** Les prerequis d'acces HSE d'un noeud parent s'appliquent automatiquement a tous ses enfants (plateformes, puits, equipements). Un champ qui exige BOSIET impose cette exigence a toutes ses plateformes et puits, sans configuration supplementaire sur chaque enfant.

**Duree residuelle minimale :** Une certification doit rester valide pendant au minimum N jours au-dela de la date de fin de sejour prevue. Ce seuil est configurable par type de certification et par asset. Exemple : BOSIET doit etre valide au moins 30 jours apres la date de fin prevue de l'AdS. Si la certification expire dans l'intervalle, l'AdS est bloquee.

**Periode de grace :** Delai configurable (en jours) pendant lequel un PAX avec une certification expiree peut encore acceder au site. Par defaut : 0 (pas de grace = aucune tolerance). Configurable par l'ASSET_ADMIN pour chaque couple (asset, type de certification).

**Verification automatique :** Ces regles sont verifiees automatiquement par PaxLog lors de la soumission d'une Autorisation de Sejour (AdS). Si un prerequis n'est pas satisfait, l'AdS est bloquee avec un message explicite indiquant la certification manquante ou insuffisante.

```sql
-- Prerequis HSE par asset
CREATE TABLE asset_hse_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    certification_type VARCHAR(100) NOT NULL,
    -- ex: 'BOSIET', 'HUET', 'medical_fitness', 'H2S', 'fire_safety'
    min_residual_days INTEGER NOT NULL DEFAULT 0,
    -- certification doit etre valide N jours apres la date de fin de sejour
    grace_period_days INTEGER NOT NULL DEFAULT 0,
    -- tolerance apres expiration (0 = pas de grace)
    is_inherited BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = herite du parent, FALSE = defini localement
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, certification_type)
);
```

### 9.5 Gestion des capacites

#### 9.5.1 Capacite PAX par entreprise

En plus de la capacite globale d'un asset (`current_max_pax`), il est possible de definir une **limite de PAX par sous-traitant** sur un asset specifique (`max_pax_per_company`).

- Configurable par l'admin site pour chaque couple (asset, tiers)
- Verifiee lors de la soumission d'une AdS : si la limite est atteinte pour le tiers concerne, l'AdS est bloquee avec un message explicite (ex: "DIXSTONE a atteint la limite de 8 PAX sur ESF1")
- Permet de repartir equitablement la capacite d'accueil entre sous-traitants

```sql
CREATE TABLE asset_company_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tiers_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
    max_pax INTEGER NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, tiers_id)
);
```

#### 9.5.2 Agregation de capacite

La capacite d'un noeud parent est egale a la **somme des capacites de ses enfants directs**. Exemple : la capacite du champ BIPAGA = somme des capacites de ses plateformes (ESF1 + BTF1 + KLF3).

- Cette agregation est **calculee dynamiquement** (pas stockee en base) pour refleter les modifications en temps reel
- Si un enfant est desactive ou passe en maintenance, sa capacite est exclue de l'agregation
- L'API `/api/v1/assets/:id` retourne la capacite agregee dans le champ `computed_capacity` pour les noeuds parents
- L'arborescence UI affiche la capacite agregee a cote de chaque noeud parent

### 9.6 Heritage de BU

Un asset **herite de la BU de son parent** si aucune BU n'est explicitement assignee (`bu_id IS NULL`).

- Lors de la creation d'un enfant, la BU du parent est proposee par defaut dans le formulaire
- L'admin peut modifier la BU si necessaire (cas d'un asset partage entre BU)
- La resolution de BU effective suit la chaine : asset → parent → grand-parent → ... jusqu'a trouver une BU non nulle
- Si aucun ancetre n'a de BU assignee, l'asset est considere comme cross-BU

### 9.7 Relations custom entre assets

Au-dela de la hierarchie parent-enfant, des **relations configurables** peuvent etre definies entre assets.

**Types de relations :** Definissables par l'admin tenant. Exemples : "alimente par", "relie a", "partage utilites avec", "fournit en eau", "secours de".

**Bidirectionnalite :** Si l'asset A est marque comme "alimente par" l'asset B, alors l'asset B affiche automatiquement la relation inverse "alimente" l'asset A. Les libelles des relations inverses sont configurables.

**Interface :** Les relations sont affichees dans l'onglet "Relations" de la fiche detail de chaque asset. L'utilisateur peut ajouter, modifier ou supprimer une relation depuis cet onglet (permission `asset.edit` requise).

```sql
CREATE TABLE asset_relation_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    label_forward JSONB NOT NULL,
    -- ex: {"fr": "alimente par", "en": "fed by"}
    label_reverse JSONB NOT NULL,
    -- ex: {"fr": "alimente", "en": "feeds"}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE TABLE asset_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relation_type_id UUID NOT NULL REFERENCES asset_relation_types(id),
    from_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    to_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (relation_type_id, from_asset_id, to_asset_id)
);
```

---

## 10. Auto-generation CRUD -- Endpoints dynamiques

```python
# app/api/routes/modules/assets.py
# Les routes sont generees dynamiquement pour chaque asset_type actif

from fastapi import APIRouter, Depends, Query
from app.core.middleware.rbac import requires_permission
from app.services.modules.asset_service import AssetService

router = APIRouter(prefix="/assets", tags=["assets"])

@router.get("/{type_slug}", dependencies=[requires_permission("asset.read")])
async def list_assets(
    type_slug: str,
    bu_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    with_geo: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort_field: str = Query("name"),
    sort_direction: str = Query("asc"),
    request: Request = None,
):
    """Liste les assets d'un type donne."""
    tenant_id = request.state.tenant_id
    active_bu_id = bu_id or request.state.bu_id
    return await AssetService.list_assets(
        type_slug=type_slug, tenant_id=tenant_id, bu_id=active_bu_id,
        search=search, status=status, parent_id=parent_id,
        with_geo=with_geo, page=page, page_size=page_size,
        sort_field=sort_field, sort_direction=sort_direction,
    )

@router.post("/{type_slug}", dependencies=[requires_permission("asset.create")])
async def create_asset(type_slug: str, body: dict, request: Request):
    """Creation directe (ASSET_ADMIN)."""
    return await AssetService.create_asset(
        type_slug, body, request.state.tenant_id, request.state.user_id
    )

@router.post("/{type_slug}/draft", dependencies=[requires_permission("asset.draft")])
async def create_asset_draft(type_slug: str, body: dict, request: Request):
    """Creation en mode draft (ingenieurs via PID)."""
    return await AssetService.create_asset_draft(
        type_slug, body, request.state.tenant_id, request.state.user_id
    )

@router.patch("/{type_slug}/{asset_id}/validate-draft", dependencies=[requires_permission("asset.admin")])
async def validate_draft(type_slug: str, asset_id: str, request: Request):
    """Validation d'un asset draft par ASSET_ADMIN."""
    return await AssetService.validate_draft(
        type_slug, asset_id, request.state.tenant_id, request.state.user_id
    )

@router.get("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.read")])
async def get_asset(type_slug: str, asset_id: str, request: Request):
    return await AssetService.get_asset(type_slug, asset_id, request.state.tenant_id)

@router.put("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.edit")])
async def update_asset(type_slug: str, asset_id: str, body: dict, request: Request):
    return await AssetService.update_asset(
        type_slug, asset_id, body, request.state.tenant_id, request.state.user_id
    )

@router.delete("/{type_slug}/{asset_id}", dependencies=[requires_permission("asset.delete")])
async def archive_asset(type_slug: str, asset_id: str, request: Request):
    """Soft delete : is_active = False + log activite."""
    return await AssetService.archive_asset(
        type_slug, asset_id, request.state.tenant_id, request.state.user_id
    )

@router.post("/{type_slug}/import", dependencies=[requires_permission("asset.create")])
async def import_assets_csv(type_slug: str, file: UploadFile, column_mapping: str,
                            import_mode: str = "upsert", request: Request = None):
    """Import depuis CSV/Excel avec mapping de colonnes."""
    mapping = json.loads(column_mapping)
    return await AssetService.import_from_csv(
        type_slug=type_slug, file=file, column_mapping=mapping,
        import_mode=import_mode, tenant_id=request.state.tenant_id,
        user_id=request.state.user_id,
    )
```

### API hierarchique (lectures)

```
GET  /api/v1/assets                        Liste avec filtres (type, parent, active)
GET  /api/v1/assets/:id                    Detail d'un asset
GET  /api/v1/assets/:id/children           Enfants directs
GET  /api/v1/assets/:id/ancestors          Parents jusqu'a la racine
GET  /api/v1/assets/:id/descendants        Tous les enfants recursifs
GET  /api/v1/assets/tree                   Arborescence complete (GeoJSON optionnel)
GET  /api/v1/assets/search?q=...           Recherche full-text sur nom/code

PATCH  /api/v1/assets/:id/move             Deplacer dans la hierarchie (ASSET_ADMIN)
PATCH  /api/v1/assets/:id/status           Activer / desactiver

GET  /api/v1/assets/geojson                Tous les assets avec coordonnees (FeatureCollection)
PATCH /api/v1/assets/:id/geo               Mettre a jour coordonnees + perimetre
```

---

## 11. Interface utilisateur

### 11.1 Vue arborescence (principale)

Arborescence interactive avec :
- Noeuds depliables/repliables
- Icones par type d'asset
- Badge de statut : actif / inactif / archive / draft
- Nombre de PAX actuellement presents (temps reel depuis PaxLog)
- Capacite PAX : `X / max_pax` avec code couleur

**Actions disponibles :**
- Clic sur un asset : panneau detail a droite
- Bouton "+" a cote d'un asset : creer un enfant
- Drag & drop d'un asset : deplacer (avec confirmation si impacts)
- Menu contextuel : modifier, desactiver, voir la compliance matrix

### 11.2 Vue carte

Carte interactive (Leaflet) affichant les assets geolocalises :
- Marqueurs par type d'asset avec clustering
- Perimetres de champs (polygones GeoJSON)
- Clic : fiche asset en popup
- Drag du marqueur : mise a jour des coordonnees GPS (ASSET_ADMIN uniquement)
- Outil de dessin pour definir les perimetres (polygones)

**Affichage temps reel sur la carte :**
- **Nombre de PAX presents** par asset : affiche dans le marqueur ou en tooltip, alimente par PaxLog (AdS en statut `in_progress`)
- **Capacite residuelle** : code couleur sur chaque marqueur (vert = < 70% de la capacite, orange = 70-90%, rouge = > 90%)
- **Alertes actives** : icone warning sur les assets ayant des alertes en cours (capacite depassee, certification expiree, signalement actif)
- Les donnees sont alimentees en temps reel par PaxLog (AdS `in_progress`) et Planner (quotas approuves)
- Rafraichissement automatique toutes les 60 secondes ou sur evenement `asset.pax_count_changed`

### 11.3 Vue liste auto-generee

```tsx
// src/components/modules/assets/AssetListView.tsx
// Composant generique pour TOUS les types d'assets

const AssetListView = ({ typeSlug }: { typeSlug: string }) => {
    const { data: assetType } = useAssetType(typeSlug)
    const { data: assets, isLoading } = useAssets(typeSlug, filters)
    const [viewMode, setViewMode] = useState<"list" | "map">("list")
    const columns = useAssetColumns(assetType)

    // Toggle liste / carte dans la toolbar
    // Colonnes auto-generees depuis les champs du type
    // Import CSV avec mapping visuel en 3 etapes
    // Export CSV automatique
}
```

### 11.4 Import CSV

Interface en 3 etapes : upload, mapping de colonnes, resultat.

```csv
code,parent_code,asset_type,name,latitude,longitude,allow_ads_overlap
EBOME,,field,Champ EBOME,3.864,9.541,false
MUNJA,EBOME,site,Site Munja,3.901,9.612,false
ESF1,MUNJA,platform,Plateforme ESF1,3.912,9.623,false
```

L'import valide les types, les codes uniques, et l'existence des parents avant creation.

---

## 12. Evenements emis par Asset Registry

```
asset.created       -> Planner, PaxLog (nouveaux sites disponibles)
asset.updated       -> Tous les modules (denormalisation a rafraichir)
asset.moved         -> Planner, PaxLog (recalcul hierarchie compliance + capacites)
asset.deactivated   -> Planner, PaxLog, TravelWiz (suppression des listes de selection)
asset.draft_created -> Notification ASSET_ADMIN (validation requise)
asset.draft_validated -> Notification ingenieur (asset active)
```

**Bus d'evenements :** PostgreSQL LISTEN/NOTIFY.

---

## 13. Enregistrement module

```python
# Au startup de l'application
from app.core.module_registry import module_registry

module_registry.register("asset_registry", MODULE_MANIFEST)
```

---

## 14. PDCA -- Phase Asset Registry (Phase 2)

| Etape | Tache | Critere de validation | Effort |
|---|---|---|---|
| PLAN | ERD Asset Registry : asset_types + assets + champs via extrafield_definitions + ltree + PostGIS | ERD valide, migration P2-001 preparee | 1j |
| DO | Creer les 4 types predefinis en DB (script d'init) | Les 4 types apparaissent dans Settings | 2j |
| DO | API CRUD assets dynamique : GET/POST/PUT/DELETE /assets/{type_slug}/ | Tests pytest : CRUD plateforme + puits fonctionnels | 3j |
| DO | Workflow draft : creation draft par ingenieur + validation ASSET_ADMIN | Draft cree, notification envoyee, validation OK | 2j |
| DO | API hierarchique : tree, children, ancestors, descendants, move | Requetes ltree fonctionnelles | 2j |
| DO | UI Liste generique AssetListView avec colonnes auto-generees | Liste des plateformes avec colonnes code/nom/statut/type | 3j |
| DO | UI Formulaire generique AssetFormView avec champs auto-generes | Creer une plateforme avec tous ses champs | 3j |
| DO | UI Vue Detail avec capacites Core (timeline, PJ, commentaires, relations) | Fiche plateforme complete avec timeline | 2j |
| DO | Import CSV avec mapping visuel en 3 etapes | Import 20 plateformes depuis CSV, rapport erreurs clair | 3j |
| DO | Vue Carte Leaflet : assets geolocalises + clustering + popup + polygones | Carte avec plateformes cliquables et perimetres | 2j |
| DO | Toggle vue liste / vue carte dans la toolbar | Switch list/map sans rechargement des donnees | 1j |
| DO | Schema Builder UI : admin peut creer un nouveau type d'asset | Creer type "Compresseur" avec 5 champs personnalises | 4j |
| CHECK | Scenario complet : creer type "Zone HSE" -> ajouter 3 zones -> importer 10 autres depuis CSV -> voir sur carte | Toutes les fonctions marchent sans erreur | 2j |
| ACT | Former 1 admin a la creation de types d'assets | Admin cree type "Contract" autonomement | 1j |
