"use client"

import { type ReactNode } from "react"
import { usePermissions } from "@/lib/permissions-context"
import { Loader2 } from "lucide-react"

interface PermissionGuardProps {
  /**
   * Children to render if permission check passes
   */
  children: ReactNode
  /**
   * Resource to check (e.g., "users", "tasks", "projects")
   */
  resource: string
  /**
   * Action to check (e.g., "read", "create", "update", "delete")
   */
  action: string
  /**
   * Fallback to render if permission check fails
   */
  fallback?: ReactNode
  /**
   * Show loading state while checking permissions
   */
  showLoading?: boolean
}

/**
 * PermissionGuard component - conditionally renders children based on user permissions
 *
 * @example
 * ```tsx
 * <PermissionGuard resource="users" action="create">
 *   <Button>Create User</Button>
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
  children,
  resource,
  action,
  fallback = null,
  showLoading = false,
}: PermissionGuardProps) {
  const { hasPermission, isLoading } = usePermissions()

  if (isLoading && showLoading) {
    return (
      <div className="flex items-center justify-center p-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasPermission(resource, action)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

interface PermissionGuardAnyProps {
  /**
   * Children to render if any permission check passes
   */
  children: ReactNode
  /**
   * Array of permissions to check (OR logic - at least one must pass)
   */
  permissions: Array<{ resource: string; action: string }>
  /**
   * Fallback to render if all permission checks fail
   */
  fallback?: ReactNode
  /**
   * Show loading state while checking permissions
   */
  showLoading?: boolean
}

/**
 * PermissionGuardAny component - renders children if user has ANY of the specified permissions
 *
 * @example
 * ```tsx
 * <PermissionGuardAny permissions={[
 *   { resource: "users", action: "read" },
 *   { resource: "users", action: "create" }
 * ]}>
 *   <UsersPanel />
 * </PermissionGuardAny>
 * ```
 */
export function PermissionGuardAny({
  children,
  permissions,
  fallback = null,
  showLoading = false,
}: PermissionGuardAnyProps) {
  const { hasAnyPermission, isLoading } = usePermissions()

  if (isLoading && showLoading) {
    return (
      <div className="flex items-center justify-center p-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasAnyPermission(permissions)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

interface PermissionGuardAllProps {
  /**
   * Children to render if all permission checks pass
   */
  children: ReactNode
  /**
   * Array of permissions to check (AND logic - all must pass)
   */
  permissions: Array<{ resource: string; action: string }>
  /**
   * Fallback to render if any permission check fails
   */
  fallback?: ReactNode
  /**
   * Show loading state while checking permissions
   */
  showLoading?: boolean
}

/**
 * PermissionGuardAll component - renders children if user has ALL of the specified permissions
 *
 * @example
 * ```tsx
 * <PermissionGuardAll permissions={[
 *   { resource: "users", action: "read" },
 *   { resource: "users", action: "update" }
 * ]}>
 *   <EditUserForm />
 * </PermissionGuardAll>
 * ```
 */
export function PermissionGuardAll({
  children,
  permissions,
  fallback = null,
  showLoading = false,
}: PermissionGuardAllProps) {
  const { hasAllPermissions, isLoading } = usePermissions()

  if (isLoading && showLoading) {
    return (
      <div className="flex items-center justify-center p-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasAllPermissions(permissions)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
