"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PermissionGuard, PermissionGuardAny, PermissionGuardAll } from "@/components/permission-guard"
import { usePermissions } from "@/lib/permissions-context"
import { Plus, Edit, Trash2, Eye } from "lucide-react"

/**
 * Example component demonstrating how to use the permissions system
 *
 * This component showcases:
 * 1. PermissionGuard - Single permission check
 * 2. PermissionGuardAny - OR logic (any permission)
 * 3. PermissionGuardAll - AND logic (all permissions)
 * 4. usePermissions hook - Programmatic permission checks
 * 5. Permission-based UI states (disabled buttons, hidden sections)
 */
export function PermissionsExample() {
  const { hasPermission, permissions, permissionsWithSource } = usePermissions()

  return (
    <div className="flex flex-col gap-3 p-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Permissions System Examples</CardTitle>
          <CardDescription className="text-xs">
            Demonstrating different ways to use the permissions system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Example 1: Basic PermissionGuard */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">1. Basic Permission Guard</h3>
            <div className="flex gap-2">
              <PermissionGuard
                resource="users"
                action="create"
                fallback={
                  <Button size="sm" variant="outline" disabled className="h-8 text-xs">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create User (No Permission)
                  </Button>
                }
              >
                <Button size="sm" className="h-8 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create User
                </Button>
              </PermissionGuard>

              <PermissionGuard resource="users" action="delete">
                <Button size="sm" variant="destructive" className="h-8 text-xs">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete User
                </Button>
              </PermissionGuard>
            </div>
          </div>

          {/* Example 2: PermissionGuardAny (OR logic) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">2. Permission Guard ANY (OR logic)</h3>
            <PermissionGuardAny
              permissions={[
                { resource: "users", action: "read" },
                { resource: "users", action: "create" },
                { resource: "users", action: "update" },
              ]}
              fallback={<p className="text-xs text-muted-foreground">You need at least one user permission to see this section.</p>}
            >
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <p className="text-xs">
                    This section is visible because you have at least one of: users:read, users:create, or users:update
                  </p>
                </CardContent>
              </Card>
            </PermissionGuardAny>
          </div>

          {/* Example 3: PermissionGuardAll (AND logic) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">3. Permission Guard ALL (AND logic)</h3>
            <PermissionGuardAll
              permissions={[
                { resource: "users", action: "read" },
                { resource: "users", action: "update" },
              ]}
              fallback={<p className="text-xs text-muted-foreground">You need BOTH users:read AND users:update to see this section.</p>}
            >
              <Card className="bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="p-3">
                  <p className="text-xs">
                    This section is visible because you have BOTH users:read AND users:update permissions
                  </p>
                </CardContent>
              </Card>
            </PermissionGuardAll>
          </div>

          {/* Example 4: Programmatic permission checks */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">4. Programmatic Permission Checks</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!hasPermission("users", "update")}
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" />
                Edit (Disabled if no permission)
              </Button>

              {hasPermission("users", "read") && (
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  View (Hidden if no permission)
                </Button>
              )}
            </div>
          </div>

          {/* Example 5: Your current permissions */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">5. Your Current Permissions</h3>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {permissionsWithSource.length === 0 ? (
                <p className="text-xs text-muted-foreground">No permissions loaded</p>
              ) : (
                permissionsWithSource.map((perm) => (
                  <div
                    key={perm.permission.id}
                    className="flex items-center justify-between p-2 rounded-md border bg-card text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{perm.permission.resource}:{perm.permission.action}</span>
                      {perm.permission.description && (
                        <span className="text-muted-foreground">- {perm.permission.description}</span>
                      )}
                    </div>
                    <Badge
                      variant={
                        perm.source === "DEFAULT"
                          ? "outline"
                          : perm.source === "ROLE"
                          ? "default"
                          : perm.source === "GROUP"
                          ? "secondary"
                          : "destructive"
                      }
                      className="text-[9px] h-5"
                    >
                      {perm.source_name}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
