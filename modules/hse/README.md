# Module HSE (Health, Safety, Environment)

## Description

Module complet pour la gestion des incidents HSE, investigations, actions correctives et préventives.

## Fonctionnalités

- **Gestion des incidents** : Déclaration, suivi et clôture des incidents HSE
- **Classification** : Types (near-miss, injury, environmental, equipment) et sévérité (1-10)
- **Investigation automatique** : Déclenchée automatiquement pour incidents critiques (≥7)
- **Notifications** : Alertes automatiques via hooks pour incidents critiques
- **Statistiques** : Dashboard avec KPIs en temps réel
- **Audit complet** : Toutes les actions sont loguées

## Structure

```
hse/
├── manifest.json          # Configuration auto-déclarative
├── backend/
│   ├── __init__.py
│   ├── models.py          # Modèle Incident (hérite de AbstractBaseModel CORE)
│   ├── service.py         # HSEService (exploite services CORE)
│   └── routes.py          # API REST /hse/*
├── frontend/              # (À implémenter)
├── requirements.txt       # Aucune dépendance supplémentaire
└── README.md              # Ce fichier
```

## Exploitation des services CORE

Ce module **EXPLOITE** les services du CORE pour toutes les fonctionnalités transversales :

### Backend
- **AbstractBaseModel** : Modèle de base avec audit trail, soft delete, external_id
- **NotificationService** : Notifications in-app pour incidents critiques
- **EmailService** : Emails automatiques (via hooks)
- **AuditService** : Log de toutes les modifications
- **HookService** : Déclenchement automatique des hooks
- **SettingsService** : Configuration du préfixe de numérotation
- **FileManager** : Gestion des photos d'incidents (à implémenter)

### Frontend (à implémenter)
- **useNotification** : Affichage des notifications
- **useTranslation** : Traductions multilingues (FR/EN)
- **FileUpload** : Upload de photos
- **DataTable** : Liste des incidents
- **Form components** : Formulaires shadcn/ui

## API Endpoints

### `GET /api/v1/hse/incidents/`
Liste paginée des incidents avec filtres.

**Query params :**
- `skip` : Pagination offset (default: 0)
- `limit` : Nombre d'éléments (default: 100)
- `type` : Type d'incident (near_miss, injury, environmental, equipment)
- `severity_level` : Niveau de sévérité (low, medium, high, critical)
- `is_closed` : Filtrer fermés ou ouverts

**Response :**
```json
{
  "data": [
    {
      "id": "uuid",
      "number": "HSE-2024-001",
      "type": "injury",
      "severity": 8,
      "severity_level": "high",
      "title": "Chute depuis échafaudage",
      "description": "...",
      "location": "Plateforme A",
      "incident_date": "2024-10-16T10:30:00Z",
      "requires_investigation": true,
      "is_closed": false
    }
  ],
  "count": 1
}
```

### `POST /api/v1/hse/incidents/`
Crée un nouvel incident.

**Body :**
```json
{
  "type": "injury",
  "severity": 8,
  "title": "Chute depuis échafaudage",
  "description": "Description détaillée de l'incident",
  "location": "Plateforme A",
  "incident_date": "2024-10-16T10:30:00Z",
  "witnesses": "John Doe, Jane Smith",
  "injured_persons": "Bob Martin (main gauche)"
}
```

**Déclenchements automatiques :**
- Génération numéro unique (HSE-YYYY-NNN)
- Calcul niveau de sévérité (low/medium/high/critical)
- Détermination si investigation requise (severity >= 7)
- Hook `hse.incident.created` (notifications, emails)
- Audit log

### `GET /api/v1/hse/incidents/{id}`
Récupère un incident spécifique.

### `PATCH /api/v1/hse/incidents/{id}`
Met à jour un incident.

**Déclenchements automatiques :**
- Hook `hse.incident.updated`
- Audit log des modifications

### `DELETE /api/v1/hse/incidents/{id}`
Supprime (soft delete) un incident.

### `GET /api/v1/hse/incidents/stats`
Récupère les statistiques HSE.

**Response :**
```json
{
  "total": 125,
  "open": 45,
  "closed": 80,
  "critical": 3,
  "pending_investigation": 5
}
```

## Permissions

- `hse.view.dashboard` : Voir le tableau de bord HSE
- `hse.create.incident` : Créer un incident
- `hse.edit.incident` : Modifier un incident
- `hse.delete.incident` : Supprimer un incident
- `hse.view.report` : Voir les rapports

## Hooks

### `hse.incident.created`
Déclenché à la création d'un incident.

**Context :**
```json
{
  "incident": {
    "id": "uuid",
    "number": "HSE-2024-001",
    "title": "...",
    "severity": 8,
    "type": "injury"
  }
}
```

**Hook configuré dans manifest :**
- **Condition** : severity >= 8 (critiques uniquement)
- **Actions** :
  - Notification aux managers HSE
  - Email d'alerte
  - Création tâche investigation automatique

### `hse.incident.updated`
Déclenché à chaque modification d'incident.

**Action :** Audit log systématique

## Traductions

Langues supportées :
- 🇫🇷 Français
- 🇬🇧 Anglais

Clés principales :
- `hse.incident.title`, `hse.incident.new`, `hse.incident.edit`
- `hse.severity.low/medium/high/critical`
- `hse.type.near_miss/injury/environmental`

## Préférences utilisateur

- `hse.notification.email.incident_created` : Email nouveaux incidents (default: true)
- `hse.dashboard.default_period` : Période dashboard (default: "month")

## Settings système

- `hse.incident.auto_numbering` : Numérotation auto (default: true)
- `hse.incident.number_prefix` : Préfixe (default: "HSE-")
- `hse.incident.critical_threshold` : Seuil critique (default: 8)

## Installation

Le module s'installe via le gestionnaire de modules OpsFlux :

1. Uploader le ZIP du module via `/developers/modules`
2. Le système valide le manifest et les dépendances
3. Installation automatique :
   - Enregistrement des permissions dans RBAC
   - Enregistrement des menus dans le menu manager
   - Enregistrement des hooks dans le hook system
   - Enregistrement des traductions
4. Activation du module
5. Les menus apparaissent automatiquement dans la navigation

## Dépendances

### Services CORE requis
- `notification` : Notifications in-app
- `email` : Envoi d'emails
- `file_manager` : Upload photos incidents
- `audit` : Audit logs

### Modules requis
Aucun - module standalone

## Version

**1.0.0** - Version initiale

## License

Proprietary - OpsFlux Team

## Support

- Documentation : https://docs.opsflux.io/modules/hse
- Email : modules@opsflux.io
