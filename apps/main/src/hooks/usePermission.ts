/**
 * Permission hook — fetches current user's permissions and provides check helpers.
 *
 * Usage:
 *   const { hasPermission, hasAny, loading } = usePermission()
 *   if (hasPermission('paxlog.ads.write')) { ... }
 *   if (hasAny(['paxlog.ads.write', 'paxlog.ads.approve'])) { ... }
 */
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { rbacService } from '@/services/rbacService'
import { useAuthStore } from '@/stores/authStore'

export function usePermission() {
  const { isAuthenticated, actingContext, currentEntityId } = useAuthStore()

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['rbac', 'my-permissions', currentEntityId, actingContext],
    queryFn: () => rbacService.getMyPermissions(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 min — matches backend Redis TTL
    gcTime: 10 * 60 * 1000,
  })

  const permissionSet = useMemo(() => new Set(permissions), [permissions])

  const hasPermission = useCallback(
    (code: string): boolean => {
      if (permissionSet.has('*')) return true
      return permissionSet.has(code)
    },
    [permissionSet],
  )

  const hasAny = useCallback(
    (codes: string[]): boolean => {
      if (permissionSet.has('*')) return true
      return codes.some((c) => permissionSet.has(c))
    },
    [permissionSet],
  )

  const hasAll = useCallback(
    (codes: string[]): boolean => {
      if (permissionSet.has('*')) return true
      return codes.every((c) => permissionSet.has(c))
    },
    [permissionSet],
  )

  return {
    permissions,
    permissionSet,
    hasPermission,
    hasAny,
    hasAll,
    loading: isLoading,
  }
}
