/**
 * Composant pour conditionner l'affichage selon les permissions
 */

import { usePermissions } from '@/hooks/use-permissions'

interface PermissionGateProps {
  children: React.ReactNode
  /** Code de permission requis */
  permission?: string
  /** Requiert TOUTES ces permissions */
  requireAllPermissions?: string[]
  /** Requiert AU MOINS UNE de ces permissions */
  requireAnyPermission?: string[]
  /** Contenu à afficher si la permission n'est pas accordée */
  fallback?: React.ReactNode
}

/**
 * Composant pour afficher conditionnellement du contenu selon les permissions
 *
 * @example
 * ```tsx
 * <PermissionGate permission="users.write">
 *   <Button>Créer un utilisateur</Button>
 * </PermissionGate>
 * ```
 *
 * @example
 * ```tsx
 * <PermissionGate requireAnyPermission={["users.read", "users.write"]}>
 *   <UsersTable />
 * </PermissionGate>
 * ```
 *
 * @example
 * ```tsx
 * <PermissionGate
 *   permission="admin.access"
 *   fallback={<div>Accès non autorisé</div>}
 * >
 *   <AdminPanel />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  children,
  permission,
  requireAllPermissions,
  requireAnyPermission,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()

  // Pendant le chargement, ne rien afficher (ou afficher fallback)
  if (isLoading) {
    return <>{fallback}</>
  }

  // Vérifier les permissions
  let hasAccess = true

  if (permission && !hasPermission(permission)) {
    hasAccess = false
  }

  if (requireAllPermissions && !hasAllPermissions(requireAllPermissions)) {
    hasAccess = false
  }

  if (requireAnyPermission && !hasAnyPermission(requireAnyPermission)) {
    hasAccess = false
  }

  // Si aucune permission n'est spécifiée, autoriser l'accès
  if (!permission && !requireAllPermissions && !requireAnyPermission) {
    hasAccess = true
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>
}
