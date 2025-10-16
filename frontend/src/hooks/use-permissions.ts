/**
 * Hook pour gérer les permissions utilisateur
 */

import { useMemo } from 'react'
import { useAuth } from './use-auth'
import { Permission } from '@/lib/api'

interface UsePermissionsReturn {
  permissions: Permission[]
  hasPermission: (permissionCode: string) => boolean
  hasAnyPermission: (permissionCodes: string[]) => boolean
  hasAllPermissions: (permissionCodes: string[]) => boolean
  isLoading: boolean
}

/**
 * Hook pour vérifier les permissions de l'utilisateur
 *
 * @returns {UsePermissionsReturn} Objet contenant les permissions et méthodes de vérification
 *
 * @example
 * ```tsx
 * const { hasPermission } = usePermissions()
 *
 * if (hasPermission('users.read')) {
 *   // Afficher le menu utilisateurs
 * }
 * ```
 */
export function usePermissions(): UsePermissionsReturn {
  const { user, isLoading } = useAuth()

  // Extraire toutes les permissions de l'utilisateur
  const permissions = useMemo(() => {
    if (!user) return []

    const perms: Permission[] = []
    const seenCodes = new Set<string>()

    // Permissions directes de l'utilisateur
    if (user.permissions) {
      user.permissions.forEach((perm) => {
        if (!seenCodes.has(perm.code) && perm.is_active) {
          perms.push(perm)
          seenCodes.add(perm.code)
        }
      })
    }

    // Permissions des rôles
    if (user.roles) {
      user.roles.forEach((role) => {
        if (role.permissions) {
          role.permissions.forEach((perm) => {
            if (!seenCodes.has(perm.code) && perm.is_active) {
              perms.push(perm)
              seenCodes.add(perm.code)
            }
          })
        }
      })
    }

    // Permissions des groupes
    if (user.groups) {
      user.groups.forEach((group) => {
        if (group.permissions) {
          group.permissions.forEach((perm) => {
            if (!seenCodes.has(perm.code) && perm.is_active) {
              perms.push(perm)
              seenCodes.add(perm.code)
            }
          })
        }
      })
    }

    return perms
  }, [user])

  // Créer un Set pour une recherche rapide
  const permissionCodes = useMemo(() => {
    return new Set(permissions.map((p) => p.code))
  }, [permissions])

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * Les superusers ont toutes les permissions
   */
  const hasPermission = (permissionCode: string): boolean => {
    // Superuser a toutes les permissions
    if (user?.is_superuser) return true

    return permissionCodes.has(permissionCode)
  }

  /**
   * Vérifie si l'utilisateur a au moins une des permissions spécifiées
   * Les superusers ont toutes les permissions
   */
  const hasAnyPermission = (permissionCodes: string[]): boolean => {
    // Superuser a toutes les permissions
    if (user?.is_superuser) return true

    return permissionCodes.some((code) => hasPermission(code))
  }

  /**
   * Vérifie si l'utilisateur a toutes les permissions spécifiées
   * Les superusers ont toutes les permissions
   */
  const hasAllPermissions = (permissionCodes: string[]): boolean => {
    // Superuser a toutes les permissions
    if (user?.is_superuser) return true

    return permissionCodes.every((code) => hasPermission(code))
  }

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
  }
}
