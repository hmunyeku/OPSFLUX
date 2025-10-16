"use client"

import { useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { usePermissions } from "@/hooks/use-permissions"
import { Skeleton } from "@/components/ui/skeleton"

interface PermissionGuardProps {
  children: ReactNode
  /** Code de permission simple requis */
  permission?: string
  /** Requiert TOUTES ces permissions (ET logique) */
  requireAllPermissions?: string[]
  /** Requiert AU MOINS UNE de ces permissions (OU logique) */
  requireAnyPermission?: string[]
  /** Page vers laquelle rediriger si accès refusé (défaut: /403) */
  fallbackUrl?: string
  /** Afficher un loader pendant la vérification (défaut: true) */
  showLoader?: boolean
}

/**
 * Composant guard pour protéger les pages selon les permissions
 *
 * @example
 * ```tsx
 * <PermissionGuard permission="users.read">
 *   <UsersPage />
 * </PermissionGuard>
 * ```
 *
 * @example
 * ```tsx
 * <PermissionGuard requireAllPermissions={["users.read", "users.write"]}>
 *   <UsersEditPage />
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
  children,
  permission,
  requireAllPermissions,
  requireAnyPermission,
  fallbackUrl = "/403",
  showLoader = true,
}: PermissionGuardProps) {
  const router = useRouter()
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions()

  useEffect(() => {
    // Attendre que le chargement soit terminé
    if (isLoading) return

    let hasAccess = true

    // Vérifier permission simple
    if (permission && !hasPermission(permission)) {
      hasAccess = false
    }

    // Vérifier requireAllPermissions (ET logique)
    if (requireAllPermissions && !hasAllPermissions(requireAllPermissions)) {
      hasAccess = false
    }

    // Vérifier requireAnyPermission (OU logique)
    if (requireAnyPermission && !hasAnyPermission(requireAnyPermission)) {
      hasAccess = false
    }

    // Rediriger si pas d'accès
    if (!hasAccess) {
      router.push(fallbackUrl)
    }
  }, [
    isLoading,
    permission,
    requireAllPermissions,
    requireAnyPermission,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    router,
    fallbackUrl,
  ])

  // Afficher un loader pendant la vérification
  if (isLoading && showLoader) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-[300px]" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
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

  // Ne rien afficher si pas d'accès (la redirection est en cours)
  if (!hasAccess) {
    return null
  }

  // Afficher le contenu si accès autorisé
  return <>{children}</>
}
