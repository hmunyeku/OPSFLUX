/**
 * PermissionGate — conditionally renders children based on user permissions.
 *
 * Usage:
 *   <PermissionGate permission="core.rbac.manage">
 *     <AdminPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate any={['paxlog.ads.write', 'paxlog.ads.approve']} fallback={<NoAccess />}>
 *     <AdsEditor />
 *   </PermissionGate>
 */
import { usePermission } from '@/hooks/usePermission'

interface PermissionGateProps {
  /** Single permission required */
  permission?: string
  /** Any of these permissions is sufficient */
  any?: string[]
  /** All of these permissions are required */
  all?: string[]
  /** Content to render when permission check fails */
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function PermissionGate({
  permission,
  any,
  all,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { hasPermission, hasAny, hasAll, loading } = usePermission()

  if (loading) return null

  let allowed = false

  if (permission) {
    allowed = hasPermission(permission)
  } else if (any) {
    allowed = hasAny(any)
  } else if (all) {
    allowed = hasAll(all)
  } else {
    // No restriction specified — allow
    allowed = true
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}
