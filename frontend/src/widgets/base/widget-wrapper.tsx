"use client"

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
import { cn } from "@/lib/utils"

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
      <div className="h-full flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20">
        <p className="text-sm text-muted-foreground">Widget non trouvé</p>
      </div>
    )
  }

  const WidgetComponent = getWidgetComponent(widget.widget_type)

  // Merge default config with instance config
  const mergedConfig = {
    ...widget.default_config,
    ...config,
  }

  return (
    <div className="h-full flex flex-col rounded-xl border border-border/40 bg-card shadow-sm hover:shadow-md hover:border-border transition-all duration-200 overflow-hidden">
      {/* Widget Header - Compact & Professional */}
      <div className="flex-none flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b bg-gradient-to-r from-muted/5 via-muted/10 to-muted/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditMode && (
            <div className="widget-drag-handle cursor-move shrink-0 opacity-60 hover:opacity-100 transition-opacity">
              <IconGripVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </div>
          )}
          <h3 className="text-xs sm:text-sm font-semibold tracking-tight truncate text-foreground/90">
            {config?.title || widget.name}
          </h3>
        </div>

        {/* Widget Actions - Responsive */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {!isEditMode && onFullscreen && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 sm:h-7 sm:w-7 hover:bg-muted/50"
              onClick={onFullscreen}
              title="Plein écran"
            >
              <IconMaximize className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </Button>
          )}
          {isEditMode && (
            <>
              {onDuplicate && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 sm:h-7 sm:w-7 hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={onDuplicate}
                  title="Dupliquer"
                >
                  <IconCopy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
              )}
              {onConfigure && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 sm:h-7 sm:w-7 hover:bg-muted/50"
                  onClick={() => onConfigure(dashboardWidget)}
                  title="Configurer"
                >
                  <IconSettings className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
              )}
              {onRemove && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 sm:h-7 sm:w-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(String(id))}
                  title="Supprimer"
                >
                  <IconX className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Widget Content - No padding, let widget control its own spacing */}
      <div className="flex-1 overflow-auto">
        <WidgetComponent config={mergedConfig} />
      </div>
    </div>
  )
}
