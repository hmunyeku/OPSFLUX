# Architecture RBAC - OpsFlux

## Vue d'ensemble

Le système RBAC (Role-Based Access Control) d'OpsFlux suit une architecture hiérarchique où les permissions peuvent être assignées à trois niveaux :

1. **Permissions** → Unité atomique d'autorisation (ex: `users.read`, `items.create`)
2. **Rôles** → Collection de permissions (ex: `admin`, `manager`)
3. **Groupes** → Collection de permissions par département/équipe avec support hiérarchique

## Modèle de données

### 1. Permission
```typescript
interface Permission {
  id: string
  code: string              // Ex: "users.read", "items.create"
  name: string              // Ex: "Lire les utilisateurs"
  description?: string      // Description détaillée
  module: string            // Ex: "users", "items", "settings"
  is_default: boolean       // Permission automatique pour tous
  is_active: boolean        // Activation/désactivation
}
```

**Relations:**
- Peut appartenir à plusieurs Rôles (many-to-many)
- Peut appartenir à plusieurs Groupes (many-to-many)
- Peut être assignée directement à des Utilisateurs (many-to-many)

### 2. Role
```typescript
interface Role {
  id: string
  code: string              // Ex: "admin", "manager"
  name: string              // Ex: "Administrateur"
  description?: string
  priority: number          // Ordre de priorité (admin=100, user=10)
  is_system: boolean        // Rôle système non modifiable
  is_active: boolean
  permissions: Permission[] // Permissions assignées au rôle
}
```

**Relations:**
- Possède plusieurs Permissions (many-to-many)
- Peut être assigné à plusieurs Utilisateurs (many-to-many)

**Règles métier:**
- Les rôles système (`is_system=true`) ne peuvent pas être supprimés ou modifiés
- La priorité détermine la préséance en cas de conflit
- Un utilisateur peut avoir plusieurs rôles (cumul des permissions)

### 3. Group
```typescript
interface Group {
  id: string
  code: string              // Ex: "engineering", "sales"
  name: string              // Ex: "Équipe Ingénierie"
  description?: string
  parent_id?: string        // Support hiérarchique
  is_active: boolean
  permissions: Permission[] // Permissions du groupe
}
```

**Relations:**
- Possède plusieurs Permissions (many-to-many)
- Peut avoir un parent (self-referencing)
- Peut être assigné à plusieurs Utilisateurs (many-to-many)

**Règles métier:**
- Support de hiérarchie: un groupe peut hériter des permissions de son parent
- Utile pour la structure organisationnelle (département → équipe → sous-équipe)

### 4. User (extension RBAC)
```typescript
interface User {
  // ... champs existants
  roles: Role[]                    // Rôles assignés
  groups: Group[]                  // Groupes d'appartenance
  personal_permissions: Permission[] // Permissions directes
}
```

**Calcul des permissions effectives:**
```
Permissions de l'utilisateur =
  Permissions par défaut (is_default=true)
  + Permissions de tous ses rôles
  + Permissions de tous ses groupes (+ parents)
  + Permissions personnelles directes
```

## Architecture Frontend

### Structure des dossiers
```
src/app/(dashboard)/users/
├── page.tsx                          # Liste des utilisateurs
├── [id]/
│   ├── page.tsx                      # Détail utilisateur
│   └── components/
│       ├── user-detail-form.tsx      # Formulaire de base
│       ├── user-roles-section.tsx    # Gestion des rôles
│       ├── user-groups-section.tsx   # Gestion des groupes
│       └── user-permissions-section.tsx # Permissions personnelles
├── roles/
│   ├── page.tsx                      # Liste des rôles
│   ├── [id]/
│   │   └── page.tsx                  # Détail d'un rôle
│   ├── data/
│   │   ├── schema.ts                 # Types TypeScript
│   │   └── roles-api.ts              # API client
│   └── components/
│       ├── roles-table.tsx           # DataTable principal
│       ├── roles-columns.tsx         # Définition des colonnes
│       ├── create-role-dialog.tsx    # Dialog création
│       ├── edit-role-dialog.tsx      # Dialog édition
│       └── manage-permissions-dialog.tsx # Assigner permissions
├── permissions/
│   ├── page.tsx                      # Liste des permissions
│   ├── data/
│   │   ├── schema.ts
│   │   └── permissions-api.ts
│   └── components/
│       ├── permissions-table.tsx
│       ├── permissions-columns.tsx
│       ├── create-permission-dialog.tsx
│       └── edit-permission-dialog.tsx
└── groups/
    ├── page.tsx                      # Liste des groupes
    ├── [id]/
    │   └── page.tsx                  # Détail d'un groupe
    ├── data/
    │   ├── schema.ts
    │   └── groups-api.ts
    └── components/
        ├── groups-table.tsx
        ├── groups-columns.tsx
        ├── create-group-dialog.tsx
        ├── edit-group-dialog.tsx
        ├── manage-permissions-dialog.tsx
        └── group-hierarchy-tree.tsx  # Affichage hiérarchique
```

## Composants clés à implémenter

### 1. DataTable avec fonctionnalités avancées

Chaque page (Roles, Permissions, Groups) doit avoir:

```typescript
// Exemple: roles-table.tsx
export function RolesTable({ columns, data }: Props) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    // ... configuration complète
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <Table>...</Table>
      <DataTablePagination table={table} />
    </div>
  )
}
```

**Fonctionnalités:**
- ✅ Tri sur colonnes
- ✅ Filtres multiples
- ✅ Recherche globale
- ✅ Sélection de lignes
- ✅ Affichage/masquage colonnes
- ✅ Pagination
- ⏳ Actions en masse
- ⏳ Export CSV

### 2. Colonnes avec actions contextuelles

```typescript
// roles-columns.tsx
export const columns: ColumnDef<Role>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Code" />
    ),
    cell: ({ row }) => (
      <span className="font-mono">{row.getValue("code")}</span>
    ),
    enableSorting: true,
  },
  // ... autres colonnes
  {
    id: "actions",
    cell: ({ row }) => {
      const role = row.original
      return (
        <DropdownMenu>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleEdit(role)}>
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleManagePermissions(role)}>
              Gérer les permissions
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleViewUsers(role)}>
              Voir les utilisateurs
            </DropdownMenuItem>
            {!role.is_system && (
              <DropdownMenuItem onClick={() => handleDelete(role)}>
                Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
```

### 3. Dialog de gestion des permissions

Composant réutilisable pour assigner des permissions à un Rôle ou Groupe:

```typescript
// manage-permissions-dialog.tsx
interface ManagePermissionsDialogProps {
  entityType: 'role' | 'group'
  entityId: string
  entityName: string
  currentPermissions: Permission[]
  onSave: (permissionIds: string[]) => Promise<void>
}

export function ManagePermissionsDialog({
  entityType,
  entityId,
  currentPermissions,
  onSave,
}: ManagePermissionsDialogProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentPermissions.map(p => p.id))
  )

  // Grouper par module pour meilleure UX
  const groupedPermissions = groupBy(allPermissions, 'module')

  return (
    <Dialog>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Gérer les permissions - {entityName}
          </DialogTitle>
        </DialogHeader>

        {/* Recherche */}
        <Input
          placeholder="Rechercher une permission..."
          onChange={handleSearch}
        />

        {/* Liste par module avec checkboxes */}
        <ScrollArea className="h-[400px]">
          {Object.entries(groupedPermissions).map(([module, perms]) => (
            <div key={module} className="mb-4">
              <h3 className="font-semibold capitalize mb-2">{module}</h3>
              <div className="space-y-2">
                {perms.map(permission => (
                  <div key={permission.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(permission.id)}
                      onCheckedChange={() => togglePermission(permission.id)}
                    />
                    <div>
                      <p className="font-medium">{permission.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {permission.code}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => onSave(Array.from(selectedIds))}>
            Enregistrer ({selectedIds.size} permissions)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 4. Section RBAC dans User Detail

```typescript
// user-roles-section.tsx
export function UserRolesSection({ user }: { user: User }) {
  const [roles, setRoles] = useState(user.roles || [])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Rôles assignés</CardTitle>
            <CardDescription>
              Les rôles déterminent les permissions de l'utilisateur
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <IconPlus className="h-4 w-4 mr-2" />
            Assigner un rôle
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun rôle assigné
          </p>
        ) : (
          <div className="space-y-2">
            {roles.map(role => (
              <div
                key={role.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{role.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {role.permissions?.length || 0} permissions
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRole(role.id)}
                >
                  Retirer
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AssignRoleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        userId={user.id}
        currentRoles={roles}
        onSuccess={handleRoleAdded}
      />
    </Card>
  )
}
```

## API Routes Backend (existantes)

### Roles
- `GET /api/v1/roles/` - Liste des rôles
- `GET /api/v1/roles/{id}` - Détail d'un rôle
- `POST /api/v1/roles/` - Créer un rôle
- `PATCH /api/v1/roles/{id}` - Modifier un rôle
- `DELETE /api/v1/roles/{id}` - Supprimer un rôle

### Permissions
- `GET /api/v1/permissions/` - Liste des permissions
- `GET /api/v1/permissions/{id}` - Détail d'une permission
- `POST /api/v1/permissions/` - Créer une permission
- `PATCH /api/v1/permissions/{id}` - Modifier une permission
- `DELETE /api/v1/permissions/{id}` - Supprimer une permission

### Groups
- `GET /api/v1/groups/` - Liste des groupes
- `GET /api/v1/groups/{id}` - Détail d'un groupe
- `POST /api/v1/groups/` - Créer un groupe
- `PATCH /api/v1/groups/{id}` - Modifier un groupe
- `DELETE /api/v1/groups/{id}` - Supprimer un groupe

### User Permissions
- `GET /api/v1/user-permissions/me` - Permissions de l'utilisateur courant
- `GET /api/v1/user-permissions/{user_id}` - Permissions d'un utilisateur

**Note:** Les routes pour assigner rôles/groupes/permissions aux utilisateurs doivent être ajoutées dans `users.py`

## Routes à ajouter au backend

```python
# Dans backend/app/api/routes/users.py

@router.post("/{user_id}/roles/{role_id}")
def assign_role_to_user(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Assigner un rôle à un utilisateur"""
    pass

@router.delete("/{user_id}/roles/{role_id}")
def remove_role_from_user(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """Retirer un rôle d'un utilisateur"""
    pass

@router.post("/{user_id}/groups/{group_id}")
def assign_group_to_user(...):
    """Assigner un groupe à un utilisateur"""
    pass

@router.delete("/{user_id}/groups/{group_id}")
def remove_group_from_user(...):
    """Retirer un groupe d'un utilisateur"""
    pass

@router.post("/{user_id}/permissions/{permission_id}")
def assign_permission_to_user(...):
    """Assigner une permission directe à un utilisateur"""
    pass

@router.delete("/{user_id}/permissions/{permission_id}")
def remove_permission_from_user(...):
    """Retirer une permission directe d'un utilisateur"""
    pass

@router.get("/{user_id}/effective-permissions")
def get_user_effective_permissions(...):
    """Obtenir toutes les permissions effectives d'un utilisateur
    (par défaut + rôles + groupes + personnelles)"""
    pass
```

## Plan d'implémentation par phases

### Phase 1: Foundation (FAIT ✅)
- [x] Structure des dossiers
- [x] Pages de base avec breadcrumbs
- [x] Schemas TypeScript
- [x] API clients de base
- [x] Menu navigation

### Phase 2: DataTables avancées (EN COURS)
- [ ] Composant RolesTable avec tri/filtres/pagination
- [ ] Composant PermissionsTable avec tri/filtres/pagination
- [ ] Composant GroupsTable avec tri/filtres/pagination
- [ ] Colonnes avec actions contextuelles
- [ ] Toolbar de recherche et filtres

### Phase 3: CRUD Dialogs
- [ ] CreateRoleDialog
- [ ] EditRoleDialog
- [ ] CreatePermissionDialog
- [ ] EditPermissionDialog
- [ ] CreateGroupDialog
- [ ] EditGroupDialog

### Phase 4: Gestion des permissions
- [ ] ManagePermissionsDialog (réutilisable)
- [ ] Assigner permissions à un rôle
- [ ] Assigner permissions à un groupe
- [ ] Vue détail rôle avec liste permissions
- [ ] Vue détail groupe avec liste permissions

### Phase 5: Intégration User
- [ ] Routes backend pour assigner rôles/groupes à users
- [ ] UserRolesSection dans user detail
- [ ] UserGroupsSection dans user detail
- [ ] UserPermissionsSection dans user detail
- [ ] AssignRoleDialog
- [ ] AssignGroupDialog
- [ ] Affichage permissions effectives

### Phase 6: Fonctionnalités avancées
- [ ] Hiérarchie de groupes avec Tree view
- [ ] Héritage de permissions dans groupes
- [ ] Comparaison de rôles
- [ ] Audit trail des changements RBAC
- [ ] Export/Import de configurations
- [ ] Templates de rôles prédéfinis

### Phase 7: UX & Performance
- [ ] Loading states optimisés
- [ ] Optimistic updates
- [ ] Error boundaries
- [ ] Toast notifications
- [ ] Confirmation dialogs
- [ ] Keyboard shortcuts
- [ ] Responsive design mobile

## Bonnes pratiques

### 1. Nommage des permissions
```
Format: <module>.<action>
Exemples:
  - users.read
  - users.create
  - users.update
  - users.delete
  - items.manage
  - settings.admin
```

### 2. Granularité
- Permissions atomiques et spécifiques
- Éviter les permissions trop larges (ex: `admin.all`)
- Préférer la composition (plusieurs permissions) à l'héritage

### 3. Sécurité
- Toujours vérifier les permissions côté backend
- Ne jamais faire confiance au frontend
- Logger les changements de permissions
- Implémenter le principe du moindre privilège

### 4. Performance
- Mettre en cache les permissions utilisateur
- Lazy load les listes de permissions
- Utiliser la pagination sur toutes les tables
- Optimiser les requêtes avec includes

### 5. UX
- Feedback visuel immédiat
- Messages d'erreur explicites
- Confirmation avant suppression
- Undo pour actions critiques
- Afficher le nombre de permissions/utilisateurs affectés

## Tests à implémenter

### Tests unitaires
- Calcul des permissions effectives
- Validation des codes de permission
- Hiérarchie de groupes
- Logique de priorité des rôles

### Tests d'intégration
- Assignment de rôles/groupes/permissions
- Cascade de suppressions
- Héritage de permissions
- API endpoints

### Tests E2E
- Création d'un rôle avec permissions
- Assignment à un utilisateur
- Vérification des droits d'accès
- Modification en masse

## Références

- [RBAC Wikipedia](https://en.wikipedia.org/wiki/Role-based_access_control)
- [NIST RBAC Model](https://csrc.nist.gov/projects/role-based-access-control)
- [shadcn/ui DataTable](https://ui.shadcn.com/docs/components/data-table)
- [TanStack Table v8](https://tanstack.com/table/v8/docs/guide/introduction)

---

**Dernière mise à jour:** 2025-10-15
**Version:** 1.0
**Auteur:** Claude Code
