# Permissions System - Documentation

## Overview

The permissions system provides a comprehensive role-based access control (RBAC) implementation for the OpsFlux frontend application. It allows fine-grained control over UI elements and actions based on user permissions.

## Architecture

### Components

1. **API Client** (`/lib/permissions-api.ts`)
   - Handles communication with backend permission endpoints
   - Fetches user permissions with source tracking
   - Types: `Permission`, `PermissionSource`, `UserPermissionWithSource`

2. **Context Provider** (`/lib/permissions-context.tsx`)
   - Manages permission state across the application
   - Provides hooks for permission checking
   - Automatically fetches permissions when user logs in

3. **UI Components** (`/components/permission-guard.tsx`)
   - `PermissionGuard` - Single permission check
   - `PermissionGuardAny` - OR logic (any permission)
   - `PermissionGuardAll` - AND logic (all permissions)

4. **Example Component** (`/components/permissions-example.tsx`)
   - Comprehensive examples of all permission patterns
   - Live display of current user permissions

## Installation

The permissions system is automatically integrated into the app via the root layout:

```tsx
// app/layout.tsx
<AuthProvider>
  <PermissionsProvider>
    {/* Rest of your app */}
  </PermissionsProvider>
</AuthProvider>
```

## Usage Examples

### 1. Basic Permission Guard

Hide/show UI elements based on a single permission:

```tsx
import { PermissionGuard } from "@/components/permission-guard"

<PermissionGuard resource="users" action="create">
  <Button>Create User</Button>
</PermissionGuard>
```

With a fallback for when permission is missing:

```tsx
<PermissionGuard
  resource="users"
  action="create"
  fallback={<Button disabled>Create User (No Permission)</Button>}
>
  <Button>Create User</Button>
</PermissionGuard>
```

### 2. Permission Guard ANY (OR Logic)

Show content if user has ANY of the specified permissions:

```tsx
import { PermissionGuardAny } from "@/components/permission-guard"

<PermissionGuardAny
  permissions={[
    { resource: "users", action: "read" },
    { resource: "users", action: "create" },
    { resource: "users", action: "update" },
  ]}
  fallback={<p>You need at least one user permission</p>}
>
  <UserManagementPanel />
</PermissionGuardAny>
```

### 3. Permission Guard ALL (AND Logic)

Show content only if user has ALL specified permissions:

```tsx
import { PermissionGuardAll } from "@/components/permission-guard"

<PermissionGuardAll
  permissions={[
    { resource: "users", action: "read" },
    { resource: "users", action: "update" },
  ]}
  fallback={<p>You need both read and update permissions</p>}
>
  <EditUserForm />
</PermissionGuardAll>
```

### 4. Programmatic Permission Checks

Use the `usePermissions` hook for more complex logic:

```tsx
import { usePermissions } from "@/lib/permissions-context"

function MyComponent() {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions()

  // Single permission check
  const canCreate = hasPermission("users", "create")

  // Disable button based on permission
  <Button disabled={!hasPermission("users", "update")}>
    Edit User
  </Button>

  // Conditional rendering
  {hasPermission("users", "delete") && (
    <Button variant="destructive">Delete User</Button>
  )}

  // Multiple permissions (OR)
  {hasAnyPermission([
    { resource: "users", action: "read" },
    { resource: "users", action: "create" }
  ]) && <UserSection />}

  // Multiple permissions (AND)
  {hasAllPermissions([
    { resource: "reports", action: "read" },
    { resource: "reports", action: "export" }
  ]) && <ExportButton />}
}
```

### 5. Conditional Buttons in Headers

Example from TravelWiz components:

```tsx
import { usePermissions } from "@/lib/permissions-context"
import { useHeaderContext } from "@/components/header-context"

export function MyContent() {
  const { setContextualHeader, clearContextualHeader } = useHeaderContext()
  const { hasPermission } = usePermissions()

  React.useEffect(() => {
    const buttons = []

    // Only add button if user has permission
    if (hasPermission("travelwiz_manifests", "create")) {
      buttons.push({
        label: "Nouveau Manifeste",
        icon: Plus,
        onClick: () => setShowDialog(true),
        variant: "default" as const,
      })
    }

    setContextualHeader({
      searchPlaceholder: "Search...",
      onSearchChange: setSearchQuery,
      contextualButtons: buttons,
    })

    return () => clearContextualHeader()
  }, [setContextualHeader, clearContextualHeader, hasPermission])
}
```

## Permission Naming Convention

Permissions follow the format: `resource:action`

### Common Resources:
- `users` - User management
- `roles` - Role management
- `permissions` - Permission management
- `dashboards` - Dashboard management
- `projects` - Project management
- `tasks` - Task management
- `travelwiz_manifests` - TravelWiz loading manifests
- `travelwiz_back_cargo` - TravelWiz back cargo

### Common Actions:
- `read` - View/list resources
- `create` - Create new resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `export` - Export data

## API Endpoints

### Get Current User's Permissions
```typescript
GET /api/v1/user-permissions/me

Response: {
  permissions: [
    {
      permission: {
        id: "uuid",
        name: "users:read",
        resource: "users",
        action: "read",
        is_active: true,
        is_default: false
      },
      source: "ROLE", // DEFAULT | ROLE | GROUP | PERSONAL
      source_name: "Admin"
    }
  ]
}
```

### Get Specific User's Permissions
```typescript
GET /api/v1/user-permissions/{user_id}

// Admin only or user viewing their own permissions
```

## Permission Sources

Permissions can come from multiple sources (in order of precedence):

1. **DEFAULT** - System-wide default permissions for all users
2. **ROLE** - Permissions inherited from user's roles
3. **GROUP** - Permissions inherited from user's groups
4. **PERSONAL** - Permissions directly assigned to the user

Higher priority sources can override lower ones.

## Superuser Privileges

Users with `is_superuser: true` automatically have all permissions without needing explicit permission entries.

```tsx
// Superusers bypass all permission checks
const { hasPermission } = usePermissions()

// Always returns true for superusers
hasPermission("any_resource", "any_action") // true
```

## Applied Components

The permissions system is already integrated into:

1. **Dashboard** (`/components/dashboard/modern-dashboard.tsx`)
   - "Nouveau Dashboard" button (requires `dashboards:create`)
   - "Nouveau Projet" button (requires `projects:create`)
   - "Créer une Tâche" button (requires `tasks:create`)

2. **TravelWiz - Boat Manifests** (`/components/travelwiz/boat-manifests-content.tsx`)
   - "Nouveau Manifeste" button (requires `travelwiz_manifests:create`)

3. **TravelWiz - Back Cargo** (`/components/travelwiz/back-cargo-content.tsx`)
   - "Nouveau Retour" button (requires `travelwiz_back_cargo:create`)

## Testing

To test the permissions system:

1. **View Example Page**
   ```tsx
   import { PermissionsExample } from "@/components/permissions-example"

   // Add to a route to see live examples
   <PermissionsExample />
   ```

2. **Check Current Permissions**
   ```tsx
   const { permissions, permissionsWithSource } = usePermissions()
   console.log("My permissions:", permissions)
   console.log("With sources:", permissionsWithSource)
   ```

3. **Test Different Permission States**
   - Login as different users with different roles
   - Verify UI elements appear/hide based on permissions
   - Test button states (enabled/disabled)
   - Check fallback content rendering

## Troubleshooting

### Permissions Not Loading

```tsx
const { isLoading, permissions } = usePermissions()

if (isLoading) {
  return <LoadingSpinner />
}

if (permissions.length === 0) {
  console.warn("No permissions loaded - check API connection")
}
```

### Permission Check Not Working

1. Verify the resource and action names match exactly (case-sensitive)
2. Check if user is authenticated
3. Confirm the permission exists in the backend
4. Check browser console for API errors

### Superuser Not Getting Access

Verify in the User object:
```tsx
const { user } = useAuth()
console.log("Is superuser:", user?.is_superuser)
```

## Best Practices

1. **Always use PermissionGuard for UI elements**
   ```tsx
   // Good
   <PermissionGuard resource="users" action="delete">
     <DeleteButton />
   </PermissionGuard>

   // Avoid - harder to maintain
   {hasPermission("users", "delete") && <DeleteButton />}
   ```

2. **Provide meaningful fallbacks**
   ```tsx
   // Good - explains why user can't see it
   <PermissionGuard
     resource="users"
     action="export"
     fallback={<Tooltip content="Requires export permission"><Button disabled>Export</Button></Tooltip>}
   >
     <Button>Export</Button>
   </PermissionGuard>
   ```

3. **Use semantic permission names**
   ```tsx
   // Good
   hasPermission("projects", "create")

   // Avoid
   hasPermission("project_management", "add_new_project")
   ```

4. **Check permissions early**
   ```tsx
   // At component level
   const canManageUsers = hasPermission("users", "update")

   // Use throughout component
   <Button disabled={!canManageUsers}>Edit</Button>
   {canManageUsers && <AdvancedSettings />}
   ```

## Future Enhancements

Potential improvements:

1. **Permission Caching** - Cache permissions in localStorage
2. **Permission Preloading** - Fetch permissions during app initialization
3. **Permission Analytics** - Track which permissions are most used
4. **Dynamic Permission Loading** - Load permissions on-demand per module
5. **Permission Testing Helpers** - Test utilities for unit/integration tests

## Support

For issues or questions about the permissions system:

1. Check this documentation
2. Review `/components/permissions-example.tsx` for examples
3. Check backend API at `/api/v1/user-permissions/me`
4. Contact the development team
