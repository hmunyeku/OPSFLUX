# Système de gestion des permissions

Ce système permet de contrôler l'affichage des menus et des composants en fonction des permissions de l'utilisateur.

## Architecture

### 1. Interfaces et Types

Les permissions sont définies dans `/src/lib/api.ts`:
- `Permission`: Représente une permission (code, nom, module, etc.)
- `Role`: Un rôle contenant plusieurs permissions
- `Group`: Un groupe contenant plusieurs permissions
- `User`: L'utilisateur avec ses rôles, groupes et permissions

### 2. Hook usePermissions

Le hook `usePermissions` (`/src/hooks/use-permissions.ts`) fournit:
- `permissions`: Liste de toutes les permissions de l'utilisateur
- `hasPermission(code)`: Vérifie si l'utilisateur a une permission
- `hasAnyPermission(codes[])`: Vérifie si l'utilisateur a au moins une permission
- `hasAllPermissions(codes[])`: Vérifie si l'utilisateur a toutes les permissions

**Note**: Les superusers ont automatiquement toutes les permissions.

### 3. Filtrage des menus

Les items de menu (`/src/components/layout/types.ts`) supportent:
- `permission`: Code de permission requis
- `requireAllPermissions`: Tableau de permissions (ET logique)
- `requireAnyPermission`: Tableau de permissions (OU logique)

Le composant `AppSidebar` filtre automatiquement les menus selon les permissions.

### 4. Composant PermissionGate

Le composant `PermissionGate` permet de conditionner l'affichage:

```tsx
<PermissionGate permission="users.write">
  <Button>Créer un utilisateur</Button>
</PermissionGate>
```

## Utilisation

### Ajouter une permission à un menu

Dans `/src/components/layout/data/sidebar-data.tsx`:

```tsx
{
  title: "Utilisateurs",
  icon: IconUsers,
  permission: "users.read", // Permission requise
  items: [
    {
      title: "Comptes",
      url: "/users",
      permission: "users.read",
    },
  ],
}
```

### Utiliser le hook dans un composant

```tsx
import { usePermissions } from '@/hooks/use-permissions'

function MyComponent() {
  const { hasPermission } = usePermissions()

  if (hasPermission('users.write')) {
    return <CreateUserButton />
  }

  return <div>Accès non autorisé</div>
}
```

### Conditionner l'affichage avec PermissionGate

```tsx
import { PermissionGate } from '@/components/permission-gate'

function UsersPage() {
  return (
    <div>
      <h1>Utilisateurs</h1>

      <PermissionGate permission="users.write">
        <CreateUserButton />
      </PermissionGate>

      <PermissionGate
        requireAnyPermission={["users.read", "users.write"]}
        fallback={<div>Accès non autorisé</div>}
      >
        <UsersTable />
      </PermissionGate>
    </div>
  )
}
```

## Codes de permission standard

Les codes de permission suivent la convention `module.action`:

### Dashboard
- `dashboard.read`: Voir le tableau de bord

### Utilisateurs
- `users.read`: Voir les utilisateurs
- `users.write`: Créer/modifier des utilisateurs
- `users.delete`: Supprimer des utilisateurs

### Groupes
- `groups.read`: Voir les groupes
- `groups.write`: Créer/modifier des groupes
- `groups.delete`: Supprimer des groupes

### Rôles
- `roles.read`: Voir les rôles
- `roles.write`: Créer/modifier des rôles
- `roles.delete`: Supprimer des rôles

### Paramètres
- `settings.read`: Voir les paramètres
- `settings.write`: Modifier les paramètres

### Développeurs
- `developers.read`: Accès à la section développeurs
- `api_keys.read`: Voir les clés API
- `api_keys.write`: Gérer les clés API
- `webhooks.read`: Voir les webhooks
- `webhooks.write`: Gérer les webhooks
- `logs.read`: Voir les logs

### Autres
- `tasks.read`: Voir les tâches
- `tasks.write`: Gérer les tâches
- `billing.read`: Voir la facturation
- `plans.read`: Voir les plans
- `apps.read`: Voir les applications connectées

## Backend

Les permissions doivent être créées dans le backend via l'API:

```bash
POST /api/v1/permissions/
{
  "code": "users.read",
  "name": "Voir les utilisateurs",
  "module": "users",
  "description": "Permission de voir la liste des utilisateurs"
}
```

Les permissions sont ensuite assignées:
- Directement à un utilisateur
- Via un rôle
- Via un groupe

L'endpoint `/api/v1/users/me?with_permissions=true` retourne l'utilisateur avec toutes ses permissions.
