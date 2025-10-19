"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  IconShieldCheck,
  IconUsers,
  IconClock,
  IconLogin,
  IconChartBar,
  IconKey,
} from "@tabler/icons-react"
import { useTranslation } from "@/hooks/use-translation"

export function InformationsTab() {
  const { t } = useTranslation("core.profile.informations")
  // Ces données seraient normalement récupérées depuis l'API
  const userInfo = {
    role: "Administrator",
    groupe: "Oil & Gas Operations",
    permissions: [
      "users.read",
      "users.write",
      "users.delete",
      "settings.read",
      "settings.write",
      "api.read",
      "api.write",
      "webhooks.manage",
      "logs.read",
    ],
    dernierLogin: "2025-10-13 14:30:25",
    stats: {
      totalConnexions: 1247,
      tempsConnexionMoyen: "2h 15min",
      derniereActivite: "Il y a 5 minutes",
      sessionsActives: 2,
    },
  }

  return (
    <div className="space-y-6">
      {/* Informations générales */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("role_group.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("role_group.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("role_group.role_label")}</p>
              <p className="text-sm text-muted-foreground">
                {t("role_group.role_desc")}
              </p>
            </div>
            <Badge variant="default" className="text-sm px-3 py-1">
              {userInfo.role}
            </Badge>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("role_group.group_label")}</p>
              <p className="text-sm text-muted-foreground">
                {t("role_group.group_desc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <IconUsers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{userInfo.groupe}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconKey className="h-5 w-5 text-primary" />
            <CardTitle>{t("permissions.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("permissions.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {userInfo.permissions.map((permission) => (
              <Badge key={permission} variant="outline" className="text-xs">
                {permission}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dernière connexion */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconLogin className="h-5 w-5 text-primary" />
            <CardTitle>{t("connection.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("connection.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("connection.last_login")}</p>
              <p className="text-sm text-muted-foreground">
                {t("connection.last_login_desc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <IconClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{userInfo.dernierLogin}</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("connection.last_activity")}</p>
              <p className="text-sm text-muted-foreground">
                {t("connection.last_activity_desc")}
              </p>
            </div>
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              {userInfo.stats.derniereActivite}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("connection.active_sessions")}</p>
              <p className="text-sm text-muted-foreground">
                {t("connection.active_sessions_desc")}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {userInfo.stats.sessionsActives} {userInfo.stats.sessionsActives > 1 ? t("connection.sessions") : t("connection.session")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Statistiques */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-primary" />
            <CardTitle>{t("stats.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("stats.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">{t("stats.total_logins")}</p>
              <p className="text-2xl font-bold">{userInfo.stats.totalConnexions}</p>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">{t("stats.avg_time")}</p>
              <p className="text-2xl font-bold">{userInfo.stats.tempsConnexionMoyen}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
