# Module PaxLog — Spécification Technique Complète

> Version consolidée — Perenco Cameroun — Mars 2026
> Intègre toutes les décisions et corrections des sessions 1 à 4.

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Modèle de données](#2-modèle-de-données)
3. [Schémas Pydantic](#3-schémas-pydantic)
4. [Service layer](#4-service-layer)
5. [API endpoints](#5-api-endpoints)
6. [Règles de validation](#6-règles-de-validation)
7. [Compliance HSE](#7-compliance-hse)
8. [Priorité PAX](#8-priorité-pax)
9. [Tracking et analytique](#9-tracking-et-analytique)
10. [Signalements](#10-signalements)
11. [Portail externe Tiers](#11-portail-externe-tiers)
12. [Photos et visibilité](#12-photos-et-visibilité)
13. [Workflow AdS — FSM complet](#13-workflow-ads--fsm-complet)
14. [Profils métier et habilitations](#14-profils-métier-et-habilitations)
15. [Avis de Mission (AVM)](#15-avis-de-mission-avm)
16. [Événements émis](#16-événements-émis)

---

PaxLog gère les **mobilisations de personnel sur site industriel**. Il couvre :
- **Avis de Mission (AVM)** — dossier de mission complet orchestrant toutes les actions préparatoires (visa, badge, EPI, indemnités, AdS automatiques) avant le départ sur site
- **Avis de Séjour (AdS)** — demande formelle d'accès à un site, générée manuellement ou automatiquement depuis un AVM
- **Programme de Séjour** — déplacements intra-champ une fois sur site (workflow allégé)
- **Cycles de rotation** — pré-remplissage automatique des AdS pour le personnel permanent
- **Signalements et compliance HSE** — vérification des prérequis, gestion des incidents PAX

PaxLog est le module central qui orchestre la vérification des prérequis HSE, le workflow de validation multi-niveaux (via FSM core), et la transmission des PAX validés à TravelWiz.

---


---


## 1. Rôle et périmètre

PaxLog gère les **mobilisations de personnel sur site industriel**. Il couvre :
- **Avis de Mission (AVM)** — dossier de mission complet orchestrant toutes les actions préparatoires (visa, badge, EPI, indemnités, AdS automatiques) avant le départ sur site
- **Avis de Séjour (AdS)** — demande formelle d'accès à un site, générée manuellement ou automatiquement depuis un AVM
- **Programme de Séjour** — déplacements intra-champ une fois sur site (workflow allégé)
- **Cycles de rotation** — pré-remplissage automatique des AdS pour le personnel permanent
- **Signalements et compliance HSE** — vérification des prérequis, gestion des incidents PAX

PaxLog est le module central qui orchestre la vérification des prérequis HSE, le workflow de validation multi-niveaux (via FSM core), et la transmission des PAX validés à TravelWiz.

---

## 2. Modèle de données


### 2.1 PaxGroup (extension du module Tiers)

```sql
CREATE TABLE pax_company_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  tiers_id      UUID NOT NULL REFERENCES tiers(id),
  group_name    VARCHAR(200) NOT NULL,
  supervisor_id UUID REFERENCES users(id),
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pax_groups_tiers ON pax_company_groups(tiers_id);
```

### 2.2 PaxProfile

```sql
CREATE TABLE pax_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id),
  name        VARCHAR(200) NOT NULL,
  company_id  UUID REFERENCES tiers(id),
  active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE pax_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               UUID NOT NULL REFERENCES entities(id),
  type                    VARCHAR(20) NOT NULL,
  -- internal | external
  first_name              VARCHAR(100) NOT NULL,
  last_name               VARCHAR(100) NOT NULL,
  -- Champs normalisés pour déduplication fuzzy (calculés automatiquement)
  first_name_normalized   VARCHAR(100) NOT NULL,
  last_name_normalized    VARCHAR(100) NOT NULL,
  birth_date              DATE,
  nationality             VARCHAR(100),
  company_id              UUID REFERENCES tiers(id),
  group_id                UUID REFERENCES pax_groups(id),
  user_id                 UUID REFERENCES users(id),  -- null si PAX externe sans compte
  badge_number            VARCHAR(100),
  photo_url               TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active | incomplete | suspended | archived
  profile_completeness    SMALLINT DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 100),
  -- Synchronisation intranet
  synced_from_intranet    BOOLEAN DEFAULT FALSE,
  intranet_id             VARCHAR(100),
  last_synced_at          TIMESTAMPTZ,
  archived                BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pax_entity     ON pax_profiles(entity_id);
CREATE INDEX idx_pax_company    ON pax_profiles(company_id);
CREATE INDEX idx_pax_user       ON pax_profiles(user_id);
-- Index GIN pour recherche fuzzy avec pg_trgm
CREATE INDEX idx_pax_trgm_last  ON pax_profiles
  USING gin(last_name_normalized gin_trgm_ops);
CREATE INDEX idx_pax_trgm_first ON pax_profiles
  USING gin(first_name_normalized gin_trgm_ops);
```

**Normalisation des noms** (calculée à chaque INSERT/UPDATE) :
```python
import unicodedata, re

def normalize_name(name: str) -> str:
    # 1. Minuscules
    s = name.lower()
    # 2. Supprimer accents (NFD → garder seulement les caractères ASCII)
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    # 3. Remplacer tirets et apostrophes par espace
    s = re.sub(r"[-'']", ' ', s)
    # 4. Supprimer caractères non alphanumériques
    s = re.sub(r'[^a-z0-9 ]', '', s)
    # 5. Normaliser espaces multiples
    s = re.sub(r'\s+', ' ', s).strip()
    return s
```

### 2.3 CredentialType (référentiel global — pas d'entity_id)

```sql
CREATE TABLE credential_types (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  VARCHAR(50) UNIQUE NOT NULL,
  -- ex: H2S_AWARENESS, MEDIC_FIT, BOSIET, FOET, HUET
  name                  VARCHAR(200) NOT NULL,
  category              VARCHAR(30) NOT NULL,
  -- safety | medical | technical | administrative
  has_expiry            BOOLEAN NOT NULL DEFAULT TRUE,
  validity_months       SMALLINT,  -- null si has_expiry=false
  proof_required        BOOLEAN NOT NULL DEFAULT TRUE,
  booking_service_id    UUID REFERENCES departments(id),
  -- Service à contacter pour booking/renouvellement
  active                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 PaxCredential

```sql
CREATE TABLE pax_credentials (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  obtained_date         DATE NOT NULL,
  expiry_date           DATE,
  -- null si has_expiry=false sur le type
  proof_url             TEXT,
  -- URL S3 du justificatif
  status                VARCHAR(30) NOT NULL DEFAULT 'pending_validation',
  -- valid | expired | pending_validation | rejected
  validated_by          UUID REFERENCES users(id),
  validated_at          TIMESTAMPTZ,
  rejection_reason      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pax_id, credential_type_id)
  -- un seul enregistrement par type par PAX (mise à jour, pas doublon)
);

CREATE INDEX idx_creds_pax    ON pax_credentials(pax_id);
CREATE INDEX idx_creds_status ON pax_credentials(status);
CREATE INDEX idx_creds_expiry ON pax_credentials(expiry_date)
  WHERE expiry_date IS NOT NULL;
```

### 2.5 ComplianceMatrix

```sql
CREATE TABLE compliance_matrix (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  mandatory             BOOLEAN NOT NULL DEFAULT TRUE,
  scope                 VARCHAR(30) NOT NULL DEFAULT 'all_visitors',
  -- all_visitors | contractors_only | permanent_staff_only
  defined_by            VARCHAR(20) NOT NULL,
  -- hse_central (minimum global) | site (ajout par le site)
  set_by                UUID NOT NULL REFERENCES users(id),
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT,
  UNIQUE (entity_id, asset_id, credential_type_id, scope)
);

CREATE INDEX idx_matrix_asset ON compliance_matrix(asset_id);
```

### 2.6 AdS (Avis de Séjour)

```sql
CREATE TABLE ads (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                       UUID NOT NULL REFERENCES entities(id),
  reference                       VARCHAR(50) UNIQUE NOT NULL,
  -- Format: ADS-2026-04521 (séquentiel par entité+année)
  type                            VARCHAR(20) NOT NULL DEFAULT 'individual',
  -- individual | team
  status                          VARCHAR(40) NOT NULL DEFAULT 'draft',
  -- draft | submitted | pending_compliance | pending_validation |
  -- approved | rejected | cancelled | requires_review |
  -- pending_arbitration | in_progress | completed
  workflow_id                     UUID,
  -- FK vers core.workflow_definitions (FSM core — D-C1)
  requester_id                    UUID NOT NULL REFERENCES users(id),
  site_entry_asset_id             UUID NOT NULL REFERENCES assets(id),
  planner_activity_id             UUID REFERENCES activities(id),
  visit_purpose                   TEXT NOT NULL,
  visit_category                  VARCHAR(50) NOT NULL,
  -- project_work  : activité projet (lié à un projet du module Projets)
  -- workover      : intervention sur puits existant
  -- drilling      : forage d'un nouveau puits
  -- integrity     : inspection d'intégrité (pipeline, structure)
  -- maintenance   : maintenance générale
  -- inspection    : audit, inspection réglementaire externe
  -- permanent_ops : exploitation courante
  -- visit         : visite sans lien Planner
  -- other         : autre
  visit_category_requires_planner BOOLEAN NOT NULL DEFAULT FALSE,
  start_date                      DATE NOT NULL,
  end_date                        DATE NOT NULL,
  transport_requested             BOOLEAN DEFAULT FALSE,
  transport_notes                 TEXT,
  cross_company_flag              BOOLEAN DEFAULT FALSE,
  -- true si PAX détecté avec données similaires dans une autre entreprise
  submitted_at                    TIMESTAMPTZ,
  approved_at                     TIMESTAMPTZ,
  rejected_at                     TIMESTAMPTZ,
  rejection_reason                TEXT,
  archived                        BOOLEAN DEFAULT FALSE,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ads_entity   ON ads(entity_id);
CREATE INDEX idx_ads_status   ON ads(entity_id, status);
CREATE INDEX idx_ads_asset    ON ads(site_entry_asset_id);
CREATE INDEX idx_ads_dates    ON ads(start_date, end_date);
CREATE INDEX idx_ads_activity ON ads(planner_activity_id);
CREATE INDEX idx_ads_requester ON ads(requester_id);
```

### 2.7 AdSPax

```sql
CREATE TABLE ads_pax (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id                  UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  pax_id                  UUID NOT NULL REFERENCES pax_profiles(id),
  status                  VARCHAR(30) NOT NULL DEFAULT 'pending_check',
  -- pending_check | compliant | blocked | approved | rejected | no_show
  compliance_checked_at   TIMESTAMPTZ,
  compliance_summary      JSONB,
  -- [{credential_type_id, credential_type_code, status, message, expiry_date}]
  booking_request_sent    BOOLEAN DEFAULT FALSE,
  -- Tracking manifeste TravelWiz
  boarding_event_id       UUID,  -- FK voyage_events
  disembark_event_id      UUID,
  disembark_asset_id      UUID REFERENCES assets(id),
  current_onboard         BOOLEAN DEFAULT FALSE,
  -- Priorité pour TravelWiz (calculée à l'approbation)
  priority_score          INTEGER DEFAULT 0,
  priority_source         VARCHAR(50),
  UNIQUE (ads_id, pax_id)
);

CREATE INDEX idx_ads_pax_ads ON ads_pax(ads_id);
CREATE INDEX idx_ads_pax_pax ON ads_pax(pax_id);
CREATE INDEX idx_ads_pax_status ON ads_pax(status);
```

### 2.8 AdSImputation

```sql
CREATE TABLE ads_imputations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id              UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  wbs_id              UUID REFERENCES wbs_nodes(id),
  cost_center_id      UUID NOT NULL REFERENCES cost_centers(id),
  percentage          DECIMAL(5,2) NOT NULL
                      CHECK (percentage > 0 AND percentage <= 100),
  cross_imputation    BOOLEAN DEFAULT FALSE,
  notes               TEXT
  -- Contrainte applicative : SUM(percentage) par ads_id = 100
);
```

### 2.9 PaxIncident

```sql
CREATE TABLE pax_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  pax_id            UUID REFERENCES pax_profiles(id),
  company_id        UUID REFERENCES tiers(id),
  asset_id          UUID REFERENCES assets(id),
  severity          VARCHAR(20) NOT NULL,
  -- info | warning | temp_ban | permanent_ban
  description       TEXT NOT NULL,
  incident_date     DATE NOT NULL,
  ban_start_date    DATE,
  ban_end_date      DATE,  -- null = permanent jusqu'à levée manuelle
  recorded_by       UUID NOT NULL REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidents_pax     ON pax_incidents(pax_id);
CREATE INDEX idx_incidents_company ON pax_incidents(company_id);
CREATE INDEX idx_incidents_asset   ON pax_incidents(asset_id);
CREATE INDEX idx_incidents_active  ON pax_incidents(entity_id)
  WHERE resolved_at IS NULL;
```

### 2.10 ExternalAccessLink (Portail externe PaxLog)

```sql
CREATE TABLE external_access_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_id              UUID NOT NULL REFERENCES ads(id),
  token               VARCHAR(100) UNIQUE NOT NULL,
  -- UUID v4 non-devinable
  created_by          UUID NOT NULL REFERENCES users(id),
  preconfigured_data  JSONB,
  -- Données pré-remplies: {site_name, start_date, end_date, project_name, instructions}
  otp_required        BOOLEAN DEFAULT TRUE,
  otp_sent_to         VARCHAR(255),
  -- email ou numéro de téléphone
  expires_at          TIMESTAMPTZ NOT NULL,
  max_uses            SMALLINT DEFAULT 1,
  use_count           SMALLINT DEFAULT 0,
  revoked             BOOLEAN DEFAULT FALSE,
  access_log          JSONB DEFAULT '[]',
  -- [{ip, geolocation, user_agent, timestamp, otp_validated}]
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ext_links_token ON external_access_links(token)
  WHERE revoked = FALSE;
CREATE INDEX idx_ext_links_ads   ON external_access_links(ads_id);
```

### 2.11 PaxRotationCycle

```sql
CREATE TABLE pax_rotation_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  site_asset_id       UUID NOT NULL REFERENCES assets(id),
  rotation_days_on    SMALLINT NOT NULL CHECK (rotation_days_on > 0),
  rotation_days_off   SMALLINT NOT NULL CHECK (rotation_days_off > 0),
  cycle_start_date    DATE NOT NULL,
  -- Date de référence du premier jour "on"
  status              VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active | suspended | ended
  auto_create_ads     BOOLEAN DEFAULT TRUE,
  ads_lead_days       SMALLINT DEFAULT 7,
  -- Créer l'AdS N jours avant le début de la période "on"
  default_project_id  UUID REFERENCES projects(id),
  default_cc_id       UUID REFERENCES cost_centers(id),
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  UNIQUE (pax_id, site_asset_id, status)
  -- Un seul cycle actif par PAX/site
);

CREATE INDEX idx_rotation_pax    ON pax_rotation_cycles(pax_id);
CREATE INDEX idx_rotation_site   ON pax_rotation_cycles(site_asset_id);
CREATE INDEX idx_rotation_active ON pax_rotation_cycles(entity_id)
  WHERE status = 'active';
```

### 2.12 StayProgram (Phase 2)

```sql
CREATE TABLE stay_programs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  ads_id        UUID NOT NULL REFERENCES ads(id),
  pax_id        UUID NOT NULL REFERENCES pax_profiles(id),
  status        VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | submitted | approved | rejected
  movements     JSONB NOT NULL DEFAULT '[]',
  -- [{asset_id, asset_name, date, purpose, compliance_ok}]
  submitted_at  TIMESTAMPTZ,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  rejection_reason TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---


### 2.13 ProfileType (Référentiel des profils métier)

```sql
CREATE TABLE profile_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  code          VARCHAR(50) NOT NULL,
  -- Ex: SOUDEUR, ELECTRICIEN, TECHNICIEN_ELINE, FORAGE, MECANICIEN, VISITEUR, MEDIC
  name          VARCHAR(200) NOT NULL,
  -- Ex: "Soudeur", "Électricien", "Technicien E-Line", "Personnel de forage"
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_id, code)
);
CREATE INDEX idx_profile_types_entity ON profile_types(entity_id);
```

---

### 2.14 PaxProfile — profil(s) métier assignés

Un PAX peut avoir **plusieurs profils métier** (ex : Technicien E-Line ET
Soudeur qualifié). Les profils sont renseignés par le PAX ou son superviseur
sur la fiche PAX.

```sql
CREATE TABLE pax_profile_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id) ON DELETE CASCADE,
  profile_type_id   UUID NOT NULL REFERENCES profile_types(id),
  assigned_at       TIMESTAMPTZ DEFAULT NOW(),
  assigned_by       UUID REFERENCES users(id),
  UNIQUE (pax_id, profile_type_id)
);
CREATE INDEX idx_pax_profile_types_pax     ON pax_profile_types(pax_id);
CREATE INDEX idx_pax_profile_types_profile ON pax_profile_types(profile_type_id);
```

---

### 2.15 ProfileHabilitationMatrix (Matrice d'habilitation par profil)

Définit les certifications requises pour exercer un profil donné,
indépendamment du site.

```sql
CREATE TABLE profile_habilitation_matrix (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  profile_type_id       UUID NOT NULL REFERENCES profile_types(id),
  credential_type_id    UUID NOT NULL REFERENCES credential_types(id),
  mandatory             BOOLEAN NOT NULL DEFAULT TRUE,
  -- mandatory=true  : bloquant si manquant
  -- mandatory=false : recommandé (avertissement seulement)
  set_by                UUID NOT NULL REFERENCES users(id),
  -- CHSE ou DQHSE uniquement
  effective_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT,
  UNIQUE (entity_id, profile_type_id, credential_type_id)
);
CREATE INDEX idx_phm_profile     ON profile_habilitation_matrix(profile_type_id);
CREATE INDEX idx_phm_credential  ON profile_habilitation_matrix(credential_type_id);
```

---

### 2.16 AdSPax — profil déclaré dans l'AdS

Quand un PAX est ajouté à une AdS, il peut déclarer le profil sous lequel
il intervient (peut différer de ses profils habituels — ex : un Technicien
E-Line qui vient en mission de supervision declare `SUPERVISEUR`).

```sql
ALTER TABLE ads_pax
  ADD COLUMN declared_profile_type_id UUID REFERENCES profile_types(id),
  -- Profil métier déclaré pour CETTE mission
  -- null si non précisé (compliance basée sur couche 1 seulement)
  ADD COLUMN profile_self_declaration JSONB DEFAULT '[]';
  -- Autodéclaration du PAX : [{
  --   credential_type_id: uuid,
  --   declared: true,        -- le PAX affirme posséder cette habilitation
  --   proof_url: "...",       -- justificatif uploadé par le PAX
  --   validated: false,       -- validé par CHSE
  --   validated_by: null,
  --   validated_at: null
  -- }]
```

---


### 2.17 Signalements


```sql
CREATE TABLE signalements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  -- SIG-2026-00042

  -- CIBLE : une des trois est renseignée (pas les trois)
  target_type           VARCHAR(20) NOT NULL
                        CHECK (target_type IN ('pax', 'team', 'company')),
  target_pax_ids        UUID[],           -- liste PAX si target_type='pax' ou 'team'
  target_company_id     UUID REFERENCES tiers(id),  -- si target_type='company'

  -- PÉRIMÈTRE (optionnel : signalement global ou limité à un site)
  scope_asset_id        UUID REFERENCES assets(id),
  -- null = s'applique partout
  -- renseigné = s'applique uniquement sur cet asset et ses enfants

  -- DESCRIPTION DE L'ÉVÉNEMENT
  event_date            DATE NOT NULL,
  event_description     TEXT NOT NULL,
  reason                TEXT NOT NULL,    -- motif du signalement
  evidence_urls         JSONB DEFAULT '[]',
  -- [{url, type: 'photo'|'document'|'video', description}]

  -- DÉCISION INITIALE (peut être modifiée pendant le workflow)
  decision              VARCHAR(30) NOT NULL
                        CHECK (decision IN (
                          'avertissement',       -- triangle orange ⚠
                          'exclusion_site',      -- exclu de ce site (scope_asset_id requis)
                          'blacklist_temporaire',-- banni pour une durée définie
                          'blacklist_permanent'  -- banni définitivement
                        )),
  decision_duration_days INTEGER,        -- null = permanent
  -- si renseigné : bann actif du event_date au event_date + duration
  decision_end_date     DATE,            -- calculé automatiquement
  decision_notes        TEXT,

  -- WORKFLOW
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft',
                          'submitted',
                          'under_review',  -- en cours de validation, décision modifiable
                          'validated',     -- actif, effets appliqués
                          'rejected',      -- signalement rejeté
                          'lifted',        -- levé manuellement avant expiration
                          'expired'        -- durée écoulée
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

CREATE INDEX idx_sig_entity  ON signalements(entity_id);
CREATE INDEX idx_sig_company ON signalements(target_company_id) WHERE target_company_id IS NOT NULL;
CREATE INDEX idx_sig_status  ON signalements(entity_id, status);
CREATE INDEX idx_sig_active  ON signalements(entity_id)
  WHERE status = 'validated' AND (decision_end_date IS NULL OR decision_end_date >= CURRENT_DATE);

-- Table pivot pour les PAX concernés par un signalement
CREATE TABLE signalement_pax (
  signalement_id    UUID NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  pax_id            UUID NOT NULL REFERENCES pax_profiles(id),
  PRIMARY KEY (signalement_id, pax_id)
);
CREATE INDEX idx_sig_pax_pax ON signalement_pax(pax_id);

-- Historique des changements de décision pendant le workflow
CREATE TABLE signalement_decision_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signalement_id    UUID NOT NULL REFERENCES signalements(id),
  old_decision      VARCHAR(30),
  new_decision      VARCHAR(30) NOT NULL,
  changed_by        UUID NOT NULL REFERENCES users(id),
  changed_at        TIMESTAMPTZ DEFAULT NOW(),
  reason            TEXT NOT NULL
);
```


---


## 3. Schémas Pydantic


```python
# app/schemas/paxlog.py

class PaxType(str, Enum):
    internal = "internal"
    external = "external"

class PaxStatus(str, Enum):
    active     = "active"
    incomplete = "incomplete"
    suspended  = "suspended"
    archived   = "archived"

class CredentialStatus(str, Enum):
    valid               = "valid"
    expired             = "expired"
    pending_validation  = "pending_validation"
    rejected            = "rejected"

class AdSStatus(str, Enum):
    draft                    = "draft"
    submitted                = "submitted"                 # état transitoire : déclenche le routage FSM
    pending_initiator_review = "pending_initiator_review"  # étape 0-A
    pending_project_review   = "pending_project_review"    # étape 0-B
    pending_compliance       = "pending_compliance"
    pending_validation       = "pending_validation"
    approved                 = "approved"
    rejected                 = "rejected"
    cancelled                = "cancelled"
    requires_review          = "requires_review"
    pending_arbitration      = "pending_arbitration"
    in_progress              = "in_progress"
    completed                = "completed"

class AdSPaxStatus(str, Enum):
    pending_check = "pending_check"
    compliant     = "compliant"
    blocked       = "blocked"
    approved      = "approved"
    rejected      = "rejected"
    no_show       = "no_show"

# ─── PAX Profile ───────────────────────────────────────────

class PaxProfileCreate(BaseModel):
    entity_id:    UUID
    type:         PaxType
    first_name:   str = Field(..., min_length=1, max_length=100)
    last_name:    str = Field(..., min_length=1, max_length=100)
    birth_date:   Optional[date] = None
    nationality:  Optional[str] = None
    company_id:   Optional[UUID] = None  # obligatoire si type=external
    group_id:     Optional[UUID] = None
    badge_number: Optional[str] = None

    @model_validator(mode='after')
    def external_requires_company(self):
        if self.type == PaxType.external and not self.company_id:
            raise ValueError("company_id obligatoire pour un PAX externe")
        return self

class PaxProfileRead(BaseModel):
    id:                   UUID
    entity_id:            UUID
    type:                 PaxType
    first_name:           str
    last_name:            str
    birth_date:           Optional[date]
    nationality:          Optional[str]
    company_id:           Optional[UUID]
    company_name:         Optional[str]
    group_id:             Optional[UUID]
    group_name:           Optional[str]
    user_id:              Optional[UUID]
    badge_number:         Optional[str]
    photo_url:            Optional[str]
    status:               PaxStatus
    profile_completeness: int
    synced_from_intranet: bool
    credentials:          list["PaxCredentialRead"]
    active_incidents:     list["IncidentSummary"]
    created_at:           datetime
    updated_at:           datetime
    class Config: from_attributes = True

class DuplicateSearchResult(BaseModel):
    """Résultat de la recherche de doublons fuzzy."""
    pax_id:           UUID
    first_name:       str
    last_name:        str
    birth_date:       Optional[date]
    company_name:     Optional[str]
    similarity_score: float  # 0.0 à 1.0
    matching_fields:  list[str]  # ["last_name", "first_name", "birth_date"]

class DuplicateCheckResponse(BaseModel):
    duplicates_found: bool
    candidates:       list[DuplicateSearchResult]
    threshold_used:   float

# ─── Credentials ───────────────────────────────────────────

class PaxCredentialCreate(BaseModel):
    pax_id:               UUID
    credential_type_id:   UUID
    obtained_date:        date
    expiry_date:          Optional[date] = None
    notes:                Optional[str] = None
    # proof_url est ajouté via upload séparé (S3 pre-signed URL)

    @model_validator(mode='after')
    def expiry_coherence(self):
        if self.expiry_date and self.expiry_date <= self.obtained_date:
            raise ValueError("expiry_date doit être postérieure à obtained_date")
        return self

class PaxCredentialRead(BaseModel):
    id:                   UUID
    credential_type_id:   UUID
    credential_type_code: str
    credential_type_name: str
    category:             str
    obtained_date:        date
    expiry_date:          Optional[date]
    proof_url:            Optional[str]
    status:               CredentialStatus
    days_until_expiry:    Optional[int]  # calculé, null si pas d'expiry
    validated_by:         Optional[UUID]
    validated_at:         Optional[datetime]
    rejection_reason:     Optional[str]

# ─── Compliance ────────────────────────────────────────────

class ComplianceCheckItem(BaseModel):
    credential_type_id:   UUID
    credential_type_code: str
    credential_type_name: str
    mandatory:            bool
    scope:                str
    defined_by:           str
    status:               Literal["valid", "expired", "missing", "not_validated"]
    message:              str
    expiry_date:          Optional[date]
    days_until_expiry:    Optional[int]

class ComplianceCheckResult(BaseModel):
    pax_id:         UUID
    pax_name:       str
    asset_id:       UUID
    asset_name:     str
    check_date:     date
    is_compliant:   bool  # True seulement si tous les mandatory sont valid
    items:          list[ComplianceCheckItem]
    blocking_items: list[ComplianceCheckItem]  # sous-liste des non-compliant mandatory
    warning_items:  list[ComplianceCheckItem]  # expiry dans < 30 jours

# ─── AdS ───────────────────────────────────────────────────

class ImputationLine(BaseModel):
    project_id:      UUID
    wbs_id:          Optional[UUID] = None
    cost_center_id:  UUID
    percentage:      float = Field(..., gt=0, le=100)
    cross_imputation: bool = False
    notes:           Optional[str] = None

class AdSCreate(BaseModel):
    entity_id:              UUID
    type:                   Literal["individual", "team"] = "individual"
    pax_ids:                list[UUID] = Field(..., min_length=1)
    site_entry_asset_id:    UUID
    planner_activity_id:    Optional[UUID] = None
    visit_purpose:          str = Field(..., min_length=5)
    visit_category:         str
    start_date:             date
    end_date:               date
    transport_requested:    bool = False
    transport_notes:        Optional[str] = None
    imputations:            list[ImputationLine] = Field(..., min_length=1)

    @model_validator(mode='after')
    def validate_ads(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date doit être >= start_date")
        total = sum(i.percentage for i in self.imputations)
        if abs(total - 100.0) > 0.01:
            raise ValueError(f"La somme des imputations doit être 100% (actuel: {total}%)")
        if self.type == "individual" and len(self.pax_ids) != 1:
            raise ValueError("Une AdS individuelle ne peut concerner qu'un seul PAX")
        return self

class AdSRead(BaseModel):
    id:                             UUID
    entity_id:                      UUID
    reference:                      str
    type:                           str
    status:                         AdSStatus
    requester_id:                   UUID
    requester_name:                 str
    site_entry_asset_id:            UUID
    site_entry_asset_name:          str
    planner_activity_id:            Optional[UUID]
    planner_activity_title:         Optional[str]
    visit_purpose:                  str
    visit_category:                 str
    visit_category_requires_planner: bool
    start_date:                     date
    end_date:                       date
    transport_requested:            bool
    transport_notes:                Optional[str]
    cross_company_flag:             bool
    pax_list:                       list["AdSPaxRead"]
    imputations:                    list["AdSImputationRead"]
    active_incidents:               list["IncidentSummary"]
    planner_capacity_status:        Optional[str]  # ok | warning | overflow
    submitted_at:                   Optional[datetime]
    approved_at:                    Optional[datetime]
    rejected_at:                    Optional[datetime]
    rejection_reason:               Optional[str]
    created_at:                     datetime
    updated_at:                     datetime
    class Config: from_attributes = True

class AdSPaxRead(BaseModel):
    id:                     UUID
    pax_id:                 UUID
    pax_name:               str
    pax_company:            Optional[str]
    status:                 AdSPaxStatus
    compliance_checked_at:  Optional[datetime]
    compliance_summary:     Optional[list[ComplianceCheckItem]]
    is_compliant:           bool
    blocking_count:         int   # nombre d'items bloquants
    booking_request_sent:   bool

class AdSValidateRequest(BaseModel):
    action:         Literal["approve", "reject", "request_info", "escalate"]
    pax_ids:        Optional[list[UUID]] = None
    # Si None → s'applique à tous les PAX conformes de l'AdS
    # Si liste → s'applique uniquement aux PAX sélectionnés
    comment:        Optional[str] = None  # obligatoire si action=reject ou request_info
    escalate_reason: Optional[str] = None  # obligatoire si action=escalate

    @model_validator(mode='after')
    def comment_required(self):
        if self.action in ("reject", "request_info") and not self.comment:
            raise ValueError("comment obligatoire pour reject et request_info")
        if self.action == "escalate" and not self.escalate_reason:
            raise ValueError("escalate_reason obligatoire")
        return self

# ─── Lien externe (portail sous-traitant) ──────────────────

class ExternalLinkCreate(BaseModel):
    ads_id:             UUID
    otp_sent_to:        str  # email ou téléphone
    expiry_hours:       int = Field(72, ge=1, le=168)
    max_uses:           int = Field(1, ge=1, le=10)
    preconfigured_data: Optional[dict] = None

class ExternalLinkRead(BaseModel):
    id:                 UUID
    ads_id:             UUID
    token:              str  # affiché une seule fois à la création
    otp_required:       bool
    otp_sent_to:        str
    expires_at:         datetime
    max_uses:           int
    use_count:          int
    revoked:            bool
    access_log:         list[dict]

# ─── Incident ──────────────────────────────────────────────

class IncidentCreate(BaseModel):
    entity_id:      UUID
    pax_id:         Optional[UUID] = None
    company_id:     Optional[UUID] = None
    asset_id:       Optional[UUID] = None
    severity:       Literal["info", "warning", "temp_ban", "permanent_ban"]
    description:    str = Field(..., min_length=10)
    incident_date:  date
    ban_start_date: Optional[date] = None
    ban_end_date:   Optional[date] = None

    @model_validator(mode='after')
    def at_least_one_target(self):
        if not any([self.pax_id, self.company_id, self.asset_id]):
            raise ValueError("Au moins un de pax_id, company_id, asset_id est requis")
        if self.severity == "temp_ban" and not self.ban_start_date:
            raise ValueError("ban_start_date obligatoire pour temp_ban")
        return self

class IncidentSummary(BaseModel):
    id:           UUID
    severity:     str
    description:  str
    incident_date: date
    ban_end_date: Optional[date]

# ─── Rotation cycle ────────────────────────────────────────

class RotationCycleCreate(BaseModel):
    entity_id:          UUID
    pax_id:             UUID
    site_asset_id:      UUID
    rotation_days_on:   int = Field(..., gt=0)
    rotation_days_off:  int = Field(..., gt=0)
    cycle_start_date:   date
    auto_create_ads:    bool = True
    ads_lead_days:      int = Field(7, ge=1, le=60)
    default_project_id: Optional[UUID] = None
    default_cc_id:      Optional[UUID] = None

class RotationPeriod(BaseModel):
    """Représente une période calculée (on ou off)."""
    start_date:   date
    end_date:     date
    is_on:        bool
    ads_id:       Optional[UUID] = None  # AdS auto-créée si is_on=True
    ads_status:   Optional[str] = None

class RotationForecastResponse(BaseModel):
    cycle_id:     UUID
    pax_name:     str
    site_name:    str
    next_periods: list[RotationPeriod]  # 6 prochaines périodes
```

---


### Schémas Pydantic — Signalement


```python
class SignalementDecision(str, Enum):
    avertissement        = "avertissement"
    exclusion_site       = "exclusion_site"
    blacklist_temporaire = "blacklist_temporaire"
    blacklist_permanent  = "blacklist_permanent"

class SignalementTargetType(str, Enum):
    pax     = "pax"
    team    = "team"
    company = "company"

class SignalementCreate(BaseModel):
    entity_id:              UUID
    target_type:            SignalementTargetType
    target_pax_ids:         Optional[list[UUID]] = None
    target_company_id:      Optional[UUID] = None
    scope_asset_id:         Optional[UUID] = None
    event_date:             date
    event_description:      str = Field(..., min_length=10)
    reason:                 str = Field(..., min_length=5)
    evidence_urls:          list[dict] = []
    decision:               SignalementDecision
    decision_duration_days: Optional[int] = Field(None, gt=0)
    decision_notes:         Optional[str] = None

    @model_validator(mode='after')
    def validate_target(self):
        if self.target_type == 'pax' and not self.target_pax_ids:
            raise ValueError("target_pax_ids obligatoire si target_type=pax")
        if self.target_type == 'company' and not self.target_company_id:
            raise ValueError("target_company_id obligatoire si target_type=company")
        if self.decision == 'exclusion_site' and not self.scope_asset_id:
            raise ValueError("scope_asset_id obligatoire pour exclusion_site")
        if self.decision == 'blacklist_temporaire' and not self.decision_duration_days:
            raise ValueError("decision_duration_days obligatoire pour blacklist_temporaire")
        return self

class SignalementRead(BaseModel):
    id:                       UUID
    reference:                str
    target_type:              SignalementTargetType
    target_pax_summary:       list[dict]    # [{pax_id, nom, photo_url}]
    target_company_name:      Optional[str]
    scope_asset_name:         Optional[str]
    event_date:               date
    event_description:        str
    reason:                   str
    evidence_urls:            list[dict]
    decision:                 SignalementDecision
    decision_duration_days:   Optional[int]
    decision_end_date:        Optional[date]
    decision_notes:           Optional[str]
    status:                   str
    created_by_name:          str
    validated_by_name:        Optional[str]
    validated_at:             Optional[datetime]
    is_active:                bool    # calculé: validated + (permanent OU end_date futur)
    days_remaining:           Optional[int]  # null si permanent
    decision_history:         list[dict]
    class Config: from_attributes = True
```

---


### Schémas Pydantic — AVM


```python
# app/schemas/paxlog/avm.py

class MissionProgramLineCreate(BaseModel):
    order_index:          int = Field(..., ge=0)
    activity_description: str = Field(..., min_length=2, max_length=500)
    activity_type:        Literal["visit","meeting","inspection","training","handover","other"] = "visit"
    site_asset_id:        Optional[UUID] = None
    planned_start_date:   Optional[date] = None
    planned_end_date:     Optional[date] = None
    project_id:           Optional[UUID] = None
    task_id:              Optional[UUID] = None
    same_pax_as_line_id:  Optional[UUID] = None
    pax_ids:              list[UUID] = []
    # Ignoré si same_pax_as_line_id est renseigné
    notes:                Optional[str] = None

    @model_validator(mode='after')
    def validate_dates(self):
        if self.planned_start_date and self.planned_end_date:
            if self.planned_end_date < self.planned_start_date:
                raise ValueError("end_date doit être >= start_date")
        if self.same_pax_as_line_id and self.pax_ids:
            raise ValueError("same_pax_as_line_id et pax_ids sont mutuellement exclusifs")
        return self

class MissionNoticeCreate(BaseModel):
    entity_id:          UUID
    title:              str = Field(..., min_length=3, max_length=300)
    description:        Optional[str] = None
    mission_type:       Literal["standard","vip","regulatory","emergency"] = "standard"
    planned_start_date: Optional[date] = None
    planned_end_date:   Optional[date] = None
    # Indicateurs
    requires_badge:     bool = False
    requires_epi:       bool = False
    requires_visa:      bool = False
    eligible_displacement_allowance: bool = False
    epi_measurements:   Optional[dict] = None
    # Liens projets
    project_links:      list[dict] = []
    # [{project_id, task_id?}]
    # Lignes de programme
    program_lines:      list[MissionProgramLineCreate] = []
    # Parties prenantes
    stakeholders:       list[dict] = []
    # [{user_id? OR external_name+external_email, notification_level}]

class MissionNoticeSummary(BaseModel):
    id:                 UUID
    reference:          str
    title:              str
    status:             str
    mission_type:       str
    planned_start_date: Optional[date]
    planned_end_date:   Optional[date]
    created_by_name:    str
    ads_count:          int        # nb d'AdS liées
    ads_approved_count: int        # nb d'AdS approuvées
    tasks_total:        int        # nb de tâches prépa
    tasks_done:         int        # nb complétées
    class Config: from_attributes = True

class MissionNoticeRead(MissionNoticeSummary):
    entity_id:          UUID
    description:        Optional[str]
    requires_badge:     bool
    requires_epi:       bool
    requires_visa:      bool
    eligible_displacement_allowance: bool
    epi_measurements:   Optional[dict]
    global_attachments_config:  list[dict]
    per_pax_attachments_config: list[dict]
    program_lines:      list["MissionProgramLineRead"]
    preparation_tasks:  list["MissionPreparationTaskRead"]
    stakeholders:       list["MissionStakeholderRead"]
    meeting_slots:      list["MeetingSlotRead"]
    created_at:         datetime
    class Config: from_attributes = True

class MissionPreparationTaskRead(BaseModel):
    id:               UUID
    title:            str
    task_type:        str
    status:           str
    assigned_to_name: Optional[str]
    due_date:         Optional[date]
    reference:        Optional[str]
    auto_generated:   bool
    class Config: from_attributes = True
```


```python
# app/schemas/paxlog/avm.py (suite)

class MissionNoticeUpdate(BaseModel):
    """Modification d'une AVM en draft ou in_preparation (sans PAX sur site)."""
    title:              Optional[str] = Field(None, min_length=3, max_length=300)
    description:        Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date:   Optional[date] = None
    requires_badge:     Optional[bool] = None
    requires_epi:       Optional[bool] = None
    requires_visa:      Optional[bool] = None
    eligible_displacement_allowance: Optional[bool] = None
    epi_measurements:   Optional[dict] = None

class ProgramLineChange(BaseModel):
    """Modification d'une ligne de programme — utilisée dans MissionActiveModification."""
    line_id:              UUID
    planned_start_date:   Optional[date] = None
    planned_end_date:     Optional[date] = None
    activity_description: Optional[str] = None
    project_id:           Optional[UUID] = None
    add_pax_ids:          list[UUID] = []
    remove_pax_ids:       list[UUID] = []
    modification_reason:  str = Field("", min_length=0)
    # Obligatoire (min 10 chars) si l'AdS liée est in_progress

    @model_validator(mode='after')
    def reason_required_if_active(self):
        # La validation du motif se fait côté service (dépend du statut de l'AdS)
        return self

    def to_ads_update(self) -> dict:
        """Convertit en dict compatible AdSUpdate pour le service AdS."""
        update = {}
        if self.planned_start_date:
            update["start_date"] = self.planned_start_date
        if self.planned_end_date:
            update["end_date"] = self.planned_end_date
        if self.add_pax_ids:
            update["add_pax_ids"] = self.add_pax_ids
        if self.remove_pax_ids:
            update["remove_pax_ids"] = self.remove_pax_ids
        return update

class MissionActiveModification(BaseModel):
    """Modification d'une AVM dont certaines AdS sont déjà in_progress."""
    program_line_changes: list[ProgramLineChange] = []
    global_notes:         Optional[str] = None
    # Note globale sur la modification (journalisée dans l'historique AVM)
```

---


---


## 4. Service layer


```python
# app/services/paxlog/dedup_service.py

class DedupService:
    SIMILARITY_THRESHOLD = 0.85  # configurable via settings

    async def check_duplicates(
        self, first_name: str, last_name: str,
        birth_date: date | None, entity_id: UUID, db: AsyncSession
    ) -> DuplicateCheckResponse:
        """
        Recherche de profils similaires via pg_trgm.
        Algorithme:
          1. Normaliser first_name et last_name
          2. Requête PostgreSQL avec similarity() sur les champs normalisés
          3. Calculer score combiné:
               score = 0.5 * similarity(last_name_norm, query_last) +
                       0.3 * similarity(first_name_norm, query_first) +
                       0.2 * (1.0 if birth_date matches else 0.0)
          4. Retourner les candidats avec score > SIMILARITY_THRESHOLD
          5. Inclure les profils de TOUTES les entreprises (pas seulement
             celle du demandeur) pour détecter les cross_company_flag
        """
        fn_norm = normalize_name(first_name)
        ln_norm = normalize_name(last_name)

        # Requête SQL avec pg_trgm
        results = await db.execute(text("""
            SELECT id, first_name, last_name, birth_date, company_id,
                   similarity(last_name_normalized, :ln) AS sim_last,
                   similarity(first_name_normalized, :fn) AS sim_first
            FROM pax_profiles
            WHERE entity_id = :entity_id
              AND archived = FALSE
              AND (
                similarity(last_name_normalized, :ln) > 0.6
                OR similarity(first_name_normalized, :fn) > 0.6
              )
            ORDER BY sim_last DESC, sim_first DESC
            LIMIT 20
        """), {"ln": ln_norm, "fn": fn_norm, "entity_id": entity_id})

        candidates = []
        for row in results:
            score = (0.5 * row.sim_last + 0.3 * row.sim_first +
                     0.2 * (1.0 if birth_date and row.birth_date == birth_date else 0.0))
            if score >= self.SIMILARITY_THRESHOLD:
                candidates.append(DuplicateSearchResult(
                    pax_id=row.id,
                    similarity_score=round(score, 3),
                    ...
                ))

        return DuplicateCheckResponse(
            duplicates_found=len(candidates) > 0,
            candidates=candidates,
            threshold_used=self.SIMILARITY_THRESHOLD
        )

    async def flag_cross_company(
        self, pax_id: UUID, company_id: UUID, ads_id: UUID, db: AsyncSession
    ) -> bool:
        """
        Vérifie si un profil similaire existe dans une AUTRE entreprise.
        Si oui → met cross_company_flag=True sur l'AdS et notifie le validateur.
        """


# app/services/paxlog/compliance_service.py

class ComplianceService:

    async def check_pax_compliance(
        self, pax_id: UUID, asset_id: UUID,
        ads_start_date: date, db: AsyncSession
    ) -> ComplianceCheckResult:
        """
        Vérification exhaustive des prérequis HSE pour un PAX sur un asset.

        Algorithme:
          1. Récupérer tous les assets parents dans la hiérarchie
             (via ltree: asset et ses ancêtres)
          2. Récupérer les ComplianceMatrix pour ces assets
             (héritage: les exigences du parent s'appliquent à l'enfant)
          3. Pour chaque credential_type requis (mandatory=True):
             a. Chercher le PaxCredential correspondant pour ce PAX
             b. Évaluer le statut:
                - MISSING : pas de credential
                - EXPIRED : expiry_date <= ads_start_date
                - NOT_VALIDATED : status=pending_validation
                - VALID : status=valid ET (no expiry OU expiry > ads_start_date)
          4. Calculer is_compliant = tous les mandatory sont VALID
          5. Identifier les warning_items (expiry dans < 30 jours depuis ads_start_date)

        Note: ads_start_date est la date d'arrivée prévue — les certifications
        doivent être valides À cette date, pas aujourd'hui.
        """

    async def check_team_compliance(
        self, pax_ids: list[UUID], asset_id: UUID,
        ads_start_date: date, db: AsyncSession
    ) -> dict[UUID, ComplianceCheckResult]:
        """Check simultané pour toute une équipe — retourne un dict {pax_id: result}."""

    async def update_ads_pax_compliance(
        self, ads_id: UUID, db: AsyncSession
    ) -> None:
        """
        Met à jour le compliance_summary et status de chaque AdSPax.
        Appelé:
          - À la soumission de l'AdS
          - Quand un credential est mis à jour (validé, ajouté)
          - Avant chaque validation par un validateur
        """

    async def send_booking_request(
        self, ads_pax_id: UUID, credential_type_id: UUID, db: AsyncSession
    ) -> None:
        """
        Envoie une demande de booking au service compétent (booking_service_id
        sur CredentialType). Crée un ticket ou envoie un email selon config.
        Met booking_request_sent=True sur AdSPax.
        NE débloque PAS l'AdS — elle reste bloquée jusqu'à preuve validée.
        """


# app/services/paxlog/ads_service.py

class AdSService:

    async def create_ads(
        self, data: AdSCreate, actor: User, db: AsyncSession
    ) -> AdS:
        """
        1. Générer la référence (ADS-YYYY-NNNNN) via reference_sequences
        2. Vérifier que l'asset appartient à l'entité
        3. Vérifier visit_category_requires_planner → si True et planner_activity_id=None → 400
        4. Créer l'AdS en status=draft
        5. Créer les AdSPax pour chaque pax_id
        6. Créer les AdSImputations (valider que sum=100)
        7. Déclencher check_team_compliance en arrière-plan
        8. Audit log
        9. Retourner l'AdS avec compliance_summary pré-calculé
        """

    async def submit_ads(self, ads_id: UUID, actor: User, db: AsyncSession) -> AdS:
        """
        Transition draft → submitted (état transitoire, quelques ms) → routage FSM.

        Logique :
          1. Passer en status=submitted (état transitoire — visible brièvement)
          2. Émettre ads.submitted
          3. Immédiatement router vers la première étape applicable :

             a. should_apply_step_0A(ads) ?
                → pending_initiator_review
                → notifier l'initiateur

             b. Sinon, should_apply_step_0B(ads) ?
                → pending_project_review
                → notifier le chef de projet (ou son délégué)

             c. Sinon, rafraîchir compliance :
                - Certains PAX bloqués → pending_compliance
                - Tous compliant       → pending_validation (notifier CDS)

          4. Vérifier cross_company_flag → alerte si détecté
          5. Vérifier capacité Planner si planner_activity_id renseigné

        Note : status=submitted est persisté avant le routage pour garantir
        la traçabilité (audit log, event bus). Le routage est synchrone et se
        fait dans la même transaction — le client reçoit déjà le statut final.
        """

    async def validate_ads(
        self, ads_id: UUID, req: AdSValidateRequest, actor: User, db: AsyncSession
    ) -> AdS:
        """
        Actions du validateur (N1, N2, SITE_MGR) :

        approve:
          - Pour chaque pax_id dans req.pax_ids (ou tous si None):
              - Vérifier compliance est TOUJOURS valide (re-check)
              - Si toujours valide → AdSPax.status=approved
              - Si invalide entre-temps → garder blocked + notifier
          - Si TOUS les PAX sont approved → AdS.status=approved
          - Émettre ads.approved pour chaque PAX approuvé
          - Calculer priority_score pour chaque AdSPax (pour TravelWiz)

        reject:
          - AdS.status=rejected, AdS.rejection_reason=req.comment
          - Notifier le demandeur
          - Émettre ads.rejected

        request_info:
          - AdS.status=draft (retour au demandeur)
          - Notifier avec req.comment

        escalate:
          - AdS.status=pending_arbitration
          - Notifier le DO
          - Créer ActivityConflict dans Planner si dépassement quota
        """

    async def generate_reference(
        self, entity_id: UUID, year: int, db: AsyncSession
    ) -> str:
        """
        Génère ADS-YYYY-NNNNN de façon atomique via LOCK + UPDATE
        sur la table reference_sequences.
        Garantit l'unicité même en concurrence.
        """
        async with db.begin_nested():
            await db.execute(text(
                "LOCK TABLE reference_sequences IN ROW EXCLUSIVE MODE"
            ))
            result = await db.execute(text("""
                INSERT INTO reference_sequences (prefix, year, last_value)
                VALUES ('ADS', :year, 1)
                ON CONFLICT (prefix, year)
                DO UPDATE SET last_value = reference_sequences.last_value + 1
                RETURNING last_value
            """), {"year": year})
            seq = result.scalar()
            return f"ADS-{year}-{seq:05d}"


# app/services/paxlog/rotation_service.py

class RotationService:

    def get_period_for_date(
        self, cycle: PaxRotationCycle, target_date: date
    ) -> tuple[date, date, bool]:
        """
        Calcule la période (début, fin, is_on) pour une date donnée.
        Algorithme:
          days_since_start = (target_date - cycle.cycle_start_date).days
          cycle_length = rotation_days_on + rotation_days_off
          day_in_cycle = days_since_start % cycle_length
          is_on = day_in_cycle < rotation_days_on
          period_start = target_date - timedelta(days=day_in_cycle % rotation_days_on)
          ...
        """

    def get_next_periods(
        self, cycle: PaxRotationCycle, n: int = 6
    ) -> list[RotationPeriod]:
        """Retourne les N prochaines périodes à partir d'aujourd'hui."""

    async def process_all_cycles(self, db: AsyncSession) -> dict:
        """
        Batch quotidien (6h00) — pour chaque cycle actif avec auto_create_ads=True:
          1. Calculer la prochaine période "on"
          2. Si elle débute dans <= ads_lead_days jours:
             a. Vérifier qu'aucune AdS draft/submitted/approved n'existe déjà
             b. Créer une AdS en status=draft avec visit_category=permanent_ops
             c. Si default_project_id → créer l'imputation
             d. Émettre rotation.ads_auto_created
             e. Notifier le PAX et son responsable
          Retourner {created: N, skipped: N, errors: list}
        """
```

---


### Routage FSM à la soumission (submit_ads)


```
[DEMANDEUR clique "Soumettre"]
         ↓
     status = submitted  ←── persisté + ads.submitted émis
         ↓
   Routage FSM (synchrone, même transaction)
         ↓
   should_apply_step_0A() ?
   ├── Oui → pending_initiator_review   (notif initiateur)
   └── Non → should_apply_step_0B() ?
              ├── Oui → pending_project_review   (notif chef projet)
              └── Non → check_compliance()
                         ├── Bloqués → pending_compliance
                         └── OK      → pending_validation   (notif CDS)

[Le client reçoit le statut final — submitted n'est jamais visible en UI
 sauf dans l'historique/audit log]
```


### Service — Signalement


### Service : SignalementService

```python
class SignalementService:

    async def create(
        self, data: SignalementCreate, actor: User, db: AsyncSession
    ) -> Signalement:
        """Crée un signalement en draft. Vérifie les droits selon la décision."""
        self._check_creation_rights(actor, data.decision)

        reference = await generate_reference("SIG", db)
        end_date = None
        if data.decision_duration_days:
            end_date = data.event_date + timedelta(days=data.decision_duration_days)

        sig = Signalement(
            entity_id=data.entity_id,
            reference=reference,
            target_type=data.target_type.value,
            target_company_id=data.target_company_id,
            scope_asset_id=data.scope_asset_id,
            event_date=data.event_date,
            event_description=data.event_description,
            reason=data.reason,
            evidence_urls=data.evidence_urls,
            decision=data.decision.value,
            decision_duration_days=data.decision_duration_days,
            decision_end_date=end_date,
            decision_notes=data.decision_notes,
            status='draft',
            created_by=actor.id
        )
        db.add(sig)
        await db.flush()

        # Ajouter les PAX ciblés
        if data.target_pax_ids:
            for pax_id in data.target_pax_ids:
                db.add(SignalementPax(signalement_id=sig.id, pax_id=pax_id))

        await db.commit()
        return sig

    async def validate(
        self, signalement_id: UUID, actor: User, db: AsyncSession
    ) -> Signalement:
        """
        Valide le signalement → statut 'validated' → effets immédiats.
        Vérifie les droits selon la décision finale.
        """
        sig = await db.get(Signalement, signalement_id)
        self._check_validation_rights(actor, sig.decision, sig.scope_asset_id)

        sig.status = 'validated'
        sig.validated_by = actor.id
        sig.validated_at = datetime.utcnow()
        await db.commit()

        # Appliquer les effets immédiats
        await self._apply_effects(sig, db)
        return sig

    async def _apply_effects(self, sig: Signalement, db: AsyncSession) -> None:
        """
        Applique les effets du signalement validé :
        - blacklist_* : passe toutes les AdS actives des PAX ciblés en 'rejected'
        - exclusion_site : passe les AdS sur le site concerné en 'requires_review'
        - avertissement : ne bloque rien, ajoute juste le flag visible
        """
        if sig.decision in ('blacklist_temporaire', 'blacklist_permanent'):
            # Rejeter toutes les AdS approved/submitted des PAX ciblés
            pax_ids = [sp.pax_id for sp in sig.signalement_pax]
            ads_to_reject = await db.query(AdS).filter(
                AdS.id.in_(
                    select(AdSPax.ads_id).where(
                        AdSPax.pax_id.in_(pax_ids),
                        AdSPax.status.in_(['approved', 'pending_validation'])
                    )
                )
            ).all()
            for ads in ads_to_reject:
                ads.status = 'rejected'
                ads.rejection_reason = (
                    f"Rejet automatique — Signalement {sig.reference} : "
                    f"{sig.decision} actif"
                )
            # Notification automatique aux demandeurs concernés
            await self._notify_ads_rejections(ads_to_reject, sig, db)

        elif sig.decision == 'exclusion_site':
            # Passer en requires_review les AdS pour ce site
            ads_to_review = await db.query(AdS).filter(
                AdS.site_entry_asset_id == sig.scope_asset_id,
                AdS.id.in_(
                    select(AdSPax.ads_id).where(
                        AdSPax.pax_id.in_([sp.pax_id for sp in sig.signalement_pax])
                    )
                ),
                AdS.status == 'approved'
            ).all()
            for ads in ads_to_review:
                ads.status = 'requires_review'

    async def change_decision(
        self,
        signalement_id: UUID,
        new_decision: SignalementDecision,
        reason: str,
        actor: User,
        db: AsyncSession
    ) -> Signalement:
        """
        Change la décision pendant le statut 'under_review'.
        Trace le changement dans l'historique.
        """
        sig = await db.get(Signalement, signalement_id)
        if sig.status != 'under_review':
            raise HTTPException(409, "DECISION_CHANGE_NOT_ALLOWED",
                detail="La décision ne peut être modifiée qu'en statut under_review")

        # Vérifier les droits pour la NOUVELLE décision
        self._check_validation_rights(actor, new_decision.value, sig.scope_asset_id)

        history = SignalementDecisionHistory(
            signalement_id=signalement_id,
            old_decision=sig.decision,
            new_decision=new_decision.value,
            changed_by=actor.id,
            reason=reason
        )
        db.add(history)
        sig.decision = new_decision.value
        await db.commit()
        return sig

    async def lift(
        self, signalement_id: UUID, reason: str, actor: User, db: AsyncSession
    ) -> Signalement:
        """
        Lève manuellement un signalement validé avant sa date d'expiration.
        Pour blacklist_permanent : DO uniquement.
        """
        sig = await db.get(Signalement, signalement_id)
        if sig.decision == 'blacklist_permanent' and actor.role != 'DO':
            raise HTTPException(403, "INSUFFICIENT_RIGHTS",
                detail="Seul le DO peut lever un blacklist permanent")

        sig.status = 'lifted'
        sig.lifted_by = actor.id
        sig.lifted_at = datetime.utcnow()
        sig.lift_reason = reason
        await db.commit()
        return sig
```

---


### Service AVM — cancel_mission et modify_active_mission


Quand une AVM passe en `cancelled`, toutes les AdS liées non encore
terminées sont annulées automatiquement.

```python
async def cancel_mission(
    self, mission_id: UUID, reason: str, actor: User, db: AsyncSession
) -> MissionNotice:
    """
    Règle : l'AVM NE PEUT PAS être annulée si au moins un PAX est déjà
    sur site (AdS en status 'in_progress'). Dans ce cas, seule une
    modification est possible dans les limites de ce qui a déjà été consommé.

    Si aucun PAX n'est encore sur site → annulation en cascade autorisée.
    """
    mission = await db.get(MissionNotice, mission_id)

    lines = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == mission_id,
            MissionProgram.generated_ads_id.isnot(None)
        )
    )
    all_lines = list(lines.scalars())

    # Vérifier si au moins une AdS est in_progress (PAX sur site)
    blocking_ads = []
    for line in all_lines:
        ads = await db.get(AdS, line.generated_ads_id)
        if ads and ads.status == "in_progress":
            blocking_ads.append(ads)

    if blocking_ads:
        # Annulation bloquée — PAX déjà sur site
        raise HTTPException(
            status_code=409,
            detail={
                "code": "AVM_CANNOT_CANCEL_PAX_ON_SITE",
                "message": (
                    "Cette mission ne peut pas être annulée : "
                    f"{len(blocking_ads)} AdS sont en cours "
                    "(des PAX sont déjà sur site). "
                    "Utilisez la modification pour ajuster les AdS actives "
                    "dans les limites de ce qui a déjà été consommé."
                ),
                "blocking_ads": [
                    {"ads_id": str(a.id), "reference": a.reference,
                     "status": a.status}
                    for a in blocking_ads
                ]
            }
        )

    # Aucun PAX sur site → annulation en cascade autorisée
    CANCELLABLE_STATUSES = {
        "draft", "pending_initiator_review", "pending_project_review",
        "pending_compliance", "pending_validation", "approved"
    }
    for line in all_lines:
        ads = await db.get(AdS, line.generated_ads_id)
        if ads and ads.status in CANCELLABLE_STATUSES:
            ads.status = "cancelled"
            ads.rejection_reason = (
                f"Annulation automatique — AVM {mission.reference} annulée. "
                f"Motif : {reason}"
            )
            await audit_log.record(
                entity_type="ads", entity_id=ads.id,
                action="auto_cancelled",
                new_values={"reason": f"avm_cancelled:{mission.reference}"},
                actor_id=actor.id
            )

    mission.status = "cancelled"
    mission.cancellation_reason = reason
    await db.commit()

    await notification_service.send(
        user_ids=[s.user_id for s in mission.stakeholders if s.user_id],
        message=f"Mission {mission.reference} annulée. Motif : {reason}"
    )
    return mission

async def modify_active_mission(
    self, mission_id: UUID, changes: MissionNoticeUpdate,
    actor: User, db: AsyncSession
) -> MissionNotice:
    """
    Modification d'une AVM dont certaines AdS sont déjà in_progress.

    Règles :
    - Les lignes de programme dont l'AdS est in_progress ne peuvent être
      modifiées que dans les limites de ce qui n'a pas encore été consommé :
        * Dates : la date de début ne peut pas être avancée
          (le PAX est déjà parti à cette date)
        * PAX : on ne peut pas retirer un PAX déjà sur site
        * Site : impossible de changer le site d'une AdS in_progress
          (règle générale AdS)
    - Les modifications sur les lignes dont l'AdS est encore draft/pending
      suivent les règles normales (PATCH programme §10.7)
    - Toute modification d'une ligne dont l'AdS est in_progress déclenche
      la procédure de modification AdS (motif obligatoire, modal d'impact,
      passage en requires_review si nécessaire)
    """
    mission = await db.get(MissionNotice, mission_id)

    for line_change in changes.program_line_changes or []:
        line = await db.get(MissionProgram, line_change.line_id)
        if not line or not line.generated_ads_id:
            continue

        ads = await db.get(AdS, line.generated_ads_id)
        if not ads:
            continue

        if ads.status == "in_progress":
            # Vérifications des limites
            if line_change.planned_start_date and                line_change.planned_start_date < line.planned_start_date:
                raise HTTPException(400, detail={
                    "code": "CANNOT_ADVANCE_START_DATE",
                    "message": "Impossible d'avancer la date de début : le PAX est déjà en déplacement."
                })
            if line_change.remove_pax_ids:
                on_site_pax = await get_pax_on_site(ads.id, db)
                conflicts = set(line_change.remove_pax_ids) & set(on_site_pax)
                if conflicts:
                    raise HTTPException(409, detail={
                        "code": "CANNOT_REMOVE_PAX_ON_SITE",
                        "message": f"{len(conflicts)} PAX sont déjà sur site et ne peuvent pas être retirés.",
                        "pax_ids": list(conflicts)
                    })
            # Déclencher la procédure de modification AdS
            await ads_service.modify_ads_with_reason(
                ads_id=ads.id,
                changes=line_change.to_ads_update(),
                reason=line_change.modification_reason,
                actor=actor, db=db
            )
        else:
            # AdS pas encore in_progress — modification normale de la ligne
            await self._apply_line_change(line, line_change, db)

    await db.commit()
    return mission
```

```sql
ALTER TABLE mission_notices
  ADD COLUMN cancellation_reason TEXT;
```

---


```python

async def modify_active_mission(
    self, mission_id: UUID, changes: MissionNoticeUpdate,
    actor: User, db: AsyncSession
) -> MissionNotice:
    """
    Modification d'une AVM dont certaines AdS sont déjà in_progress.

    Règles :
    - Les lignes de programme dont l'AdS est in_progress ne peuvent être
      modifiées que dans les limites de ce qui n'a pas encore été consommé :
        * Dates : la date de début ne peut pas être avancée
          (le PAX est déjà parti à cette date)
        * PAX : on ne peut pas retirer un PAX déjà sur site
        * Site : impossible de changer le site d'une AdS in_progress
          (règle générale AdS)
    - Les modifications sur les lignes dont l'AdS est encore draft/pending
      suivent les règles normales (PATCH programme §10.7)
    - Toute modification d'une ligne dont l'AdS est in_progress déclenche
      la procédure de modification AdS (motif obligatoire, modal d'impact,
      passage en requires_review si nécessaire)
    """
    mission = await db.get(MissionNotice, mission_id)

    for line_change in changes.program_line_changes or []:
        line = await db.get(MissionProgram, line_change.line_id)
        if not line or not line.generated_ads_id:
            continue

        ads = await db.get(AdS, line.generated_ads_id)
        if not ads:
            continue

        if ads.status == "in_progress":
            # Vérifications des limites
            if line_change.planned_start_date and                line_change.planned_start_date < line.planned_start_date:
                raise HTTPException(400, detail={
                    "code": "CANNOT_ADVANCE_START_DATE",
                    "message": "Impossible d'avancer la date de début : le PAX est déjà en déplacement."
                })
            if line_change.remove_pax_ids:
                on_site_pax = await get_pax_on_site(ads.id, db)
                conflicts = set(line_change.remove_pax_ids) & set(on_site_pax)
                if conflicts:
                    raise HTTPException(409, detail={
                        "code": "CANNOT_REMOVE_PAX_ON_SITE",
                        "message": f"{len(conflicts)} PAX sont déjà sur site et ne peuvent pas être retirés.",
                        "pax_ids": list(conflicts)
                    })
            # Déclencher la procédure de modification AdS
            await ads_service.modify_ads_with_reason(
                ads_id=ads.id,
                changes=line_change.to_ads_update(),
                reason=line_change.modification_reason,
                actor=actor, db=db
            )
        else:
            # AdS pas encore in_progress — modification normale de la ligne
            await self._apply_line_change(line, line_change, db)

    await db.commit()
    return mission
```

```sql
ALTER TABLE mission_notices
  ADD COLUMN cancellation_reason TEXT;
```

```


---


## 5. API endpoints


### 5.1 Profils PAX

```
POST   /api/v1/pax/profiles
  Body: PaxProfileCreate
  Response 201: PaxProfileRead
  Erreurs:
    400 EXTERNAL_REQUIRES_COMPANY
    400 COMPANY_NOT_IN_ENTITY
  Note: appelle automatiquement DedupService.check_duplicates en amont
        Si duplicates_found → retourne 200 avec DuplicateCheckResponse
        (pas de création — l'appelant doit choisir ou confirmer)

POST   /api/v1/pax/profiles/check-duplicate
  Body: { first_name, last_name, birth_date?, entity_id }
  Response 200: DuplicateCheckResponse
  Note: endpoint dédié appelé en temps réel pendant la saisie (debounce 500ms côté UI)

POST   /api/v1/pax/profiles/confirm-create
  Body: PaxProfileCreate + { confirmed: true, duplicate_pax_id: UUID? }
  Response 201: PaxProfileRead
  Note: utilisé quand l'utilisateur a vu les candidats et confirme la création
        Si duplicate_pax_id → fusion des profils (merge)

GET    /api/v1/pax/profiles
  Query: entity_id, q (recherche texte), type, company_id, group_id,
         status, page, per_page
  Response 200: PaginatedResponse[PaxProfileRead]

GET    /api/v1/pax/profiles/:id
  Response 200: PaxProfileRead (avec credentials et incidents actifs)

PATCH  /api/v1/pax/profiles/:id
  Body: PaxProfileUpdate
  Response 200: PaxProfileRead
  Note: les profils internal synchronisés (synced_from_intranet=True)
        ne peuvent pas être modifiés manuellement — 409 SYNCED_FROM_INTRANET

GET    /api/v1/pax/profiles/:id/compliance/:asset_id
  Query: check_date (défaut: aujourd'hui)
  Response 200: ComplianceCheckResult
  Note: endpoint clé pour PaxLog et les widgets du validateur

GET    /api/v1/pax/profiles/:id/ads-history
  Query: page, per_page, status
  Response 200: PaginatedResponse[AdsSummary]
```

### 5.2 Credentials

```
GET    /api/v1/pax/profiles/:id/credentials
  Response 200: list[PaxCredentialRead]

POST   /api/v1/pax/profiles/:id/credentials
  Body: PaxCredentialCreate
  Response 201: PaxCredentialRead (status=pending_validation)
  Note: le credential reste en pending_validation jusqu'à validation HSE_ADMIN/PAX_ADMIN

POST   /api/v1/pax/profiles/:id/credentials/:cid/proof
  Body: multipart/form-data { file: File }
  Response 200: { proof_url: str }
  Note: upload vers S3, met à jour proof_url sur le credential

PATCH  /api/v1/pax/profiles/:id/credentials/:cid/validate
  Body: { action: "approve"|"reject", rejection_reason?: str }
  Response 200: PaxCredentialRead
  Droits: HSE_ADMIN | PAX_ADMIN | MEDICAL (pour médicaux)
  Effets: si approve → recalculer compliance sur les AdS en pending_compliance
          liées à ce PAX → des PAX bloqués peuvent se débloquer automatiquement

PATCH  /api/v1/pax/profiles/:id/credentials/:cid
  Body: PaxCredentialUpdate
  Response 200: PaxCredentialRead
  Note: remet status=pending_validation si dates ou proof_url changent
```

### 5.3 Matrice de prérequis HSE

```
GET    /api/v1/pax/compliance-matrix
  Query: entity_id, asset_id
  Response 200: list[ComplianceMatrixRead]
  Note: retourne aussi les exigences héritées des assets parents
        avec indication defined_by=hse_central|site

POST   /api/v1/pax/compliance-matrix
  Body: ComplianceMatrixCreate
  Droits: HSE_ADMIN (peut créer pour tous assets), SITE_MGR (asset de son site uniquement)
  Response 201: ComplianceMatrixRead
  Erreurs: 409 ALREADY_EXISTS si même (asset_id, credential_type_id, scope)

DELETE /api/v1/pax/compliance-matrix/:id
  Droits: HSE_ADMIN uniquement pour les entrées hse_central
          SITE_MGR pour les entrées de son site
  Response 200: { deleted: true }

GET    /api/v1/pax/credential-types
  Query: category, active
  Response 200: list[CredentialTypeRead]

POST   /api/v1/pax/credential-types
  Body: CredentialTypeCreate
  Droits: HSE_ADMIN
  Response 201: CredentialTypeRead
```

### 5.4 Avis de Séjour

```
POST   /api/v1/pax/ads
  Body: AdSCreate
  Response 201: AdSRead (avec compliance déjà calculée)
  Erreurs:
    400 INVALID_DATES
    400 IMPUTATION_NOT_100
    400 PLANNER_ACTIVITY_REQUIRED — visit_category nécessite une activité Planner
    404 PAX_NOT_FOUND
    404 ASSET_NOT_FOUND
    409 PAX_OVERLAP — chevauchement interdit sur ce site (si configuré)

GET    /api/v1/pax/ads
  Query: entity_id, status (multi-valeur), asset_id, requester_id,
         start_from, start_to, pax_id, project_id, page, per_page
  Response 200: PaginatedResponse[AdSRead]

GET    /api/v1/pax/ads/:id
  Response 200: AdSRead (complet avec compliance, incidents, capacité Planner)

POST   /api/v1/pax/ads/:id/submit
  Response 200: AdSRead
  Erreurs:
    409 ALREADY_SUBMITTED
    400 NO_COMPLIANT_PAX — tous les PAX sont bloqués

POST   /api/v1/pax/ads/:id/validate
  Body: AdSValidateRequest
  Droits: VAL_N1 | VAL_N2 | SITE_MGR | DO
  Response 200: AdSRead
  Erreurs:
    400 MISSING_COMMENT — comment obligatoire pour reject/request_info
    403 NOT_IN_WORKFLOW  — l'acteur n'est pas dans le workflow de cette AdS
    409 COMPLIANCE_CHANGED — la compliance a changé depuis le dernier affichage

POST   /api/v1/pax/ads/:id/cancel
  Body: { reason: str }
  Droits: requester (si status=draft|submitted) | DO (toujours)
  Response 200: AdSRead

GET    /api/v1/pax/ads/:id/compliance
  Response 200: list[ComplianceCheckResult]  — un résultat par PAX
  Note: recalcule la compliance en temps réel à chaque appel

POST   /api/v1/pax/ads/:id/booking-request/:ads_pax_id
  Body: { credential_type_id: UUID }
  Response 200: { sent: true, service_name: str }

GET    /api/v1/pax/ads/pending-validation
  Query: entity_id, asset_id (optionnel)
  Response 200: PaginatedResponse[AdSRead]
  Note: endpoint dédié pour le tableau de bord validateur
        Inclut: statut compliance, incidents actifs, capacité Planner
```

### 5.5 Portail externe (apps légères — auth par token)

```
-- Ces endpoints sont sur ext.app.opsflux.io/api/
-- Rate limit: 10 req/min par IP

POST   /api/ext/pax/otp/send
  Body: { token: str }
  Response 200: { otp_sent: true, masked_destination: str }
  Note: envoie l'OTP à external_access_links.otp_sent_to
        Loggue IP + timestamp dans access_log

POST   /api/ext/pax/otp/validate
  Body: { token: str, otp: str }
  Response 200: { session_token: str, expires_in: 3600 }
  Note: le session_token est un JWT à courte durée pour naviguer dans ce portail

GET    /api/ext/pax/ads
  Header: Authorization: Bearer {session_token}
  Response 200: AdSRead (version limitée — données pré-configurées seulement)

POST   /api/ext/pax/profiles
  Header: Authorization: Bearer {session_token}
  Body: PaxProfileCreate (type=external obligatoire)
  Response 201: PaxProfileRead
  Note: création avec vérif doublon auto
        PAX créé est automatiquement ajouté à l'AdS (via ads_id du token)

POST   /api/ext/pax/ads/submit
  Header: Authorization: Bearer {session_token}
  Response 200: { submitted: true, reference: str }
```

### 5.6 Liens d'accès externes

```
POST   /api/v1/pax/ads/:id/external-link
  Body: ExternalLinkCreate
  Response 201: ExternalLinkRead (token affiché une seule fois)
  Note: le token ne peut plus être récupéré après — stocker côté client

GET    /api/v1/pax/ads/:id/external-links
  Response 200: list[ExternalLinkRead] (sans le token — sécurité)

POST   /api/v1/pax/ads/:id/external-links/:link_id/revoke
  Response 200: { revoked: true }
```

### 5.7 Incidents

```
GET    /api/v1/pax/incidents
  Query: entity_id, pax_id, company_id, asset_id, severity, resolved, page, per_page
  Response 200: PaginatedResponse[IncidentRead]

POST   /api/v1/pax/incidents
  Body: IncidentCreate
  Droits: VAL_N1 | VAL_N2 | SITE_MGR | PAX_ADMIN | DO
  Response 201: IncidentRead

PATCH  /api/v1/pax/incidents/:id/resolve
  Body: { resolution_notes: str }
  Response 200: IncidentRead
  Droits: PAX_ADMIN | DO
```

### 5.8 Rotations

```
GET    /api/v1/pax/rotation-cycles
  Query: entity_id, pax_id, site_asset_id, status
  Response 200: list[RotationCycleRead]

POST   /api/v1/pax/rotation-cycles
  Body: RotationCycleCreate
  Droits: PAX_ADMIN | SITE_MGR | DO
  Response 201: RotationCycleRead
  Erreurs: 409 DUPLICATE_CYCLE (même PAX/site déjà actif)

GET    /api/v1/pax/rotation-cycles/:id/forecast
  Query: periods=6
  Response 200: RotationForecastResponse

PATCH  /api/v1/pax/rotation-cycles/:id/suspend
  Response 200: RotationCycleRead

POST   /api/v1/pax/rotation-cycles/:id/end
  Response 200: RotationCycleRead
```

### 5.9 Programme de Séjour (Phase 2)

```
POST   /api/v1/pax/stay-programs
  Body: StayProgramCreate (ads_id, pax_id, movements)
  Response 201: StayProgramRead
  Pré-condition: l'AdS doit être en status=approved et le PAX=approved

POST   /api/v1/pax/stay-programs/:id/submit
  Response 200: StayProgramRead

POST   /api/v1/pax/stay-programs/:id/approve
  Droits: LOG_COORD (logisticien sur site)
  Response 200: StayProgramRead
  Effets: émet stay_program.approved → TravelWiz génère les trips intra-champ

POST   /api/v1/pax/stay-programs/:id/reject
  Body: { reason: str }
  Response 200: StayProgramRead
```

---


### 5.10 Portail externe — génération de liens


### Deux contextes de génération

#### Contexte 1 : Lien lié à une AdS spécifique (existant — clarifié)

Un utilisateur interne (DEMANDEUR, CDS, LOG_BASE, etc.) crée une AdS, puis génère un lien pour qu'un superviseur externe complète les données de son équipe **pour cette demande précise**.

**Ce que le superviseur externe peut faire :**
- Voir les données pré-remplies (site, dates, projet, objet)
- Ajouter les PAX de son équipe (noms, certifications, photos)
- Uploader les justificatifs
- Soumettre l'AdS

**Durée de vie :** configurable (défaut 72h). Révocable à tout moment.

**Endpoint :**
```
POST /api/v1/pax/ads/:id/external-link
Body: {
  otp_sent_to: "email@entreprise.com" | "+237XXXXXXXX",
  expires_in_hours: 72,
  max_uses: 1,
  preconfigured_data: {
    site_name: "Munja",
    dates: "10-20 mai 2026",
    instructions: "Merci de compléter les profils de votre équipe avant le 8 mai."
  }
}
Response: { link_url: "https://ext.app.opsflux.io/{token}", qr_code_url: "..." }
```

#### Contexte 2 : Lien de gestion d'équipe depuis le module Tiers (nouveau)

**Indépendant de toute AdS.** Permet à un représentant d'une entreprise externe de **maintenir à jour les profils et certifications de son équipe** à tout moment, sans attendre qu'une AdS soit créée.

**Cas d'usage :** Perenco génère un lien pour DIXSTONE. Le responsable DIXSTONE peut vérifier et mettre à jour les profils, renouveler les certifications expirées, ajouter de nouveaux membres de son équipe. Quand une AdS sera créée plus tard, les profils seront déjà à jour.

**Ce que le lien permet :**
- Voir la liste des PAX de son entreprise enregistrés dans OpsFlux
- Voir le statut de compliance de chaque PAX (✓/⚠/✗ par site cible optionnel)
- Mettre à jour les données identitaires
- Uploader/renouveler des justificatifs de certifications
- Ajouter de nouveaux membres
- Voir les signalements actifs qui les concernent (avertissements visibles, pas les détails confidentiels)

**Ce que le lien ne permet PAS :**
- Créer des AdS
- Voir les données d'autres entreprises
- Modifier les décisions de compliance (c'est CHSE/HSE_SITE qui valide)
- Voir les données de PAX masqués (`hidden = true`)

**Génération depuis le module Tiers :**
```
POST /api/v1/tiers/:company_id/external-link
Body: {
  otp_sent_to: "responsable@dixstone.com",
  scope_asset_id: null,       -- null = accès global, ou un asset pour focus compliance
  expires_in_days: 30,        -- lien longue durée pour gestion équipe
  max_uses: null,             -- illimité pendant la période
  can_add_pax: true,
  can_update_certifications: true,
  instructions: "Merci de mettre à jour les certifications de votre équipe..."
}
Response: { link_url: "...", expires_at: "..." }
```

**URL portail :** `https://ext.app.opsflux.io/team/{token}` (distinct de `/ads/{token}`)

**Différences clés avec le lien AdS :**

| Aspect | Lien AdS | Lien Tiers |
|---|---|---|
| Périmètre | Une AdS spécifique | Tous les profils de l'entreprise |
| Durée typique | 24-72h | 7-30 jours |
| Utilisation | 1 (soumission unique) | Multiple (gestion continue) |
| Peut soumettre une AdS | ✓ | ✗ |
| Peut renouveler certifications | ✓ (dans l'AdS) | ✓ (en continu) |
| Voir compliance par site | ✗ | ✓ (optionnel) |
| Généré depuis | PaxLog (sur l'AdS) | Module Tiers |

**Table `external_access_links` — nouveau champ :**
```sql
ALTER TABLE external_access_links
  ADD COLUMN link_type VARCHAR(20) NOT NULL DEFAULT 'ads'
    CHECK (link_type IN ('ads', 'team_management'));
ALTER TABLE external_access_links
  ADD COLUMN target_company_id UUID REFERENCES tiers(id);
-- Pour link_type='team_management', ads_id est null et target_company_id est renseigné
```

**Endpoints portail "team management" :**
```
GET  /api/ext/team/:token/pax           Voir les PAX de l'entreprise
POST /api/ext/team/:token/pax           Ajouter un nouveau PAX
PATCH /api/ext/team/:token/pax/:pax_id  Mettre à jour un PAX
POST /api/ext/team/:token/pax/:pax_id/credentials  Uploader certification
GET  /api/ext/team/:token/compliance    Voir compliance par site (si scope_asset_id)
```

---


### 5.11 Profils métier et habilitations


```
# Profils métier (référentiel)
GET    /api/v1/pax/profile-types                      Liste des profils métier
POST   /api/v1/pax/profile-types                      Créer (DQHSE + CHSE)
PATCH  /api/v1/pax/profile-types/:id                  Modifier

# Matrice d'habilitation par profil
GET    /api/v1/pax/profile-types/:id/matrix           Exigences du profil
POST   /api/v1/pax/profile-types/:id/matrix           Ajouter une exigence (CHSE)
DELETE /api/v1/pax/profile-types/:id/matrix/:cid      Retirer une exigence

# Profils PAX
GET    /api/v1/pax/profiles/:id/profile-types         Profils métier d'un PAX
POST   /api/v1/pax/profiles/:id/profile-types         Assigner un profil
DELETE /api/v1/pax/profiles/:id/profile-types/:pid    Retirer un profil

# Autodéclarations (sur une AdS)
POST   /api/v1/pax/ads/:ads_id/pax/:pax_id/declare
  Body: {
    declared_profile_type_id: UUID,
    declarations: [{
      credential_type_id: UUID,
      declared: bool,
      proof_file?: multipart
    }]
  }
  Response 200: AdSPaxRead (avec compliance_summary mis à jour)

# Validation autodéclarations (CHSE)
GET    /api/v1/pax/self-declarations/pending          File CHSE
POST   /api/v1/pax/self-declarations/:id/validate     Valider
POST   /api/v1/pax/self-declarations/:id/reject       Rejeter (motif obligatoire)
```

---


### 5.12 Signalements


```
POST   /api/v1/pax/signalements
  Body: SignalementCreate
  Droits: CDS | CHSE | DQHSE | DPROD | DO | HSE_SITE
  Response 201: SignalementRead

GET    /api/v1/pax/signalements
  Query: entity_id, status, decision, target_type, pax_id, company_id,
         asset_id, is_active, page, per_page
  Response 200: PaginatedResponse[SignalementRead]

GET    /api/v1/pax/signalements/:id
  Response 200: SignalementRead (avec historique décisions)

POST   /api/v1/pax/signalements/:id/submit
  Response 200: SignalementRead (draft → submitted)
  Droits: créateur du signalement

POST   /api/v1/pax/signalements/:id/take-review
  Response 200: SignalementRead (submitted → under_review)
  Droits: validateurs selon décision

PATCH  /api/v1/pax/signalements/:id/decision
  Body: { new_decision: str, reason: str }
  Response 200: SignalementRead
  Droits: validateurs selon NOUVELLE décision
  Note: seulement en statut under_review

POST   /api/v1/pax/signalements/:id/validate
  Response 200: SignalementRead (under_review → validated)
  Effets: applique les blocages selon la décision

POST   /api/v1/pax/signalements/:id/reject
  Body: { reason: str }
  Response 200: SignalementRead

POST   /api/v1/pax/signalements/:id/lift
  Body: { reason: str }
  Response 200: SignalementRead
  Droits: DQHSE, DO. Pour blacklist_permanent: DO uniquement

# Vue PAX — ses signalements actifs
GET    /api/v1/pax/profiles/:id/signalements
  Query: is_active, asset_id
  Response 200: list[SignalementRead]

# Badge rapide pour afficher dans les listes
GET    /api/v1/pax/profiles/:id/signalement-badge
  Response 200: { has_active_blocking: bool, has_active_warning: bool,
                  has_history: bool, active_count: int }
```

---


### 5.13 AVM — endpoints


### 15.7 Endpoints AVM

```
POST   /api/v1/pax/mission-notices
  Body: MissionNoticeCreate
  Droits: LOG_BASE | CHEF_PROJET | DEMANDEUR | DO

GET    /api/v1/pax/mission-notices
  Query: entity_id, status, created_by, start_after, start_before, page, per_page

GET    /api/v1/pax/mission-notices/:id

PATCH  /api/v1/pax/mission-notices/:id
  Note: modification autorisée en draft et in_preparation uniquement

POST   /api/v1/pax/mission-notices/:id/launch
  Droits: créateur | CHEF_PROJET lié | DO

POST   /api/v1/pax/mission-notices/:id/cancel
  Body: { reason: str }
  Erreur 409 AVM_CANNOT_CANCEL_PAX_ON_SITE :
    Si au moins une AdS liée est en status 'in_progress' (PAX sur site).
    → L'initiateur doit utiliser PATCH pour modifier les lignes actives.

PATCH  /api/v1/pax/mission-notices/:id/modify-active
  Body: MissionActiveModification {
    program_line_changes: [{
      line_id:              UUID,
      planned_start_date?:  date,    -- ne peut pas être avancée si AdS in_progress
      planned_end_date?:    date,
      add_pax_ids?:         list[UUID],
      remove_pax_ids?:      list[UUID],  -- bloqué si PAX déjà sur site
      modification_reason:  str          -- obligatoire si AdS in_progress
    }]
  }
  Note: endpoint dédié aux modifications d'AVM avec PAX déjà sur site.
        Pour les modifications sans PAX sur site, PATCH /mission-notices/:id suffit.
  Droits: créateur | CHEF_PROJET lié | DO

# Programme
POST   /api/v1/pax/mission-notices/:id/program
PATCH  /api/v1/pax/mission-notices/:id/program/:line_id
  Règles selon l'état de l'AdS liée (generated_ads_id) :
  - AdS null (pas encore créée) → modification libre
  - AdS en draft                → modification libre + sync automatique sur l'AdS
  - AdS soumise ou approuvée    → 409 LINKED_ADS_IMMUTABLE
      { message: "L'AdS liée doit être annulée avant de modifier cette ligne",
        ads_id, ads_reference, ads_status }
  - AdS annulée/rejetée         → modification libre, generated_ads_id remis à null
                                    (une nouvelle AdS peut être créée)

DELETE /api/v1/pax/mission-notices/:id/program/:line_id
  Même règles que PATCH — bloqué si AdS soumise ou approuvée

POST   /api/v1/pax/mission-notices/:id/program/:line_id/create-ads
  Note: création manuelle si la ligne n'a pas été auto-générée ou si l'AdS précédente a été annulée

# Travaux préparatoires
GET    /api/v1/pax/mission-notices/:id/preparation
POST   /api/v1/pax/mission-notices/:id/preparation
PATCH  /api/v1/pax/mission-notices/:id/preparation/:task_id

# Rapport de préparation
GET    /api/v1/pax/mission-notices/:id/readiness
  Response: { ready: bool, completion_pct: float, pending_items: [...] }

# Parties prenantes
POST   /api/v1/pax/mission-notices/:id/stakeholders
DELETE /api/v1/pax/mission-notices/:id/stakeholders/:id

# Créneaux de réunion
GET    /api/v1/pax/mission-notices/:id/meetings
POST   /api/v1/pax/mission-notices/:id/meetings
  Body: MeetingSlotCreate
PATCH  /api/v1/pax/mission-notices/:id/meetings/:meeting_id
DELETE /api/v1/pax/mission-notices/:id/meetings/:meeting_id

# Documents
POST   /api/v1/pax/mission-notices/:id/attachments
  Body: multipart { file, doc_type }
```


### 5.14 AVM — modification active (PAX sur site)


---


## 6. Règles de validation


| Règle | Condition | Erreur |
|---|---|---|
| R-PAX-01 | PAX externe → company_id obligatoire | `400 EXTERNAL_REQUIRES_COMPANY` |
| R-PAX-02 | PAX interne synchronisé → non modifiable manuellement | `409 SYNCED_FROM_INTRANET` |
| R-PAX-03 | Nom similaire → DuplicateCheckResponse avant création | `200 DUPLICATE_CANDIDATES` |
| R-PAX-04 | Credential expiry_date > obtained_date | `400 INVALID_CREDENTIAL_DATES` |
| R-PAX-05 | Preuve requise (proof_required=True) → proof_url avant validation | `400 PROOF_REQUIRED` |
| R-PAX-06 | AdS end_date >= start_date | `400 INVALID_DATES` |
| R-PAX-07 | SUM(imputations.percentage) = 100 | `400 IMPUTATION_NOT_100` |
| R-PAX-08 | visit_category_requires_planner → planner_activity_id non null | `400 PLANNER_ACTIVITY_REQUIRED` |
| R-PAX-09 | Type individual → exactement 1 PAX | `400 INDIVIDUAL_ONE_PAX` |
| R-PAX-10 | Chevauchement AdS si asset.allow_overlap=False | `409 PAX_OVERLAP` |
| R-PAX-11 | Validation → compliance toujours valide au moment du clic | `409 COMPLIANCE_CHANGED` |
| R-PAX-12 | Incident severity=temp_ban → ban_start_date non null | `400 MISSING_BAN_DATE` |
| R-PAX-13 | Rotation → un seul cycle actif par PAX/site | `409 DUPLICATE_CYCLE` |
| R-PAX-14 | StayProgram → AdS doit être approved | `409 ADS_NOT_APPROVED` |
| R-PAX-15 | Token portail externe → expiré ou use_count >= max_uses | `401 LINK_EXPIRED` |
| R-PAX-16 | OTP → valide 10min max | `401 OTP_EXPIRED` |
| R-PAX-17 | Cross-company flag → avertissement obligatoire au validateur | Avertissement visible, pas bloquant |
| R-PAX-18 | PAX avec ban actif sur le site → AdS bloquée automatiquement | `409 PAX_BANNED` |

---


### Règles R-SIG — Signalements


### Règles de validation R-SIG

| Règle | Condition | Comportement |
|---|---|---|
| R-SIG-01 | `blacklist_*` actif → création AdS | AdS créée mais PAX en statut `blocked_by_signalement` dès la soumission |
| R-SIG-02 | `blacklist_*` actif → validation AdS | Validation impossible pour ce PAX. Bouton "Valider tout" désactivé. |
| R-SIG-03 | `blacklist_temporaire` → date dépassée | Auto-expire. Flag passe en bleu. AdS débloquées automatiquement. |
| R-SIG-04 | `avertissement` actif → validation AdS | Validation possible après acquittement obligatoire (clic + commentaire) |
| R-SIG-05 | `exclusion_site` → AdS sur autre site | Aucun effet (signalement scoped à un site) |
| R-SIG-06 | Signalement sur `company` | S'applique à TOUS les PAX de cette entreprise dans le périmètre |
| R-SIG-07 | Signalement levé/expiré → badge bleu | Historique toujours visible, aucun effet bloquant |
| R-SIG-08 | Signalement `blacklist_permanent` → levée | DO uniquement, motif obligatoire, tracé dans audit log |

---


### Règles de modification d'une AdS


### Principe général

Toute modification d'une AdS ayant atteint le statut `submitted` ou au-delà requiert un **motif documenté**. La nature du motif varie selon le statut de l'AdS et le type de modification.

### Matrice motif × modification × statut

| Action | Statut AdS | Motif | Qui peut le faire |
|---|---|---|---|
| Modifier les dates | `draft` | Non requis | Demandeur |
| Ajouter un PAX | `draft` | Non requis | Demandeur |
| Modifier les dates | `submitted`/`pending_*` | **Obligatoire** | Demandeur |
| Retirer un PAX | `submitted`/`pending_*` | **Obligatoire** | Demandeur |
| Modifier les dates | `approved` | **Obligatoire** | Demandeur / CDS / DO |
| Prolonger le séjour | `approved` / `in_progress` | **Obligatoire** | Demandeur / CDS / DO |
| Raccourcir le séjour | `approved` / `in_progress` | **Obligatoire** | OMAA / CDS / DO |
| Ajouter un PAX | `approved` | **Obligatoire** + re-validation | Demandeur / CDS |
| Retirer un PAX | `approved` / `in_progress` | **Obligatoire** | OMAA / CDS / DO |
| Changer le site | `approved` | Interdit — annuler et recréer | — |

### Modification d'une AdS approuvée ou en cours

Quand une AdS `approved` ou `in_progress` est modifiée :

1. **Motif saisi par l'initiateur** (champ texte libre, min 10 caractères)
2. **Impact calculé automatiquement** : manifestes TravelWiz impactés, PAX à notifier
3. **Confirmation avec liste des impacts** (même logique que le modal d'impact Planner)
4. **Après confirmation :**
   - L'événement `ads_modified` est enregistré dans `ads_events` avec le motif
   - Les manifestes TravelWiz concernés passent en `requires_review`
   - Les PAX de l'AdS sont notifiés selon la configuration
   - L'audit log enregistre : qui, quand, quelle modification, quel motif

### Champs ajoutés sur la table `ads`

```sql
ALTER TABLE ads
  ADD COLUMN last_modification_reason TEXT,
  -- Dernier motif de modification (dénormalisé pour affichage rapide)
  ADD COLUMN modification_count        SMALLINT NOT NULL DEFAULT 0;
  -- Nombre total de modifications depuis la création
-- L'historique complet reste dans ads_events
```

### Événement tracé dans `ads_events`

```python
# Type d'événement ajouté à la liste existante
'modified'  # Modification d'une AdS soumise/approuvée/en cours
# payload: {
#   field_changed: 'dates' | 'pax_added' | 'pax_removed' | 'extension',
#   old_value: {...},
#   new_value: {...},
#   reason: "text saisi par l'utilisateur",
#   impacts: {manifests_affected: N, pax_notified: N}
# }
```

---


### Règle — `requires_review` : sortie et réévaluation


### Principe (A1 confirmé)

Quand une AdS passe en `requires_review`, elle est **gelée**. Aucune transition
automatique ne la remet en circuit. C'est le demandeur qui reprend la main,
modifie ce qui doit l'être, et resoumet — déclenchant une réévaluation complète
du workflow depuis le début.

### Transitions depuis `requires_review`

```
requires_review
  ↓ Le demandeur consulte les notifications et comprend pourquoi
  ↓ Il modifie l'AdS (dates, PAX, vecteur retour, etc.)
  ↓ Il clique "Resoumettre"
  ↓
  ├── Si compliance HSE à recalculer → pending_compliance
  └── Si compliance OK → pending_validation  (workflow reprend depuis N1)
```

Le workflow **repart du début** — la validation N1 est à refaire même si elle
avait déjà été accordée avant le passage en `requires_review`. Cela garantit
que la décision de validation est toujours prise sur la version actuelle des
données.

**Exception :** Si l'AdS est `in_progress` et passe en `requires_review`
(ex : absence OMAA non confirmée), la resoumettre ne re-déclenche pas une
validation N1 — elle repasse directement en `in_progress` après confirmation
du CDS (le PAX est déjà sur site, le workflow allégé s'applique).

### Qui peut resoumettre

| Contexte | Qui peut resoumettre |
|---|---|
| AdS `requires_review` avant départ | Demandeur original |
| AdS `in_progress` en `requires_review` | Demandeur + OMAA + CDS |
| Délai > 7 jours sans action | CDS et DO peuvent forcer `rejected` (avec motif) |

### Motif obligatoire à la resoumission

```python
class AdsResubmitRequest(BaseModel):
    reason: str = Field(..., min_length=10)
    # Motif obligatoire : "qu'est-ce qui a changé depuis le requires_review ?"
    # Affiché dans la timeline de l'AdS et dans la notification au validateur
```

### Règle complémentaire : expiration du `requires_review`

Si une AdS reste en `requires_review` sans action pendant `N jours`
(configurable, défaut = 14 jours) → notification de rappel au demandeur
et au CDS. Après `2×N jours` → CDS peut forcer `cancelled` avec motif.

---


### Règle — Rejet partiel d'une AdS d'équipe


### Règle

Sur une AdS d'équipe, le validateur peut approuver et rejeter des PAX
individuellement. L'AdS passe en `approved` dès qu'au moins un PAX est approuvé,
même si d'autres sont rejetés.

**Les PAX rejetés dans cette AdS sont définitifs** — leur rejet ne peut pas
être annulé dans le cadre de cette AdS. Pour les faire passer quand même,
le demandeur doit créer une **nouvelle AdS** pour eux.

### Statuts `ads_pax` après validation partielle

| `ads_pax.status` | Signification |
|---|---|
| `approved` | PAX validé → transmis à TravelWiz |
| `rejected` | PAX rejeté définitivement dans cette AdS |
| `blocked` | PAX non conforme HSE (toujours en attente de compliance) |

### Statut de l'AdS selon les `ads_pax`

```python
def compute_ads_status_after_validation(ads_pax_list: list[AdSPax]) -> str:
    statuses = {p.status for p in ads_pax_list}

    if not statuses - {"rejected", "blocked"}:
        # Tous rejetés ou bloqués → AdS entièrement rejetée
        return "rejected"

    if "approved" in statuses:
        # Au moins un PAX approuvé → AdS approved (partiel possible)
        return "approved"

    return "pending_validation"  # ne devrait pas arriver en sortie de validation
```

### Ce que voit le demandeur après rejet partiel

```
AdS ADS-2026-04521 — Équipe DIXSTONE — Munja — 14-20 mai
Statut : APPROUVÉE (3/5 PAX)
─────────────────────────────────────────────────
✓ Jean DUPONT      → manifeste TravelWiz
✓ Amadou NZIE      → manifeste TravelWiz
✓ Marie FOTSO      → manifeste TravelWiz
✗ Paul MBALLA      REJETÉ — "Antécédent incident site Munja 2025"
✗ Roger EKWALLA    REJETÉ — "Quota entreprise atteint sur ce site"

Pour soumettre Paul MBALLA et Roger EKWALLA :
[Créer une nouvelle AdS pour les PAX rejetés →]
```

Le bouton "Créer une nouvelle AdS pour les PAX rejetés" pré-remplit une
nouvelle AdS avec les PAX rejetés, les mêmes dates, site et projet — le
demandeur n'a qu'à modifier ce qui doit l'être et resoumettre.

### Règle de non-réouverture

Un `ads_pax.status = 'rejected'` ne peut jamais repasser en `pending` ou
`valid` dans la même AdS. La ligne est immuable dès la validation.

---


### Règle — Visite d'une journée (A5)


Un auditeur arrive et repart le même jour. OpsFlux crée **deux voyages
distincts** : un manifeste aller et un manifeste retour, sur le même
vecteur ou différents selon disponibilité. Le `CHECK (end_date >= start_date)`
autorise end_date == start_date.

TravelWiz génère normalement les deux manifestes (outbound + inbound).
La seule différence opérationnelle : le LOG_BASE planifie les deux dans la
même journée, potentiellement sur le même voyage aller-retour du vecteur.

---


### Règle — Signalement entreprise et PAX actifs (A4)


Les AdS `in_progress` ou `approved` de PAX appartenant à une entreprise
blacklistée passent en `requires_review`. Le CDS décide au cas par cas.
Aucun rejet automatique en masse — un PAX déjà sur site ne peut pas être
expulsé sans décision humaine.

```python
# Dans on_signalement_validated, cas target_type='company'
if decision in ("blacklist_temporaire", "blacklist_permanent"):
    # AdS en attente → rejet automatique (pas encore sur site)
    for ads in active_ads_pending:
        ads.status = "rejected"
        ads.rejection_reason = f"Rejet auto — entreprise {decision}"

    # AdS in_progress → requires_review (PAX déjà sur site)
    for ads in active_ads_in_progress:
        ads.status = "requires_review"
        await notify_cds(ads, message=(
            f"Entreprise {company_name} blacklistée. "
            f"AdS {ads.reference} requiert votre décision."
        ))
```

---


---


## 7. Compliance HSE


```python
# Statut calculé pour chaque credential requis
def evaluate_credential(
    credential: PaxCredential | None,
    credential_type: CredentialType,
    ads_start_date: date
) -> ComplianceCheckItem:

    if credential is None:
        return ComplianceCheckItem(
            status="missing",
            message=f"Certification '{credential_type.name}' manquante"
        )

    if credential.status == "pending_validation":
        return ComplianceCheckItem(
            status="not_validated",
            message="Certification en attente de validation"
        )

    if credential.status == "rejected":
        return ComplianceCheckItem(
            status="missing",
            message=f"Certification rejetée: {credential.rejection_reason}"
        )

    # Vérification expiration
    if credential_type.has_expiry and credential.expiry_date:
        if credential.expiry_date <= ads_start_date:
            return ComplianceCheckItem(
                status="expired",
                message=f"Expirée le {credential.expiry_date.isoformat()}"
            )
        days_until = (credential.expiry_date - ads_start_date).days
        return ComplianceCheckItem(
            status="valid",
            days_until_expiry=days_until,
            message=f"Valide jusqu'au {credential.expiry_date.isoformat()}"
            if days_until > 30 else f"⚠️ Expire dans {days_until} jours"
        )

    return ComplianceCheckItem(status="valid", message="Valide (sans date d'expiry)")
```

---


### Périodes de grâce et validité minimale


### Règle fondamentale (correction de la spec précédente)

La vérification de compliance ne se limite pas à "la certification est-elle valide aujourd'hui ?". Elle doit répondre à : **"la certification sera-t-elle encore valide pendant tout le séjour, compte tenu des marges configurées ?"**

Une certification dont la date d'expiration tombe le 15 mai **ne valide PAS** une AdS du 10 au 20 mai — même si au moment de la soumission (le 8 mai), elle semble encore valide.

### Deux paramètres configurables par type de certification

**`grace_period_days` (période de grâce, défaut : 0)**

Nombre de jours après l'expiration pendant lesquels la certification est encore considérée comme acceptable. Permet de gérer les délais administratifs de renouvellement.

Exemple : `BOSIET` avec `grace_period_days = 30` → un BOSIET expiré le 1er mai reste valide jusqu'au 31 mai pour les AdS.

**`min_validity_days` (durée minimale résiduelle, défaut : 0)**

Nombre de jours minimum que la certification doit encore avoir de validité **à la date de début du séjour**. Prévient les situations où une certification expire pendant le séjour.

Exemple : `MEDIC_FIT` avec `min_validity_days = 0` → la certification doit être valide jusqu'au dernier jour du séjour (c'est la règle naturelle). Avec `min_validity_days = 30` → elle doit encore avoir 30 jours de validité au départ.

### Algorithme de vérification corrigé

```python
def check_credential(
    credential: PaxCredential,
    credential_type: CredentialType,
    ads_start_date: date,
    ads_end_date: date
) -> dict:
    """
    Vérifie si une certification est valide pour un séjour donné.

    Règles :
    1. Certification sans expiration → toujours valide
    2. Certification avec expiration :
       a. La date effective de fin de validité = expiry_date + grace_period_days
       b. La date de validité couverte doit atteindre ads_end_date
          ET dépasser ads_start_date + min_validity_days
    """
    # Pas d'expiration → toujours OK
    if not credential_type.has_expiry or credential.expiry_date is None:
        return {'status': 'valid', 'message': 'Sans expiration'}

    # Date de fin effective (avec grâce)
    effective_expiry = credential.expiry_date + timedelta(
        days=credential_type.grace_period_days
    )

    # Règle 1 : doit être valide jusqu'à la fin du séjour
    if effective_expiry < ads_end_date:
        if credential.expiry_date < ads_start_date:
            return {
                'status': 'expired',
                'message': f"Expirée le {credential.expiry_date:%d/%m/%Y}",
                'effective_expiry': effective_expiry,
                'expires_during_stay': False
            }
        else:
            # Expire PENDANT le séjour — cas spécifique
            return {
                'status': 'expires_during_stay',
                'message': (
                    f"Expire le {credential.expiry_date:%d/%m/%Y}, "
                    f"avant la fin du séjour ({ads_end_date:%d/%m/%Y})"
                ),
                'effective_expiry': effective_expiry,
                'expires_during_stay': True
            }

    # Règle 2 : doit avoir min_validity_days de validité résiduelle au départ
    if credential_type.min_validity_days > 0:
        min_required_expiry = ads_start_date + timedelta(
            days=credential_type.min_validity_days
        )
        if effective_expiry < min_required_expiry:
            return {
                'status': 'insufficient_validity',
                'message': (
                    f"Expire le {credential.expiry_date:%d/%m/%Y} — "
                    f"validité résiduelle insuffisante "
                    f"({(effective_expiry - ads_start_date).days} jours, "
                    f"minimum requis : {credential_type.min_validity_days} jours)"
                ),
                'effective_expiry': effective_expiry,
                'expires_during_stay': False
            }

    # Tout est OK
    days_remaining = (effective_expiry - ads_end_date).days
    return {
        'status': 'valid',
        'message': f"Valide jusqu'au {credential.expiry_date:%d/%m/%Y}",
        'effective_expiry': effective_expiry,
        'days_remaining_after_stay': days_remaining,
        'expires_during_stay': False
    }
```

### Statuts de compliance résultants (enrichis)

| Statut | Condition | Bloquant | Message affiché |
|---|---|---|---|
| `valid` | Couvre entièrement le séjour + marge min | Non | ✓ Valide jusqu'au JJ/MM/AAAA |
| `expires_during_stay` | Expire entre start_date et end_date | **Oui** | ✗ Expire le JJ/MM/AAAA — avant la fin du séjour |
| `insufficient_validity` | Expire après end_date mais < min_validity_days | **Oui** | ✗ Validité résiduelle insuffisante (X jours, min requis : Y) |
| `expired` | Expirée avant start_date (hors grâce) | **Oui** | ✗ Expirée le JJ/MM/AAAA |
| `in_grace` | Expirée mais dans la période de grâce | Selon config | ⚠ En période de grâce (expire il y a X jours) |
| `not_validated` | Justificatif non encore validé par CHSE | **Oui** | ⚠ En attente de validation |
| `missing` | Aucune certification de ce type | **Oui** | ✗ Manquante |

### Mise à jour du schéma `credential_types`

```sql
ALTER TABLE credential_types
  ADD COLUMN grace_period_days  INTEGER NOT NULL DEFAULT 0
    CHECK (grace_period_days >= 0),
  ADD COLUMN min_validity_days  INTEGER NOT NULL DEFAULT 0
    CHECK (min_validity_days >= 0);

COMMENT ON COLUMN credential_types.grace_period_days IS
  'Jours après expiration pendant lesquels la certification reste acceptable. '
  'Défaut 0 = aucune grâce.';

COMMENT ON COLUMN credential_types.min_validity_days IS
  'Nombre de jours de validité résiduelle minimale requis à la date de début '
  'du séjour. Défaut 0 = doit couvrir jusqu''à la fin du séjour uniquement.';
```

### Exemples de configuration

| Certification | has_expiry | validity_months | grace_period_days | min_validity_days | Logique |
|---|:---:|:---:|:---:|:---:|---|
| H2S Awareness | ✓ | 24 | 0 | 0 | Doit couvrir tout le séjour, pas de grâce |
| BOSIET | ✓ | 48 | 30 | 0 | Grâce de 30 jours après expiration |
| MEDIC_FIT | ✓ | 24 | 0 | 0 | Doit couvrir tout le séjour |
| Permis conduire engins | ✗ | — | — | — | Sans expiration |
| HUET | ✓ | 48 | 0 | 30 | Doit encore avoir 30 jours au départ |
| Habilitation électrique | ✓ | 36 | 7 | 0 | 7 jours de grâce après expiration |

### Impact sur l'affichage dans l'interface

Le message d'erreur est précis et indique exactement pourquoi la certification est bloquante :

```
Vérification HSE — Amadou NZIE — Site Munja (10/05 → 20/05/2026)

✓  H2S Awareness       Valide jusqu'au 20/06/2027
✗  BOSIET              Expire le 15/05/2026 — avant la fin du séjour (20/05)
                       ↳ Pour que ce séjour soit valide, le BOSIET doit être
                         valide jusqu'au 20/05/2026 au minimum.
                       [Demander un booking renouvellement]
⚠  Aptitude médicale   En période de grâce (expirée le 08/05/2026, grâce 30j)
                       ↳ Valide jusqu'au 07/06/2026 (grâce incluse)
✓  Habilitation élec.  Valide jusqu'au 01/03/2027
```

### Conséquence sur le batch de création des AdS de rotation

Le batch quotidien (6h00) qui crée les AdS de rotation vérifie aussi ces règles pour les
AdS auto-générées. Si une certification va expirer pendant la prochaine rotation, le batch :

1. Crée l'AdS en `draft` mais avec le PAX en `blocked` dès la création
2. Notifie le CHSE et le CMEDIC (selon le type) : "Amadou NZIE — BOSIET expire le 15/05,
   insuffisant pour la rotation du 10 au 20/05. Renouvellement requis avant le 10/05."
3. Déclenche automatiquement une demande de booking si `CredentialType.booking_service_id`
   est renseigné


---


### Règle G3 — Certification obtenue avant soumission


### Règle G3 (confirmée)

**Une certification doit être obtenue ET validée dans OpsFlux AVANT la
soumission de l'AdS.** Le statut `pending_validation` sur `pax_credentials`
(justificatif déposé mais pas encore validé par CHSE) ne satisfait pas les
prérequis HSE.

Conséquence : le cas "PAX inscrit à une formation dans 5 jours, AdS dans 10 jours"
est **bloquant**. Le PAX doit attendre que :
1. La formation ait lieu
2. Le justificatif soit uploadé
3. Un CHSE valide le justificatif (`status = 'valid'`)

Seulement à ce moment l'AdS peut être soumise.

### Pas de statut "scheduled" — workflow alternatif

Il n'existe **pas** de statut `scheduled` sur `pax_credentials`. Le workflow
recommandé pour ce cas est :

```
1. CHSE ou PAX_ADMIN ouvre un "Booking formation" depuis la fiche du PAX
   → email automatique au service formation avec la date prévue
   → `pax_credentials` : pas de ligne créée à ce stade

2. Le PAX suit la formation

3. Le PAX ou son superviseur uploade le justificatif
   → `pax_credentials` créé avec status = 'pending_validation'

4. CHSE valide
   → status = 'valid'

5. L'AdS peut maintenant être soumise
```

### Cas particulier : AdS soumise avec PAX bloqué

Un demandeur peut soumettre une AdS avec des PAX dont la certification expire
**pendant** le séjour (ex : certification valide au départ, expire à J+3 du
séjour de 10 jours). Ce cas est distinct : la certification est valide à la
soumission mais insuffisante pour toute la durée.

La règle `min_validity_days` sur `credential_types` couvre ce cas :
```
effective_expiry  = expiry_date + grace_period_days
required_until    = MAX(ads_end_date, ads_start_date + min_validity_days)
valide            = effective_expiry >= required_until
```

Si `effective_expiry < required_until` → statut `insufficient_validity` (≠ `missing`)
→ bloquant sauf décision manuelle CDS avec motif obligatoire.

### Résumé des 7 statuts de vérification compliance

| Statut | Signification | Bloquant ? |
|---|---|---|
| `valid` | Certification OK, couvre toute la durée du séjour | Non |
| `expires_during_stay` | Expire pendant le séjour mais avant min_validity | Oui |
| `insufficient_validity` | Valide au départ mais durée résiduelle < min_validity_days | Oui |
| `expired` | Expirée avant la date de départ | Oui |
| `in_grace` | Expirée mais dans le délai de grâce | Configurable |
| `not_validated` | Justificatif déposé mais pas encore validé par CHSE | Oui |
| `missing` | Aucune certification de ce type pour ce PAX | Oui |

---


### Algorithme compliance — 3 couches


### Algorithme compliance enrichi — 3 couches

```python
async def check_pax_compliance(
    self,
    pax_id: UUID,
    asset_id: UUID,
    declared_profile_type_id: UUID | None,
    ads_start_date: date,
    db: AsyncSession
) -> ComplianceCheckResult:
    """
    Compliance = union des exigences de la couche 1 (asset) et couche 2 (profil).
    """

    # ── Couche 1 : exigences du site (existant) ────────────────────────────
    asset_requirements = await get_asset_compliance_matrix(asset_id, db)
    # Inclut les parents dans la hiérarchie (héritage ltree)

    # ── Couche 2 : exigences du profil métier déclaré ──────────────────────
    profile_requirements = []
    if declared_profile_type_id:
        profile_requirements = await db.execute(
            select(ProfileHabilitationMatrix).where(
                ProfileHabilitationMatrix.profile_type_id == declared_profile_type_id,
                ProfileHabilitationMatrix.mandatory == True
            )
        )

    # ── Union des deux couches (dédoublonnée par credential_type_id) ───────
    all_required = {
        r.credential_type_id: r
        for r in [*asset_requirements, *profile_requirements]
    }
    # Si une certif est requise par les deux couches → une seule vérification

    # ── Vérification pour ce PAX ───────────────────────────────────────────
    items = []
    for cred_type_id, requirement in all_required.items():
        credential = await get_pax_credential(pax_id, cred_type_id, db)
        status = evaluate_credential(credential, ads_start_date)
        items.append(ComplianceItem(
            credential_type_id=cred_type_id,
            source="asset" if requirement in asset_requirements else "profile",
            # ↑ indique l'origine de l'exigence (affiché dans l'interface)
            status=status,    # valid | missing | expired | insufficient_validity | ...
            mandatory=requirement.mandatory
        ))

    return ComplianceCheckResult(
        is_compliant=all(i.status == "valid" for i in items if i.mandatory),
        items=items
    )
```

---


---


## 8. Priorité PAX


```python
# Calculé à l'approbation d'un AdSPax, stocké dans ads_pax.priority_score

VISIT_CATEGORY_SCORES = {
    "permanent_ops": 50,
    "project_work":  30,
    "maintenance":   25,
    "inspection":    20,
    "visit":         10,
    "other":          5,
}

PROJECT_PRIORITY_SCORES = {
    "critical": 40,
    "high":     30,
    "medium":   20,
    "low":      10,
}

def compute_priority_score(ads: AdS, ads_pax: AdSPax) -> tuple[int, str]:
    base = VISIT_CATEGORY_SCORES.get(ads.visit_category, 10)

    # Bonus si lié à un projet avec priorité
    project_bonus = 0
    if ads.planner_activity_id:
        activity = get_activity(ads.planner_activity_id)
        if activity.project_id:
            project = get_project(activity.project_id)
            project_bonus = PROJECT_PRIORITY_SCORES.get(project.priority, 0)

    # Léger bonus pour PAX internes
    type_bonus = 2 if ads_pax.pax.type == "internal" else 0

    score = base + project_bonus + type_bonus
    source = f"{ads.visit_category}+{activity.project.priority if project_bonus else 'no_project'}"
    return score, source
```

---


### Poids PAX — collecte et validation


### Principe

Le poids PAX (personne + bagages) est collecté à **deux moments distincts** et
n'est obligatoire que pour les vecteurs configurés pour ça — typiquement les
hélicoptères et petits avions où la masse totale détermine la sécurité du vol.

### Configuration par vecteur

Sur la table `vehicles`, un nouveau champ contrôle le besoin :

```sql
ALTER TABLE vehicles
  ADD COLUMN requires_pax_weight     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Si true : le poids PAX est obligatoire à la validation du manifeste
  ADD COLUMN default_pax_weight_kg   DECIMAL(6,2) DEFAULT 85.0;
  -- Poids estimé par défaut si le PAX ne déclare pas (appliqué à la création du manifeste)
  -- Valeur de sécurité, peut être remplacée par le poids réel au check-in
```

**Exemples :**
- Hélicoptère EC145 (6 PAX) : `requires_pax_weight = true` — critique pour le centrage
- HERA P (navire, 50 PAX) : `requires_pax_weight = false` — poids PAX négligeable
- Avion commercial : `requires_pax_weight = false` — géré par la compagnie aérienne

### Deux moments de collecte

**Moment 1 — Déclaration dans l'AdS (facultatif si vecteur non concerné)**

Sur le profil PAX (`pax_profiles`) : un champ `declared_weight_kg` optionnel,
mis à jour lors de la dernière AdS où il a été saisi.

```sql
ALTER TABLE pax_profiles
  ADD COLUMN declared_weight_kg    DECIMAL(6,2),
  -- Poids déclaré lors de la dernière saisie (personne + bagages habituels)
  ADD COLUMN weight_declared_at    TIMESTAMPTZ;
  -- Date de la dernière déclaration (pour savoir si c'est récent)
```

Quand un PAX est ajouté à une AdS dont le vecteur a `requires_pax_weight = true` :
- Si `declared_weight_kg` existe et `weight_declared_at < 90 jours` → pré-rempli
- Sinon → champ obligatoire dans le formulaire AdS

**Moment 2 — Repesage à l'embarquement (vecteur concerné)**

Sur le portail capitaine / vue LOG_BASE, lors du check-in :

```python
# Bouton "Enregistrer le poids réel" à côté de chaque PAX
# POST /api/captain/:code/pax/:pax_id/weight
# Body: { weight_kg: float }
# → met à jour pax_manifest_entries.weight_kg (écrase le poids estimé)
# → recalcule la masse totale du manifeste
# → alerte si dépassement capacity_weight_kg du vecteur
```

La différence déclaré vs pesé est tracée dans `cargo_movements` (tracé d'audit).

### Règle de validation manifeste avec poids

Si `vehicle.requires_pax_weight = true` :
- Validation manifeste bloquée si `weight_kg IS NULL` sur une entrée `confirmed`
- LOG_BASE peut saisir un poids estimé manuellement
- Avertissement si `SUM(weight_kg) > vehicle.capacity_weight_kg * 0.9` (90% seuil alerte)
- Blocage si `SUM(weight_kg) > vehicle.capacity_weight_kg`

---


---


## 9. Tracking et analytique


### Principe

Tout événement négatif (no-show, rejet d'AdS, certification expirée, signalement) est traçable et reportable. Le module intègre des vues analytiques permettant d'identifier les tendances : entreprises problématiques, PAX récidivistes, sites avec taux de non-compliance élevé.

### Ce qui est tracé automatiquement

**No-shows :**
- Chaque no-show est enregistré dans `pax_manifest_entries.status = 'no_show'`
- Lié au PAX, à l'AdS, au voyage, à la date
- Un PAX avec 3+ no-shows sur 12 mois → anomalie AI créée automatiquement (`anomaly_type = 'pax_recurrent_no_show'`)
- Un no-show sans motif → notification automatique au demandeur de l'AdS

**Rejets d'AdS :**
- `ads.status = 'rejected'` + `rejection_reason` obligatoire
- Rejet par le validateur vs rejet automatique système (compliance) → distincts dans `audit_log`
- Rejet d'un PAX individuel dans une AdS d'équipe → tracé dans `ads_pax.status = 'rejected'`

**Blocages compliance :**
- Chaque vérification HSE est sauvegardée dans `ads_pax.compliance_summary` (JSONB)
- Historique de toutes les vérifications, pas seulement la dernière
- Permet de voir : "Ce PAX a été bloqué 3 fois pour BOSIET expiré avant de renouveler"

**Signalements et décisions :**
- Historique complet dans `signalement_decision_history`
- Chaque changement de décision tracé avec motif

### Vues analytiques disponibles

```
GET /api/v1/pax/analytics/no-shows
  Query: entity_id, period_months, pax_id?, company_id?, asset_id?
  Response: {
    total_no_shows: int,
    by_pax: [{pax_id, pax_name, count, last_date}],
    by_company: [{company_id, name, count, rate_pct}],
    by_route: [{origin, destination, count}]
  }

GET /api/v1/pax/analytics/rejections
  Query: entity_id, period_months, reason_type?
  Response: {
    total_rejections: int,
    by_reason: [{reason_code, count, pct}],
    -- reasons: compliance_hse, quota_exceeded, signalement, manual_rejection...
    by_company: [...],
    by_site: [...],
    trend: [{month, count}]
  }

GET /api/v1/pax/analytics/compliance-failures
  Query: entity_id, credential_type_id?, asset_id?
  Response: {
    most_missing_credentials: [{type, count, pct_of_failures}],
    by_company: [{company, failure_rate_pct}],
    expiry_forecast: [{days_horizon, count_expiring}]
  }

GET /api/v1/pax/analytics/signalements-summary
  Query: entity_id, period_months
  Response: {
    active_blacklists: int,
    active_warnings: int,
    by_decision: {...},
    by_company: [{company, count, worst_decision}],
    lifted_this_period: int
  }
```

---


### Vue tracking d'une AdS


### Concept

Chaque AdS a une **timeline de tracking** accessible depuis sa fiche. Cette timeline est le journal complet de tout ce qui s'est passé sur cette AdS, du brouillon à la clôture, dans l'ordre chronologique. Elle est alimentée par la table `ads_events`.

C'est l'équivalent du tracking de colis pour une AdS — l'identifiant unique `ADS-2026-04521` permet de retrouver et suivre l'intégralité du cycle de vie.

### Interface — Onglet "Suivi" sur la fiche AdS

```
AdS ADS-2026-04521 — Équipe DIXSTONE — Munja (10-20 mai)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Informations] [PAX & Compliance] [Imputations] [Suivi ▼] [Documents]

─── SUIVI ──────────────────────────────────────────────────────────────
● 08/05  09:42  Création du brouillon
              Jean MARTIN (DEMANDEUR)

● 08/05  10:15  Soumission — 4 PAX, 2 conformes, 2 bloqués
              Jean MARTIN (DEMANDEUR)

⚠ 08/05  10:16  Vérification compliance HSE automatique
              Système → Amadou NZIE : BOSIET expiré | Marie FOTSO : BOSIET manquant

📩 08/05  10:20  Booking formation envoyé — BOSIET × 2
              Jean MARTIN (DEMANDEUR)

✓ 09/05  14:30  Certification BOSIET validée — Amadou NZIE
              CHSE Armand FOTSO

✓ 09/05  15:10  Certification BOSIET validée — Marie FOTSO
              CHSE Armand FOTSO

→ 09/05  15:11  Tous PAX conformes → en attente de validation
              Système

✓ 10/05  09:05  Validation N1 — Approuvée
              CDS Antoine KOUASSI (Site Munja)
              ↳ "Équipe habituelle, conformité vérifiée"

✓ 10/05  09:06  Manifeste TravelWiz créé → MAN-PAX-2026-03412
              Système → TravelWiz

✈ 14/05  16:45  Embarquement confirmé — 4 PAX à bord
              HERA P (MAN-PAX-2026-03412) — Capitaine ANTHONY

● 14/05  16:46  AdS en cours — PAX sur site Munja
              Système

✏ 16/05  11:00  Modification — Prolongation jusqu'au 22 mai
              Jean MARTIN (DEMANDEUR)
              ↳ Motif : "Travaux non terminés — accord chef de projet"
              ↳ Manifeste retour MAN-PAX-2026-03445 mis en requires_review

✓ 22/05  15:30  Départ confirmé — manifeste retour
              HERA P (MAN-PAX-2026-03445) — OMAA Joseph ATEBA

✓ 22/05  15:31  AdS clôturée — séjour terminé
              Système (via TravelWiz manifeste inbound)
─── ─────────────────────────────────────────────────────────────────────
```

### Accès à la vue Suivi

- **Demandeur** : voit le suivi de ses propres AdS
- **CDS** : voit le suivi de toutes les AdS pour son site
- **CHSE/DQHSE** : voit le suivi (focalisé compliance)
- **DO** : voit tout
- **SYS_ADMIN** : voir tout + événements système internes

### API tracking

```
GET /api/v1/pax/ads/:id/timeline
  Response 200:
  {
    "ads_id": "uuid",
    "reference": "ADS-2026-04521",
    "events": [
      {
        "event_type": "created",
        "recorded_at": "2026-05-08T09:42:00Z",
        "actor_name": "Jean MARTIN",
        "actor_role": "DEMANDEUR",
        "label": "Création du brouillon",
        "payload": {...},
        "icon": "circle",
        "color": "gray"
      },
      ...
    ]
  }
```

---


---


## 10. Signalements


### Concept


Un Signalement est un acte formel d'alerte enregistré contre **une personne, une équipe ou une entreprise**. Il est distinct d'un incident ponctuel : c'est un dossier structuré avec description de l'événement, décision, workflow de validation, et effets automatiques sur les AdS.

**Différence avec `pax_incidents` :** Les incidents (ancienne nomenclature) sont renommés et étendus. Le Signalement est le nouveau mécanisme officiel, plus riche, avec workflow de validation.

---


### Workflow du Signalement

```
CRÉATEUR (CDS, CHSE, DQHSE, DPROD, DO, HSE_SITE)
    ↓ [signalement.create]
draft
    ↓ [signalement.submit]
submitted
    ↓ (validateur prend en charge)
under_review  ← la décision PEUT être changée ici (downgrade ou upgrade)
    ↓ [signalement.validate]
validated ──────────────────────────────────────→ ACTIF (effets immédiats)
    │                                              ↓
    │                            Si decision_end_date passée → expired (auto)
    │                            Si levée manuelle → lifted
    ↓ [signalement.reject]
rejected (archivé, aucun effet)
```

**Qui peut valider ?**

| Décision | Validateur minimum requis |
|---|---|
| `avertissement` | CDS (sur son site) ou CHSE ou DQHSE |
| `exclusion_site` | CDS du site concerné + CHSE |
| `blacklist_temporaire` | DQHSE ou DO |
| `blacklist_permanent` | DO uniquement |

**Règle :** La décision peut être modifiée **pendant le statut `under_review`** uniquement. Un validateur peut dégrader (ex: blacklist → avertissement après audition de la personne) ou aggraver (ex: avertissement → exclusion si nouvelles informations). Chaque changement est tracé dans `signalement_decision_history` avec motif obligatoire.

---


### Effets visuels dans l'interface

#### Indicateurs par niveau de décision

| Décision | Statut | Icône | Comportement dans AdS |
|---|---|---|---|
| `avertissement` | validated, actif | ⚠ Triangle orange | Validation possible MAIS acquittement obligatoire |
| `exclusion_site` | validated, actif | 🚫 Cercle rouge (site) | Validation bloquée pour ce site uniquement |
| `blacklist_temporaire` | validated, actif | ⛔ Rouge clignotant | AdS rejetée d'office. Validation individuelle impossible |
| `blacklist_permanent` | validated | ⛔⛔ Double rouge | AdS rejetée d'office. Seul DO peut lever |
| Tout signalement | expired / lifted | 🔵 Bleu discret | Historique visible, aucun effet bloquant |

#### Dans la liste des PAX d'une AdS

```
┌────────────────────────────────────────────────────────────────────┐
│ # │ Photo │ Nom                  │ Entreprise  │ Compliance │ Flags │
├───┼───────┼──────────────────────┼─────────────┼────────────┼───────┤
│ 1 │ [📷]  │ Jean DUPONT          │ SCHLUMBERGER│ ✓ Conforme │       │
│ 2 │ [📷]  │ Amadou NZIE        ⚠ │ DIXSTONE    │ ✓ Conforme │ SIG   │
│   │       │                      │             │            │ [⚠ 1] │
│ 3 │ [📷]  │ Paul MBALLA        ⛔ │ GEOCOMP     │ ✓ Conforme │ SIG   │
│   │       │                      │             │            │ [⛔ 1] │
└────────────────────────────────────────────────────────────────────┘

Clic sur [⚠ 1] → popover affichant l'historique de signalement
Clic sur [⛔ 1] → popover + validation bloquée pour cet individu
```

#### Blocage de la validation groupée

Si une AdS d'équipe contient **au moins un PAX blacklisté** :
- Le bouton "Valider tout" est **désactivé**
- Message : "⛔ La validation groupée est bloquée. Paul MBALLA fait l'objet d'un blacklist actif (SIG-2026-00042). Vous pouvez valider les autres membres individuellement."
- Le validateur peut valider les autres PAX un par un
- Le PAX blacklisté reste en `rejected` dans l'AdS

---


---


## 11. Portail externe Tiers


### Deux contextes de génération

#### Contexte 1 : Lien lié à une AdS spécifique (existant — clarifié)

Un utilisateur interne (DEMANDEUR, CDS, LOG_BASE, etc.) crée une AdS, puis génère un lien pour qu'un superviseur externe complète les données de son équipe **pour cette demande précise**.

**Ce que le superviseur externe peut faire :**
- Voir les données pré-remplies (site, dates, projet, objet)
- Ajouter les PAX de son équipe (noms, certifications, photos)
- Uploader les justificatifs
- Soumettre l'AdS

**Durée de vie :** configurable (défaut 72h). Révocable à tout moment.

**Endpoint :**
```
POST /api/v1/pax/ads/:id/external-link
Body: {
  otp_sent_to: "email@entreprise.com" | "+237XXXXXXXX",
  expires_in_hours: 72,
  max_uses: 1,
  preconfigured_data: {
    site_name: "Munja",
    dates: "10-20 mai 2026",
    instructions: "Merci de compléter les profils de votre équipe avant le 8 mai."
  }
}
Response: { link_url: "https://ext.app.opsflux.io/{token}", qr_code_url: "..." }
```

#### Contexte 2 : Lien de gestion d'équipe depuis le module Tiers (nouveau)

**Indépendant de toute AdS.** Permet à un représentant d'une entreprise externe de **maintenir à jour les profils et certifications de son équipe** à tout moment, sans attendre qu'une AdS soit créée.

**Cas d'usage :** Perenco génère un lien pour DIXSTONE. Le responsable DIXSTONE peut vérifier et mettre à jour les profils, renouveler les certifications expirées, ajouter de nouveaux membres de son équipe. Quand une AdS sera créée plus tard, les profils seront déjà à jour.

**Ce que le lien permet :**
- Voir la liste des PAX de son entreprise enregistrés dans OpsFlux
- Voir le statut de compliance de chaque PAX (✓/⚠/✗ par site cible optionnel)
- Mettre à jour les données identitaires
- Uploader/renouveler des justificatifs de certifications
- Ajouter de nouveaux membres
- Voir les signalements actifs qui les concernent (avertissements visibles, pas les détails confidentiels)

**Ce que le lien ne permet PAS :**
- Créer des AdS
- Voir les données d'autres entreprises
- Modifier les décisions de compliance (c'est CHSE/HSE_SITE qui valide)
- Voir les données de PAX masqués (`hidden = true`)

**Génération depuis le module Tiers :**
```
POST /api/v1/tiers/:company_id/external-link
Body: {
  otp_sent_to: "responsable@dixstone.com",
  scope_asset_id: null,       -- null = accès global, ou un asset pour focus compliance
  expires_in_days: 30,        -- lien longue durée pour gestion équipe
  max_uses: null,             -- illimité pendant la période
  can_add_pax: true,
  can_update_certifications: true,
  instructions: "Merci de mettre à jour les certifications de votre équipe..."
}
Response: { link_url: "...", expires_at: "..." }
```

**URL portail :** `https://ext.app.opsflux.io/team/{token}` (distinct de `/ads/{token}`)

**Différences clés avec le lien AdS :**

| Aspect | Lien AdS | Lien Tiers |
|---|---|---|
| Périmètre | Une AdS spécifique | Tous les profils de l'entreprise |
| Durée typique | 24-72h | 7-30 jours |
| Utilisation | 1 (soumission unique) | Multiple (gestion continue) |
| Peut soumettre une AdS | ✓ | ✗ |
| Peut renouveler certifications | ✓ (dans l'AdS) | ✓ (en continu) |
| Voir compliance par site | ✗ | ✓ (optionnel) |
| Généré depuis | PaxLog (sur l'AdS) | Module Tiers |

**Table `external_access_links` — nouveau champ :**
```sql
ALTER TABLE external_access_links
  ADD COLUMN link_type VARCHAR(20) NOT NULL DEFAULT 'ads'
    CHECK (link_type IN ('ads', 'team_management'));
ALTER TABLE external_access_links
  ADD COLUMN target_company_id UUID REFERENCES tiers(id);
-- Pour link_type='team_management', ads_id est null et target_company_id est renseigné
```

**Endpoints portail "team management" :**
```
GET  /api/ext/team/:token/pax           Voir les PAX de l'entreprise
POST /api/ext/team/:token/pax           Ajouter un nouveau PAX
PATCH /api/ext/team/:token/pax/:pax_id  Mettre à jour un PAX
POST /api/ext/team/:token/pax/:pax_id/credentials  Uploader certification
GET  /api/ext/team/:token/compliance    Voir compliance par site (si scope_asset_id)
```

---


---


## 12. Photos et visibilité


### Photos dans le profil PAX

**Exigence :** La photo est obligatoire pour tout profil PAX soumis à une AdS. Un profil sans photo peut être créé mais l'AdS sera bloquée à la soumission si la photo manque.

**Règles :**
- Format accepté : JPEG, PNG, WebP
- Taille max : 5 Mo
- Résolution minimum : 200×200 pixels
- La photo doit être une **photo d'identité** (face, fond neutre) — pas de vérification automatique mais le validateur peut rejeter
- Upload via `POST /api/v1/pax/profiles/:id/photo` (multipart/form-data)
- URL stockée dans `pax_profiles.photo_url`
- Le score de complétude inclut la photo : +10% si photo présente

**Impact sur le workflow AdS :**
```python
# Dans AdsService.submit()
for ads_pax in ads.pax_list:
    if not ads_pax.pax.photo_url:
        ads_pax.compliance_summary.append({
            'type': 'photo_missing',
            'message': "Photo d'identité manquante",
            'blocking': True
        })
        ads_pax.status = 'blocked'
```

### Photos dans la vue de validation d'une AdS

Lors de la validation d'une AdS, le validateur voit la liste des PAX **avec leur photo** à côté de leur nom. Ceci permet :
- L'identification visuelle rapide (en particulier pour les sous-traitants inconnus)
- La vérification que la photo correspond à la personne déclarée
- La détection visuelle de doublons (deux photos similaires pour deux profils)

**Affichage :**
```
Vue validation AdS ADS-2026-04521
─────────────────────────────────────────────────────
Équipe DIXSTONE — 4 PAX — ESF1 du 10/05 au 20/05

[Photo 40×40] Jean DUPONT      SCHLUMBERGER  ✓ Compliant  
[Photo 40×40] Amadou NZIE ⚠   DIXSTONE      ✓ Compliant  [⚠ SIG]
[Photo 40×40] Paul MBALLA  ⛔  GEOCOMP       ✓ Compliant  [⛔ SIG]
[Photo 40×40] Marie NKONO      DIXSTONE      ✗ Bloqué  (H2S manquant)
              [Photo manquante] (Badge rouge)
─────────────────────────────────────────────────────
```

**Si photo manquante :** Un badge rouge "Photo manquante" apparaît à la place. La photo est considérée bloquante — le PAX est en statut `blocked` dans l'AdS.

### Photos dans les manifestes PAX (TravelWiz)

La photo du PAX est affichée dans la vue de pointage du manifeste (embarquement) :
- Sur le portail capitaine : miniature à côté du nom pour identification physique
- Sur la vue LOG_BASE : miniature pour vérification en cas de doute

Ceci est particulièrement utile pour les sous-traitants peu connus que le coordinateur n'a jamais rencontrés.


---


### Politique de suppression et de visibilité


### Principe général

OpsFlux ne supprime **jamais** de données ayant atteint un certain niveau d'avancement. La "suppression" est toujours une opération de masquage pour l'utilisateur, jamais une destruction physique.

### Niveaux de protection

| Niveau | Condition | Ce qu'on peut faire |
|---|---|---|
| **Brouillon non soumis** | AdS en `draft`, signalement en `draft`, profil `incomplete` jamais soumis | Suppression physique autorisée (aucun engagement) |
| **Soumis ou en cours de validation** | AdS en `submitted`, `pending_*` | `archived = true` uniquement — jamais de DELETE |
| **Validé / Approuvé** | AdS `approved`, signalement `validated`, manifeste `validated` | `hidden = true` pour les utilisateurs. L'enregistrement reste intact, accessible par ADMIN |
| **Clôturé / Complété** | AdS `completed`, manifeste `closed`, voyage `completed` | Immuable. Aucune modification possible, même pour ADMIN. Seul l'audit log peut être consulté. |

### Champ `hidden`

```sql
-- Ajout sur les tables concernées
ALTER TABLE ads              ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_profiles     ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signalements     ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_credentials  ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pax_manifest_entries ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;
```

**Comportement :**
- `hidden = false` → visible par tous les utilisateurs ayant les droits
- `hidden = true` → **invisible pour tous les utilisateurs** (même les validateurs et le DO), sauf le rôle `SYS_ADMIN`
- L'API filtre automatiquement `WHERE hidden = false` dans toutes les requêtes standard
- Le `SYS_ADMIN` peut ajouter le paramètre `?include_hidden=true` pour voir les enregistrements masqués
- Toute opération `hidden = true` est tracée dans `audit_log` avec : qui a masqué, quand, pourquoi

**Qui peut masquer ?**
- `SYS_ADMIN` uniquement pour les données ayant atteint le niveau "Validé"
- Le DO peut masquer des brouillons et des enregistrements non encore validés
- Les utilisateurs standard ne peuvent pas masquer — uniquement `archived = true` sur leurs propres brouillons

**Cas d'usage typique :** Un PAX externe demande la suppression de ses données (RGPD). On ne peut pas effacer son AdS approuvée qui fait partie de l'audit de sécurité. On passe `hidden = true` sur son profil PAX et ses certifications. Son nom apparaît dans les vieux manifestes comme "[Profil masqué]". Le dossier reste complet pour l'auditeur.

---


---


## 13. Workflow AdS — FSM complet


### États et transitions


```
[DEMANDEUR clique "Soumettre"]
         ↓
     status = submitted  ←── persisté + ads.submitted émis
         ↓
   Routage FSM (synchrone, même transaction)
         ↓
   should_apply_step_0A() ?
   ├── Oui → pending_initiator_review   (notif initiateur)
   └── Non → should_apply_step_0B() ?
              ├── Oui → pending_project_review   (notif chef projet)
              └── Non → check_compliance()
                         ├── Bloqués → pending_compliance
                         └── OK      → pending_validation   (notif CDS)

[Le client reçoit le statut final — submitted n'est jamais visible en UI
 sauf dans l'historique/audit log]
```


### Principe

Le workflow par défaut de validation d'une AdS intègre maintenant deux étapes
préliminaires **avant** que le circuit principal (CDS → DPROD) ne soit lancé.
Ces étapes filtrent les demandes mal formées ou non pertinentes avant
d'impliquer tous les validateurs.

---

### Étape 0-A — Validation par le DEMANDEUR / INITIATEUR

**Contexte :** Quand une AdS est créée **pour quelqu'un d'autre** (un LOG_BASE
crée une AdS pour une équipe externe, un CHEF_PROJET crée pour ses sous-traitants),
l'initiateur doit valider explicitement avant que le workflow ne démarre.

**Règle :**

```
Si ads.created_by ≠ ads.requester_id (la personne concernée)
  → Étape 0-A active : l'initiateur valide en premier
  → Statut : draft → pending_initiator_review

Si ads.created_by == ads.requester_id
  → Étape 0-A ignorée (auto-passée)
  → Statut : draft → submitted directement
```

**But :** L'initiateur peut corriger, compléter ou annuler avant que
les validateurs officiels ne soient impliqués. Pas de pollution du circuit
de validation par des demandes incomplètes ou provisoires.

**Qui valide :** L'initiateur (`ads.created_by`). Lui seul peut
passer cette étape (ou annuler l'AdS à ce stade).

**Interface :**

```
⚠ AdS en attente de votre confirmation
ADS-2026-04521 — Équipe SCHLUMBERGER — Munja — 14-20 mai
Créée par : vous

Cette AdS a été créée pour le compte d'une autre personne.
Veuillez la vérifier avant de la soumettre au circuit de validation.

[✓ Confirmer et lancer le workflow]   [✗ Annuler]   [✎ Modifier]
```

---

### Étape 0-B — Validation par le CHEF_PROJET (si AdS liée à un projet/tâche)

**Contexte :** Quand une AdS est associée à un projet (`ads.planner_activity_id`
ou `ads.project_id`), le responsable de la tâche concernée (ou le chef du
projet si pas de responsable de tâche) valide en premier.

**Règle :**

```
Si ads.planner_activity_id ≠ null ou ads_imputations[].project_id ≠ null
  → Récupérer le responsable de la tâche ou le CHEF_PROJET du projet
  → Étape 0-B active
  → Statut : pending_initiator_review → pending_project_review

Si aucun lien projet
  → Étape 0-B ignorée
```

**But :** Le chef de projet confirme que la mission est bien nécessaire,
que les dates sont cohérentes avec le planning, et que les ressources sont
disponibles. Il peut rejeter à ce stade si la mission ne correspond pas
au planning du projet.

**Qui valide :** `task.assigned_to` en priorité → sinon `project.owner_id` →
sinon n'importe quel membre avec rôle `manager` sur le projet.

**Interface (vue du chef de projet) :**

```
📋 AdS en attente de votre validation projet
ADS-2026-04521 — Équipe SCHLUMBERGER — Munja — 14-20 mai
Projet : GCM-2026 — Campagne E-LINE ESF1
Tâche  : 1.2.3 — Installation équipement

Cette demande est liée à une tâche dont vous êtes responsable.
Veuillez confirmer que cette mission est conforme au planning.

Dates demandées : 14-20 mai 2026
Planning tâche  : 10-25 mai 2026  ✓ (cohérent)

[✓ Approuver — lancer circuit validation]
[⚠ Approuver avec réserve + commentaire]
[✗ Rejeter — motif obligatoire]
```

---

### Workflow AdS complet par défaut — 5 étapes

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW ADS_STANDARD (révisé)                                         │
│                                                                         │
│  Étape 0-A  INITIATEUR           (si créé pour autrui)   ← NOUVEAU     │
│      ↓ (auto-skip si créateur = demandeur)                              │
│  Étape 0-B  CHEF_PROJET          (si lié à un projet)    ← NOUVEAU     │
│      ↓ (auto-skip si pas de lien projet)                                │
│  Étape 1    COMPLIANCE HSE       (automatique)                          │
│      ↓                                                                  │
│  Étape 2    CDS (validateur N1)                                         │
│      ↓                                                                  │
│  Étape 3    DPROD (validateur N2) (si activé sur le site)               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Statuts FSM mis à jour :**

```python
class AdSStatus(str, Enum):
    draft                    = "draft"
    submitted                = "submitted"                  # état transitoire : déclenche le routage FSM
    pending_initiator_review = "pending_initiator_review"  # ← étape 0-A
    pending_project_review   = "pending_project_review"    # ← étape 0-B
    pending_compliance       = "pending_compliance"         # compliance HSE
    pending_validation       = "pending_validation"         # circuit CDS/DPROD
    approved                 = "approved"
    rejected                 = "rejected"
    cancelled                = "cancelled"
    requires_review          = "requires_review"
    pending_arbitration      = "pending_arbitration"
    in_progress              = "in_progress"
    completed                = "completed"
```

**Transitions FSM enrichies :**

```
draft → pending_initiator_review   (si created_by ≠ requester_id)
draft → pending_compliance         (si created_by == requester_id ET pas de projet)
draft → pending_project_review     (si created_by == requester_id ET lien projet)

pending_initiator_review → pending_project_review  (si lien projet — initiateur valide)
pending_initiator_review → pending_compliance       (si pas de projet — initiateur valide)
pending_initiator_review → cancelled                (initiateur annule)

pending_project_review → pending_compliance         (chef de projet valide)
pending_project_review → rejected                   (chef de projet rejette)

pending_compliance → pending_validation             (tous PAX compliant)
pending_compliance → pending_validation             (PAX débloqués progressivement)

pending_validation → approved                       (CDS ± DPROD)
pending_validation → rejected                       (CDS ou DPROD rejette)
```

---

### Workflow seeds mis à jour

Les deux nouveaux nœuds sont intégrés dans tous les workflows AdS seeds
existants. Le moteur FSM les ignore automatiquement quand les conditions
ne s'appliquent pas (skip transparent).

```
ads_project_work_standard     : 0-A + 0-B + compliance + N1(CDS) + N2(DPROD)
ads_permanent_ops             : 0-A + 0-B + compliance + N1(CDS) + N2(DPROD)
ads_maintenance_urgent        : 0-A + compliance + N1(CDS)  [pas 0-B — urgence]
ads_external_visit            : 0-A + 0-B + compliance + N1(CDS)
```

**Exception maintenance urgente :** L'étape 0-B (chef de projet) est ignorée
pour `ads_maintenance_urgent` — en cas d'urgence, on ne peut pas attendre
la validation projet.

---


### Étape 0-B — Intégration délégations


### Règle (C confirmé)

L'étape 0-B (validation CHEF_PROJET) utilise le **même mécanisme de délégation**
que le reste du Workflow Engine. Si le CHEF_PROJET est absent, il désigne un
remplaçant via son profil avant son départ, comme pour toute autre validation.

Il n'y a **pas de timeout automatique** spécifique à l'étape 0-B —
la règle d'expiration du `requires_review` s'applique si l'AdS reste
bloquée trop longtemps (14 jours sans action → rappel, 28 jours → CDS
peut forcer).

### Logique dans le Workflow Engine

```python
async def get_step_0B_validators(ads: AdS, db: AsyncSession) -> list[User]:
    """
    Retourne les validateurs éligibles pour l'étape 0-B,
    en tenant compte des délégations actives.
    """
    # Trouver le responsable de la tâche ou le chef de projet
    project_id = await get_ads_project(ads.id, db)
    if not project_id:
        return []

    task_assignee = await get_task_responsible(ads.planner_activity_id, db)
    chef_projet   = await get_project_owner(project_id, db)

    candidate = task_assignee or chef_projet
    if not candidate:
        return []

    # Vérifier délégation active
    today = date.today()
    delegation = await db.execute(
        select(UserDelegation).where(
            UserDelegation.delegator_id == candidate.id,
            UserDelegation.start_date <= today,
            UserDelegation.end_date >= today,
            UserDelegation.revoked == False
        )
    )
    active = delegation.scalar_one_or_none()

    return [active.delegate if active else candidate]
```

### Impact sur la notification

Quand l'AdS passe en `pending_project_review`, la notification est envoyée
au validateur résolu (délégué si délégation active, sinon le chef de projet
directement).

```
📋 AdS en attente de votre validation projet
ADS-2026-04521 — Équipe SCHLUMBERGER — Munja — 14-20 mai

[Note si délégué actif]
Vous recevez cette notification en tant que remplaçant de Jean KOUASSI
(délégation du 10/05 au 25/05/2026)

[Approuver]  [Approuver avec réserve]  [Rejeter]
```

---


### Transport aller/retour


### Pourquoi ce n'est pas juste un champ texte

Actuellement la spec a `transport_requested` (bool) + `transport_notes` (texte libre).
C'est insuffisant pour deux raisons :
1. **L'aller et le retour peuvent être des modes différents** (navire à l'aller, hélico au retour)
2. **TravelWiz a besoin de données structurées** pour filtrer les voyages compatibles et
   placer le PAX sur le bon manifeste — pas du texte libre non interprétable

### Modèle révisé — deux blocs de préférence transport

```sql
-- Remplacement de transport_requested + transport_notes sur la table ads
ALTER TABLE ads
  DROP COLUMN transport_requested,
  DROP COLUMN transport_notes,

  ADD COLUMN outbound_transport_mode   VARCHAR(50),
  -- Mode de transport aller souhaité : 'helicopter' | 'boat' | 'commercial_flight'
  -- | 'bus' | '4x4' | null (pas de préférence)
  ADD COLUMN outbound_departure_base   UUID REFERENCES assets(id),
  -- Point de départ aller (ex: Wouri Base, Aéroport Douala)
  ADD COLUMN outbound_notes            TEXT,
  -- Précisions libres aller (ex: "hélico de 7h si disponible")

  ADD COLUMN return_transport_mode     VARCHAR(50),
  -- Mode de transport retour souhaité (peut être différent de l'aller)
  ADD COLUMN return_departure_base     UUID REFERENCES assets(id),
  -- Point de départ retour si différent du site (cas rare — transit)
  ADD COLUMN return_notes              TEXT;
  -- Précisions libres retour
```

**Migration** : les données existantes de `transport_notes` sont copiées dans
`outbound_notes` et `return_notes`. `transport_requested = false` → les deux
modes restent null.

### Interface sur le formulaire AdS

```
Section Transport (optionnelle)

  Aller
  ├── Mode de transport : [Hélicoptère ▼] (ou "Pas de préférence")
  ├── Départ depuis     : [Wouri Base ▼]
  └── Notes             : [hélico 7h si possible]

  Retour
  ├── Mode de transport : [Navire ▼]   ← peut être différent
  ├── Départ depuis     : [Munja ▼]    ← pré-rempli avec le site de l'AdS
  └── Notes             : [pas urgent, prochain bateau disponible]
```

Les valeurs de `outbound_transport_mode` et `return_transport_mode` sont des
valeurs libres parmi les types de vecteurs enregistrés dans TravelWiz (liste
déroulante issue de `SELECT DISTINCT type FROM vehicles WHERE entity_id = ?`).

### Impact sur le handler `ads.approved` dans TravelWiz

TravelWiz utilise maintenant les préférences structurées pour filtrer les voyages
compatibles :

```python
# Payload ads.approved enrichi
{
    "outbound_transport_mode": "helicopter",   # peut être null
    "outbound_departure_base_id": "uuid",      # peut être null
    "return_transport_mode": "boat",           # peut être null
    "return_departure_base_id": "uuid"         # peut être null
}

# Handler — filtrage amélioré
async def on_ads_approved(self, event: dict) -> None:
    payload = event["payload"]

    # Chercher un trip aller compatible (destination + fenêtre + mode si précisé)
    query = Trip.entity_id == payload["entity_id"]
    query &= Trip.destination_asset_id == payload["site_entry_asset_id"]
    query &= Trip.status.in_(["planned", "confirmed"])
    query &= Trip.departure_datetime.between(payload["start_date"], payload["end_date"])

    if payload.get("outbound_transport_mode"):
        # Filtrer sur le type de vecteur si préférence exprimée
        query &= Trip.vehicle.has(Vehicle.type == payload["outbound_transport_mode"])

    if payload.get("outbound_departure_base_id"):
        query &= Trip.origin_asset_id == payload["outbound_departure_base_id"]

    existing_trip = await db.query(Trip).filter(query).first()

    # Si aucun trip compatible trouvé → créer un Trip planned
    # avec un flag indiquant la préférence de mode pour le coordinateur
    if not existing_trip:
        trip = await create_trip(
            ...
            preferred_vehicle_type=payload.get("outbound_transport_mode"),
            notes=(payload.get("outbound_notes") or "")
        )
    # ... suite inchangée
```

### Modification de la préférence de retour en cours de séjour

Le PAX est sur site. Son AdS est `in_progress`. Il veut changer son vecteur retour.

**Qui peut le faire :**
- Le demandeur de l'AdS (DEMANDEUR) peut modifier `return_transport_mode` et
  `return_notes` sur son AdS via l'interface
- L'OMAA peut aussi le faire depuis la vue "PAX sur mon site"

**Règle motif :** Si une `pax_manifest_entry` avec `direction = 'inbound'` existe
déjà pour ce PAX → la modification est soumise à motif obligatoire + le LOG_BASE
est notifié pour réassigner le PAX sur le bon vecteur retour.

Si aucun manifeste retour n'existe encore → modification silencieuse, simplement
mise à jour des préférences retour sur l'AdS.

**Événement tracé :**

```python
# Dans ads_events
{
    "event_type": "transport_return_modified",
    "ads_id": "uuid",
    "ads_pax_id": null,  # change sur toute l'AdS, pas un PAX spécifique
    "actor_id": "uuid",
    "recorded_at": "2026-05-16T10:30:00Z",
    "payload": {
        "old_return_mode": "boat",
        "new_return_mode": "helicopter",
        "reason": "Urgence médicale famille — départ rapide nécessaire",
        "impacted_manifest_id": "uuid"  # null si pas de manifeste retour existant
    }
}
```

**Notification LOG_BASE si manifeste retour existant :**

```
⚠ Changement vecteur retour
Jean DUPONT (ADS-2026-04521) — Site Munja

Transport retour modifié :
  Avant : Navire (HERA P — départ 22/05)
  Après : Hélicoptère

Motif : "Urgence médicale famille"

Action requise : retirer Jean DUPONT du manifeste retour HERA P
                 et l'inscrire sur le prochain vol hélico disponible.

[Voir le manifeste →]   [Planifier vol hélico →]
```

### Modification du retour individuel vs équipe

Pour une AdS d'équipe (`type = 'team'`), la préférence de transport retour est
saisie au niveau de l'AdS (commune à tous). Mais un PAX individuel peut avoir
un retour différent : dans ce cas, la modification se fait sur `ads_pax`
(via un champ `return_transport_override`) et non sur l'AdS entière.

```sql
ALTER TABLE ads_pax
  ADD COLUMN return_transport_override   VARCHAR(50),
  -- Surcharge individuelle du mode retour pour ce PAX dans l'équipe
  -- null = utilise ads.return_transport_mode
  ADD COLUMN return_departure_override   UUID REFERENCES assets(id),
  ADD COLUMN return_override_reason      TEXT;
  -- Motif obligatoire si override ≠ null
```

**Exemple :** Équipe de 4 rentre en bateau, sauf Jean DUPONT qui rentre en
hélico pour raisons personnelles. L'AdS a `return_transport_mode = 'boat'`,
mais `ads_pax.return_transport_override = 'helicopter'` pour Jean DUPONT.

---


---


## 14. Profils métier et habilitations


La compliance HSE dans OpsFlux a maintenant **trois couches** :

```
Couche 1 — Asset (existante)
  ComplianceMatrix : certifications requises pour accéder à CE site
  Ex : ESF1 exige BOSIET + H2S pour tous les visiteurs

Couche 2 — Profil métier (NOUVELLE)
  ProfileHabilitationMatrix : certifications requises pour exercer CE métier
  Ex : un Soudeur doit avoir Permis de Soudage + Habilitation Feu
       un Électricien doit avoir Habilitation Électrique B1V

Couche 3 — Autodéclaration avec preuves (NOUVELLE)
  Sur l'AdS, le PAX coche les habilitations qu'il possède
  et fournit les preuves correspondantes
```

La vérification compliance totale = Couche 1 ∪ Couche 2.

---


### Interface sur le formulaire AdS

#### Section "Profil et habilitations" dans le formulaire AdS

Pour chaque PAX ajouté à une AdS, après la saisie des informations de base,
une section dédiée apparaît :

```
─── Jean DUPONT — Profil et habilitations ──────────────────────────────────

Profil métier pour cette mission :
  ┌─────────────────────────────────────────────────┐
  │ [Technicien E-Line ▼]                           │
  │  (pré-rempli depuis les profils habituels)      │
  └─────────────────────────────────────────────────┘

Habilitations requises pour ce profil × ce site :
─────────────────────────────────────────────────────────────────────────────
  SOURCE     HABILITATION           STATUT      ACTION
  Site ESF1  BOSIET                 ✓ VALIDE    (exp. 2027-03-15)
  Site ESF1  H2S Awareness          ✓ VALIDE    (exp. 2026-08-01)
  Profil     Permis de Soudage      ✗ MANQUANT  [☐ Je possède ce document]
  Profil     Habilitation Feu       ⚠ EXPIRÉ    [☐ Je possède un document récent]
─────────────────────────────────────────────────────────────────────────────

Pour les habilitations manquantes ou expirées, cochez si vous les possédez
et uploadez la preuve :

  ☑ Je possède un Permis de Soudage valide
    [📎 Choisir le fichier...] ← upload justificatif PDF/JPG

  ☑ Je possède une Habilitation Feu valide
    [📎 Permis_Feu_DUPONT_2025.pdf ✓]
```

#### Logique de la case à cocher + preuve

```python
# Dans profile_self_declaration (JSONB sur ads_pax)
{
  "credential_type_id": "uuid-permis-soudage",
  "declared": True,        # PAX a coché la case
  "proof_url": "s3://opsflux/.../permis_soudage_dupont.pdf",
  "validated": False,      # CHSE n'a pas encore validé
  "validated_by": None,
  "validated_at": None
}
```

**Statut résultant :**
- Si `declared=True` ET `proof_url` renseigné → statut `not_validated`
  (en attente de validation CHSE) — **bloquant** jusqu'à validation
- Si `declared=True` sans preuve → statut `claimed_no_proof`
  (déclaration sans justificatif) — **bloquant**
- Si `declared=False` → statut `missing` — **bloquant**

**Le CHSE voit dans sa file de validation :**
- Les autodéclarations en attente, avec le justificatif uploadé
- Il peut valider → `validated=True` → `pax_credentials` créé ou mis à jour
- Il peut rejeter → motif obligatoire → PAX notifié → doit re-uploader

---


### Règle de priorité : autodéclaration vs pax_credentials existant

Si le PAX a déjà un `pax_credentials` valide pour ce `credential_type_id`
dans sa fiche → la case est **pré-cochée et grisée** (pas besoin de re-déclarer).

Si `pax_credentials` existe mais `status = 'expired'` → case décochée par
défaut avec mention "Votre document a expiré le [date]. Avez-vous un
renouvellement ?"

---


### Impact sur la liste de validation du CHSE

Dans le tableau de bord CHSE, un nouvel onglet "Autodéclarations" :

```
Autodéclarations en attente de validation  (5)
─────────────────────────────────────────────────────────────────────────────
PAX             HABILITATION          PREUVE          AdS
Jean DUPONT     Permis de Soudage     [Voir PDF ▼]   ADS-2026-04521
Marie FOTSO     Habilitation Élec.    [Voir PDF ▼]   ADS-2026-04533
Paul MBALLA     Permis de Soudage     [Voir PDF ▼]   ADS-2026-04521
─────────────────────────────────────────────────────────────────────────────
[✓ Valider]   [✗ Rejeter]   (action sur chaque ligne)
```

La validation par le CHSE :
1. Met `profile_self_declaration[].validated = True`
2. Crée ou met à jour `pax_credentials` avec `status = 'valid'` et `proof_url`
3. Recalcule la compliance de l'AdS concernée
4. Peut débloquer l'AdS si tous les items sont maintenant valides

---


---


## 15. Avis de Mission (AVM)


### 15.1 Concept et objectif

et objectif

L'**Avis de Mission (AVM)** orchestre le cycle complet d'une mission terrain,
de l'ouverture de la demande jusqu'au départ effectif. Il remplace les échanges
d'emails non structurés par un dossier numérique unique avec suivi temps réel.

**Flux AVM → AdS :**
```
Initiateur ouvre AVM
  ↓ remplit programme (sites, dates, intervenants)
  ↓ coche indicateurs (visa, badge, EPI, indemnité)
  ↓ lance l'AVM
    → mails d'annonce envoyés
    → tâches préparatoires créées automatiquement
    → une AdS générée par ligne de programme
      → chaque AdS suit son propre workflow (0-A → 0-B → compliance → CDS → DPROD)
  ↓ suivi en temps réel depuis la fiche AVM
    → toutes tâches complétées + toutes AdS approuvées → mission prête
```

**Référence :** `AVM-YYYY-NNNNN` — généré via `reference_sequences` (préfixe `AVM`).

---

### 15.2 Modèle de données AVM

#### MissionNotice

```sql
CREATE TABLE mission_notices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  reference             VARCHAR(50) UNIQUE NOT NULL,
  -- AVM-YYYY-NNNNN

  title                 VARCHAR(300) NOT NULL,
  description           TEXT,

  created_by            UUID NOT NULL REFERENCES users(id),
  status                VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | in_preparation | active | ready | completed | cancelled
  -- draft          : AVM en cours de saisie
  -- in_preparation : lancée — actions prépa en cours, AdS en cours de validation
  -- active         : au moins une AdS approuvée — mission a commencé
  -- ready          : toutes tâches prépa OK + toutes AdS approuvées — tout est prêt pour le départ
  -- completed      : toutes les AdS sont clôturées (retour effectif confirmé)
  -- cancelled      : AVM annulée (motif obligatoire)

  -- Dates (peuvent être null si pas encore connues à la création)
  planned_start_date    DATE,
  planned_end_date      DATE,

  -- Indicateurs — cases à cocher par l'initiateur
  requires_badge        BOOLEAN NOT NULL DEFAULT FALSE,
  requires_epi          BOOLEAN NOT NULL DEFAULT FALSE,
  requires_visa         BOOLEAN NOT NULL DEFAULT FALSE,
  eligible_displacement_allowance BOOLEAN NOT NULL DEFAULT FALSE,

  -- Mensurations EPI si requires_epi=true
  epi_measurements      JSONB DEFAULT '{}',
  -- {taille_vetement: 'XL', pointure: 42, tour_tete: 57, ...}

  -- Pièces jointes configurables (liste paramétrable par type de mission)
  -- Pièces jointes — deux types
  global_attachments_config  JSONB DEFAULT '[]',
  -- Documents liés à la mission globalement (un seul upload pour toute la mission)
  -- [{doc_type: 'ordre_mission', label: 'Ordre de mission', required: false, file_url: null},
  --  {doc_type: 'loi', label: 'Letter of Intent', required: false, file_url: null},
  --  {doc_type: 'programme_officiel', label: 'Programme officiel', required: false, file_url: null}]
  --
  per_pax_attachments_config JSONB DEFAULT '[]',
  -- Documents requis individuellement pour chaque PAX de la mission
  -- La liste est identique pour tous les PAX — chaque PAX doit fournir ces docs
  -- [{doc_type: 'passport', label: 'Passeport', required: true},
  --  {doc_type: 'visa', label: 'Visa (si requis)', required: false},
  --  {doc_type: 'medical_fit', label: 'Aptitude médicale', required: false}]
  -- → Les fichiers uploadés sont stockés dans mission_pax_documents (table séparée)

  -- Workflow
  workflow_instance_id  UUID REFERENCES workflow_instances(id),
  mission_type          VARCHAR(50) NOT NULL DEFAULT 'standard',
  -- standard | vip | regulatory | emergency

  archived              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_avm_entity  ON mission_notices(entity_id, status);
CREATE INDEX idx_avm_creator ON mission_notices(created_by);
```

#### MissionNoticeProject (Liens projets/tâches — N-N)

```sql
CREATE TABLE mission_notice_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  task_id             UUID REFERENCES tasks(id),
  notes               TEXT,
  UNIQUE (mission_notice_id, project_id, task_id)
);
```

#### MissionProgram (Programme ligne par ligne)

```sql
CREATE TABLE mission_programs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id     UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  order_index           SMALLINT NOT NULL DEFAULT 0,

  activity_description  TEXT NOT NULL,
  activity_type         VARCHAR(50) NOT NULL DEFAULT 'visit',
  -- visit | meeting | inspection | training | handover | other

  site_asset_id         UUID REFERENCES assets(id),
  planned_start_date    DATE,
  planned_end_date      DATE,

  -- Imputation projet pour cette ligne (indépendant des autres lignes)
  project_id            UUID REFERENCES projects(id),
  -- Projet auquel cette ligne est imputée (peut différer des autres lignes)
  task_id               UUID REFERENCES tasks(id),
  -- Tâche spécifique dans ce projet (optionnel)

  -- Optimisation UX : "mêmes intervenants que la ligne X"
  same_pax_as_line_id   UUID REFERENCES mission_programs(id),

  -- AdS générée automatiquement pour cette ligne
  generated_ads_id      UUID REFERENCES ads(id),

  notes                 TEXT,
  UNIQUE (mission_notice_id, order_index)
);
CREATE INDEX idx_mission_program ON mission_programs(mission_notice_id);
```

#### MissionProgramPax (Intervenants par ligne)

```sql
CREATE TABLE mission_program_pax (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_program_id    UUID NOT NULL REFERENCES mission_programs(id) ON DELETE CASCADE,
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  role_in_mission       VARCHAR(100),
  -- "Technicien principal", "Superviseur", "Observateur"
  UNIQUE (mission_program_id, pax_id)
);
```

#### MissionPreparationTask (Travaux préparatoires)

```sql
CREATE TABLE mission_preparation_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id     UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  reference             VARCHAR(50),
  -- Référence externe (N° demande visa, N° bon commande EPI, etc.)

  title                 VARCHAR(300) NOT NULL,
  task_type             VARCHAR(50) NOT NULL,
  -- visa | badge | epi_order | allowance | ads_creation
  -- | document_collection | meeting_booking | briefing | other

  status                VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- pending | in_progress | completed | cancelled | blocked | na

  assigned_to_role      VARCHAR(50),
  assigned_to_user_id   UUID REFERENCES users(id),

  -- Lien optionnel vers entités OpsFlux
  linked_ads_id         UUID REFERENCES ads(id),
  linked_project_task_id UUID REFERENCES tasks(id),

  due_date              DATE,
  completed_at          TIMESTAMPTZ,
  notes                 TEXT,
  auto_generated        BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mission_prep ON mission_preparation_tasks(mission_notice_id, status);
```

#### MissionStakeholder (Parties prenantes)

```sql
CREATE TABLE mission_stakeholders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id     UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id),
  external_name         VARCHAR(200),
  external_email        VARCHAR(200),
  notification_level    VARCHAR(20) NOT NULL DEFAULT 'summary',
  -- full | summary | milestone
  UNIQUE (mission_notice_id, user_id)
);
```

#### MissionGlobalDocument (Documents liés à la mission entière)

```sql
CREATE TABLE mission_global_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  doc_type            VARCHAR(50) NOT NULL,
  -- ordre_mission | loi | programme_officiel | contrat | autre
  label               VARCHAR(200) NOT NULL,
  file_url            TEXT,          -- null si non encore uploadé
  required            BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by         UUID REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mgd_mission ON mission_global_documents(mission_notice_id);
```

#### MissionPaxDocument (Documents par PAX — passeport, visa, etc.)

```sql
CREATE TABLE mission_pax_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id     UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  pax_id                UUID NOT NULL REFERENCES pax_profiles(id),
  doc_type              VARCHAR(50) NOT NULL,
  -- passport | visa | medical_fit | autre
  label                 VARCHAR(200) NOT NULL,
  file_url              TEXT,          -- null si non encore uploadé
  required              BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by           UUID REFERENCES users(id),
  -- peut être le PAX lui-même ou un gestionnaire
  uploaded_at           TIMESTAMPTZ,
  expiry_date           DATE,          -- pour passeport, visa
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_notice_id, pax_id, doc_type)
);
CREATE INDEX idx_mpd_mission ON mission_pax_documents(mission_notice_id);
CREATE INDEX idx_mpd_pax     ON mission_pax_documents(pax_id);
```

**Logique de création :** Au lancement de l'AVM, pour chaque PAX dans
`mission_program_pax`, une ligne `mission_pax_documents` est créée pour
chaque entrée de `per_pax_attachments_config` — avec `file_url = null`
(en attente d'upload).
```

#### Champs ajoutés sur `ads` — lien AVM

```sql
ALTER TABLE ads
  ADD COLUMN source_avm_id        UUID REFERENCES mission_notices(id),
  ADD COLUMN source_avm_reference VARCHAR(50);
```

---

### 15.3 Service AVM

```python
# app/services/paxlog/avm_service.py

class AVMService:

    async def create_mission_notice(
        self, data: MissionNoticeCreate, actor: User, db: AsyncSession
    ) -> MissionNotice:
        """
        1. Générer la référence AVM-YYYY-NNNNN
        2. Créer la MissionNotice en status=draft
        3. Créer les lignes de programme (MissionProgram)
        4. Créer les MissionProgramPax (ou hériter via same_pax_as_line_id)
        5. Créer les MissionNoticeProjects
        6. Créer les MissionStakeholders
        7. Audit log
        """

    async def launch_mission(
        self, mission_id: UUID, actor: User, db: AsyncSession
    ) -> MissionNotice:
        """
        Lancement de l'AVM — déclenche toutes les actions automatiques.

        Séquence :
        1. Vérifier que le programme a au moins une ligne avec site_asset_id
        2. Créer les tâches préparatoires selon les indicateurs :
           - requires_visa=True        → tâche 'visa' → notification RH
           - requires_badge=True       → tâche 'badge' → notification LOG_BASE
           - requires_epi=True         → tâche 'epi_order' (avec mensurations) → Achats
           - displacement_allowance    → tâche 'allowance' → notification RH/Finance
        3. Pour chaque ligne de programme :
           - Avec site_asset_id → create_ads_for_program_line() + tâche 'ads_creation' complétée
           - Sans site_asset_id → aucune AdS, aucune tâche (site à définir ultérieurement)
        4. Créer les mission_pax_documents pour chaque PAX × per_pax_attachments_config
        5. status → in_preparation
        6. Émettre mission_notice.launched
        7. Envoyer le mail d'annonce (EN DERNIER — les AdS existent déjà, leurs références
           sont incluses dans le mail)
        -- Note FSM :
        -- in_preparation → active   : 1ère AdS générée passe en 'approved'
        -- active → ready            : toutes tâches prépa 'completed' ET toutes AdS 'approved'
        --                            → notif créateur "Tout est prêt — mission peut partir"
        -- ready → completed         : toutes AdS clôturées (pax_manifest.closed inbound)
        -- * → cancelled             : motif obligatoire
        """

    async def create_ads_for_program_line(
        self, line: MissionProgram, mission: MissionNotice,
        actor: User, db: AsyncSession
    ) -> AdS:
        """
        Crée une AdS depuis une ligne de programme.
        L'AdS est en draft — suit son propre workflow (étapes 0-A, 0-B, etc.).
        Lien maintenu dans mission_programs.generated_ads_id.
        """
        # Résoudre les PAX (directs ou hérités via same_pax_as_line_id)
        if line.same_pax_as_line_id:
            pax_ids = await get_program_pax(line.same_pax_as_line_id, db)
        else:
            pax_ids = await get_program_pax(line.id, db)

        project_id = (
            line.project_id  # Projet défini sur la ligne (peut être null)
            # Chaque ligne a son propre project_id — pas de fallback sur l'AVM globale
        )

        ads = await ads_service.create_ads(
            AdSCreate(
                entity_id=mission.entity_id,
                site_entry_asset_id=line.site_asset_id,
                start_date=line.planned_start_date,
                end_date=line.planned_end_date,
                description=line.activity_description,
                pax_ids=pax_ids,
                project_id=project_id,
                source_avm_id=mission.id,
                source_avm_reference=mission.reference
            ),
            actor=actor, db=db
        )
        line.generated_ads_id = ads.id
        await db.commit()
        return ads

    async def check_mission_readiness(
        self, mission_id: UUID, db: AsyncSession
    ) -> MissionReadinessReport:
        """
        Calcule le niveau de préparation :
        - Tâches prépa complétées / total
        - AdS approuvées / total
        - Documents requis uploadés / total
        - Intervenants compliant / total
        """
```

---

### 15.4 Mail d'annonce de mission

Au lancement, un email structuré est envoyé à toutes les parties prenantes :

```
Objet : [OpsFlux AVM] Mission annoncée — AVM-2026-00021 — E-LINE ESF1

MISSION : Supervision installation E-LINE ESF1 — Mai 2026
RÉFÉRENCE : AVM-2026-00021
INITIATEUR : Jean KOUASSI (Chef de Projet GCM-2026)

PROGRAMME PRÉVU
───────────────────────────────────────────────────────────────
14/05  Wouri → ESF1   J. DUPONT, A. NZIE    Supervision lancement
15/05  ESF1           J. DUPONT             Suivi opérations J+1
18/05  ESF1 → Wouri   J. DUPONT, A. NZIE    Retour
───────────────────────────────────────────────────────────────

ACTIONS EN COURS
  ✓ AdS ADS-2026-04521 créée (en attente de validation)
  ✓ AdS ADS-2026-04522 créée (en attente de validation)
  ⏳ Commande EPI en cours
  ⏳ Vérification badge d'accès

[Voir la mission →]
```

---

### 15.5 Interface AVM

La fiche AVM est accessible depuis le menu PaxLog → "Missions (AVM)".

**Onglets :**

```
AVM-2026-00021 — Mission E-LINE ESF1                      [ACTIVE]
──────────────────────────────────────────────────────────────────
[Programme]  [Travaux préparatoires]  [AdS]  [Documents]  [Parties prenantes]  [Historique]

──── Onglet "Travaux préparatoires" ────

Préparation : 4/7 actions  ████████░░░░  57%

  TYPE        TITRE                              STATUT       RESPONSABLE   ÉCHÉANCE
  ──────────────────────────────────────────────────────────────────────────────────
  ✓ ads        AdS ESF1 (14-15/05) créée         OK           AUTO          14/04
  ✓ ads        AdS ESF1 (16/05) créée            OK           AUTO          14/04
  ✓ badge      Vérification badge J. DUPONT       OK           LOG_BASE      10/04
  ✓ document   Passeport vérifié — J. DUPONT      OK           RH            10/04
  ⏳ epi        Commande EPI — XL/42              En cours     Achats        20/04
  —  visa       Visa non requis                   N/A          —             —
  ⏳ briefing   Briefing sécurité ESF1            En attente   CDS ESF1      12/05
```

**Cas — AdS rejetée dans l'AVM :**

Quand une AdS générée par l'AVM est rejetée, **l'AVM reste active**.
La tâche prépa `ads_creation` garde son statut `completed` (la création a eu lieu —
c'est la validation qui a échoué). L'initiateur reçoit une alerte et gère
la relance manuellement depuis l'onglet "AdS" de la fiche mission.

Sur la ligne de programme concernée, un bouton **"Recréer l'AdS"** apparaît :

```
Ligne 2  ESF1  16/05  → ADS-2026-04522  ✗ Rejetée — "Quota SCHLUMBERGER atteint"
                         [Recréer l'AdS →]
```

Le bouton pré-remplit une nouvelle AdS avec les données de la ligne.
L'initiateur peut modifier (dates, PAX, notes) avant de resoumettre.

---

### 15.6 Lien avec le module Projet

Les tâches préparatoires AVM peuvent être liées à des tâches du WBS
(`linked_project_task_id`) — elles apparaissent alors sur le Gantt Projets.

```
Tâche WBS : "1.2.1 — Préparation mission E-LINE"
  ├── AVM : Demande badge Jean DUPONT    ← linked_project_task_id
  ├── AVM : Commande EPI                 ← linked_project_task_id
  └── AVM : Briefing sécurité site       ← linked_project_task_id
```

---


### 15.2 Créneaux de réunion


#### Créneaux de réunion — DDL et endpoints

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
  organizer_name      VARCHAR(200),  -- si organisateur externe
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_meeting_slots_avm ON mission_meeting_slots(mission_notice_id, meeting_date);

CREATE TABLE mission_meeting_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID NOT NULL REFERENCES mission_meeting_slots(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),     -- null si externe
  external_name   VARCHAR(200),
  external_email  VARCHAR(200),
  confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (meeting_id, user_id)
);
```

**Affichage dans l'onglet "Programme" :**

```
──── Créneaux de réunion ────

  DATE     HEURE     TITRE                          LIEU              PARTICIPANTS
  14/05  08:00-09:00  Briefing sécurité arrivée     ESF1 — Bureaux    J.DUPONT, A.NZIE, CDS
  15/05  14:00-16:00  Revue d'avancement opérations  Salle conf ESF1   J.DUPONT, CHEF_PROJ
  18/05  07:30-08:00  Briefing départ retour          Wouri Base       J.DUPONT, A.NZIE

  [+ Ajouter un créneau]
```

**Note v1 :** Pas de synchronisation automatique avec Outlook/Google Calendar.
Simple liste visible sur la fiche AVM et dans le mail d'annonce. Sync agenda → v2.

---


### 15.3 Événements émis


#### Événements AVM

| Événement | Déclencheur | Consommateur |
|---|---|---|
| `mission_notice.created` | Création AVM | — |
| `mission_notice.launched` | Lancement AVM | Notifs stakeholders, RH, Achats |
| `mission_notice.ads_created` | AdS générée depuis ligne | PaxLog tracking |
| `mission_notice.ready` | Toutes tâches + AdS OK | Notif créateur + stakeholders |
| `mission_notice.completed` | Toutes AdS clôturées | Archivage |

---


### 15.4 RBAC AVM


### RBAC AVM

| Action | DO | CHEF_PROJET | LOG_BASE | DEMANDEUR | Autres |
|---|:---:|:---:|:---:|:---:|:---:|
| Créer une AVM | ✓ | ✓ | ✓ | ✓ | ✗ |
| Voir ses propres AVM | ✓ | ✓ | ✓ | ✓ | — |
| Voir toutes les AVM de l'entité | ✓ | ✗ | ✓ | ✗ | — |
| Voir les AVM de son département | ✓ | ✓ | ✓ | ✗ | — |
| Modifier (draft/in_preparation) | ✓ | créateur | créateur | créateur | ✗ |
| Lancer | ✓ | créateur | créateur | créateur | ✗ |
| Annuler | ✓ | créateur | créateur | créateur | ✗ |
| Gérer les tâches prépa | ✓ | ✓ | ✓ | ✗ | ✗ |
| Uploader documents | ✓ | ✓ | ✓ | ✓ | ✓ (si stakeholder) |

**Règle de visibilité :** Un utilisateur voit une AVM si :
- Il en est le créateur, OU
- Il est un `MissionStakeholder` de cette AVM, OU
- Il a le rôle LOG_BASE ou DO sur l'entité

---


### Règle — Étape 0-B exclue pour les AdS AVM

```python
def should_apply_step_0B(ads: AdS) -> bool:
    """Étape 0-B (validation chef de projet) exclue si AdS vient d'un AVM."""
    return (
        ads.planner_activity_id is not None    # liée à une activité Planner
        and ads.source_avm_id is None          # PAS générée depuis un AVM
        # L'AVM est elle-même la validation du projet — pas de double validation
    )
```

---


### 15.5 Formulaire Visa


— suivi intégré dans OpsFlux

Quand `requires_visa = True` au lancement de l'AVM, une tâche prépa `visa`
est créée **pour chaque PAX nécessitant un visa** (déterminé depuis
`mission_pax_documents` avec `doc_type = 'visa'`).

#### Table `mission_visa_requests`

```sql
CREATE TABLE mission_visa_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  destination_country VARCHAR(100) NOT NULL,
  -- Pays de destination (extrait du programme de mission)
  visa_type           VARCHAR(50),
  -- touriste | affaires | travail | transit
  application_date    DATE,
  status              VARCHAR(30) NOT NULL DEFAULT 'to_initiate',
  -- to_initiate | submitted | in_review | obtained | refused | cancelled
  submitted_at        DATE,
  obtained_at         DATE,
  refused_at          DATE,
  refusal_reason      TEXT,
  visa_expiry_date    DATE,          -- renseigné à l'obtention
  handled_by          UUID REFERENCES users(id),  -- agent RH en charge
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_notice_id, pax_id)
);
CREATE INDEX idx_visa_req_mission ON mission_visa_requests(mission_notice_id);
CREATE INDEX idx_visa_req_pax     ON mission_visa_requests(pax_id);
```

**Interface dans l'onglet "Travaux préparatoires" :**

```
⏳ visa   Demande visa — Jean DUPONT (Cameroun → France)   En revue   RH Marie EKWALLA   10/05

[Voir le dossier visa →]
```

**Fiche visa (vue détaillée) :**

```
Demande de visa — Jean DUPONT
Destination : France  |  Type : Affaires  |  Dossier déposé : 15/04/2026

Statut : EN REVUE ⏳
  ○ À initier  →  ✓ Soumis (15/04)  →  ● En revue  →  ○ Obtenu / ○ Refusé

Notes RH : Rendez-vous ambassade confirmé pour le 20/04

[Marquer comme obtenu]  [Marquer comme refusé — motif obligatoire]
```

**Endpoints visa :**

```
GET    /api/v1/pax/mission-notices/:id/visa-requests
POST   /api/v1/pax/mission-notices/:id/visa-requests
  Body: { pax_id, destination_country, visa_type, notes? }
  Droits: RH | LOG_BASE | DO
PATCH  /api/v1/pax/mission-notices/:id/visa-requests/:visa_id
  Body: { status, submitted_at?, obtained_at?, refused_at?,
          refusal_reason?, visa_expiry_date?, notes? }
  Droits: RH | LOG_BASE | DO
```

Quand le visa passe en `obtained` → tâche prépa `visa` correspondante
passe automatiquement en `completed` + `mission_pax_documents` mis à jour.

---


### 15.6 Formulaire Indemnité


— suivi intégré dans OpsFlux

Quand `eligible_displacement_allowance = True`, une tâche prépa `allowance`
est créée ET un formulaire de demande est généré.

#### Table `mission_allowance_requests`

```sql
CREATE TABLE mission_allowance_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_notice_id   UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
  pax_id              UUID NOT NULL REFERENCES pax_profiles(id),
  status              VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | submitted | approved | paid | rejected
  duration_days       SMALLINT,      -- durée du déplacement (calculée depuis le programme)
  amount_requested    DECIMAL(12,2), -- montant calculé ou saisi
  currency            VARCHAR(3) DEFAULT 'XAF',
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  payment_reference   VARCHAR(100),  -- référence de paiement
  rejection_reason    TEXT,
  handled_by          UUID REFERENCES users(id),  -- agent RH/Finance
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mission_notice_id, pax_id)
);
CREATE INDEX idx_allowance_mission ON mission_allowance_requests(mission_notice_id);
```

**Endpoints indemnité :**

```
GET    /api/v1/pax/mission-notices/:id/allowance-requests
PATCH  /api/v1/pax/mission-notices/:id/allowance-requests/:allowance_id
  Body: { status, amount_requested?, approved_at?, paid_at?,
          payment_reference?, rejection_reason?, notes? }
  Droits: RH | Finance | DO
```

Quand `paid` → tâche prépa `allowance` passe automatiquement en `completed`.

---


### 15.7 check_mission_readiness — compliance par ligne


— compliance par ligne

La compliance est vérifiée pour chaque PAX **contre le site de sa ligne de
programme** (pas globalement). Un PAX peut être conforme pour ESF1 mais pas
pour Munja si les exigences diffèrent.

```python
async def check_mission_readiness(
    self, mission_id: UUID, db: AsyncSession
) -> MissionReadinessReport:

    lines = await get_mission_program_lines(mission_id, db)
    compliance_results = []

    for line in lines:
        if not line.site_asset_id:
            continue
        pax_ids = await get_program_pax(line.id, db)
        for pax_id in pax_ids:
            result = await compliance_service.check_pax_compliance(
                pax_id=pax_id,
                asset_id=line.site_asset_id,
                declared_profile_type_id=None,
                ads_start_date=line.planned_start_date or date.today(),
                db=db
            )
            compliance_results.append({
                "pax_id": pax_id,
                "site": line.site_asset_id,
                "line_order": line.order_index,
                "is_compliant": result.is_compliant,
                "blocking_items": [
                    i for i in result.items if not i.is_compliant and i.mandatory
                ]
            })

    tasks = await get_prep_tasks(mission_id, db)
    ads_lines = [l for l in lines if l.generated_ads_id]
    ads_statuses = [await get_ads_status(l.generated_ads_id) for l in ads_lines]
    docs = await get_required_docs(mission_id, db)

    return MissionReadinessReport(
        ready=(
            all(r["is_compliant"] for r in compliance_results)
            and all(s == "approved" for s in ads_statuses)
            and all(t.status in ("completed","na") for t in tasks)
            and all(d.file_url for d in docs if d.required)
        ),
        completion_pct=compute_pct(tasks, ads_statuses, compliance_results, docs),
        compliance_by_pax=compliance_results,
        pending_items=[
            {"type": "compliance", "pax_id": r["pax_id"],
             "site": r["site"], "items": r["blocking_items"]}
            for r in compliance_results if not r["is_compliant"]
        ] + [
            {"type": "task", "task_id": t.id, "title": t.title}
            for t in tasks if t.status not in ("completed","na")
        ] + [
            {"type": "document", "doc_type": d.doc_type, "pax_id": getattr(d,"pax_id",None)}
            for d in docs if d.required and not d.file_url
        ]
    )
```

---


### 15.8 Règle — Annulation et modification (matrice)


### 15.9 Règle — Annulation et modification avec PAX sur site

```
AVM status          AdS associées             Action possible
──────────────────────────────────────────────────────────────────
draft               toutes null               Annulation libre
in_preparation      toutes draft/pending      Annulation libre → cascade
active              mix approved + pending    Annulation libre → cascade
active              ≥1 in_progress            BLOCAGE annulation → modification seulement
ready               toutes approved           Annulation libre → cascade (mission n'a pas encore démarré physiquement)
completed           toutes closed             Annulation impossible (mission terminée)
──────────────────────────────────────────────────────────────────
```

**Comportement PATCH /modify-active quand AdS in_progress :**
- Modification date fin → AdS passe en `requires_review` (motif affiché)
- Ajout PAX → nouvelle AdS ou ajout sur l'AdS existante selon le cas
- Retrait PAX déjà sur site → blocage `CANNOT_REMOVE_PAX_ON_SITE`
- Retrait PAX pas encore arrivé → retrait normal de l'AdS


---


## 16. Événements émis


| Événement | Déclencheur | Payload clé |
|---|---|---|
| `ads.created` | POST /ads | `{ads_id, reference, entity_id, site_asset_id}` |
| `ads.submitted` | POST /ads/:id/submit | `{ads_id, reference, pax_count, compliant_count, blocked_count}` |
| `ads.approved` | validate → approve (tous PAX OK) | `{ads_id, pax_list: [{ads_pax_id, pax_id, priority_score}]}` |
| `ads.rejected` | validate → reject | `{ads_id, reason}` |
| `ads.cancelled` | POST /ads/:id/cancel | `{ads_id, reason, ads_pax_ids: []}` |
| `ads_pax.unblocked` | credential validé → PAX passe compliant | `{ads_pax_id, pax_id, ads_id}` |
| `ads_pax.no_show` | manifest.closed depuis TravelWiz | `{ads_pax_id, pax_id, trip_id}` |
| `stay_program.approved` | POST /stay-programs/:id/approve | `{stay_program_id, pax_id, movements: []}` |
| `rotation.ads_auto_created` | Batch rotation | `{cycle_id, pax_id, ads_id, period_start, period_end}` |

### Payload complet `ads.approved`
```json
{
  "ads_id": "uuid",
  "ads_reference": "ADS-2026-04521",
  "entity_id": "uuid",
  "site_entry_asset_id": "uuid",
  "start_date": "2026-05-10",
  "end_date": "2026-05-20",
  "transport_requested": true,
  "transport_notes": "Hélico de préférence",
  "pax_list": [
    {
      "ads_pax_id": "uuid",
      "pax_id": "uuid",
      "pax_name": "Jean DUPONT",
      "pax_company": "PERENCO",
      "weight_kg": null,
      "priority_score": 52,
      "priority_source": "permanent_ops+no_project"
    }
  ]
}
```

---


---

*Fin du document — Module PaxLog*
