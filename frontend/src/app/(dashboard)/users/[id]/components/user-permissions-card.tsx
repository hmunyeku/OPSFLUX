"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Key } from "lucide-react"
import { getUserPermissions, UserPermissionsWithSources } from "../../data/user-permissions-api"
import { PermissionSourceBadge } from "@/components/permission-source-badge"

interface UserPermissionsCardProps {
  userId: string
}

export function UserPermissionsCard({ userId }: UserPermissionsCardProps) {
  const [permissions, setPermissions] = useState<UserPermissionsWithSources | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getUserPermissions(userId)
        setPermissions(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load permissions')
      } finally {
        setIsLoading(false)
      }
    }

    loadPermissions()
  }, [userId])

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    if (!permissions?.data) return {}

    return permissions.data.reduce((acc, item) => {
      const moduleName = item.permission.module || 'Autre'
      if (!acc[moduleName]) {
        acc[moduleName] = []
      }
      acc[moduleName].push(item)
      return acc
    }, {} as Record<string, typeof permissions.data>)
  }, [permissions])

  // Count permissions by source
  const sourceStats = useMemo(() => {
    if (!permissions?.data) return { default: 0, role: 0, group: 0, personal: 0 }

    return permissions.data.reduce((acc, item) => {
      acc[item.source] = (acc[item.source] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [permissions])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permissions de l&apos;utilisateur</CardTitle>
          <CardDescription className="text-destructive">
            {error}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Permissions de l&apos;utilisateur
            </CardTitle>
            <CardDescription>
              {permissions?.count || 0} permission(s) totale(s)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {sourceStats.default || 0} système
            </Badge>
            <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
              {sourceStats.role || 0} rôles
            </Badge>
            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
              {sourceStats.group || 0} groupes
            </Badge>
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">
              {sourceStats.personal || 0} personnelles
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!permissions || permissions.count === 0 ? (
          <div className="rounded-lg border p-8 text-center">
            <Key className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune permission assignée à cet utilisateur
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <Accordion type="multiple" className="space-y-2">
              {Object.entries(permissionsByModule).map(([module, perms]) => (
                <AccordionItem
                  key={module}
                  value={module}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-3 flex-1">
                      <h3 className="font-semibold capitalize text-sm">
                        {module}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {perms.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pb-3">
                    <div className="space-y-2 pl-6 pt-2">
                      {perms.map((item) => (
                        <div
                          key={item.permission.id}
                          className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                        >
                          <Key className="h-4 w-4 mt-0.5 text-muted-foreground" />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">
                                {item.permission.name}
                              </p>
                              <PermissionSourceBadge 
                                source={item.source} 
                                sourceName={item.source_name}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.permission.code}
                            </p>
                            {item.permission.description && (
                              <p className="text-xs text-muted-foreground">
                                {item.permission.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
