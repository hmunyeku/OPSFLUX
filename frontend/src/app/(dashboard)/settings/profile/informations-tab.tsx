"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  IconShieldCheck,
  IconUsers,
  IconClock,
  IconLogin,
  IconChartBar,
  IconKey,
} from "@tabler/icons-react"
import { useTranslation } from "@/hooks/use-translation"
import { useAuth } from "@/hooks/use-auth"
import { auth } from "@/lib/auth"
import { showLoadError } from "@/lib/toast-helpers"

interface UserRbacInfo {
  roles: Array<{
    id: string
    name: string
    description?: string
  }>
  groups: Array<{
    id: string
    name: string
    description?: string
  }>
  permissions: string[]
}

export function InformationsTab() {
  const { t } = useTranslation("core.profile")
  const { user } = useAuth()
  const [rbacInfo, setRbacInfo] = useState<UserRbacInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // Charger les informations RBAC
  useEffect(() => {
    loadRbacInfo()
  }, [])

  async function loadRbacInfo() {
    try {
      setLoading(true)
      const token = auth.getToken()
      if (!token) {
        setLoading(false)
        return
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me?with_rbac=true`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setRbacInfo({
          roles: data.roles || [],
          groups: data.groups || [],
          permissions: data.permissions || [],
        })
      }
    } catch (error) {
      console.error("Failed to load RBAC info:", error)
      showLoadError(t("rbac.title", "les informations RBAC"), loadRbacInfo)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Informations générales */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("role_group.title", "Title")}</CardTitle>
          </div>
          <CardDescription>
            {t("role_group.description", "Description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-7 w-24" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-32" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("role_group.role_label", "Role label")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("role_group.role_desc", "Role desc")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {rbacInfo?.roles && rbacInfo.roles.length > 0 ? (
                    rbacInfo.roles.map((role) => (
                      <Badge key={role.id} variant="default" className="text-sm px-3 py-1">
                        {role.name}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      {t("role_group.no_role", "Aucun rôle")}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("role_group.group_label", "Group label")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("role_group.group_desc", "Group desc")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end items-center">
                  {rbacInfo?.groups && rbacInfo.groups.length > 0 ? (
                    rbacInfo.groups.map((group) => (
                      <div key={group.id} className="flex items-center gap-2">
                        <IconUsers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{group.name}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("role_group.no_group", "Aucun groupe")}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconKey className="h-5 w-5 text-primary" />
            <CardTitle>{t("permissions.title", "Title")}</CardTitle>
          </div>
          <CardDescription>
            {t("permissions.description", "Description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-6 w-24" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rbacInfo?.permissions && rbacInfo.permissions.length > 0 ? (
                rbacInfo.permissions.map((permission) => (
                  <Badge key={permission} variant="outline" className="text-xs">
                    {permission}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("permissions.none", "Aucune permission spécifique")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations utilisateur */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconLogin className="h-5 w-5 text-primary" />
            <CardTitle>{t("user_info.title", "Informations utilisateur")}</CardTitle>
          </div>
          <CardDescription>
            {t("user_info.description", "Détails de votre compte")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-32" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-32" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("user_info.email", "Email")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("user_info.email_desc", "Votre adresse email principale")}
                  </p>
                </div>
                <span className="text-sm font-medium">{user?.email}</span>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("user_info.full_name", "Nom complet")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("user_info.full_name_desc", "Votre nom et prénom")}
                  </p>
                </div>
                <span className="text-sm font-medium">{user?.full_name || "-"}</span>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("user_info.status", "Statut")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("user_info.status_desc", "État de votre compte")}
                  </p>
                </div>
                <Badge variant={user?.is_active ? "default" : "secondary"}>
                  {user?.is_active ? t("user_info.active", "Actif") : t("user_info.inactive", "Inactif")}
                </Badge>
              </div>

              {user?.is_superuser && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{t("user_info.superuser", "Super utilisateur")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("user_info.superuser_desc", "Accès administrateur complet")}
                      </p>
                    </div>
                    <Badge variant="destructive">
                      {t("user_info.admin", "Admin")}
                    </Badge>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
