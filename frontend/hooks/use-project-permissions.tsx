"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  type ProjectPermission,
  type ProjectUserContext,
  type ProjectRole,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  createProjectUserContext,
  getMockUserProjectContext,
} from "@/lib/project-permissions"

interface UseProjectPermissionsOptions {
  projectId?: string
  useMockData?: boolean
}

interface UseProjectPermissionsReturn {
  // Context
  context: ProjectUserContext | null
  isLoading: boolean
  error: string | null

  // Permission checks
  can: (permission: ProjectPermission) => boolean
  canAny: (permissions: ProjectPermission[]) => boolean
  canAll: (permissions: ProjectPermission[]) => boolean

  // Role checks
  isOwner: boolean
  isManager: boolean
  isAdmin: boolean
  role: ProjectRole | null

  // Common permission checks
  canEdit: boolean
  canDelete: boolean
  canArchive: boolean
  canExport: boolean
  canManageTeam: boolean
  canEditBudget: boolean
  canCreateTasks: boolean
  canDeleteTasks: boolean
  canUploadDocuments: boolean
  canDeleteDocuments: boolean
  canEditSettings: boolean
}

export function useProjectPermissions(
  options: UseProjectPermissionsOptions = {}
): UseProjectPermissionsReturn {
  const { projectId, useMockData = true } = options

  const [context, setContext] = useState<ProjectUserContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load user permissions for this project
  useEffect(() => {
    const loadPermissions = async () => {
      setIsLoading(true)
      setError(null)

      try {
        if (useMockData) {
          // Use mock data
          const mockContext = getMockUserProjectContext(projectId || "")
          setContext(mockContext)
        } else {
          // In production, fetch from API
          // const response = await fetch(`/api/projects/${projectId}/permissions`)
          // const data = await response.json()
          // setContext(createProjectUserContext(data.userId, data.role, data.options))

          // For now, use mock
          const mockContext = getMockUserProjectContext(projectId || "")
          setContext(mockContext)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load permissions")
      } finally {
        setIsLoading(false)
      }
    }

    loadPermissions()
  }, [projectId, useMockData])

  // Permission check functions
  const can = useCallback(
    (permission: ProjectPermission): boolean => {
      if (!context) return false
      return hasPermission(context, permission)
    },
    [context]
  )

  const canAny = useCallback(
    (permissions: ProjectPermission[]): boolean => {
      if (!context) return false
      return hasAnyPermission(context, permissions)
    },
    [context]
  )

  const canAll = useCallback(
    (permissions: ProjectPermission[]): boolean => {
      if (!context) return false
      return hasAllPermissions(context, permissions)
    },
    [context]
  )

  // Computed permission values
  const computed = useMemo(() => {
    if (!context) {
      return {
        isOwner: false,
        isManager: false,
        isAdmin: false,
        role: null as ProjectRole | null,
        canEdit: false,
        canDelete: false,
        canArchive: false,
        canExport: false,
        canManageTeam: false,
        canEditBudget: false,
        canCreateTasks: false,
        canDeleteTasks: false,
        canUploadDocuments: false,
        canDeleteDocuments: false,
        canEditSettings: false,
      }
    }

    return {
      isOwner: context.isProjectOwner || context.role === "owner",
      isManager: context.role === "manager" || context.role === "owner",
      isAdmin: context.isCompanyAdmin || false,
      role: context.role,
      canEdit: hasPermission(context, "project:edit"),
      canDelete: hasPermission(context, "project:delete"),
      canArchive: hasPermission(context, "project:archive"),
      canExport: hasPermission(context, "project:export"),
      canManageTeam: hasPermission(context, "project:manage_team"),
      canEditBudget: hasPermission(context, "budget:edit"),
      canCreateTasks: hasPermission(context, "task:create"),
      canDeleteTasks: hasPermission(context, "task:delete"),
      canUploadDocuments: hasPermission(context, "document:upload"),
      canDeleteDocuments: hasPermission(context, "document:delete"),
      canEditSettings: hasPermission(context, "settings:edit"),
    }
  }, [context])

  return {
    context,
    isLoading,
    error,
    can,
    canAny,
    canAll,
    ...computed,
  }
}

// Higher-order component for permission gating
export function withProjectPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  permission: ProjectPermission,
  FallbackComponent?: React.ComponentType
) {
  return function PermissionGatedComponent(props: P & { projectId?: string }) {
    const { can, isLoading } = useProjectPermissions({ projectId: props.projectId })

    if (isLoading) {
      return null // Or loading spinner
    }

    if (!can(permission)) {
      if (FallbackComponent) {
        return <FallbackComponent />
      }
      return null
    }

    return <WrappedComponent {...props} />
  }
}

// Component for conditional rendering based on permission
interface CanProps {
  permission: ProjectPermission | ProjectPermission[]
  projectId?: string
  mode?: "any" | "all"
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function Can({ permission, projectId, mode = "any", fallback, children }: CanProps) {
  const { can, canAny, canAll, isLoading } = useProjectPermissions({ projectId })

  if (isLoading) {
    return null
  }

  const permissions = Array.isArray(permission) ? permission : [permission]

  const hasAccess = mode === "all"
    ? canAll(permissions)
    : permissions.length === 1
      ? can(permissions[0])
      : canAny(permissions)

  if (!hasAccess) {
    return fallback ? <>{fallback}</> : null
  }

  return <>{children}</>
}

// Hook to check multiple permissions at once
export function useMultiplePermissions(
  permissions: ProjectPermission[],
  projectId?: string
): Record<ProjectPermission, boolean> {
  const { can, isLoading } = useProjectPermissions({ projectId })

  return useMemo(() => {
    if (isLoading) {
      return permissions.reduce((acc, p) => ({ ...acc, [p]: false }), {} as Record<ProjectPermission, boolean>)
    }

    return permissions.reduce((acc, p) => ({ ...acc, [p]: can(p) }), {} as Record<ProjectPermission, boolean>)
  }, [permissions, can, isLoading])
}
