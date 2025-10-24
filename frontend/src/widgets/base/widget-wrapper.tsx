"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  IconGripVertical,
  IconSettings,
  IconX,
  IconCopy,
  IconMaximize
} from "@tabler/icons-react"
import { getWidgetComponent } from "../registry"
import type { DashboardWidgetWithWidget } from "@/types/dashboard"

interface WidgetWrapperProps {
  dashboardWidget: DashboardWidgetWithWidget
  isEditMode?: boolean
  onRemove?: (id: string) => void
  onConfigure?: (widget: DashboardWidgetWithWidget) => void
  onDuplicate?: () => void
  onFullscreen?: () => void
}

export default function WidgetWrapper({
  dashboardWidget,
  isEditMode = false,
  onRemove,
  onConfigure,
  onDuplicate,
  onFullscreen,
}: WidgetWrapperProps) {
  const { widget, config, id } = dashboardWidget

  if (!widget) {
    return (
      <Card className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Widget not found</p>
      </Card>
    )
  }

  const WidgetComponent = getWidgetComponent(widget.widget_type)

  // Merge default config with instance config
  const mergedConfig = {
    ...widget.default_config,
    ...config,
  }

  return (
    <Card className="h-full flex flex-col border border-border/50 bg-card shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Widget Header */}
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditMode && (
            <div className="widget-drag-handle cursor-move shrink-0">
              <IconGripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
          )}
          <h3 className="text-sm font-semibold truncate">{widget.name}</h3>
        </div>

        {/* Widget Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onFullscreen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-muted"
              onClick={onFullscreen}
              title="Plein écran"
            >
              <IconMaximize className="h-3.5 w-3.5" />
            </Button>
          )}
          {isEditMode && (
            <>
              {onDuplicate && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-muted"
                  onClick={onDuplicate}
                  title="Dupliquer"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                </Button>
              )}
              {onConfigure && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-muted"
                  onClick={() => onConfigure(dashboardWidget)}
                  title="Configurer"
                >
                  <IconSettings className="h-3.5 w-3.5" />
                </Button>
              )}
              {onRemove && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(String(id))}
                  title="Supprimer"
                >
                  <IconX className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Widget Content */}
      <div className="flex-1 overflow-auto p-4">
        <WidgetComponent config={mergedConfig} />
      </div>
    </Card>
  )
}
