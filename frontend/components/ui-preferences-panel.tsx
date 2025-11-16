"use client"

import * as React from "react"
import { Moon, Sun, Monitor, Layout, Maximize2, Minimize2, Type, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUIPreferences, type Theme, type WindowSize } from "@/lib/ui-preferences-context"
import { useTheme } from "next-themes"
import { useToast } from "@/hooks/use-toast"

/**
 * Comprehensive UI preferences management panel
 * Can be used in user profile settings or as a standalone preferences page
 */
export function UIPreferencesPanel() {
  const {
    preferences,
    setTheme,
    setSidebarCollapsed,
    setWindowSize,
    setFontSize,
    setCompactMode,
    resetToDefaults,
    isLoading,
  } = useUIPreferences()

  const { setTheme: setNextTheme } = useTheme()
  const { toast } = useToast()

  const handleThemeChange = async (newTheme: Theme) => {
    setNextTheme(newTheme)
    await setTheme(newTheme)
    toast({
      title: "Thème modifié",
      description: `Le thème a été changé en ${newTheme === "light" ? "clair" : newTheme === "dark" ? "sombre" : "système"}.`,
    })
  }

  const handleSidebarToggle = async (collapsed: boolean) => {
    await setSidebarCollapsed(collapsed)
    toast({
      title: "Sidebar modifiée",
      description: collapsed ? "La sidebar sera repliée par défaut." : "La sidebar sera dépliée par défaut.",
    })
  }

  const handleWindowSizeChange = async (size: WindowSize) => {
    await setWindowSize(size)
    toast({
      title: "Taille de fenêtre modifiée",
      description: `Mode ${size === "fullscreen" ? "plein écran" : size === "compact" ? "compact" : "normal"} activé.`,
    })
  }

  const handleFontSizeChange = async (values: number[]) => {
    const size = values[0]
    await setFontSize(size)
  }

  const handleCompactModeToggle = async (compact: boolean) => {
    await setCompactMode(compact)
    toast({
      title: "Mode compact modifié",
      description: compact ? "Mode compact activé." : "Mode compact désactivé.",
    })
  }

  const handleReset = async () => {
    try {
      await resetToDefaults()
      toast({
        title: "Préférences réinitialisées",
        description: "Toutes les préférences ont été réinitialisées aux valeurs par défaut.",
      })
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de réinitialiser les préférences.",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Chargement des préférences...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {preferences.theme === "dark" ? (
              <Moon className="h-5 w-5" />
            ) : preferences.theme === "light" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Monitor className="h-5 w-5" />
            )}
            Apparence
          </CardTitle>
          <CardDescription>Personnalisez l&apos;apparence de l&apos;interface</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme */}
          <div className="space-y-3">
            <Label>Thème</Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant={preferences.theme === "light" ? "default" : "outline"}
                onClick={() => handleThemeChange("light")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Sun className="h-5 w-5" />
                <span className="text-sm">Clair</span>
              </Button>
              <Button
                variant={preferences.theme === "dark" ? "default" : "outline"}
                onClick={() => handleThemeChange("dark")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Moon className="h-5 w-5" />
                <span className="text-sm">Sombre</span>
              </Button>
              <Button
                variant={preferences.theme === "system" ? "default" : "outline"}
                onClick={() => handleThemeChange("system")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Monitor className="h-5 w-5" />
                <span className="text-sm">Système</span>
              </Button>
            </div>
          </div>

          <Separator />

          {/* Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                Taille de police
              </Label>
              <Badge variant="outline">{preferences.fontSize}%</Badge>
            </div>
            <Slider
              value={[preferences.fontSize]}
              onValueChange={handleFontSizeChange}
              min={75}
              max={150}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Petit (75%)</span>
              <span>Normal (100%)</span>
              <span>Grand (150%)</span>
            </div>
          </div>

          <Separator />

          {/* Compact Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Mode compact</Label>
              <p className="text-sm text-muted-foreground">Réduire les espacements pour gagner de l&apos;espace</p>
            </div>
            <Switch checked={preferences.compactMode} onCheckedChange={handleCompactModeToggle} />
          </div>
        </CardContent>
      </Card>

      {/* Layout Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5" />
            Disposition
          </CardTitle>
          <CardDescription>Configurez la disposition de l&apos;interface</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sidebar */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Menu latéral replié par défaut</Label>
              <p className="text-sm text-muted-foreground">
                Le menu sera replié lorsque vous ouvrirez l&apos;application
              </p>
            </div>
            <Switch checked={preferences.sidebarCollapsed} onCheckedChange={handleSidebarToggle} />
          </div>

          <Separator />

          {/* Window Size */}
          <div className="space-y-3">
            <Label>Taille de fenêtre</Label>
            <Select value={preferences.windowSize} onValueChange={(value: WindowSize) => handleWindowSizeChange(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">
                  <div className="flex items-center gap-2">
                    <Minimize2 className="h-4 w-4" />
                    <span>Normal</span>
                  </div>
                </SelectItem>
                <SelectItem value="fullscreen">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="h-4 w-4" />
                    <span>Plein écran</span>
                  </div>
                </SelectItem>
                <SelectItem value="compact">
                  <div className="flex items-center gap-2">
                    <Layout className="h-4 w-4" />
                    <span>Compact</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Définit la taille de la fenêtre principale de l&apos;application
            </p>
          </div>
        </CardContent>
      </Card>

      {/* View Modes Info */}
      <Card>
        <CardHeader>
          <CardTitle>Modes d&apos;affichage par page</CardTitle>
          <CardDescription>
            Les préférences d&apos;affichage (liste, grille, kanban) sont enregistrées automatiquement pour chaque page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(preferences.pageViewModes).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune préférence d&apos;affichage enregistrée pour le moment.
            </p>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pages personnalisées :</Label>
              <div className="space-y-1">
                {Object.entries(preferences.pageViewModes).map(([page, mode]) => (
                  <div key={page} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                    <span className="text-sm font-mono text-muted-foreground">{page}</span>
                    <Badge variant="outline" className="capitalize">
                      {mode}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Réinitialiser toutes les préférences</Label>
              <p className="text-sm text-muted-foreground">Restaurer les paramètres par défaut</p>
            </div>
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
