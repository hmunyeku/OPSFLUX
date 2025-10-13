"use client"

import { usePreferencesContext } from "@/contexts/preferences-context"
import { Button } from "@/components/ui/button"
import { useThemeColors } from "@/hooks/use-theme-colors"
import { useTheme } from "next-themes"
import { themes, type ThemeName } from "@/config/themes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

export function PreferencesTab() {
  const { preferences, updatePreferences, resetPreferences } = usePreferencesContext()
  const { changeTheme } = useThemeColors()
  const { setTheme } = useTheme()

  const handleThemeChange = (theme: string) => {
    changeTheme(theme as ThemeName)
    updatePreferences({ colorTheme: theme as ThemeName })
  }

  const handleDarkModeChange = (mode: string) => {
    setTheme(mode)
    updatePreferences({ darkMode: mode as 'light' | 'dark' | 'system' })
  }

  const preferencesData = [
    {
      key: "Thème de couleur",
      description: "Personnaliser les couleurs de l'interface",
      value: (
        <Select value={preferences.colorTheme} onValueChange={handleThemeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(themes).map(([key, theme]) => (
              <SelectItem key={key} value={key}>
                {theme.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Mode d'affichage",
      description: "Choisir entre clair, sombre ou système",
      value: (
        <Select value={preferences.darkMode} onValueChange={handleDarkModeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Clair</SelectItem>
            <SelectItem value="dark">Sombre</SelectItem>
            <SelectItem value="system">Système</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Barre latérale réduite",
      description: "Réduire la barre latérale par défaut",
      value: (
        <Badge variant={preferences.sidebarCollapsed ? "default" : "secondary"}>
          {preferences.sidebarCollapsed ? "Activé" : "Désactivé"}
        </Badge>
      ),
    },
    {
      key: "Langue",
      description: "Langue de l'interface utilisateur",
      value: (
        <Select
          value={preferences.language}
          onValueChange={(value) => updatePreferences({ language: value as 'en' | 'fr' })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Fuseau horaire",
      description: "Fuseau horaire pour l'affichage des dates",
      value: (
        <Select
          value={preferences.timezone}
          onValueChange={(value) => updatePreferences({ timezone: value })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Europe/Paris">Europe/Paris (GMT+1)</SelectItem>
            <SelectItem value="America/New_York">America/New_York (GMT-5)</SelectItem>
            <SelectItem value="Asia/Tokyo">Asia/Tokyo (GMT+9)</SelectItem>
            <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Format de date",
      description: "Format d'affichage des dates",
      value: (
        <Select
          value={preferences.dateFormat}
          onValueChange={(value) => updatePreferences({ dateFormat: value as 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DD/MM/YYYY">JJ/MM/AAAA</SelectItem>
            <SelectItem value="MM/DD/YYYY">MM/JJ/AAAA</SelectItem>
            <SelectItem value="YYYY-MM-DD">AAAA-MM-JJ</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Format d'heure",
      description: "Format d'affichage de l'heure",
      value: (
        <Select
          value={preferences.timeFormat}
          onValueChange={(value) => updatePreferences({ timeFormat: value as '12h' | '24h' })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12h">12 heures</SelectItem>
            <SelectItem value="24h">24 heures</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "Notifications par email",
      description: "Recevoir des notifications par email",
      value: (
        <Badge variant={preferences.emailNotifications ? "default" : "secondary"}>
          {preferences.emailNotifications ? "Activé" : "Désactivé"}
        </Badge>
      ),
    },
    {
      key: "Notifications push",
      description: "Recevoir des notifications dans le navigateur",
      value: (
        <Badge variant={preferences.pushNotifications ? "default" : "secondary"}>
          {preferences.pushNotifications ? "Activé" : "Désactivé"}
        </Badge>
      ),
    },
    {
      key: "Son des notifications",
      description: "Jouer un son lors de la réception de notifications",
      value: (
        <Badge variant={preferences.notificationSound ? "default" : "secondary"}>
          {preferences.notificationSound ? "Activé" : "Désactivé"}
        </Badge>
      ),
    },
    {
      key: "Éléments par page",
      description: "Nombre d'éléments affichés par page dans les listes",
      value: (
        <Select
          value={preferences.itemsPerPage.toString()}
          onValueChange={(value) => updatePreferences({ itemsPerPage: parseInt(value, 10) as 10 | 25 | 50 | 100 })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Clé</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[250px]">Valeur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preferencesData.map((pref, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{pref.key}</TableCell>
                <TableCell className="text-muted-foreground">{pref.description}</TableCell>
                <TableCell>{pref.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={resetPreferences}>
          Réinitialiser aux valeurs par défaut
        </Button>
      </div>
    </div>
  )
}
