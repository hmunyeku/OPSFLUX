# RBAC OpsFlux — Groupes, Rôles, Utilisateurs, Permissions

## 1. Modèle RBAC

OpsFlux implémente un **RBAC à permissions granulaires** basé sur des groupes. Le modèle repose sur 4 entités :

```
Utilisateur  ──appartient à──▶  Groupe  ──a le──▶  Rôle  ──contient──▶  Permissions
     │                              │
     │                      asset_scope (optionnel)
     │                      Restreint le groupe à un sous-ensemble d'assets
     │
     └─ Un utilisateur peut appartenir à plusieurs groupes
     └─ Les droits sont additifs (union de tous les groupes)
```

### Permissions granulaires

Les permissions suivent le format `{module}.{resource}.{action}` :
```
planner.activity.create
planner.conflict.resolve
paxlog.ads.validate_n1
paxlog.credential.validate_hse
travelwiz.manifest.close
assets.registry.write
core.rbac.manage
```

Un **rôle** = un ensemble nommé de permissions. Les modules enregistrent leurs rôles et permissions au démarrage via le `ModuleRegistry`.

### Niveaux de rôles

```
┌─ Plateforme (cross-tenant) ─────────────────────────┐
│  PLATFORM_ADMIN : gère les tenants, DB, déploiement  │
└──────────────────────────────────────────────────────┘
┌─ Tenant ─────────────────────────────────────────────┐
│  TENANT_ADMIN : configure son tenant (entités, SSO)   │
│  SYS_ADMIN    : gère utilisateurs/groupes/rôles       │
└──────────────────────────────────────────────────────┘
┌─ Modules (enregistrés au startup) ───────────────────┐
│  DO, DPROD, CDS, CHSE, PROJ_MGR, LOG_COORD, ...      │
│  Chaque module déclare ses rôles et permissions       │
└──────────────────────────────────────────────────────┘
```

### Enregistrement des rôles par les modules

```python
# Chaque module s'enregistre via ModuleRegistry au startup
def register(registry: ModuleRegistry):
    registry.add_permissions([
        "planner.activity.create",
        "planner.activity.approve",
        "planner.conflict.resolve",
    ])
    registry.add_roles([
        Role("SITE_MGR", permissions=["planner.activity.approve", ...]),
        Role("MAINT_MGR", permissions=["planner.activity.create_maintenance", ...]),
    ])
```

**Règles de base :**
- Un utilisateur n'a **jamais** de droits directs — uniquement via ses groupes
- Un groupe a **exactement un rôle**
- Un rôle définit un ensemble de permissions (format `module.resource.action`)
- Un groupe peut avoir un `asset_scope` : les droits du groupe ne s'appliquent qu'aux assets dans ce périmètre (ex: CDS du site Munja uniquement)
- Les droits de plusieurs groupes sont **cumulatifs** : si un utilisateur est dans le groupe CDS-Munja et dans le groupe LOG_BASE-Base-Wouri, il a les droits des deux
- Les rôles `PLATFORM_ADMIN` et `TENANT_ADMIN` sont définis par le core. Tous les autres rôles sont enregistrés par les modules.

**Tables clés :**
```sql
-- Schema platform (base centrale)
platform.tenants        → les tenants (chacun = un schema PG)
platform.platform_users → comptes platform_admin

-- Schema tenant (par tenant)
users                   → les comptes OpsFlux du tenant
roles                   → les rôles disponibles (codes techniques)
permissions             → les permissions (module.resource.action)
role_permissions        → association rôle ↔ permissions
user_groups             → les groupes (nom, rôle, entity_id, asset_scope optionnel)
user_group_members      → appartenance utilisateur ↔ groupe
```

---

## 2. Rôles disponibles (créés par défaut)

Les rôles ci-dessous sont **créés par défaut dans OpsFlux au démarrage**. L'administrateur peut créer des groupes basés sur ces rôles et y affecter des utilisateurs. Il peut aussi créer de nouveaux rôles si besoin.

### Hiérarchie organisationnelle Perenco Cameroun

```
                        ┌─────────────────┐
                        │       DO        │
                        │  Dir. Opérations│
                        │  Arbitre final  │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼──────────┐
    │    DPROD        │  │    DPROJ       │  │    DQHSE        │
    │ Dir. Production │  │ Dir. Projets   │  │  Dir. QHSE      │
    │ Gère les champs │  │ Portefeuille   │  │ Politique HSE   │
    └─────────┬──────┘  └────────┬───────┘  └──────┬──────────┘
              │                  │                  │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼──────────┐
    │     CDS         │  │  CHEF_PROJET   │  │     CHSE        │
    │ Chef de Site    │  │ Chef de Projet │  │ Coordinateur HSE│
    │ 1ère autorité  │  │ Son projet     │  │ Opérationnel    │
    └─────────┬──────┘  └────────────────┘  └──────┬──────────┘
              │                                     │
    ┌─────────▼──────┐                     ┌────────▼────────┐
    │     OMAA        │                     │   HSE_SITE      │
    │ Logistique site │                     │ Référent HSE    │
    │ (sur terrain)   │                     │ terrain         │
    └─────────────────┘                     └─────────────────┘

    ┌─────────────────┐  ┌─────────────────┐
    │    LOG_BASE     │  │  TRANSP_COORD   │
    │ Logistique Base │  │ Coord. Transport│
    │ Coordonne flotte│  │ Gère les vecteurs│
    └────────┬────────┘  └─────────────────┘
             │
    ┌────────▼────────┐
    │     PILOTE      │
    │ Capitaine/Pilote│
    │ portail seul    │
    └─────────────────┘

    ┌─────────────────┐  ┌─────────────────┐
    │    CMEDIC       │  │    DEMANDEUR    │
    │ Coord. Médical  │  │ Employé Perenco │
    │ Valide aptitudes│  │ Crée des AdS    │
    └────────┬────────┘  └─────────────────┘
             │
    ┌────────▼────────┐  ┌─────────────────┐
    │     MEDIC       │  │    EXT_SUPV     │
    │ Médecin sur site│  │ Superviseur ext.│
    │ Données santé   │  │ portail seul    │
    └─────────────────┘  └─────────────────┘

                         ┌─────────────────┐
                         │     READER      │
                         │ Consultation    │
                         │ seule           │
                         └─────────────────┘
```

---

## 3. Fiche détaillée de chaque rôle

### DO — Directeur des Opérations
**Code :** `DO`

**Responsabilité :** Autorité finale sur tout arbitrage. Le seul rôle qui peut résoudre les conflits de capacité Planner et les dépassements de quota PAX.

**Permissions clés :**
- Tout lire, tout modifier dans tous les modules
- **Seul à pouvoir** résoudre les conflits Planner (`conflict.resolve`)
- **Seul à pouvoir** surcharger la priorité d'une activité (`activity.priority_override`)
- **Seul à pouvoir** approuver une AdS en dérogation HSE complète
- **Seul à pouvoir** lever un signalement de type `blacklist_permanent`
- Annuler n'importe quel manifeste validé
- Modifier le planning de n'importe quel projet

**asset_scope :** Aucun (global — tous les assets de l'entité)

---

### DPROD — Directeur de Production
**Code :** `DPROD`

**Responsabilité :** Pilote la production sur ses champs. Rapporte au DO.

**Différence avec DO :** Scoped à ses champs. Ne peut pas résoudre des conflits globaux ni modifier des projets non liés à sa production.

**Permissions clés :**
- Approuver activités `permanent_ops` et `maintenance` sur ses champs
- Valider les AdS du personnel d'exploitation permanente
- Modifier la capacité PAX des sites de ses champs
- Valider manifestes PAX pour ses rotations
- Créer des signalements `avertissement` et `exclusion_site`

**asset_scope :** Ses champs (ex: champ EBOME, champ LOBE)

---

### DPROJ — Directeur Projets
**Code :** `DPROJ`

**Responsabilité :** Pilote le portefeuille de projets. Supervise tous les CHEF_PROJET.

**Permissions clés :**
- Créer/modifier/activer le planning de n'importe quel projet
- Approuver les activités `project` dans Planner (quand CDS délègue)
- Valider les AdS pour des activités projet critiques
- Vue consolidée de tous les projets actifs

**asset_scope :** Global (tous les assets)

---

### DQHSE — Directeur QHSE
**Code :** `DQHSE`

**Responsabilité :** Définit la politique HSE centrale. Garant de la compliance santé-sécurité.

**Permissions clés :**
- Configurer la matrice HSE au niveau `hse_central` (applicable partout)
- Valider les certifications HSE et médicales
- Créer des signalements de toute sévérité
- Valider les manifestes cargo hazmat
- Voir les rapports de compliance consolidés

**asset_scope :** Global

---

### CHSE — Coordinateur HSE
**Code :** `CHSE`

**Responsabilité :** Bras opérationnel du DQHSE. Gestion quotidienne de la compliance HSE.

**Permissions clés :**
- Valider les justificatifs de certifications (`credential.validate`)
- Ajouter des exigences HSE au niveau central ou d'un champ
- Créer des signalements `avertissement` et `exclusion_site`
- Valider manifestes cargo hazmat
- Déclencher les demandes de booking formations
- Générer les liens portail externe

**asset_scope :** Global (mais ne peut pas modifier les droits d'autres utilisateurs)

---

### CDS — Chef de Site
**Code :** `CDS`

**Responsabilité :** Première autorité sur son site. Décide qui monte sur son site.

**Permissions clés :**
- **Validateur principal des AdS** pour son site (N1 et/ou N2 selon config)
- Approuver les activités `maintenance` et `inspection` sur son site dans Planner
- Configurer les exigences HSE supplémentaires de son site
- Définir/modifier la capacité PAX de son site
- Enregistrer des signalements pour son site
- Voir en temps réel tous les PAX présents sur son site
- Déclarer les retours cargo (back cargo)

**asset_scope :** Son site (ex: Site Munja)

---

### OMAA — Officier Marine Adjoint aux Affaires
**Code :** `OMAA`

**Responsabilité :** Logistique physique sur site. Exécution des mouvements personnes et cargo.

**Permissions clés :**
- Pointer les PAX à l'arrivée/départ (`pax_manifest_entry.board`)
- Enregistrer les événements journal de bord
- Déclarer les retours cargo
- Signer les manifestes (signature tablette ou OTP)
- Créer des Programmes de Séjour intra-champ
- Voir la liste de tous les PAX présents sur son site
- Créer des AdS (ex: déplacement intra-champ urgent)

**asset_scope :** Son site

---

### HSE_SITE — Référent HSE Site
**Code :** `HSE_SITE`

**Responsabilité :** Application des règles HSE sur le terrain.

**Permissions clés :**
- Vérifier et valider les certifications (délégation du CHSE)
- Créer des signalements `avertissement`
- Configurer des exigences HSE spécifiques au site (délégation du CHSE)
- Voir la compliance de tous les PAX présents

**asset_scope :** Son site

---

### LOG_BASE — Chargé Logistique Base
**Code :** `LOG_BASE`

**Responsabilité :** Coordonne toute la logistique départ (manifestes, bateaux, cargo).

**Permissions clés :**
- Créer et organiser les voyages (trips)
- Valider et clôturer les manifestes PAX
- Organiser le deck des navires (algorithme + validation)
- Gérer tout le cargo (enregistrement, manifestes, retours)
- Générer les codes capitaine
- Configurer les rotations périodiques (avec TRANSP_COORD)

**asset_scope :** Sa base logistique et les assets desservis

---

### TRANSP_COORD — Coordinateur Transport
**Code :** `TRANSP_COORD`

**Responsabilité :** Gestion de la flotte de vecteurs.

**Permissions clés :**
- Enregistrer/modifier les vecteurs et leurs surfaces de deck
- Configurer les rotations périodiques
- Voir le planning de disponibilité de la flotte
- Configurer les devices IoT

**asset_scope :** Global (tous les vecteurs de l'entité)

---

### PILOTE — Capitaine/Pilote du vecteur
**Code :** `PILOTE`

**Responsabilité :** Conduite du vecteur. Accès via portail dédié uniquement.

**Accès :** Portail capitaine `captain.app.opsflux.io/{code_6_chiffres}` — pas de compte OpsFlux standard nécessaire.

**Permissions (portail uniquement) :**
- Voir le manifeste PAX de son voyage
- Pointer les PAX (boarded/no-show)
- Enregistrer les événements journal de bord
- Signaler des incidents / météo
- Signer les manifestes

**asset_scope :** Le voyage en cours uniquement (code unique)

---

### CHEF_PROJET — Chef de Projet
**Code :** `CHEF_PROJET`

**Responsabilité :** Planification et suivi de son ou ses projets.

**Permissions clés :**
- Créer/gérer WBS et planning de ses projets
- Créer des activités `project` dans Planner pour ses tâches
- Créer des AdS pour les équipes de ses projets
- Valider des AdS (N1) liées à ses projets
- Voir KPIs projet (PAX, cargo, avancement)

**asset_scope :** Assets liés à ses projets

---

### CMEDIC — Coordinateur Médical
**Code :** `CMEDIC`

**Responsabilité :** Validation centrale des aptitudes médicales.

**Permissions clés :**
- Valider les certifications de type `medical` uniquement
- Voir les données médicales complètes (dates précises)
- Voir et gérer les `pax_medical_records` (informations situationnelles)
- Lever les blocages médicaux (`medical_record.lift`)
- Configurer les paramètres des certifications médicales

**asset_scope :** Global (toutes les données médicales)

---

### MEDIC — Médecin/Infirmier sur site
**Code :** `MEDIC`

**Responsabilité :** Surveillance santé du personnel sur son site.

**Permissions clés :**
- Enregistrer des `pax_medical_records` (informations situationnelles — **seul rôle à pouvoir le faire**)
- Lever ses propres enregistrements médicaux
- Voir les données médicales des PAX présents sur son site
- Voir le statut médical de la liste de PAX présents

**Confidentialité :** Les enregistrements créés par MEDIC sont visibles uniquement par MEDIC (auteur), CMEDIC et DO.

**asset_scope :** Son site uniquement

---

### DEMANDEUR — Employé Perenco
**Code :** `DEMANDEUR`

**Responsabilité :** Création d'AdS pour soi-même ou son équipe.

**Permissions clés :**
- Créer une AdS individuelle ou d'équipe
- Voir le statut de ses demandes
- Compléter une demande renvoyée
- Générer un lien portail externe pour ses sous-traitants
- Enregistrer les profils PAX de son équipe

**asset_scope :** Aucune restriction (peut créer des AdS pour n'importe quel site)

---

### EXT_SUPV — Superviseur Externe
**Code :** `EXT_SUPV`

**Responsabilité :** Représentant d'une entreprise sous-traitante. Portail externe uniquement.

**Accès :** Via lien sécurisé `ext.app.opsflux.io/{token}` uniquement.

**Permissions (portail uniquement) :**
- Saisir les données des PAX de son entreprise
- Uploader les justificatifs de certifications
- Voir l'état des AdS pour son groupe
- Soumettre des AdS

**Ne peut pas :** Accéder aux données d'autres entreprises, modifier les données pré-configurées.

---

### READER — Lecteur
**Code :** `READER`

**Responsabilité :** Consultation uniquement. Aucune action.

**asset_scope :** Global

---

## 4. Exemple de configuration groupes pour Perenco Cameroun

L'administrateur OpsFlux crée des groupes basés sur ces rôles :

```
Groupe "DO - Direction Opérations"
  Rôle : DO
  asset_scope : (aucun - global)
  Membres : Jean-Marc DUPUIS

Groupe "DProd - Champ EBOME"
  Rôle : DPROD
  asset_scope : /ebome/* (tous les assets du champ EBOME)
  Membres : Paul MBARGA

Groupe "DProd - Champ LOBE"
  Rôle : DPROD
  asset_scope : /lobe/*
  Membres : Sylvie NGUEMA

Groupe "CDS - Site Munja"
  Rôle : CDS
  asset_scope : /ebome/munja/* (site Munja et ses enfants)
  Membres : Antoine KOUASSI

Groupe "OMAA - Site Munja"
  Rôle : OMAA
  asset_scope : /ebome/munja/*
  Membres : Joseph ATEBA, Marie NKONO

Groupe "LOG_BASE - Base Wouri"
  Rôle : LOG_BASE
  asset_scope : /base_wouri/*
  Membres : Moise BAYANACK, Patricia ELONG

Groupe "CHSE - Central"
  Rôle : CHSE
  asset_scope : (global)
  Membres : Armand FOTSO

Groupe "HSE_SITE - Munja"
  Rôle : HSE_SITE
  asset_scope : /ebome/munja/*
  Membres : Cécile BIYONG

Groupe "MEDIC - Munja"
  Rôle : MEDIC
  asset_scope : /ebome/munja/*
  Membres : Dr. MBALLA Pierre

Groupe "TRANSP_COORD - Flotte navale"
  Rôle : TRANSP_COORD
  asset_scope : (global)
  Membres : Capitaine ANTHONY, Roger EKWALLA

Groupe "PILOTE - HERA P"
  Rôle : PILOTE
  asset_scope : (géré par code voyage, pas par asset_scope)
  Membres : (aucun compte OpsFlux — accès portail par code)
```

Un utilisateur peut appartenir à plusieurs groupes. Exemple : Moise BAYANACK peut être dans "LOG_BASE - Base Wouri" ET dans "DEMANDEUR - Global".

---

## 5. Matrice des permissions clés par module

### 5.1 Projets

| Permission | DO | DPROD | DPROJ | CHEF_PROJET | DEMANDEUR | READER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `project.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project.create` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `project.update` (le sien) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `project.update` (tous) | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `project.status_change` | ✓ | ✓ (scope) | ✓ | ✓ (le sien) | ✗ | ✗ |
| `schedule.activate` | ✓ | ✗ | ✓ | ✓ (le sien) | ✗ | ✗ |
| `project.export_sap` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

### 5.2 Planner

| Permission | DO | DPROD | DPROJ | CDS | DQHSE/CHSE | CHEF_PROJET | DEMANDEUR | READER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `activity.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `activity.create_project` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `activity.create_maintenance` | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `activity.create_permanent_ops` | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `activity.create_inspection` | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `activity.approve` | ✓ | ✓ (scope) | ✓ | ✓ (scope) | ✗ | ✗ | ✗ | ✗ |
| `activity.update_approved` | ✓ | ✓ (scope) | ✓ | ✓ (scope) | ✗ | ✓ (la sienne) | ✗ | ✗ |
| **`conflict.resolve`** | **✓ seul** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **`activity.priority_override`** | **✓ seul** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `asset_capacity.update` | ✓ | ✓ (scope) | ✗ | ✓ (scope) | ✗ | ✗ | ✗ | ✗ |

### 5.3 PaxLog

| Permission | DO | DPROD | DQHSE | CHSE | CDS | OMAA | HSE_SITE | DPROJ | CHEF_PROJET | CMEDIC | MEDIC | DEMANDEUR | EXT_SUPV |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `pax_profile.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (scope) | ✓ | ✓ (son groupe) |
| `pax_profile.create` | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ (son groupe) |
| `credential.validate_hse` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ (délég.) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `credential.validate_medical` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `medical_record.read_full` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ (scope) | ✗ | ✗ |
| **`medical_record.create`** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ seul** | ✗ | ✗ |
| `medical_record.lift` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `ads.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ (son groupe) |
| `ads.validate_n1` | ✓ | ✓ (scope) | ✓ | ✓ | ✓ (scope) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `ads.validate_n2` | ✓ | ✓ (scope) | ✓ | ✓ | ✓ (scope) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **`ads.arbitrate_quota`** | **✓ seul** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `signalement.create` | ✓ | ✓ (scope) | ✓ | ✓ | ✓ (scope) | ✗ | ✓ (scope) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `signalement.validate` | ✓ | ✓ (scope) | ✓ | ✓ | ✓ (scope) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **`signalement.blacklist_permanent`** | **✓ seul** | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `compliance_matrix.update_central` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `compliance_matrix.update_site` | ✓ | ✓ (scope) | ✓ | ✓ | ✓ (scope) | ✗ | ✓ (scope) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `rotation_cycle.manage` | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 5.4 TravelWiz

| Permission | DO | DPROD | LOG_BASE | TRANSP_COORD | OMAA | CDS | PILOTE (portail) | CHSE | READER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `vehicle.create_update` | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `deck_surface.configure` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `trip.create` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `pax_manifest.validate` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `pax_manifest.close` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `pax_manifest.board_pax` | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `voyage_event.create` | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `cargo_item.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `cargo_manifest.validate` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **`cargo_manifest.validate_hazmat`** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | **✓ requis** | ✗ |
| `rotation.configure` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `deck_layout.validate` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `captain_code.generate` | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `iot_device.configure` | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |

---

## 6. Administration des rôles et groupes

**Qui peut gérer les utilisateurs/groupes ?** Un rôle administrateur système (`SYS_ADMIN`) distinct de tous les rôles métier. Il n'a pas accès aux données opérationnelles mais peut créer des utilisateurs, des groupes, et affecter des rôles.

**Règle de sécurité :** Aucun rôle métier ne peut modifier ses propres droits. La séparation des rôles administrateur / opérationnel est obligatoire.

**Audit :** Toute modification du RBAC (création de groupe, ajout/retrait de membre) est tracée dans `audit_log` avec : auteur, horodatage, action.

