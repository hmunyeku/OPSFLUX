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

interface UserStats {
  total_logins?: number
  last_login?: string
  created_at?: string
  updated_at?: string
}

export function InformationsTab() {
  const { t } = useTranslation("core.profile")
  const { user } = useAuth()
  const [rbacInfo, setRbacInfo] = useState<UserRbacInfo | null>(null)
  const [stats, setStats] = useState<UserStats>({})
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

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me?with_permissions=true`, {
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
        setStats({
          total_logins: data.total_logins,
          last_login: data.last_login,
          created_at: data.created_at,
          updated_at: data.updated_at,
        })
      }
    } catch (error) {
      console.error("Failed to load RBAC info:", error)
      showLoadError(t("rbac.title", "les informations RBAC"), loadRbacInfo)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      {/* Statistiques d'activité */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-primary" />
            <CardTitle>{t("stats.title", "Activité et statistiques")}</CardTitle>
          </div>
          <CardDescription>
            {t("stats.description", "Vue d'ensemble de votre activité sur la plateforme")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconClock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("stats.created_at", "Membre depuis")}</p>
              </div>
              <p className="text-sm text-muted-foreground pl-6">
                {formatDate(stats.created_at || user?.created_at)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconLogin className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("stats.last_login", "Dernière connexion")}</p>
              </div>
              <p className="text-sm text-muted-foreground pl-6">
                {formatDate(stats.last_login)}
              </p>
            </div>

            {stats.total_logins !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <IconChartBar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("stats.total_logins", "Nombre de connexions")}</p>
                </div>
                <p className="text-sm text-muted-foreground pl-6">
                  {stats.total_logins}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconClock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{t("stats.updated_at", "Dernière modification")}</p>
              </div>
              <p className="text-sm text-muted-foreground pl-6">
                {formatDate(stats.updated_at || user?.updated_at)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations professionnelles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("role_group.title", "Informations professionnelles")}</CardTitle>
          </div>
          <CardDescription>
            {t("role_group.description", "Rôles, groupes et permissions associés à votre compte")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <>
              <div className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-32" />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Skeleton className="h-4 w-28" />
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-6 w-24" />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Rôles */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <IconShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{t("role_group.role_label", "Rôles")}</h4>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  {rbacInfo?.roles && rbacInfo.roles.length > 0 ? (
                    rbacInfo.roles.map((role) => (
                      <Badge
                        key={role.id}
                        variant="default"
                        className="text-xs px-2.5 py-0.5"
                        title={role.description}
                      >
                        {role.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("role_group.no_role", "Aucun rôle attribué")}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Groupes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <IconUsers className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{t("role_group.group_label", "Groupes")}</h4>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  {rbacInfo?.groups && rbacInfo.groups.length > 0 ? (
                    rbacInfo.groups.map((group) => (
                      <Badge
                        key={group.id}
                        variant="secondary"
                        className="text-xs px-2.5 py-0.5"
                        title={group.description}
                      >
                        {group.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("role_group.no_group", "Aucun groupe")}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <IconKey className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">{t("permissions.title", "Permissions")}</h4>
                  {rbacInfo?.permissions && rbacInfo.permissions.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {rbacInfo.permissions.length}
                    </Badge>
                  )}
                </div>
                <div className="pl-6">
                  {rbacInfo?.permissions && rbacInfo.permissions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {rbacInfo.permissions.map((permission) => (
                        <div
                          key={permission}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1"
                        >
                          <div className="h-1 w-1 rounded-full bg-primary" />
                          <span className="font-mono text-[11px]">{permission}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("permissions.none", "Aucune permission spécifique")}
                    </span>
                  )}
                </div>
              </div>
            </>
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("user_info.email", "Email")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("user_info.email_desc", "Votre adresse email principale")}
                  </p>
                </div>
                <span className="text-sm font-medium break-all">{user?.email}</span>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("user_info.full_name", "Nom complet")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("user_info.full_name_desc", "Votre nom et prénom")}
                  </p>
                </div>
                <span className="text-sm font-medium">{user?.full_name || "-"}</span>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
