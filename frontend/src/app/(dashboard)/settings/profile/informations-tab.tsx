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

export function InformationsTab() {
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
            <CardTitle>Rôle et groupe</CardTitle>
          </div>
          <CardDescription>
            Votre rôle et groupe d&apos;appartenance dans l&apos;organisation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Rôle</p>
              <p className="text-sm text-muted-foreground">
                Définit vos privilèges dans le système
              </p>
            </div>
            <Badge variant="default" className="text-sm px-3 py-1">
              {userInfo.role}
            </Badge>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Groupe</p>
              <p className="text-sm text-muted-foreground">
                Votre groupe d&apos;appartenance organisationnel
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
            <CardTitle>Permissions</CardTitle>
          </div>
          <CardDescription>
            Liste des permissions accordées à votre compte
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
            <CardTitle>Connexion</CardTitle>
          </div>
          <CardDescription>
            Informations sur votre dernière connexion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Dernière connexion</p>
              <p className="text-sm text-muted-foreground">
                Date et heure de votre dernière connexion
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
              <p className="text-sm font-medium">Dernière activité</p>
              <p className="text-sm text-muted-foreground">
                Votre dernière action dans le système
              </p>
            </div>
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              {userInfo.stats.derniereActivite}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Sessions actives</p>
              <p className="text-sm text-muted-foreground">
                Nombre de sessions actuellement ouvertes
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {userInfo.stats.sessionsActives} session{userInfo.stats.sessionsActives > 1 ? "s" : ""}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Statistiques */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-primary" />
            <CardTitle>Statistiques d&apos;utilisation</CardTitle>
          </div>
          <CardDescription>
            Vos statistiques d&apos;utilisation du système
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">Total de connexions</p>
              <p className="text-2xl font-bold">{userInfo.stats.totalConnexions}</p>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">Temps de connexion moyen</p>
              <p className="text-2xl font-bold">{userInfo.stats.tempsConnexionMoyen}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
