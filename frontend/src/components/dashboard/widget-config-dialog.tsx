"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { IconDeviceFloppy, IconX } from "@tabler/icons-react"
import type { DashboardWidgetWithWidget } from "@/types/dashboard"
import { getWidgetMeta } from "@/widgets/registry"

interface WidgetConfigDialogProps {
  dashboardWidget: DashboardWidgetWithWidget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (widgetId: number, config: Record<string, any>) => void
}

export default function WidgetConfigDialog({
  dashboardWidget,
  open,
  onOpenChange,
  onSave,
}: WidgetConfigDialogProps) {
  const [config, setConfig] = useState<Record<string, any>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Initialize config when dashboard widget changes
  useEffect(() => {
    if (dashboardWidget) {
      const meta = getWidgetMeta(dashboardWidget.widget.widget_type)
      const mergedConfig = {
        ...meta?.defaultConfig,
        ...dashboardWidget.config,
      }
      setConfig(mergedConfig)
    }
  }, [dashboardWidget])

  const handleSave = async () => {
    if (!dashboardWidget) return

    setIsSaving(true)
    try {
      await onSave(dashboardWidget.id, config)
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfigChange = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  if (!dashboardWidget) return null

  const meta = getWidgetMeta(dashboardWidget.widget.widget_type)

  // Render different config fields based on widget type
  const renderConfigFields = () => {
    const widgetType = dashboardWidget.widget.widget_type

    // Common configs for all widgets
    const commonFields = (
      <>
        <div className="space-y-2">
          <Label htmlFor="title">Titre</Label>
          <Input
            id="title"
            value={config.title || ""}
            onChange={(e) => handleConfigChange("title", e.target.value)}
            placeholder="Titre du widget"
          />
        </div>

        {config.description !== undefined && (
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={config.description || ""}
              onChange={(e) => handleConfigChange("description", e.target.value)}
              placeholder="Description du widget"
              rows={2}
            />
          </div>
        )}
      </>
    )

    // Widget-specific configs
    switch (widgetType) {
      case "stats_card":
        return (
          <>
            {commonFields}
            <div className="space-y-2">
              <Label htmlFor="value">Valeur</Label>
              <Input
                id="value"
                type="number"
                value={config.value || 0}
                onChange={(e) => handleConfigChange("value", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trend">Tendance (%)</Label>
              <Input
                id="trend"
                type="number"
                value={config.trend || 0}
                onChange={(e) => handleConfigChange("trend", parseFloat(e.target.value) || 0)}
              />
            </div>
          </>
        )

      case "chart_line":
        return (
          <>
            {commonFields}
            <div className="space-y-2">
              <Label htmlFor="color">Couleur</Label>
              <Select
                value={config.color || "blue"}
                onValueChange={(value) => handleConfigChange("color", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une couleur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">Bleu</SelectItem>
                  <SelectItem value="green">Vert</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="red">Rouge</SelectItem>
                  <SelectItem value="purple">Violet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )

      case "progress_card":
        return (
          <>
            {commonFields}
            <div className="space-y-2">
              <Label htmlFor="value">Valeur</Label>
              <Input
                id="value"
                type="number"
                value={config.value || 0}
                onChange={(e) => handleConfigChange("value", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max">Maximum</Label>
              <Input
                id="max"
                type="number"
                value={config.max || 100}
                onChange={(e) => handleConfigChange("max", parseFloat(e.target.value) || 100)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={config.label || ""}
                onChange={(e) => handleConfigChange("label", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="showPercentage">Afficher le pourcentage</Label>
              <Switch
                id="showPercentage"
                checked={config.showPercentage ?? true}
                onCheckedChange={(checked) => handleConfigChange("showPercentage", checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Couleur</Label>
              <Select
                value={config.color || "default"}
                onValueChange={(value) => handleConfigChange("color", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une couleur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Défaut</SelectItem>
                  <SelectItem value="blue">Bleu</SelectItem>
                  <SelectItem value="green">Vert</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="red">Rouge</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )

      case "recent_activity":
        return (
          <>
            {commonFields}
            <div className="space-y-2">
              <Label htmlFor="maxItems">Nombre d'items max</Label>
              <Input
                id="maxItems"
                type="number"
                min={1}
                max={20}
                value={config.maxItems || 5}
                onChange={(e) => handleConfigChange("maxItems", parseInt(e.target.value) || 5)}
              />
            </div>
          </>
        )

      case "task_list":
        return (
          <>
            {commonFields}
            <div className="space-y-2">
              <Label htmlFor="maxItems">Nombre de tâches max</Label>
              <Input
                id="maxItems"
                type="number"
                min={1}
                max={20}
                value={config.maxItems || 8}
                onChange={(e) => handleConfigChange("maxItems", parseInt(e.target.value) || 8)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="showPriority">Afficher la priorité</Label>
              <Switch
                id="showPriority"
                checked={config.showPriority ?? true}
                onCheckedChange={(checked) => handleConfigChange("showPriority", checked)}
              />
            </div>
          </>
        )

      default:
        return commonFields
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configuration du widget</DialogTitle>
          <DialogDescription>
            {meta?.name} - {meta?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {renderConfigFields()}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            <IconX className="h-4 w-4 mr-2" />
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            {isSaving ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
