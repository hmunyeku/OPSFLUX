# Module Workflow Engine — Spécification complète

## 1. Vision

Le Workflow Engine est un module **core** d'OpsFlux. Il fournit un **éditeur visuel de workflows** drag & drop, inspiré de DataFlo / EpiCollect, qui permet aux administrateurs de configurer les processus de validation de n'importe quel module sans toucher au code.

Tous les workflows OpsFlux — validation d'AdS, validation de manifestes TravelWiz, arbitrage Planner, signalements PaxLog — sont définis dans cet éditeur et exécutés par le moteur FSM (Finite State Machine) du core.

**Principe :** Un workflow est un **graphe orienté** de nœuds reliés par des transitions. Chaque nœud représente un état. Chaque transition est une action déclenchée par un acteur avec un rôle donné.

---

## 2. Concepts clés

### Nœud (State Node)

Un état dans le workflow. Peut être :

| Type de nœud | Icône | Description |
|---|---|---|
| `start` | ▶ | Point d'entrée — un seul par workflow |
| `human_validation` | 👤 | Une personne doit agir (valider, rejeter, commenter) |
| `system_check` | ⚙ | Vérification automatique (compliance HSE, quota Planner...) |
| `notification` | 🔔 | Envoi de notification sans attendre de réponse |
| `condition` | ◇ | Branchement conditionnel (si X → état A, sinon → état B) |
| `parallel` | ⏸ | Plusieurs branches parallèles (toutes doivent compléter) |
| `timer` | ⏱ | Attente d'une durée avant transition automatique |
| `end_approved` | ✓ | Terminal — entité approuvée |
| `end_rejected` | ✗ | Terminal — entité rejetée |
| `end_cancelled` | ⊘ | Terminal — entité annulée |

### Transition (Edge)

Lien entre deux nœuds. Porte :
- **Déclencheur :** action humaine (bouton "Valider") ou automatique (résultat d'un check)
- **Condition :** expression logique optionnelle (ex: `pax_count > 5`)
- **Rôle requis :** qui peut déclencher cette transition (ex: `CDS`, `CHSE`)
- **Périmètre :** restriction d'asset scope (ex: "CDS de l'asset cible de l'AdS")
- **Label :** texte affiché sur le bouton dans l'interface

---

## 3. L'éditeur visuel

### 3.1 Interface

```
┌─────────────────────────────────────────────────────────────────────┐
│  📋 Éditeur Workflow — AdS : Visite Projet (Standard)    [Publier]  │
├────────────┬────────────────────────────────────────────────────────┤
│  BLOCS     │                                                        │
│  ┌──────┐  │   ▶ START                                             │
│  │  👤  │  │        │                                              │
│  │Human │  │        ▼                                              │
│  └──────┘  │   ⚙ Vérif. Compliance HSE ──── ✗ Non conforme ──▶ 🔔 Notif demandeur │
│  ┌──────┐  │        │ Conforme                                      │
│  │  ⚙  │  │        ▼                                              │
│  │Check │  │   👤 Validation CDS ◄─ scope: asset cible            │
│  └──────┘  │     [Valider] [Rejeter] [Info]                        │
│  ┌──────┐  │        │                         │ Rejeter            │
│  │  🔔  │  │        ▼                         ▼                    │
│  │Notif │  │   ◇ PAX > quota?          ✗ END REJECTED              │
│  └──────┘  │     Oui │  Non                                        │
│  ┌──────┐  │        │    └──────────────▶ ✓ END APPROVED           │
│  │  ◇  │  │        ▼                                              │
│  │Cond. │  │   👤 Arbitrage DO ─────────────────────────────────▶ ✓│
│  └──────┘  │     [Approuver] [Reporter] [Rejeter]                  │
│  ┌──────┐  │                                                        │
│  │  ⏱  │  │                                                        │
│  │Timer │  │                                                        │
│  └──────┘  │                                                        │
└────────────┴────────────────────────────────────────────────────────┘
```

### 3.2 Blocs contextuels par module

Chaque module enregistre ses propres blocs disponibles dans l'éditeur. L'éditeur n'affiche que les blocs pertinents selon le contexte du workflow.

**Blocs PaxLog (disponibles dans les workflows AdS) :**
- `check_hse_compliance` : Lance la vérification compliance HSE pour tous les PAX
- `check_planner_quota` : Vérifie si le quota Planner est respecté
- `check_signalement_actif` : Vérifie si un signalement bloquant existe
- `check_medical_clearance` : Vérifie l'aptitude médicale
- `notify_demandeur` : Notifie le créateur de l'AdS
- `notify_pax` : Notifie tous les PAX de l'AdS
- `notify_travelwiz` : Déclenche la génération du manifeste TravelWiz
- `human_validation` : Nœud de validation humaine avec configuration du rôle
- `do_arbitrage` : Escalade vers le DO avec interface d'arbitrage dédiée

**Blocs TravelWiz (disponibles dans les workflows manifeste) :**
- `check_vehicle_capacity` : Vérifie la capacité du vecteur
- `check_hazmat_validation` : Vérifie la validation CHSE pour les matières dangereuses
- `notify_captain` : Génère le code accès portail capitaine
- `notify_log_base` : Notifie le LOG_BASE
- `human_validation` : Validation manifeste par LOG_BASE

**Blocs Planner (disponibles dans les workflows activité) :**
- `check_asset_capacity` : Vérifie la capacité résiduelle de l'asset
- `detect_conflict` : Crée un conflit si dépassement détecté
- `do_arbitrage_conflict` : Interface d'arbitrage conflit pour le DO
- `human_approval` : Approbation CDS ou DProd

---

## 4. Configuration d'un nœud Human Validation

Quand l'admin pose un bloc `human_validation` dans l'éditeur et clique dessus :

```
┌─────────────────────────────────────────────────┐
│  ✏ Configurer : Validation humaine              │
├─────────────────────────────────────────────────┤
│  Label du nœud : [Validation CDS             ]  │
│                                                  │
│  Rôle requis :   [CDS ▼]                        │
│  Périmètre :     [Asset cible de l'entité ▼]   │
│  │ options: Asset cible / Créateur du groupe /  │
│  │ Global (tous) / Spécifique (choisir)         │
│                                                  │
│  SLA (délai max) : [48] heures                  │
│  Rappel avant expiration : [4] heures           │
│  Si SLA dépassé : [Escalader au DO ▼]           │
│                                                  │
│  Boutons disponibles :                           │
│   [+ Ajouter]                                   │
│   ✓ Valider        → transition vers [suivant]  │
│   ✗ Rejeter        → transition vers [rejected] │
│   ↩ Demander info  → transition vers [draft]    │
│   ↑ Escalader      → transition vers [DO arb.]  │
│                                                  │
│  Message affiché au validateur :                 │
│  [Veuillez valider ou rejeter cette AdS]         │
│                                                  │
│  Champ commentaire :  ○ Optionnel               │
│                       ● Obligatoire si rejet     │
│                       ○ Toujours obligatoire     │
└─────────────────────────────────────────────────┘
```

---

## 5. Configuration d'un nœud Condition

```
┌─────────────────────────────────────────────────┐
│  ✏ Configurer : Condition                       │
├─────────────────────────────────────────────────┤
│  Label : [PAX count > quota Planner?]           │
│                                                  │
│  Expression :                                   │
│  [entity.ads.pax_count > entity.activity.pax_quota] │
│                                                  │
│  Variables disponibles :                        │
│   entity.ads.pax_count                          │
│   entity.ads.visit_category                     │
│   entity.activity.pax_quota                     │
│   entity.activity.priority                      │
│   entity.site.allow_overlap                     │
│   result.compliance_check.all_valid             │
│   result.signalement.has_blocking               │
│   ...                                           │
│                                                  │
│  Si vrai → transition vers : [Arbitrage DO]     │
│  Si faux → transition vers : [Approuvé]         │
└─────────────────────────────────────────────────┘
```

---

## 6. Versioning des workflows

Un workflow peut être modifié sans casser les instances en cours. Le principe :

- Un workflow a des **versions** : `draft`, `published`, `archived`
- Les instances (AdS, manifestes...) sont liées à la **version publiée au moment de leur création**
- Modifier un workflow publie une nouvelle version — les instances en cours continuent sur l'ancienne version
- L'admin peut voir quel % d'instances tourne sur quelle version

**Exemple :**
- Version 3 (publiée) : workflow à 2 niveaux (CDS + DProd)
- L'admin passe à 1 niveau (CDS seul) → publie version 4
- Les AdS en `pending_validation` continuent sur version 3
- Les nouvelles AdS créées après la publication utilisent version 4

---

## 7. Workflows livrés par défaut (seeds)

À l'installation, OpsFlux seed les workflows par défaut pour chaque module. L'admin peut les modifier mais pas les supprimer.

```
workflows (par défaut) :
  ├── ads_project_work_standard          AdS visite projet (standard 2 niveaux)
  ├── ads_permanent_ops                  AdS exploitation permanente (CDS + DProd)
  ├── ads_maintenance_urgent             AdS maintenance urgente (CDS seul)
  ├── ads_external_visit                 AdS visite externe (1 niveau)
  ├── pax_manifest_standard             Manifeste PAX (LOG_BASE)
  ├── cargo_manifest_standard           Manifeste cargo (LOG_BASE)
  ├── cargo_manifest_hazmat             Manifeste cargo hazmat (LOG_BASE + CHSE)
  ├── planner_activity_project          Activité projet Planner
  ├── planner_activity_workover         Activité workover (CDS + DPROD)
  ├── planner_activity_drilling         Activité forage (CDS + DPROD + DO)
  ├── planner_activity_integrity        Activité intégrité (CDS + CHSE)
  ├── planner_activity_maintenance      Activité maintenance Planner
  ├── rotation_travelwiz                Rotation périodique TravelWiz
  ├── signalement_avertissement         Signalement de type avertissement
  ├── signalement_blacklist             Signalement de type blacklist
  ├── avm_standard                      AVM standard (lancement direct par créateur)
  └── avm_vip                           AVM VIP (validation DO avant lancement)
```

---

## 8. Données

```sql
-- Définition d'un workflow
CREATE TABLE workflow_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  module          VARCHAR(50) NOT NULL,
  -- paxlog | travelwiz | planner | projets
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  trigger_context VARCHAR(100) NOT NULL,
  -- ex: 'ads.visit_category=project_work', 'cargo_manifest.has_hazmat=true'
  -- Le moteur choisit le workflow à appliquer selon ce contexte
  is_default      BOOLEAN DEFAULT FALSE,
  -- Utilisé si aucun autre workflow ne matche le contexte
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft | published | archived
  published_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Version d'un workflow (chaque publication = nouvelle version)
CREATE TABLE workflow_versions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id  UUID NOT NULL REFERENCES workflow_definitions(id),
  version_number          INTEGER NOT NULL,
  graph_json              JSONB NOT NULL,
  -- Définition complète du graphe : {nodes: [...], edges: [...]}
  published_by            UUID REFERENCES users(id),
  published_at            TIMESTAMPTZ,
  archived_at             TIMESTAMPTZ,
  UNIQUE (workflow_definition_id, version_number)
);

-- Instance d'exécution d'un workflow (liée à une entité métier)
CREATE TABLE workflow_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id   UUID NOT NULL REFERENCES workflow_versions(id),
  entity_type           VARCHAR(50) NOT NULL,  -- 'ads', 'pax_manifest', 'activity'...
  entity_id             UUID NOT NULL,
  current_node_id       VARCHAR(100) NOT NULL,  -- ID du nœud courant dans le graphe
  status                VARCHAR(20) NOT NULL,
  -- running | completed_approved | completed_rejected | completed_cancelled
  context               JSONB,
  -- Variables disponibles pour les conditions (snapshot au démarrage)
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

-- Historique des transitions d'une instance
CREATE TABLE workflow_transitions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           UUID NOT NULL REFERENCES workflow_instances(id),
  from_node_id          VARCHAR(100) NOT NULL,
  to_node_id            VARCHAR(100) NOT NULL,
  transition_type       VARCHAR(30) NOT NULL,
  -- human_action | system_auto | timer_expired | condition_true | condition_false
  triggered_by          UUID REFERENCES users(id),
  action_label          VARCHAR(100),  -- ex: 'Valider', 'Rejeter', 'Escalader'
  comment               TEXT,
  triggered_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wf_inst_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX idx_wf_trans_inst ON workflow_transitions(instance_id);
```

---

## 9. Comment le moteur sélectionne le workflow

```python
async def get_workflow_for_entity(
    module: str,
    entity: dict,
    db: AsyncSession
) -> WorkflowVersion:
    """
    Sélectionne la version publiée du workflow la plus appropriée
    selon le contexte de l'entité.
    
    Exemple pour une AdS :
    - entity = {visit_category: 'project_work', site_id: 'uuid-munja', ...}
    - Cherche le workflow avec trigger_context qui matche
    - Si plusieurs matchent → le plus spécifique gagne
    - Si aucun → utilise le workflow is_default=true du module
    """
    workflows = await db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_id == entity['entity_id'],
        WorkflowDefinition.module == module,
        WorkflowDefinition.status == 'published'
    ).all()
    
    # Évaluation du trigger_context (expression simple)
    # ex: 'ads.visit_category=project_work AND ads.pax_count>10'
    best_match = select_best_matching_workflow(workflows, entity)
    
    return await get_latest_version(best_match.id, db)
```

---

## 10. API Workflow Engine

```
# Éditeur (ASSET_ADMIN, PAX_ADMIN, SYS_ADMIN selon module)
GET    /api/v1/workflows                           Liste des workflows par module
POST   /api/v1/workflows                           Créer un workflow
GET    /api/v1/workflows/:id                       Détail + version courante
PATCH  /api/v1/workflows/:id                       Modifier le graphe (draft)
POST   /api/v1/workflows/:id/publish               Publier → nouvelle version
GET    /api/v1/workflows/:id/versions              Historique des versions
POST   /api/v1/workflows/:id/test                  Simuler une instance test

# Instances (consultation)
GET    /api/v1/workflow-instances?entity_type=ads&entity_id=...
GET    /api/v1/workflow-instances/:id/history      Historique des transitions

# Moteur (appelé par les services métier)
POST   /api/v1/internal/workflow/start             Démarrer une instance
POST   /api/v1/internal/workflow/:id/transition    Déclencher une transition
GET    /api/v1/internal/workflow/:id/current-node  État courant + actions disponibles
```

---

## 11. Délégation de validation

### 11.1 Principe

Un validateur (CDS, CHSE, DPROD…) peut désigner un remplaçant avant une
absence. Pendant la période de délégation, le remplaçant reçoit les mêmes
notifications et peut effectuer les mêmes actions de validation que le délégant.

La délégation est **explicite et temporaire** : elle s'active sur une plage de
dates définie par le délégant, et s'éteint automatiquement à la date de fin.

### 11.2 Interface — Profil utilisateur

```
Mon profil > Délégations > [+ Déléguer pendant mon absence]

  Déléguer à   : [Choisir un utilisateur du même groupe]
  Du           : [14/06/2026]
  Au           : [28/06/2026]  (inclus)
  Portée       : [ ] Toutes mes validations en attente
                 [x] Uniquement les nouvelles demandes arrivant pendant mon absence
  Message      : [En congé — toute question urgente au DO]

  [Confirmer la délégation]
```

À la création, un email est envoyé au remplaçant désigné avec la liste des
validations en attente (si portée = "toutes").

### 11.3 Règles

- Le remplaçant doit avoir **le même rôle** (ou un rôle supérieur) dans le
  même périmètre d'asset. Un CDS de Munja peut déléguer à un autre CDS de
  Munja, pas à un CDS d'ESF1.
- Une délégation peut être révoquée à tout moment par le délégant (ou SYS_ADMIN).
- Le délégant peut valider lui-même même pendant la période — les deux peuvent
  agir en parallèle.
- Une seule délégation active à la fois par utilisateur pour une même période.
- Toute action effectuée par le remplaçant est tracée dans l'audit log avec
  `performed_by = remplaçant_id` + `delegation_id = X` (traçabilité complète).

### 11.4 Données

```sql
CREATE TABLE user_delegations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id      UUID NOT NULL REFERENCES users(id),
  -- L'utilisateur qui délègue
  delegate_id       UUID NOT NULL REFERENCES users(id),
  -- Le remplaçant désigné
  entity_id         UUID NOT NULL REFERENCES entities(id),
  asset_scope_id    UUID REFERENCES assets(id),
  -- Périmètre de la délégation (null = tous les assets du délégant)
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  include_pending   BOOLEAN NOT NULL DEFAULT FALSE,
  -- true = le remplaçant voit aussi les validations déjà en attente
  message           TEXT,
  -- Message visible du remplaçant
  revoked           BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_delegation_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_no_self_delegation CHECK (delegator_id <> delegate_id)
);
CREATE INDEX idx_delegations_delegate ON user_delegations(delegate_id, start_date, end_date)
  WHERE revoked = FALSE;
CREATE INDEX idx_delegations_delegator ON user_delegations(delegator_id)
  WHERE revoked = FALSE;
```

### 11.5 Impact sur le Workflow Engine

Quand le moteur cherche les validateurs éligibles pour un nœud `human_validation` :

```python
async def get_eligible_validators(
    node: WorkflowNode,
    entity_asset_id: UUID,
    db: AsyncSession
) -> list[User]:
    """
    Retourne les utilisateurs pouvant valider ce nœud aujourd'hui.
    Inclut les délégués actifs en remplacement des délégants.
    """
    today = date.today()

    # Utilisateurs ayant le rôle requis sur le bon périmètre
    base_validators = await get_users_with_role(
        role=node.required_role,
        asset_scope=entity_asset_id,
        db=db
    )

    # Pour chaque validateur, vérifier s'il a délégué aujourd'hui
    # → remplacer par son délégué actif
    result = []
    for user in base_validators:
        active_delegation = await get_active_delegation(
            delegator_id=user.id,
            date=today,
            db=db
        )
        if active_delegation and not active_delegation.revoked:
            result.append(active_delegation.delegate)  # remplaçant à la place
        else:
            result.append(user)  # validateur normal

    return result
```

### 11.6 Notification au remplaçant

À chaque nouvelle AdS (ou entité workflow) arrivant dans la file du délégant
pendant la période de délégation, le remplaçant reçoit :

```
Objet : [Délégation Jean KOUASSI] AdS ADS-2026-04521 à valider

Vous avez été désigné comme remplaçant de Jean KOUASSI jusqu'au 28/06/2026.
L'AdS suivante est en attente de votre validation :
  - ADS-2026-04521 — Équipe DIXSTONE — 4 PAX — Munja — 22-28 juin

[Valider maintenant →]
```
