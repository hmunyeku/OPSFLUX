# Système de Permissions

Ce document décrit le système complet de gestion des permissions implémenté dans l'application.

## 📋 Vue d'ensemble

Le système de permissions protège à la fois **le menu de navigation** et **l'accès aux pages** en utilisant les permissions définies dans la base de données.

## 🔒 Composants du système

### 1. Backend - Récupération des permissions

**Fichier** : `backend/app/api/routes/user_permissions.py`

L'endpoint `/api/v1/user-permissions/me` retourne toutes les permissions de l'utilisateur avec leur source :

```python
{
  "data": [
    {
      "permission": {...},
      "source": "role",  # ou "default", "group", "personal"
      "source_name": "Admin"
    }
  ],
  "count": 10
}
```

**Ordre de priorité des permissions** :
1. **DEFAULT** (Système) - Plus basse priorité
2. **ROLE** (Rôles)
3. **GROUP** (Groupes)
4. **PERSONAL** (Personnelles) - Plus haute priorité

### 2. Frontend - Hook `usePermissions`

**Fichier** : `frontend/src/hooks/use-permissions.ts`

Hook React qui agrège les permissions de l'utilisateur depuis :
- Permissions directes
- Permissions des rôles
- Permissions des groupes

**Méthodes disponibles** :
```typescript
const {
  permissions,              // Liste complète des permissions
  hasPermission,           // Vérifie une permission simple
  hasAnyPermission,        // Vérifie si l'utilisateur a AU MOINS UNE des permissions
  hasAllPermissions,       // Vérifie si l'utilisateur a TOUTES les permissions
  isLoading
} = usePermissions()
```

**Exemple d'utilisation** :
```typescript
if (hasPermission('users.read')) {
  // Afficher le contenu
}

if (hasAnyPermission(['users.read', 'users.write'])) {
  // L'utilisateur a au moins l'une de ces permissions
}
```

### 3. Protection du menu - Filtrage automatique

**Fichier** : `frontend/src/components/layout/app-sidebar.tsx`

Le menu sidebar est automatiquement filtré selon les permissions :

```typescript
const filteredNavGroups = useMemo(() => {
  return sidebarData.navGroups
    .map((group) => ({
      ...group,
      items: filterNavItems(group.items, permissionChecker),
    }))
    .filter((group) => group.items.length > 0)
}, [hasPermission, hasAnyPermission, hasAllPermissions])
```

**Configuration des permissions dans le menu** :

**Fichier** : `frontend/src/components/layout/data/sidebar-data.tsx`

```typescript
{
  title: "Utilisateurs",
  icon: IconUsers,
  permission: "users.read",  // Permission simple
  items: [
    {
      title: "Comptes",
      url: "/users",
      permission: "users.read"
    },
    {
      title: "Groupes",
      url: "/users/groups",
      permission: "groups.read"
    }
  ]
}
```

**Options de permissions disponibles** :
- `permission`: Permission simple (ex: `"users.read"`)
- `requireAllPermissions`: Array de permissions (ET logique)
- `requireAnyPermission`: Array de permissions (OU logique)

### 4. Protection des pages - `PermissionGuard`

**Fichier** : `frontend/src/components/permission-guard.tsx`

Composant React qui protège l'accès aux pages et redirige vers `/403` en cas de refus :

```typescript
<PermissionGuard permission="users.read">
  <UsersPage />
</PermissionGuard>
```

**Props disponibles** :
```typescript
interface PermissionGuardProps {
  children: ReactNode
  permission?: string                    // Permission simple
  requireAllPermissions?: string[]       // ET logique
  requireAnyPermission?: string[]        // OU logique
  fallbackUrl?: string                   // URL de redirection (défaut: /403)
  showLoader?: boolean                   // Afficher un loader (défaut: true)
}
```

**Exemples d'utilisation** :

```typescript
// Permission simple
<PermissionGuard permission="users.read">
  <UsersPage />
</PermissionGuard>

// Toutes les permissions requises (ET)
<PermissionGuard requireAllPermissions={["users.read", "users.write"]}>
  <UsersEditPage />
</PermissionGuard>

// Au moins une permission requise (OU)
<PermissionGuard requireAnyPermission={["admin", "moderator"]}>
  <AdminPanel />
</PermissionGuard>

// Redirection personnalisée
<PermissionGuard permission="premium.access" fallbackUrl="/upgrade">
  <PremiumFeature />
</PermissionGuard>
```

### 5. Page 403 - Accès refusé

**Fichier** : `frontend/src/app/(dashboard)/403/page.tsx`

Page d'erreur stylisée affichée dans le shell de l'application avec :
- Icône et message explicatif
- Raisons possibles du refus
- Boutons "Retour" et "Accueil"

### 6. Configuration des routes

**Fichier** : `frontend/src/lib/route-permissions.ts`

Carte centralisée des permissions requises par route :

```typescript
export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  "/users": {
    permission: "users.read",
  },
  "/users/groups": {
    permission: "groups.read",
  },
  "/users/rbac": {
    permission: "roles.read",
  },
  "/developers/api-keys": {
    permission: "api_keys.read",
  },
  // ...
}
```

**Fonction helper** :
```typescript
import { getRoutePermissions } from "@/lib/route-permissions"

const perms = getRoutePermissions("/users/groups")
// => { permission: "groups.read" }
```

## 🎨 Badges de source de permissions

**Fichier** : `frontend/src/components/permission-source-badge.tsx`

Affiche la source d'une permission avec code couleur :

```typescript
<PermissionSourceBadge
  source="role"           // 'default' | 'role' | 'group' | 'personal'
  sourceName="Admin"      // Nom du rôle/groupe
  showIcon={true}         // Afficher l'icône
/>
```

**Codes couleur** :
- 🔒 **Système** (default) - Gris (Slate)
- 🛡️ **Rôle** (role) - Vert (Emerald)
- 👥 **Groupe** (group) - Bleu (Blue)
- 👤 **Personnel** (personal) - Orange (Amber)

## 📦 Pages déjà protégées

Les pages suivantes sont déjà protégées par `PermissionGuard` :

| Page | Route | Permission |
|------|-------|------------|
| **Utilisateurs** | `/users` | `users.read` |
| **Détail utilisateur** | `/users/[id]` | `users.read` |
| **Groupes** | `/users/groups` | `groups.read` |
| **Rôles & Permissions** | `/users/rbac` | `roles.read` |
| **Clés API** | `/developers/api-keys` | `api_keys.read` |

## 🚀 Comment protéger une nouvelle page

### Étape 1 : Définir la permission dans le menu

Éditez `frontend/src/components/layout/data/sidebar-data.tsx` :

```typescript
{
  title: "Ma Nouvelle Page",
  url: "/my-page",
  icon: IconStar,
  permission: "my_page.read"  // ← Ajouter ici
}
```

### Étape 2 : Enregistrer la permission dans la configuration

Éditez `frontend/src/lib/route-permissions.ts` :

```typescript
export const ROUTE_PERMISSIONS = {
  // ...
  "/my-page": {
    permission: "my_page.read",
  },
}
```

### Étape 3 : Ajouter le guard dans la page

Éditez votre page `frontend/src/app/(dashboard)/my-page/page.tsx` :

```typescript
import { PermissionGuard } from "@/components/permission-guard"

export default function MyPage() {
  return (
    <PermissionGuard permission="my_page.read">
      {/* Votre contenu de page */}
    </PermissionGuard>
  )
}
```

### Étape 4 : Créer la permission dans la base de données

Utilisez l'interface admin `/users/rbac` pour créer la permission :
- **Code** : `my_page.read`
- **Nom** : "Voir Ma Nouvelle Page"
- **Module** : "My Page"
- **Description** : "Permet de voir la nouvelle page"

### Étape 5 : Assigner la permission

Assignez la permission à un rôle ou groupe via l'interface :
1. Aller dans `/users/rbac` ou `/users/groups`
2. Sélectionner un rôle/groupe
3. Cliquer sur "Gérer les permissions"
4. Cocher la nouvelle permission
5. Sauvegarder

## 🔍 Comportement du système

### Menu de navigation
- Les items de menu sans les permissions requises sont **masqués automatiquement**
- Si un groupe de menu n'a aucun item visible, le groupe entier est masqué
- Les superusers (`is_superuser=true`) voient tous les items

### Accès aux pages
- Si un utilisateur tente d'accéder à une page sans permission → **Redirection vers `/403`**
- Si un utilisateur tape directement l'URL dans le navigateur → **Redirection vers `/403`**
- Un loader s'affiche pendant la vérification des permissions

### Superusers
Les utilisateurs avec `is_superuser=true` :
- ✅ Ont automatiquement **toutes les permissions**
- ✅ Voient **tous les items du menu**
- ✅ Accèdent à **toutes les pages**

## 🧪 Comment tester

### Test 1 : Vérifier le filtrage du menu

1. Se connecter avec un utilisateur **non-admin**
2. Vérifier que seuls les menus avec permissions appropriées sont visibles
3. Se connecter avec un **superuser**
4. Vérifier que tous les menus sont visibles

### Test 2 : Vérifier la protection des pages

1. Se connecter avec un utilisateur **sans** la permission `users.read`
2. Tenter d'accéder à `/users` directement via l'URL
3. **Résultat attendu** : Redirection vers `/403`

### Test 3 : Vérifier la page 403

1. Accéder à `/403`
2. **Résultat attendu** :
   - Page stylisée avec le shell dashboard
   - Message d'erreur explicatif
   - Boutons "Retour" et "Accueil" fonctionnels

## 📝 Codes de permissions recommandés

Convention de nommage : `<module>.<action>`

**Actions standards** :
- `read` - Lire/Voir
- `write` - Créer
- `update` - Modifier
- `delete` - Supprimer
- `manage` - Gestion complète

**Exemples** :
- `users.read` - Voir les utilisateurs
- `users.write` - Créer des utilisateurs
- `users.update` - Modifier des utilisateurs
- `users.delete` - Supprimer des utilisateurs
- `users.manage` - Gestion complète des utilisateurs

## 🔧 Dépannage

### Le menu ne se filtre pas
1. Vérifier que `permission` est défini dans `sidebar-data.tsx`
2. Vérifier que la permission existe dans la base de données
3. Vérifier que l'utilisateur a bien la permission assignée

### La page n'est pas protégée
1. Vérifier que `<PermissionGuard>` entoure bien le contenu
2. Vérifier que la permission correspond à celle du menu
3. Vérifier dans l'onglet Réseau (Network) que `/api/v1/user-permissions/me` retourne les bonnes permissions

### L'utilisateur voit tout
1. Vérifier si `is_superuser=true` → Comportement normal
2. Sinon, vérifier les permissions dans la base de données

## 📚 Ressources

- **Hook** : `frontend/src/hooks/use-permissions.ts`
- **Guard** : `frontend/src/components/permission-guard.tsx`
- **Config Menu** : `frontend/src/components/layout/data/sidebar-data.tsx`
- **Config Routes** : `frontend/src/lib/route-permissions.ts`
- **API Backend** : `backend/app/api/routes/user_permissions.py`
- **Page 403** : `frontend/src/app/(dashboard)/403/page.tsx`

---

✅ **Le système est maintenant complètement opérationnel !**
