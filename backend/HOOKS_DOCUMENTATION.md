# Documentation des Hooks - Événements disponibles

Ce document liste tous les événements de hooks disponibles dans le système, ainsi que les variables de contexte fournies pour chaque événement.

## Événements d'Invitation Utilisateur

### `user.invitation.created`

Déclenché lorsqu'une nouvelle invitation utilisateur est créée et envoyée.

**Variables de contexte disponibles :**

| Variable | Type | Description |
|----------|------|-------------|
| `invitation_id` | string (UUID) | Identifiant unique de l'invitation |
| `email` | string | Adresse email de l'utilisateur invité |
| `first_name` | string \| null | Prénom de l'utilisateur invité |
| `last_name` | string \| null | Nom de l'utilisateur invité |
| `role_id` | string (UUID) \| null | Identifiant du rôle assigné (optionnel) |
| `invited_by_id` | string (UUID) | Identifiant de l'utilisateur qui a envoyé l'invitation |
| `invited_by_name` | string | Nom complet ou email de l'utilisateur qui a envoyé l'invitation |
| `expires_at` | string (ISO 8601) | Date et heure d'expiration de l'invitation |
| `expiry_days` | integer | Nombre de jours de validité de l'invitation |

**Exemple de conditions :**

```json
{
  "role_id": {"!=": null}
}
```

**Exemple d'action - Envoyer une notification webhook :**

```json
{
  "type": "call_webhook",
  "config": {
    "url": "https://example.com/webhooks/invitation-created",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

**Exemple d'action - Envoyer un email personnalisé :**

```json
{
  "type": "send_email",
  "config": {
    "email_to": "admin@example.com",
    "template_id": "notification-template-id",
    "variables": {
      "notification_type": "Nouvelle invitation créée"
    }
  }
}
```

---

### `user.invitation.accepted`

Déclenché lorsqu'un utilisateur accepte une invitation et crée son compte.

**Variables de contexte disponibles :**

| Variable | Type | Description |
|----------|------|-------------|
| `invitation_id` | string (UUID) | Identifiant unique de l'invitation |
| `user_id` | string (UUID) | Identifiant du nouvel utilisateur créé |
| `email` | string | Adresse email de l'utilisateur |
| `first_name` | string \| null | Prénom de l'utilisateur |
| `last_name` | string \| null | Nom de l'utilisateur |
| `full_name` | string \| null | Nom complet de l'utilisateur |
| `role_id` | string (UUID) \| null | Identifiant du rôle assigné (optionnel) |
| `invited_by_id` | string (UUID) | Identifiant de l'utilisateur qui a envoyé l'invitation |
| `accepted_at` | string (ISO 8601) | Date et heure d'acceptation de l'invitation |

**Exemple de conditions :**

```json
{
  "role_id": "admin-role-uuid"
}
```

**Cas d'usage :**
- Envoyer un email de bienvenue personnalisé
- Notifier l'administrateur qui a envoyé l'invitation
- Créer automatiquement des tâches d'onboarding
- Déclencher un processus de provisionnement

---

### `user.invitation.revoked`

Déclenché lorsqu'une invitation est révoquée (supprimée) par un administrateur.

**Variables de contexte disponibles :**

| Variable | Type | Description |
|----------|------|-------------|
| `invitation_id` | string (UUID) | Identifiant unique de l'invitation |
| `email` | string | Adresse email de l'utilisateur invité |
| `first_name` | string \| null | Prénom de l'utilisateur invité |
| `last_name` | string \| null | Nom de l'utilisateur invité |
| `role_id` | string (UUID) \| null | Identifiant du rôle assigné (optionnel) |
| `invited_by_id` | string (UUID) | Identifiant de l'utilisateur qui avait envoyé l'invitation |
| `revoked_by_id` | string (UUID) | Identifiant de l'utilisateur qui a révoqué l'invitation |
| `revoked_by_name` | string | Nom complet ou email de l'utilisateur qui a révoqué l'invitation |
| `revoked_at` | string (ISO 8601) | Date et heure de révocation |

**Exemple de conditions :**

```json
{
  "revoked_by_id": {"!=": "$invited_by_id"}
}
```

**Cas d'usage :**
- Notifier l'utilisateur qui avait envoyé l'invitation
- Logger l'action pour l'audit
- Envoyer un email à l'invité pour l'informer

---

## Types d'Actions Disponibles

### 1. `call_webhook`

Envoie une requête HTTP à un webhook externe.

**Configuration :**

```json
{
  "type": "call_webhook",
  "config": {
    "url": "https://example.com/webhook",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_TOKEN"
    },
    "timeout": 30
  }
}
```

### 2. `send_email`

Envoie un email via le service d'emailing configuré.

**Avec template de la base de données :**

```json
{
  "type": "send_email",
  "config": {
    "email_to": "user@example.com",
    "template_id": "uuid-of-email-template",
    "variables": {
      "custom_var": "value"
    }
  }
}
```

**Email simple (sans template) :**

```json
{
  "type": "send_email",
  "config": {
    "email_to": "user@example.com",
    "subject": "Notification",
    "html_content": "<h1>Hello</h1><p>This is a notification.</p>"
  }
}
```

### 3. `send_notification`

Crée une notification in-app pour un utilisateur.

**Configuration :**

```json
{
  "type": "send_notification",
  "config": {
    "user_id": "uuid-of-user",
    "title": "Nouvelle invitation",
    "message": "Un nouvel utilisateur a été invité",
    "notification_type": "info",
    "link": "/users/invitations"
  }
}
```

### 4. `create_task`

Crée automatiquement une tâche.

**Configuration :**

```json
{
  "type": "create_task",
  "config": {
    "title": "Onboarding nouveau membre",
    "description": "Accompagner le nouveau membre dans sa prise en main",
    "assigned_to": "uuid-of-user",
    "priority": "high",
    "due_date": "2025-10-30T00:00:00Z"
  }
}
```

---

## Opérateurs de Conditions

Les conditions supportent les opérateurs suivants :

| Opérateur | Description | Exemple |
|-----------|-------------|---------|
| `==` | Égal à | `{"status": {"==": "active"}}` |
| `!=` | Différent de | `{"status": {"!=": "inactive"}}` |
| `>` | Supérieur à | `{"amount": {">": 100}}` |
| `>=` | Supérieur ou égal à | `{"amount": {">=": 100}}` |
| `<` | Inférieur à | `{"amount": {"<": 100}}` |
| `<=` | Inférieur ou égal à | `{"amount": {"<=": 100}}` |
| `in` | Dans la liste | `{"status": {"in": ["pending", "approved"]}}` |
| `not_in` | Pas dans la liste | `{"status": {"not_in": ["rejected", "cancelled"]}}` |
| `contains` | Contient (chaîne) | `{"email": {"contains": "@example.com"}}` |

**Note :** Si aucune condition n'est spécifiée, le hook sera toujours exécuté pour cet événement.

---

## Exemple Complet de Hook

Voici un exemple de hook complet qui envoie un email de notification à l'administrateur lorsqu'une invitation est acceptée et que l'utilisateur a un rôle spécifique :

```json
{
  "name": "Notifier admin - Invitation acceptée",
  "event": "user.invitation.accepted",
  "description": "Envoie un email à l'admin lorsqu'un manager accepte une invitation",
  "is_active": true,
  "priority": 10,
  "conditions": {
    "role_id": "manager-role-uuid"
  },
  "actions": [
    {
      "type": "send_email",
      "config": {
        "email_to": "admin@example.com",
        "template_id": "notification-template-id",
        "variables": {
          "notification_type": "Nouveau manager rejoint l'équipe"
        }
      }
    },
    {
      "type": "call_webhook",
      "config": {
        "url": "https://example.com/webhooks/new-manager",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        }
      }
    }
  ]
}
```

---

## Logs d'Exécution

Chaque exécution de hook est loggée dans la table `hook_execution` avec les informations suivantes :

- `hook_id` : Identifiant du hook exécuté
- `event_context` : Contexte complet de l'événement
- `success` : Succès ou échec de l'exécution
- `duration_ms` : Durée d'exécution en millisecondes
- `error_message` : Message d'erreur si échec
- `created_at` : Date et heure de l'exécution

Ces logs permettent de :
- Déboguer les hooks qui ne fonctionnent pas
- Monitorer les performances
- Auditer les actions automatiques
