"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconGripVertical, IconSettings, IconX } from "@tabler/icons-react"
import { getWidgetComponent } from "../registry"
import type { DashboardWidgetWithWidget } from "@/types/dashboard"

interface WidgetWrapperProps {
  dashboardWidget: DashboardWidgetWithWidget
  isEditMode?: boolean
  onRemove?: (id: string) => void
  onConfigure?: (widget: DashboardWidgetWithWidget) => void
}

export default function WidgetWrapper({
  dashboardWidget,
  isEditMode = false,
  onRemove,
  onConfigure,
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
    <div className="h-full flex flex-col">
      {isEditMode && (
        <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <IconGripVertical className="h-4 w-4 text-muted-foreground cursor-move grid-stack-item-drag" />
            <span className="text-xs font-medium truncate">{widget.name}</span>
          </div>
          <div className="flex gap-1">
            {onConfigure && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onConfigure(dashboardWidget)}
              >
                <IconSettings className="h-3 w-3" />
              </Button>
            )}
            {onRemove && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onRemove(id)}
              >
                <IconX className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <WidgetComponent config={mergedConfig} />
      </div>
    </div>
  )
}
