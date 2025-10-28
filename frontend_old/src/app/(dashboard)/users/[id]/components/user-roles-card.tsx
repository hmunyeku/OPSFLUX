"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Shield, Lock, ExternalLink } from "lucide-react"
import { getUserRoles, UserRolesResponse } from "../../data/user-roles-api"

interface UserRolesCardProps {
  userId: string
}

export function UserRolesCard({ userId }: UserRolesCardProps) {
  const [roles, setRoles] = useState<UserRolesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadRoles = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getUserRoles(userId)
        setRoles(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load roles')
      } finally {
        setIsLoading(false)
      }
    }

    loadRoles()
  }, [userId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rôles de l&apos;utilisateur</CardTitle>
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
              <Shield className="h-5 w-5" />
              Rôles de l&apos;utilisateur
            </CardTitle>
            <CardDescription>
              {roles?.count || 0} rôle(s) assigné(s)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/users/rbac">
              <Shield className="h-4 w-4 mr-2" />
              Gérer les rôles
              <ExternalLink className="h-3 w-3 ml-2" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!roles || roles.count === 0 ? (
          <div className="rounded-lg border p-8 text-center">
            <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucun rôle assigné à cet utilisateur
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Attribuez un rôle pour gérer ses permissions
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {roles.data.map((role) => (
                <div
                  key={role.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {role.is_system ? (
                      <Lock className="h-5 w-5 text-primary" />
                    ) : (
                      <Shield className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">
                        {role.name}
                      </p>
                      {role.is_system && (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                          Système
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {role.code}
                    </p>
                    {role.description && (
                      <p className="text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
